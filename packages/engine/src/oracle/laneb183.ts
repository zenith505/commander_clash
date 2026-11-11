// Lane B round B183's lines, read by compileCard before its triggers and activated abilities (after round B182's), and
// its sentences, read at the end of round B182's.
import type { ActivatedAbility, CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseCardTarget, parseTargetPhrase } from "./targets";
import { parseManaCost } from "../mana";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB183Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Varolz, the Scar-Striped and Young Deathclaws: "Each creature card in your graveyard has scavenge. The scavenge cost is
  // equal to its mana cost.": an activated ability of each of those cards (CR 113.6, 702.97a), its controller's graveyard
  // only; its cost is the card's mana cost, colored symbols too and an {X} counted as 0 (rulings), none for a card without
  // one (CR 118.6). The counters are the card's power as it last existed in the graveyard (rulings), noted as the cost
  // exiles it (scavengeVariable).
  if (line === "Each creature card in your graveyard has scavenge. The scavenge cost is equal to its mana cost.") {
    const f = parseTargetPhrase("creature card from a graveyard");
    if (f?.kind !== "card") {
      out.unsupported.push(raw);
      return true;
    }
    const { owner: _, ...filter } = f;
    const scavenge: ActivatedAbility = {
      manaCost: "{0}",
      tap: false,
      sacrificeSelf: false,
      sorcerySpeed: true,
      zone: "graveyard",
      exileSelf: true,
      scavengeVariable: true,
      body: {
        targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
        effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: { count: { kind: "scavengedPower" } } }],
        text: "Put a number of +1/+1 counters equal to this card's power on target creature.",
      },
      text: "Scavenge {0}",
    };
    (out.yardGrants ??= []).push({ filter: { ...filter, text: "creature cards in your graveyard" }, activated: scavenge, manaCostCost: true, xZero: true });
    return true;
  }
  // Green Goblin: "Each nonland card in your graveyard has mayhem. The mayhem cost is equal to its mana cost.": its
  // controller may cast each of those cards from their graveyard for its mana cost as long as they discarded it this turn
  // (CR 702.187b), following the timing rules; not a card without a mana cost (CR 118.6).
  const mayhem = /^(?:[A-Z][a-z]+(?: [A-Z][a-z]+)* — )?Each nonland card in your graveyard has mayhem\. The mayhem cost is equal to its mana cost\.$/.exec(line);
  if (mayhem) {
    const f = parseTargetPhrase("nonland card from a graveyard");
    if (f?.kind !== "card") out.unsupported.push(raw);
    else {
      const { owner: _, ...filter } = f;
      (out.graveyardGrants ??= []).push({ filter: { ...filter, text: "nonland cards" }, way: { kind: "mayhem", costs: [], exile: false } });
    }
    return true;
  }
  return false;
}

export function roundB183Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Ghost Ark: "each artifact creature card in your graveyard gains unearth {3} until end of turn": the cards there as it
  // resolves (CR 611.2c, rulings), each with unearth {3} of its own (CR 702.84a) while it's that card.
  const unearth = /^[Ee]ach (artifact creature|artifact|creature) card in your graveyard gains unearth ((?:\{[^}]+\})+) until end of turn$/.exec(s);
  if (unearth) {
    const f = parseTargetPhrase(`${unearth[1]} card from a graveyard`);
    const cost = parseManaCost(unearth[2]!);
    if (f?.kind !== "card" || !cost.supported || cost.hasX) return "fail";
    const { owner: _, ...filter } = f;
    return { effect: { type: "grantYardKeywordEach", filter: { ...filter, text: `${unearth[1]} card in your graveyard` }, keyword: "Unearth", cost: unearth[2]! }, next: si + 1 };
  }
  // Filigree Racer: "target instant or sorcery card in your graveyard gains jump-start until end of turn" (CR 702.133a).
  // Songcrafter Mage: "target instant or sorcery card in your graveyard gains harmonize until end of turn. Its harmonize
  // cost is equal to its mana cost." (CR 702.180a). Both only for an instant or sorcery (jump-start works only for one).
  const cast = /^([Tt]arget instant or sorcery card in your graveyard) gains (jump-start|harmonize) until end of turn$/.exec(s);
  if (cast) {
    const harmonize = cast[2] === "harmonize";
    if (harmonize && sentences[si + 1]?.replace(/\.$/, "") !== "Its harmonize cost is equal to its mana cost") return "fail";
    const i = ctx.targets.length;
    const what = parseCardTarget(cast[1]!.replace(/^T/, "t"), ctx, "you");
    const spec = ctx.targets[i];
    if (what?.ref !== "target" || ctx.targets.length !== i + 1 || !spec?.types?.length || spec.types.some((t) => t !== "Instant" && t !== "Sorcery")) return "fail";
    return { effect: { type: "grantYardCast", what, kind: harmonize ? "harmonize" : "jumpStart" }, next: si + (harmonize ? 2 : 1) };
  }
  return null;
}

// Lane B round B171's lines: "As ~ enters, exile ... from your graveyard" and the abilities linked to it, read by
// compileCard before its other "As ~ enters" lines; and its sentences, read at the end of round B170's.
import { allEffects, type AbilityBody, type CompiledCard, type Effect, type TargetSpec } from "../abilities";
import { parseOne, type Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;
const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

const CREATURE_CARD: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };
const INSTANT_OR_SORCERY_CARD: TargetSpec = { kind: "card", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery card" };

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB171Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Sutured Ghoul: "As ~ enters, exile any number of creature cards from your graveyard.": a choice as it enters (CR
  // 614.1c, 614.12a), none too; never itself, which isn't in the graveyard then (rulings).
  // Living Lore: "As ~ enters, exile an instant or sorcery card from your graveyard.": one if there's one (rulings: with none,
  // it enters with nothing exiled).
  const plain = /^As ~ enters, exile (any number of creature cards|an instant or sorcery card) from your graveyard\.$/.exec(line);
  if (plain) {
    if (out.entersExileFromYard) return false;
    out.entersExileFromYard = plain[1] === "an instant or sorcery card" ? { filter: INSTANT_OR_SORCERY_CARD, n: "one" } : { filter: CREATURE_CARD, n: "any" };
    return true;
  }
  // Frankenstein's Monster: "As ~ enters, exile X creature cards from your graveyard. If you can't, put ~ into its owner's
  // graveyard instead of onto the battlefield. For each creature card exiled this way, ~ enters with a +2/+0, +1/+1, or
  // +0/+2 counter on it.": X as it was cast (0 otherwise, CR 107.3m); with fewer creature cards than X, as many as there are
  // are exiled (CR 609.3) and it never enters; each card exiled gives one counter of the kind chosen for it.
  const monster = /^As ~ enters, exile X creature cards from your graveyard\. If you can't, put ~ into its owner's graveyard instead of onto the battlefield\. For each creature card exiled this way, ~ enters with an? ([+-]\d+\/[+-]\d+), ([+-]\d+\/[+-]\d+), or ([+-]\d+\/[+-]\d+) counter on it\.$/.exec(line);
  if (monster) {
    if (out.entersExileFromYard) return false;
    out.entersExileFromYard = { filter: CREATURE_CARD, n: "x", counterEach: [monster[1]!, monster[2]!, monster[3]!] };
    return true;
  }
  // Sutured Ghoul: "~'s power is equal to the total power of the exiled cards and its toughness is equal to their total
  // toughness.": a characteristic-defining ability (CR 604.3, layer 7a) reading the cards its enters replacement exiled
  // (CR 607.2b) while they're still in exile, as they are there (a characteristic-defining ability of theirs too, rulings);
  // 0 in any other zone, where it's a new object with nothing linked (rulings, CR 400.7).
  if (line === "~'s power is equal to the total power of the exiled cards and its toughness is equal to their total toughness." && out.entersExileFromYard?.n === "any") {
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "definePT", power: { count: { kind: "linkedExiledPT", stat: "power", signed: true } }, toughness: { count: { kind: "linkedExiledPT", stat: "toughness", signed: true } } }], text: line });
    return true;
  }
  // Living Lore: "~'s power and toughness are each equal to the exiled card's mana value.": the same, by its mana value (0
  // once the card has left exile, rulings).
  if (line === "~'s power and toughness are each equal to the exiled card's mana value." && out.entersExileFromYard?.n === "one") {
    const mv = { count: { kind: "linkedExiledMv" as const } };
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "definePT", power: mv, toughness: mv }], text: line });
    return true;
  }
  return false;
}

/**
 * Whether "the exiled card(s)" of `out`'s other abilities can be linked to its "As ~ enters, exile ... from your graveyard"
 * (CR 607.2b): only when no ability of it exiles anything else.
 */
export function yardEntersLinkOnly(out: CompiledCard, bodies: AbilityBody[]): boolean {
  if (!out.entersExileFromYard || out.spell) return false;
  const exiles = ["exile", "exileTop", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong", "chooseFromGraveyard", "counterSpell"];
  return !bodies.some((b) => allEffects(b.effects).some((e) => exiles.includes(e.type) || (e.type === "search" && e.dest.zone === "exile") || (e.type === "discard" && !!e.exile)));
}

export function roundB171Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Tetravus: "you may remove any number of +1/+1 counters from ~. If you do, create that many 1/1 colorless Tetravite
  // artifact creature tokens. They each have flying and "This token can't be enchanted."": as many of its +1/+1 counters
  // as you choose as it resolves, none too (rulings: any of them, wherever they came from); the tokens are created with it
  // (GameObject.createdWith), for its other upkeep ability.
  if (/^[Yy]ou may remove any number of \+1\/\+1 counters from ~$/.test(s) && !ctx.spell && !effects.length) {
    const make = /^If you do, create that many (\d+\/\d+ [a-z ]*?[A-Z][a-z]+ (?:artifact )?creature) tokens$/.exec(plain(sentences[si + 1]));
    const have = /^They each have (.+)$/.exec(sentences[si + 2] ?? "");
    if (!make || !have || si + 3 !== sentences.length) return "fail";
    const fx = parseOne(`Create a ${make[1]} token with ${have[1]!.replace(/\.$/, "")}`, ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    if (e?.type !== "createToken" || e.who.ref !== "you" || e.n !== 1 || e.tapped || e.counters) return "fail";
    const removed = { count: { kind: "countersRemovedThisWay" as const } };
    effects.push({ type: "removeAnyCounters", what: { ref: "self" }, n: { count: { kind: "counters", counter: "+1/+1", of: { ref: "self" } } }, upTo: true, kinds: ["+1/+1"] });
    return { effect: { type: "if", cond: { kind: "amountNow", amount: removed, min: 1 }, effects: [{ ...e, n: removed }] }, next: si + 3 };
  }
  // Tetravus: "you may exile any number of tokens created with ~. If you do, put that many +1/+1 counters on ~.": the tokens
  // this object created (rulings: not another Tetravus's), whoever controls them, chosen as it resolves; one counter for
  // each one exiled.
  if (/^[Yy]ou may exile any number of tokens created with ~$/.test(s) && !ctx.spell && !effects.length && plain(sentences[si + 1]) === "If you do, put that many +1/+1 counters on ~" && si + 2 === sentences.length) {
    const token: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], token: true, text: "token created with ~" };
    const exiled = { count: { kind: "exiledThisWay" as const, filter: { kind: "object" as const, types: [], notTypes: [], notColors: [], text: "token" } } };
    effects.push({ type: "pick", who: { ref: "you" }, filter: token, n: 1, action: "exile", anyNumber: true, createdWithSelf: true, prompt: "click any number of tokens created with ~ to exile (a +1/+1 counter on ~ for each), then exile them." });
    return { effect: { type: "if", cond: { kind: "amountNow", amount: exiled, min: 1 }, effects: [{ type: "counters", what: { ref: "self" }, counter: "+1/+1", n: exiled }] }, next: si + 2 };
  }
  return null;
}

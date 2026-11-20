// Round 431's whole lines (compile.ts, before round 430's) and sentences (body.ts chain, before round 429's).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);
const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 431's (compile.ts); false when it isn't one of these. */
export function round431Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Skyway Robber: "This creature escapes with "Whenever this creature deals combat damage to a player, you may cast an
  // artifact, instant, or sorcery spell from among cards exiled with this creature without paying its mana cost."": "If
  // this permanent escaped, it enters with ..." (CR 702.138c), so the permanent has that ability only if it escaped
  // (TriggeredAbility.activeIf, GameObject.escaped, CR 702.138b). "Cards exiled with this creature" are those its escape
  // cost exiled (CR 607.2a, 607.2q via the spell it was), the last time it escaped only: a new object after any zone
  // change has none (CR 400.7, rulings). The spell as it's cast must be one of those types (asSpell).
  const esc = /^~ escapes with "(.+)"$/.exec(line);
  if (esc) {
    const way = out.fromGraveyard?.find((g) => g.kind === "escape");
    if (isSpell || !way || out.costExileLinked || way.costs.filter((c) => c.kind === "exileFromGraveyard").length !== 1) return fail(out, raw);
    const t = parseTrigger(esc[1]!);
    if (!t || t === "fail" || t.activeIf) return fail(out, raw);
    const casts = t.body.effects.filter((e) => e.type === "castFromAmong" && e.fromLinked);
    if (casts.length !== 1 || t.body.effects.length !== 1) return fail(out, raw);
    t.body = { ...t.body, effects: [{ ...(casts[0] as Extract<Effect, { type: "castFromAmong" }>), escapeLinked: true }] };
    way.costs = way.costs.map((c) => (c.kind === "exileFromGraveyard" ? { ...c, linkSpell: true as const } : c));
    out.costExileLinked = true;
    out.triggers.push({ ...t, activeIf: { kind: "self", is: "escaped" } });
    return true;
  }
  // Hama, the Bloodbender: "When ~ enters, target opponent mills three cards. Exile up to one noncreature, nonland card from
  // that player's graveyard. For as long as you control ~, you may cast the exiled card during your turn by waterbending {X}
  // rather than paying its mana cost, where X is its mana value.": the card is chosen as it resolves (not targeted), from
  // that opponent's graveyard after the mill, by you; then a permission to cast it (Effect mayCastExiledWaterbend).
  const hama = /^(When ~ enters, target opponent mills (?:a card|two cards|three cards|four cards)\.) Exile up to one (noncreature, nonland) card from that player's graveyard\. For as long as you control ~, you may cast the exiled card during your turn by waterbending \{X\} rather than paying its mana cost, where X is its mana value\.$/.exec(line);
  if (hama) {
    if (isSpell) return fail(out, raw);
    const t = parseTrigger(hama[1]!);
    const filter = parseSearchFilter(`${hama[2]!} card`);
    if (!t || t === "fail" || !filter || t.body.targets.length !== 1 || t.body.targets[0]!.kind !== "player" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "mill") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: {
        ...t.body,
        effects: [...t.body.effects, { type: "chooseFromGraveyard", who: { ref: "target", index: 0 }, youChoose: true, filter, n: 1, upTo: true, dest: "exile" }, { type: "mayCastExiledWaterbend" }],
        text: line.slice("When ~ enters, ".length),
      },
    });
    return true;
  }
  return false;
}

/** One sentence of an ability's effect (body.ts); null when it isn't one of these, "fail" when it's one we can't do. */
export function round431Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  const line = plain(s);
  // The Face of Boe: "You may cast a spell with suspend from your hand. If you do, pay its suspend cost rather than its mana
  // cost.": one card in your hand with suspend, cast as this resolves (rulings), its timing ignored (CR 608.2g), for its
  // suspend cost as an alternative cost (CR 118.9; CastPay "suspendCost"). It's cast, not suspended: no time counters, no
  // haste (CR 702.62a). Additional costs are still paid.
  if (line === "You may cast a spell with suspend from your hand" && plain(sentences[si + 1]) === "If you do, pay its suspend cost rather than its mana cost") {
    if (ctx.spell) return "fail";
    return {
      effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, fromHand: true, max: 1, pay: { kind: "suspendCost" }, filter: { kind: "card", types: [], notTypes: [], notColors: [], keywords: ["Suspend"], text: "card with suspend" } },
      next: si + 2,
    };
  }
  return null;
}

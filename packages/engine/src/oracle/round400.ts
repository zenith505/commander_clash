// Round 400's sentences (read first by round373Sentence) and whole lines (compile.ts, after round 399's): permanents
// gaining all activated abilities of another until end of turn (Effect gainActivatedOf, effects/run-round400.ts):
// Quicksilver Elemental, Grell Philosopher and Havengul Lich, and blue mana spent as though it were mana of any color.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseCardTarget, parseObject } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 400's, read before round 393's. */
export function round400Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Quicksilver Elemental: "~ gains all activated abilities of target creature until end of turn." Grell Philosopher:
  // "each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You
  // may spend blue mana as though it were mana of any color to activate those abilities." The target is a permanent (CR
  // 115.1); the abilities are its activated ones as this resolves (CR 611.2c; rulings: only activated abilities, mana
  // abilities among them, "~" in them being the permanent that gains them).
  const gain = /^(~|[Ee]ach [A-Z][a-z]+ you control) gains? all activated abilities of (target [a-z ]+?) until end of turn$/.exec(plain(s));
  if (gain) {
    const before = ctx.targets.length;
    const what = parseObject(gain[1]!, ctx);
    if (!what || ctx.targets.length !== before || (what.ref !== "self" && what.ref !== "each")) return "fail";
    const from = parseObject(gain[2]!, ctx);
    const t = ctx.targets[before];
    if (from?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "object" || !t.types?.length || t.optional) return "fail";
    const blue = plain(sentences[si + 1]) === "You may spend blue mana as though it were mana of any color to activate those abilities";
    return { effect: { type: "gainActivatedOf", what, from, ...(blue ? { blueAsAny: true as const } : {}) }, next: si + (blue ? 2 : 1) };
  }
  // Havengul Lich: "You may cast target creature card in a graveyard this turn. When you cast it this turn, ~ gains all
  // activated abilities of that card until end of turn.": a permission for that card (any player's graveyard), paying its
  // costs and following its timing (rulings: only where it may be cast from changes), and a delayed trigger on it being
  // cast (CR 603.7; Effect whenCastGainsActivated).
  if (/^[Yy]ou may cast target creature card in a graveyard this turn$/.test(plain(s)) && plain(sentences[si + 1]) === "When you cast it this turn, ~ gains all activated abilities of that card until end of turn") {
    const before = ctx.targets.length;
    const what = parseCardTarget("target creature card from a graveyard", ctx);
    const t = ctx.targets[before];
    if (what?.ref !== "target" || ctx.targets.length !== before + 1 || t?.kind !== "card" || t.owner || t.types?.join() !== "Creature") return "fail";
    _effects.push({ type: "graveyardCastThisTurn", filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" }, what });
    return { effect: { type: "whenCastGainsActivated", what }, next: si + 2 };
  }
  return null;
}

/** One whole line of round 400's (compile.ts); false when it isn't one of these. */
export function round400Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Quicksilver Elemental: "You may spend blue mana as though it were mana of any color to pay the activation costs of ~'s
  // abilities." (CR 609.4b): the costs of every activated ability it has, mana and gained ones among them (CR 602.1,
  // 605.1a); not costs that aren't an activation's (cumulative upkeep, turning it face up), as Manascape Refractor's.
  if (line === "You may spend blue mana as though it were mana of any color to pay the activation costs of ~'s abilities.") {
    if (isSpell) out.unsupported.push(raw);
    else out.spendBlueAnyColorOwnAbilities = true;
    return true;
  }
  return false;
}

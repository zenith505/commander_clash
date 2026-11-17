// Round 403's sentences (read first by round373Sentence) and whole lines (compile.ts): Capricopian's reselected player,
// Archelos, Lagoon Mystic's entering tapped or untapped and Wizard's Spellbook's d20 table.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseCastPay } from "./round343";
import { parseObject } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 403's, read before round 402's. */
export function round403Sentence(s: string, _sentences: string[], si: number, _ctx: Ctx, _effects: Effect[]): Found {
  // Capricopian: "then you may reselect which player ~ is attacking": the ability's controller, the player it was attacking
  // as it was activated (CR 113.8), may have it attack another player, never its own controller (CR 506.2) nor a
  // planeswalker (rulings); it still attacked the player it was declared attacking, and nothing that triggers on attacking
  // triggers again (rulings, CR 508.3a).
  if (/^(?:[Tt]hen )?[Yy]ou may reselect which player ~ is attacking$/.test(plain(s))) return { effect: { type: "reselectAttack", what: { ref: "self" }, playersOnly: true, may: true }, next: si + 1 };
  // Wizard's Spellbook: "Exile target instant or sorcery card from a graveyard. Roll a d20.": the card exiled with ~ (CR
  // 607.2a), so its 20 row's "each card exiled with ~" counts it and every earlier one still there (rulings: each
  // Spellbook its own).
  if (plain(s) === "Exile target instant or sorcery card from a graveyard" && plain(_sentences[si + 1]) === "Roll a d20") {
    const what = parseObject("target instant or sorcery card from a graveyard", _ctx, true);
    if (what?.ref !== "target") return "fail";
    return { effect: { type: "exile", what, linked: true }, next: si + 1 };
  }
  // Wizard's Spellbook's 1—9 and 10—19 rows: "Copy that card. You may cast the copy." / "... by paying {1} rather than
  // paying its mana cost.": the card this resolution exiled, if it's still in exile (CR 400.7); the copy made there and
  // cast as this resolves or never, paying its costs (X chosen as usual) or {1} instead (an alternative cost, CR 118.9:
  // additional costs too, rulings); one not cast ceases to exist (CR 707.12).
  if (plain(s) === "Copy that card" && /^You may cast the copy(?: by paying \{\d+\} rather than paying its mana cost)?\.?$/.test(_sentences[si + 1] ?? "") && _effects.some((e) => e.type === "exile" && e.linked)) {
    const next = plain(_sentences[si + 1]);
    if (next === "You may cast the copy") return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromExiledThisWay: true, paid: true }, next: si + 2 };
    const pay = parseCastPay(next);
    if (pay?.kind !== "mana") return "fail";
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromExiledThisWay: true, pay }, next: si + 2 };
  }
  // Wizard's Spellbook's 20 row: "Copy each card exiled with ~. You may cast any number of the copies without paying their
  // mana costs.": every card still exiled with this object (CR 607.2a, 400.7), copies cast in the order you choose (rulings).
  if (plain(s) === "Copy each card exiled with ~" && plain(_sentences[si + 1]) === "You may cast any number of the copies without paying their mana costs" && _effects.some((e) => e.type === "exile" && e.linked))
    return { effect: { type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromLinked: true }, next: si + 2 };
  return null;
}

/** One whole line of round 403's (compile.ts); false when it isn't one of these. */
export function round403Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Archelos, Lagoon Mystic: "As long as ~ is tapped, other permanents enter tapped." / "As long as ~ is untapped, other
  // permanents enter untapped." (CR 614.1c): every other permanent, anyone's, as it enters (game.ts finishEntering).
  const m = /^As long as ~ is (tapped|untapped), other permanents enter (tapped|untapped)\.$/.exec(line);
  if (m) {
    const kind = m[1] as "tapped" | "untapped";
    if (isSpell || m[2] !== kind || out.othersEnterAsTappedState?.[kind]) out.unsupported.push(raw);
    else (out.othersEnterAsTappedState ??= {})[kind] = true;
    return true;
  }
  return false;
}

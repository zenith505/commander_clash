// Round 385's whole lines: draw shields that have each player return a permanent (Words of Wind), take the top card of a
// face-down pile (Mangara's Tome, with the enters ability that makes the pile) or look at the top X cards first
// (Aladdin's Lamp). Each a replacement effect for the activating player's next draw this turn (Player.nextDrawInstead,
// CR 614.1a), used up by the draw it replaces (effects/run-round385.ts).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const TOME_ENTERS = "When ~ enters, search your library for five cards, exile them in a face-down pile, and shuffle that pile. Then shuffle your library.";
const TOME_DRAW = "{2}: The next time you would draw a card this turn, instead put the top card of the exiled pile into its owner's hand.";

const WIND = "{1}: The next time you would draw a card this turn, each player returns a permanent they control to its owner's hand instead.";
const LAMP = "{X}, {T}: The next time you would draw a card this turn, instead look at the top X cards of your library, put all but one of them on the bottom of your library in a random order, then draw a card. X can't be 0.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** A whole line of round 385's (compile.ts, after round 384's). */
export function round385Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Mangara's Tome's enters ability: a search for five cards, as many as the library has (CR 701.23d), not revealed (CR
  // 701.23e), exiled face down and linked to the Tome as it is (CR 607.2a: its second ability's "the exiled pile"); then
  // the pile is shuffled (Effect shuffleExiledPile), and so is the library.
  if (line === TOME_ENTERS) {
    if (isSpell) return fail(out, raw);
    const t = parseTrigger("When ~ enters, draw a card.");
    const search = parseBody("Search your library for five cards, exile them, then shuffle.", {});
    const se = search?.effects[0];
    if (!t || t === "fail" || t.event !== "selfEnters" || search?.effects.length !== 1 || se?.type !== "search" || se.n !== 5 || se.upTo || se.dest.zone !== "exile") return fail(out, raw);
    const { away: _, ...find } = se;
    out.triggers.push({ ...t, body: { targets: [], effects: [{ ...find, dest: { zone: "exile", faceDown: true, linked: true } }, { type: "shuffleExiledPile" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Its "{2}: The next time you would draw a card this turn, instead put the top card of the exiled pile into its owner's
  // hand.": a shield for the activating player's next draw this turn (Player.nextDrawInstead `pile`), the pile the enters
  // ability above made; only with that ability on the card.
  if (line === TOME_DRAW) {
    if (isSpell || !out.triggers.some((t) => t.body.effects.some((e) => e.type === "shuffleExiledPile"))) return fail(out, raw);
    const a = parseActivated("{2}: Draw a card.");
    if (!a || a === "fail" || a.manaCost !== "{2}" || a.tap) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "nextDrawInstead", pile: true }], text: line.replace(/^\{2\}: /, "") }, text: line });
    return true;
  }
  // Words of Wind: each player's own choice of a permanent they control, as the draw is replaced.
  if (line === WIND) {
    if (isSpell) return fail(out, raw);
    const a = parseActivated("{1}: Draw a card.");
    if (!a || a === "fail" || a.manaCost !== "{1}" || a.tap) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "nextDrawInstead", wind: true }], text: line.replace(/^\{1\}: /, "") }, text: line });
    return true;
  }
  // Aladdin's Lamp: X as it was activated, never 0 (ActivatedAbility.xMin).
  if (line === LAMP) {
    if (isSpell) return fail(out, raw);
    const a = parseActivated("{X}, {T}: Draw a card. X can't be 0.");
    if (!a || a === "fail" || a.manaCost !== "{X}" || !a.tap || a.xMin !== 1) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "nextDrawInstead", lamp: true }], text: line.replace(/^\{X\}, \{T\}: /, "").replace(/ X can't be 0\.$/, "") }, text: line });
    return true;
  }
  return false;
}

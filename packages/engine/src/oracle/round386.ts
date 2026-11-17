// Round 386's whole lines: Parallel Thoughts' face-down pile and its draw replacement, Fabrication Foundry's exile of
// artifacts with total mana value X, Memory Vessel's seven exiled cards played instead of cards from the hand.
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";
import { parseBody } from "./body";
import { parseActivated } from "./activated";

const THOUGHTS_ENTERS = "When ~ enters, search your library for seven cards, exile them in a face-down pile, and shuffle that pile. Then shuffle your library.";
const THOUGHTS_DRAW = "If you would draw a card, you may instead put the top card of the pile you exiled into your hand.";

const VESSEL = "{T}, Exile ~: Each player exiles the top seven cards of their library. Until your next turn, players may play cards they exiled this way, and they can't play cards from their hand. Activate only as a sorcery.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** A whole line of round 386's (compile.ts, after round 385's). */
export function round386Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Parallel Thoughts' enters ability: as Mangara's Tome's (round 385), seven cards (as many as the library has, CR
  // 701.23d, rulings), not revealed (CR 701.23e), exiled face down and linked to it as it is (CR 607.2a), then shuffled
  // (Effect shuffleExiledPile) so nobody knows their order (rulings: nobody may look at them), then the library.
  if (line === THOUGHTS_ENTERS) {
    if (isSpell) return fail(out, raw);
    const t = parseTrigger("When ~ enters, draw a card.");
    const search = parseBody("Search your library for seven cards, exile them, then shuffle.", {});
    const se = search?.effects[0];
    if (!t || t === "fail" || t.event !== "selfEnters" || search?.effects.length !== 1 || se?.type !== "search" || se.n !== 7 || se.upTo || se.dest.zone !== "exile") return fail(out, raw);
    const { away: _, ...find } = se;
    out.triggers.push({ ...t, body: { targets: [], effects: [{ ...find, dest: { zone: "exile", faceDown: true, linked: true } }, { type: "shuffleExiledPile" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Its replacement of each draw (CompiledCard.drawFromPile, game.ts drawReplacementChoices): only with the enters ability
  // that makes "the pile you exiled" on the card.
  if (line === THOUGHTS_DRAW) {
    if (isSpell || !out.triggers.some((t) => t.body.effects.some((e) => e.type === "shuffleExiledPile"))) return fail(out, raw);
    out.drawFromPile = true;
    return true;
  }
  // Memory Vessel: each player's own seven cards (CR 401.7), theirs to play with the usual timing and costs (rulings) until
  // its controller's next turn begins (Effect impulse `ownersPlay`, mayPlay "yourNextTurn" with `untilOf`); and until then
  // nobody plays cards from their hand (Effect noHandPlaysUntilYourNextTurn). Sorcery timing (CR 602.5d).
  if (line === VESSEL) {
    if (isSpell) return fail(out, raw);
    const a = parseActivated("{T}, Exile ~: Draw a card. Activate only as a sorcery.");
    if (!a || a === "fail" || a.manaCost !== "" || !a.tap || !a.exileSelf || a.costs?.length || !a.sorcerySpeed) return fail(out, raw);
    out.activated.push({ ...a, body: { targets: [], effects: [{ type: "impulse", n: 7, who: { ref: "eachPlayer" }, until: "yourNextTurn", ownersPlay: true }, { type: "noHandPlaysUntilYourNextTurn" }], text: line.replace(/^\{T\}, Exile ~: /, "").replace(/ Activate only as a sorcery\.$/, "") }, text: line });
    return true;
  }
  return false;
}

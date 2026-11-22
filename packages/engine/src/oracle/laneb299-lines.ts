// Lane B round B299's lines, read by compileCard before the generic triggers and activated abilities (after round B296's):
// Baron Helmut Zemo's boast, whose cost exiles black cards by the black mana symbols in their mana costs and whose effect
// copies those cards and casts up to three of the copies.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const ZEMO = /^(Boast — Exile any number of black cards from your graveyard with fifteen or more black mana symbols among their mana costs): (Copy those exiled cards\. You may cast up to three of the copies without paying their mana costs\.)$/;

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB299Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const m = ZEMO.exec(line);
  if (!m) return false;
  const fail = () => (out.unsupported.push(line), true);
  if (isSpell) return fail();
  // Boast (CR 702.142a): activated only if this creature attacked this turn and only once each turn, as parseActivated
  // reads the keyword. The cost (activated.ts) is any number of black cards from your graveyard whose mana costs have
  // fifteen or more black mana symbols among them, chosen and exiled as it's activated (CR 602.2b, 601.2h); a hybrid symbol
  // with black in it, a {2/B} and a Phyrexian {B/P} are each one black mana symbol (CR 107.4e-f), and a split card's mana
  // cost is both halves' (CR 709.4b). A card's color is what decides "black cards": a devoid card with {B} in its cost
  // isn't one (CR 702.114a).
  const a = parseActivated(`${m[1]}: Draw a card.`);
  const cost = a && a !== "fail" && a.costs?.length === 1 ? a.costs[0] : undefined;
  if (!a || a === "fail" || cost?.kind !== "collectEvidence" || cost.symbols !== "B" || !cost.costCards || cost.n !== 15 || a.manaCost || a.tap || !a.oncePerTurn || a.activateIf?.kind !== "self") return fail();
  // "Copy those exiled cards. You may cast up to three of the copies without paying their mana costs.": the cards the cost
  // exiled, still in exile as those objects (CR 400.7), copied in exile and the copies cast one at a time as this resolves,
  // in the order its controller chooses, timing ignored (CR 707.12, 608.2g), without paying their mana costs, so X is 0 and
  // no alternative cost can be paid (CR 107.3b, 118.9), and up to three of them; a copy not cast ceases to exist (CR
  // 704.5e). A land card's copy is never a spell, so it can't be cast (CR 305.1, 300.2a). The cards stay in exile.
  out.activated.push({
    ...a,
    text: line,
    body: { targets: [], effects: [{ type: "castFromAmong", who: { ref: "you" }, n: 0, copies: true, fromCost: true, max: 3 }], text: m[2]! },
  });
  return true;
}

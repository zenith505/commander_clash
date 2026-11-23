// Round 459's whole lines (compile.ts): Volrath's Shapeshifter (the full text of the top card of your graveyard, a
// text-changing effect, shapeshift.ts).
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";

const SHAPESHIFTER = /^As long as the top card of your graveyard is a creature card, ~ has the full text of that card and has the text "([^"]+)"\.?$/;

/** One whole line of round 459's (compile.ts); false when it isn't one of these. */
export function round459Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Volrath's Shapeshifter: a static ability of the permanent (CR 113.6, 604.1) whose effect is a text-changing effect
  // (rulings), applied in layer 3 (CR 613.1c): while the top card of its controller's graveyard is a creature card, it has
  // that card's full text (its name, mana cost, color, types, abilities, power and toughness, rulings) and the quoted
  // ability (GameObject.shapeOf). The quoted text must be an ability the engine reads.
  const m = SHAPESHIFTER.exec(line);
  if (!m) return false;
  const grant = m[1]!;
  const a = isSpell ? null : parseActivated(grant);
  if (!a || a === "fail" || out.shapeshifter) {
    out.unsupported.push(raw);
    return true;
  }
  out.shapeshifter = { grant, text: line };
  return true;
}

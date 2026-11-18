// Lane B round B252's lines, read by compileCard: Swans of Bryn Argoll and Elemental Resonance. roundB252Line before the
// generic static abilities (after round B251's).
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB252Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Swans of Bryn Argoll: "If a source would deal damage to ~, prevent that damage. The source's controller draws cards equal
  // to the damage prevented this way." A prevention effect with an additional effect right after the damage event (CR
  // 615.5): whoever controls the source as the damage is prevented draws (its owner for a card in another zone, a gone
  // permanent's last known controller, rulings). Damage that can't be prevented isn't, so nothing is drawn for it (CR
  // 615.12). damage.ts staticRules, GameState.damageDraws.
  if (line === "If a source would deal damage to ~, prevent that damage. The source's controller draws cards equal to the damage prevented this way.") {
    out.preventToSelfDrawsSource = true;
    return true;
  }
  // Elemental Resonance: "At the beginning of your first main phase, add mana equal to enchanted permanent's mana cost." A
  // triggered ability, not a mana ability: it uses the stack (rulings). Effect addMana `costOf` (run-basics.ts).
  if (line === "At the beginning of your first main phase, add mana equal to enchanted permanent's mana cost.") {
    const t = parseTrigger("At the beginning of your first main phase, add {C}.");
    const add = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "yourFirstMain" || t.ifCond || add?.type !== "addMana" || add.mana !== "{C}") {
      out.unsupported.push(line);
      return true;
    }
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ type: "addMana", costOf: "attached" }], text: "add mana equal to enchanted permanent's mana cost." } });
    return true;
  }
  return false;
}

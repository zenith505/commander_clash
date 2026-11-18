// Lane B round B255's lines, read by compileCard: Gift of Doom's "As this Aura is turned face up, you may attach it to a
// creature." roundB255Line before the generic static abilities (after round B253's).
import type { CompiledCard } from "../abilities";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB255Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Gift of Doom: "As ~ is turned face up, you may attach it to a creature." Part of turning it face up (CR 702.37e, rulings:
  // no player may act in between), a creature it can enchant then, not a target (rulings). Only for an Aura with "Enchant
  // creature", already read (its first line).
  if (line === "As ~ is turned face up, you may attach it to a creature." && out.enchant?.kind === "object" && out.enchant.types?.length === 1 && out.enchant.types[0] === "Creature") {
    out.faceUpAttach = true;
    return true;
  }
  return false;
}

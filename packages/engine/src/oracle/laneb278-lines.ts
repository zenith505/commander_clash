// Lane B round B278's lines, read by compileCard before the generic triggers and statics (after round B277's): Land
// Equilibrium's replacement of how an opponent puts a land onto the battlefield.
import type { CompiledCard } from "../abilities";

const EQUILIBRIUM =
  "If an opponent who controls at least as many lands as you do would put a land onto the battlefield, that player instead puts that land onto the battlefield then sacrifices a land of their choice.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB278Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Land Equilibrium: a replacement effect (CR 614.1a) of a permanent's static ability: whenever an opponent of its
  // controller who controls at least as many lands, as the event would happen, puts a land onto the battlefield (playing it
  // or by a spell or ability, under anyone's control, rulings), they put it there and then sacrifice a land of their choice,
  // which may be that land (rulings) (game.ts equilibriumDue, equilibriumSacrifices).
  if (line === EQUILIBRIUM) {
    if (isSpell) return out.unsupported.push(line), true;
    out.landEquilibrium = true;
    return true;
  }
  return false;
}

// Lane B round B250's whole spells, read after round B245's (roundB245Spell in oracle/laneb245.ts).
import type { AbilityBody } from "../abilities";

export function roundB250Spell(text: string): AbilityBody | null | undefined {
  // Gather Specimens: "If a creature would enter the battlefield under an opponent's control this turn, it enters under
  // your control instead.": a control-changing replacement for the rest of the turn (CR 614.1c), any opponent's, a token or
  // a card, a creature as it would exist on the battlefield (CR 614.12), applied before the creature's other replacements
  // of how it enters (CR 616.1b, rulings). Effect gatherSpecimens; gather.ts.
  if (text === "If a creature would enter the battlefield under an opponent's control this turn, it enters under your control instead.") return { targets: [], effects: [{ type: "gatherSpecimens" }], text };
  return undefined;
}

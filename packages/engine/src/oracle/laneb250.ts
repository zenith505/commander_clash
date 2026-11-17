// Lane B round B250's lines, read by compileCard before its triggers and activated abilities (after round B249's), and its
// whole spells, read after round B245's (roundB245Spell in oracle/laneb245.ts).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB250Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Kraven the Hunter: "Whenever a creature an opponent controls with the greatest power among creatures that player
  // controls dies, ...": a leaves-the-battlefield ability, which looks back to just before the event (CR 603.10a): that
  // creature's power then was the greatest, or tied for it, among the creatures its controller controlled then, those
  // dying at the same time included (TriggeredAbility.dies greatestPowerOfController).
  const kraven = /^Whenever a creature an opponent controls with the greatest power among creatures that player controls dies, (.+)$/.exec(line);
  if (kraven) {
    const t = parseTrigger(`Whenever a creature an opponent controls dies, ${kraven[1]}`);
    if (!t || t === "fail" || t.event !== "permanentDies" || !t.dies || t.dies.other || t.dies.orSelf || t.dies.self || t.dies.leaves || t.dies.filter.controller !== "opponent") out.unsupported.push(raw);
    else out.triggers.push({ ...t, dies: { ...t.dies, greatestPowerOfController: true, filter: { ...t.dies.filter, text: `${t.dies.filter.text} with the greatest power among creatures that player controls` } } });
    return true;
  }
  return false;
}

export function roundB250Spell(text: string): AbilityBody | null | undefined {
  // Gather Specimens: "If a creature would enter the battlefield under an opponent's control this turn, it enters under
  // your control instead.": a control-changing replacement for the rest of the turn (CR 614.1c), any opponent's, a token or
  // a card, a creature as it would exist on the battlefield (CR 614.12), applied before the creature's other replacements
  // of how it enters (CR 616.1b, rulings). Effect gatherSpecimens; gather.ts.
  if (text === "If a creature would enter the battlefield under an opponent's control this turn, it enters under your control instead.") return { targets: [], effects: [{ type: "gatherSpecimens" }], text };
  return undefined;
}

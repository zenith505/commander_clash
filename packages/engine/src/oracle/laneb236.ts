// Lane B round B236's lines, read by compileCard before its triggers and activated abilities (after round B235's), and its
// whole spells (after round B234's).
import type { AbilityBody, CompiledCard } from "../abilities";

const JUSTICE_COST = "As an additional cost to cast ~, you may pay {1}{R} and/or {1}{G} any number of times.";
const RENEWAL = "If you would draw a card, reveal the top card of your library instead. If it's a creature card, put it into your graveyard. Otherwise, draw a card.";
const JUSTICE = "Destroy target artifact. For each additional {1}{R} you paid, destroy another target artifact. For each additional {1}{G} you paid, destroy another target artifact, and you gain 1 life.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB236Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Primitive Justice: two optional additional costs, each payable any number of times (CR 601.2b), chosen and paid like a
  // multikicker with two costs (CompiledCard.kicker.multi, its index 0 {1}{R} and 1 {1}{G}); not kicker for other cards.
  if (line === JUSTICE_COST && isSpell) {
    if (out.kicker) out.unsupported.push(raw);
    else out.kicker = { costs: ["{1}{R}", "{1}{G}"], text: "pay {1}{R} and/or {1}{G} any number of times", optional: true, multi: true };
    return true;
  }
  if (isSpell) return false;
  // Enduring Renewal: its controller's hand is revealed to everyone (CR 402.3, handRevealed).
  if (line === "Play with your hand revealed.") {
    if (out.revealHands) out.unsupported.push(raw);
    else out.revealHands = "you";
    return true;
  }
  // Enduring Renewal: a replacement of each of its controller's draws (CR 614.1a), applied in game.ts draw
  // (drawReplacementChoices "renewal"), once in each chain of draws it made (CR 614.5).
  if (line === RENEWAL) {
    if (out.drawRevealCreatureToYard) out.unsupported.push(raw);
    else out.drawRevealCreatureToYard = true;
    return true;
  }
  return false;
}

/** Round B236's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB236Spell(text: string): AbilityBody | null | undefined {
  // Primitive Justice: one target artifact, then another for each time either cost was paid, all different (rulings; CR
  // 601.2c, as many targets as the times paid, announced before them, like Comet Storm's); each still legal one is
  // destroyed (CR 608.2b), and 1 life for each {1}{G} paid, which doesn't depend on which target is still legal.
  if (text === JUSTICE) {
    const artifact = { kind: "object" as const, types: ["Artifact"], notTypes: [], notColors: [], text: "target artifact" };
    return {
      targets: [artifact, { ...artifact, text: "another target artifact", many: "kicked", distinctFrom: [0] }],
      effects: [
        { type: "destroy", what: { ref: "target", index: 0, n: 2 } },
        { type: "gainLife", who: { ref: "you" }, n: { count: { kind: "kicked", which: 1 } } },
      ],
      text,
    };
  }
  return undefined;
}

// Lane B round B274's lines, read by compileCard before the generic triggers and statics (after round B273's):
// Dimensional Breach's spell and Next of Kin's trigger.
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

const BREACH = "Exile all permanents. For as long as any of those cards remain exiled, at the beginning of each player's upkeep, that player returns one of the exiled cards they own to the battlefield.";

const NEXT_OF_KIN = "When enchanted creature dies, you may put a creature card you own with lesser mana value from your hand or from the command zone onto the battlefield. If you do, return ~ to the battlefield attached to that creature at the beginning of the next end step.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB274Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Dimensional Breach: every permanent is exiled, then a delayed triggered ability lasts for as long as any of the cards
  // exiled this way remains exiled (CR 603.7, 610.3), triggering at the beginning of each player's upkeep; that player
  // chooses one of those cards they own that can legally enter and returns it (rulings). Effects dimensionalBreach and
  // breachReturn (run-laneb274.ts), the delayed trigger "eachUpkeepWhileExiled" (effects/triggers.ts).
  if (line === BREACH) {
    if (!isSpell || out.spell) return fail();
    out.spell = { targets: [], effects: [{ type: "dimensionalBreach" }], text: line };
    return true;
  }
  // Next of Kin: a leaves-the-battlefield trigger of the Aura about the creature it enchanted (CR 603.10a), as Gift of
  // Immortality's. "A creature card you own with lesser mana value": less than that creature's as it last existed (CR
  // 608.2h), from your hand or the command zone (your commander, CR 408.3); not cast, so no commander tax (CR 903.8). If
  // one is put, a delayed trigger (CR 603.7) returns ~'s card from the graveyard at the beginning of the next end step,
  // attached to that creature if it's still on the battlefield as that object (CR 400.7); otherwise ~ stays in the
  // graveyard (rulings on Gift of Immortality), as it does if it has left the graveyard by then.
  if (line === NEXT_OF_KIN) {
    const t = isSpell ? undefined : parseTrigger("When enchanted creature dies, draw a card.");
    if (!t || t === "fail" || out.enchant?.kind !== "object") return fail();
    const effects: Effect[] = [
      { type: "putFromHand", may: true, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature card with lesser mana value" }, orCommand: true, lesserMvThanSubject: true },
      { type: "delayed", when: "nextEndStep", each: "createdWithAura", effects: [{ type: "putOntoBattlefield", what: { ref: "selfCard" }, attachToSubject: true }], text: "return ~ to the battlefield attached to that creature" },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: line.replace(/^When enchanted creature dies, /, "") } });
    return true;
  }
  return false;
}

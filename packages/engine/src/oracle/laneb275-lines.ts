// Lane B round B275's lines, read by compileCard before the generic triggers and statics (after round B274's): Tawnos's
// Coffin's activated ability and Takklemaggot's dies trigger.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

const COFFIN =
  "{3}, {T}: Exile target creature and all Auras attached to it. Note the number and kind of counters that were on that creature. When ~ leaves the battlefield or becomes untapped, return that exiled card to the battlefield under its owner's control tapped with the noted number and kind of counters on it. If you do, return the other exiled cards to the battlefield under their owner's control attached to that permanent.";

const TAKKLEMAGGOT =
  'When enchanted creature dies, that creature\'s controller chooses a creature that ~ could enchant. If the player does, return ~ to the battlefield under your control attached to that creature. If they don\'t, return ~ to the battlefield under your control as a non-Aura enchantment. It loses "enchant creature" and gains "At the beginning of that player\'s upkeep, ~ deals 1 damage to that player."';

/** The ability Takklemaggot gains as a non-Aura enchantment, "that player" being the one who couldn't choose (GameObject.chosen.player). */
export const TAKK_UPKEEP = "At the beginning of the chosen player's upkeep, ~ deals 1 damage to that player.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB275Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Tawnos's Coffin: the target and every Aura attached to it are exiled at once, the target's counters noted just before
  // (Effect coffinNote; CR 608.2c). Then a delayed triggered ability (CR 603.7) watching ~ as it is now: the first time it
  // leaves the battlefield or becomes untapped (CR 603.7c), the card the creature became in exile comes back tapped with
  // those counters (CR 614.1c, 122.6) under its owner's control, and if it does, the Aura cards exiled with it come back
  // attached to it (Effects coffinWatch and coffinReturn, run-laneb275.ts). If ~ left before this resolved, the trigger
  // never triggers and the cards stay exiled (rulings). "You may choose not to untap" is its own line (mayNotUntap).
  if (line === COFFIN) {
    const a = isSpell ? null : parseActivated("{3}, {T}: Exile target creature and all Auras attached to it.");
    const exile = a && a !== "fail" ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || a.body.effects.length !== 1 || exile?.type !== "exile" || exile.what.ref !== "target" || !exile.what.attachedToo || a.body.targets.length !== 1) return fail();
    out.activated.push({ ...a, text: line, body: { ...a.body, effects: [{ type: "coffinNote" }, exile, { type: "coffinWatch" }], text: line.replace(/^\{3\}, \{T\}: /, "") } });
    return true;
  }
  // Takklemaggot: a leaves-the-battlefield trigger of the Aura about the creature it enchanted (CR 603.10a); as it resolves,
  // that creature's controller as it last existed (CR 608.2h) chooses a creature ~'s card could enchant (not targeted;
  // must choose one if able, rulings), and ~ returns from the graveyard under its controller's control attached to it, or,
  // with none, as a non-Aura enchantment that has lost "enchant creature" and has gained an upkeep trigger aimed at that
  // player (CR 613.1d, 613.1f, from the moment it enters, CR 614.12). Only if ~'s card is still in the graveyard it went
  // to (rulings, CR 400.7). Effect takklemaggot (run-laneb275.ts).
  if (line === TAKKLEMAGGOT) {
    const t = isSpell ? undefined : parseTrigger("When enchanted creature dies, draw a card.");
    const granted = parseTrigger(TAKK_UPKEEP);
    if (!t || t === "fail" || !granted || granted === "fail" || !granted.chosenPlayersTurn || out.enchant?.kind !== "object") return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "takklemaggot" }], text: line.replace(/^When enchanted creature dies, /, "") } });
    return true;
  }
  return false;
}

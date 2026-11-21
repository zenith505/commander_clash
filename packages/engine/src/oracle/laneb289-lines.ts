// Lane B round B289's lines, read by compileCard before the generic triggers and statics (after round B288's): Breathstealer's
// Crypt's draw replacement and Parnesse, the Subtle Brush's two triggers.
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const CRYPT = "If a player would draw a card, instead they draw a card and reveal it. If it's a creature card, that player discards it unless they pay 3 life.";
const PARNESSE_TARGETED = "Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless that player pays 4 life.";
const PARNESSE_COPY = "Whenever you copy a spell, up to one target opponent may also copy that spell. They may choose new targets for that copy.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB289Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Breathstealer's Crypt: a replacement of every player's draws (CR 614.1a), applied in game.ts draw ("breath" among the
  // drawing player's choices, CR 616.1), once in each chain of draws it made (CR 614.5).
  if (line === CRYPT) {
    if (isSpell || out.drawBreathstealer) return fail();
    out.drawBreathstealer = true;
    return true;
  }
  // Parnesse's first trigger is Unsettled Mariner's with 4 life as the payment (CR 119.4): "that player" is the controller of
  // the spell or ability, who pays or sees it countered (CR 701.6a). Once for you and once for each permanent you control it
  // targets, however many times (rulings on Unsettled Mariner and Leovold).
  if (line === PARNESSE_TARGETED) {
    if (isSpell) return fail();
    const t = parseTrigger("Whenever you or a permanent you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {1}.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "permanentBecomesTarget" || !t.targeted?.orYou || t.body.effects.length !== 1 || e?.type !== "counterUnlessPays") return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", life: 4 } }], text: "counter that spell or ability unless that player pays 4 life." } });
    return true;
  }
  // Parnesse's second trigger: "Whenever you copy a spell" (Kalamax's and The Twelfth Doctor's event: a copy put on the stack
  // under your control, CR 707.10), once for each copy. "That spell" is the spell copied (TriggerEventInfo.copied), found as
  // "copy that spell" finds one; the opponent targeted (CR 115.1, none too) decides, and copies it under their control,
  // choosing new targets for it (CR 707.10c).
  if (line === PARNESSE_COPY) {
    if (isSpell) return fail();
    const t = parseTrigger("Whenever you copy a spell, put a +1/+1 counter on ~.");
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "you" || !t.cast.onlyCopy) return fail();
    const who = { ref: "target" as const, index: 0 };
    out.triggers.push({
      ...t,
      body: {
        targets: [{ kind: "player", opponent: true, optional: true, text: "target opponent" }],
        effects: [{ type: "may", decider: who, effects: [{ type: "copySpell", spell: "copied", n: 1, newTargets: true, byPlayer: who }], text: "copy that spell (you may choose new targets for the copy)" }],
        text: "up to one target opponent may also copy that spell. They may choose new targets for that copy.",
      },
    });
    return true;
  }
  return false;
}

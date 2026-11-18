// Round 404's triggers (parseTrigger) and whole lines (compile.ts): Hero of Bretagard's and Ranar the Ever-Watchful's
// exiles, Ranar's free foretelling, Kraven the Hunter's greatest power and Eriette, the Beguiler's borrowed permanents.
import type { CompiledCard, TriggeredAbility } from "../abilities";
import { parseTrigger } from "./triggers";

const HAND_OR_YOURS = /^Whenever one or more cards are put into exile from your hand or a spell or ability you control exiles one or more permanents from the battlefield, (.+)$/;
const KRAVEN = /^Whenever a creature an opponent controls with the greatest power among creatures that player controls dies, (.+)$/;
const ERIETTE = "Whenever an Aura you control becomes attached to a nonland permanent an opponent controls with mana value less than or equal to that Aura's mana value, gain control of that permanent for as long as that Aura is attached to it.";

/** A triggered ability of round 404's; null when the line isn't one of these. */
export function round404Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Hero of Bretagard, Ranar the Ever-Watchful: once for each event (CR 603.2c) that puts one or more cards from your hand
  // into exile, for any reason (foretell too), or in which a spell or ability you control exiles one or more permanents,
  // anyone's, tokens too (rulings); "that many" is how many of both.
  const hand = HAND_OR_YOURS.exec(raw);
  if (hand) {
    const base = parseTrigger(`Whenever one or more cards are put into exile, ${hand[1]}`);
    if (!base || base === "fail" || base.event !== "batch" || base.batch?.what !== "exiled") return "fail";
    return { ...base, batch: { what: "exiledFromHandOrByYou" } };
  }
  // Kraven the Hunter: a creature an opponent controlled that had, as it last existed, the greatest power among creatures
  // that player controlled then, tied or not (CR 603.10a; dies, CR 700.4).
  const kraven = KRAVEN.exec(raw);
  if (kraven) {
    const base = parseTrigger(`Whenever a creature an opponent controls dies, ${kraven[1]}`);
    if (!base || base === "fail" || base.event !== "permanentDies" || !base.dies) return "fail";
    return { ...base, dies: { ...base.dies, greatestPowerOfController: true } };
  }
  // Eriette, the Beguiler: an Aura you control becoming attached (entering attached, or moved, CR 303.4, 701.3) to a nonland
  // permanent an opponent controls whose mana value isn't greater than the Aura's ({X} as 0, rulings). You gain control of
  // it for as long as that Aura stays attached to it (CR 611.2b), from the ability's resolution: not at all if the Aura is
  // no longer attached to it then (rulings). Leaving Eriette doesn't end it.
  if (raw === ERIETTE)
    return {
      event: "auraAttachedToOpponents",
      body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "control" }], duration: "game", whileEventAuraAttached: true }], text: "gain control of that permanent for as long as that Aura is attached to it." },
    };
  return null;
}

/** One whole line of round 404's (compile.ts); false when it isn't one of these. */
export function round404Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ranar the Ever-Watchful: "The first card you foretell each turn costs {0} to foretell.": the foretell special action's
  // {2} (CR 702.143a, 116.2h), for the first card its controller foretells this turn (rulings: the card exiled from the
  // hand, not the foretold spell cast later). A static ability of the permanent (CR 113.6).
  if (line === "The first card you foretell each turn costs {0} to foretell.") {
    if (isSpell) out.unsupported.push(raw);
    else out.firstForetellFree = true;
    return true;
  }
  return false;
}

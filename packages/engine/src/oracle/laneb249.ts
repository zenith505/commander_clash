// Lane B round B249's lines, read by compileCard before its triggers and activated abilities (after round B247's).
import type { CompiledCard, Effect } from "../abilities";
import { parseTrigger } from "./triggers";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB249Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // The Prismatic Piper, Faceless One: "If ~ is your commander, choose a color before the game begins. ~ is the chosen
  // color.": a choice made as the deck is built, which is part of its color identity (CR 903.4b; game.ts PlayerSetup
  // commanderColor), and a characteristic-defining ability linked to it (CR 604.3, 607.2p): that color in every zone.
  // Not a commander, or a copy of one, it made no choice and has no color.
  if (line === "If ~ is your commander, choose a color before the game begins. ~ is the chosen color.") {
    out.pregameColorIsColor = true;
    return true;
  }
  // Essence of the Wild: "Creatures you control enter as a copy of ~." Infinite Reflection: "Nontoken creatures you control
  // enter as a copy of enchanted creature." Copy replacements for creatures entering under this permanent's controller's
  // control (CR 614.1c, 707.5), applied before the creature's own replacements (CR 616.1, rulings); see
  // CompiledCard.creaturesEnterAsCopy and game.ts entersAsCopyKeys.
  if (line === "Creatures you control enter as a copy of ~.") {
    (out.creaturesEnterAsCopy ??= []).push({ of: "self", text: line });
    return true;
  }
  if (line === "Nontoken creatures you control enter as a copy of enchanted creature.") {
    // Only an Aura that enchants a creature has an enchanted creature.
    if (out.enchant?.kind !== "object" || out.enchant.types?.length !== 1 || out.enchant.types[0] !== "Creature") out.unsupported.push(raw);
    else (out.creaturesEnterAsCopy ??= []).push({ of: "enchanted", nontoken: true, text: line });
    return true;
  }
  // Infinite Reflection: "When ~ enters attached to a creature, each other nontoken creature you control becomes a copy of
  // that creature.": only if it's attached to a creature as it enters; "that creature" is that one, even if the Aura is
  // moved before the ability resolves (rulings), as it last existed if it has left (CR 608.2h). Every other nontoken
  // creature its controller controls as it resolves becomes a copy of it at once, for good (CR 707.4, 613.2a), not that
  // creature itself.
  if (line === "When ~ enters attached to a creature, each other nontoken creature you control becomes a copy of that creature.") {
    const t = parseTrigger("When ~ enters, each other nontoken creature you control becomes a copy of target creature.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.effects.length !== 1 || e?.type !== "becomeCopy" || e.what.ref !== "each" || e.duration !== "game" || out.enchant?.kind !== "object") {
      out.unsupported.push(raw);
      return true;
    }
    const { other: _, ...each } = e.what;
    const copy: Effect = { type: "becomeCopy", what: { ...each, otherThanSubject: true }, of: { ref: "subject" }, duration: "game" };
    out.triggers.push({ ...t, ifEnteredAttachedCreature: true, body: { targets: [], effects: [copy], text: line.slice(line.indexOf(", ") + 2) } });
    return true;
  }
  return false;
}

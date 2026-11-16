// Lane B round B230's lines, read by compileCard before its triggers and activated abilities (after round B229's), and its
// whole spells (after round B229's).
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";
import { roundB231Spell } from "./laneb231";

const BONE_SHAMAN = "Creatures dealt damage by ~ this turn can't be regenerated this turn.";
const INFINITE_AUTHORITY = "Whenever enchanted creature blocks or becomes blocked by a creature with toughness 3 or less, destroy the other creature at end of combat. At the beginning of the next end step, if that creature was destroyed this way, put a +1/+1 counter on the first creature.";
const GLYPH_REINCARNATION = "Destroy all creatures that were blocked by target Wall this turn. They can't be regenerated. For each creature that died this way, put a creature card from the graveyard of the player who controlled that creature the last time it became blocked by that Wall onto the battlefield under its owner's control.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 */
export function roundB230Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Bone Shaman's granted ability: "Creatures dealt damage by this creature this turn can't be regenerated this turn.": a
  // static ability (CR 604.1), so only while a permanent has it; any creature this permanent, as the object it is (CR
  // 400.7), dealt damage to this turn, before or after it gained the ability, can't be regenerated (CR 701.19c; game.ts
  // damagedNoRegen).
  if (line === BONE_SHAMAN) {
    out.damagedCantRegenerate = true;
    return true;
  }
  // Infinite Authority: once for each creature it blocks or is blocked by (CR 509.3c-d), toughness 3 or less as it triggers
  // (no "if", so not checked again, CR 603.4); a +1/+1 counter for each creature that triggers it and is destroyed (rulings),
  // on the creature it enchanted as it triggered (rulings: moving the Aura after that changes nothing). See Effect
  // authorityLink and authorityDestroy.
  if (line === INFINITE_AUTHORITY) {
    const t = parseTrigger("Whenever enchanted creature blocks or becomes blocked by a creature with toughness 3 or less, destroy the other creature at end of combat.");
    const d = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfBlocksOrBlockedByCreature" || t.host !== "attached" || t.subjectFilter?.toughness?.max !== 3 || t.body.effects.length !== 1 || d?.type !== "delayed" || d.when !== "endOfCombat" || d.each !== "subject") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "authorityLink" }], text: "destroy the other creature at end of combat. At the beginning of the next end step, if that creature was destroyed this way, put a +1/+1 counter on the first creature." } });
    return true;
  }
  return false;
}

/** Round B230's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB230Spell(text: string): AbilityBody | null | undefined {
  // Glyph of Reincarnation: see Effect glyphReincarnation. The target is "target Wall": any Wall, a creature or not.
  if (text === GLYPH_REINCARNATION) {
    const b = parseBody("Destroy target Wall.", { spell: true });
    if (!b || b.targets.length !== 1 || b.targets[0]!.kind !== "object" || !b.targets[0]!.subtypes?.includes("Wall")) return null;
    return { targets: b.targets, effects: [{ type: "glyphReincarnation" }], text };
  }
  return roundB231Spell(text);
}

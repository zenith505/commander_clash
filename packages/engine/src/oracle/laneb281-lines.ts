// Lane B round B281's lines, read by compileCard before the generic triggers and statics (after round B280's): Celestial
// Dawn's three static abilities, Drain Power's spell.
import type { CompiledCard } from "../abilities";

const DAWN_LANDS = "Lands you control are Plains.";
const DAWN_WHITE = "Nonland permanents you control are white. The same is true for spells you control and nonland cards you own that aren't on the battlefield.";
const DRAIN = "Target player activates a mana ability of each land they control. Then that player loses all unspent mana and you add the mana lost this way.";
const DAWN_MANA = "You may spend white mana as though it were mana of any color. You may spend other mana only as though it were colorless mana.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB281Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Celestial Dawn: "Lands you control are Plains.": each land its controller controls has the land type Plains instead of
  // its other land types, loses the abilities from its rules text and has "{T}: Add {W}." (layer 4, CR 305.7, 613.1d); its
  // supertypes (basic, snow) stay (rulings). Lands outside the battlefield are what they say they are (rulings).
  if (line === DAWN_LANDS) {
    if (isSpell) return fail();
    out.statics.push({ affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "setLandTypes", subtypes: ["Plains"] }], text: line });
    return true;
  }
  // "Nonland permanents you control are white. The same is true for spells you control and nonland cards you own that
  // aren't on the battlefield.": white instead of their other colors (layer 5, CR 105.3, 613.1e), applied to those as they
  // are (a permanent entering under its control too), and back to their own colors once it's gone (rulings); in every zone
  // but the battlefield its controller's spells and the nonland cards they own (layers.ts offFieldColored).
  if (line === DAWN_WHITE) {
    if (isSpell) return fail();
    out.statics.push({ affects: { kind: "filter", types: [], controller: "you", spec: { kind: "object", notTypes: ["Land"], text: "nonland permanent" } }, mods: [{ kind: "setColors", colors: ["W"] }], text: line, offFieldColorsYours: true });
    return true;
  }
  // "You may spend white mana as though it were mana of any color. You may spend other mana only as though it were colorless
  // mana." (CR 609.4b): how its controller may pay each cost with mana (spend.ts dawnCost); mana already in their pool as it
  // arrives is spent that way too, and what mana was spent stays what it was (rulings).
  if (line === DAWN_MANA) {
    if (isSpell || out.dawnMana) return fail();
    out.dawnMana = true;
    return true;
  }
  // Drain Power: the whole spell, a target player (any, its controller too; CR 106.13), effects/run-laneb281.ts drainPower.
  if (line === DRAIN) {
    if (!isSpell || out.spell) return fail();
    out.spell = { targets: [{ kind: "player", text: "target player" }], effects: [{ type: "drainPower" }], text: line };
    return true;
  }
  return false;
}

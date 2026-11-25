// Lane B round B292's lines, read by compileCard before the generic triggers and statics (after round B291's): Balduvian
// Shaman's text change that also gives the enchantment cumulative upkeep, and Guardian Beast's protection of noncreature
// artifacts while it's untapped.
import type { CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseBody } from "./body";
import { parseConditionalStatic } from "./statics";
import { colorTemplate, withColors } from "./color-template";

const SHAMAN =
  '{T}: Change the text of target white enchantment you control that doesn\'t have cumulative upkeep by replacing all instances of one color word with another. That enchantment gains "Cumulative upkeep {1}."';
const GUARDIAN =
  "As long as ~ is untapped, noncreature artifacts you control can't be enchanted, they have indestructible, and other players can't gain control of them. This effect doesn't remove Auras already attached to those artifacts.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB292Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Balduvian Shaman: a text change of color words (CR 612.1-612.2, as Sleight of Mind's: the words chosen as it resolves,
  // never the same word, the text box and type line of the card as printed or copied, not effects on it, rulings), then the
  // same enchantment gains "Cumulative upkeep {1}" (CR 702.24a) with no duration, so for the rest of the game (CR 611.2a),
  // in layer 6 (CR 613.1f), working as a printed one does (an upkeep trigger, grants.ts). "That doesn't have cumulative
  // upkeep" is part of the target's description, checked as it's chosen and as it resolves (CR 601.2c, 608.2b): printed
  // or gained, the gained text counted as the keyword (targeting.ts objectMatches).
  // Its color as a text change of color words leaves it (color-template.ts).
  const shaman = colorTemplate(SHAMAN, line);
  if (shaman) {
    if (isSpell) return fail();
    const ab = parseActivated(withColors("{T}: Change the text of target white enchantment you control by replacing all instances of one color word with another.", shaman));
    const gain = parseBody('Target enchantment gains "Cumulative upkeep {1}."', {});
    const t = ab && ab !== "fail" ? ab.body.targets[0] : undefined;
    const change = ab && ab !== "fail" ? ab.body.effects[0] : undefined;
    const g = gain?.effects[0];
    if (!ab || ab === "fail" || ab.body.targets.length !== 1 || t?.kind !== "object" || ab.body.effects.length !== 1 || change?.type !== "changeText") return fail();
    if (!gain || gain.effects.length !== 1 || g?.type !== "continuous" || g.duration !== "game" || g.mods.length !== 1 || g.mods[0]!.kind !== "addAbility") return fail();
    const it = { ref: "target" as const, index: 0 };
    out.activated.push({
      ...ab,
      body: {
        targets: [{ ...t, notKeywords: ["Cumulative upkeep"], text: withColors("target white enchantment you control that doesn't have cumulative upkeep", shaman) }],
        effects: [change, { ...g, what: it }],
        text: line.slice("{T}: ".length),
      },
      text: line,
    });
    return true;
  }
  // Guardian Beast: one static ability (CR 604.1) with a condition (it's untapped, CR 611.3a) and three parts for the
  // noncreature artifacts its controller controls, all applying while it's untapped: they can't be enchanted, though Auras
  // attached already stay (no Aura can become attached, CR 303.4i-j; Modification cantBeEnchanted newOnly); they have
  // indestructible (CR 702.12, layer 6); and players other than their controller can't gain control of them (CR 101.2;
  // guardian.ts: checked as each control-changing effect would begin). Sacrifices aren't stopped (rulings).
  if (line === GUARDIAN) {
    if (isSpell) return fail();
    const kw = parseConditionalStatic("As long as ~ is untapped, noncreature artifacts you control have indestructible.");
    const ench = parseConditionalStatic("As long as ~ is untapped, noncreature artifacts you control can't be enchanted.");
    if (!kw || !ench || kw.condition?.kind !== "self" || ench.condition?.kind !== "self" || kw.mods.length !== 1 || kw.mods[0]!.kind !== "addKeywords" || ench.mods.length !== 1 || ench.mods[0]!.kind !== "cantBeEnchanted") return fail();
    out.statics.push({ ...ench, mods: [{ kind: "cantBeEnchanted", newOnly: true }, { kind: "othersCantGainControl" }], text: line }, { ...kw, text: line });
    return true;
  }
  return false;
}

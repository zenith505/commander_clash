// Lane B round B179's lines, read by compileCard before its triggers and activated abilities (after round B178's), and
// its sentences, read at the end of round B178's.
import type { CardDef } from "../types";
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseManaCost } from "../mana";

type Found = { effect: Effect; next: number } | "fail" | null;

const COLOR_TYPE = { white: "W", blue: "U", black: "B", red: "R", green: "G" } as const;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB179Line(line: string, raw: string, out: CompiledCard, isSpell: boolean, d: CardDef): boolean {
  // Drain Life, Consume Spirit: "Spend only black mana on X." in an instant or sorcery whose mana cost has one {X} and
  // more: a restriction on how its total cost is paid (CR 601.2g-h), the mana paying X of that type. Reductions may take
  // off X too (rulings), so only the part of X they leave is (spellCost). Spending mana as though it were mana of any type
  // still pays it (CR 609.4b; Celestial Dawn's rulings).
  const onX = /^Spend only (white|blue|black|red|green) mana on X\.$/.exec(line);
  if (onX && isSpell) {
    const cost = parseManaCost(d.manaCost);
    const xs = cost.symbols.filter((y) => y.kind === "x").length;
    if (!cost.supported || xs !== 1 || cost.symbols.length < 2 || out.spendOnlyOnX || d.faces?.length) out.unsupported.push(raw);
    else out.spendOnlyOnX = COLOR_TYPE[onX[1] as keyof typeof COLOR_TYPE];
    return true;
  }
  // Tapestry Warden (its other abilities are vigilance and the assigns-damage-by-toughness line).
  if (line === "Each creature you control with toughness greater than its power stations permanents using its toughness rather than its power." && !isSpell) {
    out.stationByToughness = true;
    return true;
  }
  return false;
}

export function roundB179Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Drain Life, after "~ deals X damage to any target": "You gain life equal to the damage dealt, but not more life than the
  // player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the
  // creature's toughness.": the damage really dealt (after prevention), no more than its recipient's life total or
  // loyalty just before it (CR 120.3), or its toughness, already damaged or not (rulings).
  if (s === "You gain life equal to the damage dealt, but not more life than the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness") {
    const last = effects[effects.length - 1];
    if (effects.length !== 1 || last?.type !== "damage" || last.to.ref !== "anyTarget" || !ctx.spell) return "fail";
    return { effect: { type: "gainLife", who: { ref: "you" }, n: { count: { kind: "damageThisWay", capped: true } } }, next: si + 1 };
  }
  // Counterlash, after "Counter target spell": "You may cast a spell that shares a card type with it from your hand without
  // paying its mana cost.": "it" is the target spell, countered or not, its card types as it was on the stack; cast as this
  // resolves, timing by card type ignored, X 0, no alternative costs (rulings, CR 608.2g, 118.9).
  if (s === "You may cast a spell that shares a card type with it from your hand without paying its mana cost") {
    const last = effects[effects.length - 1];
    if (effects.length !== 1 || last?.type !== "counterSpell" || last.unless || last.exile || last.cause || ctx.targets[last.index]?.kind !== "spell" || !ctx.spell) return "fail";
    last.noteTypes = true;
    return { effect: { type: "castFromHand", filter: { kind: "spell", types: [], notTypes: [], notColors: [], text: "spell that shares a card type with it" }, sharesTypeWithCountered: true }, next: si + 1 };
  }
  return null;
}

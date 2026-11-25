// Lane B round B260's lines, read by compileCard: the costs Brutal Suppression and Drought add to other spells and
// abilities (CompiledCard.addedCosts; added-costs.ts).
import type { CompiledCard, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { COLOR_OF_WORD } from "./color-template";

/** "Sacrifice a land", "Sacrifice a Swamp": what the cost's own words sacrifice, as an ability's cost would read them. */
function sacrificeSpec(cost: string): TargetSpec | null {
  const a = parseActivated(`${cost}: Draw a card.`);
  const c = a && a !== "fail" && a.costs?.length === 1 && !a.manaCost && !a.tap && !a.sacrificeSelf ? a.costs[0]! : undefined;
  return c?.kind === "sacrifice" && c.n === 1 && !c.other && !c.oneOfEach && !c.x ? c.filter : null;
}

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function addedCostLine(line: string, out: CompiledCard): boolean {
  // Brutal Suppression: "Activated abilities of nontoken Rebels cost an additional "Sacrifice a land" to activate.": the
  // abilities of nontoken Rebel permanents (CR 109.2), mana abilities too (CR 605.1a; rulings: an activated ability is one
  // with a colon); a changeling is a Rebel (CR 702.73a).
  let m = /^Activated abilities of nontoken Rebels cost an additional "(Sacrifice a land)" to activate\.$/.exec(line);
  if (m) {
    const sacrifice = sacrificeSpec(m[1]!);
    if (!sacrifice) return false;
    const source: TargetSpec = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Rebel"], token: false, text: "nontoken Rebel" };
    (out.addedCosts ??= []).push({ what: "abilities", sacrifice, source });
    return true;
  }
  // Drought: "Spells cost an additional "Sacrifice a Swamp" to cast for each black mana symbol in their mana costs." and
  // "Activated abilities cost an additional "Sacrifice a Swamp" to activate for each black mana symbol in their activation
  // costs.": every player's (rulings: Pestilence's {B} activated four times is four Swamps; a hybrid symbol with black in it
  // is a black mana symbol whatever pays for it).
  m = /^(Spells|Activated abilities) cost an additional "(Sacrifice a Swamp)" to (cast|activate) for each (white|blue|black|red|green) mana symbol in their (mana|activation) costs\.$/.exec(line);
  // Another color word than black after a text change of color words (round 462): that color's symbols.
  if (m && (m[1] === "Spells") === (m[3] === "cast") && (m[3] === "cast") === (m[5] === "mana")) {
    const sacrifice = sacrificeSpec(m[2]!);
    if (!sacrifice) return false;
    const color = COLOR_OF_WORD[m[4]!]!;
    (out.addedCosts ??= []).push({ what: m[1] === "Spells" ? "spells" : "abilities", sacrifice, perBlack: true, ...(color !== "B" ? { perColor: color } : {}) });
    return true;
  }
  return false;
}

// Lane B round B294's whole spells, read after round B291's (roundB291Spell in oracle/laneb291-lines.ts): Channel, Yavimaya
// Bloomsage's prepare spell (the original Channel too, banned in Commander), and False Dawn.
import type { AbilityBody } from "../abilities";
import { parseBody } from "./body";
import { colorTemplate } from "./color-template";

const CHANNEL = "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.";
const FALSE_DAWN =
  "Until end of turn, spells and abilities you control that would add colored mana instead add that much white mana. Until end of turn, you may spend white mana as though it were mana of any color. Draw a card.";

/** A whole spell's text (its paragraphs joined), or undefined when it isn't one of these. */
export function roundB294Spell(text: string): AbilityBody | null | undefined {
  // Channel: a permission for the rest of the turn (TurnRule "channel", channel.ts): any time its controller could activate a
  // mana ability (CR 605.3a), they may pay 1 life (CR 119.4) and add {C}, without the stack. It ends in the cleanup step
  // (CR 514.2).
  if (text === CHANNEL) return { targets: [], effects: [{ type: "turnRules", rules: ["channel"] }], text };
  // False Dawn: two effects that last until the cleanup step (CR 514.2): a replacement on all mana production by spells and
  // abilities its controller controls (CR 614.1a, spend.ts falseDawnMana) and a permission to spend white mana as though it
  // were mana of any color (CR 609.4b, payableCost); then its controller draws a card.
  // Its color as a text change of color words leaves it (round 462): both words are changed together, so they're one color
  // (TurnRule byColors, white when not given).
  const dawn = colorTemplate(FALSE_DAWN, text);
  if (dawn) {
    const draw = parseBody("Draw a card.", { spell: true });
    const color = dawn[0]![0]!;
    if (!draw || draw.targets.length || draw.effects.length !== 1 || draw.modal || dawn[1]![0] !== color) return null;
    return { targets: [], effects: [{ type: "turnRules", rules: ["whiteMana", "whiteAnyColor"], ...(color !== "W" ? { byColors: [color] } : {}) }, ...draw.effects], text };
  }
  return undefined;
}

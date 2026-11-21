// Lane B round B286's lines, read by compileCard before the generic triggers and statics (after round B285's): Galea,
// Kindler of Hope's permission to cast from the top of the library and Unpredictable Cyclone's draw replacement.
import type { CompiledCard } from "../abilities";
import { parseFromTop } from "./compile";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

const GALEA = /^(You may cast Aura and Equipment spells from the top of your library)\. When you cast an Equipment spell this way, it gains "When (?:⟪source⟫|this Equipment|~) enters, attach it to target creature you control\."$/;
const CYCLONE =
  "If a cycling ability of another nonland card would cause you to draw a card, instead exile cards from the top of your library until you exile a card that shares a card type with the cycled card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of your library in a random order.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB286Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Galea, Kindler of Hope: Aura and Equipment spells from the top of your library, at their usual timing and paying all
  // their costs (rulings; FromTop as for Vizier of the Menagerie). "When you cast an Equipment spell this way" is a
  // triggered ability of Galea's (CR 603.2), triggering as such a spell is cast with this permission (CR 601.2i) and put on
  // the stack above it (CR 603.3); as it resolves, the spell, if still that spell on the stack (CR 400.7), gains the enters
  // trigger with no duration, kept by the permanent it becomes (CR 400.7a, 611.2a; Effect spellGains `forever`).
  const galea = GALEA.exec(line);
  if (galea) {
    if (isSpell) return fail();
    const top = parseFromTop(galea[1]!);
    const cast = parseTrigger('Whenever you cast an Equipment spell, it gains "When ~ enters, attach it to target creature you control."');
    const spell = parseSearchFilter("Equipment card");
    if (!top || top.once || !cast || cast === "fail" || cast.event !== "castSpell" || cast.body.effects[0]?.type !== "spellGains" || !spell) return fail();
    (out.fromTop ??= []).push({ ...top, castTrigger: { spell, body: { ...cast.body, text: 'the Equipment spell gains "When ~ enters, attach it to target creature you control."' } } });
    return true;
  }
  // Unpredictable Cyclone: a replacement of its controller's draws that a cycling ability of a nonland card other than this
  // object causes (CR 614.1a, 702.29a; CompiledCard.drawCycloneCycled, game.ts cycloneInstead).
  if (line === CYCLONE) {
    if (isSpell || out.drawCycloneCycled) return fail();
    out.drawCycloneCycled = true;
    return true;
  }
  return false;
}

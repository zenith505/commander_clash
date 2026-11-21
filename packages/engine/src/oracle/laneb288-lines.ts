// Lane B round B288's lines, read by compileCard before the generic triggers and statics (after round B287's): Nihiloor's
// two triggers and Ashiok, Wicked Manipulator's life payment replacement and +1.
import type { CompiledCard } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseTrigger } from "./triggers";

const NIHILOOR_ENTERS =
  "When ~ enters, for each opponent, tap up to one untapped creature you control. When you do, gain control of target creature that player controls with power less than or equal to the tapped creature's power for as long as you control ~.";
const NIHILOOR_ATTACKS = "Whenever you attack with a creature an opponent owns, you gain 2 life and that player loses 2 life.";
const ASHIOK_LIFE = "If you would pay life while your library has at least that many cards in it, exile that many cards from the top of your library instead.";
const ASHIOK_PLUS = "+1: Look at the top two cards of your library. Exile one of them and put the other into your hand.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB288Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Nihiloor's enters trigger: its whole effect is one (nihiloorTap, effects/run-laneb288.ts), which makes the reflexive
  // triggers, one for each creature it taps (CR 603.12).
  if (line === NIHILOOR_ENTERS) {
    if (isSpell) return fail();
    const t = parseTrigger("When ~ enters, draw a card.");
    if (!t || t === "fail" || t.event !== "selfEnters") return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "nihiloorTap" }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // "Whenever [a player] attacks with [a creature]" triggers for each creature that player controls declared as an attacker
  // (CR 508.3c), never for one put onto the battlefield attacking (CR 508.3a, 508.4): the attack trigger of a creature you
  // control, only one an opponent owns (CR 108.3). "That player" is its owner (subjectOwner), who never changes.
  if (line === NIHILOOR_ATTACKS) {
    if (isSpell) return fail();
    const t = parseTrigger("Whenever a creature you control attacks, you gain 2 life and its owner loses 2 life.");
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || !t.attacker?.filter) return fail();
    const body = t.body;
    if (!body || body.effects.length !== 2 || body.effects[1]?.type !== "loseLife") return fail();
    out.triggers.push({ ...t, attacker: { ...t.attacker, filter: { ...t.attacker.filter, owner: "opponent", text: "creature an opponent owns" } }, body: { ...body, text: line.replace(/^Whenever you attack with a creature an opponent owns, /, "") } });
    return true;
  }
  // Ashiok, Wicked Manipulator: a replacement effect on its controller's life payments (CR 614.1a), "instead" so no life is
  // paid or lost (CR 614.6), only while the library holds at least that many cards; it doesn't let a player pay more life
  // than they have (rulings, CR 119.4), and it isn't optional or split (rulings). game.ts payLife.
  if (line === ASHIOK_LIFE) {
    if (isSpell || out.payLifeExiles) return fail();
    out.payLifeExiles = true;
    return true;
  }
  return false;
}

/** Ashiok, Wicked Manipulator's +1: "Exile one of them and put the other into your hand": the dig's pick is the one exiled. */
export function roundB288Loyalty(line: string, raw: string, out: CompiledCard): boolean {
  if (line !== ASHIOK_PLUS) return false;
  const ab = parseLoyalty("+", "1", "Look at the top two cards of your library. Put one of them into your hand and the other into your graveyard.", raw);
  const dig = ab === "fail" ? undefined : ab.body.effects[0];
  if (ab === "fail" || ab.loyalty !== 1 || ab.body.targets.length || ab.body.effects.length !== 1 || dig?.type !== "dig" || dig.n !== 2 || dig.count !== 1 || dig.upTo || dig.into !== "hand" || dig.rest !== "graveyard") {
    out.unsupported.push(raw);
    return true;
  }
  out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...dig, into: "exile", rest: "hand" }], text: line.replace(/^\+1: /, "") }, text: line });
  return true;
}

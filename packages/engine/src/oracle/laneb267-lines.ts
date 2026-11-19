// Lane B round B267's lines, read by compileCard before the generic triggers (after round B266's): Taster of Wares's
// reveal-and-exile, Grip of Chaos's random reselection and The Seventh Doctor's guess.
import type { CompiledCard } from "../abilities";
import { parseCount } from "./counts";
import { parseTrigger } from "./triggers";

const TASTER = "When ~ enters, target opponent reveals X cards from their hand, where X is the number of Goblins you control. You choose one of those cards. That player exiles it. If an instant or sorcery card is exiled this way, you may cast it for as long as you control ~, and mana of any type can be spent to cast that spell.";
const GRIP = "Whenever a spell or ability is put onto the stack, if it has a single target, reselect its target at random.";
const SEVENTH = "Whenever ~ attacks, choose a card in your hand. Defending player guesses whether that card's mana value is greater than the number of artifacts you control. If they guessed wrong, you may cast it without paying its mana cost. If you don't cast a spell this way, investigate.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB267Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Taster of Wares: X counted once, as it resolves (rulings); the opponent reveals that many cards of their choice (all of
  // them with fewer, CR 609.3), you choose one, and it's exiled (Thieving Sprite's reveal, Effect takeFromHand). Only an
  // instant or sorcery card exiled this way may be cast, by you, for as long as you control ~ as the same object (CR 611.2b:
  // not at all if you don't control it by then), following its usual timing and paying its costs (rulings), with mana of
  // any type (CR 609.4b).
  if (line === TASTER) {
    const t = isSpell ? null : parseTrigger("When ~ enters, target opponent reveals X cards from their hand and discards the one of them you choose, where X is the number of Goblins you control.");
    const e = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || t.body.effects.length !== 1 || e?.type !== "takeFromHand" || e.action !== "discard" || !e.reveal) return fail();
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, action: "exile", youMay: { anyType: true, whileControlled: true, ifTypes: ["Instant", "Sorcery"] } }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Grip of Chaos: any spell or ability put onto the stack (cast, activated, triggered or a copy, CR 707.10; mana abilities
  // never are, CR 605.3a) with exactly one target chosen (CR 115.6), checked as it triggers and as it resolves (CR 603.4).
  // Its own ability has no target, so it never triggers on it.
  if (line === GRIP) {
    if (isSpell) return fail();
    out.triggers.push({ event: "stackItemSingleTarget", body: { targets: [], effects: [{ type: "gripReselect" }], text: "if it has a single target, reselect its target at random." } });
    return true;
  }
  // The Seventh Doctor (rulings): the card chosen face down and the guess made without seeing it; "defending player" the
  // player it attacks, or the controller or protector of what it attacks (CR 506.2, 508.5); the number of artifacts counted
  // as the guess is checked; a land can't be cast, and X is 0. Investigate when no spell was cast this way (none chosen,
  // a right guess, a card that can't be cast, or one not cast).
  if (line === SEVENTH) {
    const t = isSpell ? null : parseTrigger("Whenever ~ attacks, defending player loses 1 life. Investigate.");
    const lose = t && t !== "fail" ? t.body.effects[0] : undefined;
    const clue = t && t !== "fail" ? t.body.effects[1] : undefined;
    const artifacts = parseCount("the number of artifacts you control", null);
    if (!t || t === "fail" || t.event !== "selfAttacks" || lose?.type !== "loseLife" || clue?.type !== "createToken" || !artifacts) return fail();
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "predicament", who: lose.who, over: 0, overCount: artifacts }, { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [clue] }], text: line.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  return false;
}

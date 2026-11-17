// Lane B round B244's lines, read by compileCard before its triggers and activated abilities (after round B243's).
import type { CompiledCard } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseTrigger } from "./triggers";

const DOMRI = "+1: Add {R} or {G}. If that mana is spent on a creature spell, it gains riot.";

/** A planeswalker's loyalty ability, read before the other loyalty abilities; false when it isn't one of these. */
export function roundB244Loyalty(line: string, raw: string, out: CompiledCard): boolean {
  // Domri, Chaos Bringer: "+1: Add {R} or {G}. If that mana is spent on a creature spell, it gains riot.": a loyalty
  // ability isn't a mana ability, so it uses the stack (CR 605.1a, rulings); the color is chosen as it resolves. A
  // creature spell that mana is spent on gains riot (CR 702.136a), and the permanent it becomes has it (CR 400.7a), so it
  // enters with a +1/+1 counter or gains haste (rulings); spent on two such, one instance each (Effect addMana `riot`).
  if (line !== DOMRI) return false;
  const ab = parseLoyalty("+", "1", "Add {R} or {G}.", raw);
  const add = ab !== "fail" && ab.body.effects.length === 1 && !ab.body.targets.length ? ab.body.effects[0] : undefined;
  if (ab === "fail" || ab.loyalty !== 1 || add?.type !== "addMana" || add.split?.join() !== "R,G" || add.times !== 1 || add.who) {
    out.unsupported.push(raw);
    return true;
  }
  out.activated.push({ ...ab, body: { ...ab.body, effects: [{ ...add, riot: true }], text: line.replace(/^\+1: /, "") } });
  return true;
}

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB244Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ms. Marvel, Kamala Khan's granted '"~'s base power is equal to the number of cards in your hand."': not a
  // characteristic-defining ability, since an effect grants it (CR 604.3a), so it sets the base power in layer 7b (CR
  // 613.4b) with the timestamp of the effect that granted it (CR 613.7a), its toughness kept; the number counted
  // continuously, as a static ability's is (CR 611.3a), not locked in as the trigger resolves.
  if (!isSpell && line === "~'s base power is equal to the number of cards in your hand.") {
    out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "setPower", power: { count: { kind: "cardsInHand", who: { ref: "you" } } } }], text: line });
    return true;
  }
  // Nihilith: "Whenever a card is put into an opponent's graveyard from anywhere, if ~ is suspended, you may remove a time
  // counter from ~.": an ability of the card while it's suspended in exile (CR 113.6, 702.62b), its owner controlling it
  // (CR 113.8), with an intervening if (CR 603.4); once for each card (CR 603.2c), not a token or a copy of a spell
  // (rulings). Removing the last counter this way lets its owner cast it, as suspend's own removal does (rulings).
  if (!isSpell && line === "Whenever a card is put into an opponent's graveyard from anywhere, if ~ is suspended, you may remove a time counter from ~.") {
    const t = parseTrigger("Whenever a card is put into an opponent's graveyard from anywhere, you may remove a time counter from ~.");
    const may = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    const rm = may?.type === "may" && may.effects.length === 1 ? may.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "batch" || t.batch?.what !== "toGraveyard" || t.batch.whose !== "opponent" || !t.batch.each || t.batch.filter || t.batch.from || t.zone || t.ifCond || may?.type !== "may" || rm?.type !== "removeCounters" || rm.what.ref !== "self" || rm.counter !== "time" || rm.n !== 1) {
      out.unsupported.push(line);
      return true;
    }
    out.triggers.push({ ...t, zone: "exile", ifCond: { kind: "selfSuspended" }, body: { ...t.body, effects: [{ ...may, effects: [{ ...rm, what: { ref: "selfCard" } }] }] } });
    return true;
  }
  return false;
}

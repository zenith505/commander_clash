// Lane B round B219's lines, read by compileCard before its triggers and activated abilities (after round B218's), and its
// whole spells (chained from round B217's).
import type { AbilityBody, CompiledCard, Effect } from "../abilities";
import { parseLoyalty } from "./activated";
import { parseBody } from "./body";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

/** A trigger line read the usual way, or null. */
const trig = (text: string) => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : null;
};

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB219Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => {
    out.unsupported.push(raw);
    return true;
  };
  // Dreamshaper Shaman: "At the beginning of your end step, you may pay {2}{R} and sacrifice a nonland permanent. If you do,
  // reveal cards from the top of your library until you reveal a nonland permanent card. Put that card onto the battlefield
  // and the rest on the bottom of your library in a random order.": both or neither, ~ itself may be the one sacrificed, once
  // each (rulings); the reveal stops at the first nonland permanent card (CR 701.20a), all of them if there's none (rulings).
  // An Aura found enchants what its controller chooses as it enters, or stays in the library with nothing to enchant (CR
  // 303.4f-g); a battle gets its protector as it enters (CR 310.9a); a planeswalker its loyalty (CR 306.5b).
  if (!isSpell && line === "At the beginning of your end step, you may pay {2}{R} and sacrifice a nonland permanent. If you do, reveal cards from the top of your library until you reveal a nonland permanent card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.") {
    const t = trig("At the beginning of your end step, you may pay {2}{R} and sacrifice a nonland permanent. If you do, draw a card.");
    const [may, ifDid] = t?.body.effects ?? [];
    const filter = parseSearchFilter("nonland permanent card");
    if (!t || t.event !== "yourEndStep" || t.body.targets.length || t.body.effects.length !== 2 || may?.type !== "may" || may.pay?.mana !== "{2}{R}" || may.effects.length !== 1 || may.effects[0]!.type !== "pick" || ifDid?.type !== "if" || ifDid.cond.kind !== "youDid" || !filter || filter.kind !== "card") return fail();
    const reveal: Effect = { type: "revealUntil", filter, found: "battlefield", rest: "bottom" };
    const text = line.replace(/^At the beginning of your end step, /, "");
    out.triggers.push({ ...t, body: { targets: [], effects: [may, { ...ifDid, effects: [reveal] }], text } });
    return true;
  }
  // Garruk, Curse Breaker: "−4: Until your next turn, whenever one or more creatures attack one of your opponents, those
  // creatures get +2/+2 and gain trample until end of turn.": a delayed trigger until its controller's next turn (CR 603.7b),
  // anyone's creatures attacking one of that player's opponents (rulings on Frenzied Gorespawn's same trigger), not a
  // planeswalker or battle (CR 508.1b, rulings); once for each opponent attacked, about the creatures attacking them, as
  // "defending player" in Squall, Gunblade Duelist's same trigger says (CR 508.3e).
  if (!isSpell && line === "−4: Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn.") {
    const a = parseLoyalty("−", "4", "Draw a card.", raw);
    const t = trig("Whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn.");
    if (!a || a === "fail" || a.loyalty !== -4 || !t || t.event !== "creaturesYouControlAttack" || !t.anyoneAttacks || !t.attacksOpponent || t.attacksOpponent.orPlaneswalkers || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "continuous") return fail();
    const text = line.replace(/^−4: /, "");
    out.activated.push({ ...a, text: line, body: { targets: [], effects: [{ type: "floatingTrigger", trigger: t, until: "yourNextTurn" }], text } });
    return true;
  }
  // Trove of Temptation: a requirement on each opponent as they declare attackers (CompiledCard.opponentsAttackYouWithOne).
  if (!isSpell && line === "Each opponent must attack you or a planeswalker you control with at least one creature each combat if able.") {
    out.opponentsAttackYouWithOne = true;
    return true;
  }
  return false;
}

/** Round B219's whole spells: the body, null when it's one of these but can't be read, undefined when it isn't. */
export function roundB219Spell(text: string): AbilityBody | null | undefined {
  // Song of Inspiration: "Choose up to two target permanent cards in your graveyard. Roll a d20 and add the total mana value
  // of those cards. 1—14 | Return those cards to your hand. 15+ | Return those cards to your hand. You gain life equal to
  // their total mana value.": the roll modified by the total (CR 706.2), X as 0 in a graveyard (CR 107.3); a target that has
  // become illegal gives no mana value, to the roll or the life (CR 608.2b: no information about an illegal target is
  // determined), as Command the Dreadhorde's total does; the life is those cards' total once they're back in your hand.
  if (text === "Choose up to two target permanent cards in your graveyard. Roll a d20 and add the total mana value of those cards. 1—14 | Return those cards to your hand. 15+ | Return those cards to your hand. You gain life equal to their total mana value.") {
    const body = parseBody("Return up to two target permanent cards from your graveyard to your hand.", { spell: true });
    const bounce = body?.effects[0];
    if (!body || body.targets.length !== 2 || body.effects.length !== 1 || bounce?.type !== "bounce" || bounce.what.ref !== "target" || bounce.what.index !== 0) return null;
    const total = { count: { kind: "manaValue" as const, of: bounce.what, total: true as const } };
    const roll: Effect = { type: "roll", sides: 20, add: total };
    const low: Effect = { type: "if", cond: { kind: "rollIn", min: 1, max: 14 }, effects: [bounce] };
    const high: Effect = { type: "if", cond: { kind: "rollIn", min: 15 }, effects: [bounce, { type: "gainLife", who: { ref: "you" }, n: { count: { kind: "returnedToYourHand", totalMv: true } } }] };
    return { targets: body.targets, effects: [roll, low, high], text };
  }
  return undefined;
}

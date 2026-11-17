// Round 384's whole lines: a council's dilemma milling and exiling once for each vote (Fateful Tempest), lands flooded into
// Islands by each player in turn (Quicksilver Fountain), a trigger on a creature that enlisted (Aradesh, the Founder) and
// a secret number an opponent guesses (The Toymaker's Trap).
import type { Amount, CompiledCard, Effect, TriggeredAbility } from "../abilities";
import { parseBody } from "./body";
import { parseTrigger } from "./triggers";

const TEMPEST = "Starting with you, each player votes for past or present. You mill a card for each past vote, then ~ deals damage to each opponent equal to the total mana value of cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards.";
const FLOOD = "At the beginning of each player's upkeep, that player puts a flood counter on target non-Island land they control of their choice. That land is an Island for as long as it has a flood counter on it.";
const DRAIN = "At the beginning of each end step, if all lands on the battlefield are Islands, remove all flood counters from them.";
const ARADESH = "Whenever a creature you control attacks, if it enlisted a creature this combat, the creature that attacked gains double strike until end of turn. If that creature's power is 4 or greater, draw a card.";
const TRAP = "At the beginning of your upkeep, secretly choose a number between 1 and 5 that hasn't been chosen. If you do, an opponent guesses which number you chose, then you reveal the number you chose. If they guessed wrong, they lose life equal to the number they guessed and you draw a card. If they guessed right, sacrifice ~.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const trigger = (text: string): TriggeredAbility | undefined => {
  const t = parseTrigger(text);
  return t && t !== "fail" ? t : undefined;
};

/** A whole line of round 384's (compile.ts, after round 383's). */
export function round384Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Fateful Tempest: every player votes, starting with you, for one of the two (CR 701.38a; no abstaining, rulings). You
  // mill one card for each past vote, all of them one mill of that many (CR 701.17a), then it deals damage to each opponent
  // equal to the total mana value of the cards milled (X as 0, rulings; CR 202.3e), wherever they went (CR 701.17c). Then
  // the top card of your library is exiled for each present vote, and you may play those cards until the end of your next
  // turn, paying their costs and following the timing rules (rulings, CR 305.2 for a land). With no vote for one of
  // them, that part does nothing.
  if (line === TEMPEST || line === `Council's dilemma — ${TEMPEST}`) {
    if (!isSpell || out.spell) return fail(out, raw);
    const vote = parseBody("Starting with you, each player votes for past or present.", { spell: true });
    const mill = parseBody("Mill two cards.", { spell: true });
    const hit = parseBody("~ deals 3 damage to each opponent.", { spell: true });
    const play = parseBody("Exile the top two cards of your library. Until the end of your next turn, you may play those cards.", { spell: true });
    const v = vote?.effects[0];
    const m = mill?.effects[0];
    const d = hit?.effects[0];
    const p = play?.effects[0];
    if (vote?.effects.length !== 1 || v?.type !== "vote" || v.options?.join("|") !== "past|present") return fail(out, raw);
    if (mill?.effects.length !== 1 || m?.type !== "mill" || m.who.ref !== "you" || m.repeatSharedColor || m.repeatSharedTypeDraw) return fail(out, raw);
    if (hit?.effects.length !== 1 || d?.type !== "damage" || d.to.ref !== "eachOpponent" || d.amount !== 3) return fail(out, raw);
    if (play?.effects.length !== 1 || p?.type !== "impulse" || p.until !== "nextTurn" || Object.keys(p).some((k) => k !== "type" && k !== "n" && k !== "until")) return fail(out, raw);
    const votes = (option: string): Amount => ({ count: { kind: "votes", option } });
    const effects: Effect[] = [
      v,
      { type: "if", cond: { kind: "amountNow", amount: votes("past"), min: 1 }, effects: [{ ...m, n: votes("past") }, { ...d, amount: { count: { kind: "milledManaValue" } } }] },
      { type: "if", cond: { kind: "amountNow", amount: votes("present"), min: 1 }, effects: [{ ...p, n: votes("present") }] },
    ];
    out.spell = { targets: [], effects, text: line };
    return true;
  }
  // Quicksilver Fountain: the trigger is the Fountain controller's (CR 603.3a), but the upkeep's player chooses its target,
  // a non-Island land they control (TargetSpec.chosenBy "eventPlayer", rulings on Erithizon), and they put the counter on
  // it. From then on it's an Island for as long as it has a flood counter, losing its other land types and their mana
  // abilities (CR 305.7, layer 4 with its timestamp from this resolution, rulings), even after the Fountain has left.
  if (line === FLOOD) {
    if (isSpell) return fail(out, raw);
    const t = trigger("At the beginning of each player's upkeep, put a flood counter on target non-Island land that player controls. That land is an Island for as long as it has a flood counter on it.");
    const [put, island] = t?.body.effects ?? [];
    const target = t?.body.targets[0];
    if (!t || t.event !== "eachUpkeep" || t.body.targets.length !== 1 || target?.kind !== "object" || target.controller !== "eventPlayer" || target.notSubtypes?.join() !== "Island" || t.body.effects.length !== 2 || put?.type !== "counters" || put.counter !== "flood" || island?.type !== "continuous" || island.whileCounter !== "flood" || island.mods.length !== 1 || island.mods[0]!.kind !== "setLandTypes") return fail(out, raw);
    out.triggers.push({
      ...t,
      body: { targets: [{ ...target, chosenBy: "eventPlayer", text: "target non-Island land they control of their choice" }], effects: [{ ...put, by: { ref: "eventPlayer" } }, island], text: line.replace(/^At the beginning of each player's upkeep, /, "") },
    });
    return true;
  }
  // "If all lands on the battlefield are Islands": an intervening if (CR 603.4), checked again as it resolves; with every
  // land an Island, "them" is every land.
  if (line === DRAIN) {
    if (isSpell) return fail(out, raw);
    const t = trigger("At the beginning of each end step, if there are no non-Island lands on the battlefield, remove all flood counters from all lands.");
    const rm = t?.body.effects[0];
    if (!t || t.event !== "eachEndStep" || t.ifCond?.kind !== "onBattlefield" || t.body.effects.length !== 1 || rm?.type !== "removeCounters" || rm.counter !== "flood" || rm.n !== "all") return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: "if all lands on the battlefield are Islands, remove all flood counters from them." } });
    return true;
  }
  // Aradesh, the Founder: an intervening if (CR 603.4, rulings): only for a creature that tapped another for its enlist
  // ability as it was declared an attacker this combat (CR 702.154a, 508.1g), as that object (GameState.enlistedThisCombat);
  // what happens to the enlisted creature afterward doesn't matter (rulings). The power is checked as it resolves, after
  // enlist's bonus if that resolved first, or as the creature last existed (CR 608.2h).
  if (line === ARADESH) {
    if (isSpell) return fail(out, raw);
    const t = trigger("Whenever a creature you control attacks, it gains double strike until end of turn.");
    const ds = t?.body.effects[0];
    if (!t || t.event !== "creatureYouControlAttacks" || t.ifCond || t.body.effects.length !== 1 || ds?.type !== "continuous" || ds.what.ref !== "subject") return fail(out, raw);
    out.triggers.push({
      ...t,
      ifCond: { kind: "subjectEnlisted" },
      body: { targets: [], effects: [ds, { type: "if", cond: { kind: "state", cond: { kind: "subjectPT", stat: "power", min: 4 } }, effects: [{ type: "draw", who: { ref: "you" }, n: 1 }] }], text: "if it enlisted a creature this combat, the creature that attacked gains double strike until end of turn. If that creature's power is 4 or greater, draw a card." },
    });
    return true;
  }
  // The Toymaker's Trap: the number is chosen as it resolves, one not chosen yet for this object (CR 400.7, rulings), then an
  // opponent you choose guesses, then the number is revealed (Effect secretNumberGuess).
  if (line === TRAP) {
    if (isSpell) return fail(out, raw);
    const t = trigger("At the beginning of your upkeep, draw a card.");
    if (!t || t.event !== "yourUpkeep") return fail(out, raw);
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "secretNumberGuess", max: 5 }], text: line.replace(/^At the beginning of your upkeep, /, "") } });
    return true;
  }
  return false;
}

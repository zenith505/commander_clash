// More cascade for spells you cast (CR 702.85a): "Commander spells you cast have cascade" (Flamekin Herald), Abaddon's
// "spells you cast from your hand with mana value X or less", X counted as the spell is cast; Bloodbraid Marauder's
// own cascade only with delirium; TARDIS's "the next spell you cast this turn has cascade and you may planeswalk"
// (planeswalking does nothing outside Planechase, CR 701.31a).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { loseLife, moveObject } from "../src/game";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const cascades = (s: GameState) => s.log.filter((l) => / cascades: /.test(l.text)).length;
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Resolve everything, declining cascade's free casts. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending?.kind === "castFree" ? { type: "chooseMay", player: pid, yes: false } : { type: "passPriority", player: pid });
  }
  return s;
}

// Real oracle text (Scryfall).
const herald = card("Flamekin Herald", "Creature — Elemental Wizard", "{2}{R}", { power: "3", toughness: "2", oracleText: "Commander spells you cast have cascade. (Whenever you cast a commander, exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const abaddon = card("Abaddon the Despoiler", "Legendary Creature — Astartes Warrior", "{2}{U}{B}{R}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nMark of Chaos Ascendant — During your turn, spells you cast from your hand with mana value X or less have cascade, where X is the total amount of life your opponents have lost this turn." });
const marauder = card("Bloodbraid Marauder", "Creature — Human Berserker", "{1}{R}", { power: "3", toughness: "1", keywords: ["Delirium"], oracleText: "This creature can't block.\nDelirium — This spell has cascade as long as there are four or more card types among cards in your graveyard. (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const tardis = card("TARDIS", "Artifact — Vehicle", "{2}", { power: "2", toughness: "4", keywords: ["Flying", "Crew"], oracleText: "Flying\nWhenever this Vehicle attacks, if you control a Time Lord, the next spell you cast this turn has cascade and you may planeswalk.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const doctor = card("Test Doctor", "Legendary Creature — Time Lord Doctor", "{2}{W}", { power: "2", toughness: "2", subtypes: ["Time Lord", "Doctor"] });

const giant = card("Hill Giant Test", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3" });
const ogre = card("Ogre Test", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });
const bolt = card("Test Instant", "Instant", "{R}", { oracleText: "Draw a card." });
const sorcery = card("Test Sorcery", "Sorcery", "{U}", { oracleText: "Draw a card." });
const relic = card("Test Relic", "Artifact", "{1}");

function trigger(s: GameState, pid: PlayerId, id: string, index: number) {
  const ifCond = compileCard(s.cards[s.objects[id]!.cardId]!).triggers[index]!.ifCond;
  s.triggerQueue.push({ sourceId: id, sourceCardId: s.objects[id]!.cardId, controller: pid, index, sourceZc: s.objects[id]!.zoneChanges ?? 0, ...(ifCond ? { ifCond } : {}) });
  return settle(s);
}

describe("more cascade grants", () => {
  it("parse", () => {
    supported(herald, abaddon, marauder, tardis);
    expect(compileCard(herald).spellsHaveCascade).toEqual([expect.objectContaining({ commander: true })]);
    expect(compileCard(abaddon).spellsHaveCascade).toEqual([expect.objectContaining({ from: "hand", yourTurn: true, maxMv: { count: { kind: "opponentsLifeLost" } } })]);
    expect(compileCard(marauder).triggers[0]).toMatchObject({ event: "selfCast", activeIf: { kind: "graveyardTypes" } });
  });

  it("Flamekin Herald: your commander cast from the command zone cascades; another creature spell doesn't", () => {
    const { s: s0, ap, ids } = setup([giant]);
    putOnBattlefield(s0, ap, herald);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(0);
    const cmd = s.players[ap]!.command[0]!;
    s = settle(run(s, planCast(s, ap, cmd)));
    expect(cascades(s)).toBe(1);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
  });

  it("Abaddon: from your hand, mana value at most the life your opponents lost this turn, during your turn", () => {
    const { s: s0, ap, ids } = setup([giant, ogre, bolt]);
    putOnBattlefield(s0, ap, abaddon);
    const [o1, o2] = s0.turnOrder.filter((p) => p !== ap);
    loseLife(s0, o1!, 2);
    loseLife(s0, ap, 5); // not an opponent's
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(0); // 3 > 2
    loseLife(s, o2!, 1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(0); // 4 > 3
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(cascades(s)).toBe(1); // 1 <= 3
  });

  it("Abaddon: not on another player's turn", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    putOnBattlefield(s0, ap, abaddon);
    const other = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = s0;
    for (let i = 0; i < 400 && !(s.activePlayer === other && s.step === "upkeep"); i++) s = act(s, s.pending?.kind === "declareAttackers" ? { type: "declareAttackers", player: waitingOn(s)!, attacks: [] } : s.pending?.kind === "declareBlockers" ? ({ type: "declareBlockers", player: waitingOn(s)!, blocks: [] } as never) : s.pending?.kind === "discardToHandSize" ? { type: "discard", player: waitingOn(s)!, objectIds: s.players[waitingOn(s)!]!.hand.slice(0, s.pending.count) } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.activePlayer).toBe(other);
    loseLife(s, other, 5);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(cascades(s)).toBe(0);
  });

  it("Bloodbraid Marauder: cascade only with four card types in your graveyard", () => {
    const { s: s0, ap, ids } = setup([marauder, marauder]);
    const toYard = (s: GameState, d: CardDef) => moveObject(s, putOnBattlefield(s, ap, d), "graveyard");
    for (const d of [forest, bear(), relic]) toYard(s0, d);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(0);
    toYard(s, sorcery);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
  });

  it("TARDIS: with a Time Lord, the next spell you cast this turn has cascade; without one, nothing", () => {
    const { s: s0, ap, ids } = setup([giant, giant]);
    const t = putOnBattlefield(s0, ap, tardis);
    const at = compileCard(tardis).triggers.findIndex((x) => x.event === "selfAttacks");
    let s = trigger(s0, ap, t, at);
    expect(s.nextCast ?? []).toHaveLength(0);
    putOnBattlefield(s, ap, doctor);
    s = trigger(s, ap, t, at);
    expect(s.nextCast).toHaveLength(1);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(cascades(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
  });
});

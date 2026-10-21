// Round 101: "If this is the second time this ability has resolved this turn" (Omnath, Locus of Creation, Scythecat Cub,
// Rumor Gatherer): counted for this object's ability as it resolves, this time included; a new object starts over
// (CR 400.7).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const toHand = (s: GameState, pid: PlayerId, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
};
/** Play a Forest from hand (allowing another land drop), and resolve what it triggers, choosing `targets` when asked. */
function landfall(s: GameState, pid: PlayerId, targets: string[] = []) {
  const id = putOnBattlefield(s, pid, forest);
  toHand(s, pid, id);
  s.players[pid]!.landsPlayedThisTurn = 0;
  s = act(s, { type: "playLand", player: pid, objectId: id });
  if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pid, targets: targets.map((t) => ({ kind: "object", id: t })) });
  return settle(s);
}

// Real oracle text (Scryfall).
const omnath = card("Omnath, Locus of Creation", "Legendary Creature — Elemental", "{R}{G}{W}{U}", {
  power: "4",
  toughness: "4",
  oracleText:
    "When Omnath enters, draw a card.\nLandfall — Whenever a land you control enters, you gain 4 life if this is the first time this ability has resolved this turn. If it's the second time, add {R}{G}{W}{U}. If it's the third time, Omnath deals 4 damage to each opponent and each planeswalker you don't control.",
});
const cub = card("Scythecat Cub", "Creature — Cat", "{1}{G}", {
  power: "2",
  toughness: "2",
  keywords: ["Trample"],
  oracleText:
    "Trample\nLandfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control. If this is the second time this ability has resolved this turn, double the number of +1/+1 counters on that creature instead.",
});
const gatherer = card("Rumor Gatherer", "Creature — Human Advisor", "{1}{W}", {
  power: "2",
  toughness: "1",
  oracleText: "Alliance — Whenever another creature you control enters, scry 1. If this is the second time this ability has resolved this turn, draw a card instead.",
});

describe("round 101: the Nth time this ability has resolved this turn", () => {
  it("parses", () => {
    for (const c of [omnath, cub, gatherer]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Omnath: 4 life the first time, mana the second, 4 damage to each opponent the third, nothing after", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omnath);
    const life = s0.players[ap]!.life;
    const oppLife = s0.players[opp]!.life;
    let s = landfall(s0, ap);
    expect(s.players[ap]!.life).toBe(life + 4);
    s = landfall(s, ap);
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(s.players[ap]!.manaPool.R).toBeGreaterThanOrEqual(1);
    expect(s.players[ap]!.manaPool.U).toBeGreaterThanOrEqual(1);
    s = landfall(s, ap);
    expect(s.players[opp]!.life).toBe(oppLife - 4);
    s = landfall(s, ap);
    expect(s.players[opp]!.life).toBe(oppLife - 4);
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Scythecat Cub: a counter the first time, doubled instead the second", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cub);
    let s = landfall(s0, ap, [c]);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    s = landfall(s, ap, [c]);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
    s = landfall(s, ap, [c]);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(3);
  });

  it("the count starts over the next turn", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cub);
    let s = landfall(s0, ap, [c]);
    s.turn++;
    s = landfall(s, ap, [c]);
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
  });

  it("Rumor Gatherer: scry the first time, a card instead of the scry the second", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, gatherer);
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    for (let i = 0; i < 2; i++) {
      const b = putOnBattlefield(s, ap, bear());
      toHand(s, ap, b);
      for (const a of planCast(s, ap, b, [])!) s = act(s, a);
      s = settle(s);
      if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
      s.battlefield.forEach((id) => (s.objects[id]!.tapped = false));
    }
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

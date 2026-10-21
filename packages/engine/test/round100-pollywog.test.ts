// Round 100: Pollywog Prodigy: "Whenever an opponent casts a noncreature spell with mana value less than this creature's
// power, draw a card." The power as the spell is cast; strictly less (CR 107.1).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const pollywog = card("Pollywog Prodigy", "Creature — Frog Wizard", "{1}{U}", { power: "1", toughness: "3", keywords: ["Evolve"], oracleText: "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever an opponent casts a noncreature spell with mana value less than this creature's power, draw a card." });
const one = card("Ancestral Recall", "Instant", "{U}", { oracleText: "Target player draws three cards." });
const two = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Pollywog Prodigy", () => {
  it("parse", () => expect(isFullySupported(pollywog)).toBe(true));

  it("draws for an opponent's spell with mana value less than its power, not equal", () => {
    const { s: s0, ap, opp, ids } = setup([one, two]);
    const p = putOnBattlefield(s0, opp, pollywog);
    s0.objects[p]!.counters["+1/+1"] = 2; // a 3/5
    const cards = s0.players[opp]!.hand.length;
    let s = planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])!.reduce((x, a) => act(x, a), s0);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(cards + 1);
    s = settle(planCast(s, ap, ids[1]!)!.reduce((x, a) => act(x, a), s)); // mana value 3: not less than 3
    expect(s.players[opp]!.hand.length).toBe(cards + 1);
  });
});

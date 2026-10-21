// Round 102: Ad Nauseam ("you may repeat this process any number of times": decided after each card, rulings; life can
// go to 0 or less meanwhile, the loss waits for state-based actions, CR 704.3, 704.5a).

import { describe, expect, it } from "vitest";
import { act, card, setup } from "./helpers";
import { defOf, isFullySupported, planCast, waitingOn, type GameState } from "../src";
import { defMv } from "../src/faces";

// Real oracle text (Scryfall).
const nauseam = card("Ad Nauseam", "Instant", "{3}{B}{B}", { oracleText: "Reveal the top card of your library and put that card into your hand. You lose life equal to its mana value. You may repeat this process any number of times." });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};

describe("round 102: Ad Nauseam", () => {
  it("parse", () => expect(isFullySupported(nauseam)).toBe(true));

  it("a card and its mana value in life each time, as many times as you like", () => {
    const { s: s0, ap, ids } = setup([nauseam]);
    const top = s0.players[ap]!.library.slice(0, 3);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, y) => act(x, y), s0));
    for (const yes of [true, true, false]) {
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, repeat: true });
      s = settle(act(s, { type: "chooseMay", player: ap, yes }));
    }
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
    for (const id of top) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(40 - top.reduce((n, id) => n + defMv(defOf(s, s.objects[id]!)), 0));
  });

  it("going on at 0 life or less: the player loses once it's done", () => {
    const { s: s0, ap, ids } = setup([nauseam]);
    s0.players[ap]!.life = 1;
    const bear = s0.players[ap]!.library.find((id) => defMv(defOf(s0, s0.objects[id]!)) > 0)!;
    s0.players[ap]!.library = [bear, ...s0.players[ap]!.library.filter((id) => id !== bear)];
    let s = settle(planCast(s0, ap, ids[0]!)!.reduce((x, y) => act(x, y), s0));
    expect(s.players[ap]!.life).toBeLessThanOrEqual(0);
    expect(s.players[ap]!.lost).toBeFalsy();
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.lost).toBe(true);
  });
});

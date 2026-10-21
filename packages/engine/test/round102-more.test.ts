// Round 102: Ad Nauseam ("you may repeat this process any number of times": decided after each card, rulings; life can
// go to 0 or less meanwhile, the loss waits for state-based actions, CR 704.3, 704.5a). Scroll Rack (cards from the
// hand traded for as many from the top of the library, not drawn: rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { defOf, isFullySupported, planActivate, planCast, waitingOn, type GameState } from "../src";
import { defMv } from "../src/faces";

// Real oracle text (Scryfall).
const nauseam = card("Ad Nauseam", "Instant", "{3}{B}{B}", { oracleText: "Reveal the top card of your library and put that card into your hand. You lose life equal to its mana value. You may repeat this process any number of times." });

const rack = card("Scroll Rack", "Artifact", "{2}", { oracleText: "{1}, {T}: Exile any number of cards from your hand face down. Put that many cards from the top of your library into your hand. Then look at the exiled cards and put them on top of your library in any order." });
const sage = card("Sage of Lat-Nam Test", "Creature — Human", "{1}{U}", { power: "1", toughness: "1", oracleText: "Whenever you draw a card, you gain 1 life." });

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

describe("round 102: Scroll Rack", () => {
  it("parse", () => expect(isFullySupported(rack)).toBe(true));

  it("trades the chosen cards for the top ones, which aren't drawn; the first pick ends on top", () => {
    const { s: s0, ap, ids } = setup([nauseam, nauseam, nauseam]);
    const r = putOnBattlefield(s0, ap, rack);
    putOnBattlefield(s0, ap, sage);
    const top = s0.players[ap]!.library.slice(0, 2);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(planActivate(s0, ap, r, 0)!.reduce((x, y) => act(x, y), s0));
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, count: hand, upTo: true });
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!, ids[0]!] }));
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([ids[1]!, ids[0]!]);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([...top, ids[2]!]));
    expect(s.players[ap]!.hand).toHaveLength(hand);
    expect(s.players[ap]!.life).toBe(40); // not drawn
    expect(s.objects[ids[0]!]!.hiddenExile).toBeUndefined();
  });

  it("with a short library, as many as it has; none chosen does nothing", () => {
    const { s: s0, ap, ids } = setup([nauseam, nauseam]);
    const r = putOnBattlefield(s0, ap, rack);
    const one = s0.players[ap]!.library[0]!;
    s0.players[ap]!.library = [one];
    let s = settle(planActivate(s0, ap, r, 0)!.reduce((x, y) => act(x, y), s0));
    const rest = s.players[ap]!.hand.filter((id) => id !== ids[0] && id !== ids[1]);
    s = settle(act(s, { type: "handToTop", player: ap, objectIds: [ids[0]!, ids[1]!] }));
    expect(s.players[ap]!.hand.sort()).toEqual([...rest, one].sort());
    expect(s.players[ap]!.library).toEqual([ids[0]!, ids[1]!]);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
});

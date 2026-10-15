// Ward—Discard a card (CR 702.21a): "counter it unless that player discards a card".

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const regent = card("Westgate Regent", "Creature — Vampire", "{3}{B}{B}", {
  power: "4",
  toughness: "4",
  keywords: ["Flying", "Ward"],
  oracleText: "Flying\nWard—Discard a card. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card.)\nWhenever this creature deals combat damage to a player, put that many +1/+1 counters on it.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** Shock the opponent's Regent and pass until its ward asks for the discard. */
function shockRegent(hand: number) {
  const { s: s0, ap, opp, ids } = setup([shock, ...Array.from({ length: hand }, () => card("Filler", "Instant", "{U}", { oracleText: "Draw a card." }))]);
  const r = putOnBattlefield(s0, opp, regent);
  // Only the Shock and `hand` other cards in hand.
  const p = s0.players[ap]!;
  for (const id of p.hand.filter((x) => !ids.includes(x))) {
    s0.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = [...ids];
  let s = cast(s0, ap, ids[0]!, [{ kind: "object", id: r }]);
  for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, r, ids };
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("ward—discard a card", () => {
  it("compiles", () => expect(isFullySupported(regent)).toBe(true));

  it("discarding a card keeps the spell", () => {
    let { s, ap, r, ids } = shockRegent(2);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, discard: 1 });
    s = act(s, { type: "payUnless", player: ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.objects[r]!.damage).toBe(2);
  });

  it("not discarding counters it; with no cards in hand there's no choice", () => {
    let { s, ap, r } = shockRegent(1);
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[r]!.damage).toBe(0);
    const none = shockRegent(0);
    expect(none.s.pending).toBeNull();
    expect(none.s.objects[none.r]!.damage).toBe(0);
  });

  it("bots discard to keep their spell", () => {
    let { s, ap, r } = shockRegent(2);
    for (let i = 0; i < 4 && s.pending; i++) for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(s.objects[r]!.damage).toBe(2);
  });
});

// Learn (CR 701.48a): "You may discard a card. If you do, draw a card. If you didn't discard a card, you may reveal a
// Lesson card you own from outside the game and put it into your hand." Nobody here has a sideboard (CR 100.4), so
// it's the discard-then-draw.

import { describe, expect, it } from "vitest";
import { act, card, cast, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const professor = card("Gnarled Professor", "Creature — Treefolk Druid", "{2}{G}{G}", {
  power: "5",
  toughness: "4",
  keywords: ["Trample", "Learn"],
  oracleText: "Trample\nWhen this creature enters, learn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)",
});

const toChoice = (s: GameState) => {
  for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("learn (CR 701.48a)", () => {
  it("compiles", () => expect(isFullySupported(professor)).toBe(true));

  it("you may discard a card to draw a card", () => {
    const { s: s0, ap, ids } = setup([professor]);
    let s = toChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    const yard = s.players[ap]!.graveyard.length;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    s = toChoice(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 1);
  });
});

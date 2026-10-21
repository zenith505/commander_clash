// Round 100: "Cycling {X}{1}{U}" and "When you cycle this card, create an X/X blue Shark" (Shark Typhoon): X is chosen
// as the cycling ability is activated (CR 107.3k) and the trigger uses it; X can be 0, making a 0/0 that dies (rulings).

import { describe, expect, it } from "vitest";
import { act, card, pt, setup } from "./helpers";
import { abilitiesOf, characteristics, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const shark = card("Shark Typhoon", "Enchantment", "{5}{U}", { oracleText: "Whenever you cast a noncreature spell, create an X/X blue Shark creature token with flying, where X is that spell's mana value.\nCycling {X}{1}{U} ({X}{1}{U}, Discard this card: Draw a card.)\nWhen you cycle this card, create an X/X blue Shark creature token with flying." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const sharks = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Shark"));

describe("round 100: Shark Typhoon", () => {
  it("parse", () => {
    expect(isFullySupported(shark)).toBe(true);
  });

  it("cycling for X = 3 makes a 3/3 flying Shark and draws a card", () => {
    const { s: s0, ap, ids } = setup([shark]);
    s0.players[ap]!.manaPool.U = 2;
    s0.players[ap]!.manaPool.C = 3;
    const index = abilitiesOf(s0, s0.objects[ids[0]!]!).activated.findIndex((a) => a.cycling);
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    for (const a of planActivate(s, ap, ids[0]!, index, undefined, undefined, undefined, 3)!) s = act(s, a);
    s = settle(s);
    expect(sharks(s)).toHaveLength(1);
    expect(pt(s, sharks(s)[0]!)).toBe("3/3");
    expect(s.players[ap]!.hand.length).toBe(hand); // discarded one, drew one
  });

  it("X = 0: a 0/0 Shark that dies at once", () => {
    const { s: s0, ap, ids } = setup([shark]);
    s0.players[ap]!.manaPool.U = 2;
    const index = abilitiesOf(s0, s0.objects[ids[0]!]!).activated.findIndex((a) => a.cycling);
    let s = s0;
    for (const a of planActivate(s, ap, ids[0]!, index, undefined, undefined, undefined, 0)!) s = act(s, a);
    s = settle(s);
    expect(sharks(s)).toHaveLength(0);
    expect(s.log.some((l) => /creates a 0\/0 Shark/.test(l.text))).toBe(true);
  });
});

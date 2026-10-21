// Round 100: Notion Thief: "If an opponent would draw a card except the first one they draw in each of their draw steps,
// instead that player skips that draw and you draw a card." (CR 614.1a, 614.5; rulings)

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const thief = card("Notion Thief", "Creature — Human Rogue", "{2}{U}{B}", { power: "3", toughness: "1", keywords: ["Flash"], oracleText: "Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const peek = card("Careful Study", "Sorcery", "{U}", { oracleText: "Draw two cards, then discard two cards." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const hand = (s: GameState, p: PlayerId) => s.players[p]!.hand.length;

describe("round 100: Notion Thief", () => {
  it("parse", () => expect(isFullySupported(thief)).toBe(true));

  it("an opponent's draws go to the Thief's controller instead", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, thief);
    const [mine, theirs] = [hand(s0, ap), hand(s0, opp)];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(hand(s, ap)).toBe(mine - 1);
    expect(hand(s, opp)).toBe(theirs + 2);
  });

  it("the player still does the rest of what they were told (discarding) (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([peek, divination]);
    putOnBattlefield(s0, opp, thief);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
  });

  it("not the first card drawn in their own draw step, nor its controller's own draws", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, thief);
    const third = nextAfter(s0, opp);
    const before = hand(s0, opp);
    let s = passUntil(s0, "main1", opp);
    expect(hand(s, opp)).toBe(before + 1);
    s = passUntil(s, "main1", third);
    expect(s.log.some((e) => /skips that draw/.test(e.text))).toBe(false);
  });
});

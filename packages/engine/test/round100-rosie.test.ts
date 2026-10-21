// Round 100: "target creature you control other than ~" (Rosie Cotton of South Lane) is another target creature you
// control; "each creature you control other than this creature" (Dawnstrike Vanguard). Rosie triggers once for each token
// created, and may target a creature token just made (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const rosie = card("Rosie Cotton of South Lane", "Legendary Creature — Halfling Peasant", "{2}{W}", { power: "1", toughness: "1", oracleText: "When Rosie Cotton enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton." });
const dawnstrike = card("Dawnstrike Vanguard", "Creature — Human Knight", "{5}{W}", { power: "4", toughness: "5", keywords: ["Lifelink"], oracleText: "Lifelink\nAt the beginning of your end step, if you control two or more tapped creatures, put a +1/+1 counter on each creature you control other than this creature." });
const raise = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: other than ~", () => {
  it("parse", () => {
    for (const d of [rosie, dawnstrike]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Rosie: one trigger per token; can't target Rosie, can target a token just made", () => {
    const { s: s0, ap, ids } = setup([raise]);
    const r = putOnBattlefield(s0, ap, rosie);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.W = 2;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(r)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const soldier = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(soldier)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[soldier]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[r]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

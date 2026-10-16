// Shadow the Hedgehog: "Each spell you cast has split second if mana from an artifact was spent to cast it" (CR 702.61a,
// 106.3), and "Whenever ~ or another creature you control with flash or haste dies, draw a card" (a filter met by either
// keyword).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, moveObject, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const shadow = card("Shadow the Hedgehog", "Legendary Creature — Hedgehog Mercenary", "{B}{B}{R}{R}", { power: "4", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nWhenever Shadow the Hedgehog or another creature you control with flash or haste dies, draw a card.\nChaos Control — Each spell you cast has split second if mana from an artifact was spent to cast it. (As long as it's on the stack, players can't cast spells or activate abilities that aren't mana abilities.)" });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });
const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const shock = card("Shock Test", "Instant", "{R}", { oracleText: "~ deals 2 damage to any target." });

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Give `pid` a Shock in hand and priority: why can't they cast it now (null if they can)? */
function shockProblem(s: GameState, pid: PlayerId): string | null {
  const id = putOnBattlefield(s, pid, shock);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  const priority = s.priority;
  s.priority = pid;
  const p = castProblem(s, pid, id, [{ kind: "player", id: pid }]);
  s.priority = priority;
  return p;
}

describe("Shadow the Hedgehog", () => {
  it("parse", () => expect(isFullySupported(shadow)).toBe(true));

  it("a spell cast with mana from an artifact has split second; one cast with lands doesn't", () => {
    const { s: s0, ap, opp, ids } = setup([giant, giant]);
    putOnBattlefield(s0, ap, shadow);
    const t = putOnBattlefield(s0, ap, treasure);
    let s = act(s0, { type: "activateMana", player: ap, objectId: t, mana: "R" });
    s = run(s, planCast(s, ap, ids[0]!));
    expect(s.stack).toHaveLength(1);
    expect(shockProblem(s, opp)).toMatch(/split second/);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.stack).toHaveLength(1);
    expect(shockProblem(s, opp)).not.toMatch(/split second/);
  });

  it("an opponent's spell paid with an artifact's mana doesn't get it", () => {
    const { s: s0, ap, opp, ids } = setup([giant]);
    putOnBattlefield(s0, opp, shadow);
    const t = putOnBattlefield(s0, ap, treasure);
    let s = act(s0, { type: "activateMana", player: ap, objectId: t, mana: "R" });
    s = run(s, planCast(s, ap, ids[0]!));
    expect(shockProblem(s, opp)).not.toMatch(/split second/);
  });

  it("draws when another creature you control with haste dies, not one without", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, shadow);
    const fast = putOnBattlefield(s0, ap, bear({ name: "Fast Bear", keywords: ["Haste"], oracleText: "Haste" }));
    const slow = putOnBattlefield(s0, ap, bear({ name: "Slow Bear" }));
    const hand = s0.players[ap]!.hand.length;
    moveObject(s0, slow, "graveyard");
    let s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.players[ap]!.hand.length).toBe(hand);
    moveObject(s, fast, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

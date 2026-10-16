// Epic (CR 702.50a-b): as the spell resolves, its controller can't cast spells for the rest of the game, and at the
// beginning of each of their upkeeps a copy of it (without epic) goes on the stack. Lands and abilities stay usable.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const swarm = card("Endless Swarm", "Sorcery", "{5}{G}{G}{G}", { keywords: ["Epic"], oracleText: "Create a 1/1 green Snake creature token for each card in your hand.\nEpic (For the rest of the game, you can't cast spells. At the beginning of each of your upkeeps, copy this spell except for its epic ability.)" });
const ideal = card("Enduring Ideal", "Sorcery", "{5}{W}{W}", { keywords: ["Epic"], oracleText: "Search your library for an enchantment card, put it onto the battlefield, then shuffle.\nEpic (For the rest of the game, you can't cast spells. At the beginning of each of your upkeeps, copy this spell except for its epic ability.)" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const snakes = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;

describe("epic", () => {
  it("parses", () => {
    expect(isFullySupported(swarm)).toBe(true);
    expect(isFullySupported(ideal)).toBe(true);
  });

  it("Endless Swarm: no more spells for the rest of the game, and a copy at each of your upkeeps", () => {
    const { s: s0, ap, ids } = setup([swarm, bear(), bear()]);
    for (let i = 0; i < 8; i++) putOnBattlefield(s0, ap, forest);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    expect(snakes(s, ap)).toBe(hand);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(castProblem(s, ap, ids[1]!)).toMatch(/Endless Swarm: you can't cast spells for the rest of the game/);
    // The next upkeep: a copy, counting the cards in hand as it resolves (before the draw step).
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    const hand2 = s.players[ap]!.hand.length;
    expect(snakes(s, ap)).toBe(hand + hand2);
    expect(s.log.some((e) => /copies Endless Swarm/.test(e.text))).toBe(true);
    // Only one copy each upkeep (the copy has no epic), and again the turn after.
    s = settle(passUntil(passUntil(s, "end", ap), "upkeep", ap));
    expect(snakes(s, ap)).toBe(hand + hand2 + s.players[ap]!.hand.length);
    expect((s.delayed ?? []).filter((d) => d.when === "eachYourUpkeep")).toHaveLength(1);
    expect(castProblem(s, ap, ids[1]!)).toMatch(/can't cast spells/);
  });

  it("bots keep an epic spell for their last spell", () => {
    const { s: s0, ap, ids } = setup([swarm, bear()]);
    for (let i = 0; i < 8; i++) putOnBattlefield(s0, ap, forest);
    s0.players[ap]!.hand = [...ids];
    s0.players[ap]!.command = [];
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    s0.players[ap]!.hand = [ids[0]!];
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(true);
  });
});

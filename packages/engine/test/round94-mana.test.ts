// Round 94 mana: Arena of Glory, Generator Servant and Hall of the Bandit Lord ("if any of that mana is spent on a
// creature spell, it gains haste": any part of its total cost, the spell and the creature it becomes, rulings), and
// exert as a cost of a mana ability (CR 701.43a).

import { describe, expect, it } from "vitest";
import { act, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, objHasKeyword, planCast, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const arena = card("Arena of Glory", "Land", "", { keywords: ["Exert"], oracleText: "This land enters tapped unless you control a Mountain.\n{T}: Add {R}.\n{R}, {T}, Exert this land: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn. (An exerted permanent won't untap during your next untap step.)" });
const servant = card("Generator Servant", "Creature — Elemental", "{1}{R}", { power: "2", toughness: "1", oracleText: "{T}, Sacrifice this creature: Add {C}{C}. If any of that mana is spent on a creature spell, it gains haste until end of turn. (That creature can attack and {T} as soon as it comes under your control.)" });
const hall = card("Hall of the Bandit Lord", "Legendary Land", "", { oracleText: "Hall of the Bandit Lord enters tapped.\n{T}, Pay 3 life: Add {C}. If that mana is spent on a creature spell, it gains haste." });
const ogre = card("Hill Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const resolve = (s: GameState) => {
  for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: s.priority! });
  return s;
};

describe("mana that gives haste", () => {
  it("parse", () => {
    for (const d of [arena, servant, hall]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Arena of Glory: exerted for {R}{R}; the creature spell it pays for gains haste until end of turn", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const a = putOnBattlefield(s0, ap, arena);
    const m = s0.battlefield.find((id) => s0.objects[id]!.cardId === mountain.oracleId)!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: a, mana: "R", ability: 1 });
    expect(s.players[ap]!.manaPool.R).toBe(2);
    expect(s.objects[a]!.skipNextUntap).toBe(true);
    s = resolve(run(s, planCast(s, ap, ids[0]!)));
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    // Until end of turn only, and Arena stays tapped through its controller's next untap step.
    s = passUntil(s, "upkeep", ap);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
    expect(s.objects[a]!.tapped).toBe(true);
  });

  it("spent on a noncreature spell, the mana gives nothing; a creature cast with other mana has no haste", () => {
    const { s: s0, ap, ids } = setup([shock, ogre]);
    const a = putOnBattlefield(s0, ap, arena);
    const m = s0.battlefield.find((id) => s0.objects[id]!.cardId === mountain.oracleId)!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: a, mana: "R", ability: 1 });
    s = resolve(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: (ap + 1) % 4 }])));
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.players[ap]!.manaLots?.[0]?.haste).toBe("endOfTurn");
    s.players[ap]!.manaPool.R = 0;
    s.players[ap]!.manaLots = undefined;
    s = resolve(run(s, planCast(s, ap, ids[1]!)));
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Haste")).toBe(false);
  });

  it("Generator Servant: sacrificed for {C}{C}, haste until end of turn", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const g = putOnBattlefield(s0, ap, servant);
    let s = act(s0, { type: "activateMana", player: ap, objectId: g, mana: "C" });
    expect(s.objects[g]!.zone).toBe("graveyard");
    s = resolve(run(s, planCast(s, ap, ids[0]!)));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
  });

  it("Hall of the Bandit Lord: the haste doesn't wear off", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const h = putOnBattlefield(s0, ap, hall);
    let s = act(s0, { type: "activateMana", player: ap, objectId: h, mana: "C" });
    expect(s.players[ap]!.life).toBe(37);
    s = resolve(run(s, planCast(s, ap, ids[0]!)));
    s = passUntil(s, "upkeep", ap);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
  });
});

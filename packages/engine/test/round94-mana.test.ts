// Round 94 mana: Arena of Glory, Generator Servant and Hall of the Bandit Lord ("if any of that mana is spent on a
// creature spell, it gains haste": any part of its total cost, the spell and the creature it becomes, rulings), and
// exert as a cost of a mana ability (CR 701.43a).

import { describe, expect, it } from "vitest";
import { act, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { colorCombos, isFullySupported, manaOptions, moveObject, objHasKeyword, planCast, planManaAbility, waitingOn, type Action, type GameState, type ManaType } from "../src";

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

// "X mana in any combination of colors" (CR 106.1b, 605.3b): Selvala, Heart of the Wilds, Sage of the Maze, Axebane Guardian.
const selvala = card("Selvala, Heart of the Wilds", "Legendary Creature — Elf Scout", "{1}{G}{G}", { power: "2", toughness: "3", oracleText: "Whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power.\n{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control." });
const sage = card("Sage of the Maze", "Creature — Elf Wizard", "{2}{G}", { power: "1", toughness: "3", oracleText: "{T}: Add two mana in any combination of colors.\n{T}: Until end of turn, target land you control becomes an X/X Citizen creature with haste in addition to its other types, where X is twice the number of Gates you control. Activate only as a sorcery." });
const axebane = card("Axebane Guardian", "Creature — Human Druid", "{2}{G}", { power: "0", toughness: "3", keywords: ["Defender"], oracleText: "Defender\n{T}: Add X mana in any combination of colors, where X is the number of creatures you control with defender." });
const geoscope = card("Prismatic Geoscope", "Artifact", "{5}", { keywords: ["Domain"], oracleText: "This artifact enters tapped.\nDomain — {T}: Add X mana in any combination of colors, where X is the number of basic land types among lands you control." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "5", toughness: "5" });
const wall = card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"] });
const rainbow = card("Rainbow Test", "Sorcery", "{W}{U}{B}", { oracleText: "Draw a card." });

describe("mana in any combination of colors", () => {
  it("parse", () => {
    for (const d of [selvala, sage, axebane, geoscope]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Selvala: X is the greatest power among your creatures, in the colors chosen", () => {
    const { s: s0, ap } = setup([]);
    const sv = putOnBattlefield(s0, ap, selvala);
    putOnBattlefield(s0, ap, giant);
    const want: ManaType[] = ["W", "U", "U", "B", "G"];
    const combo = colorCombos(5).findIndex((c) => c.join() === want.join());
    const plan = planManaAbility(s0, ap, sv, 0, "W", undefined, undefined, combo);
    const s = run(s0, plan);
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 1, U: 2, B: 1, G: 1, R: 0 }); // the {G} it cost came from a Forest
    expect(s.objects[sv]!.tapped).toBe(true);
  });

  it("automatic payment uses the combination the cost needs", () => {
    const { s: s0, ap, ids } = setup([rainbow]);
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap || s0.cards[s0.objects[id]!.cardId]!.name === "Forest");
    putOnBattlefield(s0, ap, selvala);
    putOnBattlefield(s0, ap, giant);
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan).not.toBeNull();
    const s = run(s0, plan);
    expect(s.stack).toHaveLength(1);
  });

  it("Sage of the Maze: two mana; Axebane Guardian: one for each creature with defender", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, sage);
    const a = putOnBattlefield(s0, ap, axebane);
    putOnBattlefield(s0, ap, wall);
    const s1 = act(s0, { type: "activateMana", player: ap, objectId: g, mana: "B", ability: 0, combo: colorCombos(2).findIndex((c) => c.join() === "B,R") });
    expect(s1.players[ap]!.manaPool).toMatchObject({ B: 1, R: 1 });
    expect(manaOptions(s0, s0.objects[a]!).map((x) => x.adds.length)).toEqual(Array(15).fill(2));
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: a, mana: "W", ability: 0, combo: 99 })).toThrow();
  });

  it("Selvala's trigger: the entering creature's controller may draw if it's the most powerful creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, selvala);
    const g = putOnBattlefield(s0, opp, giant);
    s0.battlefield = s0.battlefield.filter((id) => id !== g);
    s0.objects[g]!.zone = "hand";
    s0.players[opp]!.hand.push(g);
    const hand = s0.players[opp]!.hand.length;
    let s = act(s0, { type: "passPriority", player: ap }); // nothing: just to have a state to move from
    moveObject(s, g, "battlefield", { controller: opp });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.players[opp]!.hand.length).toBe(hand); // the Giant left the hand, a card came in
    // A 2/2 doesn't beat Selvala's 2 power: no one may draw.
    const b = putOnBattlefield(s, opp, card("Bear Cub", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s.battlefield = s.battlefield.filter((id) => id !== b);
    s.objects[b]!.zone = "hand";
    moveObject(s, b, "battlefield", { controller: opp });
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toBeNull();
  });
});

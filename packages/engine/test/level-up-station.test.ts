// Level up (CR 702.87) and leveler cards (CR 711); station (CR 702.184) and station cards (CR 721). A level or station
// symbol is a static ability: while the permanent has that many level or charge counters, it has the striation's
// abilities and power/toughness box (for a station card, it's also a creature).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { abilityProblem, botActions, compileCard, isFullySupported, moveObject, objHasKeyword, objIsType, planActivate, power, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const use = (s: GameState, pid: PlayerId, id: string, index: number, tap?: string[]) => {
  const plan = planActivate(s, pid, id, index, undefined, undefined, tap);
  if (!plan) throw new Error("can't activate");
  return plan.reduce((x, a) => act(x, a), s);
};
const counters = (s: GameState, id: string, kind: string, n: number) => {
  s.objects[id]!.counters[kind] = n;
  invalidateCharacteristics(s);
  return s;
};

// Real oracle text (Scryfall).
const student = card("Student of Warfare", "Creature — Human Knight", "{W}", { power: "1", toughness: "1", keywords: ["First strike", "Level Up", "Double strike"], oracleText: "Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-6\n3/3\nFirst strike\nLEVEL 7+\n4/4\nDouble strike" });
const coralhelm = card("Coralhelm Commander", "Creature — Merfolk Soldier", "{U}{U}", { power: "2", toughness: "2", keywords: ["Flying", "Level Up"], oracleText: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n3/3\nFlying\nLEVEL 4+\n4/4\nFlying\nOther Merfolk creatures you control get +1/+1." });
const brimstone = card("Brimstone Mage", "Creature — Human Shaman", "{2}{R}", { power: "2", toughness: "2", keywords: ["Level Up"], oracleText: "Level up {3}{R} ({3}{R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-2\n2/3\n{T}: This creature deals 1 damage to any target.\nLEVEL 3+\n2/4\n{T}: This creature deals 3 damage to any target." });
const sawship = card("Galvanizing Sawship", "Artifact — Spacecraft", "{5}{R}", { power: "6", toughness: "5", keywords: ["Station"], oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 3+.)\n3+ | Flying, haste" });
const frigate = card("Lumen-Class Frigate", "Artifact — Spacecraft", "{1}{W}", { power: "3", toughness: "5", keywords: ["Station"], oracleText: "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 12+.)\n2+ | Other creatures you control get +1/+1.\n12+ | Flying, lifelink" });
const evendo = card("Evendo, Waking Haven", "Land — Planet", "", { keywords: ["Station"], oracleText: "This land enters tapped.\n{T}: Add {G}.\nStation (Tap another creature you control: Put charge counters equal to its power on this Planet. Station only as a sorcery.)\n12+ | {G}, {T}: Add {G} for each creature you control." });
const merfolk = card("Merfolk Test", "Creature — Merfolk", "{U}", { power: "1", toughness: "1" });
const wall = card("Wall Test", "Creature — Wall", "{1}", { power: "0", toughness: "4" });

describe("level up", () => {
  it("each level symbol gives its power/toughness box and abilities only in its range (CR 711.2, 711.5)", () => {
    supported(student, coralhelm, brimstone);
    let { s } = setup([]);
    const ap = s.activePlayer;
    const id = putOnBattlefield(s, ap, student);
    expect(pt(s, id)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[id]!, "First strike")).toBe(false);
    s = passAll(use(s, ap, id, 0));
    expect(s.objects[id]!.counters.level).toBe(1);
    expect(pt(s, id)).toBe("1/1");
    s = passAll(use(s, ap, id, 0));
    expect(pt(s, id)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[id]!, "First strike")).toBe(true);
    s = counters(s, id, "level", 7);
    expect(pt(s, id)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[id]!, "First strike")).toBe(false);
    expect(objHasKeyword(s, s.objects[id]!, "Double strike")).toBe(true);
  });

  it("level up only as a sorcery", () => {
    const { s: s0 } = setup([]);
    const ap = s0.activePlayer;
    const id = putOnBattlefield(s0, ap, student);
    const s = passUntil(s0, "beginCombat", ap);
    expect(abilityProblem(s, ap, id, 0)).toMatch(/sorcery/);
  });

  it("a level's static ability affects others only at that level; a level's activated ability only then", () => {
    let { s } = setup([]);
    const ap = s.activePlayer;
    const c = putOnBattlefield(s, ap, coralhelm);
    const m = putOnBattlefield(s, ap, merfolk);
    expect(pt(s, m)).toBe("1/1");
    s = counters(s, c, "level", 4);
    expect(pt(s, c)).toBe("4/4");
    expect(pt(s, m)).toBe("2/2");
    const b = putOnBattlefield(s, ap, brimstone);
    expect(compileCard(brimstone).activated.map((a) => a.activateIf)).toEqual([undefined, { kind: "selfCounters", counter: "level", min: 1, max: 2 }, { kind: "selfCounters", counter: "level", min: 3 }]);
    expect(abilityProblem(s, ap, b, 1)).toBeTruthy();
    s = counters(s, b, "level", 1);
    expect(abilityProblem(s, ap, b, 1)).toBeNull();
    expect(abilityProblem(s, ap, b, 2)).toBeTruthy();
  });
});

it("a bot levels up with spare mana after combat, but not past its last level symbol", () => {
  const { s: s0 } = setup([]);
  const ap = s0.activePlayer;
  const id = putOnBattlefield(s0, ap, student);
  s0.players[ap]!.hand = [];
  let s = s0;
  for (let i = 0; i < 300 && s.activePlayer === ap; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
  expect(s.objects[id]!.counters.level ?? 0).toBeGreaterThan(0);
  const { s: s1 } = setup([]);
  const ap1 = s1.activePlayer;
  const id1 = putOnBattlefield(s1, ap1, student);
  counters(s1, id1, "level", 7);
  s1.players[ap1]!.hand = [];
  s = s1;
  for (let i = 0; i < 300 && s.activePlayer === ap1; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
  expect(s.objects[id1]!.counters.level).toBe(7);
});

describe("station", () => {
  it("taps another creature, even a summoning-sick one, for charge counters equal to its power; a creature at 3+ (CR 721.2b)", () => {
    supported(sawship, frigate, evendo);
    let { s } = setup([]);
    const ap = s.activePlayer;
    const ship = putOnBattlefield(s, ap, sawship);
    expect(objIsType(s, s.objects[ship]!, "Creature")).toBe(false);
    expect(power(s, s.objects[ship]!)).toBe(0);
    const b = putOnBattlefield(s, ap, bear(), { sick: true });
    expect(abilityProblem(s, ap, ship, 0, undefined, undefined, [ship])).toBeTruthy();
    s = use(s, ap, ship, 0, [b]);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.log.some((l) => /stations Galvanizing Sawship with Grizzly Bears/.test(l.text))).toBe(true);
    s = passAll(s);
    expect(s.objects[ship]!.counters.charge).toBe(2);
    expect(objIsType(s, s.objects[ship]!, "Creature")).toBe(false);
    const b2 = putOnBattlefield(s, ap, bear());
    s = passAll(use(s, ap, ship, 0, [b2]));
    expect(s.objects[ship]!.counters.charge).toBe(4);
    expect(objIsType(s, s.objects[ship]!, "Creature")).toBe(true);
    expect(objIsType(s, s.objects[ship]!, "Artifact")).toBe(true);
    expect(pt(s, ship)).toBe("6/5");
    expect(objHasKeyword(s, s.objects[ship]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[ship]!, "Haste")).toBe(true);
  });

  it("only as a sorcery, and exactly one creature", () => {
    const { s: s0 } = setup([]);
    const ap = s0.activePlayer;
    const ship = putOnBattlefield(s0, ap, sawship);
    const b = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    expect(abilityProblem(s0, ap, ship, 0, undefined, undefined, [b, b2])).toBeTruthy();
    const s = passUntil(s0, "beginCombat", ap);
    expect(abilityProblem(s, ap, ship, 0, undefined, undefined, [b])).toMatch(/sorcery/);
  });

  it("the power on resolution, or its last-known power if it's gone; never fewer than none (rulings)", () => {
    let { s } = setup([]);
    const ap = s.activePlayer;
    const ship = putOnBattlefield(s, ap, frigate);
    const b = putOnBattlefield(s, ap, bear());
    s = use(s, ap, ship, 0, [b]);
    s = passAll(counters(s, b, "+1/+1", 3));
    expect(s.objects[ship]!.counters.charge).toBe(5);
    const b2 = putOnBattlefield(s, ap, bear());
    s = use(s, ap, ship, 0, [b2]);
    counters(s, b2, "+1/+1", 1);
    moveObject(s, b2, "graveyard");
    s = passAll(s);
    // The Frigate's own +1/+1 to other creatures counted in its last-known power too: 2 + 1 + 1.
    expect(s.objects[ship]!.counters.charge).toBe(9);
    const w = putOnBattlefield(s, ap, wall);
    s = passAll(use(counters(s, w, "-1/-1", 2), ap, ship, 0, [w]));
    expect(s.objects[ship]!.counters.charge).toBe(9);
  });

  it("a station symbol's static, keyword and mana abilities work only with enough charge counters", () => {
    let { s } = setup([]);
    const ap = s.activePlayer;
    const f = putOnBattlefield(s, ap, frigate);
    const b = putOnBattlefield(s, ap, bear());
    expect(pt(s, b)).toBe("2/2");
    s = counters(s, f, "charge", 2);
    expect(pt(s, b)).toBe("3/3");
    expect(objIsType(s, s.objects[f]!, "Creature")).toBe(false);
    s = counters(s, f, "charge", 12);
    expect(pt(s, f)).toBe("3/5");
    expect(objHasKeyword(s, s.objects[f]!, "Lifelink")).toBe(true);
    expect(compileCard(evendo).mana.map((m) => m.activeIf)).toEqual([undefined, { kind: "selfCounters", counter: "charge", min: 12 }]);
  });

  it("a bot stations with a creature that can't attack yet (here its commander, cast this turn, or the bear)", () => {
    const { s: s0 } = setup([]);
    const ap = s0.activePlayer;
    const ship = putOnBattlefield(s0, ap, sawship);
    putOnBattlefield(s0, ap, bear(), { sick: true });
    s0.players[ap]!.hand = [];
    s0.players[ap]!.life = 15;
    let s = s0;
    for (let i = 0; i < 300 && !(s.objects[ship]!.counters.charge ?? 0) && s.activePlayer === ap; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
    expect(s.objects[ship]!.counters.charge).toBeGreaterThanOrEqual(2);
  });
});

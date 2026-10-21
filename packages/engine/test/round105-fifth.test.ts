// Round 105, a fifth batch: Allosaurus Shepherd (base 5/5 and "becomes a Dinosaur in addition to its other creature
// types") and Fire Nation Palace (granting firebending 4).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, planActivate, power, toughness, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const shepherd = card("Allosaurus Shepherd", "Creature — Elf Shaman", "{G}", { power: "1", toughness: "1", oracleText: "This spell can't be countered.\nGreen spells you control can't be countered.\n{4}{G}{G}: Until end of turn, each Elf creature you control has base power and toughness 5/5 and becomes a Dinosaur in addition to its other creature types." });
const palace = card("Fire Nation Palace", "Land", "", { oracleText: "This land enters tapped unless you control a basic land.\n{T}: Add {R}.\n{1}{R}, {T}: Target creature you control gains firebending 4 until end of turn. (Whenever it attacks, add {R}{R}{R}{R}. This mana lasts until end of combat.)" });

const elf = card("Test Elf", "Creature — Elf Warrior", "{G}", { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 105: Allosaurus Shepherd, Fire Nation Palace", () => {
  it("parse", () => [shepherd, palace].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Allosaurus Shepherd: each Elf you control is a base 5/5 Dinosaur until end of turn; counters still count", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shepherd);
    const e = putOnBattlefield(s0, ap, elf);
    s0.objects[e]!.counters["+1/+1"] = 1;
    const b = putOnBattlefield(s0, ap, bear());
    const plan = planActivate(s0, ap, sh, 0);
    expect(plan).not.toBeNull();
    let s = settle(plan!.reduce((x, y) => act(x, y), s0));
    expect([power(s, s.objects[sh]!), toughness(s, s.objects[sh]!)]).toEqual([5, 5]);
    expect([power(s, s.objects[e]!), toughness(s, s.objects[e]!)]).toEqual([6, 6]);
    expect(characteristics(s, s.objects[e]!).subtypes).toEqual(expect.arrayContaining(["Elf", "Warrior", "Dinosaur"]));
    expect(power(s, s.objects[b]!)).toBe(2);
    expect(characteristics(s, s.objects[b]!).subtypes).not.toContain("Dinosaur");
    s = passUntil(s, "upkeep");
    expect(power(s, s.objects[sh]!)).toBe(1);
    expect(characteristics(s, s.objects[e]!).subtypes).not.toContain("Dinosaur");
  });

  it("Fire Nation Palace: the target gains firebending 4; attacking adds {R}{R}{R}{R}", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, palace);
    const b = putOnBattlefield(s0, ap, bear());
    const plan = planActivate(s0, ap, p, 0, [{ kind: "object", id: b }]);
    expect(plan).not.toBeNull();
    let s = settle(plan!.reduce((x, y) => act(x, y), s0));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s);
    expect(s.players[ap]!.manaPool.R).toBe(4);
  });
});

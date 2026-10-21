// Round 102: Alexios, Deimos of Kosmos: "can't be sacrificed" (CR 701.21; rulings: not for a cost, and an instruction to
// sacrifice it does nothing), "can't attack its owner" (but their planeswalkers, yes), and each player's upkeep
// handing it over (layer 2), untapped, with a +1/+1 counter that player puts on it.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, attackProblem, castProblem, characteristics, controllerOf, isFullySupported, objHasKeyword, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const alexios = card("Alexios, Deimos of Kosmos", "Legendary Creature — Human Berserker", "{3}{R}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nAlexios attacks each combat if able, can't be sacrificed, and can't attack its owner.\nAt the beginning of each player's upkeep, that player gains control of Alexios, untaps it, and puts a +1/+1 counter on it. It gains haste until end of turn." });
const edict = card("Diabolic Edict", "Instant", "{1}{B}", { oracleText: "Target player sacrifices a creature of their choice." });
const rites = card("Village Rites", "Instant", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards." });
const seer = card("Viscera Seer", "Creature — Vampire Wizard", "{B}", { power: "1", toughness: "1", keywords: ["Scry"], oracleText: "Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};
const next = (s: GameState, pid: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

describe("round 102: Alexios", () => {
  it("parse", () => expect(isFullySupported(alexios)).toBe(true));

  it("each player's upkeep: that player gains control of it, untaps it, puts a +1/+1 counter on it, and it gains haste", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, alexios);
    s0.objects[a]!.tapped = true;
    const other = next(s0, ap);
    let s = passUntil(s0, "upkeep", other);
    s = settle(s);
    expect(controllerOf(s, s.objects[a]!)).toBe(other);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, s.objects[a]!, "Haste")).toBe(true);
    expect(characteristics(s, s.objects[a]!).attacksIfAble).toBe(true);
    // It can't attack its owner, but it can attack another player.
    expect(attackProblem(s, s.objects[a]!, ap)).toMatch(/can't attack its owner/);
    expect(attackProblem(s, s.objects[a]!, next(s, other))).toBeNull();
    // It has to attack (CR 508.1d): someone other than its owner. Then the next player's upkeep: theirs, with a second counter.
    s = passUntil(s, "declareAttackers", other);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = pass(s);
    expect(() => act(s, { type: "declareAttackers", player: other, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(s, { type: "declareAttackers", player: other, attacks: [{ attacker: a, defender: ap }] })).toThrow(/can't attack its owner/);
    s = act(s, { type: "declareAttackers", player: other, attacks: [{ attacker: a, defender: next(s, other) }] });
    s = passUntil(s, "upkeep", next(s, other));
    s = settle(s);
    expect(controllerOf(s, s.objects[a]!)).toBe(next(s, other));
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });

  it("it can't be sacrificed: an edict takes another creature, or nothing; it can't pay a sacrifice cost", () => {
    const { s: s0, ap, ids } = setup([edict, edict, rites]);
    const a = putOnBattlefield(s0, ap, alexios);
    const b = putOnBattlefield(s0, ap, bear());
    const sv = putOnBattlefield(s0, ap, seer);
    // Viscera Seer can sacrifice the bear or itself, never Alexios.
    expect(abilityProblem(s0, ap, sv, 0, undefined, undefined, undefined, undefined, { sacrifice: [a] })).not.toBeNull();
    expect(abilityProblem(s0, ap, sv, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })).toBeNull();
    expect(castProblem(s0, ap, ids[2]!, undefined, undefined, undefined, undefined, undefined, { sacrifice: [a] })).not.toBeNull();
    // An edict: the player has to sacrifice one of the others.
    s0.battlefield.splice(s0.battlefield.indexOf(sv), 1);
    s0.objects[sv]!.zone = "graveyard";
    let s = settle(planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])!.reduce((x, y) => act(x, y), s0));
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("battlefield");
    // Only Alexios left: nothing is sacrificed.
    s = settle(planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])!.reduce((x, y) => act(x, y), s));
    expect(s.objects[a]!.zone).toBe("battlefield");
    // And nothing can pay Village Rites' cost.
    expect(castProblem(s, ap, ids[2]!)).not.toBeNull();
  });
});

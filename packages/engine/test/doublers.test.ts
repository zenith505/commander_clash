// Token and counter doublers are replacement effects (CR 614.1a, 616.1): Parallel Lives, Doubling Season,
// Hardened Scales, Xorn, Primal Vigor.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castIt = (s: GameState, pid: PlayerId, id: string) => settle(planCast(s, pid, id)!.reduce((x, a) => act(x, a), s));
const named = (s: GameState, name: string) => s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === name);

const parallelLives = card("Parallel Lives Test", "Enchantment", "{3}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." });
const doublingSeason = card("Doubling Season Test", "Enchantment", "{4}{G}", {
  oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.",
});
const hardenedScales = card("Hardened Scales Test", "Enchantment", "{G}", { oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." });
const branching = card("Branching Test", "Enchantment", "{2}{G}", { oracleText: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead." });
const primalVigor = card("Primal Vigor Test", "Enchantment", "{4}{G}", {
  oracleText: "If one or more tokens would be created, twice that many of those tokens are created instead.\nIf one or more +1/+1 counters would be put on a creature, twice that many +1/+1 counters are put on that creature instead.",
});
const xorn = card("Xorn Test", "Creature — Elemental", "{2}{R}", { power: "3", toughness: "2", oracleText: "If you would create one or more Treasure tokens, instead create those tokens plus an additional Treasure token." });
const corpsejack = card("Corpsejack Test", "Creature — Zombie", "{2}{B}{G}", { power: "4", toughness: "4", oracleText: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead." });
const twoSoldiers = card("Two Soldiers Test", "Sorcery", "{1}", { oracleText: "Create two 1/1 white Soldier creature tokens." });
const treasure = card("Treasure Test", "Sorcery", "{1}", { oracleText: "Create a Treasure token." });
const pump = card("Counter Test", "Sorcery", "{1}", { oracleText: "Put two +1/+1 counters on target creature." });
const hydra = card("Entering Test", "Creature — Hydra", "{1}", { power: "0", toughness: "0", oracleText: "This creature enters with three +1/+1 counters on it." });

describe("token and counter doublers", () => {
  it("all compile", () => supported(parallelLives, doublingSeason, hardenedScales, branching, primalVigor, xorn, corpsejack));

  it("Parallel Lives doubles tokens you create, two copies make four times as many", () => {
    const { s, ap, ids } = setup([twoSoldiers, twoSoldiers]);
    putOnBattlefield(s, ap, parallelLives);
    let t = castIt(s, ap, ids[0]!);
    expect(named(t, "Soldier Token")).toHaveLength(4);
    putOnBattlefield(t, ap, parallelLives);
    t = castIt(t, ap, ids[1]!);
    expect(named(t, "Soldier Token")).toHaveLength(4 + 8);
  });

  it("Parallel Lives does nothing for an opponent's tokens, Primal Vigor doubles everyone's", () => {
    const { s, ap, ids, opp } = setup([twoSoldiers, twoSoldiers]);
    putOnBattlefield(s, opp, parallelLives);
    let t = castIt(s, ap, ids[0]!);
    expect(named(t, "Soldier Token")).toHaveLength(2);
    putOnBattlefield(t, opp, primalVigor);
    t = castIt(t, ap, ids[1]!);
    expect(named(t, "Soldier Token")).toHaveLength(2 + 4);
  });

  it("Xorn adds one Treasure only to Treasure tokens, before Parallel Lives doubles them", () => {
    const { s, ap, ids } = setup([treasure, twoSoldiers, treasure]);
    putOnBattlefield(s, ap, xorn);
    let t = castIt(s, ap, ids[0]!);
    expect(named(t, "Treasure Token")).toHaveLength(2);
    t = castIt(t, ap, ids[1]!);
    expect(named(t, "Soldier Token")).toHaveLength(2);
    putOnBattlefield(t, ap, parallelLives);
    t = castIt(t, ap, ids[2]!);
    expect(named(t, "Treasure Token")).toHaveLength(2 + 4);
  });

  it("Hardened Scales and a doubler: plus one first, then twice that many", () => {
    const { s, ap, ids } = setup([pump]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, hardenedScales);
    putOnBattlefield(s, ap, branching);
    const t = settle(planCast(s, ap, ids[0]!, [{ kind: "object", id: b }])!.reduce((x, a) => act(x, a), s));
    expect(t.objects[b]!.counters["+1/+1"]).toBe((2 + 1) * 2);
  });

  it("only +1/+1 counters on your creatures for Hardened Scales; Doubling Season doubles any counter on your permanents", () => {
    const { s, ap, ids, opp } = setup([pump, hydra]);
    const theirs = putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, hardenedScales);
    let t = settle(planCast(s, ap, ids[0]!, [{ kind: "object", id: theirs }])!.reduce((x, a) => act(x, a), s));
    expect(t.objects[theirs]!.counters["+1/+1"]).toBe(2);
    putOnBattlefield(t, ap, doublingSeason);
    t = castIt(t, ap, ids[1]!);
    expect(t.objects[ids[1]!]!.counters["+1/+1"]).toBe((3 + 1) * 2); // enters with counters is affected too
  });

  it("a creature's own doubler doesn't apply as it enters (CR 614.12)", () => {
    const bigCorpse = card("Corpse Hydra Test", "Creature — Hydra", "{1}", {
      power: "0",
      toughness: "0",
      oracleText: "This creature enters with two +1/+1 counters on it.\nIf one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead.",
    });
    supported(bigCorpse);
    const { s, ap, ids } = setup([bigCorpse, pump]);
    let t = castIt(s, ap, ids[0]!);
    expect(t.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    t = settle(planCast(t, ap, ids[1]!, [{ kind: "object", id: ids[0]! }])!.reduce((x, a) => act(x, a), t));
    expect(t.objects[ids[0]!]!.counters["+1/+1"]).toBe(2 + 4);
  });
});

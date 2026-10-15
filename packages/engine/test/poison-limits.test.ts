// Poison counters given by an effect (CR 122.1f; ten lose, 704.5c) and corrupted ("as long as an opponent has three or
// more poison counters"), activation limits (CR 602.5b: "Activate no more than twice each turn", "Activate only if ...
// and only once each turn"), "As long as equipped creature is a Human, it gets an additional +1/+1", "return a land you
// control to its owner's hand" as an additional cost (Deprive), and "enters tapped unless you control a legendary
// creature" (CR 614.1d).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, isFullySupported, planCast, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const cobra = card("Crypt Cobra", "Creature — Snake", "{3}{B}", {
  power: "3",
  toughness: "3",
  oracleText: "Whenever this creature attacks and isn't blocked, defending player gets a poison counter. (A player with ten or more poison counters loses the game.)",
});
const inquiry = card("Infectious Inquiry", "Sorcery", "{2}{B}", { oracleText: "You draw two cards and you lose 2 life. Each opponent gets a poison counter." });
const skitterling = card("Chittering Skitterling", "Creature — Phyrexian Rat", "{2}{B}", {
  power: "1",
  toughness: "4",
  oracleText: "Corrupted — Sacrifice an artifact or creature: Draw a card. Activate only if an opponent has three or more poison counters and only once each turn.",
});
const pitImp = card("Pit Imp", "Creature — Imp", "{B}", { power: "0", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{B}: This creature gets +1/+0 until end of turn. Activate no more than twice each turn." });
const mattock = card("Heavy Mattock", "Artifact — Equipment", "{3}", {
  keywords: ["Equip"],
  oracleText: "Equipped creature gets +1/+1.\nAs long as equipped creature is a Human, it gets an additional +1/+1.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)",
});
const deprive = card("Deprive", "Instant", "{U}{U}", { oracleText: "As an additional cost to cast this spell, return a land you control to its owner's hand.\nCounter target spell." });
const rivendell = card("Rivendell", "Legendary Land", "", {
  oracleText: "Rivendell enters tapped unless you control a legendary creature.\n{T}: Add {U}.\n{1}{U}, {T}: Scry 2. Activate only if you control a legendary creature.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const human = card("Village Smith", "Creature — Human", "{1}{W}", { power: "1", toughness: "1" });
const hero = card("Legendary Hero", "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });

const poison = (s: GameState, pid: PlayerId) => s.players[pid]!.poison ?? 0;

describe("poison counters and corrupted", () => {
  it("compiles", () => {
    for (const d of [cobra, inquiry, skitterling, pitImp, mattock, deprive, rivendell]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Crypt Cobra: unblocked, the defending player gets a poison counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cobra);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    expect(poison(s, opp)).toBe(1);
  });

  it("Infectious Inquiry: each opponent gets one; ten poison counters lose the game", () => {
    const { s: s0, ap, ids } = setup([inquiry]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    s0.players[opps[0]!]!.poison = 9;
    const s = cast(s0, ap, ids[0]!);
    for (const o of opps) expect(poison(s, o)).toBeGreaterThanOrEqual(1);
    expect(poison(s, ap)).toBe(0);
    expect(s.players[opps[0]!]!.lost).toBe(true);
    expect(s.players[opps[1]!]!.lost).toBeFalsy();
  });

  it("Chittering Skitterling: only with an opponent at three poison, and only once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, skitterling);
    const fodder = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear({ name: "Bear 2" }))];
    expect(abilityProblem(s0, ap, sk, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder[0]!] })).toMatch(/can.t be activated now/);
    s0.players[opp]!.poison = 3;
    const hand = s0.players[ap]!.hand.length;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: sk, index: 0, costs: { sacrifice: [fodder[0]!] } } as never);
    s = passAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(abilityProblem(s, ap, sk, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder[1]!] })).toMatch(/once each turn/);
  });
});

describe("activation limits", () => {
  it("Pit Imp pumps at most twice each turn", () => {
    const { s: s0, ap } = setup([]);
    const imp = putOnBattlefield(s0, ap, pitImp);
    let s = activate(s0, ap, imp, 0);
    s = activate(s, ap, imp, 0);
    expect(pt(s, imp)).toBe("2/1");
    expect(abilityProblem(s, ap, imp, 0)).toMatch(/no more than twice/);
  });
});

describe("equipment that cares about the creature's type", () => {
  it("Heavy Mattock gives +1/+1, or +2/+2 to a Human", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mattock);
    const b = putOnBattlefield(s, ap, bear());
    const h = putOnBattlefield(s, ap, human);
    let t = activate(s, ap, m, 0, [target(b)]);
    expect(pt(t, b)).toBe("3/3");
    t = activate(s, ap, m, 0, [target(h)]);
    expect(pt(t, h)).toBe("3/3");
  });
});

describe("Deprive and the legendary-creature lands", () => {
  it("Deprive returns a land you control to hand as it's cast", () => {
    const { s: s0, ap, opp, ids } = setup([shock, deprive]);
    let s = s0;
    const shockPlan = planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!;
    for (const a of shockPlan) s = act(s, a);
    const spell = s.stack[s.stack.length - 1]!.id;
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island" && !s.objects[id]!.tapped)!;
    const life = s.players[opp]!.life;
    const plan = planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }], undefined, "auto", undefined, { returnToHand: [land] })!;
    expect(plan).toBeTruthy();
    for (const a of plan) s = act(s, a);
    expect(s.objects[land]!.zone).toBe("hand");
    s = passAll(s);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Rivendell enters tapped unless you control a legendary creature", () => {
    const { s: s0, ap, ids } = setup([rivendell]);
    const s = act(structuredClone(s0), { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    putOnBattlefield(s0, ap, hero);
    const t = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(t.objects[ids[0]!]!.tapped).toBe(false);
  });
});

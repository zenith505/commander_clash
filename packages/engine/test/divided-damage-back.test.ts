// More "divided as you choose" (CR 601.2d): "Each of those creatures deals damage equal to its power to ~" after it
// (Polukranos, Living Inferno, Ravenous Gigantotherium): the targets still legal deal damage back, at the same time, each
// its power as it resolves; monstrosity X's X in "when ~ becomes monstrous" (CR 701.37c); an X counted from the
// permanent (Magmatic Core); a fixed amount among exactly X targets (Meteor Swarm); "N damage to each of X targets"
// (Firestorm, Meteor Blast).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const polukranos = card("Polukranos, World Eater", "Legendary Creature — Hydra", "{2}{G}{G}", { power: "5", toughness: "5", keywords: ["Monstrosity"], oracleText: "{X}{X}{G}: Monstrosity X. (If this creature isn't monstrous, put X +1/+1 counters on it and it becomes monstrous.)\nWhen Polukranos becomes monstrous, it deals X damage divided as you choose among any number of target creatures your opponents control. Each of those creatures deals damage equal to its power to Polukranos." });
const inferno = card("Living Inferno", "Creature — Elemental", "{6}{R}{R}", { power: "8", toughness: "5", oracleText: "{T}: This creature deals damage equal to its power divided as you choose among any number of target creatures. Each of those creatures deals damage equal to its power to this creature." });
const gigantotherium = card("Ravenous Gigantotherium", "Creature — Beast", "{5}{G}{G}", { power: "3", toughness: "3", keywords: ["Devour"], oracleText: "Devour 3 (As this creature enters, you may sacrifice any number of creatures. It enters with three times that many +1/+1 counters on it.)\nWhen this creature enters, it deals X damage divided as you choose among up to X target creatures, where X is its power. Each of those creatures deals damage equal to its power to this creature." });
const core = card("Magmatic Core", "Enchantment", "{2}{R}{R}", { keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of your end step, this enchantment deals X damage divided as you choose among any number of target creatures, where X is the number of age counters on it." });
const swarm = card("Meteor Swarm", "Sorcery", "{X}{R}{R}{R}", { oracleText: "Meteor Swarm deals 8 damage divided as you choose among X target creatures and/or planeswalkers." });
const firestorm = card("Firestorm", "Instant", "{R}", { oracleText: "As an additional cost to cast this spell, discard X cards.\nFirestorm deals X damage to each of X targets." });
const blast = card("Meteor Blast", "Sorcery", "{X}{R}{R}{R}", { oracleText: "Meteor Blast deals 4 damage to each of X targets." });

const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const pl = (id: number): TargetChoice => ({ kind: "player", id });
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("divided damage, dealt back and among X targets", () => {
  it("is supported", () => [polukranos, inferno, gigantotherium, core, swarm, firestorm, blast].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Polukranos: the X it became monstrous with, then the targets deal damage back", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, polukranos);
    const b1 = putOnBattlefield(s0, opp, bear({ power: "3", toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, bear({ power: "4", toughness: "4" }));
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, p, 0, undefined, undefined, undefined, 3)));
    expect(s.objects[p]!.counters["+1/+1"]).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // X is 3: not 4, and only opponents' creatures.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 1), obj(b2, 3)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 1), obj(mine, 2)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 1), obj(b2, 2)] }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.damage).toBe(2);
    // 3 + 4 back: the dying 3/1 deals its damage too, before it dies (rulings).
    expect(s.objects[p]!.damage).toBe(7);
    expect(s.objects[p]!.zone).toBe("battlefield");
  });

  it("Living Inferno: an illegal target deals no damage back", () => {
    const { s: s0, ap, opp } = setup([]);
    const li = putOnBattlefield(s0, ap, inferno);
    const b1 = putOnBattlefield(s0, opp, bear({ power: "2", toughness: "4" }));
    const b2 = putOnBattlefield(s0, opp, bear({ power: "2", toughness: "4" }));
    // 8 damage: its power, locked in as it's activated (rulings).
    expect(planActivate(s0, ap, li, 0, [obj(b1, 4), obj(b2, 3)])).toBeNull();
    let s = run(s0, planActivate(s0, ap, li, 0, [obj(b1, 4), obj(b2, 4)]));
    // b2 leaves before it resolves: it isn't dealt damage and deals none (CR 608.2b).
    s.battlefield.splice(s.battlefield.indexOf(b2), 1);
    s.objects[b2]!.zone = "exile";
    s = passAll(s);
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[li]!.damage).toBe(2);
  });

  it("Ravenous Gigantotherium: X is its power as the trigger is put on the stack, up to X targets", () => {
    const { s: s0, ap, ids, opp } = setup([gigantotherium]);
    const b1 = putOnBattlefield(s0, opp, bear({ power: "1", toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, bear({ power: "1", toughness: "1" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind !== "chooseTargets") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] })); // devour nothing
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), obj(b2, 2)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), obj(b2, 1)] }));
    expect([s.objects[b1]!.zone, s.objects[b2]!.zone]).toEqual(["graveyard", "graveyard"]);
    const g = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ravenous Gigantotherium")!;
    expect(s.objects[g]!.damage).toBe(2);
  });

  it("Magmatic Core: X is its age counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, core);
    s0.objects[c]!.counters.age = 2;
    const b1 = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 3)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2)] }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
  });

  it("Meteor Swarm: 8 divided among exactly X targets", () => {
    const { s: s0, ap, ids, opp } = setup([swarm]);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ toughness: "6" }));
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 2), obj(b2, 6)], undefined, undefined, 1)).toBeNull(); // X is 1: one target
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 8)], undefined, undefined, 2)).toBeNull(); // X is 2: two targets
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 2), obj(b2, 5)], undefined, undefined, 2)).toBeNull(); // 7, not 8
    expect(planCast(s0, ap, ids[0]!, [pl(opp), obj(b2, 6)], undefined, undefined, 2)).toBeNull(); // not a player
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 2), obj(b2, 6)], undefined, undefined, 2)));
    expect([s.objects[b1]!.zone, s.objects[b2]!.zone]).toEqual(["graveyard", "graveyard"]);
  });

  it("Firestorm: discard X cards, X damage to each of X targets", () => {
    const { s: s0, ap, ids, opp } = setup([firestorm, bear(), bear()]);
    const b1 = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const discard = { discard: [ids[1]!, ids[2]!] };
    expect(planCast(s0, ap, ids[0]!, [obj(b1)], undefined, undefined, 2, discard)).toBeNull(); // two targets, not one
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1), pl(opp)], undefined, undefined, 2, discard)));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand).not.toContain(ids[1]!);
  });

  it("Meteor Blast: 4 damage to each of X targets, the same one only once", () => {
    const { s: s0, ap, ids, opp } = setup([blast]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "5" }));
    expect(planCast(s0, ap, ids[0]!, [obj(b1), obj(b1)], undefined, undefined, 2)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1), pl(opp)], undefined, undefined, 2)));
    expect(s.objects[b1]!.damage).toBe(4);
  });
});

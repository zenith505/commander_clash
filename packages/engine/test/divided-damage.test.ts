// Damage "divided as you choose" among one, two, or three targets / any number of targets: the number of targets and
// each one's part (at least 1) are chosen with the targets (CR 601.2d); a part for a target that has become illegal
// isn't dealt (CR 608.2b, rulings on Arc Lightning), and a copy keeps the division (rulings on Pyrotechnics).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { chooseTargets, compileCard, isFullySupported, planCast, waitingOn, type GameState, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const arc = card("Arc Lightning", "Sorcery", "{2}{R}", { oracleText: "Arc Lightning deals 3 damage divided as you choose among one, two, or three targets." });
const electrolyze = card("Electrolyze", "Instant", "{1}{U}{R}", { oracleText: "Electrolyze deals 2 damage divided as you choose among one or two targets.\nDraw a card." });
const pyro = card("Pyrotechnics", "Sorcery", "{4}{R}", { oracleText: "Pyrotechnics deals 4 damage divided as you choose among any number of targets." });
const volley = card("Aerial Volley", "Instant", "{G}", { oracleText: "Aerial Volley deals 3 damage divided as you choose among one, two, or three target creatures with flying." });
const fireAtWill = card("Fire at Will", "Instant", "{R/W}{R/W}{R/W}", { oracleText: "Fire at Will deals 3 damage divided as you choose among one, two, or three target attacking or blocking creatures." });
const hellkite = card("Bogardan Hellkite", "Creature — Dragon", "{6}{R}{R}", { power: "5", toughness: "5", keywords: ["Flash", "Flying"], oracleText: "Flash\nFlying\nWhen this creature enters, it deals 5 damage divided as you choose among any number of targets." });
const atarka = card("Dragonlord Atarka", "Legendary Creature — Elder Dragon", "{5}{R}{G}", { power: "8", toughness: "8", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhen Dragonlord Atarka enters, it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const pl = (id: number, amount: number): TargetChoice => ({ kind: "player", id, amount });
const none: TargetChoice = { kind: "none" };
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("damage divided as you choose", () => {
  it("is supported", () => [arc, electrolyze, pyro, volley, fireAtWill, hellkite, atarka].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("one, two, or three targets: up to three, any target, as divided", () => {
    expect(compileCard(arc).spell!.targets.map((t) => !!t.optional)).toEqual([false, true, true]);
    expect(compileCard(pyro).spell!.targets).toHaveLength(4);
    const { s: s0, ap, ids, opp } = setup([arc]);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const plan = planCast(s0, ap, ids[0]!, [obj(b1, 2), pl(opp, 1), none]);
    expect(plan).not.toBeNull();
    const s = passAll(plan!.reduce((x, a) => act(x, a), s0));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("each target gets at least 1, and the parts add up", () => {
    const { s, ap, ids, opp } = setup([arc]);
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [obj(b1, 2), obj(b2, 2), none])).toBeNull(); // 4, not 3
    expect(planCast(s, ap, ids[0]!, [obj(b1, 3), obj(b2, 0), none])).toBeNull(); // 0 to a target
    expect(planCast(s, ap, ids[0]!, [obj(b1), none, none])).toBeNull(); // no division
    expect(planCast(s, ap, ids[0]!, [obj(b1, 2), obj(b1, 1), none])).toBeNull(); // the same target twice
    expect(planCast(s, ap, ids[0]!, [obj(b1, 3), none, none])).not.toBeNull();
  });

  it("a target that became illegal doesn't get its part, and the rest still happens", () => {
    const { s: s0, ap, ids, opp } = setup([electrolyze, unsummon]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const hand = s0.players[ap]!.hand.length;
    let s = planCast(s0, ap, ids[0]!, [obj(b1, 1), obj(b2, 1)])!.reduce((x, a) => act(x, a), s0);
    s = planCast(s, ap, ids[1]!, [target(b2)])!.reduce((x, a) => act(x, a), s);
    s = settle(s);
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1); // cast two, drew one
  });

  it("only creatures with flying for Aerial Volley; only opponents' creatures for Atarka", () => {
    const { s, ap, ids, opp } = setup([volley]);
    const flyer = putOnBattlefield(s, opp, bear({ name: "Bird", keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [obj(flyer, 2), obj(walker, 1), none])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [obj(flyer, 3), none, none])).not.toBeNull();
    const specs = compileCard(atarka).triggers[0]!.body.targets;
    expect(specs).toHaveLength(5);
    expect(specs[0]).toMatchObject({ kind: "object", types: ["Creature", "Planeswalker"], controller: "opponent" });
  });

  it("a bot kills what it can and sends the rest at an opponent", () => {
    const { s, ap, opp } = setup([]);
    const b1 = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s, opp, bear({ toughness: "2" }));
    const t = chooseTargets(s, ap, compileCard(pyro).spell!)!;
    const parts = t.filter((x) => x.kind !== "none");
    expect(parts.reduce((n, x) => n + ((x as { amount: number }).amount ?? 0), 0)).toBe(4);
    expect(parts).toContainEqual({ kind: "object", id: b1, amount: 1 });
    expect(parts).toContainEqual({ kind: "object", id: b2, amount: 2 });
    expect(parts.find((x) => x.kind === "player")).toMatchObject({ amount: 1 });
  });

  it("a triggered ability's division is chosen as it's put on the stack (CR 603.3d)", () => {
    const { s: s0, ap, ids, opp } = setup([hellkite]);
    const b1 = putOnBattlefield(s0, opp, bear());
    let s = planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), none, none, none, none] })).toThrow(/divide 5/);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), pl(opp, 3), none, none, none] }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(37);
  });
});

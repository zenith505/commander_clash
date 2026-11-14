// "X damage divided as you choose among any number of targets": the amount is worked out as the targets are chosen, so
// one to X targets, at least 1 each (CR 601.2d), none if X is 0 (rulings on Rolling Thunder); a copy or a change of what
// X counts doesn't change the division (rulings on Jaws of Stone). Triggered abilities announce theirs as they're put on
// the stack (CR 603.3d, rulings on Orca, Siege Demon).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passAll, putOnBattlefield, setup } from "./helpers";
import { chooseTargets, compileCard, isFullySupported, moveObject, planCast, waitingOn, type GameState, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const thunder = card("Rolling Thunder", "Sorcery", "{X}{R}{R}", { oracleText: "Rolling Thunder deals X damage divided as you choose among any number of targets." });
const shower = card("Meteor Shower", "Sorcery", "{X}{X}{R}", { oracleText: "Meteor Shower deals X plus 1 damage divided as you choose among any number of targets." });
const hail = card("Hail of Arrows", "Instant", "{X}{W}", { oracleText: "Hail of Arrows deals X damage divided as you choose among any number of target attacking creatures." });
const jaws = card("Jaws of Stone", "Sorcery", "{5}{R}", { oracleText: "Jaws of Stone deals X damage divided as you choose among any number of targets, where X is the number of Mountains you control as you cast this spell." });
const wind = card("Volcanic Wind", "Sorcery", "{4}{R}{R}", { oracleText: "Volcanic Wind deals X damage divided as you choose among any number of target creatures, where X is the number of creatures on the battlefield as you cast this spell." });
const onslaught = card("Monstrous Onslaught", "Sorcery", "{3}{G}{G}", { oracleText: "Monstrous Onslaught deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast this spell." });
const ureni = card("Ureni, the Song Unending", "Legendary Creature — Spirit Dragon", "{5}{G}{U}{R}", { power: "10", toughness: "10", keywords: ["Flying", "Protection"], oracleText: "Flying, protection from white and from black\nWhen Ureni enters, it deals X damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control, where X is the number of lands you control." });
const orca = card("Orca, Siege Demon", "Legendary Creature — Demon", "{4}{R}{R}", { power: "1", toughness: "1", keywords: ["Trample"], oracleText: "Trample\nWhenever another creature dies, put a +1/+1 counter on Orca.\nWhen Orca dies, it deals damage equal to its power divided as you choose among any number of targets." });

const obj = (id: string, amount?: number): TargetChoice => ({ kind: "object", id, ...(amount !== undefined ? { amount } : {}) });
const pl = (id: number, amount: number): TargetChoice => ({ kind: "player", id, amount });
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("X damage divided as you choose", () => {
  it("is supported", () => [thunder, shower, hail, jaws, wind, onslaught, ureni, orca].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Rolling Thunder: X divided among one to X targets", () => {
    const { s: s0, ap, ids, opp } = setup([thunder]);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 2), obj(b2, 2)], undefined, undefined, 3)).toBeNull(); // 4, not 3
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 1), obj(b2, 1), pl(opp, 1), pl(ap, 1)], undefined, undefined, 3)).toBeNull(); // more targets than X
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 3), obj(b2, 0)], undefined, undefined, 3)).toBeNull(); // 0 to a target
    // "Any number of targets" may be none, with nothing dealt (CR 115.6; rulings on Kuldotha Flamefiend, same wording).
    expect(planCast(s0, ap, ids[0]!, [], undefined, undefined, 3)).not.toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 2), pl(opp, 1)], undefined, undefined, 3)));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("X is 0: no targets at all", () => {
    const { s: s0, ap, ids, opp } = setup([thunder]);
    const b1 = putOnBattlefield(s0, opp, bear());
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 1)], undefined, undefined, 0)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 0)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b1]!.zone).toBe("battlefield");
  });

  it("Meteor Shower: X plus 1", () => {
    const { s: s0, ap, ids, opp } = setup([shower]);
    const b1 = putOnBattlefield(s0, opp, bear());
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 2)], undefined, undefined, 2)).toBeNull();
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 2), pl(opp, 1)], undefined, undefined, 2)));
    expect(s.objects[b1]!.zone).toBe("graveyard");
  });

  it("Jaws of Stone: the Mountains as it's cast, kept after", () => {
    const { s: s0, ap, ids, opp } = setup([jaws]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "5" }));
    // setup gives three Mountains.
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 4)])).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 3)]));
    // More Mountains now change nothing (rulings).
    putOnBattlefield(s, ap, mountain);
    s = passAll(s);
    expect(s.objects[b1]!.damage).toBe(3);
  });

  it("Monstrous Onslaught and Volcanic Wind count as they're cast", () => {
    const { s: s0, ap, ids, opp } = setup([onslaught, wind]);
    putOnBattlefield(s0, ap, bear({ power: "4" }));
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 2), obj(b2, 2)])));
    expect([s.objects[b1]!.zone, s.objects[b2]!.zone]).toEqual(["graveyard", "graveyard"]);
    // Volcanic Wind: three creatures on the battlefield, so 3.
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([wind]);
    const c1 = putOnBattlefield(t0, opp2, bear());
    putOnBattlefield(t0, opp2, bear());
    putOnBattlefield(t0, ap2, bear());
    expect(planCast(t0, ap2, ids2[0]!, [obj(c1, 2)])).toBeNull();
    expect(planCast(t0, ap2, ids2[0]!, [obj(c1, 3)])).not.toBeNull();
  });

  it("Ureni: the lands you control as the trigger is put on the stack, only opponents' creatures", () => {
    const { s: s0, ap, ids, opp } = setup([ureni]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "20" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // setup gives 14 lands; 8 of them were tapped to cast it but still count.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 13)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 14)] }));
    expect(s.objects[b1]!.damage).toBe(14);
  });

  it("Orca: its power as it last existed, divided as it dies", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, orca);
    s0.objects[o]!.counters["+1/+1"] = 3;
    const b1 = putOnBattlefield(s0, opp, bear());
    moveObject(s0, o, "graveyard");
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Power 4 (1 and three +1/+1 counters): not 5, not 1.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), pl(opp, 3)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 1)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b1, 2), pl(opp, 2)] }));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(38);
  });

  it("a bot divides X: kills what it can, the rest at an opponent", () => {
    const { s, ap, opp } = setup([]);
    const b1 = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s, opp, bear({ toughness: "2" }));
    const t = chooseTargets(s, ap, compileCard(thunder).spell!, false, undefined, 5)!;
    const parts = t.filter((x) => x.kind !== "none");
    expect(parts.reduce((n, x) => n + ((x as { amount: number }).amount ?? 0), 0)).toBe(5);
    expect(parts).toContainEqual({ kind: "object", id: b1, amount: 1 });
    expect(parts).toContainEqual({ kind: "object", id: b2, amount: 2 });
  });
});

// Prevention divided as you choose (rulings on Remedy): a shield of each target's part, at least 1 each, no more targets
// than the amount; a target that became illegal gets no shield.
const remedy = card("Remedy", "Instant", "{1}{W}", { oracleText: "Prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose." });
const hymn = card("Serra's Hymn", "Enchantment", "{2}{W}", { oracleText: "At the beginning of your upkeep, you may put a verse counter on this enchantment.\nSacrifice this enchantment: Prevent the next X damage that would be dealt this turn to any number of targets, divided as you choose, where X is the number of verse counters on this enchantment." });
const angel = card("Angel of Salvation", "Creature — Angel", "{6}{W}{W}", { power: "5", toughness: "5", keywords: ["Flash", "Convoke", "Flying"], oracleText: "Flash; convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nFlying\nWhen this creature enters, prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose." });

describe("prevention divided as you choose", () => {
  it("is supported", () => [remedy, hymn, angel].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Remedy: a shield of each part", () => {
    const { s: s0, ap, ids } = setup([remedy]);
    const b1 = putOnBattlefield(s0, ap, bear());
    const none: TargetChoice = { kind: "none" };
    expect(planCast(s0, ap, ids[0]!, [obj(b1, 3), pl(ap, 3), none, none, none])).toBeNull(); // 6, not 5
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1, 3), pl(ap, 2), none, none, none])));
    expect(s.objects[b1]!.preventNext).toBe(3);
    expect(s.players[ap]!.preventNext).toBe(2);
  });

  it("Serra's Hymn: X is its verse counters as it's activated, before it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hymn);
    s0.objects[h]!.counters.verse = 2;
    const b1 = putOnBattlefield(s0, ap, bear());
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: h, index: 0, targets: [obj(b1, 3)] })).toThrow();
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: h, index: 0, targets: [obj(b1, 2)] }));
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect(s.objects[b1]!.preventNext).toBe(2);
  });
});

// Fireball (rulings): divided evenly, rounded down, among the targets still legal as it resolves; {1} more for each
// target beyond the first; any number of targets, more than X too, or none.
const fireball = card("Fireball", "Sorcery", "{X}{R}", { oracleText: "This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });

describe("Fireball", () => {
  it("is supported", () => expect(isFullySupported(fireball)).toBe(true));

  it("splits X evenly, rounded down, and costs {1} more per extra target", () => {
    const { s: s0, ap, ids, opp } = setup([fireball]);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const plan = planCast(s0, ap, ids[0]!, [obj(b1), obj(b2), { kind: "player", id: opp }], undefined, undefined, 7)!;
    // {7}{R} and two targets beyond the first: 10 lands tapped.
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(10);
    const s = passAll(run(s0, plan));
    expect([s.objects[b1]!.zone, s.objects[b2]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("among the targets still legal", () => {
    const { s: s0, ap, ids, opp } = setup([fireball, unsummon]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "4" }));
    const b2 = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(b1), obj(b2)], undefined, undefined, 4));
    s = run(s, planCast(s, ap, ids[1]!, [obj(b2)]));
    s = settle(s);
    expect(s.objects[b1]!.zone).toBe("graveyard"); // all 4 to it
  });

  it("more targets than X: none of them is dealt damage", () => {
    const { s: s0, ap, ids, opp } = setup([fireball]);
    const b1 = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, bear({ toughness: "1" }));
    const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1), obj(b2)], undefined, undefined, 1)));
    expect([s.objects[b1]!.zone, s.objects[b2]!.zone]).toEqual(["battlefield", "battlefield"]);
  });

  it("a bot puts it all on one target", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, opp, bear());
    const t = chooseTargets(s, ap, compileCard(fireball).spell!, false, undefined, 4)!;
    expect(t.filter((x) => x.kind !== "none")).toHaveLength(1);
  });
});

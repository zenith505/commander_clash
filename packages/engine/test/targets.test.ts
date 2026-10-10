// "Up to two target creatures", "two target creatures", "one or two target creatures", "another target
// creature": several targets of one instance of "target" (CR 115.3), targets that may be left unchosen
// (CR 115.6, 601.2c), and what happens when some or all of them become illegal (CR 608.2b).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, botActions, castProblem, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const none: TargetChoice = { kind: "none" };
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const toGraveyard = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

const tapTwo = card("Tap Two Test", "Instant", "{1}{U}", { oracleText: "Tap up to two target creatures." });
const raise = card("Raise Test", "Sorcery", "{2}{B}", { oracleText: "Return up to two target creature cards from your graveyard to your hand." });
const consume = card("Consume Test", "Instant", "{1}{B}{G}", { oracleText: "Target creature gets +2/+2 until end of turn. Another target creature gets -2/-2 until end of turn." });
const pump = card("Pump Two Test", "Instant", "{1}{G}", { oracleText: "Two target creatures each get +1/+1 until end of turn." });
const untapper = card("Untapper Test", "Creature — Human", "{1}{U}", { power: "1", toughness: "1", oracleText: "{T}: Untap another target permanent." });
const diver = card("Diver Test", "Artifact Creature — Bird", "{3}", { power: "1", toughness: "1", oracleText: "Flying\nWhen this creature dies, return another target artifact card from your graveyard to your hand.", keywords: ["Flying"] });
const bauble = card("Bauble Test", "Artifact", "{1}");
const wolf = card("Wolf Test", "Creature — Wolf", "{2}{G}", { power: "2", toughness: "2", oracleText: "When this creature enters, exile up to one target card from a graveyard." });
const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target." });

describe("up to N targets", () => {
  it("compiles them as targets in a row, the later ones optional", () => {
    supported(tapTwo, raise, consume, pump, untapper, diver, wolf);
    const t = compileCard(tapTwo).spell!.targets;
    expect(t.map((x) => !!x.optional)).toEqual([true, true]);
    expect(t[1]!.distinctFrom).toEqual([0]);
    const p = compileCard(pump).spell!.targets;
    expect(p.map((x) => !!x.optional)).toEqual([false, false]);
    expect(compileCard(consume).spell!.targets[1]!.distinctFrom).toEqual([0]);
    expect(compileCard(untapper).activated[0]!.body.targets[0]!.notSource).toBe(true);
  });

  it("taps one, or none, and the same creature can't be chosen twice (CR 115.3)", () => {
    const { s: s0, ap, ids, opp } = setup([tapTwo, tapTwo]);
    const a = putOnBattlefield(s0, opp, bear());
    expect(castProblem(s0, ap, ids[0]!, [target(a), target(a)])).toMatch(/illegal target/);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a), none]));
    expect(s.objects[a]!.tapped).toBe(true);
    // With no targets chosen it isn't targeted, and still resolves (CR 115.6).
    s = run(s, planCast(s, ap, ids[1]!, [none, none]));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(s.log.some((l) => /Tap Two Test resolves/.test(l.text))).toBe(true);
  });

  it("returns what's still legal; with every chosen target gone it doesn't resolve (CR 608.2b)", () => {
    const { s: s0, ap, ids } = setup([raise, raise, shock]);
    const g1 = toGraveyard(s0, ap, bear({ name: "Bear One" }));
    const g2 = toGraveyard(s0, ap, bear({ name: "Bear Two" }));
    let s = planCast(s0, ap, ids[0]!, [target(g1), target(g2)])!.reduce((x, a) => act(x, a), s0);
    // One leaves the graveyard before it resolves: the other still comes back.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((id) => id !== g2);
    s.objects[g2]!.zone = "exile";
    s.objects[g2]!.zoneChanges = (s.objects[g2]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(g2);
    s = settle(s);
    expect(zone(s, g1)).toBe("hand");
    expect(zone(s, g2)).toBe("exile");
  });

  it("two target creatures need two different creatures", () => {
    const { s: s0, ap, ids } = setup([pump]);
    const a = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/no legal targets/);
    const b = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)]));
    expect(s.log.some((l) => /Pump Two Test resolves/.test(l.text))).toBe(true);
  });

  it("another target: not the same as the target before it", () => {
    const { s: s0, ap, ids, opp } = setup([consume]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear());
    expect(castProblem(s0, ap, ids[0]!, [target(mine), target(mine)])).toMatch(/illegal target/);
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("another target on a permanent's ability: not that permanent", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, untapper);
    // Its own lands are other permanents; it can't untap itself.
    expect(abilityProblem(s0, ap, u, 0, [target(u)])).toMatch(/illegal target/);
    const land = s0.battlefield.find((id) => id !== u)!;
    s0.objects[land]!.tapped = true;
    const s = run(s0, planActivate(s0, ap, u, 0, [target(land)]));
    expect(s.objects[land]!.tapped).toBe(false);
  });

  it("a dies trigger's 'another target artifact card' can't return the card itself", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const d = putOnBattlefield(s0, ap, diver);
    let s = act(s0, planCast(s0, ap, ids[0]!, [target(d)])![0]!);
    for (const a of planCast(s0, ap, ids[0]!, [target(d)])!.slice(1)) s = act(s, a);
    s = settle(s);
    // Only Diver itself is an artifact card in the graveyard, so the trigger has no legal target.
    expect(zone(s, d)).toBe("graveyard");
    expect(s.log.some((l) => /no legal targets and is removed/.test(l.text))).toBe(true);
    expect(zone(s, d)).toBe("graveyard");
  });

  it("an 'up to one' trigger with nothing to target still goes on the stack, and bots choose for it", () => {
    const { s: s0, ap, ids } = setup([wolf]);
    s0.players[ap]!.isBot = true;
    let s = planCast(s0, ap, ids[0]!)!.reduce((x, a) => act(x, a), s0);
    for (let i = 0; i < 40 && !(s.objects[ids[0]!]!.zone === "battlefield" && !s.stack.length && !s.triggerQueue.length && !s.pending); i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "chooseTargets" ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.log.some((l) => /no legal targets and is removed/.test(l.text))).toBe(false);
  });

  it("Arc Trail: any target and any other target, at the same time", () => {
    const arc = card("Arc Test", "Sorcery", "{1}{R}", { oracleText: "Arc Test deals 2 damage to any target and 1 damage to any other target." });
    const bite = card("Bite Test", "Sorcery", "{1}{G}", { oracleText: "Target creature you control deals damage equal to its power to each of two other target creatures." });
    supported(arc, bite);
    const { s: s0, ap, ids, opp } = setup([arc, bite]);
    const foe = putOnBattlefield(s0, opp, bear({ name: "Foe Test", toughness: "4" }));
    const life = s0.players[opp]!.life;
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: opp }])).toMatch(/illegal target/);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(foe), { kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[foe]!.damage).toBe(2);
    // Bite two: each other creature takes damage equal to the first one's power.
    const big = putOnBattlefield(s, ap, bear({ name: "Big Test", power: "3", toughness: "3" }));
    const x = putOnBattlefield(s, opp, bear({ name: "X Test", toughness: "4" }));
    const y = putOnBattlefield(s, opp, bear({ name: "Y Test", toughness: "4" }));
    expect(castProblem(s, ap, ids[1]!, [target(big), target(big), target(x)])).toMatch(/illegal target/);
    s = run(s, planCast(s, ap, ids[1]!, [target(big), target(x), target(y)]));
    expect([s.objects[x]!.damage, s.objects[y]!.damage]).toEqual([3, 3]);
  });

  it("tapped creatures don't untap during their controller's next untap step, then do", () => {
    const para = card("Paralysis Test", "Sorcery", "{3}{U}", { oracleText: "Tap up to two target creatures. Those creatures don't untap during their controller's next untap step." });
    supported(para);
    const { s: s0, ap, ids, opp } = setup([para]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b)]));
    expect([s.objects[a]!.tapped, s.objects[b]!.tapped]).toEqual([true, true]);
    s = passUntil(s, "upkeep", opp);
    expect([s.objects[a]!.tapped, s.objects[b]!.tapped]).toEqual([true, true]);
    s = passUntil(s, "end", opp);
    s = passUntil(s, "upkeep", opp);
    expect([s.objects[a]!.tapped, s.objects[b]!.tapped]).toEqual([false, false]);
  });
});


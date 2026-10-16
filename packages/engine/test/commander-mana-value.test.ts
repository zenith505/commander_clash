// "If you control a commander, you may cast this spell without paying its mana cost" (CR 118.9, 903.3: any player's
// commander you control counts), "as long as you control a commander that's a creature or planeswalker", lands that
// enter tapped depending on what you control, and "target spell with mana value X / creature with power X or less"
// (CR 107.3a, 202.3e: an X spell's mana value on the stack includes its X).

import { describe, expect, it } from "vitest";
import { act, bear, card, island, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const guardianship = card("Fierce Guardianship", "Instant", "{2}{U}", { oracleText: "If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell." });
const merfolk = card("Gray Harbor Merfolk", "Creature — Merfolk Rogue", "{1}{U}", { power: "0", toughness: "3", oracleText: "This creature can't be blocked.\nThis creature gets +2/+0 as long as you control a commander that's a creature or planeswalker." });
const roads = card("Country Roads", "Land", "", {
  oracleText: "This land enters tapped unless you control a Mount or Vehicle.\n{T}: Add {W}.\n{1}{W}, {T}, Sacrifice this land: Create a 1/1 colorless Pilot creature token with \"This token saddles Mounts and crews Vehicles as though its power were 2 greater.\" Activate only as a sorcery.",
});
const cave = card("Cave of the Frost Dragon", "Land", "", { oracleText: "If you control two or more other lands, this land enters tapped.\n{T}: Add {W}.\n{4}{W}: This land becomes a 3/4 white Dragon creature with flying until end of turn. It's still a land." });
const snare = card("Spell Snare", "Instant", "{U}", { oracleText: "Counter target spell with mana value 2." });
const blast = card("Spell Blast", "Instant", "{X}{U}", { oracleText: "Counter target spell with mana value X. (For example, if that spell's mana cost is {3}{U}{U}, X is 5.)" });
const stroke = card("Disdainful Stroke", "Instant", "{1}{U}", { oracleText: "Counter target spell with mana value 4 or greater." });
const glare = card("Killing Glare", "Instant", "{X}{B}", { oracleText: "Destroy target creature with power X or less." });
const gangUp = card("Gang Up", "Instant", "{X}{B}", { oracleText: "Assist (Another player can pay up to {X} of this spell's cost. You choose the value of X.)\nDestroy target creature with power X or less.", keywords: ["Assist"] });
const blaze = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });
const concentrate = card("Concentrate", "Sorcery", "{2}{U}{U}", { oracleText: "Draw three cards." });
const wagon = card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const alt = { alt: "alternative" as const };
const top = (s: GameState) => ({ kind: "stack" as const, id: s.stack.at(-1)!.id });
/** Castable with these targets, tapping lands as needed. */
const castable = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[], x?: number) => planCast(s, pid, id, targets, undefined, "auto", x) !== null;
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"));

describe("if you control a commander", () => {
  it("is supported", () => [guardianship, merfolk].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Fierce Guardianship is free only while we control a commander (anyone's, CR 903.3)", () => {
    const { s: s0, ap, ids, opp } = setup([opt, guardianship]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Our commander is in the command zone: no free cast.
    expect(castProblem(s, ap, ids[1]!, [top(s)], undefined, undefined, undefined, undefined, alt)).toBeTruthy();
    // An opponent's commander we've gained control of counts.
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Commander" }), { commander: true });
    s.objects[theirs]!.controller = ap;
    expect(castProblem(s, ap, ids[1]!, [top(s)], undefined, undefined, undefined, undefined, alt)).toBeNull();
    const plan = planCast(s, ap, ids[1]!, [top(s)], undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
    s = passAll(run(s, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand).not.toContain(ids[0]);
  });

  it("it counters only noncreature spells", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Bear Spell" }), guardianship]);
    putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(castProblem(s, ap, ids[1]!, [top(s)], undefined, undefined, undefined, undefined, alt)).toBeTruthy();
  });

  it("a bot with its commander out counters a big spell for free", () => {
    const { s: s0, ap, ids, opp } = setup([concentrate]);
    putOnBattlefield(s0, opp, bear({ name: "Bot Commander" }), { commander: true });
    const fg = toHand(s0, opp, guardianship);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, opp);
    expect(acts.at(-1)).toMatchObject({ type: "castSpell", objectId: fg, alt: "alternative" });
  });

  it("Gray Harbor Merfolk gets +2/+0 while our commander creature is on the battlefield", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, merfolk);
    expect(pt(s, m)).toBe("0/3");
    putOnBattlefield(s, ap, bear({ name: "My Commander" }), { commander: true });
    expect(pt(s, m)).toBe("2/3");
  });
});

describe("lands that enter tapped depending on what we control", () => {
  it("is supported", () => [roads, cave].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Country Roads enters tapped unless we control a Mount or Vehicle", () => {
    const { s: s0, ap, ids } = setup([roads]);
    expect(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }).objects[ids[0]!]!.tapped).toBe(true);
    const { s: t0, ap: ap2, ids: ids2 } = setup([roads]);
    putOnBattlefield(t0, ap2, wagon);
    expect(act(t0, { type: "playLand", player: ap2, objectId: ids2[0]! }).objects[ids2[0]!]!.tapped).toBe(false);
  });

  it("Cave of the Frost Dragon enters tapped with two or more other lands", () => {
    const { s: s0, ap, ids } = setup([cave]);
    expect(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }).objects[ids[0]!]!.tapped).toBe(true);
    const { s: t0, ap: ap2, ids: ids2, opp } = setup([cave]);
    // Leave one other land: hand the rest to an opponent.
    for (const id of landsOf(t0, ap2).slice(1)) t0.objects[id]!.controller = opp;
    expect(act(t0, { type: "playLand", player: ap2, objectId: ids2[0]! }).objects[ids2[0]!]!.tapped).toBe(false);
  });
});

describe("mana value or power X", () => {
  it("is supported", () => [snare, blast, stroke, glare, gangUp].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Spell Snare: mana value 2 exactly, counting an X spell's X on the stack (CR 202.3e)", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Bear Spell" }), snare]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(castable(s, ap, ids[1]!, [top(s)])).toBe(true);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [top(s)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const { s: t0, ap: a2, ids: i2 } = setup([blaze, snare, blaze]);
    // Blaze with X=1 is mana value 2; with X=2 it's 3.
    let t = run(t0, planCast(t0, a2, i2[0]!, [{ kind: "player", id: a2 }], undefined, "auto", 1));
    expect(castable(t, a2, i2[1]!, [top(t)])).toBe(true);
    const { s: u0, ap: a3, ids: i3 } = setup([blaze, snare]);
    const u = run(u0, planCast(u0, a3, i3[0]!, [{ kind: "player", id: a3 }], undefined, "auto", 2));
    expect(castable(u, a3, i3[1]!, [top(u)])).toBe(false);
    t = passAll(run(t, planCast(t, a2, i2[1]!, [top(t)])));
    expect(t.objects[i2[0]!]!.zone).toBe("graveyard");
  });

  it("Spell Blast: X must be the target's mana value", () => {
    const { s: s0, ap, ids } = setup([concentrate, blast]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(castable(s, ap, ids[1]!, [top(s)], 3)).toBe(false);
    expect(castable(s, ap, ids[1]!, [top(s)], 4)).toBe(true);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [top(s)], undefined, "auto", 4)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a bot casts Spell Blast with X equal to the spell's mana value", () => {
    const { s: s0, ap, ids, opp } = setup([concentrate]);
    for (let i = 0; i < 7; i++) putOnBattlefield(s0, opp, island); // more than enough: X is still 4
    const sb = toHand(s0, opp, blast);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, opp).at(-1)).toMatchObject({ type: "castSpell", objectId: sb, x: 4 });
  });

  it("Disdainful Stroke: mana value 4 or greater", () => {
    const { s: s0, ap, ids } = setup([concentrate, stroke]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(castable(s, ap, ids[1]!, [top(s)])).toBe(true);
    const { s: t0, ap: a2, ids: i2 } = setup([opt, stroke]);
    const t = run(t0, planCast(t0, a2, i2[0]!));
    expect(castable(t, a2, i2[1]!, [top(t)])).toBe(false);
  });

  it("Killing Glare and Gang Up: power X or less", () => {
    for (const d of [glare, gangUp]) {
      const { s: s0, ap, ids, opp } = setup([d]);
      const big = putOnBattlefield(s0, opp, bear({ name: "Big", power: "4", toughness: "4" }));
      // Before X is announced it can be cast: some X will do (CR 601.2b).
      expect(planCast(s0, ap, ids[0]!), d.name).not.toBeNull();
      expect(castable(s0, ap, ids[0]!, [target(big)], 3), d.name).toBe(false);
      const s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(big)], undefined, "auto", 4)));
      expect(s.objects[big]!.zone, d.name).toBe("graveyard");
    }
  });
});

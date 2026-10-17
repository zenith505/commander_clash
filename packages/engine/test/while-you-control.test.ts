// "For as long as you control ~" (CR 611.2b): Master Thief, Dragonlord Silumgar, Aegis Angel, Icefall Regent, Quicksmith
// Spy, Extraction Specialist, Time of Ice, Thrull Champion. The effect ends when its source leaves the battlefield, phases
// out (CR 702.26f) or comes under another player's control, and doesn't come back if you regain control of it (rulings on
// Dragonlord Silumgar, Aegis Angel). If that already happened before the ability resolves, it does nothing (CR 611.2b,
// Master Thief).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { controllerOf, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { moveObject } from "../src/game";

// Real oracle text (Scryfall).
const thief = card("Master Thief", "Creature — Human Rogue", "{2}{U}{U}", { power: "2", toughness: "2", oracleText: "When this creature enters, gain control of target artifact for as long as you control this creature." });
const aegis = card("Aegis Angel", "Creature — Angel", "{4}{W}{W}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhen this creature enters, another target permanent gains indestructible for as long as you control this creature. (Effects that say \"destroy\" don't destroy it. A creature with indestructible can't be destroyed by damage.)" });
const icefall = card("Icefall Regent", "Creature — Dragon", "{3}{U}{U}", { power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, tap target creature an opponent controls. That creature doesn't untap during its controller's untap step for as long as you control this creature.\nSpells your opponents cast that target this creature cost {2} more to cast." });
const silumgar = card("Dragonlord Silumgar", "Legendary Creature — Elder Dragon", "{4}{U}{B}", { power: "3", toughness: "5", keywords: ["Deathtouch", "Flying"], oracleText: "Flying, deathtouch\nWhen Dragonlord Silumgar enters, gain control of target creature or planeswalker for as long as you control Dragonlord Silumgar." });
const spy = card("Quicksmith Spy", "Creature — Human Artificer", "{3}{U}", { power: "2", toughness: "3", oracleText: "When this creature enters, target artifact you control gains \"{T}: Draw a card\" for as long as you control this creature." });
const extraction = card("Extraction Specialist", "Creature — Human Rogue", "{2}{W}", { power: "3", toughness: "2", keywords: ["Lifelink"], oracleText: "Lifelink\nWhen this creature enters, return target creature card with mana value 2 or less from your graveyard to the battlefield. That creature can't attack or block for as long as you control this creature." });
const timeOfIce = card("Time of Ice", "Enchantment — Saga", "{3}{U}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Tap target creature an opponent controls. It doesn't untap during its controller's untap step for as long as you control this Saga.\nIII — Return all tapped creatures to their owners' hands." });
const thrull = card("Thrull Champion", "Creature — Thrull", "{4}{B}", { power: "2", toughness: "2", oracleText: "Thrull creatures get +1/+1.\n{T}: Gain control of target Thrull for as long as you control this creature." });
const trinket = card("Plain Trinket", "Artifact", "{1}", { oracleText: "" });
const thrullToken = card("Some Thrull", "Creature — Thrull", "{1}", { power: "1", toughness: "1" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Resolve everything, answering a trigger's target with `pick`. */
const settle = (s: GameState, me: PlayerId, pick?: ObjectId) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseTargets" && pick) s = act(s, { type: "chooseTargets", player: me, targets: [target(pick)] });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Cast a creature from hand and resolve it and its enters trigger aimed at `pick`. */
const enter = (s: GameState, pid: PlayerId, id: ObjectId, pick: ObjectId) => settle(run(s, planCast(s, pid, id)), pid, pick);
/** One priority pass: state-based checks see what changed. */
const sba = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const ctl = (s: GameState, id: ObjectId) => controllerOf(s, s.objects[id]!);

describe("for as long as you control ~", () => {
  it("compiles", () => supported(thief, aegis, icefall, silumgar, spy, extraction, timeOfIce, thrull));

  it("Master Thief: the artifact is yours until the Thief leaves", () => {
    const { s: s0, ap, opp, ids } = setup([thief]);
    const art = putOnBattlefield(s0, opp, trinket);
    let s = enter(s0, ap, ids[0]!, art);
    expect(ctl(s, art)).toBe(ap);
    moveObject(s, ids[0]!, "graveyard");
    s = sba(s);
    expect(ctl(s, art)).toBe(opp);
    expect(s.effects).toHaveLength(0);
  });

  it("Master Thief: if you lost control of it before the trigger resolves, it does nothing (CR 611.2b)", () => {
    const { s: s0, ap, opp, ids } = setup([thief]);
    const art = putOnBattlefield(s0, opp, trinket);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // Resolve the creature spell; stop with the trigger about to go on the stack or on it.
    for (let i = 0; i < 10 && s.stack.some((x) => x.kind === "spell"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(art)] });
    expect(s.stack).toHaveLength(1);
    addEffect(s, opp, [ids[0]!], [{ kind: "control" }], "game");
    s = settle(s, ap);
    expect(ctl(s, art)).toBe(opp);
    expect(s.log.some((l) => /Master Thief's effect does nothing/.test(l.text))).toBe(true);
  });

  it("Dragonlord Silumgar: another player gaining control of it ends the effect, and regaining it doesn't bring it back", () => {
    const { s: s0, ap, opp, ids } = setup([silumgar]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = enter(s0, ap, ids[0]!, theirs);
    expect(ctl(s, theirs)).toBe(ap);
    const steal = addEffect(s, opp, [ids[0]!], [{ kind: "control" }], "game");
    s = sba(s);
    expect(ctl(s, theirs)).toBe(opp);
    s.effects = s.effects.filter((e) => e.id !== steal.id);
    s = sba(s);
    expect(ctl(s, ids[0]!)).toBe(ap);
    expect(ctl(s, theirs)).toBe(opp);
  });

  it("Aegis Angel: indestructible while you control the Angel", () => {
    const { s: s0, ap, ids } = setup([aegis]);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = enter(s0, ap, ids[0]!, mine);
    expect(objHasKeyword(s, s.objects[mine]!, "indestructible")).toBe(true);
    moveObject(s, ids[0]!, "exile");
    s = sba(s);
    expect(objHasKeyword(s, s.objects[mine]!, "indestructible")).toBe(false);
  });

  it("Icefall Regent: the creature stays tapped through its controller's untap step, then untaps once the Regent is gone", () => {
    const { s: s0, ap, opp, ids } = setup([icefall]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = enter(s0, ap, ids[0]!, theirs);
    expect(s.objects[theirs]!.tapped).toBe(true);
    s = passUntil(sba(s), "upkeep", opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
    moveObject(s, ids[0]!, "graveyard");
    s = passUntil(sba(s), "upkeep", ap);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[theirs]!.tapped).toBe(false);
  });

  it("Quicksmith Spy: the artifact gains '{T}: Draw a card'", () => {
    const { s: s0, ap, ids } = setup([spy]);
    const art = putOnBattlefield(s0, ap, trinket);
    let s = enter(s0, ap, ids[0]!, art);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, art, 0)), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    moveObject(s, ids[0]!, "graveyard");
    s = sba(s);
    expect(planActivate(s, ap, art, 0)).toBeNull();
  });

  it("Extraction Specialist: the returned creature can't attack or block while you control the Specialist", () => {
    const { s: s0, ap, ids } = setup([extraction]);
    const dead = putOnBattlefield(s0, ap, bear());
    moveObject(s0, dead, "graveyard");
    let s = enter(s0, ap, ids[0]!, dead);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[dead]!.cardId)!;
    expect(s.effects).toEqual([expect.objectContaining({ affected: [back], duration: "whileControlled", mods: [{ kind: "cantAttack" }, { kind: "cantBlock" }] })]);
    moveObject(s, ids[0]!, "graveyard");
    s = sba(s);
    expect(s.effects).toHaveLength(0);
  });

  it("Thrull Champion's {T} ability", () => {
    const { s: s0, ap, opp } = setup([]);
    const champ = putOnBattlefield(s0, ap, thrull);
    const theirs = putOnBattlefield(s0, opp, thrullToken);
    let s = settle(run(s0, planActivate(s0, ap, champ, 0, [target(theirs)])), ap);
    expect(ctl(s, theirs)).toBe(ap);
    moveObject(s, champ, "graveyard");
    s = sba(s);
    expect(ctl(s, theirs)).toBe(opp);
  });
});

// Suspect (CR 701.60): a designation a permanent keeps until it leaves the battlefield or an effect ends it. A suspected
// permanent has menace and "This creature can't block" (701.60c) and can't become suspected again (701.60d). Rulings:
// losing all abilities removes menace and "can't block" but not the designation; a copy isn't suspected.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const doubt = card("Reasonable Doubt", "Instant", "{1}{U}", { oracleText: "Counter target spell unless its controller pays {2}.\nSuspect up to one target creature. (A suspected creature has menace and can't block.)" });
const agrus = card("Agrus Kos, Spirit of Justice", "Legendary Creature — Spirit Detective", "{2}{R}{W}", { power: "2", toughness: "4", oracleText: "Double strike, vigilance\nWhenever Agrus Kos enters or attacks, choose up to one target creature. If it's suspected, exile it. Otherwise, suspect it. (A suspected creature has menace and can't block.)" });
const offender = card("Repeat Offender", "Creature — Human Assassin", "{1}{B}", { power: "2", toughness: "1", oracleText: "{2}{B}: If this creature is suspected, put a +1/+1 counter on it. Otherwise, suspect it. (A suspected creature has menace and can't block.)" });
const braggart = card("Rubblebelt Braggart", "Creature — Lizard Warrior", "{4}{R}", { power: "5", toughness: "5", oracleText: "Whenever this creature attacks, if it's not suspected, you may suspect it. (A suspected creature has menace and can't block.)" });
const addUp = card("It Doesn't Add Up", "Instant", "{3}{B}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield. Suspect it. (It has menace and can't block.)" });
const eliminate = card("Eliminate the Impossible", "Instant", "{1}{U}", { oracleText: "Investigate. Creatures your opponents control get -2/-0 until end of turn. If any of them are suspected, they're no longer suspected. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const complication = card("Deadly Complication", "Sorcery", "{1}{B}{R}", { oracleText: "Choose one or both —\n• Destroy target creature.\n• Put a +1/+1 counter on target suspected creature you control. You may have it become no longer suspected." });
const meddler = card("Clandestine Meddler", "Creature — Vampire Rogue", "{2}{B}", { power: "3", toughness: "2", oracleText: "When this creature enters, suspect up to one other target creature you control. (A suspected creature has menace and can't block.)\nWhenever one or more suspected creatures you control attack, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)" });
const lammasu = card("Absolving Lammasu", "Creature — Lammasu", "{4}{W}", { power: "4", toughness: "3", oracleText: "Flying\nWhen this creature enters, all suspected creatures are no longer suspected.\nWhen this creature dies, you gain 3 life and suspect up to one target creature an opponent controls. (A suspected creature has menace and can't block.)" });
const person = card("Person of Interest", "Creature — Human Rogue", "{3}{R}", { power: "2", toughness: "2", oracleText: "When this creature enters, suspect it. Create a 2/2 white and blue Detective creature token. (A suspected creature has menace and can't block.)" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const isSuspected = (s: GameState, id: string) => s.objects[id]!.suspected !== undefined;
const hasMenace = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords.includes("Menace");
const cantBlock = (s: GameState, id: string) => characteristics(s, s.objects[id]!).cantBlock;
/** Resolve everything: "you may" answered `yes` (paying its mana), a trigger's targets with `targets`. */
function settle(s: GameState, targets: TargetChoice[] = [], yes = true) {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pend = s.pending;
    if (pend?.kind === "chooseMay") {
      if (yes && pend.pay?.mana) for (const a of planMana(s, pend.player, parseManaCost(pend.pay.mana))!) s = act(s, a);
      s = act(s, { type: "chooseMay", player: pend.player, yes });
    } else if (pend?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pend.player, targets });
    else if (pend?.kind === "payUnless") s = act(s, { type: "payUnless", player: pend.player, pay: false });
    else if (pend) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function inGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
}
function attack(s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) {
  s = passUntil(s, "declareAttackers", pid);
  return act(s, { type: "declareAttackers", player: pid, attacks });
}

describe("suspect", () => {
  it("compiles them", () => {
    supported(doubt, agrus, offender, braggart, addUp, eliminate, complication, meddler, lammasu, person);
    expect(compileCard(braggart).triggers[0]).toMatchObject({ event: "selfAttacks", ifCond: { kind: "suspected", not: true } });
    expect(compileCard(meddler).triggers[1]).toMatchObject({ group: { suspected: true } });
  });

  it("a suspected creature has menace and can't block; suspecting it again keeps its timestamp", () => {
    let { s, ap, ids, opp } = setup([bear(), doubt, bear(), doubt]);
    const theirs = putOnBattlefield(s, opp, bear());
    expect(cantBlock(s, theirs)).toBe(false);
    // Reasonable Doubt needs a spell to target: our own creature spell, still on the stack.
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }, target(theirs)])), [], false);
    expect(isSuspected(s, theirs)).toBe(true);
    expect(hasMenace(s, theirs)).toBe(true);
    expect(cantBlock(s, theirs)).toBe(true);
    const first = s.objects[theirs]!.suspected;
    // A suspected permanent can't become suspected again (CR 701.60d).
    s = run(s, planCast(s, ap, ids[2]!));
    s = settle(run(s, planCast(s, ap, ids[3]!, [{ kind: "stack", id: s.stack[0]!.id }, target(theirs)])), [], false);
    expect(s.objects[theirs]!.suspected).toBe(first);
  });

  it("losing all abilities afterwards removes menace and can't block, but it stays suspected; leaving ends it", () => {
    const { s, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s, opp, bear());
    s.objects[theirs]!.suspected = s.nextTimestamp++;
    addEffect(s, ap, [theirs], [{ kind: "loseAllAbilities" }]);
    expect(isSuspected(s, theirs)).toBe(true);
    expect(hasMenace(s, theirs)).toBe(false);
    expect(cantBlock(s, theirs)).toBe(false);
    // Suspected after losing its abilities: the later timestamp gives them back (CR 613.7).
    const other = putOnBattlefield(s, opp, bear());
    addEffect(s, ap, [other], [{ kind: "loseAllAbilities" }]);
    s.objects[other]!.suspected = s.nextTimestamp++;
    expect(hasMenace(s, other)).toBe(true);
    // A new object isn't suspected (CR 400.7, 701.60a).
    moveObject(s, other, "hand");
    expect(s.objects[other]!.suspected).toBeUndefined();
  });

  it("Agrus Kos suspects a creature as it enters, then exiles it when it attacks", () => {
    let { s, ap, ids, opp } = setup([agrus]);
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!)), [target(theirs)]);
    expect(isSuspected(s, theirs)).toBe(true);
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = settle(attack(s, ap, [{ attacker: ids[0]!, defender: opp }]), [target(theirs)]);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });

  it("Repeat Offender suspects itself, then grows; Rubblebelt Braggart may suspect itself as it attacks", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, offender);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    s = settle(run(s, planActivate(s, ap, r, 0)));
    expect(isSuspected(s, r)).toBe(true);
    expect(s.objects[r]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planActivate(s, ap, r, 0)));
    expect(s.objects[r]!.counters["+1/+1"]).toBe(1);
    expect(isSuspected(s, r)).toBe(true);

    const b = putOnBattlefield(s, ap, braggart);
    s = settle(attack(s, ap, [{ attacker: b, defender: opp }]));
    expect(isSuspected(s, b)).toBe(true);
    expect(hasMenace(s, b)).toBe(true);
  });

  it("It Doesn't Add Up suspects the creature it returns; Person of Interest suspects itself", () => {
    let { s, ap, ids } = setup([addUp, person]);
    const dead = inGraveyard(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [target(dead)])));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(isSuspected(s, dead)).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(isSuspected(s, ids[1]!)).toBe(true);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
  });

  it("Eliminate the Impossible and Absolving Lammasu end it; Deadly Complication targets only a suspected creature", () => {
    let { s, ap, ids, opp } = setup([eliminate, complication, lammasu]);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    s.objects[theirs]!.suspected = s.nextTimestamp++;
    s.objects[mine]!.suspected = s.nextTimestamp++;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(isSuspected(s, theirs)).toBe(false);
    expect(isSuspected(s, mine)).toBe(true); // only the opponents' creatures

    const other = putOnBattlefield(s, ap, bear());
    expect(planCast(s, ap, ids[1]!, [target(other)], [1])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(mine)], [1])));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(isSuspected(s, mine)).toBe(false);

    s.objects[mine]!.suspected = s.nextTimestamp++;
    s.objects[theirs]!.suspected = s.nextTimestamp++;
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(isSuspected(s, mine)).toBe(false);
    expect(isSuspected(s, theirs)).toBe(false);
  });

  it("Clandestine Meddler suspects another creature you control and surveils when suspected creatures attack", () => {
    let { s, ap, ids, opp } = setup([meddler]);
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!)), [target(mine)]);
    expect(isSuspected(s, mine)).toBe(true);
    s = attack(s, ap, [{ attacker: mine, defender: opp }]);
    s = settle(s);
    // Surveil 1 asks where the top card goes.
    expect(s.pending).toMatchObject({ player: ap });
    expect(JSON.stringify(s.pending)).toMatch(/surveil/i);
  });
});

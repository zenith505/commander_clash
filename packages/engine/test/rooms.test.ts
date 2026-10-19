// Rooms (CR 709.5): split cards with a shared type line whose halves are doors. Cast as one door, a Room enters with
// that door unlocked (709.5d); from anywhere else it enters with both locked. On the battlefield it has the name, mana
// cost and text of its unlocked doors only; its controller unlocks a locked door by paying its mana cost, a special
// action at sorcery speed (116.2m, 709.5e), and "when you unlock this door" triggers then (709.5h).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, defMv, defOf, isFullySupported, legalActions, planCast, planUnlock, unlockProblem, waitingOn, type Action, type GameState } from "../src";
import { moveObject } from "../src/game";

const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
// Real oracle text (Scryfall).
const pool = scry("split", [
  { name: "Bottomless Pool", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, return up to one target creature to its owner's hand.${REMINDER}` },
  { name: "Locker Room", mana_cost: "{4}{U}", type_line: "Enchantment — Room", oracle_text: `Whenever one or more creatures you control deal combat damage to a player, draw a card.${REMINDER}` },
]);
const glassworks = scry("split", [
  { name: "Glassworks", mana_cost: "{2}{R}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, this Room deals 4 damage to target creature an opponent controls.${REMINDER}` },
  { name: "Shattered Yard", mana_cost: "{4}{R}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your end step, this Room deals 1 damage to each opponent.${REMINDER}` },
]);
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ogre = card("Ogre", "Creature — Ogre", "{3}{R}", { power: "4", toughness: "4" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("Rooms (CR 709.5)", () => {
  it("compile, both doors", () => {
    expect(isFullySupported(pool)).toBe(true);
    expect(isFullySupported(glassworks)).toBe(true);
  });

  it("cast as Bottomless Pool: enters with that door unlocked, which triggers; only that door's name, cost and text", () => {
    const { s: s0, ap, opp, ids } = setup([pool]);
    const b = putOnBattlefield(s0, opp, bear);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 0 }));
    s = settle(s);
    // The unlock trigger targets up to one creature.
    if (s.pending) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    const r = ids[0]!;
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.unlocked).toEqual([0]);
    expect(name(s, r)).toBe("Bottomless Pool");
    expect(defMv(defOf(s, s.objects[r]!))).toBe(1);
    expect(characteristics(s, s.objects[r]!).colors).toEqual(["U"]);
    expect(characteristics(s, s.objects[r]!).subtypes).toEqual(["Room"]);
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("unlocking Locker Room for {4}{U}: a special action at sorcery speed; then it has both names and mana value 6", () => {
    const { s: s0, ap, opp, ids } = setup([pool]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 0 })));
    if (s.pending) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    const r = ids[0]!;
    // Not the left door again, and not by another player.
    expect(unlockProblem(s, ap, r, 0)).toMatch(/locked door/);
    expect(unlockProblem(s, opp, r, 1)).toMatch(/you control/);
    expect(legalActions(s, ap).some((a) => a.type === "unlockDoor")).toBe(false); // the mana isn't in the pool yet
    s = run(s, planUnlock(s, ap, r, 1));
    expect(s.objects[r]!.unlocked).toEqual([0, 1]);
    expect(name(s, r)).toBe("Bottomless Pool // Locker Room");
    expect(defMv(defOf(s, s.objects[r]!))).toBe(6);
    expect(s.log.some((l) => /unlocks Locker Room \(\{4\}\{U\}\)/.test(l.text))).toBe(true);
    // In the graveyard it's both halves again, with neither designation (CR 709.4).
    moveObject(s, r, "graveyard");
    expect(s.objects[r]!.unlocked).toBeUndefined();
    expect(defMv(defOf(s, s.objects[r]!))).toBe(6);
  });

  it("not during combat or an opponent's turn, nor with a spell on the stack", () => {
    const { s: s0, ap, ids } = setup([pool, glassworks]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 0 })));
    if (s.pending) s = settle(act(s, botActions(s, waitingOn(s)!)[0]!));
    const r = ids[0]!;
    s = run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { face: 1 }));
    expect(s.stack.length).toBe(1);
    expect(unlockProblem(s, ap, r, 1)).toMatch(/main phase while the stack is empty/);
    s = settle(s);
    s = passUntil(s, "beginCombat", ap);
    expect(unlockProblem(s, ap, r, 1)).toMatch(/main phase/);
  });

  it("put onto the battlefield from anywhere else, both doors are locked: no name, no abilities, mana value 0", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, glassworks);
    const s = s0;
    expect(s.objects[r]!.unlocked).toEqual([]);
    expect(name(s, r)).toBe("");
    expect(defMv(defOf(s, s.objects[r]!))).toBe(0);
    expect(characteristics(s, s.objects[r]!).colors).toEqual([]);
    expect(characteristics(s, s.objects[r]!).types).toEqual(["Enchantment"]);
  });

  it("Glassworks: unlocking the door later triggers it too (CR 709.5h); Shattered Yard deals damage at the end step", () => {
    const { s: s0, ap, opp, ids } = setup([glassworks]);
    const o = putOnBattlefield(s0, opp, ogre);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    const r = ids[0]!;
    expect(s.objects[r]!.unlocked).toEqual([1]);
    expect(name(s, r)).toBe("Shattered Yard");
    expect(s.objects[o]!.damage).toBe(0);
    // Next turn, unlock Glassworks: 4 damage to the Ogre.
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    s = run(s, planUnlock(s, ap, r, 0));
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    s = settle(s);
    if (s.pending) s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[o]!.zone).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = settle(passUntil(s, "end", ap));
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("a bot casts a door, then unlocks the other when it has the mana", () => {
    const { s: s0, ap, ids } = setup([glassworks]);
    let s = s0;
    for (const h of s.players[ap]!.hand.filter((x) => x !== ids[0])) moveObject(s, h, "library");
    for (let i = 0; i < 40 && s.objects[ids[0]!]!.unlocked?.length !== 2 && s.step === "main1"; i++) {
      const pid = waitingOn(s)!;
      const a = pid === ap ? botActions(s, ap)[0] : { type: "passPriority" as const, player: pid };
      if (!a) break;
      s = act(s, a);
    }
    expect(s.objects[ids[0]!]!.unlocked).toEqual([0, 1]);
  });
});

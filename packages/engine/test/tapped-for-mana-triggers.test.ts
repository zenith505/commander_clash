// Triggers on tapping a permanent for mana that aren't mana abilities (CR 106.12, 605.1b): their body adds no mana (or
// has a target), so they go on the stack the next time a player would receive priority (CR 603.3), after the spell being
// paid for is cast: Forbidden Orchard, Zhur-Taa Druid, Manabarbs, Burning Earth, Scald, Sanctimony, Savage Firecat,
// Vorinclex. Mana Flare's "that player adds" stays a mana ability.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, mountain, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { defOf } from "../src/cards";

// Real oracle text (Scryfall).
const orchard = card("Forbidden Orchard", "Land", "", { oracleText: "{T}: Add one mana of any color.\nWhenever you tap this land for mana, target opponent creates a 1/1 colorless Spirit creature token." });
const druid = card("Zhur-Taa Druid", "Creature \u2014 Human Druid", "{R}{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}.\nWhenever you tap this creature for mana, it deals 1 damage to each opponent." });
const manabarbs = card("Manabarbs", "Enchantment", "{3}{R}", { oracleText: "Whenever a player taps a land for mana, this enchantment deals 1 damage to that player." });
const burning = card("Burning Earth", "Enchantment", "{3}{R}", { oracleText: "Whenever a player taps a nonbasic land for mana, this enchantment deals 1 damage to that player." });
const sanctimony = card("Sanctimony", "Enchantment", "{1}{W}", { oracleText: "Whenever an opponent taps a Mountain for mana, you may gain 1 life." });
const firecat = card("Savage Firecat", "Creature \u2014 Elemental Cat", "{3}{R}{R}", { power: "0", toughness: "0", keywords: ["Trample"], oracleText: "Trample\nThis creature enters with seven +1/+1 counters on it.\nWhenever you tap a land for mana, remove a +1/+1 counter from this creature." });
const vorinclex = card("Vorinclex, Voice of Hunger", "Legendary Creature \u2014 Phyrexian Praetor", "{6}{G}{G}", { power: "7", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nWhenever you tap a land for mana, add one mana of any type that land produced.\nWhenever an opponent taps a land for mana, that land doesn't untap during its controller's next untap step." });
const scald = card("Scald", "Enchantment", "{1}{R}", { oracleText: "Whenever a player taps an Island for mana, this enchantment deals 1 damage to that player." });
const glory = card("Price of Glory", "Enchantment", "{2}{R}", { oracleText: "Whenever a player taps a land for mana, if it's not that player's turn, destroy that land." });
const flare = card("Mana Flare", "Enchantment", "{2}{R}", { oracleText: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tapFor = (pid: PlayerId, id: string, mana: ManaType): Action => ({ type: "activateMana", player: pid, objectId: id, mana });
/** Put the held triggers on the stack and resolve everything, answering nothing. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const spirits = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && /Spirit/.test(defOf(s, s.objects[id]!).name));
const pool = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);
/** The opponent gets priority: the active player passes with an empty stack. */
const toOpp = (s: GameState, ap: PlayerId, opp: PlayerId) => {
  s = act(s, { type: "passPriority", player: ap });
  expect(waitingOn(s)).toBe(opp);
  return s;
};
const nonbasic = card("Crumbling Vestige Test", "Land", "", { oracleText: "{T}: Add {C}." });

describe("tapped-for-mana triggers: parse", () => {
  it("the new shapes compile; one that adds mana stays a mana ability", () => {
    supported(orchard, druid, manabarbs, burning, sanctimony, firecat, vorinclex, scald);
    expect(compileCard(orchard).triggers).toMatchObject([{ event: "tappedForMana", manaTap: { by: "you" } }]);
    expect(compileCard(manabarbs).triggers).toMatchObject([{ event: "tappedForMana", manaTap: { by: "any", filter: { types: ["Land"] } } }]);
    expect(compileCard(flare).triggers).toEqual([]);
    expect(compileCard(flare).manaTriggers).toHaveLength(1);
    // An intervening "if" about whose turn it is (round 185; its behavior is tested in round185.test.ts).
    expect(isFullySupported(glory)).toBe(true);
  });
});

describe("Forbidden Orchard", () => {
  it("the mana comes at once; the trigger waits for the stack, and target opponent creates a 1/1 Spirit", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, orchard);
    let s = act(s0, tapFor(ap, o, "B"));
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.stack).toHaveLength(0);
    expect(s.triggerQueue).toHaveLength(1);
    // The next time a player would receive priority it's put on the stack, its target chosen then.
    s = act(s, { type: "passPriority", player: ap });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    const [t] = spirits(s, opp);
    expect(t).toBeDefined();
    expect(defOf(s, s.objects[t!]!)).toMatchObject({ power: "1", toughness: "1", colors: [] });
    expect(spirits(s, ap)).toEqual([]);
  });

  it("tapped to pay for a spell: the spell is cast first, the trigger goes on the stack above it", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const o = putOnBattlefield(s0, ap, orchard);
    const f = putOnBattlefield(s0, ap, forest);
    let s = act(s0, tapFor(ap, o, "G"));
    s = act(s, tapFor(ap, f, "G"));
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    // Cast (CR 601.2i), then as its caster would receive priority the trigger is put on the stack (CR 117.3c, 603.3).
    expect(s.stack.map((x) => x.kind)).toEqual(["spell"]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    expect(s.stack).toHaveLength(2);
    expect(s.stack[1]!.kind).not.toBe("spell");
  });

  it("autopay taps other lands before it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const o = putOnBattlefield(s0, ap, orchard);
    const plan = planCast(s0, ap, ids[0]!)!;
    expect(plan.some((a) => a.type === "activateMana" && a.objectId === o)).toBe(false);
  });
});

describe("whenever a player taps a land for mana", () => {
  it("Manabarbs deals 1 damage to whoever tapped a land, not a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, manabarbs);
    const theirs = putOnBattlefield(s0, opp, mountain);
    const elf = putOnBattlefield(s0, opp, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." }));
    const life = s0.players[opp]!.life;
    let s = act(toOpp(s0, ap, opp), tapFor(opp, theirs, "R"));
    s = act(s, tapFor(opp, elf, "G"));
    expect(s.triggerQueue).toHaveLength(1);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("Burning Earth: nonbasic lands only; Scald: Islands only", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, burning);
    putOnBattlefield(s0, ap, scald);
    const b = putOnBattlefield(s0, opp, forest);
    const n = putOnBattlefield(s0, opp, nonbasic);
    const i = putOnBattlefield(s0, opp, island);
    const life = s0.players[opp]!.life;
    let s = toOpp(s0, ap, opp);
    s = act(s, tapFor(opp, b, "G"));
    expect(s.triggerQueue).toHaveLength(0);
    s = act(s, tapFor(opp, n, "C"));
    s = act(s, tapFor(opp, i, "U"));
    expect(s.triggerQueue).toHaveLength(2);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Sanctimony: only an opponent's Mountain, and the life is optional", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sanctimony);
    const mine = putOnBattlefield(s0, ap, mountain);
    const theirs = putOnBattlefield(s0, opp, mountain);
    const life = s0.players[ap]!.life;
    let s = act(s0, tapFor(ap, mine, "R"));
    expect(s.triggerQueue).toHaveLength(0);
    s = settle(act(toOpp(s, ap, opp), tapFor(opp, theirs, "R")));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("Savage Firecat loses a counter each time its controller taps a land for mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const cat = putOnBattlefield(s0, ap, firecat);
    s0.objects[cat]!.counters["+1/+1"] = 7;
    const f = putOnBattlefield(s0, ap, forest);
    const theirs = putOnBattlefield(s0, opp, forest);
    let s = settle(act(s0, tapFor(ap, f, "G")));
    s = act(toOpp(s, ap, opp), tapFor(opp, theirs, "G"));
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.objects[cat]!.counters["+1/+1"]).toBe(6);
  });

  it("Vorinclex: your lands make more mana at once, an opponent's land doesn't untap next time", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, vorinclex);
    const mine = putOnBattlefield(s0, ap, forest);
    const theirs = putOnBattlefield(s0, opp, forest);
    let s = act(s0, tapFor(ap, mine, "G"));
    expect(s.players[ap]!.manaPool.G).toBe(2);
    expect(s.triggerQueue).toHaveLength(0);
    s = settle(act(toOpp(s, ap, opp), tapFor(opp, theirs, "G")));
    expect(s.objects[theirs]!.skipNextUntap).toBe(true);
  });

  it("Zhur-Taa Druid deals 1 damage to each opponent when tapped for mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, druid);
    const lives = s0.turnOrder.map((p) => s0.players[p]!.life);
    const s = settle(act(s0, tapFor(ap, d, "G")));
    expect(pool(s, ap)).toBe(1);
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(s0.turnOrder.map((p, i) => (p === ap ? lives[i]! : lives[i]! - 1)));
    expect(opp).not.toBe(ap);
  });
});

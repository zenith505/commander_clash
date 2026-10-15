// Doran's "assigns combat damage equal to its toughness rather than its power" (CR 510.1a as these modify it) and
// "can attack as though it didn't have defender" (CR 702.3b).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { combatDamageOf, invalidateCharacteristics, isFullySupported, potentialAttackers, power, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const doran = card("Doran, the Siege Tower", "Legendary Creature — Treefolk Shaman", "{W}{B}{G}", { power: "0", toughness: "5", oracleText: "Each creature assigns combat damage equal to its toughness rather than its power." });
const bedrockTortoise = card("Bedrock Tortoise", "Creature — Turtle", "{3}{G}", { power: "0", toughness: "6", oracleText: "During your turn, creatures you control have hexproof.\nEach creature you control with toughness greater than its power assigns combat damage equal to its toughness rather than its power." });
const gauntletsOfLight = card("Gauntlets of Light", "Enchantment — Aura", "{2}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +0/+2 and assigns combat damage equal to its toughness rather than its power.\nEnchanted creature has \"{2}{W}: Untap this creature.\"" });
const assaultFormation = card("Assault Formation", "Enchantment", "{1}{G}", { oracleText: "Each creature you control assigns combat damage equal to its toughness rather than its power.\n{G}: Target creature with defender can attack this turn as though it didn't have defender.\n{2}{G}: Creatures you control get +0/+1 until end of turn." });
const warmongersChariot = card("Warmonger's Chariot", "Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2.\nAs long as equipped creature has defender, it can attack as though it didn't have defender.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)" });
const highAlert = card("High Alert", "Enchantment", "{1}{W}{U}", { oracleText: "Each creature you control assigns combat damage equal to its toughness rather than its power.\nCreatures you control can attack as though they didn't have defender.\n{2}{W}{U}: Untap target creature." });
const billThePony = card("Bill the Pony", "Legendary Creature — Horse", "{3}{W}", { power: "1", toughness: "4", oracleText: "When Bill the Pony enters, create two Food tokens. (They're artifacts with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice a Food: Until end of turn, target creature you control assigns combat damage equal to its toughness rather than its power." });
const nivixCyclops = card("Nivix Cyclops", "Creature — Cyclops", "{1}{U}{R}", { power: "1", toughness: "4", keywords: ["Defender"], oracleText: "Defender\nWhenever you cast an instant or sorcery spell, this creature gets +3/+0 until end of turn and can attack this turn as though it didn't have defender." });
const wall = card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"], oracleText: "Defender" });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const wall13 = bear({ name: "Stone Wall", power: "1", toughness: "3" });

const o = (s: GameState, id: string) => s.objects[id]!;

describe("assigns combat damage equal to its toughness", () => {
  it("Doran: every creature, attacking or blocking, assigns its toughness; its power doesn't change", () => {
    supported(doran, bedrockTortoise, gauntletsOfLight, assaultFormation, warmongersChariot, highAlert, billThePony, nivixCyclops);
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, doran);
    const b = putOnBattlefield(s0, opp, wall13);
    expect(power(s0, o(s0, d))).toBe(0);
    expect(combatDamageOf(s0, o(s0, d))).toBe(5);
    expect(combatDamageOf(s0, o(s0, b))).toBe(3);
    // A 0-power attacker deals damage: Doran unblocked deals 5.
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    const life = s.players[opp]!.life;
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("Doran: a blocker deals its toughness to the attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, doran);
    const b = putOnBattlefield(s0, opp, wall13);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: d, defender: opp }] });
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker: b, attacker: d }] : [] } : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(o(s, d).damage).toBe(3);
    expect(o(s, b).zone).toBe("graveyard");
  });

  it("Bedrock Tortoise: only while its toughness is greater than its power, checked as damage is assigned", () => {
    const { s: s0, ap, ids } = setup([giantGrowth]);
    putOnBattlefield(s0, ap, bedrockTortoise);
    const tall = putOnBattlefield(s0, ap, bear({ name: "Tall", power: "1", toughness: "3" }));
    const wide = putOnBattlefield(s0, ap, bear({ name: "Wide", power: "3", toughness: "1" }));
    expect(combatDamageOf(s0, o(s0, tall))).toBe(3);
    expect(combatDamageOf(s0, o(s0, wide))).toBe(3);
    const s = cast(s0, ap, ids[0]!, [target(wide)]);
    expect(combatDamageOf(s, o(s, wide))).toBe(6); // 6/4: its power is greater
  });

  it("Gauntlets of Light: +0/+2 and the enchanted creature assigns its toughness", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const g = putOnBattlefield(s, ap, gauntletsOfLight);
    o(s, g).attachedTo = b;
    invalidateCharacteristics(s);
    expect(combatDamageOf(s, o(s, b))).toBe(4);
  });

  it("Bill the Pony: until end of turn, by sacrificing a Food", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear({ name: "Sturdy", power: "1", toughness: "5" }));
    const bill = putOnBattlefield(s0, ap, billThePony);
    const food = putOnBattlefield(s0, ap, card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." }));
    expect(combatDamageOf(s0, o(s0, b))).toBe(1);
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: bill, index: 0, targets: [target(b)], costs: { sacrifice: [food] } }));
    expect(combatDamageOf(s, o(s, b))).toBe(5);
  });
});

describe("attacking as though it didn't have defender", () => {
  it("High Alert: your creatures with defender can attack and deal their toughness", () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, wall);
    const theirs = putOnBattlefield(s, opp, wall);
    expect(potentialAttackers(s, ap).some((x) => x.id === w)).toBe(false);
    putOnBattlefield(s, ap, highAlert);
    putOnBattlefield(s, opp, wall);
    expect(potentialAttackers(s, ap).some((x) => x.id === w)).toBe(true);
    expect(combatDamageOf(s, o(s, w))).toBe(3);
    expect(combatDamageOf(s, o(s, theirs))).toBe(0);
  });

  it("Assault Formation: until end of turn, for the targeted creature with defender", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wall);
    const af = putOnBattlefield(s0, ap, assaultFormation);
    const s = activate(s0, ap, af, 0, [target(w)]);
    expect(potentialAttackers(s, ap).some((x) => x.id === w)).toBe(true);
    const later = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(later.effects.some((e) => e.affected.includes(w))).toBe(false);
  });

  it("Warmonger's Chariot: only while the equipped creature has defender", () => {
    const { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, wall);
    const c = putOnBattlefield(s, ap, warmongersChariot);
    o(s, c).attachedTo = w;
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, ap).some((x) => x.id === w)).toBe(true);
    expect(power(s, o(s, w))).toBe(2);
  });

  it("Nivix Cyclops: after an instant, +3/+0 and it can attack this turn", () => {
    const { s: s0, ap, ids } = setup([giantGrowth]);
    const n = putOnBattlefield(s0, ap, nivixCyclops);
    expect(potentialAttackers(s0, ap).some((x) => x.id === n)).toBe(false);
    const s = passAll(cast(s0, ap, ids[0]!, [target(n)]));
    expect(potentialAttackers(s, ap).some((x) => x.id === n)).toBe(true);
    expect(power(s, o(s, n))).toBe(7);
  });
});

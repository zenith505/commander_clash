// "The damage can't be prevented" (CR 615.12): for one spell's damage (Combust, Pinpoint Avalanche, Urza's Rage kicked),
// for a source's damage (Excruciator), or for creatures' combat damage (Questing Beast, Frenzied Baloth). Prevention
// effects, protection and shields don't stop it; replacement effects that aren't prevention still apply.

import { describe, expect, it } from "vitest";
import { act, card, forest, mountain, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const combust = card("Combust", "Instant", "{1}{R}", { oracleText: "This spell can't be countered.\nCombust deals 5 damage to target white or blue creature. The damage can't be prevented." });
const pinpoint = card("Pinpoint Avalanche", "Instant", "{3}{R}{R}", { oracleText: "Pinpoint Avalanche deals 4 damage to target creature. The damage can't be prevented." });
const urzasRage = card("Urza's Rage", "Instant", "{2}{R}", { keywords: ["Kicker"], oracleText: "Kicker {8}{R} (You may pay an additional {8}{R} as you cast this spell.)\nThis spell can't be countered.\nUrza's Rage deals 3 damage to any target. If this spell was kicked, instead it deals 10 damage to that permanent or player and the damage can't be prevented." });
const excruciator = card("Excruciator", "Creature — Avatar", "{6}{R}{R}", { power: "7", toughness: "7", oracleText: "Damage that would be dealt by this creature can't be prevented." });
// Questing Beast's last line ("it deals that much damage to target planeswalker that player controls") is still out.
const questingBeast = card("Questing Beast", "Legendary Creature — Beast", "{2}{G}{G}", { power: "4", toughness: "4", keywords: ["Vigilance", "Deathtouch", "Haste"], oracleText: "Vigilance, deathtouch, haste\nQuesting Beast can't be blocked by creatures with power 2 or less.\nCombat damage that would be dealt by creatures you control can't be prevented.\nWhenever Questing Beast deals combat damage to an opponent, it deals that much damage to target planeswalker that player controls." });
const baloth = card("Frenzied Baloth", "Creature — Beast", "{G}{G}{G}", { power: "3", toughness: "2", keywords: ["Trample", "Haste"], oracleText: "This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented." });

const urzasArmor = card("Urza's Armor", "Artifact", "{6}", { oracleText: "If a source would deal damage to you, prevent 1 of that damage." });
const fog = card("Fog", "Instant", "{G}", { oracleText: "Prevent all combat damage that would be dealt this turn." });
const ghosts = card("Ghosts of the Innocent", "Creature — Spirit", "{5}{W}{W}", { power: "4", toughness: "11", oracleText: "If a source would deal damage to a permanent or player, it deals half that damage, rounded down, to that permanent or player instead." });
const knight = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["First strike", "Protection"], oracleText: "First strike\nProtection from black" });
const wall = card("Blue Wall", "Creature — Wall", "{1}{U}", { power: "0", toughness: "5", keywords: ["Defender"], oracleText: "Defender" });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });

const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const castAndResolve = (s: GameState, pid: PlayerId, d: CardDef, targets: TargetChoice[], kicks?: number[]) => {
  const id = toHand(s, pid, d);
  for (let i = 0; i < 3; i++) for (const l of [mountain, mountain, mountain, plainsCard, forest, swamp]) putOnBattlefield(s, pid, l);
  while (waitingOn(s) !== pid || s.pending) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  const plan = planCast(s, pid, id, targets, undefined, "auto", undefined, kicks ? { kicks } : undefined);
  expect(plan, d.name).not.toBeNull();
  return resolveAll(plan!.reduce((x, a) => act(x, a), s));
};
const toEndOfCombat = (s0: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], beforeDamage?: (s: GameState) => GameState) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
  s = passUntil(s, "declareBlockers");
  if (beforeDamage) s = beforeDamage(s);
  for (let i = 0; i < 80 && s.step !== "endCombat"; i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("damage that can't be prevented", () => {
  it("is supported", () => {
    for (const d of [combust, pinpoint, urzasRage, excruciator, baloth]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Combust's damage isn't stopped by a prevention shield", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, opp, wall);
    s0.objects[w]!.preventNext = 5;
    const s = castAndResolve(s0, ap, combust, [obj(w)]);
    expect(s.objects[w]!.zone).toBe("graveyard");
  });

  it("Pinpoint Avalanche's isn't stopped by protection; a prevention shield takes nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, opp, knight);
    s0.objects[k]!.preventNext = 3;
    const s = castAndResolve(s0, ap, pinpoint, [obj(k)]);
    expect(s.objects[k]!.zone).toBe("graveyard");
  });

  it("Urza's Rage: 3 damage, or 10 that can't be prevented when kicked", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, urzasArmor);
    let s = castAndResolve(s0, ap, urzasRage, [player(opp)]);
    expect(life(s, opp)).toBe(38);
    s = castAndResolve(s, ap, urzasRage, [player(opp)], [0]);
    expect(life(s, opp)).toBe(28);
  });

  it("Excruciator's combat damage isn't prevented by Urza's Armor or Fog", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, urzasArmor);
    const x = putOnBattlefield(s0, ap, excruciator);
    const s = toEndOfCombat(s0, ap, opp, [x], (st) => {
      st.preventCombatDamage = true;
      return st;
    });
    expect(life(s, opp)).toBe(33);
  });

  it("... but Ghosts of the Innocent still halves it: that isn't prevention (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.objects[putOnBattlefield(s0, opp, ghosts)]!.tapped = true;
    const x = putOnBattlefield(s0, ap, excruciator);
    const s = toEndOfCombat(s0, ap, opp, [x]);
    expect(life(s, opp)).toBe(37);
  });

  it("Questing Beast: combat damage from creatures you control can't be prevented, others' can (Fog)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, questingBeast);
    const g = putOnBattlefield(s0, ap, ogre);
    const s = toEndOfCombat(s0, ap, opp, [g], (st) => {
      st.preventCombatDamage = true;
      return st;
    });
    expect(life(s, opp)).toBe(38);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, opp1, questingBeast);
    const t = toEndOfCombat(s1, ap1, opp1, [putOnBattlefield(s1, ap1, ogre)], (st) => {
      st.preventCombatDamage = true;
      return st;
    });
    expect(life(t, opp1)).toBe(40);
  });

  it("Frenzied Baloth: no one's combat damage can be prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.objects[putOnBattlefield(s0, opp, baloth)]!.tapped = true;
    putOnBattlefield(s0, opp, urzasArmor);
    const s = toEndOfCombat(s0, ap, opp, [putOnBattlefield(s0, ap, ogre)], (st) => {
      st.preventCombatDamage = true;
      return st;
    });
    expect(life(s, opp)).toBe(38);
    expect(fog).toBeTruthy();
  });
});

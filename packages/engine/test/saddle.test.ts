// Saddle (CR 702.171): "Tap any number of other untapped creatures you control with total power N or greater: This
// permanent becomes saddled until end of turn. Activate only as a sorcery." "Whenever ~ attacks while saddled" and the
// Pilots that saddle and crew as though their power were 2 greater.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, autoCrew, botActions, compileCard, crewPower, isFullySupported, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const saddle = (s: GameState, pid: PlayerId, mount: string, riders: string[]) => settle(planActivate(s, pid, mount, 0, undefined, undefined, riders)!.reduce((x, a) => act(x, a), s));
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === `${name} Token`).length;

// Real oracle text (Scryfall).
const bighorn = card("Bridled Bighorn", "Creature — Sheep Mount", "{3}{W}", { power: "3", toughness: "4", keywords: ["Saddle", "Vigilance"], oracleText: "Vigilance\nWhenever this creature attacks while saddled, create a 1/1 white Sheep creature token.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)" });
const mammoth = card("Autarch Mammoth", "Creature — Elephant Mount", "{4}{G}{G}", { power: "5", toughness: "5", keywords: ["Saddle"], oracleText: "When this creature enters and whenever it attacks while saddled, create a 3/3 green Elephant creature token.\nSaddle 5 (Tap any number of other creatures you control with total power 5 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)" });
const pilot = card("Deathless Pilot", "Creature — Zombie Pilot", "{1}{B}", { power: "2", toughness: "2", oracleText: "This creature saddles Mounts and crews Vehicles as though its power were 2 greater.\n{3}{B}: Return this card from your graveyard to your hand." });
const mechanic = card("Hotshot Mechanic", "Artifact Creature — Fox Pilot", "{W}", { power: "2", toughness: "1", oracleText: "This creature crews Vehicles as though its power were 2 greater." });
const ox = card("Giant Ox", "Creature — Ox", "{1}{W}", { power: "0", toughness: "6", oracleText: "This creature crews Vehicles using its toughness rather than its power." });
const elf = card("Elf Test", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

describe("saddle", () => {
  it("saddling taps other creatures with enough total power, even summoning-sick ones (rulings)", () => {
    supported(bighorn, mammoth, pilot, mechanic, ox);
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, bighorn);
    const e = putOnBattlefield(s0, ap, elf, { sick: true });
    expect(abilityProblem(s0, ap, m, 0)).toMatch(/not enough/);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    expect(abilityProblem(s0, ap, m, 0, undefined, undefined, [e])).toMatch(/total power 1; saddle 2/);
    expect(abilityProblem(s0, ap, m, 0, undefined, undefined, [m, b])).toMatch(/can't saddle itself/);
    const s = saddle(s0, ap, m, [b]);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[m]!.tapped).toBe(false);
    expect(s.objects[m]!.saddled).toBe(true);
    expect(s.log.some((l) => /saddles Bridled Bighorn with Grizzly Bears/.test(l.text))).toBe(true);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, bighorn);
    putOnBattlefield(s0, ap, bear());
    const s = passUntil(s0, "beginCombat", ap);
    expect(abilityProblem(s, ap, m, 0)).toMatch(/sorcery/);
  });

  it("'attacks while saddled' triggers only if it was saddled as it attacked; saddled ends with the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, bighorn);
    putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: m, defender: opp }]);
    expect(tokens(s, ap, "Sheep")).toBe(0);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const m1 = putOnBattlefield(s1, ap1, bighorn);
    const b1 = putOnBattlefield(s1, ap1, bear());
    s = attack(saddle(s1, ap1, m1, [b1]), ap1, [{ attacker: m1, defender: opp1 }]);
    expect(tokens(s, ap1, "Sheep")).toBe(1);
    expect(s.objects[m1]!.saddled).toBe(true);
    s = passUntil(s, "upkeep", opp1);
    expect(s.objects[m1]!.saddled).toBeUndefined();
  });

  it("Autarch Mammoth: when it enters and whenever it attacks while saddled", () => {
    const t = compileCard(mammoth).triggers;
    expect(t.map((x) => x.event)).toEqual(["selfEnters", "selfAttacks"]);
    expect(t[1]!.activeIf).toEqual({ kind: "self", is: "saddled" });
  });

  it("Deathless Pilot saddles as though its power were 2 greater; crew-only Pilots don't; Giant Ox crews with its toughness", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, pilot);
    const h = putOnBattlefield(s, ap, mechanic);
    const o = putOnBattlefield(s, ap, ox);
    expect(crewPower(s, s.objects[p]!, true)).toBe(4);
    expect(crewPower(s, s.objects[p]!)).toBe(4);
    expect(crewPower(s, s.objects[h]!, true)).toBe(2);
    expect(crewPower(s, s.objects[h]!)).toBe(4);
    expect(crewPower(s, s.objects[o]!)).toBe(6);
    expect(crewPower(s, s.objects[o]!, true)).toBe(0);
    const m = putOnBattlefield(s, ap, mammoth);
    expect(abilityProblem(s, ap, m, 0, undefined, undefined, [p])).toMatch(/total power 4; saddle 5/);
    expect(autoCrew(s, ap, m, 5, true)).not.toBeNull();
  });

  it("a bot saddles its Mount with a creature that can't attack yet, then attacks", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, bighorn);
    putOnBattlefield(s0, ap, bear(), { sick: true });
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 100 && s.step !== "declareBlockers" && s.activePlayer === ap; i++) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
    expect(s.objects[m]!.saddled).toBe(true);
  });
});

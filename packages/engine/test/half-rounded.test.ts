// "Half your life, rounded up", "half their library, rounded down", "where X is half the number of Zombies you control,
// rounded down" (AmountExpr.half): counted as it resolves, rounded down unless the text says up (CR 107.1a), and never
// below 0 (CR 107.1b). For several players, each loses or mills half their own (rulings on Havoc Festival).

import { describe, expect, it } from "vitest";
import { act, card, cast, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const life = (s: GameState, pid: number) => s.players[pid]!.life;
const library = (s: GameState, pid: number) => s.players[pid]!.library.length;

// Real oracle text (Scryfall).
const cruel = card("Cruel Bargain", "Sorcery", "{B}{B}{B}", { oracleText: "Draw four cards. You lose half your life, rounded up." });
const traumatize = card("Traumatize", "Sorcery", "{3}{U}{U}", { keywords: ["Mill"], oracleText: "Target player mills half their library, rounded down." });
const cacophony = card("Maddening Cacophony", "Sorcery", "{1}{U}", { keywords: ["Mill", "Kicker"], oracleText: "Kicker {3}{U}\nEach opponent mills eight cards. If this spell was kicked, instead each opponent mills half their library, rounded up." });
const ranks = card("Endless Ranks of the Dead", "Enchantment", "{2}{B}{B}", { oracleText: "At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down." });
const festival = card("Havoc Festival", "Enchantment", "{4}{B}{R}", { oracleText: "Players can't gain life.\nAt the beginning of each player's upkeep, that player loses half their life, rounded up." });
const supplicant = card("Freyalise Supplicant", "Creature — Human Cleric", "{1}{G}", { power: "1", toughness: "1", oracleText: "{T}, Sacrifice a red or white creature: This creature deals damage to any target equal to half the sacrificed creature's power, rounded down." });
const reaper = card("Ebonblade Reaper", "Creature — Human Cleric", "{2}{B}", { power: "1", toughness: "1", keywords: ["Morph"], oracleText: "Whenever this creature attacks, you lose half your life, rounded up.\nWhenever this creature deals combat damage to a player, that player loses half their life, rounded up.\nMorph {3}{B}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });
const redOgre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { power: "5", toughness: "5", colors: ["R"] });

describe("half, rounded up or down", () => {
  it("parse", () => supported(cruel, traumatize, cacophony, ranks, festival, supplicant, reaper));

  it("Cruel Bargain: an odd life total rounds up", () => {
    const { s: s0, ap, ids } = setup([cruel]);
    s0.players[ap]!.life = 39;
    s0.players[ap]!.manaPool.B = 3;
    const s = cast(s0, ap, ids[0]!);
    expect(life(s, ap)).toBe(19);
  });

  it("Cruel Bargain with a negative life total loses nothing (CR 107.1b)", () => {
    const { s: s0, ap, ids } = setup([cruel]);
    s0.players[ap]!.life = -3;
    s0.players[ap]!.manaPool.B = 3;
    const s = cast(s0, ap, ids[0]!);
    expect(life(s, ap)).toBe(-3);
  });

  it("Traumatize: the target player mills half their library, rounded down", () => {
    const { s: s0, ap, opp, ids } = setup([traumatize]);
    s0.players[opp]!.library.splice(0, s0.players[opp]!.library.length - 11);
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(library(s, opp)).toBe(6);
    expect(s.players[opp]!.graveyard.length).toBe(5);
  });

  it("Maddening Cacophony kicked: each opponent mills half their own library, rounded up", () => {
    const { s: s0, ap, ids } = setup([cacophony]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    opps.forEach((p, i) => s0.players[p]!.library.splice(0, s0.players[p]!.library.length - [9, 20, 1][i]!));
    const before = library(s0, ap);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: [0] })!) s = act(s, a);
    s = passAll(s);
    expect(opps.map((p) => library(s, p))).toEqual([4, 10, 0]);
    expect(library(s, ap)).toBe(before);
  });

  it("Endless Ranks of the Dead: half the Zombies you control, rounded down, as it resolves", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ranks);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, zombie);
    const s = passUntil(passUntil(s0, "end"), "draw", ap);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && /Zombie/.test(s.cards[s.objects[id]!.cardId]!.typeLine)).length).toBe(7);
  });

  it("Havoc Festival: the player whose upkeep it is loses half their life; two Festivals halve it twice (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, festival);
    putOnBattlefield(s0, ap, festival);
    s0.players[opp]!.life = 20;
    const s = passUntil(s0, "draw", opp);
    expect(life(s, opp)).toBe(5);
  });

  it("Freyalise Supplicant: half the sacrificed creature's power, rounded down", () => {
    const { s: s0, ap, opp } = setup([]);
    const sup = putOnBattlefield(s0, ap, supplicant);
    const ogre = putOnBattlefield(s0, ap, redOgre);
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: sup, index: 0, targets: [{ kind: "player", id: opp }], costs: { sacrifice: [ogre] } }));
    expect(s.objects[ogre]!.zone).toBe("graveyard");
    expect(life(s, opp)).toBe(38);
  });
});

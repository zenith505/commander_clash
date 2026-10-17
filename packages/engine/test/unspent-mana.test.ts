// Unspent mana empties as each step and phase ends (CR 500.4), unless a permanent keeps it: "Players don't lose unspent
// mana as steps and phases end" (Upwelling), "You don't lose unspent red mana" (Leyline Tyrant), or the replacement effect
// "If you would lose unspent mana, that mana becomes colorless instead" (Kruphix, Horizon Stone, CR 614.1a), which keeps it
// as colorless with any restrictions it had (rulings on Horizon Stone).

import { describe, expect, it } from "vitest";
import { card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const pool = (s: GameState, pid: PlayerId) => s.players[pid]!.manaPool;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const kruphix = card("Kruphix, God of Horizons", "Legendary Enchantment Creature — God", "{3}{G}{U}", { power: "4", toughness: "7", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to green and blue is less than seven, Kruphix isn't a creature.\nYou have no maximum hand size.\nIf you would lose unspent mana, that mana becomes colorless instead." });
const horizonStone = card("Horizon Stone", "Artifact", "{5}", { oracleText: "If you would lose unspent mana, that mana becomes colorless instead." });
const upwelling = card("Upwelling", "Enchantment", "{3}{G}", { oracleText: "Players don't lose unspent mana as steps and phases end." });
const ozaiLine = card("Test Phoenix", "Creature — Phoenix", "{2}{R}", { power: "2", toughness: "2", oracleText: "If you would lose unspent mana, that mana becomes red instead." });
const tyrantLine = card("Test Dragon", "Creature — Dragon", "{2}{R}{R}", { power: "4", toughness: "4", oracleText: "You don't lose unspent red mana as steps and phases end." });

describe("unspent mana", () => {
  it("parse", () => {
    supported(kruphix, horizonStone, upwelling, ozaiLine, tyrantLine);
    expect(compileCard(horizonStone).keepMana).toEqual({ who: "you", becomes: "C" });
    expect(compileCard(upwelling).keepMana).toEqual({ who: "all" });
    expect(compileCard(tyrantLine).keepMana).toEqual({ who: "you", color: "R" });
  });

  it("without any of them, mana empties as the step ends", () => {
    const { s: s0, ap } = setup([]);
    Object.assign(pool(s0, ap), { G: 2, U: 1 });
    const s = passAll(s0);
    expect(s.step).toBe("beginCombat");
    expect(pool(s, ap)).toMatchObject({ G: 0, U: 0, C: 0 });
  });

  it("Horizon Stone: its controller's mana becomes colorless instead and stays, into the next turn; other players' empties", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, horizonStone);
    Object.assign(pool(s0, ap), { G: 2, U: 1, C: 1 });
    Object.assign(pool(s0, opp), { R: 1 });
    let s = passAll(s0);
    expect(s.step).toBe("beginCombat");
    expect(pool(s, ap)).toMatchObject({ G: 0, U: 0, C: 4 });
    expect(pool(s, opp).R).toBe(0);
    expect(s.log.some((l) => l.text.includes("unspent mana becomes colorless"))).toBe(true);
    // Through the rest of the turn and the next player's.
    s = passUntil(s, "main1", next(s, ap));
    expect(pool(s, ap).C).toBe(4);
  });

  it("restricted mana keeps its restriction when it becomes colorless", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, horizonStone);
    const only = { text: "Spend this mana only to cast instant and sorcery spells.", types: ["Instant", "Sorcery"] };
    Object.assign(pool(s0, ap), { U: 1, R: 1 });
    s0.players[ap]!.manaLots = [{ mana: "U", n: 1, only } as never];
    const s = passAll(s0);
    expect(pool(s, ap)).toMatchObject({ U: 0, R: 0, C: 2 });
    expect(s.players[ap]!.manaLots).toEqual([expect.objectContaining({ mana: "C", n: 1, only })]);
  });

  it("once Horizon Stone is gone, mana empties at the end of the step it left in (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const stone = putOnBattlefield(s0, ap, horizonStone);
    Object.assign(pool(s0, ap), { G: 3 });
    let s = passAll(s0);
    expect(pool(s, ap).C).toBe(3);
    moveObject(s, stone, "graveyard");
    s = passAll(s);
    expect(pool(s, ap).C).toBe(0);
  });

  it("Kruphix: the same, also when it isn't a creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kruphix);
    Object.assign(pool(s0, ap), { B: 1 });
    const s = passAll(s0);
    expect(pool(s, ap)).toMatchObject({ B: 0, C: 1 });
  });

  it("Upwelling: every player keeps their mana as it is", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, upwelling);
    Object.assign(pool(s0, ap), { G: 2 });
    Object.assign(pool(s0, opp), { R: 1 });
    const s = passAll(s0);
    expect(pool(s, ap).G).toBe(2);
    expect(pool(s, opp).R).toBe(1);
  });

  it("you don't lose unspent red mana: red stays, the rest empties; with a replacement too, red stays red", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, tyrantLine);
    Object.assign(pool(s0, ap), { R: 2, G: 1 });
    let s = passAll(s0);
    expect(pool(s, ap)).toMatchObject({ R: 2, G: 0 });
    putOnBattlefield(s, ap, horizonStone);
    Object.assign(pool(s, ap), { G: 1 });
    s = passAll(s);
    expect(pool(s, ap)).toMatchObject({ R: 2, G: 0, C: 1 });
  });

  it("that mana becomes red instead", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ozaiLine);
    Object.assign(pool(s0, ap), { G: 1, C: 1 });
    const s = passAll(s0);
    expect(pool(s, ap)).toMatchObject({ G: 0, C: 0, R: 2 });
  });
});

// What's in your mana pool as an amount (CR 106.4): "Omnath gets +1/+1 for each unspent green mana you have", "Ozai has
// flying and indestructible as long as you have six or more unspent mana".

import { describe, expect, it } from "vitest";
import { card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, objHasKeyword, power, toughness, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const omnath = card("Omnath, Locus of Mana", "Legendary Creature — Elemental", "{2}{G}", { power: "1", toughness: "1", oracleText: "You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have." });
const ozai = card("Ozai, the Phoenix King", "Legendary Creature — Human Noble", "{2}{B}{B}{R}{R}", { power: "7", toughness: "7", keywords: ["Haste", "Trample", "Firebending"], oracleText: "Trample, firebending 4, haste\nIf you would lose unspent mana, that mana becomes red instead.\nOzai has flying and indestructible as long as you have six or more unspent mana." });

describe("unspent mana as an amount", () => {
  it("parse", () => supported(omnath, ozai));

  it("Omnath counts only your green mana, and follows the pool as it changes", () => {
    const { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, omnath);
    expect(power(s, s.objects[o]!)).toBe(1);
    s.players[ap]!.manaPool.G = 3;
    s.players[ap]!.manaPool.R = 2;
    s.players[opp]!.manaPool.G = 5;
    expect([power(s, s.objects[o]!), toughness(s, s.objects[o]!)]).toEqual([4, 4]);
    s.players[ap]!.manaPool.G = 1;
    expect(power(s, s.objects[o]!)).toBe(2);
  });

  it("Ozai has flying and indestructible with six or more mana of any kind", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, ozai);
    s.players[ap]!.manaPool.R = 5;
    expect(objHasKeyword(s, s.objects[o]!, "Flying")).toBe(false);
    s.players[ap]!.manaPool.C = 1;
    expect([objHasKeyword(s, s.objects[o]!, "Flying"), objHasKeyword(s, s.objects[o]!, "Indestructible")]).toEqual([true, true]);
  });
});

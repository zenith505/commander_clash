// Round 92: kindred cards (CR 308). A kindred card is cast and resolves as its other card type (308.1); its subtypes are
// creature types (308.2), so a Kindred Instant — Goblin is a Goblin spell, and a Kindred Enchantment — Faerie a Faerie
// permanent that isn't a creature. Kindred is a card type of its own, counted among card types (rulings on Tarfire).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, moveObject, objIsType, planCast, type CardDef } from "../src";

// Real oracle text and type lines (Scryfall).
const kindred = (name: string, type: string, sub: string[], cost: string, text: string, keywords: string[] = []): CardDef => ({ ...card(name, `Kindred ${type} — ${sub.join(" ")}`, cost, { oracleText: text, keywords }), types: ["Kindred", type], subtypes: sub });
const bitterblossom = kindred("Bitterblossom", "Enchantment", ["Faerie"], "{1}{B}", "At the beginning of your upkeep, you lose 1 life and create a 1/1 black Faerie Rogue creature token with flying.");
const tarfire = kindred("Tarfire", "Instant", ["Goblin"], "{R}", "Tarfire deals 2 damage to any target.");
const shenanigans = kindred("Boggart Shenanigans", "Enchantment", ["Goblin"], "{2}{R}", "Whenever another Goblin you control is put into a graveyard from the battlefield, you may have this enchantment deal 1 damage to target player or planeswalker.");
const cribSwap = kindred("Crib Swap", "Instant", ["Shapeshifter"], "{2}{W}", "Changeling (This card is every creature type.)\nExile target creature. Its controller creates a 1/1 colorless Shapeshifter creature token with changeling.", ["Changeling"]);
const warchief = card("Goblin Warchief", "Creature — Goblin Warrior", "{1}{R}{R}", { power: "2", toughness: "2", oracleText: "Goblin spells you cast cost {1} less to cast.\nGoblins you control have haste." });
const goyf = card("Tarmogoyf", "Creature — Lhurgoyf", "{1}{G}", { power: "*", toughness: "1+*", oracleText: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1." });

describe("kindred", () => {
  it("parse", () => [bitterblossom, tarfire, shenanigans, cribSwap].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Bitterblossom: a Faerie enchantment, not a creature; its upkeep trigger works", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bitterblossom);
    const o = s0.objects[b]!;
    expect(objIsType(s0, o, "Creature")).toBe(false);
    expect(characteristics(s0, o).types).toEqual(["Kindred", "Enchantment"]);
    expect(characteristics(s0, o).subtypes).toEqual(["Faerie"]);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "upkeep", ap);
    s = passAll(s);
    expect(s.players[ap]!.life).toBe(39);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Faerie Rogue")).length).toBe(1);
  });

  it("a Goblin spell: Goblin Warchief makes Boggart Shenanigans cost {1} less", () => {
    const { s, ap, ids } = setup([shenanigans]);
    putOnBattlefield(s, ap, warchief);
    const plan = planCast(s, ap, ids[0]!)!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(2);
  });

  it("Tarfire: an instant that deals 2 damage; kindred counts as a card type in graveyards", () => {
    const { s: s0, ap, opp, ids } = setup([tarfire]);
    for (const id of [...s0.players[ap]!.graveyard]) moveObject(s0, id, "exile");
    const g = putOnBattlefield(s0, ap, goyf);
    s0.players[ap]!.manaPool.R = 1;
    const s = passAll(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])!.reduce((x, a) => act(x, a), s0));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const yards = new Set(s.turnOrder.flatMap((p) => s.players[p]!.graveyard.flatMap((id) => s.cards[s.objects[id]!.cardId]!.types)));
    expect(yards.has("Kindred")).toBe(true);
    expect(characteristics(s, s.objects[g]!).power).toBe(yards.size);
  });

  it("Crib Swap: exiles the creature, its controller gets a Shapeshifter", () => {
    const { s: s0, ap, opp, ids } = setup([cribSwap]);
    const victim = putOnBattlefield(s0, opp, warchief);
    const s = passAll(planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])!.reduce((x, a) => act(x, a), s0));
    expect(s.objects[victim]!.zone).toBe("exile");
    expect(s.battlefield.some((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]!.name.startsWith("Shapeshifter"))).toBe(true);
  });
});

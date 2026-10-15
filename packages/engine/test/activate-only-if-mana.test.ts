// Mana abilities with "Activate only if ..." (CR 602.5b): the Verges, the Tainted lands, Dark Fortress's "if this land
// entered this turn or if you control a basic land". They can't be activated otherwise, by hand or by autopay, but what
// they could produce still counts for Reflecting Pool (CR 106.7; its rulings ignore whether abilities can be activated).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, manaOptions, moveObject, planCast, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const verge = card("Gloomlake Verge", "Land", "", { oracleText: "{T}: Add {U}.\n{T}: Add {B}. Activate only if you control an Island or a Swamp." });
const tainted = card("Tainted Isle", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add {U} or {B}. Activate only if you control a Swamp." });
const fortress = card("Dark Fortress", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add {B} or {R}. Activate only if this land entered this turn or if you control a basic land." });
const shrine = card("Shrine of the Forsaken Gods", "Land", "", { oracleText: "{T}: Add {C}.\n{T}: Add {C}{C}. Spend this mana only to cast colorless spells. Activate only if you control seven or more lands." });
const pool = card("Reflecting Pool", "Land", "", { oracleText: "{T}: Add one mana of any type that a land you control could produce." });
const swampCard = card("Swamp", "Basic Land — Swamp");
const islandCard = card("Island", "Basic Land — Island");
const ravenous = card("Ravenous Rats", "Creature — Rat", "{1}{B}", { power: "1", toughness: "1" });

/** A game where `pid` controls none of their basic lands: they're moved to the graveyard. */
function bare(): { s: GameState; ap: PlayerId; ids: ObjectId[] } {
  const { s, ap, ids } = setup([ravenous]);
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) moveObject(s, id, "graveyard");
  return { s, ap, ids };
}
const tap = (s: GameState, pid: PlayerId, objectId: ObjectId, mana: "U" | "B" | "R" | "C", ability?: number) => act(s, { type: "activateMana", player: pid, objectId, mana, ...(ability !== undefined ? { ability } : {}) });

describe("activate only if", () => {
  it("parses", () => [verge, tainted, fortress, shrine].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Gloomlake Verge: {B} only while you control an Island or a Swamp", () => {
    const { s, ap } = bare();
    const v = putOnBattlefield(s, ap, verge);
    expect(() => tap(s, ap, v, "B")).toThrow();
    const s1 = tap(s, ap, v, "U");
    expect(s1.players[ap]!.manaPool.U).toBe(1);
    putOnBattlefield(s, ap, islandCard);
    expect(tap(s, ap, v, "B").players[ap]!.manaPool.B).toBe(1);
  });

  it("Tainted Isle: autopay can't use its {B} without a Swamp, and can with one", () => {
    const { s, ap, ids } = bare();
    putOnBattlefield(s, ap, tainted);
    putOnBattlefield(s, ap, islandCard);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    const { s: s2, ap: ap2, ids: ids2 } = bare();
    putOnBattlefield(s2, ap2, tainted);
    putOnBattlefield(s2, ap2, swampCard);
    let after = s2;
    for (const a of planCast(s2, ap2, ids2[0]!)!) after = act(after, a);
    expect(after.stack).toHaveLength(1);
  });

  it("Dark Fortress: the turn it entered, or with a basic land", () => {
    const { s, ap } = bare();
    const f = putOnBattlefield(s, ap, fortress);
    expect(() => tap(s, ap, f, "R")).toThrow();
    // Played as this turn's land: it entered this turn.
    const { s: s1, ap: ap1 } = bare();
    const f1 = putOnBattlefield(s1, ap1, fortress);
    moveObject(s1, f1, "hand");
    s1.players[ap1]!.landsPlayedThisTurn = 0;
    const played = act(s1, { type: "playLand", player: ap1, objectId: f1 });
    expect(tap(played, ap1, f1, "R").players[ap1]!.manaPool.R).toBe(1);
    // An older one, with a basic land.
    putOnBattlefield(s, ap, swampCard);
    expect(tap(s, ap, f, "B").players[ap]!.manaPool.B).toBe(1);
  });

  it("Shrine of the Forsaken Gods: {C}{C} with seven or more lands", () => {
    const { s, ap } = bare();
    const shr = putOnBattlefield(s, ap, shrine);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, ap, swampCard);
    expect(() => tap(s, ap, shr, "C", 1)).toThrow();
    putOnBattlefield(s, ap, swampCard);
    expect(tap(s, ap, shr, "C", 1).players[ap]!.manaPool.C).toBe(2);
  });

  it("Reflecting Pool counts what Tainted Isle could produce, even without a Swamp (rulings)", () => {
    const { s, ap } = bare();
    putOnBattlefield(s, ap, tainted);
    const p = putOnBattlefield(s, ap, pool);
    const made = new Set(manaOptions(s, s.objects[p]!).map((o) => o.mana));
    expect([...made].sort()).toEqual(["B", "C", "U"]);
  });
});

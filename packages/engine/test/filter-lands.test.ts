// Filter lands (Shadowmoor/Eventide): "{W/U}, {T}: Add {W}{W}, {W}{U}, or {U}{U}." A mana ability with a hybrid mana
// cost (paid with either color, CR 107.4e) that makes one of three combinations, chosen as it resolves (CR 605.3b).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { availableMana, isFullySupported, manaOptions, moveObject, planCast, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gate = card("Mystic Gate", "Land", "", { oracleText: "{T}: Add {C}.\n{W/U}, {T}: Add {W}{W}, {W}{U}, or {U}{U}." });
const heath = card("Fetid Heath", "Land", "", { oracleText: "{T}: Add {C}.\n{W/B}, {T}: Add {W}{W}, {W}{B}, or {B}{B}." });
const islandCard = card("Island", "Basic Land — Island");
const plainsCard = card("Plains", "Basic Land — Plains");
const wrath = card("Divine Verdict", "Instant", "{W}{W}");
const counsel = card("Absorb", "Instant", "{W}{U}{U}");

/** A game where `pid` controls none of their basic lands: they're moved to the graveyard. */
function bare(hand = [wrath]): { s: GameState; ap: PlayerId; ids: ObjectId[] } {
  const { s, ap, ids } = setup(hand);
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap) moveObject(s, id, "graveyard");
  return { s, ap, ids };
}

describe("filter lands", () => {
  it("parses", () => [gate, heath].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("offers {C} and each combination", () => {
    const { s, ap } = bare();
    const g = putOnBattlefield(s, ap, gate);
    expect(manaOptions(s, s.objects[g]!).map((x) => x.adds.join(""))).toEqual(["C", "WW", "WU", "UU"]);
  });

  it("pays {W/U} from the pool and adds the chosen combination", () => {
    const { s, ap } = bare();
    const g = putOnBattlefield(s, ap, gate);
    const i = putOnBattlefield(s, ap, islandCard);
    // Nothing in the pool to pay {W/U} with.
    expect(() => act(s, { type: "activateMana", player: ap, objectId: g, mana: "W", ability: 1, combo: 0 })).toThrow();
    let s1 = act(s, { type: "activateMana", player: ap, objectId: i, mana: "U" });
    // A combination has to be chosen.
    expect(() => act(s1, { type: "activateMana", player: ap, objectId: g, mana: "W", ability: 1 })).toThrow(/choose which mana/);
    s1 = act(s1, { type: "activateMana", player: ap, objectId: g, mana: "W", ability: 1, combo: 0 });
    expect(s1.players[ap]!.manaPool).toMatchObject({ W: 2, U: 0, C: 0 });
    expect(s1.objects[g]!.tapped).toBe(true);
  });

  it("the hybrid cost can be paid with either color", () => {
    const { s, ap } = bare();
    const g = putOnBattlefield(s, ap, gate);
    const p = putOnBattlefield(s, ap, plainsCard);
    let s1 = act(s, { type: "activateMana", player: ap, objectId: p, mana: "W" });
    s1 = act(s1, { type: "activateMana", player: ap, objectId: g, mana: "U", ability: 1, combo: 2 });
    expect(s1.players[ap]!.manaPool).toMatchObject({ W: 0, U: 2 });
  });

  it("autopay filters an Island's {U} into {W}{W}", () => {
    const { s, ap, ids } = bare();
    putOnBattlefield(s, ap, gate);
    putOnBattlefield(s, ap, islandCard);
    expect(availableMana(s, ap)).toBe(2);
    let after = s;
    for (const a of planCast(s, ap, ids[0]!)!) after = act(after, a);
    expect(after.stack).toHaveLength(1);
  });

  it("autopay mixes a combination with other lands", () => {
    const { s, ap, ids } = bare([counsel]);
    putOnBattlefield(s, ap, gate);
    putOnBattlefield(s, ap, islandCard);
    putOnBattlefield(s, ap, plainsCard);
    // {W}{U}{U}: one land pays {W/U} and the gate makes the combination the other land doesn't cover.
    let after = s;
    for (const a of planCast(s, ap, ids[0]!)!) after = act(after, a);
    expect(after.stack).toHaveLength(1);
  });
});

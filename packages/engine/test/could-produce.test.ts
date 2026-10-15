// "Add one mana of any color that a land an opponent controls could produce" (CR 106.7): what those lands' mana
// abilities would make, whatever their costs; lands asking the same question of each other add nothing (rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, manaAbilitiesOn, manaChoices, type GameState } from "../src";

// Real oracle text (Scryfall).
const fellwar = card("Fellwar Stone", "Artifact", "{2}", { oracleText: "{T}: Add one mana of any color that a land an opponent controls could produce." });
const orchard = card("Exotic Orchard", "Land", "", { oracleText: "{T}: Add one mana of any color that a land an opponent controls could produce." });
const pool = card("Reflecting Pool", "Land", "", { oracleText: "{T}: Add one mana of any type that a land you control could produce." });
const wastes = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
const sol = card("Sol Land", "Land", "", { oracleText: "{T}: Add {C}." });
const karoo = card("Azorius Chancery", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {W}{U}." });

const choices = (s: GameState, id: string) => manaAbilitiesOn(s, s.objects[id]!).flatMap((ab) => manaChoices(s, s.objects[id]!, ab));

describe("mana a land could produce (CR 106.7)", () => {
  it("compile", () => {
    for (const d of [fellwar, orchard, pool]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("only the opponents' lands' colors, not colorless; a bounce land's both colors", () => {
    const { s: s0, ap, opp } = setup([]);
    // Only the opponents' lands count: clear everyone else's.
    const s = s0;
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller !== ap) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const f = putOnBattlefield(s, ap, fellwar);
    expect(choices(s, f)).toEqual([]);
    putOnBattlefield(s, opp, sol);
    expect(choices(s, f)).toEqual([]); // {C} isn't a color
    putOnBattlefield(s, opp, karoo);
    expect(choices(s, f)).toEqual(["W", "U"]);
    const r = putOnBattlefield(s, ap, pool);
    // Reflecting Pool: any type, from my own lands (my Mountains, Islands, ... in setup), Wastes' {C} too.
    putOnBattlefield(s, ap, wastes);
    expect(choices(s, r)).toContain("C");
    expect(choices(s, r)).toContain("R");
  });

  it("Exotic Orchards that only see each other make nothing; one seeing a Forest through another makes {G}", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    for (const id of [...s.battlefield]) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    const a = putOnBattlefield(s, ap, orchard);
    const b = putOnBattlefield(s, opp, orchard);
    expect(choices(s, a)).toEqual([]);
    expect(choices(s, b)).toEqual([]);
    // A Forest of a third player: B (whose opponents include that player) could make {G}, so A could too.
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s, third, card("Forest", "Basic Land — Forest"));
    expect(choices(s, b)).toEqual(["G"]);
    expect(choices(s, a)).toEqual(["G"]);
    // Tapping it for that mana works.
    const t = act(s, { type: "activateMana", player: ap, objectId: a, mana: "G" });
    expect(t.players[ap]!.manaPool.G).toBe(1);
  });
});

// "The number of differently named lands you control" (Awakened Amalgam, All-Fates Scroll) and "differently named
// creature tokens" (Audience with Trostani): each English name counted once; a token's name is its subtypes plus
// "Token" unless the effect named it (rulings, CR 111.4).

import { describe, expect, it } from "vitest";
import { card, cast, island, plainsCard, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, power, toughness } from "../src";

// Real oracle text (Scryfall).
const amalgam = card("Awakened Amalgam", "Artifact Creature — Golem", "{4}", { power: "*", toughness: "*", oracleText: "Awakened Amalgam's power and toughness are each equal to the number of differently named lands you control." });
const scroll = card("All-Fates Scroll", "Artifact", "{3}", { oracleText: "{T}: Add one mana of any color.\n{7}, {T}, Sacrifice this artifact: Draw X cards, where X is the number of differently named lands you control." });
const audience = card("Audience with Trostani", "Sorcery", "{2}{G}", { oracleText: "Create a 0/1 green Plant creature token, then draw cards equal to the number of differently named creature tokens you control." });
const colossus = card("Fungal Colossus", "Creature — Fungus Beast", "{6}{G}", { power: "5", toughness: "5", oracleText: "This spell costs {X} less to cast, where X is the number of differently named lands you control." });
const pond = card("Drowned Catacomb", "Land", "", { oracleText: "This land enters tapped unless you control an Island or a Swamp.\n{T}: Add {U} or {B}." });

describe("differently named", () => {
  it("compiles them", () => {
    for (const d of [amalgam, scroll, audience, colossus]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Awakened Amalgam: four Plains, two Islands and a Drowned Catacomb make a 3/3 (rulings)", () => {
    let { s, ap } = setup([]);
    // setup gives the player Mountains, Islands, Forests, Plains and Swamps: five names.
    const a = putOnBattlefield(s, ap, amalgam);
    expect(power(s, s.objects[a]!)).toBe(5);
    s.battlefield = s.battlefield.filter((id) => s.objects[id]!.controller !== ap || !s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
    for (const l of [plainsCard, plainsCard, plainsCard, plainsCard, island, island, pond]) putOnBattlefield(s, ap, l);
    expect(power(s, s.objects[a]!)).toBe(3);
    expect(toughness(s, s.objects[a]!)).toBe(3);
  });

  it("Audience with Trostani counts each token name once, the new Plant included", () => {
    let { s, ap, ids } = setup([audience]);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    const plant = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.cards[s.objects[plant]!.cardId]!.name).toBe("Plant Token");
  });

  it("Fungal Colossus costs {X} less for the lands' different names", () => {
    const { s, ap, ids } = setup([colossus]);
    // Five names among the lands (Mountain, Island, Forest, Plains, Swamp): {6}{G} costs {1}{G}.
    const plan = planCast(s, ap, ids[0]!)!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(2);
  });
});

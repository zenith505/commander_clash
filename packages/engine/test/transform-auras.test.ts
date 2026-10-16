// Auras and Equipment that turn what they're attached to into something else (CR 613.1-613.6): "loses all abilities and
// is a blue Frog creature with base power and toughness 1/1" (Frogify), "is a colorless Forest land" (Song of the
// Dryads), "is a colorless land with "{T}: Add {C}" and loses all other card types and abilities" (Imprisoned in the
// Moon). A new card type replaces the old ones but not supertypes (CR 205.1a), "in addition to its other types" keeps
// them (205.1b), a creature type alone replaces only creature types, and abilities granted later still work (613.7).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const attach = (s: GameState, aura: string, host: string) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

// Real oracle text (Scryfall).
const frogify = card("Frogify", "Enchantment — Aura", "{1}{U}", { oracleText: "Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1. (It loses all other card types and creature types.)" });
const kenrith = card("Kenrith's Transformation", "Enchantment — Aura", "{1}{G}", { oracleText: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3. (It loses all other card types and creature types.)" });
const mutation = card("Darksteel Mutation", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types." });
const deepFreeze = card("Deep Freeze", "Enchantment — Aura", "{2}{U}", { oracleText: "Enchant creature\nEnchanted creature has base power and toughness 0/4, has defender, loses all other abilities, and is a blue Wall in addition to its other colors and types." });
const song = card("Song of the Dryads", "Enchantment — Aura", "{2}{G}", { oracleText: "Enchant permanent\nEnchanted permanent is a colorless Forest land." });
const moon = card("Imprisoned in the Moon", "Enchantment — Aura", "{2}{U}", { oracleText: 'Enchant creature, land, or planeswalker\nEnchanted permanent is a colorless land with "{T}: Add {C}" and loses all other card types and abilities.' });
const stars = card("One with the Stars", "Enchantment — Aura", "{3}{U}", { oracleText: "Enchant creature or enchantment\nEnchanted permanent is an enchantment and loses all other card types. (It still has its abilities, but it's no longer a creature.)" });
const nidhogg = card("Eye of Nidhogg", "Legendary Enchantment — Aura", "{2}{B}", {
  oracleText:
    "Enchant creature\nEnchanted creature is a black Dragon with base power and toughness 4/2, has flying and deathtouch, and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhen Eye of Nidhogg is put into a graveyard from the battlefield, return it to its owner's hand.",
});
const retro = card("Retro-Mutation", "Enchantment — Aura", "{1}{U}", { oracleText: "Enchant creature\nEnchanted creature is a Turtle with base power and toughness 0/1. It can't attack and loses all abilities. (It also loses all other creature types.)" });
const minimus = card("Minimus Containment", "Enchantment — Aura", "{2}{W}", { oracleText: 'Enchant nonland permanent\nEnchanted permanent is a Treasure artifact with "{T}, Sacrifice this artifact: Add one mana of any color," and it loses all other abilities. (If it was a creature, it\'s no longer a creature.)' });
const stopCold = card("Stop Cold", "Enchantment — Aura", "{3}{U}", { oracleText: "Enchant artifact or creature\nWhen this Aura enters, tap enchanted permanent.\nEnchanted permanent loses all abilities and doesn't untap during its controller's untap step." });
const blade = card("Blade of the Oni", "Artifact Creature — Equipment Demon", "{1}{B}", {
  power: "3",
  toughness: "1",
  keywords: ["Menace", "Reconfigure"],
  oracleText: "Menace\nEquipped creature has base power and toughness 5/5, has menace, and is a black Demon in addition to its other colors and types.\nReconfigure {2}{B}{B} ({2}{B}{B}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. Attach only as a creature.)",
});
const angel = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying\nVigilance" });
const golem = card("Legendary Golem", "Legendary Artifact Creature — Golem", "{4}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying" });
const plains = card("Plains", "Basic Land — Plains");

describe("Auras that transform what they enchant", () => {
  it("parses", () => {
    supported(frogify, kenrith, mutation, deepFreeze, song, moon, stars, nidhogg, retro, minimus, stopCold, blade);
  });

  it("Frogify: a 1/1 blue Frog creature with no abilities, still legendary but no longer an artifact", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, opp, golem);
    attach(s, putOnBattlefield(s, ap, frogify), g);
    expect(chars(s, g)).toMatchObject({ supertypes: ["Legendary"], types: ["Creature"], subtypes: ["Frog"], colors: ["U"] });
    expect(pt(s, g)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[g]!, "Flying")).toBe(false);
    // An ability it gains afterward works; counters still count (rulings).
    addEffect(s, opp, [g], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    s.objects[g]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[g]!, "Flying")).toBe(true);
    expect(pt(s, g)).toBe("3/3");
  });

  it("Kenrith's Transformation draws a card as it enters and makes a 3/3 green Elk", () => {
    const { s: s0, ap, opp, ids } = setup([kenrith]);
    const a = putOnBattlefield(s0, opp, angel);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a)])));
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    expect(chars(s, a)).toMatchObject({ types: ["Creature"], subtypes: ["Elk"], colors: ["G"] });
    expect(pt(s, a)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);
  });

  it("Darksteel Mutation keeps indestructible from the same effect; Deep Freeze adds blue and Wall to what it was", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, mutation), a);
    expect(chars(s, a)).toMatchObject({ types: ["Artifact", "Creature"], subtypes: ["Insect"], colors: ["W"] });
    expect(pt(s, a)).toBe("0/1");
    expect(objHasKeyword(s, s.objects[a]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);

    const b = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, deepFreeze), b);
    expect(chars(s, b).subtypes).toEqual(["Angel", "Wall"]);
    expect(chars(s, b).colors.sort()).toEqual(["U", "W"]);
    expect(pt(s, b)).toBe("0/4");
    expect(objHasKeyword(s, s.objects[b]!, "Defender")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(false);
  });

  it("Song of the Dryads: a colorless Forest land that taps for {G}, not a creature", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, song), a);
    expect(chars(s, a)).toMatchObject({ types: ["Land"], subtypes: ["Forest"], colors: [] });
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);
    const mana = manaAbilitiesOn(s, s.objects[a]!);
    expect(mana).toHaveLength(1);
    expect(mana[0]!.produces).toMatchObject({ kind: "fixed", mana: ["G"] });
  });

  it("Imprisoned in the Moon: a Plains stays a Plains but taps only for {C}; a creature becomes a colorless land", () => {
    const { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, opp, plains);
    attach(s, putOnBattlefield(s, ap, moon), p);
    expect(chars(s, p)).toMatchObject({ types: ["Land"], subtypes: ["Plains"] });
    const mana = manaAbilitiesOn(s, s.objects[p]!);
    expect(mana).toHaveLength(1);
    expect(mana[0]!.produces).toMatchObject({ kind: "fixed", mana: ["C"] });
    const a = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, moon), a);
    expect(chars(s, a)).toMatchObject({ types: ["Land"], subtypes: [], colors: [] });
    expect(manaAbilitiesOn(s, s.objects[a]!)[0]!.produces).toMatchObject({ kind: "fixed", mana: ["C"] });
  });

  it("One with the Stars: an enchantment that keeps its abilities; Eye of Nidhogg: a goaded black Dragon", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, stars), a);
    expect(chars(s, a)).toMatchObject({ types: ["Enchantment"], subtypes: [] });
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(true);

    const b = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, nidhogg), b);
    expect(chars(s, b)).toMatchObject({ types: ["Creature"], subtypes: ["Dragon"], colors: ["B"], goadedBy: [ap] });
    expect(pt(s, b)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true); // it keeps its other abilities
  });

  it("Retro-Mutation: a 0/1 Turtle that can't attack; Minimus Containment: a Treasure its controller can sacrifice for mana", () => {
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, angel);
    attach(s, putOnBattlefield(s, ap, retro), a);
    expect(chars(s, a)).toMatchObject({ subtypes: ["Turtle"], cantAttack: true });
    expect(pt(s, a)).toBe("0/1");

    const b = putOnBattlefield(s, ap, bear());
    attach(s, putOnBattlefield(s, opp, minimus), b);
    expect(chars(s, b)).toMatchObject({ types: ["Artifact"], subtypes: ["Treasure"] });
    expect(manaAbilitiesOn(s, s.objects[b]!)).toHaveLength(1);
    const pool = s.players[ap]!.manaPool;
    const before = Object.values(pool).reduce((n, x) => n + (x ?? 0), 0);
    const t = act(s, { type: "activateMana", player: ap, objectId: b, mana: "G" });
    expect(t.objects[b]!.zone).toBe("graveyard");
    expect(Object.values(t.players[ap]!.manaPool).reduce((n, x) => n + (x ?? 0), 0)).toBe(before + 1);
  });

  it("Stop Cold taps the creature and it stays tapped; Blade of the Oni makes its creature a 5/5 black Demon too", () => {
    const { s: s0, ap, opp, ids } = setup([stopCold]);
    const a = putOnBattlefield(s0, opp, angel);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(a)])));
    expect(s.objects[a]!.tapped).toBe(true);
    expect(chars(s, a).doesntUntap).toBe(true);
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);

    const b = putOnBattlefield(s, ap, angel);
    const e = putOnBattlefield(s, ap, blade);
    attach(s, e, b);
    expect(chars(s, b)).toMatchObject({ types: ["Creature"], subtypes: ["Angel", "Demon"] });
    expect(chars(s, b).colors.sort()).toEqual(["B", "W"]);
    expect(pt(s, b)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[b]!, "Menace")).toBe(true);
  });
});

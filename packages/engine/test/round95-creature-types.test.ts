// Round 95: creature types outside the battlefield. Maskwood Nexus ("Creatures you control are every creature type. The
// same is true for creature spells you control and creature cards you own that aren't on the battlefield"), Arcane
// Adaptation, Leyline of Transformation, Conspiracy ("are the chosen type": the others go, rulings), Rukarumel, and
// Xenograft (the battlefield only, rulings). Layer 4 (CR 613.1d) in timestamp order (613.7); changeling first (613.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { defOf } from "../src/cards";
import { printedMatches } from "../src/effects";

// Real oracle text (Scryfall).
const maskwood = card("Maskwood Nexus", "Artifact", "{4}", { oracleText: "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\n{3}, {T}: Create a 2/2 blue Shapeshifter creature token with changeling. (It is every creature type.)" });
const adaptation = card("Arcane Adaptation", "Enchantment", "{2}{U}", { oracleText: "As this enchantment enters, choose a creature type.\nCreatures you control are the chosen type in addition to their other types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield." });
const leyline = card("Leyline of Transformation", "Enchantment", "{2}{U}{U}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nAs this enchantment enters, choose a creature type.\nCreatures you control are the chosen type in addition to their other types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield." });
const conspiracy = card("Conspiracy", "Enchantment", "{3}{B}{B}", { oracleText: "As this enchantment enters, choose a creature type.\nCreatures you control are the chosen type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield." });
const xenograft = card("Xenograft", "Enchantment", "{4}{U}", { oracleText: "As this enchantment enters, choose a creature type.\nEach creature you control is the chosen type in addition to its other types." });
const rukarumel = card("Rukarumel, Biologist", "Legendary Creature — Phyrexian Wizard", "{2}{U}{U}", { power: "2", toughness: "4", oracleText: "As Rukarumel enters, choose a creature type.\nSlivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.\n{3}, {T}: Create a 1/1 colorless Sliver creature token." });
const mimic = card("Metallic Mimic", "Artifact Creature — Shapeshifter", "{2}", { power: "2", toughness: "1", oracleText: "As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it." });
const huntmaster = card("Lys Alana Huntmaster", "Creature — Elf Warrior", "{2}{G}{G}", { power: "3", toughness: "3", oracleText: "Whenever you cast an Elf spell, you may create a 1/1 green Elf Warrior creature token." });
const changeling = card("Changeling Outcast", "Creature — Shapeshifter", "{B}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)\nChangeling Outcast can't block and can't be blocked." });

const elf = { kind: "object" as const, subtypes: ["Elf"], text: "Elf" };
const goblin = { kind: "object" as const, subtypes: ["Goblin"], text: "Goblin" };
const isElf = (s: GameState, id: string) => printedMatches(elf, defOf(s, s.objects[id]!));
const isGoblin = (s: GameState, id: string) => printedMatches(goblin, defOf(s, s.objects[id]!));
const choose = (s: GameState, id: string, type: string) => {
  s.objects[id]!.chosen = { type };
  invalidateCharacteristics(s);
};
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("creature types outside the battlefield", () => {
  it("parse", () => {
    for (const d of [maskwood, adaptation, leyline, conspiracy, xenograft, rukarumel]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Maskwood Nexus: your creatures, creature cards in your hand and graveyard and your commander are every creature type; an opponent's aren't", () => {
    const { s, ap, ids, opp } = setup([bear()]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const dead = toGraveyard(s, ap, bear());
    const theirDead = toGraveyard(s, opp, bear());
    const cmdr = Object.values(s.objects).find((o) => o.isCommander && o.owner === ap)!.id;
    expect(isElf(s, ids[0]!)).toBe(false);
    const nexus = putOnBattlefield(s, ap, maskwood);
    expect(characteristics(s, s.objects[mine]!).allCreatureTypes).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).allCreatureTypes).toBe(false);
    for (const id of [ids[0]!, dead, cmdr]) expect(isElf(s, id) && isGoblin(s, id)).toBe(true);
    expect(isElf(s, theirDead)).toBe(false);
    // A noncreature card isn't affected.
    const land = toGraveyard(s, ap, card("Forest", "Basic Land — Forest"));
    expect(isElf(s, land)).toBe(false);
    // Gone, and they're Bears again.
    s.battlefield.splice(s.battlefield.indexOf(nexus), 1);
    s.objects[nexus]!.zone = "graveyard";
    invalidateCharacteristics(s);
    expect(isElf(s, ids[0]!)).toBe(false);
    expect(characteristics(s, s.objects[mine]!).allCreatureTypes).toBe(false);
  });

  it("Maskwood Nexus: a creature spell you cast is an Elf spell for Lys Alana Huntmaster", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, huntmaster);
    putOnBattlefield(s0, ap, maskwood);
    const before = s0.battlefield.length;
    const s = settle(cast(s0, ap, ids[0]!));
    // The Bear and an Elf Warrior token.
    expect(s.battlefield.length).toBe(before + 2);
  });

  it("without Maskwood Nexus a Bear spell isn't an Elf spell", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, huntmaster);
    const before = s0.battlefield.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.battlefield.length).toBe(before + 1);
  });

  it("Arcane Adaptation adds the chosen type; with Metallic Mimic of that type, a creature you cast enters with a counter (rulings)", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    const a = putOnBattlefield(s0, ap, adaptation);
    choose(s0, a, "Elf");
    const m = putOnBattlefield(s0, ap, mimic);
    choose(s0, m, "Elf");
    expect(isElf(s0, ids[0]!)).toBe(true);
    expect(defOf(s0, s0.objects[ids[0]!]!).subtypes).toEqual(["Bear", "Elf"]);
    const s = cast(s0, ap, ids[0]!);
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toEqual(["Bear", "Elf"]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });

  it("Conspiracy replaces creature types, even a changeling's; a later Maskwood Nexus makes them every type again (timestamps)", () => {
    const { s, ap, ids } = setup([bear(), changeling]);
    const c = putOnBattlefield(s, ap, conspiracy);
    choose(s, c, "Goblin");
    const out = putOnBattlefield(s, ap, changeling);
    expect(defOf(s, s.objects[ids[0]!]!).subtypes).toEqual(["Goblin"]);
    expect(isElf(s, ids[1]!)).toBe(false);
    expect(isGoblin(s, ids[1]!)).toBe(true);
    expect(characteristics(s, s.objects[out]!).allCreatureTypes).toBe(false);
    expect(characteristics(s, s.objects[out]!).subtypes).toEqual(["Goblin"]);
    putOnBattlefield(s, ap, maskwood);
    expect(isElf(s, ids[0]!)).toBe(true);
    expect(characteristics(s, s.objects[out]!).allCreatureTypes).toBe(true);
  });

  it("Maskwood Nexus first, then Conspiracy: only the chosen type", () => {
    const { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, maskwood);
    const c = putOnBattlefield(s, ap, conspiracy);
    choose(s, c, "Goblin");
    expect(isElf(s, ids[0]!)).toBe(false);
    expect(isGoblin(s, ids[0]!)).toBe(true);
  });

  it("Xenograft changes only creatures on the battlefield (rulings)", () => {
    const { s, ap, ids } = setup([bear()]);
    const x = putOnBattlefield(s, ap, xenograft);
    choose(s, x, "Elf");
    const b = putOnBattlefield(s, ap, bear());
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(["Bear", "Elf"]);
    expect(isElf(s, ids[0]!)).toBe(false);
  });

  it("Rukarumel: Slivers and nontoken creatures you control, and creature cards you own", () => {
    const { s, ap, ids } = setup([bear()]);
    const r = putOnBattlefield(s, ap, rukarumel);
    choose(s, r, "Elf");
    const b = putOnBattlefield(s, ap, bear());
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(["Bear", "Elf"]);
    expect(isElf(s, ids[0]!)).toBe(true);
  });

  it("counts in the layers see the cards' new types: \"for each Elf card in your graveyard\"", () => {
    const { s, ap } = setup([]);
    const lord = putOnBattlefield(s, ap, card("Elf Counter", "Creature — Elf", "{G}", { power: "0", toughness: "1", oracleText: "This creature gets +1/+0 for each Elf card in your graveyard." }));
    toGraveyard(s, ap, bear());
    toGraveyard(s, ap, bear());
    expect(characteristics(s, s.objects[lord]!).power).toBe(0);
    putOnBattlefield(s, ap, maskwood);
    expect(characteristics(s, s.objects[lord]!).power).toBe(2);
  });
});

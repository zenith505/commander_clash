// Basic land types (CR 305.7): setting a land's basic land type ("Nonbasic lands are Mountains", "Enchanted land is an
// Island", "target land becomes the basic land type of your choice") replaces its land types and removes the abilities
// from its rules text; it gets the mana ability of its new type (CR 305.6). Adding a type ("Each land is a Swamp in
// addition to its other land types") keeps everything. Dependencies (CR 613.8): Blood Moon stops Urborg whatever the
// order. Also "the color of your choice", Aerial Modification's Vehicle, and "target 1/1 creature".

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import {
  characteristics,
  invalidateCharacteristics,
  isFullySupported,
  manaAbilitiesOn,
  manaChoices,
  moveObject,
  planActivate,
  waitingOn,
  botActions,
  type Action,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

// Real oracle text (Scryfall).
const bloodMoon = card("Blood Moon", "Enchantment", "{2}{R}", { oracleText: "Nonbasic lands are Mountains." });
const urborg = card("Urborg, Tomb of Yawgmoth", "Legendary Land", "", { oracleText: "Each land is a Swamp in addition to its other land types." });
const seas = card("Spreading Seas", "Enchantment — Aura", "{1}{U}", { oracleText: "Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land is an Island." });
const omen = card("Prismatic Omen", "Enchantment", "{1}{G}", { oracleText: "Lands you control are every basic land type in addition to their other types." });
const conversion = card("Conversion", "Enchantment", "{2}{W}{W}", { oracleText: "At the beginning of your upkeep, sacrifice this enchantment unless you pay {W}{W}.\nAll Mountains are Plains." });
const choke = card("Choke", "Enchantment", "{2}{G}", { oracleText: "Islands don't untap during their controllers' untap steps." });
const reefShaman = card("Reef Shaman", "Creature — Merfolk Shaman", "{U}", { power: "0", toughness: "2", oracleText: "{T}: Target land becomes the basic land type of your choice until end of turn." });
const tidalWarrior = card("Tidal Warrior", "Creature — Merfolk Warrior", "{U}", { power: "1", toughness: "1", oracleText: "{T}: Target land becomes an Island until end of turn." });
const chameleon = card("Kavu Chameleon", "Creature — Kavu", "{3}{G}{G}", { power: "4", toughness: "4", oracleText: "This spell can't be countered.\n{G}: This creature becomes the color of your choice until end of turn." });
const tomb = card("Ancient Tomb", "Land", "", { oracleText: "{T}: Add {C}{C}. This land deals 2 damage to you." });
const tapland = card("Dismal Backwater", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, you gain 1 life.\n{T}: Add {U} or {B}." });
const aerial = card("Aerial Modification", "Enchantment — Aura", "{4}{W}", {
  oracleText: "Enchant creature or Vehicle\nAs long as enchanted permanent is a Vehicle, it's a creature in addition to its other types.\nEnchanted creature gets +2/+2 and has flying.",
});
const copter = card("Smuggler's Copter", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Flying\nCrew 1" });
const pendelhaven = card("Pendelhaven", "Legendary Land", "", { oracleText: "{T}: Add {G}.\n{T}: Target 1/1 creature gets +1/+2 until end of turn." });
const seedcore = card("The Seedcore", "Land — Sphere", "", {
  oracleText:
    "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast Phyrexian creature spells.\nCorrupted — {T}: Target 1/1 creature gets +2/+1 until end of turn. Activate only if an opponent has three or more poison counters.",
});
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });

const makes = (s: GameState, id: string) => [...new Set(manaAbilitiesOn(s, s.objects[id]!).flatMap((ab) => manaChoices(s, s.objects[id]!, ab)))].sort();
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
function attach(s: GameState, pid: PlayerId, aura: CardDef, to: string) {
  const id = putOnBattlefield(s, pid, aura);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
}
function toHand(s: GameState, pid: PlayerId, d: CardDef) {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("basic land types (CR 305.7)", () => {
  it("compiles", () => {
    for (const d of [bloodMoon, urborg, seas, omen, conversion, choke, reefShaman, tidalWarrior, chameleon, aerial, pendelhaven, seedcore]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Blood Moon: a nonbasic land is a Mountain with only {T}: Add {R}; basic lands don't change", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tomb);
    const f = putOnBattlefield(s, ap, forest);
    expect(makes(s, t)).toEqual(["C"]);
    putOnBattlefield(s, ap, bloodMoon);
    expect(subtypes(s, t)).toEqual(["Mountain"]);
    expect(makes(s, t)).toEqual(["R"]);
    expect(characteristics(s, s.objects[t]!).hasPrintedAbilities).toBe(false);
    expect(characteristics(s, s.objects[t]!).types).toEqual(["Land"]); // still nonbasic and a land
    expect(makes(s, f)).toEqual(["G"]);
  });

  it("Urborg makes every land a Swamp too; under Blood Moon it does nothing, whichever came first (rulings)", () => {
    const { s, ap } = setup([]);
    const f = putOnBattlefield(s, ap, forest);
    const u = putOnBattlefield(s, ap, urborg);
    expect(makes(s, f)).toEqual(["B", "G"]);
    expect(subtypes(s, u)).toEqual(["Swamp"]);
    putOnBattlefield(s, ap, bloodMoon);
    expect(makes(s, f)).toEqual(["G"]);
    expect(subtypes(s, u)).toEqual(["Mountain"]);
    // The other order: Blood Moon first.
    const { s: s2, ap: ap2 } = setup([]);
    putOnBattlefield(s2, ap2, bloodMoon);
    const f2 = putOnBattlefield(s2, ap2, forest);
    putOnBattlefield(s2, ap2, urborg);
    expect(makes(s2, f2)).toEqual(["G"]);
  });

  it("Conversion after Blood Moon: nonbasic lands become Mountains, then Plains (CR 613.8)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, conversion);
    const t = putOnBattlefield(s, ap, tomb);
    putOnBattlefield(s, ap, bloodMoon);
    expect(subtypes(s, t)).toEqual(["Plains"]);
    expect(makes(s, t)).toEqual(["W"]);
  });

  it("Spreading Seas: the enchanted land is an Island and nothing else", () => {
    const { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, opp, forest);
    attach(s, ap, seas, f);
    expect(subtypes(s, f)).toEqual(["Island"]);
    expect(makes(s, f)).toEqual(["U"]);
    // Choke: Islands don't untap.
    putOnBattlefield(s, ap, choke);
    expect(characteristics(s, s.objects[f]!).doesntUntap).toBe(true);
  });

  it("Prismatic Omen: lands you control have every basic land type and their own abilities", () => {
    const { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tomb);
    const theirs = putOnBattlefield(s, opp, forest);
    putOnBattlefield(s, ap, omen);
    expect(makes(s, t)).toEqual(["B", "C", "G", "R", "U", "W"]);
    expect(makes(s, theirs)).toEqual(["G"]);
  });

  it("a land that would enter tapped doesn't under Blood Moon, and its enters ability doesn't trigger (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bloodMoon);
    const id = toHand(s0, ap, tapland);
    const life = s0.players[ap]!.life;
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: id }));
    expect(s.objects[id]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(life);
    expect(makes(s, id)).toEqual(["R"]);
  });

  it("Reef Shaman: the target land becomes the chosen basic land type until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const shaman = putOnBattlefield(s0, ap, reefShaman);
    const t = putOnBattlefield(s0, opp, tomb);
    let s = run(s0, planActivate(s0, ap, shaman, 0, [target(t)]));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "basicLandType", options: ["Plains", "Island", "Swamp", "Mountain", "Forest"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Swamp" }));
    expect(subtypes(s, t)).toEqual(["Swamp"]);
    expect(makes(s, t)).toEqual(["B"]);
    expect(s.log.some((e) => /Ancient Tomb becomes a Swamp until end of turn/.test(e.text))).toBe(true);
    // A bot picks a type for an opponent's land whose color their commander can't use.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const sh1 = putOnBattlefield(s1, ap1, reefShaman);
    const t1 = putOnBattlefield(s1, opp1, tomb);
    let b = run(s1, planActivate(s1, ap1, sh1, 0, [target(t1)]));
    for (const a of botActions(b, ap1)) b = act(b, a);
    expect(subtypes(settle(b), t1)).not.toEqual(["Forest"]); // the test commanders are green
  });

  it("Tidal Warrior: target land becomes an Island until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, tidalWarrior);
    const f = putOnBattlefield(s0, ap, forest);
    const s = run(s0, planActivate(s0, ap, w, 0, [target(f)]));
    expect(subtypes(s, f)).toEqual(["Island"]);
    expect(makes(s, f)).toEqual(["U"]);
  });

  it("Kavu Chameleon becomes the color of your choice", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, chameleon);
    let s = run(s0, planActivate(s0, ap, k, 0));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Blue" }));
    expect(characteristics(s, s.objects[k]!).colors).toEqual(["U"]);
  });
});

describe("Aerial Modification and 1/1 targets", () => {
  it("a Vehicle it enchants is a creature, gets +2/+2 and flying; when it leaves, the Vehicle isn't a creature (and leaves combat, CR 506.4)", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, copter);
    expect(characteristics(s0, s0.objects[v]!).types).toEqual(["Artifact"]);
    const a = attach(s0, ap, aerial, v);
    const c = characteristics(s0, s0.objects[v]!);
    expect(c.types).toEqual(["Artifact", "Creature"]);
    expect([c.power, c.toughness]).toEqual([5, 5]);
    // A creature it enchants just gets the bonus.
    const b = putOnBattlefield(s0, ap, bear());
    attach(s0, ap, aerial, b);
    expect(characteristics(s0, s0.objects[b]!).types).toEqual(["Creature"]);
    const s = structuredClone(s0);
    s.objects[v]!.attacking = s.turnOrder[1]!;
    moveObject(s, a, "graveyard");
    const t = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(characteristics(t, t.objects[v]!).types).toEqual(["Artifact"]);
    expect(t.objects[v]!.attacking).toBeUndefined();
  });

  it("Pendelhaven and The Seedcore target only a 1/1 creature", () => {
    const { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, pendelhaven);
    const one = putOnBattlefield(s, ap, elf);
    const two = putOnBattlefield(s, ap, bear());
    expect(planActivate(s, ap, p, 0, [target(one)])).not.toBeNull();
    expect(planActivate(s, ap, p, 0, [target(two)])).toBeNull();
    const sc = putOnBattlefield(s, ap, seedcore);
    expect(planActivate(s, ap, sc, 0, [target(one)])).toBeNull(); // not corrupted yet
    s.players[opp]!.poison = 3;
    expect(planActivate(s, ap, sc, 0, [target(one)])).not.toBeNull();
  });
});

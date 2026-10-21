// Round 97, more cards: Bloodghast (haste while an opponent has 10 or less life) and Omniscience (cast spells from your
// hand without paying their mana costs, CR 118.9: an alternative cost, so X is 0 and additional costs still apply).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, objHasKeyword, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ManaType } from "../src";

// Real oracle text (Scryfall).
const bloodghast = card("Bloodghast", "Creature — Vampire Spirit", "{B}{B}", { power: "2", toughness: "1", oracleText: "This creature can't block.\nThis creature has haste as long as an opponent has 10 or less life.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield." });
const omniscience = card("Omniscience", "Enchantment", "{7}{U}{U}{U}", { oracleText: "You may cast spells from your hand without paying their mana costs." });
const monument = card("Forsaken Monument", "Legendary Artifact", "{5}", { oracleText: "Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life." });
const cagedSun = card("Caged Sun", "Artifact", "{6}", { oracleText: "As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+1.\nWhenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const wastes = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
const forest = card("Forest", "Basic Land — Forest");
const mountain = card("Mountain", "Basic Land — Mountain");
const lotusPod = card("Seed Pod Land", "Land", "", { oracleText: "Sacrifice this land: Add {G}." });
const vesuva = card("Vesuva", "Land", "", { oracleText: "You may have this land enter tapped as a copy of any land on the battlefield." });
const flux = card("Essence Flux", "Instant", "{U}", { oracleText: "Exile target creature you control, then return that card to the battlefield under its owner's control. If it's a Spirit, put a +1/+1 counter on it." });
const iteration = card("Expressive Iteration", "Sorcery", "{U}{R}", { oracleText: "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn." });
const coat = card("Coat of Arms", "Artifact", "{5}", { oracleText: "Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it." });
const giant = card("Big Giant", "Creature — Giant", "{6}{R}{R}", { power: "8", toughness: "8" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

const pool = (s: GameState, pid: number) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0));
const tapFor = (s: GameState, pid: number, id: string, mana: ManaType): Action => ({ type: "activateMana", player: pid, objectId: id, mana });

describe("round 97, more cards", () => {
  it("parse", () => {
    supported(bloodghast, omniscience, monument, cagedSun, vesuva, flux, iteration, coat);
    expect(compileCard(omniscience).castFromHandFree).toBe(true);
  });

  it("Bloodghast has haste only while an opponent has 10 or less life", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, bloodghast, { sick: true });
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(false);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s.players[opp]!.life = 10;
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
  });

  it("Omniscience: a spell from your hand costs nothing; without it the giant can't be cast", () => {
    const { s: s0, ap, ids } = setup([giant]);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" })).toBeNull();
    putOnBattlefield(s0, ap, omniscience);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" }));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // No land was tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(0);
  });

  it("Forsaken Monument: one more {C} whenever you tap a permanent for {C}, however many it made; not for colored mana", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, monument);
    const ring = putOnBattlefield(s, ap, solRing);
    const w = putOnBattlefield(s, ap, wastes);
    const m = putOnBattlefield(s, ap, mountain);
    expect(pool(act(s, tapFor(s, ap, ring, "C")), ap)).toEqual({ C: 3 });
    expect(pool(act(s, tapFor(s, ap, w, "C")), ap)).toEqual({ C: 2 });
    expect(pool(act(s, tapFor(s, ap, m, "R")), ap)).toEqual({ R: 1 });
    // An opponent's Sol Ring doesn't trigger it.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, solRing);
    s.priority = opp;
    expect(pool(act(s, tapFor(s, opp, theirs, "C")), opp)).toEqual({ C: 2 });
  });

  it("Caged Sun: one more mana of the chosen color from your lands' abilities, {T} in the cost or not", () => {
    const { s, ap } = setup([]);
    const sun = putOnBattlefield(s, ap, cagedSun);
    s.objects[sun]!.chosen = { color: "G" };
    const f = putOnBattlefield(s, ap, forest);
    const m = putOnBattlefield(s, ap, mountain);
    const pod = putOnBattlefield(s, ap, lotusPod);
    expect(pool(act(s, tapFor(s, ap, f, "G")), ap)).toEqual({ G: 2 });
    expect(pool(act(s, tapFor(s, ap, m, "R")), ap)).toEqual({ R: 1 });
    const after = act(s, tapFor(s, ap, pod, "G"));
    expect(pool(after, ap)).toEqual({ G: 2 });
    expect(after.objects[pod]!.zone).toBe("graveyard");
    // An opponent's Forest: no.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, forest);
    s.priority = opp;
    expect(pool(act(s, tapFor(s, opp, theirs, "G")), opp)).toEqual({ G: 1 });
  });

  it("Vesuva: enters tapped as a copy of a land; untapped as itself if you don't copy", () => {
    const { s: s0, ap, ids } = setup([vesuva]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s0, opp, forest);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    const copy = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options[0]! });
    expect(copy.objects[ids[0]!]!.tapped).toBe(true);
    expect(characteristics(copy, copy.objects[ids[0]!]!).name).toBe("Forest");
    const none = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(none.objects[ids[0]!]!.tapped).toBe(false);
    expect(characteristics(none, none.objects[ids[0]!]!).name).toBe("Vesuva");
  });

  it("Essence Flux: the returned creature gets a +1/+1 counter only if it's a Spirit", () => {
    for (const [type, n] of [["Spirit", 1], ["Bear", 0]] as const) {
      const { s: s0, ap, ids } = setup([flux]);
      const c = putOnBattlefield(s0, ap, bear({ subtypes: [type] }));
      s0.objects[c]!.counters["+1/+1"] = 2;
      const s = settle(cast(s0, ap, ids[0]!, [target(c)]));
      expect(s.objects[c]!.zone).toBe("battlefield");
      expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(n);
    }
  });

  it("Expressive Iteration: one card to your hand, one to the bottom, one exiled that you may play this turn", () => {
    const { s: s0, ap, ids } = setup([iteration]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, cards: top });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, cards: [top[0], top[2]] });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[2]!] });
    s = settle(s);
    expect(s.objects[top[1]!]!.zone).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(top[0]);
    expect(s.objects[top[2]!]!.zone).toBe("exile");
    expect(s.objects[top[2]!]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
  });

  it("Expressive Iteration with two cards in your library: one to your hand, the other to the bottom, none exiled", () => {
    const { s: s0, ap, ids } = setup([iteration]);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(2)) { s0.objects[id]!.zone = "graveyard"; s0.players[ap]!.graveyard.push(id); }
    const [a, b] = lib;
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [a!] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a!]!.zone).toBe("hand");
    expect(s.objects[b!]!.zone).toBe("library");
  });

  it("Coat of Arms: each creature counts the other creatures sharing a creature type with it, anyone's, changelings too", () => {
    const { s, ap } = setup([]);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s, ap, coat);
    const elf = putOnBattlefield(s, ap, bear({ name: "Elf A", subtypes: ["Elf"] }));
    const theirElf = putOnBattlefield(s, opp, bear({ name: "Elf B", subtypes: ["Elf", "Warrior"] }));
    const goblin = putOnBattlefield(s, ap, bear({ name: "Goblin A", subtypes: ["Goblin"] }));
    const shifter = putOnBattlefield(s, opp, bear({ name: "Shifter", subtypes: ["Shapeshifter"], keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    const golem = putOnBattlefield(s, ap, card("Plain Golem", "Artifact Creature", "{2}", { power: "2", toughness: "2" }));
    const pt = (id: string) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
    expect(pt(elf)).toEqual([4, 4]); // the other Elf and the changeling
    expect(pt(theirElf)).toEqual([4, 4]);
    expect(pt(goblin)).toEqual([3, 3]); // the changeling
    expect(pt(shifter)).toEqual([5, 5]); // the two Elves and the Goblin
    expect(pt(golem)).toEqual([2, 2]);
  });
});

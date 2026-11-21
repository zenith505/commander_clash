// Lane B round B281: Celestial Dawn ("Lands you control are Plains. Nonland permanents you control are white. The same is
// true for spells you control and nonland cards you own that aren't on the battlefield. You may spend white mana as though
// it were mana of any color. You may spend other mana only as though it were colorless mana."; CR 105.3, 305.7, 609.4b,
// 613.1d-e and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { canPayFromPool } from "../src/spend";
import { parseManaCost } from "../src/mana";
import { castProblem, characteristics, defOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const dawn = (): CardDef => ({"oracleId":"b4d27fad-9a94-4760-80a6-6a2948109864","name":"Celestial Dawn","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Lands you control are Plains.\nNonland permanents you control are white. The same is true for spells you control and nonland cards you own that aren't on the battlefield.\nYou may spend white mana as though it were mana of any color. You may spend other mana only as though it were colorless mana.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const seer = (): CardDef => ({"oracleId":"cef7396d-2168-4282-bf38-670ca9eebd91","name":"Thought-Knot Seer","manaCost":"{3}{C}","cmc":4,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"({C} represents colorless mana.)\nWhen this creature enters, target opponent reveals their hand. You choose a nonland card from it and exile that card.\nWhen this creature leaves the battlefield, target opponent draws a card.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const guildgate = (): CardDef => ({"oracleId":"73c423b7-cab8-4e69-8070-9edbf96a6c2c","name":"Boros Guildgate","manaCost":"","cmc":0,"typeLine":"Land — Gate","supertypes":[],"types":["Land"],"subtypes":["Gate"],"oracleText":"This land enters tapped.\n{T}: Add {R} or {W}.","colors":[],"colorIdentity":["R","W"],"keywords":[],"producedMana":["R","W"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const orrery = (): CardDef => ({"oracleId":"95c3976c-33f3-490b-bfd3-7f1af2fe0416","name":"Chromatic Orrery","manaCost":"{7}","cmc":7,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"You may spend mana as though it were mana of any color.\n{T}: Add {C}{C}{C}{C}{C}.\n{5}, {T}: Draw a card for each color among permanents you control.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const bloodMoon = (): CardDef => ({"oracleId":"94fac5fe-97d5-4c12-a80c-8efff9d853ae","name":"Blood Moon","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Nonbasic lands are Mountains.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;

const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const pool = (s: GameState, pid: PlayerId, m: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...m };
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Leaves none of `pid`'s lands on the battlefield. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land")) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      o.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
    }
  }
  invalidateCharacteristics(s);
};
const colors = (s: GameState, id: string) => (s.objects[id]!.zone === "battlefield" ? characteristics(s, s.objects[id]!).colors : defOf(s, s.objects[id]!).colors);
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const removeFromBattlefield = (s: GameState, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[s.objects[id]!.owner]!.graveyard.push(id);
  invalidateCharacteristics(s);
};

describe("Celestial Dawn", () => {
  it("is supported", () => {
    expect(isFullySupported(dawn())).toBe(true);
  });

  it("lands you control are Plains: a Forest taps for {W} only; an opponent's Forest and a land card in hand don't change", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, dawn());
    const theirs = putOnBattlefield(s, opp, s.cards[s.objects[named(s, "Forest")[0]!]!.cardId]!);
    const inHand = toZone(s, ap, s.cards[s.objects[named(s, "Mountain")[0]!]!.cardId]!, "hand");
    invalidateCharacteristics(s);
    const mine = named(s, "Forest").find((id) => s.objects[id]!.controller === ap)!;
    const c = characteristics(s, s.objects[mine]!);
    expect(c.subtypes).toEqual(["Plains"]);
    // It keeps its supertype (rulings: no snow added or removed, and basic stays).
    expect(c.supertypes).toContain("Basic");
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual(["Forest"]);
    expect(defOf(s, s.objects[inHand]!).subtypes).toEqual(["Mountain"]);
    const after = act(s, { type: "activateMana", player: ap, objectId: mine, mana: "W" });
    expect(after.players[ap]!.manaPool.W).toBe(1);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: mine, mana: "G" })).toThrow();
  });

  it("a land that would enter tapped loses that ability before it applies (rulings)", () => {
    const { s: s0, ap } = setup([guildgate()]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, dawn());
    invalidateCharacteristics(s);
    const gate = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Boros Guildgate")!;
    const after = act(s, { type: "playLand", player: ap, objectId: gate });
    expect(after.objects[gate]!.zone).toBe("battlefield");
    expect(after.objects[gate]!.tapped).toBe(false);
    expect(characteristics(after, after.objects[gate]!).subtypes).toEqual(["Plains"]);
  });

  it("your nonland permanents, spells and nonland cards are white; others' aren't, and colors come back once it's gone", () => {
    const { s: s0, ap, opp } = setup([]);
    const s1 = structuredClone(s0);
    const d = putOnBattlefield(s1, ap, dawn());
    const elf = putOnBattlefield(s1, ap, elves());
    const ring = putOnBattlefield(s1, ap, solRing());
    const theirElf = putOnBattlefield(s1, opp, elves());
    const handBolt = toZone(s1, ap, bolt(), "hand");
    const yardBear = toZone(s1, ap, bear(), "graveyard");
    const libBear = toZone(s1, ap, bear(), "library");
    const theirBolt = toZone(s1, opp, bolt(), "hand");
    invalidateCharacteristics(s1);
    expect(colors(s1, elf)).toEqual(["W"]);
    expect(colors(s1, ring)).toEqual(["W"]);
    expect(colors(s1, theirElf)).toEqual(["G"]);
    expect(colors(s1, handBolt)).toEqual(["W"]);
    expect(colors(s1, yardBear)).toEqual(["W"]);
    expect(colors(s1, libBear)).toEqual(["W"]);
    expect(colors(s1, theirBolt)).toEqual(["R"]);
    // A spell you control on the stack (paid with white mana as though it were red).
    pool(s1, ap, { W: 1 });
    const s2 = run(s1, planCast(s1, ap, handBolt, [ply(opp)]));
    expect(s2.objects[handBolt]!.zone).toBe("stack");
    expect(colors(s2, handBolt)).toEqual(["W"]);
    // Once Celestial Dawn is gone, the colors are their own again (rulings).
    removeFromBattlefield(s1, d);
    expect(colors(s1, elf)).toEqual(["G"]);
    expect(colors(s1, ring)).toEqual([]);
    expect(colors(s1, handBolt)).toEqual(["R"]);
  });

  it("white mana pays colored symbols; other colors pay only generic mana and {C}", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, dawn());
    noLands(s, ap);
    const elf = toZone(s, ap, elves(), "hand");
    const b = toZone(s, ap, bolt(), "hand");
    const ring = toZone(s, ap, solRing(), "hand");
    const tks = toZone(s, ap, seer(), "hand");
    // Green mana can't pay {G} any more; white mana can.
    pool(s, ap, { G: 1 });
    expect(planCast(s, ap, elf)).toBeNull();
    pool(s, ap, { W: 1 });
    expect(planCast(s, ap, elf)).not.toBeNull();
    pool(s, ap, { R: 1 });
    expect(planCast(s, ap, b, [ply(opp)])).toBeNull();
    // Green mana pays generic mana.
    pool(s, ap, { G: 1 });
    expect(castProblem(s, ap, ring)).toBeNull();
    // {C}: colorless mana or other mana as though it were colorless, never white (colorless isn't a color).
    pool(s, ap, { W: 4 });
    expect(planCast(s, ap, tks)).toBeNull();
    pool(s, ap, { W: 3, G: 1 });
    expect(planCast(s, ap, tks)).not.toBeNull();
    pool(s, ap, { W: 3, C: 1 });
    expect(planCast(s, ap, tks)).not.toBeNull();
  });

  it("the mana spent stays white (CR 609.4b): a Plains tapped for Lightning Bolt", () => {
    const { s: s0, ap, opp } = setup([bolt()]);
    const s1 = structuredClone(s0);
    putOnBattlefield(s1, ap, dawn());
    for (const id of [...s1.battlefield]) {
      const o = s1.objects[id]!;
      if (o.controller === ap && s1.cards[o.cardId]!.types.includes("Land") && s1.cards[o.cardId]!.name !== "Mountain") removeFromBattlefield(s1, id);
    }
    const b = s1.players[ap]!.hand.find((id) => s1.cards[s1.objects[id]!.cardId]!.name === "Lightning Bolt")!;
    // A Mountain is a Plains now and taps for {W}, which pays {R}.
    const s2 = settle(run(s1, planCast(s1, ap, b, [ply(opp)])));
    expect(s2.players[opp]!.life).toBe(37);
    expect(named(s2, "Mountain").filter((id) => s2.objects[id]!.tapped).length).toBe(1);
  });

  it("only its controller's costs: an opponent's green mana still pays {G}", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, dawn());
    pool(s, opp, { G: 1 });
    pool(s, ap, { G: 1 });
    expect(canPayFromPool(s, opp, parseManaCost("{G}"), "other")).toBe(true);
    expect(canPayFromPool(s, ap, parseManaCost("{G}"), "other")).toBe(false);
    expect(canPayFromPool(s, ap, parseManaCost("{1}"), "other")).toBe(true);
  });

  it("no permission to spend mana as though it were any color gets past it: with Chromatic Orrery green still can't pay {G}", () => {
    const { s: s0, ap } = setup([]);
    const s = structuredClone(s0);
    putOnBattlefield(s, ap, dawn());
    putOnBattlefield(s, ap, orrery());
    noLands(s, ap);
    const elf = toZone(s, ap, elves(), "hand");
    pool(s, ap, { G: 1 });
    expect(planCast(s, ap, elf)).toBeNull();
    pool(s, ap, { W: 1 });
    expect(planCast(s, ap, elf)).not.toBeNull();
  });
});

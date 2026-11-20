// Round 427 (Lane A): Huatli, Poet of Unity // Roar of the Fifth People's chapter II, 'This Saga gains "Creatures you control
// have '{T}: Add {R}, {G}, or {W}.'"': a static ability the Saga gains with no duration (rulings), whose effect gives each
// creature you control the mana ability for as long as the Saga is on the battlefield, creatures that come later too
// (CR 611.3a), applied in layer 6 once the effect granting it has (CR 613.1f, 613.7a, 613.8a).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { manaOptions } from "../src/manaabilities";
import { applyAction, characteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const huatli = (): CardDef => ({"oracleId":"2e6ed3e6-d2b8-4b75-b7e1-0773da4987a1","name":"Huatli, Poet of Unity // Roar of the Fifth People","manaCost":"{2}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warrior Bard // Enchantment — Saga","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Bard"],"oracleText":"When Huatli enters, search your library for a basic land card, reveal it, put it into your hand, then shuffle.\n{3}{R/W}{R/W}: Exile Huatli, then return her to the battlefield transformed under her owner's control. Activate only as a sorcery.","power":"2","toughness":"3","colors":["G"],"colorIdentity":["G","R","W"],"keywords":["Transform"],"commanderLegal":"legal","layout":"transform","faces":[{"name":"Huatli, Poet of Unity","manaCost":"{2}{G}","typeLine":"Legendary Creature — Human Warrior Bard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Bard"],"oracleText":"When Huatli enters, search your library for a basic land card, reveal it, put it into your hand, then shuffle.\n{3}{R/W}{R/W}: Exile Huatli, then return her to the battlefield transformed under her owner's control. Activate only as a sorcery.","power":"2","toughness":"3","colors":["G"]},{"name":"Roar of the Fifth People","manaCost":"","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Create two 3/3 green Dinosaur creature tokens.\nII — This Saga gains \"Creatures you control have '{T}: Add {R}, {G}, or {W}.'\"\nIII — Search your library for a Dinosaur card, reveal it, put it into your hand, then shuffle.\nIV — Dinosaurs you control gain double strike and trample until end of turn.","colors":["G","R","W"],"colorIndicator":["G","R","W"]}]} as unknown as CardDef);
const humility = (): CardDef => ({"oracleId":"ed7bdb3e-5c51-4547-9266-76a791e0b2b0","name":"Humility","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All creatures lose all abilities and have base power and toughness 1/1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const colorsOf = (s: GameState, id: ObjectId) => [...new Set(manaOptions(s, s.objects[id]!).map((m) => m.mana))].sort().join("");
const creaturesOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Creature"));
const dinosOf = (s: GameState, pid: PlayerId) => creaturesOf(s, pid).filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Dinosaur"));

/** Huatli on the battlefield, transformed by her own ability: Roar of the Fifth People with chapter I resolved. */
function roar() {
  const { s: s0, ap } = setup([]);
  const h = putOnBattlefield(s0, ap, huatli());
  const s = settle(run(s0, planActivate(s0, ap, h, 0)));
  const saga = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Roar of the Fifth People")!;
  return { s, ap, saga };
}
/** On to chapter II: the active player's next precombat main phase, the lore counter added after the draw step. */
function chapterTwo() {
  const r = roar();
  let s = passUntil(r.s, "end", r.ap, 4000);
  s = passUntil(s, "main1", r.ap, 4000);
  return { ...r, s: settle(s) };
}

describe("round 427: Huatli compiles", () => {
  it("both faces", () => {
    expect(isFullySupported(huatli())).toBe(true);
  });
});

describe("Roar of the Fifth People: chapter II", () => {
  it("chapter I makes two Dinosaurs, which have no mana ability yet", () => {
    const { s, ap, saga } = roar();
    expect(saga).toBeDefined();
    expect(s.objects[saga]!.counters.lore).toBe(1);
    const dinos = dinosOf(s, ap);
    expect(dinos).toHaveLength(2);
    expect(colorsOf(s, dinos[0]!)).toBe("");
  });

  it("then gives every creature you control '{T}: Add {R}, {G}, or {W}', ones that come later too, not opponents' creatures", () => {
    let { s, ap, saga } = chapterTwo();
    expect(s.activePlayer).toBe(ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    expect(characteristics(s, s.objects[saga]!).grantedAbilities?.some((t) => t.startsWith("Creatures you control have"))).toBe(true);
    const dinos = dinosOf(s, ap);
    expect(dinos).toHaveLength(2);
    for (const d of dinos) expect(colorsOf(s, d)).toBe("GRW");
    // A creature that comes later has it too (CR 611.3a); an opponent's doesn't.
    const late = putOnBattlefield(s, ap, bear({ name: "Late Bear" }));
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(colorsOf(s, late)).toBe("GRW");
    expect(colorsOf(s, theirs)).toBe("");
    // Tapping it adds the color chosen.
    const before = s.players[ap]!.manaPool.R ?? 0;
    s = act(s, { type: "activateMana", player: ap, objectId: dinos[0]!, mana: "R" });
    expect(s.objects[dinos[0]!]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(before + 1);
  });

  it("is gone when the Saga leaves the battlefield (the ability has no duration of its own, rulings)", () => {
    const { s, ap, saga } = chapterTwo();
    const dinos = dinosOf(s, ap);
    expect(colorsOf(s, dinos[0]!)).toBe("GRW");
    s.battlefield = s.battlefield.filter((id) => id !== saga);
    s.objects[saga]!.zone = "graveyard";
    s.objects[saga]!.zoneChanges = (s.objects[saga]!.zoneChanges ?? 0) + 1;
    s.players[s.objects[saga]!.owner]!.graveyard.push(saga);
    invalidateCharacteristics(s);
    expect(colorsOf(s, dinos[0]!)).toBe("");
  });

  it("an earlier Humility doesn't stop it (the granted ability applies later in timestamp order, CR 613.7a), a later one does", () => {
    // Humility first: the Saga's granted static has the later timestamp, so it adds the ability after Humility removes all.
    const a = chapterTwo();
    const early = a.s;
    const h1 = putOnBattlefield(early, a.ap, humility());
    early.objects[h1]!.timestamp = 0;
    invalidateCharacteristics(early);
    expect(colorsOf(early, dinosOf(early, a.ap)[0]!)).toBe("GRW");
    // Humility after: it removes the creatures' abilities, the granted mana ability among them.
    const b = chapterTwo();
    putOnBattlefield(b.s, b.ap, humility());
    expect(colorsOf(b.s, dinosOf(b.s, b.ap)[0]!)).toBe("");
  });
});

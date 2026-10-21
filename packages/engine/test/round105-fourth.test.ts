// Round 105, a fourth batch: Smuggler's Share (opponents who drew two or more cards, had two or more lands enter),
// Replicating Ring (named snow artifact tokens), The Skullspore Nexus (the total power of the creatures that died), Sting
// (first strike while blocking or blocked by a Goblin or Orc), Consuming Aberration (reveal until a land card).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const share = card("Smuggler's Share", "Enchantment", "{2}{W}", { oracleText: "At the beginning of each end step, draw a card for each opponent who drew two or more cards this turn, then create a Treasure token for each opponent who had two or more lands enter the battlefield under their control this turn." });
const ring = card("Replicating Ring", "Snow Artifact", "{3}", { oracleText: "{T}: Add one mana of any color.\nAt the beginning of your upkeep, put a night counter on this artifact. Then if it has eight or more night counters on it, remove all of them and create eight colorless snow artifact tokens named Replicated Ring with \"{T}: Add one mana of any color.\"" });
const nexus = card("The Skullspore Nexus", "Legendary Artifact", "{6}{G}{G}", { oracleText: "This spell costs {X} less to cast, where X is the greatest power among creatures you control.\nWhenever one or more nontoken creatures you control die, create a green Fungus Dinosaur creature token with base power and toughness each equal to the total power of those creatures.\n{2}, {T}: Double target creature's power until end of turn." });
const sting = card("Sting, the Glinting Dagger", "Legendary Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 and has haste.\nAt the beginning of each combat, untap equipped creature.\nEquipped creature has first strike as long as it's blocking or blocked by a Goblin or Orc.\nEquip {2}" });
const aberration = card("Consuming Aberration", "Creature — Horror", "{3}{U}{B}", { power: "*", toughness: "*", oracleText: "Consuming Aberration's power and toughness are each equal to the number of cards in your opponents' graveyards.\nWhenever you cast a spell, each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard." });

// Test cards.
const wrath = card("Test Wrath", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const lore = card("Test Lore", "Sorcery", "{1}{U}", { oracleText: "Draw two cards." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toZone = (s: GameState, pid: PlayerId, d: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
/** One step on: no attacks or blocks, discards to hand size from the left, otherwise pass. */
const step = (s: GameState) => {
  const p = s.pending;
  if (p?.kind === "declareAttackers") return act(s, { type: "declareAttackers", player: p.player, attacks: [] });
  if (p?.kind === "declareBlockers") return act(s, { type: "declareBlockers", player: p.player, blocks: [] });
  if (p?.kind === "discardToHandSize") return act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
  return act(s, { type: "passPriority", player: waitingOn(s)! });
};
const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;

describe("round 105: Smuggler's Share, Replicating Ring, The Skullspore Nexus, Sting, Consuming Aberration", () => {
  it("parse", () => [share, ring, nexus, sting, aberration].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Smuggler's Share: a card for an opponent who drew two, a Treasure for one who had two lands enter, at each end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, me, share);
    // The active player drew two cards and had two lands enter; the next one only one land.
    s0.players[ap]!.draws = { turn: s0.turn, n: 2 };
    s0.turnLog = { ...(s0.turnLog ?? {}), entered: [{ controller: ap, types: ["Land"], colors: [] }, { controller: ap, types: ["Land"], colors: [] }, { controller: opp, types: ["Land"], colors: [] }] };
    const hand = s0.players[me]!.hand.length;
    let s = s0;
    for (let i = 0; i < 100 && s.step !== "end"; i++) s = step(s);
    s = settle(s);
    expect(s.players[me]!.hand.length).toBe(hand + 1);
    expect(treasures(s, me)).toBe(1);
  });

  it("Replicating Ring: a night counter each upkeep; at eight, they're removed for eight snow Replicated Rings", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ring);
    s0.objects[r]!.counters.night = 6;
    let s = s0;
    const upkeep = () => {
      for (let i = 0; i < 400 && !(s.step === "upkeep" && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && s.turn > s0.turn); i++) s = step(s);
    };
    upkeep();
    expect(s.objects[r]!.counters.night).toBe(7);
    const turn = s.turn;
    for (let i = 0; i < 400 && s.turn === turn; i++) s = step(s);
    upkeep();
    expect(s.objects[r]!.counters.night ?? 0).toBe(0);
    const rings = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Replicated Ring");
    expect(rings).toHaveLength(8);
    expect(s.cards[s.objects[rings[0]!]!.cardId]!.supertypes).toContain("Snow");
  });

  it("The Skullspore Nexus: creatures that die together make one Fungus Dinosaur as big as their total power; tokens don't count", () => {
    const { s: s0, ap, ids } = setup([wrath]);
    putOnBattlefield(s0, ap, nexus);
    putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" }));
    s0.objects[big]!.counters["+1/+1"] = 1;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const dinos = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Dinosaur"));
    expect(dinos).toHaveLength(1);
    expect([power(s, s.objects[dinos[0]!]!), toughness(s, s.objects[dinos[0]!]!)]).toEqual([8, 8]);
  });

  it("Sting: first strike only while blocking or blocked by a Goblin or Orc", () => {
    const { s, ap, opp } = setup([]);
    const holder = putOnBattlefield(s, ap, bear());
    const st = putOnBattlefield(s, ap, sting);
    s.objects[st]!.attachedTo = holder;
    const gob = putOnBattlefield(s, opp, goblin);
    const other = putOnBattlefield(s, opp, elf);
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[holder]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[holder]!, "First strike")).toBe(false);
    s.objects[holder]!.blocking = [other];
    s.objects[other]!.blockedBy = [holder];
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[holder]!, "First strike")).toBe(false);
    s.objects[holder]!.blocking = [gob];
    s.objects[gob]!.blockedBy = [holder];
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[holder]!, "First strike")).toBe(true);
    s.objects[holder]!.blocking = undefined;
    s.objects[holder]!.blockedBy = [gob];
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[holder]!, "First strike")).toBe(true);
  });

  it("Consuming Aberration: each opponent reveals until a land card, all into the graveyard; it counts their graveyards", () => {
    const { s: s0, ap, opp, ids } = setup([lore]);
    const a = putOnBattlefield(s0, ap, aberration);
    for (const pid of s0.turnOrder) if (pid !== ap) for (const id of s0.players[pid]!.graveyard.splice(0)) delete s0.objects[id];
    // A 1/1 with one card there (a 0/0 dies, CR 704.5f).
    toZone(s0, opp, goblin, "graveyard");
    const land = toZone(s0, opp, card("Test Hill", "Land", "", { oracleText: "{T}: Add {G}." }), "library");
    toZone(s0, opp, elf, "library");
    toZone(s0, opp, goblin, "library");
    const yards = (s: GameState) => s.turnOrder.filter((pid) => pid !== ap).reduce((n, pid) => n + s.players[pid]!.graveyard.length, 0);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard.length).toBe(4);
    expect(power(s, s.objects[a]!)).toBe(yards(s));
    expect(yards(s)).toBeGreaterThanOrEqual(4);
  });
});

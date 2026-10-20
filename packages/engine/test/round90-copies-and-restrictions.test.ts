// Round 90, fourth batch: Rite of Replication (five copies when kicked, CR 702.33), Ghostly Flicker (two targets of
// different card types, rulings), Starting Town (enters untapped only on your first three turns), Drannith Magistrate
// (no casting from anywhere but the hand, commanders included, CR 101.2) and Jaheira, Friend of the Forest (every token,
// not only creature tokens, gets a mana ability, rulings).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { castProblem, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const rite = card("Rite of Replication", "Sorcery", "{2}{U}{U}", { oracleText: "Kicker {5} (You may pay an additional {5} as you cast this spell.)\nCreate a token that's a copy of target creature. If this spell was kicked, create five of those tokens instead." });
const flicker = card("Ghostly Flicker", "Instant", "{2}{U}", { oracleText: "Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control." });
const town = card("Starting Town", "Land — Town", "", { oracleText: "This land enters tapped unless it's your first, second, or third turn of the game.\n{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color." });
const magistrate = card("Drannith Magistrate", "Creature — Human Wizard", "{1}{W}", { power: "1", toughness: "3", oracleText: "Your opponents can't cast spells from anywhere other than their hands." });
const jaheira = card("Jaheira, Friend of the Forest", "Legendary Creature — Human Elf Druid", "{2}{G}", { power: "3", toughness: "3", oracleText: "Tokens you control have \"{T}: Add {G}.\"\nChoose a Background (You can have a Background as a second commander.)" });
const bearCard = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const relic = card("Relic", "Artifact", "{1}", { oracleText: "" });
const tower = card("Urza's Tower", "Land — Urza's Tower", "", { oracleText: "{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead." });
const mine = card("Urza's Mine", "Land — Urza's Mine", "", { oracleText: "{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C} instead." });
const plant = card("Urza's Power Plant", "Land — Urza's Power-Plant", "", { oracleText: "{T}: Add {C}. If you control an Urza's Mine and an Urza's Tower, add {C}{C} instead." });

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};

describe("round 90 copies and restrictions", () => {
  it("parse", () => {
    for (const c of [rite, flicker, town, magistrate, jaheira, tower, mine, plant]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Rite of Replication: one copy, five when kicked", () => {
    for (const kicked of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([rite]);
      const b = putOnBattlefield(s0, opp, bearCard);
      // Kicked it costs nine: enough lands for that.
      for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
      const before = s0.battlefield.length;
      const s = run(s0, planCast(s0, ap, ids[0]!, [target(b)], undefined, "auto", undefined, kicked ? { kicks: [0] } : {}));
      const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
      expect(copies).toHaveLength(kicked ? 5 : 1);
      expect(s.battlefield.length).toBe(before + (kicked ? 5 : 1));
    }
  });

  it("Ghostly Flicker: an artifact and a creature, back as new objects", () => {
    const { s: s0, ap, ids } = setup([flicker]);
    const r = putOnBattlefield(s0, ap, relic);
    const b = putOnBattlefield(s0, ap, bearCard);
    const zc = [s0.objects[r]!.zoneChanges ?? 0, s0.objects[b]!.zoneChanges ?? 0];
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(r), target(b)]));
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[r]!.zoneChanges ?? 0).toBeGreaterThan(zc[0]!);
    expect(s.objects[b]!.zoneChanges ?? 0).toBeGreaterThan(zc[1]!);
  });

  it("Starting Town enters untapped on your first three turns, tapped after", () => {
    for (const [taken, tapped] of [[3, false], [4, true]] as const) {
      const { s: s0, ap } = setup([town]);
      s0.players[ap]!.turnsTaken = taken;
      s0.players[ap]!.landsPlayedThisTurn = 0;
      const t = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Starting Town")!;
      const s = settle(act(s0, { type: "playLand", player: ap, objectId: t }));
      expect(s.objects[t]!.tapped ?? false).toBe(tapped);
    }
  });

  it("the first turn counts as one", () => {
    const { s, ap } = setup([]);
    expect(s.players[ap]!.turnsTaken).toBe(1);
  });

  it("Drannith Magistrate: an opponent can't cast their commander, but can cast from hand", () => {
    const { s: s0, ap, opp } = setup([bearCard]);
    putOnBattlefield(s0, opp, magistrate);
    const commander = s0.players[ap]!.command[0]!;
    expect(castProblem(s0, ap, commander)).toMatch(/Drannith Magistrate/);
    const inHand = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Bear")!;
    expect(planCast(s0, ap, inHand)).not.toBeNull();
  });

  it("Drannith Magistrate doesn't stop its controller", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, magistrate);
    expect(planCast(s0, ap, s0.players[ap]!.command[0]!)).not.toBeNull();
  });

  it("Jaheira: a noncreature token taps for {G} right away", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, jaheira);
    const tok = putOnBattlefield(s, ap, card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." }));
    s.objects[tok]!.isToken = true;
    const other = putOnBattlefield(s, ap, relic);
    invalidateCharacteristics(s);
    expect(manaAbilitiesOn(s, s.objects[tok]!).some((m) => m.text.includes("Add {G}"))).toBe(true);
    expect(manaAbilitiesOn(s, s.objects[other]!)).toHaveLength(0);
  });

  it("the Tron lands: {C} alone, seven with all three", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.manaPool.C = 0;
    const tw = putOnBattlefield(s0, ap, tower);
    let s = act(s0, { type: "activateMana", player: ap, objectId: tw, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);
    // An Ulamog's Power-Plant isn't an Urza's Power-Plant.
    const m = putOnBattlefield(s, ap, mine);
    const ulamog = putOnBattlefield(s, ap, card("Processing Plant", "Land — Ulamog's Power-Plant", "", { oracleText: "" }));
    s.objects[tw]!.tapped = false;
    s.players[ap]!.manaPool.C = 0;
    s = act(s, { type: "activateMana", player: ap, objectId: tw, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);
    s.battlefield.splice(s.battlefield.indexOf(ulamog), 1);
    s.objects[ulamog]!.zone = "graveyard";
    const p = putOnBattlefield(s, ap, plant);
    s.objects[tw]!.tapped = false;
    s.players[ap]!.manaPool.C = 0;
    for (const id of [tw, m, p]) s = act(s, { type: "activateMana", player: ap, objectId: id, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(7);
  });
});

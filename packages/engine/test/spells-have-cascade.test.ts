// Cascade a permanent gives to spells as they're cast (CR 702.85a): "Sliver spells you cast have cascade", "Instant and
// sorcery spells you cast from your hand have cascade", "The first spell you cast each turn has cascade" (counting the
// spells cast before it was there, rulings on Maelstrom Nexus), "... that mana from a Treasure was spent to cast". Each
// instance triggers separately (CR 702.85c). A spell's mana value on the stack counts its X (CR 202.3e).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const nexus = card("Maelstrom Nexus", "Enchantment", "{W}{U}{B}{R}{G}", { oracleText: "The first spell you cast each turn has cascade. (When you cast your first spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const firstSliver = card("The First Sliver", "Legendary Creature — Sliver", "{W}{U}{B}{R}{G}", { power: "7", toughness: "7", oracleText: "Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nSliver spells you cast have cascade." });
const quandrix = card("Quandrix, the Proof", "Legendary Creature — Elder Dragon", "{4}{G}{U}", { power: "6", toughness: "6", keywords: ["Flying", "Trample", "Cascade"], oracleText: "Flying, trample\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nInstant and sorcery spells you cast from your hand have cascade." });
const rain = card("Rain of Riches", "Enchantment", "{3}{R}{R}", { oracleText: "When this enchantment enters, create two Treasure tokens.\nThe first spell you cast each turn that mana from a Treasure was spent to cast has cascade. (When you cast the spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const imoti = card("Imoti, Celebrant of Bounty", "Legendary Creature — Naga Druid", "{3}{G}{U}", { power: "6", toughness: "4", oracleText: "Spells you cast with mana value 6 or greater have cascade. (When you cast your first spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });

const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const sliver = card("Test Sliver", "Creature — Sliver", "{2}{G}", { power: "2", toughness: "2" });
const sorcery = card("Test Sorcery", "Sorcery", "{2}{U}", { oracleText: "Draw a card." });
const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "~ deals X damage to any target." });

const cascades = (s: GameState) => s.log.filter((l) => / cascades: /.test(l.text)).length;
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}
/** Resolve everything, declining cascade's free casts. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending?.kind === "castFree" ? { type: "chooseMay", player: pid, yes: false } : { type: "passPriority", player: pid });
  }
  return s;
}

describe("spells that have cascade", () => {
  it("parse", () => supported(nexus, firstSliver, quandrix, rain, imoti));

  it("Maelstrom Nexus: only the first spell each turn, counting one cast before it entered", () => {
    const { s: s0, ap, ids } = setup([giant, giant]);
    putOnBattlefield(s0, ap, nexus);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.triggerQueue.length + s.stack.length).toBe(2); // the giant and its cascade
    s = settle(s);
    expect(cascades(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
    // A spell cast this turn before it was there: none of its spells cascade this turn.
    const { s: t0, ap: p, ids: w } = setup([giant, giant]);
    let t = settle(run(t0, planCast(t0, p, w[0]!)));
    putOnBattlefield(t, p, nexus);
    t = settle(run(t, planCast(t, p, w[1]!)));
    expect(cascades(t)).toBe(0);
  });

  it("The First Sliver: Sliver spells cascade, others don't", () => {
    const { s: s0, ap, ids } = setup([sliver, giant]);
    putOnBattlefield(s0, ap, firstSliver);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
  });

  it("Quandrix: an instant or sorcery from your hand", () => {
    const { s: s0, ap, ids } = setup([sorcery, giant]);
    putOnBattlefield(s0, ap, quandrix);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
  });

  it("Rain of Riches: the first spell cast with a Treasure's mana, even after another spell", () => {
    const { s: s0, ap, ids } = setup([giant, giant, giant]);
    putOnBattlefield(s0, ap, rain);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(cascades(s)).toBe(0);
    const t1 = putOnBattlefield(s, ap, treasure);
    s = act(s, { type: "activateMana", player: ap, objectId: t1, mana: "R" });
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
    const t2 = putOnBattlefield(s, ap, treasure);
    s = act(s, { type: "activateMana", player: ap, objectId: t2, mana: "R" });
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(cascades(s)).toBe(1);
  });

  it("Imoti: mana value 6 or greater, its X included (CR 202.3e), and cascade looks for less than that", () => {
    const { s: s0, ap, ids } = setup([blaze]);
    putOnBattlefield(s0, ap, imoti);
    const five = onTop(s0, ap, card("Five Drop", "Sorcery", "{4}{R}", { oracleText: "Draw a card." }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: s0.turnOrder[1]! }], undefined, undefined, 5));
    for (let i = 0; i < 10 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: five });
  });
});

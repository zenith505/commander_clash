// Round 93: escape, flashback and retrace a permanent gives the cards in your graveyard (CR 702.138a, 702.34a,
// 702.81a): Underworld Breach, Lier, Return the Past, Deeproot Historian. Each one's cost is the card's own mana
// cost; a card without one can't be cast this way (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, characteristics, graveyardWays, isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const breach = card("Underworld Breach", "Enchantment", "{1}{R}", { oracleText: "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment." });
const lier = card("Lier, Disciple of the Drowned", "Legendary Creature — Human Wizard", "{3}{U}{U}", { power: "3", toughness: "4", oracleText: "Spells can't be countered.\nEach instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost." });
const returnPast = card("Return the Past", "Enchantment", "{4}{R}{R}", { oracleText: "During your turn, each instant and sorcery card in your graveyard has flashback. Its flashback cost is equal to its mana cost." });
const historian = card("Deeproot Historian", "Creature — Merfolk Druid", "{3}{G}", { power: "3", toughness: "3", oracleText: "Merfolk and Druid cards in your graveyard have retrace. (You may cast cards with retrace from your graveyard by discarding a land card in addition to paying their other costs.)" });
const ritual = card("Dark Ritual", "Instant", "{B}", { oracleText: "Add {B}{B}{B}." });
const opt = card("Night's Whisper", "Sorcery", "{1}{B}", { oracleText: "You draw two cards and you lose 2 life." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const memnite = card("Memnite", "Artifact Creature — Construct", "{0}", { power: "1", toughness: "1" });
const crop = card("Ancestral Vision", "Sorcery", "", { oracleText: "Suspend 4—{U}\nTarget player draws three cards." });
const forestCard = card("Forest", "Basic Land — Forest");

const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};

describe("graveyard grants", () => {
  it("parse", () => {
    for (const d of [breach, lier, returnPast, historian]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Underworld Breach: a nonland card escapes for its mana cost and three other cards", () => {
    const { s: s0, ap, ids } = setup([opt, bear(), bear(), bear(), forestCard, crop]);
    putOnBattlefield(s0, ap, breach);
    for (const id of ids) toGraveyard(s0, ap, id);
    const kinds = (id: string) => graveyardWays(s0, s0.objects[id]!).map((g) => g.kind);
    expect(kinds(ids[0]!)).toEqual(["grantedEscape"]);
    expect(kinds(ids[4]!)).toEqual([]); // a land card
    expect(kinds(ids[5]!)).toEqual([]); // no mana cost: an unpayable escape cost (rulings)
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: [ids[1]!, ids[2]!] })).toMatch(/choose 3/);
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: [ids[1]!, ids[2]!, ids[3]!] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect([ids[1], ids[2], ids[3]].map((id) => zone(s, id!))).toEqual(["exile", "exile", "exile"]);
    // An escaped sorcery goes back to the graveyard (rulings): it can escape again.
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.log.some((l) => /casts Night's Whisper from their graveyard \(escape\)/.test(l.text))).toBe(true);
  });

  it("an escaped permanent escaped (CR 702.138b); an opponent's graveyard gets nothing", () => {
    const { s: s0, ap, ids, opp } = setup([bear(), opt, opt, opt]);
    putOnBattlefield(s0, ap, breach);
    for (const id of ids) toGraveyard(s0, ap, id);
    const theirs = s0.players[opp]!.hand[0]!;
    toGraveyard(s0, opp, theirs);
    expect(graveyardWays(s0, s0.objects[theirs]!)).toEqual([]);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "grantedEscape", exileCards: ids.slice(1) }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.escaped).toBe(true);
  });

  it("Lier: flashback for the card's mana cost, then exiled", () => {
    const { s: s0, ap, ids } = setup([ritual, memnite]);
    putOnBattlefield(s0, ap, lier);
    for (const id of ids) toGraveyard(s0, ap, id);
    expect(graveyardWays(s0, s0.objects[ids[1]!]!)).toEqual([]); // not an instant or sorcery
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "grantedFlashback" }));
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Return the Past: only during your turn", () => {
    const { s: s0, ap, ids, opp } = setup([opt]);
    putOnBattlefield(s0, ap, returnPast);
    toGraveyard(s0, ap, ids[0]!);
    expect(graveyardWays(s0, s0.objects[ids[0]!]!).map((g) => g.kind)).toEqual(["grantedFlashback"]);
    const s = passUntil(s0, "upkeep", opp);
    expect(graveyardWays(s, s.objects[ids[0]!]!)).toEqual([]);
  });

  it("Deeproot Historian: a Druid card is cast with retrace, discarding a land card, and stays a card that can be cast again", () => {
    const { s: s0, ap, ids } = setup([elf, forestCard]);
    putOnBattlefield(s0, ap, historian);
    toGraveyard(s0, ap, ids[0]!);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "grantedRetrace", discard: [ids[1]!] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Llanowar Elves");
  });
});

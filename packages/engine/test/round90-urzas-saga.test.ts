// Urza's Saga (round 90): a land that's a Saga (CR 714). Chapter I gives it "{T}: Add {C}", chapter II '{2}, {T}: Create
// a 0/0 colorless Construct artifact creature token with "This token gets +1/+1 for each artifact you control."' (a
// quoted ability inside the granted one), chapter III finds an artifact card with mana cost {0} or {1}: the actual mana
// cost, not the mana value, so not {U} or {X} (rulings). It keeps the granted abilities while it's on the battlefield and
// is sacrificed after chapter III (rulings, CR 714.4).

import { describe, expect, it } from "vitest";
import { act, card, forest, fourPlayerGame, passUntil, pt, putOnBattlefield } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const urzasSaga = card("Urza's Saga", "Enchantment Land — Urza's Saga", "", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga gains \"{T}: Add {C}.\"\nII — This Saga gains \"{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for each artifact you control.'\"\nIII — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const blueTrinket = card("Blue Trinket", "Artifact", "{U}", { oracleText: "" });
const xTrinket = card("X Trinket", "Artifact", "{X}", { oracleText: "" });
const bloom = card("Lotus Bloom", "Artifact", "", { oracleText: "" });

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function nextMain(s: GameState, pid: PlayerId): GameState {
  s = passUntil(s, "end", pid);
  s = passUntil(s, "main1", pid);
  return settle(s);
}
function toZone(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library"): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.push(id); // at the bottom: not drawn

  else s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

describe("Urza's Saga", () => {
  it("parses", () => expect(isFullySupported(urzasSaga)).toBe(true));

  it("is played as a land, gains its abilities chapter by chapter, finds a {0} or {1} artifact and is sacrificed", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const saga = toZone(s, ap, urzasSaga, "hand");
    const ring = toZone(s, ap, solRing, "library");
    const blue = toZone(s, ap, blueTrinket, "library");
    const x = toZone(s, ap, xTrinket, "library");
    const lotus = toZone(s, ap, bloom, "library");
    const thopter = toZone(s, ap, ornithopter, "library");
    // Lands to pay for chapter II's ability.
    putOnBattlefield(s, ap, forest);
    putOnBattlefield(s, ap, forest);
    s = settle(act(s, { type: "playLand", player: ap, objectId: saga }));
    expect(s.objects[saga]!.counters.lore).toBe(1);
    // Chapter I: "{T}: Add {C}".
    expect(manaAbilitiesOn(s, s.objects[saga]!).map((a) => a.text)).toEqual(["{T}: Add {C}."]);
    s = act(s, { type: "activateMana", player: ap, objectId: saga, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);

    s = nextMain(s, ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
    // It keeps chapter I's ability and has chapter II's.
    expect(manaAbilitiesOn(s, s.objects[saga]!)).toHaveLength(1);
    const plan = planActivate(s, ap, saga, 0);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    const construct = named(s, ap, "Construct Token")[0]!;
    expect(construct).toBeDefined();
    // The token is an artifact itself: 1/1 with no other artifacts.
    expect(pt(s, construct)).toBe("1/1");

    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    for (let i = 0; i < 40 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const found = (s.pending as { cards: string[] }).cards;
    // Mana cost {0} or {1} only (rulings): not {U}, {X} or no mana cost.
    expect(found).toContain(ring);
    expect(found).toContain(thopter);
    for (const id of [blue, x, lotus]) expect(found).not.toContain(id);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ring] }));
    expect(s.objects[ring]!.zone).toBe("battlefield");
    expect(s.objects[saga]!.zone).toBe("graveyard");
    // Two artifacts now: the Construct and Sol Ring.
    expect(pt(s, construct)).toBe("2/2");
  });

  it("a bot finds an artifact with chapter III", () => {
    let s = passUntil(fourPlayerGame(), "main1");
    const ap = s.activePlayer;
    const saga = putOnBattlefield(s, ap, urzasSaga);
    s.objects[saga]!.counters.lore = 2;
    const ring = toZone(s, ap, solRing, "library");
    s = nextMain(s, ap);
    for (let i = 0; i < 20 && (s.pending || s.stack.length); i++) {
      const [a] = botActions(s, waitingOn(s)!);
      s = act(s, a!);
    }
    expect(s.objects[ring]!.zone).toBe("battlefield");
  });
});

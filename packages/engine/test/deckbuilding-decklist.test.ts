// Reading pasted deck lists (MTG Arena, Moxfield, Archidekt exports) and writing them back out, and deck statistics.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardNameIndex, deckIdentity, deckStats, fitsIdentity, formatDeckList, hypergeometric, openingHand, parseDeckList, resolveDeckList, savedDeckProblems, type CardDef } from "../src";

const CARDS: CardDef[] = JSON.parse(readFileSync(new URL("../../../apps/web/e2e/cards.json", import.meta.url), "utf8"));
const lookup = cardNameIndex(CARDS);
const get = (n: string) => lookup(n)!;

describe("deck list import", () => {
  it("reads counts, set codes, collector numbers, foil marks and sections", () => {
    const list = `Commander
1 Krosan Cloudscraper (TSP) 205

Deck
1x Sol Ring (CMR) 263 *F*
4 Forest
Lightning Bolt

Sideboard
1 Counterspell`;
    const e = parseDeckList(list);
    expect(e.map((x) => [x.count, x.name, x.section])).toEqual([
      [1, "Krosan Cloudscraper", "commander"],
      [1, "Sol Ring", "main"],
      [4, "Forest", "main"],
      [1, "Lightning Bolt", "main"],
      [1, "Counterspell", "side"],
    ]);
    const r = resolveDeckList(e, lookup);
    expect(r.commanders.map((c) => c.name)).toEqual(["Krosan Cloudscraper"]);
    expect(r.cards.map((c) => c.name)).toEqual(["Sol Ring", "Forest", "Forest", "Forest", "Forest", "Lightning Bolt"]);
    expect(r.skipped).toBe(1);
    expect(r.unknown).toEqual([]);
  });

  it("finds Archidekt's [Commander] tag, // comments and MTGA's About section", () => {
    const list = `About
Name Big Green

// Ramp
1x Llanowar Elves (m19) 314 [Ramp]
1x Krosan Cloudscraper (tsp) 205 [Commander{top}]
SB: 1 Counterspell`;
    const r = resolveDeckList(parseDeckList(list), lookup);
    expect(r.commanders.map((c) => c.name)).toEqual(["Krosan Cloudscraper"]);
    expect(r.cards.map((c) => c.name)).toEqual(["Llanowar Elves"]);
    expect(r.skipped).toBe(1);
  });

  it("matches a card with several faces by its full name, its front face's or with one slash", () => {
    const r = resolveDeckList(parseDeckList("1 Kazandu Mammoth\n1 Fire/Ice\n1 Valakut Awakening // Valakut Stoneforge\n1 kazandu valley"), lookup);
    expect(r.cards.map((c) => c.name)).toEqual(["Kazandu Mammoth // Kazandu Valley", "Fire // Ice", "Valakut Awakening // Valakut Stoneforge", "Kazandu Mammoth // Kazandu Valley"]);
  });

  it("reports names it doesn't know, with their line", () => {
    const r = resolveDeckList(parseDeckList("1 Sol Ring\n1 Not A Real Card"), lookup);
    expect(r.unknown).toEqual([{ name: "Not A Real Card", line: 2 }]);
  });

  it("writes a list the importer reads back the same", () => {
    const text = formatDeckList(["Krosan Cloudscraper"], ["Sol Ring", "Forest", "Forest", "Lightning Bolt"]);
    expect(text).toBe("Commander\n1 Krosan Cloudscraper\n\nDeck\n2 Forest\n1 Lightning Bolt\n1 Sol Ring");
    const r = resolveDeckList(parseDeckList(text), lookup);
    expect(r.commanders.map((c) => c.name)).toEqual(["Krosan Cloudscraper"]);
    expect(r.cards.map((c) => c.name).sort()).toEqual(["Forest", "Forest", "Lightning Bolt", "Sol Ring"]);
  });
});

describe("saved decks", () => {
  const deck = (cards: string[], commander = "Altanak, the Thrice-Called") => ({ id: "d", name: "Test", commander, cards, updatedAt: "" });

  it("a 100-card deck within the commander's colors can be played", () => {
    const cards = ["Sol Ring", "Llanowar Elves", ...Array.from({ length: 97 }, () => "Forest")];
    expect(savedDeckProblems(deck(cards), lookup)).toEqual([]);
  });

  it("lists what's wrong: size, color identity, singleton, cards the game doesn't have", () => {
    const p = savedDeckProblems(deck(["Lightning Bolt", "Sol Ring", "Sol Ring", ...Array.from({ length: 90 }, () => "Forest")]), lookup).map((x) => `${x.card ?? ""} ${x.problem}`);
    expect(p.some((x) => /needs 100/.test(x))).toBe(true);
    expect(p.some((x) => /Lightning Bolt outside the commander's color identity/.test(x))).toBe(true);
    expect(p.some((x) => /Sol Ring appears 2 times/.test(x))).toBe(true);
    expect(savedDeckProblems(deck(["Nope"]), lookup)[0]).toEqual({ card: "Nope", problem: "isn't a card this game supports" });
    expect(savedDeckProblems({ ...deck([]), commander: undefined }, lookup)[0]!.problem).toBe("no commander chosen");
  });

  it("the commander's color identity filters cards", () => {
    const id = deckIdentity([get("Krosan Cloudscraper")]);
    expect([...id]).toEqual(["G"]);
    expect(fitsIdentity(get("Llanowar Elves"), id)).toBe(true);
    expect(fitsIdentity(get("Sol Ring"), id)).toBe(true);
    expect(fitsIdentity(get("Lightning Bolt"), id)).toBe(false);
    expect(deckIdentity([]).size).toBe(5);
  });
});

describe("deck statistics", () => {
  it("odds of lands in the opening hand (hypergeometric)", () => {
    // 37 lands in a 99-card library: 7 * 37 / 99 lands in the opening hand on average.
    const o = openingHand(99, 37);
    expect(o.expectedLands).toBeCloseTo((7 * 37) / 99, 10);
    expect(o.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // Exactly 0 lands: C(62,7) / C(99,7).
    let p0 = 1;
    for (let i = 0; i < 7; i++) p0 *= (62 - i) / (99 - i);
    expect(o.distribution[0]).toBeCloseTo(p0, 12);
    expect(hypergeometric(99, 37, 7, 3)).toBeCloseTo(o.distribution[3]!, 12);
    expect(o.keepable).toBeGreaterThan(0.7);
    // Land drops get harder each turn.
    for (let t = 1; t < 6; t++) expect(o.landDrops[t]!).toBeLessThan(o.landDrops[t - 1]!);
    // Turn 1, drawing on it (CR 103.8c): 8 cards seen; at least one land.
    expect(o.landDrops[0]).toBeCloseTo(1 - (62 / 99) * (61 / 98) * (60 / 97) * (59 / 96) * (58 / 95) * (57 / 94) * (56 / 93) * (55 / 92), 12);
  });

  it("curve, colors, types and game changers", () => {
    const cards = ["Sol Ring", "Llanowar Elves", "Lightning Bolt", "Counterspell", "Force of Will", "Kazandu Mammoth // Kazandu Valley", "Forest", "Forest", "Command Tower"].map(get);
    const s = deckStats([get("Krosan Cloudscraper")], cards);
    expect(s.total).toBe(10);
    expect(s.librarySize).toBe(9);
    expect(s.lands).toBe(3);
    expect(s.landFaces).toBe(1);
    expect(s.curve[1]).toEqual({ mv: 1, creatures: 1, other: 2 }); // Llanowar Elves; Sol Ring, Lightning Bolt
    expect(s.curve[7]!.creatures).toBe(1); // Krosan Cloudscraper, mana value 9
    expect(s.pips.U).toBe(4); // Counterspell {U}{U}, Force of Will {U}{U}
    expect(s.pips.G).toBeGreaterThanOrEqual(3);
    expect(s.sources.G.lands).toBe(3); // the Forests and Command Tower
    expect(s.sources.G.other).toBe(2); // Llanowar Elves, and Kazandu Mammoth's land face
    expect(s.gameChangers).toContain("Force of Will");
    expect(s.types.find((t) => t.type === "Land")!.count).toBe(3);
    expect(s.types.find((t) => t.type === "Creature")!.count).toBe(3);
  });
});

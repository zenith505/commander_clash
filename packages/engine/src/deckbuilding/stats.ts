// Deck statistics for the deck builder: mana curve, color balance, card types and the odds of drawing lands.

import { COLORS, type CardDef, type Color } from "../types";

export interface DeckStats {
  /** Cards in the deck, commanders included. */
  total: number;
  /** The library a game starts with: the deck without its commanders. */
  librarySize: number;
  lands: number;
  /** Modal double-faced cards with a land face that aren't lands on their front (Moxfield's "+N MDFC"). */
  landFaces: number;
  /** Nonland cards: count by mana value, 7 standing for 7 or more. */
  curve: { mv: number; creatures: number; other: number }[];
  /** The average mana value of the nonland cards, commanders included. */
  averageMv: number;
  totalMv: number;
  /** Colored mana symbols in the cards' mana costs (a hybrid symbol counts for each of its colors). */
  pips: Record<Color, number>;
  /** Cards that can make each color of mana: lands and other sources. */
  sources: Record<Color | "C", { lands: number; other: number }>;
  types: { type: string; count: number }[];
  rarity: Record<string, number>;
  /** Cards on the Game Changers list (used by the Commander brackets). */
  gameChangers: string[];
  opening: OpeningHand;
}

export interface OpeningHand {
  /** Expected lands in a 7-card opening hand. */
  expectedLands: number;
  /** The same, counting modal double-faced cards with a land face as lands. */
  expectedLandsWithFaces: number;
  /** The chance of exactly k lands in the opening seven, k = 0..7. */
  distribution: number[];
  /** The chance of 2 to 4 lands, a hand most players keep. */
  keepable: number;
  /**
   * The chance of having drawn at least t lands by your turn t (t = 1..6), seeing 7 + t cards: nobody skips their first
   * draw in a multiplayer game (CR 103.8c).
   */
  landDrops: number[];
}

const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];

const front = (d: CardDef) => d.faces?.[0] ?? d;

/** Is the card a land as it sits in your library (its front face)? */
export const isLandCard = (d: CardDef) => front(d).types.includes("Land");
const hasLandFace = (d: CardDef) => !isLandCard(d) && d.layout === "modal_dfc" && !!d.faces?.some((f) => f.types.includes("Land"));

export function deckStats(commanders: CardDef[], cards: CardDef[]): DeckStats {
  const all = [...commanders, ...cards];
  const lands = cards.filter(isLandCard).length;
  const landFaces = cards.filter(hasLandFace).length;
  const nonland = all.filter((d) => !isLandCard(d));
  const curve = Array.from({ length: 8 }, (_, mv) => ({ mv, creatures: 0, other: 0 }));
  for (const d of nonland) {
    const slot = curve[Math.min(7, Math.floor(d.cmc))]!;
    if (front(d).types.includes("Creature")) slot.creatures++;
    else slot.other++;
  }
  const totalMv = nonland.reduce((n, d) => n + d.cmc, 0);
  const pips = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const d of all)
    for (const f of d.faces?.length ? d.faces : [d])
      for (const sym of f.manaCost.match(/\{[^}]+\}/g) ?? []) for (const c of COLORS) if (sym.includes(c)) pips[c]++;
  const sources = Object.fromEntries([...COLORS, "C"].map((c) => [c, { lands: 0, other: 0 }])) as DeckStats["sources"];
  for (const d of all) for (const m of new Set(d.producedMana ?? [])) sources[m][isLandCard(d) ? "lands" : "other"]++;
  const typeCounts = new Map<string, number>();
  for (const d of all) {
    const ts = front(d).types;
    const t = TYPE_ORDER.find((x) => ts.includes(x)) ?? ts[0] ?? "Other";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const types = [...typeCounts].map(([type, count]) => ({ type, count })).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  const rarity: Record<string, number> = {};
  for (const d of all) {
    const r = (d as CardDef & { rarity?: string }).rarity;
    if (r) rarity[r] = (rarity[r] ?? 0) + 1;
  }
  const gameChangers = [...new Set(all.filter((d) => (d as CardDef & { gameChanger?: boolean }).gameChanger).map((d) => d.name))];
  return {
    total: all.length,
    librarySize: cards.length,
    lands,
    landFaces,
    curve,
    averageMv: nonland.length ? totalMv / nonland.length : 0,
    totalMv,
    pips,
    sources,
    types,
    rarity,
    gameChangers,
    opening: openingHand(cards.length, lands, landFaces),
  };
}

/** Binomial coefficient, as a float (exact enough for decks of 100). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - Math.min(k, n - k) + i)) / i;
  return r;
}

/** Hypergeometric: the chance of exactly k successes drawing n from N with K successes. */
export function hypergeometric(N: number, K: number, n: number, k: number): number {
  const total = choose(N, n);
  return total ? (choose(K, k) * choose(N - K, n - k)) / total : 0;
}

/** The chance of at least k successes drawing n from N with K successes. */
export function atLeast(N: number, K: number, n: number, k: number): number {
  let p = 0;
  for (let i = k; i <= Math.min(n, K); i++) p += hypergeometric(N, K, n, i);
  return Math.min(1, p);
}

export function openingHand(library: number, lands: number, landFaces = 0): OpeningHand {
  const hand = Math.min(7, library);
  const distribution = Array.from({ length: 8 }, (_, k) => hypergeometric(library, lands, hand, k));
  return {
    expectedLands: library ? (hand * lands) / library : 0,
    expectedLandsWithFaces: library ? (hand * (lands + landFaces)) / library : 0,
    distribution,
    keepable: distribution.slice(2, 5).reduce((a, b) => a + b, 0),
    landDrops: Array.from({ length: 6 }, (_, i) => atLeast(library, lands, Math.min(library, 7 + i + 1), i + 1)),
  };
}

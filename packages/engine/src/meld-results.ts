// The combined back faces of the meld pairs (CR 712.4, 712.5). They're cards of their own in the card data
// (CardDef.meld.result === name) that can't be in a deck, so a game's card pool only has them through this registry:
// whoever loads the card data registers them (registerMeldResults), and a meld card's meld ability compiles only when
// its combined back face is known (oracle/compile.ts normalizeSelf).

import type { CardDef, GameState } from "./types";

const results = new Map<string, CardDef>();

/**
 * Garth One-Eye (round 377): "Choose a card name that hasn't been chosen from among A, B, ... Create a copy of the card with
 * the chosen name.": the copy is made from the Oracle card with that name, outside the game (CR 707.13), so a game's card
 * pool has those cards too while one of its cards names them; whoever loads the card data registers them with the meld
 * results (registerMeldResults).
 */
const NAMED_COPY = /^\{T\}: Choose a card name that hasn't been chosen from among (.+)\. Create a copy of the card with the chosen name\. You may cast the copy\.(?: \(You still pay its costs\.\))?$/m;
const named = new Map<string, CardDef>();

/** The names a card's "create a copy of the card with the chosen name" line lists (Garth One-Eye), or none. */
export function namedCopyNames(d: CardDef): string[] {
  const m = NAMED_COPY.exec(d.oracleText ?? "");
  return m ? m[1]!.split(/, (?:and )?| and /).map((n) => n.trim()).filter(Boolean) : [];
}

/** Make the combined back faces among `cards` known, so their meld cards can meld into them; and the cards Garth One-Eye names. */
export function registerMeldResults(cards: Iterable<CardDef>): void {
  const list = [...cards];
  const wanted = new Set(list.flatMap(namedCopyNames));
  for (const d of list) {
    if (isMeldResult(d)) results.set(d.name, d);
    if (wanted.has(d.name) && !d.faces?.length) named.set(d.name, d);
  }
}

/** The card a copy is made from by name (CR 707.13): in this game's cards, or else the registered ones. */
export function namedCardDef(s: GameState | undefined, name: string): CardDef | undefined {
  const inGame = s ? Object.values(s.cards).find((d) => d.name === name && !d.faceOf && !isMeldResult(d)) : undefined;
  return inGame ?? named.get(name);
}

/** Is this a melded permanent's combined back face (not a card that can be in a deck, CR 712.4b)? */
export const isMeldResult = (d: CardDef | undefined): boolean => !!d?.meld && d.meld.result === d.name;

/** The combined back face called `name`: in this game's cards, or else the registered ones. */
export function meldResultDef(s: GameState | undefined, name: string): CardDef | undefined {
  const inGame = s ? Object.values(s.cards).find((d) => isMeldResult(d) && d.name === name) : undefined;
  return inGame ?? results.get(name);
}

/**
 * The combined back faces the meld cards in `cards` meld into, and the cards Garth One-Eye names (CR 707.13), those
 * registered: for a game's card pool, beside its decks.
 */
export function meldResultsFor(cards: Iterable<CardDef>): CardDef[] {
  const out = new Map<string, CardDef>();
  for (const d of cards) {
    for (const n of namedCopyNames(d)) {
      const c = named.get(n);
      if (c) out.set(c.name, c);
    }
    if (d.meld && !isMeldResult(d)) {
      const r = results.get(d.meld.result);
      if (r) out.set(r.name, r);
    }
  }
  return [...out.values()];
}

/** The name of the other card of this meld card's pair (CR 712.5), from its copiable values (a copy has the line too). */
export function meldPartnerName(d: CardDef): string | undefined {
  if (!d.meld || isMeldResult(d)) return undefined;
  return d.meld.parts.find((p) => p !== d.name);
}

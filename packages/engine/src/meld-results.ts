// The combined back faces of the meld pairs (CR 712.4, 712.5). They're cards of their own in the card data
// (CardDef.meld.result === name) that can't be in a deck, so a game's card pool only has them through this registry:
// whoever loads the card data registers them (registerMeldResults), and a meld card's meld ability compiles only when
// its combined back face is known (oracle/compile.ts normalizeSelf).

import type { CardDef, GameState } from "./types";

const results = new Map<string, CardDef>();

/** Make the combined back faces among `cards` known, so their meld cards can meld into them. */
export function registerMeldResults(cards: Iterable<CardDef>): void {
  for (const d of cards) if (isMeldResult(d)) results.set(d.name, d);
}

/** Is this a melded permanent's combined back face (not a card that can be in a deck, CR 712.4b)? */
export const isMeldResult = (d: CardDef | undefined): boolean => !!d?.meld && d.meld.result === d.name;

/** The combined back face called `name`: in this game's cards, or else the registered ones. */
export function meldResultDef(s: GameState | undefined, name: string): CardDef | undefined {
  const inGame = s ? Object.values(s.cards).find((d) => isMeldResult(d) && d.name === name) : undefined;
  return inGame ?? results.get(name);
}

/** The combined back faces the meld cards in `cards` meld into, those registered: for a game's card pool. */
export function meldResultsFor(cards: Iterable<CardDef>): CardDef[] {
  const out = new Map<string, CardDef>();
  for (const d of cards)
    if (d.meld && !isMeldResult(d)) {
      const r = results.get(d.meld.result);
      if (r) out.set(r.name, r);
    }
  return [...out.values()];
}

/** The name of the other card of this meld card's pair (CR 712.5), from its copiable values (a copy has the line too). */
export function meldPartnerName(d: CardDef): string | undefined {
  if (!d.meld || isMeldResult(d)) return undefined;
  return d.meld.parts.find((p) => p !== d.name);
}

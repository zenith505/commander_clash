// Playing a saved deck: the game takes a bundle of decks and the cards they use (useGame.ts newGame).

import { meldResultsFor, type SavedDeck } from "@cc/engine";
import type { DeckBundle } from "../useGame";
import type { CardPool } from "./pool";

/**
 * A bundle with the saved deck first (your seat) and three of the starter decks for the bots, in a random order
 * (`random` is Math.random in the app; nothing here is part of the game's seeded state).
 */
export function bundleForSaved(starters: DeckBundle, deck: SavedDeck, pool: CardPool, random: () => number = Math.random): DeckBundle {
  const names = [deck.commander!, ...(deck.secondCommander ? [deck.secondCommander] : []), ...deck.cards];
  const defs = [...new Set(names)].map((n) => pool.lookup(n)!).filter(Boolean);
  const bots = starters.decks
    .map((d) => ({ d, k: random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => x.d);
  const mine = {
    name: deck.name,
    commander: pool.lookup(deck.commander!)!.name,
    ...(deck.secondCommander ? { secondCommander: pool.lookup(deck.secondCommander)!.name } : {}),
    ...(deck.commanderColor ? { commanderColor: deck.commanderColor } : {}),
    ...(deck.secondCommanderColor ? { secondCommanderColor: deck.secondCommanderColor } : {}),
    cards: deck.cards.map((n) => pool.lookup(n)!.name),
  };
  const cards = new Map(starters.cards.map((c) => [c.name, c]));
  for (const d of [...defs, ...meldResultsFor(defs)]) cards.set(d.name, d);
  return { decks: [mine, ...bots], cards: [...cards.values()] };
}

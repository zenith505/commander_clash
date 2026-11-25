// A deck a player built or imported, as it's saved: card names, so it survives new card data.

import type { CardDef, Color } from "../types";
import { canBeCommander, commanderPairProblem, validateCommanderDeck, type DeckProblem } from "../deck";

export interface SavedDeck {
  id: string;
  name: string;
  commander?: string;
  /** A partner, or a Background (CR 702.124). */
  secondCommander?: string;
  /** For a commander that has you choose a color before the game begins (CR 903.4b): `commander`'s, then the second's. */
  commanderColor?: Color;
  secondCommanderColor?: Color;
  /** The other cards, a name once for each copy. */
  cards: string[];
  /** ISO time it was last saved. */
  updatedAt: string;
}

/** A commander that has you choose a color before the game begins (The Prismatic Piper, CR 903.4b). */
export const choosesColor = (d: CardDef | undefined) => !!d && /choose a color before the game begins/i.test(d.oracleText ?? "");

/** The commanders' color identity (CR 903.4), the chosen colors included; all five colors when there's no commander yet. */
export function deckIdentity(commanders: CardDef[], chosen: (Color | undefined)[] = []): Set<Color> {
  if (!commanders.length) return new Set(["W", "U", "B", "R", "G"]);
  return new Set([...commanders.flatMap((c) => c.colorIdentity), ...chosen.filter((c): c is Color => !!c)]);
}

/** Can this card go in a deck with that color identity (CR 903.5c)? */
export const fitsIdentity = (d: CardDef, identity: Set<Color>) => d.colorIdentity.every((c) => identity.has(c));

/** Can `second` be the deck's second commander beside `first` (partners, a Background)? */
export function canPair(first: CardDef, second: CardDef): boolean {
  return first.name !== second.name && commanderPairProblem(first, second) === null;
}

/** Can this card be a deck's (first) commander? */
export const commanderCandidate = (d: CardDef) => canBeCommander(d);

/**
 * What stops the deck being played: missing cards (`lookup` doesn't know them), then the Commander deck rules
 * (validateCommanderDeck). Empty when it can be played.
 */
export function savedDeckProblems(deck: SavedDeck, lookup: (name: string) => CardDef | undefined, banned?: Set<string>): DeckProblem[] {
  const out: DeckProblem[] = [];
  const commander = deck.commander ? lookup(deck.commander) : undefined;
  if (!deck.commander) return [{ problem: "no commander chosen" }];
  if (!commander) return [{ card: deck.commander, problem: "isn't a card this game supports" }];
  const second = deck.secondCommander ? lookup(deck.secondCommander) : undefined;
  if (deck.secondCommander && !second) out.push({ card: deck.secondCommander, problem: "isn't a card this game supports" });
  const cards: CardDef[] = [];
  for (const n of deck.cards) {
    const d = lookup(n);
    if (d) cards.push(d);
    else out.push({ card: n, problem: "isn't a card this game supports" });
  }
  if (out.length) return out;
  return validateCommanderDeck(commander, cards, banned, second, [deck.commanderColor, deck.secondCommanderColor]);
}

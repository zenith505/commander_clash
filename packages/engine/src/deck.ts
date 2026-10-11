import type { CardDef } from "./types";

export interface DeckProblem {
  card?: string;
  problem: string;
}

/** Can this card be a commander? CR 903.3 */
export function canBeCommander(c: CardDef): boolean {
  if (c.supertypes.includes("Legendary") && c.types.includes("Creature")) return true;
  return /can be your commander/i.test(c.oracleText);
}

/**
 * Check a Commander deck against CR 903.5: 100 cards including the commander,
 * singleton except basic lands, and every card within the commander's color identity.
 * `banned` is a set of card names (from the card data's commander legality).
 */
export function validateCommanderDeck(commander: CardDef, deck: CardDef[], banned: Set<string> = new Set()): DeckProblem[] {
  const out: DeckProblem[] = [];
  if (!canBeCommander(commander)) out.push({ card: commander.name, problem: "isn't a legendary creature" });
  if (deck.length + 1 !== 100) out.push({ problem: `deck has ${deck.length + 1} cards including the commander, needs 100` });
  const counts = new Map<string, number>();
  for (const c of [commander, ...deck]) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  for (const [name, n] of counts) {
    const c = deck.find((x) => x.name === name) ?? commander;
    const unlimited = c.supertypes.includes("Basic") || /A deck can have any number of cards named/i.test(c.oracleText);
    if (n > 1 && !unlimited) out.push({ card: name, problem: `appears ${n} times (singleton)` });
  }
  const ci = new Set(commander.colorIdentity);
  for (const c of deck) {
    if (c.colorIdentity.some((col) => !ci.has(col))) out.push({ card: c.name, problem: "outside the commander's color identity" });
    if (banned.has(c.name)) out.push({ card: c.name, problem: "banned in Commander" });
  }
  if (banned.has(commander.name)) out.push({ card: commander.name, problem: "banned in Commander" });
  return out;
}

import type { CardDef } from "./types";
import { stripReminder } from "./keywords";

export interface DeckProblem {
  card?: string;
  problem: string;
}

/** Can this card be a commander? CR 903.3 */
export function canBeCommander(c: CardDef): boolean {
  if (c.supertypes.includes("Legendary") && c.types.includes("Creature")) return true;
  return /can be your commander/i.test(c.oracleText);
}

const isBackground = (c: CardDef) => c.supertypes.includes("Legendary") && c.types.includes("Enchantment") && c.subtypes.includes("Background");
const isLegendaryCreature = (c: CardDef) => c.supertypes.includes("Legendary") && c.types.includes("Creature");

/**
 * The partner abilities a card has (CR 702.124a), lowercased: "partner", "partner with [name]",
 * "partner—[text]", "choose a background", "doctor's companion".
 */
function partnerAbilities(c: CardDef): string[] {
  return stripReminder(c.oracleText)
    .split("\n")
    .flatMap((l) => l.split(/,\s*/))
    .map((l) => l.trim().replace(/\.$/, "").toLowerCase())
    .map((l) => (l === "friends forever" ? "partner—friends forever" : l))
    .filter((l) => /^(partner\b|choose a background$|doctor's companion$)/.test(l));
}

/** Why these two can't be designated together as your commanders (CR 702.124), or null if they can. */
export function commanderPairProblem(a: CardDef, b: CardDef): string | null {
  const [pa, pb] = [partnerAbilities(a), partnerAbilities(b)];
  const either = (test: (x: CardDef, px: string[], y: CardDef, py: string[]) => boolean) => test(a, pa, b, pb) || test(b, pb, a, pa);
  // "Choose a Background": the other is a legendary Background enchantment card (702.124k).
  if (either((_x, px, y) => px.includes("choose a background") && isBackground(y))) return null;
  // Partner: both have it (702.124h); "partner—[text]": both have the same one (702.124i).
  if (pa.some((x) => (x === "partner" || x.startsWith("partner—")) && pb.includes(x))) return null;
  // "Partner with [name]": each names the other (702.124j).
  if (pa.includes(`partner with ${b.name.toLowerCase()}`) && pb.includes(`partner with ${a.name.toLowerCase()}`)) return null;
  // "Doctor's companion": the other is a legendary Time Lord Doctor creature with no other creature types (702.124m).
  const doctor = (c: CardDef) => isLegendaryCreature(c) && c.subtypes.includes("Time Lord") && c.subtypes.includes("Doctor") && c.subtypes.every((t) => t === "Time Lord" || t === "Doctor");
  if (either((x, px, y) => px.includes("doctor's companion") && isLegendaryCreature(x) && doctor(y))) return null;
  return "these two can't both be commanders (CR 702.124)";
}

/**
 * Check a Commander deck against CR 903.5: 100 cards including the commander (or both commanders,
 * CR 702.124b), singleton except basic lands, and every card within the commanders' combined color
 * identity (702.124c). `banned` is a set of card names (from the card data's commander legality).
 */
export function validateCommanderDeck(commander: CardDef, deck: CardDef[], banned: Set<string> = new Set(), second?: CardDef): DeckProblem[] {
  const out: DeckProblem[] = [];
  const commanders = second ? [commander, second] : [commander];
  // A legendary Background can be a commander only beside one that can choose a Background (CR 702.124k).
  for (const c of commanders) if (!canBeCommander(c) && !(second && isBackground(c))) out.push({ card: c.name, problem: "isn't a legendary creature" });
  if (second) {
    const pair = commanderPairProblem(commander, second);
    if (pair) out.push({ card: `${commander.name} and ${second.name}`, problem: pair });
  }
  const n = commanders.length;
  if (deck.length + n !== 100) out.push({ problem: `deck has ${deck.length + n} cards including the commander${n > 1 ? "s" : ""}, needs 100` });
  const counts = new Map<string, number>();
  for (const c of [...commanders, ...deck]) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  for (const [name, k] of counts) {
    const c = [...deck, ...commanders].find((x) => x.name === name)!;
    if (k > 1 && k > deckLimit(c)) out.push({ card: name, problem: deckLimit(c) === 1 ? `appears ${k} times (singleton)` : `appears ${k} times (at most ${deckLimit(c)})` });
  }
  const ci = new Set(commanders.flatMap((c) => c.colorIdentity));
  for (const c of deck) {
    if (c.colorIdentity.some((col) => !ci.has(col))) out.push({ card: c.name, problem: "outside the commander's color identity" });
    if (banned.has(c.name)) out.push({ card: c.name, problem: "banned in Commander" });
  }
  for (const c of commanders) if (banned.has(c.name)) out.push({ card: c.name, problem: "banned in Commander" });
  return out;
}

const LIMIT_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * How many copies of a card a Commander deck can have: one (CR 903.5b), except basic lands and cards whose text
 * overrides that rule (CR 101.1): "A deck can have any number of cards named ~", "up to seven" (Seven Dwarves),
 * "up to nine" (Nazgûl).
 */
export function deckLimit(c: CardDef): number {
  if (c.supertypes.includes("Basic") || /A deck can have any number of cards named/i.test(c.oracleText)) return Infinity;
  const m = /A deck can have up to (\w+) cards named/i.exec(c.oracleText);
  return (m && LIMIT_WORDS[m[1]!.toLowerCase()]) || 1;
}

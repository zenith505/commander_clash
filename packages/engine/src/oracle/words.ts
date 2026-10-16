import type { Amount, CounterKind, AmountExpr, Effect, ObjRef } from "../abilities";
import { canonicalKeyword, CHOSEN_PROTECTION } from "../keywords";
import { parseManaCost } from "../mana";
import type { Color, ManaType } from "../types";

export const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
export const NUM = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)";
export const num = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);
/** Like NUM, but X too (CR 107.3). */
export const NUMX = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+|X)";
/** Counter kinds effects can put on permanents (see CounterKind). */
export const COUNTER = "([+-]1/[+-]1|(?!(?:additional|each|kind|that|those|the|its|more|fewer|of)\\b)[a-z]+)";
export const counterKind = (t: string): CounterKind => t;
export const X: AmountExpr = { count: { kind: "x" } };
export const amt = (s: string): Amount => (s === "X" ? X : num(s));
/** A power/toughness change: "+2", "-1", "+X", "-X". */
export const PT = "([+-](?:\\d+|X))";
export const ptAmt = (s: string): Amount => (s === "+X" ? X : s === "-X" ? { count: { kind: "x" }, negate: true } : Number(s));

export const COLOR_WORDS: Record<string, Color> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
export const TYPE_WORDS: Record<string, string> = {
  creature: "Creature", artifact: "Artifact", enchantment: "Enchantment", land: "Land",
  planeswalker: "Planeswalker", battle: "Battle", instant: "Instant", sorcery: "Sorcery",
};
/** A keyword the engine implements, spelled its way; "protection from the chosen color" only where a choice fills it in. */
export const keywordOf = (p: string, chosen = false) => {
  const k = canonicalKeyword(p);
  return k === CHOSEN_PROTECTION && !chosen ? undefined : k;
};

export const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/** A mana cost we can pay: no X, no snow, nothing unusual. */
export const plainMana = (cost: string) => parseManaCost(cost).supported && !parseManaCost(cost).hasX;

export const sacrificeSelf: Effect = { type: "sacrifice", what: { ref: "self" } };

export const pumpSelf = (power: number, toughness: number): Effect => ({ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power, toughness }], duration: "endOfTurn" });

export const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

export const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "Elves" -> "Elf", "Zombies" -> "Zombie", "Wolves" -> "Wolf". */
export function singular(word: string): string {
  if (/^(Zombie|Faerie|Detective|Cave)s$/i.test(word)) return word.slice(0, -1);
  if (/ves$/.test(word)) return word.replace(/ves$/, "f");
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(x|ch|sh)es$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word; // Merfolk, Sheep, ...
}

/** "Elves" -> "Elf"; "Plains" stays (it's already singular). */
export const singularWord = (w: string) => (/^(Plains|plains|Aurochs|less|this|its|basic|Equipment)$/.test(w) ? w : singular(w));

export const isGroup = (r: ObjRef) => r.ref === "allCreatures" || r.ref === "each";
/** Several targets: "up to two target creatures". */
export const isSeveral = (r: ObjRef) => r.ref === "target" && (r.n ?? 1) > 1;

/** "Each player discards their hand, then draws seven cards": one sentence, for the subject (see parseSpellsSentence). */
export const WHEEL = /^(?:.+? )?discards? (?:all the cards in )?(?:your|their|his or her) hand, then draws? /i;

import type { Amount, CounterKind, AmountExpr, Effect, ObjRef, SpentReq } from "../abilities";
import { canonicalKeyword, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION } from "../keywords";
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
export const COUNTER = "([+-]1/[+-]1|double strike|first strike|(?!(?:additional|each|kind|that|those|the|its|more|fewer|of)\\b)[a-z]+)";
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
  return (k === CHOSEN_PROTECTION || k === CHOSEN_PLAYER_PROTECTION) && !chosen ? undefined : k;
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

export const isGroup = (r: ObjRef) => r.ref === "allCreatures" || r.ref === "each" || (r.ref === "target" && !!r.sameName);
/** Several targets: "up to two target creatures". */
export const isSeveral = (r: ObjRef) => r.ref === "target" && (r.n ?? 1) > 1;

/** "Each player discards their hand, then draws seven cards": one sentence, for the subject (see parseSpellsSentence). */
export const WHEEL = /^(?:.+? )?discards? (?:all the cards in )?(?:your|their|his or her) hand, then draws? /i;

/**
 * What "... was spent to cast ~" asks of the mana spent (CR 601.2h): "{U}", "{U}{B}" (some of each), "at least three
 * white mana", "at least three mana of the same color" (adamant), "five or more mana" / "at least four mana" (opus),
 * "no mana", "no colored mana". `SPENT` matches the phrase, `SPENT_TO_CAST` it with what was cast.
 */
export const SPENT = "((?:\\{[WUBRGC]\\})+|\\{S\\}(?: of any of that spell's colors)?|at least \\w+ (?:white|blue|black|red|green|colorless) mana|at least \\w+ mana of the same color|at least \\w+ mana|\\w+ or more mana from creatures|\\w+ or more mana|mana from an? (?:artifact|creature)|no(?: colored)? mana)";
export const SPENT_TO_CAST = `${SPENT} was spent to cast (~|it|that spell)`;

export function parseSpentReq(what: string): SpentReq | null {
  const COLOR_OF: Record<string, Color> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  let m: RegExpExecArray | null;
  if (/^(?:\{[WUBRGC]\})+$/.test(what)) {
    const colors: Partial<Record<Color, number>> = {};
    for (const c of what.match(/[WUBRGC]/g)!) {
      if (c === "C") return null; // {C} isn't a color; no card asks for it
      colors[c as Color] = (colors[c as Color] ?? 0) + 1;
    }
    return { colors };
  }
  // "If {S} was spent" (CR 107.4h): mana from a snow source; Boreal Outrider's of one of the spell's colors.
  if (what === "{S}") return { snow: 1 };
  if (what === "{S} of any of that spell's colors") return { snowOfColors: true };
  if ((m = /^at least (\w+) colorless mana$/.exec(what))) return Number.isFinite(num(m[1]!)) ? { colorless: num(m[1]!) } : null;
  if ((m = /^at least (\w+) (white|blue|black|red|green) mana$/.exec(what))) return Number.isFinite(num(m[1]!)) ? { colors: { [COLOR_OF[m[2]!]!]: num(m[1]!) } } : null;
  if ((m = /^at least (\w+) mana of the same color$/.exec(what))) return Number.isFinite(num(m[1]!)) ? { sameColor: num(m[1]!) } : null;
  if ((m = /^(?:at least (\w+) mana|(\w+) or more mana)$/.exec(what))) {
    const n = num(m[1] ?? m[2]!);
    return Number.isFinite(n) ? { total: n } : null;
  }
  if ((m = /^no( colored)? mana$/.exec(what))) return { none: m[1] ? "colored" : "mana" };
  // "If three or more mana from creatures was spent" (Inga and Esika), "if mana from an artifact was spent" (CR 106.3).
  if ((m = /^(\w+) or more mana from creatures$/.exec(what))) return Number.isFinite(num(m[1]!)) ? { from: { creature: num(m[1]!) } } : null;
  if ((m = /^mana from an? (artifact|creature)$/.exec(what))) return { from: { [m[1]!]: 1 } };
  return null;
}

/** A results table's row (CR 706.3a): "1—9 | ...", "20 | ...", "15+ | ...", "9 or less | ...". */
export const ROLL_ROW = /^(\d+)(?:[—–-](\d+)|(\+)| or (less|more|higher))? \| (.+)$/;

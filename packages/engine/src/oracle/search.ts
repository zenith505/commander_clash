import type { Effect, SearchDest, TargetSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import { NUMBER_WORDS, X, BASIC_TYPES } from "./words";
import { parseTargetPhrase } from "./targets";

const SEARCH_PRONOUN = "(?:it|them|that card|those cards|the card|those cards)";
const SEARCH_DEST = "(into your hand|onto the battlefield(?: tapped)?|into your graveyard)";

function searchDest(text: string): SearchDest {
  if (text === "into your hand") return { zone: "hand" };
  if (text === "into your graveyard") return { zone: "graveyard" };
  return { zone: "battlefield", ...(text.endsWith("tapped") ? { tapped: true } : {}) };
}

/**
 * "Search your library for a basic land card, reveal it, put it into your hand, then shuffle"
 * (CR 701.23), and the variants: "put one onto the battlefield tapped and the other into your
 * hand" (Cultivate), "then shuffle and put that card on top" (Vampiric Tutor).
 */
export function parseSearch(s: string): Effect[] | null {
  const m = /^Search your library for (up to )?(a|an|one|two|three|four|five|any number of) (.+?)(?:, reveal (?:it|them|that card|those cards))?(?:,| and) (.+)$/i.exec(s);
  if (!m) return null;
  const upTo = !!m[1] || m[2] === "any number of";
  const n = m[2] === "any number of" ? 99 : NUMBER_WORDS[m[2]!.toLowerCase()]!;
  const reveal = /, reveal /.test(s);
  const filter = parseSearchFilter(m[3]!);
  if (filter === null) return null;
  const rest = m[4]!;
  let r: RegExpExecArray | null;
  // An Aura put onto the battlefield this way: its controller chooses what it enchants as it enters (CR 303.4f).
  const base = { type: "search" as const, ...(filter ? { filter } : {}), n, upTo, reveal };
  if ((r = new RegExp(`^put ${SEARCH_PRONOUN} ${SEARCH_DEST}, then shuffle$`, "i").exec(rest))) return [{ ...base, dest: searchDest(r[1]!) }];
  if ((r = new RegExp(`^put one ${SEARCH_DEST} and the other ${SEARCH_DEST}, then shuffle$`, "i").exec(rest)) && n === 2)
    return [{ ...base, dest: searchDest(r[1]!), others: searchDest(r[2]!) }];
  // The shuffle and putting the card on top are one action (rulings).
  if (/^then shuffle and put (?:that card|the card|it) on top(?: of your library)?$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop" } }];
  if (/^put (?:it|that card) on top of your library, then shuffle$/i.test(rest)) return null; // shuffled away again: not a real template
  return null;
}

/** What a search looks for: undefined for "a card", null when it isn't understood. */
export function parseSearchFilter(phrase: string): TargetSpec | undefined | null {
  const p = phrase.replace(/\bcards\b/g, "card");
  if (/^card$/i.test(p)) return undefined;
  if (/^card named ~$/.test(p)) return { kind: "card", named: "~", text: "card named ~" };
  // "A land card with a basic land type" (Boseiju, Who Endures): a Plains, Island, Swamp, Mountain or Forest card (CR 205.3i).
  if (/^land card with a basic land type$/.test(p)) return { kind: "card", types: ["Land"], subtypes: [...BASIC_TYPES], text: "land card with a basic land type" };
  // Only plain card qualities: "with different names", "with mana value X or less" and the like aren't modeled.
  if (/ with (different|the same)| X /.test(p) || !/card( with (mana value|power|toughness) \d+ or (less|greater))?$/i.test(p)) return null;
  const spec = parseTargetPhrase(`${p} from your graveyard`);
  if (!spec || spec.kind !== "card") return null;
  const { owner: _owner, ...rest } = spec;
  return { ...rest, text: p };
}

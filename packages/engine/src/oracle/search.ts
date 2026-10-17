import type { AmountExpr, Effect, SearchDest, TargetSpec } from "../abilities";
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
export function parseSearch(s: string, count?: (text: string) => AmountExpr | null): Effect[] | null {
  const m = /^Search your library for (up to )?(a|an|one|two|three|four|five|any number of) (.+?)(?:, reveal (?:it|them|that card|those cards))?(?:,| and) ((?:put|then) .+)$/i.exec(s);
  if (!m) return null;
  const upTo = !!m[1] || m[2] === "any number of";
  const n = m[2] === "any number of" ? 99 : NUMBER_WORDS[m[2]!.toLowerCase()]!;
  const reveal = /, reveal /.test(s);
  const rest = m[4]!;
  // Alpine Houndmaster: "a card named A and/or a card named B": up to one of each (one search, CR 701.23).
  const both = /^card named ([A-Z][^~]*?) and\/or a card named ([A-Z][^~]*)$/.exec(m[3]!);
  if (both && n === 1 && !m[1]) {
    const r = new RegExp(`^put them ${SEARCH_DEST}, then shuffle$`, "i").exec(rest);
    if (!r || / or |\band\/or\b/.test(`${both[1]} ${both[2]}`)) return null;
    const filter: TargetSpec = { kind: "card", anyOf: [both[1]!, both[2]!].map((name) => ({ kind: "card" as const, named: name, text: `card named ${name}` })), text: m[3]! };
    return [{ type: "search", filter, n: 2, upTo: true, oneEach: true, reveal, dest: searchDest(r[1]!) }];
  }
  const filter = parseSearchFilter(m[3]!, count);
  if (filter === null) return null;
  let r: RegExpExecArray | null;
  // An Aura put onto the battlefield this way: its controller chooses what it enchants as it enters (CR 303.4f).
  const base = { type: "search" as const, ...(filter ? { filter } : {}), n, upTo, reveal };
  if ((r = new RegExp(`^put ${SEARCH_PRONOUN} ${SEARCH_DEST}, then shuffle$`, "i").exec(rest))) return [{ ...base, dest: searchDest(r[1]!) }];
  if ((r = new RegExp(`^put one ${SEARCH_DEST} and the other ${SEARCH_DEST}, then shuffle$`, "i").exec(rest)) && n === 2)
    return [{ ...base, dest: searchDest(r[1]!), others: searchDest(r[2]!) }];
  // The shuffle and putting the card on top are one action (rulings).
  if (/^then shuffle and put (?:that card|the card|it) on top(?: of your library)?$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop" } }];
  if (/^then shuffle and put that card third from the top$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop", third: true } }];
  if (/^put (?:it|that card) on top of your library, then shuffle$/i.test(rest)) return null; // shuffled away again: not a real template
  return null;
}

/** What a search looks for: undefined for "a card", null when it isn't understood. */
export function parseSearchFilter(phrase: string, count?: (text: string) => AmountExpr | null): TargetSpec | undefined | null {
  const p = phrase.replace(/\bcards\b/g, "card");
  // "A card with mana value less than or equal to the number of lands you control" (Beseech the Queen): counted as the
  // search resolves (TargetSpec.bound).
  const bound = count && (/ with (?:mana value|power|toughness) (?:less|greater) than or equal to .+$/i.exec(p) ?? / with (?:mana value|power|toughness) X or (?:less|greater)$/.exec(p));
  if (bound) {
    const head = parseSearchFilter(p.slice(0, bound.index));
    const spec = head !== null && parseTargetPhrase(`card${bound[0]} from your graveyard`, { count });
    if (!spec || head === null || spec.kind !== "card" || !spec.bound) return null;
    return { ...(head ?? { kind: "card" }), bound: spec.bound, text: p };
  }
  if (/^card$/i.test(p)) return undefined;
  if (/^card named ~$/.test(p)) return { kind: "card", named: "~", text: "card named ~" };
  // "A card named Ajani, Valiant Protector": that card's name, as printed.
  const named = /^card named ([A-Z][^~]*)$/.exec(phrase);
  if (named && /\b(?:or|and\/or)\b/.test(named[1]!)) {
    // "A card named Festering Newt or Bubbling Cauldron", "a card named Ionize or a card named Electrolyze", "a card named
    // Halvar, God of Battle or an Equipment card": either one. A name may itself hold "or" (Fight or Flight, Truth or
    // Tale: one word each side, as every such name is), so "A or B" splits only between names of two or more words.
    const or = /^(.+?) or (?:a card named (.+)|(an? .+ card))$/.exec(named[1]!) ?? /^(.+ .+) or ([A-Z].* .+)$/.exec(named[1]!);
    if (!or || / or |\band\/or\b/.test(or[1]!) || (or[2] && / or |\band\/or\b/.test(or[2]))) return null;
    const other = or[2] ? { kind: "card" as const, named: or[2], text: `card named ${or[2]}` } : parseSearchFilter(or[3]!.replace(/^an? /, ""));
    if (!other) return null;
    return { kind: "card", anyOf: [{ kind: "card", named: or[1]!, text: `card named ${or[1]}` }, other], text: p };
  }
  if (named) return { kind: "card", named: named[1]!, text: `card named ${named[1]}` };
  // "A basic Forest, Plains, or Island card" (Brokers Hideout): a basic land card with any one of those types.
  const basics = /^basic ([A-Z][a-z]+(?:, [A-Z][a-z]+)*,? or [A-Z][a-z]+) card$/.exec(p);
  if (basics) {
    const subs = basics[1]!.split(/,? or |, /).map((t) => parseSearchFilter(`basic ${t} card`));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p };
  }
  // "A snow permanent card, a legendary card, or a Saga card" (Search for Glory): a card that fits any one of them.
  const parts = p.split(/,? or an? |, an? /);
  if (parts.length > 1 && parts.every((x) => / card$/.test(x))) {
    const subs = parts.map((x) => parseSearchFilter(x));
    if (subs.some((x) => !x)) return null;
    return { kind: "card", anyOf: subs as TargetSpec[], text: p.replace(/\bcard\b(?=,| or )/g, "card") };
  }
  // "A land card with a basic land type" (Boseiju, Who Endures): a Plains, Island, Swamp, Mountain or Forest card (CR 205.3i).
  if (/^land card with a basic land type$/.test(p)) return { kind: "card", types: ["Land"], subtypes: [...BASIC_TYPES], text: "land card with a basic land type" };
  // Only plain card qualities: "with different names", "with mana value X or less" and the like aren't modeled.
  if (/ with (different|the same)| X /.test(p) || !/card( with (mana value|power|toughness) \d+ or (less|greater)| with an? (even|odd) mana value)?$/i.test(p)) return null;
  const spec = parseTargetPhrase(`${p} from your graveyard`);
  if (!spec || spec.kind !== "card") return null;
  const { owner: _owner, ...rest } = spec;
  return { ...rest, text: p };
}

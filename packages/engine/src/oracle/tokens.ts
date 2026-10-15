import type { CopyExcept } from "../copies";
import type { CountMod, TokenSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { COLOR_WORDS, TYPE_WORDS, capital } from "./words";
import { parseKeywordList } from "./targets";
import { compileQuoted } from "./grants";

/** Tokens the rules define (CR 111.10). */
export const PREDEFINED_TOKENS: Record<string, TokenSpec> = {
  Treasure: { name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"], keywords: [], abilities: "{T}, Sacrifice this token: Add one mana of any color." },
  Food: { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"], keywords: [], abilities: "{2}, {T}, Sacrifice this token: You gain 3 life." },
  Clue: { name: "Clue", colors: [], types: ["Artifact"], subtypes: ["Clue"], keywords: [], abilities: "{2}, Sacrifice this token: Draw a card." },
};

/** An Incubator token (CR 701.53b, 111.10i): a colorless Incubator artifact, and on its back a 0/0 Phyrexian artifact creature. */
export const INCUBATOR: TokenSpec = {
  name: "Incubator",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Incubator"],
  keywords: [],
  abilities: "{2}: Transform this token.",
  back: { name: "Phyrexian", power: 0, toughness: 0, colors: [], types: ["Artifact", "Creature"], subtypes: ["Phyrexian"], keywords: [] },
};

export function parseToken(power: number, toughness: number, desc: string, withText?: string): TokenSpec | null {
  // desc: "white Soldier", "green and white Elf Warrior", "colorless Thopter artifact"
  const words = desc.split(/\s+/);
  const colors: Color[] = [];
  const subtypes: string[] = [];
  const types = ["Creature"];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (COLOR_WORDS[lw]) colors.push(COLOR_WORDS[lw]!);
    else if (lw === "and" || lw === "colorless") continue;
    else if (lw === "artifact" || lw === "enchantment") types.unshift(TYPE_WORDS[lw]!);
    else if (CREATURE_TYPES.has(w)) subtypes.push(w);
    else return null;
  }
  // 'with "Sacrifice ~: Add {C}."': an ability of its own (CR 111.3).
  const quoted = withText && /^"(.+)"$/.exec(withText);
  if (quoted && !compileQuoted(quoted[1]!)) return null;
  const keywords = withText && !quoted ? parseKeywordList(withText) : [];
  if (!keywords || !subtypes.length) return null;
  return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords, ...(quoted ? { abilities: quoted[1]! } : {}) };
}

/** Token and counter doublers (CR 614.1a): Parallel Lives, Doubling Season, Hardened Scales, Xorn. */
export function parseCountMod(line: string): CountMod | undefined {
  let m = /^If (?:an effect would create one or more tokens( under your control)?, it creates|one or more tokens would be created( under your control)?,) twice that many of those tokens(?: are created)? instead\.$/.exec(line);
  if (m) return { what: "tokens", who: m[1] || m[2] ? "you" : "any", op: "double" };
  m = /^If you would create one or more ([A-Z][a-z]+) tokens, instead create those tokens plus an additional \1 token\.$/.exec(line);
  if (m) return { what: "tokens", who: "you", op: "plusOne", subtype: m[1]! };
  m = /^If one or more \+1\/\+1 counters would be put on (another|a) creature( you control)?, (twice that many|that many plus one) \+1\/\+1 counters are put on (?:it|that creature) instead\.$/.exec(line);
  if (m) return { what: "counters", counter: "+1/+1", on: "creature", who: m[2] ? "you" : "any", op: m[3] === "twice that many" ? "double" : "plusOne", ...(m[1] === "another" ? { other: true } : {}) };
  m = /^If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead\.$/.exec(line);
  if (m) return { what: "counters", on: "permanent", who: "you", op: "double" };
  return undefined;
}

const COPY_CARD_TYPES = new Set(["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle", "Instant", "Sorcery", "Kindred"]);

/**
 * The exceptions of a copy effect (CR 707.9): "it isn't legendary", "it's an artifact in addition to its other
 * types", "it's a 1/1 Spirit creature in addition to its other types", "it has haste", 'it has "..."', "its name
 * is ~" (~ being the copy's own name, see CopyExcept.name). Null if any part isn't understood.
 */
export function parseCopyExcept(text: string): CopyExcept | null {
  const out: CopyExcept = {};
  // Quoted abilities first, so commas inside them don't split anything.
  const quoted: string[] = [];
  let t = text.replace(/"([^"]+)"/g, (_, q: string) => `\u0000${quoted.push(q) - 1}\u0000`);
  t = t.replace(/^(?:it|they|he|she) /, "");
  const parts = t.split(/,? and (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)|, (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)/).map((p) => p.trim().replace(/^(?:it|they|he|she) /, ""));
  for (const p of parts) {
    let m: RegExpExecArray | null;
    if (/^(?:isn't|aren't|is not|are not) legendary$/.test(p)) out.notLegendary = true;
    else if (/^(?:'s|’s|is|are|'re) legendary$/.test(p) || /^(?:it's|they're|he's|she's) legendary$/.test(p)) out.legendary = true;
    // "It doesn't copy that creature's color": it keeps its own (CR 707.9c).
    else if (/^(?:doesn't|does not) copy that creature's colou?r$/.test(p)) out.keepColors = true;
    else if ((m = /^(?:is|are|it's|they're|he's|she's) (?:an? )?(?:(\d+)\/(\d+) )?((?:(?:white|blue|black|red|green|colorless) )*)(?:and (?:white|blue|black|red|green) )?(.+?) in addition to (?:its|their|his|her) other (?:creature )?types$/.exec(p))) {
      if (m[1]) out.pt = [Number(m[1]), Number(m[2])];
      const colors = (m[3] ?? "").trim().split(" ").filter((c) => c && c !== "colorless");
      if (colors.length) out.colors = colors.map((c) => ({ white: "W", blue: "U", black: "B", red: "R", green: "G" })[c]) as Color[];
      const words = m[4]!.split(" ").map((w) => w.replace(/s$/, "")).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      if (words.some((w) => !/^[A-Z][a-z]+$/.test(w))) return null;
      // "It's legendary in addition to its other types": a supertype (CR 205.4). Other supertypes aren't modeled here.
      if (words[0] === "Legendary") {
        out.legendary = true;
        words.shift();
      }
      if (words.some((w) => ["Basic", "Snow", "World", "Legendary"].includes(w))) return null;
      if (words.some((w) => COPY_CARD_TYPES.has(w))) out.addTypes = words.filter((w) => COPY_CARD_TYPES.has(w));
      if (words.some((w) => !COPY_CARD_TYPES.has(w))) out.addSubtypes = words.filter((w) => !COPY_CARD_TYPES.has(w));
    } else if ((m = /^(?:'s|’s|is|are|it's|they're|he's|she's) (\d+)\/(\d+)$/.exec(p))) out.pt = [Number(m[1]), Number(m[2])];
    else if ((m = /^(?:has|have) (.+)$/.exec(p))) {
      for (const piece of m[1]!.split(/,? and (?=\u0000)|, (?=\u0000)|(?<=\u0000) and /)) {
        const q = /^\u0000(\d+)\u0000$/.exec(piece.trim());
        if (q) {
          (out.text ??= []).push(quoted[Number(q[1])]!);
          continue;
        }
        for (const kw of piece.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
          // "Except it has this ability": the copy effect's own ability (CR 707.9a), bound to its text by compile().
          if (kw === "this ability") {
            out.thisAbility = true;
            continue;
          }
          const simple = parseKeywordList(kw);
          if (simple) (out.keywords ??= []).push(...simple);
          else if (/^[a-z]+(?: [a-z]+)?(?: \d+)?$/.test(kw)) (out.text ??= []).push(capital(kw)); // "dethrone", "vanishing 3"
          else return null;
        }
      }
    } else if (/^(?:its|his|her) name is ~$/.test(p)) out.name = "~";
    else return null;
  }
  return out;
}

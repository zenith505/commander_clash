// Card search for the deck builder, in Scryfall's search syntax (https://scryfall.com/docs/syntax): bare words match
// names, `key:value` filters (t:, o:, c:, id:, mv:, pow:, r:, s:, is:, kw:, ...), comparisons (`mv>=3`, `c<=rg`,
// `pow>tou`), negation (`-t:land`), `or`, parentheses, quoted phrases, `!"exact name"`, `o:/regex/` and `order:`.
// It runs on the game's card data (CardDef), which has one printing per card, so set and rarity filters see that one.

import type { CardDef, Color } from "../types";
import { canBeCommander } from "../deck";

export type SearchOp = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

/** A parsed query: test a card with `match`; `problems` lists the parts it couldn't use (they match every card). */
export interface CardQuery {
  match: (d: CardDef) => boolean;
  /** `order:` and `dir:` (Scryfall's sort options); name order when there's none. */
  order: { by: SortKey; desc: boolean };
  problems: string[];
}

export type SortKey = "name" | "mv" | "power" | "toughness" | "rarity" | "color" | "released" | "set";

type Node =
  | { kind: "and"; parts: Node[] }
  | { kind: "or"; parts: Node[] }
  | { kind: "not"; part: Node }
  | { kind: "test"; test: (d: CardDef) => boolean };

const ALL: Node = { kind: "test", test: () => true };

// ---------------------------------------------------------------------------
// Tokens

type Token = { kind: "(" } | { kind: ")" } | { kind: "-" } | { kind: "or" } | { kind: "word"; text: string; quoted: boolean };

/** Splits a query into words, parentheses and negations. Quotes keep spaces in a word; `/.../` keeps a regex whole. */
function tokenize(q: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < q.length) {
    const ch = q[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      out.push({ kind: ch });
      i++;
      continue;
    }
    if (ch === "-" && i + 1 < q.length && !/[\s)]/.test(q[i + 1]!)) {
      out.push({ kind: "-" });
      i++;
      continue;
    }
    let text = "";
    let quoted = false;
    while (i < q.length && !/[\s()]/.test(q[i]!)) {
      const c = q[i]!;
      if (c === '"' || (c === "'" && text === "")) {
        // A quoted part: up to the closing quote, spaces and parentheses included.
        const end = q.indexOf(c, i + 1);
        // A word that is all quotes is a phrase to find in names; `o:"..."` is still a filter.
        if (text === "") quoted = true;
        text += q.slice(i + 1, end < 0 ? q.length : end);
        i = end < 0 ? q.length : end + 1;
        continue;
      }
      if (c === "/" && /^[a-z]+(?::|=)$/i.test(text)) {
        // o:/regex/: up to the next unescaped slash.
        let j = i + 1;
        while (j < q.length && q[j] !== "/") j += q[j] === "\\" ? 2 : 1;
        text += q.slice(i, Math.min(j + 1, q.length));
        i = j + 1;
        continue;
      }
      text += c;
      i++;
    }
    if (!quoted && /^or$/i.test(text)) out.push({ kind: "or" });
    else if (!quoted && /^and$/i.test(text)) continue; // "and" is the default between terms
    else out.push({ kind: "word", text, quoted });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse

/** Parse a Scryfall-syntax query. An empty query matches every card. */
export function parseCardQuery(q: string): CardQuery {
  const tokens = tokenize(q);
  const problems: string[] = [];
  const order: CardQuery["order"] = { by: "name", desc: false };
  let pos = 0;
  const peek = () => tokens[pos];

  const parseOr = (): Node => {
    const parts = [parseAnd()];
    while (peek()?.kind === "or") {
      pos++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0]! : { kind: "or", parts };
  };
  const parseAnd = (): Node => {
    const parts: Node[] = [];
    for (let t = peek(); t && t.kind !== ")" && t.kind !== "or"; t = peek()) parts.push(parseUnary());
    return parts.length === 1 ? parts[0]! : { kind: "and", parts };
  };
  const parseUnary = (): Node => {
    const t = tokens[pos++]!;
    if (t.kind === "-") return peek() ? { kind: "not", part: parseUnary() } : ALL;
    if (t.kind === "(") {
      const inner = parseOr();
      if (peek()?.kind === ")") pos++;
      else problems.push("a parenthesis isn't closed");
      return inner;
    }
    if (t.kind === "word") return term(t.text, t.quoted, problems, order);
    return ALL;
  };

  let root: Node = ALL;
  if (tokens.length) {
    root = parseOr();
    while (pos < tokens.length) {
      // A stray ")": skip it and keep going.
      problems.push("a parenthesis is closed without being opened");
      pos++;
      if (pos < tokens.length) root = { kind: "and", parts: [root, parseOr()] };
    }
  }
  return { match: (d) => evaluate(root, d), order, problems };
}

function evaluate(n: Node, d: CardDef): boolean {
  switch (n.kind) {
    case "and":
      return n.parts.every((p) => evaluate(p, d));
    case "or":
      return n.parts.some((p) => evaluate(p, d));
    case "not":
      return !evaluate(n.part, d);
    case "test":
      return n.test(d);
  }
}

const TERM = /^([a-z]+)(!=|<=|>=|:|=|<|>)(.*)$/is;

function term(text: string, quoted: boolean, problems: string[], order: CardQuery["order"]): Node {
  // `!name` / `!"Exact Name"`: exactly that name (a face's name counts).
  if (text.startsWith("!") && text.length > 1) {
    const want = norm(text.slice(1));
    return { kind: "test", test: (d) => names(d).some((n) => norm(n) === want) };
  }
  const m = quoted ? null : TERM.exec(text);
  if (!m) {
    const want = norm(text);
    return { kind: "test", test: (d) => names(d).some((n) => norm(n).includes(want)) || norm(d.name).includes(want) };
  }
  const key = m[1]!.toLowerCase();
  const op = m[2] as SearchOp;
  const value = m[3]!;
  const fail = (why: string): Node => {
    problems.push(why);
    return ALL;
  };
  const test = (t: (d: CardDef) => boolean): Node => ({ kind: "test", test: t });
  switch (key) {
    case "name":
    case "n": {
      if (value.startsWith("/")) {
        const re = regex(value);
        return re ? test((d) => names(d).some((n) => re.test(n))) : fail(`"${text}": not a valid regular expression`);
      }
      const want = norm(value);
      return test((d) => names(d).some((n) => norm(n).includes(want)));
    }
    case "t":
    case "type": {
      const want = norm(value);
      return test((d) => typeLines(d).some((t) => norm(t).includes(want)));
    }
    case "o":
    case "oracle":
    case "fo":
    case "fulloracle": {
      const full = key === "fo" || key === "fulloracle";
      if (value.startsWith("/")) {
        const re = regex(value);
        return re ? test((d) => faces(d).some((f) => re.test(selfName(oracle(f.oracleText, full), f.name)))) : fail(`"${text}": not a valid regular expression`);
      }
      const want = norm(value);
      return test((d) => faces(d).some((f) => norm(selfName(oracle(f.oracleText, full), f.name)).includes(want)));
    }
    case "kw":
    case "keyword": {
      const want = norm(value);
      return test((d) => d.keywords.some((k) => norm(k) === want));
    }
    case "c":
    case "color":
    case "colour": {
      const cs = colorSpec(value);
      if (!cs) return fail(`"${text}": unknown color "${value}"`);
      // c:rg is at least red and green; c:c is colorless (exactly no colors).
      return test((d) => compareColors(cardColors(d), colonOp(op, cs, ">="), cs));
    }
    case "id":
    case "identity":
    case "ci":
    case "commander":
    case "cmd": {
      const cs = colorSpec(value);
      if (!cs) return fail(`"${text}": unknown color "${value}"`);
      // id:rg fits a red-green commander's deck: within those colors.
      return test((d) => compareColors(new Set(d.colorIdentity), colonOp(op, cs, "<="), cs));
    }
    case "produces": {
      const cs = colorSpec(value, true);
      if (!cs) return fail(`"${text}": unknown color "${value}"`);
      return test((d) => compareColors(new Set((d.producedMana ?? []) as string[]), colonOp(op, cs, ">="), cs));
    }
    case "mv":
    case "cmc":
    case "manavalue": {
      const v = value.toLowerCase();
      if (v === "even" || v === "odd") {
        if (op !== ":" && op !== "=") return fail(`"${text}": use mv:even or mv:odd`);
        return test((d) => d.cmc % 2 === (v === "even" ? 0 : 1));
      }
      return numeric(text, op, value, (d) => [d.cmc], fail);
    }
    case "pow":
    case "power":
      return numeric(text, op, value, (d) => statValues(d, "power"), fail);
    case "tou":
    case "toughness":
      return numeric(text, op, value, (d) => statValues(d, "toughness"), fail);
    case "loy":
    case "loyalty":
      return numeric(text, op, value, (d) => statValues(d, "loyalty"), fail);
    case "def":
    case "defense":
      return numeric(text, op, value, (d) => statValues(d, "defense"), fail);
    case "pt":
    case "powtou":
      return numeric(text, op, value, (d) => faces(d).flatMap((f) => (isNum(f.power) && isNum(f.toughness) ? [Number(f.power) + Number(f.toughness)] : [])), fail);
    case "m":
    case "mana": {
      const want = manaSymbols(value);
      if (!want) return fail(`"${text}": not a mana cost`);
      return test((d) => faces(d).some((f) => compareMana(manaSymbols(f.manaCost) ?? new Map(), op, want)));
    }
    case "r":
    case "rarity": {
      const want = RARITIES[value.toLowerCase()];
      if (want === undefined) return fail(`"${text}": unknown rarity "${value}"`);
      return test((d) => {
        const r = RARITIES[(d as CardDef & { rarity?: string }).rarity ?? ""];
        return r !== undefined && compare(r, op === ":" ? "=" : op, want);
      });
    }
    case "s":
    case "set":
    case "e":
    case "edition": {
      const want = value.toLowerCase();
      return test((d) => ((d as CardDef & { set?: string }).set ?? "").toLowerCase() === want);
    }
    case "year": {
      if (!/^\d{4}$/.test(value)) return fail(`"${text}": a year is four digits`);
      return test((d) => {
        const y = Number((released(d) ?? "").slice(0, 4));
        return !!y && compare(y, op === ":" ? "=" : op, Number(value));
      });
    }
    case "date": {
      if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return fail(`"${text}": a date is written yyyy-mm-dd`);
      return test((d) => {
        const r = released(d);
        if (!r) return false;
        const a = r.slice(0, value.length);
        return compare(a < value ? -1 : a > value ? 1 : 0, op === ":" ? "=" : op, 0);
      });
    }
    case "is":
    case "not": {
      const p = IS[value.toLowerCase()];
      if (!p) return fail(`"${text}": unknown property "${value}"`);
      return key === "not" ? test((d) => !p(d)) : test(p);
    }
    case "f":
    case "format":
    case "legal":
    case "banned": {
      const fmt = value.toLowerCase();
      if (fmt === "commander" || fmt === "edh") return key === "banned" ? test(() => false) : ALL;
      return fail(`"${text}": only Commander-legal cards are in this game`);
    }
    case "game":
      return value.toLowerCase() === "paper" ? ALL : fail(`"${text}": only paper cards are in this game`);
    case "order":
    case "sort": {
      const by = SORTS[value.toLowerCase()];
      if (!by) return fail(`"${text}": can't sort by "${value}"`);
      order.by = by;
      return ALL;
    }
    case "dir":
    case "direction": {
      const v = value.toLowerCase();
      if (v !== "asc" && v !== "desc") return fail(`"${text}": dir is asc or desc`);
      order.desc = v === "desc";
      return ALL;
    }
    case "unique":
    case "prefer":
    case "include":
    case "lang":
    case "language":
      return ALL; // one English printing per card here
    default:
      return fail(`"${key}:" isn't a filter this search knows`);
  }
}

// ---------------------------------------------------------------------------
// Card fields

type FaceLike = { name: string; manaCost: string; typeLine: string; oracleText: string; power?: string; toughness?: string; loyalty?: string; defense?: string; colors: Color[] };

function faces(d: CardDef): FaceLike[] {
  return d.faces?.length ? d.faces : [d];
}
function names(d: CardDef): string[] {
  return d.faces?.length ? [d.name, ...d.faces.map((f) => f.name)] : [d.name];
}
function typeLines(d: CardDef): string[] {
  return faces(d).map((f) => f.typeLine);
}
function cardColors(d: CardDef): Set<string> {
  return new Set(faces(d).flatMap((f) => f.colors));
}
function released(d: CardDef): string | undefined {
  return (d as CardDef & { releasedAt?: string }).releasedAt;
}
const isNum = (v: string | undefined): v is string => v !== undefined && /^-?\d+(\.\d+)?$/.test(v);
function statValues(d: CardDef, key: "power" | "toughness" | "loyalty" | "defense"): number[] {
  return faces(d).flatMap((f) => (isNum(f[key]) ? [Number(f[key])] : f[key] !== undefined && /\*/.test(f[key]!) ? [0] : []));
}

/** Lowercased, without accents, with curly quotes straightened. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2018\u2019]/g, "'").toLowerCase();
}

/** Oracle text without reminder text (Scryfall's o:), or with it (fo:). */
function oracle(text: string, full: boolean): string {
  return full ? text : text.replace(/\s*\([^)]*\)/g, "");
}

/** `~` in a query stands for the card's own name, so the card's name in its text becomes `~`. */
function selfName(text: string, name: string): string {
  return name ? text.split(name).join("~") : text;
}

function regex(v: string): RegExp | null {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(v);
  if (!m) return null;
  try {
    return new RegExp(m[1]!, m[2]!.includes("i") || !/[A-Z]/.test(m[1]!) ? "i" : "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comparisons

function compare(a: number, op: SearchOp, b: number): boolean {
  switch (op) {
    case ":":
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
}

const STAT_KEYS: Record<string, (d: CardDef) => number[]> = {
  pow: (d) => statValues(d, "power"),
  power: (d) => statValues(d, "power"),
  tou: (d) => statValues(d, "toughness"),
  toughness: (d) => statValues(d, "toughness"),
  loy: (d) => statValues(d, "loyalty"),
  loyalty: (d) => statValues(d, "loyalty"),
  mv: (d) => [d.cmc],
  cmc: (d) => [d.cmc],
};

const FACE_STATS: Record<string, "power" | "toughness" | "loyalty" | "defense"> = { pow: "power", power: "power", tou: "toughness", toughness: "toughness", loy: "loyalty", loyalty: "loyalty", def: "defense", defense: "defense" };

/** `pow>=3`, or a comparison with another number of the card (`pow>tou`, on the same face). */
function numeric(text: string, op: SearchOp, value: string, get: (d: CardDef) => number[], fail: (why: string) => Node): Node {
  const [a, b] = [FACE_STATS[text.split(/[:=<>!]/)[0]!.toLowerCase()], FACE_STATS[value.toLowerCase()]];
  if (a && b) return { kind: "test", test: (d) => faces(d).some((f) => isNum(f[a]) && isNum(f[b]) && compare(Number(f[a]), op, Number(f[b]))) };
  const other = STAT_KEYS[value.toLowerCase()];
  if (other) return { kind: "test", test: (d) => get(d).some((a) => other(d).some((b) => compare(a, op, b))) };
  if (!/^-?\d+(\.\d+)?$/.test(value)) return fail(`"${text}": "${value}" isn't a number`);
  const n = Number(value);
  return { kind: "test", test: (d) => get(d).some((a) => compare(a, op, n)) };
}

type ColorSpec = { set: Set<string> } | { count: number } | { multi: true };

const COLOR_NAMES: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G", colorless: "", c: "",
  azorius: "WU", dimir: "UB", rakdos: "BR", gruul: "RG", selesnya: "GW", orzhov: "WB", izzet: "UR", golgari: "BG", boros: "RW", simic: "GU",
  bant: "GWU", esper: "WUB", grixis: "UBR", jund: "BRG", naya: "RGW",
  abzan: "WBG", jeskai: "URW", sultai: "BGU", mardu: "RWB", temur: "GUR",
  silverquill: "WB", prismari: "UR", witherbloom: "BG", lorehold: "RW", quandrix: "GU",
  chaos: "UBRG", aggression: "BRGW", altruism: "RGWU", growth: "GWUB", artifice: "WUBR",
  wubrg: "WUBRG", rainbow: "WUBRG", fivecolor: "WUBRG",
};

/** A color value: letters (`wu`), a name (`azorius`), `c`/`colorless`, `m`/`multicolor`, or a number of colors. */
function colorSpec(v: string, allowC = false): ColorSpec | null {
  const s = v.toLowerCase();
  if (s === "m" || s === "multicolor" || s === "multi") return { multi: true };
  if (/^\d$/.test(s)) return { count: Number(s) };
  if (s in COLOR_NAMES) return { set: new Set(allowC && (s === "c" || s === "colorless") ? ["C"] : COLOR_NAMES[s]!.split("")) };
  if (/^[wubrgc]+$/.test(s)) {
    const letters = s.toUpperCase().split("");
    if (!allowC && letters.includes("C")) return letters.length === 1 ? { set: new Set() } : null;
    return { set: new Set(letters) };
  }
  return null;
}

/** What `:` means for a color value: `sets` for letters and names, but "exactly" for a count or colorless, "2 or more" for `m`. */
function colonOp(op: SearchOp, cs: ColorSpec, sets: SearchOp): SearchOp {
  if (op !== ":") return op;
  if ("multi" in cs) return ">=";
  if ("count" in cs || cs.set.size === 0) return "=";
  return sets;
}

function compareColors(have: Set<string>, op: SearchOp, want: ColorSpec): boolean {
  if ("multi" in want) return compare(have.size, op === "=" ? ">=" : op, 2);
  if ("count" in want) return compare(have.size, op, want.count);
  const sub = [...have].every((c) => want.set.has(c)); // have ⊆ want
  const sup = [...want.set].every((c) => have.has(c)); // have ⊇ want
  switch (op) {
    case ":":
    case "=":
      return sub && sup;
    case "!=":
      return !(sub && sup);
    case "<=":
      return sub;
    case "<":
      return sub && !sup;
    case ">=":
      return sup;
    case ">":
      return sup && !sub;
  }
}

/** A mana cost as counts of each symbol: generic mana as "#". `2WW`, `{2}{W}{W}` and `{w/u}` all parse. */
function manaSymbols(cost: string): Map<string, number> | null {
  const out = new Map<string, number>();
  const add = (sym: string, n = 1) => out.set(sym, (out.get(sym) ?? 0) + n);
  const s = cost.toUpperCase().replace(/\s/g, "");
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{") {
      const end = s.indexOf("}", i);
      if (end < 0) return null;
      const sym = s.slice(i + 1, end);
      if (/^\d+$/.test(sym)) add("#", Number(sym));
      else add(sym);
      i = end + 1;
    } else if (/\d/.test(s[i]!)) {
      let j = i;
      while (j < s.length && /\d/.test(s[j]!)) j++;
      add("#", Number(s.slice(i, j)));
      i = j;
    } else if (/[WUBRGCXSE]/.test(s[i]!)) {
      add(s[i]!);
      i++;
    } else return null;
  }
  return out;
}

function compareMana(have: Map<string, number>, op: SearchOp, want: Map<string, number>): boolean {
  const keys = new Set([...have.keys(), ...want.keys()]);
  const covers = [...want].every(([k, n]) => (have.get(k) ?? 0) >= n);
  const covered = [...have].every(([k, n]) => (want.get(k) ?? 0) >= n);
  const same = [...keys].every((k) => (have.get(k) ?? 0) === (want.get(k) ?? 0));
  switch (op) {
    case ":":
    case ">=":
      return covers;
    case "=":
      return same;
    case "!=":
      return !same;
    case ">":
      return covers && !same;
    case "<=":
      return covered;
    case "<":
      return covered && !same;
  }
}

const RARITIES: Record<string, number> = { c: 0, common: 0, u: 1, uncommon: 1, r: 2, rare: 2, s: 2, special: 2, m: 3, mythic: 3, b: 4, bonus: 4 };

const SORTS: Record<string, SortKey> = {
  name: "name", cmc: "mv", mv: "mv", manavalue: "mv", power: "power", pow: "power", toughness: "toughness", tou: "toughness",
  rarity: "rarity", color: "color", released: "released", date: "released", set: "set",
};

const PERMANENT = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];
const textOf = (d: CardDef) => faces(d).map((f) => f.oracleText).join("\n");

const IS: Record<string, (d: CardDef) => boolean> = {
  commander: (d) => canBeCommander(d) || (d.supertypes.includes("Legendary") && d.subtypes.includes("Background")),
  legendary: (d) => d.supertypes.includes("Legendary"),
  permanent: (d) => d.types.some((t) => PERMANENT.includes(t)),
  spell: (d) => !d.types.includes("Land"),
  historic: (d) => d.supertypes.includes("Legendary") || d.types.includes("Artifact") || d.subtypes.includes("Saga"),
  vanilla: (d) => d.types.includes("Creature") && !d.faces?.length && d.oracleText.trim() === "",
  split: (d) => d.layout === "split",
  flip: (d) => d.layout === "flip",
  transform: (d) => d.layout === "transform",
  mdfc: (d) => d.layout === "modal_dfc",
  dfc: (d) => d.layout === "transform" || d.layout === "modal_dfc" || d.layout === "meld",
  meld: (d) => d.layout === "meld",
  adventure: (d) => d.layout === "adventure",
  gamechanger: (d) => !!(d as CardDef & { gameChanger?: boolean }).gameChanger,
  gc: (d) => !!(d as CardDef & { gameChanger?: boolean }).gameChanger,
  partner: (d) => /^(partner\b|choose a background|friends forever|doctor's companion)/im.test(textOf(d)),
  modal: (d) => /^choose (one|two|three|one or more|any number)\b/im.test(textOf(d)),
  basic: (d) => d.supertypes.includes("Basic"),
  snow: (d) => d.supertypes.includes("Snow"),
  colorless: (d) => cardColors(d).size === 0,
  multicolor: (d) => cardColors(d).size >= 2,
  monocolor: (d) => cardColors(d).size === 1,
};

// ---------------------------------------------------------------------------
// Search

const COLOR_ORDER = "WUBRG";
function colorRank(d: CardDef): number {
  const cs = [...cardColors(d)];
  if (cs.length === 0) return 6 * 100;
  if (cs.length > 1) return 5 * 100 + cs.length;
  return COLOR_ORDER.indexOf(cs[0]!) * 100;
}

function sortValue(d: CardDef, by: SortKey): number | string {
  switch (by) {
    case "name":
      return d.name;
    case "mv":
      return d.cmc;
    case "power":
      return statValues(d, "power")[0] ?? -99;
    case "toughness":
      return statValues(d, "toughness")[0] ?? -99;
    case "rarity":
      return RARITIES[(d as CardDef & { rarity?: string }).rarity ?? ""] ?? -1;
    case "color":
      return colorRank(d);
    case "released":
      return released(d) ?? "";
    case "set":
      return (d as CardDef & { set?: string }).set ?? "";
  }
}

/** The cards matching `query`, in its order (ties by name). */
export function searchCards(cards: CardDef[], query: string | CardQuery): CardDef[] {
  const q = typeof query === "string" ? parseCardQuery(query) : query;
  const out = cards.filter(q.match);
  const dir = q.order.desc ? -1 : 1;
  return out.sort((a, b) => {
    const va = sortValue(a, q.order.by);
    const vb = sortValue(b, q.order.by);
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return c !== 0 ? c * dir : a.name.localeCompare(b.name);
  });
}

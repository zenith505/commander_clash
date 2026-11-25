// Deck lists as text: reading a pasted list (MTG Arena, Moxfield, Archidekt and plain "1 Card Name" lines) and writing
// one back out.

import type { CardDef } from "../types";
import { norm } from "./search";

export type DeckSection = "commander" | "main" | "side" | "maybe";

export interface DeckListEntry {
  count: number;
  name: string;
  section: DeckSection;
  /** The 1-based line it came from. */
  line: number;
}

const HEADERS: [RegExp, DeckSection | "skip"][] = [
  [/^commanders?$/i, "commander"],
  [/^(deck|main ?deck|main ?board|main|library|creatures?|spells?|lands?|instants?|sorcer(y|ies)|artifacts?|enchantments?|planeswalkers?|battles?|other|cards?)( \(\d+\))?$/i, "main"],
  [/^(sideboard|side)( \(\d+\))?$/i, "side"],
  [/^(maybe ?board|maybe|considering|tokens?|companion)( \(\d+\))?$/i, "maybe"],
  [/^about$/i, "skip"],
];

/** Read a pasted deck list into its entries, in order. Blank lines, comments and set codes are ignored. */
export function parseDeckList(text: string): DeckListEntry[] {
  const out: DeckListEntry[] = [];
  let section: DeckSection | "skip" = "main";
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.trim();
    if (!line) return;
    // "// Commander", "# Sideboard": a comment, or a section header written as one.
    const comment = /^(?:\/\/|#)\s*(.*)$/.exec(line);
    const header = (comment ? comment[1]! : line).replace(/:$/, "").trim();
    const h = HEADERS.find(([re]) => re.test(header));
    if (h) {
      section = h[1];
      return;
    }
    if (comment) return;
    if (section === "skip") {
      // MTG Arena's "About" section: "Name My Deck".
      if (/^name\s/i.test(line)) return;
      section = "main";
    }
    let where: DeckSection = section;
    // "SB: 1 Card" (old MTGO style).
    const sb = /^SB:\s*(.*)$/i.exec(line);
    if (sb) {
      line = sb[1]!;
      where = "side";
    }
    // Archidekt's "[Commander{top}]" / Moxfield-style "*CMDR*" marks a commander anywhere in the list.
    if (/\[[^\]]*commander[^\]]*\]|\*CMDR\*/i.test(line)) where = "commander";
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
    const count = m ? Number(m[1]) : 1;
    const name = cleanName(m ? m[2]! : line);
    if (name && count > 0) out.push({ count, name, section: where, line: i + 1 });
  });
  return out;
}

/** "Sol Ring (CMR) 263 *F*" -> "Sol Ring"; "Fire/Ice" -> "Fire // Ice". */
function cleanName(s: string): string {
  return s
    .replace(/\s*\[[^\]]*\]/g, "") // [Commander{top}], [CMR]
    .replace(/\s*\*[A-Z]+\*/gi, "") // *F*, *CMDR*, *E*
    .replace(/\s*\^[^^]*\^/g, "") // Archidekt's ^Have,#37d67a^ tags
    .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[A-Za-z0-9★-]+)?\s*$/, "") // (CMR) 263
    .replace(/\s*\/{1,2}\s*/g, " // ")
    .trim();
}

/** What a deck list comes to, with `lookup` finding each card by its name. */
export interface ResolvedDeckList {
  commanders: CardDef[];
  /** The main deck, a card once for each copy. */
  cards: CardDef[];
  /** Lines naming no card the lookup knows (misspelled, or a card the game doesn't support yet). */
  unknown: { name: string; line: number }[];
  /** How many sideboard or maybeboard cards were left out. */
  skipped: number;
}

/** A name lookup over `cards`: full names, and each face's name for a card with several (Delver of Secrets). */
export function cardNameIndex(cards: Iterable<CardDef>): (name: string) => CardDef | undefined {
  const byName = new Map<string, CardDef>();
  const byFace = new Map<string, CardDef>();
  for (const d of cards) {
    byName.set(norm(d.name), d);
    for (const f of d.faces ?? []) if (!byFace.has(norm(f.name))) byFace.set(norm(f.name), d);
    if (d.name.includes(" // ")) {
      const front = norm(d.name.split(" // ")[0]!);
      if (!byFace.has(front)) byFace.set(front, d);
    }
  }
  return (name) => {
    const n = norm(name.trim());
    return byName.get(n) ?? byFace.get(n) ?? byFace.get(n.split(" // ")[0]!);
  };
}

export function resolveDeckList(entries: DeckListEntry[], lookup: (name: string) => CardDef | undefined): ResolvedDeckList {
  const out: ResolvedDeckList = { commanders: [], cards: [], unknown: [], skipped: 0 };
  for (const e of entries) {
    if (e.section === "side" || e.section === "maybe") {
      out.skipped += e.count;
      continue;
    }
    const d = lookup(e.name);
    if (!d) {
      out.unknown.push({ name: e.name, line: e.line });
      continue;
    }
    if (e.section === "commander") out.commanders.push(d);
    else for (let k = 0; k < e.count; k++) out.cards.push(d);
  }
  return out;
}

/** A deck as text in MTG Arena's format, which Moxfield, Archidekt and this importer all read. */
export function formatDeckList(commanders: string[], cards: string[]): string {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  const lines = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([n, k]) => `${k} ${n}`);
  return [...(commanders.length ? ["Commander", ...commanders.map((c) => `1 ${c}`), ""] : []), "Deck", ...lines].join("\n");
}

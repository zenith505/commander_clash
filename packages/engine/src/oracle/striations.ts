// Striated text boxes: leveler cards (CR 711) and station cards (CR 721). Each level or station symbol is a static
// ability: "As long as this has [so many] counters on it, it has [abilities]" and, with a power/toughness box in its
// striation, base power and toughness (a leveler's, CR 711.2) or "is a creature with base power and toughness [P/T]
// in addition to its other types" (a station card's, CR 721.2b). Every line after a symbol is in its striation, up to
// the next symbol; lines before the first one are the card's other abilities (CR 711.4, 721.4).

import type { CompiledCard, StaticAbility, StaticCondition } from "../abilities";
import type { CardDef } from "../types";
import { keywordOf } from "./words";

export interface Striation {
  /** The symbol, as it was printed ("LEVEL 1-3", "8+"). */
  header: string;
  cond: StaticCondition;
  /** Base power and toughness while it applies; `creature`: a station card's, which also makes it a creature. */
  pt?: { power: number; toughness: number; creature?: true };
  lines: string[];
}

/**
 * The card's lines split into its other abilities (`base`) and its striations, or null if it has none. "fail" when its
 * text box doesn't read as one: a level symbol without a power/toughness line, a station card whose power and
 * toughness don't belong to a station symbol.
 */
export function striations(d: CardDef, lines: string[]): { base: string[]; parts: Striation[] } | "fail" | null {
  const base: string[] = [];
  const parts: Striation[] = [];
  const station = d.keywords.includes("Station");
  // "It's an artifact creature at 8+." (the station keyword's reminder text) names the striation with the P/T box.
  const creatureAt = /It's an artifact creature at (\d+)\+/.exec(d.oracleText)?.[1];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const level = /^LEVEL (\d+)(?:-(\d+)|\+)$/.exec(line);
    const sym = station ? /^(\d+)\+ \| (.+)$/.exec(line) : null;
    if (level) {
      // CR 711.2a-b: the level symbol's P/T box comes right after it in the text.
      const pt = /^(\d+)\/(\d+)$/.exec(lines[i + 1]?.trim() ?? "");
      if (!pt) return "fail";
      i++;
      const min = Number(level[1]);
      const cond: StaticCondition = { kind: "selfCounters", counter: "level", min, ...(level[2] ? { max: Number(level[2]) } : {}) };
      parts.push({ header: line, cond, pt: { power: Number(pt[1]), toughness: Number(pt[2]) }, lines: [] });
    } else if (sym) {
      const n = Number(sym[1]);
      const creature = creatureAt !== undefined && Number(creatureAt) === n;
      if (creature && !(/^\d+$/.test(d.power ?? "") && /^\d+$/.test(d.toughness ?? ""))) return "fail";
      parts.push({ header: `${n}+`, cond: { kind: "selfCounters", counter: "charge", min: n }, ...(creature ? { pt: { power: Number(d.power), toughness: Number(d.toughness), creature: true as const } } : {}), lines: [sym[2]!] });
    } else if (parts.length) parts[parts.length - 1]!.lines.push(lines[i]!);
    else base.push(lines[i]!);
  }
  if (!parts.length) return null;
  // A station card with a P/T box needs a symbol it belongs to (CR 721.2b); one without has none (721.2c).
  if (station && (d.power !== undefined || creatureAt !== undefined) && !parts.some((p) => p.pt)) return "fail";
  return { base, parts };
}

/** The keywords of a line that is only simple keywords ("Flying, trample"), or null. */
export function simpleKeywords(line: string): string[] | null {
  const parts = line.replace(/\.$/, "").split(/,\s*/);
  const kws = parts.map((p) => (/^[A-Za-z' -]+$/.test(p.trim()) ? keywordOf(p.trim()) : undefined));
  return kws.every((k): k is string => !!k) ? kws : null;
}

/**
 * Adds a striation's abilities to `out`, each one only while its condition holds. `compileLine` compiles one line of
 * rules text as a card with just that line. False if a line isn't a keyword line or one ability we can make
 * conditional (one that already has a condition of its own isn't).
 */
export function addStriation(part: Striation, out: CompiledCard, compileLine: (line: string) => CompiledCard, empty: CompiledCard): boolean {
  const cond = part.cond;
  const statics: StaticAbility[] = [];
  const add: Pick<CompiledCard, "triggers" | "activated" | "mana"> = { triggers: [], activated: [], mana: [] };
  const keywords: string[] = [];
  if (part.pt)
    statics.push({
      affects: { kind: "self" },
      mods: [...(part.pt.creature ? [{ kind: "addTypes" as const, types: ["Creature"], subtypes: [] }] : []), { kind: "setPT", power: part.pt.power, toughness: part.pt.toughness }],
      condition: cond,
      text: `${part.header}: ${part.pt.creature ? "it's a creature with base power and toughness" : "base power and toughness"} ${part.pt.power}/${part.pt.toughness}`,
    });
  const lists = ["triggers", "activated", "mana", "statics"] as const;
  const rest = (c: CompiledCard) => JSON.stringify(Object.entries(c).filter(([k]) => !(lists as readonly string[]).includes(k) && k !== "textKeywords").sort(([a], [b]) => a.localeCompare(b)));
  for (const line of part.lines) {
    const kws = simpleKeywords(line.trim());
    if (kws) {
      keywords.push(...kws);
      statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: kws }], condition: cond, text: `${part.header}: ${line.trim()}` });
      continue;
    }
    const inner = compileLine(line);
    if (inner.unsupported.length || rest(inner) !== rest(empty)) return false;
    for (const st of inner.statics) {
      if (st.condition) return false;
      statics.push({ ...st, condition: cond });
    }
    for (const t of inner.triggers) {
      if (t.activeIf) return false;
      add.triggers.push({ ...t, activeIf: cond });
    }
    for (const ab of inner.activated) {
      if (ab.activateIf) return false;
      add.activated.push({ ...ab, activateIf: cond });
    }
    for (const m of inner.mana) {
      if (m.activeIf) return false;
      add.mana.push({ ...m, activeIf: cond });
    }
  }
  out.statics.push(...statics);
  out.triggers.push(...add.triggers);
  out.activated.push(...add.activated);
  out.mana.push(...add.mana);
  if (keywords.length) out.striatedKeywords = [...(out.striatedKeywords ?? []), ...keywords];
  return true;
}

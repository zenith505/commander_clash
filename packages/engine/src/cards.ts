import type { CompiledCard, ManaAbility } from "./abilities";
import { characteristics, printedKeywords, type PTPart } from "./layers";
import { compileCard } from "./oracle";
import { COLORS, type CardDef, type Color, type GameObject, type GameState, type ManaType } from "./types";
import { parseManaCost } from "./mana";

export { SUPPORTED_KEYWORDS, stripReminder, type SupportedKeyword } from "./keywords";
import { SUPPORTED_KEYWORDS, stripReminder, type SupportedKeyword } from "./keywords";

const BASIC_LAND_MANA: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

export const defOf = (s: GameState, o: GameObject): CardDef => {
  const d = s.cards[o.cardId];
  if (!d) throw new Error(`missing card def ${o.cardId}`);
  return d;
};

export const isType = (d: CardDef, t: string) => d.types.includes(t);

/** "Name: ability text", with the card's name where the text says "~" (itself). */
export const describeAbility = (d: CardDef, text: string) => `${d.name}: ${text.replace(/~/g, d.name)}`;
export const isPermanentCard = (d: CardDef) =>
  ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].some((t) => d.types.includes(t));
export const hasKeyword = (d: CardDef, k: SupportedKeyword) => d.keywords.some((x) => x.toLowerCase() === k.toLowerCase());

export function basePower(d: CardDef): number {
  return Number.parseInt(d.power ?? "0", 10) || 0;
}
export function baseToughness(d: CardDef): number {
  return Number.parseInt(d.toughness ?? "0", 10) || 0;
}
/** Current power and toughness, after all continuous effects and counters (CR 613.4). */
export const power = (s: GameState, o: GameObject) => characteristics(s, o).power;
export const toughness = (s: GameState, o: GameObject) => characteristics(s, o).toughness;

/** Is this object of card type `t` right now (after type-changing effects)? */
export const objIsType = (s: GameState, o: GameObject, t: string) => characteristics(s, o).types.includes(t);

/** Does this permanent have keyword `k` right now (printed, granted, or not lost)? */
export function objHasKeyword(s: GameState, o: GameObject, k: SupportedKeyword | string): boolean {
  return characteristics(s, o).keywords.some((x) => x.toLowerCase() === k.toLowerCase());
}

const NO_ABILITIES: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };

/** The abilities an object has right now: its card's, unless an effect removed them (CR 613.1f). */
export function abilitiesOf(s: GameState, o: GameObject): CompiledCard {
  return characteristics(s, o).hasPrintedAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES;
}

/** How a permanent differs from its printed card right now, for display. */
export interface Modifications {
  /** Net +1/+1 counters (negative when -1/-1 counters dominate). */
  plusCounters: number;
  /** Other counters by kind (loyalty, charge, ...). */
  otherCounters: Record<string, number>;
  /** Net P/T change from effects (not counters) that add or subtract. */
  effectPower: number;
  effectToughness: number;
  /** Some of that change ends at end of turn. */
  temporary: boolean;
  /** Power/toughness were set or switched by an effect. */
  setOrSwitched: boolean;
  /** Each step, for tooltips. */
  pt: PTPart[];
  /** Keywords it has that the printed card doesn't. */
  grantedKeywords: string[];
  /** Printed keywords it no longer has. */
  lostKeywords: string[];
  lostAllAbilities: boolean;
}

export function modifications(s: GameState, o: GameObject): Modifications {
  const d = defOf(s, o);
  const c = characteristics(s, o);
  const has = (list: string[], k: string) => list.some((x) => x.toLowerCase() === k.toLowerCase());
  const otherCounters: Record<string, number> = {};
  for (const [k, n] of Object.entries(o.counters)) if (n > 0 && k !== "+1/+1" && k !== "-1/-1") otherCounters[k] = n;
  const mods = c.pt.filter((p) => p.kind === "modify");
  return {
    plusCounters: (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0),
    otherCounters,
    effectPower: mods.reduce((n, p) => n + p.power, 0),
    effectToughness: mods.reduce((n, p) => n + p.toughness, 0),
    temporary: c.pt.some((p) => p.untilEndOfTurn && p.kind !== "counters"),
    setOrSwitched: c.pt.some((p) => p.kind === "set" || p.kind === "switch"),
    pt: c.pt,
    grantedKeywords: c.keywords.filter((k) => !has(printedKeywords(d), k)),
    lostKeywords: printedKeywords(d).filter((k) => SUPPORTED_KEYWORDS.some((x) => x.toLowerCase() === k.toLowerCase()) && !has(c.keywords, k)),
    lostAllAbilities: !c.hasPrintedAbilities,
  };
}

/**
 * Colors of mana a card can make with its own mana abilities, without paying mana: its basic
 * land types' abilities (CR 305.6) and its printed ones.
 */
export function manaAbilities(d: CardDef): ManaType[] {
  const out = new Set<ManaType>();
  for (const st of d.subtypes) {
    const c = BASIC_LAND_MANA[st];
    if (c) out.add(c);
  }
  for (const ab of compileCard(d).mana) {
    if (ab.manaCost) continue;
    if (ab.produces.kind === "fixed") ab.produces.mana.forEach((m) => out.add(m));
    else if (ab.produces.kind === "oneOf") ab.produces.options.forEach((m) => out.add(m));
    else COLORS.forEach((c) => out.add(c));
  }
  return [...out];
}

/** The intrinsic "{T}: Add [mana]." of a basic land type (CR 305.6). */
export const basicLandManaAbility = (subtype: string): ManaAbility | null => {
  const c = BASIC_LAND_MANA[subtype];
  return c ? { text: `{T}: Add {${c}}.`, manaCost: "", tap: true, sacrificeSelf: false, produces: { kind: "fixed", mana: [c] } } : null;
};

/** Split a Scryfall type line ("Legendary Creature — Elf Druid") into its parts. CR 205 */
export function parseTypeLine(typeLine: string): Pick<CardDef, "supertypes" | "types" | "subtypes"> {
  const front = typeLine.split(" // ")[0] ?? "";
  const [left = "", right = ""] = front.split(" — ");
  const SUPER = ["Legendary", "Basic", "Snow", "World", "Ongoing", "Host"];
  const words = left.trim().split(/\s+/).filter(Boolean);
  return {
    supertypes: words.filter((w) => SUPER.includes(w)),
    types: words.filter((w) => !SUPER.includes(w)),
    subtypes: right.trim().split(/\s+/).filter(Boolean),
  };
}

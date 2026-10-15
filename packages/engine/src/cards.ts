import type { CompiledCard, ManaAbility } from "./abilities";
import { characteristics, printedKeywords, type PTPart } from "./layers";
import { compileCard, compileGranted } from "./oracle";
import { COLORS, type CardDef, type Color, type GameObject, type GameState, type ManaType } from "./types";
import { manaValue, parseManaCost } from "./mana";

/** The creature this one is paired with (CR 702.95b), if the pair still stands. See checkPairs for when it breaks. */
export function pairedWith(s: GameState, o: GameObject): GameObject | undefined {
  const p = o.paired;
  if (!p || o.zone !== "battlefield") return undefined;
  const other = s.objects[p.id];
  return other && other.zone === "battlefield" && (other.zoneChanges ?? 0) === p.zc && other.paired?.id === o.id ? other : undefined;
}

export { SUPPORTED_KEYWORDS, stripReminder, type SupportedKeyword } from "./keywords";
import { canonicalKeyword, SUPPORTED_KEYWORDS, stripReminder, subtypeSet, type SupportedKeyword } from "./keywords";

const BASIC_LAND_MANA: Record<string, Color> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

/**
 * What a face-down spell or permanent is (CR 708.2a): a 2/2 creature with no text, no name, no
 * subtypes and no mana cost; with disguise, also ward {2} (CR 702.168a). Colorless, mana value 0.
 * These are its copiable values (CR 613.2b): everything else still applies on top.
 */
const faceDownCard = (oracleId: string, ward: boolean): CardDef => ({
  oracleId,
  name: "Face-down creature",
  manaCost: "",
  cmc: 0,
  typeLine: "Creature",
  supertypes: [],
  types: ["Creature"],
  subtypes: [],
  oracleText: ward ? "Ward {2}" : "",
  power: "2",
  toughness: "2",
  colors: [],
  colorIdentity: [],
  keywords: ward ? ["Ward"] : [],
});
export const FACE_DOWN = faceDownCard("face-down", false);
export const FACE_DOWN_WARD = faceDownCard("face-down-ward", true);

/**
 * Its copiable values before face-down status (CR 613.2a): the latest copy effect that began after it entered
 * (CR 707.4), or what it entered as a copy of (CR 707.5), or its own card.
 */
const copiedId = (o: GameObject): string => o.copyEffects?.[o.copyEffects.length - 1]?.key ?? o.copyOf ?? o.cardId;

/** Its definition's key: face-down values (layer 1b, CR 613.2b), or what it's a copy of (layer 1a), or its own card. */
export const cardIdOf = (o: GameObject): string => (o.faceDown ? (o.faceDown === "disguise" ? FACE_DOWN_WARD.oracleId : FACE_DOWN.oracleId) : copiedId(o));

/** The card definition an object uses right now: its own, what it copies, or a face-down one (CR 613.2, 708.2). */
export const defOf = (s: GameState, o: GameObject): CardDef => {
  if (o.faceDown) return o.faceDown === "disguise" ? FACE_DOWN_WARD : FACE_DOWN;
  const d = s.cards[copiedId(o)];
  if (!d) throw new Error(`missing card def ${copiedId(o)}`);
  return o.bestowed ? bestowedDef(d) : o.prototyped ? prototypedDef(d) : d;
};

const prototyped = new Map<string, CardDef>();

/**
 * A prototyped spell or permanent (CR 718.3b): the card with its alternative mana cost, power and toughness, and the
 * colors of that mana cost (CR 105.2). These are copiable values (718.2a), so copies of it are the same.
 */
export function prototypedDef(d: CardDef): CardDef {
  const hit = prototyped.get(d.oracleId);
  if (hit) return hit;
  const m = /^Prototype ((?:\{[^}]+\})+) — (\d+)\/(\d+)/m.exec(d.oracleText);
  if (!m) return d;
  const cost = m[1]!;
  const colors = (["W", "U", "B", "R", "G"] as Color[]).filter((c) => [...cost.matchAll(/\{([^}]+)\}/g)].some((x) => x[1]!.split("/").includes(c)));
  const out: CardDef = { ...d, oracleId: `${d.oracleId}|prototyped`, manaCost: cost, cmc: manaValue(parseManaCost(cost)), power: m[2]!, toughness: m[3]!, colors };
  prototyped.set(d.oracleId, out);
  return out;
}

const bestowed = new Map<string, CardDef>();

/**
 * What a bestowed spell or permanent is (CR 702.103b): an Aura enchantment with enchant creature, not a creature. Its
 * creature types go with the creature type (CR 205.1a), and so do its power and toughness. This isn't a copiable
 * value (CR 707.2), so copies of it use the card itself (`cardIdOf`).
 */
export function bestowedDef(d: CardDef): CardDef {
  const hit = bestowed.get(d.oracleId);
  if (hit) return hit;
  const types = d.types.filter((t) => t !== "Creature");
  const subtypes = [...d.subtypes.filter((t) => subtypeSet(t) !== "Creature"), "Aura"];
  const { power: _p, toughness: _t, ...rest } = d;
  const out: CardDef = {
    ...rest,
    oracleId: `${d.oracleId}|bestowed`,
    types,
    subtypes,
    typeLine: `${[...d.supertypes, ...types].join(" ")} — ${subtypes.join(" ")}`,
    oracleText: `Enchant creature\n${d.oracleText}`,
  };
  bestowed.set(d.oracleId, out);
  return out;
}

/**
 * What a face-down permanent will be once turned face up: its card, or what a copy effect made it a copy of while
 * face down, whose morph cost (if any) turns it face up (CR 707.3, examples).
 */
export const faceUpDefOf = (s: GameState, o: GameObject): CardDef => s.cards[copiedId(o)]!;

/** The card itself, face up: what its owner (or controller, while it's face down, CR 708.5) sees. */
export const realDefOf = (s: GameState, o: GameObject): CardDef => s.cards[o.cardId]!;

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

export const NO_ABILITIES: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };

/**
 * The abilities an object has right now: its card's, unless an effect removed them, then the ones effects
 * gave it (CR 613.1f).
 */
export function abilitiesOf(s: GameState, o: GameObject): CompiledCard {
  const c = characteristics(s, o);
  return withGranted(c.hasPrintedAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, c.grantedAbilities);
}

const merged = new WeakMap<CompiledCard, Map<string, CompiledCard>>();
/** A card's abilities plus granted ones (`grantedAbilities` texts), after them in that order. */
export function withGranted(base: CompiledCard, granted: readonly string[]): CompiledCard {
  if (!granted.length) return base;
  const key = granted.join("\u0000");
  let byKey = merged.get(base);
  if (!byKey) merged.set(base, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit) {
    const extra = granted.map(compileGranted);
    hit = {
      ...base,
      triggers: [...base.triggers, ...extra.flatMap((x) => x.triggers)],
      activated: [...base.activated, ...extra.flatMap((x) => x.activated)],
      mana: [...base.mana, ...extra.flatMap((x) => x.mana)],
    };
    byKey.set(key, hit);
  }
  return hit;
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
  /** Quoted abilities effects gave it ("~" is this permanent). */
  grantedAbilities: string[];
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
    lostKeywords: printedKeywords(d).filter((k) => !!canonicalKeyword(k) && !has(c.keywords, k)),
    grantedAbilities: c.grantedAbilities,
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

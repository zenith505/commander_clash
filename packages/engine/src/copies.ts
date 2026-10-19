// Copiable values (CR 707): clones, token copies. A copy's characteristics are a card definition of their
// own, registered in GameState.cards, so everything that reads an object's definition (its name, types,
// power and toughness, abilities compiled from its rules text) sees the copied values (layer 1, CR 613.2).

import { defOf } from "./cards";
import { invalidateCharacteristics } from "./layers";
import type { CardDef, Color, CopyEffect, GameObject, GameState } from "./types";

/**
 * Exceptions to a copy (CR 707.9): "except it isn't legendary", "except it's a 1/1 Spirit in addition to its
 * other types", "except it has haste". They become part of the copy's copiable values (707.9b).
 */
export interface CopyExcept {
  notLegendary?: boolean;
  legendary?: boolean;
  /** "In addition to its other types". */
  addTypes?: string[];
  addSubtypes?: string[];
  /** "Except it's 1/1", "it's a 4/4 black Zombie": base power and toughness (CDAs for them aren't copied, 707.9d). */
  pt?: [number, number];
  colors?: Color[];
  /** "Except its name is ~". */
  name?: string;
  /** Embalm and eternalize: "has no mana cost". */
  noManaCost?: boolean;
  /** Keywords it has ("haste"), and other rules text ("At the beginning of the end step, sacrifice ~."). */
  keywords?: string[];
  text?: string[];
  /** "It doesn't copy that creature's color": it keeps the colors it had (CR 707.9c); set to them as the copy begins. */
  keepColors?: boolean;
  /** "It has this ability": the ability's own text, added to `text` when the card is compiled (CR 707.9a). */
  thisAbility?: boolean;
}

/** The copiable values of `o` now (CR 707.2): its definition as modified by copy effects, or face-down values. */
export function copiableDef(s: GameState, o: GameObject): CardDef {
  return defOf(s, o);
}

/** Register the definition a copy of `base` with these exceptions has, and return its key in GameState.cards. */
export function copyKey(s: GameState, base: CardDef, except?: CopyExcept): string {
  // A copy of a face isn't that card's face: a copy of a nonmodal double-faced card's back face has mana value 0 (CR
  // 712.8e).
  if (base.faceOf) {
    const { faceOf: _, ...plain } = base;
    base = { ...plain, oracleId: `${base.oracleId}|copied` };
  }
  if (!except || !Object.keys(except).length) {
    s.cards[base.oracleId] ??= base;
    return base.oracleId;
  }
  const key = `${base.oracleId}|copy:${JSON.stringify(except)}`;
  if (s.cards[key]) return key;
  const supertypes = base.supertypes.filter((t) => !(except.notLegendary && t === "Legendary"));
  if (except.legendary && !supertypes.includes("Legendary")) supertypes.push("Legendary");
  const types = [...base.types, ...(except.addTypes ?? []).filter((t) => !base.types.includes(t))];
  const subtypes = [...base.subtypes, ...(except.addSubtypes ?? []).filter((t) => !base.subtypes.includes(t))];
  const keywords = [...base.keywords, ...(except.keywords ?? []).filter((k) => !base.keywords.includes(k))];
  const name = except.name ?? base.name;
  // "~" in an added ability is the copy itself (CR 707.9a).
  const text = [base.oracleText, ...(except.keywords?.length ? [except.keywords.join(", ")] : []), ...(except.text ?? []).map((x) => x.replace(/~/g, name))].filter(Boolean).join("\n");
  const typeLine = `${[...supertypes, ...types].join(" ")}${subtypes.length ? ` — ${subtypes.join(" ")}` : ""}`;
  const def: CardDef = {
    ...base,
    oracleId: key,
    name,
    supertypes,
    types,
    subtypes,
    typeLine,
    keywords,
    oracleText: text,
    ...(except.pt ? { power: String(except.pt[0]), toughness: String(except.pt[1]) } : {}),
    ...(except.colors ? { colors: except.colors } : {}),
    ...(except.noManaCost ? { manaCost: "", cmc: 0 } : {}),
  };
  s.cards[key] = def;
  return key;
}

/**
 * The exceptions as they apply to `o` becoming a copy now: "its name is ~" is its own name, "it doesn't copy that
 * creature's color" keeps the colors it has before this copy effect (CR 707.9c).
 */
export function exceptFor(s: GameState, o: GameObject, except: CopyExcept | undefined, ownName: string): CopyExcept | undefined {
  if (!except) return undefined;
  const { keepColors, thisAbility: _, ...rest } = except;
  return { ...rest, ...(rest.name === "~" ? { name: ownName } : {}), ...(keepColors ? { colors: [...defOf(s, o).colors] } : {}) };
}

/**
 * `o` becomes a copy of these values while it stays on the battlefield (CR 707.4): a copy effect with a new
 * timestamp, which overwrites the copiable values earlier ones gave it (CR 613.2a, 613.7). Nothing enters or
 * leaves, and other effects on it keep applying.
 */
export function addCopyEffect(s: GameState, o: GameObject, key: string, until?: CopyEffect["until"]) {
  (o.copyEffects ??= []).push({ key, timestamp: s.nextTimestamp++, ...(until ? { until } : {}) });
  invalidateCharacteristics(s);
}

/** End the copy effects `ends` says are over (their duration ran out). */
export function endCopyEffects(s: GameState, ends: (e: CopyEffect) => boolean) {
  let changed = false;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (!o.copyEffects?.some(ends)) continue;
    const kept = o.copyEffects.filter((e) => !ends(e));
    o.copyEffects = kept.length ? kept : undefined;
    changed = true;
  }
  if (changed) invalidateCharacteristics(s);
}

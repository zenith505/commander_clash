// Copiable values (CR 707): clones, token copies. A copy's characteristics are a card definition of their
// own, registered in GameState.cards, so everything that reads an object's definition (its name, types,
// power and toughness, abilities compiled from its rules text) sees the copied values (layer 1, CR 613.2).

import { defOf } from "./cards";
import type { CardDef, Color, GameObject, GameState } from "./types";

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
}

/** The copiable values of `o` now (CR 707.2): its definition as modified by copy effects, or face-down values. */
export function copiableDef(s: GameState, o: GameObject): CardDef {
  return defOf(s, o);
}

/** Register the definition a copy of `base` with these exceptions has, and return its key in GameState.cards. */
export function copyKey(s: GameState, base: CardDef, except?: CopyExcept): string {
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

/** Make `o` a copy of these values (CR 707.2): as it enters (707.5), or "becomes a copy" (707.4). */
export function becomeCopy(s: GameState, o: GameObject, key: string) {
  o.copyOf = key;
}

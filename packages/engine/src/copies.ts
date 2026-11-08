// Copiable values (CR 707): clones, token copies. A copy's characteristics are a card definition of their
// own, registered in GameState.cards, so everything that reads an object's definition (its name, types,
// power and toughness, abilities compiled from its rules text) sees the copied values (layer 1, CR 613.2).

import { defOf, lockIfRoom, ownDefOf, prototypedDef, realDefOf } from "./cards";
import { unroomed } from "./faces";
import { subtypeSet } from "./keywords";
import { invalidateCharacteristics } from "./layers";
import type { CardDef, CardFace, Color, CopyEffect, GameObject, GameState } from "./types";

/**
 * Exceptions to a copy (CR 707.9): "except it isn't legendary", "except it's a 1/1 Spirit in addition to its
 * other types", "except it has haste". They become part of the copy's copiable values (707.9b).
 */
export interface CopyExcept {
  /** "Except it has vanishing 3 if that creature doesn't have vanishing" (Flesh Duplicate): `text` only for a copy of one without this keyword. */
  unlessHas?: string;
  notLegendary?: boolean;
  legendary?: boolean;
  /** Moritte of the Frost: "it's legendary and snow in addition to its other types" (the snow supertype, CR 205.4a). */
  snow?: boolean;
  /**
   * Moritte of the Frost: "if it's a creature, it ... has changeling": these keywords only for a copy that's a creature
   * as it enters (rulings: judged by its characteristics then); game.ts enterAsCopy turns them into `keywords`.
   */
  keywordsIfCreature?: string[];
  /**
   * Hulking Metamorph: "its power and toughness are equal to this creature's power and toughness": the entering
   * permanent's own printed ones, its prototype's if it was cast prototyped (rulings); exceptFor turns it into `pt`.
   */
  ptOwn?: boolean;
  /** "Its starting loyalty is 1" (Jace, Mirror Mage): the printed loyalty of a copy of a planeswalker (CR 306.5b, 707.9b). */
  loyalty?: number;
  /**
   * "Except it's a 4/4 black Zombie": these creature types instead of its other ones (CR 205.1a, rulings on God-Pharaoh's
   * Gift); "a 6/6 green Dinosaur creature": these card types instead of its other ones.
   */
  setTypes?: string[];
  setSubtypes?: string[];
  /** "In addition to its other types". */
  addTypes?: string[];
  addSubtypes?: string[];
  /** "Except it's 1/1", "it's a 4/4 black Zombie": base power and toughness (CDAs for them aren't copied, 707.9d). */
  pt?: [number, number];
  colors?: Color[];
  /** "Except it's a 4/4 black Zombie in addition to its other colors and types" (Lazotep Convert): these colors too. */
  addColors?: Color[];
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
  /**
   * "Except it enters with an additional +1/+1 counter on it if it's a creature" (Spark Double, Littjara Mirrorlake): a
   * replacement effect on its entering (CR 614.1c), not a copiable value, so it isn't part of the copy. `ifType`: only if
   * it is that card type as it enters, as a copy (rulings).
   */
  enterCounters?: { counter: string; /** Moritte of the Frost: "two additional +1/+1 counters" (1 if left out). */ n?: number; ifType?: string; /** "Except it enters with X additional +1/+1 counters on it" (Altered Ego): the X of the spell it was, 0 if it wasn't cast (CR 107.3m). */ x?: true; /** Undercover Operative: "except it enters with a shield counter on it if you control that creature" (the copied creature, as it enters). */ ifYouControl?: true }[];
  /**
   * "Except their power is half that creature's power and their toughness is half that creature's toughness. Round up
   * each time." (Saw in Half): base power and toughness, half the copied creature's as it last existed (rulings), worked
   * out as the tokens are created (run-tokens.ts), then `pt`.
   */
  halfPT?: "up" | "down";
}

/** The copiable values of `o` now (CR 707.2): its definition as modified by copy effects, or face-down values. */
export function copiableDef(s: GameState, o: GameObject): CardDef {
  return ownDefOf(s, o);
}

/** Register the definition a copy of `base` with these exceptions has, and return its key in GameState.cards. */
export function copyKey(s: GameState, base: CardDef, except?: CopyExcept): string {
  base = unroomed(s.cards, base);
  // A copy of a face isn't that card's face: a copy of a nonmodal double-faced card's back face has mana value 0 (CR
  // 712.8e).
  // A copy of a melded permanent isn't one: its mana value is 0 (CR 202.3c, 712.8g).
  if (base.faceOf || base.meld?.result === base.name) {
    const { faceOf: _, meld: __, ...plain } = base;
    base = { ...plain, oracleId: `${base.oracleId}|copied` };
  }
  if (!except || !Object.keys(except).length) {
    s.cards[base.oracleId] ??= base;
    return base.oracleId;
  }
  const key = `${base.oracleId}|copy:${JSON.stringify(except)}`;
  if (s.cards[key]) return key;
  s.cards[key] = { ...base, ...excepted(base, except), oracleId: key, ...(base.faces ? { faces: exceptedFaces(base, except) } : {}) };
  return key;
}

/**
 * The faces of a copy of a card with several (a game's definition has its characteristics from them, faces.ts
 * restingDef): the exceptions change both faces of a double-faced card (rulings on Soul Separator), both halves of a
 * split card (CR 709.4) and a flip card's flipped half (710.1c), but not an Adventure or a prepare spell (rulings on
 * prepare: a copy's exceptions don't reach its prepare spell).
 */
function exceptedFaces(base: CardDef, except: CopyExcept | undefined): CardFace[] {
  const all = base.layout === "transform" || base.layout === "modal_dfc" || base.layout === "split" || base.layout === "flip";
  return base.faces!.map((f, i) => {
    if (!except || !Object.keys(except).length || (i > 0 && !all)) return { ...f };
    const { cmc: _, ...x } = excepted({ ...f, keywords: f.keywords ?? [] }, except);
    return { ...f, ...x };
  });
}

/** A card's or face's characteristics with a copy's exceptions applied (CR 707.9b). */
function excepted<T extends Pick<CardDef, "name" | "supertypes" | "types" | "subtypes" | "typeLine" | "oracleText" | "colors" | "manaCost"> & { keywords?: string[] }>(base: T, except: CopyExcept): Partial<T> & { cmc?: number } {
  const supertypes = base.supertypes.filter((t) => !(except.notLegendary && t === "Legendary"));
  if (except.legendary && !supertypes.includes("Legendary")) supertypes.push("Legendary");
  if (except.snow && !supertypes.includes("Snow")) supertypes.push("Snow");
  const baseTypes = except.setTypes ?? base.types;
  // Subtypes of card types it no longer has go, and set subtypes replace those of the same kind (CR 205.1a).
  const sets = new Set((except.setSubtypes ?? []).map(subtypeSet));
  const baseSubtypes = [...base.subtypes.filter((st) => { const k = subtypeSet(st); return !sets.has(k) && (!except.setTypes || (k !== null && k !== "Spell" && baseTypes.includes(k))); }), ...(except.setSubtypes ?? [])];
  const types = [...baseTypes, ...(except.addTypes ?? []).filter((t) => !baseTypes.includes(t))];
  const subtypes = [...baseSubtypes, ...(except.addSubtypes ?? []).filter((t) => !baseSubtypes.includes(t))];
  const keywords = [...(base.keywords ?? []), ...(except.keywords ?? []).filter((k) => !base.keywords?.includes(k))];
  const name = except.name ?? base.name;
  // "~" in an added ability is the copy itself (CR 707.9a).
  // A copy whose exception sets its colors doesn't copy a characteristic-defining ability for them (CR 707.9d): "~ is all colors".
  // So does one whose exception sets its power and toughness, for theirs (Soul Separator's rulings: a copy of Sage of
  // Ancient Lore is still 1/1).
  const esc = base.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ptCda = new RegExp(`^(?:${esc}|This creature|This Vehicle)'s (?:power|toughness)\\b[^.]* (?:is|are each) equal to `);
  const own = base.oracleText.split("\n").filter((l) => !(except.colors && / is all colors\./.test(l)) && !(except.pt && ptCda.test(l))).join("\n");
  const lacks = !except.unlessHas || (!(base.keywords ?? []).includes(except.unlessHas) && !new RegExp(`^${except.unlessHas}\\b`, "mi").test(base.oracleText));
  const text = [own, ...(except.keywords?.length ? [except.keywords.join(", ")] : []), ...(lacks ? (except.text ?? []) : []).map((x) => x.replace(/~/g, name))].filter(Boolean).join("\n");
  const typeLine = `${[...supertypes, ...types].join(" ")}${subtypes.length ? ` — ${subtypes.join(" ")}` : ""}`;
  return {
    name,
    supertypes,
    types,
    subtypes,
    typeLine,
    keywords,
    oracleText: text,
    // "Except it's 4/3" (Mindlink Mech): only for a copy whose copiable values make it a creature or a Vehicle; a copy of
    // anything else has no power and toughness to set (rulings on Mindlink Mech: crewed by a permanent that isn't
    // normally a creature or Vehicle, it's 0/0).
    ...(except.pt && (types.includes("Creature") || base.subtypes.includes("Vehicle")) ? { power: String(except.pt[0]), toughness: String(except.pt[1]) } : {}),
    ...(except.colors ? { colors: except.colors } : except.addColors ? { colors: [...base.colors, ...except.addColors.filter((c) => !base.colors.includes(c))] } : {}),
    ...(except.noManaCost ? { manaCost: "", cmc: 0 } : {}),
    ...(except.loyalty !== undefined && types.includes("Planeswalker") ? { loyalty: String(except.loyalty) } : {}),
  } as Partial<T> & { cmc?: number };
}

/** A transforming or modal double-faced card (CR 712.1): a copy of one made as a token has both faces (707.8a). */
const isDfc = (d: CardDef | undefined): d is CardDef => !!d?.faces && d.faces.length === 2 && (d.layout === "transform" || d.layout === "modal_dfc");

/**
 * The card a token copy of `base` is (CR 707.8a): a copy of a double-faced permanent or card is a double-faced token,
 * each face a copy of that face with the exceptions applied to both (rulings on Soul Separator), entering with the
 * same face up. Its back face, a copy of a back face, has mana value 0 (CR 202.3b). Anything else: copyKey.
 */
export function tokenCopyKey(s: GameState, base: CardDef, except0?: CopyExcept): { key: string; face?: number } {
  base = unroomed(s.cards, base);
  // Counters it enters with aren't copiable values (see CopyExcept.enterCounters).
  const { enterCounters: _c, ...rest } = except0 ?? {};
  const except = except0 ? rest : undefined;
  const whole = base.faceOf ? s.cards[base.faceOf.oracleId] : base;
  if (!isDfc(whole) || (base.faceOf && !isDfc(s.cards[base.faceOf.oracleId]))) return { key: copyKey(s, base, except) };
  const face = base.faceOf?.face;
  const key = `${whole.oracleId}|dfcCopy:${JSON.stringify(except ?? {})}`;
  if (!s.cards[key]) {
    const ex = except && Object.keys(except).length ? except : undefined;
    s.cards[key] = { ...whole, ...(ex ? excepted(whole, ex) : {}), oracleId: key, faces: exceptedFaces(whole, ex), dfcCopy: true };
  }
  return { key, ...(face ? { face } : {}) };
}

/**
 * The exceptions as they apply to `o` becoming a copy now: "its name is ~" is its own name, "it doesn't copy that
 * creature's color" keeps the colors it has before this copy effect (CR 707.9c).
 */
export function exceptFor(s: GameState, o: GameObject, except: CopyExcept | undefined, ownName: string): CopyExcept | undefined {
  if (!except) return undefined;
  const { keepColors, thisAbility: _, enterCounters: _c, ptOwn, ...rest } = except;
  // Hulking Metamorph: its own printed power and toughness, the prototype's if it was cast prototyped (CR 718.3b).
  const own = ptOwn ? (o.prototyped ? prototypedDef(realDefOf(s, o)) : realDefOf(s, o)) : undefined;
  const pt: [number, number] | undefined = own ? [Number(own.power), Number(own.toughness)] : undefined;
  return { ...rest, ...(rest.name === "~" ? { name: ownName } : {}), ...(keepColors ? { colors: [...defOf(s, o).colors] } : {}), ...(pt && pt.every((n) => Number.isFinite(n)) ? { pt } : {}) };
}

/**
 * `o` becomes a copy of these values while it stays on the battlefield (CR 707.4): a copy effect with a new
 * timestamp, which overwrites the copiable values earlier ones gave it (CR 613.2a, 613.7). Nothing enters or
 * leaves, and other effects on it keep applying.
 */
export function addCopyEffect(s: GameState, o: GameObject, key: string, until?: CopyEffect["until"]) {
  (o.copyEffects ??= []).push({ key, timestamp: s.nextTimestamp++, ...(until ? { until } : {}) });
  lockIfRoom(s, o);
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

/**
 * The counters a copy enters with because of its exceptions (CopyExcept.enterCounters): "an additional +1/+1 counter on it
 * if it's a creature", as it would exist on the battlefield (`isA`: whether it has that card type then).
 */
export function copyEnterCounters(except: CopyExcept | undefined, isA: (type: string) => boolean, x = 0, youControl = false): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of except?.enterCounters ?? []) if ((!c.ifType || isA(c.ifType)) && (!c.x || x > 0) && (!c.ifYouControl || youControl)) out[c.counter] = (out[c.counter] ?? 0) + (c.x ? x : (c.n ?? 1));
  return out;
}

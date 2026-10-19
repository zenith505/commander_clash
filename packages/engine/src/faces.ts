// Cards with more than one face: split cards (CR 709), flip cards (710), double-faced cards (712), adventurer cards
// (715) and preparation cards (722). The card's definition keeps every face (CardDef.faces); each face has a
// definition of its own, registered in GameState.cards under faceKey, which an object uses while that face is up
// (GameObject.face). Anywhere else the card has its resting characteristics (restingDef).

import { manaValue, parseManaCost } from "./mana";
import { COLORS, type CardDef, type CardFace, type GameObject, type GameState } from "./types";

/** The key a face's definition has in GameState.cards. */
export const faceKey = (oracleId: string, face: number) => `${oracleId}|face:${face}`;

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The card's keywords (Scryfall lists the whole card's) that this face's text has: at the start of a line or in a list. */
const keywordsIn = (all: string[], text: string) => all.filter((k) => new RegExp(`(?:^|\\n|, )${esc(k)}\\b`, "i").test(text));
const faceKeywords = (d: CardDef, f: CardFace) => f.keywords ?? keywordsIn(d.keywords, f.oracleText);
const mv = (cost: string) => manaValue(parseManaCost(cost));

const faceDefs = new Map<string, CardDef>();

/**
 * One face of a card with several, with only that face's characteristics: a split card's half on the stack (CR 709.3b),
 * a flipped permanent (710.1b), a double-faced spell or permanent with that face up (712.8c-f), an Adventure spell
 * (715.3b). The card's color identity stays the whole card's (CR 903.4).
 */
export function faceDef(d: CardDef, i: number): CardDef {
  const key = faceKey(d.oracleId, i);
  const hit = faceDefs.get(key);
  if (hit) return hit;
  const faces = d.faces!;
  const f = faces[i]!;
  // A flip card's color and mana cost don't change when it flips (CR 710.1c).
  const flip = d.layout === "flip";
  const manaCost = flip ? faces[0]!.manaCost : f.manaCost;
  // A nonmodal double-faced permanent's back face has its front face's mana value (CR 712.8c, 712.8e).
  const cmc = i > 0 && d.layout === "transform" ? mv(faces[0]!.manaCost) : mv(manaCost);
  const out: CardDef = {
    oracleId: key,
    name: f.name,
    manaCost,
    cmc,
    typeLine: f.typeLine,
    supertypes: [...f.supertypes],
    types: [...f.types],
    subtypes: [...f.subtypes],
    oracleText: f.oracleText,
    ...(f.power !== undefined ? { power: f.power } : {}),
    ...(f.toughness !== undefined ? { toughness: f.toughness } : {}),
    ...(f.loyalty !== undefined ? { loyalty: f.loyalty } : {}),
    colors: flip ? [...faces[0]!.colors] : [...f.colors],
    colorIdentity: d.colorIdentity,
    keywords: faceKeywords(d, f),
    ...(f.imageUrl ?? d.imageUrl ? { imageUrl: f.imageUrl ?? d.imageUrl } : {}),
    ...(f.artUrl ?? d.artUrl ? { artUrl: f.artUrl ?? d.artUrl } : {}),
    ...(d.layout ? { layout: d.layout } : {}),
    faceOf: { oracleId: d.oracleId, face: i },
  };
  faceDefs.set(key, out);
  return out;
}

const resting = new Map<string, CardDef>();

/**
 * The card's characteristics wherever no face is chosen: a double-faced card's front face outside the stack and the
 * battlefield (CR 712.8a), an adventurer or preparation card's normal characteristics (715.4, 722.4), an unflipped flip
 * card (710.2); a split card's two halves combined (709.4): both names, the combined mana cost (709.4b), each card type
 * and subtype of either half (709.4c). A split card's halves are instants and sorceries whose abilities work only on
 * the stack (CR 112.3a), so the combined card has no text of its own here; each half is compiled as a face.
 */
export function restingDef(d: CardDef): CardDef {
  if (!d.faces?.length) return d;
  const hit = resting.get(d.oracleId);
  if (hit) return hit;
  // Each face keeps its own keywords: the card's list is the whole card's.
  const faces = d.faces.map((f) => ({ ...f, keywords: faceKeywords(d, f) }));
  let out: CardDef;
  if (d.layout === "split") {
    const union = (k: "supertypes" | "types" | "subtypes") => [...new Set(faces.flatMap((f) => f[k]))];
    const manaCost = faces.map((f) => f.manaCost).join("");
    const { power: _p, toughness: _t, loyalty: _l, ...rest } = d;
    // Its colors are its combined mana cost's (CR 709.4b).
    const colors = COLORS.filter((c) => faces.some((f) => f.colors.includes(c)));
    out = { ...rest, manaCost, cmc: mv(manaCost), colors, supertypes: union("supertypes"), types: union("types"), subtypes: union("subtypes"), oracleText: "", keywords: [], faces };
  } else {
    const f = faces[0]!;
    out = { ...d, name: f.name, manaCost: f.manaCost, cmc: mv(f.manaCost), typeLine: f.typeLine, keywords: f.keywords, faces };
  }
  resting.set(d.oracleId, out);
  resting.set(out.oracleId, out);
  return out;
}

/** Register the definition of this face of `o`'s card, so its key (cardIdOf) finds it in GameState.cards. */
export function registerFace(s: GameState, o: GameObject, face: number): string {
  const d = s.cards[o.cardId]!;
  const key = faceKey(d.oracleId, face);
  s.cards[key] ??= faceDef(d, face);
  return key;
}

/** Turn this face of `o` up (or, with undefined, its resting characteristics back): casting a face, transforming. */
export function setFace(s: GameState, o: GameObject, face: number | undefined) {
  if (face !== undefined) registerFace(s, o, face);
  o.face = face;
}

/** Run `fn` with this face of `o` up (undefined: as it is), then put it back: for checking how it would be cast or played. */
export function asFace<T>(s: GameState, o: GameObject, face: number | undefined, fn: () => T): T {
  if (face === undefined || o.face === face) return fn();
  const was = { face: o.face, zc: o.zoneChanges ?? 0 };
  setFace(s, o, face);
  try {
    return fn();
  } finally {
    // Unless `fn` moved it (playing a land face): then it's a new object with the face it entered with.
    if ((o.zoneChanges ?? 0) === was.zc) o.face = was.face;
  }
}

/** The card's layout if it has faces: "split", "flip", "transform", "modal_dfc", "adventure", "prepare". */
export const layoutOf = (s: GameState, o: GameObject): string | undefined => (s.cards[o.cardId]?.faces ? s.cards[o.cardId]!.layout : undefined);

/**
 * The faces `o` could be cast with, besides as it is: an Adventure (CR 715.3), a modal double-faced card's back face
 * (712.11b), either half of a split card (709.3). Index into CardDef.faces.
 */
export function castableFaces(s: GameState, o: GameObject): number[] {
  const d = s.cards[o.cardId];
  if (!d?.faces || o.faceDown) return [];
  if (d.layout === "split") return d.faces.map((_, i) => i);
  if (d.layout === "adventure" || d.layout === "modal_dfc") return [1];
  return [];
}

/** A modal double-faced card's faces that are lands, which it may be played as (CR 712.12). */
export function landFaces(s: GameState, o: GameObject): number[] {
  const d = s.cards[o.cardId];
  if (!d?.faces || d.layout !== "modal_dfc" || o.faceDown) return [];
  return d.faces.flatMap((f, i) => (f.types.includes("Land") ? [i] : []));
}

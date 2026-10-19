// Scryfall card objects -> the game's card definitions. Used by tools/build-cards.ts; pure, so it's tested here.

import { parseTypeLine } from "./cards";
import { COLORS, type CardDef, type CardFace, type Color, type ManaType } from "./types";

/** A card in the card database: its definition plus legality and printing info. */
export interface CardRecord extends CardDef {
  commanderLegal: "legal" | "banned" | "not_legal" | "restricted";
  set: string;
  releasedAt: string;
  rarity: string;
  layout: string;
  gameChanger: boolean;
}

/** An object is the colors of the mana symbols in its mana cost and of its color indicator (CR 202.2, 202.2e). */
function faceColors(manaCost: string, indicator: Color[] | undefined): Color[] {
  const inCost = new Set([...manaCost.matchAll(/\{([^}]*)\}/g)].flatMap((m) => m[1]!.split("/")));
  return COLORS.filter((c) => inCost.has(c) || indicator?.includes(c));
}

function toFace(f: any): CardFace {
  const typeLine: string = f.type_line ?? "";
  const manaCost: string = f.mana_cost ?? "";
  const colorIndicator = f.color_indicator as Color[] | undefined;
  return {
    name: f.name,
    manaCost,
    typeLine,
    ...parseTypeLine(typeLine),
    oracleText: f.oracle_text ?? "",
    ...(f.power !== undefined && { power: f.power }),
    ...(f.toughness !== undefined && { toughness: f.toughness }),
    ...(f.loyalty !== undefined && { loyalty: f.loyalty }),
    ...(f.defense !== undefined && { defense: f.defense }),
    // Scryfall gives a face's colors only where the faces are printed on different sides.
    colors: (f.colors as Color[] | undefined) ?? faceColors(manaCost, colorIndicator),
    ...(colorIndicator && { colorIndicator }),
    ...(f.image_uris && { imageUrl: f.image_uris.normal, artUrl: f.image_uris.art_crop }),
  };
}

export function cardFromScryfall(c: any): CardRecord {
  const face = c.card_faces?.[0] ?? {};
  const pick = (k: string) => c[k] ?? face[k];
  const images = c.image_uris ?? face.image_uris ?? {};
  const typeLine: string = pick("type_line") ?? "";
  const rec: CardRecord = {
    oracleId: c.oracle_id,
    name: c.name,
    manaCost: pick("mana_cost") ?? "",
    cmc: c.cmc ?? 0,
    typeLine,
    ...parseTypeLine(typeLine),
    oracleText: pick("oracle_text") ?? "",
    power: pick("power"),
    toughness: pick("toughness"),
    loyalty: pick("loyalty"),
    defense: pick("defense"),
    colors: (pick("colors") ?? []) as Color[],
    colorIdentity: (c.color_identity ?? []) as Color[],
    keywords: c.keywords ?? [],
    producedMana: c.produced_mana as ManaType[] | undefined,
    imageUrl: images.normal,
    artUrl: images.art_crop,
    commanderLegal: c.legalities?.commander ?? "not_legal",
    set: c.set,
    releasedAt: c.released_at,
    rarity: c.rarity,
    layout: c.layout,
    gameChanger: !!c.game_changer,
  };
  if (c.card_faces?.length > 1) {
    const faces: CardFace[] = c.card_faces.map(toFace);
    // A flip card's color and mana cost don't change when it flips (CR 710.1c): its bottom half has the card's.
    if (c.layout === "flip") for (const f of faces.slice(1)) Object.assign(f, { manaCost: faces[0]!.manaCost, colors: faces[0]!.colors });
    rec.faces = faces;
  }
  // A meld card's back is half of the melded permanent, a card of its own in Scryfall linked by all_parts (CR 712.4).
  const parts: any[] = (c.all_parts ?? []).filter((p: any) => p.component === "meld_part" || p.component === "meld_result");
  const result = parts.find((p) => p.component === "meld_result");
  if (c.layout === "meld" && result) rec.meld = { parts: parts.filter((p) => p.component === "meld_part").map((p) => p.name).sort(), result: result.name };
  return rec;
}

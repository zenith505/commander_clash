import { faceDef, hasFuse, isRoom, restingDef, roomDoorDefs } from "../faces";
import { isMeldResult, meldPartnerName, meldResultDef } from "../meld-results";
import { allEffects, GRANTED_WAY_COSTS } from "../abilities";
import type { FromTop, AbilityBody, Count, ChoiceKind, TriggeredAbility, CompiledCard, Effect, AdditionalCost, CostOption, TargetSpec, ActivatedAbility, StaticCondition, SpentReq, StaticAbility, Affects } from "../abilities";
import { CARD_TYPE_PLURAL, CHOSEN_HEXPROOF, CHOSEN_LAND_TYPE, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION, CHOSEN_TYPE_PROTECTION, CREATURE_TYPES, isLandwalk, stripReminder } from "../keywords";
import { parseManaCost } from "../mana";
import { substituteX } from "../amounts";
import { withModes, gateTargets, type CastHow } from "../modes";
import type { CardDef, PlayerId } from "../types";
import type { CopyExcept } from "../copies";
import { NUM, num, NUMX, COUNTER, counterKind, X, amt, parseSpentReq, plainMana, sacrificeSelf, SPENT, ROLL_ROW, COLOR_WORDS, capital, singularWord } from "./words";
import { parseManaAbility, parseManaTrigger } from "./mana-abilities";
import { parseGraveyardKeyword, parseCostKeyword, parseAdditionalCost, keywordAbilities, textKeywords, isKeywordLine, firebending, rippleBody } from "./keyword-abilities";
import { parseEntersCondition, parseEntersChoice, parseConditionalStatic, parseCostChange, parseStatic, parseStaticCondition, parseOnlyClauses } from "./statics";
import { parseTrigger } from "./triggers";
import { KEYWORD_WORDS, parseActivated, parseLoyalty, stripAbilityWord } from "./activated";
import { parseBody, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { parseBecomes } from "./sentence";
import { PLANESWALKER_TYPES, parseGroup, parseTargetPhrase } from "./targets";
import { backupTriggers, parseGrants } from "./grants";
import { dungeonTriggers } from "./dungeons";
import { parseCountMod, parseCopyExcept, PREDEFINED_TOKENS } from "./tokens";
import { parseCardNameChoice, parseSearchFilter } from "./search";
import { addStriation, simpleKeywords, striations } from "./striations";
import { draftLine } from "./draft";

const cache = new Map<string, CompiledCard>();

/** An overloaded spell's text (CR 702.96a): every instance of the word "target" is "each", except in the overload line. */
export const overloadedText = (text: string): string =>
  text
    .split("\n")
    .map((l) => (/^Overload\b/.test(l) ? l : l.replace(/\btarget\b/g, "each").replace(/\bTarget\b/g, "Each")))
    .join("\n");

/** Does this card have cleave, with words in square brackets (CR 702.148a)? */
export const hasCleave = (d: CardDef): boolean => /^Cleave\b/m.test(d.oracleText) && /\[/.test(d.oracleText);

/** A spell cast for its cleave cost (CR 702.148a): its text without the words in square brackets. */
export const cleavedText = (text: string): string =>
  text
    .split("\n")
    .map((l) => (/^Cleave\b/.test(l) ? l : l.replace(/ ?\[[^\]]*\]/g, "")))
    .join("\n");

/** The cleaved text of each card with cleave compiled, by oracle id (its text as compiled has the brackets taken out). */
const cleavedTexts = new Map<string, string>();

export function compileCard(card: CardDef): CompiledCard {
  // A card with faces as it is in the card data: its resting characteristics, the ones it has in a game (CR 709.4, 712.8a).
  const d0 = restingDef(card);
  // Cleave: not cast for its cleave cost, the words in square brackets are the spell's text (CR 702.148a).
  const cleaves = hasCleave(d0) && !d0.oracleId.endsWith("|cleaved");
  if (cleaves) cleavedTexts.set(d0.oracleId, cleavedText(d0.oracleText));
  const d = cleaves ? { ...d0, oracleText: d0.oracleText.replace(/[[\]]/g, "") } : d0;
  const hit = cache.get(d.oracleId);
  if (hit) return hit;
  const doors = d.roomDoors ? roomDoorDefs(d) : undefined;
  const out = doors ? roomAbilities(doors) : compile(d);
  // A meld card's ability melds it with its counterpart into their combined back face (CR 701.42a): only if what that
  // puts onto the battlefield is supported.
  if (d.meld && !isMeldResult(d) && /\bmeld them into\b/.test(d.oracleText) && !meldResultSupported(d.meld.result)) out.unsupported.push(`(${d.meld.result}, the permanent it melds into)`);
  if (d.oracleId === MONARCH.oracleId) out.triggers = MONARCH_TRIGGERS;
  if (d.oracleId === RING.oracleId) out.triggers = RING_TRIGGERS;
  if (d.oracleId === INITIATIVE.oracleId) out.triggers = INITIATIVE_TRIGGERS;
  if (d.oracleId === RAD.oracleId) out.triggers = RAD_TRIGGERS;
  const rooms = dungeonTriggers(d.oracleId);
  if (rooms) out.triggers = rooms;
  cache.set(d.oracleId, out);
  return out;
}

/**
 * A Room permanent's abilities: those in each unlocked door's text box (CR 709.5, rulings), left door first, so the
 * left door's triggered abilities keep their places as the right one unlocks.
 */
function roomAbilities(doors: CardDef[]): CompiledCard {
  const out: Record<string, unknown> = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  for (const c of doors.map((d) => compileCard(d)))
    for (const [k, v] of Object.entries(c)) {
      if (Array.isArray(v)) out[k] = [...((out[k] as unknown[] | undefined) ?? []), ...v];
      else if (v !== undefined && v !== false && (out[k] === undefined || out[k] === false)) out[k] = v;
    }
  return out as unknown as CompiledCard;
}

/**
 * Stands in as the "source" of the monarch's two inherent triggered abilities, which have none
 * (CR 725.2): the game puts it in `s.cards` when someone first becomes the monarch.
 */
export const MONARCH: CardDef = {
  oracleId: "monarch",
  name: "The monarch",
  manaCost: "",
  cmc: 0,
  typeLine: "",
  supertypes: [],
  types: [],
  subtypes: [],
  oracleText: "",
  colors: [],
  colorIdentity: [],
  keywords: [],
};
const MONARCH_TRIGGERS: TriggeredAbility[] = [
  {
    event: "monarchEndStep",
    body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "At the beginning of the monarch's end step, that player draws a card." },
  },
  {
    event: "monarchDamaged",
    body: {
      targets: [],
      effects: [{ type: "becomeMonarch", who: { ref: "subjectController" } }],
      text: "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.",
    },
  },
];

/**
 * Stands in as the "source" of the initiative's three inherent triggered abilities, which have none (CR 726.2). Each
 * is controlled by the player who had the initiative when it triggered; the second one's "controller of those
 * creatures" is its event player.
 */
export const INITIATIVE: CardDef = { ...MONARCH, oracleId: "initiative", name: "The initiative" };
const INITIATIVE_TRIGGERS: TriggeredAbility[] = [
  { event: "ventureRoom", body: { targets: [], effects: [{ type: "venture", undercity: true }], text: "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity." } },
  {
    event: "ventureRoom",
    body: {
      targets: [],
      effects: [{ type: "takeInitiative", who: { ref: "eventPlayer" } }],
      text: "Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative.",
    },
  },
  { event: "ventureRoom", body: { targets: [], effects: [{ type: "venture", undercity: true }], text: "Whenever a player takes the initiative, that player ventures into Undercity." } },
];

/**
 * Stands in as the "source" of rad counters' inherent triggered ability, which has none and is controlled by the active
 * player (CR 728.1).
 */
export const RAD: CardDef = { ...MONARCH, oracleId: "rad-counters", name: "Rad counters" };
const RAD_TRIGGERS: TriggeredAbility[] = [
  {
    event: "radiation",
    body: { targets: [], effects: [{ type: "radiation" }], text: "At the beginning of each player's precombat main phase, if that player has one or more rad counters, that player mills a number of cards equal to the number of rad counters they have. For each nonland card milled this way, that player loses 1 life and removes one rad counter from themselves." },
  },
];

/**
 * The Ring, the emblem a player gets the first time the Ring tempts them (CR 701.54c). It stands in as the source
 * of its triggered abilities, which the game fires for that player's Ring-bearer once the Ring has tempted them
 * enough times. Its static ability ("Your Ring-bearer is legendary and can't be blocked by creatures with greater
 * power") is applied by the layers.
 */
export const RING: CardDef = { ...MONARCH, oracleId: "the-ring", name: "The Ring" };
const RING_TRIGGERS: TriggeredAbility[] = [
  {
    event: "ringBearerAttacks",
    body: {
      targets: [],
      effects: [
        { type: "draw", who: { ref: "you" }, n: 1 },
        { type: "discard", who: { ref: "you" }, n: 1, random: false },
      ],
      text: "Whenever your Ring-bearer attacks, draw a card, then discard a card.",
    },
  },
  {
    // The subject is the blocking creature.
    event: "ringBearerBlocked",
    body: {
      targets: [],
      effects: [{ type: "delayed", when: "endOfCombat", each: "subject", effects: [{ type: "sacrifice", what: { ref: "subject" }, byController: true }], text: "the blocking creature's controller sacrifices it" }],
      text: "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
    },
  },
  {
    event: "ringBearerDamagesPlayer",
    body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eachOpponent" }, n: 3 }], text: "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life." },
  },
];

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Card types/subtypes whose rules we don't model yet, whatever their text says. Kindred is modeled (CR 308): cast and
 * resolved as its other card type, its subtypes creature types.
 */
const UNSUPPORTED_TYPES = ["Tribal", "Dungeon"];
const UNSUPPORTED_SUBTYPES: string[] = [];

const meldResults = new Map<string, boolean>();

/** Is the combined back face called `name` known (meld-results.ts) and supported, as a permanent on the battlefield? */
function meldResultSupported(name: string): boolean {
  const known = meldResults.get(name);
  if (known !== undefined) return known;
  const r = meldResultDef(undefined, name);
  const ok = !!r && isFullySupported({ ...r, meld: undefined });
  if (r) meldResults.set(name, ok);
  return ok;
}

/**
 * True when the engine executes everything the card does. Unsupported cards can still be
 * played, but some of their text does nothing yet, so decks and the UI flag them.
 */
export function isFullySupported(d: CardDef): boolean {
  // A melded permanent isn't a card: it exists only as the back faces of its meld pair (CR 712.4b).
  if (isMeldResult(d)) return false;
  if (d.faces?.length) return facesSupported(d);
  if (d.name.includes(" // ") && !d.faceOf) return false;
  const cost = parseManaCost(d.manaCost);
  if (!cost.supported) return false;
  if (d.types.some((t) => UNSUPPORTED_TYPES.includes(t)) || d.subtypes.some((t) => UNSUPPORTED_SUBTYPES.includes(t))) return false;
  // A planeswalker needs a printed loyalty number to enter with (CR 306.5b); "X" loyalty isn't modeled.
  if (d.types.includes("Planeswalker") && !/^\d+$/.test(d.loyalty ?? "")) return false;
  const c = compileCard(d);
  // Creatures, and Vehicles that can become creatures (CR 301.7a), need numbers for power and toughness,
  // or a characteristic-defining ability that says what a "*" is (CR 604.3).
  const defined = c.statics.flatMap((st) => st.mods).find((x) => x.kind === "definePT");
  const ptOk = (v: string | undefined, key: "power" | "toughness") => /^\d+$/.test(v ?? "") || (/\*/.test(v ?? "") && defined?.kind === "definePT" && defined[key] !== undefined);
  if ((d.types.includes("Creature") || d.subtypes.includes("Vehicle")) && (!ptOk(d.power, "power") || !ptOk(d.toughness, "toughness"))) return false;
  if (c.unsupported.length) return false;
  if ((d.types.includes("Instant") || d.types.includes("Sorcery")) && !c.spell) return false;
  if (d.subtypes.includes("Aura") && !c.enchant) return false;
  return true;
}

/**
 * A card with several faces: each face it can be cast as, played as or turned up to has to be supported. Modal
 * double-faced cards (CR 712.3, 712.11b, 712.12), adventurer cards (715) and split cards (709) are; split cards with
 * fuse or aftermath have those lines reported by their faces. Transforming, flip and preparation cards aren't yet.
 */
function facesSupported(card: CardDef): boolean {
  if (!["modal_dfc", "adventure", "split", "transform", "prepare", "flip"].includes(card.layout ?? "")) return false;
  const d = restingDef(card);
  // Rooms (CR 709.5): each door is cast on its own as a half, and is the text of the Room permanent while unlocked.
  if (!d.faces!.every((_, i) => isFullySupported(faceDef(d, i)))) return false;
  return !hasFuse(d) || fusedSupported(d);
}

/**
 * A fused split spell's text is both halves' (CR 702.102d), compiled as one spell: supported when that spell is exactly
 * the left half's targets and effects followed by the right half's, so nothing in one half was read as being about
 * the other.
 */
function fusedSupported(d: CardDef): boolean {
  const fused = faceDef(d, d.faces!.length);
  if (!isFullySupported(fused)) return false;
  const [left, right] = d.faces!.map((_, i) => compileCard(faceDef(d, i)).spell);
  const whole = compileCard(fused).spell;
  if (!whole || !left || !right || left.modal || right.modal || whole.modal) return false;
  // The right half's targets come after the left half's (an effect names its target by `index`).
  const shift = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(shift) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "index" && typeof v === "number" ? v + left.targets.length : shift(v)])) : x;
  const strip = (b: AbilityBody) => JSON.stringify({ targets: b.targets.map((t) => ({ ...t, text: "" })), effects: b.effects });
  return strip(whole) === strip({ ...whole, targets: [...left.targets, ...right.targets], effects: [...left.effects, ...(shift(right.effects) as Effect[])] });
}

/**
 * What casting this card targets: a spell's targets (for a modal spell, those of the chosen
 * modes, CR 700.2c), or what an Aura enchants (CR 303.4a).
 */
/** `how`: the optional costs announced for it, which decide whether it has the targets of parts that need them (gateTargets). */
export function spellTargetSpecs(d: CardDef, modes?: number[], how?: CastHow): TargetSpec[] {
  // A mutating creature spell targets "a non-Human creature with the same owner as this spell" (CR 702.140a).
  if (d.mutateOwner !== undefined) return [mutateTarget(d.mutateOwner)];
  const c = compileCard(d);
  if (c.spell) return gateTargets(withModes(c.spell, modes).targets, how);
  return c.enchant ? [c.enchant] : [];
}

/** What a mutating creature spell targets (CR 702.140a): a non-Human creature with the same owner as the spell. */
export const mutateTarget = (owner: PlayerId): TargetSpec => ({ kind: "object", types: ["Creature"], notSubtypes: ["Human"], ownerIs: owner, text: "target non-Human creature with the same owner" });

/**
 * The spell's effect as a body, for deciding what to target: a spell's text, or for an
 * Aura, what it will do to the enchanted permanent.
 */
export function castingBody(d: CardDef): AbilityBody | undefined {
  if (d.mutateOwner !== undefined) return { targets: [mutateTarget(d.mutateOwner)], effects: [], text: "Mutate" };
  const c = compileCard(d);
  if (c.spell) return c.spell;
  if (!c.enchant) return undefined;
  // Animate Dead: what it does to its target is reanimate it.
  if (c.animate) return { targets: [c.enchant], effects: [{ type: "putOntoBattlefield", what: { ref: "target", index: 0 } }], text: d.oracleText };
  const effects: Effect[] = c.statics
    .filter((st) => st.affects.kind === "attached")
    .map((st) => ({ type: "continuous", what: { ref: "target", index: 0 }, mods: st.mods, duration: "game" }));
  return { targets: [c.enchant], effects, text: d.oracleText };
}

// ---------------------------------------------------------------------------

export const QUOTED_SOURCE_NAME = "\u27easource\u27eb";

/** "He", "she", "him", "his" and "her" of a legendary card that names itself: "~" or "~'s". */
function selfPronouns(t: string): string {
  const kept: string[] = [];
  return t
    // Left as they are: "his or her" (their), a copy's exceptions ("except his name is ~ and he's a 4/4", read by
    // parseCopyExcept) and "if his sneak cost was paid" (read with the trigger).
    .replace(/\b(?:his or her|he or she|him or her)\b|\bexcept [^."]*|\b(?:his|her) \w+ cost was paid\b/gi, (m) => `\u0001${kept.push(m) - 1}\u0001`)
    .replace(/\b(?:[Hh]is|[Hh]er(?= (?:power|toughness|owner's|owner|controller|name|loyalty|additional|sneak|other|text|mana)\b))\b/g, "~'s")
    .replace(/\b(?:[Hh]e|[Ss]he|him|her)\b(?!')/g, "~")
    .replace(/\u0001(\d+)\u0001/g, (_, n: string) => kept[Number(n)]!);
}

/** Replace every way a card refers to itself with "~". */
export function normalizeSelf(d: CardDef): string {
  let t = stripReminder(d.oracleText);
  const full = d.name.split(" // ")[0]!;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A meld card's meld ability (CR 701.42a): "if you both own and control ~ and a creature named Bruna, the Fading Light,
  // exile them, then meld them into Brisela, Voice of Nightmares", "If ~ and a creature named Phyrexian Dragon Engine are
  // attacking, and you both own and control them, exile them, then meld them into Mishra, Lost to Phyrexia. It enters
  // tapped and attacking." "Them" is ~ and the permanent with its counterpart's name: said so here, to be read alone.
  const partner = d.meld && meldPartnerName(d);
  if (partner && full) {
    const into = `then meld them into ${esc(d.meld!.result)}`;
    const re = new RegExp(`(an? (creature|land|artifact) named ${esc(partner)})((?:(?! named ).)*?)exile them, ${into}(\\. It enters tapped and attacking)?`, "g");
    t = t.replace(re, (_, named: string, type: string, mid: string, attacking?: string) =>
      `${named}${mid}exile ${full} and the ${/ are attacking, /.test(mid) ? "attacking " : ""}${type} named ${partner}, then meld them into ${d.meld!.result}${attacking ? " tapped and attacking" : ""}`);
  }
  // In a quoted ability the card gives something else, its name still means the card (CR 201.5a), not the
  // object with the ability, which is "~" there: mark it so that text isn't compiled as "~".
  // A token's name is a name, not the card ("a 3/3 blue Serpent creature token named Koma's Coil", "a 0/1 red Kobold
  // creature token named Kobolds of Kher Keep").
  const tokenNames: string[] = [];
  t = t.replace(/(tokens? named )([A-Z][\w'-]*(?: (?:of |the )?[A-Z][\w'-]*)*)/g, (_, a: string, n: string) => `${a}\u0001${tokenNames.push(n) - 1}\u0001`);
  if (full) {
    t = t.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(esc(full), "g"), QUOTED_SOURCE_NAME));
    // The card named Exile: "Exile target nonwhite attacking creature" is the keyword action, not the card (its name
    // followed by "target" is never the card).
    const verb = /^[A-Z][a-z]+$/.test(full) ? "(?! target\\b)" : "";
    t = t.replace(new RegExp(esc(full) + verb, "g"), "~");
  }
  // Shortened names (CR 201.5c): "Gylwain" for "Gylwain, Casting Director", and for a legendary card with no comma,
  // "Ellivere" for "Ellivere of the Wild Court", "Gandalf" for "Gandalf the Grey" (not "Tuktuk the Returned", a token
  // Tuktuk the Explorer creates).
  const comma = full.split(",")[0]!;
  const ofThe = comma === full && d.supertypes?.includes("Legendary") ? /^(.+?) (?:of|the) /.exec(full)?.[1] : undefined;
  // "Edgar" for "Edgar Markov": a legendary card's two-word name, when the first word isn't a type (CR 201.5c; not
  // "Sliver" for "Sliver Queen"). "Imskir" for "Imskir Iron-Eater": the second word may be hyphenated.
  const twoWords = comma === full && !ofThe && d.supertypes?.includes("Legendary") ? /^([A-Z][a-z]+) [A-Z][a-z]+(?:-[A-Z][a-z]+)?$/.exec(full)?.[1] : undefined;
  const first = twoWords && !CREATURE_TYPES.has(twoWords) && !/^(?:Artifact|Creature|Enchantment|Land|Planeswalker|Battle|Kindred|Tribal|Instant|Sorcery|Legendary|Basic|Snow|World)$/.test(twoWords) ? twoWords : undefined;
  // "King Darien" for "King Darien XLVIII": a legendary card's name without its regnal number.
  const regnal = comma === full && !ofThe && !first && d.supertypes?.includes("Legendary") ? /^(.+ .+) [IVXLC]+$/.exec(full)?.[1] : undefined;
  const short = ofThe ?? first ?? regnal ?? comma;
  if (short && short !== full) {
    // Not "Nissa's Chosen" in Nissa Revane, another card's name.
    // Letter boundaries that know accented letters ("Éowyn" for "Éowyn, Fearless Knight"), which \b doesn't.
    // Not "each Garruk you control" in Garruk, Cursed Huntsman: there it's the planeswalker type (CR 205.3j).
    const pwType = PLANESWALKER_TYPES.has(short) ? "(?<!(?:^|[^\\p{L}])(?:each|another|other|target|a|an) )" : "";
    const re = new RegExp(`${pwType}(?<![\\p{L}\\p{N}_])${esc(short)}(?![\\p{L}\\p{N}_])${ofThe ? "(?! (?:of|the) [A-Z])" : ""}${first ? "(?!'s [A-Z])" : ""}`, "gu");
    t = t.replace(/"[^"]*"/g, (q) => q.replace(re, QUOTED_SOURCE_NAME));
    t = t.replace(re, "~");
  }
  t = t.replace(/\u0001(\d+)\u0001/g, (_, i: string) => tokenNames[Number(i)]!);
  // A card named for two characters ("Aang and La, Ocean's Fury", "Bebop & Rocksteady") takes plural verbs: "Whenever
  // Aang and La attack", "Whenever ~ enter or attack". It's still one object (CR 201.5), read as "~ attacks".
  // A plural name ("The Sackville-Bagginses", "The Notary Hobbits") too.
  if (/ (?:and|&) /.test(comma) || /^The [^,]+[a-z]s$/.test(d.name)) {
    const third = (v: string) => (v === "die" ? "dies" : `${v}s`);
    t = t.replace(/~ (attack|enter|deal|block|die|get|become)(?: or (attack|enter|block|die))?\b/g, (_, a: string, b?: string) => `~ ${third(a)}${b ? ` or ${third(b)}` : ""}`);
    // The Notary Hobbits: "When ~ enter, if they're not a token, create two tokens that are copies of them": ~ itself.
    t = t.replace(/(When ~ enters, if )they're( not a token, create [^.]+ copies of )them\b/g, "$1it's$2it");
    // Tui and La, Moon and Ocean: "Whenever ~ become untapped, put a +1/+1 counter on them": on ~ itself.
    t = t.replace(/(Whenever ~ becomes (?:tapped|untapped), put an? [^.]+? counters? on )them\./g, "$1~.");
  }
  // A legendary character card refers to itself as "he" or "she" ("Put a +1/+1 counter on Hercules. He gains
  // vigilance", "his power", "attach up to one target Equipment to her"): the card itself, like "it" (CR 201.5). Not in
  // a quoted ability, where it would mean the object given the ability, and not "his or her" (an old way to say "their").
  if (d.supertypes?.includes("Legendary")) t = t.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : selfPronouns(part))).join("");
  // 'Equipped creature has "... sacrifice this Equipment"': the Equipment, not the creature.
  t = t.replace(/"[^"]*"/g, (q) => q.replace(/\b[Tt]his (Equipment|Aura)\b/g, QUOTED_SOURCE_NAME));
  t = t.replace(/\b[Tt]his (creature|artifact|enchantment|land|permanent|spell|card|token|Equipment|Vehicle|Spacecraft|Planet|Aura|planeswalker|Saga|Class|Case|Room|Siege|battle)\b/g, "~");
  // A Room's door (CR 709.5j): "When you unlock this door" is about that half, by its index.
  if (d.faceOf && d.subtypes.includes("Room")) t = t.replace(/\bWhen you unlock this door\b/g, `When you unlock door ${d.faceOf.face}`);
  // "Your team" means the same as "you" in a game that isn't between teams (CR 102.4): "Warriors your team controls",
  // "if your team gained life this turn".
  t = t.replace(/\byour team controls\b/g, "you control").replace(/\byour team gained\b/g, "you gained");
  // Azra Bladeseeker: "each player on your team may discard a card, then each player who discarded a card this way draws
  // a card" is you alone.
  t = t.replace(/\beach player on your team may discard a card, then each player who discarded a card this way draws a card\b/g, "you may discard a card. If you do, draw a card");
  return t;
}

/**
 * A max speed ability's ability (CR 702.178a), added to `out` with the condition: one static, triggered, activated or
 * mana ability and nothing else. False if it's anything else, or a static ability that already has a condition.
 */
function conditionalAbility(d: CardDef, text: string, out: CompiledCard, cond: StaticCondition): boolean {
  const inner = compile({ ...d, oracleText: text });
  const base = compile({ ...d, oracleText: "" });
  if (inner.unsupported.length) return false;
  // Racers' Scoreboard: "Max speed — Spells you cast cost {1} less to cast": one cost change, only while it holds.
  const [mod, ...mods] = inner.costMods ?? [];
  if (mod && !mods.length && !base.costMods && !mod.if) {
    const { costMods: _, ...plain } = inner;
    if (JSON.stringify(plain) !== JSON.stringify(base)) return false;
    (out.costMods ??= []).push({ ...mod, if: cond });
    return true;
  }
  const lists = ["triggers", "activated", "mana", "statics"] as const;
  const rest = (c: CompiledCard) => JSON.stringify(Object.entries(c).filter(([k]) => !(lists as readonly string[]).includes(k)).sort(([a], [b]) => a.localeCompare(b)));
  if (rest(inner) !== rest(base) || lists.some((k) => base[k].length)) return false;
  const [kind, ...more] = lists.flatMap((k) => inner[k].map(() => k));
  if (!kind || more.length) return false;
  if (kind === "statics") {
    const st = inner.statics[0]!;
    if (st.condition) return false;
    out.statics.push({ ...st, condition: cond });
  } else if (kind === "triggers") out.triggers.push({ ...inner.triggers[0]!, activeIf: cond });
  else if (kind === "mana") out.mana.push({ ...inner.mana[0]!, activeIf: cond });
  else {
    const ab = inner.activated[0]!;
    if (ab.activateIf) return false;
    out.activated.push({ ...ab, activateIf: cond });
  }
  return true;
}

/** A Case's "To solve — [Condition]" as its end step trigger (CR 719.3a), or null if the condition isn't understood. */
function solveTrigger(d: CardDef, text: string): TriggeredAbility | null {
  const lower = text.replace(/^[A-Z](?=[a-z' ])/, (c) => c.toLowerCase());
  // "Three or more creatures attacked this turn" (Case of the Gateway Express): it's checked in your end step, and only
  // the active player declares attackers (CR 508.1), so they're the creatures you attacked with.
  const attacked = new RegExp(`^${NUM} or more creatures attacked this turn$`).exec(lower);
  const cond: StaticCondition | null = attacked ? { kind: "attackedWith", n: num(attacked[1]!) } : parseStaticCondition(lower, { affects: { kind: "self" }, mods: [], text: "" });
  if (!cond) return null;
  const t = compile({ ...d, subtypes: [], oracleText: "At the beginning of your end step, ~ becomes solved." }).triggers[0];
  if (!t || t.ifCond) return null;
  return { ...t, ifCond: { kind: "allOf", conds: [cond, { kind: "solved", not: true }] }, body: { ...t.body, text: `To solve — ${text}.` } };
}

/** The ability words (CR 207.2c), before a line of an instant or sorcery. */
const SPELL_ABILITY_WORD = new RegExp(
  `^(?:${["Adamant", "Addendum", "Alliance", "Battalion", "Bloodrush", "Celebration", "Channel", "Chroma", "Cohort", "Constellation", "Converge", "Council's dilemma", "Coven", "Delirium", "Descend 4", "Descend 8", "Disappear", "Domain", "Eerie", "Eminence", "Enrage", "Fateful hour", "Fathomless descent", "Ferocious", "Flurry", "Formidable", "Grandeur", "Hellbent", "Heroic", "Imprint", "Infusion", "Inspired", "Join forces", "Kinship", "Landfall", "Lieutenant", "Magecraft", "Metalcraft", "Morbid", "Opus", "Pack tactics", "Paradox", "Parley", "Radiance", "Raid", "Rally", "Renew", "Repartee", "Revolt", "Secret council", "Spell mastery", "Strive", "Survival", "Sweep", "Tempting offer", "Threshold", "Undergrowth", "Valiant", "Vivid", "Void", "Will of the council"].join("|")}) — `,
);

/** The conditions "~ has flash as long as ..." may have: about the player, so the same with the card in hand. */
const FLASH_IF: StaticCondition["kind"][] = ["committedCrime", "control", "monarch", "initiative", "graveyardAtLeast", "graveyardTypes"];

export function compile(d: CardDef): CompiledCard {
  const out: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  // A back face cast converted (CR 702.162a): the front face's More Than Meets the Eye cost is what's paid for it.
  if (d.convertCost && plainMana(d.convertCost)) out.altCosts = [{ kind: "convert", mana: d.convertCost }];
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  const spellLines: string[] = [];
  let ascendSpell = false;
  /** Banefire: "If X is 5 or more, ... the damage can't be prevented": applied to the spell's damage once it's compiled. */
  let unpreventableX: number | undefined;
  let awaken: { n: number; raw: string } | undefined;
  // "Choose one. If this spell was cast using teamwork, choose both instead." and "Choose one. If you control a commander
  // as you cast this spell, you may choose both instead.": a "Choose one —" list whose count can change as it's cast.
  // "Choose one. If this spell was kicked, choose any number instead." (Inscriptions) too.
  let both: "teamwork" | "commander" | "kicked" | "control" | undefined;
  let bothIf: string | undefined;
  // "Choose three. You may choose the same mode more than once." (the Confluences, CR 700.2d).
  let repeat = false;
  let cipher = false;
  let uncopyableSpell = false;
  const all = joinModes(
    normalizeSelf(d)
      // "As ~ enters, choose a creature type. ~ enters with a fellowship counter on it for each ..." (Banner of Kinship):
      // the choice, then the counters, two abilities in one paragraph.
      .replace(/^(As ~ enters, choose a creature type\.) (~ enters with .+)$/m, "$1\n$2")
      // Draconic Destiny: "Enchanted creature gets +1/+1 and has ... "{1}: ~ gets +1/+0 until end of turn." It's a Dragon in
      // addition to its other types.": two static abilities of the Aura, the type not part of the quoted one (rulings).
      .replace(/^((?:Enchanted|Equipped) creature [^\n]+") It's (an? [A-Z][a-z]+ in addition to its other types\.)$/m, (_, a: string, b: string) => `${a}\n${a.startsWith("Enchanted") ? "Enchanted" : "Equipped"} creature is ${b}`)
      // "~ gets +1/+1 for each land you control and each land card in your graveyard" (Multani, Yavimaya's Avatar): the
      // sum, which is two such effects with the same timestamp (CR 613.4c, 613.7).
      .replace(/^(.+? gets? [+-]\d+\/[+-]\d+ for each )([^.]+?) and each ([^.]+?)\.$/m, "$1$2.\n$1$3.")
      // "If this spell's additional cost was paid" with "you may waterbend" as that cost: whether it was paid, like kicker.
      .replace(/\bIf ~'s additional cost was paid\b/g, (x, _i, text: string) => (/^As an additional cost to cast ~, you may waterbend \{\d+\}\.$/m.test(text) ? "If ~ was kicked" : x))
      .replace(/\bunless (?:her|his|its|~'s) additional cost was paid\b/g, (x, _i, text: string) => (/^As an additional cost to cast ~, you may waterbend \{\d+\}\.$/m.test(text) ? "unless ~'s waterbend cost was paid" : x))
      // Staff of the Death Magus: "Whenever you cast a black spell or a Swamp you control enters, you gain 1 life": one
      // ability with two trigger events (CR 603.1), the same as an ability for each. "Whenever you cast a green spell and
      // whenever a Forest you control enters, ..." (Necklace of Girion) too.
      .replace(/^Whenever you cast (an? [a-z]+ spell)(?: or| and whenever) (an? [A-Z][a-z]+ you control) enters, ([^\n]+)$/m, "Whenever you cast $1, $3\nWhenever $2 enters, $3")
      // Tithe Taker: "During your turn, spells your opponents cast cost {1} more to cast and abilities your opponents
      // activate cost {1} more to activate unless they're mana abilities": two cost increases (CR 601.2f, 602.2b).
      .replace(/^During your turn, spells your opponents cast cost (\{\d+\}) more to cast and abilities your opponents activate cost \1 more to activate unless they're mana abilities\.$/m, "During your turn, spells your opponents cast cost $1 more to cast.\nDuring your turn, abilities your opponents activate cost $1 more to activate unless they're mana abilities.")
      // Kothophed, Soul Hoarder: "a permanent owned by another player": every other player is an opponent (CR 102.3).
      .replace(/^Whenever a permanent owned by another player is put into a graveyard from the battlefield, /m, "Whenever a permanent an opponent owns is put into a graveyard from the battlefield, ")
      // Death Tyrant: "Whenever an attacking creature you control or a blocking creature an opponent controls dies, ...":
      // two trigger events (CR 603.1) no one creature can meet both of, the same as an ability for each.
      .replace(/^((?:[A-Z][^\n—]* — )?)Whenever (an attacking creature you control) or (a blocking creature an opponent controls) dies, ([^\n]+)$/m, "$1Whenever $2 dies, $4\n$1Whenever $3 dies, $4")
      // Questing Druid: "Whenever you cast a spell that's white, blue, black, or red": a spell that's any of those colors,
      // as "a white, blue, black, or red spell" says (CR 105.2).
      .replace(/^Whenever you cast a spell that's ((?:(?:white|blue|black|red|green), )*(?:white|blue|black|red|green),? or (?:white|blue|black|red|green)), /m, "Whenever you cast a $1 spell, ")
      // Bartered Cow: "When ~ dies and when you discard ~, ...": two trigger events (CR 603.1), an ability for each.
      .replace(/^When ~ dies and when you discard ~, ([^\n]+)$/m, "When ~ dies, $1\nWhen you discard ~, $1")
      // The Genjus: "Enchant Forest" ... "Enchanted Forest becomes ...": the land it's attached to, which is a Forest while
      // it's legally attached (CR 303.4d); "enchanted land" says the same.
      .replace(/\b([Ee])nchanted (Forest|Island|Swamp|Mountain|Plains)(?= becomes | is put into a graveyard| is an? )/g, (x, e: string, t: string, _i, text: string) => (new RegExp(`^Enchant ${t}$`, "m").test(text) ? `${e}nchanted land` : x))
      .split("\n")
      .map((l) => {
        const same = /^Choose (one|two|three|four|five)\. You may choose the same mode more than once\.$/.exec(l.trim());
        if (same && isSpell) {
          repeat = true;
          return `Choose ${same[1]} —`;
        }
        if (/^Choose one\. If ~ was kicked, choose any number instead\.$/.test(l.trim())) {
          both = "kicked";
          return "Choose one —";
        }
        // "If you control a Wizard as you cast ~, you may choose two instead" (Flame of Anor): one or two.
        const control = /^Choose one\. If you control (.+?) as you cast ~, you may choose (?:both|two) instead\.$/.exec(l.trim());
        if (control && control[1] !== "a commander") {
          both = "control";
          bothIf = control[1]!;
          return "Choose one —";
        }
        const m = /^Choose one\. If (~ was cast using teamwork, choose|you control a commander as you cast ~, you may choose) both instead\.$/.exec(l.trim());
        // "If an opponent has eight or more cards in their graveyard" (See Double), "if you descended this turn" (Molten
        // Collapse): about the caster as the spell is cast (CR 601.2b), like Flame of Anor's.
        const other = !m && !control ? /^Choose one\. If (an opponent has .+ in their graveyard|you descended this turn), you may choose both instead\.$/.exec(l.trim()) : null;
        if (other) {
          both = "control";
          bothIf = `?${other[1]}`;
          return "Choose one —";
        }
        if (!m) return l;
        both = m[1]!.startsWith("~") ? "teamwork" : "commander";
        return "Choose one —";
      }),
  );
  if (!d.keywords.includes("Station")) joinRollTables(all);
  // Leveler and station cards (CR 711, 721): the striations' abilities are compiled after the rest, each with its condition.
  const striated = striations(d, all);
  if (striated === "fail") out.unsupported.push("(a striated text box that doesn't read as levels or station symbols)");
  const lines = striated && striated !== "fail" ? striated.base : all;
  // Spree (CR 702.172a): "Choose one or more modes. As an additional cost to cast this spell, pay the costs associated
  // with those modes." Each mode is a "+ [cost] — [effect]" line.
  // Tiered (CR 702.183a): the same, but exactly one mode, its cost an additional cost: "• Cure — {0} — [effect]".
  let spree: { costs: string[]; texts: string[]; lines: string[]; tiered?: true } | undefined;
  // Entwine (CR 702.42a): "You may choose all modes of this spell instead of just the number specified. If you do, you
  // pay an additional [cost]." Mana costs only.
  let entwine: { cost: string; raw: string } | undefined;
  // Escalate (CR 702.120a): "For each mode you choose beyond the first as you cast this spell, you pay an additional
  // [cost]": mana, or one cost beyond mana ("Escalate—Discard a card.").
  let escalate: { mana?: string; cost?: AdditionalCost; text: string; raw: string } | "fail" | undefined;
  // Pawprints (CR 700.2i): "Choose up to five {P} worth of modes. You may choose the same mode more than once." and a
  // "{P}{P} — [effect]" line for each mode.
  let paws: { budget: number; costs: number[]; texts: string[]; lines: string[] } | undefined;
  for (const [li, raw] of lines.entries()) {
    // Converge (CR 207.2c) is an ability word: it has no rules meaning of its own; neither have flavor words, like "Gae
    // Bolg — Equip {4}" (CR 207.2d).
    let line = raw.trim().replace(/^Converge — /, "").replace(/^[A-Z][^—•"]* — (?=Equip\b)/, "");
    // An instant's or sorcery's ability word ("Spell mastery — If ...", CR 207.2c): no rules meaning either.
    if (isSpell) line = line.replace(SPELL_ABILITY_WORD, "");
    // Ascendant Acolyte: "~ enters with a +1/+1 counter on it for each +1/+1 counter among other creatures you control":
    // counted as it enters, when it isn't on the battlefield yet (CR 614.1c), so the same as "among creatures you control".
    line = line.replace(/^(~ enters with a \+1\/\+1 counter on it for each \+1\/\+1 counter among) other (creatures you control\.)$/, "$1 $2");
    // An ability word (CR 207.2c) or a flavor word (Khârn's "Berzerker — ", CR 207.2d) before a static or replacement
    // ability: no rules meaning. Not a keyword written with a dash ("Boast — ", CR 702), a chapter number ("II — ", CR
    // 714.2b) or a modal choice.
    // "10,000 Needles — " (Jumbo Cactuar) starts with a number.
    const word = !isSpell ? /^([A-Z][^—•":{}]*?|\d[\d,]* [A-Z][^—•":{}]*?) — (?![{+•])/.exec(line) : null;
    // "... faces a villainous choice — " (CR 701.55a) is the instruction itself.
    if (word && !KEYWORD_WORDS.has(word[1]!.toLowerCase()) && !/^[IVX]+(?:, [IVX]+)*$/.test(word[1]!) && !/^(?:Choose\b|To solve$)/.test(word[1]!) && !/\bfaces? a villainous choice$/.test(word[1]!)) line = line.slice(word[0].length);
    // "Vivid — {T}: For each color among permanents you control, add ..." (Bloom Tender): an ability word too.
    else if (!isSpell && /^Vivid — \{/.test(line)) line = line.replace(/^Vivid — /, "");
    if (!line) continue;
    // Conspiracy's draft-matters lines (CR 905.2) in a game no draft came before (oracle/draft.ts).
    const drafted = draftLine(line);
    if (drafted === null) continue;
    if (typeof drafted === "string") line = drafted;
    else if (drafted) {
      // An ability that does nothing: its cost or trigger event as the card says, with no effect.
      const ab = drafted.kind === "activated" ? parseActivated(`${drafted.cost}: Draw a card.`) : parseTrigger(`${drafted.when}, draw a card.`);
      if (!ab || ab === "fail") out.unsupported.push(raw);
      else if (drafted.kind === "activated") out.activated.push(bindThisAbility({ ...(ab as ActivatedAbility), body: { targets: [], effects: [], text: line, inert: true } }, line));
      else out.triggers.push(bindThisAbility({ ...(ab as TriggeredAbility), body: { targets: [], effects: [], text: line, inert: true } }, line));
      continue;
    }
    // Adaptive Training Post: "Whenever you cast ..., if ~ has fewer than three charge counters on it, put a charge counter
    // on it": "it" is ~ both times, not the spell.
    line = line.replace(/^(Whenever you cast [^,]+, if ~ has [^,]+ counters on it, put an? [^ ,]+ counter on) it\.$/, "$1 ~.");
    // Narcolepsy: "At the beginning of each upkeep, if enchanted creature is untapped, tap it": "it" is that creature.
    line = line.replace(/^(At the beginning of [^,]+, if enchanted creature is (?:un)?tapped, (?:un)?tap) it\.$/, "$1 enchanted creature.");
    // Stature, Size Shifter: "~ can't be blocked if ~'s power is 1 or less"; Illvoi Infiltrator: "... if you've cast two or
    // more spells this turn": a static ability's condition, checked continuously, the same as "as long as".
    line = line.replace(/^~ can't be blocked if (~'s power is \d+ or less|you've cast two or more spells this turn)\.$/, "~ can't be blocked as long as $1.");
    // Whiplash, Vengeful Engineer: "Whenever ~ attacks, if he's equipped, ...": ~ itself.
    line = line.replace(/^(Whenever ~ attacks, if) (?:he|she)'s equipped, /, "$1 it's equipped, ");
    // Divine Sacrament: "Threshold — White creatures get an additional +1/+1 as long as there are seven or more cards in
    // your graveyard": a second, conditional bonus on top of the first line's (CR 613.4c adds them both).
    line = line.replace(/^((?:Threshold — )?(?:White|Blue|Black|Red|Green) creatures get) an additional (\+\d+\/\+\d+ as long as .+)$/, "$1 $2");
    // Poisonous N given to other creatures ("All Sliver creatures have poisonous 1", Virulent Sliver; "Enchanted creature
    // has poisonous 3"): "Whenever this creature deals combat damage to a player, that player gets N poison counters"
    // (CR 702.70a), one ability for each instance (702.70b).
    const poisonous = /^(All [A-Z][a-z]+ creatures have|Enchanted creature has) poisonous (\d+)\.$/.exec(line);
    if (poisonous) {
      const n = Number(poisonous[2]);
      line = `${poisonous[1]} "Whenever this creature deals combat damage to a player, that player gets ${n === 1 ? "a poison counter" : `${n} poison counters`}."`;
    }
    // "~ can't be copied." (See Double): copy effects make no copy of this spell (CR 707.10).
    if (isSpell && line === "~ can't be copied.") {
      uncopyableSpell = true;
      continue;
    }
    // "~ has all activated abilities of ..." (CompiledCard.borrows).
    const borrow = /^(?:As long as ~ is on the battlefield, it|~) has all activated abilities of (.+?)( except mana abilities)?\.( You may spend mana as though it were mana of any color to activate those abilities\.)?$/.exec(line);
    // Conspicuous Snoop: "As long as the top card of your library is a Goblin card, ~ has all activated abilities of that
    // card": the printed ones of that card (rulings).
    const topBorrow = /^As long as the top card of your library is an? ([A-Z][a-z]+) card, ~ has all activated abilities of that card\.$/.exec(line);
    if (topBorrow && !out.borrows) {
      out.borrows = { filter: { kind: "object", subtypes: [topBorrow[1]!], text: `${topBorrow[1]} card` }, top: true };
      continue;
    }
    if (borrow && !out.borrows) {
      const yard = /^all (.+?) cards in (all graveyards|your graveyard)$/.exec(borrow[1]!);
      const what = yard ? parseTargetPhrase(yard[1]!) : null;
      const same = / that don't have the same name as ~$/.exec(borrow[1]!);
      const group = yard ? null : parseGroup(same ? borrow[1]!.slice(0, same.index) : borrow[1]!);
      if (yard && what?.kind === "object" && !what.controller && Object.entries(what).every(([k, v]) => v === undefined || ["kind", "types", "notTypes", "notColors", "subtypes", "text"].includes(k)))
        out.borrows = { filter: { ...what, text: `${yard[1]} cards` }, graveyard: true, ...(yard[2] === "your graveyard" ? { yours: true as const } : {}), ...(borrow[2] ? { noMana: true as const } : {}) };
      else if (group && group.filter.controller !== "enchanted") out.borrows = { filter: group.filter, ...(group.other ? { other: true } : {}), ...(same ? { notSameName: true as const } : {}), ...(borrow[2] ? { noMana: true as const } : {}), ...(borrow[3] ? { anyColor: true as const } : {}) };
      else out.unsupported.push(raw);
      continue;
    }
    // Nicol Bolas, Dragon-God: "~ has all loyalty abilities of all other planeswalkers on the battlefield": theirs as they
    // have them now (CR 613.1f), not their static, triggered or other activated abilities; "~" in them is Bolas (rulings).
    if (line === "~ has all loyalty abilities of all other planeswalkers on the battlefield." && !out.borrows) {
      out.borrows = { filter: { kind: "object", types: ["Planeswalker"], notTypes: [], notColors: [], text: "other planeswalkers" }, other: true, noMana: true, loyalty: true };
      continue;
    }
    if (line === "Spree" && isSpell && !spree) {
      spree = { costs: [], texts: [], lines: [raw] };
      continue;
    }
    if (line === "Tiered" && isSpell && !spree) {
      spree = { costs: [], texts: [], lines: [raw], tiered: true };
      continue;
    }
    const spreeMode = spree && (spree.tiered ? /^• [A-Z][^—•]*? — ((?:\{[0-9WUBRGC]+\})+) — (.+)$/ : /^\+ ((?:\{[0-9WUBRGC]+\})+) — (.+)$/).exec(line);
    if (spree && spreeMode) {
      spree.costs.push(spreeMode[1]!);
      spree.texts.push(spreeMode[2]!);
      spree.lines.push(raw);
      continue;
    }
    const pawHeader = isSpell && !paws && /^Choose up to (one|two|three|four|five|six) \{P\} worth of modes\. You may choose the same mode more than once\.$/.exec(line);
    if (pawHeader) {
      paws = { budget: num(pawHeader[1]!), costs: [], texts: [], lines: [raw] };
      continue;
    }
    const pawMode = paws && /^((?:\{P\})+) — (.+)$/.exec(line);
    if (paws && pawMode) {
      paws.costs.push(pawMode[1]!.length / 3);
      paws.texts.push(pawMode[2]!);
      paws.lines.push(raw);
      continue;
    }
    const esc = isSpell && !escalate && /^Escalate(?: ((?:\{[0-9WUBRGC]+\})+)|—(.+)\.)$/.exec(line);
    if (esc) {
      const cost = esc[2] ? parseAdditionalCost(esc[2].replace(/^./, (c) => c.toLowerCase())) : null;
      // Costs beyond mana that add up per mode: discarding, tapping, sacrificing (n of them for each mode).
      if (esc[1] && parseManaCost(esc[1]).supported) escalate = { mana: esc[1], text: esc[1], raw };
      else if (cost && (cost.kind === "tap" || cost.kind === "sacrifice" || (cost.kind === "discard" && !cost.random && !cost.oneOf)) && !("x" in cost && cost.x))
        escalate = { cost, text: esc[2]!, raw };
      else {
        escalate = "fail";
        out.unsupported.push(raw);
      }
      continue;
    }
    const ent = isSpell && /^Entwine ((?:\{[0-9WUBRGC]+\})+)$/.exec(line);
    if (ent && !entwine && parseManaCost(ent[1]!).supported) {
      entwine = { cost: ent[1]!, raw };
      continue;
    }
    // Deck construction, not play: the deck checker reads it (deckLimit).
    if (/^A deck can have (?:any number of|up to \w+) cards named ~\.$/.test(line)) continue;
    // Also deck construction: who can be a commander (CR 903.3, deck.ts canBeCommander).
    if (/^~ can be your commander\.$/.test(line)) continue;
    if (line === "Start your engines!") {
      out.startYourEngines = true; // CR 702.179a
      continue;
    }
    // Sagas (CR 714): read ahead (CR 702.155), and chapter abilities "I, II — [Effect]", each a triggered ability
    // (CR 714.2b-c).
    if (d.subtypes.includes("Saga")) {
      if (line === "Read ahead") {
        out.readAhead = true;
        continue;
      }
      const chapter = /^((?:I|II|III|IV|V|VI|VII)(?:, (?:I|II|III|IV|V|VI|VII))*) — (.+)$/.exec(line);
      if (chapter) {
        // "I, II, III — Pain — You draw a card ...": a chapter's name is a flavor word, with no rules meaning (CR 207.2d).
        const body = parseBody(chapter[2]!.replace(/^(?!Choose\b)[A-Z][^—•:"]{0,30}? — (?=\S)/, ""), {});
        if (!body) out.unsupported.push(raw);
        else for (const n of chapter[1]!.split(", ")) out.triggers.push(bindThisAbility({ event: "chapter", chapter: ROMAN.indexOf(n), body } as TriggeredAbility, line));
        continue;
      }
    }
    // "Max speed — [Ability]": "As long as your speed is 4, this object has '[Ability]'" (CR 702.178a).
    const maxSpeed = /^Max speed — (.+)$/.exec(line);
    // Vnwxt: "Max speed — If you would draw a card, draw two cards instead": the replacement only at max speed.
    if (maxSpeed?.[1] === "If you would draw a card, draw two cards instead.") {
      out.drawTwoInstead = "always";
      out.drawTwoIf = { kind: "maxSpeed" };
      continue;
    }
    if (maxSpeed) {
      if (!conditionalAbility(d, maxSpeed[1]!, out, { kind: "maxSpeed" })) out.unsupported.push(raw);
      continue;
    }
    // "∞ — [Ability]": "As long as this permanent is harnessed, it has [ability]" (CR 702.186b).
    const infinity = /^∞ — (.+)$/.exec(line);
    if (infinity) {
      if (!conditionalAbility(d, infinity[1]!, out, { kind: "harnessed" })) out.unsupported.push(raw);
      continue;
    }
    // Cases (CR 719.3): "To solve — [Condition]" means "At the beginning of your end step, if [condition] and this Case is
    // not solved, this Case becomes solved", checked as it triggers and as it resolves (603.4, rulings); "Solved —
    // [Ability]" is that ability only while it's solved (702.169).
    const toSolve = d.subtypes.includes("Case") && /^To solve — (.+)\.$/.exec(line);
    if (toSolve) {
      const t = solveTrigger(d, toSolve[1]!);
      if (t) out.triggers.push(t);
      else out.unsupported.push(raw);
      continue;
    }
    const solved = d.subtypes.includes("Case") && /^Solved — (.+)$/.exec(line);
    if (solved) {
      // Like a Class level's abilities: each kind of ability (static, triggered, activated, from the top) made conditional.
      const part = { header: "Solved", cond: { kind: "solved" as const }, lines: [solved[1]!] };
      if (!addStriation(part, out, (l) => compile({ ...d, oracleText: l, keywords: [] }), compile({ ...d, oracleText: "", keywords: [] }))) out.unsupported.push(raw);
      continue;
    }
    // Loyalty abilities (CR 606): "+1: ...", "−2: ...", "0: ...", "−X: ...". Given in quotes, they're bracketed
    // ('Planeswalkers you control have "[−4]: ..."'): the ability is still a loyalty ability (CR 606.3).
    const loyal = /^([+−-]?)(\d+|X): (.+)$/.exec(line) ?? /^\[([+−-]?)(\d+|X)\]: (.+)$/.exec(line);
    if (loyal && (d.types.includes("Planeswalker") || line.startsWith("["))) {
      const ab = parseLoyalty(loyal[1]!, loyal[2]!, loyal[3]!, raw);
      if (ab === "fail") out.unsupported.push(raw);
      else out.activated.push(bindThisAbility(ab, line));
      continue;
    }
    // "Exhaust — [Cost]: Add ..." is a mana ability that can be activated only once (CR 702.177a, 605.1a).
    const exhaust = /^Exhaust — (.+)$/.exec(line);
    // An ability word ("Domain — ") has no rules meaning (CR 207.2c). One with an activation condition (Mox Opal's
    // metalcraft) goes the activated ability's way, which reads the condition.
    const manaAb = exhaust ? parseManaAbility(exhaust[1]!) : parseManaAbility(/Activate only/.test(line) ? line : stripAbilityWord(line));
    if (manaAb && exhaust) {
      if (manaAb.oncePerTurn) out.unsupported.push(raw);
      else out.mana.push({ ...manaAb, text: line, onceEver: true, exhaust: true });
      continue;
    }
    if (manaAb) {
      out.mana.push(manaAb);
      continue;
    }
    const manaTrigger = parseManaTrigger(line);
    if (manaTrigger) {
      if (manaTrigger === "fail") out.unsupported.push(raw);
      else (out.manaTriggers ??= []).push(manaTrigger);
      continue;
    }
    const backup = /^Backup (\d+)((?:, backup \d+)*)$/.exec(line);
    if (backup) {
      const ns = [backup[1]!, ...[...backup[2]!.matchAll(/\d+/g)].map((x) => x[0])].map(Number);
      const tr = backupTriggers(ns, lines.slice(li + 1));
      if (tr) out.triggers.push(...tr);
      else out.unsupported.push(raw);
      continue;
    }
    // Mayhem without a cost (CR 702.187c): a land played from the graveyard the turn it was discarded.
    if (line === "Mayhem" && d.types.includes("Land") && d.types.length === 1) {
      out.mayhemLand = true;
      continue;
    }
    const yard = parseGraveyardKeyword(line, d);
    if (yard !== null) {
      if (yard === "fail") out.unsupported.push(raw);
      else if ("fromExile" in yard) {
        out.castFromExile = true;
        if (yard.fromGraveyard) (out.fromGraveyard ??= []).push(yard.fromGraveyard);
      } else if ("fromGraveyard" in yard) (out.fromGraveyard ??= []).push(yard.fromGraveyard);
      else if ("buyback" in yard) {
        out.buyback = yard.buyback;
        if (yard.costs) [out.buybackCosts, out.buybackText] = [yard.costs, yard.text];
      }
      else if ("rebound" in yard) out.rebound = true;
      else if ("escapesWith" in yard) out.escapesWith = yard.escapesWith;
      else out.activated.push(yard.unearth);
      continue;
    }
    // Awaken N—[cost] (CR 702.113a): an alternative cost, and a spell ability added after the spell's own (see below).
    const awakenLine = /^Awaken (\d+)—((?:\{[^}]+\})+)$/.exec(line);
    if (awakenLine && isSpell && !awaken && parseManaCost(awakenLine[2]!).supported && !parseManaCost(awakenLine[2]!).hasX) {
      awaken = { n: Number(awakenLine[1]), raw };
      (out.altCosts ??= []).push({ kind: "awaken", mana: awakenLine[2]! });
      continue;
    }
    if (/^Awaken\b/.test(line)) {
      out.unsupported.push(raw);
      continue;
    }
    // Splice onto Arcane [cost] (CR 702.47a): only a mana cost, and only one splice ability.
    const splice = /^Splice onto (Arcane|instant or sorcery) ((?:\{[^}]+\})+)$/.exec(line);
    if (splice && isSpell && !out.splice && parseManaCost(splice[2]!).supported && !parseManaCost(splice[2]!).hasX) {
      out.splice = { onto: splice[1] === "Arcane" ? "Arcane" : "instantOrSorcery", mana: splice[2]! };
      continue;
    }
    if (/^Splice onto\b/.test(line)) {
      out.unsupported.push(raw);
      continue;
    }
    const costKw = parseCostKeyword(line, d);
    if (costKw !== null) {
      if (costKw === "fail") out.unsupported.push(raw);
      else {
        if (costKw.delve) out.delve = true;
        if (costKw.assist) out.assist = true;
        // Two of the same: each would work separately (CR 702.153b), which isn't modeled.
        const twice = (costKw.madness && out.madness) || (costKw.miracle && out.miracle) || (costKw.suspend && out.suspend) || (costKw.casualty && out.casualty) || (costKw.dredge && out.dredge) || (costKw.plot && out.plot) || (costKw.foretell && out.foretell) || (costKw.alt && out.altCosts?.some((a) => a.kind === costKw.alt!.kind));
        if (twice) {
          out.unsupported.push(raw);
          continue;
        }
        if (costKw.alt) (out.altCosts ??= []).push(costKw.alt);
        if (costKw.madness) out.madness = costKw.madness;
        if (costKw.miracle) out.miracle = costKw.miracle;
        if (costKw.plot) out.plot = costKw.plot;
        if (costKw.foretell) out.foretell = costKw.foretell;
        if (costKw.suspend) out.suspend = costKw.suspend;
        if (costKw.casualty) out.casualty = costKw.casualty;
        if (costKw.dredge) out.dredge = costKw.dredge;
        if (costKw.impending) out.impending = costKw.impending;
        if (costKw.faceDown) {
          if (out.faceDownCast) out.unsupported.push(raw); // two ways to turn it face up: not modeled
          else out.faceDownCast = costKw.faceDown;
        }
        // Evoke's sacrifice trigger goes first, so the card's own enters abilities can resolve before it (rulings).
        if (costKw.trigger) costKw.alt?.kind === "evoke" ? out.triggers.unshift(costKw.trigger) : out.triggers.push(costKw.trigger);
        if (costKw.activated) out.activated.push(costKw.activated);
      }
      continue;
    }
    // Ascend on an instant or sorcery is a spell ability, the spell's first instruction (CR 702.131a).
    if (line === "Ascend" && isSpell) {
      ascendSpell = true;
      continue;
    }
    // Exert (CR 701.43d): "You may exert ~ as it attacks. When you do, it gets +2/+2 until end of turn." The "when you
    // do" ability triggers when it's exerted (linked, CR 607.2h); "it" is the exerted creature itself.
    // Combat Celebrant: "If ~ hasn't been exerted this turn, you may exert it as it attacks" (with additional combats).
    const exert = /^(?:You may exert ~|(If ~ hasn't been exerted this turn), you may exert it) as (?:it|he|she|they|~) attacks?\.(?: When you do, (.+))?$/.exec(line);
    if (exert) {
      const body = exert[2] ? parseBody(exert[2].replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|can't)\b)/, "~ ").replace(/^(?:he|she) /, "it "), { selfIt: true }) : undefined;
      if (out.exert || body === null) out.unsupported.push(raw);
      else {
        out.exert = exert[1] ? "notThisTurn" : true;
        if (body) out.triggers.push({ event: "selfExerted", body });
      }
      continue;
    }
    // "Firebending X, where X is ~'s power" (CR 702.189a): X is counted as the ability resolves.
    const fireX = /^Firebending X, where X is (.+)\.$/.exec(line);
    if (fireX) {
      const def = parseCount(fireX[1]!, null);
      if (def) out.triggers.push(firebending(def, "Firebending X"));
      else out.unsupported.push(raw);
      continue;
    }
    // "Protection from black and from red" is two protection abilities (CR 702.16g).
    // "Protection from spells and from permanents that were cast this turn" (Emrakul, the World Anew): the same, two.
    // "Protection from blue, from black, and from red" (Oversoul of Dusk): three.
    const kwLine = line.replace(/(protection) from (\w+), from (\w+),? and from (\w+)/gi, "$1 from $2, $1 from $3, $1 from $4").replace(/(protection|hexproof) from (\w+) and from (\w+|permanents that were cast this turn)/gi, "$1 from $2, $1 from $3");
    if (isKeywordLine(kwLine)) {
      out.textKeywords.push(...textKeywords(kwLine));
      continue;
    }
    const kw = keywordAbilities(kwLine, d);
    if (kw) {
      out.triggers.push(...kw.triggers);
      out.activated.push(...kw.activated);
      out.textKeywords.push(...textKeywords(kwLine));
      if (kw.convoke) out.convoke = true;
      if (kw.improvise) out.improvise = true;
      if (kw.epic) out.epic = true;
      if (kw.paradigm) out.paradigm = true;
      for (let i = 0; i < (kw.undaunted ?? 0); i++) out.costLess = [...(out.costLess ?? []), { count: { kind: "players", opponents: true } }];
      if (kw.affinity.length) out.costLess = [...(out.costLess ?? []), ...kw.affinity.map((filter) => ({ count: { kind: "permanents" as const, filter } }))];
      if (kw.plusCounters) {
        const prev = out.entersWithCounters?.n ?? 0;
        if (typeof prev !== "number") {
          out.unsupported.push(raw); // modular on top of a counted number: not modeled
          continue;
        }
        out.entersWithCounters = { counter: "+1/+1", n: prev + kw.plusCounters };
      }
      if (kw.entersCounter) {
        if (out.entersWithCounters) {
          out.unsupported.push(raw); // two kinds of counters as it enters: not modeled
          continue;
        }
        out.entersWithCounters = { counter: kw.entersCounter.counter, n: kw.entersCounter.n };
      }
      if (kw.bloodthirst) out.bloodthirst = (out.bloodthirst ?? 0) + kw.bloodthirst;
      if (kw.sunburst) {
        if (out.sunburst) {
          out.unsupported.push(raw); // two sunburst abilities: not modeled
          continue;
        }
        out.sunburst = kw.sunburst;
      }
      if (kw.enlist) {
        if (out.enlist) {
          out.unsupported.push(raw); // two enlist abilities: not modeled (CR 702.154d)
          continue;
        }
        out.enlist = true;
      }
      if (kw.amplify) {
        if (out.amplify) {
          out.unsupported.push(raw);
          continue;
        }
        out.amplify = kw.amplify;
      }
      if (kw.devour) {
        if (out.devour) {
          out.unsupported.push(raw); // two devour abilities: not modeled
          continue;
        }
        out.devour = kw.devour;
      }
      if (kw.entersOptions.length) out.entersOptions = [...(out.entersOptions ?? []), ...kw.entersOptions];
      out.statics.push(...kw.statics);
      continue;
    }
    if (/^~ enters tapped\.$/.test(line)) {
      out.entersTapped = true;
      continue;
    }
    // Traxos, Scourge of Kroog: "~ enters tapped and doesn't untap during your untap step": both.
    if (/^~ enters tapped and doesn't untap during your untap step\.$/.test(line)) {
      const st = parseStatic("~ doesn't untap during your untap step.");
      if (!st) {
        out.unsupported.push(raw);
        continue;
      }
      out.entersTapped = true;
      out.statics.push({ ...st, text: line });
      continue;
    }
    // "Creatures your opponents control enter tapped." "Artifacts and lands enter tapped." "Creatures and nonbasic
    // lands your opponents control enter tapped." An ability word may come first (CR 207.2c).
    const othersTapped = /^(?:[A-Z][A-Za-z' -]+ — )?([A-Z][^.—]*?) enter tapped\.$/.exec(line);
    if (othersTapped && !/\b(other|played|this turn|until)\b/i.test(othersTapped[1]!)) {
      const words = othersTapped[1]!;
      const split = /^(\w+) and (\w+ \w+)( your opponents control)?$/.exec(words);
      const groups = [parseGroup(words, true)];
      if (!groups[0] && split) groups.splice(0, 1, parseGroup(`${split[1]}${split[3] ?? ""}`, true), parseGroup(`${split[2]}${split[3] ?? ""}`, true));
      if (groups.every((g) => g && !g.other)) {
        for (const g of groups) (out.othersEnterTapped ??= []).push({ filter: g!.filter, text: line });
        continue;
      }
    }
    const othersUntapped = /^([A-Z][a-z]+) you control enter untapped\.$/.exec(line);
    if (othersUntapped) {
      // "Gates you control" (Gond Gate): a land type isn't read as a plural, "each Gate you control" is the same group.
      const g = othersUntapped[1] === "Gates" ? parseGroup("each Gate you control") : parseGroup(`${othersUntapped[1]} you control`, true);
      if (g && !g.other) {
        (out.othersEnterUntapped ??= []).push({ filter: g.filter, text: line });
        continue;
      }
    }
    // "Each other creature you control enters with an additional +1/+1 counter on it" (Renata, Called to the Hunt): a
    // replacement effect on other permanents entering while this one is on the battlefield (CR 614.1c). Whether one
    // without "other" that could describe itself applies to itself isn't worked out, so that stays out.
    // "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness"
    // (Arwen, Weaver of Hope): its toughness as the creature enters (rulings).
    // "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s power and as a
    // Mutant in addition to its other types" (Master Biomancer): its power as the creature enters (rulings), and the type
    // whatever that power is.
    // Bloodspore Thrinax: "Each other creature you control enters with an additional X +1/+1 counters on it, where X is the
    // number of +1/+1 counters on ~": as each one would enter (CR 614.1c); not creatures entering with it (rulings).
    const byCounters = new RegExp(`^Each other (creature you control) enters with an additional X ${COUNTER} counters on it, where X is the number of ${COUNTER} counters on ~\\.$`).exec(line);
    if (byCounters) {
      const g = parseGroup(`each ${byCounters[1]}`);
      const per = parseCount(`the number of ${byCounters[3]} counters on ~`, null);
      if (!g || g.filter.kind !== "object" || g.filter.controller !== "you" || !per || typeof per !== "object") out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(byCounters[2]!), n: 1, per, text: line });
      continue;
    }
    const byToughness = new RegExp(`^Each other (creature you control) enters with a number of additional ${COUNTER} counters on it equal to ~'s (toughness|power)(?: and as an? ([A-Z][a-z]+) in addition to its other types)?\\.$`).exec(line);
    if (byToughness) {
      const g = parseGroup(`each ${byToughness[1]}`);
      const sub = byToughness[4];
      if (!g || g.filter.kind !== "object" || g.filter.controller !== "you" || (sub && !CREATURE_TYPES.has(sub))) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(byToughness[2]!), n: 1, ...(byToughness[3] === "power" ? { perSourcePower: true as const } : { perSourceToughness: true as const }), ...(sub ? { asSubtype: sub } : {}), text: line });
      continue;
    }
    // Displaced Dinosaurs: "As a historic permanent you control enters, it becomes a 7/7 Dinosaur creature in addition to
    // its other types": a replacement effect on other permanents entering (CR 614.1c), judged as each would exist on the
    // battlefield (CR 614.12); it enters as a 7/7 Dinosaur creature, not entering and then becoming one (rulings). Layers 4
    // and 7b, for as long as it's on the battlefield. One that could describe itself (Displaced Dinosaurs isn't historic)
    // stays out, as with Renata's.
    const othersAs = /^As an? (.+? you control) enters, it becomes (an? .+)\.$/.exec(line);
    if (othersAs) {
      const g = parseGroup(`each ${othersAs[1]}`);
      const mods = parseBecomes(othersAs[2]!);
      // Whether this card fits the group as printed: by card type, supertype or subtype, each of "anyOf" too.
      const fits = (f: TargetSpec): boolean => f.kind === "object" && (f.anyOf ? f.anyOf.some(fits) : (!f.types?.length || f.types.some((t) => d.types.includes(t))) && (f.supertypes ?? []).every((t) => d.supertypes.includes(t)) && (f.subtypes ?? []).every((t) => d.subtypes.includes(t)));
      const self = g?.filter.kind === "object" && fits(g.filter);
      if (!g || g.other || self || g.filter.kind !== "object" || g.filter.controller !== "you" || g.filter.chosen || !mods) out.unsupported.push(raw);
      else (out.othersEnterAs ??= []).push({ filter: g.filter, mods, text: line });
      continue;
    }
    // Vampire Socialite: "As long as an opponent lost life this turn, each other Vampire you control enters with an
    // additional +1/+1 counter on it": only while that's so, as each one would enter.
    const socialite = /^As long as (an opponent lost life this turn), (each other .+)$/.exec(line);
    const socialiteIf = socialite ? parseStaticCondition(socialite[1]!, { affects: { kind: "self" }, mods: [], text: line }) : undefined;
    const othersLine = socialite ? `E${socialite[2]!.slice(1)}` : line;
    const othersExtra = new RegExp(`^Each (other )?(.+? you control(?: [^,]+?)?) enters with (an|a|one|two|three) additional ${COUNTER} counters? on it( for each [A-Z][a-z]+ you already control| for each mana from (?:a Treasure|an artifact source) spent to cast it| for each land that entered the battlefield under your control this turn)?\\.$`).exec(othersLine);
    if (socialite && (!othersExtra || !socialiteIf)) {
      out.unsupported.push(raw);
      continue;
    }
    if (othersExtra) {
      // "Each creature you control that's a Wolf or a Werewolf" (Arlinn, Voice of the Pack) is "each Wolf or Werewolf creature".
      const that = /^creature you control that's an? ([A-Z]\w+) or an? ([A-Z]\w+)$/.exec(othersExtra[2]!);
      const g = parseGroup(`each ${that ? `${that[1]} or ${that[2]} creature you control` : othersExtra[2]}`);
      const types = g?.filter.types ?? [];
      const couldBeSelf = !othersExtra[1] && d.types.some((ty) => types.includes(ty) || (!types.length && ty === "Creature"));
      // "Each other creature you control of the chosen type" (Metallic Mimic): the type chosen as it entered.
      const chosenOk = !g?.filter.chosen || (g.filter.kind === "object" && g.filter.chosen === "type" && /^As ~ enters(?: the battlefield)?, choose a creature type\.$/m.test(normalizeSelf(d)));
      if (!g || g.other || couldBeSelf || g.filter.kind !== "object" || g.filter.controller !== "you" || !chosenOk) out.unsupported.push(raw);
      else {
        // "For each Angel you already control" (Giada, Font of Hope): a creature type, counted as each one enters.
        // "For each mana from an artifact source spent to cast it" (Coin of Mastery): see perSpentFrom.
        const spentFrom = othersExtra[5] && / for each mana from /.test(othersExtra[5]) ? (/Treasure/.test(othersExtra[5]) ? "treasure" : "artifact") : undefined;
        // Bioengineered Future: "... for each land that entered the battlefield under your control this turn", counted as
        // each one would enter, lands from before it was on the battlefield too (rulings).
        const landsIn = othersExtra[5] && / for each land that entered /.test(othersExtra[5]) ? parseCount("land that entered the battlefield under your control this turn", null, true) : undefined;
        const per = othersExtra[5] && !spentFrom && !landsIn ? / for each ([A-Z][a-z]+) you already control$/.exec(othersExtra[5])![1]! : undefined;
        if ((per && !CREATURE_TYPES.has(per)) || landsIn === null) out.unsupported.push(raw);
        else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(othersExtra[4]!), n: /^an?$/.test(othersExtra[3]!) ? 1 : num(othersExtra[3]!), ...(per ? { perControlled: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [per], text: `${per} you control` } as TargetSpec } : {}), ...(spentFrom ? { perSpentFrom: spentFrom as "treasure" | "artifact" } : {}), ...(landsIn ? { per: landsIn } : {}), ...(socialiteIf ? { while: socialiteIf } : {}), text: line });
      }
      continue;
    }
    // Master Chef's granted "Other creatures you control enter with an additional +1/+1 counter on them": Renata's ability
    // in the plural. "This creature enters with an additional +1/+1 counter on it": a replacement effect on itself
    // entering (CR 614.1c), which applies as it would exist on the battlefield (CR 614.12, rulings on Master Chef).
    // Kalain, Reclusive Painter: "... for each mana from a Treasure spent to cast them" (see perSpentFrom).
    // Gev, Scaled Scorch: "... for each opponent who lost life this turn": counted as each one would enter.
    // Curator Beastie: "Colorless creatures you control enter with two additional +1/+1 counters on them": without
    // "other", only where this permanent couldn't be one of them (as for "each other ..." above).
    // Gorma, the Gullet: "Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature
    // that died under your control this turn": from a permanent already on the battlefield, so not Gorma itself or
    // creatures entering with it (rulings), counted as each one would enter.
    const gorma = new RegExp(`^Nontoken creatures you control enter with an additional ${COUNTER} counter on them for each (creature that died under your control this turn)\\.$`).exec(line);
    if (gorma) {
      const per = parseCount(gorma[2]!, null, true);
      if (!per) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], token: false, controller: "you", text: "nontoken creature you control" }, counter: counterKind(gorma[1]!), n: 1, per, text: line });
      continue;
    }
    const pluralAll = new RegExp(`^(?!Other )([A-Z][a-z]+ creatures you control) enter with (an|a|one|two|three) additional ${COUNTER} counters? on them\\.$`).exec(line);
    const othersPlural = pluralAll ? ([pluralAll[0], pluralAll[1], pluralAll[2], pluralAll[3], undefined, undefined] as unknown as RegExpExecArray) : new RegExp(`^Other (.+? you control) enter with (an|a|one|two|three) additional ${COUNTER} counters? on them( for each mana from (?:a Treasure|an artifact source) spent to cast them| for each (opponent who lost life this turn))?\\.$`).exec(line);
    if (othersPlural) {
      const g = parseGroup(`each ${(pluralAll ? othersPlural[1]!.toLowerCase() : othersPlural[1]!).replace(/s you control$/, " you control")}`);
      const f = g?.filter.kind === "object" ? g.filter : undefined;
      const selfMatches = !f || f.colorCount === "colorless" ? !d.colors.length : !f.colors?.length || f.colors.some((c) => d.colors.includes(c as never));
      // Bard Class: "Legendary creatures you control enter with an additional +1/+1 counter on them", from a permanent that
      // isn't a creature, so never about itself.
      const legends = !!f && f.supertypes?.length === 1 && f.supertypes[0] === "Legendary" && !f.colors?.length && f.colorCount === undefined && !d.types.includes("Creature");
      if (pluralAll && (!f || f.types?.length !== 1 || f.types[0] !== "Creature" || f.subtypes?.length || (!legends && ((f.colorCount !== "colorless" && !f.colors?.length) || (f.colorCount !== undefined && f.colorCount !== "colorless") || (d.types.includes("Creature") && selfMatches))))) {
        out.unsupported.push(raw);
        continue;
      }
      const spentFrom = othersPlural[4] && !othersPlural[5] ? (/Treasure/.test(othersPlural[4]) ? "treasure" : "artifact") : undefined;
      const per = othersPlural[5] ? parseCount(othersPlural[5], null, true) : undefined;
      if (!g || g.other || g.filter.kind !== "object" || g.filter.controller !== "you" || g.filter.chosen || per === null) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(othersPlural[3]!), n: /^an?$/.test(othersPlural[2]!) ? 1 : num(othersPlural[2]!), ...(spentFrom ? { perSpentFrom: spentFrom as "treasure" | "artifact" } : {}), ...(per ? { per } : {}), text: line });
      continue;
    }
    const selfExtra = new RegExp(`^~ enters with (an|a|one|two|three) additional ${COUNTER} counters? on it\\.$`).exec(line);
    if (selfExtra) {
      (out.entersWithAdditional ??= []).push({ counter: counterKind(selfExtra[2]!), n: /^an?$/.test(selfExtra[1]!) ? 1 : num(selfExtra[1]!) });
      continue;
    }
    // Ral, Leyline Prodigy: "~ enters with an additional loyalty counter on ~ for each instant and sorcery spell you've
    // cast this turn": counted as it enters (CR 614.1c), spells countered or still on the stack too (rulings).
    const selfEach = new RegExp(`^~ enters with an additional ${COUNTER} counter on (?:~|it) for each (.+)\\.$`).exec(line);
    const eachN = selfEach ? parseCount(selfEach[2]!.replace(/ spell you've cast this turn$/, " spells you've cast this turn"), null) : null;
    if (selfEach) {
      if (!eachN) out.unsupported.push(raw);
      else (out.entersWithAdditional ??= []).push({ counter: counterKind(selfEach[1]!), n: eachN });
      continue;
    }
    // "As this creature transforms into Sephiroth, One-Winged Angel, you get an emblem with ..." (CR 712.20): instructions
    // with no targets, done as it transforms.
    const asTransforms = /^As ~ transforms into ~, (.+)$/.exec(line);
    if (asTransforms) {
      const body = parseBody(capital(asTransforms[1]!), {});
      if (!body || body.targets.length || out.asTransforms || allEffects(body.effects).some((e) => e.type !== "emblem")) out.unsupported.push(raw);
      else out.asTransforms = body;
      continue;
    }
    // "As ~ enters, choose a player." (CR 614.12): True-Name Nemesis's "the chosen player". "Secretly choose an opponent"
    // (Guardian Archon): the same, but only its controller knows who until it's revealed.
    if (/^As ~ enters, choose two players\.$/.test(line) && !out.entersChoosePlayer) {
      out.entersChooseTwoPlayers = true;
      continue;
    }
    const choosePlayer = /^As (?:~|it) enters, (secretly )?choose (a player|an opponent)\.$/.exec(line);
    if (choosePlayer && !out.entersChoosePlayer) {
      out.entersChoosePlayer = choosePlayer[2] === "a player" ? "player" : "opponent";
      if (choosePlayer[1]) out.entersChooseSecret = true;
      continue;
    }
    // The Sieges: "As ~ enters, choose Khans or Dragons." then "• Khans — [ability]" and "• Dragons — [ability]", each meaning
    // "as long as [anchor word] was chosen as this permanent entered, it has [ability]" (CR 614.12b, 607.2m).
    const anchors = /^As ~ enters, choose ([A-Z]\w+) or ([A-Z]\w+)\.$/.exec(line);
    if (anchors && !out.entersAnchor && lines.slice(li + 1).filter((l) => /^• [A-Z]\w+ — /.test(l)).length === 2) {
      out.entersAnchor = [anchors[1]!, anchors[2]!];
      continue;
    }
    const anchored = out.entersAnchor && /^• ([A-Z]\w+) — (.+)$/.exec(line);
    if (anchored) {
      // "• Mardu — If a creature attacking causes a triggered ability ... triggers an additional time" (Windcrag Siege).
      const again = out.entersAnchor!.includes(anchored[1]!) ? triggersAgainLine(anchored[2]!) : null;
      if (again) (out.triggersAgain ??= []).push({ ...again, anchor: anchored[1]! });
      // Glacierwood Siege: "• Sultai — You may play lands from your graveyard." (the permission of Crucible of Worlds).
      else if (out.entersAnchor!.includes(anchored[1]!) && anchored[2] === "You may play lands from your graveyard." && !out.landsFromGraveyardIf) out.landsFromGraveyardIf = { kind: "anchor", word: anchored[1]! };
      else if (!out.entersAnchor!.includes(anchored[1]!) || !conditionalAbility(d, anchored[2]!, out, { kind: "anchor", word: anchored[1]! })) out.unsupported.push(raw);
      continue;
    }
    // "As ~ enters, choose a creature type." (CR 614.12), "~ enters tapped. As it enters, choose a color."
    const asEnters = /^(~ enters tapped\. )?As (?:~|it) enters, choose (an? (?:creature type|color)(?: other than \w+)?(?: and an? (?:creature type|color))?)\.$/.exec(line);
    if (asEnters) {
      if (asEnters[1]) out.entersTapped = true;
      for (const part of asEnters[2]!.split(" and ")) {
        const c = /^an? (creature type|color)(?: other than (\w+))?$/.exec(part)!;
        (out.entersChoose ??= []).push({ what: c[1] === "color" ? "color" : "creatureType", ...(c[2] ? { except: c[2] } : {}) });
      }
      continue;
    }
    // "As this land enters, choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk." (Eclipsed Realms,
    // CR 614.12): one of these creature types.
    const asTypeList = /^As (?:~|it) enters, choose ((?:[A-Z][a-z]+, )+or [A-Z][a-z]+)\.$/.exec(line);
    if (asTypeList) {
      const types = asTypeList[1]!.split(/, (?:or )?/);
      if (!types.every((t) => CREATURE_TYPES.has(t)) || out.entersChoose?.some((c) => c.what === "creatureType")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "creatureType", options: types });
      continue;
    }
    // "As Arachne enters, look at an opponent's hand, then choose a card type other than creature." (CR 614.12): an
    // opponent, then their hand is seen, then a card type. Kindred is a card type too, but no kindred card plays here.
    const lookThenType = /^As ~ enters, look at an opponent's hand, then choose a card type other than (\w+)\.$/.exec(line);
    if (lookThenType && !out.entersChoosePlayer && !out.entersChoose?.some((c) => c.what === "cardType")) {
      out.entersChoosePlayer = "opponent";
      out.entersLookHand = true;
      (out.entersChoose ??= []).push({ what: "cardType", options: Object.keys(CARD_TYPE_PLURAL).filter((t) => t !== capital(lookThenType[1]!)) });
      continue;
    }
    // "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery." (Cloud Key, CR 614.12): a
    // card type, kept as Chosen.cardType.
    const asCardType = /^As (?:~|it) enters, choose ((?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle)(?:, (?:or )?(?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle))+|a card type)\.$/.exec(line);
    if (asCardType) {
      if (out.entersChoose?.some((c) => c.what === "cardType")) out.unsupported.push(raw);
      // "Choose a card type" (Serra's Emissary): any that a card here can have (rulings).
      else (out.entersChoose ??= []).push({ what: "cardType", options: asCardType[1] === "a card type" ? Object.keys(CARD_TYPE_PLURAL) : asCardType[1]!.split(/, (?:or )?/).map(capital) });
      continue;
    }
    // "As ~ enters, choose a number between 1 and 10." (Talion), "choose a number." (Sanctum Prelate): a whole number, kept
    // as Chosen.number (CR 614.12; CR 107.1: the game uses only integers, and no mana value is negative, so 0 or more).
    const asNumber = /^As (?:~|it) enters, choose a number(?: between (\d+) and (\d+))?\.$/.exec(line);
    if (asNumber) {
      if (out.entersChoose?.some((c) => c.what === "number")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "number", range: asNumber[1] ? { min: Number(asNumber[1]), max: Number(asNumber[2]) } : { min: 0, max: 999 } });
      continue;
    }
    // Sanctum Prelate: "Noncreature spells with mana value equal to the chosen number can't be cast." (X as chosen, CR 601.3a)
    if (line === "Noncreature spells with mana value equal to the chosen number can't be cast.") {
      out.noncreatureChosenMvCantBeCast = true;
      continue;
    }
    // "As ~ enters, choose a nonland card name." (CR 614.12, 201.4): kept while it's on the battlefield, as Chosen.name.
    const asName = /^As (?:~|it) enters, choose (an? .*?card name(?: other than a basic land card name)?)\.$/.exec(line);
    const nameChoice = asName && parseCardNameChoice(asName[1]!);
    if (asName) {
      if (!nameChoice || out.entersChoose?.some((c) => c.what === "cardName")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "cardName", ...nameChoice });
      continue;
    }
    // Meddling Mage, Gideon's Intervention, Pithing Needle (CR 201.4): what the name chosen as it entered does.
    const nameBan =
      line === "Spells with the chosen name can't be cast." ? ({ kind: "cast", who: "all" } as const)
      : line === "Your opponents can't cast spells with the chosen name." ? ({ kind: "cast", who: "opponents" } as const)
      : line === "Activated abilities of sources with the chosen name can't be activated." ? ({ kind: "activate" } as const)
      : line === "Activated abilities of sources with the chosen name can't be activated unless they're mana abilities." ? ({ kind: "activate", exceptMana: true } as const)
      : null;
    if (nameBan) {
      (out.nameBans ??= []).push(nameBan);
      continue;
    }
    if (line === "You have protection from the chosen card name.") {
      out.protectionFromChosenName = true;
      continue;
    }
    // Suppression Field, Anointed Peacekeeper: generic mana more for activated abilities that aren't mana abilities.
    const tax = /^Activated abilities( of sources with the chosen name)? cost \{(\d+)\} more to activate unless they're mana abilities\.$/.exec(line);
    if (tax) {
      (out.activationTaxes ??= []).push({ ...(tax[1] ? { filter: { kind: "card", chosen: "name", text: "sources with the chosen name" } } : {}), n: Number(tax[2]), text: line });
      continue;
    }
    // Tithe Taker (the second half of its line, split above).
    const theirs = /^During your turn, abilities your opponents activate cost \{(\d+)\} more to activate unless they're mana abilities\.$/.exec(line);
    if (theirs) {
      (out.activationTaxes ??= []).push({ n: Number(theirs[1]), opponents: true, yourTurn: true, text: line });
      continue;
    }
    // Thromok: "Devour X, where X is the number of creatures devoured this way" (CR 702.82a; X counters for each).
    if (/^Devour X, where X is the number of creatures devoured this way$/.test(line)) {
      if (out.devour) out.unsupported.push(raw);
      else out.devour = { n: "devoured", filter: { kind: "object", types: ["Creature"], text: "creature" } };
      continue;
    }
    // Mirage's flash Auras and enchantments: castable any time, sacrificed in the next cleanup step if that wasn't a
    // time a sorcery could have been cast (see castSpell).
    if (line === "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.") {
      out.flashSacrifice = true;
      continue;
    }
    // "~ enters with X +1/+1 counters on it. If X is 5 or more, it enters with an additional X +1/+1 counters on it."
    // (Apocalypse Hydra): the X chosen, not the mana spent (rulings); one replacement effect (CR 614.1c).
    const twiceX = /^~ enters with X \+1\/\+1 counters on it\. If X is (\d+) or more, it enters with an additional X \+1\/\+1 counters on it\.$/.exec(line);
    if (twiceX) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } }, doubleIfXAtLeast: Number(twiceX[1]) };
      continue;
    }
    // Banquet Guests: "~ enters with twice X +1/+1 counters on it": the X chosen, times two (a replacement, CR 614.1c).
    if (line === "~ enters with twice X +1/+1 counters on it." && !isSpell) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" }, times: 2 } };
      continue;
    }
    // Ravenous (CR 702.156a): "This permanent enters with X +1/+1 counters on it" and "When this permanent enters, if X
    // is 5 or more, draw a card."
    if (line === "Ravenous") {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } } };
        out.triggers.push({ event: "selfEnters", ifX: 5, body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Ravenous: if X is 5 or more, draw a card." } });
      }
      continue;
    }
    // Replicate (CR 702.56a): an additional cost paid any number of times, like multikicker, and "when you cast this
    // spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid".
    const replicate = /^Replicate ((?:\{[^}]+\})+)$/.exec(line);
    if (replicate) {
      if (out.kicker || !plainMana(replicate[1]!)) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [replicate[1]!], multi: true, replicate: true };
        out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "kicked", newTargets: true }], text: "Replicate: copy ~ for each time its replicate cost was paid." } });
      }
      continue;
    }
    // Offspring (CR 702.175a): "You may pay an additional [cost] as you cast this spell" and "When this permanent enters,
    // if its offspring cost was paid, create a token that's a copy of it, except it's 1/1." Squad (CR 702.157a): "As an
    // additional cost to cast this spell, you may pay [cost] any number of times" and "When this creature enters, if its
    // squad cost was paid, create a token that's a copy of it for each time its squad cost was paid." Both are paid
    // like kicker; the copy is of it as it last existed if it has left (rulings, CR 608.2h).
    // Deadpool, Trading Card: a replacement effect on how it enters (CR 614.1c, 614.12), a text-changing effect (CR 612.5).
    if (/^As ~ enters, you may exchange (?:~'s|his|her|its) text box and another creature's\.$/.test(line) && !isSpell) {
      out.entersExchangeText = true;
      continue;
    }
    // Xantcha: a replacement effect on how it enters (CR 614.1c, 614.12); "your" is the player it would enter under.
    if (line === "~ enters under the control of an opponent of your choice." && !isSpell) {
      out.entersUnderOpponent = true;
      continue;
    }
    // "Exile ~." as an instant's or sorcery's last instruction (Spirit Water Revival): it's exiled as it finishes
    // resolving, instead of going to its owner's graveyard (CR 608.2n).
    if (line === "Exile ~." && isSpell && li === lines.length - 1) {
      out.exileSelfOnResolve = true;
      continue;
    }
    // "As an additional cost to cast this spell, (you may) waterbend {5}" (CR 701.67a): a cost paid like kicker, part of
    // which tapped artifacts and creatures can pay. "If this spell's additional cost was paid" reads as kicked.
    const waterbendCost = /^As an additional cost to cast ~, (you may )?waterbend \{(\d+)\}\.$/.exec(line);
    if (waterbendCost) {
      if (out.kicker) out.unsupported.push(raw);
      else out.kicker = { costs: [`{${waterbendCost[2]}}`], waterbend: Number(waterbendCost[2]), ...(waterbendCost[1] ? {} : { required: true as const }) };
      continue;
    }
    const offspring = /^(Offspring|Squad) ((?:\{[^}]+\})+)$/.exec(line);
    if (offspring) {
      const squad = offspring[1] === "Squad";
      if (out.kicker || !plainMana(offspring[2]!)) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [offspring[2]!], ...(squad ? { multi: true, squad: true } : { offspring: true }) };
        out.triggers.push({
          event: "selfEnters",
          ifKicked: { kind: "kicked" },
          body: squad
            ? { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: { count: { kind: "kicked" } }, what: { ref: "self" } }], text: "Squad: create a token that's a copy of ~ for each time its squad cost was paid." }
            : { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "self" }, except: { pt: [1, 1] } }], text: "Offspring: create a token that's a copy of ~, except it's 1/1." },
        });
      }
      continue;
    }
    // Kicker (CR 702.33a-c): "Kicker {2}{R}", "Kicker {1}{U} and/or {2}{B}", "Multikicker {1}{G}".
    // "Kicker {X}. X can't be 0." (Thieving Skydiver, Verdeloth): one kicker cost with X, on a card with no other X; X is
    // chosen as it's cast when it's kicked, else it's 0 (CR 107.3a, 601.2b).
    // "Kicker—Sacrifice two lands.", "Kicker—{2}{R}, Sacrifice a land.", "Kicker—Pay 3 life." (CR 702.33a, 118.8): a kicker
    // cost that isn't (only) mana, its other parts paid with the spell's other costs when it's kicked (CR 601.2h).
    const kickerOther = /^Kicker—(?:((?:\{[^}]+\})+), )?([A-Z][^{}]+?)\.?$/.exec(line);
    if (kickerOther) {
      const extraCosts = kickerOther[2]!.split(/, (?=[A-Z])/).map((t) => parseAdditionalCost(t.replace(/^./, (c) => c.toLowerCase())));
      if (out.kicker || (kickerOther[1] && !plainMana(kickerOther[1])) || extraCosts.some((c) => !c || c.kind === "revealHand" || c.kind === "forage")) out.unsupported.push(raw);
      else out.kicker = { costs: [kickerOther[1] ?? ""], extraCosts: extraCosts as AdditionalCost[], text: [kickerOther[1], kickerOther[2]!.replace(/^./, (c) => c.toLowerCase())].filter(Boolean).join(", ") };
      continue;
    }
    const kicker = /^(Multikicker|Kicker) ((?:\{[^}]+\})+)(?: and\/or ((?:\{[^}]+\})+))?(\. X can't be 0\.)?$/.exec(line);
    if (kicker) {
      const costs = [kicker[2]!, ...(kicker[3] ? [kicker[3]] : [])];
      const kickX = costs.length === 1 && kicker[1] === "Kicker" && parseManaCost(costs[0]!).hasX && !parseManaCost(d.manaCost).hasX && !/\{X\}.*\{X\}/.test(costs[0]!);
      if (out.kicker || costs.some((c) => !parseManaCost(c).supported || (parseManaCost(c).hasX && !kickX)) || (kicker[4] && !kickX)) out.unsupported.push(raw);
      else out.kicker = { costs, ...(kicker[1] === "Multikicker" ? { multi: true } : {}), ...(kicker[4] ? { xMin: 1 } : {}) };
      continue;
    }
    // "If ~ was kicked, it enters with two +1/+1 counters on it." (a replacement effect, CR 614.1c)
    const kickedCounters = new RegExp(`^If ~ was kicked(?: with its ((?:\\{[^}]+\\})+) kicker)?, it enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it\\.$`).exec(line);
    if (kickedCounters) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else
        out.entersWithCounters = {
          counter: kickedCounters[3] === "-1/-1" ? "-1/-1" : "+1/+1",
          n: { count: { kind: "wasKicked", ...(kickedCounters[1] ? { cost: kickedCounters[1] } : {}) } as Count, times: num(kickedCounters[2]!) },
        };
      continue;
    }
    // The Volvers: "If ~ was kicked with its {1}{W} kicker, it enters with two +1/+1 counters on it and with "Whenever ~
    // deals damage, you gain that much life."", "... with a +1/+1 counter on it and with flying": both parts of how it
    // enters (CR 614.1c), the ability for as long as it's on the battlefield. With two such lines, the counters add up.
    // Pouncing Kavu: "If ~ was kicked, it enters with two +1/+1 counters on it and with haste": its one kicker.
    const kickedWith = new RegExp(`^If ~ was kicked(?: with its ((?:\\{[^}]+\\})+) kicker)?, it enters(?: the battlefield)? with ${NUM} (\\+1/\\+1) counters? on it and with (.+?)\\.?$`).exec(line);
    if (kickedWith) {
      const mods = parseGrants(kickedWith[4]!);
      const prior = out.entersWithCounters;
      const priorKicks = prior && typeof prior.n === "object" && prior.n.count.kind === "sum" && prior.n.count.of.every((x) => x.kind === "wasKicked") && !prior.if ? prior.n.count.of : undefined;
      if (!mods || mods.some((m) => m.kind !== "addKeywords" && m.kind !== "addAbility") || (prior && !priorKicks)) out.unsupported.push(raw);
      else {
        const kick = { kind: "wasKicked", ...(kickedWith[1] ? { cost: kickedWith[1] } : {}) } as unknown as Count;
        out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "sum", of: [...(priorKicks ?? []), ...Array.from({ length: num(kickedWith[2]!) }, () => ({ ...kick }))] } } };
        (out.entersKicked ??= []).push({ ...(kickedWith[1] ? { cost: kickedWith[1] } : {}), mods });
      }
      continue;
    }
    // Adamant: "If at least three white mana was spent to cast ~, ~ enters with a +1/+1 counter on it." (CR 614.1c, 601.2h)
    const spentCounters = new RegExp(`^(?:Adamant — )?If ${SPENT} was spent to cast ~, (?:~|it) enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it\\.$`).exec(line);
    const spentReq = spentCounters && parseSpentReq(spentCounters[1]!);
    if (spentCounters) {
      if (out.entersWithCounters || !spentReq) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: spentCounters[3] === "-1/-1" ? "-1/-1" : "+1/+1", n: { count: { kind: "spentWas", req: spentReq }, times: num(spentCounters[2]!) } };
      continue;
    }
    // "~ enters with two +1/+1 counters on it if it wasn't cast or no mana was spent to cast it" (Freestrider Commando),
    // "... unless two or more colors of mana were spent to cast it" (Steel Exemplar): what was spent on its total cost
    // (CR 601.2h, rulings); nothing if it wasn't cast.
    const spentUnless = new RegExp(`^~ enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it (if it wasn't cast or no mana was spent to cast it|unless two or more colors of mana were spent to cast it)\\.$`).exec(line);
    if (spentUnless) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: spentUnless[2] === "-1/-1" ? "-1/-1" : "+1/+1", n: { count: { kind: "spentWas", req: spentUnless[3]!.startsWith("if") ? { none: "mana" } : { maxColors: 1 } }, times: num(spentUnless[1]!) } };
      continue;
    }
    // "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a), maybe with "This spell costs
    // {2} less to cast if evidence was collected" in the same paragraph.
    const evidence = !d.types.includes("Land") ? /^As an additional cost to cast ~, you may collect evidence (\d+)\.(?: ~ costs \{(\d+)\} less to cast if evidence was collected\.)?$/.exec(line) : null;
    if (evidence && out.evidence === undefined) {
      out.evidence = Number(evidence[1]);
      if (evidence[2]) out.evidenceReduction = Number(evidence[2]);
      continue;
    }
    // Conspiracy Unraveler: "You may collect evidence 10 rather than pay the mana cost for spells you cast" (CR 118.9).
    const payEvidence = /^You may collect evidence (\d+) rather than pay the mana cost for spells you cast\.$/.exec(line);
    if (payEvidence) {
      out.payEvidence = Number(payEvidence[1]);
      continue;
    }
    // Open the Way: a limit on the X announced as it's cast (CR 601.2b).
    if (line === "X can't be greater than the number of players in the game." && isSpell && parseManaCost(d.manaCost).hasX) {
      out.xMaxPlayers = true;
      continue;
    }
    // The Marches: "As an additional cost to cast this spell, you may exile any number of blue cards from your hand. This
    // spell costs {2} less to cast for each card exiled this way." Announced with the other costs (CR 601.2b), then a
    // reduction of the total (601.2f), which can take {X} down too (rulings).
    const march = /^As an additional cost to cast ~, you may exile any number of (.+?) cards from your hand\. ~ costs \{(\d+)\} less to cast for each card exiled this way\.$/.exec(line);
    if (march) {
      const filter = parseSearchFilter(`${march[1]} card`);
      if (!filter || out.exiledReduction !== undefined) out.unsupported.push(raw);
      else {
        (out.additionalCosts ??= []).push({ kind: "exileFromHand", n: 0, filter, anyNumber: true });
        out.exiledReduction = Number(march[2]);
      }
      continue;
    }
    // Rottenmouth Viper, Torgaar: "you may sacrifice any number of nonland permanents. This spell costs {1} less to cast
    // for each permanent sacrificed this way." An additional cost with an X of 0 or more (CR 601.2b, 107.3a), then a
    // reduction of the total by that much generic mana (CR 601.2f).
    const sacLess = /^As an additional cost to cast ~, you may sacrifice any number of (.+?)\. ~ costs \{(\d+)\} less to cast for each (permanent|creature) sacrificed this way\.$/.exec(line);
    if (sacLess) {
      const spec = parseTargetPhrase(sacLess[1]!.split(" ").map(singularWord).join(" "));
      if (spec?.kind !== "object" || spec.controller || spec.combat || parseManaCost(d.manaCost).hasX || out.sacrificedReduction !== undefined || out.additionalCosts?.some((c) => c.kind === "sacrifice")) out.unsupported.push(raw);
      else {
        (out.additionalCosts ??= []).push({ kind: "sacrifice", filter: { ...spec, text: singularWord(sacLess[1]!) }, n: 0, x: true, optional: true });
        out.sacrificedReduction = Number(sacLess[2]);
      }
      continue;
    }
    // Plumb the Forbidden: "you may sacrifice one or more creatures. When you do, copy this spell for each creature
    // sacrificed this way." An additional cost with an X of 0 or more (CR 601.2b, 107.3a), and a reflexive trigger as
    // it's cast (CR 603.12) copying it that many times.
    const plumb = /^As an additional cost to cast ~, you may sacrifice one or more (.+?)\. When you do, copy ~ for each (.+?) sacrificed this way\.$/.exec(line);
    if (plumb) {
      const spec = parseTargetPhrase(plumb[1]!.split(" ").map(singularWord).join(" "));
      if (spec?.kind !== "object" || spec.controller || spec.combat || plumb[2] !== singularWord(plumb[1]!)) out.unsupported.push(raw);
      else {
        (out.additionalCosts ??= []).push({ kind: "sacrifice", filter: { ...spec, text: plumb[2]! }, n: 0, x: true, optional: true });
        (out.triggers ??= []).push({ event: "selfCast", ifX: 1, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: { count: { kind: "x" } }, newTargets: true }], text: `When you do, copy ~ for each ${plumb[2]} sacrificed this way.` } });
      }
      continue;
    }
    // "As an additional cost to cast this spell, sacrifice a creature." (CR 601.2b, 601.2f-h)
    const extra = /^As an additional cost to cast (?:this spell|~), (.+)\.$/.exec(line);
    if (extra) {
      const cost = parseAdditionalCost(extra[1]!, true);
      const or = cost ? null : parseCostOr(extra[1]!);
      if (cost) (out.additionalCosts ??= []).push(cost);
      else if (or && !out.costOr) out.costOr = or;
      else out.unsupported.push(raw);
      continue;
    }
    // "If you control two or more other lands, ~ enters tapped" (the Adventures in the Forgotten Realms creature lands):
    // untapped only with one or fewer other lands, as it enters (CR 614.1d).
    const ifOthers = new RegExp(`^If you control ${NUM} or more other lands, ~ enters tapped\\.$`).exec(line);
    if (ifOthers) {
      out.entersTappedUnless = { kind: "control", who: "you", types: ["Land"], other: true, max: num(ifOthers[1]!) - 1 };
      continue;
    }
    // Eddymurk Crab: "~ enters tapped if it's not your turn": untapped exactly during your turn (CR 614.1d).
    if (line === "~ enters tapped if it's not your turn.") {
      out.entersTappedUnless = { kind: "yourTurn" };
      continue;
    }
    const unless = /^~ enters tapped unless (.+)\.$/.exec(line);
    if (unless) {
      const cond = parseEntersCondition(unless[1]!);
      if (cond) out.entersTappedUnless = cond;
      else out.unsupported.push(raw);
      continue;
    }
    // Multiversal Passage: "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters
    // tapped." (CR 614.12) The choice is kept as Chosen.landType; then "This land is the chosen type." gives it that type,
    // and with it the type's mana ability (CR 305.6). It has no land type to lose, so the type is added.
    const landTypeChoice = /^As ~ enters, choose a basic land type\. Then (you may pay \d+ life\. If you don't, it enters tapped\.)$/.exec(line);
    if (landTypeChoice && !out.entersTappedChoice && !out.entersChoose?.length && d.types.includes("Land") && !d.subtypes.length) {
      out.entersChoose = [{ what: "basicLandType" }];
      out.entersTappedChoice = parseEntersChoice(`As ~ enters, ${landTypeChoice[1]}`)!;
      continue;
    }
    // Thran Portal: "As this land enters, choose a basic land type." on its own line, then "This land is the chosen type in
    // addition to its other types.": it keeps its Gate type and gets the chosen one, with that type's mana ability (CR
    // 305.6, rulings). With no type chosen, it gets none (rulings).
    if (line === "As ~ enters, choose a basic land type." && d.types.includes("Land") && !out.entersChoose?.length) {
      out.entersChoose = [{ what: "basicLandType" }];
      continue;
    }
    if (line === "~ is the chosen type in addition to its other types." && out.entersChoose?.some((c) => c.what === "basicLandType")) {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenLandType: true }], text: raw });
      continue;
    }
    const lifeTax = /^Mana abilities of ~ cost an additional (\d+) life to activate\.$/.exec(line);
    if (lifeTax && d.types.includes("Land")) {
      out.manaAbilityLifeTax = Number(lifeTax[1]);
      continue;
    }
    if (line === "~ is the chosen type." && out.entersChoose?.some((c) => c.what === "basicLandType")) {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenLandType: true }], text: raw });
      continue;
    }
    const choice = parseEntersChoice(line);
    if (choice) {
      out.entersTappedChoice = choice;
      continue;
    }
    // Kumano, Master Yamabushi; Kumano's Blessing: a replacement effect (CR 614.1a) on creatures it dealt damage this turn.
    const kumano = /^If a creature dealt damage by (~|enchanted creature) this turn would die, exile it instead\.$/.exec(line);
    if (kumano) {
      out.exileWhatItDamaged = kumano[1] === "~" ? "self" : "attached";
      continue;
    }
    // The Darkness Crystal: "If a nontoken creature an opponent controls would die, instead exile it and you gain 2 life."
    // Kalitas: "... instead exile that card and create a 2/2 black Zombie creature token." One replacement (CR 614.1a);
    // the card is exiled with it, linked to its other ability (CR 607.2a).
    const insteadAnd = /^If a nontoken creature an opponent controls would die, instead exile (?:it|that card) and (.+)\.$/.exec(line);
    if (insteadAnd) {
      const filter = parseTargetPhrase("nontoken creature an opponent controls");
      const life = /^you gain (\d+) life$/.exec(insteadAnd[1]!);
      const made = life ? null : parseBody(`${capital(insteadAnd[1]!)}.`, {});
      const e = made?.targets.length === 0 && made.effects.length === 1 ? made.effects[0]! : undefined;
      const token = e?.type === "createToken" && e.n === 1 && e.who.ref === "you" && Object.keys(e).every((k) => ["type", "n", "who", "token"].includes(k)) ? e.token : undefined;
      if (filter?.kind !== "object" || (!life && !token)) out.unsupported.push(raw);
      else out.exileInsteadOfDying = { filter, linked: true, ...(life ? { gainLife: Number(life[1]) } : {}), ...(token ? { token } : {}) };
      continue;
    }
    // Nemata, Primeval Warden: "If a creature an opponent controls would die, exile it instead. When you do, create a 1/1
    // green Saproling creature token.": the replacement (CR 614.1a), and a reflexive trigger when it's applied (CR 603.12).
    const exileWhen = /^If an? (.+?) would die, exile it instead\. When you do, (.+)\.$/.exec(line);
    if (exileWhen) {
      const filter = parseTargetPhrase(exileWhen[1]!);
      const body = parseBody(`${capital(exileWhen[2]!)}.`, {});
      if (filter?.kind !== "object" || filter.combat || !body || body.targets.length || /\b(?:it|that creature|that card)\b/.test(exileWhen[2]!)) out.unsupported.push(raw);
      else out.exileInsteadOfDying = { filter, reflexive: body };
      continue;
    }
    // "If ~ would die, exile it instead." "If a creature an opponent controls would die, exile it instead." (CR 614.1a)
    const exileDies = /^If (~|a|an|another) (.+? )?would die, exile it instead\.$/.exec(line);
    if (exileDies) {
      const filter = exileDies[1] === "~" ? undefined : parseTargetPhrase(exileDies[2]!.trim());
      if (exileDies[1] === "~" && !exileDies[2]) out.exileInsteadOfDying = { self: true };
      // Gisa, Glorious Resurrector: "put all creature cards exiled with ~ ...": the cards exiled this way are linked to it
      // (CR 607.2a).
      else if (filter?.kind === "object" && !filter.combat) out.exileInsteadOfDying = { filter, ...(exileDies[1] === "another" ? { other: true as const } : {}), ...(all.some((l) => l.includes("exiled with ~")) ? { linked: true as const } : {}) };
      else out.unsupported.push(raw);
      continue;
    }
    // Darksteel Colossus: a replacement effect that works from every zone (CR 614.1a, 113.6c-style "from anywhere").
    if (/^If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead\.$/.test(line)) {
      out.shuffleInsteadOfGraveyard = true;
      continue;
    }
    // Granted by Realmbreaker, the Invasion Tree, Geth, Thane of Contracts: 'It gains "If this land would leave the
    // battlefield, exile it instead of putting it anywhere else."' A replacement effect of the permanent's own (CR 614.1a).
    if (/^If ~ would leave the battlefield, exile it instead of putting it anywhere else\.$/.test(line)) {
      out.exileIfLeavesSelf = true;
      continue;
    }
    if (line === "~ enters prepared.") {
      out.entersPrepared = true;
      continue;
    }
    // Valgavoth: "If a card you didn't control would be put into an opponent's graveyard from anywhere, exile it instead":
    // linked to the permanent, for its "play cards exiled with ~" (CR 607.2a).
    if (line === "If a card you didn't control would be put into an opponent's graveyard from anywhere, exile it instead." && !out.graveyardExile) {
      out.graveyardExile = { whose: "opponents", notYours: true, linked: true };
      continue;
    }
    const yardExile = /^If an? (card or token|card|(.+?) card) would be put into (a|an opponent's|your) graveyard from anywhere, (?:exile (?:it|that card) instead|instead exile it with an? ([a-z]+) counter on it)\.$/.exec(line);
    if (yardExile && !out.graveyardExile) {
      // The card's own characteristics (read like a card in a graveyard's, its owner aside).
      const card = yardExile[2] ? parseTargetPhrase(`${yardExile[2]} card in your graveyard`) : undefined;
      const filter = card?.kind === "card" ? { ...card, owner: undefined, text: `${yardExile[2]} card` } : undefined;
      if (yardExile[2] && !filter) out.unsupported.push(raw);
      else out.graveyardExile = { whose: yardExile[3] === "a" ? "any" : yardExile[3] === "your" ? "yours" : "opponents", ...(yardExile[1] === "card or token" ? { tokens: true as const } : {}), ...(filter ? { filter } : {}), ...(yardExile[4] ? { counter: counterKind(yardExile[4]) } : {}) };
      continue;
    }
    // Ugin's Nexus: a replacement effect of the permanent's own (CR 614.1a); its controller takes the turn (CR 500.7).
    if (line === "If ~ would be put into a graveyard from the battlefield, instead exile it and take an extra turn after this one.") {
      out.exileForExtraTurn = true;
      continue;
    }
    if (line === "If ~ would be put into a graveyard from anywhere, exile it instead.") {
      out.exileInsteadOfGraveyard = true;
      continue;
    }
    // Leonin Shikari, Forge Anew: equip abilities at instant speed (CR 702.6a's "only as a sorcery" set aside), and Forge
    // Anew's alternative cost of {0} for the first one each of your turns (CR 118.9).
    const equipFast = /^(During your turn, )?[Yy]ou may activate equip abilities any time you could cast an instant\.$/.exec(line);
    if (equipFast) {
      out.equipAtInstantSpeed = equipFast[1] ? "yourTurn" : "always";
      continue;
    }
    const firstEquip = /^You may pay \{0\} rather than pay the equip cost of the first equip ability you activate (during each of your turns|each turn)\.$/.exec(line);
    if (firstEquip) {
      out.firstEquipFree = firstEquip[1] === "each turn" ? "eachTurn" : "yourTurn";
      continue;
    }
    if (line === "You may play lands from your graveyard.") {
      out.landsFromGraveyard = true;
      continue;
    }
    // Krark's Thumb: "If you would flip a coin, instead flip two coins and ignore one." (CR 705.3, a replacement effect).
    if (line === "If you would flip a coin, instead flip two coins and ignore one.") {
      out.flipTwo = true;
      continue;
    }
    // Titania, Nature's Force: "You may play Forests from your graveyard." Land cards with that basic land type (CR 305.6).
    const typedYard = /^You may play (Plains|Islands|Swamps|Mountains|Forests) from your graveyard\.$/.exec(line);
    if (typedYard) {
      (out.landsFromGraveyardOf ??= []).push(typedYard[1] === "Plains" ? "Plains" : typedYard[1]!.slice(0, -1));
      continue;
    }
    // Wrenn and Realmbreaker's emblem: "You may play lands and cast permanent spells from your graveyard." Any number,
    // paying their mana costs (a card without one can't be cast this way, CR 118.6), following the usual timing rules.
    const permYard = /^You may (play lands and )?cast permanent spells from your graveyard\.$/.exec(line);
    if (permYard) {
      if (permYard[1]) out.landsFromGraveyard = true;
      const { owner: _, ...f } = parseTargetPhrase("permanent card from a graveyard")!;
      (out.graveyardGrants ??= []).push({ filter: { ...f, text: "permanent cards" }, way: { kind: "permission", costs: [], exile: false } });
      continue;
    }
    // The Necrobloom: "Land cards in your graveyard have dredge 2." (CR 702.52a): those cards have the keyword while it
    // applies, so they can replace their owner's draws.
    const dredgeGrant = /^(.+?) cards? in your graveyard (?:has|have) dredge (\d+)\.$/.exec(line);
    if (dredgeGrant) {
      const filter = parseTargetPhrase(`${dredgeGrant[1]!} card from a graveyard`);
      if (filter?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.dredgeGrants ??= []).push({ filter: f, n: Number(dredgeGrant[2]) });
      }
      continue;
    }
    // Underworld Breach, The Master of Keys, Lier, Return the Past, Six, Deeproot Historian: escape, flashback or retrace
    // for the cards in your graveyard (CR 702.138a, 702.34a, 702.81a). Each grant's cost is the card's own mana cost.
    const grant =
      /^(During your turn, )?(?:[Ee]ach )?(.+?) cards? in your graveyard (?:has|have) (escape|flashback|retrace)( \{\d+\})?\.(?: (?:The|Its) (?:escape|flashback) cost is equal to (?:the card's|that card's|its) mana cost( plus exile three other cards from your graveyard)?\.)?$/.exec(line);
    if (grant) {
      const kind = grant[3]!;
      const filter = parseTargetPhrase(`${grant[2]!.replace(/ and /g, " or ")} card from a graveyard`);
      // Escape and flashback name their cost; retrace has none of its own (its land discard is in the keyword).
      // Iroh's "each Lesson card in your graveyard has flashback {1}": a cost of its own.
      const mana = grant[4]?.trim();
      const named = /cost is equal/.test(line);
      const ok = filter?.kind === "card" && (kind === "retrace" ? !named && !mana : kind === "flashback" && mana ? !named : named && !mana && (kind === "escape") === !!grant[5]);
      // Flashback works only for an instant or sorcery (CR 702.34a): only grants to those cards.
      // Iroh's Lessons: every Lesson is an instant or sorcery (CR 205.3k), so flashback works for each of them.
      const spellsOnly = !!filter && (filter.subtypes?.length === 1 && filter.subtypes[0] === "Lesson" ? true : !!filter.types?.length && filter.types.every((t) => t === "Instant" || t === "Sorcery"));
      if (!ok || (kind === "flashback" && !spellsOnly)) out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        const way: import("../abilities").CastFromGraveyard =
          kind === "escape"
            ? { kind: "grantedEscape", costs: GRANTED_WAY_COSTS.grantedEscape!, exile: false }
            : kind === "flashback"
              ? { kind: "grantedFlashback", ...(mana ? { mana } : {}), costs: [], exile: true }
              : { kind: "grantedRetrace", costs: GRANTED_WAY_COSTS.grantedRetrace!, exile: false };
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${grant[2]} cards` }, way, ...(grant[1] ? { yourTurn: true as const } : {}) });
      }
      continue;
    }
    // Serra Paragon: "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with
    // mana value 3 or less from your graveyard. If you do, it gains ...": one use each turn for either (a land played or a
    // spell cast), and the permanent it becomes has the quoted ability (as this object, CR 400.7).
    const paragon = /^Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value (\d+) or less from your graveyard\. If you do, it gains "(When (?:this permanent|~) is put into a graveyard from the battlefield, exile it and you gain \d+ life\.)"$/.exec(line);
    if (paragon) {
      const filter = parseTargetPhrase("permanent card from a graveyard");
      if (filter?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: "permanent cards" }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], maxMv: Number(paragon[1]), gains: paragon[2]!.replace(/^When ~ /, "When this permanent ") });
        out.landFromGraveyardOnce = "shared";
      }
      continue;
    }
    // "Once during each of your turns, you may cast a creature spell from your graveyard" (Karador, Gisa and Geralf): a
    // permission used once each turn (rulings: the spell's costs are paid, its timing rules followed). Muldrotha: "During
    // each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard."
    // Kess: "If a spell cast this way would be put into your graveyard, exile it instead."
    // Exploration Broodship: "... from your graveyard by sacrificing a land in addition to paying its other costs": an
    // additional cost of that permission (CR 601.2f-h), paid with the spell's other costs.
    const onceYard = /^Once during each of your turns, you may cast an? (.+?) spell( with mana value \d+ or less)? from your graveyard( by (?:sacrificing|exiling|discarding|tapping) .+? in addition to paying its other costs)?\.( If a spell cast this way would be put into your graveyard, exile it instead\.)?$/.exec(line);
    // Kotis: "exiling three other cards from your graveyard": other than the spell, which is on the stack by then (CR 601.2a).
    const permitCost = onceYard?.[3] ? parseAdditionalCost(onceYard[3].replace(/^ by (\w+)ing /, (_, v: string) => `${v === "sacrific" ? "sacrifice" : v === "exil" ? "exile" : v} `).replace(/ in addition to paying its other costs$/, "").replace(/^exile (\w+) other cards from your graveyard$/, "exile $1 cards from your graveyard")) : undefined;
    if (permitCost === null) {
      out.unsupported.push(raw);
      continue;
    }
    if (onceYard || line === "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.") {
      const filter = parseTargetPhrase(`${onceYard ? onceYard[1]!.replace(/ and /g, " or ") : "permanent"} card${onceYard?.[2] ?? ""} from a graveyard`);
      // Lurrus: "a permanent spell with mana value 2 or less", the spell's mana value (Count X, CR 202.3e).
      const maxMv = filter?.manaValue && filter.manaValue.min === undefined && filter.manaValue.max !== undefined && onceYard ? filter.manaValue.max : undefined;
      if (filter?.kind !== "card" || (filter.manaValue && maxMv === undefined) || filter.bound) out.unsupported.push(raw);
      else {
        const { owner: _, manaValue: _mv, ...f } = filter;
        const once = onceYard ? [""] : ["Artifact", "Creature", "Enchantment", "Planeswalker", "Battle"];
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${onceYard?.[1] ?? "permanent"} cards` }, way: { kind: "turnPermission", costs: permitCost ? [permitCost] : [], exile: !!onceYard?.[4] }, yourTurn: true, once, ...(maxMv !== undefined ? { maxMv } : {}) });
        if (!onceYard) out.landFromGraveyardOnce = true;
      }
      continue;
    }
    // Information that's public while the permanent is on the battlefield (CR 401.5; hands, CR 402.3).
    if (line === "Play with the top card of your library revealed." || line === "Players play with the top card of their libraries revealed.") {
      out.revealTop = /^Players/.test(line) ? "players" : "you";
      continue;
    }
    if (line === "During your turn, you may play cards exiled with ~. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.") {
      if (out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else out.playLinkedForLife = true;
      continue;
    }
    const stash = /^During your turn, you may play cards you don't own with ([a-z]+) counters on them from exile, and mana of any type can be spent to cast those spells\.$/.exec(line);
    if (stash) {
      if (out.playCountered) out.unsupported.push(raw);
      else out.playCountered = stash[1]!;
      continue;
    }
    // Evendo Brushrazer: "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards
    // exiled with ~."
    // Theater of Horrors: "During your turn, if an opponent lost life this turn, you may play lands and cast spells from
    // among cards exiled with ~": the same (playing a card is playing a land or casting a spell, CR 305.1, 601.2), the
    // usual timing for each (rulings), checked whenever you'd play one.
    const playWhile = /^During your turn, (?:as long as|if) (.+), you may (?:play cards exiled with ~|play lands and cast spells from among cards exiled with ~)\.$/.exec(line);
    if (playWhile) {
      const cond = parseStaticCondition(playWhile[1]!, { affects: { kind: "self" }, mods: [], text: line });
      if (!cond || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else out.playLinkedWhile = { kind: "allOf", conds: [{ kind: "yourTurn" }, cond] };
      continue;
    }
    if (line === "You may play cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells.") {
      if (out.playLinked) out.unsupported.push(raw);
      else out.playLinked = true;
      continue;
    }
    if (line === "Players play with their hands revealed." || line === "Your opponents play with their hands revealed.") {
      out.revealHands = /^Players/.test(line) ? "players" : "opponents";
      continue;
    }
    // "You may look at the top card of your library any time" (rulings on Vizier of the Menagerie): information for its
    // controller only, any time; Radha adds "and you may play lands from the top of your library".
    const look = /^You may look at the top card of your library any time(?:, and (you may .+))?\.$/.exec(line);
    if (look) {
      const top = look[1] ? parseFromTop(look[1]) : undefined;
      if (out.lookTop || top === null) out.unsupported.push(raw);
      else {
        out.lookTop = true;
        if (top) (out.fromTop ??= []).push(top);
      }
      continue;
    }
    // "As long as ~ is attached to a creature, you may cast creature spells from the top of your library", coven.
    const condTop = /^(?:[A-Z][A-Za-z' -]+ — )?As long as (.+?), (you may .+)\.$/.exec(line);
    const ifTop = condTop ? parseFromTop(condTop[2]!) : undefined;
    if (condTop && ifTop !== undefined) {
      const cond = parseStaticCondition(condTop[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || !ifTop) out.unsupported.push(raw);
      else (out.fromTop ??= []).push({ ...ifTop, if: cond });
      continue;
    }
    // Bolas's Citadel: "... If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."
    const lifeTop = /^(.+?)\. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost\.$/.exec(line);
    // Thundermane Dragon: "... If you cast a creature spell this way, it gains haste until end of turn."
    const hasteTop = !lifeTop && /^(.+?)\. If you cast a creature spell this way, it gains haste until end of turn\.$/.exec(line);
    const top = lifeTop
      ? ((t) => (t?.spells ? { ...t, payLife: true as const } : t && null))(parseFromTop(lifeTop[1]!))
      : hasteTop
        ? ((t) => (t?.spells && !t.lands && !t.once ? { ...t, haste: "endOfTurn" as const } : t && null))(parseFromTop(hasteTop[1]!))
        : parseFromTop(line.replace(/\.$/, ""));
    if (top !== undefined) {
      if (top === null) out.unsupported.push(raw);
      else (out.fromTop ??= []).push(top);
      continue;
    }
    const extraLand = new RegExp(`^You may play ${NUM} additional lands? on each of your turns\\.$`).exec(line);
    if (extraLand) {
      out.extraLands = (out.extraLands ?? 0) + num(extraLand[1]!);
      continue;
    }
    if (line === "Each player may play an additional land on each of their turns.") {
      out.extraLandsEach = (out.extraLandsEach ?? 0) + 1;
      continue;
    }
    // Clones: "You may have ~ enter as a copy of any creature on the battlefield[, except ...]." (CR 707.5)
    // Cursed Mirror: "As ~ enters, you may have it become a copy of any creature on the battlefield until end of
    // turn, except it has haste" also becomes the copy as it enters (rulings), for the rest of the turn.
    // Vesuva: "You may have ~ enter tapped as a copy of any land on the battlefield": tapped only as a copy (rulings).
    const clone = /^(?:You may have ~ enter( tapped)? as|As ~ enters, you may have it become) a copy of (?:any |an? )?(.+?)( until end of turn)?(?:, except (.+?))?\.?$/.exec(line);
    if (clone) clone.splice(1, 1);
    const cloneTapped = /^You may have ~ enter tapped as/.test(line) ? { tapped: true as const } : {};
    // "You may have this creature enter as a copy of any creature card in a graveyard, except ..." (Lazotep Convert), "You
    // may have ~ enter tapped as a copy of any land card in a graveyard, except it's a Cave ..." (Echoing Deeps): a card in
    // any graveyard, by its printed characteristics.
    const fromYard = clone && !clone[2] ? /^(creature|land) card in a graveyard$/.exec(clone[1]!) : null;
    if (clone && fromYard) {
      const except = clone[3] ? parseCopyExcept(clone[3]) : undefined;
      if (except !== null && !except?.thisAbility) {
        out.entersAsCopy = { filter: { kind: "card", types: [fromYard[1] === "land" ? "Land" : "Creature"], text: clone[1]! }, ...(except ? { except } : {}), ...cloneTapped };
        continue;
      }
    }
    if (clone && !/graveyard|\bcard\b/.test(clone[1]!) && !(clone[2] && line.startsWith("You may"))) {
      // Mockingbird: "any creature on the battlefield with mana value less than or equal to the amount of mana spent to
      // cast ~": the mana spent on the spell it was, all of it (rulings), as it enters.
      const spentBound = / with mana value less than or equal to the amount of mana spent to cast ~$/.exec(clone[1]!);
      // "Another creature you control" (Sakashima): it isn't on the battlefield yet, so any of them (rulings).
      const phrase = (spentBound ? clone[1]!.slice(0, spentBound.index) : clone[1]!).replace(/ on the battlefield( with |$)/, "$1").replace(/^another /, "");
      const parsed = parseTargetPhrase(phrase);
      const filter = parsed && spentBound ? { ...parsed, bound: { key: "manaValue" as const, at: "most" as const, amount: { count: { kind: "manaSpent" as const } } } } : parsed;
      // "Except it has ~'s other abilities" (Sakashima of a Thousand Faces): the text of its other lines (CR 707.9a), as
      // abilities of the copy, whose name "~" is then.
      const others = clone[3] === "it has ~'s other abilities" ? lines.filter((_, i) => i !== li).map((l) => l.trim()) : undefined;
      // Vizier of Many Faces: "except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in
      // addition to its other types": only for an embalmed token (CR 702.128b), as embalm's own exceptions (702.128a).
      const ifEmbalmed = clone[3] === "if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types" ? { noManaCost: true, colors: ["W" as const], addSubtypes: ["Zombie"] } : undefined;
      const except = others ? { text: others } : ifEmbalmed ? undefined : clone[3] ? parseCopyExcept(clone[3]) : undefined;
      if (filter?.kind === "object" && except !== null && !except?.thisAbility) {
        out.entersAsCopy = { filter: { ...filter, text: clone[1]! }, ...(except ? { except } : {}), ...(ifEmbalmed ? { ifEmbalmed } : {}), ...(clone[2] ? { untilEndOfTurn: true } : {}), ...cloneTapped };
        continue;
      }
    }
    if (line === "Triggered abilities you control can't cause you to sacrifice or exile creature tokens you control.") {
      out.ownTriggersSpareTokens = true;
      continue;
    }
    // "The "legend rule" doesn't apply to permanents you control" (Sakashima, Mirror Box), "... to Slivers you control",
    // "The "legend rule" doesn't apply." (Mirror Gallery): CR 704.5j skips those.
    const noLegend = /^The "legend rule" doesn't apply(?: to (.+?))?\.$/.exec(line);
    const noLegendFilter = noLegend && (noLegend[1] ? parseGroup(noLegend[1], true)?.filter : ({ kind: "object", text: "permanent" } as TargetSpec));
    if (noLegend && noLegendFilter && !/ this turn$/.test(noLegend[1] ?? "")) {
      (out.noLegendRule ??= []).push(noLegendFilter);
      continue;
    }
    if (line === "If you would copy a spell one or more times, instead copy it that many times plus an additional time. You may choose new targets for the additional copy.") {
      out.extraSpellCopy = true;
      continue;
    }
    const countMod = parseCountMod(line);
    if (countMod) {
      (out.countMods ??= []).push(countMod);
      continue;
    }
    // "Each player can't cast more than one spell each turn", "... more than one noncreature spell", Ethersworn Canonist's
    // "Each player who has cast a nonartifact spell this turn can't cast additional nonartifact spells" (the same rule).
    const limit = /^(Each player|You|Enchanted player) can't cast more than one (?:(.+?) )?spell each turn\.$/.exec(line) ?? /^(Each player) who has cast an? (.+?) spell this turn can't cast additional \2 spells\.$/.exec(line);
    if (limit) {
      const filter = limit[2] ? parseTargetPhrase(`${limit[2]} spell`) : undefined;
      if (filter === null || (filter && filter.kind !== "spell")) out.unsupported.push(raw);
      else (out.castLimits ??= []).push({ who: limit[1] === "You" ? "you" : limit[1] === "Enchanted player" ? "enchanted" : "each", ...(filter ? { filter: { ...filter, text: `${limit[2]} spell` } } : {}), text: line });
      continue;
    }
    const skipExtra = /^If (a player|an opponent) would begin an extra turn, that player skips that turn instead\.$/.exec(line);
    if (skipExtra) {
      out.skipsExtraTurns = skipExtra[1] === "a player" ? "all" : "opponents";
      continue;
    }
    const noGain = /^(Players|Your opponents|Enchanted player) can't gain life\.$/.exec(line);
    if (noGain) {
      out.cantGainLife = noGain[1] === "Players" ? "all" : noGain[1] === "Enchanted player" ? "enchanted" : "opponents";
      continue;
    }
    if (line === "Your life total can't change.") {
      out.lifeCantChange = true;
      continue;
    }
    if (line === "If a player would gain life, that player gains no life instead.") {
      out.gainsNoLife = true;
      continue;
    }
    // Tainted Remedy (CR 614.1a): after "can't gain life" (CR 119.7) and Sulfuric Vortex, before the gain is doubled.
    if (line === "If an opponent would gain life, that player loses that much life instead.") {
      out.opponentsGainLose = true;
      continue;
    }
    if (line === "Damage can't be prevented.") {
      out.damageCantBePrevented = true;
      continue;
    }
    if (line === "If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.") {
      out.stealsDraws = true;
      continue;
    }
    if (line === "If an opponent would draw two or more cards, instead you and that player each draw a card.") {
      out.splitsBigDraws = true;
      continue;
    }
    // Narset, Parter of Veils: draws past the first each turn don't happen, and can't be replaced (rulings).
    if (line === "Each opponent can't draw more than one card each turn.") {
      out.opponentsDrawOnce = true;
      continue;
    }
    // Bloodletter of Aclazotz (CR 614.1a): life lost to damage too (CR 120.3a), and life paid (CR 119.4).
    if (line === "If an opponent would lose life during your turn, they lose twice that much life instead.") {
      out.opponentsLoseDouble = true;
      continue;
    }
    if (line === "If you would gain life, you gain twice that much life instead.") {
      out.doubleLifeGain = true;
      continue;
    }
    const coverX = /^If a creature would deal combat damage to you and\/or one or more creatures you control, prevent X of that damage, where X is (.+)\.$/.exec(line);
    const coverN = coverX ? parseCount(coverX[1]!, null) : null;
    if (coverN && !out.preventCombatFromEach) {
      out.preventCombatFromEach = coverN;
      continue;
    }
    // Nowhere to Run: creatures its controller's opponents control can be targeted as though they didn't have hexproof
    // (nor any "hexproof from", CR 702.11e), by anyone's spells and abilities; their ward abilities don't trigger (rulings).
    if (line === "Creatures your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof.") {
      out.seesOpponentsCreatures = true;
      continue;
    }
    if (line === "Creatures your opponents control can be the targets of spells and abilities as though they didn't have hexproof. Ward abilities of those creatures don't trigger.") {
      out.exposesOpponentsCreatures = true;
      continue;
    }
    // Virtue of Strength: "If you tap a basic land for mana": only mana that a basic land is tapped for.
    const tapTimes = /^If you tap a (permanent|basic land) for mana, it produces (twice|three times) as much of that mana instead\.$/.exec(line);
    if (tapTimes) {
      const n = tapTimes[2] === "twice" ? 2 : 3;
      if (tapTimes[1] === "basic land") out.tapBasicManaTimes = (out.tapBasicManaTimes ?? 1) * n;
      else out.tapManaTimes = (out.tapManaTimes ?? 1) * n;
      continue;
    }
    const plusLife = /^If you would gain life, you gain that much life plus (\d+) instead\.$/.exec(line);
    if (plusLife) {
      out.lifeGainPlus = (out.lifeGainPlus ?? 0) + Number(plusLife[1]);
      continue;
    }
    // Serra the Benevolent's emblem: "If you control a creature, damage that would reduce ...": only while you do.
    const floor = /^(If (you control an? [^,]+), )?[Dd]amage that would reduce your life total to less than (\d+) reduces it to \3 instead\.$/.exec(line);
    const floorIf = floor?.[2] ? parseStaticCondition(floor[2], { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    if (floor && floorIf !== null) {
      out.lifeFloor = Number(floor[3]);
      if (floorIf) out.lifeFloorIf = floorIf;
      continue;
    }
    if (line === "Room abilities of dungeons you own trigger an additional time.") {
      out.roomsTwice = 1;
      continue;
    }
    // Scion of Halaster's granted ability: a replacement for the player's first draw each turn (CR 614.1a, 614.5).
    if (line === "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the other back on top of your library. Then draw a card.") {
      out.firstDrawLook = true;
      continue;
    }
    if (line === "If you would draw a card while your library has no cards in it, you win the game instead.") {
      out.drawEmptyWins = true;
      continue;
    }
    if (line === "If you would draw a card while your library has no cards in it, instead return a creature card from your graveyard to the battlefield. If you can't, you lose the game.") {
      out.drawEmptyReturn = true;
      continue;
    }
    if (line === "If you would draw a card, you may instead choose land or nonland and reveal cards from the top of your library until you reveal a card of the chosen kind. Put that card into your hand and put all other cards revealed this way on the bottom of your library in any order.") {
      out.drawAbundance = true;
      continue;
    }
    if (line === "If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.") {
      out.drawDig = 3;
      continue;
    }
    if (line === "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.") {
      out.drawTwoInstead = true;
      continue;
    }
    if (line === "If you would draw a card, draw two cards instead.") {
      out.drawTwoInstead = "always";
      continue;
    }
    // "You have protection from each of your opponents" (CR 702.16k): their spells and abilities can't target you, their
    // Auras can't enchant you, and damage from their sources is prevented.
    // "You, planeswalkers you control, and other creatures you control have hexproof." (Shalai, Voice of Plenty): you have
    // it, and a static ability for each group.
    const youAnd = /^You(?:, ([^,]+ you control),)? and ((?:other )?[^,]+ you control) have (hexproof|shroud)\.$/.exec(line) ?? /^You, ([^,]+ you control), and ((?:other )?[^,]+ you control) have (hexproof|shroud)\.$/.exec(line);
    const youAndSt = youAnd && !out.youHave ? [youAnd[1], youAnd[2]].filter((g): g is string => !!g).map((g) => parseStatic(`${g[0]!.toUpperCase()}${g.slice(1)} have ${youAnd[3]}.`)) : null;
    if (youAnd && youAndSt?.every((x) => x)) {
      out.youHave = youAnd[3] as "hexproof" | "shroud";
      for (const st of youAndSt) out.statics.push({ ...st!, text: line });
      continue;
    }
    // Serra's Emissary: "You and creatures you control have protection from the chosen card type." (CR 702.16a, 702.16b).
    if (line === "You and creatures you control have protection from the chosen card type." && out.entersChoose?.some((c) => c.what === "cardType") && !out.youProtectedFromChosenType) {
      const st = parseStatic("Creatures you control have hexproof.");
      if (st) {
        out.youProtectedFromChosenType = true;
        out.statics.push({ ...st, mods: [{ kind: "addKeywords", keywords: [CHOSEN_TYPE_PROTECTION] }], text: line });
        continue;
      }
    }
    // Gruul Spellbreaker: "During your turn, you and ~ have hexproof.": you have it in your turn, and so does ~.
    const youAndSelf = /^During your turn, you and ~ have hexproof\.$/.test(line) && !out.youHave ? parseConditionalStatic("During your turn, ~ has hexproof.") : null;
    if (youAndSelf) {
      out.youHave = "hexproof";
      out.youHaveDuringYourTurn = true;
      out.statics.push({ ...youAndSelf, text: line });
      continue;
    }
    const youHave = /^You have (hexproof|shroud|protection from each of your opponents)\.$/.exec(line);
    if (youHave && !out.youHave) {
      out.youHave = youHave[1]!.startsWith("protection") ? "protection" : (youHave[1] as "hexproof" | "shroud");
      continue;
    }
    const discardInstead = /^If ~ would enter, you may discard an? ([a-z]+ card) instead\. If you do, put ~ onto the battlefield\. If you don't, put it into its owner's graveyard\.$/.exec(line);
    if (discardInstead && !out.entersDiscardInstead) {
      const filter = parseSearchFilter(discardInstead[1]!);
      if (filter) {
        out.entersDiscardInstead = filter;
        continue;
      }
    }
    // Trinisphere (CR 601.2f): the total cost of each spell, whoever casts it.
    const atLeast = /^(As long as ~ is untapped, )?[Ee]ach spell that would cost less than (two|three|four) mana to cast costs \2 mana to cast\.$/.exec(line);
    if (atLeast && !out.spellCostAtLeast) {
      out.spellCostAtLeast = { n: num(atLeast[2]!), ...(atLeast[1] ? { whileUntapped: true as const } : {}) };
      continue;
    }
    // Lake of the Dead: "If ~ would enter, sacrifice a Swamp instead. If you do, ...": one permanent of a land type.
    const sacInstead = /^If ~ would enter, sacrifice an? ([A-Z][a-z]+) instead\. If you do, put ~ onto the battlefield\. If you don't, put it into its owner's graveyard\.$/.exec(line);
    if (sacInstead && /^(?:Plains|Island|Swamp|Mountain|Forest)$/.test(sacInstead[1]!) && !out.entersSacrificeInstead && !out.entersDiscardInstead) {
      out.entersSacrificeInstead = { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [sacInstead[1]!], controller: "you", text: sacInstead[1]! };
      continue;
    }
    if (line === "If a nontoken creature would enter and it wasn't cast, exile it instead.") {
      out.exileUncastCreatures = true;
      continue;
    }
    if (line === "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead.") {
      out.exileUnlessCastWithMana = true;
      continue;
    }
    if (line === "During your turn, as long as you haven't activated an exhaust ability this turn, you may activate exhaust abilities as though they haven't been activated.") {
      out.exhaustAgain = true;
      continue;
    }
    // "While voting, you get an additional vote" (Brago's Representative), "... you may vote an additional time" (Ballot
    // Broker): CR 701.38d.
    const extraVote = /^While voting, you (get an additional vote|may vote an additional time)\.$/.exec(line);
    if (extraVote && !out.extraVote) {
      out.extraVote = extraVote[1]!.startsWith("get") ? "get" : "may";
      continue;
    }
    const faceUpCounters = new RegExp(`^As ~ is turned face up, put ${NUM} ${COUNTER} counters? on it\\.$`).exec(line);
    if (faceUpCounters && !out.faceUpCounters) {
      out.faceUpCounters = { counter: counterKind(faceUpCounters[2]!), n: num(faceUpCounters[1]!) };
      continue;
    }
    if (line === "If an opponent would face a villainous choice, they face that choice an additional time.") {
      out.villainAgain = true;
      continue;
    }
    if (line === "If ~ is in your opening hand, you may begin the game with it on the battlefield.") {
      out.beginOnBattlefield = true;
      continue;
    }
    // Gemstone Caverns (CR 103.6a; the starting player is the one taking the first turn, 103.1).
    const caverns = /^If ~ is in your opening hand and you're not the starting player, you may begin the game with ~ on the battlefield with an? ([a-z]+) counter on it\. If you do, exile a card from your hand\.$/.exec(line);
    if (caverns) {
      out.beginOnBattlefield = { notStarting: true, counter: caverns[1]!, exileFromHand: true };
      continue;
    }
    // Torpor Orb, Hushwing Gryff, Doorkeeper Thrull, Elesh Norn, Mother of Machines.
    const lock = /^(Creatures|Artifacts and creatures|Permanents) entering(?: the battlefield)? don't cause abilities( of permanents your opponents control)? to trigger\.$/.exec(line);
    if (lock) {
      out.enterLock = { ...(lock[1] === "Creatures" ? { types: ["Creature"] } : lock[1] === "Artifacts and creatures" ? { types: ["Artifact", "Creature"] } : {}), ...(lock[2] ? { opponents: true as const } : {}) };
      continue;
    }
    const again = triggersAgainLine(line);
    if (again) {
      (out.triggersAgain ??= []).push(again);
      continue;
    }
    // Omniscience: an alternative cost of nothing for spells cast from your hand (CR 118.9).
    if (line === "You may cast spells from your hand without paying their mana costs.") {
      out.castFromHandFree = true;
      continue;
    }
    // As Foretold, Darksteel Monolith, Rooftop Storm: "pay {0} rather than pay the mana cost" for some spells (CR 118.9).
    // Warped Space: "Once each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile."
    // Dracogenesis: "You may cast Dragon spells without paying their mana costs": the same alternative cost of nothing,
    // from wherever they may be cast (CR 118.9, 107.3b).
    const payZero = /^(Once each turn, you|You) may pay \{0\} rather than pay the mana cost for (?:an? )?(.*?)spells? you cast( from your hand| from exile)?( with mana value X or less, where X is the number of ([a-z]+) counters on ~)?\.$/.exec(line.replace(/^You may cast ([A-Z][a-z]+) spells without paying their mana costs\.$/, "You may pay {0} rather than pay the mana cost for $1 spells you cast."));
    if (payZero) {
      const what = payZero[2]!.trim();
      const spec = what ? parseTargetPhrase(`${what} card from a graveyard`) : null;
      const filter = spec?.kind === "card" ? (({ owner: _, ...rest }) => ({ ...rest, text: `${what} spell` }))(spec) : undefined;
      if (what && !filter) out.unsupported.push(raw);
      else out.payZero = { ...(filter ? { filter } : {}), ...(payZero[3] === " from your hand" ? { fromHand: true as const } : payZero[3] ? { fromExile: true as const } : {}), ...(/^Once/.test(payZero[1]!) ? { once: true as const } : {}), ...(payZero[5] ? { maxMvCounters: payZero[5] } : {}) };
      continue;
    }
    // One with the Multiverse: casting without paying the mana cost is an alternative cost (CR 118.9), X is 0 (107.3b);
    // once for each such permanent (a new object again, rulings), during your turn, following the normal timing rules.
    // Demon of Fate's Design: "Once during each of your turns, you may cast an enchantment spell by paying life equal to its
    // mana value rather than paying its mana cost": an alternative cost (CR 118.9), X is 0 (rulings), from wherever the
    // spell may be cast; once for each such permanent, as for One with the Multiverse.
    const lifeAlt = /^Once during each of your turns, you may cast an? ([a-z]+) spell by paying life equal to its mana value rather than paying its mana cost\.$/.exec(line);
    if (lifeAlt) {
      const spec = parseTargetPhrase(`${lifeAlt[1]} card from a graveyard`);
      if (spec?.kind !== "card") out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `${lifeAlt[1]} spell` }))(spec), once: true, yourTurn: true, life: true };
      continue;
    }
    if (line === "Once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost.") {
      out.payZero = { once: true, yourTurn: true, fromHandOrTop: true };
      continue;
    }
    if (line === "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.") {
      out.payWUBRG = true;
      continue;
    }
    if (line === "Each power-up ability of permanents you control can be activated an additional time.") {
      out.powerUpAgain = true;
      continue;
    }
    const youActivateLess = /^Abilities you activate that aren't mana abilities cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that cost to less than one mana\.)?$/.exec(line);
    if (youActivateLess && !out.youActivateLess) {
      out.youActivateLess = { n: Number(youActivateLess[1]), ...(youActivateLess[2] ? { atLeastOne: true as const } : {}) };
      continue;
    }
    const activationLess = /^Activated abilities of (creatures|artifacts|lands|artifact tokens)( you control)? cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that cost to less than one mana\.)?$/.exec(line);
    const lessFilter = activationLess && parseTargetPhrase(`${activationLess[1]!.replace(/s$/, "")}${activationLess[2] ?? ""}`);
    if (activationLess && lessFilter?.kind === "object") {
      (out.activationLess ??= []).push({ n: Number(activationLess[3]), filter: { ...lessFilter, text: `${activationLess[1]}${activationLess[2] ?? ""}` }, ...(activationLess[4] ? { atLeastOne: true as const } : {}) });
      continue;
    }
    // Winter Orb, Winter Moon, Smoke, Static Orb, Mungha Wurm: a limit on what untaps in the untap step (CR 502.3).
    const untapLimit = /^(As long as ~ is untapped, )?([Pp]layers|[Yy]ou) can't untap more than (one|two) (.+?) during (?:their|your) untap steps?\.$/.exec(line);
    if (untapLimit) {
      const filter = parseTargetPhrase(untapLimit[4]!.split(" ").map((w, i, a) => (i === a.length - 1 ? singularWord(w) : w)).join(" "));
      if (filter?.kind !== "object" || filter.controller || filter.bound) out.unsupported.push(raw);
      else (out.untapLimits ??= []).push({ n: num(untapLimit[3]!), filter: { ...filter, text: untapLimit[4]! }, ...(/^you$/i.test(untapLimit[2]!) ? { you: true as const } : {}), ...(untapLimit[1] ? { whileUntapped: true as const } : {}) });
      continue;
    }
    // "Artifact cards and red creature cards in your hand have warp {2}{R}" (Tannuk, Steadfast Second): an alternative cost
    // for those cards while they're in its controller's hand (CR 702.185a), their characteristics there.
    const warpGrant = /^((?:[A-Za-z]+ )+?cards?(?: and (?:[a-z]+ )+?cards)?) in your hand have warp ((?:\{[^}]+\})+)\.$/.exec(line);
    if (warpGrant) {
      const f = parseTargetPhrase(`${warpGrant[1]!.toLowerCase().replace(/ cards and /, " card or ").replace(/ cards$/, " card")} from a graveyard`);
      if (f?.kind !== "card") out.unsupported.push(raw);
      else (out.handWarp ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), text: `${warpGrant[1]!.toLowerCase()} in your hand` }, mana: warpGrant[2]!, text: line });
      continue;
    }
    // Dream Devourer: "Each nonland card in your hand without foretell has foretell. Its foretell cost is equal to its mana
    // cost reduced by {2}." Foretell for those cards while they're in its controller's hand (CR 702.143a).
    const foretellGrant = /^Each nonland card in your hand without foretell has foretell\. Its foretell cost is equal to its mana cost reduced by \{(\d+)\}\.$/.exec(line.replace(/ \(During your turn, [^)]*\)$/, ""));
    if (foretellGrant) {
      (out.handForetell ??= []).push({ reduce: Number(foretellGrant[1]), text: line });
      continue;
    }
    // "Each creature card in your hand has ninjutsu {2}{U}{B}" (Satoru Umezawa): the keyword's ability on those cards.
    // "Each creature card in your hand has cycling {1}{U}" (Rhet-Tomb Mystic): the same (CR 702.29a).
    const handGrant = /^Each ([a-z]+) card in your hand has ((?:ninjutsu|cycling) (?:\{[^}]+\})+)\.$/.exec(line);
    if (handGrant) {
      // The card's kind read as a graveyard card's, without the graveyard.
      const f = parseTargetPhrase(`${handGrant[1]} card from a graveyard`);
      const kw = keywordAbilities(handGrant[2]!, d);
      if (f?.kind !== "card" || kw?.activated.length !== 1 || kw.triggers.length || kw.statics.length) out.unsupported.push(raw);
      else (out.handGrants ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), text: `${handGrant[1]} cards in your hand` }, activated: kw.activated });
      continue;
    }
    const firstArtifactLess = /^The first activated ability of an artifact you activate each turn costs \{(\d+)\} less to activate\.$/.exec(line);
    if (firstArtifactLess) {
      out.firstArtifactAbilityLess = (out.firstArtifactAbilityLess ?? 0) + Number(firstArtifactLess[1]);
      continue;
    }
    const ninjutsuLess = /^Ninjutsu abilities you activate cost \{(\d+)\} less to activate\.$/.exec(line);
    if (ninjutsuLess) {
      out.ninjutsuLess = (out.ninjutsuLess ?? 0) + Number(ninjutsuLess[1]);
      continue;
    }
    const powerUpLess = /^Power-up abilities of other creatures you control cost \{(\d+)\} less to activate\.$/.exec(line);
    if (powerUpLess && !out.powerUpLess) {
      out.powerUpLess = Number(powerUpLess[1]);
      continue;
    }
    const equipLess = /^Equip abilities you activate( of other Equipment| that target ~| that target enchanted creature)? cost \{(\d+)\} less to activate\.$/.exec(line);
    if (equipLess) {
      (out.equipLess ??= []).push({ n: Number(equipLess[2]), ...(equipLess[1] === " that target ~" ? { targetSelf: true as const } : equipLess[1] === " that target enchanted creature" ? { targetEnchanted: true as const } : equipLess[1] ? { otherEquipment: true as const } : {}) });
      continue;
    }
    // Firion's token copies: "This Equipment's equip abilities cost {2} less to activate" (its own only).
    const ownEquipLess = /^~'s equip abilities cost \{(\d+)\} less to activate\.$/.exec(line);
    if (ownEquipLess) {
      (out.equipLess ??= []).push({ n: Number(ownEquipLess[1]), self: true });
      continue;
    }
    // "Aura spells you cast that target enchanted creature cost {3} less to cast." (Strong Back)
    const auraLess = /^Aura spells you cast that target enchanted creature cost \{(\d+)\} less to cast\.$/.exec(line);
    if (auraLess) {
      out.auraLessEnchanted = (out.auraLessEnchanted ?? 0) + Number(auraLess[1]);
      continue;
    }
    if (line === "If you would lose the game, instead exile ~ and your life total becomes 1.") {
      out.loseGameExileSelf = true;
      continue;
    }
    const lockEnd = /^You can't (lose|win) the game and your opponents can't (win|lose) the game\.$/.exec(line);
    if (lockEnd && lockEnd[1] !== lockEnd[2]) {
      if (lockEnd[1] === "lose") [out.cantLose, out.cantWin] = ["you", "opponents"];
      else [out.cantWin, out.cantLose] = ["you", "opponents"];
      continue;
    }
    // "Noncreature spells you cast have convoke" (Caetus, Sea Tyrant of Segovia), "Multicolored spells you cast have
    // convoke" (Fallaji Wayfarer): the spell has it while it's being cast and paid for (CR 702.51a, 601.2g-h).
    // "Noncreature spells you cast from exile have convoke" (Party Thrasher): those cast from exile.
    const giveConvoke = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you cast( from exile)? have convoke\.$/.exec(line);
    if (giveConvoke) {
      const f = parseTargetPhrase(`${giveConvoke[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveConvoke ??= []).push({ filter: f, ...(giveConvoke[2] ? { fromExile: true as const } : {}), text: line });
      continue;
    }
    // "Spells you cast from exile have convoke" (Hoarding Broodlord): cast from exile, checked as they're paid for (CR 601.2g-h).
    if (line === "Spells you cast from exile have convoke.") {
      (out.spellsHaveConvoke ??= []).push({ filter: { kind: "spell", text: "spell" }, fromExile: true, text: line });
      continue;
    }
    // "Nonartifact spells you cast have improvise" (Inspiring Statuary), CR 702.126a, as for convoke.
    const giveImprovise = /^([A-Z][a-z]+) spells you cast have improvise\.$/.exec(line);
    if (giveImprovise) {
      const f = parseTargetPhrase(`${giveImprovise[1]!.toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveImprovise ??= []).push({ filter: f, text: line });
      continue;
    }
    // "Dinosaur spells you cast have prowl {2}{R}" (Hunting Velociraptor), CR 702.76a: an alternative cost for those spells.
    const giveProwl = /^([A-Z][a-z]+) spells you cast have prowl ((?:\{[^}]+\})+)\.$/.exec(line);
    if (giveProwl) {
      const f = parseTargetPhrase(`${giveProwl[1]!.toLowerCase()} spell`);
      if (f?.kind !== "spell" || /\{X\}/.test(giveProwl[2]!)) out.unsupported.push(raw);
      else (out.spellsHaveProwl ??= []).push({ filter: f, mana: giveProwl[2]!, text: line });
      continue;
    }
    // Cascade for the spells you cast (CR 702.85a): "Sliver spells you cast have cascade", "Instant and sorcery spells you
    // cast from your hand have cascade", "The first spell you cast each turn has cascade" (Maelstrom Nexus).
    // Zhulodok, Void Gorger: '... have "Cascade, cascade."': two cascade abilities, each triggering (CR 702.85c).
    const giveCascade = /^(?:(.+?) )?[Ss]pells you cast( from your hand)?( with mana value \d+ or (?:greater|less))? have (cascade|"Cascade, cascade\.")\.?$/.exec(line);
    const firstCascade = /^The first spell you cast (from exile )?each turn( that mana from a Treasure was spent to cast)? has cascade\.$/.exec(line);
    if (/^Commander spells you cast have cascade\.$/.test(line)) {
      (out.spellsHaveCascade ??= []).push({ commander: true, text: line });
      continue;
    }
    const xCascade = /^During your turn, spells you cast from your hand with mana value X or less have cascade, where X is (.+)\.$/.exec(stripAbilityWord(line));
    if (xCascade) {
      const maxMv = parseCount(xCascade[1]!, null);
      if (!maxMv) {
        out.unsupported.push(raw);
        continue;
      }
      (out.spellsHaveCascade ??= []).push({ from: "hand", yourTurn: true, maxMv, text: line });
      continue;
    }
    // Delirium: "This spell has cascade as long as there are four or more card types among cards in your graveyard"
    // (Bloodbraid Marauder): it has cascade as it's cast, so cascade triggers, only while that's true (CR 702.85a).
    const cascadeIf = /^~ has cascade as long as (.+)\.$/.exec(stripAbilityWord(line));
    if (cascadeIf) {
      const cond = parseStaticCondition(cascadeIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || !conditionalAbility(d, "Cascade", out, cond)) out.unsupported.push(raw);
      continue;
    }
    if (giveCascade || firstCascade) {
      let filter: TargetSpec | undefined;
      if (giveCascade && (giveCascade[1] || giveCascade[3])) {
        const words = (giveCascade[1] ?? "").replace(/ and /g, " or ").replace(/^./, (c) => c.toLowerCase());
        const f = parseTargetPhrase(`${words ? `${words} ` : ""}spell${giveCascade[3] ?? ""}`);
        if (f?.kind !== "spell") {
          out.unsupported.push(raw);
          continue;
        }
        filter = f;
      }
      const from = giveCascade?.[2] ? "hand" : firstCascade?.[1] ? "exile" : undefined;
      (out.spellsHaveCascade ??= []).push({ ...(filter ? { filter } : {}), ...(from ? { from } : {}), ...(giveCascade?.[4]?.startsWith('"') ? { twice: true as const } : {}), ...(firstCascade ? { first: true as const } : {}), ...(firstCascade?.[2] ? { treasure: true as const } : {}), text: line });
      continue;
    }
    // "Instant and sorcery spells you cast have storm" (Prismari, the Inspiration; Ral's emblem), CR 702.40a.
    const giveStorm = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you cast have storm\.$/.exec(line);
    if (giveStorm) {
      const f = parseTargetPhrase(`${giveStorm[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveStorm ??= []).push({ filter: f, text: line });
      continue;
    }
    // Samut, Tyrant of Naktamun: "Instant and sorcery spells you control have split second" (CR 702.61a), while they're on
    // the stack under its controller's control.
    const giveSplit = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you control have split second\.$/.exec(line);
    if (giveSplit) {
      const f = parseTargetPhrase(`${giveSplit[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveSplitSecond ??= []).push(f);
      continue;
    }
    // Shadow the Hedgehog (after its flavor word, CR 207.2d): spells its controller casts get split second (CR 702.61a).
    if (/^(?:[A-Z][A-Za-z' ]* — )?Each spell you cast has split second if mana from an artifact was spent to cast it\.$/.test(line)) {
      out.splitSecondIfArtifactMana = true;
      continue;
    }
    if (/^You may activate abilities of creatures you control as though those creatures had haste\.$/.test(line)) {
      out.creatureAbilitiesHaste = true;
      continue;
    }
    // "~ is all colors" (CR 604.3), and Fallaji Wayfarer's "This ability doesn't affect its color identity" (its color
    // identity in the card data is green, CR 903.4). Only when the card data has all five colors for it, as Scryfall does.
    if (/^~ is all colors\.(?: This ability doesn't affect its color identity\.)?$/.test(line.replace(/ \(It can be in any deck whose commander's color identity includes \w+\.\)$/, ""))) {
      if (d.colors.length !== 5) {
        out.unsupported.push(raw);
        continue;
      }
      out.allColors = true;
      continue;
    }
    // "~ is every nonbasic land type" (Planar Nexus): a characteristic-defining ability (CR 604.3), so it works in every
    // zone and applies first in layer 4 (613.3).
    if (line === "~ is every nonbasic land type.") {
      out.allNonbasicLandTypes = true;
      continue;
    }
    // "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types." (Grist, the Hunger
    // Tide): a static ability that works everywhere else (CR 113.6b), in its library, hand, graveyard, exile, the command
    // zone and on the stack, so it's a creature card and a creature spell there (rulings); on the battlefield it isn't.
    const offField = /^As long as ~ isn't on the battlefield, it's an? (\d+)\/(\d+) ([A-Z][a-z]+) creature in addition to its other types\.$/.exec(line);
    if (offField && !d.types.includes("Creature")) {
      out.offFieldCreature = { power: offField[1]!, toughness: offField[2]!, subtype: offField[3]! };
      continue;
    }
    // "You may activate the loyalty abilities of ~ twice each turn rather than only once" (Urza, Planeswalker; CR 606.3).
    const loyaltyTwice = /^You may activate the loyalty abilities of (~|planeswalkers you control) twice each turn rather than only once\.$/.exec(line);
    if (loyaltyTwice) {
      out.loyaltyTwice = loyaltyTwice[1] === "~" ? "self" : "yours";
      continue;
    }
    if (line === "If you would proliferate, proliferate twice instead.") {
      out.proliferateTwice = true;
      continue;
    }
    if (line === "You may spend mana as though it were mana of any color.") {
      out.spendAnyColor = true;
      continue;
    }
    const unlockLess = /^Unlock costs you pay cost \{(\d+)\} less\.$/.exec(line);
    if (unlockLess) {
      out.unlockLess = (out.unlockLess ?? 0) + Number(unlockLess[1]);
      continue;
    }
    const plotLess = /^Plotting cards from your hand costs \{(\d+)\} less\.$/.exec(line);
    if (plotLess) {
      out.plotLess = (out.plotLess ?? 0) + Number(plotLess[1]);
      continue;
    }
    if (line === "Players may spend mana as though it were mana of any color.") {
      out.spendAnyColorAll = true;
      continue;
    }
    if (line === "You can spend mana of any type to cast creature spells.") {
      out.spendAnyTypeCreatureSpells = true;
      continue;
    }
    if (line === "You may spend mana as though it were mana of any color to activate abilities of creatures you control.") {
      out.spendAnyColorCreatureAbilities = true;
      continue;
    }
    // Agatha's Soul Cauldron, Hazel's Brewmaster ("Foods you control have ...") (CompiledCard.lendsExiled), linked to
    // its one exile ability below.
    const lends = /^(Creatures you control with \+1\/\+1 counters on them|Foods you control) have all activated abilities of all creature cards exiled with ~\.$/.exec(line);
    if (lends) {
      const group = parseGroup(lends[1]!.toLowerCase());
      const food = group?.filter.kind === "object" && group.filter.subtypes?.length === 1 && group.filter.subtypes[0] === "Food" && !group.filter.counter;
      if (!group || group.other || group.filter.kind !== "object" || (group.filter.counter !== "+1/+1" && !food)) out.unsupported.push(raw); // exiledLentTo looks only at those
      else out.lendsExiled = { to: group.filter, cards: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature cards" } };
      continue;
    }
    if (/^For each \{B\} in a cost, you may pay 2 life rather than pay that mana\.$/.test(line)) {
      out.lifeForBlack = true;
      continue;
    }
    if (/^You have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = out.noMaxHandSize || true;
      continue;
    }
    // "You don't lose the game for having 0 or less life" (CR 704.5a); Marina Vendrell's Grimoire says both at once.
    const zeroLife = /^You (have no maximum hand size and )?don't lose the game for having 0 or less life\.$/.exec(line);
    if (zeroLife) {
      if (zeroLife[1]) out.noMaxHandSize = out.noMaxHandSize || true;
      out.noZeroLifeLoss = true;
      continue;
    }
    const handSize = new RegExp(`^(Your|Each opponent's) maximum hand size is (?:${NUM}|(increased|reduced) by ${NUM})\\.$`).exec(line);
    if (handSize) {
      const n = num((handSize[2] ?? handSize[4])!);
      (out.handSize ??= []).push({ who: handSize[1] === "Your" ? "you" : "opponents", ...(handSize[2] ? { set: n } : { plus: handSize[3] === "reduced" ? -n : n }) });
      continue;
    }
    if (/^Players have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = "all";
      continue;
    }
    // "You can't cast creature spells" (Steel Golem), "noncreature spells" (Nikya of the Old Ways): a "can't" that wins
    // over any "can" (CR 101.2); putting creatures onto the battlefield isn't casting them (rulings).
    // "Your opponents can't cast noncreature spells" (Narset Transcendent's emblem): each opponent of its controller.
    // Gaddock Teeg: "Noncreature spells with mana value 4 or greater can't be cast", "... with {X} in their mana costs ...";
    // Aether Storm: "Creature spells can't be cast": anyone's.
    const noOne = /^(Creature|Noncreature) spells( with mana value \d+ or greater| with \{X\} in their mana costs)? can't be cast\.$/.exec(line);
    if (noOne) {
      const hasX = noOne[2] === " with {X} in their mana costs";
      const filter = parseTargetPhrase(`${noOne[1]!.toLowerCase()} spell${noOne[2] && !hasX ? noOne[2] : ""}`);
      if (filter?.kind !== "spell") out.unsupported.push(raw);
      else (out.cantBeCast ??= []).push({ filter: { ...filter, text: `${noOne[1]!.toLowerCase()} spell${noOne[2] ?? ""}` }, ...(hasX ? { hasX: true as const } : {}), text: line });
      continue;
    }
    // Llawan, Cephalid Empress: "Your opponents can't cast blue creature spells": the spell's color as it's cast (CR 601.3).
    const cantCast = /^(You|Your opponents) can't cast ((?:white |blue |black |red |green )?(?:creature|noncreature)) spells\.$/.exec(line);
    if (cantCast) {
      const filter = parseTargetPhrase(`${cantCast[2]} spell`);
      if (filter?.kind !== "spell") out.unsupported.push(raw);
      else (cantCast[1] === "You" ? (out.youCantCast ??= []) : (out.opponentsCantCast ??= [])).push({ ...filter, text: `${cantCast[2]} spell` });
      continue;
    }
    // Mana that isn't lost as steps and phases end (CR 500.4): "Players don't lose unspent mana" (Upwelling), "You don't lose
    // unspent red mana" (Leyline Tyrant), "If you would lose unspent mana, that mana becomes colorless instead" (Kruphix, a
    // replacement effect, CR 614.1a; restrictions on that mana stay with it, rulings).
    const keep = /^(Players|You) don't lose unspent (?:(white|blue|black|red|green) )?mana as steps and phases end\.$/.exec(line);
    const becomes = /^If you would lose unspent mana, that mana becomes (colorless|white|blue|black|red|green) instead\.$/.exec(line);
    if ((keep || becomes) && !out.keepMana) {
      out.keepMana = keep
        ? { who: keep[1] === "Players" ? "all" : "you", ...(keep[2] ? { color: COLOR_WORDS[keep[2]]! } : {}) }
        : { who: "you", becomes: becomes![1] === "colorless" ? "C" : COLOR_WORDS[becomes![1]!]! };
      continue;
    }
    // Pixie Guide, Wyll, Barbarian Class: a replacement effect on your rolls (CR 614.1a); the ignored roll never happened (706.6).
    if (/^If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll\.$/.test(line)) {
      out.rollAdvantage = true;
      continue;
    }
    // Pilots: "~ saddles Mounts and crews Vehicles as though its power were 2 greater", "... using its toughness rather
    // than its power" (CR 702.122a, 702.171a).
    const crewsAs = /^~ (saddles Mounts and )?crews Vehicles (?:as though its power were (\d+) greater|using its toughness rather than its power)\.$/.exec(line);
    if (crewsAs && !out.crewsAs) {
      out.crewsAs = { ...(crewsAs[2] ? { n: Number(crewsAs[2]) } : { toughness: true as const }), saddles: !!crewsAs[1] };
      continue;
    }
    if (line === "Creatures with power greater than the number of cards in your hand can't attack.") {
      out.attackPowerCapHand = true;
      continue;
    }
    if (line === "Creature cards you own that aren't on the battlefield have flash.") {
      (out.flashOwned ??= []).push({ kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature cards you own" });
      continue;
    }
    if (line === "During each opponent's end step, you may cast spells as though they had flash.") {
      out.flashInOpponentsEndStep = true;
      continue;
    }
    // Quicksilver, Speedster: "As long as ~ is tapped, you may cast spells as though they had flash": while the condition
    // holds as the spell is proposed (CR 702.8a, 601.2).
    const flashWhile = /^As long as ([^,]+), you may cast spells as though they had flash\.$/.exec(line);
    const flashCond = flashWhile ? parseStaticCondition(flashWhile[1]!, { affects: { kind: "self" }, mods: [], text: line }) : null;
    if (flashCond) {
      (out.flashWhile ??= []).push(flashCond);
      continue;
    }
    // "Any player may cast Sliver spells as though they had flash" (Quick Sliver), "... spells ..." (Tidal Barracuda): every
    // player, not only its controller (CR 702.8a).
    const flashFor = /^(You|Any player) may cast (.*?)spells as though they had flash\.$/.exec(line);
    if (flashFor) {
      // "Aura and Equipment spells" (Sigarda's Aid): each of them.
      // "Colorless spells and artifact spells" (Liberator): either kind.
      const parts = flashFor[2]!.split(/ spells and /).map((x, i, all) => (i < all.length - 1 ? `${x} ` : x));
      const specs = parts.map((part) => parseTargetPhrase(`${part.replace(/ and /g, " or ")}spell`));
      if (specs.every((spec) => spec?.kind === "spell" && !spec.controller)) {
        specs.forEach((spec, i) => (flashFor[1] === "You" ? (out.flashFor ??= []) : (out.flashForAll ??= [])).push({ ...spec!, text: `${parts[i]}spells` } as typeof spec & {}));
        continue;
      }
    }
    if (line === "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield instead of putting it into your graveyard.") {
      out.discardedToBattlefield = true;
      continue;
    }
    // Prototype (CR 702.160a, 718): cast it with the alternative mana cost, color, power and toughness (see prototypedDef).
    const proto = /^Prototype ((?:\{[^}]+\})+) — (\d+)\/(\d+)$/.exec(line);
    if (proto && parseManaCost(proto[1]!).supported && !parseManaCost(proto[1]!).hasX) {
      (out.altCosts ??= []).push({ kind: "prototype", mana: proto[1]! });
      continue;
    }
    // Heaped Harvest: "When ~ enters and when you sacrifice it, ...": two triggers doing the same.
    const andSac = /^When ~ enters and when you sacrifice it, (.+)$/.exec(line);
    if (andSac) {
      const halves = [`When ~ enters, ${andSac[1]}`, `When you sacrifice ~, ${andSac[1]}`].map((l) => parseTrigger(l));
      if (halves.every((t) => t && t !== "fail")) {
        for (const t of halves) out.triggers.push(t as TriggeredAbility);
        continue;
      }
    }
    // Unbound Flourishing: two events, each its own trigger; "if that spell's mana cost or that ability's activation cost
    // contains {X}" can't change after it's cast or activated, so it's checked as it triggers (CR 603.4).
    if (line === "Whenever you cast an instant or sorcery spell or activate an ability, if that spell's mana cost or that ability's activation cost contains {X}, copy that spell or ability. You may choose new targets for the copy.") {
      const halves = ["Whenever you cast an instant or sorcery spell with {X} in its mana cost, copy that spell. You may choose new targets for the copy.", "Whenever you activate an ability with {X} in its activation cost that isn't a mana ability, copy that ability. You may choose new targets for the copy."].map((l) => parseTrigger(l));
      if (halves.every((t) => t && t !== "fail")) {
        for (const t of halves) out.triggers.push({ ...(t as TriggeredAbility), body: { ...(t as TriggeredAbility).body, text: "copy that spell or ability. You may choose new targets for the copy." } });
        continue;
      }
    }
    // Tergrid, God of Fright: two events, each its own trigger; "that card" only while it's still in the graveyard it went
    // to (rulings: a commander put into the command zone, a card with madness exiled, isn't there).
    if (line === "Whenever an opponent sacrifices a nontoken permanent or discards a permanent card, you may put that card from a graveyard onto the battlefield under your control.") {
      const put: AbilityBody = { targets: [], effects: [{ type: "may", effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" } }], text: "put that card from a graveyard onto the battlefield under your control" }], text: "you may put that card from a graveyard onto the battlefield under your control." };
      const halves = ["Whenever an opponent sacrifices a nontoken permanent, draw a card.", "Whenever an opponent discards a permanent card, draw a card."].map((l) => parseTrigger(l));
      if (halves.every((t) => t && t !== "fail")) {
        for (const t of halves) out.triggers.push({ ...(t as TriggeredAbility), body: put });
        continue;
      }
    }
    // "~ has annihilator X, where X is the number of +1/+1 counters on it" (Ulamog, the Defiler): annihilator (CR 702.86a)
    // with X counted as it resolves (rulings).
    const annX = /^~ has annihilator X, where X is (.+)\.$/.exec(line);
    const annCount = annX && parseCount(annX[1]!.replace(/\bon it$/, "on ~"), null);
    if (annCount) {
      out.triggers.push({ event: "selfAttacks", body: { targets: [], effects: [{ type: "pick", who: { ref: "eventPlayer" }, filter: { kind: "object", text: "permanent" }, n: annCount, action: "sacrifice" }], text: `Annihilator X: defending player sacrifices X permanents, where X is ${annX![1]}.` } });
      continue;
    }
    // The Water Crystal, Bruvac the Grandiloquent: a replacement effect on milling (CR 614.1a, 701.17).
    const millMore = /^If an opponent would mill one or more cards, they mill (that many cards plus (\w+)|twice that many cards) instead\.$/.exec(line);
    if (millMore && !Number.isNaN(num(millMore[2] ?? "0"))) {
      (out.millMore ??= []).push(millMore[2] ? { plus: num(millMore[2]) } : { twice: true });
      continue;
    }
    // Teferi, Who Slows the Sunset's emblem: a card drawn in each opponent's draw step, right after their own draw, with
    // no priority in between (rulings, CR 504.1).
    if (line === "You draw a card during each opponent's draw step.") {
      out.drawsInOpponentsDrawStep = true;
      continue;
    }
    if (line === "Skip your draw step.") {
      out.skipDrawStep = true;
      continue;
    }
    if (line === "Players skip their untap steps.") {
      out.skipUntapSteps = true;
      continue;
    }
    // Teamwork N: "As an additional cost to cast this spell, you may tap any number of creatures you control with total
    // power N or more." (The keyword's reminder text is all the rules there are for it.)
    const teamwork = /^Teamwork (\d+)$/.exec(line);
    if (teamwork && !d.types.includes("Land") && out.teamwork === undefined) {
      out.teamwork = Number(teamwork[1]);
      continue;
    }
    if (line === "You may cast ~ as though it had flash if it's cast using teamwork." && out.teamwork !== undefined) {
      out.teamworkFlash = true;
      continue;
    }
    // Conspire (CR 702.78a): an optional additional cost, and "When you cast this spell, if its conspire cost was paid,
    // copy it. If the spell has any targets, you may choose new targets for the copy." Two instances (702.78b) aren't modeled.
    if (line === "Conspire" && isSpell && !out.conspire) {
      out.conspire = true;
      out.triggers.push({ event: "selfCast", ifConspired: true, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Conspire: copy ~. You may choose new targets for the copy." } });
      continue;
    }
    // Gift (CR 702.174): "As an additional cost to cast this spell, you may choose an opponent", and what they get if you
    // do: first thing as an instant or sorcery resolves (702.174j), or "when this permanent enters, if its gift cost was
    // paid" (702.174b).
    const gift = /^Gift (a card|a Food|a tapped Fish|an extra turn|a Treasure|an Octopus)$/.exec(line);
    if (gift && !out.gift) {
      out.gift = giftOf(gift[1]!);
      if (!isSpell) out.triggers.push({ event: "selfEnters", ifGift: true, body: { targets: [], effects: out.gift.effects, text: `Gift ${gift[1]}: the chosen player ${giftText(gift[1]!)}.` } });
      continue;
    }
    // Hideaway N (CR 702.75a): "When this permanent enters, look at the top N cards of your library. Exile one of them
    // face down and put the rest on the bottom of your library in a random order." "Hideaway 3, hideaway 3": each one.
    const hideaway = /^Hideaway (\d+)((?:, hideaway \d+)*)$/.exec(line);
    if (hideaway) {
      for (const n of [hideaway[1]!, ...[...hideaway[2]!.matchAll(/\d+/g)].map((x) => x[0])].map(Number))
        out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "hideaway", n }], text: `Hideaway ${n}: look at the top ${n} cards of your library, exile one of them face down, then put the rest on the bottom of your library in a random order.` } });
      continue;
    }
    // Tribute N (CR 702.104a): "As this creature enters, choose an opponent. That player may put an additional N +1/+1
    // counters on it as it enters." Each instance would work separately: one is modeled.
    const tribute = /^Tribute (\d+)$/.exec(line);
    if (tribute && d.types.includes("Creature") && out.tribute === undefined) {
      out.tribute = Number(tribute[1]);
      out.entersOptions = [...(out.entersOptions ?? []), "tribute"];
      continue;
    }
    // Haunt (CR 702.55a): on a permanent, "When this permanent is put into a graveyard from the battlefield, exile it
    // haunting target creature"; on an instant or sorcery, "When this spell is put into a graveyard during its
    // resolution, exile it haunting target creature."
    if (line === "Haunt") {
      const permanent = !isSpell;
      out.triggers.push({
        event: permanent ? "selfToGraveyard" : "selfResolvedToGraveyard",
        body: {
          targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
          effects: [{ type: "haunt" }],
          text: `Haunt: when ~ is put into a graveyard ${permanent ? "from the battlefield" : "during its resolution"}, exile it haunting target creature.`,
        },
      });
      continue;
    }
    // Cipher (CR 702.99a): the spell's last instruction, "you may exile this card encoded on a creature you control".
    if (line === "Cipher" && isSpell) {
      cipher = true;
      continue;
    }
    if (line === "Bargain") {
      out.bargain = true; // CR 702.166a
      continue;
    }
    // "Artifact offering", "Goblin offering" (CR 702.48a): a card type or a creature type, the permanent sacrificed.
    const offering = /^(\w+) offering$/.exec(line);
    if (offering && !out.offering && (offering[1] === "Artifact" || CREATURE_TYPES.has(offering[1]!))) {
      out.offering = offering[1] === "Artifact" ? { kind: "object", types: ["Artifact"], text: "artifact" } : { kind: "object", subtypes: [offering[1]!], text: offering[1]! };
      continue;
    }
    const cheaper = /^~ costs \{(\d+)\} less to cast if it's bargained\.$/.exec(line);
    if (cheaper && /(?:^|\n)Bargain(?: \(|$|\n)/m.test(d.oracleText ?? "")) {
      out.bargainReduction = Number(cheaper[1]);
      continue;
    }
    if (line === "You may choose not to untap ~ during your untap step.") {
      out.mayNotUntap = true; // CR 502.3
      continue;
    }
    // Ugin's Conjurant, Polukranos, Unchained: "If damage would be dealt to ~ while it has a +1/+1 counter on it, prevent
    // that damage and remove that many +1/+1 counters from ~" (CR 615.5): see dealDamage.
    if (/^If damage would be dealt to ~ while it has a \+1\/\+1 counter on it, prevent that damage and remove that many \+1\/\+1 counters from (?:~|it)\.$/.test(line)) {
      out.counterShield = true;
      continue;
    }
    // Polukranos, Unchained: "~ enters with six +1/+1 counters on it. It escapes with twelve +1/+1 counters on it
    // instead." One replacement effect with two amounts (CR 614.1c, 702.138c).
    const escInstead = new RegExp(`^~ enters with ${NUM} \\+1/\\+1 counters on it\\. It escapes with ${NUM} \\+1/\\+1 counters on it instead\\.$`).exec(line);
    if (escInstead) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: num(escInstead[1]!), escaped: num(escInstead[2]!) };
      continue;
    }
    // Phyrexian Hydra: "If damage would be dealt to ~, prevent that damage. Put a -1/-1 counter on ~ for each 1 damage
    // prevented this way." (CR 615): see dealDamage.
    if (line === "If damage would be dealt to ~, prevent that damage. Put a -1/-1 counter on ~ for each 1 damage prevented this way.") {
      out.preventToMinusCounters = true;
      continue;
    }
    // The Phantom creatures' prevention shield (CR 615): see dealDamage.
    if (line === "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~.") {
      out.phantom = true;
      continue;
    }
    // The Mindskinner (CR 615.5, 615.12): see staticRules in damage.ts.
    if (line === "If a source you control would deal damage to an opponent, prevent that damage and each opponent mills that many cards.") {
      out.damageToOpponentsMills = true;
      continue;
    }
    // Angel of Suffering (CR 615.5, 615.12): see staticRules in damage.ts.
    if (line === "If damage would be dealt to you, prevent that damage and mill twice that many cards.") {
      out.damageToYouMillsTwice = true;
      continue;
    }
    // The Wanderer (CR 615.1): see staticRules in damage.ts.
    const toYou = /^Prevent all (combat |noncombat )?damage that would be dealt to you( and other permanents you control)?\.$/.exec(line);
    if (toYou) {
      out.preventToYou = { ...(toYou[1] ? { combat: toYou[1] === "combat " ? ("only" as const) : ("non" as const) } : {}), ...(toYou[2] ? { others: true as const } : {}) };
      continue;
    }
    // Pariah, Palisade Giant, Martyrs of Korlis (CR 614.9): see staticRules in damage.ts.
    const redirect = /^(?:As long as ~ is untapped, a|A)ll damage that would be dealt to you( and other permanents you control)?( by artifacts)? is dealt to (~|enchanted creature|equipped creature) instead\.$/.exec(line);
    if (redirect) {
      out.damageToYouRedirect = {
        to: redirect[3] === "~" ? "self" : "attached",
        ...(redirect[1] ? { others: true as const } : {}),
        ...(line.startsWith("As long as") ? { untapped: true as const } : {}),
        ...(redirect[2] ? { by: { kind: "object" as const, types: ["Artifact"], text: "artifact" } } : {}),
      };
      continue;
    }
    if (line === "Damage isn't removed from ~ during cleanup steps.") {
      out.keepsDamage = true; // CR 514.2
      continue;
    }
    if (line === "If damage would be dealt to ~, prevent that damage and an opponent of your choice gains control of it.") {
      out.betrayer = true;
      continue;
    }
    if (line === "Cast ~ only if you've cast another spell this turn.") {
      out.castOnlyAfterAnother = true;
      continue;
    }
    // "Cast this spell only during combat", "... only during your end step", "... only during the declare attackers step
    // and only if you've been attacked this step" (CR 506.8, 601.3).
    // Serra Avenger: "You can't cast ~ during your first, second, or third turns of the game" (CR 601.3).
    if (line === "You can't cast ~ during your first, second, or third turns of the game." && !out.castOnly) {
      out.castOnly = { kind: "not", cond: { kind: "ownTurnAtMost", n: 3 } };
      continue;
    }
    // "You can't cast ~ unless an opponent lost life this turn" (Rakdos, Lord of Riots): the same as "cast ~ only if" (CR 601.3).
    const cantUnless = /^You can't cast ~ unless ([^.]+)\.$/.exec(line);
    const castOnly = cantUnless ? ([line, `if ${cantUnless[1]}`] as unknown as RegExpExecArray) : /^Cast ~ only ((?:during|if|before|after) [^.]+)\.$/.exec(line);
    if (castOnly) {
      const clauses = parseOnlyClauses(castOnly[1]!);
      if (!clauses?.cond || clauses.once || clauses.sorcery || out.castOnly) out.unsupported.push(raw);
      else out.castOnly = clauses.cond;
      continue;
    }
    // Banefire: "If X is 5 or more, this spell can't be countered and the damage can't be prevented." Static abilities of
    // the spell (CR 113.6, 101.2, 615.12) that apply while its X is 5 or more; X is locked in as it's cast (CR 601.2b).
    const xUncounterable = /^If X is (\d+) or more, ~ can't be countered and the damage can't be prevented\.$/.exec(line);
    if (xUncounterable && isSpell && unpreventableX === undefined) {
      out.cantBeCounteredX = Number(xUncounterable[1]);
      unpreventableX = Number(xUncounterable[1]);
      continue;
    }
    if (/^~ can't be countered\.$/.test(line)) {
      out.cantBeCountered = true;
      continue;
    }
    // Thryx, the Sudden Storm: "Spells you cast with mana value 5 or greater cost {1} less to cast and can't be countered":
    // two statics about the same spells.
    const thryx = /^Spells you cast with mana value (\d+) or greater (cost \{\d+\} less to cast and )?can't be countered\.$/.exec(line);
    if (thryx) {
      (out.uncounterable ??= []).push({ filter: { kind: "spell", text: `spells you cast with mana value ${thryx[1]} or greater` }, minMv: Number(thryx[1]) });
      if (!thryx[2]) continue;
      // The cost half is read by the cost-change lines below.
      line = `Spells you cast with mana value ${thryx[1]} or greater ${thryx[2].replace(/ and $/, "")}.`;
    }
    // Spider-Punk: "Spells and abilities can't be countered." (CR 101.2): any player's.
    if (line === "Spells and abilities can't be countered.") {
      (out.uncounterable ??= []).push({ filter: { kind: "spell", text: "spells" }, anyone: true });
      out.abilitiesUncounterable = true;
      continue;
    }
    // "Creature spells you control can't be countered." "Creature spells can't be countered." (CR 101.2)
    // Spellbreaker Behemoth: "Creature spells you control with power 5 or greater": the card's power (CR 208.3).
    const uncounterable = /^(.*?)[Ss]pells( you control)?( with power \d+ or greater)? can't be countered\.$/.exec(line);
    if (uncounterable && !/\b(this turn|by)\b/.test(line) && (!uncounterable[3] || /^creature $/i.test(uncounterable[1]!))) {
      // Taigam, Ojutai Master: "Instant, sorcery, and Dragon spells you control": each that's one of the card types or has
      // the creature type (TargetSpec.orSubtypes).
      const mixed = /^((?:instant|sorcery|creature|artifact|enchantment), )+and ([A-Z][a-z]+) $/i.exec(uncounterable[1]!);
      const words = (mixed ? uncounterable[1]!.replace(/, and [A-Z][a-z]+ $/, "") : uncounterable[1]!).trim().toLowerCase();
      // "Creature and enchantment spells" (Destiny Spinner): each spell that's either.
      const filter1 = words ? parseTargetPhrase(`${words.replace(/^([a-z]+) and ([a-z]+)$/, "$1 or $2").replace(/^([a-z]+), ([a-z]+)$/, "$1 or $2")} spell`) : { kind: "spell" as const, text: "spell" };
      const filter0 = uncounterable[3] && filter1 ? { ...filter1, power: { min: Number(/\d+/.exec(uncounterable[3])![0]) } } : filter1;
      const filter = mixed && filter0?.kind === "spell" && filter0.types?.length && CREATURE_TYPES.has(mixed[2]!) ? { ...filter0, orSubtypes: [mixed[2]!] } : mixed ? null : filter0;
      if (filter?.kind === "spell" && !filter.controller) (out.uncounterable ??= []).push({ filter: { ...filter, text: `${words ? `${words} ` : ""}spells${uncounterable[3] ?? ""}` }, ...(uncounterable[2] ? {} : { anyone: true as const }) });
      else out.unsupported.push(raw);
      continue;
    }
    // "Your opponents can't cast spells with mana value 3 or less" (Brisela): the spell as it's proposed, X chosen (CR
    // 601.2e, 601.3a).
    const mvBan = new RegExp(`^Your opponents can't cast spells with mana value ${NUM} or less\\.$`).exec(line);
    if (mvBan && out.opponentsCantCastMvAtMost === undefined) {
      out.opponentsCantCastMvAtMost = num(mvBan[1]!);
      continue;
    }
    // Void Winnower: "Your opponents can't cast spells with even mana values" (zero is even; X as chosen, a face-down
    // spell's 0, rulings) and "can't block with creatures with even mana values" (X is 0 on the battlefield, CR 202.3b).
    if (/^Your opponents can't cast spells with even mana values\.(?: \(Zero is even\.\))?$/.test(line)) {
      out.opponentsCantCastEven = true;
      continue;
    }
    // Lavinia, Azorius Renegade: X as chosen (rulings), the lands that player controls as they cast it (CR 601.3).
    if (line === "Each opponent can't cast noncreature spells with mana value greater than the number of lands that player controls.") {
      out.opponentsNoncreatureMvAboveLands = true;
      continue;
    }
    // Undertow, Staff of the Ages (CompiledCard.walkBlockable).
    const walkable = /^Creatures with (\w+walk|landwalk abilities) can be blocked as though they didn't have (\w+walk|those abilities)\.$/.exec(line);
    if (walkable && (walkable[1] === walkable[2] || (walkable[1] === "landwalk abilities" && walkable[2] === "those abilities")) && (walkable[1] === "landwalk abilities" || isLandwalk(capital(walkable[1]!)))) {
      (out.walkBlockable ??= []).push(walkable[1] === "landwalk abilities" ? "*" : capital(walkable[1]!));
      continue;
    }
    if (line === "Your opponents can't block with creatures with even mana values.") {
      out.opponentsCantBlockEven = true;
      continue;
    }
    // Teferi, Temporal Archmage's emblem: loyalty abilities when you could cast an instant, still one per permanent each
    // turn (CR 606.3, rulings).
    if (line === "You may activate loyalty abilities of ~ on any player's turn any time you could cast an instant.") {
      out.selfLoyaltyAtInstantSpeed = true;
      continue;
    }
    // The Wandering Emperor: only on the turn it entered, and still one loyalty ability that turn (rulings, CR 606.3).
    if (line === "As long as ~ entered this turn, you may activate ~'s loyalty abilities any time you could cast an instant.") {
      out.selfLoyaltyAtInstantSpeed = "enteredThisTurn";
      continue;
    }
    if (line === "You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.") {
      out.loyaltyAtInstantSpeed = true;
      continue;
    }
    // Grafdigger's Cage, Kunoros, Soulless Jailer, Weathered Runestone (rulings on Grafdigger's Cage: the card as it is in
    // that zone; a manifested card is a creature card as it's turned face down there, CR 701.40a, so it can't either).
    const cage = /^(Creature|Permanent|Nonland permanent) cards in (graveyards|graveyards and libraries) can't enter the battlefield\.$/.exec(line);
    if (cage) {
      out.cantEnterFrom = { zones: cage[2] === "graveyards" ? ["graveyard"] : ["graveyard", "library"], what: cage[1] === "Creature" ? "creature" : cage[1] === "Permanent" ? "permanent" : "nonlandPermanent" };
      continue;
    }
    // Playing a land from there is still allowed (rulings on Grafdigger's Cage): it isn't cast (CR 305.1).
    const noCasting = /^Players can't cast (spells|noncreature spells) from (graveyards|graveyards or libraries|graveyards or exile)\.$/.exec(line);
    if (noCasting) {
      out.cantCastFrom = { zones: noCasting[2]!.split(" or ").map((z) => (z === "graveyards" ? "graveyard" : z === "libraries" ? "library" : "exile")), ...(noCasting[1] === "noncreature spells" ? { noncreature: true as const } : {}) };
      continue;
    }
    if (line === "Your opponents can't cast spells from anywhere other than their hands.") {
      out.opponentsOnlyFromHand = true;
      continue;
    }
    const mindcensor = new RegExp(`^If an opponent would search a library, that player searches the top ${NUM} cards of that library instead\\.$`).exec(line);
    if (mindcensor) {
      out.opponentsSearchTop = num(mindcensor[1]!);
      continue;
    }
    if (line === "If an effect causes you to discard a card, discard it, but you may put it on top of your library instead of into your graveyard.") {
      out.discardToTop = true;
      continue;
    }
    if (line === "Spells and abilities your opponents control can't cause their controller to search their library.") {
      out.opponentsCantSearchOwn = true;
      continue;
    }
    if (line === "Your opponents can't search libraries.") {
      out.opponentsCantSearch = true;
      continue;
    }
    if (line === "You control your opponents while they're searching their libraries.") {
      out.controlsOpponentSearches = true;
      continue;
    }
    if (line === "While an opponent is searching their library, they exile each card they find. You may play those cards for as long as they remain exiled, and you may spend mana as though it were mana of any color to cast them.") {
      out.exilesOpponentFinds = true;
      continue;
    }
    if (line === "Creatures you control can boast twice during each of your turns rather than once.") {
      out.boastTwice = true;
      continue;
    }
    const combatCap = /^No more than (one|two) creatures? can (attack|block)( you| ~)? each combat\.$/.exec(line);
    if (combatCap && !(combatCap[3] && combatCap[2] === "block") && (combatCap[3] !== " ~" || d.types.includes("Planeswalker") || d.types.includes("Battle"))) {
      (out.combatLimit ??= {})[combatCap[3] === " you" ? "attackYou" : combatCap[3] ? "attackSelf" : (combatCap[2] as "attack" | "block")] = combatCap[1] === "one" ? 1 : 2;
      continue;
    }
    // Mirri, Weatherlight Duelist: only while it's tapped (CR 508.1c).
    if (line === "As long as ~ is tapped, no more than one creature can attack you each combat.") {
      (out.combatLimit ??= {}).attackYouIfTapped = 1;
      continue;
    }
    if (line === "Each opponent can cast spells only any time they could cast a sorcery.") {
      out.opponentsSorceryTiming = true;
      continue;
    }
    if (/^Compleated(?: \(|$)/.test(line) && d.types.includes("Planeswalker")) {
      out.compleated = true;
      continue;
    }
    // Angelic Arbiter: what the opponent did earlier in the turn counts, even before it was there (rulings).
    if (line === "Each opponent who cast a spell this turn can't attack with creatures.") {
      out.opponentsWhoCastCantAttack = true;
      continue;
    }
    if (line === "Each opponent who attacked with a creature this turn can't cast spells.") {
      out.opponentsWhoAttackedCantCast = true;
      continue;
    }
    if (line === "Your opponents can't cast spells during combat.") {
      out.opponentsCantCastDuringCombat = true;
      continue;
    }
    // Basandra, Battle Seraph: every player, its controller too.
    if (line === "Players can't cast spells during combat.") {
      out.opponentsCantCastDuringCombat = "all";
      continue;
    }
    if (line === "Your opponents can't cast spells during your turn.") {
      out.opponentsCantCastYourTurn = true;
      continue;
    }
    // Conqueror's Flail: only as long as it's attached to a creature.
    const cantCastIf = /^As long as (~ is attached to a creature), your opponents can't cast spells during your turn\.$/.exec(line);
    if (cantCastIf) {
      const cond = parseStaticCondition(cantCastIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || out.opponentsCantCastYourTurn) out.unsupported.push(raw);
      else {
        out.opponentsCantCastYourTurn = true;
        out.opponentsCantCastYourTurnIf = cond;
      }
      continue;
    }
    // The Immortal Sun: "Players can't activate planeswalkers' loyalty abilities." (CR 606.3), see loyaltyBan.
    if (line === "Players can't activate planeswalkers' loyalty abilities.") {
      out.noLoyaltyAbilities = true;
      continue;
    }
    // Solemnity (CR 122.1): the counters already there stay (rulings); see counters.ts.
    if (line === "Players can't get counters.") {
      out.noPlayerCounters = true;
      continue;
    }
    // O-Naginata, Konda's Banner: an Equipment that can't become attached to anything else, and becomes unattached once its
    // creature stops fitting, its own bonus included (rulings; CR 301.5c, 704.5n).
    {
      const only = d.subtypes.includes("Equipment") ? /^~ can be attached only to an? ((?:legendary )?creature(?: with (?:power|toughness) \d+ or greater)?)\.$/.exec(line) : null;
      const spec = only && parseTargetPhrase(only[1]!);
      if (spec?.kind === "object") {
        out.attachOnly = { ...spec, text: only![1]! };
        continue;
      }
    }
    // Aeve, Progenitor Ooze: a token copy of it isn't legendary (a type-changing effect of its own, CR 205.4, 613.1d).
    if (line === "~ isn't legendary if it's a token.") {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "loseTypes", types: ["Legendary"] }], condition: { kind: "self", is: "token" }, text: raw });
      continue;
    }
    if (line === "Creatures your opponents control can't have +1/+1 counters put on them.") {
      out.opponentsCreaturesNoCounters = "+1/+1";
      continue;
    }
    if (line === "Creatures you control can't have -1/-1 counters put on them.") {
      out.yourCreaturesNoCounters = "-1/-1";
      continue;
    }
    if (line === "You can't get poison counters.") {
      out.noPoisonForYou = true;
      continue;
    }
    if (line === "~ can't have counters put on it.") {
      out.selfNoCounters = true;
      continue;
    }
    if (line === "Counters can't be put on artifacts, creatures, enchantments, or lands.") {
      out.noCountersOn = ["Artifact", "Creature", "Enchantment", "Land"];
      continue;
    }
    {
      const stay = /^([A-Z][a-z]+) counters can't be removed from permanents your opponents control\.$/.exec(line);
      if (stay) {
        out.opponentsCountersStay = stay[1]!.toLowerCase();
        continue;
      }
    }
    if (line === "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.") {
      out.opponentsCantCastYourTurn = true;
      out.opponentsCantActivateYourTurn = true;
      continue;
    }
    // Timely Ward: "You may cast ~ as though it had flash if it targets a commander": one of its targets, as it's cast, is
    // a commander (CR 903.3); starting to cast it then needs a commander on the battlefield.
    if (line === "You may cast ~ as though it had flash if it targets a commander.") {
      out.flashIfTargetsCommander = true;
      continue;
    }
    // Flash Photography: "... if it targets a permanent you control": one of its targets as it's cast (rulings: chosen
    // as it's cast, CR 601.2c); starting to cast it then needs a permanent of yours to target.
    if (line === "You may cast ~ as though it had flash if it targets a permanent you control.") {
      out.flashIfTargetsYours = true;
      continue;
    }
    // "~ has flash as long as you've committed a crime this turn" (Take for a Ride), "You may cast ~ as though it had
    // flash if you control a Human" (Bard's Company), "Spell mastery — If there are two or more instant and/or sorcery
    // cards in your graveyard, you may cast ~ as though it had flash": whether it can be cast at instant speed now (CR
    // 702.8a, 601.3). Only conditions about the player, which hold the same with the card in hand; on a permanent that
    // "has flash", the keyword itself would matter on the battlefield too, so those stay out unless it's a spell.
    const flashIf =
      /^~ has flash as long as (.+)\.$/.exec(line) ??
      /^You may cast ~ as though it had flash if (.+)\.$/.exec(line) ??
      /^(?:(?:Ferocious|Spell mastery) — )?(?:If|As long as) (.+), you may cast ~ as though it had flash\.$/.exec(line);
    if (flashIf && !/^you pay \{/.test(flashIf[1]!)) {
      const cond = parseStaticCondition(flashIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      // "This spell has flash" is only while it's a spell; "Colossal Rattlewurm has flash" is on the battlefield too.
      const permanentHas = /^~ has flash/.test(line) && !/(^|\n)This spell has flash /.test(d.oracleText ?? "") && !d.types.includes("Instant") && !d.types.includes("Sorcery");
      const aboutPlayer = !!cond && FLASH_IF.includes(cond.kind) && !(cond.kind === "control" && (cond.other || cond.who === "defending"));
      if (!aboutPlayer || permanentHas || out.flashIf) out.unsupported.push(raw);
      else out.flashIf = cond!;
      continue;
    }
    // Rout: "You may cast ~ as though it had flash if you pay {2} more to cast it." Paying more is the price of casting it
    // any time a sorcery couldn't have been cast (see spellCost).
    const flashCost = /^You may cast ~ as though it had flash if you pay \{(\d+)\} more to cast it\.$/.exec(line);
    if (flashCost) {
      out.flashCost = Number(flashCost[1]);
      continue;
    }
    // "~ enters with a number of +1/+1 counters on it equal to ..." is "with X ... counters on it, where X is ...".
    const aNumber = new RegExp(`^(?:Undergrowth — )?~ enters(?: the battlefield)? with a number of ${COUNTER} counters on (?:it|him|her|~) equal to (.+)\\.$`).exec(line);
    // "The amount of mana spent to cast it" (Marath): the spell it was, only as it enters from the stack.
    if (aNumber && /^the amount of mana spent to cast (?:it|~)$/.test(aNumber[2]!)) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(aNumber[1]!), n: { count: { kind: "manaSpent" } } };
      continue;
    }
    if (aNumber) line = `~ enters with X ${aNumber[1]} counters on it, where X is ${aNumber[2]}.`;
    // "Sensational Save — If Scarlet Spider was cast using web-slinging, he enters with X +1/+1 counters on him, where X
    // is the mana value of the returned creature." (CR 702.188a; the returned creature as it last existed, rulings).
    const slung = new RegExp(`^(?:[A-Z][\\w' ]+ — )?If ~ was cast using web-slinging, ~ enters(?: the battlefield)? with X ${COUNTER} counters on ~, where X is the mana value of the returned creature\\.$`).exec(line);
    if (slung) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(slung[1]!), n: { count: { kind: "webSlungMv" } }, ifWebSlung: true };
      continue;
    }
    // Ulasht, the Hate Seed: "~ enters with a +1/+1 counter on it for each other red creature you control and a +1/+1
    // counter on it for each other green creature you control": both counts, a creature of both colors counted twice.
    const ewcTwo = new RegExp(`^~ enters with an? ${COUNTER} counter on it for each (.+?) and an? ${COUNTER} counter on it for each (.+?)\\.$`).exec(line);
    if (ewcTwo && ewcTwo[1] === ewcTwo[3]) {
      const a = parseCount(ewcTwo[2]!, null, true);
      const b = parseCount(ewcTwo[4]!, null, true);
      const plain = (x: typeof a) => !!x && typeof x === "object" && !x.times && !x.plus && !x.half && !x.negate;
      if (!a || !b || !plain(a) || !plain(b) || out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(ewcTwo[1]!), n: { count: { kind: "sum", of: [a.count, b.count] } } };
      continue;
    }
    // "Jeska enters with a loyalty counter on her for each ...": on ~ too.
    const ewc = new RegExp(`^(?:(?:Raid|Morbid|Revolt) — )?~ enters(?: the battlefield)?( tapped(?: and)?)? with ${NUMX} ${COUNTER} counters? on (?:it|~)(?: for each (.+?)|, where X is (.+?)| if (.+?))?\\.$`).exec(line);
    if (ewc) {
      // "With a +1/+1 counter on it for each ...", "with X +1/+1 counters, where X is ...": counted as it enters.
      // "~ enters tapped with three stun counters on it." "... if you attacked this turn" (raid), "... if a creature
      // died this turn" (morbid), "... if you cast it from your hand": checked as it enters.
      const [, tapped, count, kind, each, where, ifText] = ewc;
      const fromHand = ifText === "you cast it from your hand";
      // "If you cast it" (Nine-Lives Familiar): it enters from the stack as the spell it was, not a copy (CR 601.2i).
      const ifCast = ifText === "you cast it";
      const cond = ifText && !fromHand && !ifCast ? parseStaticCondition(ifText, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
      const per = each ? parseCount(each, null, true) : null;
      const def = where ? parseCount(where, null) : null;
      const n = per ? scaleAmount(amt(count!), per) : def ? substituteX(amt(count!), def) : amt(count!);
      if ((each && !per) || (where && !def) || cond === null || !n || out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: counterKind(kind!), n, ...(cond ? { if: cond } : {}), ...(fromHand ? { castFromHand: true as const } : {}), ...(ifCast ? { ifCast: true as const } : {}) };
        if (tapped) out.entersTapped = true;
      }
      continue;
    }
    // Animate Dead, Dance of the Dead (CR 303.4a, rulings): the Aura spell targets a creature card in a graveyard and enters
    // attached to it; its enters trigger returns the card and attaches the Aura to the creature it became (Effect
    // "animateDead"), and its leaves trigger sacrifices that creature.
    if (line === "Enchant creature card in a graveyard" && d.subtypes.includes("Aura") && !out.enchant) {
      out.enchant = { kind: "card", types: ["Creature"], text: "creature card in a graveyard to enchant" };
      out.animate = true;
      continue;
    }
    const animate = out.animate && /^When ~ enters, if it's on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ⟪source⟫\." (?:Return enchanted creature card to the battlefield under your control|Put enchanted creature card onto the battlefield (tapped )?under your control) and attach ~ to it\. When ~ leaves the battlefield, that creature's controller sacrifices it\.$/.exec(line);
    if (animate) {
      out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "animateDead", ...(animate[1] ? { tapped: true as const } : {}) }], text: `Return enchanted creature card to the battlefield${animate[1] ? " tapped" : ""} under your control and attach ~ to it.` } });
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "sacrificeAnimated" }], text: "That creature's controller sacrifices it." } });
      continue;
    }
    // Necromancy (rulings): an enchantment that becomes an Aura as its enters trigger resolves, if it's still on the
    // battlefield, and attaches to the creature it put onto the battlefield; it follows the rules for Auras from then on.
    if (/^When ~ enters, if it's on the battlefield, it becomes an Aura with "enchant creature put onto the battlefield with ⟪source⟫\." Put target creature card from a graveyard onto the battlefield under your control and attach ~ to it\. When ~ leaves the battlefield, that creature's controller sacrifices it\.$/.test(line) && !d.subtypes.includes("Aura") && !out.enchant) {
      out.animate = true;
      out.triggers.push({ event: "selfEnters", body: { targets: [{ kind: "card", types: ["Creature"], text: "target creature card from a graveyard" }], effects: [{ type: "animateDead", target: 0 }], text: "Put target creature card from a graveyard onto the battlefield under your control and attach ~ to it." } });
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "sacrificeAnimated" }], text: "That creature's controller sacrifices it." } });
      continue;
    }
    // Daybreak Coronet: as a spell, any enchanted creature (no Aura of its own is attached yet); on the battlefield, one
    // with an Aura other than this one (see attachmentSBAs).
    if (line === "Enchant creature with another Aura attached to it" && !out.enchant) {
      out.enchant = { kind: "object", types: ["Creature"], status: "enchanted", text: "creature with another Aura attached to it to enchant" };
      out.enchantAnotherAura = true;
      continue;
    }
    const enchant = /^Enchant (.+)$/.exec(line);
    if (enchant) {
      const spec = parseTargetPhrase(enchant[1]!);
      if (spec?.kind === "object" && !out.enchant) out.enchant = { ...spec, text: `${spec.text.replace(/^target /, "")} to enchant` };
      // "Enchant player", "Enchant opponent" (CR 702.5d): the Aura spell targets a player, and it's attached to one.
      else if (/^(player|opponent)$/.test(enchant[1]!) && !out.enchant) out.enchant = { kind: "player", ...(enchant[1] === "opponent" ? { opponent: true } : {}), text: `${enchant[1]} to enchant` };
      else out.unsupported.push(raw);
      continue;
    }
    // "Equip {4}. This ability costs {1} less to activate for each color of the creature it targets." (Dragonfire Blade)
    const equipLessPer = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. This ability costs \{(\d+)\} less to activate for each (color of|\+1\/\+1 counter on) the creature it targets\.$/.exec(line);
    // "Equip {4}. This ability costs {3} less to activate if you're the monarch." (Crown of Gondor): checked as it's
    // activated (CR 602.2b, 601.2f).
    const equipLessIf = !equipLessPer ? /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. This ability costs \{(\d+)\} less to activate if ([^.]+)\.$/.exec(line) : null;
    const lessCond = equipLessIf ? parseStaticCondition(equipLessIf[3]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    // Plate Armor: "Equip {3}. This ability costs {1} less to activate for each other Equipment you control": counted as it's
    // activated (CR 602.2b, 601.2f), the source left out.
    const equipLessEach = !equipLessPer && !equipLessIf ? /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. This ability costs \{(\d+)\} less to activate for each ([^.]+)\.$/.exec(line) : null;
    const lessEach = equipLessEach ? parseCount(equipLessEach[3]!, null, true) : null;
    // Leather Armor: "Equip {0}. Activate only once each turn." (CR 602.5b).
    const equipOnce = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. Activate only once each turn\.$/.exec(line);
    const equip = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(line) ?? equipOnce ?? equipLessPer ?? (lessCond ? equipLessIf : null) ?? (lessEach ? equipLessEach : null);
    if (equip && d.subtypes.includes("Equipment")) {
      // CR 702.6a: "[Cost]: Attach this permanent to target creature you control. Activate only as a sorcery."
      out.activated.push({
        manaCost: equip[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", text: "target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach to target creature you control." },
        text: line,
        equip: true,
        ...(equipLessPer ? { costLessPerTarget: { n: Number(equipLessPer[2]), each: equipLessPer[3] === "color of" ? ("color" as const) : ("+1/+1" as const) } } : {}),
        ...(lessCond ? { costLessIf: { n: Number(equipLessIf![2]), cond: lessCond } } : {}),
        ...(lessEach ? { costLess: { ...lessEach, times: (lessEach.times ?? 1) * Number(equipLessEach![2]) } } : {}),
        ...(equipOnce ? { oncePerTurn: true } : {}),
      });
      continue;
    }
    // Luxior, Giada's Gift: "Equip planeswalker {1}" means "{1}: Attach this permanent to target planeswalker you control as
    // though that planeswalker were a creature. Activate only as a sorcery." (rulings, CR 702.6c-d).
    const equipWalker = /^Equip planeswalker ((?:\{[^}]+\})+)$/.exec(line);
    if (equipWalker && d.subtypes.includes("Equipment")) {
      out.activated.push({
        manaCost: equipWalker[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [{ kind: "object", types: ["Planeswalker"], controller: "you", text: "target planeswalker you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 }, asCreature: true }], text: "Attach to target planeswalker you control as though it were a creature." },
        text: line,
        equip: true,
      });
      continue;
    }
    // Mjölnir, Hammer of Thor: "Equip worthy {1} (A creature is worthy if it's a legendary non-Villain that's red and/or
    // white.)" An equip ability for creatures of that quality (CR 702.6c), the quality its reminder text defines.
    const worthy = /^Equip worthy ((?:\{[^}]+\})+)$/.exec(line);
    if (worthy && d.subtypes.includes("Equipment") && /A creature is worthy if it's a legendary non-Villain that's red and\/or white\./.test(d.oracleText)) {
      out.activated.push({
        manaCost: worthy[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [{ kind: "object", types: ["Creature"], supertypes: ["Legendary"], notSubtypes: ["Villain"], colors: ["R", "W"], controller: "you", text: "target worthy creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach to target worthy creature you control." },
        text: line,
        equip: true,
      });
      continue;
    }
    // "Equip legendary creature {3}", "Equip Knight {1}", "Equip commander {3}" (CR 702.6c): only a creature you control
    // with that quality; "Equip—Pay 3 life.", "Equip—Sacrifice a creature." (a cost that isn't mana, CR 702.6a).
    const equipQ = /^Equip (?!planeswalker\b)((?:[A-Za-z]+,? (?:or )?)*?[A-Za-z]+) ((?:\{[^}]+\})+)$/.exec(line);
    const equipCost = /^Equip—(.+?)\.( Activate only once each turn\.)?$/.exec(line);
    // "Equip—Pay {3} or discard a card." (Bloodthorn Flail): one equip ability with a choice of costs, made as it's
    // activated (CR 602.2b, 601.2b). It's compiled as one equip ability per cost, which is the same choice from the menu.
    const equipOr = equipCost && !equipCost[2] ? /^Pay ((?:\{[^}]+\})+) or (discard (?:a|one) card)$/.exec(equipCost[1]!) : null;
    if (equipOr && d.subtypes.includes("Equipment")) {
      const acts = [equipOr[1]!, "Discard a card"].map((c) => parseActivated(`${c}: Attach ~ to target creature you control. Activate only as a sorcery.`));
      if (acts.some((a) => !a || a === "fail")) out.unsupported.push(raw);
      else acts.forEach((a, i) => out.activated.push({ ...(a as ActivatedAbility), text: i === 0 ? `Equip—Pay ${equipOr[1]!}.` : "Equip—Discard a card.", equip: true }));
      continue;
    }
    if ((equipQ || equipCost) && d.subtypes.includes("Equipment")) {
      const q = equipQ?.[1];
      const what = !q ? "creature" : /\bcreature\b/.test(q) ? q : q === "commander" ? "commander creature" : `${q} creature`;
      const act = parseActivated(`${equipQ ? equipQ[2] : equipCost![1]}: Attach ~ to target ${what} you control. Activate only as a sorcery${equipCost?.[2] ? " and only once each turn" : ""}.`);
      const target = act && act !== "fail" ? act.body.targets[0] : undefined;
      if (!act || act === "fail" || target?.kind !== "object" || !target.types?.includes("Creature")) out.unsupported.push(raw);
      else out.activated.push({ ...act, text: line, equip: true });
      continue;
    }
    // A double-faced token's "{2}: Transform this token." (CR 701.27a, 701.53b). A double-faced card's back face isn't in
    // the card data, so its transform abilities stay unsupported.
    const transform = /^((?:\{[^}]+\})+): Transform ~\.$/.exec(line);
    if (transform && d.tokenBack) {
      out.activated.push({ manaCost: transform[1]!, tap: false, sacrificeSelf: false, sorcerySpeed: false, body: { targets: [], effects: [{ type: "transformSelf" }], text: "Transform ~." }, text: line });
      continue;
    }
    // CR 702.151a: "[Cost]: Attach this permanent to another target creature you control. Activate only as a sorcery"
    // and "[Cost]: Unattach this permanent. Activate only if this permanent is attached to a creature and only as a sorcery."
    const reconfigure = /^Reconfigure ((?:\{[^}]+\})+)$/.exec(line);
    if (reconfigure && d.subtypes.includes("Equipment") && !out.reconfigure) {
      const mana = reconfigure[1]!;
      out.reconfigure = true;
      out.activated.push(
        {
          manaCost: mana,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", notSource: true, text: "another target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach ~ to another target creature you control." },
          text: `Reconfigure ${mana}: attach ~ to another target creature you control.`,
        },
        {
          manaCost: mana,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          activateIf: { kind: "self", is: "attachedToCreature" },
          body: { targets: [], effects: [{ type: "unattachSelf" }], text: "Unattach ~." },
          text: `Reconfigure ${mana}: unattach ~.`,
        },
      );
      continue;
    }
    // "Partner—Friends forever" and the other "partner—[text]" abilities only matter for deck building (CR 702.124i; see
    // commanderPairProblem).
    // "Doctor's companion" too (CR 702.124m).
    if (/^(?:Partner—(?:Character select|Father & son|Friends forever|Survivors)|Doctor's companion)$/.test(line)) continue;
    // Companion works only outside the game (CR 702.139a): from a revealed card set aside before the game. Decks here have
    // no cards outside the game, so in a game it does nothing.
    if (/^Companion ?— ?.+$/.test(line)) continue;
    // "Partner with [name]" is two abilities (CR 702.124j): the deck-building one (commanderPairProblem) and "When this
    // permanent enters, target player may search their library for a card named [name], reveal it, put it into their
    // hand, then shuffle."
    const partnerWith = /^Partner with ([^()]+?)\.?$/.exec(line);
    if (partnerWith) line = `When ~ enters, target player may search their library for a card named ${partnerWith[1]}, reveal it, put it into their hand, then shuffle.`;
    // Strive: "This spell costs {2}{G} more to cast for each target beyond the first" (CR 207.2c ability word).
    const strive = /^(?:Strive — )?(?:~|This spell) costs ((?:\{[^}]+\})+) more to cast for each target beyond the first\.$/.exec(line);
    if (strive && !out.strive) {
      out.strive = strive[1]!;
      continue;
    }
    // "Enchantment spells you cast have affinity for Auras" (Pearl-Ear): each such spell costs {1} less to cast for each
    // Aura you control (CR 702.41a); two of them, {2} less (CR 702.41b, rulings).
    // "Creature and planeswalker spells you cast have affinity for artifacts" (Tezzeret, Master of the Bridge), "Artifact
    // creature spells ..." (Mycosynth Golem).
    // "Spells you cast have affinity for artifacts" (Sami, Wildcat Captain): every spell.
    const grantAffinity = /^((?:[A-Z][a-z]+ (?:(?:and )?[a-z]+ )?)?spells|Spells) you cast have affinity for ([A-Za-z]+s)\.$/.exec(line);
    if (grantAffinity) line = `${grantAffinity[1]} you cast cost {1} less to cast for each ${grantAffinity[2]!.slice(0, -1)} you control.`;
    // Radagast of Rhosgobel: "The first creature spell you cast each turn costs {2} less to cast and can be cast as though
    // it had flash": both for the same spell, the first such one you cast this turn, counting those cast before it was on
    // the battlefield (rulings). The flash is checked as you'd begin casting it (CR 601.3), the reduction as its cost is
    // determined (CR 601.2f): its generic part only.
    const firstFlash = /^(The first (.*?)spell you cast each turn) (costs \{\d+\} less to cast) and can be cast as though it had flash\.$/.exec(line);
    if (firstFlash) {
      const c = parseCostChange(`${firstFlash[1]} ${firstFlash[3]}.`);
      const spec = firstFlash[2] ? parseTargetPhrase(`${firstFlash[2]}spell`) : null;
      if (!c || c === "fail" || !("costMod" in c) || c.costMod.nth !== 1 || spec?.kind !== "spell" || spec.controller) out.unsupported.push(raw);
      else {
        out.costMods = [...(out.costMods ?? []), { ...c.costMod, text: line }];
        (out.flashForFirst ??= []).push({ ...spec, text: `${firstFlash[2]}spells` });
      }
      continue;
    }
    const cost = parseCostChange(line);
    if (cost) {
      if (cost === "fail") out.unsupported.push(raw);
      // "Spells you cast of the chosen type" after "choose artifact, creature, ..." (Cloud Key): the card type chosen.
      else if ("costMod" in cost) out.costMods = [...(out.costMods ?? []), cost.costMod.filter.chosen === "type" && out.entersChoose?.some((c) => c.what === "cardType") ? { ...cost.costMod, filter: { ...cost.costMod.filter, chosen: "cardType" } } : cost.costMod];
      else if ("less" in cost) out.costLess = [...(out.costLess ?? []), cost.less];
      else if ("lessIfTargets" in cost) out.costLessIfTargets = [...(out.costLessIfTargets ?? []), cost.lessIfTargets];
      else if ("targetTax" in cost) out.targetTax = (out.targetTax ?? 0) + cost.targetTax;
      else if ("castTargetLess" in cost) out.castTargetLess = [...(out.castTargetLess ?? []), cost.castTargetLess];
      else if ("commanderTargetTax" in cost) out.commanderTargetTax = (out.commanderTargetTax ?? 0) + cost.commanderTargetTax;
      else if ("targetLifeTax" in cost) out.targetLifeTax = (out.targetLifeTax ?? 0) + cost.targetLifeTax;
      else if ("opponentsTargetTax" in cost) out.opponentsTargetTax = [...(out.opponentsTargetTax ?? []), cost.opponentsTargetTax];
      else out.costLessIf = [...(out.costLessIf ?? []), cost.lessIf];
      continue;
    }
    // "Enchanted creature has protection from the chosen color. This effect doesn't remove ~." (Cho-Manno's Blessing)
    const spare = /^(Enchanted creature has protection from .+?\.) This effect doesn't remove ~\.$/.exec(line);
    if (spare) {
      const st = parseStatic(spare[1]!);
      const ok = st?.affects.kind === "attached" && st.mods.length > 0 && st.mods.every((m) => m.kind === "addKeywords" && m.keywords.every((k) => /^Protection from /.test(k)));
      if (ok) out.statics.push({ ...st, mods: st.mods.map((m) => ({ ...m, spares: true as const })) as typeof st.mods, text: line });
      else out.unsupported.push(raw);
      continue;
    }
    // Zada, Hedron Grinder; Ink-Treader Nephilim; Precursor Golem (CR 707.10): a copy of the spell for each other creature
    // (or Golem) it could target, each copy targeting that one.
    const eachOther = /^Whenever (you cast|a player casts) an instant or sorcery spell(?: that targets only (~|a single ([A-Z][a-z]+)))?(, if that spell targets only ~)?, (copy (?:that|the) spell|that player copies that spell) for each other (creature you control|creature|[A-Z][a-z]+) that (?:the )?spell could target\. Each copy targets a different one of those (?:creatures|[A-Z][a-z]+s)\.$/.exec(line);
    if (eachOther && !eachOther[2] !== !eachOther[4]) {
      const single = eachOther[3] ? parseTargetPhrase(eachOther[3]) : null;
      const among = parseTargetPhrase(eachOther[6]!);
      const self = !eachOther[3];
      if ((eachOther[3] && (single?.kind !== "object" || eachOther[6] !== eachOther[3])) || among?.kind !== "object" || (eachOther[5] === "that player copies that spell") !== !!eachOther[3]) {
        out.unsupported.push(raw);
        continue;
      }
      out.triggers.push({
        event: "castSpell",
        cast: { by: eachOther[1] === "you cast" ? "you" : "any", spell: { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery spell" }, targetsOnly: single ? { ...single, text: eachOther[3]! } : "self" },
        body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: { ...among, text: eachOther[6]! }, ...(self ? { self: true as const } : {}), ...(eachOther[3] ? { caster: true as const } : {}), ...(eachOther[4] ? { onlySelf: true as const } : {}) } }], text: line.replace(/^Whenever [^,]+(?:, if that spell targets only ~)?, /, "") },
      });
      continue;
    }
    // Thrumming Stone: "Spells you cast have ripple 4." Each spell's granted ripple triggers as it's cast (CR 702.60a),
    // like a "whenever you cast a spell" ability; spells cast by ripple trigger it too (rulings).
    const grantedRipple = /^Spells you cast have ripple (\d+)\.$/.exec(line);
    if (grantedRipple) {
      out.triggers.push({ event: "castSpell", cast: { by: "you", spell: { kind: "spell", text: "spell" } }, body: rippleBody(Number(grantedRipple[1]), "cause") });
      continue;
    }
    // Hunter's Blowgun: "Equipped creature has deathtouch during your turn. Otherwise, it has reach.": one keyword during
    // your turn, the other during the others'.
    const blowgun = /^Equipped creature has ([a-z ]+) during your turn\. Otherwise, it has ([a-z ]+)\.$/.exec(line);
    if (blowgun) {
      const [mine, others] = [parseConditionalStatic(`During your turn, equipped creature has ${blowgun[1]}.`), parseStatic(`Equipped creature has ${blowgun[2]}.`)];
      if (mine?.condition?.kind === "yourTurn" && mine.affects.kind === "attached" && others?.affects.kind === "attached" && !others.condition && [...mine.mods, ...others.mods].every((m) => m.kind === "addKeywords")) {
        out.statics.push({ ...mine, text: line }, { ...others, condition: { kind: "yourTurn", not: true }, text: line });
        continue;
      }
    }
    // Phyrexian Boon: "Enchanted creature gets +2/+1 as long as it's black. Otherwise, it gets -1/-2."; Clutch of Undeath
    // ("as long as it's a Zombie"), Nyx Infusion ("as long as it's an enchantment"): one bonus while the enchanted creature
    // is that, the other while it isn't, each checked continuously (CR 611.3a).
    // Relic Axe: "Equipped creature gets +1/+1. If it's a Warrior, it gets +2/+1 instead." is the same, for Equipment.
    const insteadIf = /^(Enchanted|Equipped) creature gets ([+-]\d+\/[+-]\d+)\. If it's (an? [A-Z][a-z]+), it gets ([+-]\d+\/[+-]\d+) instead\.$/.exec(line);
    // Bonds of Faith: "Enchanted creature gets +2/+2 as long as it's a Human. Otherwise, it can't attack or block."
    const boonLine = insteadIf ? `${insteadIf[1]} creature gets ${insteadIf[4]} as long as it's ${insteadIf[3]}. Otherwise, it gets ${insteadIf[2]}.` : line;
    const boon = /^(Enchanted|Equipped) creature gets ([+-]\d+\/[+-]\d+) as long as it's (white|blue|black|red|green|an? [A-Z][a-z]+|an enchantment|an artifact)\. Otherwise, it (gets [+-]\d+\/[+-]\d+|can't attack or block)\.$/.exec(boonLine);
    if (boon) boon.splice(1, 1);
    if (boon) {
      const w = boon[2]!;
      const yes: TargetSpec | null = COLOR_WORDS[w] ? { kind: "object", types: ["Creature"], colors: [COLOR_WORDS[w]!], text: `${w} creature` }
        : /^an (enchantment|artifact)$/.test(w) ? { kind: "object", types: ["Creature"], allTypes: [capital(w.slice(3))], text: `${w.slice(3)} creature` }
        : CREATURE_TYPES.has(w.replace(/^an? /, "")) ? { kind: "object", types: ["Creature"], subtypes: [w.replace(/^an? /, "")], text: `${w.replace(/^an? /, "")} creature` } : null;
      const no: TargetSpec | null = !yes ? null : COLOR_WORDS[w] ? { kind: "object", types: ["Creature"], notColors: [COLOR_WORDS[w]!], text: `non${w} creature` }
        : /^an (enchantment|artifact)$/.test(w) ? { kind: "object", types: ["Creature"], notTypes: [capital(w.slice(3))], text: `non${w.slice(3)} creature` }
        : { kind: "object", types: ["Creature"], notSubtypes: [w.replace(/^an? /, "")], text: `non-${w.replace(/^an? /, "")} creature` };
      const who = /^Equipped /.test(boonLine) ? "Equipped" : "Enchanted";
      const [a, b] = [parseStatic(`${who} creature gets ${boon[1]}.`), parseStatic(`${who} creature ${boon[3]}.`)];
      if (yes && no && a?.affects.kind === "attached" && b?.affects.kind === "attached" && !a.condition && !b.condition) {
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: yes }, text: line }, { ...b, condition: { kind: "attachedIs", filter: no }, text: line });
        continue;
      }
    }
    // Noble Quarry (bestow): "All creatures able to block ~ or enchanted creature do so": itself while it's a creature, the
    // creature it enchants while it's an Aura (CR 509.1c, 702.103).
    if (line === "All creatures able to block ~ or enchanted creature do so.") {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "allMustBlock" }], text: line }, { affects: { kind: "attached" }, mods: [{ kind: "allMustBlock" }], text: line });
      continue;
    }
    // Precipitous Drop: "Enchanted creature gets -2/-2. It gets -5/-5 instead as long as you've completed a dungeon": the
    // difference added by a second static while the condition holds, both in layer 7c (CR 309.7, 613.4c).
    const instead = /^Enchanted creature gets ([+-])(\d+)\/([+-])(\d+)\. It gets \1(\d+)\/\3(\d+) instead as long as you've completed a dungeon\.$/.exec(line);
    if (instead) {
      const sign = (c: string) => (c === "-" ? -1 : 1);
      const [p0, t0, p1, t1] = [sign(instead[1]!) * Number(instead[2]), sign(instead[3]!) * Number(instead[4]), sign(instead[1]!) * Number(instead[5]), sign(instead[3]!) * Number(instead[6])];
      out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: p0, toughness: t0 }], text: line }, { affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: p1 - p0, toughness: t1 - t0 }], condition: { kind: "completedDungeon" }, text: line });
      continue;
    }
    // Multiclass Baldric: "Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste
    // if you control a Warrior, and flying if you control a Wizard": each keyword while its condition holds.
    const byControl = /^Equipped creature has (.+)\.$/.exec(line);
    const controlParts = byControl ? byControl[1]!.split(/, (?:and )?/) : [];
    if (byControl && controlParts.length > 1 && controlParts.every((p) => /^[a-z ]+ if you control an? [A-Z][a-z]+$/.test(p))) {
      const parts = controlParts.map((p) => /^([a-z ]+) if (you control an? [A-Z][a-z]+)$/.exec(p)!).map((m) => parseConditionalStatic(`As long as ${m[2]}, equipped creature has ${m[1]}.`));
      if (parts.every((st) => st && st.affects.kind === "attached" && st.condition && st.mods.every((m) => m.kind === "addKeywords"))) {
        for (const st of parts) out.statics.push({ ...st!, text: line });
        continue;
      }
    }
    // Scion of Draco: "Each creature you control has vigilance if it's white, hexproof if it's blue, ...": one static
    // ability giving each keyword to the creatures of that color (layer 6, after colors in layer 5, CR 613.1e-f).
    const byColor = /^Each creature you control has (.+)\.$/.exec(line);
    const colorParts = byColor ? byColor[1]!.split(/, (?:and )?/) : [];
    if (byColor && colorParts.length > 1 && colorParts.every((p) => /^[a-z ]+ if it's (?:white|blue|black|red|green)$/.test(p))) {
      const parts = colorParts.map((p) => /^([a-z ]+) if it's (white|blue|black|red|green)$/.exec(p)!).map((m) => parseStatic(`${capital(m[2]!)} creatures you control have ${m[1]}.`));
      if (parts.every((st) => st && st.mods.every((m) => m.kind === "addKeywords"))) {
        for (const st of parts) out.statics.push({ ...st!, text: line });
        continue;
      }
    }
    // Jetmir: "Creatures you control also get +1/+0 and have trample as long as ...": "also" only says it adds to the line
    // before it; each line is its own static ability (CR 604.1).
    const also = /^(Creatures you control) also (get .+ as long as .+)$/.exec(line);
    // Ivory Guardians: "Creatures named ~ get +1/+1 as long as ...": every creature with its name, anyone's, itself too
    // (rulings); each such ability applies once.
    const named = /^Creatures named ~ /.test(line) && /^[A-Z][A-Za-z' -]+$/.test(d.name) ? line.replace("~", d.name) : line;
    const st = also ? parseConditionalStatic(`${also[1]} ${also[2]}`) : parseStatic(named) ?? parseConditionalStatic(named);
    if (st) {
      out.statics.push(st);
      continue;
    }
    // Blessed Sanctuary: "Prevent all noncombat damage that would be dealt to you and creatures you control.": a prevention
    // for you and one for each of those creatures (CR 615.1), read as two.
    const preventYouAnd = /^Prevent all (combat |noncombat )?damage that would be dealt to you and (creatures|permanents) you control\.$/.exec(line);
    const youAndParts = preventYouAnd && [parseStatic(`If a source would deal ${preventYouAnd[1] ?? ""}damage to you, prevent that damage.`), parseStatic(`Prevent all ${preventYouAnd[1] ?? ""}damage that would be dealt to ${preventYouAnd[2]} you control.`)];
    if (youAndParts?.every((p) => p && !p.condition)) {
      for (const p of youAndParts) out.statics.push({ ...p!, text: line });
      continue;
    }
    // Tenza, Godo's Maul: "Equipped creature gets +1/+1. As long as it's legendary, it gets an additional +2/+2. As long as
    // it's red, it has trample.": one static ability for each sentence, each "it" the equipped creature.
    const attachedParts = /^(Equipped|Enchanted) creature [^.]+\.(?: As long as it's [^,.]+, it [^.]+\.)+$/.test(line) ? line.split(/(?<=\.) /) : null;
    const attachedStatics = attachedParts?.map((p, i) => (i === 0 ? parseStatic(p) : parseConditionalStatic(p.replace(/^As long as it's /, `As long as ${attachedParts[0]!.split(" ")[0]!.toLowerCase()} creature is `))));
    if (attachedStatics?.every((p) => p && p.affects.kind === "attached")) {
      for (const p of attachedStatics) out.statics.push({ ...p!, text: line });
      continue;
    }
    // "Lieutenant — As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance"
    // (Angelic Field Marshal), "... and other creatures you control get +2/+2 and have trample" (Thunderfoot Baloth):
    // two effects of one static ability with one condition, each read as its own (CR 604.2, 611.3).
    const twoGroups = /^(?:[A-Z][A-Za-z' -]+ — )?As long as ([^,]+), (~ (?:gets|has) .+?) and ((?:other )?creatures you control .+)\.$/.exec(line);
    const parts = twoGroups && [parseConditionalStatic(`As long as ${twoGroups[1]}, ${twoGroups[2]}.`), parseConditionalStatic(`As long as ${twoGroups[1]}, ${twoGroups[3]}.`)];
    if (parts?.every((p) => p)) {
      for (const p of parts) out.statics.push({ ...p!, text: line });
      continue;
    }
    // Death Baron: "Skeletons you control and other Zombies you control get +1/+1 and have deathtouch." One group made of
    // two: a creature that's both gets it once (rulings), so the Zombies are those that aren't also Skeletons; the source
    // itself only as a Skeleton (rulings).
    const twoTribes = /^([A-Z][a-z]+) you control and other ([A-Z][a-z]+) you control ((?:get|have) .+)$/.exec(line);
    const tribes = twoTribes && [parseStatic(`${twoTribes[1]} you control ${twoTribes[3]}`), parseStatic(`Other ${twoTribes[2]} you control ${twoTribes[3]}`)];
    if (tribes?.every((p) => p?.affects.kind === "filter" && !p.affects.spec && p.affects.subtypes?.length === 1)) {
      const [a, b] = tribes as [StaticAbility, StaticAbility];
      const skip = (a.affects as Extract<Affects, { kind: "filter" }>).subtypes!;
      out.statics.push({ ...a, text: line }, { ...b, affects: { ...(b.affects as Extract<Affects, { kind: "filter" }>), spec: { kind: "object", notSubtypes: skip, text: `non-${skip[0]}` } }, text: line });
      continue;
    }
    // Eidolon of Countless Battles: "~ and enchanted creature each get +1/+1 for each ...": the same for each of them (as
    // a bestowed Aura, ~ isn't a creature and gets nothing, CR 702.103b).
    const selfAnd = /^~ and (enchanted|equipped) creature each get (.+)$/.exec(line);
    const both = selfAnd && [parseStatic(`~ gets ${selfAnd[2]}`), parseStatic(`${capital(selfAnd[1]!)} creature gets ${selfAnd[2]}`)];
    if (both?.every((p) => p)) {
      for (const p of both) out.statics.push({ ...p!, text: line });
      continue;
    }
    // Dion, Bahamut's Dominant: "During your turn, ~ and other Knights you control have flying": ~ whatever its types,
    // and the other Knights; the same effect for each, read as two (CR 611.3). Yuna, Hope of Spira: "~ and enchantment
    // creatures you control have trample, lifelink, and ward {2}": ~ once, even as an enchantment creature (one ward,
    // CR 702.21b), and the others.
    // Sylvan Advocate: "As long as you control six or more lands, ~ and land creatures you control get +2/+2": the same, under
    // the condition. Vampire Nocturnus: "~ and other Vampire creatures you control get +2/+1 and have flying".
    const selfAndOthers = /^(During your turn, |As long as [^,]+, )?~ and (?:other )?([A-Z][a-z]+(?: creatures)?|[a-z]+ creatures) you control (have|get) (.+)$/.exec(line);
    const selfOthers = selfAndOthers && [`~ ${selfAndOthers[3] === "have" ? "has" : "gets"} ${selfAndOthers[4]}`, `${selfAndOthers[1] ? "other" : "Other"} ${selfAndOthers[2]} you control ${selfAndOthers[3]} ${selfAndOthers[4]}`].map((t) => (selfAndOthers[1] ? parseConditionalStatic(`${selfAndOthers[1]}${t}`) : parseStatic(t)));
    if (selfOthers?.every((p) => p)) {
      for (const p of selfOthers) out.statics.push({ ...p!, text: line });
      continue;
    }
    // A spell's "When you next cast ... this turn, ..." creates a delayed trigger as it resolves (CR 603.7); it isn't a triggered ability of the card.
    // So does a Pact's "At the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." (CR 603.7a), and
    // Glorious End's "At the beginning of your next end step, you lose the game." Rite of Harmony's "Whenever a creature or
    // enchantment you control enters this turn, draw a card" too (CR 603.7b).
    if (isSpell && (/^When you next cast /.test(line) || /^At the beginning of each combat this turn, /.test(line) || /^Whenever one or more creatures you control deal combat damage to one or more players this turn, /.test(line) || /^Whenever [^,]+ enters this turn, /.test(line) || /^Whenever you cast an? [a-z]+ spell this turn, /.test(line) || /^At the beginning of your next upkeep, pay (?:\{[^}]+\})+\. If you don't, you lose the game\.$/.test(line) || /^At the beginning of your next end step, you lose the game\.$/.test(line))) {
      spellLines.push(line);
      continue;
    }
    // "When you cast or cycle ~, ...", "When you cycle ~ and when ~ dies, ...", "Whenever ~ enters or attacks, ...",
    // "When ~ enters or dies, ...", "When ~ transforms into ~ or dies, ...", "When ~ enters and at the beginning of your upkeep, ...": one ability that triggers on
    // either event, which works like two with the same effect (CR 702.29c). The text is read for each event ("it" after it
    // died is the card).
    const twice =
      /^When you cast or cycle ~, (.+)$/.exec(line) ??
      // "When you cast ~ and whenever ~ attacks, destroy up to one target nonland permanent" (Cityscape Leveler).
      /^When you cast ~ and whenever ~ (attacks), (.+)$/.exec(line) ??
      // "When you cast this spell and when this creature dies, create a 0/1 ... Eldrazi Spawn ..." (Eldrazi Repurposer).
      /^When you cast ~ and when ~ (dies), (.+)$/.exec(line) ??
      // Voice of Resurgence: "Whenever an opponent casts a spell during your turn and when ~ dies, ...": a cast and a death are
      // never one event.
      /^(Whenever an opponent casts a spell during your turn) and when ~ dies, (.+)$/.exec(line) ??
      /^When ~ enters and (at the beginning of (?:your upkeep|your end step|each upkeep|each end step)), (.+)$/.exec(line) ??
      /^When you cycle ~ and when ~ dies, (.+)$/.exec(line) ??
      // "When ~ enters or is turned face up, ..." (Ponyback Brigade): a face-down permanent has no abilities as it enters (CR 708.2),
      // and turning it face up isn't entering (CR 708.8), so one or the other.
      /^When(?:ever)? ~ enters or (attacks|dies|is put into a graveyard from the battlefield|leaves the battlefield|the creature it haunts dies|deals combat damage to a player|transforms into ~|becomes monstrous|is turned face up), (.+)$/.exec(line) ??
      /^When ~ (transforms into ~) or dies, (.+)$/.exec(line) ??
      // "When ~ enters and whenever it deals combat damage to a player, create a Blood token." (Ivora, Insatiable Heir)
      /^When ~ enters and whenever it (attacks while saddled|attacks|deals combat damage to a player), (.+)$/.exec(line) ??
      // "Whenever ~ attacks or becomes the target of a spell, create a Treasure token" (Goldspan Dragon).
      // Tectonic Giant: "... or becomes the target of a spell an opponent controls".
      /^Whenever ~ (attacks) or (becomes the target of a spell(?: an opponent controls)?), (.+)$/.exec(line) ??
      // "Whenever this creature attacks, blocks, or becomes the target of a spell, ..." (Giggling Skitterspike).
      /^Whenever ~ attacks, blocks, or becomes the target of a spell, (.+)$/.exec(line) ??
      // "Whenever you create or sacrifice a token, ..." (Mirkwood Bats); "When ~ enters and whenever an opponent draws a
      // card except the first one they draw in each of their draw steps, ..." (Orcish Bowmasters).
      /^Whenever you (create or sacrifice) a token, (.+)$/.exec(line) ??
      // Eerie: "Whenever an enchantment you control enters and whenever you fully unlock a Room, ..." (Entity Tracker).
      /^Whenever (an enchantment you control enters|~ or another enchantment you control enters) and whenever you fully unlock a Room, (.+)$/.exec(line) ??
      // "When ~ enters and whenever you cast a spell with mana value 5 or greater, draw a card." (Up the Beanstalk)
      /^When ~ enters and (whenever (?!it )[^,]+), (.+)$/.exec(line) ??
      // "Whenever a creature you control of the chosen type enters or attacks, draw a card." (Kindred Discovery)
      /^Whenever (an? [^,]+? you control(?: of the chosen type)?) enters or attacks, (.+)$/.exec(line) ??
      // "Whenever your commander enters or attacks, ..." (Tome of Legends, Search for Dagger).
      /^Whenever (your commander) enters or attacks, (.+)$/.exec(line) ??
      // "Whenever another creature you control enters or dies, you gain 1 life." (Daxos, Blessed by the Sun)
      /^Whenever ((?:another|an?) [^,]+? you control) enters or dies, (.+)$/.exec(line) ??
      // "Whenever ~ or another nontoken Spirit you control dies or deals combat damage to a player, ..." (Millicent,
      // Restless Revenant): a death and combat damage are never one event.
      /^Whenever (~ or another [^,]+? you control) dies or deals combat damage to a player, (.+)$/.exec(line) ??
      // Park Heights Maverick: "Whenever ~ deals combat damage to a player or dies, proliferate": the same.
      /^Whenever ~ deals combat damage to a player or dies, (.+)$/.exec(line) ??
      // Syr Konrad: "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than
      // the battlefield, or a creature card leaves your graveyard, ...": no one event is two of them.
      /^Whenever (another creature dies), or (a creature card is put into a graveyard from anywhere other than the battlefield), or (a creature card leaves your graveyard), (.+)$/.exec(line) ??
      // Trouble in Pairs: "Whenever an opponent attacks you with two or more creatures, draws their second card each
      // turn, or casts their second spell each turn, you draw a card": three triggers (rulings: each can trigger).
      /^Whenever an opponent (attacks you with two or more creatures), (draws their second card each turn), or (casts their second spell each turn), (.+)$/.exec(line) ??
      // Norin the Wary: "When a player casts a spell or a creature attacks, ...": a cast and an attack are never one event.
      /^When (a player casts a spell) or (a creature attacks), (.+)$/.exec(line) ??
      // Powerstone Minefield: "Whenever a creature attacks or blocks, ~ deals 2 damage to it.": each creature as it's
      // declared as an attacker or as a blocker (CR 508.1, 509.1), never both at once.
      /^Whenever a creature (attacks) or (blocks), (.+)$/.exec(line) ??
      // Lady Octopus: "Whenever you draw your first or second card each turn": each card is drawn one at a time (CR 121.2).
      /^Whenever you draw your (first) or (second) card each turn, (.+)$/.exec(line) ??
      // Astrologian's Planisphere: "Whenever you cast a noncreature spell and whenever you draw your third card each turn":
      // a cast and a draw are never one event.
      /^Whenever (you cast an? [^,]+? spell) and whenever (you draw your (?:first|second|third) card each turn), (.+)$/.exec(line);
    if (twice && !/\bonly once\b/.test(line)) {
      const effect = twice[twice.length - 1]!;
      const events = /^Whenever a creature attacks or blocks, /.test(line)
        ? [`Whenever a creature attacks, ${effect}`, `Whenever a creature blocks, ${effect}`]
        : /^When you cast ~ and whenever/.test(line)
        ? [`When you cast ~, ${effect}`, `Whenever ~ ${twice[1]}, ${effect}`]
        : /^When you cast ~ and when ~ dies, /.test(line)
        ? [`When you cast ~, ${effect}`, `When ~ dies, ${effect}`]
        : /^Whenever an opponent casts a spell during your turn and when ~ dies, /.test(line)
        ? [`${twice[1]}, ${effect}`, `When ~ dies, ${effect}`]
        : /^When you cast/.test(line)
        ? [`When you cast ~, ${effect}`, `When you cycle ~, ${effect}`]
        : /^When you cycle/.test(line)
          ? [`When ~ dies, ${effect}`, `When you cycle ~, ${effect}`]
          : twice[1] === "the creature it haunts dies"
            ? [`When ~ enters, ${effect}`, `When the creature ~ haunts dies, ${effect}`]
            : /^at the beginning/.test(twice[1]!)
              ? [`When ~ enters, ${effect}`, `A${twice[1]!.slice(1)}, ${effect}`]
            : /^When ~ transforms into ~ or dies/.test(line)
              ? [`When ~ transforms into ~, ${effect}`, `When ~ dies, ${effect}`]
            : / and whenever you fully unlock a Room, /.test(line)
              ? [`Whenever ${twice[1]}, ${effect}`, `Whenever you fully unlock a Room, ${effect}`]
            : twice[1] === "create or sacrifice"
              ? [`Whenever you create a token, ${effect}`, `Whenever you sacrifice a token, ${effect}`]
            : /^whenever /.test(twice[1]!)
              ? [`When ~ enters, ${effect}`, `W${twice[1]!.slice(1)}, ${effect}`]
            : /^Whenever ~ attacks, blocks, or becomes the target of a spell, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `Whenever ~ blocks, ${effect}`, `Whenever ~ becomes the target of a spell, ${effect}`]
            : /^Whenever ~ attacks or becomes the target of a spell(?: an opponent controls)?, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `Whenever ~ ${twice[2]}, ${effect}`]
            : /^When a player casts a spell or a creature attacks, /.test(line)
              ? [`Whenever ${twice[1]}, ${effect}`, `Whenever ${twice[2]}, ${effect}`]
            : /^Whenever you cast an? [^,]+? spell and whenever you draw /.test(line)
              ? [`Whenever ${twice[1]}, ${effect}`, `Whenever ${twice[2]}, ${effect}`]
            : /^Whenever you draw your first or second card each turn, /.test(line)
              ? [`Whenever you draw your first card each turn, ${effect}`, `Whenever you draw your second card each turn, ${effect}`]
            : twice.length === 5
              ? twice.slice(1, 4).map((e) => `Whenever ${/^Whenever an opponent /.test(line) ? "an opponent " : ""}${e}, ${effect}`)
            : /^Whenever (?:an? [^,]+?|your commander) enters or attacks, /.test(line)
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[1]} attacks, ${effect}`]
            : /^Whenever ~ deals combat damage to a player or dies, /.test(line)
              ? [`Whenever ~ deals combat damage to a player, ${effect}`, `When ~ dies, ${effect}`]
            : /^Whenever ~ or another [^,]+? you control dies or deals combat damage to a player, /.test(line)
              ? [`Whenever ${twice[1]} dies, ${effect}`, `Whenever ${twice[1]} deals combat damage to a player, ${effect}`]
            : /^Whenever [^,]+? you control enters or dies, /.test(line)
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[1]} dies, ${effect}`]
            : [`When ~ enters, ${effect}`, `${/^(?:attacks|deals)/.test(twice[1]!) ? "Whenever" : "When"} ~ ${twice[1]}, ${effect}`];
      const both = events.map((l) => parseTrigger(l));
      if (both.some((t) => !t || t === "fail")) out.unsupported.push(raw);
      else for (const t of both) out.triggers.push(bindThisAbility(t as TriggeredAbility, line));
      continue;
    }
    const trig = parseTrigger(line);
    if (trig) {
      if (trig === "fail") out.unsupported.push(raw);
      else out.triggers.push(bindThisAbility(trig, line));
      continue;
    }
    const act = parseActivated(line);
    if (act) {
      // "Sacrifice six creatures named ~" (Shadowborn Apostle): this card's name; a copy has it too (CR 707.2).
      if (act !== "fail") for (const [i, c] of (act.costs ?? []).entries()) if (c.kind === "sacrifice" && c.filter.named === "~") act.costs![i] = { ...c, filter: { ...c.filter, named: d.name, text: c.filter.text.replace(/~/g, d.name) } };
      if (act === "fail") out.unsupported.push(raw);
      else out.activated.push(bindThisAbility(act, line));
      continue;
    }
    // A spell's paragraphs are read as one text, so an ability word inside it goes (CR 207.2c). "X can't be 0." after an
    // {X} spell's text (Mind Grind) is a rule about choosing X (CR 107.3), not an instruction.
    if (isSpell && / X can't be 0\.$/.test(line) && parseManaCost(d.manaCost).hasX && !/\bX can't be 0\b/.test(line.slice(0, -" X can't be 0.".length))) {
      out.xMin = 1;
      spellLines.push(stripAbilityWord(line.slice(0, -" X can't be 0.".length)));
    } else if (isSpell) spellLines.push(stripAbilityWord(line));
    else out.unsupported.push(raw);
  }
  if (paws) {
    const modes = paws.texts.map((t) => parseBody(t, { spell: true }));
    // Every mode has to work, and nothing else may be in the spell's text (it would be outside the modes).
    if (spellLines.length || paws.costs.length < 2 || spree || ascendSpell || modes.some((m) => !m)) out.unsupported.push(...paws.lines, ...spellLines);
    else out.spell = { targets: [], effects: [], text: paws.lines.join(" "), modal: { min: 0, max: paws.budget, modes: modes as AbilityBody[], pawprints: paws.costs, repeat: true } };
  } else if (spree) {
    const modes = spree.texts.map((t) => parseBody(t, { spell: true }));
    // Every mode has to work, and nothing else may be in the spell's text (it would be outside the modes).
    if (spellLines.length || spree.costs.length < 2 || ascendSpell || modes.some((m) => !m)) out.unsupported.push(...spree.lines, ...spellLines);
    else out.spell = { targets: [], effects: [], text: spree.lines.join(" "), modal: { min: 1, max: spree.tiered ? 1 : modes.length, modes: modes as AbilityBody[], costs: spree.costs } };
  } else if (isSpell) {
    // "Choose one — • Destroy all creatures. • Destroy all planeswalkers." then "Then return a creature ... card from your
    // graveyard to the battlefield ..." (Blood on the Snow): the paragraph after the modes is done whichever mode was
    // chosen, after it (CR 700.2, 608.2c). With one mode chosen, that's the same as the end of each mode.
    const tail = spellLines.length > 1 && spellLines[0]!.includes("•") && !spellLines.slice(1).some((l) => l.includes("•")) ? spellLines.slice(1).join(" ") : undefined;
    const body = tail !== undefined ? modesThen(spellLines[0]!, tail) : spellLines.length ? parseBody(spellLines.join(" "), { spell: true }) : null;
    if (body && ascendSpell && body.modal) out.unsupported.push("Ascend"); // before the modes: not modeled
    else if (body) out.spell = ascendSpell ? { ...body, effects: [{ type: "ascend" }, ...body.effects] } : body;
    // Into the Time Vortex, Throes of Chaos: cascade and nothing else to do; the spell resolves doing nothing more (CR 608.2).
    else if (!spellLines.length && !ascendSpell && d.keywords.includes("Cascade")) out.spell = { targets: [], effects: [], text: "" };
    else out.unsupported.push(...spellLines);
  }
  if (unpreventableX !== undefined) {
    // Only a spell whose own damage is one effect it deals, not modes or other sources' damage.
    const dmg = out.spell?.effects.filter((e) => e.type === "damage") ?? [];
    if (out.spell && !out.spell.modal && dmg.length === 1 && dmg[0]!.type === "damage" && !dmg[0]!.by) dmg[0]!.unpreventableX = unpreventableX;
    else {
      out.unsupported.push(`If X is ${unpreventableX} or more, ~ can't be countered and the damage can't be prevented.`);
      delete out.cantBeCounteredX;
    }
  }
  if (repeat) {
    const modal = out.spell?.modal;
    if (modal && !modal.costs && !modal.pawprints && modal.min === modal.max && modal.min > 1) modal.repeat = true;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("You may choose the same mode more than once.");
    }
  }
  if (escalate && escalate !== "fail") {
    // A "Choose one or more" (or "one or both") list without other mode costs.
    const modal = out.spell?.modal;
    const { raw, ...esc } = escalate;
    if (modal && modal.min === 1 && modal.max > 1 && !modal.costs && !modal.pawprints && !modal.repeat) modal.escalate = esc;
    else out.unsupported.push(raw);
  }
  if (both === "kicked") {
    // "Choose any number instead" when kicked: a "Choose one —" list, and a kicker to pay (one kicker cost).
    const modal = out.spell?.modal;
    if (modal && modal.min === 1 && modal.max === 1 && out.kicker?.costs.length === 1 && !out.kicker.multi) modal.both = both;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Choose one. If ~ was kicked, choose any number instead.");
    }
  } else if (both) {
    // Teamwork's "choose both" needs teamwork; either way, a list of exactly two modes.
    const modal = out.spell?.modal;
    const cond = bothIf !== undefined ? parseStaticCondition(bothIf.startsWith("?") ? bothIf.slice(1) : `you control ${bothIf}`, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    const playerCond = (cond?.kind === "control" && !cond.other && (cond.who ?? "you") === "you") || cond?.kind === "opponentGraveyard" || cond?.kind === "descended";
    if (both === "control" && modal && modal.min === 1 && modal.max === 1 && modal.modes.length >= 2 && playerCond) {
      modal.both = both;
      modal.bothIf = cond!;
    } else if (both !== "control" && modal && modal.min === 1 && modal.max === 1 && modal.modes.length === 2 && (both === "commander" || out.teamwork !== undefined)) modal.both = both;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Choose one. If ... choose both instead.");
    }
  }
  if (uncopyableSpell) {
    if (out.spell) out.spell.uncopyable = true;
    else out.unsupported.push("~ can't be copied.");
  }
  if (cipher) {
    if (out.spell && !out.spell.modal) out.spell = { ...out.spell, effects: [...out.spell.effects, { type: "cipher" }] };
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Cipher (on a modal spell)");
    }
  }
  // Awaken (CR 702.113a-b): "If this spell's awaken cost was paid, put N +1/+1 counters on target land you control. That
  // land becomes a 0/0 Elemental creature with haste. It's still a land." That target only when it's awakened.
  if (awaken) {
    if (out.spell && !out.spell.modal) {
      const i = out.spell.targets.length;
      const land = { ref: "target", index: i } as const;
      const awakened: Effect[] = [
        { type: "counters", what: land, counter: "+1/+1", n: awaken.n },
        { type: "continuous", what: land, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: ["Elemental"] }, { kind: "setPT", power: 0, toughness: 0 }, { kind: "addKeywords", keywords: ["Haste"] }], duration: "game" },
      ];
      out.spell = {
        ...out.spell,
        targets: [...out.spell.targets, { kind: "object", types: ["Land"], controller: "you", text: "target land you control", onlyIf: { cond: { kind: "altPaid", alt: "awaken" } } }],
        effects: [...out.spell.effects, { type: "if", cond: { kind: "altPaid", alt: "awaken" }, effects: awakened }],
        text: `${out.spell.text} Awaken ${awaken.n}.`,
      };
    } else {
      delete out.spell;
      out.unsupported.push(awaken.raw);
    }
  }
  // A spell's gift happens before any of its other instructions (CR 702.174j).
  if (out.gift && isSpell) {
    if (out.spell && !out.spell.modal) out.spell = { ...out.spell, effects: [{ type: "if", cond: { kind: "gift" }, effects: out.gift.effects }, ...out.spell.effects] };
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Gift (on a modal spell)");
    }
  }
  if (entwine) {
    const modal = out.spell?.modal;
    if (modal && !modal.costs && modal.max < modal.modes.length) modal.entwine = entwine.cost;
    else out.unsupported.push(entwine.raw);
  }
  if (striated && striated !== "fail") {
    const empty = compile({ ...d, oracleText: "", keywords: [] });
    for (const part of striated.parts)
      if (!addStriation(part, out, (line) => compile({ ...d, oracleText: line, keywords: [] }), empty)) out.unsupported.push(part.header, ...part.lines);
    // A keyword printed outside the striations too is the card's own.
    const own = new Set(lines.flatMap((l) => simpleKeywords(l.trim()) ?? []).map((k) => k.toLowerCase()));
    if (out.striatedKeywords) out.striatedKeywords = out.striatedKeywords.filter((k) => !own.has(k.toLowerCase()));
  }
  checkX(d, out);
  // "For each poison counter its controller has" counts for an affected permanent: a static ability's, or a resolved
  // continuous effect's (Phyresis Outbreak). Anywhere else there's no "it".
  const affectedPoison = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(affectedPoison);
    if (!v || typeof v !== "object") return false;
    if ((v as { type?: string }).type === "continuous" && (v as { what?: { ref?: string } }).what?.ref === "each") return false;
    return (v as { kind?: string }).kind === "affectedControllerPoison" || (v as { kind?: string }).kind === "affectedControllerHand" || (v as { kind?: string }).kind === "affectedColors" || Object.values(v).some(affectedPoison);
  };
  if (affectedPoison([out.spell, out.triggers, out.activated])) out.unsupported.push("(poison counters of an affected permanent's controller, with no affected permanent)");
  // Both pay with the same chosen cards: a discard for jump-start on top of a discard the spell asks for isn't modeled.
  const kinds = (costs: AdditionalCost[] = []) => costs.map((c) => c.kind);
  if (out.fromGraveyard?.some((g) => kinds(g.costs).some((k) => kinds(out.additionalCosts).includes(k)))) out.unsupported.push("graveyard cast with a cost like its additional cost");
  if (out.escapesWith && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  if (out.entersWithCounters?.escaped !== undefined && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  checkCastingLinks(out);
  // Overload (CR 702.96a-b): cast for that cost, the spell's text says "each" for "target", and it has no targets.
  const overload = out.altCosts?.find((a) => a.kind === "overload");
  if (overload && !d.oracleId.endsWith("|overloaded")) {
    const v = compileCard({ ...d, oracleId: `${d.oracleId}|overloaded`, oracleText: overloadedText(d.oracleText) });
    const targets = (b?: AbilityBody) => !!b && (b.targets.length > 0 || !!b.modal?.modes.some((m) => m.targets.length));
    if (!out.spell || v.unsupported.length || !v.spell || targets(v.spell)) out.unsupported.push(`Overload ${overload.mana}`);
  }
  // Cleave (CR 702.148a): cast for that cost, the spell's text without the words in square brackets.
  const cleave = out.altCosts?.find((a) => a.kind === "cleave");
  if (cleave && !d.oracleId.endsWith("|cleaved")) {
    const v = compileCard({ ...d, oracleId: `${d.oracleId}|cleaved`, oracleText: cleavedTexts.get(d.oracleId) ?? cleavedText(d.oracleText) });
    if (!out.spell || v.unsupported.length || !v.spell) out.unsupported.push(`Cleave ${cleave.mana}`);
  }
  linkExile(out);
  // "Attached to enchanted creature" (Mantle of the Ancients): only an Aura that enchants a creature has one.
  const bodies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])];
  if (bodies.some((b) => allEffects(b.effects).some((e) => e.type === "putOntoBattlefield" && e.attachToEnchanted)) && !(d.subtypes.includes("Aura") && out.enchant?.kind === "object" && out.enchant.types?.includes("Creature")))
    out.unsupported.push("(attached to enchanted creature, but it isn't an Aura enchanting a creature)");
  // Vampirism: "Other creatures you control get -1/-1" on an Aura that enchants a creature, or on an Equipment: it isn't a
  // creature itself, so "other" is other than the creature it's attached to.
  if (!d.types.includes("Creature") && (d.subtypes.includes("Equipment") || (d.subtypes.includes("Aura") && out.enchant?.kind === "object" && out.enchant.types?.length === 1 && out.enchant.types[0] === "Creature")))
    out.statics = out.statics.map((st) => {
      const a = st.affects;
      if (a.kind !== "filter" || !a.other || !(a.types.includes("Creature") || a.spec?.types?.includes("Creature"))) return st;
      const { other: _, ...rest } = a;
      return { ...st, affects: { ...rest, otherThanAttached: true } };
    });
  // An Aura put onto the battlefield needs a choice of what it enchants (CR 303.4f), which isn't modeled; "attached to
  // target creature" (Gryff's Boon) needs none.
  if (d.subtypes.includes("Aura") && out.activated.some((ab) => ab.zone === "graveyard" && ab.body.effects.some((e) => e.type === "putOntoBattlefield" && e.attachToTarget === undefined))) out.unsupported.push("(an Aura returning itself to the battlefield)");
  const json = JSON.stringify(out);
  if (json.includes('"thisAbility":true')) out.unsupported.push("(a copy effect's \"this ability\" outside a triggered or activated ability)");
  if (out.sunburst || json.includes('"kind":"colorsSpent"')) out.countsColors = true;
  // An "enchant player" Aura that only gives the enchanted player more steps or phases on their turn (Paradox Haze, Shadow
  // of the Second Sun): it helps the player it enchants, so bots put it on themselves.
  if (out.enchant?.kind === "player" && !out.enchant.opponent && !d.subtypes.includes("Curse") && !out.statics.length && !out.activated.length && out.triggers.length && out.triggers.every((t) => t.enchantedPlayersTurn && t.body.effects.every((e) => e.type === "addPhases" || e.type === "addUpkeepStep")))
    out.enchant = { ...out.enchant, helpsEnchanted: true };
  const wanted = wantedSpent(out);
  if (wanted.length) out.wantSpent = wanted;
  if (/"kind":"snowSpent"|"snow(?:OfColors)?":/.test(JSON.stringify([out.spell, out.entersWithCounters, out.triggers.filter((t) => t.event === "selfEnters")]))) out.wantSnow = true;
  return out;
}

/**
 * What this card's own text hopes was spent to cast it (CR 601.2h): "if {U} was spent to cast ~", adamant's "at least three
 * white mana", "sacrifice it unless {U} was spent to cast it". Not "no mana" (paying can't do that), nor Nix's target's
 * or a cast trigger's spell.
 */
function wantedSpent(out: CompiledCard): SpentReq[] {
  const reqs: SpentReq[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as { kind?: string; req?: SpentReq; target?: number };
    if ((o.kind === "spent" && o.target === undefined) || o.kind === "spentWas") reqs.push(o.req!);
    Object.values(v).forEach(visit);
  };
  visit(out.spell);
  visit(out.entersWithCounters);
  for (const t of out.triggers) if (t.event === "selfEnters") {
    if (t.ifSpent) reqs.push(t.ifSpent);
    visit(t.body);
  }
  const seen = new Set<string>();
  return reqs.filter((r) => !r.none && (r.colors || r.sameColor) && !seen.has(JSON.stringify(r)) && seen.add(JSON.stringify(r)));
}

/**
 * "Becomes a copy of ..., except it has this ability": the copy gets this ability's own text (CR 707.9a), which
 * refers to itself with "~" like any rules text, so the copy's own name takes its place.
 */
function bindThisAbility<T extends object>(ability: T, line: string): T {
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o.type === "becomeCopy" && (o.except as CopyExcept | undefined)?.thisAbility) {
      const { thisAbility: _, ...except } = o.except as CopyExcept;
      o.except = { ...except, text: [...(except.text ?? []), line] };
    }
    Object.values(o).forEach(visit);
  };
  visit(ability);
  return ability;
}

/**
 * "When ~ enters, exile target creature an opponent controls. When ~ leaves the battlefield, return the
 * exiled card to the battlefield under its owner's control": the two abilities are linked (CR 607.2a), so
 * the return gives back only what this object's own exile ability took. Needs exactly one exile to link to.
 */
function linkExile(out: CompiledCard) {
  // Imprint (an ability word, CR 207.2c): "{T}: Add one mana of any of the exiled card's colors" (Chrome Mox) is
  // linked to the one ability that exiles it as it enters (CR 607.2a).
  if (out.mana.some((m) => m.produces.kind === "colorsAmong" && m.produces.linked)) {
    const enters = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects));
    const imprints = enters.filter((e) => e.type === "takeFromHand" && e.action === "exile");
    // Pit of Offerings: "When this land enters, exile up to three target cards from graveyards", its only exile.
    const yardExiles = enters.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "returnLinked");
    if (out.triggers.some((t) => allEffects(t.body.effects).some((e) => e.type === "returnLinked"))) out.unsupported.push("(its mana ability can't be linked to one imprint ability)");
    else if (imprints.length === 1) (imprints[0] as Extract<Effect, { type: "takeFromHand" }>).linked = true;
    else if (!imprints.length && yardExiles.length === 1 && others.length === 1) yardExiles[0]!.linked = true;
    else out.unsupported.push("(its mana ability can't be linked to one imprint ability)");
  }
  // Extraplanar Lens: "a land with the same name as the exiled card" is the one its imprint ability exiled (CR 607.2a).
  if (out.manaTriggers?.some((t) => t.sameNameAsLinked)) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(its mana trigger can't be linked to one imprint ability)");
    else imprints[0]!.linked = true;
  }
  // Ugin's Labyrinth: "If a card is exiled with ~" and "Return the exiled card to its owner's hand" are about the card its
  // imprint ability exiled (CR 607.2a), its only exile.
  if (out.activated.some((a) => allEffects(a.body.effects).some((e) => e.type === "bounce" && e.what.ref === "linkedCard"))) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse");
    if (imprints.length !== 1 || others.length !== 1 || out.spell) out.unsupported.push("(returns an exiled card it can't link to one imprint ability)");
    else (imprints[0] as Extract<Effect, { type: "takeFromHand" }>).linked = true;
  }
  // Semblance Anvil: "the exiled card" its cost reduction compares with is the one its imprint ability exiled.
  if (out.costMods?.some((m) => m.sharesTypeWithLinked)) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(its cost reduction can't be linked to one imprint ability)");
    else (imprints[0] as Extract<Effect, { type: "takeFromHand" }>).linked = true;
  }
  // Cemetery Prowler, Protector, Gatekeeper: "cards exiled with ~", "the exiled card" are the ones its "exile a card from a
  // graveyard" ability exiled (CR 607.2a); it has no other exile instruction.
  if (out.costMods?.some((m) => m.perTypeSharedWithLinked) || out.triggers.some((t) => t.cast?.sharesTypeWithLinked)) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const yards = all.filter((e): e is Extract<Effect, { type: "chooseFromGraveyard" }> => e.type === "chooseFromGraveyard" && !!e.anyGraveyard);
    const others = all.filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "chooseFromGraveyard" && e.dest === "exile" && !e.anyGraveyard));
    if (!yards.length || others.length) out.unsupported.push("(compares with exiled cards it can't link to one exile ability)");
    else for (const e of yards) e.linked = true;
  }
  // Isochron Scepter: "copy the exiled card" is linked to the one ability that exiles a card from the hand as it enters.
  const copies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].some((b) => allEffects(b.effects).some((e) => e.type === "castLinkedCopy"));
  if (copies) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
    if (imprints.length !== 1) out.unsupported.push("(copies an exiled card it can't link to one imprint ability)");
    else (imprints[0] as Extract<Effect, { type: "takeFromHand" }>).linked = true;
  }
  // Agatha's Soul Cauldron: "creature cards exiled with ~" are the ones its one exile ability exiled (CR 607.2a).
  if (out.lendsExiled) {
    const exiles = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    // "Whenever ~ enters or attacks, exile ..." (Hazel's Brewmaster) is one ability compiled as one trigger per event:
    // the same body each time, so still one exile ability to link to.
    const oneAbility = exiles.length > 1 && new Set(out.triggers.map((t) => JSON.stringify(t.body)).filter((b, i) => allEffects(out.triggers[i]!.body.effects).some((e) => exiles.includes(e)))).size === 1 && exiles.every((e) => out.triggers.some((t) => allEffects(t.body.effects).includes(e)));
    if ((exiles.length !== 1 && !oneAbility) || exiles.some((e) => e.type !== "exile" || e.until)) out.unsupported.push("(lends abilities of exiled cards it can't link to one exile ability)");
    else for (const e of exiles) (e as Extract<Effect, { type: "exile" }>).linked = true;
  }
  // "Target creature card exiled with ~" (Dino DNA, The Darkness Crystal): linked to the one ability that exiles cards
  // (CR 607.2a), or to its replacement effect that exiles them (The Darkness Crystal's, already linked).
  const bodies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])];
  if (bodies.some((b) => b.targets.some((t) => t.linkedExile))) {
    const all = bodies.flatMap((b) => allEffects(b.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile");
    // Bronzebeak Foragers: "exile ... until ~ leaves the battlefield" when that's its only exile ability.
    const exiles = all.some((e) => !e.until) ? all.filter((e) => !e.until) : all.filter((e) => e.until === "sourceLeaves");
    const others = bodies.flatMap((b) => allEffects(b.effects)).some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length + (out.exileInsteadOfDying?.linked ? 1 : 0) !== 1) out.unsupported.push("(targets a card exiled with it that it can't link to one exile ability)");
    else if (exiles[0]) exiles[0].linked = true;
  }
  // Duplicant: "the last creature card exiled with it" is one its one exile ability exiled (CR 607.2a).
  if (out.statics.some((st) => st.mods.some((m) => m.kind === "linkedCreature"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = all.some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length !== 1) out.unsupported.push("(copies a card exiled with it that it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  // Unlicensed Hearse: "power and toughness are each equal to the number of cards exiled with it" counts what its one
  // exile ability exiled (CR 607.2a).
  if (out.statics.some((st) => JSON.stringify(st.mods).includes('"linkedExiled"')) && !bodies.some((b) => allEffects(b.effects).some((e) => e.type === "impulse"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = all.some((e) => e.type === "exileGraveyard" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length !== 1) out.unsupported.push("(counts cards exiled with it that it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  // Evendo Brushrazer: "play cards exiled with ~" is about the cards its one "exile the top card of your library" exiled
  // (CR 607.2a).
  if (out.playLinkedWhile) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && e.who.ref === "you" && !e.putAll);
    const others = all.some((e) => e.type === "exile" || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || tops.length !== 1) out.unsupported.push("(plays cards exiled with it that it can't link to one exile ability)");
    else tops[0]!.linked = true;
  }
  // Valakut Exploration: "cards exiled with ~" are the ones its one impulse exiled (CR 607.2a).
  // Court of Locthwain: "cast a spell from among cards exiled with ~" too.
  const usesLinked = (b: AbilityBody) => allEffects(b.effects).some((e) => e.type === "moveLinked" || e.type === "castLinkedFree") || JSON.stringify(b).includes('"linkedExiled"');
  const impulses = bodies.flatMap((b) => allEffects(b.effects)).filter((e): e is Extract<Effect, { type: "impulse" }> => e.type === "impulse");
  if (impulses.length && (bodies.some(usesLinked) || out.triggers.some((t) => JSON.stringify(t.ifCond ?? null).includes('"linkedExiled"')))) {
    const others = bodies.flatMap((b) => allEffects(b.effects)).some((e) => e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (others || impulses.length !== 1) out.unsupported.push("(refers to cards exiled with it that it can't link to one exile ability)");
    else impulses[0]!.linked = true;
  }
  // "Cast a spell from among cards exiled with ~" with no impulse: Idol of Endurance's one exile of graveyard cards until
  // it leaves (CR 607.2a).
  if (!impulses.length && bodies.some((b) => allEffects(b.effects).some((e) => e.type === "castLinkedFree"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exileGraveyard" }> => e.type === "exileGraveyard" && !!e.until);
    const others = all.some((e) => e.type === "exile" || (e.type === "exileGraveyard" && !e.until) || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length !== 1) out.unsupported.push("(casts a card exiled with it that it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  // Currency Converter: "Whenever you discard a card, you may exile that card from your graveyard" and "Put a card exiled
  // with ~ into its owner's graveyard": the cards its one exile instruction exiled (CR 607.2a).
  if (!impulses.length && bodies.some((b) => allEffects(b.effects).some((e) => e.type === "moveLinked"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    // Nautiloid Ship: "exile target player's graveyard" is the one exile instruction too.
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" | "exileGraveyard" }> => (e.type === "exile" && !e.until) || e.type === "exileGraveyard");
    const others = all.some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    if (!others && exiles.length === 1) exiles[0]!.linked = true;
  }
  // "Create a token that's a copy of a card exiled with ~" (Mimic Vat, The Cloning of Shredder): the cards its one exile
  // ability exiled (CR 607.2a), unless that's already linked (Mimic Vat's imprint). "A copy of the exiled card" (Mardu
  // Siegebreaker): the one its "exile ... until ~ leaves the battlefield" ability exiled, when it has no other exile.
  if (bodies.some((b) => JSON.stringify(b).includes('"linkedCard"')) && !out.activated.some((a) => allEffects(a.body.effects).some((e) => e.type === "bounce" && e.what.ref === "linkedCard"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const plain = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const exiles = plain.length ? plain : all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile");
    const others = all.some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length !== 1) out.unsupported.push("(copies a card exiled with it that it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  const returns = out.triggers.filter((t) => allEffects(t.body.effects).some((e) => e.type === "returnLinked" || e.type === "linkedExileToken"));
  if (!returns.length) return;
  // "When this creature is turned face up, exile ..." (Aurelia's Vindicator) is one of its exile abilities too (CR 607.2a).
  const exiling = (e: Effect): e is Extract<Effect, { type: "exile" | "takeFromHand" | "hideaway" | "discard" }> => (e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || (e.type === "discard" && !!e.exile)) && !("until" in e && e.until);
  const exiles0 = [...out.triggers.filter((t) => t.event === "selfEnters" || t.event === "selfTurnedFaceUp").map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter(exiling);
  // "Landfall — Whenever a land you control enters, you may exile target nonland permanent other than ~" (Admonition
  // Angel): with no exile as it enters or in an activated ability, its one other triggered ability that exiles.
  const exiles = exiles0.length ? exiles0 : out.triggers.filter((t) => !returns.includes(t)).flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => exiling(e) && e.type === "exile" && e.what.ref === "target");
  // "As an additional cost to cast this spell, behold an Elf and exile it" with "When this creature leaves the battlefield,
  // return the exiled card to its owner's hand" (Champions of the Perfect): the card exiled to pay the cost of the spell
  // that became this permanent (CR 607.2q, recorded as it's cast).
  const costExile = out.additionalCosts?.filter((c) => c.kind === "reveal" && c.exile).length === 1 && !out.costOr;
  if (costExile && !exiles.length && returns.length === 1 && returns[0]!.event === "selfLeaves" && allEffects(returns[0]!.body.effects).every((e) => e.type !== "linkedExileToken")) return;
  if (exiles.length !== 1 || returns.length !== 1 || returns[0]!.event !== "selfLeaves") {
    out.unsupported.push("(returns exiled cards it can't link to one exile ability)");
    return;
  }
  const ex = exiles[0]!;
  if (ex.type !== "hideaway") ex.linked = true; // hideaway's exile is always linked
}

/**
 * Text that refers to how the spell was cast needs the cost it refers to: "if it was kicked with its
 * {1}{U} kicker" becomes that kicker's index (CR 702.33f), "the sacrificed creature" needs a sacrifice cost.
 */
function checkCastingLinks(out: CompiledCard) {
  let bad = false;
  for (const k of out.entersKicked ?? []) {
    // "If ~ was kicked" with one (not multi-) kicker: that one.
    const i = out.kicker && k.cost !== undefined ? out.kicker.costs.indexOf(k.cost) : out.kicker?.costs.length === 1 && !out.kicker.multi ? 0 : -1;
    if (i < 0) bad = true;
    k.which = i;
    delete k.cost;
  }
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if ((o.kind === "kicked" || o.kind === "wasKicked") && !("filter" in o)) {
      if (!out.kicker) bad = true;
      else if (typeof o.cost === "string") {
        const i = out.kicker.costs.indexOf(o.cost);
        if (i < 0) bad = true;
        o.which = i;
        delete o.cost;
      }
    }
    // A reflexive trigger's "that creature" after "you may sacrifice another creature" (Heart-Piercer Manticore).
    if (o.type === "reflexive" && o.sacrificed) {
      const was = canSac;
      canSac = true;
      visit(o.body);
      canSac = was;
      return;
    }
    // Birthing Ritual: the dig's own sacrifice, "1 plus the sacrificed creature's mana value" in its filter.
    if (o.type === "dig" && o.sacrificeFirst) {
      const was = canSac;
      canSac = true;
      visit(o.filter);
      canSac = was;
      return;
    }
    // "You may sacrifice another creature. If you do, ... that creature's power" (Disciple of Freyalise).
    if (o.type === "if" && (o.cond as { kind?: string } | undefined)?.kind === "sacrificedThisWay") {
      const was = canSac;
      canSac = true;
      visit(o.effects);
      canSac = was;
      visit(o.otherwise);
      return;
    }
    if (((o.ref === "sacrificed" && !o.revealedCost) || o.kind === "sacrificedSuspected" || o.kind === "sacrificedLegendary" || o.kind === "sacrificedSubtype") && !canSac) bad = true;
    if (o.ref === "sacrificed" && o.exiledCost && !exileCost) bad = true;
    // "The revealed card" needs one card revealed as a cost, and nothing sacrificed or exiled to share the record.
    if (o.ref === "sacrificed" && o.revealedCost && !revealCost) bad = true;
    // "The exiled card" of an "Exile a nonland card from your hand" cost (Jhoira of the Ghitu): that ability's own cost.
    if (o.ref === "costExiled" && !handExileCost) bad = true;
    // "Cards exiled with ~" by its cost (Mechtitan Core): an activated ability that exiles other permanents as its cost.
    if (o.type === "returnExiled" && o.fromCost && !exileCost) bad = true;
    // "The chosen type" needs something that chooses one: "as ~ enters, choose" or "choose a creature type" before it.
    if (typeof o.chosen === "string") (/olor/.test(o.chosen) ? needs.add("color") : o.chosen === "cardType" ? needs.add("cardType") : o.chosen === "name" ? needs.add("cardName") : o.chosen === "number" || o.chosen === "powerAtLeast" ? needs.add("number") : needs.add("creatureType"));
    if (o.kind === "chosenColor" || (o.kind === "setColors" && o.chosen)) needs.add("color");
    if (o.kind === "setLandTypes" && (o.subtypes as string[]).includes(CHOSEN_LAND_TYPE)) needs.add("basicLandType");
    if (o.kind === "addKeywords" && ((o.keywords as string[]).includes(CHOSEN_PROTECTION) || (o.keywords as string[]).includes(CHOSEN_HEXPROOF))) needs.add("color");
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_PLAYER_PROTECTION) && !out.entersChoosePlayer) bad = true;
    if (o.ref === "selfChosenPlayer" && !out.entersChoosePlayer) bad = true;
    if (o.type === "choose") choices.add(o.choice as ChoiceKind);
    Object.values(o).forEach(visit);
  };
  const needs = new Set<ChoiceKind>();
  const choices = new Set<ChoiceKind>((out.entersChoose ?? []).map((c) => c.what));
  // "The sacrificed creature" refers to a sacrifice cost: the spell's, or the activated ability's own.
  let canSac = !!out.additionalCosts?.some((c) => c.kind === "sacrifice");
  let exileCost = false;
  let handExileCost = false;
  const oneReveal = (costs: AdditionalCost[] | undefined) => !!costs?.some((c) => c.kind === "reveal" && c.n === 1) && !costs.some((c) => c.kind === "sacrifice" || c.kind === "forage");
  let revealCost = oneReveal(out.additionalCosts);
  visit([out.spell, out.triggers, out.statics, out.mana]);
  for (const ab of out.activated) {
    canSac = !!ab.costs?.some((c) => c.kind === "sacrifice");
    exileCost = !!ab.costs?.some((c) => c.kind === "sacrifice" && c.exile);
    handExileCost = !!ab.costs?.some((c) => c.kind === "exileFromHand" && !c.toLibrary && c.n === 1);
    revealCost = oneReveal(ab.costs);
    visit(ab);
  }
  revealCost = false;
  exileCost = false;
  handExileCost = false;
  visit([out.costMods, out.activationTaxes]);
  if (out.nameBans || out.protectionFromChosenName) needs.add("cardName");
  if (out.noncreatureChosenMvCantBeCast) needs.add("number");
  if ([...needs].some((k) => !choices.has(k))) bad = true;
  // Sower of Discord's trigger is about the two players chosen as it entered, and only that.
  if (out.triggers.some((tr) => tr.event === "chosenPlayerDealtDamage") !== !!out.entersChooseTwoPlayers) bad = true;
  // "If the discarded card ..." needs a discard cost: the spell's, or the activated ability's own.
  const discIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"discardedIs"');
  if (discIn(out.spell) && !out.additionalCosts?.some((c) => c.kind === "discard")) bad = true;
  if (discIn(out.triggers) || discIn(out.statics) || out.activated.some((ab) => discIn(ab) && !ab.costs?.some((c) => c.kind === "discard"))) bad = true;
  // "If evidence was collected" needs the "you may collect evidence N" it's linked to (CR 701.59c): in the spell, or its
  // permanent's enters trigger.
  const evidenceIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"evidence"');
  if ((evidenceIn(out.spell) || out.triggers.some((t) => t.ifEvidence || evidenceIn(t.body))) && out.evidence === undefined) bad = true;
  if (out.triggers.some((t) => t.event !== "selfEnters" && evidenceIn(t.body)) || evidenceIn(out.activated) || evidenceIn(out.statics)) bad = true;
  // "If this spell's surge cost was paid" needs that alternative cost (CR 702.117a, 702.137a): in the spell, or its
  // permanent's enters trigger.
  // "If the {1}{B} cost was paid": the card's one "rather than pay" cost, that mana (Baleful Mastery).
  const masteryMana = /\bIf the ((?:\{[^}]+\})+) cost was paid\b/.exec(out.spell?.text ?? "")?.[1];
  // "If ~ was cast using web-slinging" needs its web-slinging cost (CR 702.188a).
  if ((out.triggers.some((t) => t.ifAlt === "webSlinging") || out.entersWithCounters?.ifWebSlung) && !out.altCosts?.some((a) => a.webSlinging)) bad = true;
  for (const alt of ["surge", "spectacle", "alternative", "madness", "prowl"] as const) {
    const altIn = (v: unknown) => JSON.stringify(v ?? null).includes(`"kind":"altPaid","alt":"${alt}"`);
    const alts = out.altCosts?.filter((a) => a.kind === alt) ?? [];
    // Madness is a keyword, not an alternative cost of the card's own text (CR 702.35).
    const linked = alt === "alternative" ? alts.length === 1 && alts[0]!.mana === masteryMana && !alts[0]!.costs?.length : alt === "madness" ? alts.length > 0 || out.madness !== undefined : alts.length > 0;
    if ((altIn(out.spell) || out.triggers.some((t) => t.ifAlt === alt || altIn(t.body))) && !linked) bad = true;
    if (out.triggers.some((t) => t.event !== "selfEnters" && altIn(t.body)) || altIn(out.activated) || altIn(out.statics)) bad = true;
  }
  // The mana spent to cast a spell (CR 601.2h) is known for the spell, its permanent's enters trigger, and a cast trigger's
  // spell; Nix's is its target's.
  const spentIn = (v: unknown): boolean => Array.isArray(v) ? v.some(spentIn) : !!v && typeof v === "object" && ((v as { kind?: string; target?: number }).kind === "spent" && (v as { target?: number }).target === undefined ? true : Object.values(v).some(spentIn));
  if (out.triggers.some((t) => t.event !== "selfEnters" && t.event !== "castSpell" && spentIn(t.body)) || spentIn(out.statics) || spentIn(out.activated)) bad = true;
  // Mana from Treasures spent (CR 106.3) is known for a spell, its permanent's enters trigger, and an activated ability.
  const treasureIn = (v: unknown) => /"kind":"treasure(?:Spent)?"/.test(JSON.stringify(v ?? null));
  if (out.triggers.some((t) => t.event !== "selfEnters" && treasureIn(t.body)) || treasureIn(out.statics) || JSON.stringify(out.activated ?? null).includes('"kind":"treasureSpent"}')) bad = true;
  if (/"kind":"treasureSpent","activated"/.test(JSON.stringify([out.spell, out.triggers, out.statics]))) bad = true;
  // Mana from snow sources spent (CR 107.4h): a spell's or its permanent's enters trigger's; Boreal Outrider's "of that
  // spell's colors" only in a cast trigger's condition.
  const snowIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"snowSpent"');
  if (out.triggers.some((t) => t.event !== "selfEnters" && snowIn(t.body)) || snowIn(out.statics) || snowIn(out.activated)) bad = true;
  if (JSON.stringify([out.spell, out.triggers.map((t) => ({ ...t, cast: undefined })), out.statics, out.activated, out.entersWithCounters]).includes('"snowOfColors"')) bad = true;
  // "Enters with a counter for each creature of the chosen type": counted once its own "as ~ enters, choose" is answered
  // (afterChoice), both part of how it enters (CR 614.12); with nothing chosen as it enters it can't be counted.
  needs.clear();
  visit(out.entersWithCounters);
  if (needs.size === 1 && out.entersWithCounters && out.entersChoose?.length === 1 && needs.has(out.entersChoose[0]!.what)) out.entersWithCounters.afterChoice = out.entersChoose[0]!.what;
  else if (needs.size) bad = true;
  if (bad) out.unsupported.push("(text about how it was cast that this card's costs don't explain)");
}

/**
 * X needs a value. A spell's X is chosen as it's cast (CR 107.3a), and its permanent's "enters with"
 * and enters abilities use it (CR 107.3m); everything else about the permanent sees 0 (CR 107.3g).
 * Text that uses an X with no value is a reading we can't trust, so the card isn't supported.
 */
function checkX(d: CardDef, out: CompiledCard) {
  // Or in an additional cost: "As an additional cost to cast this spell, pay X life" (CR 107.3a).
  // Or in its kicker cost, "Kicker {X}" (0 unless it was kicked).
  const cardX = parseManaCost(d.manaCost).hasX || !!out.additionalCosts?.some((c) => "x" in c && c.x) || !!out.kicker?.costs.some((c) => parseManaCost(c).hasX);
  const bad = (what: string) => out.unsupported.push(what);
  if (out.spell && usesX(out.spell) && !cardX) {
    bad(out.spell.text);
    delete out.spell;
  }
  if (out.entersWithCounters && usesX(out.entersWithCounters) && !cardX) {
    bad("enters with X counters");
    delete out.entersWithCounters;
  }
  // "Monstrosity X" (CR 701.37c): "when ~ becomes monstrous" abilities use the X it became monstrous with.
  const monstrousX = out.activated.some((a) => allEffects(a.body.effects).some((e) => e.type === "monstrosity" && usesX(e.n)));
  // "When you cycle this card" uses the X of an {X} in the cycling cost (Shark Typhoon, rulings).
  const cyclingX = out.activated.some((a) => a.cycling && /\{X\}/.test(a.manaCost));
  // "When this creature is turned face up" uses the X of an {X} in its morph or disguise cost (CR 702.37f, 702.168e).
  const faceUpX = !!out.faceDownCast && /\{X\}/.test(out.faceDownCast.cost);
  out.triggers = out.triggers.filter((tr) => {
    // A "when you cast this spell" ability uses the X the spell was cast with (CR 107.3a, 601.2b; rulings on Hydroid Krasis).
    // "Where X is the number of nonland cards milled this way" (The Wise Mothman): the event's (TriggeredAbility.eventX).
    if (!usesX(tr.body) || ((tr.event === "selfEnters" || tr.event === "selfCast") && cardX) || (tr.event === "selfBecomesMonstrous" && monstrousX) || (tr.event === "selfCycled" && cyclingX) || (tr.event === "selfTurnedFaceUp" && faceUpX) || tr.eventX || (tr.xKicked && out.kicker?.multi)) return true;
    bad(tr.body.text);
    return false;
  });
  if (out.costLess && usesX(out.costLess)) {
    bad("costs {X} less");
    delete out.costLess;
  }
  // Spliced, only the card's rules text is added (CR 702.47c): a plain spell, with nothing that depends on how this card
  // itself was cast, and no X (the spell it's spliced onto has its own).
  if (out.splice && (!out.spell || out.spell.modal || usesX(out.spell) || out.kicker || out.altCosts || out.buyback !== undefined || out.fromGraveyard)) {
    bad(`Splice onto ${out.splice.onto === "Arcane" ? "Arcane" : "instant or sorcery"} ${out.splice.mana}`);
    delete out.splice;
  }
}

/** What a gift gives (CR 702.174d-i), done for the opponent it was promised to. */
function giftOf(what: string): NonNullable<CompiledCard["gift"]> {
  const who = { ref: "giftee" } as const;
  const effects: Effect[] =
    what === "a card"
      ? [{ type: "draw", who, n: 1 }]
      : what === "an extra turn"
        ? [{ type: "extraTurn", who, n: 1 }]
        : what === "a tapped Fish"
          ? [{ type: "createToken", who, n: 1, tapped: true, token: { name: "Fish", power: 1, toughness: 1, colors: ["U"], types: ["Creature"], subtypes: ["Fish"], keywords: [] } }]
          : what === "an Octopus"
            ? [{ type: "createToken", who, n: 1, token: { name: "Octopus", power: 8, toughness: 8, colors: ["U"], types: ["Creature"], subtypes: ["Octopus"], keywords: [] } }]
            : [{ type: "createToken", who, n: 1, token: PREDEFINED_TOKENS[what === "a Food" ? "Food" : "Treasure"]! }];
  return { what, effects };
}

const giftText = (what: string) =>
  what === "a card" ? "draws a card" : what === "an extra turn" ? "takes an extra turn after this one" : what === "a tapped Fish" ? "creates a tapped 1/1 blue Fish creature token" : what === "an Octopus" ? "creates an 8/8 blue Octopus creature token" : `creates ${what} token`;

/** A "choose one" spell's modes, each followed by the same paragraph (see the isSpell case of compileCard). */
function modesThen(modesLine: string, tail: string): AbilityBody | null {
  const body = parseBody(modesLine, { spell: true });
  const then = parseBody(tail, { spell: true });
  if (!body?.modal || body.modal.max !== 1 || body.modal.repeat || !then || then.modal || then.targets.length || body.effects.length || body.targets.length) return null;
  return { ...body, text: `${body.text} ${then.text}`, modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, effects: [...m.effects, ...structuredClone(then.effects)], text: `${m.text} ${then.text}` })) } };
}

/**
 * A results table is part of the ability with the instruction to roll (CR 706.3b): its rows join that line, before an
 * "Activate only ..." restriction. parseBody reads them as "if the result was in this range" (SpellCondition "rollIn").
 */
function joinRollTables(lines: string[]): void {
  for (let i = 1; i < lines.length; i++) {
    if (!ROLL_ROW.test(lines[i]!.trim())) continue;
    let head = i - 1;
    while (head > 0 && ROLL_ROW.test(lines[head]!.trim())) head--;
    if (!/\broll\b/i.test(lines[head]!)) continue;
    const prev = lines[i - 1]!;
    const restriction = / Activate only [^.]+\.(?: Activate only [^.]+\.)*$/.exec(prev);
    lines[i - 1] = restriction ? `${prev.slice(0, restriction.index)} ${lines[i]!.trim()}${restriction[0]}` : `${prev} ${lines[i]!.trim()}`;
    lines.splice(i, 1);
    i--;
  }
}

/**
 * A modal ability is a "choose ... —" line followed by one line per mode, each starting
 * with a bullet (CR 700.2). Join them into one line so the ability is compiled as a whole.
 */
function joinModes(lines: string[]): string[] {
  const out: string[] = [];
  // "{4}, {T}: Choose one. Activate only as a sorcery." then the modes (Aetheric Amplifier): the restriction goes after
  // the last mode, where the activated ability's parser reads it.
  let restriction: string | undefined;
  const close = () => {
    if (restriction) out[out.length - 1] = `${out[out.length - 1]} ${restriction}`;
    restriction = undefined;
  };
  for (const line of lines) {
    const before = out[out.length - 1];
    const restricted = /^\s*•/.test(line) && !restriction && before !== undefined ? /: Choose one\.( Activate only [^.]+\.)+$/.exec(before) : null;
    if (restricted) {
      restriction = restricted[0].slice(": Choose one.".length).trim();
      out[out.length - 1] = `${before!.slice(0, restricted.index)}: Choose one —`;
    }
    if (!/^\s*•/.test(line)) close();
    const prev = out[out.length - 1];
    // "..., choose one that hasn't been chosen this turn." followed by bullets (Lita): the same as with a dash.
    const dotted = prev !== undefined && /\bchoose one(?: that hasn't been chosen(?: this turn)?| at random)?\.$/i.test(prev);
    if (/^\s*•/.test(line) && prev !== undefined && dotted) out[out.length - 1] = `${prev.replace(/\.$/, " —")} ${line.trim()}`;
    else if (/^\s*•/.test(line) && prev !== undefined && (/—\s*(•.*)?$/.test(prev) || /you may choose two\. Each mode must target a different player\.(\s*•.*)?$/.test(prev))) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  close();
  return out;
}

/**
 * "Sacrifice a creature or pay {3}{B}", "pay 5 life or pay {2}", "sacrifice a creature, discard a card, or pay 3 life":
 * a choice between additional costs (CR 601.2b). "Sacrifice an artifact or creature" is one cost, not a choice.
 */
function parseCostOr(text: string): CostOption[] | null {
  const parts = text.split(/,? or (?=(?:pay|sacrifice|discard|reveal|exile) )|, (?=(?:pay|sacrifice|discard|reveal|exile) )/);
  if (parts.length < 2) return null;
  const out: CostOption[] = [];
  for (const p of parts) {
    const mana = /^pay ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(p);
    const cost = mana ? null : parseAdditionalCost(p);
    if (mana) out.push({ mana: mana[1]!, text: p });
    else if (cost) out.push({ cost, text: p });
    else return null;
  }
  return out;
}

/**
 * "You may play lands from the top of your library", "you may play lands and cast spells from the top of your library",
 * "you may cast creature spells from the top of your library", "you may cast Angel spells and Human spells ...", "once
 * each turn, you may cast an instant or sorcery spell from the top of your library": at their usual timing, a land still
 * using the turn's land play (rulings on Courser of Kruphix, Future Sight and Johann). Undefined if it isn't one.
 */
export function parseFromTop(text: string): FromTop | null | undefined {
  // "You may play the top card of your library", "you may play cards from the top of your library": lands and spells.
  text = text.replace(/^(you may) play (?:the top card of your library|cards from the top of your library)$/i, "$1 play lands and cast spells from the top of your library");
  // "Play historic lands" (Crystal Skull): only lands of that kind.
  const m = /^(Once each turn, )?[Yy]ou may (?:play (?:([a-z]+) )?lands(?: and cast (.+))?|cast (.+)) from the top of your library$/.exec(text);
  if (!m) return undefined;
  const lands = m[4] === undefined;
  const what = m[3] ?? m[4];
  if (m[1] && (lands || !what)) return null; // only "once each turn, you may cast ..." is modeled
  const landFilter = m[2] ? parseSearchFilter(`${m[2]} land card`) : undefined;
  if (m[2] && !landFilter) return null;
  if (!what) return { lands, ...(landFilter ? { landFilter } : {}) };
  if (what === "spells") return m[1] ? null : { lands, ...(landFilter ? { landFilter } : {}), spells: "any" };
  // "Creature spells", "an instant or sorcery spell", "a creature spell with power 2 or less", "Angel spells and Human
  // spells", "spells with mana value 4 or greater": each kind as a card filter.
  const parts = what.split(/ spells and (?=\S+ spells$)/).map((x) => x.replace(/^an? /, ""));
  const spells: TargetSpec[] = [];
  for (const part of parts) {
    if (!/\bspells?\b/.test(part) && parts.length === 1) return null;
    // Realmwalker: "creature spells of the chosen type", the permanent's choice (see topPermission).
    const chosen = / of the chosen type$/.test(part);
    const kinds = part.replace(/ of the chosen type$/, "");
    const phrase = (/\bspells?\b/.test(kinds) ? kinds.replace(/\bspells?\b/, "card") : `${kinds} card`).replace(/ and /g, " or ").trim();
    const f = parseSearchFilter(phrase);
    if (!f) return null;
    spells.push(chosen ? { ...f, chosen: "type", text: `${f.text} of the chosen type` } : f);
  }
  return { lands, ...(landFilter ? { landFilter } : {}), spells, ...(m[1] ? { once: true as const } : {}) };
}

/**
 * "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an
 * additional time" (Yarok), "if a creature dying causes ..." (Teysa Karlov), "if a creature attacking causes ..." (Isshin),
 * "if a triggered ability of a Ninja creature you control triggers, ..." (Splinter): CR 603.2d.
 */
function triggersAgainLine(line: string): NonNullable<CompiledCard["triggersAgain"]>[number] | null {
  // "Wolf or battle you control", "land or Bird you control": any of them.
  // "Colorless spell you control or another colorless permanent you control" (Echoes of Eternity): spells too, when
  // `spells`.
  const kinds = (phrase: string, other: boolean, spells = false): { filter: TargetSpec; other?: true }[] | null => {
    const yours = / you control$/.test(phrase);
    const parts = phrase.replace(/ you control$/, "").split(/,? or (?!less\b|greater\b|more\b)/).map((p) => p.replace(/ you control$/, ""));
    const out: { filter: TargetSpec; other?: true }[] = [];
    for (const p of parts) {
      const another = /^another /.test(p);
      const f = parseTargetPhrase(`${p.replace(/^another /, "")}${yours ? " you control" : ""}`);
      if (f?.kind !== "object" && !(spells && f?.kind === "spell" && !another)) return null;
      out.push({ filter: f, ...(other || another ? { other: true as const } : {}) });
    }
    return out;
  };
  // Gandalf the White: "If a legendary permanent or an artifact entering or leaving the battlefield causes ...": either
  // way, whatever zone it left for.
  const both = /^If (?:an? )?(.+?) entering or leaving the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time\.$/.exec(line);
  if (both) {
    const filter = kinds(both[1]!.replace(/ or an? /g, " or "), false);
    return filter ? { by: { event: "entersOrLeaves", filter: filter.map((x) => x.filter) } } : null;
  }
  let m = /^If (?:an? )?(.+?) (entering|dying|attacking|dealing combat damage to a player)(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time\.$/.exec(line);
  if (m) {
    const event = ({ entering: "enters", dying: "dies", attacking: "attacks" } as Record<string, "enters" | "dies" | "attacks">)[m[2]!] ?? "combatDamage";
    // Dying and attacking are things only creatures do here (CR 700.4, 508.1a).
    if ((event === "dies" || event === "attacks" || event === "combatDamage") && !/^creature( you control)?$/.test(m[1]!)) return null;
    const filter = kinds(m[1]!, false);
    return filter ? { by: { event, filter: filter.map((x) => x.filter) } } : null;
  }
  // The Masamune's granted ability: "If a creature dying causes a triggered ability of this creature or an emblem you own
  // to trigger, that ability triggers an additional time" (CR 603.2d): only the abilities of the permanent that has it and
  // of its controller's emblems, about any creature dying (rulings).
  if (line === "If a creature dying causes a triggered ability of ~ or an emblem you own to trigger, that ability triggers an additional time.") return { by: { event: "dies", filter: [{ kind: "object", types: ["Creature"], text: "creature" }] }, selfOrEmblems: true };
  // Wizard's Staff: "If a triggered ability of equipped creature triggers, that ability triggers an additional time" (CR 603.2d).
  if (line === "If a triggered ability of equipped creature triggers, that ability triggers an additional time.") return { ofEquipped: true };
  // Cloud, Midgar Mercenary: its own abilities and its Equipment's, while it's equipped.
  if (line === "As long as ~ is equipped, if a triggered ability of ~ or an Equipment attached to it triggers, that ability triggers an additional time.") return { selfOrEquipment: true };
  // Veyran, Voice of Duality.
  if (line === "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.") return { by: { event: "castOrCopy" } };
  m = /^If a triggered ability of (?:an? )?(.+?) triggers, (?:that ability|it) triggers an additional time\.$/.exec(line);
  // "Another creature you control of the chosen type" (Roaming Throne): the creature type chosen as it entered.
  const ofChosen = m && /^(another )?(creature you control) of the chosen type$/.exec(m[1]!);
  if (ofChosen) {
    const of = kinds(ofChosen[2]!, !!ofChosen[1]);
    return of?.length === 1 ? { of: [{ ...of[0]!, filter: { ...of[0]!.filter, chosen: "type", text: `${of[0]!.filter.text} of the chosen type` } }] } : null;
  }
  if (m) {
    const all = /^another (.+ or .+ you control)$/.exec(m[1]!);
    const of = kinds(all ? all[1]! : m[1]!, !!all, true);
    return of && of.every((x) => x.filter.controller === "you") ? { of } : null;
  }
  return null;
}

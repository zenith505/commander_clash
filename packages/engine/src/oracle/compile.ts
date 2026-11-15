import { faceDef, hasFuse, isRoom, restingDef, roomDoorDefs } from "../faces";
import { isMeldResult, meldPartnerName, meldResultDef } from "../meld-results";
import { allEffects, GRANTED_WAY_COSTS } from "../abilities";
import type { Amount, CounterKind, Modification, FromTop, AbilityBody, Count, ChoiceKind, TriggeredAbility, CompiledCard, Effect, AdditionalCost, CostOption, TargetSpec, ActivatedAbility, StaticCondition, SpentReq, StaticAbility, Affects } from "../abilities";
import { canonicalKeyword, LAND_TYPES, CARD_TYPE_PLURAL, CHOSEN_HEXPROOF, CHOSEN_KEYWORDS, CHOSEN_LAND_TYPE, CHOSEN_LANDWALK, CHOSEN_SNOW_LANDWALK, SACRIFICED_LANDWALK, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION, CHOSEN_TYPE_PROTECTION, CHOSEN_PARITY_PROTECTION, CHOSEN_NUMBER_EXCEPT_PROTECTION, CREATURE_TYPES, LINKED_TYPES_PROTECTION, LINKED_CARD_KEYWORD, creatureTypeOfPlural, isEveryCreatureTypeText, isLandwalk, stripReminder, subtypeSet } from "../keywords";
import { parseManaCost } from "../mana";
import { substituteX } from "../amounts";
import { withModes, gateTargets, X_MODES_MAX, type CastHow } from "../modes";
import type { CardDef, Color, ManaType, PlayerId } from "../types";
import type { CopyExcept } from "../copies";
import { NUM, num, NUMX, COUNTER, counterKind, X, amt, parseSpentReq, plainMana, sacrificeSelf, SPENT, ROLL_ROW, COLOR_WORDS, capital, singularWord } from "./words";
import { parseManaAbility, parseManaTrigger } from "./mana-abilities";
import { parseGraveyardKeyword, parseCostKeyword, parseAdditionalCost, keywordAbilities, textKeywords, isKeywordLine, firebending, rippleBody } from "./keyword-abilities";
import { parseEntersCondition, parseEntersChoice, parseConditionalStatic, parseCostChange, parseStatic, parseStaticCondition, parseOnlyClauses, parseActivateCondition } from "./statics";
import { parseTrigger } from "./triggers";
import { KEYWORD_WORDS, parseActivated, parseLoyalty, stripAbilityWord } from "./activated";
import { parseBody, replaceX, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { parseBecomes } from "./sentence";
import { PLANESWALKER_TYPES, parseGroup, parseTargetPhrase } from "./targets";
import { backupTriggers, parseGrants } from "./grants";
import { dungeonTriggers } from "./dungeons";
import { parseCountMod, parseCopyExcept, parseToken, PREDEFINED_TOKENS } from "./tokens";
import { parseCardNameChoice, parseSearchFilter } from "./search";
import { addStriation, simpleKeywords, striations } from "./striations";
import { draftLine } from "./draft";
import { roundB171Line, yardEntersLinkOnly } from "./laneb171";
import { roundB173Line } from "./laneb173";
import { roundB174Line } from "./laneb174";
import { roundB175Line } from "./laneb175";
import { roundB176Line } from "./laneb176";
import { roundB177Line } from "./laneb177";
import { roundB178Line } from "./laneb178";
import { roundB179Line } from "./laneb179";
import { roundB182Finish, roundB182Line } from "./laneb182";
import { roundB183Line } from "./laneb183";
import { roundB184Line } from "./laneb184";
import { roundB185Line } from "./laneb185";
import { roundB186Line } from "./laneb186";
import { roundB187Line } from "./laneb187";
import { roundB188Line } from "./laneb188";
import { roundB192Line } from "./laneb192";
import { roundB194Line, roundB194Spell } from "./laneb194";
import { roundB197Line } from "./laneb197";
import { roundB198Line } from "./laneb198";
import { markOnlyWalls, roundB199Line } from "./laneb199";
import { roundB200Line } from "./laneb200";
import { roundB201Line } from "./laneb201";
import { roundB202Line } from "./laneb202";
import { roundB204Line } from "./laneb204";
import { roundB205Line } from "./laneb205";
import { roundB206Chapter, roundB206Line } from "./laneb206";
import { roundB207Line } from "./laneb207";
import { roundB208Line } from "./laneb208";
import { roundB209Line } from "./laneb209";
import { roundB210Line } from "./laneb210";
import { roundB211Line } from "./laneb211";
import { roundB213Line } from "./laneb213";
import { roundB214Line } from "./laneb214";
import { round344Line } from "./round344";
import { roundB190Line } from "./laneb190";
import { roundB191Line, roundB191Spell, roundB191Text } from "./laneb191";
import { round345Chapter, round345Line } from "./round345";
import { round346Line } from "./round346";
import { round347Line } from "./round347";
import { round348Line } from "./round348";
import { round349Line } from "./round349";
import { round350Line } from "./round350";
import { round351Line } from "./round351";
import { round352Line } from "./round352";
import { round353Line } from "./round353";
import { round354Finish, round354Line, round354Tiered } from "./round354";
import { round358Line } from "./round358";
import { round359Line } from "./round359";
import { round360Line } from "./round360";
import { round361Line } from "./round361";
import { round362Line } from "./round362";
import { round363Line } from "./round363";
import { round364Line } from "./round364";
import { round365Line } from "./round365";
import { round366Line } from "./round366";
import { round367Line } from "./round367";
import { round368Cost, round368Line } from "./round368";
import { roundB189Line } from "./laneb189";

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
  // Lantern Flare: "... and you gain X life. [X is the number of creatures you control.]": not cleaved, that sentence
  // defines the X of the one before it (CR 107.3c), as "where X is" does.
  const d = cleaves ? { ...d0, oracleText: d0.oracleText.replace(/^([^.\n[]*\bX\b[^.\n[]*)\. \[X is ([^\].]+)\.\]$/m, "$1, where X is $2.").replace(/[[\]]/g, "") } : d0;
  const hit = cache.get(d.oracleId);
  if (hit) return hit;
  const doors = d.roomDoors ? roomDoorDefs(d) : undefined;
  // Wall of Shadows: the targets of spells and abilities that can target only Walls are marked (TargetSpec.onlyWalls).
  const out = markOnlyWalls(doors ? roomAbilities(doors) : compile(d));
  // An emblem's activated abilities work in the command zone, where it is (CR 114.4): its owner activates them there.
  if (d.typeLine === "Emblem") out.activated = out.activated.map((ab) => ({ ...ab, zone: "command" as const }));
  // A meld card's ability melds it with its counterpart into their combined back face (CR 701.42a): only if what that
  // puts onto the battlefield is supported.
  if (d.meld && !isMeldResult(d) && /\bmeld them into\b/.test(d.oracleText) && !meldResultSupported(d.meld.result)) out.unsupported.push(`(${d.meld.result}, the permanent it melds into)`);
  // Warping Wurm: "Whenever ~ phases in" and an upkeep trigger that phases it out go on the stack together, in the order
  // its controller chooses (CR 603.3b). The engine doesn't ask; the phase-in trigger resolves first (round B214,
  // TriggeredAbility.resolveFirst), as its controller would have it: the other order only loses the counter when it phases
  // out (CR 702.26b), and with it paid for the two orders end the same.
  const phasesIn = out.triggers.findIndex((t) => t.event === "selfPhasesIn");
  if (phasesIn >= 0 && out.triggers.some((t) => t.event === "yourUpkeep" && allEffects(t.body.effects).some((e) => e.type === "phaseOut" && e.what.ref === "self")))
    out.triggers[phasesIn] = { ...out.triggers[phasesIn]!, resolveFirst: true };
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
/** An optional additional cost paid like kicker ("you may waterbend {2}", "you may blight 1", "you may behold a Dragon"). */
const MAY_COST = /^As an additional cost to cast ~, you may (?:waterbend \{\d+\}|blight \d+|sacrifice an? (?:artifact|creature|land|enchantment)|behold an? [A-Z][a-z]+(?: creature)?|reveal an? [A-Z][a-z]+ card from your hand|pay (?:\{[^}]+\})+)\.$/m;
/** The Dragons of Tarkir reveal cycle: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand." */
const MAY_REVEAL = /^As an additional cost to cast ~, you may reveal an? ([A-Z][a-z]+) card from your hand\.$/m;
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
  // A planeswalker needs a printed loyalty number to enter with (CR 306.5b), or "X" with {X} in its mana cost: the X it
  // was cast with (CR 107.3m; Nissa, Steward of Elements).
  // A transforming card's back face with no loyalty box (Garruk, the Veil-Cursed) keeps the counters it has when it
  // transforms (CR 712.18); put onto the battlefield transformed, it enters with none (306.5b) and goes to the graveyard
  // (704.5i).
  const backNoLoyalty = d.faceOf && d.faceOf.face > 0 && d.layout === "transform" && d.loyalty === undefined;
  if (d.types.includes("Planeswalker") && !backNoLoyalty && !/^\d+$/.test(d.loyalty ?? "") && !(d.loyalty === "X" && cost.hasX)) return false;
  const c = compileCard(d);
  // Creatures, and Vehicles that can become creatures (CR 301.7a), need numbers for power and toughness,
  // or a characteristic-defining ability that says what a "*" is (CR 604.3).
  const defined = c.statics.flatMap((st) => st.mods).find((x) => x.kind === "definePT");
  // A printed negative number is a number (Char-Rumbler's -1, Spinal Parasite's -1/-1).
  // Primal Clay's "*/*": 0/0 off the battlefield, the chosen values on it (CR 208.2b).
  const ptOk = (v: string | undefined, key: "power" | "toughness") => /^-?\d+$/.test(v ?? "") || (/\*/.test(v ?? "") && defined?.kind === "definePT" && defined[key] !== undefined) || (v === "*" && (!!c.entersForms || !!c.starsSetOnBattlefield));
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
  // The right half's targets come after the left half's (an effect names its target by `index`, a damage source by
  // `target`: Blood's "Target creature you control deals damage", Flesh // Blood).
  const shift = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(shift) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, (k === "index" || k === "target") && typeof v === "number" ? v + left.targets.length : shift(v)])) : x;
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

/**
 * The targets as the spell is cast (CR 601.2c): its targets, with rules about choosing them that don't apply later, when
 * the spell resolves (CR 608.2b) or its target is changed. Dream Leash: "You can't choose an untapped permanent as this
 * spell's target as you cast it."
 */
export function castTimeTargets(d: CardDef, specs: TargetSpec[]): TargetSpec[] {
  if (!compileCard(d).castTargetTapped || !specs[0]) return specs;
  return [{ ...specs[0], tapped: true, text: `tapped ${specs[0].text ?? ""}`.trim() }, ...specs.slice(1)];
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
  // Brand of Ill Omen: "Enchanted creature's controller can't cast creature spells" isn't a layer effect, but it hurts.
  // Psychic Venom, Artifact Possession: a trigger about the enchanted permanent that deals damage to its controller or
  // has them lose life hurts too.
  const hurtsHost = c.triggers.some((tr) => (tr.host === "attached" || tr.activates?.equipped) && allEffects(tr.body.effects).some((e) => (e.type === "damage" && e.to.ref === "subjectController") || (e.type === "loseLife" && e.who.ref === "subjectController")));
  // Wellspring, Captivating Glance: a trigger that gains control of the enchanted permanent takes it from its controller.
  const stealsHost = c.triggers.some((tr) => allEffects(tr.body.effects).some((e) => e.type === "continuous" && e.what.ref === "attached" && !e.giveTo && e.mods.some((m) => m.kind === "control")));
  return { targets: [c.enchantedControllerCantCast || hurtsHost || stealsHost ? { ...c.enchant, harmsEnchanted: true } : c.enchant], effects, text: d.oracleText };
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
    // The Incredible Hulk: "If he's attacking".
    .replace(/\b(?:[Hh]e|[Ss]he)'s (?=attacking\b)/g, "~ is ")
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
  // Tamiyo, Compleated Sage: "Create Tamiyo's Notebook, a legendary colorless Book artifact token": the same.
  // Only when the text never names the token again (Volo's Journal is named later, so it stays "~'s Journal" throughout).
  t = t.replace(/(\b[Cc]reate )([A-Z][\w'-]*'s(?: [A-Z][\w'-]*)+)(?=, a legendary )/g, (m: string, a: string, n: string) => t.split(n).length !== 2 ? m : `${a}\u0001${tokenNames.push(n) - 1}\u0001`);
  // Stangg: "create Stangg Twin, a legendary 3/4 red and green Human Warrior creature token": the token's name, the card's
  // name and one more word.
  if (full) t = t.replace(new RegExp(`(\\b[Cc]reate )(${esc(full)} [A-Z][\\w'-]*)(?=, a legendary )`, "g"), (_, a: string, n: string) => `${a}\u0001${tokenNames.push(n) - 1}\u0001`);
  // Stangg, Echo Warrior: "create Stangg Twin, a legendary ...": the card's short name (CR 201.5c) and one more word.
  const shortName = full.split(",")[0]!;
  if (full && shortName !== full) t = t.replace(new RegExp(`(\\b[Cc]reate )(${esc(shortName)} [A-Z][\\w'-]*)(?=, a legendary )`, "g"), (_, a: string, n: string) => `${a}\u0001${tokenNames.push(n) - 1}\u0001`);
  // Icingdeath, Frost Tyrant: "create Icingdeath, Frost Tongue, a legendary white Equipment artifact token": the token's
  // name, the card's short name (CR 201.5c) and other words after a comma, a name of its own (CR 111.4), not the card.
  const commaName = full.split(",")[0]!;
  if (full && commaName !== full) t = t.replace(new RegExp(`(\\b[Cc]reate )(${esc(commaName)}, [A-Z][\\w'-]*(?: [A-Z][\\w'-]*)*)(?=, a legendary )`, "g"), (m: string, a: string, n: string) => (n === full ? m : `${a}\u0001${tokenNames.push(n) - 1}\u0001`));
  // Mishra, Eminent One: "create a token that's a copy of ..., except its name is Mishra's Warform": a name of its own made
  // with the card's short name (CR 201.5c), not the card.
  if (full && commaName !== full) t = t.replace(new RegExp(`(\\bexcept its name is )(${esc(commaName)}'s [A-Z][\\w'-]*)(?= and |,|\\.)`, "g"), (_, a: string, n: string) => `${a}\u0001${tokenNames.push(n) - 1}\u0001`);
  // Kookus: "a creature named Keeper of Kookus" is another card's name with its name in it.
  const otherNames: string[] = [];
  if (full) t = t.replace(new RegExp(`(\\bnamed )((?:[A-Z][\\w'-]*|of|the)(?: (?:[A-Z][\\w'-]*|of|the))* ${esc(full)})(?![\\w'-])`, "g"), (_, a: string, n: string) => `${a}\u0002${otherNames.push(n) - 1}\u0002`);
  if (full) {
    // "Return target card named Rekindling Phoenix" in its token's ability (Sound the Call, Deathpact Angel): a name, the
    // card's, not the object with the ability (CR 201.4b), so it stays as written for that ability's own compile.
    t = t.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(`(\\bnamed )${esc(full)}(?![\\w'-])`, "g"), (_, a: string) => `${a}\u0002${otherNames.push(full) - 1}\u0002`));
    t = t.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(esc(full), "g"), QUOTED_SOURCE_NAME));
    // The card named Exile: "Exile target nonwhite attacking creature" is the keyword action, not the card (its name
    // followed by "target" is never the card).
    const verb = /^[A-Z][a-z]+$/.test(full) ? "(?! target\\b)" : "";
    // Aurochs: "for each other attacking Aurochs" is the creature type that is also its name (CR 205.3m), not the card.
    // Assembly-Worker: "Target Assembly-Worker creature" is the type too (rulings: any creature of that type).
    const typed = CREATURE_TYPES.has(full) ? "(?<!attacking )" : "";
    const typedAfter = CREATURE_TYPES.has(full) ? "(?! creatures?\\b)" : "";
    t = t.replace(new RegExp(typed + esc(full) + verb + typedAfter, "g"), "~");
  }
  // Shortened names (CR 201.5c): "Gylwain" for "Gylwain, Casting Director", and for a legendary card with no comma,
  // "Ellivere" for "Ellivere of the Wild Court", "Gandalf" for "Gandalf the Grey" (not "Tuktuk the Returned", a token
  // Tuktuk the Explorer creates).
  const comma = full.split(",")[0]!;
  // "Shang-Chi" for "Shang-Chi and the Ten Rings".
  const ofThe = comma === full && d.supertypes?.includes("Legendary") ? /^(.+?) (?:and the|of|the) /.exec(full)?.[1] : undefined;
  // "Edgar" for "Edgar Markov": a legendary card's two-word name, when the first word isn't a type (CR 201.5c; not
  // "Sliver" for "Sliver Queen"). "Imskir" for "Imskir Iron-Eater": the second word may be hyphenated; "Niv-Mizzet" for
  // "Niv-Mizzet Reborn": the first one too. "Dáin" for "Dáin Ironfoot": letters with accents count (\p{L}).
  const twoWords = comma === full && !ofThe && d.supertypes?.includes("Legendary") ? /^(\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?) \p{Lu}\p{Ll}+(?:[-']\p{Lu}\p{Ll}+)*$/u.exec(full)?.[1] : undefined;
  const first = twoWords && !CREATURE_TYPES.has(twoWords) && !/^(?:Artifact|Creature|Enchantment|Land|Planeswalker|Battle|Kindred|Tribal|Instant|Sorcery|Legendary|Basic|Snow|World)$/.test(twoWords) ? twoWords : undefined;
  // "King Darien" for "King Darien XLVIII": a legendary card's name without its regnal number.
  const regnal = comma === full && !ofThe && !first && d.supertypes?.includes("Legendary") ? /^(.+ .+) [IVXLC]+$/.exec(full)?.[1] : undefined;
  // "Ezio" for "Ezio Auditore da Firenze": a legendary card's longer name without a comma, by its first word, when its
  // text uses that word alone (CR 201.5c).
  const firstOfLong = comma === full && !ofThe && !first && !regnal && d.supertypes?.includes("Legendary") ? /^([A-Z][a-z]+) [A-Z][a-z]+ [a-z]+ [A-Z][a-z]+$/.exec(full)?.[1] : undefined;
  const firstUsed = firstOfLong && !CREATURE_TYPES.has(firstOfLong) && new RegExp(`(?<![\\p{L}])${esc(firstOfLong)} (?!${esc(full.slice(firstOfLong.length + 1))})`, "u").test(t) ? firstOfLong : undefined;
  const short = ofThe ?? first ?? regnal ?? firstUsed ?? comma;
  // Galactus, Devourer of Worlds: "a creature named Silver Surfer, Galactus's Herald" is another card's name with the short
  // name in it.
  if (short && short !== full) t = t.replace(new RegExp(`(\\bnamed )([A-Z][\\w'-]*(?: [A-Z][\\w'-]*)*, ${esc(short)}'s [A-Z][\\w'-]*)`, "g"), (_, a: string, n: string) => `${a}\u0002${otherNames.push(n) - 1}\u0002`);
  if (short && short !== full) {
    // Not "Nissa's Chosen" in Nissa Revane, another card's name.
    // Letter boundaries that know accented letters ("Éowyn" for "Éowyn, Fearless Knight"), which \b doesn't.
    // Not "each Garruk you control" in Garruk, Cursed Huntsman: there it's the planeswalker type (CR 205.3j).
    // Nor "Empower Jace X" in Jace, Reality Sculptor: a Jace planeswalker token (CR 701.71a), not ~ itself (rulings).
    // Nor "non-Gideon creatures" in Gideon, the Oathsworn: creatures that aren't Gideon planeswalkers (rulings).
    const pwType = PLANESWALKER_TYPES.has(short) ? "(?<!(?:^|[^\\p{L}])(?:each|another|other|target|a|an|Empower) )(?<!non-)" : "";
    // Lizard, Connors's Curse: "becomes a green Lizard creature" is the creature type its short name also is (CR 205.3m).
    const shortTyped = CREATURE_TYPES.has(short) ? "(?! creatures?\\b)" : "";
    const re = new RegExp(`${pwType}(?<![\\p{L}\\p{N}_])${esc(short)}(?![\\p{L}\\p{N}_])${shortTyped}${ofThe ? "(?! (?:of|the) [A-Z])" : ""}${first || firstUsed ? "(?!'s [A-Z])" : ""}`, "gu");
    t = t.replace(/"[^"]*"/g, (q) => q.replace(re, QUOTED_SOURCE_NAME));
    t = t.replace(re, "~");
  }
  t = t.replace(/\u0001(\d+)\u0001/g, (_, i: string) => tokenNames[Number(i)]!);
  t = t.replace(/\u0002(\d+)\u0002/g, (_, i: string) => otherNames[Number(i)]!);
  // A card named for two characters ("Aang and La, Ocean's Fury", "Bebop & Rocksteady") takes plural verbs: "Whenever
  // Aang and La attack", "Whenever ~ enter or attack". It's still one object (CR 201.5), read as "~ attacks".
  // A plural name ("The Sackville-Bagginses", "The Notary Hobbits") too.
  // The Fantastic Four: "When ~ enter", "~ deal 3 damage".
  if (/ (?:and|&) /.test(comma) || /^The [^,]+[a-z]s$/.test(d.name) || d.name === "The Fantastic Four") {
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
  // Iron Fist, Living Weapon: '~ gains "{T}: Iron Fist deals damage equal to his power to any other target"': given to
  // itself, its name in the quote is the object that has the ability, "~" there, and "his" its "its" (CR 201.5).
  t = t.replace(/((?<![\w~])~ gains )"([^"]*\u27easource\u27eb[^"]*)"/g, (_, a: string, q: string) => `${a}"${q.replaceAll(QUOTED_SOURCE_NAME, "~").replace(/\b(?:his|her) power\b/g, "its power")}"`);
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
  `^(?:${["Adamant", "Addendum", "Alliance", "Battalion", "Bloodrush", "Celebration", "Channel", "Chroma", "Cohort", "Constellation", "Converge", "Corrupted", "Council's dilemma", "Coven", "Delirium", "Descend 4", "Descend 8", "Disappear", "Domain", "Eerie", "Eminence", "Enrage", "Fateful hour", "Fathomless descent", "Ferocious", "Flurry", "Formidable", "Grandeur", "Hellbent", "Heroic", "Imprint", "Infusion", "Inspired", "Join forces", "Kinship", "Landfall", "Lieutenant", "Magecraft", "Metalcraft", "Morbid", "Opus", "Pack tactics", "Paradox", "Parley", "Radiance", "Raid", "Rally", "Renew", "Repartee", "Revolt", "Secret council", "Spell mastery", "Strive", "Survival", "Sweep", "Tempting offer", "Threshold", "Undergrowth", "Valiant", "Vivid", "Void", "Will of the council", "Will of the Planeswalkers"].join("|")}) — `,
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
  /** Bane Alley Broker: "You may look at cards exiled with ~." (its face-down exile ability's cards). */
  let lookLinked: string | undefined;
  /** Banefire: "If X is 5 or more, ... the damage can't be prevented": applied to the spell's damage once it's compiled. */
  let unpreventableX: number | undefined;
  /** Demonfire: "If you have no cards in hand, ... the damage can't be prevented", applied the same way. */
  let unpreventableIf: { cond: StaticCondition; raw: string } | undefined;
  let awaken: { n: number; raw: string } | undefined;
  // "Choose one. If this spell was cast using teamwork, choose both instead." and "Choose one. If you control a commander
  // as you cast this spell, you may choose both instead.": a "Choose one —" list whose count can change as it's cast.
  // "Choose one. If this spell was kicked, choose any number instead." (Inscriptions) too.
  let both: "teamwork" | "commander" | "kicked" | "control" | undefined;
  let kickedBoth = false;
  let bothIf: string | undefined;
  let bothAny = false;
  // "Choose three. You may choose the same mode more than once." (the Confluences, CR 700.2d).
  let repeat = false;
  // Doomsday Confluence: "Choose X. You may choose the same mode more than once.": as many modes as the X announced as it's
  // cast (CR 601.2b, 700.2d), any of them again (see AbilityBody.modal.xCount).
  let xModes = false;
  let cipher = false;
  let uncopyableSpell = false;
  // Dance of Many: "the token" in its other abilities is the one token its enters ability creates (linked abilities, CR
  // 607.2): the tokens created with ~, of which there is only that one.
  const oneToken = /^When ~ enters, create a token that's a copy of [^\n]+$/m.test(normalizeSelf(d)) && (normalizeSelf(d).match(/\bcreate\b/g) ?? []).length === 1;
  const all = joinModes(
    roundB191Text(normalizeSelf(d))
      .replace(/^When ~ leaves the battlefield, exile the token\.$/m, (l) => (oneToken ? "When ~ leaves the battlefield, exile all tokens created with ~." : l))
      .replace(/^When the token leaves the battlefield, sacrifice ~\.$/m, (l) => (oneToken ? "Whenever a token created with ~ leaves the battlefield, sacrifice ~." : l))
      // "As ~ enters, choose a creature type. ~ enters with a fellowship counter on it for each ..." (Banner of Kinship):
      // the choice, then the counters, two abilities in one paragraph.
      .replace(/^(As ~ enters, choose a creature type\.) (~ enters with .+)$/m, "$1\n$2")
      // Draconic Destiny: "Enchanted creature gets +1/+1 and has ... "{1}: ~ gets +1/+0 until end of turn." It's a Dragon in
      // addition to its other types.": two static abilities of the Aura, the type not part of the quoted one (rulings).
      .replace(/^((?:Enchanted|Equipped) creature [^\n]+") It's (an? [A-Z][a-z]+ in addition to its other types\.)$/m, (_, a: string, b: string) => `${a}\n${a.startsWith("Enchanted") ? "Enchanted" : "Equipped"} creature is ${b}`)
      // "~ gets +1/+1 for each land you control and each land card in your graveyard" (Multani, Yavimaya's Avatar): the
      // sum, which is two such effects with the same timestamp (CR 613.4c, 613.7).
      .replace(/^(.+? gets? [+-]\d+\/[+-]\d+ for each )([^.]+?) and each ([^.]+?)\.$/m, "$1$2.\n$1$3.")
      // Outlaws' Merriment: "choose one at random. Create a red and white creature token with those characteristics. • 3/1
      // Human Warrior with trample and haste. ...": each mode is creating that token (the mode chosen as the trigger is put
      // on the stack, rulings).
      .replace(/^(At the beginning of your upkeep, choose one at random)\. Create an? ([a-z]+(?: and [a-z]+)?) creature token with those characteristics\.((?:\n• \d+\/\d+ [A-Z][a-z]+(?: [A-Z][a-z]+)* with [^\n]+)+)$/m, (_, head: string, colors: string, modes: string) =>
        `${head} —${modes.replace(/\n• (\d+\/\d+) ([A-Z][a-z]+(?: [A-Z][a-z]+)*) with ([^\n]+)/g, (_m: string, pt: string, types: string, rest: string) => `\n• Create a ${pt} ${colors} ${types} creature token with ${rest}`)}`)
      // Bounding Felidar: "put a +1/+1 counter on each other creature you control. You gain 1 life for each of those
      // creatures": each of them, counters or not (rulings), counted as it resolves.
      .replace(/(put an? [^.]+ counter on each other creature you control\. You gain \d+ life for each) of those creatures\./g, "$1 other creature you control.")
      // Gargantuan Leech: "~ costs {1} less to cast for each Cave you control and each Cave card in your graveyard": the two
      // reductions together (CR 601.2f).
      .replace(/^(~ costs \{\d+\} less to cast for each )([^.]+?) and each ([^.]+?)\.$/m, "$1$2.\n$1$3.")
      // Howl of the Hunt: "When ~ enters, if enchanted creature is a Wolf or Werewolf, untap that creature": the enchanted
      // creature the condition is about.
      .replace(/^(When ~ enters, if enchanted creature is an? [A-Z][a-z]+(?: or [A-Z][a-z]+)?), untap that creature\.$/m, "$1, untap enchanted creature.")
      // Earthbind: "if enchanted creature has flying, ~ deals 2 damage to that creature and ~ gains "Enchanted creature
      // loses flying."": the damage to the enchanted creature, then the Aura gains a static ability for as long as it's this
      // object (CR 400.7), with the timestamp of its gaining it (CR 613.7a), so flying gained later still applies (rulings).
      .replace(/^(When ~ enters, if enchanted creature has flying, ~ deals \d+ damage to) that creature and (~ gains "Enchanted creature loses flying\.")$/m, "$1 enchanted creature. $2")
      // Arcades Sabboth: "Each untapped creature you control gets +0/+2 as long as it's not attacking": each creature you
      // control while it's untapped and not attacking, itself too (rulings), checked continuously (CR 611.3a).
      .replace(/^Each untapped creature you control gets ([+-]\d+\/[+-]\d+) as long as it's not attacking\.$/m, "Each untapped nonattacking creature you control gets $1.")
      // Dark Matter Manipulator: "~ gets +2/+0 for every seven cards in your graveyard": each whole group of seven, as
      // Recursive Recruitment's "for every three" (counted continuously, CR 611.3a).
      .replace(/^(~ gets [+-]\d+\/[+-]\d+) for every (two|three|four|five|six|seven|eight|nine|ten) cards in your graveyard\.$/m, "$1 for each $2 cards in your graveyard.")
      // Assassin's Ink: "~ costs {1} less to cast if you control an artifact and {1} less to cast if you control an
      // enchantment": two reductions, each with its own condition.
      .replace(/^~ costs (\{\d+\} less to cast if you control an? [a-z]+) and (\{\d+\} less to cast if you control an? [a-z]+)\.$/m, "~ costs $1.\n~ costs $2.")
      // "If this spell's additional cost was paid" with "you may waterbend", "you may blight 1" or "you may behold a Dragon"
      // as that cost: whether it was paid, like kicker. "If a Dragon was beheld" is the same: whether a Dragon card was
      // revealed or a Dragon chosen for that cost, whatever happens to it later (CR 701.4b, rulings).
      // Dragon's Fire: "you may reveal a Dragon card from your hand or choose a Dragon you control" is beholding a Dragon
      // (CR 701.4a), and "if you revealed a Dragon card or chose a Dragon as you cast ~" is whether that cost was paid.
      .replace(/^As an additional cost to cast ~, you may reveal an? ([A-Z][a-z]+) card from your hand or choose an? \1 you control\.$/m, (_x, what: string) => `As an additional cost to cast ~, you may behold ${/^[AEIOU]/.test(what) ? "an" : "a"} ${what}.`)
      .replace(/\b([Ii])f you revealed an? ([A-Z][a-z]+) card or chose an? \2 as you cast ~(?=,)/g, (x, i: string, what: string, _i, text: string) => (new RegExp(`^As an additional cost to cast ~, you may behold an? ${what}\\.$`, "m").test(text) ? `${i}f ~ was kicked` : x))
      .replace(/\b([Ii])f ~'s additional cost was paid\b/g, (x, i: string, _i, text: string) => (MAY_COST.test(text) ? `${i}f ~ was kicked` : x))
      // Dragons of Tarkir: "If you revealed a Dragon card or controlled a Dragon as you cast this spell" with "you may reveal a
      // Dragon card from your hand" as an optional additional cost: whether it was paid, like kicker, or you controlled a
      // Dragon as you cast it (CompiledCard.kicker.ifControl, rulings: it doesn't matter what happens to it later).
      .replace(/\bfor each additional ((?:\{[^}]+\})+) you paid\b/g, (x, c: string, _i, text: string) => (text.includes(`As an additional cost to cast ~, you may pay ${c} any number of times.`) ? "for each time ~ was kicked" : x))
      .replace(/^~ enters with an? \+1\/\+1 counter on it if you revealed an? ([A-Z][a-z]+) card or controlled an? \1 as you cast ~\.$/m, (x, what: string, _i, text: string) => (MAY_REVEAL.exec(text)?.[1] === what ? "If ~ was kicked, it enters with a +1/+1 counter on it." : x))
      .replace(/^When ~ enters, if you revealed an? ([A-Z][a-z]+) card or controlled an? \1 as you cast ~, /m, (x, what: string, _i, text: string) => (MAY_REVEAL.exec(text)?.[1] === what ? "When ~ enters, if it was kicked, " : x))
      .replace(/\b([Ii])f you revealed an? ([A-Z][a-z]+) card or controlled an? \2 as you cast ~(?=[,.])/g, (x, i: string, what: string, _i, text: string) => (MAY_REVEAL.exec(text)?.[1] === what ? `${i}f ~ was kicked` : x))
      .replace(/\bIf an? ([A-Z][a-z]+(?: creature)?) was beheld\b/g, (x, what: string, _i, text: string) => (new RegExp(`^As an additional cost to cast ~, you may behold an? ${what}\\.$`, "m").test(text) ? "If ~ was kicked" : x))
      .replace(/\bunless (?:her|his|its|~'s) additional cost was paid\b/g, (x, _i, text: string) => (/^As an additional cost to cast ~, you may waterbend \{\d+\}\.$/m.test(text) ? "unless ~'s waterbend cost was paid" : x))
      // Guan Yu, Sainted Warrior: "When ~ is put into your graveyard from the battlefield, you may shuffle ~ into your
      // library": a card goes to its owner's graveyard (CR 400.3), so "your" library is its owner's.
      .replace(/^(When ~ is put into your graveyard from the battlefield, you may shuffle ~ into) your library\.$/m, "$1 its owner's library.")
      // Soul Tithe: "that player sacrifices it unless they pay {X}, where X is its mana value": "it" is the enchanted permanent.
      .replace(/^(At the beginning of the upkeep of enchanted permanent's controller, that player sacrifices) it unless they pay \{X\}, where X is its mana value\.$/m, "$1 enchanted permanent unless they pay mana equal to its mana value.")
      // Hawkeye, Avenging Archer: "Whenever a creature an opponent controls dies, if ~ dealt damage to it this turn": the
      // same as "a creature an opponent controls dealt damage by ~ this turn" (Sengir Vampire), checked as it dies.
      .replace(/^Whenever (a creature an opponent controls) dies, if ~ dealt damage to it this turn, /m, "Whenever $1 dealt damage by ~ this turn dies, ")
      // Voodoo Doll: "destroy ~ and it deals damage to you equal to the number of pin counters on it": one, then the other, its
      // counters as it last existed if it's gone (CR 608.2h); destroyed whether or not the damage is dealt (rulings).
      .replace(/^(At the beginning of your end step, if ~ is untapped), destroy ~ and it deals damage to you equal to the number of ([a-z]+) counters on it\.$/m, "$1, destroy ~. ~ deals damage to you equal to the number of $2 counters on ~.")
      // Vampiric Embrace: "put a +1/+1 counter on that creature": the enchanted one, as the older wording says ("on the
      // creature it enchants"), not the creature that died.
      .replace(/^(Whenever a creature dealt damage by enchanted creature this turn dies), put a \+1\/\+1 counter on that creature\.$/m, "$1, put a +1/+1 counter on enchanted creature.")
      // Meldweb Strider: "Remove an oil counter from this Vehicle: It becomes an artifact creature until end of turn": "it"
      // is the Vehicle, the only object named.
      .replace(/^(Remove an? [a-z]+ counter from ~): It becomes /m, "$1: ~ becomes ")
      // Caught in the Brights: "When a Vehicle you control attacks, exile enchanted creature": "when" and "whenever" both
      // trigger each time the event happens (CR 603.2).
      .replace(/^When (an? [A-Z][a-z]+ you control) attacks, (exile enchanted creature\.)$/m, "Whenever $1 attacks, $2")
      // Evin, Waterdeep Opportunist: "Whenever one or more players sacrifice one or more creatures, ... This ability
      // triggers only once each turn.": at most once a turn either way, on the first sacrifice of a creature (CR 603.2h).
      .replace(/^Whenever one or more players sacrifice one or more creatures, ([^\n]+ This ability triggers only once each turn\.)$/m, "Whenever a player sacrifices a creature, $1")
      // Staff of the Death Magus: "Whenever you cast a black spell or a Swamp you control enters, you gain 1 life": one
      // ability with two trigger events (CR 603.1), the same as an ability for each. "Whenever you cast a green spell and
      // whenever a Forest you control enters, ..." (Necklace of Girion) too.
      .replace(/^Whenever you cast (an? [a-z]+ spell)(?: or| and whenever) (an? [A-Z][a-z]+ you control) enters, ([^\n]+)$/m, "Whenever you cast $1, $3\nWhenever $2 enters, $3")
      // Marvel Boy, Noh-Varr: "Whenever another creature you control enters and whenever you activate a power-up ability,
      // put a +1/+1 counter on ~": one ability with two trigger events (CR 603.1), the same as an ability for each.
      .replace(/^Whenever (another creature you control) enters and whenever you activate a power-up ability, ([^\n]+)$/m, "Whenever $1 enters, $2\nWhenever you activate a power-up ability, $2")
      // Astral Drift: "Whenever you cycle ~ or cycle another card while ~ is on the battlefield": one ability with two
      // trigger events, the card's own cycling from the hand (CR 702.29c-d) and another card cycled while it's on the
      // battlefield; one cycle can't be both, so two abilities with the same effect act the same.
      .replace(/^Whenever you cycle ~ or cycle another card while ~ is on the battlefield, ([^\n]+)$/m, "When you cycle ~, $1\nWhenever you cycle another card, $1")
      // Orcish Mine: "At the beginning of your upkeep and whenever enchanted land becomes tapped, remove an ore counter from
      // ~": the same, an ability for each event (CR 603.1).
      .replace(/^At the beginning of your upkeep and whenever enchanted land becomes tapped, ([^\n]+)$/m, "At the beginning of your upkeep, $1\nWhenever enchanted land becomes tapped, $1")
      // Its "destroy enchanted land and ~ deals 2 damage to that land's controller": two instructions, the player the land's
      // controller as it last existed (CR 608.2h, see "hostController").
      .replace(/^(When the last ore counter is removed from ~), destroy enchanted land and ~ deals 2 damage to that land's controller\.$/m, "$1, destroy enchanted land. ~ deals 2 damage to enchanted land's controller.")
      // Flesh Reaver: "Whenever ~ deals damage to a creature or opponent, ~ deals that much damage to you": once for each
      // creature and each opponent dealt damage, so the same as one ability for each (combat damage or not, rulings).
      .replace(/^Whenever ~ deals damage to a creature or opponent, ([^\n]+)$/m, "Whenever ~ deals damage to a creature, $1\nWhenever ~ deals damage to an opponent, $1")
      // Transcendence: "Whenever you lose life, you gain 2 life for each 1 life you lost": twice that much, once for each
      // life-loss event.
      .replace(/^Whenever you lose life, you gain 2 life for each 1 life you lost\.$/m, "Whenever you lose life, you gain twice that much life.")
      // Centaur Omenreader: "As long as ~ is tapped, creature spells you cast cost {2} less to cast": the condition worded
      // first, as Gran-Gran's after (one cost change while it's true as the cost is determined, CR 601.2f, 611.3a).
      .replace(/^As long as (~ is tapped), (creature spells you cast cost \{\d+\} less to cast)\.$/m, (_, c: string, mod: string) => `${capital(mod)} as long as ${c}.`)
      // Tithe Taker: "During your turn, spells your opponents cast cost {1} more to cast and abilities your opponents
      // activate cost {1} more to activate unless they're mana abilities": two cost increases (CR 601.2f, 602.2b).
      .replace(/^During your turn, spells your opponents cast cost (\{\d+\}) more to cast and abilities your opponents activate cost \1 more to activate unless they're mana abilities\.$/m, "During your turn, spells your opponents cast cost $1 more to cast.\nDuring your turn, abilities your opponents activate cost $1 more to activate unless they're mana abilities.")
      // Intercessor's Arrest: "Enchanted permanent can't attack, block, or crew Vehicles. Its activated abilities can't be
      // activated unless they're mana abilities.": the same as Bound in Gold's one sentence.
      .replace(/^(Enchanted (?:creature|permanent) can't attack, block, or crew Vehicles)\. Its activated abilities can't be activated unless they're mana abilities\.$/m, "$1, and its activated abilities can't be activated unless they're mana abilities.")
      // Kothophed, Soul Hoarder: "a permanent owned by another player": every other player is an opponent (CR 102.3).
      .replace(/^Whenever a permanent owned by another player is put into a graveyard from the battlefield, /m, "Whenever a permanent an opponent owns is put into a graveyard from the battlefield, ")
      // Death Tyrant: "Whenever an attacking creature you control or a blocking creature an opponent controls dies, ...":
      // two trigger events (CR 603.1) no one creature can meet both of, the same as an ability for each.
      .replace(/^((?:[A-Z][^\n—]* — )?)Whenever (an attacking creature you control) or (a blocking creature an opponent controls) dies, ([^\n]+)$/m, "$1Whenever $2 dies, $4\n$1Whenever $3 dies, $4")
      // Questing Druid: "Whenever you cast a spell that's white, blue, black, or red": a spell that's any of those colors,
      // as "a white, blue, black, or red spell" says (CR 105.2).
      .replace(/^Whenever you cast a spell that's ((?:(?:white|blue|black|red|green), )*(?:white|blue|black|red|green),? or (?:white|blue|black|red|green)), /m, "Whenever you cast a $1 spell, ")
      // Tek, Tribal Golem: "~ gets +0/+2 as long as you control a Plains, has flying as long as you control an Island, ...
      // and has trample as long as you control a Forest": a static ability for each clause, each with its own condition,
      // the verb carried over where a clause leaves it out ("haste as long as you control a Goblin").
      .replace(/^~ (?:has|gets) [^\n]+? as long as you control an? [A-Z][a-z]+(?:, (?:and )?[^\n]+? as long as you control an? [A-Z][a-z]+){2,}\.$/m, (line) => {
        let verb = "";
        return line
          .slice(2, -1)
          .split(/, (?:and )?/)
          .map((part) => {
            const v = /^(has|gets) /.exec(part);
            if (v) verb = v[1]!;
            return `~ ${v ? part : `${verb} ${part}`}.`;
          })
          .join("\n");
      })
      // Ultron the Annihilator: "Whenever another artifact is put into your graveyard from the battlefield or an artifact
      // card is put into your graveyard from anywhere other than the battlefield, ...": two events that never overlap, one
      // trigger for each.
      .replace(/^Whenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere other than the battlefield, ([^\n]+)$/m, "Whenever another artifact is put into your graveyard from the battlefield, $1\nWhenever an artifact card is put into your graveyard from anywhere other than the battlefield, $1")
      // River Song's Diary: "if there are four or more cards exiled with ~, choose one of them at random": one of the cards
      // exiled with it.
      .replace(/^(At the beginning of your upkeep, if there are (?:two|three|four|five) or more cards exiled with ~, )choose one of them at random\. You may cast it without paying its mana cost\.$/m, "$1choose a card exiled with ~ at random. You may cast it without paying its mana cost.")
      // Call Damage Control: "Choose up to two. Return those cards from your graveyard to your hand." then "• Target
      // artifact card." and so on: each mode returns its one target.
      .replace(/^Choose up to two\. Return those cards from your graveyard to your hand\.((?:\n• Target [a-z]+ card\.)+)$/m, (_, b: string) => `Choose up to two —${b.replace(/• Target ([a-z]+) card\./g, "• Return target $1 card from your graveyard to your hand.")}`)
      // Canker Abomination: "As ~ enters, choose an opponent. ~ enters with a -1/-1 counter on it for each creature that
      // player controls.": the chosen player, counted once chosen (EntersWithCounters.afterPlayer).
      // Booby Trap: "As ~ enters, choose an opponent and a card name other than a basic land card name.": two choices as it
      // enters (CR 614.12), each its own.
      .replace(/^As ~ enters, choose an opponent and (a card name other than a basic land card name)\.$/m, "As ~ enters, choose an opponent.\nAs ~ enters, choose $1.")
      // Call to Arms (round B211): "As ~ enters, choose a color and an opponent.": two choices as it enters (CR 614.12).
      .replace(/^As ~ enters, choose a color and an opponent\.$/m, "As ~ enters, choose a color.\nAs ~ enters, choose an opponent.")
      .replace(/^As ~ enters, choose an opponent\. (~ enters with an? [-+\/\d]+ counter on it for each creature) that player controls\.$/m, "As ~ enters, choose an opponent.\n$1 the chosen player controls.")
      // Shackles of Treachery's granted "Whenever ~ deals damage, destroy target Equipment attached to it.": "it" is the
      // creature, the trigger's source (rulings: any damage, any Equipment's controller).
      .replace(/^Whenever ~ deals damage, destroy target Equipment attached to it\.$/m, "Whenever ~ deals damage, destroy target Equipment attached to ~.")
      // Sludge Strider: "Whenever another artifact you control enters or leaves the battlefield, ...": two trigger events
      // (CR 603.1), an ability for each.
      .replace(/^Whenever another artifact you control enters or leaves the battlefield, ([^\n]+)$/m, "Whenever another artifact you control enters, $1\nWhenever another artifact you control leaves the battlefield, $1")
      // Skeletal Swarming: "Each Skeleton you control has trample, attacks each combat if able, and gets +X/+0, where X is
      // the number of other Skeletons you control.": the same group three ways, X counted for each Skeleton apart.
      .replace(/^Each Skeleton you control has trample, attacks each combat if able, and gets \+X\/\+0, where X is the number of other Skeletons you control\.$/m, "Each Skeleton you control has trample.\nEach Skeleton you control attacks each combat if able.\nEach Skeleton you control gets +1/+0 for each other Skeleton you control.")
      // Soul Exchange: "Put a +2/+2 counter on that creature if the exiled creature was a Thrull.", after an "exile a
      // creature you control" additional cost: the creature that cost exiled, as it last existed (CR 608.2h, kept with
      // what a cost sacrificed), the condition first; "that creature" is the one returned.
      .replace(/^([^\n]+?)\. Put (an? [-+\/\d]+ counter) on that creature if the exiled creature was an? ([A-Z][a-z]+)\.$/m, (x, before: string, counter: string, type: string) => (/^As an additional cost to cast this spell, exile a creature you control\.$/m.test(d.oracleText ?? "") ? `${before}. If the sacrificed creature was a ${type}, put ${counter} on it.` : x))
      // Bartered Cow: "When ~ dies and when you discard ~, ...": two trigger events (CR 603.1), an ability for each.
      .replace(/^When ~ dies and when you discard ~, ([^\n]+)$/m, "When ~ dies, $1\nWhen you discard ~, $1")
      // Woolly Razorback: "As long as ~ has an ice counter on it, prevent all combat damage it would deal and it has
      // defender.": two statics with the one condition (combat damage dealt to it isn't prevented, rulings).
      .replace(/^(As long as ~ has an? [a-z]+ counter on it), prevent all combat damage it would deal and it has ([a-z]+)\.$/m, "$1, prevent all combat damage that would be dealt by ~.\n$1, it has $2.")
      // The Genjus: "Enchant Forest" ... "Enchanted Forest becomes ...": the land it's attached to, which is a Forest while
      // it's legally attached (CR 303.4d); "enchanted land" says the same.
      .replace(/\b([Ee])nchanted (Forest|Island|Swamp|Mountain|Plains)(?= becomes | is put into a graveyard| is an? )/g, (x, e: string, t: string, _i, text: string) => (new RegExp(`^Enchant ${t}$`, "m").test(text) ? `${e}nchanted land` : x))
      .split("\n")
      .map((l) => {
        // Moment of Reckoning: "Choose up to four. You may choose the same mode more than once.": none to four of them.
        const same = /^Choose (one|two|three|four|five|up to four)\. You may choose the same mode more than once\.$/.exec(l.trim());
        if (same && isSpell) {
          repeat = true;
          return `Choose ${same[1]} —`;
        }
        if (isSpell && /^Choose X\. You may choose the same mode more than once\.$/.test(l.trim()) && /\{X\}/.test(d.manaCost)) {
          repeat = true;
          xModes = true;
          return "Choose X —";
        }
        if (/^Choose one\. If ~ was kicked, choose any number instead\.$/.test(l.trim())) {
          both = "kicked";
          return "Choose one —";
        }
        // Pyrrhic Strike: "Choose one. If this spell's additional cost was paid, choose both instead.": exactly both then.
        if (/^Choose one\. If ~ was kicked, choose both instead\.$/.test(l.trim())) {
          both = "kicked";
          kickedBoth = true;
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
        // Let's Play a Game: "Delirium — Choose one. If there are four or more card types among cards in your graveyard,
        // choose one or more instead.": checked as the modes are chosen while it's cast (CR 601.2b), one to all of them.
        // Wail of the Forgotten: "Descend 8 — Choose one. If there are eight or more permanent cards in your graveyard as you
        // cast ~, choose one or more instead." the same (descend N is an ability word, rulings).
        const anyIf = isSpell ? /^(?:Delirium — |Descend 8 — )?Choose one\. If (there are four or more card types among cards in your graveyard|there are eight or more permanent cards in your graveyard)(?: as you cast ~)?, choose one or more instead\.$/.exec(l.trim()) : null;
        if (anyIf) {
          both = "control";
          bothIf = `?${anyIf[1]}`;
          bothAny = true;
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
  let entwine: { cost: string; raw: string; costs?: AdditionalCost[]; text?: string } | undefined;
  // Escalate (CR 702.120a): "For each mode you choose beyond the first as you cast this spell, you pay an additional
  // [cost]": mana, or one cost beyond mana ("Escalate—Discard a card.").
  let escalate: { mana?: string; cost?: AdditionalCost; text: string; raw: string } | "fail" | undefined;
  // Pawprints (CR 700.2i): "Choose up to five {P} worth of modes. You may choose the same mode more than once." and a
  // "{P}{P} — [effect]" line for each mode.
  let paws: { budget: number; costs: number[]; texts: string[]; lines: string[] } | undefined;
  // Devouring Rage: what its additional cost sacrifices any number of, the number sacrificed its X.
  let costSacrificedX: string | undefined;
  // Burn at the Stake: its additional cost taps any number of creatures, the number tapped its X.
  let costTappedX = false;
  for (const [li, raw] of lines.entries()) {
    // Converge (CR 207.2c) is an ability word: it has no rules meaning of its own; neither have flavor words, like "Gae
    // Bolg — Equip {4}" (CR 207.2d).
    let line = raw.trim().replace(/^Converge — /, "").replace(/^[A-Z][^—•"]* — (?=Equip\b)/, "");
    // An instant's or sorcery's ability word ("Spell mastery — If ...", CR 207.2c): no rules meaning either.
    if (isSpell) line = line.replace(SPELL_ABILITY_WORD, "");
    // Zimone, All-Questioning: "if ... you control a prime number of lands, create Primo, ..., then put that many +1/+1
    // counters on it": that many is the number of lands, counted as it resolves.
    line = line.replace(/^(At the beginning of your end step, if [^,]+ and you control a prime number of lands, create [^.]+ token, then put) that many (\+1\/\+1 counters on it)\.$/, "$1 X $2, where X is the number of lands you control.");
    // Rip, Spawn Hunter: "At the beginning of your second main phase, if ~ is tapped, reveal the top X cards of your library,
    // where X is its power": no other object for "its" to be, so ~'s power (as it last existed if it has left, rulings).
    line = line.replace(/^((?:Survival — )?At the beginning of your second main phase, if ~ is tapped, reveal the top X cards of your library, where X is) its power\./, "$1 ~'s power.");
    // Ascendant Acolyte: "~ enters with a +1/+1 counter on it for each +1/+1 counter among other creatures you control":
    // counted as it enters, when it isn't on the battlefield yet (CR 614.1c), so the same as "among creatures you control".
    line = line.replace(/^(~ enters with a \+1\/\+1 counter on it for each \+1\/\+1 counter among) other (creatures you control\.)$/, "$1 $2");
    // Magnanimous Magistrate: "Whenever another nontoken creature you control dies, if its mana value was 1 or greater, you
    // may remove that many reprieve counters from ~. If you do, return that card ...": the intervening if (CR 603.4) on the
    // creature as it last existed, which it still is as the ability resolves (CR 603.10a), is the trigger's filter; "that
    // many" is that mana value.
    line = line.replace(/^Whenever another nontoken creature you control dies, if its mana value was (\d+) or greater, you may remove that many ([a-z]+) counters from ~\. (If you do, return that card to the battlefield under its owner's control\.)$/, "Whenever another nontoken creature you control with mana value $1 or greater dies, you may remove a number of $2 counters equal to its mana value from ~. $3");
    // An ability word (CR 207.2c) or a flavor word (Khârn's "Berzerker — ", CR 207.2d) before a static or replacement
    // ability: no rules meaning. Not a keyword written with a dash ("Boast — ", CR 702), a chapter number ("II — ", CR
    // 714.2b) or a modal choice.
    // "10,000 Needles — " (Jumbo Cactuar) starts with a number.
    // "ED-E My Love — " (ED-E, Lonesome Eyebot) has the card's name in it, so it reads "~ My Love — ".
    const word = !isSpell ? /^([A-Z][^—•":{}]*?|\d[\d,]* [A-Z][^—•":{}]*?|~ [A-Z][^—•":{}]*?) — (?![{+•])/.exec(line) : null;
    // "... faces a villainous choice — " (CR 701.55a) is the instruction itself.
    if (word && !KEYWORD_WORDS.has(word[1]!.toLowerCase()) && !/^[IVX]+(?:, [IVX]+)*$/.test(word[1]!) && !/^(?:Choose\b|To solve$)/.test(word[1]!) && !/\bfaces? a villainous choice$/.test(word[1]!)) line = line.slice(word[0].length);
    // "Vivid — {T}: For each color among permanents you control, add ..." (Bloom Tender): an ability word too.
    else if (!isSpell && /^Vivid — \{/.test(line)) line = line.replace(/^Vivid — /, "");
    if (!line) continue;
    // Planechase replacements (Ichor Elixir: "If you would roll one or more planar dice, instead ..."; Susan Foreman: "If
    // you would planeswalk, instead ..."): a player may planeswalk, and a planar die is rolled, only in a Planechase game
    // (CR 701.31a, 901.9; Start the TARDIS's rulings: "If you are instructed to planeswalk in any other game, nothing
    // happens"), so outside one these never apply.
    if (/^If you would (?:roll one or more planar dice|planeswalk), instead [^"]*\.$/.test(line)) continue;
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
    // Imminent Doom: "Whenever you cast a spell with mana value equal to the number of doom counters on ~, ~ deals that much
    // damage to any target": the number of counters as it triggered (rulings), which is that spell's mana value.
    line = line.replace(/^(Whenever you cast a spell with mana value equal to the number of [a-z]+ counters on ~, ~ deals) that much damage (to any target\.)/, "$1 damage equal to that spell's mana value $2");
    // Malignant Growth: "that player draws an additional card for each growth counter on ~, then ~ deals damage to the player
    // equal to the number of cards they drew this way": the draw, then damage for the cards that draw really drew.
    line = line.replace(/^(At the beginning of each opponent's draw step, that player draws an additional card for each [a-z]+ counter on ~), then ~ deals damage to the player equal to the number of cards they drew this way\.$/, "$1. ~ deals damage to that player equal to the number of cards drawn this way.");
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
    // Skill Borrower: "As long as the top card of your library is an artifact or creature card, ~ has all activated
    // abilities of that card": the printed ones of that card, "~" in them being this creature (rulings), as Conspicuous
    // Snoop.
    if (line === "As long as the top card of your library is an artifact or creature card, ~ has all activated abilities of that card." && !out.borrows) {
      out.borrows = { filter: { kind: "object", types: ["Artifact", "Creature"], notTypes: [], notColors: [], text: "artifact or creature card" }, top: true };
      continue;
    }
    // Myr Welder: "~ has all activated abilities of all cards exiled with it"; Dark Impostor, Patchwork Crawler: "all
    // creature cards exiled with it", linked to its one exile ability below (CR 607.2a).
    const borrowLinked = borrow && !borrow[2] && !borrow[3] ? /^all (?:(creature|artifact) )?cards exiled with (?:it|~)$/.exec(borrow[1]!) : null;
    if (borrowLinked && !out.borrows) {
      const kind = borrowLinked[1] ? capital(borrowLinked[1]) : undefined;
      out.borrows = { filter: { kind: "card", ...(kind ? { types: [kind], notTypes: [], notColors: [] } : {}), text: `${borrowLinked[1] ? `${borrowLinked[1]} ` : ""}cards exiled with ~` }, linked: true };
      continue;
    }
    // Rex, Cyber-Hound: "all cards in exile with brain counters on them" (round 350).
    if (borrow && !out.borrows && !borrow[2] && !borrow[3] && borrow[1] === "all cards in exile with brain counters on them") {
      out.borrows = { filter: { kind: "card", types: [], notTypes: [], notColors: [], text: "cards" }, exiledWithCounter: "brain" };
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
    // "Entwine—Sacrifice three lands." (Betrayal of Flesh, Solar Tide): a cost that isn't mana (CR 702.42a, 601.2b).
    const entOther = isSpell && !entwine && /^Entwine—(.+?)\.?$/.exec(line);
    if (entOther) {
      const costs = entOther[1]!.split(", ").map((part) => parseAdditionalCost(part));
      if (costs.every((c) => c)) {
        entwine = { cost: "", raw, costs: costs as AdditionalCost[], text: entOther[1]!.replace(/^./, (c) => c.toLowerCase()) };
        continue;
      }
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
        // The Princess Takes Flight: "III — Return the exiled card to the battlefield under its owner's control": the card
        // its chapter I exiled (CR 607.2a; linkExile).
        // The Aesir Escape Valhalla's linked chapters (round 345).
        // The Three Seasons (round B206).
        const rB206 = roundB206Chapter(chapter[2]!);
        const r345 = rB206 !== undefined ? rB206 : round345Chapter(chapter[2]!, (x) => parseBody(x, {}));
        const body = r345 === "fail" ? null : r345 ? r345 : /^Return the exiled card to the battlefield under its owner's control\.$/.test(chapter[2]!)
          ? { targets: [], effects: [{ type: "returnLinked" as const, dest: "battlefield" as const, here: true as const }], text: chapter[2]! }
          : parseBody(chapter[2]!.replace(/^(?!Choose\b)[A-Z][^—•:"]{0,30}? — (?=\S)/, ""), {});
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
    // Lightwheel Enhancements: "Max speed — You may cast this card from your graveyard.": a permission that works in the
    // graveyard while its owner has max speed (rulings: the max speed ability works in the zone the granted one does).
    if (maxSpeed && /^You may cast (?:~|this card) from your graveyard\.$/.test(maxSpeed[1]!)) {
      const yard = parseGraveyardKeyword("You may cast this card from your graveyard as long as you have max speed.", d);
      if (yard && yard !== "fail" && "fromGraveyard" in yard && !("fromExile" in yard) && yard.fromGraveyard?.if?.kind === "maxSpeed") (out.fromGraveyard ??= []).push(yard.fromGraveyard);
      else out.unsupported.push(raw);
      continue;
    }
    if (maxSpeed) {
      if (!conditionalAbility(d, maxSpeed[1]!, out, { kind: "maxSpeed" })) out.unsupported.push(raw);
      continue;
    }
    // Firemane Angel: "At the beginning of your upkeep, if ~ is in your graveyard or on the battlefield, you may gain 1 life":
    // an ability that works in both zones, one of each, each checking it's still the same object there as it resolves
    // (CR 603.4; moved between them before then, nothing happens, rulings).
    const yardOrField = /^(At the beginning of your upkeep), if ~ is in your graveyard or on the battlefield, (.+)$/.exec(line);
    if (yardOrField && !/~|\bit\b/.test(yardOrField[2]!)) {
      const t = parseTrigger(`${yardOrField[1]}, ${yardOrField[2]}`);
      if (!t || t === "fail" || t.zone || t.ifCond || t.host) out.unsupported.push(raw);
      else out.triggers.push({ ...t, ifCond: { kind: "selfStill", zone: "battlefield" } }, { ...t, zone: "graveyard", ifCond: { kind: "selfStill", zone: "graveyard" } });
      continue;
    }
    // Quakebringer: "At the beginning of your upkeep, ~ deals 2 damage to each opponent. This ability triggers only if ~ is
    // on the battlefield or if ~ is in your graveyard and you control a Giant." One ability that works in both zones (CR
    // 113.6b); the condition is only for it to trigger (CR 603.2, not an intervening if, so not checked again as it
    // resolves; rulings: on the battlefield it triggers with no Giant).
    const onlyIfYard = /^(At the beginning of your upkeep, .+?) This ability triggers only if ~ is on the battlefield or if ~ is in your graveyard and (you control an? [A-Z][a-z]+)\.$/.exec(line);
    if (onlyIfYard) {
      const t = parseTrigger(onlyIfYard[1]!);
      const cond = parseStaticCondition(onlyIfYard[2]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!t || t === "fail" || t.zone || t.ifCond || t.host || t.activeIf || t.event !== "yourUpkeep" || !cond) out.unsupported.push(raw);
      else out.triggers.push(t, { ...t, zone: "graveyard", activeIf: cond });
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
    // Kaya, Ghost Assassin's 0 (round B206).
    if (d.types.includes("Planeswalker") && roundB206Line(line, raw, out, isSpell)) continue;
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
      // "Named ~" in what it counts (Powerstone Shard): this card's name (CR 201.5).
      if (manaAb.produces.kind === "fixed" && manaAb.produces.count?.named === "~") manaAb.produces = { ...manaAb.produces, count: { ...manaAb.produces.count, named: d.name, text: manaAb.produces.count.text.replace(/~/g, d.name) } };
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
    // Haakon, Stromgald Scourge: "You may cast ~ from your graveyard, but not from anywhere else": a permission to cast it
    // from there, paying its costs at its normal timing, and no other zone, whatever else lets you (rulings; castProblem).
    if (line === "You may cast ~ from your graveyard, but not from anywhere else.") {
      (out.fromGraveyard ??= []).push({ kind: "permission", costs: [], exile: false });
      out.castOnlyFromGraveyard = true;
      continue;
    }
    // Haakon: "As long as ~ is on the battlefield, you may cast Knight spells from your graveyard": a static ability works
    // only on the battlefield anyway (CR 113.6), so the same as the line without it.
    if (/^As long as ~ is on the battlefield, you may cast [A-Z][a-z]+ spells from your graveyard\.$/.test(line)) line = line.replace(/^As long as ~ is on the battlefield, you/, "You");
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
    // "Splice onto Arcane—Sacrifice two Mountains." (Torrent of Stone), "—An opponent gains 5 life." (Roar of Jukai): a
    // splice cost that isn't mana, paid as an additional cost (CR 702.47a, 601.2b, 601.2f-h).
    const spliceOther = /^Splice onto (Arcane|instant or sorcery)—(.+?)\.?$/.exec(line);
    if (spliceOther && isSpell && !out.splice) {
      const costs = spliceOther[2]!.split(", ").map((part) => (/^An opponent gains (\d+) life$/.exec(part) ? ({ kind: "giveLife", n: Number(/(\d+)/.exec(part)![1]) } as AdditionalCost) : parseAdditionalCost(part)));
      if (costs.every((c) => c)) {
        out.splice = { onto: spliceOther[1] === "Arcane" ? "Arcane" : "instantOrSorcery", mana: "", costs: costs as AdditionalCost[], text: spliceOther[2]!.replace(/^./, (c) => c.toLowerCase()) };
        continue;
      }
    }
    if (/^Splice onto\b/.test(line)) {
      out.unsupported.push(raw);
      continue;
    }
    // Hogaak, Arisen Necropolis: "Convoke, delve" (CR 702.51a, 702.66a); "You can't spend mana to cast this spell", so
    // convoke and delve pay its whole total cost (rulings).
    if (line === "Convoke, delve") {
      out.convoke = true;
      out.delve = true;
      continue;
    }
    if (line === "You can't spend mana to cast ~.") {
      out.noManaSpend = true;
      continue;
    }
    const costKw = parseCostKeyword(line, d);
    if (costKw !== null) {
      if (costKw === "fail") out.unsupported.push(raw);
      else {
        if (costKw.delve) out.delve = true;
        if (costKw.assist) out.assist = true;
        // Two of the same: each would work separately (CR 702.153b), which isn't modeled.
        const twice = (costKw.madness && out.madness) || (costKw.miracle && out.miracle) || (costKw.suspend && out.suspend) || (costKw.casualty !== undefined && out.casualty !== undefined) || (costKw.dredge && out.dredge) || (costKw.plot && out.plot) || (costKw.foretell && out.foretell) || (costKw.alt && out.altCosts?.some((a) => a.kind === costKw.alt!.kind));
        if (twice) {
          out.unsupported.push(raw);
          continue;
        }
        if (costKw.alt) (out.altCosts ??= []).push(costKw.alt);
        if (costKw.madness) out.madness = costKw.madness;
        if (costKw.madnessLife) out.madnessLife = costKw.madnessLife;
        if (costKw.miracle) out.miracle = costKw.miracle;
        if (costKw.plot) out.plot = costKw.plot;
        if (costKw.foretell) out.foretell = costKw.foretell;
        if (costKw.suspend) out.suspend = costKw.suspend;
        if (costKw.casualty !== undefined) out.casualty = costKw.casualty;
        if (costKw.casualtyX) out.casualtyX = true;
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
    // Nevinyrral, Urborg Tyrant: "Hexproof from artifacts, creatures, and enchantments": three (CR 702.11d, 702.11f).
    const kwLine = line.replace(/^(Hexproof) from (artifacts|creatures|enchantments|instants|planeswalkers|sorceries), (artifacts|creatures|enchantments|instants|planeswalkers|sorceries),? and (artifacts|creatures|enchantments|instants|planeswalkers|sorceries)$/, "$1 from $2, hexproof from $3, hexproof from $4").replace(/(protection) from (\w+), from (\w+),? and from (\w+)/gi, "$1 from $2, $1 from $3, $1 from $4").replace(/(protection|hexproof) from (\w+) and from (\w+|permanents that were cast this turn)/gi, "$1 from $2, $1 from $3");
    if (isKeywordLine(kwLine)) {
      out.textKeywords.push(...textKeywords(kwLine));
      continue;
    }
    // Zareth San, the Trickster: "{2}{U}{B}, Return an unblocked attacking Rogue you control to its owner's hand: Put ~ from
    // your hand onto the battlefield tapped and attacking." Ninjutsu's shape (CR 702.49a) without being ninjutsu: it attacks
    // what you choose (CR 508.4), never declared as an attacker (rulings); revealing it is part of activating it from hand.
    const zareth = /^((?:\{(?:\d+|[WUBRGC])\})+), Return an unblocked attacking ([A-Z][a-z]+) you control to its owner's hand: Put ~ from your hand onto the battlefield tapped and attacking\.$/.exec(line);
    if (zareth && CREATURE_TYPES.has(zareth[2]!) && d.types.includes("Creature")) {
      out.activated.push({
        manaCost: zareth[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        costs: [{ kind: "returnToHand", filter: { kind: "object", types: ["Creature"], subtypes: [zareth[2]!], controller: "you", text: `unblocked attacking ${zareth[2]} you control` }, n: 1, unblockedAttacker: true }],
        body: { targets: [], effects: [{ type: "ninjutsu", chooseDefender: true }], text: "Put ~ from your hand onto the battlefield tapped and attacking." },
        text: line,
      });
      continue;
    }
    // Luxurious Locomotive: "Crew 1. Activate only once each turn." (CR 702.122a, 602.5b): its crew ability, at most once
    // each turn.
    const crewOnce = /^(Crew \d+)\. Activate only once each turn\.$/.exec(line);
    if (crewOnce && d.subtypes.includes("Vehicle")) {
      const ck = keywordAbilities(crewOnce[1]!, d);
      if (ck?.activated.length !== 1 || ck.triggers.length) {
        out.unsupported.push(raw);
        continue;
      }
      out.activated.push({ ...ck.activated[0]!, oncePerTurn: true, text: line });
      out.textKeywords.push(...textKeywords(crewOnce[1]!));
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
      if (kw.bloodthirstX) out.bloodthirstX = true;
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
    // Ashling's Prerogative: "Each creature without mana value of the chosen quality enters tapped": the quality chosen as
    // it entered; each one's mana value as it would exist on the battlefield, X being 0 (CR 614.12, rulings).
    if (line === "Each creature without mana value of the chosen quality enters tapped." && out.entersChoose?.some((c) => c.what === "parity")) {
      (out.othersEnterTapped ??= []).push({ filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], chosen: "parity", parity: { of: "manaValue", not: true }, text: "creature without mana value of the chosen quality" }, text: line });
      continue;
    }
    // Uphill Battle: "Creatures played by your opponents enter tapped": creature spells they cast (a creature card is
    // "played" by casting it, CR 601), not copies of spells or creatures put onto the battlefield. A spell enters under
    // its controller's control (CR 608.3a), so the caster is the one who controls it as it enters.
    if (line === "Creatures played by your opponents enter tapped.") {
      const g = parseGroup("creatures your opponents control", true);
      if (g && !g.other) {
        (out.othersEnterTapped ??= []).push({ filter: g.filter, text: line, cast: true });
        continue;
      }
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
      // Radiant Restraints: "Creatures enchanted player controls enter tapped" (an Aura with enchant player, CR 702.5d):
      // the player it's attached to as each one enters.
      const enchanted = / enchanted player controls$/.test(words) ? parseGroup(words.replace(/ enchanted player controls$/, " you control"), true) : null;
      if (enchanted && !enchanted.other && enchanted.filter.controller === "you" && /^Enchant (?:player|opponent)$/m.test(d.oracleText ?? "")) {
        (out.othersEnterTapped ??= []).push({ filter: { ...enchanted.filter, controller: "enchanted" }, text: line });
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
    // Blue, Loyal Raptor: "For each kind of counter on ~, each other Dinosaur you control enters with a counter of that kind
    // on it." The same replacement (CR 614.1c), with the kinds of counters on it as each would enter; not Dinosaurs entering
    // with it (rulings).
    const eachKind = /^For each kind of counter on ~, each other ([A-Z][a-z]+) you control enters with a counter of that kind on it\.$/.exec(line);
    if (eachKind) {
      const g = CREATURE_TYPES.has(eachKind[1]!) ? parseGroup(`each ${eachKind[1]} you control`) : null;
      if (!g || g.filter.kind !== "object" || g.filter.controller !== "you") out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: "+1/+1", n: 1, eachKindOnSource: true, text: line });
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
    // Thunderous Velocipede: "Each other Vehicle and creature you control enters with an additional +1/+1 counter on it if
    // its mana value is 4 or less. Otherwise, it enters with three additional +1/+1 counters on it.": each Vehicle and each
    // creature, by its mana value as it would exist on the battlefield (CR 614.12, X being 0).
    if (line === "Each other Vehicle and creature you control enters with an additional +1/+1 counter on it if its mana value is 4 or less. Otherwise, it enters with three additional +1/+1 counters on it.") {
      const base = { kind: "object" as const, types: [], notTypes: [], notColors: [], controller: "you" as const, anyOf: [{ kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, { kind: "object" as const, types: [], notTypes: [], notColors: [], subtypes: ["Vehicle"], text: "Vehicle" }] };
      (out.othersEnterWithCounters ??= []).push({ filter: { ...base, manaValue: { max: 4 }, text: "Vehicle or creature you control with mana value 4 or less" }, counter: "+1/+1", n: 1, text: line }, { filter: { ...base, manaValue: { min: 5 }, text: "Vehicle or creature you control with mana value 5 or greater" }, counter: "+1/+1", n: 3, text: line });
      continue;
    }
    // Twins of Discord: "Each other colorless creature you control has bloodthirst 2": as each one would enter, it has
    // bloodthirst (CR 614.12), so it enters with two more +1/+1 counters if an opponent was dealt damage this turn (CR
    // 702.54a); instances add up (rulings).
    const grantedBloodthirst = /^Each other (.+? you control) has bloodthirst (\d+)\.$/.exec(line);
    if (grantedBloodthirst) {
      const g = parseGroup(`each ${grantedBloodthirst[1]}`);
      const cond = parseStaticCondition("an opponent was dealt damage this turn", { affects: { kind: "self" }, mods: [], text: line });
      if (!g || g.other || g.filter.kind !== "object" || g.filter.controller !== "you" || g.filter.chosen || !cond) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: "+1/+1", n: Number(grantedBloodthirst[2]), while: cond, text: line });
      continue;
    }
    // Vampire Socialite: "As long as an opponent lost life this turn, each other Vampire you control enters with an
    // additional +1/+1 counter on it": only while that's so, as each one would enter.
    // Dearly Departed: "As long as ~ is in your graveyard, each Human creature you control enters with an additional +1/+1
    // counter on it": the same replacement, from its owner's graveyard (CR 113.6b); there it can't describe itself.
    const departed = new RegExp(`^As long as ~ is in your graveyard, each ([A-Z][a-z]+) creature you control enters with an additional ${COUNTER} counter on it\\.$`).exec(line);
    if (departed) {
      const g = CREATURE_TYPES.has(departed[1]!) ? parseGroup(`each ${departed[1]} creature you control`) : null;
      if (!g || g.other || g.filter.kind !== "object" || g.filter.controller !== "you") out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(departed[2]!), n: 1, fromGraveyard: true, text: line });
      continue;
    }
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
      // Mysterious Pathlighter: "Each creature you control that has an Adventure": an adventurer card (CR 715.2), whether
      // or not it went on an adventure first (rulings); this card has none, so it can't be one of them.
      const adventurer = othersExtra[2] === "creature you control that has an Adventure";
      const g0 = parseGroup(`each ${that ? `${that[1]} or ${that[2]} creature you control` : adventurer ? "creature you control" : othersExtra[2]}`);
      const g = g0 && adventurer && g0.filter.kind === "object" ? { ...g0, filter: { ...g0.filter, hasAdventure: true as const, text: "creature you control that has an Adventure" } } : g0;
      const types = g?.filter.types ?? [];
      const couldBeSelf = !othersExtra[1] && (!adventurer || d.layout === "adventure") && d.types.some((ty) => types.includes(ty) || (!types.length && ty === "Creature"));
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
    // "~ enters with your choice of a reach counter or a vigilance counter on it" (Flycatcher Giraffid), "~ escapes with your
    // choice of a +1/+1 counter or a flying counter on it" (Tizerus Charger): chosen as it enters, not as it was cast (CR
    // 614.1c, 614.12; rulings on Tizerus Charger).
    const counterChoice = new RegExp(`^~ (enters|escapes) with your choice of an? ${COUNTER} counter or an? ${COUNTER} counter on it\\.$`).exec(line);
    if (counterChoice) {
      if (out.entersCounterChoice || counterChoice[2] === counterChoice[3]) out.unsupported.push(raw);
      else out.entersCounterChoice = { counters: [counterKind(counterChoice[2]!), counterKind(counterChoice[3]!)], ...(counterChoice[1] === "escapes" ? { escaped: true as const } : {}) };
      continue;
    }
    // Grimdancer: "~ enters with your choice of two different counters on it from among menace, deathtouch, and lifelink":
    // one of the three pairs, chosen as it enters (CR 614.1c, 614.12).
    const counterPair = new RegExp(`^~ enters with your choice of two different counters on it from among ${COUNTER}, ${COUNTER}, and ${COUNTER}\\.$`).exec(line);
    if (counterPair) {
      const kinds = counterPair.slice(1, 4).map((k) => counterKind(k!));
      if (out.entersCounterChoice || new Set(kinds).size !== 3) out.unsupported.push(raw);
      else out.entersCounterChoice = { counters: kinds, two: true };
      continue;
    }
    // Denry Klin, Editor in Chief: "~ enters with your choice of a +1/+1, first strike, or vigilance counter on it": one of
    // three, the same way.
    const counterChoice3 = new RegExp(`^~ enters with your choice of an? ${COUNTER}, ${COUNTER}, or ${COUNTER} counter on it\\.$`).exec(line);
    if (counterChoice3) {
      const kinds = counterChoice3.slice(1, 4).map((k) => counterKind(k!));
      if (out.entersCounterChoice || new Set(kinds).size !== 3) out.unsupported.push(raw);
      else out.entersCounterChoice = { counters: kinds };
      continue;
    }
    // Corrupted Shapeshifter, Primal Plasma, Primal Clay: "As ~ enters, it becomes your choice of a 3/3 creature with
    // flying, a 2/5 creature with vigilance, or a 0/12 creature with defender": set power and toughness and maybe a
    // keyword or a creature type, as it enters (CR 208.2b, 614.12). Primal Clay's "artifact creature" is what it is anyway.
    // Aquamorph Entity: "As ~ enters or is turned face up, it becomes your choice of 5/1 or 1/5": a replacement both ways
    // (CR 614.1e), chosen as it's turned face up too, so it's turned face up as that size (rulings); a face-down
    // permanent has no abilities as it enters (CR 708.2).
    const forms = /^As ~ enters( or is turned face up)?, it becomes your choice of (.+?)( in addition to its other types)?\.$/.exec(line);
    if (forms) {
      const isArtifact = d.types.includes("Artifact");
      const bare = forms[2]!.split(/,? or /).map((t) => /^(\d+)\/(\d+)$/.exec(t));
      const parsed = bare.every(Boolean) && !forms[3] ? bare : forms[2]!.split(/, (?:or )?/).map((t) => /^an? (\d+)\/(\d+) (?:([A-Z][a-z]+) )?(artifact )?creature(?: with (flying|vigilance|defender|reach|trample|haste|deathtouch|lifelink))?$/.exec(t));
      if (out.entersForms || parsed.length < 2 || parsed.some((f) => !f || (f[4] && !isArtifact) || (f[3] && !forms[3])) || (forms[1] && !d.keywords.some((k) => k === "Morph" || k === "Megamorph"))) out.unsupported.push(raw);
      else {
        out.entersForms = parsed.map((f) => ({
          except: { pt: [Number(f![1]), Number(f![2])] as [number, number], ...(f![5] ? { keywords: [capital(f![5])] } : {}), ...(f![3] ? { addSubtypes: [f![3]] } : {}) },
          text: f![0],
        }));
        if (forms[1]) out.faceUpForms = true;
      }
      continue;
    }
    // Molten Sentry: "As ~ enters, flip a coin. If the coin comes up heads, ~ enters as a 5/2 creature with haste. If it
    // comes up tails, ~ enters as a 2/5 creature with defender.": the same two forms, the coin picking one (CR 705.2: heads
    // or tails, no one wins or loses), part of its copiable values (CR 707.2); a creature entering as a copy of it flips
    // for itself, one becoming a copy of it later takes what it is (rulings).
    const flipForms = /^As ~ enters, flip a coin\. If the coin comes up heads, ~ enters as (an? \d+\/\d+ creature with [a-z]+)\. If it comes up tails, ~ enters as (an? \d+\/\d+ creature with [a-z]+)\.$/.exec(line);
    if (flipForms) {
      const parsed = [flipForms[1]!, flipForms[2]!].map((t) => /^an? (\d+)\/(\d+) creature with (flying|vigilance|defender|reach|trample|haste|deathtouch|lifelink)$/.exec(t));
      if (out.entersForms || parsed.some((f) => !f)) out.unsupported.push(raw);
      else {
        out.entersForms = parsed.map((f) => ({ except: { pt: [Number(f![1]), Number(f![2])] as [number, number], keywords: [capital(f![3]!)] }, text: f![0] }));
        out.entersFormsFlip = true;
      }
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
    // Shinryu, Transcendent Rival: "As this creature transforms into Shinryu, choose an opponent.": chosen as it transforms
    // (CR 712.20), only by transforming (rulings: not if it enters with this face up); "the chosen player" its own.
    if (asTransforms?.[1] === "choose an opponent." && !out.asTransformsChoose) {
      out.asTransformsChoose = "opponent";
      continue;
    }
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
    // Dauntless Bodyguard, Tyrannical Pitlord: "As ~ enters, choose another creature you control." (CR 614.12): "the chosen
    // creature" is that permanent; no new one is chosen if it leaves (rulings).
    if (line === "As ~ enters, choose another creature you control." && !out.entersChooseObject) {
      out.entersChooseObject = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "another creature you control" };
      continue;
    }
    // Phylactery Lich: "As ~ enters, put a phylactery counter on an artifact you control." (CR 614.12): not targeted, one
    // already on the battlefield, not one entering with it; with none, nothing gets the counter (rulings).
    const entersCounterOn = /^As ~ enters, put an? ([a-z]+) counter on an? (artifact|creature|enchantment|land) you control\.$/.exec(line);
    if (entersCounterOn && !out.entersChooseObject) {
      out.entersChooseObject = { kind: "object", types: [capital(entersCounterOn[2]!)], notTypes: [], notColors: [], controller: "you", text: `${/^[aeiou]/.test(entersCounterOn[2]!) ? "an" : "a"} ${entersCounterOn[2]} you control to put a ${entersCounterOn[1]} counter on` };
      out.entersChooseObjectCounter = entersCounterOn[1]!;
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
      // Monastery Siege: "Dragons — Spells your opponents cast that target you or a permanent you control cost {2} more to
      // cast": once per spell (rulings), only while that word was chosen.
      else if (out.entersAnchor!.includes(anchored[1]!) && /^Spells your opponents cast that target you or a permanent you control cost \{\d+\} more to cast\.$/.test(anchored[2]!))
        (out.opponentsTargetTax ??= []).push({ n: Number(/\{(\d+)\}/.exec(anchored[2]!)![1]), filter: { kind: "object", text: "permanent" }, you: true, if: { kind: "anchor", word: anchored[1]! } });
      else if (!out.entersAnchor!.includes(anchored[1]!) || !conditionalAbility(d, anchored[2]!, out, { kind: "anchor", word: anchored[1]! })) out.unsupported.push(raw);
      continue;
    }
    // Brimstone Vandal: "If it's neither day nor night, it becomes day as ~ enters." (CR 731.1), as it enters (614.12).
    if (line === "If it's neither day nor night, it becomes day as ~ enters.") {
      out.entersDay = true;
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
    // Tablet of the Guilds: "As ~ enters, choose two colors." (CR 614.12): two different colors (rulings), one after the
    // other, kept as Chosen.colors.
    if (line === "As ~ enters, choose two colors.") {
      if (out.entersChoose?.some((c) => c.what === "color")) out.unsupported.push(raw);
      else for (let i = 0; i < 2; i++) (out.entersChoose ??= []).push({ what: "color", many: true });
      continue;
    }
    // Greymond, Avacyn's Stalwart: "As ~ enters, choose two abilities from among first strike, vigilance, and lifelink."
    // (CR 614.12): two different keywords, one after the other, kept as Chosen.keywords.
    const asAbilities = /^As ~ enters, choose (two|three) abilities from among ((?:[a-z ]+, )+and [a-z ]+)\.$/.exec(line);
    if (asAbilities) {
      const kws = asAbilities[2]!.split(/, (?:and )?/).map((k) => canonicalKeyword(k));
      const n = asAbilities[1] === "two" ? 2 : 3;
      if (kws.some((k) => !k || k.startsWith("(")) || kws.length <= n || out.entersChoose?.some((c) => c.what === "keyword")) out.unsupported.push(raw);
      else for (let i = 0; i < n; i++) (out.entersChoose ??= []).push({ what: "keyword", options: kws as string[], many: true });
      continue;
    }
    // Sarpadian Empires, Vol. VII: "As ~ enters, choose white Citizen, blue Camarid, black Thrull, red Goblin, or green
    // Saproling." (CR 614.12): one color and creature type pair, both chosen at once.
    const asColorTypeList = /^As ~ enters, choose ((?:(?:white|blue|black|red|green) [A-Z][a-z]+, )+or (?:white|blue|black|red|green) [A-Z][a-z]+)\.$/.exec(line);
    if (asColorTypeList) {
      const pairs = asColorTypeList[1]!.split(/, (?:or )?/);
      if (!pairs.every((p) => CREATURE_TYPES.has(p.split(" ")[1]!)) || out.entersChoose?.length) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "colorAndType", options: pairs });
      continue;
    }
    // Roots of Life: "As ~ enters, choose Island or Swamp." (CR 614.12): one of these basic land types, kept as
    // Chosen.landType.
    const asLandTypeList = /^As ~ enters, choose (Plains|Island|Swamp|Mountain|Forest) or (Plains|Island|Swamp|Mountain|Forest)\.$/.exec(line);
    if (asLandTypeList) {
      if (out.entersChoose?.length) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "basicLandType", options: [asLandTypeList[1]!, asLandTypeList[2]!] });
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
    // Myr Superion (CompiledCard.creatureManaOnly): a permanent spell's restriction on the mana that casts it (CR 106.6).
    if (line === "Spend only mana produced by creatures to cast ~." && !isSpell && !out.creatureManaOnly && !out.basicLandManaOnly) {
      out.creatureManaOnly = true;
      continue;
    }
    // Imperiosaur (CompiledCard.basicLandManaOnly), the same way.
    if (line === "Spend only mana produced by basic lands to cast ~." && !isSpell && !out.creatureManaOnly && !out.basicLandManaOnly) {
      out.basicLandManaOnly = true;
      continue;
    }
    // Sorcerous Spyglass, Anointed Peacekeeper: "look at an opponent's hand, then choose any card name": the same, then any
    // card name (CR 201.4), not only one seen in that hand (rulings).
    if (line === "As ~ enters, look at an opponent's hand, then choose any card name." && !out.entersChoosePlayer && !out.entersChoose?.some((c) => c.what === "cardName")) {
      out.entersChoosePlayer = "opponent";
      out.entersLookHand = true;
      (out.entersChoose ??= []).push({ what: "cardName" });
      continue;
    }
    const lookThenType = /^As ~ enters, look at an opponent's hand, then choose a card type other than (\w+)\.$/.exec(line);
    if (lookThenType && !out.entersChoosePlayer && !out.entersChoose?.some((c) => c.what === "cardType")) {
      out.entersChoosePlayer = "opponent";
      out.entersLookHand = true;
      (out.entersChoose ??= []).push({ what: "cardType", options: Object.keys(CARD_TYPE_PLURAL).filter((t) => t !== capital(lookThenType[1]!)) });
      continue;
    }
    // "As this artifact enters, choose artifact, creature, enchantment, instant, or sorcery." (Cloud Key, CR 614.12): a
    // card type, kept as Chosen.cardType.
    const asCardType = /^As (?:~|it) enters, choose ((?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle)(?:, (?:or )?(?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle))+|a card type(?: other than (?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle)(?: or (?:artifact|creature|enchantment|instant|sorcery|land|planeswalker|battle))?)?)\.$/.exec(line);
    if (asCardType) {
      // Stenn, Paranoid Partisan: "a card type other than creature or land": any of the others.
      const other = /^a card type other than (\w+)(?: or (\w+))?$/.exec(asCardType[1]!);
      const not = other ? [capital(other[1]!), ...(other[2] ? [capital(other[2])] : [])] : [];
      if (out.entersChoose?.some((c) => c.what === "cardType")) out.unsupported.push(raw);
      // "Choose a card type" (Serra's Emissary): any that a card here can have (rulings).
      else (out.entersChoose ??= []).push({ what: "cardType", options: asCardType[1]!.startsWith("a card type") ? Object.keys(CARD_TYPE_PLURAL).filter((t) => !not.includes(t)) : asCardType[1]!.split(/, (?:or )?/).map(capital) });
      continue;
    }
    // Archon of Valor's Reach: "Players can't cast spells of the chosen type.": anyone's spell with the card type chosen as
    // it entered (CR 614.12), checked as the spell is proposed, before costs are paid (rulings, CR 601.3).
    if (line === "Players can't cast spells of the chosen type." && out.entersChoose?.some((c) => c.what === "cardType")) {
      (out.cantBeCast ??= []).push({ filter: { kind: "spell", types: [], notTypes: [], notColors: [], chosen: "cardType", text: "spell of the chosen type" }, text: line });
      continue;
    }
    // "As ~ enters, choose a number between 1 and 10." (Talion), "choose a number." (Sanctum Prelate): a whole number, kept
    // as Chosen.number (CR 614.12; CR 107.1: the game uses only integers, and no mana value is negative, so 0 or more).
    // "As ~ enters, choose odd or even." (Gollum, Riddle Master), kept as Chosen.parity (CR 614.12).
    // "As ~ enters, choose left or right." (Pramikon), kept as Chosen.direction (CR 614.12).
    if (line === "As ~ enters, choose left or right.") {
      if (out.entersChoose?.some((c) => c.what === "direction")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "direction" });
      continue;
    }
    if (line === "As ~ enters, choose odd or even.") {
      if (out.entersChoose?.some((c) => c.what === "parity")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "parity" });
      continue;
    }
    // Haktos the Unscarred: "As ~ enters, choose 2, 3, or 4 at random." (CR 614.12): one of those numbers, picked at random
    // before it enters (rulings), kept as Chosen.number.
    const asRandom = /^As ~ enters, choose ((?:\d+, )+or \d+) at random\.$/.exec(line);
    if (asRandom) {
      if (out.entersChoose?.some((c) => c.what === "number")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "number", random: asRandom[1]!.split(/, (?:or )?/).map(Number) });
      continue;
    }
    // Archangel of Strife: "As ~ enters, each player chooses war or peace." (CR 614.12, rulings: the active player first).
    const eachWord = /^As ~ enters, each player chooses ([a-z]+) or ([a-z]+)\.$/.exec(line);
    if (eachWord) {
      if (out.entersEachPlayerChooses) out.unsupported.push(raw);
      else out.entersEachPlayerChooses = [eachWord[1]!, eachWord[2]!];
      continue;
    }
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
    // Alhammarret, High Arbiter: "As ~ enters, each opponent reveals their hand. You choose the name of a nonland card
    // revealed this way.": one name, not one for each opponent, from among the cards revealed; none if no opponent has a
    // nonland card in hand (rulings; CR 614.12).
    if (line === "As ~ enters, each opponent reveals their hand. You choose the name of a nonland card revealed this way.") {
      if (out.entersChoose?.some((c) => c.what === "cardName")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "cardName", names: { kind: "card", types: [], notTypes: ["Land"], notColors: [], text: "nonland card" }, opponentHands: true });
      continue;
    }
    // Null Chamber (CompiledCard.entersNamesWithOpponent).
    const withOpp = /^As ~ enters, you and an opponent each choose (a card name(?: other than a basic land card name)?)\.$/.exec(line);
    if (withOpp) {
      const nameChoice = parseCardNameChoice(withOpp[1]!);
      if (!nameChoice || out.entersNamesWithOpponent || out.entersChoose?.some((c) => c.what === "cardName") || out.entersChoosePlayer) out.unsupported.push(raw);
      else out.entersNamesWithOpponent = nameChoice;
      continue;
    }
    if (line === "Spells with the chosen names can't be cast and lands with the chosen names can't be played." && out.entersNamesWithOpponent && !out.nameBans) {
      out.nameBans = [{ kind: "cast", who: "all" }, { kind: "play" }];
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
    // Circu, Dimir Lobotomist: "Your opponents can't cast spells with the same name as a card exiled with ~": the names of
    // the cards its exile abilities exiled that are still exiled (CR 607.2a, 201.2).
    // Booby Trap (CompiledCard.revealsChosenPlayersDraws), with a player chosen as it enters.
    if (line === "The chosen player reveals each card they draw." && out.entersChoosePlayer && !out.revealsChosenPlayersDraws) {
      out.revealsChosenPlayersDraws = true;
      continue;
    }
    // Cornered Market (CompiledCard.permanentNameBan).
    if (line === "Players can't cast spells with the same name as a nontoken permanent." && !out.permanentNameBan?.cast) {
      out.permanentNameBan = { ...out.permanentNameBan, cast: true };
      continue;
    }
    if (line === "Players can't play nonbasic lands with the same name as a nontoken permanent." && !out.permanentNameBan?.lands) {
      out.permanentNameBan = { ...out.permanentNameBan, lands: true };
      continue;
    }
    if (line === "Your opponents can't cast spells with the same name as a card exiled with ~." && !out.linkedNameCastBan) {
      out.linkedNameCastBan = true;
      continue;
    }
    // Exclusion Ritual: "Players can't cast spells with the same name as the exiled card", Ixalan's Binding: "Your opponents
    // can't ...": the card its enters ability exiled, linked to it (CR 607.2a), while it's still exiled (rulings: once it
    // leaves exile, or a commander goes to the command zone, nothing is banned).
    const exiledBan = /^(Players|Your opponents) can't cast spells with the same name as the exiled card\.$/.exec(line);
    if (exiledBan && !out.linkedNameCastBan) {
      const exiles = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && e.what.ref === "target" && !e.what.n && (!e.until || e.until === "sourceLeaves"));
      const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileFaceDown" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "counterSpell");
      // Ashiok's Erasure: "When ~ enters, exile target spell": the card that spell was, in exile (a copy leaves nothing
      // exiled, rulings), its only exile.
      const spells = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "counterSpell" }> => e.type === "counterSpell" && !!e.exileSpell && !e.cause && !e.plot && !e.ownerMayCost && !e.n);
      if (!exiles.length && spells.length === 1 && all.length === 1) {
        spells[0]!.linked = true;
        out.linkedNameCastBan = exiledBan[1] === "Players" ? "players" : true;
      } else if (exiles.length !== 1 || all.length !== 1) out.unsupported.push(raw);
      else {
        exiles[0]!.linked = true;
        out.linkedNameCastBan = exiledBan[1] === "Players" ? "players" : true;
      }
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
    // Eidolon of Obstruction: "Loyalty abilities of planeswalkers your opponents control cost {1} more to activate": a mana
    // part added to their cost, whatever loyalty they cost (rulings).
    const loyaltyTax = /^Loyalty abilities of planeswalkers your opponents control cost \{(\d+)\} more to activate\.$/.exec(line);
    if (loyaltyTax) {
      (out.activationTaxes ??= []).push({ n: Number(loyaltyTax[1]), opponents: true, loyalty: true, text: line });
      continue;
    }
    // Carth the Lion: "Planeswalkers' loyalty abilities you activate cost an additional [+1] to activate": the loyalty cost
    // changed before any counter is put on or removed (rulings: [-3] removes two; [0] puts one on; two Carths add [+2]).
    if (line === "Planeswalkers' loyalty abilities you activate cost an additional [+1] to activate.") {
      out.loyaltyCostMore = (out.loyaltyCostMore ?? 0) + 1;
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
    // "As ~ enters, sacrifice any number of permanents. ~ enters with that many +1/+1 counters on it." (Shimatsu), "...
    // untapped Forests." (Wood Elemental, with its CDA below), "... creatures. ~'s power becomes the total power of those
    // creatures and its toughness becomes their total toughness." (Dracoplasm): devour's choice as it enters (CR
    // 614.1c, 614.12), before it's on the battlefield, so not of itself (rulings on Shimatsu, Wood Elemental).
    const asSac = /^As ~ enters, sacrifice any number of (permanents|creatures|untapped Forests)\.(?: (~ enters with that many \+1\/\+1 counters on it|~'s power becomes the total power of those creatures and its toughness becomes their total toughness)\.)?$/.exec(line);
    if (asSac) {
      const filter: TargetSpec =
        asSac[1] === "permanents" ? { kind: "object", text: "permanent" }
        : asSac[1] === "creatures" ? { kind: "object", types: ["Creature"], text: "creature" }
        : { kind: "object", subtypes: ["Forest"], tapped: false, text: "untapped Forest" };
      const rider = asSac[2]?.startsWith("~ enters") ? "counters" : asSac[2] ? "total" : undefined;
      // Each wording goes with its own rider: Forests alone (their count is the P/T), counters for permanents, totals for creatures.
      const fits = asSac[1] === "untapped Forests" ? !rider : asSac[1] === "permanents" ? rider === "counters" : rider === "total";
      if (out.devour || !fits) out.unsupported.push(raw);
      else out.devour = { n: rider === "counters" ? 1 : 0, filter, ...(rider === "counters" ? {} : { defines: rider ?? "count" }) };
      continue;
    }
    // Overlaid Terrain: "As ~ enters, sacrifice all lands you control." The same, without a choice: all of them (CR 614.12).
    if (line === "As ~ enters, sacrifice all lands you control." && !isSpell) {
      if (out.devour) out.unsupported.push(raw);
      else out.devour = { n: 0, filter: { kind: "object", types: ["Land"], text: "land" }, all: true };
      continue;
    }
    // Devouring Hellion: "As ~ enters, you may sacrifice any number of creatures and/or planeswalkers. If you do, it enters
    // with twice that many +1/+1 counters on it.": devour 2's choice (CR 702.82a, 614.12), of either kind. Rescuer Sphinx:
    // "As ~ enters, you may return a nonland permanent you control to its owner's hand. If you do, ~ enters with a +1/+1
    // counter on it.": the same choice of at most one, returned. Both only among permanents already on the battlefield
    // (rulings).
    if (line === "As ~ enters, you may sacrifice any number of creatures and/or planeswalkers. If you do, it enters with twice that many +1/+1 counters on it." && !isSpell) {
      if (out.devour) out.unsupported.push(raw);
      else out.devour = { n: 2, filter: { kind: "object", types: ["Creature", "Planeswalker"], text: "creature or planeswalker" } };
      continue;
    }
    if (line === "As ~ enters, you may return a nonland permanent you control to its owner's hand. If you do, ~ enters with a +1/+1 counter on it." && !isSpell) {
      if (out.devour) out.unsupported.push(raw);
      else out.devour = { n: 1, filter: { kind: "object", notTypes: ["Land"], text: "nonland permanent" }, bounce: true, max: 1 };
      continue;
    }
    // Urborg Lhurgoyf: "As ~ enters, mill three cards for each time it was kicked." Part of how it enters, not a trigger
    // (rulings, CR 614.1c), its kicker costs counted (CR 702.33d).
    // Monstrous War-Leech: "As ~ enters, if it was kicked, mill four cards": the same, with a kicker paid at most once (CR
    // 702.33a), so mill four or none.
    const millKicked = /^As ~ enters, mill (two|three|four) cards for each time it was kicked\.$/.exec(line) ?? (!d.keywords.includes("Multikicker") ? /^As ~ enters, if it was kicked, mill (two|three|four) cards\.$/.exec(line) : null);
    if (millKicked && d.keywords.includes("Kicker") && !isSpell) {
      out.entersMillPerKick = num(millKicked[1]!);
      continue;
    }
    // Ixidron: "As ~ enters, turn all other nontoken creatures face down." (its reminder text is gone by now).
    if (line === "As ~ enters, turn all other nontoken creatures face down." && !isSpell) {
      out.entersTurnOthersFaceDown = true;
      continue;
    }
    // Heightened Awareness: "As ~ enters, discard your hand." (CR 614.1c).
    if (line === "As ~ enters, discard your hand.") {
      out.entersDiscardHand = true;
      continue;
    }
    // Sutured Ghoul, Living Lore, Frankenstein's Monster: "As ~ enters, exile ... from your graveyard" and the abilities
    // reading the cards it exiled.
    if (roundB171Line(line, out, isSpell)) continue;
    // Cryoshatter, Nullstone Gargoyle, Skyblade's Boon, Key to the Side-Door (round B173).
    if (roundB173Line(line, raw, out, isSpell)) continue;
    // Cryptid Inspector, Reckless Velocitaur, Tunnel Tipster, Veiled Ascension, Sanctifier en-Vec (round B174).
    if (roundB174Line(line, raw, out, isSpell)) continue;
    // Seton's Desire, Grand Master of Flowers, Torrent Elemental, Sevinne, Ian the Reckless, Thrill-Kill Disciple (round B175).
    if (roundB175Line(line, raw, out, isSpell)) continue;
    // Aurification, Sanctum Lurker (round B176).
    if (roundB176Line(line, raw, out, isSpell)) continue;
    if (roundB177Line(line, raw, out, isSpell)) continue;
    if (roundB178Line(line, raw, out, isSpell)) continue;
    // Drain Life, Consume Spirit (round B179).
    if (roundB179Line(line, raw, out, isSpell, d)) continue;
    // Murktide Regent, Soulflayer, Lochmere Serpent, Skyclave Shade, Nightshade Assassin, Shadow Urchin, Curse of Chaos (round B182).
    if (roundB182Line(line, raw, out, isSpell)) continue;
    // Varolz, Young Deathclaws, Green Goblin (round B183).
    if (roundB183Line(line, raw, out, isSpell)) continue;
    // Kathril, Curse of Inertia, Oppressive Rays, Gloom (round B184).
    if (roundB184Line(line, raw, out, isSpell)) continue;
    // Prince of Thralls, Volcano Hellion (round B185).
    if (roundB185Line(line, raw, out, isSpell)) continue;
    // Round B186.
    if (roundB186Line(line, raw, out, isSpell)) continue;
    // Round B187.
    if (roundB187Line(line, raw, out, isSpell)) continue;
    // Round B188.
    if (roundB188Line(line, raw, out, isSpell)) continue;
    // Thought Prison, Soulcipher Board, Grimoire Thief (round B189).
    if (roundB189Line(line, raw, out, isSpell)) continue;
    // Round B190.
    if (roundB190Line(line, raw, out, isSpell)) continue;
    // Round B191 (Ward of Bones).
    if (roundB191Line(line, out, isSpell)) continue;
    // Colfenor's Plans (round B192).
    if (roundB192Line(line, raw, out, isSpell)) continue;
    // Surtland Flinger, Cephalid Constable (round B194).
    if (roundB194Line(line, raw, out, isSpell)) continue;
    // Chandra's Phoenix, Abby, Jocasta, Phyrexian Devourer (round B197).
    if (roundB197Line(line, raw, out, isSpell)) continue;
    // Boneyard Mycodrax, Templar Knight, Sea Gate Stormcaller, Dream Chisel, Obscuring Aether, Kadena, Goblin Maskmaker (round B198).
    if (roundB198Line(line, raw, out, isSpell)) continue;
    // Nazahn, Hall of Echoes, Wall of Shadows, Fraying Line, Meandering Towershell, Noctis (round B199).
    if (roundB199Line(line, raw, out, isSpell)) continue;
    // Tenth District Hero, Livio (round B200).
    if (roundB200Line(line, raw, out, isSpell)) continue;
    // Happily Ever After, Delaying Shield, Crooked Scales, Liar's Pendulum (round B201).
    if (roundB201Line(line, raw, out, isSpell)) continue;
    // Tide of War, Moorland Rescuer, Loki Laufeyson, Darigaaz Reincarnated (round B202).
    if (roundB202Line(line, raw, out, isSpell)) continue;
    // Round B204.
    if (roundB204Line(line, raw, out, isSpell)) continue;
    // Don & Leo, Captain Marvel, Knickknack Ouphe (round B205).
    if (roundB205Line(line, raw, out, isSpell)) continue;
    // Kaya, Ghost Assassin, Drach'Nyen (round B206).
    if (roundB206Line(line, raw, out, isSpell)) continue;
    // Tourach's Chant, Thelon's Chant, Nature's Wrath, Overburden, Delif's Cone, Delif's Cube (round B207).
    if (roundB207Line(line, raw, out, isSpell)) continue;
    // Lumbering Battlement, Auratouched Mage, Storm Herald, Liberated Livestock, Hans Eriksson (round B208).
    if (roundB208Line(line, raw, out, isSpell)) continue;
    // Laccolith Rig, Bill Potts, Beamsplitter Mage, Shuriken (round B209).
    if (roundB209Line(line, raw, out, isSpell)) continue;
    // Thought Lash, Mystic Barrier (round B210).
    if (roundB210Line(line, raw, out, isSpell)) continue;
    // Chromatic Armor, Call to Arms, Nettlevine Blight, Strax, Merseine (round B211).
    if (roundB211Line(line, raw, out, isSpell)) continue;
    // Desolation, Kodama of the Center Tree, Corrosive Ooze (round B213).
    if (roundB213Line(line, raw, out, isSpell)) continue;
    // All Hallow's Eve, Ice Cave, Tidal Flats, Alpine Moon (round B214).
    if (roundB214Line(line, raw, out, isSpell)) continue;
    // Indominus Rex, Alpha: "As ~ enters, discard any number of creature cards. It enters with a flying counter on it if a
    // card discarded this way has flying. The same is true for first strike, ...": a choice as it enters (CR 614.12), one
    // keyword counter of each kind a discarded card has (CR 122.1b, rulings).
    const indominus = /^As ~ enters, discard any number of creature cards\. It enters with a flying counter on it if a card discarded this way has flying\. The same is true for (.+), and ([a-z ]+)\.$/.exec(line);
    if (indominus) {
      const kinds = ["flying", ...indominus[1]!.split(", "), indominus[2]!];
      const known = ["flying", "first strike", "double strike", "deathtouch", "hexproof", "haste", "indestructible", "lifelink", "menace", "reach", "trample", "vigilance"];
      if (kinds.every((k) => known.includes(k)) && new Set(kinds).size === kinds.length && !out.entersDiscardKeywords) {
        out.entersDiscardKeywords = kinds;
        continue;
      }
    }
    // Arsenal Thresher: "As ~ enters, you may reveal any number of other artifact cards from your hand. ~ enters with a
    // +1/+1 counter on it for each card revealed this way.": amplify 1's choice (CR 702.38a, 614.12), of artifact cards.
    if (line === "As ~ enters, you may reveal any number of other artifact cards from your hand. ~ enters with a +1/+1 counter on it for each card revealed this way.") {
      if (out.amplify) out.unsupported.push(raw);
      else [out.amplify, out.amplifyFilter] = [1, { kind: "card", types: ["Artifact"], text: "artifact card" }];
      continue;
    }
    // Dragon's Disciple: "As ~ enters, you may reveal a Dragon card from your hand. If you do or if you control a Dragon, ~
    // enters with a +1/+1 counter on it." (CompiledCard.amplifyOne): one card at most, one counter either way.
    const revealOne = /^As ~ enters, you may reveal an? ([A-Z][a-z]+) card from your hand\. If you do or if you control an? ([A-Z][a-z]+), ~ enters with a \+1\/\+1 counter on it\.$/.exec(line);
    if (revealOne) {
      if (out.amplify || revealOne[1] !== revealOne[2] || !CREATURE_TYPES.has(revealOne[1]!)) out.unsupported.push(raw);
      else {
        [out.amplify, out.amplifyFilter] = [1, { kind: "card", subtypes: [revealOne[1]!], text: `${revealOne[1]} card` }];
        out.amplifyOne = { orControl: { kind: "object", subtypes: [revealOne[2]!], controller: "you", text: `${revealOne[2]} you control` } };
      }
      continue;
    }
    // "As ~ enters, pay any amount of life." (Minion of the Wastes; CR 614.12, 119.4), with Nameless Race's "The amount you
    // pay can't be more than the total number of white nontoken permanents your opponents control plus the total number of
    // white cards in their graveyards."
    const asLife = /^As ~ enters, pay any amount of life\.(?: The amount you pay can't be more than (.+)\.)?$/.exec(line);
    if (asLife) {
      const cap = asLife[1] === "the total number of white nontoken permanents your opponents control plus the total number of white cards in their graveyards" ? parseCount("the number of white nontoken permanents your opponents control plus the number of white cards in your opponents' graveyards", null) : null;
      if (out.entersPayLife || (asLife[1] && !cap)) out.unsupported.push(raw);
      else {
        out.entersPayLife = cap ? { max: cap } : {};
        out.entersOptions = [...(out.entersOptions ?? []), "lifeAsEnters"];
      }
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
    // Neverwinter Hydra: "As ~ enters, roll X d6. It enters with a number of +1/+1 counters on it equal to the total of
    // those results": the X chosen, the dice rolled as it enters, part of the replacement (CR 614.1c, 706.2).
    if (line === "As ~ enters, roll X d6. It enters with a number of +1/+1 counters on it equal to the total of those results." && !isSpell) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } }, rollD: 6 };
      continue;
    }
    // Thief of Blood: "As ~ enters, remove all counters from all permanents. ~ enters with a +1/+1 counter on it for each
    // counter removed this way" (see CompiledCard.entersStealsCounters).
    if (line === "As ~ enters, remove all counters from all permanents. ~ enters with a +1/+1 counter on it for each counter removed this way." && !isSpell) {
      out.entersStealsCounters = true;
      continue;
    }
    // Sin, Unending Cataclysm: "As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments.
    // ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way." (see
    // CompiledCard.entersRemoveCounters).
    if (line === "As ~ enters, remove all counters from any number of artifacts, creatures, and enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way." && !isSpell) {
      const filter = parseTargetPhrase("artifact, creature, or enchantment");
      if (filter?.kind !== "object" || out.entersRemoveCounters || out.entersWithCounters) out.unsupported.push(raw);
      else out.entersRemoveCounters = { filter: { ...filter, text: "artifact, creature, or enchantment" }, per: 2 };
      continue;
    }
    // Slumbering Trudge: "~ enters with a number of stun counters on it equal to three minus X. If X is 2 or less, it
    // enters tapped.": the X chosen as it was cast (CR 107.3m), 0 entering any other way (rulings); none below 0 (CR
    // 107.1b). Both replacements apply as it enters (CR 614.1c).
    const minusX = /^~ enters with a number of stun counters on it equal to (two|three|four|five) minus X\. If X is (\d+) or less, it enters tapped\.$/.exec(line);
    if (minusX && !isSpell && num(minusX[1]!) === Number(minusX[2]) + 1 && parseManaCost(d.manaCost).hasX) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: "stun", n: { count: { kind: "x" }, times: -1, plus: num(minusX[1]!) } };
        out.entersTappedIfXAtMost = Number(minusX[2]);
      }
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
    // "Replicate—Tap an untapped Dalek you control." (Exterminate!): a replicate cost that isn't mana (CR 702.56a, 118.8),
    // paid like multikicker, a different untapped one tapped for each time (it needn't have haste: no {T} symbol, CR
    // 302.6).
    // "Replicate—Pay {E}{E}{E}." (Reiterating Bolt): three energy for each time (CR 107.14).
    const replicateTap = /^Replicate—(Tap an untapped [A-Z][a-z]+ you control|Pay (?:\{E\})+)\.$/.exec(line);
    if (replicateTap) {
      const energy = /^Pay ((?:\{E\})+)$/.exec(replicateTap[1]!);
      const cost: AdditionalCost | null = energy ? { kind: "payEnergy", n: energy[1]!.length / 3 } : parseAdditionalCost(replicateTap[1]!.replace(/^T/, "t"));
      if (out.kicker || !cost || (cost.kind !== "tap" && cost.kind !== "payEnergy") || cost.n < 1 || (cost.kind === "tap" && cost.n !== 1)) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [""], multi: true, replicate: true, extraCosts: [cost], text: replicateTap[1]!.replace(/^T/, "t") };
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
    // All Hallow's Eve (round B214): "Exile ~ with two scream counters on it.", the spell's only instruction (its other line
    // is an ability that works in exile): as it resolves it's exiled with those counters, instead of going to its owner's
    // graveyard (CR 608.2n, 122.1; rulings: that's all it does).
    const exileWith = isSpell ? /^Exile ~ with (two|three) ([a-z]+) counters on it\.$/.exec(line) : null;
    if (exileWith && !out.exileSelfOnResolve && lines.every((l, k) => k === li || /^At the beginning of your upkeep, if ~ is exiled with an? [a-z]+ counter on it, /.test(l))) {
      out.exileSelfOnResolve = true;
      out.exileSelfCounters = { counter: exileWith[2]!, n: exileWith[1] === "two" ? 2 : 3 };
      continue;
    }
    // Grifter's Blade: "As this Equipment enters, choose a creature you control it could be attached to. If you do, it
    // enters attached to that creature." (CR 614.12; rulings: one must be chosen if possible).
    if (line === "As ~ enters, choose a creature you control it could be attached to. If you do, it enters attached to that creature." && d.subtypes.includes("Equipment")) {
      out.entersAttachedToYours = true;
      continue;
    }
    // Liquid Fire: "As an additional cost to cast this spell, choose a number between 0 and 5" (CR 601.2b): chosen as it's
    // cast, kept by the spell (StackItem.chosenNumber), "the chosen number" as it resolves (rulings).
    const castNumber = isSpell ? /^As an additional cost to cast ~, choose a number between (\d+) and (\d+)\.$/.exec(line) : null;
    if (castNumber) {
      out.castNumber = { min: Number(castNumber[1]), max: Number(castNumber[2]) };
      continue;
    }
    // "As an additional cost to cast this spell, (you may) waterbend {5}" (CR 701.67a): a cost paid like kicker, part of
    // which tapped artifacts and creatures can pay. "If this spell's additional cost was paid" reads as kicked.
    // Waterbender's Restoration: "waterbend {X}": X announced as it's cast (CR 107.3a, 601.2b), and up to X of it paid by
    // tapping.
    const waterbendCost = /^As an additional cost to cast ~, (you may )?waterbend \{(\d+|X)\}\.$/.exec(line);
    if (waterbendCost) {
      if (out.kicker || (waterbendCost[2] === "X" && (waterbendCost[1] || parseManaCost(d.manaCost).hasX))) out.unsupported.push(raw);
      else out.kicker = { costs: [`{${waterbendCost[2]}}`], waterbend: waterbendCost[2] === "X" ? "X" : Number(waterbendCost[2]), ...(waterbendCost[1] ? {} : { required: true as const }) };
      continue;
    }
    // "Squad—Exile four cards from your graveyard." (Ruthless Radrat): a squad cost that isn't mana (CR 702.157a, 118.8),
    // paid like a multikicker cost whose exiled cards add up (four for each time).
    const squadOther = /^Squad—(Exile (?:two|three|four|five|six) cards from your graveyard)\.$/.exec(line);
    if (squadOther) {
      const cost = parseAdditionalCost(squadOther[1]!.replace(/^E/, "e"));
      if (out.kicker || cost?.kind !== "exileFromGraveyard" || cost.filter || cost.x || cost.top) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [""], multi: true, squad: true, extraCosts: [cost], text: squadOther[1]!.replace(/^E/, "e") };
        out.triggers.push({ event: "selfEnters", ifKicked: { kind: "kicked" }, body: { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: { count: { kind: "kicked" } }, what: { ref: "self" } }], text: "Squad: create a token that's a copy of ~ for each time its squad cost was paid." } });
      }
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
    // Myriad Construct: "If ~ was kicked, it enters with a +1/+1 counter on it for each nonbasic land your opponents
    // control.": counted as it enters (CR 614.1c), none if it wasn't kicked.
    const kickedEach = new RegExp(`^If ~ was kicked, it enters with an? (\\+1/\\+1) counter on it for each (.+?)\\.$`).exec(line);
    if (kickedEach) {
      const a = parseCount(kickedEach[2]!, null, true);
      if (!a || typeof a !== "object" || a.times || a.plus || a.half || a.negate || a.per || a.mulBy || out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: { count: a.count, mulBy: { kind: "wasKicked" } } };
      continue;
    }
    // Ravaging Riftwurm: "If ~ was kicked, it enters with three additional time counters on it": on top of the ones a
    // keyword (vanishing) already puts on it as it enters, one replacement for the lot (CR 614.1c, 702.63a).
    const kickedMore = new RegExp(`^If ~ was kicked, it enters with ${NUM} additional (\\S+) counters? on it\\.$`).exec(line);
    if (kickedMore) {
      const prior = out.entersWithCounters;
      if (!prior || prior.counter !== kickedMore[2] || typeof prior.n !== "number" || Object.keys(prior).length !== 2) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: prior.counter, n: { count: { kind: "wasKicked" } as Count, times: num(kickedMore[1]!), plus: prior.n } };
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
    // Dralnu's Pet: "If ~ was kicked, it enters with flying and with X +1/+1 counters on it, where X is the discarded card's
    // mana value": the card its kicker's discard cost discarded, as it is in the graveyard (GameObject.costDiscarded), both
    // only if it was kicked (CR 614.1c), so it has flying from the moment it enters (rulings).
    const kickedFlyingX = /^If ~ was kicked, it enters with ([a-z]+) and with X \+1\/\+1 counters on it, where X is the discarded card's mana value\.$/.exec(line);
    if (kickedFlyingX) {
      const mods = parseGrants(kickedFlyingX[1]!);
      if (out.entersWithCounters || out.entersKicked || !out.kicker?.extraCosts?.some((c) => c.kind === "discard") || !mods || mods.some((m) => m.kind !== "addKeywords")) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "discardedManaValue" } } };
        out.entersKicked = [{ mods }];
      }
      continue;
    }
    // Voidpouncer: "If ~ was kicked, it enters with two +1/+1 counters and a trample counter on it and with haste": both
    // kinds of counters and the keyword, all only if it was kicked (CR 614.1c).
    const kickedTwo = new RegExp(`^If ~ was kicked, it enters with ${NUM} \\+1/\\+1 counters? and ${NUM} ${COUNTER} counters? on it and with (.+?)\\.$`).exec(line);
    if (kickedTwo) {
      const mods = parseGrants(kickedTwo[4]!);
      if (out.entersWithCounters || out.entersKicked || counterKind(kickedTwo[3]!) === "+1/+1" || !mods || mods.some((m) => m.kind !== "addKeywords")) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "wasKicked" } as Count, times: num(kickedTwo[1]!) }, also: { counter: counterKind(kickedTwo[3]!), n: num(kickedTwo[2]!) } };
        out.entersKicked = [{ mods }];
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
    // Round 368's additional costs (oracle/round368.ts): Gorex, the Tombshell.
    if (round368Cost(line, raw, out, isSpell)) continue;
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
    // Round 315's optional costs of any size, each cutting the total cost (CR 601.2b, 601.2f): Explosive Singularity's
    // tapped creatures, Hierophant Bio-Titan's removed +1/+1 counters, Burn at the Stake's tapped creatures counted by its
    // effect.
    const r315 = round315Cost(line, lines, d, out);
    if (r315 === "fail") {
      out.unsupported.push(raw);
      continue;
    }
    if (r315) {
      if (r315 === "tappedX") costTappedX = true;
      continue;
    }
    // Devouring Rage: "As an additional cost to cast this spell, you may sacrifice any number of Spirits." then "For each
    // Spirit sacrificed this way, that creature gets an additional +3/+0 until end of turn.": an additional cost with an X
    // of 0 or more (CR 601.2b, 107.3a), the number sacrificed; the spell's text counts it as X.
    // Vicious Betrayal: "sacrifice any number of creatures" (none too, CR 601.2b), then "Target creature gets +2/+2 until
    // end of turn for each creature sacrificed this way."
    // Corpse Cobble: "... sacrifice any number of creatures." then "Create an X/X ... token ..., where X is the total power of
    // the sacrificed creatures": the same cost, and the creatures as they last existed (CR 608.2h).
    const sacFor = /^As an additional cost to cast ~, (?:you may )?sacrifice any number of ([A-Z][a-z]+|creatures)\.$/.exec(line);
    if (sacFor && !parseManaCost(d.manaCost).hasX && !out.additionalCosts?.some((c) => c.kind === "sacrifice") && lines.some((l) => l.includes(`For each ${singularWord(sacFor[1]!)} sacrificed this way, `) || l.includes(` for each ${singularWord(sacFor[1]!)} sacrificed this way.`) || (sacFor[1] === "creatures" && l.includes(", where X is the total power of the sacrificed creatures.")))) {
      const spec = parseTargetPhrase(singularWord(sacFor[1]!));
      if (spec?.kind !== "object" || (sacFor[1] === "creatures" ? spec.subtypes?.length || spec.types?.length !== 1 || spec.types[0] !== "Creature" : !spec.subtypes?.length) || spec.controller) out.unsupported.push(raw);
      else {
        (out.additionalCosts ??= []).push({ kind: "sacrifice", filter: { ...spec, text: singularWord(sacFor[1]!) }, n: 0, x: true, optional: true });
        costSacrificedX = singularWord(sacFor[1]!);
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
    // "As an additional cost to cast this spell, you may blight 1", "you may behold a Dragon" (CR 601.2b, 701.68a,
    // 701.4a): an optional additional cost, chosen and paid like a kicker cost with no mana (CompiledCard.kicker.optional),
    // which isn't kicker for other cards. Not with no creature to blight (CR 701.68b) or nothing to behold.
    // Undergrowth: "As an additional cost to cast this spell, you may pay {2}{R}": the same with mana, paid like a kicker cost.
    // Taste of Paradise: "you may pay {1}{G} any number of times": the same, any number of times, like multikicker (CR
    // 702.33c) but not kicker; "for each additional {1}{G} you paid" reads as "for each time ~ was kicked".
    const mayPay = /^As an additional cost to cast ~, you may pay ((?:\{[^}]+\})+)( any number of times)?\.$/.exec(line);
    if (mayPay) {
      if (out.kicker || !plainMana(mayPay[1]!)) out.unsupported.push(raw);
      else out.kicker = { costs: [mayPay[1]!], text: `pay ${mayPay[1]}${mayPay[2] ?? ""}`, optional: true, ...(mayPay[2] ? { multi: true } : {}) };
      continue;
    }
    // Voltage Surge: "you may sacrifice an artifact", the same (CR 601.2b), whatever the artifact was.
    const mayCost = /^As an additional cost to cast ~, you may (blight \d+|sacrifice an? (?:artifact|creature|land|enchantment)|behold an? [A-Z][a-z]+(?: creature)?|reveal an? ([A-Z][a-z]+) card from your hand)\.$/.exec(line);
    if (mayCost) {
      const cost = parseAdditionalCost(mayCost[1]!);
      // The reveal cycle: what it says it depends on ("if you revealed a Dragon card or controlled a Dragon as you cast
      // ~", read as kicked above) is also true with a Dragon you control as you cast it.
      const st = mayCost[2] && subtypeSet(mayCost[2]) ? mayCost[2] : undefined;
      if (!cost || out.kicker || (mayCost[2] && !st)) out.unsupported.push(raw);
      else out.kicker = { costs: [""], extraCosts: [cost], text: mayCost[1]!, optional: true, ...(st ? { ifControl: { kind: "object" as const, subtypes: [st], controller: "you" as const, text: `${st} you control` } } : {}) };
      continue;
    }
    // Soul Immolation: "As an additional cost to cast this spell, blight X. X can't be greater than the greatest toughness
    // among creatures you control.": X announced as it's cast, no more than that toughness then (CR 601.2b).
    const blightX = /^As an additional cost to cast (?:this spell|~), blight X\. X can't be greater than the greatest toughness among creatures you control\.$/.exec(line);
    if (blightX && isSpell && !parseManaCost(d.manaCost).hasX) {
      const cost = parseAdditionalCost("blight X", true);
      if (!cost) out.unsupported.push(raw);
      else {
        (out.additionalCosts ??= []).push(cost);
        out.xMaxGreatestToughness = true;
      }
      continue;
    }
    // "As an additional cost to cast this spell, sacrifice a creature." (CR 601.2b, 601.2f-h)
    const extra = /^As an additional cost to cast (?:this spell|~), (.+)\.$/.exec(line);
    // Kaervek's Spite: "sacrifice all permanents you control and discard your hand": two costs with nothing to choose, paid
    // as it's cast (CR 601.2h; rulings: once, not any number of times). Spells only.
    if (extra?.[1] === "sacrifice all permanents you control and discard your hand" && !d.types.some((t) => t !== "Instant" && t !== "Sorcery")) {
      (out.additionalCosts ??= []).push({ kind: "sacrificeAll" }, { kind: "discardHand" });
      continue;
    }
    // Soulblast: "sacrifice all creatures you control" (CR 601.2h): every one, as they are, whatever their number (none
    // too); "the total power of the sacrificed creatures" counts them as they last existed (CR 608.2h). Spells only.
    if (extra?.[1] === "sacrifice all creatures you control" && !d.types.some((t) => t !== "Instant" && t !== "Sorcery") && lines.some((l) => l.includes(" equal to the total power of the sacrificed creatures."))) {
      (out.additionalCosts ??= []).push({ kind: "sacrificeAll", creatures: true });
      costSacrificedX = "creature";
      continue;
    }
    if (extra) {
      const cost = parseAdditionalCost(extra[1]!, true);
      const or = cost ? null : parseCostOr(extra[1]!);
      // Ruthless Disposal: "discard a card and sacrifice a creature": two costs, both paid (CR 601.2h).
      const both = cost || or ? null : /^(discard .+?) and (sacrifice .+)$/.exec(extra[1]!);
      const pair = both ? [parseAdditionalCost(both[1]!), parseAdditionalCost(both[2]!)] : null;
      if (pair?.[0] && pair[1]) (out.additionalCosts ??= []).push(pair[0], pair[1]);
      else if (cost) (out.additionalCosts ??= []).push(cost);
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
    // Realmwright: the same choice on a creature, for "Lands you control are the chosen type in addition to their other types."
    // Dream Leash, Enthralling Hold: "You can't choose an untapped permanent (creature) as this spell's target as you cast
    // it." Only the choice as it's cast (CR 601.2c): it still resolves if the target untaps, and an Aura put onto the
    // battlefield or moved needn't go on a tapped one (rulings, CR 303.4f).
    const leash = /^You can't choose an untapped (permanent|creature) as ~'s target as you cast it\.$/.exec(line);
    if (leash && d.subtypes.includes("Aura") && new RegExp(`^Enchant ${leash[1]}$`, "m").test(d.oracleText ?? "")) {
      out.castTargetTapped = true;
      continue;
    }
    // Traveler's Cloak: "As this Aura enters, choose a land type." for "Enchanted creature has landwalk of the chosen type.":
    // any land type, basic or not (CR 205.3i, rulings), kept as Chosen.landType.
    if (line === "As ~ enters, choose a land type." && lines.includes("Enchanted creature has landwalk of the chosen type.") && !out.entersChoose?.length) {
      out.entersChoose = [{ what: "landType" }];
      continue;
    }
    // Illusionary Terrain: "As ~ enters, choose two basic land types." then "Basic lands of the first chosen type are the
    // second chosen type.": two different types (Chosen.landTypes, in order); basic lands of the first lose their land
    // types and the abilities from their rules text and get the second, with its mana ability (CR 305.7). Snow stays (rulings).
    if (line === "As ~ enters, choose two basic land types." && lines.includes("Basic lands of the first chosen type are the second chosen type.") && !out.entersChoose?.length) {
      out.entersChoose = [{ what: "basicLandType", many: true }, { what: "basicLandType", many: true }];
      continue;
    }
    if (line === "Basic lands of the first chosen type are the second chosen type." && out.entersChoose?.filter((c) => c.what === "basicLandType" && c.many).length === 2) {
      out.statics.push({ affects: { kind: "filter", types: ["Land"], spec: { kind: "object", types: ["Land"], supertypes: ["Basic"], notTypes: [], notColors: [], chosen: "landTypeAt", orderIndex: 0, text: "basic lands of the first chosen type" } }, mods: [{ kind: "setLandTypes", subtypes: [], chosenIndex: 1 }], text: raw });
      continue;
    }
    // Convincing Mirage, Phantasmal Terrain: the same choice on an Aura, for "Enchanted land is the chosen type."
    if (line === "As ~ enters, choose a basic land type." && (d.types.includes("Land") || lines.includes("Lands you control are the chosen type in addition to their other types.") || (d.subtypes.includes("Aura") && lines.includes("Enchanted land is the chosen type."))) && !out.entersChoose?.length) {
      out.entersChoose = [{ what: "basicLandType" }];
      continue;
    }
    // Realmwright: "Lands you control are the chosen type in addition to their other types.": the basic land type chosen as
    // it entered, added in the type-changing layer (CR 613.1d), with that type's mana ability (CR 305.7); none if none was
    // chosen.
    if (line === "Lands you control are the chosen type in addition to their other types." && out.entersChoose?.some((c) => c.what === "basicLandType")) {
      out.statics.push({ affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenLandType: true }], text: raw });
      continue;
    }
    // Convincing Mirage: "Enchanted land is the chosen type.": that basic land type instead of its others, with that type's
    // mana ability and none of the abilities from its rules text (CR 305.7, rulings); its supertypes (basic, legendary,
    // snow) and name stay.
    if (line === "Enchanted land is the chosen type." && out.enchant && out.entersChoose?.some((c) => c.what === "basicLandType")) {
      out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "setLandTypes", subtypes: [CHOSEN_LAND_TYPE] }], text: raw });
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
    // Etching of Kumano: "If a creature dealt damage this turn by a source you controlled would die, exile it instead":
    // any source, controlled by ~'s controller as it dealt the damage.
    const kumano = /^If a creature dealt damage by (~|enchanted creature) this turn would die, exile it instead\.$/.exec(line) ?? /^If a creature dealt damage this turn by (a source you controlled) would die, exile it instead\.$/.exec(line);
    if (kumano) {
      out.exileWhatItDamaged = kumano[1] === "~" ? "self" : kumano[1] === "a source you controlled" ? "yours" : "attached";
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
    // Ravenous Slime: "If a creature an opponent controls would die, instead exile it and put a number of +1/+1 counters
    // equal to that creature's power on ~": one replacement (CR 614.1a), the power as it last existed (rulings).
    if (line === "If a creature an opponent controls would die, instead exile it and put a number of +1/+1 counters equal to that creature's power on ~.") {
      const filter = parseTargetPhrase("creature an opponent controls");
      if (filter?.kind !== "object") out.unsupported.push(raw);
      else out.exileInsteadOfDying = { filter, countersPower: true };
      continue;
    }
    // Ravenloft Adventurer: "If a creature an opponent controls would die, instead exile it and put a hit counter on it":
    // one replacement (CR 614.1a), the counter on the card in exile (CR 122.1).
    const insteadCounter = /^If a creature an opponent controls would die, instead exile it and put an? ([a-z]+) counter on it\.$/.exec(line);
    if (insteadCounter) {
      const filter = parseTargetPhrase("creature an opponent controls");
      if (filter?.kind !== "object") out.unsupported.push(raw);
      else out.exileInsteadOfDying = { filter, counter: insteadCounter[1]! };
      continue;
    }
    // Nemata, Primeval Warden: "If a creature an opponent controls would die, exile it instead. When you do, create a 1/1
    // green Saproling creature token.": the replacement (CR 614.1a), and a reflexive trigger when it's applied (CR 603.12).
    // Valentin, Dean of the Vein: "... When you do, you may pay {2}. If you do, create a 1/1 black and green Pest creature
    // token with "When this token dies, you gain 1 life."": the same, its text ending in a quoted ability.
    const exileWhen = /^If an? (.+?) would die, exile it instead\. When you do, (.+?)(\.|\.")$/.exec(line);
    if (exileWhen) {
      const filter = parseTargetPhrase(exileWhen[1]!);
      const body = parseBody(`${capital(exileWhen[2]!)}${exileWhen[3]}`, {});
      if (filter?.kind !== "object" || filter.combat || !body || body.targets.length || /\b(?:it|that creature|that card)\b/.test(exileWhen[2]!)) out.unsupported.push(raw);
      else out.exileInsteadOfDying = { filter, reflexive: body };
      continue;
    }
    // Mossbridge Troll: "If ~ would be destroyed, regenerate it": a replacement effect that regenerates it each time
    // (CR 614.1a, 701.19a), a shield that's never used up (rulings); "can't be regenerated" still stops it (701.19c).
    if (/^If ~ would be destroyed, regenerate it\.$/.test(line)) {
      out.regeneratesInsteadOfDestroyed = true;
      continue;
    }
    // Crackling Emergence, Harmonious Emergence: "If enchanted land would be destroyed, instead sacrifice ~ and that land
    // gains indestructible until end of turn." A replacement of the destruction (CR 614.1a), whatever destroys it, lethal
    // damage too; not a sacrifice of the land (rulings).
    if (/^If enchanted land would be destroyed, instead sacrifice ~ and that land gains indestructible until end of turn\.$/.test(line) && out.enchant?.kind === "object") {
      out.sacrificeInsteadOfEnchantedDestroyed = true;
      continue;
    }
    if (line === "If ~ would die, return it to its owner's hand instead. Until that player's next turn, that player plays with that card revealed in their hand and can't play it.") {
      out.rebirthToHand = true;
      continue;
    }
    if (line === "Each opponent can't venture into the dungeon more than once each turn.") {
      out.ventureOncePerTurn = true;
      continue;
    }
    // Coalition Honor Guard, Standard Bearer, Coalition Flag: the Flagbearer targeting rule (see flagbearerProblem).
    if (line === "While an opponent is choosing targets as part of casting a spell they control or activating an ability they control, that player must choose at least one Flagbearer on the battlefield if able.") {
      out.flagbearerRule = true;
      continue;
    }
    // Necromancer's Magemark: "If a creature you control that's enchanted would die, return it to its owner's hand instead."
    if (line === "If a creature you control that's enchanted would die, return it to its owner's hand instead.") {
      const filter = parseTargetPhrase("creature you control that's enchanted");
      if (filter?.kind === "object") out.handInsteadOfDying = { ...filter, text: "creature you control that's enchanted" };
      else out.unsupported.push(raw);
      continue;
    }
    const libraryDies = /^If ~ would die, put it on (top|the bottom) of its owner's library instead\.$/.exec(line);
    if (libraryDies) {
      out.libraryInsteadOfDying = libraryDies[1] === "top" ? "top" : "bottom";
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
    // Wheel of Sun and Moon: an Aura with enchant player (CR 702.5d) whose replacement effect sends cards headed to that
    // player's graveyard to the bottom of their library.
    if (line === "If a card would be put into enchanted player's graveyard from anywhere, instead that card is revealed and put on the bottom of that player's library." && d.subtypes.includes("Aura") && /^Enchant player$/m.test(d.oracleText)) {
      out.graveyardToLibraryBottom = true;
      continue;
    }
    // Samurai of the Pale Curtain: "If a permanent would be put into a graveyard, exile it instead": any permanent, a token
    // too, going from the battlefield to any graveyard (CR 614.1a, 110.1).
    if (line === "If a permanent would be put into a graveyard, exile it instead." && !out.graveyardExile) {
      out.graveyardExile = { whose: "any", tokens: true, permanents: true };
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
    // Kíli the Resourceful: "As long as you have an enduring story, you may pay {0} ...": only while that's so.
    const firstEquip = /^(?:As long as ([^,]+), y|Y)ou may pay \{0\} rather than pay the equip cost of the first equip ability you activate (during each of your turns|each turn)\.$/.exec(line);
    const firstEquipWhile = firstEquip?.[1] ? parseActivateCondition(firstEquip[1]) : undefined;
    if (firstEquip && firstEquipWhile !== null) {
      out.firstEquipFree = firstEquip[2] === "each turn" ? "eachTurn" : "yourTurn";
      if (firstEquipWhile) out.firstEquipFreeWhile = firstEquipWhile;
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
    // Edgar, King of Figaro: "The first time you flip one or more coins each turn, those coins come up heads and you win
    // those flips." (a replacement of the results, CR 705.3; rulings: whatever the coins would have shown, and a won flip
    // even for one that would have no winner).
    if (line === "The first time you flip one or more coins each turn, those coins come up heads and you win those flips.") {
      out.firstFlipsHeads = true;
      continue;
    }
    // Titania, Nature's Force: "You may play Forests from your graveyard." Land cards with that basic land type (CR 305.6).
    const typedYard = /^You may play (Plains|Islands|Swamps|Mountains|Forests) from your graveyard\.$/.exec(line);
    if (typedYard) {
      (out.landsFromGraveyardOf ??= []).push(typedYard[1] === "Plains" ? "Plains" : typedYard[1]!.slice(0, -1));
      continue;
    }
    // Hazezon, Shaper of Sand: "You may play Desert lands from your graveyard." Land cards with that subtype (CR 205.3i).
    const nonbasicYard = /^You may play (Desert|Gate|Cave|Sphere|Town) lands from your graveyard\.$/.exec(line);
    if (nonbasicYard) {
      (out.landsFromGraveyardOf ??= []).push(nonbasicYard[1]!);
      continue;
    }
    // Wrenn and Realmbreaker's emblem: "You may play lands and cast permanent spells from your graveyard." Any number,
    // paying their mana costs (a card without one can't be cast this way, CR 118.6), following the usual timing rules.
    // Zask, Skittering Swarmlord: "You may play lands and cast Insect spells from your graveyard": cards with that
    // creature type (a changeling's too, CR 702.73a).
    // Yawgmoth's Agenda: "You may play lands and cast spells from your graveyard": any spell card, the same way.
    const permYard = /^You may (play lands and )?cast (?:(permanent|[A-Z][a-z]+) )?spells from your graveyard\.$/.exec(line);
    const yardFilter = permYard && parseTargetPhrase(`${permYard[2] ?? ""} card from a graveyard`.trim());
    if (permYard && yardFilter?.kind === "card" && (!permYard[2] || permYard[2] === "permanent" || CREATURE_TYPES.has(permYard[2]!))) {
      if (permYard[1]) out.landsFromGraveyard = true;
      const { owner: _, ...f } = yardFilter;
      (out.graveyardGrants ??= []).push({ filter: { ...f, text: permYard[2] ? `${permYard[2]} cards` : "cards" }, way: { kind: "permission", costs: [], exile: false } });
      continue;
    }
    // Noctis, Prince of Lucis: "You may cast artifact spells from your graveyard by paying 3 life in addition to paying
    // their other costs. If you cast a spell this way, that artifact enters with a finality counter on it." Any number,
    // paying all costs and following the timing rules (rulings), the artifact entering with the counter (CR 614.1c).
    const lifeYard = /^You may cast ([a-z]+) spells from your graveyard by paying (\d+) life in addition to paying their other costs\. If you cast a spell this way, that \1 enters with an? ([a-z]+) counter on it\.$/.exec(line);
    if (lifeYard) {
      const f = parseTargetPhrase(`${lifeYard[1]} card from a graveyard`);
      if (f?.kind !== "card" || !f.types?.length) out.unsupported.push(raw);
      else {
        const { owner: _, ...rest } = f;
        (out.graveyardGrants ??= []).push({ filter: { ...rest, text: `${lifeYard[1]} cards` }, way: { kind: "permission", costs: [{ kind: "payLife", n: Number(lifeYard[2]) }], exile: false, entersWith: { counter: lifeYard[3]!, n: 1 } } });
      }
      continue;
    }
    // Hades, Sorcerer of Eld: "During your turn, you may play cards from your graveyard." Lands (each with a land play,
    // CR 305.2) and spells of any card type, paying all costs and following the timing rules (rulings), during its
    // controller's turn only.
    if (line === "During your turn, you may play cards from your graveyard." && !out.landsFromGraveyardIf) {
      const f = parseTargetPhrase("card from a graveyard");
      if (f?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...rest } = f;
        out.landsFromGraveyardIf = { kind: "yourTurn" };
        (out.graveyardGrants ??= []).push({ filter: { ...rest, text: "cards" }, way: { kind: "permission", costs: [], exile: false }, yourTurn: true });
      }
      continue;
    }
    // Leonardo, Sewer Samurai: "During your turn, you may cast creature spells with power or toughness 1 or less from your
    // graveyard. If you cast a spell this way, that creature enters with a finality counter on it." Any number, paying all
    // costs and following the timing rules (rulings), during its controller's turn only; the creature enters with the
    // counter (CR 614.1c), as with Noctis, Prince of Lucis.
    if (line === "During your turn, you may cast creature spells with power or toughness 1 or less from your graveyard. If you cast a spell this way, that creature enters with a finality counter on it.") {
      const f = parseTargetPhrase("creature card with power or toughness 1 or less from a graveyard");
      if (f?.kind !== "card" || f.anyOf?.length !== 2) out.unsupported.push(raw);
      else {
        const { owner: _, ...rest } = f;
        (out.graveyardGrants ??= []).push({ filter: { ...rest, text: "creature cards with power or toughness 1 or less" }, way: { kind: "permission", costs: [], exile: false, entersWith: { counter: "finality", n: 1 } }, yourTurn: true });
      }
      continue;
    }
    // Jaya Ballard's emblem: "You may cast instant and sorcery spells from your graveyard. If a spell cast this way would be
    // put into your graveyard, exile it instead." Any number, paying their costs and following the usual timing rules; a
    // spell cast this way that's countered goes to exile too (CR 614.1a), one that leaves the stack another way doesn't.
    if (line === "You may cast instant and sorcery spells from your graveyard. If a spell cast this way would be put into your graveyard, exile it instead.") {
      const f = parseTargetPhrase("instant or sorcery card from a graveyard");
      if (f?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...rest } = f;
        (out.graveyardGrants ??= []).push({ filter: { ...rest, text: "instant and sorcery cards" }, way: { kind: "permission", costs: [], exile: false, exileIfToGraveyard: true } });
      }
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
    // Falkenrath Gorger: "Each Vampire creature card you own that isn't on the battlefield has madness. The madness cost is
    // equal to its mana cost." (CR 702.35a): only a card being discarded from a hand uses it.
    const madnessGrant = /^Each ([A-Z][a-z]+ creature|[a-z]+) card you own that isn't on the battlefield has madness\. The madness cost is equal to its mana cost\.$/.exec(line);
    if (madnessGrant) {
      const filter = parseTargetPhrase(`${madnessGrant[1]} card from a graveyard`);
      if (filter?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.madnessGrants ??= []).push({ ...f, text: `${madnessGrant[1]} cards` });
      }
      continue;
    }
    // Niv-Mizzet, Supreme: "Each instant and sorcery card in your graveyard that's exactly two colors has jump-start": cast
    // from your graveyard for its mana cost and a card discarded, then exiled (CR 702.133a), only an instant or sorcery.
    const jumpGrant = /^Each ([a-z]+(?: and [a-z]+)?) card in your graveyard( that's exactly two colors)? has jump-start\.$/.exec(line);
    if (jumpGrant) {
      const filter = parseTargetPhrase(`${jumpGrant[1]!.replace(/ and /g, " or ")} card${jumpGrant[2] ?? ""} from a graveyard`);
      if (filter?.kind !== "card" || !filter.types?.length || !filter.types.every((t) => t === "Instant" || t === "Sorcery")) out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${jumpGrant[1]} cards${jumpGrant[2] ?? ""}` }, way: { kind: "jumpStart", costs: [{ kind: "discard", n: 1 }], exile: true } });
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
    // The Eighth Doctor: "Once during each of your turns, you may play a historic land or cast a historic permanent spell
    // from your graveyard. If you do, it gains "If this permanent would leave the battlefield, exile it instead of putting
    // it anywhere else."": Serra Paragon's one use each turn for either, only for a historic card (an artifact, legendary
    // or Saga, CR 700.6), and the permanent it becomes has that replacement effect of its own for good (CR 614.1a, 400.7).
    if (/^Once during each of your turns, you may play a historic land or cast a historic permanent spell from your graveyard\. If you do, it gains "If (?:this permanent|~) would leave the battlefield, exile it instead of putting it anywhere else\."$/.test(line)) {
      const filter = parseTargetPhrase("historic permanent card from a graveyard");
      const lands = parseTargetPhrase("historic land card from a graveyard");
      if (filter?.kind !== "card" || lands?.kind !== "card" || !filter.anyOf || !lands.anyOf) out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        const { owner: _o, ...l } = lands;
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: "historic permanent cards" }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], gains: "If this permanent would leave the battlefield, exile it instead of putting it anywhere else." });
        out.landFromGraveyardOnce = "shared";
        out.landFromGraveyardFilter = { ...l, text: "historic land cards" };
      }
      continue;
    }
    // Arcade Gannon: "Once during each of your turns, you may cast an artifact or Human spell from your graveyard with mana
    // value less than or equal to the number of quest counters on ~": Karador's once-each-turn permission (rulings: costs
    // paid, timing followed, another permission doesn't use it up, a new Arcade Gannon is a new permission), the spell's
    // mana value with its X (CR 202.3e) against the counters on this permanent as it's cast.
    const gannon = /^Once during each of your turns, you may cast an? (artifact or Human) spell from your graveyard with mana value less than or equal to (the number of [a-z]+ counters on ~)\.$/.exec(line);
    if (gannon) {
      const filter = parseTargetPhrase(`${gannon[1]} card from a graveyard`);
      const count = parseCount(gannon[2]!, null);
      if (filter?.kind !== "card" || filter.manaValue || filter.bound || !count) out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${gannon[1]} cards` }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], maxMvCount: count });
      }
      continue;
    }
    // Kagha, Shadow Archdruid: "Once during each of your turns, you may play a land or cast a permanent spell from among
    // cards in your graveyard that were put there from your library this turn": one use each turn for either (as Serra
    // Paragon's), only for a card that came from the library this turn. Banon, the Returners' Leader: "... cast a
    // creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this
    // turn". Rulings: all costs are paid and timing rules followed; another permission doesn't use this one up.
    const arrivedYard = /^Once during each of your turns, you may (play a land or )?cast an? (permanent|creature) spell from among cards in your graveyard that were put there from (your library|anywhere other than the battlefield) this turn\.$/.exec(line);
    if (arrivedYard) {
      const filter = parseTargetPhrase(`${arrivedYard[2]} card from a graveyard`);
      if (filter?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        const arrived = arrivedYard[3] === "your library" ? ("fromLibrary" as const) : ("notFromBattlefield" as const);
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${arrivedYard[2]} cards` }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], arrived });
        if (arrivedYard[1]) {
          if (arrived !== "fromLibrary") out.unsupported.push(raw);
          out.landFromGraveyardOnce = "shared";
          out.landFromGraveyardArrived = "fromLibrary";
        }
      }
      continue;
    }
    // Liesa, Shroud of Dusk: the commander tax (CR 903.8) paid as life, never with mana (rulings; game.ts commanderTaxLife).
    if (line === "Rather than pay {2} for each previous time you've cast ~ from the command zone this game, pay 2 life that many times.") {
      out.commanderTaxAsLife = true;
      continue;
    }
    // Raul, Trouble Shooter: "Once during each of your turns, you may cast a spell from among cards in your graveyard that
    // were milled this turn": one use each turn, any spell (a land card can't be cast, CR 305.9), only a card a mill put
    // there this turn (rulings: not one put there from the library without the word "mill"); costs paid and timing
    // followed as usual, and another permission doesn't use this one up.
    if (line === "Once during each of your turns, you may cast a spell from among cards in your graveyard that were milled this turn.") {
      const filter = parseTargetPhrase("nonland card from a graveyard");
      if (filter?.kind !== "card") out.unsupported.push(raw);
      else {
        const { owner: _, ...f } = filter;
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: "cards milled this turn" }, way: { kind: "turnPermission", costs: [], exile: false }, yourTurn: true, once: [""], arrived: "milled" });
      }
      continue;
    }
    // "Once during each of your turns, you may cast a creature spell from your graveyard" (Karador, Gisa and Geralf): a
    // permission used once each turn (rulings: the spell's costs are paid, its timing rules followed). Muldrotha: "During
    // each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard."
    // Kess: "If a spell cast this way would be put into your graveyard, exile it instead."
    // Edgar, Master Machinist: "If you cast a spell this way, that artifact enters tapped" (the permanent it becomes).
    // Exploration Broodship: "... from your graveyard by sacrificing a land in addition to paying its other costs": an
    // additional cost of that permission (CR 601.2f-h), paid with the spell's other costs.
    const onceYard = /^Once during each of your turns, you may cast an? (.+?) spell( with mana value \d+ or less)? from your graveyard( by (?:sacrificing|exiling|discarding|tapping) .+? in addition to paying its other costs)?\.( If a spell cast this way would be put into your graveyard, exile it instead\.)?( If you cast a spell this way, that (?:artifact|creature|permanent) enters tapped\.)?$/.exec(line);
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
        (out.graveyardGrants ??= []).push({ filter: { ...f, text: `${onceYard?.[1] ?? "permanent"} cards` }, way: { kind: "turnPermission", costs: permitCost ? [permitCost] : [], exile: !!onceYard?.[4] }, yourTurn: true, once, ...(maxMv !== undefined ? { maxMv } : {}), ...(onceYard?.[5] ? { entersTapped: true as const } : {}) });
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
    const croak = /^You may play lands and cast spells from among cards you own in exile with ([a-z]+) counters on them\.$/.exec(line);
    if (croak) {
      if (out.playOwnCountered) out.unsupported.push(raw);
      else out.playOwnCountered = croak[1]!;
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
    // Bane Alley Broker: "You may look at cards exiled with ~.": the cards its face-down exile ability exiled (CR 406.3, 607.2a).
    if (line === "You may look at cards exiled with ~.") {
      if (lookLinked) out.unsupported.push(raw);
      else lookLinked = raw;
      continue;
    }
    // Pick Up the Pace: "You may play cards exiled with ~ as long as you attacked this turn": whenever that holds, with the
    // usual costs and timing (playing a card is playing a land or casting a spell, CR 305.1, 601.2).
    const playAsLong = /^You may play cards exiled with ~ as long as (.+)\.$/.exec(line);
    if (playAsLong) {
      const cond = parseStaticCondition(playAsLong[1]!, { affects: { kind: "self" }, mods: [], text: line });
      if (!cond || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else out.playLinkedWhile = { kind: "allOf", conds: [cond] };
      continue;
    }
    // Nightveil Specter: "You may play lands and cast spells from among cards exiled with ~": always, with the usual
    // costs and timing (rulings), no other mana (an empty allOf always holds).
    if (line === "You may play lands and cast spells from among cards exiled with ~.") {
      if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else out.playLinkedWhile = { kind: "allOf", conds: [] };
      continue;
    }
    // Intellect Devourer: "You may play lands and cast spells from among cards exiled with ~. If you cast a spell this way,
    // you may spend mana as though it were mana of any color to cast it.": the same, with any mana for a spell (CR 609.4b),
    // its usual timing (rulings).
    if (line === "You may play lands and cast spells from among cards exiled with ~. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it.") {
      if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedAnyType = true);
      continue;
    }
    // Rona, Disciple of Gix: "You may cast spells from among cards exiled with ~": the same, spells only (not lands).
    if (line === "You may cast spells from among cards exiled with ~.") {
      if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedCastOnly = true);
      continue;
    }
    // Intrepid Paleontologist: "You may cast Dinosaur creature spells from among cards you own exiled with ~. If you cast a
    // spell this way, that creature enters with a finality counter on it.": only those cards, the usual costs and timing
    // (rulings), while it's under your control as the casting begins (rulings); the creature enters with the counter (CR
    // 614.1c).
    const ownLinked = /^You may cast ([A-Za-z ]+?) spells from among cards you own exiled with ~\. If you cast a spell this way, that creature enters with an? (finality|\+1\/\+1) counter on it\.$/.exec(line);
    if (ownLinked) {
      const f = parseSearchFilter(`${ownLinked[1]!} card`);
      if (!f || !f.types?.includes("Creature") || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else (out.playLinkedWhile = { kind: "allOf", conds: [] }), (out.playLinkedCastOnly = true), (out.playLinkedOnly = { filter: f, own: true, entersWith: { counter: ownLinked[2]!, n: 1 } });
      continue;
    }
    // Azula, Cunning Usurper: "During your turn, you may cast cards exiled with ~ and you may cast them as though they had
    // flash. Mana of any type can be spent to cast those spells." Spells only, during your turn, at instant speed (CR
    // 702.8a), any type of mana (CR 609.4b), its other costs paid as usual (rulings).
    if (line === "During your turn, you may cast cards exiled with ~ and you may cast them as though they had flash. Mana of any type can be spent to cast those spells.") {
      if (out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else (out.playLinkedWhile = { kind: "allOf", conds: [{ kind: "yourTurn" }] }), (out.playLinkedCastOnly = true), (out.playLinkedFlash = true), (out.playLinkedAnyType = true);
      continue;
    }
    // Null Summoner: "Threshold — As long as there are seven or more cards in your graveyard, you may cast the exiled card,
    // and mana of any type can be spent to cast that spell.": the card its enters ability exiled from a hand (CR 607.2a),
    // while the condition holds, as a spell with its usual timing, any type of mana (CR 609.4b).
    const castExiledWhile = /^As long as (there are seven or more cards in your graveyard), you may cast the exiled card, and mana of any type can be spent to cast that spell\.$/.exec(line);
    if (castExiledWhile) {
      const cond = parseStaticCondition(castExiledWhile[1]!, { affects: { kind: "self" }, mods: [], text: line });
      if (!cond || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
      else (out.playLinkedWhile = { kind: "allOf", conds: [cond] }), (out.playLinkedCastOnly = true), (out.playLinkedAnyType = true), castsTheExiled.add(out);
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
    // Arboria: a rule for every creature attacking a player (CR 508.1c), not their planeswalkers (rulings).
    // Pramikon, Sky Rampart: every player's attacks, by the direction chosen as it entered (attackProblem).
    if (line === "Each player may attack only the nearest opponent in the chosen direction and planeswalkers controlled by that opponent." && out.entersChoose?.some((c) => c.what === "direction")) {
      out.attackNearestChosen = true;
      continue;
    }
    if (line === "Creatures can't attack a player unless that player cast a spell or put a nontoken permanent onto the battlefield during their last turn.") {
      out.attackOnlyActive = true;
      continue;
    }
    // Lens of Clarity, Found Footage: "You may look at the top card of your library and at face-down creatures you don't
    // control any time", "You may look at face-down creatures your opponents control any time": information for its
    // controller only, any time (rulings; in this game every other player is an opponent).
    const lookDown = /^You may look at (the top card of your library and at )?face-down creatures (?:you don't control|your opponents control) any time\.$/.exec(line);
    if (lookDown) {
      if (out.lookFaceDown || (lookDown[1] && out.lookTop)) out.unsupported.push(raw);
      else {
        out.lookFaceDown = true;
        if (lookDown[1]) out.lookTop = true;
      }
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
    // The Fourth Doctor: "Would You Like A...? — Once each turn, you may play a historic land or cast a historic spell from
    // the top of your library. When you do, create a Food token." (FromTop.whenDo, a reflexive trigger, CR 603.12).
    const whenDoTop = /^(?:[^—]+ — )?(Once each turn, you may .+? from the top of your library)\. When you do, ([a-z].+)$/.exec(line);
    if (whenDoTop) {
      const t = parseFromTop(whenDoTop[1]!);
      const body = parseBody(`${whenDoTop[2]![0]!.toUpperCase()}${whenDoTop[2]!.slice(1)}`);
      if (!t?.once || !body || body.targets.length || !body.effects.length) out.unsupported.push(raw);
      else (out.fromTop ??= []).push({ ...t, whenDo: body });
      continue;
    }
    // Bolas's Citadel: "... If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."
    const lifeTop = /^(.+?)\. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost\.$/.exec(line);
    // Thundermane Dragon: "... If you cast a creature spell this way, it gains haste until end of turn."
    const hasteTop = !lifeTop && /^(.+?)\. If you cast a creature spell this way, it gains haste until end of turn\.$/.exec(line);
    // Mikey & Don, Party Planners: "... If you cast a creature spell this way, that creature enters with an additional
    // +1/+1 counter on it."
    const counterTop = !lifeTop && !hasteTop && /^(.+?)\. If you cast a creature spell this way, that creature enters with an additional \+1\/\+1 counter on it\.$/.exec(line);
    // Elsha of the Infinite: "... If you cast a spell this way, you may cast it as though it had flash." (CR 702.8a): any
    // time it could cast an instant, cast with this permission, paying all its costs (rulings).
    const flashTop = !lifeTop && !hasteTop && !counterTop && /^(.+?)\. If you cast a spell this way, you may cast it as though it had flash\.$/.exec(line);
    // Into the Pit: "You may cast spells from the top of your library by sacrificing a nonland permanent in addition to
    // paying their other costs.": a cost of each spell cast with this permission (CR 601.2f-h), any nonland permanent you
    // control, Into the Pit too; the usual timing (rulings).
    const sacTop = !lifeTop && !hasteTop && !counterTop && !flashTop && /^(You may cast (?:.+?) from the top of your library) by sacrificing an? ([a-z ]+?) in addition to paying their other costs\.$/.exec(line);
    const sacFilter = sacTop ? parseTargetPhrase(`${sacTop[2]!} you control`) : undefined;
    const top = lifeTop
      ? ((t) => (t?.spells ? { ...t, payLife: true as const } : t && null))(parseFromTop(lifeTop[1]!))
      : hasteTop
        ? ((t) => (t?.spells && !t.lands && !t.once ? { ...t, haste: "endOfTurn" as const } : t && null))(parseFromTop(hasteTop[1]!))
        : counterTop
          ? ((t) => (t?.spells && !t.once ? { ...t, creatureCounter: true as const } : t && null))(parseFromTop(counterTop[1]!))
          : flashTop
            ? ((t) => (t?.spells && !t.lands && !t.once ? { ...t, flash: true as const } : t && null))(parseFromTop(flashTop[1]!))
            : sacTop
              ? ((t) => (t?.spells && !t.lands && !t.once && sacFilter?.kind === "object" ? { ...t, costs: [{ kind: "sacrifice" as const, filter: sacFilter, n: 1 }] } : t && null))(parseFromTop(sacTop[1]!))
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
    // Thranduil's Company: "As long as you control another Elf, you may play an additional land on each of your turns."
    // (CR 305.2a): one more while the condition holds.
    const landIf = /^As long as (.+), you may play an additional land on each of your turns\.$/.exec(line);
    if (landIf) {
      const cond = parseStaticCondition(landIf[1]!, { affects: { kind: "self" }, mods: [], text: line });
      if (!cond) out.unsupported.push(raw);
      else out.extraLandsIf = [...(out.extraLandsIf ?? []), cond];
      continue;
    }
    if (line === "Each player may play an additional land on each of their turns.") {
      out.extraLandsEach = (out.extraLandsEach ?? 0) + 1;
      continue;
    }
    // Mirror-Mad Phantasm: "{1}{U}: ~'s owner shuffles it into their library. If that player does, they reveal cards from the
    // top of that library until a card named ~ is revealed. ...": the owner (rulings: you activate it only while you control
    // it, even if you don't own it), and the card named Mirror-Mad Phantasm whoever has the ability (rulings on Necrotic
    // Ooze); none revealed (a token or a copy shuffled in), the whole library into the graveyard (rulings).
    if (line === "{1}{U}: ~'s owner shuffles it into their library. If that player does, they reveal cards from the top of that library until a card named ~ is revealed. The player puts that card onto the battlefield and all other cards revealed this way into their graveyard.") {
      out.activated.push({
        manaCost: "{1}{U}",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        body: {
          targets: [],
          effects: [
            { type: "shuffleIntoLibrary", what: { ref: "self" } },
            { type: "if", cond: { kind: "shuffledInThisWay" }, effects: [{ type: "revealUntil", filter: { kind: "card", named: d.name, text: `card named ${d.name}` }, found: "battlefield", rest: "graveyard", who: { ref: "sourceOwner" } }] },
          ],
          text: line.slice(line.indexOf(": ") + 2),
        },
        text: line,
      });
      continue;
    }
    // The Mimeoplasm: "As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one
    // of those cards with a number of additional +1/+1 counters on it equal to the power of the other card." Two cards
    // from any graveyards, the same one too; its controller chooses which one it copies; not just one (rulings).
    if (line === "As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.") {
      out.entersAsCopy = { filter: { kind: "card", types: ["Creature"], text: "creature card in a graveyard" }, exileTwo: true };
      continue;
    }
    // Clones: "You may have ~ enter as a copy of any creature on the battlefield[, except ...]." (CR 707.5)
    // Cursed Mirror: "As ~ enters, you may have it become a copy of any creature on the battlefield until end of
    // turn, except it has haste" also becomes the copy as it enters (rulings), for the rest of the turn.
    // Vesuva: "You may have ~ enter tapped as a copy of any land on the battlefield": tapped only as a copy (rulings).
    // Superior Spider-Man: "... a copy of any creature card in a graveyard, except ... When you do, exile that card.": a
    // reflexive trigger as it enters as that copy (CR 603.12), exiling the card copied.
    const exileCopied = / When you do, exile that card\.$/.test(line);
    // Wall of Stolen Identity: "When you do, tap the copied creature and it doesn't untap during its controller's untap
    // step for as long as you control ~": a reflexive trigger as it enters as that copy (CR 603.12); the lock lasts while
    // its controller keeps controlling it, never again once it's lost (CR 611.2b, rulings).
    const tapCopiedRe = / When you do, tap the copied creature and it doesn't untap during its controller's untap step for as long as you control ~\.$/;
    const tapCopied = tapCopiedRe.test(line);
    // Protean Raider: "Raid — If you attacked this turn, you may have ~ enter as a copy of any creature on the battlefield":
    // the option only exists if you attacked with a creature this turn, as it enters (rulings).
    const raidClone = /^If you attacked this turn, you may have ~ enter as a copy of any creature on the battlefield\.$/.test(line);
    const cloneLine = raidClone ? line.replace(/^If you attacked this turn, you/, "You") : line;
    const clone = /^(?:You may have ~ enter( tapped)? as|As ~ enters, you may have it become) a copy of (?:any |an? )?(.+?)( until end of turn)?(?:, except (.+?))?\.?$/.exec(cloneLine.replace(/ When you do, exile that card\.$/, "").replace(tapCopiedRe, ""));
    if (clone) clone.splice(1, 1);
    const cloneTapped = /^You may have ~ enter tapped as/.test(line) ? { tapped: true as const } : {};
    // "You may have this creature enter as a copy of any creature card in a graveyard, except ..." (Lazotep Convert), "You
    // may have ~ enter tapped as a copy of any land card in a graveyard, except it's a Cave ..." (Echoing Deeps): a card in
    // any graveyard, by its printed characteristics.
    // Activated Sleeper: "any creature card in a graveyard that was put there from the battlefield this turn": a card that
    // died or was otherwise put there from the battlefield this turn, whoever's it is.
    const fromYard = clone && !clone[2] ? /^(creature|land) card in a graveyard( that was put there from the battlefield this turn)?$/.exec(clone[1]!) : null;
    if (clone && fromYard && !tapCopied) {
      const except = clone[3] ? parseCopyExcept(clone[3]) : undefined;
      if (except !== null && !except?.thisAbility) {
        out.entersAsCopy = { filter: { kind: "card", types: [fromYard[1] === "land" ? "Land" : "Creature"], ...(fromYard[2] ? { fromBattlefieldThisTurn: true as const } : {}), text: clone[1]! }, ...(except ? { except } : {}), ...cloneTapped, ...(exileCopied ? { exileCopied: true as const } : {}) };
        continue;
      }
    }
    // The Master, Formed Anew: "You may have ~ enter as a copy of a creature card in exile with a takeover counter on it":
    // any such card, whoever owns it, by its printed characteristics (CR 707.2, 707.5).
    const fromExile = clone && !clone[2] && !clone[3] && !exileCopied && !tapCopied ? /^creature card in exile with an? ([a-z]+) counter on it$/.exec(clone[1]!) : null;
    if (fromExile) {
      out.entersAsCopy = { filter: { kind: "card", types: ["Creature"], notTypes: [], notColors: [], exiledWithCounter: fromExile[1]!, text: clone![1]! }, ...cloneTapped };
      continue;
    }
    if (clone && !exileCopied && !/graveyard|\bcard\b/.test(clone[1]!) && !(clone[2] && line.startsWith("You may"))) {
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
        out.entersAsCopy = { filter: { ...filter, text: clone[1]! }, ...(except ? { except } : {}), ...(ifEmbalmed ? { ifEmbalmed } : {}), ...(clone[2] ? { untilEndOfTurn: true } : {}), ...cloneTapped, ...(raidClone ? { ifAttacked: true as const } : {}), ...(tapCopied ? { tapCopied: true as const } : {}) };
        continue;
      }
    }
    if (line === "Triggered abilities you control can't cause you to sacrifice or exile creature tokens you control.") {
      out.ownTriggersSpareTokens = true;
      continue;
    }
    // "The "legend rule" doesn't apply to permanents you control" (Sakashima, Mirror Box), "... to Slivers you control",
    // "The "legend rule" doesn't apply." (Mirror Gallery): CR 704.5j skips those.
    if (line === 'If there are exactly two permanents named ~ on the battlefield, the "legend rule" doesn\'t apply to them.') {
      out.noLegendRuleIfTwo = true;
      continue;
    }
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
    // Zilortha, Strength Incarnate: every check of lethal damage on your creatures uses power (CR 120.6, 704.5g, rulings).
    if (line === "Lethal damage dealt to creatures you control is determined by their power rather than their toughness.") {
      out.lethalByPower = true;
      continue;
    }
    // Maralen of the Mornsong: no player draws, for any reason (rulings); Mornsong Aria: nor gains life (CR 119.7).
    if (line === "Players can't draw cards." || line === "Players can't draw cards or gain life.") {
      out.playersCantDraw = true;
      if (line.endsWith("or gain life.")) out.cantGainLife = "all";
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
    // Karn's Sylex: costs only (rulings: a resolving spell or ability may still have players pay life; 0 can be paid).
    if (line === "Players can't pay life to cast spells or to activate abilities that aren't mana abilities.") {
      out.noLifeCosts = true;
      continue;
    }
    // Everlasting Torment: every source's damage to a creature is dealt as -1/-1 counters (CR 702.80a-b, 120.3d), from any
    // source, anywhere (rulings).
    if (line === "All damage is dealt as though its source had wither.") {
      out.allDamageWither = true;
      continue;
    }
    // Minthara, Merciless Soul: "~ has ward {X}, where X is the number of experience counters you have": ward (CR 702.21a)
    // whose {X} is counted as the payment is asked for, as the ward trigger resolves.
    const wardX = /^~ has ward \{X\}, where X is (the number of experience counters you have)\.$/.exec(line);
    if (wardX) {
      const n = parseCount(wardX[1]!, null);
      if (!n) {
        out.unsupported.push(raw);
        continue;
      }
      out.triggers.push({ event: "becomesTargetOfOpponent", body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "", generic: n }, ward: true }], text: `Ward {X}: counter that spell or ability unless its controller pays {X}, where X is ${wardX[1]}.` } });
      continue;
    }
    // Angel of Jubilation, Yasharn: costs only, of any spell or ability, mana abilities too: a resolving spell or ability may
    // still have players pay life or sacrifice (rulings); a spell or ability with such a cost can't be cast or activated.
    const noCosts = /^Players can't pay life or sacrifice (creatures|nonland permanents) to cast spells or activate abilities\.$/.exec(line);
    if (noCosts) {
      out.noLifeCosts = "all";
      out.noSacrificeCosts = noCosts[1] === "creatures" ? "creatures" : "nonland";
      continue;
    }
    if (line === "If a creature you control would explore, instead it explores, then it explores again.") {
      out.exploresTwice = true;
      continue;
    }
    if (line === "If a creature you control would explore, instead you scry 1, then that creature explores.") {
      out.scryBeforeExplore = true;
      continue;
    }
    if (line === "As ~ enters, note your life total.") {
      out.notesLifeOnEnter = true;
      continue;
    }
    if (line === "If a creature you control would connive, instead you draw a card, then that creature connives.") {
      out.conniveDrawsFirst = true;
      continue;
    }
    if (line === "Spells and abilities your opponents control can't cause you to sacrifice permanents.") {
      out.opponentsCantMakeYouSacrifice = true;
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
    // Retriever Phoenix: "As long as ~ is in your graveyard, if you would learn, you may instead return ~ to the
    // battlefield": a replacement effect of the card in its owner's graveyard (CR 614.1a, 113.6), asked as they learn.
    if (line === "As long as ~ is in your graveyard, if you would learn, you may instead return ~ to the battlefield.") {
      out.returnInsteadOfLearn = true;
      continue;
    }
    // Possessed Portal: "If a player would draw a card, that player skips that draw instead": a replacement effect (CR
    // 614.1b) on every draw, the first in a draw step too, which the drawing player orders with any other (CR 616.1).
    if (line === "If a player would draw a card, that player skips that draw instead.") {
      out.skipsAllDraws = true;
      continue;
    }
    // Living Conundrum: a replacement effect (CR 614.1b) on each of its controller's draws while their library is empty,
    // so nothing is drawn and the game isn't lost for it (CR 704.5b); asked for again for each draw (rulings: with fewer
    // cards than draws, the cards are drawn and the rest skipped).
    if (line === "If you would draw a card while your library has no cards in it, skip that draw instead.") {
      out.skipsDrawsFromEmptyLibrary = true;
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
    // Spirit of the Labyrinth: the same for every player, its controller too.
    if (line === "Each player can't draw more than one card each turn.") {
      out.playersDrawOnce = true;
      continue;
    }
    // Enhanced Surveillance: the extra cards looked at are surveilled too (rulings). Looking at them is optional, but a
    // player who looks can put each of them back on top in the same order, so they're always looked at here.
    if (line === "If you would scry a number of cards, scry that many cards plus one instead.") {
      out.scryMore = (out.scryMore ?? 0) + 1;
      continue;
    }
    if (line === "If you would scry a number of cards, draw that many cards instead.") {
      out.scryToDraw = true;
      continue;
    }
    const surveilMore = new RegExp(`^You may look at an additional ${NUM} cards each time you surveil\\.$`).exec(line);
    if (surveilMore) {
      out.surveilMore = (out.surveilMore ?? 0) + num(surveilMore[1]!);
      continue;
    }
    // Strong, the Brutish Thespian: the radiation trigger's life loss becomes a gain (CR 728.1, 614.1a; rulings: the
    // milling and the rad counters removed stay the same).
    if (line === "You gain life rather than lose life from radiation.") {
      out.radiationGains = true;
      continue;
    }
    // Bloodletter of Aclazotz (CR 614.1a): life lost to damage too (CR 120.3a), and life paid (CR 119.4).
    if (line === "If an opponent would lose life during your turn, they lose twice that much life instead.") {
      out.opponentsLoseDouble = true;
      continue;
    }
    // Phial of Galadriel: "If you would draw a card while you have no cards in hand, draw two cards instead." The two draws
    // it makes aren't replaced by it again (CR 614.5).
    if (line === "If you would draw a card while you have no cards in hand, draw two cards instead." && !out.drawTwoInstead) {
      out.drawTwoInstead = "always";
      out.drawTwoIf = { kind: "handAtLeast", n: 0, exactly: true };
      continue;
    }
    // "If you would gain life while you have 5 or less life, you gain twice that much life instead." (Phial of Galadriel):
    // the life total before the gain.
    const lowGain = /^If you would gain life while you have (\d+) or less life, you gain twice that much life instead\.$/.exec(line);
    if (lowGain && !out.doubleLifeGain) {
      out.doubleLifeGain = true;
      out.doubleLifeGainIf = { kind: "life", max: Number(lowGain[1]) };
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
    // Kaya, Bane of the Dead: the same for every permanent an opponent controls, and for opponents themselves.
    if (line === "Your opponents and permanents your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof.") {
      out.seesOpponents = true;
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
    if (line === "If a land is tapped for two or more mana, it produces {C} instead of any other type and amount.") {
      out.dampsLandMana = true;
      continue;
    }
    // Infernal Darkness, Ritual of Subdual: "If a land is tapped for mana, it produces {B} (colorless mana) instead of any other
    // type": as much mana, of this type; Contamination: "... instead of any other type and amount": one mana (CR 614.1a).
    const landAs = /^If a land is tapped for mana, it produces (\{[WUBRGC]\}|colorless mana) instead of any other type( and amount)?\.$/.exec(line);
    if (landAs) {
      (out.landManaAs ??= []).push({ mana: landAs[1] === "colorless mana" ? "C" : (landAs[1]![1] as ManaType), ...(landAs[2] ? { one: true as const } : {}) });
      continue;
    }
    const plusLife = /^If you would gain life, you gain that much life plus (\d+) instead\.$/.exec(line);
    if (plusLife) {
      out.lifeGainPlus = (out.lifeGainPlus ?? 0) + Number(plusLife[1]);
      continue;
    }
    // Serra the Benevolent's emblem: "If you control a creature, damage that would reduce ...": only while you do.
    // Elderscale Wurm: "As long as you have 7 or more life, damage ...": the same as the floor's own "not if they're below it
    // already" (rulings: with less than 7 life, damage reduces it as normal).
    const floor = /^(?:(If (you control an? [^,]+), )|(As long as (you have (\d+) or more life), ))?[Dd]amage that would reduce your life total to less than (\d+) reduces it to \6 instead\.$/.exec(line);
    if (floor?.[3] && floor[5] !== floor[6]) {
      out.unsupported.push(raw);
      continue;
    }
    const floorIf = floor?.[2] || floor?.[4] ? parseStaticCondition((floor[2] ?? floor[4])!, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    if (floor && floorIf !== null) {
      out.lifeFloor = Number(floor[6]);
      if (floorIf) out.lifeFloorIf = floorIf;
      continue;
    }
    // Archon of Coronation (CR 120.3a): the damage is dealt but its life loss doesn't happen.
    const noLoss = /^As long as (you're the monarch), damage doesn't cause you to lose life\.$/.exec(line);
    if (noLoss) {
      out.damageNoLifeLossIf = { kind: "monarch" };
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
    // Seeker of Slaanesh: a requirement (CR 508.1d) on each opponent as they declare attackers (game.ts declareAttackers).
    if (line === "Each opponent must attack with at least one creature each combat if able.") {
      out.opponentsAttackWithOne = true;
      continue;
    }
    // War's Toll: a requirement (CR 508.1d) once an opponent declares any attacker (game.ts declareAttackers).
    if (line === "If a creature an opponent controls attacks, all creatures that opponent controls attack if able.") {
      out.opponentsAttackAll = true;
      continue;
    }
    // Viashino Bey: a requirement on its controller's other creatures once it's declared as an attacker (CR 508.1d; rulings:
    // "not a triggered ability. It is a constraint on declaring an attack").
    if (line === "If ~ attacks, all creatures you control attack if able.") {
      out.allAttackIfSelfAttacks = true;
      continue;
    }
    // Ekundu Cyclops: a requirement on it once another creature its controller controls is declared as an attacker (CR 508.1d).
    // Cunning Giant: an exception to CR 510.1a, chosen as its combat damage is assigned (game.ts askDamageToCreature).
    if (line === "If ~ is unblocked, you may have it assign its combat damage to a creature defending player controls.") {
      out.unblockedToCreature = true;
      continue;
    }
    if (line === "If a creature you control attacks, ~ also attacks if able.") {
      out.attacksIfOneAttacks = true;
      continue;
    }
    if (line === "If you would draw a card while your library has no cards in it, instead put five +1/+1 counters on ~.") {
      out.drawEmptyCounters = 5;
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
    if (line === "As long as you have one or fewer cards in hand, if you would draw one or more cards, you draw that many cards plus one instead.") {
      out.drawPlusOneLowHand = true;
      continue;
    }
    if (line === "If you would draw a card, you may instead choose land or nonland and reveal cards from the top of your library until you reveal a card of the chosen kind. Put that card into your hand and put all other cards revealed this way on the bottom of your library in any order.") {
      out.drawAbundance = true;
      continue;
    }
    if (line === "If you would draw a card, you may skip that draw instead.") {
      out.drawMaySkip = true;
      continue;
    }
    // Island Sanctuary (CR 614.1a): only draws during its controller's own draw step.
    if (line === "If you would draw a card during your draw step, instead you may skip that draw. If you do, until your next turn, you can't be attacked except by creatures with flying and/or islandwalk.") {
      out.drawStepMaySkip = { attackOnlyBy: ["Flying", "Islandwalk"] };
      continue;
    }
    const mayCounter = new RegExp(`^If you would draw a card, you may put an? ${COUNTER} counter on ~ instead\\.$`).exec(line);
    if (mayCounter) {
      out.drawMayCounter = counterKind(mayCounter[1]!);
      continue;
    }
    if (line === "If you would draw a card, instead reveal the top three cards of your library. Put all creature cards revealed this way into your hand and the rest on the bottom of your library in any order.") {
      out.drawRevealCreatures = 3;
      continue;
    }
    if (line === "If you would draw a card, instead look at the top three cards of your library, then put one into your hand and the rest into your graveyard.") {
      out.drawDig = 3;
      continue;
    }
    // Tomorrow, Azami's Familiar: the same look, the rest on the bottom in any order (CR 614.1a; rulings: each draw of
    // several is its own look, an empty library does nothing).
    if (line === "If you would draw a card, look at the top three cards of your library instead. Put one of those cards into your hand and the rest on the bottom of your library in any order.") {
      out.drawDig = 3;
      out.drawDigBottom = true;
      continue;
    }
    if (line === "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.") {
      out.drawTwoInstead = true;
      continue;
    }
    // Archmage Ascension: "As long as ~ has six or more quest counters on it, if you would draw a card, you may instead
    // search your library for a card, put that card into your hand, then shuffle." An optional replacement of each draw,
    // one at a time (rulings, CR 614.1a), while the condition holds. See drawReplacementChoices in game.ts.
    const tutor = /^As long as (~ has [a-z]+ or more [a-z]+ counters on it), if you would draw a card, you may instead search your library for a card, put that card into your hand, then shuffle\.$/.exec(line);
    if (tutor) {
      const cond = parseStaticCondition(tutor[1]!, { affects: { kind: "self" }, mods: [], text: line });
      if (!cond || out.drawTutor) out.unsupported.push(raw);
      else out.drawTutor = cond;
      continue;
    }
    // Frenzied Saddlebrute: "All creatures can attack your opponents and planeswalkers your opponents control as though
    // those creatures had haste" (CR 302.6). See attackProblem in game.ts.
    if (line === "All creatures can attack your opponents and planeswalkers your opponents control as though those creatures had haste.") {
      out.hasteVsYourOpponents = true;
      continue;
    }
    // Eruth, Tormented Prophet: "If you would draw a card, exile the top two cards of your library instead. You may play
    // those cards this turn." Asmodeus the Archfiend: "If you would draw a card, exile the top card of your library face
    // down instead" (linked to its last ability, CR 607.2a). Uba Mask: "If a player would draw a card, that player exiles
    // that card face up instead" (the top card of their library), with its next line's permission. Each draw separately;
    // an empty library exiles nothing and loses nothing (rulings, CR 614.1a, 614.6). See drawExiles in game.ts.
    if (line === "If you would draw a card, exile the top two cards of your library instead. You may play those cards this turn." && !out.drawExile) {
      out.drawExile = { n: 2, play: "thisTurn" };
      continue;
    }
    if (line === "If you would draw a card, exile the top card of your library face down instead." && !out.drawExile) {
      out.drawExile = { n: 1, faceDown: true, linked: true };
      continue;
    }
    if (line === "If a player would draw a card, that player exiles that card face up instead." && !out.drawExile) {
      out.drawExile = { n: 1, each: true, linked: true };
      continue;
    }
    // Uba Mask: "Each player may play lands and cast spells from among cards they exiled with ~ this turn": each card its
    // replacement exiled, by the player who exiled it, during that turn and while it's that Mask (rulings).
    if (line === "Each player may play lands and cast spells from among cards they exiled with ~ this turn." && out.drawExile?.each && !out.drawExile.play) {
      out.drawExile = { ...out.drawExile, play: "whileSource" };
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
    // Gor Muldrak, Amphinologist: "You and permanents you control have protection from Salamanders." (CR 702.16b, 702.16e):
    // you have it, and the permanents get it from a static ability.
    const youAndProt = /^You and permanents you control have protection from ([A-Z][a-z]+)\.$/.exec(line);
    const youAndProtSt = youAndProt && creatureTypeOfPlural(youAndProt[1]!) && !out.youProtectionFrom ? parseStatic(`Permanents you control have protection from ${youAndProt[1]}.`) : null;
    if (youAndProt && youAndProtSt) {
      out.youProtectionFrom = `Protection from ${youAndProt[1]}`;
      out.statics.push({ ...youAndProtSt, text: line });
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
    // Nahiri, Storm of Stone: "During your turn, creatures you control have first strike and equip abilities you activate
    // cost {1} less to activate.": both only during your turn (an equip ability can be activated in another player's turn
    // with an instant-speed permission).
    const turnEquip = /^During your turn, (creatures you control have [a-z ]+?) and equip abilities you activate cost \{(\d+)\} less to activate\.$/.exec(line);
    const turnEquipSt = turnEquip ? parseConditionalStatic(`During your turn, ${turnEquip[1]!}.`) : null;
    const turnCond = turnEquip ? parseStaticCondition("it's your turn", { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (turnEquip && turnEquipSt && turnCond) {
      out.statics.push({ ...turnEquipSt, text: line });
      (out.equipLess ??= []).push({ n: Number(turnEquip[2]), if: turnCond });
      continue;
    }
    // Kaito, Bane of Nightmares: "During your turn, as long as ~ has one or more loyalty counters on him, he's a 3/4 Ninja
    // creature and has hexproof.": a creature instead of a planeswalker then (CR 205.1a; rulings: damage then removes no
    // loyalty counters, and his loyalty abilities can still be activated), in layers 4, 6 and 7b.
    const pwCreature = /^During your turn, as long as ~ has one or more loyalty counters on (?:him|her|it|~), (?:he|she|it)'s (an? \d+\/\d+ [A-Z][a-z]+ creature) and has ([a-z]+)\.$/.exec(line);
    const pwMods = pwCreature && d.types.includes("Planeswalker") ? parseBecomes(`${pwCreature[1]!} with ${pwCreature[2]!}`) : null;
    if (pwCreature) {
      if (!pwMods || pwMods[0]?.kind !== "setTypes") out.unsupported.push(raw);
      else out.statics.push({ affects: { kind: "self" }, mods: pwMods, condition: { kind: "allOf", conds: [{ kind: "yourTurn" }, { kind: "selfCounters", counter: "loyalty", min: 1 }] }, text: line });
      continue;
    }
    // Gruul Spellbreaker: "During your turn, you and ~ have hexproof.": you have it in your turn, and so does ~.
    const youAndSelf = /^During your turn, you and ~ have hexproof\.$/.test(line) && !out.youHave ? parseConditionalStatic("During your turn, ~ has hexproof.") : null;
    if (youAndSelf) {
      out.youHave = "hexproof";
      out.youHaveDuringYourTurn = true;
      out.statics.push({ ...youAndSelf, text: line });
      continue;
    }
    // Captain America, Super-Soldier: "As long as ~ has a shield counter on him, you and other Heroes you control have
    // hexproof": you have it while that's true, and so do they (CR 702.11d, 611.3a).
    const youAndIf = !out.youHave ? /^As long as (~ has an? [a-z]+ counter on) ~, you and ((?:other )?[^,]+ you control) have (hexproof|shroud)\.$/.exec(line) : null;
    const youAndIfCond = youAndIf ? parseStaticCondition(`${youAndIf[1]} it`, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    const youAndIfSt = youAndIfCond ? parseConditionalStatic(`As long as ${youAndIf![1]} it, ${youAndIf![2]} have ${youAndIf![3]}.`) : null;
    if (youAndIfCond && youAndIfSt) {
      out.youHave = youAndIf![3] as "hexproof" | "shroud";
      out.youHaveIf = youAndIfCond;
      out.statics.push({ ...youAndIfSt, text: line });
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
    // Balduvian Trading Post: "an untapped Mountain"; Lotus Vale: "two untapped lands", both at once (CR 614.1a).
    const sacInstead = /^If ~ would enter, sacrifice (an? |two )(untapped )?([A-Z][a-z]+|lands) instead\. If you do, put ~ onto the battlefield\. If you don't, put it into its owner's graveyard\.$/.exec(line);
    const sacTwo = sacInstead?.[1] === "two ";
    if (sacInstead && (sacTwo ? sacInstead[3] === "lands" : /^(?:Plains|Island|Swamp|Mountain|Forest)$/.test(sacInstead[3]!)) && !out.entersSacrificeInstead && !out.entersDiscardInstead) {
      const what = `${sacInstead[2] ?? ""}${sacTwo ? "land" : sacInstead[3]!}`;
      out.entersSacrificeInstead = { kind: "object", types: sacTwo ? ["Land"] : [], notTypes: [], notColors: [], ...(sacTwo ? {} : { subtypes: [sacInstead[3]!] }), controller: "you", ...(sacInstead[2] ? { tapped: false } : {}), text: what };
      if (sacTwo) out.entersSacrificeInsteadN = 2;
      continue;
    }
    // Sheltered Valley: "If ~ would enter, instead sacrifice each other permanent named ~ you control, then put ~ onto the
    // battlefield" (CR 614.1a): it isn't on the battlefield yet, so it isn't one of them.
    if (line === "If ~ would enter, instead sacrifice each other permanent named ~ you control, then put ~ onto the battlefield." && !out.entersSacrificeInstead && !out.entersDiscardInstead) {
      out.entersSacrificeInstead = { kind: "object", types: [], notTypes: [], notColors: [], named: "~", controller: "you", text: "permanent named ~" };
      out.entersSacrificeInsteadAll = true;
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
    // Crowd-Control Warden: "As ~ enters or is turned face up, put X +1/+1 counters on it, where X is the number of other
    // creatures you control": a replacement both ways (CR 614.1c, 614.1e), counted as it enters or is turned face up; a
    // face-down permanent has no abilities as it enters (CR 708.2).
    const bothWays = new RegExp(`^As ~ enters or is turned face up, put X ${COUNTER} counters on it, where X is (.+)\\.$`).exec(line);
    if (bothWays) {
      const def = parseCount(bothWays[2]!, null);
      if (!def || out.entersWithCounters || out.faceUpCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: counterKind(bothWays[1]!), n: def };
        out.faceUpCounters = { counter: counterKind(bothWays[1]!), n: def };
      }
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
    // Quicksilver, Brash Blur: "... begin the game with him on the battlefield", his name for "it".
    if (line === "If ~ is in your opening hand, you may begin the game with it on the battlefield." || line === "If ~ is in your opening hand, you may begin the game with ~ on the battlefield.") {
      out.beginOnBattlefield = true;
      continue;
    }
    // The Chancellors, Sphinx of Foresight, Providence (CR 103.6b): revealed from the opening hand, a delayed trigger
    // of the revealing player's (CR 603.7) at "the first upkeep" (the game's), "your first upkeep" or "your first main
    // phase of the game".
    const revealAt = /^You may reveal ~ from your opening hand\. If you do, at the beginning of (the first upkeep|your first upkeep|your first main phase of the game), (.+)$/.exec(line);
    const revealAfter = /^You may reveal ~ from your opening hand\. If you do, (.+) at the beginning of (your first upkeep)\.$/.exec(line);
    const reveal = revealAt ? { at: revealAt[1]!, rest: revealAt[2]! } : revealAfter ? { at: revealAfter[2]!, rest: revealAfter[1]! } : null;
    if (reveal && !out.openingReveal) {
      const { at, rest } = reveal;
      const effect = /\.$/.test(rest) ? rest : `${rest}.`;
      const t = parseTrigger(`At the beginning of your upkeep, ${effect}`);
      // Only a plain trigger's instructions: no intervening "if" or other trigger condition to carry over.
      if (t && t !== "fail" && t.event === "yourUpkeep" && Object.keys(t).every((k) => k === "event" || k === "body")) {
        out.openingReveal = { when: at === "the first upkeep" ? "nextTurnUpkeep" : at === "your first upkeep" ? "yourNextUpkeep" : "yourNextFirstMain", body: t.body };
        continue;
      }
    }
    // Chancellor of the Annex: "You may reveal ~ from your opening hand. If you do, when each opponent casts their first
    // spell of the game, counter that spell unless that player pays {1}.": revealed before the game begins (CR 103.6b), a
    // delayed trigger for each opponent, once, on the first spell that player casts (CR 603.7c; rulings: one for each
    // Chancellor revealed, each opponent in a multiplayer game).
    const annex = /^You may reveal ~ from your opening hand\. If you do, when each opponent casts their first spell of the game, (.+)$/.exec(line);
    if (annex && !out.openingReveal) {
      const t = parseTrigger(`Whenever an opponent casts a spell, ${annex[1]!}`);
      if (t && t !== "fail" && t.event === "castSpell" && t.cast?.by === "opponent" && Object.keys(t).every((k) => k === "event" || k === "body" || k === "cast") && Object.keys(t.cast).every((k) => k === "by" || k === "spell")) {
        out.openingReveal = { when: "opponentsFirstSpell", body: t.body, trigger: t };
        continue;
      }
    }
    // Gemstone Caverns (CR 103.6a; the starting player is the one taking the first turn, 103.1).
    const caverns = /^If ~ is in your opening hand and you're not the starting player, you may begin the game with ~ on the battlefield with an? ([a-z]+) counter on it\. If you do, exile a card from your hand\.$/.exec(line);
    if (caverns) {
      out.beginOnBattlefield = { notStarting: true, counter: caverns[1]!, exileFromHand: true };
      continue;
    }
    // Torpor Orb, Hushwing Gryff, Doorkeeper Thrull, Elesh Norn, Mother of Machines.
    // Hushbringer: "Creatures entering or dying don't cause abilities to trigger": dying too (see triggers.ts, rulings).
    const lock = /^(Creatures|Artifacts and creatures|Permanents) entering( or dying)?(?: the battlefield)? don't cause abilities( of permanents your opponents control)? to trigger\.$/.exec(line);
    if (lock && !(lock[2] && lock[1] !== "Creatures")) {
      out.enterLock = { ...(lock[1] === "Creatures" ? { types: ["Creature"] } : lock[1] === "Artifacts and creatures" ? { types: ["Artifact", "Creature"] } : {}), ...(lock[3] ? { opponents: true as const } : {}), ...(lock[2] ? { dies: true as const } : {}) };
      continue;
    }
    const again = triggersAgainLine(line);
    if (again) {
      (out.triggersAgain ??= []).push(again);
      continue;
    }
    // Skullbriar, the Walking Grave; Me, the Immortal: its counters stay with it as it changes zones, but to a hand or a
    // library (moveObject).
    if (line === "Counters remain on ~ as it moves to any zone other than a player's hand or library.") {
      out.countersRemain = true;
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
    // Omnipresence: "You may cast spells with mana value less than or equal to the number of creatures you control from your
    // hand without paying their mana costs": an alternative cost of nothing (CR 118.9), X at 0 (107.3b, rulings), the count
    // taken as each spell is cast; normal timing (rulings).
    // Fires of Invention: "You may cast spells with mana value less than or equal to the number of lands you control without
    // paying their mana costs": the same from wherever they may be cast, not with another alternative cost a permission
    // requires (flashback), X at 0 (rulings).
    const omni = /^You may cast spells with mana value less than or equal to (the number of creatures you control|the number of lands you control)( from your hand)? without paying their mana costs\.$/.exec(line);
    if (omni) {
      const n = parseCount(omni[1]!, null);
      if (!n || out.payZero) out.unsupported.push(raw);
      else out.payZero = { ...(omni[2] ? { fromHand: true as const } : {}), maxMvCount: n };
      continue;
    }
    // One with the Multiverse: casting without paying the mana cost is an alternative cost (CR 118.9), X is 0 (107.3b);
    // once for each such permanent (a new object again, rulings), during your turn, following the normal timing rules.
    // Demon of Fate's Design: "Once during each of your turns, you may cast an enchantment spell by paying life equal to its
    // mana value rather than paying its mana cost": an alternative cost (CR 118.9), X is 0 (rulings), from wherever the
    // spell may be cast; once for each such permanent, as for One with the Multiverse.
    // Access Maze: "Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana
    // value rather than paying its mana cost": the same, for any spell cast from your hand.
    if (line === "Once during each of your turns, you may cast a spell from your hand by paying life equal to its mana value rather than paying its mana cost.") {
      out.payZero = { once: true, yourTurn: true, life: true, fromHand: true };
      continue;
    }
    const lifeAlt = /^Once during each of your turns, you may cast an? ([a-z]+) spell by paying life equal to its mana value rather than paying its mana cost\.$/.exec(line);
    if (lifeAlt) {
      const spec = parseTargetPhrase(`${lifeAlt[1]} card from a graveyard`);
      if (spec?.kind !== "card") out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `${lifeAlt[1]} spell` }))(spec), once: true, yourTurn: true, life: true };
      continue;
    }
    // Kentaro, the Smiling Cat: "You may pay {X} rather than pay the mana cost for Samurai spells you cast, where X is that
    // spell's mana value": an alternative cost (CR 118.9) of generic mana only (rulings), the spell's mana value from its
    // own mana cost (CR 202.3), X at 0 in it as for any alternative cost without X (CR 107.3, 601.2b).
    const genericAlt = /^You may pay \{X\} rather than pay the mana cost for ([A-Z][a-z]+) spells you cast, where X is that spell's mana value\.$/.exec(line);
    if (genericAlt) {
      const spec = parseTargetPhrase(`${genericAlt[1]} card from a graveyard`);
      if (spec?.kind !== "card" || out.payZero) out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `${genericAlt[1]} spell` }))(spec), genericMv: true };
      continue;
    }
    // Runeforge Champion: "You may pay {1} rather than pay the mana cost for Rune spells you cast": an alternative cost of
    // that much generic mana (CR 118.9), X at 0 in it (CR 107.3, 601.2b); the spell's mana value doesn't change (rulings).
    const fixedAlt = /^You may pay \{(\d+)\} rather than pay the mana cost for ([A-Z][a-z]+) spells you cast\.$/.exec(line);
    if (fixedAlt && fixedAlt[1] !== "0") {
      const spec = parseTargetPhrase(`${fixedAlt[2]} card from a graveyard`);
      if (spec?.kind !== "card" || out.payZero) out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `${fixedAlt[2]} spell` }))(spec), genericMv: true, generic: Number(fixedAlt[1]) };
      continue;
    }
    // Nissa, Worldsoul Speaker: "You may pay eight {E} rather than pay the mana cost for permanent spells you cast": an
    // alternative cost (CR 118.9) of energy counters (CR 107.14), X at 0 in it (CR 107.3, 601.2b).
    const energyAlt = new RegExp(`^You may pay ${NUM} \\{E\\} rather than pay the mana cost for permanent spells you cast\\.$`).exec(line);
    if (energyAlt) {
      const n = num(energyAlt[1]!);
      const spec = parseTargetPhrase("permanent card from a graveyard");
      if (!n || spec?.kind !== "card" || out.payZero) out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: "permanent spell" }))(spec), energy: n };
      continue;
    }
    // Primal Prayers: "You may cast creature spells with mana value 3 or less by paying {E} rather than paying their mana
    // costs. If you cast a spell this way, you may cast it as though it had flash.": an alternative cost of energy (CR
    // 118.9, 107.14) matched by printed mana value with X at 0 (rulings), and only a spell cast this way has flash timing.
    const prayers = new RegExp(`^You may cast creature spells with mana value (\\d+) or less by paying ((?:\\{E\\})+) rather than paying their mana costs\\. If you cast a spell this way, you may cast it as though it had flash\\.$`).exec(line);
    if (prayers) {
      const spec = parseTargetPhrase(`creature card with mana value ${prayers[1]} or less from a graveyard`);
      if (spec?.kind !== "card" || out.payZero) out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `creature spell with mana value ${prayers[1]} or less` }))(spec), energy: prayers[2]!.length / 3, flash: true };
      continue;
    }
    // Zaffai and the Tempests: "Once during each of your turns, you may cast an instant or sorcery spell from your hand
    // without paying its mana cost": the same once-a-turn alternative cost of nothing, X at 0 (rulings).
    const onceFree = /^Once during each of your turns, you may cast an? ([a-z]+(?: or [a-z]+)?) spell from your hand without paying its mana cost\.$/.exec(line);
    if (onceFree) {
      const spec = parseTargetPhrase(`${onceFree[1]} card from a graveyard`);
      if (spec?.kind !== "card") out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `${onceFree[1]} spell` }))(spec), once: true, yourTurn: true, fromHand: true };
      continue;
    }
    // Vision, Spectral Synthezoid: "Once during each of your turns, you may cast a noncreature or Robot spell from your hand
    // without paying its mana cost": the same, for a spell that's either one (a Robot creature spell too).
    if (line === "Once during each of your turns, you may cast a noncreature or Robot spell from your hand without paying its mana cost.") {
      const anyOf: TargetSpec[] = [{ kind: "card", types: [], notTypes: ["Creature"], notColors: [], text: "noncreature" }, { kind: "card", types: [], notTypes: [], notColors: [], subtypes: ["Robot"], text: "Robot" }];
      out.payZero = { filter: { kind: "card", types: [], notTypes: [], notColors: [], anyOf, text: "noncreature or Robot spell" }, once: true, yourTurn: true, fromHand: true };
      continue;
    }
    if (line === "Once during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost.") {
      out.payZero = { once: true, yourTurn: true, fromHandOrTop: true };
      continue;
    }
    // Weftwalking: the same alternative cost of nothing (CR 118.9), for every player's first spell during their own turn.
    if (line === "The first spell each player casts during each of their turns may be cast without paying its mana cost.") {
      out.payZero = { eachPlayerFirst: true };
      continue;
    }
    // Aluren: the same alternative cost of nothing for any player (CR 118.9), its creature spells matched by their printed
    // mana value with X at 0 (rulings), and only a spell cast this way may be cast as though it had flash (rulings).
    const aluren = /^Any player may cast creature spells with mana value (\d+) or less without paying their mana costs and as though they had flash\.$/.exec(line);
    if (aluren) {
      const spec = parseTargetPhrase(`creature card with mana value ${aluren[1]} or less from a graveyard`);
      if (spec?.kind !== "card") out.unsupported.push(raw);
      else out.payZero = { filter: (({ owner: _, ...rest }) => ({ ...rest, text: `creature spell with mana value ${aluren[1]} or less` }))(spec), anyPlayer: true, flash: true };
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
    // Gavi, Nest Warden: "You may pay {0} rather than pay the cycling cost of the first card you cycle each turn."; New
    // Perspectives: "As long as you have seven or more cards in hand, you may pay {0} rather than pay cycling costs." An
    // alternative cost for the activation (CR 118.9, 602.2b), checked as it's activated (game.ts freeCycling).
    const freeCyc = new RegExp(`^(?:As long as you have ${NUM} or more cards in hand, y|Y)ou may pay \\{0\\} rather than pay (the cycling cost of the first card you cycle each turn|cycling costs)\\.$`).exec(line);
    if (freeCyc && (freeCyc[2] === "cycling costs") === !!freeCyc[1]) {
      (out.freeCycling ??= []).push(freeCyc[1] ? { handAtLeast: num(freeCyc[1]) } : { first: true });
      continue;
    }
    // Fluctuator: "Cycling abilities you activate cost {2} less to activate": typecycling too (CR 702.29f), generic mana
    // only (CR 601.2f, 602.2b).
    const cyclingLess = /^Cycling abilities you activate cost \{(\d+)\} less to activate\.$/.exec(line);
    if (cyclingLess) {
      out.cyclingLess = (out.cyclingLess ?? 0) + Number(cyclingLess[1]);
      continue;
    }
    // Convergence of Dominion: abilities of cards in your graveyard (not of permanents), generic mana only, while the
    // condition holds as the cost is worked out.
    const yardAbilityLess = /^(?:As long as (.+?), )?activated abilities of cards in your graveyard cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that ability's activation cost to less than one mana\.)?$/i.exec(line);
    if (yardAbilityLess && !out.graveyardActivationLess) {
      const cond = yardAbilityLess[1] ? parseStaticCondition(yardAbilityLess[1], { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
      if (cond === null) out.unsupported.push(raw);
      else out.graveyardActivationLess = { n: Number(yardAbilityLess[2]), ...(cond ? { if: cond } : {}), ...(yardAbilityLess[3] ? { atLeastOne: true as const } : {}) };
      continue;
    }
    const youActivateLess = /^Abilities you activate that aren't mana abilities cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that cost to less than one mana\.)?$/.exec(line);
    if (youActivateLess && !out.youActivateLess) {
      out.youActivateLess = { n: Number(youActivateLess[1]), ...(youActivateLess[2] ? { atLeastOne: true as const } : {}) };
      continue;
    }
    // Sam, Loyal Attendant: "Activated abilities of Foods you control cost {1} less to activate": any Food artifact (rulings).
    // Agatha of the Vile Cauldron: "... cost {X} less to activate, where X is ~'s power. This effect can't reduce ...":
    // only abilities of creatures on the battlefield (rulings), generic mana only.
    const activationLess = /^Activated abilities of (creatures|artifacts|lands|artifact tokens|Foods)( you control)? cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that cost to less than one mana\.)?$/.exec(line) ?? /^Activated abilities of (creatures)( you control) cost \{(X)\} less to activate, where X is ~'s power\.( This effect can't reduce the mana in that cost to less than one mana\.)$/.exec(line);
    const lessFilter = activationLess && parseTargetPhrase(`${activationLess[1]!.replace(/s$/, "")}${activationLess[2] ?? ""}`);
    if (activationLess && lessFilter?.kind === "object") {
      (out.activationLess ??= []).push({ n: activationLess[3] === "X" ? 0 : Number(activationLess[3]), filter: { ...lessFilter, text: `${activationLess[1]}${activationLess[2] ?? ""}` }, ...(activationLess[4] ? { atLeastOne: true as const } : {}), ...(activationLess[3] === "X" ? { selfPower: true as const } : {}) });
      continue;
    }
    // Power Artifact: "Enchanted artifact's activated abilities cost {2} less to activate. This effect can't reduce the mana
    // in that cost to less than one mana.": the permanent it enchants (CR 303.4), generic mana only (CR 601.2f, 602.2b).
    const enchantedLess = /^Enchanted (artifact|creature|permanent)'s activated abilities cost \{(\d+)\} less to activate\.( This effect can't reduce the mana in that cost to less than one mana\.)?$/.exec(line);
    if (enchantedLess && d.subtypes.includes("Aura")) {
      const t = capital(enchantedLess[1]!);
      (out.activationLess ??= []).push({ n: Number(enchantedLess[2]), filter: { kind: "object", types: t === "Permanent" ? [] : [t], notTypes: [], notColors: [], text: `enchanted ${enchantedLess[1]}` }, enchanted: true, ...(enchantedLess[3] ? { atLeastOne: true as const } : {}) });
      continue;
    }
    // Winter Orb, Winter Moon, Smoke, Static Orb, Mungha Wurm: a limit on what untaps in the untap step (CR 502.3).
    // Dovin Baan's emblem: "Your opponents can't untap more than two permanents during their untap steps" (`opponents`).
    const untapLimit = /^(As long as ~ is untapped, )?([Pp]layers|[Yy]ou|Your opponents) can't untap more than (one|two) (.+?) during (?:their|your) untap steps?\.$/.exec(line);
    if (untapLimit) {
      const filter = parseTargetPhrase(untapLimit[4]!.split(" ").map((w, i, a) => (i === a.length - 1 ? singularWord(w) : w)).join(" "));
      if (filter?.kind !== "object" || filter.controller || filter.bound) out.unsupported.push(raw);
      else (out.untapLimits ??= []).push({ n: num(untapLimit[3]!), filter: { ...filter, text: untapLimit[4]! }, ...(/^you$/i.test(untapLimit[2]!) ? { you: true as const } : {}), ...(untapLimit[2] === "Your opponents" ? { opponents: true as const } : {}), ...(untapLimit[1] ? { whileUntapped: true as const } : {}) });
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
    // Lorehold, the Historian: "Each instant and sorcery card in your hand has miracle {2}": miracle for those cards while
    // they're in its controller's hand (CR 702.94a), so one drawn as the first card drawn in a turn triggers.
    // Molecule Man: "Nonland cards in your hand have miracle {0}": the same.
    const miracleGrant = /^Each ([a-z]+(?: and [a-z]+)?) card in your hand has miracle ((?:\{[^}]+\})+)\.$/.exec(line.replace(/ \(You may cast a card for its miracle cost when you draw it if it's the first card you drew this turn\.\)$/, "").replace(/^Nonland cards in your hand have miracle/, "Each nonland card in your hand has miracle"));
    if (miracleGrant) {
      const f = parseTargetPhrase(`${miracleGrant[1]!.replace(" and ", " or ")} card from a graveyard`);
      if (f?.kind !== "card") out.unsupported.push(raw);
      else (out.handMiracle ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), text: `${miracleGrant[1]} cards in your hand` }, mana: miracleGrant[2]!, text: line });
      continue;
    }
    // Aminatou, Veil Piercer: "Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost
    // reduced by {4}": each card's own mana cost less that much generic mana, never colored (CR 601.2f), worked out in game.ts.
    const miracleLess = /^Each ([a-z]+) card in your hand has miracle\. Its miracle cost is equal to its mana cost reduced by \{(\d+)\}\.$/.exec(line.replace(/ \(You may cast a card for its miracle cost when you draw it if it's the first card you drew this turn\.\)$/, ""));
    if (miracleLess) {
      const f = parseTargetPhrase(`${miracleLess[1]} card from a graveyard`);
      if (f?.kind !== "card") out.unsupported.push(raw);
      else (out.handMiracle ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), text: `${miracleLess[1]} cards in your hand` }, mana: "", reduce: Number(miracleLess[2]), text: line });
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
    // Homing Sliver: "Each Sliver card in each player's hand has slivercycling {3}": in every player's hand (CR 702.29e).
    const handGrant = /^Each ([a-z]+|[A-Z][a-z]+) card in (your|each player's) hand has ((?:ninjutsu|cycling|[a-z]+cycling) (?:\{[^}]+\})+)\.$/.exec(line);
    if (handGrant) {
      // The card's kind read as a graveyard card's, without the graveyard.
      const f = parseTargetPhrase(`${handGrant[1]} card from a graveyard`);
      const kw = keywordAbilities(handGrant[3]!.replace(/^./, (c) => c.toUpperCase()), d);
      const every = handGrant[2] === "each player's";
      if (f?.kind !== "card" || kw?.activated.length !== 1 || kw.triggers.length || kw.statics.length) out.unsupported.push(raw);
      else (out.handGrants ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), text: `${handGrant[1]} cards in ${every ? "each player's" : "your"} hand` }, activated: kw.activated, ...(every ? { everyHand: true as const } : {}) });
      continue;
    }
    // "Each creature card in your graveyard has unearth {2}{B}" (Sedris), "Each artifact card in your graveyard has
    // unearth {1}{B}{R}" (Mishra, Tamer of Mak Fawa), "... that's a Cleric, Rogue, Warrior, and/or Wizard" (Solemn
    // Doomguide): activated abilities of each of those cards, not of the source (rulings; CR 113.6, 702.84a). "Each
    // outlaw creature card in your graveyard has encore {X}, where X is its mana value" (Graywater's Fixer, CR 702.141a):
    // each card's own cost, X counted as 0 (CR 202.3e, rulings). "Each Sliver creature card in your graveyard has encore
    // {X}, where X is its mana value" (Sliver Gravemother): the same, for Sliver creature cards. "Each artifact creature
    // card in your graveyard has encore. Its encore cost is equal to its mana cost." (Wire Surgeons): each card's own mana
    // cost, colored symbols and any {X} too; a card with no mana cost gets none to pay (CR 118.6).
    const yardGrant = /^Each (artifact|creature|artifact creature|outlaw creature|Sliver creature) card in your graveyard( that's a ((?:[A-Z][a-z]+, )+)and\/or ([A-Z][a-z]+))? has (unearth (?:\{[^}]+\})+|encore \{X\}, where X is its mana value|encore\. Its encore cost is equal to its mana cost)\.$/.exec(line);
    if (yardGrant) {
      const f = parseTargetPhrase(`${yardGrant[1]} card from a graveyard`);
      const types = yardGrant[2] ? [...yardGrant[3]!.split(", ").filter(Boolean), yardGrant[4]!] : [];
      const own = /^encore\. /.test(yardGrant[5]!);
      const mv = /^encore/.test(yardGrant[5]!) && !own;
      const encore = mv || own ? parseCostKeyword("Encore {1}", d) : undefined;
      const unearth = mv ? undefined : parseGraveyardKeyword(yardGrant[5]!.replace(/^./, (c) => c.toUpperCase()), d);
      const ab = encore && typeof encore === "object" ? encore.activated : unearth && typeof unearth === "object" && "unearth" in unearth ? unearth.unearth : undefined;
      if (f?.kind !== "card" || f.subtypes?.length && types.length || !types.every((t) => CREATURE_TYPES.has(t)) || ab?.zone !== "graveyard") out.unsupported.push(raw);
      else (out.yardGrants ??= []).push({ filter: { ...(({ owner: _, ...rest }) => rest)(f), ...(types.length ? { subtypes: types } : {}), text: `${yardGrant[1]} cards${yardGrant[2] ?? ""} in your graveyard` }, activated: ab, ...(mv ? { manaValueCost: true as const } : {}), ...(own ? { manaCostCost: true as const } : {}) });
      continue;
    }
    // Urborg Scavengers: "~ has flying as long as a card exiled with it has flying. The same is true for first strike, ...":
    // each keyword while a card exiled with it has that one (linked to its one exile ability below, CR 607.2a), layer 6.
    // Death-Mask Duplicant: "As long as a card exiled with ~ has flying, ~ has flying. The same is true for fear, ...,
    // landwalk, protection, and trample.": the same, landwalk and protection being every one of those it has (rulings).
    // Wretched Bonemass: "~ has flying as long as an exiled card used to craft it has flying. ...": the cards its craft cost
    // exiled (CR 702.167c), linked as it entered (no exile ability of its own to link).
    const linkedKw = /^~ has ([a-z ]+) as long as (?:a card exiled with it|an exiled card used to craft it) has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/.exec(line) ?? /^As long as a card exiled with ~ has ([a-z ]+), ~ has \1\. The same is true for ((?:[a-z ]+, )+)and ([a-z ]+)\.$/.exec(line);
    if (linkedKw) {
      const kws = [linkedKw[1]!, ...linkedKw[2]!.split(", ").filter(Boolean), linkedKw[3]!].map((k) => (k === "landwalk" ? "Landwalk" : k === "protection" ? "Protection" : canonicalKeyword(k)));
      if (kws.some((k) => !k || !/^[A-Z][a-z]+(?: [a-z]+)?$/.test(k))) out.unsupported.push(raw);
      else out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "addKeywords", keywords: kws.map((k) => `${LINKED_CARD_KEYWORD}${k}`) }], text: line });
      continue;
    }
    // Professor Hojo: "The first activated ability you activate during your turn that targets a creature you control
    // costs {2} less to activate." (game.ts activationCost).
    const hojo = /^The first activated ability you activate during your turn that targets a creature you control costs \{(\d+)\} less to activate\.$/.exec(line);
    if (hojo) {
      out.firstOwnCreatureTargetLess = (out.firstOwnCreatureTargetLess ?? 0) + Number(hojo[1]);
      continue;
    }
    const firstArtifactLess = /^The first activated ability of an artifact you activate each turn costs \{(\d+)\} less to activate\.$/.exec(line);
    if (firstArtifactLess) {
      out.firstArtifactAbilityLess = (out.firstArtifactAbilityLess ?? 0) + Number(firstArtifactLess[1]);
      continue;
    }
    const boastLess = /^Boast abilities you activate cost \{(\d+)\} less to activate for each ([^.]+)\.$/.exec(line);
    if (boastLess) {
      const c = parseCount(boastLess[2]!, null, true);
      if (!c || out.boastLess) out.unsupported.push(raw);
      else out.boastLess = { ...c, times: (c.times ?? 1) * Number(boastLess[1]) };
      continue;
    }
    const ninjutsuLess = /^Ninjutsu abilities you activate cost \{(\d+)\} less to activate\.$/.exec(line);
    if (ninjutsuLess) {
      out.ninjutsuLess = (out.ninjutsuLess ?? 0) + Number(ninjutsuLess[1]);
      continue;
    }
    // Boom Scholar: "Exhaust abilities of other permanents you control cost {2} less to activate": generic mana only, down to
    // {0} (rulings).
    const exhaustLess = /^Exhaust abilities of other permanents you control cost \{(\d+)\} less to activate\.$/.exec(line);
    if (exhaustLess) {
      out.exhaustLess = (out.exhaustLess ?? 0) + Number(exhaustLess[1]);
      continue;
    }
    const powerUpLess = /^Power-up abilities of other creatures you control cost \{(\d+)\} less to activate\.$/.exec(line);
    if (powerUpLess && !out.powerUpLess) {
      out.powerUpLess = Number(powerUpLess[1]);
      continue;
    }
    // Auriok Steelshaper: "Equip costs you pay cost {1} less." is the older wording of the same (CR 702.6a: equip is an
    // activated ability, its cost the equip cost).
    const equipLess = /^Equip abilities you activate( of other Equipment| that target ~| that target enchanted creature)? cost \{(\d+)\} less to activate\.$/.exec(line.replace(/^Equip costs you pay cost (\{\d+\}) less\.$/, "Equip abilities you activate cost $1 less to activate."));
    if (equipLess) {
      (out.equipLess ??= []).push({ n: Number(equipLess[2]), ...(equipLess[1] === " that target ~" ? { targetSelf: true as const } : equipLess[1] === " that target enchanted creature" ? { targetEnchanted: true as const } : equipLess[1] ? { otherEquipment: true as const } : {}) });
      continue;
    }
    // Bladegraft Aspirant: "Activated abilities of Equipment you control that target ~ cost {1} less to activate": any
    // activated ability of those Equipment, equip or not, with ~ as a target (CR 601.2f via 602.2b).
    const equipAbLess = /^Activated abilities of Equipment you control that target ~ cost \{(\d+)\} less to activate\.$/.exec(line);
    if (equipAbLess) {
      (out.equipLess ??= []).push({ n: Number(equipAbLess[1]), targetSelf: true, anyAbility: true });
      continue;
    }
    // Firion's token copies: "This Equipment's equip abilities cost {2} less to activate" (its own only).
    const ownEquipLess = /^~'s equip abilities cost \{(\d+)\} less to activate\.$/.exec(line);
    if (ownEquipLess) {
      (out.equipLess ??= []).push({ n: Number(ownEquipLess[1]), self: true });
      continue;
    }
    // Ghostfire Blade: "This Equipment's equip ability costs {2} less to activate if it targets a colorless creature."
    // Its own equip ability only, and only once the target is chosen (CR 601.2f via 602.2b: the cost is set after targets).
    const colorlessEquipLess = /^~'s equip ability costs \{(\d+)\} less to activate if it targets a colorless creature\.$/.exec(line);
    if (colorlessEquipLess) {
      (out.equipLess ??= []).push({ n: Number(colorlessEquipLess[1]), self: true, targetColorless: true });
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
    // Exquisite Archangel: the same, with your starting life total (CR 103.4, 903.7: 40).
    if (line === "If you would lose the game, instead exile ~ and your life total becomes equal to your starting life total.") {
      out.loseGameExileSelf = "startingLife";
      continue;
    }
    // Gideon of the Trials' emblem: "As long as you control a Gideon planeswalker, you can't lose the game and your
    // opponents can't win the game": only while that's true.
    const lockIf = /^As long as (.+), you can't lose the game and your opponents can't win the game\.$/.exec(line);
    if (lockIf) {
      const cond = parseStaticCondition(lockIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond) out.unsupported.push(raw);
      else [out.cantLose, out.cantWin, out.gameEndIf] = ["you", "opponents", cond];
      continue;
    }
    // "You can't lose the game." (Lich's Mastery, Transcendence): alone, without the opponents' half.
    if (line === "You can't lose the game.") {
      out.cantLose = "you";
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
    // We Ride at Dawn: "Legendary creature spells you cast have convoke": legendary and a creature, both.
    const giveConvoke = /^([A-Z][a-z]+(?: and [a-z]+| creature)?) spells you cast( from exile)? have convoke\.$/.exec(line);
    if (giveConvoke) {
      const f = parseTargetPhrase(`${giveConvoke[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveConvoke ??= []).push({ filter: f, ...(giveConvoke[2] ? { fromExile: true as const } : {}), text: line });
      continue;
    }
    // Peri Brown: "The first historic spell you cast each turn has convoke": only the first one of that kind (CR 702.51a).
    // The Fifteenth Doctor: "The first nonartifact spell you cast each turn has improvise" (CR 702.126a), the same way.
    const firstConvoke = /^The first ([a-z]+) spell you cast each turn has (convoke|improvise)\.$/.exec(line);
    if (firstConvoke) {
      const f = parseTargetPhrase(`${firstConvoke[1]} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else ((firstConvoke[2] === "convoke" ? (out.spellsHaveConvoke ??= []) : (out.spellsHaveImprovise ??= [])) as { filter: TargetSpec; firstEachTurn?: true; text: string }[]).push({ filter: { ...f, text: `${firstConvoke[1]} spell` }, firstEachTurn: true, text: line });
      continue;
    }
    // "Each red or green instant or sorcery spell you cast has conspire" (Wort, the Raidmother), "Each noncreature spell you
    // cast has conspire" (Raiding Schemes), "... from exile" (Rassilon): the spell has it while it's cast (CR 702.78a), so
    // its controller may pay the conspire cost, and its "when you cast this spell" copy triggers if they did.
    const giveConspire = /^Each ([a-z]+(?: or [a-z]+)?(?: [a-z]+(?: or [a-z]+)?)?) spell you cast( from exile)? has conspire\.$/.exec(line);
    if (giveConspire) {
      // "Red or green instant or sorcery": the colors, then the card types, each "or" (Wort).
      const colored = /^((?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))?) ([a-z]+(?: or [a-z]+)?)$/.exec(giveConspire[1]!);
      const byColor = colored ? parseTargetPhrase(`${colored[1]} spell`) : null;
      const byType = colored ? parseTargetPhrase(`${colored[2]} spell`) : null;
      const f = colored ? (byColor?.kind === "spell" && byType?.kind === "spell" && byColor.colors?.length && !byType.colors?.length && byType.types?.length ? { ...byType, colors: byColor.colors } : null) : parseTargetPhrase(`${giveConspire[1]} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveConspire ??= []).push({ filter: { ...f, text: `${giveConspire[1]} spell` }, ...(giveConspire[2] ? { fromExile: true as const } : {}), text: line });
      continue;
    }
    // Silverquill, the Disputant: "Each instant and sorcery spell you cast has casualty 1"; Anhelo, the Painter: "The first
    // instant or sorcery spell you cast each turn has casualty 2"; Ashad, the Lone Cyberman: "The first nonlegendary
    // artifact spell you cast each turn has casualty 2": an instance of casualty for each such spell as it's cast, on top of
    // any it has (CR 702.153a-b).
    const giveCasualty = /^(Each|The first) (instant and sorcery|instant or sorcery|nonlegendary artifact) spell you cast( each turn)? has casualty (\d+)\.$/.exec(line);
    if (giveCasualty && (giveCasualty[1] === "The first") === !!giveCasualty[3] && (giveCasualty[1] === "Each") === (giveCasualty[2] === "instant and sorcery")) {
      const f = parseTargetPhrase(`${giveCasualty[2]!.replace(" and ", " or ")} spell`);
      if (f?.kind !== "spell" || !f.types?.length) out.unsupported.push(raw);
      else (out.spellsHaveCasualty ??= []).push({ filter: { ...f, text: `${giveCasualty[2]} spell` }, n: Number(giveCasualty[4]), ...(giveCasualty[3] ? { firstEachTurn: true as const } : {}), text: line });
      continue;
    }
    // Silverquill Lecturer: "Creature spells you cast have demonstrate" (CR 702.144a): the spell's own "when you cast this
    // spell, you may copy it ...", one for each instance (702.144b), while the permanent is there as it's cast.
    const giveDemonstrate = /^([A-Z][a-z]+) spells you cast have demonstrate\.$/.exec(line);
    if (giveDemonstrate) {
      const f = parseTargetPhrase(`${giveDemonstrate[1]!.toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveDemonstrate ??= []).push({ filter: { ...f, text: `${giveDemonstrate[1]!.toLowerCase()} spell` }, text: line });
      continue;
    }
    // The Twelfth Doctor: "The first spell you cast from anywhere other than your hand each turn has demonstrate": only the
    // first such spell its controller casts in a turn (one cast before it entered counts too), as it's cast (CR 702.144a).
    if (line === "The first spell you cast from anywhere other than your hand each turn has demonstrate.") {
      (out.spellsHaveDemonstrate ??= []).push({ filter: { kind: "spell", text: "spell" }, firstNotFromHand: true, text: line });
      continue;
    }
    // "Spells you cast from exile have convoke" (Hoarding Broodlord): cast from exile, checked as they're paid for (CR 601.2g-h).
    if (line === "Spells you cast from exile have convoke.") {
      (out.spellsHaveConvoke ??= []).push({ filter: { kind: "spell", text: "spell" }, fromExile: true, text: line });
      continue;
    }
    // "Spells you cast have delve" (Teval, Arbiter of Virtue), CR 702.66a, as for convoke.
    if (line === "Spells you cast have delve.") {
      (out.spellsHaveDelve ??= []).push({ filter: { kind: "spell", text: "spell" }, text: line });
      continue;
    }
    // Altar of the Pantheon: one more to its controller's devotion to any color or combination of colors (CR 700.5).
    if (line === "Your devotion to each color and each combination of colors is increased by one.") {
      out.devotionBonus = (out.devotionBonus ?? 0) + 1;
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
    // "Assassin spells you cast have freerunning {B}{B}" (Ezio Auditore da Firenze), CR 702.173a: an alternative cost for
    // those spells, beside any freerunning cost of their own.
    const giveFreerun = /^([A-Z][a-z]+) spells you cast have freerunning ((?:\{[^}]+\})+)\.$/.exec(line);
    if (giveFreerun) {
      const f = parseTargetPhrase(`${giveFreerun[1]!.toLowerCase()} spell`);
      if (f?.kind !== "spell" || /\{X\}/.test(giveFreerun[2]!)) out.unsupported.push(raw);
      else (out.spellsHaveFreerunning ??= []).push({ filter: f, mana: giveFreerun[2]!, text: line });
      continue;
    }
    // "Each legendary spell you cast that's one or more colors has web-slinging {G}{W}{U}" (Amazing Spider-Man), CR
    // 702.188a: an alternative cost for those spells, beside any web-slinging of their own.
    const giveSling = /^Each ([a-z]+) spell you cast( that's one or more colors)? has web-slinging ((?:\{[^}]+\})+)\.$/.exec(line);
    if (giveSling) {
      const f = parseTargetPhrase(`${giveSling[1]!}${giveSling[2] ? " colored" : ""} spell`);
      if (f?.kind !== "spell" || /\{X\}/.test(giveSling[3]!)) out.unsupported.push(raw);
      else (out.spellsHaveWebSlinging ??= []).push({ filter: f, mana: giveSling[3]!, text: line });
      continue;
    }
    // Henzie "Toolbox" Torre: "Each creature spell you cast with mana value 4 or greater has blitz. The blitz cost is equal
    // to its mana cost." (CR 702.152a): an alternative cost for those spells, beside any blitz of their own.
    const giveBlitz = /^Each (creature spell(?: with mana value \d+ or greater)?) you cast has blitz\. The blitz cost is equal to its mana cost\.$/.exec(line.replace(/^Each creature spell you cast (with mana value \d+ or greater) has/, "Each creature spell $1 you cast has"));
    if (giveBlitz) {
      const f = parseTargetPhrase(giveBlitz[1]!);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveBlitz ??= []).push({ filter: f, text: line });
      continue;
    }
    // Herigast, Erupting Nullkite: "Each creature spell you cast has emerge. The emerge cost is equal to its mana cost."
    // (CR 702.119a): sacrifice a creature and pay the spell's mana cost less that creature's mana value, beside any emerge
    // of the spell's own (rulings).
    const giveEmerge = /^Each (creature spell) you cast has emerge\. The emerge cost is equal to its mana cost\.$/.exec(line);
    if (giveEmerge) {
      const f = parseTargetPhrase(giveEmerge[1]!);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveEmerge ??= []).push({ filter: f, text: line });
      continue;
    }
    const blitzLess = /^Blitz costs you pay cost \{(\d+)\} less for each time you've cast your commander from the command zone this game\.$/.exec(line);
    if (blitzLess) {
      out.blitzLessPerCommanderCast = (out.blitzLessPerCommanderCast ?? 0) + Number(blitzLess[1]);
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
    // Cast Through Time: "Instant and sorcery spells you control have rebound" (CR 702.88a): checked as such a spell finishes
    // resolving (rulings), so it applies only while it's on the battlefield then.
    const giveRebound = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you control have rebound\.(?: \(.*\))?$/.exec(line);
    if (giveRebound) {
      const f = parseTargetPhrase(`${giveRebound[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell" || (f.types ?? []).some((x) => x !== "Instant" && x !== "Sorcery") || !f.types?.length) out.unsupported.push(raw);
      else (out.spellsHaveRebound ??= []).push(f);
      continue;
    }
    // Soulfire Grand Master: "Instant and sorcery spells you control have lifelink"; Pestilent Spirit: "... have deathtouch".
    // Damage those spells deal while it's on the battlefield (CR 702.15b, 702.2b).
    const giveKw = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you control have (lifelink|deathtouch)\.$/.exec(line);
    if (giveKw) {
      const f = parseTargetPhrase(`${giveKw[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveKeywords ??= []).push({ filter: f, keyword: giveKw[2] === "lifelink" ? "Lifelink" : "Deathtouch" });
      continue;
    }
    // Lo and Li, Twin Tutors: "Noble creatures you control and Lesson spells you control have lifelink": both, the
    // creatures as a static ability (CR 604.2), the spells as Soulfire Grand Master's above.
    const bothKw = /^([A-Z][a-z]+ creatures you control) and ([A-Z][a-z]+) spells you control have (lifelink|deathtouch)\.$/.exec(line);
    if (bothKw) {
      const st = parseStatic(`${bothKw[1]} have ${bothKw[3]}.`);
      const f = parseTargetPhrase(`${bothKw[2]!.toLowerCase()} spell`);
      if (!st || f?.kind !== "spell") out.unsupported.push(raw);
      else {
        out.statics.push({ ...st, text: line });
        (out.spellsHaveKeywords ??= []).push({ filter: f, keyword: bothKw[3] === "lifelink" ? "Lifelink" : "Deathtouch" });
      }
      continue;
    }
    // Shadow the Hedgehog (after its flavor word, CR 207.2d): spells its controller casts get split second (CR 702.61a).
    if (/^(?:[A-Z][A-Za-z' ]* — )?Each spell you cast has split second if mana from an artifact was spent to cast it\.$/.test(line)) {
      out.splitSecondIfArtifactMana = true;
      continue;
    }
    if (line === "Tapped creatures you control can block as though they were untapped.") {
      out.tappedCreaturesCanBlock = true;
      continue;
    }
    // Molten Disaster: "If ~ was kicked, it has split second" (CR 702.61a): only while it's a kicked spell on the stack
    // (rulings); a spell's own line, so only on an instant or sorcery with a kicker.
    if (/^If ~ was kicked, it has split second\.(?: \(.*\))?$/.test(line) && isSpell && /\bKicker\b/.test(d.oracleText ?? "")) {
      out.splitSecondIfKicked = true;
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
    // Ghostfire: "~ is colorless" (CR 604.3, 202.2b): its colors in the card data are none, as Scryfall gives them, which
    // is what every zone reads.
    if (line === "~ is colorless.") {
      if (d.colors.length) out.unsupported.push(raw);
      continue;
    }
    // "~ is every creature type (even if this card isn't on the battlefield)" (Mistform Ultimus): a characteristic-defining
    // ability like changeling (CR 604.3, 702.73a), read from the card in every zone by everyCreatureType (layers.ts).
    if (line === "~ is every creature type.") {
      if (!isEveryCreatureTypeText(d)) out.unsupported.push(raw);
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
    // Sunglasses of Urza (CompiledCard.spendWhiteAsRed).
    if (line === "You may spend white mana as though it were red mana." && !out.spendWhiteAsRed) {
      out.spendWhiteAsRed = true;
      continue;
    }
    const unlockLess = /^Unlock costs you pay cost \{(\d+)\} less\.$/.exec(line);
    if (unlockLess) {
      out.unlockLess = (out.unlockLess ?? 0) + Number(unlockLess[1]);
      continue;
    }
    const yardLess = /^Activated abilities of creature cards in your graveyard cost \{(\d+)\} less to activate\.$/.exec(line);
    if (yardLess) {
      out.yardCreatureAbilityLess = (out.yardCreatureAbilityLess ?? 0) + Number(yardLess[1]);
      continue;
    }
    // Catalyst Stone: "Flashback costs you pay cost {2} less." "Flashback costs your opponents pay cost {2} more." (CR 601.2f)
    const flashbackMod = /^Flashback costs (you|your opponents) pay cost \{(\d+)\} (less|more)\.$/.exec(line);
    if (flashbackMod && (flashbackMod[1] === "you") === (flashbackMod[3] === "less")) {
      if (flashbackMod[1] === "you") out.flashbackLess = (out.flashbackLess ?? 0) + Number(flashbackMod[2]);
      else out.flashbackTax = (out.flashbackTax ?? 0) + Number(flashbackMod[2]);
      continue;
    }
    // Thick-Skinned Goblin: see Effect "may" `echo` (run-choices.ts).
    if (line === "You may pay {0} rather than pay the echo cost for permanents you control.") {
      out.echoZero = true;
      continue;
    }
    // Warbringer: "Dash costs you pay cost {2} less"; Memory Crystal: "Buyback costs cost {2} less" (CR 601.2f).
    const dashLess = /^Dash costs you pay cost \{(\d+)\} less\.$/.exec(line);
    if (dashLess) {
      out.dashLess = (out.dashLess ?? 0) + Number(dashLess[1]);
      continue;
    }
    const buybackLess = /^Buyback costs cost \{(\d+)\} less\.$/.exec(line);
    if (buybackLess) {
      out.buybackLess = (out.buybackLess ?? 0) + Number(buybackLess[1]);
      continue;
    }
    const morphTax = /^All morph costs cost \{(\d+)\} more\.$/.exec(line);
    if (morphTax) {
      out.morphTax = (out.morphTax ?? 0) + Number(morphTax[1]);
      continue;
    }
    // Fblthp, Lost on the Range: plot (CR 702.170a) for the top card of your library, its cost its mana cost, and a
    // permission to plot a nonland card from there (the plot ability itself only exiles a card from a hand, rulings).
    if (line === "The top card of your library has plot. The plot cost is equal to its mana cost.") {
      (out.plotTop ??= {}).granted = true;
      continue;
    }
    if (line === "You may plot nonland cards from the top of your library.") {
      (out.plotTop ??= {}).fromTop = true;
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
    // Oath of Nissa (CR 609.4b): colored symbols of its controller's planeswalker spells paid with mana of any color.
    if (line === "You may spend mana as though it were mana of any color to cast planeswalker spells.") {
      out.spendAnyColorPlaneswalkerSpells = true;
      continue;
    }
    // Case File Auditor: "... to cast Case spells": the same for spells with that subtype.
    const anyColorSub = /^You may spend mana as though it were mana of any color to cast (Case|Aura|Equipment|Vehicle|Saga|Room|Class) spells\.$/.exec(line);
    if (anyColorSub) {
      out.spendAnyColorSubtypeSpells = anyColorSub[1]!;
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
    // Pact Weapon: "As long as ~ is attached to a creature, you don't lose ...": whoever controls the Equipment, whoever
    // controls the creature (rulings).
    if (line === "As long as ~ is attached to a creature, you don't lose the game for having 0 or less life.") {
      out.noZeroLifeLoss = true;
      out.noZeroLifeLossAttached = true;
      continue;
    }
    if (line === "As long as you have 0 or less life, all damage is dealt to you as though its source had infect.") {
      out.damageAsInfectAtZero = true;
      continue;
    }
    const zeroLife = /^You (have no maximum hand size and )?don't lose the game for having 0 or less life\.$/.exec(line);
    if (zeroLife) {
      if (zeroLife[1]) out.noMaxHandSize = out.noMaxHandSize || true;
      out.noZeroLifeLoss = true;
      continue;
    }
    // Cursed Rack: "The chosen player's maximum hand size is four": the player chosen as it entered (CR 614.12, 402.2).
    const handSize = new RegExp(`^(Your|Each opponent's|The chosen player's) maximum hand size is (?:${NUM}|(increased|reduced) by ${NUM})\\.$`).exec(line);
    if (handSize && (handSize[1] !== "The chosen player's" || out.entersChoosePlayer)) {
      const n = num((handSize[2] ?? handSize[4])!);
      (out.handSize ??= []).push({ who: handSize[1] === "Your" ? "you" : handSize[1] === "The chosen player's" ? "chosen" : "opponents", ...(handSize[2] ? { set: n } : { plus: handSize[3] === "reduced" ? -n : n }) });
      continue;
    }
    // Midnight Oil: "Your maximum hand size is equal to the number of hour counters on ~" (CR 402.2), counted whenever it's
    // checked; set like "is seven", the latest such effect winning (rulings, CR 613.7).
    const handEqual = /^Your maximum hand size is equal to (the number of [a-z]+ counters on ~)\.$/.exec(line);
    const handEqualN = handEqual ? parseCount(handEqual[1]!, null) : null;
    if (handEqual) {
      if (!handEqualN) out.unsupported.push(raw);
      else (out.handSize ??= []).push({ who: "you", set: 0, equal: handEqualN });
      continue;
    }
    // Winter, Misanthropic Guide: "Delirium — As long as there are four or more card types among cards in your graveyard,
    // each opponent's maximum hand size is equal to seven minus the number of those card types" (CR 402.2, 205.2a).
    if (/^(?:Delirium — )?As long as there are four or more card types among cards in your graveyard, each opponent's maximum hand size is equal to seven minus the number of those card types\.$/.test(line)) {
      (out.handSize ??= []).push({ who: "opponents", set: 7, minus: { count: { kind: "graveyardCardTypes", who: { ref: "you" } } }, if: { kind: "graveyardTypes", n: 4 } });
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
    // Brand of Ill Omen: "Enchanted creature's controller can't cast creature spells": whoever controls that creature now.
    const enchantedCant = /^Enchanted creature's controller can't cast (creature|noncreature) spells\.$/.exec(line);
    if (enchantedCant) {
      const filter = parseTargetPhrase(`${enchantedCant[1]} spell`);
      if (filter?.kind !== "spell") out.unsupported.push(raw);
      else (out.enchantedControllerCantCast ??= []).push({ ...filter, text: `${enchantedCant[1]} spell` });
      continue;
    }
    // Llawan, Cephalid Empress: "Your opponents can't cast blue creature spells": the spell's color as it's cast (CR 601.3).
    // Codie, Vociferous Codex: "You can't cast permanent spells": artifact, creature, enchantment, planeswalker or battle
    // spells (CR 110.1), the face cast (an instant face of a modal double-faced card can be, rulings); lands are still
    // played and other effects still put permanents onto the battlefield (rulings).
    const cantCast = /^(You|Your opponents) can't cast ((?:white |blue |black |red |green )?(?:creature|noncreature)|permanent) spells\.$/.exec(line);
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
    // Kianne, Corrupted Memory: "As long as ~'s power is even, you may cast noncreature spells as though they had flash":
    // those spells, while the condition holds as the spell is proposed (CR 702.8a, 601.2).
    const flashForWhile = /^As long as ([^,]+), you may cast ((?:non)?creature) spells as though they had flash\.$/.exec(line);
    const ffwCond = flashForWhile ? parseStaticCondition(flashForWhile[1]!, { affects: { kind: "self" }, mods: [], text: line }) : null;
    const ffwSpec = flashForWhile ? parseTargetPhrase(`${flashForWhile[2]} spell`) : null;
    if (ffwCond && ffwSpec?.kind === "spell" && !ffwSpec.controller) {
      (out.flashForWhile ??= []).push({ filter: { ...ffwSpec, text: `${flashForWhile![2]} spells` }, condition: ffwCond });
      continue;
    }
    // "Any player may cast Sliver spells as though they had flash" (Quick Sliver), "... spells ..." (Tidal Barracuda): every
    // player, not only its controller (CR 702.8a).
    // Rootwater Shaman: "You may cast Aura spells with enchant creature as though they had flash": only an Aura whose
    // enchant ability is "enchant creature" (CR 702.5a, 702.8a).
    if (line === "You may cast Aura spells with enchant creature as though they had flash.") {
      (out.flashFor ??= []).push({ kind: "spell", subtypes: ["Aura"], enchantCreature: true, text: "Aura spells with enchant creature" });
      continue;
    }
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
    // Dodecapod: "... put it onto the battlefield with two +1/+1 counters on it instead of putting it into your graveyard"
    // (it enters with them, CR 614.1c).
    const toBattlefield = /^If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield( with (two|three) \+1\/\+1 counters on it)? instead of putting it into your graveyard\.$/.exec(line);
    if (toBattlefield) {
      out.discardedToBattlefield = true;
      if (toBattlefield[2]) out.discardedToBattlefieldCounters = num(toBattlefield[2]);
      continue;
    }
    // Prototype (CR 702.160a, 718): cast it with the alternative mana cost, color, power and toughness (see prototypedDef).
    const proto = /^Prototype ((?:\{[^}]+\})+) — (\d+)\/(\d+)$/.exec(line);
    if (proto && parseManaCost(proto[1]!).supported && !parseManaCost(proto[1]!).hasX) {
      (out.altCosts ??= []).push({ kind: "prototype", mana: proto[1]! });
      continue;
    }
    // Tombstone Stairwell: "At the beginning of each end step and when ~ leaves the battlefield, destroy all tokens created
    // with ~. They can't be regenerated.": two triggered abilities with the same effect (CR 603.2), the second looking back
    // to the permanent that left (CR 603.10a) for the tokens its abilities created (CR 607.2).
    const endOrLeaves = /^At the beginning of each end step and when ~ leaves the battlefield, (destroy all tokens created with ~\. They can't be regenerated\.)$/.exec(line);
    if (endOrLeaves) {
      const a = parseTrigger(`At the beginning of each end step, ${endOrLeaves[1]}`);
      const b = parseTrigger(`When ~ leaves the battlefield, ${endOrLeaves[1]}`);
      if (a && a !== "fail" && b && b !== "fail") {
        out.triggers.push(a, b);
        continue;
      }
    }
    // Myr Servitor: "At the beginning of your upkeep, if ~ is on the battlefield, ...": an intervening "if" (CR 603.4) that's
    // true as it triggers, so what counts is that ~ is still on the battlefield as it resolves (rulings).
    // Tombstone Stairwell: "At the beginning of each upkeep, if ~ is on the battlefield, ..." the same, at each player's.
    const stillHere = /^(At the beginning of (?:your|each) upkeep), if ~ is on the battlefield, (.+)$/.exec(line);
    if (stillHere) {
      const t = parseTrigger(`${stillHere[1]}, ${stillHere[2]}`);
      if (t && t !== "fail" && (t.event === "yourUpkeep" || t.event === "eachUpkeep") && !t.body.targets.length && Object.keys(t).every((k) => k === "event" || k === "body")) {
        out.triggers.push({ ...t, body: { ...t.body, effects: [{ type: "if", cond: { kind: "selfHere" }, effects: t.body.effects }], text: line.replace(/^At the beginning of (?:your|each) upkeep, /, "") } });
        continue;
      }
    }
    // Pharika's Spawn: "~ escapes with two +1/+1 counters on it. When it enters this way, each opponent sacrifices ...": the
    // counters (CR 702.138c) and a trigger only when it escaped.
    const escThisWay = new RegExp(`^~ escapes with ${NUM} \\+1/\\+1 counters? on it\\. When it enters this way, (.+)$`).exec(line);
    if (escThisWay) {
      const t = parseTrigger(`When ~ enters, if it escaped, ${escThisWay[2]}`);
      if (t && t !== "fail" && !out.escapesWith) {
        out.escapesWith = num(escThisWay[1]!);
        out.triggers.push(t);
        continue;
      }
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
    // Lo and Li, Royal Advisors: "Whenever an opponent discards a card or mills one or more cards, ...": two events, each
    // its own trigger (a discard is one card, CR 701.9a; a mill, all the cards that player milled at once, CR 701.17a).
    const discardOrMill = /^Whenever an opponent discards a card or mills one or more cards, (.+)$/.exec(line);
    if (discardOrMill && !/\b(?:that card|those cards|that player|they|them)\b/.test(discardOrMill[1]!)) {
      const halves = [`Whenever an opponent discards a card, ${discardOrMill[1]}`, `Whenever an opponent mills one or more cards, ${discardOrMill[1]}`].map((l) => parseTrigger(l));
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
    // Fumiko the Lowblood: "~ has bushido X, where X is the number of attacking creatures": bushido (CR 702.45a) with X
    // counted each time it resolves (rulings).
    const bushidoX = /^~ has bushido X, where X is (the number of attacking creatures)\.$/.exec(line);
    const bushidoCount = bushidoX && parseCount(bushidoX[1]!, null);
    if (bushidoCount) {
      out.triggers.push({ event: "selfBlocksOrBecomesBlocked", body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: bushidoCount, toughness: bushidoCount }], duration: "endOfTurn" }], text: `Bushido X: ~ gets +X/+X until end of turn, where X is ${bushidoX![1]}.` } });
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
    // Pardic Firecat, Diligent Farmhand: "If ~ is in a graveyard, effects from spells named Flame Burst count it as a card
    // named Flame Burst": only when such a spell counts cards by that name (Count cardsInGraveyard); it keeps its own name
    // everywhere else.
    const countsAs = /^If ~ is in a graveyard, effects from spells named ([A-Z][\w'-]*(?: [A-Z][\w'-]*)*) count it as a card named ([A-Z][\w'-]*(?: [A-Z][\w'-]*)*)\.$/.exec(line);
    if (countsAs && countsAs[1] === countsAs[2]) {
      out.countsAsNamed = countsAs[1]!;
      continue;
    }
    const untapInstead = new RegExp(`^If a permanent with an? ${COUNTER} counter on it would untap during its controller's untap step, remove all \\1 counters from it instead\\.$`).exec(line);
    if (untapInstead) {
      out.untapRemovesCounters = counterKind(untapInstead[1]!);
      continue;
    }
    // Circling Vultures: "You may discard ~ any time you could cast an instant." (CR 116.2e): a special action, so not an
    // activated ability (rulings: Pithing Needle doesn't stop it).
    if (line === "You may discard ~ any time you could cast an instant.") {
      out.discardAnyTime = true;
      continue;
    }
    // Rasputin Dreamweaver: "~ can't have more than seven dream counters on it" (CR 122.4, 704.5r).
    const maxCounters = new RegExp(`^~ can't have more than ${NUM} ${COUNTER} counters on it\\.$`).exec(line);
    if (maxCounters && !/^[+-]/.test(maxCounters[2]!)) {
      (out.maxCounters ??= []).push({ counter: counterKind(maxCounters[2]!), n: num(maxCounters[1]!) as number });
      continue;
    }
    // Bewitching Leechcraft's granted "If ~ would untap during your untap step, remove a +1/+1 counter from it instead. If you
    // do, untap it.": a replacement effect on that creature's untapping in its controller's untap step (CR 614.1a, 502.3);
    // with no counter to remove it doesn't untap. Each instance counts (see untapStep in game.ts).
    if (line === "If ~ would untap during your untap step, remove a +1/+1 counter from it instead. If you do, untap it.") {
      out.untapRemovesOwnCounter = 1;
      continue;
    }
    if (line === "Skip your draw step.") {
      out.skipDrawStep = true;
      continue;
    }
    // Fasting: "If you would begin your draw step, you may skip that step instead. If you do, you gain 2 life.": chosen
    // as the step would begin (rulings, CR 614.10), its controller's draw steps only.
    const maySkipDraw = /^If you would begin your draw step, you may skip that step instead\. If you do, you gain (\d+) life\.$/.exec(line);
    if (maySkipDraw) {
      out.maySkipDraw = { gain: Number(maySkipDraw[1]) };
      continue;
    }
    // Gibbering Descent: "Hellbent — Skip your upkeep step if you have no cards in hand.": checked as the step would start
    // (rulings, CR 614.10); the step is replaced, so nothing in it happens.
    if (stripAbilityWord(line) === "Skip your upkeep step if you have no cards in hand.") {
      out.skipUpkeepIfHellbent = true;
      continue;
    }
    // Storage Matrix (game.ts untapChoices): checked as the untap step's untapping comes, after phasing (CR 502.1-3).
    if (line === "As long as ~ is untapped, each player chooses artifact, creature, or land during their untap step. That player can untap only permanents of the chosen type this step.") {
      out.untapTypeChoice = true;
      continue;
    }
    if (line === "Players skip their untap steps." || line === "Each player skips their untap step.") {
      out.skipUntapSteps = true;
      continue;
    }
    if (line === "Players skip their upkeep steps.") {
      out.skipUpkeepSteps = true;
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
    // Bloatfly Swarm: "..., prevent that damage, remove that many +1/+1 counters from it, then give each player a rad
    // counter for each +1/+1 counter removed this way": the same, and the rad counters too, also for damage that can't be
    // prevented (rulings).
    if (/^If damage would be dealt to ~ while it has a \+1\/\+1 counter on it, prevent that damage, remove that many \+1\/\+1 counters from (?:~|it), then give each player a rad counter for each \+1\/\+1 counter removed this way\.$/.test(line)) {
      out.counterShield = true;
      out.counterShieldRad = true;
      continue;
    }
    // Magma Pummeler: "..., prevent that damage and remove that many +1/+1 counters from it. When one or more counters are
    // removed from ~ this way, it deals that much damage to any target": the same, and a reflexive trigger (CR 603.12)
    // once for each damage event that removed counters, "that much" being as many as were removed (rulings: all of them
    // when the damage is more).
    if (line === "If damage would be dealt to ~ while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from it. When one or more counters are removed from ~ this way, it deals that much damage to any target.") {
      const body = parseBody("~ deals X damage to any target.");
      if (!body) {
        out.unsupported.push(raw);
        continue;
      }
      out.counterShield = true;
      out.counterShieldReflect = { ...replaceX(body, { count: { kind: "eventAmount" } }), text: "~ deals that much damage to any target." };
      continue;
    }
    // Sekki, Seasons' Guide: "If damage would be dealt to ~, prevent that damage, remove that many +1/+1 counters from ~,
    // and create that many 1/1 colorless Spirit creature tokens": Protean Hydra's shield, and a token for each 1 damage,
    // however many counters it had, also for damage that can't be prevented (rulings).
    if (line === "If damage would be dealt to ~, prevent that damage, remove that many +1/+1 counters from ~, and create that many 1/1 colorless Spirit creature tokens.") {
      const token = parseToken(1, 1, "colorless Spirit");
      if (!token) {
        out.unsupported.push(raw);
        continue;
      }
      out.counterShield = "always";
      out.counterShieldTokens = token;
      continue;
    }
    // Rock Hydra: "For each 1 damage that would be dealt to ~, if it has a +1/+1 counter on it, remove a +1/+1 counter from
    // it and prevent that 1 damage." (CR 615): see dealDamage.
    if (line === "For each 1 damage that would be dealt to ~, if it has a +1/+1 counter on it, remove a +1/+1 counter from it and prevent that 1 damage.") {
      out.counterShield = "perOne";
      continue;
    }
    // Protean Hydra: "If damage would be dealt to ~, prevent that damage and remove that many +1/+1 counters from it":
    // all of it prevented, even with fewer counters or none (rulings).
    if (/^If damage would be dealt to ~, prevent that damage and remove that many \+1\/\+1 counters from (?:~|it)\.$/.test(line)) {
      out.counterShield = "always";
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
    // Unbreathing Horde: "... prevent that damage and remove a +1/+1 counter from it." the same; Undergrowth Champion's
    // "while it has a +1/+1 counter on it" only while it has one (rulings).
    if (line === "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~." || line === "If ~ would be dealt damage, prevent that damage and remove a +1/+1 counter from it.") {
      out.phantom = true;
      continue;
    }
    // Oathsworn Knight: "... from it." the same.
    if (/^If damage would be dealt to ~ while it has a \+1\/\+1 counter on it, prevent that damage and remove a \+1\/\+1 counter from (?:~|it)\.$/.test(line)) {
      out.phantom = "whileCounter";
      continue;
    }
    // The Mindskinner (CR 615.5, 615.12): see staticRules in damage.ts.
    if (line === "If a source you control would deal damage to an opponent, prevent that damage and each opponent mills that many cards.") {
      out.damageToOpponentsMills = true;
      continue;
    }
    // Hostility (CR 615.5): see staticRules in damage.ts.
    const hostility = /^If a spell you control would deal damage to an opponent, prevent that damage\. (Create an? [^.]+ token(?: with [a-z ]+)?) for each 1 damage prevented this way\.$/.exec(line);
    if (hostility && !isSpell) {
      const made = parseBody(`${hostility[1]!}.`, {});
      const e = made && made.targets.length === 0 && made.effects.length === 1 ? made.effects[0]! : undefined;
      if (e?.type === "createToken" && JSON.stringify(e.n) === "1" && Object.keys(e).every((k) => ["type", "token", "n", "who"].includes(k)) && (!e.who || JSON.stringify(e.who) === '{"ref":"you"}')) out.spellDamageToOpponentsTokens = e.token;
      else out.unsupported.push(raw);
      continue;
    }
    // Angel of Suffering (CR 615.5, 615.12): see staticRules in damage.ts.
    if (line === "If damage would be dealt to you, prevent that damage and mill twice that many cards.") {
      out.damageToYouMillsTwice = true;
      continue;
    }
    // Nine Lives (CR 615.5, 615.12): see staticRules in damage.ts.
    const nine = /^If a source would deal damage to you, prevent that damage and put an? ([a-z]+) counter on ~\.$/.exec(line);
    if (nine) {
      out.preventToYouCounter = nine[1]!;
      continue;
    }
    // The Wanderer (CR 615.1): see staticRules in damage.ts.
    const toYou = /^Prevent all (combat |noncombat )?damage that would be dealt to you( and other permanents you control)?\.$/.exec(line);
    if (toYou) {
      out.preventToYou = { ...(toYou[1] ? { combat: toYou[1] === "combat " ? ("only" as const) : ("non" as const) } : {}), ...(toYou[2] ? { others: true as const } : {}) };
      continue;
    }
    // Spirit of Resistance: "As long as you control a permanent of each color, prevent all damage that would be dealt to you":
    // the same shield, while five colors are among your permanents (a multicolored one counts as each of its colors,
    // rulings; CR 105.2).
    const resist = /^As long as you control a permanent of each color, prevent all damage that would be dealt to you\.$/.test(line);
    if (resist) {
      out.preventToYou = { cond: { kind: "colorsAmong", n: 5 } };
      continue;
    }
    // Purity: "If noncombat damage would be dealt to you, prevent that damage. You gain life equal to the damage prevented
    // this way." The life is part of the prevention (CR 615.5). See staticRules in damage.ts.
    const purity = /^If (combat |noncombat )?damage would be dealt to you, prevent that damage\. You gain life equal to the damage prevented this way\.$/.exec(line);
    if (purity) {
      out.preventToYou = { ...(purity[1] ? { combat: purity[1] === "combat " ? ("only" as const) : ("non" as const) } : {}), gain: true };
      continue;
    }
    // Stormwild Capridor: "If noncombat damage would be dealt to ~, prevent that damage. Put a +1/+1 counter on ~ for each 1
    // damage prevented this way." (CR 615.5) See staticRules in damage.ts.
    const capridor = /^If (combat |noncombat )?damage would be dealt to ~, prevent that damage\. Put an? ([+-]\d+\/[+-]\d+) counter on ~ for each 1 damage prevented this way\.$/.exec(line);
    if (capridor) {
      out.preventToSelfCounters = { ...(capridor[1] ? { combat: capridor[1] === "combat " ? ("only" as const) : ("non" as const) } : {}), counter: capridor[2]! };
      continue;
    }
    // Pariah, Palisade Giant, Martyrs of Korlis (CR 614.9): see staticRules in damage.ts.
    // Veteran Bodyguard: "As long as ~ is untapped, all damage that would be dealt to you by unblocked creatures is dealt
    // to ~ instead"; Weathered Bodyguards: "all combat damage": not trample damage from a blocked creature (rulings), which
    // isn't unblocked; with two of them, the player picks which one takes it (rulings).
    const redirect = /^(?:As long as ~ is untapped, a|A)ll (combat )?damage that would be dealt to you( and other permanents you control)?( by artifacts| by unblocked creatures)? is dealt to (~|enchanted creature|equipped creature) instead\.$/.exec(line);
    if (redirect && !(redirect[1] && redirect[3] !== " by unblocked creatures")) {
      out.damageToYouRedirect = {
        to: redirect[4] === "~" ? "self" : "attached",
        ...(redirect[2] ? { others: true as const } : {}),
        ...(line.startsWith("As long as") ? { untapped: true as const } : {}),
        ...(redirect[3] === " by artifacts" ? { by: { kind: "object" as const, types: ["Artifact"], text: "artifact" } } : {}),
        ...(redirect[3] === " by unblocked creatures" ? { by: { kind: "object" as const, types: ["Creature"], combat: "unblocked" as const, text: "unblocked creatures" } } : {}),
        ...(redirect[1] ? { combat: true as const } : {}),
      };
      continue;
    }
    // Harsh Judgment: "If an instant or sorcery spell of the chosen color would deal damage to you, it deals that damage to
    // its controller instead" (CR 614.9): see staticRules in damage.ts.
    if (line === "If an instant or sorcery spell of the chosen color would deal damage to you, it deals that damage to its controller instead.") {
      out.spellDamageToYouToController = { kind: "object", types: ["Instant", "Sorcery"], chosen: "color", text: "instant or sorcery spell of the chosen color" };
      continue;
    }
    // Gloom Surgeon: "If combat damage would be dealt to ~, prevent that damage and exile that many cards from the top of
    // your library." (CR 615.5): see staticRules in damage.ts.
    const surgeon = /^If (combat |noncombat )?damage would be dealt to ~, prevent that damage and exile that many cards from the top of your library\.$/.exec(line);
    if (surgeon) {
      out.preventToSelfExileTop = surgeon[1] ? { combat: surgeon[1] === "combat " ? "only" : "non" } : {};
      continue;
    }
    // Weeping Angel: "If ~ would deal combat damage to a creature, prevent that damage and that creature's owner shuffles
    // it into their library." (CR 615.5): see staticRules in damage.ts.
    if (line === "If ~ would deal combat damage to a creature, prevent that damage and that creature's owner shuffles it into their library.") {
      out.combatToCreatureShuffles = true;
      continue;
    }
    // Treacherous Link: see staticRules in damage.ts.
    if (line === "All damage that would be dealt to enchanted creature is dealt to its controller instead.") {
      out.attachedDamageToController = true;
      continue;
    }
    if (line === "If damage would be dealt to ~, instead that damage is dealt, but all other damage already dealt to ~ is healed.") {
      out.healsBeforeDamage = true;
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
    // Demonfire: "Hellbent — If you have no cards in hand, this spell can't be countered and the damage can't be prevented."
    // Static abilities of the spell (CR 113.6, 101.2), the condition checked whenever something would counter it and as
    // the damage is dealt (CR 615.12).
    const ifUncounterable = /^If ([^,]+), ~ can't be countered and the damage can't be prevented\.$/.exec(line);
    const ifUncounterableCond = ifUncounterable && !/\bX\b/.test(ifUncounterable[1]!) ? parseStaticCondition(ifUncounterable[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (ifUncounterable && isSpell) {
      if (!ifUncounterableCond || out.cantBeCounteredIf || unpreventableIf) out.unsupported.push(raw);
      else [out.cantBeCounteredIf, unpreventableIf] = [ifUncounterableCond, { cond: ifUncounterableCond, raw }];
      continue;
    }
    if (/^~ can't be countered\.$/.test(line)) {
      out.cantBeCountered = true;
      continue;
    }
    // Exquisite Firecraft: "Spell mastery — If there are two or more instant and/or sorcery cards in your graveyard, this
    // spell can't be countered." A static ability of the spell (CR 113.6, 101.2), checked whenever something would counter
    // it: only a count of its controller's graveyard.
    const masteryUncounterable = /^(?:Spell mastery — )?If (there are \w+ or more instant and\/or sorcery cards in your graveyard), ~ can't be countered\.$/.exec(line);
    if (masteryUncounterable && isSpell) {
      const cond = parseStaticCondition(masteryUncounterable[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || out.cantBeCounteredIf) out.unsupported.push(raw);
      else out.cantBeCounteredIf = cond;
      continue;
    }
    // Dragonlord's Prerogative: "If you revealed a Dragon card or controlled a Dragon as you cast this spell, this spell
    // can't be countered" (read as kicked above): a static ability of the spell while it's on the stack (CR 113.6, 101.2),
    // with how it was cast locked in (CR 601.2).
    if (line === "If ~ was kicked, ~ can't be countered." && isSpell && MAY_REVEAL.test(normalizeSelf(d))) {
      out.cantBeCounteredKicked = true;
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
    // Cunning Nightbonder: "Spells with flash you cast cost {1} less to cast and can't be countered": spells with flash
    // its controller cast, not copies or spells they gained control of (rulings), and not the card itself on the stack.
    const nightbonder = /^Spells with flash you cast (cost \{\d+\} less to cast) and can't be countered\.$/.exec(line);
    if (nightbonder) {
      (out.uncounterable ??= []).push({ filter: { kind: "spell", keywords: ["Flash"], text: "spells with flash you cast" }, castOnly: true });
      line = `Spells with flash you cast ${nightbonder[1]}.`;
    }
    // Phyrexian Ingester: "~ gets +X/+Y, where X is the exiled creature card's power and Y is its toughness": the card its
    // imprint ability exiled (CR 607.2a), as it is in exile, updated continuously (rulings).
    if (line === "~ gets +X/+Y, where X is the exiled creature card's power and Y is its toughness." && !isSpell) {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "modifyPT", power: { count: { kind: "linkedExiledPT", stat: "power" } }, toughness: { count: { kind: "linkedExiledPT", stat: "toughness" } } }], text: line });
      continue;
    }
    // Guile (see CompiledCard.counterExilesFree; effects/run-spells.ts counterOnStack).
    if (line === "If a spell or ability you control would counter a spell, instead exile that spell and you may play that card without paying its mana cost." && !isSpell) {
      out.counterExilesFree = true;
      continue;
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
    // Mana Maze: anyone's spell sharing a color with the last spell cast this turn, by anyone, with its colors as it was cast
    // (rulings): the first spell of a turn is never stopped, nor is a colorless one.
    if (line === "Players can't cast spells that share a color with the spell most recently cast this turn.") {
      out.cantCastSharingLastColor = true;
      continue;
    }
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
    // Ashes of the Abhorrent: "Players can't cast spells from graveyards or activate abilities of cards in graveyards."
    if (line === "Players can't cast spells from graveyards or activate abilities of cards in graveyards.") {
      out.cantCastFrom = { zones: ["graveyard"] };
      out.noGraveyardActivations = true;
      continue;
    }
    if (line === "Cards in graveyards can't be the targets of spells or abilities.") {
      out.graveyardUntargetable = true;
      continue;
    }
    // Tomik, Distinguished Advokist: "Lands on the battlefield and land cards in graveyards can't be the targets of spells
    // or abilities your opponents control.": every land, whoever controls it, and land cards in any graveyard; like
    // hexproof but not hexproof (rulings).
    if (line === "Lands on the battlefield and land cards in graveyards can't be the targets of spells or abilities your opponents control.") {
      const st = compile({ ...d, oracleText: "Lands can't be the targets of spells or abilities your opponents control." }).statics;
      if (st.length !== 1 || st[0]!.mods.length !== 1 || st[0]!.mods[0]!.kind !== "untargetable") out.unsupported.push(raw);
      else {
        out.statics.push({ ...st[0]!, text: line });
        out.yardLandsUntargetableByOpponents = true;
      }
      continue;
    }
    // Experimental Frenzy: "You can't play lands or cast spells from your hand.": other things with those cards still work
    // (cycling, rulings).
    if (line === "You can't play lands or cast spells from your hand.") {
      out.youCantPlayFromHand = true;
      continue;
    }
    // Tomik: "Your opponents can't play land cards from graveyards.": over any permission to (rulings).
    if (line === "Your opponents can't play land cards from graveyards.") {
      out.opponentsCantPlayYardLands = true;
      continue;
    }
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
    // Rock Jockey: "You can't play lands if ~ was cast this turn": while it's on the battlefield (rulings), a permanent that
    // was a spell cast this turn.
    if (line === "You can't play lands if ~ was cast this turn." && !isSpell) {
      out.noLandsIfCastThisTurn = true;
      continue;
    }
    // "You can't cast ~ if you've played a land this turn" (Rock Jockey): the same as "Cast ~ only if you didn't play a land
    // this turn" (CR 601.3), while it's somewhere it could be cast from (rulings).
    if (line === "You can't cast ~ if you've played a land this turn." && !out.castOnly) {
      out.castOnly = { kind: "not", cond: { kind: "playedLandThisTurn" } };
      continue;
    }
    if (line === "Players can't play lands.") {
      out.playersCantPlayLands = true;
      continue;
    }
    // Aggressive Mining: "You can't play lands.": its controller, the special action only; lands put onto the battlefield
    // by spells and abilities still arrive (rulings, CR 305.1, 101.2).
    if (line === "You can't play lands." && !isSpell) {
      out.youCantPlayLands = true;
      continue;
    }
    if (line === "Players can't search libraries.") {
      out.playersCantSearch = true;
      continue;
    }
    // CR 116.2d: "Any player may pay {2} for that player to ignore this effect until end of turn" (Leonin Arbiter); "Its
    // controller may exile three cards from their graveyard ..." (Lost in Thought), "That creature's controller may
    // sacrifice a permanent of their choice ..." (Volrath's Curse): a special action any time they have priority (rulings),
    // after which the effect doesn't apply to that player until end of turn.
    const ignore = /^(.+?\.) (Any player|Its controller|That creature's controller|That player) may (pay (\{\d+\})|sacrifice a permanent of their choice|exile three cards from their graveyard) for that player to ignore this effect until end of turn\.$/.exec(line);
    if (ignore && !out.ignorable) {
      const extra = ignore[4] ? null : parseAdditionalCost(/^sacrifice/.test(ignore[3]!) ? "Sacrifice a permanent" : "Exile three cards from your graveyard");
      const cost = ignore[4] ? { mana: ignore[4] } : extra ? { costs: [extra] } : null;
      if (!cost) {
        out.unsupported.push(raw);
        continue;
      }
      const text = `${ignore[3]} to ignore ~'s effect this turn`;
      if (ignore[1] === "Players can't search libraries." && ignore[2] === "Any player") {
        out.playersCantSearch = true;
        out.ignorable = { who: "any", ...cost, text };
        continue;
      }
      // Damping Engine: the player who controls the most permanents, while they do (rulings).
      const most = /^A player who controls more permanents than each other player can't play lands or cast (artifact, creature, or enchantment) spells\.$/.exec(ignore[1]!);
      const mostFilter = most && ignore[2] === "That player" ? parseTargetPhrase(`${most[1]} spell`) : null;
      if (mostFilter?.kind === "spell") {
        out.mostPermanentsCant = { ...mostFilter, text: `${most![1]} spell` };
        out.ignorable = { who: "mostPermanents", ...cost, text };
        continue;
      }
      // An Aura's effect on the creature it enchants: that creature's controller, whoever that is now.
      const st = (ignore[2] === "Its controller" || ignore[2] === "That creature's controller") && /^Enchanted creature /.test(ignore[1]!) ? parseStatic(ignore[1]!) : null;
      if (st && st.affects.kind === "attached" && !st.condition && d.subtypes.includes("Aura")) {
        out.statics.push({ ...st, condition: { kind: "notIgnored" }, text: line });
        out.ignorable = { who: "attachedController", ...cost, text };
        continue;
      }
      out.unsupported.push(raw);
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
    if (combatCap && !(combatCap[3] && combatCap[2] === "block") && (combatCap[3] !== " ~" || d.types.includes("Planeswalker") || d.types.includes("Battle") || d.oracleId.startsWith("granted:"))) {
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
    // Fires of Invention: both for its controller only; the two spells are every spell they've cast this turn, before Fires
    // was there too, and one cast during another turn or as a third is barred even when an effect says to cast it
    // (rulings).
    if (line === "You can cast spells only during your turn and you can cast no more than two spells each turn.") {
      out.castOnlyYourTurn = true;
      (out.castLimits ??= []).push({ who: "you", n: 2, text: "You can cast no more than two spells each turn." });
      continue;
    }
    // Dosan the Falling Leaf: no player can cast a spell during another player's turn, even while something resolves.
    if (line === "Players can cast spells only during their own turns.") {
      out.castOnlyOwnTurn = true;
      continue;
    }
    // City of Solitude: activated abilities too, mana abilities included and in any zone; triggered abilities still
    // trigger (rulings).
    if (line === "Players can cast spells and activate abilities only during their own turns.") {
      out.castOnlyOwnTurn = true;
      out.activateOnlyOwnTurn = true;
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
    // Sandswirl Wanderglyph: who they attacked earlier in the turn counts, even before it was there (rulings).
    if (line === "Each opponent who attacked you or a planeswalker you control this turn can't cast spells.") {
      out.opponentsWhoAttackedYouCantCast = true;
      continue;
    }
    if (line === "As long as ~ is attacking, defending player can't cast spells.") {
      out.defendingCantCastWhileAttacking = true;
      continue;
    }
    if (line === "Your opponents can't cast spells during combat.") {
      out.opponentsCantCastDuringCombat = true;
      continue;
    }
    // Hand to Hand: during the combat phase (CR 506.1) no player casts an instant spell or activates an ability that isn't a
    // mana ability, in any zone; mana abilities and special actions aren't stopped.
    if (line === "During combat, players can't cast instant spells or activate abilities that aren't mana abilities.") {
      out.combatNoInstantsOrAbilities = true;
      continue;
    }
    // Yuriko, Blade of the Mighty: Hand to Hand's rule for every spell, not only instants (CR 506.1: the combat phase).
    if (line === "During combat, players can't cast spells or activate abilities that aren't mana abilities.") {
      out.combatNoInstantsOrAbilities = true;
      out.opponentsCantCastDuringCombat = "all";
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
    // Overwhelming Splendor: an Aura with enchant player (CR 303.4a, 702.5a); see abilityProblem.
    if (line === "Enchanted player can't activate abilities that aren't mana abilities or loyalty abilities." && d.subtypes.includes("Aura") && /^Enchant player$/m.test(d.oracleText)) {
      out.enchantedNoActivations = true;
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
    // Stabilizer: "Players can't cycle cards." Typecycling too (CR 702.29f, rulings).
    if (line === "Players can't cycle cards.") {
      out.noCycling = true;
      continue;
    }
    if (line === "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.") {
      out.opponentsCantCastYourTurn = true;
      out.opponentsCantActivateYourTurn = true;
      continue;
    }
    // Molten Exhale: "You may cast ~ as though it had flash if you behold a Dragon as an additional cost to cast it": it may
    // begin to be cast as though it had flash (CR 601.3c), the behold (CR 701.4a) an optional additional cost paid like
    // kicker, which it then must be cast with when it couldn't be cast at sorcery speed (CompiledCard.flashIfKicked).
    const flashBehold = /^You may cast ~ as though it had flash if you behold an? ([A-Z][a-z]+) as an additional cost to cast it\.$/.exec(line);
    if (flashBehold) {
      const cost = subtypeSet(flashBehold[1]!) ? parseAdditionalCost(`behold ${/^[AEIOU]/.test(flashBehold[1]!) ? "an" : "a"} ${flashBehold[1]}`) : null;
      if (!cost || out.kicker || !isSpell || d.keywords.includes("Flash") || d.types.includes("Instant")) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [""], extraCosts: [cost], text: `behold ${/^[AEIOU]/.test(flashBehold[1]!) ? "an" : "a"} ${flashBehold[1]}`, optional: true };
        out.flashIfKicked = true;
      }
      continue;
    }
    // Tegwyll's Scouring: "You may cast ~ as though it had flash by tapping three untapped creatures you control with flying
    // in addition to paying its other costs": begun as though it had flash when there are three to tap (CR 601.3c), the
    // tapping an optional additional cost paid like kicker, which it must then be cast with when it couldn't be cast at
    // sorcery speed (flashIfKicked); at sorcery speed it isn't paid (it's the price of the flash only).
    const flashTap = /^You may cast ~ as though it had flash by (tapping [^.]+?) in addition to paying its other costs\.$/.exec(line);
    if (flashTap) {
      const text = flashTap[1]!.replace(/^tapping/, "tap");
      const cost = parseAdditionalCost(text);
      if (cost?.kind !== "tap" || cost.x || out.kicker || !isSpell || d.keywords.includes("Flash") || d.types.includes("Instant")) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [""], extraCosts: [cost], text, optional: true };
        out.flashIfKicked = true;
      }
      continue;
    }
    // Fated Clash: "You may cast this spell as though it had flash if a creature is attacking and a creature is blocking":
    // anyone's, both true as you'd begin to cast it (CR 601.3), the same with the card in hand.
    if (line === "You may cast ~ as though it had flash if a creature is attacking and a creature is blocking." && !out.flashIf) {
      const inCombat = (combat: "attacking" | "blocking"): StaticCondition => ({ kind: "amount", amount: { count: { kind: "permanents", filter: { kind: "object", types: ["Creature"], combat, text: `${combat} creatures` } } }, min: 1 });
      out.flashIf = { kind: "allOf", conds: [inCombat("attacking"), inCombat("blocking")] };
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
    // Silver Scrutiny: "You may cast ~ as though it had flash if X is 3 or less": the X announced as it's cast (CR 601.3b).
    const flashX = /^You may cast ~ as though it had flash if X is (\d+) or less\.$/.exec(line);
    if (flashX && /\{X\}/.test(d.manaCost ?? "")) {
      out.flashIfXAtMost = Number(flashX[1]);
      continue;
    }
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
      // Swift Reckoning: "two or more instant and/or sorcery cards in your graveyard", a count of your graveyard's cards.
      // Graveyard Shift: "five or more mana values among cards in your graveyard", counted as you'd begin to cast it, itself
      // too if it's cast from there (rulings).
      const yardCount = cond?.kind === "amount" && typeof cond.amount === "object" && "count" in cond.amount && (cond.amount.count.kind === "cardsInGraveyard" || (cond.amount.count.kind === "graveyardManaValues" && !cond.amount.count.filter)) && cond.amount.count.who?.ref === "you" && cond.max === undefined;
      const aboutPlayer = !!cond && (FLASH_IF.includes(cond.kind) || yardCount) && !(cond.kind === "control" && (cond.other || cond.who === "defending"));
      // Colossal Rattlewurm: "~ has flash as long as you control a Desert": while it's a spell, castable at instant speed
      // when you control one (rulings: checked before costs are paid, CR 601.3); on the battlefield the same condition
      // gives the permanent the keyword (CR 702.8a), a conditional static like "~ has flying as long as ...".
      const onBattlefield = permanentHas && aboutPlayer && cond!.kind === "control" ? parseConditionalStatic(`~ has flying as long as ${flashIf[1]!}.`) : null;
      if (onBattlefield && !out.flashIf) {
        out.flashIf = cond!;
        out.statics.push({ ...onBattlefield, mods: [{ kind: "addKeywords", keywords: ["Flash"] }], text: line });
      } else if (!aboutPlayer || permanentHas || out.flashIf) out.unsupported.push(raw);
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
    // Ancient Imperiosaur: "~ enters with two +1/+1 counters on it for each creature that convoked it": the creatures tapped
    // to pay for the spell it was (CR 702.51a), none if it wasn't cast, as it enters (CR 614.1c).
    const eachConvoked = new RegExp(`^~ enters with (a|an|two|three) ${COUNTER} counters? on it for each creature that convoked it\\.$`).exec(line);
    if (eachConvoked) {
      const per = eachConvoked[1] === "two" ? 2 : eachConvoked[1] === "three" ? 3 : 1;
      if (out.entersWithCounters || !out.convoke) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(eachConvoked[2]!), n: { count: { kind: "convokedCount" }, ...(per > 1 ? { times: per } : {}) } };
      continue;
    }
    // Clay Champion: "~ enters with three +1/+1 counters on it for each {G}{G} spent to cast it": whole pairs of that color
    // spent on the spell it was (CR 601.2h), none if it wasn't cast, as it enters (CR 614.1c).
    const eachPair = new RegExp(`^~ enters with (a|an|two|three) ${COUNTER} counters? on it for each \\{([WUBRG])\\}\\{\\3\\} spent to cast it\\.$`).exec(line);
    if (eachPair) {
      const per = eachPair[1] === "two" ? 2 : eachPair[1] === "three" ? 3 : 1;
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(eachPair[2]!), n: { count: { kind: "spentPairs", color: eachPair[3] as Color }, ...(per > 1 ? { times: per } : {}) } };
      continue;
    }
    // Verazol, the Split Current: "~ enters with a +1/+1 counter on it for each mana spent to cast it": the same, none if
    // it wasn't cast (rulings), commander tax and other additional costs counted.
    const eachSpent = new RegExp(`^~ enters with an? ${COUNTER} counter on it for each mana spent to cast it\\.$`).exec(line);
    if (eachSpent) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(eachSpent[1]!), n: { count: { kind: "manaSpent" } } };
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
    // Unbreathing Horde: "~ enters with a +1/+1 counter on it for each other Zombie you control and each Zombie card in
    // your graveyard": both counts added up, counted as it enters (CR 614.1c).
    const ewcEach = new RegExp(`^~ enters with an? ${COUNTER} counter on it for each (.+? you control) and each (.+? card in your graveyard)\\.$`).exec(line);
    if (ewcEach) {
      const a = parseCount(ewcEach[2]!, null, true);
      const b = parseCount(ewcEach[3]!, null, true);
      const plain = (x: typeof a) => !!x && typeof x === "object" && !x.times && !x.plus && !x.half && !x.negate;
      if (!a || !b || !plain(a) || !plain(b) || out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(ewcEach[1]!), n: { count: { kind: "sum", of: [a.count, b.count] } } };
      continue;
    }
    // Agent's Toolkit: "~ enters with a +1/+1 counter, a flying counter, a deathtouch counter, and a shield counter on it.":
    // one of each kind, all as it enters (CR 614.1c, 122.6).
    const ewcList = new RegExp(`^~ enters with ((?:${NUM} ${COUNTER} counters?, )+and ${NUM} ${COUNTER} counters?) on it\\.$`).exec(line);
    if (ewcList) {
      const parts = ewcList[1]!.split(/, (?:and )?/).map((x) => new RegExp(`^${NUM} ${COUNTER} counters?$`).exec(x));
      const kinds = parts.map((x) => (x ? { counter: counterKind(x[2]!), n: num(x[1]!) } : null));
      if (out.entersWithCounters || kinds.some((k) => !k || !k.n) || new Set(kinds.map((k) => k?.counter)).size !== kinds.length) out.unsupported.push(raw);
      else {
        const [first, second, ...rest] = kinds as { counter: CounterKind; n: number }[];
        out.entersWithCounters = { counter: first!.counter, n: first!.n, also: second!, ...(rest.length ? { more: rest } : {}) };
      }
      continue;
    }
    // Dust Animus: "If you control five or more untapped lands, ~ enters with two +1/+1 counters and a lifelink counter on
    // it": both kinds at once if the condition holds as it enters (a replacement effect, CR 614.1c).
    const ewcIfTwo = new RegExp(`^If (.+?), ~ enters(?: the battlefield)? with ${NUM} ${COUNTER} counters? and ${NUM} ${COUNTER} counters? on it\\.$`).exec(line);
    if (ewcIfTwo) {
      const cond = parseStaticCondition(ewcIfTwo[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || out.entersWithCounters || ewcIfTwo[3] === ewcIfTwo[5]) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(ewcIfTwo[3]!), n: num(ewcIfTwo[2]!), if: cond, also: { counter: counterKind(ewcIfTwo[5]!), n: num(ewcIfTwo[4]!) } };
      continue;
    }
    // Sheriff of Safe Passage: "~ enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other
    // creature you control": one more than that count, counted as it enters.
    line = line.replace(/^~ enters with a \+1\/\+1 counter on it plus an additional \+1\/\+1 counter on it for each other creature you control\.$/, "~ enters with X +1/+1 counters on it, where X is one plus the number of other creatures you control.");
    // "Jeska enters with a loyalty counter on her for each ...": on ~ too.
    const ewc = new RegExp(`^(?:(?:Raid|Morbid|Revolt) — )?~ enters(?: the battlefield)?( tapped(?: and)?)? with ${NUMX} ${COUNTER} counters? on (?:it|~)(?: for each (.+?)|, where X is (.+?)| if (.+?)| unless (you've cast another (?:white|blue|black|red|green) spell this turn))?\\.$`).exec(line);
    if (ewc) {
      // "With a +1/+1 counter on it for each ...", "with X +1/+1 counters, where X is ...": counted as it enters.
      // "~ enters tapped with three stun counters on it." "... if you attacked this turn" (raid), "... if a creature
      // died this turn" (morbid), "... if you cast it from your hand": checked as it enters.
      // Hotheaded Giant: "... unless you've cast another red spell this turn", checked as it enters, not counting itself.
      const [, tapped, count, kind, each, where, ifText, unlessText] = ewc;
      const fromHand = ifText === "you cast it from your hand";
      // Epochrasite: "... if you didn't cast it from your hand": put onto the battlefield, or cast from anywhere else.
      const notFromHand = ifText === "you didn't cast it from your hand";
      // "If you cast it" (Nine-Lives Familiar): it enters from the stack as the spell it was, not a copy (CR 601.2i).
      const ifCast = ifText === "you cast it";
      const parsed = unlessText ? parseStaticCondition(unlessText, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
      const unless = parsed?.kind === "castAnother" ? { kind: "castAnother" as const, entering: true as const, ...(parsed.color ? { color: parsed.color } : {}) } : parsed;
      const cond = unless ? { kind: "not" as const, cond: unless } : unless === null ? null : ifText && !fromHand && !notFromHand && !ifCast ? parseStaticCondition(ifText, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
      const per = each ? parseCount(each, null, true) : null;
      const def = where ? parseCount(where, null) : null;
      const n = per ? scaleAmount(amt(count!), per) : def ? substituteX(amt(count!), def) : amt(count!);
      if ((each && !per) || (where && !def) || cond === null || !n || out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: counterKind(kind!), n, ...(cond ? { if: cond } : {}), ...(fromHand ? { castFromHand: true as const } : {}), ...(notFromHand ? { notCastFromHand: true as const } : {}), ...(ifCast ? { ifCast: true as const } : {}) };
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
    // Bronzehide Lion, Old-Growth Troll: "When ~ dies, return it to the battlefield. It's an Aura enchantment with ..." (round 344).
    if (round344Line(line, raw, out, isSpell, d, compileCard)) continue;
    // Enduring Angel: "If your life total would be reduced to 0 or less, instead transform ~ ..." (round 345).
    if (round345Line(line, out, isSpell)) continue;
    // Greater Gargadon: "...: Remove a time counter from ~. Activate only if ~ is suspended." (round 346).
    if (round346Line(line, raw, out, isSpell)) continue;
    if (round347Line(line, raw, out, isSpell)) continue;
    // Firesong and Sunspeaker: spells of one color with lifelink, and life gained because such a spell resolves (round 348).
    if (round348Line(line, raw, out, isSpell)) continue;
    // Hot Pursuit: control of every goaded or suspected creature once two players have lost (round 349).
    if (round349Line(line, raw, out, isSpell)) continue;
    if (round350Line(line, raw, out, isSpell)) continue;
    // Eater of Virtue, Deification, The War Doctor, King of the Oathbreakers (round 351).
    if (round351Line(line, raw, out, isSpell)) continue;
    // Winter, Cynical Opportunist, Ob Nixilis, the Adversary, Panoptic Mirror (round 352).
    if (round352Line(line, raw, out, isSpell)) continue;
    // Hive Mind, Curse of Echoes, Spinerock Tyrant (round 353).
    if (round353Line(line, raw, out, isSpell)) continue;
    // Hofri Ghostforge's Spirit tokens (round 354).
    if (round354Line(line, raw, out, isSpell)) continue;
    // Cairn Wanderer: keywords while a creature card in a graveyard has them (round 358).
    if (round358Line(line, raw, out, isSpell)) continue;
    // Expedited Inheritance, Sin, Spira's Punishment (round 359).
    if (round359Line(line, raw, out, isSpell)) continue;
    // Undercellar Sweep (round 360).
    if (round360Line(line, raw, out, isSpell)) continue;
    // Zuko, Conflicted, Resplendent Marshal, Vislor Turlough, Oblivious Bookworm (round 361).
    if (round361Line(line, raw, out, isSpell)) continue;
    // Round 362.
    if (round362Line(line, raw, out, isSpell)) continue;
    // Round 363's whole lines (oracle/round363.ts).
    if (round363Line(line, raw, out, isSpell)) continue;
    // Round 364's whole lines (oracle/round364.ts).
    if (round364Line(line, raw, out, isSpell)) continue;
    // Round 365's whole lines (oracle/round365.ts).
    if (round365Line(line, raw, out, isSpell)) continue;
    // Round 366's whole lines (oracle/round366.ts).
    if (round366Line(line, raw, out, isSpell)) continue;
    // Round 367's whole lines (oracle/round367.ts).
    if (round367Line(line, raw, out, isSpell)) continue;
    // Round 368's whole lines (oracle/round368.ts).
    if (round368Line(line, raw, out, isSpell)) continue;
    // Cloudform, Lightform, Rageform: "When ~ enters, it becomes an Aura with enchant creature. Manifest the top card of your
    // library and attach ~ to it.": the enchantment becomes an Aura with enchant creature from then on (a resolved effect, CR
    // 611.2c), only if it's still the same object on the battlefield (CR 400.7); the card is manifested either way (rulings,
    // CR 701.40a), and the Aura attached to it if it can be (CR 701.3b). With no card to manifest, it's an Aura attached to
    // nothing, put into the graveyard as a state-based action (rulings, CR 704.5m).
    if (line === "When ~ enters, it becomes an Aura with enchant creature. Manifest the top card of your library and attach ~ to it." && d.types.includes("Enchantment") && !d.subtypes.includes("Aura") && !out.enchant && !d.types.includes("Creature")) {
      out.triggers.push({
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "continuous", what: { ref: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: ["Aura"] }, { kind: "enchantCreature" }], duration: "game" },
            { type: "dig", n: 1, count: 1, upTo: false, required: true, into: "manifest", rest: "graveyard", reveal: false },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "It becomes an Aura with enchant creature. Manifest the top card of your library and attach ~ to it.",
        },
      });
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
    // Belt of Giant Strength: "Equip {10}. This ability costs {X} less to activate, where X is the power of the creature it
    // targets": {1} less for each point of its power as the cost is worked out (CR 601.2f, 602.2b).
    const equipLessPer = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. This ability costs \{(\d+)\} less to activate for each (color of|\+1\/\+1 counter on) the creature it targets\.$/.exec(line) ?? /^Equip (\{[^}]+\}(?:\{[^}]+\})*)\. This ability costs \{(X)\} less to activate, where X is (the power of) the creature it targets\.$/.exec(line);
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
        ...(equipLessPer ? { costLessPerTarget: { n: equipLessPer[2] === "X" ? 1 : Number(equipLessPer[2]), each: equipLessPer[3] === "color of" ? ("color" as const) : equipLessPer[3] === "the power of" ? ("power" as const) : ("+1/+1" as const) } } : {}),
        ...(lessCond ? { costLessIf: { n: Number(equipLessIf![2]), cond: lessCond } } : {}),
        ...(lessEach ? { costLess: { ...lessEach, times: (lessEach.times ?? 1) * Number(equipLessEach![2]) } } : {}),
        ...(equipOnce ? { oncePerTurn: true } : {}),
      });
      continue;
    }
    // Arcanum Wings: "Aura swap {2}{U}" means "{2}{U}: You may exchange this permanent with an Aura card in your hand."
    // (CR 702.65a).
    const auraSwap = /^Aura swap ((?:\{[^}]+\})+)$/.exec(line);
    if (auraSwap && d.subtypes.includes("Aura")) {
      out.activated.push({
        manaCost: auraSwap[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        body: { targets: [], effects: [{ type: "putFromHand", filter: { kind: "card", subtypes: ["Aura"], text: "Aura card" }, may: true, auraSwap: true }], text: "You may exchange ~ with an Aura card in your hand." },
        text: line,
      });
      continue;
    }
    // Darksteel Garrison: "Fortify {3}" means "{3}: Attach this Fortification to target land you control. Activate only as
    // a sorcery." (CR 702.67a). Not an equip ability.
    const fortify = /^Fortify ((?:\{[^}]+\})+)$/.exec(line);
    if (fortify && d.subtypes.includes("Fortification")) {
      out.activated.push({
        manaCost: fortify[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [{ kind: "object", types: ["Land"], controller: "you", text: "target land you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach to target land you control." },
        text: line,
      });
      continue;
    }
    // Transmogrant's Crown: "Equip {2} or {B}": either cost attaches it the same way, so it's an equip ability for each
    // cost, any of which may be activated (CR 702.6a, 702.6d), as for Bloodthorn Flail below.
    const equipTwo = /^Equip ((?:\{[^}]+\})+) or ((?:\{[^}]+\})+)$/.exec(line);
    if (equipTwo && d.subtypes.includes("Equipment")) {
      for (const cost of [equipTwo[1]!, equipTwo[2]!])
        out.activated.push({
          manaCost: cost,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", text: "target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach to target creature you control." },
          text: `Equip ${cost}`,
          equip: true,
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
    // "Equip—Pay {3} or remove a counter from this Equipment." (Gavel of the Righteous): a counter of any kind.
    const equipOr = equipCost && !equipCost[2] ? /^Pay ((?:\{[^}]+\})+) or (discard (?:a|one) card|remove a counter from ~)$/.exec(equipCost[1]!) : null;
    if (equipOr && d.subtypes.includes("Equipment")) {
      const other = equipOr[2]!.charAt(0).toUpperCase() + equipOr[2]!.slice(1).replace(/^Discard one/, "Discard a");
      const acts = [equipOr[1]!, other].map((c) => parseActivated(`${c}: Attach ~ to target creature you control. Activate only as a sorcery.`));
      if (acts.some((a) => !a || a === "fail")) out.unsupported.push(raw);
      else acts.forEach((a, i) => out.activated.push({ ...(a as ActivatedAbility), text: i === 0 ? `Equip—Pay ${equipOr[1]!}.` : `Equip—${other}.`, equip: true }));
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
    // Razorfield Ripper: "Reconfigure—Pay {2} or {E}{E}{E}": each of the two abilities with a choice of costs, made as it's
    // activated (CR 602.2b, 601.2b), compiled as one ability per cost (as Bloodthorn Flail's equip).
    const reconfigureOr = /^Reconfigure—Pay ((?:\{(?:\d+|[WUBRGC])\})+) or ((?:\{E\})+)\.$/.exec(line);
    const reconfigure = /^Reconfigure ((?:\{[^}]+\})+)$/.exec(line) ?? reconfigureOr;
    if (reconfigure && d.subtypes.includes("Equipment") && !out.reconfigure) {
      out.reconfigure = true;
      const energy = reconfigureOr ? reconfigureOr[2]!.length / 3 : 0;
      for (const mana of reconfigureOr ? [reconfigureOr[1]!, ""] : [reconfigure[1]!]) {
        const cost = mana ? { manaCost: mana } : { manaCost: "", energyCost: energy };
        const shown = mana || reconfigureOr![2]!;
        out.activated.push(
          {
            ...cost,
            tap: false,
            sacrificeSelf: false,
            sorcerySpeed: true,
            body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", notSource: true, text: "another target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach ~ to another target creature you control." },
            text: `Reconfigure ${shown}: attach ~ to another target creature you control.`,
          },
          {
            ...cost,
            tap: false,
            sacrificeSelf: false,
            sorcerySpeed: true,
            activateIf: { kind: "self", is: "attachedToCreature" },
            body: { targets: [], effects: [{ type: "unattachSelf" }], text: "Unattach ~." },
            text: `Reconfigure ${shown}: unattach ~.`,
          },
        );
      }
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
    // Phyrexian Purge: "This spell costs 3 life more to cast for each target": an additional cost, paid as it's cast (CR
    // 601.2f-h, with its targets chosen in 601.2c), none of it given back if it's countered (rulings).
    const lifePerTarget = /^(?:~|This spell) costs (\d+) life more to cast for each target\.$/.exec(line);
    if (lifePerTarget && (d.types.includes("Instant") || d.types.includes("Sorcery"))) {
      out.additionalCosts = [...(out.additionalCosts ?? []), { kind: "payLife", n: Number(lifePerTarget[1]), perTarget: true }];
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
    // The Blue Spirit: "You may cast the first creature spell you cast each turn as though it had flash": the flash alone.
    const firstFlashOnly = /^You may cast the first (creature |artifact |noncreature )?spell you cast each turn as though it had flash\.$/.exec(line);
    if (firstFlashOnly) {
      const spec = firstFlashOnly[1] ? parseTargetPhrase(`${firstFlashOnly[1]}spell`) : { kind: "spell" as const, text: "spell" };
      if (spec?.kind !== "spell" || spec.controller) out.unsupported.push(raw);
      else (out.flashForFirst ??= []).push({ ...spec, text: `${firstFlashOnly[1] ?? ""}spells` });
      continue;
    }
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
    // Gran-Gran: "Noncreature spells you cast cost {1} less to cast as long as there are three or more Lesson cards in your
    // graveyard": one cost change, only while that's true as the cost is determined (CR 601.2f, 611.3a).
    const costWhile = /^(.+ cost \{\d+\} (?:less|more) to cast) as long as (.+)\.$/.exec(line);
    if (costWhile) {
      const cond = parseStaticCondition(costWhile[2]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || !conditionalAbility(d, `${costWhile[1]}.`, out, cond)) out.unsupported.push(raw);
      continue;
    }
    // Kaervek's Torch: "As long as ~ is on the stack, spells that target it cost {2} more to cast": each spell targeting
    // it (or a copy of it) on the stack, once however often it targets it, worked out after its targets are chosen (CR
    // 601.2c, 601.2f).
    const stackTax = /^As long as ~ is on the stack, spells that target it cost \{(\d+)\} more to cast\.$/.exec(line);
    if (stackTax && (d.types.includes("Instant") || d.types.includes("Sorcery"))) {
      out.stackTargetTax = Number(stackTax[1]);
      continue;
    }
    // Hinata, Dawn-Crowned: "Spells you cast cost {1} less to cast for each target" (CR 601.2f, with the targets chosen in
    // 601.2c).
    const perTarget = /^Spells (you|your opponents) cast cost \{(\d+)\} (less|more) to cast for each target\.$/.exec(line);
    if (perTarget) {
      out.perTargetCost = [...(out.perTargetCost ?? []), { opponents: perTarget[1] !== "you", n: Number(perTarget[2]) * (perTarget[3] === "less" ? -1 : 1) }];
      continue;
    }
    // Geistlight Snare: "~ costs {1} less to cast if you control a Spirit. It also costs {1} less to cast if you control an
    // enchantment.": two reductions, each on its own condition (rulings: {2} less with both).
    const alsoLess = /^(~ costs \{\d+\} less to cast if [^.]+)\. It also (costs \{\d+\} less to cast if [^.]+)\.$/.exec(line);
    if (alsoLess) {
      const both = [parseCostChange(`${alsoLess[1]}.`), parseCostChange(`~ ${alsoLess[2]}.`)];
      if (both.every((c) => c && c !== "fail" && "lessIf" in c)) for (const c of both) out.costLessIf = [...(out.costLessIf ?? []), (c as { lessIf: NonNullable<CompiledCard["costLessIf"]>[number] }).lessIf];
      else out.unsupported.push(raw);
      continue;
    }
    const cost = parseCostChange(line);
    if (cost) {
      if (cost === "fail") out.unsupported.push(raw);
      // "Spells you cast of the chosen type" after "choose artifact, creature, ..." (Cloud Key): the card type chosen.
      else if ("costMod" in cost) out.costMods = [...(out.costMods ?? []), cost.costMod.filter.chosen === "type" && out.entersChoose?.some((c) => c.what === "cardType") ? { ...cost.costMod, filter: { ...cost.costMod.filter, chosen: "cardType" } } : cost.costMod];
      else if ("less" in cost) out.costLess = [...(out.costLess ?? []), cost.less];
      else if ("lessEachColored" in cost) out.costLessEachColored = [...(out.costLessEachColored ?? []), cost.lessEachColored];
      else if ("lessIfTargets" in cost) out.costLessIfTargets = [...(out.costLessIfTargets ?? []), cost.lessIfTargets];
      else if ("targetTax" in cost) out.targetTax = (out.targetTax ?? 0) + cost.targetTax;
      else if ("targetDiscount" in cost) out.targetDiscount = (out.targetDiscount ?? 0) + cost.targetDiscount;
      else if ("targetDiscountAny" in cost) out.targetDiscountAny = (out.targetDiscountAny ?? 0) + cost.targetDiscountAny;
      else if ("targetDiscountYou" in cost) out.targetDiscountYou = (out.targetDiscountYou ?? 0) + cost.targetDiscountYou;
      else if ("castTargetEnchantedPlayerLess" in cost) out.castTargetEnchantedPlayerLess = (out.castTargetEnchantedPlayerLess ?? 0) + cost.castTargetEnchantedPlayerLess;
      else if ("castTargetLess" in cost) out.castTargetLess = [...(out.castTargetLess ?? []), cost.castTargetLess];
      else if ("commanderTargetTax" in cost) out.commanderTargetTax = (out.commanderTargetTax ?? 0) + cost.commanderTargetTax;
      else if ("targetLifeTax" in cost) out.targetLifeTax = (out.targetLifeTax ?? 0) + cost.targetLifeTax;
      else if ("opponentsTargetTax" in cost) out.opponentsTargetTax = [...(out.opponentsTargetTax ?? []), cost.opponentsTargetTax];
      else out.costLessIf = [...(out.costLessIf ?? []), cost.lessIf];
      continue;
    }
    // "Enchanted creature has protection from the chosen color. This effect doesn't remove ~." (Cho-Manno's Blessing)
    // Tattoo Ward: "Enchanted creature gets +1/+1 and has protection from enchantments. This effect doesn't remove ~.";
    // Spectra Ward: "... protection from each color. This effect doesn't remove Auras.": no Aura falls off for it, this
    // one or another (rulings), though one from elsewhere still does (CR 702.16c).
    // Benevolent Blessing: "This effect doesn't remove Auras and Equipment you control that are already attached to it":
    // those attached as it begins to apply, this one included (CR 702.16p).
    const spare = /^(Enchanted creature (?:gets [+-]\d+\/[+-]\d+ and )?has protection from .+?\.) This effect doesn't remove (~|Auras|Auras and Equipment you control that are already attached to it)\.$/.exec(line);
    if (spare) {
      const st = parseStatic(spare[1]!);
      const prot = (m: Modification) => m.kind === "addKeywords" && m.keywords.every((k) => /^Protection from /.test(k));
      const ok = st?.affects.kind === "attached" && st.mods.length > 0 && st.mods.some(prot) && st.mods.every((m) => prot(m) || m.kind === "modifyPT");
      const spares = spare[2] === "Auras" ? ("auras" as const) : spare[2] === "~" ? (true as const) : ("attached" as const);
      if (ok) out.statics.push({ ...st, mods: st.mods.map((m) => (prot(m) ? { ...m, spares } : m)) as typeof st.mods, text: line });
      else out.unsupported.push(raw);
      continue;
    }
    // Zada, Hedron Grinder; Ink-Treader Nephilim; Precursor Golem (CR 707.10): a copy of the spell for each other creature
    // (or Golem) it could target, each copy targeting that one.
    const eachOther = /^Whenever (you cast|a player casts) an instant or sorcery spell(?: that targets only (~|a single ([A-Z][a-z]+)))?(, if that spell targets only ~)?, (copy (?:that|the) spell|that player copies that spell) for each other (creature you control|creature they control|creature|[A-Z][a-z]+) that (?:the )?spell could target\. Each copy targets a different one of those (?:creatures|[A-Z][a-z]+s)\.$/.exec(line);
    if (eachOther && !eachOther[2] !== !eachOther[4]) {
      const single = eachOther[3] ? parseTargetPhrase(eachOther[3]) : null;
      // Mirrorwing Dragon: "that player copies that spell for each other creature they control": the caster's creatures,
      // the copies theirs (rulings).
      const theyControl = eachOther[6] === "creature they control";
      const among = parseTargetPhrase(theyControl ? "creature you control" : eachOther[6]!);
      const self = !eachOther[3];
      if ((eachOther[3] && (single?.kind !== "object" || eachOther[6] !== eachOther[3])) || among?.kind !== "object" || (eachOther[5] === "that player copies that spell") !== (!!eachOther[3] || theyControl) || (theyControl && (eachOther[1] !== "a player casts" || eachOther[2] !== "~"))) {
        out.unsupported.push(raw);
        continue;
      }
      out.triggers.push({
        event: "castSpell",
        cast: { by: eachOther[1] === "you cast" ? "you" : "any", spell: { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "instant or sorcery spell" }, targetsOnly: single ? { ...single, text: eachOther[3]! } : "self" },
        body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: { ...among, text: eachOther[6]! }, ...(self ? { self: true as const } : {}), ...(eachOther[3] || theyControl ? { caster: true as const } : {}), ...(theyControl ? { casterControls: true as const } : {}), ...(eachOther[4] ? { onlySelf: true as const } : {}) } }], text: line.replace(/^Whenever [^,]+(?:, if that spell targets only ~)?, /, "") },
      });
      continue;
    }
    // Shiko and Narset, Unified: "Flurry — Whenever you cast your second spell each turn, copy that spell if it targets a
    // permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card."
    // Checked as the trigger resolves; a spell with such a target is copied even if no new target could be legal, and
    // one without it draws (rulings).
    if (line === "Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card.") {
      const t = parseTrigger("Whenever you cast your second spell each turn, copy that spell. You may choose new targets for the copy.");
      const draw = parseBody("Draw a card.");
      if (!t || t === "fail" || !draw || draw.targets.length) out.unsupported.push(raw);
      else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "if", cond: { kind: "causeTargetsPermanentOrPlayer" }, effects: t.body.effects, otherwise: draw.effects }], text: line.replace(/^Whenever [^,]+, /, "") } });
      continue;
    }
    // Ivy, Gleeful Spellthief: "Whenever a player casts a spell that targets only a single creature other than ~, you may
    // copy that spell. The copy targets ~." Every target of it the same creature (rulings), a copy for this ability's
    // controller aimed at ~ if ~ is a legal target for it, even if the spell is gone by then (rulings, CR 707.10c).
    if (line === "Whenever a player casts a spell that targets only a single creature other than ~, you may copy that spell. The copy targets ~.") {
      const creature = parseTargetPhrase("creature");
      if (creature?.kind !== "object") out.unsupported.push(raw);
      else
        out.triggers.push({
          event: "castSpell",
          cast: { by: "any", spell: { kind: "spell", text: "spell" }, targetsOnly: { ...creature, notSource: true, text: "a single creature other than ~" } },
          body: { targets: [], effects: [{ type: "may", effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: creature, toSource: true } }], text: "copy that spell (the copy targets ~)" }], text: "you may copy that spell. The copy targets ~." },
        });
      continue;
    }
    // Frontline Heroism: "Whenever you cast a spell that targets only a single creature you control, create a 1/1 red
    // Soldier creature token with haste, then copy that spell. The copy targets that token." Every target of the spell that
    // one creature (rulings), as it's cast; the copy is made even if the spell has left the stack, and only if the token
    // could be each of its targets; with a token doubler its controller picks one of the tokens (CR 707.10e, rulings).
    if (line === "Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.") {
      const creature = parseTargetPhrase("creature you control");
      const token = parseBody("Create a 1/1 red Soldier creature token with haste.");
      const any = parseTargetPhrase("creature");
      if (creature?.kind !== "object" || any?.kind !== "object" || !token || token.targets.length || token.effects.length !== 1 || token.effects[0]!.type !== "createToken") out.unsupported.push(raw);
      else
        out.triggers.push({
          event: "castSpell",
          cast: { by: "you", spell: { kind: "spell", text: "spell" }, targetsOnly: { ...creature, text: "a single creature you control" } },
          body: { targets: [], effects: [...token.effects, { type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: any, toCreated: true } }], text: "create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token." },
        });
      continue;
    }
    // Orvar, the All-Form: "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you
    // control, create a token that's a copy of one of those permanents." An intervening if (CR 603.4) on the spell's
    // targets as it was cast, checked again as this resolves: only targets still on the battlefield as the objects they
    // were and still yours, not ~, from the spell on the stack or, once it has left, as it was cast (rulings); with more
    // than one, its controller chooses which (rulings, CR 707.2).
    if (line === "Whenever you cast an instant or sorcery spell, if it targets one or more other permanents you control, create a token that's a copy of one of those permanents.") {
      const spell = parseTargetPhrase("instant or sorcery spell");
      const yours = parseTargetPhrase("permanent you control");
      if (spell?.kind !== "spell" || yours?.kind !== "object") out.unsupported.push(raw);
      else
        out.triggers.push({
          event: "castSpell",
          cast: { by: "you", spell: { ...spell, text: "instant or sorcery spell" }, targets: [{ ...yours, notSource: true, text: "other permanent you control" }] },
          body: { targets: [], effects: [{ type: "pick", who: { ref: "you" }, filter: { ...yours, text: "one of those permanents" }, n: 1, action: "choose", fromCauseTargets: true }, { type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "created" } }], text: "if it targets one or more other permanents you control, create a token that's a copy of one of those permanents." },
        });
      continue;
    }
    // Feather, Radiant Arbiter: "Whenever you cast a noncreature spell that targets only ~, you may choose any number of
    // other creatures that spell could target and pay {2} for each of those creatures. If you do, for each of those
    // creatures, copy that spell. The copy targets that creature." Every target of the spell ~ (rulings), chosen and paid
    // for as the trigger resolves; each copy targets that creature with all its targets (CR 707.10d, rulings), its modes
    // and X kept and no costs paid for it (rulings); a copy of a permanent spell becomes a token (CR 707.10f).
    if (line === "Whenever you cast a noncreature spell that targets only ~, you may choose any number of other creatures that spell could target and pay {2} for each of those creatures. If you do, for each of those creatures, copy that spell. The copy targets that creature.") {
      const creature = parseTargetPhrase("creature");
      if (creature?.kind !== "object") out.unsupported.push(raw);
      else
        out.triggers.push({
          event: "castSpell",
          cast: { by: "you", spell: { kind: "spell", types: [], notTypes: ["Creature"], notColors: [], text: "noncreature spell" }, targetsOnly: "self" },
          body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "eachOther", newTargets: false, eachOther: { among: creature, self: true, choosePay: "{2}" } }], text: "you may choose any number of other creatures that spell could target and pay {2} for each of those creatures. If you do, for each of those creatures, copy that spell. The copy targets that creature." },
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
    // Gaea's Liege: "As long as ~ isn't attacking, its power and toughness are each equal to the number of Forests you control.
    // As long as ~ is attacking, its power and toughness are each equal to the number of Forests defending player controls.":
    // set only while a condition holds, so not a characteristic-defining ability (CR 604.3a(5)) but a layer 7b effect (CR
    // 613.4b), 0/0 off the battlefield (CR 208.2); "defending player" is the player it attacks, or whose planeswalker or
    // battle it attacks (CR 506.2). While it's being declared as an attacker it isn't attacking yet (rulings).
    const liege = /^As long as ~ isn't attacking, its power and toughness are each equal to the number of ([A-Z][a-z]+s) you control\. As long as ~ is attacking, its power and toughness are each equal to the number of \1 defending player controls\.$/.exec(line);
    const liegeType = liege ? liege[1]!.slice(0, -1) : undefined;
    if (liege && liegeType && LAND_TYPES.has(liegeType)) {
      const of = (whose?: true): Amount => ({ count: { kind: "permanents", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [liegeType], ...(whose ? {} : { controller: "you" as const }), text: `${liege[1]} ${whose ? "defending player controls" : "you control"}` }, ...(whose ? { whose: { ref: "selfDefending" as const } } : {}) } });
      out.starsSetOnBattlefield = true;
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "setPT", power: of(), toughness: of() }], condition: { kind: "self", is: "attacking", not: true }, text: line }, { affects: { kind: "self" }, mods: [{ kind: "setPT", power: of(true), toughness: of(true) }], condition: { kind: "self", is: "attacking" }, text: line });
      continue;
    }
    // Evolved Spinoderm: "~ has trample as long as it has two or fewer oil counters on it. Otherwise, it has hexproof.": one
    // keyword or the other, by how many counters are on it now.
    const selfElse = /^~ has ([a-z]+) as long as it (has [^.]+ counters? on it)\. Otherwise, it has ([a-z]+)\.$/.exec(line);
    if (selfElse) {
      const [first, other] = [parseConditionalStatic(`~ has ${selfElse[1]} as long as ~ ${selfElse[2]}.`), parseStatic(`~ has ${selfElse[3]}.`)];
      if (first?.condition?.kind === "selfCounters" && first.affects.kind === "self" && other?.affects.kind === "self" && !other.condition && [...first.mods, ...other.mods].every((m) => m.kind === "addKeywords")) {
        out.statics.push({ ...first, text: line }, { ...other, condition: { kind: "not", cond: first.condition }, text: line });
        continue;
      }
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
    // Bonds of Faith: "Enchanted creature gets +2/+2 as long as it's a Human. Otherwise, it can't attack or block."; Tahngarth's
    // Rage: "Enchanted creature gets +3/+0 as long as it's attacking. Otherwise, it gets -2/-1."
    const boonLine = insteadIf ? `${insteadIf[1]} creature gets ${insteadIf[4]} as long as it's ${insteadIf[3]}. Otherwise, it gets ${insteadIf[2]}.` : line;
    const boon = /^(Enchanted|Equipped) creature gets ([+-]\d+\/[+-]\d+) as long as it's (white|blue|black|red|green|an? [A-Z][a-z]+|an enchantment|an artifact|attacking)\. Otherwise, it (gets [+-]\d+\/[+-]\d+|can't attack or block)\.$/.exec(boonLine);
    if (boon) boon.splice(1, 1);
    if (boon) {
      const w = boon[2]!;
      // Tahngarth's Rage: "as long as it's attacking" (CR 506.4), checked continuously like the rest.
      const yes: TargetSpec | null = w === "attacking" ? { kind: "object", types: ["Creature"], combat: "attacking", text: "attacking creature" } : COLOR_WORDS[w] ? { kind: "object", types: ["Creature"], colors: [COLOR_WORDS[w]!], text: `${w} creature` }
        : /^an (enchantment|artifact)$/.test(w) ? { kind: "object", types: ["Creature"], allTypes: [capital(w.slice(3))], text: `${w.slice(3)} creature` }
        : CREATURE_TYPES.has(w.replace(/^an? /, "")) ? { kind: "object", types: ["Creature"], subtypes: [w.replace(/^an? /, "")], text: `${w.replace(/^an? /, "")} creature` } : null;
      const no: TargetSpec | null = !yes ? null : w === "attacking" ? { kind: "object", types: ["Creature"], combat: "notAttacking", text: "nonattacking creature" } : COLOR_WORDS[w] ? { kind: "object", types: ["Creature"], notColors: [COLOR_WORDS[w]!], text: `non${w} creature` }
        : /^an (enchantment|artifact)$/.test(w) ? { kind: "object", types: ["Creature"], notTypes: [capital(w.slice(3))], text: `non${w.slice(3)} creature` }
        : { kind: "object", types: ["Creature"], notSubtypes: [w.replace(/^an? /, "")], text: `non-${w.replace(/^an? /, "")} creature` };
      const who = /^Equipped /.test(boonLine) ? "Equipped" : "Enchanted";
      const [a, b] = [parseStatic(`${who} creature gets ${boon[1]}.`), parseStatic(`${who} creature ${boon[3]}.`)];
      if (yes && no && a?.affects.kind === "attached" && b?.affects.kind === "attached" && !a.condition && !b.condition) {
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: yes }, text: line }, { ...b, condition: { kind: "attachedIs", filter: no }, text: line });
        continue;
      }
    }
    // Armament of Nyx: "Enchanted creature has double strike as long as it's an enchantment. Otherwise, prevent all damage
    // that would be dealt by enchanted creature.": one or the other by whether it's an enchantment now, checked
    // continuously (rulings, CR 611.3a).
    const nyx = /^Enchanted creature has ([a-z ]+) as long as it's an enchantment\. Otherwise, prevent all damage that would be dealt by enchanted creature\.$/.exec(line);
    if (nyx) {
      const [a, b] = [parseStatic(`Enchanted creature has ${nyx[1]}.`), parseStatic("Prevent all damage that would be dealt by enchanted creature.")];
      if (a?.affects.kind === "attached" && b?.affects.kind === "attached" && !a.condition && !b.condition && a.mods.every((m) => m.kind === "addKeywords")) {
        const yes: TargetSpec = { kind: "object", types: ["Creature"], allTypes: ["Enchantment"], text: "enchantment creature" };
        const no: TargetSpec = { kind: "object", types: ["Creature"], notTypes: ["Enchantment"], text: "nonenchantment creature" };
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: yes }, text: line }, { ...b, condition: { kind: "attachedIs", filter: no }, text: line });
        continue;
      }
    }
    // Burden of Proof: "Enchanted creature gets +2/+2 as long as it's a Detective you control. Otherwise, it has base power
    // and toughness 1/1 and can't block Detectives.": one or the other by what the creature is and who controls it now,
    // checked continuously (CR 611.3a); "you" is the Aura's controller.
    const proof = /^Enchanted creature (gets [+-]\d+\/[+-]\d+) as long as it's an? ([A-Z][a-z]+) you control\. Otherwise, it (has base power and toughness \d+\/\d+ and can't block [A-Z][a-z]+s)\.$/.exec(line);
    if (proof && CREATURE_TYPES.has(proof[2]!)) {
      const [a, b] = [parseStatic(`Enchanted creature ${proof[1]}.`), parseStatic(`Enchanted creature ${proof[3]}.`)];
      if (a?.affects.kind === "attached" && b?.affects.kind === "attached" && !a.condition && !b.condition) {
        const yes: TargetSpec = { kind: "object", types: ["Creature"], subtypes: [proof[2]!], controller: "you", text: `${proof[2]} you control` };
        const notType: TargetSpec = { kind: "object", types: ["Creature"], notSubtypes: [proof[2]!], text: `non-${proof[2]} creature` };
        const theirs: TargetSpec = { kind: "object", types: ["Creature"], controller: "opponent", text: "creature an opponent controls" };
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: yes }, text: line }, { ...b, condition: { kind: "anyOf", conds: [{ kind: "attachedIs", filter: notType }, { kind: "attachedIs", filter: theirs }] }, text: line });
        continue;
      }
    }
    // Mishra's Domination: "As long as you control enchanted creature, it gets +2/+2. Otherwise, it can't block.": who
    // controls it now, checked continuously (CR 611.3a); in a free-for-all game every other player is an opponent.
    const domination = /^As long as you control enchanted creature, it (gets [+-]\d+\/[+-]\d+)\. Otherwise, it (can't block|can't attack|can't attack or block)\.$/.exec(line);
    if (domination) {
      const [a, b] = [parseStatic(`Enchanted creature ${domination[1]}.`), parseStatic(`Enchanted creature ${domination[2]}.`)];
      if (a?.affects.kind === "attached" && b?.affects.kind === "attached" && !a.condition && !b.condition) {
        const yours: TargetSpec = { kind: "object", types: ["Creature"], controller: "you", text: "creature you control" };
        const theirs: TargetSpec = { kind: "object", types: ["Creature"], controller: "opponent", text: "creature an opponent controls" };
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: yours }, text: line }, { ...b, condition: { kind: "attachedIs", filter: theirs }, text: line });
        continue;
      }
    }
    // Dog Umbra: "As long as another player controls enchanted creature, it can't attack or block. Otherwise, ~ has umbra
    // armor.": who controls the creature compared with the Aura's controller, checked continuously (rulings, CR 611.3a);
    // in a free-for-all game every other player is an opponent. Umbra armor is CR 702.89.
    const dogUmbra = /^As long as another player controls enchanted creature, it (can't attack or block|can't attack|can't block)\. Otherwise, ~ has umbra armor\.$/.exec(line);
    if (dogUmbra) {
      const [a, b] = [parseStatic(`Enchanted creature ${dogUmbra[1]}.`), parseStatic("~ has umbra armor.")];
      if (a?.affects.kind === "attached" && b?.affects.kind === "self" && !a.condition && !b.condition) {
        const yours: TargetSpec = { kind: "object", types: ["Creature"], controller: "you", text: "creature you control" };
        const theirs: TargetSpec = { kind: "object", types: ["Creature"], controller: "opponent", text: "creature another player controls" };
        out.statics.push({ ...a, condition: { kind: "attachedIs", filter: theirs }, text: line }, { ...b, condition: { kind: "attachedIs", filter: yours }, text: line });
        continue;
      }
    }
    // Colfenor's Urn: "At the beginning of the end step, if three or more cards have been exiled with ~, sacrifice it. If you
    // do, return those cards to the battlefield under their owner's control.": every end step (CR 513.1); the count is of
    // every card it exiled over the game (rulings), checked as it triggers and resolves (CR 603.4); with no sacrifice,
    // nothing returns (rulings). Only the cards still in exile return (CR 400.7). Its exile ability is linked below.
    const urn = new RegExp(`^At the beginning of the end step, if ${NUM} or more cards have been exiled with ~, sacrifice it\\. If you do, return those cards to the battlefield under their owner's control\\.$`).exec(line);
    if (urn) {
      out.triggers.push({ event: "eachEndStep", ifCond: { kind: "amount", amount: { count: { kind: "linkedExiled", ever: true } }, min: num(urn[1]!) }, body: { targets: [], effects: [{ type: "sacrifice", what: { ref: "self" } }, { type: "if", cond: { kind: "sacrificedThisWay" }, effects: [{ type: "moveLinked", dest: "battlefield", ownersControl: true }] }], text: "sacrifice ~. If you do, return the cards exiled with ~ to the battlefield under their owners' control." } });
      continue;
    }
    // Varchild, Betrayer of Kjeldor: "Survivors your opponents control can't block, and they can't attack you or
    // planeswalkers you control": two restrictions on the same group, as two sentences.
    const cantBoth = /^([A-Z][a-z]+s your opponents control) can't block, and they (can't attack you or planeswalkers you control)\.$/.exec(line);
    if (cantBoth) {
      const [a, b] = [parseStatic(`${cantBoth[1]} can't block.`), parseStatic(`${cantBoth[1]} ${cantBoth[2]}.`)];
      if (a && b && !a.condition && !b.condition) {
        out.statics.push({ ...a, text: line }, { ...b, text: line });
        continue;
      }
    }
    // Soul Scourge, Laquatus's Champion: "When ~ enters, target player loses 3 life. When ~ leaves the battlefield, that
    // player gains 3 life.": the player its enters ability targeted, even if that ability is still on the stack (rulings).
    const thatPlayerLeaves = /^When ~ leaves the battlefield, that player gains (\d+) life\.$/.exec(line);
    const linkedEnters = out.triggers.filter((t) => t.event === "selfEnters");
    if (thatPlayerLeaves && linkedEnters.length === 1 && linkedEnters[0]!.body.targets.length === 1 && linkedEnters[0]!.body.targets[0]!.kind === "player") {
      linkedEnters[0]!.linksTarget = true;
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "gainLife", who: { ref: "linkedPlayer" }, n: Number(thatPlayerLeaves[1]) }], text: `That player gains ${thatPlayerLeaves[1]} life.` } });
      continue;
    }
    // Soulgorger Orgg: "When ~ leaves the battlefield, you gain life equal to the life you lost when it entered.": the life
    // its own enters ability made you lose, as that object (CR 607.1, 607.2e); none if that ability hadn't resolved yet.
    const lostEntering = out.triggers.filter((t) => t.event === "selfEnters" && t.body.effects.length === 1 && t.body.effects[0]!.type === "loseAllBut");
    if (line === "When ~ leaves the battlefield, you gain life equal to the life you lost when it entered." && lostEntering.length === 1) {
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "gainLinkedLifeLost" }], text: "you gain life equal to the life you lost when it entered." } });
      continue;
    }
    // Loot, the Anomaly: how much combat damage it assigns, not its power (rulings; CR 510.1a).
    if (line === "If ~'s power is negative, ~ assigns combat damage as though ~'s power were positive.") {
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "assignsAbsPower" }], text: line });
      continue;
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
    // Mind Carver: "Equipped creature gets +1/+0. It gets +3/+1 instead as long as an opponent has eight or more cards in
    // their graveyard": the same, with the condition the conditional static ability reads.
    const ptInsteadIf = /^(Enchanted|Equipped) creature gets ([+-])(\d+)\/([+-])(\d+)\. It gets \2(\d+)\/\4(\d+) instead as long as (.+)\.$/.exec(line);
    const ptInsteadSt = ptInsteadIf ? parseConditionalStatic(`As long as ${ptInsteadIf[8]}, ${ptInsteadIf[1]!.toLowerCase()} creature gets ${ptInsteadIf[2]}${ptInsteadIf[6]}/${ptInsteadIf[4]}${ptInsteadIf[7]}.`) : null;
    if (ptInsteadIf && ptInsteadSt?.condition && ptInsteadSt.affects.kind === "attached" && ptInsteadSt.mods.length === 1 && ptInsteadSt.mods[0]!.kind === "modifyPT") {
      const sign = (c: string) => (c === "-" ? -1 : 1);
      const [p0, t0, p1, t1] = [sign(ptInsteadIf[2]!) * Number(ptInsteadIf[3]), sign(ptInsteadIf[4]!) * Number(ptInsteadIf[5]), sign(ptInsteadIf[2]!) * Number(ptInsteadIf[6]), sign(ptInsteadIf[4]!) * Number(ptInsteadIf[7])];
      out.statics.push({ affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: p0, toughness: t0 }], text: line }, { affects: { kind: "attached" }, mods: [{ kind: "modifyPT", power: p1 - p0, toughness: t1 - t0 }], condition: ptInsteadSt.condition, text: line });
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
    // Shield of Kaldra: "Equipment named Sword of Kaldra, ~, and Helm of Kaldra have indestructible": by its name too.
    // Brothers Yamazaki: "Each other creature named ~ gets +2/+2 and has haste.": read as "Other creatures named ~ get ...".
    const eachOtherNamed = /^Each other creature named ~ gets ([+-]\d+\/[+-]\d+)( and has [a-z]+)?\.$/.exec(line);
    const named = eachOtherNamed && /^[A-Z][A-Za-z' -]+$/.test(d.name) ? `Other creatures named ${d.name} get ${eachOtherNamed[1]}${eachOtherNamed[2]?.replace(" has ", " have ") ?? ""}.` : (/^Creatures named ~ /.test(line) || /^Equipment named [^.]*~/.test(line)) && /^[A-Z][A-Za-z' -]+$/.test(d.name) ? line.replace("~", d.name) : line;
    // Akron Legionnaire: "Except for creatures named ~ and artifact creatures, creatures you control can't attack": each
    // creature you control that's neither (by its name, CR 201.2, so another one named ~ too).
    if (line === "Except for creatures named ~ and artifact creatures, creatures you control can't attack.") {
      out.statics.push({ affects: { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], notTypes: ["Artifact"], notColors: [], notNamed: d.name, text: `nonartifact creature not named ${d.name}` } }, mods: [{ kind: "cantAttack" }], text: line });
      continue;
    }
    // Pipsqueak, Rebel Strongarm: "~ can't attack alone unless ~ has a +1/+1 counter on ~" (the name standing in for "he"
    // and "him"): as long as it has none.
    const unlessCounter = /^~ can't attack alone unless ~ has an? (\+1\/\+1) counter on ~\.$/.exec(line);
    const st = also ? parseConditionalStatic(`${also[1]} ${also[2]}`) : unlessCounter ? parseConditionalStatic(`As long as ~ doesn't have a ${unlessCounter[1]} counter on it, it can't attack alone.`) : parseStatic(named) ?? parseConditionalStatic(named);
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
    // Bride's Gown: "Equipped creature gets +2/+0. It gets an additional +0/+2 and has first strike as long as an Equipment
    // named Groom's Finery is attached to a creature you control.": two static abilities, the second with its condition.
    const extraIf = /^(Equipped creature gets [^.]+)\. It gets an additional ([^.]+?) as long as ([^.]+)\.$/.exec(line);
    const extraStatics = extraIf ? [parseStatic(`${extraIf[1]}.`), parseConditionalStatic(`As long as ${extraIf[3]}, equipped creature gets ${extraIf[2]}.`)] : null;
    if (extraStatics?.every((p) => p?.affects.kind === "attached") && !extraStatics[0]!.condition && extraStatics[1]!.condition) {
      for (const p of extraStatics) out.statics.push({ ...p!, text: line });
      continue;
    }
    // Radiant Destiny: "Creatures you control of the chosen type get +1/+1. As long as you have the city's blessing, they
    // also have vigilance.": two static abilities about the same creatures, the second with its condition.
    const groupAlso = /^((?:Other )?[Cc]reatures you control(?: of the chosen type)?) (get [^.]+)\. (As long as [^,.]+), they also (have [^.]+)\.$/.exec(line);
    const groupStatics = groupAlso ? [parseStatic(`${groupAlso[1]} ${groupAlso[2]}.`), parseConditionalStatic(`${groupAlso[3]}, ${groupAlso[1]!.charAt(0).toLowerCase()}${groupAlso[1]!.slice(1)} ${groupAlso[4]}.`)] : null;
    if (groupStatics?.every((p) => p && p.affects.kind !== "self") && !groupStatics[0]!.condition && groupStatics[1]!.condition) {
      for (const p of groupStatics) out.statics.push({ ...p!, text: line });
      continue;
    }
    // Elenda, Saint of Dusk: "As long as <condition>, ~ gets +1/+1 and has menace. ~ gets an additional +5/+5 as long as
    // <condition>.": two static abilities of ~, each with its own condition; the second bonus adds to the first.
    const selfParts = /^As long as [^,.]+, ~ [^.]+\. ~ gets an additional [^.]+ as long as [^.]+\.$/.test(line) ? line.split(/(?<=\.) /) : null;
    const selfStatics = selfParts?.map((p) => { const q = p.replace(/^~ gets an additional /, "~ gets "); return parseConditionalStatic(q) ?? parseStatic(q); });
    if (selfStatics?.every((p) => p?.affects.kind === "self" && p.condition)) {
      for (const p of selfStatics) out.statics.push({ ...p!, text: line });
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
    if (isSpell && (/^When you next cast /.test(line) || /^When target creature dies this turn, /.test(line) || /^At the beginning of each combat this turn, /.test(line) || /^Whenever one or more creatures you control deal combat damage to one or more players this turn, /.test(line) || /^Whenever [^,]+ enters this turn, /.test(line) || /^Whenever an? [A-Za-z]+(?: creature)?(?: you control| an opponent controls)? attacks this turn, /.test(line) || /^Whenever you cast an? [a-z]+ spell this turn, /.test(line) || /^At the beginning of your next upkeep, pay (?:\{[^}]+\})+\. If you don't, you lose the game\.$/.test(line) || /^At the beginning of your next end step, you lose the game\.$/.test(line))) {
      spellLines.push(line);
      continue;
    }
    // Haunting Wind: "Whenever an artifact becomes tapped or a player activates an artifact's ability without {T} in its
    // activation cost, ~ deals 1 damage to that artifact's controller": an artifact tapped for any reason (for its own {T}
    // ability too), or an ability activated without the tap symbol, mana abilities included as nothing says otherwise;
    // never one event, so two triggers. Powerleech: an opponent's artifact, an opponent activating (any artifact's ability).
    // Artifact Possession: the enchanted artifact (the Aura's host trigger, and its abilities as they're activated).
    const artifactUse =
      /^Whenever (an artifact|an artifact an opponent controls|enchanted artifact) becomes tapped or (a player|an opponent) activates (an artifact's ability|an ability of enchanted artifact) without \{T\} in its activation cost, (.+)$/.exec(line);
    if (artifactUse) {
      const host = artifactUse[1] === "enchanted artifact";
      const ok = host === (artifactUse[3] === "an ability of enchanted artifact") && (artifactUse[1] === "an artifact an opponent controls") === (artifactUse[2] === "an opponent");
      const effect = artifactUse[4]!.replace(/\bthat artifact's controller\b/g, "its controller");
      const tapped = ok ? parseTrigger(`Whenever ${artifactUse[1]} becomes tapped, ${effect}`) : null;
      const body = ok ? parseBody(effect, { subjectIt: true }) : null;
      if (!tapped || tapped === "fail" || !body || (tapped.event !== "permanentBecomesTapped" && tapped.event !== "selfBecomesTapped")) out.unsupported.push(raw);
      else {
        out.triggers.push(bindThisAbility(tapped, line));
        const of: TargetSpec = { kind: "object", types: ["Artifact"], text: "artifact" };
        out.triggers.push(bindThisAbility({ event: "abilityActivated", activates: { by: artifactUse[2] === "an opponent" ? "opponent" : "any", ...(host ? { equipped: true as const } : { of }), mana: true, noTapSymbol: true, subjectSource: true }, body }, line));
      }
      continue;
    }
    // Giott, King of the Dwarves: "Whenever ~ or another Dwarf you control enters and whenever an Equipment you control
    // enters, ...": one ability, so a permanent that's both triggers it once (CR 603.2c); read as the Dwarf trigger and
    // an Equipment trigger for an Equipment that isn't a Dwarf.
    const dwarfOrGear = /^Whenever (~ or another ([A-Z][a-z]+) you control) enters and whenever an (Equipment|Aura|Vehicle) you control enters, (.+)$/.exec(line);
    if (dwarfOrGear) {
      const kin = parseTrigger(`Whenever ${dwarfOrGear[1]} enters, ${dwarfOrGear[4]}`);
      const gear = parseTrigger(`Whenever an ${dwarfOrGear[3]} you control enters, ${dwarfOrGear[4]}`);
      const f = gear && gear !== "fail" && gear.event === "permanentEnters" ? gear.enters?.filter : undefined;
      if (!kin || kin === "fail" || !gear || gear === "fail" || f?.kind !== "object" || f.notSubtypes?.length) out.unsupported.push(raw);
      else {
        out.triggers.push(bindThisAbility(kin, line));
        out.triggers.push(bindThisAbility({ ...gear, enters: { ...gear.enters!, filter: { ...f, notSubtypes: [dwarfOrGear[2]!] } } }, line));
      }
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
      /^When ~ enters and (at the beginning of (?:your upkeep|your end step|each upkeep|each end step|your first main phase)), (.+)$/.exec(line) ??
      /^When you cycle ~ and when ~ dies, (.+)$/.exec(line) ??
      // "When ~ enters or is turned face up, ..." (Ponyback Brigade): a face-down permanent has no abilities as it enters (CR 708.2),
      // and turning it face up isn't entering (CR 708.8), so one or the other. Shield Mare: "... or becomes the target of a
      // spell or ability an opponent controls". Champions of the Shoal: "Whenever ~ enters or becomes tapped, ...".
      /^When(?:ever)? ~ enters or (attacks|dies|is put into a graveyard from the battlefield|leaves the battlefield|the creature it haunts dies|deals combat damage to a player|transforms into ~|becomes monstrous|is turned face up|becomes the target of a spell or ability an opponent controls|becomes the target of an Aura spell|becomes tapped), (.+)$/.exec(line) ??
      // Brinebound Gift: "Whenever ~ enters or enchanted creature becomes the target of an Aura spell": the Aura entering, and
      // the creature it's attached to targeted, are never one event.
      /^Whenever ~ enters or (enchanted creature becomes the target of an Aura spell), (.+)$/.exec(line) ??
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
      // The Fantastic Four: "and whenever you cast a spell with power, toughness, or mana value 4", its commas before the number.
      /^When ~ enters and (whenever you cast a spell with power, toughness, or mana value \d+), (.+)$/.exec(line) ??
      /^When ~ enters and (whenever (?!it )[^,]+), (.+)$/.exec(line) ??
      // "Whenever a creature you control of the chosen type enters or attacks, draw a card." (Kindred Discovery)
      /^Whenever (an? [^,]+? you control(?: of the chosen type)?) enters or attacks, (.+)$/.exec(line) ??
      // "Whenever your commander enters or attacks, ..." (Tome of Legends, Search for Dagger).
      /^Whenever (your commander) enters or attacks, (.+)$/.exec(line) ??
      // Rhuk, Hexgold Nabber: "Whenever an equipped creature you control other than ~ attacks or dies, ...": an attack and
      // a death are never one event.
      /^Whenever (an equipped creature you control other than ~) attacks or dies, (.+)$/.exec(line) ??
      // "Whenever another creature you control enters or dies, you gain 1 life." (Daxos, Blessed by the Sun)
      /^Whenever ((?:another|an?) [^,]+? you control) enters or dies, (.+)$/.exec(line) ??
      // Jerren, Corrupted Bishop: "Whenever ~ enters or another nontoken Human you control dies, ...": entering and another
      // creature dying are never one event.
      // Carth the Lion: "Whenever ~ enters or a planeswalker you control dies": the same (Carth is never a planeswalker).
      /^Whenever ~ enters or (another [^,]+? you control|a planeswalker you control) dies, (.+)$/.exec(line) ??
      // "Whenever ~ or another nontoken Spirit you control dies or deals combat damage to a player, ..." (Millicent,
      // Restless Revenant): a death and combat damage are never one event.
      /^Whenever (~ or another [^,]+? you control) dies or deals combat damage to a player, (.+)$/.exec(line) ??
      // Park Heights Maverick: "Whenever ~ deals combat damage to a player or dies, proliferate": the same.
      /^Whenever ~ deals combat damage to a player or dies, (.+)$/.exec(line) ??
      // Balor: "Whenever ~ attacks or dies, ...": an attack and a death are never one event.
      /^Whenever ~ attacks or dies, (.+)$/.exec(line) ??
      // Syr Konrad: "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than
      // the battlefield, or a creature card leaves your graveyard, ...": no one event is two of them.
      /^Whenever (another creature dies), or (a creature card is put into a graveyard from anywhere other than the battlefield), or (a creature card leaves your graveyard), (.+)$/.exec(line) ??
      // Dreadhound: "Whenever a creature dies or a creature card is put into a graveyard from a library, ...": the same.
      /^Whenever (a creature dies) or (a creature card is put into a graveyard from a library), (.+)$/.exec(line) ??
      // Trouble in Pairs: "Whenever an opponent attacks you with two or more creatures, draws their second card each
      // turn, or casts their second spell each turn, you draw a card": three triggers (rulings: each can trigger).
      /^Whenever an opponent (attacks you with two or more creatures), (draws their second card each turn), or (casts their second spell each turn), (.+)$/.exec(line) ??
      // Curse of Shaken Faith: "Whenever enchanted player casts a spell other than the first spell they cast each turn or
      // copies a spell, ...": a cast and a copy are never one event (CR 707.10).
      /^Whenever (enchanted player) (casts a spell other than the first spell they cast each turn) or (copies a spell), (.+)$/.exec(line) ??
      // Neerdiv, Devious Diver: "Whenever you cast a spell from your graveyard or activate an ability of a card in your
      // graveyard, ...": a cast and an activation are never one event.
      /^Whenever you (cast a spell from your graveyard) or (activate an ability of a card in your graveyard), (.+)$/.exec(line) ??
      // Norin the Wary: "When a player casts a spell or a creature attacks, ...": a cast and an attack are never one event.
      /^When (a player casts a spell) or (a creature attacks), (.+)$/.exec(line) ??
      // Powerstone Minefield: "Whenever a creature attacks or blocks, ~ deals 2 damage to it.": each creature as it's
      // declared as an attacker or as a blocker (CR 508.1, 509.1), never both at once.
      // Doran, Besieged by Time: "Whenever a creature you control attacks or blocks": yours only.
      /^Whenever a creature (?:you control )?(attacks) or (blocks), (.+)$/.exec(line) ??
      // Lady Octopus: "Whenever you draw your first or second card each turn": each card is drawn one at a time (CR 121.2).
      /^Whenever you draw your (first) or (second) card each turn, (.+)$/.exec(line) ??
      // Astrologian's Planisphere: "Whenever you cast a noncreature spell and whenever you draw your third card each turn":
      // a cast and a draw are never one event.
      /^Whenever (you cast an? [^,]+? spell) and whenever (you draw your (?:first|second|third) card each turn), (.+)$/.exec(line) ??
      // Perimeter Enforcer: "Whenever another Detective you control enters and whenever a Detective you control is turned
      // face up, ...": entering and turning face up are never one event (CR 708.8). Case of the Pilfered Proof: "Whenever a
      // Detective you control enters or is turned face up".
      /^Whenever ((?:~ or )?another [A-Z][a-z]+ you control) enters and whenever (an? [A-Z][a-z]+ you control) is turned face up, (.+)$/.exec(line) ??
      /^Whenever (an? [A-Z][a-z]+ you control) enters or is turned face up, (.+)$/.exec(line) ??
      // The Shrines: "At the beginning of your upkeep and whenever you cast a black spell, put a charge counter on ~": a step
      // and a cast are never one event.
      /^(At the beginning of your upkeep) and (whenever you cast an? (?:white|blue|black|red|green) spell), (.+)$/.exec(line) ??
      // Kratos, Stoic Father: "Whenever you attack with one or more Gods and whenever a God dies, ...": an attack and a
      // death are never one event.
      /^(Whenever you attack with one or more [A-Z][a-z]+s) and (whenever an? [A-Z][a-z]+ dies), (.+)$/.exec(line) ??
      // Ertai's Familiar: "When ~ phases out or leaves the battlefield, ...": phasing out isn't leaving the battlefield (CR
      // 702.26d), so they're never one event.
      /^When ~ (phases out) or (leaves the battlefield), (.+)$/.exec(line);
    // MACH-1, Swooping Scoundrel: "When ~ enters and whenever you gain life, surveil 1. This ability triggers only once each
    // turn.": one ability, so the two triggers share the once (CR 603.2h; keyed by the effect's text).
    const onceBoth = !!twice && /^When ~ enters and whenever [^,]+, [^."]+\. This ability triggers only once each turn\.$/.test(line);
    if (twice && (!/\bonly once\b/.test(line) || onceBoth)) {
      let effect = onceBoth ? twice[twice.length - 1]!.replace(/ This ability triggers only once each turn\.$/, "") : twice[twice.length - 1]!;
      // Pelt Collector: "Whenever another creature you control enters or dies, if that creature's power is greater than
      // ~'s, ...": an intervening "if" (CR 603.4) on each, the dying one's power as it last existed (rulings).
      const greaterThanMine = /^Whenever [^,]+? you control enters or dies, /.test(line) ? /^if that creature's power is greater than ~'s, (.+)$/.exec(effect) : null;
      if (greaterThanMine) effect = greaterThanMine[1]!;
      const events = /^Whenever a creature (?:you control )?attacks or blocks, /.test(line)
        ? ((who) => [`Whenever ${who} attacks, ${effect}`, `Whenever ${who} blocks, ${effect}`])(/ you control /.test(line) ? "a creature you control" : "a creature")
        : /^At the beginning of your upkeep and whenever /.test(line) || /^Whenever you attack with one or more [A-Z][a-z]+s and whenever /.test(line)
        ? [`${twice[1]}, ${effect}`, `W${twice[2]!.slice(1)}, ${effect}`]
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
          : twice[1] === "enchanted creature becomes the target of an Aura spell"
            ? [`When ~ enters, ${effect}`, `Whenever ${twice[1]}, ${effect}`]
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
              // Hoarder's Overflow: "When ~ enters and whenever you expend 4, put a stash counter on it.": "it" is ~ in
              // both, the second trigger's event being about a player, not an object.
              ? [`When ~ enters, ${effect}`, `W${twice[1]!.slice(1)}, ${/^whenever you expend \d+$/.test(twice[1]!) ? effect.replace(/^put (an? [a-z]+ counter) on it\.$/, "put $1 on ~.") : effect}`]
            : /^When ~ phases out or leaves the battlefield, /.test(line)
              ? [`Whenever ~ phases out, ${effect}`, `When ~ leaves the battlefield, ${effect}`]
            : /^Whenever ~ attacks, blocks, or becomes the target of a spell, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `Whenever ~ blocks, ${effect}`, `Whenever ~ becomes the target of a spell, ${effect}`]
            : /^Whenever ~ attacks or becomes the target of a spell(?: an opponent controls)?, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `Whenever ~ ${twice[2]}, ${effect}`]
            : /^Whenever enchanted player casts a spell other than the first /.test(line)
              ? [`Whenever enchanted player ${twice[2]}, ${effect}`, `Whenever enchanted player ${twice[3]}, ${effect}`]
            : /^Whenever you cast a spell from your graveyard or activate /.test(line)
              ? [`Whenever you ${twice[1]}, ${effect}`, `Whenever you ${twice[2]}, ${effect}`]
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
            : /^Whenever an equipped creature you control other than ~ attacks or dies, /.test(line)
              ? [`Whenever another equipped creature you control attacks, ${effect}`, `Whenever another equipped creature you control dies, ${effect}`]
            : /^Whenever ~ attacks or dies, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `When ~ dies, ${effect}`]
            : /^Whenever ~ deals combat damage to a player or dies, /.test(line)
              ? [`Whenever ~ deals combat damage to a player, ${effect}`, `When ~ dies, ${effect}`]
            : /^Whenever ~ or another [^,]+? you control dies or deals combat damage to a player, /.test(line)
              ? [`Whenever ${twice[1]} dies, ${effect}`, `Whenever ${twice[1]} deals combat damage to a player, ${effect}`]
            : /^Whenever ~ enters or (?:another [^,]+?|a planeswalker) you control dies, /.test(line)
              ? [`When ~ enters, ${effect}`, `Whenever ${twice[1]} dies, ${effect}`]
            : /^Whenever [^,]+? you control enters or dies, /.test(line)
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[1]} dies, ${effect}`]
            : /^Whenever a creature dies or a creature card is put into a graveyard from a library, /.test(line)
              ? [`Whenever ${twice[1]}, ${effect}`, `Whenever ${twice[2]}, ${effect}`]
            : / is turned face up, /.test(line) && twice.length === 4
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[2]} is turned face up, ${effect}`]
            : / enters or is turned face up, /.test(line) && /^Whenever an? /.test(line)
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[1]} is turned face up, ${effect}`]
            : [`When ~ enters, ${effect}`, `${/^(?:attacks|deals|becomes tapped)/.test(twice[1]!) ? "Whenever" : "When"} ~ ${twice[1]}, ${effect}`];
      const both = events.map((l) => parseTrigger(l));
      if (both.some((t) => !t || t === "fail" || (onceBoth && t.oncePerTurn) || (greaterThanMine && t.ifCond))) out.unsupported.push(raw);
      else for (const t of both) out.triggers.push(bindThisAbility(onceBoth ? { ...(t as TriggeredAbility), oncePerTurn: true } : greaterThanMine ? { ...(t as TriggeredAbility), ifCond: { kind: "subjectPT", stat: "power", greaterThanSource: true } } : (t as TriggeredAbility), line));
      continue;
    }
    // Battle Cry: "Untap all white creatures you control.\nWhenever a creature blocks this turn, ...": a delayed trigger
    // the spell sets up (CR 603.7a), its own paragraph part of the spell's text.
    // Siren's Call: "At the beginning of the next end step, ..." in a paragraph of its own: a delayed trigger the spell sets
    // up as it resolves (CR 603.7a).
    // Vivien's Stampede: "At the beginning of the next main phase this turn, ..." the same way.
    if (isSpell && spellLines.length && /^At the beginning of the next (?:end step|main phase this turn), /.test(line)) {
      spellLines.push(line);
      continue;
    }
    if (isSpell && spellLines.length && /^Whenever [^,]+ this turn, /.test(line)) {
      spellLines.push(line);
      continue;
    }
    // Keranos, God of Storms: "Reveal the first card you draw on each of your turns. Whenever you reveal a land card this
    // way, draw a card. Whenever you reveal a nonland card this way, ~ deals 3 damage to any target.": a static ability
    // that reveals the card as it's drawn, and two triggers on that reveal (the first draw of each of your own turns).
    const revealDraw = /^Reveal the first card you draw on each of your turns\. Whenever you reveal a land card this way, (.+?\.) Whenever you reveal a nonland card this way, (.+\.)$/.exec(line);
    if (revealDraw) {
      const ts = ([["land", revealDraw[1]!], ["nonland", revealDraw[2]!]] as const).map(([kind, text]) => {
        const t = parseTrigger(`Whenever you draw your first card each turn, ${text}`);
        return t && t !== "fail" && t.event === "playerDraws" && t.draws && !t.ifCond ? { ...t, draws: { ...t.draws, ownTurn: true as const, revealed: kind } } : null;
      });
      if (ts.some((t) => !t)) out.unsupported.push(raw);
      else for (const t of ts) out.triggers.push(bindThisAbility(t!, line));
      continue;
    }
    // Rowen, Primitive Etchings: "Reveal the first card you draw each turn. Whenever you reveal a basic land (creature) card
    // this way, draw a card.": the same on any turn, one trigger, for the first card drawn each turn (rulings: the reveal is
    // a static ability as the card is drawn; the trigger waits until the whole draw has finished).
    const revealEach = /^Reveal the first card you draw each turn\. Whenever you reveal an? (basic land|creature) card this way, (.+\.)$/.exec(line);
    if (revealEach) {
      const t = parseTrigger(`Whenever you draw your first card each turn, ${revealEach[2]!}`);
      if (!t || t === "fail" || t.event !== "playerDraws" || !t.draws || t.ifCond) out.unsupported.push(raw);
      else out.triggers.push(bindThisAbility({ ...t, draws: { ...t.draws, revealed: revealEach[1] === "creature" ? "creature" : "basicLand" } }, line));
      continue;
    }
    // Inquisitor Eisenhorn: "You may reveal the first card you draw each turn as you draw it. Whenever you reveal an
    // instant or sorcery card this way, create ...": as miracle (game.ts), an instant or sorcery card is always revealed
    // as it's drawn, and whether to have the trigger's result is asked as it resolves: you needn't reveal it if you don't
    // want that (rulings); the token is made even if the card has left your hand by then (rulings).
    const mayReveal = /^You may reveal the first card you draw each turn as you draw it\. Whenever you reveal an instant or sorcery card this way, (.+\.)$/.exec(line);
    if (mayReveal) {
      const t = parseTrigger(`Whenever you draw your first card each turn, you may ${mayReveal[1]!.replace(/^./, (c) => c.toLowerCase())}`);
      if (!t || t === "fail" || t.event !== "playerDraws" || !t.draws || t.ifCond || !/^you may create /.test(t.body.text)) out.unsupported.push(raw);
      else out.triggers.push(bindThisAbility({ ...t, draws: { ...t.draws, revealed: "instantOrSorcery" } }, line));
      continue;
    }
    const trig = parseTrigger(line);
    if (trig) {
      if (trig === "fail") out.unsupported.push(raw);
      else out.triggers.push(bindThisAbility(trig, line));
      continue;
    }
    // The Shards: "{3}, {T} or {W}, {T}: ...": one ability with a choice of costs, either one but not both (rulings; CR
    // 602.2b, 601.2b), compiled as one ability per cost, the same choice from the menu (as Bloodthorn Flail's equip).
    const orCost = /^((?:\{[^}]+\})+, \{T\}) or ((?:\{[^}]+\})+, \{T\}): (.+)$/.exec(line);
    if (orCost) {
      const acts = [orCost[1]!, orCost[2]!].map((c) => parseActivated(`${c}: ${orCost[3]!}`));
      if (acts.some((a) => !a || a === "fail")) out.unsupported.push(raw);
      else for (const a of acts) out.activated.push(bindThisAbility(a as ActivatedAbility, line));
      continue;
    }
    // Clay Golem: "{6}, Roll a d8: Monstrosity X, where X is the result.": the die is rolled as the cost is paid (CR 601.2h,
    // 602.2b), so the result is known before it resolves (rulings: you may respond by activating it again); "the result"
    // is that roll's (StackItem.rolled).
    const rollCost = /^((?:\{[0-9WUBRGC]\})+), Roll a d(\d+): (.+, where X is the result\.)$/.exec(line);
    if (rollCost) {
      const a = parseActivated(`${rollCost[1]!}: ${rollCost[3]!}`);
      if (!a || a === "fail" || a.costs?.length || a.tap || !JSON.stringify(a.body).includes('"rollResult"') || JSON.stringify(a.body).includes('"type":"roll"')) out.unsupported.push(raw);
      else out.activated.push(bindThisAbility({ ...a, rollCost: Number(rollCost[2]), text: line }, line));
      continue;
    }
    const act = parseActivated(line);
    // Bullseye, Death Dealer: "{3}, {T}, Sacrifice an artifact or discard a nonland card: ...", Tidal Control's "Pay 2 life
    // or {2}: ...": one ability whose last cost is a choice of two, made as it's activated (CR 602.2b, 601.2b), compiled
    // as one ability per cost, the same choice from the menu (as The Shards above).
    const either = !act || act === "fail" ? eitherLastCost(line) : null;
    const eitherActs = either?.map((l) => parseActivated(l));
    if (eitherActs?.every((a) => a && a !== "fail")) {
      for (const a of eitherActs) out.activated.push(bindThisAbility(a as ActivatedAbility, line));
      continue;
    }
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
    // Vincent's Limit Break: tiered modes that are only base power and toughness, for the one sentence of the spell that
    // says "the chosen base power and toughness" (round 354).
    const shown = round354Tiered(spree, spellLines);
    const modes = spree.texts.map((t, i) => ((b) => (b && shown ? { ...b, text: shown[i]! } : b))(parseBody(t, { spell: true })));
    // Every mode has to work, and nothing else may be in the spell's text (it would be outside the modes).
    if (spellLines.length || spree.costs.length < 2 || ascendSpell || modes.some((m) => !m)) out.unsupported.push(...spree.lines, ...spellLines);
    else out.spell = { targets: [], effects: [], text: spree.lines.join(" "), modal: { min: 1, max: spree.tiered ? 1 : modes.length, modes: modes as AbilityBody[], costs: spree.costs } };
  } else if (isSpell) {
    // Spoils of War: "X is the number of artifact and/or creature cards in an opponent's graveyard as you cast ~": X in its
    // mana cost set by its text as it's cast (CR 107.3c; the player can't choose it, rulings), the opponent chosen then.
    if (spellLines.length >= 2 && /^X is the number of artifact and\/or creature cards in an opponent's graveyard as you cast ~\.$/.test(spellLines[0]!) && parseManaCost(d.manaCost).hasX) {
      spellLines.shift();
      out.castXIs = { opponentGraveyard: { kind: "card", types: ["Artifact", "Creature"], notTypes: [], notColors: [], text: "artifact and/or creature card" } };
    }
    // "Choose one — • Destroy all creatures. • Destroy all planeswalkers." then "Then return a creature ... card from your
    // graveyard to the battlefield ..." (Blood on the Snow): the paragraph after the modes is done whichever mode was
    // chosen, after it (CR 700.2, 608.2c). With one mode chosen, that's the same as the end of each mode.
    const tail = spellLines.length > 1 && spellLines[0]!.includes("•") && !spellLines.slice(1).some((l) => l.includes("•")) ? spellLines.slice(1).join(" ") : undefined;
    // First Day of Class: "Whenever a creature you control enters this turn, ..." then "Learn." in its own paragraph: the
    // delayed trigger's text ends with its paragraph (CR 603.7a); the next one is another instruction of the spell.
    // Benefactor's Draught: "Untap all creatures. Until end of turn, whenever a creature an opponent controls blocks, draw a
    // card." then "Draw a card.": the same, the delayed trigger after another instruction in its paragraph.
    const floatingFirst = tail === undefined && !costSacrificedX && spellLines.length > 1 && /(?:^|\. )(?:Whenever [^,]+ this turn, |Until end of turn, whenever )/.test(spellLines[0]!) && !spellLines.some((l) => l.includes("•"));
    const parts = floatingFirst ? [parseBody(spellLines[0]!, { spell: true }), parseBody(spellLines.slice(1).join(" "), { spell: true })] : [];
    // Spiritualize: "Until end of turn, whenever target creature deals damage, ..." then "Draw a card.": the first
    // paragraph's targets are the spell's, as long as the rest has none of its own (its indexes stay the same).
    const joined: AbilityBody | null = parts.length && parts.every((b, i) => b && (i === 0 || !b.targets.length) && !b.modal && Object.keys(b).every((k) => k === "targets" || k === "effects" || k === "text")) ? { targets: parts[0]!.targets, effects: parts.flatMap((b) => b!.effects), text: spellLines.join(" ") } : null;
    // Selective Snare, Aphetto Dredging: "target creatures of the creature type of your choice": the type is chosen as it's
    // cast, before the targets (rulings, CR 601.2b-c), one existing creature type (CR 205.3m); the spell's one target spec
    // is of that type (CostChoices.creatureType, CastHow.castType).
    const ofYourChoice = " of the creature type of your choice";
    const typeChoice = !floatingFirst && tail === undefined && spellLines.length === 1 && spellLines[0]!.split(ofYourChoice).length === 2 && /\btarget creatures?(?: cards?)?$/.test(spellLines[0]!.split(ofYourChoice)[0]!) && !spellLines[0]!.includes("•");
    // Round B191 (Multiple Choice): a whole spell read at once.
    // Round B194 (Farsight Ritual): the same.
    const b191 = !floatingFirst && tail === undefined ? ((t) => { const r = roundB191Spell(t); return r !== undefined ? r : roundB194Spell(t); })(spellLines.join(" ")) : undefined;
    const body0 = b191 !== undefined ? b191 : floatingFirst ? joined : tail !== undefined ? modesThen(spellLines[0]!, tail) : spellLines.length ? parseBody(spellBodyText(typeChoice ? spellLines[0]!.replace(ofYourChoice, "") : spellLines.join(" "), costSacrificedX), { spell: true, ...(costSacrificedX ? { costSacrificedX } : {}), ...(costTappedX ? { costTappedX } : {}) }) : null;
    // "Up to three target creature cards" is three target specs alike: each one of that type.
    const typed = typeChoice && body0 && !body0.modal && body0.targets.length > 0 && body0.targets.every((t) => (t.kind === "object" || t.kind === "card") && !t.chosen && t.types?.length === 1 && t.types[0] === "Creature" && !t.subtypes?.length && t.text === body0.targets[0]!.text);
    const body = typeChoice ? (typed ? { ...body0, targets: body0.targets.map((t) => ({ ...t, chosen: "type" as const, text: `${t.text} of the chosen type` })) } : null) : body0;
    if (typed) out.castChooseType = true;
    if (body && ascendSpell && body.modal) out.unsupported.push("Ascend"); // before the modes: not modeled
    else if (body) out.spell = ascendSpell ? { ...body, effects: [{ type: "ascend" }, ...body.effects] } : body;
    // Into the Time Vortex, Throes of Chaos: cascade and nothing else to do; the spell resolves doing nothing more (CR 608.2).
    else if (!spellLines.length && !ascendSpell && d.keywords.includes("Cascade")) out.spell = { targets: [], effects: [], text: "" };
    // All Hallow's Eve (round B214): exiled with its counters as it resolves (CompiledCard.exileSelfCounters) and nothing else.
    else if (!spellLines.length && !ascendSpell && out.exileSelfCounters) out.spell = { targets: [], effects: [], text: "" };
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
  if (unpreventableIf) {
    const dmg = out.spell?.effects.filter((e) => e.type === "damage") ?? [];
    if (out.spell && !out.spell.modal && dmg.length === 1 && dmg[0]!.type === "damage" && !dmg[0]!.by) dmg[0]!.unpreventableIf = unpreventableIf.cond;
    else {
      out.unsupported.push(unpreventableIf.raw);
      delete out.cantBeCounteredIf;
    }
  }
  if (xModes && out.spell?.modal && !out.spell.modal.costs && !out.spell.modal.pawprints && out.spell.modal.min === 0 && out.spell.modal.max === X_MODES_MAX) out.spell.modal.xCount = true;
  if (repeat) {
    const modal = out.spell?.modal;
    if (modal && !modal.costs && !modal.pawprints && ((modal.min === modal.max && modal.min > 1) || (modal.min === 0 && modal.max > 1))) modal.repeat = true;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("You may choose the same mode more than once.");
    }
  }
  // More modes to choose than there are, without "the same mode more than once": not a list we read.
  if (out.spell?.modal && !out.spell.modal.repeat && !out.spell.modal.pawprints && out.spell.modal.max > out.spell.modal.modes.length) {
    delete out.spell;
    out.unsupported.push("(chooses more modes than it has)");
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
    if (modal && modal.min === 1 && modal.max === 1 && out.kicker?.costs.length === 1 && !out.kicker.multi && (!kickedBoth || modal.modes.length === 2)) {
      modal.both = both;
      if (kickedBoth) modal.bothExactly = true;
    } else if (out.spell) {
      delete out.spell;
      out.unsupported.push(`Choose one. If ~ was kicked, choose ${kickedBoth ? "both" : "any number"} instead.`);
    }
  } else if (both) {
    // Teamwork's "choose both" needs teamwork; either way, a list of exactly two modes.
    const modal = out.spell?.modal;
    const cond = bothIf !== undefined ? parseStaticCondition(bothIf.startsWith("?") ? bothIf.slice(1) : `you control ${bothIf}`, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
    // Soul Transfer: "If you control an artifact and an enchantment as you cast ~": both conditions about the caster.
    const isPlayerCond = (c: StaticCondition | null | undefined): boolean =>
      (c?.kind === "control" && !c.other && (c.who ?? "you") === "you") || c?.kind === "opponentGraveyard" || c?.kind === "descended" || c?.kind === "graveyardTypes" || c?.kind === "graveyardPermanents" || (c?.kind === "allOf" && c.conds.every(isPlayerCond));
    const playerCond = isPlayerCond(cond);
    if (both === "control" && modal && modal.min === 1 && modal.max === 1 && modal.modes.length >= 2 && playerCond) {
      modal.both = both;
      modal.bothIf = cond!;
      if (bothAny) modal.bothAny = true;
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
    if (modal && !modal.costs && modal.max < modal.modes.length) {
      modal.entwine = entwine.cost;
      if (entwine.costs) [modal.entwineCosts, modal.entwineText] = [entwine.costs, entwine.text!];
    }
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
    return (v as { kind?: string }).kind === "affectedControllerPoison" || (v as { kind?: string }).kind === "affectedControllerHand" || (v as { kind?: string }).kind === "affectedColors" || (v as { kind?: string }).kind === "affectedCreatureTypes" || Object.values(v).some(affectedPoison);
  };
  if (affectedPoison([out.spell, out.triggers, out.activated])) out.unsupported.push("(poison counters of an affected permanent's controller, with no affected permanent)");
  // Fblthp, Lost on the Range: its two plot lines only work together (one grants plot, the other lets it be used there).
  if (out.plotTop && !(out.plotTop.granted && out.plotTop.fromTop)) out.unsupported.push("(plot from the top of the library without both of its lines)");
  // Both pay with the same chosen cards: a discard for jump-start on top of a discard the spell asks for isn't modeled.
  const kinds = (costs: AdditionalCost[] = []) => costs.map((c) => c.kind);
  if (out.fromGraveyard?.some((g) => kinds(g.costs).some((k) => kinds(out.additionalCosts).includes(k)))) out.unsupported.push("graveyard cast with a cost like its additional cost");
  if (out.escapesWith && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  if (out.entersWithCounters?.escaped !== undefined && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  if (out.entersCounterChoice?.escaped && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  checkCastingLinks(out);
  // Lavabrink Venturer: protection "of the chosen quality" needs odd or even chosen as it enters (CR 614.12).
  if (JSON.stringify([out.statics, out.triggers, out.activated, out.spell]).includes(CHOSEN_NUMBER_EXCEPT_PROTECTION) && !out.entersChoose?.some((c) => c.what === "number")) out.unsupported.push("(protection from mana values but a chosen number with no number chosen as it enters)");
  if (JSON.stringify([out.statics, out.triggers, out.activated, out.spell]).includes(CHOSEN_PARITY_PROTECTION) && !out.entersChoose?.some((c) => c.what === "parity")) out.unsupported.push("(protection of a chosen quality with no odd or even chosen as it enters)");
  // Grandeur's "Discard another card named ~": the card's own name (a copy has it too, CR 707.2); Say Its Name's "two other
  // cards named ~" from your graveyard likewise.
  for (const ab of out.activated)
    if (ab.costs?.some((c) => (c.kind === "discard" || c.kind === "exileFromGraveyard") && c.filter?.named === "~"))
      ab.costs = ab.costs.map((c) => ((c.kind === "discard" || c.kind === "exileFromGraveyard") && c.filter?.named === "~" ? { ...c, filter: { ...c.filter, named: d.name, text: `card named ${d.name}` } } : c));
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
  // Bane Alley Broker: its controller may look at the cards its one exile ability exiled face down, as they're exiled (and
  // as they choose one to return, effects/run-zones.ts).
  if (lookLinked) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const faceDown = all.filter((e): e is Extract<Effect, { type: "exileFaceDown" }> => e.type === "exileFaceDown");
    const others = all.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "impulse" || e.type === "exileHand" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || faceDown.length !== 1 || faceDown[0]!.actor || faceDown[0]!.who) out.unsupported.push(lookLinked);
    else faceDown[0]!.look = true;
  }
  linkExile(out);
  // "Target ... card not named ~" (Staff of Eden): this card's name (CR 201.5).
  for (const b of [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])])
    b.targets = b.targets.map((t) => (t.notNamed === "~" ? { ...t, notNamed: d.name } : t));
  // Dutiful Replicator: a reflexive trigger's target too ("When you do, ... target token you control not named ~").
  const nestedNotNamed = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(nestedNotNamed);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.type === "reflexive" && o.body) for (const t of (o.body as AbilityBody).targets) if (t.notNamed === "~") t.notNamed = d.name;
      Object.values(o).forEach(nestedNotNamed);
    }
  };
  nestedNotNamed([out.triggers, out.activated, out.spell]);
  // "Target ... of the chosen type": the creature type chosen as this permanent entered (CR 614.12), bound on its
  // abilities (cards.ts abilitiesOf). Not on a spell, nor with a choice made while it resolves (after its targets).
  // Mirror of the Forebears: a copy of a creature whose own abilities read "the chosen type" has no type chosen for them
  // (rulings), but the type chosen for the Mirror stays on the permanent, so it isn't done.
  const chosenTarget = (b: AbilityBody) => [...b.targets, ...(b.modal?.modes.flatMap((m) => m.targets) ?? [])].some((t) => t.chosen === "type");
  const choosesType = out.entersChoose?.some((c) => c.what === "creatureType");
  for (const b of [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])])
    if (chosenTarget(b) && !(b === out.spell && out.castChooseType && !allEffects(b.effects).some((e) => e.type === "choose")) && (b === out.spell || !choosesType || allEffects(b.effects).some((e) => e.type === "choose"))) out.unsupported.push(`${b.text} (a target of the chosen type, with no type chosen as it entered)`);
    else if (chosenTarget(b) && allEffects(b.effects).some((e) => e.type === "becomeCopy")) out.unsupported.push(`${b.text} (a copy keeping the type chosen for its source)`);
  // Belbe's Portal: "put a creature card of the chosen type from your hand": the type chosen as this permanent entered,
  // so only with that choice, and not on a spell.
  for (const b of [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])])
    if (allEffects(b.effects).some((e) => e.type === "putFromHand" && e.filter?.chosen === "type") && (b === out.spell || !choosesType || allEffects(b.effects).some((e) => e.type === "choose"))) out.unsupported.push(`${b.text} (a card of the chosen type, with no type chosen as it entered)`);
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
  // Yavimaya Kavu: "~'s power is equal to ..." and "~'s toughness is equal to ..." on two lines are two
  // characteristic-defining abilities, both applied in layer 7a (CR 604.3, 613.4a): one static defining both.
  const cdas = out.statics.filter((st) => st.affects.kind === "self" && !st.condition && st.mods.length === 1 && st.mods[0]!.kind === "definePT");
  const cdaPower = cdas.find((st) => (st.mods[0] as { power?: unknown }).power !== undefined && (st.mods[0] as { toughness?: unknown }).toughness === undefined);
  const cdaToughness = cdas.find((st) => (st.mods[0] as { power?: unknown }).power === undefined && (st.mods[0] as { toughness?: unknown }).toughness !== undefined);
  if (cdas.length === 2 && cdaPower && cdaToughness) {
    const merged = { ...cdaPower, mods: [{ ...cdaPower.mods[0]!, ...cdaToughness.mods[0]! } as typeof cdaPower.mods[0]] };
    out.statics = out.statics.flatMap((st) => (st === cdaPower ? [merged] : st === cdaToughness ? [] : [st]));
  }
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
/**
 * "[costs, ]A or B: effect", A and B each a whole cost (a mana cost, or one starting with its verb: "Sacrifice an artifact
 * or discard a nonland card"): the two activated abilities' lines, one with each. Null for other lines ("Sacrifice an
 * artifact or creature" is one cost).
 */
function eitherLastCost(line: string): [string, string] | null {
  const first = "(?:Sacrifice|Discard|Pay|Exile|Tap|Return|Remove|Put)\\b";
  const then = "(?:sacrifice|discard|pay|exile|tap|return|remove|put)\\b";
  const m = new RegExp(`^((?:[^:"]+?, )?)((?:${first}|\\{)[^:",]*?) or ((?:${then}|\\{)[^:",]*?): ([^]+)$`).exec(line);
  if (!m) return null;
  const second = m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1);
  return [`${m[1]}${m[2]}: ${m[4]}`, `${m[1]}${second}: ${m[4]}`];
}

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

/** Null Summoner: cards whose "you may cast the exiled card" is linked to their one exile of a card from a hand (see linkExile). */
const castsTheExiled = new WeakSet<CompiledCard>();

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
  // Strata Scythe: "the exiled card" in a static count is the card its imprint ability's search exiled (CR 607.2a), its
  // only exile instruction.
  if (out.statics.some((st) => JSON.stringify(st.mods).includes('"sameNameAsLinked":true'))) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const searches = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "search" }> => e.type === "search" && e.dest.zone === "exile" && !e.others && !e.split && !e.mayInstead && !e.condDest && !e.landTo && !e.cardTo && !e.dest.faceDown);
    const exiles = all.filter((e) => ["exile", "exileTop", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong", "search"].includes(e.type) || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile));
    if (out.spell || searches.length !== 1 || exiles.length !== 1) out.unsupported.push("(counts lands named like an exiled card it can't link to one imprint ability)");
    else searches[0]!.dest = { ...searches[0]!.dest, linked: true };
  }
  // Smirking Spelljacker: "you may cast the exiled card" is the spell its enters ability exiled (CR 607.2a), its only exile.
  if ([...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].some((b) => allEffects(b.effects).some((e) => e.type === "playLinked" && e.castOnly))) {
    const spells = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "counterSpell" }> => e.type === "counterSpell" && !!e.exileSpell && !e.cause && !e.plot && !e.ownerMayCost && !e.n);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "exileTop" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "counterSpell");
    // Living Lore: "you may cast the exiled card" is the card its "As ~ enters, exile ..." exiled (CR 607.2b).
    if (yardEntersLinkOnly(out, [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)])) {
      /* linked by the enters replacement */
    } else if (!spells.length && others.length === 1 && others[0]!.type === "hideaway" && !out.spell) {
      /* Smuggler's Buggy: "the exiled card" is the one its hideaway exiled (CR 702.75a, 607.2a), linked as it's exiled */
    } else if (spells.length !== 1 || others.length !== 1 || out.spell) out.unsupported.push("(casts an exiled card it can't link to one exile ability)");
    else spells[0]!.linked = true;
  }
  // Muse Vessel: "a card exiled with ~" is one its "target player exiles a card from their hand" ability exiled (CR
  // 607.2a, rulings), its only exile instruction.
  if ([...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].some((b) => allEffects(b.effects).some((e) => e.type === "mayPlayLinked"))) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const fromHand = all.filter((e): e is Extract<Effect, { type: "discard" }> => e.type === "discard" && !!e.exile);
    // King Narfi's Betrayal: "you may exile a creature or planeswalker card from each graveyard", linked as it's parsed.
    const fromYards = all.filter((e) => e.type === "chooseFromGraveyard" && e.dest === "exile" && !!e.linked);
    // Urianger Augurelt, Lobelia, Defender of Bag End: its one face-down exile from the top of libraries, which links the
    // cards it exiles as it resolves (with no permission of its own).
    const faceDown = all.filter((e) => e.type === "exileFaceDown" && e.from === "top" && !e.play && !e.foretold && !e.endStepHand && !e.upkeepGraveyard && (!e.pickOne || !!e.optional));
    const others = all.filter((e) => ["exile", "exileTop", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong", "search", "chooseFromGraveyard", "pick"].includes(e.type) && !(e.type === "pick" && e.action !== "exile") && !fromYards.includes(e) && !faceDown.includes(e));
    if (out.spell || fromHand.length + fromYards.length + faceDown.length !== 1 || others.length) out.unsupported.push("(plays an exiled card it can't link to one exile ability)");
    else if (fromHand[0]) fromHand[0].linked = true;
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
  if (out.costMods?.some((m) => m.perTypeSharedWithLinked) || out.triggers.some((t) => t.cast?.sharesTypeWithLinked) || out.fromTop?.some((f) => f.sharesTypeWithLinked)) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const yards = all.filter((e): e is Extract<Effect, { type: "chooseFromGraveyard" }> => e.type === "chooseFromGraveyard" && !!e.anyGraveyard);
    const others = all.filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "chooseFromGraveyard" && e.dest === "exile" && !e.anyGraveyard));
    if (!yards.length || others.length) out.unsupported.push("(compares with exiled cards it can't link to one exile ability)");
    else for (const e of yards) e.linked = true;
  }
  // Thought Prison: "the exiled card" its cast trigger compares with is the one its imprint ability exiled as it entered,
  // its only exile (CR 607.2a).
  if (out.triggers.some((t) => t.cast?.sharesColorOrMvWithLinked)) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "takeFromHand" }> => e.type === "takeFromHand" && e.action === "exile");
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileGraveyard" || e.type === "chooseFromGraveyard" || e.type === "exileTop");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(compares with an exiled card it can't link to one imprint ability)");
    else imprints[0]!.linked = true;
  }
  // Mourner's Shield: "a source of your choice that shares a color with the exiled card" is about the card its imprint ability
  // exiled as it entered, its only exile (CR 607.2a).
  if (out.activated.some((a) => a.body.effects.some((e) => e.type === "damageRule" && !!e.rule.by?.choose?.sharesColorWithLinked))) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileGraveyard" || e.type === "chooseFromGraveyard" || e.type === "exileTop");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(compares with an exiled card it can't link to one imprint ability)");
    else imprints[0]!.linked = true;
  }
  // Mirror Golem: "the exiled card" its protection reads is the one its imprint ability exiled as it entered, its only
  // exile (CR 607.2a).
  if (out.statics.some((st) => st.mods.some((m) => m.kind === "addKeywords" && m.keywords.includes(LINKED_TYPES_PROTECTION)))) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileGraveyard" || e.type === "chooseFromGraveyard");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(its protection can't be linked to one imprint ability)");
    else imprints[0]!.linked = true;
  }
  // Urborg Scavengers: "a card exiled with it" is one its one exile ability exiled (CR 607.2a): "Whenever ~ enters or
  // attacks, exile ..." is one ability, compiled as one trigger for each event with the same body.
  if (out.statics.some((st) => !/ used to craft it /.test(st.text) && st.mods.some((m) => m.kind === "addKeywords" && m.keywords.some((k) => k.startsWith(LINKED_CARD_KEYWORD))))) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile");
    const others = all.some((e) => e.type === "exileGraveyard" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileTop" || e.type === "chooseFromGraveyard" || (e.type === "discard" && !!e.exile));
    // Death-Mask Duplicant's imprint is an activated ability.
    const holders = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].filter((b) => allEffects(b.effects).some((e) => exiles.includes(e as Extract<Effect, { type: "exile" }>)));
    const oneAbility = exiles.length >= 1 && new Set(holders.map((b) => JSON.stringify(b))).size === 1 && holders.length === exiles.length;
    if (others || out.spell || !oneAbility || exiles.some((e) => e.until)) out.unsupported.push("(has keywords of exiled cards it can't link to one exile ability)");
    else for (const e of exiles) e.linked = true;
  }
  // Invader Parasite: "the exiled card" its enters trigger watches for is the one its imprint ability exiled as it entered,
  // its only exile (CR 607.2a).
  if (out.triggers.some((t) => t.enters?.nameExiledWithSelf)) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileGraveyard" || e.type === "chooseFromGraveyard" || e.type === "exileTop");
    if (imprints.length !== 1 || others.length !== 1) out.unsupported.push("(watches for the name of an exiled card it can't link to one imprint ability)");
    else imprints[0]!.linked = true;
  }
  // Isochron Scepter: "copy the exiled card" is linked to the one ability that exiles a card from the hand as it enters.
  const copies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body)].some((b) => allEffects(b.effects).some((e) => e.type === "castLinkedCopy"));
  // Panoptic Mirror: the one activated ability that exiles a card from the hand, with no such enters trigger.
  if (copies) {
    const entering = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
    const imprints = entering.length ? entering : out.activated.flatMap((a) => allEffects(a.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
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
  // Myr Welder: "all cards exiled with it" are the ones its one exile ability exiled (CR 607.2a).
  if (out.borrows?.linked) {
    const all = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile");
    const others = all.some((e) => e.type === "exileGraveyard" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileTop" || (e.type === "discard" && !!e.exile));
    if (others || out.spell || exiles.length !== 1 || exiles[0]!.until) out.unsupported.push("(has abilities of exiled cards it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  // "Target creature card exiled with ~" (Dino DNA, The Darkness Crystal): linked to the one ability that exiles cards
  // (CR 607.2a), or to its replacement effect that exiles them (The Darkness Crystal's, already linked).
  const bodies = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])];
  // Mindreaver: "target spell with the same name as a card exiled with ~": the cards its one exile instruction (heroic's
  // "exile the top three cards of target player's library") exiled (CR 607.2a).
  if (bodies.some((b) => b.targets.some((t) => t.nameLinkedExile))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && !e.putAll);
    const others = all.some((e) => ["exile", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong"].includes(e.type) || (e.type === "search" && e.dest.zone === "exile") || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile));
    if (others || out.spell || tops.length !== 1 || out.exileInsteadOfDying) out.unsupported.push("(names a card exiled with it that it can't link to one exile ability)");
    else tops[0]!.linked = true;
  }
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
  // Veteran Survivor: "As long as there are three or more cards exiled with ~": the same, in the static's condition.
  // Profane Procession: "Exile target creature. Then if there are three or more cards exiled with ~, transform it": the
  // same, in an ability's own condition.
  // Phyrexian Ingester: "the exiled creature card's power" is about what its one exile ability (imprint) exiled.
  // Colfenor's Urn: "if three or more cards have been exiled with ~", in its trigger's intervening "if".
  // The Kenriths' Royal Funeral: a cost reduction "for each card exiled with ~", the same.
  // Sutured Ghoul: "the exiled cards" are what its "As ~ enters, exile ..." exiled (CR 607.2b), when nothing else exiles.
  if (out.entersExileFromYard && !yardEntersLinkOnly(out, bodies)) out.unsupported.push("(counts cards exiled with it that it can't link to one exile ability)");
  // Mastercraft Raptor, Sunbird Effigy: "the exiled cards used to craft it" are linked by its craft cost (CR 702.167c).
  else if (!out.entersExileFromYard && (out.statics.some((st) => /"linkedExiled(?:PT)?"/.test(JSON.stringify(st.mods).replace(/\{"kind":"linkedExiled(?:PT)?"[^{}]*"crafted":true[^{}]*\}/g, "")) || JSON.stringify(st.condition ?? null).includes('"linkedExiled"')) || (out.costMods ?? []).some((cm) => JSON.stringify(cm.times ?? null).includes('"linkedExiled"')) || bodies.some((b) => JSON.stringify(b).includes('"linkedExiled"')) || out.triggers.some((t) => JSON.stringify(t.ifCond ?? null).includes('{"kind":"linkedExiled","ever":true}'))) && !bodies.some((b) => allEffects(b.effects).some((e) => e.type === "impulse"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    // Azor's Gateway: "exile a card from your hand", its one exile instruction (CR 607.2a), the cards it exiles kept face up.
    const fromHand = all.filter((e): e is Extract<Effect, { type: "discard" }> => e.type === "discard" && !!e.exile && e.who.ref === "you" && !e.until && !e.ownerMay && !e.controllerMay && !e.suspendMv && !e.random);
    // Creeping Inn: "you may exile a creature card from your graveyard", one card chosen as it resolves, its one exile.
    const fromYard = all.filter((e): e is Extract<Effect, { type: "chooseFromGraveyard" }> => e.type === "chooseFromGraveyard" && e.dest === "exile" && e.n === 1 && !e.who && !e.anyGraveyard && !e.fromExile && !e.nAmount && !e.anyNumber && !e.chooser);
    const others = all.some((e) => e.type === "exileGraveyard" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile && !fromHand.includes(e)) || (e.type === "chooseFromGraveyard" && e.dest === "exile" && !fromYard.includes(e)));
    // Lumbering Battlement (round B208): its one "exile ... until it leaves the battlefield", linked as it was parsed.
    const untilLinked = all.filter((e) => e.type === "exile" && e.until === "sourceLeaves" && !!e.linked);
    const otherUntil = all.some((e) => e.type === "exile" && !!e.until && !untilLinked.includes(e));
    if (untilLinked.length && (others || otherUntil || out.spell || exiles.length + fromHand.length + fromYard.length + untilLinked.length !== 1)) out.unsupported.push("(counts cards exiled with it that it can't link to one exile ability)");
    else if (untilLinked.length) {
      // already linked
    } else if (others || out.spell || exiles.length + fromHand.length + fromYard.length !== 1) out.unsupported.push("(counts cards exiled with it that it can't link to one exile ability)");
    else (exiles[0] ?? fromHand[0] ?? fromYard[0]!).linked = true;
  }
  // Evendo Brushrazer: "play cards exiled with ~" is about the cards its one "exile the top card of your library" exiled
  // (CR 607.2a); Nightveil Specter's "that player exiles the top card of their library" likewise.
  if (castsTheExiled.has(out)) {
    // Null Summoner: "the exiled card" is the one its one "exile that card" from a hand exiled (CR 607.2a).
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const takes = all.filter((e): e is Extract<Effect, { type: "takeFromHand" }> => e.type === "takeFromHand" && e.action === "exile" && e.n === undefined && !e.until && !e.orGraveyard);
    const others = all.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard" || e.type === "impulse" || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile) || (e.type === "search" && e.dest.zone === "exile") || e.type === "castFromAmong" || e.type === "pick" || e.type === "chooseFromGraveyard" || (e.type === "takeFromHand" && !takes.includes(e)));
    if (others || out.spell || takes.length !== 1) out.unsupported.push("(casts the exiled card, which it can't link to one exile ability)");
    else takes[0]!.linked = true;
  } else if (out.playLinkedWhile && out.playLinkedCastOnly) {
    // Rona, Disciple of Gix: its "exile target historic card from your graveyard" as it enters and its "exile the top card
    // of your library" both (CR 607.2a: each ability printed on it that exiles cards; rulings).
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && e.who.ref === "you" && !e.putAll);
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const others = all.some((e) => e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile) || (e.type === "search" && e.dest.zone === "exile") || e.type === "castFromAmong");
    // Azula, Cunning Usurper: a player's own pick of what to exile, linked as it was parsed.
    const picked = all.filter((e) => (e.type === "pick" && e.action === "exile" && e.linked) || (e.type === "chooseFromGraveyard" && e.dest === "exile" && e.linked));
    if (others || out.spell || tops.length + exiles.length + picked.length === 0) out.unsupported.push("(casts cards exiled with it that it can't link to its exile abilities)");
    else for (const e of [...tops, ...exiles]) e.linked = true;
  } else if (out.playLinkedWhile && (out.playLinkedSpellOnce || out.playLinkedLandsOnly)) {
    // Hedonist's Trove: "exile target opponent's graveyard" as it enters, its one exile (CR 607.2a), face up.
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const yards = all.filter((e): e is Extract<Effect, { type: "exileGraveyard" }> => e.type === "exileGraveyard");
    const others = all.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "exileHand" || (e.type === "discard" && !!e.exile) || (e.type === "search" && e.dest.zone === "exile") || e.type === "castFromAmong" || e.type === "pick" || e.type === "chooseFromGraveyard");
    if (others || out.spell || yards.length !== 1 || Object.keys(yards[0]!).some((k) => k !== "type" && k !== "who")) out.unsupported.push("(plays cards exiled with it that it can't link to one exile ability)");
    else yards[0]!.linked = true;
  } else if (out.playLinkedWhile && out.playLinkedLook) {
    // Colfenor's Plans: "exile the top seven cards of your library face down", its one exile, linked as every face-down
    // exile with a source is (CR 607.2a), its controller looking at them (CR 406.3).
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const faceDown = all.filter((e): e is Extract<Effect, { type: "exileFaceDown" }> => e.type === "exileFaceDown");
    const others = all.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileHand" || (e.type === "discard" && !!e.exile) || (e.type === "search" && e.dest.zone === "exile") || e.type === "castFromAmong" || e.type === "pick" || e.type === "chooseFromGraveyard");
    const f = faceDown[0];
    if (others || out.spell || faceDown.length !== 1 || f!.from !== "top" || f!.actor || f!.who || f!.pickOne || f!.foretold !== undefined) out.unsupported.push("(plays cards exiled with it that it can't link to one exile ability)");
    else f!.look = true;
  } else if (out.playLinkedWhile) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    // Nightveil Specter: "that player exiles the top card of their library", the damaged player's card, linked the same.
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && (e.who.ref === "you" || e.who.ref === "eventPlayer") && !e.putAll);
    // Intellect Devourer: "each opponent exiles a card from their hand until ~ leaves the battlefield", linked the same.
    const fromHands = all.filter((e): e is Extract<Effect, { type: "discard" }> => e.type === "discard" && !!e.exile && !e.ownerMay && !e.suspendMv);
    const others = all.some((e) => e.type === "exile" || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile && !fromHands.includes(e)));
    if (others || out.spell || tops.length + fromHands.length !== 1) out.unsupported.push("(plays cards exiled with it that it can't link to one exile ability)");
    else (tops[0] ?? fromHands[0]!).linked = true;
  }
  // Valakut Exploration: "cards exiled with ~" are the ones its one impulse exiled (CR 607.2a).
  // Court of Locthwain: "cast a spell from among cards exiled with ~" too.
  const usesLinked = (b: AbilityBody) => allEffects(b.effects).some((e) => e.type === "moveLinked" || e.type === "castLinkedFree") || JSON.stringify(b).includes('"linkedExiled"');
  const impulses = bodies.flatMap((b) => allEffects(b.effects)).filter((e): e is Extract<Effect, { type: "impulse" }> => e.type === "impulse");
  if (impulses.length && (bodies.some(usesLinked) || out.triggers.some((t) => JSON.stringify(t.ifCond ?? null).includes('"linkedExiled"') || !!t.cast?.fromLinked))) {
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
  // Triarch Stalker, Beckoning Will-o'-Wisp: "the last chosen player" is the one its "At the beginning of combat on your
  // turn, choose an opponent" chose last, kept on the permanent; with no such trigger it isn't known.
  if (out.statics.some((st) => st.affects.kind === "filter" && st.affects.spec?.chosen === "attackingPlayer")) {
    const chooses = out.triggers.flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "choose" }> => e.type === "choose" && e.choice === "opponent");
    if (chooses.length !== 1 || out.spell || out.entersChoose) out.unsupported.push("(the last chosen player isn't chosen by one triggered ability)");
    else chooses[0]!.keepOnSource = true;
  }
  // "The chosen creature" is the one chosen as it entered (Dauntless Bodyguard); with no such choice it isn't known.
  if (!out.entersChooseObject && /"(?:ref|kind)":"chosenObject"/.test(JSON.stringify({ t: out.triggers, a: out.activated, s: out.statics, sp: out.spell ?? null }))) out.unsupported.push("(the chosen creature isn't chosen as it enters)");
  // Shapeshifter: "the last chosen number" is the one chosen as it entered or by its one "you may choose a number"
  // trigger since, kept on the permanent (rulings: one choice each upkeep).
  if (JSON.stringify(out.statics).includes('"selfChosenNumber"')) {
    const chooses = out.triggers.flatMap((t) => allEffects(t.body.effects)).filter((e): e is Extract<Effect, { type: "choose" }> => e.type === "choose" && e.choice === "number" && !!e.range);
    if (chooses.length !== 1 || out.spell || out.activated.length || out.entersChoose?.length !== 1 || out.entersChoose[0]!.what !== "number") out.unsupported.push("(the last chosen number isn't chosen as it enters and by one triggered ability)");
    else chooses[0]!.keepOnSource = true;
  }
  // Circu: both of its "exile the top card of target player's library" triggers are linked to its ban (CR 607.2a).
  // Exclusion Ritual, Ixalan's Binding: "the exiled card" lines linked their one exile as they were read; nothing more to do.
  // Ashiok's Erasure: its linked "exile target spell", and a leaves ability that returns that card (linked below).
  const returnsOnly = (tr: (typeof out.triggers)[number]) => tr.event === "selfLeaves" && tr.body.effects.length === 1 && tr.body.effects[0]!.type === "returnLinked";
  // Godsend: its one linked "exile one of those creatures" (a pick), with only an equip ability besides.
  const exiledCardBan = out.linkedNameCastBan && bodies.flatMap((b) => allEffects(b.effects)).filter((e) => (e.type === "exile" || e.type === "counterSpell" || (e.type === "pick" && e.action === "exile")) && e.linked).length === 1 && out.triggers.filter((tr) => !returnsOnly(tr)).length === 1 && out.activated.every((a) => a.equip) && !out.spell;
  if (out.linkedNameCastBan && !exiledCardBan) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && !e.putAll);
    const others = all.some((e) => e.type === "exile" || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "exileHand" || (e.type === "search" && e.dest.zone === "exile") || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile) || e.type === "castFromAmong");
    if (others || out.spell || !tops.length || out.activated.length) out.unsupported.push("(bans names of cards exiled with it that it can't link to its exile abilities)");
    else for (const e of tops) e.linked = true;
  }
  // Kaho, Minamo Historian; Jeleva, Nephalia's Scourge; Shell of the Last Kappa: "cast a spell from among cards exiled
  // with ~" as it resolves: the cards its one exile instruction exiled (CR 607.2a): Kaho's search, Jeleva's "each player
  // exiles the top X cards", Shell's exiled spell.
  if (bodies.some((b) => allEffects(b.effects).some((e) => (e.type === "castFromAmong" && e.fromLinked && !e.crafted) || e.type === "playLinkedThisTurn"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && !e.putAll);
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const searches = all.filter((e): e is Extract<Effect, { type: "search" }> => e.type === "search" && e.dest.zone === "exile" && !e.others && !e.split && !e.mayInstead && !e.condDest && !e.landTo && !e.cardTo);
    // Kayla's Music Box: "exile it face down", always linked to its source. River Song's Diary: its spells exiled as they
    // resolve, linked as they're exiled.
    // Summon: Esper Valigarmanda: "exile an instant or sorcery card from each graveyard", linked as it's parsed.
    const faceDown = all.filter((e) => e.type === "exileFaceDown" || (e.type === "exileAsResolves" && !!e.linked) || (e.type === "chooseFromGraveyard" && e.dest === "exile" && !!e.linked));
    const others = all.some((e) => (e.type === "exile" && !!e.until) || (e.type === "search" && !searches.includes(e)) || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileHand" || (e.type === "chooseFromGraveyard" && e.dest === "exile" && !e.linked) || (e.type === "discard" && !!e.exile) || (e.type === "castFromAmong" && !e.fromLinked));
    if (others || out.spell || impulses.length || tops.length + exiles.length + searches.length + faceDown.length !== 1 || out.exileInsteadOfDying) out.unsupported.push("(casts a card exiled with it that it can't link to one exile ability)");
    else if (faceDown.length) {
      // Linked as it's exiled.
    } else if (tops[0]) tops[0].linked = true;
    else if (exiles[0]) exiles[0].linked = true;
    else searches[0]!.dest = { ...searches[0]!.dest, linked: true };
  }
  // Currency Converter: "Whenever you discard a card, you may exile that card from your graveyard" and "Put a card exiled
  // with ~ into its owner's graveyard": the cards its one exile instruction exiled (CR 607.2a).
  if (!impulses.length && bodies.some((b) => allEffects(b.effects).some((e) => e.type === "moveLinked"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    // Nautiloid Ship: "exile target player's graveyard" is the one exile instruction too.
    const exiles = all.filter((e): e is Extract<Effect, { type: "exile" | "exileGraveyard" }> => (e.type === "exile" && !e.until) || e.type === "exileGraveyard");
    const others = all.some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || (e.type === "discard" && !!e.exile));
    // Endless Horizons: "search your library for any number of Plains cards, exile them" as its one exile instruction.
    const searches = all.filter((e): e is Extract<Effect, { type: "search" }> => e.type === "search" && e.dest.zone === "exile" && !e.others && !e.split && !e.mayInstead && !e.condDest && !e.landTo && !e.cardTo);
    // Ashiok, Nightmare Weaver: "a creature card ... exiled with ~" is any card exiled by its "exile the top three cards" and
    // its "exile all cards from all opponents' hands and graveyards" abilities (CR 607.2a, rulings), all linked to it.
    const tops = all.filter((e): e is Extract<Effect, { type: "exileTop" }> => e.type === "exileTop" && !e.putAll);
    // Yggdrasil, Rebirth Engine: its "exile all creature cards from your graveyard" as it enters and its "exile the top three
    // cards of your library" both (CR 607.2a: each ability printed on it that exiles cards).
    const permanentTops = !others && tops.length && !out.spell && !searches.length && exiles.every((e) => !e.until) && !all.some((e) => e.type === "impulse" || e.type === "castFromAmong" || (e.type === "chooseFromGraveyard" && e.dest === "exile") || e.type === "exileHand");
    if (!others && tops.length && out.activated.every((a) => a.loyalty !== undefined || a.loyaltyX) && !out.triggers.length && !out.spell) for (const e of [...exiles, ...tops]) e.linked = true;
    else if (permanentTops) for (const e of [...exiles, ...tops]) e.linked = true;
    else if (tops.length) out.unsupported.push("(refers to cards exiled with it that it can't link to its exile abilities)");
    else if (!others && exiles.length === 1) exiles[0]!.linked = true;
    // Death in Heaven: "I, II — ... exiles their graveyard" is two chapter abilities (CR 714.2d) printed on it, each an
    // exile instruction linked to its "cards exiled with ~" (CR 607.2a).
    else if (!others && exiles.length > 1 && ((texts) => texts.length === exiles.length && new Set(texts).size === 1)(out.triggers.filter((t) => t.event === "chapter" && allEffects(t.body.effects).some((e) => (exiles as Effect[]).includes(e))).map((t) => t.body.text))) for (const e of exiles) e.linked = true;
    else if (!others && !exiles.length && searches.length === 1 && !all.some((e) => e.type === "search" && e !== searches[0])) searches[0]!.dest = { ...searches[0]!.dest, linked: true };
    // Vault 13: Dweller's Journey: "Return two cards exiled with ~ ..." are the ones its chapter I exiled "until ~ leaves the
    // battlefield" (CR 607.2a), its only exile instruction; the ones chapter III moves are no longer there to return.
    // Sothera, the Supervoid: "each opponent chooses a creature they control and exiles it" is its one exile instruction.
    else if (!others && !exiles.length && !searches.length && ((picks) => picks.length === 1 && (picks[0]!.linked = true))(all.filter((e): e is Extract<Effect, { type: "pick" }> => e.type === "pick" && e.action === "exile"))) {}
    // Pinnacle Starcage: "Put each card exiled with ~ into its owner's graveyard" is about its "exile all artifacts and
    // creatures ... until ~ leaves the battlefield" the same way.
    else if (!others && !exiles.length && !tops.length && !searches.length && all.some((e) => e.type === "moveLinked" && (e.exactly !== undefined || e.countInGraveyard))) {
      const until = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && e.until === "sourceLeaves");
      if (until.length === 1 && all.filter((e) => e.type === "exile").length === 1) until[0]!.linked = true;
      else out.unsupported.push("(refers to cards exiled with it that it can't link to its exile abilities)");
    }
  }
  // Clone Shell, Summoner's Egg: "turn the exiled card face up" is about the one card its imprint exiled face down as it
  // entered (CR 607.2a), its only exile instruction.
  if (bodies.some((b) => allEffects(b.effects).some((e) => e.type === "moveLinked" && e.turnFaceUp))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const faceDown = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "exileFaceDown" && (e.from === "handCard" || (e.pickOne && !e.who)));
    const exiles = all.filter((e) => ["exile", "exileTop", "exileGraveyard", "impulse", "takeFromHand", "hideaway", "exileFaceDown", "exileHand", "castFromAmong"].includes(e.type) || (e.type === "search" && e.dest.zone === "exile") || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile));
    if (out.spell || faceDown.length !== 1 || exiles.length !== 1) out.unsupported.push("(turns face up an exiled card it can't link to one imprint ability)");
  }
  // Murktide Regent, Soulflayer: their delve's cards and no other exile (round B182).
  roundB182Finish(out, bodies.flatMap((b) => allEffects(b.effects)));
  // Hofri Ghostforge: the card its trigger exiles, linked to the Spirit tokens it creates (round 354).
  round354Finish(out);
  // Ethereal Forager: with delve and no exile instruction of its own, "cards exiled with ~" are those its delve exiled as
  // it was cast (rulings; linked to the permanent it becomes, CR 607.2q).
  if (out.delve && !out.spell && bodies.some((b) => allEffects(b.effects).some((e) => e.type === "moveLinked"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const others = all.some((e) => e.type === "exile" || e.type === "exileTop" || e.type === "exileGraveyard" || e.type === "impulse" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "exileHand" || (e.type === "search" && e.dest.zone === "exile") || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile) || e.type === "castFromAmong");
    if (others || out.additionalCosts?.some((c) => "exile" in c && c.exile) || out.exileInsteadOfDying) out.unsupported.push("(returns cards exiled with it that it can't link to its delve)");
    else out.delveLinked = true;
  }
  // Savior of Ollenbock: "Whenever ~ trains" (CR 702.149c): its training ability puts the counter and says whether it
  // trained (Effect "train").
  if (out.triggers.some((t) => t.event === "selfTrains"))
    for (const t of out.triggers) if (t.training && t.event === "selfAttacks" && t.body.effects.length === 1 && t.body.effects[0]!.type === "counters") t.body = { ...t.body, effects: [{ type: "train" }] };
  // "Create a token that's a copy of a card exiled with ~" (Mimic Vat, The Cloning of Shredder): the cards its one exile
  // ability exiled (CR 607.2a), unless that's already linked (Mimic Vat's imprint). "A copy of the exiled card" (Mardu
  // Siegebreaker): the one its "exile ... until ~ leaves the battlefield" ability exiled, when it has no other exile.
  if (bodies.some((b) => JSON.stringify(b).includes('"linkedCard"')) && !out.activated.some((a) => allEffects(a.body.effects).some((e) => e.type === "bounce" && e.what.ref === "linkedCard"))) {
    const all = bodies.flatMap((b) => allEffects(b.effects));
    const plain = all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
    const exiles = plain.length ? plain : all.filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile");
    const others = all.some((e) => (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || (e.type === "discard" && !!e.exile));
    // Prototype Portal: "Imprint — When ~ enters, you may exile an artifact card from your hand": its only exile.
    const imprints = all.filter((e): e is Extract<Effect, { type: "takeFromHand" }> => e.type === "takeFromHand" && e.action === "exile");
    const imprintOnly = !exiles.length && imprints.length === 1 && !imprints[0]!.until && out.triggers.some((t) => t.event === "selfEnters" && allEffects(t.body.effects).includes(imprints[0]!)) && !all.some((e) => e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || (e.type === "discard" && !!e.exile));
    // The Aesir Escape Valhalla: its chapter I's exile from the graveyard, already linked (round345Chapter), its only exile.
    const yardLinked = !exiles.length && !others && !out.spell && aesirLinked(out);
    if (imprintOnly && !out.spell) imprints[0]!.linked = true;
    else if (yardLinked) {
      // Linked as its chapters were read.
    } else if (others || out.spell || exiles.length !== 1) out.unsupported.push("(copies a card exiled with it that it can't link to one exile ability)");
    else exiles[0]!.linked = true;
  }
  // Hofri Ghostforge's Spirit token: its card is linked by the ability that created it (round354.ts), not by an exile of its own.
  const returns = out.triggers.filter((t) => allEffects(t.body.effects).some((e) => (e.type === "returnLinked" && !e.createdLink) || e.type === "linkedExileToken" || (e.type === "dig" && e.eachOf?.ref === "linkedExileOwners")));
  if (!returns.length) return;
  // The Princess Takes Flight: a later chapter returns what an earlier one exiled, its only exile.
  if (returns.some((t) => t.event === "chapter")) {
    if (returns.length === 1 && aesirLinked(out)) return;
    const chExiles = out.triggers.flatMap((t) => allEffects(t.body.effects).filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && t.event === "chapter" && !e.until));
    const allExiles = [...out.triggers.map((t) => t.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "exile" || e.type === "takeFromHand" || e.type === "hideaway" || e.type === "exileFaceDown" || e.type === "impulse" || e.type === "exileTop" || e.type === "search");
    const ret = returns[0]!;
    if (returns.length !== 1 || chExiles.length !== 1 || allExiles.length !== 1 || chExiles[0]!.what.ref !== "target" || !(ret.chapter! > (out.triggers.find((t) => allEffects(t.body.effects).includes(chExiles[0]!))?.chapter ?? 99))) out.unsupported.push("(returns exiled cards it can't link to one exile ability)");
    else chExiles[0]!.linked = true;
    return;
  }
  // Ashiok's Erasure: the spell its enters ability exiled, already linked by its name ban, with no other exile.
  const linkedSpells = [...out.triggers.map((tr) => tr.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => e.type === "counterSpell" && e.linked);
  if (linkedSpells.length === 1 && returns.length === 1 && returns[0]!.event === "selfLeaves" && !out.spell && allEffects(returns[0]!.body.effects).every((e) => e.type === "returnLinked")) {
    const others = [...out.triggers.map((tr) => tr.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => ["exile", "exileTop", "exileFaceDown", "takeFromHand", "hideaway", "impulse", "exileHand", "exileGraveyard"].includes(e.type) || (e.type === "search" && e.dest.zone === "exile"));
    if (!others.length) return;
  }
  // Induced Amnesia: "When ~ is put into a graveyard from the battlefield, return the exiled cards to their owner's hand":
  // the cards its enters ability exiled face down, its only exile (CR 607.2a), linked by that ability's source as it was.
  const faceDowns = [...out.triggers.map((tr) => tr.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter((e) => ["exile", "exileTop", "exileFaceDown", "takeFromHand", "hideaway", "impulse", "exileHand", "search", "pick", "discard"].includes(e.type));
  if (!out.spell && faceDowns.length === 1 && faceDowns[0]!.type === "exileFaceDown" && faceDowns[0]!.from === "hand" && returns.length === 1 && returns[0]!.event === "selfToGraveyard" && out.triggers.some((tr) => tr.event === "selfEnters" && tr.body.effects.includes(faceDowns[0]!)) && allEffects(returns[0]!.body.effects).every((e) => e.type === "returnLinked" && e.dest === "hand")) return;
  // "When this creature is turned face up, exile ..." (Aurelia's Vindicator) is one of its exile abilities too (CR 607.2a).
  // Hoarding Dragon: "search your library for an artifact card, exile it, then shuffle" is its exile ability too.
  // Wormfang Newt, Crab and Drake: "exile a land you control", "an opponent chooses a permanent you control ... and exiles
  // it", "unless you exile a creature you control": a player's pick of a permanent to exile, as it enters.
  const exiling = (e: Effect): e is Extract<Effect, { type: "exile" | "takeFromHand" | "hideaway" | "discard" | "exileHand" | "search" | "pick" }> => ((e.type === "pick" && e.action === "exile" && !e.linked) || e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || (e.type === "discard" && !!e.exile) || e.type === "exileHand" || (e.type === "search" && e.dest.zone === "exile" && !e.others && !e.split)) && !("until" in e && e.until);
  const exiles0 = [...out.triggers.filter((t) => t.event === "selfEnters" || t.event === "selfTurnedFaceUp").map((t) => t.body), ...out.activated.map((a) => a.body)].flatMap((b) => allEffects(b.effects)).filter(exiling);
  // "Landfall — Whenever a land you control enters, you may exile target nonland permanent other than ~" (Admonition
  // Angel): with no exile as it enters or in an activated ability, its one other triggered ability that exiles.
  // Prowling Geistcatcher: "Whenever you sacrifice another creature, exile it": the card the sacrifice put in a graveyard.
  // Wall of Nets: "At end of combat, exile all creatures blocked by ~".
  const exiles = exiles0.length ? exiles0 : out.triggers.filter((t) => !returns.includes(t)).flatMap((t) => allEffects(t.body.effects).filter((e): e is Extract<Effect, { type: "exile" }> => exiling(e) && e.type === "exile" && (e.what.ref === "target" || (e.what.ref === "subjectCard" && t.event === "youSacrifice") || (e.what.ref === "blockingIt" && !!e.what.blocked && t.event === "eachEndCombat") || (e.what.ref === "eventGroup" && t.event === "batch" && t.batch?.what === "discards"))));
  // "As an additional cost to cast this spell, behold an Elf and exile it" with "When this creature leaves the battlefield,
  // return the exiled card to its owner's hand" (Champions of the Perfect): the card exiled to pay the cost of the spell
  // that became this permanent (CR 607.2q, recorded as it's cast).
  const costExile = out.additionalCosts?.filter((c) => c.kind === "reveal" && c.exile).length === 1 && !out.costOr;
  if (costExile && !exiles.length && returns.length === 1 && returns[0]!.event === "selfLeaves" && allEffects(returns[0]!.body.effects).every((e) => e.type !== "linkedExileToken" && !(e.type === "dig" && e.eachOf))) return;
  // Fear of Abduction: "As an additional cost to cast this spell, exile a creature you control" with an enters ability that
  // exiles: both are linked to the leaves ability (CR 607.2a, 607.2q).
  if (out.additionalCosts?.filter((c) => c.kind === "sacrifice" && c.exile).length === 1 && !out.costOr && exiles.length === 1 && returns.length === 1 && returns[0]!.event === "selfLeaves" && allEffects(returns[0]!.body.effects).every((e) => e.type !== "linkedExileToken")) out.costExileLinked = true;
  // Helvault: "{1}, {T}: Exile target creature you control." and "{7}, {T}: Exile target creature you don't control." are
  // each linked to "When Helvault is put into a graveyard from the battlefield, return all cards exiled with it to the
  // battlefield under their owners' control" (CR 607.2a, rulings): the cards either of its two exile abilities exiled.
  if (exiles.length === 2 && returns.length === 1 && returns[0]!.event === "selfToGraveyard" && !out.spell && exiles.every((e) => e.type === "exile" && e.what.ref === "target" && out.activated.some((a) => a.body.effects.includes(e))) && allEffects(returns[0]!.body.effects).every((e) => e.type === "returnLinked" && e.dest === "battlefield")) {
    for (const e of exiles) (e as Extract<Effect, { type: "exile" }>).linked = true;
    return;
  }
  // "When this creature dies, you may put the exiled card into its owner's hand" (Hoarding Dragon): a leaves ability too.
  // Toluz, Clever Conductor: "When ~ dies, put the cards exiled with it into their owner's hand", the cards its discard
  // trigger exiled (round B193).
  const discardExile = exiles[0]?.type === "exile" && exiles[0].what.ref === "eventGroup";
  if (exiles.length !== 1 || returns.length !== 1 || (returns[0]!.event !== "selfLeaves" && !(returns[0]!.event === "selfDies" && (exiles[0]!.type === "search" || discardExile)))) {
    out.unsupported.push("(returns exiled cards it can't link to one exile ability)");
    return;
  }
  const ex = exiles[0]!;
  // The card a search exiles is one you get back, not one you want gone (for the bot).
  if (ex.type === "search") {
    ex.dest.linked = true;
    delete ex.away;
  } else if (ex.type !== "hideaway") ex.linked = true; // hideaway's exile is always linked
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
    if (Array.isArray(v)) {
      // Rupture: "Sacrifice a creature. ~ deals damage equal to the sacrificed creature's power ...": an effect's own
      // sacrifice of one creature, for the instructions after it (s.resolving.sacrificedThisWay).
      const was = effectSac;
      for (const x of v) {
        visit(x);
        const e = x as { type?: string; action?: string; n?: unknown; who?: { ref?: string } } | null;
        if (e?.type === "pick" && e.action === "sacrifice" && e.n === 1 && e.who?.ref === "you") effectSac = true;
        // Iron Man, Titan of Innovation: "then you may sacrifice a noncreature artifact. If you do, ... the sacrificed
        // artifact's mana value": the optional sacrifice of one permanent, for the "if you do" after it.
        const inner = (x as { type?: string; effects?: unknown[] } | null)?.type === "may" ? (x as { effects: unknown[] }).effects : undefined;
        if (inner?.length === 1) {
          const p = inner[0] as typeof e;
          if (p?.type === "pick" && p.action === "sacrifice" && p.n === 1 && p.who?.ref === "you") effectSac = true;
        }
      }
      effectSac = was;
      return;
    }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    // Adipose Offspring: "If ~'s emerge cost was paid, ... the sacrificed creature's toughness": the creature sacrificed for
    // its emerge cost (CR 702.119a), only in that branch of its enters trigger.
    if (o.type === "if" && emergeEnters && (o.cond as { kind?: string; alt?: string } | undefined)?.kind === "altPaid" && (o.cond as { alt?: string }).alt === "emerge") {
      const was = canSac;
      canSac = true;
      visit(o.effects);
      canSac = was;
      visit(o.otherwise);
      return;
    }
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
    if (((o.ref === "sacrificed" && !o.revealedCost && !effectSac) || o.sharesColorWithSacrificed || o.kind === "sacrificedSuspected" || o.kind === "sacrificedLegendary" || o.kind === "sacrificedSubtype" || o.kind === "sacrificedType" || o.kind === "sacrificedColor" || (o.kind === "addKeywords" && (o.keywords as string[]).includes(SACRIFICED_LANDWALK))) && !canSac) bad = true;
    if (o.ref === "sacrificed" && o.exiledCost && !exileCost && !yardExile) bad = true;
    // "The revealed card" needs one card revealed as a cost, and nothing sacrificed or exiled to share the record.
    if (o.ref === "sacrificed" && o.revealedCost && !revealCost) bad = true;
    // "The exiled card" of an "Exile a nonland card from your hand" cost (Jhoira of the Ghitu): that ability's own cost.
    // Primordial Mist: "that card" of an "Exile a face-down permanent you control" cost, likewise.
    // Phyrexian Devourer: "the exiled card" of an "Exile the top card of your library" cost, the ability's only cost.
    if (o.ref === "costExiled" && !handExileCost && !permExileCost && !yardCostCard && !libTopCost) bad = true;
    // "Cards exiled with ~" by its cost (Mechtitan Core): an activated ability that exiles other permanents as its cost.
    if (o.type === "returnExiled" && o.fromCost && !exileCost) bad = true;
    // "The chosen type" needs something that chooses one: "as ~ enters, choose" or "choose a creature type" before it.
    // "Players who chose war": one of the words each player chose as it entered.
    if (o.chosen === "byPlayer" && !out.entersEachPlayerChooses?.includes(o.chosenWord as string)) bad = true;
    if (typeof o.chosen === "string" && o.kind !== "setColors" && o.chosen !== "attackingPlayer" && o.chosen !== "byPlayer") (/olor/.test(o.chosen) ? needs.add("color") : o.chosen === "cardType" ? needs.add("cardType") : o.chosen === "name" ? needs.add("cardName") : o.chosen === "number" || o.chosen === "powerAtLeast" ? needs.add("number") : o.chosen === "parity" ? needs.add("parity") : o.chosen === "landOrNonland" ? needs.add("landOrNonland") : o.chosen === "landType" || o.chosen === "landTypeAt" ? needs.add("landType") : o.chosen === "typeOrder" ? needs.add("typeOrder") : o.chosen === "planeswalkerType" ? needs.add("planeswalkerType") : needs.add("creatureType"));
    if (o.kind === "chosenColor" || (o.kind === "setColors" && o.chosen === true)) needs.add("color");
    if (o.kind === "setColors" && o.chosen === "colors") needs.add("colors");
    if (o.kind === "setLandTypes" && (o.subtypes as string[]).includes(CHOSEN_LAND_TYPE)) needs.add("basicLandType");
    // Illusionary Terrain: "the first/second chosen type" of the two chosen as it entered.
    if ((o.kind === "setLandTypes" && o.chosenIndex !== undefined) || o.chosen === "landTypeAt") {
      if ((out.entersChoose ?? []).filter((c) => c.what === "basicLandType" && c.many).length !== 2) bad = true;
    }
    // "Landwalk of the chosen type": a land type chosen as it entered or resolved (any type, or a basic one for Giant Slug).
    if (o.kind === "addKeywords" && ((o.keywords as string[]).includes(CHOSEN_LANDWALK) || (o.keywords as string[]).includes(CHOSEN_SNOW_LANDWALK))) needs.add("landType");
    if (o.kind === "addKeywords" && ((o.keywords as string[]).includes(CHOSEN_PROTECTION) || (o.keywords as string[]).includes(CHOSEN_HEXPROOF))) needs.add("color");
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_PLAYER_PROTECTION) && !out.entersChoosePlayer) bad = true;
    // "Each of the chosen abilities" (Greymond): only with "as ~ enters, choose two abilities from among ...".
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_KEYWORDS) && !out.entersChoose?.some((c) => c.what === "keyword" && c.many)) bad = true;
    if (o.ref === "selfChosenPlayer" && !out.entersChoosePlayer) bad = true;
    // Volrath's Laboratory: "a creature token of the chosen color and type": both chosen as it entered, or one pair
    // (Sarpadian Empires, Vol. VII's "choose white Citizen, ...").
    if (o.type === "createToken" && o.chosenColorType) needs.add(out.entersChoose?.some((c) => c.what === "colorAndType") ? "colorAndType" : "color").add(out.entersChoose?.some((c) => c.what === "colorAndType") ? "colorAndType" : "creatureType");
    if (o.type === "choose") choices.add(o.choice as ChoiceKind);
    // Lobotomy: a card chosen from a revealed hand gives the name (Effect takeFromHand "name").
    if (o.type === "takeFromHand" && o.action === "name") choices.add("cardName");
    Object.values(o).forEach(visit);
  };
  const needs = new Set<ChoiceKind>();
  const choices = new Set<ChoiceKind>((out.entersChoose ?? []).map((c) => c.what));
  // Selective Snare: the creature type chosen as it's cast (CompiledCard.castChooseType) is its targets' type.
  if (out.castChooseType) choices.add("creatureType");
  if (out.entersNamesWithOpponent) choices.add("cardName");
  // "The sacrificed creature" refers to a sacrifice cost: the spell's, or the activated ability's own.
  // "The exiled card's power" (Corpse Lunge): the one card an "exile a creature card from your graveyard" cost exiled,
  // with nothing sacrificed to share the record.
  const yardExileOne = (costs: AdditionalCost[] | undefined) => costs?.filter((c) => c.kind === "exileFromGraveyard" && !c.top && !c.x && !c.linked && c.n === 1).length === 1 && !costs.some((c) => c.kind === "sacrifice" || c.kind === "forage" || c.kind === "craft");
  let canSac = !!out.additionalCosts?.some((c) => c.kind === "sacrifice") || yardExileOne(out.additionalCosts);
  let effectSac = false;
  let exileCost = false;
  let yardExile = yardExileOne(out.additionalCosts);
  let handExileCost = false;
  let permExileCost = false;
  // Tawnos, Solemn Survivor: "the exiled card" of an "Exile an artifact or creature card from your graveyard" cost, the
  // ability's only cost that exiles anything (game.ts payExtraCosts keeps it in StackItem.costExiled).
  let yardCostCard = false;
  let libTopCost = false;
  const oneReveal = (costs: AdditionalCost[] | undefined) => !!costs?.some((c) => c.kind === "reveal" && c.n === 1) && !costs.some((c) => c.kind === "sacrifice" || c.kind === "forage");
  let revealCost = oneReveal(out.additionalCosts);
  const hasEmerge = !!out.altCosts?.some((a) => a.kind === "emerge");
  let emergeEnters = false;
  visit([out.spell, out.statics, out.mana]);
  for (const t of out.triggers) {
    emergeEnters = hasEmerge && t.event === "selfEnters";
    visit(t);
  }
  emergeEnters = false;
  for (const ab of out.activated) {
    yardExile = yardExileOne(ab.costs);
    canSac = !!ab.costs?.some((c) => c.kind === "sacrifice") || yardExile;
    exileCost = !!ab.costs?.some((c) => c.kind === "sacrifice" && c.exile);
    handExileCost = !!ab.costs?.some((c) => c.kind === "exileFromHand" && !c.toLibrary && c.n === 1);
    permExileCost = ab.costs?.filter((c) => c.kind === "exileFromHand" || c.kind === "exileFromGraveyard" || c.kind === "sacrifice" || c.kind === "craft").length === 1 && !!ab.costs.some((c) => c.kind === "sacrifice" && c.exile && c.n === 1);
    revealCost = oneReveal(ab.costs);
    yardCostCard = ab.costs?.filter((c) => c.kind === "exileFromGraveyard" || c.kind === "exileFromHand" || c.kind === "craft" || (c.kind === "sacrifice" && c.exile) || (c.kind === "mill" && c.exile) || (c.kind === "reveal" && c.exile)).length === 1 && !!ab.costs.some((c) => c.kind === "exileFromGraveyard" && !c.top && !c.x && !c.linked && !c.process && c.n === 1);
    libTopCost = ab.costs?.length === 1 && ab.costs[0]!.kind === "mill" && !!ab.costs[0]!.exile && ab.costs[0]!.n === 1;
    visit(ab);
  }
  libTopCost = false;
  revealCost = false;
  yardCostCard = false;
  exileCost = false;
  yardExile = false;
  handExileCost = false;
  permExileCost = false;
  visit([out.costMods, out.activationTaxes]);
  if (out.nameBans || out.protectionFromChosenName) needs.add("cardName");
  // Seal of the Guildpact: "the chosen colors" are the ones it chose as it entered.
  if (out.costMods?.some((m) => m.perChosenColor) && !out.entersChoose?.some((c) => c.what === "color" && c.many)) bad = true;
  // Petrified Hamlet: a ban's or a static's chosen name is the one the permanent chose as it entered (its Chosen.name);
  // the choice of a "When ~ enters, choose a land card name" trigger is only kept while that trigger resolves.
  // Its one "When ~ enters, choose a land card name" trigger keeps the name on the permanent as it resolves (keepOnSource);
  // until then no name is chosen, so nothing is banned (round 342).
  const nameTrigger = out.triggers.length === 1 && out.triggers[0]!.event === "selfEnters" && !out.triggers[0]!.body.targets.length && out.triggers[0]!.body.effects.length === 1 ? out.triggers[0]!.body.effects[0]! : undefined;
  const keepsName = nameTrigger?.type === "choose" && nameTrigger.choice === "cardName" && !nameTrigger.who && !out.spell && !out.entersChoose && !out.entersNamesWithOpponent && !out.protectionFromChosenName && !JSON.stringify([out.activated, out.triggers]).includes('"chosen"');
  if (keepsName && nameTrigger.type === "choose") nameTrigger.keepOnSource = true;
  if ((out.nameBans || out.protectionFromChosenName || JSON.stringify(out.statics).includes('"chosen":"name"')) && !out.entersChoose?.some((c) => c.what === "cardName") && !out.entersNamesWithOpponent && !keepsName) bad = true;
  // Null Chamber: its two names ban casting and land plays, and nothing else here reads them.
  if (out.entersNamesWithOpponent && (out.nameBans?.length !== 2 || out.protectionFromChosenName || JSON.stringify(out.statics).includes('"chosen"') || JSON.stringify([out.triggers, out.activated]).includes('"chosen"'))) bad = true;
  if (out.noncreatureChosenMvCantBeCast) needs.add("number");
  // A basic land type is a land type too (CR 205.3i): Giant Slug's choice gives its landwalk.
  if (choices.has("basicLandType")) choices.add("landType");
  if ([...needs].some((k) => !choices.has(k))) bad = true;
  // Sower of Discord's trigger is about the two players chosen as it entered, and only that.
  if (out.triggers.some((tr) => tr.event === "chosenPlayerDealtDamage") !== !!out.entersChooseTwoPlayers) bad = true;
  // "The chosen player's upkeep", "whenever the chosen player casts" (Black Vise, Sewer Nemesis): the player its
  // "As ~ enters, choose a player" chose.
  if (out.triggers.some((tr) => tr.chosenPlayersTurn || tr.cast?.by === "chosen") && !out.entersChoosePlayer) bad = true;
  // "The power of the creature tapped this way" needs a "Tap an untapped creature you control" cost (or station's).
  const tapPowIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"stationPower"');
  if (tapPowIn([out.spell, out.triggers, out.statics]) || out.activated.some((ab) => tapPowIn(ab) && !ab.station && ab.costs?.filter((c) => c.kind === "tap" && c.n === 1 && !c.untap && !c.x && c.filter.kind === "object" && !!c.filter.types?.includes("Creature")).length !== 1)) bad = true;
  // Molten Exhale: a cast as though it had flash is checked for its behold once its targets are chosen (castProblem).
  if (out.flashIfKicked && !out.spell?.targets.length && out.kicker?.extraCosts?.[0]?.kind !== "tap") bad = true;
  // Dragon's Fire: "the power of that card or creature" is the one beheld for the spell's own optional behold cost.
  const beheldIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"beheldPower"');
  // Monstrous Emergence: or the one its mandatory "choose a creature you control or reveal a creature card" cost beheld.
  const oneBehold = (cs: readonly AdditionalCost[] | undefined) => cs?.length === 1 && cs[0]!.kind === "reveal" && !!cs[0]!.orControl && cs[0]!.n === 1;
  if (beheldIn([out.triggers, out.statics, out.activated]) || (beheldIn(out.spell) && !(out.kicker?.optional && oneBehold(out.kicker.extraCosts)) && !(!out.kicker && !out.costOr && oneBehold(out.additionalCosts)))) bad = true;
  // Wonderscape Sage: "that land" is the one land the ability's "Return a land you control to its owner's hand" cost returns.
  const retLandIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"returnedNonbasicLandType"');
  if (retLandIn([out.spell, out.triggers, out.statics]) || out.activated.some((ab) => retLandIn(ab) && ab.costs?.filter((c) => c.kind === "returnToHand" && c.n === 1 && c.filter.kind === "object" && !!c.filter.types?.includes("Land")).length !== 1)) bad = true;
  // Swallow Whole: "the creature tapped to pay ~'s additional cost" needs the spell's one "tap an untapped creature you
  // control" additional cost, and only the spell is about it.
  const costTapIn = (v: unknown) => JSON.stringify(v ?? null).includes('"ref":"costTapped"');
  if (costTapIn([out.triggers, out.statics, out.activated])) bad = true;
  if (costTapIn(out.spell) && (out.additionalCosts ?? []).filter((c) => c.kind === "tap" && c.n === 1 && !c.untap && !c.x && c.filter.kind === "object" && !!c.filter.types?.includes("Creature")).length !== 1) bad = true;
  // Cryptic Gateway: "each creature tapped this way" is about the activated ability's own cost of tapping two or more creatures.
  const kinTapIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kinOfCostTapped":true');
  if (kinTapIn([out.spell, out.triggers, out.statics]) || out.activated.some((ab) => kinTapIn(ab) && !ab.costs?.some((c) => c.kind === "tap" && c.n >= 2 && !c.untap && !c.x && c.filter.kind === "object" && !!c.filter.types?.includes("Creature")))) bad = true;
  // "If the discarded card ..." needs a discard cost: the spell's, or the activated ability's own.
  const discIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"discardedIs"');
  if (discIn(out.spell) && !out.additionalCosts?.some((c) => c.kind === "discard")) bad = true;
  if (discIn(out.triggers) || discIn(out.statics) || out.activated.some((ab) => discIn(ab) && !ab.costs?.some((c) => c.kind === "discard"))) bad = true;
  // Lethal Throwdown: "If the modified creature was sacrificed" needs the spell's "... or sacrifice a modified creature"
  // way to pay its additional cost, the one it's about.
  const modSacIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"costOrPaid","index":-1');
  if (modSacIn([out.triggers, out.statics, out.activated])) bad = true;
  if (modSacIn(out.spell)) {
    const ways = (out.costOr ?? []).flatMap((o, i) => (o.cost?.kind === "sacrifice" && o.cost.filter.kind === "object" && o.cost.filter.status === "modified" ? [i] : []));
    if (ways.length !== 1) bad = true;
    else out.spell = JSON.parse(JSON.stringify(out.spell).replaceAll('"kind":"costOrPaid","index":-1', `"kind":"costOrPaid","index":${ways[0]}`));
  }
  // "If the exiled card is a snow land" needs an activated ability's "Exile the top card of your library" cost.
  const exIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"costExiledIs"');
  if (exIn([out.spell, out.triggers, out.statics]) || out.activated.some((ab) => exIn(ab) && ab.costs?.filter((c) => c.kind === "mill" && c.exile && c.n === 1).length !== 1)) bad = true;
  // Hisoka's "the same mana value as the discarded card": an activated ability's discard cost of one card.
  const mvDiscIn = (v: unknown) => JSON.stringify(v ?? null).includes('"ifMvDiscarded":true');
  if (mvDiscIn(out.spell) || mvDiscIn(out.triggers) || mvDiscIn(out.statics) || out.activated.some((ab) => mvDiscIn(ab) && !ab.costs?.some((c) => c.kind === "discard" && c.n === 1))) bad = true;
  // "If evidence was collected" needs the "you may collect evidence N" it's linked to (CR 701.59c): in the spell, or its
  // permanent's enters trigger.
  const evidenceIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"evidence"');
  if ((evidenceIn(out.spell) || out.triggers.some((t) => t.ifEvidence || evidenceIn(t.body))) && out.evidence === undefined) bad = true;
  if (out.triggers.some((t) => t.event !== "selfEnters" && evidenceIn(t.body)) || evidenceIn(out.activated) || evidenceIn(out.statics)) bad = true;
  // Dodgy Jalopy: a "*" power for scavenge needs the characteristic-defining ability that sets it (CR 604.3).
  if (out.activated.some((ab) => ab.scavengeVariable) && !out.statics.some((st) => st.affects.kind === "self" && !st.condition && st.mods.some((m) => m.kind === "definePT" && m.power !== undefined))) bad = true;
  // Wanderwine Farewell: "for each permanent returned to its owner's hand this way" needs the spell's own return of
  // permanents first; nothing else counts it.
  const returnedIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"returnedFromCount"');
  if (returnedIn(out.triggers) || returnedIn(out.activated) || returnedIn(out.statics)) bad = true;
  if (out.spell && returnedIn(out.spell)) {
    const at = out.spell.effects.findIndex((e) => returnedIn(e));
    // The Eagles Are Coming!: one return or the other, by whether it was kicked.
    const bouncesTarget = (e: Effect): boolean => (e.type === "bounce" && e.what.ref === "target") || (e.type === "if" && e.cond.kind === "kicked" && !!e.otherwise?.length && [...e.effects, ...e.otherwise].every(bouncesTarget));
    if (!out.spell.effects.slice(0, at).some(bouncesTarget)) bad = true;
  }
  // "If this spell's surge cost was paid" needs that alternative cost (CR 702.117a, 702.137a): in the spell, or its
  // permanent's enters trigger.
  // "If the {1}{B} cost was paid": the card's one "rather than pay" cost, that mana (Baleful Mastery).
  const masteryMana = /\bIf the ((?:\{[^}]+\})+) cost was paid\b/.exec(out.spell?.text ?? "")?.[1];
  // "If ~ was cast using web-slinging" needs its web-slinging cost (CR 702.188a).
  if ((out.triggers.some((t) => t.ifAlt === "webSlinging") || out.entersWithCounters?.ifWebSlung) && !out.altCosts?.some((a) => a.webSlinging)) bad = true;
  for (const alt of ["surge", "spectacle", "alternative", "madness", "prowl", "mayhem", "emerge"] as const) {
    const altIn = (v: unknown) => JSON.stringify(v ?? null).includes(`"kind":"altPaid","alt":"${alt}"`);
    const alts = out.altCosts?.filter((a) => a.kind === alt) ?? [];
    // Madness is a keyword, not an alternative cost of the card's own text (CR 702.35).
    const linked = alt === "alternative" ? alts.length === 1 && alts[0]!.mana === masteryMana && !alts[0]!.costs?.length : alt === "madness" ? alts.length > 0 || out.madness !== undefined : alt === "mayhem" ? !!out.fromGraveyard?.some((g) => g.kind === "mayhem") : alts.length > 0;
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
  const snowIn = (v: unknown) => /"kind":"(?:snowSpent|spentPairs)"/.test(JSON.stringify(v ?? null));
  if (out.triggers.some((t) => t.event !== "selfEnters" && snowIn(t.body)) || snowIn(out.statics) || snowIn(out.activated)) bad = true;
  if (JSON.stringify([out.spell, out.triggers.map((t) => ({ ...t, cast: undefined })), out.statics, out.activated, out.entersWithCounters]).includes('"snowOfColors"')) bad = true;
  // "Enters with a counter for each creature of the chosen type": counted once its own "as ~ enters, choose" is answered
  // (afterChoice), both part of how it enters (CR 614.12); with nothing chosen as it enters it can't be counted.
  needs.clear();
  visit(out.entersWithCounters);
  if (needs.size === 1 && out.entersWithCounters && out.entersChoose?.length === 1 && needs.has(out.entersChoose[0]!.what)) out.entersWithCounters.afterChoice = out.entersChoose[0]!.what;
  else if (needs.size) bad = true;
  // Canker Abomination: a count about "the chosen player", once its "as ~ enters, choose an opponent" is answered.
  if (out.entersWithCounters && JSON.stringify(out.entersWithCounters.n).includes('"selfChosenPlayer"')) {
    if (out.entersChoosePlayer && !out.entersWithCounters.afterChoice && !out.entersChooseTwoPlayers) out.entersWithCounters.afterPlayer = true;
    else bad = true;
  }
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
  // Or in an alternative cost: "Foretell {X}{X}{W}", "Madness {X}{B}{B}" (0 unless that cost was paid, CR 107.3a).
  const cardX = parseManaCost(d.manaCost).hasX || !!out.additionalCosts?.some((c) => ("x" in c && c.x) || (c.kind === "sacrifice" && c.mvX)) || !!out.kicker?.costs.some((c) => parseManaCost(c).hasX) || parseManaCost(out.foretell ?? "").hasX || parseManaCost(out.madness ?? "").hasX
    // Lantern Flare: cast for "Cleave {X}{R}{W}", X is announced as it's cast (CR 107.3a, 601.2b): the cleaved text's X.
    || (d.oracleId.endsWith("|cleaved") && !!out.altCosts?.some((a) => a.kind === "cleave" && parseManaCost(a.mana ?? "").hasX));
  const bad = (what: string) => out.unsupported.push(what);
  // Glittering Lion: "~ loses "Prevent all damage ..."": one of its own printed static abilities, by its text.
  out.activated = out.activated.filter((a) => {
    const ok = allEffects(a.body.effects).every((e) => e.type !== "continuous" || e.mods.every((m) => m.kind !== "loseStatic" || out.statics.some((st) => st.text === m.text && st.affects.kind === "self")));
    if (!ok) bad(a.text);
    return ok;
  });
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
    if (!usesX(tr.body) || ((tr.event === "selfEnters" || tr.event === "selfCast") && cardX) || (tr.event === "selfBecomesMonstrous" && monstrousX) || (tr.event === "selfCycled" && cyclingX) || (tr.event === "selfTurnedFaceUp" && faceUpX) || tr.eventX || tr.xLookBackSubtype || (tr.xKicked && out.kicker?.multi)) return true;
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
    bad(`Splice onto ${out.splice.onto === "Arcane" ? "Arcane" : "instant or sorcery"}${out.splice.text ? `—${out.splice.text.replace(/^./, (c) => c.toUpperCase())}.` : ` ${out.splice.mana}`}`);
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
  // Its controller gives a gift as it resolves (CR 702.174c).
  return { what, effects: [...effects, { type: "gaveGift" }] };
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
function joinModes(lines0: string[]): string[] {
  const out: string[] = [];
  // Genku, Future Shaper: "choose one that hasn't been chosen this turn. Create a creature token with those
  // characteristics." then "• 2/2 white Fox with vigilance." and so on: each mode creates that token.
  const lines = lines0.map((l, i) => {
    const head = /^(.+, choose one that hasn't been chosen this turn)\. Create a creature token with those characteristics\.$/.exec(l);
    if (head && /^\s*•/.test(lines0[i + 1] ?? "")) return `${head[1]} —`;
    const tokenMode = /^\s*• (\d+\/\d+ (?:white|blue|black|red|green) [A-Z][a-z]+)( with [a-z ]+)?\.$/.exec(l);
    const header = lines0.slice(0, i).reverse().find((x) => !/^\s*•/.test(x));
    if (tokenMode && header && /, choose one that hasn't been chosen this turn\. Create a creature token with those characteristics\.$/.test(header)) return `• Create a ${tokenMode[1]} creature token${tokenMode[2] ?? ""}.`;
    return l;
  });
  // "{4}, {T}: Choose one. Activate only as a sorcery." then the modes (Aetheric Amplifier): the restriction goes after
  // the last mode, where the activated ability's parser reads it.
  let restriction: string | undefined;
  const close = () => {
    if (restriction) out[out.length - 1] = `${out[out.length - 1]} ${restriction}`;
    restriction = undefined;
  };
  // Gnostro, Voice of the Crags: "{T}: Choose one. X is the number of spells you've cast this turn." then the modes: X
  // defined for each mode (CR 107.3c), counted as it resolves (rulings).
  let xIs: string | undefined;
  for (const line0 of lines) {
    const before = out[out.length - 1];
    if (!/^\s*•/.test(line0)) xIs = undefined;
    const xHead = /^\s*•/.test(line0) && before !== undefined && !xIs ? /: Choose one\. X is ([^.]+)\.$/.exec(before) : null;
    if (xHead) {
      xIs = xHead[1]!;
      out[out.length - 1] = `${before!.slice(0, xHead.index)}: Choose one —`;
    }
    const line = xIs ? line0.replace(/\.$/, `, where X is ${xIs}.`) : line0;
    const restricted = /^\s*•/.test(line) && !restriction && before !== undefined ? /: Choose one\.( Activate only [^.]+\.)+$/.exec(before) : null;
    if (restricted) {
      restriction = restricted[0].slice(": Choose one.".length).trim();
      out[out.length - 1] = `${before!.slice(0, restricted.index)}: Choose one —`;
    }
    if (!/^\s*•/.test(line)) close();
    const prev = out[out.length - 1];
    // "..., choose one that hasn't been chosen this turn." followed by bullets (Lita): the same as with a dash.
    // "..., choose one. If you control a commander, you may choose both instead." (SOLDIER Military Program) too.
    // Glorfindel, Dauntless Rescuer: "..., choose one and ~ gets +1/+1 until end of turn." too.
    const dotted = prev !== undefined && /\bchoose one(?: that hasn't been chosen(?: this turn)?| at random(?:\. If [^.]+, you choose one instead)?|\. If [^.]+, (?:you may )?choose both instead| and ~ gets [+-]\d+\/[+-]\d+ until end of turn)?\.$/i.test(prev);
    if (/^\s*•/.test(line) && prev !== undefined && dotted) out[out.length - 1] = `${prev.replace(/\.$/, " —")} ${line.trim()}`;
    else if (/^\s*•/.test(line) && prev !== undefined && (/—\s*(•.*)?$/.test(prev) || /(?:you may choose two|choose one or more|choose one or both)\. Each mode must target a different player\.(\s*•.*)?$/.test(prev))) out[out.length - 1] = `${prev} ${line.trim()}`;
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
  // Cemetery Illuminator: "Once each turn, you may cast a spell from the top of your library if it shares a card type with
  // a card exiled with ~." (topPermission; the cards linked to its "exile a card from a graveyard" ability, below).
  if (/^Once each turn, you may cast a spell from the top of your library if it shares a card type with a card exiled with ~$/.test(text)) return { lands: false, spells: "any", once: true, sharesTypeWithLinked: true };
  // "You may play the top card of your library", "you may play cards from the top of your library": lands and spells.
  text = text.replace(/^(you may) play (?:the top card of your library|cards from the top of your library)$/i, "$1 play lands and cast spells from the top of your library");
  // "Play historic lands" (Crystal Skull): only lands of that kind.
  // The Fourth Doctor: "play a historic land or cast a historic spell" is one land or one spell of those kinds.
  text = text.replace(/^(Once each turn, you may) play an? ([a-z]+) land or cast an? ([a-z]+) spell from the top of your library$/, "$1 play $2 lands and cast $3 spells from the top of your library");
  const m = /^(Once each turn, )?[Yy]ou may (?:play (?:([a-z]+) )?lands(?: and cast (.+))?|cast (.+)) from the top of your library$/.exec(text);
  if (!m) return undefined;
  const lands = m[4] === undefined;
  const what = m[3] ?? m[4];
  // "Once each turn, you may cast ...", and "... play a land or cast a spell ...": one land or spell each turn in all
  // (topUsedTurn); a land-only one isn't modeled.
  if (m[1] && !what) return null;
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
  // Bifur, Melodic Rider: "As long as you have an enduring story, if a triggered ability of a Dwarf you control triggers,
  // ..." (CR 702.195b).
  const story = /^As long as you have an enduring story, if (.+)$/.exec(line);
  if (story) {
    const again = triggersAgainLine(`If ${story[1]!}`);
    return again && !again.anchor ? { ...again, enduringStory: true } : null;
  }
  // Sanctum of All: "If a triggered ability of another Shrine you control triggers while you control six or more Shrines,
  // ...": counted as the ability triggers (CR 603.2d), Sanctum itself among them.
  const whileM = /^If a triggered ability of (another [A-Z][a-z]+ you control) triggers while you control (two|three|four|five|six|seven|eight) or more ([A-Z][a-z]+)s, that ability triggers an additional time\.$/.exec(line);
  if (whileM) {
    const again = triggersAgainLine(`If a triggered ability of ${whileM[1]!} triggers, that ability triggers an additional time.`);
    const f = CREATURE_TYPES.has(whileM[3]!) || !/^[A-Z][a-z]+$/.test(whileM[3]!) ? null : parseTargetPhrase(`${whileM[3]!} you control`);
    const n = ["two", "three", "four", "five", "six", "seven", "eight"].indexOf(whileM[2]!) + 2;
    return again?.of && !again.by && f?.kind === "object" && f.subtypes?.length === 1 ? { ...again, whileControl: { filter: f, n } } : null;
  }
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
  // Krang, the All-Powerful: any player's draw (CR 603.2d); not abilities that trigger on what the draw led to (rulings).
  if (line === "If a player drawing a card causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.") return { by: { event: "draws" } };
  // Panoptic Projektor: any face-down permanent turning face up, anyone's, however it's turned (CR 702.37e, 701.40b, 708.8),
  // makes each ability of a permanent you control that it triggers trigger once more (CR 603.2d): its own "when ~ is turned
  // face up" ones too; two Projektors make three in all (rulings).
  if (line === "If turning a face-down permanent face up causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.") return { by: { event: "turnedFaceUp" } };
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

/** Devouring Rage: "For each Spirit sacrificed this way, that creature gets an additional +3/+0 until end of turn" is "That creature gets +3/+0 until end of turn for each Spirit sacrificed this way". */
function spellBodyText(text: string, costSacrificedX: string | undefined): string {
  if (!costSacrificedX) return text;
  return text.replace(new RegExp(`For each ${costSacrificedX} sacrificed this way, that creature gets an additional ([+-]\\d+/[+-]\\d+) until end of turn\\.`), `That creature gets $1 until end of turn for each ${costSacrificedX} sacrificed this way.`);
}

/**
 * Round 315's additional costs of any size (CR 601.2b: announced as it's cast, an X of 0 or more, CR 107.3a), each one
 * counted as the spell's X:
 * - Explosive Singularity: "you may tap any number of untapped creatures you control. ~ costs {1} less to cast for each
 *   creature tapped this way." Tapped as the cost is paid (CR 601.2h), any of your untapped creatures, summoning sick ones
 *   too (CR 302.6 is only about {T}); the cut (CR 601.2f) only takes generic mana, so never below {R}{R}, though more may
 *   be tapped (rulings).
 * - Hierophant Bio-Titan: "Frenzied Metabolism — ... you may remove any number of +1/+1 counters from among creatures you
 *   control. ~ costs {2} less to cast for each counter removed this way." The ability word has no rules meaning (CR
 *   207.2c); the same cut, never below {G}{G} (rulings).
 * - Burn at the Stake: "tap any number of untapped creatures you control" with no cut, "the number of creatures tapped
 *   this way" its X (the damage doesn't change if they untap or leave, rulings; a copy has the same X, CR 707.10).
 * - Dargo, the Shipwrecker: "you may sacrifice any number of artifacts and/or creatures. ~ costs {2} less to cast for each
 *   permanent sacrificed this way and {2} less to cast for each other artifact or creature you've sacrificed this turn."
 *   The total cost is worked out (601.2f) before the cost is paid (601.2h), so "other" ones are those sacrificed before it
 *   was cast; that part applies with none sacrificed for it too, and {2} for each whether it was an artifact, a creature
 *   or both (rulings). Never below {R}.
 * Returns "tappedX" for Burn at the Stake (its effect counts the X), true when the line is read, "fail" when it's one of
 * these lines that can't be, null otherwise.
 */
function round315Cost(line: string, lines: string[], d: CardDef, out: CompiledCard): "tappedX" | true | "fail" | null {
  const text = line.replace(/^Frenzied Metabolism — /, "");
  const tapLess = /^As an additional cost to cast ~, you may tap any number of untapped creatures you control\. ~ costs \{(\d+)\} less to cast for each creature tapped this way\.$/.exec(text);
  const countersLess = /^As an additional cost to cast ~, you may remove any number of \+1\/\+1 counters from among creatures you control\. ~ costs \{(\d+)\} less to cast for each counter removed this way\.$/.exec(text);
  const tapAny = text === "As an additional cost to cast ~, tap any number of untapped creatures you control.";
  const dargo = /^As an additional cost to cast ~, you may sacrifice any number of artifacts and\/or creatures\. ~ costs \{(\d+)\} less to cast for each permanent sacrificed this way and \{(\d+)\} less to cast for each other artifact or creature you've sacrificed this turn\.$/.exec(text);
  if (!tapLess && !countersLess && !tapAny && !dargo) return null;
  // One such cost on a card with no {X} of its own (its X is the number), and no other cost or cut using that X.
  if (parseManaCost(d.manaCost).hasX || out.sacrificedReduction !== undefined || out.additionalCosts?.some((c) => "x" in c && c.x)) return "fail";
  const creatures: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "untapped creature you control" };
  if (tapLess || tapAny) {
    // Burn at the Stake: only with its effect counting them.
    if (tapAny && !lines.some((l) => / equal to (?:twice |three times )?the number of creatures tapped this way\.$/.test(l))) return "fail";
    (out.additionalCosts ??= []).push({ kind: "tap", filter: creatures, n: 0, x: true });
    if (tapLess) out.sacrificedReduction = Number(tapLess[1]);
    return tapAny ? "tappedX" : true;
  }
  if (countersLess) {
    (out.additionalCosts ??= []).push({ kind: "removeCounters", n: 0, filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" }, counter: "+1/+1", x: true });
    out.sacrificedReduction = Number(countersLess[1]);
    return true;
  }
  if (dargo) {
    const spec = parseTargetPhrase("artifact or creature");
    if (spec?.kind !== "object" || out.additionalCosts?.some((c) => c.kind === "sacrifice")) return "fail";
    (out.additionalCosts ??= []).push({ kind: "sacrifice", filter: { ...spec, text: "artifact or creature" }, n: 0, x: true, optional: true });
    out.sacrificedReduction = Number(dargo[1]);
    out.costLess = [...(out.costLess ?? []), { count: { kind: "sacrificedThisTurn", anyType: ["Artifact", "Creature"] }, times: Number(dargo[2]) }];
    return true;
  }
  return null;
}

/**
 * The Aesir Escape Valhalla (round 345): a Saga whose only exile is one chapter's linked exile from your graveyard
 * (round345Chapter), with every chapter that returns or counts "the exiled card" after it.
 */
function aesirLinked(out: CompiledCard): boolean {
  const exiling = (e: Effect) => ["exile", "exileTop", "exileFaceDown", "takeFromHand", "hideaway", "impulse", "exileHand", "exileGraveyard", "search", "castFromAmong"].includes(e.type) || (e.type === "chooseFromGraveyard" && e.dest === "exile") || (e.type === "discard" && !!e.exile);
  const all = [...out.triggers.map((tr) => tr.body), ...out.activated.map((a) => a.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
  const exiles = all.filter(exiling);
  const linked = out.triggers.filter((tr) => tr.event === "chapter" && allEffects(tr.body.effects).some((e) => e.type === "chooseFromGraveyard" && e.dest === "exile" && e.linked));
  if (exiles.length !== 1 || linked.length !== 1 || out.spell || out.activated.length) return false;
  const first = linked[0]!.chapter!;
  const refers = out.triggers.filter((tr) => JSON.stringify(tr.body).includes('"linkedCard"') || allEffects(tr.body.effects).some((e) => e.type === "returnLinked"));
  return refers.length > 0 && refers.every((tr) => tr.event === "chapter" && tr.chapter! > first);
}

// Characteristics of permanents after continuous effects: the layer system (CR 613).
//
// An object's characteristics start from its card (or token definition) and every
// applicable continuous effect is applied in layer order:
//   2 control, 4 type, 5 color, 6 abilities, 7a defined P/T, 7b set P/T, 7c modify P/T (and counters),
//   7d switch P/T, then rules effects such as "can't block" (CR 613.11).
// Layers 1 (copy) and 3 (text) have no effects in the engine yet, so cards needing them stay
// unsupported. Characteristic-defining power and toughness (7a) work on the battlefield only.
//
// Effects come from two places:
//  - resolved spells and abilities, stored in GameState.effects with the set of objects
//    they affect locked in when they began (CR 611.2c);
//  - static abilities of permanents on the battlefield, regenerated on every computation
//    and applying to whatever matches right now (CR 611.3a).
// Within a layer, effects apply in timestamp order (CR 613.7) unless one depends on
// another (CR 613.8). Once an effect starts applying, it keeps applying to the same
// objects in later layers even if its source loses the ability meanwhile (CR 613.6).

import { creatureCardAbove, creatureCardsAbove } from "./graveyard";
import type { AbilityBody, Affects, Amount, DamageMod, Modification, MostStat, StaticAbility, StaticCondition, TargetSpec, TimingWindow, TurnPoint, Untargetable } from "./abilities";
import { evalAmount, partySize } from "./amounts";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { basePower, baseToughness, defOf, pairedWith } from "./cards";
import { meldPartnerName } from "./meld-results";
import { defMv, sameName } from "./faces";
import { liveEmblems } from "./emblems";
import { bindChosenKeywords, CHOSEN_LAND_TYPE, COLOR_WORD, CREATURE_TYPES, IDENTITY_PROTECTION, isLandwalk, LINKED_TYPES_PROTECTION, LINKED_CARD_KEYWORD, YOURS_COLORS_PROTECTION, protectionFromCardTypes, isEveryCreatureTypeText, stripReminder, subtypeSet } from "./keywords";
import { bindGrantSource, compileCard, compileGranted, QUOTED_SOURCE_NAME } from "./oracle";
import type { CardDef, Color, GameObject, GameState, ObjectId, PlayerId } from "./types";

export type Layer = "2" | "3" | "4" | "5" | "6" | "7a" | "7b" | "7c" | "7d" | "rules";
const LAYERS: Layer[] = ["2", "3", "4", "5", "6", "7a", "7b", "7c", "7d", "rules"];

export function layerOf(m: Modification): Layer {
  switch (m.kind) {
    case "control":
      return "2";
    case "setName":
      return "3";
    case "addTypes":
    case "setTypes":
    case "setSubtypes":
    case "setLandTypes":
    case "loseTypes":
    case "loseCreatureTypes":
      return "4";
    case "linkedCreature":
      return m.part === "types" ? "4" : "7b";
    case "setColors":
    case "addColors":
      return "5";
    case "cantBlock":
      return m.ability ? "6" : "rules";
    case "addKeywords":
    case "removeKeywords":
    case "cantHaveKeywords":
    case "loseAllAbilities":
    case "addAbility":
    case "unblockedDamage":
    case "loseActivated":
    case "loseStatic":
    case "enchantCreature":
      return "6";
    case "definePT":
      return "7a";
    case "setPT":
    case "setToughness":
    case "setPower":
      return "7b";
    case "modifyPT":
      return "7c";
    case "switchPT":
      return "7d";
    default:
      return "rules";
  }
}

/** One step in how a permanent's power/toughness was reached, for display and debugging. */
export interface PTPart {
  source: string;
  kind: "set" | "modify" | "switch" | "counters";
  power: number;
  toughness: number;
  untilEndOfTurn: boolean;
}

/** Characteristics.sparedBy: protection from "This effect doesn't remove Auras" (Spectra Ward), sparing every Aura. */
export const SPARES_AURAS = "*auras" as const;
/** Characteristics.sparedBy: protection that spares what was attached as it began (Benevolent Blessing), "*attached:<source id>". */
export const SPARES_ATTACHED = "*attached:" as const;

/**
 * Whether the protection keyword `key` the host has (from `hc`) leaves the Aura or Equipment `o` attached to it: an effect
 * that "doesn't remove" it gives that protection, and nothing else does (CR 702.16c-d, 702.16n, 702.16p).
 */
export function sparedFrom(s: GameState, hc: Characteristics, key: string, o: GameObject, isAura: boolean): boolean {
  const v = hc.sparedBy?.[key.toLowerCase()];
  if (v === undefined) return false;
  if (v === SPARES_AURAS) return isAura;
  if (v.startsWith(SPARES_ATTACHED)) {
    const src = s.objects[v.slice(SPARES_ATTACHED.length)];
    const rec = src?.sparesAttached;
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    return !!src && !!rec && !!host && rec.zc === (src.zoneChanges ?? 0) && rec.host === host.id && rec.hostZc === (host.zoneChanges ?? 0) && src.attachedTo === host.id && rec.ids.includes(o.id);
  }
  return v === o.id;
}

export interface Characteristics {
  name: string;
  supertypes: string[];
  types: string[];
  subtypes: string[];
  /** Changeling: it has every creature type (CR 702.73a, a characteristic-defining ability). */
  allCreatureTypes: boolean;
  colors: Color[];
  keywords: string[];
  /** Its mana value (CR 202.3): its mana cost's, or a copy's (CR 707.2); 0 face down (CR 708.2). Not a spell's X (see spellManaValue). */
  manaValue: number;
  /**
   * Keywords (lowercase) it has only from one effect that "doesn't remove" that effect's source (Cho-Manno's Blessing):
   * that protection doesn't make the source fall off (CR 702.16c), protection from anywhere else does.
   */
  sparedBy?: Record<string, ObjectId | typeof SPARES_AURAS>;
  /** False once an effect made it lose all abilities: none of its printed abilities work. */
  hasPrintedAbilities: boolean;
  /** "Lose ... ward" (Shay Cormac): its ward abilities, printed or gained before, don't trigger; one gained later does (CR 613.7). */
  wardLost?: true;
  /** "Loses flanking" (Barbed Foliage): its printed flanking triggers don't work, and flanking granted before is gone; flanking granted later works (CR 702.25a, 613.7). */
  flankingLost?: true;
  /** It lost all abilities, the mana abilities of its basic land types too (CR 305.6). */
  landAbilitiesLost?: true;
  /** Abilities effects gave it, as text ("~" is this object), in layer 6 order. */
  grantedAbilities: string[];
  /** The timestamp of the effect that gave each of `grantedAbilities` (CR 613.7a). */
  grantedAt?: number[];
  controller: PlayerId;
  power: number;
  toughness: number;
  printedPower: number;
  printedToughness: number;
  pt: PTPart[];
  cantAttack: boolean;
  cantBlock: boolean;
  cantBeBlocked: boolean;
  /** "Can't be attacked" (The Aetherspark). */
  cantBeAttacked?: true;
  /** "You may have ~ assign its combat damage as though it weren't blocked." */
  unblockedDamage: boolean;
  doesntUntap: boolean;
  /** "Can't become untapped" (Frozen in Ice): not by any effect either (game.ts untapPermanent). */
  cantBecomeUntapped?: true;
  cantBeSuspected: boolean;
  /** "Can block only creatures with flying" (CR 509.1b). */
  blocksOnlyFlyers: boolean;
  /** "Attacks each combat if able" (CR 508.1d). */
  attacksIfAble: boolean;
  /** Untaps during each other player's untap step too. */
  untapsDuringOthers: boolean;
  /** Generic mana per creature attacking its controller (Ghostly Prison). */
  attackTax: number;
  /** The same for attacking a planeswalker its controller controls (Sphere of Safety). */
  attackTaxPlaneswalkers: number;
  /** Other mana symbols per creature attacking its controller, and its controller's planeswalkers ("{W/P}", Norn's Annex). */
  attackTaxMana: string[];
  attackTaxManaPlaneswalkers: string[];
  /** Nils, Discipline Enforcer: how many times each attacker with counters on it pays {X}, X its counters; and for planeswalkers. */
  attackTaxCounters: number;
  attackTaxCountersPlaneswalkers: number;
  /** Elephant Grass: generic mana per attacking creature that isn't this color ("Nonblack creatures can't attack you unless ..."). */
  attackTaxUnlessColor: { n: number; color: Color }[];
  /** Generic mana per creature blocking, whoever controls it (Archangel of Tithes, CR 509.1d). */
  blockTax: number;
  /** Heat Wave: life for each creature not of the color blocking a creature this permanent's controller controls. */
  blockLifeTax: { n: number; notColor: Color }[];
  /** Generic mana to attack with this creature, whoever it attacks (Brainwash, Phyrexian Marauder). */
  ownAttackTax: number;
  /** Generic mana to block with this creature (Qal Sisma Behemoth, Oppressive Rays). */
  ownBlockTax: number;
  /** Generic mana to block a creature with at least this power with this creature (Hipparion, CR 509.1d). */
  ownBlockTaxVs: { n: number; minPower: number }[];
  /** Costs to attack with this creature that aren't mana (Exalted Dragon's "sacrifice a land", CR 508.1g). */
  ownAttackCosts: { action: "sacrifice" | "bounce"; filter: TargetSpec; n: number }[];
  /** Players it has to attack if able (encore). */
  mustAttack: PlayerId[];
  /** Galactus, Devourer of Worlds: "attacks an opponent with the most life among your opponents each combat if able" (those players worked out as attackers are declared, game.ts mustAttackPlayers). */
  mustAttackMostLife?: true;
  /** "Can't be blocked by creatures with power 2 or less", "by Walls" (CR 509.1b). */
  cantBeBlockedBy: TargetSpec[];
  /** Tanglewalker: "can't be blocked as long as defending player controls an artifact land" (CR 506.2, 509.1b). */
  cantBeBlockedIfDefending?: TargetSpec[];
  /**
   * "Can't be the target of spells or abilities your opponents control" and the like. `of`: whose opponents, the
   * controller of the ability saying it (an Aura's controller, not the enchanted creature's: rulings on Canopy Cover).
   */
  untargetable?: (Untargetable & { of: PlayerId })[];
  /** "Prevent all damage that would be dealt to / by ~" (CR 615.1). */
  preventDamage?: { to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[]; /** Bronze Horse: only from a spell targeting it. */ targetingSpells?: true; /** Prismatic Ward: only from sources of these colors (the chosen one). */ fromColors?: string[]; plusOnes?: true; thatMany?: true; oneEach?: true; reflect?: AbilityBody; /** With plusOnes or reflect: the ability's controller and source. */ you?: PlayerId; from?: ObjectId }[];
  /** Damage amount replacements this permanent's static abilities make (see DamageMod): `you` is the ability's controller, `from` its source. */
  damageMods?: (DamageMod & { you: PlayerId; from: ObjectId })[];
  /** The damage it would deal can't be prevented (CR 615.12): all of it, or only its combat damage. */
  unpreventable?: "all" | "combat";
  /** "Can't be blocked except by ...": each entry is a group a blocker has to belong to (CR 509.1b). */
  blockableOnlyBy?: { filters: TargetSpec[]; text: string }[];
  /** Attackers it can't block. */
  cantBlockCreatures: TargetSpec[];
  /** "Can't be blocked by more than one creature" (CR 509.1b). */
  maxOneBlocker: boolean;
  /** "Its activated abilities can't be activated": "all" (mana abilities too, CR 605.1a), "nonMana", or false. */
  cantActivate: false | "all" | "nonMana";
  /** "Its activated abilities with {T} in their costs can't be activated" (Serra Bestiary), mana abilities too (rulings). */
  cantActivateTap: boolean;
  /** "Can't be blocked except by three or more creatures": the most such an ability asks for, 0 if none (CR 509.1b). */
  minBlockers: number;
  /** Tromokratis: blocked only by all the creatures its defending player controls (CR 509.1b). */
  blockedOnlyByAll?: true;
  /**
   * The players who goaded it (CR 701.15), or whose effect asks the same of it without goading it (Kardur): it attacks
   * each combat if able, and a player other than them if able.
   */
  goadedBy: PlayerId[];
  /** Keywords it can't have (Arcane Lighthouse), removed after all of layer 6. */
  cantHave?: string[];
  /** "~ loses this ability" (a Licid): the indexes of its printed activated abilities it doesn't have (abilitiesOf). */
  lostActivated?: number[];
  /** Glittering Lion: "~ loses "Prevent all damage ..."": the texts of its printed static abilities it doesn't have. */
  lostStatics?: string[];
  /** "Becomes an Aura enchantment with enchant creature" (a Licid): enchant creature from an effect (enchantOf). */
  enchantCreature?: true;
  /** Goaded (CR 701.15): not by an effect that only asks the same (Kardur, Maximum Carnage rulings). */
  goaded?: true;
  /** "Can't attack unless defending player controls ...": what the defending player has to control. */
  attackUnless: TargetSpec[];
  /** Vantress Gargoyle: only at a player with at least this many cards in their graveyard. */
  attackUnlessYard?: number;
  /** Crown-Hunter Hireling, Chained Throatseeker: only at a player who is the monarch / is poisoned. */
  attackUnlessDefenderIs?: ("monarch" | "poisoned")[];
  /** "Can't attack if defending player controls ..." (Mogg Jailer): what the defending player mustn't control. */
  attackIfNot?: TargetSpec[];
  /** "Can't attack unless you control more lands than defending player" (Monstrous Hound). */
  attackUnlessMore?: ("lands" | "creatures")[];
  /** "Can't attack unless a black or green creature also attacks" (Scarred Puma): another attacker fitting each. */
  attackOnlyWith?: TargetSpec[];
  /** Orcish Conscripts: "can't attack unless at least two other creatures attack": that many other attackers. */
  attackWithOthers?: number;
  /** "... can't block unless at least two other creatures block": that many other blockers this combat. */
  blockWithOthers?: number;
  /** Okk: "can't attack unless a creature with greater power also attacks": another attacker with greater power. */
  attackWithGreater?: boolean;
  /** Okk: "can't block unless a creature with greater power also blocks": another blocker this combat with greater power. */
  blockWithGreater?: boolean;
  cantBeBlockedByLesserPower: boolean;
  /** Can't be blocked by creatures with power less than these permanents' (Champion of Lambholt, CR 509.1b). */
  cantBeBlockedByLesserPowerThan: ObjectId[];
  /** "Creatures with power less than the number of Islands you control can't block ~": that number, the largest of them (CR 509.1b). */
  cantBeBlockedByPowerBelow?: number;
  /** The Ring-bearer's (CR 701.54c). */
  cantBeBlockedByGreaterPower: boolean;
  /** Spitfire Handler: it can't block an attacker with greater power than its own (CR 509.1b). */
  cantBlockGreaterPower: boolean;
  /** Ironclaw Curse: it can't block an attacker whose power is at least its own toughness (CR 509.1b). */
  cantBlockPowerAtLeastToughness: boolean;
  cantAttackAlone: boolean;
  onlyAttacksAlone: boolean;
  cantBlockAlone: boolean;
  cantAttackSamePlayer: boolean;
  /** "Can't attack its owner" (Alexios). */
  cantAttackOwner: boolean;
  /** Xantcha: nor the planeswalkers its owner controls. */
  cantAttackOwnerWalkers?: boolean;
  /** "Can't be sacrificed" (CR 701.21). */
  cantBeSacrificed: boolean;
  /** Call for Aid: these players can't sacrifice it (only its controller could, CR 701.21a). */
  cantBeSacrificedBy: PlayerId[];
  /** "Can't be turned face up" (Unable to Scream). */
  cantTurnFaceUp: boolean;
  /** "Can't transform" (Bound by Moonsilver), nor convert (CR 701.28f). */
  cantTransform: boolean;
  /** "Can't phase out" (Ertai's Familiar, Spatial Binding). */
  cantPhaseOut: boolean;
  /** "Can't crew Vehicles" (Revoke Privileges). */
  cantCrew: boolean;
  /** "Can't be equipped" (Goblin Brawler). */
  cantBeEquipped: boolean;
  /**
   * "Can't be enchanted by other Auras" (Anti-Magic Aura, Consecrate Land): the Auras whose effects say so. Any other
   * Aura can't be attached to it (CR 303.4, 303.4f, 303.4j), and one that is goes to the graveyard (704.5m).
   */
  enchantedOnlyBy: ObjectId[];
  /** "Can't attack you or planeswalkers you control" (Promise of Loyalty): those players and their planeswalkers. */
  cantAttackPlayers: PlayerId[];
  /** "Creatures can't attack you" (Blazing Archon): these players, but not their planeswalkers. */
  cantAttackPlayersOnly: PlayerId[];
  mustBeBlocked: boolean;
  allMustBlock: boolean;
  /** "All Walls able to block ~ do so" (Marble Priest): the blockers that must block it, if able (CR 509.1c). */
  allMustBlockBy?: TargetSpec[];
  /** "Must be blocked by an Eldrazi if able" (Slayer's Cleaver): each filter one of its blockers must fit, if able (CR 509.1c). */
  mustBeBlockedBy?: TargetSpec[];
  mustBlock: boolean;
  /** Blaze of Glory: blocks each attacking creature it can, if able (CR 509.1c). */
  mustBlockEach: boolean;
  /** Doran: assigns combat damage by its toughness, always or only while its toughness is greater than its power. */
  assignsToughness: boolean;
  assignsToughnessIfGreater: boolean;
  /** Loot, the Anomaly: a negative power assigns that much combat damage as a positive number. */
  assignsAbsPower: boolean;
  attackDespiteDefender: boolean;
  /** "Can attack as though it had haste" (Instill Energy, CR 302.6). */
  attackAsThoughHaste: boolean;
  /** "Can attack players who attacked you during their last turn as though it didn't have defender" (Weathered Sentinels). */
  attackDespiteDefenderVs: boolean;
  /** "Can block creatures with landwalk abilities as though they didn't have those abilities" (Street Savvy). */
  blocksLandwalkers: boolean;
  /** "Can block creatures with shadow as though it had shadow" (Heartwood Dryad). */
  blocksShadow: boolean;
  /** "Can block creatures with shadow as though they didn't have shadow" (Aetherflame Wall, Aether Web): the attacker's shadow is ignored as it blocks. */
  blocksShadowAsNone?: boolean;
  /** Creature types it can block as though it had reach (Dragon Hunter). */
  reachVs?: string[];
  /** "Can block an additional creature each combat", added up; "can block any number of creatures". */
  extraBlocks: number;
  blockAny: boolean;
}

/** Keywords that rules text grants or names as well as prints (Zur: "Enchantment creatures you control have deathtouch"). */
const MENTIONABLE = new Set(["flying", "first strike", "double strike", "deathtouch", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "trample", "vigilance", "defender", "shroud", "intimidate", "fear", "skulk", "shadow", "horsemanship", "infect", "wither", "flash"]);
const ownKeywords = new WeakMap<CardDef, string[]>();
const startsWithWord = (seg: string, k: string) => seg.toLowerCase() === k.toLowerCase() || seg.toLowerCase().startsWith(`${k.toLowerCase()} `);

/**
 * Whether the card has `k` itself: the card data also lists a keyword its text only mentions (Odric, Blood-Cursed's
 * "abilities from among flying, first strike, ..."; Angelic Skirmisher's "choose first strike, vigilance, or lifelink").
 * The card lists a keyword ability by name (CR 702.1): `k` in a list of the card's keywords that starts
 * the line.
 */
function onKeywordLine(d: CardDef, k: string): boolean {
  // A keyword the text doesn't name at all comes from elsewhere (a token's definition).
  if (!new RegExp(`\\b${k}\\b`, "i").test(d.oracleText)) return true;
  return d.oracleText.split("\n").some((line) => {
    const segs = stripReminder(line).split(/[,;] /);
    const at = segs.findIndex((g) => startsWithWord(g, k));
    return at >= 0 && segs.slice(0, at).every((g) => d.keywords.some((x) => startsWithWord(g, x)));
  });
}

/**
 * The card's keywords. The card data names some only generically ("Protection", "Toxic");
 * the text says which ("Protection from black", "Toxic 2"), so those come from the text.
 */
export function printedKeywords(d: CardDef): string[] {
  const c = compileCard(d);
  const fromText = c.textKeywords;
  // A keyword in a level or station striation is there only while the striation applies (CR 711.2, 721.2).
  const striated = new Set((c.striatedKeywords ?? []).map((k) => k.toLowerCase()));
  // Scryfall lists "Protection from X" as "Protection".
  const inStriation = (k: string) => [...striated].some((x) => x === k.toLowerCase() || x.startsWith(`${k.toLowerCase()} `));
  let own = ownKeywords.get(d);
  if (!own) ownKeywords.set(d, (own = (striated.size ? d.keywords.filter((k) => !inStriation(k)) : d.keywords).filter((k) => !MENTIONABLE.has(k.toLowerCase()) || onKeywordLine(d, k))));
  if (!fromText.length) return [...own];
  // And "Hexproof from blue" as "Hexproof from" and "Hexproof" (CR 702.11d: it isn't hexproof itself).
  const hexFrom = fromText.some((k) => /^hexproof from /i.test(k));
  return [...own.filter((k) => k !== "Protection" && k !== "Toxic" && !(hexFrom && (k === "Hexproof" || k === "Hexproof from"))), ...fromText];
}

/** The nonbasic land types (CR 205.3i). */
const NONBASIC_LAND_TYPES = ["Cave", "Desert", "Gate", "Lair", "Locus", "Mine", "Planet", "Power-Plant", "Sphere", "Tower", "Town", "Urza's"];

/** Characteristics straight from the card, with no effects applied. */
function printed(s: GameState, o: GameObject): Characteristics {
  const d = defOf(s, o);
  return {
    name: d.name,
    supertypes: [...d.supertypes],
    types: [...d.types],
    // "~ is every nonbasic land type" (CR 604.3) applies first in layer 4 (613.3); the land types are those of CR 205.3i.
    subtypes: compileCard(d).allNonbasicLandTypes ? [...new Set([...d.subtypes, ...NONBASIC_LAND_TYPES])] : [...d.subtypes],
    allCreatureTypes: everyCreatureType(d),
    // "~ is all colors" (CR 604.3) applies first in layer 5 (613.3). A copy whose colors an exception set doesn't have it (707.9d).
    colors: compileCard(d).allColors ? ["W", "U", "B", "R", "G"] : [...d.colors],
    keywords: printedKeywords(d),
    manaValue: o.faceDown ? 0 : defMv(d),
    hasPrintedAbilities: true,
    grantedAbilities: [],
    controller: o.controller,
    power: basePower(d),
    toughness: baseToughness(d),
    printedPower: basePower(d),
    printedToughness: baseToughness(d),
    pt: [],
    cantAttack: false,
    cantBlock: false,
    cantBeBlocked: false,
    unblockedDamage: false,
    doesntUntap: false,
    cantBeSuspected: false,
    blocksOnlyFlyers: false,
    attacksIfAble: false,
    untapsDuringOthers: false,
    attackTax: 0,
    attackTaxPlaneswalkers: 0,
    attackTaxMana: [],
    attackTaxManaPlaneswalkers: [],
    attackTaxCounters: 0,
    attackTaxCountersPlaneswalkers: 0,
    attackTaxUnlessColor: [],
    blockTax: 0,
    blockLifeTax: [],
    ownAttackTax: 0,
    ownBlockTax: 0,
    ownBlockTaxVs: [],
    ownAttackCosts: [],
    mustAttack: [],
    cantBeBlockedBy: [],
    cantBlockCreatures: [],
    maxOneBlocker: false,
    minBlockers: 0,
    goadedBy: [],
    cantActivate: false,
    cantActivateTap: false,
    attackUnless: [],
    cantBeBlockedByLesserPower: false,
    cantBeBlockedByLesserPowerThan: [],
    cantBeBlockedByGreaterPower: false,
    cantBlockGreaterPower: false,
    cantBlockPowerAtLeastToughness: false,
    cantAttackAlone: false,
    onlyAttacksAlone: false,
    cantBlockAlone: false,
    cantAttackSamePlayer: false,
    cantAttackOwner: false,
    cantBeSacrificed: false,
    cantBeSacrificedBy: [],
    cantTurnFaceUp: false,
    cantTransform: false,
    cantPhaseOut: false,
    cantCrew: false,
    cantBeEquipped: false,
    enchantedOnlyBy: [],
    cantAttackPlayers: [],
    cantAttackPlayersOnly: [],
    mustBeBlocked: false,
    allMustBlock: false,
    mustBlock: false,
    mustBlockEach: false,
    assignsToughness: false,
    assignsToughnessIfGreater: false,
    assignsAbsPower: false,
    attackDespiteDefender: false,
    attackAsThoughHaste: false,
    attackDespiteDefenderVs: false,
    blocksLandwalkers: false,
    blocksShadow: false,
    extraBlocks: 0,
    blockAny: false,
  };
}

const copyChars = (c: Characteristics): Characteristics => ({
  ...c,
  supertypes: [...c.supertypes],
  types: [...c.types],
  subtypes: [...c.subtypes],
  colors: [...c.colors],
  keywords: [...c.keywords],
  ...(c.sparedBy ? { sparedBy: { ...c.sparedBy } } : {}),
  grantedAbilities: [...c.grantedAbilities],
  ...(c.grantedAt ? { grantedAt: [...c.grantedAt] } : {}),
  pt: [...c.pt],
  cantBeBlockedBy: [...c.cantBeBlockedBy],
  ...(c.untargetable ? { untargetable: [...c.untargetable] } : {}),
  cantBlockCreatures: [...c.cantBlockCreatures],
  attackUnless: [...c.attackUnless],
  ...(c.attackIfNot ? { attackIfNot: [...c.attackIfNot] } : {}),
  ...(c.attackUnlessMore ? { attackUnlessMore: [...c.attackUnlessMore] } : {}),
  ...(c.attackOnlyWith ? { attackOnlyWith: [...c.attackOnlyWith] } : {}),
  ...(c.allMustBlockBy ? { allMustBlockBy: [...c.allMustBlockBy] } : {}),
  ...(c.mustBeBlockedBy ? { mustBeBlockedBy: [...c.mustBeBlockedBy] } : {}),
  ...(c.reachVs ? { reachVs: [...c.reachVs] } : {}),
  goadedBy: [...c.goadedBy],
  mustAttack: [...c.mustAttack],
});

type CharMap = Map<ObjectId, Characteristics>;

/**
 * The keywords a keyword counter can be (CR 122.1b): the keyword a counter of this kind gives, if it's one.
 */
const KEYWORD_COUNTERS = ["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"];
/**
 * What its power/toughness counters add up to: each +X/+Y counter gives +X/+Y (CR 122.1a), "+1/+1", "-1/-1", "+1/+0",
 * "-0/-1" (Wall of Roots) alike.
 */
export function ptFromCounters(o: GameObject): [number, number] {
  let p = 0;
  let t = 0;
  for (const [kind, n] of Object.entries(o.counters)) {
    const m = /^([+-]\d+)\/([+-]\d+)$/.exec(kind);
    if (!m || !n) continue;
    p += Number(m[1]) * n;
    t += Number(m[2]) * n;
  }
  return [p, t];
}

export function keywordOfCounter(kind: string): string | undefined {
  return KEYWORD_COUNTERS.includes(kind) ? kind[0]!.toUpperCase() + kind.slice(1) : undefined;
}

/** A continuous effect being applied: a stored one, or one generated by a static ability. */
interface Inst {
  key: string;
  timestamp: number;
  order: number;
  sourceId?: ObjectId;
  sourceName: string;
  untilEndOfTurn: boolean;
  mods: Modification[];
  /** Stored effects: fixed controller and affected set. */
  controller?: PlayerId;
  fixed?: ObjectId[];
  /** Static abilities: what it applies to, evaluated continuously. */
  affects?: Affects;
  /** Static abilities that apply only while something is true (threshold). */
  condition?: StaticAbility["condition"];
  /** Set when it first applies (CR 613.6). */
  locked?: ObjectId[];
  /** A static ability an effect gave its source, not one of its card's (grantedStatics): the quoted text it came from. */
  granted?: true;
  grantedText?: string;
  /** A permanent's printed static ability: its text, which a "loseStatic" effect can take away (Glittering Lion). */
  staticText?: string;
  /** An emblem's static ability (CR 114.4): its source is in the command zone, with `controller` its owner. */
  emblem?: true;
  /** A static ability that works from its card's graveyard (StaticAbility.zone), with `controller` its owner. */
  fromGraveyard?: true;
  /** Its type change applies outside the battlefield too (StaticAbility.offField). */
  offField?: true;
  /** Its color change applies to every card and spell outside the battlefield too (StaticAbility.offFieldAll). */
  offFieldAll?: true;
  /** Its type change applies to its controller's permanent spells too (StaticAbility.offFieldSpells). */
  offFieldSpells?: true;
  /** Its type change applies to its controller's land cards outside the battlefield too (StaticAbility.offFieldLands). */
  offFieldLands?: true;
  /** A stored effect for a group (ContinuousEffect.group): it needs no source. */
  live?: true;
}

function gather(s: GameState): Inst[] {
  const out: Inst[] = [];
  let order = 0;
  for (const e of s.effects) {
    const base = { timestamp: e.timestamp, sourceId: e.sourceId, sourceName: e.sourceName, untilEndOfTurn: e.duration === "endOfTurn" || e.duration === "endOfCombat", controller: e.controller };
    // "For as long as it has a vow counter on it": only those that still do.
    const fixed = e.group ? [] : e.whileCounter ? e.affected.filter((id) => (s.objects[id]?.counters[e.whileCounter!] ?? 0) > 0) : e.affected;
    const held = e.notGranted ? fixed.filter((id) => e.notGranted![id]) : [];
    out.push({
      ...base,
      key: e.id,
      order: order++,
      mods: e.mods,
      // A group's rules effect: whatever is in the group now (Effect groupRules).
      ...(e.group ? { affects: e.group, live: true as const } : { fixed: held.length ? fixed.filter((id) => !held.includes(id)) : fixed }),
    });
    // The same effect without the keywords those objects couldn't gain as it was created (Archetypes).
    for (const id of held) {
      const no = e.notGranted![id]!;
      const mods = e.mods.map((m) => (m.kind === "addKeywords" ? { ...m, keywords: m.keywords.filter((k) => !no.some((x) => sameCI(x, k))) } : m));
      out.push({ ...base, key: `${e.id}:${id}`, order: order++, mods, fixed: [id] });
    }
  }
  // Each player's Ring: "Your Ring-bearer is legendary and can't be blocked by creatures with greater power"
  // (CR 701.54c), with the emblem's timestamp (CR 613.7a). Another player gaining control of it ends the designation.
  for (const pid of s.turnOrder) {
    const r = s.players[pid]!.ring;
    const o = r?.bearer && s.objects[r.bearer.id];
    if (!r || !o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== r.bearer!.zc) continue;
    out.push({
      key: `ring:${pid}`,
      timestamp: r.timestamp,
      order: order++,
      sourceName: "The Ring",
      untilEndOfTurn: false,
      mods: [{ kind: "addTypes", types: [], subtypes: [], supertypes: ["Legendary"] }, { kind: "cantBeBlockedByGreaterPower" }],
      controller: pid,
      fixed: [o.id],
    });
  }
  // Emblems' static abilities, with the emblems' timestamps (CR 114.4, 613.7a).
  for (const o of liveEmblems(s))
    compileCard(defOf(s, o)).statics.forEach((st, i) => {
      // A damage replacement's (Ajani Steadfast's emblem) is read in damage.ts.
      if (st.affects.kind === "filter") out.push({ key: `${o.id}#${i}`, timestamp: o.timestamp, order: order++, sourceId: o.id, sourceName: defOf(s, o).name, untilEndOfTurn: false, mods: st.mods, affects: st.affects, controller: o.controller, emblem: true });
    });
  // Static abilities that work from a graveyard (CR 113.6b), each with its card's timestamp there (CR 613.7d).
  for (const pid of s.turnOrder)
    for (const id of s.players[pid]!.graveyard) {
      const o = s.objects[id]!;
      const d = defOf(s, o);
      compileCard(d).statics.forEach((st, i) => {
        if (st.zone === "graveyard") out.push({ key: `${id}#${i}`, timestamp: o.timestamp, order: order++, sourceId: id, sourceName: d.name, untilEndOfTurn: false, mods: st.mods, affects: st.affects, condition: st.condition, controller: o.owner, fromGraveyard: true });
      });
    }
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const d = defOf(s, o);
    // A keyword counter gives it that keyword (CR 122.1b) in layer 6 (613.1f), as of when it was put on (613.7c). Each
    // exalted counter is an instance of exalted, which triggers separately (Emissary of Soulfire rulings).
    for (const [kind, n] of Object.entries(o.counters)) {
      const kw = (n ?? 0) > 0 && keywordOfCounter(kind);
      if (kw) out.push({ key: `counter:${id}:${kind}`, timestamp: o.counterTimestamps?.[kind] ?? o.timestamp, order: order++, sourceName: `${kind} counter`, untilEndOfTurn: false, mods: kw === "Exalted" ? Array.from({ length: n! }, () => ({ kind: "addAbility" as const, text: kw })) : [{ kind: "addKeywords", keywords: [kw] }], controller: o.controller, fixed: [id] });
    }
    // A suspected permanent has menace and "This creature can't block" (CR 701.60c), from when it became suspected.
    if (o.suspected !== undefined)
      out.push({ key: `suspected:${id}`, timestamp: o.suspected, order: order++, sourceName: "Suspected", untilEndOfTurn: false, mods: [{ kind: "addKeywords", keywords: ["Menace"] }, { kind: "cantBlock", ability: true }], controller: o.controller, fixed: [id] });
    // An Equipment with reconfigure attached to a creature stops being a creature and loses its creature types until
    // it's unattached (CR 702.151b, rulings), even if it loses its abilities meanwhile. Its timestamp is the attaching's.
    if (o.attachedTo && compileCard(d).reconfigure)
      out.push({ key: `reconfigure:${id}`, timestamp: o.timestamp, order: order++, sourceName: d.name, untilEndOfTurn: false, mods: [{ kind: "loseTypes", types: ["Creature"] }], controller: o.controller, fixed: [id] });
    // Impending (CR 702.176a): "As long as this permanent's impending cost was paid and it has a time counter on it, it's
    // not a creature", a static ability of its own, with its timestamp (CR 613.7a), that losing its abilities doesn't end.
    if (o.castAlt === "impending" && (o.counters.time ?? 0) > 0)
      out.push({ key: `impending:${id}`, timestamp: o.timestamp, order: order++, sourceName: d.name, untilEndOfTurn: false, mods: [{ kind: "loseTypes", types: ["Creature"] }], controller: o.controller, fixed: [id] });
    compileCard(d).statics.forEach((st, i) =>
      st.zone !== "graveyard" && out.push({
        key: `${id}#${i}`,
        timestamp: o.timestamp, // CR 613.7a
        order: order++,
        sourceId: id,
        sourceName: d.name,
        untilEndOfTurn: false,
        mods: st.mods,
        affects: st.affects,
        condition: st.condition,
        staticText: st.text,
        ...(st.offField ? { offField: true as const } : {}),
        ...(st.offFieldAll ? { offFieldAll: true as const } : {}),
        ...(st.offFieldSpells ? { offFieldSpells: true as const } : {}),
        ...(st.offFieldLands ? { offFieldLands: true as const } : {}),
      }),
    );
  }
  return out;
}

const sameCI = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Does a static ability's source still have it? It must be on the battlefield and not have lost its abilities. */
function exists(s: GameState, e: Inst, chars: CharMap): boolean {
  if (e.fromGraveyard) return !e.condition || conditionMet(s, e.condition, e.sourceId!, e.controller!, chars);
  if (!e.affects || e.emblem || e.live) return true;
  const src = chars.get(e.sourceId!);
  if (!src || (!src.hasPrintedAbilities && !e.granted)) return false;
  // A granted one exists only while its source still has the ability (an effect in layer 6 may take it away, CR 613.8a).
  if (e.grantedText !== undefined && !src.grantedAbilities.includes(e.grantedText)) return false;
  // Glittering Lion: a printed static ability an effect in layer 6 took away (CR 613.1f).
  if (e.staticText !== undefined && src.lostStatics?.includes(e.staticText)) return false;
  if (e.condition && !conditionMet(s, e.condition, e.sourceId!, src.controller, chars)) return false;
  if (e.affects.kind === "attached") {
    const host = s.objects[e.sourceId!]!.attachedTo;
    return !!host && chars.has(host);
  }
  return true;
}

const PERMANENT_CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

/**
 * Is an "as long as" condition true? Whatever it looks at on the battlefield is seen as the layers
 * applied so far have left it, so an effect that changes that waits for it (CR 613.8a).
 */
/** Whether the game is in this part of the turn (CR 506.8): see TimingWindow. */
function inWindow(s: GameState, w: TimingWindow): boolean {
  switch (w) {
    case "upkeep":
    case "draw":
    case "end":
    case "declareAttackers":
    case "declareBlockers":
    case "endCombat":
      return s.step === w;
    case "afterUpkeep":
      return s.step !== "untap" && s.step !== "upkeep";
    case "combat": // any combat phase of the turn (CR 506.8c)
      return ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);
    case "combatBeforeBlocks": // before the declare blockers step begins (CR 506.8b)
      return s.step === "beginCombat" || s.step === "declareAttackers";
    case "beforeCombat":
    case "beforeAttackers":
    case "beforeBlockers":
    case "beforeDamage":
    case "beforeEndCombat": {
      // Before that point of the turn's first combat (CR 506.8d): the beginning phase and first main phase, and the steps
      // of that combat before it. With no attackers declared, the declare blockers and combat damage steps are skipped,
      // so the window ends with the declare attackers step (506.8e).
      if (["untap", "upkeep", "draw", "main1"].includes(s.step) && !s.combatsThisTurn) return true;
      if ((s.combatsThisTurn ?? 0) !== 1) return false;
      const table: Record<Exclude<TurnPoint, "afterCombat">, string[]> = { beforeCombat: [], beforeAttackers: ["beginCombat"], beforeBlockers: ["beginCombat", "declareAttackers"], beforeDamage: ["beginCombat", "declareAttackers", "declareBlockers"], beforeEndCombat: ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage"] };
      return table[w].includes(s.step);
    }
    case "afterCombat": // once the turn's first combat phase has ended (CR 506.8d)
      return !!s.combatsThisTurn && !(s.combatsThisTurn === 1 && ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step));
    case "combatAfterBlocks": // not in a combat whose declare blockers step was skipped (CR 506.8f)
      return ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step) && s.blockersStep?.turn === s.turn && s.blockersStep.combat === (s.combatsThisTurn ?? 0);
  }
}

/**
 * The one player in the game with the most life, cards in hand, or permanents matching a filter (`count` counts those),
 * or none when two or more are tied for the most.
 */
export function uniqueMostPlayer(s: GameState, stat: MostStat, count: (p: PlayerId, filter: TargetSpec) => number): PlayerId | undefined {
  const alive = s.turnOrder.filter((p) => !s.players[p]!.lost);
  const n = (p: PlayerId) => (stat.what === "life" ? s.players[p]!.life : stat.what === "hand" ? s.players[p]!.hand.length : count(p, stat.filter));
  const each = alive.map((p) => [p, n(p)] as const);
  const most = Math.max(...each.map(([, v]) => v));
  const top = each.filter(([, v]) => v === most);
  return top.length === 1 ? top[0]![0] : undefined;
}

function conditionMet(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, chars: CharMap, eventPlayer?: PlayerId, eventAmount?: number, sourceZc?: number, subjectId?: ObjectId, subjectZc?: number): boolean {
  const src = s.objects[sourceId]!;
  const yard = () => s.players[you]?.graveyard.map((id) => defOf(s, s.objects[id]!)) ?? [];
  switch (cond.kind) {
    case "selfInExile": // Senu's intervening if (CR 603.4): the same object, face up in its owner's exile
      return src.zone === "exile" && !src.faceDown && src.owner === you && (sourceZc === undefined || (src.zoneChanges ?? 0) === sourceZc);
    case "selfSuspended": // CR 702.62b: in exile, with suspend (printed or gained there) and a time counter on it
      return src.zone === "exile" && !src.faceDown && src.owner === you && (sourceZc === undefined || (src.zoneChanges ?? 0) === sourceZc) && (src.counters.time ?? 0) > 0 && (!!compileCard(defOf(s, src)).suspend || src.gainedSuspend === (src.zoneChanges ?? 0));
    case "selfStill":
      return src.zone === cond.zone && (cond.zone === "battlefield" || src.owner === you) && (sourceZc === undefined || (src.zoneChanges ?? 0) === sourceZc);
    case "selfCastNth": {
      // The spell's place among all spells cast this turn (StackItem.castNth) is its place in castThisTurn.
      const all = s.castThisTurn ?? [];
      const nth = src.castNth;
      return src.zone === "battlefield" && !!src.wasCast && src.enteredTurn === s.turn && nth !== undefined && all[nth]?.player === you && all.slice(0, nth).filter((c) => c.player === you).length === cond.n - 1;
    }
    case "selfCommandOrBattlefield":
      return src.zone === "command" || src.zone === "battlefield";
    case "combatSinceYourLastUpkeep": {
      const o = cond.of === "attached" ? (src.attachedTo !== undefined ? s.objects[src.attachedTo] : undefined) : src;
      if (!o || o.zone !== "battlefield") return false;
      // The turn of your previous upkeep: the one before this upkeep if it's yours now, else your latest (none yet: any).
      const p = s.players[you];
      const since = (p?.upkeepTurn === s.turn && s.step === "upkeep" ? p.lastUpkeepTurn : p?.upkeepTurn) ?? 0;
      const turns = [...(cond.attacked ? [o.attackedTurns?.at(-1)] : []), ...(cond.blocked ? [o.blockedTurn] : []), ...(cond.wasBlocked ? [o.becameBlockedTurn] : [])];
      return turns.some((t) => t !== undefined && t >= since);
    }
    case "selfInCommand":
      return src.zone === "command";
    case "selfDamagedCreature":
      return !!s.turnLog?.damagedCreature?.includes(`${src.id}@${src.zoneChanges ?? 0}`);
    case "selfInGraveyard": // the card's own graveyard ability's intervening if (CR 603.4)
      // Nether Spirit: no other creature card there (rulings: two of them stop each other), as the cards are there.
      return src.zone === "graveyard" && src.owner === you && (!cond.creatureAbove || creatureCardAbove(s, src)) && (cond.creaturesAbove === undefined || creatureCardsAbove(s, src) >= cond.creaturesAbove) && (!cond.onlyCreature || (defOf(s, src).types.includes("Creature") && !(s.players[you]?.graveyard ?? []).some((id) => id !== src.id && !!s.objects[id] && defOf(s, s.objects[id]!).types.includes("Creature"))));
    case "topCardIs": {
      const top = s.objects[s.players[you]?.library[0] ?? ""];
      return !!top && printedMatches(cond.filter, defOf(s, top));
    }
    case "graveyardAtLeast": {
      // threshold; So Tiny's "its controller", the controller of the creature it's attached to, as the layers so far have it
      const who = cond.who === "attached" ? (src.attachedTo && chars.get(src.attachedTo) ? chars.get(src.attachedTo)!.controller : undefined) : you;
      return who !== undefined && (s.players[who]?.graveyard.length ?? 0) >= cond.n;
    }
    case "graveyardTypes": // delirium: card types, not subtypes or supertypes (CR 205.2a)
      return new Set(yard().flatMap((d) => (cond.permanent ? d.types.filter((t) => PERMANENT_CARD_TYPES.includes(t)) : d.types))).size >= cond.n;
    case "graveyardPermanents": // descend
      return yard().filter((d) => d.types.some((t) => PERMANENT_CARD_TYPES.includes(t))).length >= cond.n;
    case "selfCounter": // unleash (CR 702.98a)
      return (src.counters[cond.counter] ?? 0) > 0;
    case "selfCounters": {
      // "*": counters of every kind together (Twenty-Toed Toad). Once the object the ability is about has left its zone,
      // the counters it last had there (CR 608.2h): Reckoner Bankbuster gone in response to its ability.
      const lk = sourceZc !== undefined && (src.zoneChanges ?? 0) !== sourceZc ? s.lastKnown?.[sourceId] : undefined;
      const counters = lk ? (lk.zc === sourceZc ? (lk.counters ?? {}) : {}) : src.counters;
      const n = cond.counter === "*" ? Object.values(counters).reduce((a, b) => a + (b ?? 0), 0) : (counters[cond.counter] ?? 0);
      return n >= cond.min && (cond.max === undefined || n <= cond.max) && (!cond.parity || n % 2 === (cond.parity === "odd" ? 1 : 0));
    }
    case "classLevel": {
      const n = src.classLevel ?? 1; // CR 716.2d
      return n >= cond.min && (cond.max === undefined || n <= cond.max);
    }
    case "selfPT": {
      // A trigger's intervening if (CR 603.4) or "if ~'s power is 7 or greater" as it resolves, so the layers are all
      // applied by now. Given the zone change the ability is about (`sourceZc`), once that object has left the
      // battlefield it's its power as it last existed there (CR 608.2h; rulings on Vincent, Vengeful Atoner).
      const here = chars.has(sourceId) && (sourceZc === undefined || (src.zoneChanges ?? 0) === sourceZc);
      const lk = !here && sourceZc !== undefined ? s.lastKnown?.[sourceId] : undefined;
      const c = here ? chars.get(sourceId) : lk?.zc === sourceZc ? lk : undefined;
      if (!c) return false;
      const n = cond.stat === "power" ? c.power : c.toughness;
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
    case "subjectAttackingYou": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      return !!sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc && sub.attacking === you;
    }
    case "subjectPT": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const here = !!sub && chars.has(sub.id) && (sub.zoneChanges ?? 0) === subjectZc;
      const lk = !here && subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      // Gone: as it last existed on the battlefield, whether the trigger names it there or in the zone it went to (a
      // "dies" trigger's subject is the card in the graveyard, Pelt Collector).
      const c = here ? chars.get(subjectId!) : lk && (lk.zc === subjectZc || (lk.zc + 1 === subjectZc && sub?.zoneChanges === subjectZc)) ? lk : undefined;
      if (!c) return false;
      const n = cond.stat === "power" ? c.power : c.toughness;
      if (cond.greatest && s.battlefield.some((id) => id !== subjectId && chars.get(id)?.types.includes("Creature") && chars.get(id)!.power >= n)) return false;
      if (cond.greaterThanSource) {
        // Pelt Collector: this permanent's power now, or as it last existed on the battlefield (rulings).
        const me = chars.get(sourceId) ?? s.lastKnown?.[sourceId];
        if (!me || n <= (cond.stat === "power" ? me.power : me.toughness)) return false;
      }
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
    case "yourTurn":
      return (s.activePlayer === you) !== !!cond.not;
    case "extraTurn":
      return !!s.extraTurn;
    case "eventPlayersTurn":
      return eventPlayer !== undefined && (s.activePlayer === eventPlayer) !== !!cond.not;
    case "anyOf":
      return cond.conds.some((c) => conditionMet(s, c, sourceId, you, chars, eventPlayer, eventAmount, sourceZc));
    case "not":
      return !conditionMet(s, cond.cond, sourceId, you, chars, eventPlayer, eventAmount, sourceZc, subjectId, subjectZc);
    case "beforeAttackers":
      return s.activePlayer === you && ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.step);
    case "during": // CR 506.8, 601.3, 602.5b
      return ((!cond.turn || (s.activePlayer === you) === (cond.turn === "you")) && inWindow(s, cond.window)) !== !!cond.not;
    case "attackedThisStep": {
      // Attackers are declared as the declare attackers step begins (CR 508.1); attacking only planeswalkers doesn't count.
      const ap = s.players[s.activePlayer];
      return s.step === "declareAttackers" && ap?.attackedPlayers?.turn === s.turn && ap.attackedPlayers.players.includes(you);
    }
    case "amount": {
      // Counted as the layers applied so far left things ("permanents you control": control is layer 2).
      // "Among lands that player controls" (Mask of Intolerance): the trigger's player.
      const ctx = { controller: you, sourceId, view: (o: GameObject) => chars.get(o.id), ...(eventPlayer !== undefined ? { event: { player: eventPlayer } } : {}) };
      const n = evalAmount(s, cond.amount, ctx);
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max) && (cond.moreThan === undefined || n > evalAmount(s, cond.moreThan, ctx)) && (cond.parity === undefined || Math.abs(n % 2) === (cond.parity === "odd" ? 1 : 0));
    }
    case "eventPlayerAttackedYou": {
      // O-Kagachi: the trigger's player attacked you during their most recent turn (this one if it's theirs).
      const p = eventPlayer !== undefined ? s.players[eventPlayer] : undefined;
      const last = p && (s.activePlayer === eventPlayer ? p.lastTurnBegan : p.turnBegan);
      return !!p && last !== undefined && p.attackedInTurn?.turn === last && p.attackedInTurn.players.includes(you);
    }
    case "monarch":
      if (cond.asTurnBegan) return s.monarchAsTurnBegan === you;
      if (cond.none) return s.monarch === undefined;
      if (cond.eventPlayer) return eventPlayer !== undefined && s.monarch === eventPlayer;
      return cond.opponent ? s.monarch !== undefined && s.monarch !== you : (s.monarch === you) !== !!cond.not;
    case "initiative":
      return s.initiative === you;
    case "completedDungeon": {
      const done = s.players[you]?.completedDungeons ?? [];
      return (cond.name ? done.includes(cond.name) : done.length > 0) !== !!cond.not;
    }
    case "fullParty":
      return partySize(s, you, (o) => chars.get(o.id)) === 4;
    case "controlCommander": {
      const who = cond.eventPlayer ? eventPlayer : you;
      return who !== undefined && s.battlefield.some((id) => {
        const c = s.objects[id]!.isCommander ? chars.get(id) : undefined;
        return !!c && c.controller === who && (!cond.own || s.objects[id]!.owner === who) && (!cond.types || cond.types.some((t) => c.types.includes(t)));
      });
    }
    case "ringBearer": {
      // On the battlefield under your control, with the designation (CR 701.54e).
      const b = s.players[you]?.ring?.bearer;
      const o = b && s.objects[b.id];
      const is = !!o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === b.zc && chars.get(o.id)?.controller === you && (!cond.self || o.id === sourceId);
      return is !== !!cond.not;
    }
    case "ringTempted":
      return (s.players[you]?.ring?.tempted ?? 0) >= cond.n;
    case "maxSpeed":
      return s.players[you]?.speed === 4;
    case "harnessed":
      return src.zone === "battlefield" && !!src.harnessed; // CR 702.186b
    case "eventPlayerHand":
      if (eventPlayer === undefined) return false;
      return (cond.max === undefined || s.players[eventPlayer]!.hand.length <= cond.max) && (cond.min === undefined || s.players[eventPlayer]!.hand.length >= cond.min);
    case "eventPlayerPoisoned":
      return eventPlayer !== undefined && !s.players[eventPlayer]!.lost && (s.players[eventPlayer]!.poison ?? 0) > 0;
    case "eventPlayerOpponent":
      return eventPlayer !== undefined && eventPlayer !== you;
    case "eventPlayerNoRad":
      return eventPlayer !== undefined && !s.players[eventPlayer]!.rad;
    case "eventPlayerLifeLost":
      return eventPlayer !== undefined && (s.turnLog?.lifeLost?.[eventPlayer] ?? 0) <= cond.max;
    case "selfDealtEventPlayer": {
      if (eventPlayer === undefined) return false;
      const zc = src.zone === "battlefield" ? (src.zoneChanges ?? 0) : (s.lastKnown?.[src.id]?.zc ?? src.zoneChanges ?? 0);
      return (s.turnLog?.sourceToPlayer?.[`${src.id}@${zc}`]?.[eventPlayer] ?? 0) >= cond.min;
    }
    case "defenderMostLife": {
      // The player it attacked: from the trigger event, or the one it's attacking as it triggers.
      const that = eventPlayer ?? src.attacking;
      if (that === undefined) return false;
      return s.turnOrder.every((p) => p === you || s.players[p]!.lost || s.players[p]!.life <= s.players[that]!.life);
    }
    case "paired": {
      const other = pairedWith(s, src);
      const ok = !!other && (!cond.withKeyword || !!chars.get(other.id)?.keywords.some((k) => sameCI(k, cond.withKeyword!)));
      return ok !== !!cond.not;
    }
    case "crewedByType":
      return !!s.turnLog?.crewedTypes?.[`${sourceId}@${s.objects[sourceId]?.zoneChanges ?? 0}`]?.includes(cond.subtype);
    case "selfDealtDamageThisTurn": {
      const key = `${sourceId}@${s.objects[sourceId]?.zoneChanges ?? 0}`;
      return Object.values(s.turnLog?.sourceDamage ?? {}).reduce((n, byKey) => n + (byKey[key] ?? 0), 0) >= cond.n;
    }
    case "attackedThisTurn":
      return (cond.anyone ? s.turnOrder.some((p) => s.players[p]!.attackedTurn === s.turn) : s.players[you]?.attackedTurn === s.turn) !== !!cond.not;
    case "activatedLoyaltyThisTurn":
      return (s.players[you]?.loyaltyTurn === s.turn) !== !!cond.not;
    case "committedCrime":
      return s.players[you]?.crimeTurn === s.turn;
    case "coven": {
      const powers = new Set<number>();
      for (const c of chars.values()) if (c.controller === you && c.types.includes("Creature")) powers.add(c.power);
      return powers.size >= 3;
    }
    case "controlGreatest": {
      // Among permanents of that type only (rulings on Padeem); an {X} in a permanent's mana cost is 0 (CR 202.3e).
      let mine = -Infinity;
      let all = -Infinity;
      let theirs = -Infinity;
      for (const [id, c] of chars) {
        if (!c.types.includes(cond.type)) continue;
        const n = cond.stat === "power" ? c.power : cond.stat === "toughness" ? c.toughness : defMv(defOf(s, s.objects[id]!));
        all = Math.max(all, n);
        if (c.controller === you) mine = Math.max(mine, n);
        else theirs = Math.max(theirs, n);
      }
      // Might Makes Right: no other player's creature has it too.
      if (cond.each) return mine > -Infinity && mine > theirs;
      return mine > -Infinity && mine >= all;
    }
    case "noOtherAttackingEventPlayer":
      // A creature attacking that player's planeswalker or battle isn't attacking that player (CR 506.3, 508.1b).
      return eventPlayer !== undefined && !s.battlefield.some((id) => id !== subjectId && s.objects[id]!.attacking === eventPlayer && !s.objects[id]!.attackingPermanent);
    case "attackedPlayerPoisoned":
      return s.players.some((p) => !p.lost && (p.poison ?? 0) > 0 && s.battlefield.some((id) => s.objects[id]!.attacking === p.id && !s.objects[id]!.attackingPermanent));
    case "eventPlayerMoreThanAnotherOpponent":
      // Breena: that opponent against each of your other opponents still in the game (rulings: the attacking player may be one).
      return eventPlayer !== undefined && !s.players[eventPlayer]!.lost && s.turnOrder.some((p) => p !== you && p !== eventPlayer && !s.players[p]!.lost && s.players[p]!.life < s.players[eventPlayer]!.life);
    case "eventPlayerMost":
    case "youMost":
    case "opponentMore": {
      const measure = (p: PlayerId) => {
        if (cond.what === "life") return s.players[p]!.life;
        if (cond.what === "hand") return s.players[p]!.hand.length;
        let n = 0;
        for (const c of chars.values()) if (c.controller === p && c.types.includes(cond.what === "lands" ? "Land" : "Creature")) n++;
        return n;
      };
      if (cond.kind === "eventPlayerMost") {
        if (eventPlayer === undefined || s.players[eventPlayer]!.lost) return false;
        const theirs = measure(eventPlayer);
        return s.turnOrder.every((p) => p === eventPlayer || s.players[p]!.lost || measure(p) < theirs);
      }
      if (cond.kind === "youMost") {
        const mine = measure(you);
        return !s.players[you]!.lost && s.turnOrder.every((p) => p === you || s.players[p]!.lost || (cond.fewer ? measure(p) > mine : measure(p) < mine));
      }
      const mine = measure(you);
      if (cond.subjectController) {
        // As the land is now, or as it last existed (CR 608.2h).
        const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
        const that = sub && chars.has(sub.id) && (sub.zoneChanges ?? 0) === subjectZc ? chars.get(sub.id)!.controller : subjectId !== undefined && s.lastKnown?.[subjectId]?.zc === subjectZc ? s.lastKnown![subjectId]!.controller : undefined;
        return that !== undefined && that !== you && !s.players[that]!.lost && measure(that) > mine;
      }
      if (cond.eventPlayer) return eventPlayer !== undefined && eventPlayer !== you && !s.players[eventPlayer]!.lost && measure(eventPlayer) > mine;
      if (cond.activePlayer) return s.activePlayer !== you && !s.players[s.activePlayer]!.lost && measure(s.activePlayer) > mine;
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && (cond.fewer ? measure(p) < mine : measure(p) >= mine + (cond.atLeast ?? 1)));
    }
    case "subjectControllerOtherLandEntered": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const that = sub && chars.has(sub.id) && (sub.zoneChanges ?? 0) === subjectZc ? chars.get(sub.id)!.controller : subjectId !== undefined && s.lastKnown?.[subjectId]?.zc === subjectZc ? s.lastKnown![subjectId]!.controller : undefined;
      return that !== undefined && (s.turnLog?.entered ?? []).some((e) => e.controller === that && e.types.includes("Land") && !(e.id === subjectId && e.zc === subjectZc));
    }
    case "youMostLife":
      return !s.players[you]!.lost && s.turnOrder.every((p) => s.players[p]!.lost || s.players[p]!.life <= s.players[you]!.life);
    case "attackingMostLife": {
      // Not when it attacks a planeswalker (dethrone rulings).
      if (src.attacking === undefined || src.attackingPermanent) return false;
      const lives = s.turnOrder.filter((p) => !s.players[p]!.lost).map((p) => s.players[p]!.life);
      return s.players[src.attacking]!.life >= Math.max(...lives);
    }
    case "phase": {
      const combat = ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);
      const now = cond.phase === "combat" ? combat : cond.phase === "end" ? s.step === "end" : s.step === "main1" || s.step === "main2";
      return (now && (!cond.yours || s.activePlayer === you) && (!cond.first || s.combatsThisTurn === 1)) !== !!cond.not;
    }
    case "prowl": {
      // CR 702.76a: the spell's creature types as it's cast (a changeling has all of them, CR 702.73a), against the
      // sources `you` controlled that dealt combat damage to a player this turn.
      const d = defOf(s, src);
      const all = everyCreatureType(d);
      const mine = d.subtypes.filter((t) => CREATURE_TYPES.has(t));
      const dealt = s.turnLog?.combatDamageTypesBy?.[you] ?? [];
      return dealt.some((t) => (t === "*" ? all || mine.length > 0 : all ? CREATURE_TYPES.has(t) : mine.includes(t)));
    }
    case "permanentToYourHand":
      return (s.turnLog?.permanentToHand ?? []).includes(you);
    case "cardLeftYourGraveyard":
      if (cond.creature) return (s.turnLog?.creatureCardLeftGraveyard ?? []).includes(you);
      return cond.n ? (s.turnLog?.leftGraveyardCount?.[you] ?? 0) >= cond.n : (s.turnLog?.leftGraveyard ?? []).includes(you);
    case "castAnother": { // checked before the spell counts itself (CR 601.2f, 601.2i)
      const mine = (s.castThisTurn ?? []).filter((c) => c.player === you && (!cond.color || c.colors?.includes(cond.color)) && (!cond.types || cond.types.some((t) => s.cards[c.card]?.types.includes(t))));
      // As a spell resolves it has counted itself, unless it's a copy, which wasn't cast (CR 707.12). With a color, only if
      // it was cast that color.
      const item = cond.resolving ? s.resolving?.item : undefined;
      // Only the spell or ability checking it counts itself out: Dream Thief's "when ~ enters, draw a card if you've cast
      // another blue spell this turn" leaves out ~ itself, cast this turn (rulings).
      const ownSpell = item?.kind === "spell" && !item.copy && item.objectId === sourceId;
      const ownTrigger = item?.kind === "ability" && item.sourceId === sourceId && src.zone === "battlefield" && !!src.wasCast && src.enteredTurn === s.turn;
      // Hotheaded Giant: a permanent spell enters without a resolving item; it counts itself only if it was cast (rulings).
      const entering = !!cond.entering && !!src.wasCast && mine.some((c) => c.card === defOf(s, src).oracleId);
      // Sage of the Skies: "When you cast this spell, if you've cast another spell this turn": the spell on the stack, cast
      // (not a copy), has counted itself, as it triggers and as the trigger resolves.
      const castOnStack = src.zone === "stack" && s.stack.some((x) => x.kind === "spell" && !x.copy && x.objectId === sourceId && x.controller === you);
      const itself = entering || ((castOnStack || (!!item && item.controller === you && (ownSpell || ownTrigger))) && (!cond.color || mine.some((c) => c.card === defOf(s, src).oracleId)));
      return mine.length - (itself ? 1 : 0) > 0;
    }
    case "creatureDied":
      if (cond.notNamedSelf) return (s.diedNamesThisTurn ?? []).some((n) => !n || !sameName(n, defOf(s, src).name));
      return (s.diedThisTurn ?? []).filter((p) => !cond.yours || p === you).length >= (cond.n ?? 1);
    case "meldPartner": {
      // "If you both own and control ~ and a creature named Bruna, the Fading Light" (CR 701.42): ~ as it is now.
      const me = chars.get(sourceId);
      const partner = me && meldPartnerName(defOf(s, src));
      if (!me || !partner || src.owner !== you || me.controller !== you) return false;
      for (const [id, c] of chars) if (id !== sourceId && s.objects[id]!.owner === you && c.controller === you && c.name === partner && c.types.includes(cond.type)) return true;
      return false;
    }
    case "moreThanActive": {
      // The layers' view: a land or creature as the earlier layers left it (CR 613).
      const count = (p: PlayerId) => [...chars.values()].filter((c) => c.controller === p && c.types.includes(cond.what === "lands" ? "Land" : "Creature")).length;
      return (count(you) > count(s.activePlayer)) !== !!cond.not;
    }
    case "onBattlefield": {
      let n = 0;
      for (const [id, c] of chars) if (!(cond.other && id === sourceId) && objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) n++;
      return (cond.max === undefined || n <= cond.max) && (cond.min === undefined || n >= cond.min);
    }
    case "life": {
      const fits = (life: number) => (cond.min === undefined || life >= cond.min) && (cond.max === undefined || life <= cond.max);
      if (cond.opponent) return s.players.some((p) => p.id !== you && !p.lost && fits(p.life));
      if (cond.everyone) return s.players.every((p) => p.lost || fits(p.life));
      if (cond.anyone) return s.players.some((p) => !p.lost && fits(p.life));
      return fits(s.players[you]?.life ?? 0);
    }
    case "scriedThisTurn":
      return (s.turnLog?.[cond.surveil ? "surveilled" : "scried"] ?? []).includes(you);
    case "discardedThisTurn":
      return (s.turnLog?.discards ?? []).some((d) => d.cards.length > 0 && (!cond.opponent || d.player !== you) && (!cond.yours || d.player === you));
    case "opponentLostLife":
      if (cond.damaged && cond.noncombat) return Object.entries(s.turnLog?.noncombatDamage ?? {}).some(([p, v]) => Number(p) !== you && v > 0);
      if (cond.damaged && cond.of === "eventPlayer") return eventPlayer !== undefined && (s.damagedThisTurn ?? []).some((p) => p !== eventPlayer);
      if (cond.damaged) return (s.damagedThisTurn ?? []).some((p) => p !== you);
      // Paid life counts too (CR 119.4); gaining life doesn't take any back (rulings on Bloodchief Ascension).
      if (cond.n !== undefined) return Object.entries(s.turnLog?.lifeLost ?? {}).some(([p, v]) => (cond.anyPlayer || Number(p) !== you) && v >= cond.n!);
      return (s.lostLifeThisTurn ?? []).some((p) => p !== you);
    case "defendingHasRad":
      return src.attacking !== undefined && (s.players[src.attacking]?.rad ?? 0) > 0;
    case "defenderMostCreatures": {
      if (src.attacking === undefined) return false;
      const count = (p: PlayerId) => s.battlefield.filter((id) => { const c = chars.get(id); return !!c && c.controller === p && c.types.includes("Creature"); }).length;
      const theirs = count(src.attacking);
      return s.turnOrder.every((p) => s.players[p]!.lost || count(p) <= theirs);
    }
    case "noCombatDamageSinceLastTurn": {
      const p = s.players[you];
      return !p || p.combatDamagedTurn === undefined || p.combatDamagedTurn < (p.lastTurnBegan ?? 0);
    }
    case "playerCombatDamaged":
      return (s.turnLog?.combatDamageSubtypes ?? []).some((t) => t === "*" || t === cond.subtype);
    case "opponentCombatDamagedByLegendary":
      return (s.turnLog?.legendaryCombatDamaged ?? []).some((p) => p !== you);
    case "opponentSearched":
      return (s.turnLog?.searched ?? []).some((p) => p !== you);
    case "opponentEntered": {
      // Under one opponent's control: "if an opponent had two or more lands enter" counts each opponent on their own.
      const n: Record<number, number> = {};
      for (const e of s.turnLog?.entered ?? [])
        if (e.controller !== you && cond.types.every((ty) => e.types.includes(ty)) && (!cond.color || e.colors.includes(cond.color))) n[e.controller] = (n[e.controller] ?? 0) + 1;
      return Object.values(n).some((k) => k >= cond.n);
    }
    case "youEntered": {
      const selfZc = sourceZc ?? s.objects[sourceId]?.zoneChanges ?? 0;
      // "Last turn": the creatures that entered then, under your control then (Ephara rulings: whatever happened to them since).
      if (cond.lastTurn) return (s.lastTurn?.creaturesEntered ?? []).filter((e) => e.controller === you && !(cond.other && e.id === sourceId && e.zc === selfZc)).length >= cond.n;
      return (s.turnLog?.entered ?? []).filter((e) => e.controller === you && !(cond.other && e.id === sourceId && e.zc === selfZc) && cond.types.every((ty) => e.types.includes(ty)) && !cond.notTypes?.some((ty) => e.types.includes(ty)) && (!cond.flying || !!e.flying) && (!cond.subtype || !!e.subtypes?.includes(cond.subtype) || (!!cond.orSubtype && !!e.subtypes?.includes(cond.orSubtype)))).length >= cond.n;
    }
    case "destroyedByOpponent":
      return (s.turnLog?.destroyed ?? []).some((e) => e.controller === you && e.by !== you);
    case "damagedByCreatures":
      return (s.turnLog?.damagedBy?.[you]?.length ?? 0) >= cond.n;
    case "damagedBySelfDied":
      return (s.turnLog?.diedDamaged ?? []).some((d) => d.by.includes(sourceId));
    case "subjectCounter": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const least = cond.min ?? 1;
      if (sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc) return (sub.counters[cond.counter] ?? 0) >= least;
      const lk = subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      return !!lk && lk.zc === subjectZc && (lk.counters?.[cond.counter] ?? 0) >= least;
    }
    case "subjectType": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      if (sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc) {
        const c = chars.get(sub.id);
        return !!c && (c.subtypes.includes(cond.subtype) || (!!c.allCreatureTypes && c.types.includes("Creature")));
      }
      // Gone: as it last existed on the battlefield, whether the trigger names it there or in the zone it went to.
      const lk = subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      const same = !!lk && (lk.zc === subjectZc || (lk.zc + 1 === subjectZc && sub?.zoneChanges === subjectZc));
      return same && (lk!.creatureTypes === "all" || !!lk!.creatureTypes?.includes(cond.subtype));
    }
    case "subjectCardType": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      if (sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc) return !!chars.get(sub.id)?.types.includes(cond.type);
      const lk = subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      return !!lk && lk.zc === subjectZc && !!lk.source?.types.includes(cond.type);
    }
    case "subjectDealtExcess":
      return subjectId !== undefined && (s.turnLog?.excessDealt ?? []).some((e) => e.id === subjectId && e.zc === subjectZc);
    case "opponentsDealtExcess":
      // As the permanent was when it was dealt the damage, wherever it is now (Rith rulings).
      return (s.turnLog?.excessDealt ?? []).some((e) => e.controller !== you && e.types.some((ty) => cond.types.includes(ty)));
    case "addedManaThisTurn": {
      const o = s.objects[sourceId];
      const did = !!o?.triggeredThisTurn?.includes(`${sourceZc ?? o.zoneChanges ?? 0}|addedMana`);
      return cond.not ? !did : did;
    }
    case "subjectCastFromHand": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const cast = !!sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc && !!sub.castFromHand;
      return cond.not ? !cast : cast;
    }
    case "subjectFromYourGraveyard": {
      // A card can only be in its owner's graveyard; "you cast it": the spell's controller, who controls the permanent.
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      return !!sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc && sub.owner === you && (!!sub.enteredFromGraveyard || (!!sub.castFromGraveyard && sub.controller === you));
    }
    case "subjectWasCast": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const cast = !!sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc && !!sub.wasCast;
      return cond.not ? !cast : cast;
    }
    case "subjectPowerNotBase": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const c = sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc ? chars.get(sub.id) : undefined;
      if (c) return c.power !== ([...c.pt].reverse().find((p) => p.kind === "set")?.power ?? c.printedPower);
      // Gone (Jason Bright's "dies"): as it last existed on the battlefield (CR 603.10a), named there or in its new zone.
      const lk = subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      const same = !!lk && (lk.zc === subjectZc || (lk.zc + 1 === subjectZc && sub?.zoneChanges === subjectZc));
      return same && lk!.basePower !== undefined && lk!.power !== lk!.basePower;
    }
    case "subjectFirstTapThisTurn": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const taps = sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc ? sub.tapsThisTurn : undefined;
      return !!taps && taps.turn === s.turn && taps.zc === subjectZc && taps.n === 1;
    }
    case "subjectPutBySelf": {
      const by = subjectId !== undefined ? s.objects[subjectId]?.putBy : undefined;
      const put = !!by && by.id === sourceId && (s.objects[sourceId]?.zoneChanges ?? 0) === by.zc;
      return cond.not ? !put : put;
    }
    case "subjectNameUnique": {
      // Checked as it triggers and as it resolves (CR 603.4): if the creature has left, the card (now maybe in your
      // graveyard) or the new object it became shares its name (rulings).
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      if (!sub) return false;
      const here = sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc;
      if (here && sub.faceDown) return true;
      const name = here ? chars.get(sub.id)?.name : defOf(s, sub).name;
      if (!name) return true;
      for (const [id, c] of chars) if (c.controller === you && c.types.includes("Creature") && !(here && id === sub.id) && !s.objects[id]!.faceDown && sameName(c.name, name)) return false;
      return !yard().some((d) => d.types.includes("Creature") && sameName(d.name, name));
    }
    case "subjectDamagedBy":
      return (s.turnLog?.damageDealtTo?.[`${subjectId}@${subjectZc}`] ?? []).some((d) => d.controller === you && ((cond.spell && !!d.spell) || d.subtypes.some((st) => cond.subtypes.includes(st))));
    case "opponentGainedLife":
      return (s.turnLog?.gainedLife ?? []).some((p) => p !== you);
    case "cardExiledThisTurn":
      return !!s.turnLog?.cardExiled;
    case "playedFromExile":
      return (s.turnLog?.playedFromExile ?? []).includes(you);
    case "playedOrCastNotFromHand":
      return (s.turnLog?.landPlayedNotFromHand ?? []).includes(you) || (s.castThisTurn ?? []).some((x) => x.player === you && x.from !== "hand");
    case "youPutCounterOnCreature":
      return (s.turnLog?.creatureCounterPutters ?? []).includes(you);
    case "opponentCardsToGraveyard":
      return Object.entries(s.turnLog?.toGraveyard ?? {}).some(([p, k]) => Number(p) !== you && k >= cond.n);
    case "opponentCastCount":
      return s.turnOrder.some((p) => p !== you && (s.castThisTurn ?? []).filter((c) => c.player === p).length >= cond.n);
    case "opponentCast":
      return (s.castThisTurn ?? []).some((c) => c.player !== you && !!c.colors?.some((x) => cond.colors.includes(x)));
    case "noneInHand":
      return !(s.players[you]?.hand ?? []).some((id) => printedMatches(cond.filter, defOf(s, s.objects[id]!)));
    case "opponentDealtDamage":
      // Also an opponent who has left the game since (Spinerock Knoll rulings).
      return Object.entries(s.damageThisTurn ?? {}).some(([p, n]) => (cond.you ? Number(p) === you : Number(p) !== you) && n >= cond.n);
    case "attackedWith": {
      if (cond.combat) {
        const c = s.players[you]?.attackedCombat;
        if (!(c?.turn === s.turn && c.combat === (s.combatsThisTurn ?? 0) && c.n >= cond.n)) return false;
        // Fearless Swashbuckler: an attacker with each subtype, its creature types (changeling's all) or other subtypes
        // (Vehicle, CR 205.3g) as it was declared.
        const w = s.players[you]?.attackedWith;
        const has = (k: string, st: string) => (CREATURE_TYPES.has(st) ? w?.kinds?.[k] === "all" || !!(w?.kinds?.[k] as string[] | undefined)?.includes(st) : !!w?.others?.[k]?.includes(st));
        return !cond.eachSubtype || (w?.turn === s.turn && cond.eachSubtype.every((st) => (c.keys ?? []).some((k) => has(k, st))));
      }
      const w = s.players[you]?.attackedWith;
      // Ramses, Assassin Lord: only the ones declared attacking the event's player.
      if (cond.eventPlayer && (eventPlayer === undefined || w?.turn !== s.turn)) return false;
      const keys = cond.eventPlayer ? w!.keys.filter((k) => !!w!.to?.[k]?.includes(eventPlayer!)) : (w?.keys ?? []);
      // A Spacecraft isn't a creature type: only its own subtypes count, not changeling's (CR 702.73a).
      if (cond.subtype && !CREATURE_TYPES.has(cond.subtype)) return w?.turn === s.turn && keys.filter((k) => !!w.others?.[k]?.includes(cond.subtype!)).length >= cond.n;
      if (cond.subtype) return w?.turn === s.turn && keys.filter((k) => w.kinds?.[k] === "all" || !!(w.kinds?.[k] as string[] | undefined)?.includes(cond.subtype!)).length >= cond.n;
      return w?.turn === s.turn && keys.length >= cond.n;
    }
    case "attackPower": {
      const w = s.players[you]?.attackPower;
      return w?.turn === s.turn && w.n >= cond.n;
    }
    case "handAtLeast": {
      const n = s.players[you]?.hand.length ?? 0;
      return cond.exactly ? n === cond.n : cond.fewer ? n < cond.n : n >= cond.n;
    }
    case "sameNamed": {
      // An object with no name (face down) shares a name with nothing (CR 201.2a).
      const byName = new Map<string, number>();
      for (const [id, c] of chars)
        if (c.controller === you && cond.types.every((t) => c.types.includes(t)) && !cond.notTypes?.some((t) => c.types.includes(t)) && !(cond.nontoken && s.objects[id]!.isToken) && c.name && !s.objects[id]!.faceDown) byName.set(c.name, (byName.get(c.name) ?? 0) + 1);
      return [...byName.values()].some((n) => n >= cond.n);
    }
    case "allShareColor": {
      // The colors the earlier layers left them (CR 613.1e), every player's.
      let shared: Color[] | undefined;
      for (const [id, c] of chars) if (objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) shared = (shared ?? c.colors).filter((k) => c.colors.includes(k));
      return !!shared?.length;
    }
    case "handsEmpty":
      return s.players.filter((p) => !p.lost).every((p) => p.hand.length === 0);
    case "playedLandThisTurn":
      return (s.players[you]?.landsPlayedThisTurn ?? 0) > 0;
    case "noSpellsCastThisGame":
      return !Object.values(s.players[you]?.castNames ?? {}).some((n) => n > 0);
    case "opponentOwnsExiled":
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && s.players[p]!.exile.length > 0);
    case "uniqueMost":
      return uniqueMostPlayer(s, cond.stat, (p, f) => [...chars].filter(([id, c]) => c.controller === p && objectMatches(s, f, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))).length) !== undefined;
    case "someHandAtMost":
      return s.players.some((p) => !p.lost && (!cond.opponent || p.id !== you) && p.hand.length <= cond.n);
    case "totalPower": {
      let n = 0;
      for (const c of chars.values()) if (c.controller === you && c.types.includes("Creature")) n += cond.toughness ? c.toughness : c.power;
      return n >= cond.n;
    }
    case "libraryAtMost":
      return cond.yours ? (s.players[you]?.library.length ?? 0) <= cond.n : s.players.some((p) => !p.lost && p.library.length <= cond.n);
    case "drawn": {
      const drew = (p: number) => {
        const d = s.players[p]?.draws;
        return d?.turn === s.turn && d.n >= cond.n;
      };
      return cond.opponent ? s.turnOrder.some((p) => p !== you && drew(p)) : drew(you);
    }
    case "cycled":
      return (s.turnLog?.cycled?.[you] ?? 0) >= cond.n;
    case "descended":
      return (s.descendedThisTurn ?? []).includes(you);
    case "revolt":
      if (cond.none) return !s.permanentLeftThisTurn?.length;
      if (cond.creature) return (s.turnLog?.creaturesLeft?.[you] ?? 0) > 0;
      return (s.permanentLeftThisTurn ?? []).includes(you);
    case "void":
      return !!s.voidThisTurn;
    case "selfIs": {
      const c = chars.get(sourceId);
      return !!c && objectMatches(s, cond.filter, src, you, false, undefined, c, (x) => chars.get(x.id));
    }
    case "mostCommonColor":
      return mostCommonColors(s, (id) => chars.get(id)).includes(cond.color);
    case "attachedIs": {
      const host = src.attachedTo ? s.objects[src.attachedTo] : undefined;
      const c = host && chars.get(host.id);
      return !!c && objectMatches(s, cond.filter, host, you, false, undefined, c, (x) => chars.get(x.id));
    }
    case "attachedInCombatWith": {
      const host = src.attachedTo ? s.objects[src.attachedTo] : undefined;
      if (host?.zone !== "battlefield") return false;
      const other = [...(host.blocking ?? []), ...(host.blockedBy ?? [])].map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "battlefield");
      return other.some((o) => { const c = chars.get(o.id); return !!c && objectMatches(s, cond.filter, o, you, false, undefined, c, (x) => chars.get(x.id)); });
    }
    case "opponentPoison":
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && (s.players[p]!.poison ?? 0) >= cond.n);
    case "opponentGraveyard":
      return s.turnOrder.some((p) => (p !== you || cond.anyone) && !s.players[p]!.lost && s.players[p]!.graveyard.length >= cond.n);
    case "increment": {
      const c = chars.get(sourceId);
      return !!c && c.types.includes("Creature") && eventAmount !== undefined && (eventAmount > c.power || (!cond.powerOnly && eventAmount > c.toughness));
    }
    case "suspected":
      return (src.suspected !== undefined) !== !!cond.not; // CR 701.60
    case "solved":
      return !!src.solved !== !!cond.not; // CR 719.3b
    case "anchor":
      return src.chosen?.anchor === cond.word; // CR 614.12b
    case "cardsToGraveyard":
      return Math.min(...cond.types.map((t) => s.turnLog?.toGraveyardTypes?.[t] ?? 0)) >= cond.n;
    case "cardToYourGraveyard":
      return cond.types.some((t) => !!s.turnLog?.toOwnGraveyardTypes?.[you]?.includes(t));
    case "noncombatByColor":
      return (s.turnLog?.noncombatByColor?.[you]?.[cond.color] ?? 0) >= cond.n;
    case "sourceDealtAtLeast":
      return Object.values(s.turnLog?.sourceDamage?.[you] ?? {}).some((n) => n >= cond.n);
    case "sourcesDealtDamage":
      return (s.turnLog?.damageSources?.[you]?.length ?? 0) >= cond.n;
    case "castCount":
      // In a free-for-all game every other player is an opponent (CR 102.3).
      return (s.castThisTurn ?? []).filter((c) => (cond.byOpponent ? c.player !== you : c.player === (cond.activePlayer ? s.activePlayer : you)) && (!cond.fromHand || c.from === "hand") && (cond.mvAtLeast === undefined || (c.mv ?? 0) >= cond.mvAtLeast) && printedMatches(cond.filter, s.cards[c.card]!)).length >= cond.n !== !!cond.not;
    case "colorsAmong": {
      const colors = new Set<Color>();
      for (const c of chars.values()) if (c.controller === you) for (const k of c.colors) colors.add(k);
      return colors.size >= cond.n;
    }
    case "lifeGainedThisTurn":
      return (s.turnLog?.lifeGained?.[you] ?? 0) >= cond.n;
    case "lostLifeLastTurn":
      return !!s.lastTurn?.lostLife?.includes(you);
    case "castLastTurn": {
      // With no turn before this one there's no last turn to look at.
      const cast = s.lastTurn?.cast;
      if (!cast) return false;
      return cond.none ? cast.every((n) => n === 0) : cast.some((n) => n >= (cond.onePlayer ?? 1));
    }
    case "ownTurnAtMost":
      return s.activePlayer === you && (s.players[you]?.turnsTaken ?? 0) <= cond.n;
    case "opponentLostLifeLastTurn":
      return (s.lastTurn?.lostLife ?? []).some((p) => p !== you);
    case "opponentNoncombatDamagedLastTurn":
      return (s.lastTurn?.noncombatDamaged ?? []).some((p) => p !== you && !s.players[p]?.lost);
    case "citysBlessing":
      return !!s.players[you]?.citysBlessing !== !!cond.not;
    case "dayNight":
      return s.dayNight === cond.v;
    case "enduringStory":
      return !!s.players[you]?.enduringStory !== !!cond.not;
    case "self": {
      if (cond.not) return !conditionMet(s, { kind: "self", is: cond.is }, sourceId, you, chars, eventPlayer, eventAmount, sourceZc);
      if (cond.is === "attacking") return src.attacking !== undefined;
      if (cond.is === "blocking") return !!src.blocking?.length;
      if (cond.is === "attackingOrBlocking") return src.attacking !== undefined || !!src.blocking?.length;
      // Blocked: it stays blocked once blockers are declared for it, even if they all leave combat (CR 509.1h).
      if (cond.is === "blocked") return src.attacking !== undefined && src.blockedBy !== undefined;
      if (cond.is === "hasBlockers") return src.attacking !== undefined && !!src.blockedBy?.length;
      // Rampaging Cyclops: blockers removed from combat no longer count (rulings).
      if (cond.is === "twoOrMoreBlockers") return src.attacking !== undefined && (src.blockedBy?.length ?? 0) >= 2;
      // CR 506.5: "attacking alone" means it's attacking and no other creature is.
      if (cond.is === "attackingAlone") return src.attacking !== undefined && !s.battlefield.some((id) => id !== src.id && s.objects[id]!.attacking !== undefined);
      // "~ has hexproof as long as it's untapped" (Paradise Druid): tapping it doesn't change the effects' cache key otherwise.
      // Sphinx Sovereign gone before its ability resolves: tapped or untapped as it last existed (rulings, CR 608.2h).
      if (cond.is === "tapped" || cond.is === "untapped") {
        const lk = sourceZc !== undefined && (src.zoneChanges ?? 0) !== sourceZc ? s.lastKnown?.[sourceId] : undefined;
        return (lk && lk.zc === sourceZc ? !!lk.tapped : src.tapped) === (cond.is === "tapped");
      }
      if (cond.is === "startedTurnUntapped") return src.zone === "battlefield" && !!s.turnLog?.startedUntapped?.includes(`${src.id}@${src.zoneChanges ?? 0}`);
      if (cond.is === "devoured") return (src.devoured ?? 0) > 0;
      if (cond.is === "monstrous") return !!src.monstrous; // CR 701.37b
      if (cond.is === "renowned") return !!src.renowned; // CR 702.112b
      if (cond.is === "escaped") return !!src.escaped; // CR 702.138b
      if (cond.is === "attachedToCreature") return !!src.attachedTo && !!chars.get(src.attachedTo)?.types.includes("Creature");
      if (cond.is === "aura") return src.zone === "battlefield" && !!chars.get(src.id)?.subtypes.includes("Aura");
      if (cond.is === "attackedThisTurn") return src.attacked?.turn === s.turn;
      if (cond.is === "attackedOrBlockedThisCombat") return src.declaredInCombat?.turn === s.turn && src.declaredInCombat.combat === (s.combatsThisTurn ?? 0);
      if (cond.is === "attackedOrBlockedThisTurn") return src.declaredInCombat?.turn === s.turn;
      // Only the active player's creatures attack, and nobody else's block in that combat: declared this combat and
      // attacked this turn is attacked this combat.
      if (cond.is === "attackedThisCombat") return src.declaredInCombat?.turn === s.turn && src.declaredInCombat.combat === (s.combatsThisTurn ?? 0) && src.attacked?.turn === s.turn;
      if (cond.is === "attackedBattleThisTurn") return src.attacked?.turn === s.turn && !!src.attacked.battle;
      // Its controller has controlled it continuously since their most recent turn began, or not (CR 302.6).
      if (cond.is === "controlledThisTurn") return src.zone === "battlefield" && src.controlledSinceTurn === s.turn;
      // Rocket Launcher: under its controller since before their most recent turn began (that one, if it's theirs); never
      // before they've had a turn.
      if (cond.is === "controlledSinceYourTurnBegan") {
        const began = s.players.find((p) => p.id === you)?.turnBegan;
        return src.zone === "battlefield" && began !== undefined && src.controlledSinceTurn < began;
      }
      if (cond.is === "hasCounter") return Object.values(src.counters).some((n) => (n ?? 0) > 0);
      // CR 702.171b; Caustic Bronco gone before its ability resolves: saddled as it last existed (rulings, CR 608.2h).
      if (cond.is === "saddled") {
        const lk = sourceZc !== undefined && (src.zoneChanges ?? 0) !== sourceZc ? s.lastKnown?.[sourceId] : undefined;
        return lk && lk.zc === sourceZc ? !!lk.saddled : !!src.saddled;
      }
      if (cond.is === "enteredThisTurn") return src.zone === "battlefield" && src.enteredTurn === s.turn;
      if (cond.is === "onBattlefield") return src.zone === "battlefield";
      if (cond.is === "prepared") return !!src.prepared; // CR 722.3a
      if (cond.is === "token") return !!src.isToken; // Aeve, Progenitor Ooze
      if (cond.is === "dealtDamageThisTurn") return src.zone === "battlefield" && !!src.wasDealtDamage;
      if (cond.is === "regeneratedThisTurn") return src.zone === "battlefield" && src.regenerated?.turn === s.turn;
      if (cond.is === "hasDealtDamage") return !!src.hasDealtDamage;
      if (cond.is === "hasDealtCombatDamage") return !!src.hasDealtCombatDamage;
      // Whirling Dervish: "if ~ dealt damage to an opponent this turn": this object (CR 400.7), to any opponent (CR 102.3).
      if (cond.is === "dealtDamageToOpponentThisTurn") return src.zone === "battlefield" && Object.entries(s.turnLog?.damagedBy ?? {}).some(([pid, by]) => Number(pid) !== you && by.includes(`${src.id}@${src.zoneChanges ?? 0}`));
      if (cond.is === "kicked") return !!src.kicked?.length;
      if (cond.is === "cast") return src.zone === "battlefield" && !!src.wasCast;
      if (cond.is === "sneakThisTurn") return src.zone === "battlefield" && src.castAlt === "sneak" && src.enteredTurn === s.turn;
      if (cond.is === "countersPutThisTurn") return src.countersPutAt?.turn === s.turn && src.countersPutAt.zc === (src.zoneChanges ?? 0);
      if (cond.is === "impending") return src.castAlt === "impending" && (src.counters.time ?? 0) > 0; // CR 702.176a
      const attached = s.battlefield.filter((id) => s.objects[id]!.attachedTo === sourceId).map((id) => ({ id, c: chars.get(id) }));
      const aura = (a: { c?: Characteristics }) => !!a.c?.subtypes.includes("Aura");
      if (cond.is === "enchanted") return attached.some(aura);
      if (cond.is === "equipped") return attached.some((a) => a.c?.subtypes.includes("Equipment"));
      // Modified: counters, equipped, or enchanted by an Aura its controller controls (CR 700.9).
      const mine = chars.get(sourceId)?.controller;
      return Object.values(src.counters).some((n) => (n ?? 0) > 0) || attached.some((a) => a.c?.subtypes.includes("Equipment") || (aura(a) && a.c?.controller === mine));
    }
    case "control": {
      // "Defending player" is the player the source is attacking (CR 506.2); it has none otherwise.
      // "An opponent controls seven or more lands": any one opponent.
      // "Activate only during combat and only if defending player controls ..." (Kjeldoran Guard): the player the source is
      // attacking, or else any one of the defending players, the active player's opponents (CR 508.5a, 802.2).
      // Lurebound Scarecrow: "permanents of the chosen color", the color chosen for the source; none chosen: never true.
      const filter = cond.filter.chosen ? bindChosen(cond.filter, src.chosen) : cond.filter;
      if (filter.chosen) return false;
      const whose = cond.who === "defending" ? (src.attacking !== undefined ? [src.attacking] : []) : cond.who === "anyDefending" ? (src.attacking !== undefined ? [src.attacking] : s.turnOrder.filter((p) => p !== s.activePlayer && !s.players[p]!.lost)) : cond.who === "eventPlayer" ? (eventPlayer !== undefined ? [eventPlayer] : []) : cond.who === "attached" ? (src.attachedTo && chars.get(src.attachedTo) ? [chars.get(src.attachedTo)!.controller] : []) : cond.who === "opponent" ? s.turnOrder.filter((p) => p !== you && !s.players[p]!.lost) : cond.who === "player" ? s.turnOrder.filter((p) => !s.players[p]!.lost) : [you];
      return whose[cond.every ? "every" : "some"]((who) => {
        let n = 0;
        // A face-down permanent has no name (CR 708.2), so it adds none.
        const names = new Set<string>();
        const byName = new Map<string, number>();
        const byType = new Map<string, number>();
        let everyType = 0;
        for (const [id, c] of chars) {
          if (cond.other && id === (cond.who === "attached" ? src.attachedTo : sourceId)) continue;
          if (cond.otherThanSubject && id === subjectId) continue;
          if (c.controller !== who) continue;
          if (!objectMatches(s, filter, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) continue;
          if (cond.sameCreatureType) {
            if (c.allCreatureTypes) everyType++;
            else for (const st of new Set(c.subtypes.filter((x) => CREATURE_TYPES.has(x)))) byType.set(st, (byType.get(st) ?? 0) + 1);
          } else if (cond.sameName) {
            if (!s.objects[id]!.faceDown) byName.set(c.name, (byName.get(c.name) ?? 0) + 1);
          } else if (!cond.differentNames) n++;
          else if (!s.objects[id]!.faceDown) names.add(c.name);
        }
        if (cond.differentNames) n = names.size;
        if (cond.sameName) n = Math.max(0, ...byName.values());
        if (cond.sameCreatureType) n = everyType + Math.max(0, ...byType.values());
        return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max) && (!cond.prime || isPrime(n));
      });
    }
    case "allOf":
      return cond.conds.every((c) => conditionMet(s, c, sourceId, you, chars, eventPlayer, eventAmount, sourceZc, subjectId, subjectZc));
  }
}

/** Zimone, All-Questioning: 2, 3, 5, 7, 11, ... (1 and 0 aren't prime). */
export const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

/** Is an "as long as" or "if" condition true right now, outside of working out characteristics? */
export function staticConditionNow(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, eventPlayer?: PlayerId, eventAmount?: number, sourceZc?: number, subjectId?: ObjectId, subjectZc?: number): boolean {
  const chars: CharMap = new Map(s.battlefield.map((id) => [id, characteristics(s, s.objects[id]!)]));
  return conditionMet(s, cond, sourceId, you, chars, eventPlayer, eventAmount, sourceZc, subjectId, subjectZc);
}

/** The colors among the permanents `pid` controls, in WUBRG order. */
function colorsAmongYours(chars: CharMap, pid: PlayerId): Color[] {
  const all = new Set<Color>();
  for (const c of chars.values()) if (c.controller === pid) for (const col of c.colors) all.add(col);
  return (["W", "U", "B", "R", "G"] as Color[]).filter((col) => all.has(col));
}

function controllerOfInst(e: Inst, chars: CharMap): PlayerId {
  if (e.controller !== undefined) return e.controller;
  return chars.get(e.sourceId!)!.controller;
}

function appliesTo(s: GameState, e: Inst, chars: CharMap): ObjectId[] {
  if (e.locked) return e.locked.filter((id) => chars.has(id));
  if (e.fixed) return e.fixed.filter((id) => chars.has(id));
  const a = e.affects!;
  if (a.kind === "self") return [e.sourceId!];
  if (a.kind === "attached") {
    const host = s.objects[e.sourceId!]!.attachedTo;
    return host && chars.has(host) ? [host] : [];
  }
  if (a.kind === "paired") {
    const other = pairedWith(s, s.objects[e.sourceId!]!);
    return other && chars.has(other.id) ? [e.sourceId!, other.id] : [];
  }
  // Tyrannical Pitlord: the creature chosen as it entered, while it's that permanent (CR 400.7).
  if (a.kind === "chosenObject") {
    const c = s.objects[e.sourceId!]?.chosen?.object;
    const o = c && s.objects[c.id];
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc && chars.has(o.id) ? [o.id] : [];
  }
  if (a.kind === "inCombatWithSelf") {
    // Blocking it, or attacking and blocked by it, while both are in combat (CR 509.1h, 506.4).
    const me = s.objects[e.sourceId!];
    if (!me || me.zone !== "battlefield") return [];
    return s.battlefield.filter((id) => chars.has(id) && ((s.objects[id]!.blocking?.includes(me.id) && me.attacking !== undefined) || (me.blocking?.includes(id) && s.objects[id]!.attacking !== undefined)));
  }
  const you = controllerOfInst(e, chars);
  const out: ObjectId[] = [];
  // "Creatures you control of the chosen type": the choice made as the source entered.
  const spec0 = a.spec && bindChosen(a.spec, s.objects[e.sourceId!]?.chosen);
  // Curse of Hospitality: "creatures attacking enchanted player": the player its source is attached to now.
  const spec = spec0?.attackingEnchanted ? (({ attackingEnchanted: _, ...r }) => ({ ...r, attackingWhom: s.objects[e.sourceId!]?.attachedToPlayer ?? ("eventPlayer" as const) }))(spec0) : spec0;
  // Favor of the Mighty: the greatest mana value among creatures now (an {X} counts 0, CR 202.3e).
  const topMv = a.greatestManaValue ? Math.max(-Infinity, ...[...chars.values()].filter((c) => c.types.includes("Creature")).map((c) => c.manaValue ?? 0)) : undefined;
  for (const [id, c] of chars) {
    if (a.other && id === e.sourceId) continue;
    if (a.otherThanAttached && id === s.objects[e.sourceId!]?.attachedTo) continue;
    if (!a.types.every((t) => c.types.includes(t))) continue;
    if (a.selfOnlyAs && id === e.sourceId && !(c.allCreatureTypes && c.types.includes("Creature")) && !a.selfOnlyAs.some((t) => c.subtypes.some((x) => sameCI(x, t)))) continue;
    if (a.subtypes?.length && !(c.allCreatureTypes && c.types.includes("Creature")) && !a.subtypes.some((t) => c.subtypes.some((x) => sameCI(x, t)))) continue;
    if (a.colors?.length && !a.colors.some((col) => c.colors.includes(col))) continue;
    if (a.controller === "you" && c.controller !== you) continue;
    if (a.controller === "opponent" && c.controller === you) continue;
    if (a.controller === "enchanted" && c.controller !== s.objects[e.sourceId!]?.attachedToPlayer) continue;
    if (a.ownedCommanders && !(s.objects[id]!.isCommander && s.objects[id]!.owner === you)) continue;
    if (spec && !objectMatches(s, spec, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) continue;
    if (a.lesserPowerThanSource && !(c.power < (chars.get(e.sourceId!)?.power ?? -Infinity))) continue;
    if (topMv !== undefined && (c.manaValue ?? 0) !== topMv) continue;
    if (a.sharesColorWithTop) {
      const top = s.objects[s.players[you]?.library[0] ?? ""];
      const topColors = top ? defOf(s, top).colors : [];
      if (!c.colors.some((col) => topColors.includes(col))) continue;
    }
    if (a.sharesWithAttached) {
      const hostId = s.objects[e.sourceId!]?.attachedTo;
      const host = hostId ? chars.get(hostId) : undefined;
      if (!host) continue;
      if (a.sharesWithAttached === "color" && !c.colors.some((col) => host.colors.includes(col))) continue;
      const kinds = (x: Characteristics): Set<string> | "all" => (x.allCreatureTypes && x.types.includes("Creature") ? "all" : new Set(x.subtypes.filter((st) => CREATURE_TYPES.has(st))));
      if (a.sharesWithAttached === "creatureType" && !shareKinds(kinds(c), kinds(host))) continue;
    }
    out.push(id);
  }
  return out;
}

/** Two objects' creature types share one ("all": changeling, CR 702.73a). */
const shareKinds = (a: Set<string> | "all", b: Set<string> | "all") => (a === "all" ? b === "all" || b.size > 0 : b === "all" ? a.size > 0 : [...a].some((x) => b.has(x)));

/** Mirror Golem: protection from each card type of the cards exiled with this object that are still in exile (CR 607.2a). */
function linkedCardTypesProtection(s: GameState, sourceId: ObjectId | undefined): string[] {
  const src = sourceId ? s.objects[sourceId] : undefined;
  if (!src) return [];
  const linked = s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? [];
  const types = linked.flatMap((l) => { const o = s.objects[l.id]; return o?.zone === "exile" && (o.zoneChanges ?? 0) === l.zc && !o.faceDown ? defOf(s, o).types : []; });
  return protectionFromCardTypes(types);
}

/**
 * Urborg Scavengers: `keyword` if a face-up card exiled with this object (CR 607.2a), still in exile, has it as its own
 * printed keyword (CR 113.6: its abilities are there in exile, whatever zone they work in); none otherwise.
 */
function linkedCardKeyword(s: GameState, sourceId: ObjectId | undefined, keyword: string): string[] {
  const src = sourceId ? s.objects[sourceId] : undefined;
  if (!src) return [];
  const linked = s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? [];
  const has = linked.some((l) => { const o = s.objects[l.id]; return o?.zone === "exile" && (o.zoneChanges ?? 0) === l.zc && !o.faceDown && printedKeywords(defOf(s, o)).some((k) => k.toLowerCase() === keyword.toLowerCase()); });
  return has ? [keyword] : [];
}

/** Duplicant: the last creature card exiled with this object that's still in exile (CR 607.2a). */
function lastLinkedCreatureCard(s: GameState, sourceId: ObjectId | undefined): GameObject | undefined {
  const src = sourceId ? s.objects[sourceId] : undefined;
  if (!src) return undefined;
  const linked = s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? [];
  for (let i = linked.length - 1; i >= 0; i--) {
    const o = s.objects[linked[i]!.id];
    if (o?.zone === "exile" && (o.zoneChanges ?? 0) === linked[i]!.zc && !o.faceDown && defOf(s, o).types.includes("Creature")) return o;
  }
  return undefined;
}

/**
 * New subtypes replace the existing ones of the same kind only (CR 205.1a): "becomes a Frog"
 * replaces creature types and leaves an Equipment an Equipment.
 */
function setSubtypes(c: Characteristics, subtypes: string[]) {
  if (!subtypes.length) return;
  const sets = new Set(subtypes.map(subtypeSet));
  c.subtypes = [...c.subtypes.filter((st) => !sets.has(subtypeSet(st))), ...subtypes];
  if (sets.has("Creature")) c.allCreatureTypes = false;
}

function applyMod(s: GameState, c: Characteristics, m: Modification, e: Inst, chars: CharMap, id: ObjectId) {
  // Numbers a static ability counts are counted now, with what the earlier layers did (CR 611.3a, 613.4).
  const num = (a: Amount) =>
    evalAmount(s, a, { controller: controllerOfInst(e, chars), sourceId: e.sourceId, chosen: e.sourceId ? s.objects[e.sourceId]?.chosen : undefined, view: (o) => chars.get(o.id), affected: id });
  switch (m.kind) {
    case "control":
      // Fealty to the Realm: the monarch, with the static's own timestamp; with no monarch it does nothing (rulings).
      if (m.monarch) {
        if (s.monarch !== undefined && !s.players[s.monarch]?.lost) c.controller = s.monarch;
        return;
      }
      c.controller = controllerOfInst(e, chars);
      return;
    case "addTypes": {
      for (const t of m.types) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.subtypes) if (!c.subtypes.includes(t)) c.subtypes.push(t);
      const chosen = e.sourceId ? (m.chosenType ? s.objects[e.sourceId]?.chosen?.type : m.chosenLandType ? s.objects[e.sourceId]?.chosen?.landType : undefined) : undefined;
      if (chosen && !c.subtypes.includes(chosen)) c.subtypes.push(chosen);
      for (const t of m.supertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      if (m.allCreatureTypes) c.allCreatureTypes = true;
      return;
    }
    case "setTypes": {
      // The new card types replace the old, but an instant or sorcery stays one (CR 205.1a). Subtypes of
      // card types it no longer has go too; those of types it keeps stay unless the effect sets that kind.
      const kept = c.types.filter((t) => t === "Instant" || t === "Sorcery");
      // A planeswalker's subtypes (Sarkhan) and Siege are planeswalker and battle types (CR 205.3j, 205.3q).
      const was = c.types;
      const setOf = (st: string) => subtypeSet(st) ?? (st === "Siege" ? "Battle" : was.includes("Planeswalker") ? "Planeswalker" : null);
      c.types = [...m.types, ...kept.filter((t) => !m.types.includes(t))];
      const hasSet = (set: string | null) => set === null || (set === "Spell" ? c.types.includes("Instant") || c.types.includes("Sorcery") : c.types.includes(set));
      c.subtypes = c.subtypes.filter((st) => hasSet(setOf(st)));
      if (!c.types.includes("Creature")) c.allCreatureTypes = false;
      setSubtypes(c, m.subtypes);
      // "Becomes a legendary ... creature": it gains the supertype and keeps any others (CR 205.4b).
      for (const t of m.supertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      return;
    }
    case "setSubtypes": {
      const chosen = m.chosenType && e.sourceId ? s.objects[e.sourceId]?.chosen?.type : undefined;
      setSubtypes(c, m.chosenType ? (chosen ? [chosen] : []) : m.subtypes);
      return;
    }
    case "setLandTypes":
      // CR 305.7: its old land types go, and so do the abilities from its rules text (its keywords are all printed ones
      // this early, layer 6 grants come later). Its basic land types give it their mana abilities (manaAbilitiesOn).
      // Card types and supertypes stay: a nonbasic land stays nonbasic, a land creature stays a creature.
      if (!c.types.includes("Land")) return;
      // Convincing Mirage's "the chosen type": the basic land type chosen as the source entered; none chosen, no change.
      if (m.subtypes.includes(CHOSEN_LAND_TYPE)) {
        const chosen = e.sourceId ? s.objects[e.sourceId]?.chosen?.landType : undefined;
        if (!chosen) return;
        c.subtypes = [...c.subtypes.filter((st) => subtypeSet(st) !== "Land"), ...m.subtypes.map((st) => (st === CHOSEN_LAND_TYPE ? chosen : st))];
      } else c.subtypes = [...c.subtypes.filter((st) => subtypeSet(st) !== "Land"), ...m.subtypes];
      c.hasPrintedAbilities = false;
      c.keywords = [];
      c.sparedBy = undefined;
      return;
    case "loseTypes":
      c.types = c.types.filter((t) => !m.types.includes(t));
      c.supertypes = c.supertypes.filter((t) => !m.types.includes(t)); // "isn't legendary" (Aeve), "is no longer snow" (Melting)
      c.subtypes = c.subtypes.filter((st) => !m.types.includes(subtypeSet(st) ?? "") && !m.subtypes?.includes(st));
      // Planeswalker types (CR 205.3j) aren't in a list of their own: no longer a planeswalker, it has none (CR 205.3d).
      if (m.types.includes("Planeswalker") && !c.types.includes("Battle")) c.subtypes = c.subtypes.filter((st) => subtypeSet(st) !== null);
      if (m.types.includes("Creature")) c.allCreatureTypes = false;
      return;
    case "loseCreatureTypes":
      c.subtypes = c.subtypes.filter((st) => subtypeSet(st) !== "Creature");
      c.allCreatureTypes = false;
      return;
    case "setName":
      // A text-changing effect (CR 123.6c, 613.1c): "named Legitimate Businessperson" (Witness Protection).
      c.name = m.name;
      return;
    case "setColors":
      // "~ is the chosen color" (Alloy Golem), "Enchanted land is the chosen color" (Shimmerwilds Growth): a static ability's,
      // the color chosen as its source entered (CR 614.12); with none chosen, nothing changes. (A resolved effect's color
      // is bound as it resolves, without `chosen`.)
      if (m.chosen === true) {
        const col = e.sourceId ? s.objects[e.sourceId]?.chosen?.color : undefined;
        if (col) c.colors = [col];
        return;
      }
      c.colors = [...m.colors];
      return;
    case "addColors":
      for (const col of m.colors) if (!c.colors.includes(col)) c.colors.push(col);
      return;
    case "addKeywords":
      // "Has protection from the chosen color": the color chosen as the source entered.
      // Empty-Shrine Kannushi: "protection from each color among permanents you control", the colors layer 5 left them.
      for (const k of bindChosenKeywords(m.keywords.includes(LINKED_TYPES_PROTECTION) || m.keywords.includes(YOURS_COLORS_PROTECTION) || m.keywords.some((k) => k.startsWith(LINKED_CARD_KEYWORD)) ? m.keywords.flatMap((k) => (k === LINKED_TYPES_PROTECTION ? linkedCardTypesProtection(s, e.sourceId) : k === YOURS_COLORS_PROTECTION ? colorsAmongYours(chars, controllerOfInst(e, chars)).map((col) => `Protection from ${COLOR_WORD[col]}`) : k.startsWith(LINKED_CARD_KEYWORD) ? linkedCardKeyword(s, e.sourceId, k.slice(LINKED_CARD_KEYWORD.length)) : [k])) : m.keywords, e.sourceId ? s.objects[e.sourceId]?.chosen?.color : undefined, m.keywords.includes(IDENTITY_PROTECTION) ? commandersIdentity(s, controllerOfInst(e, chars)) : undefined, e.sourceId ? s.objects[e.sourceId]?.chosen?.cardType : undefined, e.sourceId ? s.objects[e.sourceId]?.chosen?.type : undefined, e.sourceId ? s.objects[e.sourceId]?.chosen?.keywords : undefined, c.colors, e.sourceId ? s.objects[e.sourceId]?.chosen?.landType : undefined, e.sourceId ? s.objects[e.sourceId]?.chosen?.parity : undefined, e.sourceId ? s.objects[e.sourceId]?.chosen?.number : undefined)) {
        const key = k.toLowerCase();
        if (/^ward\b/i.test(k)) delete c.wardLost;
        if (!c.keywords.some((x) => sameCI(x, k))) {
          c.keywords.push(k);
          if (m.spares && e.sourceId) (c.sparedBy ??= {})[key] = m.spares === "auras" ? SPARES_AURAS : m.spares === "attached" ? `${SPARES_ATTACHED}${e.sourceId}` : e.sourceId;
        } else if (c.sparedBy?.[key] !== undefined) {
          // It has it from elsewhere too: an Aura is spared only if every effect giving it spares that Aura (White Ward
          // and Spectra Ward: White Ward stays, Spectra Ward goes, rulings). Benevolent Blessing's with another: only one
          // it's the same as (CR 702.16p, "those instances affect attached permanents as normal").
          const was = c.sparedBy[key]!;
          const now = m.spares && e.sourceId ? (m.spares === "auras" ? SPARES_AURAS : m.spares === "attached" ? `${SPARES_ATTACHED}${e.sourceId}` : e.sourceId) : undefined;
          const plain = (v: string) => !v.startsWith("*");
          const both = now === undefined ? undefined : was === now ? was : now === SPARES_AURAS && plain(was) ? was : was === SPARES_AURAS && plain(now) ? now : undefined;
          if (both === undefined) delete c.sparedBy[key];
          else c.sparedBy[key] = both;
        }
      }
      return;
    case "removeKeywords":
      // Losing hexproof loses each "hexproof from [quality]" too (CR 702.11e).
      // Losing protection or ward loses every one of them, whatever its quality or cost (Shay Cormac). "Landwalk" is every
      // landwalk ability (Hammerheim: "loses all landwalk abilities").
      c.keywords = c.keywords.filter((x) => !m.keywords.some((k) => sameCI(x, k) || (sameCI(k, "Hexproof") && /^hexproof from /i.test(x)) || (sameCI(k, "Protection") && /^protection from /i.test(x)) || (sameCI(k, "Ward") && /^ward\b/i.test(x)) || (sameCI(k, "Landwalk") && isLandwalk(x))));
      for (const k of m.keywords) if (c.sparedBy) delete c.sparedBy[k.toLowerCase()];
      if (c.sparedBy && m.keywords.some((k) => sameCI(k, "Protection"))) for (const k of Object.keys(c.sparedBy)) if (k.startsWith("protection from ")) delete c.sparedBy[k];
      if (m.keywords.some((k) => sameCI(k, "Ward"))) c.wardLost = true;
      // Flanking is a triggered ability as well as a keyword (CR 702.25a): every instance it has so far goes.
      if (m.keywords.some((k) => sameCI(k, "Flanking"))) {
        c.flankingLost = true;
        const keep = c.grantedAbilities.map((g) => g !== "Flanking");
        if (keep.includes(false)) {
          c.grantedAt = c.grantedAt?.filter((_, i) => keep[i]);
          c.grantedAbilities = c.grantedAbilities.filter((_, i) => keep[i]);
        }
      }
      return;
    case "cantHaveKeywords":
      c.cantHave = [...new Set([...(c.cantHave ?? []), ...m.keywords])];
      return;
    case "loseAllAbilities":
      // Abilities granted before this (earlier timestamps) go too; later ones stay (CR 613.7). So do the mana abilities
      // its basic land types give it (CR 305.6; Imprisoned in the Moon rulings).
      c.landAbilitiesLost = true;
      c.keywords = [];
      c.sparedBy = undefined;
      c.hasPrintedAbilities = false;
      c.grantedAbilities = [];
      c.grantedAt = undefined;
      c.unblockedDamage = false;
      c.cantBlock = false; // only abilities' "can't block" is set before the rules layer
      return;
    case "unblockedDamage":
      c.unblockedDamage = true;
      return;
    case "loseActivated":
      c.lostActivated = [...(c.lostActivated ?? []), m.index];
      return;
    case "loseStatic":
      c.lostStatics = [...(c.lostStatics ?? []), m.text];
      return;
    case "enchantCreature":
      c.enchantCreature = true;
      return;
    case "addAbility":
      if (/^ward\b/i.test(m.text)) delete c.wardLost;
      // An ability that names the permanent giving it ("Sacrifice Blazing Torch"): bound to that object (grants.ts).
      c.grantedAbilities.push(m.text.includes(QUOTED_SOURCE_NAME) && e.sourceId && s.objects[e.sourceId] ? bindGrantSource(m.text, e.sourceId, s.objects[e.sourceId]!.zoneChanges ?? 0, e.sourceName) : m.text);
      (c.grantedAt ??= []).push(e.timestamp);
      return;
    case "definePT":
      if (m.power !== undefined) c.power = num(m.power);
      if (m.toughness !== undefined) c.toughness = num(m.toughness);
      c.pt.push({ source: e.sourceName, kind: "set", power: c.power, toughness: c.toughness, untilEndOfTurn: false });
      return;
    case "linkedCreature": {
      const card = lastLinkedCreatureCard(s, e.sourceId);
      if (!card) return;
      if (m.part === "types") {
        const theirs = characteristics(s, card);
        setSubtypes(c, [...new Set([...theirs.subtypes.filter((st) => subtypeSet(st) === "Creature"), "Shapeshifter"])]);
        if (theirs.allCreatureTypes) c.allCreatureTypes = true;
        return;
      }
      // A "*" comes from the card's characteristic-defining ability, which works in exile (CR 604.3); effects that add
      // to or subtract from its power don't apply there (rulings).
      const d = defOf(s, card);
      const cda = compileCard(d).statics.find((st) => st.affects.kind === "self" && !st.condition && st.mods.some((x) => x.kind === "definePT"));
      const def = cda?.mods.find((x) => x.kind === "definePT") as Extract<Modification, { kind: "definePT" }> | undefined;
      const pt = (key: "power" | "toughness", printedN: number) => {
        if (/^\d+$/.test(d[key] ?? "0")) return printedN;
        const a = def?.[key];
        return a === undefined ? printedN : evalAmount(s, a, { controller: card.owner, sourceId: card.id, view: (o) => chars.get(o.id) });
      };
      c.power = pt("power", basePower(d));
      c.toughness = pt("toughness", baseToughness(d));
      c.pt.push({ source: e.sourceName, kind: "set", power: c.power, toughness: c.toughness, untilEndOfTurn: false });
      return;
    }
    case "setPT": {
      const [p, t] = [num(m.power), num(m.toughness)];
      c.power = p;
      c.toughness = t;
      c.pt.push({ source: e.sourceName, kind: "set", power: p, toughness: t, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "setToughness": {
      // Base power stays what it was after the earlier 7a/7b effects (CR 613.4b).
      c.toughness = num(m.toughness);
      c.pt.push({ source: e.sourceName, kind: "set", power: c.power, toughness: c.toughness, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "setPower": {
      // Evra: its toughness stays what it was after the earlier 7a/7b effects (CR 613.4b).
      c.power = num(m.power);
      c.pt.push({ source: e.sourceName, kind: "set", power: c.power, toughness: c.toughness, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "modifyPT": {
      const [p, t] = [num(m.power), num(m.toughness)];
      c.power += p;
      c.toughness += t;
      c.pt.push({ source: e.sourceName, kind: "modify", power: p, toughness: t, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "switchPT":
      [c.power, c.toughness] = [c.toughness, c.power];
      c.pt.push({ source: e.sourceName, kind: "switch", power: c.power, toughness: c.toughness, untilEndOfTurn: e.untilEndOfTurn });
      return;
    case "cantAttack":
      c.cantAttack = true;
      return;
    case "cantBlock":
      c.cantBlock = true;
      return;
    case "cantBeAttacked":
      c.cantBeAttacked = true;
      return;
    case "cantBeBlocked":
      c.cantBeBlocked = true;
      return;
    case "doesntUntap":
      if (m.unlessMonarch && s.monarch === c.controller) return;
      c.doesntUntap = true;
      return;
    case "cantBecomeUntapped":
      c.doesntUntap = true;
      c.cantBecomeUntapped = true;
      return;
    case "cantBeSuspected":
      c.cantBeSuspected = true;
      return;
    case "untapsDuringOthers":
      c.untapsDuringOthers = true;
      return;
    case "blockTax":
      c.blockTax += m.n;
      return;
    case "blockLifeTax":
      c.blockLifeTax = [...c.blockLifeTax, { n: m.n, notColor: m.notColor }];
      return;
    case "ownAttackCost":
      c.ownAttackCosts = [...c.ownAttackCosts, { action: m.action, filter: m.filter, n: m.n }];
      return;
    case "ownBlockTaxVs":
      c.ownBlockTaxVs = [...c.ownBlockTaxVs, { n: m.n, minPower: m.minPower }];
      return;
    case "ownAttackTax":
    case "ownBlockTax": {
      // Phyrexian Marauder, Myr Prototype: {1} for each +1/+1 counter on it now (its counters invalidate the
      // characteristics); Cowed by Wisdom: {1} for each card in its controller's hand, counted now.
      const n = m.amount !== undefined ? m.n * Math.max(0, num(m.amount)) : m.perPlusOne ? m.n * Math.max(0, s.objects[id]?.counters["+1/+1"] ?? 0) : m.n;
      if (m.kind === "ownAttackTax") c.ownAttackTax += n;
      else c.ownBlockTax += n;
      return;
    }
    case "attackTax": {
      if (m.perCounter) {
        c.attackTaxCounters++;
        if (m.planeswalkers) c.attackTaxCountersPlaneswalkers++;
        return;
      }
      const n = m.amount !== undefined ? Math.max(0, num(m.amount)) : m.n;
      if (m.unlessColor) {
        c.attackTaxUnlessColor = [...c.attackTaxUnlessColor, { n, color: m.unlessColor }];
        return;
      }
      if (!m.onlyPlaneswalkers) c.attackTax += n;
      if (m.planeswalkers || m.onlyPlaneswalkers) c.attackTaxPlaneswalkers += n;
      if (m.mana) c.attackTaxMana = [...c.attackTaxMana, m.mana];
      if (m.mana && m.planeswalkers) c.attackTaxManaPlaneswalkers = [...c.attackTaxManaPlaneswalkers, m.mana];
      return;
    }
    case "blocksOnlyFlyers":
      c.blocksOnlyFlyers = true;
      return;
    case "mustBeBlocked":
      if (m.combat !== undefined && m.combat !== (s.combatsThisTurn ?? 0)) return;
      if (m.by) c.mustBeBlockedBy = [...(c.mustBeBlockedBy ?? []), m.by];
      else c.mustBeBlocked = true;
      return;
    case "attacksIfAble":
      if (m.combat !== undefined && m.combat !== (s.combatsThisTurn ?? 0)) return;
      if (m.combatKey !== undefined && m.combatKey !== s.thatCombat) return;
      // Trench Behemoth: only in that player's combats, not the one going on as it resolved.
      if (m.turnOf !== undefined && (m.turnOf !== s.activePlayer || (m.notCombat && m.notCombat.turn === s.turn && m.notCombat.combat === (s.combatsThisTurn ?? 0)))) return;
      c.attacksIfAble = true;
      return;
    case "mustAttackMostLife":
      c.mustAttackMostLife = true;
      return;
    case "mustAttackPlayer":
      if (m.player === "enchantedController") {
        // Public Enemy: the enchanted creature's controller now (layer 2 is done); not one of that player's own creatures.
        const host = e.sourceId ? s.objects[e.sourceId]?.attachedTo : undefined;
        const who = host !== undefined && s.objects[host]?.zone === "battlefield" ? (chars.get(host)?.controller ?? s.objects[host]!.controller) : undefined;
        if (who !== undefined && who !== c.controller && !c.mustAttack.includes(who)) c.mustAttack.push(who);
        return;
      }
      if (m.player === "chosen" || m.player === "you" || typeof m.player === "object" || (m.combat !== undefined && m.combat !== (s.combatsThisTurn ?? 0))) return;
      if (!c.mustAttack.includes(m.player)) c.mustAttack.push(m.player);
      return;
    case "cantBeBlockedBy":
      c.cantBeBlockedBy.push(m.filter);
      return;
    case "cantBeBlockedIfDefendingControls":
      c.cantBeBlockedIfDefending = [...(c.cantBeBlockedIfDefending ?? []), m.filter];
      return;
    case "untargetable":
      c.untargetable = [...(c.untargetable ?? []), { ...m.by, of: e.controller ?? (e.sourceId ? chars.get(e.sourceId)?.controller : undefined) ?? c.controller }];
      return;
    case "preventDamage": {
      const { kind: _, fromChosenColor, ...p0 } = m;
      // Prismatic Ward: the color its source's controller chose as it entered (CR 614.12).
      const chosenCol = fromChosenColor && e.sourceId ? s.objects[e.sourceId]?.chosen?.color : undefined;
      const p = fromChosenColor ? { ...p0, fromColors: chosenCol ? [chosenCol] : [] } : p0;
      c.preventDamage = [...(c.preventDamage ?? []), p.plusOnes || p.reflect ? { ...p, you: controllerOfInst(e, chars), from: e.sourceId ?? "" } : p];
      return;
    }
    case "unpreventable":
      if (c.unpreventable !== "all") c.unpreventable = m.combat ? "combat" : "all";
      return;
    case "damageMod":
      c.damageMods = [...(c.damageMods ?? []), { ...m.mod, you: controllerOfInst(e, chars), from: e.sourceId ?? "" }];
      return;
    case "blockableOnlyBy":
      c.blockableOnlyBy = [...(c.blockableOnlyBy ?? []), { filters: m.filters, text: m.text }];
      return;
    case "cantBlockCreatures": {
      // "Can't block creatures you control" (Spectral Grasp): the effect's controller's creatures.
      const { controller: who, ...rest } = m.filter;
      c.cantBlockCreatures.push(who === "you" ? { ...rest, controlledBy: controllerOfInst(e, chars) } : m.filter);
      return;
    }
    case "maxOneBlocker":
      c.maxOneBlocker = true;
      return;
    case "cantActivate":
      if (m.tapCost) c.cantActivateTap = true;
      else if (c.cantActivate !== "all") c.cantActivate = m.exceptMana ? "nonMana" : "all";
      return;
    case "goad": {
      const by = controllerOfInst(e, chars);
      if (!c.goadedBy.includes(by)) c.goadedBy.push(by);
      if (!m.notGoaded) c.goaded = true;
      c.attacksIfAble = true;
      return;
    }
    case "minBlockers":
      c.minBlockers = Math.max(c.minBlockers, m.n);
      return;
    case "blockedOnlyByAll":
      c.blockedOnlyByAll = true;
      return;
    case "cantAttackUnless":
      c.attackUnless.push(m.defenderControls);
      return;
    case "cantAttackUnlessDefenderYard":
      c.attackUnlessYard = Math.max(c.attackUnlessYard ?? 0, m.n);
      return;
    case "cantAttackUnlessDefenderIs":
      if (!c.attackUnlessDefenderIs?.includes(m.is)) c.attackUnlessDefenderIs = [...(c.attackUnlessDefenderIs ?? []), m.is];
      return;
    case "cantAttackIf":
      (c.attackIfNot ??= []).push(m.defenderControls);
      return;
    case "cantAttackUnlessAlso":
      c.attackOnlyWith = [...(c.attackOnlyWith ?? []), m.filter];
      return;
    case "cantAttackUnlessOthers":
      c.attackWithOthers = Math.max(c.attackWithOthers ?? 0, m.n);
      return;
    case "cantBlockUnlessOthers":
      c.blockWithOthers = Math.max(c.blockWithOthers ?? 0, m.n);
      return;
    case "cantAttackUnlessGreater":
      c.attackWithGreater = true;
      return;
    case "cantBlockUnlessGreater":
      c.blockWithGreater = true;
      return;
    case "cantAttackUnlessMore":
      if (!c.attackUnlessMore?.includes(m.what)) c.attackUnlessMore = [...(c.attackUnlessMore ?? []), m.what];
      return;
    case "cantBeBlockedByPowerBelow":
      c.cantBeBlockedByPowerBelow = Math.max(c.cantBeBlockedByPowerBelow ?? -Infinity, num(m.amount));
      return;
    case "cantBeBlockedByLesserPower":
      if (m.than === "source") {
        if (e.sourceId && !c.cantBeBlockedByLesserPowerThan.includes(e.sourceId)) c.cantBeBlockedByLesserPowerThan.push(e.sourceId);
      } else c.cantBeBlockedByLesserPower = true;
      return;
    case "cantBeSacrificedBy":
      if (m.player !== "you" && !c.cantBeSacrificedBy.includes(m.player)) c.cantBeSacrificedBy.push(m.player);
      return;
    case "cantAttackPlayers":
      if (typeof m.combat === "number" && m.combat !== (s.combatsThisTurn ?? 0)) return;
      if (Array.isArray(m.players)) for (const pid of m.players) if (!c.cantAttackPlayers.includes(pid)) c.cantAttackPlayers.push(pid);
      return;
    case "cantAttackYou": {
      if (m.combatKey !== undefined && m.combatKey !== s.thatCombat) return;
      const you = controllerOfInst(e, chars);
      const list = m.playerOnly ? c.cantAttackPlayersOnly : c.cantAttackPlayers;
      if (!list.includes(you)) list.push(you);
      return;
    }
    case "cantBeEnchantedByOthers":
      if (e.sourceId !== undefined) c.enchantedOnlyBy = [...c.enchantedOnlyBy, e.sourceId];
      return;
    case "cantBeBlockedByGreaterPower":
    case "cantBlockGreaterPower":
    case "cantBlockPowerAtLeastToughness":
    case "cantAttackAlone":
    case "onlyAttacksAlone":
    case "cantBlockAlone":
    case "cantAttackSamePlayer":
    case "cantBeSacrificed":
    case "cantTurnFaceUp":
    case "cantTransform":
    case "cantPhaseOut":
    case "cantCrew":
    case "cantBeEquipped":
    case "attackAsThoughHaste":
    case "mustBlock":
    case "mustBlockEach":
      c[m.kind] = true;
      return;
    case "allMustBlock":
      if (m.by) c.allMustBlockBy = [...(c.allMustBlockBy ?? []), m.by];
      else c.allMustBlock = true;
      return;
    case "cantAttackOwner":
      c.cantAttackOwner = true;
      if (m.planeswalkers) c.cantAttackOwnerWalkers = true;
      return;
    case "attackDespiteDefender":
      if (m.vsAttackedYou) c.attackDespiteDefenderVs = true;
      else c.attackDespiteDefender = true;
      return;
    case "blockAsThough":
      if (m.walk) c.blocksLandwalkers = true;
      if (m.shadow && m.notShadow) c.blocksShadowAsNone = true;
      else if (m.shadow) c.blocksShadow = true;
      if (m.reachVs) (c.reachVs ??= []).push(m.reachVs);
      return;
    case "assignsToughness":
      if (m.ifGreater) c.assignsToughnessIfGreater = true;
      else c.assignsToughness = true;
      return;
    case "assignsAbsPower":
      c.assignsAbsPower = true;
      return;
    case "blockAdditional":
      c.extraBlocks += m.per !== undefined ? num(m.per) : m.n;
      return;
    case "blockAny":
      c.blockAny = true;
      return;
  }
}

const modsIn = (e: Inst, layer: Layer) => e.mods.filter((m) => layerOf(m) === layer);

/** Apply an effect's parts for one layer. With `lock`, its affected set is fixed from now on (CR 613.6). */
function applyInLayer(s: GameState, e: Inst, layer: Layer, chars: CharMap, lock: boolean) {
  const ids = appliesTo(s, e, chars);
  if (lock && !e.locked) e.locked = ids;
  for (const id of ids) for (const m of modsIn(e, layer)) applyMod(s, chars.get(id)!, m, e, chars, id);
}

/**
 * Mods that can change what another effect exists for or applies to. Effects only look at
 * controller, types, colors, and whether a source still has its abilities, so only these
 * can create a dependency (CR 613.8a).
 */
// Goading too: whether a creature is goaded (CR 701.15) decides what "goaded creatures your opponents control can't block"
// applies to (Bothersome Quasit), whatever the order the two came in.
const CAN_CREATE_DEPENDENCY = new Set<Modification["kind"]>(["control", "addTypes", "setTypes", "setSubtypes", "setLandTypes", "loseTypes", "loseCreatureTypes", "setColors", "addColors", "loseAllAbilities", "goad"]);

/**
 * An "as long as it has defender" condition (Manor Gargoyle, Solid Footing) is about keywords, so it depends on effects
 * that give or take them away (CR 613.8a). Only these are checked, which keeps layer 6 quick.
 */
function readsKeywords(e: Inst): boolean {
  const c = e.condition;
  return ((c?.kind === "selfIs" || c?.kind === "attachedIs") && !!c.filter.keywords?.length) || readsAbilities(e);
}

/**
 * Ruxa, Patient Professor's "for each creature you control with no abilities, you may have that creature assign its combat
 * damage as though it weren't blocked" applies in layer 6 to what has no abilities, so it depends on the effects there that
 * give or take abilities (CR 613.8a).
 */
const readsAbilities = (e: Inst) => e.affects?.kind === "filter" && !!e.affects.spec?.noAbilities;
const GIVES_ABILITIES = new Set<Modification["kind"]>(["addAbility", "enchantCreature", "cantHaveKeywords"]);

function signature(s: GameState, e: Inst, chars: CharMap): string {
  if (!exists(s, e, chars)) return "gone";
  return `${controllerOfInst(e, chars)}|${appliesTo(s, e, chars).join(",")}`;
}

/**
 * Does `a` depend on `b` (CR 613.8a)? It does if applying `b` would change whether `a`
 * exists, what it applies to, or what it does. Effects with a locked-in set of objects
 * from a resolved spell can't depend on anything.
 */
function dependsOn(s: GameState, a: Inst, b: Inst, layer: Layer, chars: CharMap): boolean {
  if (a.locked || a.fixed) return false;
  if (!modsIn(b, layer).some((m) => CAN_CREATE_DEPENDENCY.has(m.kind) || ((m.kind === "addKeywords" || m.kind === "removeKeywords") && readsKeywords(a)) || (GIVES_ABILITIES.has(m.kind) && readsAbilities(a)))) return false;
  if (!b.locked && !exists(s, b, chars)) return false;
  const trial: CharMap = new Map(chars);
  for (const id of appliesTo(s, b, chars)) trial.set(id, copyChars(chars.get(id)!));
  applyInLayer(s, { ...b }, layer, trial, false);
  return signature(s, a, chars) !== signature(s, a, trial);
}

/**
 * Static abilities effects gave permanents (Criminal Past's 'Commander creatures you own have "This creature gets +X/+0,
 * where X is ..."', Inspiring Leader's '"Creature tokens you control get +2/+2"'), once layer 6 has settled which
 * permanents have them. Only those whose effects all come in later layers can be granted (grants.ts grantedStaticOk).
 * Each has the later of its permanent's timestamp and the granting effect's (CR 613.7a). Whether one counts something
 * goes in `counted`, for the cache.
 */
function grantedStatics(s: GameState, chars: CharMap, order: number, counted: { yes: boolean }): Inst[] {
  const out: Inst[] = [];
  for (const [id, c] of chars)
    c.grantedAbilities.forEach((text, i) =>
      compileGranted(text).statics.forEach((st, j) => {
        if (countsSomething(st)) counted.yes = true;
        out.push({
          key: `${id}^${i}#${j}`,
          timestamp: Math.max(s.objects[id]!.timestamp, c.grantedAt?.[i] ?? 0),
          order: order++,
          sourceId: id,
          sourceName: c.name,
          untilEndOfTurn: false,
          // A granted "This creature's power and toughness are each equal to ..." isn't a characteristic-defining ability
          // (CR 604.3a): it sets them in layer 7b (613.4b), so a later one overrides it (rulings on Chimeric Mass).
          mods: st.mods.map((m) => (m.kind === "definePT" ? { kind: "setPT", power: m.power!, toughness: m.toughness! } : m)),
          affects: st.affects,
          condition: st.condition,
          granted: true,
          grantedText: text,
        });
      }),
    );
  return out;
}

function computeAll(s: GameState, counted = { yes: false }, grants: OffFieldGrant[] = []): CharMap {
  // Cards and spells outside the battlefield read the off-battlefield type changes (offFieldTyped) while this runs: none
  // until layer 4 is done, then those that applied in it, so counts in layer 7 see them (CR 613.1d, 613.4).
  const outer = building;
  building = { grants: [] };
  try {
    return computeLayers(s, counted, grants);
  } finally {
    building = outer;
  }
}

function computeLayers(s: GameState, counted: { yes: boolean }, grants: OffFieldGrant[]): CharMap {
  const chars: CharMap = new Map();
  for (const id of s.battlefield) chars.set(id, printed(s, s.objects[id]!));
  let insts = gather(s).sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
  // Granted static abilities already taken in (in layer 6, those that give keywords), by key.
  const grantedKeys = new Set<string>();
  for (const layer of LAYERS) {
    if (layer === "7a") {
      const more = grantedStatics(s, chars, insts.length, counted).filter((e) => !grantedKeys.has(e.key));
      if (more.length) insts = [...insts, ...more].sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
    }
    // Suspend's "it gains haste until you lose control of the spell or the permanent it becomes" (CR 702.62a): from
    // when it was cast, so before the other layer 6 effects; only while its caster controls it (layer 2 is done).
    if (layer === "6")
      for (const [id, c] of chars) {
        const o = s.objects[id]!;
        if (o.suspendHaste !== undefined && o.suspendHaste === c.controller && !c.keywords.includes("Haste")) c.keywords.push("Haste");
      }
    let rem = insts.filter((e) => modsIn(e, layer).length && (e.locked || exists(s, e, chars)));
    while (rem.length) {
      // CR 613.8b-c: apply the earliest effect that doesn't wait on another; re-evaluate after each.
      // In a dependency loop, timestamp order wins.
      const pick = rem.find((a) => !rem.some((b) => b !== a && dependsOn(s, a, b, layer, chars))) ?? rem[0]!;
      rem = rem.filter((e) => e !== pick);
      if (!pick.locked && !exists(s, pick, chars)) continue; // an earlier effect in this layer removed it
      applyInLayer(s, pick, layer, chars, true);
      // Dancer's Chakrams: 'has "Other commanders you control get +2/+2 and have lifelink"': a granted static ability that
      // gives keywords exists once the effect granting it has applied, so it depends on that one (CR 613.8a) and joins
      // the rest of layer 6 from then on, in timestamp order (613.8b); its later layers apply as usual.
      if (layer === "6") {
        const more = grantedStatics(s, chars, insts.length, counted).filter((e) => !grantedKeys.has(e.key) && modsIn(e, "6").length);
        for (const e of more) grantedKeys.add(e.key);
        if (more.length) {
          insts = [...insts, ...more].sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
          rem = [...rem, ...more.filter((e) => exists(s, e, chars))].sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
        }
      }
      // Once it applies in layer 4 it keeps applying, even if its source loses the ability in layer 6 (CR 613.6).
      // Secret Arcade: its controller's permanent spells too.
      if (pick.offFieldSpells && layer === "4" && pick.sourceId)
        grants.push({ sourceId: pick.sourceId, controller: chars.get(pick.sourceId)?.controller ?? s.objects[pick.sourceId]!.controller, timestamp: pick.timestamp, mods: modsIn(pick, "4"), permanentSpells: true });
      if (pick.offField && layer === "4" && pick.sourceId)
        grants.push({ sourceId: pick.sourceId, controller: chars.get(pick.sourceId)?.controller ?? s.objects[pick.sourceId]!.controller, timestamp: pick.timestamp, mods: modsIn(pick, "4"), chosen: s.objects[pick.sourceId]?.chosen?.type });
      // Dune Chanter: its controller's land cards outside the battlefield too.
      if (pick.offFieldLands && layer === "4" && pick.sourceId)
        grants.push({ sourceId: pick.sourceId, controller: chars.get(pick.sourceId)?.controller ?? s.objects[pick.sourceId]!.controller, timestamp: pick.timestamp, mods: modsIn(pick, "4"), lands: true });
      // Mycosynth Lattice: as it applied in layer 5, to every card and spell outside the battlefield too.
      if (pick.offFieldAll && layer === "5" && pick.sourceId)
        grants.push({ sourceId: pick.sourceId, controller: chars.get(pick.sourceId)?.controller ?? s.objects[pick.sourceId]!.controller, timestamp: pick.timestamp, mods: modsIn(pick, "5"), everyone: true });
    }
    // "Can't have hexproof or shroud": gone whatever gave them, after every layer 6 effect.
    if (layer === "6")
      for (const c of chars.values())
        if (c.cantHave) c.keywords = c.keywords.filter((x) => !c.cantHave!.some((k) => sameCI(x, k) || (sameCI(k, "Hexproof") && /^hexproof from /i.test(x))));
    if (layer === "4") building!.grants = grants;
    if (layer === "7c") {
      // Counters apply in 7c (CR 613.4c). Everything in 7c adds up, so order doesn't matter.
      for (const [id, c] of chars) {
        const o = s.objects[id]!;
        const [dp, dt] = ptFromCounters(o);
        if (!dp && !dt) continue;
        c.power += dp;
        c.toughness += dt;
        c.pt.push({ source: "counters", kind: "counters", power: dp, toughness: dt, untilEndOfTurn: false });
      }
    }
  }
  return chars;
}

// ---------------------------------------------------------------------------
// Cache. Computing every permanent at once is needed (effects look at each other), so the
// result is cached per state and thrown away whenever something that matters changes.

type CountSig = (string | number | boolean | undefined)[];
const cache = new WeakMap<GameState, { map: CharMap; sig?: CountSig; grants: OffFieldGrant[] }>();
let cacheEnabled = true;

/**
 * Static abilities that count things ("+1/+1 for each card in your hand", Death's Shadow's life
 * total) can change without anything that invalidates the cache happening: a draw, a life change,
 * tapping. When the cached result used such a count, it's only good while these stay the same.
 * `countSignature` records them; `sameCounts` compares them with a recorded signature in the same order, stopping at
 * the first difference and building nothing: it runs on every characteristics() read while such a static is around,
 * hundreds of thousands of times a game. The two must read the same things in the same order.
 */
function countSignature(s: GameState): CountSig {
  const sig: CountSig = [];
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    // The mana pool too, for "for each unspent green mana you have" (Omnath, Locus of Mana).
    // The top card of the library too, for "as long as the top card of your library is black" (Vampire Nocturnus).
    // The exile too, for "instant and sorcery cards you own in exile" (Crackling Drake).
    sig.push(p.life, p.hand.length, p.library.length, p.library[0], p.graveyard.length, p.exile.length);
    const pool = p.manaPool as Record<string, number | undefined>;
    let keys = 0;
    for (const k in pool) {
      keys++;
      sig.push(pool[k]);
    }
    sig.push(keys);
  }
  sig.push(s.battlefield.length);
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    // Tapped, attacking and blocking; enchanted, equipped and modified creatures (TargetSpec.status): what's attached
    // to what, and counters.
    let n = 0;
    for (const k in o.counters) n += o.counters[k] ?? 0;
    sig.push(id, !!o.tapped, o.attacking !== undefined, !!o.blocking, o.attachedTo, n);
  }
  sig.push(s.activePlayer, s.turn); // and "this turn" conditions start over each turn
  return sig;
}

function sameCounts(s: GameState, sig: CountSig): boolean {
  let i = 0;
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    if (sig[i] !== p.life || sig[i + 1] !== p.hand.length || sig[i + 2] !== p.library.length || sig[i + 3] !== p.library[0] || sig[i + 4] !== p.graveyard.length || sig[i + 5] !== p.exile.length) return false;
    i += 6;
    const pool = p.manaPool as Record<string, number | undefined>;
    let keys = 0;
    for (const k in pool) {
      keys++;
      if (sig[i++] !== pool[k]) return false;
    }
    if (sig[i++] !== keys) return false;
  }
  if (sig[i++] !== s.battlefield.length) return false;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (sig[i] !== id || sig[i + 1] !== !!o.tapped || sig[i + 2] !== (o.attacking !== undefined) || sig[i + 3] !== !!o.blocking || sig[i + 4] !== o.attachedTo) return false;
    let n = 0;
    for (const k in o.counters) n += o.counters[k] ?? 0;
    if (sig[i + 5] !== n) return false;
    i += 6;
  }
  return sig[i] === s.activePlayer && sig[i + 1] === s.turn && i + 2 === sig.length;
}

const isCounted = (a: Amount) => typeof a !== "number";
/** Does a static ability count something, or look at something that changes without invalidating the cache? */
function countsSomething(st: StaticAbility): boolean {
  if (st.condition) return true; // "as long as": attacking, tapped lands, the graveyard, whose turn it is
  if (st.affects.kind === "filter" && (st.affects.spec?.combat || st.affects.spec?.tapped !== undefined || st.affects.spec?.status)) return true; // "attacking/untapped/modified creatures you control"
  for (const m of st.mods) {
    if (m.kind === "definePT" || m.kind === "linkedCreature") return true;
    if ((m.kind === "modifyPT" || m.kind === "setPT") && (isCounted(m.power) || isCounted(m.toughness))) return true;
    if (m.kind === "setToughness" && isCounted(m.toughness)) return true;
    if (m.kind === "attackTax" && m.amount !== undefined && isCounted(m.amount)) return true;
  }
  return false;
}

/** Does any static ability on the battlefield count something? */
function usesCounts(s: GameState): boolean {
  return (
    s.battlefield.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some(countsSomething)) ||
    liveEmblems(s).some((o) => compileCard(defOf(s, o)).statics.some(countsSomething)) ||
    s.turnOrder.some((pid) => s.players[pid]!.graveyard.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some((st) => st.zone === "graveyard" && countsSomething(st))))
  );
}

/** Turn the cache off to check that invalidation is complete (tests compare both ways). */
export function setCharacteristicsCache(on: boolean) {
  cacheEnabled = on;
}

/** Call after anything that could change characteristics: zones, counters, effects, attachments. */
export function invalidateCharacteristics(s: GameState) {
  cache.delete(s);
}

export function characteristics(s: GameState, o: GameObject): Characteristics {
  if (o.zone !== "battlefield") return withCounters(o, printed(s, o));
  let hit = cacheEnabled ? cache.get(s) : undefined;
  if (hit?.sig !== undefined && !sameCounts(s, hit.sig)) hit = undefined;
  if (!hit || !hit.map.has(o.id)) {
    const counted = { yes: false };
    const grants: OffFieldGrant[] = [];
    hit = { map: computeAll(s, counted, grants), grants };
    if (cacheEnabled) cache.set(s, hit);
    // Looking at the graveyard's cards reads their types, which these grants change.
    const outer = building;
    building = { grants };
    try {
      if (counted.yes || usesCounts(s)) hit.sig = countSignature(s);
    } finally {
      building = outer;
    }
  }
  return hit.map.get(o.id) ?? printed(s, o);
}

/**
 * A card outside the battlefield with counters on it (an effect put them there, CR 122.2): a keyword counter gives it that
 * keyword (CR 122.1b), and +1/+1 and -1/-1 counters change a creature card's power and toughness (CR 122.1a).
 */
function withCounters(o: GameObject, c: Characteristics): Characteristics {
  for (const [kind, n] of Object.entries(o.counters)) {
    const kw = (n ?? 0) > 0 ? keywordOfCounter(kind) : undefined;
    if (kw && !c.keywords.some((k) => sameCI(k, kw))) c.keywords.push(kw);
  }
  const [dp, dt] = ptFromCounters(o);
  if ((dp || dt) && c.types.includes("Creature")) {
    c.power += dp;
    c.toughness += dt;
    c.pt.push({ source: "counters", kind: "counters", power: dp, toughness: dt, untilEndOfTurn: false });
  }
  return c;
}

// ---------------------------------------------------------------------------
// Type changes outside the battlefield: "Creatures you control are every creature type. The same is true for creature
// spells you control and creature cards you own that aren't on the battlefield" (Maskwood Nexus, Conspiracy, Arcane
// Adaptation). Such a card's or spell's creature types are its card's, changed by these effects in timestamp order
// (CR 613.1d, 613.7); the definition it reads through (defOf) carries them, so every filter on cards and spells sees
// them. Changeling applies first, as a characteristic-defining ability (CR 613.3, Maskwood rulings).

/** A static ability changing creature types outside the battlefield, as it applied in layer 4. */
interface OffFieldGrant {
  sourceId: ObjectId;
  controller: PlayerId;
  timestamp: number;
  mods: Modification[];
  /** The creature type chosen as its source entered. */
  chosen?: string;
  /** A color change for every card and spell outside the battlefield (Mycosynth Lattice), not only its controller's. */
  everyone?: true;
  /** A type change for its controller's permanent spells only (Secret Arcade): card types too. */
  permanentSpells?: true;
  /** A type change for land cards its controller owns outside the battlefield (Dune Chanter). */
  lands?: true;
}

let building: { grants: OffFieldGrant[] } | undefined;

/** Does anything on the battlefield have such an ability? (Cheap: compiled cards are cached.) */
const offFieldSources = (s: GameState) => s.battlefield.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some((st) => st.offField || st.offFieldAll || st.offFieldSpells || st.offFieldLands));

function offFieldGrants(s: GameState): OffFieldGrant[] {
  if (building) return building.grants;
  const hit = cacheEnabled ? cache.get(s) : undefined;
  if (hit) return hit.grants;
  if (!offFieldSources(s)) return [];
  const first = s.battlefield[0];
  if (first) characteristics(s, s.objects[first]!);
  const after = cache.get(s);
  if (after) return after.grants;
  const grants: OffFieldGrant[] = [];
  computeAll(s, { yes: false }, grants);
  return grants;
}

/** Changeling (CR 702.73a), or Mistform Ultimus's "~ is every creature type" (a characteristic-defining ability that works
 * in every zone, CR 604.3, rulings), unless an effect outside the battlefield set the card's creature types. */
export const everyCreatureType = (d: CardDef): boolean => d.everyCreatureType ?? (d.keywords.includes("Changeling") || isEveryCreatureTypeText(d));

const typedDefs = new Map<string, CardDef>();

/**
 * `d`, the definition of `o` (a card or spell outside the battlefield), with the creature types effects outside the
 * battlefield give it: creature spells its controller controls, creature cards its owner owns (not tokens, which can't
 * stay there, CR 111.7). Anything else is `d` itself.
 */
export function offFieldTyped(s: GameState, o: GameObject, d: CardDef): CardDef {
  // A phased-out permanent and a merged permanent's other cards are still on the battlefield (CR 702.26d, 730.2).
  if (o.zone === "battlefield" || o.zone === "phasedOut" || o.zone === "merged") return d;
  // Secret Arcade: "permanent spells you control are enchantments in addition to their other types" (CR 110.4b: a spell
  // of a permanent card type), card types as well as subtypes.
  const spells = o.zone === "stack" && PERMANENT_CARD_TYPES.some((t) => d.types.includes(t)) ? offFieldGrants(s).filter((g) => g.permanentSpells && o.controller === g.controller) : [];
  // Dune Chanter: land cards its controller owns (a land is played, never cast: CR 305.1; tokens can't stay there).
  const lands = d.types.includes("Land") && o.zone !== "stack" && !o.isToken ? offFieldGrants(s).filter((g) => g.lands && o.owner === g.controller) : [];
  if (!d.types.includes("Creature") && !spells.length && !lands.length) return d;
  const gs: { timestamp: number; mods: Modification[]; chosen?: string }[] = d.types.includes("Creature") ? offFieldGrants(s).filter((g) => !g.everyone && !g.permanentSpells && !g.lands && (o.zone === "stack" ? o.controller === g.controller : o.owner === g.controller && !o.isToken)) : [];
  gs.push(...lands);
  // The Tomb of Aclazotz: a creature spell cast with its permission "is a Vampire in addition to its other types" (rulings:
  // on the stack too).
  if (o.zone === "stack" && d.types.includes("Creature")) for (const g of o.spellGains ?? []) if (g.mods.some((m) => m.kind === "addTypes")) gs.push(g);
  gs.push(...spells);
  if (!gs.length) return d;
  let subtypes = [...d.subtypes];
  const types = [...d.types];
  let all = everyCreatureType(d);
  for (const g of [...gs].sort((a, b) => a.timestamp - b.timestamp))
    for (const m of g.mods) {
      if (m.kind === "addTypes") {
        if (m.allCreatureTypes) all = true;
        for (const t of m.types) if (!types.includes(t)) types.push(t);
        for (const t of [...m.subtypes, ...(m.chosenType && g.chosen ? [g.chosen] : [])]) if (!subtypes.includes(t)) subtypes.push(t);
      } else if (m.kind === "setSubtypes") {
        const now = m.chosenType ? (g.chosen ? [g.chosen] : []) : m.subtypes;
        if (!now.length) continue;
        subtypes = [...subtypes.filter((t) => subtypeSet(t) !== "Creature"), ...now];
        all = false;
      }
    }
  if (all === everyCreatureType(d) && types.length === d.types.length && subtypes.length === d.subtypes.length && subtypes.every((t, i) => t === d.subtypes[i])) return d;
  const key = `${d.oracleId}|${d.name}|${all}|${types.join(",")}|${subtypes.join(",")}`;
  let out = typedDefs.get(key);
  if (!out) typedDefs.set(key, (out = { ...d, types, subtypes, everyCreatureType: all }));
  return out;
}

const coloredDefs = new Map<string, CardDef>();

/**
 * `d`, the definition of `o` outside the battlefield, with the colors effects that apply to every card and spell there
 * give it (Mycosynth Lattice: colorless, CR 613.1e), and a spell the colors effects on it give it (Lifelace), the latest one
 * last (CR 613.7). Anything else is `d` itself.
 */
export function offFieldColored(s: GameState, o: GameObject, d: CardDef): CardDef {
  if (o.zone === "battlefield" || o.zone === "phasedOut" || o.zone === "merged") return d;
  const gs: { timestamp: number; mods: Modification[] }[] = offFieldGrants(s).filter((g) => g.everyone);
  // The Laces: "target spell becomes green", while it's that spell (CR 105.3, 613.1e).
  if (o.zone === "stack") for (const g of o.spellGains ?? []) if (g.mods.some((m) => m.kind === "setColors" || m.kind === "addColors")) gs.push(g);
  if (!gs.length) return d;
  let colors = [...d.colors];
  for (const g of [...gs].sort((a, b) => a.timestamp - b.timestamp))
    for (const m of g.mods) {
      if (m.kind === "setColors") colors = [...m.colors];
      else if (m.kind === "addColors") colors = [...colors, ...m.colors.filter((c) => !colors.includes(c))];
    }
  if (colors.length === d.colors.length && colors.every((c, i) => c === d.colors[i])) return d;
  const key = `${d.oracleId}|${d.name}|${d.subtypes.join(",")}|${d.everyCreatureType ?? ""}|${colors.join("")}`;
  let out = coloredDefs.get(key);
  if (!out) coloredDefs.set(key, (out = { ...d, colors }));
  return out;
}

/** Re-entry guard for offFieldDefinedPT: a count that reads the card itself (Tarmogoyf in a graveyard) sees its own values. */
const definingPT = new Set<ObjectId>();

/**
 * `d`, the definition of `o` outside the battlefield, with the power and toughness its characteristic-defining ability
 * gives it: a "*" works in every zone (CR 604.3, 208.2a), so a Lhurgoyf in a graveyard or a hand has the power its ability
 * counts, with its owner as "you" (CR 109.5; a spell's controller on the stack). Anything else is `d` itself. While the
 * layer system is being worked out (`building`) this is `d` too: counting there would start the layers again.
 */
export function offFieldDefinedPT(s: GameState, o: GameObject, d: CardDef): CardDef {
  if (o.zone === "battlefield" || o.zone === "phasedOut" || o.zone === "merged" || o.faceDown) return d;
  if (!d.types.includes("Creature") || (/^-?\d+$/.test(d.power ?? "0") && /^-?\d+$/.test(d.toughness ?? "0"))) return d;
  if (building || definingPT.has(o.id)) return d;
  const cda = compileCard(d).statics.find((st) => st.affects.kind === "self" && !st.condition && st.mods.some((x) => x.kind === "definePT"));
  const def = cda?.mods.find((x) => x.kind === "definePT") as Extract<Modification, { kind: "definePT" }> | undefined;
  if (!def) return d;
  definingPT.add(o.id);
  try {
    const ctx = { controller: o.zone === "stack" ? o.controller : o.owner, sourceId: o.id };
    const pt = (key: "power" | "toughness") => {
      const a = def[key];
      return /^-?\d+$/.test(d[key] ?? "0") || a === undefined ? d[key] : String(evalAmount(s, a, ctx));
    };
    const [p, t] = [pt("power"), pt("toughness")];
    return p === d.power && t === d.toughness ? d : { ...d, power: p, toughness: t };
  } finally {
    definingPT.delete(o.id);
  }
}

/** Who controls this object right now (after control-changing effects). */
export const controllerOf = (s: GameState, o: GameObject): PlayerId => (o.zone === "battlefield" ? characteristics(s, o).controller : o.controller);

/** The combined color identity of `pid`'s commanders (CR 903.4), or undefined if they have none. */
function commandersIdentity(s: GameState, pid: PlayerId | undefined): string[] | undefined {
  if (pid === undefined) return undefined;
  const cmds = Object.values(s.objects).filter((o) => o.isCommander && o.owner === pid);
  return cmds.length ? [...new Set(cmds.flatMap((o) => s.cards[o.cardId]?.colorIdentity ?? []))] : undefined;
}

/**
 * The most common colors among all permanents, those tied included: each permanent counts once for each of its colors
 * (Ruham Djinn, Heroic Defiance, Barrin's Unmaking). None while no permanent has a color.
 */
export function mostCommonColors(s: GameState, view: (id: ObjectId) => Characteristics | undefined = (id) => characteristics(s, s.objects[id]!)): Color[] {
  const n: Partial<Record<Color, number>> = {};
  for (const id of s.battlefield) for (const c of view(id)?.colors ?? []) n[c] = (n[c] ?? 0) + 1;
  const most = Math.max(0, ...Object.values(n));
  return most ? (Object.keys(n) as Color[]).filter((c) => n[c] === most) : [];
}

/** An Aura `auraId` may be attached to a permanent with these characteristics: no other Aura's "can't be enchanted by other Auras" says no. */
export const enchantableBy = (hc: Characteristics, auraId: ObjectId): boolean => hc.enchantedOnlyBy.every((x) => x === auraId);

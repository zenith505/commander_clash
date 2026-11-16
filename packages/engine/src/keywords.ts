// Leaf module (no imports) so the compiler and the layer system can share it without import cycles.

/** Keyword abilities the engine implements fully today. */
export const SUPPORTED_KEYWORDS = [
  "Flying",
  "Reach",
  "Vigilance",
  "Haste",
  "Defender",
  "Lifelink",
  "Deathtouch",
  "First strike",
  "Double strike",
  "Trample",
  "Trample over planeswalkers", // CR 702.19c: see dealCombatDamage
  "Menace",
  "Indestructible",
  "Hexproof",
  "Flash",
  // Evasion (CR 702.13, 702.14, 702.28, 702.36)
  "Fear",
  "Intimidate",
  "Shadow",
  "Swampwalk",
  "Islandwalk",
  "Forestwalk",
  "Mountainwalk",
  "Plainswalk",
  // Landwalk with a supertype (CR 702.14a, c): a land with it ("snow landwalk"), or without it ("nonbasic landwalk").
  "Snow landwalk",
  "Legendary landwalk",
  "Nonbasic landwalk",
  // A card type (CR 702.14a: "artifact landwalk", Vectis Gloves): a land that's also an artifact.
  "Artifact landwalk",
  // A supertype and a land type (CR 702.14c: "snow swampwalk", a snow Swamp), and Desertwalk (Desert Nomads).
  "Snow plainswalk",
  "Snow islandwalk",
  "Snow swampwalk",
  "Snow mountainwalk",
  "Snow forestwalk",
  "Desertwalk",
  "Horsemanship", // CR 702.31b: can't be blocked except by creatures with horsemanship
  "Phasing", // CR 702.26a: phases out and in during its controller's untap step
  "Skulk", // CR 702.118b: can't be blocked by creatures with greater power
  // Targeting and damage (CR 702.18 shroud, 702.16 protection, 702.90 infect, 702.80 wither).
  // Protection is modeled for the five colors only; "Toxic N" is a keyword with a number, see toxicValue.
  "Shroud",
  "Protection from white",
  "Protection from blue",
  "Protection from black",
  "Protection from red",
  "Protection from green",
  "Infect",
  "Wither",
  // On an Aura: "If enchanted permanent would be destroyed, instead remove all damage marked on it and destroy
  // this Aura" (CR 702.89a; "totem armor" is the old name, 702.89b). See destroyPermanent.
  "Umbra armor",
  "Totem armor",
  // Characteristic-defining / no in-game effect: Devoid's colorlessness is already in the
  // card data (CR 702.114a); Changeling gives every creature type (CR 702.73a); Partner and
  // "Choose a Background" only matter for deck building (CR 702.124h, 702.124k; see validateCommanderDeck).
  "Devoid",
  "Changeling",
  "Partner",
  "Choose a Background",
  // CR 702.61a: "As long as this spell is on the stack, players can't cast other spells or activate abilities that
  // aren't mana abilities." See splitSecondOnStack.
  "Split second",
  // CR 702.131b: on a permanent, "any time you control ten or more permanents and you don't have the city's
  // blessing, you get the city's blessing for the rest of the game." See checkAscend. On an instant or sorcery
  // it's a spell ability instead (702.131a), compiled into the spell.
  "Ascend",
  // CR 702.195a: "Any time you control three or more permanents that are artifacts, Sagas, and/or legendary and you
  // don't have an enduring story, you have an enduring story for the rest of the game." See checkAscend.
  "Storied",
  // CR 702.22: attacking bands are declared with attackers (see finishAttacks), a block spreads to the whole band, and
  // the other player divides combat damage (see bandSplit). "Bands with other [quality]" is a keyword too (see canonicalKeyword, bandsWithOther).
  "Banding",
  // CR 702.147a: "This creature can't block" (see cantBlockNow) and "When this creature attacks, sacrifice it at end of
  // combat" (see abilitiesOf). It can be a keyword counter (CR 122.1b).
  "Decayed",
  // CR 702.102a: a split card with fuse may be cast from hand as both halves, a fused split spell. See castableFaces and
  // faceDef's fused face.
  "Fuse",
  // CR 702.145: day and night transform these (see daynight.ts); nothing else can.
  "Daybound",
  "Nightbound",
] as const;
export type SupportedKeyword = (typeof SUPPORTED_KEYWORDS)[number];

const PROTECTION_COLOR: Record<string, "W" | "U" | "B" | "R" | "G"> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const PROTECTION_TYPES: Record<string, string> = {
  artifacts: "Artifact", creatures: "Creature", enchantments: "Enchantment", instants: "Instant", sorceries: "Sorcery",
  planeswalkers: "Planeswalker", lands: "Land", battles: "Battle", kindred: "Kindred",
};

/** What protection looks at in a source (CR 702.16a): its colors, card types and subtypes. */
export interface SourceQuality {
  colors: readonly string[];
  /** Who controls it, for protection from a player (CR 702.16k). */
  controller?: number;
  types?: readonly string[];
  subtypes?: readonly string[];
  /** Its supertypes, for protection from legendary creatures (Tsabo Tavoc). */
  supertypes?: readonly string[];
  /** It has every creature type (changeling, CR 702.73a), for protection from non-Spirit creatures. */
  allCreatureTypes?: boolean;
  /** It's a spell (not an ability of the source), for "can't be the target of spells". */
  spell?: true;
  /** Its name, for protection from a card name (Runed Halo, CR 702.16a). */
  name?: string;
  /** A permanent that was cast this turn (it resolved as a spell this turn), for Emrakul, the World Anew's protection. */
  castThisTurn?: true;
  /** A Ring-bearer (CR 701.54a), for protection from Ring-bearers (Lord of the Nazgûl). */
  ringBearer?: true;
  /** Its mana value, a spell's with its X (CR 202.3e), for protection from a mana value (Reaver Titan); none is 0 (CR 202.3a). */
  manaValue?: number;
  /** A permanent with a corruption counter on it, for Geyadrone Dihada's protection (a spell isn't a permanent, CR 110.1). */
  corrupted?: true;
}

/** "Goblins" -> "Goblin", "Elves" -> "Elf", "Sphinxes" -> "Sphinx": a creature type's plural, as protection names it. */
export function creatureTypeOfPlural(w: string): string | undefined {
  const cap = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  for (const c of [cap, cap.replace(/ves$/, "f"), cap.replace(/es$/, ""), cap.replace(/s$/, ""), cap.replace(/ies$/, "y"), cap === "Dwarves" ? "Dwarf" : ""])
    if (c && CREATURE_TYPES.has(c)) return c;
  return undefined;
}

/**
 * The keyword as the engine spells it, for the keywords it implements, or undefined: "flying" ->
 * "Flying", "protection from artifacts" -> "Protection from artifacts", "protection from goblins" ->
 * "Protection from Goblins" (CR 702.16a: protection from a quality).
 */
export function canonicalKeyword(text: string): string | undefined {
  const p = text.trim().toLowerCase();
  const k = SUPPORTED_LOWER.get(p);
  if (k) return k;
  if (p === CHOSEN_KEYWORD) return CHOSEN_KEYWORD;
  // "Bands with other [quality]" (CR 702.22b-c, j-k): a special form of banding, the quality legendary creatures or
  // creatures with one name (Master of the Hunt's Wolves of the Hunt). See bandsWithOther.
  // A token's own text has its name as "~" (see printedKeywords) and may end in a period.
  if (p.replace(/\.$/, "") === "bands with other legendary creatures") return "Bands with other legendary creatures";
  const bwoName = /^bands with other creatures named (.+?)\.?$/i.exec(text.trim());
  if (bwoName) return `Bands with other creatures named ${bwoName[1]}`;
  // Traveler's Cloak, Illusionary Presence: "landwalk of the chosen type"; Barbarian Guides: "snow landwalk of the chosen
  // type" (CR 702.14a, c): bound to the land type chosen as it entered or resolved.
  if (p === "landwalk of the chosen type") return CHOSEN_LANDWALK;
  if (p === "snow landwalk of the chosen type") return CHOSEN_SNOW_LANDWALK;
  // "Hexproof from blue" (CR 702.11d): from a color, or from all of them, one or more than one.
  // "Hexproof from activated and triggered abilities" (Volatile Stormdrake): from abilities, not spells.
  // "Hexproof from planeswalkers" (Eradicator Valkyrie): from sources of a card type.
  const hx = /^hexproof from (white|blue|black|red|green|each color|monocolored|multicolored|activated and triggered abilities|artifacts|creatures|enchantments|instants|planeswalkers|sorceries)$/.exec(p);
  if (hx) return `Hexproof from ${hx[1]}`;
  if (p === "hexproof from the chosen color") return CHOSEN_HEXPROOF;
  if (p === "hexproof from each of its colors") return OWN_COLORS_HEXPROOF;
  // "Gains toxic 1" (Skrelv): a keyword with a number (CR 702.164a).
  const tox = /^toxic (\d+)$/.exec(p);
  if (tox) return `Toxic ${tox[1]}`;
  const m = /^protection from (.+)$/.exec(p);
  if (!m) return undefined;
  const q = m[1]!;
  if (q === "each of your opponents") return PROTECTION_FROM_OPPONENTS;
  if (q === "spells" || q === "permanents that were cast this turn" || q === "permanents with corruption counters on them") return `Protection from ${q}`;
  if (q === "ring-bearers") return "Protection from Ring-bearers";
  // Ronom Hulk: "protection from snow" (snow permanents, spells and abilities from snow sources); Kitsune Riftwalker:
  // "from Arcane" (Arcane spells, CR 702.16a).
  if (q === "snow") return "Protection from snow";
  if (q === "arcane") return "Protection from Arcane";
  if (q === "the chosen player") return CHOSEN_PLAYER_PROTECTION;
  if (q === "the chosen card type") return CHOSEN_TYPE_PROTECTION;
  if (q === "each mana value of the chosen quality") return CHOSEN_PARITY_PROTECTION;
  if (q === "each mana value other than the chosen number") return CHOSEN_NUMBER_EXCEPT_PROTECTION;
  if (q === "creatures of the chosen type") return CHOSEN_CREATURE_TYPE_PROTECTION;
  // Samite Elder: "each of that permanent's colors", the same (its one target's colors as it resolves).
  if (q === "each of that creature's colors" || q === "each of that permanent's colors") return TARGET_COLORS_PROTECTION;
  // Opal Titan: "each of that spell's colors", the spell that triggered it (CAST_SPELL_COLORS_PROTECTION).
  if (q === "each of that spell's colors") return CAST_SPELL_COLORS_PROTECTION;
  if (q === "each color that's not in your commander's color identity") return IDENTITY_PROTECTION;
  if (q === "each color among permanents you control") return YOURS_COLORS_PROTECTION;
  if (q === "each mana value among artifacts you control") return YOURS_ARTIFACT_MV_PROTECTION;
  if (q === "each of its colors") return OWN_COLORS_PROTECTION;
  if (q === "everything" || q === "multicolored" || q === "monocolored" || q === "colorless" || q === "each color" || q === "all colors" || q === "the chosen color") return q === "the chosen color" ? CHOSEN_PROTECTION : `Protection from ${q}`;
  if (PROTECTION_TYPES[q]) return `Protection from ${q}`;
  if (/^mana value \d+ or (?:less|greater)$/.test(q)) return `Protection from ${q}`;
  // Tsabo Tavoc: "protection from legendary creatures"; Harbinger of Spring: "protection from non-Spirit creatures".
  if (q === "legendary creatures") return `Protection from ${q}`;
  // Crypsis: "protection from creatures your opponents control": "your" is the protected permanent's controller's, so
  // after a change of control, its new controller's opponents (rulings).
  if (q === "creatures your opponents control") return "Protection from creatures your opponents control";
  const nonType = /^non-([a-z]+) creatures$/.exec(q);
  if (nonType && CREATURE_TYPES.has(nonType[1]!.charAt(0).toUpperCase() + nonType[1]!.slice(1))) return `Protection from non-${nonType[1]!.charAt(0).toUpperCase() + nonType[1]!.slice(1)} creatures`;
  // Sigrid, God-Favored: "protection from God creatures": a creature source of that type, as Riders of Gavony's chosen type
  // (a God that isn't a creature isn't a God, CR 205.1b, rulings).
  const typed = /^([a-z]+) creatures$/.exec(q);
  if (typed && CREATURE_TYPES.has(typed[1]!.charAt(0).toUpperCase() + typed[1]!.slice(1))) return `Protection from creatures of type ${typed[1]!.charAt(0).toUpperCase() + typed[1]!.slice(1)}`;
  const st = creatureTypeOfPlural(q);
  return st ? `Protection from ${text.trim().slice(-q.length).replace(/^./, (c) => c.toUpperCase())}` : undefined;
}
/** "Becomes the creature type of your choice": a subtype filled in with the type chosen as it resolved. */
export const CHOSEN_TYPE = "(the chosen creature type)";
/** "Becomes the basic land type of your choice": filled in with the basic land type chosen as it resolved. */
export const CHOSEN_LAND_TYPE = "(the chosen basic land type)";
/** "Gains your choice of menace or lifelink": filled in with the keyword chosen as it resolved. */
export const CHOSEN_KEYWORD = "(the chosen keyword)";
/** "Gains landwalk of the chosen type" (Giant Slug): filled in with the landwalk of the basic land type chosen as it resolved (CR 702.14a). */
export const CHOSEN_LANDWALK = "(landwalk of the chosen type)";
/** "Gains snow landwalk of the chosen type" (Barbarian Guides): a snow land of the land type chosen as it resolved (CR 702.14c). */
export const CHOSEN_SNOW_LANDWALK = "(snow landwalk of the chosen type)";
/**
 * "Gains landwalk of each of the land types of the sacrificed land" (Excavator): filled in as it resolves with the
 * landwalk of each land type the land its cost sacrificed had as it last existed (CR 608.2h, 702.14a; rulings: all of
 * them if it had several, none for Wastes).
 */
export const SACRIFICED_LANDWALK = "(landwalk of each of the sacrificed land's types)";
/** The landwalk keyword of a chosen land type ("Swampwalk", "Gatewalk"), or its snow form ("Snow swampwalk", CR 702.14c). */
export const chosenLandwalk = (k: string, landType: string | undefined): string[] =>
  !landType ? [] : k === CHOSEN_SNOW_LANDWALK ? [`Snow ${landType.toLowerCase()}walk`] : [`${landType}walk`];
/** "Have each of the chosen abilities" (Greymond, Avacyn's Stalwart): the keywords chosen as the source entered (Chosen.keywords). */
export const CHOSEN_KEYWORDS = "(the chosen keywords)";
/** "Protection from each of your opponents" (CR 702.16i, 702.16k): from each player who is an opponent of its controller. */
export const PROTECTION_FROM_OPPONENTS = "Protection from each of your opponents";
/** "Protection from the chosen player" (True-Name Nemesis): the player chosen as it entered (CR 702.16k). */
export const CHOSEN_PLAYER_PROTECTION = "Protection from the chosen player";
/**
 * "Gains protection from the chosen player until end of turn" (Guardian Archon), as it resolved: protection from that
 * one player (CR 702.16k), whoever the permanent's own chosen player is.
 */
export const protectionFromPlayer = (pid: number) => `Protection from player #${pid}`;
/** "For each opponent who does, you gain protection from that player" (Noble Heritage): filled in with that player. */
export const THAT_PLAYER_PROTECTION = "Protection from that player";
/** "Target opponent takes an extra turn ... you and planeswalkers you control gain protection from that player" (Eon Frolicker): filled in with that target player as it resolves. */
export const TARGET_PLAYER_PROTECTION = "Protection from the target player";
const PLAYER_PROTECTION = /^Protection from player #(\d+)$/;
/** A keyword as shown to people: "Protection from player #2" names that player. */
export const keywordLabel = (k: string, name: (pid: number) => string) => k.replace(PLAYER_PROTECTION, (_, n: string) => `Protection from ${name(Number(n))}`);
/** "Protection from the chosen color": filled in with the color chosen as it resolved or entered. */
export const CHOSEN_PROTECTION = "Protection from the chosen color";
/** "Hexproof from that color" after "Choose a color" (Skrelv): filled in with the color chosen as it resolved (CR 702.11d). */
export const CHOSEN_HEXPROOF = "Hexproof from the chosen color";
export const COLOR_WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
/**
 * "Has hexproof from each of its colors" (Tam, Mindful First-Year): filled in, in layer 6, with the colors the permanent
 * has after layer 5 (CR 613.1e-f), one "hexproof from [color]" each (CR 702.11d); none if it's colorless (rulings).
 */
export const OWN_COLORS_HEXPROOF = "Hexproof from each of its colors";
/**
 * "Each creature has protection from each of its colors" (Earnest Fellowship): the same, one "protection from [color]"
 * for each color the permanent has after layer 5 (CR 613.1e-f, 702.16a); none if it's colorless (rulings).
 */
export const OWN_COLORS_PROTECTION = "Protection from each of its colors";
/**
 * "Protection from each color that's not in your commander's color identity" (Commander's Plate): filled in with the
 * colors outside the combined color identity of the commanders of the effect's controller; none if they have no
 * commander (rulings).
 */
export const IDENTITY_PROTECTION = "Protection from each color not in your commander's color identity";
/**
 * "Protection from each color among permanents you control" (Empty-Shrine Kannushi, Pledge of Loyalty): filled in as the
 * layers apply it with the colors of the permanents the effect's controller controls, as layer 5 left them (CR 613.1e-f);
 * the permanent itself counts too.
 */
export const YOURS_COLORS_PROTECTION = "Protection from each color among permanents you control";
/**
 * Rebbec, Architect of Ascension: "Artifacts you control have protection from each mana value among artifacts you
 * control": filled in as "Protection from mana value N" for each mana value among the artifacts its controller controls
 * as layer 4 left their types (CR 613.1d, 702.16a); an {X} in a permanent's mana cost is 0 (CR 202.3e, rulings), and a
 * token that isn't a copy has mana value 0 (CR 202.3c).
 */
export const YOURS_ARTIFACT_MV_PROTECTION = "Protection from each mana value among artifacts you control";
/**
 * Magnigoth Treefolk: "For each basic land type among lands you control, ~ has landwalk of that type": filled in as the
 * layers apply it with the basic land types of the lands the effect's controller controls, as layer 4 left them
 * (CR 613.1d, 702.14c; domain counts land types, not lands, rulings).
 */
export const YOURS_BASIC_LANDWALK = "Landwalk of each basic land type among lands you control";
/**
 * Mirror Golem: "~ has protection from each of the exiled card's card types": filled in from the cards its imprint
 * ability exiled (CR 607.2a) that are still in exile, as the layers apply it.
 */
export const LINKED_TYPES_PROTECTION = "Protection from each of the exiled card's card types";
/**
 * Urborg Scavengers: "~ has flying as long as a card exiled with it has flying. The same is true for ...": each keyword
 * written after this prefix is had only while a card its exile ability exiled (CR 607.2a), still in exile and face up,
 * has that keyword itself, as the layers apply it.
 */
export const LINKED_CARD_KEYWORD = "As long as a card exiled with it has it: ";
/**
 * Soulflayer: "If a creature card with flying was exiled with ~'s delve ability, ~ has flying. The same is true for ...":
 * as LINKED_CARD_KEYWORD, but only a creature card among those its delve exiled counts (CR 607.2q).
 */
export const LINKED_CREATURE_CARD_KEYWORD = "If a creature card exiled with it has it: ";
/**
 * Cairn Wanderer: "As long as a creature card with flying is in a graveyard, ~ has flying. The same is true for ...": each
 * keyword written after this prefix is had while a creature card in any graveyard has that keyword itself (round 358).
 */
export const YARD_CREATURE_CARD_KEYWORD = "As long as a creature card in a graveyard has it: ";
/**
 * Rayami, First of the Fallen (round B228): "As long as an exiled creature card with a blood counter on it has flying, ~ has
 * flying. The same is true for ...": each keyword written after this prefix is had while a face-up creature card in exile
 * with a blood counter on it, anyone's, has that keyword itself (variants as those variants, rulings).
 */
export const EXILED_BLOOD_CREATURE_KEYWORD = "As long as an exiled creature card with a blood counter on it has it: ";
/**
 * Escaped Shapeshifter (round B228): "As long as an opponent controls a creature with flying not named ~, ~ has flying. The
 * same is true for ...": each keyword written after this prefix is had while a creature an opponent of its controller
 * controls, not named as this object is, has it as the layers have applied so far ("Protection": each color one of them
 * has protection from).
 */
export const OPPONENT_CREATURE_KEYWORD = "As long as an opponent's creature not named ~ has it: ";
/** "Protection from creatures" and the like for each of these card types (CR 205.2a, 702.16a). */
export function protectionFromCardTypes(types: readonly string[]): string[] {
  return Object.entries(PROTECTION_TYPES).filter(([, t]) => types.includes(t)).map(([q]) => `Protection from ${q}`);
}
/**
 * "Gain protection from each of that creature's colors until end of turn" (Éowyn, Fearless Knight): filled in as it
 * resolves with the colors of the ability's one target, as it last existed if it has left (rulings).
 */
export const TARGET_COLORS_PROTECTION = "Protection from each of that creature's colors";
/**
 * "It becomes a 4/4 Giant creature with protection from each of that spell's colors" (Opal Titan): filled in as it
 * resolves with the colors of the spell that triggered it, as it is on the stack or as it last existed there (CR 608.2h);
 * none for a colorless spell (rulings).
 */
export const CAST_SPELL_COLORS_PROTECTION = "Protection from each of that spell's colors";
/**
 * Lavabrink Venturer: "~ has protection from each mana value of the chosen quality": bound as "Protection from odd mana
 * values" or "... even ...", the quality chosen as it entered (CR 614.12, 702.16a); with no choice made, none (rulings).
 */
export const CHOSEN_PARITY_PROTECTION = "Protection from each mana value of the chosen quality";
/**
 * Haktos the Unscarred: "~ has protection from each mana value other than the chosen number": bound as "Protection from
 * mana values other than 3", the number chosen as it entered (CR 702.16a): every other mana value, not just the numbers
 * that could have been chosen; with no number chosen, none (rulings).
 */
export const CHOSEN_NUMBER_EXCEPT_PROTECTION = "Protection from each mana value other than the chosen number";
/** "Protection from the chosen card type" (Serra's Emissary): the card type chosen as the source entered (CR 702.16a). */
export const CHOSEN_TYPE_PROTECTION = "Protection from the chosen card type";
/**
 * "Protection from creatures of the chosen type" (Riders of Gavony): the creature type chosen as the source entered,
 * bound as "Protection from creatures of type Goblin": creatures only, not other objects of that type (CR 702.16a).
 */
export const CHOSEN_CREATURE_TYPE_PROTECTION = "Protection from creatures of the chosen type";
/** The card types a player may name in a game here (rulings on Serra's Emissary; kindred cards aren't supported), as protection says them. */
export const CARD_TYPE_PLURAL: Record<string, string> = { Artifact: "artifacts", Battle: "battles", Creature: "creatures", Enchantment: "enchantments", Instant: "instants", Land: "lands", Planeswalker: "planeswalkers", Sorcery: "sorceries" };
/**
 * Keywords with "the chosen color" filled in; without a choice, that protection is dropped. `identity`: the colors in the
 * color identity of the commanders of the effect's controller, undefined if they have none.
 */
export const bindChosenKeywords = (keywords: readonly string[], color: string | undefined, identity?: readonly string[], cardType?: string, creatureType?: string, chosenKeywords?: readonly string[], ownColors?: readonly string[], landType?: string, parity?: "odd" | "even", chosenNumber?: number) =>
  keywords.flatMap((k) =>
    k === CHOSEN_NUMBER_EXCEPT_PROTECTION
      ? chosenNumber !== undefined ? [`Protection from mana values other than ${chosenNumber}`] : []
      : k === CHOSEN_PARITY_PROTECTION
      ? parity ? [`Protection from ${parity} mana values`] : []
      : k === OWN_COLORS_HEXPROOF || k === OWN_COLORS_PROTECTION
      ? (ownColors ?? []).filter((c) => COLOR_WORD[c]).map((c) => `${k === OWN_COLORS_HEXPROOF ? "Hexproof" : "Protection"} from ${COLOR_WORD[c]}`)
      : k === CHOSEN_KEYWORDS
      ? [...(chosenKeywords ?? [])]
      : k === CHOSEN_CREATURE_TYPE_PROTECTION
      ? creatureType ? [`Protection from creatures of type ${creatureType}`] : []
      : k === CHOSEN_TYPE_PROTECTION
      ? cardType && CARD_TYPE_PLURAL[cardType] ? [`Protection from ${CARD_TYPE_PLURAL[cardType]}`] : []
      : k === CHOSEN_PROTECTION || k === CHOSEN_HEXPROOF
      ? color && COLOR_WORD[color] ? [`${k === CHOSEN_HEXPROOF ? "Hexproof" : "Protection"} from ${COLOR_WORD[color]}`] : []
      : k === CHOSEN_LANDWALK || k === CHOSEN_SNOW_LANDWALK
      ? chosenLandwalk(k, landType)
      : k === IDENTITY_PROTECTION
        ? identity ? Object.keys(COLOR_WORD).filter((c) => !identity.includes(c)).map((c) => `Protection from ${COLOR_WORD[c]}`) : []
        : [k],
  );
const SUPPORTED_LOWER = new Map<string, string>(SUPPORTED_KEYWORDS.map((k) => [k.toLowerCase(), k]));

/** The colors a permanent with these keywords has protection from (CR 702.16). */
export function protectionColors(keywords: readonly string[]): ("W" | "U" | "B" | "R" | "G")[] {
  const out: ("W" | "U" | "B" | "R" | "G")[] = [];
  for (const k of keywords) {
    const m = /^protection from (white|blue|black|red|green)$/i.exec(k);
    if (m) out.push(PROTECTION_COLOR[m[1]!.toLowerCase()]!);
    if (/^protection from (each color|all colors|everything)$/i.test(k)) out.push("W", "U", "B", "R", "G");
  }
  return [...new Set(out)];
}

/**
 * Does one of these protection abilities cover the source (CR 702.16a)? "From everything" covers
 * anything (702.16j), "from multicolored" a source with two or more colors, "from artifacts" an
 * artifact source, "from Goblins" a Goblin source.
 */
export function protectedFrom(keywords: readonly string[], src: SourceQuality, holder?: ProtectionHolder): boolean {
  if (src.controller !== undefined && protectedFromPlayer(keywords, src.controller, holder)) return true;
  for (const k of keywords) {
    const m = /^protection from (.+)$/i.exec(k);
    if (!m) continue;
    const q = m[1]!.toLowerCase();
    if (PROTECTION_COLOR[q] && src.colors.includes(PROTECTION_COLOR[q])) return true;
    if (q === "everything") return true;
    // Emrakul, the World Anew (CR 702.16a, 702.16g): "protection from spells" (the spell itself, or a spell's ability,
    // which is the spell), "from permanents that were cast this turn" (a permanent that resolved as a cast spell this turn).
    if (q === "spells" && src.spell) return true;
    if (q === "permanents that were cast this turn" && src.castThisTurn && !src.spell) return true;
    if (q === "ring-bearers" && src.ringBearer) return true;
    // Geyadrone Dihada: "protection from permanents with corruption counters on them": only a permanent with one (rulings:
    // its activated and triggered abilities too), not a spell.
    if (q === "permanents with corruption counters on them" && src.corrupted && !src.spell) return true;
    if (q === "snow" && src.supertypes?.includes("Snow")) return true;
    if (q === "arcane" && src.subtypes?.includes("Arcane")) return true;
    if ((q === "each color" || q === "all colors") && src.colors.length > 0) return true;
    if (q === "multicolored" && src.colors.length > 1) return true;
    if (q === "monocolored" && src.colors.length === 1) return true;
    if (q === "colorless" && src.colors.length === 0) return true;
    if (PROTECTION_TYPES[q] && src.types?.includes(PROTECTION_TYPES[q])) return true;
    // "Protection from mana value 3 or less" (Reaver Titan), "... 3 or greater" (Mistmeadow Skulk): an object with no mana
    // cost has mana value 0 (CR 202.3a), a spell's counts its X (CR 202.3e, rulings on Reaver Titan).
    // Lavabrink Venturer's chosen quality: a source with an odd (even) mana value; zero is even, a token that isn't a copy
    // has mana value 0, and a spell's counts its X (rulings, CR 202.3).
    if (q === "odd mana values" && (src.manaValue ?? 0) % 2 === 1) return true;
    if (q === "even mana values" && (src.manaValue ?? 0) % 2 === 0) return true;
    // Haktos's chosen number: a source whose mana value is any other (a token that isn't a copy has 0, rulings).
    // Rebbec's "each mana value among artifacts you control", filled in: a source with exactly that mana value.
    const exact = /^mana value (\d+)$/.exec(q);
    if (exact && (src.manaValue ?? 0) === Number(exact[1])) return true;
    const except = /^mana values other than (\d+)$/.exec(q);
    if (except && (src.manaValue ?? 0) !== Number(except[1])) return true;
    const mv = /^mana value (\d+) or (less|greater)$/.exec(q);
    if (mv && (mv[2] === "less" ? (src.manaValue ?? 0) <= Number(mv[1]) : (src.manaValue ?? 0) >= Number(mv[1]))) return true;
    const st = creatureTypeOfPlural(q);
    if (st && src.subtypes?.includes(st)) return true;
    // Riders of Gavony's chosen type: a creature source of that type, a changeling too (CR 702.73a).
    const ofType = /^creatures of type (.+)$/.exec(q);
    if (ofType && src.types?.includes("Creature") && (src.allCreatureTypes || src.subtypes?.some((t) => t.toLowerCase() === ofType[1]))) return true;
    // "Protection from legendary creatures", "... non-Spirit creatures": a creature source that's legendary, or that isn't
    // a Spirit (a changeling is every creature type, CR 702.73a).
    const isCreature = !!src.types?.includes("Creature");
    if (q === "legendary creatures" && isCreature && src.supertypes?.includes("Legendary")) return true;
    // Crypsis: a creature source controlled by an opponent of the protected permanent's controller as it is now (rulings),
    // every other player in this game (CR 102.3); a creature card not on the battlefield by its owner, who controls its
    // abilities (rulings, CR 113.8).
    if (q === "creatures your opponents control" && isCreature && holder && src.controller !== undefined && src.controller !== holder.controller) return true;
    const nonType = /^non-([a-z]+) creatures$/.exec(q);
    if (nonType && isCreature && !src.allCreatureTypes && !src.subtypes?.some((t) => t.toLowerCase() === nonType[1])) return true;
  }
  return false;
}

/**
 * "Hexproof from [quality]" (CR 702.11d): can't be the target of [quality] spells its opponents control or abilities
 * they control from [quality] sources. `src` is the spell or the ability's source; who controls it is checked by the caller.
 */
const HEXPROOF_TYPES: Record<string, string> = { artifacts: "Artifact", creatures: "Creature", enchantments: "Enchantment", instants: "Instant", planeswalkers: "Planeswalker", sorceries: "Sorcery" };

export function hexproofFrom(keywords: readonly string[], src: SourceQuality): boolean {
  for (const k of keywords) {
    const q = /^hexproof from (.+)$/i.exec(k)?.[1]?.toLowerCase();
    if (!q) continue;
    if (PROTECTION_COLOR[q] && src.colors.includes(PROTECTION_COLOR[q])) return true;
    if (q === "each color" && src.colors.length > 0) return true; // CR 702.11g
    if (q === "multicolored" && src.colors.length > 1) return true;
    if (q === "monocolored" && src.colors.length === 1) return true;
    // Volatile Stormdrake: any ability that targets is an activated or triggered one (spells' own abilities are the spell).
    if (q === "activated and triggered abilities" && !src.spell) return true;
    // "Hexproof from planeswalkers": a source with that card type (CR 702.11d), its abilities included.
    const type = HEXPROOF_TYPES[q];
    if (type && src.types?.includes(type)) return true;
  }
  return false;
}

/** Who has the protection: its controller, and the player chosen for it as it entered ("the chosen player"). */
export interface ProtectionHolder {
  controller: number;
  chosenPlayer?: number;
}

/**
 * Does it have protection from this player (CR 702.16k)? Then it has protection from each object that player controls:
 * spells and abilities they control can't target it, their Auras and Equipment can't be attached to it, their creatures
 * can't block it, and damage from their sources is prevented. Every other player in a game is an opponent (CR 102.3, 800.4).
 */
export function protectedFromPlayer(keywords: readonly string[], pid: number, holder?: ProtectionHolder): boolean {
  if (!holder) return false;
  for (const k of keywords) {
    if (k === PROTECTION_FROM_OPPONENTS && pid !== holder.controller) return true;
    if (k === CHOSEN_PLAYER_PROTECTION && holder.chosenPlayer === pid) return true;
    if (Number(PLAYER_PROTECTION.exec(k)?.[1] ?? NaN) === pid) return true;
  }
  return false;
}

/** A creature's total toxic value: the sum of its "Toxic N" abilities (CR 702.164b). */
export const toxicValue = (keywords: readonly string[]) =>
  keywords.reduce((n, k) => n + Number(/^toxic (\d+)$/i.exec(k)?.[1] ?? 0), 0);

/** Remove reminder text in parentheses. */
// Not Eluge's "costs {U} (or {1}) less": rules text, not reminder text.
export const stripReminder = (text: string) => text.replace(/\s*\((?!or \{\d+\}\))[^)]*\)/g, "").trim();

/** Creature types, from CR 205.3m. Used to tell "Elf creatures" from "Enchanted creatures". */
export const CREATURE_TYPES: ReadonlySet<string> = new Set([
  "Advisor", "Aetherborn", "Alien", "Ally", "Angel", "Antelope", "Ape", "Archer", "Archon", "Armadillo",
  "Army", "Artificer", "Assassin", "Assembly-Worker", "Astartes", "Atog", "Aurochs", "Avatar", "Azra",
  "Badger", "Balloon", "Barbarian", "Bard", "Basilisk", "Bat", "Bear", "Beast", "Beaver", "Beeble",
  "Beholder", "Berserker", "Bird", "Bison", "Blinkmoth", "Boar", "Bringer", "Brushwagg", "Camarid", "Camel",
  "Capybara", "Caribou", "Carrier", "Cat", "Centaur", "Child", "Chimera", "Citizen", "Cleric", "Clown",
  "Cockatrice", "Construct", "Coward", "Coyote", "Crab", "Crocodile", "C'tan", "Custodes", "Cyberman",
  "Cyclops", "Dalek", "Dauthi", "Demigod", "Demon", "Deserter", "Detective", "Devil", "Dinosaur", "Djinn",
  "Doctor", "Dog", "Dragon", "Drake", "Dreadnought", "Drix", "Drone", "Druid", "Dryad", "Dwarf", "Echidna",
  "Efreet", "Egg", "Elder", "Eldrazi", "Elemental", "Elephant", "Elf", "Elk", "Employee", "Eternal", "Eye",
  "Faerie", "Ferret", "Fish", "Flagbearer", "Fox", "Fractal", "Frog", "Fungus", "Gamer", "Gamma", "Gargoyle",
  "Germ", "Giant", "Giraffe", "Gith", "Glimmer", "Gnoll", "Gnome", "Goat", "Goblin", "God", "Golem",
  "Gorgon", "Graveborn", "Gremlin", "Griffin", "Guest", "Hag", "Halfling", "Hamster", "Harpy", "Hedgehog",
  "Hellion", "Hero", "Hippo", "Hippogriff", "Homarid", "Homunculus", "Horror", "Horse", "Human", "Hydra",
  "Hyena", "Illusion", "Imp", "Incarnation", "Inhuman", "Inkling", "Inquisitor", "Insect", "Jackal",
  "Jellyfish", "Juggernaut", "Kangaroo", "Kavu", "Kirin", "Kithkin", "Knight", "Kobold", "Kor", "Kraken",
  "Kree", "Llama", "Lamia", "Lammasu", "Leech", "Lemur", "Leviathan", "Lhurgoyf", "Licid", "Lizard",
  "Lobster", "Manticore", "Masticore", "Mercenary", "Merfolk", "Metathran", "Minion", "Minotaur", "Mite",
  "Mole", "Monger", "Mongoose", "Monk", "Monkey", "Moogle", "Moonfolk", "Mount", "Mouse", "Mutant", "Myr",
  "Mystic", "Nautilus", "Necron", "Nephilim", "Nightmare", "Nightstalker", "Ninja", "Noble", "Noggle",
  "Nomad", "Nymph", "Octopus", "Ogre", "Ooze", "Orb", "Orc", "Orgg", "Otter", "Ouphe", "Ox", "Oyster",
  "Pangolin", "Peasant", "Pegasus", "Pentavite", "Performer", "Pest", "Phelddagrif", "Phoenix", "Phyrexian",
  "Pilot", "Pincher", "Pirate", "Plant", "Platypus", "Porcupine", "Possum", "Praetor", "Primarch", "Prism",
  "Processor", "Qu", "Rabbit", "Raccoon", "Ranger", "Rat", "Rebel", "Reflection", "Rhino", "Rigger", "Robot",
  "Rogue", "Sable", "Salamander", "Samurai", "Sand", "Saproling", "Satyr", "Scarecrow", "Scientist", "Scion",
  "Scorpion", "Scout", "Sculpture", "Seal", "Serf", "Serpent", "Servo", "Shade", "Shaman", "Shapeshifter",
  "Shark", "Sheep", "Shi'ar", "Siren", "Skeleton", "Skrull", "Skunk", "Slith", "Sliver", "Sloth", "Slug",
  "Snail", "Snake", "Soldier", "Soltari", "Sorcerer", "Spawn", "Specter", "Spellshaper", "Sphinx", "Spider",
  "Spike", "Spirit", "Splinter", "Sponge", "Spy", "Squid", "Squirrel", "Starfish", "Surrakar", "Survivor",
  "Symbiote", "Synth", "Tentacle", "Tetravite", "Thalakos", "Thopter", "Thrull", "Tiefling", "Toy",
  "Treefolk", "Trilobite", "Triskelavite", "Troll", "Turtle", "Tyranid", "Unicorn", "Utrom", "Vampire",
  "Varmint", "Vedalken", "Villain", "Volver", "Wall", "Walrus", "Warlock", "Warrior", "Weasel", "Weird",
  "Werewolf", "Whale", "Wizard", "Wolf", "Wolverine", "Wombat", "Worm", "Wraith", "Wurm", "Yeti", "Zombie",
  "Zubera", "Time Lord",
]);

// Other subtype lists (CR 205.3g-k), to tell which card type a subtype goes with.
export const LAND_TYPES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Desert", "Gate", "Lair", "Locus", "Mine", "Power-Plant", "Tower", "Urza's", "Cave", "Sphere", "Town", "Planet"]);
const ARTIFACT_TYPES = new Set(["Attraction", "Blood", "Bobblehead", "Book", "Clue", "Contraption", "Equipment", "Food", "Fortification", "Gold", "Heartwood", "Incubator", "Infinity", "Junk", "Lander", "Map", "Mutagen", "Powerstone", "Spacecraft", "Stone", "Terminus", "Treasure", "Vehicle", "Vibranium"]);
const ENCHANTMENT_TYPES = new Set(["Aura", "Background", "Cartouche", "Case", "Class", "Curse", "Role", "Room", "Rune", "Saga", "Shard", "Shrine"]);
const SPELL_TYPES = new Set(["Adventure", "Arcane", "Chorus", "Lesson", "Omen", "Trap"]);

/**
 * The card type a subtype belongs to (CR 205.3d): "Creature" for creature types, "Land" for
 * Forest, "Artifact" for Equipment, ... Unknown subtypes (planeswalker and battle types) give null.
 */
export function subtypeSet(st: string): "Creature" | "Land" | "Artifact" | "Enchantment" | "Spell" | null {
  if (CREATURE_TYPES.has(st)) return "Creature";
  if (LAND_TYPES.has(st)) return "Land";
  if (ARTIFACT_TYPES.has(st)) return "Artifact";
  if (ENCHANTMENT_TYPES.has(st)) return "Enchantment";
  if (SPELL_TYPES.has(st)) return "Spell";
  return null;
}

/** Every land type (CR 205.3i), the basic ones first: "choose a land type" (Traveler's Cloak) offers these. */
export const LAND_TYPE_LIST: readonly string[] = [...LAND_TYPES];
// Landwalk of any land type (CR 702.14a): "islandwalk", "desertwalk", or one chosen ("Gatewalk", Traveler's Cloak).
const WALK_TYPES: Record<string, string> = Object.fromEntries([...LAND_TYPES].map((t) => [t.toLowerCase(), t]));
const WALK_SUPERTYPES: Record<string, { supertype: string; non?: true }> = { snow: { supertype: "Snow" }, legendary: { supertype: "Legendary" }, nonbasic: { supertype: "Basic", non: true } };

/**
 * The lands a landwalk keyword looks for (CR 702.14c): one with the land type ("islandwalk"), with or without the
 * supertype ("snow landwalk", "nonbasic landwalk"), or with both ("snow swampwalk"). Null if it isn't landwalk.
 */
export function landwalkLand(keyword: string): ((land: { types: string[]; subtypes: string[]; supertypes: string[] }) => boolean) | null {
  if (/^artifact landwalk$/i.test(keyword)) return (l) => l.types.includes("Land") && l.types.includes("Artifact");
  const m = /^(?:(snow|legendary|nonbasic) )?([a-z'-]+)walk$/i.exec(keyword);
  if (!m || (!m[1] && m[2]!.toLowerCase() === "land") || (m[2]!.toLowerCase() !== "land" && !WALK_TYPES[m[2]!.toLowerCase()])) return null;
  const sup = m[1] ? WALK_SUPERTYPES[m[1].toLowerCase()]! : undefined;
  const sub = WALK_TYPES[m[2]!.toLowerCase()];
  return (l) => l.types.includes("Land") && (!sup || l.supertypes.includes(sup.supertype) !== !!sup.non) && (!sub || l.subtypes.includes(sub));
}

/** Is this keyword a landwalk ability (CR 702.14a)? */
export const isLandwalk = (keyword: string): boolean => !!landwalkLand(keyword);

const everyTypeText = new Map<string, boolean>();
/** Whether one of the card's own lines is "<its name> is every creature type". */
export const isEveryCreatureTypeText = (d: { name: string; oracleText?: string }): boolean => {
  const key = `${d.name}\u0000${d.oracleText}`;
  let v = everyTypeText.get(key);
  if (v === undefined) {
    const name = d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    v = new RegExp(`(?:^|\n)${name} is every creature type\\b`).test(d.oracleText ?? "");
    everyTypeText.set(key, v);
  }
  return v;
};

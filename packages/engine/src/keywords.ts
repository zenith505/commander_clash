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
  // CR 702.22: attacking bands are declared with attackers (see finishAttacks), a block spreads to the whole band, and
  // the other player divides combat damage (see bandSplit). "Bands with other" isn't modeled.
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
  planeswalkers: "Planeswalker", lands: "Land", battles: "Battle",
};

/** What protection looks at in a source (CR 702.16a): its colors, card types and subtypes. */
export interface SourceQuality {
  colors: readonly string[];
  /** Who controls it, for protection from a player (CR 702.16k). */
  controller?: number;
  types?: readonly string[];
  subtypes?: readonly string[];
  /** It's a spell (not an ability of the source), for "can't be the target of spells". */
  spell?: true;
  /** Its name, for protection from a card name (Runed Halo, CR 702.16a). */
  name?: string;
  /** A permanent that was cast this turn (it resolved as a spell this turn), for Emrakul, the World Anew's protection. */
  castThisTurn?: true;
  /** Its mana value, a spell's with its X (CR 202.3e), for protection from a mana value (Reaver Titan); none is 0 (CR 202.3a). */
  manaValue?: number;
}

/** "Goblins" -> "Goblin", "Elves" -> "Elf", "Sphinxes" -> "Sphinx": a creature type's plural, as protection names it. */
function creatureTypeOfPlural(w: string): string | undefined {
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
  // "Hexproof from blue" (CR 702.11d): from a color, or from all of them, one or more than one.
  // "Hexproof from activated and triggered abilities" (Volatile Stormdrake): from abilities, not spells.
  const hx = /^hexproof from (white|blue|black|red|green|each color|monocolored|multicolored|activated and triggered abilities)$/.exec(p);
  if (hx) return `Hexproof from ${hx[1]}`;
  if (p === "hexproof from the chosen color") return CHOSEN_HEXPROOF;
  // "Gains toxic 1" (Skrelv): a keyword with a number (CR 702.164a).
  const tox = /^toxic (\d+)$/.exec(p);
  if (tox) return `Toxic ${tox[1]}`;
  const m = /^protection from (.+)$/.exec(p);
  if (!m) return undefined;
  const q = m[1]!;
  if (q === "each of your opponents") return PROTECTION_FROM_OPPONENTS;
  if (q === "spells" || q === "permanents that were cast this turn") return `Protection from ${q}`;
  if (q === "the chosen player") return CHOSEN_PLAYER_PROTECTION;
  if (q === "each color that's not in your commander's color identity") return IDENTITY_PROTECTION;
  if (q === "everything" || q === "multicolored" || q === "monocolored" || q === "colorless" || q === "each color" || q === "all colors" || q === "the chosen color") return q === "the chosen color" ? CHOSEN_PROTECTION : `Protection from ${q}`;
  if (PROTECTION_TYPES[q]) return `Protection from ${q}`;
  if (/^mana value \d+ or (?:less|greater)$/.test(q)) return `Protection from ${q}`;
  const st = creatureTypeOfPlural(q);
  return st ? `Protection from ${text.trim().slice(-q.length).replace(/^./, (c) => c.toUpperCase())}` : undefined;
}
/** "Becomes the creature type of your choice": a subtype filled in with the type chosen as it resolved. */
export const CHOSEN_TYPE = "(the chosen creature type)";
/** "Becomes the basic land type of your choice": filled in with the basic land type chosen as it resolved. */
export const CHOSEN_LAND_TYPE = "(the chosen basic land type)";
/** "Gains your choice of menace or lifelink": filled in with the keyword chosen as it resolved. */
export const CHOSEN_KEYWORD = "(the chosen keyword)";
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
const PLAYER_PROTECTION = /^Protection from player #(\d+)$/;
/** A keyword as shown to people: "Protection from player #2" names that player. */
export const keywordLabel = (k: string, name: (pid: number) => string) => k.replace(PLAYER_PROTECTION, (_, n: string) => `Protection from ${name(Number(n))}`);
/** "Protection from the chosen color": filled in with the color chosen as it resolved or entered. */
export const CHOSEN_PROTECTION = "Protection from the chosen color";
/** "Hexproof from that color" after "Choose a color" (Skrelv): filled in with the color chosen as it resolved (CR 702.11d). */
export const CHOSEN_HEXPROOF = "Hexproof from the chosen color";
const COLOR_WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
/**
 * "Protection from each color that's not in your commander's color identity" (Commander's Plate): filled in with the
 * colors outside the combined color identity of the commanders of the effect's controller; none if they have no
 * commander (rulings).
 */
export const IDENTITY_PROTECTION = "Protection from each color not in your commander's color identity";
/** "Protection from the chosen card type" (Serra's Emissary): the card type chosen as the source entered (CR 702.16a). */
export const CHOSEN_TYPE_PROTECTION = "Protection from the chosen card type";
/** The card types a player may name in a game here (rulings on Serra's Emissary; kindred cards aren't supported), as protection says them. */
export const CARD_TYPE_PLURAL: Record<string, string> = { Artifact: "artifacts", Battle: "battles", Creature: "creatures", Enchantment: "enchantments", Instant: "instants", Land: "lands", Planeswalker: "planeswalkers", Sorcery: "sorceries" };
/**
 * Keywords with "the chosen color" filled in; without a choice, that protection is dropped. `identity`: the colors in the
 * color identity of the commanders of the effect's controller, undefined if they have none.
 */
export const bindChosenKeywords = (keywords: readonly string[], color: string | undefined, identity?: readonly string[], cardType?: string) =>
  keywords.flatMap((k) =>
    k === CHOSEN_TYPE_PROTECTION
      ? cardType && CARD_TYPE_PLURAL[cardType] ? [`Protection from ${CARD_TYPE_PLURAL[cardType]}`] : []
      : k === CHOSEN_PROTECTION || k === CHOSEN_HEXPROOF
      ? color && COLOR_WORD[color] ? [`${k === CHOSEN_HEXPROOF ? "Hexproof" : "Protection"} from ${COLOR_WORD[color]}`] : []
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
    if ((q === "each color" || q === "all colors") && src.colors.length > 0) return true;
    if (q === "multicolored" && src.colors.length > 1) return true;
    if (q === "monocolored" && src.colors.length === 1) return true;
    if (q === "colorless" && src.colors.length === 0) return true;
    if (PROTECTION_TYPES[q] && src.types?.includes(PROTECTION_TYPES[q])) return true;
    // "Protection from mana value 3 or less" (Reaver Titan), "... 3 or greater" (Mistmeadow Skulk): an object with no mana
    // cost has mana value 0 (CR 202.3a), a spell's counts its X (CR 202.3e, rulings on Reaver Titan).
    const mv = /^mana value (\d+) or (less|greater)$/.exec(q);
    if (mv && (mv[2] === "less" ? (src.manaValue ?? 0) <= Number(mv[1]) : (src.manaValue ?? 0) >= Number(mv[1]))) return true;
    const st = creatureTypeOfPlural(q);
    if (st && src.subtypes?.includes(st)) return true;
  }
  return false;
}

/**
 * "Hexproof from [quality]" (CR 702.11d): can't be the target of [quality] spells its opponents control or abilities
 * they control from [quality] sources. `src` is the spell or the ability's source; who controls it is checked by the caller.
 */
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
const LAND_TYPES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Desert", "Gate", "Lair", "Locus", "Mine", "Power-Plant", "Tower", "Urza's", "Cave", "Sphere", "Town", "Planet"]);
const ARTIFACT_TYPES = new Set(["Attraction", "Blood", "Bobblehead", "Clue", "Contraption", "Equipment", "Food", "Fortification", "Gold", "Incubator", "Infinity", "Junk", "Lander", "Map", "Mutagen", "Powerstone", "Spacecraft", "Stone", "Terminus", "Treasure", "Vehicle"]);
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

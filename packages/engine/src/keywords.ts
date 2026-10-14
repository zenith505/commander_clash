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
  "Horsemanship", // CR 702.31b: can't be blocked except by creatures with horsemanship
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
] as const;
export type SupportedKeyword = (typeof SUPPORTED_KEYWORDS)[number];

const PROTECTION_COLOR: Record<string, "W" | "U" | "B" | "R" | "G"> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const PROTECTION_TYPES: Record<string, string> = {
  artifacts: "Artifact", creatures: "Creature", enchantments: "Enchantment", instants: "Instant", sorceries: "Sorcery",
  planeswalkers: "Planeswalker", lands: "Land",
};

/** What protection looks at in a source (CR 702.16a): its colors, card types and subtypes. */
export interface SourceQuality {
  colors: readonly string[];
  types?: readonly string[];
  subtypes?: readonly string[];
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
  const m = /^protection from (.+)$/.exec(p);
  if (!m) return undefined;
  const q = m[1]!;
  if (q === "everything" || q === "multicolored" || q === "monocolored" || q === "colorless" || q === "each color" || q === "all colors" || q === "the chosen color") return q === "the chosen color" ? CHOSEN_PROTECTION : `Protection from ${q}`;
  if (PROTECTION_TYPES[q]) return `Protection from ${q}`;
  const st = creatureTypeOfPlural(q);
  return st ? `Protection from ${text.trim().slice(-q.length).replace(/^./, (c) => c.toUpperCase())}` : undefined;
}
/** "Protection from the chosen color": filled in with the color chosen as it resolved or entered. */
export const CHOSEN_PROTECTION = "Protection from the chosen color";
const COLOR_WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
/** Keywords with "the chosen color" filled in; without a choice, that protection is dropped. */
export const bindChosenKeywords = (keywords: readonly string[], color: string | undefined) =>
  keywords.flatMap((k) => (k === CHOSEN_PROTECTION ? (color && COLOR_WORD[color] ? [`Protection from ${COLOR_WORD[color]}`] : []) : [k]));
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
export function protectedFrom(keywords: readonly string[], src: SourceQuality): boolean {
  for (const k of keywords) {
    const m = /^protection from (.+)$/i.exec(k);
    if (!m) continue;
    const q = m[1]!.toLowerCase();
    if (PROTECTION_COLOR[q] && src.colors.includes(PROTECTION_COLOR[q])) return true;
    if (q === "everything") return true;
    if ((q === "each color" || q === "all colors") && src.colors.length > 0) return true;
    if (q === "multicolored" && src.colors.length > 1) return true;
    if (q === "monocolored" && src.colors.length === 1) return true;
    if (q === "colorless" && src.colors.length === 0) return true;
    if (PROTECTION_TYPES[q] && src.types?.includes(PROTECTION_TYPES[q])) return true;
    const st = creatureTypeOfPlural(q);
    if (st && src.subtypes?.includes(st)) return true;
  }
  return false;
}

/** A creature's total toxic value: the sum of its "Toxic N" abilities (CR 702.164b). */
export const toxicValue = (keywords: readonly string[]) =>
  keywords.reduce((n, k) => n + Number(/^toxic (\d+)$/i.exec(k)?.[1] ?? 0), 0);

/** Remove reminder text in parentheses. */
export const stripReminder = (text: string) => text.replace(/\s*\([^)]*\)/g, "").trim();

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
const LAND_TYPES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Desert", "Gate", "Lair", "Locus", "Mine", "Power-Plant", "Tower", "Urza's", "Cave", "Sphere", "Town"]);
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

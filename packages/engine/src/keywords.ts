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
  // card data (CR 702.114a); Changeling gives every creature type (CR 702.73a); Partner only
  // matters for deck building (CR 702.124).
  "Devoid",
  "Changeling",
  "Partner",
] as const;
export type SupportedKeyword = (typeof SUPPORTED_KEYWORDS)[number];

const PROTECTION_COLOR: Record<string, "W" | "U" | "B" | "R" | "G"> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

/** The colors a permanent with these keywords has protection from (CR 702.16). */
export function protectionColors(keywords: readonly string[]): ("W" | "U" | "B" | "R" | "G")[] {
  const out: ("W" | "U" | "B" | "R" | "G")[] = [];
  for (const k of keywords) {
    const m = /^protection from (white|blue|black|red|green)$/i.exec(k);
    if (m) out.push(PROTECTION_COLOR[m[1]!.toLowerCase()]!);
  }
  return out;
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

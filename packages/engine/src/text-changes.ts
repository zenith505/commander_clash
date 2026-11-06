// Text-changing effects (CR 612): "Change the text of target spell or permanent by replacing all instances of one color
// word with another" (Sleight of Mind), "... one basic land type with another" (Magical Hack), "... one creature type with
// another" (Artificial Evolution). They apply in layer 3 (CR 613.1c), in timestamp order (613.7), to the object's rules
// text and type line (612.1; rulings: "alters all occurrences of the chosen word in the text box and the type line"), on
// top of its copiable values (layer 1), so a copy of it doesn't copy them (707.2).
import { CREATURE_TYPES, creatureTypeOfPlural } from "./keywords";
import type { CardDef, TextChange } from "./types";

/** The color words (CR 105.1), as a text change names them. */
export const COLOR_WORDS = ["white", "blue", "black", "red", "green"] as const;
/** The basic land types (CR 205.3i, 305.6). */
export const BASIC_LAND_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"] as const;

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the word as written starts with a capital letter: the new word is written the same way. */
const cased = (as: string, word: string) => (/^[A-Z]/.test(as) ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toLowerCase() + word.slice(1));

/** A creature type's plural as rules text writes it ("Elves", "Faeries", "Foxes", "Vampires"). */
export function creatureTypePlural(t: string): string {
  const special: Record<string, string> = { Dwarf: "Dwarves", Elf: "Elves", Wolf: "Wolves", Werewolf: "Werewolves", Fish: "Fish", Sheep: "Sheep", Ox: "Oxen", Mouse: "Mice", Octopus: "Octopuses", Homunculus: "Homunculi", Nightstalker: "Nightstalkers", Fungus: "Fungi", Cyclops: "Cyclopes", Sphinx: "Sphinxes", Phoenix: "Phoenixes", Fox: "Foxes", Lynx: "Lynxes", Moonfolk: "Moonfolk", Kithkin: "Kithkin", Merfolk: "Merfolk", Kor: "Kor", Atog: "Atogs" };
  if (special[t]) return special[t]!;
  if (/[^aeiou]y$/.test(t)) return `${t.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(t)) return `${t}es`;
  return `${t}s`;
}

/**
 * The forms of a creature type rules text uses: singular, and the plurals the engine reads back as that type
 * (creatureTypeOfPlural), longest first so "Elves" isn't read as "Elf" + "ves".
 */
function creatureForms(t: string): string[] {
  const out = new Set([t]);
  for (const p of [creatureTypePlural(t), `${t}s`, `${t}es`]) if (p !== t && creatureTypeOfPlural(p) === t) out.add(p);
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Replace each instance of `c.from` used as a color word, basic land type or creature type (CR 612.2) in `text`: "nonblack"
 * too (rulings on Glamerdye), "swampwalk" and "Swampcycling" too (rulings on Trait Doctoring: part of a word, when that
 * part refers to the land type). Never a card name (612.2): the card's own name and names after "named" are left alone.
 */
export function changeWords(text: string, c: TextChange, names: string[]): string {
  // Names first, longest first, out of the way (CR 612.2: "can't change a card name").
  const kept: string[] = [];
  const hide = (m: string) => `\u0005${kept.push(m) - 1}\u0005`;
  let t = text;
  for (const n of [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "gu"), hide);
  t = t.replace(/(\bnamed )([A-Z][\w'-]*(?:,? (?:of|the|and|[A-Z][\w'-]*))*)/g, (_, a: string, n: string) => `${a}${hide(n)}`);
  if (c.kind === "color") {
    // "Black", "black", "nonblack", "non-black" (CR 105.1, 612.2); never a mana symbol (rulings: "won't change mana symbols").
    t = t.replace(new RegExp(`(?<![\\p{L}])(non-?)?(${esc(c.from)})(?![\\p{L}])`, "giu"), (_, non: string | undefined, w: string) => `${non ?? ""}${cased(w, c.to)}`);
  } else if (c.kind === "basicLandType") {
    // "Island", "Islands", "islandwalk", "Islandcycling", "non-Island", "nonIsland" (CR 205.3i, 702.14, 702.29).
    const plural = (w: string) => (w === "Plains" ? "Plains" : `${w}s`);
    const fromPlural = plural(c.from);
    t = t.replace(new RegExp(`(?<![\\p{L}])(non-?)?(${esc(fromPlural)}|${esc(c.from)})(walk|cycling)?(?![\\p{L}])`, "giu"), (m: string, non: string | undefined, w: string, suffix: string | undefined) => {
      // "Plains" is both singular and plural: it stays one word ("Plains" -> "Island" reads "Island(s)" by the context
      // the engine parses: a plural after "number of", "all", "two" and such).
      const isPlural = w.toLowerCase() === fromPlural.toLowerCase() && fromPlural !== c.from;
      return `${non ?? ""}${cased(w, isPlural ? plural(c.to) : c.to)}${suffix ?? ""}`;
    });
  } else {
    // A creature type is written capitalized ("Goblin", "Goblins", "non-Goblin"): only those words (CR 205.3m).
    const fromForms = creatureForms(c.from);
    const toPlural = creatureTypePlural(c.to);
    t = t.replace(new RegExp(`(?<![\\p{L}'-])(non-)?(${fromForms.map(esc).join("|")})(?![\\p{L}'])`, "gu"), (_, non: string | undefined, w: string) => `${non ?? ""}${w === c.from ? c.to : toPlural}`);
  }
  return t.replace(/\u0005(\d+)\u0005/g, (_, i: string) => kept[Number(i)]!);
}

/** The key a definition with these text changes has in GameState.cards. */
export const textChangesKey = (base: string, changes: TextChange[]): string => `${base}|words:${changes.map((c) => `${c.kind}:${c.from}>${c.to}`).join(",")}`;

/** The subtypes on the type line after a text change: a land type or creature type there is replaced (rulings). */
function changeSubtypes(subtypes: string[], c: TextChange): string[] {
  if (c.kind === "color") return subtypes;
  if (c.kind === "creatureType" && !CREATURE_TYPES.has(c.from)) return subtypes;
  return [...new Set(subtypes.map((x) => (x === c.from ? c.to : x)))];
}

/**
 * `d` with the text changes applied in order (each to the text the ones before left, CR 613.7): its rules text, its
 * keywords as the card data lists them ("Swampwalk"), and the subtypes on its type line.
 */
export function withTextChanges(d: CardDef, changes: TextChange[], key: string): CardDef {
  const full = d.name.split(" // ")[0]!;
  const names = [full, full.split(",")[0]!];
  let text = d.oracleText;
  let keywords = [...d.keywords];
  let subtypes = [...d.subtypes];
  for (const c of changes) {
    text = changeWords(text, c, names);
    keywords = keywords.map((k) => changeWords(k, c, []));
    subtypes = changeSubtypes(subtypes, c);
  }
  const head = d.typeLine.split(" — ")[0]!;
  const typeLine = subtypes.length ? `${head} — ${subtypes.join(" ")}` : head;
  // `d` is already the face it is now (ownDefOf, restingDef): the changed text is the whole of it.
  const { faces: _faces, ...rest } = d;
  return { ...rest, oracleId: key, oracleText: text, keywords, subtypes, typeLine };
}

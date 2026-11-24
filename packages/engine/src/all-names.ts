// Spy Kit (round 461): "Equipped creature ... has all names of nonlegendary creature cards in addition to its name." A
// text-changing effect on the name (CR 612.7, layer 3): the object has the name of each nonlegendary creature card in the
// Oracle card reference (rulings: the back faces of double-faced cards too; not the names of tokens, such as "Zombie
// Token", or of noncreature cards that have become creatures). A permanent's names are read here as a NameView: the name
// it has (Characteristics.name, "A // B" for two) and whether it also has all those names (Characteristics.allNames).
//
// How names compare (CR 201.2a-c): two objects have the same name if they have at least one name in common; a group has
// different names only if each has a name and no two of them have one in common; an object with no name (face down,
// CR 708.2) shares a name with nothing.
//
// The game's data holds only the cards in this game, so "is this the name of a nonlegendary creature card?" is answered
// from their definitions (GameState.cards: every card's printed faces, whatever zone it's in, and any card brought in
// later) and, for a name that only reaches the game through rules text ("a token named Llanowar Elves"), from
// SPY_KIT_TEXT_NAMES (generated from the whole card data by tools/spy-kit-names.ts). A name from anywhere else can't come
// up: names chosen for "choose a card name" are those of the cards in the game (names.ts cardNameOptions), and a token's
// own name is its subtypes and "Token" (CR 111.4), never a card's.
import type { CardDef, CardFace, GameState } from "./types";
import { hasName, sameName } from "./faces";
import { SPY_KIT_TEXT_NAMES } from "./spy-kit-names";

/** A name as rules compare it: the object's own name(s) ("A // B"), and whether it also has all names of nonlegendary creature cards. */
export interface NameView {
  /** Undefined: it has no name (face down, CR 708.2a). */
  name: string | undefined;
  /** Spy Kit (CR 612.7): it also has the name of every nonlegendary creature card. */
  all?: boolean;
}

const TEXT_NAMES = new Set(SPY_KIT_TEXT_NAMES);

/** A face (or a card with no faces) that's a nonlegendary creature card's (CR 612.7). */
const nonlegendaryCreature = (f: Pick<CardFace, "types" | "supertypes">): boolean => f.types.includes("Creature") && !f.supertypes.includes("Legendary");

/** The names a printed card definition gives nonlegendary creature cards: each such face's (rulings: back faces too). */
export function nonlegendaryCreatureNamesOf(d: CardDef): string[] {
  if (d.faces?.length) return d.faces.filter(nonlegendaryCreature).map((f) => f.name);
  return nonlegendaryCreature(d) ? [d.name] : [];
}

/**
 * A printed card's own definition in GameState.cards: not a token's (CR 111.4, rulings), nor one the engine makes from a
 * card (a face, a copy with exceptions, a text change: their keys have a "|"), nor a game marker (the monarch, a dungeon).
 * A meld pair's melded permanent counts: it's printed as the back faces of its two cards (CR 712.4).
 */
const printedCard = (key: string, d: CardDef): boolean => !key.includes("|") && !key.startsWith("token:") && !d.supertypes.includes("Token") && !d.faceOf && d.oracleId === key && d.types.length > 0;

const cache = new WeakMap<Record<string, CardDef>, { n: number; names: Set<string> }>();

/** The nonlegendary creature card names among the cards in this game (GameState.cards), cached until a card is added. */
function gameNames(s: GameState): Set<string> {
  const n = Object.keys(s.cards).length;
  const hit = cache.get(s.cards);
  if (hit && hit.n === n) return hit.names;
  const names = new Set<string>();
  for (const [key, d] of Object.entries(s.cards)) if (printedCard(key, d)) for (const x of nonlegendaryCreatureNamesOf(d)) names.add(x);
  cache.set(s.cards, { n, names });
  return names;
}

/** Is `name` the name of a nonlegendary creature card (CR 612.7)? One name ("Grizzly Bears"), not "A // B". */
export function isNonlegendaryCreatureCardName(s: GameState, name: string): boolean {
  return TEXT_NAMES.has(name) || gameNames(s).has(name);
}

/** Does it have this name (CR 201.2a)? A split name "A // B" has either. */
export function viewHasName(s: GameState, v: NameView, name: string): boolean {
  if (v.name === undefined) return false;
  if (hasName(v.name, name)) return true;
  return !!v.all && name.split(" // ").some((n) => isNonlegendaryCreatureCardName(s, n));
}

/** Do the two have the same name: at least one name in common (CR 201.2a)? One with no name shares none. */
export function viewsShareName(s: GameState, a: NameView, b: NameView): boolean {
  if (a.name === undefined || b.name === undefined) return false;
  if (sameName(a.name, b.name)) return true;
  if (a.all && b.all) return true;
  if (a.all) return b.name.split(" // ").some((n) => isNonlegendaryCreatureCardName(s, n));
  if (b.all) return a.name.split(" // ").some((n) => isNonlegendaryCreatureCardName(s, n));
  return false;
}

/**
 * In a list of names a filter holds (TargetSpec namedAny, notNamedAny): Spy Kit's "all names of nonlegendary creature
 * cards", which a permanent's names stand for alongside its own (viewNames).
 */
export const ALL_NONLEGENDARY_CREATURE_NAMES = "\u0007all names of nonlegendary creature cards";

/**
 * An object's names as one entry of a list of names (TargetSpec namedAny, namedLike; a search's names, one for each
 * object): its own, joined with Spy Kit's marker as a split card's two names are ("A // marker"). None if it has no name.
 */
export const viewNames = (v: NameView): string[] => (v.name === undefined ? [] : [joinedName({ name: v.name, all: v.all })]);

/** A view as one name string: its own name, with Spy Kit's marker joined on (" // ", as a split card's names). */
export const joinedName = (v: NameView & { name: string }): string => (v.all ? `${v.name} // ${ALL_NONLEGENDARY_CREATURE_NAMES}` : v.name);

/** A joined name (joinedName) back as a view. */
export function splitName(n: string): NameView {
  const parts = n.split(" // ");
  if (!parts.includes(ALL_NONLEGENDARY_CREATURE_NAMES)) return { name: n };
  return { name: parts.filter((p) => p !== ALL_NONLEGENDARY_CREATURE_NAMES).join(" // "), all: true };
}

/** A joined name for the log and prompts: Spy Kit's marker read out. */
export const nameLabel = (n: string): string => n.replace(` // ${ALL_NONLEGENDARY_CREATURE_NAMES}`, " (or any nonlegendary creature card's name)");

/**
 * Is a card (not a permanent: a card elsewhere, a spell) named like one of these (CR 201.2a)? Spy Kit's marker matches a
 * nonlegendary creature card: its definition's own name is then such a card's (each face judged on its own, rulings).
 * A token isn't a card (rulings: Spy Kit gives no token names).
 */
export function defNamedAny(d: CardDef, names: string[]): boolean {
  return names.some((n) => {
    const v = splitName(n);
    if (v.name && sameName(d.name, v.name)) return true;
    return !!v.all && !d.supertypes.includes("Token") && (d.faces?.length ? nonlegendaryCreatureNamesOf(d).some((x) => hasName(d.name, x)) : nonlegendaryCreature(d));
  });
}

/** Does a permanent's names (view) include one of these names (a list with Spy Kit's marker too, viewNames)? */
export function viewNamedAny(s: GameState, v: NameView, names: string[]): boolean {
  return names.some((n) => viewsShareName(s, v, splitName(n)));
}

/** A permanent's characteristics (or what it was as it last existed) as a view; `faceDown`: no name (CR 708.2a). */
export const charView = (c: { name: string; allNames?: true }, faceDown?: boolean): NameView => (faceDown ? { name: undefined } : c.allNames ? { name: c.name, all: true } : { name: c.name });

/** A plain name as a view. */
export const plainName = (name: string | undefined): NameView => ({ name });

/** Do they have different names (CR 201.2b): each has a name and no two have one in common? */
export function viewsAllDifferent(s: GameState, views: NameView[]): boolean {
  for (let i = 0; i < views.length; i++) {
    if (views[i]!.name === undefined) return false;
    for (let j = i + 1; j < views.length; j++) if (viewsShareName(s, views[i]!, views[j]!)) return false;
  }
  return true;
}

/**
 * The most of these that have different names (CR 201.2b), "the number of differently named lands you control": the
 * largest group of them in which each has a name and no two have one in common. Without Spy Kit that's the number of
 * different names among them; an object with all names of nonlegendary creature cards shares one with every other such
 * object and with each named like a nonlegendary creature card, so at most one of those is in the group.
 */
export function differentlyNamedCount(s: GameState, views: NameView[]): number {
  const named = views.filter((v) => v.name !== undefined);
  return largestDifferent(s, named).length;
}

/** The indexes (into `views`) of a largest group of them with different names (CR 201.2b); the earliest ones win ties. */
export function largestDifferentlyNamed(s: GameState, views: NameView[]): number[] {
  const idx = views.map((v, i) => ({ v, i })).filter((x) => x.v.name !== undefined);
  return largestDifferent(s, idx.map((x) => x.v)).map((k) => idx[k]!.i);
}

/** Indexes into `views` (all named): a largest pairwise name-disjoint group (greedy is exact without Spy Kit; with it, each choice of one is tried). */
function largestDifferent(s: GameState, views: NameView[]): number[] {
  const greedy = (pool: number[]): number[] => {
    const out: number[] = [];
    for (const i of pool) if (out.every((j) => !viewsShareName(s, views[i]!, views[j]!))) out.push(i);
    return out;
  };
  const plain = views.map((_, i) => i).filter((i) => !views[i]!.all);
  // Plain names: names in common are equal names (or a split card's halves), so one of each name, first come first kept.
  // A split card's two names could make greedy miss the best group; the engine has no permanents like that with Spy Kit
  // out, and with only one-named objects (or none sharing halves) greedy is exact.
  let best = greedy(plain);
  for (const k of views.map((_, i) => i).filter((i) => views[i]!.all)) {
    const withIt = [k, ...greedy(plain.filter((i) => !viewsShareName(s, views[i]!, views[k]!)))];
    if (withIt.length > best.length) best = withIt;
  }
  return best.sort((a, b) => a - b);
}

/**
 * The most of these with one name in common (CR 201.2a: "N or more creatures with the same name"): for each name any of
 * them has, how many have it. Every one with all names of nonlegendary creature cards has each such name, and those
 * names include every one of them, so they count with each other and with any named like a nonlegendary creature card.
 */
export function mostWithSameName(s: GameState, views: NameView[]): number {
  const named = views.filter((v) => v.name !== undefined);
  const spies = named.filter((v) => v.all).length;
  const names = new Set(named.flatMap((v) => v.name!.split(" // ")));
  let best = spies; // all of them share each nonlegendary creature card's name
  for (const n of names) best = Math.max(best, named.filter((v) => viewHasName(s, v, n)).length);
  return best;
}

/**
 * Spy Kit's names that reach a game only through rules text (tools/spy-kit-names.ts): each nonlegendary creature card
 * name (any face) that some card's text mentions as a whole phrase.
 */
export function spyKitTextNames(cards: CardDef[]): string[] {
  const all = new Set(cards.flatMap(nonlegendaryCreatureNamesOf));
  // Indexed by first word, so each text is scanned once.
  const byFirst = new Map<string, string[]>();
  for (const n of all) {
    const w = n.split(" ")[0]!;
    (byFirst.get(w) ?? byFirst.set(w, []).get(w)!).push(n);
  }
  const found = new Set<string>();
  const texts = cards.flatMap((c) => [c.oracleText, ...(c.faces ?? []).map((f) => f.oracleText)]);
  for (const t of texts) {
    for (const m of t.matchAll(/(?<![\p{L}\p{N}'-])[\p{Lu}][^\s]*/gu)) {
      const at = m.index!;
      const w = m[0].replace(/[.,;:!?)"]+$/, "");
      for (const n of byFirst.get(w) ?? []) {
        if (found.has(n) || !t.startsWith(n, at)) continue;
        const after = t.charAt(at + n.length);
        if (!/[\p{L}\p{N}]/u.test(after)) found.add(n);
      }
    }
  }
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

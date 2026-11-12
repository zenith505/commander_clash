import type { CopyExcept } from "../copies";
import type { CountMod, TokenSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { BASIC_TYPES, COLOR_WORDS, TYPE_WORDS, capital } from "./words";
import { parseKeywordList } from "./targets";
import { compileQuoted, innerQuotes } from "./grants";
import { QUOTED_SOURCE_NAME } from "./compile";

/** Tokens the rules define (CR 111.10). */
export const PREDEFINED_TOKENS: Record<string, TokenSpec> = {
  Treasure: { name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"], keywords: [], abilities: "{T}, Sacrifice this token: Add one mana of any color." },
  Food: { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"], keywords: [], abilities: "{2}, {T}, Sacrifice this token: You gain 3 life." },
  Clue: { name: "Clue", colors: [], types: ["Artifact"], subtypes: ["Clue"], keywords: [], abilities: "{2}, Sacrifice this token: Draw a card." },
  // CR 111.10h
  Powerstone: { name: "Powerstone", colors: [], types: ["Artifact"], subtypes: ["Powerstone"], keywords: [], abilities: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
  // CR 111.10c-g, 111.10s-x
  Gold: { name: "Gold", colors: [], types: ["Artifact"], subtypes: ["Gold"], keywords: [], abilities: "Sacrifice this token: Add one mana of any color." },
  Shard: { name: "Shard", colors: [], types: ["Enchantment"], subtypes: ["Shard"], keywords: [], abilities: "{2}, Sacrifice this token: Scry 1, then draw a card." },
  Blood: { name: "Blood", colors: [], types: ["Artifact"], subtypes: ["Blood"], keywords: [], abilities: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card." },
  Map: { name: "Map", colors: [], types: ["Artifact"], subtypes: ["Map"], keywords: [], abilities: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." },
  Junk: { name: "Junk", colors: [], types: ["Artifact"], subtypes: ["Junk"], keywords: [], abilities: "{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery." },
  Lander: { name: "Lander", colors: [], types: ["Artifact"], subtypes: ["Lander"], keywords: [], abilities: "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." },
  Mutagen: { name: "Mutagen", colors: [], types: ["Artifact"], subtypes: ["Mutagen"], keywords: [], abilities: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery." },
  Vibranium: { name: "Vibranium", colors: [], types: ["Artifact"], subtypes: ["Vibranium"], keywords: ["Indestructible"], abilities: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
  Heartwood: { name: "Heartwood", colors: ["R", "G"], types: ["Artifact"], subtypes: ["Heartwood"], keywords: [], abilities: "{T}: Add {R} or {G}." },
  // CR 111.10d
  Walker: { name: "Walker", power: 2, toughness: 2, colors: ["B"], types: ["Creature"], subtypes: ["Zombie"], keywords: [] },
};

/**
 * Tokens that are copies of a card in the Oracle card reference, named by it (Ginger, Queen of Sweets: "create a
 * Gingerbrute token", rulings): that card's characteristics, mana cost included (CR 111.3).
 */
export const CARD_TOKENS: Record<string, TokenSpec> = {
  // Tarmogoyf Nest, Disa the Restless: "a Tarmogoyf token" is a copy of the card Tarmogoyf (rulings): {1}{G}, so green
  // (CR 105.2, 202.2), whose power and toughness its characteristic-defining ability sets (CR 604.3), */1+* in print.
  Tarmogoyf: { name: "Tarmogoyf", named: true, manaCost: "{1}{G}", power: 0, toughness: 1, colors: ["G"], types: ["Creature"], subtypes: ["Lhurgoyf"], keywords: [], abilities: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1." },
  // Ral and the Implicit Maze: "a Spellgorger Weird token" is a copy of the card Spellgorger Weird (rulings): {2}{R}, red.
  "Spellgorger Weird": { name: "Spellgorger Weird", named: true, manaCost: "{2}{R}", power: 2, toughness: 2, colors: ["R"], types: ["Creature"], subtypes: ["Weird"], keywords: [], abilities: "Whenever you cast a noncreature spell, put a +1/+1 counter on this creature." },
  Gingerbrute: { name: "Gingerbrute", named: true, manaCost: "{1}", power: 1, toughness: 1, colors: [], types: ["Artifact", "Creature"], subtypes: ["Food", "Golem"], keywords: ["Haste"], abilities: "{1}: This creature can't be blocked this turn except by creatures with haste.\n{2}, {T}, Sacrifice this creature: You gain 3 life." },
};

/** Role tokens (CR 111.10j-r, 303.7): colorless Aura Role enchantment tokens with enchant creature, created attached to a creature. */
const role = (name: string, text: string): TokenSpec => ({ name, colors: [], types: ["Enchantment"], subtypes: ["Aura", "Role"], keywords: [], abilities: `Enchant creature\n${text}` });
export const ROLE_TOKENS: Record<string, TokenSpec> = {
  Cursed: role("Cursed", "Enchanted creature has base power and toughness 1/1."),
  Monster: role("Monster", "Enchanted creature gets +1/+1 and has trample."),
  Royal: role("Royal", "Enchanted creature gets +1/+1 and has ward {1}."),
  Sorcerer: role("Sorcerer", 'Enchanted creature gets +1/+1 and has "Whenever this creature attacks, scry 1."'),
  Virtuous: role("Virtuous", "Enchanted creature gets +1/+1 for each enchantment you control."),
  Wicked: role("Wicked", "Enchanted creature gets +1/+1.\nWhen this token is put into a graveyard from the battlefield, each opponent loses 1 life."),
  "Young Hero": role("Young Hero", 'Enchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it."'),
};

/** An Incubator token (CR 701.53b, 111.10i): a colorless Incubator artifact, and on its back a 0/0 Phyrexian artifact creature. */
export const INCUBATOR: TokenSpec = {
  name: "Incubator",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Incubator"],
  keywords: [],
  abilities: "{2}: Transform this token.",
  back: { name: "Phyrexian", power: 0, toughness: 0, colors: [], types: ["Artifact", "Creature"], subtypes: ["Phyrexian"], keywords: [] },
};

export function parseToken(power: number, toughness: number, desc: string, withText?: string): TokenSpec | null {
  // desc: "white Soldier", "green and white Elf Warrior", "colorless Thopter artifact"
  // "red, green, and white Sand Warrior" (Sand Scout): three colors or more, with commas.
  const words = desc.replace(/^((?:[a-z]+, )+)and /, (_, list: string) => `${list.replace(/, /g, " and ")}`).split(/\s+/);
  const colors: Color[] = [];
  const subtypes: string[] = [];
  const types = ["Creature"];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (COLOR_WORDS[lw]) colors.push(COLOR_WORDS[lw]!);
    else if (lw === "and" || lw === "colorless") continue;
    else if (lw === "artifact" || lw === "enchantment") types.unshift(TYPE_WORDS[lw]!);
    // "1/1 green Forest Dryad land creature" (Awaken the Woods): a basic land type gives it "{T}: Add {G}" (CR 305.6).
    else if (lw === "land") types.unshift("Land");
    else if (CREATURE_TYPES.has(w) || (BASIC_TYPES.includes(w) && /\bland\b/.test(desc))) subtypes.push(w);
    // "A 1/1 colorless Shrine enchantment creature token" (Go-Shintai of Life's Origin): an enchantment type (CR 205.3h).
    else if (w === "Shrine" && /\benchantment\b/.test(desc)) subtypes.push(w);
    // Vraska, Soul of Stone: "a 1/1 colorless Sculpture Treasure artifact creature token": an artifact type too (rulings).
    else if (w === "Treasure" && /\bartifact\b/.test(desc) && subtypes.length) subtypes.push(w);
    else return null;
  }
  // 'with "Sacrifice ~: Add {C}."': an ability of its own (CR 111.3); 'with flying, haste, and "When this creature dies,
  // ..."': keywords and then one.
  // Ozox, the Clattering King: 'with "Jumblebones can't block" and "When Jumblebones leaves the battlefield, ..."': two
  // abilities of its own.
  const two = withText ? /^"([^"]+)" and "([^"]+)"$/.exec(withText) : null;
  if (two) {
    const texts = [innerQuotes(two[1]!), innerQuotes(two[2]!)];
    if (!subtypes.length || !texts.every((t) => compileQuoted(t))) return null;
    return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords: [], abilities: texts.join("\n") };
  }
  const quoted = withText && /^(?:(.+?),? and )?"([^"]+)"$/.exec(withText);
  const ability = quoted ? innerQuotes(quoted[2]!) : undefined;
  if (ability !== undefined && !compileQuoted(ability)) return null;
  const kwText = quoted ? quoted[1] : withText;
  // "A 1/1 white Monk creature token with prowess" (Monastery Mentor): a triggered keyword (CR 702.108a) is an ability
  // of the token's, as if printed.
  // "With firebending 1" (Firebender Ascension): the same, "Whenever this creature attacks, add {R}" (CR 702.189a).
  // "With training" (Torens, Fist of the Angels): likewise (CR 702.149a).
  // "With flying and devour 2" (Dragon Broodmother): devour is a static ability that works as the token enters (CR
  // 702.82a), written out as its ability like these.
  if (!quoted && (kwText === "prowess" || kwText === "training" || /^(?:firebending|devour) \d+$/.test(kwText ?? "")) && subtypes.length) return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords: [], abilities: kwText!.charAt(0).toUpperCase() + kwText!.slice(1) };
  // "With flying and firebending 4" (Avatar Roku): the keywords, and the triggered keyword as its ability.
  const trig = !quoted && kwText ? /^(.+?),? and (prowess|training|firebending \d+|devour \d+)$/.exec(kwText) : null;
  if (trig && subtypes.length) {
    const kws = parseKeywordList(trig[1]!);
    return kws ? { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords: kws, abilities: trig[2]!.charAt(0).toUpperCase() + trig[2]!.slice(1) } : null;
  }
  // The Girl in the Fireplace: 'with vanishing 3 and "Prevent all damage that would be dealt to this token."': vanishing
  // (CR 702.63a) written out as its ability too, before the quoted one.
  // Fugitive of the Judoon: "a 1/1 white Human creature token with ward {2}": ward (CR 702.21a) written out the same way, its
  // triggered ability as if printed.
  const vanishing = kwText ? /^(?:(.+?),? and )?(vanishing \d+|ward \{\d+\})$/.exec(kwText) : null;
  if (vanishing && subtypes.length) {
    const kws = vanishing[1] ? parseKeywordList(vanishing[1]) : [];
    const text = [vanishing[2]!.charAt(0).toUpperCase() + vanishing[2]!.slice(1), ...(ability !== undefined ? [ability] : [])].join("\n");
    return kws ? { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords: kws, abilities: text } : null;
  }
  // Riftmarked Knight: "with flanking, protection from white, and haste": flanking is a triggered ability (CR 702.25a),
  // kept among the keywords so the token's keyword line writes it out as its trigger, and so it counts as a creature
  // with flanking for another flanker's trigger (CR 702.25b).
  const flanking = kwText ? /^flanking(?:,? and |, )(.+)$/.exec(kwText) : null;
  const keywords = flanking ? (((k) => (k ? ["Flanking", ...k] : null))(parseKeywordList(flanking[1]!))) : kwText ? parseKeywordList(kwText) : [];
  if (!keywords || !subtypes.length) return null;
  return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords, ...(ability !== undefined ? { abilities: ability } : {}) };
}

/** "Food", "1/1 white Soldier creature", "1/1 colorless Thopter artifact creature with flying": one token. */
function tokenPhrase(p: string, withText?: string): TokenSpec | null {
  if (PREDEFINED_TOKENS[p]) return withText ? null : PREDEFINED_TOKENS[p]!;
  const m = /^(\d+)\/(\d+) (.+?) creature$/.exec(p);
  return m ? parseToken(Number(m[1]), Number(m[2]), m[3]!, withText) : null;
}

/** Token and counter doublers (CR 614.1a): Parallel Lives, Doubling Season, Hardened Scales, Xorn. */
export function parseCountMod(line: string): CountMod | undefined {
  let m = /^If (?:an effect would create one or more tokens( under your control)?, it creates|one or more tokens would be created( under your control)?,) twice that many of those tokens(?: are created)? instead\.$/.exec(line);
  if (m) return { what: "tokens", who: m[1] || m[2] ? "you" : "any", op: "double" };
  m = /^If you would create one or more ([A-Z][a-z]+) tokens, instead create those tokens plus an additional \1 token\.$/.exec(line);
  if (m) return { what: "tokens", who: "you", op: "plusOne", subtype: m[1]! };
  // Ojer Taq: "If one or more creature tokens would be created under your control, three times that many of those tokens
  // are created instead."
  m = /^If one or more (creature|artifact) tokens would be created under your control, (twice|three times) that many of those tokens are created instead\.$/.exec(line);
  if (m) return { what: "tokens", who: "you", op: m[2] === "twice" ? "double" : "triple", type: capital(m[1]!) };
  // Peregrin Took, Tippy-Toe, Donatello, Quina, Queen Allenal, Stridehangar Automaton, Worldwalker Helm.
  m =
    /^If one or more (creature |artifact )?tokens would be created under your control, those tokens plus (?:an additional |a )(.+?) token(?: with (.+?))? are created instead\.$/.exec(line) ??
    /^If you would create one or more (artifact )?tokens, instead create those tokens plus (?:an additional |a )(.+?) token\.$/.exec(line);
  if (m) {
    const token = tokenPhrase(m[2]!, m[3]);
    return token ? { what: "tokens", who: "you", op: "plusToken", token, ...(m[1] ? { type: capital(m[1].trim()) } : {}) } : undefined;
  }
  // Chatterfang: "those tokens plus that many 1/1 green Squirrel creature tokens".
  m = /^If one or more tokens would be created under your control, those tokens plus that many (.+?) tokens are created instead\.$/.exec(line);
  if (m) {
    const token = tokenPhrase(m[1]!);
    return token ? { what: "tokens", who: "you", op: "plusThatMany", token } : undefined;
  }
  // Divine Visitation: "If one or more creature tokens would be created under your control, that many 4/4 white Angel
  // creature tokens with flying and vigilance are created instead": each one is that token instead (rulings); "artifact
  // tokens" (Draconic Visitor).
  m = /^If one or more (creature|artifact) tokens would be created under your control, that many (.+?) tokens(?: with (.+?))? are created instead\.$/.exec(line);
  if (m) {
    const token = tokenPhrase(m[2]!, m[3]);
    return token ? { what: "tokens", who: "you", op: "instead", type: capital(m[1]!), token } : undefined;
  }
  // Fisher's Talent: "If you would create a Fish token, create a 3/3 blue Shark creature token instead.": each token you'd
  // create with that subtype is that token instead, with nothing else of the one it replaces (rulings); what the effect
  // says about the tokens (tapped, attacking) still applies. Its level 3 replaces a Shark the same way, the Shark its
  // level 2 made too (CR 616.1e).
  m = /^If you would create an? ([A-Z][a-z]+) token, create (an? \d+\/\d+ [a-z]+ [A-Z][a-z]+ creature) token instead\.$/.exec(line);
  if (m) {
    const token = tokenPhrase(m[2]!.replace(/^an? /, ""));
    return token && token.subtypes.length === 1 && token.subtypes[0] !== m[1] ? { what: "tokens", who: "you", op: "instead", subtype: m[1]!, token } : undefined;
  }
  // Jinnie Fay, Jetmir's Second: "If you would create one or more tokens, you may instead create that many 2/2 green Cat
  // creature tokens with haste or that many 3/1 green Dog creature tokens with vigilance." The tokens' characteristics are
  // entirely the chosen one's; what the effect says about them (tapped, attacking) still applies (rulings).
  m = /^If you would create one or more tokens, you may instead create that many (\d+\/\d+ [a-z]+ [A-Z][a-z]+ creature) tokens(?: with ([a-z]+))? or that many (\d+\/\d+ [a-z]+ [A-Z][a-z]+ creature) tokens(?: with ([a-z]+))?\.$/.exec(line);
  if (m) {
    const a = tokenPhrase(m[1]!, m[2]);
    const b = tokenPhrase(m[3]!, m[4]);
    return a && b ? { what: "tokens", who: "you", op: "mayInstead", tokens: [a, b] } : undefined;
  }
  // Mirrormind Crown, Moonlit Meditation, Esix, Fractal Bloom: copies instead, the first time each turn (CR 707.2).
  if (line === "As long as ~ is attached to a creature, the first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of equipped creature.") return { what: "tokens", who: "you", op: "mayInstead", copy: "host", hostCreature: true, first: "turn" };
  if (line === "The first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of enchanted permanent.") return { what: "tokens", who: "you", op: "mayInstead", copy: "host", first: "turn" };
  if (line === "The first time you would create one or more tokens during each of your turns, you may instead choose a creature other than ~ and create that many tokens that are copies of that creature.") return { what: "tokens", who: "you", op: "mayInstead", copy: "chosen", first: "yourTurn" };
  // Bilbo: "If you would create a Food token, instead create a Food token and a Treasure token."
  m = /^If you would create an? ([A-Z][a-z]+) token, instead create an? \1 token and an? ([A-Z][a-z]+) token\.$/.exec(line);
  if (m && PREDEFINED_TOKENS[m[1]!] && PREDEFINED_TOKENS[m[2]!]) return { what: "tokens", who: "you", op: "andEach", subtype: m[1]!, token: PREDEFINED_TOKENS[m[2]!]! };
  if (line === "If you would create a Clue, Food, or Treasure token, instead create one of each.") return { what: "tokens", who: "you", op: "oneOfEach", subtypes: ["Clue", "Food", "Treasure"] };
  // Kami of Whispered Hopes: "on a permanent you control".
  // Ozolith, the Shattered Spire: "on an artifact or creature you control".
  m = /^If one or more \+1\/\+1 counters would be put on (another|an?) (creature|permanent|artifact or creature)( you control)?, (twice that many|that many plus one) \+1\/\+1 counters are put on (?:it|that creature|that permanent) instead\.$/.exec(line);
  if (m) return { what: "counters", counter: "+1/+1", on: m[2] === "artifact or creature" ? "artifactOrCreature" : (m[2] as "creature" | "permanent"), who: m[3] ? "you" : "any", op: m[4] === "twice that many" ? "double" : "plusOne", ...(m[1] === "another" ? { other: true } : {}) };
  // Caradora, Heart of Alacria: "on a creature or Vehicle you control" (an artifact subtype, CR 205.3g).
  if (line === "If one or more +1/+1 counters would be put on a creature or Vehicle you control, that many plus one +1/+1 counters are put on it instead.")
    return { what: "counters", counter: "+1/+1", on: "creatureOrVehicle", who: "you", op: "plusOne" };
  // Zabaz, the Glimmerwasp: only the counters a modular trigger puts (CR 702.43a), on a creature its controller controls.
  if (line === "If a modular triggered ability would put one or more +1/+1 counters on a creature you control, that many plus one +1/+1 counters are put on it instead.")
    return { what: "counters", counter: "+1/+1", on: "creature", who: "you", op: "plusOne", modular: true };
  // Mowu, Loyal Companion: only on itself.
  if (line === "If one or more +1/+1 counters would be put on ~, that many plus one +1/+1 counters are put on it instead.") return { what: "counters", counter: "+1/+1", on: "permanent", who: "any", op: "plusOne", self: true };
  // Mauhúr, Uruk-hai Captain: "on an Army, Goblin, or Orc you control" (creature types, so a changeling counts).
  m = /^If one or more \+1\/\+1 counters would be put on an? ([A-Z][a-z]+), ([A-Z][a-z]+), or ([A-Z][a-z]+) you control, that many plus one \+1\/\+1 counters are put on it instead\.$/.exec(line);
  if (m && [m[1]!, m[2]!, m[3]!].every((st) => CREATURE_TYPES.has(st))) return { what: "counters", counter: "+1/+1", on: "permanent", who: "you", op: "plusOne", subtypes: [m[1]!, m[2]!, m[3]!] };
  // Winding Constrictor: counters of any kind (each kind one more, rulings). Pir, Imaginative Rascal: on any permanent
  // you control ("your team" is you outside a team game, CR 102.4; rulings: as permanents enter with counters too).
  m = /^If one or more counters would be put on (an artifact or creature|a permanent) you control, that many plus one of each of those kinds of counters are put on that permanent instead\.$/.exec(line);
  if (m) return { what: "counters", on: m[1] === "a permanent" ? "permanent" : "artifactOrCreature", who: "you", op: "plusOne" };
  if (line === "If you would get one or more counters, you get that many plus one of each of those kinds of counters instead.") return { what: "counters", onPlayer: true, op: "plusOne" };
  if (line === "If you would get one or more {E}, you get that many plus one {E} instead.") return { what: "counters", onPlayer: true, op: "plusOne", counter: "energy" };
  if (line === "If you would get one or more {E}, you get twice that many {E} instead.") return { what: "counters", onPlayer: true, op: "double", counter: "energy" };
  // Vizier of Remedies.
  if (line === "If one or more -1/-1 counters would be put on a creature you control, that many -1/-1 counters minus one are put on it instead.")
    return { what: "counters", counter: "-1/-1", on: "creature", who: "you", op: "minusOne" };
  if (line === "If you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.")
    return { what: "counters", putter: "you", op: "double" };
  // Lae'zel, Vlaakith's Champion; Doc Samson: "that many plus one of each of those kinds".
  if (line === "If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters on that permanent or player instead.")
    return { what: "counters", putter: "you", op: "plusOne", putOn: "creatureOrPlaneswalkerYouControlOrYou" };
  // Prairie Dog (until end of turn, oracle/sentences/tokens.ts): only +1/+1 counters you put, only on a creature you control.
  if (line === "If you would put one or more +1/+1 counters on a creature you control, put that many plus one +1/+1 counters on it instead.")
    return { what: "counters", putter: "you", op: "plusOne", putOn: "creatureYouControl", counter: "+1/+1" };
  if (line === "If you would put one or more counters on a permanent you control, put that many plus one of each of those kinds of counters on that permanent instead.")
    return { what: "counters", putter: "you", op: "plusOne", putOn: "permanentYouControl" };
  if (line === "If an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down.")
    return { what: "counters", putter: "opponent", op: "halfDown" };
  // Loading Zone: any kind, on a creature, Spacecraft, or Planet (artifact subtypes, CR 205.3g).
  if (line === "If one or more counters would be put on a creature, Spacecraft, or Planet you control, twice that many of each of those kinds of counters are put on it instead.")
    return { what: "counters", on: "creatureSpacecraftOrPlanet", who: "you", op: "double" };
  m = /^If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead\.$/.exec(line);
  if (m) return { what: "counters", on: "permanent", who: "you", op: "double" };
  return undefined;
}

const COPY_CARD_TYPES = new Set(["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle", "Instant", "Sorcery", "Kindred"]);

/**
 * The exceptions of a copy effect (CR 707.9): "it isn't legendary", "it's an artifact in addition to its other
 * types", "it's a 1/1 Spirit creature in addition to its other types", "it has haste", 'it has "..."', "its name
 * is ~" (~ being the copy's own name, see CopyExcept.name). Null if any part isn't understood.
 */
export function parseCopyExcept(text: string, round?: "up" | "down"): CopyExcept | null {
  const out: CopyExcept = {};
  // Flesh Duplicate: "except it has vanishing 3 if that creature doesn't have vanishing" (its copiable values, CR 707.2).
  const unless = /^it has (vanishing|fading) (\d+) if that creature doesn't have \1$/.exec(text);
  if (unless) return { text: [`${capital(unless[1]!)} ${unless[2]}`], unlessHas: capital(unless[1]!) };
  // Moritte of the Frost: "it's legendary and snow in addition to its other types and, if it's a creature, it enters with
  // two additional +1/+1 counters on it and has changeling": both supertypes (CR 205.4a), and the counters and changeling
  // only if it's a creature as it enters (rulings).
  if (/^it's legendary and snow in addition to its other types and, if it's a creature, it enters with two additional \+1\/\+1 counters on it and has changeling$/.test(text))
    return { legendary: true, snow: true, enterCounters: [{ counter: "+1/+1", n: 2, ifType: "Creature" }], keywordsIfCreature: ["Changeling"] };
  if (/^their power is half that creature's power and their toughness is half that creature's toughness$/.test(text)) return round ? { halfPT: round } : null;
  // Imposter Mech: "except it's a Vehicle artifact with crew 3 and it loses all other card types": an artifact only, its
  // subtypes of other card types gone (CR 205.1a, rulings), and crew N its own (CR 702.122a).
  const mech = /^it's a Vehicle artifact with crew (\d+) and it loses all other card types$/.exec(text);
  if (mech) return { setTypes: ["Artifact"], addSubtypes: ["Vehicle"], text: [`Crew ${mech[1]}`] };
  // Myrkul, Lord of Bones: "except it's an enchantment and loses all other card types": its only card type, keeping its
  // supertypes and enchantment subtypes (CR 205.1a, as for Machine God's Effigy below).
  if (/^it's an enchantment and (?:it )?loses all other card types$/.test(text)) return { setTypes: ["Enchantment"] };
  // Quoted abilities first, so commas inside them don't split anything.
  const quoted: string[] = [];
  let t = text.replace(/"([^"]+)"/g, (_, q: string) => `\u0000${quoted.push(q) - 1}\u0000`);
  // "Except the token has ..." (Mythos of Illuna) says the same as "except it has".
  // Echoing Equation: "except those creatures aren't legendary" (each creature that becomes a copy).
  t = t.replace(/^(?:it|they|he|she|the tokens?|those creatures) /, "");
  const parts = t.split(/,? and (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)|, (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)/).map((p) => p.trim().replace(/^(?:it|they|he|she) /, ""));
  for (const p of parts) {
    let m: RegExpExecArray | null;
    // "Except it's not legendary" (Delina, Wild Mage) says the same.
    if (/^(?:isn't|aren't|is not|are not|it's not|they're not) legendary$/.test(p)) out.notLegendary = true;
    // Jace, Mirror Mage: "except it's not legendary and its starting loyalty is 1" (a copiable value, CR 707.9b, 306.5b).
    else if ((m = /^its starting loyalty is (\d+)$/.exec(p))) out.loyalty = Number(m[1]);
    // Hulking Metamorph: "its power and toughness are equal to this creature's power and toughness" (its own, see ptOwn).
    else if (/^its power and toughness are equal to ~'s power and toughness$/.test(p)) out.ptOwn = true;
    // "Enters with an additional +1/+1 counter on it if it's a creature" (Spark Double), "... loyalty counter on it if it's
    // a planeswalker", "enters with an additional +1/+1 counter on it" (Littjara Mirrorlake).
    // Machine God's Effigy: "except it's an artifact": its only card type, keeping its supertypes and artifact subtypes,
    // losing the other subtypes (rulings, CR 205.1a).
    else if (/^(?:it's|they're) an artifact$/.test(p)) out.setTypes = ["Artifact"];
    else if ((m = /^enters with an additional (\+1\/\+1|loyalty) counter on it(?: if it's an? (creature|planeswalker))?$/.exec(p))) (out.enterCounters ??= []).push({ counter: m[1]!, ...(m[2] ? { ifType: m[2] === "creature" ? "Creature" : "Planeswalker" } : {}) });
    // Undercover Operative: "except it enters with a shield counter on it if you control that creature".
    else if (/^enters with a shield counter on it if you control that creature$/.test(p)) (out.enterCounters ??= []).push({ counter: "shield", ifYouControl: true });
    // Altered Ego: "except it enters with X additional +1/+1 counters on it".
    else if (/^enters with X additional \+1\/\+1 counters on it$/.test(p)) (out.enterCounters ??= []).push({ counter: "+1/+1", x: true });
    else if (/^(?:'s|’s|is|are|'re) legendary$/.test(p) || /^(?:it's|they're|he's|she's) legendary$/.test(p)) out.legendary = true;
    // "It doesn't copy that creature's color": it keeps its own (CR 707.9c).
    else if (/^(?:doesn't|does not) copy that creature's colou?r$/.test(p)) out.keepColors = true;
    else if ((m = /^(?:is|are|it's|they're|he's|she's) (?:an? )?(?:(\d+)\/(\d+) )?((?:(?:white|blue|black|red|green|colorless) )*(?:and (?:white|blue|black|red|green) )?)(.+?) in addition to (?:its|their|his|her) other (colors and )?(?:creature )?types$/.exec(p))) {
      if (m[1]) out.pt = [Number(m[1]), Number(m[2])];
      const colors = (m[3] ?? "").trim().split(" ").filter((c) => c && c !== "colorless" && c !== "and");
      // "In addition to its other colors and types" (Lazotep Convert): it keeps its colors too; otherwise these are its colors.
      if (m[5] && (!colors.length || /colorless/.test(m[3] ?? ""))) return null;
      if (colors.length) out[m[5] ? "addColors" : "colors"] = colors.map((c) => ({ white: "W", blue: "U", black: "B", red: "R", green: "G" })[c]) as Color[];
      // Kaya, Intangible Slayer: "except it's a 1/1 white Spirit creature with flying in addition to its other types": the
      // keywords it has too (CR 707.9b).
      const withKw = / with (.+)$/.exec(m[4]!);
      const typeWords = withKw ? m[4]!.slice(0, withKw.index) : m[4]!;
      if (withKw) {
        const kw = parseKeywordList(withKw[1]!);
        if (!kw) return null;
        (out.keywords ??= []).push(...kw);
      }
      // Only type words: a subtype is capitalized, a card type or "legendary" may not be.
      if (typeWords.split(" ").some((w) => !/^[A-Z][a-z]+s?$/.test(w) && w !== "legendary" && !COPY_CARD_TYPES.has(w.charAt(0).toUpperCase() + w.slice(1).replace(/s$/, "")))) return null;
      const words = typeWords.split(" ").map((w) => w.replace(/s$/, "")).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      if (words.some((w) => !/^[A-Z][a-z]+$/.test(w))) return null;
      // "It's legendary in addition to its other types": a supertype (CR 205.4). Other supertypes aren't modeled here.
      if (words[0] === "Legendary") {
        out.legendary = true;
        words.shift();
      }
      if (words.some((w) => ["Basic", "Snow", "World", "Legendary"].includes(w))) return null;
      if (words.some((w) => COPY_CARD_TYPES.has(w))) out.addTypes = words.filter((w) => COPY_CARD_TYPES.has(w));
      if (words.some((w) => !COPY_CARD_TYPES.has(w))) out.addSubtypes = words.filter((w) => !COPY_CARD_TYPES.has(w));
    } else if ((m = /^(?:'s|’s|is|are|it's|they're|he's|she's) (\d+)\/(\d+)$/.exec(p))) out.pt = [Number(m[1]), Number(m[2])];
    else if ((m = /^(?:is|are|it's|they're|he's|she's) (?:an? )?(\d+)\/(\d+) ((?:(?:white|blue|black|red|green) )*(?:and (?:white|blue|black|red|green) )?)([A-Z][a-z]+(?: [A-Z][a-z]+)*?)( creatures?)?(?: with (.+))?$/.exec(p))) {
      // "Except it's a 4/4 black Zombie" (God-Pharaoh's Gift): a Zombie instead of its other creature types, black
      // instead of its other colors (rulings, CR 205.1a); "a 6/6 green Dinosaur creature" sets its card types too.
      out.pt = [Number(m[1]), Number(m[2])];
      const colors = m[3]!.trim().split(" ").filter((c) => c && c !== "and");
      if (colors.length) out.colors = colors.map((c) => ({ white: "W", blue: "U", black: "B", red: "R", green: "G" })[c]) as Color[];
      const subtypes = m[4]!.split(" ");
      if (subtypes.some((w) => !CREATURE_TYPES.has(w))) return null;
      out.setSubtypes = subtypes;
      if (m[5]) out.setTypes = ["Creature"];
      for (const w of m[6] ? m[6].split(/,? and |, /) : []) {
        if (w === "no mana cost") out.noManaCost = true;
        else {
          const kw = parseKeywordList(w);
          if (!kw) return null;
          (out.keywords ??= []).push(...kw);
        }
      }
    }
    else if ((m = /^(?:has|have) (.+)$/.exec(p))) {
      for (const piece of m[1]!.split(/,? and (?=\u0000)|, (?=\u0000)|(?<=\u0000) and /)) {
        const q = /^\u0000(\d+)\u0000$/.exec(piece.trim());
        if (q) {
          // "This Equipment" in it (Firion) is the copy itself, whose own ability it becomes (CR 707.9b).
          (out.text ??= []).push(quoted[Number(q[1])]!.replaceAll(QUOTED_SOURCE_NAME, "~"));
          continue;
        }
        for (const kw of piece.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
          // "Except it has this ability": the copy effect's own ability (CR 707.9a), bound to its text by compile().
          if (kw === "this ability") {
            out.thisAbility = true;
            continue;
          }
          const simple = parseKeywordList(kw);
          if (simple) (out.keywords ??= []).push(...simple);
          else if (/^[a-z]+(?: [a-z]+)?(?: \d+)?$/.test(kw)) (out.text ??= []).push(capital(kw)); // "dethrone", "vanishing 3"
          else return null;
        }
      }
    } else if (/^(?:its|his|her) name is ~$/.test(p)) out.name = "~";
    // Mishra, Eminent One: "except its name is Mishra's Warform", a name of its own (kept as written by compile.ts).
    else if ((m = /^its name is ([A-Z][\w'-]*'s [A-Z][\w'-]*)$/.exec(p))) out.name = m[1]!;
    else return null;
  }
  return out;
}

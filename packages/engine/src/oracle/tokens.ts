import type { CopyExcept } from "../copies";
import type { CountMod, TokenSpec } from "../abilities";
import { CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { BASIC_TYPES, COLOR_WORDS, TYPE_WORDS, capital } from "./words";
import { parseKeywordList } from "./targets";
import { compileQuoted } from "./grants";

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
  const words = desc.split(/\s+/);
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
    else return null;
  }
  // 'with "Sacrifice ~: Add {C}."': an ability of its own (CR 111.3); 'with flying, haste, and "When this creature dies,
  // ..."': keywords and then one.
  const quoted = withText && /^(?:(.+?),? and )?"([^"]+)"$/.exec(withText);
  if (quoted && !compileQuoted(quoted[2]!)) return null;
  const kwText = quoted ? quoted[1] : withText;
  // "A 1/1 white Monk creature token with prowess" (Monastery Mentor): a triggered keyword (CR 702.108a) is an ability
  // of the token's, as if printed.
  // "With firebending 1" (Firebender Ascension): the same, "Whenever this creature attacks, add {R}" (CR 702.189a).
  if (!quoted && (kwText === "prowess" || /^firebending \d+$/.test(kwText ?? "")) && subtypes.length) return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords: [], abilities: kwText!.charAt(0).toUpperCase() + kwText!.slice(1) };
  const keywords = kwText ? parseKeywordList(kwText) : [];
  if (!keywords || !subtypes.length) return null;
  return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords, ...(quoted ? { abilities: quoted[2]! } : {}) };
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
  // Bilbo: "If you would create a Food token, instead create a Food token and a Treasure token."
  m = /^If you would create an? ([A-Z][a-z]+) token, instead create an? \1 token and an? ([A-Z][a-z]+) token\.$/.exec(line);
  if (m && PREDEFINED_TOKENS[m[1]!] && PREDEFINED_TOKENS[m[2]!]) return { what: "tokens", who: "you", op: "andEach", subtype: m[1]!, token: PREDEFINED_TOKENS[m[2]!]! };
  if (line === "If you would create a Clue, Food, or Treasure token, instead create one of each.") return { what: "tokens", who: "you", op: "oneOfEach", subtypes: ["Clue", "Food", "Treasure"] };
  // Kami of Whispered Hopes: "on a permanent you control".
  // Ozolith, the Shattered Spire: "on an artifact or creature you control".
  m = /^If one or more \+1\/\+1 counters would be put on (another|an?) (creature|permanent|artifact or creature)( you control)?, (twice that many|that many plus one) \+1\/\+1 counters are put on (?:it|that creature|that permanent) instead\.$/.exec(line);
  if (m) return { what: "counters", counter: "+1/+1", on: m[2] === "artifact or creature" ? "artifactOrCreature" : (m[2] as "creature" | "permanent"), who: m[3] ? "you" : "any", op: m[4] === "twice that many" ? "double" : "plusOne", ...(m[1] === "another" ? { other: true } : {}) };
  // Winding Constrictor: counters of any kind (each kind one more, rulings).
  if (line === "If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.")
    return { what: "counters", on: "artifactOrCreature", who: "you", op: "plusOne" };
  if (line === "If you would get one or more counters, you get that many plus one of each of those kinds of counters instead.") return { what: "counters", onPlayer: true, op: "plusOne" };
  // Vizier of Remedies.
  if (line === "If one or more -1/-1 counters would be put on a creature you control, that many -1/-1 counters minus one are put on it instead.")
    return { what: "counters", counter: "-1/-1", on: "creature", who: "you", op: "minusOne" };
  if (line === "If you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.")
    return { what: "counters", putter: "you", op: "double" };
  // Lae'zel, Vlaakith's Champion; Doc Samson: "that many plus one of each of those kinds".
  if (line === "If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters on that permanent or player instead.")
    return { what: "counters", putter: "you", op: "plusOne", putOn: "creatureOrPlaneswalkerYouControlOrYou" };
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
  if (/^their power is half that creature's power and their toughness is half that creature's toughness$/.test(text)) return round ? { halfPT: round } : null;
  // Imposter Mech: "except it's a Vehicle artifact with crew 3 and it loses all other card types": an artifact only, its
  // subtypes of other card types gone (CR 205.1a, rulings), and crew N its own (CR 702.122a).
  const mech = /^it's a Vehicle artifact with crew (\d+) and it loses all other card types$/.exec(text);
  if (mech) return { setTypes: ["Artifact"], addSubtypes: ["Vehicle"], text: [`Crew ${mech[1]}`] };
  // Quoted abilities first, so commas inside them don't split anything.
  const quoted: string[] = [];
  let t = text.replace(/"([^"]+)"/g, (_, q: string) => `\u0000${quoted.push(q) - 1}\u0000`);
  // "Except the token has ..." (Mythos of Illuna) says the same as "except it has".
  t = t.replace(/^(?:it|they|he|she|the tokens?) /, "");
  const parts = t.split(/,? and (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)|, (?=(?:it|they|he|she|its|his|her|is|are|has|have|isn't|aren't)\b)/).map((p) => p.trim().replace(/^(?:it|they|he|she) /, ""));
  for (const p of parts) {
    let m: RegExpExecArray | null;
    // "Except it's not legendary" (Delina, Wild Mage) says the same.
    if (/^(?:isn't|aren't|is not|are not|it's not|they're not) legendary$/.test(p)) out.notLegendary = true;
    // "Enters with an additional +1/+1 counter on it if it's a creature" (Spark Double), "... loyalty counter on it if it's
    // a planeswalker", "enters with an additional +1/+1 counter on it" (Littjara Mirrorlake).
    else if ((m = /^enters with an additional (\+1\/\+1|loyalty) counter on it(?: if it's an? (creature|planeswalker))?$/.exec(p))) (out.enterCounters ??= []).push({ counter: m[1]!, ...(m[2] ? { ifType: m[2] === "creature" ? "Creature" : "Planeswalker" } : {}) });
    else if (/^(?:'s|’s|is|are|'re) legendary$/.test(p) || /^(?:it's|they're|he's|she's) legendary$/.test(p)) out.legendary = true;
    // "It doesn't copy that creature's color": it keeps its own (CR 707.9c).
    else if (/^(?:doesn't|does not) copy that creature's colou?r$/.test(p)) out.keepColors = true;
    else if ((m = /^(?:is|are|it's|they're|he's|she's) (?:an? )?(?:(\d+)\/(\d+) )?((?:(?:white|blue|black|red|green|colorless) )*(?:and (?:white|blue|black|red|green) )?)(.+?) in addition to (?:its|their|his|her) other (colors and )?(?:creature )?types$/.exec(p))) {
      if (m[1]) out.pt = [Number(m[1]), Number(m[2])];
      const colors = (m[3] ?? "").trim().split(" ").filter((c) => c && c !== "colorless" && c !== "and");
      // "In addition to its other colors and types" (Lazotep Convert): it keeps its colors too; otherwise these are its colors.
      if (m[5] && (!colors.length || /colorless/.test(m[3] ?? ""))) return null;
      if (colors.length) out[m[5] ? "addColors" : "colors"] = colors.map((c) => ({ white: "W", blue: "U", black: "B", red: "R", green: "G" })[c]) as Color[];
      const words = m[4]!.split(" ").map((w) => w.replace(/s$/, "")).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
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
          (out.text ??= []).push(quoted[Number(q[1])]!);
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
    else return null;
  }
  return out;
}

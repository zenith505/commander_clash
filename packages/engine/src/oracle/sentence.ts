import type { Modification, Effect } from "../abilities";
import { CHOSEN_LAND_TYPE, CHOSEN_TYPE, CREATURE_TYPES } from "../keywords";
import type { Color } from "../types";
import { num, PT, ptAmt, COLOR_WORDS, TYPE_WORDS, WHEEL, COUNTER, counterKind } from "./words";
import { Ctx } from "./body";
import { parseSearchFilter } from "./search";
import { parseKeywordList, parseObject } from "./targets";
import { parseGrants } from "./grants";
import { parseBasicsSentence } from "./sentences/basics";
import { parseZonesSentence } from "./sentences/zones";
import { parsePermanentsSentence } from "./sentences/permanents";
import { parseTokensSentence } from "./sentences/tokens";
import { parseSpellsSentence } from "./sentences/spells";
import { parseCopiesSentence } from "./sentences/copies";
import { parsePreventionSentence } from "./sentences/prevention";

/**
 * The sentences after "Look at (Reveal) the top N cards of your library": which to take ("Put one of them
 * into your hand", "You may reveal a creature card from among them and put it into your hand", "You may
 * put one of those cards back on top of your library") and where the rest go ("Put the rest into your
 * graveyard", "on the bottom of your library in a random order"). "more" while the rest is still to come.
 */
export function parseDig(s: string, dig: Partial<Extract<Effect, { type: "dig" }>>, ctx?: Ctx): Extract<Effect, { type: "dig" }> | "more" | null {
  const REST = "(into your graveyard|into your hand|on the bottom of your library(?: in (?:any|a random) order)?)";
  // Without "in a random order", the owner arranges the cards going to the bottom (CR 401.4).
  const restOf = (r: string) => (r === "into your graveyard" ? { rest: "graveyard" as const } : r === "into your hand" ? { rest: "hand" as const } : / random /.test(r) ? { rest: "bottom" as const, random: true as const } : { rest: "bottom" as const });
  let m: RegExpExecArray | null;
  if (dig.into === undefined) {
    if ((m = new RegExp(`^Put (one|two|three) of (?:them|those cards) into your hand(?: and (?:the rest|the other) ${REST})?$`).exec(s))) {
      Object.assign(dig, { count: num(m[1]!), upTo: false, into: "hand" });
      if (m[2]) Object.assign(dig, restOf(m[2]));
    } else if ((m = /^You may (?:reveal (an? .+?) from among them and put it|put (an? .+?) from among them) into your hand$/.exec(s))) {
      const filter = parseSearchFilter((m[1] ?? m[2])!.replace(/^an? /, ""));
      if (!filter) return null;
      Object.assign(dig, { count: 1, upTo: true, filter, into: "hand" });
    } else if ((m = new RegExp(`^(You may put|Put) (an?|up to (?:one|two|three)|any number of|all) (.+?) from among them onto the battlefield( tapped)?(?: with an? ${COUNTER} counter on it)?(?: and the rest ${REST})?$`).exec(s))) {
      // "You may put a land card from among them onto the battlefield tapped" (Freestrider Lookout), "Put up to two creature
      // cards with mana value 3 or less from among them onto the battlefield" (Collected Company): several enter at the
      // same time (enterTogether). "Put a land card ..." takes one if there is one; "all" every one that matches.
      const how = m[2]!;
      const count = /^an?$/.test(how) ? 1 : /^up to /.test(how) ? num(how.slice(6)) : 99;
      const required = how === "all" || (/^an?$/.test(how) && m[1] === "Put");
      if (/^(?:an?|up to one)$/.test(how) === /cards\b/.test(m[3]!)) return null;
      // "With mana value X or less": the X it was cast or activated with (TargetSpec.xRange), not a "where X is".
      let what = m[3]!.replace(/\bcards\b/, "card").replace(/ and\/or /, " or ");
      const mvX = / with mana value X or less$/.exec(what);
      if (mvX) {
        if (!ctx || !(ctx.spell || ctx.activated) || ctx.whereX) return null;
        what = what.slice(0, mvX.index);
      }
      const filter = parseSearchFilter(what);
      if (!filter) return null;
      if (mvX) Object.assign(filter, { xRange: { key: "manaValue", at: "most" }, text: `${filter.text} with mana value X or less` });
      Object.assign(dig, { count, upTo: !required, ...(required ? { required: true } : {}), filter, into: "battlefield", ...(m[4] ? { tapped: true } : {}), ...(m[5] ? { counters: { counter: counterKind(m[5]), n: 1 } } : {}) });
      if (m[6]) Object.assign(dig, restOf(m[6]));
    } else if (/^You may put one of (?:them|those cards) back on top of your library$/.test(s)) {
      Object.assign(dig, { count: 1, upTo: true, into: "libraryTop" });
    } else return null;
    return dig.rest ? (dig as Extract<Effect, { type: "dig" }>) : "more";
  }
  if ((m = new RegExp(`^Put (?:the rest|all cards revealed this way that weren't put onto the battlefield) ${REST}$`).exec(s))) return { ...(dig as Extract<Effect, { type: "dig" }>), ...restOf(m[1]!) };
  // "Then shuffle" (the "Then" is gone by now), "Then shuffle the rest into your library" (CR 701.20).
  if (/^Shuffle(?: the rest into your library)?$/.test(s)) return { ...(dig as Extract<Effect, { type: "dig" }>), rest: "shuffle" };
  return null;
}

/** The sentence parsers, tried in this order; the first that recognizes the sentence decides (null = can't compile). */
const SENTENCE_PARSERS = [parsePreventionSentence, parseCopiesSentence, parseBasicsSentence, parseZonesSentence, parsePermanentsSentence, parseTokensSentence, parseSpellsSentence];

/** One sentence of an ability's text to effects, or null if it can't be compiled. */
export function parseSentence(s: string, ctx: Ctx): Effect[] | null {
  if (WHEEL.test(s)) return parseSpellsSentence(s, ctx) ?? null;
  const tapped = /^(?:For as long as ~ remains tapped, (.+)|(.+?) for as long as (you control ~ and )?~ remains tapped)$/i.exec(s);
  if (tapped) return parseWhileTapped((tapped[1] ?? tapped[2])!, !!tapped[3], ctx);
  for (const parse of SENTENCE_PARSERS) {
    const r = parse(s, ctx);
    if (r !== undefined) return r;
  }
  return null;
}

/**
 * The changes in "gets +2/+2 and gains flying", "loses all abilities and becomes a blue
 * Frog with base power and toughness 1/1", "becomes a 3/3 Elemental creature", ...
 */
export function parseChanges(text: string): Modification[] | null {
  const parts = text.split(/,? and (?=(?:gets?|gains?|loses?|has|have|becomes?|assigns?|can attack) )|, (?=(?:assigns?|can attack) )/i);
  const out: Modification[] = [];
  for (const part of parts) {
    const p = part.trim();
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^gets? ${PT}/${PT}$`, "i").exec(p))) out.push({ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) });
    else if ((m = /^gains? (.+)$/i.exec(p))) {
      const k = parseGrants(m[1]!);
      if (!k) return null;
      out.push(...k);
    } else if (/^loses? all abilities$/i.test(p)) out.push({ kind: "loseAllAbilities" });
    else if ((m = /^loses? (.+)$/i.exec(p))) {
      const k = parseKeywordList(m[1]!);
      if (!k) return null;
      out.push({ kind: "removeKeywords", keywords: k });
    } else if ((m = /^(?:has|have) base power and toughness (\d+)\/(\d+)$/i.exec(p))) out.push({ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) });
    // Doran (CR 510.1a as modified) and defender (CR 702.3b), for a while.
    else if (/^assigns? combat damage equal to (?:its|their) toughness rather than (?:its|their) power$/i.test(p)) out.push({ kind: "assignsToughness" });
    else if (/^can attack (?:this turn )?as though (?:it|they) didn't have defender$/i.test(p)) out.push({ kind: "attackDespiteDefender" });
    else if ((m = /^becomes? (.+)$/i.exec(p))) {
      const b = parseBecomes(m[1]!);
      if (!b) return null;
      out.push(...b);
    } else return null;
  }
  return out.length ? out : null;
}

/**
 * After "becomes": "a blue Frog with base power and toughness 1/1", "a 3/3 Elemental
 * creature", "a 2/2 artifact creature", "black". Colors set layer 5 (CR 105.3); new
 * creature types replace old ones (CR 205.1a); a new card type replaces the old ones
 * unless the text keeps them, as "artifact creature" does (CR 205.1b).
 */
export function parseBecomes(text: string): Modification[] | null {
  let rest = text.trim();
  const out: Modification[] = [];
  let m: RegExpExecArray | null;
  if ((m = /^(?:the color of your choice)$/i.exec(rest))) return null;
  // The color or basic land type chosen as it resolves (see parseBody). A land's basic land type replaces its land
  // types and the abilities from its rules text (CR 305.7): "becomes an Island" too.
  if (/^the chosen color$/i.test(rest)) return [{ kind: "setColors", colors: [], chosen: true }];
  if (/^the chosen basic land type$/i.test(rest)) return [{ kind: "setLandTypes", subtypes: [CHOSEN_LAND_TYPE] }];
  if ((m = /^an? (Plains|Island|Swamp|Mountain|Forest)$/.exec(rest))) return [{ kind: "setLandTypes", subtypes: [m[1]!] }];
  // The creature type chosen as it resolves (see parseBody): it replaces the other creature types (CR 205.1b), unless
  // "in addition to its other types".
  if ((m = /^the chosen creature type( in addition to its other types)?$/i.exec(rest)))
    return [m[1] ? { kind: "addTypes", types: [], subtypes: [CHOSEN_TYPE] } : { kind: "setSubtypes", subtypes: [CHOSEN_TYPE] }];
  // Just a color: "becomes black", "becomes blue and red"
  if (/^(white|blue|black|red|green|colorless)( and (white|blue|black|red|green))*$/i.test(rest)) {
    return [{ kind: "setColors", colors: rest.split(/ and /).map((w) => COLOR_WORDS[w.toLowerCase()]).filter((c): c is Color => !!c) }];
  }
  // "... that's still a land" keeps its card types, like "It's still a land." after it (CR 205.1b).
  let still = false;
  if ((m = /^(.+?) that(?:'s| is) still an? land$|^(.+?) that are still lands$/i.exec(rest))) {
    rest = (m[1] ?? m[2])!;
    still = true;
  }
  // "Becomes a 0/0 Bird creature with flying in addition to its other types" (Case of the Filched Falcon): it keeps its
  // card types and subtypes (CR 205.1b).
  let addition = false;
  if ((m = /^(.+?) in addition to its other types$/i.exec(rest)) && !still) {
    rest = m[1]!;
    addition = true;
  }
  // "1/1 Elemental creatures" (Kamahl's Will's "any number of target lands ... become"): each of them becomes one.
  if ((m = /^(\d+\/\d+ (?:[A-Z]\w* )*creature)s\b(.*)$/.exec(rest))) rest = `a ${m[1]}${m[2]}`;
  if (!(m = /^an? (.+)$/i.exec(rest))) return null;
  rest = m[1]!;
  // "A 2/2 creature with all creature types" (Mutavault), "with vigilance and all creature types" (Faceless Haven): every
  // creature type, like changeling (CR 702.73a), in the type-changing layer.
  let everyType = false;
  if ((m = /^(.+?) with (?:(.+?),? and )?all creature types$/i.exec(rest))) {
    rest = m[2] ? `${m[1]} with ${m[2]}` : m[1]!;
    everyType = true;
  }
  // "A 3/3 Elemental creature with haste", "... with vigilance, indestructible, and haste": it also gains those.
  const grants: Modification[] = [];
  if ((m = /^(.+?) with (?!base power and toughness )(.+)$/i.exec(rest))) {
    const g = parseGrants(m[2]!);
    if (!g) return null;
    grants.push(...g);
    rest = m[1]!;
  }
  let pt: [number, number] | null = null;
  if ((m = /^(\d+)\/(\d+) (.+)$/.exec(rest))) {
    pt = [Number(m[1]), Number(m[2])];
    rest = m[3]!;
  }
  if ((m = /^(.+?) with base power and toughness (\d+)\/(\d+)$/i.exec(rest))) {
    pt = [Number(m[2]), Number(m[3])];
    rest = m[1]!;
  }
  const colors: Color[] = [];
  const subtypes: string[] = [];
  const types: string[] = [];
  for (const w of rest.split(/\s+/)) {
    const lw = w.toLowerCase();
    if (COLOR_WORDS[lw]) colors.push(COLOR_WORDS[lw]!);
    else if (lw === "and" || lw === "colorless") continue;
    else if (TYPE_WORDS[lw]) types.push(TYPE_WORDS[lw]!);
    else if (CREATURE_TYPES.has(w)) subtypes.push(w);
    else return null;
  }
  if (addition) {
    if (!types.length && !subtypes.length) return null;
    out.push({ kind: "addTypes", types, subtypes });
  } else if (types.join(" ") === "Artifact Creature") {
    // "Becomes an artifact creature" keeps its other card types and subtypes; "a Golem artifact
    // creature" keeps them too, except that its creature types are replaced (CR 205.1b).
    out.push({ kind: "addTypes", types, subtypes: [] });
    if (subtypes.length) out.push({ kind: "setSubtypes", subtypes });
  } else if (types.length) out.push(still ? { kind: "addTypes", types, subtypes } : { kind: "setTypes", types, subtypes });
  else if (subtypes.length && !still) out.push({ kind: "setSubtypes", subtypes });
  else if (still) return null;
  if (everyType) {
    if (!types.includes("Creature") || subtypes.length) return null;
    out.push({ kind: "addTypes", types: [], subtypes: [], allCreatureTypes: true });
  }
  if (colors.length || /colorless/i.test(rest)) out.push({ kind: "setColors", colors });
  if (pt) out.push({ kind: "setPT", power: pt[0], toughness: pt[1] });
  out.push(...grants);
  return out.length ? out : null;
}

/**
 * "Target creature gets +1/+1 for as long as ~ remains tapped", "gain control of target creature for as long as you
 * control ~ and ~ remains tapped", "it doesn't untap during its controller's untap step for as long as ~ remains
 * tapped" (CR 611.2b): one continuous effect lasting while its source stays tapped. Only a permanent's ability.
 */
function parseWhileTapped(inner: string, controlled: boolean, ctx: Ctx): Effect[] | null {
  if (ctx.spell) return null;
  inner = inner.charAt(0).toUpperCase() + inner.slice(1);
  const lasting = (fx: Effect[] | null): Effect[] | null => {
    const e = fx?.length === 1 ? fx[0]! : undefined;
    return e?.type === "continuous" ? [{ ...e, duration: "whileTapped", ...(controlled ? { whileControlled: true as const } : {}) }] : null;
  };
  const m = /^(.+?) (?:doesn't|don't) untap during (?:its|their) controllers?'s? untap steps?$/i.exec(inner);
  if (m) {
    const what = parseObject(m[1]!, ctx);
    return what ? lasting([{ type: "continuous", what, mods: [{ kind: "doesntUntap" }], duration: "game" }]) : null;
  }
  if (/^Gain control of /i.test(inner)) {
    const fx = parseSentence(inner, ctx);
    return fx?.[0]?.type === "continuous" && fx[0].duration === "game" ? lasting(fx) : null;
  }
  if (!/ (?:gets?|has|have|loses?) /.test(inner)) return null;
  // "Gets +2/+2 and has trample" for as long as it lasts is "gains trample" from when it starts.
  const fx = parseSentence(`${inner.replace(/ (has|have) /, (_, w: string) => (w === "has" ? " gains " : " gain "))} until end of turn`, ctx);
  return fx?.[0]?.type === "continuous" && fx[0].duration === "endOfTurn" ? lasting(fx) : null;
}

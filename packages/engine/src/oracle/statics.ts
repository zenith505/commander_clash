import type { Amount, AmountExpr, Affects, Modification, MostStat, StaticAbility, StaticCondition, CostMod, EntersChoice, EntersCondition, TargetSpec, TurnPoint, Untargetable } from "../abilities";
import { ANY_COUNTER } from "../abilities";
import { CHOSEN_KEYWORDS, CREATURE_TYPES, SUPPORTED_KEYWORDS, subtypeSet } from "../keywords";
import { STARTING_LIFE, type Color } from "../types";
import { NUM, num, COUNTER, counterKind, X, PT, ptAmt, COLOR_WORDS, BASIC_TYPES, TYPE_WORDS, capital, singular, singularWord } from "./words";
import { parseBody, replaceX, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { HISTORIC, pickFilter, parseGroup, parseKeywordList, parseTargetPhrase } from "./targets";
import { parseGrants } from "./grants";
import { parseSearchFilter } from "./search";
import { parseDamageMod } from "./damage-mods";
import { QUOTED_SOURCE_NAME } from "./compile";
import { parseBecomes } from "./sentence";

/** What "~ enters tapped unless ..." waits for (CR 614.1d). */
export function parseEntersCondition(text: string): EntersCondition | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^you control ${NUM} or (fewer|more) other lands$`).exec(text)))
    return { kind: "control", who: "you", types: ["Land"], other: true, ...(m[2] === "fewer" ? { max: num(m[1]!) } : { min: num(m[1]!) }) };
  if ((m = new RegExp(`^you control ${NUM} or more basic lands$`).exec(text))) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: num(m[1]!) };
  if (/^you control a basic land$/.test(text)) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: 1 };
  if (/^you control a planeswalker$/.test(text)) return { kind: "control", who: "you", types: ["Planeswalker"], min: 1 };
  // The Roads (Outlaws of Thunder Junction): a permanent with either subtype (CR 205.3).
  if (/^you control a Mount or Vehicle$/.test(text)) return { kind: "control", who: "you", subtypes: ["Mount", "Vehicle"], min: 1 };
  // Unagi's Spray: "if you control a Fish, Octopus, Otter, Seal, Serpent, or Whale": a permanent with any of them.
  if ((m = /^you control an? ([A-Z][a-z]+(?: or [A-Z][a-z]+){2,})$/.exec(text))) {
    const subtypes = m[1]!.split(" or ");
    if (subtypes.every((t) => CREATURE_TYPES.has(t))) return { kind: "control", who: "you", subtypes, min: 1 };
  }
  if (/^you control a legendary creature$/.test(text)) return { kind: "control", who: "you", types: ["Creature"], supertypes: ["Legendary"], min: 1 };
  // "Unless you control a legendary green creature" (Argoth, Sanctum of Nature).
  if ((m = /^you control a legendary (white|blue|black|red|green) creature$/.exec(text))) return { kind: "control", who: "you", types: ["Creature"], supertypes: ["Legendary"], colors: [COLOR_WORDS[m[1]!]!], min: 1 };
  // The Lonely Mountain: "unless you control an Equipment" (a permanent with that subtype, CR 205.3).
  if ((m = /^you control an? (\w+)(?: or an? (\w+))?$/.exec(text)) && [m[1], m[2]].every((x) => x === undefined || BASIC_TYPES.includes(x) || x === "Equipment"))
    return { kind: "control", who: "you", subtypes: [m[1]!, ...(m[2] ? [m[2]] : [])], min: 1 };
  // "Unless you control three or more other Islands" (Mystic Sanctuary and the other Eldraine lands).
  if ((m = new RegExp(`^you control ${NUM} or more other (Plains|Islands|Swamps|Mountains|Forests)$`).exec(text))) return { kind: "control", who: "you", subtypes: [m[2] === "Plains" ? "Plains" : m[2]!.replace(/s$/, "")], other: true, min: num(m[1]!) };
  if ((m = new RegExp(`^your opponents control ${NUM} or more lands$`).exec(text))) return { kind: "control", who: "opponents", types: ["Land"], min: num(m[1]!) };
  if ((m = /^a player has (\d+) or less life$/.exec(text))) return { kind: "playerLifeAtMost", n: Number(m[1]) };
  if ((m = new RegExp(`^you have ${NUM} or more opponents$`).exec(text))) return { kind: "opponents", min: num(m[1]!) };
  if (/^it's your first, second, or third turn of the game$/.test(text)) return { kind: "ownTurnAtMost", n: 3 };
  // Horned Loch-Whale: "enters tapped unless it's your turn".
  if (/^it's your turn$/.test(text)) return { kind: "yourTurn" };
  return null;
}

/** "As ~ enters, you may pay 2 life. If you don't, it enters tapped." and the reveal-a-card lands (CR 614.12). */
export function parseEntersChoice(line: string): EntersChoice | null {
  let m: RegExpExecArray | null;
  if ((m = /^As ~ enters(?: the battlefield)?, you may pay (\d+) life\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) return { kind: "payLife", n: Number(m[1]) };
  if ((m = /^As ~ enters(?: the battlefield)?, you may reveal an? (.+?) card from your hand\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) {
    const subtypes = m[1]!.split(/ or /);
    if (!subtypes.every((x) => BASIC_TYPES.includes(x) || CREATURE_TYPES.has(x))) return null;
    return { kind: "reveal", filter: { kind: "card", subtypes, text: `${m[1]} card` } };
  }
  // Temple of the Dragon Queen: "... enters tapped unless you revealed a Dragon card this way or you control a Dragon."
  // Controlling one as it enters is enough, with nothing revealed (CR 614.1d).
  if ((m = /^As ~ enters(?: the battlefield)?, you may reveal an? ([A-Z][a-z]+) card from your hand\. ~ enters(?: the battlefield)? tapped unless you revealed an? ([A-Z][a-z]+) card this way or you control an? ([A-Z][a-z]+)\.$/.exec(line))) {
    if (m[1] !== m[2] || m[1] !== m[3] || !CREATURE_TYPES.has(m[1]!)) return null;
    return { kind: "reveal", filter: { kind: "card", subtypes: [m[1]!], text: `${m[1]} card` }, orControl: { kind: "object", subtypes: [m[1]!], controller: "you", text: m[1]! } };
  }
  return null;
}

/**
 * A static ability that applies only "as long as" something is true: threshold's "~ gets +1/+1 as long
 * as there are seven or more cards in your graveyard", "As long as you control three or more artifacts,
 * ~ has flying", Kird Ape's "~ gets +1/+2 as long as you control a Forest", "~ has first strike as long
 * as it's attacking". An ability word in front ("Metalcraft —", "Descend 4 —") has no rules meaning
 * (CR 207.2c); the condition is spelled out after it.
 */
/**
 * Threshold granting "Whenever a nontoken creature is put into your graveyard from the battlefield" (Decaying Soil): a
 * leaves-the-battlefield trigger looks back in time (CR 603.10a), so the creature that makes seven doesn't trigger it
 * (rulings), but the granted ability is read from the graveyard as it is after the event. Not supported.
 */
function lookBackGrant(st: StaticAbility | null): StaticAbility | null {
  return st?.condition?.kind === "graveyardAtLeast" && st.mods.some((m) => m.kind === "addAbility" && /^Whenever .*(?:\bdies\b|put into [a-z']+ graveyard from the battlefield)/.test(m.text)) ? null : st;
}

export function parseConditionalStatic(line: string): StaticAbility | null {
  return lookBackGrant(parseConditionalStatic0(line));
}

function parseConditionalStatic0(line: string): StaticAbility | null {
  // Zhao, the Moon Slayer: "As long as ~ has a conqueror counter on him, ...": "him" (normalized to ~) is it.
  const onSelf = /^(As long as ~ has an? [a-z]+ counter on) ~(, .+)$/.exec(line);
  if (onSelf) return parseConditionalStatic0(`${onSelf[1]} it${onSelf[2]}`);
  // War Balloon: "As long as this Vehicle has three or more fire counters on it, it's an artifact creature.": "it" is ~.
  const itsVehicle = /^(As long as ~ has [^,]+ counters? on it), it's (an? artifact creature)\.$/.exec(line);
  if (itsVehicle) return parseConditionalStatic0(`${itsVehicle[1]}, ~ is ${itsVehicle[2]}.`);
  // Depletion lands: "~ doesn't untap during your untap step if it has a depletion counter on it" is the same as "as
  // long as it has one" (checked as the untap step begins, CR 502.3).
  // Steel Dromedary: "if it has a +1/+1 counter on it"; Alirios, Enraptured: "if you control a Reflection".
  // Relic Runner: "~ can't be blocked if you've cast a historic spell this turn": the same as "as long as", checked as
  // blockers are declared (rulings: casting one later doesn't undo a block).
  const ifCast = /^~ can't be blocked if (you've cast an? [a-z]+ spell this turn)\.$/.exec(line);
  if (ifCast) {
    const st = parseConditionalStatic(`~ can't be blocked as long as ${ifCast[1]}.`);
    return st && { ...st, text: line };
  }
  // Graxiplon: "~ can't be blocked unless defending player controls three or more creatures that share a creature type":
  // can't be blocked as long as at most two of that player's creatures share any one creature type.
  const unlessShare = /^~ can't be blocked unless defending player controls (two|three|four|five) or more creatures that share a creature type\.$/.exec(line);
  if (unlessShare) {
    const st = parseConditionalStatic(`~ can't be blocked as long as defending player controls ${unlessShare[1]} or more creatures.`);
    if (st?.condition?.kind !== "control" || st.condition.who !== "defending" || st.condition.min === undefined) return null;
    return { ...st, condition: { kind: "control", who: "defending", filter: st.condition.filter, max: st.condition.min - 1, sameCreatureType: true }, text: line };
  }
  // Sheltering Prayers: "Basic lands each player controls have shroud as long as that player controls three or fewer
  // lands": each land by its own controller's lands, counted with the layers so far.
  const perController = /^Basic lands each player controls have ([a-z]+) as long as that player controls (one|two|three|four|five) or fewer lands\.$/.exec(line);
  if (perController) {
    const st = parseStatic(`Basic lands have ${perController[1]}.`);
    if (st?.affects.kind !== "filter") return null;
    return { ...st, affects: { ...st.affects, spec: { kind: "object" as const, ...st.affects.spec, controllersLandsAtMost: ["one", "two", "three", "four", "five"].indexOf(perController[2]!) + 1, text: "basic lands each player controls" } }, text: line };
  }
  // Cocoon: "Enchanted creature doesn't untap during your untap step if ~ has a pupa counter on it."
  const auraCounter = /^Enchanted creature doesn't untap during your untap step if ~ has an? ([a-z]+) counter on it\.$/.exec(line);
  if (auraCounter) {
    const st = parseConditionalStatic(`As long as ~ has a ${auraCounter[1]} counter on it, enchanted creature doesn't untap during your untap step.`);
    return st && { ...st, text: line };
  }
  const ifCounter = /^~ doesn't untap during your untap step if it has an? ([a-z]+|\+1\/\+1) counter on it\.$/.exec(line);
  if (ifCounter) {
    const st = parseConditionalStatic(`As long as ~ has a ${ifCounter[1]} counter on it, it doesn't untap during your untap step.`);
    return st && { ...st, text: line };
  }
  // Goblin Rock Sled: "~ doesn't untap during your untap step if it attacked during your last turn", Giant Turtle: "~
  // can't attack if it attacked during your last turn", Tangle Kelp: "Enchanted creature doesn't untap during its
  // controller's untap step if it attacked during its controller's last turn": "as long as" that's so. Venarian Gold:
  // "Enchanted creature doesn't untap during its controller's untap step if it has a sleep counter on it" the same.
  const ifAttacked = /^(~ doesn't untap during your untap step|~ can't attack|Enchanted creature doesn't untap during its controller's untap step) if (it attacked during (?:your|its controller's) last turn|it has an? [a-z]+ counter on it)\.$/.exec(line);
  if (ifAttacked) {
    const st = parseConditionalStatic(`As long as ${ifAttacked[2]}, ${ifAttacked[1]!.replace(/^Enchanted/, "enchanted")}.`);
    return st && { ...st, text: line };
  }
  // Walking Dream: "if an opponent controls two or more creatures".
  const ifControl = /^~ doesn't untap during your untap step if (you control an? [A-Z][a-z]+|an opponent controls two or more creatures)\.$/.exec(line);
  if (ifControl) {
    const st = parseConditionalStatic(`As long as ${ifControl[1]}, ~ doesn't untap during your untap step.`);
    return st && { ...st, text: line };
  }
  // Bombur, Gentle Dreamer: "~ doesn't untap during your untap step unless you have an enduring story": as long as you
  // don't (CR 702.195b).
  if (/^~ doesn't untap during your untap step unless you have an enduring story\.$/.test(line)) {
    const st = parseConditionalStatic("As long as you don't have an enduring story, ~ doesn't untap during your untap step.");
    return st && { ...st, text: line };
  }
  const text = line.replace(/^[A-Z][A-Za-z' -]+(?: \d+)? — /, "").replace(/\.$/, "");
  let statement: string | undefined;
  let cond: string | undefined;
  let m: RegExpExecArray | null;
  // Soulbond (CR 702.95b): "As long as ~ is paired with another creature, each of those creatures gets +2/+2",
  // "... both creatures have lifelink": the pair, while it lasts.
  if ((m = /^As long as ~ is paired with another creature, (?:each of those creatures|both creatures) (.+)$/.exec(text))) {
    const mods = parseStaticMods(m[1]!);
    return mods ? { affects: { kind: "paired" }, mods, text: line } : null;
  }
  // Alms Beast: "Creatures blocking or blocked by ~ have lifelink": while they're in combat with it.
  if ((m = /^Creatures blocking or blocked by ~ (have|get) (.+)$/.exec(text))) {
    const mods = parseStaticMods(`${m[1]} ${m[2]}`);
    return mods ? { affects: { kind: "inCombatWithSelf" }, mods, text: line } : null;
  }
  // Sting, the Glinting Dagger: "Equipped creature has first strike as long as it's blocking or blocked by a Goblin or Orc":
  // blocking one or blocked by one (CR 509.1g-h); one removed from combat no longer counts (CR 506.4).
  if ((m = /^Equipped creature has ([a-z ]+) as long as it's blocking or blocked by an? ([A-Z][a-z]+)(?: or ([A-Z][a-z]+))?$/.exec(text)) && [m[2], m[3]].every((x) => !x || CREATURE_TYPES.has(x))) {
    const st = parseStatic(`Equipped creature has ${m[1]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    const types = [m[2]!, ...(m[3] ? [m[3]] : [])];
    return { ...st, text: line, condition: { kind: "attachedInCombatWith", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: types, text: types.join(" or ") } } };
  }
  // Thieves' Tools: "Equipped creature can't be blocked as long as its power is 3 or less": its power as blockers are
  // declared (rulings; CR 509.1b), the rules effect applied after power and toughness (CR 613.11).
  if ((m = /^(Equipped|Enchanted) creature can't be blocked as long as its power is (\d+) or less$/.exec(text))) {
    const st = parseStatic(`${m[1]} creature can't be blocked.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], power: { max: Number(m[2]) }, text: `creature with power ${m[2]} or less` } } };
  }
  // Heroic Defiance: "Enchanted creature gets +3/+3 unless it shares a color with the most common color among all
  // permanents or a color tied for most common".
  if ((m = /^(Enchanted creature gets [+-]\d+\/[+-]\d+) unless it shares a color with the most common color among all permanents or a color tied for most common$/.exec(text))) {
    const st = parseStatic(`${m[1]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", mostCommonColor: false, text: "creature that doesn't share a color with the most common color" } } };
  }
  // "As long as equipped creature is a Human, it gets an additional +1/+1": a second bonus, only for a Human.
  // Bladed Bracers: "As long as equipped creature is a Human or an Angel, it has vigilance": either type.
  if ((m = /^As long as (enchanted|equipped) creature is an? ([A-Z][a-z]+)(?: or an? ([A-Z][a-z]+))?, it (gets|has) (.+)$/.exec(text)) && CREATURE_TYPES.has(m[2]!) && (!m[3] || CREATURE_TYPES.has(m[3]))) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[4]} ${m[5]!.replace(/^an additional /, "")}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    const kinds = [m[2]!, ...(m[3] ? [m[3]] : [])];
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], ...(kinds.length > 1 ? { anyOf: kinds.map((k): TargetSpec => ({ kind: "object", subtypes: [k], text: k })) } : { subtypes: kinds }), text: `${kinds.join(" or ")} creature` } } };
  }
  // Steel of the Godhead: "As long as enchanted creature is white, it gets +1/+1 and has lifelink": white among its colors
  // now (CR 105.2).
  // Ray of Frost: "As long as enchanted creature is red, it loses all abilities" (layer 6; rulings: abilities it gained
  // later stay, by timestamp).
  if ((m = /^As long as (enchanted|equipped) creature is (white|blue|black|red|green), it (gets|has|loses) (.+)$/.exec(text))) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[3]} ${m[4]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], colors: [COLOR_WORDS[m[2]!]!], text: `${m[2]} creature` } } };
  }
  // Face of Divinity: "As long as another Aura is attached to enchanted creature, it has first strike and lifelink": an Aura
  // other than this one, so two or more with it.
  if ((m = /^As long as another Aura is attached to enchanted creature, it (gets|has) (.+)$/.exec(text))) {
    const st = parseStatic(`Enchanted creature ${m[1]} ${m[2]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "amount", amount: { count: { kind: "attachedToHost", subtypes: ["Aura"] } }, min: 2 } };
  }
  // The Masamune: "As long as equipped creature is attacking, it has first strike and must be blocked if able": while it's
  // an attacking creature (CR 506.4, 611.3a).
  // Security Bypass: "As long as enchanted creature is attacking alone, it can't be blocked": attacking with no other
  // creature attacking (CR 506.5).
  if ((m = /^As long as (enchanted|equipped) creature is attacking( alone)?, it (gets|has|can't be blocked)(.*)$/.exec(text))) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[3]}${m[4]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], combat: m[2] ? "attackingAlone" : "attacking", text: m[2] ? "creature attacking alone" : "attacking creature" } } };
  }
  // Snow Devil: "Enchanted creature has first strike as long as it's blocking and you control a snow land": both, the
  // creature it's attached to blocking (CR 509.1g) and the land yours, as they are now.
  if ((m = /^(Enchanted|Equipped) creature has ([a-z ]+) as long as it's blocking and (you control .+)$/.exec(text))) {
    const st = parseStatic(`${m[1]} creature has ${m[2]}.`);
    const yours = st && parseStaticCondition(m[3]!, st);
    if (!st || st.condition || st.affects.kind !== "attached" || !yours) return null;
    return { ...st, text: line, condition: { kind: "allOf", conds: [{ kind: "attachedIs", filter: { kind: "object", types: ["Creature"], combat: "blocking", text: "blocking creature" } }, yours] } };
  }
  // Sword of the Paruns: "As long as equipped creature is tapped, tapped creatures you control get +2/+0": while the
  // creature it's attached to is tapped (or untapped), the rest applies; unattached, neither does.
  if ((m = /^As long as (enchanted|equipped) creature is (tapped|untapped), ((?:un)?tapped creatures you control get .+)$/.exec(text))) {
    const st = parseStatic(`${capital(m[3]!)}.`);
    if (!st || st.condition) return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], tapped: m[2] === "tapped", text: `${m[2]} creature` } } };
  }
  // Champion's Helm: "As long as equipped creature is legendary, it has hexproof" (CR 205.4d).
  // Tenza, Godo's Maul: "As long as it's legendary, it gets an additional +2/+2": a second bonus, only while legendary.
  if ((m = /^As long as (enchanted|equipped) creature is legendary, it (gets|has) (.+)$/.exec(text))) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[2]} ${m[3]!.replace(/^an additional /, "")}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], supertypes: ["Legendary"], text: "legendary creature" } } };
  }
  // Solid Footing: "As long as enchanted creature has vigilance, it assigns combat damage equal to its toughness rather
  // than its power"; Warmonger's Chariot: "As long as equipped creature has defender, it can attack as though it didn't".
  if ((m = /^As long as (enchanted|equipped) creature has (\w+), it (assigns combat damage .+|can attack as though .+)$/.exec(text)) && (SUPPORTED_KEYWORDS as readonly string[]).includes(capital(m[2]!))) {
    const st = parseStatic(`${capital(m[1]!)} creature ${m[3]}.`);
    if (!st || st.condition || st.affects.kind !== "attached") return null;
    return { ...st, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], keywords: [capital(m[2]!)], text: `creature with ${m[2]}` } } };
  }
  // Akki War Paint: "As long as enchanted permanent is a creature, it gets +2/+1" (an Aura that can enchant an artifact
  // or land that may become a creature): only while it's a creature (CR 611.3a).
  // Born to Drive: "... it gets +1/+1 for each creature and/or Vehicle you control": as "Enchanted permanent gets ...".
  if ((m = /^As long as (enchanted|equipped) permanent is a creature, it (gets .+|has .+)$/.exec(text))) {
    const whole = / for each /.test(m[2]!) ? parseStatic(`${capital(m[1]!)} permanent ${m[2]}.`) : null;
    const mods = whole ? (whole.affects.kind === "attached" && !whole.condition ? whole.mods : null) : parseStaticMods(m[2]!);
    return mods ? { affects: { kind: "attached" }, mods, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], text: "creature" } } } : null;
  }
  // Essence Leak: "As long as enchanted permanent is red or green, it has "At the beginning of your upkeep, sacrifice ~
  // unless you pay its mana cost."": while it's either color (CR 105.2); it does nothing to another permanent (rulings).
  if ((m = /^As long as enchanted permanent is (white|blue|black|red|green) or (white|blue|black|red|green), it (has ".+")$/.exec(text))) {
    const mods = parseStaticMods(m[3]!);
    return mods?.length && mods.every((x) => x.kind === "addAbility") ? { affects: { kind: "attached" }, mods, text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: [], colors: [COLOR_WORDS[m[1]!]!, COLOR_WORDS[m[2]!]!], text: `${m[1]} or ${m[2]} permanent` } } } : null;
  }
  // The Kaldheim Runes: "As long as enchanted permanent is an Equipment, it has "Equipped creature has flying."" (Rune of
  // Flight): while it's an Equipment, it has that static ability, which then applies to the creature it's attached to.
  // Nature's Embrace: "As long as enchanted permanent is a land, it has "{T}: Add two mana of any one color."" likewise.
  if ((m = /^As long as enchanted permanent is (an Equipment|a land), it (has ".+")$/.exec(text))) {
    const mods = parseStaticMods(m[2]!);
    const filter = m[1] === "a land" ? { kind: "object" as const, types: ["Land" as const], text: "land" } : { kind: "object" as const, types: [], notTypes: [], notColors: [], subtypes: ["Equipment"], text: "Equipment" };
    return mods?.length && mods.every((x) => x.kind === "addAbility") ? { affects: { kind: "attached" }, mods, text: line, condition: { kind: "attachedIs", filter } } : null;
  }
  // Luxior, Giada's Gift: "Equipped permanent isn't a planeswalker and is a creature in addition to its other types": one
  // type-changing effect (layer 4, CR 613.1d); losing the planeswalker type, it loses its planeswalker subtypes (CR
  // 205.3d). Its loyalty abilities can still be activated (CR 606.3), and with no power or toughness of its own it's a
  // 0/0 (rulings).
  if (text === "Equipped permanent isn't a planeswalker and is a creature in addition to its other types")
    return { affects: { kind: "attached" }, mods: [{ kind: "loseTypes", types: ["Planeswalker"] }, { kind: "addTypes", types: ["Creature"], subtypes: [] }], text: line };
  // Aerial Modification: "As long as enchanted permanent is a Vehicle, it's a creature in addition to its other types."
  // A type-changing effect (layer 4) whose condition looks at the permanent as the earlier effects in that layer left it.
  if ((m = /^As long as (?:enchanted|equipped) permanent is an? (Vehicle), it's a creature in addition to its other types$/.exec(text)))
    return { affects: { kind: "attached" }, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }], text: line, condition: { kind: "attachedIs", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [m[1]!], text: m[1]! } } };
  // The Incarnations: "As long as ~ is in your graveyard and you control a Mountain, creatures you control have haste"
  // (Anger): it works only from its owner's graveyard (CR 113.6b).
  if ((m = /^As long as ~ is in your graveyard(?: and (.+?))?, ((?:creatures|lands) you control (?:have|get) .+)$/.exec(text))) {
    const st = parseStatic(`${capital(m[2]!)}.`);
    if (!st || st.condition || st.affects.kind !== "filter") return null;
    const condition = m[1] ? parseStaticCondition(m[1], st) : undefined;
    if (m[1] && !condition) return null;
    return { ...st, text: line, zone: "graveyard", ...(condition ? { condition } : {}) };
  }
  let negate = false;
  let notCond = false;
  let alsoYourTurn = false;
  // Homicidal Seclusion: "As long as you control exactly one creature, that creature gets +3/+1 and has lifelink": the one
  // creature you control, so each creature you control while there's just one.
  if ((m = /^As long as (you control exactly one creature), that creature gets ([+-]\d+\/[+-]\d+)(?: and has ([a-z, ]+))?$/.exec(text))) {
    const st = parseConditionalStatic(`As long as ${m[1]}, creatures you control get ${m[2]}${m[3] ? ` and have ${m[3]}` : ""}.`);
    return st && { ...st, text: line };
  }
  if ((m = /^(.+?) as long as (.+)$/.exec(text)) && !/^During your turn, /.test(text)) [statement, cond] = [m[1], m[2]];
  // Hobble: "Enchanted creature can't block if it's black": while it's black, by its colors as the layers so far left them.
  else if ((m = /^(Enchanted creature can't block) if (it's (?:white|blue|black|red|green))$/.exec(text))) [statement, cond] = [m[1], m[2]];
  else if ((m = /^As long as (~ is enchanted, equipped, and has a counter on it|[^,]+), (.+)$/.exec(text))) [cond, statement] = [m[1], m[2]];
  // Cloud, Planet's Champion: "During your turn, as long as ~ is equipped, it has double strike and indestructible": both.
  else if ((m = /^During your turn, as long as ([^,]+), (.+)$/.exec(text))) [cond, statement, alsoYourTurn] = [m[1], m[2], true];
  else if ((m = /^During your turn, (.+)$/.exec(text))) [cond, statement] = ["it's your turn", m[1]];
  // Mesa Lynx: "During turns other than yours, ~ gets +0/+2"; Midnight Mangler: "... ~ is an artifact creature": while it
  // isn't your turn.
  else if ((m = /^During turns other than yours, (.+)$/.exec(text))) [cond, statement] = ["it's not your turn", m[1]];
  // Zurgo, Thunder's Decree: "During your end step, Warrior tokens you control have ..." (the end step only, not cleanup,
  // CR 513).
  else if ((m = /^During your end step, (.+)$/.exec(text))) [cond, statement] = ["it's your end step", m[1]];
  // Razorkin Needlehead: "~ has first strike during your turn".
  else if ((m = /^(~ (?:has|gets) [^,]+?) during your turn$/.exec(text))) [statement, cond] = [m[1], "it's your turn"];
  // Medomai the Ageless: "~ can't attack during extra turns" (CR 500.7).
  else if ((m = /^(~ can't attack) during extra turns$/.exec(text))) [statement, cond] = [m[1], "it's an extra turn"];
  // Lurker: "~ can't be the target of spells unless it attacked or blocked this turn".
  else if ((m = /^(~ can't be the target of spells) unless it attacked or blocked this turn$/.exec(text))) [statement, cond] = [m[1], "~ didn't attack or block this turn"];
  // Wayward Swordtooth: "~ can't attack or block unless you have the city's blessing".
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless you have the city's blessing$/.exec(text))) [statement, cond] = [m[1], "you don't have the city's blessing"];
  // Topiary Stomper: "~ can't attack or block unless you control seven or more lands", Desperate Castaways "... unless you
  // control an artifact": the restriction applies while the "you control" condition is false (negated below).
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless (you control (?!more )[^,]+)$/.exec(text))) [statement, cond, negate] = [m[1], m[2], true];
  // Wirecat: "~ can't attack or block if an enchantment is on the battlefield"; Branded Brawlers: "~ can't block if you
  // control an untapped land": the restriction applies while that's so.
  else if ((m = /^(~ can't (?:attack or block|attack|block)) if (an? [^,]+ is on the battlefield|you control (?!more )[^,]+)$/.exec(text))) [statement, cond] = [m[1], m[2]];
  // Shauku, Endbringer: "~ can't attack if there's another creature on the battlefield": anyone's but its own.
  else if ((m = /^(~ can't (?:attack or block|attack|block)) if there's (another [a-z]+) on the battlefield$/.exec(text))) [statement, cond] = [m[1], `${m[2]} is on the battlefield`];
  // Glacial Crasher: "~ can't attack unless there is a Mountain on the battlefield": anyone's (rulings).
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless there is (an? [^,]+) on the battlefield$/.exec(text))) [statement, cond] = [m[1], `no ${m[2]!.replace(/^an? /, "").replace(/(?<!s)$/, "s")} are on the battlefield`];
  // Monstrous Hound: "~ can't block unless you control more lands than attacking player": the active player, the only
  // one whose creatures attack (CR 506.2, 508.1).
  else if ((m = /^(~ can't block) unless you control more (lands|creatures) than attacking player$/.exec(text))) [statement, cond] = [m[1], `you don't control more ${m[2]} than the active player`];
  // Flowering Lumberknot: "~ can't attack or block unless it's paired with a creature with soulbond".
  // Sab-Sunen, Luxa Embodied: "~ can't attack or block unless it has an even number of counters on it" (of all kinds).
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless it has an? (even|odd) number of counters on it$/.exec(text))) [statement, cond] = [m[1], `it has an ${m[2] === "even" ? "odd" : "even"} number of counters on it`];
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless it's paired with a creature with soulbond$/.exec(text))) [statement, cond] = [m[1], "it's not paired with a creature with soulbond"];
  // Tadeas, Juniper Ascendant: "~ has hexproof unless it's attacking": while it isn't an attacking creature (CR 506.4).
  else if ((m = /^(~ has [a-z]+) unless it's attacking$/.exec(text))) [statement, cond] = [m[1], "it isn't attacking"];
  // Training Drone: "~ can't attack or block unless it's equipped".
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless it's (equipped|enchanted)$/.exec(text))) [statement, cond] = [m[1], `~ isn't ${m[2]}`];
  // Ketramose, the New Dawn: "~ can't attack or block unless there are seven or more cards in exile": while there are fewer.
  else if ((m = new RegExp(`^(~ can't (?:attack or block|attack|block)) unless there are ${NUM} or more cards in exile$`).exec(text))) [statement, cond] = [m[1], `there are fewer than ${m[2]} cards in exile`];
  // Kefnet the Mindful: "~ can't attack or block unless you have seven or more cards in hand": while you have fewer.
  else if ((m = new RegExp(`^(~ can't (?:attack or block|attack|block)) unless you have ${NUM} or more cards in hand$`).exec(text))) [statement, cond] = [m[1], `you have fewer than ${m[2]} cards in hand`];
  // Any other "~ can't attack or block unless <condition>" (Lupine Prototype's "unless a player has no cards in hand",
  // Relic Golem's "unless an opponent has eight or more cards in their graveyard"): the restriction applies while the
  // condition is false (a "not" condition, see below).
  // Marauding Maulhorn: "~ attacks each combat if able unless you control a creature named Advocate of the Beast".
  // Galactus, Devourer of Worlds: "~ attacks an opponent with the most life among your opponents each combat if able unless
  // you control a creature named Silver Surfer, ~'s Herald" (that name kept as written by normalizeSelf).
  else if ((m = /^(~ attacks (?:an opponent with the most life among your opponents )?each combat if able) unless (you control .+)$/.exec(text))) [statement, cond, notCond] = [m[1], m[2], true];
  else if ((m = /^(~ can't (?:attack or block|attack|block)) unless (.+)$/.exec(text))) [statement, cond, notCond] = [m[1], m[2]!.replace(/^it(?='s | has | is )|^its (?=power |toughness )/, (w) => (w === "it" ? "~" : "~'s ")), true];
  // Hellkite Hatchling: "~ has flying and trample if it devoured a creature" (CR 702.82b).
  else if ((m = /^(~ .+?) if it devoured a creature$/.exec(text))) [statement, cond] = [m[1], "it devoured a creature"];
  // Nimble Brigand: "~ can't be blocked if you've committed a crime this turn": the same as "as long as" (CR 700.13).
  else if ((m = /^(~ .+?) if (you've committed a crime this turn)$/.exec(text))) [statement, cond] = [m[1], m[2]];
  // Fugitive Droid: "~ can't be blocked if an artifact entered the battlefield under your control this turn": the same.
  else if ((m = /^(~ can't be blocked) if (an? [a-z]+ entered the battlefield under your control this turn)$/.exec(text))) [statement, cond] = [m[1], m[2]];
  if (!statement || !cond) return null;
  // Theros gods: "As long as your devotion to black is less than five, ~ isn't a creature": it loses the card type
  // creature and its creature types (layer 4, CR 205.3d; rulings). It works even if the God lost all abilities, as layer 4
  // comes before layer 6 (rulings).
  if (statement === "~ isn't a creature") {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [{ kind: "loseTypes", types: ["Creature"] }], text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // Arixmethes: "As long as ~ has a slumber counter on it, it's a land. (It's not a creature.)": its card types become
  // just land, replacing the others and their subtypes (layer 4, CR 205.1a-b); still legendary, its colors and mana
  // value stay (rulings).
  if (statement === "it's a land" && /^~ has an? [a-z]+ counter on it$/.test(cond)) {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [{ kind: "setTypes", types: ["Land"], subtypes: [] }], text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // Rusted Relic: "~ is a 5/5 Golem artifact creature as long as ...", Warden of the Wall: "During turns other than yours,
  // ~ is a 2/3 Gargoyle artifact creature with flying": it keeps its other card types and subtypes, its creature types
  // replaced (CR 205.1b), with that base power and toughness (layers 4 and 7b).
  const artifactCreature = /^~ is (an? (?:\d+\/\d+ )?(?:[A-Z][a-z]+ )*artifact creature(?: with [a-z ,]+)?)$/.exec(statement);
  if (artifactCreature) {
    const mods = parseBecomes(artifactCreature[1]!);
    if (!mods || mods.some((x) => x.kind === "setColors")) return null;
    const self: StaticAbility = { affects: { kind: "self" }, mods, text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // Circle of the Moon Druid: "During your turn, ~ is a Bear with base power and toughness 4/2": a Bear instead of its
  // other creature types (CR 205.1b, the reminder text says so), with that base power and toughness (layers 4 and 7b).
  // Futurist Operative: "As long as ~ is tapped, it's a Human Citizen with base power and toughness 1/1 and can't be
  // blocked": those creature types instead of its others, applied in its own timestamp order (rulings).
  const typedBase = /^(?:~ is|it's) an? ((?:[A-Z][a-z]+ )*[A-Z][a-z]+) with base power and toughness (\d+)\/(\d+)( and can't be blocked)?$/.exec(statement);
  const unblockable = typedBase?.[4] ? parseStaticMods("can't be blocked") : [];
  if (typedBase && typedBase[1]!.split(" ").every((w) => CREATURE_TYPES.has(w)) && unblockable) {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [{ kind: "setSubtypes", subtypes: typedBase[1]!.split(" ") }, { kind: "setPT", power: Number(typedBase[2]), toughness: Number(typedBase[3]) }, ...unblockable], text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // Repentant Vampire: "Threshold — As long as ..., ~ is white and has "{T}: ..."": white instead of its other colors
  // (layer 5, rulings: not white and black) and the ability (layer 6) while the condition holds.
  const hued = /^~ (is (?:white|blue|black|red|green) and has ".+")$/.exec(statement);
  if (hued) {
    const mods = parseStaticMods(hued[1]!);
    if (!mods) return null;
    const self: StaticAbility = { affects: { kind: "self" }, mods, text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // Idol of False Gods: "it's a 0/0 creature in addition to its other types and it has annihilator 2".
  const itsA = /^it's (an? \d+\/\d+ (?:[A-Z][a-z]+ )?creature in addition to its other types)(?: and it (has .+))?$/.exec(statement);
  if (itsA) statement = `~ is ${itsA[1]}${itsA[2] ? ` and ${itsA[2]}` : ""}`;
  // Weatherlight Compleated: "it's a Phyrexian creature in addition to its other types": a Vehicle, so with its printed
  // power and toughness (CR 301.7c), keeping its other types (CR 205.1b).
  const itsCreature = /^it's an? (?:([A-Z][a-z]+) )?creature in addition to its other types$/.exec(statement);
  if (itsCreature && (!itsCreature[1] || CREATURE_TYPES.has(itsCreature[1])) && /^~ has [a-z]+ or more [a-z]+ counters on it$/.test(cond)) {
    const self: StaticAbility = { affects: { kind: "self" }, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: itsCreature[1] ? [itsCreature[1]] : [], supertypes: [] }], text: line };
    const condition = parseStaticCondition(cond, self);
    return condition ? { ...self, condition } : null;
  }
  // "During your turn, equipped creature gets +1/+0": the statement starts a sentence of its own.
  const st = parseStatic(`${statement.replace(/\bgets an additional\b/, "gets").replace(/^(it|this creature|this permanent)\b/i, "~").replace(/^(enchanted|equipped|creatures|other|commanders|untap|nonbasic) /, (w) => w.charAt(0).toUpperCase() + w.slice(1))}.`);
  if (!st || st.condition) return null;
  // "This spell has flash as long as ...": it works from your hand, which a static ability of a permanent can't.
  if (st.mods.some((x) => x.kind === "addKeywords" && x.keywords.includes("Flash"))) return null;
  const condition1 = parseStaticCondition(cond, st);
  const yourTurn = alsoYourTurn ? parseStaticCondition("it's your turn", st) : undefined;
  const condition0 = !alsoYourTurn ? condition1 : condition1 && yourTurn ? { kind: "allOf" as const, conds: [yourTurn, condition1] } : null;
  // "Unless you control N or more X" is "as long as you control N-1 or fewer X".
  if (notCond) return condition0 ? { ...st, text: line, condition: { kind: "not", cond: condition0 } } : null;
  const condition = !negate ? condition0 : condition0?.kind === "control" && condition0.min !== undefined && condition0.max === undefined && !condition0.differentNames && !condition0.otherThanSubject ? (({ min, ...rest }) => ({ ...rest, max: min! - 1 }))(condition0) : null;
  return condition ? { ...st, text: line, condition } : null;
}

/**
 * Cost changes (CR 601.2f). A permanent's "Instant and sorcery spells you cast cost {1} less to cast",
 * "Noncreature spells cost {1} more to cast", "Spells your opponents cast cost {1} more to cast"; and a
 * spell's own "This spell costs {1} less to cast for each creature card in your graveyard", "... where X
 * is ...", "... if you control a Wizard" / "If an opponent controls seven or more lands, ...". Only generic
 * mana: a reduction can't take colored mana off (CR 118.7a).
 */
export function parseCostChange(line: string): { costMod: CostMod } | { less: Amount } | { lessIf: { n: number; cond: StaticCondition; colored?: Color[] } } | { lessIfTargets: { n: number; filter: TargetSpec; colored?: Color[] } } | { targetTax: number } | { targetDiscount: number } | { targetDiscountAny: number } | { castTargetEnchantedPlayerLess: number } | { targetLifeTax: number } | { castTargetLess: { n: number; filter: TargetSpec } } | { lessEachColored: { color: Color; count: Amount } } | { commanderTargetTax: number } | { opponentsTargetTax: { n: number; filter: TargetSpec; abilities?: true } } | "fail" | null {
  let text = line.replace(/^[A-Z][A-Za-z' -]+ — (?=~ costs|The second)/, "").replace(/\.$/, ""); // "Domain —" is an ability word
  let m: RegExpExecArray | null;
  // "Each spell you cast that's a Demon, Horror, or Nightmare costs {1} less to cast" (Ancient Cellarspawn): spells of
  // any of those subtypes, read like "Demon, Horror, and Nightmare spells you cast cost {1} less to cast".
  if ((m = /^Each spell you cast that's an? ((?:[A-Z][a-z]+, )*[A-Z][a-z]+,? or [A-Z][a-z]+) costs (\{\d+\} less to cast)$/.exec(text)))
    text = `${m[1]!.replace(/,? or /, m[1]!.includes(",") ? ", and " : " and ")} spells you cast cost ${m[2]}`;
  // Pollywog Symbiote: "Each creature spell you cast costs {1} less to cast if it has mutate": cast for its mutate cost or
  // not (rulings), generic mana only (CR 601.2f).
  if ((m = /^Each creature spell you cast costs \{(\d+)\} less to cast if it has (mutate)$/.exec(text)))
    return { costMod: { who: "you", filter: { kind: "spell", types: ["Creature"], notTypes: [], notColors: [], keywords: [capital(m[2]!)], text: `creature spells with ${m[2]}` }, n: -Number(m[1]), text: line } };
  // Beluna Grandsquall: "Permanent spells you cast that have an Adventure cost {1} less to cast": adventurer cards cast as
  // permanent spells (rulings: an Adventure spell is an instant or sorcery, not a permanent spell). Cunning Nightbonder:
  // "Spells with flash you cast cost {1} less to cast" (the and-can't-be-countered half is read in compile.ts).
  if ((m = /^(Permanent spells|Spells) you cast that have an Adventure (cost \{\d+\} less to cast)$|^Spells with (flash) you cast (cost \{\d+\} less to cast)$/.exec(text))) {
    const base = parseCostChange(m[1] ? `${m[1]} you cast ${m[2]}` : `Spells you cast ${m[4]}`);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.who !== "you" || base.costMod.times || base.costMod.nth || base.costMod.if) return "fail";
    const filter: TargetSpec = m[1] ? { ...base.costMod.filter, hasAdventure: true, text: `${m[1].toLowerCase()} that have an Adventure` } : { ...base.costMod.filter, keywords: ["Flash"], text: "spells with flash" };
    return { costMod: { ...base.costMod, filter, text: line } };
  }
  // Doran, Besieged by Time: "Each creature spell you cast with toughness greater than its power costs {1} less to cast".
  if ((m = /^Each creature spell you cast with toughness greater than its power costs (\{\d+\} less to cast)$/.exec(text))) text = `Creature spells you cast with toughness greater than their power cost ${m[1]}`;
  // Eminence: "As long as ~ is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to
  // cast" (The Ur-Dragon): it works from the command zone too (CR 113.6); not the card itself.
  if ((m = /^(?:Eminence — )?As long as ~ is in the command zone or on the battlefield, other ((?:[A-Z][a-z]+ )+spells you cast cost \{\d+\} less to cast)$/.exec(text))) {
    const base = parseCostChange(m[1]!);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.who !== "you" || base.costMod.times || base.costMod.nth || base.costMod.if) return "fail";
    return { costMod: { ...base.costMod, eminence: true, other: true, text: line } };
  }
  // "Cleric spells you cast cost {W}{B} less to cast. This effect reduces only the amount of colored mana you pay." (Edgewalker),
  // Morophon's "Spells of the chosen type you cast cost {W}{U}{B}{R}{G} less ...": colored mana only, never generic (CR 118.7).
  if ((m = /^(.+ cost) ((?:\{[WUBRG]\})+) (less to cast)\. This effect reduces only the amount of colored mana you pay$/.exec(text))) {
    const colors = [...m[2]!.matchAll(/[WUBRG]/g)].map((x) => x[0] as Color);
    if (new Set(colors).size !== colors.length) return "fail";
    const base = parseCostChange(`${m[1]!.replace(/^Spells of the chosen type you cast cost$/, "Spells you cast of the chosen type cost")} {1} ${m[3]!}`);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.times || base.costMod.nth) return "fail";
    return { costMod: { ...base.costMod, n: 0, colored: colors, text: line } };
  }
  // The Leeches: "Red spells you cast cost {R} more to cast", Derelor: "Black spells you cast cost {B} more to cast": that
  // colored mana added to the total cost (CR 601.2f).
  if ((m = /^((?:White|Blue|Black|Red|Green) spells you cast cost) \{([WUBRG])\} (more to cast)$/.exec(text))) {
    const base = parseCostChange(`${m[1]} {1} ${m[3]}`);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.times || base.costMod.nth) return "fail";
    return { costMod: { ...base.costMod, n: 0, moreColored: [m[2] as Color], text: line } };
  }
  // The Defilers: "As an additional cost to cast green permanent spells, you may pay 2 life. Those spells cost {G} less to
  // cast if you paid life this way. This effect reduces only the amount of green mana you pay." An optional additional
  // cost of each spell it applies to, once per spell (rulings, CR 601.2b), and a colored reduction if it was paid (601.2f).
  if ((m = /^As an additional cost to cast (white|blue|black|red|green) permanent spells, you may pay (\d+) life\. Those spells cost \{([WUBRG])\} less to cast if you paid life this way\. This effect reduces only the amount of \1 mana you pay$/.exec(text))) {
    const base = parseCostChange(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} permanent spells you cast cost {1} less to cast`);
    const color = ({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as const)[m[1] as "white"];
    if (!base || base === "fail" || !("costMod" in base) || color !== m[3]) return "fail";
    return { costMod: { ...base.costMod, n: 0, colored: [color], payLife: Number(m[2]), text: line } };
  }
  // Defense Grid: "Each spell costs {3} more to cast except during its controller's turn": whoever casts it, unless it's
  // their turn (CR 601.2f).
  if ((m = /^Each spell costs \{(\d+)\} more to cast except during its controller's turn$/.exec(text))) return { costMod: { who: "all", filter: { kind: "spell", text: "spells" }, n: Number(m[1]), turn: "notCasters", text: line } };
  if ((m = /^Spells your opponents cast that target ~ cost \{(\d+)\} more to cast$/.exec(text))) return { targetTax: Number(m[1]) };
  // Accursed Witch: "Spells your opponents cast that target ~ cost {1} less to cast"; Infectious Curse: "Spells you cast that
  // target enchanted player cost {1} less to cast": Aura spells and spells with other targets too, not abilities (rulings).
  if ((m = /^Spells your opponents cast that target ~ cost \{(\d+)\} less to cast$/.exec(text))) return { targetDiscount: Number(m[1]) };
  // Spellwild Ouphe: "Spells that target ~ cost {2} less to cast": any player's (rulings).
  if ((m = /^Spells that target ~ cost \{(\d+)\} less to cast$/.exec(text))) return { targetDiscountAny: Number(m[1]) };
  if ((m = /^Spells you cast that target enchanted player cost \{(\d+)\} less to cast$/.exec(text))) return { castTargetEnchantedPlayerLess: Number(m[1]) };
  // Killian, Ink Duelist: "Spells you cast that target a creature cost {2} less to cast" (generic mana only, rulings).
  if ((m = /^Spells you cast that target an? ([a-z]+) cost \{(\d+)\} less to cast$/.exec(text))) {
    const filter = parseTargetPhrase(m[1]!);
    return filter?.kind === "object" ? { castTargetLess: { n: Number(m[2]), filter } } : "fail";
  }
  // Esior, Wardwing Familiar: "Spells your opponents cast that target one or more commanders you control cost {3} more to
  // cast": once per spell, however many it targets (rulings).
  if ((m = /^Spells your opponents cast that target one or more commanders you control cost \{(\d+)\} more to cast$/.exec(text))) return { commanderTargetTax: Number(m[1]) };
  if ((m = /^Spells your opponents cast that target ~ cost an additional (\d+) life to cast$/.exec(text))) return { targetLifeTax: Number(m[1]) };
  // Kopala, Warden of Waves: "Spells your opponents cast that target a Merfolk you control cost {2} more to cast",
  // "Abilities your opponents activate that target a Merfolk you control cost {2} more to activate": once per spell or
  // ability however many it targets (rulings); activated abilities only, not triggered ones (CR 602.2b applies 601.2f).
  if ((m = /^(Spells your opponents cast|Abilities your opponents activate) that target an? ([A-Za-z]+(?: or [a-z]+)?) you control cost \{(\d+)\} more to (cast|activate)$/.exec(text)) && (m[1]!.startsWith("Spells") === (m[4] === "cast"))) {
    const filter = parseTargetPhrase(m[2]!);
    return filter?.kind === "object" && !filter.controller ? { opponentsTargetTax: { n: Number(m[3]), filter: { ...filter, text: m[2]! }, ...(m[4] === "activate" ? { abilities: true as const } : {}) } } : "fail";
  }
  // Valiant Changeling: "This effect can't reduce the amount of mana this spell costs by more than {5}": the reduction is
  // at most that much (CR 601.2f).
  if ((m = /^(~ costs \{\d+\} less to cast for each .+)\. This effect can't reduce the amount of mana ~ costs by more than \{(\d+)\}$/.exec(text))) {
    const base = parseCostChange(m[1]!);
    return base && base !== "fail" && "less" in base && typeof base.less !== "number" ? { less: { ...base.less, max: Number(m[2]) } } : "fail";
  }
  // Khalni Hydra: "~ costs {G} less to cast for each green creature you control": that colored mana off first, then
  // generic mana for the rest (rulings, CR 601.2f).
  if ((m = /^~ costs \{([WUBRG])\} less to cast for each (.+)$/.exec(text))) {
    const c = parseCount(m[2]!, null, true);
    return c ? { lessEachColored: { color: m[1] as Color, count: c } } : "fail";
  }
  if ((m = /^~ costs \{(\d+)\} less to cast for each (.+)$/.exec(text))) {
    const c = parseCount(m[2]!, null, true);
    return c ? { less: { ...c, times: (c.times ?? 1) * Number(m[1]) } } : "fail";
  }
  // Cemetery Prowler: "Spells you cast cost {1} less to cast for each card type they share with cards exiled with ~"
  // (linked in compile.ts).
  if ((m = /^Spells you cast cost \{(\d+)\} less to cast for each card type they share with cards exiled with ~$/.exec(text)))
    return { costMod: { who: "you", filter: { kind: "spell", text: "spells" }, n: -Number(m[1]), perTypeSharedWithLinked: true, text: line } };
  // "Instant and sorcery spells you cast cost {1} less to cast for each experience counter you have" (Mizzix): that much
  // less for each, counted as the spell is cast (CR 601.2f).
  // "Angel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on ~" (Herald of War).
  // Eluge: "The first instant or sorcery spell you cast each turn costs {U} (or {1}) less to cast for each land you control
  // with a flood counter on it": {U} off for each while there's {U} in the cost, then {1} (rulings).
  if ((m = /^(The first .*?spell you cast each turn) costs \{([WUBRG])\} \(or \{1\}\) less to cast for each (.+)$/.exec(text))) {
    const base = parseCostChange(`${m[1]} costs {1} less to cast`);
    const c = parseCount(m[3]!, null, true);
    if (!base || base === "fail" || !("costMod" in base) || !c) return "fail";
    return { costMod: { ...base.costMod, n: 0, times: c, coloredOrGeneric: m[2] as Color, text: line } };
  }
  // Hum of the Radix: "Each artifact spell costs {1} more to cast for each artifact its controller controls": everyone's
  // artifact spells, counted for the spell's caster as it's cast (CR 601.2f).
  if ((m = /^Each (artifact|creature|enchantment) spell costs \{(\d+)\} more to cast for each (artifact|creature|enchantment) its controller controls$/.exec(text))) {
    const base = parseCostChange(`${capital(m[1]!)} spells cost {${m[2]}} more to cast`);
    const c = parseCount(`${m[3]} you control`, null, true);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.who !== "all" || !c) return "fail";
    return { costMod: { ...base.costMod, times: c, timesForCaster: true, text: line } };
  }
  if ((m = /^(.+ you cast costs? \{\d+\} less to cast) for each (.+)$/.exec(text)) && !/^~/.test(text)) {
    const base = parseCostChange(m[1]!);
    const c = parseCount(m[2]!, null, true);
    if (!base || base === "fail" || !("costMod" in base) || !c) return "fail";
    return { costMod: { ...base.costMod, times: c, text: line } };
  }
  // "Creature spells you cast cost {X} less to cast, where X is the amount of life you gained this turn" (Ezzaroot
  // Channeler), "Aura and Equipment spells you cast cost {X} less to cast, where X is ~'s power" (Golden-Tail Trainer): {1}
  // less for each, counted as the spell is cast (CR 601.2f).
  if ((m = /^(.+ you cast(?: with mana value \d+ or greater)?) cost \{X\} less to cast, where X is (.+)$/.exec(text))) {
    const base = parseCostChange(`${m[1]} cost {1} less to cast`);
    const c = parseCount(m[2]!, null);
    if (!base || base === "fail" || !("costMod" in base) || base.costMod.times || !c) return "fail";
    return { costMod: { ...base.costMod, times: c, text: line } };
  }
  // Shadow of Mortality: the difference between your starting life total and your life total (CR 103.4, 601.2f).
  if (/^If your life total is less than your starting life total, ~ costs \{X\} less to cast, where X is the difference$/.test(text)) return { less: { count: { kind: "lifeBelowStart" } } };
  if ((m = /^~ costs \{X\} less to cast, where X is (.+)$/.exec(text))) {
    const c = parseCount(m[1]!, null);
    return c ? { less: c } : "fail";
  }
  // Not of This World: "... if it targets a spell or ability that targets a creature you control with power 7 or
  // greater", checked as the spell is cast, against the targets the spell or ability has then (rulings, CR 601.2f).
  if ((m = /^~ costs \{(\d+)\} less to cast if it targets a spell or ability that targets (an? .+)$/.exec(text))) {
    const what = parseTargetPhrase(m[2]!.replace(/^an? /, ""));
    return what?.kind === "object" ? { lessIfTargets: { n: Number(m[1]), filter: { kind: "spell", stackAbilities: "both", targetsWhat: what, text: `spell or ability that targets ${m[2]}` } } } : "fail";
  }
  // Vanish into Eternity: "~ costs {3} more to cast if it targets a creature": an increase, with the targets chosen
  // before the total cost is (CR 601.2c, 601.2f).
  // Dragon's Prey: "~ costs {2} more to cast if it targets a Dragon": a permanent with that subtype.
  if ((m = /^~ costs \{(\d+)\} more to cast if it targets (an? [a-z]+|an? [A-Z][a-z]+)$/.exec(text))) {
    const filter = parseTargetPhrase(m[2]!.replace(/^an? /, ""));
    return filter?.kind === "object" ? { lessIfTargets: { n: -Number(m[1]), filter } } : "fail";
  }
  // Brush Off: "~ costs {1}{U} less to cast if it targets an instant or sorcery spell": the {U} off its colored mana.
  if ((m = /^~ costs \{(\d+)\}((?:\{[WUBRG]\})*) less to cast if it targets (an? .+)$/.exec(text))) {
    const colored = [...m[2]!.matchAll(/\{([WUBRG])\}/g)].map((x) => x[1] as Color);
    // Revoke Demise: "... if it targets a creature card with mana value 3 or less": a card in a graveyard (its printed
    // characteristics, CR 109.2a).
    const card = /^an? (.+? card\b.*)$/.exec(m[3]!);
    if (card && !/ from /.test(card[1]!)) {
      const f = parseTargetPhrase(`${card[1]} from a graveyard`);
      return f?.kind === "card" ? { lessIfTargets: { n: Number(m[1]), filter: f, ...(colored.length ? { colored } : {}) } } : "fail";
    }
    // Dire Downdraft: "if it targets an attacking or tapped creature": a creature that's either.
    if (m[3] === "an attacking or tapped creature") {
      const [att, tap] = [parseTargetPhrase("attacking creature"), parseTargetPhrase("tapped creature")];
      if (att?.kind !== "object" || tap?.kind !== "object") return "fail";
      return { lessIfTargets: { n: Number(m[1]), filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf: [att, tap], text: "attacking or tapped creature" }, ...(colored.length ? { colored } : {}) } };
    }
    const filter = parseTargetPhrase(m[3]!.replace(/^an? /, ""));
    // "If it targets a blue spell" (Mystical Dispute), "a creature spell" (Out of Air): a spell on the stack.
    return filter?.kind === "object" || (filter?.kind === "spell" && !filter.stackAbilities && !filter.targetsWhat) ? { lessIfTargets: { n: Number(m[1]), filter, ...(colored.length ? { colored } : {}) } } : "fail";
  }
  // "The first creature spell you cast each turn costs {2} less to cast", "The second spell you cast each turn ...".
  // Momo, Friendly Flier: "The first non-Lemur creature spell with flying you cast during each of your turns costs {1}
  // less to cast": the spell's own flying (as Warden of Evos Isle's), only during your turn; one that matches but has
  // no generic mana to reduce still uses it up (rulings).
  // Zimone, Infinite Analyst: "The first spell you cast with {X} in its mana cost each turn costs {1} less to cast for each
  // +1/+1 counter on ~": that many less, counted as the spell is cast (CR 601.2f); spells with {X} cast earlier this turn
  // count even before ~ was on the battlefield (rulings).
  if ((m = /^(The first spell you cast with \{X\} in its mana cost each turn costs \{\d+\} less to cast) for each (.+)$/.exec(text))) {
    const base = parseCostChange(m[1]!);
    const c = parseCount(m[2]!, null, true);
    if (!base || base === "fail" || !("costMod" in base) || !c) return "fail";
    return { costMod: { ...base.costMod, times: c, text: line } };
  }
  if ((m = /^The (first|second) (.*?)spell( with (?:flying|haste|trample|deathtouch|lifelink|vigilance|reach|defender|menace))? you cast( with \{X\} in its mana cost)? (each turn|during each of your turns) costs \{(\d+)\} less to cast$/.exec(text)) && !(m[3] && m[4])) {
    const filter = m[2] ? parseTargetPhrase(`${m[2]}spell`) : { kind: "spell" as const, text: "spell" };
    if (!filter || filter.kind !== "spell") return "fail";
    const kw = m[3] ? { keywords: [capital(m[3].slice(6))] } : m[4] ? { xInCost: true as const } : {};
    return { costMod: { who: "you", filter: { ...filter, ...kw, text: `${m[2]}spells${m[3] ?? ""}${m[4] ? " with {X} in their mana costs" : ""}` }, n: -Number(m[6]), nth: m[1] === "first" ? 1 : 2, ...(m[5] === "each turn" ? {} : { turn: "yours" as const }), text: line } };
  }
  // Warden of Evos Isle: "Creature spells with flying you cast cost {1} less to cast": the spell's own printed flying, not
  // flying it would get on the battlefield (rulings).
  if ((m = /^([A-Z][a-z]+) spells with (flying|haste|trample|deathtouch|lifelink|vigilance|reach|defender|menace) you cast cost (\{\d+\} (?:less|more) to cast)$/.exec(text))) {
    const base = parseCostChange(`${m[1]} spells you cast cost ${m[3]}`);
    if (!base || base === "fail" || !("costMod" in base)) return "fail";
    return { costMod: { ...base.costMod, filter: { ...base.costMod.filter, keywords: [capital(m[2]!)], text: `${m[1]!.toLowerCase()} spells with ${m[2]}` }, text: line } };
  }
  if ((m = /^Spells you cast but don't own cost \{(\d+)\} less to cast$/.exec(text))) return { costMod: { who: "you", filter: { kind: "spell", text: "spells you don't own" }, n: -Number(m[1]), notOwned: true, text: line } };
  if ((m = /^~ costs \{(\d+)\} less to cast if you've cast another spell this turn$/.exec(text))) return { lessIf: { n: Number(m[1]), cond: { kind: "castAnother" } } };
  // Mage Duel: "~ costs {2} less to cast if you've cast another instant or sorcery spell this turn".
  if ((m = /^~ costs \{(\d+)\} less to cast if you've cast another instant or sorcery spell this turn$/.exec(text))) return { lessIf: { n: Number(m[1]), cond: { kind: "castAnother", types: ["Instant", "Sorcery"] } } };
  const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: line };
  // "During your turn, ~ costs {2}{U}{U} less to cast" (Discontinuity), "During turns other than yours, ~ costs {3} more to
  // cast" (Hurkyl's Final Meditation): checked as it's cast (CR 601.2f); a colored reduction takes off that colored mana.
  // Mental Modulation: "~ costs {1} less to cast during your turn": the same.
  const trailing = /^~ costs ((?:\{\d+\})?(?:\{[WUBRG]\})*) (less|more) to cast during (your turn|turns other than yours)$/.exec(text);
  if (trailing) text = `During ${trailing[3]}, ~ costs ${trailing[1]} ${trailing[2]} to cast`;
  if ((m = /^During (your turn|turns other than yours), ~ costs ((?:\{\d+\})?(?:\{[WUBRG]\})*) (less|more) to cast$/.exec(text)) && m[2]) {
    const n = Number(/\{(\d+)\}/.exec(m[2])?.[1] ?? 0);
    const colored = [...m[2].matchAll(/\{([WUBRG])\}/g)].map((x) => x[1] as Color);
    if (m[3] === "more" && colored.length) return "fail";
    return { lessIf: { n: m[3] === "more" ? -n : n, cond: { kind: "yourTurn", ...(m[1] === "your turn" ? {} : { not: true as const }) }, ...(colored.length ? { colored } : {}) } };
  }
  // "As long as" reads the same as "if" here (Drag to the Roots): checked as the cost is determined (CR 601.2f).
  // Closing Statement: "~ costs {2} less to cast during your end step": the same, checked as it's cast.
  if ((m = /^~ costs \{(\d+)\} less to cast during your end step$/.exec(text))) return { lessIf: { n: Number(m[1]), cond: { kind: "phase", phase: "end", yours: true } } };
  if ((m = /^~ costs \{(\d+)\} less to cast (?:if|as long as) (.+)$/.exec(text)) || (m = /^If (.+), ~ costs \{(\d+)\} less to cast$/.exec(text))) {
    const [n, condText] = /^~/.test(text) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
    const cond = parseStaticCondition(condText, self);
    return cond ? { lessIf: { n: Number(n), cond } } : "fail";
  }
  // Stormwing Entity: "~ costs {2}{U} less to cast if you've cast an instant or sorcery spell this turn": a colored
  // reduction takes off that colored mana too (CR 601.2f), as Discontinuity's.
  if ((m = /^~ costs ((?:\{\d+\})?(?:\{[WUBRG]\})+) less to cast if (.+)$/.exec(text))) {
    const n = Number(/\{(\d+)\}/.exec(m[1]!)?.[1] ?? 0);
    const colored = [...m[1]!.matchAll(/\{([WUBRG])\}/g)].map((x) => x[1] as Color);
    const cond = parseStaticCondition(m[2]!, self);
    return cond ? { lessIf: { n, cond, colored } } : "fail";
  }
  // "Spells with the chosen name cost {3} more to cast" (Disruptor Flute), "Spells your opponents cast with the chosen name
  // ..." (Anointed Peacekeeper), "... you cast cost {2} less" (Council of the Absolute), "Spells with the chosen name
  // enchanted player casts ..." (Curse of Silence): the name chosen as the permanent entered (CR 201.4).
  if ((m = /^Spells( your opponents cast)? with the chosen name( you cast| enchanted player casts)? cost \{(\d+)\} (less|more) to cast$/.exec(text)) && !(m[1] && m[2])) {
    const who = m[1] ? "opponents" : m[2] === " you cast" ? "you" : m[2] ? "enchanted" : "all";
    return { costMod: { who, filter: { kind: "spell", chosen: "name", text: "spells with the chosen name" }, n: Number(m[3]) * (m[4] === "less" ? -1 : 1), text: line } };
  }
  // "Creature spells you cast of the chosen type cost {1} less to cast" (Herald's Horn), "Creature spells of the chosen
  // type ..." (Urza's Incubator): the type chosen as the permanent entered.
  // "Each spell you cast that's red or green costs {1} less to cast" (Goblin Anarchomancer): red or green spells you cast.
  const thats = /^Each spell you cast that's ([a-z]+(?: or [a-z]+)?) costs (\{\d+\} (?:less|more) to cast)$/.exec(text);
  if (thats) text = `${capital(thats[1]!)} spells you cast cost ${thats[2]}`;
  // "Blue spells and red spells you cast cost {1} less to cast" (Nightscape Familiar): a spell that's both gets {1} less,
  // not {2} (rulings), as "Blue and red spells".
  text = text.replace(/^([A-Z][a-z]+) spells and ([A-Za-z]+) spells(?= )/, "$1 and $2 spells");
  // Irini Sengir: "Green enchantment spells and white enchantment spells cost {2} more to cast": {2} more once for a
  // green and white one, as "Green and white enchantment spells".
  text = text.replace(/^(White|Blue|Black|Red|Green) ([a-z]+) spells and (white|blue|black|red|green) \2 spells(?= )/, "$1 and $3 $2 spells");
  // Semblance Anvil: "Spells you cast that share a card type with the exiled card cost {2} less to cast." Sharing several
  // still takes off {2} (rulings); the exiled card is the one its imprint ability exiled (linked in compile.ts).
  if ((m = /^Spells you cast that share a card type with the exiled card cost \{(\d+)\} less to cast$/.exec(text)))
    return { costMod: { who: "you", filter: { kind: "spell", text: "spells that share a card type with the exiled card" }, n: -Number(m[1]), sharesTypeWithLinked: true, text: line } };
  // "Spells your opponents cast during your turn cost {1} more to cast" (Paladin Class): "During your turn, ...".
  text = text.replace(/^(\S.*? (?:you|your opponents) cast) during your turn (?=costs? \{\d+\} (?:less|more) to cast$)/, "During your turn, $1 ");
  const ofChosen = / of the chosen type costs? \{/.test(text);
  if (ofChosen) text = text.replace(/ of the chosen type(?= costs? \{)/, "");
  // "Spells your opponents cast from graveyards or from exile cost {2} more to cast" (Aven Interrupter), "Spells you cast
  // from your graveyard or from exile cost {2} less to cast" (Doc Aurlock): only your own graveyard.
  const zones = / from (graveyards or from exile|your graveyard or from exile|graveyards|exile)(?= costs? \{)/.exec(text);
  if (zones) text = text.slice(0, zones.index) + text.slice(zones.index + zones[0].length);
  // Fortune Teller's Talent: "Spells you cast from anywhere other than your hand cost {2} less to cast."
  const notHand = !zones ? / from anywhere other than your hand(?= costs? \{)/.exec(text) : null;
  if (notHand) text = text.slice(0, notHand.index) + text.slice(notHand.index + notHand[0].length);
  m = /^(?:(During your turn|During turns other than yours), )?(.+?)( you cast| your opponents cast)?( with (?:mana value|power) \d+ or (?:greater|less)| with toughness greater than their power)?( from your graveyard)? costs? (\{\d+\}) (less|more) to cast$/.exec(text);
  if (!m || !/spells?$/i.test(m[2]!)) return null;
  const words = m[2]!.replace(/ ?spells?$/i, "").replace(/ and /g, " or ").trim();
  // "Spells you cast", "Instant and sorcery spells", "Noncreature spells", "Dragon spells", "Blue spells"
  // "Creature spells you cast with power 4 or greater" (Goreclaw): the spell's power as it's cast (see costModsFor).
  const pw = / with power (\d+) or (greater|less)$/.exec(m[4] ?? "");
  // Doran, Besieged by Time: "with toughness greater than their power", the spell's own (see costModsFor).
  const tough = m[4] === " with toughness greater than their power";
  // "Spells you cast with mana value 5 or greater" (Thryx): the mana value bound with no other words.
  const parsed = words || (m[4] && !pw && !tough) ? parseTargetPhrase(`${words ? `${words} ` : ""}spell${pw || tough ? "" : (m[4] ?? "")}`) : { kind: "spell" as const, text: "spell" };
  if (!parsed || parsed.kind !== "spell" || ((pw || tough) && !parsed.types?.includes("Creature"))) return "fail";
  const filter: TargetSpec = pw ? { ...parsed, power: pw[2] === "greater" ? { min: Number(pw[1]) } : { max: Number(pw[1]) } } : tough ? { ...parsed, toughnessAbovePower: true } : parsed;
  const who = m[3] === " you cast" ? "you" : m[3] === " your opponents cast" ? "opponents" : "all";
  if ((m[5] && who !== "you") || (zones && (m[5] || !m[3])) || (notHand && (m[5] || who !== "you"))) return "fail";
  const n = Number(/\d+/.exec(m[6]!)![0]) * (m[7] === "less" ? -1 : 1);
  return {
    costMod: {
      who,
      filter: { ...filter, ...(ofChosen ? { chosen: "type" as const } : {}), text: `${words ? `${words.toLowerCase()} ` : ""}spells${ofChosen ? " of the chosen type" : ""}` },
      n,
      ...(m[1] ? { turn: m[1] === "During your turn" ? "yours" : "notYours" } : {}),
      ...(m[5] ? { fromGraveyard: true } : {}),
      ...(zones ? { fromZones: zones[1] === "exile" ? ["exile" as const] : zones[1] === "graveyards" ? ["graveyard" as const] : ["graveyard" as const, "exile" as const] } : {}),
      ...(zones?.[1] === "your graveyard or from exile" ? { fromGraveyard: true } : {}),
      ...(notHand ? { notFromHand: true as const } : {}),
      text: line,
    },
  };
}

const CONTROL_COUNT = new RegExp(`^(?:(no|another|an?)|${NUM} or more(?: other)?|${NUM} or fewer) (.+)$`);

/** The condition of an "as long as" static ability (see parseConditionalStatic). */
/**
 * What an "Activate only if ..." needs (CR 602.5b): a static condition, "~ entered this turn", or either of two ("if ~
 * entered this turn or if you control a basic land").
 */
export function parseActivateCondition(text: string): StaticCondition | null {
  const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: "" };
  const either = / or if /.exec(text);
  if (either) {
    const conds = [text.slice(0, either.index), text.slice(either.index + either[0].length)].map(parseActivateCondition);
    return conds.every((c): c is StaticCondition => !!c) ? { kind: "anyOf", conds } : null;
  }
  if (/^~ entered (?:the battlefield )?this turn$/.test(text)) return { kind: "self", is: "enteredThisTurn" };
  // Idol of Oblivion: "Activate only if you created a token this turn."
  if (/^you created a token this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "tokensCreatedThisTurn" } }, min: 1 };
  // Lilypad Village: "Activate only if a Bird, Frog, Otter, or Rat entered the battlefield under your control this turn."
  const enteredAny = /^an? ((?:[A-Z][a-z]+, )+)or ([A-Z][a-z]+) entered the battlefield under your control this turn$/.exec(text);
  if (enteredAny) {
    const types = [...enteredAny[1]!.split(", ").filter(Boolean), enteredAny[2]!];
    return types.every((t) => CREATURE_TYPES.has(t)) ? { kind: "amount", amount: { count: { kind: "enteredThisTurn", anySubtype: types } }, min: 1 } : null;
  }
  return parseStaticCondition(text, self);
}

/**
 * The part of the turn after "only during" (CR 506.8, 602.5b): "your upkeep", "any upkeep step", "an opponent's turn",
 * "combat on your turn before blockers are declared", "the declare attackers step", "the end of combat step".
 */
export function parseDuring(text: string): StaticCondition | null {
  const whose = (w: string | undefined): { turn?: "you" | "opponent" } => (!w ? {} : /your/.test(w) ? { turn: "you" } : { turn: "opponent" });
  let m: RegExpExecArray | null;
  if (text === "your turn") return { kind: "yourTurn" };
  if (text === "an opponent's turn") return { kind: "yourTurn", not: true };
  if (text === "your turn, before attackers are declared") return { kind: "beforeAttackers" };
  if (text === "an opponent's turn, before attackers are declared") return { kind: "during", window: "beforeAttackers", turn: "opponent" };
  if (text === "an opponent's turn after their upkeep step") return { kind: "during", window: "afterUpkeep", turn: "opponent" };
  if ((m = /^combat( on your turn| on an opponent's turn)?( before blockers are declared| after blockers are declared)?$/.exec(text)))
    return { kind: "during", window: !m[2] ? "combat" : /before/.test(m[2]) ? "combatBeforeBlocks" : "combatAfterBlocks", ...whose(m[1]) };
  if ((m = /^(your|an opponent's|any|each) upkeep(?: step)?$/.exec(text))) return { kind: "during", window: "upkeep", ...whose(m[1] === "any" || m[1] === "each" ? undefined : m[1]) };
  if ((m = /^(your|an opponent's) end step$/.exec(text))) return { kind: "during", window: "end", ...whose(m[1]) };
  // "Any player may activate this ability but only during their draw step" (Well of Knowledge): the activator's.
  if (text === "your draw step") return { kind: "during", window: "draw", turn: "you" };
  if ((m = /^(?:the|(your)) declare (attackers|blockers) step( on your turn| on an opponent's turn)?$/.exec(text)))
    return { kind: "during", window: m[2] === "attackers" ? "declareAttackers" : "declareBlockers", ...whose(m[1] ?? m[3]) };
  if (text === "the end of combat step") return { kind: "during", window: "endCombat" };
  return null;
}

/** "Before combat", "before attackers are declared", "after combat" (CR 506.8a-b, d): a point in the turn's first combat. */
function parseTurnPoint(text: string): StaticCondition | null {
  const points: Record<string, TurnPoint> = {
    "before combat": "beforeCombat",
    "before attackers are declared": "beforeAttackers",
    "before blockers are declared": "beforeBlockers",
    "before the combat damage step": "beforeDamage",
    "after combat": "afterCombat",
  };
  const w = points[text];
  return w ? { kind: "during", window: w } : null;
}

/**
 * The clauses after "Activate only" or "Cast ~ only" (CR 602.5b, 601.3), joined by ", only" or "and only": "during
 * your upkeep", "if you control a Swamp", "once each turn", "as a sorcery". Null when one isn't understood.
 */
export function parseOnlyClauses(text: string): { cond?: StaticCondition; once?: true; sorcery?: true } | null {
  const conds: StaticCondition[] = [];
  const out: { cond?: StaticCondition; once?: true; sorcery?: true } = {};
  for (const clause of text.split(/,? and only |, only /)) {
    let c: StaticCondition | null = null;
    if (clause === "once each turn") out.once = true;
    else if (clause === "as a sorcery") out.sorcery = true;
    else if (clause.startsWith("during ") && (c = parseDuring(clause.slice(7)))) conds.push(c);
    else if ((c = parseTurnPoint(clause))) conds.push(c);
    else if (clause === "if you've been attacked this step") conds.push({ kind: "attackedThisStep" });
    else if (clause.startsWith("if ") && (c = parseActivateCondition(clause.slice(3)))) conds.push(c);
    else return null;
  }
  // "If you've been attacked this step" means the declare attackers step it names (CR 508.1).
  if (conds.some((c) => c.kind === "attackedThisStep") && !conds.some((c) => c.kind === "during" && c.window === "declareAttackers")) return null;
  // "During combat and only if defending player controls a snow land" (Arcum's Sleigh), "... no snow lands" (Kjeldoran
  // Guard): the player the source is attacking, or else one of the defending players, the ability's controller's choice
  // (CR 508.5, 508.5a).
  const anyDefending = conds.some((c) => c.kind === "during" && c.window === "combat");
  for (const [i, c] of conds.entries()) if (c.kind === "control" && c.who === "defending") {
    if (!anyDefending) return null;
    conds[i] = { ...c, who: "anyDefending" };
  }
  if (conds.length) out.cond = conds.length === 1 ? conds[0]! : { kind: "allOf", conds };
  return out;
}

/**
 * What follows "can't be the target of": "spells or abilities your opponents control" (Canopy Cover), "black spells or
 * abilities from black sources" (Mercenary Informer), "nongreen spells or abilities from nongreen sources" (Gaea's Revenge),
 * "blue or black spells" (Karplusan Strider), "Aura spells" (Tetsuo Umezawa), "abilities your opponents control" (Shanna).
 */
export function parseUntargetable(t: string): Untargetable | null {
  const COLOR = "(white|blue|black|red|green)";
  const opp = / your opponents control$/.test(t) ? { opponents: true as const } : {};
  let m: RegExpExecArray | null;
  if (/^spells or abilities your opponents control$/.test(t)) return { opponents: true };
  if (/^spells(?: your opponents control)?$/.test(t)) return { spells: true, ...opp };
  if (/^abilities(?: your opponents control)?$/.test(t)) return { abilities: true, ...opp };
  if (/^Aura spells$/.test(t)) return { spells: true, subtype: "Aura" };
  if ((m = new RegExp(`^${COLOR}(?: or ${COLOR})? spells(?: your opponents control)?$`).exec(t))) return { spells: true, colors: [COLOR_WORDS[m[1]!]!, ...(m[2] ? [COLOR_WORDS[m[2]]!] : [])], ...opp };
  if ((m = new RegExp(`^${COLOR} spells or abilities from ${COLOR} sources$`).exec(t)) && m[1] === m[2]) return { colors: [COLOR_WORDS[m[1]!]!] };
  if ((m = new RegExp(`^non${COLOR} spells(?: your opponents control)? or abilities from non${COLOR} sources(?: your opponents control)?$`).exec(t)) && m[1] === m[2]) {
    // "Nongreen spells your opponents control or abilities from nongreen sources your opponents control" (Thrun): both halves.
    const both = / spells your opponents control or /.test(t);
    if (both !== / sources your opponents control$/.test(t)) return null;
    return { notColors: [COLOR_WORDS[m[1]!]!], ...(both ? { opponents: true as const } : {}) };
  }
  return null;
}

/** What a player has the most of: "life", "cards in hand", or "Wizards" / "creatures" they control. */
export function parseMostStat(what: string): MostStat | null {
  if (what === "life") return { what: "life" };
  if (what === "cards in hand") return { what: "hand" };
  const filter = /^(?:[A-Z][a-z]+s|creatures|lands|artifacts|enchantments)$/.test(what) ? pickFilter(what) : null;
  return filter ? { what: "control", filter } : null;
}

export function parseStaticCondition(text: string, st: StaticAbility): StaticCondition | null {
  let m: RegExpExecArray | null;
  // Hazoret, Godseeker: "~ can't attack or block unless you have max speed" (CR 702.179e: speed 4).
  if (text === "you have max speed") return { kind: "maxSpeed" };
  // Heroic Return: "~ costs {2} less to cast if a creature is attacking you": attacking you, not a planeswalker you control
  // (CR 506.3).
  if (text === "a creature is attacking you") return { kind: "amount", amount: { count: { kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "attackingYou", text: "creatures attacking you" } } }, min: 1 };
  // Thoughtbound Primoc: "if a player controls more Wizards than each other player", Ghazbán Ogre: "has more life",
  // Sokenzan Renegade: "has more cards in hand": one player with the most, none tied (rulings).
  if ((m = /^a player (?:controls more ([A-Za-z]+)|has more (life|cards in hand)) than each other player$/.exec(text))) {
    const stat = parseMostStat(m[1] ?? m[2]!);
    return stat ? { kind: "uniqueMost", stat } : null;
  }
  // Blood Baron of Vizkopa: "as long as you have 30 or more life and an opponent has 10 or less life"; Sardian
  // Cliffstomper: "as long as it's your turn and you control four or more Mountains": both at once.
  if ((m = /^(it's your turn|you have \w+ or more life) and (.+)$/.exec(text))) {
    const [a, b] = [parseStaticCondition(m[1]!, st), parseStaticCondition(m[2]!, st)];
    return a && b ? { kind: "allOf", conds: [a, b] } : null;
  }
  // Inventive Wingsmith: "if you haven't cast a spell from your hand this turn and ~ doesn't have a flying counter on it".
  // Emergent Haunting: "if you haven't cast a spell from your hand this turn and ~ isn't a creature".
  // Creakwood Safewright: "if there is an Elf card in your graveyard and ~ has a -1/-1 counter on it": both at once.
  if ((m = /^(you haven't cast a spell from your hand this turn) and (~ doesn't have an? .+? counter on it|~ isn't a creature)$/.exec(text)) || (m = /^(there is an? \w+ card in your graveyard) and (~ has an? \S+ counter on it)$/.exec(text))) {
    const [a, b] = [parseStaticCondition(m[1]!, st), parseStaticCondition(m[2]!, st)];
    return a && b ? { kind: "allOf", conds: [a, b] } : null;
  }
  // The Djinns of Mirage: "as long as white is the most common color among all permanents or is tied for most common".
  if ((m = /^(white|blue|black|red|green) is the most common color among all permanents or is tied for most common$/.exec(text))) return { kind: "mostCommonColor", color: COLOR_WORDS[m[1]!]! };
  if ((m = new RegExp(`^(?:there are |you have )?${NUM} or more cards (?:are )?in your graveyard$`).exec(text))) return { kind: "graveyardAtLeast", n: num(m[1]!) };
  // Altar of the Pantheon: "If you control a God, a Demigod, or a legendary enchantment": any one of them.
  if ((m = /^you control (an? [^,]+), (an? [^,]+), or (an? [^,]+)$/.exec(text))) {
    const conds = [m[1]!, m[2]!, m[3]!].map((x) => parseStaticCondition(`you control ${x}`, st));
    return conds.every((c) => c?.kind === "control") ? { kind: "anyOf", conds: conds as StaticCondition[] } : null;
  }
  // Mentor's Guidance: "if you control a planeswalker, Cleric, Druid, Shaman, Warlock, or Wizard": one permanent of any of
  // those (rulings), a card type or creature types after one article.
  if ((m = /^you control an? ((?:[A-Za-z]+, ){2,}or [A-Za-z]+)$/.exec(text))) {
    const conds = m[1]!.replace(/, or /, ", ").split(", ").map((x) => parseStaticCondition(`you control a ${x}`, st));
    return conds.every((c) => c?.kind === "control") ? { kind: "anyOf", conds: conds as StaticCondition[] } : null;
  }
  // Of One Mind: "if you control a Human creature and a non-Human creature": two different creatures, since none can be
  // both.
  if ((m = /^you control an? ([A-Z][a-z]+) creature and an? non-([A-Z][a-z]+) creature$/.exec(text)) && m[1] === m[2]) {
    const a = parseStaticCondition(`you control a ${m[1]} creature`, st);
    const b = parseStaticCondition(`you control a non-${m[1]} creature`, st);
    return a && b ? { kind: "allOf", conds: [a, b] } : null;
  }
  // Cavernous Maw: "Activate only if the number of other Caves you control plus the number of Cave cards in your graveyard
  // is three or greater": counted as it's activated.
  if ((m = new RegExp(`^(the number of .+ plus the number of .+) is ${NUM} or greater$`).exec(text))) {
    const amount = parseCount(m[1]!, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: num(m[2]!) } : null;
  }
  // ED-E, Lonesome Eyebot: "if the number of attacking creatures is greater than the number of quest counters on ~".
  if ((m = /^the number of (.+) is greater than the number of (.+)$/.exec(text))) {
    const a = parseCount(`the number of ${m[1]}`, null);
    const b = parseCount(`the number of ${m[2]}`, null);
    return a && typeof a === "object" && b && typeof b === "object" ? { kind: "amount", amount: a, moreThan: b } : null;
  }
  // "As long as there are fewer than eight cards in your graveyard, ~ isn't a creature" (The Warring Triad).
  if ((m = new RegExp(`^there are fewer than ${NUM} cards in your graveyard$`).exec(text))) {
    const amount = parseCount("the number of cards in your graveyard", null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, max: num(m[1]!) - 1 } : null;
  }
  // Shadowborn Demon: "if there are fewer than six creature cards in your graveyard".
  if ((m = new RegExp(`^there are fewer than ${NUM} (creature|land|artifact|enchantment|instant|sorcery) cards in your graveyard$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]} cards in your graveyard`, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, max: num(m[1]!) - 1 } : null;
  }
  if ((m = new RegExp(`^there are ${NUM} or more card types among cards in your graveyard$`).exec(text))) return { kind: "graveyardTypes", n: num(m[1]!) };
  // Vampire Nocturnus: "the top card of your library is black"; Mul Daya Channelers: "... is a creature card".
  if ((m = /^the top card of your library is (white|blue|black|red|green)$/.exec(text))) return { kind: "topCardIs", filter: { kind: "object", colors: [COLOR_WORDS[m[1]!]!], text: `${m[1]} card` } };
  if ((m = /^the top card of your library is an? (artifact|creature|enchantment|instant|land|planeswalker|sorcery) card$/.exec(text))) return { kind: "topCardIs", filter: { kind: "object", types: [capital(m[1]!)], text: `${m[1]} card` } };
  // Tainted Indulgence: "there are five or more mana values among cards in your graveyard".
  // Path to the Festival: "if there are three or more basic land types among lands you control" (domain's count).
  if ((m = new RegExp(`^there are ${NUM} or more basic land types among lands you control$`).exec(text))) return { kind: "amount", amount: { count: { kind: "basicLandTypes" } }, min: num(m[1]!) };
  if ((m = new RegExp(`^there are ${NUM} or more mana values among cards in your graveyard$`).exec(text))) return { kind: "amount", amount: { count: { kind: "graveyardManaValues", who: { ref: "you" } } }, min: num(m[1]!) };
  // "If there are four or more permanent types among cards in your graveyard" (Matzalantli): artifact, battle, creature,
  // enchantment, land and planeswalker (CR 110.4a).
  if ((m = new RegExp(`^there are ${NUM} or more permanent types among cards in your graveyard$`).exec(text))) return { kind: "graveyardTypes", n: num(m[1]!), permanent: true };
  if ((m = new RegExp(`^there are ${NUM} or more permanent cards in your graveyard$`).exec(text))) return { kind: "graveyardPermanents", n: num(m[1]!) };
  // Hundred-Battle Veteran: "there are three or more different kinds of counters among creatures you control", counted with
  // the creatures as the layers have them so far.
  if ((m = new RegExp(`^there are ${NUM} or more different kinds of counters among creatures you control$`).exec(text)))
    return { kind: "amount", amount: { count: { kind: "permanents", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" }, counterKinds: true } }, min: num(m[1]!) };
  // "If there are four or more land cards in your graveyard" (Titania, Voice of Gaea).
  // "If you have four or more creature cards in your graveyard" (Oversold Cemetery): the same.
  // Spell mastery: "If there are two or more instant and/or sorcery cards in your graveyard" (each card counted once).
  // Mortal Combat: "if twenty or more creature cards are in your graveyard", the same.
  if ((m = new RegExp(`^${NUM} or more (\\w+) cards are in your graveyard$`).exec(text))) return parseStaticCondition(`there are ${m[1]} or more ${m[2]} cards in your graveyard`, st);
  // Lorehold Archivist: "three or more artifact and/or creature cards", the same.
  if ((m = new RegExp(`^(?:there are|you have) ${NUM} or more (\\w+|\\w+ and/or \\w+) cards in your graveyard$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]!.replace(" and/or ", " and ")} cards in your graveyard`, null);
    return amount ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  // Murasa Behemoth: "as long as there is a land card in your graveyard"; Windwright Mage: "as long as an artifact card is
  // in your graveyard"; Vengeful Firebrand: "... a Warrior card ...": one or more.
  if ((m = /^(?:there(?:'s| is) an? (\w+) card in your graveyard|an? (\w+) card is in your graveyard)$/.exec(text))) {
    const amount = parseCount(`the number of ${m[1] ?? m[2]} cards in your graveyard`, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: 1 } : null;
  }
  // Bloodfire Enforcers: "as long as an instant card and a sorcery card are in your graveyard": one of each.
  if ((m = /^an? (\w+) card and an? (\w+) card are in your graveyard$/.exec(text)) && m[1] !== m[2]) {
    const conds = [m[1]!, m[2]!].map((x) => parseStaticCondition(`an ${x} card is in your graveyard`, st));
    return conds.every(Boolean) ? { kind: "allOf", conds: conds as StaticCondition[] } : null;
  }
  // The Desert-matters cards of Hour of Devastation: "if you control a Desert or there is a Desert card in your graveyard".
  if (/^you control a Desert or there is a Desert card in your graveyard$/.test(text)) {
    const a = parseStaticCondition("you control a Desert", st);
    const b = parseStaticCondition("there is a Desert card in your graveyard", st);
    return a && b ? { kind: "anyOf", conds: [a, b] } : null;
  }
  // Swimmer in Nightmares: "as long as there are ten or more cards in a single graveyard": any player's.
  if ((m = new RegExp(`^there are ${NUM} or more cards in a single graveyard$`).exec(text))) return parseStaticCondition(`a graveyard has ${m[1]} or more cards in it`, st);
  // Avatar of Woe: "If there are ten or more creature cards total in all graveyards": every player's together.
  if ((m = new RegExp(`^there are ${NUM} or more (\\w+) cards total in all graveyards$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]} cards in all graveyards`, null);
    return amount ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  // Tomb Tyrant: "if there are at least three Zombie creature cards in your graveyard": the same.
  if ((m = new RegExp(`^there are at least ${NUM} ([A-Z][a-z]+ creature|\\w+) cards in your graveyard$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]} cards in your graveyard`, null);
    return amount ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  // "Your devotion to black is less than five" (Theros gods, CR 700.5), "... is five or greater".
  if ((m = new RegExp(`^(your devotion to .+?) is (?:less than ${NUM}|${NUM} or greater)$`).exec(text))) {
    const amount = parseCount(m[1]!, null);
    if (!amount) return null;
    return m[2] ? { kind: "amount", amount, max: num(m[2]) - 1 } : { kind: "amount", amount, min: num(m[3]!) };
  }
  // "As long as you have six or more unspent mana" (Ozai, the Phoenix King): in your mana pool (CR 106.4).
  if ((m = new RegExp(`^you have ${NUM} or more unspent mana$`).exec(text))) return { kind: "amount", amount: { count: { kind: "unspentMana" } }, min: num(m[1]!) };
  // Excess damage (CR 120.10): "if that creature was dealt excess damage this turn" (the trigger's subject), Rith's "if a
  // creature or planeswalker an opponent controlled was dealt excess damage this turn".
  if (/^that creature was dealt excess damage this turn$/.test(text)) return { kind: "subjectDealtExcess" };
  // Marcus, Mutant Mayor: "if that creature has a +1/+1 counter on it": the trigger's subject as it resolves, or as it
  // last existed (CR 608.2h).
  if ((m = new RegExp(`^that creature has an? ${COUNTER} counter on it$`).exec(text))) return { kind: "subjectCounter", counter: counterKind(m[1]!) };
  // Hadana's Climb: "that creature has three or more +1/+1 counters on it".
  if ((m = new RegExp(`^that creature has ${NUM} or more ${COUNTER} counters on it$`).exec(text))) return { kind: "subjectCounter", counter: counterKind(m[2]!), min: num(m[1]!) };
  if ((m = /^an? (creature|planeswalker)(?: or (planeswalker))? an opponent controlled was dealt excess damage this turn$/.exec(text)))
    return { kind: "opponentsDealtExcess", types: [m[1], m[2]].filter(Boolean).map((x) => x!.charAt(0).toUpperCase() + x!.slice(1)) };
  // Liberator, Urza's Battlethopter: "if the amount of mana spent to cast that spell is greater than ~'s power", as
  // increment does it (CR 702.191a), the spell's mana spent being the event's amount.
  if (/^the amount of mana spent to cast that spell is greater than ~'s power$/.test(text)) return { kind: "increment", powerOnly: true };
  if (/^it's your turn$/.test(text)) return { kind: "yourTurn" };
  // "If there are cards exiled with ~" (Valakut Exploration): the cards this object's linked exile took (CR 607.2a).
  if (/^(?:there are cards|a card is) exiled with (?:~|it)$/.test(text)) return { kind: "amount", amount: { count: { kind: "linkedExiled" } }, min: 1 };
  // Veteran Survivor: "As long as there are three or more cards exiled with ~": the same, at least that many.
  if ((m = new RegExp(`^there are ${NUM} or more cards exiled with ~$`).exec(text))) return { kind: "amount", amount: { count: { kind: "linkedExiled" } }, min: num(m[1]!) };
  // "Whenever a player casts a spell, if it's not their turn" (Scytheclaw Raptor): the caster's. "Whenever a player taps
  // a land for mana, if it's not that player's turn" (Price of Glory): the player who tapped it.
  if (/^it(?: isn't that player's|'s not their| isn't their|'s not that player's) turn$/.test(text)) return { kind: "eventPlayersTurn", not: true };
  if (/^it's not your turn$/.test(text)) return { kind: "yourTurn", not: true };
  if (/^it's an extra turn$/.test(text)) return { kind: "extraTurn" };
  // "If four or more creatures are attacking", "if exactly one creature is attacking", "if a white creature is attacking"
  // (the traps): attacking creatures, anyone's.
  if ((m = new RegExp(`^(?:${NUM} or more|(exactly one)|an?) (.+?) (?:is|are) attacking$`).exec(text))) {
    const spec = parseTargetPhrase(`attacking ${m[3]!.replace(/\bcreatures\b/, "creature")}`);
    if (spec?.kind !== "object" || spec.controller) return null;
    const n = m[2] ? 1 : m[1] ? num(m[1]) : 1;
    return { kind: "onBattlefield", filter: { ...spec, text: `attacking ${m[3]}` }, min: n, ...(m[2] ? { max: 1 } : {}) };
  }
  // Dreadlight Monstrosity: "Activate only if you own a card in exile."
  if (text === "you own a card in exile") return { kind: "amount", amount: { count: { kind: "cardsInExile", who: { ref: "you" } } }, min: 1 };
  // Howling Galefang: "as long as you own a card in exile that has an Adventure": any such card, however it got there
  // (rulings); a face-down card has no characteristics.
  if (text === "you own a card in exile that has an Adventure") return { kind: "amount", amount: { count: { kind: "cardsInExile", who: { ref: "you" }, filter: { kind: "card", hasAdventure: true, text: "card that has an Adventure" } } }, min: 1 };
  if ((m = new RegExp(`^there are fewer than ${NUM} cards in exile$`).exec(text))) return { kind: "amount", amount: { count: { kind: "cardsInExile" } }, max: num(m[1]!) - 1 };
  // "If there are thirteen or more creatures on the battlefield" (Blasphemous Edict).
  if ((m = new RegExp(`^there are ${NUM} or more (.+) on the battlefield$`).exec(text))) {
    const g = parseGroup(`all ${m[2]}`);
    return g ? { kind: "onBattlefield", filter: g.filter, min: num(m[1]!), ...(g.other ? { other: true as const } : {}) } : null;
  }
  // Tenacious Hunter: "as long as a creature has a -1/-1 counter on it": any player's creature (rulings).
  if ((m = /^a creature has an? ([+-]1\/[+-]1|[a-z]+) counter on it$/.exec(text))) {
    const g = parseGroup(`all creatures with ${m[1]} counters on them`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, min: 1 } : null;
  }
  // Spirit Mirror: "if there are no Reflection tokens on the battlefield": anyone's.
  if ((m = /^there are no (.+) on the battlefield$/.exec(text))) {
    const g = parseGroup(`all ${m[1]}`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, min: 0, max: 0 } : null;
  }
  // Common Cause: "Nonartifact creatures get +2/+2 as long as they all share a color".
  if (text === "they all share a color" && st.affects.kind === "filter" && st.affects.spec && !st.affects.controller && !st.affects.other) return { kind: "allShareColor", filter: st.affects.spec };
  // Tidal Influence: "Cast ~ only if no permanents named ~ are on the battlefield": anyone's, with the card's name (CR 201.5).
  if (text === "no permanents named ~ are on the battlefield") {
    const amount = parseCount("the number of permanents on the battlefield named ~", null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, max: 0 } : null;
  }
  // Stensia Uprising: "if you control exactly thirteen permanents": that many and no more.
  if ((m = new RegExp(`^you control exactly ${NUM} (permanents|creatures|lands|artifacts)$`).exec(text)) && num(m[1]!) > 1) {
    const at = parseStaticCondition(`you control ${m[1]} or more ${m[2]}`, st);
    return at?.kind === "control" && at.min === num(m[1]!) && at.max === undefined ? { ...at, max: at.min } : null;
  }
  // Biovisionary: "if you control four or more creatures named ~": with the source's name (CR 201.5), ~ itself among them.
  // Phoenix Fleet Airship: "if you control eight or more permanents named ~".
  if ((m = new RegExp(`^you control ${NUM} or more (creatures|permanents) named ~$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]} you control named ~`, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  if ((m = new RegExp(`^you have ${NUM} or more cards in (?:your )?hand$`).exec(text))) return { kind: "handAtLeast", n: num(m[1]!) };
  // Imaginary Pet: "if you have a card in hand": one or more.
  if (text === "you have a card in hand") return { kind: "handAtLeast", n: 1 };
  if ((m = new RegExp(`^you have fewer than ${NUM} cards in (?:your )?hand$`).exec(text))) return { kind: "handAtLeast", n: num(m[1]!), fewer: true };
  // "One or fewer cards in hand" (Djeru and Hazoret): fewer than two.
  if ((m = new RegExp(`^you have ${NUM} or fewer cards in (?:your )?hand$`).exec(text))) return { kind: "handAtLeast", n: num(m[1]!) + 1, fewer: true };
  if ((m = new RegExp(`^you have exactly ${NUM} cards in (?:your )?hand$`).exec(text))) return { kind: "handAtLeast", n: num(m[1]!), exactly: true };
  // The Biblioplex: "Activate only if you have exactly zero or seven cards in hand": either.
  if ((m = new RegExp(`^you have exactly (zero|${NUM.slice(1, -1)}) or ${NUM} cards in (?:your )?hand$`).exec(text))) return { kind: "anyOf", conds: [{ kind: "handAtLeast", n: m[1] === "zero" ? 0 : num(m[1]!), exactly: true }, { kind: "handAtLeast", n: num(m[2]!), exactly: true }] };
  // "If you control eight or more artifacts with the same name as one another" (Mechanized Production): all of them
  // artifacts (rulings).
  if ((m = new RegExp(`^you control ${NUM} or more (artifacts|creatures|permanents) with the same name as one another$`).exec(text)))
    return { kind: "sameNamed", types: m[2] === "permanents" ? [] : [capital(m[2]!.slice(0, -1))], n: num(m[1]!) };
  // Chrome Replicator: "if you control two or more nonland, nontoken permanents with the same name as one another".
  if ((m = new RegExp(`^you control ${NUM} or more nonland,? nontoken permanents with the same name as one another$`).exec(text)))
    return { kind: "sameNamed", types: [], notTypes: ["Land"], nontoken: true, n: num(m[1]!) };
  if (/^each player has no cards in hand$/.test(text)) return { kind: "handsEmpty" };
  if (/^you played a land this turn$/.test(text)) return { kind: "playedLandThisTurn" };
  if ((m = new RegExp(`^a player has ${NUM} or fewer cards in hand$`).exec(text))) return { kind: "someHandAtMost", n: num(m[1]!) };
  if (/^a player has no cards in hand$/.test(text)) return { kind: "someHandAtMost", n: 0 };
  if (/^an opponent has no cards in hand$/.test(text)) return { kind: "someHandAtMost", n: 0, opponent: true };
  if (/^you have no cards in hand$/.test(text)) return { kind: "noneInHand", filter: { kind: "card", text: "card" } };
  // The Cases' "To solve" conditions (CR 719.3a), about this turn.
  if ((m = new RegExp(`^${NUM} or more (creature|artifact|enchantment|land|instant|sorcery) cards were put into graveyards from anywhere this turn$`).exec(text)))
    return { kind: "cardsToGraveyard", n: num(m[1]!), types: [capital(m[2]!)] };
  if ((m = new RegExp(`^${NUM} or more sources you controlled dealt damage this turn$`).exec(text))) return { kind: "sourcesDealtDamage", n: num(m[1]!) };
  if ((m = new RegExp(`^(white|blue|black|red|green) sources you controlled dealt ${NUM} or more noncombat damage this turn$`).exec(text))) return { kind: "noncombatByColor", color: COLOR_WORDS[m[1]!]!, n: num(m[2]!) };
  if ((m = /^a source you controlled dealt (\d+) or more damage this turn$/.exec(text))) return { kind: "sourceDealtAtLeast", n: Number(m[1]) };
  // The card in the graveyard needn't still be there (rulings on Cloakwood Hermit).
  if ((m = /^an? (creature|artifact|enchantment|land|instant|sorcery) card was put into your graveyard(?: from anywhere)? this turn$/.exec(text))) return { kind: "cardToYourGraveyard", types: [capital(m[1]!)] };
  // Sigardian Paladin: "as long as you've put one or more +1/+1 counters on a creature this turn", a creature as the
  // counter was put on it (rulings); Beast, Erudite Aerialist: on ~ itself; Fairgrounds Trumpeter: "if a +1/+1 counter
  // was put on a permanent under your control this turn", by anyone (rulings).
  if (/^you've put one or more \+1\/\+1 counters on a creature this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "plusOnesPutThisTurn", byYou: true, creature: true } }, min: 1 };
  if (/^you've put one or more \+1\/\+1 counters on ~ this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "plusOnesPutThisTurn", byYou: true, self: true } }, min: 1 };
  if (/^a \+1\/\+1 counter was put on a permanent under your control this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "plusOnesPutThisTurn", onYours: true } }, min: 1 };
  // "If you've cast a noncreature spell this turn" (Human Torch): one or more such spells cast (copies aren't cast, CR 707.10).
  // "As long as you've cast a spell this turn" (Fortune Teller's Talent): any spell.
  if (/^you've cast a spell this turn$/.test(text)) return { kind: "castCount", n: 1, filter: { kind: "card", text: "spell" } };
  // Captain Mar-Vell, Space-Born: "As long as an opponent has cast a spell this turn".
  if (/^an opponent has cast a spell this turn$/.test(text)) return { kind: "castCount", n: 1, filter: { kind: "card", text: "spell" }, byOpponent: true };
  // Rhino, Barreling Brute: "if you've cast a spell with mana value 4 or greater this turn": its mana value on the stack,
  // X included (CR 202.3e).
  if ((m = /^you've cast a spell with mana value (\d+) or greater this turn$/.exec(text))) return { kind: "castCount", n: 1, filter: { kind: "card", text: "spell" }, mvAtLeast: Number(m[1]) };
  // Nightpack Ambusher: "if you didn't cast a spell this turn".
  // Stoic Sphinx: "~ has hexproof as long as you haven't cast a spell this turn" likewise, in a static ability (an
  // effect's "If you haven't cast a spell this turn, you may cast that card" is Conduit of Worlds' own instruction).
  if (/^you didn't cast a spell this turn$/.test(text) || (/^you haven't cast a spell this turn$/.test(text) && st.mods.length > 0)) return { kind: "castCount", n: 1, filter: { kind: "card", text: "spell" }, not: true };
  // Prairie Dog, Wrangler of the Damned: "if you haven't cast a spell from your hand this turn".
  if (/^you haven't cast a spell from your hand this turn$/.test(text)) return { kind: "castCount", n: 1, filter: { kind: "card", text: "spell" }, not: true, fromHand: true };
  // Fae Offering: "if you've cast both a creature spell and a noncreature spell this turn": one of each.
  if ((m = /^you've cast both an? ([a-z]+) spell and an? ([a-z]+) spell this turn$/.exec(text))) {
    const a = parseSearchFilter(`${m[1]!} card`);
    const b = parseSearchFilter(`${m[2]!} card`);
    return a && b ? { kind: "allOf", conds: [{ kind: "castCount", n: 1, filter: a }, { kind: "castCount", n: 1, filter: b }] } : null;
  }
  // Hall of Oracles: "if you've cast an instant or sorcery spell this turn": either kind.
  if ((m = /^you've cast an? ((?!other\b|another\b)[a-z]+(?: or [a-z]+)?) spell this turn$/.exec(text))) {
    const filter = parseSearchFilter(`${m[1]!} card`);
    return filter ? { kind: "castCount", n: 1, filter } : null;
  }
  if (text === "a card left your graveyard this turn") return { kind: "cardLeftYourGraveyard" };
  if ((m = new RegExp(`^${NUM} or more cards left your graveyard this turn$`).exec(text))) return { kind: "cardLeftYourGraveyard", n: num(m[1]!) };
  // Slick Sequence: "If you've cast another spell this turn, draw a card": checked as it resolves (rulings).
  if (text === "you've cast another spell this turn") return { kind: "castAnother", resolving: true };
  // Soul Reap: "if you've cast another black spell this turn": as it resolves, other than itself (rulings).
  if ((m = /^you've cast another (white|blue|black|red|green) spell this turn$/.exec(text))) return { kind: "castAnother", resolving: true, color: COLOR_WORDS[m[1]!]! };
  // Stella Lee, Wild Card: "if you've cast three or more spells this turn": of any kind.
  if ((m = new RegExp(`^you've cast ${NUM} or more spells this turn$`).exec(text))) return { kind: "castCount", n: num(m[1]!), filter: { kind: "card", text: "spell" } };
  if ((m = new RegExp(`^you've cast ${NUM} or more (.+) spells this turn$`).exec(text))) {
    const filter = parseSearchFilter(`${m[2]!.replace(/ and\/or /g, " or ").replace(/ and /g, " or ")} card`);
    return filter ? { kind: "castCount", n: num(m[1]!), filter } : null;
  }
  if ((m = new RegExp(`^there are ${NUM} colors among permanents you control$`).exec(text))) return { kind: "colorsAmong", n: num(m[1]!) };
  // "If there are thirty or more counters among artifacts and creatures you control" (Lux Artillery): every kind, added up.
  // Tom Bombadil: "as long as there are four or more lore counters among Sagas you control": that kind only.
  if ((m = new RegExp(`^there are ${NUM} or more (?:${COUNTER} )?counters among (.+ you control)$`).exec(text))) {
    const amount = parseCount(`${m[2] ? `${m[2]} ` : ""}counters among ${m[3]}`, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  // "If there are two or more ki counters on ~" (the Kamigawa flip cards).
  if ((m = new RegExp(`^there are ${NUM} or more ${COUNTER} counters on ~$`).exec(text))) return { kind: "selfCounters", counter: counterKind(m[2]!), min: num(m[1]!) };
  // Homarid, Tidal Influence: "As long as there is exactly one tide counter on ~", "there are exactly three tide counters".
  if ((m = new RegExp(`^there (is|are) exactly ${NUM} ${COUNTER} counters? on ~$`).exec(text)) && (m[1] === "is") === (num(m[2]!) === 1) && (num(m[2]!) === 1) === !/counters on/.test(text))
    return { kind: "selfCounters", counter: counterKind(m[3]!), min: num(m[2]!), max: num(m[2]!) };
  if ((m = new RegExp(`^you've gained ${NUM} or more life this turn$`).exec(text))) return { kind: "lifeGainedThisTurn", n: num(m[1]!) };
  // The werewolves of Innistrad (rulings: the whole previous turn; "a player" is a single player).
  if (/^no spells were cast last turn$/.test(text)) return { kind: "castLastTurn", none: true };
  if (/^an opponent lost life last turn$/.test(text)) return { kind: "opponentLostLifeLastTurn" };
  if (/^you lost life last turn$/.test(text)) return { kind: "lostLifeLastTurn" };
  if ((m = new RegExp(`^a player cast ${NUM} or more spells last turn$`).exec(text))) return { kind: "castLastTurn", onePlayer: num(m[1]!) };
  if (/^you(?:'ve)? gained life this turn$/.test(text)) return { kind: "lifeGainedThisTurn", n: 1 };
  // "If you didn't lose life this turn" (Luminarch Ascension), "if you lost life this turn".
  // "As long as you've lost life this turn" (Essence Channeler).
  if ((m = /^you(?: (didn't lose)| lost|'ve lost) life this turn$/.exec(text))) return { kind: "amount", amount: { count: { kind: "lifeLostThisTurn", who: { ref: "you" } } }, ...(m[1] ? { max: 0 } : { min: 1 }) };
  // "If you gained and lost life this turn" (Lunar Convocation): both, whatever the net change (rulings).
  if (/^you gained and lost life this turn$/.test(text)) return { kind: "allOf", conds: [{ kind: "lifeGainedThisTurn", n: 1 }, { kind: "amount", amount: { count: { kind: "lifeLostThisTurn", who: { ref: "you" } } }, min: 1 }] };
  // "If you gained or lost life this turn" (Starlit Soothsayer): either one.
  if (/^you gained or lost life this turn$/.test(text)) return { kind: "anyOf", conds: [{ kind: "lifeGainedThisTurn", n: 1 }, { kind: "amount", amount: { count: { kind: "lifeLostThisTurn", who: { ref: "you" } } }, min: 1 }] };
  // "If you created a token this turn" (Bennie Bracks, Zoologist).
  if (/^you created a token this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "tokensCreatedThisTurn" } }, min: 1 };
  // "If you sacrificed a Food this turn" (Elanor Gardner).
  // "As long as you've sacrificed a nontoken permanent this turn" (Evendo Brushrazer).
  if ((m = /^you(?:'ve)? sacrificed an? (nontoken )?(Food|Clue|Treasure|Blood|artifact|creature|enchantment|land|permanent) this turn$/.exec(text)))
    return { kind: "amount", amount: { count: { kind: "sacrificedThisTurn", ...(/^[A-Z]/.test(m[2]!) ? { subtype: m[2]! } : m[2] === "permanent" ? {} : { type: capital(m[2]!) }), ...(m[1] ? { nontoken: true as const } : {}) } }, min: 1 };
  // "If you sacrificed three or more Clues this turn" (Havengul Laboratory, Briarbridge Patrol).
  if ((m = /^you(?:'ve)? sacrificed (two|three|four|five) or more (Foods|Clues|Treasures|artifacts|creatures|permanents) this turn$/.exec(text))) {
    const what = m[2]!.slice(0, -1);
    return { kind: "amount", amount: { count: { kind: "sacrificedThisTurn", ...(/^[A-Z]/.test(what) ? { subtype: what } : what === "permanent" ? {} : { type: capital(what) }) } }, min: ["two", "three", "four", "five"].indexOf(m[1]!) + 2 };
  }
  // "If you gained 3 or more life this turn" (The Gaffer, Resplendent Angel).
  if ((m = /^you(?:'ve)? gained (\d+) or more life this turn$/.exec(text))) return { kind: "lifeGainedThisTurn", n: Number(m[1]) };
  // Betor, Kin to All: "creatures you control have total toughness 10 or greater".
  if ((m = /^creatures you control have total (power|toughness) (\d+) or greater$/.exec(text))) return { kind: "totalPower", n: Number(m[2]), ...(m[1] === "toughness" ? { toughness: true as const } : {}) };
  if ((m = new RegExp(`^a library has ${NUM} or fewer cards in it$`).exec(text))) return { kind: "libraryAtMost", n: num(m[1]!) };
  if (/^your library has no cards in it$/.test(text)) return { kind: "libraryAtMost", n: 0, yours: true };
  if (/^you're the monarch$/.test(text)) return { kind: "monarch" };
  if (/^you're not the monarch$/.test(text)) return { kind: "monarch", not: true };
  // Knights of the Black Rose: "if you were the monarch as the turn began".
  if (/^you were the monarch as the turn began$/.test(text)) return { kind: "monarch", asTurnBegan: true };
  if (/^there is no monarch$/.test(text)) return { kind: "monarch", none: true };
  if (/^that player is the monarch$/.test(text)) return { kind: "monarch", eventPlayer: true };
  if (/^that player attacked you during their last turn$/.test(text)) return { kind: "eventPlayerAttackedYou" };
  // "If an opponent is the monarch" (Queen Marchesa, CR 725).
  if (/^an opponent is the monarch$/.test(text)) return { kind: "monarch", opponent: true };
  if (/^you have the initiative$/.test(text)) return { kind: "initiative" }; // CR 726.1
  if (/^you've completed a dungeon$/.test(text)) return { kind: "completedDungeon" }; // CR 309.7
  if ((m = /^you (have|haven't) completed (Lost Mine of Phandelver|Dungeon of the Mad Mage|Tomb of Annihilation|Undercity)$/.exec(text)))
    return { kind: "completedDungeon", name: m[2]!, ...(m[1] === "haven't" ? { not: true as const } : {}) };
  if (/^you have a full party$/.test(text)) return { kind: "fullParty" }; // CR 700.8a
  // CR 903.3: whoever's commander it is (rulings on Fierce Guardianship).
  if (/^you control a commander$/.test(text)) return { kind: "controlCommander" };
  if (/^you control your commander$/.test(text)) return { kind: "controlCommander", own: true };
  if (/^you control a commander that's a creature or planeswalker$/.test(text)) return { kind: "controlCommander", types: ["Creature", "Planeswalker"] };
  if ((m = /^you (don't )?control a Ring-bearer$/.exec(text))) return { kind: "ringBearer", ...(m[1] ? { not: true as const } : {}) };
  if (/^~ is your Ring-bearer$/.test(text)) return { kind: "ringBearer", self: true };
  // "If the Ring has tempted you two or more times this game" (CR 701.54c); Frodo, Adventurous Hobbit: "if ~ is your
  // Ring-bearer and the Ring has tempted you two or more times this game", both.
  if ((m = new RegExp(`^the Ring has tempted you ${NUM} or more times this game$`).exec(text))) return { kind: "ringTempted", n: num(m[1]!) };
  if ((m = new RegExp(`^~ is your Ring-bearer and the Ring has tempted you ${NUM} or more times this game$`).exec(text))) return { kind: "allOf", conds: [{ kind: "ringBearer", self: true }, { kind: "ringTempted", n: num(m[1]!) }] };
  if (/^no opponent has more life than that player$/.test(text)) return { kind: "defenderMostLife" };
  if ((m = /^(?:~|it)(?:'s| is) (not )?paired with (another creature|a creature with soulbond)$/.exec(text)) && st.affects.kind === "self")
    return { kind: "paired", ...(m[2] === "a creature with soulbond" ? { withKeyword: "Soulbond" } : {}), ...(m[1] ? { not: true as const } : {}) };
  // "If it's night" (Olivia's Midnight Ambush, Moonrager's Slash): the game's day/night designation (CR 731.1); neither
  // before it's first day.
  if ((m = /^it's (day|night)$/.exec(text))) return { kind: "dayNight", v: m[1] as "day" | "night" };
  if ((m = /^you (have|don't have) the city's blessing$/.exec(text))) return { kind: "citysBlessing", ...(m[1] === "don't have" ? { not: true as const } : {}) }; // CR 702.131c
  if ((m = /^you (have|don't have) an enduring story$/.exec(text))) return { kind: "enduringStory", ...(m[1] === "don't have" ? { not: true as const } : {}) }; // CR 702.195b
  if (/^(?:~|it) devoured a creature$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "devoured" };
  if (/^you attacked(?: with (?:a|one or more) creatures?)? this turn$/.test(text)) return { kind: "attackedThisTurn" };
  if (/^you didn't attack with a creature this turn$/.test(text)) return { kind: "attackedThisTurn", not: true };
  // Charging Cinderhorn, Keldon Twilight: "if no creatures attacked this turn": declared as attackers by anyone (CR 508.1).
  if (/^no creatures attacked this turn$/.test(text)) return { kind: "attackedThisTurn", not: true, anyone: true };
  if ((m = /^you (didn't )?activate(?:d)? a loyalty ability of a planeswalker this turn$/.exec(text))) return { kind: "activatedLoyaltyThisTurn", ...(m[1] ? { not: true as const } : {}) };
  if (/^you've committed a crime this turn$/.test(text)) return { kind: "committedCrime" }; // CR 700.13
  if (/^you control three or more creatures with different powers$/.test(text)) return { kind: "coven" };
  if ((m = /^you control the (creature|artifact) with the greatest (power|toughness|mana value) or tied for the greatest (power|toughness|mana value)$/.exec(text)) && m[2] === m[3])
    return { kind: "controlGreatest", type: m[1] === "creature" ? "Creature" : "Artifact", stat: m[2] === "mana value" ? "manaValue" : (m[2] as "power" | "toughness") };
  // High Score: "if you control a creature with the greatest power among creatures on the battlefield": tied counts too.
  if ((m = /^you control a (creature|artifact) with the greatest (power|toughness|mana value) among (creatures|artifacts) on the battlefield$/.exec(text)) && `${m[1]}s` === m[3])
    return { kind: "controlGreatest", type: m[1] === "creature" ? "Creature" : "Artifact", stat: m[2] === "mana value" ? "manaValue" : (m[2] as "power" | "toughness") };
  // Isolated Watchtower: "an opponent controls at least two more lands than you".
  if ((m = /^an opponent controls at least (two|three|four) more (lands|creatures) than you$/.exec(text))) return { kind: "opponentMore", what: m[2] as "lands" | "creatures", atLeast: num(m[1]!) };
  // Teachings of the Archaics: "an opponent has at least four more cards in hand than you".
  if ((m = /^an opponent has at least (two|three|four) more cards in hand than you$/.exec(text))) return { kind: "opponentMore", what: "hand", atLeast: num(m[1]!) };
  if ((m = /^an opponent (?:controls more (lands|creatures)|has more (life|cards in hand)) than you$/.exec(text)))
    return { kind: "opponentMore", what: (m[1] ?? (m[2] === "life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand" };
  // Timely Reinforcements: "if you have less life than an opponent", "if you control fewer creatures than an opponent":
  // the same as an opponent having more.
  if ((m = /^you (?:control fewer (lands|creatures)|have (less life|fewer cards in hand)) than an opponent$/.exec(text)))
    return { kind: "opponentMore", what: (m[1] ?? (m[2] === "less life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand" };
  // Feudkiller's Verdict: "if you have more life than an opponent": an opponent has less.
  if ((m = /^you (?:control more (lands|creatures)|have more (life|cards in hand)) than an opponent$/.exec(text)))
    return { kind: "opponentMore", what: (m[1] ?? (m[2] === "life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand", fewer: true };
  // "If that player has more cards in hand than each other player" (Battle Angels of Tyr): the trigger's player, strictly
  // more than every other player still in the game (CR 800.4a), you included.
  if ((m = /^that player (?:controls more (lands|creatures)|has more (life|cards in hand)) than each other player$/.exec(text)))
    return { kind: "eventPlayerMost", what: (m[1] ?? (m[2] === "life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand" };
  // Okina Nightwatch: "you have more cards in hand than each opponent", strictly more than each opponent in the game.
  if ((m = /^you (?:control more (lands|creatures)|have more (life|cards in hand)) than each opponent$/.exec(text)))
    return { kind: "youMost", what: (m[1] ?? (m[2] === "life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand" };
  // Even the Odds: "you control fewer creatures than each opponent".
  if ((m = /^you (?:control fewer (lands|creatures)|have (less life|fewer cards in hand)) than each opponent$/.exec(text)))
    return { kind: "youMost", what: (m[1] ?? (m[2] === "less life" ? "life" : "hand")) as "lands" | "creatures" | "life" | "hand", fewer: true };
  if (/^~ is attached to a creature$/.test(text)) return { kind: "self", is: "attachedToCreature" };
  if (text === "an opponent owns a card in exile") return { kind: "opponentOwnsExiled" };
  // Zealots en-Dal: "if all nonland permanents you control are white": none of them isn't (a colorless one isn't white).
  if ((m = /^all nonland permanents you control are (white|blue|black|red|green)$/.exec(text)))
    return { kind: "control", who: "you", filter: { kind: "object", types: [], notTypes: ["Land"], notColors: [COLOR_WORDS[m[1]!]!], text: `nonland non${m[1]} permanent` }, max: 0 };
  // Giant Turtle: "if it attacked during your last turn" (its controller's, rulings); Tangle Kelp: "if it attacked during
  // its controller's last turn", the enchanted creature.
  if (/^it attacked during your last turn$/.test(text) && st.affects.kind === "self") return { kind: "selfIs", filter: { kind: "object", combat: "attackedLastTurn", text: "that attacked during your last turn" } };
  if (/^it attacked during its controller's last turn$/.test(text) && st.affects.kind === "attached") return { kind: "attachedIs", filter: { kind: "object", combat: "attackedLastTurn", text: "that attacked during its controller's last turn" } };
  if ((m = /^it has an? ([a-z]+) counter on it$/.exec(text)) && st.affects.kind === "attached") return { kind: "attachedIs", filter: { kind: "object", counter: m[1]!, text: `with a ${m[1]} counter on it` } };
  if (/^~ attacked this turn$/.test(text)) return { kind: "self", is: "attackedThisTurn" };
  // Kjeldoran Home Guard: "if ~ attacked or blocked this combat".
  if (/^~ attacked or blocked this combat$/.test(text)) return { kind: "self", is: "attackedOrBlockedThisCombat" };
  // Tolsimir, Midnight's Light: "if ~ attacked this combat": declared as an attacker in this combat (CR 508.1), even if
  // it's been removed from combat since.
  if (/^~ attacked this combat$/.test(text)) return { kind: "self", is: "attackedThisCombat" };
  // Kytheon, Hero of Akros: "if ~ and at least two other creatures attacked this combat": declared as attackers, also ones
  // that have left the battlefield since; not ones put onto the battlefield attacking (rulings, CR 508.1).
  if ((m = new RegExp(`^~ and at least ${NUM} other creatures attacked this combat$`).exec(text))) return { kind: "allOf", conds: [{ kind: "self", is: "attackedThisCombat" }, { kind: "attackedWith", n: num(m[1]!) + 1, combat: true }] };
  // Lurker: "unless it attacked or blocked this turn": declared as an attacker or blocker this turn (CR 508.1, 509.1).
  if (/^~ didn't attack or block this turn$/.test(text)) return { kind: "self", is: "attackedOrBlockedThisTurn", not: true };
  // Agent Frank Horrigan: "~ has indestructible as long as it attacked this turn": declared as an attacker (CR 508.1).
  if (/^it attacked this turn$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "attackedThisTurn" };
  // "~ has indestructible as long as it attacked a battle this turn" (War Historian), "~ has hexproof as long as it
  // entered this turn" (Zurgo and Ojutai): about ~ itself.
  if (/^(?:~|it) attacked a battle this turn$/.test(text) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: "attackedBattleThisTurn" };
  if (/^(?:~|it) entered (?:the battlefield )?this turn$/.test(text) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: "enteredThisTurn" };
  // Karakyk Guardian: "~ has hexproof as long as it hasn't dealt damage yet": since it became this object (CR 400.7).
  if (/^(?:~|it) hasn't dealt damage yet$/.test(text) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: "hasDealtDamage", not: true };
  // The Tarrasque: "~ has haste and ward {10} as long as it was cast": it entered as a spell, cast from any zone (rulings).
  // Only for a static ability's own effect: "When ~ enters, if it was cast" is the trigger's `ifCast`.
  if (/^(?:~|it) was cast$/.test(text) && st.mods.length && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: "cast" };
  // Cactuar: "if ~ didn't enter the battlefield this turn".
  if (/^~ didn't enter (?:the battlefield )?this turn$/.test(text)) return { kind: "self", is: "enteredThisTurn", not: true };
  // "At the beginning of your end step, if ~ didn't attack this turn" (Air Nomad Student), "if ~ didn't attack or come
  // under your control this turn" (Mad Dog: neither happened), "unless it came under your control this turn" (Erg Raiders).
  if (/^~ didn't attack this turn$/.test(text)) return { kind: "self", is: "attackedThisTurn", not: true };
  // Wakka, Devoted Guardian: "if a counter was put on ~ this turn", any kind, as it entered too (CR 122.6).
  if (/^a counter was put on ~ this turn$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "countersPutThisTurn" };
  if (/^~ didn't attack or come under your control this turn$/.test(text))
    return { kind: "allOf", conds: [{ kind: "self", is: "attackedThisTurn", not: true }, { kind: "self", is: "controlledThisTurn", not: true }] };
  if (/^(?:~|it) came under your control this turn$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "controlledThisTurn" };
  if (/^(?:it's|~ is) attacking the player with the most life or tied for most life$/.test(text) && st.affects.kind === "self") return { kind: "attackingMostLife" };
  // "If it's your main phase", "if it's the first combat phase of the turn" (CR 505.1, 506.1).
  if ((m = /^it's your (main|combat) phase$/.exec(text))) return { kind: "phase", phase: m[1] as "main" | "combat", yours: true };
  // Dose of Dawnglow: "if it isn't your main phase": not your turn, or your turn but not a main phase.
  if (text === "it isn't your main phase") return { kind: "phase", phase: "main", yours: true, not: true };
  if (text === "it's your end step") return { kind: "phase", phase: "end", yours: true };
  if ((m = /^it's the first combat phase of (the|your) turn$/.exec(text))) return { kind: "phase", phase: "combat", first: true, ...(m[1] === "your" ? { yours: true as const } : {}) };
  if ((m = new RegExp(`^(?:a creature|${NUM} or more creatures) died( under your control)? this turn$`).exec(text)))
    return { kind: "creatureDied", ...(m[1] ? { n: num(m[1]) } : {}), ...(m[2] ? { yours: true as const } : {}) };
  if (text === "a creature not named ~ died this turn") return { kind: "creatureDied", notNamedSelf: true };
  // White Glove Gourmand: "if another Human died under your control this turn": of that type as it last existed. "Another"
  // can't be the permanent with the ability, which hasn't died while it's on the battlefield.
  if ((m = /^another ([A-Z][a-z]+) died under your control this turn$/.exec(text)) && CREATURE_TYPES.has(m[1]!)) return { kind: "amount", amount: { count: { kind: "diedThisTurn", subtype: m[1]!, yours: true } }, min: 1 };
  // Cult Conscript: "if a non-Skeleton creature died under your control this turn": not of that type as it last existed,
  // a token too (rulings).
  // Undead Sprinter: "if a non-Zombie creature died this turn", under anyone's control.
  if ((m = /^a non-([A-Z][a-z]+) creature died( under your control)? this turn$/.exec(text)) && CREATURE_TYPES.has(m[1]!)) return { kind: "amount", amount: { count: { kind: "diedThisTurn", notSubtype: m[1]!, ...(m[2] ? { yours: true as const } : {}) } }, min: 1 };
  // Titan Hunter: "if no creatures died this turn".
  if (text === "no creatures died this turn") return { kind: "not", cond: { kind: "creatureDied" } };
  // "If a permanent was put into a graveyard from the battlefield this turn" (Ashen Reaper): tokens too (CR 111.7).
  // Kami of Transience: "if an enchantment was put into your graveyard from the battlefield this turn".
  if ((m = /^an? (artifact|creature|enchantment|land|planeswalker) was put into your graveyard from the battlefield this turn$/.exec(text))) return { kind: "amount", amount: { count: { kind: "typeToYourGraveyardThisTurn", type: capital(m[1]!) } }, min: 1 };
  if (/^a permanent was put into a graveyard from the battlefield this turn$/.test(text)) return { kind: "amount", amount: { count: { kind: "toGraveyardThisTurn" } }, min: 1 };
  if (/^an opponent lost life this turn$/.test(text)) return { kind: "opponentLostLife" };
  // Wolverine, Best There Is: "if ~ dealt damage to another creature this turn".
  if (/^~ dealt damage to another creature this turn$/.test(text)) return { kind: "selfDamagedCreature" };
  // Bloodcrazed Goblin: "unless an opponent has been dealt damage this turn" (bloodthirst's condition, CR 702.54a).
  if (/^an opponent (?:has been|was) dealt damage this turn$/.test(text)) return { kind: "opponentLostLife", damaged: true };
  // Grim Repriser: "if an opponent has been dealt noncombat damage this turn", whenever it was dealt (rulings).
  if (/^an opponent (?:has been|was) dealt noncombat damage this turn$/.test(text)) return { kind: "opponentLostLife", damaged: true, noncombat: true };
  // Proctor of Potential: "if you've scried or surveilled this turn" (a scry of 0 is no scry, CR 701.22b, 701.25c).
  if (text === "you've scried or surveilled this turn") return { kind: "scriedThisTurn" };
  if (text === "you've surveilled this turn") return { kind: "scriedThisTurn", surveil: true };
  if (/^a player discarded a card this turn$/.test(text)) return { kind: "discardedThisTurn" };
  if (/^an opponent discarded a card this turn$/.test(text)) return { kind: "discardedThisTurn", opponent: true };
  // Mysterio's Mirage: "if you discarded a card this turn" is the same.
  if (/^you(?:'ve)? discarded a card this turn$/.test(text)) return { kind: "discardedThisTurn", yours: true };
  if ((m = new RegExp(`^an opponent lost ${NUM} or more life this turn$`).exec(text))) return { kind: "opponentLostLife", n: num(m[1]!) };
  if ((m = new RegExp(`^a player lost ${NUM} or more life this turn$`).exec(text))) return { kind: "opponentLostLife", n: num(m[1]!), anyPlayer: true };
  if (/^you haven't been dealt combat damage since your last turn$/.test(text)) return { kind: "noCombatDamageSinceLastTurn" };
  // Nightkin Ambusher: "~ can't be blocked as long as defending player has a rad counter": the player it's attacking.
  if (text === "defending player has a rad counter" && st.affects.kind === "self") return { kind: "defendingHasRad" };
  // Hooded Horror: counted as blockers are declared (rulings), you among the players.
  if (text === "defending player controls the most creatures or is tied for the most" && st.affects.kind === "self") return { kind: "defenderMostCreatures" };
  if (text === "an opponent was dealt combat damage by a legendary creature this turn") return { kind: "opponentCombatDamagedByLegendary" };
  if ((m = /^a player was dealt combat damage by an? ([A-Z][a-z]+) this turn$/.exec(text)) && subtypeSet(m[1]!) === "Creature") return { kind: "playerCombatDamaged", subtype: m[1]! };
  // The Traps' "this turn" conditions (see StaticCondition opponentSearched).
  if (/^an opponent searched their library this turn$/.test(text)) return { kind: "opponentSearched" };
  // Lictor: "if a creature entered the battlefield under an opponent's control this turn": the same as "an opponent had a
  // creature enter the battlefield under their control this turn".
  if ((m = /^an? (artifact|creature|land|enchantment|planeswalker) entered the battlefield under an opponent's control this turn$/.exec(text))) return { kind: "opponentEntered", types: [capital(m[1]!)], n: 1 };
  if ((m = new RegExp(`^an opponent had (?:an?|${NUM} or more) (?:(white|blue|black|red|green) )?(artifact|creature|land|enchantment|planeswalker)s? enter the battlefield under their control this turn$`).exec(text)))
    return { kind: "opponentEntered", types: [capital(m[3]!)], ...(m[2] ? { color: COLOR_WORDS[m[2]]! } : {}), n: m[1] ? num(m[1]) : 1 };
  if ((m = new RegExp(`^(?:you had )?(?:an?|(another)|${NUM} or more) (nonland permanent|permanent|artifact|creature|land|enchantment|planeswalker|[A-Z][a-z]+)s? (?:entered|enter) (?:the battlefield )?under your control this turn$`).exec(text))) {
    const what = m[3]!;
    const kinds = ["nonland permanent", "permanent", "artifact", "creature", "land", "enchantment", "planeswalker"];
    if (kinds.includes(what) || (subtypeSet(what) && subtypeSet(what) !== "Spell"))
      return { kind: "youEntered", types: what === "nonland permanent" || what === "permanent" || !kinds.includes(what) ? [] : [capital(what)], ...(what === "nonland permanent" ? { notTypes: ["Land"] } : {}), ...(!kinds.includes(what) ? { subtype: what } : {}), n: m[2] ? num(m[2]) : 1, ...(m[1] ? { other: true as const } : {}) };
  }
  if (/^a noncreature permanent under your control was destroyed this turn by a spell or ability an opponent controlled$/.test(text)) return { kind: "destroyedByOpponent" };
  if ((m = new RegExp(`^you've been dealt damage by ${NUM} or more creatures this turn$`).exec(text))) return { kind: "damagedByCreatures", n: num(m[1]!) };
  if (/^an opponent gained life this turn$/.test(text)) return { kind: "opponentGainedLife" };
  if (/^you put a counter on a creature this turn$/.test(text)) return { kind: "youPutCounterOnCreature" };
  if (/^one or more cards were put into exile this turn$/.test(text)) return { kind: "cardExiledThisTurn" };
  if ((m = new RegExp(`^an opponent had ${NUM} or more cards put into their graveyard from anywhere this turn$`).exec(text))) return { kind: "opponentCardsToGraveyard", n: num(m[1]!) };
  if ((m = new RegExp(`^an opponent cast ${NUM} or more spells this turn$`).exec(text))) return { kind: "opponentCastCount", n: num(m[1]!) };
  if ((m = /^an opponent (?:has )?cast an? (white|blue|black|red|green)(?: or (white|blue|black|red|green))? spell this turn$/.exec(text)))
    return { kind: "opponentCast", colors: [COLOR_WORDS[m[1]!]!, ...(m[2] ? [COLOR_WORDS[m[2]]!] : [])] };
  if ((m = /^you have no (land|creature|artifact|enchantment|instant|sorcery|planeswalker) cards in hand$/.exec(text))) return { kind: "noneInHand", filter: { kind: "card", types: [capital(m[1]!)], text: `${m[1]} card` } };
  if ((m = new RegExp(`^an opponent was dealt ${NUM} or more damage this turn$`).exec(text))) return { kind: "opponentDealtDamage", n: num(m[1]!) };
  if ((m = new RegExp(`^you were dealt ${NUM} or more damage this turn$`).exec(text))) return { kind: "opponentDealtDamage", n: num(m[1]!), you: true };
  if ((m = new RegExp(`^you attacked with ${NUM} or more creatures this turn$`).exec(text))) return { kind: "attackedWith", n: num(m[1]!) };
  // Deepway Navigator: "you attacked with three or more Merfolk this turn": of that type as they were declared.
  if ((m = new RegExp(`^you attacked with ${NUM} or more ([A-Z][a-z]+) this turn$`).exec(text)) && CREATURE_TYPES.has(singularWord(m[2]!))) return { kind: "attackedWith", n: num(m[1]!), subtype: singularWord(m[2]!) };
  if ((m = new RegExp(`^you attacked with creatures with total power ${NUM} or greater this combat$`).exec(text))) return { kind: "attackPower", n: num(m[1]!) };
  if ((m = new RegExp(`^you've drawn ${NUM} or more cards this turn$`).exec(text))) return { kind: "drawn", n: num(m[1]!) };
  // "If you've drawn more than one card this turn" (Proft's Eidetic Memory): two or more.
  if ((m = new RegExp(`^you've drawn more than ${NUM} cards? this turn$`).exec(text))) return { kind: "drawn", n: num(m[1]!) + 1 };
  if ((m = new RegExp(`^an opponent drew ${NUM} or more cards this turn$`).exec(text))) return { kind: "drawn", n: num(m[1]!), opponent: true };
  if (/^you descended this turn$/.test(text)) return { kind: "descended" };
  if ((m = new RegExp(`^you cycled ${NUM} or more cards this turn$`).exec(text))) return { kind: "cycled", n: num(m[1]!) };
  // "If a permanent you controlled left the battlefield this turn" (Pegasus Guardian): the same (revolt).
  if (/^a permanent (?:left the battlefield under your control|you controlled left the battlefield) this turn$/.test(text)) return { kind: "revolt" };
  if (/^a creature left the battlefield under your control this turn$/.test(text)) return { kind: "revolt", creature: true };
  if (/^no permanents left the battlefield this turn$/.test(text)) return { kind: "revolt", none: true };
  if (/^a nonland permanent left the battlefield this turn or a spell was warped this turn$/.test(text)) return { kind: "void" };
  // Your life total (CR 119), against a number or your starting life total (CR 903.7).
  if ((m = /^you have (\d+) or (more|less) life$/.exec(text))) return { kind: "life", ...(m[2] === "more" ? { min: Number(m[1]) } : { max: Number(m[1]) }) };
  // Near-Death Experience: "if you have exactly 1 life".
  if ((m = /^you have exactly (\d+) life$/.exec(text))) return { kind: "life", min: Number(m[1]), max: Number(m[1]) };
  // Battle of Wits: "if you have 200 or more cards in your library".
  if ((m = /^you have (\d+) or more cards in your library$/.exec(text))) return { kind: "amount", amount: { count: { kind: "cardsInLibrary", who: { ref: "you" } } }, min: Number(m[1]) };
  // Bloodghast: "as long as an opponent has 10 or less life" (one still in the game).
  if ((m = /^an opponent has (\d+) or less life$/.exec(text))) return { kind: "life", max: Number(m[1]), opponent: true };
  // Anya, Merciless Angel: "an opponent's life total is less than half their starting life total" (CR 903.7).
  if (/^an opponent's life total is less than half their starting life total$/.test(text)) return { kind: "life", max: Math.ceil(STARTING_LIFE / 2) - 1, opponent: true };
  if ((m = /^each player has (\d+) or less life$/.exec(text))) return { kind: "life", max: Number(m[1]), everyone: true };
  // Game Over: "if a player's life total is less than or equal to half their starting life total" (CR 903.7: 20).
  if (/^a player's life total is less than or equal to half their starting life total$/.test(text)) return { kind: "life", max: Math.floor(STARTING_LIFE / 2), anyone: true };
  // Elenda, Saint of Dusk: "your life total is at least 10 greater than your starting life total".
  if ((m = /^(?:you have at least (\d+) life more than|your life total is at least (\d+) greater than) your starting life total$/.exec(text))) return { kind: "life", min: STARTING_LIFE + Number(m[1] ?? m[2]) };
  if ((m = /^your life total is (greater than or equal to|greater than|less than or equal to|less than) (half )?your starting life total$/.exec(text))) {
    const base = m[2] ? Math.floor(STARTING_LIFE / 2) : STARTING_LIFE;
    return { kind: "life", ...{ "greater than or equal to": { min: base }, "greater than": { min: base + 1 }, "less than or equal to": { max: base }, "less than": { max: base - 1 } }[m[1]!] };
  }
  if ((m = new RegExp(`^an opponent has ${NUM} or more poison counters$`).exec(text))) return { kind: "opponentPoison", n: num(m[1]!) };
  // "Poisoned" is having one or more poison counters (CR 122.1f) (Viridian Betrayers).
  if (/^an opponent is poisoned$/.test(text)) return { kind: "opponentPoison", n: 1 };
  if (/^there are no cards in your graveyard$/.test(text)) return { kind: "amount", amount: { count: { kind: "cardsInGraveyard", who: { ref: "you" } } }, max: 0 };
  if ((m = new RegExp(`^an opponent has ${NUM} or more cards in their graveyard$`).exec(text))) return { kind: "opponentGraveyard", n: num(m[1]!) };
  if ((m = new RegExp(`^a graveyard has ${NUM} or more cards in it$`).exec(text))) return { kind: "opponentGraveyard", n: num(m[1]!), anyone: true };
  // Domestication: "if enchanted creature's power is 4 or greater": the creature it's attached to, as it is now.
  if ((m = new RegExp(`^enchanted creature's (power|toughness) is ${NUM} or (greater|less)$`).exec(text))) {
    const r = m[3] === "greater" ? { min: num(m[2]!) } : { max: num(m[2]!) };
    return { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], [m[1]!]: r, text: `creature with ${m[1]} ${m[2]} or ${m[3]}` } };
  }
  // "Activate only if ~'s power is 3 or greater" (Kitsa, Otterball Elite): as it is now.
  if ((m = new RegExp(`^(~'s (?:power|toughness)) is ${NUM} or (greater|less)$`).exec(text))) {
    const amount = parseCount(m[1]!, null);
    return amount ? { kind: "amount", amount, ...(m[3] === "greater" ? { min: num(m[2]!) } : { max: num(m[2]!) }) } : null;
  }
  // Kianne, Corrupted Memory: "as long as ~'s power is even" (0 is even).
  if ((m = /^(~'s power) is (even|odd)$/.exec(text))) {
    const amount = parseCount(m[1]!, null);
    return amount ? { kind: "amount", amount, parity: m[2] as "even" | "odd" } : null;
  }
  // Pestilence: "if no creatures are on the battlefield".
  // Wirecat: "if an enchantment is on the battlefield": anyone's. Knight of Malice: "as long as any player controls a white
  // permanent": the same.
  // Pious Kitsune: "if a creature named Eight-and-a-Half-Tails is on the battlefield": anyone's, by its name (CR 201.2).
  if ((m = /^an? (creature|permanent) named ([A-Z][^,~]*) is on the battlefield$/.exec(text)))
    return { kind: "onBattlefield", filter: { kind: "object", types: m[1] === "creature" ? ["Creature"] : [], notTypes: [], notColors: [], named: m[2]!, text: `${m[1]} named ${m[2]}` }, min: 1 };
  // Shauku, Endbringer: "if there's another creature on the battlefield": anyone's, not counting ~.
  if ((m = /^another ([a-z]+) is on the battlefield$/.exec(text))) {
    const g = parseGroup(`all ${m[1]}s`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, min: 1, other: true } : null;
  }
  if ((m = /^an? (.+) is on the battlefield$/.exec(text.replace(/^any player controls (an? [a-z]+ permanent)$/, "$1 is on the battlefield")))) {
    const g = parseGroup(`all ${m[1]}s`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, min: 1 } : null;
  }
  if ((m = /^you (don't )?control more (lands|creatures) than the active player$/.exec(text))) return { kind: "moreThanActive", what: m[2] as "lands" | "creatures", ...(m[1] ? { not: true as const } : {}) };
  if ((m = /^no (.+) (?:are|is) on the battlefield$/.exec(text))) {
    const g = parseGroup(`all ${m[1]}`);
    return g && !g.other ? { kind: "onBattlefield", filter: g.filter, max: 0 } : null;
  }
  // "Whenever ~ attacks, if it's not suspected" (Rubblebelt Braggart), "if ~ is suspected" (CR 701.60).
  if ((m = /^(?:~|it)(?:'s| is) (not )?suspected$/.exec(text)) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "suspected", ...(m[1] ? { not: true as const } : {}) };
  // "~ can't be blocked as long as it's attacking alone" (Dream Prowler): attacking with no other creature attacking (CR 506.5).
  if (/^(?:~|it)(?:'s| is) attacking alone$/.test(text) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: "attackingAlone" };
  // Kosei, Penitent Warlord: "as long as ~ is enchanted, equipped, and has a counter on it": all three (any counter).
  if (/^~ is enchanted, equipped, and has a counter on it$/.test(text))
    return { kind: "allOf", conds: [{ kind: "self", is: "enchanted" }, { kind: "self", is: "equipped" }, { kind: "self", is: "hasCounter" }] };
  // Sarulf, Realm Eater: "if ~ has one or more +1/+1 counters on it".
  if (/^~ has one or more \+1\/\+1 counters on it$/.test(text)) return { kind: "amount", amount: { count: { kind: "counters", counter: "+1/+1", of: { ref: "self" } } }, min: 1 };
  // The Ozolith: "if ~ has counters on it" (any kind).
  if (/^~ has (?:counters|a counter|one or more counters) on it$/.test(text)) return { kind: "self", is: "hasCounter" };
  // "If ~ is enchanted by two or more Auras, flip it" (Kitsune Mystic): the Auras attached to it.
  if ((m = new RegExp(`^~ is enchanted by ${NUM} or more Auras$`).exec(text))) return { kind: "amount", amount: { count: { kind: "attachedToSelf", subtypes: ["Aura"] } }, min: num(m[1]!) };
  // Timber Paladin: "as long as ~ is enchanted by exactly two Auras".
  if ((m = new RegExp(`^~ is enchanted by exactly (one|${NUM}) Auras?$`).exec(text))) {
    const n = m[1] === "one" ? 1 : num(m[1]!);
    return { kind: "amount", amount: { count: { kind: "attachedToSelf", subtypes: ["Aura"] } }, min: n, max: n };
  }
  // Brass Knuckles: "Equipped creature has double strike as long as two or more Equipment are attached to it": to the
  // equipped creature, this one included.
  if ((m = new RegExp(`^${NUM} or more Equipment are attached to it$`).exec(text)) && st.affects.kind === "attached") return { kind: "amount", amount: { count: { kind: "attachedToHost", subtypes: ["Equipment"] } }, min: num(m[1]!) };
  // Balan, Wandering Knight: "~ has double strike as long as two or more Equipment are attached to it": to itself.
  if ((m = new RegExp(`^${NUM} or more Equipment are attached to it$`).exec(text)) && st.affects.kind === "self") return { kind: "amount", amount: { count: { kind: "attachedToSelf", subtypes: ["Equipment"] } }, min: num(m[1]!) };
  // "When ~ has flying, flip it" (Student of Elements): one of its keywords.
  // Surge Engine: "Activate only if ~ doesn't have defender", "Activate only if ~ is blue": its keywords and colors now
  // (CR 602.5b), however it lost or got them (rulings).
  if ((m = /^~ (has|doesn't have) (defender|flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance)$/.exec(text))) {
    const has: StaticCondition = { kind: "selfIs", filter: { kind: "object", keywords: [capital(m[2]!)], text: m[2]! } };
    return m[1] === "has" ? has : { kind: "not", cond: has };
  }
  if ((m = /^~ is (white|blue|black|red|green)$/.exec(text)) && st.affects.kind === "self") return { kind: "selfIs", filter: { kind: "object", colors: [COLOR_WORDS[m[1]!]!], text: m[1]! } };
  // Manor Gargoyle: "~ has indestructible as long as it has defender": its keywords as the layers so far left them, so
  // an effect that takes defender away comes first (CR 613.8a).
  if ((m = /^it has (defender|flying)$/.exec(text)) && st.affects.kind === "self") return { kind: "selfIs", filter: { kind: "object", keywords: [capital(m[1]!)], text: m[1]! } };
  // Triton Wavebreaker: "As long as ~ is a creature, it has prowess": not while it's a bestowed Aura (CR 702.103b), its
  // card types as layer 4 left them (CR 613.1d).
  if (/^~ is a creature$/.test(text) && st.affects.kind === "self") return { kind: "selfIs", filter: { kind: "object", types: ["Creature"], text: "creature" } };
  if (/^~ isn't a creature$/.test(text) && st.affects.kind === "self") return { kind: "not", cond: { kind: "selfIs", filter: { kind: "object", types: ["Creature"], text: "creature" } } };
  // Mistform Wall: "~ has defender as long as it's a Wall": its creature types as layer 4 left them (CR 613.1d, 613.1f).
  if ((m = /^it's an? ([A-Z][a-z]+)$/.exec(text)) && st.affects.kind === "self" && CREATURE_TYPES.has(m[1]!))
    return { kind: "selfIs", filter: { kind: "object", subtypes: [m[1]!], text: m[1]! } };
  if ((m = /^~ isn't (equipped|enchanted)$/.exec(text))) return { kind: "self", is: m[1] as "equipped" | "enchanted", not: true };
  // Intrepid Ace: "~ gets +2/+0 as long as it isn't attacking or blocking" (CR 506.4).
  if (/^it isn't attacking or blocking$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "attackingOrBlocking", not: true };
  if (/^it isn't attacking$/.test(text) && st.affects.kind === "self") return { kind: "self", is: "attacking", not: true };
  if ((m = /^it's (white|blue|black|red|green)$/.exec(text)) && st.affects.kind === "attached") return { kind: "attachedIs", filter: { kind: "object", colors: [COLOR_WORDS[m[1]!]!], text: m[1]! } };
  // Spectral Cloak: "Enchanted creature has shroud as long as it's untapped": the enchanted creature.
  if ((m = /^it's (tapped|untapped)$/.exec(text)) && st.affects.kind === "attached") return { kind: "attachedIs", filter: { kind: "object", tapped: m[1] === "tapped", text: `${m[1]} permanent` } };
  // "If ~ isn't prepared, it becomes prepared" (CR 722.3a).
  if ((m = /^~ (is|isn't) prepared$/.exec(text))) return { kind: "self", is: "prepared", ...(m[1] === "isn't" ? { not: true as const } : {}) };
  // "It" is the source only when the ability is about the source itself.
  if (/^at least one creature is blocking ~$/.test(text)) return { kind: "self", is: "hasBlockers" };
  if (/^two or more creatures are blocking (?:~|it)$/.test(text)) return { kind: "self", is: "twoOrMoreBlockers" };
  // Warchanter Skald: "if it's enchanted or equipped": either.
  if (/^(?:~|it)(?:'s| is) enchanted or equipped$/.test(text) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "anyOf", conds: [{ kind: "self", is: "enchanted" }, { kind: "self", is: "equipped" }] };
  // "Activate only if ~ is blocked" (Cinder Crawler), "only if ~ is attacking or blocking" (Sawback Manticore).
  const self = /^(?:~|it)(?:'s| is) (attacking or blocking|attacking|blocking|blocked|enchanted|equipped|modified|tapped|untapped|monstrous|renowned)$/.exec(text);
  if (self && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: self[1] === "attacking or blocking" ? "attackingOrBlocking" : (self[1] as "attacking" | "blocking" | "blocked" | "enchanted" | "equipped" | "modified" | "tapped" | "untapped" | "monstrous" | "renowned") };
  // Gatewatch Beacon: "if ~ has loyalty counters on it": one or more.
  if ((m = new RegExp(`^(?:~|it) has (?:an? ${COUNTER} counter|${COUNTER} counters) on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~")))
    return { kind: "selfCounter", counter: counterKind((m[1] ?? m[2])!) };
  // Dark Depths: "When ~ has no ice counters on it" (a state trigger, CR 603.8).
  if ((m = /^(?:it|~) has an? (even|odd) number of counters on it$/.exec(text))) return { kind: "selfCounters", counter: "*", min: 0, parity: m[1] as "even" | "odd" };
  if ((m = new RegExp(`^~ has no ${COUNTER} counters on it$`).exec(text))) return { kind: "selfCounters", counter: counterKind(m[1]!), min: 0, max: 0 };
  // Shatterskull Charger: "if ~ doesn't have a +1/+1 counter on it": the same.
  if ((m = new RegExp(`^~ doesn't have an? ${COUNTER} counter on it$`).exec(text))) return { kind: "selfCounters", counter: counterKind(m[1]!), min: 0, max: 0 };
  // Jeweled Amulet: "Activate only if there are no charge counters on ~".
  if ((m = new RegExp(`^there are no ${COUNTER} counters on ~$`).exec(text))) return { kind: "selfCounters", counter: counterKind(m[1]!), min: 0, max: 0 };
  // Temple of Cyclical Time: "Activate only if it has no time counters on it": it is ~.
  if ((m = new RegExp(`^it has no ${COUNTER} counters on it$`).exec(text)) && st.affects.kind === "self") return { kind: "selfCounters", counter: counterKind(m[1]!), min: 0, max: 0 };
  // Beastmaster Ascension: "as long as ~ has seven or more quest counters on it".
  // "If ~ has fewer than three +1/+1 counters on it" (Runaway Steam-Kin).
  // Ayara's Oathsworn: "if it has fewer than four +1/+1 counters on it", "if it has exactly four +1/+1 counters on it".
  if ((m = new RegExp(`^(?:~|it) has fewer than ${NUM} ${COUNTER} counters on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "selfCounters", counter: counterKind(m[2]!), min: 0, max: num(m[1]!) - 1 };
  if ((m = new RegExp(`^(?:~|it) has exactly ${NUM} ${COUNTER} counters? on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~")) && (num(m[1]!) === 1) === !/counters on/.test(text)) return { kind: "selfCounters", counter: counterKind(m[2]!), min: num(m[1]!), max: num(m[1]!) };
  // Faithbound Judge: "if ~ has two or fewer judgment counters on it".
  if ((m = new RegExp(`^~ has ${NUM} or fewer ${COUNTER} counters on it$`).exec(text))) return { kind: "selfCounters", counter: counterKind(m[2]!), min: 0, max: num(m[1]!) };
  // Warden of the Inner Sky: "as long as this creature has three or more counters on it": of every kind together.
  if ((m = new RegExp(`^(?:~|it) has ${NUM} or more counters on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "selfCounters", counter: "*", min: num(m[1]!) };
  // "~ has trample as long as it has ten or more +1/+1 counters on it" (Primordial Hydra).
  if ((m = new RegExp(`^(?:~|it) has ${NUM} or more ${COUNTER} counters on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "selfCounters", counter: counterKind(m[2]!), min: num(m[1]!) };
  // The Tron lands: "If you control an Urza's Mine and an Urza's Power-Plant" (CR 205.3i: "Urza's" and "Mine" are both
  // land types, so one land with both; not Processing Plant, an Ulamog's Power-Plant), each of them.
  if ((m = /^you control an Urza's (Mine|Power-Plant|Tower) and an Urza's (Mine|Power-Plant|Tower)$/.exec(text)) && m[1] !== m[2])
    return { kind: "allOf", conds: [m[1]!, m[2]!].map((x) => ({ kind: "control" as const, who: "you" as const, filter: { kind: "object" as const, types: ["Land"], subtypes: ["Urza's"], anyOf: [{ kind: "object" as const, subtypes: [x], text: x }], text: `Urza's ${x}` }, min: 1 })) };
  // "Whenever ~ attacks while you don't control another Dinosaur" (Pugnacious Hammerskull): none other than the source.
  if ((m = /^you don't control another (.+)$/.exec(text))) {
    const c = parseStaticCondition(`you control another ${m[1]}`, st);
    return c?.kind === "control" && c.other && c.min === 1 && c.max === undefined ? { ...c, min: undefined, max: 0 } : null;
  }
  // Dire Tactics: "If you don't control a Human, ...", Pest Rescuer: "if you don't control a Pest creature token": none.
  if ((m = /^you don't control an? (.+)$/.exec(text))) {
    const c = parseStaticCondition(`you control a ${m[1]}`, st);
    return c?.kind === "control" && !c.other && c.min === 1 && c.max === undefined ? { ...c, min: undefined, max: 0 } : null;
  }
  // "As long as no opponent controls a creature" (Vexing Beetle), "... a white or blue creature" (Skittish Kavu): none of
  // them does (an opponent still in the game).
  if ((m = /^no opponent controls (an? .+)$/.exec(text))) {
    const c = parseStaticCondition(`an opponent controls ${m[1]}`, st);
    return c?.kind === "control" && !c.other && c.min === 1 && c.max === undefined ? { ...c, min: undefined, max: 0, every: true } : null;
  }
  // Mercadian Atlas: "if you didn't play a land this turn".
  if (/^you didn't play a land this turn$/.test(text)) return { kind: "not", cond: { kind: "playedLandThisTurn" } };
  // Naomi, Pillar of Order; Kami of Terrible Secrets: "if you control an artifact and an enchantment": both.
  // Necra Sanctuary: "if you control a green permanent and a white permanent": one of each (a green and white one is both).
  if ((m = /^you control (an? (?:(?:white|blue|black|red|green) permanent|[a-z]+)) and (an? (?:(?:white|blue|black|red|green) permanent|[a-z]+))$/.exec(text))) {
    const conds = [m[1]!, m[2]!].map((x) => parseStaticCondition(`you control ${x}`, st));
    return conds.every((c) => c?.kind === "control" && c.min === 1) ? { kind: "allOf", conds: conds as StaticCondition[] } : null;
  }
  // Liu Bei, Lord of Shu: "as long as you control a permanent named Guan Yu, Sainted Warrior or a permanent named Zhang Fei,
  // Fierce Warrior"; Rufus Shinra: "if you don't control a creature named Darkstar": by name (CR 201.2), any of them.
  // Mine Worker: "if you control creatures named Power Plant Worker and Tower Worker": one of each.
  // Throne of Empires: "if you control artifacts named Crown of Empires and Scepter of Empires", the same, artifacts as it
  // resolves (rulings).
  if ((m = /^you control (creature|permanent|artifact)s named ([^~]+?) and ([^~]+)$/.exec(text)) && !/ named /.test(m[2]! + m[3]!)) text = `you control ${m[1] === "artifact" ? "an" : "a"} ${m[1]} named ${m[2]} and ${m[1] === "artifact" ? "an" : "a"} ${m[1]} named ${m[3]}`;
  if ((m = /^you (don't )?control an? (permanent|creature|land|artifact) named ([^~]+?)(?: (or|and) an? \2 named ([^~]+))?$/.exec(text))) {
    if (m[1] && m[4] === "and") return null;
    const type = m[2] === "permanent" ? [] : [capital(m[2]!)];
    const filter = (name: string): TargetSpec => ({ kind: "object", types: type, notTypes: [], notColors: [], named: name, text: `${m![2]} named ${name}` });
    const conds: StaticCondition[] = [m[3]!, m[5]].filter((x): x is string => !!x).map((name) => ({ kind: "control", who: "you", filter: filter(name), ...(m![1] ? { max: 0 } : { min: 1 }) }));
    return conds.length === 1 ? conds[0]! : m[1] || m[4] === "and" ? { kind: "allOf", conds } : { kind: "anyOf", conds };
  }
  // Narcolepsy: "if enchanted creature is untapped": the creature it's attached to, as it is now.
  // Earthlore: "if enchanted land is untapped"; Nature's Chosen: "if enchanted creature is white and untapped".
  // Volition Reins: "if enchanted permanent is tapped": any permanent.
  if ((m = /^enchanted (creature|land|permanent) is (?:(white|blue|black|red|green) and )?(tapped|untapped)$/.exec(text)) && (m[1] === "creature" || !m[2]))
    return { kind: "attachedIs", filter: { kind: "object", types: m[1] === "permanent" ? [] : [capital(m[1]!)], tapped: m[3] === "tapped", ...(m[2] ? { colors: [COLOR_WORDS[m[2]]!] } : {}), text: `${m[2] ? `${m[2]} ` : ""}${m[3]} ${m[1]}` } };
  // Howl of the Hunt: "if enchanted creature is a Wolf or Werewolf": the creature it's attached to, as it is now.
  if ((m = /^enchanted creature is an? ([A-Z][a-z]+)(?: or ([A-Z][a-z]+))?$/.exec(text)) && CREATURE_TYPES.has(m[1]!) && (!m[2] || CREATURE_TYPES.has(m[2]))) {
    const kinds = [m[1]!, m[2]].filter((x): x is string => !!x);
    return { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], ...(kinds.length > 1 ? { anyOf: kinds.map((k): TargetSpec => ({ kind: "object", subtypes: [k], text: k })) } : { subtypes: kinds }), text: `${kinds.join(" or ")} creature` } };
  }
  // Goblin Caves: "As long as enchanted land is a basic Mountain": the land it's attached to, as it is now (CR 205.4a).
  if ((m = /^enchanted land is a basic (Plains|Island|Swamp|Mountain|Forest)$/.exec(text))) return { kind: "attachedIs", filter: { kind: "object", types: ["Land"], supertypes: ["Basic"], subtypes: [m[1]!], text: `basic ${m[1]}` } };
  // Faerie Miscreant: "if you control another creature named ~": one other than it with its name (CR 201.2), as it is now.
  if (/^you control another creature named ~$/.test(text)) {
    const amount = parseCount("the number of other creatures you control named ~", null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: 1 } : null;
  }
  // Lashwhip Predator: "if your opponents control three or more creatures": all of theirs together.
  if ((m = new RegExp(`^your opponents control ${NUM} or more (creatures|artifacts|enchantments|lands)$`).exec(text))) {
    const amount = parseCount(`the number of ${m[2]} your opponents control`, null);
    return amount && typeof amount === "object" ? { kind: "amount", amount, min: num(m[1]!) } : null;
  }
  // Kezzerdrix: "if your opponents control no creatures": none of them controls one, as "no opponent controls a creature".
  if ((m = /^your opponents control no ([a-z]+)s$/.exec(text))) return parseStaticCondition(`no opponent controls a ${m[1]}`, st);
  // Chevill, Bane of Monsters: "if your opponents control no permanents with bounty counters on them": any bounty counter,
  // whoever put it there (rulings).
  if ((m = /^your opponents control no ([a-z]+)s with ([a-z]+) counters on them$/.exec(text))) return parseStaticCondition(`no opponent controls a ${m[1]} with a ${m[2]} counter on it`, st);
  // Homicidal Seclusion, Demonic Rising: "as long as you control exactly one creature".
  if ((m = /^you control exactly one ([a-z]+)$/.exec(text))) {
    const c = parseStaticCondition(`you control a ${m[1]}`, st);
    return c?.kind === "control" && !c.other && c.min === 1 && c.max === undefined ? { ...c, max: 1 } : null;
  }
  // Kumena's Speaker: "as long as you control another Merfolk or an Island": either one.
  if ((m = /^you control another ([A-Z][a-z]+) or an? ([A-Z][a-z]+)$/.exec(text))) {
    const a = parseStaticCondition(`you control another ${m[1]}`, st);
    const b = parseStaticCondition(`you control a ${m[2]}`, st);
    return a && b ? { kind: "anyOf", conds: [a, b] } : null;
  }
  // Doctor Doom: "as long as you control an artifact creature or a Plan": either one.
  if ((m = /^you control (an? [a-z]+ [a-z]+) or (an? [A-Z][a-z]+)$/.exec(text))) {
    const a = parseStaticCondition(`you control ${m[1]}`, st);
    const b = parseStaticCondition(`you control ${m[2]}`, st);
    return a && b ? { kind: "anyOf", conds: [a, b] } : null;
  }
  // Thopter Assembly: "if you control no Thopters other than ~": the same as not controlling another Thopter.
  if ((m = /^you control no ([A-Z][a-z]+)s other than ~$/.exec(text))) return parseStaticCondition(`you don't control another ${m[1]}`, st);
  // Barren Glory: "if you control no permanents other than ~ and have no cards in hand": both.
  if ((m = /^you control no permanents other than ~( and have no cards in hand)?$/.exec(text))) {
    const a = parseStaticCondition("you don't control another permanent", st);
    const b = m[1] ? parseStaticCondition("you have no cards in hand", st) : a;
    return a && b ? (m[1] ? { kind: "allOf", conds: [a, b] } : a) : null;
  }
  // Synod Centurion: "When you control no other artifacts", Emperor Crocodile: "no other creatures": likewise.
  // Ray of Frost: "When this Aura enters, if enchanted creature is red": its colors now.
  if ((m = /^enchanted creature is (white|blue|black|red|green)$/.exec(text))) return { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], colors: [COLOR_WORDS[m[1]!]!], text: `${m[1]} creature` } };
  // Synchronized Eviction: "if you control at least two creatures that share a creature type": two or more of yours with
  // one creature type in common. Littjara Kinseekers: "if you control three or more creatures that share a creature type".
  if ((m = /^you control (?:at least (two|three|four|five)|(two|three|four|five) or more) creatures that share a creature type$/.exec(text)))
    return { kind: "control", who: "you", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" }, min: num(m[1] ?? m[2]!), sameCreatureType: true };
  // Maze's Mantle: "if enchanted creature has toxic": any toxic N (CR 702.164a).
  if (text === "enchanted creature has toxic") return { kind: "attachedIs", filter: { kind: "object", types: ["Creature"], toxic: true, text: "creature with toxic" } };
  // Bride's Gown: "an Equipment named Groom's Finery is attached to a creature you control": whoever controls that
  // Equipment, "you" the controller of the source (rulings).
  if ((m = /^an Equipment named (.+) is attached to a creature you control$/.exec(text)))
    return { kind: "onBattlefield", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Equipment"], named: m[1]!, attachedTo: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creature you control" }, text: `Equipment named ${m[1]} attached to a creature you control` }, min: 1 };
  // Dust Stalker: "if you control no other colorless creatures".
  if ((m = /^you control no other ((?:colorless )?(?:artifact|creature|land|enchantment))s$/.exec(text))) return parseStaticCondition(`you don't control another ${m[1]}`, st);
  // Predator's Gambit: "Enchanted creature has intimidate as long as its controller controls no other creatures": the
  // enchanted creature's controller, and creatures other than that one.
  if ((m = /^its controller controls no other (artifact|creature|land|enchantment)s$/.exec(text)) && st.affects.kind === "attached") {
    const c = parseStaticCondition(`you don't control another ${m[1]}`, st);
    return c?.kind === "control" && c.who === "you" && c.other ? { ...c, who: "attached" } : null;
  }
  // Favorable Destiny: "Enchanted creature has shroud as long as its controller controls another creature": the same.
  if ((m = /^its controller controls another (artifact|creature|land|enchantment)$/.exec(text)) && st.affects.kind === "attached") {
    const c = parseStaticCondition(`you control another ${m[1]}`, st);
    return c?.kind === "control" && c.who === "you" && c.other && c.min === 1 && c.max === undefined ? { ...c, who: "attached" } : null;
  }
  if ((m = /^(you|an opponent|defending player) controls? (.+)$/.exec(text))) {
    // "At least three other enchantments" (Ephara, Ever-Sheltering) is "three or more other enchantments".
    m[2] = m[2]!.replace(/^at least (\w+) /, "$1 or more ");
    // "If you control a red permanent other than Ajani" (Ajani, Nacatl Avenger) is "another red permanent".
    m[2] = m[2]!.replace(/^an? ([^,]+) other than ~$/, "another $1");
    // "Seven or more lands with different names" (Field of the Dead), "ten or more Gates with different names" (Maze's End): names counted once each.
    // "Four or more Demons with different names" (Liliana's Contract).
    const names = new RegExp(`^${NUM} or more (lands|creatures|artifacts|Gates|Demons) with (different names|the same name)$`).exec(m[2]!);
    if (names && m[1] === "you") {
      const filter = pickFilter(names[2]!);
      return filter ? { kind: "control", who: "you", filter, min: num(names[1]!), ...(names[3] === "the same name" ? { sameName: true as const } : { differentNames: true as const }) } : null;
    }
    const who = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "defending";
    // Each attacking creature has its own defending player (CR 506.2), so only the source's own is modeled.
    if (who === "defending" && st.affects.kind !== "self") return null;
    // "You control a Swamp or a Mountain" (the Verges): either one.
    const q = CONTROL_COUNT.exec(m[2]!.replace(/^(an? \S+) or an? (?=\S+$)/, "$1 or "));
    if (!q) return null;
    // NUM is a group of its own: q[1] the word, q[2] "N or more", q[3] "N or fewer", q[4] what.
    // "Three or more tapped Pirates and/or Vehicles" (The Indomitable): each permanent with either subtype.
    const either = /^(tapped )?([A-Z][a-z]+) and\/or ([A-Z][a-z]+)$/.exec(q[4]!);
    const kinds = either ? [singular(either[2]!), singular(either[3]!)] : [];
    // "Seven or more lands and/or Treefolk" (Tend the Sprigs): each permanent that's either.
    const andOr = either ? null : /^([a-z]+) and\/or ([A-Z][a-z]+)$/.exec(q[4]!);
    const filter: TargetSpec | null = either ? (kinds.every((k) => CREATURE_TYPES.has(k) || k === "Vehicle") ? { kind: "object", types: [], subtypes: kinds, ...(either[1] ? { tapped: true } : {}), text: q[4]!.toLowerCase() } : null) : andOr ? (CREATURE_TYPES.has(singular(andOr[2]!)) ? pickFilter(`${singular(andOr[1]!)} or ${singular(andOr[2]!)}`) : null) : pickFilter(q[4]!);
    if (!filter) return null;
    if (q[1] === "no") return { kind: "control", who, filter, max: 0 };
    if (q[1] === "another") return { kind: "control", who, filter, min: 1, other: true };
    if (q[1]) return { kind: "control", who, filter, min: 1 };
    // "two or more other artifacts" leaves the source out
    const other = / or more other /.test(m[2]!);
    if (q[2]) return { kind: "control", who, filter, min: num(q[2]!), ...(other ? { other } : {}) };
    return { kind: "control", who, filter, max: num(q[3]!) };
  }
  return null;
}

/**
 * "Prevent all [combat|noncombat] damage that would be dealt (to|by|to and dealt by) X [by creatures|by artifact
 * sources]": X as written, and what's prevented (CR 615.1).
 */
export function parsePreventAll(text: string): { subject: string; mod: Extract<Modification, { kind: "preventDamage" }> } | null {
  const m = /^Prevent all (combat |noncombat )?damage that would be dealt (to and dealt by|to|by) (.+?)(?: by (creatures|artifact creatures|artifact sources))?$/i.exec(text);
  if (!m) return null;
  const fromTypes = m[4] === "creatures" ? ["Creature"] : m[4] === "artifact creatures" ? ["Artifact", "Creature"] : m[4] === "artifact sources" ? ["Artifact"] : undefined;
  if (fromTypes && m[2] !== "to") return null;
  const combat = m[1] === "combat " ? ("only" as const) : m[1] === "noncombat " ? ("non" as const) : undefined;
  return {
    subject: m[3]!,
    mod: { kind: "preventDamage", ...(m[2] !== "by" ? { to: true as const } : {}), ...(m[2] !== "to" ? { by: true as const } : {}), ...(combat ? { combat } : {}), ...(fromTypes ? { fromTypes } : {}) },
  };
}

/**
 * The group a static ability talks about: "creatures you control", "other Elves you
 * control", "white creatures you control", "enchanted creature", "equipped creature", "~".
 */
export function parseAffected(subject: string): Affects | null {
  const x = subject.trim();
  if (x === "~") return { kind: "self" };
  // "Creatures enchanted player controls" (an Aura with "enchant player", CR 702.5d): the group "you control" names,
  // controlled by the player the Aura is attached to.
  const enchanted = / enchanted (?:player|opponent) controls$/;
  if (enchanted.test(x)) {
    const a = parseAffected(x.replace(enchanted, " you control"));
    if (a?.kind !== "filter" || a.other || a.ownedCommanders) return null;
    if (a.controller === "you") return { ...a, controller: "enchanted" };
    if (a.spec?.controller !== "you" || a.controller) return null;
    const { controller: _, ...spec } = a.spec;
    return { ...a, spec, controller: "enchanted" };
  }
  if (/^(Enchanted|Equipped) (creature|permanent|artifact|land|planeswalker)$/.test(x)) return { kind: "attached" };
  // "Each creature that's attacking one of your opponents has trample" (Oviya, Automech Artisan): any player's creature
  // attacking that player (not their planeswalkers or battles), whichever are now (CR 611.3a). Blast-Furnace Hellkite's
  // "Creatures attacking your opponents", the same (rulings).
  // Triarch Stalker, Beckoning Will-o'-Wisp: "Creatures attacking the last chosen player": attacking that player (not
  // their planeswalkers or battles), the one its trigger chose last (kept on the permanent, compile.ts).
  if (x === "Creatures attacking the last chosen player") return { kind: "filter", types: ["Creature"], spec: { kind: "object", chosen: "attackingPlayer", text: "creature attacking the last chosen player" } };
  if (/^(?:Each creature that's|Creatures) attacking (?:one of )?your opponents$/.test(x)) return { kind: "filter", types: ["Creature"], spec: { kind: "object", combat: "attackingOpponent", text: "creature attacking one of your opponents" } };
  // Lovisa Coldeyes: "Each creature that's a Barbarian, a Warrior, or a Berserker": any player's creature with any of those
  // creature types, counted once.
  const thatsA = /^Each creature that's an? ([A-Z][a-z]+), an? ([A-Z][a-z]+), or an? ([A-Z][a-z]+)$/.exec(x);
  if (thatsA) {
    const subs = [thatsA[1]!, thatsA[2]!, thatsA[3]!];
    return subs.every((t) => CREATURE_TYPES.has(t)) ? { kind: "filter", types: ["Creature"], spec: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: subs, text: `creature that's a ${subs.join(", a ")}` } } : null;
  }
  // Brenard, Ginger Sculptor: "Each creature you control that's a Food or a Golem": your creatures with either subtype
  // (Food is an artifact type, rulings), counted once.
  const yoursEither = /^Each creature you control that's an? ([A-Z][a-z]+) or an? ([A-Z][a-z]+)$/.exec(x);
  // Creature types alone are read the general way below (Howlpack Resurgence).
  if (yoursEither && !(CREATURE_TYPES.has(yoursEither[1]!) && CREATURE_TYPES.has(yoursEither[2]!))) {
    const subs = [yoursEither[1]!, yoursEither[2]!];
    return subs.every((t) => CREATURE_TYPES.has(t) || t === "Food") ? { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], subtypes: subs, text: `creature that's a ${subs.join(" or a ")}` } } : null;
  }
  // Shield of Kaldra: "Equipment named Sword of Kaldra, ~, and Helm of Kaldra": anyone's Equipment with any of those names.
  const namedEquipment = /^Equipment named ([^,]+), ([^,]+), and ([^,]+)$/.exec(x);
  if (namedEquipment) {
    const names = namedEquipment.slice(1) as string[];
    const anyOf: TargetSpec[] = names.map((n) => ({ kind: "object", named: n, text: `named ${n}` }));
    return { kind: "filter", types: [], spec: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Equipment"], anyOf, text: `Equipment named ${names.join(", ")}` } };
  }
  // "Creatures named Lightning Rager can't attack you ..." (Rite of the Raging Storm): any player's, by their name.
  const named = /^Creatures named ([A-Z][A-Za-z' -]+)$/.exec(x);
  if (named) return { kind: "filter", types: ["Creature"], spec: { kind: "object", named: named[1]!, text: `creature named ${named[1]}` } };
  // "Commander creatures you control get +2/+2", "Commanders you control have ward {2}" (CR 903.3): any player's.
  if (/^Commanders? (?:creatures )?you control$/.test(x))
    return { kind: "filter", types: x.includes("creatures") ? ["Creature"] : [], controller: "you", spec: { kind: "object", commander: true, text: "commander" } };
  // "Other snow and Zombie creatures you control" (Narfi): creatures that are snow or Zombies; a snow Zombie gets it once
  // (rulings).
  // "Other Ninja and Rogue creatures you control" (Silver-Fur Master): Ninjas or Rogues, a Ninja Rogue once.
  const either = /^(Other )?(snow|[A-Z][a-z]+) and ([A-Z][a-z]+) creatures you control$/.exec(x);
  if (either && CREATURE_TYPES.has(either[3]!) && (either[2] === "snow" || CREATURE_TYPES.has(either[2]!))) {
    const first: TargetSpec = either[2] === "snow" ? { kind: "object", supertypes: ["Snow"], text: "snow creature" } : { kind: "object", subtypes: [either[2]!], text: `${either[2]} creature` };
    const anyOf: TargetSpec[] = [first, { kind: "object", subtypes: [either[3]!], text: `${either[3]} creature` }];
    return { kind: "filter", types: ["Creature"], controller: "you", other: !!either[1], spec: { kind: "object", anyOf, text: `${either[2]} and ${either[3]} creature` } };
  }
  // Caterwauling Boggart: "Goblins you control and Elementals you control": creatures of either type, a Goblin Elemental once.
  const twoGroups = /^([A-Z][a-z]+) you control and ([A-Z][a-z]+) you control$/.exec(x);
  if (twoGroups) {
    const subtypes = [singular(twoGroups[1]!), singular(twoGroups[2]!)];
    return subtypes.every((t) => CREATURE_TYPES.has(t)) ? { kind: "filter", types: ["Creature"], subtypes, controller: "you" } : null;
  }
  // Cid, Timeless Artificer: "Artifact creatures and Heroes you control": creatures that are artifacts or Heroes, an artifact
  // Hero once.
  const artifactOr = /^Artifact creatures and ([A-Z][a-z]+) you control$/.exec(x);
  if (artifactOr && CREATURE_TYPES.has(singular(artifactOr[1]!))) {
    const sub = singular(artifactOr[1]!);
    const anyOf: TargetSpec[] = [{ kind: "object", types: ["Artifact"], text: "artifact creature" }, { kind: "object", subtypes: [sub], text: `${sub} creature` }];
    return { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", anyOf, text: `artifact creature or ${sub}` } };
  }
  // Thorin Oakenshield: "Artifacts and creatures you control": permanents of either card type, an artifact creature once.
  // Only that pair: the general path takes the other "X and Y you control" pairs.
  const artCre = /^(other )?(?:artifacts and creatures|creatures and artifacts) you control$/i.exec(x);
  if (artCre) return { kind: "filter", types: [], controller: "you", other: !!artCre[1], spec: { kind: "object", types: ["Artifact", "Creature"], text: "artifact or creature" } };
  // Serpent of Yawning Depths: "Krakens, Leviathans, Octopuses, and Serpents you control": creatures of any of those types.
  const typeList = /^((?:[A-Z][a-z]+, )+and [A-Z][a-z]+) you control$/.exec(x);
  if (typeList) {
    const subtypes = typeList[1]!.split(/, (?:and )?/).map(singular);
    return subtypes.every((t) => CREATURE_TYPES.has(t)) ? { kind: "filter", types: ["Creature"], subtypes, controller: "you" } : null;
  }
  // On Wings of Gold: "Creatures you control that are Zombies and/or tokens": either one, a Zombie token once.
  const orToken = /^Creatures you control that are ([A-Z][a-z]+)s and\/or tokens$/.exec(x);
  if (orToken && CREATURE_TYPES.has(orToken[1]!)) {
    const anyOf: TargetSpec[] = [{ kind: "object", subtypes: [orToken[1]!], text: `${orToken[1]} creature` }, { kind: "object", token: true, text: "creature token" }];
    return { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", anyOf, text: `${orToken[1]} and/or token creature` } };
  }
  let m = /^(Other )?((?:[A-Z]?[a-z]+ )*?)creatures (you control|your opponents control)$/i.exec(x);
  if (m) {
    const words = m[2]!.trim().split(/\s+/).filter(Boolean);
    const colors: Color[] = [];
    const subtypes: string[] = [];
    const types = ["Creature"];
    let combat: "attacking" | "blocking" | undefined;
    let colorless = false;
    let multicolored = false;
    let tapped: boolean | undefined;
    let legendary: boolean | undefined;
    let status: TargetSpec["status"];
    let nontoken = false;
    let historic = false;
    const notColors: Color[] = [];
    for (const [i, w] of words.entries()) {
      if (COLOR_WORDS[w.toLowerCase()]) colors.push(COLOR_WORDS[w.toLowerCase()]!);
      // "Other nonblack creatures you control get +1/+1" (Angel of Jubilation): whichever aren't black right now.
      else if (/^non(white|blue|black|red|green)$/i.test(w) && !notColors.length && !colors.length) notColors.push(COLOR_WORDS[w.toLowerCase().slice(3)]!);
      // "Green or blue creatures you control" (Murkfiend Liege): colors already match any of the listed ones.
      else if (w.toLowerCase() === "or" && i === 1 && words.length === 3 && COLOR_WORDS[words[0]!.toLowerCase()] && COLOR_WORDS[words[2]!.toLowerCase()]) continue;
      // "Artifact creatures you control get +1/+1", "Land creatures you control have vigilance": both card types.
      else if (/^(artifact|enchantment|land)$/i.test(w) && !types.includes(capital(w.toLowerCase()))) types.push(capital(w.toLowerCase()));
      else if (CREATURE_TYPES.has(w)) subtypes.push(w);
      // "Attacking creatures you control get +1/+0": whichever are attacking right now (CR 611.3a).
      else if ((w.toLowerCase() === "attacking" || w.toLowerCase() === "blocking") && !combat) combat = w.toLowerCase() as "attacking" | "blocking";
      else if (w.toLowerCase() === "colorless" && !colorless && !multicolored) colorless = true; // CR 105.2c
      // "Other multicolored creatures you control get +1/+0" (Rienne, Angel of Rebirth): two or more colors (CR 105.2b).
      else if (w.toLowerCase() === "multicolored" && !colorless && !multicolored) multicolored = true;
      // "Untapped creatures you control get +0/+2": whichever are untapped right now, like attacking ones.
      else if (/^(un)?tapped$/i.test(w) && tapped === undefined) tapped = w.toLowerCase() === "tapped";
      // "Legendary creatures you control get +2/+2" (supertype, CR 205.4d), "nonlegendary creatures".
      else if (/^(non)?legendary$/i.test(w) && legendary === undefined) legendary = w.toLowerCase() === "legendary";
      // "Enchanted creatures you control get +1/+1", "Equipped creatures", "Modified creatures" (CR 700.9).
      // "Goaded creatures your opponents control can't block" (Bothersome Quasit, CR 701.15).
      else if (/^(enchanted|equipped|modified|goaded)$/i.test(w) && !status) status = w.toLowerCase() as TargetSpec["status"];
      // "Nontoken creatures you control have riot" (Rhythm of the Wild).
      else if (/^nontoken$/i.test(w) && !nontoken) nontoken = true;
      // "Other historic creatures you control have double strike" (Bayek of Siwa): artifacts, legendaries and Sagas (CR 700.6).
      else if (/^historic$/i.test(w) && !historic) historic = true;
      else return null;
    }
    const specWords = [...notColors.map((c) => `non${Object.keys(COLOR_WORDS).find((k) => COLOR_WORDS[k] === c)}`), historic ? "historic" : undefined, nontoken ? "nontoken" : undefined, combat, colorless ? "colorless" : undefined, multicolored ? "multicolored" : undefined, tapped === undefined ? undefined : tapped ? "tapped" : "untapped", legendary === undefined ? undefined : legendary ? "legendary" : "nonlegendary", status].filter(Boolean);
    const spec: TargetSpec | undefined = specWords.length
      ? {
          kind: "object",
          ...(combat ? { combat } : {}),
          ...(colorless ? { colorCount: "colorless" as const } : multicolored ? { colorCount: "multicolored" as const } : {}),
          ...(tapped !== undefined ? { tapped } : {}),
          ...(legendary === true ? { supertypes: ["Legendary"] } : legendary === false ? { notSupertypes: ["Legendary"] } : {}),
          ...(status ? { status } : {}),
          ...(nontoken ? { token: false } : {}),
          ...(historic ? { anyOf: HISTORIC } : {}),
          ...(notColors.length ? { notColors } : {}),
          text: `${specWords.join(" ")} creature`,
        }
      : undefined;
    return {
      kind: "filter",
      types,
      subtypes: subtypes.length ? subtypes : undefined,
      colors: colors.length ? colors : undefined,
      ...(spec ? { spec } : {}),
      controller: m[3]!.toLowerCase() === "you control" ? "you" : "opponent",
      other: !!m[1],
    };
  }
  // Umbra Mystic: "Auras attached to permanents you control": anyone's Auras attached to a permanent you control, not your
  // Auras attached to others' permanents (rulings).
  if (x === "Auras attached to permanents you control")
    return { kind: "filter", types: ["Enchantment"], subtypes: ["Aura"], spec: { kind: "object", attachedTo: { kind: "object", controller: "you", text: "permanent you control" }, text: "Aura attached to a permanent you control" } };
  // "Other Zombies you control", "Elves you control"
  m = /^(Other )?([A-Z][a-z]+) you control$/.exec(x);
  if (m && CREATURE_TYPES.has(singular(m[2]!))) return { kind: "filter", types: ["Creature"], subtypes: [singular(m[2]!)], controller: "you", other: !!m[1] };
  if (/^(All creatures|Each creature)$/i.test(x)) return { kind: "filter", types: ["Creature"] };
  // "Tokens you control have "{T}: Add {G}."" (Jaheira, Friend of the Forest): any permanent that's a token.
  if (x === "Tokens you control") return { kind: "filter", types: [], spec: { kind: "object", token: true, text: "token" }, controller: "you" };
  // "Creature tokens get -1/-1" (Illness in the Ranks): everyone's; "creature tokens you control".
  if ((m = /^Creature tokens( you control| your opponents control)?$/.exec(x)))
    return { kind: "filter", types: ["Creature"], spec: { kind: "object", token: true, text: "creature token" }, ...(m[1] ? { controller: m[1] === " you control" ? ("you" as const) : ("opponent" as const) } : {}) };
  // A Background's "Commander creatures you own": whoever controls them (rulings).
  if (/^Commander creatures you own$/.test(x)) return { kind: "filter", types: ["Creature"], ownedCommanders: true };
  // Anything else a group can say: "Each creature you control with a +1/+1 counter on it", "Creatures of the chosen type";
  // "Creatures you control with +1/+1 counters on them" is the same group.
  // "Creatures with ice counters on them" (Rimescale Dragon) likewise.
  // "Equipment you control have equip {0}" (Puresteel Paladin): the plural of Equipment is Equipment.
  if ((m = /^(Other )?Equipment you control$/.exec(x))) return parseAffected(`Each ${m[1] ? "other " : ""}Equipment you control`);
  // Barbara Wright: "Sagas you control have read ahead" (an enchantment subtype, CR 205.3h).
  if (x === "Sagas you control") return { kind: "filter", types: ["Enchantment"], subtypes: ["Saga"], controller: "you" };
  // Forgotten Monument: "Other Caves you control have "..."" (a land subtype, CR 205.3i).
  if ((m = /^(Other )?(Caves|Deserts|Gates) you control$/.exec(x))) return { kind: "filter", types: ["Land"], subtypes: [m[2]!.slice(0, -1)], controller: "you", other: !!m[1] };
  const plural = /^Creatures( you control)? with ([+-]1\/[+-]1|ice) counters on them$/.exec(x);
  const g = parseGroup(plural ? `Each creature${plural[1] ?? ""} with ${plural[2] === "ice" ? "an" : "a"} ${plural[2]} counter on it` : x, true);
  return g ? { kind: "filter", types: [], spec: g.filter, ...(g.other ? { other: true } : {}) } : null;
}

/**
 * "Can block an additional creature each combat", "an additional seven creatures", "any number of creatures"
 * (CR 509.1a). "This turn" is the same for an effect that lasts until the turn ends.
 */
export function parseExtraBlocks(text: string): Modification | null {
  let m: RegExpExecArray | null;
  if (/^can block any number of creatures(?: each combat| this turn)?$/.test(text)) return { kind: "blockAny" };
  if (/^can block an additional creature(?: each combat| this turn)$/.test(text)) return { kind: "blockAdditional", n: 1 };
  // Hundred-Handed One: "an additional ninety-nine creatures".
  if (/^can block an additional ninety-nine creatures each combat$/.test(text)) return { kind: "blockAdditional", n: 99 };
  if ((m = new RegExp(`^can block (?:up to )?(?:an additional ${NUM}|${NUM} additional) creatures(?: each combat| this turn)$`).exec(text))) return { kind: "blockAdditional", n: num(m[1] ?? m[2]!) };
  return null;
}

/** "get +1/+1", "have flying and vigilance", "get +2/+0 and have first strike", "can't block". */
export function parseStaticMods(rest: string): Modification[] | null {
  let m: RegExpExecArray | null;
  // Greymond, Avacyn's Stalwart: "Humans you control have each of the chosen abilities": the keywords chosen as the source
  // entered (Chosen.keywords; compile checks it chooses them), in layer 6 (CR 613.1f).
  if (/^(?:has|have) each of the chosen abilities$/.test(rest)) return [{ kind: "addKeywords", keywords: [CHOSEN_KEYWORDS] }];
  // The job select Equipment: "gets +1/+0 and is a Monk in addition to its other types", "gets +2/+2, has reach, and
  // is a Bard ...", "is a Wizard in addition to its other types and has "..."", "gets +0/+2, is a Wizard in addition to
  // its other types, and has "..."" (a creature type added in layer 4, CR 205.1b).
  const typed = (t: string, others: string[]): Modification[] | null => {
    if (!CREATURE_TYPES.has(t)) return null;
    const more = others.map((o) => parseStaticMods(o));
    return more.every(Boolean) ? [...more.flatMap((x) => x!), { kind: "addTypes", types: [], subtypes: [t] }] : null;
  };
  // Raised by Giants: "have base power and toughness 10/10 and are Giants in addition to their other types" (layers 4
  // and 7b, CR 613.1d, 613.4b).
  // Graaz, Unstoppable Juggernaut: "... and are Juggernauts in addition to their other creature types".
  if ((m = /^(?:has|have) base power and toughness (\d+)\/(\d+)(?: and (?:is an? ([A-Z][a-z]+)|are ([A-Z][a-z]+)) in addition to (?:its|their) other (?:creature )?types)?$/.exec(rest))) {
    const t = m[3] ?? (m[4] && singular(m[4]));
    if (t !== undefined && !CREATURE_TYPES.has(t)) return null;
    return [{ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }, ...(t ? [{ kind: "addTypes" as const, types: [], subtypes: [t] }] : [])];
  }
  // Curse of Conformity: "have base power and toughness 3/3 and lose all creature types" (layers 4 and 7b; a changeling
  // loses its creature types too, rulings).
  if ((m = /^(?:has|have) base power and toughness (\d+)\/(\d+) and lose all creature types$/.exec(rest)))
    return [{ kind: "loseCreatureTypes" }, { kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }];
  // Archon of the Wild Rose: "have base power and toughness 4/4 and have flying" (layers 6 and 7b).
  if ((m = /^(?:has|have) base power and toughness (\d+)\/(\d+) and ((?:has|have) [a-z ,]+)$/.exec(rest))) {
    const more = parseStaticMods(m[3]!);
    return more?.length && more.every((x) => x.kind === "addKeywords") ? [{ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }, ...more] : null;
  }
  // Timber Paladin: "has base power and toughness 5/5 and vigilance", "... 10/10, vigilance, and trample": the keywords
  // it has (layer 6) after the base power and toughness (layer 7b).
  if ((m = /^has base power and toughness (\d+)\/(\d+)(?: and |, )((?!has |have |is |are )[a-z ,]+)$/.exec(rest))) {
    const more = parseStaticMods(`has ${m[3]}`);
    return more?.length && more.every((x) => x.kind === "addKeywords") ? [{ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }, ...more] : null;
  }
  // Sigarda's Summons: "have base power and toughness 4/4, have flying, and are Angels in addition to their other types"
  // (layers 4, 6 and 7b).
  if ((m = /^(?:has|have) base power and toughness (\d+)\/(\d+), ((?:has|have) [^,"]+), and (?:is an? ([A-Z][a-z]+)|are ([A-Z][a-z]+)) in addition to (?:its|their) other types$/.exec(rest))) {
    const t = m[4] ?? singular(m[5]!);
    const more = parseStaticMods(m[3]!);
    if (!CREATURE_TYPES.has(t) || !more) return null;
    return [{ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }, ...more, { kind: "addTypes", types: [], subtypes: [t] }];
  }
  // Porcelain Gallery: "have base power and toughness each equal to the number of creatures you control", counted as the
  // effect applies in layer 7b (CR 613.4b, 611.3a).
  if ((m = /^(?:has|have) base power and toughness each equal to (the number of .+)$/.exec(rest))) {
    const n = parseCount(m[1]!, null);
    return n ? [{ kind: "setPT", power: n, toughness: n }] : null;
  }
  // Aettir and Priwen: "has base power and toughness X/X, where X is your life total": the same, layer 7b (the "where X
  // is" is read with the rest of the line).
  if (/^(?:has|have) base power and toughness X\/X$/.test(rest)) return [{ kind: "setPT", power: { count: { kind: "x" } }, toughness: { count: { kind: "x" } } }];
  // Withercrown: "has base power 0 and has "..."": layer 7b (CR 613.4b), its toughness left alone, and the ability (layer 6).
  if ((m = /^(?:has|have) base power (\d+)(?: and ((?:has|have) .+))?$/.exec(rest))) {
    const more = m[2] ? parseStaticMods(m[2]) : [];
    return more ? [{ kind: "setPower", power: Number(m[1]) }, ...more] : null;
  }
  // Maha, Its Feathers Night: "have base toughness 1" (layer 7b, CR 613.4b).
  if ((m = /^(?:has|have) base toughness (\d+)$/.exec(rest))) return [{ kind: "setToughness", toughness: Number(m[1]) }];
  // Opalescence: "is a creature in addition to its other types and has base power and base toughness each equal to its
  // mana value"; March of the Machines: "is an artifact creature with power and toughness each equal to its mana value".
  // Each object's own mana value, set in layer 7b (CR 613.4b); the creature type in layer 4 keeps applying to the same
  // objects even if the source loses its abilities in layer 6 (CR 613.6, rulings on Opalescence and Humility).
  if (/^is a creature in addition to its other types and has base power and base toughness each equal to its mana value$|^is an artifact creature with power and toughness each equal to its mana value$/.test(rest)) {
    const mv = { count: { kind: "affectedManaValue" as const } };
    return [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: mv, toughness: mv }];
  }
  // The Flesh Is Weak: "Creatures you control with +1/+1 counters on them are artifacts in addition to their other types"
  // (layer 4, CR 613.1d, 205.1b).
  if (rest === "are artifacts in addition to their other types") return [{ kind: "addTypes", types: ["Artifact"], subtypes: [] }];
  // Ygra, Eater of All: "are Food artifacts in addition to their other types and have "..."" (an artifact type and the
  // artifact type in layer 4, CR 613.1d, 205.1b; the ability in layer 6).
  if ((m = /^are ([A-Z][a-z]+) artifacts in addition to their other types(?:,? and ((?:has|have) .+))?$/.exec(rest)) && subtypeSet(m[1]!) === "Artifact") {
    const more = m[2] ? parseStaticMods(m[2]) : [];
    return more ? [{ kind: "addTypes", types: ["Artifact"], subtypes: [m[1]!] }, ...more] : null;
  }
  // Nature's Revolt: "All lands are 2/2 creatures that are still lands", Living Lands: "All Forests are 1/1 creatures
  // ...": creatures in addition to their other types (CR 205.1b), base power and toughness in layer 7b.
  // Kormus Bell: "1/1 black creatures" (the color in layer 5); Ambush Commander: "1/1 green Elf creatures" (the creature
  // type with the card type, layer 4).
  if ((m = /^are (\d+)\/(\d+) (?:(white|blue|black|red|green) )?(?:([A-Z][a-z]+) )?creatures that are still lands$/.exec(rest))) {
    if (m[4] && !CREATURE_TYPES.has(m[4])) return null;
    return [{ kind: "addTypes", types: ["Creature"], subtypes: m[4] ? [m[4]] : [] }, ...(m[3] ? [{ kind: "setColors" as const, colors: [COLOR_WORDS[m[3]]!] }] : []), { kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }];
  }
  // Bello, Bard of the Brambles: "is a 4/4 Elemental creature in addition to its other types and has indestructible, haste,
  // and "..."": the card type and creature type in layer 4, the base power and toughness in 7b, the abilities in 6
  // (CR 613.1d, 613.1f, 613.4b, 205.1b).
  if ((m = /^is an? (\d+)\/(\d+) (?:([A-Z][a-z]+) )?creature in addition to its other types(?:,? and ((?:has|have) .+))?$/.exec(rest))) {
    if (m[3] && !CREATURE_TYPES.has(m[3])) return null;
    const more = m[4] ? parseStaticMods(m[4]) : [];
    return more && [{ kind: "addTypes", types: ["Creature"], subtypes: m[3] ? [m[3]] : [] }, { kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }, ...more];
  }
  // Flaring Flame-Kin: "gets +2/+2, has trample, and has "..."": the same as "gets +2/+2 and has trample and "..."".
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), (?:has|have) ([a-z ]+), and (?:has|have) (".+")$`).exec(rest))) return parseStaticMods(`${m[1]} and has ${m[4]} and ${m[5]}`);
  // The Possessed creatures: "gets +1/+1, is black, and has "..."": its color is black instead (layer 5, CR 105.3, 613.1e).
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), is (white|blue|black|red|green),? and ((?:has|have) .+)$`).exec(rest))) {
    const [a, b] = [parseStaticMods(m[1]!), parseStaticMods(m[5]!)];
    return a && b ? [...a, { kind: "setColors", colors: [COLOR_WORDS[m[4]!]!] }, ...b] : null;
  }
  // Wayward Angel: "gets +3/+3, is black, has trample, and has "..."": the same, with a keyword before the granted ability.
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), is (white|blue|black|red|green), ((?:has|have) [a-z ]+), and ((?:has|have) ".+")$`).exec(rest))) {
    const [a, b] = [parseStaticMods(m[1]!), parseStaticMods(`${m[5]!} and ${m[6]!.replace(/^(?:has|have) /, "")}`)];
    return a && b ? [...a, { kind: "setColors", colors: [COLOR_WORDS[m[4]!]!] }, ...b] : null;
  }
  // Repentant Vampire: "is white and has "..."": white instead of its other colors (layer 5), and the ability (layer 6).
  if ((m = /^is (white|blue|black|red|green) and ((?:has|have) ".+")$/.exec(rest))) {
    const b = parseStaticMods(m[2]!);
    return b ? [{ kind: "setColors", colors: [COLOR_WORDS[m[1]!]!] }, ...b] : null;
  }
  // Grave Servitude: "Enchanted creature gets +3/-1 and is black": black instead of its other colors (layer 5).
  if ((m = new RegExp(`^(gets? ${PT}/${PT}) and is (white|blue|black|red|green)$`).exec(rest))) {
    const a = parseStaticMods(m[1]!);
    return a ? [...a, { kind: "setColors", colors: [COLOR_WORDS[m[4]!]!] }] : null;
  }
  // Captain's Hook: "is a Pirate in addition to its other creature types" says the same (CR 205.1b).
  const IS = "is an? ([A-Z][a-z]+) in addition to its other (?:creature )?types";
  if ((m = new RegExp(`^${IS}$`).exec(rest))) return typed(m[1]!, []);
  if ((m = new RegExp(`^${IS},? and ((?:has|have) .+)$`).exec(rest))) return typed(m[1]!, [m[2]!]);
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), ${IS},? and ((?:has|have) .+)$`).exec(rest))) return typed(m[4]!, [m[1]!, m[5]!]);
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), ((?:has|have) .+?),? and ${IS}$`).exec(rest))) return typed(m[5]!, [m[1]!, m[4]!]);
  if ((m = new RegExp(`^(.+?),? and ${IS}$`).exec(rest))) return typed(m[2]!, [m[1]!]);
  // Runed Stalactite: "gets +1/+1 and is every creature type" (Stalactite Dagger: "is all creature types"), Arachnoform:
  // "gets +2/+2, has reach, and is every creature type": each creature type in layer 4 (CR 205.3m, 613.1d).
  if ((m = /^(.+?),? and is (?:every|all) creature types?$/.exec(rest))) {
    const first = parseStaticMods(m[1]!.replace(/^(gets? [^,]+), ((?:has|have) [^,]+)$/, "$1 and $2"));
    return first && [...first, { kind: "addTypes", types: [], subtypes: [], allCreatureTypes: true }];
  }
  // Whispersilk Cloak: "can't be blocked and has shroud" (CR 509.1b, 702.18a).
  if ((m = /^(can't be blocked),? and ((?:has|have) .+)$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[2]!);
    return first && second && [...first, ...second];
  }
  // "Gets +4/+4 and has first strike, and all creatures able to block it do so" (a blocking requirement, CR 509.1c).
  if ((m = /^(.+?),? and all creatures able to block it do so$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    return first && [...first, { kind: "allMustBlock" }];
  }
  // Serra Bestiary: "can't attack or block, and its activated abilities with {T} in their costs can't be activated" (mana
  // abilities with {T} too, rulings).
  if ((m = /^(.+?),? and (?:its|their) activated abilities with \{T\} in their costs can't be activated$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    return first && [...first, { kind: "cantActivate", tapCost: true }];
  }
  // Arrest: "can't attack or block, and its activated abilities can't be activated" (mana abilities too, CR 605.1a).
  if ((m = /^(.+?),? and its activated abilities can't be activated( unless they're mana abilities)?$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    return first && [...first, { kind: "cantActivate", ...(m[2] ? { exceptMana: true as const } : {}) }];
  }
  // "Gets +0/+3 and can block an additional creature each combat", "gets +2/+2, has vigilance, and can block ...".
  if ((m = new RegExp(`^(gets? ${PT}/${PT}|(?:has|have) .+?)(?:,? and|, (?:has|have) (.+?),? and) (can block .+)$`).exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const grants = m[4] ? parseGrants(m[4]) : [];
    // "... and can block creatures with landwalk abilities as though they didn't have those abilities" (Street Savvy).
    const asThough = /^can block creatures with .+ as though /.test(m[5]!) ? parseStaticMods(m[5]!)?.[0] : undefined;
    const more = / this turn$/.test(m[5]!) ? null : (asThough ?? parseExtraBlocks(m[5]!));
    return first && grants && more ? [...first, ...grants, more] : null;
  }
  // Assault Suit: "gets +2/+2, has haste, can't attack you or planeswalkers you control, and can't be sacrificed".
  if ((m = new RegExp(`^gets? ${PT}/${PT}, (?:has|have) ([^,]+), (can't [^,]+),? and (can't [^,]+)$`).exec(rest))) {
    const grants = parseGrants(m[3]!);
    const [a, b] = [parseStaticMods(m[4]!), parseStaticMods(m[5]!)];
    return grants && a && b ? [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }, ...grants, ...a, ...b] : null;
  }
  // "Gets +2/+2, has flying, and attacks each combat if able" (Dragon's Rage Channeler), "... and can't attack you or
  // planeswalkers you control" (the Vows), "... and can't be blocked by more than one creature" (Rope).
  if ((m = new RegExp(`^gets? ${PT}/${PT}, (?:has|have) (.+?),? and (attacks? each combat if able|can't block|can't attack you or planeswalkers you control|is goaded|can't be blocked by more than one creature)$`).exec(rest))) {
    // "... has deathtouch, and is goaded" (Ghoulish Impetus).
    const grants = parseGrants(m[3]!);
    const second = parseStaticMods(m[4]!);
    return grants && second ? [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }, ...grants, ...second] : null;
  }
  // "Gets +2/+2 and can't block" (Childhood Horror), "gets +1/+1 and attacks each combat if able".
  // "Gets +1/+1 and is goaded" (the Impetus Auras, CR 701.15), "gets -2/-0 and loses all abilities" (Mystic Subdual),
  // "gets +1/+1 and doesn't untap during its controller's untap step" (Dance of the Dead), "gets +3/+0 and can only attack
  // alone" (Errantry).
  if ((m = new RegExp(`^(gets? ${PT}/${PT}|(?:has|have) .+?),? and (can't .+|attacks? each combat if able|blocks? each combat if able|must be blocked if able|is goaded|loses all abilities|doesn't untap during its controller's untap step|can only attack alone)$`).exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[4]!);
    return first && second ? [...first, ...second] : null;
  }
  // Predatory Impetus: "gets +3/+3, must be blocked if able, and is goaded": all three.
  const RIDER = "can't [^,]+|attacks? each combat if able|blocks? each combat if able|must be blocked if able|is goaded|doesn't untap during its controller's untap step";
  if ((m = new RegExp(`^(gets? ${PT}/${PT}), (${RIDER}),? and (${RIDER})$`).exec(rest))) {
    const parts = [m[1]!, m[4]!, m[5]!].map((x) => parseStaticMods(x));
    return parts.every((x) => x) ? parts.flatMap((x) => x!) : null;
  }
  // "Equipped creature gets +3/+0 and loses flying" (Colossus Hammer): abilities lost in layer 6.
  if ((m = new RegExp(`^gets? ${PT}/${PT} and loses (.+)$`).exec(rest))) {
    const lost = parseKeywordList(m[3]!);
    return lost ? [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }, { kind: "removeKeywords", keywords: lost }] : null;
  }
  if ((m = new RegExp(`^gets? ${PT}/${PT}(?: and (?:has|have) (.+))?$`).exec(rest))) {
    const mods: Modification[] = [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }];
    if (m[3]) {
      const grants = parseGrants(m[3]);
      if (!grants) return null;
      mods.push(...grants);
    }
    return mods;
  }
  // Colossus of Akros: "it has trample and can attack as though it didn't have defender".
  if ((m = /^(has [a-z ]+?) and (can attack as though (?:it|they) didn't have defender)$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[2]!);
    return first && second ? [...first, ...second] : null;
  }
  // Expedition Lookout: "~ can attack as though it didn't have defender and it can't be blocked".
  if ((m = /^(can attack as though it didn't have defender) and it (can't be blocked)$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[2]!);
    return first && second ? [...first, ...second] : null;
  }
  // Sky Tether: "Enchanted creature has defender and loses flying": both in layer 6, by timestamp (CR 613.7).
  if ((m = /^has (defender|flying|haste|reach|vigilance) and loses (flying|first strike|trample|haste|vigilance|reach|defender|lifelink|deathtouch)$/.exec(rest)) && m[1] !== m[2]) {
    const [has, lost] = [parseKeywordList(m[1]!), parseKeywordList(m[2]!)];
    return has && lost ? [{ kind: "addKeywords", keywords: has }, { kind: "removeKeywords", keywords: lost }] : null;
  }
  if ((m = /^(?:has|have) (.+)$/.exec(rest))) return parseGrants(m[1]!);
  if (/^can block (?:an additional|any number|up to|\w+ additional)/.test(rest)) {
    const more = parseExtraBlocks(rest);
    return more && !/ this turn$/.test(rest) ? [more] : null;
  }
  if (/^can't attack or block$/.test(rest)) return [{ kind: "cantAttack" }, { kind: "cantBlock" }];
  // Bound by Moonsilver: "can't attack, block, or transform".
  if (/^can't attack, block, or transform$/.test(rest)) return [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantTransform" }];
  // Revoke Privileges: "can't attack, block, or crew Vehicles".
  if (/^can't attack, block, or crew Vehicles$/.test(rest)) return [{ kind: "cantAttack" }, { kind: "cantBlock" }, { kind: "cantCrew" }];
  // "Can't block and can't be blocked" (Changeling Outcast).
  if ((m = /^(can't [^,]+?) and (can't .+)$/.exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[2]!);
    return first && second ? [...first, ...second] : null;
  }
  // Goaded by the static's controller (CR 701.15a): "Enchanted creature ... is goaded".
  if (/^is goaded$/.test(rest)) return [{ kind: "goad" }];
  // CR 506.5: alone means the only creature declared as an attacker (or blocker) that combat.
  if (/^can't attack or block alone$/.test(rest)) return [{ kind: "cantAttackAlone" }, { kind: "cantBlockAlone" }];
  if (/^can't attack alone$/.test(rest)) return [{ kind: "cantAttackAlone" }];
  if (/^can only attack alone$/.test(rest)) return [{ kind: "onlyAttacksAlone" }];
  if (/^can't attack a player it has already attacked this turn$/.test(rest)) return [{ kind: "cantAttackSamePlayer" }];
  if (/^can't block alone$/.test(rest)) return [{ kind: "cantBlockAlone" }];
  if (/^must be blocked if able$/.test(rest)) return [{ kind: "mustBeBlocked" }];
  // "Each nonland permanent you control is all colors" (Leyline of the Guildpact): layer 5 (CR 105.2, 613.1e).
  if (/^(?:is|are) all colors$/.test(rest)) return [{ kind: "setColors", colors: ["W", "U", "B", "R", "G"] }];
  // Shifting Sky: "All nonland permanents are the chosen color": the color chosen as the source entered (CR 614.12),
  // replacing their colors (layer 5, CR 105.3).
  if (/^(?:is|are) the chosen color$/.test(rest)) return [{ kind: "setColors", colors: [], chosen: true }];
  // "Can't attack unless defending player controls an Island" (Sea Serpent), "... a Swamp", "... a blue permanent".
  if ((m = /^can't attack unless defending player controls (an? .+)$/.exec(rest))) {
    const filter = parseTargetPhrase(/^an enchantment or an enchanted permanent$/.test(m[1]!) ? m[1]! : m[1]!.replace(/^an? /, ""));
    return filter?.kind === "object" && !filter.controller ? [{ kind: "cantAttackUnless", defenderControls: { ...filter, text: m[1]! } }] : null;
  }
  // Vantress Gargoyle: "can't attack unless defending player has seven or more cards in their graveyard".
  if ((m = new RegExp(`^can't attack unless defending player has ${NUM} or more cards in their graveyard$`).exec(rest))) return [{ kind: "cantAttackUnlessDefenderYard", n: num(m[1]!) }];
  // Orcish Conscripts: "can't attack unless at least two other creatures attack", "can't block unless at least two other
  // creatures block": declared in the same combat (CR 508.1c, 509.1b).
  if ((m = new RegExp(`^can't (attack|block) unless at least ${NUM} other creatures (attack|block)$`).exec(rest)) && m[1] === m[3]) return [{ kind: m[1] === "attack" ? "cantAttackUnlessOthers" : "cantBlockUnlessOthers", n: num(m[2]!) }];
  // Scarred Puma: "can't attack unless a black or green creature also attacks": another one, declared with it (rulings,
  // CR 508.1c).
  if ((m = /^can't attack unless (an? .+) also attacks$/.exec(rest))) {
    const filter = parseTargetPhrase(m[1]!.replace(/^an? /, ""));
    return filter?.kind === "object" && !filter.controller && filter.types?.includes("Creature") ? [{ kind: "cantAttackUnlessAlso", filter: { ...filter, text: m[1]! } }] : null;
  }
  // Monstrous Hound, Mogg Toady: "can't attack unless you control more lands than defending player": the player it would
  // attack (CR 506.2), compared as attackers are declared.
  if ((m = /^can't attack unless you control more (lands|creatures) than defending player$/.exec(rest))) return [{ kind: "cantAttackUnlessMore", what: m[1] as "lands" | "creatures" }];
  // Mogg Jailer, Orgg: "can't attack if defending player controls an untapped creature with power 2 or less", whether or
  // not that creature could block (rulings).
  if ((m = /^can't attack if defending player controls (an? .+)$/.exec(rest))) {
    const filter = parseTargetPhrase(m[1]!.replace(/^an? /, ""));
    return filter?.kind === "object" && !filter.controller ? [{ kind: "cantAttackIf", defenderControls: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can't block$/.test(rest)) return [{ kind: "cantBlock" }];
  if (/^can't be attacked$/.test(rest)) return [{ kind: "cantBeAttacked" }];
  // The Aetherspark: "can't be attacked and has "Whenever equipped creature ...""
  if ((m = /^can't be attacked and has (.+)$/.exec(rest))) {
    const grants = parseGrants(m[1]!);
    return grants ? [{ kind: "cantBeAttacked" }, ...grants] : null;
  }
  // Sneaky Homunculus: "can't block or be blocked by creatures with power 2 or greater", the Spirit tokens of Avatar: "can't
  // block or be blocked by non-Spirit creatures": both restrictions (CR 509.1b).
  if ((m = /^can't block or be blocked by (.+)$/.exec(rest))) {
    const [a, b] = [parseStaticMods(`can't block ${m[1]}`), parseStaticMods(`can't be blocked by ${m[1]}`)];
    return a?.length === 1 && b?.length === 1 && a[0]!.kind === "cantBlockCreatures" && b[0]!.kind === "cantBeBlockedBy" ? [...a, ...b] : null;
  }
  // Spitfire Handler: an attacker's power compared with its own as blockers are declared (CR 509.1b).
  if (/^can't block creatures with power greater than ~'s power$/.test(rest)) return [{ kind: "cantBlockGreaterPower" }];
  // Ironclaw Curse: "can't block creatures with power equal to or greater than the enchanted creature's toughness", both as
  // blockers are declared (CR 509.1b).
  if (/^can't block creatures with power equal to or greater than the enchanted creature's toughness$/.test(rest)) return [{ kind: "cantBlockPowerAtLeastToughness" }];
  // "Cowards can't block Warriors" (Boldwyr Intimidator): a creature type (CR 509.1b, 205.3m).
  if ((m = /^can't block ([A-Z][a-z]+)$/.exec(rest))) {
    const one = singular(m[1]!);
    return one !== m[1] && CREATURE_TYPES.has(one) ? [{ kind: "cantBlockCreatures", filter: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: [one], text: m[1]! } }] : null;
  }
  // Spectral Grasp: "Enchanted creature can't block creatures you control": "you" is the Aura's controller (made concrete
  // in layers.ts), whoever controls the enchanted creature (CR 509.1b).
  if (rest === "can't block creatures you control") return [{ kind: "cantBlockCreatures", filter: { kind: "object", types: ["Creature"], controller: "you", text: "creatures you control" } }];
  // "Can't block creatures with power 2 or greater" (CR 509.1b).
  if ((m = /^can't block creatures with power (\d+) or (greater|less)$/.exec(rest))) {
    const filter = parseTargetPhrase(`creature with power ${m[1]} or ${m[2]}`);
    return filter?.kind === "object" && filter.power ? [{ kind: "cantBlockCreatures", filter: { ...filter, text: `creatures with power ${m[1]} or ${m[2]}` } }] : null;
  }
  // "Can't block black creatures" (Gibbering Hyenas), "can't block artifact creatures", "can't block creatures with flying",
  // "can't block white creatures with power 2 or greater" (Orcish Veteran): attackers it can't block (CR 509.1b).
  if ((m = /^can't block ((?:[a-z]+ |non-[A-Z][a-z]+ )*creatures(?: with .+)?)$/.exec(rest)) && !/\b(?:this turn|each combat|you control|your opponents control|alone)\b/.test(m[1]!)) {
    const [head, ...more] = m[1]!.split(/ (?=with )/);
    const filter = parseTargetPhrase([head!.split(" ").map(singular).join(" "), ...more].join(" "));
    return filter?.kind === "object" && !filter.controller && (filter.types?.includes("Creature") || filter.allTypes?.includes("Creature")) ? [{ kind: "cantBlockCreatures", filter: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can't attack$/.test(rest)) return [{ kind: "cantAttack" }];
  // "Creatures with flying can't attack you or planeswalkers you control" (Sandwurm Convergence, CR 508.1c): "you" is the
  // source's controller.
  if (/^can't attack you or planeswalkers you control$/.test(rest)) return [{ kind: "cantAttackYou" }];
  // Blazing Archon: "Creatures can't attack you": you, but not your planeswalkers (CR 508.1c).
  if (/^can't attack you$/.test(rest)) return [{ kind: "cantAttackYou", playerOnly: true }];
  if (/^can't attack its owner$/.test(rest)) return [{ kind: "cantAttackOwner" }];
  if (/^can't attack its owner or planeswalkers its owner controls$/.test(rest)) return [{ kind: "cantAttackOwner", planeswalkers: true }];
  // Xantcha: "attacks each combat if able and can't attack its owner or planeswalkers its owner controls".
  if ((m = /^(attacks each combat if able) and (can't .+)$/.exec(rest))) {
    const parts = [m[1]!, m[2]!].map((p) => parseStaticMods(p));
    return parts.every((p) => p) ? parts.flatMap((p) => p!) : null;
  }
  if (/^can't be sacrificed$/.test(rest)) return [{ kind: "cantBeSacrificed" }];
  // Goblin Brawler: "can't be equipped": no Equipment can become attached to it, and one that is becomes unattached (CR
  // 301.5c, 701.3b, 704.5n; rulings).
  if (/^can't be equipped$/.test(rest)) return [{ kind: "cantBeEquipped" }];
  if (/^can't be turned face up$/.test(rest)) return [{ kind: "cantTurnFaceUp" }];
  // Alexios: "attacks each combat if able, can't be sacrificed, and can't attack its owner".
  if ((m = /^((?:attacks each combat if able|can't [^,]+)), ((?:attacks each combat if able|can't [^,]+)),? and (attacks each combat if able|can't [^,]+)$/.exec(rest))) {
    const parts = [m[1]!, m[2]!, m[3]!].map((p) => parseStaticMods(p));
    return parts.every((p) => p) ? parts.flatMap((p) => p!) : null;
  }
  // Spellbane Centaur: "Creatures you control can't be the targets of blue spells or abilities from blue sources".
  if ((m = /^can't be the targets? of (.+)$/.exec(rest))) {
    const by = parseUntargetable(m[1]!);
    return by ? [{ kind: "untargetable", by }] : null;
  }
  if (/^can't be blocked$/.test(rest)) return [{ kind: "cantBeBlocked" }];
  if (/^can't be blocked by more than one creature$/.test(rest)) return [{ kind: "maxOneBlocker" }];
  if ((m = new RegExp(`^can't be blocked except by ${NUM} or more creatures$`).exec(rest)) && num(m[1]!) >= 2) return [{ kind: "minBlockers", n: num(m[1]!) }];
  // "Can't be blocked except by creatures with flying or reach", "... except by black creatures", "... except by
  // Walls and/or creatures with flying" (CR 509.1b).
  // "Can't be blocked except by Krakens, Leviathans, Octopuses, and Serpents" (Serpent of Yawning Depths): a creature of
  // any of those types.
  const typeList = /^can't be blocked except by ((?:[A-Z][a-z]+, )+and [A-Z][a-z]+)$/.exec(rest);
  if (typeList) {
    const subtypes = typeList[1]!.split(/, (?:and )?/).map(singular);
    return subtypes.every((t) => CREATURE_TYPES.has(t)) ? [{ kind: "blockableOnlyBy", filters: [{ kind: "object", types: ["Creature"], subtypes, text: typeList[1]! }], text: typeList[1]! }] : null;
  }
  if ((m = /^can't be blocked except by (.+)$/.exec(rest))) {
    const filters: TargetSpec[] = [];
    for (const part of m[1]!.split(" and/or ")) {
      const kw = /^creatures with (\w+) or (\w+)$/.exec(part);
      for (const p of kw ? [`creatures with ${kw[1]}`, `creatures with ${kw[2]}`] : [part]) {
        const [head, ...tail] = p.split(/ (?=with )/);
        const filter = parseTargetPhrase([head!.split(" ").map(singular).join(" "), ...tail].join(" "));
        if (filter?.kind !== "object" || filter.controller || filter.combat) return null;
        filters.push({ ...filter, text: p });
      }
    }
    return [{ kind: "blockableOnlyBy", filters, text: m[1]! }];
  }
  if (/^can't be blocked by creatures with greater power$/.test(rest)) return [{ kind: "cantBeBlockedByGreaterPower" }];
  // Temple Thief: "can't be blocked by enchanted creatures or enchantment creatures": by either kind.
  // Doorman: "can't be blocked by creatures with power 2 or less and/or Walls": by either kind, or one that's both.
  if ((m = /^can't be blocked by ([a-z]+ creatures|creatures with power \d+ or less) (?:or|and\/or) ([a-z]+ creatures|[A-Z][a-z]+s)$/.exec(rest))) {
    const [a, b] = [parseStaticMods(`can't be blocked by ${m[1]}`), parseStaticMods(`can't be blocked by ${m[2]}`)];
    return a?.length === 1 && b?.length === 1 && a[0]!.kind === "cantBeBlockedBy" && b[0]!.kind === "cantBeBlockedBy" ? [...a, ...b] : null;
  }
  // Azure Fleet Admiral: "can't be blocked by creatures the monarch controls" (CR 509.1b, 725).
  if (/^can't be blocked by creatures the monarch controls$/.test(rest)) return [{ kind: "cantBeBlockedBy", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], monarchControls: true, text: "creatures the monarch controls" } }];
  // Pompous Gadabout: "can't be blocked by creatures that don't have a name": face-down ones (CR 708.2, rulings), checked
  // as blockers are declared (CR 509.1b).
  if (/^can't be blocked by creatures that don't have a name$/.test(rest)) return [{ kind: "cantBeBlockedBy", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], faceDown: true, text: "creatures that don't have a name" } }];
  if ((m = /^can't be blocked by (.+)$/.exec(rest))) {
    // "creatures with power 2 or less", "Walls", "blue creatures", "artifact creatures" (CR 509.1b)
    // In the singular, as parseTargetPhrase reads it: "creature with power 2 or less", "Wall", "blue creature".
    // "Black and/or red creatures" (Sacred Knight): those that are either color, or both.
    const [head, ...rest] = m[1]!.replace(/^(white|blue|black|red|green) and\/or (white|blue|black|red|green) /, "$1 or $2 ").split(/ (?=with )/);
    const phrase = [head!.split(" ").map(singular).join(" "), ...rest].join(" ");
    const filter = parseTargetPhrase(phrase);
    return filter && filter.kind === "object" ? [{ kind: "cantBeBlockedBy", filter: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can block only creatures with flying$/.test(rest)) return [{ kind: "blocksOnlyFlyers" }];
  if (/^attacks? each combat if able$/.test(rest)) return [{ kind: "attacksIfAble" }];
  if (/^attacks? an opponent with the most life among your opponents each combat if able$/.test(rest)) return [{ kind: "mustAttackMostLife" }];
  // "Blocks each combat if able" (CR 509.1c): the same requirement as "blocks this turn if able", every turn. "Attacks or
  // blocks each combat if able" is both: one that changes sides after attacking must block too (Relentless Raptor rulings).
  if (/^blocks? each combat if able$/.test(rest)) return [{ kind: "mustBlock" }];
  if (/^attacks or blocks each combat if able$/.test(rest)) return [{ kind: "attacksIfAble" }, { kind: "mustBlock" }];
  if (/^(?:doesn't untap during (?:its controller's|your) untap step|don't untap during their controllers' untap steps)$/.test(rest)) return [{ kind: "doesntUntap" }];
  if (/^can't become suspected$/.test(rest)) return [{ kind: "cantBeSuspected" }];
  // Frozen in Ice, Blossombind: "can't become untapped": no effect or rule untaps it (see untapPermanent).
  if (/^can't become untapped$/.test(rest)) return [{ kind: "cantBecomeUntapped" }];
  if (/^loses? all abilities$/.test(rest)) return [{ kind: "loseAllAbilities" }];
  // Grounded: "Enchanted creature loses flying": in layer 6, by timestamp, so a later effect can give it back (CR 613.7).
  // Mystic Decree: "All creatures lose flying and islandwalk": both, the same way.
  if ((m = /^loses? (flying|first strike|trample|haste|vigilance|reach|defender|lifelink|deathtouch|infect|flying and islandwalk)$/.exec(rest))) {
    const k = parseKeywordList(m[1]!);
    return k ? [{ kind: "removeKeywords", keywords: k }] : null;
  }
  // Humility: "All creatures lose all abilities and have base power and toughness 1/1" (layers 6 and 7b, CR 613.1f,
  // 613.4b).
  if ((m = /^loses? all abilities and (?:has|have) base power and toughness (\d+)\/(\d+)$/.exec(rest))) return [{ kind: "loseAllAbilities" }, { kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) }];
  // The Archetypes: "Creatures your opponents control lose flying and can't have or gain flying": gone whatever gives it,
  // after every other layer 6 effect (rulings).
  if ((m = /^loses? ([a-z ,]+?) and can't have or gain ([a-z ,]+)$/.exec(rest))) {
    const k = parseKeywordList(m[1]!);
    const again = parseKeywordList(m[2]!.replace(/ or /g, " and "));
    if (!k || !again || JSON.stringify([...k].sort()) !== JSON.stringify([...again].sort())) return null;
    return [{ kind: "removeKeywords", keywords: k }, { kind: "cantHaveKeywords", keywords: k }];
  }
  // Doran (CR 510.1a as modified), defender (CR 702.3b).
  if (/^assigns? combat damage equal to (?:its|their) toughness rather than (?:its|their) power$/.test(rest)) return [{ kind: "assignsToughness" }];
  if (/^can attack as though (?:it|they) didn't have defender$/.test(rest)) return [{ kind: "attackDespiteDefender" }];
  if (/^can attack as though (?:it|they) had haste$/.test(rest)) return [{ kind: "attackAsThoughHaste" }];
  if (/^can block creatures with landwalk abilities as though they didn't have those abilities$/.test(rest)) return [{ kind: "blockAsThough", walk: true }];
  if (/^can block creatures with shadow as though (?:it|they) had shadow$/.test(rest)) return [{ kind: "blockAsThough", shadow: true }];
  if (/^can block creatures with shadow as though they didn't have shadow$/.test(rest)) return [{ kind: "blockAsThough", shadow: true, notShadow: true }];
  const reachVs = /^can block ([A-Z][a-z]+)s as though (?:it|they) had reach$/.exec(rest);
  if (reachVs && CREATURE_TYPES.has(reachVs[1]!)) return [{ kind: "blockAsThough", reachVs: reachVs[1]! }];
  if (/^can attack players who attacked you during their last turn as though it didn't have defender$/.test(rest)) return [{ kind: "attackDespiteDefender", vsAttackedYou: true }];
  // "Gets +0/+2 and assigns combat damage equal to its toughness ..." (Gauntlets of Light), "assigns ... and can attack
  // as though it didn't have defender" (Arcades).
  if ((m = new RegExp(`^(gets? ${PT}/${PT}|assigns? combat damage .+?) and (assigns? combat damage .+|can attack as though .+|can block creatures with .+)$`).exec(rest))) {
    const first = parseStaticMods(m[1]!);
    const second = parseStaticMods(m[4]!);
    return first && second ? [...first, ...second] : null;
  }
  return null;
}

export function parseStatic(line: string): StaticAbility | null {
  const st = parseStaticLine(line) ?? parseTransform(line);
  if (st) return lookBackGrant(st);

  // Glamdring: "Equipped creature has first strike and gets +1/+0 for each instant and sorcery card in your graveyard"
  // says the same as "gets ... and has first strike". So does Runechanter's Pike's "has first strike and gets +X/+0,
  // where X is ...".
  const m = /^(Equipped|Enchanted) creature has ([a-z]+(?: [a-z]+)?) and gets ([+-]\d+\/[+-]\d+ for each [^,"]+|[+-][\dX]+\/[+-][\dX]+)(, where X is [^"]+)?\.$/.exec(line);
  const swapped = m && (!m[4] === !/X/.test(m[3]!)) ? parseStaticLine(`${m[1]} creature gets ${m[3]} and has ${m[2]}${m[4] ?? ""}.`) : null;
  return swapped ? { ...swapped, text: line } : null;
}

/**
 * Auras and Equipment that turn what they're attached to into something else: "Enchanted creature loses all abilities
 * and is a blue Frog creature with base power and toughness 1/1" (Frogify), "... has base power and toughness 0/2, has
 * defender, and loses all other abilities" (Stasis Field), "is a colorless Forest land" (Song of the Dryads), "is a
 * Treasure artifact with "..." and it loses all other abilities" (Minimus Containment), "is a Turtle with base power and
 * toughness 0/1. It can't attack and loses all abilities." (Retro-Mutation). One effect, applied in each layer it has
 * parts in (CR 613.1-613.6): a new card type replaces the old ones but not supertypes (CR 205.1a), "artifact creature"
 * and "in addition to its other types" keep them (205.1b) unless the text says it loses the others, a creature type
 * alone replaces only creature types, and losing all abilities comes before what the same effect grants (layer 6).
 */
function parseTransform(line: string): StaticAbility | null {
  // The Zendikons: "Enchanted land is a 3/3 black Ooze creature. It's still a land." (Living Terrain: "... creature that's
  // still a land"): a creature in addition to its other types, keeping its land types (CR 205.1b, rulings); its color is
  // the one named instead of its others (CR 105.3).
  const still = /^(Enchanted land is an? [^."]+? creature(?: with [^."]+)?)(?:\. It's still a land| that's still a land)\.?$/.exec(line);
  if (still) {
    const st = parseTransform(`${still[1]} in addition to its other types`);
    return st && { ...st, mods: st.mods.map((m) => (m.kind === "addColors" ? { kind: "setColors", colors: m.colors } : m)), text: line };
  }
  const head = /^(Enchanted (?:creature|permanent|artifact|land)|Equipped creature) (.+)$/.exec(line.replace(/\.$/, ""));
  if (!head) return null;
  // "... with base power and toughness 1/1 named Legitimate Businessperson" (Witness Protection): its name too (layer 3).
  const named = /^(.+ is an? [^"]+?) named ([A-Z][A-Za-z' ,-]+)$/.exec(head[2]!);
  if (named) {
    const rest = parseTransform(`${head[1]} ${named[1]}`);
    return rest && { ...rest, mods: [{ kind: "setName", name: named[2]! }, ...rest.mods], text: line };
  }
  const quotes: string[] = [];
  const rest = head[2]!
    .replace(/"[^"]*"/g, (q) => `\u0001${quotes.push(q) - 1}\u0001`)
    .replace(/\. It /g, ", and ")
    .replace(/,? and it loses /g, ", and loses ");
  const clauses = rest.split(/,? and (?=(?:is|has|loses|can't|doesn't|gets) )|, (?=(?:is|has|loses|can't|doesn't|gets) )/).map((c) => c.replace(/\u0001(\d+)\u0001/g, (_, i) => quotes[Number(i)]!));
  const mods: Modification[] = [];
  const is: string[] = [];
  let only = false; // "loses all other card types": the new card types replace the old ones
  let changes = false;
  for (const c of clauses) {
    let m: RegExpExecArray | null;
    if (/^loses all (?:other )?abilities$/.test(c)) mods.push({ kind: "loseAllAbilities" });
    else if (/^loses all other card types$/.test(c)) only = true;
    else if (/^loses all other (?:card types and abilities|abilities, card types, and creature types)$/.test(c)) {
      only = true;
      mods.push({ kind: "loseAllAbilities" });
    } else if ((m = /^has base power and toughness (\d+)\/(\d+)$/.exec(c))) mods.push({ kind: "setPT", power: Number(m[1]), toughness: Number(m[2]) });
    else if ((m = /^is (.+)$/.exec(c)) && m[1] !== "goaded") {
      is.push(m[1]!);
      continue;
    } else {
      const more = parseStaticMods(c);
      if (!more) return null;
      mods.push(...more);
      continue;
    }
    changes = true;
  }
  for (const phrase of is) {
    const more = parseIsA(phrase, only);
    if (!more) return null;
    mods.push(...more);
    changes = true;
  }
  if (!changes || (only && !is.length)) return null;
  // Within layer 6, the loss comes first: "has indestructible, and it loses all other abilities" keeps indestructible.
  const lose = mods.filter((x) => x.kind === "loseAllAbilities").slice(0, 1);
  return { affects: { kind: "attached" }, mods: [...lose, ...mods.filter((x) => x.kind !== "loseAllAbilities")], text: line };
}

/**
 * After "is": "a blue Frog creature with base power and toughness 1/1", "an Insect artifact creature with base power and
 * toughness 0/1 and has indestructible", "a colorless land with "{T}: Add {C}"", "a black Dragon", "a blue Wall in
 * addition to its other colors and types". `only`: the text also says it loses its other card types.
 */
export function parseIsA(phrase: string, only: boolean): Modification[] | null {
  let m = /^an? (.+?)(?: in addition to its other (colors and )?types)?$/.exec(phrase);
  if (!m) return null;
  const addition = /in addition to its other/.test(phrase);
  const addColors = !!m[2];
  let rest = m[1]!;
  let pt: [number, number] | undefined;
  const grants: Modification[] = [];
  // "Is a 4/4 Gorgon creature with deathtouch": its base power and toughness (layer 7b, CR 613.4b).
  const lead = /^(\d+)\/(\d+) (.+ creature\b.*)$/.exec(rest);
  if (lead) {
    pt = [Number(lead[1]), Number(lead[2])];
    rest = lead[3]!;
  }
  if (lead && /with base power/.test(rest)) return null;
  if ((m = /^(.+?) with base power and toughness (\d+)\/(\d+)(?: and (?:has )?(.+))?$/.exec(rest))) {
    pt = [Number(m[2]), Number(m[3])];
    if (m[4]) {
      const g = parseGrants(m[4]);
      if (!g) return null;
      grants.push(...g);
    }
    rest = m[1]!;
  } else if ((m = /^(.+?) with (.+)$/.exec(rest))) {
    const g = parseGrants(m[2]!);
    if (!g) return null;
    grants.push(...g);
    rest = m[1]!;
  }
  const colors: Color[] = [];
  let colorless = false;
  const types: string[] = [];
  const subtypes: string[] = [];
  for (const w of rest.split(" ")) {
    const lw = w.toLowerCase();
    if (COLOR_WORDS[lw]) colors.push(COLOR_WORDS[lw]!);
    else if (lw === "colorless") colorless = true;
    else if (lw === "and") continue;
    else if (TYPE_WORDS[lw]) types.push(TYPE_WORDS[lw]!);
    else if (subtypeSet(w)) subtypes.push(w);
    else return null;
  }
  // A subtype needs the card type it goes with (CR 205.3d): "a Treasure artifact", not "a Treasure".
  const kinds = new Set(subtypes.map(subtypeSet));
  if (types.length && [...kinds].some((k) => !types.includes(k!))) return null;
  if (!types.length && !subtypes.length) return null;
  if (addition && (colorless || only)) return null;
  const out: Modification[] = [];
  if (addition) out.push({ kind: "addTypes", types, subtypes });
  else if (types.join(" ") === "Artifact Creature" && !only) {
    // "Is a Golem artifact creature" keeps its other card types and subtypes, its creature types aside (CR 205.1b).
    out.push({ kind: "addTypes", types, subtypes: subtypes.filter((st) => subtypeSet(st) !== "Creature") });
    if (subtypes.some((st) => subtypeSet(st) === "Creature")) out.push({ kind: "setSubtypes", subtypes: subtypes.filter((st) => subtypeSet(st) === "Creature") });
  } else if (types.length) out.push({ kind: "setTypes", types, subtypes });
  else out.push({ kind: "setSubtypes", subtypes });
  // A basic land type: it loses the abilities from its rules text and taps for that mana instead (CR 305.7).
  const basics = subtypes.filter((st) => BASIC_TYPES.includes(st));
  if (basics.length && !addition) out.push({ kind: "setLandTypes", subtypes: basics });
  if (colorless) out.push({ kind: "setColors", colors: [] });
  else if (colors.length) out.push(addColors ? { kind: "addColors", colors } : addition ? { kind: "addColors", colors } : { kind: "setColors", colors });
  if (pt) out.push({ kind: "setPT", power: pt[0], toughness: pt[1] });
  return [...out, ...grants];
}

function parseStaticLine(line: string): StaticAbility | null {
  // Song of Serenity: "Creatures that are enchanted can't attack or block" is about enchanted creatures.
  let text = line.replace(/\.$/, "").replace(/^Creatures that are enchanted (?=can't )/, "Enchanted creatures ");
  // Animate Wall: "Enchanted Wall can attack as though it didn't have defender": its "Enchant Wall" keeps it on a Wall, a
  // creature type (CR 205.3d, 303.4c), so it's the enchanted creature.
  text = text.replace(/^Enchanted Wall (?=can attack as though it didn't have defender$)/, "Enchanted creature ");
  // Lifecraft Engine: "Each creature you control of the chosen type other than ~ gets +1/+1": the other ones.
  text = text.replace(/^Each creature you control of the chosen type other than ~ (gets .+)$/, "Other creatures you control of the chosen type $1").replace(/^(Other creatures you control of the chosen type) gets /, "$1 get ");
  // Katilda's Rising Dawn: "Enchanted creature has flying, lifelink, and protection from Vampires, and it gets +X/+X,
  // where X is ...": the same as "gets +X/+X and has ..., where X is ...".
  text = text.replace(/^(Enchanted creature) (has [^"]+?), and it (gets [+-]X\/[+-]X)(, where X is .+)$/, "$1 $3 and $2$4");
  // Earth Surge: "Each land gets +2/+2 as long as it's a creature": land creatures, which ones worked out as the effect
  // applies in layer 7c (CR 613.4c), so lands animated earlier are included.
  const landSurge = /^Each land (gets [+-]\d+\/[+-]\d+) as long as it's a creature$/.exec(text);
  if (landSurge) {
    const st = parseStaticLine(`Land creatures ${landSurge[1]}.`);
    return st && !st.condition ? { ...st, text: line } : null;
  }
  // Depala, Pilot Exemplar: "Each Vehicle you control gets +1/+1 as long as it's a creature": Vehicle creatures (crewed,
  // CR 301.7b), worked out as the bonus applies in layer 7c (CR 613.4c).
  const vehicleSurge = /^Each Vehicle you control gets ([+-]\d+)\/([+-]\d+) as long as it's a creature$/.exec(text);
  if (vehicleSurge)
    return { affects: { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], subtypes: ["Vehicle"], text: "Vehicle creature you control" } }, mods: [{ kind: "modifyPT", power: Number(vehicleSurge[1]), toughness: Number(vehicleSurge[2]) }], text: line };
  const lands = parseLandTypeStatic(text, line);
  if (lands) return lands;
  // Toxicrene: "All lands have "{T}: Add one mana of any color" and lose all other abilities": in layer 6 the loss comes
  // first, so the ability given is kept (CR 613.1f); type-changing effects came before it (layer 4, rulings).
  const loseOthers = /^(All lands) have ("[^"]+") and lose all other abilities$/.exec(text);
  if (loseOthers) {
    const st = parseStaticLine(`${loseOthers[1]} have ${loseOthers[2]}.`);
    if (!st || st.condition || st.mods.length !== 1 || st.mods[0]!.kind !== "addAbility") return null;
    return { ...st, mods: [{ kind: "loseAllAbilities" }, ...st.mods], text: line };
  }
  // "Enchanted land is snow" (Glittering Frost), "Permanents with ice counters on them are snow" (Rimefeather Owl): the
  // snow supertype added in the type-changing layer (CR 205.4a, 613.1d).
  const snow = { kind: "addTypes" as const, types: [], subtypes: [], supertypes: ["Snow"] };
  if (/^Enchanted (?:land|permanent) is snow$/.test(text)) return { affects: { kind: "attached" }, mods: [snow], text: line };
  // On Serra's Wings: "Enchanted creature is legendary, gets +1/+1, and has flying, ...": the legendary supertype added
  // in the type-changing layer (CR 205.4a, 613.1d), with the rest of the line's bonuses.
  const legendaryAura = /^Enchanted creature is legendary, (gets [^,]+), and (has .+)$/.exec(text);
  if (legendaryAura) {
    const rest = parseStaticLine(`Enchanted creature ${legendaryAura[1]} and ${legendaryAura[2]}.`);
    return rest && rest.affects.kind === "attached" && !rest.condition ? { ...rest, mods: [{ kind: "addTypes", types: [], subtypes: [], supertypes: ["Legendary"] }, ...rest.mods], text: line } : null;
  }
  // In Bolas's Clutches: "Enchanted permanent is legendary"; Leyline of Singularity: "All nonland permanents are legendary"
  // (layer 4, CR 205.4a, 613.1d), so the legend rule applies to them (CR 704.5j).
  const legendary = { kind: "addTypes" as const, types: [], subtypes: [], supertypes: ["Legendary"] };
  if (/^Enchanted (?:creature|permanent) is legendary$/.test(text)) return { affects: { kind: "attached" }, mods: [legendary], text: line };
  if (text === "All nonland permanents are legendary") return { affects: { kind: "filter", types: [], spec: { kind: "object", notTypes: ["Land"], text: "nonland permanent" } }, mods: [legendary], text: line };
  // Unable to Scream: "As long as enchanted creature is face down, it can't be turned face up." Only a face-down
  // permanent can be turned face up (CR 702.37e, 701.40b), so it's the same as having it always.
  if (text === "As long as enchanted creature is face down, it can't be turned face up") return { affects: { kind: "attached" }, mods: [{ kind: "cantTurnFaceUp" }], text: line };
  // "Enchanted creature is goaded" (The Sound of Drums): by the Aura's controller, for as long as it's attached (CR 701.15a).
  if (/^Enchanted creature is goaded$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "goad" }], text: line };
  // Duplicant: its imprint exile is linked to this ability (CR 607.2a, see linkExile).
  if (/^As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it\. It's still a Shapeshifter$/.test(text))
    return { affects: { kind: "self" }, mods: [{ kind: "linkedCreature", part: "types" }, { kind: "linkedCreature", part: "pt" }], text: line };
  // "This creature is the chosen type in addition to its other types" (Metallic Mimic, Roaming Throne): the creature type
  // chosen as it entered, added in the type-changing layer (CR 613.1d).
  // "This creature is the chosen color. (It's still an artifact.)" (Alloy Golem), "Enchanted land is the chosen color"
  // (Shimmerwilds Growth): the color chosen as it entered replaces its colors (layer 5, CR 105.3, 613.1e).
  const chosenColor = /^(~|Enchanted land) is the chosen color$/.exec(text);
  if (chosenColor) return { affects: chosenColor[1] === "~" ? { kind: "self" } : { kind: "attached" }, mods: [{ kind: "setColors", colors: [], chosen: true }], text: line };
  if (/^~ is the chosen type in addition to its other types$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenType: true }], text: line };
  // Opalescence: "Each other non-Aura enchantment is a creature in addition to its other types and has base power and base
  // toughness each equal to its mana value" (Starfield of Nyx: "... you control"); March of the Machines: "Each
  // noncreature artifact is an artifact creature with power and toughness each equal to its mana value". The set is
  // fixed once the effect applies in layer 4, so they stay creatures for layer 7b (CR 613.6).
  const animate = /^([Ee]ach (other )?non-Aura enchantment( you control)?|[Ee]ach noncreature artifact) (is .+ equal to its mana value)$/.exec(text);
  if (animate) {
    const mods = parseStaticMods(animate[4]!);
    if (!mods) return null;
    const ench = !animate[1]!.endsWith("artifact");
    const spec: TargetSpec = ench ? { kind: "object", types: ["Enchantment"], notSubtypes: ["Aura"], text: "non-Aura enchantment" } : { kind: "object", types: ["Artifact"], notTypes: ["Creature"], text: "noncreature artifact" };
    return { affects: { kind: "filter", types: [ench ? "Enchantment" : "Artifact"], spec, ...(animate[2] ? { other: true } : {}), ...(animate[3] ? { controller: "you" as const } : {}) }, mods, text: line };
  }
  // Bello, Bard of the Brambles: "each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or
  // greater is a 4/4 Elemental creature in addition to its other types and has ...": the group as the effect applies in
  // layer 4, the same set for 6 and 7b (CR 613.6).
  const animated = /^([Ee]ach (?:non-[A-Z][a-z]+ |non)?[a-z]+(?: and (?:non-[A-Z][a-z]+ |non)?[a-z]+)? you control(?: with mana value \d+ or greater)?) (is an? \d+\/\d+ (?:[A-Z][a-z]+ )?creature in addition to its other types.*)$/.exec(text);
  if (animated) {
    const affects = parseAffected(animated[1]!);
    const mods = parseStaticMods(animated[2]!);
    if (affects?.kind !== "filter" || !mods) return null;
    return { affects, mods, text: line };
  }
  // Maskwood Nexus ("Creatures you control are every creature type"), Arcane Adaptation and Xenograft ("... the chosen type
  // in addition to their other types"), Conspiracy ("... the chosen type": it replaces their creature types, rulings):
  // layer 4 (CR 613.1d, 205.1b). "The same is true for creature spells you control and creature cards you own that
  // aren't on the battlefield" makes it apply there too (StaticAbility.offField).
  const typing = /^(Creatures you control are|Each creature you control is|Slivers you control and nontoken creatures you control are) (every creature type|the chosen type( in addition to (?:their|its) other (?:creature )?types)?)(\. The same is true for creature spells you control and creature cards you own that aren't on the battlefield)?$/.exec(text);
  if (typing) {
    const mod: Modification = typing[2] === "every creature type" ? { kind: "addTypes", types: [], subtypes: [], allCreatureTypes: true } : typing[3] ? { kind: "addTypes", types: [], subtypes: [], chosenType: true } : { kind: "setSubtypes", subtypes: [], chosenType: true };
    // Rukarumel: Slivers, and nontoken creatures (CR 205.3m: a Sliver is a creature type, so a Sliver permanent here is a creature).
    const spec: TargetSpec | undefined = typing[1]!.startsWith("Slivers") ? { kind: "object", anyOf: [{ kind: "object", subtypes: ["Sliver"], text: "Sliver" }, { kind: "object", token: false, text: "nontoken creature" }], text: "Sliver or nontoken creature" } : undefined;
    return { affects: { kind: "filter", types: ["Creature"], controller: "you", ...(spec ? { spec } : {}) }, mods: [mod], text: line, ...(typing[4] ? { offField: true as const } : {}) };
  }
  // Lifecraft Engine: "Vehicle creatures you control are the chosen creature type in addition to their other types": a
  // Vehicle while it's a creature (crewed, CR 301.7b), which the layer 4 dependency on its crew effect sees (CR 613.8a).
  if (/^Vehicle creatures you control are the chosen creature type in addition to their other types$/.test(text))
    return { affects: { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], subtypes: ["Vehicle"], text: "Vehicle creature you control" } }, mods: [{ kind: "addTypes", types: [], subtypes: [], chosenType: true }], text: line };
  // Laughing Jasper Flint: "Creatures you control but don't own are Mercenaries in addition to their other types" (layer 4,
  // CR 613.1d; who controls them is settled in layer 2 first).
  const notOwned = /^Creatures you control but don't own are ([A-Z][a-z]+) in addition to their other types$/.exec(text);
  if (notOwned) {
    const type = singular(notOwned[1]!);
    if (!CREATURE_TYPES.has(type)) return null;
    return { affects: { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], owner: "opponent", text: "creature you control but don't own" } }, mods: [{ kind: "addTypes", types: [], subtypes: [type] }], text: line };
  }
  // Dralnu's Crusade: "All Goblins are black and are Zombies in addition to their other creature types": the creature
  // type in layer 4 and that color instead of their others in layer 5 (CR 105.3, 205.1b, 613.1d-e; rulings), for the
  // same group in both (CR 613.6).
  const colorAndType = /^(All [A-Z][a-z]+s) are (white|blue|black|red|green) and are ([A-Z][a-z]+)s in addition to their other creature types$/.exec(text);
  const colorAndTypeAffects = colorAndType && parseAffected(colorAndType[1]!);
  if (colorAndType && colorAndTypeAffects?.kind === "filter" && CREATURE_TYPES.has(colorAndType[3]!))
    return { affects: colorAndTypeAffects, mods: [{ kind: "addTypes", types: [], subtypes: [colorAndType[3]!] }, { kind: "setColors", colors: [COLOR_WORDS[colorAndType[2]!]!] }], text: line };
  // Hivestone: "Creatures you control are Slivers in addition to their other creature types"; Earl of Squirrel: "Creature
  // tokens you control are Squirrels ...": a creature type added in layer 4 (CR 205.1b, 613.1d), to whichever creatures
  // are in the group then.
  // Arterial Alchemy: "Blood tokens you control are Equipment in addition to their other types and have "Equipped creature
  // gets +2/+0" and equip {2}"; Senator Peacock: "Artifacts you control are Clues ... and have "..."": an artifact type
  // for artifacts only (CR 205.3d), added in layer 4, and the abilities in layer 6 (CR 613.1d, 613.1f). An Equipment
  // that's also a creature can't be attached (CR 301.5c); one that stops being an Equipment becomes unattached (704.5p).
  const artifactType = /^(.+?) are ([A-Z][a-z]+?)s? in addition to their other types and (have .+)$/.exec(text);
  const artifactTypeAffects = artifactType && parseAffected(artifactType[1]!);
  if (artifactType && artifactTypeAffects?.kind === "filter" && artifactTypeAffects.spec && !artifactTypeAffects.spec.many) {
    const spec = artifactTypeAffects.spec;
    const sub = artifactType[2] === "Equipment" ? "Equipment" : artifactType[2]!;
    const artifactsOnly = (spec.types?.length === 1 && spec.types[0] === "Artifact") || (!spec.types?.length && !!spec.subtypes?.length && spec.subtypes.every((t) => subtypeSet(t) === "Artifact"));
    const more = parseStaticMods(artifactType[3]!);
    if (subtypeSet(sub) === "Artifact" && artifactsOnly && more) return { affects: artifactTypeAffects, mods: [{ kind: "addTypes", types: [], subtypes: [sub] }, ...more], text: line };
  }
  // Dune Chanter: "Lands you control and land cards you own that aren't on the battlefield are Deserts in addition to
  // their other types": a land type (CR 205.3i) for its controller's lands, and their land cards elsewhere too
  // (StaticAbility.offFieldLands; CR 613.1d).
  const landsAlso = /^Lands you control and land cards you own that aren't on the battlefield are ([A-Z][a-z]+)s in addition to their other types$/.exec(text);
  if (landsAlso) {
    if (subtypeSet(landsAlso[1]!) !== "Land") return null;
    return { affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: [], subtypes: [landsAlso[1]!] }], text: line, offFieldLands: true };
  }
  // Roshan, Hidden Magister: "Other creatures you control are Assassins in addition to their other types. The same is true
  // for creature spells you control and creature cards you own that aren't on the battlefield": outside the battlefield
  // too (StaticAbility.offField; CR 613.1d), as for Maskwood Nexus.
  const areAlso = /^(.+?) are ([A-Z][a-z]+) in addition to their other (?:creature )?types(\. The same is true for creature spells you control and creature cards you own that aren't on the battlefield)?$/.exec(text);
  const areAlsoAffects = areAlso && / have | and /.test(areAlso[1]!) ? null : areAlso && parseAffected(areAlso[1]!);
  if (areAlso && areAlsoAffects?.kind === "filter" && areAlsoAffects.types.includes("Creature") && !/ cards? /.test(areAlso[1]!)) {
    const type = singular(areAlso[2]!);
    if (!CREATURE_TYPES.has(type)) return null;
    if (areAlso[3] && (areAlsoAffects.controller !== "you" || !/^(?:Other )?creatures you control$/i.test(areAlso[1]!))) return null;
    return { affects: areAlsoAffects, mods: [{ kind: "addTypes", types: [], subtypes: [type] }], text: line, ...(areAlso[3] ? { offField: true as const } : {}) };
  }
  // Mephidross Vampire: "Each creature you control is a Vampire in addition to its other creature types and has
  // "Whenever this creature deals damage to a creature, put a +1/+1 counter on this creature."": layers 4 and 6, for
  // the same creatures (CR 613.6), this one too.
  const eachIsAndHas = /^Each creature you control is an? ([A-Z][a-z]+) in addition to its other creature types and has (.+)$/.exec(text);
  if (eachIsAndHas) {
    const affects = parseAffected("Creatures you control");
    const more = parseStaticMods(`has ${eachIsAndHas[2]!}`);
    if (affects?.kind !== "filter" || !more?.length || !CREATURE_TYPES.has(eachIsAndHas[1]!)) return null;
    return { affects, mods: [{ kind: "addTypes", types: [], subtypes: [eachIsAndHas[1]!] }, ...more], text: line };
  }
  // Don Andres, the Renegade: "Each creature you control but don't own gets +2/+2, has menace and deathtouch, and is a
  // Pirate in addition to its other types": layers 4, 6 and 7c, all for the creatures it controls then (layer 2 first).
  const notOwnedMore = /^Each creature you control but don't own (gets [+-]\d+\/[+-]\d+), has ([a-z ]+?),? and is an? ([A-Z][a-z]+) in addition to its other types$/.exec(text);
  if (notOwnedMore) {
    const mods = parseStaticMods(`${notOwnedMore[1]} and has ${notOwnedMore[2]}`);
    if (!mods || !CREATURE_TYPES.has(notOwnedMore[3]!)) return null;
    return { affects: { kind: "filter", types: ["Creature"], controller: "you", spec: { kind: "object", types: ["Creature"], owner: "opponent", text: "creature you control but don't own" } }, mods: [...mods, { kind: "addTypes", types: [], subtypes: [notOwnedMore[3]!] }], text: line };
  }
  // Ashaya: "Nontoken creatures you control are Forest lands in addition to their other types" (layer 4, CR 613.1d): a
  // Forest has "{T}: Add {G}" (CR 305.6), still affected by summoning sickness (CR 302.6). Toph: "Nontoken artifacts you
  // control are lands in addition to their other types" (no land type, so no mana ability).
  const becomeLands = /^Nontoken (creatures|artifacts) you control are (?:(Plains|Island|Swamp|Mountain|Forest) )?lands in addition to their other types$/.exec(text);
  if (becomeLands) {
    const type = becomeLands[1] === "creatures" ? "Creature" : "Artifact";
    return { affects: { kind: "filter", types: [type], controller: "you", spec: { kind: "object", types: [type], token: false, text: `nontoken ${becomeLands[1]!.slice(0, -1)}` } }, mods: [{ kind: "addTypes", types: ["Land"], subtypes: becomeLands[2] ? [becomeLands[2]] : [] }], text: line };
  }
  // Secret Arcade: "Nonland permanents you control and permanent spells you control are enchantments in addition to their
  // other types" (layer 4, CR 613.1d): its controller's permanent spells on the stack too (offFieldSpells), not their
  // cards elsewhere.
  if (/^Nonland permanents you control and permanent spells you control are enchantments in addition to their other types$/.test(text))
    return { affects: { kind: "filter", types: [], controller: "you", spec: { kind: "object", notTypes: ["Land"], text: "nonland permanent" } }, mods: [{ kind: "addTypes", types: ["Enchantment"], subtypes: [] }], text: line, offFieldSpells: true };
  // Mycosynth Lattice: "All permanents are artifacts in addition to their other types" (layer 4), "All cards that aren't on
  // the battlefield, spells, and permanents are colorless" (layer 5, everywhere: offFieldAll); Thran Lens: "All
  // permanents are colorless".
  // Nature's Revolt: "All lands are 2/2 creatures that are still lands"; Living Lands: "All Forests are 1/1 creatures that
  // are still lands": creatures in addition to their other types (layer 4, CR 205.1b), base power and toughness in 7b,
  // the same set of permanents for both (CR 613.6).
  // Kormus Bell: "All Swamps are 1/1 black creatures ..."; Ambush Commander: "Forests you control are 1/1 green Elf
  // creatures ...".
  const landsAre = /^(?:All (lands|Plains|Islands|Swamps|Mountains|Forests)|(Plains|Islands|Swamps|Mountains|Forests) you control) (are \d+\/\d+ (?:[a-z]+ )?(?:[A-Z][a-z]+ )?creatures that are still lands)$/.exec(text);
  if (landsAre) {
    const mods = parseStaticMods(landsAre[3]!);
    const which = landsAre[1] ?? landsAre[2]!;
    const sub = which === "lands" ? undefined : which === "Plains" ? "Plains" : which.slice(0, -1);
    return mods ? { affects: { kind: "filter", types: ["Land"], ...(landsAre[2] ? { controller: "you" as const } : {}), ...(sub ? { spec: { kind: "object", types: ["Land"], subtypes: [sub], text: sub } } : {}) }, mods, text: line } : null;
  }
  // Natural Emergence: "Lands you control are 2/2 creatures with first strike. They're still lands.": the same, with the
  // keyword in layer 6.
  const emergence = /^Lands you control are (\d+)\/(\d+) creatures with ([a-z ]+)\. They're still lands$/.exec(text);
  if (emergence) {
    const kws = parseKeywordList(emergence[3]!);
    if (!kws) return null;
    return { affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: Number(emergence[1]), toughness: Number(emergence[2]) }, { kind: "addKeywords", keywords: kws }], text: line };
  }
  if (/^All permanents are artifacts in addition to their other types$/.test(text)) return { affects: { kind: "filter", types: [] }, mods: [{ kind: "addTypes", types: ["Artifact"], subtypes: [] }], text: line };
  // Darkest Hour: "All creatures are black": that color instead of their others, in layer 5 (CR 105.3, 613.1e).
  const allColor = /^All creatures are (white|blue|black|red|green)$/.exec(text);
  if (allColor) return { affects: { kind: "filter", types: ["Creature"] }, mods: [{ kind: "setColors", colors: [COLOR_WORDS[allColor[1]!]!] }], text: line };
  // Ghostflame Sliver: "All Slivers are colorless": every permanent with that creature type, in layer 5.
  if (/^All Slivers are colorless$/.test(text)) return { affects: { kind: "filter", types: [], spec: { kind: "object", types: [], notTypes: [], notColors: [], subtypes: ["Sliver"], text: "all slivers" } }, mods: [{ kind: "setColors", colors: [] }], text: line };
  if (/^All permanents are colorless$/.test(text)) return { affects: { kind: "filter", types: [] }, mods: [{ kind: "setColors", colors: [] }], text: line };
  if (/^All cards that aren't on the battlefield, spells, and permanents are colorless$/.test(text)) return { affects: { kind: "filter", types: [] }, mods: [{ kind: "setColors", colors: [] }], text: line, offFieldAll: true };
  // Melting: "All lands are no longer snow": the supertype goes in layer 4 (CR 205.4a), lands that become snow later too.
  if (/^All lands are no longer snow$/.test(text)) return { affects: { kind: "filter", types: ["Land"] }, mods: [{ kind: "loseTypes", types: ["Snow"] }], text: line };
  if (/^Permanents with ice counters on them are snow$/.test(text)) return { affects: { kind: "filter", types: [], spec: { kind: "object", counter: "ice", text: "permanent with an ice counter on it" } }, mods: [snow], text: line };
  // Null Rod: "Activated abilities of artifacts can't be activated", mana abilities too (CR 605.1a); only permanents'.
  const silenced = /^Activated abilities of (.+?) can't be activated( unless they're mana abilities)?$/.exec(text);
  if (silenced) {
    const affects = parseAffected(silenced[1]!.replace(/^./, (c) => c.toUpperCase()));
    return affects && affects.kind === "filter" ? { affects, mods: [{ kind: "cantActivate", ...(silenced[2] ? { exceptMana: true as const } : {}) }], text: line } : null;
  }
  const noAbilities = /^Enchanted (creature|permanent|artifact|land)'s activated abilities can't be activated( unless they're mana abilities)?$/.exec(text);
  if (noAbilities) return { affects: { kind: "attached" }, mods: [{ kind: "cantActivate", ...(noAbilities[2] ? { exceptMana: true as const } : {}) }], text: line };
  // "You control enchanted creature." (Mind Control), "... enchanted artifact creature." (Domineer)
  if (/^You control enchanted (creature|permanent|artifact|land|enchantment|artifact creature)$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "control" }], text: line };
  // Ghostly Prison, Propaganda (CR 508.1g-h).
  // Sphere of Safety: "you or planeswalkers you control ... {X} for each of those creatures, where X is ...", counted now.
  const tax = /^Creatures can't attack you( or planeswalkers you control)? unless their controller pays \{(\d+|X)\} for each (?:creature they control that's attacking you|of those creatures)(?:, where X is (.+))?$/.exec(text);
  if (tax) {
    if ((tax[2] === "X") !== !!tax[3]) return null;
    const amount = tax[3] ? parseCount(tax[3], null) : null;
    if (tax[3] && !amount) return null;
    return { affects: { kind: "self" }, mods: [{ kind: "attackTax", n: amount ? 0 : Number(tax[2]), ...(amount ? { amount } : {}), ...(tax[1] ? { planeswalkers: true as const } : {}) }], text: line };
  }
  // Brainwash: "Enchanted creature can't attack unless its controller pays {3}"; Phyrexian Marauder: "~ can't attack unless
  // you pay {1} for each +1/+1 counter on it": paid as attackers are declared, whoever it attacks (CR 508.1g-h).
  // Qal Sisma Behemoth: "~ can't attack or block unless you pay {2}"; Oppressive Rays: "Enchanted creature can't attack or
  // block unless its controller pays {3}"; Myr Prototype: "... {1} for each +1/+1 counter on it"; Cowed by Wisdom: "...
  // {1} for each card in your hand" (the Aura's controller's hand, counted as the cost is worked out): blocking costs it
  // too, paid as blockers are declared (CR 509.1d-e).
  const ownTax = /^(Enchanted creature|~) can't attack( or block)? unless (?:its controller pays|you pay) \{(\d+)\}( for each \+1\/\+1 counter on it| for each card in your hand)?$/.exec(text);
  if (ownTax && (ownTax[1] === "~" ? / you pay /.test(text) : / its controller pays /.test(text)) && (ownTax[4] !== " for each card in your hand" || ownTax[1] !== "~")) {
    const per = ownTax[4] === " for each +1/+1 counter on it" ? { perPlusOne: true as const } : ownTax[4] ? { amount: { count: { kind: "cardsInHand", who: { ref: "you" } } } as Amount } : {};
    const n = Number(ownTax[3]);
    return { affects: { kind: ownTax[1] === "~" ? "self" : "attached" }, mods: [{ kind: "ownAttackTax", n, ...per }, ...(ownTax[2] ? [{ kind: "ownBlockTax" as const, n, ...per }] : [])], text: line };
  }
  // Exalted Dragon: "~ can't attack unless you sacrifice a land"; Leviathan: "... unless you sacrifice two Islands";
  // Floodtide Serpent: "... unless you return an enchantment you control to its owner's hand": costs to attack, paid as
  // attackers are declared (CR 508.1g-i), with permanents of yours.
  const ownCost = /^~ can't attack unless you (sacrifice|return) (an?|two|three) (.+?)( you control to its owner's hand)?$/.exec(text);
  if (ownCost && (ownCost[1] === "return") === !!ownCost[4]) {
    const n = /^an?$/.test(ownCost[2]!) ? 1 : num(ownCost[2]!);
    const spec = parseTargetPhrase(n === 1 ? ownCost[3]! : ownCost[3]!.replace(/s$/, ""));
    if (spec?.kind !== "object" || spec.controller || !n) return null;
    const filter: TargetSpec = { ...spec, controller: "you", text: n === 1 ? ownCost[3]! : ownCost[3]!.replace(/s$/, "") };
    return { affects: { kind: "self" }, mods: [{ kind: "ownAttackCost", action: ownCost[1] === "return" ? "bounce" : "sacrifice", filter, n }], text: line };
  }
  // Nils, Discipline Enforcer: each creature with counters on it, {X} for it (CR 508.1g-h), X all its counters (rulings).
  const counterTax = /^Each creature with one or more counters on it can't attack you( or planeswalkers you control)? unless its controller pays \{X\}, where X is the number of counters on that creature$/.exec(text);
  if (counterTax) return { affects: { kind: "self" }, mods: [{ kind: "attackTax", n: 0, perCounter: true, ...(counterTax[1] ? { planeswalkers: true as const } : {}) }], text: line };
  // Archangel of Tithes (as long as it's attacking): each blocking creature costs its controller {1} (CR 509.1d).
  const blockTax = /^Creatures can't block unless their controller pays \{(\d+)\} for each of those creatures$/.exec(text);
  if (blockTax) return { affects: { kind: "self" }, mods: [{ kind: "blockTax", n: Number(blockTax[1]) }], text: line };
  // Norn's Annex: a Phyrexian symbol per creature, its color or 2 life (CR 107.4f).
  const phyTax = /^Creatures can't attack you( or planeswalkers you control)? unless their controller pays (\{[WUBRG]\/P\}) for each of those creatures$/.exec(text);
  if (phyTax) return { affects: { kind: "self" }, mods: [{ kind: "attackTax", n: 0, mana: phyTax[2]!, ...(phyTax[1] ? { planeswalkers: true as const } : {}) }], text: line };
  // "Untap ~ during each other player's untap step", "Untap all permanents you control during ..." (Seedborn Muse):
  // they untap with the active player's permanents (CR 502.3); "doesn't untap during your untap step" doesn't apply.
  // "During each opponent's untap step" (Teferi, Who Slows the Sunset's emblem): every other player is an opponent in a
  // free-for-all game (CR 102.3), so the same.
  const untaps = /^Untap (~|all (.+?) you control|each (.+? you control(?: with .+)?)) during each (?:other player's|opponent's) untap step$/.exec(text);
  if (untaps) {
    // "All green and/or blue creatures you control" (Murkfiend Liege): either color, or both.
    const all = untaps[2]?.replace(/^(\w+) and\/or (\w+) /, "$1 or $2 ");
    const affects = untaps[1] === "~" ? { kind: "self" as const } : parseAffected(all ? `${all.charAt(0).toUpperCase()}${all.slice(1)} you control` : `Each ${untaps[3]}`);
    if (!affects || (affects.kind === "filter" && affects.controller !== "you" && affects.spec?.controller !== "you")) return null;
    return { affects, mods: [{ kind: "untapsDuringOthers" }], text: line };
  }
  // Prevention (CR 615.1): "Prevent all combat damage that would be dealt to ~", "Prevent all damage that would be dealt
  // by enchanted creature", "... to and dealt by enchanted creature", "... to ~ by creatures".
  // "Damage that would be dealt by ~ can't be prevented" (Excruciator), "Combat damage that would be dealt by creatures
  // you control can't be prevented" (Questing Beast), "Combat damage can't be prevented" (Frenzied Baloth): only
  // creatures deal combat damage (CR 510.1), so that's all creatures' (CR 615.12).
  const unprev = /^(Combat d|D)amage that would be dealt by (.+) can't be prevented$/.exec(text) ?? (/^Combat damage can't be prevented$/.test(text) ? ["", "Combat d", "creatures"] : null);
  if (unprev) {
    const affects = unprev[2] === "~" ? ({ kind: "self" } as const) : parseAffected(capital(unprev[2]!));
    return affects ? { affects, mods: [{ kind: "unpreventable", ...(unprev[1] === "Combat d" ? { combat: true as const } : {}) }], text: line } : null;
  }
  const damageMod = parseDamageMod(line);
  if (damageMod) return damageMod;
  // Vigor: "If damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter on that
  // creature for each 1 damage prevented this way." A prevention effect with an additional effect (CR 615.5).
  const vigor = /^If damage would be dealt to (another creature you control|other creatures you control), prevent that damage\. Put a \+1\/\+1 counter on that creature for each 1 damage prevented this way$/.exec(text);
  if (vigor) return { affects: { kind: "filter", types: ["Creature"], controller: "you", other: true }, mods: [{ kind: "preventDamage", to: true, plusOnes: true }], text: line };
  // Anti-Venom, Horrifying Healer: "If damage would be dealt to ~, prevent that damage and put that many +1/+1 counters on
  // ~": that damage's amount, so also when it can't be prevented (then it's dealt too, CR 615.12).
  if (text === "If damage would be dealt to ~, prevent that damage and put that many +1/+1 counters on ~") return { affects: { kind: "self" }, mods: [{ kind: "preventDamage", to: true, plusOnes: true, thatMany: true }], text: line };
  // Jared Carthalion, True Heir: "If damage would be dealt to ~ while you're the monarch, prevent that damage and put that
  // many +1/+1 counters on it": the same, only while you're the monarch (CR 724).
  if (text === "If damage would be dealt to ~ while you're the monarch, prevent that damage and put that many +1/+1 counters on it") return { affects: { kind: "self" }, mods: [{ kind: "preventDamage", to: true, plusOnes: true, thatMany: true }], condition: { kind: "monarch" }, text: line };
  // Panther Habit: "If equipped creature would be dealt damage, prevent that damage and put that many +1/+1 counters on
  // it": the same for the creature it's attached to.
  if (/^If (?:equipped|enchanted) creature would be dealt damage, prevent that damage and put that many \+1\/\+1 counters on it$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "preventDamage", to: true, plusOnes: true, thatMany: true }], text: line };
  // Phyrexian Vindicator: "If damage would be dealt to ~, prevent that damage. When damage is prevented this way, ~ deals
  // that much damage to any other target." The prevention's reflexive trigger (CR 603.12), once for each damage event.
  if (/^If damage would be dealt to ~, prevent that damage\. When damage is prevented this way, ~ deals that much damage to any other target$/.test(text)) {
    const body = parseBody("~ deals X damage to any other target.");
    if (!body) return null;
    return { affects: { kind: "self" }, mods: [{ kind: "preventDamage", to: true, reflect: { ...replaceX(body, { count: { kind: "eventAmount" } }), text: "~ deals that much damage to any other target." } }], text: line };
  }
  const prevent = parsePreventAll(text);
  if (prevent) {
    const affects = prevent.subject === "~" ? ({ kind: "self" } as const) : parseAffected(prevent.subject.replace(/^./, (c) => c.toUpperCase()));
    return affects ? { affects, mods: [prevent.mod], text: line } : null;
  }
  // "~ is also a Cleric, Rogue, Warrior, and Wizard" (party, CR 700.8): creature types it has in addition (layer 4).
  const also = /^~ is also an? (.+)$/.exec(text);
  if (also) {
    const types = also[1]!.replace(/,? and /, ", ").split(", ");
    return types.every((t) => CREATURE_TYPES.has(t)) ? { affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [], subtypes: types, supertypes: [] }], text: line } : null;
  }
  // "As long as ~ is on the battlefield, it's a land in addition to its other types" (Awakened Skyclave): a permanent's
  // static ability only works on the battlefield anyway (CR 113.6), so it's a card type it has there (layer 4).
  const onField = /^As long as ~ is on the battlefield, it's an? (artifact|creature|enchantment|land)(?: in addition to its other types)$/.exec(text);
  if (onField) return { affects: { kind: "self" }, mods: [{ kind: "addTypes", types: [capital(onField[1]!)], subtypes: [] }], text: line };
  // "~ is a 4/4 Gorgon creature with deathtouch and lifelink in addition to its other types" (Case of the Gorgon's Kiss,
  // solved): types (layer 4), abilities (6) and base power and toughness (7b), CR 613.1.
  const isA = /^~ is (an? \d+\/\d+ .+ in addition to its other types)$/.exec(text);
  if (isA) {
    const mods = parseIsA(isA[1]!, false) ?? parseStaticMods(`is ${isA[1]}`);
    return mods ? { affects: { kind: "self" }, mods, text: line } : null;
  }
  // Idol of False Gods: "it's a 0/0 creature in addition to its other types and it has annihilator 2" (the statement of
  // an "as long as"): the card type in layer 4, the ability in 6, the base power and toughness in 7b (CR 613.1).
  const isAnd = /^~ is (an? \d+\/\d+ (?:[A-Z][a-z]+ )?creature in addition to its other types and has .+)$/.exec(text);
  if (isAnd) {
    const mods = parseStaticMods(`is ${isAnd[1]}`);
    return mods ? { affects: { kind: "self" }, mods, text: line } : null;
  }
  const cda = parseDefinedPT(text);
  if (cda) return { affects: { kind: "self" }, mods: [cda], text: line };
  // Not a "where X is" inside a quoted ability: that X belongs to the ability granted (Hardy Outlander), nor mobilize's
  // (Infantry Shield: "has menace and mobilize X, where X is its power").
  const where = /\bmobilize X, where X is [^,"]+$/i.test(text) ? null : /^([^"]+), where X is ([^"]+)$/.exec(text);
  if (where) text = where[1]!;
  // "Creatures with power less than ~'s power can't block it." "All creatures able to block ~ do so." (CR 509.1b-c)
  if (/^Creatures with power less than ~'s power can't block it$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "cantBeBlockedByLesserPower" }], text: line };
  // Silumgar Assassin: "Creatures with power greater than ~'s power can't block it" (CR 509.1b).
  if (/^Creatures with power greater than ~'s power can't block it$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "cantBeBlockedByGreaterPower" }], text: line };
  // "Creatures with power less than ~'s power can't block creatures you control." (Champion of Lambholt)
  if (/^Creatures with power less than ~'s power can't block creatures you control$/.test(text)) return { affects: { kind: "filter", types: ["Creature"], controller: "you" }, mods: [{ kind: "cantBeBlockedByLesserPower", than: "source" }], text: line };
  // Bower Passage: "Creatures with flying can't block creatures you control": the same blocking restriction as "creatures
  // you control can't be blocked by creatures with flying" (CR 509.1b).
  const cantBlockYours = /^(Creatures with(?:out)? [a-z]+) can't block creatures you control$/.exec(text);
  if (cantBlockYours) {
    const st = parseStatic(`Creatures you control can't be blocked by ${cantBlockYours[1]!.toLowerCase()}.`);
    return st && !st.condition && st.mods.every((x) => x.kind === "cantBeBlockedBy") ? { ...st, text: line } : null;
  }
  // Baeloth Barrityl: "Creatures your opponents control with power less than ~'s power are goaded" (CR 701.15): for as
  // long as their power is less than its own (rulings), both as the layers leave them; it's the source's controller who
  // goads them.
  if (/^Creatures your opponents control with power less than ~'s power are goaded$/.test(text))
    return { affects: { kind: "filter", types: ["Creature"], controller: "opponent", lesserPowerThanSource: true }, mods: [{ kind: "goad" }], text: line };
  if (/^All creatures able to block ~ do so$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "allMustBlock" }], text: line };
  // Marble Priest: "All Walls able to block ~ do so": only Walls (CR 509.1c), any player's.
  const lureBy = /^All ([A-Z][a-z]+)s able to block ~ do so$/.exec(text);
  if (lureBy && CREATURE_TYPES.has(lureBy[1]!))
    return { affects: { kind: "self" }, mods: [{ kind: "allMustBlock", by: { kind: "object", types: ["Creature"], subtypes: [lureBy[1]!], text: `${lureBy[1]!}s` } }], text: line };
  // Talruum Piper: "All creatures with flying able to block ~ do so": only those with flying, the same.
  if (/^All creatures with flying able to block ~ do so$/.test(text))
    return { affects: { kind: "self" }, mods: [{ kind: "allMustBlock", by: { kind: "object", types: ["Creature"], keywords: ["Flying"], text: "creatures with flying" } }], text: line };
  if (/^All creatures able to block (enchanted|equipped) creature do so$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "allMustBlock" }], text: line };
  // "You may have ~ assign its combat damage as though it weren't blocked" (CR 510.1c-d; chosen as it assigns it).
  const unblocked = [{ kind: "unblockedDamage" }] as const;
  // Wolverine, Claws Out: "You may have ~ assign ~'s combat damage as though ~ weren't blocked" (his name for "its").
  if (/^You may have ~ assign (?:its|~'s) combat damage as though (?:it|~) weren't blocked$/.test(text)) return { affects: { kind: "self" }, mods: [...unblocked], text: line };
  if (/^Enchanted creature's controller may have it assign its combat damage as though it weren't blocked$/.test(text)) return { affects: { kind: "attached" }, mods: [...unblocked], text: line };
  if (/^As long as ~ is attacking, for each creature you control, you may have that creature assign its combat damage as though it weren't blocked$/.test(text))
    return { affects: { kind: "filter", types: ["Creature"], controller: "you" }, mods: [...unblocked], text: line, condition: { kind: "self", is: "attacking" } };
  // Zilortha, Apex of Ikoria: "For each non-Human creature you control, you may have that creature assign its combat
  // damage as though it weren't blocked" (chosen for each one as it assigns its damage, rulings).
  const forEachUnblocked = /^For each (.+?) you control, you may have that creature assign its combat damage as though it weren't blocked$/.exec(text);
  if (forEachUnblocked) {
    const affects = parseAffected(`${capital(forEachUnblocked[1]!)}s you control`);
    return affects?.kind === "filter" ? { affects, mods: [...unblocked], text: line } : null;
  }
  const grantsUnblocked = /^(.+) have "You may have ~ assign its combat damage as though it weren't blocked\."$/.exec(text);
  if (grantsUnblocked) {
    const affects = parseAffected(grantsUnblocked[1]!);
    return affects && affects.kind === "filter" ? { affects, mods: [...unblocked], text: line } : null;
  }
  // Bark of Doran: "As long as equipped creature's toughness is greater than its power, it assigns combat damage equal
  // to its toughness rather than its power" (checked as the damage is assigned).
  if (/^As long as (?:equipped|enchanted) creature's toughness is greater than its power, it assigns combat damage equal to its toughness rather than its power$/.test(text))
    return { affects: { kind: "attached" }, mods: [{ kind: "assignsToughness", ifGreater: true }], text: line };
  // Doran's "each creature you control with toughness greater than its power assigns ...": whether its toughness is
  // greater is checked as it assigns combat damage, which comes to the same thing as a group that changes with it.
  const greater = /^(.+?) with toughness greater than (?:its|their) power (assigns? .+)$/.exec(text);
  if (greater) text = `${greater[1]} ${greater[2]}`;
  const m = /^(.+?) (gets? .+|(?:has|have) .+|is an? [A-Z][a-z]+ in addition to its other types.*|are [A-Z][a-z]+ artifacts in addition to their other types.*|are artifacts in addition to their other types|(?:is|are) all colors|are the chosen color|can't .+|can block .+|can only attack alone|can attack as though .+|can attack players who attacked you during their last turn as though .+|assigns? combat damage .+|must be blocked if able|attacks? each combat if able(?:,? .+)?|attacks? an opponent with the most life among your opponents each combat if able|blocks? each combat if able|attacks or blocks each combat if able|doesn't untap .+|don't untap .+|loses? all abilities(?: and (?:has|have) base power and toughness \d+\/\d+)?|loses? [a-z ,]+? and can't have or gain [a-z ,]+|loses? (?:flying|first strike|trample|haste|vigilance|reach|defender|lifelink|deathtouch|infect|flying and islandwalk))$/.exec(text);
  if (!m) return null;
  const affects = parseAffected(m[1]!);
  if (!affects) return null;
  if (greater) {
    const mods = parseStaticMods(m[2]!);
    if (!mods?.some((x) => x.kind === "assignsToughness")) return null;
    return { affects, mods: mods.map((x) => (x.kind === "assignsToughness" ? { ...x, ifGreater: true as const } : x)), text: line };
  }
  // "~ gets +1/+1 for each artifact you control": counted continuously (CR 611.3a).
  const each = new RegExp(`^(gets? ${PT}/${PT}) for each (.+)$`).exec(m[2]!);
  // "~ has "Whenever Kosei deals combat damage ..."": the name in an ability it gives itself is that object (CR 201.5a).
  const said = affects.kind === "self" ? m[2]!.replaceAll(QUOTED_SOURCE_NAME, "~") : m[2]!;
  let mods = parseStaticMods(each ? each[1]! : said);
  if (!mods) return null;
  // "Enchanted creature gets +1/+1 for each Aura and Equipment attached to it": "it" is each permanent it affects.
  // ("Attached to ~" is the source's own: Armament Master.)
  const counts = (c0: AmountExpr | null, words = "") => {
    const c = c0?.count.kind === "attachedToSelf" && / attached to it$/.test(words) && affects.kind !== "self" && affects.kind !== "paired" ? { ...c0, count: { kind: "attachedToAffected" as const, subtypes: c0.count.subtypes } } : c0;
    if (c?.count.kind === "attachedToSelf" && / attached to ~$/.test(words)) return c;
    return c && staticCountOk(c, affects) ? c : null;
  };
  // "Gets +1/+1 for each enchantment you control and has first strike" (Ethereal Armor): the count, then what it has.
  // Machinist's Arsenal: "gets +2/+2 for each artifact you control and is an Artificer in addition to its other types":
  // a creature type too, in layer 4 (CR 205.1b, 613.1d).
  const andHas = each && / and ((?:has|have) .+|is an? [A-Z][a-z]+ in addition to its other types)$/.exec(each[4]!);
  const alsoHas = andHas ? parseStaticMods(andHas[1]!) : [];
  if (!alsoHas) return null;
  if (each && andHas) each[4] = each[4]!.slice(0, andHas.index);
  // Eidolon of Countless Battles: "gets +1/+1 for each creature you control and +1/+1 for each Aura you control": both,
  // each counted on its own.
  const second = each && !andHas ? new RegExp(`^(.+?) and (${PT}/${PT}) for each (.+)$`).exec(each[4]!) : null;
  if (second) {
    const first = parseStaticMods(each![1]!);
    const more = parseStaticMods(`get ${second[2]!}`);
    const a = counts(parseCount(second[1]!, null, true), second[1]!);
    const b = counts(parseCount(second[5]!, null, true), second[5]!);
    const pa = first?.[0];
    const pb = more?.[0];
    if (!a || !b || first?.length !== 1 || more?.length !== 1 || pa?.kind !== "modifyPT" || pb?.kind !== "modifyPT") return null;
    const sa = [scaleAmount(pa.power, a), scaleAmount(pa.toughness, a)];
    const sb = [scaleAmount(pb.power, b), scaleAmount(pb.toughness, b)];
    if (sa.some((x) => x === null) || sb.some((x) => x === null)) return null;
    return { affects, mods: [{ kind: "modifyPT", power: sa[0]!, toughness: sa[1]! }, { kind: "modifyPT", power: sb[0]!, toughness: sb[1]! }], text: line };
  }
  if (each) {
    // Coat of Arms: "for each other creature on the battlefield that shares at least one creature type with it", "it"
    // each creature it affects, counted for that one.
    // Alpha Status: "Enchanted creature gets +2/+2 for each other creature on the battlefield that shares a creature type
    // with it": the same, "it" the enchanted creature.
    const coat = (/^other creature on the battlefield that shares at least one creature type with it$/.test(each[4]!) && affects.kind === "filter") || (/^other creature on the battlefield that shares a creature type with it$/.test(each[4]!) && affects.kind === "attached");
    // Stoneforge Masterwork: "Equipped creature gets +1/+1 for each other creature you control that shares a creature type
    // with it": "it" is the equipped creature, each creature counted once however many types it shares (rulings).
    const masterwork = /^other creature you control that shares a creature type with it$/.test(each[4]!) && affects.kind === "attached";
    // Moraug: "for each time it has attacked this turn", each creature it affects, counted for that one.
    const attacks = each[4] === "time it has attacked this turn" && affects.kind === "filter";
    // Takeno, Samurai General: "for each point of bushido it has", each creature it affects counted for that one.
    const bushido = each[4] === "point of bushido it has" && affects.kind === "filter";
    // Toxrill: "for each slime counter on them", each creature it affects, counted for that one.
    const ownCounters = affects.kind === "filter" ? new RegExp(`^${COUNTER} counter on (?:it|them)$`).exec(each[4]!) : null;
    // Luxior, Giada's Gift: "Equipped creature gets +1/+1 for each counter on it": "it" is the equipped creature, every kind.
    const attachedCounters = affects.kind === "attached" && each[4] === "counter on it";
    // Mirror Box: "for each other creature you control with the same name as that creature", "that creature" each one it affects.
    const mirror = /^other creature you control with the same name as that creature$/.test(each[4]!) && affects.kind === "filter";
    const per = masterwork ? { count: { kind: "permanents" as const, filter: { kind: "object" as const, types: ["Creature"], controller: "you" as const, text: each[4]! }, sharesTypeWithAffected: true as const } } : mirror ? { count: { kind: "permanents" as const, filter: { kind: "object" as const, types: ["Creature"], controller: "you" as const, text: "creature you control" }, sameNameAsAffected: true as const } } : coat ? { count: { kind: "permanents" as const, filter: { kind: "object" as const, types: ["Creature"], text: each[4]! }, sharesTypeWithAffected: true as const } } : attacks ? { count: { kind: "timesAffectedAttacked" as const } } : bushido ? { count: { kind: "affectedBushido" as const } } : ownCounters ? { count: { kind: "affectedCounters" as const, counter: counterKind(ownCounters[1]!) } } : attachedCounters ? { count: { kind: "affectedCounters" as const, counter: ANY_COUNTER } } : counts(parseCount(each[4]!, null, true), each[4]!);
    const pt = mods[0];
    if (!per || mods.length !== 1 || pt?.kind !== "modifyPT") return null;
    const [p, t] = [scaleAmount(pt.power, ofAffected(per, affects, m[1]!)), scaleAmount(pt.toughness, ofAffected(per, affects, m[1]!))];
    if (p === null || t === null) return null;
    mods = [{ kind: "modifyPT", power: p, toughness: t }, ...alsoHas];
  }
  // Elturel Survivors: "where X is the number of lands defending player controls": the player ~ is attacking (or whose
  // planeswalker or battle it attacks, CR 506.2), as it is now; none while it isn't attacking.
  const defending = where && affects.kind === "self" ? /^the number of (.+) defending player controls$/.exec(where[2]!) : null;
  if (defending) {
    const c = parseCount(`the number of ${defending[1]} on the battlefield`, null);
    if (!c || typeof c !== "object" || !("count" in c) || c.count.kind !== "permanents" || c.count.whose || Object.keys(c).length !== 1) return null;
    mods = replaceX(mods, { count: { ...c.count, whose: { ref: "selfDefending" } } });
  } else if (where) {
    const def = counts(parseCount(where[2]!, null), where[2]!);
    if (!def) return null;
    mods = replaceX(mods, def);
  }
  // A static ability has no X of its own to choose (CR 107.3).
  return usesX(mods) ? null : { affects, mods, text: line };
}

/**
 * "Other" in "for each other ..." of a static ability that affects other permanents: other than the permanent it's
 * applied to when that one is of the kind counted ("Enchanted creature gets +1/+1 for each other creature you control",
 * Bravado: an Aura isn't a creature, so the enchanted creature doesn't count itself; "Each legendary creature you
 * control gets +1/+1 for each other legendary creature you control", Heroes' Podium, which counts itself if it becomes
 * a legendary creature, rulings; Sliver Legion, rulings). Otherwise other than the source ("Enchanted creature gets
 * +2/+2 for each other enchantment on the battlefield", Ancestral Mask).
 */
function ofAffected(c: AmountExpr, affects: Affects, subject: string): AmountExpr {
  const k = c.count;
  if (k.kind !== "permanents" || !k.other || affects.kind === "self") return c;
  const attached = affects.kind === "attached" ? /^(?:Enchanted|Equipped) (creature|artifact|land)$/.exec(subject) : null;
  const types = attached ? [capital(attached[1]!)] : affects.kind === "filter" ? [...affects.types, ...(affects.spec?.types ?? [])] : [];
  const subtypes = affects.kind === "filter" ? (affects.spec?.subtypes ?? []) : [];
  const ofKind = k.filter.types?.some((x) => types.includes(x)) || k.filter.subtypes?.some((x) => subtypes.includes(x) || (CREATURE_TYPES.has(x) && types.includes("Creature")));
  if (!ofKind) return c;
  const { other: _, ...count } = k;
  return { ...c, count: { ...count, otherThanAffected: true } };
}

/**
 * Counts a static ability can use while the layers are being applied: power and toughness aren't
 * known yet then (they're what's being worked out), and "attached to it" means the permanent
 * itself only when the ability is about itself.
 */
function staticCountOk(c: AmountExpr, affects: Affects): boolean {
  const k = c.count;
  if (k.kind === "power" || k.kind === "toughness") return false;
  // "Equipped creature gets +X/+X, where X is its mana value": "its" is the equipped creature, not the source.
  if (k.kind === "manaValue" && affects.kind !== "self") return false;
  if (k.kind === "permanents" && (k.filter.power || k.filter.toughness)) return false;
  if (k.kind === "attachedToSelf" && affects.kind !== "self") return false;
  return true;
}

/**
 * Characteristic-defining abilities for power and toughness (CR 604.3, layer 7a): "~'s power and
 * toughness are each equal to the number of creatures you control", "~'s power is equal to ...",
 * "~'s power is equal to N and its toughness is equal to that number plus 1".
 */
function parseDefinedPT(text: string): Modification | null {
  let m: RegExpExecArray | null;
  const ok = (c: AmountExpr | null) => (c && staticCountOk(c, { kind: "self" }) ? c : null);
  if ((m = /^~'s power and toughness are each equal to (.+)$/.exec(text))) {
    const c = ok(parseCount(m[1]!, null));
    return c && { kind: "definePT", power: c, toughness: c };
  }
  if ((m = /^~'s power is equal to (.+?) and its toughness is equal to (.+)$/.exec(text))) {
    const p = ok(parseCount(m[1]!, null));
    const same = /^that number(?: (plus|minus) (\d+))?$/.exec(m[2]!);
    const t = same && p ? { ...p, plus: (p.plus ?? 0) + (same[1] === "minus" ? -1 : 1) * Number(same[2] ?? 0) } : ok(parseCount(m[2]!, null));
    return p && t ? { kind: "definePT", power: p, toughness: t } : null;
  }
  if ((m = /^~'s (power|toughness) is equal to (.+)$/.exec(text))) {
    const c = ok(parseCount(m[2]!, null));
    return c && { kind: "definePT", [m[1]!]: c };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Effect bodies

const BASIC_PLURAL: Record<string, string> = { Plains: "Plains", Islands: "Island", Swamps: "Swamp", Mountains: "Mountain", Forests: "Forest" };
const LAND: TargetSpec = { kind: "object", types: ["Land"], notTypes: [], notColors: [], text: "land" };

/**
 * Basic land types (CR 305.7): "Nonbasic lands are Mountains" (Blood Moon), "All Mountains are Plains" (Conversion),
 * "Enchanted land is an Island" (Spreading Seas) set a land's land types, so it loses its other land types and the
 * abilities from its rules text. "Each land is a Swamp in addition to its other land types" (Urborg), "Lands you control
 * are every basic land type in addition to their other types" (Prismatic Omen) only add types. "Islands don't untap
 * during their controllers' untap steps" (Choke).
 */
function parseLandTypeStatic(text: string, line: string): StaticAbility | null {
  let m: RegExpExecArray | null;
  if ((m = /^Nonbasic lands are (Plains|Islands|Swamps|Mountains|Forests)$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"], spec: { ...LAND, notSupertypes: ["Basic"], text: "nonbasic land" } }, mods: [{ kind: "setLandTypes", subtypes: [BASIC_PLURAL[m[1]!]!] }], text: line };
  if ((m = /^All (Plains|Islands|Swamps|Mountains|Forests) are (Plains|Islands|Swamps|Mountains|Forests)$/.exec(text)) && m[1] !== m[2])
    return { affects: { kind: "filter", types: ["Land"], subtypes: [BASIC_PLURAL[m[1]!]!] }, mods: [{ kind: "setLandTypes", subtypes: [BASIC_PLURAL[m[2]!]!] }], text: line };
  if ((m = /^Enchanted land is an? (Plains|Island|Swamp|Mountain|Forest)$/.exec(text))) return { affects: { kind: "attached" }, mods: [{ kind: "setLandTypes", subtypes: [m[1]!] }], text: line };
  // Lush Growth: "Enchanted land is a Mountain, Forest, and Plains": those three instead of its other land types (CR 305.7).
  if ((m = /^Enchanted land is an? (Plains|Island|Swamp|Mountain|Forest), (?:an? )?(Plains|Island|Swamp|Mountain|Forest), and (?:an? )?(Plains|Island|Swamp|Mountain|Forest)$/.exec(text)) && new Set(m.slice(1)).size === 3)
    return { affects: { kind: "attached" }, mods: [{ kind: "setLandTypes", subtypes: [m[1]!, m[2]!, m[3]!] }], text: line };
  // Stormtide Leviathan: "All lands are Islands in addition to their other types", the same.
  if ((m = /^Each land is an? (Plains|Island|Swamp|Mountain|Forest) in addition to its other land types$/.exec(text)) || (m = /^All lands are (Plains|Island|Swamp|Mountain|Forest)s? in addition to their other types$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"] }, mods: [{ kind: "addTypes", types: [], subtypes: [m[1]!] }], text: line };
  // Swampbenders: "Lands you control are Swamps in addition to their other types": yours only.
  if ((m = /^Lands you control are (Plains|Island|Swamp|Mountain|Forest)s? in addition to their other types$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: [], subtypes: [m[1]!] }], text: line };
  if (/^Lands you control are every basic land type in addition to their other types$/.test(text))
    return { affects: { kind: "filter", types: ["Land"], controller: "you" }, mods: [{ kind: "addTypes", types: [], subtypes: [...BASIC_TYPES] }], text: line };
  // Nylea's Presence: "Enchanted land is every basic land type in addition to its other types": the land the Aura is on, with
  // each type's mana ability (CR 305.7).
  if (/^Enchanted land is every basic land type in addition to its other types$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "addTypes", types: [], subtypes: [...BASIC_TYPES] }], text: line };
  if ((m = /^(Plains|Islands|Swamps|Mountains|Forests) don't untap during their controllers' untap steps$/.exec(text)))
    return { affects: { kind: "filter", types: ["Land"], subtypes: [BASIC_PLURAL[m[1]!]!] }, mods: [{ kind: "doesntUntap" }], text: line };
  return null;
}

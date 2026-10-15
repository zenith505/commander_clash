import { allEffects, type AbilityBody, type ActivatedAbility, type AdditionalCost, type Effect } from "../abilities";
import { NUM, num, X, sacrificeSelf, counterKind } from "./words";
import { removeCounterCost } from "./mana-abilities";
import { parseBody, usesX } from "./body";
import { parseSearchFilter } from "./search";
import { pickFilter } from "./targets";
import { parseActivateCondition } from "./statics";

/** The ability words (CR 207.2c): no rules meaning, unlike keyword abilities written the same way ("Boast — {1}{R}: ..."). */
const ABILITY_WORDS = new Set(["adamant", "addendum", "alliance", "battalion", "bloodrush", "celebration", "channel", "chroma", "cohort", "constellation", "converge", "corrupted", "council's dilemma", "coven", "delirium", "descend 4", "descend 8", "disappear", "domain", "eerie", "eminence", "enrage", "fateful hour", "fathomless descent", "ferocious", "flurry", "formidable", "grandeur", "hellbent", "heroic", "imprint", "infusion", "inspired", "join forces", "kinship", "landfall", "lieutenant", "magecraft", "metalcraft", "morbid", "opus", "pack tactics", "paradox", "parley", "radiance", "raid", "rally", "renew", "repartee", "revolt", "secret council", "spell mastery", "strive", "survival", "sweep", "tempting offer", "threshold", "undergrowth", "valiant", "vivid", "void", "will of the council"]);

/** A line without its ability word ("Threshold — "), which has no rules meaning (CR 207.2c). */
export function stripAbilityWord(raw: string): string {
  const word = /^([A-Z][A-Za-z' 0-9]+) — /.exec(raw);
  return word && ABILITY_WORDS.has(word[1]!.toLowerCase()) ? raw.slice(word[0].length) : raw;
}

export function parseActivated(raw: string): ActivatedAbility | "fail" | null {
  const word = /^([A-Z][A-Za-z' 0-9]+) — /.exec(raw);
  const line = word && ABILITY_WORDS.has(word[1]!.toLowerCase()) ? raw.slice(word[0].length) : raw;
  // Costs: mana symbols run together ("{1}{R}"), other parts are comma-separated ("{2}, {T}, Sacrifice ~").
  const piece = String.raw`(?:\{[^}]+\})+|Sacrifice ~|Exert ~|Exile ~ from your graveyard|Remove (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) (?:[+-]1/[+-]1|[a-z]+) counters? from ~|Put (?:a|an|one|two|three) (?:[+-]1/[+-]1|[a-z]+) counters? on ~|Pay \d+ life|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?(?: at random)?|Put (?:a|one|two|three) cards? from your hand on top of your library|Tap (?:an|one|two|three|four|five) untapped [^,:]+? you control`;
  const m = new RegExp(`^((?:${piece})(?:, (?:${piece}))*): (.+)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!;
  // Sacrificing other permanents or discarding cards as part of the cost (CR 602.2b, 601.2h).
  const extra: AdditionalCost[] = [];
  let removeCounters: ActivatedAbility["removeCounters"];
  let putCounters: ActivatedAbility["putCounters"];
  for (const part of costs.split(", ")) {
    let c: RegExpExecArray | null;
    if ((c = new RegExp(`^Put ${NUM} ([+-]1/[+-]1|[a-z]+) counters? on ~$`).exec(part))) putCounters = { counter: counterKind(c[2]!), n: num(c[1]!) };
    else if (/^Remove /.test(part)) {
      const rc = removeCounterCost(part);
      if (!rc || !Number.isFinite(rc.n)) return "fail"; // "Remove X counters" isn't modeled
      removeCounters = rc;
    } else if (part !== "Sacrifice ~" && (c = new RegExp(`^Sacrifice (another|${NUM}) (.+)$`).exec(part))) {
      const filter = pickFilter(c[3]!); // NUM is a group of its own
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter, n: c[1] === "another" ? 1 : num(c[1]!), ...(c[1] === "another" ? { other: true } : {}) });
    } else if ((c = new RegExp(`^Tap ${NUM} untapped (.+) you control$`).exec(part))) {
      const filter = pickFilter(c[2]!);
      if (!filter) return "fail";
      extra.push({ kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(c[1]!), ...(/\{T\}/.test(costs) ? { other: true } : {}) });
    } else if ((c = new RegExp(`^Discard ${NUM} (?:(.+?) )?cards?( at random)?$`).exec(part))) {
      const filter = c[2] ? parseSearchFilter(`${c[2]} card`) : undefined;
      if (filter === null || (filter && c[3])) return "fail";
      extra.push({ kind: "discard", n: num(c[1]!), ...(filter ? { filter } : {}), ...(c[3] ? { random: true as const } : {}) });
    } else if ((c = new RegExp(`^Put ${NUM} cards? from your hand on top of your library$`).exec(part))) {
      // Several cards go on top in the order their owner chooses (CR 401.4): the first one picked ends up on top.
      extra.push({ kind: "exileFromHand", n: num(c[1]!), toLibrary: true });
    }
  }
  let effectText = m[2]!;
  let sorcerySpeed = false;
  let oncePerTurn = false;
  // Timing restrictions (CR 602.5b): "Activate only as a sorcery", "... only once each turn", or both.
  const limit = / Activate only (as a sorcery|once each turn|as a sorcery and only once each turn)\.$/.exec(effectText);
  if (limit) {
    sorcerySpeed = limit[1]!.includes("sorcery");
    oncePerTurn = limit[1]!.includes("once");
    effectText = effectText.slice(0, limit.index);
  }
  // "Activate no more than twice each turn." (CR 602.5b)
  let maxPerTurn: number | undefined;
  const most = / Activate no more than (twice|three times) each turn\.$/.exec(effectText);
  if (most) {
    maxPerTurn = most[1] === "twice" ? 2 : 3;
    effectText = effectText.slice(0, most.index);
  }
  // "Activate only if you have the city's blessing." (CR 602.5b): a condition checked as it's activated.
  let activateIf: ActivatedAbility["activateIf"];
  // "Activate only during your turn[, before attackers are declared]." (CR 602.5b)
  const turn = / Activate only during your turn(, before attackers are declared)?( and only once each turn)?\.$/.exec(effectText);
  if (turn) {
    activateIf = { kind: turn[1] ? "beforeAttackers" : "yourTurn" };
    if (turn[2]) oncePerTurn = true;
    effectText = effectText.slice(0, turn.index);
  }
  const onlyIf = / Activate only if ([^.]+?)( and only once each turn| and only as a sorcery)?\.$/.exec(effectText);
  if (onlyIf) {
    if (activateIf) return "fail";
    if (onlyIf[2] === " and only once each turn") oncePerTurn = true;
    if (onlyIf[2] === " and only as a sorcery") sorcerySpeed = true;
    activateIf = parseActivateCondition(onlyIf[1]!) ?? undefined;
    if (!activateIf) return "fail";
    effectText = effectText.slice(0, onlyIf.index);
  }
  const life = /Pay (\d+) life/.exec(costs);
  const energy = energyIn(costs);
  if (energy < 0) return "fail";
  const symbols = [...costs.replace(/Pay (?:\{E\})+|Pay \w+ \{E\}/, "").matchAll(/\{([^}]+)\}/g)].map((x) => x[1]!);
  if (symbols.some((x) => x === "Q" || x === "E")) return "fail";
  const tap = symbols.includes("T");
  // "{3}, Exile this card from your graveyard: ...", "{2}{B}: Return this card from your graveyard to your hand":
  // it works only from your graveyard (CR 113.6j), where "~" is the card.
  const returnsSelf = /^Return ~ from your graveyard to (?:your hand|the battlefield(?: tapped)?)\./.test(effectText);
  const fromYard = /Exile ~ from your graveyard/.test(costs) || returnsSelf;
  if (fromYard && (tap || /Sacrifice ~|Remove /.test(costs))) return "fail";
  if (returnsSelf && /Exile ~ from your graveyard/.test(costs)) return "fail";
  const manaCost = symbols
    .filter((x) => x !== "T")
    .map((x) => `{${x}}`)
    .join("");
  // "Sacrifice ~: It deals damage equal to its power to ...": "it" is the source.
  const body = parseBody(effectText.replace(/^It (?=deals\b)/, "~ "), { activated: true, ...(returnsSelf ? { selfCard: true } : {}) });
  if (!body) return "fail";
  // An activated ability without a target that could add mana, and that moves no card to or from a library, is a mana
  // ability (CR 605.1a): it doesn't use the stack (605.3b). One whose other instructions aren't known to stay clear of
  // libraries isn't compiled.
  const mana = manaAbilityKind(body);
  if (mana === "fail") return "fail";
  // X in the effect is the X paid in the cost (CR 107.3a); with none to pay, it isn't defined.
  if (usesX(body) && !symbols.includes("X")) return "fail";
  return {
    manaCost,
    tap,
    sacrificeSelf: /Sacrifice ~/.test(costs),
    ...(/Exert ~/.test(costs) ? { exertCost: true as const } : {}),
    sorcerySpeed,
    body,
    text: raw,
    ...(fromYard ? { zone: "graveyard" as const, ...(returnsSelf ? {} : { exileSelf: true }) } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(maxPerTurn ? { maxPerTurn } : {}),
    ...(activateIf ? { activateIf } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(energy ? { energyCost: energy } : {}),
    ...(extra.length ? { costs: extra } : {}),
    ...(removeCounters ? { removeCounters } : {}),
    ...(putCounters ? { putCounters } : {}),
    ...(mana === "mana" ? { mana: true as const } : {}),
  };
}

/** Instructions that move a card to or from a library (CR 605.1a): an ability with one isn't a mana ability. */
const LIBRARY_EFFECTS = new Set<Effect["type"]>(["draw", "mill", "putInLibrary", "exileTop", "revealTopToHand", "surveil", "handToTop", "shuffleIntoLibrary", "shuffleSpell", "shuffleZones", "search", "dig", "impulse", "cascade", "ripple", "explore", "hideaway", "recruit", "connive", "orderTop", "scry", "clash"]);
/** Instructions that don't: what mana abilities do besides adding mana (Pristine Talisman's life, Glittering Stockpile's counter). */
const MANA_RIDERS = new Set<Effect["type"]>(["addMana", "choose", "if", "may", "gainLife", "loseLife", "damage", "counters", "removeCounters", "removeSelfCounter", "delayed", "tap", "untap", "getEnergy", "poison", "skipUntap", "continuous", "sacrifice"]);

/**
 * Whether an activated ability's effect makes it a mana ability (CR 605.1a): no target, it could add mana, and it
 * moves no card to or from a library ("Draw a card" makes Chromatic Sphere's use the stack, rulings). A delayed
 * trigger it sets up (Barbed Sextant's draw at the next upkeep) is a separate ability, so that draw doesn't count.
 * "fail" when it could add mana but does something not known either way.
 */
export function manaAbilityKind(body: AbilityBody): "mana" | "stack" | "fail" {
  const bodies = body.modal ? body.modal.modes : [body];
  const effects = bodies.flatMap((b) => allEffects(b.effects));
  if (!effects.some((e) => e.type === "addMana")) return "stack";
  if (bodies.some((b) => b.targets.length) || body.targets.length || JSON.stringify(effects.filter((e) => e.type !== "delayed")).includes('"targets":[{')) return "stack";
  if (effects.some((e) => LIBRARY_EFFECTS.has(e.type))) return "stack";
  return effects.every((e) => MANA_RIDERS.has(e.type)) ? "mana" : "fail";
}

/**
 * A loyalty ability (CR 606): "+1: You gain 2 life.", "−3: ~ deals 4 damage to target creature.", "0: ...", "−X: ...",
 * where X in the effect is the X announced for the cost (CR 107.3). Activated only as a sorcery (CR 606.3).
 */
export function parseLoyalty(sign: string, amount: string, effectText: string, raw: string): ActivatedAbility | "fail" {
  const minus = sign === "−" || sign === "-";
  if (amount === "X" && !minus) return "fail";
  const body = parseBody(effectText, { activated: true });
  if (!body) return "fail";
  if (usesX(body) && amount !== "X") return "fail";
  const n = Number(amount);
  return { manaCost: "", tap: false, sacrificeSelf: false, sorcerySpeed: true, body, text: raw, ...(amount === "X" ? { loyaltyX: true } : { loyalty: minus ? -n : n }) };
}

/** How much energy "Pay {E}{E}" or "Pay eight {E}" asks for (CR 107.14), or 0. */
export function energyIn(costs: string): number {
  const m = /Pay ((?:\{E\})+)|Pay (\w+) \{E\}/.exec(costs);
  if (!m) return 0;
  if (m[1]) return m[1].length / 3;
  const n = num(m[2]!);
  return Number.isFinite(n) ? n : -1; // a number we don't read ("fifty")
}

// ---------------------------------------------------------------------------
// Static abilities (CR 604)

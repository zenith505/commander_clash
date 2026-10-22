import type { CounterKind, ManaAbility, ManaProduce, ManaSpend, ManaTrigger, TargetSpec } from "../abilities";
import type { Color, ManaType } from "../types";
import { NUM, num, COUNTER, counterKind, ALL_COLORS, sacrificeSelf, singular } from "./words";
import { energyIn } from "./activated";
import { parseTargetPhrase, pickFilter } from "./targets";
import { parseCount } from "./counts";
import { CREATURE_TYPES } from "../keywords";
import { parseOnlyClauses, parseStaticCondition } from "./statics";

/**
 * A mana ability (CR 605.1a): "{T}: Add {G}.", "{T}: Add {W} or {U}. ~ deals 1 damage to you.",
 * "{1}, {T}: Add {W}{U}.", "{T}, Sacrifice ~: Add one mana of any color.", "{T}: Add {C}{C}.",
 * "{T}: Add {G} for each creature you control.", "Sacrifice ~: Add {C}." Null if the line isn't one
 * we can run (mana that can only be spent on some spells, "in any combination", ...).
 */
export function parseManaAbility(line0: string): ManaAbility | null {
  // "{T}: For each color among permanents you control, add one mana of that color." (Bloom Tender), "{2}, {T}: Choose a
  // color. Add an amount of mana of that color equal to ..." (Nykthos, Three Tree City: the color is chosen as it resolves,
  // CR 605.3b, like "X mana of any one color").
  const line = line0
    .replace(/: For each color among permanents you control, add one mana of that color\./, ": Add one mana of each color among permanents you control.")
    .replace(/: Choose a color\. Add an amount of mana of that color equal to your devotion to that color\./, ": Add an amount of mana of the chosen color equal to your devotion to that color.")
    .replace(/: Choose a color\. Add an amount of mana of that color equal to (.+?)\./, ": Add X mana of any one color, where X is $1.")
    // "Choose a color. Add one mana of that color for each charge counter on ~." (Astral Cornucopia): the same.
    .replace(/: Choose a color\. Add one mana of that color for each ([^.]+? counter) on ~\./, ": Add X mana of any one color, where X is the number of $1s on ~.");
  const part = String.raw`\{[^}]+\}|Sacrifice ~|Exert ~|Discard your hand|Pay \d+ life|Pay (?:\{E\})+|Remove (?:a|an|one|two|three|four|five) [a-z]+ counters? from ~|Remove (?:any number of|X) [a-z]+ counters from ~|Tap (?:an|one|two|three) untapped [^,:]+? you control`;
  const m = new RegExp(`^((?:${part})(?:, (?:${part}))*): Add ([^.]+)\\.((?: [^.]+\\.)*)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!.split(", ");
  let tap = false;
  let sacrificeSelf = false;
  let manaCost = "";
  let lifeCost: number | undefined;
  let energyCost: number | undefined;
  let removeCounters: ManaAbility["removeCounters"];
  let tapCost: ManaAbility["tapCost"];
  let removeX: { counter: CounterKind; any: boolean } | undefined;
  let discardHand = false;
  let exert = false;
  for (const c of costs) {
    const rc = removeCounterCost(c);
    const tc = new RegExp(`^Tap ${NUM} untapped (.+) you control$`).exec(c);
    const rx = new RegExp(`^Remove (any number of|X) ${COUNTER} counters from ~$`).exec(c);
    if (rc) removeCounters = rc;
    else if (rx && !removeX && !removeCounters) removeX = { counter: counterKind(rx[2]!), any: rx[1] === "any number of" };
    else if (tc) {
      const filter = pickFilter(tc[2]!);
      if (!filter || tapCost) return null;
      tapCost = { kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(tc[1]!), ...(costs.includes("{T}") ? { other: true } : {}) };
    }
    else if (c === "{T}") tap = true;
    else if (c === "Discard your hand" && !discardHand) discardHand = true;
    else if (c === "Sacrifice ~") sacrificeSelf = true;
    // "Exert ~" (CR 701.43a): it won't untap during its controller's next untap step.
    else if (c === "Exert ~" && !exert) exert = true;
    else if (/^Pay \d+ life$/.test(c)) lifeCost = Number(/\d+/.exec(c)![0]);
    else if (/^Pay (\{E\})+$/.test(c)) energyCost = energyIn(c);
    // "{W/U}, {T}: Add ..." (filter lands): hybrid symbols are paid with either color (CR 107.4e).
    else if (/^(\{(\d+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/.test(c)) manaCost += c;
    else return null;
  }
  const produces = removeX ? removedProduced(m[2]!, removeX.counter, removeX.any) : parseManaProduced(m[2]!);
  if (!produces || (removeCounters && removeX)) return null;
  const out: ManaAbility = { text: line0, manaCost, tap, sacrificeSelf, produces, ...(lifeCost ? { lifeCost } : {}), ...(energyCost ? { energyCost } : {}), ...(removeCounters ? { removeCounters } : {}), ...(tapCost ? { tapCost } : {}), ...(discardHand ? { discardHand: true as const } : {}), ...(exert ? { skipNextUntap: true } : {}) };
  let m2: RegExpExecArray | null;
  for (const extra of (m[3] ?? "").split(/(?<=\.) /).map((x) => x.trim()).filter(Boolean)) {
    const dmg = new RegExp(`^~ deals ${NUM} damage to you\\.$`).exec(extra);
    if (dmg) out.selfDamage = num(dmg[1]!);
    else if (extra === "~ doesn't untap during your next untap step.") out.skipNextUntap = true;
    else if ((m2 = /^If (?:any of )?that mana is spent on an? (?:([A-Z][a-z]+) )?creature spell, it gains haste( until end of turn)?\.$/.exec(extra)) && !out.spentHaste && (!m2[1] || CREATURE_TYPES.has(m2[1]))) {
      // "If that mana is spent on a Dragon creature spell, it gains haste until end of turn" (Carnelian Orb of Dragonkind).
      out.spentHaste = m2[2] ? "endOfTurn" : "game";
      if (m2[1]) out.spentHasteType = m2[1];
    }
    else if (extra === "If that mana is spent on an instant or sorcery spell, that spell can't be countered.") out.spentUncounterable = true;
    else if (extra === "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command zone this game.") out.spentCommanderCounters = true;
    // Depletion lands: "Put a depletion counter on ~.", "If there are no depletion counters on ~, sacrifice it."
    else if ((m2 = new RegExp(`^Put an? ${COUNTER} counter on ~\\.$`).exec(extra)) && !out.putCounter) out.putCounter = counterKind(m2[1]!);
    else if ((m2 = new RegExp(`^If there are no ${COUNTER} counters on ~, sacrifice it\\.$`).exec(extra)) && !out.sacrificeIfNo && removeCounters?.counter === counterKind(m2[1]!)) out.sacrificeIfNo = counterKind(m2[1]!);
    // "If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead" (Urza's Tower): the symbols written
    // out. (Leafkin Druid's "add {G}{G} instead" is an activated mana ability with an "if" instead, mana-abilities-with-costs.)
    else if ((m2 = new RegExp(`^If (you control an Urza's [^,]+), add ((?:\\{[WUBRGC]\\}){2,}) instead\\.$`).exec(extra)) && new Set(m2[2]!.match(/[WUBRGC]/g)).size === 1 && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      const p = out.produces;
      const sym = m2[2]!.match(/[WUBRGC]/)![0];
      const n = m2[2]!.match(/\{/g)!.length;
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || p.mana.some((x) => x !== sym) || n <= p.mana.length) return null;
      out.produces = { kind: "fixed", mana: [p.mana[0]!], n: { count: { kind: "stateIf", cond }, times: n - p.mana.length, plus: p.mana.length } };
    }
    else if ((m2 = new RegExp(`^If ([^,]+), add ${NUM} \\{([WUBRGC])\\} instead\\.$`).exec(extra)) && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      // "Add {G}{G}. If you've completed a dungeon, add six {G} instead." (Undermountain Adventurer): as it resolves.
      const p = out.produces;
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || p.mana.some((x) => x !== m2![3]) || num(m2[2]!) <= p.mana.length) return null;
      out.produces = { kind: "fixed", mana: [p.mana[0]!], n: { count: { kind: "stateIf", cond }, times: num(m2[2]!) - p.mana.length, plus: p.mana.length } };
    }
    else if ((m2 = /^If ([^,]+), add (\{[WUBRGC]\}) instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "fixed" && out.produces.mana.length === 1 && !out.produces.n && !out.produces.count) {
      // River of Tears: "Add {U}. If you played a land this turn, add {B} instead." Checked as it resolves.
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if ((m2 = /^If ([^,]+), add three mana of that type instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "landsCouldProduce" && !out.produces.n) {
      // Incubation Druid: "If ~ has a +1/+1 counter on it, add three mana of that type instead."
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond) return null;
      out.insteadIf = { cond, produces: { ...out.produces, n: 3 } };
    }
    else if ((m2 = /^If ([^,]+), instead add ([^.]+)\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "fixed" && !out.produces.n && !out.produces.count) {
      // Gemstone Caverns: "If ~ has a luck counter on it, instead add one mana of any color."
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if ((m2 = /^If ([^,]+), add (.+ mana of any one color) instead\.$/.exec(extra)) && !out.insteadIf && out.produces.kind === "oneOf" && !out.produces.n) {
      // Ilysian Caryatid: "Add one mana of any color. If you control a creature with power 4 or greater, add two mana of
      // any one color instead." Checked as it resolves.
      const cond = parseStaticCondition(m2[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      const produces = parseManaProduced(m2[2]!);
      if (!cond || !produces) return null;
      out.insteadIf = { cond, produces };
    }
    else if (extra === "Activate only as an instant." && !out.instantOnly) out.instantOnly = true;
    else if ((m2 = /^Activate only ([^.]+)\.$/.exec(extra)) && !out.activateIf && !out.oncePerTurn) {
      // "Activate only if you control a Swamp", "... only once each turn", "... only during an opponent's turn" (CR 602.5b).
      const clauses = parseOnlyClauses(m2[1]!);
      if (!clauses || clauses.sorcery) return null;
      if (clauses.once) out.oncePerTurn = true;
      if (clauses.cond) out.activateIf = clauses.cond;
    }
    else if ((m2 = /^This mana can't be spent to cast (?:an? )?non([a-z]+) spells?\.$/.exec(extra)) && !out.spendOnly) {
      // A Powerstone's "can't be spent to cast a nonartifact spell": on anything but those spells (CR 111.10h).
      const spells = spellFilter(m2[1]!);
      if (!spells || !spells.types?.length) return null;
      out.spendOnly = { spells, abilities: "any", other: true, text: extra };
    } else if ((m2 = /^When that mana is spent to cast a creature spell that shares a creature type with your commander, scry (\d+)\.$/.exec(extra)) && !out.spentTrigger) {
      const text = extra.replace(/^When that mana is spent to cast a creature spell that shares a creature type with your commander, /, "");
      out.spentTrigger = { sharesCommanderType: true, body: { targets: [], effects: [{ type: "scry", n: Number(m2[1]) }], text: text[0]!.toUpperCase() + text.slice(1) } };
    } else if ((m2 = /^When that mana is spent to cast an? (red )?instant or sorcery spell, copy that spell and you may choose new targets for the copy\.$/.exec(extra)) && !out.spentTrigger) {
      // Primal Wellspring, Pyromancer's Goggles: a triggered ability of its source (CR 603.1), the spell it paid for
      // copied as the trigger resolves (CR 707.10).
      out.spentTrigger = { instantOrSorcery: true, ...(m2[1] ? { color: "R" as const } : {}), body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Copy that spell and you may choose new targets for the copy." } };
    } else if (/^Spend this mana only /.test(extra) && !out.spendOnly) {
      const only = parseManaSpend(extra);
      if (!only) return null;
      out.spendOnly = only;
    } else return null;
  }
  return out;
}

/**
 * A triggered mana ability about a permanent being tapped for mana (CR 605.1b, 106.12a): "Whenever enchanted land is
 * tapped for mana, its controller adds an additional one mana of any color." (Fertile Ground), "Whenever a player taps
 * a land for mana, that player adds one mana of any type that land produced." (Mana Flare), "Whenever you tap a Swamp
 * for mana, add an additional {B}." (Crypt Ghast). Null if the line isn't one; "fail" if it is one we can't run.
 */
export function parseManaTrigger(line: string): ManaTrigger | "fail" | null {
  let m: RegExpExecArray | null;
  let what: string;
  const out: Partial<ManaTrigger> = { text: line };
  let adds: string;
  if ((m = /^Whenever (?:(enchanted|fortified) |an? )(.+?) is tapped for mana( of the chosen color)?, its controller adds (?:an additional )?(.+)\.$/.exec(line))) {
    if (m[1]) out.attached = true;
    what = m[2]!;
    if (m[3]) out.ofChosen = true;
    adds = m[4]!;
  } else if ((m = /^Whenever (a player taps|you tap) an? (.+?) for (mana|\{[WUBRGC]\})( while you're the monarch)?, (that player adds|add) (?:an additional )?(.+)\.$/.exec(line))) {
    if ((m[1] === "you tap") !== (m[5] === "add") || (m[4] && m[1] !== "you tap")) return "fail";
    // "While you're the monarch" (Regal Behemoth): only then does it trigger (CR 725).
    if (m[4]) out.whileMonarch = true;
    m = [m[0], m[1], m[2], m[3], m[5], m[6]] as unknown as RegExpExecArray;
    if (m[1] === "you tap") out.you = true;
    // "Whenever you tap a permanent for {C}" (Forsaken Monument): only when it made one or more {C}.
    if (m[3] !== "mana") out.madeType = m[3]![1] as ManaType;
    what = m[2]!;
    adds = m[5]!;
  } else if ((m = /^Whenever a land's ability causes you to add one or more mana of the chosen color, (add an additional one mana of that color)\.$/.exec(line))) {
    // Caged Sun: any ability of a land, {T} in its cost or not (rulings), and only for its controller.
    out.you = true;
    out.anyAbility = true;
    out.ofChosen = true;
    what = "land";
    adds = "one mana of that color";
  } else return null;
  // Extraplanar Lens: "a land with the same name as the exiled card", the card its imprint ability exiled (CR 607.2a).
  const named = / with the same name as the exiled card$/.exec(what);
  if (named) {
    if (out.attached) return "fail";
    out.sameNameAsLinked = true;
    what = what.slice(0, named.index);
  }
  const filter = parseTargetPhrase(what);
  if (filter?.kind !== "object" || filter.controller || filter.chosen || filter.tapped || filter.combat) return "fail";
  out.filter = { ...filter, text: what };
  if (/^(\{[WUBRGC]\})+$/.test(adds)) out.adds = { kind: "fixed", mana: [...adds.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  else if (adds === "one mana of any color") out.adds = { kind: "anyColor", n: 1 };
  else if (adds === "two mana in any combination of colors") out.adds = { kind: "anyColor", n: 2 };
  else if (adds === "one mana of the chosen color" || (adds === "one mana of that color" && out.ofChosen)) out.adds = { kind: "chosenColor" };
  else if ((m = /^one mana of any type that (.+) produced$/.exec(adds)) && (what.endsWith(m[1]!) || (named && m[1] === "land" && what === "land"))) out.adds = { kind: "produced" };
  else return "fail";
  return out as ManaTrigger;
}

/** "Remove three spore counters from ~", "Remove a +1/+1 counter from ~" as part of a cost. */
export function removeCounterCost(part: string): { counter: CounterKind; n: number } | null {
  const m = new RegExp(`^Remove ${NUM} ${COUNTER} counters? from ~$`).exec(part);
  return m ? { counter: counterKind(m[2]!), n: num(m[1]!) } : null;
}

/**
 * What a storage land adds for the counters removed (ManaProduce "removeX"): "{B} for each storage counter removed this
 * way" after "Remove any number of", "X mana in any combination of {U} and/or {B}" after "Remove X". Null for the rest
 * ("X mana in any combination of colors": too many ways to pick from).
 */
function removedProduced(text: string, counter: CounterKind, any: boolean): ManaProduce | null {
  const each = new RegExp(`^\\{([WUBRGC])\\} for each ${COUNTER} counter removed this way$`).exec(text);
  if (any && each && counterKind(each[2]!) === counter) return { kind: "removeX", counter, colors: [each[1] as ManaType], min: 0 };
  const combo = /^X mana in any combination of \{([WUBRG])\} and\/or \{([WUBRG])\}$/.exec(text);
  if (!any && combo && combo[1] !== combo[2]) return { kind: "removeX", counter, colors: [combo[1] as ManaType, combo[2] as ManaType], min: 1 };
  return null;
}

function parseManaProduced(text: string): ManaProduce | null {
  const sym = (x: string) => /^\{([WUBRGC])\}$/.exec(x)?.[1] as ManaType | undefined;
  if (/^(\{[WUBRGC]\})+$/.test(text)) return { kind: "fixed", mana: [...text.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  // "{W} or {U}", "{R}, {G}, or {W}"
  const parts = text.split(/, or |, | or /);
  if (parts.length > 1 && parts.every((x) => sym(x))) return { kind: "oneOf", options: parts.map((x) => sym(x)!), amount: 1 };
  // "{W}{W}, {W}{U}, or {U}{U}": one of these combinations (filter lands).
  if (parts.length > 1 && parts.every((x) => /^(\{[WUBRGC]\})+$/.test(x))) return { kind: "combos", options: parts.map((x) => [...x.matchAll(/\{([WUBRGC])\}/g)].map((y) => y[1] as ManaType)) };
  // "Add six {G}" (Castle Garenbrig): the symbol that many times.
  const many = new RegExp(`^${NUM} (\\{[WUBRGC]\\})$`).exec(text);
  if (many && num(many[1]!) > 1) return { kind: "fixed", mana: Array<ManaType>(num(many[1]!)).fill(sym(many[2]!)!) };
  const any = new RegExp(`^${NUM} mana of any (?:one )?color$`).exec(text);
  if (any) return { kind: "oneOf", options: ALL_COLORS, amount: num(any[1]!) };
  if (text === "one mana of any color in your commander's color identity") return { kind: "commanderIdentity" };
  const could = /^one mana of any (color|type) that a (land|Gate) (you control|an opponent controls) could produce$/.exec(text);
  if (could) return { kind: "landsCouldProduce", whose: could[3] === "you control" ? "you" : "opponent", ...(could[1] === "type" ? { anyType: true } : {}), ...(could[2] === "Gate" ? { subtype: "Gate" } : {}) };
  // "one mana of the chosen color", "{B} or one mana of the chosen color" (chosen as it entered).
  const chosen = /^(?:(\{[WUBRGC]\}) or )?one mana of the chosen color$/.exec(text);
  if (chosen) return { kind: "chosenColor", ...(chosen[1] ? { also: sym(chosen[1])! } : {}) };
  // "Four mana of the chosen color" (Throne of Eldraine).
  const chosenN = new RegExp(`^${NUM} mana of the chosen color$`).exec(text);
  if (chosenN && num(chosenN[1]!) > 1) return { kind: "chosenColor", n: num(chosenN[1]!) };
  // "an amount of {G} equal to ~'s power", "X mana of any one color, where X is the number of Elves on the battlefield".
  // A static count: "~" is the permanent, "you" its controller.
  const amount = /^an amount of (\{[WUBRGC]\}) equal to (.+)$/.exec(text);
  if (amount) {
    const n = parseCount(amount[2]!, null);
    return n && { kind: "fixed", mana: [sym(amount[1]!)!], n };
  }
  // "Two mana in any combination of colors", "X mana in any combination of colors, where X is ..." (Selvala).
  const combo = new RegExp(`^(?:${NUM}|(X)) mana in any combination of colors(?:, where X is (.+))?$`).exec(text);
  if (combo && !!combo[2] === !!combo[3]) {
    if (!combo[2]) return num(combo[1]!) > 1 ? { kind: "anyColors", n: num(combo[1]!) } : null;
    const n = parseCount(combo[3]!, null);
    return n && { kind: "anyColors", n };
  }
  // "Two mana in any combination of {U}, {B}, and/or {R}" (Relic of Sauron): only those colors.
  const some = new RegExp(`^${NUM} mana in any combination of ((?:\\{[WUBRG]\\}, )*\\{[WUBRG]\\},? and/or \\{[WUBRG]\\})$`).exec(text);
  if (some && num(some[1]!) > 1) {
    const colors = [...some[2]!.matchAll(/\{([WUBRG])\}/g)].map((x) => x[1] as Color);
    return new Set(colors).size === colors.length ? { kind: "anyColors", n: num(some[1]!), colors } : null;
  }
  // "X mana in any combination of {U} and/or {R}, where X is ~'s power" (Vivi Ornitier).
  const two = /^X mana in any combination of \{([WUBRG])\} and\/or \{([WUBRG])\}, where X is (.+)$/.exec(text);
  if (two && two[1] !== two[2]) {
    const n = parseCount(two[3]!, null);
    return n && { kind: "anyColors", n, colors: [two[1] as Color, two[2] as Color] };
  }
  const xAny = /^X mana of any one color, where X is (.+)$/.exec(text);
  if (xAny) {
    const n = parseCount(xAny[1]!, null);
    return n && { kind: "oneOf", options: ALL_COLORS, amount: 1, n };
  }
  // "One mana of any color among legendary creatures and planeswalkers you control" (Mox Amber), "... among legendary
  // permanents you control" (Plaza of Heroes); "one mana of any of the exiled card's colors" (Chrome Mox: the card its
  // imprint ability exiled, linked in compile.ts).
  if (text === "one mana of any of the exiled card's colors") return { kind: "colorsAmong", linked: true };
  const among = /^one mana of any color among (legendary )?(.+?) you control$/.exec(text);
  if (among) {
    const words = among[2]!.split(/ and | or /).map((w) => singular(w));
    const spec = parseTargetPhrase(`${words.join(" or ")} you control`);
    if (spec?.kind !== "object" || spec.supertypes || spec.chosen) return null;
    return { kind: "colorsAmong", filter: { ...spec, ...(among[1] ? { supertypes: ["Legendary"] } : {}), text: `${among[1] ?? ""}${among[2]} you control` } };
  }
  // "One mana of any color among legendary creature cards in your graveyard" (The Grey Havens).
  const yard = /^one mana of any color among (.+?) cards in your graveyard$/.exec(text);
  if (yard) {
    const spec = parseTargetPhrase(`${yard[1]} card from a graveyard`);
    if (spec?.kind !== "card" || spec.chosen) return null;
    return { kind: "colorsAmong", filter: { ...spec, text: `${yard[1]} cards in your graveyard` }, inYard: true };
  }
  if (text === "one mana of each color among permanents you control") return { kind: "eachColorAmong" };
  if (text === "an amount of mana of the chosen color equal to your devotion to that color") return { kind: "devotion" };
  const each = /^(\{[WUBRGC]\}) for each (.+) you control$/.exec(text);
  if (each) {
    const spec = parseTargetPhrase(each[2]!);
    if (spec?.kind !== "object") return null;
    return { kind: "fixed", mana: [sym(each[1]!)!], count: { ...spec, controller: "you", text: `${each[2]} you control` } };
  }
  return null;
}

/**
 * "Spend this mana only to cast a creature spell.", "... to cast instant and sorcery spells.", "... to activate
 * abilities.", "... to cast artifact spells or activate abilities of artifacts." (CR 106.6). Null for anything else
 * ("of the chosen type", "on costs that contain {X}", "and that spell can't be countered", "... source").
 */
export function parseManaSpend(sentence: string): ManaSpend | null {
  // "This mana can't be spent to cast nonartifact spells" (Karn, Legacy Reforged): on anything but those spells (CR 106.6).
  const cant = /^This mana can't be spent to cast (?:an? )?non([a-z]+) spells?\.$/.exec(sentence);
  if (cant) {
    const spells = spellFilter(cant[1]!);
    return spells?.types?.length ? { spells, abilities: "any", other: true, text: sentence } : null;
  }
  // "Spend this mana only to cast monocolored spells of that color" (Throne of Eldraine): of the color chosen for its source.
  if (sentence === "Spend this mana only to cast monocolored spells of that color.") return { text: sentence, spells: { kind: "spell", colorCount: "monocolored", chosen: "color", text: "monocolored spells of the chosen color" } };
  // "Only to cast a Dragon spell or an Omen spell" (Maelstrom of the Spirit Dragon): a spell with either subtype (an Omen
  // half is "Sorcery — Omen", CR 205.3k).
  const m = /^Spend this mana only to (.+?)(, and that spell can't be countered)?\.$/.exec(sentence.replace(/^Spend this mana only to cast an? (\w+) spell or an? (\w+) spell\.$/, "Spend this mana only to cast $1 or $2 spells."));
  if (!m) return null;
  const only: ManaSpend = { text: sentence, ...(m[2] ? { uncounterable: true as const } : {}) };
  // "Of the chosen type" (Unclaimed Territory): the type its source's controller chose for it (see spend.ts boundSpend).
  for (const part of m[1]!.split(/,? or (?=activate |cast )/)) {
    let x: RegExpExecArray | null;
    if ((x = /^cast (?:an? )?(.+? spells? of the chosen type|.+?) spells?$/.exec(part) ?? /^cast (?:an? )?(.+? spells? of the chosen type)$/.exec(part)) && !only.spells) {
      const spec = spellFilter(x[1]!);
      if (!spec) return null;
      only.spells = spec;
    } else if (part === "cast spells" && !only.spells) only.spells = { kind: "spell", text: "spells" };
    else if ((part === "activate abilities" || part === "activate an ability") && !only.abilities) only.abilities = "any";
    else if ((x = /^activate (?:abilities of|an ability of an?) (.+?)( sources?)?( of the chosen type)?$/.exec(part)) && !only.abilities) {
      const words = x[1]!.split(" ");
      const spec = parseTargetPhrase([...words.slice(0, -1), singular(words[words.length - 1]!)].join(" "));
      if (spec?.kind !== "object" || spec.controller || spec.chosen || spec.counter || spec.tapped || spec.combat || spec.token) return null;
      only.abilities = { ...spec, ...(x[3] ? { chosen: "type" as const } : {}), text: `${x[1]!}${x[2] ?? ""}${x[3] ?? ""}` };
      // "Abilities of artifacts" are of artifact permanents (CR 109.2); an "artifact source" can be anywhere.
      if (x[2]) only.anyZone = true;
    } else return null;
  }
  // "That spell" is a spell this mana is spent on.
  if (only.uncounterable && (!only.spells || only.abilities)) return null;
  return only;
}

/** "creature", "instant and sorcery", "noncreature", "Dragon": a filter on the spell's characteristics. */
function spellFilter(words0: string): TargetSpec | null {
  if (words0 === "legendary") return { kind: "spell", supertypes: ["Legendary"], text: "legendary spells" };
  // "A creature spell of the chosen type" (Unclaimed Territory).
  const chosen = / spells? of the chosen type$/.test(words0);
  const words = words0.replace(/ spells? of the chosen type$/, "");
  const spec = parseTargetPhrase(`${words.replace(/ and(?:\/or)? /g, " or ")} spell`);
  if (spec?.kind !== "spell" || spec.chosen || spec.counter || spec.controller) return null;
  return { ...spec, ...(chosen ? { chosen: "type" as const } : {}), text: chosen ? words0 : `${words0} spells` };
}

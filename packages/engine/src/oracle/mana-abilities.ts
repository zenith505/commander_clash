import type { CounterKind, ManaAbility, ManaProduce, ManaSpend, ManaTrigger, TargetSpec } from "../abilities";
import type { ManaType } from "../types";
import { NUM, num, COUNTER, counterKind, ALL_COLORS, sacrificeSelf, singular } from "./words";
import { energyIn } from "./activated";
import { parseTargetPhrase, pickFilter } from "./targets";

/**
 * A mana ability (CR 605.1a): "{T}: Add {G}.", "{T}: Add {W} or {U}. ~ deals 1 damage to you.",
 * "{1}, {T}: Add {W}{U}.", "{T}, Sacrifice ~: Add one mana of any color.", "{T}: Add {C}{C}.",
 * "{T}: Add {G} for each creature you control.", "Sacrifice ~: Add {C}." Null if the line isn't one
 * we can run (mana that can only be spent on some spells, "in any combination", ...).
 */
export function parseManaAbility(line: string): ManaAbility | null {
  const part = String.raw`\{[^}]+\}|Sacrifice ~|Pay \d+ life|Pay (?:\{E\})+|Remove (?:a|an|one|two|three|four|five) [a-z]+ counters? from ~|Tap (?:an|one|two|three) untapped [^,:]+? you control`;
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
  for (const c of costs) {
    const rc = removeCounterCost(c);
    const tc = new RegExp(`^Tap ${NUM} untapped (.+) you control$`).exec(c);
    if (rc) removeCounters = rc;
    else if (tc) {
      const filter = pickFilter(tc[2]!);
      if (!filter || tapCost) return null;
      tapCost = { kind: "tap", filter: { ...filter, text: `untapped ${filter.text} you control` }, n: num(tc[1]!), ...(costs.includes("{T}") ? { other: true } : {}) };
    }
    else if (c === "{T}") tap = true;
    else if (c === "Sacrifice ~") sacrificeSelf = true;
    else if (/^Pay \d+ life$/.test(c)) lifeCost = Number(/\d+/.exec(c)![0]);
    else if (/^Pay (\{E\})+$/.test(c)) energyCost = energyIn(c);
    else if (/^(\{(\d+|[WUBRGC])\})+$/.test(c)) manaCost += c;
    else return null;
  }
  const produces = parseManaProduced(m[2]!);
  if (!produces) return null;
  const out: ManaAbility = { text: line, manaCost, tap, sacrificeSelf, produces, ...(lifeCost ? { lifeCost } : {}), ...(energyCost ? { energyCost } : {}), ...(removeCounters ? { removeCounters } : {}), ...(tapCost ? { tapCost } : {}) };
  let m2: RegExpExecArray | null;
  for (const extra of (m[3] ?? "").split(/(?<=\.) /).map((x) => x.trim()).filter(Boolean)) {
    const dmg = new RegExp(`^~ deals ${NUM} damage to you\\.$`).exec(extra);
    if (dmg) out.selfDamage = num(dmg[1]!);
    else if (extra === "~ doesn't untap during your next untap step.") out.skipNextUntap = true;
    else if (extra === "Activate only once each turn.") out.oncePerTurn = true;
    else if ((m2 = /^This mana can't be spent to cast (?:an? )?non([a-z]+) spells?\.$/.exec(extra)) && !out.spendOnly) {
      // A Powerstone's "can't be spent to cast a nonartifact spell": on anything but those spells (CR 111.10h).
      const spells = spellFilter(m2[1]!);
      if (!spells || !spells.types?.length) return null;
      out.spendOnly = { spells, abilities: "any", other: true, text: extra };
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
  } else if ((m = /^Whenever (a player taps|you tap) an? (.+?) for mana, (that player adds|add) (?:an additional )?(.+)\.$/.exec(line))) {
    if ((m[1] === "you tap") !== (m[3] === "add")) return "fail";
    if (m[1] === "you tap") out.you = true;
    what = m[2]!;
    adds = m[4]!;
  } else return null;
  const filter = parseTargetPhrase(what);
  if (filter?.kind !== "object" || filter.controller || filter.chosen || filter.tapped || filter.combat) return "fail";
  out.filter = { ...filter, text: what };
  if (/^(\{[WUBRGC]\})+$/.test(adds)) out.adds = { kind: "fixed", mana: [...adds.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  else if (adds === "one mana of any color") out.adds = { kind: "anyColor", n: 1 };
  else if (adds === "two mana in any combination of colors") out.adds = { kind: "anyColor", n: 2 };
  else if (adds === "one mana of the chosen color" || (adds === "one mana of that color" && out.ofChosen)) out.adds = { kind: "chosenColor" };
  else if ((m = /^one mana of any type that (.+) produced$/.exec(adds)) && what.endsWith(m[1]!)) out.adds = { kind: "produced" };
  else return "fail";
  return out as ManaTrigger;
}

/** "Remove three spore counters from ~", "Remove a +1/+1 counter from ~" as part of a cost. */
export function removeCounterCost(part: string): { counter: CounterKind; n: number } | null {
  const m = new RegExp(`^Remove ${NUM} ${COUNTER} counters? from ~$`).exec(part);
  return m ? { counter: counterKind(m[2]!), n: num(m[1]!) } : null;
}

function parseManaProduced(text: string): ManaProduce | null {
  const sym = (x: string) => /^\{([WUBRGC])\}$/.exec(x)?.[1] as ManaType | undefined;
  if (/^(\{[WUBRGC]\})+$/.test(text)) return { kind: "fixed", mana: [...text.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  // "{W} or {U}", "{R}, {G}, or {W}"
  const parts = text.split(/, or |, | or /);
  if (parts.length > 1 && parts.every((x) => sym(x))) return { kind: "oneOf", options: parts.map((x) => sym(x)!), amount: 1 };
  const any = new RegExp(`^${NUM} mana of any (?:one )?color$`).exec(text);
  if (any) return { kind: "oneOf", options: ALL_COLORS, amount: num(any[1]!) };
  if (text === "one mana of any color in your commander's color identity") return { kind: "commanderIdentity" };
  // "one mana of the chosen color", "{B} or one mana of the chosen color" (chosen as it entered).
  const chosen = /^(?:(\{[WUBRGC]\}) or )?one mana of the chosen color$/.exec(text);
  if (chosen) return { kind: "chosenColor", ...(chosen[1] ? { also: sym(chosen[1])! } : {}) };
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
  const m = /^Spend this mana only to (.+)\.$/.exec(sentence);
  if (!m) return null;
  const only: ManaSpend = { text: sentence };
  for (const part of m[1]!.split(/,? or (?=activate |cast )/)) {
    let x: RegExpExecArray | null;
    if ((x = /^cast (?:an? )?(.+?) spells?$/.exec(part)) && !only.spells) {
      const spec = spellFilter(x[1]!);
      if (!spec) return null;
      only.spells = spec;
    } else if (part === "cast spells" && !only.spells) only.spells = { kind: "spell", text: "spells" };
    else if ((part === "activate abilities" || part === "activate an ability") && !only.abilities) only.abilities = "any";
    else if ((x = /^activate (?:abilities of|an ability of an?) (.+?)( sources?)?$/.exec(part)) && !only.abilities) {
      const words = x[1]!.split(" ");
      const spec = parseTargetPhrase([...words.slice(0, -1), singular(words[words.length - 1]!)].join(" "));
      if (spec?.kind !== "object" || spec.controller || spec.chosen || spec.counter || spec.tapped || spec.combat || spec.token) return null;
      only.abilities = { ...spec, text: `${x[1]!}${x[2] ?? ""}` };
      // "Abilities of artifacts" are of artifact permanents (CR 109.2); an "artifact source" can be anywhere.
      if (x[2]) only.anyZone = true;
    } else return null;
  }
  return only;
}

/** "creature", "instant and sorcery", "noncreature", "Dragon": a filter on the spell's characteristics. */
function spellFilter(words: string): TargetSpec | null {
  if (words === "legendary") return { kind: "spell", supertypes: ["Legendary"], text: "legendary spells" };
  const spec = parseTargetPhrase(`${words.replace(/ and(?:\/or)? /g, " or ")} spell`);
  if (spec?.kind !== "spell" || spec.chosen || spec.counter || spec.controller) return null;
  return { ...spec, text: `${words} spells` };
}

import type { ActivatedAbility, AdditionalCost } from "../abilities";
import { NUM, num, X, sacrificeSelf } from "./words";
import { removeCounterCost } from "./mana-abilities";
import { parseBody, usesX } from "./body";
import { parseSearchFilter } from "./search";
import { pickFilter } from "./targets";
import { parseStaticCondition } from "./statics";

/** The ability words (CR 207.2c): no rules meaning, unlike keyword abilities written the same way ("Boast — {1}{R}: ..."). */
const ABILITY_WORDS = new Set(["adamant", "addendum", "alliance", "battalion", "bloodrush", "celebration", "channel", "chroma", "cohort", "constellation", "converge", "council's dilemma", "coven", "delirium", "descend 4", "descend 8", "disappear", "domain", "eerie", "eminence", "enrage", "fateful hour", "fathomless descent", "ferocious", "flurry", "formidable", "grandeur", "hellbent", "heroic", "imprint", "infusion", "inspired", "join forces", "kinship", "landfall", "lieutenant", "magecraft", "metalcraft", "morbid", "opus", "pack tactics", "paradox", "parley", "radiance", "raid", "rally", "renew", "repartee", "revolt", "secret council", "spell mastery", "strive", "survival", "sweep", "tempting offer", "threshold", "undergrowth", "valiant", "vivid", "void", "will of the council"]);

export function parseActivated(raw: string): ActivatedAbility | "fail" | null {
  const word = /^([A-Z][A-Za-z' 0-9]+) — /.exec(raw);
  const line = word && ABILITY_WORDS.has(word[1]!.toLowerCase()) ? raw.slice(word[0].length) : raw;
  // Costs: mana symbols run together ("{1}{R}"), other parts are comma-separated ("{2}, {T}, Sacrifice ~").
  const piece = String.raw`(?:\{[^}]+\})+|Sacrifice ~|Exile ~ from your graveyard|Remove (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) (?:[+-]1/[+-]1|[a-z]+) counters? from ~|Pay \d+ life|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?|Tap (?:an|one|two|three|four|five) untapped [^,:]+? you control`;
  const m = new RegExp(`^((?:${piece})(?:, (?:${piece}))*): (.+)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!;
  // Sacrificing other permanents or discarding cards as part of the cost (CR 602.2b, 601.2h).
  const extra: AdditionalCost[] = [];
  let removeCounters: ActivatedAbility["removeCounters"];
  for (const part of costs.split(", ")) {
    let c: RegExpExecArray | null;
    if (/^Remove /.test(part)) {
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
    } else if ((c = new RegExp(`^Discard ${NUM} (?:(.+?) )?cards?$`).exec(part))) {
      const filter = c[2] ? parseSearchFilter(`${c[2]} card`) : undefined;
      if (filter === null) return "fail";
      extra.push({ kind: "discard", n: num(c[1]!), ...(filter ? { filter } : {}) });
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
  // "Activate only if you have the city's blessing." (CR 602.5b): a condition checked as it's activated.
  let activateIf: ActivatedAbility["activateIf"];
  const onlyIf = / Activate only if ([^.]+)\.$/.exec(effectText);
  if (onlyIf) {
    activateIf = parseStaticCondition(onlyIf[1]!, { affects: { kind: "self" }, mods: [], text: "" }) ?? undefined;
    if (!activateIf) return "fail";
    effectText = effectText.slice(0, onlyIf.index);
  }
  const life = /Pay (\d+) life/.exec(costs);
  const energy = energyIn(costs);
  if (energy < 0) return "fail";
  const symbols = [...costs.replace(/Pay (?:\{E\})+|Pay \w+ \{E\}/, "").matchAll(/\{([^}]+)\}/g)].map((x) => x[1]!);
  if (symbols.some((x) => x === "Q" || x === "E")) return "fail";
  const tap = symbols.includes("T");
  // "{3}, Exile this card from your graveyard: ...": it works only from your graveyard (CR 113.6j).
  const fromYard = /Exile ~ from your graveyard/.test(costs);
  if (fromYard && (tap || /Sacrifice ~|Remove /.test(costs))) return "fail";
  const manaCost = symbols
    .filter((x) => x !== "T")
    .map((x) => `{${x}}`)
    .join("");
  // "Sacrifice ~: It deals damage equal to its power to ...": "it" is the source.
  const body = parseBody(effectText.replace(/^It (?=deals\b)/, "~ "), { activated: true });
  if (!body) return "fail";
  // X in the effect is the X paid in the cost (CR 107.3a); with none to pay, it isn't defined.
  if (usesX(body) && !symbols.includes("X")) return "fail";
  return {
    manaCost,
    tap,
    sacrificeSelf: /Sacrifice ~/.test(costs),
    sorcerySpeed,
    body,
    text: raw,
    ...(fromYard ? { zone: "graveyard" as const, exileSelf: true } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(activateIf ? { activateIf } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(energy ? { energyCost: energy } : {}),
    ...(extra.length ? { costs: extra } : {}),
    ...(removeCounters ? { removeCounters } : {}),
  };
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

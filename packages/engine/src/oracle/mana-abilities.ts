import type { CounterKind, ManaAbility, ManaProduce } from "../abilities";
import type { ManaType } from "../types";
import { NUM, num, COUNTER, counterKind, ALL_COLORS, sacrificeSelf } from "./words";
import { energyIn } from "./activated";
import { parseTargetPhrase } from "./targets";

/**
 * A mana ability (CR 605.1a): "{T}: Add {G}.", "{T}: Add {W} or {U}. ~ deals 1 damage to you.",
 * "{1}, {T}: Add {W}{U}.", "{T}, Sacrifice ~: Add one mana of any color.", "{T}: Add {C}{C}.",
 * "{T}: Add {G} for each creature you control.", "Sacrifice ~: Add {C}." Null if the line isn't one
 * we can run (mana that can only be spent on some spells, "in any combination", ...).
 */
export function parseManaAbility(line: string): ManaAbility | null {
  const part = String.raw`\{[^}]+\}|Sacrifice ~|Pay \d+ life|Pay (?:\{E\})+|Remove (?:a|an|one|two|three|four|five) [a-z]+ counters? from ~`;
  const m = new RegExp(`^((?:${part})(?:, (?:${part}))*): Add ([^.]+)\\.((?: [^.]+\\.)*)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!.split(", ");
  let tap = false;
  let sacrificeSelf = false;
  let manaCost = "";
  let lifeCost: number | undefined;
  let energyCost: number | undefined;
  let removeCounters: ManaAbility["removeCounters"];
  for (const c of costs) {
    const rc = removeCounterCost(c);
    if (rc) removeCounters = rc;
    else if (c === "{T}") tap = true;
    else if (c === "Sacrifice ~") sacrificeSelf = true;
    else if (/^Pay \d+ life$/.test(c)) lifeCost = Number(/\d+/.exec(c)![0]);
    else if (/^Pay (\{E\})+$/.test(c)) energyCost = energyIn(c);
    else if (/^(\{(\d+|[WUBRGC])\})+$/.test(c)) manaCost += c;
    else return null;
  }
  const produces = parseManaProduced(m[2]!);
  if (!produces) return null;
  const out: ManaAbility = { text: line, manaCost, tap, sacrificeSelf, produces, ...(lifeCost ? { lifeCost } : {}), ...(energyCost ? { energyCost } : {}), ...(removeCounters ? { removeCounters } : {}) };
  for (const extra of (m[3] ?? "").split(/(?<=\.) /).map((x) => x.trim()).filter(Boolean)) {
    const dmg = new RegExp(`^~ deals ${NUM} damage to you\\.$`).exec(extra);
    if (dmg) out.selfDamage = num(dmg[1]!);
    else if (extra === "~ doesn't untap during your next untap step.") out.skipNextUntap = true;
    else if (extra === "Activate only once each turn.") out.oncePerTurn = true;
    else return null;
  }
  return out;
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

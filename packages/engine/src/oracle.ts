// Compiles a card's oracle text into the effect language in abilities.ts.
//
// This is a pattern-based compiler over Wizards' templated rules text. It handles the
// most common templates (damage, draw, life, removal, counters, pumps, tokens, mill,
// counterspells, ETB/dies/attack/upkeep/end-step triggers, and activated abilities) and
// reports every line it can't compile, so we always know which cards fully work.
// Anything it can't handle can later get a hand-written override keyed by oracle id.

import { allEffects } from "./abilities";
import type {
  AbilityBody,
  Amount,
  CounterKind,
  AmountExpr,
  Count,
  ActivatedAbility,
  ChoiceKind,
  TriggeredAbility,
  Affects,
  CompiledCard,
  Modification,
  StaticAbility,
  StaticCondition,
  CostMod,
  DamageRecipient,
  Effect,
  EntersChoice,
  EntersCondition,
  ManaAbility,
  ManaProduce,
  ObjRef,
  PlayerRef,
  SearchDest,
  SpellCondition,
  AdditionalCost,
  TargetSpec,
  TokenSpec,
  TriggerEvent,
  UnlessPays,
  PayCost,
  CastFromGraveyard,
  AltCostKind,
  EntersOption,
} from "./abilities";
import { canonicalKeyword, CHOSEN_PROTECTION, CREATURE_TYPES, stripReminder } from "./keywords";
import { parseManaCost } from "./mana";
import { substituteX } from "./amounts";
import { withModes } from "./modes";
import type { CardDef, Color, FaceDownKind, ManaType } from "./types";

const cache = new Map<string, CompiledCard>();

export function compileCard(d: CardDef): CompiledCard {
  const hit = cache.get(d.oracleId);
  if (hit) return hit;
  const out = compile(d);
  if (d.oracleId === MONARCH.oracleId) out.triggers = MONARCH_TRIGGERS;
  cache.set(d.oracleId, out);
  return out;
}

/**
 * Stands in as the "source" of the monarch's two inherent triggered abilities, which have none
 * (CR 725.2): the game puts it in `s.cards` when someone first becomes the monarch.
 */
export const MONARCH: CardDef = {
  oracleId: "monarch",
  name: "The monarch",
  manaCost: "",
  cmc: 0,
  typeLine: "",
  supertypes: [],
  types: [],
  subtypes: [],
  oracleText: "",
  colors: [],
  colorIdentity: [],
  keywords: [],
};
const MONARCH_TRIGGERS: TriggeredAbility[] = [
  {
    event: "monarchEndStep",
    body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "At the beginning of the monarch's end step, that player draws a card." },
  },
  {
    event: "monarchDamaged",
    body: {
      targets: [],
      effects: [{ type: "becomeMonarch", who: { ref: "subjectController" } }],
      text: "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.",
    },
  },
];

/** Card types/subtypes whose rules we don't model yet, whatever their text says. */
const UNSUPPORTED_TYPES = ["Planeswalker", "Battle", "Kindred", "Tribal", "Dungeon"];
const UNSUPPORTED_SUBTYPES = ["Saga", "Class", "Case", "Room", "Siege", "Background", "Spacecraft"];

/**
 * True when the engine executes everything the card does. Unsupported cards can still be
 * played, but some of their text does nothing yet, so decks and the UI flag them.
 */
export function isFullySupported(d: CardDef): boolean {
  // Split, adventure, flip and double-faced cards (CR 709-712) need their faces modeled: today
  // only the first face's text is compiled and the mana costs of both halves run together.
  if (d.name.includes(" // ")) return false;
  const cost = parseManaCost(d.manaCost);
  if (!cost.supported) return false;
  if (d.types.some((t) => UNSUPPORTED_TYPES.includes(t)) || d.subtypes.some((t) => UNSUPPORTED_SUBTYPES.includes(t))) return false;
  const c = compileCard(d);
  // Creatures, and Vehicles that can become creatures (CR 301.7a), need numbers for power and toughness,
  // or a characteristic-defining ability that says what a "*" is (CR 604.3).
  const defined = c.statics.flatMap((st) => st.mods).find((x) => x.kind === "definePT");
  const ptOk = (v: string | undefined, key: "power" | "toughness") => /^\d+$/.test(v ?? "") || (/\*/.test(v ?? "") && defined?.kind === "definePT" && defined[key] !== undefined);
  if ((d.types.includes("Creature") || d.subtypes.includes("Vehicle")) && (!ptOk(d.power, "power") || !ptOk(d.toughness, "toughness"))) return false;
  if (c.unsupported.length) return false;
  if ((d.types.includes("Instant") || d.types.includes("Sorcery")) && !c.spell) return false;
  if (d.subtypes.includes("Aura") && !c.enchant) return false;
  return true;
}

/**
 * What casting this card targets: a spell's targets (for a modal spell, those of the chosen
 * modes, CR 700.2c), or what an Aura enchants (CR 303.4a).
 */
export function spellTargetSpecs(d: CardDef, modes?: number[]): TargetSpec[] {
  const c = compileCard(d);
  if (c.spell) return withModes(c.spell, modes).targets;
  return c.enchant ? [c.enchant] : [];
}

/**
 * The spell's effect as a body, for deciding what to target: a spell's text, or for an
 * Aura, what it will do to the enchanted permanent.
 */
export function castingBody(d: CardDef): AbilityBody | undefined {
  const c = compileCard(d);
  if (c.spell) return c.spell;
  if (!c.enchant) return undefined;
  const effects: Effect[] = c.statics
    .filter((st) => st.affects.kind === "attached")
    .map((st) => ({ type: "continuous", what: { ref: "target", index: 0 }, mods: st.mods, duration: "game" }));
  return { targets: [c.enchant], effects, text: d.oracleText };
}

// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const num = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);
/** Like NUM, but X too (CR 107.3). */
const NUMX = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)";
/** Counter kinds effects can put on permanents (see CounterKind). */
const COUNTER = "([+-]1/[+-]1|stun|shield)";
const counterKind = (t: string): CounterKind => (t === "-1/-1" || t === "stun" || t === "shield" ? t : "+1/+1");
const X: AmountExpr = { count: { kind: "x" } };
const amt = (s: string): Amount => (s === "X" ? X : num(s));
/** A power/toughness change: "+2", "-1", "+X", "-X". */
const PT = "([+-](?:\\d+|X))";
const ptAmt = (s: string): Amount => (s === "+X" ? X : s === "-X" ? { count: { kind: "x" }, negate: true } : Number(s));

const COLOR_WORDS: Record<string, Color> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const TYPE_WORDS: Record<string, string> = {
  creature: "Creature", artifact: "Artifact", enchantment: "Enchantment", land: "Land",
  planeswalker: "Planeswalker", battle: "Battle", instant: "Instant", sorcery: "Sorcery",
};
/** A keyword the engine implements, spelled its way; "protection from the chosen color" only where a choice fills it in. */
const keywordOf = (p: string, chosen = false) => {
  const k = canonicalKeyword(p);
  return k === CHOSEN_PROTECTION && !chosen ? undefined : k;
};

const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/**
 * A mana ability (CR 605.1a): "{T}: Add {G}.", "{T}: Add {W} or {U}. ~ deals 1 damage to you.",
 * "{1}, {T}: Add {W}{U}.", "{T}, Sacrifice ~: Add one mana of any color.", "{T}: Add {C}{C}.",
 * "{T}: Add {G} for each creature you control.", "Sacrifice ~: Add {C}." Null if the line isn't one
 * we can run (mana that can only be spent on some spells, "in any combination", ...).
 */
export function parseManaAbility(line: string): ManaAbility | null {
  const m = /^((?:\{[^}]+\}|Sacrifice ~|Pay \d+ life|Pay (?:\{E\})+)(?:, (?:\{[^}]+\}|Sacrifice ~|Pay \d+ life|Pay (?:\{E\})+))*): Add ([^.]+)\.((?: [^.]+\.)*)$/.exec(line);
  if (!m) return null;
  const costs = m[1]!.split(", ");
  let tap = false;
  let sacrificeSelf = false;
  let manaCost = "";
  let lifeCost: number | undefined;
  let energyCost: number | undefined;
  for (const c of costs) {
    if (c === "{T}") tap = true;
    else if (c === "Sacrifice ~") sacrificeSelf = true;
    else if (/^Pay \d+ life$/.test(c)) lifeCost = Number(/\d+/.exec(c)![0]);
    else if (/^Pay (\{E\})+$/.test(c)) energyCost = energyIn(c);
    else if (/^(\{(\d+|[WUBRGC])\})+$/.test(c)) manaCost += c;
    else return null;
  }
  const produces = parseManaProduced(m[2]!);
  if (!produces) return null;
  const out: ManaAbility = { text: line, manaCost, tap, sacrificeSelf, produces, ...(lifeCost ? { lifeCost } : {}), ...(energyCost ? { energyCost } : {}) };
  for (const extra of (m[3] ?? "").split(/(?<=\.) /).map((x) => x.trim()).filter(Boolean)) {
    const dmg = new RegExp(`^~ deals ${NUM} damage to you\\.$`).exec(extra);
    if (dmg) out.selfDamage = num(dmg[1]!);
    else if (extra === "~ doesn't untap during your next untap step.") out.skipNextUntap = true;
    else if (extra === "Activate only once each turn.") out.oncePerTurn = true;
    else return null;
  }
  return out;
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

const QUOTED_SOURCE_NAME = "\u27easource\u27eb";

/** Replace every way a card refers to itself with "~". */
export function normalizeSelf(d: CardDef): string {
  let t = stripReminder(d.oracleText);
  const full = d.name.split(" // ")[0]!;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // In a quoted ability the card gives something else, its name still means the card (CR 201.5a), not the
  // object with the ability, which is "~" there: mark it so that text isn't compiled as "~".
  if (full) {
    t = t.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(esc(full), "g"), QUOTED_SOURCE_NAME));
    t = t.replace(new RegExp(esc(full), "g"), "~");
  }
  const short = full.split(",")[0]!;
  if (short && short !== full) {
    t = t.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(`\\b${esc(short)}\\b`, "g"), QUOTED_SOURCE_NAME));
    t = t.replace(new RegExp(`\\b${esc(short)}\\b`, "g"), "~");
  }
  // 'Equipped creature has "... sacrifice this Equipment"': the Equipment, not the creature.
  t = t.replace(/"[^"]*"/g, (q) => q.replace(/\b[Tt]his (Equipment|Aura)\b/g, QUOTED_SOURCE_NAME));
  t = t.replace(/\b[Tt]his (creature|artifact|enchantment|land|permanent|spell|card|token|Equipment|Vehicle|Aura)\b/g, "~");
  return t;
}

function compile(d: CardDef): CompiledCard {
  const out: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  const spellLines: string[] = [];
  const lines = joinModes(normalizeSelf(d).split("\n"));
  for (const [li, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const manaAb = parseManaAbility(line);
    if (manaAb) {
      out.mana.push(manaAb);
      continue;
    }
    const backup = /^Backup (\d+)((?:, backup \d+)*)$/.exec(line);
    if (backup) {
      const ns = [backup[1]!, ...[...backup[2]!.matchAll(/\d+/g)].map((x) => x[0])].map(Number);
      const tr = backupTriggers(ns, lines.slice(li + 1));
      if (tr) out.triggers.push(...tr);
      else out.unsupported.push(raw);
      continue;
    }
    const yard = parseGraveyardKeyword(line, d);
    if (yard !== null) {
      if (yard === "fail") out.unsupported.push(raw);
      else if ("fromGraveyard" in yard) (out.fromGraveyard ??= []).push(yard.fromGraveyard);
      else if ("buyback" in yard) out.buyback = yard.buyback;
      else if ("rebound" in yard) out.rebound = true;
      else if ("escapesWith" in yard) out.escapesWith = yard.escapesWith;
      else out.activated.push(yard.unearth);
      continue;
    }
    const costKw = parseCostKeyword(line, d);
    if (costKw !== null) {
      if (costKw === "fail") out.unsupported.push(raw);
      else {
        if (costKw.alt) (out.altCosts ??= []).push(costKw.alt);
        if (costKw.delve) out.delve = true;
        if (costKw.faceDown) {
          if (out.faceDownCast) out.unsupported.push(raw); // two ways to turn it face up: not modeled
          else out.faceDownCast = costKw.faceDown;
        }
        // Evoke's sacrifice trigger goes first, so the card's own enters abilities can resolve before it (rulings).
        if (costKw.trigger) costKw.alt?.kind === "evoke" ? out.triggers.unshift(costKw.trigger) : out.triggers.push(costKw.trigger);
        if (costKw.activated) out.activated.push(costKw.activated);
      }
      continue;
    }
    // "Protection from black and from red" is two protection abilities (CR 702.16g).
    const kwLine = line.replace(/protection from (\w+) and from (\w+)/gi, "protection from $1, protection from $2");
    if (isKeywordLine(kwLine)) {
      out.textKeywords.push(...textKeywords(kwLine));
      continue;
    }
    const kw = keywordAbilities(kwLine, d);
    if (kw) {
      out.triggers.push(...kw.triggers);
      out.activated.push(...kw.activated);
      out.textKeywords.push(...textKeywords(kwLine));
      if (kw.convoke) out.convoke = true;
      if (kw.improvise) out.improvise = true;
      if (kw.affinity.length) out.costLess = [...(out.costLess ?? []), ...kw.affinity.map((filter) => ({ count: { kind: "permanents" as const, filter } }))];
      if (kw.plusCounters) {
        const prev = out.entersWithCounters?.n ?? 0;
        if (typeof prev !== "number") {
          out.unsupported.push(raw); // modular on top of a counted number: not modeled
          continue;
        }
        out.entersWithCounters = { counter: "+1/+1", n: prev + kw.plusCounters };
      }
      if (kw.entersCounter) {
        if (out.entersWithCounters) {
          out.unsupported.push(raw); // two kinds of counters as it enters: not modeled
          continue;
        }
        out.entersWithCounters = { counter: kw.entersCounter.counter, n: kw.entersCounter.n };
      }
      if (kw.bloodthirst) out.bloodthirst = (out.bloodthirst ?? 0) + kw.bloodthirst;
      if (kw.entersOptions.length) out.entersOptions = [...(out.entersOptions ?? []), ...kw.entersOptions];
      out.statics.push(...kw.statics);
      continue;
    }
    if (/^~ enters tapped\.$/.test(line)) {
      out.entersTapped = true;
      continue;
    }
    // "As ~ enters, choose a creature type." (CR 614.12), "~ enters tapped. As it enters, choose a color."
    const asEnters = /^(~ enters tapped\. )?As (?:~|it) enters, choose (an? (?:creature type|color)(?: other than \w+)?(?: and an? (?:creature type|color))?)\.$/.exec(line);
    if (asEnters) {
      if (asEnters[1]) out.entersTapped = true;
      for (const part of asEnters[2]!.split(" and ")) {
        const c = /^an? (creature type|color)(?: other than (\w+))?$/.exec(part)!;
        (out.entersChoose ??= []).push({ what: c[1] === "color" ? "color" : "creatureType", ...(c[2] ? { except: c[2] } : {}) });
      }
      continue;
    }
    // Kicker (CR 702.33a-c): "Kicker {2}{R}", "Kicker {1}{U} and/or {2}{B}", "Multikicker {1}{G}".
    const kicker = /^(Multikicker|Kicker) ((?:\{[^}]+\})+)(?: and\/or ((?:\{[^}]+\})+))?$/.exec(line);
    if (kicker) {
      const costs = [kicker[2]!, ...(kicker[3] ? [kicker[3]] : [])];
      if (out.kicker || costs.some((c) => !parseManaCost(c).supported || parseManaCost(c).hasX)) out.unsupported.push(raw);
      else out.kicker = { costs, ...(kicker[1] === "Multikicker" ? { multi: true } : {}) };
      continue;
    }
    // "If ~ was kicked, it enters with two +1/+1 counters on it." (a replacement effect, CR 614.1c)
    const kickedCounters = new RegExp(`^If ~ was kicked(?: with its ((?:\\{[^}]+\\})+) kicker)?, it enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it\\.$`).exec(line);
    if (kickedCounters) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else
        out.entersWithCounters = {
          counter: kickedCounters[3] === "-1/-1" ? "-1/-1" : "+1/+1",
          n: { count: { kind: "wasKicked", ...(kickedCounters[1] ? { cost: kickedCounters[1] } : {}) } as Count, times: num(kickedCounters[2]!) },
        };
      continue;
    }
    // "As an additional cost to cast this spell, sacrifice a creature." (CR 601.2b, 601.2f-h)
    const extra = /^As an additional cost to cast (?:this spell|~), (.+)\.$/.exec(line);
    if (extra) {
      const cost = parseAdditionalCost(extra[1]!);
      if (cost) (out.additionalCosts ??= []).push(cost);
      else out.unsupported.push(raw);
      continue;
    }
    const unless = /^~ enters tapped unless (.+)\.$/.exec(line);
    if (unless) {
      const cond = parseEntersCondition(unless[1]!);
      if (cond) out.entersTappedUnless = cond;
      else out.unsupported.push(raw);
      continue;
    }
    const choice = parseEntersChoice(line);
    if (choice) {
      out.entersTappedChoice = choice;
      continue;
    }
    if (/^You have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = true;
      continue;
    }
    if (/^~ can't be countered\.$/.test(line)) {
      out.cantBeCountered = true;
      continue;
    }
    const ewc = new RegExp(`^(?:Raid — )?~ enters(?: the battlefield)?( tapped)? with ${NUMX} ${COUNTER} counters? on it(?: for each (.+?)|, where X is (.+?)| if (you attacked this turn))?\\.$`).exec(line);
    if (ewc) {
      // "With a +1/+1 counter on it for each ...", "with X +1/+1 counters, where X is ...": counted as it enters.
      // "~ enters tapped with three stun counters on it."
      const [, tapped, count, kind, each, where, raid] = ewc;
      const per = each ? parseCount(each, null, true) : null;
      const def = where ? parseCount(where, null) : null;
      const n = per ? scaleAmount(amt(count!), per) : def ? substituteX(amt(count!), def) : amt(count!);
      if ((each && !per) || (where && !def) || !n || out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: counterKind(kind!), n, ...(raid ? { if: { kind: "attackedThisTurn" as const } } : {}) };
        if (tapped) out.entersTapped = true;
      }
      continue;
    }
    const enchant = /^Enchant (.+)$/.exec(line);
    if (enchant) {
      const spec = parseTargetPhrase(enchant[1]!);
      if (spec?.kind === "object" && !out.enchant) out.enchant = { ...spec, text: `${spec.text.replace(/^target /, "")} to enchant` };
      else out.unsupported.push(raw);
      continue;
    }
    const equip = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)$/.exec(line);
    if (equip && d.subtypes.includes("Equipment")) {
      // CR 702.6a: "[Cost]: Attach this permanent to target creature you control. Activate only as a sorcery."
      out.activated.push({
        manaCost: equip[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", text: "target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach to target creature you control." },
        text: line,
      });
      continue;
    }
    const cost = parseCostChange(line);
    if (cost) {
      if (cost === "fail") out.unsupported.push(raw);
      else if ("costMod" in cost) out.costMods = [...(out.costMods ?? []), cost.costMod];
      else if ("less" in cost) out.costLess = [...(out.costLess ?? []), cost.less];
      else if ("lessIfTargets" in cost) out.costLessIfTargets = [...(out.costLessIfTargets ?? []), cost.lessIfTargets];
      else out.costLessIf = [...(out.costLessIf ?? []), cost.lessIf];
      continue;
    }
    const st = parseStatic(line) ?? parseConditionalStatic(line);
    if (st) {
      out.statics.push(st);
      continue;
    }
    const trig = parseTrigger(line);
    if (trig) {
      if (trig === "fail") out.unsupported.push(raw);
      else out.triggers.push(trig);
      continue;
    }
    const act = parseActivated(line);
    if (act) {
      if (act === "fail") out.unsupported.push(raw);
      else out.activated.push(act);
      continue;
    }
    if (isSpell) spellLines.push(line);
    else out.unsupported.push(raw);
  }
  if (isSpell) {
    const body = spellLines.length ? parseBody(spellLines.join(" "), { spell: true }) : null;
    if (body) out.spell = body;
    else out.unsupported.push(...spellLines);
  }
  checkX(d, out);
  // Both pay with the same chosen cards: a discard for jump-start on top of a discard the spell asks for isn't modeled.
  const kinds = (costs: AdditionalCost[] = []) => costs.map((c) => c.kind);
  if (out.fromGraveyard?.some((g) => kinds(g.costs).some((k) => kinds(out.additionalCosts).includes(k)))) out.unsupported.push("graveyard cast with a cost like its additional cost");
  if (out.escapesWith && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  checkCastingLinks(out);
  linkExile(out);
  return out;
}

/**
 * "When ~ enters, exile target creature an opponent controls. When ~ leaves the battlefield, return the
 * exiled card to the battlefield under its owner's control": the two abilities are linked (CR 607.2a), so
 * the return gives back only what this object's own exile ability took. Needs exactly one exile to link to.
 */
function linkExile(out: CompiledCard) {
  const returns = out.triggers.filter((t) => allEffects(t.body.effects).some((e) => e.type === "returnLinked"));
  if (!returns.length) return;
  const exiles = [...out.triggers.filter((t) => t.event === "selfEnters").map((t) => t.body), ...out.activated.map((a) => a.body)]
    .flatMap((b) => allEffects(b.effects))
    .filter((e): e is Extract<Effect, { type: "exile" }> => e.type === "exile" && !e.until);
  if (exiles.length !== 1 || returns.length !== 1 || returns[0]!.event !== "selfLeaves") {
    out.unsupported.push("(returns exiled cards it can't link to one exile ability)");
    return;
  }
  exiles[0]!.linked = true;
}

/**
 * Text that refers to how the spell was cast needs the cost it refers to: "if it was kicked with its
 * {1}{U} kicker" becomes that kicker's index (CR 702.33f), "the sacrificed creature" needs a sacrifice cost.
 */
function checkCastingLinks(out: CompiledCard) {
  let bad = false;
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if ((o.kind === "kicked" || o.kind === "wasKicked") && !("filter" in o)) {
      if (!out.kicker) bad = true;
      else if (typeof o.cost === "string") {
        const i = out.kicker.costs.indexOf(o.cost);
        if (i < 0) bad = true;
        o.which = i;
        delete o.cost;
      }
    }
    if (o.ref === "sacrificed" && !canSac) bad = true;
    // "The chosen type" needs something that chooses one: "as ~ enters, choose" or "choose a creature type" before it.
    if (typeof o.chosen === "string") (/olor/.test(o.chosen) ? needs.add("color") : needs.add("creatureType"));
    if (o.kind === "chosenColor") needs.add("color");
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_PROTECTION)) needs.add("color");
    if (o.type === "choose") choices.add(o.choice as ChoiceKind);
    Object.values(o).forEach(visit);
  };
  const needs = new Set<ChoiceKind>();
  const choices = new Set<ChoiceKind>((out.entersChoose ?? []).map((c) => c.what));
  // "The sacrificed creature" refers to a sacrifice cost: the spell's, or the activated ability's own.
  let canSac = !!out.additionalCosts?.some((c) => c.kind === "sacrifice");
  visit([out.spell, out.triggers, out.statics, out.mana]);
  for (const ab of out.activated) {
    canSac = !!ab.costs?.some((c) => c.kind === "sacrifice");
    visit(ab);
  }
  if ([...needs].some((k) => !choices.has(k))) bad = true;
  // "Enters with a counter for each creature of the chosen type" would be counted before the choice is made.
  needs.clear();
  visit(out.entersWithCounters);
  if (needs.size) bad = true;
  if (bad) out.unsupported.push("(text about how it was cast that this card's costs don't explain)");
}

/** "sacrifice a creature", "discard a card", "pay 3 life", "exile a creature card from your graveyard". */
/**
 * Keywords about casting from a graveyard and what happens to the spell after: flashback
 * (CR 702.34), jump-start (702.133), retrace (702.81), escape (702.138), buyback (702.27),
 * rebound (702.88), unearth (702.84). Null if the line is none of these.
 */
function parseGraveyardKeyword(
  line: string,
  d: CardDef,
): { fromGraveyard: CastFromGraveyard } | { buyback: string } | { rebound: true } | { escapesWith: number } | { unearth: ActivatedAbility } | "fail" | null {
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  let m: RegExpExecArray | null;
  if ((m = /^(Flashback|Escape)(?: |—)(.+?)\.?$/.exec(line))) {
    const kind = m[1] === "Flashback" ? "flashback" : "escape";
    if (kind === "flashback" && !isSpell) return "fail";
    const parts = m[2]!.split(", ");
    const mana = /^(\{[^}]+\})+$/.test(parts[0]!) ? parts.shift()! : undefined;
    if (mana && (!parseManaCost(mana).supported || parseManaCost(mana).hasX)) return "fail";
    const costs: AdditionalCost[] = [];
    for (const part of parts) {
      // Escape's "Exile two other cards from your graveyard": other than this card, which is on the stack by then.
      const c = parseAdditionalCost(part.replace(/^Exile (\w+) other /, "exile $1 "));
      if (!c) return "fail";
      costs.push(c);
    }
    return { fromGraveyard: { kind, ...(mana ? { mana } : {}), costs, exile: kind === "flashback" } };
  }
  if (/^Jump-start$/.test(line)) return isSpell ? { fromGraveyard: { kind: "jumpStart", costs: [{ kind: "discard", n: 1 }], exile: true } } : "fail";
  if (/^Retrace$/.test(line)) return { fromGraveyard: { kind: "retrace", costs: [{ kind: "discard", n: 1, filter: { kind: "card", types: ["Land"], text: "land card" } }], exile: false } };
  if (/^Rebound$/.test(line)) return isSpell ? { rebound: true } : "fail";
  if ((m = /^Buyback ((?:\{[^}]+\})+)$/.exec(line))) return isSpell && parseManaCost(m[1]!).supported && !parseManaCost(m[1]!).hasX ? { buyback: m[1]! } : "fail";
  if ((m = new RegExp(`^~ escapes with ${NUM} \\+1/\\+1 counters? on it\\.$`).exec(line))) return { escapesWith: num(m[1]!) };
  if ((m = /^Unearth ((?:\{[^}]+\})+)$/.exec(line))) {
    if (!parseManaCost(m[1]!).supported || parseManaCost(m[1]!).hasX) return "fail";
    return {
      unearth: {
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        body: { targets: [], effects: [{ type: "unearth" }], text: "Return ~ from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield." },
        text: `Unearth ${m[1]}`,
      },
    };
  }
  return null;
}

/** A mana cost we can pay: no X, no snow, nothing unusual. */
const plainMana = (cost: string) => parseManaCost(cost).supported && !parseManaCost(cost).hasX;

const sacrificeSelf: Effect = { type: "sacrifice", what: { ref: "self" } };

/**
 * Keywords about costs: echo (CR 702.30), cumulative upkeep (702.24), evoke (702.74), dash (702.109),
 * delve (702.66), living weapon (702.92), scavenge (702.97).
 */
function parseCostKeyword(
  line: string,
  d: CardDef,
): { alt?: { kind: AltCostKind; mana: string }; trigger?: TriggeredAbility; activated?: ActivatedAbility; delve?: true; faceDown?: { kind: FaceDownKind; cost: string } } | "fail" | null {
  let m: RegExpExecArray | null;
  // Morph, megamorph, disguise (CR 702.37, 702.168): costs other than mana ("Reveal a blue card") aren't modeled.
  if ((m = /^(Morph|Megamorph|Disguise)(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[2]!;
    if (!/^(\{[^}]+\})+$/.test(cost) || !plainMana(cost)) return "fail";
    return { faceDown: { kind: m[1]!.toLowerCase() as FaceDownKind, cost } };
  }
  if ((m = /^Echo(?: |—)(.+?)\.?$/.exec(line))) {
    const cost = m[1]!;
    if (!/^(\{[^}]+\})+$/.test(cost) || !plainMana(cost)) return "fail"; // "Echo—Discard a card." isn't modeled
    const text = `Echo ${cost}: at the beginning of your upkeep, if ~ came under your control since the beginning of your last upkeep, sacrifice it unless you pay ${cost}.`;
    return {
      trigger: {
        event: "yourUpkeep",
        ifEcho: true,
        body: { targets: [], effects: [{ type: "may", effects: [], pay: { mana: cost }, otherwise: [sacrificeSelf], keep: true, text: `Pay echo ${cost} to keep ~` }], text },
      },
    };
  }
  if ((m = /^Cumulative upkeep(?: |—)(.+?)\.?$/.exec(line))) {
    const raw = m[1]!.replace(/^Pay /, "");
    const pay = parsePayCost(raw);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return "fail"; // "{G} or {W}", "Sacrifice a creature", ...
    const what = describePayText(pay);
    return {
      trigger: {
        event: "yourUpkeep",
        body: { targets: [], effects: [{ type: "cumulativeUpkeep", pay }], text: `Cumulative upkeep ${what}: at the beginning of your upkeep, put an age counter on ~, then sacrifice it unless you pay ${what} for each age counter on it.` },
      },
    };
  }
  if ((m = /^(Evoke|Dash) ((?:\{[^}]+\})+)$/.exec(line))) {
    const mana = m[2]!;
    if (!plainMana(mana)) return "fail";
    if (m[1] === "Dash") return d.types.includes("Creature") ? { alt: { kind: "dash", mana } } : "fail";
    return {
      alt: { kind: "evoke", mana },
      trigger: { event: "selfEnters", ifEvoked: true, body: { targets: [], effects: [sacrificeSelf], text: "When ~ enters, if its evoke cost was paid, its controller sacrifices it." } },
    };
  }
  if (line === "Delve") return { delve: true };
  if (line === "Living weapon") {
    if (!d.subtypes.includes("Equipment")) return "fail";
    const germ: TokenSpec = { name: "Phyrexian Germ", power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: ["Phyrexian", "Germ"], keywords: [] };
    return {
      trigger: {
        event: "selfEnters",
        body: {
          targets: [],
          effects: [
            { type: "createToken", who: { ref: "you" }, n: 1, token: germ },
            { type: "attach", what: { ref: "created" } },
          ],
          text: "Living weapon: when ~ enters, create a 0/0 black Phyrexian Germ creature token, then attach ~ to it.",
        },
      },
    };
  }
  if ((m = /^Scavenge ((?:\{[^}]+\})+)$/.exec(line))) {
    const cost = m[1]!;
    if (!plainMana(cost) || !/^\d+$/.test(d.power ?? "")) return "fail";
    const n = Number(d.power);
    return {
      activated: {
        manaCost: cost,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: true,
        zone: "graveyard",
        exileSelf: true,
        body: {
          targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n }],
          text: `Put ${n} +1/+1 counter${n === 1 ? "" : "s"} on target creature.`,
        },
        text: `Scavenge ${cost}`,
      },
    };
  }
  return null;
}

/** "{1}", "1 life", "{B} and 1 life", "{E}", as printed in a cost. */
function describePayText(pay: PayCost): string {
  return [pay.mana, pay.life ? `${pay.life} life` : "", pay.energy ? "{E}".repeat(pay.energy) : ""].filter(Boolean).join(" and ");
}

function parseAdditionalCost(text: string): AdditionalCost | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^sacrifice ${NUM} (.+)$`, "i").exec(text))) {
    const n = num(m[1]!);
    const phrase = n === 1 ? m[2]! : m[2]!.split(" ").map(singularWord).join(" ");
    const spec = parseTargetPhrase(phrase);
    if (spec?.kind !== "object" || spec.controller || spec.combat) return null;
    return { kind: "sacrifice", filter: { ...spec, text: m[2]! }, n };
  }
  if ((m = new RegExp(`^discard ${NUM} cards?$`, "i").exec(text))) return { kind: "discard", n: num(m[1]!) };
  if ((m = /^pay (\d+) life$/i.exec(text))) return { kind: "payLife", n: Number(m[1]) };
  if ((m = new RegExp(`^exile ${NUM} (.+?) from your graveyard$`, "i").exec(text))) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    return { kind: "exileFromGraveyard", n: num(m[1]!), ...(filter ? { filter } : {}) };
  }
  return null;
}

/**
 * X needs a value. A spell's X is chosen as it's cast (CR 107.3a), and its permanent's "enters with"
 * and enters abilities use it (CR 107.3m); everything else about the permanent sees 0 (CR 107.3g).
 * Text that uses an X with no value is a reading we can't trust, so the card isn't supported.
 */
function checkX(d: CardDef, out: CompiledCard) {
  const cardX = parseManaCost(d.manaCost).hasX;
  const bad = (what: string) => out.unsupported.push(what);
  if (out.spell && usesX(out.spell) && !cardX) {
    bad(out.spell.text);
    delete out.spell;
  }
  if (out.entersWithCounters && usesX(out.entersWithCounters) && !cardX) {
    bad("enters with X counters");
    delete out.entersWithCounters;
  }
  out.triggers = out.triggers.filter((tr) => {
    if (!usesX(tr.body) || (tr.event === "selfEnters" && cardX)) return true;
    bad(tr.body.text);
    return false;
  });
  if (out.costLess && usesX(out.costLess)) {
    bad("costs {X} less");
    delete out.costLess;
  }
}

/**
 * A modal ability is a "choose ... —" line followed by one line per mode, each starting
 * with a bullet (CR 700.2). Join them into one line so the ability is compiled as a whole.
 */
function joinModes(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (/^\s*•/.test(line) && prev !== undefined && /—\s*(•.*)?$/.test(prev)) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out;
}

/**
 * A line of keywords where some are abilities in their own right: "Prowess", "Ward {2}",
 * "Cycling {1}{U}", "Crew 3", "Convoke", possibly mixed with simple keywords ("Flying, ward {2}").
 * Returns what they add, or null if any part isn't one we support.
 */
interface KeywordParts {
  triggers: TriggeredAbility[];
  activated: ActivatedAbility[];
  convoke: boolean;
  improvise: boolean;
  affinity: TargetSpec[];
  /** Modular N's "enters with N +1/+1 counters" (CR 702.43a). */
  plusCounters: number;
  bloodthirst: number;
  entersOptions: EntersOption[];
  statics: StaticAbility[];
  /** Fading N's fade counters, vanishing N's time counters (CR 702.32a, 702.63a). */
  entersCounter?: { counter: CounterKind; n: number };
}

function keywordAbilities(line: string, d: CardDef): KeywordParts | null {
  const out: KeywordParts = { triggers: [], activated: [], convoke: false, improvise: false, affinity: [], plusCounters: 0, bloodthirst: 0, entersOptions: [], statics: [] };
  const plus = (n: number, what: ObjRef = { ref: "self" }): Effect => ({ type: "counters", what, counter: "+1/+1", n });
  for (const raw of line.split(/,\s*/)) {
    const p = raw.trim();
    let m: RegExpExecArray | null;
    if (keywordOf(p)) continue;
    if (/^prowess$/i.test(p)) {
      // CR 702.108a: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn."
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", notTypes: ["Creature"], text: "noncreature spell" } },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Prowess: ~ gets +1/+1 until end of turn." },
      });
    } else if (/^extort$/i.test(p)) {
      // CR 702.101a: "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you
      // gain life equal to the total life lost this way." Each instance triggers separately (702.101b).
      const drain: Effect = { type: "loseLife", who: { ref: "eachOpponent" }, n: 1, drain: true };
      out.triggers.push({
        event: "castSpell",
        cast: { by: "you", spell: { kind: "spell", text: "spell" } },
        body: { targets: [], effects: [{ type: "may", effects: [drain], pay: { mana: "{W/B}" }, text: "pay {W/B}. If you do, each opponent loses 1 life and you gain that much life" }], text: "Extort: you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way." },
      });
    } else if (/^convoke$/i.test(p)) out.convoke = true;
    else if (/^improvise$/i.test(p)) out.improvise = true;
    else if (/^cascade$/i.test(p)) {
      // CR 702.85a: "When you cast this spell, exile cards from the top of your library until you exile a nonland card
      // whose mana value is less than this spell's mana value. You may cast that card without paying its mana cost if
      // the resulting spell's mana value is less than this spell's mana value. Then put all cards exiled this way that
      // weren't cast on the bottom of your library in a random order." Each instance triggers (CR 702.85c).
      out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "cascade" }], text: "Cascade: exile cards from the top of your library until you exile a cheaper nonland card. You may cast it without paying its mana cost." } });
    }
    else if ((m = /^affinity for (\w+)$/i.exec(p))) {
      // CR 702.41a: "This spell costs {1} less to cast for each [text] you control."
      const spec = parseTargetPhrase(singular(m[1]!));
      if (spec?.kind !== "object") return null;
      out.affinity.push({ ...spec, controller: "you", text: `${m[1]} you control` });
    }
    else if (/^toxic \d+$/i.test(p)) continue; // a static ability, read from the keywords (see textKeywords)
    else if (/^exalted$/i.test(p)) {
      // CR 702.83a: "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn."
      // Each instance triggers separately (CR 702.83a).
      out.triggers.push({
        event: "creatureYouControlAttacksAlone",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: 1, toughness: 1 }], duration: "endOfTurn" }], text: "Exalted: that creature gets +1/+1 until end of turn." },
      });
    }
    else if ((m = /^bushido (\d+)$/i.exec(p))) {
      // CR 702.45a: "Whenever this creature blocks or becomes blocked, it gets +N/+N until end of turn."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBlocksOrBecomesBlocked", body: { targets: [], effects: [pumpSelf(n, n)], text: `Bushido ${n}: ~ gets +${n}/+${n} until end of turn.` } });
    } else if (/^flanking$/i.test(p)) {
      // CR 702.25a: "Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn."
      out.triggers.push({
        event: "selfBlockedByCreature",
        subjectFilter: { kind: "object", types: ["Creature"], notKeywords: ["Flanking"], text: "creature without flanking" },
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "subject" }, mods: [{ kind: "modifyPT", power: -1, toughness: -1 }], duration: "endOfTurn" }], text: "Flanking: the blocking creature gets -1/-1 until end of turn." },
      });
    } else if ((m = /^rampage (\d+)$/i.exec(p))) {
      // CR 702.23a: "Whenever this creature becomes blocked, it gets +N/+N until end of turn for each creature blocking it beyond the first."
      const n = Number(m[1]);
      out.triggers.push({
        event: "selfBecomesBlocked",
        body: { targets: [], effects: [{ type: "pumpPerBlocker", what: { ref: "self" }, power: n, toughness: n, beyondFirst: true }], text: `Rampage ${n}: ~ gets +${n}/+${n} until end of turn for each creature blocking it beyond the first.` },
      });
    } else if (/^(persist|undying)$/i.test(p)) {
      // CR 702.79a / 702.93a: "When this permanent is put into a graveyard from the battlefield, if it had no
      // -1/-1 (+1/+1) counters on it, return it to the battlefield under its owner's control with a -1/-1 (+1/+1) counter on it."
      const counter = /^persist$/i.test(p) ? "-1/-1" : "+1/+1";
      out.triggers.push({
        event: "selfDies",
        ifNoCounter: counter,
        body: { targets: [], effects: [{ type: "returnToBattlefield", counter }], text: `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}: return ~ to the battlefield with a ${counter} counter on it.` },
      });
    } else if ((m = /^renown (\d+)$/i.exec(p))) {
      // CR 702.112a: "When this creature deals combat damage to a player, if it isn't renowned, put N +1/+1
      // counters on it and it becomes renowned."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfDealsCombatDamageToPlayer", ifNotRenowned: true, body: { targets: [], effects: [{ type: "renown", n }], text: `Renown ${n}: if ~ isn't renowned, put ${n} +1/+1 counter${n > 1 ? "s" : ""} on it and it becomes renowned.` } });
    } else if ((m = /^fabricate (\d+)$/i.exec(p))) {
      // CR 702.123a: "When this permanent enters, you may put N +1/+1 counters on it. If you don't, create N 1/1 colorless Servo artifact creature tokens."
      const n = Number(m[1]);
      const servo: TokenSpec = { name: "Servo", power: 1, toughness: 1, colors: [], types: ["Artifact", "Creature"], subtypes: ["Servo"], keywords: [] };
      out.triggers.push({
        event: "selfEnters",
        body: {
          targets: [],
          effects: [{ type: "may", effects: [plus(n)], text: `put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ (otherwise create ${n} Servo${n > 1 ? "s" : ""})`, otherwise: [{ type: "createToken", who: { ref: "you" }, n, token: servo }] }],
          text: `Fabricate ${n}: put ${n} +1/+1 counter${n > 1 ? "s" : ""} on ~ or create ${n} 1/1 Servo${n > 1 ? "s" : ""}.`,
        },
      });
    } else if ((m = /^modular (\d+)$/i.exec(p))) {
      // CR 702.43a: "This permanent enters with N +1/+1 counters on it" and "When this permanent is put into a graveyard
      // from the battlefield, you may put a +1/+1 counter on target artifact creature for each +1/+1 counter on this permanent."
      out.plusCounters += Number(m[1]);
      const text = "put a +1/+1 counter on target artifact creature for each +1/+1 counter on ~";
      out.triggers.push({
        event: "selfToGraveyard",
        body: {
          targets: [{ kind: "object", allTypes: ["Artifact", "Creature"], text: "target artifact creature" }],
          effects: [{ type: "may", effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1, perLastKnownCounter: "+1/+1" }], text }],
          text: `Modular: you may ${text}.`,
        },
      });
    } else if ((m = /^afflict (\d+)$/i.exec(p))) {
      // CR 702.130a: "Whenever this creature becomes blocked, defending player loses N life."
      const n = Number(m[1]);
      out.triggers.push({ event: "selfBecomesBlocked", body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eventPlayer" }, n }], text: `Afflict ${n}: defending player loses ${n} life.` } });
    } else if (/^dethrone$/i.test(p)) {
      // CR 702.105a: "Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", attacksMostLife: true, body: { targets: [], effects: [plus(1)], text: "Dethrone: put a +1/+1 counter on ~." } });
    } else if (/^training$/i.test(p)) {
      // CR 702.149a: "Whenever this creature and at least one other creature with power greater than this
      // creature's power attack, put a +1/+1 counter on this creature."
      out.triggers.push({ event: "selfAttacks", training: true, body: { targets: [], effects: [plus(1)], text: "Training: put a +1/+1 counter on ~." } });
    } else if ((m = /^fading (\d+)$/i.exec(p))) {
      // CR 702.32a: "This permanent enters with N fade counters on it" and "At the beginning of your upkeep,
      // remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      if (out.entersCounter) return null;
      out.entersCounter = { counter: "fade", n: Number(m[1]) };
      out.triggers.push({ event: "yourUpkeep", body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "fade", orSacrifice: true }], text: "Fading: remove a fade counter from ~. If you can't, sacrifice it." } });
    } else if ((m = /^vanishing(?: (\d+))?$/i.exec(p))) {
      // CR 702.63a-b: "This permanent enters with N time counters on it," "At the beginning of your upkeep, if this
      // permanent has a time counter on it, remove a time counter from it," and "When the last time counter is
      // removed from this permanent, sacrifice it."
      if (m[1]) {
        if (out.entersCounter) return null;
        out.entersCounter = { counter: "time", n: Number(m[1]) };
      }
      out.triggers.push({
        event: "yourUpkeep",
        ifCond: { kind: "selfCounter", counter: "time" },
        body: { targets: [], effects: [{ type: "removeSelfCounter", counter: "time" }], text: "Vanishing: if ~ has a time counter on it, remove a time counter from it." },
      });
      out.triggers.push({ event: "selfLastTimeCounterRemoved", body: { targets: [], effects: [sacrificeSelf], text: "Vanishing: when the last time counter is removed from ~, sacrifice it." } });
    } else if (/^evolve$/i.test(p)) {
      // CR 702.100a
      out.triggers.push({ event: "anotherCreatureYouControlEnters", ifEvolves: true, body: { targets: [], effects: [{ type: "evolve" }], text: "Evolve: if that creature is bigger, put a +1/+1 counter on ~." } });
    } else if (/^battle cry$/i.test(p)) {
      // CR 702.91a: "Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn."
      out.triggers.push({
        event: "selfAttacks",
        body: { targets: [], effects: [{ type: "continuous", what: { ref: "allCreatures", other: true, attacking: true }, mods: [{ kind: "modifyPT", power: 1, toughness: 0 }], duration: "endOfTurn" }], text: "Battle cry: each other attacking creature gets +1/+0 until end of turn." },
      });
    } else if (/^mentor$/i.test(p)) {
      // CR 702.134a: "Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power."
      out.triggers.push({
        event: "selfAttacks",
        body: {
          targets: [{ kind: "object", types: ["Creature"], combat: "attacking", lesserPowerThanSource: true, text: "target attacking creature with lesser power" }],
          effects: [{ type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n: 1 }],
          text: "Mentor: put a +1/+1 counter on target attacking creature with lesser power.",
        },
      });
    } else if (/^riot$/i.test(p)) out.entersOptions.push("riot"); // CR 702.136a; each instance works separately (702.136b)
    else if (/^unleash$/i.test(p)) {
      // CR 702.98a: "You may have this permanent enter with an additional +1/+1 counter on it" and "This
      // permanent can't block as long as it has a +1/+1 counter on it" (any +1/+1 counter, rulings).
      out.entersOptions.push("unleash");
      out.statics.push({ affects: { kind: "self" }, mods: [{ kind: "cantBlock" }], condition: { kind: "selfCounter", counter: "+1/+1" }, text: "Unleash: ~ can't block as long as it has a +1/+1 counter on it." });
    } else if ((m = /^afterlife (\d+)$/i.exec(p))) {
      // CR 702.135a: "When this permanent is put into a graveyard from the battlefield, create N 1/1 white and black
      // Spirit creature tokens with flying." Each instance triggers (702.135b).
      const n = Number(m[1]);
      const spirit: TokenSpec = { name: "Spirit", power: 1, toughness: 1, colors: ["W", "B"], types: ["Creature"], subtypes: ["Spirit"], keywords: ["Flying"] };
      out.triggers.push({ event: "selfToGraveyard", body: { targets: [], effects: [{ type: "createToken", who: { ref: "you" }, n, token: spirit }], text: `Afterlife ${n}: create ${n === 1 ? "a" : n} 1/1 white and black Spirit creature token${n > 1 ? "s" : ""} with flying.` } });
    } else if ((m = /^bloodthirst (\d+)$/i.exec(p))) out.bloodthirst += Number(m[1]); // CR 702.54a
    else if ((m = /^soulshift (\d+)$/i.exec(p))) {
      // CR 702.46a: "When this permanent is put into a graveyard from the battlefield, you may return target
      // Spirit card with mana value N or less from your graveyard to your hand."
      const n = Number(m[1]);
      const text = `return target Spirit card with mana value ${n} or less from your graveyard to your hand`;
      out.triggers.push({
        event: "selfDies",
        body: {
          targets: [{ kind: "card", owner: "you", subtypes: ["Spirit"], manaValue: { max: n }, text: `target Spirit card with mana value ${n} or less from your graveyard` }],
          effects: [{ type: "may", effects: [{ type: "bounce", what: { ref: "target", index: 0 } }], text }],
          text: `Soulshift ${n}: you may ${text}.`,
        },
      });
    } else if ((m = /^ward—pay (\d+) life\.?$/i.exec(p))) {
      // CR 702.21a with a life cost: "counter that spell or ability unless that player pays N life".
      const life = Number(m[1]);
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: "{0}", life }, ward: true }], text: `Ward—Pay ${life} life: counter that spell or ability unless its controller pays ${life} life.` },
      });
    } else if ((m = /^ward ((?:\{(?:\d+|[WUBRGC])\})+)$/i.exec(p))) {
      // CR 702.21a: "Whenever this permanent becomes the target of a spell or ability an opponent
      // controls, counter that spell or ability unless that player pays [cost]."
      out.triggers.push({
        event: "becomesTargetOfOpponent",
        body: { targets: [], effects: [{ type: "counterUnlessPays", unless: { cost: m[1]! }, ward: true }], text: `Ward ${m[1]}: counter that spell or ability unless its controller pays ${m[1]}.` },
      });
    } else if ((m = /^cycling ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29a: "[Cost], Discard this card: Draw a card." Only while the card is in your hand.
      out.activated.push({
        manaCost: m[1]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Draw a card." },
        text: `Cycling ${m[1]}`,
      });
    } else if ((m = /^([a-z]+(?: [a-z]+)?)cycling ((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRGP])\})+)$/i.exec(p))) {
      // CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library for a
      // [type] card, reveal it, put it into your hand, then shuffle." It's a cycling ability (702.29f).
      const type = m[1]!
        .split(" ")
        .map((w) => (CREATURE_TYPES.has(capital(w.toLowerCase())) || BASIC_TYPES.includes(capital(w.toLowerCase())) ? capital(w.toLowerCase()) : w.toLowerCase()))
        .join(" ");
      const filter = parseSearchFilter(`${type} card`);
      if (!filter) return null;
      out.activated.push({
        manaCost: m[2]!,
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        zone: "hand",
        discardSelf: true,
        body: { targets: [], effects: [{ type: "search", filter, n: 1, upTo: false, reveal: true, dest: { zone: "hand" } }], text: `Search your library for a ${filter.text}, reveal it, put it into your hand, then shuffle.` },
        text: `${capital(m[1]!.toLowerCase())}cycling ${m[2]}`,
      });
    } else if ((m = /^crew (\d+)$/i.exec(p)) && d.subtypes.includes("Vehicle")) {
      // CR 702.122a: "Tap any number of other untapped creatures you control with total power N or
      // greater: This permanent becomes an artifact creature until end of turn." It keeps its other
      // types and subtypes, Vehicle included (CR 205.1b).
      out.activated.push({
        manaCost: "",
        tap: false,
        sacrificeSelf: false,
        sorcerySpeed: false,
        crew: Number(m[1]),
        body: {
          targets: [],
          effects: [{ type: "continuous", what: { ref: "self" }, mods: [{ kind: "addTypes", types: ["Artifact", "Creature"], subtypes: [] }], duration: "endOfTurn" }],
          text: "~ becomes an artifact creature until end of turn.",
        },
        text: `Crew ${m[1]}`,
      });
    } else return null;
  }
  return out;
}

/**
 * Keywords that the card data only names generically ("Protection", "Toxic") but whose
 * details are in the text: "Protection from black", "Toxic 2". These replace the generic
 * ones in the printed characteristics (see layers.ts).
 */
function textKeywords(line: string): string[] {
  const out: string[] = [];
  for (const raw of line.split(/,\s*/)) {
    const p = raw.trim();
    if (/^protection from /i.test(p) && keywordOf(p)) out.push(keywordOf(p)!);
    const tox = /^toxic (\d+)$/i.exec(p);
    if (tox) out.push(`Toxic ${tox[1]}`);
  }
  return out;
}

const pumpSelf = (power: number, toughness: number): Effect => ({ type: "continuous", what: { ref: "self" }, mods: [{ kind: "modifyPT", power, toughness }], duration: "endOfTurn" });

const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/** What "~ enters tapped unless ..." waits for (CR 614.1d). */
function parseEntersCondition(text: string): EntersCondition | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^you control ${NUM} or (fewer|more) other lands$`).exec(text)))
    return { kind: "control", who: "you", types: ["Land"], other: true, ...(m[2] === "fewer" ? { max: num(m[1]!) } : { min: num(m[1]!) }) };
  if ((m = new RegExp(`^you control ${NUM} or more basic lands$`).exec(text))) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: num(m[1]!) };
  if (/^you control a basic land$/.test(text)) return { kind: "control", who: "you", types: ["Land"], supertypes: ["Basic"], min: 1 };
  if (/^you control a planeswalker$/.test(text)) return { kind: "control", who: "you", types: ["Planeswalker"], min: 1 };
  if ((m = /^you control an? (\w+)(?: or an? (\w+))?$/.exec(text)) && [m[1], m[2]].every((x) => x === undefined || BASIC_TYPES.includes(x)))
    return { kind: "control", who: "you", subtypes: [m[1]!, ...(m[2] ? [m[2]] : [])], min: 1 };
  if ((m = new RegExp(`^your opponents control ${NUM} or more lands$`).exec(text))) return { kind: "control", who: "opponents", types: ["Land"], min: num(m[1]!) };
  if ((m = /^a player has (\d+) or less life$/.exec(text))) return { kind: "playerLifeAtMost", n: Number(m[1]) };
  if ((m = new RegExp(`^you have ${NUM} or more opponents$`).exec(text))) return { kind: "opponents", min: num(m[1]!) };
  return null;
}

/** "As ~ enters, you may pay 2 life. If you don't, it enters tapped." and the reveal-a-card lands (CR 614.12). */
function parseEntersChoice(line: string): EntersChoice | null {
  let m: RegExpExecArray | null;
  if ((m = /^As ~ enters(?: the battlefield)?, you may pay (\d+) life\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) return { kind: "payLife", n: Number(m[1]) };
  if ((m = /^As ~ enters(?: the battlefield)?, you may reveal an? (.+?) card from your hand\. If you don't, (?:it|~) enters(?: the battlefield)? tapped\.$/.exec(line))) {
    const subtypes = m[1]!.split(/ or /);
    if (!subtypes.every((x) => BASIC_TYPES.includes(x) || CREATURE_TYPES.has(x))) return null;
    return { kind: "reveal", filter: { kind: "card", subtypes, text: `${m[1]} card` } };
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
function parseConditionalStatic(line: string): StaticAbility | null {
  const text = line.replace(/^[A-Z][A-Za-z' -]+(?: \d+)? — /, "").replace(/\.$/, "");
  let statement: string | undefined;
  let cond: string | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^(.+?) as long as (.+)$/.exec(text))) [statement, cond] = [m[1], m[2]];
  else if ((m = /^As long as ([^,]+), (.+)$/.exec(text))) [cond, statement] = [m[1], m[2]];
  else if ((m = /^During your turn, (.+)$/.exec(text))) [cond, statement] = ["it's your turn", m[1]];
  if (!statement || !cond) return null;
  const st = parseStatic(`${statement.replace(/^(it|this creature|this permanent)\b/i, "~")}.`);
  if (!st || st.condition) return null;
  // "This spell has flash as long as ...": it works from your hand, which a static ability of a permanent can't.
  if (st.mods.some((x) => x.kind === "addKeywords" && x.keywords.includes("Flash"))) return null;
  const condition = parseStaticCondition(cond, st);
  return condition ? { ...st, text: line, condition } : null;
}

/**
 * Cost changes (CR 601.2f). A permanent's "Instant and sorcery spells you cast cost {1} less to cast",
 * "Noncreature spells cost {1} more to cast", "Spells your opponents cast cost {1} more to cast"; and a
 * spell's own "This spell costs {1} less to cast for each creature card in your graveyard", "... where X
 * is ...", "... if you control a Wizard" / "If an opponent controls seven or more lands, ...". Only generic
 * mana: a reduction can't take colored mana off (CR 118.7a).
 */
function parseCostChange(line: string): { costMod: CostMod } | { less: Amount } | { lessIf: { n: number; cond: StaticCondition } } | { lessIfTargets: { n: number; filter: TargetSpec } } | "fail" | null {
  const text = line.replace(/^[A-Z][A-Za-z' -]+ — (?=~ costs)/, "").replace(/\.$/, ""); // "Domain —" is an ability word
  let m: RegExpExecArray | null;
  if ((m = /^~ costs \{(\d+)\} less to cast for each (.+)$/.exec(text))) {
    const c = parseCount(m[2]!, null, true);
    return c ? { less: { ...c, times: (c.times ?? 1) * Number(m[1]) } } : "fail";
  }
  if ((m = /^~ costs \{X\} less to cast, where X is (.+)$/.exec(text))) {
    const c = parseCount(m[1]!, null);
    return c ? { less: c } : "fail";
  }
  if ((m = /^~ costs \{(\d+)\} less to cast if it targets (an? .+)$/.exec(text))) {
    const filter = parseTargetPhrase(m[2]!.replace(/^an? /, ""));
    return filter?.kind === "object" ? { lessIfTargets: { n: Number(m[1]), filter } } : "fail";
  }
  const self: StaticAbility = { affects: { kind: "self" }, mods: [], text: line };
  if ((m = /^~ costs \{(\d+)\} less to cast if (.+)$/.exec(text)) || (m = /^If (.+), ~ costs \{(\d+)\} less to cast$/.exec(text))) {
    const [n, condText] = /^~/.test(text) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
    const cond = parseStaticCondition(condText, self);
    return cond ? { lessIf: { n: Number(n), cond } } : "fail";
  }
  m = /^(?:(During your turn|During turns other than yours), )?(.+?)( you cast| your opponents cast)?( with mana value \d+ or (?:greater|less))?( from your graveyard)? costs? (\{\d+\}) (less|more) to cast$/.exec(text);
  if (!m || !/spells?$/i.test(m[2]!)) return null;
  const words = m[2]!.replace(/ ?spells?$/i, "").replace(/ and /g, " or ").trim();
  // "Spells you cast", "Instant and sorcery spells", "Noncreature spells", "Dragon spells", "Blue spells"
  const filter = words ? parseTargetPhrase(`${words} spell${m[4] ?? ""}`) : { kind: "spell" as const, text: "spell" };
  if (!filter || filter.kind !== "spell") return "fail";
  const who = m[3] === " you cast" ? "you" : m[3] === " your opponents cast" ? "opponents" : "all";
  if (m[5] && who !== "you") return "fail";
  const n = Number(/\d+/.exec(m[6]!)![0]) * (m[7] === "less" ? -1 : 1);
  return {
    costMod: {
      who,
      filter: { ...filter, text: `${words ? `${words.toLowerCase()} ` : ""}spells` },
      n,
      ...(m[1] ? { turn: m[1] === "During your turn" ? "yours" : "notYours" } : {}),
      ...(m[5] ? { fromGraveyard: true } : {}),
      text: line,
    },
  };
}

const CONTROL_COUNT = new RegExp(`^(?:(no|another|an?)|${NUM} or more(?: other)?|${NUM} or fewer) (.+)$`);

/** The condition of an "as long as" static ability (see parseConditionalStatic). */
function parseStaticCondition(text: string, st: StaticAbility): StaticCondition | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(?:there are )?${NUM} or more cards (?:are )?in your graveyard$`).exec(text))) return { kind: "graveyardAtLeast", n: num(m[1]!) };
  if ((m = new RegExp(`^there are ${NUM} or more card types among cards in your graveyard$`).exec(text))) return { kind: "graveyardTypes", n: num(m[1]!) };
  if ((m = new RegExp(`^there are ${NUM} or more permanent cards in your graveyard$`).exec(text))) return { kind: "graveyardPermanents", n: num(m[1]!) };
  if (/^it's your turn$/.test(text)) return { kind: "yourTurn" };
  if (/^you attacked(?: with (?:a|one or more) creatures?)? this turn$/.test(text)) return { kind: "attackedThisTurn" };
  // "It" is the source only when the ability is about the source itself.
  const self = /^(?:~|it)(?:'s| is) (attacking|enchanted|equipped|modified)$/.exec(text);
  if (self && (st.affects.kind === "self" || text.startsWith("~"))) return { kind: "self", is: self[1] as "attacking" | "enchanted" | "equipped" | "modified" };
  if ((m = new RegExp(`^(?:~|it) has an? ${COUNTER} counter on it$`).exec(text)) && (st.affects.kind === "self" || text.startsWith("~")))
    return { kind: "selfCounter", counter: counterKind(m[1]!) };
  if ((m = /^(you|an opponent|defending player) controls? (.+)$/.exec(text))) {
    const who = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "defending";
    // Each attacking creature has its own defending player (CR 506.2), so only the source's own is modeled.
    if (who === "defending" && st.affects.kind !== "self") return null;
    const q = CONTROL_COUNT.exec(m[2]!);
    if (!q) return null;
    // NUM is a group of its own: q[1] the word, q[2] "N or more", q[3] "N or fewer", q[4] what.
    const filter = pickFilter(q[4]!);
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

function isKeywordLine(line: string): boolean {
  return line
    .split(/,\s*/)
    .every((p) => !!keywordOf(p));
}

const TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^When(?:ever)? ~ enters(?: the battlefield)?, (.+)$/, "selfEnters"],
  [/^When(?:ever)? ~ dies, (.+)$/, "selfDies"],
  [/^When(?:ever)? ~ leaves the battlefield, (.+)$/, "selfLeaves"],
  [/^When(?:ever)? ~ is put into (?:a|your) graveyard from the battlefield, (.+)$/, "selfToGraveyard"],
  [/^When(?:ever)? ~ becomes the target of a spell or ability, (.+)$/, "selfBecomesTarget"],
  [/^At the beginning of (?:the|each) end step, (.+)$/, "eachEndStep"],
  [/^Whenever ~ attacks, (.+)$/, "selfAttacks"],
  // Battle cards aren't supported, so nothing can attack one and "a player or battle" is just a player.
  // Revisit when battles are (CR 310).
  [/^Whenever ~ deals combat damage to a player(?: or battle)?, (.+)$/, "selfDealsCombatDamageToPlayer"],
  [/^Whenever ~ deals combat damage, (.+)$/, "selfDealsCombatDamage"],
  [/^Whenever ~ deals damage, (.+)$/, "selfDealsDamage"],
  [/^Whenever another creature you control enters, (.+)$/, "anotherCreatureYouControlEnters"],
  [/^Whenever another creature enters the battlefield under your control, (.+)$/, "anotherCreatureYouControlEnters"],
  // Landfall
  [/^Whenever a land (?:you control enters|enters the battlefield under your control), (.+)$/, "landYouControlEnters"],
  // Blocking (CR 509.3). The "a creature" forms are matched first, by parseBlockTrigger.
  [/^Whenever ~ blocks or becomes blocked, (.+)$/, "selfBlocksOrBecomesBlocked"],
  [/^Whenever ~ becomes blocked, (.+)$/, "selfBecomesBlocked"],
  [/^Whenever ~ blocks, (.+)$/, "selfBlocks"],
  [/^Whenever you gain life, (.+)$/, "youGainLife"],
  [/^At the beginning of your upkeep, (.+)$/, "yourUpkeep"],
  [/^At the beginning of each (?:player's )?upkeep, (.+)$/, "eachUpkeep"],
  [/^At the beginning of your draw step, (.+)$/, "yourDrawStep"],
  [/^At the beginning of each player's draw step, (.+)$/, "eachDrawStep"],
  [/^At the beginning of your end step, (.+)$/, "yourEndStep"],
  [/^When ~ is turned face up, (.+)$/, "selfTurnedFaceUp"],
  // Heroic (an ability word): "Whenever you cast a spell that targets ~".
  [/^Whenever you cast a spell that targets ~, (.+)$/, "selfTargetedByYourSpell"],
];

const SELF_EVENTS: TriggerEvent[] = [
  "selfEnters", "selfDies", "selfLeaves", "selfToGraveyard", "selfBecomesTarget", "selfAttacks", "selfDealsCombatDamageToPlayer", "selfTurnedFaceUp",
  "selfDealsDamage", "selfDealsCombatDamage", "selfTargetedByYourSpell", "selfLastTimeCounterRemoved",
  "selfBlocks", "selfBecomesBlocked", "selfBlocksOrBecomesBlocked", "selfBlocksCreature", "selfBlockedByCreature", "selfBlocksOrBlockedByCreature",
];

/**
 * "Whenever ~ blocks a creature", "Whenever ~ becomes blocked by a creature", "Whenever ~ blocks or
 * becomes blocked by a nonblack creature": once for each such creature, which "that creature" means.
 */
const BLOCK_TRIGGERS: [RegExp, TriggerEvent][] = [
  [/^Whenever ~ blocks or becomes blocked by (an? .+?), (.+)$/, "selfBlocksOrBlockedByCreature"],
  [/^Whenever ~ becomes blocked by (an? .+?), (.+)$/, "selfBlockedByCreature"],
  [/^Whenever ~ blocks (an? .+?), (.+)$/, "selfBlocksCreature"],
];

function parseBlockTrigger(line: string): TriggeredAbility | "fail" | null {
  for (const [re, event] of BLOCK_TRIGGERS) {
    const m = re.exec(line);
    if (!m) continue;
    const what = m[1]!.replace(/^an? /, "");
    const filter = what === "creature" ? undefined : parseTargetPhrase(what);
    if (filter === null || (filter && filter.kind !== "object")) return "fail";
    const body = parseBody(m[2]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { subject: true });
    if (!body) return "fail";
    return { event, body, ...(filter ? { subjectFilter: { ...filter, text: what } } : {}) };
  }
  return null;
}

/**
 * "Whenever you cast a noncreature spell", "Whenever an opponent casts a creature spell",
 * "Whenever a player casts a spell". Nothing copies spells in the engine yet, so "cast or copy"
 * (magecraft) is the same as "cast".
 */
const CAST_TRIGGER = /^Whenever (you|an opponent|a player) casts? (?:or copy |or copies )?(an? .+?)(?: spell)?, (.+)$/;
const CAST_BY = { you: "you", "an opponent": "opponent", "a player": "any" } as const;

function parseCastTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = CAST_TRIGGER.exec(line);
  if (!m) return null;
  const what = m[2]!.replace(/^an? /, "");
  // "a spell of the chosen color", "a creature spell of the chosen type": the choice made as this permanent entered.
  const spell = /^spell$/.test(what) ? { kind: "spell" as const, text: "spell" } : parseTargetPhrase(/\bspell\b/.test(what) ? what : `${what} spell`, { chosen: true });
  if (!spell || spell.kind !== "spell") return "fail";
  const body = parseBody(m[3]!, { castSpell: true });
  if (!body) return "fail";
  return { event: "castSpell", cast: { by: CAST_BY[m[1] as keyof typeof CAST_BY], spell: { ...spell, text: /\bspell\b/.test(what) ? what : `${what} spell` } }, body };
}

/**
 * "Whenever a creature you control enters", "Whenever another nontoken creature you control with power 2 or
 * less enters", "Whenever ~ or another Ally you control enters", "When a creature with mana value 5 or
 * greater enters": the entering permanent is the subject ("that creature", "it", "its power"). "One or
 * more" (one trigger for several entering at once) isn't modeled.
 */
const ENTERS_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) enters(?: the battlefield)?( under your control| under an opponent's control)?, (.+)$/;

function parseEntersTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = ENTERS_TRIGGER.exec(line);
  if (!m) return null;
  let phrase = m[2]!;
  if (m[3]) phrase += m[3] === " under your control" ? " you control" : " an opponent controls";
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  const body = parseBody(m[4]!, { subjectIt: true });
  if (!body) return "fail";
  const kind = m[1]!.toLowerCase();
  return {
    event: "permanentEnters",
    enters: { filter: { ...filter, text: phrase }, ...(kind === "another" ? { other: true } : {}), ...(kind === "~ or another" ? { orSelf: true } : {}) },
    body,
  };
}

/**
 * The sentences after "Look at (Reveal) the top N cards of your library": which to take ("Put one of them
 * into your hand", "You may reveal a creature card from among them and put it into your hand", "You may
 * put one of those cards back on top of your library") and where the rest go ("Put the rest into your
 * graveyard", "on the bottom of your library in a random order"). "more" while the rest is still to come.
 */
function parseDig(s: string, dig: Partial<Extract<Effect, { type: "dig" }>>): Extract<Effect, { type: "dig" }> | "more" | null {
  const REST = "(into your graveyard|on the bottom of your library(?: in (?:any|a random) order)?)";
  const restOf = (r: string) => (r === "into your graveyard" ? "graveyard" : "bottom");
  let m: RegExpExecArray | null;
  if (dig.into === undefined) {
    if ((m = new RegExp(`^Put (one|two|three) of (?:them|those cards) into your hand(?: and (?:the rest|the other) ${REST})?$`).exec(s))) {
      Object.assign(dig, { count: num(m[1]!), upTo: false, into: "hand" });
      if (m[2]) dig.rest = restOf(m[2]);
    } else if ((m = /^You may (?:reveal (an? .+?) from among them and put it|put (an? .+?) from among them) into your hand$/.exec(s))) {
      const filter = parseSearchFilter((m[1] ?? m[2])!.replace(/^an? /, ""));
      if (!filter) return null;
      Object.assign(dig, { count: 1, upTo: true, filter, into: "hand" });
    } else if (/^You may put one of (?:them|those cards) back on top of your library$/.test(s)) {
      Object.assign(dig, { count: 1, upTo: true, into: "libraryTop" });
    } else return null;
    return dig.rest ? (dig as Extract<Effect, { type: "dig" }>) : "more";
  }
  if ((m = new RegExp(`^Put the rest ${REST}$`).exec(s))) return { ...(dig as Extract<Effect, { type: "dig" }>), rest: restOf(m[1]!) };
  return null;
}

const DIES_TRIGGER = /^When(?:ever)? (~ or another|another|an?) (.+?) dies, (.+)$/;

/**
 * "Whenever another creature dies", "Whenever a creature you control dies", "Whenever ~ or another Zombie
 * you control dies", "Whenever a creature dealt damage by ~ this turn dies", "Whenever equipped creature
 * dies": "it" and "that card" are the card in the graveyard, "its power" as it last existed (CR 603.10a).
 */
function parseDiesTrigger(line: string): TriggeredAbility | "fail" | null {
  const attached = /^Whenever (equipped|enchanted) creature dies, (.+)$/.exec(line);
  const m = attached ? null : DIES_TRIGGER.exec(line);
  if (!attached && !m) return null;
  const bodyText = attached ? attached[2]! : m![3]!;
  const body = parseBody(bodyText, { subjectIt: true, subjectLeft: true });
  if (!body) return "fail";
  if (attached) return { event: "permanentDies", dies: { filter: { kind: "object", types: ["Creature"], text: "creature" }, attached: true }, body };
  let phrase = m![2]!;
  const damaged = / dealt damage by ~ this turn$/.exec(phrase);
  if (damaged) phrase = phrase.slice(0, damaged.index);
  const filter = parseTargetPhrase(phrase);
  if (!filter || filter.kind !== "object") return "fail";
  const kind = m![1]!.toLowerCase();
  return {
    event: "permanentDies",
    dies: {
      filter: { ...filter, text: phrase },
      ...(kind === "another" ? { other: true } : {}),
      ...(kind === "~ or another" ? { orSelf: true } : {}),
      ...(damaged ? { damagedBySelf: true } : {}),
    },
    body,
  };
}

/**
 * "Whenever you draw a card", "whenever an opponent draws a card", "whenever a player draws a card",
 * "whenever you draw your second card each turn" (the count includes cards drawn before the source
 * was on the battlefield). "That player" is whoever drew.
 */
function parseDrawTrigger(line: string): TriggeredAbility | "fail" | null {
  const m = /^Whenever (you|an opponent|a player) draws? (a card|your (first|second|third) card each turn), (.+)$/.exec(line);
  if (!m) return null;
  const body = parseBody(m[4]!, { eventPlayer: true });
  if (!body) return "fail";
  const by = m[1] === "you" ? "you" : m[1] === "an opponent" ? "opponent" : "any";
  const nth = m[3] ? { first: 1, second: 2, third: 3 }[m[3] as "first"] : undefined;
  return { event: "playerDraws", draws: { by, ...(nth ? { nth } : {}) }, body };
}

function parseTrigger(raw: string): TriggeredAbility | "fail" | null {
  // An ability word ("Magecraft —", "Landfall —") has no rules meaning (CR 207.2c).
  const line = raw.replace(/^[A-Z][A-Za-z' -]+ — (?=(When|Whenever|At)\b)/, "");
  if (!/^(When|Whenever|At)\b/.test(line)) return null;
  // "When ~ enters, if you attacked this turn, ...": an intervening "if" (CR 603.4) about the game. It's
  // checked as the ability would trigger and again as it resolves, so it can't be an ordinary effect.
  const intervening = /^((?:When|Whenever|At)\b[^,]*), if ([^,]+), (.+)$/.exec(line);
  // "If it's attacking" is about the source only in an ability about the source itself.
  const aboutIt = intervening && /^(it|~)\b/.test(intervening[2]!) && !/^(When|Whenever) ~ /.test(intervening[1]!);
  const ifCond = intervening && !aboutIt && parseStaticCondition(intervening[2]!, { affects: { kind: "self" }, mods: [], text: "" });
  if (intervening && ifCond) {
    const t = parseTrigger(`${intervening[1]}, ${intervening[3]}`);
    return t && t !== "fail" && !t.ifCond ? { ...t, ifCond } : "fail";
  }
  // Heroic before the other "whenever you cast" triggers.
  const heroic = /^Whenever you cast a spell that targets ~, (.+)$/.exec(line);
  if (heroic) {
    const body = parseBody(heroic[1]!.replace(/^it (?=(?:gets|gains|deals|has|becomes)\b)/, "~ "), { selfIt: true });
    return body ? { event: "selfTargetedByYourSpell", body } : "fail";
  }
  const cast = parseCastTrigger(line);
  if (cast) return cast;
  const block = parseBlockTrigger(line);
  if (block) return block;
  const enters = parseEntersTrigger(line);
  if (enters) return enters;
  const draws = parseDrawTrigger(line);
  if (draws) return draws;
  const dies = parseDiesTrigger(line);
  if (dies) return dies;
  for (const [re, event] of TRIGGERS) {
    const m = re.exec(line);
    if (m) {
      // "When ~ enters, it deals 2 damage...": in a trigger about the permanent itself, a leading "it" is that permanent.
      const self = SELF_EVENTS.includes(event);
      // "When ~ enters, if it was kicked, ...": an intervening if (CR 603.4) on how it was cast.
      let body0 = m[1]!;
      let ifKicked: SpellCondition | undefined;
      const kicked = /^if it was kicked(?: with its ((?:\{[^}]+\})+) kicker)?, (.+)$/i.exec(body0);
      if (kicked) {
        if (event !== "selfEnters") return "fail" as const;
        ifKicked = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}) };
        body0 = kicked[2]!;
      }
      let text = self ? body0.replace(/^it (?=(?:gets|gains|deals|has|becomes|fights|explores)\b)/, "~ ") : body0;
      // "You gain that much life", "put that many +1/+1 counters on it": the damage the event dealt.
      const damage = event === "selfDealsDamage" || event === "selfDealsCombatDamage" || event === "selfDealsCombatDamageToPlayer";
      const thatMuch = damage && /\bthat (?:much|many)\b/.test(text);
      if (thatMuch) {
        if (/\bX\b/.test(text)) return "fail" as const;
        text = text.replace(/\bthat (?:much|many)\b/g, "X");
      }
      // "Put a +1/+1 counter on it", "untap it": in a trigger about the permanent itself, "it" is that
      // permanent, except after it left ("return it to your hand" means the card in the graveyard).
      const left = event === "selfDies" || event === "selfToGraveyard" || event === "selfLeaves";
      let body = parseBody(text, { selfIt: self && !left, selfCard: left, eventPlayer: event === "selfDealsCombatDamageToPlayer" || event === "eachUpkeep" || event === "eachDrawStep" });
      if (body && thatMuch) body = replaceX(body, { count: { kind: "eventAmount" } });
      return body ? { event, body, ...(ifKicked ? { ifKicked } : {}) } : ("fail" as const);
    }
  }
  return "fail" as const;
}

function parseActivated(line: string): ActivatedAbility | "fail" | null {
  // Costs: mana symbols run together ("{1}{R}"), other parts are comma-separated ("{2}, {T}, Sacrifice ~").
  const piece = String.raw`(?:\{[^}]+\})+|Sacrifice ~|Pay \d+ life|Pay (?:\{E\})+|Pay \w+ \{E\}|Sacrifice (?:an?|another|one|two|three|four|five) [^,:]+?|Discard (?:an?|one|two|three) [^,:]*?cards?`;
  const m = new RegExp(`^((?:${piece})(?:, (?:${piece}))*): (.+)$`).exec(line);
  if (!m) return null;
  const costs = m[1]!;
  // Sacrificing other permanents or discarding cards as part of the cost (CR 602.2b, 601.2h).
  const extra: AdditionalCost[] = [];
  for (const part of costs.split(", ")) {
    let c: RegExpExecArray | null;
    if (part !== "Sacrifice ~" && (c = new RegExp(`^Sacrifice (another|${NUM}) (.+)$`).exec(part))) {
      const filter = pickFilter(c[3]!); // NUM is a group of its own
      if (!filter) return "fail";
      extra.push({ kind: "sacrifice", filter, n: c[1] === "another" ? 1 : num(c[1]!), ...(c[1] === "another" ? { other: true } : {}) });
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
  const life = /Pay (\d+) life/.exec(costs);
  const energy = energyIn(costs);
  if (energy < 0) return "fail";
  const symbols = [...costs.replace(/Pay (?:\{E\})+|Pay \w+ \{E\}/, "").matchAll(/\{([^}]+)\}/g)].map((x) => x[1]!);
  if (symbols.some((x) => x === "Q" || x === "E")) return "fail";
  const tap = symbols.includes("T");
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
    text: line,
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(life ? { lifeCost: Number(life[1]) } : {}),
    ...(energy ? { energyCost: energy } : {}),
    ...(extra.length ? { costs: extra } : {}),
  };
}

/** How much energy "Pay {E}{E}" or "Pay eight {E}" asks for (CR 107.14), or 0. */
function energyIn(costs: string): number {
  const m = /Pay ((?:\{E\})+)|Pay (\w+) \{E\}/.exec(costs);
  if (!m) return 0;
  if (m[1]) return m[1].length / 3;
  const n = num(m[2]!);
  return Number.isFinite(n) ? n : -1; // a number we don't read ("fifty")
}

// ---------------------------------------------------------------------------
// Static abilities (CR 604)

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "Elves" -> "Elf", "Zombies" -> "Zombie", "Wolves" -> "Wolf". */
function singular(word: string): string {
  if (/^(Zombie|Faerie)s$/.test(word)) return word.slice(0, -1);
  if (/ves$/.test(word)) return word.replace(/ves$/, "f");
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(x|ch|sh)es$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word; // Merfolk, Sheep, ...
}

/**
 * The group a static ability talks about: "creatures you control", "other Elves you
 * control", "white creatures you control", "enchanted creature", "equipped creature", "~".
 */
function parseAffected(subject: string): Affects | null {
  const x = subject.trim();
  if (x === "~") return { kind: "self" };
  if (/^(Enchanted|Equipped) (creature|permanent|artifact|land)$/.test(x)) return { kind: "attached" };
  let m = /^(Other )?((?:[A-Z]?[a-z]+ )*?)creatures (you control|your opponents control)$/i.exec(x);
  if (m) {
    const words = m[2]!.trim().split(/\s+/).filter(Boolean);
    const colors: Color[] = [];
    const subtypes: string[] = [];
    const types = ["Creature"];
    let combat: "attacking" | "blocking" | undefined;
    for (const w of words) {
      if (COLOR_WORDS[w.toLowerCase()]) colors.push(COLOR_WORDS[w.toLowerCase()]!);
      // "Artifact creatures you control get +1/+1": both card types.
      else if (/^(artifact|enchantment)$/i.test(w) && !types.includes(capital(w.toLowerCase()))) types.push(capital(w.toLowerCase()));
      else if (CREATURE_TYPES.has(w)) subtypes.push(w);
      // "Attacking creatures you control get +1/+0": whichever are attacking right now (CR 611.3a).
      else if ((w.toLowerCase() === "attacking" || w.toLowerCase() === "blocking") && !combat) combat = w.toLowerCase() as "attacking" | "blocking";
      else return null; // "Enchanted creatures", ...: not supported yet
    }
    return {
      kind: "filter",
      types,
      subtypes: subtypes.length ? subtypes : undefined,
      colors: colors.length ? colors : undefined,
      ...(combat ? { spec: { kind: "object" as const, combat, text: `${combat} creature` } } : {}),
      controller: m[3]!.toLowerCase() === "you control" ? "you" : "opponent",
      other: !!m[1],
    };
  }
  // "Other Zombies you control", "Elves you control"
  m = /^(Other )?([A-Z][a-z]+) you control$/.exec(x);
  if (m && CREATURE_TYPES.has(singular(m[2]!))) return { kind: "filter", types: ["Creature"], subtypes: [singular(m[2]!)], controller: "you", other: !!m[1] };
  if (/^(All creatures|Each creature)$/i.test(x)) return { kind: "filter", types: ["Creature"] };
  // Anything else a group can say: "Each creature you control with a +1/+1 counter on it", "Creatures of the chosen type".
  const g = parseGroup(x, true);
  return g ? { kind: "filter", types: [], spec: g.filter, ...(g.other ? { other: true } : {}) } : null;
}

/** "get +1/+1", "have flying and vigilance", "get +2/+0 and have first strike", "can't block". */
function parseStaticMods(rest: string): Modification[] | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^gets? ${PT}/${PT}(?: and (?:has|have) (.+))?$`).exec(rest))) {
    const mods: Modification[] = [{ kind: "modifyPT", power: ptAmt(m[1]!), toughness: ptAmt(m[2]!) }];
    if (m[3]) {
      const grants = parseGrants(m[3]);
      if (!grants) return null;
      mods.push(...grants);
    }
    return mods;
  }
  if ((m = /^(?:has|have) (.+)$/.exec(rest))) return parseGrants(m[1]!);
  if (/^can't attack or block$/.test(rest)) return [{ kind: "cantAttack" }, { kind: "cantBlock" }];
  // CR 506.5: alone means the only creature declared as an attacker (or blocker) that combat.
  if (/^can't attack or block alone$/.test(rest)) return [{ kind: "cantAttackAlone" }, { kind: "cantBlockAlone" }];
  if (/^can't attack alone$/.test(rest)) return [{ kind: "cantAttackAlone" }];
  if (/^can't block alone$/.test(rest)) return [{ kind: "cantBlockAlone" }];
  if (/^must be blocked if able$/.test(rest)) return [{ kind: "mustBeBlocked" }];
  // "Can't attack unless defending player controls an Island" (Sea Serpent), "... a Swamp", "... a blue permanent".
  if ((m = /^can't attack unless defending player controls (an? .+)$/.exec(rest))) {
    const filter = parseTargetPhrase(m[1]!.replace(/^an? /, ""));
    return filter?.kind === "object" && !filter.controller ? [{ kind: "cantAttackUnless", defenderControls: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can't block$/.test(rest)) return [{ kind: "cantBlock" }];
  if (/^can't attack$/.test(rest)) return [{ kind: "cantAttack" }];
  if (/^can't be blocked$/.test(rest)) return [{ kind: "cantBeBlocked" }];
  if (/^can't be blocked by more than one creature$/.test(rest)) return [{ kind: "maxOneBlocker" }];
  if ((m = /^can't be blocked by (.+)$/.exec(rest))) {
    // "creatures with power 2 or less", "Walls", "blue creatures", "artifact creatures" (CR 509.1b)
    // In the singular, as parseTargetPhrase reads it: "creature with power 2 or less", "Wall", "blue creature".
    const [head, ...rest] = m[1]!.split(/ (?=with )/);
    const phrase = [head!.split(" ").map(singular).join(" "), ...rest].join(" ");
    const filter = parseTargetPhrase(phrase);
    return filter && filter.kind === "object" ? [{ kind: "cantBeBlockedBy", filter: { ...filter, text: m[1]! } }] : null;
  }
  if (/^can block only creatures with flying$/.test(rest)) return [{ kind: "blocksOnlyFlyers" }];
  if (/^attacks? each combat if able$/.test(rest)) return [{ kind: "attacksIfAble" }];
  if (/^doesn't untap during (?:its controller's|your) untap step$/.test(rest)) return [{ kind: "doesntUntap" }];
  if (/^loses all abilities$/.test(rest)) return [{ kind: "loseAllAbilities" }];
  return null;
}

function parseStatic(line: string): StaticAbility | null {
  let text = line.replace(/\.$/, "");
  // "You control enchanted creature." (Mind Control)
  if (/^You control enchanted (creature|permanent|artifact|land)$/.test(text)) return { affects: { kind: "attached" }, mods: [{ kind: "control" }], text: line };
  const cda = parseDefinedPT(text);
  if (cda) return { affects: { kind: "self" }, mods: [cda], text: line };
  const where = /^(.+), where X is (.+)$/.exec(text);
  if (where) text = where[1]!;
  // "Creatures with power less than ~'s power can't block it." "All creatures able to block ~ do so." (CR 509.1b-c)
  if (/^Creatures with power less than ~'s power can't block it$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "cantBeBlockedByLesserPower" }], text: line };
  if (/^All creatures able to block ~ do so$/.test(text)) return { affects: { kind: "self" }, mods: [{ kind: "allMustBlock" }], text: line };
  const m = /^(.+?) (gets? .+|(?:has|have) .+|can't .+|can block only .+|must be blocked if able|attacks? each combat if able|doesn't untap .+|loses all abilities)$/.exec(text);
  if (!m) return null;
  const affects = parseAffected(m[1]!);
  if (!affects) return null;
  // "~ gets +1/+1 for each artifact you control": counted continuously (CR 611.3a).
  const each = new RegExp(`^(gets? ${PT}/${PT}) for each (.+)$`).exec(m[2]!);
  let mods = parseStaticMods(each ? each[1]! : m[2]!);
  if (!mods) return null;
  const counts = (c: AmountExpr | null) => c && staticCountOk(c, affects) ? c : null;
  if (each) {
    const per = counts(parseCount(each[4]!, null, true));
    const pt = mods[0];
    if (!per || mods.length !== 1 || pt?.kind !== "modifyPT") return null;
    const [p, t] = [scaleAmount(pt.power, per), scaleAmount(pt.toughness, per)];
    if (p === null || t === null) return null;
    mods = [{ kind: "modifyPT", power: p, toughness: t }];
  }
  if (where) {
    const def = counts(parseCount(where[2]!, null));
    if (!def) return null;
    mods = replaceX(mods, def);
  }
  // A static ability has no X of its own to choose (CR 107.3).
  return usesX(mods) ? null : { affects, mods, text: line };
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

interface Ctx {
  targets: TargetSpec[];
  /** In a trigger about another object ("blocks a creature"), "that creature" is that object. */
  subject?: boolean;
  /** "Whenever a creature you control enters": "it", "its power", "that land" are the entering permanent too. */
  subjectIt?: boolean;
  /** In a trigger about the permanent itself, "it" (with no target before it) is that permanent. */
  selfIt?: boolean;
  /** After it left the battlefield ("When ~ dies, return it to its owner's hand"), "it" is the card in its new zone. */
  selfCard?: boolean;
  /** Index of the most recent object target, for "it" / "its controller". */
  lastObjectTarget?: number;
  /** The most recent "up to two target creatures", for "they" / "those creatures". */
  lastTargets?: { index: number; n?: number };
  /** Index of the most recent player target, for "that player's hand". */
  lastPlayerTarget?: number;
  /** In an activated ability: "its power" with no target before it is the source's. */
  activated?: boolean;
  /** The last sentence created one token: "put a +1/+1 counter on it" means that token. */
  lastCreated?: boolean;
  /** An instant or sorcery: "other" can't mean other than its source, which isn't a permanent. */
  spell?: boolean;
  /** A "whenever a player casts a spell" trigger: "it" or "that spell" can be the spell cast. */
  castSpell?: boolean;
  /** "Whenever ~ deals combat damage to a player": "that player" is that player. */
  eventPlayer?: boolean;
  /** "Whenever another creature dies": the subject left the battlefield, so "it" and "that card" are the card where it went. */
  subjectLeft?: boolean;
}

/** Effects that can stop a resolution to wait for a player's choice. */
const PAUSING = new Set<Effect["type"]>(["discard", "scry", "surveil", "may", "explore", "search", "choose", "connive", "pick"]);

/** "You may [this]. If you do, ...": whether it was done is known (see canDoNow in effects.ts). */
const checkableMay = (e: Effect) =>
  (e.type === "discard" && e.who.ref === "you" && e.n === 1 && !e.random) || (e.type === "draw" && e.who.ref === "you") || (e.type === "sacrifice" && e.what.ref === "self");

/** Split text into sentences, keeping a quoted ability ('gains "Sacrifice ~. Draw a card."') whole. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && /\s/.test(text[i]!) && (text[i - 1] === "." || (text[i - 1] === '"' && text[i - 2] === "."))) {
      if (text.slice(start, i).trim()) out.push(text.slice(start, i));
      while (i + 1 < text.length && /\s/.test(text[i + 1]!)) i++;
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) out.push(text.slice(start));
  return out;
}

export function parseBody(text: string, opts: { subject?: boolean; subjectIt?: boolean; subjectLeft?: boolean; selfIt?: boolean; selfCard?: boolean; activated?: boolean; spell?: boolean; castSpell?: boolean; eventPlayer?: boolean } = {}): AbilityBody | null {
  const modal = MODAL.exec(text.trim());
  if (modal) return parseModal(modal[1]!, modal[2]!, text.trim(), opts.spell);
  if (text.includes("•")) return null; // modes with text before them, or a kind of choice we don't support
  const ctx: Ctx = {
    targets: [],
    ...(opts.subject ? { subject: true } : {}),
    ...(opts.subjectIt ? { subject: true, subjectIt: true } : {}),
    ...(opts.subjectLeft ? { subjectLeft: true } : {}),
    ...(opts.selfIt ? { selfIt: true } : {}),
    ...(opts.selfCard ? { selfCard: true } : {}),
    ...(opts.activated ? { activated: true } : {}),
    ...(opts.spell ? { spell: true } : {}),
    ...(opts.castSpell ? { castSpell: true } : {}),
    ...(opts.eventPlayer ? { eventPlayer: true } : {}),
  };
  const effects: Effect[] = [];
  const sentences = splitSentences(text.trim())
    .map((x) => x.replace(/\.$/, "").trim())
    // "Draw two cards, then discard a card": two instructions, in order.
    // A search's "then shuffle" is part of the search (CR 701.23): "you may search" covers it too.
    // Not after "If you do,": all of it depends on the payment ("If you do, choose a color, then ...").
    .flatMap((x) => (/^If you do, /.test(x) ? [x] : x.split(/, then (?!shuffle)/).map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p))))
    .filter(Boolean);
  let prevStart = 0;
  let curStart = 0;
  // "You may pay {2}" waits for the sentence after: "If you do, draw a card."
  let payFirst: { pay: PayCost; text: string } | null = null;
  // "Look at the top four cards of your library" waits for what to do with them (see parseDig).
  let dig: Partial<Extract<Effect, { type: "dig" }>> | null = null;
  for (let s of sentences) {
    s = s.replace(/^Then,? /, "");
    [prevStart, curStart] = [curStart, effects.length];
    const look = new RegExp(`^(Look at|Reveal) the top ${NUMX} cards? of your library$`, "i").exec(s);
    if (look && !dig) {
      dig = { type: "dig", n: amt(look[2]!), reveal: /^reveal/i.test(look[1]!) };
      continue;
    }
    if (dig) {
      const done = parseDig(s, dig);
      if (!done) return null;
      if (done === "more") continue;
      effects.push(done);
      dig = null;
      continue;
    }
    if (payFirst) {
      const then = /^If you do, (.+)$/.exec(s);
      if (!then) return null;
      const inner = parseOne(then[1]!.charAt(0).toUpperCase() + then[1]!.slice(1), ctx);
      if (!inner || (inner.length > 1 && inner.some((e) => PAUSING.has(e.type)))) return null;
      effects.push({ type: "may", effects: inner, pay: payFirst.pay, text: `${payFirst.text}. If you do, ${then[1]}` });
      payFirst = null;
      continue;
    }
    const mayPay = /^[Yy]ou may pay (.+)$/.exec(s);
    if (mayPay) {
      const pay = parsePayCost(mayPay[1]!);
      if (!pay) return null;
      payFirst = { pay, text: `pay ${mayPay[1]}` };
      continue;
    }
    // "If ~ was kicked, draw a card." / "If ~ was kicked, it deals 5 damage instead." (CR 702.33e)
    const kicked = /^If (?:~|it) was kicked(?: with its ((?:\{[^}]+\})+) kicker)?, (.+)$/.exec(s);
    if (kicked) {
      const fx = parseKicked(kicked[2]!, effects.slice(prevStart), ctx);
      if (!fx) return null;
      const cond: SpellCondition = { kind: "kicked", ...(kicked[1] ? { cost: kicked[1] } : {}) };
      if (fx.instead) effects.splice(prevStart, effects.length - prevStart, { type: "if", cond, effects: fx.effects, otherwise: effects.slice(prevStart) });
      else effects.push({ type: "if", cond, effects: fx.effects });
      continue;
    }
    // "..., where X is the number of creatures you control": X is defined by the text (CR 107.3c).
    // It's read after the rest of the sentence, which may name what it counts ("that player's hand").
    const where = /^(.+), where X is (.+)$/.exec(s);
    if (where) s = where[1]!;
    const before = effects.length;
    const defineX = () => {
      if (!where) return true;
      const def = parseCount(where[2]!, ctx);
      if (!def) return false;
      effects.splice(before, effects.length - before, ...replaceX(effects.slice(before), def));
      return true;
    };
    // "You may discard a card. If you do, draw a card." (CR 608.2c): what follows depends on whether it was
    // done. Only for things the engine can tell weren't possible (discarding with no cards in hand, ...).
    // "Exile target creature. Return that card to the battlefield under its owner's control at the beginning of
    // the next end step": the exile becomes a blink that comes back with a delayed trigger (CR 603.7).
    const later =
      /^(?:At the beginning of the next end step, return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control|Return (?:it|that card|the exiled card) to the battlefield under (its owner's|your) control at the beginning of the next end step)(?: with an? (\+1\/\+1) counter on it)?$/i.exec(s);
    const now = /^(?:[Tt]hen )?[Rr]eturn (?:it|that card|them|those cards) to the battlefield under (its owner's|their owners'|your) control$/.exec(s);
    if (now && effects[effects.length - 1]?.type === "exile") {
      const prev = effects[effects.length - 1] as Extract<Effect, { type: "exile" }>;
      if (prev.until || prev.linked || isGroup(prev.what)) return null;
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under: now[1] === "your" ? "you" : "owner" };
      continue;
    }
    if (later) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "exile" || prev.until || prev.linked || isGroup(prev.what) || effects.length - 1 < 0) return null;
      const under = (later[1] ?? later[2]) === "your" ? "you" : "owner";
      effects[effects.length - 1] = { type: "flicker", what: prev.what, under, at: "nextEndStep", ...(later[3] ? { counter: "+1/+1" as const } : {}) };
      continue;
    }
    const ifDid = /^If you (do|don't), (.+)$/.exec(s);
    if (ifDid) {
      const prev = effects[effects.length - 1];
      if (prev?.type !== "may" || prev.pay || !prev.effects.every(checkableMay)) return null;
      const inner = parseOne(ifDid[2]!.charAt(0).toUpperCase() + ifDid[2]!.slice(1), ctx);
      if (!inner) return null;
      effects.push(ifDid[1] === "do" ? { type: "if", cond: { kind: "youDid" }, effects: inner } : { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: inner });
      continue;
    }
    // "If you attacked this turn, create a Treasure token": checked as it resolves (CR 608.2c).
    const ifState = /^If ([^,]+), (.+)$/.exec(s);
    const stateCond = ifState && !/^(it|~)\b/.test(ifState[1]!) && !/\binstead$/.test(ifState[2]!) ? parseStaticCondition(ifState[1]!, { affects: { kind: "self" }, mods: [], text: "" }) : null;
    if (ifState && stateCond) {
      const inner = parseOne(ifState[2]!.charAt(0).toUpperCase() + ifState[2]!.slice(1), ctx);
      // An effect that waits on a player has to be the only one, so resuming it doesn't repeat the others.
      if (!inner || (inner.length > 1 && inner.some((e) => PAUSING.has(e.type)))) return null;
      effects.push({ type: "if", cond: { kind: "state", cond: stateCond }, effects: inner });
      continue;
    }
    // "You may draw a card": optional, decided on resolution (CR 608.2d).
    const may = /^[Yy]ou may (.+)$/.exec(s);
    if (may) {
      const rest = may[1]!.charAt(0).toUpperCase() + may[1]!.slice(1);
      const inner = parseOne(rest, ctx);
      if (!inner) return null;
      // An effect that waits on a player has to be the only one, so resuming it doesn't repeat the others.
      if (inner.length > 1 && inner.some((e) => PAUSING.has(e.type))) return null;
      effects.push({ type: "may", effects: inner, text: may[1]! });
      if (!defineX()) return null;
      continue;
    }
    // "Until end of turn, X ..." reads the same as "X ... until end of turn".
    if (/^Until end of turn, /.test(s)) s = `${s.replace(/^Until end of turn, /, "").replace(/^./, (c) => c.toUpperCase())} until end of turn`;
    // "Target creature you control gains protection from the color of your choice until end of turn": the
    // color is chosen as it resolves (CR 608.2d), after the target was chosen on casting.
    if (/ gains? protection from the color of your choice\b/.test(s)) {
      effects.push({ type: "choose", choice: "color" });
      s = s.replace("the color of your choice", "the chosen color");
    }
    // "Each opponent loses 2 life. You gain life equal to the life lost this way."
    if (/^You gain life equal to the (?:total )?life lost this way$/.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "loseLife") return null;
      last.drain = true;
      continue;
    }
    // "It can't be regenerated." / "They can't be regenerated." after a destroy (CR 701.19c).
    if (/^(It|They) can't be regenerated$/i.test(s)) {
      const last = effects[effects.length - 1];
      if (!last || last.type !== "destroy") return null;
      last.noRegen = true;
      continue;
    }
    // "If that spell is countered this way, exile it instead of putting it into its owner's graveyard" (CR 701.6a).
    if (/^If that spell is countered this way, exile it instead of putting it into its owner's graveyard$/i.test(s)) {
      const last = effects[effects.length - 1];
      if (last?.type !== "counterSpell" || !last.unless) return null;
      last.exile = true;
      continue;
    }
    // "It's still a land." keeps the land type a "becomes a creature" effect would replace (CR 205.1a).
    if (/^It's still an? (land|artifact|enchantment)$/i.test(s)) {
      const last = [...effects].reverse().find((e) => e.type === "continuous" && e.mods.some((x) => x.kind === "setTypes"));
      if (!last || last.type !== "continuous") return null;
      last.mods = last.mods.map((x) => (x.kind === "setTypes" ? { kind: "addTypes", types: x.types, subtypes: x.subtypes } : x));
      continue;
    }
    // 'It has "Sacrifice ~: Add {C}."' gives the tokens just created that ability (CR 111.3).
    const has = /^(?:It has|They have|They each have) "(.+)"$/.exec(s);
    if (has) {
      const prev = effects[effects.length - 1];
      const last = prev?.type === "may" ? prev.effects[prev.effects.length - 1] : prev;
      if (last?.type !== "createToken" || last.token.abilities || !compileQuoted(has[1]!)) return null;
      last.token = { ...last.token, abilities: has[1]! };
      continue;
    }
    const fx = parseOne(s, ctx);
    if (!fx) return null;
    effects.push(...fx);
    if (!defineX()) return null;
  }
  if (payFirst || dig) return null;
  return effects.length ? { targets: ctx.targets, effects, text } : null;
}

/** "{2}{U}", "3 life", "{E}{E}", "{1} and 2 life": a cost paid as an ability resolves. */
function parsePayCost(text: string): PayCost | null {
  let m: RegExpExecArray | null;
  if ((m = /^((?:\{E\})+)$/.exec(text))) return { energy: m[1]!.length / 3 };
  if ((m = /^(\w+) \{E\}$/.exec(text))) {
    const n = num(m[1]!);
    return Number.isFinite(n) ? { energy: n } : null;
  }
  if ((m = /^(\d+) life$/.exec(text))) return { life: Number(m[1]) };
  if ((m = /^((?:\{(?:\d+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+)(?: and (\d+) life)?$/.exec(text))) return { mana: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  return null;
}

/**
 * What "If ~ was kicked, ..." does. With "instead", it replaces the sentence before (`previous`).
 * Targets only the kicked part would need are chosen only if it's kicked (CR 702.33g): not modeled.
 */
function parseKicked(text: string, previous: Effect[], ctx: Ctx): { effects: Effect[]; instead: boolean } | null {
  let t = text;
  const instead = /^instead,? /i.test(t) || / instead$/i.test(t);
  t = t.replace(/^instead,? /i, "").replace(/ instead$/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (instead && !previous.length) return null;
  // "~ deals 2 damage to any target. If ~ was kicked, it deals 5 damage instead": the same damage, more of it.
  const more = /^(?:It|~) deals (\d+|X) damage(?: to (?:that creature|that player|it))?$/.exec(t);
  if (more && instead) {
    const prev = previous[0];
    if (previous.length !== 1 || prev?.type !== "damage") return null;
    return { effects: [{ ...prev, amount: amt(more[1]!) }], instead };
  }
  t = t.replace(/^It deals /, "~ deals ");
  const before = ctx.targets.length;
  const fx = parseOne(t, ctx);
  if (!fx || ctx.targets.length !== before) return null;
  if (fx.length > 1 && fx.some((e) => PAUSING.has(e.type))) return null;
  if (instead && previous.some((e) => PAUSING.has(e.type))) return null;
  return { effects: fx, instead };
}

/** One sentence: a plain instruction, two joined by "and", or one with "for each" / "equal to" in it. */
function parseOne(s: string, ctx: Ctx): Effect[] | null {
  const fx = attempt(ctx, () => parseSentence(s, ctx)) ?? attempt(ctx, () => parseConjunction(s, ctx)) ?? attempt(ctx, () => parseForEach(s, ctx)) ?? attempt(ctx, () => parseEqualTo(s, ctx));
  const last = fx?.[fx.length - 1];
  if (fx) ctx.lastCreated = last?.type === "createToken" && last.n === 1;
  return fx;
}

/** Run a parse that may fail halfway, undoing any targets it added. */
function attempt<T>(ctx: Ctx, f: () => T | null): T | null {
  const saved = { n: ctx.targets.length, o: ctx.lastObjectTarget, p: ctx.lastPlayerTarget };
  const r = f();
  if (r === null) {
    ctx.targets.length = saved.n;
    ctx.lastObjectTarget = saved.o;
    ctx.lastPlayerTarget = saved.p;
  }
  return r;
}

/** Replace every X in these effects with what the text defines it as. */
function replaceX<T>(v: T, def: AmountExpr): T {
  if (Array.isArray(v)) return v.map((x) => replaceX(x, def)) as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.count && (o.count as Count).kind === "x") return substituteX(o as unknown as AmountExpr, def) as T;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, replaceX(x, def)])) as T;
  }
  return v;
}

/** Does anything in here use the X announced while casting or activating? */
export function usesX(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(usesX);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.count && (o.count as Count).kind === "x") return true;
    return Object.values(o).some(usesX);
  }
  return false;
}

/** What "unless its controller pays ..." asks for: "{2}", "{X}", "{1} for each card in your hand", "{2} and 2 life". */
function parseUnlessPays(text: string, ctx: Ctx): UnlessPays | null {
  let m: RegExpExecArray | null;
  if (text === "{X}") return { cost: "", generic: X };
  if ((m = /^((?:\{(?:\d+|[WUBRGC])\})+)(?: and (\d+) life)?$/.exec(text))) return { cost: m[1]!, ...(m[2] ? { life: Number(m[2]) } : {}) };
  if ((m = /^\{(\d+)\} for each (.+)$/.exec(text))) {
    const per = parseCount(m[2]!, ctx, true);
    const generic = per && scaleAmount(Number(m[1]), per);
    return generic === null || generic === undefined ? null : { cost: "", generic };
  }
  return null;
}

/** N for each of something: N times the count. Null if N isn't a plain number. */
function scaleAmount(n: Amount, per: AmountExpr): Amount | null {
  if (typeof n !== "number") return null;
  if (n === 0) return 0;
  // "-1/-1 for each Swamp": the count times 1, made negative.
  return { count: per.count, times: Math.abs(n) * (per.times ?? 1), ...(per.plus ? { plus: Math.abs(n) * per.plus } : {}), ...(n < 0 ? { negate: true } : {}) };
}

/**
 * "Draw a card for each creature you control", "You gain 2 life for each Elf you control",
 * "Target creature gets +1/+1 until end of turn for each artifact you control". The count is made
 * as it resolves (CR 608.2h). The number before it is what gets multiplied.
 */
function parseForEach(s: string, ctx: Ctx): Effect[] | null {
  const m = /^(.+) for each (.+)$/.exec(s) ?? /^For each (.+?), (.+)$/.exec(s);
  if (!m) return null;
  const [main, phrase] = s.startsWith("For each ") ? [m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1), m[1]!] : [m[1]!, m[2]!];
  const fx = parseSentence(main, ctx);
  if (!fx || fx.length !== 1) return null;
  const per = parseCount(phrase, ctx, true);
  if (!per) return null;
  const scaled = scaleEffect(fx[0]!, per);
  return scaled ? [scaled] : null;
}

/** Multiply an effect's number by a count. */
function scaleEffect(e: Effect, per: AmountExpr): Effect | null {
  const sc = (n: Amount) => scaleAmount(n, per);
  switch (e.type) {
    case "damage": {
      const amount = sc(e.amount);
      return amount === null ? null : { ...e, amount };
    }
    case "draw":
    case "gainLife":
    case "loseLife":
    case "counters":
    case "createToken":
    case "mill":
    case "discard":
    case "scry":
    case "surveil":
    case "preventNext": {
      if (e.type === "counters" && e.perLastKnownCounter) return null;
      const n = sc(e.n);
      return n === null ? null : ({ ...e, n } as Effect);
    }
    case "continuous": {
      if (e.mods.length !== 1 || e.mods[0]!.kind !== "modifyPT") return null;
      const [p, t] = [sc(e.mods[0]!.power), sc(e.mods[0]!.toughness)];
      return p === null || t === null ? null : { ...e, mods: [{ kind: "modifyPT", power: p, toughness: t }] };
    }
    default:
      return null;
  }
}

/**
 * "~ deals damage to target creature equal to the number of lands you control", "You gain life
 * equal to its power", "Draw cards equal to ...": the same as X with X defined as that number.
 */
function parseEqualTo(s: string, ctx: Ctx): Effect[] | null {
  // The count is the last group, except where the text puts it in the middle.
  const forms: [RegExp, (m: RegExpExecArray) => string, number?][] = [
    [/^(.+?) deals damage to (.+) equal to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[2]}`],
    [/^(.+?) deals damage equal to (.+?) to (.+)$/i, (m) => `${m[1]} deals X damage to ${m[3]}`, 2],
    [/^(.+?) (gains?|loses?) life equal to (.+)$/i, (m) => `${m[1]} ${m[2]} X life`],
    [/^(.*?)([Dd]raws?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^(.*?)([Mm]ills?) cards equal to (.+)$/, (m) => `${m[1]}${m[2]} X cards`],
    [/^Put a number of ([+-]1\/[+-]1) counters on (.+) equal to (.+)$/i, (m) => `Put X ${m[1]} counters on ${m[2]}`],
    [/^Create a number of (.+) tokens equal to (.+)$/i, (m) => `Create X ${m[1]} tokens`],
  ];
  for (const [re, rewrite, group] of forms) {
    const m = re.exec(s);
    if (!m) continue;
    const fx = parseSentence(rewrite(m), ctx);
    const def = fx && parseCount(m[group ?? m.length - 1]!, ctx);
    return fx && def ? replaceX(fx, def) : null;
  }
  return null;
}

/** "Elves" -> "Elf"; "Plains" stays (it's already singular). */
const singularWord = (w: string) => (/^(Plains|plains|Aurochs|less|this|its|basic|Equipment)$/.test(w) ? w : singular(w));

/**
 * A count: "the number of creatures you control", "cards in your hand", "~'s power", "your
 * devotion to black", "twice the number of ...", "1 plus the number of ...". With `each`, the
 * singular form after "for each": "creature you control", "card in your graveyard".
 * `ctx` is the ability being read (null for a static ability, where "it" is the permanent itself).
 */
export function parseCount(text: string, ctx: Ctx | null, each = false): AmountExpr | null {
  let p = text.trim().replace(/\.$/, "");
  let m: RegExpExecArray | null;
  // Arithmetic around a count.
  if ((m = /^twice (.+)$/i.exec(p))) {
    const c = parseCount(m[1]!, ctx);
    return c && { ...c, times: 2 * (c.times ?? 1), ...(c.plus ? { plus: 2 * c.plus } : {}) };
  }
  if ((m = new RegExp(`^${NUM} plus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { ...c, plus: (c.plus ?? 0) + num(m[1]!) };
  }
  if ((m = new RegExp(`^${NUM} minus (.+)$`, "i").exec(p))) {
    const c = parseCount(m[2]!, ctx);
    return c && { count: c.count, times: -(c.times ?? 1), plus: num(m[1]!) - (c.plus ?? 0) };
  }
  if ((m = new RegExp(`^(.+) (plus|minus) ${NUM}$`, "i").exec(p))) {
    const c = parseCount(m[1]!, ctx);
    const n = num(m[3]!) * (m[2]!.toLowerCase() === "minus" ? -1 : 1);
    return c && { ...c, plus: (c.plus ?? 0) + n };
  }
  if (!each) {
    const nb = /^the number of (.+)$/i.exec(p);
    if (nb) return parseCount(nb[1]!, ctx, true);
  }
  const count = (c: Count): AmountExpr => ({ count: c });
  // Life and hands.
  if (/^your life total$/i.test(p)) return count({ kind: "life", who: { ref: "you" } });
  if ((m = /^cards? in (your|that player's|target player's|their|target opponent's) (hand|library)$/i.exec(p))) {
    const who = whosePlayer(m[1]!, ctx);
    return who && count({ kind: m[2]!.toLowerCase() === "hand" ? "cardsInHand" : "cardsInLibrary", who });
  }
  // Graveyards: "card in your graveyard", "creature card in your graveyard", "instant and sorcery card in all graveyards".
  if ((m = /^(.*?)cards? in (your|all|that player's|target player's|their) graveyards?$/i.exec(p))) {
    const who = /^all$/i.test(m[2]!) ? ({ ref: "eachPlayer" } as PlayerRef) : whosePlayer(m[2]!, ctx);
    if (!who) return null;
    const kinds = m[1]!.trim().replace(/ and /g, " or ");
    if (!kinds) return count({ kind: "cardsInGraveyard", who });
    const spec = parseTargetPhrase(`${kinds.split(/\s+/).map(singularWord).join(" ")} card from a graveyard`, { chosen: true });
    return spec?.kind === "card" ? count({ kind: "cardsInGraveyard", who, filter: { ...spec, text: `${kinds} card` } }) : null;
  }
  // Devotion (CR 700.5): "your devotion to black", "your devotion to black and red".
  if ((m = /^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))?$/i.exec(p)))
    return count({ kind: "devotion", colors: [m[1]!, m[2]].filter(Boolean).map((w) => COLOR_WORDS[w!.toLowerCase()]!) });
  // Domain.
  if (/^basic land types? among lands you control$/i.test(p)) return count({ kind: "basicLandTypes" });
  // Multikicker: "for each time it was kicked", "the number of times ~ was kicked" (CR 702.33d).
  if (/^times? (?:~|it) was kicked$/i.test(p)) return count({ kind: "kicked" });
  // Power, toughness, mana value: "~'s power", "its power", "that creature's toughness".
  if ((m = /^(~'s|its|that creature's|that permanent's|the sacrificed (?:creature|artifact|permanent)'s) (power|toughness|mana value)$/i.exec(p))) {
    const of = whoseObject(m[1]!, ctx);
    const kind = m[2]!.toLowerCase() === "mana value" ? "manaValue" : (m[2]!.toLowerCase() as "power" | "toughness");
    return of && count({ kind, of });
  }
  // "Aura attached to it", "Equipment attached to ~": only the permanent's own.
  if ((m = /^(Aura|Equipment)s? attached to (it|~)$/i.exec(p)) && (ctx === null || ctx.selfIt || /~/.test(m[2]!)))
    return count({ kind: "attachedToSelf", subtypes: [capital(m[1]!.toLowerCase()) === "Aura" ? "Aura" : "Equipment"] });
  // Permanents: "creature you control", "other Elf you control", "land on the battlefield", "artifacts your opponents control".
  if ((m = /^(other )?(.+?) (you control|on the battlefield|your opponents control|an opponent controls)(?: ((?:with|of the chosen|of that|that aren't) .+))?$/i.exec(p))) {
    const words = m[2]!.split(/\s+/).map(singularWord).join(" ");
    const who = m[3]!.toLowerCase();
    const suffix = who === "you control" ? " you control" : who === "on the battlefield" ? "" : " an opponent controls";
    const spec = parseTargetPhrase(`${words}${suffix}${m[4] ? ` ${m[4]}` : ""}`, { chosen: true });
    if (spec?.kind !== "object") return null;
    return count({ kind: "permanents", filter: { ...spec, text: `${m[1] ?? ""}${m[2]} ${m[3]}` }, ...(m[1] ? { other: true } : {}) });
  }
  // "attacking creature", "tapped creature": any controller.
  if ((m = /^(attacking|blocking|tapped) (creatures?)$/i.exec(p))) {
    const spec = parseTargetPhrase(`${m[1]} creature`);
    return spec?.kind === "object" ? count({ kind: "permanents", filter: { ...spec, text: p } }) : null;
  }
  return null;
}

function whosePlayer(w: string, ctx: Ctx | null): PlayerRef | null {
  const x = w.toLowerCase();
  if (x === "your") return { ref: "you" };
  if (!ctx) return null;
  if (x === "target player's" || x === "target opponent's") {
    const i = addTarget(ctx, { kind: "player", opponent: x === "target opponent's", text: x.replace(/'s$/, "") });
    ctx.lastPlayerTarget = i;
    return { ref: "target", index: i };
  }
  if ((x === "that player's" || x === "their") && ctx.lastPlayerTarget !== undefined) return { ref: "target", index: ctx.lastPlayerTarget };
  return null;
}

function whoseObject(w: string, ctx: Ctx | null): ObjRef | null {
  const x = w.toLowerCase();
  if (x === "~'s") return { ref: "self" };
  // What was sacrificed to cast the spell, as it last existed (CR 608.2h); compile() checks there's such a cost.
  if (/^the sacrificed (creature|artifact|permanent)'s$/.test(x)) return ctx ? { ref: "sacrificed" } : null;
  if (!ctx) return x === "its" ? { ref: "self" } : null;
  if (x === "its" || x === "that creature's" || x === "that permanent's") {
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if ((x === "that creature's" && ctx.subject) || ctx.subjectIt) return { ref: "subject" };
    // The permanent itself; after it left the battlefield, as it last existed (CR 608.2h).
    if (x === "its" && (ctx.selfIt || ctx.selfCard || ctx.activated)) return { ref: "self" };
  }
  return null;
}

// "Choose one —" and its bulleted modes. Other kinds ("choose one that hasn't been chosen",
// "choose one at random", Escalate, Spree's "+ {cost} —" modes) aren't supported yet.
const MODAL = /^[Cc]hoose (one|two|three|one or both|one or more|up to one) —\s*((?:•[^•]+)+)$/;

/** How many modes each "Choose ..." allows (CR 700.2), given how many there are. */
const MODE_COUNTS: Record<string, (n: number) => [number, number]> = {
  one: () => [1, 1],
  two: () => [2, 2],
  three: () => [3, 3],
  "one or both": () => [1, 2],
  "one or more": (n) => [1, n],
  "up to one": () => [0, 1],
};

function parseModal(count: string, bullets: string, text: string, spell?: boolean): AbilityBody | null {
  const modes: AbilityBody[] = [];
  for (const b of bullets.split("•").map((x) => x.trim()).filter(Boolean)) {
    const body = parseBody(b, { spell });
    if (!body) return null; // every mode has to work, or the card isn't supported
    modes.push(body);
  }
  const [min, max] = MODE_COUNTS[count]!(modes.length);
  if (modes.length < 2 || max > modes.length) return null;
  return { targets: [], effects: [], text, modal: { min, max, modes } };
}

/** "X and Y" where each half is its own effect. */
function parseConjunction(s: string, ctx: Ctx): Effect[] | null {
  const parts = s.split(/,? and (?=(?:you|each|target|draw|~|its|create|put|return|exile|destroy|tap|untap|mill)\b|get (?:\{E\}|\w+ \{E\}|an amount of \{E\}))/i);
  if (parts.length < 2) return null;
  const out: Effect[] = [];
  for (const p of parts) {
    const fx = parseSentence(p.charAt(0).toUpperCase() + p.slice(1), ctx);
    if (!fx) return null;
    out.push(...fx);
  }
  return out;
}

const isGroup = (r: ObjRef) => r.ref === "allCreatures" || r.ref === "each";
/** Several targets: "up to two target creatures". */
const isSeveral = (r: ObjRef) => r.ref === "target" && (r.n ?? 1) > 1;

function addTarget(ctx: Ctx, spec: TargetSpec): number {
  ctx.targets.push(spec);
  ctx.lastCreated = false;
  const i = ctx.targets.length - 1;
  if (spec.kind === "object" || spec.kind === "spell") ctx.lastObjectTarget = i;
  return i;
}

function parseSentence(s: string, ctx: Ctx): Effect[] | null {
  let m: RegExpExecArray | null;

  if (/^Search your library /i.test(s)) return parseSearch(s);
  // "Sacrifice ~ unless you pay {U}" (upkeep costs): pay to keep it, or it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you pay (.+)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const pay = parsePayCost(m[2]!);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return null;
    return [{ type: "may", effects: [], pay, otherwise: [sacrificeSelf], keep: true, text: `Pay ${m[2]} to keep ~` }];
  }
  // "That player draws an additional card" (Howling Mine): just another draw.
  if ((m = /^(.*?\b[Dd]raws?) an additional card$/.exec(s))) return parseSentence(`${m[1]} a card`, ctx);
  // Energy (CR 107.14): "You get {E}{E}", "you get X {E}", "you get an amount of {E} equal to ~'s power".
  if ((m = /^(?:[Yy]ou )?[Gg]et ((?:\{E\})+)$/.exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: m[1]!.length / 3 }];
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} \\{E\\}$`).exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an amount of \{E\} equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n && [{ type: "getEnergy", who: { ref: "you" }, n }];
  }
  // The monarch (CR 725).
  if (/^You become the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "you" } }];
  if (/^Target player becomes the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "target", index: addTarget(ctx, { kind: "player", text: "target player" }) } }];
  // "Choose a creature type." / "Choose a color." (the rest of the text says what it's for).
  if ((m = /^Choose an? (creature type|color)(?: other than (\w+))?$/i.exec(s)))
    return [{ type: "choose", choice: m[1]!.toLowerCase() === "color" ? "color" : "creatureType", ...(m[2] ? { except: m[2] } : {}) }];

  // "~ gets +1/+1 until end of turn for each creature blocking it (beyond the first)" (rampage, CR 702.23)
  if ((m = /^~ gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking it( beyond the first)?$/.exec(s)))
    return [{ type: "pumpPerBlocker", what: { ref: "self" }, power: Number(m[1]), toughness: Number(m[2]), beyondFirst: !!m[3] }];
  // Prevention (CR 615): shields for the next N damage this turn, and Fog.
  if ((m = new RegExp(`^Prevent the next ${NUMX} damage that would be dealt to (any target|target .+?) this turn$`, "i").exec(s))) {
    const to = /^any target$/i.test(m[2]!) ? parseDamageRecipient(m[2]!, ctx) : parseObject(m[2]!, ctx);
    return to ? [{ type: "preventNext", n: amt(m[1]!), to }] : null;
  }
  if (/^Prevent all combat damage that would be dealt this turn$/i.test(s)) return [{ type: "preventCombatDamage" }];
  // "~ deals 2 damage to any target and 1 damage to any other target" (Arc Trail): both at once.
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+?) and ${NUMX} damage to (.+)$`, "i").exec(s))) {
    const a = parseDamageRecipient(m[2]!, ctx);
    const b = a && parseDamageRecipient(m[4]!, ctx);
    return a && b ? [{ type: "damage", amount: amt(m[1]!), to: a }, { type: "damage", amount: amt(m[3]!), to: b }] : null;
  }
  // Damage: "~ deals 3 damage to any target"
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+)$`, "i").exec(s))) {
    // "to each creature and each player": dealt to all of them at once (CR 120.3).
    const tos: DamageRecipient[] = [];
    for (const part of m[2]!.split(/,? and (?=each )/i)) {
      const to = parseDamageRecipient(part, ctx);
      if (!to) return null;
      tos.push(to);
    }
    return [{ type: "damage", amount: amt(m[1]!), to: tos[0]!, ...(tos.length > 1 ? { also: tos.slice(1) } : {}) }];
  }
  // Drawing
  if ((m = new RegExp(`^(?:You )?[Dd]raw ${NUMX} cards?$`).exec(s))) return [{ type: "draw", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) draws? ${NUMX} cards?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "draw", who, n: amt(m[2]!) }] : null;
  }
  // Life
  if ((m = new RegExp(`^(.+?) (gains?|loses?) ${NUMX} life$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: amt(m[3]!) }];
  }
  // Graveyards. Cards in a graveyard (CR 109.2a): returning them, reanimating them, exiling them.
  if ((m = /^Exile (target player's|target opponent's|each opponent's|all) graveyards?$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null =
      w === "all" ? { ref: "eachPlayer" } : w === "each opponent's" ? { ref: "eachOpponent" } : parsePlayer(w.replace(/'s$/, ""), ctx);
    return who ? [{ type: "exileGraveyard", who }] : null;
  }
  if ((m = /^Exile ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx, true);
    return what ? [{ type: "exile", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) to (your|its owner's) hand$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[2]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^(Return|Put) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) (?:to|onto) the battlefield( tapped)?( under your control)?$/i.exec(s))) {
    // Without "under your control", only your own cards: the card then enters under your control (CR 110.2a)
    // either way, but "return" text that reaches other graveyards always says whose control.
    const underYou = !!m[4];
    if (m[1]!.toLowerCase() === "put" && !underYou) return null;
    const i = ctx.targets.length;
    const what = parseCardTarget(m[2]!, ctx, underYou ? undefined : "you");
    const spec = ctx.targets[i];
    // An Aura entering this way needs a choice of what it enchants (CR 303.4f), which isn't modeled,
    // and only permanent cards can be put onto the battlefield (CR 110.4b).
    if (!what || !spec || !spec.types?.length || spec.types.some((ty) => ty === "Enchantment" || !PERMANENT_TYPES.includes(ty))) return null;
    return [{ type: "putOntoBattlefield", what, ...(m[3] ? { tapped: true } : {}) }];
  }
  if ((m = /^Put ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+ graveyard) on (top|the bottom) of (your|its owner's) library$/i.exec(s))) {
    const what = parseCardTarget(m[1]!, ctx, m[3]!.toLowerCase() === "your" ? "you" : undefined);
    return what ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "Put target creature on top of its owner's library", "on the bottom of its owner's library" (Excommunicate).
  if ((m = /^Put (target .+?|~) on (top|the bottom) of its owner's library$/i.exec(s)) && !/graveyard$/i.test(m[1]!)) {
    const what = parseObject(m[1]!, ctx);
    return what && (what.ref === "target" || what.ref === "self") ? [{ type: "putInLibrary", what, position: m[2]!.toLowerCase() === "top" ? "top" : "bottom" }] : null;
  }
  // "When ~ leaves the battlefield, return the exiled card to the battlefield under its owner's control" (Fiend
  // Hunter): the cards its own exile ability took (CR 607.2a); compile() links the two.
  if ((m = /^Return the exiled (?:card|cards|permanent|permanents|creature|creatures) to (the battlefield under (?:its|their) owners?'s? control|(?:its|their) owners?'s? hands?)$/i.exec(s)) && ctx.selfCard)
    return [{ type: "returnLinked", dest: /^the battlefield/i.test(m[1]!) ? "battlefield" : "hand" }];
  // "Exile target creature an opponent controls until ~ leaves the battlefield" (CR 610.3).
  if ((m = /^Exile (target .+|up to one target .+|another target .+) until ~ leaves the battlefield$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "exile", what, until: "sourceLeaves" }] : null;
  }
  // "When ~ enters, attach it to target creature you control." (CR 701.3)
  if ((m = /^Attach (?:~|it) to (target .+)$/i.exec(s)) && !ctx.spell) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "target" ? [{ type: "attach", what }] : null;
  }
  // "Target creature can't block this turn", "~ can't attack or block this turn", "~ can't be blocked this
  // turn": until the turn ends.
  if ((m = /^(.+?) can't (block|attack|attack or block|be blocked) this turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods: Modification[] =
      m[2] === "block" ? [{ kind: "cantBlock" }] : m[2] === "attack" ? [{ kind: "cantAttack" }] : m[2] === "be blocked" ? [{ kind: "cantBeBlocked" }] : [{ kind: "cantAttack" }, { kind: "cantBlock" }];
    return what ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  // Picking your own permanents, not targeted: "sacrifice a creature", "each opponent sacrifices a creature
  // of their choice", "return a land you control to its owner's hand" (CR 701.21).
  if ((m = new RegExp(`^Return ${NUM} (.+?) you control to (?:its|their) owners?'s? hands?$`, "i").exec(s))) {
    const filter = pickFilter(m[2]!);
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: amt(m[1]!), action: "bounce" }];
  }
  if ((m = new RegExp(`^(?:(.+?) )?[Ss]acrifices? ${NUM} (.+?)(?: of (?:their|his or her) choice)?$`).exec(s)) && !/^(~|it|them|that creature)$/i.test(m[3]!)) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const filter = pickFilter(m[3]!);
    return who && filter && [{ type: "pick", who, filter, n: amt(m[2]!), action: "sacrifice" }];
  }
  // Removal and tapping
  if ((m = /^(Destroy|Exile|Tap|Untap) ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+|all .+|each .+|~|it|that creature|that permanent|enchanted \w+|equipped \w+)$/i.exec(s))) {
    const what = parseObject(m[2]!, ctx);
    if (!what) return null;
    const type = ({ destroy: "destroy", exile: "exile", tap: "tap", untap: "untap" } as const)[m[1]!.toLowerCase() as "destroy"];
    return [{ type, what }];
  }
  // Connive (CR 701.50): "~ connives", "it connives", "target creature you control connives", "connives X".
  if ((m = new RegExp(`^(.+?) connives?(?: ${NUMX})?$`, "i").exec(s))) {
    const what = parseObject(m[1]!.replace(/^(he|she)$/i, "it"), ctx);
    return what && !isGroup(what) ? [{ type: "connive", what, n: m[2] ? amt(m[2]) : 1 }] : null;
  }
  // "If that creature would die this turn, exile it instead" (CR 614.1a), for what an earlier sentence targeted
  // or damaged: "If a creature dealt damage this way would die this turn, exile it instead".
  if ((m = /^If (that creature|that permanent|that creature or planeswalker|that planeswalker|an? (?:creature|permanent) dealt damage this way) would die this turn, exile it instead$/i.exec(s))) {
    const what: ObjRef | null = / this way$/.test(m[1]!) ? { ref: "damagedThisWay" } : parseObject(m[1]!.startsWith("that creature") ? "that creature" : "that permanent", ctx);
    return what ? [{ type: "exileIfDies", what }] : null;
  }
  // "That creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps"
  if ((m = /^(.+?) (?:doesn't|don't|do not|does not) untap during (?:its controller's|their controllers?'s?|your) next untap steps?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "skipUntap", what }] : null;
  }
  // Regeneration (CR 701.19a)
  if ((m = /^Regenerate (~|target .+|enchanted creature|equipped creature)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "regenerate", what }] : null;
  }
  if ((m = /^Return ((?:all|each) .+?) to (?:their|its) owners?'s? hands?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "each" ? [{ type: "bounce", what }] : null;
  }
  if ((m = /^Return ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+?|~|it|that card|enchanted creature|equipped creature) to (?:its owner's hand|their owners' hands)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "bounce", what }] : null;
  }
  // Counters
  // "Put a +1/+1 counter on a creature you control": picked as it resolves, not targeted.
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (an? .+?) you control$`, "i").exec(s))) {
    const filter = pickFilter(m[3]!.replace(/^an? /i, ""));
    return filter && [{ type: "pick", who: { ref: "you" }, filter, n: 1, action: "counters", counter: { kind: counterKind(m[2]!), n: amt(m[1]!) } }];
  }
  if ((m = new RegExp(`^Put ${NUMX} ${COUNTER} counters? on (.+)$`, "i").exec(s))) {
    const what = parseObject(m[3]!, ctx);
    return what ? [{ type: "counters", what, counter: counterKind(m[2]!), n: amt(m[1]!) }] : null;
  }
  // Gaining control (layer 2). "Gain control of target creature until end of turn."
  if ((m = /^Gain control of ((?:(?:up to )?(?:one|two|three|four|five|six|\d+) (?:other )?|another |one or two |one, two, or three )?target .+?)( until end of turn)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "control" }], duration: m[2] ? "endOfTurn" : "game" }] : null;
  }
  // Switching power and toughness (layer 7d).
  if ((m = /^Switch (.+?)'s? power and toughness until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what ? [{ type: "continuous", what, mods: [{ kind: "switchPT" }], duration: "endOfTurn" }] : null;
  }
  // Continuous changes until end of turn: "X gets +2/+2 and gains flying", "X loses all abilities
  // and becomes a blue Frog with base power and toughness 1/1", "X has base power and toughness 0/1".
  if ((m = /^(.+?) ((?:gets?|gains?|loses?|has|have|becomes?) .+) until end of turn$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    const mods = what && parseChanges(m[2]!);
    return what && mods ? [{ type: "continuous", what, mods, duration: "endOfTurn" }] : null;
  }
  // Tokens
  if ((m = new RegExp(`^Create ${NUMX} (\\d+)/(\\d+) (.+?) creature tokens?(?: with (.+))?$`, "i").exec(s))) {
    const token = parseToken(Number(m[2]), Number(m[3]), m[4]!, m[5]);
    return token ? [{ type: "createToken", who: { ref: "you" }, n: amt(m[1]!), token }] : null;
  }
  // Predefined tokens (CR 111.10): "Create a Treasure token", "Its controller creates two Treasure tokens"
  if ((m = new RegExp(`^(?:(.+?) creates?|Create) ${NUMX} (Treasure|Food|Clue) tokens?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = PREDEFINED_TOKENS[m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1).toLowerCase()];
    return who && token ? [{ type: "createToken", who, n: amt(m[2]!), token }] : null;
  }
  // "Draw a card at the beginning of the next turn's upkeep" (a delayed trigger, CR 603.7).
  if ((m = /^(.+) at the beginning of the next turn's upkeep$/.exec(s))) {
    // Only what needs no targets or objects: the delayed ability has none of its own.
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    if (!inner || ctx.targets.length !== before || allEffects(inner).some((y) => "what" in y || ("who" in y && (y.who as { ref: string }).ref !== "you"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: m[1]! }];
  }
  // Proliferate (CR 701.27), amass (CR 701.47).
  if (/^Proliferate$/i.test(s)) return [{ type: "proliferate" }];
  if ((m = new RegExp(`^[Aa]mass ([A-Z][a-z]+) ${NUMX}$`).exec(s))) return [{ type: "amass", subtype: singularWord(m[1]!), n: amt(m[2]!) }];
  // Blink: "Exile target creature you control, then return it to the battlefield under its owner's control".
  if ((m = /^Exile (.+?),? then return (?:it|that card|them|those cards) to the battlefield under (its owner's|their owners'|your) control$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) ? [{ type: "flicker", what, under: m[2] === "your" ? "you" : "owner" }] : null;
  }
  // Investigate (CR 701.16): create a Clue token.
  if ((m = /^Investigate( twice)?$/i.exec(s))) return [{ type: "createToken", who: { ref: "you" }, n: m[1] ? 2 : 1, token: PREDEFINED_TOKENS.Clue! }];
  // Explore (CR 701.44)
  if (/^~ explores$/.test(s)) return [{ type: "explore" }];
  // Sacrificing (CR 701.21): "sacrifice ~", "sacrifice it" (the permanent itself)
  if ((m = /^Sacrifice (~|it)$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what?.ref === "self" ? [{ type: "sacrifice", what }] : null;
  }
  // Mill
  if ((m = new RegExp(`^Mill ${NUMX} cards?$`, "i").exec(s))) return [{ type: "mill", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) mills? ${NUMX} cards?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "mill", who, n: amt(m[2]!) }] : null;
  }
  // Discarding (CR 701.9): "Target player discards two cards", "Each opponent discards a card at random", "Discard a card"
  if ((m = new RegExp(`^Discard ${NUMX} cards?( at random)?$`, "i").exec(s))) return [{ type: "discard", who: { ref: "you" }, n: amt(m[1]!), random: !!m[2] }];
  if ((m = new RegExp(`^(.+?) discards? ${NUMX} cards?( at random)?$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "discard", who, n: amt(m[2]!), random: !!m[3] }] : null;
  }
  // Scry and surveil (CR 701.22, 701.25)
  if ((m = new RegExp(`^(Scry|Surveil) ${NUMX}$`, "i").exec(s))) return [{ type: m[1]!.toLowerCase() === "scry" ? "scry" : "surveil", n: amt(m[2]!) }];
  // Fighting (CR 701.14) and "deals damage equal to its power to"
  if ((m = /^(.+?) fights (.+)$/i.exec(s))) {
    const a = parseObject(m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a && b && !isGroup(a) && !isGroup(b) && !isSeveral(a) && !isSeveral(b) ? [{ type: "fight", a, b }] : null;
  }
  if ((m = /^(.+?) deals damage to itself equal to its power$/i.exec(s)) && m[1] !== "~") {
    // The creature is the source of damage to itself (its deathtouch, lifelink, infect apply).
    const a = parseObject(m[1]!, ctx);
    return a && !isGroup(a) && !isSeveral(a) ? [{ type: "bite", a, b: a }] : null;
  }
  if ((m = /^(.+?) deals damage equal to its power to (.+)$/i.exec(s))) {
    // The source dealing damage equal to its own power: damage from it, its power as it is or as it last
    // existed if it's gone, like after it's sacrificed to pay for this (CR 608.2h).
    if (m[1] === "~") {
      const to = parseDamageRecipient(m[2]!, ctx);
      return to ? [{ type: "damage", amount: { count: { kind: "power", of: { ref: "self" } } }, to }] : null;
    }
    const a = parseObject(m[1]!, ctx);
    const b = a && parseObject(m[2]!, ctx);
    return a && b && !isGroup(a) && !isGroup(b) && !isSeveral(a) ? [{ type: "bite", a, b }] : null;
  }
  // Counterspells, maybe "unless its controller pays {2}" (CR 118.12)
  if ((m = /^Counter target (.*?)spell(?: unless its controller pays (.+))?$/i.exec(s))) {
    const spec = parseTargetPhrase(`${m[1]}spell`);
    const unless = m[2] === undefined ? undefined : parseUnlessPays(m[2], ctx);
    if (!spec || unless === null) return null;
    return [{ type: "counterSpell", index: addTarget(ctx, spec), ...(unless ? { unless } : {}) }];
  }
  // "Whenever a player casts a spell, counter it unless that player pays {1}."
  if (ctx.castSpell && (m = /^Counter (?:it|that spell) unless (?:that player|its controller) pays (.+)$/i.exec(s))) {
    const unless = parseUnlessPays(m[1]!, ctx);
    return unless && [{ type: "counterUnlessPays", unless }];
  }
  return null;
}

/**
 * The changes in "gets +2/+2 and gains flying", "loses all abilities and becomes a blue
 * Frog with base power and toughness 1/1", "becomes a 3/3 Elemental creature", ...
 */
function parseChanges(text: string): Modification[] | null {
  const parts = text.split(/,? and (?=(?:gets?|gains?|loses?|has|have|becomes?) )/i);
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
function parseBecomes(text: string): Modification[] | null {
  let rest = text.trim();
  const out: Modification[] = [];
  let m: RegExpExecArray | null;
  if ((m = /^(?:the color of your choice)$/i.exec(rest))) return null;
  // Just a color: "becomes black", "becomes blue and red"
  if (/^(white|blue|black|red|green|colorless)( and (white|blue|black|red|green))*$/i.test(rest)) {
    return [{ kind: "setColors", colors: rest.split(/ and /).map((w) => COLOR_WORDS[w.toLowerCase()]).filter((c): c is Color => !!c) }];
  }
  if (!(m = /^an? (.+)$/i.exec(rest))) return null;
  rest = m[1]!;
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
  if (types.join(" ") === "Artifact Creature") {
    // "Becomes an artifact creature" keeps its other card types and subtypes; "a Golem artifact
    // creature" keeps them too, except that its creature types are replaced (CR 205.1b).
    out.push({ kind: "addTypes", types, subtypes: [] });
    if (subtypes.length) out.push({ kind: "setSubtypes", subtypes });
  } else if (types.length) out.push({ kind: "setTypes", types, subtypes });
  else if (subtypes.length) out.push({ kind: "setSubtypes", subtypes });
  if (colors.length || /colorless/i.test(rest)) out.push({ kind: "setColors", colors });
  if (pt) out.push({ kind: "setPT", power: pt[0], toughness: pt[1] });
  return out.length ? out : null;
}

const SEARCH_PRONOUN = "(?:it|them|that card|those cards|the card|those cards)";
const SEARCH_DEST = "(into your hand|onto the battlefield(?: tapped)?|into your graveyard)";

function searchDest(text: string): SearchDest {
  if (text === "into your hand") return { zone: "hand" };
  if (text === "into your graveyard") return { zone: "graveyard" };
  return { zone: "battlefield", ...(text.endsWith("tapped") ? { tapped: true } : {}) };
}

/**
 * "Search your library for a basic land card, reveal it, put it into your hand, then shuffle"
 * (CR 701.23), and the variants: "put one onto the battlefield tapped and the other into your
 * hand" (Cultivate), "then shuffle and put that card on top" (Vampiric Tutor).
 */
function parseSearch(s: string): Effect[] | null {
  const m = /^Search your library for (up to )?(a|an|one|two|three|four|five|any number of) (.+?)(?:, reveal (?:it|them|that card|those cards))?(?:,| and) (.+)$/i.exec(s);
  if (!m) return null;
  const upTo = !!m[1] || m[2] === "any number of";
  const n = m[2] === "any number of" ? 99 : NUMBER_WORDS[m[2]!.toLowerCase()]!;
  const reveal = /, reveal /.test(s);
  const filter = parseSearchFilter(m[3]!);
  if (filter === null) return null;
  const rest = m[4]!;
  let r: RegExpExecArray | null;
  // An Aura put onto the battlefield this way needs something to enchant chosen (CR 303.4f): not supported.
  if (/onto the battlefield/.test(rest) && mayBeAura(filter)) return null;
  const base = { type: "search" as const, ...(filter ? { filter } : {}), n, upTo, reveal };
  if ((r = new RegExp(`^put ${SEARCH_PRONOUN} ${SEARCH_DEST}, then shuffle$`, "i").exec(rest))) return [{ ...base, dest: searchDest(r[1]!) }];
  if ((r = new RegExp(`^put one ${SEARCH_DEST} and the other ${SEARCH_DEST}, then shuffle$`, "i").exec(rest)) && n === 2)
    return [{ ...base, dest: searchDest(r[1]!), others: searchDest(r[2]!) }];
  // The shuffle and putting the card on top are one action (rulings).
  if (/^then shuffle and put (?:that card|the card|it) on top(?: of your library)?$/i.test(rest) && n === 1) return [{ ...base, dest: { zone: "libraryTop" } }];
  if (/^put (?:it|that card) on top of your library, then shuffle$/i.test(rest)) return null; // shuffled away again: not a real template
  return null;
}

function mayBeAura(f: TargetSpec | undefined): boolean {
  if (!f || f.named) return true;
  if (f.notTypes?.includes("Enchantment")) return false;
  if (f.types?.length && !f.types.includes("Enchantment")) return false;
  if (f.allTypes?.length && !f.allTypes.includes("Enchantment")) return false;
  if (f.subtypes?.length && f.subtypes.every((st) => CREATURE_TYPES.has(st) || BASIC_TYPES.includes(st))) return false;
  return true;
}

/** What a search looks for: undefined for "a card", null when it isn't understood. */
function parseSearchFilter(phrase: string): TargetSpec | undefined | null {
  const p = phrase.replace(/\bcards\b/g, "card");
  if (/^card$/i.test(p)) return undefined;
  if (/^card named ~$/.test(p)) return { kind: "card", named: "~", text: "card named ~" };
  // Only plain card qualities: "with different names", "with mana value X or less" and the like aren't modeled.
  if (/ with (different|the same)| X /.test(p) || !/card( with (mana value|power|toughness) \d+ or (less|greater))?$/i.test(p)) return null;
  const spec = parseTargetPhrase(`${p} from your graveyard`);
  if (!spec || spec.kind !== "card") return null;
  const { owner: _owner, ...rest } = spec;
  return { ...rest, text: p };
}

function parseDamageRecipient(p: string, ctx: Ctx): DamageRecipient | null {
  if (/^any target$/i.test(p)) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", text: "any target" }) };
  // "target player or planeswalker", "target opponent or planeswalker" (Lava Axe): a player, or a planeswalker permanent.
  const pw = /^target (player|opponent) or planeswalker$/i.exec(p);
  if (pw) return { ref: "anyTarget", index: addTarget(ctx, { kind: "any", types: ["Planeswalker"], ...(pw[1]!.toLowerCase() === "opponent" ? { opponent: true } : {}), text: p.toLowerCase() }) };
  // "any other target", "another target": not one of the targets before it, or with none, not the
  // source (CR 115.4). "Each of two targets", "each of up to two targets" (CR 115.3, 115.6).
  if (/^(any other target|another target)$/i.test(p)) {
    const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "player" ? [i] : []));
    if (!before.length && ctx.spell) return null;
    const spec: TargetSpec = { kind: "any", text: "any other target", ...(before.length ? { distinctFrom: before } : { notSource: true }) };
    return { ref: "anyTarget", index: addTarget(ctx, spec) };
  }
  let several: RegExpExecArray | null;
  if ((several = /^each of (up to )?(two|three|four|one or two) targets$/i.exec(p))) {
    const [required, n] = several[2] === "one or two" ? [1, 2] : several[1] ? [0, num(several[2]!)] : [num(several[2]!), num(several[2]!)];
    const first = ctx.targets.length;
    for (let k = 0; k < n; k++)
      addTarget(ctx, { kind: "any", text: "any target", ...(k >= required ? { optional: true } : {}), ...(k ? { distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
    return { ref: "anyTarget", index: first, n };
  }
  const player = parsePlayer(p, ctx);
  if (player) return player;
  return parseObject(p, ctx);
}

/** What a "pick" effect picks from: "creature", "nonland permanent", "two lands", "artifact or creature", "Forest". */
function pickFilter(phrase: string): TargetSpec | null {
  const words = phrase.trim().replace(/ you control$/i, "").split(" ");
  // "a Plains" is already singular; "two creatures" isn't.
  const asIs = words.join(" ");
  const one = parseTargetPhrase(asIs) ? asIs : words.map((w, i) => (i === words.length - 1 ? singular(w) : w)).join(" ");
  const spec = parseTargetPhrase(one);
  if (spec?.kind !== "object" || spec.controller) return null;
  return { ...spec, text: one };
}

function parsePlayer(p: string, ctx: Ctx): PlayerRef | null {
  const x = p.trim().toLowerCase();
  if (x === "you") return { ref: "you" };
  if (x === "each opponent") return { ref: "eachOpponent" };
  if (x === "each player") return { ref: "eachPlayer" };
  // "Whenever ~ deals combat damage to a player, that player discards a card."
  if (x === "that player" && ctx.eventPlayer) return { ref: "eventPlayer" };
  if (x === "its controller" || x === "that creature's controller" || x === "that permanent's controller") {
    const i = ctx.lastObjectTarget;
    if (i === undefined && ctx.subjectIt) return { ref: "subjectController" };
    return i !== undefined ? { ref: "targetController", index: i } : null;
  }
  if (x === "target player" || x === "target opponent") {
    const index = addTarget(ctx, { kind: "player", opponent: x === "target opponent", text: x });
    ctx.lastPlayerTarget = index;
    return { ref: "target", index };
  }
  return null;
}

/**
 * An object reference. Targets in graveyards ("target card from a graveyard") are only
 * allowed where the caller knows what to do with a card (`cards`), since "destroy" or
 * "tap" make no sense for one.
 */
function parseObject(p: string, ctx: Ctx, cards = false): ObjRef | null {
  if (ctx.subjectLeft && /^that card$/i.test(p.trim()) && ctx.lastObjectTarget === undefined) return { ref: "subjectCard" };
  const ref = parseObjectNow(p, ctx, cards);
  return ref?.ref === "subject" && ctx.subjectLeft ? { ref: "subjectCard" } : ref;
}

function parseObjectNow(p: string, ctx: Ctx, cards = false): ObjRef | null {
  // "Put a +1/+1 counter on each of up to two target creatures", "Up to two target creatures each get +1/+1"
  const x = /\btarget\b/i.test(p) ? p.trim().replace(/^each of /i, "").replace(/ each$/i, "") : p.trim();
  // "They", "those creatures": the targets of an earlier "up to two target creatures".
  if (/^(?:each of )?(they|them|those creatures|those permanents|those cards)$/i.test(x)) return ctx.lastTargets ? { ref: "target", ...ctx.lastTargets } : null;
  const several = SEVERAL_TARGETS.exec(x);
  if (several) return parseSeveralTargets(several, ctx, cards);
  // After it left the battlefield, its name means the card where it went (CR 400.7 makes the permanent gone).
  if (x === "~") return ctx.selfCard ? { ref: "selfCard" } : { ref: "self" };
  if (ctx.subjectIt && /^that (land|artifact|enchantment|token|[A-Z][a-z]+)$/.test(x) && ctx.lastObjectTarget === undefined) return { ref: "subject" };
  if (/^(it|that creature|that permanent)$/i.test(x)) {
    if (ctx.lastCreated && /^it$/i.test(x)) return { ref: "created" };
    if (ctx.lastObjectTarget !== undefined) return { ref: "target", index: ctx.lastObjectTarget };
    if (ctx.subjectIt) return { ref: "subject" };
    if (ctx.selfIt && /^it$/i.test(x)) return { ref: "self" };
    if (ctx.selfCard && /^it$/i.test(x)) return { ref: "selfCard" };
    return ctx.subject && /^that creature$/i.test(x) ? { ref: "subject" } : null;
  }
  // "Enchanted creature", "equipped creature": what the source is attached to (not targeted).
  if (/^(enchanted|equipped) (creature|permanent|artifact|land)$/i.test(x) && !ctx.spell) return { ref: "attached" };
  const group = parseGroup(x);
  if (group && group.other && ctx.spell) {
    // A spell's "other creatures you control": other than the creature it targeted ("Put two +1/+1
    // counters on target creature you control. Other creatures you control get +1/+1"). Other than
    // something it only named ("Zombies you control get +2/+1. Other creatures ...") isn't modeled.
    return ctx.lastObjectTarget !== undefined ? { ref: "each", filter: group.filter, otherThan: ctx.lastObjectTarget } : null;
  }
  if (group) return { ref: "each", filter: group.filter, ...(group.other ? { other: true } : {}) };
  const m = /^target (.+)$/i.exec(x);
  if (!m) return null;
  const spec = parseTargetPhrase(m[1]!);
  if (!spec || spec.kind === "player" || spec.kind === "spell" || (spec.kind === "card") !== cards) return null;
  return { ref: "target", index: addTarget(ctx, spec) };
}

const SEVERAL_TARGETS = /^(?:(up to )?(one|two|three|four|five|six|\d+) (other )?|(another) |(one or two|one, two, or three) )target (.+)$/i;

/**
 * "Up to two target creatures", "two target artifacts", "one or two target creatures", "another target
 * creature", "up to one other target permanent you control" (CR 115.3, 115.6, 601.2c). Each is a
 * target of its own, in a row; "up to" ones may be left unchosen, and none can be the same as another
 * of them. "Another" or "other" means other than the targets before it, or with none before it, other
 * than the ability's source.
 */
function parseSeveralTargets(m: RegExpExecArray, ctx: Ctx, cards: boolean): ObjRef | null {
  const [, upTo, count, other, another, range, phrase] = m;
  const [required, n] = range ? (range.startsWith("one or two") ? [1, 2] : [1, 3]) : upTo ? [0, num(count!)] : another ? [1, 1] : [num(count!), num(count!)];
  if (n < 1 || n > 6) return null;
  const spec = parseTargetPhrase(n > 1 ? singularPhrase(phrase!) : phrase!);
  if (!spec || spec.kind === "player" || spec.kind === "spell" || (spec.kind === "card") !== cards) return null;
  const before = ctx.targets.flatMap((t, i) => (t.kind === "object" || t.kind === "any" || t.kind === "card" ? [i] : []));
  let notSource = false;
  if (other || another) {
    if (!before.length && ctx.spell) return null; // a spell has no source on the battlefield to be other than
    notSource = !before.length;
  }
  const first = ctx.targets.length;
  for (let k = 0; k < n; k++) {
    const distinct = [...(other || another ? before : []), ...Array.from({ length: k }, (_, j) => first + j)];
    addTarget(ctx, { ...spec, ...(k >= required ? { optional: true } : {}), ...(notSource ? { notSource } : {}), ...(distinct.length ? { distinctFrom: distinct } : {}) });
  }
  // "It" can't mean one of several; "they" / "those creatures" means all of them.
  if (n > 1) ctx.lastObjectTarget = undefined;
  ctx.lastTargets = { index: first, ...(n > 1 ? { n } : {}) };
  return { ref: "target", index: first, ...(n > 1 ? { n } : {}) };
}

/** "creatures you control" -> "creature you control", "creature cards from your graveyard" -> "creature card from your graveyard". */
function singularPhrase(p: string): string {
  const words = p.trim().split(" ");
  const i = words.findIndex((w) => /^(creatures|cards|permanents|artifacts|enchantments|lands|planeswalkers|battles)$/i.test(w));
  if (i >= 0) words[i] = singular(words[i]!);
  else {
    // A creature type: "two target Goblins", "up to two target Elves you control".
    const j = words.findIndex((w) => /^[A-Z]/.test(w) && CREATURE_TYPES.has(singular(w)) && w !== singular(w));
    if (j < 0) return p;
    words[j] = singular(words[j]!);
  }
  return words.join(" ").replace(/ your opponents control$/, " an opponent controls").replace(/ from graveyards$/, " from a graveyard");
}

const PERMANENT_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

const PLURAL_TYPES: Record<string, string> = {
  creatures: "creature",
  artifacts: "artifact",
  enchantments: "enchantment",
  lands: "land",
  permanents: "permanent",
  planeswalkers: "planeswalker",
  battles: "battle",
};

/**
 * A group of permanents an effect or static ability applies to without targeting them: "all
 * creatures", "each artifact and enchantment", "other creatures you control", "all creatures without
 * flying", "each creature you control with a +1/+1 counter on it", "creatures of the chosen type".
 * "Artifacts and enchantments" means each permanent that's an artifact or an enchantment. Without
 * "all" or "each" it has to say whose they are ("creatures you control"), unless `bare` (a static
 * ability's subject, "Creatures of the chosen type get +1/+1").
 */
function parseGroup(phrase: string, bare = false): { filter: TargetSpec; other: boolean } | null {
  let p = phrase.trim();
  const all = /^(all|each) /i.exec(p);
  if (all) p = p.slice(all[0].length);
  const other = /^other /i.test(p);
  if (other) p = p.slice(6);
  const whose = / (you control|your opponents control|an opponent controls|you don't control)\b/i;
  // "Attacking creatures get +1/+1 until end of turn": whichever are attacking as it resolves (CR 611.2c).
  const combat = /^(attacking|blocking|attacking or blocking) creatures\b/i.test(p);
  if (!all && !whose.test(p) && !bare && !combat) return null;
  // The kinds come first; plurals become the singular parseTargetPhrase reads ("Elves" -> "Elf").
  const cut = /\b(with|without|you control|your opponents control|an opponent controls|you don't control|of the chosen|of that|that aren't|that are not|not of)\b/i.exec(p);
  let head = (cut ? p.slice(0, cut.index) : p).trim();
  const tail = cut ? p.slice(cut.index).replace(/^your opponents control/i, "an opponent controls").replace(/ your opponents control/i, " an opponent controls") : "";
  const words = head.replace(/,? and |, or |, /g, " or ").split(/\s+/);
  // A plural noun is a group; a singular one only after "each" ("each creature", but not "all creature").
  const plural = words.some((w) => PLURAL_TYPES[w.toLowerCase()] || (/s$/.test(w) && CREATURE_TYPES.has(singular(capital(w)))));
  if (!plural && !(all && all[1]!.toLowerCase() === "each")) return null;
  head = words
    .map((w) => PLURAL_TYPES[w.toLowerCase()] ?? (/^[A-Z]/.test(w) && w !== "Plains" && CREATURE_TYPES.has(singular(w)) ? singular(w) : w))
    .join(" ");
  const spec = parseTargetPhrase(`${head} ${tail}`.trim(), { chosen: true });
  if (!spec || spec.kind !== "object") return null;
  return { filter: { ...spec, text: phrase.trim().toLowerCase() }, other };
}

/**
 * "target creature card from your graveyard" where the effect needs the card to be in
 * `owner`'s graveyard (e.g. "to your hand" only fits your own cards).
 */
function parseCardTarget(p: string, ctx: Ctx, owner?: "you"): ObjRef | null {
  const i = ctx.targets.length;
  const what = parseObject(p, ctx, true);
  if (!what) return null;
  if (owner && ctx.targets[i]?.owner !== owner) {
    ctx.targets.length = i;
    return null;
  }
  return what;
}

/** Parse the words after "target": "nonblack creature an opponent controls", "artifact or enchantment", "spell", ... */
export function parseTargetPhrase(phrase: string, opts: { chosen?: boolean } = {}): TargetSpec | null {
  let p = phrase.trim().toLowerCase();
  const text = `target ${p}`;
  const extra: Partial<TargetSpec> = {};
  // "of the chosen type", "that aren't of the chosen type", "of that color": only where the caller fills in the choice.
  const chosen = /,? (that (?:aren't|are not|isn't|is not) |not )?of (?:the chosen|that) (creature type|type|color)/.exec(p);
  if (chosen) {
    if (!opts.chosen) return null;
    extra.chosen = chosen[2] === "color" ? (chosen[1] ? "notColor" : "color") : chosen[1] ? "notType" : "type";
    p = (p.slice(0, chosen.index) + p.slice(chosen.index + chosen[0].length)).trim();
  }
  // "creature with a +1/+1 counter on it"
  const counter = / with an? ([+-]1\/[+-]1) counter on (?:it|them)/.exec(p);
  if (counter) {
    extra.counter = counter[1] === "+1/+1" ? "+1/+1" : "-1/-1";
    p = (p.slice(0, counter.index) + p.slice(counter.index + counter[0].length)).trim();
  }
  // "creature card from your graveyard", "card from a graveyard": a card in that zone (CR 109.2a).
  let inGraveyard = false;
  let owner: TargetSpec["owner"];
  const gy = / (?:from|in) (your|a|an opponent's) graveyard$/.exec(p);
  if (gy) {
    p = p.slice(0, gy.index);
    owner = gy[1] === "your" ? "you" : gy[1] === "a" ? undefined : "opponent";
    // The word "card" comes before any "with ..." qualifier: "creature card with mana value 3 or less".
    const card = /(^| )card(?= with |$)/.exec(p);
    if (!card) return null;
    p = (p.slice(0, card.index) + p.slice(card.index + card[0].length)).trim();
    inGraveyard = true;
  }
  // "... with flying", "... without flying", "... with power 4 or greater", "... with mana value 3 or less"
  let m: RegExpExecArray | null;
  if ((m = / with (power|toughness|mana value) (\d+) or (greater|less)$/.exec(p))) {
    const n = Number(m[2]);
    const key = m[1] === "mana value" ? "manaValue" : (m[1] as "power" | "toughness");
    extra[key] = m[3] === "greater" ? { min: n } : { max: n };
    p = p.slice(0, m.index);
  } else if ((m = / (with|without) ([a-z ]+)$/.exec(p))) {
    const kws = parseKeywordList(m[2]!);
    if (!kws || kws.length !== 1) return null;
    if (m[1] === "with") extra.keywords = kws;
    else extra.notKeywords = kws;
    p = p.slice(0, m.index);
  }
  let controller: TargetSpec["controller"];
  if (/ (an opponent controls|you don't control)$/.test(p)) {
    controller = "opponent";
    p = p.replace(/ (an opponent controls|you don't control)$/, "");
  } else if (/ you control$/.test(p)) {
    controller = "you";
    p = p.replace(/ you control$/, "");
  }
  if (inGraveyard && (controller || / (?:you|an opponent) controls?$/.test(p))) return null;
  if (p === "player" || p === "opponent") return Object.keys(extra).length || inGraveyard ? null : { kind: "player", opponent: p === "opponent", text };
  let tapped: boolean | undefined;
  if ((m = /^(un)?tapped /.exec(p))) {
    tapped = !m[1];
    p = p.slice(m[0].length);
  }
  if (p.startsWith("attacking or blocking ")) {
    extra.combat = "attackingOrBlocking";
    p = p.slice("attacking or blocking ".length);
  } else if ((m = /^(attacking|blocking) /.exec(p))) {
    extra.combat = m[1] as "attacking" | "blocking";
    p = p.slice(m[0].length);
  }
  const isSpell = / ?spell$/.test(p);
  if (isSpell) p = p.replace(/ ?spell$/, "");
  const types: string[] = [];
  const notTypes: string[] = [];
  const colors: Color[] = [];
  const notColors: Color[] = [];
  const supertypes: string[] = [];
  const notSupertypes: string[] = [];
  const subtypes: string[] = [];
  const SUPERTYPE_WORDS: Record<string, string> = { basic: "Basic", legendary: "Legendary", snow: "Snow" };
  const alts = p ? p.split(/ or |, /) : [];
  // "artifact creature" is one object with both types; "artifact or creature" is either.
  const typeWords = alts.map((alt) => alt.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).length);
  if (typeWords.some((n) => n > 1) && alts.length > 1) return null;
  const allTypes = typeWords[0]! > 1 ? alts[0]!.trim().split(/\s+/).filter((w) => TYPE_WORDS[w]).map((w) => TYPE_WORDS[w]!) : null;
  for (const alt of alts) {
    const words = alt.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (w === "token" || w === "nontoken") {
        if (alts.length > 1) return null;
        extra.token = w === "token";
      } else if (w.startsWith("non")) {
        const rest = w.slice(3).replace(/^-/, "");
        if (COLOR_WORDS[rest]) notColors.push(COLOR_WORDS[rest]!);
        else if (TYPE_WORDS[rest]) notTypes.push(TYPE_WORDS[rest]!);
        else if (SUPERTYPE_WORDS[rest]) notSupertypes.push(SUPERTYPE_WORDS[rest]!);
        else return null;
      } else if (TYPE_WORDS[w]) types.push(TYPE_WORDS[w]!);
      else if (CREATURE_TYPES.has(capital(w)) || BASIC_TYPES.includes(capital(w))) subtypes.push(capital(w));
      else if (COLOR_WORDS[w]) colors.push(COLOR_WORDS[w]!);
      else if (SUPERTYPE_WORDS[w]) supertypes.push(SUPERTYPE_WORDS[w]!);
      else if (w === "permanent" && inGraveyard) types.push(...PERMANENT_TYPES); // "permanent card" (CR 110.4b)
      else if (w === "permanent" || w === "") continue;
      else return null;
    }
  }
  // "red or green creature" means a creature that's red or green. Mixing colors with several
  // different type alternatives ("red creature or green artifact") isn't modeled.
  if (colors.length && alts.filter((a) => a.split(/\s+/).some((w) => TYPE_WORDS[w])).length > 1) return null;
  // Supertypes are "and" requirements ("basic land"); with alternatives they'd need per-alternative filters.
  if ((supertypes.length || notSupertypes.length) && alts.length > 1) return null;
  // Subtypes mixed with card types in alternatives ("Wall or artifact") would need per-alternative filters too.
  if (subtypes.length && (types.length || notTypes.length) && alts.length > 1) return null;
  const filters = {
    types: allTypes ? [] : types,
    ...(allTypes ? { allTypes } : {}),
    notTypes,
    notColors,
    ...(colors.length ? { colors } : {}),
    ...(supertypes.length ? { supertypes } : {}),
    ...(notSupertypes.length ? { notSupertypes } : {}),
    ...(subtypes.length ? { subtypes } : {}),
    ...extra,
  };
  if (inGraveyard) {
    if (isSpell || tapped !== undefined || extra.combat || extra.token !== undefined) return null;
    return { kind: "card", ...filters, ...(owner ? { owner } : {}), text };
  }
  if (isSpell) return extra.keywords || extra.notKeywords || extra.power || extra.toughness || extra.combat || extra.token !== undefined || supertypes.length ? null : { kind: "spell", ...filters, text };
  return { kind: "object", ...filters, controller, ...(tapped !== undefined ? { tapped } : {}), text };
}

function parseKeywordList(text: string): string[] | null {
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  text = text.replace(/protection from (\w+) and from (\w+)/gi, "protection from $1, protection from $2");
  const parts = text.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const k = keywordOf(p, true);
    if (!k) return null;
    out.push(k);
  }
  return out;
}

/** Tokens the rules define (CR 111.10). */
const PREDEFINED_TOKENS: Record<string, TokenSpec> = {
  Treasure: { name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"], keywords: [], abilities: "{T}, Sacrifice this token: Add one mana of any color." },
  Food: { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"], keywords: [], abilities: "{2}, {T}, Sacrifice this token: You gain 3 life." },
  Clue: { name: "Clue", colors: [], types: ["Artifact"], subtypes: ["Clue"], keywords: [], abilities: "{2}, Sacrifice this token: Draw a card." },
};

/** Can we run an ability given in quotes (a token's or one granted to something)? */
function compileQuoted(text: string): boolean {
  const c = compile({ name: "Quoted Ability Source", oracleText: text, types: [], subtypes: [], supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: "", oracleId: "" } as unknown as CardDef);
  return c.unsupported.length === 0;
}

const grantedCache = new Map<string, CompiledCard>();
/** The compiled form of an ability an effect gave an object (`addAbility`): "~" in it is that object. */
export function compileGranted(text: string): CompiledCard {
  let hit = grantedCache.get(text);
  if (!hit) {
    hit = compile({ name: "", oracleText: text, types: [], subtypes: [], supertypes: [], keywords: [], colors: [], colorIdentity: [], manaCost: "", cmc: 0, typeLine: "", oracleId: `granted:${text}` });
    grantedCache.set(text, hit);
  }
  return hit;
}

/**
 * Can an effect give this quoted ability to an object? It has to be one triggered, activated or mana
 * ability that we can run. Static abilities given this way aren't modeled: their effects would have to
 * come out of the same layer calculation that grants them.
 */
function grantable(text: string): boolean {
  if (text.includes(QUOTED_SOURCE_NAME)) return false;
  const c = compileGranted(text);
  const n = c.triggers.length + c.activated.length + c.mana.length;
  const { triggers, activated, mana, statics, entersTapped, unsupported, textKeywords, ...rest } = c;
  return n === 1 && !statics.length && !entersTapped && !unsupported.length && !textKeywords.length && Object.keys(rest).length === 0;
}

/**
 * Backup N (CR 702.165a): "When this creature enters, put N +1/+1 counters on target creature. If that's
 * another creature, it also gains the non-backup abilities of this creature printed below this one until
 * end of turn." Those are fixed by the card (CR 702.165c-d). Each backup ability triggers separately.
 */
function backupTriggers(ns: number[], below: string[]): TriggeredAbility[] | null {
  const mods: Modification[] = [];
  const kws: string[] = [];
  for (const raw of below) {
    const line = raw.trim();
    if (!line) continue;
    const k = isKeywordLine(line) ? parseKeywordList(line) : null;
    if (k) kws.push(...k);
    else if (grantable(line)) mods.push({ kind: "addAbility", text: line });
    else return null;
  }
  if (kws.length) mods.unshift({ kind: "addKeywords", keywords: kws });
  if (!mods.length) return null;
  return ns.map((n) => ({
    event: "selfEnters",
    body: {
      targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
      effects: [
        { type: "counters", what: { ref: "target", index: 0 }, counter: "+1/+1", n },
        { type: "continuous", what: { ref: "target", index: 0 }, mods, duration: "endOfTurn", notSource: true },
      ],
      text: `Backup ${n}: put ${n === 1 ? "a +1/+1 counter" : `${n} +1/+1 counters`} on target creature. If that's another creature, it gains ${describeGrants(kws, mods)} until end of turn.`,
    },
  }));
}

const describeGrants = (kws: string[], mods: Modification[]) =>
  [...kws.map((k) => k.toLowerCase()), ...mods.flatMap((m) => (m.kind === "addAbility" ? [`"${m.text.replace(/~/g, "this creature")}"`] : []))].join(" and ");

/**
 * What follows "has", "have" or "gains": keywords, quoted abilities, or both ('flying and "{T}: ..."').
 * Layer 6 either way.
 */
function parseGrants(text: string): Modification[] | null {
  const out: Modification[] = [];
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((q) => q[1]!);
  // "Protection from black and from red" is two protection abilities (CR 702.16g).
  const words = text.replace(/protection from (\w+) and from (\w+)/gi, "protection from $1, protection from $2").replace(/"[^"]+"/g, "\u0000").split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
  const kws: string[] = [];
  for (const w of words) {
    if (w === "\u0000") continue;
    const k = parseKeywordList(w);
    if (!k) return null;
    kws.push(...k);
  }
  if (words.filter((w) => w === "\u0000").length !== quoted.length) return null;
  if (kws.length) out.push({ kind: "addKeywords", keywords: kws });
  for (const q of quoted) {
    if (!grantable(q)) return null;
    out.push({ kind: "addAbility", text: q });
  }
  return out.length ? out : null;
}

function parseToken(power: number, toughness: number, desc: string, withText?: string): TokenSpec | null {
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
    else if (CREATURE_TYPES.has(w)) subtypes.push(w);
    else return null;
  }
  // 'with "Sacrifice ~: Add {C}."': an ability of its own (CR 111.3).
  const quoted = withText && /^"(.+)"$/.exec(withText);
  if (quoted && !compileQuoted(quoted[1]!)) return null;
  const keywords = withText && !quoted ? parseKeywordList(withText) : [];
  if (!keywords || !subtypes.length) return null;
  return { name: subtypes.join(" "), power, toughness, colors, types, subtypes, keywords, ...(quoted ? { abilities: quoted[1]! } : {}) };
}

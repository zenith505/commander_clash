import { allEffects } from "../abilities";
import type { AbilityBody, Count, ChoiceKind, TriggeredAbility, CompiledCard, Effect, AdditionalCost, TargetSpec } from "../abilities";
import { CHOSEN_PROTECTION, stripReminder } from "../keywords";
import { parseManaCost } from "../mana";
import { substituteX } from "../amounts";
import { withModes } from "../modes";
import type { CardDef } from "../types";
import type { CopyExcept } from "../copies";
import { NUM, num, NUMX, COUNTER, counterKind, X, amt, plainMana, sacrificeSelf } from "./words";
import { parseManaAbility, parseManaTrigger } from "./mana-abilities";
import { parseGraveyardKeyword, parseCostKeyword, parseAdditionalCost, keywordAbilities, textKeywords, isKeywordLine, firebending } from "./keyword-abilities";
import { parseEntersCondition, parseEntersChoice, parseConditionalStatic, parseCostChange, parseStatic } from "./statics";
import { parseTrigger } from "./triggers";
import { parseActivated, parseLoyalty, stripAbilityWord } from "./activated";
import { parseBody, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { parseGroup, parseTargetPhrase } from "./targets";
import { backupTriggers } from "./grants";
import { dungeonTriggers } from "./dungeons";
import { parseCountMod, parseCopyExcept } from "./tokens";

const cache = new Map<string, CompiledCard>();

export function compileCard(d: CardDef): CompiledCard {
  const hit = cache.get(d.oracleId);
  if (hit) return hit;
  const out = compile(d);
  if (d.oracleId === MONARCH.oracleId) out.triggers = MONARCH_TRIGGERS;
  if (d.oracleId === RING.oracleId) out.triggers = RING_TRIGGERS;
  if (d.oracleId === INITIATIVE.oracleId) out.triggers = INITIATIVE_TRIGGERS;
  const rooms = dungeonTriggers(d.oracleId);
  if (rooms) out.triggers = rooms;
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

/**
 * Stands in as the "source" of the initiative's three inherent triggered abilities, which have none (CR 726.2). Each
 * is controlled by the player who had the initiative when it triggered; the second one's "controller of those
 * creatures" is its event player.
 */
export const INITIATIVE: CardDef = { ...MONARCH, oracleId: "initiative", name: "The initiative" };
const INITIATIVE_TRIGGERS: TriggeredAbility[] = [
  { event: "ventureRoom", body: { targets: [], effects: [{ type: "venture", undercity: true }], text: "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity." } },
  {
    event: "ventureRoom",
    body: {
      targets: [],
      effects: [{ type: "takeInitiative", who: { ref: "eventPlayer" } }],
      text: "Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative.",
    },
  },
  { event: "ventureRoom", body: { targets: [], effects: [{ type: "venture", undercity: true }], text: "Whenever a player takes the initiative, that player ventures into Undercity." } },
];

/**
 * The Ring, the emblem a player gets the first time the Ring tempts them (CR 701.54c). It stands in as the source
 * of its triggered abilities, which the game fires for that player's Ring-bearer once the Ring has tempted them
 * enough times. Its static ability ("Your Ring-bearer is legendary and can't be blocked by creatures with greater
 * power") is applied by the layers.
 */
export const RING: CardDef = { ...MONARCH, oracleId: "the-ring", name: "The Ring" };
const RING_TRIGGERS: TriggeredAbility[] = [
  {
    event: "ringBearerAttacks",
    body: {
      targets: [],
      effects: [
        { type: "draw", who: { ref: "you" }, n: 1 },
        { type: "discard", who: { ref: "you" }, n: 1, random: false },
      ],
      text: "Whenever your Ring-bearer attacks, draw a card, then discard a card.",
    },
  },
  {
    // The subject is the blocking creature.
    event: "ringBearerBlocked",
    body: {
      targets: [],
      effects: [{ type: "delayed", when: "endOfCombat", each: "subject", effects: [{ type: "sacrifice", what: { ref: "subject" }, byController: true }], text: "the blocking creature's controller sacrifices it" }],
      text: "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
    },
  },
  {
    event: "ringBearerDamagesPlayer",
    body: { targets: [], effects: [{ type: "loseLife", who: { ref: "eachOpponent" }, n: 3 }], text: "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life." },
  },
];

/** Card types/subtypes whose rules we don't model yet, whatever their text says. */
const UNSUPPORTED_TYPES = ["Battle", "Kindred", "Tribal", "Dungeon"];
const UNSUPPORTED_SUBTYPES = ["Saga", "Class", "Case", "Room", "Siege", "Spacecraft"];

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
  // A planeswalker needs a printed loyalty number to enter with (CR 306.5b); "X" loyalty isn't modeled.
  if (d.types.includes("Planeswalker") && !/^\d+$/.test(d.loyalty ?? "")) return false;
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

export const QUOTED_SOURCE_NAME = "\u27easource\u27eb";

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
  t = t.replace(/\b[Tt]his (creature|artifact|enchantment|land|permanent|spell|card|token|Equipment|Vehicle|Aura|planeswalker)\b/g, "~");
  return t;
}

/**
 * A max speed ability's ability, added to `out` with the condition: one static, triggered, activated or mana ability
 * and nothing else. False if it's anything else, or a static ability that already has a condition.
 */
function maxSpeedAbility(d: CardDef, text: string, out: CompiledCard): boolean {
  const inner = compile({ ...d, oracleText: text });
  const base = compile({ ...d, oracleText: "" });
  if (inner.unsupported.length) return false;
  const lists = ["triggers", "activated", "mana", "statics"] as const;
  const rest = (c: CompiledCard) => JSON.stringify(Object.entries(c).filter(([k]) => !(lists as readonly string[]).includes(k)).sort(([a], [b]) => a.localeCompare(b)));
  if (rest(inner) !== rest(base) || lists.some((k) => base[k].length)) return false;
  const cond = { kind: "maxSpeed" } as const;
  const [kind, ...more] = lists.flatMap((k) => inner[k].map(() => k));
  if (!kind || more.length) return false;
  if (kind === "statics") {
    const st = inner.statics[0]!;
    if (st.condition) return false;
    out.statics.push({ ...st, condition: cond });
  } else if (kind === "triggers") out.triggers.push({ ...inner.triggers[0]!, activeIf: cond });
  else if (kind === "mana") out.mana.push({ ...inner.mana[0]!, activeIf: cond });
  else {
    const ab = inner.activated[0]!;
    if (ab.activateIf) return false;
    out.activated.push({ ...ab, activateIf: cond });
  }
  return true;
}

export function compile(d: CardDef): CompiledCard {
  const out: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  const spellLines: string[] = [];
  let ascendSpell = false;
  const lines = joinModes(normalizeSelf(d).split("\n"));
  for (const [li, raw] of lines.entries()) {
    // Converge (CR 207.2c) is an ability word: it has no rules meaning of its own.
    const line = raw.trim().replace(/^Converge — /, "");
    if (!line) continue;
    // Deck construction, not play: the deck checker reads it (deckLimit).
    if (/^A deck can have (?:any number of|up to \w+) cards named ~\.$/.test(line)) continue;
    // Also deck construction: who can be a commander (CR 903.3, deck.ts canBeCommander).
    if (/^~ can be your commander\.$/.test(line)) continue;
    if (line === "Start your engines!") {
      out.startYourEngines = true; // CR 702.179a
      continue;
    }
    // "Max speed — [Ability]": "As long as your speed is 4, this object has '[Ability]'" (CR 702.178a).
    const maxSpeed = /^Max speed — (.+)$/.exec(line);
    if (maxSpeed) {
      if (!maxSpeedAbility(d, maxSpeed[1]!, out)) out.unsupported.push(raw);
      continue;
    }
    // Loyalty abilities (CR 606): "+1: ...", "−2: ...", "0: ...", "−X: ...". Given in quotes, they're bracketed
    // ('Planeswalkers you control have "[−4]: ..."'): the ability is still a loyalty ability (CR 606.3).
    const loyal = /^([+−-]?)(\d+|X): (.+)$/.exec(line) ?? /^\[([+−-]?)(\d+|X)\]: (.+)$/.exec(line);
    if (loyal && (d.types.includes("Planeswalker") || line.startsWith("["))) {
      const ab = parseLoyalty(loyal[1]!, loyal[2]!, loyal[3]!, raw);
      if (ab === "fail") out.unsupported.push(raw);
      else out.activated.push(bindThisAbility(ab, line));
      continue;
    }
    const manaAb = parseManaAbility(line);
    if (manaAb) {
      out.mana.push(manaAb);
      continue;
    }
    const manaTrigger = parseManaTrigger(line);
    if (manaTrigger) {
      if (manaTrigger === "fail") out.unsupported.push(raw);
      else (out.manaTriggers ??= []).push(manaTrigger);
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
        if (costKw.delve) out.delve = true;
        if (costKw.assist) out.assist = true;
        // Two of the same: each would work separately (CR 702.153b), which isn't modeled.
        const twice = (costKw.madness && out.madness) || (costKw.suspend && out.suspend) || (costKw.casualty && out.casualty) || (costKw.dredge && out.dredge) || (costKw.plot && out.plot) || (costKw.alt && out.altCosts?.some((a) => a.kind === costKw.alt!.kind));
        if (twice) {
          out.unsupported.push(raw);
          continue;
        }
        if (costKw.alt) (out.altCosts ??= []).push(costKw.alt);
        if (costKw.madness) out.madness = costKw.madness;
        if (costKw.plot) out.plot = costKw.plot;
        if (costKw.suspend) out.suspend = costKw.suspend;
        if (costKw.casualty) out.casualty = costKw.casualty;
        if (costKw.dredge) out.dredge = costKw.dredge;
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
    // Ascend on an instant or sorcery is a spell ability, the spell's first instruction (CR 702.131a).
    if (line === "Ascend" && isSpell) {
      ascendSpell = true;
      continue;
    }
    // "Firebending X, where X is ~'s power" (CR 702.189a): X is counted as the ability resolves.
    const fireX = /^Firebending X, where X is (.+)\.$/.exec(line);
    if (fireX) {
      const def = parseCount(fireX[1]!, null);
      if (def) out.triggers.push(firebending(def, "Firebending X"));
      else out.unsupported.push(raw);
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
      if (kw.sunburst) {
        if (out.sunburst) {
          out.unsupported.push(raw); // two sunburst abilities: not modeled
          continue;
        }
        out.sunburst = kw.sunburst;
      }
      if (kw.enlist) {
        if (out.enlist) {
          out.unsupported.push(raw); // two enlist abilities: not modeled (CR 702.154d)
          continue;
        }
        out.enlist = true;
      }
      if (kw.amplify) {
        if (out.amplify) {
          out.unsupported.push(raw);
          continue;
        }
        out.amplify = kw.amplify;
      }
      if (kw.devour) {
        if (out.devour) {
          out.unsupported.push(raw); // two devour abilities: not modeled
          continue;
        }
        out.devour = kw.devour;
      }
      if (kw.entersOptions.length) out.entersOptions = [...(out.entersOptions ?? []), ...kw.entersOptions];
      out.statics.push(...kw.statics);
      continue;
    }
    if (/^~ enters tapped\.$/.test(line)) {
      out.entersTapped = true;
      continue;
    }
    // "Creatures your opponents control enter tapped." "Artifacts and lands enter tapped." "Creatures and nonbasic
    // lands your opponents control enter tapped." An ability word may come first (CR 207.2c).
    const othersTapped = /^(?:[A-Z][A-Za-z' -]+ — )?([A-Z][^.—]*?) enter tapped\.$/.exec(line);
    if (othersTapped && !/\b(other|played|this turn|until)\b/i.test(othersTapped[1]!)) {
      const words = othersTapped[1]!;
      const split = /^(\w+) and (\w+ \w+)( your opponents control)?$/.exec(words);
      const groups = [parseGroup(words, true)];
      if (!groups[0] && split) groups.splice(0, 1, parseGroup(`${split[1]}${split[3] ?? ""}`, true), parseGroup(`${split[2]}${split[3] ?? ""}`, true));
      if (groups.every((g) => g && !g.other)) {
        for (const g of groups) (out.othersEnterTapped ??= []).push({ filter: g!.filter, text: line });
        continue;
      }
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
    // Thromok: "Devour X, where X is the number of creatures devoured this way" (CR 702.82a; X counters for each).
    if (/^Devour X, where X is the number of creatures devoured this way$/.test(line)) {
      if (out.devour) out.unsupported.push(raw);
      else out.devour = { n: "devoured", filter: { kind: "object", types: ["Creature"], text: "creature" } };
      continue;
    }
    // Mirage's flash Auras and enchantments: castable any time, sacrificed in the next cleanup step if that wasn't a
    // time a sorcery could have been cast (see castSpell).
    if (line === "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.") {
      out.flashSacrifice = true;
      continue;
    }
    // Ravenous (CR 702.156a): "This permanent enters with X +1/+1 counters on it" and "When this permanent enters, if X
    // is 5 or more, draw a card."
    if (line === "Ravenous") {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } } };
        out.triggers.push({ event: "selfEnters", ifX: 5, body: { targets: [], effects: [{ type: "draw", who: { ref: "you" }, n: 1 }], text: "Ravenous: if X is 5 or more, draw a card." } });
      }
      continue;
    }
    // Replicate (CR 702.56a): an additional cost paid any number of times, like multikicker, and "when you cast this
    // spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid".
    const replicate = /^Replicate ((?:\{[^}]+\})+)$/.exec(line);
    if (replicate) {
      if (out.kicker || !plainMana(replicate[1]!)) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [replicate[1]!], multi: true, replicate: true };
        out.triggers.push({ event: "selfCast", body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "kicked", newTargets: true }], text: "Replicate: copy ~ for each time its replicate cost was paid." } });
      }
      continue;
    }
    // Offspring (CR 702.175a): "You may pay an additional [cost] as you cast this spell" and "When this permanent enters,
    // if its offspring cost was paid, create a token that's a copy of it, except it's 1/1." Squad (CR 702.157a): "As an
    // additional cost to cast this spell, you may pay [cost] any number of times" and "When this creature enters, if its
    // squad cost was paid, create a token that's a copy of it for each time its squad cost was paid." Both are paid
    // like kicker; the copy is of it as it last existed if it has left (rulings, CR 608.2h).
    const offspring = /^(Offspring|Squad) ((?:\{[^}]+\})+)$/.exec(line);
    if (offspring) {
      const squad = offspring[1] === "Squad";
      if (out.kicker || !plainMana(offspring[2]!)) out.unsupported.push(raw);
      else {
        out.kicker = { costs: [offspring[2]!], ...(squad ? { multi: true, squad: true } : { offspring: true }) };
        out.triggers.push({
          event: "selfEnters",
          ifKicked: { kind: "kicked" },
          body: squad
            ? { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: { count: { kind: "kicked" } }, what: { ref: "self" } }], text: "Squad: create a token that's a copy of ~ for each time its squad cost was paid." }
            : { targets: [], effects: [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "self" }, except: { pt: [1, 1] } }], text: "Offspring: create a token that's a copy of ~, except it's 1/1." },
        });
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
    // Darksteel Colossus: a replacement effect that works from every zone (CR 614.1a, 113.6c-style "from anywhere").
    if (/^If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead\.$/.test(line)) {
      out.shuffleInsteadOfGraveyard = true;
      continue;
    }
    if (line === "You may play lands from your graveyard.") {
      out.landsFromGraveyard = true;
      continue;
    }
    const extraLand = new RegExp(`^You may play ${NUM} additional lands? on each of your turns\\.$`).exec(line);
    if (extraLand) {
      out.extraLands = (out.extraLands ?? 0) + num(extraLand[1]!);
      continue;
    }
    // Clones: "You may have ~ enter as a copy of any creature on the battlefield[, except ...]." (CR 707.5)
    // Cursed Mirror: "As ~ enters, you may have it become a copy of any creature on the battlefield until end of
    // turn, except it has haste" also becomes the copy as it enters (rulings), for the rest of the turn.
    const clone = /^(?:You may have ~ enter as|As ~ enters, you may have it become) a copy of (?:any |an? )?(.+?)( until end of turn)?(?:, except (.+?))?\.?$/.exec(line);
    if (clone && !/graveyard|\bcard\b/.test(clone[1]!) && !(clone[2] && line.startsWith("You may"))) {
      const filter = parseTargetPhrase(clone[1]!.replace(/ on the battlefield$/, ""));
      const except = clone[3] ? parseCopyExcept(clone[3]) : undefined;
      if (filter?.kind === "object" && except !== null && !except?.thisAbility) {
        out.entersAsCopy = { filter: { ...filter, text: clone[1]! }, ...(except ? { except } : {}), ...(clone[2] ? { untilEndOfTurn: true } : {}) };
        continue;
      }
    }
    const countMod = parseCountMod(line);
    if (countMod) {
      (out.countMods ??= []).push(countMod);
      continue;
    }
    // "Each player can't cast more than one spell each turn", "... more than one noncreature spell", Ethersworn Canonist's
    // "Each player who has cast a nonartifact spell this turn can't cast additional nonartifact spells" (the same rule).
    const limit = /^(Each player|You) can't cast more than one (?:(.+?) )?spell each turn\.$/.exec(line) ?? /^(Each player) who has cast an? (.+?) spell this turn can't cast additional \2 spells\.$/.exec(line);
    if (limit) {
      const filter = limit[2] ? parseTargetPhrase(`${limit[2]} spell`) : undefined;
      if (filter === null || (filter && filter.kind !== "spell")) out.unsupported.push(raw);
      else (out.castLimits ??= []).push({ who: limit[1] === "You" ? "you" : "each", ...(filter ? { filter: { ...filter, text: `${limit[2]} spell` } } : {}), text: line });
      continue;
    }
    if (/^You have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = true;
      continue;
    }
    // The Phantom creatures' prevention shield (CR 615): see dealDamage.
    if (line === "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~.") {
      out.phantom = true;
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
    // A double-faced token's "{2}: Transform this token." (CR 701.27a, 701.53b). A double-faced card's back face isn't in
    // the card data, so its transform abilities stay unsupported.
    const transform = /^((?:\{[^}]+\})+): Transform ~\.$/.exec(line);
    if (transform && d.tokenBack) {
      out.activated.push({ manaCost: transform[1]!, tap: false, sacrificeSelf: false, sorcerySpeed: false, body: { targets: [], effects: [{ type: "transformSelf" }], text: "Transform ~." }, text: line });
      continue;
    }
    // CR 702.151a: "[Cost]: Attach this permanent to another target creature you control. Activate only as a sorcery"
    // and "[Cost]: Unattach this permanent. Activate only if this permanent is attached to a creature and only as a sorcery."
    const reconfigure = /^Reconfigure ((?:\{[^}]+\})+)$/.exec(line);
    if (reconfigure && d.subtypes.includes("Equipment") && !out.reconfigure) {
      const mana = reconfigure[1]!;
      out.reconfigure = true;
      out.activated.push(
        {
          manaCost: mana,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          body: { targets: [{ kind: "object", types: ["Creature"], controller: "you", notSource: true, text: "another target creature you control" }], effects: [{ type: "attach", what: { ref: "target", index: 0 } }], text: "Attach ~ to another target creature you control." },
          text: `Reconfigure ${mana}: attach ~ to another target creature you control.`,
        },
        {
          manaCost: mana,
          tap: false,
          sacrificeSelf: false,
          sorcerySpeed: true,
          activateIf: { kind: "self", is: "attachedToCreature" },
          body: { targets: [], effects: [{ type: "unattachSelf" }], text: "Unattach ~." },
          text: `Reconfigure ${mana}: unattach ~.`,
        },
      );
      continue;
    }
    const cost = parseCostChange(line);
    if (cost) {
      if (cost === "fail") out.unsupported.push(raw);
      else if ("costMod" in cost) out.costMods = [...(out.costMods ?? []), cost.costMod];
      else if ("less" in cost) out.costLess = [...(out.costLess ?? []), cost.less];
      else if ("lessIfTargets" in cost) out.costLessIfTargets = [...(out.costLessIfTargets ?? []), cost.lessIfTargets];
      else if ("targetTax" in cost) out.targetTax = (out.targetTax ?? 0) + cost.targetTax;
      else out.costLessIf = [...(out.costLessIf ?? []), cost.lessIf];
      continue;
    }
    // "Enchanted creature has protection from the chosen color. This effect doesn't remove ~." (Cho-Manno's Blessing)
    const spare = /^(Enchanted creature has protection from .+?\.) This effect doesn't remove ~\.$/.exec(line);
    if (spare) {
      const st = parseStatic(spare[1]!);
      const ok = st?.affects.kind === "attached" && st.mods.length > 0 && st.mods.every((m) => m.kind === "addKeywords" && m.keywords.every((k) => /^Protection from /.test(k)));
      if (ok) out.statics.push({ ...st, mods: st.mods.map((m) => ({ ...m, spares: true as const })) as typeof st.mods, text: line });
      else out.unsupported.push(raw);
      continue;
    }
    const st = parseStatic(line) ?? parseConditionalStatic(line);
    if (st) {
      out.statics.push(st);
      continue;
    }
    // A spell's "When you next cast ... this turn, ..." creates a delayed trigger as it resolves (CR 603.7); it isn't a triggered ability of the card.
    if (isSpell && /^When you next cast /.test(line)) {
      spellLines.push(line);
      continue;
    }
    const trig = parseTrigger(line);
    if (trig) {
      if (trig === "fail") out.unsupported.push(raw);
      else out.triggers.push(bindThisAbility(trig, line));
      continue;
    }
    const act = parseActivated(line);
    if (act) {
      if (act === "fail") out.unsupported.push(raw);
      else out.activated.push(bindThisAbility(act, line));
      continue;
    }
    // A spell's paragraphs are read as one text, so an ability word inside it goes (CR 207.2c).
    if (isSpell) spellLines.push(stripAbilityWord(line));
    else out.unsupported.push(raw);
  }
  if (isSpell) {
    const body = spellLines.length ? parseBody(spellLines.join(" "), { spell: true }) : null;
    if (body && ascendSpell && body.modal) out.unsupported.push("Ascend"); // before the modes: not modeled
    else if (body) out.spell = ascendSpell ? { ...body, effects: [{ type: "ascend" }, ...body.effects] } : body;
    else out.unsupported.push(...spellLines);
  }
  checkX(d, out);
  // Both pay with the same chosen cards: a discard for jump-start on top of a discard the spell asks for isn't modeled.
  const kinds = (costs: AdditionalCost[] = []) => costs.map((c) => c.kind);
  if (out.fromGraveyard?.some((g) => kinds(g.costs).some((k) => kinds(out.additionalCosts).includes(k)))) out.unsupported.push("graveyard cast with a cost like its additional cost");
  if (out.escapesWith && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  checkCastingLinks(out);
  linkExile(out);
  // An Aura put onto the battlefield needs a choice of what it enchants (CR 303.4f), which isn't modeled.
  if (d.subtypes.includes("Aura") && out.activated.some((ab) => ab.zone === "graveyard" && ab.body.effects.some((e) => e.type === "putOntoBattlefield"))) out.unsupported.push("(an Aura returning itself to the battlefield)");
  const json = JSON.stringify(out);
  if (json.includes('"thisAbility":true')) out.unsupported.push("(a copy effect's \"this ability\" outside a triggered or activated ability)");
  if (out.sunburst || json.includes('"kind":"colorsSpent"')) out.countsColors = true;
  return out;
}

/**
 * "Becomes a copy of ..., except it has this ability": the copy gets this ability's own text (CR 707.9a), which
 * refers to itself with "~" like any rules text, so the copy's own name takes its place.
 */
function bindThisAbility<T extends object>(ability: T, line: string): T {
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o.type === "becomeCopy" && (o.except as CopyExcept | undefined)?.thisAbility) {
      const { thisAbility: _, ...except } = o.except as CopyExcept;
      o.except = { ...except, text: [...(except.text ?? []), line] };
    }
    Object.values(o).forEach(visit);
  };
  visit(ability);
  return ability;
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

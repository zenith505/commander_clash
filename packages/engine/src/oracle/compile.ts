import { allEffects } from "../abilities";
import type { FromTop, AbilityBody, Count, ChoiceKind, TriggeredAbility, CompiledCard, Effect, AdditionalCost, CostOption, TargetSpec, ActivatedAbility, StaticCondition, SpentReq } from "../abilities";
import { CHOSEN_LAND_TYPE, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION, stripReminder } from "../keywords";
import { parseManaCost } from "../mana";
import { substituteX } from "../amounts";
import { withModes, gateTargets, type CastHow } from "../modes";
import type { CardDef } from "../types";
import type { CopyExcept } from "../copies";
import { NUM, num, NUMX, COUNTER, counterKind, X, amt, parseSpentReq, plainMana, sacrificeSelf, SPENT } from "./words";
import { parseManaAbility, parseManaTrigger } from "./mana-abilities";
import { parseGraveyardKeyword, parseCostKeyword, parseAdditionalCost, keywordAbilities, textKeywords, isKeywordLine, firebending, rippleBody } from "./keyword-abilities";
import { parseEntersCondition, parseEntersChoice, parseConditionalStatic, parseCostChange, parseStatic, parseStaticCondition, parseOnlyClauses } from "./statics";
import { parseTrigger } from "./triggers";
import { parseActivated, parseLoyalty, stripAbilityWord } from "./activated";
import { parseBody, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { parseGroup, parseTargetPhrase } from "./targets";
import { backupTriggers } from "./grants";
import { dungeonTriggers } from "./dungeons";
import { parseCountMod, parseCopyExcept, PREDEFINED_TOKENS } from "./tokens";
import { parseSearchFilter } from "./search";
import { addStriation, simpleKeywords, striations } from "./striations";

const cache = new Map<string, CompiledCard>();

/** An overloaded spell's text (CR 702.96a): every instance of the word "target" is "each", except in the overload line. */
export const overloadedText = (text: string): string =>
  text
    .split("\n")
    .map((l) => (/^Overload\b/.test(l) ? l : l.replace(/\btarget\b/g, "each").replace(/\bTarget\b/g, "Each")))
    .join("\n");

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

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

/** Card types/subtypes whose rules we don't model yet, whatever their text says. */
const UNSUPPORTED_TYPES = ["Battle", "Kindred", "Tribal", "Dungeon"];
const UNSUPPORTED_SUBTYPES = ["Room", "Siege"];

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
/** `how`: the optional costs announced for it, which decide whether it has the targets of parts that need them (gateTargets). */
export function spellTargetSpecs(d: CardDef, modes?: number[], how?: CastHow): TargetSpec[] {
  const c = compileCard(d);
  if (c.spell) return gateTargets(withModes(c.spell, modes).targets, how);
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
  // Shortened names (CR 201.5c): "Gylwain" for "Gylwain, Casting Director", and for a legendary card with no comma,
  // "Ellivere" for "Ellivere of the Wild Court", "Gandalf" for "Gandalf the Grey" (not "Tuktuk the Returned", a token
  // Tuktuk the Explorer creates).
  const comma = full.split(",")[0]!;
  const ofThe = comma === full && d.supertypes?.includes("Legendary") ? /^(.+?) (?:of|the) /.exec(full)?.[1] : undefined;
  const short = ofThe ?? comma;
  if (short && short !== full) {
    const re = new RegExp(`\\b${esc(short)}\\b${ofThe ? "(?! (?:of|the) [A-Z])" : ""}`, "g");
    t = t.replace(/"[^"]*"/g, (q) => q.replace(re, QUOTED_SOURCE_NAME));
    t = t.replace(re, "~");
  }
  // 'Equipped creature has "... sacrifice this Equipment"': the Equipment, not the creature.
  t = t.replace(/"[^"]*"/g, (q) => q.replace(/\b[Tt]his (Equipment|Aura)\b/g, QUOTED_SOURCE_NAME));
  t = t.replace(/\b[Tt]his (creature|artifact|enchantment|land|permanent|spell|card|token|Equipment|Vehicle|Spacecraft|Planet|Aura|planeswalker|Saga|Class|Case)\b/g, "~");
  return t;
}

/**
 * A max speed ability's ability (CR 702.178a), added to `out` with the condition: one static, triggered, activated or
 * mana ability and nothing else. False if it's anything else, or a static ability that already has a condition.
 */
function conditionalAbility(d: CardDef, text: string, out: CompiledCard, cond: StaticCondition): boolean {
  const inner = compile({ ...d, oracleText: text });
  const base = compile({ ...d, oracleText: "" });
  if (inner.unsupported.length) return false;
  const lists = ["triggers", "activated", "mana", "statics"] as const;
  const rest = (c: CompiledCard) => JSON.stringify(Object.entries(c).filter(([k]) => !(lists as readonly string[]).includes(k)).sort(([a], [b]) => a.localeCompare(b)));
  if (rest(inner) !== rest(base) || lists.some((k) => base[k].length)) return false;
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

/** A Case's "To solve — [Condition]" as its end step trigger (CR 719.3a), or null if the condition isn't understood. */
function solveTrigger(d: CardDef, text: string): TriggeredAbility | null {
  const lower = text.replace(/^[A-Z](?=[a-z' ])/, (c) => c.toLowerCase());
  // "Three or more creatures attacked this turn" (Case of the Gateway Express): it's checked in your end step, and only
  // the active player declares attackers (CR 508.1), so they're the creatures you attacked with.
  const attacked = new RegExp(`^${NUM} or more creatures attacked this turn$`).exec(lower);
  const cond: StaticCondition | null = attacked ? { kind: "attackedWith", n: num(attacked[1]!) } : parseStaticCondition(lower, { affects: { kind: "self" }, mods: [], text: "" });
  if (!cond) return null;
  const t = compile({ ...d, subtypes: [], oracleText: "At the beginning of your end step, ~ becomes solved." }).triggers[0];
  if (!t || t.ifCond) return null;
  return { ...t, ifCond: { kind: "allOf", conds: [cond, { kind: "solved", not: true }] }, body: { ...t.body, text: `To solve — ${text}.` } };
}

/** The conditions "~ has flash as long as ..." may have: about the player, so the same with the card in hand. */
const FLASH_IF: StaticCondition["kind"][] = ["committedCrime", "control", "monarch", "initiative", "graveyardAtLeast", "graveyardTypes"];

export function compile(d: CardDef): CompiledCard {
  const out: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  const isSpell = d.types.includes("Instant") || d.types.includes("Sorcery");
  const spellLines: string[] = [];
  let ascendSpell = false;
  let awaken: { n: number; raw: string } | undefined;
  // "Choose one. If this spell was cast using teamwork, choose both instead." and "Choose one. If you control a commander
  // as you cast this spell, you may choose both instead.": a "Choose one —" list whose count can change as it's cast.
  // "Choose one. If this spell was kicked, choose any number instead." (Inscriptions) too.
  let both: "teamwork" | "commander" | "kicked" | undefined;
  // "Choose three. You may choose the same mode more than once." (the Confluences, CR 700.2d).
  let repeat = false;
  let cipher = false;
  const all = joinModes(
    normalizeSelf(d)
      .split("\n")
      .map((l) => {
        const same = /^Choose (one|two|three|four|five)\. You may choose the same mode more than once\.$/.exec(l.trim());
        if (same && isSpell) {
          repeat = true;
          return `Choose ${same[1]} —`;
        }
        if (/^Choose one\. If ~ was kicked, choose any number instead\.$/.test(l.trim())) {
          both = "kicked";
          return "Choose one —";
        }
        const m = /^Choose one\. If (~ was cast using teamwork, choose|you control a commander as you cast ~, you may choose) both instead\.$/.exec(l.trim());
        if (!m) return l;
        both = m[1]!.startsWith("~") ? "teamwork" : "commander";
        return "Choose one —";
      }),
  );
  // Leveler and station cards (CR 711, 721): the striations' abilities are compiled after the rest, each with its condition.
  const striated = striations(d, all);
  if (striated === "fail") out.unsupported.push("(a striated text box that doesn't read as levels or station symbols)");
  const lines = striated && striated !== "fail" ? striated.base : all;
  // Spree (CR 702.172a): "Choose one or more modes. As an additional cost to cast this spell, pay the costs associated
  // with those modes." Each mode is a "+ [cost] — [effect]" line.
  let spree: { costs: string[]; texts: string[]; lines: string[] } | undefined;
  // Entwine (CR 702.42a): "You may choose all modes of this spell instead of just the number specified. If you do, you
  // pay an additional [cost]." Mana costs only.
  let entwine: { cost: string; raw: string } | undefined;
  // Escalate (CR 702.120a): "For each mode you choose beyond the first as you cast this spell, you pay an additional
  // [cost]": mana, or one cost beyond mana ("Escalate—Discard a card.").
  let escalate: { mana?: string; cost?: AdditionalCost; text: string; raw: string } | "fail" | undefined;
  // Pawprints (CR 700.2i): "Choose up to five {P} worth of modes. You may choose the same mode more than once." and a
  // "{P}{P} — [effect]" line for each mode.
  let paws: { budget: number; costs: number[]; texts: string[]; lines: string[] } | undefined;
  for (const [li, raw] of lines.entries()) {
    // Converge (CR 207.2c) is an ability word: it has no rules meaning of its own; neither have flavor words, like "Gae
    // Bolg — Equip {4}" (CR 207.2d).
    let line = raw.trim().replace(/^Converge — /, "").replace(/^[A-Z][^—•"]* — (?=Equip\b)/, "");
    if (!line) continue;
    if (line === "Spree" && isSpell && !spree) {
      spree = { costs: [], texts: [], lines: [raw] };
      continue;
    }
    const spreeMode = spree && /^\+ ((?:\{[0-9WUBRGC]+\})+) — (.+)$/.exec(line);
    if (spree && spreeMode) {
      spree.costs.push(spreeMode[1]!);
      spree.texts.push(spreeMode[2]!);
      spree.lines.push(raw);
      continue;
    }
    const pawHeader = isSpell && !paws && /^Choose up to (one|two|three|four|five|six) \{P\} worth of modes\. You may choose the same mode more than once\.$/.exec(line);
    if (pawHeader) {
      paws = { budget: num(pawHeader[1]!), costs: [], texts: [], lines: [raw] };
      continue;
    }
    const pawMode = paws && /^((?:\{P\})+) — (.+)$/.exec(line);
    if (paws && pawMode) {
      paws.costs.push(pawMode[1]!.length / 3);
      paws.texts.push(pawMode[2]!);
      paws.lines.push(raw);
      continue;
    }
    const esc = isSpell && !escalate && /^Escalate(?: ((?:\{[0-9WUBRGC]+\})+)|—(.+)\.)$/.exec(line);
    if (esc) {
      const cost = esc[2] ? parseAdditionalCost(esc[2].replace(/^./, (c) => c.toLowerCase())) : null;
      // Costs beyond mana that add up per mode: discarding, tapping, sacrificing (n of them for each mode).
      if (esc[1] && parseManaCost(esc[1]).supported) escalate = { mana: esc[1], text: esc[1], raw };
      else if (cost && (cost.kind === "tap" || cost.kind === "sacrifice" || (cost.kind === "discard" && !cost.random && !cost.oneOf)) && !("x" in cost && cost.x))
        escalate = { cost, text: esc[2]!, raw };
      else {
        escalate = "fail";
        out.unsupported.push(raw);
      }
      continue;
    }
    const ent = isSpell && /^Entwine ((?:\{[0-9WUBRGC]+\})+)$/.exec(line);
    if (ent && !entwine && parseManaCost(ent[1]!).supported) {
      entwine = { cost: ent[1]!, raw };
      continue;
    }
    // Deck construction, not play: the deck checker reads it (deckLimit).
    if (/^A deck can have (?:any number of|up to \w+) cards named ~\.$/.test(line)) continue;
    // Also deck construction: who can be a commander (CR 903.3, deck.ts canBeCommander).
    if (/^~ can be your commander\.$/.test(line)) continue;
    if (line === "Start your engines!") {
      out.startYourEngines = true; // CR 702.179a
      continue;
    }
    // Sagas (CR 714): read ahead (CR 702.155), and chapter abilities "I, II — [Effect]", each a triggered ability
    // (CR 714.2b-c).
    if (d.subtypes.includes("Saga")) {
      if (line === "Read ahead") {
        out.readAhead = true;
        continue;
      }
      const chapter = /^((?:I|II|III|IV|V|VI|VII)(?:, (?:I|II|III|IV|V|VI|VII))*) — (.+)$/.exec(line);
      if (chapter) {
        // "I, II, III — Pain — You draw a card ...": a chapter's name is a flavor word, with no rules meaning (CR 207.2d).
        const body = parseBody(chapter[2]!.replace(/^(?!Choose\b)[A-Z][^—•:"]{0,30}? — (?=\S)/, ""), {});
        if (!body) out.unsupported.push(raw);
        else for (const n of chapter[1]!.split(", ")) out.triggers.push(bindThisAbility({ event: "chapter", chapter: ROMAN.indexOf(n), body } as TriggeredAbility, line));
        continue;
      }
    }
    // "Max speed — [Ability]": "As long as your speed is 4, this object has '[Ability]'" (CR 702.178a).
    const maxSpeed = /^Max speed — (.+)$/.exec(line);
    if (maxSpeed) {
      if (!conditionalAbility(d, maxSpeed[1]!, out, { kind: "maxSpeed" })) out.unsupported.push(raw);
      continue;
    }
    // Cases (CR 719.3): "To solve — [Condition]" means "At the beginning of your end step, if [condition] and this Case is
    // not solved, this Case becomes solved", checked as it triggers and as it resolves (603.4, rulings); "Solved —
    // [Ability]" is that ability only while it's solved (702.169).
    const toSolve = d.subtypes.includes("Case") && /^To solve — (.+)\.$/.exec(line);
    if (toSolve) {
      const t = solveTrigger(d, toSolve[1]!);
      if (t) out.triggers.push(t);
      else out.unsupported.push(raw);
      continue;
    }
    const solved = d.subtypes.includes("Case") && /^Solved — (.+)$/.exec(line);
    if (solved) {
      // Like a Class level's abilities: each kind of ability (static, triggered, activated, from the top) made conditional.
      const part = { header: "Solved", cond: { kind: "solved" as const }, lines: [solved[1]!] };
      if (!addStriation(part, out, (l) => compile({ ...d, oracleText: l, keywords: [] }), compile({ ...d, oracleText: "", keywords: [] }))) out.unsupported.push(raw);
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
    // "Exhaust — [Cost]: Add ..." is a mana ability that can be activated only once (CR 702.177a, 605.1a).
    const exhaust = /^Exhaust — (.+)$/.exec(line);
    const manaAb = exhaust ? parseManaAbility(exhaust[1]!) : parseManaAbility(line);
    if (manaAb && exhaust) {
      if (manaAb.oncePerTurn) out.unsupported.push(raw);
      else out.mana.push({ ...manaAb, text: line, onceEver: true });
      continue;
    }
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
      else if ("buyback" in yard) {
        out.buyback = yard.buyback;
        if (yard.costs) [out.buybackCosts, out.buybackText] = [yard.costs, yard.text];
      }
      else if ("rebound" in yard) out.rebound = true;
      else if ("escapesWith" in yard) out.escapesWith = yard.escapesWith;
      else out.activated.push(yard.unearth);
      continue;
    }
    // Awaken N—[cost] (CR 702.113a): an alternative cost, and a spell ability added after the spell's own (see below).
    const awakenLine = /^Awaken (\d+)—((?:\{[^}]+\})+)$/.exec(line);
    if (awakenLine && isSpell && !awaken && parseManaCost(awakenLine[2]!).supported && !parseManaCost(awakenLine[2]!).hasX) {
      awaken = { n: Number(awakenLine[1]), raw };
      (out.altCosts ??= []).push({ kind: "awaken", mana: awakenLine[2]! });
      continue;
    }
    if (/^Awaken\b/.test(line)) {
      out.unsupported.push(raw);
      continue;
    }
    // Splice onto Arcane [cost] (CR 702.47a): only a mana cost, and only one splice ability.
    const splice = /^Splice onto (Arcane|instant or sorcery) ((?:\{[^}]+\})+)$/.exec(line);
    if (splice && isSpell && !out.splice && parseManaCost(splice[2]!).supported && !parseManaCost(splice[2]!).hasX) {
      out.splice = { onto: splice[1] === "Arcane" ? "Arcane" : "instantOrSorcery", mana: splice[2]! };
      continue;
    }
    if (/^Splice onto\b/.test(line)) {
      out.unsupported.push(raw);
      continue;
    }
    const costKw = parseCostKeyword(line, d);
    if (costKw !== null) {
      if (costKw === "fail") out.unsupported.push(raw);
      else {
        if (costKw.delve) out.delve = true;
        if (costKw.assist) out.assist = true;
        // Two of the same: each would work separately (CR 702.153b), which isn't modeled.
        const twice = (costKw.madness && out.madness) || (costKw.miracle && out.miracle) || (costKw.suspend && out.suspend) || (costKw.casualty && out.casualty) || (costKw.dredge && out.dredge) || (costKw.plot && out.plot) || (costKw.foretell && out.foretell) || (costKw.alt && out.altCosts?.some((a) => a.kind === costKw.alt!.kind));
        if (twice) {
          out.unsupported.push(raw);
          continue;
        }
        if (costKw.alt) (out.altCosts ??= []).push(costKw.alt);
        if (costKw.madness) out.madness = costKw.madness;
        if (costKw.miracle) out.miracle = costKw.miracle;
        if (costKw.plot) out.plot = costKw.plot;
        if (costKw.foretell) out.foretell = costKw.foretell;
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
    // Exert (CR 701.43d): "You may exert ~ as it attacks. When you do, it gets +2/+2 until end of turn." The "when you
    // do" ability triggers when it's exerted (linked, CR 607.2h); "it" is the exerted creature itself.
    // Combat Celebrant: "If ~ hasn't been exerted this turn, you may exert it as it attacks" (with additional combats).
    const exert = /^(?:You may exert ~|(If ~ hasn't been exerted this turn), you may exert it) as (?:it|he|she|they) attacks?\.(?: When you do, (.+))?$/.exec(line);
    if (exert) {
      const body = exert[2] ? parseBody(exert[2].replace(/^(?:it|he|she) (?=(?:gets|gains|deals|has|becomes|can't)\b)/, "~ ").replace(/^(?:he|she) /, "it "), { selfIt: true }) : undefined;
      if (out.exert || body === null) out.unsupported.push(raw);
      else {
        out.exert = exert[1] ? "notThisTurn" : true;
        if (body) out.triggers.push({ event: "selfExerted", body });
      }
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
      if (kw.epic) out.epic = true;
      for (let i = 0; i < (kw.undaunted ?? 0); i++) out.costLess = [...(out.costLess ?? []), { count: { kind: "players", opponents: true } }];
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
    // "As ~ enters, choose a player." (CR 614.12): True-Name Nemesis's "the chosen player".
    const choosePlayer = /^As (?:~|it) enters, choose (a player|an opponent)\.$/.exec(line);
    if (choosePlayer && !out.entersChoosePlayer) {
      out.entersChoosePlayer = choosePlayer[1] === "a player" ? "player" : "opponent";
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
    // Adamant: "If at least three white mana was spent to cast ~, ~ enters with a +1/+1 counter on it." (CR 614.1c, 601.2h)
    const spentCounters = new RegExp(`^(?:Adamant — )?If ${SPENT} was spent to cast ~, (?:~|it) enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it\\.$`).exec(line);
    const spentReq = spentCounters && parseSpentReq(spentCounters[1]!);
    if (spentCounters) {
      if (out.entersWithCounters || !spentReq) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: spentCounters[3] === "-1/-1" ? "-1/-1" : "+1/+1", n: { count: { kind: "spentWas", req: spentReq }, times: num(spentCounters[2]!) } };
      continue;
    }
    // "~ enters with two +1/+1 counters on it if it wasn't cast or no mana was spent to cast it" (Freestrider Commando),
    // "... unless two or more colors of mana were spent to cast it" (Steel Exemplar): what was spent on its total cost
    // (CR 601.2h, rulings); nothing if it wasn't cast.
    const spentUnless = new RegExp(`^~ enters(?: the battlefield)? with ${NUM} ([+-]1/[+-]1) counters? on it (if it wasn't cast or no mana was spent to cast it|unless two or more colors of mana were spent to cast it)\\.$`).exec(line);
    if (spentUnless) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: spentUnless[2] === "-1/-1" ? "-1/-1" : "+1/+1", n: { count: { kind: "spentWas", req: spentUnless[3]!.startsWith("if") ? { none: "mana" } : { maxColors: 1 } }, times: num(spentUnless[1]!) } };
      continue;
    }
    // "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a), maybe with "This spell costs
    // {2} less to cast if evidence was collected" in the same paragraph.
    const evidence = !d.types.includes("Land") ? /^As an additional cost to cast ~, you may collect evidence (\d+)\.(?: ~ costs \{(\d+)\} less to cast if evidence was collected\.)?$/.exec(line) : null;
    if (evidence && out.evidence === undefined) {
      out.evidence = Number(evidence[1]);
      if (evidence[2]) out.evidenceReduction = Number(evidence[2]);
      continue;
    }
    // Conspiracy Unraveler: "You may collect evidence 10 rather than pay the mana cost for spells you cast" (CR 118.9).
    const payEvidence = /^You may collect evidence (\d+) rather than pay the mana cost for spells you cast\.$/.exec(line);
    if (payEvidence) {
      out.payEvidence = Number(payEvidence[1]);
      continue;
    }
    // "As an additional cost to cast this spell, sacrifice a creature." (CR 601.2b, 601.2f-h)
    const extra = /^As an additional cost to cast (?:this spell|~), (.+)\.$/.exec(line);
    if (extra) {
      const cost = parseAdditionalCost(extra[1]!, true);
      const or = cost ? null : parseCostOr(extra[1]!);
      if (cost) (out.additionalCosts ??= []).push(cost);
      else if (or && !out.costOr) out.costOr = or;
      else out.unsupported.push(raw);
      continue;
    }
    // "If you control two or more other lands, ~ enters tapped" (the Adventures in the Forgotten Realms creature lands):
    // untapped only with one or fewer other lands, as it enters (CR 614.1d).
    const ifOthers = new RegExp(`^If you control ${NUM} or more other lands, ~ enters tapped\\.$`).exec(line);
    if (ifOthers) {
      out.entersTappedUnless = { kind: "control", who: "you", types: ["Land"], other: true, max: num(ifOthers[1]!) - 1 };
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
    // Kumano, Master Yamabushi; Kumano's Blessing: a replacement effect (CR 614.1a) on creatures it dealt damage this turn.
    const kumano = /^If a creature dealt damage by (~|enchanted creature) this turn would die, exile it instead\.$/.exec(line);
    if (kumano) {
      out.exileWhatItDamaged = kumano[1] === "~" ? "self" : "attached";
      continue;
    }
    // "If ~ would die, exile it instead." "If a creature an opponent controls would die, exile it instead." (CR 614.1a)
    const exileDies = /^If (~|a|an|another) (.+? )?would die, exile it instead\.$/.exec(line);
    if (exileDies) {
      const filter = exileDies[1] === "~" ? undefined : parseTargetPhrase(exileDies[2]!.trim());
      if (exileDies[1] === "~" && !exileDies[2]) out.exileInsteadOfDying = { self: true };
      else if (filter?.kind === "object" && !filter.combat) out.exileInsteadOfDying = { filter, ...(exileDies[1] === "another" ? { other: true as const } : {}) };
      else out.unsupported.push(raw);
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
    // Information that's public while the permanent is on the battlefield (CR 401.5; hands, CR 402.3).
    if (line === "Play with the top card of your library revealed." || line === "Players play with the top card of their libraries revealed.") {
      out.revealTop = /^Players/.test(line) ? "players" : "you";
      continue;
    }
    if (line === "Players play with their hands revealed." || line === "Your opponents play with their hands revealed.") {
      out.revealHands = /^Players/.test(line) ? "players" : "opponents";
      continue;
    }
    // "You may look at the top card of your library any time" (rulings on Vizier of the Menagerie): information for its
    // controller only, any time; Radha adds "and you may play lands from the top of your library".
    const look = /^You may look at the top card of your library any time(?:, and (you may .+))?\.$/.exec(line);
    if (look) {
      const top = look[1] ? parseFromTop(look[1]) : undefined;
      if (out.lookTop || top === null) out.unsupported.push(raw);
      else {
        out.lookTop = true;
        if (top) (out.fromTop ??= []).push(top);
      }
      continue;
    }
    // "As long as ~ is attached to a creature, you may cast creature spells from the top of your library", coven.
    const condTop = /^(?:[A-Z][A-Za-z' -]+ — )?As long as (.+?), (you may .+)\.$/.exec(line);
    const ifTop = condTop ? parseFromTop(condTop[2]!) : undefined;
    if (condTop && ifTop !== undefined) {
      const cond = parseStaticCondition(condTop[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || !ifTop) out.unsupported.push(raw);
      else (out.fromTop ??= []).push({ ...ifTop, if: cond });
      continue;
    }
    const top = parseFromTop(line.replace(/\.$/, ""));
    if (top !== undefined) {
      if (top === null) out.unsupported.push(raw);
      else (out.fromTop ??= []).push(top);
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
    const limit = /^(Each player|You|Enchanted player) can't cast more than one (?:(.+?) )?spell each turn\.$/.exec(line) ?? /^(Each player) who has cast an? (.+?) spell this turn can't cast additional \2 spells\.$/.exec(line);
    if (limit) {
      const filter = limit[2] ? parseTargetPhrase(`${limit[2]} spell`) : undefined;
      if (filter === null || (filter && filter.kind !== "spell")) out.unsupported.push(raw);
      else (out.castLimits ??= []).push({ who: limit[1] === "You" ? "you" : limit[1] === "Enchanted player" ? "enchanted" : "each", ...(filter ? { filter: { ...filter, text: `${limit[2]} spell` } } : {}), text: line });
      continue;
    }
    const noGain = /^(Players|Your opponents|Enchanted player) can't gain life\.$/.exec(line);
    if (noGain) {
      out.cantGainLife = noGain[1] === "Players" ? "all" : noGain[1] === "Enchanted player" ? "enchanted" : "opponents";
      continue;
    }
    if (line === "Damage can't be prevented.") {
      out.damageCantBePrevented = true;
      continue;
    }
    if (line === "If you would gain life, you gain twice that much life instead.") {
      out.doubleLifeGain = true;
      continue;
    }
    const coverX = /^If a creature would deal combat damage to you and\/or one or more creatures you control, prevent X of that damage, where X is (.+)\.$/.exec(line);
    const coverN = coverX ? parseCount(coverX[1]!, null) : null;
    if (coverN && !out.preventCombatFromEach) {
      out.preventCombatFromEach = coverN;
      continue;
    }
    const tapTimes = /^If you tap a permanent for mana, it produces (twice|three times) as much of that mana instead\.$/.exec(line);
    if (tapTimes) {
      out.tapManaTimes = (out.tapManaTimes ?? 1) * (tapTimes[1] === "twice" ? 2 : 3);
      continue;
    }
    const plusLife = /^If you would gain life, you gain that much life plus (\d+) instead\.$/.exec(line);
    if (plusLife) {
      out.lifeGainPlus = (out.lifeGainPlus ?? 0) + Number(plusLife[1]);
      continue;
    }
    const floor = /^Damage that would reduce your life total to less than (\d+) reduces it to \1 instead\.$/.exec(line);
    if (floor) {
      out.lifeFloor = Number(floor[1]);
      continue;
    }
    if (line === "Room abilities of dungeons you own trigger an additional time.") {
      out.roomsTwice = true;
      continue;
    }
    if (line === "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.") {
      out.drawTwoInstead = true;
      continue;
    }
    // "You have protection from each of your opponents" (CR 702.16k): their spells and abilities can't target you, their
    // Auras can't enchant you, and damage from their sources is prevented.
    const youHave = /^You have (hexproof|shroud|protection from each of your opponents)\.$/.exec(line);
    if (youHave && !out.youHave) {
      out.youHave = youHave[1]!.startsWith("protection") ? "protection" : (youHave[1] as "hexproof" | "shroud");
      continue;
    }
    if (line === "If ~ is in your opening hand, you may begin the game with it on the battlefield.") {
      out.beginOnBattlefield = true;
      continue;
    }
    // Torpor Orb, Hushwing Gryff, Doorkeeper Thrull, Elesh Norn, Mother of Machines.
    const lock = /^(Creatures|Artifacts and creatures|Permanents) entering(?: the battlefield)? don't cause abilities( of permanents your opponents control)? to trigger\.$/.exec(line);
    if (lock) {
      out.enterLock = { ...(lock[1] === "Creatures" ? { types: ["Creature"] } : lock[1] === "Artifacts and creatures" ? { types: ["Artifact", "Creature"] } : {}), ...(lock[2] ? { opponents: true as const } : {}) };
      continue;
    }
    if (line === "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.") {
      out.payWUBRG = true;
      continue;
    }
    const equipLess = /^Equip abilities you activate( of other Equipment| that target ~)? cost \{(\d+)\} less to activate\.$/.exec(line);
    if (equipLess) {
      (out.equipLess ??= []).push({ n: Number(equipLess[2]), ...(equipLess[1] === " that target ~" ? { targetSelf: true as const } : equipLess[1] ? { otherEquipment: true as const } : {}) });
      continue;
    }
    const lockEnd = /^You can't (lose|win) the game and your opponents can't (win|lose) the game\.$/.exec(line);
    if (lockEnd && lockEnd[1] !== lockEnd[2]) {
      if (lockEnd[1] === "lose") [out.cantLose, out.cantWin] = ["you", "opponents"];
      else [out.cantWin, out.cantLose] = ["you", "opponents"];
      continue;
    }
    // Cascade for the spells you cast (CR 702.85a): "Sliver spells you cast have cascade", "Instant and sorcery spells you
    // cast from your hand have cascade", "The first spell you cast each turn has cascade" (Maelstrom Nexus).
    const giveCascade = /^(?:(.+?) )?[Ss]pells you cast( from your hand)?( with mana value \d+ or (?:greater|less))? have cascade\.$/.exec(line);
    const firstCascade = /^The first spell you cast (from exile )?each turn( that mana from a Treasure was spent to cast)? has cascade\.$/.exec(line);
    if (giveCascade || firstCascade) {
      let filter: TargetSpec | undefined;
      if (giveCascade && (giveCascade[1] || giveCascade[3])) {
        const words = (giveCascade[1] ?? "").replace(/ and /g, " or ").replace(/^./, (c) => c.toLowerCase());
        const f = parseTargetPhrase(`${words ? `${words} ` : ""}spell${giveCascade[3] ?? ""}`);
        if (f?.kind !== "spell") {
          out.unsupported.push(raw);
          continue;
        }
        filter = f;
      }
      const from = giveCascade?.[2] ? "hand" : firstCascade?.[1] ? "exile" : undefined;
      (out.spellsHaveCascade ??= []).push({ ...(filter ? { filter } : {}), ...(from ? { from } : {}), ...(firstCascade ? { first: true as const } : {}), ...(firstCascade?.[2] ? { treasure: true as const } : {}), text: line });
      continue;
    }
    // Shadow the Hedgehog (after its flavor word, CR 207.2d): spells its controller casts get split second (CR 702.61a).
    if (/^(?:[A-Z][A-Za-z' ]* — )?Each spell you cast has split second if mana from an artifact was spent to cast it\.$/.test(line)) {
      out.splitSecondIfArtifactMana = true;
      continue;
    }
    if (/^You have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = true;
      continue;
    }
    // Pilots: "~ saddles Mounts and crews Vehicles as though its power were 2 greater", "... using its toughness rather
    // than its power" (CR 702.122a, 702.171a).
    const crewsAs = /^~ (saddles Mounts and )?crews Vehicles (?:as though its power were (\d+) greater|using its toughness rather than its power)\.$/.exec(line);
    if (crewsAs && !out.crewsAs) {
      out.crewsAs = { ...(crewsAs[2] ? { n: Number(crewsAs[2]) } : { toughness: true as const }), saddles: !!crewsAs[1] };
      continue;
    }
    const flashFor = /^You may cast (.*?)spells as though they had flash\.$/.exec(line);
    if (flashFor) {
      const spec = parseTargetPhrase(`${flashFor[1]}spell`);
      if (spec?.kind === "spell" && !spec.controller) {
        (out.flashFor ??= []).push({ ...spec, text: `${flashFor[1]}spells` });
        continue;
      }
    }
    if (line === "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield instead of putting it into your graveyard.") {
      out.discardedToBattlefield = true;
      continue;
    }
    // Prototype (CR 702.160a, 718): cast it with the alternative mana cost, color, power and toughness (see prototypedDef).
    const proto = /^Prototype ((?:\{[^}]+\})+) — (\d+)\/(\d+)$/.exec(line);
    if (proto && parseManaCost(proto[1]!).supported && !parseManaCost(proto[1]!).hasX) {
      (out.altCosts ??= []).push({ kind: "prototype", mana: proto[1]! });
      continue;
    }
    if (line === "Skip your draw step.") {
      out.skipDrawStep = true;
      continue;
    }
    // Teamwork N: "As an additional cost to cast this spell, you may tap any number of creatures you control with total
    // power N or more." (The keyword's reminder text is all the rules there are for it.)
    const teamwork = /^Teamwork (\d+)$/.exec(line);
    if (teamwork && !d.types.includes("Land") && out.teamwork === undefined) {
      out.teamwork = Number(teamwork[1]);
      continue;
    }
    if (line === "You may cast ~ as though it had flash if it's cast using teamwork." && out.teamwork !== undefined) {
      out.teamworkFlash = true;
      continue;
    }
    // Conspire (CR 702.78a): an optional additional cost, and "When you cast this spell, if its conspire cost was paid,
    // copy it. If the spell has any targets, you may choose new targets for the copy." Two instances (702.78b) aren't modeled.
    if (line === "Conspire" && isSpell && !out.conspire) {
      out.conspire = true;
      out.triggers.push({ event: "selfCast", ifConspired: true, body: { targets: [], effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "Conspire: copy ~. You may choose new targets for the copy." } });
      continue;
    }
    // Gift (CR 702.174): "As an additional cost to cast this spell, you may choose an opponent", and what they get if you
    // do: first thing as an instant or sorcery resolves (702.174j), or "when this permanent enters, if its gift cost was
    // paid" (702.174b).
    const gift = /^Gift (a card|a Food|a tapped Fish|an extra turn|a Treasure|an Octopus)$/.exec(line);
    if (gift && !out.gift) {
      out.gift = giftOf(gift[1]!);
      if (!isSpell) out.triggers.push({ event: "selfEnters", ifGift: true, body: { targets: [], effects: out.gift.effects, text: `Gift ${gift[1]}: the chosen player ${giftText(gift[1]!)}.` } });
      continue;
    }
    // Hideaway N (CR 702.75a): "When this permanent enters, look at the top N cards of your library. Exile one of them
    // face down and put the rest on the bottom of your library in a random order." "Hideaway 3, hideaway 3": each one.
    const hideaway = /^Hideaway (\d+)((?:, hideaway \d+)*)$/.exec(line);
    if (hideaway) {
      for (const n of [hideaway[1]!, ...[...hideaway[2]!.matchAll(/\d+/g)].map((x) => x[0])].map(Number))
        out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "hideaway", n }], text: `Hideaway ${n}: look at the top ${n} cards of your library, exile one of them face down, then put the rest on the bottom of your library in a random order.` } });
      continue;
    }
    // Tribute N (CR 702.104a): "As this creature enters, choose an opponent. That player may put an additional N +1/+1
    // counters on it as it enters." Each instance would work separately: one is modeled.
    const tribute = /^Tribute (\d+)$/.exec(line);
    if (tribute && d.types.includes("Creature") && out.tribute === undefined) {
      out.tribute = Number(tribute[1]);
      out.entersOptions = [...(out.entersOptions ?? []), "tribute"];
      continue;
    }
    // Haunt (CR 702.55a): on a permanent, "When this permanent is put into a graveyard from the battlefield, exile it
    // haunting target creature"; on an instant or sorcery, "When this spell is put into a graveyard during its
    // resolution, exile it haunting target creature."
    if (line === "Haunt") {
      const permanent = !isSpell;
      out.triggers.push({
        event: permanent ? "selfToGraveyard" : "selfResolvedToGraveyard",
        body: {
          targets: [{ kind: "object", types: ["Creature"], text: "target creature" }],
          effects: [{ type: "haunt" }],
          text: `Haunt: when ~ is put into a graveyard ${permanent ? "from the battlefield" : "during its resolution"}, exile it haunting target creature.`,
        },
      });
      continue;
    }
    // Cipher (CR 702.99a): the spell's last instruction, "you may exile this card encoded on a creature you control".
    if (line === "Cipher" && isSpell) {
      cipher = true;
      continue;
    }
    if (line === "Bargain") {
      out.bargain = true; // CR 702.166a
      continue;
    }
    const cheaper = /^~ costs \{(\d+)\} less to cast if it's bargained\.$/.exec(line);
    if (cheaper && /(?:^|\n)Bargain(?: \(|$|\n)/m.test(d.oracleText ?? "")) {
      out.bargainReduction = Number(cheaper[1]);
      continue;
    }
    if (line === "You may choose not to untap ~ during your untap step.") {
      out.mayNotUntap = true; // CR 502.3
      continue;
    }
    // The Phantom creatures' prevention shield (CR 615): see dealDamage.
    if (line === "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~.") {
      out.phantom = true;
      continue;
    }
    if (line === "Cast ~ only if you've cast another spell this turn.") {
      out.castOnlyAfterAnother = true;
      continue;
    }
    // "Cast this spell only during combat", "... only during your end step", "... only during the declare attackers step
    // and only if you've been attacked this step" (CR 506.8, 601.3).
    const castOnly = /^Cast ~ only ((?:during|if|before|after) [^.]+)\.$/.exec(line);
    if (castOnly) {
      const clauses = parseOnlyClauses(castOnly[1]!);
      if (!clauses?.cond || clauses.once || clauses.sorcery || out.castOnly) out.unsupported.push(raw);
      else out.castOnly = clauses.cond;
      continue;
    }
    if (/^~ can't be countered\.$/.test(line)) {
      out.cantBeCountered = true;
      continue;
    }
    // "Creature spells you control can't be countered." "Creature spells can't be countered." (CR 101.2)
    const uncounterable = /^(.*?)[Ss]pells( you control)? can't be countered\.$/.exec(line);
    if (uncounterable && !/\b(this turn|by)\b/.test(line)) {
      const words = uncounterable[1]!.trim().toLowerCase();
      const filter = words ? parseTargetPhrase(`${words} spell`) : { kind: "spell" as const, text: "spell" };
      if (filter?.kind === "spell" && !filter.controller) (out.uncounterable ??= []).push({ filter: { ...filter, text: `${words ? `${words} ` : ""}spells` }, ...(uncounterable[2] ? {} : { anyone: true as const }) });
      else out.unsupported.push(raw);
      continue;
    }
    if (line === "Your opponents can't cast spells during your turn.") {
      out.opponentsCantCastYourTurn = true;
      continue;
    }
    // "~ has flash as long as you've committed a crime this turn" (Take for a Ride), "You may cast ~ as though it had
    // flash if you control a Human" (Bard's Company), "Spell mastery — If there are two or more instant and/or sorcery
    // cards in your graveyard, you may cast ~ as though it had flash": whether it can be cast at instant speed now (CR
    // 702.8a, 601.3). Only conditions about the player, which hold the same with the card in hand; on a permanent that
    // "has flash", the keyword itself would matter on the battlefield too, so those stay out unless it's a spell.
    const flashIf =
      /^~ has flash as long as (.+)\.$/.exec(line) ??
      /^You may cast ~ as though it had flash if (.+)\.$/.exec(line) ??
      /^(?:(?:Ferocious|Spell mastery) — )?(?:If|As long as) (.+), you may cast ~ as though it had flash\.$/.exec(line);
    if (flashIf && !/^you pay \{/.test(flashIf[1]!)) {
      const cond = parseStaticCondition(flashIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      // "This spell has flash" is only while it's a spell; "Colossal Rattlewurm has flash" is on the battlefield too.
      const permanentHas = /^~ has flash/.test(line) && !/(^|\n)This spell has flash /.test(d.oracleText ?? "") && !d.types.includes("Instant") && !d.types.includes("Sorcery");
      const aboutPlayer = !!cond && FLASH_IF.includes(cond.kind) && !(cond.kind === "control" && (cond.other || cond.who === "defending"));
      if (!aboutPlayer || permanentHas || out.flashIf) out.unsupported.push(raw);
      else out.flashIf = cond!;
      continue;
    }
    // Rout: "You may cast ~ as though it had flash if you pay {2} more to cast it." Paying more is the price of casting it
    // any time a sorcery couldn't have been cast (see spellCost).
    const flashCost = /^You may cast ~ as though it had flash if you pay \{(\d+)\} more to cast it\.$/.exec(line);
    if (flashCost) {
      out.flashCost = Number(flashCost[1]);
      continue;
    }
    // "~ enters with a number of +1/+1 counters on it equal to ..." is "with X ... counters on it, where X is ...".
    const aNumber = new RegExp(`^(?:Undergrowth — )?~ enters(?: the battlefield)? with a number of ${COUNTER} counters on (?:it|him|her) equal to (.+)\\.$`).exec(line);
    // "The amount of mana spent to cast it" (Marath): the spell it was, only as it enters from the stack.
    if (aNumber && /^the amount of mana spent to cast (?:it|~)$/.test(aNumber[2]!)) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: counterKind(aNumber[1]!), n: { count: { kind: "manaSpent" } } };
      continue;
    }
    if (aNumber) line = `~ enters with X ${aNumber[1]} counters on it, where X is ${aNumber[2]}.`;
    const ewc = new RegExp(`^(?:(?:Raid|Morbid|Revolt) — )?~ enters(?: the battlefield)?( tapped)? with ${NUMX} ${COUNTER} counters? on it(?: for each (.+?)|, where X is (.+?)| if (.+?))?\\.$`).exec(line);
    if (ewc) {
      // "With a +1/+1 counter on it for each ...", "with X +1/+1 counters, where X is ...": counted as it enters.
      // "~ enters tapped with three stun counters on it." "... if you attacked this turn" (raid), "... if a creature
      // died this turn" (morbid), "... if you cast it from your hand": checked as it enters.
      const [, tapped, count, kind, each, where, ifText] = ewc;
      const fromHand = ifText === "you cast it from your hand";
      const cond = ifText && !fromHand ? parseStaticCondition(ifText, { affects: { kind: "self" }, mods: [], text: "" }) : undefined;
      const per = each ? parseCount(each, null, true) : null;
      const def = where ? parseCount(where, null) : null;
      const n = per ? scaleAmount(amt(count!), per) : def ? substituteX(amt(count!), def) : amt(count!);
      if ((each && !per) || (where && !def) || cond === null || !n || out.entersWithCounters) out.unsupported.push(raw);
      else {
        out.entersWithCounters = { counter: counterKind(kind!), n, ...(cond ? { if: cond } : {}), ...(fromHand ? { castFromHand: true as const } : {}) };
        if (tapped) out.entersTapped = true;
      }
      continue;
    }
    const enchant = /^Enchant (.+)$/.exec(line);
    if (enchant) {
      const spec = parseTargetPhrase(enchant[1]!);
      if (spec?.kind === "object" && !out.enchant) out.enchant = { ...spec, text: `${spec.text.replace(/^target /, "")} to enchant` };
      // "Enchant player", "Enchant opponent" (CR 702.5d): the Aura spell targets a player, and it's attached to one.
      else if (/^(player|opponent)$/.test(enchant[1]!) && !out.enchant) out.enchant = { kind: "player", ...(enchant[1] === "opponent" ? { opponent: true } : {}), text: `${enchant[1]} to enchant` };
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
        equip: true,
      });
      continue;
    }
    // "Equip legendary creature {3}", "Equip Knight {1}", "Equip commander {3}" (CR 702.6c): only a creature you control
    // with that quality; "Equip—Pay 3 life.", "Equip—Sacrifice a creature." (a cost that isn't mana, CR 702.6a).
    const equipQ = /^Equip (?!planeswalker\b)((?:[A-Za-z]+,? (?:or )?)*?[A-Za-z]+) ((?:\{[^}]+\})+)$/.exec(line);
    const equipCost = /^Equip—(.+?)\.( Activate only once each turn\.)?$/.exec(line);
    // "Equip—Pay {3} or discard a card." (Bloodthorn Flail): one equip ability with a choice of costs, made as it's
    // activated (CR 602.2b, 601.2b). It's compiled as one equip ability per cost, which is the same choice from the menu.
    const equipOr = equipCost && !equipCost[2] ? /^Pay ((?:\{[^}]+\})+) or (discard (?:a|one) card)$/.exec(equipCost[1]!) : null;
    if (equipOr && d.subtypes.includes("Equipment")) {
      const acts = [equipOr[1]!, "Discard a card"].map((c) => parseActivated(`${c}: Attach ~ to target creature you control. Activate only as a sorcery.`));
      if (acts.some((a) => !a || a === "fail")) out.unsupported.push(raw);
      else acts.forEach((a, i) => out.activated.push({ ...(a as ActivatedAbility), text: i === 0 ? `Equip—Pay ${equipOr[1]!}.` : "Equip—Discard a card.", equip: true }));
      continue;
    }
    if ((equipQ || equipCost) && d.subtypes.includes("Equipment")) {
      const q = equipQ?.[1];
      const what = !q ? "creature" : /\bcreature\b/.test(q) ? q : q === "commander" ? "commander creature" : `${q} creature`;
      const act = parseActivated(`${equipQ ? equipQ[2] : equipCost![1]}: Attach ~ to target ${what} you control. Activate only as a sorcery${equipCost?.[2] ? " and only once each turn" : ""}.`);
      const target = act && act !== "fail" ? act.body.targets[0] : undefined;
      if (!act || act === "fail" || target?.kind !== "object" || !target.types?.includes("Creature")) out.unsupported.push(raw);
      else out.activated.push({ ...act, text: line, equip: true });
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
    // "Partner—Friends forever" and the other "partner—[text]" abilities only matter for deck building (CR 702.124i; see
    // commanderPairProblem).
    if (/^Partner—(?:Character select|Father & son|Friends forever|Survivors)$/.test(line)) continue;
    // Strive: "This spell costs {2}{G} more to cast for each target beyond the first" (CR 207.2c ability word).
    const strive = /^(?:Strive — )?(?:~|This spell) costs ((?:\{[^}]+\})+) more to cast for each target beyond the first\.$/.exec(line);
    if (strive && !out.strive) {
      out.strive = strive[1]!;
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
    // Thrumming Stone: "Spells you cast have ripple 4." Each spell's granted ripple triggers as it's cast (CR 702.60a),
    // like a "whenever you cast a spell" ability; spells cast by ripple trigger it too (rulings).
    const grantedRipple = /^Spells you cast have ripple (\d+)\.$/.exec(line);
    if (grantedRipple) {
      out.triggers.push({ event: "castSpell", cast: { by: "you", spell: { kind: "spell", text: "spell" } }, body: rippleBody(Number(grantedRipple[1]), "cause") });
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
    // "When you cast or cycle ~, ...", "When you cycle ~ and when ~ dies, ...", "Whenever ~ enters or attacks, ...",
    // "When ~ enters or dies, ...": one ability that triggers on either event, which works like two with the same
    // effect (CR 702.29c). The text is read for each event ("it" after it died is the card).
    const twice =
      /^When you cast or cycle ~, (.+)$/.exec(line) ??
      /^When you cycle ~ and when ~ dies, (.+)$/.exec(line) ??
      /^When(?:ever)? ~ enters or (attacks|dies|leaves the battlefield|the creature it haunts dies), (.+)$/.exec(line) ??
      /^When ~ enters and whenever it (attacks while saddled), (.+)$/.exec(line);
    if (twice && !/\bonly once\b/.test(line)) {
      const effect = twice[twice.length - 1]!;
      const events = /^When you cast/.test(line)
        ? [`When you cast ~, ${effect}`, `When you cycle ~, ${effect}`]
        : /^When you cycle/.test(line)
          ? [`When ~ dies, ${effect}`, `When you cycle ~, ${effect}`]
          : twice[1] === "the creature it haunts dies"
            ? [`When ~ enters, ${effect}`, `When the creature ~ haunts dies, ${effect}`]
            : [`When ~ enters, ${effect}`, `${/^attacks/.test(twice[1]!) ? "Whenever" : "When"} ~ ${twice[1]}, ${effect}`];
      const both = events.map((l) => parseTrigger(l));
      if (both.some((t) => !t || t === "fail")) out.unsupported.push(raw);
      else for (const t of both) out.triggers.push(bindThisAbility(t as TriggeredAbility, line));
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
  if (paws) {
    const modes = paws.texts.map((t) => parseBody(t, { spell: true }));
    // Every mode has to work, and nothing else may be in the spell's text (it would be outside the modes).
    if (spellLines.length || paws.costs.length < 2 || spree || ascendSpell || modes.some((m) => !m)) out.unsupported.push(...paws.lines, ...spellLines);
    else out.spell = { targets: [], effects: [], text: paws.lines.join(" "), modal: { min: 0, max: paws.budget, modes: modes as AbilityBody[], pawprints: paws.costs, repeat: true } };
  } else if (spree) {
    const modes = spree.texts.map((t) => parseBody(t, { spell: true }));
    // Every mode has to work, and nothing else may be in the spell's text (it would be outside the modes).
    if (spellLines.length || spree.costs.length < 2 || ascendSpell || modes.some((m) => !m)) out.unsupported.push(...spree.lines, ...spellLines);
    else out.spell = { targets: [], effects: [], text: spree.lines.join(" "), modal: { min: 1, max: modes.length, modes: modes as AbilityBody[], costs: spree.costs } };
  } else if (isSpell) {
    // "Choose one — • Destroy all creatures. • Destroy all planeswalkers." then "Then return a creature ... card from your
    // graveyard to the battlefield ..." (Blood on the Snow): the paragraph after the modes is done whichever mode was
    // chosen, after it (CR 700.2, 608.2c). With one mode chosen, that's the same as the end of each mode.
    const tail = spellLines.length > 1 && spellLines[0]!.includes("•") && !spellLines.slice(1).some((l) => l.includes("•")) ? spellLines.slice(1).join(" ") : undefined;
    const body = tail !== undefined ? modesThen(spellLines[0]!, tail) : spellLines.length ? parseBody(spellLines.join(" "), { spell: true }) : null;
    if (body && ascendSpell && body.modal) out.unsupported.push("Ascend"); // before the modes: not modeled
    else if (body) out.spell = ascendSpell ? { ...body, effects: [{ type: "ascend" }, ...body.effects] } : body;
    else out.unsupported.push(...spellLines);
  }
  if (repeat) {
    const modal = out.spell?.modal;
    if (modal && !modal.costs && !modal.pawprints && modal.min === modal.max && modal.min > 1) modal.repeat = true;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("You may choose the same mode more than once.");
    }
  }
  if (escalate && escalate !== "fail") {
    // A "Choose one or more" (or "one or both") list without other mode costs.
    const modal = out.spell?.modal;
    const { raw, ...esc } = escalate;
    if (modal && modal.min === 1 && modal.max > 1 && !modal.costs && !modal.pawprints && !modal.repeat) modal.escalate = esc;
    else out.unsupported.push(raw);
  }
  if (both === "kicked") {
    // "Choose any number instead" when kicked: a "Choose one —" list, and a kicker to pay (one kicker cost).
    const modal = out.spell?.modal;
    if (modal && modal.min === 1 && modal.max === 1 && out.kicker?.costs.length === 1 && !out.kicker.multi) modal.both = both;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Choose one. If ~ was kicked, choose any number instead.");
    }
  } else if (both) {
    // Teamwork's "choose both" needs teamwork; either way, a list of exactly two modes.
    const modal = out.spell?.modal;
    if (modal && modal.min === 1 && modal.max === 1 && modal.modes.length === 2 && (both === "commander" || out.teamwork !== undefined)) modal.both = both;
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Choose one. If ... choose both instead.");
    }
  }
  if (cipher) {
    if (out.spell && !out.spell.modal) out.spell = { ...out.spell, effects: [...out.spell.effects, { type: "cipher" }] };
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Cipher (on a modal spell)");
    }
  }
  // Awaken (CR 702.113a-b): "If this spell's awaken cost was paid, put N +1/+1 counters on target land you control. That
  // land becomes a 0/0 Elemental creature with haste. It's still a land." That target only when it's awakened.
  if (awaken) {
    if (out.spell && !out.spell.modal) {
      const i = out.spell.targets.length;
      const land = { ref: "target", index: i } as const;
      const awakened: Effect[] = [
        { type: "counters", what: land, counter: "+1/+1", n: awaken.n },
        { type: "continuous", what: land, mods: [{ kind: "addTypes", types: ["Creature"], subtypes: ["Elemental"] }, { kind: "setPT", power: 0, toughness: 0 }, { kind: "addKeywords", keywords: ["Haste"] }], duration: "game" },
      ];
      out.spell = {
        ...out.spell,
        targets: [...out.spell.targets, { kind: "object", types: ["Land"], controller: "you", text: "target land you control", onlyIf: { cond: { kind: "altPaid", alt: "awaken" } } }],
        effects: [...out.spell.effects, { type: "if", cond: { kind: "altPaid", alt: "awaken" }, effects: awakened }],
        text: `${out.spell.text} Awaken ${awaken.n}.`,
      };
    } else {
      delete out.spell;
      out.unsupported.push(awaken.raw);
    }
  }
  // A spell's gift happens before any of its other instructions (CR 702.174j).
  if (out.gift && isSpell) {
    if (out.spell && !out.spell.modal) out.spell = { ...out.spell, effects: [{ type: "if", cond: { kind: "gift" }, effects: out.gift.effects }, ...out.spell.effects] };
    else if (out.spell) {
      delete out.spell;
      out.unsupported.push("Gift (on a modal spell)");
    }
  }
  if (entwine) {
    const modal = out.spell?.modal;
    if (modal && !modal.costs && modal.max < modal.modes.length) modal.entwine = entwine.cost;
    else out.unsupported.push(entwine.raw);
  }
  if (striated && striated !== "fail") {
    const empty = compile({ ...d, oracleText: "", keywords: [] });
    for (const part of striated.parts)
      if (!addStriation(part, out, (line) => compile({ ...d, oracleText: line, keywords: [] }), empty)) out.unsupported.push(part.header, ...part.lines);
    // A keyword printed outside the striations too is the card's own.
    const own = new Set(lines.flatMap((l) => simpleKeywords(l.trim()) ?? []).map((k) => k.toLowerCase()));
    if (out.striatedKeywords) out.striatedKeywords = out.striatedKeywords.filter((k) => !own.has(k.toLowerCase()));
  }
  checkX(d, out);
  // Both pay with the same chosen cards: a discard for jump-start on top of a discard the spell asks for isn't modeled.
  const kinds = (costs: AdditionalCost[] = []) => costs.map((c) => c.kind);
  if (out.fromGraveyard?.some((g) => kinds(g.costs).some((k) => kinds(out.additionalCosts).includes(k)))) out.unsupported.push("graveyard cast with a cost like its additional cost");
  if (out.escapesWith && !out.fromGraveyard?.some((g) => g.kind === "escape")) out.unsupported.push("escapes with counters");
  checkCastingLinks(out);
  // Overload (CR 702.96a-b): cast for that cost, the spell's text says "each" for "target", and it has no targets.
  const overload = out.altCosts?.find((a) => a.kind === "overload");
  if (overload && !d.oracleId.endsWith("|overloaded")) {
    const v = compileCard({ ...d, oracleId: `${d.oracleId}|overloaded`, oracleText: overloadedText(d.oracleText) });
    const targets = (b?: AbilityBody) => !!b && (b.targets.length > 0 || !!b.modal?.modes.some((m) => m.targets.length));
    if (!out.spell || v.unsupported.length || !v.spell || targets(v.spell)) out.unsupported.push(`Overload ${overload.mana}`);
  }
  linkExile(out);
  // An Aura put onto the battlefield needs a choice of what it enchants (CR 303.4f), which isn't modeled.
  if (d.subtypes.includes("Aura") && out.activated.some((ab) => ab.zone === "graveyard" && ab.body.effects.some((e) => e.type === "putOntoBattlefield"))) out.unsupported.push("(an Aura returning itself to the battlefield)");
  const json = JSON.stringify(out);
  if (json.includes('"thisAbility":true')) out.unsupported.push("(a copy effect's \"this ability\" outside a triggered or activated ability)");
  if (out.sunburst || json.includes('"kind":"colorsSpent"')) out.countsColors = true;
  const wanted = wantedSpent(out);
  if (wanted.length) out.wantSpent = wanted;
  if (/"kind":"snowSpent"|"snow(?:OfColors)?":/.test(JSON.stringify([out.spell, out.entersWithCounters, out.triggers.filter((t) => t.event === "selfEnters")]))) out.wantSnow = true;
  return out;
}

/**
 * What this card's own text hopes was spent to cast it (CR 601.2h): "if {U} was spent to cast ~", adamant's "at least three
 * white mana", "sacrifice it unless {U} was spent to cast it". Not "no mana" (paying can't do that), nor Nix's target's
 * or a cast trigger's spell.
 */
function wantedSpent(out: CompiledCard): SpentReq[] {
  const reqs: SpentReq[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as { kind?: string; req?: SpentReq; target?: number };
    if ((o.kind === "spent" && o.target === undefined) || o.kind === "spentWas") reqs.push(o.req!);
    Object.values(v).forEach(visit);
  };
  visit(out.spell);
  visit(out.entersWithCounters);
  for (const t of out.triggers) if (t.event === "selfEnters") {
    if (t.ifSpent) reqs.push(t.ifSpent);
    visit(t.body);
  }
  const seen = new Set<string>();
  return reqs.filter((r) => !r.none && (r.colors || r.sameColor) && !seen.has(JSON.stringify(r)) && seen.add(JSON.stringify(r)));
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
    .filter((e): e is Extract<Effect, { type: "exile" | "takeFromHand" | "hideaway" }> => (e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway") && !("until" in e && e.until));
  if (exiles.length !== 1 || returns.length !== 1 || returns[0]!.event !== "selfLeaves") {
    out.unsupported.push("(returns exiled cards it can't link to one exile ability)");
    return;
  }
  const ex = exiles[0]!;
  if (ex.type !== "hideaway") ex.linked = true; // hideaway's exile is always linked
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
    if ((o.ref === "sacrificed" || o.kind === "sacrificedSuspected") && !canSac) bad = true;
    // "The chosen type" needs something that chooses one: "as ~ enters, choose" or "choose a creature type" before it.
    if (typeof o.chosen === "string") (/olor/.test(o.chosen) ? needs.add("color") : needs.add("creatureType"));
    if (o.kind === "chosenColor" || (o.kind === "setColors" && o.chosen)) needs.add("color");
    if (o.kind === "setLandTypes" && (o.subtypes as string[]).includes(CHOSEN_LAND_TYPE)) needs.add("basicLandType");
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_PROTECTION)) needs.add("color");
    if (o.kind === "addKeywords" && (o.keywords as string[]).includes(CHOSEN_PLAYER_PROTECTION) && !out.entersChoosePlayer) bad = true;
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
  // "If evidence was collected" needs the "you may collect evidence N" it's linked to (CR 701.59c): in the spell, or its
  // permanent's enters trigger.
  const evidenceIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"evidence"');
  if ((evidenceIn(out.spell) || out.triggers.some((t) => t.ifEvidence || evidenceIn(t.body))) && out.evidence === undefined) bad = true;
  if (out.triggers.some((t) => t.event !== "selfEnters" && evidenceIn(t.body)) || evidenceIn(out.activated) || evidenceIn(out.statics)) bad = true;
  // "If this spell's surge cost was paid" needs that alternative cost (CR 702.117a, 702.137a): in the spell, or its
  // permanent's enters trigger.
  for (const alt of ["surge", "spectacle"] as const) {
    const altIn = (v: unknown) => JSON.stringify(v ?? null).includes(`"kind":"altPaid","alt":"${alt}"`);
    const linked = !!out.altCosts?.some((a) => a.kind === alt);
    if ((altIn(out.spell) || out.triggers.some((t) => t.ifAlt === alt || altIn(t.body))) && !linked) bad = true;
    if (out.triggers.some((t) => t.event !== "selfEnters" && altIn(t.body)) || altIn(out.activated) || altIn(out.statics)) bad = true;
  }
  // The mana spent to cast a spell (CR 601.2h) is known for the spell, its permanent's enters trigger, and a cast trigger's
  // spell; Nix's is its target's.
  const spentIn = (v: unknown): boolean => Array.isArray(v) ? v.some(spentIn) : !!v && typeof v === "object" && ((v as { kind?: string; target?: number }).kind === "spent" && (v as { target?: number }).target === undefined ? true : Object.values(v).some(spentIn));
  if (out.triggers.some((t) => t.event !== "selfEnters" && t.event !== "castSpell" && spentIn(t.body)) || spentIn(out.statics) || spentIn(out.activated)) bad = true;
  // Mana from Treasures spent (CR 106.3) is known for a spell, its permanent's enters trigger, and an activated ability.
  const treasureIn = (v: unknown) => /"kind":"treasure(?:Spent)?"/.test(JSON.stringify(v ?? null));
  if (out.triggers.some((t) => t.event !== "selfEnters" && treasureIn(t.body)) || treasureIn(out.statics) || JSON.stringify(out.activated ?? null).includes('"kind":"treasureSpent"')) bad = true;
  // Mana from snow sources spent (CR 107.4h): a spell's or its permanent's enters trigger's; Boreal Outrider's "of that
  // spell's colors" only in a cast trigger's condition.
  const snowIn = (v: unknown) => JSON.stringify(v ?? null).includes('"kind":"snowSpent"');
  if (out.triggers.some((t) => t.event !== "selfEnters" && snowIn(t.body)) || snowIn(out.statics) || snowIn(out.activated)) bad = true;
  if (JSON.stringify([out.spell, out.triggers.map((t) => ({ ...t, cast: undefined })), out.statics, out.activated, out.entersWithCounters]).includes('"snowOfColors"')) bad = true;
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
  // Or in an additional cost: "As an additional cost to cast this spell, pay X life" (CR 107.3a).
  const cardX = parseManaCost(d.manaCost).hasX || !!out.additionalCosts?.some((c) => "x" in c && c.x);
  const bad = (what: string) => out.unsupported.push(what);
  if (out.spell && usesX(out.spell) && !cardX) {
    bad(out.spell.text);
    delete out.spell;
  }
  if (out.entersWithCounters && usesX(out.entersWithCounters) && !cardX) {
    bad("enters with X counters");
    delete out.entersWithCounters;
  }
  // "Monstrosity X" (CR 701.37c): "when ~ becomes monstrous" abilities use the X it became monstrous with.
  const monstrousX = out.activated.some((a) => allEffects(a.body.effects).some((e) => e.type === "monstrosity" && usesX(e.n)));
  out.triggers = out.triggers.filter((tr) => {
    if (!usesX(tr.body) || (tr.event === "selfEnters" && cardX) || (tr.event === "selfBecomesMonstrous" && monstrousX)) return true;
    bad(tr.body.text);
    return false;
  });
  if (out.costLess && usesX(out.costLess)) {
    bad("costs {X} less");
    delete out.costLess;
  }
  // Spliced, only the card's rules text is added (CR 702.47c): a plain spell, with nothing that depends on how this card
  // itself was cast, and no X (the spell it's spliced onto has its own).
  if (out.splice && (!out.spell || out.spell.modal || usesX(out.spell) || out.kicker || out.altCosts || out.buyback !== undefined || out.fromGraveyard)) {
    bad(`Splice onto ${out.splice.onto === "Arcane" ? "Arcane" : "instant or sorcery"} ${out.splice.mana}`);
    delete out.splice;
  }
}

/** What a gift gives (CR 702.174d-i), done for the opponent it was promised to. */
function giftOf(what: string): NonNullable<CompiledCard["gift"]> {
  const who = { ref: "giftee" } as const;
  const effects: Effect[] =
    what === "a card"
      ? [{ type: "draw", who, n: 1 }]
      : what === "an extra turn"
        ? [{ type: "extraTurn", who, n: 1 }]
        : what === "a tapped Fish"
          ? [{ type: "createToken", who, n: 1, tapped: true, token: { name: "Fish", power: 1, toughness: 1, colors: ["U"], types: ["Creature"], subtypes: ["Fish"], keywords: [] } }]
          : what === "an Octopus"
            ? [{ type: "createToken", who, n: 1, token: { name: "Octopus", power: 8, toughness: 8, colors: ["U"], types: ["Creature"], subtypes: ["Octopus"], keywords: [] } }]
            : [{ type: "createToken", who, n: 1, token: PREDEFINED_TOKENS[what === "a Food" ? "Food" : "Treasure"]! }];
  return { what, effects };
}

const giftText = (what: string) =>
  what === "a card" ? "draws a card" : what === "an extra turn" ? "takes an extra turn after this one" : what === "a tapped Fish" ? "creates a tapped 1/1 blue Fish creature token" : what === "an Octopus" ? "creates an 8/8 blue Octopus creature token" : `creates ${what} token`;

/** A "choose one" spell's modes, each followed by the same paragraph (see the isSpell case of compileCard). */
function modesThen(modesLine: string, tail: string): AbilityBody | null {
  const body = parseBody(modesLine, { spell: true });
  const then = parseBody(tail, { spell: true });
  if (!body?.modal || body.modal.max !== 1 || body.modal.repeat || !then || then.modal || then.targets.length || body.effects.length || body.targets.length) return null;
  return { ...body, text: `${body.text} ${then.text}`, modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, effects: [...m.effects, ...structuredClone(then.effects)], text: `${m.text} ${then.text}` })) } };
}

/**
 * A modal ability is a "choose ... —" line followed by one line per mode, each starting
 * with a bullet (CR 700.2). Join them into one line so the ability is compiled as a whole.
 */
function joinModes(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    // "..., choose one that hasn't been chosen this turn." followed by bullets (Lita): the same as with a dash.
    const dotted = prev !== undefined && /\bchoose one(?: that hasn't been chosen(?: this turn)?| at random)?\.$/i.test(prev);
    if (/^\s*•/.test(line) && prev !== undefined && dotted) out[out.length - 1] = `${prev.replace(/\.$/, " —")} ${line.trim()}`;
    else if (/^\s*•/.test(line) && prev !== undefined && /—\s*(•.*)?$/.test(prev)) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out;
}

/**
 * "Sacrifice a creature or pay {3}{B}", "pay 5 life or pay {2}", "sacrifice a creature, discard a card, or pay 3 life":
 * a choice between additional costs (CR 601.2b). "Sacrifice an artifact or creature" is one cost, not a choice.
 */
function parseCostOr(text: string): CostOption[] | null {
  const parts = text.split(/,? or (?=(?:pay|sacrifice|discard|reveal|exile) )|, (?=(?:pay|sacrifice|discard|reveal|exile) )/);
  if (parts.length < 2) return null;
  const out: CostOption[] = [];
  for (const p of parts) {
    const mana = /^pay ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(p);
    const cost = mana ? null : parseAdditionalCost(p);
    if (mana) out.push({ mana: mana[1]!, text: p });
    else if (cost) out.push({ cost, text: p });
    else return null;
  }
  return out;
}

/**
 * "You may play lands from the top of your library", "you may play lands and cast spells from the top of your library",
 * "you may cast creature spells from the top of your library", "you may cast Angel spells and Human spells ...", "once
 * each turn, you may cast an instant or sorcery spell from the top of your library": at their usual timing, a land still
 * using the turn's land play (rulings on Courser of Kruphix, Future Sight and Johann). Undefined if it isn't one.
 */
export function parseFromTop(text: string): FromTop | null | undefined {
  // "You may play the top card of your library", "you may play cards from the top of your library": lands and spells.
  text = text.replace(/^(you may) play (?:the top card of your library|cards from the top of your library)$/i, "$1 play lands and cast spells from the top of your library");
  const m = /^(Once each turn, )?[Yy]ou may (play lands|play lands and cast (.+)|cast (.+)) from the top of your library$/.exec(text);
  if (!m) return undefined;
  const lands = !!m[2]!.startsWith("play lands");
  const what = m[3] ?? m[4];
  if (m[1] && (lands || !what)) return null; // only "once each turn, you may cast ..." is modeled
  if (!what) return { lands };
  if (what === "spells") return m[1] ? null : { lands, spells: "any" };
  // "Creature spells", "an instant or sorcery spell", "a creature spell with power 2 or less", "Angel spells and Human
  // spells", "spells with mana value 4 or greater": each kind as a card filter.
  const parts = what.split(/ spells and (?=\S+ spells$)/).map((x) => x.replace(/^an? /, ""));
  const spells: TargetSpec[] = [];
  for (const part of parts) {
    if (!/\bspells?\b/.test(part) && parts.length === 1) return null;
    // Realmwalker: "creature spells of the chosen type", the permanent's choice (see topPermission).
    const chosen = / of the chosen type$/.test(part);
    const kinds = part.replace(/ of the chosen type$/, "");
    const phrase = (/\bspells?\b/.test(kinds) ? kinds.replace(/\bspells?\b/, "card") : `${kinds} card`).replace(/ and /g, " or ").trim();
    const f = parseSearchFilter(phrase);
    if (!f) return null;
    spells.push(chosen ? { ...f, chosen: "type", text: `${f.text} of the chosen type` } : f);
  }
  return { lands, spells, ...(m[1] ? { once: true as const } : {}) };
}

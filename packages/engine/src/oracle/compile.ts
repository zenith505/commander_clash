import { faceDef, hasFuse, isRoom, restingDef, roomDoorDefs } from "../faces";
import { isMeldResult, meldPartnerName, meldResultDef } from "../meld-results";
import { allEffects } from "../abilities";
import type { FromTop, AbilityBody, Count, ChoiceKind, TriggeredAbility, CompiledCard, Effect, AdditionalCost, CostOption, TargetSpec, ActivatedAbility, StaticCondition, SpentReq } from "../abilities";
import { CHOSEN_LAND_TYPE, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION, stripReminder } from "../keywords";
import { parseManaCost } from "../mana";
import { substituteX } from "../amounts";
import { withModes, gateTargets, type CastHow } from "../modes";
import type { CardDef, PlayerId } from "../types";
import type { CopyExcept } from "../copies";
import { NUM, num, NUMX, COUNTER, counterKind, X, amt, parseSpentReq, plainMana, sacrificeSelf, SPENT, ROLL_ROW, COLOR_WORDS } from "./words";
import { parseManaAbility, parseManaTrigger } from "./mana-abilities";
import { parseGraveyardKeyword, parseCostKeyword, parseAdditionalCost, keywordAbilities, textKeywords, isKeywordLine, firebending, rippleBody } from "./keyword-abilities";
import { parseEntersCondition, parseEntersChoice, parseConditionalStatic, parseCostChange, parseStatic, parseStaticCondition, parseOnlyClauses } from "./statics";
import { parseTrigger } from "./triggers";
import { KEYWORD_WORDS, parseActivated, parseLoyalty, stripAbilityWord } from "./activated";
import { parseBody, usesX, scaleAmount } from "./body";
import { parseCount } from "./counts";
import { parseGroup, parseTargetPhrase } from "./targets";
import { backupTriggers } from "./grants";
import { dungeonTriggers } from "./dungeons";
import { parseCountMod, parseCopyExcept, PREDEFINED_TOKENS } from "./tokens";
import { parseCardNameChoice, parseSearchFilter } from "./search";
import { addStriation, simpleKeywords, striations } from "./striations";

const cache = new Map<string, CompiledCard>();

/** An overloaded spell's text (CR 702.96a): every instance of the word "target" is "each", except in the overload line. */
export const overloadedText = (text: string): string =>
  text
    .split("\n")
    .map((l) => (/^Overload\b/.test(l) ? l : l.replace(/\btarget\b/g, "each").replace(/\bTarget\b/g, "Each")))
    .join("\n");

export function compileCard(card: CardDef): CompiledCard {
  // A card with faces as it is in the card data: its resting characteristics, the ones it has in a game (CR 709.4, 712.8a).
  const d = restingDef(card);
  const hit = cache.get(d.oracleId);
  if (hit) return hit;
  const doors = d.roomDoors ? roomDoorDefs(d) : undefined;
  const out = doors ? roomAbilities(doors) : compile(d);
  // A meld card's ability melds it with its counterpart into their combined back face (CR 701.42a): only if what that
  // puts onto the battlefield is supported.
  if (d.meld && !isMeldResult(d) && /\bmeld them into\b/.test(d.oracleText) && !meldResultSupported(d.meld.result)) out.unsupported.push(`(${d.meld.result}, the permanent it melds into)`);
  if (d.oracleId === MONARCH.oracleId) out.triggers = MONARCH_TRIGGERS;
  if (d.oracleId === RING.oracleId) out.triggers = RING_TRIGGERS;
  if (d.oracleId === INITIATIVE.oracleId) out.triggers = INITIATIVE_TRIGGERS;
  const rooms = dungeonTriggers(d.oracleId);
  if (rooms) out.triggers = rooms;
  cache.set(d.oracleId, out);
  return out;
}

/**
 * A Room permanent's abilities: those in each unlocked door's text box (CR 709.5, rulings), left door first, so the
 * left door's triggered abilities keep their places as the right one unlocks.
 */
function roomAbilities(doors: CardDef[]): CompiledCard {
  const out: Record<string, unknown> = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  for (const c of doors.map((d) => compileCard(d)))
    for (const [k, v] of Object.entries(c)) {
      if (Array.isArray(v)) out[k] = [...((out[k] as unknown[] | undefined) ?? []), ...v];
      else if (v !== undefined && v !== false && (out[k] === undefined || out[k] === false)) out[k] = v;
    }
  return out as unknown as CompiledCard;
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

/**
 * Card types/subtypes whose rules we don't model yet, whatever their text says. Kindred is modeled (CR 308): cast and
 * resolved as its other card type, its subtypes creature types.
 */
const UNSUPPORTED_TYPES = ["Tribal", "Dungeon"];
const UNSUPPORTED_SUBTYPES: string[] = [];

const meldResults = new Map<string, boolean>();

/** Is the combined back face called `name` known (meld-results.ts) and supported, as a permanent on the battlefield? */
function meldResultSupported(name: string): boolean {
  const known = meldResults.get(name);
  if (known !== undefined) return known;
  const r = meldResultDef(undefined, name);
  const ok = !!r && isFullySupported({ ...r, meld: undefined });
  if (r) meldResults.set(name, ok);
  return ok;
}

/**
 * True when the engine executes everything the card does. Unsupported cards can still be
 * played, but some of their text does nothing yet, so decks and the UI flag them.
 */
export function isFullySupported(d: CardDef): boolean {
  // A melded permanent isn't a card: it exists only as the back faces of its meld pair (CR 712.4b).
  if (isMeldResult(d)) return false;
  if (d.faces?.length) return facesSupported(d);
  if (d.name.includes(" // ") && !d.faceOf) return false;
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
 * A card with several faces: each face it can be cast as, played as or turned up to has to be supported. Modal
 * double-faced cards (CR 712.3, 712.11b, 712.12), adventurer cards (715) and split cards (709) are; split cards with
 * fuse or aftermath have those lines reported by their faces. Transforming, flip and preparation cards aren't yet.
 */
function facesSupported(card: CardDef): boolean {
  if (!["modal_dfc", "adventure", "split", "transform", "prepare", "flip"].includes(card.layout ?? "")) return false;
  const d = restingDef(card);
  // Rooms (CR 709.5): each door is cast on its own as a half, and is the text of the Room permanent while unlocked.
  if (!d.faces!.every((_, i) => isFullySupported(faceDef(d, i)))) return false;
  return !hasFuse(d) || fusedSupported(d);
}

/**
 * A fused split spell's text is both halves' (CR 702.102d), compiled as one spell: supported when that spell is exactly
 * the left half's targets and effects followed by the right half's, so nothing in one half was read as being about
 * the other.
 */
function fusedSupported(d: CardDef): boolean {
  const fused = faceDef(d, d.faces!.length);
  if (!isFullySupported(fused)) return false;
  const [left, right] = d.faces!.map((_, i) => compileCard(faceDef(d, i)).spell);
  const whole = compileCard(fused).spell;
  if (!whole || !left || !right || left.modal || right.modal || whole.modal) return false;
  // The right half's targets come after the left half's (an effect names its target by `index`).
  const shift = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(shift) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "index" && typeof v === "number" ? v + left.targets.length : shift(v)])) : x;
  const strip = (b: AbilityBody) => JSON.stringify({ targets: b.targets.map((t) => ({ ...t, text: "" })), effects: b.effects });
  return strip(whole) === strip({ ...whole, targets: [...left.targets, ...right.targets], effects: [...left.effects, ...(shift(right.effects) as Effect[])] });
}

/**
 * What casting this card targets: a spell's targets (for a modal spell, those of the chosen
 * modes, CR 700.2c), or what an Aura enchants (CR 303.4a).
 */
/** `how`: the optional costs announced for it, which decide whether it has the targets of parts that need them (gateTargets). */
export function spellTargetSpecs(d: CardDef, modes?: number[], how?: CastHow): TargetSpec[] {
  // A mutating creature spell targets "a non-Human creature with the same owner as this spell" (CR 702.140a).
  if (d.mutateOwner !== undefined) return [mutateTarget(d.mutateOwner)];
  const c = compileCard(d);
  if (c.spell) return gateTargets(withModes(c.spell, modes).targets, how);
  return c.enchant ? [c.enchant] : [];
}

/** What a mutating creature spell targets (CR 702.140a): a non-Human creature with the same owner as the spell. */
export const mutateTarget = (owner: PlayerId): TargetSpec => ({ kind: "object", types: ["Creature"], notSubtypes: ["Human"], ownerIs: owner, text: "target non-Human creature with the same owner" });

/**
 * The spell's effect as a body, for deciding what to target: a spell's text, or for an
 * Aura, what it will do to the enchanted permanent.
 */
export function castingBody(d: CardDef): AbilityBody | undefined {
  if (d.mutateOwner !== undefined) return { targets: [mutateTarget(d.mutateOwner)], effects: [], text: "Mutate" };
  const c = compileCard(d);
  if (c.spell) return c.spell;
  if (!c.enchant) return undefined;
  // Animate Dead: what it does to its target is reanimate it.
  if (c.animate) return { targets: [c.enchant], effects: [{ type: "putOntoBattlefield", what: { ref: "target", index: 0 } }], text: d.oracleText };
  const effects: Effect[] = c.statics
    .filter((st) => st.affects.kind === "attached")
    .map((st) => ({ type: "continuous", what: { ref: "target", index: 0 }, mods: st.mods, duration: "game" }));
  return { targets: [c.enchant], effects, text: d.oracleText };
}

// ---------------------------------------------------------------------------

export const QUOTED_SOURCE_NAME = "\u27easource\u27eb";

/** "He", "she", "him", "his" and "her" of a legendary card that names itself: "~" or "~'s". */
function selfPronouns(t: string): string {
  const kept: string[] = [];
  return t
    // Left as they are: "his or her" (their), a copy's exceptions ("except his name is ~ and he's a 4/4", read by
    // parseCopyExcept) and "if his sneak cost was paid" (read with the trigger).
    .replace(/\b(?:his or her|he or she|him or her)\b|\bexcept [^."]*|\b(?:his|her) \w+ cost was paid\b/gi, (m) => `\u0001${kept.push(m) - 1}\u0001`)
    .replace(/\b(?:[Hh]is|[Hh]er(?= (?:power|toughness|owner's|owner|controller|name|loyalty|additional|sneak|other|text|mana)\b))\b/g, "~'s")
    .replace(/\b(?:[Hh]e|[Ss]he|him|her)\b(?!')/g, "~")
    .replace(/\u0001(\d+)\u0001/g, (_, n: string) => kept[Number(n)]!);
}

/** Replace every way a card refers to itself with "~". */
export function normalizeSelf(d: CardDef): string {
  let t = stripReminder(d.oracleText);
  const full = d.name.split(" // ")[0]!;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A meld card's meld ability (CR 701.42a): "if you both own and control ~ and a creature named Bruna, the Fading Light,
  // exile them, then meld them into Brisela, Voice of Nightmares", "If ~ and a creature named Phyrexian Dragon Engine are
  // attacking, and you both own and control them, exile them, then meld them into Mishra, Lost to Phyrexia. It enters
  // tapped and attacking." "Them" is ~ and the permanent with its counterpart's name: said so here, to be read alone.
  const partner = d.meld && meldPartnerName(d);
  if (partner && full) {
    const into = `then meld them into ${esc(d.meld!.result)}`;
    const re = new RegExp(`(an? (creature|land|artifact) named ${esc(partner)})((?:(?! named ).)*?)exile them, ${into}(\\. It enters tapped and attacking)?`, "g");
    t = t.replace(re, (_, named: string, type: string, mid: string, attacking?: string) =>
      `${named}${mid}exile ${full} and the ${/ are attacking, /.test(mid) ? "attacking " : ""}${type} named ${partner}, then meld them into ${d.meld!.result}${attacking ? " tapped and attacking" : ""}`);
  }
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
  // A legendary character card refers to itself as "he" or "she" ("Put a +1/+1 counter on Hercules. He gains
  // vigilance", "his power", "attach up to one target Equipment to her"): the card itself, like "it" (CR 201.5). Not in
  // a quoted ability, where it would mean the object given the ability, and not "his or her" (an old way to say "their").
  if (d.supertypes?.includes("Legendary")) t = t.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : selfPronouns(part))).join("");
  // 'Equipped creature has "... sacrifice this Equipment"': the Equipment, not the creature.
  t = t.replace(/"[^"]*"/g, (q) => q.replace(/\b[Tt]his (Equipment|Aura)\b/g, QUOTED_SOURCE_NAME));
  t = t.replace(/\b[Tt]his (creature|artifact|enchantment|land|permanent|spell|card|token|Equipment|Vehicle|Spacecraft|Planet|Aura|planeswalker|Saga|Class|Case|Room|Siege|battle)\b/g, "~");
  // A Room's door (CR 709.5j): "When you unlock this door" is about that half, by its index.
  if (d.faceOf && d.subtypes.includes("Room")) t = t.replace(/\bWhen you unlock this door\b/g, `When you unlock door ${d.faceOf.face}`);
  // "Your team" means the same as "you" in a game that isn't between teams (CR 102.4): "Warriors your team controls",
  // "if your team gained life this turn".
  t = t.replace(/\byour team controls\b/g, "you control").replace(/\byour team gained\b/g, "you gained");
  // Azra Bladeseeker: "each player on your team may discard a card, then each player who discarded a card this way draws
  // a card" is you alone.
  t = t.replace(/\beach player on your team may discard a card, then each player who discarded a card this way draws a card\b/g, "you may discard a card. If you do, draw a card");
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

/** The ability words (CR 207.2c), before a line of an instant or sorcery. */
const SPELL_ABILITY_WORD = new RegExp(
  `^(?:${["Adamant", "Addendum", "Alliance", "Battalion", "Bloodrush", "Celebration", "Channel", "Chroma", "Cohort", "Constellation", "Converge", "Council's dilemma", "Coven", "Delirium", "Descend 4", "Descend 8", "Disappear", "Domain", "Eerie", "Eminence", "Enrage", "Fateful hour", "Fathomless descent", "Ferocious", "Flurry", "Formidable", "Grandeur", "Hellbent", "Heroic", "Imprint", "Infusion", "Inspired", "Join forces", "Kinship", "Landfall", "Lieutenant", "Magecraft", "Metalcraft", "Morbid", "Opus", "Pack tactics", "Paradox", "Parley", "Radiance", "Raid", "Rally", "Renew", "Repartee", "Revolt", "Secret council", "Spell mastery", "Strive", "Survival", "Sweep", "Tempting offer", "Threshold", "Undergrowth", "Valiant", "Vivid", "Void", "Will of the council"].join("|")}) — `,
);

/** The conditions "~ has flash as long as ..." may have: about the player, so the same with the card in hand. */
const FLASH_IF: StaticCondition["kind"][] = ["committedCrime", "control", "monarch", "initiative", "graveyardAtLeast", "graveyardTypes"];

export function compile(d: CardDef): CompiledCard {
  const out: CompiledCard = { triggers: [], activated: [], mana: [], statics: [], entersTapped: false, unsupported: [], textKeywords: [] };
  // A back face cast converted (CR 702.162a): the front face's More Than Meets the Eye cost is what's paid for it.
  if (d.convertCost && plainMana(d.convertCost)) out.altCosts = [{ kind: "convert", mana: d.convertCost }];
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
  if (!d.keywords.includes("Station")) joinRollTables(all);
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
    // An instant's or sorcery's ability word ("Spell mastery — If ...", CR 207.2c): no rules meaning either.
    if (isSpell) line = line.replace(SPELL_ABILITY_WORD, "");
    // An ability word (CR 207.2c) or a flavor word (Khârn's "Berzerker — ", CR 207.2d) before a static or replacement
    // ability: no rules meaning. Not a keyword written with a dash ("Boast — ", CR 702), a chapter number ("II — ", CR
    // 714.2b) or a modal choice.
    const word = !isSpell ? /^([A-Z][^—•":{}]*?) — (?![{+•])/.exec(line) : null;
    if (word && !KEYWORD_WORDS.has(word[1]!.toLowerCase()) && !/^[IVX]+(?:, [IVX]+)*$/.test(word[1]!) && !/^(?:Choose\b|To solve$)/.test(word[1]!)) line = line.slice(word[0].length);
    // "Vivid — {T}: For each color among permanents you control, add ..." (Bloom Tender): an ability word too.
    else if (!isSpell && /^Vivid — \{/.test(line)) line = line.replace(/^Vivid — /, "");
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
      else out.mana.push({ ...manaAb, text: line, onceEver: true, exhaust: true });
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
    const exert = /^(?:You may exert ~|(If ~ hasn't been exerted this turn), you may exert it) as (?:it|he|she|they|~) attacks?\.(?: When you do, (.+))?$/.exec(line);
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
    const kwLine = line.replace(/(protection|hexproof) from (\w+) and from (\w+)/gi, "$1 from $2, $1 from $3");
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
      if (kw.paradigm) out.paradigm = true;
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
    // "Each other creature you control enters with an additional +1/+1 counter on it" (Renata, Called to the Hunt): a
    // replacement effect on other permanents entering while this one is on the battlefield (CR 614.1c). Whether one
    // without "other" that could describe itself applies to itself isn't worked out, so that stays out.
    const othersExtra = new RegExp(`^Each (other )?(.+? you control(?: [^,]+?)?) enters with (an|a|one|two|three) additional ${COUNTER} counters? on it\\.$`).exec(line);
    if (othersExtra) {
      // "Each creature you control that's a Wolf or a Werewolf" (Arlinn, Voice of the Pack) is "each Wolf or Werewolf creature".
      const that = /^creature you control that's an? ([A-Z]\w+) or an? ([A-Z]\w+)$/.exec(othersExtra[2]!);
      const g = parseGroup(`each ${that ? `${that[1]} or ${that[2]} creature you control` : othersExtra[2]}`);
      const types = g?.filter.types ?? [];
      const couldBeSelf = !othersExtra[1] && d.types.some((ty) => types.includes(ty) || (!types.length && ty === "Creature"));
      // "Each other creature you control of the chosen type" (Metallic Mimic): the type chosen as it entered.
      const chosenOk = !g?.filter.chosen || (g.filter.kind === "object" && g.filter.chosen === "type" && /^As ~ enters(?: the battlefield)?, choose a creature type\.$/m.test(normalizeSelf(d)));
      if (!g || g.other || couldBeSelf || g.filter.kind !== "object" || g.filter.controller !== "you" || !chosenOk) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(othersExtra[4]!), n: /^an?$/.test(othersExtra[3]!) ? 1 : num(othersExtra[3]!), text: line });
      continue;
    }
    // Master Chef's granted "Other creatures you control enter with an additional +1/+1 counter on them": Renata's ability
    // in the plural. "This creature enters with an additional +1/+1 counter on it": a replacement effect on itself
    // entering (CR 614.1c), which applies as it would exist on the battlefield (CR 614.12, rulings on Master Chef).
    const othersPlural = new RegExp(`^Other (.+? you control) enter with (an|a|one|two|three) additional ${COUNTER} counters? on them\\.$`).exec(line);
    if (othersPlural) {
      const g = parseGroup(`each ${othersPlural[1]!.replace(/s you control$/, " you control")}`);
      if (!g || g.other || g.filter.kind !== "object" || g.filter.controller !== "you" || g.filter.chosen) out.unsupported.push(raw);
      else (out.othersEnterWithCounters ??= []).push({ filter: g.filter, counter: counterKind(othersPlural[3]!), n: /^an?$/.test(othersPlural[2]!) ? 1 : num(othersPlural[2]!), text: line });
      continue;
    }
    const selfExtra = new RegExp(`^~ enters with (an|a|one|two|three) additional ${COUNTER} counters? on it\\.$`).exec(line);
    if (selfExtra) {
      (out.entersWithAdditional ??= []).push({ counter: counterKind(selfExtra[2]!), n: /^an?$/.test(selfExtra[1]!) ? 1 : num(selfExtra[1]!) });
      continue;
    }
    // "As ~ enters, choose a player." (CR 614.12): True-Name Nemesis's "the chosen player". "Secretly choose an opponent"
    // (Guardian Archon): the same, but only its controller knows who until it's revealed.
    const choosePlayer = /^As (?:~|it) enters, (secretly )?choose (a player|an opponent)\.$/.exec(line);
    if (choosePlayer && !out.entersChoosePlayer) {
      out.entersChoosePlayer = choosePlayer[2] === "a player" ? "player" : "opponent";
      if (choosePlayer[1]) out.entersChooseSecret = true;
      continue;
    }
    // The Sieges: "As ~ enters, choose Khans or Dragons." then "• Khans — [ability]" and "• Dragons — [ability]", each meaning
    // "as long as [anchor word] was chosen as this permanent entered, it has [ability]" (CR 614.12b, 607.2m).
    const anchors = /^As ~ enters, choose ([A-Z]\w+) or ([A-Z]\w+)\.$/.exec(line);
    if (anchors && !out.entersAnchor && lines.slice(li + 1).filter((l) => /^• [A-Z]\w+ — /.test(l)).length === 2) {
      out.entersAnchor = [anchors[1]!, anchors[2]!];
      continue;
    }
    const anchored = out.entersAnchor && /^• ([A-Z]\w+) — (.+)$/.exec(line);
    if (anchored) {
      if (!out.entersAnchor!.includes(anchored[1]!) || !conditionalAbility(d, anchored[2]!, out, { kind: "anchor", word: anchored[1]! })) out.unsupported.push(raw);
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
    // "As ~ enters, choose a nonland card name." (CR 614.12, 201.4): kept while it's on the battlefield, as Chosen.name.
    const asName = /^As (?:~|it) enters, choose (an? .*?card name(?: other than a basic land card name)?)\.$/.exec(line);
    const nameChoice = asName && parseCardNameChoice(asName[1]!);
    if (asName) {
      if (!nameChoice || out.entersChoose?.some((c) => c.what === "cardName")) out.unsupported.push(raw);
      else (out.entersChoose ??= []).push({ what: "cardName", ...nameChoice });
      continue;
    }
    // Meddling Mage, Gideon's Intervention, Pithing Needle (CR 201.4): what the name chosen as it entered does.
    const nameBan =
      line === "Spells with the chosen name can't be cast." ? ({ kind: "cast", who: "all" } as const)
      : line === "Your opponents can't cast spells with the chosen name." ? ({ kind: "cast", who: "opponents" } as const)
      : line === "Activated abilities of sources with the chosen name can't be activated." ? ({ kind: "activate" } as const)
      : line === "Activated abilities of sources with the chosen name can't be activated unless they're mana abilities." ? ({ kind: "activate", exceptMana: true } as const)
      : null;
    if (nameBan) {
      (out.nameBans ??= []).push(nameBan);
      continue;
    }
    if (line === "You have protection from the chosen card name.") {
      out.protectionFromChosenName = true;
      continue;
    }
    // Suppression Field, Anointed Peacekeeper: generic mana more for activated abilities that aren't mana abilities.
    const tax = /^Activated abilities( of sources with the chosen name)? cost \{(\d+)\} more to activate unless they're mana abilities\.$/.exec(line);
    if (tax) {
      (out.activationTaxes ??= []).push({ ...(tax[1] ? { filter: { kind: "card", chosen: "name", text: "sources with the chosen name" } } : {}), n: Number(tax[2]), text: line });
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
    // "~ enters with X +1/+1 counters on it. If X is 5 or more, it enters with an additional X +1/+1 counters on it."
    // (Apocalypse Hydra): the X chosen, not the mana spent (rulings); one replacement effect (CR 614.1c).
    const twiceX = /^~ enters with X \+1\/\+1 counters on it\. If X is (\d+) or more, it enters with an additional X \+1\/\+1 counters on it\.$/.exec(line);
    if (twiceX) {
      if (out.entersWithCounters) out.unsupported.push(raw);
      else out.entersWithCounters = { counter: "+1/+1", n: { count: { kind: "x" } }, doubleIfXAtLeast: Number(twiceX[1]) };
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
    if (line === "~ enters prepared.") {
      out.entersPrepared = true;
      continue;
    }
    if (line === "If ~ would be put into a graveyard from anywhere, exile it instead.") {
      out.exileInsteadOfGraveyard = true;
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
    if (line === "You may play cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells.") {
      if (out.playLinked) out.unsupported.push(raw);
      else out.playLinked = true;
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
    // Bolas's Citadel: "... If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost."
    const lifeTop = /^(.+?)\. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost\.$/.exec(line);
    const top = lifeTop ? ((t) => (t?.spells ? { ...t, payLife: true as const } : t && null))(parseFromTop(lifeTop[1]!)) : parseFromTop(line.replace(/\.$/, ""));
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
    if (line === "Each player may play an additional land on each of their turns.") {
      out.extraLandsEach = (out.extraLandsEach ?? 0) + 1;
      continue;
    }
    // Clones: "You may have ~ enter as a copy of any creature on the battlefield[, except ...]." (CR 707.5)
    // Cursed Mirror: "As ~ enters, you may have it become a copy of any creature on the battlefield until end of
    // turn, except it has haste" also becomes the copy as it enters (rulings), for the rest of the turn.
    const clone = /^(?:You may have ~ enter as|As ~ enters, you may have it become) a copy of (?:any |an? )?(.+?)( until end of turn)?(?:, except (.+?))?\.?$/.exec(line);
    // "You may have this creature enter as a copy of any creature card in a graveyard, except ..." (Lazotep Convert): a
    // card in any graveyard, by its printed characteristics.
    const fromYard = clone && !clone[2] && /^creature card in a graveyard$/.exec(clone[1]!);
    if (clone && fromYard) {
      const except = clone[3] ? parseCopyExcept(clone[3]) : undefined;
      if (except !== null && !except?.thisAbility) {
        out.entersAsCopy = { filter: { kind: "card", types: ["Creature"], text: clone[1]! }, ...(except ? { except } : {}) };
        continue;
      }
    }
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
      out.roomsTwice = 1;
      continue;
    }
    // Scion of Halaster's granted ability: a replacement for the player's first draw each turn (CR 614.1a, 614.5).
    if (line === "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the other back on top of your library. Then draw a card.") {
      out.firstDrawLook = true;
      continue;
    }
    if (line === "If you would draw a card while your library has no cards in it, you win the game instead.") {
      out.drawEmptyWins = true;
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
    const discardInstead = /^If ~ would enter, you may discard an? ([a-z]+ card) instead\. If you do, put ~ onto the battlefield\. If you don't, put it into its owner's graveyard\.$/.exec(line);
    if (discardInstead && !out.entersDiscardInstead) {
      const filter = parseSearchFilter(discardInstead[1]!);
      if (filter) {
        out.entersDiscardInstead = filter;
        continue;
      }
    }
    if (line === "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead.") {
      out.exileUnlessCastWithMana = true;
      continue;
    }
    if (line === "During your turn, as long as you haven't activated an exhaust ability this turn, you may activate exhaust abilities as though they haven't been activated.") {
      out.exhaustAgain = true;
      continue;
    }
    // "While voting, you get an additional vote" (Brago's Representative), "... you may vote an additional time" (Ballot
    // Broker): CR 701.38d.
    const extraVote = /^While voting, you (get an additional vote|may vote an additional time)\.$/.exec(line);
    if (extraVote && !out.extraVote) {
      out.extraVote = extraVote[1]!.startsWith("get") ? "get" : "may";
      continue;
    }
    if (line === "If ~ is in your opening hand, you may begin the game with it on the battlefield.") {
      out.beginOnBattlefield = true;
      continue;
    }
    // Gemstone Caverns (CR 103.6a; the starting player is the one taking the first turn, 103.1).
    const caverns = /^If ~ is in your opening hand and you're not the starting player, you may begin the game with ~ on the battlefield with an? ([a-z]+) counter on it\. If you do, exile a card from your hand\.$/.exec(line);
    if (caverns) {
      out.beginOnBattlefield = { notStarting: true, counter: caverns[1]!, exileFromHand: true };
      continue;
    }
    // Torpor Orb, Hushwing Gryff, Doorkeeper Thrull, Elesh Norn, Mother of Machines.
    const lock = /^(Creatures|Artifacts and creatures|Permanents) entering(?: the battlefield)? don't cause abilities( of permanents your opponents control)? to trigger\.$/.exec(line);
    if (lock) {
      out.enterLock = { ...(lock[1] === "Creatures" ? { types: ["Creature"] } : lock[1] === "Artifacts and creatures" ? { types: ["Artifact", "Creature"] } : {}), ...(lock[2] ? { opponents: true as const } : {}) };
      continue;
    }
    const again = triggersAgainLine(line);
    if (again) {
      (out.triggersAgain ??= []).push(again);
      continue;
    }
    if (line === "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast.") {
      out.payWUBRG = true;
      continue;
    }
    if (line === "Each power-up ability of permanents you control can be activated an additional time.") {
      out.powerUpAgain = true;
      continue;
    }
    const powerUpLess = /^Power-up abilities of other creatures you control cost \{(\d+)\} less to activate\.$/.exec(line);
    if (powerUpLess && !out.powerUpLess) {
      out.powerUpLess = Number(powerUpLess[1]);
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
    // "Noncreature spells you cast have convoke" (Caetus, Sea Tyrant of Segovia), "Multicolored spells you cast have
    // convoke" (Fallaji Wayfarer): the spell has it while it's being cast and paid for (CR 702.51a, 601.2g-h).
    const giveConvoke = /^([A-Z][a-z]+(?: and [a-z]+)?) spells you cast have convoke\.$/.exec(line);
    if (giveConvoke) {
      const f = parseTargetPhrase(`${giveConvoke[1]!.replace(/ and /g, " or ").toLowerCase()} spell`);
      if (f?.kind !== "spell") out.unsupported.push(raw);
      else (out.spellsHaveConvoke ??= []).push({ filter: f, text: line });
      continue;
    }
    // Cascade for the spells you cast (CR 702.85a): "Sliver spells you cast have cascade", "Instant and sorcery spells you
    // cast from your hand have cascade", "The first spell you cast each turn has cascade" (Maelstrom Nexus).
    const giveCascade = /^(?:(.+?) )?[Ss]pells you cast( from your hand)?( with mana value \d+ or (?:greater|less))? have cascade\.$/.exec(line);
    const firstCascade = /^The first spell you cast (from exile )?each turn( that mana from a Treasure was spent to cast)? has cascade\.$/.exec(line);
    if (/^Commander spells you cast have cascade\.$/.test(line)) {
      (out.spellsHaveCascade ??= []).push({ commander: true, text: line });
      continue;
    }
    const xCascade = /^During your turn, spells you cast from your hand with mana value X or less have cascade, where X is (.+)\.$/.exec(stripAbilityWord(line));
    if (xCascade) {
      const maxMv = parseCount(xCascade[1]!, null);
      if (!maxMv) {
        out.unsupported.push(raw);
        continue;
      }
      (out.spellsHaveCascade ??= []).push({ from: "hand", yourTurn: true, maxMv, text: line });
      continue;
    }
    // Delirium: "This spell has cascade as long as there are four or more card types among cards in your graveyard"
    // (Bloodbraid Marauder): it has cascade as it's cast, so cascade triggers, only while that's true (CR 702.85a).
    const cascadeIf = /^~ has cascade as long as (.+)\.$/.exec(stripAbilityWord(line));
    if (cascadeIf) {
      const cond = parseStaticCondition(cascadeIf[1]!, { affects: { kind: "self" }, mods: [], text: "" });
      if (!cond || !conditionalAbility(d, "Cascade", out, cond)) out.unsupported.push(raw);
      continue;
    }
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
    if (/^You may activate abilities of creatures you control as though those creatures had haste\.$/.test(line)) {
      out.creatureAbilitiesHaste = true;
      continue;
    }
    // "~ is all colors" (CR 604.3), and Fallaji Wayfarer's "This ability doesn't affect its color identity" (its color
    // identity in the card data is green, CR 903.4). Only when the card data has all five colors for it, as Scryfall does.
    if (/^~ is all colors\.(?: This ability doesn't affect its color identity\.)?$/.test(line.replace(/ \(It can be in any deck whose commander's color identity includes \w+\.\)$/, ""))) {
      if (d.colors.length !== 5) {
        out.unsupported.push(raw);
        continue;
      }
      out.allColors = true;
      continue;
    }
    // "You may activate the loyalty abilities of ~ twice each turn rather than only once" (Urza, Planeswalker; CR 606.3).
    const loyaltyTwice = /^You may activate the loyalty abilities of (~|planeswalkers you control) twice each turn rather than only once\.$/.exec(line);
    if (loyaltyTwice) {
      out.loyaltyTwice = loyaltyTwice[1] === "~" ? "self" : "yours";
      continue;
    }
    if (/^You have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = out.noMaxHandSize || true;
      continue;
    }
    if (/^Players have no maximum hand size\.$/.test(line)) {
      out.noMaxHandSize = "all";
      continue;
    }
    // "You can't cast creature spells" (Steel Golem), "noncreature spells" (Nikya of the Old Ways): a "can't" that wins
    // over any "can" (CR 101.2); putting creatures onto the battlefield isn't casting them (rulings).
    // "Your opponents can't cast noncreature spells" (Narset Transcendent's emblem): each opponent of its controller.
    const cantCast = /^(You|Your opponents) can't cast (creature|noncreature) spells\.$/.exec(line);
    if (cantCast) {
      const filter = parseTargetPhrase(`${cantCast[2]} spell`);
      if (filter?.kind !== "spell") out.unsupported.push(raw);
      else (cantCast[1] === "You" ? (out.youCantCast ??= []) : (out.opponentsCantCast ??= [])).push({ ...filter, text: `${cantCast[2]} spell` });
      continue;
    }
    // Mana that isn't lost as steps and phases end (CR 500.4): "Players don't lose unspent mana" (Upwelling), "You don't lose
    // unspent red mana" (Leyline Tyrant), "If you would lose unspent mana, that mana becomes colorless instead" (Kruphix, a
    // replacement effect, CR 614.1a; restrictions on that mana stay with it, rulings).
    const keep = /^(Players|You) don't lose unspent (?:(white|blue|black|red|green) )?mana as steps and phases end\.$/.exec(line);
    const becomes = /^If you would lose unspent mana, that mana becomes (colorless|white|blue|black|red|green) instead\.$/.exec(line);
    if ((keep || becomes) && !out.keepMana) {
      out.keepMana = keep
        ? { who: keep[1] === "Players" ? "all" : "you", ...(keep[2] ? { color: COLOR_WORDS[keep[2]]! } : {}) }
        : { who: "you", becomes: becomes![1] === "colorless" ? "C" : COLOR_WORDS[becomes![1]!]! };
      continue;
    }
    // Pixie Guide, Wyll, Barbarian Class: a replacement effect on your rolls (CR 614.1a); the ignored roll never happened (706.6).
    if (/^If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll\.$/.test(line)) {
      out.rollAdvantage = true;
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
      // "Aura and Equipment spells" (Sigarda's Aid): each of them.
      const spec = parseTargetPhrase(`${flashFor[1]!.replace(/ and /g, " or ")}spell`);
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
    if (line === "If damage would be dealt to ~, prevent that damage and an opponent of your choice gains control of it.") {
      out.betrayer = true;
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
    // "Your opponents can't cast spells with mana value 3 or less" (Brisela): the spell as it's proposed, X chosen (CR
    // 601.2e, 601.3a).
    const mvBan = new RegExp(`^Your opponents can't cast spells with mana value ${NUM} or less\\.$`).exec(line);
    if (mvBan && out.opponentsCantCastMvAtMost === undefined) {
      out.opponentsCantCastMvAtMost = num(mvBan[1]!);
      continue;
    }
    // Teferi, Temporal Archmage's emblem: loyalty abilities when you could cast an instant, still one per permanent each
    // turn (CR 606.3, rulings).
    if (line === "You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.") {
      out.loyaltyAtInstantSpeed = true;
      continue;
    }
    if (line === "Your opponents can't cast spells from anywhere other than their hands.") {
      out.opponentsOnlyFromHand = true;
      continue;
    }
    if (line === "Your opponents can't cast spells during your turn.") {
      out.opponentsCantCastYourTurn = true;
      continue;
    }
    if (line === "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.") {
      out.opponentsCantCastYourTurn = true;
      out.opponentsCantActivateYourTurn = true;
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
    // Animate Dead, Dance of the Dead (CR 303.4a, rulings): the Aura spell targets a creature card in a graveyard and enters
    // attached to it; its enters trigger returns the card and attaches the Aura to the creature it became (Effect
    // "animateDead"), and its leaves trigger sacrifices that creature.
    if (line === "Enchant creature card in a graveyard" && d.subtypes.includes("Aura") && !out.enchant) {
      out.enchant = { kind: "card", types: ["Creature"], text: "creature card in a graveyard to enchant" };
      out.animate = true;
      continue;
    }
    const animate = out.animate && /^When ~ enters, if it's on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with ⟪source⟫\." (?:Return enchanted creature card to the battlefield under your control|Put enchanted creature card onto the battlefield (tapped )?under your control) and attach ~ to it\. When ~ leaves the battlefield, that creature's controller sacrifices it\.$/.exec(line);
    if (animate) {
      out.triggers.push({ event: "selfEnters", body: { targets: [], effects: [{ type: "animateDead", ...(animate[1] ? { tapped: true as const } : {}) }], text: `Return enchanted creature card to the battlefield${animate[1] ? " tapped" : ""} under your control and attach ~ to it.` } });
      out.triggers.push({ event: "selfLeaves", body: { targets: [], effects: [{ type: "sacrificeAnimated" }], text: "That creature's controller sacrifices it." } });
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
    // "Doctor's companion" too (CR 702.124m).
    if (/^(?:Partner—(?:Character select|Father & son|Friends forever|Survivors)|Doctor's companion)$/.test(line)) continue;
    // "Partner with [name]" is two abilities (CR 702.124j): the deck-building one (commanderPairProblem) and "When this
    // permanent enters, target player may search their library for a card named [name], reveal it, put it into their
    // hand, then shuffle."
    const partnerWith = /^Partner with ([^()]+?)\.?$/.exec(line);
    if (partnerWith) line = `When ~ enters, target player may search their library for a card named ${partnerWith[1]}, reveal it, put it into their hand, then shuffle.`;
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
      else if ("targetLifeTax" in cost) out.targetLifeTax = (out.targetLifeTax ?? 0) + cost.targetLifeTax;
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
    // So does a Pact's "At the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." (CR 603.7a).
    if (isSpell && (/^When you next cast /.test(line) || /^At the beginning of your next upkeep, pay (?:\{[^}]+\})+\. If you don't, you lose the game\.$/.test(line))) {
      spellLines.push(line);
      continue;
    }
    // "When you cast or cycle ~, ...", "When you cycle ~ and when ~ dies, ...", "Whenever ~ enters or attacks, ...",
    // "When ~ enters or dies, ...", "When ~ transforms into ~ or dies, ...", "When ~ enters and at the beginning of your upkeep, ...": one ability that triggers on
    // either event, which works like two with the same effect (CR 702.29c). The text is read for each event ("it" after it
    // died is the card).
    const twice =
      /^When you cast or cycle ~, (.+)$/.exec(line) ??
      /^When ~ enters and (at the beginning of (?:your upkeep|your end step|each upkeep|each end step)), (.+)$/.exec(line) ??
      /^When you cycle ~ and when ~ dies, (.+)$/.exec(line) ??
      /^When(?:ever)? ~ enters or (attacks|dies|leaves the battlefield|the creature it haunts dies|deals combat damage to a player|transforms into ~), (.+)$/.exec(line) ??
      /^When ~ (transforms into ~) or dies, (.+)$/.exec(line) ??
      /^When ~ enters and whenever it (attacks while saddled), (.+)$/.exec(line) ??
      // "Whenever ~ attacks or becomes the target of a spell, create a Treasure token" (Goldspan Dragon).
      /^Whenever ~ (attacks) or (becomes the target of a spell), (.+)$/.exec(line) ??
      // "Whenever you create or sacrifice a token, ..." (Mirkwood Bats); "When ~ enters and whenever an opponent draws a
      // card except the first one they draw in each of their draw steps, ..." (Orcish Bowmasters).
      /^Whenever you (create or sacrifice) a token, (.+)$/.exec(line) ??
      /^When ~ enters and (whenever an opponent draws a card except the first one they draw in each of their draw steps), (.+)$/.exec(line) ??
      // "Whenever a creature you control of the chosen type enters or attacks, draw a card." (Kindred Discovery)
      /^Whenever (an? [^,]+? you control(?: of the chosen type)?) enters or attacks, (.+)$/.exec(line) ??
      // Syr Konrad: "Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than
      // the battlefield, or a creature card leaves your graveyard, ...": no one event is two of them.
      /^Whenever (another creature dies), or (a creature card is put into a graveyard from anywhere other than the battlefield), or (a creature card leaves your graveyard), (.+)$/.exec(line);
    if (twice && !/\bonly once\b/.test(line)) {
      const effect = twice[twice.length - 1]!;
      const events = /^When you cast/.test(line)
        ? [`When you cast ~, ${effect}`, `When you cycle ~, ${effect}`]
        : /^When you cycle/.test(line)
          ? [`When ~ dies, ${effect}`, `When you cycle ~, ${effect}`]
          : twice[1] === "the creature it haunts dies"
            ? [`When ~ enters, ${effect}`, `When the creature ~ haunts dies, ${effect}`]
            : /^at the beginning/.test(twice[1]!)
              ? [`When ~ enters, ${effect}`, `A${twice[1]!.slice(1)}, ${effect}`]
            : /^When ~ transforms into ~ or dies/.test(line)
              ? [`When ~ transforms into ~, ${effect}`, `When ~ dies, ${effect}`]
            : twice[1] === "create or sacrifice"
              ? [`Whenever you create a token, ${effect}`, `Whenever you sacrifice a token, ${effect}`]
            : /^When ~ enters and whenever an opponent draws/.test(line)
              ? [`When ~ enters, ${effect}`, `W${twice[1]!.slice(1)}, ${effect}`]
            : /^Whenever ~ attacks or becomes the target of a spell, /.test(line)
              ? [`Whenever ~ attacks, ${effect}`, `Whenever ~ becomes the target of a spell, ${effect}`]
            : twice.length === 5
              ? twice.slice(1, 4).map((e) => `Whenever ${e}, ${effect}`)
            : /^Whenever an? [^,]+? enters or attacks, /.test(line)
              ? [`Whenever ${twice[1]} enters, ${effect}`, `Whenever ${twice[1]} attacks, ${effect}`]
            : [`When ~ enters, ${effect}`, `${/^(?:attacks|deals)/.test(twice[1]!) ? "Whenever" : "When"} ~ ${twice[1]}, ${effect}`];
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
  // Imprint (an ability word, CR 207.2c): "{T}: Add one mana of any of the exiled card's colors" (Chrome Mox) is
  // linked to the one ability that exiles it as it enters (CR 607.2a).
  if (out.mana.some((m) => m.produces.kind === "colorsAmong" && m.produces.linked)) {
    const imprints = out.triggers.filter((t) => t.event === "selfEnters").flatMap((t) => allEffects(t.body.effects)).filter((e) => e.type === "takeFromHand" && e.action === "exile");
    if (imprints.length !== 1 || out.triggers.some((t) => allEffects(t.body.effects).some((e) => e.type === "returnLinked"))) out.unsupported.push("(its mana ability can't be linked to one imprint ability)");
    else (imprints[0] as Extract<Effect, { type: "takeFromHand" }>).linked = true;
  }
  const returns = out.triggers.filter((t) => allEffects(t.body.effects).some((e) => e.type === "returnLinked"));
  if (!returns.length) return;
  const exiles = [...out.triggers.filter((t) => t.event === "selfEnters").map((t) => t.body), ...out.activated.map((a) => a.body)]
    .flatMap((b) => allEffects(b.effects))
    .filter((e): e is Extract<Effect, { type: "exile" | "takeFromHand" | "hideaway" | "discard" }> => (e.type === "exile" || (e.type === "takeFromHand" && e.action === "exile") || e.type === "hideaway" || (e.type === "discard" && !!e.exile)) && !("until" in e && e.until));
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
    // A reflexive trigger's "that creature" after "you may sacrifice another creature" (Heart-Piercer Manticore).
    if (o.type === "reflexive" && o.sacrificed) {
      const was = canSac;
      canSac = true;
      visit(o.body);
      canSac = was;
      return;
    }
    // "You may sacrifice another creature. If you do, ... that creature's power" (Disciple of Freyalise).
    if (o.type === "if" && (o.cond as { kind?: string } | undefined)?.kind === "sacrificedThisWay") {
      const was = canSac;
      canSac = true;
      visit(o.effects);
      canSac = was;
      visit(o.otherwise);
      return;
    }
    if ((o.ref === "sacrificed" || o.kind === "sacrificedSuspected") && !canSac) bad = true;
    // "The chosen type" needs something that chooses one: "as ~ enters, choose" or "choose a creature type" before it.
    if (typeof o.chosen === "string") (/olor/.test(o.chosen) ? needs.add("color") : o.chosen === "cardType" ? needs.add("cardType") : o.chosen === "name" ? needs.add("cardName") : needs.add("creatureType"));
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
  visit([out.costMods, out.activationTaxes]);
  if (out.nameBans || out.protectionFromChosenName) needs.add("cardName");
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
  if (out.triggers.some((t) => t.event !== "selfEnters" && treasureIn(t.body)) || treasureIn(out.statics) || JSON.stringify(out.activated ?? null).includes('"kind":"treasureSpent"}')) bad = true;
  if (/"kind":"treasureSpent","activated"/.test(JSON.stringify([out.spell, out.triggers, out.statics]))) bad = true;
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
    // A "when you cast this spell" ability uses the X the spell was cast with (CR 107.3a, 601.2b; rulings on Hydroid Krasis).
    if (!usesX(tr.body) || ((tr.event === "selfEnters" || tr.event === "selfCast") && cardX) || (tr.event === "selfBecomesMonstrous" && monstrousX)) return true;
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
 * A results table is part of the ability with the instruction to roll (CR 706.3b): its rows join that line, before an
 * "Activate only ..." restriction. parseBody reads them as "if the result was in this range" (SpellCondition "rollIn").
 */
function joinRollTables(lines: string[]): void {
  for (let i = 1; i < lines.length; i++) {
    if (!ROLL_ROW.test(lines[i]!.trim())) continue;
    let head = i - 1;
    while (head > 0 && ROLL_ROW.test(lines[head]!.trim())) head--;
    if (!/\broll\b/i.test(lines[head]!)) continue;
    const prev = lines[i - 1]!;
    const restriction = / Activate only [^.]+\.(?: Activate only [^.]+\.)*$/.exec(prev);
    lines[i - 1] = restriction ? `${prev.slice(0, restriction.index)} ${lines[i]!.trim()}${restriction[0]}` : `${prev} ${lines[i]!.trim()}`;
    lines.splice(i, 1);
    i--;
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

/**
 * "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an
 * additional time" (Yarok), "if a creature dying causes ..." (Teysa Karlov), "if a creature attacking causes ..." (Isshin),
 * "if a triggered ability of a Ninja creature you control triggers, ..." (Splinter): CR 603.2d.
 */
function triggersAgainLine(line: string): NonNullable<CompiledCard["triggersAgain"]>[number] | null {
  // "Wolf or battle you control", "land or Bird you control": any of them.
  const kinds = (phrase: string, other: boolean): { filter: TargetSpec; other?: true }[] | null => {
    const yours = / you control$/.test(phrase);
    const parts = phrase.replace(/ you control$/, "").split(/,? or (?!less\b|greater\b|more\b)/);
    const out: { filter: TargetSpec; other?: true }[] = [];
    for (const p of parts) {
      const another = /^another /.test(p);
      const f = parseTargetPhrase(`${p.replace(/^another /, "")}${yours ? " you control" : ""}`);
      if (f?.kind !== "object") return null;
      out.push({ filter: f, ...(other || another ? { other: true as const } : {}) });
    }
    return out;
  };
  let m = /^If (?:an? )?(.+?) (entering|dying|attacking|dealing combat damage to a player)(?: the battlefield)? causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time\.$/.exec(line);
  if (m) {
    const event = ({ entering: "enters", dying: "dies", attacking: "attacks" } as Record<string, "enters" | "dies" | "attacks">)[m[2]!] ?? "combatDamage";
    // Dying and attacking are things only creatures do here (CR 700.4, 508.1a).
    if ((event === "dies" || event === "attacks" || event === "combatDamage") && !/^creature( you control)?$/.test(m[1]!)) return null;
    const filter = kinds(m[1]!, false);
    return filter ? { by: { event, filter: filter.map((x) => x.filter) } } : null;
  }
  m = /^If a triggered ability of (?:an? )?(.+?) triggers, (?:that ability|it) triggers an additional time\.$/.exec(line);
  // "Another creature you control of the chosen type" (Roaming Throne): the creature type chosen as it entered.
  const ofChosen = m && /^(another )?(creature you control) of the chosen type$/.exec(m[1]!);
  if (ofChosen) {
    const of = kinds(ofChosen[2]!, !!ofChosen[1]);
    return of?.length === 1 ? { of: [{ ...of[0]!, filter: { ...of[0]!.filter, chosen: "type", text: `${of[0]!.filter.text} of the chosen type` } }] } : null;
  }
  if (m) {
    const all = /^another (.+ or .+ you control)$/.exec(m[1]!);
    const of = kinds(all ? all[1]! : m[1]!, !!all);
    // Only permanents you control (a spell's triggered abilities aren't covered: Echoes of Eternity).
    return of && of.every((x) => x.filter.controller === "you") ? { of } : null;
  }
  return null;
}

// Executes the effect language: legal targets, resolving ability bodies, and the
// triggered-ability queue.

import { allEffects, refCovers } from "./abilities";
import type { AbilityBody, Amount, ChosenTarget, ChoiceKind, CounterKind, DamageRecipient, EntersOption, Effect, Modification, ObjRef, PlayerRef, Range, SearchDest, SpellCondition, TargetChoice, UnlessPays, PayCost, TargetSpec, TokenSpec, TriggeredAbility, TriggerEvent } from "./abilities";
import { manaValue, parseManaCost, payFromPool } from "./mana";
import { planMana } from "./autopay";
import { abilitiesOf, cardIdOf, defOf, NO_ABILITIES, withGranted, describeAbility, isPermanentCard, isType, objHasKeyword, objIsType, power, toughness } from "./cards";
import { nextRandom, shuffle } from "./rng";
import { auraHostFor, castProblem, describeTargets, destroyPermanent, draw, gainLife, livingPlayers, log, moveObject, newObject, obj, opponents, player, untapPermanent } from "./game";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow, type Characteristics } from "./layers";
import { modeCountProblem, withModes } from "./modes";
import { putCounters, tokensToCreate } from "./counters";
import { copyKey, type CopyExcept } from "./copies";
import { compileCard, compileGranted, MONARCH } from "./oracle";
import { bindChosenKeywords, CHOSEN_PROTECTION, CREATURE_TYPES, type SourceQuality } from "./keywords";
import { describeAmount, evalAmount, type AmountCtx } from "./amounts";
import { cardSource, dealDamage, objectSource, protectedFrom, type DamageSource } from "./damage";
import type { CardDef, Chosen, Color, DelayedTrigger, GameObject, GameState, LastKnown, ObjectId, PendingTrigger, PlayerId, StackItem, TriggerEventInfo, ZoneName } from "./types";

// ---------------------------------------------------------------------------
// Targets (CR 115)

/**
 * Does this permanent fit `spec` from `controller`'s point of view, using its current
 * characteristics? Hexproof only matters for targeting (CR 702.11b), not for what an Aura
 * can stay attached to (CR 303.4d), hence `targeting`.
 */
export function objectMatches(s: GameState, spec: TargetSpec, o: GameObject, controller: PlayerId, targeting = true, src?: SourceQuality, chars?: Characteristics): boolean {
  if (o.zone !== "battlefield") return false;
  const c = chars ?? characteristics(s, o);
  if (spec.types?.length && !spec.types.some((t) => c.types.includes(t))) return false;
  if (spec.allTypes?.some((t) => !c.types.includes(t))) return false;
  if (spec.notTypes?.some((t) => c.types.includes(t))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => c.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => c.colors.includes(col))) return false;
  if (spec.supertypes?.some((t) => !c.supertypes.includes(t))) return false;
  if (spec.notSupertypes?.some((t) => c.supertypes.includes(t))) return false;
  const hasSubtype = (st: string) => c.subtypes.includes(st) || (!!c.allCreatureTypes && CREATURE_TYPES.has(st));
  if (spec.subtypes?.length && !spec.subtypes.some(hasSubtype)) return false;
  if (spec.notSubtypes?.some(hasSubtype)) return false;
  // A choice that was never made: "of the chosen type" matches nothing, "not of the chosen type" everything.
  if (spec.chosen === "type" || spec.chosen === "color") return false;
  if (spec.counter && !(o.counters[spec.counter] ?? 0)) return false;
  const hasKw = (k: string) => c.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.keywords?.some((k) => !hasKw(k))) return false;
  if (spec.notKeywords?.some(hasKw)) return false;
  // Power and toughness only exist for creatures (CR 208.3); a noncreature has neither.
  if (spec.power && (!c.types.includes("Creature") || !inRange(c.power, spec.power))) return false;
  if (spec.toughness && (!c.types.includes("Creature") || !inRange(c.toughness, spec.toughness))) return false;
  if (spec.manaValue && !inRange(manaValue(parseManaCost(defOf(s, o).manaCost)), spec.manaValue)) return false;
  if (spec.combat === "attacking" && o.attacking === undefined) return false;
  if (spec.combat === "blocking" && !o.blocking) return false;
  if (spec.combat === "attackingOrBlocking" && o.attacking === undefined && !o.blocking) return false;
  if (spec.controller === "you" && c.controller !== controller) return false;
  if (spec.controller === "opponent" && c.controller === controller) return false;
  if (spec.controller === "eventPlayer" || (spec.controlledBy !== undefined && c.controller !== spec.controlledBy)) return false;
  if (spec.tapped !== undefined && !!o.tapped !== spec.tapped) return false;
  if (spec.token !== undefined && o.isToken !== spec.token) return false;
  if (targeting && c.controller !== controller && objHasKeyword(s, o, "Hexproof")) return false;
  if (targeting && objHasKeyword(s, o, "Shroud")) return false; // CR 702.18a: not even its controller can target it
  // Protection from the source's color: it can't be targeted (CR 702.16b), enchanted or equipped (702.16c-d).
  if (src && protectedFrom(c.keywords, src)) return false;
  return true;
}

/**
 * A filter with "the chosen type" / "the chosen color" filled in from what was chosen. With nothing
 * chosen it's left as it is, and then matches nothing (or, for "not of the chosen type", anything).
 */
export function bindChosen(spec: TargetSpec, chosen: Chosen | undefined): TargetSpec {
  if (!spec.chosen) return spec;
  const { chosen: kind, ...rest } = spec;
  if ((kind === "type" || kind === "notType") && chosen?.type)
    return kind === "type" ? { ...rest, subtypes: [...(rest.subtypes ?? []), chosen.type] } : { ...rest, notSubtypes: [...(rest.notSubtypes ?? []), chosen.type] };
  if ((kind === "color" || kind === "notColor") && chosen?.color)
    return kind === "color" ? { ...rest, colors: [chosen.color] } : { ...rest, notColors: [...(rest.notColors ?? []), chosen.color] };
  return kind === "notType" || kind === "notColor" ? rest : spec;
}

export const COLOR_NAMES: Record<Color, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

/** The names a player can choose from: every creature type (CR 205.3m) or color, but `except`. */
/** Riot's and unleash's choice (see choiceOptions). */
export const ENTERS_COUNTER = "+1/+1 counter";

export function choiceOptions(what: ChoiceKind | EntersOption, except?: string): string[] {
  if (what === "riot") return [ENTERS_COUNTER, "Haste"];
  if (what === "unleash") return [ENTERS_COUNTER, "No counter"];
  const all = what === "color" ? Object.values(COLOR_NAMES) : [...CREATURE_TYPES].sort();
  return all.filter((x) => x.toLowerCase() !== except?.toLowerCase());
}

/** Record a choice by name: a creature type, or a color ("Blue" is U). */
export function withChoice(chosen: Chosen | undefined, what: ChoiceKind, choice: string): Chosen {
  if (what === "creatureType") return { ...chosen, type: choice };
  const color = (Object.keys(COLOR_NAMES) as Color[]).find((c) => COLOR_NAMES[c] === choice);
  return { ...chosen, ...(color ? { color } : {}) };
}

/**
 * The colors and types of whatever is doing the targeting or attaching, for protection (CR 702.16b):
 * a permanent's current colors, or for a card elsewhere (a spell, a source that has left
 * the battlefield) its printed ones.
 */
export function sourceQuality(s: GameState, id?: ObjectId, cardId?: string): SourceQuality {
  const o = id ? s.objects[id] : undefined;
  if (o) return characteristics(s, o);
  const d = cardId ? s.cards[cardId] : undefined;
  return d ? { colors: d.colors, types: d.types, subtypes: d.subtypes } : { colors: [] };
}

/** Filters checked against a card's printed characteristics, for spells and cards in graveyards. */
export function printedMatches(spec: TargetSpec, d: CardDef): boolean {
  if (spec.types?.length && !spec.types.some((ty) => d.types.includes(ty))) return false;
  if (spec.allTypes?.some((ty) => !d.types.includes(ty))) return false;
  if (spec.notTypes?.some((ty) => d.types.includes(ty))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => d.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => d.colors.includes(col))) return false;
  if (spec.supertypes?.some((x) => !d.supertypes.includes(x))) return false;
  if (spec.notSupertypes?.some((x) => d.supertypes.includes(x))) return false;
  // Changeling gives every creature type wherever the card is (CR 702.73a).
  const hasSubtype = (st: string) => d.subtypes.includes(st) || (d.keywords.includes("Changeling") && CREATURE_TYPES.has(st));
  if (spec.subtypes?.length && !spec.subtypes.some(hasSubtype)) return false;
  if (spec.notSubtypes?.some(hasSubtype)) return false;
  if (spec.chosen === "type" || spec.chosen === "color" || spec.counter) return false;
  const hasKw = (k: string) => d.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.keywords?.some((k) => !hasKw(k))) return false;
  if (spec.notKeywords?.some(hasKw)) return false;
  // Only creature cards have power and toughness (CR 208.3).
  const creature = d.types.includes("Creature");
  if (spec.power && (!creature || !inRange(Number.parseInt(d.power ?? "0", 10) || 0, spec.power))) return false;
  if (spec.toughness && (!creature || !inRange(Number.parseInt(d.toughness ?? "0", 10) || 0, spec.toughness))) return false;
  if (spec.manaValue && !inRange(manaValue(parseManaCost(d.manaCost)), spec.manaValue)) return false;
  if (spec.named !== undefined && d.name !== spec.named) return false;
  return true;
}

const inRange = (n: number, r: Range) => (r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max);

export function isLegalTarget(s: GameState, spec: TargetSpec, t: TargetChoice, controller: PlayerId, src?: SourceQuality): boolean {
  if (t.kind === "none") return false;
  if (t.kind === "player") {
    const p = s.players[t.id];
    if (!p || p.lost) return false;
    if (spec.kind === "any") return !spec.opponent || t.id !== controller;
    if (spec.kind !== "player") return false;
    return !spec.opponent || t.id !== controller;
  }
  if (t.kind === "stack") {
    if (spec.kind !== "spell") return false;
    const item = s.stack.find((x) => x.id === t.id);
    if (!item || item.kind !== "spell" || !item.objectId) return false;
    // Nothing in the engine changes a spell's characteristics on the stack yet, so the card's are used.
    return printedMatches(spec, defOf(s, obj(s, item.objectId)));
  }
  const o = s.objects[t.id];
  if (!o) return false;
  if (t.zc !== undefined && (o.zoneChanges ?? 0) !== t.zc) return false; // it's a new object now (CR 400.7)
  if (spec.kind === "card") {
    // A card in a graveyard (CR 109.2a). Nothing in the engine changes characteristics in a
    // graveyard, so the printed card is what's checked; hexproof only works on the battlefield.
    if (o.zone !== "graveyard" || s.players[o.owner]?.lost) return false;
    if (spec.owner === "you" && o.owner !== controller) return false;
    if (spec.owner === "opponent" && o.owner === controller) return false;
    return printedMatches(spec, defOf(s, o));
  }
  if (spec.kind === "any") {
    // Any target is a creature, planeswalker or player (CR 115.4); "player or planeswalker" narrows the objects.
    const kinds = spec.types?.length ? spec.types : ["Creature", "Planeswalker"];
    return o.zone === "battlefield" && kinds.some((k) => objIsType(s, o, k)) && objectMatches(s, { ...spec, types: [] }, o, controller, true, src);
  }
  return spec.kind === "object" && objectMatches(s, spec, o, controller, true, src);
}

export function legalTargets(s: GameState, spec: TargetSpec, controller: PlayerId, excludeStackId?: string, src?: SourceQuality, sourceId?: ObjectId): ChosenTarget[] {
  const out: ChosenTarget[] = [];
  if (spec.kind === "player" || spec.kind === "any")
    for (const pid of livingPlayers(s)) out.push({ kind: "player", id: pid });
  if (spec.kind === "object" || spec.kind === "any") for (const id of s.battlefield) out.push({ kind: "object", id });
  if (spec.kind === "spell") for (const item of s.stack) if (item.id !== excludeStackId) out.push({ kind: "stack", id: item.id });
  if (spec.kind === "card") for (const pid of livingPlayers(s)) for (const id of player(s, pid).graveyard) out.push({ kind: "object", id });
  return out.filter((t) => isLegalTarget(s, spec, t, controller, src) && lesserPowerOk(s, spec, t, sourceId));
}

export const sameTarget = (a: TargetChoice | undefined, b: TargetChoice) => !!a && a.kind !== "none" && b.kind !== "none" && a.kind === b.kind && a.id === b.id;

/**
 * Can `t` be chosen for target `i`, after `chosen` for the ones before it? An "up to" target may be
 * left unchosen (CR 115.6); "another target" can't be the source, or one of the targets before it;
 * and one "two target creatures" can't pick the same creature twice (CR 115.3).
 */
export function canChooseTarget(s: GameState, specs: TargetSpec[], chosen: TargetChoice[], i: number, t: TargetChoice, controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean {
  const spec = specs[i]!;
  if (t.kind === "none") return !!spec.optional;
  if (!isLegalTarget(s, spec, t, controller, src)) return false;
  if (spec.notSource && t.kind === "object" && t.id === sourceId) return false;
  if (!lesserPowerOk(s, spec, t, sourceId)) return false;
  return !(spec.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t));
}

/**
 * "Target attacking creature with lesser power" (mentor): less than the source's power, its last known
 * power once it has left the battlefield (CR 702.134a, 608.2h).
 */
function lesserPowerOk(s: GameState, spec: TargetSpec, t: TargetChoice, sourceId: ObjectId | undefined): boolean {
  if (!spec.lesserPowerThanSource || t.kind !== "object" || !sourceId) return true; // without the source, checked later
  const me = s.objects[sourceId];
  const mine = me?.zone === "battlefield" ? power(s, me) : s.lastKnown?.[sourceId]?.power;
  const o = s.objects[t.id];
  return mine !== undefined && !!o && power(s, o) < mine;
}

/** Throws a message if `targets` isn't a legal, complete choice for `specs`. CR 601.2c */
export function targetProblem(s: GameState, specs: TargetSpec[], targets: TargetChoice[] | undefined, controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): string | null {
  const t = targets ?? [];
  if (t.length !== specs.length) return `choose ${specs.length} target(s): ${specs.map((x) => x.text).join(", ")}`;
  for (let i = 0; i < specs.length; i++) if (!canChooseTarget(s, specs, t, i, t[i]!, controller, src, sourceId)) return `illegal target for ${specs[i]!.text}`;
  return null;
}

/** Remember which object each target is right now, so a later zone change makes it a different object (CR 400.7). */
export const stampTargets = (s: GameState, targets: TargetChoice[] | undefined): TargetChoice[] | undefined =>
  targets?.map((t) => (t.kind === "object" ? { kind: "object", id: t.id, zc: s.objects[t.id]?.zoneChanges ?? 0 } : t));

/**
 * Could legal targets be chosen for all of `specs` (CR 601.2c, 603.3d)? "Up to" targets can be left
 * out, so only the others need something, each different where they must be.
 */
export function hasLegalTargets(s: GameState, specs: TargetSpec[], controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean {
  const options = specs.map((spec, i) => (spec.optional ? [] : legalTargets(s, spec, controller, undefined, src).filter((t) => canChooseTarget(s, specs, [], i, t, controller, src, sourceId))));
  if (options.some((o, i) => !specs[i]!.optional && !o.length)) return false;
  if (!specs.some((spec) => spec.distinctFrom?.length)) return true;
  // Some targets must differ from each other: look for one way to choose them all.
  const chosen: TargetChoice[] = [];
  const fill = (i: number): boolean => {
    if (i === specs.length) return true;
    if (specs[i]!.optional) {
      chosen[i] = { kind: "none" };
      return fill(i + 1);
    }
    for (const t of options[i]!) {
      if ((specs[i]!.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t))) continue;
      chosen[i] = t;
      if (fill(i + 1)) return true;
    }
    return false;
  };
  return fill(0);
}

// ---------------------------------------------------------------------------
// Modes (CR 700.2)

/** Which modes of a modal body can be chosen right now: one that needs targets needs legal ones (CR 700.2a). */
export const legalModes = (s: GameState, body: AbilityBody, controller: PlayerId, src?: SourceQuality): boolean[] =>
  body.modal ? body.modal.modes.map((m) => hasLegalTargets(s, m.targets, controller, src)) : [];

/** Is there a valid choice of modes? Spells and activated abilities need at least one mode. */
export function canChooseModes(s: GameState, body: AbilityBody, controller: PlayerId, src?: SourceQuality): boolean {
  if (!body.modal) return true;
  return legalModes(s, body, controller, src).filter(Boolean).length >= Math.max(1, body.modal.min);
}

/** Why these modes can't be chosen, or null. */
export function modesProblem(s: GameState, body: AbilityBody, modes: number[] | undefined, controller: PlayerId, src?: SourceQuality): string | null {
  if (!body.modal) return modes?.length ? "this isn't modal" : null;
  if (!modes) return "choose a mode";
  const count = modeCountProblem(body, modes);
  if (count) return count;
  const legal = legalModes(s, body, controller, src);
  const bad = modes.find((i) => !legal[i]);
  return bad === undefined ? null : `can't choose "${body.modal.modes[bad]!.text}": no legal targets`;
}

// ---------------------------------------------------------------------------
// Resolving

interface ResolveCtx {
  controller: PlayerId;
  sourceId?: ObjectId;
  sourceZc?: number;
  sourceDef: CardDef;
  targets: TargetChoice[];
  legal: boolean[]; // which targets are still legal on resolution
  spellControllers?: (PlayerId | null)[];
  spellObjects?: (ObjectId | null)[];
  /** The stack item that triggered this ability, for ward's "that spell or ability". */
  cause?: string;
  /** The object the trigger event was about (ObjRef "subject"). */
  subject?: { id: ObjectId; zc: number };
  lki?: LastKnown;
  /** The announced X (CR 107.3a). */
  x?: number;
  event?: TriggerEventInfo;
  /** Kicker costs paid for it (CR 702.33d). */
  kicked?: number[];
  /** What was sacrificed to cast it, as it last existed. */
  sacrificed?: LastKnown[];
  /** The creature type or color chosen as it resolves, or else as its source entered. */
  chosen?: Chosen;
}

export type Resolution = "fizzled" | "done" | "paused";

/**
 * Start resolving a spell or ability whose stack item has been removed from the stack.
 * Targets are re-checked first: if every target is now illegal it does nothing (CR 608.2b),
 * and effects aimed at individual illegal targets are skipped. Effects then run in order
 * (CR 608.2c); one that needs a player's choice pauses the resolution (see continueResolution).
 */
export function beginResolution(s: GameState, item: StackItem, body: AbilityBody): Resolution {
  const targets = item.targets ?? [];
  const src = item.kind === "spell" ? sourceQuality(s, undefined, (s.objects[item.objectId!] ? cardIdOf(s.objects[item.objectId!]!) : undefined)) : sourceQuality(s, item.sourceId, item.sourceCardId);
  const legal = body.targets.map((spec, i) => !!targets[i] && isLegalTarget(s, spec, targets[i]!, item.controller, src) && lesserPowerOk(s, spec, targets[i]!, item.sourceId));
  // With every target it chose now illegal, it doesn't resolve (CR 608.2b). One that chose none of its
  // "up to" targets isn't targeted at all, and resolves (CR 115.6).
  const chose = targets.some((t) => t.kind !== "none");
  if (body.targets.length && chose && !legal.some(Boolean)) return "fizzled";
  const spellControllers = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.controller ?? null) : null));
  const spellObjects = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.objectId ?? null) : null));
  s.resolving = {
    item,
    body,
    legal,
    next: 0,
    ...(spellControllers.some((c) => c !== null) ? { spellControllers } : {}),
    ...(spellObjects.some((c) => c !== null) ? { spellObjects } : {}),
  };
  return continueResolution(s);
}

/**
 * Run the resolving item's remaining effects. Returns "paused" when an effect is waiting on
 * a player (s.pending says who and what); the decision's action calls this again. When it
 * finishes, a resolved instant or sorcery goes to its owner's graveyard (CR 608.2n).
 */
export function continueResolution(s: GameState): Resolution {
  const r = s.resolving;
  if (!r) return "done";
  const { item } = r;
  const sourceDef = item.kind === "spell" ? defOf(s, obj(s, item.objectId!)) : s.cards[item.sourceCardId!]!;
  const ctx: ResolveCtx = {
    controller: item.controller,
    sourceId: item.kind === "spell" ? undefined : item.sourceId,
    sourceZc: item.sourceZc,
    sourceDef,
    targets: item.targets ?? [],
    legal: r.legal,
    spellControllers: r.spellControllers,
    spellObjects: r.spellObjects,
    cause: item.cause,
    subject: item.subject,
    lki: item.lki,
    x: item.x,
    event: item.event,
    kicked: item.kicked,
    sacrificed: item.sacrificed,
  };
  Object.defineProperty(ctx, "chosen", { get: () => r.chosen ?? sourceChosen(s, ctx), enumerable: true });
  while (r.next < r.body.effects.length) {
    if (!r.scratch) s.leftTogether = undefined; // a new instruction, not one resuming after a choice
    if (runEffect(s, r.body.effects[r.next]!, ctx) === "paused") return "paused";
    r.next++;
    r.scratch = undefined;
  }
  s.leftTogether = undefined;
  s.resolving = null;
  if (item.kind === "spell" && item.objectId && s.objects[item.objectId]?.zone === "stack") finishSpell(s, item.objectId);
  return "done";
}

/** What was chosen as the ability's source entered ("the chosen type"), while it's still that object. */
function sourceChosen(s: GameState, ctx: { sourceId?: ObjectId; sourceZc?: number }): Chosen | undefined {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc) ? o.chosen : undefined;
}

/** Put an exiled card onto the battlefield; an Aura needs something to enchant, or it stays in exile (CR 303.4f-g). */
function returnFromExile(s: GameState, c: GameObject, controller: PlayerId, src: string, counter?: CounterKind) {
  const d = defOf(s, c);
  if (!isPermanentCard(d)) return;
  let attachTo: ObjectId | undefined;
  if (d.subtypes.includes("Aura")) {
    attachTo = auraHostFor(s, c, controller);
    if (!attachTo) return;
  }
  log(s, `${src} returns ${d.name} to the battlefield.`);
  moveObject(s, c.id, "battlefield", { controller, ...(attachTo ? { attachTo } : {}), ...(counter ? { counters: { [counter]: 1 } } : {}) });
}

/**
 * Proliferate (CR 701.27a): choose any number of permanents and players with counters; each gets another of
 * each kind it has. Chosen for the player: their own permanents' helpful counters, opponents' permanents'
 * -1/-1 and stun counters, their own energy and experience, and opponents' poison.
 */
function proliferate(s: GameState, you: PlayerId, src: string) {
  const helpful = (k: string) => k !== "-1/-1" && k !== "stun" && k !== "age" && k !== "time" && k !== "fade";
  const names: string[] = [];
  invalidateCharacteristics(s);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const mine = controllerOf(s, o) === you;
    let added = false;
    for (const [k, n] of Object.entries(o.counters)) {
      if (!n || (mine ? !helpful(k) : !harmfulCounter(k))) continue;
      if (putCounters(s, o, k, 1)) added = true;
    }
    if (added) names.push(defOf(s, o).name);
  }
  for (const p of s.players) {
    if (p.lost) continue;
    if (p.id === you) {
      if (p.energy) (p.energy += 1), names.push(`${p.name} (energy)`);
    } else if (p.poison) (p.poison += 1), names.push(`${p.name} (poison)`);
  }
  log(s, `${src}: ${player(s, you).name} proliferates${names.length ? ` (${names.join(", ")})` : ""}.`);
}

/** Counters that hurt the permanent they're on: -1/-1 shrinks it, stun keeps it from untapping (CR 122.1d). */
export const harmfulCounter = (k: string) => k === "-1/-1" || k === "stun";

/**
 * Each player picks their own permanents, in APNAP order, then they're all sacrificed or returned to
 * their owners' hands at once (CR 101.4, 701.21a). With no more than they have to pick, there's no choice.
 */
function pickPermanents(s: GameState, e: Extract<Effect, { type: "pick" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const n = (sc.n ??= amountNow(s, e.n, ctx));
  const who = players(s, e.who, ctx);
  if (!sc.queue) {
    sc.queue = apnap(s, who);
    sc.chosen = {};
  }
  while (sc.queue.length) {
    const pid = sc.queue[0]!;
    const options = pickOptions(s, e, pid);
    if (options.length > n) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.filter.text, options, count: n, ...(e.counter ? { counter: e.counter.kind } : {}) };
      return "paused";
    }
    sc.chosen![pid] = options;
    sc.queue.shift();
  }
  for (const pid of apnap(s, who))
    for (const id of sc.chosen![pid] ?? []) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.action === "populate") {
        if (s.resolving) s.resolving.created ??= [];
        tokenCopies(s, pid, defOf(s, o), 1, ctx);
        continue;
      }
      if (e.action === "counters") {
        const k = e.counter!.kind;
        const c = amountNow(s, e.counter!.n, ctx);
        if (c <= 0) continue;
        invalidateCharacteristics(s);
        const put = putCounters(s, o, k, c);
        log(s, `${player(s, pid).name} puts ${put} ${k} counter${put > 1 ? "s" : ""} on ${defOf(s, o).name}.`);
        continue;
      }
      log(s, e.action === "sacrifice" ? `${player(s, pid).name} sacrifices ${defOf(s, o).name}.` : `${player(s, pid).name} returns ${defOf(s, o).name} to its owner's hand.`);
      moveObject(s, id, e.action === "sacrifice" ? "graveyard" : "hand");
    }
}

/** Create `n` tokens that are copies of `base` for this player (CR 707.2), doubled by token doublers (CR 614.1a). */
function tokenCopies(s: GameState, pid: PlayerId, base: CardDef, n: number, ctx: ResolveCtx, opts: { except?: CopyExcept; tapped?: boolean; attacking?: boolean; defender?: PlayerId } = {}) {
  const key = copyKey(s, base, opts.except);
  const k = tokensToCreate(s, pid, s.cards[key]!, n);
  const defender = opts.defender ?? (opts.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined);
  for (let i = 0; i < k; i++) {
    const o = newObject(s, s.cards[key]!, pid, "exile");
    o.isToken = true;
    moveObject(s, o.id, "battlefield", opts.tapped || opts.attacking ? { tapped: true } : {});
    if (defender !== undefined && o.zone === "battlefield") o.attacking = defender;
    s.resolving?.created?.push(o.id);
  }
  if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a token that's a copy" : `${k} tokens that are copies`} of ${base.name}.`);
}

/** The permanents a player could pick for a "pick" effect: their own, matching the filter (not targeted, so hexproof doesn't matter). */
export function pickOptions(s: GameState, e: { filter: TargetSpec }, pid: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), pid, false));
}

/** Players in APNAP order: the active player first, then in turn order (CR 101.4). */
function apnap(s: GameState, pids: PlayerId[]): PlayerId[] {
  const i = s.turnOrder.indexOf(s.activePlayer);
  const order = [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
  return order.filter((p) => pids.includes(p));
}

function objects(s: GameState, ref: ObjRef, ctx: ResolveCtx): GameObject[] {
  if (ref.ref === "self") {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    // If it left the battlefield (even if it came back), it's a different object now (CR 400.7).
    if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return [];
    return [o];
  }
  if (ref.ref === "target") {
    const out: GameObject[] = [];
    for (let i = ref.index; i < ref.index + (ref.n ?? 1); i++) {
      const t = ctx.targets[i];
      if (ctx.legal[i] && t?.kind === "object") out.push(obj(s, t.id));
    }
    return out;
  }
  if (ref.ref === "selfCard") {
    // The card a leaves-the-battlefield trigger came from, in its new zone, while it's still that object (CR 400.7).
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    return o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.sourceZc ? [o] : [];
  }
  if (ref.ref === "subjectCard") {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    return o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
  }
  if (ref.ref === "damagedThisWay") return (s.resolving?.damagedThisWay ?? []).map((id) => obj(s, id)).filter((o) => o.zone === "battlefield");
  if (ref.ref === "sacrificed") return []; // gone: only its last known information is used
  if (ref.ref === "created") return (s.resolving?.created ?? []).map((id) => s.objects[id]).filter((o): o is GameObject => o?.zone === "battlefield");
  if (ref.ref === "attached") {
    // What the Aura or Equipment is attached to, while it's still the object the ability came from (CR 400.7).
    // If it's gone (sacrificed to pay for the ability), what it was attached to as it last existed (CR 608.2h).
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (!me) return [];
    const same = ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc;
    let host: GameObject | undefined;
    if (me.zone === "battlefield" && same) host = me.attachedTo ? s.objects[me.attachedTo] : undefined;
    else {
      const lk = s.lastKnown?.[me.id];
      const was = lk && lk.zc === ctx.sourceZc ? lk.attachedTo : undefined;
      host = was && (s.objects[was.id]?.zoneChanges ?? 0) === was.zc ? s.objects[was.id] : undefined;
    }
    return host?.zone === "battlefield" ? [host] : [];
  }
  if (ref.ref === "subject") {
    // Only while it's still the same object on the battlefield (CR 400.7).
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
  }
  if (ref.ref === "each") {
    const filter = bindChosen(ref.filter, ctx.chosen);
    const t = ref.otherThan !== undefined ? ctx.targets[ref.otherThan] : undefined;
    const except = t?.kind === "object" ? t.id : ref.other ? ctx.sourceId : undefined;
    return s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== except && objectMatches(s, filter, o, ctx.controller, false));
  }
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Creature") && !(ref.other && o.id === ctx.sourceId) && !(ref.attacking && o.attacking === undefined))
    .filter((o) => {
      const c = controllerOf(s, o);
      return ref.controller === "you" ? c === ctx.controller : ref.controller === "opponent" ? c !== ctx.controller : true;
    });
}

function players(s: GameState, ref: PlayerRef, ctx: ResolveCtx): PlayerId[] {
  switch (ref.ref) {
    case "you":
      return [ctx.controller];
    case "eachOpponent":
      return opponents(s, ctx.controller);
    case "eachPlayer":
      return livingPlayers(s);
    case "target": {
      const t = ctx.targets[ref.index];
      return ctx.legal[ref.index] && t?.kind === "player" ? [t.id] : [];
    }
    case "eventPlayer":
      return ctx.event?.player !== undefined && !player(s, ctx.event.player).lost ? [ctx.event.player] : [];
    case "subjectController": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o) return [];
      if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc) return [controllerOf(s, o)];
      // It left the battlefield: its controller as it last existed (CR 608.2h).
      const lk = s.lastKnown?.[o.id];
      return lk && lk.zc === ctx.subject!.zc ? [lk.controller] : [];
    }
    case "targetController": {
      const t = ctx.targets[ref.index];
      if (!ctx.legal[ref.index] || !t) return [];
      // A spell that's been countered by now: its controller as it was (last known information, CR 608.2h).
      if (t.kind === "stack") {
        const c = ctx.spellControllers?.[ref.index];
        return c === null || c === undefined ? [] : [c];
      }
      if (t.kind !== "object") return [];
      const o = s.objects[t.id];
      if (!o) return [];
      // Gone from the battlefield (destroyed by an earlier part of this): its controller as it last existed (CR 608.2h).
      const lk = s.lastKnown?.[o.id];
      if (o.zone !== "battlefield" && lk && lk.zc === (o.zoneChanges ?? 0) - 1) return [lk.controller];
      return [controllerOf(s, o)];
    }
  }
}

function runEffect(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const result = runEffectInner(s, e, ctx);
  invalidateCharacteristics(s);
  return result;
}

/** An amount as the ability works it out now (CR 608.2h). A negative result counts as 0 (CR 107.1b). */
function amountNow(s: GameState, a: Amount, ctx: ResolveCtx): number {
  return Math.max(0, evalAmount(s, a, amountCtx(s, ctx)));
}

const amountCtx = (s: GameState, ctx: ResolveCtx): AmountCtx => ({
  controller: ctx.controller,
  sourceId: ctx.sourceId,
  sourceZc: ctx.sourceZc,
  x: ctx.x,
  event: ctx.event,
  lki: ctx.lki,
  kicked: ctx.kicked,
  sacrificed: ctx.sacrificed,
  chosen: ctx.chosen,
  objects: (r) => {
    if (r.ref === "subject") return subjectEvenIfGone(s, ctx);
    // A targeted spell: its card, even after it's been countered ("its mana value").
    const spell = r.ref === "target" && ctx.legal[r.index] ? ctx.spellObjects?.[r.index] : undefined;
    if (spell && s.objects[spell]) return [s.objects[spell]!];
    return objects(s, r, ctx);
  },
  players: (r) => players(s, r, ctx),
});

/** The trigger's subject, also after it left the battlefield, so its last known power can be used (CR 608.2h). */
function subjectEvenIfGone(s: GameState, ctx: ResolveCtx): GameObject[] {
  const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
  if (!o) return [];
  const zc = o.zoneChanges ?? 0;
  return zc === ctx.subject!.zc ? [o] : zc === ctx.subject!.zc + 1 && o.zone !== "battlefield" ? [o] : [];
}

/**
 * A resolving effect's changes with their numbers worked out now: "gets +X/+X" doesn't change
 * later if X's count does (CR 608.2h, 611.2c).
 */
function fixMods(s: GameState, mods: Modification[], ctx: ResolveCtx): Modification[] {
  const c = amountCtx(s, ctx);
  return mods.map((m) =>
    m.kind === "modifyPT" || m.kind === "setPT"
      ? { ...m, power: evalAmount(s, m.power, c), toughness: evalAmount(s, m.toughness, c) }
      : // "Gains protection from the color of your choice": the color chosen as it resolved.
        m.kind === "addKeywords" && m.keywords.includes(CHOSEN_PROTECTION)
        ? { ...m, keywords: bindChosenKeywords(m.keywords, s.resolving?.chosen?.color) }
        : m,
  );
}

function runEffectInner(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const src = ctx.sourceDef.name;
  switch (e.type) {
    case "damage": {
      const amount = amountNow(s, e.amount, ctx);
      const all = [e.to, ...(e.also ?? [])].map((to) => damageRecipients(s, to, ctx));
      const objs = all.flatMap((x) => x.objs);
      const pids = all.flatMap((x) => x.pids);
      const from = ctxSource(s, ctx);
      // All dealt at once: lifelink is one life-gain event (CR 119.10).
      const lifelink = { n: 0 };
      let dealt = 0;
      for (const o of objs) {
        const n = dealDamage(s, from, { object: o }, amount, { lifelink });
        dealt += n;
        if (n > 0 && s.resolving) (s.resolving.damagedThisWay ??= []).push(o.id);
      }
      for (const pid of pids) dealt += dealDamage(s, from, { player: pid }, amount, { lifelink });
      gainLife(s, from.controller, lifelink.n);
      if (dealt && from.id) fireEvent(s, { type: "dealtDamage", id: from.id, amount: dealt, combat: false });
      return;
    }
    case "preventNext": {
      // A shield for the next N damage this turn (CR 615.7), used up by damage from any source.
      const n = amountNow(s, e.n, ctx);
      const { objs, pids } = damageRecipients(s, e.to, ctx);
      for (const x of [...objs, ...pids.map((pid) => player(s, pid))]) {
        x.preventNext = (x.preventNext ?? 0) + n;
        log(s, `${src} will prevent the next ${n} damage to ${"cardId" in x ? defOf(s, x).name : x.name} this turn.`);
      }
      return;
    }
    case "preventCombatDamage":
      s.preventCombatDamage = true;
      log(s, `${src}: all combat damage will be prevented this turn.`);
      return;
    case "pumpPerBlocker":
      for (const o of objects(s, e.what, ctx)) {
        // Counted as it resolves (CR 702.23b).
        const n = (o.blockedBy?.length ?? 0) - (e.beyondFirst ? 1 : 0);
        if (n <= 0) continue;
        runEffectInner(s, { type: "continuous", what: e.what, mods: [{ kind: "modifyPT", power: e.power * n, toughness: e.toughness * n }], duration: "endOfTurn" }, ctx);
      }
      return;
    case "returnToBattlefield": {
      // Persist and undying return the card that was put into the graveyard, if it's still there as that
      // same object (CR 400.7), under its owner's control.
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== ctx.sourceZc) return;
      log(s, `${src} returns to the battlefield${e.counter ? ` with a ${e.counter} counter on it` : ""}.`);
      moveObject(s, o.id, "battlefield", { controller: o.owner, ...(e.counter ? { counters: { [e.counter]: 1 } } : {}) });
      return;
    }
    case "draw":
      // Worked out for each player in turn: "draws cards equal to the number of cards in their hand".
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        draw(s, pid, n);
        log(s, `${player(s, pid).name} draws ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "getEnergy":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        const p = player(s, pid);
        p.energy = (p.energy ?? 0) + n;
        log(s, `${p.name} gets ${"{E}".repeat(Math.min(n, 10))}${n > 10 ? ` (${n})` : ""}.`);
      }
      return;
    case "unearth": {
      // CR 702.84a: only if it's still the same card in the graveyard (CR 400.7).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== ctx.sourceZc) return;
      moveObject(s, o.id, "battlefield", { controller: ctx.controller });
      o.exileIfLeaves = "battlefield";
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [{ type: "exile", what: { ref: "subject" } }], text: "Exile ~ (unearth)." });
      log(s, `${src} returns to the battlefield with haste.`);
      return;
    }
    case "castFromExileFree": {
      // Rebound (CR 702.88a): the card has to still be in exile, the same object (CR 400.7).
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      sc.may = false;
      s.pending = { kind: "castFree", player: p.id, objectId: o.id, source: src };
      if (castProblem(s, p.id, o.id) === null) return "paused";
      s.pending = null;
      log(s, `${src} can't be cast.`);
      return;
    }
    case "becomeMonarch":
      for (const pid of players(s, e.who, ctx)) becomeMonarch(s, pid);
      return;
    case "gainLife":
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (!n) continue;
        gainLife(s, pid, n);
        log(s, `${player(s, pid).name} gains ${n} life.`);
      }
      return;
    case "loseLife": {
      let total = 0;
      for (const pid of players(s, e.who, ctx)) {
        const n = amountNow(s, e.n, ctx);
        if (n <= 0) continue;
        player(s, pid).life -= n;
        total += n;
        log(s, `${player(s, pid).name} loses ${n} life.`);
      }
      if (e.drain && total > 0) {
        gainLife(s, ctx.controller, total);
        log(s, `${player(s, ctx.controller).name} gains ${total} life.`);
      }
      return;
    }
    case "destroy":
      for (const o of objects(s, e.what, ctx)) destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, e.noRegen);
      return;
    case "regenerate":
      for (const o of objects(s, e.what, ctx)) {
        o.regenShields = (o.regenShields ?? 0) + 1;
        log(s, `${defOf(s, o).name} gets a regeneration shield.`);
      }
      return;
    case "exile": {
      // "Until ~ leaves the battlefield": if it already left, nothing is exiled (CR 610.3a-b).
      const me = e.until ? objects(s, { ref: "self" }, ctx)[0] : undefined;
      if (e.until && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} exiles ${defOf(s, o).name}${e.until ? ` until ${src} leaves the battlefield` : ""}.`);
        moveObject(s, o.id, "exile");
        if (me && o.zone === "exile") (me.exiledUntilLeaves ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
        // Linked to the source as it was when the ability triggered: if that object has already left, its
        // leaves ability has nothing to return, and the card stays exiled (CR 607.2a, rulings).
        if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
      }
      return;
    }
    case "returnLinked": {
      // The leaves ability triggered after the source moved, so the object it links to is the one before (CR 400.7).
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const cards = (s.linkedExile?.[key] ?? []).map((l) => s.objects[l.id]).filter((c, i): c is GameObject => !!c && c.zone === "exile" && (c.zoneChanges ?? 0) === s.linkedExile![key]![i]!.zc && !c.isToken);
      delete s.linkedExile?.[key];
      for (const c of cards) {
        const d = defOf(s, c);
        if (e.dest === "hand") {
          log(s, `${src} returns ${d.name} to its owner's hand.`);
          moveObject(s, c.id, "hand");
          continue;
        }
        let attachTo: ObjectId | undefined;
        if (d.subtypes.includes("Aura")) {
          attachTo = auraHostFor(s, c, c.owner);
          if (!attachTo) continue; // nothing it can enchant: it stays in exile (CR 303.4g)
        }
        log(s, `${src} returns ${d.name} to the battlefield.`);
        moveObject(s, c.id, "battlefield", { controller: c.owner, ...(attachTo ? { attachTo } : {}) });
      }
      return;
    }
    case "pick":
      return pickPermanents(s, e, ctx, src);
    case "bounce":
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} returns ${defOf(s, o).name}${o.zone === "graveyard" ? " from the graveyard" : ""} to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      return;
    case "putOntoBattlefield":
      for (const o of objects(s, e.what, ctx)) {
        const d = defOf(s, o);
        // An Aura put onto the battlefield this way needs a choice of what it enchants (CR 303.4f);
        // the compiler doesn't produce this effect for cards that could be Auras, so this is a safeguard.
        if (!isPermanentCard(d) || d.subtypes.includes("Aura")) continue;
        log(s, `${src} puts ${d.name} onto the battlefield under ${player(s, ctx.controller).name}'s control${e.tapped ? ", tapped" : ""}.`);
        moveObject(s, o.id, "battlefield", { controller: ctx.controller, tapped: e.tapped }); // CR 110.2a
      }
      return;
    case "putInLibrary":
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} puts ${defOf(s, o).name} on the ${e.position} of its owner's library.`);
        moveObject(s, o.id, "library", { top: e.position === "top" });
      }
      return;
    case "exileGraveyard":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = p.graveyard.length;
        for (const id of [...p.graveyard]) moveObject(s, id, "exile");
        log(s, `${src} exiles ${p.name}'s graveyard (${n} card${n === 1 ? "" : "s"}).`);
      }
      return;
    case "tap":
    case "untap":
      for (const o of objects(s, e.what, ctx)) {
        if (e.type === "tap") o.tapped = true;
        else untapPermanent(s, o);
      }
      return;
    case "proliferate":
      return proliferate(s, ctx.controller, src);
    case "amass": {
      // CR 701.47a: with no Army, create a 0/0 black [subtype] Army first; then counters on an Army you control,
      // which becomes that subtype too. With several Armies, the one with the most counters is chosen.
      const n = amountNow(s, e.n, ctx);
      const armies = () => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === ctx.controller && characteristics(s, o).subtypes.includes("Army") && objIsType(s, o, "Creature"));
      if (!armies().length) {
        const army: TokenSpec = { name: `${e.subtype} Army`, power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: [e.subtype, "Army"], keywords: [] };
        for (let i = 0; i < tokensToCreate(s, ctx.controller, army, 1); i++) createToken(s, ctx.controller, army);
      }
      const army = armies().sort((a, b) => (b.counters["+1/+1"] ?? 0) - (a.counters["+1/+1"] ?? 0))[0];
      if (!army) return;
      invalidateCharacteristics(s);
      if (n > 0) putCounters(s, army, "+1/+1", n);
      log(s, `${player(s, ctx.controller).name} amasses ${e.subtype} ${n}.`);
      if (!characteristics(s, army).subtypes.includes(e.subtype))
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [army.id], mods: [{ kind: "addTypes", types: [], subtypes: [e.subtype] }] });
      return;
    }
    case "flicker":
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        const d = defOf(s, o);
        log(s, `${src} exiles ${d.name}${e.at ? "" : " and returns it"}.`);
        moveObject(s, o.id, "exile");
        if (o.isToken) continue; // a token that left the battlefield doesn't come back (CR 111.7)
        if (e.at)
          addDelayed(s, "nextEndStep", ctx.controller, o, {
            targets: [],
            effects: [{ type: "returnExiled", under: e.under, ...(e.counter ? { counter: e.counter } : {}) }],
            text: `Return ${d.name} to the battlefield under ${e.under === "owner" ? "its owner's" : "your"} control.`,
          });
        else returnFromExile(s, o, e.under === "owner" ? o.owner : ctx.controller, src, e.counter);
      }
      return;
    case "returnExiled": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      returnFromExile(s, o, e.under === "owner" ? o.owner : ctx.controller, src, e.counter);
      return;
    }
    case "exileIfDies":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.exileIfDiesTurn = s.turn;
      return;
    case "connive": {
      // CR 701.50a: its controller draws, then discards; each nonland card discarded is a +1/+1 counter on it.
      // If it already left the battlefield, its controller as it last existed still draws and discards (CR 701.50c).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.connive) {
        const o = objects(s, e.what, ctx)[0];
        const pid = o ? controllerOf(s, o) : ctx.controller;
        const n = (sc.n = amountNow(s, e.n, ctx));
        sc.connive = { pid, ...(o ? { id: o.id, zc: o.zoneChanges ?? 0 } : {}) };
        if (n <= 0) return;
        log(s, `${o ? defOf(s, o).name : src} connives${n > 1 ? ` ${n}` : ""}.`);
        draw(s, pid, n);
        sc.queue = [pid];
        sc.chosen = {};
      }
      const { pid, id, zc } = sc.connive;
      const n = sc.n ?? 0;
      if (n <= 0) return;
      if (sc.queue!.length) {
        const hand = player(s, pid).hand;
        if (hand.length > n) {
          s.pending = { kind: "discard", player: pid, count: n, source: src };
          return "paused";
        }
        sc.chosen![pid] = [...hand];
        sc.queue!.shift();
      }
      const ids = sc.chosen![pid] ?? [];
      const nonland = ids.filter((x) => !defOf(s, obj(s, x)).types.includes("Land")).length;
      discardCards(s, pid, ids);
      const o = id ? s.objects[id] : undefined;
      if (nonland && o?.zone === "battlefield" && (o.zoneChanges ?? 0) === zc) {
        invalidateCharacteristics(s);
        putCounters(s, o, "+1/+1", nonland);
        log(s, `${defOf(s, o).name} gets ${nonland} +1/+1 counter${nonland > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "skipUntap":
      // Its controller's next untap step skips it, then it untaps as usual (CR 502.3).
      for (const o of objects(s, e.what, ctx)) o.skipNextUntap = true;
      return;
    case "counters": {
      const base = amountNow(s, e.n, ctx);
      const n = e.perLastKnownCounter ? base * (ctx.lki?.counters?.[e.perLastKnownCounter] ?? 0) : base;
      if (n <= 0) return;
      for (const o of objects(s, e.what, ctx)) {
        invalidateCharacteristics(s);
        const put = putCounters(s, o, e.counter, n);
        log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "sacrifice":
      for (const o of objects(s, e.what, ctx)) {
        if (controllerOf(s, o) !== ctx.controller) continue; // only your own permanents (CR 701.21a)
        log(s, `${player(s, ctx.controller).name} sacrifices ${characteristics(s, o).name}.`);
        moveObject(s, o.id, "graveyard");
      }
      return;
    case "delayed": {
      // A spell's own object (it's on its way to the graveyard), or the source of the ability.
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const body = { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." };
      if (e.each === "created") {
        for (const t of s.resolving?.created ?? []) if (s.objects[t]?.zone === "battlefield") addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
        return;
      }
      if (e.each === "subject") {
        const subj = objects(s, { ref: "subject" }, ctx)[0];
        if (subj) addDelayed(s, e.when, ctx.controller, subj, body, cardIdOf(s.objects[id ?? ""] ?? subj));
        return;
      }
      const o = id ? s.objects[id] : undefined;
      if (o) addDelayed(s, e.when, ctx.controller, o, body);
      return;
    }
    case "ninjutsu": {
      // Put this card onto the battlefield from your hand tapped and attacking whom the returned creature was
      // attacking (CR 702.49a, c). It was never declared as an attacker, so "whenever attacks" doesn't trigger (508.4).
      const id = ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      const zc = s.resolving?.item.sourceZc;
      if (!o || o.zone !== "hand" || o.owner !== ctx.controller || (zc !== undefined && (o.zoneChanges ?? 0) !== zc)) return;
      moveObject(s, o.id, "battlefield", { tapped: true });
      if ((o.zone as string) !== "battlefield") return;
      const defender = ctx.lki?.attacking;
      if (defender !== undefined && inCombat(s) && livingPlayers(s).includes(defender)) o.attacking = defender;
      log(s, `${player(s, ctx.controller).name} puts ${characteristics(s, o).name} onto the battlefield tapped${o.attacking !== undefined ? ` and attacking ${player(s, o.attacking).name}` : ""} (ninjutsu).`);
      return;
    }
    case "impulse": {
      // Exiled face up (CR 406.3); the permission belongs to this object only (CR 400.7).
      const p = player(s, ctx.controller);
      const ids = p.library.slice(0, amountNow(s, e.n, ctx));
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn };
      }
      if (ids.length)
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library and may play ${ids.length === 1 ? "it" : "them"} ${e.until === "thisTurn" ? "this turn" : "until the end of their next turn"}.`);
      return;
    }
    case "moveCounter": {
      // Remove it from the first and put it on the second; if either can't happen, neither does (CR 122.5).
      const from = objects(s, e.from, ctx)[0];
      const to = objects(s, e.to, ctx)[0];
      if (!from || !to || from.id === to.id || !(from.counters[e.counter] ?? 0)) return;
      from.counters[e.counter]! -= 1;
      const put = putCounters(s, to, e.counter, 1);
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, from).name} moves a ${e.counter} counter onto ${characteristics(s, to).name}${put > 1 ? ` (${put} counters are put on it)` : ""}.`);
      return;
    }
    case "myriad": {
      // Each choice first; then the tokens all enter at once (myriad rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const defending = ctx.event?.player;
      if (!sc.queue) {
        sc.queue = apnap(s, opponents(s, ctx.controller).filter((p) => p !== defending));
        sc.chosen = {};
      }
      const me = objects(s, { ref: "self" }, ctx)[0];
      const base = me ? defOf(s, me) : ctx.sourceDef; // as it last existed if it's gone (CR 707.2, 608.2h)
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        if (sc.may === undefined) {
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `create a token copy of ${base.name} attacking ${player(s, pid).name}`, source: src };
          return "paused";
        }
        if (sc.may) sc.chosen![pid] = [];
        sc.may = undefined;
        sc.queue.shift();
      }
      r.created = [];
      if (!inCombat(s)) return;
      for (const pid of Object.keys(sc.chosen!).map(Number) as PlayerId[])
        if (livingPlayers(s).includes(pid)) tokenCopies(s, ctx.controller, base, 1, ctx, { tapped: true, defender: pid });
      return;
    }
    case "removeCounters":
      for (const o of objects(s, e.what, ctx)) {
        const had = o.counters[e.counter] ?? 0;
        const n = Math.min(had, e.n === "all" ? had : amountNow(s, e.n, ctx));
        if (n <= 0) continue;
        o.counters[e.counter] = had - n;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses ${n} ${e.counter} counter${n > 1 ? "s" : ""}.`);
        if (had === n && e.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      }
      return;
    case "removeSelfCounter": {
      // Fading (CR 702.32a): "remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      // Vanishing (CR 702.63a): removing the last time counter triggers its sacrifice ability.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o) return;
      const name = characteristics(s, o).name;
      const had = o.counters[e.counter] ?? 0;
      if (had > 0) {
        o.counters[e.counter] = had - 1;
        log(s, `${name} loses a ${e.counter} counter (${had - 1} left).`);
        if (had === 1 && e.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      } else if (e.orSacrifice && controllerOf(s, o) === ctx.controller) {
        log(s, `${player(s, ctx.controller).name} sacrifices ${name}: it has no ${e.counter} counters left.`);
        moveObject(s, o.id, "graveyard");
      }
      return;
    }
    case "renown": {
      // "If it isn't renowned" again as it resolves (CR 603.4); gone means it can't become renowned.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o || o.renowned) return;
      putCounters(s, o, "+1/+1", e.n);
      o.renowned = true;
      log(s, `${characteristics(s, o).name} gets ${e.n} +1/+1 counter${e.n > 1 ? "s" : ""} and becomes renowned.`);
      return;
    }
    case "evolve": {
      // Compared again as it resolves; with the entering creature gone, as it last existed (CR 603.4, 702.100a).
      const o = objects(s, { ref: "self" }, ctx)[0];
      const sub = ctx.subject && s.objects[ctx.subject.id];
      const still = sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === ctx.subject!.zc;
      if (still && !objIsType(s, sub, "Creature")) return; // CR 702.100c
      const stats = still ? { power: power(s, sub), toughness: toughness(s, sub) } : ctx.lki;
      if (!o || !stats || !evolves(s, o, stats)) {
        log(s, `${src}'s evolve does nothing.`);
        return;
      }
      putCounters(s, o, "+1/+1", 1);
      log(s, `${characteristics(s, o).name} evolves.`);
      return;
    }
    case "cascade": {
      // CR 702.85a. The spell's mana value is its own, even if it has left the stack by now (last known information).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.cascade) {
        const limit = manaValue(parseManaCost(ctx.sourceDef.manaCost));
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && manaValue(parseManaCost(d.manaCost)) < limit) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        log(s, `${src} cascades: ${p.name} exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, hitting ${defOf(s, obj(s, hit)).name}` : ", finding nothing to cast"}.`);
        if (hit) {
          // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src };
          if (castProblem(s, p.id, hit) === null) return "paused";
          s.pending = null;
          log(s, `${defOf(s, obj(s, hit)).name} can't be cast.`);
        }
      }
      const rest = sc.cascade.exiled.filter((id) => s.objects[id]?.zone === "exile");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      return;
    }
    case "explore": {
      // CR 701.44a. The controller decides about a nonland card after the counter is put on (rulings).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (sc.explored === undefined) {
        const self = objects(s, { ref: "self" }, ctx)[0];
        const top = p.library[0];
        const name = self ? characteristics(s, self).name : src;
        if (top && isType(defOf(s, obj(s, top)), "Land")) {
          log(s, `${name} explores: ${p.name} reveals ${defOf(s, obj(s, top)).name} and puts it into their hand.`);
          moveObject(s, top, "hand");
          return;
        }
        log(s, `${name} explores${top ? `: ${p.name} reveals ${defOf(s, obj(s, top)).name}` : ""}.`);
        if (self) {
          putCounters(s, self, "+1/+1", 1);
          invalidateCharacteristics(s);
        }
        if (!top) return; // nothing revealed: just the counter (rulings)
        sc.explored = top;
        s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${defOf(s, obj(s, top)).name} into your graveyard`, source: src, card: top };
        return "paused";
      }
      if (sc.may && p.library[0] === sc.explored) moveObject(s, sc.explored, "graveyard");
      return;
    }
    case "continuous": {
      // The affected set is locked in now (CR 611.2c).
      // Backup: "If that's another creature, it gains ..." (CR 702.165a).
      const affected = objects(s, e.what, ctx).map((o) => o.id).filter((id) => !(e.notSource && id === ctx.sourceId));
      if (!affected.length) return;
      const mods = fixMods(s, e.mods, ctx);
      s.effects.push({
        id: `e${s.nextId++}`,
        timestamp: s.nextTimestamp++, // CR 613.7b
        controller: ctx.controller,
        sourceName: src,
        sourceId: ctx.sourceId,
        duration: e.duration,
        affected,
        mods,
      });
      const names = affected.map((id) => defOf(s, obj(s, id)).name);
      log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, mods, ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : ""}.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || !me || me.zone !== "battlefield" || me.attachedTo === host.id || host.id === me.id) return; // CR 701.3b-c
      if (objIsType(s, me, "Creature")) return; // an Equipment that's also a creature can't equip (CR 301.5c)
      // Only to something it could be attached to: an Equipment to a creature (CR 301.5c), an Aura to
      // what it can enchant (CR 303.4d), neither to something with protection from it (CR 702.16c-d).
      const enchant = compileCard(defOf(s, me)).enchant;
      const meChars = characteristics(s, me);
      if (meChars.subtypes.includes("Aura") ? !enchant || !objectMatches(s, enchant, host, ctx.controller, false, meChars) : !objIsType(s, host, "Creature") || !objectMatches(s, { kind: "object", text: "" }, host, ctx.controller, false, meChars)) return;
      me.attachedTo = host.id;
      me.timestamp = s.nextTimestamp++;
      log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
      return;
    }
    case "createTokenCopy": {
      // The copiable values of what it copies as it is now, or as it last existed (CR 707.2, 608.2h): a card in
      // a graveyard is copied as that card.
      const source = e.ofSource ? undefined : objects(s, e.what, ctx)[0];
      const base = e.ofSource ? ctx.sourceDef : source && defOf(s, source);
      if (!base) return;
      const n = amountNow(s, e.n, ctx);
      if (s.resolving) s.resolving.created = [];
      for (const pid of players(s, e.who, ctx)) tokenCopies(s, pid, base, n, ctx, e);
      return;
    }
    case "createToken": {
      const n = amountNow(s, e.n, ctx);
      if (s.resolving) s.resolving.created = [];
      // Token doublers apply per player (CR 614.1a): "twice that many of those tokens".
      for (const pid of players(s, e.who, ctx)) {
        const k = tokensToCreate(s, pid, e.token, n);
        // "Tapped and attacking" (CR 508.4): put onto the battlefield attacking, never declared as attackers.
        const defender = e.attacking ? attackDefault(s, pid, ctx.sourceId) : undefined;
        for (let i = 0; i < k; i++) createToken(s, pid, e.token, { tapped: e.tapped || e.attacking, attacking: defender });
        if (k) log(s, `${src} creates ${k === 1 ? "a" : k}${e.tapped || e.attacking ? " tapped" : ""}${defender !== undefined ? " and attacking" : ""} ${e.token.power !== undefined ? `${e.token.power}/${e.token.toughness} ` : ""}${e.token.name} token${k > 1 ? "s" : ""}${defender !== undefined && livingPlayers(s).length > 2 ? ` (attacking ${player(s, defender).name})` : ""}.`);
      }
      return;
    }
    case "mill":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = amountNow(s, e.n, ctx);
        for (const id of p.library.slice(0, n)) moveObject(s, id, "graveyard");
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"}.`);
      }
      return;
    case "discard": {
      const who = players(s, e.who, ctx);
      // Worked out once, before anyone discards.
      const sc0 = (s.resolving!.scratch ??= {});
      const n = (sc0.n ??= amountNow(s, e.n, ctx));
      if (e.random) {
        for (const pid of apnap(s, who)) {
          const hand = player(s, pid).hand;
          const picked: ObjectId[] = [];
          const pool = [...hand];
          for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
          discardCards(s, pid, picked, " at random");
        }
        return;
      }
      // Each player chooses in APNAP order, then the cards are discarded at the same time (CR 101.4, 701.9b).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.queue) {
        sc.queue = apnap(s, who);
        sc.chosen = {};
      }
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        const hand = player(s, pid).hand;
        if (hand.length > n) {
          s.pending = { kind: "discard", player: pid, count: n, source: src };
          return "paused";
        }
        sc.chosen![pid] = [...hand]; // no choice to make: the whole hand
        sc.queue.shift();
      }
      for (const pid of apnap(s, who)) discardCards(s, pid, sc.chosen![pid] ?? []);
      return;
    }
    case "scry":
    case "surveil": {
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const arranged = r.scratch?.arranged;
      if (!arranged) {
        const cards = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!cards.length) return; // scry 0 / empty library: nothing happens (CR 701.22b)
        s.pending = { kind: "arrangeTop", player: p.id, how: e.type, cards, source: src };
        return "paused";
      }
      const looked = new Set([...arranged.top, ...arranged.away]);
      const rest = p.library.filter((id) => !looked.has(id));
      if (e.type === "scry") {
        p.library = [...arranged.top, ...rest, ...arranged.away];
        log(s, `${p.name} scries ${looked.size}: ${arranged.top.length} on top, ${arranged.away.length} on the bottom.`);
      } else {
        p.library = [...arranged.top, ...rest, ...arranged.away];
        for (const id of arranged.away) moveObject(s, id, "graveyard");
        const names = arranged.away.map((id) => defOf(s, obj(s, id)).name);
        log(s, `${p.name} surveils ${looked.size}${names.length ? `, putting ${names.join(" and ")} into their graveyard` : ""}.`);
      }
      return;
    }
    case "fight":
    case "bite": {
      // CR 701.14b: if either creature is gone, isn't a creature, or is an illegal target, no damage is dealt.
      const a = objects(s, e.a, ctx)[0];
      // "Deals damage equal to its power to each of two other target creatures": each one that's still a creature.
      const bs = (e.type === "bite" ? objects(s, e.b, ctx) : objects(s, e.b, ctx).slice(0, 1)).filter((b) => objIsType(s, b, "Creature"));
      if (!a || !bs.length || !objIsType(s, a, "Creature")) {
        log(s, `${src}: no damage is dealt.`);
        return;
      }
      // Noncombat damage from the creatures themselves: their own deathtouch, lifelink, infect apply.
      const pa = power(s, a);
      const pbs = bs.map((b) => power(s, b));
      // Fighting: each creature deals damage at the same time, so each is one event per source.
      const fromA = objectSource(s, a);
      const fromB = e.type === "fight" ? objectSource(s, bs[0]!) : undefined;
      let byA = 0;
      for (const b of bs) byA += dealDamage(s, fromA, { object: b }, pa);
      const byB = fromB ? dealDamage(s, fromB, { object: a }, pbs[0]!) : 0; // a creature fighting itself takes twice its power (CR 701.14c)
      if (byA) fireEvent(s, { type: "dealtDamage", id: a.id, amount: byA, combat: false });
      if (byB) fireEvent(s, { type: "dealtDamage", id: bs[0]!.id, amount: byB, combat: false });
      return;
    }
    case "may": {
      // The controller decides now whether to do it (CR 608.2d); the answer is kept while it runs.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.may === undefined) {
        // Fabricate: with the permanent gone, the counters can't be put on it, so it's the tokens (rulings).
        const onSelf = e.effects.every((x) => "what" in x && x.what.ref === "self");
        if (e.otherwise && onSelf && !objects(s, { ref: "self" }, ctx).length) sc.may = false;
        else if (e.pay && !canPayNow(s, ctx.controller, e.pay)) sc.may = false; // can't pay, so can't do it
        else if (!canDoNow(s, e.effects, ctx)) sc.may = false; // nothing to discard: "if you do" can't happen
        // Paying to untap what's already untapped gets nothing: not worth asking.
        else if (e.pay && ctx.sourceId && doesNothingNow(s, ctx.sourceId, { targets: [], effects: e.effects, text: "" })) sc.may = false;
        else {
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: e.text.replace(/~/g, src), source: src, ...(e.pay ? { pay: e.pay } : {}), ...(e.keep ? { keep: true } : {}) };
          return "paused";
        }
      }
      r.did = sc.may;
      if (!sc.may) {
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        return;
      }
      for (const inner of e.effects) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
    case "cumulativeUpkeep": {
      // CR 702.24a: an age counter first (once, even if it waits on the answer), then pay for each one or sacrifice.
      const sc = (s.resolving!.scratch ??= {});
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (sc.n === undefined) {
        if (!o) return;
        o.counters.age = (o.counters.age ?? 0) + 1;
        sc.n = o.counters.age;
        log(s, `${src} gets an age counter (${sc.n}).`);
      }
      const pay = timesPay(e.pay, sc.n);
      // "If [cost] has choices ... either the entire set of costs is paid, or none of them is" (CR 702.24a).
      return runEffect(s, { type: "may", effects: [], pay, otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Pay ${describePay(pay)} to keep ~ (cumulative upkeep)`, keep: true }, ctx);
    }
    case "counterUnlessPays": {
      // Ward (CR 702.21a) and "counter it unless that player pays": the spell or ability that triggered this.
      return counterOnStack(s, ctx, ctx.cause, e.ward ? `${src}'s ward` : src, e.unless);
    }
    case "search": {
      // CR 701.23: look through the library for matching cards. With a stated quality ("a basic land
      // card") a player may find fewer than asked for, even none (701.23b); asked simply for "a card"
      // or "two cards", they must find as many as they can (701.23d).
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const filter = e.filter?.named === "~" ? { ...e.filter, named: src } : e.filter;
      if (!sc.found) {
        const n = (sc.n ??= amountNow(s, e.n, ctx));
        const cards = p.library.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
        const max = Math.min(n, cards.length);
        const min = filter || e.upTo ? 0 : max;
        const kind = (filter?.text ?? "card").replace(/~/g, src);
        const what = `${e.upTo ? "up to " : ""}${n === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${n >= 99 ? "any number of" : n} ${kind.replace(/\bcard\b/, "cards")}`}`;
        s.pending = {
          kind: "searchLibrary",
          player: p.id,
          source: src,
          what,
          cards,
          min,
          max,
          ...(e.others ? { firstTo: describeDest(e.dest), othersTo: describeDest(e.others) } : {}),
        };
        return "paused";
      }
      const found = sc.found;
      p.library = p.library.filter((id) => !found.includes(id));
      shuffle(s, p.library);
      const names = found.map((id) => defOf(s, obj(s, id)).name);
      // Found cards aren't revealed unless the effect says so (CR 701.23e).
      const shown = e.reveal || e.dest.zone === "battlefield" ? ` (${names.join(", ")})` : "";
      log(s, `${p.name} searches their library${found.length ? `, finds ${found.length === 1 ? "a card" : `${found.length} cards`}${shown}` : " and finds nothing"}, and shuffles.`);
      found.forEach((id, i) => {
        const to = i > 0 && e.others ? e.others : e.dest;
        if (to.zone === "libraryTop") {
          obj(s, id).zone = "library";
          p.library.unshift(id);
        } else if (to.zone === "battlefield") moveObject(s, id, "battlefield", { controller: p.id, ...(to.tapped ? { tapped: true } : {}) });
        else moveObject(s, id, to.zone);
      });
      return;
    }
    case "dig": {
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.looked) {
        sc.looked = p.library.slice(0, amountNow(s, e.n, ctx));
        if (!sc.looked.length) return;
        const options = sc.looked.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        const max = Math.min(e.count, options.length);
        const min = e.upTo || e.filter ? 0 : max;
        log(s, `${p.name} ${e.reveal ? "reveals" : "looks at"} the top ${sc.looked.length === 1 ? "card" : `${sc.looked.length} cards`} of their library${e.reveal ? ` (${sc.looked.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}.`);
        if (max > 0 && !(min === max && options.length === max)) {
          const kind = (e.filter?.text ?? "card").replace(/~/g, src);
          // "Take none" says it's optional; "up to" only reads well with a number.
          const what = max === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${min < max ? "up to " : ""}${max} ${kind.replace(/\bcard\b/, "cards")}`;
          const to = e.into === "hand" ? "into your hand" : "back on top of your library";
          const rest = e.rest === "graveyard" ? "into your graveyard" : "on the bottom of your library";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards: options, min, max, dig: { looked: sc.looked, to, rest } };
          return "paused";
        }
        sc.found = options.slice(0, max);
      }
      const looked = sc.looked;
      const found = (sc.found ?? []).filter((id) => looked.includes(id));
      const rest = looked.filter((id) => !found.includes(id) && obj(s, id).zone === "library");
      const names = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (found.length) log(s, `${p.name} puts ${e.into === "hand" ? (e.reveal || e.filter ? names(found) : found.length === 1 ? "a card" : `${found.length} cards`) + " into their hand" : names(found) + " back on top"}.`);
      for (const id of found) {
        if (e.into === "hand") moveObject(s, id, "hand");
        else p.library = [id, ...p.library.filter((x) => x !== id)];
      }
      if (e.rest === "graveyard") {
        if (rest.length) log(s, `${p.name} puts ${names(rest)} into their graveyard.`);
        for (const id of rest) moveObject(s, id, "graveyard");
      } else {
        // "On the bottom in any order" or "in a random order": random either way.
        const bottom = [...rest];
        shuffle(s, bottom);
        p.library = [...p.library.filter((x) => !rest.includes(x)), ...bottom];
        if (rest.length) log(s, `${p.name} puts ${rest.length === 1 ? "a card" : `${rest.length} cards`} on the bottom of their library.`);
      }
      return;
    }
    case "choose": {
      // "Choose a creature type": the controller names one as it resolves (CR 608.2c-d); it's kept for the rest.
      const r = s.resolving!;
      if (r.chosen?.[e.choice === "color" ? "color" : "type"] === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: e.choice, options: choiceOptions(e.choice, e.except) };
        return "paused";
      }
      return;
    }
    case "if": {
      // How it was cast doesn't change while it resolves, so this can be checked again on resuming.
      const holds =
        e.cond.kind === "youDid"
          ? !!s.resolving!.did
          : e.cond.kind === "state"
            ? staticConditionNow(s, e.cond.cond, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller)
            : kickedMatches(ctx.kicked, e.cond);
      const branch = holds ? e.effects : (e.otherwise ?? []);
      for (const inner of branch) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
    case "counterSpell": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      return counterOnStack(s, ctx, t.id, src, e.unless, e.exile);
    }
  }
}

/**
 * Counter a spell or ability on the stack (CR 701.6a), or with `unless`, only if its controller
 * doesn't pay (CR 118.12): they choose as this resolves, and may activate mana abilities to pay
 * (CR 605.3a). A spell that can't be countered stays, paid for or not (CR 101.2). A countered spell
 * goes to its owner's graveyard, or into exile with "exile it instead".
 */
function counterOnStack(s: GameState, ctx: ResolveCtx, stackId: string | undefined, by: string, unless?: UnlessPays, exile?: boolean): "paused" | void {
  const i = s.stack.findIndex((x) => x.id === stackId);
  const item = s.stack[i];
  if (!item) return; // it already left the stack
  const what = item.kind === "spell" ? item.description : `${item.description.split(":")[0]}'s ability`;
  if (item.objectId && compileCard(defOf(s, obj(s, item.objectId))).cantBeCountered) {
    log(s, `${item.description} can't be countered.`); // CR 101.2
    return;
  }
  if (unless) {
    const r = s.resolving!;
    const sc = (r.scratch ??= {});
    if (sc.paid === undefined) {
      const p = player(s, item.controller);
      // The amount is fixed as the choice is offered (CR 608.2h).
      const cost = unlessCost(unless.cost, unless.generic === undefined ? 0 : amountNow(s, unless.generic, ctx));
      if (p.lost) sc.paid = false;
      else if (cost === "{0}" && !unless.life) {
        // Paying {0} is just saying so (CR 118.5); nobody would refuse.
        log(s, `${p.name} pays {0} for ${by}.`);
        sc.paid = true;
      } else {
        s.pending = { kind: "payUnless", player: p.id, cost, source: by, what, ...(unless.life ? { life: unless.life } : {}) };
        return "paused";
      }
    }
    if (sc.paid) return;
  }
  s.stack.splice(i, 1);
  if (item.objectId) moveObject(s, item.objectId, exile ? "exile" : "graveyard");
  log(s, `${by} counters ${what}${exile && item.objectId ? " and exiles it" : ""}.`);
}

/** "{1}{U}" plus 3 generic: "{4}{U}". */
export function unlessCost(cost: string, generic: number): string {
  let n = generic;
  const rest = cost.replace(/\{(\d+)\}/g, (_, d: string) => {
    n += Number(d);
    return "";
  });
  return n || !rest ? `{${n}}${rest}` : rest;
}

/**
 * One of the monarch's inherent triggered abilities (CR 725.2): no source, controlled by the
 * player who was the monarch when it triggered. `subject` is the creature that dealt the damage.
 */
function monarchTrigger(s: GameState, index: number, subject?: GameObject) {
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.triggerQueue.push({
    sourceId: "",
    sourceCardId: MONARCH.oracleId,
    controller: s.monarch!,
    index,
    ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
  });
}

/**
 * Where a resolved instant or sorcery goes (CR 608.2n): its owner's graveyard; its owner's hand
 * if buyback was paid (CR 702.27a); exile, to be cast again at its controller's next upkeep, if it
 * has rebound and was cast from their hand (CR 702.88a). Flashback's and jump-start's exile is a
 * replacement effect that applies whatever the destination (CR 702.34a, see moveObject).
 */
function finishSpell(s: GameState, id: ObjectId) {
  const o = obj(s, id);
  const d = defOf(s, o);
  const controller = o.controller;
  if (compileCard(d).rebound && o.castFrom === "hand" && !o.exileIfLeaves) {
    moveObject(s, id, "exile");
    log(s, `${d.name} is exiled (rebound).`);
    addDelayed(s, "yourNextUpkeep", controller, o, { targets: [], effects: [{ type: "castFromExileFree" }], text: "Rebound: you may cast ~ from exile without paying its mana cost." });
    return;
  }
  if (o.buyback) {
    moveObject(s, id, "hand");
    if (o.zone === "hand") log(s, `${d.name} returns to ${player(s, o.owner).name}'s hand (buyback).`);
    return;
  }
  moveObject(s, id, "graveyard");
}

/** "At the beginning of the next end step" / "your next upkeep", about this object as it is now (CR 603.7). */
export function addDelayed(s: GameState, when: DelayedTrigger["when"], controller: PlayerId, o: GameObject, body: AbilityBody, sourceCardId = cardIdOf(o)) {
  (s.delayed ??= []).push({ when, controller, sourceCardId, subject: { id: o.id, zc: o.zoneChanges ?? 0 }, body, turn: s.turn, step: s.step });
}

/** The trigger events for the beginning of a step: on your turn, and on every turn. */
const STEP_TRIGGERS: Record<Extract<TriggerSourceEvent, { type: "step" }>["step"], [TriggerEvent, TriggerEvent]> = {
  upkeep: ["yourUpkeep", "eachUpkeep"],
  draw: ["yourDrawStep", "eachDrawStep"],
  end: ["yourEndStep", "eachEndStep"],
  beginCombat: ["yourBeginCombat", "eachBeginCombat"], // CR 507.1
  endCombat: ["yourEndCombat", "eachEndCombat"], // "at end of combat" (CR 511.2)
};

/** A player becomes the monarch, and whoever was stops being it (CR 725.3). */
export function becomeMonarch(s: GameState, pid: PlayerId) {
  const p = player(s, pid);
  if (p.lost || s.monarch === pid) return;
  s.cards[MONARCH.oracleId] ??= MONARCH;
  s.monarch = pid;
  log(s, `${p.name} becomes the monarch.`);
}

/** Can `pid` pay this now: mana from their pool or untapped sources, life (CR 119.4), energy (CR 107.14)? */
export function canPayNow(s: GameState, pid: PlayerId, pay: PayCost): boolean {
  const p = player(s, pid);
  if (pay.life && p.life < pay.life) return false;
  if (pay.energy && (p.energy ?? 0) < pay.energy) return false;
  return !pay.mana || !!payFromPool(parseManaCost(pay.mana), p.manaPool) || !!planMana(s, pid, parseManaCost(pay.mana));
}

/** A cost paid `n` times over, as one cost (cumulative upkeep, CR 702.24a). */
export function timesPay(pay: PayCost, n: number): PayCost {
  return {
    ...(pay.mana ? { mana: timesMana(pay.mana, n) } : {}),
    ...(pay.life ? { life: pay.life * n } : {}),
    ...(pay.energy ? { energy: pay.energy * n } : {}),
  };
}

/** "{1}{U}" three times is "{3}{U}{U}{U}". */
function timesMana(mana: string, n: number): string {
  let generic = 0;
  const rest = mana.replace(/\{(\d+)\}/g, (_, d: string) => {
    generic += Number(d);
    return "";
  });
  return (generic ? `{${generic * n}}` : "") + rest.repeat(n);
}

/** "{2} and 1 life", "{E}{E}", for prompts and logs. */
export function describePay(pay: PayCost): string {
  return [pay.mana, pay.life ? `${pay.life} life` : "", pay.energy ? "{E}".repeat(pay.energy) : ""].filter(Boolean).join(" and ");
}

/**
 * Can "you may [do this]" be done right now? A player can't discard from an empty hand, draw from an empty
 * library (CR 121.4) or sacrifice what's gone, and then "If you do" doesn't happen either.
 */
function canDoNow(s: GameState, effects: Effect[], ctx: ResolveCtx): boolean {
  for (const e of effects) {
    if (e.type === "discard" && e.who.ref === "you" && !player(s, ctx.controller).hand.length) return false;
    if (e.type === "draw" && e.who.ref === "you" && !player(s, ctx.controller).library.length) return false;
    if (e.type === "sacrifice" && !objects(s, e.what, ctx).length) return false;
  }
  return true;
}

/** Was it kicked (CR 702.33d), with that kicker cost if the condition names one (702.33f)? */
export function kickedMatches(kicked: number[] | undefined, cond: SpellCondition): boolean {
  if (cond.kind !== "kicked") return false;
  return cond.which === undefined ? !!kicked?.length : !!kicked?.includes(cond.which);
}

/** "onto the battlefield tapped", for search prompts. */
export function describeDest(d: SearchDest): string {
  return d.zone === "hand"
    ? "into your hand"
    : d.zone === "battlefield"
      ? `onto the battlefield${d.tapped ? " tapped" : ""}`
      : d.zone === "libraryTop"
        ? "on top of your library"
        : d.zone === "graveyard"
          ? "into your graveyard"
          : "into exile";
}

const sign = (n: Amount) => (typeof n !== "number" ? describeAmount(n) : n >= 0 ? `+${n}` : `${n}`);

/** "gets +2/+2 and gains flying", for the log. */
export function describeMods(s: GameState, mods: Modification[], controller: PlayerId, plural = false): string {
  const parts: string[] = [];
  for (const m of mods) {
    if (m.kind === "cantBlock" || m.kind === "cantAttack") {
      parts.push(`can't ${m.kind === "cantBlock" ? "block" : "attack"}`);
      continue;
    }
    if (m.kind === "cantBeBlocked") {
      parts.push("can't be blocked");
      continue;
    }
    if (m.kind === "doesntUntap") {
      parts.push(plural ? "don't untap" : "doesn't untap");
      continue;
    }
    if (m.kind === "modifyPT") parts.push(`gets ${sign(m.power)}/${sign(m.toughness)}`);
    else if (m.kind === "setPT") parts.push(`has base power and toughness ${describeAmount(m.power)}/${describeAmount(m.toughness)}`);
    else if (m.kind === "switchPT") parts.push("has its power and toughness switched");
    else if (m.kind === "addKeywords") parts.push(`gains ${m.keywords.join(", ").toLowerCase()}`);
    else if (m.kind === "addAbility") parts.push(`gains "${m.text.replace(/~/g, "this creature")}"`);
    else if (m.kind === "removeKeywords") parts.push(`loses ${m.keywords.join(", ").toLowerCase()}`);
    else if (m.kind === "loseAllAbilities") parts.push("loses all abilities");
    else if (m.kind === "control") parts.push(`comes under ${player(s, controller).name}'s control`);
    else if (m.kind === "setColors") parts.push(`becomes ${m.colors.join("/") || "colorless"}`);
    else if (m.kind === "setSubtypes" || m.kind === "setTypes" || m.kind === "addTypes")
      parts.push(`becomes ${[...("types" in m ? m.types : []), ...m.subtypes].join(" ")}`.trim());
    else parts.push(m.kind.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  const out = parts.join(" and ");
  // "Arcbound Worker and Germ get +1/+1 and gain flying"
  return plural ? out.replace(/\b(gets|gains|loses|comes|becomes|has)\b/g, (w) => ({ gets: "get", gains: "gain", loses: "lose", comes: "come", becomes: "become", has: "have" })[w]!).replace("have its power and toughness switched", "have their power and toughness switched") : out;
}

function damageRecipients(s: GameState, to: DamageRecipient, ctx: ResolveCtx): { objs: GameObject[]; pids: PlayerId[] } {
  if (to.ref === "anyTarget") {
    const out: { objs: GameObject[]; pids: PlayerId[] } = { objs: [], pids: [] };
    for (let i = to.index; i < to.index + (to.n ?? 1); i++) {
      const t = ctx.targets[i];
      if (!ctx.legal[i] || !t) continue;
      if (t.kind === "player") out.pids.push(t.id);
      else if (t.kind === "object") out.objs.push(obj(s, t.id));
    }
    return out;
  }
  if (to.ref === "self" || to.ref === "subject" || to.ref === "allCreatures" || to.ref === "each" || (to.ref === "target" && (("n" in to && !!to.n) || isObjectTarget(ctx, to.index))))
    return { objs: objects(s, to as ObjRef, ctx), pids: [] };
  return { objs: [], pids: players(s, to as PlayerRef, ctx) };
}

const isObjectTarget = (ctx: ResolveCtx, i: number) => ctx.targets[i]?.kind === "object";

/**
 * The damage source of a resolving spell or ability: the spell itself, or the ability's
 * source as it is now, or as it last was if it has left the battlefield (CR 702.90d).
 */
function ctxSource(s: GameState, ctx: ResolveCtx): DamageSource {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && o.zone === "battlefield" ? { ...objectSource(s, o), controller: ctx.controller } : cardSource(ctx.sourceDef, ctx.controller);
}

/** Move cards from a player's hand to their graveyard (CR 701.9a). */
export function discardCards(s: GameState, pid: PlayerId, ids: ObjectId[], how = "") {
  if (!ids.length) return;
  const names = ids.map((id) => defOf(s, obj(s, id)).name);
  for (const id of ids) moveObject(s, id, "graveyard");
  log(s, `${player(s, pid).name} discards ${names.join(", ")}${how}.`);
}


export function tokenDef(t: TokenSpec): CardDef {
  return {
    oracleId: `token:${t.name}:${t.power ?? ""}/${t.toughness ?? ""}:${t.colors.join("")}:${t.types.join("")}:${t.keywords.join(",")}:${t.abilities ?? ""}`,
    name: `${t.name} Token`,
    manaCost: "",
    cmc: 0,
    typeLine: `Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`,
    supertypes: ["Token"],
    types: t.types,
    subtypes: t.subtypes,
    oracleText: [t.keywords.join(", "), t.abilities ?? ""].filter(Boolean).join("\n"),
    ...(t.power !== undefined ? { power: String(t.power), toughness: String(t.toughness) } : {}),
    colors: t.colors,
    colorIdentity: t.colors,
    keywords: t.keywords,
  };
}

function createToken(s: GameState, pid: PlayerId, t: TokenSpec, opts: { tapped?: boolean; attacking?: PlayerId } = {}) {
  const o = newObject(s, tokenDef(t), pid, "exile");
  o.isToken = true;
  moveObject(s, o.id, "battlefield", opts.tapped ? { tapped: true } : {}); // enters like any permanent, so ETB triggers see it
  if (opts.attacking !== undefined && o.zone === "battlefield") o.attacking = opts.attacking;
  s.resolving?.created?.push(o.id);
}

/** From the declare attackers step to the end of combat step: when creatures can be attacking (CR 506.1). */
export const inCombat = (s: GameState) => ["declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);

/**
 * Whom a creature put onto the battlefield attacking attacks (CR 508.4): its controller chooses; we pick whom
 * the source (or the creature it's attached to) is attacking, else whom most of their attackers attack, else
 * the next opponent. Undefined outside combat, where it just isn't attacking.
 */
export function attackDefault(s: GameState, pid: PlayerId, sourceId?: ObjectId): PlayerId | undefined {
  if (!inCombat(s) || s.activePlayer !== pid) return undefined;
  const living = opponents(s, pid);
  const src = sourceId ? s.objects[sourceId] : undefined;
  const host = src?.attachedTo ? s.objects[src.attachedTo] : undefined;
  for (const o of [src, host]) if (o?.zone === "battlefield" && o.attacking !== undefined && living.includes(o.attacking)) return o.attacking;
  const count = new Map<PlayerId, number>();
  for (const id of s.battlefield) {
    const a = s.objects[id]!.attacking;
    if (a !== undefined && living.includes(a)) count.set(a, (count.get(a) ?? 0) + 1);
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : living[0];
}

// ---------------------------------------------------------------------------
// Triggered abilities (CR 603)

export type TriggerSourceEvent =
  | { type: "enters"; id: ObjectId; x?: number }
  /** `counters`: the counters it had on the battlefield (last known information, for persist and undying). */
  /** It left the battlefield for `to` (only a graveyard makes it "die"). */
  | { type: "dies"; to: ZoneName; id: ObjectId; controller: PlayerId; hadAbilities: boolean; grantedAbilities?: string[]; counters: Record<string, number>; wasCreature: boolean; power?: number; toughness?: number; /** It as it last existed on the battlefield. */ snapshot?: GameObject; chars?: Characteristics; /** The Auras and Equipment that were attached to it. */ attachments?: ObjectId[] }
  /** Every defending player has declared blockers (CR 509.3). */
  | { type: "blocksDeclared" }
  /** A player gained life (one life-gain event, CR 119.10). */
  | { type: "lifeGained"; player: PlayerId }
  | { type: "attacks"; id: ObjectId }
  /** A player declared these attackers (CR 508.1): "whenever one or more creatures you control attack". */
  | { type: "groupAttack"; controller: PlayerId; ids: ObjectId[] }
  /** In one combat damage step, these creatures of `controller` dealt `player` combat damage. */
  | { type: "groupCombatDamage"; controller: PlayerId; player: PlayerId; ids: ObjectId[]; amounts: number[] }
  /** The last counter of a kind was removed from it (vanishing's time counters, CR 702.63a). */
  | { type: "lastCounterRemoved"; id: ObjectId; counter: string }
  /** A face-down permanent was turned face up (CR 702.37e, 708.8). */
  | { type: "turnedFaceUp"; id: ObjectId }
  /** It's the only creature declared as an attacker this combat (CR 506.5, exalted 702.83b). */
  | { type: "attacksAlone"; id: ObjectId }
  | { type: "combatDamageToPlayer"; id: ObjectId; player: PlayerId; amount: number }
  /** A source dealt damage: everything it dealt at once is one event (CR 120.3, 603.2c). */
  | { type: "dealtDamage"; id: ObjectId; amount: number; combat: boolean }
  | { type: "step"; step: "upkeep" | "draw" | "end" | "beginCombat" | "endCombat"; active: PlayerId }
  /** A spell was just cast (CR 601.2i): "whenever you cast" abilities and prowess. */
  | { type: "cast"; stackId: string; controller: PlayerId; card: CardDef }
  /** A spell or ability was just put on the stack with its targets: "becomes the target" (CR 601.2c, ward 702.21a). */
  | { type: "targeted"; stackId: string }
  /** A player drew a card, their `nth` this turn (CR 121.2). */
  | { type: "draw"; player: PlayerId; nth: number };

/**
 * Echo (CR 702.30a): "if this permanent came under your control since the beginning of your last
 * upkeep". This runs as the current upkeep begins, so "your last upkeep" is the one before it.
 */
export function echoDue(s: GameState, o: GameObject, you: PlayerId): boolean {
  const last = player(s, you).lastUpkeepTurn;
  return last === undefined || o.controlledSinceTurn >= last;
}

/** Evolve's comparison (CR 702.100a): is the entering creature bigger in power or toughness? */
export function evolves(s: GameState, o: GameObject, stats: LastKnown): boolean {
  if (!objIsType(s, o, "Creature")) return false; // CR 702.100c
  return (stats.power ?? 0) > power(s, o) || (stats.toughness ?? 0) > toughness(s, o);
}

/** Does this death set off a "whenever another creature dies" ability of `srcId` (which may have died with it)? */
function diesMatches(
  s: GameState,
  d: NonNullable<TriggeredAbility["dies"]>,
  srcId: ObjectId,
  attachedTo: ObjectId | undefined,
  dying: { o: GameObject; c: Characteristics },
  you: PlayerId,
): boolean {
  if (d.attached) return attachedTo === dying.o.id && dying.c.types.includes("Creature");
  if (d.damagedBySelf && !dying.o.damagedBy?.includes(srcId)) return false;
  if (srcId === dying.o.id) {
    if (d.orSelf) return true;
    if (d.other) return false;
  }
  return objectMatches(s, d.filter, dying.o, you, false, undefined, dying.c);
}

/** Does `entering` set off `o`'s "whenever a/another/~ or another ... enters" ability? */
function entersMatches(s: GameState, en: NonNullable<TriggeredAbility["enters"]>, o: GameObject, entering: GameObject, you: PlayerId): boolean {
  if (o.id === entering.id) {
    if (en.orSelf) return true;
    if (en.other) return false;
  }
  return objectMatches(s, en.filter, entering, you, false);
}

/** Record every triggered ability that `ev` triggers. They go on the stack the next time a player would get priority. */
/** Dethrone (CR 702.105a): it attacks the player with the most life or tied for most life. */
function attacksMostLife(s: GameState, o: GameObject): boolean {
  if (o.attacking === undefined) return false;
  const lives = s.turnOrder.map((pid) => s.players[pid]!).filter((p) => !p.lost).map((p) => p.life);
  return s.players[o.attacking]!.life >= Math.max(...lives);
}

/** Training (CR 702.149a): another creature with greater power attacks alongside it. */
function trains(s: GameState, o: GameObject): boolean {
  const mine = power(s, o);
  return s.battlefield.some((id) => id !== o.id && s.objects[id]!.attacking !== undefined && objIsType(s, s.objects[id]!, "Creature") && power(s, s.objects[id]!) > mine);
}

export function fireEvent(s: GameState, ev: TriggerSourceEvent) {
  // Abilities that trigger on the battlefield use the permanent's abilities right now;
  // leaves-the-battlefield triggers look back in time (CR 603.10a), so "dies" passes them in.
  const add = (
    o: GameObject,
    controller: PlayerId,
    pred: (event: string, t: TriggeredAbility) => boolean,
    triggers = abilitiesOf(s, o).triggers,
    cause?: string,
    subject?: GameObject,
    lki?: LastKnown,
    x?: number,
    kicked?: number[],
    event?: TriggerEventInfo,
  ) => {
    const printed = compileCard(defOf(s, o)).triggers;
    triggers.forEach((t, index) => {
      // An intervening "if" has to be true for it to trigger at all (CR 603.4).
      if (pred(t.event, t) && (!t.ifCond || staticConditionNow(s, t.ifCond, o.id, controller)))
        s.triggerQueue.push({
          ...(t.ifCond ? { ifCond: t.ifCond } : {}),
          // An ability an effect gave it isn't on its card, so the trigger carries what it does.
          ...(printed[index] !== t ? { body: t.body } : {}),
          sourceId: o.id,
          sourceCardId: cardIdOf(o),
          controller,
          index,
          sourceZc: o.zoneChanges ?? 0,
          ...(cause ? { cause } : {}),
          ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
          ...(lki ? { lki } : {}),
          ...(x ? { x } : {}),
          ...(kicked ? { kicked } : {}),
          ...(event ? { event } : {}),
        });
    });
  };
  if (ev.type === "enters") {
    // Static effects apply as it enters, before checking what triggers (CR 611.3c).
    invalidateCharacteristics(s);
    const entering = obj(s, ev.id);
    const you = controllerOf(s, entering);
    // Its own enters abilities use the X of the spell it was (CR 107.3m), and know whether it was kicked;
    // "if it was kicked" is an intervening if (CR 603.4), and that can't change by the time it resolves.
    // Evoke's sacrifice trigger only if the evoke cost was paid (CR 702.74a).
    add(
      entering,
      you,
      (e, t) => e === "selfEnters" && (!t.ifKicked || kickedMatches(entering.kicked, t.ifKicked)) && (!t.ifEvoked || entering.castAlt === "evoke"),
      undefined,
      undefined,
      undefined,
      undefined,
      ev.x,
      entering.kicked,
    );
    if (objIsType(s, entering, "Creature")) {
      const lki = { power: power(s, entering), toughness: toughness(s, entering) };
      for (const id of s.battlefield) {
        if (id === ev.id || controllerOf(s, obj(s, id)) !== you) continue;
        const o = obj(s, id);
        // Evolve only triggers if the new creature is bigger in some way (CR 702.100a, 603.4).
        add(o, you, (e, t) => e === "anotherCreatureYouControlEnters" && (!t.ifEvolves || evolves(s, o, lki)), undefined, undefined, entering, lki);
      }
    }
    // Landfall. The land itself sees itself enter too (CR 603.6a).
    if (objIsType(s, entering, "Land"))
      for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e) => e === "landYouControlEnters");
    // "Whenever a creature you control enters", "another Ally", "~ or another artifact": on every permanent,
    // the entering one too, which is the subject ("that creature"). It sees itself enter (CR 603.6a).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const ctrl = controllerOf(s, o);
      add(o, ctrl, (e, t) => e === "permanentEnters" && !!t.enters && entersMatches(s, t.enters, o, entering, ctrl), undefined, undefined, entering);
    }
  } else if (ev.type === "dies") {
    const o = obj(s, ev.id);
    // Persist and undying: "if it had no -1/-1 counters on it" (an intervening if, CR 603.4; last known information).
    add(
      o,
      ev.controller,
      (e, t) =>
        (((e === "selfDies" && ev.wasCreature) || e === "selfToGraveyard") && ev.to === "graveyard" && !(t.ifNoCounter && (ev.counters[t.ifNoCounter] ?? 0) > 0)) ||
        e === "selfLeaves",
      withGranted(ev.hadAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, ev.grantedAbilities ?? []).triggers,
      undefined,
      undefined,
      { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) },
    );
    // "Whenever another creature dies", "a creature you control", "equipped creature": abilities of permanents
    // on the battlefield, and of ones leaving at the same time, which look back in time (CR 603.10a).
    if (ev.to === "graveyard" && ev.snapshot && ev.chars) {
      const lki = { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) };
      const dying = { o: ev.snapshot, c: ev.chars };
      const consider = (src: GameObject, ctrl: PlayerId, attachedTo: ObjectId | undefined, triggers?: TriggeredAbility[]) =>
        add(src, ctrl, (e, t) => e === "permanentDies" && !!t.dies && diesMatches(s, t.dies, src.id, attachedTo, dying, ctrl), triggers, undefined, o, lki);
      for (const id of s.battlefield) {
        const src = obj(s, id);
        consider(src, controllerOf(s, src), ev.attachments?.includes(id) ? ev.id : src.attachedTo);
      }
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src) continue;
        if (src.zone === "battlefield") continue; // it already came back as a new object
        consider(src, left.controller, left.attachedTo, withGranted(left.hadAbilities ? compileCard(defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
      }
    }
  } else if (ev.type === "blocksDeclared") {
    // "Blocks" and "becomes blocked" trigger once each; "blocks a creature" / "becomes blocked by a creature"
    // once for each such creature, which is the trigger's subject (CR 509.3c-d).
    const fits = (t: TriggeredAbility, subject: GameObject, you: PlayerId) => !t.subjectFilter || objectMatches(s, t.subjectFilter, subject, you, false);
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (o.blocking) {
        add(o, you, (e) => e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks");
        const at = s.objects[o.blocking];
        if (at) add(o, you, (e, t) => (e === "selfBlocksCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, at, you), undefined, undefined, at);
      }
      if (o.attacking !== undefined && o.blockedBy?.length) {
        // "Defending player" (afflict) is the player it's attacking.
        add(o, you, (e) => e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked", undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        for (const b of o.blockedBy) {
          const bl = s.objects[b];
          if (bl) add(o, you, (e, t) => (e === "selfBlockedByCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, bl, you), undefined, undefined, bl);
        }
      }
    }
  } else if (ev.type === "lifeGained") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youGainLife");
    }
  } else if (ev.type === "turnedFaceUp") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfTurnedFaceUp");
  } else if (ev.type === "attacks") {
    const o = obj(s, ev.id);
    // "Defending player" is the player it attacked as it became an attacking creature (myriad rulings).
    add(o, controllerOf(s, o), (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.training || trains(s, o)), undefined, undefined, undefined, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
  } else if (ev.type === "groupAttack" || ev.type === "groupCombatDamage") {
    const want = ev.type === "groupAttack" ? "creaturesYouControlAttack" : "creaturesYouControlDealCombatDamageToPlayer";
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== ev.controller) continue;
      // Only the creatures that match count ("one or more Rogues you control"): "that much" is what they dealt.
      const fits = (t: TriggeredAbility) => ev.ids.map((x, i) => [x, i] as const).filter(([x]) => s.objects[x] && (!t.group || objectMatches(s, t.group, obj(s, x), ev.controller, false)));
      for (const t of abilitiesOf(s, o).triggers) {
        if (t.event !== want) continue;
        const hit = fits(t);
        if (!hit.length) continue;
        const amount = ev.type === "groupCombatDamage" ? hit.reduce((n, [, i]) => n + ev.amounts[i]!, 0) : undefined;
        const same = (tt: TriggeredAbility) => tt.event === want && tt.body.text === t.body.text && JSON.stringify(tt.group) === JSON.stringify(t.group);
        add(o, ev.controller, (_, tt) => same(tt), undefined, undefined, undefined, undefined, undefined, undefined, ev.type === "groupCombatDamage" ? { player: ev.player, amount } : undefined);
      }
    }
  } else if (ev.type === "lastCounterRemoved") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield" && ev.counter === "time") add(o, controllerOf(s, o), (e) => e === "selfLastTimeCounterRemoved");
  } else if (ev.type === "attacksAlone") {
    // Exalted: each permanent its controller controls with exalted triggers (CR 702.83a).
    const attacker = obj(s, ev.id);
    const you = controllerOf(s, attacker);
    for (const id of s.battlefield)
      if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e) => e === "creatureYouControlAttacksAlone", undefined, undefined, attacker);
  } else if (ev.type === "dealtDamage") {
    // Its abilities work only on the battlefield; a spell or a card that left isn't "~" any more.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield")
      add(o, controllerOf(s, o), (e) => e === "selfDealsDamage" || (ev.combat && e === "selfDealsCombatDamage"), undefined, undefined, undefined, undefined, undefined, undefined, { amount: ev.amount });
  } else if (ev.type === "combatDamageToPlayer") {
    const o = obj(s, ev.id);
    const info = { player: ev.player, amount: ev.amount };
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && !(t.ifNotRenowned && o.renowned), undefined, undefined, undefined, undefined, undefined, undefined, info);
    // "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch" (CR 725.2).
    if (ev.player === s.monarch && objIsType(s, o, "Creature")) monarchTrigger(s, 1, o);
  } else if (ev.type === "cast") {
    // "When you cast this spell" abilities work from the stack (CR 702.85a, 603.2).
    const item = s.stack.find((x) => x.id === ev.stackId);
    const spell = item?.objectId ? s.objects[item.objectId] : undefined;
    if (spell) add(spell, ev.controller, (e) => e === "selfCast", compileCard(defOf(s, spell)).triggers);
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        if (e !== "castSpell" || !t.cast) return false;
        const by = t.cast.by;
        if ((by === "you" && ev.controller !== you) || (by === "opponent" && ev.controller === you)) return false;
        return printedMatches(bindChosen(t.cast.spell, o.chosen), ev.card);
      }, undefined, ev.stackId); // "counter it unless that player pays" acts on the spell cast
    }
    // Heroic: "Whenever you cast a spell that targets ~", once however many of its targets name it.
    const targeted = new Set((item?.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])));
    for (const id of targeted) {
      const o = s.objects[id];
      if (o?.zone === "battlefield" && controllerOf(s, o) === ev.controller) add(o, ev.controller, (e) => e === "selfTargetedByYourSpell", undefined, ev.stackId);
    }
  } else if (ev.type === "targeted") {
    // Each permanent becomes the target once, however many of the item's targets name it.
    const item = s.stack.find((x) => x.id === ev.stackId);
    const seen = new Set<ObjectId>();
    for (const t of item?.targets ?? []) {
      if (t.kind !== "object" || seen.has(t.id)) continue;
      seen.add(t.id);
      const o = s.objects[t.id];
      if (!o || o.zone !== "battlefield") continue;
      const you = controllerOf(s, o);
      add(o, you, (e) => (e === "becomesTargetOfOpponent" && you !== item!.controller) || e === "selfBecomesTarget", undefined, ev.stackId);
    }
  } else if (ev.type === "draw") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        if (e !== "playerDraws" || !t.draws) return false;
        const by = t.draws.by;
        if ((by === "you" && ev.player !== you) || (by === "opponent" && ev.player === you)) return false;
        return t.draws.nth === undefined || t.draws.nth === ev.nth;
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "step") {
    // Delayed triggers whose moment this is (CR 603.7): each triggers once.
    for (const d of [...(s.delayed ?? [])]) {
      // Made during that step, "the next end step" or "end of combat" is a later one (CR 603.7c, 511.2).
      const due =
        d.when === "nextEndStep"
          ? ev.step === "end" && !(d.turn === s.turn && d.step === "end")
          : d.when === "endOfCombat"
            ? ev.step === "endCombat" && !(d.turn === s.turn && d.step === "endCombat")
            : ev.step === "upkeep" && (d.when === "nextTurnUpkeep" || ev.active === d.controller) && d.turn < s.turn;
      if (!due) continue;
      s.delayed = s.delayed!.filter((x) => x !== d);
      s.triggerQueue.push({ sourceId: d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, body: d.body });
    }
    // "At the beginning of the monarch's end step, that player draws a card" (CR 725.2).
    if (ev.step === "end" && s.monarch === ev.active) monarchTrigger(s, 0);
    const [want, each] = STEP_TRIGGERS[ev.step];
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      // "That player" in "at the beginning of each player's upkeep" is the active player.
      add(o, you, (e, t) => (e === want && you === ev.active && (!t.ifEcho || echoDue(s, o, you))) || e === each, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.active });
    }
  }
}

/**
 * Put waiting triggers on the stack in APNAP order (CR 603.3b). A trigger that needs
 * targets stops here with a chooseTargets decision; one with no legal targets is removed
 * (CR 603.3d). Returns true if anything was added to the stack.
 */
export function processTriggerQueue(s: GameState, turnOrderFromActive: PlayerId[]): boolean {
  if (s.pending || !s.triggerQueue.length) return false;
  const rank = (pid: PlayerId) => {
    const i = turnOrderFromActive.indexOf(pid);
    return i < 0 ? 99 : i;
  };
  s.triggerQueue = s.triggerQueue.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.controller) - rank(b.t.controller) || a.i - b.i).map((x) => x.t);
  let added = false;
  while (s.triggerQueue.length) {
    const t = s.triggerQueue[0]!;
    if (player(s, t.controller).lost) {
      s.triggerQueue.shift();
      continue;
    }
    const def = s.cards[t.sourceCardId]!;
    const printed = triggerBody(s, t);
    if (printed.modal && !t.modes) {
      // Modes are chosen as it's put on the stack; a mode without legal targets can't be (CR 603.3c).
      const legal = legalModes(s, printed, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId));
      const n = legal.filter(Boolean).length;
      if (n === 0 || n < printed.modal.min) {
        log(s, `${def.name}'s ability has no mode that can be chosen and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      if (n === printed.modal.min) t.modes = legal.flatMap((ok, i) => (ok ? [i] : [])); // the only possible choice
      else {
        const modes = printed.modal.modes.map((m) => m.text);
        s.pending = { kind: "chooseModes", player: t.controller, sourceId: t.sourceId, description: describeAbility(def, printed.text), min: printed.modal.min, max: printed.modal.max, modes, legal };
        return added;
      }
    }
    if (printed.modal && !t.modes?.length) {
      log(s, `${def.name}'s ability has no modes chosen and is removed.`); // CR 603.3c
      s.triggerQueue.shift();
      continue;
    }
    const body = withModes(printed, t.modes);
    if (body.targets.length) {
      if (!hasLegalTargets(s, body.targets, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId)) {
        log(s, `${def.name}'s ability has no legal targets and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      s.pending = { kind: "chooseTargets", player: t.controller, sourceId: t.sourceId, specs: body.targets, description: describeAbility(def, body.text) };
      return added;
    }
    pushTrigger(s, t, []);
    added = true;
  }
  return added;
}

const triggerOf = (s: GameState, t: PendingTrigger) => (t.body ? undefined : compileCard(s.cards[t.sourceCardId]!).triggers[t.index]);

/**
 * State triggers (CR 603.8): one triggers when its state is true, and not again until that instance has
 * resolved or left the stack.
 */
export function checkStateTriggers(s: GameState) {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const triggers = abilitiesOf(s, o).triggers;
    triggers.forEach((t, index) => {
      if (t.event !== "state" || !t.state) return;
      const waiting = s.triggerQueue.some((q) => q.sourceId === id && q.index === index) || s.stack.some((x) => x.sourceId === id && x.stateIndex === index && x.sourceZc === (o.zoneChanges ?? 0));
      if (waiting || !staticConditionNow(s, t.state, id, controllerOf(s, o))) return;
      s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(o), controller: controllerOf(s, o), index, sourceZc: o.zoneChanges ?? 0 });
    });
  }
}

/** What a waiting trigger does: its source's printed ability, or a delayed trigger's own (CR 603.7). */
export function triggerBody(s: GameState, t: PendingTrigger): AbilityBody {
  const body = t.body ?? compileCard(s.cards[t.sourceCardId]!).triggers[t.index]!.body;
  // "Target creature that player controls": that player is known once it triggers.
  const who = t.event?.player;
  if (!body.targets.some((x) => x.controller === "eventPlayer")) return body;
  const fix = (x: TargetSpec): TargetSpec => (x.controller === "eventPlayer" ? (({ controller: _, ...rest }) => ({ ...rest, ...(who !== undefined ? { controlledBy: who } : { controller: "eventPlayer" as const }) }))(x) : x);
  return { ...body, targets: body.targets.map(fix), ...(body.modal ? { modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, targets: m.targets?.map(fix) })) } } : {}) };
}

export function pushTrigger(s: GameState, t: PendingTrigger, targets: TargetChoice[]) {
  const def = s.cards[t.sourceCardId]!;
  const body = withModes(triggerBody(s, t), t.modes);
  s.triggerQueue = s.triggerQueue.filter((x) => x !== t);
  s.stack.push({
    id: `s${s.nextId++}`,
    kind: "ability",
    sourceId: t.sourceId,
    sourceCardId: t.sourceCardId,
    sourceZc: t.sourceZc,
    controller: t.controller,
    description: describeAbility(def, body.text),
    body,
    targets: stampTargets(s, targets),
    modes: t.modes,
    ...(t.cause ? { cause: t.cause } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    ...(t.lki ? { lki: t.lki } : {}),
    ...(t.x ? { x: t.x } : {}),
    ...(t.kicked ? { kicked: t.kicked } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.ifCond ? { ifCond: t.ifCond } : {}),
    ...(t.index >= 0 && triggerOf(s, t)?.event === "state" ? { stateIndex: t.index } : {}),
  });
  log(s, `${def.name}'s ability triggers (${body.text.replace(/~/g, def.name).replace(/\.$/, "")})${describeTargets(s, targets)}.`);
  if (targets.length) fireEvent(s, { type: "targeted", stackId: s.stack[s.stack.length - 1]!.id });
}

/**
 * Would this untargeted ability do nothing right now? "{1}: Untap ~" on an untapped
 * permanent is still legal to activate (only the {Q} cost needs it tapped, CR 107.6), but
 * bots shouldn't waste mana on it and the UI says so.
 */
export function doesNothingNow(s: GameState, sourceId: ObjectId, body: AbilityBody): boolean {
  const o = s.objects[sourceId];
  if (!o || body.modal || body.targets.length || !body.effects.length) return false;
  return body.effects.every((e) => (e.type === "untap" || e.type === "tap") && e.what.ref === "self" && o.tapped === (e.type === "tap"));
}

/** Which targets of a body are aimed at something bad for the target (damage, removal, shrink)? Used by bots and the UI. */
export function harmfulTargets(body: AbilityBody): boolean[] {
  const harm = body.targets.map(() => false);
  const mark = (i: number, n = 1) => {
    for (let j = i; j < i + n; j++) harm[j] = true;
  };
  for (const e of allEffects(body.effects)) {
    if (e.type === "damage" && "index" in e.to) mark(e.to.index, "n" in e.to ? e.to.n : 1);
    // Returning a card from a graveyard to its owner's hand helps its owner.
    if (e.type === "bounce" && e.what.ref === "target" && body.targets[e.what.index]?.kind === "card") continue;
    if (["destroy", "exile", "bounce", "tap", "skipUntap"].includes(e.type) && "what" in e && e.what.ref === "target") mark(e.what.index, e.what.n);
    if (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "target") mark(e.what.index, e.what.n);
    if (e.type === "continuous" && e.what.ref === "target" && modsAreHarmful(e.mods)) mark(e.what.index, e.what.n);
    if ((e.type === "loseLife" || e.type === "mill") && e.who.ref === "target") mark(e.who.index);
    if (e.type === "counterSpell") mark(e.index);
    if (e.type === "discard" && e.who.ref === "target") mark(e.who.index);
    if ((e.type === "fight" || e.type === "bite") && e.b.ref === "target") mark(e.b.index);
  }
  return harm;
}

/**
 * Would these changes be bad for the permanent's controller? Shrinking, losing abilities,
 * restrictions, or being stolen. Used by bots to aim Auras and effects.
 */
export function modsAreHarmful(mods: Modification[]): boolean {
  let pt = 0;
  for (const m of mods) {
    if (m.kind === "modifyPT") pt += estimate(m.power) + estimate(m.toughness);
    if (m.kind === "addAbility") pt -= grantCost(m.text);
    if (["control", "loseAllAbilities", "removeKeywords", "cantAttack", "cantBlock", "doesntUntap", "setSubtypes"].includes(m.kind)) return true;
    if (m.kind === "setPT" && estimate(m.power) + estimate(m.toughness) <= 2) return true;
  }
  return pt < 0;
}

/**
 * How much a granted triggered ability hurts the permanent's controller, in power/toughness points: an
 * upkeep edict ('Enchanted creature has "At the beginning of your upkeep, sacrifice a creature."') or life
 * loss makes the Aura one to put on an opponent's creature.
 */
function grantCost(text: string): number {
  let n = 0;
  for (const t of compileGranted(text).triggers)
    for (const e of allEffects(t.body.effects)) {
      if (e.type === "sacrifice" || (e.type === "pick" && e.action !== "counters") || e.type === "cumulativeUpkeep") n += 10;
      else if (e.type === "loseLife" && e.who.ref === "you") n += 4;
      else if (e.type === "discard" && e.who.ref === "you") n += 4;
      else if ((e.type === "tap" && e.what.ref === "self") || (e.type === "counters" && harmfulCounter(e.counter) && e.what.ref === "self")) n += 4;
    }
  return n;
}

/** How much damage an effect body deals to target `i`, for picking what to kill. */
export function damageTo(body: AbilityBody, i: number, x = 0): number {
  let n = 0;
  for (const e of allEffects(body.effects)) if (e.type === "damage" && refCovers(e.to, i)) n += estimate(e.amount, x);
  return n;
}

export const lethalDamage = (s: GameState, o: GameObject) => Math.max(0, toughness(s, o) - o.damage);

/**
 * A rough value for an amount before the game works it out, for bots and previews: X as `x`,
 * a count as 2 of whatever it counts.
 */
export function estimate(a: Amount, x = 0): number {
  if (typeof a === "number") return a;
  const n = Math.max(0, (a.count.kind === "x" ? x : 2) * (a.times ?? 1) + (a.plus ?? 0));
  return a.negate ? -n : n;
}

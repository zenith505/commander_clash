import type { AbilityBody, ChosenTarget, ChoiceKind, EntersOption, Range, TargetChoice, TargetSpec } from "../abilities";
import { manaValue, parseManaCost } from "../mana";
import { abilitiesOf, defOf, objHasKeyword, objIsType, power, toughness } from "../cards";
import { creatureTypesOf, livingPlayers, obj, player, shareCreatureType } from "../game";
import { characteristics, controllerOf, type Characteristics } from "../layers";
import { expandMany, manySlot, modeCountProblem } from "../modes";
import { CREATURE_TYPES, type SourceQuality } from "../keywords";
import { protectedFrom } from "../damage";
import type { CardDef, Chosen, Color, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { COLOR_NAMES } from "./describe";

/** Multicolored: two or more colors (CR 105.4); monocolored: exactly one; colorless: none (CR 105.2c). */
const colorCountIs = (want: NonNullable<TargetSpec["colorCount"]>, n: number) => (want === "multicolored" ? n >= 2 : want === "monocolored" ? n === 1 : n === 0);

/**
 * Does this permanent fit `spec` from `controller`'s point of view, using its current
 * characteristics? Hexproof only matters for targeting (CR 702.11b), not for what an Aura
 * can stay attached to (CR 303.4d), hence `targeting`.
 */
export function objectMatches(s: GameState, spec: TargetSpec, o: GameObject, controller: PlayerId, targeting = true, src?: SourceQuality, chars?: Characteristics): boolean {
  if (o.zone !== "battlefield") return false;
  const c = chars ?? characteristics(s, o);
  const hasSubtype = (st: string) => c.subtypes.includes(st) || (!!c.allCreatureTypes && CREATURE_TYPES.has(st));
  if (spec.types?.length && !spec.types.some((t) => c.types.includes(t)) && !spec.orSubtypes?.some(hasSubtype)) return false;
  if (spec.allTypes?.some((t) => !c.types.includes(t))) return false;
  if (spec.notTypes?.some((t) => c.types.includes(t))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => c.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => c.colors.includes(col))) return false;
  if (spec.colorCount && !colorCountIs(spec.colorCount, c.colors.length)) return false;
  if (spec.supertypes?.some((t) => !c.supertypes.includes(t))) return false;
  if (spec.notSupertypes?.some((t) => c.supertypes.includes(t))) return false;
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
  if (spec.combat === "attackedThisTurn" && o.attacked?.turn !== s.turn) return false;
  if (spec.controller === "you" && c.controller !== controller) return false;
  if (spec.controller === "opponent" && c.controller === controller) return false;
  if (spec.controller === "eventPlayer" || spec.controller === "enchanted" || (spec.controlledBy !== undefined && c.controller !== spec.controlledBy)) return false;
  if (spec.tapped !== undefined && !!o.tapped !== spec.tapped) return false;
  if (spec.dealtDamageThisTurn && !o.wasDealtDamage) return false;
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

/** The names a player can choose from: every creature type (CR 205.3m) or color, but `except`. */
/** Riot's and unleash's choice (see choiceOptions). */
export const ENTERS_COUNTER = "+1/+1 counter";

export function choiceOptions(what: ChoiceKind | EntersOption, except?: string): string[] {
  if (what === "riot") return [ENTERS_COUNTER, "Haste"];
  if (what === "unleash") return [ENTERS_COUNTER, "No counter"];
  const all = what === "color" ? Object.values(COLOR_NAMES) : what === "basicLandType" ? ["Plains", "Island", "Swamp", "Mountain", "Forest"] : [...CREATURE_TYPES].sort();
  return all.filter((x) => x.toLowerCase() !== except?.toLowerCase());
}

/** Record a choice by name: a creature type, or a color ("Blue" is U). */
export function withChoice(chosen: Chosen | undefined, what: ChoiceKind, choice: string): Chosen {
  if (what === "creatureType") return { ...chosen, type: choice };
  if (what === "basicLandType") return { ...chosen, landType: choice };
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
  // Changeling gives every creature type wherever the card is (CR 702.73a).
  const hasSubtype = (st: string) => d.subtypes.includes(st) || (d.keywords.includes("Changeling") && CREATURE_TYPES.has(st));
  if (spec.types?.length && !spec.types.some((ty) => d.types.includes(ty)) && !spec.orSubtypes?.some(hasSubtype)) return false;
  if (spec.allTypes?.some((ty) => !d.types.includes(ty))) return false;
  if (spec.notTypes?.some((ty) => d.types.includes(ty))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => d.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => d.colors.includes(col))) return false;
  if (spec.colorCount && !colorCountIs(spec.colorCount, d.colors.length)) return false;
  if (spec.supertypes?.some((x) => !d.supertypes.includes(x))) return false;
  if (spec.notSupertypes?.some((x) => d.supertypes.includes(x))) return false;
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

/** Hexproof or shroud a player has from a permanent they control ("You have hexproof"). */
export function playerProtection(s: GameState, pid: PlayerId): "hexproof" | "shroud" | undefined {
  let out: "hexproof" | undefined;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (controllerOf(s, o) !== pid) continue;
    const has = abilitiesOf(s, o).youHave;
    if (has === "shroud") return "shroud";
    if (has) out = has;
  }
  return out;
}

export function isLegalTarget(s: GameState, spec: TargetSpec, t: TargetChoice, controller: PlayerId, src?: SourceQuality): boolean {
  if (t.kind === "none") return false;
  if (t.kind === "player") {
    const p = s.players[t.id];
    if (!p || p.lost) return false;
    // "You have hexproof": not by opponents' spells and abilities (CR 702.11d); "you have shroud": by none (CR 702.18d).
    const prot = playerProtection(s, t.id);
    if (prot === "shroud" || (prot === "hexproof" && t.id !== controller)) return false;
    if (spec.kind === "any") return !spec.opponent || t.id !== controller;
    if (spec.kind !== "player") return false;
    return !spec.opponent || t.id !== controller;
  }
  if (t.kind === "stack") {
    if (spec.kind !== "spell") return false;
    // A resolving spell is still on the stack until it finishes (CR 608.2n): "change the target" can pick it.
    const item = s.stack.find((x) => x.id === t.id) ?? (s.resolving?.item.id === t.id ? s.resolving.item : undefined);
    if (!item) return false;
    if (spec.singleTarget && (item.targets ?? []).filter((x) => x.kind !== "none").length !== 1) return false;
    if (item.kind === "ability") return !!spec.stackAbilities && (spec.stackAbilities === "both" || (spec.stackAbilities === "triggered") === !!item.triggered);
    if (spec.noSpells || !item.objectId) return false;
    if (spec.targetsWhat && !targetsMatch(s, item.targets ?? [], spec.targetsWhat, controller)) return false;
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

/**
 * "A spell that targets a permanent you control": one of its targets is still that object on the battlefield and matches
 * (it needn't still be a legal target for that spell), or "you" (rulings on Rebuff the Wicked).
 */
function targetsMatch(s: GameState, targets: TargetChoice[], what: TargetSpec | "you", controller: PlayerId): boolean {
  return targets.some((t) => {
    if (what === "you") return t.kind === "player" && t.id === controller;
    if (t.kind !== "object") return false;
    const o = s.objects[t.id];
    return !!o && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc) && objectMatches(s, what, o, controller, false);
  });
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

/**
 * The body to choose targets for (CR 601.2c): "any number of target creatures" offered as one "up to" target for each
 * creature that could be chosen, "up to X target ..." no more than X; `fitMany` then keeps the ones chosen. Else as is.
 */
export function offerMany(s: GameState, body: AbilityBody, controller: PlayerId, x = 0, src?: SourceQuality, sourceId?: ObjectId): AbilityBody {
  const i = manySlot(body.targets);
  if (i < 0) return body;
  const spec = body.targets[i]!;
  const room = spec.skip ? 0 : legalTargets(s, spec, controller, undefined, src, sourceId).filter((t) => !(spec.notSource && t.kind === "object" && t.id === sourceId)).length;
  return expandMany(body, spec.many === "x" ? Math.min(x, room) : room, true);
}

/** The targets to choose from, as offerMany offers them. */
export const offerTargets = (s: GameState, specs: TargetSpec[], controller: PlayerId, x = 0, src?: SourceQuality, sourceId?: ObjectId): TargetSpec[] =>
  offerMany(s, { targets: specs, effects: [], text: "" }, controller, x, src, sourceId).targets;

export const sameTarget = (a: TargetChoice | undefined, b: TargetChoice) => !!a && a.kind !== "none" && b.kind !== "none" && a.kind === b.kind && a.id === b.id;

/**
 * Can `t` be chosen for target `i`, after `chosen` for the ones before it? An "up to" target may be
 * left unchosen (CR 115.6); "another target" can't be the source, or one of the targets before it;
 * and one "two target creatures" can't pick the same creature twice (CR 115.3).
 */
export function canChooseTarget(s: GameState, specs: TargetSpec[], chosen: TargetChoice[], i: number, t: TargetChoice, controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean {
  const spec = specs[i]!;
  // A target the spell is cast as if it didn't have (CR 702.33g): nothing is chosen for it.
  if (spec.skip) return t.kind === "none";
  if (t.kind === "none") return !!spec.optional;
  if (!isLegalTarget(s, spec, t, controller, src)) return false;
  if (spec.notSource && t.kind === "object" && t.id === sourceId) return false;
  if (!lesserPowerOk(s, spec, t, sourceId)) return false;
  return !(spec.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t)) && relatedOk(s, spec, chosen, t);
}

/** "From a single graveyard", "that share a creature type": how this target relates to the others of its group already chosen. */
function relatedOk(s: GameState, spec: TargetSpec, chosen: TargetChoice[], t: TargetChoice): boolean {
  if (t.kind !== "object") return true;
  const others = (idx: number[] | undefined) => (idx ?? []).flatMap((j) => { const c = chosen[j]; const o = c?.kind === "object" ? s.objects[c.id] : undefined; return o ? [o] : []; });
  const o = obj(s, t.id);
  if (others(spec.sameGraveyardAs).some((x) => x.owner !== o.owner)) return false;
  return others(spec.sharesCreatureTypeWith).every((x) => shareCreatureType(creatureTypesOf(s, x), creatureTypesOf(s, o)));
}

/**
 * "Target attacking creature with lesser power" (mentor): less than the source's power, its last known
 * power once it has left the battlefield (CR 702.134a, 608.2h).
 */
export function lesserPowerOk(s: GameState, spec: TargetSpec, t: TargetChoice, sourceId: ObjectId | undefined): boolean {
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
  return divisionProblem(specs, t);
}

/** "Divided as you choose" (CR 601.2d): each target chosen gets at least 1, and the parts add up to the amount. */
export function divisionProblem(specs: TargetSpec[], t: TargetChoice[]): string | null {
  const part = (c: TargetChoice | undefined) => (c && (c.kind === "object" || c.kind === "player") ? c.amount : undefined);
  for (let i = 0; i < specs.length; i++) {
    const d = specs[i]!.skip ? undefined : specs[i]!.divided;
    const n = part(t[i]);
    if (!d) {
      if (n !== undefined) return `nothing is divided among ${specs[i]!.text}`;
      continue;
    }
    if (t[i]?.kind !== "none" && (n === undefined || !Number.isInteger(n) || n < 1)) return `each target must get at least 1 of the ${d.total}`;
    if (i === d.first) {
      let sum = 0;
      for (let k = d.first; k < d.first + d.n; k++) sum += part(t[k]) ?? 0;
      if (sum !== d.total && !(d.upTo && sum === 0)) return d.counter ? `distribute the ${d.total} counters among the targets` : `divide ${d.total} among the targets`;
    }
  }
  return null;
}

/** Remember which object each target is right now, so a later zone change makes it a different object (CR 400.7). */
export const stampTargets = (s: GameState, targets: TargetChoice[] | undefined): TargetChoice[] | undefined =>
  targets?.map((t) => (t.kind === "object" ? { kind: "object", id: t.id, zc: s.objects[t.id]?.zoneChanges ?? 0, ...(t.amount !== undefined ? { amount: t.amount } : {}) } : t));

/**
 * Could legal targets be chosen for all of `specs` (CR 601.2c, 603.3d)? "Up to" targets can be left
 * out, so only the others need something, each different where they must be.
 */
export function hasLegalTargets(s: GameState, specs: TargetSpec[], controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean {
  // "Any number of target creatures" can be none (CR 115.6), and so can "up to X" (see TargetSpec.many).
  const free = (spec: TargetSpec) => spec.optional || spec.skip || !!spec.many;
  const options = specs.map((spec, i) => (free(spec) ? [] : legalTargets(s, spec, controller, undefined, src).filter((t) => canChooseTarget(s, specs, [], i, t, controller, src, sourceId))));
  if (options.some((o, i) => !free(specs[i]!) && !o.length)) return false;
  if (!specs.some((spec) => spec.distinctFrom?.length || spec.sharesCreatureTypeWith?.length || spec.sameGraveyardAs?.length)) return true;
  // Some targets must differ from each other: look for one way to choose them all.
  const chosen: TargetChoice[] = [];
  const fill = (i: number): boolean => {
    if (i === specs.length) return true;
    if (free(specs[i]!)) {
      chosen[i] = { kind: "none" };
      return fill(i + 1);
    }
    for (const t of options[i]!) {
      if ((specs[i]!.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t)) || !relatedOk(s, specs[i]!, chosen, t)) continue;
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
/** `both`: a "choose both instead" applies (see AbilityBody.modal.both). */
export function modesProblem(s: GameState, body: AbilityBody, modes: number[] | undefined, controller: PlayerId, src?: SourceQuality, both = false): string | null {
  if (!body.modal) return modes?.length ? "this isn't modal" : null;
  if (!modes) return "choose a mode";
  const count = modeCountProblem(body, modes, both);
  if (count) return count;
  const legal = legalModes(s, body, controller, src);
  const bad = modes.find((i) => !legal[i]);
  return bad === undefined ? null : `can't choose "${body.modal.modes[bad]!.text}": no legal targets`;
}

// ---------------------------------------------------------------------------
// Resolving

/** The permanents a player could pick for a "pick" effect: their own, matching the filter (not targeted, so hexproof doesn't matter). */
/** `sourceId`: "another creature you control" (filter.notSource) can't be the ability's source. */
export function pickOptions(s: GameState, e: { filter: TargetSpec; least?: "toughness"; greatest?: "power" }, pid: PlayerId, sourceId?: ObjectId): ObjectId[] {
  const ids = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !(e.filter.notSource && id === sourceId) && objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), pid, false));
  // "Sacrifices a creature with the greatest power among creatures they control": the greatest, or tied for it; the
  // player chooses among those tied (rulings on Crackling Doom).
  if (e.greatest === "power") {
    const max = Math.max(...ids.map((id) => power(s, obj(s, id))));
    return ids.filter((id) => power(s, obj(s, id)) === max);
  }
  if (e.least !== "toughness") return ids;
  // Bolster: the least toughness, or tied for it (CR 701.39a).
  const min = Math.min(...ids.map((id) => toughness(s, obj(s, id))));
  return ids.filter((id) => toughness(s, obj(s, id)) === min);
}

import { ANY_COUNTER } from "../abilities";
import type { AbilityBody, ChosenTarget, ChoiceKind, EntersOption, Modification, ObjRef, PickAction, Range, TargetChoice, TargetSpec, Untargetable } from "../abilities";
import { compileCard, compileGranted } from "../oracle";
import { manaValue, parseManaCost, xCount } from "../mana";
import { abilitiesOf, basicLandManaAbility, basePower, basePowerNow, baseToughness, canBeSacrificed, defOf, isType, objHasKeyword, objIsType, power, toughness, withCastThisTurn } from "../cards";
import { attackedDuringLastTurn, attackedPlaneswalker, creatureTypesOf, livingPlayers, obj, opponents, player, shareCreatureType } from "../game";
import { characteristics, controllerOf, everyCreatureType, mostCommonColors, staticConditionNow, type Characteristics } from "../layers";
import { expandMany, expandPerOpponent, manySlot, modeCountProblem, withModes } from "../modes";
import { CREATURE_TYPES, hexproofFrom, protectedFromPlayer, type SourceQuality } from "../keywords";
import { protectedFrom } from "../damage";
import type { CardDef, Chosen, Color, GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import { COLOR_NAMES } from "./describe";
import { evalAmount, type AmountCtx } from "../amounts";
import { defMv, hasName, isDoubleFacedDef, isTransformed, sameName } from "../faces";

const CARD_TYPES = new Set(["Artifact", "Battle", "Creature", "Enchantment", "Kindred", "Land", "Planeswalker", "Instant", "Sorcery"]);

/** Multicolored: two or more colors (CR 105.4); monocolored: exactly one; colorless: none (CR 105.2c). */
const colorCountIs = (want: NonNullable<TargetSpec["colorCount"]>, n: number) => (want === "multicolored" ? n >= 2 : want === "monocolored" ? n === 1 : want === "two" ? n === 2 : want === "notTwo" ? n !== 2 : want === "colored" ? n >= 1 : want === "all" ? n >= 5 : want === "notAll" ? n < 5 : n === 0);

/**
 * Does this permanent fit `spec` from `controller`'s point of view, using its current
 * characteristics? Hexproof only matters for targeting (CR 702.11b), not for what an Aura
 * can stay attached to (CR 303.4d), hence `targeting`.
 */
/**
 * Does `o` match the filter? `chars`: its characteristics as the layers applied so far left them, and `view` the others',
 * when the layers are being worked out (CR 613.8a).
 */
/**
 * "And all other permanents with the same name as that permanent" (Maelstrom Pulse): the others with the target's name
 * on the battlefield now, matching `filter` (and controlled by the target's controller, with `of`). A face-down permanent
 * has no name, so it shares one with nothing (CR 708.2a).
 */
export function sameNamed(s: GameState, t: GameObject, group: NonNullable<Extract<ObjRef, { ref: "target" }>["sameName"]>, controller: PlayerId): GameObject[] {
  if (t.zone !== "battlefield" || t.faceDown) return [];
  const name = characteristics(s, t).name;
  const whose = controllerOf(s, t);
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => o.id !== t.id && !o.faceDown && sameName(characteristics(s, o).name, name) && (!group.of || controllerOf(s, o) === whose) && objectMatches(s, group.filter, o, controller, false));
}

/** Radiance: the other permanents matching `group.filter` that share at least one color with `t` now (CR 105.2). */
export function sharingAColor(s: GameState, t: GameObject, group: NonNullable<Extract<ObjRef, { ref: "target" }>["sharesColor"]>, controller: PlayerId): GameObject[] {
  if (t.zone !== "battlefield") return [];
  const colors = characteristics(s, t).colors;
  if (!colors.length) return [];
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => o.id !== t.id && characteristics(s, o).colors.some((c) => colors.includes(c)) && objectMatches(s, group.filter, o, controller, false));
}

/** Is `o` attacking `pid` or a planeswalker `pid` controls now (CR 506.3)? Not a battle. */
function attacksYouOrYourPlaneswalker(s: GameState, o: GameObject, pid: PlayerId): boolean {
  if (o.attacking === undefined) return false;
  if (!o.attackingPermanent) return o.attacking === pid;
  const pw = s.objects[o.attackingPermanent.id];
  return !!pw && pw.zone === "battlefield" && (pw.zoneChanges ?? 0) === o.attackingPermanent.zc && characteristics(s, pw).types.includes("Planeswalker") && controllerOf(s, pw) === pid;
}

export function objectMatches(s: GameState, spec: TargetSpec, o: GameObject, controller: PlayerId, targeting = true, src?: SourceQuality, chars?: Characteristics, view?: (o: GameObject) => Characteristics | undefined): boolean {
  if (o.zone !== "battlefield") return false;
  // An amount bound not worked out yet (TargetSpec.bound): nothing is known to fit it. Nor "that saddled it" without
  // the source (see pickOptions, isLegalTarget).
  if (spec.bound || spec.saddledSource || spec.drafted || spec.targetsSource) return false;
  if (spec.objectId !== undefined && o.id !== spec.objectId) return false;
  const c = chars ?? characteristics(s, o);
  const hasSubtype = (st: string) => c.subtypes.includes(st) || (!!c.allCreatureTypes && CREATURE_TYPES.has(st));
  if (spec.types?.length && !spec.types.some((t) => c.types.includes(t)) && !spec.orSubtypes?.some(hasSubtype) && !(spec.orAdventure && s.cards[o.cardId]?.layout === "adventure" && !o.copyOf)) return false;
  if (spec.hasAdventure && !(s.cards[o.cardId]?.layout === "adventure" && !o.copyOf)) return false;
  if (spec.allTypes?.some((t) => !c.types.includes(t))) return false;
  if (spec.notTypes?.some((t) => c.types.includes(t))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => c.colors.includes(col))) return false;
  if (spec.bothColors?.some((col) => !c.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => c.colors.includes(col))) return false;
  if (spec.colorCount && !colorCountIs(spec.colorCount, c.colors.length)) return false;
  if (spec.mostCommonColor !== undefined) {
    const most = mostCommonColors(s, view ? (id) => view(s.objects[id]!) : undefined);
    if (c.colors.some((col) => most.includes(col)) !== spec.mostCommonColor) return false;
  }
  if (spec.supertypes?.some((t) => !c.supertypes.includes(t))) return false;
  if (spec.notSupertypes?.some((t) => c.supertypes.includes(t))) return false;
  if (spec.owner === "you" && o.owner !== controller) return false;
  if (spec.owner === "opponent" && o.owner === controller) return false;
  if (spec.anyOf && !spec.anyOf.some((a) => objectMatches(s, a, o, controller, false, src, chars, view))) return false;
  if (spec.subtypes?.length && !spec.subtypes.some(hasSubtype)) return false;
  if (spec.notSubtypes?.some(hasSubtype)) return false;
  if (spec.attachedTo) {
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    // Counted inside the layers (Sage's Reverie): the host as the layers have it so far, not computed again.
    const hostChars = host && view ? view(host) : undefined;
    if (!host || (view && !hostChars) || !objectMatches(s, spec.attachedTo, host, controller, false, undefined, hostChars, view)) return false;
  }
  // A choice that was never made: "of the chosen type" matches nothing, "not of the chosen type" everything.
  if (spec.chosen === "type" || spec.chosen === "color" || spec.chosen === "name" || spec.chosen === "typesChosen" || spec.chosen === "parity") return false;
  if (spec.parity?.is && !isParity(spec.parity.of === "power" ? (c.types.includes("Creature") ? c.power : undefined) : defMv(defOf(s, o)), spec.parity)) return false;
  if (spec.noCounters && Object.values(o.counters).some((n) => (n ?? 0) > 0)) return false;
  // Keldon Twilight: "that they controlled since the beginning of the turn": under its controller since before this turn.
  if (spec.controlledSinceTurnBegan && !(o.zone === "battlefield" && o.controlledSinceTurn < s.turn)) return false;
  if (spec.notCounter && (o.counters[spec.notCounter] ?? 0) > 0) return false;
  if (spec.counter && !(spec.counter === ANY_COUNTER ? Object.values(o.counters).some((n) => (n ?? 0) > 0) : (o.counters[spec.counter] ?? 0))) return false;
  if (spec.counterMin && (o.counters[spec.counter!] ?? 0) < spec.counterMin) return false;
  // "With the chosen name": its name now (a copy's is what it copies); a face-down one has none (CR 201.2a, 708.2a).
  if (spec.named !== undefined && (o.faceDown || !hasName(c.name, spec.named))) return false;
  if (spec.notNamed !== undefined && !o.faceDown && hasName(c.name, spec.notNamed)) return false;
  if (spec.uniqueNameAmongYours && !o.faceDown && s.battlefield.some((id) => id !== o.id && !s.objects[id]!.faceDown && controllerOf(s, s.objects[id]!) === controller && sameName((view?.(s.objects[id]!) ?? characteristics(s, s.objects[id]!)).name, c.name))) return false;
  const hasKw = (k: string) => c.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.keywords?.some((k) => !hasKw(k))) return false;
  if (spec.toxic && !c.keywords.some((x) => /^toxic\b/i.test(x))) return false;
  if (spec.notKeywords?.some(hasKw)) return false;
  // Power and toughness only exist for creatures (CR 208.3); a noncreature has neither.
  if (spec.power && (!c.types.includes("Creature") || !inRange(c.power, spec.power))) return false;
  if (spec.toughness && (!c.types.includes("Creature") || !inRange(c.toughness, spec.toughness))) return false;
  if (spec.totalPT && (!c.types.includes("Creature") || !inRange(c.power + c.toughness, spec.totalPT))) return false;
  if (spec.manaValue && !inRange(defMv(defOf(s, o)), spec.manaValue)) return false;
  if (spec.equalsChosen && (spec.equals === undefined || !spec.equalsChosen.some((k) => (k === "manaValue" ? defMv(defOf(s, o)) : c.types.includes("Creature") ? c[k] : undefined) === spec.equals))) return false;
  if (spec.mvAtMostControllersGraveyard && defMv(defOf(s, o)) > (s.players[c.controller]?.graveyard.length ?? 0)) return false;
  if (spec.controllersLandsAtMost !== undefined && s.battlefield.filter((id) => { const x = view?.(s.objects[id]!) ?? characteristics(s, s.objects[id]!); return x.controller === c.controller && x.types.includes("Land"); }).length > spec.controllersLandsAtMost) return false;
  if (spec.manaCostIn && !spec.manaCostIn.includes(defOf(s, o).manaCost)) return false;
  if (spec.xInCost && !parseManaCost(defOf(s, o).manaCost).hasX) return false;
  if (spec.combat === "attacking" && o.attacking === undefined) return false;
  if (spec.combat === "attackingYou" && (o.attacking !== controller || o.attackingPermanent)) return false;
  // Security Bypass: "attacking alone": attacking with no other creature attacking (CR 506.5).
  if (spec.combat === "attackingAlone" && (o.attacking === undefined || s.battlefield.some((id) => id !== o.id && s.objects[id]!.attacking !== undefined))) return false;
  // Soul Snare: "attacking you or a planeswalker you control": a planeswalker that's still there and still yours (rulings).
  if (spec.combat === "attackingYouOrYourPlaneswalker" && !attacksYouOrYourPlaneswalker(s, o, controller)) return false;
  if (spec.combat === "attackingOpponent" && (o.attacking === undefined || o.attacking === controller || o.attackingPermanent || !opponents(s, controller).includes(o.attacking))) return false;
  if (spec.attackingWhom !== undefined && (spec.attackingWhom === "eventPlayer" || o.attacking !== spec.attackingWhom || o.attackingPermanent)) return false;
  if (spec.combat === "blocking" && !o.blocking) return false;
  if (spec.combat === "blocked" && !(o.attacking !== undefined && o.blockedBy !== undefined)) return false;
  // Unblocked: attacking once blockers have been declared, and not blocked (CR 509.1h).
  if (spec.combat === "unblocked" && !(o.attacking !== undefined && o.blockedBy === undefined && ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step) && s.pending?.kind !== "declareBlockers")) return false;
  if (spec.combat === "notInCombat" && (o.attacking !== undefined || o.blocking)) return false;
  if (spec.combat === "notAttacking" && o.attacking !== undefined) return false;
  if (spec.combat === "attackingOrBlocking" && o.attacking === undefined && !o.blocking) return false;
  if (spec.combat === "attackedThisTurn" && o.attacked?.turn !== s.turn) return false;
  if (spec.combat === "blockedThisTurn" && o.blockedTurn !== s.turn) return false;
  if (spec.combat === "didntAttackThisTurn" && o.attacked?.turn === s.turn) return false;
  if (spec.combat === "attackedLastTurn" && !attackedDuringLastTurn(s, o, c.controller)) return false;
  if (spec.dealtDamageToYou && !s.turnLog?.damagedBy?.[s.resolving?.item.controller ?? controller]?.includes(`${o.id}@${o.zoneChanges ?? 0}`)) return false;
  if (spec.dealtCombatDamageToYou && !s.turnLog?.combatDamagedBy?.[s.resolving?.item.controller ?? controller]?.includes(`${o.id}@${o.zoneChanges ?? 0}`)) return false;
  if (spec.enteredThisTurn && o.enteredTurn !== s.turn) return false;
  if (spec.enteredUnderYou && !(s.turnLog?.entered ?? []).some((e) => e.id === o.id && e.zc === (o.zoneChanges ?? 0) && e.controller === controller)) return false;
  if (spec.notEnteredThisTurn && o.enteredTurn === s.turn) return false;
  if (spec.enteredSinceYourLastTurn) {
    // Your last turn: the one before this one if it's your turn now, else your most recent one (none yet: any).
    const p = s.players[controller];
    const last = s.activePlayer === controller ? p?.lastTurnBegan : p?.turnBegan;
    if (o.enteredTurn === undefined || (last !== undefined && o.enteredTurn <= last)) return false;
  }
  if (spec.attachedToYou && o.attachedToPlayer !== controller) return false;
  if (spec.combat === "attackingBattle" && !(o.attacking !== undefined && attackedBattle(s, o))) return false;
  if (spec.combat === "couldButDidntAttack" && (o.couldAttack !== s.turn || o.attacked?.turn === s.turn)) return false;
  if (spec.controller === "you" && c.controller !== controller) return false;
  if (spec.controller === "opponent" && c.controller === controller) return false;
  if (spec.controller === "eventPlayer" || spec.controller === "enchanted" || spec.controller === "chosenPlayer" || (spec.controlledBy !== undefined && c.controller !== spec.controlledBy)) return false;
  if (spec.notControlledBy !== undefined && c.controller === spec.notControlledBy) return false;
  if (spec.monarchControls && c.controller !== s.monarch) return false;
  if (spec.protector === "eventPlayer" || (spec.protector === "opponent" && (o.protector === undefined || o.protector === controller)) || (spec.protectedBy !== undefined && o.protector !== spec.protectedBy)) return false;
  if (spec.tapped !== undefined && !!o.tapped !== spec.tapped) return false;
  if (spec.dealtDamageThisTurn && !o.wasDealtDamage) return false;
  if (spec.dealtDamageAsSourceThisTurn && !Object.values(s.turnLog?.damageSources ?? {}).some((keys) => keys.includes(`${o.id}@${o.zoneChanges ?? 0}`))) return false;
  if (spec.token !== undefined && o.isToken !== spec.token) return false;
  if (spec.transformed && !isTransformed(s, o)) return false;
  if (spec.faceDown && !o.faceDown) return false;
  if (spec.powerAboveBase && !(c.types.includes("Creature") && power(s, o) > basePowerNow(s, o))) return false;
  if (spec.basePtEither !== undefined) {
    // Its base power and toughness (see basePowerNow), from the characteristics as they are, or as the layers have them
    // so far when a static ability counts them (CR 613.4a-b come before 613.4c).
    const set = [...c.pt].reverse().find((p) => p.kind === "set");
    const [bp, bt] = set ? [set.power, set.toughness] : [c.printedPower, c.printedToughness];
    if (!c.types.includes("Creature") || (bp !== spec.basePtEither && bt !== spec.basePtEither)) return false;
  }
  if (spec.basePT) {
    const set = [...c.pt].reverse().find((p) => p.kind === "set");
    const [bp, bt] = set ? [set.power, set.toughness] : [c.printedPower, c.printedToughness];
    if (!c.types.includes("Creature") || bp !== spec.basePT[0] || bt !== spec.basePT[1]) return false;
  }
  if (spec.basePower !== undefined) {
    const set = [...c.pt].reverse().find((p) => p.kind === "set");
    if (!c.types.includes("Creature") || (set ? set.power : c.printedPower) !== spec.basePower) return false;
  }
  if (spec.toughnessAbovePower && !(c.types.includes("Creature") && toughness(s, o) > power(s, o))) return false;
  if (spec.ptUnequal && !(c.types.includes("Creature") && toughness(s, o) !== power(s, o))) return false;
  if (spec.doubleFaced && !isDoubleFacedDef(s.cards[o.cardId] ?? defOf(s, o))) return false;
  if (spec.manaAbility && !hasManaAbility(s, o, c)) return false;
  if (spec.tapAbility && !((ab) => ab.mana.some((m) => m.tap) || ab.activated.some((a) => a.tap))(abilitiesOf(s, o))) return false;
  if (spec.commander !== undefined && !!o.isCommander !== spec.commander) return false;
  if (spec.status && !hasStatus(s, o, c, spec.status, view, controller)) return false;
  if (spec.suspected && o.suspected === undefined) return false;
  if (spec.notOnlyControllersColor) {
    const col = s.resolving?.chosen?.colorsBy?.[c.controller];
    if (!c.colors.length || (c.colors.length === 1 && c.colors[0] === col)) return false;
  }
  const hexproof = targeting && c.controller !== controller && !exposed(s, o) && !seesHexproofOf(s, controller, o);
  if (hexproof && objHasKeyword(s, o, "Hexproof")) return false;
  if (hexproof && src && hexproofFrom(c.keywords, src)) return false; // CR 702.11d
  if (targeting && objHasKeyword(s, o, "Shroud")) return false; // CR 702.18a: not even its controller can target it
  if (targeting && c.untargetable?.some((u) => untargetableBy(u, controller, src))) return false;
  // Protection from the source's color: it can't be targeted (CR 702.16b), enchanted or equipped (702.16c-d). From a
  // player: not by what that player controls (702.16k); the one targeting controls the spell or ability.
  const holder = { controller: c.controller, chosenPlayer: o.chosen?.player };
  if (src && protectedFrom(c.keywords, { ...src, controller: src.controller ?? controller }, holder)) return false;
  if (!src && targeting && protectedFromPlayer(c.keywords, controller, holder)) return false;
  return true;
}

/**
 * A creature an opponent of Nowhere to Run's controller controls: it can be targeted as though it didn't have hexproof,
 * "hexproof from" included (CR 702.11e), and its ward abilities don't trigger.
 */
export function exposed(s: GameState, o: GameObject): boolean {
  if (o.zone !== "battlefield" || !objIsType(s, o, "Creature")) return false;
  const holder = controllerOf(s, o);
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    return !!abilitiesOf(s, p).exposesOpponentsCreatures && controllerOf(s, p) !== holder;
  });
}

/**
 * Does `pid` target `o` (a creature an opponent controls) as though it didn't have hexproof? Glaring Spotlight's static
 * ability, or Detection Tower's this turn.
 */
function seesHexproofOf(s: GameState, pid: PlayerId, o: GameObject): boolean {
  if (o.zone !== "battlefield" || !objIsType(s, o, "Creature")) return false;
  if ((s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === pid && r.rule === "seeHexproof")) return true;
  return s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && !!abilitiesOf(s, s.objects[id]!).seesOpponentsCreatures);
}

/**
 * "Can't be the target of [what]": by a spell or ability `controller` controls, from a source like `src` (CR 115.4). With
 * no source given (the UI's highlights), only who controls it is checked, as with protection; casting checks it all.
 */
function untargetableBy(u: Untargetable & { of: PlayerId }, controller: PlayerId, src?: SourceQuality): boolean {
  if (u.opponents && u.of === controller) return false;
  if (!src) return !u.spells && !u.abilities && !u.colors && !u.notColors;
  if (u.spells && !src.spell) return false;
  if (u.abilities && src.spell) return false;
  if (u.subtype && !src.subtypes?.includes(u.subtype)) return false;
  if (u.colors && !u.colors.some((col) => src.colors.includes(col))) return false;
  return !u.notColors?.some((col) => src.colors.includes(col));
}

/**
 * Enchanted: an Aura is attached to it (CR 303.4b). Equipped: an Equipment is (301.5a). Modified: it has a counter on it,
 * it's equipped, or it's enchanted by an Aura its controller controls (700.9).
 */
function hasStatus(s: GameState, o: GameObject, c: Characteristics, status: NonNullable<TargetSpec["status"]>, view?: (o: GameObject) => Characteristics | undefined, you?: PlayerId): boolean {
  if (status === "unenchanted") return !hasStatus(s, o, c, "enchanted", view);
  if (status === "goaded") return !!c.goaded; // not "as though it were goaded" (Kardur)
  if (status === "renowned") return !!o.renowned; // CR 702.112b
  if (status === "modified" && Object.values(o.counters).some((n) => (n ?? 0) > 0)) return true;
  // A permanent that has left: what was attached to it as it last existed (CR 603.10a).
  for (const id of o.lastAttachments ?? s.battlefield) {
    const a = s.objects[id];
    if (!a || (!o.lastAttachments && a.attachedTo !== o.id)) continue;
    const ac = view && a.zone === "battlefield" ? view(a) : characteristics(s, a);
    if (!ac) continue;
    if (status === "enchantedByYours") {
      if (ac.subtypes.includes("Aura") && ac.controller === you) return true;
      continue;
    }
    if (status === "legendaryEquipped") {
      if (ac.subtypes.includes("Equipment") && ac.supertypes.includes("Legendary")) return true;
      continue;
    }
    if (status !== "enchanted" && ac.subtypes.includes("Equipment")) return true;
    if ((status === "enchanted" || status === "enchantedOrEquipped") && ac.subtypes.includes("Aura")) return true;
    if (status === "modified" && ac.subtypes.includes("Aura") && ac.controller === c.controller) return true;
  }
  return false;
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
  // "Of a type chosen this way" (Patriarch's Bidding): any of the types the players chose.
  if ((kind === "typesChosen" || kind === "notTypesChosen") && chosen?.types?.length)
    return kind === "typesChosen" ? { ...rest, subtypes: [...(rest.subtypes ?? []), ...chosen.types] } : { ...rest, notSubtypes: [...(rest.notSubtypes ?? []), ...chosen.types] };
  if (kind === "cardType" && chosen?.cardType) return { ...rest, types: [...(rest.types ?? []), chosen.cardType] };
  if (kind === "name" && chosen?.name !== undefined) return { ...rest, named: chosen.name };
  if (kind === "number" && chosen?.number !== undefined) return { ...rest, equals: chosen.number };
  if (kind === "parity" && chosen?.parity && rest.parity) return { ...rest, parity: { ...rest.parity, is: chosen.parity } };
  if (kind === "powerAtLeast" && chosen?.number !== undefined) return { ...rest, power: { ...rest.power, min: Math.max(rest.power?.min ?? -Infinity, chosen.number) } };
  if ((kind === "color" || kind === "notColor") && chosen?.color)
    return kind === "color" ? { ...rest, colors: [chosen.color] } : { ...rest, notColors: [...(rest.notColors ?? []), chosen.color] };
  return kind === "notType" || kind === "notColor" || kind === "notTypesChosen" ? rest : spec;
}

/** The names a player can choose from: every creature type (CR 205.3m) or color, but `except`. */
/** Riot's and unleash's choice (see choiceOptions). */
export const ENTERS_COUNTER = "+1/+1 counter";

/** Is `n` odd (or even)? Zero is even; with no number (a noncreature's power), neither (CR 208.3). */
function isParity(n: number | undefined, p: { is?: "odd" | "even"; not?: true }): boolean {
  return n !== undefined && ((Math.abs(n) % 2 === 1) === (p.is === "odd")) !== !!p.not;
}

export function choiceOptions(what: ChoiceKind | EntersOption, except?: string): string[] {
  if (what === "parity") return ["odd", "even"];
  if (what === "riot") return [ENTERS_COUNTER, "Haste"];
  if (what === "unleash") return [ENTERS_COUNTER, "No counter"];
  const all = what === "color" || what === "colors" ? Object.values(COLOR_NAMES) : what === "basicLandType" ? ["Plains", "Island", "Swamp", "Mountain", "Forest"] : [...CREATURE_TYPES].sort();
  return all.filter((x) => x.toLowerCase() !== except?.toLowerCase());
}

/** Record a choice by name: a creature type, or a color ("Blue" is U). */
export function withChoice(chosen: Chosen | undefined, what: ChoiceKind, choice: string): Chosen {
  if (what === "creatureType") return { ...chosen, type: choice };
  if (what === "basicLandType") return { ...chosen, landType: choice };
  if (what === "keyword") return { ...chosen, keyword: choice };
  if (what === "cardType") return { ...chosen, cardType: choice };
  if (what === "cardName") return { ...chosen, name: choice };
  if (what === "number") return { ...chosen, number: Number(choice) };
  if (what === "parity") return { ...chosen, parity: choice === "odd" ? "odd" : "even" };
  if (what === "opponent") return { ...chosen, player: Number(choice) };
  // "The color or colors of your choice": the colors named, "White,Blue", in WUBRG order.
  if (what === "colors") return { ...chosen, colors: (Object.keys(COLOR_NAMES) as Color[]).filter((c) => choice.split(",").includes(COLOR_NAMES[c])) };
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
  if (o) {
    // A spell's mana value counts its X (CR 202.3e).
    const item = o.zone === "stack" ? s.stack.find((x) => x.kind === "spell" && x.objectId === o.id) : undefined;
    const c = characteristics(s, o);
    return withCastThisTurn(s, o, item ? { ...c, manaValue: spellManaValue(s, item) } : c);
  }
  const d = cardId ? s.cards[cardId] : undefined;
  return d ? { colors: d.colors, types: d.types, subtypes: d.subtypes, supertypes: d.supertypes, name: d.name, manaValue: defMv(d) } : { colors: [] };
}

/**
 * A spell's own characteristics (its card's) as a source of targeting: a spell (CR 113.7a doesn't apply to it). `item`:
 * the spell on the stack, for its mana value with its X (CR 202.3e).
 */
export const spellQuality = (s: GameState, cardId?: string, item?: StackItem): SourceQuality => ({ ...sourceQuality(s, undefined, cardId), spell: true, ...(item ? { manaValue: spellManaValue(s, item) } : {}) });

/**
 * "An ability ... from an enchantment source": the source as it is now if it's still the same object, on the battlefield
 * (its characteristics, CR 613) or in another zone (a channel ability: its card's); if it has left the battlefield, as it
 * last existed there (CR 113.7a, 608.2h). An ability without a source (the monarch's) has none to match.
 */
function abilitySourceIs(s: GameState, item: StackItem, from: NonNullable<TargetSpec["abilityFrom"]>): boolean {
  if (!item.sourceId) return false;
  const o = s.objects[item.sourceId];
  const same = o && (item.sourceZc === undefined || (o.zoneChanges ?? 0) === item.sourceZc);
  const lk = !same ? s.lastKnown?.[item.sourceId] : undefined;
  const d = item.sourceCardId ? s.cards[item.sourceCardId] : undefined;
  const q = same ? (o.zone === "battlefield" ? characteristics(s, o) : defOf(s, o)) : lk && lk.zc === item.sourceZc && lk.source ? lk.source : d;
  if (!q) return false;
  if (from.colorless && q.colors.length) return false;
  return !from.types?.length || from.types.some((t) => q.types.includes(t));
}

/** Filters checked against a card's printed characteristics, for spells and cards in graveyards. */
export function printedMatches(spec: TargetSpec, d: CardDef): boolean {
  // Changeling gives every creature type wherever the card is (CR 702.73a).
  const hasSubtype = (st: string) => d.subtypes.includes(st) || (everyCreatureType(d) && CREATURE_TYPES.has(st));
  if (spec.bound || spec.drafted || spec.mostCommonColor !== undefined) return false; // not worked out yet (see objectMatches); nothing noted in a draft; permanents only
  if (spec.types?.length && !spec.types.some((ty) => d.types.includes(ty)) && !spec.orSubtypes?.some(hasSubtype) && !(spec.orAdventure && d.layout === "adventure")) return false;
  if (spec.hasAdventure && d.layout !== "adventure") return false;
  if (spec.allTypes?.some((ty) => !d.types.includes(ty))) return false;
  if (spec.notTypes?.some((ty) => d.types.includes(ty))) return false;
  if (spec.colors?.length && !spec.colors.some((col) => d.colors.includes(col))) return false;
  if (spec.bothColors?.some((col) => !d.colors.includes(col))) return false;
  if (spec.notColors?.some((col) => d.colors.includes(col))) return false;
  if (spec.colorCount && !colorCountIs(spec.colorCount, d.colors.length)) return false;
  if (spec.supertypes?.some((x) => !d.supertypes.includes(x))) return false;
  if (spec.notSupertypes?.some((x) => d.supertypes.includes(x))) return false;
  if (spec.anyOf && !spec.anyOf.some((a) => printedMatches(a, d))) return false;
  if (spec.subtypes?.length && !spec.subtypes.some(hasSubtype)) return false;
  if (spec.notSubtypes?.some(hasSubtype)) return false;
  if (spec.chosen === "type" || spec.chosen === "color" || spec.chosen === "name" || spec.chosen === "typesChosen" || spec.chosen === "parity" || spec.counter) return false;
  if (spec.parity?.is && !isParity(spec.parity.of === "power" ? (d.types.includes("Creature") && /^-?\d+$/.test(d.power ?? "") ? Number(d.power) : undefined) : defMv(d), spec.parity)) return false;
  const hasKw = (k: string) => d.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.keywords?.some((k) => !hasKw(k))) return false;
  if (spec.toxic && !d.keywords.some((x) => /^toxic\b/i.test(x))) return false;
  if (spec.notKeywords?.some(hasKw)) return false;
  // Only creature cards have power and toughness (CR 208.3).
  const creature = d.types.includes("Creature");
  if (spec.power && (!creature || !inRange(Number.parseInt(d.power ?? "0", 10) || 0, spec.power))) return false;
  if (spec.toughness && (!creature || !inRange(Number.parseInt(d.toughness ?? "0", 10) || 0, spec.toughness))) return false;
  if (spec.totalPT && (!creature || !inRange((Number.parseInt(d.power ?? "0", 10) || 0) + (Number.parseInt(d.toughness ?? "0", 10) || 0), spec.totalPT))) return false;
  if (spec.manaValue && !inRange(defMv(d), spec.manaValue)) return false;
  if (spec.equalsChosen && (spec.equals === undefined || !spec.equalsChosen.some((k) => (k === "manaValue" ? defMv(d) : creature && /^\d+$/.test(d[k] ?? "") ? Number(d[k]) : undefined) === spec.equals))) return false;
  if (spec.manaCostIn && !spec.manaCostIn.includes(d.manaCost)) return false;
  if (spec.xInCost && !parseManaCost(d.manaCost).hasX) return false;
  if (spec.named !== undefined && !hasName(d.name, spec.named)) return false;
  if (spec.notNamed !== undefined && hasName(d.name, spec.notNamed)) return false;
  if (spec.notNamedAny?.some((n) => sameName(d.name, n))) return false;
  if (spec.namedAny && !spec.namedAny.some((n) => sameName(d.name, n))) return false;
  if (spec.notNamedAsYours) return false; // not worked out yet
  if (spec.doubleFaced && !isDoubleFacedDef(d)) return false;
  if (spec.manaAbility && !(compileCard(d).mana.length || compileCard(d).manaTriggers?.length)) return false;
  if (spec.transformed || spec.faceDown || spec.powerAboveBase || spec.basePtEither !== undefined || spec.basePT || spec.basePower !== undefined || spec.toughnessAbovePower || spec.ptUnequal || spec.colorOfYourLegend) return false;
  return true;
}

/**
 * A spell's mana value on the stack: its mana cost's, with X as chosen for it (CR 202.3e), or 0 face down (CR 708.2).
 * Gone from the stack (countered): as it last existed there (CR 113.7a), from its `castItems` snapshot.
 */
export function spellManaValue(s: GameState, item: StackItem): number {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (item.castMv !== undefined && o?.zone !== "stack") return item.castMv;
  if (!o || o.faceDown) return 0;
  const d = defOf(s, o);
  const cost = parseManaCost(d.manaCost);
  return defMv(d) + (cost.hasX ? (item.x ?? 0) * xCount(cost) : 0);
}

/**
 * A creature spell's power or toughness on the stack: its printed one, or from its characteristic-defining ability, which
 * works on the stack too (CR 604.3); nothing else changes a spell's power. Undefined for a noncreature spell (CR 208.3). A
 * face-down spell is a 2/2 creature (CR 708.2a).
 */
export function spellPT(s: GameState, item: StackItem, key: "power" | "toughness"): number | undefined {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return undefined;
  if (o.faceDown) return 2;
  const d = defOf(s, o);
  if (!d.types.includes("Creature")) return undefined;
  const printed = d[key] ?? "0";
  if (/^\d+$/.test(printed)) return Number.parseInt(printed, 10);
  const cda = compileCard(d).statics.find((st) => st.affects.kind === "self" && !st.condition && st.mods.some((m) => m.kind === "definePT"));
  const def = cda?.mods.find((m) => m.kind === "definePT") as Extract<Modification, { kind: "definePT" }> | undefined;
  const amount = def?.[key];
  return amount === undefined ? undefined : evalAmount(s, amount, { controller: item.controller, sourceId: o.id });
}

/**
 * A creature card's power or toughness in a graveyard, hand, library or exile: its printed one, or from its
 * characteristic-defining ability, which works in every zone (CR 604.3); Corpse Lunge's "the exiled card's power".
 */
export function cardPT(s: GameState, o: GameObject, key: "power" | "toughness"): number {
  const d = defOf(s, o);
  const printed = d[key] ?? "0";
  if (/^-?\d+$/.test(printed)) return Number.parseInt(printed, 10);
  const cda = compileCard(d).statics.find((st) => st.affects.kind === "self" && !st.condition && st.mods.some((m) => m.kind === "definePT"));
  const def = cda?.mods.find((m) => m.kind === "definePT") as Extract<Modification, { kind: "definePT" }> | undefined;
  const amount = def?.[key];
  const now = characteristics(s, o)[key]; // with the counters on it (CR 122.1a)
  if (amount === undefined) return now;
  return evalAmount(s, amount, { controller: o.owner, sourceId: o.id }) + now - (key === "power" ? basePower(d) : baseToughness(d));
}

/**
 * Does a spell on the stack match `spec` (cast triggers: "a creature spell with power 5 or greater", "a spell with mana
 * value 4 or greater")? Its mana value counts the X chosen for it (CR 202.3e). A power or toughness of "*" comes from
 * its characteristic-defining ability, which works on the stack too (CR 604.3); nothing else changes a spell's power.
 */
export function spellMatches(s: GameState, spec: TargetSpec, item: StackItem): boolean {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return false;
  const d = defOf(s, o);
  // "With power or toughness 2 or less" (Stern Scolding): either one, as it is on the stack (below).
  const ptEither = isPtAnyOf(spec.anyOf) ? spec.anyOf : undefined;
  const { manaValue: mv, power: pw, toughness: tg, equalsChosen, equals, notCastFromHand, castFromGraveyard, parity, ...rest0 } = spec;
  const { anyOf: _anyOf, ...rest1 } = rest0;
  const rest = ptEither ? rest1 : rest0;
  if (!printedMatches(rest, d)) return false;
  if (notCastFromHand && o.castFrom === "hand" && !o.spellCopy) return false;
  if (castFromGraveyard && (o.castFrom !== "graveyard" || o.spellCopy)) return false;
  if (mv && !inRange(spellManaValue(s, item), mv)) return false;
  const pt = (key: "power" | "toughness") => spellPT(s, item, key);
  for (const [key, range] of [["power", pw], ["toughness", tg]] as const) {
    if (!range) continue;
    const n = pt(key);
    if (n === undefined || !inRange(n, range)) return false;
  }
  if (ptEither && !ptEither.some((a) => (["power", "toughness"] as const).some((key) => { const n = a[key] && pt(key); return n !== undefined && !!a[key] && inRange(n, a[key]!); }))) return false;
  // Talion: one of them equal to the chosen number; nothing chosen, nothing matches. An X spell's mana value counts its X (CR 202.3e).
  if (equalsChosen && (equals === undefined || !equalsChosen.some((k) => (k === "manaValue" ? spellManaValue(s, item) : pt(k)) === equals))) return false;
  // Gollum, Riddle Master: "a spell with mana value of the chosen quality", its X counted (CR 202.3e).
  if (parity && (!parity.is || !isParity(parity.of === "power" ? pt("power") : spellManaValue(s, item), parity))) return false;
  return true;
}

/** An anyOf that's only "power N or less" / "toughness N or less" (Stern Scolding's "power or toughness 2 or less"). */
const isPtAnyOf = (anyOf: TargetSpec[] | undefined): anyOf is TargetSpec[] => !!anyOf?.length && anyOf.every((a) => Object.keys(a).every((k) => ["kind", "types", "notTypes", "notColors", "power", "toughness", "text"].includes(k)) && !a.types?.length && !!(a.power || a.toughness));
const inRange = (n: number, r: Range) => (r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max) && (r.parity === undefined || (n % 2 === 0) === (r.parity === "even"));

/** What a player gained until end of turn or until their next turn. */
const gainedBy = (s: GameState, pid: PlayerId): string[] => [...(s.players[pid]?.gained ?? []), ...(s.players[pid]?.gainedUntilNextTurn ?? [])];

/** Hexproof or shroud a player has from a permanent they control ("You have hexproof"), or until end of turn ("You gain shroud"). */
export function playerProtection(s: GameState, pid: PlayerId): "hexproof" | "shroud" | undefined {
  const gained = gainedBy(s, pid);
  if (gained.includes("Shroud")) return "shroud";
  let out: "hexproof" | undefined = gained.includes("Hexproof") ? "hexproof" : undefined;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (controllerOf(s, o) !== pid) continue;
    const ab = abilitiesOf(s, o);
    if (ab.youHaveDuringYourTurn && s.activePlayer !== pid) continue;
    if (ab.youHaveIf && !staticConditionNow(s, ab.youHaveIf, id, pid)) continue;
    const has = ab.youHave;
    if (has === "shroud") return "shroud";
    if (has === "hexproof") out = has;
  }
  return out;
}

/**
 * Does `pid` have protection from player `from` ("You have protection from each of your opponents", CR 702.16k), or from
 * a source that player controls (`src`: "you gain protection from the color of your choice until end of turn", 702.16b-e)?
 */
export function playerProtectedFrom(s: GameState, pid: PlayerId, from: PlayerId | undefined, src?: SourceQuality): boolean {
  const gained = gainedBy(s, pid);
  // "Protection from everything" (CR 702.16j): from each object, its own controller's too.
  if (gained.some((k) => /^protection from everything$/i.test(k))) return true;
  const holder = { controller: pid };
  if (src && protectedFrom(gained, src.controller === undefined && from !== undefined ? { ...src, controller: from } : src, holder)) return true;
  // "You have protection from the chosen card name" (Runed Halo): anything with that name, its own sources too.
  if (src?.name !== undefined && s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && hasName(src.name, s.objects[id]!.chosen?.name ?? "\u0000") && !!abilitiesOf(s, s.objects[id]!).protectionFromChosenName)) return true;
  // Serra's Emissary: from sources of the chosen card type, its controller's own too.
  if (src?.types && s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && abilitiesOf(s, s.objects[id]!).youProtectedFromChosenType && src.types!.includes(s.objects[id]!.chosen?.cardType ?? "\u0000"))) return true;
  if (from === undefined || from === pid) return false;
  if (protectedFromPlayer(gained, from, holder)) return true;
  return s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && abilitiesOf(s, s.objects[id]!).youHave === "protection");
}

export function isLegalTarget(s: GameState, spec: TargetSpec, t: TargetChoice, controller: PlayerId, src?: SourceQuality): boolean {
  if (t.kind === "none") return false;
  if (spec.notId !== undefined && t.kind === "object" && t.id === spec.notId) return false;
  if (t.kind === "player") {
    const p = s.players[t.id];
    if (!p || p.lost) return false;
    // "You have hexproof": not by opponents' spells and abilities (CR 702.11d); "you have shroud": by none (CR 702.18d).
    const prot = playerProtection(s, t.id);
    // Detection Tower: its controller's opponents can be targeted as though they didn't have hexproof (CR 702.11e).
    const sees = (s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === controller && r.rule === "seeHexproof");
    if (prot === "shroud" || (prot === "hexproof" && t.id !== controller && !sees)) return false;
    if (playerProtectedFrom(s, t.id, controller, src)) return false; // CR 702.16b, 702.16k
    // "You gain hexproof from blue and from black until end of turn" (Veil of Summer): as for a permanent (CR 702.11d).
    if (src && t.id !== controller && !sees && hexproofFrom(gainedBy(s, t.id), src)) return false;
    // Needle Drop: "any target that was dealt damage this turn", a player too.
    if (spec.kind === "any") return (!spec.opponent || t.id !== controller) && (!spec.dealtDamageThisTurn || !!s.damagedThisTurn?.includes(t.id));
    if (spec.kind !== "player") return false;
    if (spec.notEventPlayer || t.id === spec.notPlayer) return false;
    return !spec.opponent || t.id !== controller;
  }
  if (t.kind === "stack") {
    // "That targets ~" not bound to its source yet (bindBound): nothing is known to fit it.
    if (spec.kind !== "spell" || spec.targetsSource) return false;
    // A resolving spell is still on the stack until it finishes (CR 608.2n): "change the target" can pick it.
    const item = s.stack.find((x) => x.id === t.id) ?? (s.resolving?.item.id === t.id ? s.resolving.item : undefined);
    if (!item) return false;
    if (spec.singleTarget && (item.targets ?? []).filter((x) => x.kind !== "none").length !== 1) return false;
    if (spec.castNth !== undefined && item.castNth !== spec.castNth) return false; // A copy that wasn't cast has no castNth (CR 707.10).
    if (spec.hasTargets && !(item.targets ?? []).some((x) => x.kind !== "none")) return false;
    // "Target triggered ability you control" (Strionic Resonator).
    const aims = !spec.targetsWhat || targetsMatch(s, item.targets ?? [], spec.targetsWhat, controller) || (!!spec.targetsYouToo && targetsMatch(s, item.targets ?? [], "you", controller));
    if (item.kind === "ability") return aims && !!spec.stackAbilities && (!spec.loyaltyOnly || !!item.loyalty) && (spec.stackAbilities === "both" || (spec.stackAbilities === "triggered") === !!item.triggered) && (spec.controller !== "you" || item.controller === controller) && (spec.controller !== "opponent" || item.controller !== controller) && (!spec.abilityFrom || abilitySourceIs(s, item, spec.abilityFrom));
    if (spec.noSpells || !item.objectId) return false;
    // "Target spell you control", "... you don't control" / "... an opponent controls" (no teammates here).
    if ((spec.controller === "you" && item.controller !== controller) || (spec.controller === "opponent" && item.controller === controller)) return false;
    if (!aims) return false;
    // Nothing in the engine changes a spell's characteristics on the stack yet, so the card's are used. Its mana value
    // counts the X chosen for it (CR 202.3e); a face-down spell's is 0 (CR 708.2).
    if (spec.manaValue && !inRange(spellManaValue(s, item), spec.manaValue)) return false;
    if (spec.mvAtMostControllersGraveyard && spellManaValue(s, item) > (s.players[item.controller]?.graveyard.length ?? 0)) return false;
    // Power and toughness as the spell has them on the stack (a characteristic-defining ability works there, CR 604.3).
    if (spec.power || spec.toughness || isPtAnyOf(spec.anyOf)) return spellMatches(s, spec, item);
    const { manaValue: _mv, ...rest } = spec;
    return printedMatches(rest, defOf(s, obj(s, item.objectId)));
  }
  const o = s.objects[t.id];
  if (!o) return false;
  if (t.zc !== undefined && (o.zoneChanges ?? 0) !== t.zc) return false; // it's a new object now (CR 400.7)
  // "Creatures from the battlefield and/or creature cards from graveyards": a card in a graveyard fits the card half.
  if (spec.kind === "object" && spec.orCard && o.zone === "graveyard") return isLegalTarget(s, spec.orCard, t, controller, src);
  if (spec.kind === "card") {
    // A card in a graveyard (CR 109.2a). Nothing in the engine changes characteristics in a
    // graveyard, so the printed card is what's checked; hexproof only works on the battlefield.
    if (o.zone !== (spec.linkedExile ? "exile" : "graveyard") || s.players[o.owner]?.lost) return false;
    // Ground Seal: "Cards in graveyards can't be the targets of spells or abilities."
    if (o.zone === "graveyard" && s.battlefield.some((b) => abilitiesOf(s, obj(s, b)).graveyardUntargetable)) return false;
    if (spec.owner === "you" && o.owner !== controller) return false;
    if (spec.owner === "opponent" && o.owner === controller) return false;
    // One opponent's slot of "for each opponent, ... from that player's graveyard" (TargetSpec.perOpponent): their card.
    if (spec.controlledBy !== undefined && o.owner !== spec.controlledBy) return false;
    if (spec.putThereThisTurn && o.toGraveyardTurn !== s.turn) return false;
    if (spec.fromLibraryThisTurn && o.fromLibraryTurn !== s.turn) return false;
    if (spec.milledThisTurn && o.milledTurn !== s.turn) return false;
    if (spec.fromBattlefieldThisTurn && o.fromBattlefieldTurn !== s.turn) return false;
    return printedMatches(spec, defOf(s, o));
  }
  if (spec.kind === "any") {
    // Any target is a creature, planeswalker, battle or player (CR 115.4); "player or planeswalker" narrows the objects.
    const kinds = spec.types?.length ? spec.types : ["Creature", "Planeswalker", "Battle"];
    // Coalborn Entity: a creature only if it's a token (TargetSpec.creatureTokens).
    if (spec.creatureTokens && !o.isToken && !objIsType(s, o, "Planeswalker")) return false;
    return o.zone === "battlefield" && kinds.some((k) => objIsType(s, o, k)) && objectMatches(s, { ...spec, types: [] }, o, controller, true, src);
  }
  // "Target spell or nonland permanent": a permanent fits the permanent half.
  if (spec.kind === "spell" && spec.orPermanent) return o.zone === "battlefield" && isLegalTarget(s, spec.orPermanent, t, controller, src);
  // A mutating creature spell's target has the same owner as the spell (CR 702.140a).
  if (spec.ownerIs !== undefined && o.owner !== spec.ownerIs) return false;
  // "That saddled it this turn" needs the source: checked with it (lesserPowerOk).
  const { saddledSource: _, ...rest } = spec;
  return spec.kind === "object" && objectMatches(s, rest, o, controller, true, src);
}

/**
 * The one permanent all of a spell's chosen targets name, if they name only one (rulings on Ink-Treader Nephilim: several
 * targets all naming it count): with `only` "self", `o`; else a permanent matching it for `you`.
 */
export function targetsOnlyOne(s: GameState, targets: TargetChoice[], only: "self" | TargetSpec, o: GameObject | undefined, you: PlayerId): ObjectId | undefined {
  const chosen = targets.filter((t) => t.kind !== "none");
  const first = chosen[0];
  if (first?.kind !== "object" || chosen.some((t) => t.kind !== "object" || t.id !== first.id)) return undefined;
  const it = s.objects[first.id];
  if (!it || it.zone !== "battlefield") return undefined;
  return (only === "self" ? it.id === o?.id : objectMatches(s, only, it, you, false)) ? it.id : undefined;
}

/**
 * "A spell that targets a permanent you control": one of its targets is still that object on the battlefield and matches
 * (it needn't still be a legal target for that spell), or "you" (rulings on Rebuff the Wicked).
 */
export function targetsMatch(s: GameState, targets: TargetChoice[], what: TargetSpec | "you", controller: PlayerId): boolean {
  return targets.some((t) => {
    if (what === "you") return t.kind === "player" && t.id === controller;
    // "A spell that targets an opponent" (Danitha), "... a player".
    if (what.kind === "player") return t.kind === "player" && (!what.opponent || t.id !== controller);
    if (t.kind !== "object") return false;
    const o = s.objects[t.id];
    return !!o && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc) && objectMatches(s, what, o, controller, false);
  });
}

/**
 * The filter with its amount bound (TargetSpec.bound) worked out now, as a range of its key; without one, as is. A negative
 * amount counts as 0 (CR 107.1b).
 */
export function bindBound(s: GameState, spec0: TargetSpec, ctx: AmountCtx): TargetSpec {
  // Mistfolk: "target spell that targets ~": the source, as it is now (TargetSpec.targetsSource).
  const spec1: TargetSpec = spec0.targetsSource ? (({ targetsSource: _, ...r }) => ({ ...r, targetsWhat: { kind: "object", objectId: ctx.sourceId ?? "", text: "~" } }))(spec0) : spec0;
  // Nissa, Steward of Elements: "a land card or a creature card with mana value less than or equal to ...": one of them.
  const spec2: TargetSpec = spec1.anyOf?.some((x) => x.bound) ? { ...spec1, anyOf: spec1.anyOf.map((x) => bindBound(s, x, ctx)) } : spec1;
  // Crown of Doom: "target player other than ~'s owner" (owners never change, CR 108.3).
  const owner = spec2.notSourceOwner && ctx.sourceId ? s.objects[ctx.sourceId]?.owner : undefined;
  const spec: TargetSpec = owner !== undefined ? { ...spec2, notPlayer: owner } : spec2;
  if (!spec.bound) return spec;
  const { bound, ...rest } = spec;
  // Power and toughness may be below 0 (CR 107.1b): "power greater than target creature's power" with that at -2 takes a 0.
  const n0 = evalAmount(s, bound.amount, ctx);
  // "Less than ~'s power" (Sisay) is one less, signed: below 0 it matches nothing.
  const n = bound.key === "manaValue" && !bound.amount.signed ? Math.max(0, n0) : n0;
  const old = rest[bound.key];
  const range: Range = bound.at === "exact" ? { min: Math.max(old?.min ?? n, n), max: Math.min(old?.max ?? n, n) } : bound.at === "most" ? { ...old, max: old?.max === undefined ? n : Math.min(old.max, n) } : { ...old, min: old?.min === undefined ? n : Math.max(old.min, n) };
  return { ...rest, [bound.key]: range };
}

/**
 * Text saying a "with mana value less than or equal to ..." bound as the number it is now (Light-Paws: "with mana value 2
 * or less", not "... less than or equal to that Aura"), for prompts.
 */
export function sayBound(s: GameState, text: string, spec: TargetSpec | undefined, ctx: AmountCtx): string {
  if (spec?.bound?.key !== "manaValue" || spec.bound.at !== "most") return text;
  const most = bindBound(s, spec, ctx).manaValue?.max;
  return most === undefined || most < 0 ? text : text.replace(/ with mana value less than (?:or equal to )?(?:that|its|the|this|~'s) [^,]+?(?= and |,|$)/, ` with mana value ${most} or less`);
}

/**
 * What an amount bound of a target is worked out with as the target is chosen: who controls the spell or ability and its
 * source, or the source as it last existed on the battlefield if it has left (CR 608.2h; rulings on Fiendish Panda).
 */
export function targetingCtx(s: GameState, controller: PlayerId, sourceId?: ObjectId): AmountCtx {
  const o = sourceId ? s.objects[sourceId] : undefined;
  const lki = o && o.zone !== "battlefield" ? s.lastKnown?.[o.id] : undefined;
  return { controller, ...(sourceId ? { sourceId } : {}), ...(lki ? { lki } : {}) };
}

export function legalTargets(s: GameState, spec0: TargetSpec, controller: PlayerId, excludeStackId?: string, src?: SourceQuality, sourceId?: ObjectId): ChosenTarget[] {
  const spec = bindBound(s, spec0, targetingCtx(s, controller, sourceId));
  const out: ChosenTarget[] = [];
  if (spec.kind === "player" || spec.kind === "any")
    for (const pid of livingPlayers(s)) out.push({ kind: "player", id: pid });
  if (spec.kind === "object" || spec.kind === "any" || spec.orPermanent) for (const id of s.battlefield) out.push({ kind: "object", id });
  if (spec.kind === "spell") for (const item of s.stack) if (item.id !== excludeStackId) out.push({ kind: "stack", id: item.id });
  if (spec.kind === "card" && spec.linkedExile) for (const l of linkedCards(s, sourceId)) out.push({ kind: "object", id: l.id, zc: l.zc });
  else if (spec.kind === "card" || spec.orCard) for (const pid of livingPlayers(s)) for (const id of player(s, pid).graveyard) out.push({ kind: "object", id });
  return out.filter((t) => isLegalTarget(s, spec, t, controller, src) && lesserPowerOk(s, spec, t, sourceId));
}

/**
 * The body to choose targets for (CR 601.2c): "any number of target creatures" offered as one "up to" target for each
 * creature that could be chosen, "up to X target ..." no more than X; `fitMany` then keeps the ones chosen. Else as is.
 */
export function offerMany(s: GameState, body0: AbilityBody, controller: PlayerId, x = 0, src?: SourceQuality, sourceId?: ObjectId): AbilityBody {
  const body = settleDivided(s, body0, { controller, ...(sourceId ? { sourceId } : {}), x });
  const i = manySlot(body.targets);
  if (i < 0) return body;
  const spec = body.targets[i]!;
  const room = spec.skip ? 0 : legalTargets(s, spec, controller, undefined, src, sourceId).filter((t) => !(spec.notSource && t.kind === "object" && t.id === sourceId)).length;
  // Divided as you choose: no more targets than there is to divide (at least 1 each, CR 601.2d).
  const most0 = spec.divided?.amount || (spec.divided && spec.many === "exactX") ? Math.min(room, spec.divided.total) : room;
  const most = spec.manyMax !== undefined ? Math.min(most0, spec.manyMax) : most0;
  // "X target creatures": exactly X, each one required (as many as there are, if fewer: it can't be cast so).
  if (spec.many === "exactX") return expandMany(body, Math.min(x, most));
  return expandMany(body, spec.many === "x" ? Math.min(manyX(s, body.targets, controller, sourceId, x), most) : most, true);
}

/**
 * The most targets "up to X target ..." can have: the X announced, or with "where X is ..." (TargetSpec.manyCount) that
 * number as the targets are chosen (CR 601.2c), before any cost is paid (601.2h): Recantation's verse counters are
 * counted while it's still on the battlefield.
 */
export function manyX(s: GameState, targets: TargetSpec[], controller: PlayerId, sourceId: ObjectId | undefined, x = 0): number {
  const spec = targets[manySlot(targets)];
  return spec?.manyCount ? Math.max(0, evalAmount(s, spec.manyCount, targetingCtx(s, controller, sourceId))) : x * (spec?.manyTimes ?? 1);
}

/**
 * The body with each amount to be "divided as you choose" worked out (TargetSpec.divided.amount), as its targets are
 * chosen (CR 601.2d): the spell's X as it's cast, a trigger's as it's put on the stack. Already worked out, as is.
 * A "for each opponent" target is made into one for each opponent then too (expandPerOpponent). `anyX`: X isn't
 * announced yet, so "with mana value X" asks nothing of the target (could it be cast with some X?).
 */
export function settleDivided(s: GameState, body0: AbilityBody, ctx: AmountCtx, anyX = false): AbilityBody {
  // "For each opponent, ... up to one target ... that player controls": one target for each opponent it has as its
  // targets are chosen, in turn order from its controller (CR 601.2c, 102.2; players who left aren't, 800.4a).
  const i = s.turnOrder.indexOf(ctx.controller);
  // "For each player": its controller too, first (TargetSpec.perPlayer).
  const every = body0.targets.some((t) => t.perPlayer);
  // Not "up to one": each opponent's target only if they have one to target (rulings on Sylvan Primordial).
  const able = (spec: TargetSpec) => legalTargets(s, spec, ctx.controller, undefined, undefined, ctx.sourceId).length > 0;
  const body = body0.targets.some((t) => t.perOpponent) ? expandPerOpponent(body0, [...(every ? [ctx.controller] : []), ...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)].filter((pid) => !player(s, pid).lost), able) : body0;
  const castBound = (t: TargetSpec) => t.bound?.amount.count.kind === "manaValue" && t.bound.amount.count.of.ref === "castSpell";
  // "When you do, shuffle target nonland permanent ... with mana value X or less, where X is the number of creatures
  // tapped this way" (Teferi Akosa of Zhalfir): the number tapped, fixed before the reflexive trigger's targets are chosen.
  const tappedBound = (t: TargetSpec) => t.bound?.amount.count.kind === "tappedThisWay";
  // "With lesser mana value" in a dies trigger (Scrap Trawler): the one that died, as it last existed (ctx.lki).
  const subjectBound = (t: TargetSpec) => (t.bound?.amount.count.kind === "manaValue" || t.bound?.amount.count.kind === "toughness") && t.bound.amount.count.of.ref === "subject";
  // Grishnákh, Brash Instigator: "with power less than or equal to the amassed Army's power", as the target is chosen.
  const amassedBound = (t: TargetSpec) => t.bound?.amount.count.kind === "power" && t.bound.amount.count.of.ref === "amassed";
  const unsettled = (t: TargetSpec) => (t.divided?.amount && !t.divided.settled) || t.xRange || t.total?.x || t.total?.rolled || castBound(t) || tappedBound(t) || subjectBound(t) || amassedBound(t);
  if (!body.targets.some(unsettled) && !body.modal?.modes.some((m) => m.targets?.some(unsettled))) return body;
  const settle = (t: TargetSpec): TargetSpec => {
    if (t.divided?.amount && !t.divided.settled) t = { ...t, divided: { ...t.divided, total: evalAmount(s, t.divided.amount, ctx), settled: true as const } };
    if (t.xRange && anyX) {
      const { xRange: _, ...rest } = t;
      t = rest;
    } else if (t.xRange) {
      // "With mana value X" (Spell Blast): the X announced (CR 107.3a).
      const { xRange, ...rest } = t;
      const x = ctx.x ?? 0;
      t = { ...rest, [xRange.key]: xRange.at === "exact" ? { min: x, max: x } : xRange.at === "most" ? { max: x } : { min: x }, text: rest.text.replace(/ x( or (?:less|greater))?$/, ` ${x}$1`) };
    }
    // "With mana value less than or equal to that spell's mana value" (Hammerhead Tyrant): the spell that triggered it, as
    // it was cast (rulings), which can't change.
    if (castBound(t) && ctx.cause !== undefined) t = bindBound(s, t, ctx);
    if (subjectBound(t)) {
      // Lesser than 0 is nothing (rulings: a mana value can't be less than 0).
      const { bound, ...rest } = t;
      const key = bound!.key === "toughness" ? "toughness" : "manaValue";
      const n = (ctx.lki?.[key] ?? 0) + (bound!.amount.plus ?? 0);
      const word = key === "toughness" ? "toughness" : "mana value";
      t = { ...rest, [key]: { ...rest[key], max: rest[key]?.max === undefined ? n : Math.min(rest[key]!.max!, n) }, text: rest.text.replace(/ with lesser (?:mana value|toughness)$/, ` with ${word} ${n < 0 && key === "manaValue" ? "less than 0" : `${n} or less`}`) };
    }
    if (tappedBound(t) && ctx.tapped !== undefined) {
      const { bound, ...rest } = t;
      const n = Math.max(0, ctx.tapped * (bound!.amount.times ?? 1) + (bound!.amount.plus ?? 0));
      const old = rest[bound!.key];
      t = { ...rest, [bound!.key]: bound!.at === "exact" ? { min: n, max: n } : bound!.at === "most" ? { ...old, max: old?.max === undefined ? n : Math.min(old.max, n) } : { ...old, min: old?.min === undefined ? n : Math.max(old.min, n) }, text: rest.text.replace(/ X or (less|greater)$/, ` ${n} or $1`) };
    }
    if (amassedBound(t) && ctx.amassedPower !== undefined) {
      const { bound, ...rest } = t;
      const n = ctx.amassedPower + (bound!.amount.plus ?? 0);
      const old = rest.power;
      t = { ...rest, power: bound!.at === "most" ? { ...old, max: old?.max === undefined ? n : Math.min(old.max, n) } : bound!.at === "exact" ? { min: n, max: n } : { ...old, min: old?.min === undefined ? n : Math.max(old.min, n) }, text: rest.text.replace(/ with power less than or equal to the amassed army's power$/i, ` with power ${n} or less`) };
    }
    // "With total mana value X or less": the X announced (CR 107.3a), or before then anything.
    if (t.total?.rolled) t = { ...t, total: { key: t.total.key, max: ctx.rolled ?? 0 }, text: t.text.replace(/ X or less\)$/, ` ${ctx.rolled ?? 0} or less)`) };
    if (t.total?.x) t = anyX ? (({ total: _, ...rest }) => rest)(t) : { ...t, total: { key: t.total.key, max: ctx.x ?? 0 }, text: t.text.replace(/ X or less\)$/, ` ${ctx.x ?? 0} or less)`) };
    return t;
  };
  // A modal ability's modes are chosen with its targets (CR 700.2a): theirs too.
  return { ...body, targets: body.targets.map(settle), ...(body.modal ? { modal: { ...body.modal, modes: body.modal.modes.map((m) => (m.targets ? { ...m, targets: m.targets.map(settle) } : m)) } } : {}) };
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
  const spec = bindBound(s, specs[i]!, targetingCtx(s, controller, sourceId));
  // A target the spell is cast as if it didn't have (CR 702.33g): nothing is chosen for it.
  if (spec.skip) return t.kind === "none";
  if (t.kind === "none") return !!spec.optional;
  if (!isLegalTarget(s, spec, t, controller, src)) return false;
  if (spec.notSource && t.kind === "object" && t.id === sourceId && !(spec.notSourceUnlessCreature && s.objects[t.id] && objIsType(s, s.objects[t.id]!, "Creature"))) return false;
  if (spec.combatDamagedBySource && (t.kind !== "player" || !sourceId || !s.objects[sourceId] || !s.turnLog?.combatDamagedBy?.[t.id]?.includes(`${sourceId}@${s.objects[sourceId]!.zoneChanges ?? 0}`))) return false;
  if (spec.damagedBySource && (t.kind !== "player" || !sourceId || !s.objects[sourceId] || !s.turnLog?.damagedBy?.[t.id]?.includes(`${sourceId}@${s.objects[sourceId]!.zoneChanges ?? 0}`))) return false;
  if (spec.attackedThisTurn && (t.kind !== "player" || s.players[t.id]?.attackedTurn !== s.turn)) return false;
  if (spec.lostLifeThisTurn && (t.kind !== "player" || !s.lostLifeThisTurn?.includes(t.id))) return false;
  if (spec.comparedToYou && (t.kind !== "player" || !comparedToYouOk(s, spec.comparedToYou, t.id, controller))) return false;
  if (spec.notSourceHost && t.kind === "object" && sourceId && t.id === s.objects[sourceId]?.attachedTo) return false;
  if (!lesserPowerOk(s, spec, t, sourceId)) return false;
  return !(spec.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t)) && relatedOk(s, spec, chosen, t) && totalOk(s, specs, chosen, i, t);
}

/** "Target opponent who has more life than you do as you activate this ability" (TargetSpec.comparedToYou), as it's chosen. */
function comparedToYouOk(s: GameState, c: NonNullable<TargetSpec["comparedToYou"]>, them: PlayerId, you: PlayerId): boolean {
  const stat = (pid: PlayerId) => {
    const p = s.players[pid]!;
    if (c.stat === "life") return p.life;
    if (c.stat === "hand") return p.hand.length;
    if (c.stat === "creatureCardsInGraveyard") return p.graveyard.filter((id) => isType(defOf(s, obj(s, id)), "Creature")).length;
    return s.battlefield.filter((id) => objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === pid).length;
  };
  return c.fewer ? stat(you) - stat(them) >= c.by : stat(them) - stat(you) >= c.by;
}

/** The mana value or power a "with total ..." target adds (TargetSpec.total): of the card or permanent as it is now. */
const totalPart = (s: GameState, key: "manaValue" | "power", c: TargetChoice | undefined): number => {
  const o = c?.kind === "object" ? s.objects[c.id] : undefined;
  if (!o) return 0;
  return key === "power" ? power(s, o) : defMv(defOf(s, o));
};

/**
 * "With total mana value 6 or less" (TargetSpec.total): `t` for target `i`, with the others of the group already chosen,
 * adds up to no more than the most (CR 601.2c). Before the X it's measured against is announced, anything.
 */
export function totalOk(s: GameState, specs: TargetSpec[], chosen: TargetChoice[], i: number, t: TargetChoice): boolean {
  // "With equal toughness" (V.A.T.S.): the same toughness as each other one of the group chosen.
  if (specs[i]?.equalToughness && t.kind === "object" && s.objects[t.id])
    if (specs.some((x, j) => j !== i && x.equalToughness && !x.skip && chosen[j]?.kind === "object" && s.objects[(chosen[j] as { id: ObjectId }).id] && toughness(s, obj(s, (chosen[j] as { id: ObjectId }).id)) !== toughness(s, obj(s, t.id)))) return false;
  const total = specs[i]?.total;
  if (!total || total.max === undefined || t.kind !== "object") return true;
  let sum = totalPart(s, total.key, t);
  specs.forEach((x, j) => {
    if (j !== i && x.total && !x.skip) sum += totalPart(s, total.key, chosen[j]);
  });
  return sum <= total.max;
}

/**
 * As it resolves, the targets of a "with total ..." group still legal must still add up to no more than the most, or
 * every one of them is illegal (CR 608.2b; rulings on Nethroi, Apex of Death and Reunion of the House). `legal` is changed.
 */
export function checkTotals(s: GameState, specs: TargetSpec[], targets: TargetChoice[], legal: boolean[]) {
  // "With equal toughness" (V.A.T.S.): those still legal no longer all the same, none of them is (rulings).
  const equal = specs.flatMap((x, i) => (x.equalToughness && legal[i] && targets[i]?.kind === "object" ? [i] : []));
  if (new Set(equal.map((i) => toughness(s, obj(s, (targets[i] as { id: ObjectId }).id)))).size > 1) for (const i of equal) legal[i] = false;
  const group = specs.flatMap((x, i) => (x.total && x.total.max !== undefined && legal[i] ? [i] : []));
  if (!group.length) return;
  const { key, max } = specs[group[0]!]!.total!;
  const sum = group.reduce((n, i) => n + totalPart(s, key, targets[i]), 0);
  if (sum > max!) for (const i of group) legal[i] = false;
}

/**
 * Changing target `j` of a spell or ability to `t` (Spellskite): it can't make another of its targets illegal (rulings),
 * so `t` must keep to how target `j` relates to the others ("another target", "with total ...", "from a single
 * graveyard"), and every other target relating to target `j` must still keep to it.
 */
export function swapKeepsOthersLegal(s: GameState, specs: TargetSpec[], targets: TargetChoice[], j: number, t: TargetChoice): boolean {
  const next = targets.map((x, i) => (i === j ? t : x));
  const spec = specs[j];
  if (!spec) return false;
  if ((spec.distinctFrom ?? []).some((k) => sameTarget(next[k], t)) || !relatedOk(s, spec, next, t) || !totalOk(s, specs, next, j, t)) return false;
  return specs.every((x, i) => {
    const c = next[i];
    if (i === j || !c || c.kind === "none") return true;
    if (x.distinctFrom?.includes(j) && sameTarget(c, t)) return false;
    const related = [x.sameGraveyardAs, x.inGraveyardOfControllerOf, x.inGraveyardOfTarget === undefined ? undefined : [x.inGraveyardOfTarget], x.controlledByTarget === undefined ? undefined : [x.controlledByTarget], x.differentControllerFrom, x.differentNameFrom, x.differentManaValueFrom, x.sharesCreatureTypeWith, x.sharesCardTypeWith, x.sharesNoCreatureTypeWith].some((g) => g?.includes(j));
    return !related || relatedOk(s, x, next, c);
  });
}

/** "From a single graveyard", "that share a creature type": how this target relates to the others of its group already chosen. */
export function relatedOk(s: GameState, spec: TargetSpec, chosen: TargetChoice[], t: TargetChoice): boolean {
  if (t.kind !== "object") return true;
  const others = (idx: number[] | undefined) => (idx ?? []).flatMap((j) => { const c = chosen[j]; const o = c?.kind === "object" ? s.objects[c.id] : undefined; return o ? [o] : []; });
  const o = obj(s, t.id);
  if (others(spec.sameGraveyardAs).some((x) => x.owner !== o.owner)) return false;
  if (others(spec.inGraveyardOfControllerOf).some((x) => x.zone !== "battlefield" || controllerOf(s, x) !== o.owner)) return false;
  const ofPlayer = spec.inGraveyardOfTarget === undefined ? undefined : chosen[spec.inGraveyardOfTarget];
  if (ofPlayer?.kind === "player" && ofPlayer.id !== o.owner) return false;
  const byPlayer = spec.controlledByTarget === undefined ? undefined : chosen[spec.controlledByTarget];
  if (byPlayer?.kind === "player" && (o.zone !== "battlefield" || controllerOf(s, o) !== byPlayer.id)) return false;
  // Another target's controller: on the battlefield its controller now, otherwise as it last existed there (rulings on
  // Run Away Together).
  const ctl = (x: GameObject) => (x.zone === "battlefield" ? controllerOf(s, x) : (s.lastKnown?.[x.id]?.controller ?? x.owner));
  if (o.zone === "battlefield" && others(spec.differentControllerFrom).some((x) => ctl(x) === controllerOf(s, o))) return false;
  if (others(spec.differentNameFrom).some((x) => sameName(defOf(s, x).name, defOf(s, o).name))) return false;
  if (others(spec.differentManaValueFrom).some((x) => defMv(defOf(s, x)) === defMv(defOf(s, o)))) return false;
  // Shifting Loyalties: a card type in common, as they are now (CR 205.2a).
  const cardTypes = (x: GameObject) => characteristics(s, x).types.filter((ty) => CARD_TYPES.has(ty));
  if (others(spec.sharesCardTypeWith).some((x) => !cardTypes(x).some((ty) => cardTypes(o).includes(ty)))) return false;
  // Rivals' Duel: no creature type in common, as they are now.
  if (others(spec.sharesNoCreatureTypeWith).some((x) => shareCreatureType(creatureTypesOf(s, x), creatureTypesOf(s, o)))) return false;
  return others(spec.sharesCreatureTypeWith).every((x) => shareCreatureType(creatureTypesOf(s, x), creatureTypesOf(s, o)));
}

/**
 * "Target attacking creature with lesser power" (mentor): less than the source's power, its last known
 * power once it has left the battlefield (CR 702.134a, 608.2h).
 */
/**
 * The cards exiled with this source that are still in exile (CR 607.2a): linked to it as it is now or, as an ability of
 * it resolves after it left the battlefield, as it was (`zc`, CR 400.7).
 */
export function linkedCards(s: GameState, sourceId: ObjectId | undefined, zc?: number): { id: ObjectId; zc: number }[] {
  const me = sourceId ? s.objects[sourceId] : undefined;
  if (!me) return [];
  const key = `${me.id}@${zc ?? me.zoneChanges ?? 0}`;
  return (s.linkedExile?.[key] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
}

/**
 * "A creature that saddled it this turn" (CR 702.171c): tapped for the source's saddle cost this turn, as the object it
 * was then (CR 400.7); "it" the source as it is now or, after it left the battlefield, as it last was.
 */
function saddledSource(s: GameState, id: ObjectId, sourceId: ObjectId | undefined, sourceZc?: number): boolean {
  const src = sourceId ? s.objects[sourceId] : undefined;
  const zc = sourceZc ?? (src?.zone === "battlefield" ? (src.zoneChanges ?? 0) : s.lastKnown?.[sourceId!]?.zc);
  const by = sourceId && zc !== undefined ? (s.turnLog?.saddledBy?.[`${sourceId}@${zc}`] ?? []) : [];
  const o = s.objects[id];
  return !!o && by.includes(`${id}@${o.zoneChanges ?? 0}`);
}

export function lesserPowerOk(s: GameState, spec: TargetSpec, t: TargetChoice, sourceId: ObjectId | undefined, sourceZc?: number): boolean {
  // Giant Beaver: "target creature that saddled it this turn".
  if (spec.saddledSource && t.kind === "object" && !saddledSource(s, t.id, sourceId, sourceZc)) return false;
  // "Target card exiled with ~": one of the cards linked to the source (CR 607.2a).
  if (spec.linkedExile && t.kind === "object" && !linkedCards(s, sourceId, sourceZc).some((l) => l.id === t.id)) return false;
  if (spec.blockedBySource && t.kind === "object") {
    const me = sourceId ? s.objects[sourceId] : undefined;
    if (!me) return false;
    const onField = me.zone === "battlefield" && (sourceZc === undefined || (me.zoneChanges ?? 0) === sourceZc);
    const lk = s.lastKnown?.[me.id];
    const blocking = onField ? me.blocking : lk && (sourceZc === undefined || lk.zc === sourceZc) ? lk.blocking : undefined;
    if (!blocking?.includes(t.id) || s.objects[t.id]?.attacking === undefined) return false;
  }
  if (spec.blockingSource && t.kind === "object") {
    // A creature blocking the source is still blocking it while both are in combat (CR 509.1h, 506.4); one the source
    // blocks is still attacking.
    const me = sourceId ? s.objects[sourceId] : undefined;
    if (!me) return false;
    const onField = me.zone === "battlefield" && (sourceZc === undefined || (me.zoneChanges ?? 0) === sourceZc);
    const lk = s.lastKnown?.[me.id];
    const was = onField ? me : lk && (sourceZc === undefined || lk.zc === sourceZc) ? lk : undefined;
    const o = s.objects[t.id];
    const blocks = !!was?.blockedBy?.includes(t.id) && o?.blocking !== undefined;
    const blocked = spec.blockingSource === "either" && !!was?.blocking?.includes(t.id) && o?.attacking !== undefined;
    if (!blocks && !blocked) return false;
  }
  if ((!spec.lesserPowerThanSource && !spec.greaterPowerThanSource) || t.kind !== "object" || !sourceId) return true; // without the source, checked later
  const me = s.objects[sourceId];
  const mine = me?.zone === "battlefield" ? power(s, me) : s.lastKnown?.[sourceId]?.power;
  const o = s.objects[t.id];
  return mine !== undefined && !!o && (spec.greaterPowerThanSource ? power(s, o) > mine : power(s, o) < mine);
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
      if (d.atMost ? sum > d.total : sum !== d.total && !(d.upTo && sum === 0)) return d.atMost ? `distribute up to ${d.total} counters among the targets` : d.counter ? `distribute the ${d.total} counters among the targets` : `divide ${d.total} among the targets`;
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
  // "One or more target creatures" needs one (TargetSpec.manyMin).
  const free = (spec: TargetSpec) => spec.optional || spec.skip || (!!spec.many && !spec.manyMin);
  const options = specs.map((spec, i) => (free(spec) ? [] : legalTargets(s, spec, controller, undefined, src, sourceId).filter((t) => canChooseTarget(s, specs, [], i, t, controller, src, sourceId))));
  if (options.some((o, i) => !free(specs[i]!) && !o.length)) return false;
  if (!specs.some((spec) => spec.distinctFrom?.length || spec.sharesCreatureTypeWith?.length || spec.sameGraveyardAs?.length || spec.inGraveyardOfControllerOf?.length || spec.inGraveyardOfTarget !== undefined || spec.differentControllerFrom?.length || spec.differentNameFrom?.length || spec.differentManaValueFrom?.length || spec.sharesCardTypeWith?.length || spec.sharesNoCreatureTypeWith?.length || spec.total)) return true;
  // Some targets must differ from each other: look for one way to choose them all.
  const chosen: TargetChoice[] = [];
  const fill = (i: number): boolean => {
    if (i === specs.length) return true;
    if (free(specs[i]!)) {
      chosen[i] = { kind: "none" };
      return fill(i + 1);
    }
    for (const t of options[i]!) {
      if ((specs[i]!.distinctFrom ?? []).some((j) => sameTarget(chosen[j], t)) || !relatedOk(s, specs[i]!, chosen, t) || !totalOk(s, specs, chosen, i, t)) continue;
      chosen[i] = t;
      if (fill(i + 1)) return true;
    }
    return false;
  };
  return fill(0);
}

// ---------------------------------------------------------------------------
// Modes (CR 700.2)

/**
 * Which modes of a modal body can be chosen right now: one that needs targets needs legal ones (CR 700.2a), and for
 * "choose one that hasn't been chosen [this turn]", one `sourceId` hasn't had chosen yet (see modesUsed).
 */
export const legalModes = (s: GameState, body: AbilityBody, controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean[] => {
  if (!body.modal) return [];
  const used = modesUsed(s, body, sourceId);
  return body.modal.modes.map((m, i) => !used.includes(i) && hasLegalTargets(s, m.targets, controller, src));
};

/**
 * "Choose one that hasn't been chosen" (Demonic Pact) and "... this turn" (Gala Greeters): the modes already chosen for
 * this ability of this object, by any player (rulings on Demonic Pact). Recorded by noteModesChosen.
 */
export function modesUsed(s: GameState, body: AbilityBody, sourceId?: ObjectId): number[] {
  const how = body.modal?.unchosen;
  const o = how && sourceId !== undefined ? s.objects[sourceId] : undefined;
  const rec = o?.modesChosen?.[body.text];
  return rec && (how === "ever" || rec.turn === s.turn) ? rec.modes : [];
}

/** Remember the modes chosen for a "choose one that hasn't been chosen [this turn]" ability of `sourceId` (see modesUsed). */
export function noteModesChosen(s: GameState, body: AbilityBody, sourceId: ObjectId, modes: number[], sourceZc?: number) {
  const o = s.objects[sourceId];
  if (!body.modal?.unchosen || !o || (sourceZc !== undefined && (o.zoneChanges ?? 0) !== sourceZc)) return;
  const before = modesUsed(s, body, sourceId);
  (o.modesChosen ??= {})[body.text] = { modes: [...before, ...modes], turn: s.turn };
}

/** Is there a valid choice of modes? Spells and activated abilities need at least one mode. */
export function canChooseModes(s: GameState, body: AbilityBody, controller: PlayerId, src?: SourceQuality, sourceId?: ObjectId): boolean {
  if (!body.modal) return true;
  // With "you may choose the same mode more than once" (CR 700.2d), one mode that can be chosen is enough.
  return legalModes(s, body, controller, src, sourceId).filter(Boolean).length >= (body.modal.repeat ? 1 : Math.max(1, body.modal.min));
}

/** Why these modes can't be chosen, or null. */
/** `both`: a "choose both instead" applies (see AbilityBody.modal.both). */
export function modesProblem(s: GameState, body: AbilityBody, modes: number[] | undefined, controller: PlayerId, src?: SourceQuality, both = false, sourceId?: ObjectId): string | null {
  if (!body.modal) return modes?.length ? "this isn't modal" : null;
  if (!modes) return "choose a mode";
  const count = modeCountProblem(body, modes, both);
  if (count) return count;
  const used = modesUsed(s, body, sourceId);
  const again = modes.find((i) => used.includes(i));
  if (again !== undefined) return `"${body.modal.modes[again]!.text}" has already been chosen${body.modal.unchosen === "turn" ? " this turn" : ""}`;
  const legal = legalModes(s, body, controller, src, sourceId);
  const bad = modes.find((i) => !legal[i]);
  if (bad !== undefined) return `can't choose "${body.modal.modes[bad]!.text}": no legal targets`;
  // "Each mode must target a different player" (CR 115.3): the chosen modes' targets all together.
  if (body.modal.distinctTargets && body.modal.min < body.modal.max && !hasLegalTargets(s, withModes(body, modes).targets, controller, src, sourceId)) return "each mode must target a different player";
  return null;
}

/**
 * "Choose one or more. Each mode must target a different player" (Vindictive Lich): no more modes than there are players
 * its modes could target (rulings). Modes chosen in a fixed number ("you may choose two") keep their range.
 */
export function distinctModeCap(s: GameState, body: AbilityBody, controller: PlayerId, max: number, src?: SourceQuality, sourceId?: ObjectId): number {
  const m = body.modal;
  if (!m?.distinctTargets || m.min >= m.max) return max;
  const players = new Set(m.modes.flatMap((mode) => mode.targets.flatMap((spec) => legalTargets(s, spec, controller, undefined, src, sourceId).flatMap((t) => (t.kind === "player" ? [t.id] : [])))));
  return Math.max(m.min, Math.min(max, players.size));
}

// ---------------------------------------------------------------------------
// Resolving

/** The permanents a player could pick for a "pick" effect: their own, matching the filter (not targeted, so hexproof doesn't matter). */
/** `sourceId`: "another creature you control" (filter.notSource) can't be the ability's source. */
export function pickOptions(s: GameState, e: { filter: TargetSpec; least?: "toughness" | "power"; greatest?: "power" | "manaValue"; action?: PickAction; anyController?: true; destroyable?: true }, pid: PlayerId, sourceId?: ObjectId, sourceZc?: number): ObjectId[] {
  // "Put a +1/+1 counter on a creature" (Zimone's Hypothesis): any player's.
  // Drake Familiar: "return an enchantment to its owner's hand": any player's too.
  if (e.anyController && (e.action === "counters" || e.action === "bounce")) return s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), pid, false));
  // Drop of Honey, Purging Scythe: "the creature with the least power" on the battlefield, anyone's, or tied for it; to be
  // destroyed, one that can be if any of those can (rulings, CR 702.12b).
  if (e.anyController && e.action === "choose" && e.least) {
    const all = s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), pid, false));
    const stat = (id: ObjectId) => (e.least === "power" ? power(s, obj(s, id)) : toughness(s, obj(s, id)));
    const min = Math.min(...all.map(stat));
    const tied = all.filter((id) => stat(id) === min);
    const can = e.destroyable ? tied.filter((id) => !objHasKeyword(s, obj(s, id), "Indestructible")) : tied;
    return can;
  }
  // Curse Artifact: "unless they sacrifice that artifact": the one the source is attached to.
  if (e.filter.sourceHost) {
    const { sourceHost: _, ...filter } = e.filter;
    // As the source last existed if it has left (CR 608.2h): the permanent it was attached to, if that one is still there.
    const me = sourceId ? s.objects[sourceId] : undefined;
    const was = me?.zone === "battlefield" ? (me.attachedTo ? { id: me.attachedTo, zc: s.objects[me.attachedTo]?.zoneChanges ?? 0 } : undefined) : sourceId ? s.lastKnown?.[sourceId]?.attachedTo : undefined;
    const host = was && (s.objects[was.id]?.zoneChanges ?? 0) === was.zc ? was.id : undefined;
    return pickOptions(s, { ...e, filter }, pid, sourceId).filter((id) => id === host);
  }
  // "A creature that saddled it this turn": tapped for the source's saddle cost this turn, each the object it was then.
  if (e.filter.saddledSource) {
    const { saddledSource: _, ...filter } = e.filter;
    return pickOptions(s, { ...e, filter }, pid, sourceId).filter((id) => saddledSource(s, id, sourceId, sourceZc));
  }
  // Without an action: permanents to sacrifice (a sacrifice option or payment), which can't include one that "can't be sacrificed" (CR 701.21).
  const sacrificing = !e.action || e.action === "sacrifice";
  // "Unattach an Equipment from a creature you control" (Akiri, Fearless Voyager): whoever controls the Equipment.
  if (e.action === "unattach")
    return s.battlefield.filter((id) => {
      const host = obj(s, id).attachedTo ? s.objects[obj(s, id).attachedTo!] : undefined;
      return !!host && host.zone === "battlefield" && objIsType(s, host, "Creature") && controllerOf(s, host) === pid && objectMatches(s, e.filter, obj(s, id), pid, false);
    });
  const shares = e.filter.sharesPermanentTypeWithSubject ? subjectPermanentTypes(s) : undefined;
  const ids = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !(e.filter.notSource && id === sourceId && !(e.filter.notSourceUnlessArtifact && objIsType(s, obj(s, id), "Artifact"))) && objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), pid, false) && !(sacrificing && !canBeSacrificed(s, obj(s, id))) && (!shares || (id !== shares.id && characteristics(s, obj(s, id)).types.some((t) => shares.types.includes(t)))));
  // "Sacrifices a creature with the greatest power among creatures they control": the greatest, or tied for it; the
  // player chooses among those tied (rulings on Crackling Doom). Mana value from the mana cost, X as 0 (CR 202.3, 107.3).
  if (e.greatest) {
    const of = (id: ObjectId) => (e.greatest === "power" ? power(s, obj(s, id)) : defMv(defOf(s, obj(s, id))));
    const max = Math.max(...ids.map(of));
    return ids.filter((id) => of(id) === max);
  }
  if (!e.least) return ids;
  // Bolster: the least toughness, or tied for it (CR 701.39a); "the least power among creatures they control" likewise.
  const stat = (id: ObjectId) => (e.least === "power" ? power(s, obj(s, id)) : toughness(s, obj(s, id)));
  const min = Math.min(...ids.map(stat));
  return ids.filter((id) => stat(id) === min);
}

/**
 * The permanent types (CR 205.2a) of the resolving trigger's subject, as it is on the battlefield or as it last was there
 * (CR 608.2h): Cloudstone Curio's "shares a permanent type with it".
 */
function subjectPermanentTypes(s: GameState): { id: ObjectId; types: string[] } {
  const subj = s.resolving?.item.subject;
  const o = subj ? s.objects[subj.id] : undefined;
  if (!subj || !o) return { id: "", types: [] };
  const here = o.zone === "battlefield" && (o.zoneChanges ?? 0) === subj.zc;
  const lk = s.lastKnown?.[subj.id];
  const types = here ? characteristics(s, o).types : lk && lk.zc === subj.zc ? lk.source?.types ?? [] : [];
  return { id: subj.id, types: types.filter((t) => ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"].includes(t)) };
}

/** The battle this creature is attacking, while it's still that battle (CR 506.4). */
function attackedBattle(s: GameState, o: GameObject): boolean {
  const b = attackedPlaneswalker(s, o);
  return !!b && objIsType(s, b, "Battle");
}

/**
 * Whether a permanent has a mana ability (CR 605.1), activated or triggered: its basic land types' (CR 305.6), its own and
 * the ones granted to it, from `c`, its characteristics as they are or as the layers have them so far (Raggadragga's
 * "each creature you control with a mana ability gets +2/+2" applies after the abilities are added, CR 613.1f).
 */
function hasManaAbility(s: GameState, o: GameObject, c: Characteristics): boolean {
  if (o.zone !== "battlefield") return !!(abilitiesOf(s, o).mana.length || abilitiesOf(s, o).manaTriggers?.length);
  if (!c.landAbilitiesLost && c.subtypes.some((st) => basicLandManaAbility(st))) return true;
  const own = c.hasPrintedAbilities ? compileCard(defOf(s, o)) : undefined;
  if (own && (own.mana.length || own.manaTriggers?.length)) return true;
  return c.grantedAbilities.some((t) => compileGranted(t).mana.length || compileGranted(t).manaTriggers?.length);
}

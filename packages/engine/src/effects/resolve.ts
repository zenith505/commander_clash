import { allEffects, type AbilityBody, type Amount, type DamageRecipient, type Effect, type ManaAbility, type Modification, type ObjRef, type PlayerRef, type TargetChoice } from "../abilities";
import { withPutter } from "../counters";
import { cardIdOf, defOf, objIsType, pairedWith, power, toughness } from "../cards";
import { addTriggeredMana, askAuraReturns, creatureTypesOf, draw, enterTogether, gainLife, livingPlayers, log, moveObject, obj, opponents, player, shareCreatureType } from "../game";
import { characteristics, controllerOf, everyCreatureType, invalidateCharacteristics } from "../layers";
import { compileCard } from "../oracle";
import { bindChosenKeywords, CREATURE_TYPES, CHOSEN_KEYWORD, CHOSEN_LAND_TYPE, CHOSEN_HEXPROOF, CHOSEN_PLAYER_PROTECTION, CHOSEN_PROTECTION, CHOSEN_TYPE, protectionFromPlayer } from "../keywords";
import { evalAmount, type AmountCtx } from "../amounts";
import { cardSource, objectSource, type DamageSource } from "../damage";
import { RulesError, type CardDef, type Chosen, type Color, type GameObject, type GameState, type LastKnown, type ManaType, type ObjectId, type PlayerId, type StackItem, type TriggerEventInfo } from "../types";
import { manaTriggerResults } from "../manaabilities";
import { askGraveyardOrder, closeGraveyardBatch, graveyardEnd } from "../graveyard";
import type { ManaSpent } from "../mana";
import { objectMatches, bindChosen, bindBound, targetingCtx, sourceQuality, spellQuality, isLegalTarget, lesserPowerOk, sameNamed, checkTotals, relatedOk } from "./targeting";
import { runPreventionEffect } from "./run-prevention";
import { runBasicsEffect, becomeMonarch } from "./run-basics";
import { runCoinEffect, runDiceEffect } from "./run-dice";
import { runDungeonsEffect } from "./run-dungeons";
import { runZonesEffect } from "./run-zones";
import { proliferate, runPermanentsEffect } from "./run-permanents";
import { runTokensEffect, createToken } from "./run-tokens";
import { runCopiesEffect } from "./run-copies";
import { runSpellsEffect, addDelayed } from "./run-spells";
import { runNamesEffect } from "./run-names";
import { runLibraryEffect } from "./run-library";
import { runChoicesEffect } from "./run-choices";
import { runVotesEffect, votedObjects } from "./run-votes";
import { closeZoneBatch, fireEvent } from "./triggers";
import { foundWith } from "../mutate";

export interface ResolveCtx {
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
  /** Colors of mana spent to cast it, or the spell its permanent was (CR 207.2c). */
  colorsSpent?: number;
  /** Mana from Treasures spent to cast it (or the spell its permanent was) or to activate it (CR 106.3). */
  treasureSpent?: number;
  /** The mana spent to cast the spell, the spell its permanent was, or the spell a cast trigger is about, by type (CR 601.2h). */
  spent?: ManaSpent;
  /** What was sacrificed to cast it, as it last existed. */
  sacrificed?: LastKnown[];
  /** A station ability's tapped creature (CR 702.184a). */
  stationed?: StackItem["stationed"];
  sourceUntaps?: number;
  sourceTransforms?: number;
  /** The creature type or color chosen as it resolves, or else as its source entered. */
  chosen?: Chosen;
  /** The player an instruction for each player is being done to now (PlayerRef "eachOne"). */
  eachOne?: PlayerId;
}

export type Resolution = "fizzled" | "done" | "paused";

/**
 * The opponent the gift was promised to (CR 702.174a, k): a spell's own choice, or for a permanent's gift trigger, the
 * choice its spell made, carried by the trigger (CR 702.174b). Undefined if no gift was promised.
 */
/** "If evidence was collected" (CR 701.59c): for a spell, as it was cast; for its permanent's enters trigger, as its spell was. */
export function evidenceCollected(s: GameState, ctx: ResolveCtx): boolean {
  const item = s.resolving?.item;
  if (item?.kind === "spell") return !!s.objects[item.objectId ?? ""]?.evidence;
  return !!ctx.event?.evidence;
}

export function gifteeOf(s: GameState, ctx: ResolveCtx): PlayerId | undefined {
  const item = s.resolving?.item;
  if (item?.kind === "spell") return s.objects[item.objectId ?? ""]?.gift;
  return ctx.event?.gift;
}

/**
 * Start resolving a spell or ability whose stack item has been removed from the stack.
 * Targets are re-checked first: if every target is now illegal it does nothing (CR 608.2b),
 * and effects aimed at individual illegal targets are skipped. Effects then run in order
 * (CR 608.2c); one that needs a player's choice pauses the resolution (see continueResolution).
 */
export function beginResolution(s: GameState, item: StackItem, body: AbilityBody): Resolution {
  const targets = item.targets ?? [];
  const src = item.kind === "spell" ? spellQuality(s, s.objects[item.objectId!] ? cardIdOf(s.objects[item.objectId!]!) : undefined) : sourceQuality(s, item.sourceId, item.sourceCardId);
  // An amount bound ("with power less than or equal to ~'s power") is worked out again now (CR 608.2b), with the source as
  // it last existed if it has left (608.2h).
  const now: AmountCtx = { ...targetingCtx(s, item.controller, item.sourceId), ...(item.sourceZc !== undefined ? { sourceZc: item.sourceZc } : {}), ...(item.lki ? { lki: item.lki } : {}), x: item.x ?? 0 };
  const legal = body.targets.map((spec, i) => !!targets[i] && isLegalTarget(s, bindBound(s, spec, now), targets[i]!, item.controller, src) && lesserPowerOk(s, spec, targets[i]!, item.sourceId, item.sourceZc));
  checkTotals(s, body.targets, targets, legal);
  // Requirements about the other targets, checked again too (CR 608.2b): "controlled by different players" (Run Away
  // Together), "in that player's graveyard" (Goblin Welder).
  body.targets.forEach((spec, i) => {
    if (legal[i] && (spec.differentControllerFrom?.length || spec.inGraveyardOfControllerOf?.length) && !relatedOk(s, spec, targets, targets[i]!)) legal[i] = false;
  });
  // With every target it chose now illegal, it doesn't resolve (CR 608.2b). One that chose none of its
  // "up to" targets isn't targeted at all, and resolves (CR 115.6).
  const chose = targets.some((t) => t.kind !== "none");
  if (body.targets.length && chose && !legal.some(Boolean)) return "fizzled";
  const spellControllers = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.controller ?? null) : null));
  const spellObjects = targets.map((t) => (t.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.objectId ?? null) : null));
  // "If this is the second time this ability has resolved this turn": counted as it resolves, for this object's ability
  // only (a new object's start over, CR 400.7).
  const nth = item.kind === "ability" && item.sourceId && asksResolutions(body) ? countResolution(s, `${item.sourceId}@${item.sourceZc ?? 0}|${body.text ?? item.description}`) : undefined;
  s.resolving = {
    item,
    body,
    legal,
    next: 0,
    ...(spellControllers.some((c) => c !== null) ? { spellControllers } : {}),
    ...(spellObjects.some((c) => c !== null) ? { spellObjects } : {}),
    ...(nth !== undefined ? { nth } : {}),
  };
  return continueResolution(s);
}

function asksResolutions(body: AbilityBody): boolean {
  return allEffects(body.effects).some((e) => e.type === "if" && e.cond.kind === "resolvedNth");
}

function countResolution(s: GameState, key: string): number {
  if (s.resolutionCounts?.turn !== s.turn) s.resolutionCounts = { turn: s.turn, counts: {} };
  return (s.resolutionCounts.counts[key] = (s.resolutionCounts.counts[key] ?? 0) + 1);
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
    colorsSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.colorsSpent?.length ?? 0) : item.colorsSpent,
    // A spell's own; an activated ability's; an enters or cast trigger's, its spell's (CR 106.3).
    treasureSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.treasureSpent ?? 0) : (item.treasureSpent ?? item.event?.treasureSpent ?? 0),
    // A copy of a spell wasn't cast: no mana was spent on it (rulings on adamant).
    spent: item.kind === "spell" ? (item.copy ? undefined : s.objects[item.objectId!]?.spent) : item.event?.spent,
    sacrificed: item.sacrificed,
    stationed: item.stationed,
    sourceUntaps: item.sourceUntaps,
    sourceTransforms: item.sourceTransforms,
  };
  Object.defineProperty(ctx, "chosen", { get: () => r.chosen ?? sourceChosen(s, ctx), enumerable: true });
  for (;;) {
    // Between instructions: the cards the last one put into a graveyard together are arranged by their owner before
    // the next one, and before the spell itself goes to the graveyard (CR 404.3, 608.2n). Not inside a mana ability,
    // which can't stop for a choice: the event it's part of ends later.
    if (!r.scratch && !item.manaAbility) {
      closeZoneBatch(s); // its "one or more" triggers (CR 603.2c)
      closeGraveyardBatch(s);
      // Auras coming back because the last instruction made an "until ~ leaves" source leave (CR 303.4f, 610.3).
      if (askAuraReturns(s) === "asked") return "paused";
      if (askGraveyardOrder(s)) return "paused";
    }
    if (r.next >= r.body.effects.length) break;
    if (!r.scratch) s.leftTogether = undefined; // a new instruction, not one resuming after a choice
    if (runEffect(s, r.body.effects[r.next]!, ctx) === "paused") return "paused";
    r.next++;
    r.scratch = undefined;
  }
  s.leftTogether = undefined;
  s.resolving = null;
  if (item.kind === "spell" && item.objectId && s.objects[item.objectId]?.zone === "stack") finishSpell(s, item.objectId, item);
  if (item.manaAbility) manaAbilityResolved(s, item, r.made ?? []);
  return "done";
}

/**
 * An activated mana ability resolves as soon as it's activated, without the stack (CR 605.3b), even while another
 * spell or ability is partway through resolving and waiting on a payment (605.3a). That one carries on afterwards.
 * Inside another decision, it can't stop for a choice of its own: the activation is refused instead.
 */
export function resolveManaAbility(s: GameState, item: StackItem, body: AbilityBody, color?: Color): void {
  const outer = s.resolving;
  const inside = !!outer || !!s.pending;
  const left = s.leftTogether;
  s.resolving = { item, body, legal: [], next: 0, ...(color ? { chosen: { color } } : {}) };
  if (continueResolution(s) === "paused" && inside) throw new RulesError(`${s.cards[item.sourceCardId!]?.name ?? "That"}'s mana ability needs a choice that can't be made now`);
  if (!inside) return;
  s.resolving = outer;
  s.leftTogether = left;
}

/**
 * After an activated mana ability resolves (with {T} in its cost, its source was tapped for mana, CR 106.12): the
 * triggered mana abilities that triggers add their mana right away (CR 605.4a), as for `ManaAbility`s.
 */
function manaAbilityResolved(s: GameState, item: StackItem, made: ManaType[]): void {
  const m = item.manaAbility!;
  const o = item.sourceId ? s.objects[item.sourceId] : undefined;
  if (!o) return;
  if (m.tapped && o.zone === "battlefield") fireEvent(s, { type: "tappedForMana", id: o.id, player: item.controller });
  const results = manaTriggerResults(s, item.controller, o, { tap: !!m.tapped } as ManaAbility, made);
  const extra = m.extra ?? [];
  const picked = results.length === 1 ? results[0]! : results.find((r) => r.extra.length === extra.length && r.extra.every((x, i) => x === extra[i]));
  if (!picked) throw new RulesError(`choose the mana that tapping ${defOf(s, o).name} also adds`);
  addTriggeredMana(s, item.controller, picked);
  if (picked.adds.length) log(s, `${player(s, item.controller).name} adds ${picked.adds.map((x) => `{${x}}`).join("")}.`);
}

/** What was chosen as the ability's source entered ("the chosen type"), while it's still that object. */
function sourceChosen(s: GameState, ctx: { sourceId?: ObjectId; sourceZc?: number }): Chosen | undefined {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc) ? o.chosen : undefined;
}

/** Players in APNAP order: the active player first, then in turn order (CR 101.4). */
export function apnap(s: GameState, pids: PlayerId[]): PlayerId[] {
  const i = s.turnOrder.indexOf(s.activePlayer);
  const order = [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
  return order.filter((p) => pids.includes(p));
}

/** The creatures that convoked the resolving spell, or for an ability (an enters trigger), its source's spell (CR 702.51a). */
export function convokedFor(s: GameState, ctx: ResolveCtx): { id: ObjectId; zc: number }[] {
  const item = s.resolving?.item;
  const o = item?.kind === "spell" ? s.objects[item.objectId ?? ""] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o?.convoked ?? [];
}

export function objects(s: GameState, ref: ObjRef, ctx: ResolveCtx): GameObject[] {
  if (ref.ref === "castSpell") return []; // only counted (amounts.ts)
  if (ref.ref === "voted") return votedObjects(s);
  if (ref.ref === "convoker" || ref.ref === "convokers") {
    const list = convokedFor(s, ctx);
    return (ref.ref === "convoker" ? list.slice(ref.index, ref.index + 1) : list).flatMap((c) => {
      const o = s.objects[c.id];
      return o?.zone === "battlefield" && (o.zoneChanges ?? 0) === c.zc ? [o] : [];
    });
  }
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
    if (ref.sameName && out[0]) out.push(...sameNamed(s, out[0], ref.sameName, ctx.controller));
    return out;
  }
  if (ref.ref === "selfCard") {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    // An Aura's card in the graveyard it went to from the battlefield, as its creature died or since (Angelic Destiny
    // rulings): one zone change after the trigger, or none if it was already there.
    if (ref.moved) return o && o.zone === "graveyard" && ctx.sourceZc !== undefined && ((o.zoneChanges ?? 0) === ctx.sourceZc || (o.zoneChanges ?? 0) === ctx.sourceZc + 1) && (!ref.yours || o.owner === ctx.controller) ? [o] : [];
    // The card a leaves-the-battlefield trigger came from, in its new zone, while it's still that object (CR 400.7).
    // A merged permanent's other cards too, for an ability triggered by its leaving (CR 730.3c).
    return [...(o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.sourceZc ? [o] : []), ...foundWith(s, ctx.lki, ctx.sourceId)];
  }
  if (ref.ref === "subjectCard") {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    if (ref.zone) return o && o.zone === ref.zone && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : [];
    return [...(o && o.zone !== "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc ? [o] : []), ...foundWith(s, ctx.lki, ctx.subject?.id)];
  }
  // The objects a batch trigger was about, still where they went (CR 400.7): permanents that entered, cards put into a graveyard.
  if (ref.ref === "eventGroup") return (ctx.event?.group ?? []).flatMap((g) => (s.objects[g.id] && (s.objects[g.id]!.zoneChanges ?? 0) === g.zc ? [s.objects[g.id]!] : []));
  if (ref.ref === "pairedWithTarget") {
    const t = objects(s, { ref: "target", index: ref.index }, ctx)[0];
    const other = t && pairedWith(s, t);
    return other ? [other] : [];
  }
  if (ref.ref === "damagedThisWay") return [...new Set(s.resolving?.damagedThisWay ?? [])].map((id) => obj(s, id)).filter((o) => o.zone === "battlefield" && (!ref.filter || objectMatches(s, ref.filter, o, ctx.controller, false)));
  if (ref.ref === "sacrificed") return []; // gone: only its last known information is used
  if (ref.ref === "amassed") {
    const a = s.resolving?.amassed ?? s.resolving?.item.amassed;
    const o = a && s.objects[a.id];
    return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === a.zc ? [o] : [];
  }
  if (ref.ref === "discarded") {
    const o = s.resolving?.discardedCards?.length === 1 ? s.objects[s.resolving.discardedCards[0]!.id] : undefined;
    return o && o.zone === "graveyard" && (o.zoneChanges ?? 0) === s.resolving!.discardedCards![0]!.zc ? [o] : [];
  }
  if (ref.ref === "exiledTop") {
    const ex = s.resolving?.exiledTop;
    const o = ex && s.objects[ex.id];
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === ex.zc ? [o] : [];
  }
  if (ref.ref === "revealed") {
    const rv = s.resolving?.revealed;
    const o = rv && s.objects[rv.id];
    return o && o.zone === "library" && (o.zoneChanges ?? 0) === rv.zc ? [o] : [];
  }
  if (ref.ref === "affected")
    return (s.resolving?.affected ?? []).map((a) => s.objects[a.id]).filter((o): o is GameObject => o?.zone === "battlefield" && (o.zoneChanges ?? 0) === s.resolving!.affected!.find((a) => a.id === o.id)!.zc);
  if (ref.ref === "graveyardEnd")
    return players(s, ref.who, ctx)
      .map((pid) => graveyardEnd(s, pid, { ...(ref.filter ? { filter: ref.filter } : {}), ...(ref.bottom ? { bottom: true } : {}), ...(ref.only ? { only: true } : {}) }))
      .filter((o): o is GameObject => !!o);
  if (ref.ref === "diedDamagedBySelf") {
    const out: GameObject[] = [];
    for (const d of s.turnLog?.diedDamaged ?? []) {
      const o = s.objects[d.id];
      if (ctx.sourceId !== undefined && d.by.includes(ctx.sourceId) && o?.zone === "graveyard" && (o.zoneChanges ?? 0) === d.zc && !out.includes(o)) out.push(o);
    }
    return out;
  }
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
  if (ref.ref === "each" && ref.andSubject) {
    const filter = bindBound(s, bindChosen(ref.filter, ctx.chosen), amountCtx(s, ctx));
    const subj = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    const here = subj?.zone === "battlefield" && (subj.zoneChanges ?? 0) === ctx.subject!.zc;
    const lk = !here && ctx.subject ? s.lastKnown?.[ctx.subject.id] : undefined;
    const types = here ? creatureTypesOf(s, subj!) : lk?.zc === ctx.subject?.zc && lk?.creatureTypes ? (lk.creatureTypes === "all" ? "all" : new Set(lk.creatureTypes)) : undefined;
    const others = !types ? [] : s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== ctx.subject!.id && objectMatches(s, filter, o, ctx.controller, false) && shareCreatureType(types, creatureTypesOf(s, o)));
    return here ? [subj!, ...others] : others;
  }
  if (ref.ref === "each") {
    const filter = bindBound(s, bindChosen(ref.filter, ctx.chosen), amountCtx(s, ctx));
    const t = ref.otherThan !== undefined ? ctx.targets[ref.otherThan] : undefined;
    const except = t?.kind === "object" ? t.id : ref.other ? ctx.sourceId : undefined;
    const whose = ref.of && players(s, ref.of, ctx);
    const mine = ref.sharesTypeWithSelf ? sourceCreatureTypes(s, ctx) : undefined;
    const made = ref.notCreated ? (s.resolving?.created ?? []) : [];
    const others = s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== except && !made.includes(o.id) && (!whose || whose.includes(controllerOf(s, o))) && objectMatches(s, filter, o, ctx.controller, false) && (!mine || shareCreatureType(mine, creatureTypesOf(s, o))));
    if (!ref.andSelf) return others;
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const here = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
    return here && !others.includes(me) ? [me, ...others] : others;
  }
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => objIsType(s, o, "Creature") && !(ref.other && o.id === ctx.sourceId) && !(ref.attacking && o.attacking === undefined))
    .filter((o) => {
      const c = controllerOf(s, o);
      return ref.controller === "you" ? c === ctx.controller : ref.controller === "opponent" ? c !== ctx.controller : true;
    });
}

export function players(s: GameState, ref: PlayerRef, ctx: ResolveCtx): PlayerId[] {
  switch (ref.ref) {
    case "you":
      return [ctx.controller];
    case "eachOpponent":
      return opponents(s, ctx.controller);
    case "eachPlayer":
      return livingPlayers(s);
    case "target": {
      // "Any number of target players": each of them still a legal target (CR 608.2b).
      const out: PlayerId[] = [];
      for (let i = ref.index; i < ref.index + (ref.n ?? 1); i++) {
        const t = ctx.targets[i];
        if (ctx.legal[i] && t?.kind === "player") out.push(t.id);
      }
      return out;
    }
    case "eventPlayer":
      return ctx.event?.player !== undefined && !player(s, ctx.event.player).lost ? [ctx.event.player] : [];
    case "attackingPlayer":
      return ctx.event?.attacker !== undefined && !player(s, ctx.event.attacker).lost ? [ctx.event.attacker] : [];
    case "otherOpponents":
      return opponents(s, ctx.controller).filter((p) => p !== ctx.event?.player);
    case "enchantedPlayer": {
      // The player this Aura is attached to, or was as it last existed (CR 608.2h).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me) return [];
      const lk = s.lastKnown?.[me.id];
      const p = me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.attachedToPlayer : lk && lk.zc === ctx.sourceZc ? lk.attachedToPlayer : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "eachOne":
      return ctx.eachOne !== undefined ? [ctx.eachOne] : [];
    case "chosenPlayer": {
      const p = s.resolving?.chosen?.player;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "combatDamagedBySelf": {
      // This object as the ability's source, the same one that dealt the damage (CR 400.7).
      const key = ctx.sourceId !== undefined ? `${ctx.sourceId}@${ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0}` : undefined;
      return s.turnOrder.filter((p) => !player(s, p).lost && !!key && !!s.turnLog?.combatDamagedBy?.[p]?.includes(key));
    }
    case "choseThisWay":
      return (s.resolving?.scratch?.mayers ?? s.resolving?.choseThisWay ?? []).filter((p) => !player(s, p).lost);
    case "notChoseThisWay": {
      const did = s.resolving?.scratch?.mayers ?? s.resolving?.choseThisWay ?? [];
      return (ref.opponents ? opponents(s, ctx.controller) : apnap(s, s.players.map((p) => p.id))).filter((p) => !did.includes(p) && !player(s, p).lost);
    }
    case "punished":
      return (s.resolving?.scratch?.punished ?? []).filter((p) => !player(s, p).lost);
    case "couldntPick":
      return (s.resolving?.couldntPick ?? []).filter((p) => !player(s, p).lost);
    case "damagedThisWay":
      return (s.resolving?.playersDamagedThisWay ?? []).filter((p) => !player(s, p).lost);
    case "giftee": {
      const p = gifteeOf(s, ctx);
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "opponentsAttackingEventPlayer": {
      // "A player is attacking another player if they control a creature that's attacking that player" (rulings).
      const p = ctx.event?.player;
      if (p === undefined) return [];
      return opponents(s, ctx.controller).filter((q) => s.battlefield.some((id) => s.objects[id]!.attacking === p && !s.objects[id]!.attackingPermanent && controllerOf(s, s.objects[id]!) === q));
    }
    case "subjectController": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o) return [];
      if (o.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc) return [controllerOf(s, o)];
      // It left the battlefield: its controller as it last existed (CR 608.2h). A dies trigger saw it leave, so its
      // subject is the card where it went, and the trigger carries who controlled it.
      const lk = s.lastKnown?.[o.id];
      if (lk && lk.zc === ctx.subject!.zc) return [lk.controller];
      return ctx.lki?.controller !== undefined && !player(s, ctx.lki.controller).lost ? [ctx.lki.controller] : [];
    }
    case "targetOwner": {
      const t = ctx.targets[ref.index];
      const o = ctx.legal[ref.index] && t?.kind === "object" ? s.objects[t.id] : undefined;
      return o ? [o.owner] : [];
    }
    case "targetOrController": {
      const t = ctx.targets[ref.index];
      return players(s, { ref: t?.kind === "player" ? "target" : "targetController", index: ref.index }, ctx);
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

export function runEffect(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  // Counters an effect puts on are put by the ability's controller (Vorinclex rulings).
  const result = withPutter(ctx.controller, () => runEffectInner(s, e, ctx));
  invalidateCharacteristics(s);
  return result;
}

/** An amount as the ability works it out now (CR 608.2h). A negative result counts as 0 (CR 107.1b). */
export function amountNow(s: GameState, a: Amount, ctx: ResolveCtx): number {
  return Math.max(0, evalAmount(s, a, amountCtx(s, ctx)));
}

/**
 * The amount for each of `who`, worked out once before any of them acts and kept while it waits on their choices: their
 * own when it counts "their" things ("half the cards in their hand", PlayerRef eachOne), else the same for all.
 */
export function amountFor(s: GameState, a: Amount, ctx: ResolveCtx, who: PlayerId[]): Record<string, number> {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.nFor) {
    const each = JSON.stringify(a).includes('"eachOne"');
    const same = each ? 0 : amountNow(s, a, ctx);
    sc.nFor = Object.fromEntries(who.map((pid) => [pid, each ? amountNow(s, a, { ...ctx, eachOne: pid }) : same]));
  }
  return sc.nFor;
}

export const amountCtx = (s: GameState, ctx: ResolveCtx): AmountCtx => ({
  controller: ctx.controller,
  sourceId: ctx.sourceId,
  ...(ctx.sourceDef ? { sourceName: ctx.sourceDef.name } : {}),
  sourceZc: ctx.sourceZc,
  x: ctx.x,
  event: ctx.event,
  ...(ctx.cause !== undefined ? { cause: ctx.cause } : {}),
  lki: ctx.lki,
  kicked: ctx.kicked,
  colorsSpent: ctx.colorsSpent,
  treasureSpent: ctx.treasureSpent,
  spent: ctx.spent,
  sacrificed: ctx.sacrificed,
  stationed: ctx.stationed,
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

/** The player chosen for the source as it entered ("the chosen player"), as the ability was activated or as it is now. */
export function chosenPlayerOf(s: GameState, ctx: ResolveCtx): PlayerId | undefined {
  if (ctx.lki?.chosenPlayer !== undefined) return ctx.lki.chosenPlayer;
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  return o && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc) ? o.chosen?.player : undefined;
}

/**
 * A resolving effect's changes with their numbers worked out now: "gets +X/+X" doesn't change
 * later if X's count does (CR 608.2h, 611.2c).
 */
/** Of `keywords`, the ones (or their "hexproof from" variants, CR 702.11d) a creature `pid` controls has. */
function sharedKeywords(s: GameState, pid: PlayerId, keywords: string[]): string[] {
  const out = new Set<string>();
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (!objIsType(s, o, "Creature") || controllerOf(s, o) !== pid) continue;
    for (const k of characteristics(s, o).keywords) if (keywords.some((w) => k === w || (w === "Hexproof" && k.startsWith("Hexproof from ")))) out.add(k);
  }
  return [...out];
}

export function fixMods(s: GameState, mods: Modification[], ctx: ResolveCtx): Modification[] {
  const c = amountCtx(s, ctx);
  return mods.map((m) =>
    // "Attacks this combat if able": the combat going on as it resolves.
    m.kind === "attacksIfAble" && m.combat === "this"
      ? { kind: "attacksIfAble", combat: s.combatsThisTurn ?? 0 }
      : // "Power and toughness each equal to its mana value" (Karn, the Great Creator): each affected object's own, worked
        // out in the layers (a permanent's mana value doesn't change but by a copy effect).
        (m.kind === "modifyPT" || m.kind === "setPT") && [m.power, m.toughness].some((a) => typeof a === "object" && a.count.kind === "affectedManaValue")
      ? m
      : m.kind === "modifyPT" || m.kind === "setPT"
      ? { ...m, power: evalAmount(s, m.power, c), toughness: evalAmount(s, m.toughness, c) }
      : // Odric, Lunarch Marshal: the keywords creatures its controller controls have now (CR 611.2c), variants included.
        m.kind === "addKeywords" && m.sharedAmongYours
        ? { kind: "addKeywords", keywords: sharedKeywords(s, ctx.controller, m.keywords) }
        : // "Gains protection from the color of your choice": the color chosen as it resolved.
        m.kind === "addKeywords" && (m.keywords.includes(CHOSEN_PROTECTION) || m.keywords.includes(CHOSEN_HEXPROOF))
        ? { ...m, keywords: bindChosenKeywords(m.keywords, s.resolving?.chosen?.color) }
        : // "Gains protection from the chosen player" (Guardian Archon): the player chosen for its source.
          m.kind === "addKeywords" && m.keywords.includes(CHOSEN_PLAYER_PROTECTION)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_PLAYER_PROTECTION ? [k] : chosenPlayerOf(s, ctx) !== undefined ? [protectionFromPlayer(chosenPlayerOf(s, ctx)!)] : [])) }
        : // "Gains your choice of menace or lifelink": the keyword chosen as it resolved.
          m.kind === "addKeywords" && m.keywords.includes(CHOSEN_KEYWORD)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_KEYWORD ? [k] : s.resolving?.chosen?.keyword ? [s.resolving.chosen.keyword] : [])) }
        : // "Becomes the creature type of your choice": the type chosen as it resolved.
          (m.kind === "setSubtypes" || m.kind === "addTypes") && m.subtypes.includes(CHOSEN_TYPE)
          ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_TYPE ? [st] : s.resolving?.chosen?.type ? [s.resolving.chosen.type] : [])) }
          : // "Becomes the basic land type of your choice", "becomes the color of your choice".
            // "Can't be blocked by creatures that player controls" (The Black Gate): the player chosen as it resolved.
            m.kind === "cantBeBlockedBy" && m.filter.controller === "chosenPlayer"
            ? { ...m, filter: (({ controller: _, ...rest }) => ({ ...rest, controlledBy: s.resolving?.chosen?.player ?? -1 }))(m.filter) }
            : // "Can't be blocked by creatures of that color this turn" (Skrelv): the color chosen as it resolved.
              m.kind === "cantBeBlockedBy" && m.filter.chosen === "color"
            ? { ...m, filter: (({ chosen: _, ...rest }) => (s.resolving?.chosen?.color ? { ...rest, colors: [s.resolving.chosen.color] } : { ...rest, controlledBy: -1 }))(m.filter) }
            : m.kind === "setLandTypes" && m.subtypes.includes(CHOSEN_LAND_TYPE)
            ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_LAND_TYPE ? [st] : s.resolving?.chosen?.landType ? [s.resolving.chosen.landType] : [])) }
            : m.kind === "setColors" && m.chosen
              ? { kind: "setColors", colors: s.resolving?.chosen?.color ? [s.resolving.chosen.color] : [] }
              : m,
  );
}

export function runEffectInner(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const src = ctx.sourceDef.name;
  switch (e.type) {
    case "damage":
    case "eachDealsDamage":
    case "preventNext":
    case "redirectNext":
    case "preventCombatDamage":
    case "noLifeGain":
    case "turnRules":
    case "flashUntilNextTurn":
    case "opponentsHandOnlyUntilNextTurn":
    case "graveyardCastThisTurn":
    case "graveyardTurn":
    case "cantCast":
    case "cantPlayLands":
    case "noPrevention":
    case "damageMod":
    case "pumpPerBlocker":
    case "draw":
    case "drawUpTo":
    case "getEnergy":
    case "getExperience":
    case "poison":
    case "loseAllCounters":
    case "emblem":
    case "becomeMonarch":
    case "extraLandThisTurn":
    case "ringTempts":
    case "increaseSpeed":
    case "ascend":
    case "gainLife":
    case "exchangeLife":
    case "exchangeLifeWithSelf":
    case "loseLife":
    case "setLife":
    case "addCombatMana":
    case "addMana":
    case "cantBlockRule":
    case "cantAttackRule":
    case "keepManaThisTurn":
    case "manaTriggerThisTurn":
    case "costModThisTurn":
    case "fight":
    case "createdFightEach":
    case "bite":
    case "extraTurn":
    case "controlPlayer":
    case "skip":
    case "addPhases":
    case "loseGame":
    case "winGame":
      return runBasicsEffect(s, e, ctx, src);
    case "damageRule":
      return runPreventionEffect(s, e, ctx, src);
    case "returnToBattlefield":
    case "unearth":
    case "castFromExileFree":
    case "castTargetFree":
    case "destroy":
    case "regenerate":
    case "exile":
    case "returnLinked":
    case "exileFaceDown":
    case "moveLinked":
    case "revealHandOrTop":
    case "playLinked":
    case "cipher":
    case "haunt":
    case "grantFlashback":
    case "pick":
    case "meld":
    case "sacrificeEach":
    case "keepRest":
    case "keepDestroyRest":
    case "empowerJace":
    case "bounce":
    case "weld":
    case "putOntoBattlefield":
    case "randomFromGraveyard":
    case "chooseFromGraveyard":
    case "reorderGraveyard":
    case "returnAllFromGraveyard":
    case "putFromHand":
    case "revealFromHand":
    case "exileHand":
    case "mayCastFromGraveyard":
    case "castNow":
    case "putInLibrary":
    case "putInGraveyard":
    case "exileGraveyard":
    case "livingDeath":
    case "putAllOnBottom":
    case "returnFaceDownExiled":
    case "exiledToGraveyard":
    case "flicker":
    case "returnExiled":
    case "exileIfDies":
    case "exileIfLeaves":
    case "noRegen":
    case "noCombatDamage":
    case "lookAtHand":
    case "sacrifice":
    case "animateDead":
    case "sacrificeAnimated":
    case "exploit":
    case "champion":
    case "returnChampioned":
    case "soulbond":
    case "ninjutsu":
    case "impulse":
    case "madness":
    case "miracle":
    case "castFromHand":
    case "castFromAmong":
    case "suspendTick":
    case "suspendCast":
    case "siegeDefeated":
    case "exileSelfWithTime":
    case "exileSpell":
    case "warpExile":
    case "playExiled":
    case "forEachThisWay":
    case "commanderToHand":
    case "commanderToBattlefield":
    case "toCommandZone":
      return runZonesEffect(s, e, ctx, src);
    case "tap":
    case "suspect":
    case "untap":
    case "untapUpTo":
    case "tapAnyNumber":
    case "tapOrUntap":
    case "becomeSaddled":
    case "classLevel":
    case "solve":
    case "harness":
    case "transform":
    case "becomePrepared":
    case "flip":
    case "removeFromCombat":
    case "earthbend":
    case "mustBlockSource":
    case "cantBlockSource":
    case "phaseOut":
    case "proliferate":
    case "amass":
    case "connive":
    case "recruit":
    case "skipUntap":
    case "enterTappedUntil":
    case "noMaxHandSize":
    case "counters":
    case "distribute":
    case "lastKnownCounters":
    case "endure":
    case "moveCounter":
    case "removeCounters":
    case "removeAnyCounters":
    case "battleDefense":
    case "removeAllCounters":
    case "moveAllCounters":
    case "removeSelfCounter":
    case "renown":
    case "adapt":
    case "monstrosity":
    case "evolve":
    case "explore":
    case "doublePT":
    case "continuous":
    case "groupRules":
    case "ownersGainControl":
    case "exchangeControl":
    case "playerGains":
    case "attach":
    case "attachAny":
    case "attachElsewhere":
    case "unattach":
    case "unattachSelf":
    case "transformSelf":
      return runPermanentsEffect(s, e, ctx, src);
    case "becomeCopy":
      return runCopiesEffect(s, e, ctx);
    case "together":
      // Each kind of token at the same time (CR 608.2f): entering together, each sees the others enter.
      enterTogether(s, () => {
        for (const x of e.effects) runEffect(s, x, ctx);
      });
      return;
    case "myriad":
    case "encore":
    case "createTokenCopy":
    case "createToken":
    case "linkedExileToken":
      return runTokensEffect(s, e, ctx, src);
    case "delayed":
    case "castSearched":
    case "castCipher":
    case "castParadigm":
    case "castLinkedCopy":
    case "copySpell":
    case "nextCast":
    case "nextSpellImprovise":
    case "floatingTrigger":
    case "cascade":
    case "exileUntilNonland":
    case "castFaceDownExiled":
    case "discover":
    case "ripple":
    case "counterUnlessPays":
    case "counterCause":
    case "counterSpell":
    case "spellEntersWith":
    case "spellGains":
    case "counterEach":
    case "changeTarget":
    case "newTargets":
    case "controlSpell":
      return runSpellsEffect(s, e, ctx, src);
    case "mill":
    case "revealUntilLandToGraveyard":
    case "exileTop":
    case "revealTopToHand":
    case "revealTop":
    case "parleyReveal":
    case "revealRevealed":
    case "discard":
    case "takeFromHand":
    case "scry":
    case "hideaway":
    case "clash":
    case "surveil":
    case "orderTop":
    case "handToTop":
    case "scrollRack":
    case "drawnPayOrTop":
    case "shuffle":
    case "handToBottomDraw":
    case "shuffleIntoLibrary":
    case "shuffleSpell":
    case "taintedPact":
    case "shuffleZones":
    case "search":
    case "revealPick":
    case "piles":
    case "dig":
      return runLibraryEffect(s, e, ctx, src);
    case "exileNamed":
    case "revealUntil":
    case "banName":
      return runNamesEffect(s, e, ctx, src);
    case "venture":
    case "takeInitiative":
      return runDungeonsEffect(s, e, ctx, src);
    case "roll":
      return runDiceEffect(s, e, ctx, src);
    case "flipCoin":
      return runCoinEffect(s, e, ctx, src);
    case "vote":
    case "eachChooses":
    case "controlFromEach":
    case "chooseVotes":
    case "secretNumbers":
      return runVotesEffect(s, e, ctx, src);
    case "may":
    case "repeatMay":
    case "repeatIf":
    case "rollAgain":
    case "either":
    case "eachMay":
    case "punisher":
    case "cumulativeUpkeep":
    case "collectEvidence":
    case "reflexive":
    case "choose":
    case "if":
      return runChoicesEffect(s, e, ctx, src);
  }
}

/**
 * Where a resolved instant or sorcery goes (CR 608.2n): its owner's graveyard; its owner's hand
 * if buyback was paid (CR 702.27a); exile, to be cast again at its controller's next upkeep, if it
 * has rebound and was cast from their hand (CR 702.88a). Flashback's and jump-start's exile is a
 * replacement effect that applies whatever the destination (CR 702.34a, see moveObject).
 */
function finishSpell(s: GameState, id: ObjectId, item: StackItem) {
  const o = obj(s, id);
  const d = defOf(s, o);
  const controller = o.controller;
  // Epic's two spell abilities, last as it resolves (CR 702.50a-b); a copy has no epic ability. Its copies copy it as it
  // resolved, with its choices (X, modes, targets), CR 707.10.
  if (compileCard(d).epic && !item.copy) {
    player(s, controller).cantCastSpells = d.name;
    (s.epics ??= {})[item.id] = structuredClone(item);
    addDelayed(s, "eachYourUpkeep", controller, o, { targets: [], effects: [{ type: "copySpell", spell: { epic: item.id }, n: 1, newTargets: true }], text: "Epic: copy ~ except for its epic ability. You may choose new targets for the copy." });
    log(s, `${player(s, controller).name} can't cast spells for the rest of the game (epic).`);
  }
  // Paradigm (CR 702.192a): the first time a spell with this name resolves for its controller, a copy of it every
  // precombat main phase of theirs from now on; then this spell is exiled (a copy ceases to exist there, 704.5e).
  if (compileCard(d).paradigm) {
    const p = player(s, controller);
    if (!(p.paradigms ??= []).includes(d.name)) {
      p.paradigms.push(d.name);
      addDelayed(s, "eachYourPrecombatMain", controller, o, { targets: [], effects: [{ type: "castParadigm", card: cardIdOf(o) }], text: `Paradigm: you may cast a copy of ${d.name} from exile without paying its mana cost.` });
    }
    moveObject(s, id, "exile");
    if (s.objects[id]?.zone === "exile") log(s, `${d.name} is exiled (paradigm).`);
    return;
  }
  if ((compileCard(d).rebound || o.reboundGained) && o.castFrom === "hand" && !o.exileIfLeaves) {
    moveObject(s, id, "exile");
    log(s, `${d.name} is exiled (rebound).`);
    addDelayed(s, "yourNextUpkeep", controller, o, { targets: [], effects: [{ type: "castFromExileFree" }], text: "Rebound: you may cast ~ from exile without paying its mana cost." });
    return;
  }
  // An Adventure that resolves is exiled instead of going to the graveyard, and its controller may cast the creature
  // later for as long as it stays exiled (CR 715.3d). A copy of one isn't a card (CR 707.10a).
  if (o.face === 1 && s.cards[o.cardId]?.layout === "adventure" && !o.spellCopy) {
    moveObject(s, id, "exile");
    if (o.zone === "exile") {
      o.mayPlay = { player: controller, zc: o.zoneChanges ?? 0, until: "adventure", turn: s.turn };
      log(s, `${d.name} is exiled: ${player(s, controller).name} may cast ${defOf(s, o).name} from exile (on an adventure).`);
    }
    return;
  }
  if (o.buyback) {
    moveObject(s, id, "hand");
    if (o.zone === "hand") log(s, `${d.name} returns to ${player(s, o.owner).name}'s hand (buyback).`);
    return;
  }
  moveObject(s, id, "graveyard");
  if (s.objects[id]?.zone === "graveyard") fireEvent(s, { type: "resolvedToGraveyard", id });
}

export function damageRecipients(s: GameState, to: DamageRecipient, ctx: ResolveCtx): { objs: GameObject[]; pids: PlayerId[] } {
  if (to.ref === "attackedBySelf") {
    // What it's attacking as this resolves, or what it was attacking as it last existed on the battlefield (rulings on
    // Myr Battlesphere). A planeswalker removed from combat leaves it attacking nothing (CR 506.4c); a battle isn't a
    // player or planeswalker.
    // "It" is the creature that attacked in a trigger about another creature (Hellrider; Mage Slayer's equipped creature).
    const who = to.subject ? ctx.subject : ctx.sourceId ? { id: ctx.sourceId, zc: ctx.sourceZc } : undefined;
    const o = who ? s.objects[who.id] : undefined;
    const here = !!o && o.zone === "battlefield" && (who!.zc === undefined || (o.zoneChanges ?? 0) === who!.zc);
    const lk = !here && who ? s.lastKnown?.[who.id] : undefined;
    const at = here ? o : lk && (who!.zc === undefined || lk.zc === who!.zc) ? lk : undefined;
    if (at?.attackingPermanent) {
      const pw = s.objects[at.attackingPermanent.id];
      const still = !at.attackingPermanent.battleController && pw?.zone === "battlefield" && (pw.zoneChanges ?? 0) === at.attackingPermanent.zc;
      return { objs: still ? [pw!] : [], pids: [] };
    }
    return { objs: [], pids: at?.attacking !== undefined && !s.players[at.attacking]?.lost ? [at.attacking] : [] };
  }
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
export function ctxSource(s: GameState, ctx: ResolveCtx): DamageSource {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (o && o.zone === "battlefield" && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc)) return { ...objectSource(s, o), controller: ctx.controller };
  // A spell is its own card on the stack; a gone permanent's ability, that permanent as it last existed (CR 609.7a):
  // with the colors, keywords and "can't be prevented" it had then (Vincent destroyed with its trigger on the stack).
  const lk = o && ctx.sourceZc !== undefined ? s.lastKnown?.[o.id] : undefined;
  if (lk?.source && lk.zc === ctx.sourceZc) return { ...lk.source, controller: ctx.controller, ref: { object: o!.id, zc: lk.zc } };
  const item = s.resolving?.item;
  const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  const ref = spell ? { object: spell.id, zc: spell.zoneChanges ?? 0 } : ctx.sourceId ? { object: ctx.sourceId, zc: ctx.sourceZc ?? s.lastKnown?.[ctx.sourceId]?.zc ?? 0 } : undefined;
  // A spell's reflexive trigger: its source is the spell, gone from the stack, so as it last existed there (CR 113.7a).
  return { ...cardSource(ctx.sourceDef, ctx.controller, ref), ...(spell || item?.fromSpell ? { spell: true as const } : {}) };
}

/**
 * The creature types of this ability's source: as it is on the battlefield, or as it last existed there once it has
 * left (CR 608.2h), or its card if it never was. Changeling-like "every creature type" is "all" (CR 702.73a).
 */
export function sourceCreatureTypes(s: GameState, ctx: ResolveCtx): Set<string> | "all" {
  const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (src && src.zone === "battlefield" && (ctx.sourceZc === undefined || (src.zoneChanges ?? 0) === ctx.sourceZc)) return creatureTypesOf(s, src);
  const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
  const last = lk?.creatureTypes && (ctx.sourceZc === undefined || lk.zc === ctx.sourceZc) ? lk.creatureTypes : undefined;
  if (last) return last === "all" ? "all" : new Set(last);
  return everyCreatureType(ctx.sourceDef) ? "all" : new Set(ctx.sourceDef.subtypes.filter((t) => CREATURE_TYPES.has(t)));
}

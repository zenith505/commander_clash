import type { AbilityBody, Amount, DamageRecipient, Effect, Modification, ObjRef, PlayerRef, TargetChoice } from "../abilities";
import { cardIdOf, defOf, objIsType, pairedWith, power, toughness } from "../cards";
import { draw, gainLife, livingPlayers, log, moveObject, obj, opponents, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import { compileCard } from "../oracle";
import { bindChosenKeywords, CHOSEN_PROTECTION, CHOSEN_TYPE } from "../keywords";
import { evalAmount, type AmountCtx } from "../amounts";
import { cardSource, objectSource, type DamageSource } from "../damage";
import type { CardDef, Chosen, GameObject, GameState, LastKnown, ObjectId, PlayerId, StackItem, TriggerEventInfo } from "../types";
import { objectMatches, bindChosen, sourceQuality, isLegalTarget, lesserPowerOk } from "./targeting";
import { runBasicsEffect, becomeMonarch } from "./run-basics";
import { runDungeonsEffect } from "./run-dungeons";
import { runZonesEffect } from "./run-zones";
import { proliferate, runPermanentsEffect } from "./run-permanents";
import { runTokensEffect, createToken } from "./run-tokens";
import { runCopiesEffect } from "./run-copies";
import { runSpellsEffect, addDelayed } from "./run-spells";
import { runLibraryEffect } from "./run-library";
import { runChoicesEffect } from "./run-choices";

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
    colorsSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.colorsSpent?.length ?? 0) : item.colorsSpent,
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

/** Players in APNAP order: the active player first, then in turn order (CR 101.4). */
export function apnap(s: GameState, pids: PlayerId[]): PlayerId[] {
  const i = s.turnOrder.indexOf(s.activePlayer);
  const order = [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)];
  return order.filter((p) => pids.includes(p));
}

export function objects(s: GameState, ref: ObjRef, ctx: ResolveCtx): GameObject[] {
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
  if (ref.ref === "pairedWithTarget") {
    const t = objects(s, { ref: "target", index: ref.index }, ctx)[0];
    const other = t && pairedWith(s, t);
    return other ? [other] : [];
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

export function players(s: GameState, ref: PlayerRef, ctx: ResolveCtx): PlayerId[] {
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
      // It left the battlefield: its controller as it last existed (CR 608.2h). A dies trigger saw it leave, so its
      // subject is the card where it went, and the trigger carries who controlled it.
      const lk = s.lastKnown?.[o.id];
      if (lk && lk.zc === ctx.subject!.zc) return [lk.controller];
      return ctx.lki?.controller !== undefined && !player(s, ctx.lki.controller).lost ? [ctx.lki.controller] : [];
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
  const result = runEffectInner(s, e, ctx);
  invalidateCharacteristics(s);
  return result;
}

/** An amount as the ability works it out now (CR 608.2h). A negative result counts as 0 (CR 107.1b). */
export function amountNow(s: GameState, a: Amount, ctx: ResolveCtx): number {
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
  colorsSpent: ctx.colorsSpent,
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
export function fixMods(s: GameState, mods: Modification[], ctx: ResolveCtx): Modification[] {
  const c = amountCtx(s, ctx);
  return mods.map((m) =>
    m.kind === "modifyPT" || m.kind === "setPT"
      ? { ...m, power: evalAmount(s, m.power, c), toughness: evalAmount(s, m.toughness, c) }
      : // "Gains protection from the color of your choice": the color chosen as it resolved.
        m.kind === "addKeywords" && m.keywords.includes(CHOSEN_PROTECTION)
        ? { ...m, keywords: bindChosenKeywords(m.keywords, s.resolving?.chosen?.color) }
        : // "Becomes the creature type of your choice": the type chosen as it resolved.
          (m.kind === "setSubtypes" || m.kind === "addTypes") && m.subtypes.includes(CHOSEN_TYPE)
          ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_TYPE ? [st] : s.resolving?.chosen?.type ? [s.resolving.chosen.type] : [])) }
          : m,
  );
}

export function runEffectInner(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  const src = ctx.sourceDef.name;
  switch (e.type) {
    case "damage":
    case "preventNext":
    case "redirectNext":
    case "preventCombatDamage":
    case "pumpPerBlocker":
    case "draw":
    case "getEnergy":
    case "becomeMonarch":
    case "ringTempts":
    case "increaseSpeed":
    case "ascend":
    case "gainLife":
    case "loseLife":
    case "addCombatMana":
    case "fight":
    case "bite":
      return runBasicsEffect(s, e, ctx, src);
    case "returnToBattlefield":
    case "unearth":
    case "castFromExileFree":
    case "destroy":
    case "regenerate":
    case "exile":
    case "returnLinked":
    case "pick":
    case "empowerJace":
    case "bounce":
    case "putOntoBattlefield":
    case "putFromHand":
    case "putInLibrary":
    case "exileGraveyard":
    case "flicker":
    case "returnExiled":
    case "exileIfDies":
    case "sacrifice":
    case "exploit":
    case "soulbond":
    case "ninjutsu":
    case "impulse":
    case "madness":
    case "suspendTick":
    case "suspendCast":
    case "exileSelfWithTime":
    case "warpExile":
      return runZonesEffect(s, e, ctx, src);
    case "tap":
    case "untap":
    case "removeFromCombat":
    case "mustBlockSource":
    case "phaseOut":
    case "proliferate":
    case "amass":
    case "connive":
    case "skipUntap":
    case "counters":
    case "lastKnownCounters":
    case "endure":
    case "moveCounter":
    case "removeCounters":
    case "removeSelfCounter":
    case "renown":
    case "evolve":
    case "explore":
    case "continuous":
    case "attach":
    case "unattachSelf":
    case "transformSelf":
      return runPermanentsEffect(s, e, ctx, src);
    case "becomeCopy":
      return runCopiesEffect(s, e, ctx);
    case "myriad":
    case "createTokenCopy":
    case "createToken":
      return runTokensEffect(s, e, ctx, src);
    case "delayed":
    case "copySpell":
    case "nextCast":
    case "cascade":
    case "counterUnlessPays":
    case "counterSpell":
      return runSpellsEffect(s, e, ctx, src);
    case "mill":
    case "exileTop":
    case "discard":
    case "scry":
    case "clash":
    case "surveil":
    case "orderTop":
    case "shuffle":
    case "search":
    case "dig":
      return runLibraryEffect(s, e, ctx, src);
    case "venture":
    case "takeInitiative":
      return runDungeonsEffect(s, e, ctx, src);
    case "may":
    case "cumulativeUpkeep":
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

export function damageRecipients(s: GameState, to: DamageRecipient, ctx: ResolveCtx): { objs: GameObject[]; pids: PlayerId[] } {
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
  return o && o.zone === "battlefield" ? { ...objectSource(s, o), controller: ctx.controller } : cardSource(ctx.sourceDef, ctx.controller);
}

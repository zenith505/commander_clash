import type { AbilityBody, Amount, DamageRecipient, Effect, ManaAbility, Modification, ObjRef, PlayerRef, TargetChoice } from "../abilities";
import { cardIdOf, defOf, objIsType, pairedWith, power, toughness } from "../cards";
import { askAuraReturns, draw, gainLife, livingPlayers, log, moveObject, obj, opponents, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import { compileCard } from "../oracle";
import { bindChosenKeywords, CHOSEN_KEYWORD, CHOSEN_LAND_TYPE, CHOSEN_PROTECTION, CHOSEN_TYPE } from "../keywords";
import { evalAmount, type AmountCtx } from "../amounts";
import { cardSource, objectSource, type DamageSource } from "../damage";
import { RulesError, type CardDef, type Chosen, type Color, type GameObject, type GameState, type LastKnown, type ManaType, type ObjectId, type PlayerId, type StackItem, type TriggerEventInfo } from "../types";
import { manaTriggerResults } from "../manaabilities";
import { askGraveyardOrder, closeGraveyardBatch, graveyardEnd } from "../graveyard";
import { addMana } from "../spend";
import { objectMatches, bindChosen, sourceQuality, isLegalTarget, lesserPowerOk } from "./targeting";
import { runPreventionEffect } from "./run-prevention";
import { runBasicsEffect, becomeMonarch } from "./run-basics";
import { runDungeonsEffect } from "./run-dungeons";
import { runZonesEffect } from "./run-zones";
import { proliferate, runPermanentsEffect } from "./run-permanents";
import { runTokensEffect, createToken } from "./run-tokens";
import { runCopiesEffect } from "./run-copies";
import { runSpellsEffect, addDelayed } from "./run-spells";
import { runLibraryEffect } from "./run-library";
import { runChoicesEffect } from "./run-choices";
import { closeZoneBatch, fireEvent } from "./triggers";

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
  /** What was sacrificed to cast it, as it last existed. */
  sacrificed?: LastKnown[];
  /** A station ability's tapped creature (CR 702.184a). */
  stationed?: StackItem["stationed"];
  sourceUntaps?: number;
  /** The creature type or color chosen as it resolves, or else as its source entered. */
  chosen?: Chosen;
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
    // A spell's own; an activated ability's; an enters or cast trigger's, its spell's (CR 106.3).
    treasureSpent: item.kind === "spell" ? (s.objects[item.objectId!]?.treasureSpent ?? 0) : (item.treasureSpent ?? item.event?.treasureSpent ?? 0),
    sacrificed: item.sacrificed,
    stationed: item.stationed,
    sourceUntaps: item.sourceUntaps,
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
 * After an activated mana ability with {T} in its cost resolves, its source was tapped for mana (CR 106.12): the
 * triggered mana abilities that triggers add their mana right away (CR 605.4a), as for `ManaAbility`s.
 */
function manaAbilityResolved(s: GameState, item: StackItem, made: ManaType[]): void {
  const m = item.manaAbility!;
  const o = item.sourceId ? s.objects[item.sourceId] : undefined;
  if (!m.tapped || !o) return;
  const results = manaTriggerResults(s, item.controller, o, { tap: true } as ManaAbility, made);
  const extra = m.extra ?? [];
  const picked = results.length === 1 ? results[0]! : results.find((r) => r.extra.length === extra.length && r.extra.every((x, i) => x === extra[i]));
  if (!picked) throw new RulesError(`choose the mana that tapping ${defOf(s, o).name} also adds`);
  addMana(s, item.controller, picked.adds);
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

export function objects(s: GameState, ref: ObjRef, ctx: ResolveCtx): GameObject[] {
  if (ref.ref === "castSpell") return []; // only counted (amounts.ts)
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
  if (ref.ref === "damagedThisWay") return [...new Set(s.resolving?.damagedThisWay ?? [])].map((id) => obj(s, id)).filter((o) => o.zone === "battlefield" && (!ref.filter || objectMatches(s, ref.filter, o, ctx.controller, false)));
  if (ref.ref === "sacrificed") return []; // gone: only its last known information is used
  if (ref.ref === "affected")
    return (s.resolving?.affected ?? []).map((a) => s.objects[a.id]).filter((o): o is GameObject => o?.zone === "battlefield" && (o.zoneChanges ?? 0) === s.resolving!.affected!.find((a) => a.id === o.id)!.zc);
  if (ref.ref === "graveyardEnd")
    return players(s, ref.who, ctx)
      .map((pid) => graveyardEnd(s, pid, { ...(ref.filter ? { filter: ref.filter } : {}), ...(ref.bottom ? { bottom: true } : {}), ...(ref.only ? { only: true } : {}) }))
      .filter((o): o is GameObject => !!o);
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
    const whose = ref.of && players(s, ref.of, ctx);
    return s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== except && (!whose || whose.includes(controllerOf(s, o))) && objectMatches(s, filter, o, ctx.controller, false));
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
    case "enchantedPlayer": {
      // The player this Aura is attached to, or was as it last existed (CR 608.2h).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me) return [];
      const lk = s.lastKnown?.[me.id];
      const p = me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.attachedToPlayer : lk && lk.zc === ctx.sourceZc ? lk.attachedToPlayer : undefined;
      return p !== undefined && !player(s, p).lost ? [p] : [];
    }
    case "choseThisWay":
      return (s.resolving?.scratch?.mayers ?? []).filter((p) => !player(s, p).lost);
    case "punished":
      return (s.resolving?.scratch?.punished ?? []).filter((p) => !player(s, p).lost);
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
  ...(ctx.cause !== undefined ? { cause: ctx.cause } : {}),
  lki: ctx.lki,
  kicked: ctx.kicked,
  colorsSpent: ctx.colorsSpent,
  treasureSpent: ctx.treasureSpent,
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
        : // "Gains your choice of menace or lifelink": the keyword chosen as it resolved.
          m.kind === "addKeywords" && m.keywords.includes(CHOSEN_KEYWORD)
        ? { ...m, keywords: m.keywords.flatMap((k) => (k !== CHOSEN_KEYWORD ? [k] : s.resolving?.chosen?.keyword ? [s.resolving.chosen.keyword] : [])) }
        : // "Becomes the creature type of your choice": the type chosen as it resolved.
          (m.kind === "setSubtypes" || m.kind === "addTypes") && m.subtypes.includes(CHOSEN_TYPE)
          ? { ...m, subtypes: m.subtypes.flatMap((st) => (st !== CHOSEN_TYPE ? [st] : s.resolving?.chosen?.type ? [s.resolving.chosen.type] : [])) }
          : // "Becomes the basic land type of your choice", "becomes the color of your choice".
            m.kind === "setLandTypes" && m.subtypes.includes(CHOSEN_LAND_TYPE)
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
    case "preventNext":
    case "redirectNext":
    case "preventCombatDamage":
    case "noLifeGain":
    case "cantCast":
    case "noPrevention":
    case "pumpPerBlocker":
    case "draw":
    case "getEnergy":
    case "poison":
    case "becomeMonarch":
    case "extraLandThisTurn":
    case "ringTempts":
    case "increaseSpeed":
    case "ascend":
    case "gainLife":
    case "loseLife":
    case "addCombatMana":
    case "addMana":
    case "cantBlockRule":
    case "cantAttackRule":
    case "fight":
    case "bite":
    case "extraTurn":
    case "addPhases":
    case "loseGame":
    case "winGame":
      return runBasicsEffect(s, e, ctx, src);
    case "damageRule":
      return runPreventionEffect(s, e, ctx, src);
    case "returnToBattlefield":
    case "unearth":
    case "castFromExileFree":
    case "destroy":
    case "regenerate":
    case "exile":
    case "returnLinked":
    case "playLinked":
    case "cipher":
    case "haunt":
    case "grantFlashback":
    case "pick":
    case "sacrificeEach":
    case "empowerJace":
    case "bounce":
    case "putOntoBattlefield":
    case "randomFromGraveyard":
    case "chooseFromGraveyard":
    case "reorderGraveyard":
    case "returnAllFromGraveyard":
    case "putFromHand":
    case "putInLibrary":
    case "exileGraveyard":
    case "flicker":
    case "returnExiled":
    case "exileIfDies":
    case "noRegen":
    case "noCombatDamage":
    case "lookAtHand":
    case "sacrifice":
    case "exploit":
    case "champion":
    case "returnChampioned":
    case "soulbond":
    case "ninjutsu":
    case "impulse":
    case "madness":
    case "miracle":
    case "castFromHand":
    case "suspendTick":
    case "suspendCast":
    case "exileSelfWithTime":
    case "exileSpell":
    case "warpExile":
      return runZonesEffect(s, e, ctx, src);
    case "tap":
    case "suspect":
    case "untap":
    case "tapOrUntap":
    case "becomeSaddled":
    case "classLevel":
    case "removeFromCombat":
    case "earthbend":
    case "mustBlockSource":
    case "phaseOut":
    case "proliferate":
    case "amass":
    case "connive":
    case "recruit":
    case "skipUntap":
    case "counters":
    case "lastKnownCounters":
    case "endure":
    case "moveCounter":
    case "removeCounters":
    case "removeAllCounters":
    case "moveAllCounters":
    case "removeSelfCounter":
    case "renown":
    case "adapt":
    case "monstrosity":
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
    case "encore":
    case "createTokenCopy":
    case "createToken":
      return runTokensEffect(s, e, ctx, src);
    case "delayed":
    case "castCipher":
    case "copySpell":
    case "nextCast":
    case "cascade":
    case "discover":
    case "ripple":
    case "counterUnlessPays":
    case "counterCause":
    case "counterSpell":
    case "counterEach":
    case "changeTarget":
      return runSpellsEffect(s, e, ctx, src);
    case "mill":
    case "exileTop":
    case "revealTopToHand":
    case "discard":
    case "takeFromHand":
    case "scry":
    case "hideaway":
    case "clash":
    case "surveil":
    case "orderTop":
    case "handToTop":
    case "shuffle":
    case "shuffleIntoLibrary":
    case "shuffleSpell":
    case "shuffleZones":
    case "search":
    case "dig":
      return runLibraryEffect(s, e, ctx, src);
    case "venture":
    case "takeInitiative":
      return runDungeonsEffect(s, e, ctx, src);
    case "may":
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
  if (s.objects[id]?.zone === "graveyard") fireEvent(s, { type: "resolvedToGraveyard", id });
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
  if (o && o.zone === "battlefield") return { ...objectSource(s, o), controller: ctx.controller };
  // A spell is its own card on the stack; a gone permanent's ability, that permanent as it last existed (CR 609.7a).
  const item = s.resolving?.item;
  const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  const ref = spell ? { object: spell.id, zc: spell.zoneChanges ?? 0 } : ctx.sourceId ? { object: ctx.sourceId, zc: ctx.sourceZc ?? s.lastKnown?.[ctx.sourceId]?.zc ?? 0 } : undefined;
  return cardSource(ctx.sourceDef, ctx.controller, ref);
}

// The Ring tempts you (CR 701.54).

import { objIsType } from "../cards";
import { log, obj, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import { RING } from "../oracle";
import type { GameObject, GameState, ObjectId, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { fireEvent } from "./triggers";

/**
 * `pid`'s Ring-bearer: the creature they chose, while it's still that object on the battlefield under their control
 * (CR 701.54a, e). The designation ends when another player gains control of it, even if `pid` gets it back.
 */
export function ringBearer(s: GameState, pid: PlayerId): GameObject | undefined {
  const b = s.players[pid]?.ring?.bearer;
  const o = b && s.objects[b.id];
  if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== b.zc || controllerOf(s, o) !== pid) return undefined;
  return o;
}

/** Is `o` its controller's Ring-bearer? */
export function isRingBearer(s: GameState, o: GameObject): boolean {
  return ringBearer(s, controllerOf(s, o))?.id === o.id;
}

/** How many times the Ring has tempted `pid` this game. */
export function timesTempted(s: GameState, pid: PlayerId): number {
  return s.players[pid]?.ring?.tempted ?? 0;
}

/** Another player gained control of a Ring-bearer: it stops being one (CR 701.54a). */
export function loseRingBearer(s: GameState, id: ObjectId) {
  for (const pid of s.turnOrder) {
    const r = s.players[pid]!.ring;
    if (r?.bearer?.id === id) {
      r.bearer = undefined;
      invalidateCharacteristics(s);
    }
  }
}

/**
 * One of the abilities of `pid`'s Ring emblem (CR 701.54c), which triggers only once the Ring has tempted them
 * `index + 2` times. Its controller is the emblem's: `pid`. `subject`: the blocking creature.
 */
export function ringTrigger(s: GameState, pid: PlayerId, index: number, subject?: GameObject) {
  if (timesTempted(s, pid) < index + 2) return;
  s.cards[RING.oracleId] ??= RING;
  s.triggerQueue.push({
    sourceId: "",
    sourceCardId: RING.oracleId,
    controller: pid,
    index,
    ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
  });
}

/** The creatures `pid` can choose as their Ring-bearer. */
export function ringBearerOptions(s: GameState, pid: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
}

/**
 * "The Ring tempts you" (CR 701.54a, c): get the emblem if you don't have it, then choose a creature you control (you
 * must if you can, and it may be the one that already is) as your Ring-bearer. It tempts you even with no creature
 * to choose (CR 701.54d).
 */
export function ringTempts(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const pid = ctx.controller;
  const sc = (s.resolving!.scratch ??= {});
  let chosen: ObjectId | undefined;
  if (!sc.queue) {
    const options = ringBearerOptions(s, pid);
    if (options.length > 1) {
      sc.queue = [pid];
      sc.chosen = {};
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: "ringBearer", what: "creature to be your Ring-bearer", options, count: 1 };
      return "paused";
    }
    chosen = options[0];
  } else chosen = sc.chosen?.[pid]?.[0];
  temptWith(s, pid, chosen);
}

function temptWith(s: GameState, pid: PlayerId, chosen: ObjectId | undefined) {
  const p = player(s, pid);
  s.cards[RING.oracleId] ??= RING;
  const ring = (p.ring ??= { tempted: 0, timestamp: s.nextTimestamp++ });
  ring.tempted++;
  const o = chosen ? s.objects[chosen] : undefined;
  if (o) ring.bearer = { id: o.id, zc: o.zoneChanges ?? 0 };
  invalidateCharacteristics(s);
  log(s, `The Ring tempts ${p.name} (${ring.tempted} time${ring.tempted > 1 ? "s" : ""})${o ? `: ${s.cards[o.cardId]?.name ?? "a creature"} is their Ring-bearer` : ""}.`);
  fireEvent(s, { type: "ringTempted", player: pid, ...(o ? { chosen: o.id } : {}) });
}

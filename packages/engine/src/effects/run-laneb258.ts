// Lane B round B258's effects: Sorrow's Path (swapBlockers) and General Jarkeld (swapBlocked).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { blockersNeeded, blockProblem, blockQualities, clearCombat, log, maxBlocks, removeFromCombat } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameObject, GameState, ObjectId } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { blockByEffect } from "./run-laneb256";
import { defendingAgainst } from "./run-tokens";

type B258Effect = Extract<Effect, { type: "swapBlockers" | "swapBlocked" }>;

/** The attacking creatures `bl` is blocking now: still on the battlefield and still attacking (CR 506.4). */
function blockedBy(s: GameState, bl: GameObject): GameObject[] {
  return (bl.blocking ?? []).flatMap((id) => {
    const a = s.objects[id];
    return a && a.zone === "battlefield" && (a.attacking !== undefined || !!a.attackingPermanent) ? [a] : [];
  });
}

/** The creatures blocking `at` now, on the battlefield. */
function blockersOf(s: GameState, at: GameObject): GameObject[] {
  return (at.blockedBy ?? []).flatMap((id) => {
    const b = s.objects[id];
    return b && b.zone === "battlefield" ? [b] : [];
  });
}

/**
 * Whether `bl` could block `at` (Sorrow's Path's rulings): its evasion, protection and the other blocking restrictions (CR
 * 509.1b), whether `bl` is tapped, and abilities letting it block as though something were true (blockProblem); never
 * the costs to block, which apply only as blockers are declared (CR 509.1d). Only an attacker attacking its controller or
 * a planeswalker or battle that player defends (CR 509.1a, 802.4a in multiplayer).
 */
export function couldBlock(s: GameState, bl: GameObject, at: GameObject): boolean {
  return defendingAgainst(s, controllerOf(s, bl), at) && !blockProblem(s, bl, at);
}

/**
 * Sorrow's Path: `x` could block all the creatures `y` is blocking: each of them, and that many at once (CR 509.1a,
 * rulings: abilities that let a creature block several). With none left (they left combat), it could (rulings).
 */
export function couldBlockAll(s: GameState, x: GameObject, y: GameObject): boolean {
  const them = blockedBy(s, y);
  return them.length <= maxBlocks(s, x) && them.every((a) => couldBlock(s, x, a));
}

/**
 * General Jarkeld: `x` could be blocked by all the creatures blocking `y`, as a group (its blocking restrictions on how many
 * may block it, CR 509.1b: menace, "can't be blocked except by three or more", "by more than one"), each one able to block
 * it (couldBlock). With none, it could (nothing would block it).
 */
export function couldBeBlockedByAll(s: GameState, x: GameObject, y: GameObject): boolean {
  const them = blockersOf(s, y);
  if (!them.length) return true;
  if (them.length < blockersNeeded(s, x) || (them.length > 1 && characteristics(s, x).maxOneBlocker)) return false;
  return them.every((b) => couldBlock(s, b, x));
}

export function runLaneB258Effect(s: GameState, e: B258Effect, ctx: ResolveCtx, src: string): "paused" | void {
  // Both targets still legal (CR 608.2b: objects() leaves out an illegal one), or nothing is done: "each of those creatures"
  // can't be checked, and nothing could be swapped.
  const a = objects(s, e.a, ctx).find((o) => o.zone === "battlefield");
  const b = objects(s, e.b, ctx).find((o) => o.zone === "battlefield");
  if (!a || !b || a.id === b.id) {
    log(s, `${src} does nothing: one of its targets is gone.`);
    return;
  }
  const [na, nb] = [defOf(s, a).name, defOf(s, b).name];
  switch (e.type) {
    case "swapBlockers": {
      // A blocking creature stays one until it leaves combat (rulings), even with what it blocked gone.
      if (a.blocking === undefined || b.blocking === undefined || !couldBlockAll(s, a, b) || !couldBlockAll(s, b, a)) {
        log(s, `${src} does nothing: ${na} and ${nb} can't each block all the creatures the other is blocking.`);
        return;
      }
      const [la, lb] = [blockedBy(s, a), blockedBy(s, b)];
      // Removed from combat (CR 506.4); the attackers stay blocked creatures (CR 509.1h), so "becomes blocked" doesn't
      // trigger again, but "blocks" and "becomes blocked by a creature" do (rulings).
      for (const o of [a, b]) {
        removeFromCombat(s, o);
        clearCombat(o);
      }
      log(s, `${src} removes ${na} and ${nb} from combat.`);
      for (const at of lb) if (at.zone === "battlefield" && at.attacking !== undefined) blockByEffect(s, a, at, src, true);
      for (const at of la) if (at.zone === "battlefield" && at.attacking !== undefined) blockByEffect(s, b, at, src, true);
      // With nothing left to block, it was still removed from combat and blocks nothing (rulings).
      for (const [n, l] of [[na, lb], [nb, la]] as const) if (!l.length) log(s, `${n} doesn't block anything.`);
      invalidateCharacteristics(s);
      return;
    }
    case "swapBlocked": {
      if (a.attacking === undefined || b.attacking === undefined || !a.blockedBy || !b.blockedBy || !couldBeBlockedByAll(s, a, b) || !couldBeBlockedByAll(s, b, a)) {
        log(s, `${src} does nothing: ${na} and ${nb} can't each be blocked by all the creatures blocking the other.`);
        return;
      }
      // Each creature blocking exactly one of them stops blocking it and is blocking the other: no new block, so nothing
      // that triggers on blocking or becoming blocked does (rulings). One blocking both keeps blocking both.
      const [ba, bb] = [blockersOf(s, a), blockersOf(s, b)];
      const moved: string[] = [];
      const move = (bl: GameObject, from: GameObject, to: GameObject) => {
        if ((to.blockedBy ?? []).includes(bl.id)) return;
        bl.blocking = (bl.blocking ?? []).map((id: ObjectId) => (id === from.id ? to.id : id));
        from.blockedBy = (from.blockedBy ?? []).filter((id) => id !== bl.id);
        (to.blockedBy ??= []).push(bl.id);
        to.becameBlockedTurn = s.turn;
        // A block of this combat, for "blocked by only that creature this combat" (False Orders) and the like.
        ((s.turnLog ??= {}).blocks ??= []).push({ blocker: `${bl.id}@${bl.zoneChanges ?? 0}`, attacker: `${to.id}@${to.zoneChanges ?? 0}`, combat: s.combatsThisTurn ?? 0, ...blockQualities(s, bl, to), ac: controllerOf(s, to) });
        moved.push(`${defOf(s, bl).name} is now blocking ${defOf(s, to).name}`);
      };
      for (const bl of ba) if (!bb.includes(bl)) move(bl, a, b);
      for (const bl of bb) if (!ba.includes(bl)) move(bl, b, a);
      invalidateCharacteristics(s);
      log(s, moved.length ? `${src}: ${moved.join(", ")}.` : `${src}: no creature blocks only one of ${na} and ${nb}.`);
      return;
    }
  }
}



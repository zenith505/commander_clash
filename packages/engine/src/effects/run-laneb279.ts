// Lane B round B279's effects: Alaundo the Seer's time counters on cards in exile and the cast its granted trigger allows.
// Emblazoned Golem's kicker is paid in game.ts (spellCost, oneOfEachColorX) and mana.ts (payFromPool's distinct symbols).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { defMv } from "../faces";
import { countersRemoved, removableCounters } from "../counters";
import { freeCastable, log, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameObject, GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { fireEvent } from "./triggers";

type B279Effect = Extract<Effect, { type: "timeCounterFromOwnExiled" | "alaundoCast" }>;

/**
 * Alaundo the Seer: the card it exiled from a hand gets time counters equal to its mana value (none for 0, rulings) and
 * gains Alaundo's trigger while it stays this object in exile (CR 400.7). It doesn't gain suspend.
 */
export function alaundoExiled(s: GameState, o: GameObject): void {
  if (o.zone !== "exile") return;
  const n = defMv(defOf(s, o));
  if (n > 0) o.counters.time = (o.counters.time ?? 0) + n;
  o.alaundoCast = o.zoneChanges ?? 0;
  invalidateCharacteristics(s);
  log(s, `${defOf(s, o).name} is exiled with ${n ? `${n} time counter${n === 1 ? "" : "s"}` : "no time counters"} on it.`);
}

export function runLaneB279Effect(s: GameState, e: B279Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "timeCounterFromOwnExiled": {
      // "Remove a time counter from each other card you own in exile": each one with a time counter, however it got there
      // (suspended, foretold or face down too, rulings), but those this ability exiled. All at once; a card left with none
      // triggers what removing the last one does (suspend's cast, Alaundo's, CR 702.62a), after all of them.
      const mine = new Set((s.resolving?.exiledFromHandCards ?? []).map((x) => x.id));
      const ids = player(s, ctx.controller).exile.filter((id) => !mine.has(id) && (s.objects[id]?.counters.time ?? 0) > 0);
      const changed: string[] = [];
      const removed: string[] = [];
      const last: string[] = [];
      for (const id of ids) {
        const o = s.objects[id]!;
        if (removableCounters(s, o, "time") <= 0) continue;
        const left = (o.counters.time ?? 0) - 1;
        if (left > 0) o.counters.time = left;
        else delete o.counters.time;
        changed.push(o.faceDown ? "a face-down card" : defOf(s, o).name);
        removed.push(id);
        countersRemoved(s, o, "time", 1);
        if (left <= 0) last.push(id);
      }
      invalidateCharacteristics(s);
      if (changed.length) log(s, `${src}: a time counter is removed from ${changed.join(", ")}.`);
      for (const id of removed) fireEvent(s, { type: "timeCountersRemovedExiled", id, n: 1, by: ctx.controller });
      for (const id of last) fireEvent(s, { type: "lastCounterRemoved", id, counter: "time" });
      return;
    }
    case "alaundoCast": {
      // "If it's exiled" again as it resolves (CR 603.4), still the card that gained the ability (CR 400.7): its owner, who
      // controls the trigger (CR 113.8), may cast it free now, timing ignored (CR 608.2g, 601.2). A creature spell cast this
      // way gains haste until end of turn, the creature it becomes too (CR 400.7a).
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      sc.may = false;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, hasteEot: true };
      if (freeCastable(s, ctx.controller, o.id)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast; it stays in exile.`);
      return;
    }
  }
}

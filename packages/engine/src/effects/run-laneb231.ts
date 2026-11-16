// Lane B round B231's effects: Cyclopean Tomb (tombNote, tombLeaves, tombRemove).
import type { Effect } from "../abilities";
import { objIsType } from "../cards";
import { countersRemoved, removableCounters } from "../counters";
import { log, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { fireEvent } from "./triggers";

type B231Effect = Extract<Effect, { type: "tombNote" | "tombLeaves" | "tombRemove" }>;

/**
 * Cyclopean Tomb's lands still eligible for `key`'s delayed trigger: each land a mire counter was put onto with that Tomb
 * (CR 607.2a: "with ~", the Tomb as the object it was), still that object on the battlefield and a land (CR 400.7), whose
 * mire counters that trigger hasn't removed yet. One with no mire counter left is still one (rulings: the counters on it
 * needn't be the Tomb's).
 */
export function mireLands(s: GameState, key: string): ObjectId[] {
  const out: ObjectId[] = [];
  for (const l of s.mireTomb?.[key] ?? []) {
    if (l.removed) continue;
    const [id, zc] = l.land.split("@");
    const o = s.objects[id!];
    if (o?.zone === "battlefield" && String(o.zoneChanges ?? 0) === zc && objIsType(s, o, "Land") && !out.includes(o.id)) out.push(o.id);
  }
  return out;
}

export function runLaneB231Effect(s: GameState, e: B231Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "tombNote": {
      // "Put a mire counter on target non-Swamp land": only a land a mire counter was actually put onto (a replacement may
      // have put none, CR 122.6), as the object it is.
      if (!ctx.sourceId) return;
      const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      for (const c of s.resolving?.countersPutThisWay ?? []) {
        if (c.kind !== "mire") continue;
        const list = ((s.mireTomb ??= {})[key] ??= []);
        const land = `${c.id}@${c.zc}`;
        if (!list.some((l) => l.land === land)) list.push({ land });
      }
      return;
    }
    case "tombLeaves": {
      // The Tomb as it was on the battlefield (CR 603.10a: a leaves-the-battlefield ability looks back): its list, by the
      // object the trigger remembers, or the one just before it moved.
      if (!ctx.sourceId) return;
      const zc = ctx.sourceZc ?? 0;
      const key = s.mireTomb?.[`${ctx.sourceId}@${zc}`] ? `${ctx.sourceId}@${zc}` : `${ctx.sourceId}@${zc - 1}`;
      const tomb = s.objects[ctx.sourceId];
      if (!tomb) return;
      // "At the beginning of each of your upkeeps for the rest of the game" (CR 603.7): the trigger's controller's, even with
      // no land on the list (it then does nothing as it resolves).
      addDelayed(s, "eachYourUpkeep", ctx.controller, tomb, { targets: [], effects: [{ type: "tombRemove", key }], text: "remove all mire counters from a land that a mire counter was put onto with ~ but that a mire counter has not been removed from with ~" }, ctx.sourceDef.oracleId);
      return;
    }
    case "tombRemove": {
      // "Remove all mire counters from a land that a mire counter was put onto with ~ but that a mire counter has not been
      // removed from with ~": the trigger's controller chooses one such land as it resolves (CR 608.2d; rulings: whatever
      // put the mire counters on it now), and its mire counters are removed. Once one is removed this way, that land is done
      // with; one with none on it stays eligible. With no such land, nothing happens.
      const lands = mireLands(s, e.key);
      if (!lands.length) {
        log(s, `${src}: no land is left to remove mire counters from.`);
        return;
      }
      const sc = (s.resolving!.scratch ??= {});
      let pick = lands.find((id) => id === sc.mireLand?.pick);
      if (!pick && lands.length > 1 && !sc.mireLand) {
        sc.mireLand = {};
        s.pending = {
          kind: "chooseOption",
          player: ctx.controller,
          source: src,
          what: "mireLand",
          options: lands,
          labels: lands.map((id) => {
            const o = s.objects[id]!;
            return `${characteristics(s, o).name} (${player(s, controllerOf(s, o)).name}, ${o.counters.mire ?? 0} mire counter${(o.counters.mire ?? 0) === 1 ? "" : "s"})`;
          }),
          prompt: "choose a land to remove all mire counters from",
        };
        return "paused";
      }
      sc.mireLand = undefined;
      pick ??= lands[0]!;
      const o = s.objects[pick]!;
      const had = o.counters.mire ?? 0;
      const n = Math.min(removableCounters(s, o, "mire"), had);
      log(s, `${player(s, ctx.controller).name} chooses ${characteristics(s, o).name} (${src}).`);
      if (n <= 0) return;
      o.counters.mire = had - n;
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, o).name} loses ${n} mire counter${n > 1 ? "s" : ""}.`);
      countersRemoved(s, o, "mire", n);
      if (had === n) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "mire" });
      const land = `${o.id}@${o.zoneChanges ?? 0}`;
      for (const l of s.mireTomb?.[e.key] ?? []) if (l.land === land) l.removed = true;
      return;
    }
  }
}

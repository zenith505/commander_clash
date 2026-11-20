// Lane B round B277's effects: Lightning Storm (spellCounters). Its "choose a new target" is newTargets `ofSource`
// (run-spells.ts); Sacred Ground's trigger is a "dies" trigger with `causedByOpponent` (effects/triggers.ts).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B277Effect = Extract<Effect, { type: "spellCounters" }>;

export function runLaneB277Effect(s: GameState, e: B277Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "spellCounters": {
      // The spell this ability is on, still on the stack as the same object (CR 400.7): the counters go on it (CR 122.1).
      // Nothing that changes counters put on permanents or players applies to a spell (it's neither, CR 110.1).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "stack" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc) || !s.stack.some((x) => x.kind === "spell" && x.objectId === o.id)) {
        log(s, `${src} is no longer on the stack, so nothing gets counters.`);
        return;
      }
      o.counters[e.counter] = (o.counters[e.counter] ?? 0) + e.n;
      log(s, `${defOf(s, o).name} gets ${e.n === 1 ? "a" : e.n} ${e.counter} counter${e.n === 1 ? "" : "s"} (now ${o.counters[e.counter]}).`);
      return;
    }
  }
}

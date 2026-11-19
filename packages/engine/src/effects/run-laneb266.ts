// Lane B round B266's effects: Power Pack's delayed free cast (delayedCastExiledTarget).
import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";

type B266Effect = Extract<Effect, { type: "delayedCastExiledTarget" }>;

export function runLaneB266Effect(s: GameState, e: B266Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "delayedCastExiledTarget": {
      // Power Pack: "that card" is the card this ability just exiled, the new object in exile (CR 400.7, 610.3); none if the
      // target was illegal (CR 608.2b) or the exile was replaced. The delayed trigger is about it (CR 603.7c).
      const t = ctx.targets[e.index];
      if (t?.kind !== "object" || !ctx.legal[e.index]) return;
      const o = s.objects[t.id];
      if (!o || o.zone !== "exile" || (t.zc !== undefined && (o.zoneChanges ?? 0) !== t.zc + 1)) return;
      // Its source is Power Pack's (CR 603.7d), as it is now.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      addDelayed(s, "yourNextUpkeep", ctx.controller, o, { targets: [], effects: [{ type: "castFromExileFree", exileAfter: true }], text: e.text.replace(/^At the beginning of your next upkeep, ./, (m) => m.slice(-1).toUpperCase()) }, me ? cardIdOf(me) : cardIdOf(o));
      log(s, `${src}: ${defOf(s, o).name} can be cast at the beginning of the next upkeep of its controller.`);
      return;
    }
  }
}

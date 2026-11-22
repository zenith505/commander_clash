// Lane B round B296's effects: Havengul Mystery's link to the creature it put onto the battlefield (putWithLink).
import type { Effect } from "../abilities";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B296Effect = Extract<Effect, { type: "putWithLink" }>;

export function runLaneB296Effect(s: GameState, e: B296Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "putWithLink": {
      // "Return target creature card from your graveyard to the battlefield": the permanent it became (a new object, CR
      // 400.7) is one "put onto the battlefield with" this source (CR 607.2c), linked to the object the source was as the
      // ability triggered, whichever face it has up later (607.1b). None if the target was illegal or it didn't get there.
      if (!ctx.sourceId) return;
      const t = ctx.targets[e.target];
      const c = ctx.legal[e.target] && t?.kind === "object" ? s.objects[t.id] : undefined;
      if (!c || c.zone !== "battlefield") return;
      const zc = ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0;
      ((s.putWith ??= {})[`${ctx.sourceId}@${zc}`] ??= []).push({ id: c.id, zc: c.zoneChanges ?? 0 });
      return;
    }
  }
}

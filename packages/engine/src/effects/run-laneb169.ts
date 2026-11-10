// Lane B round B169's effects.
import type { Effect } from "../abilities";
import { gainLife, log, loseLife, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B169Effect = Extract<Effect, { type: "loseAllBut" | "gainLinkedLifeLost" }>;

export function runLaneB169Effect(s: GameState, e: B169Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "loseAllBut": {
      // Soulgorger Orgg: down to `keep` life, a life loss (not a payment); with that much or less, none. What was lost, as
      // it was actually lost (none if the player can't lose life, CR 119.8), is noted for the source as the object it is
      // (CR 607.2e), for its leaves ability.
      const p = player(s, ctx.controller);
      const before = p.life;
      if (before > e.keep) loseLife(s, ctx.controller, before - e.keep);
      const lost = Math.max(0, before - p.life);
      if (ctx.sourceId !== undefined) (s.linkedLifeLost ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] = lost;
      log(s, lost ? `${p.name} loses ${lost} life (${src}).` : `${p.name} loses no life (${src}).`);
      return;
    }
    case "gainLinkedLifeLost": {
      // The leaves ability triggered after the source moved: its enters ability was about the object before (CR 400.7).
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const n = s.linkedLifeLost?.[key] ?? 0;
      if (s.linkedLifeLost && key in s.linkedLifeLost) delete s.linkedLifeLost[key];
      if (n > 0) {
        log(s, `${player(s, ctx.controller).name} gains ${n} life (${src}).`);
        gainLife(s, ctx.controller, n);
      }
      else log(s, `${src}: no life was lost when it entered, so none is gained.`);
      return;
    }
  }
}

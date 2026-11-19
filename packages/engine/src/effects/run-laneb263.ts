// Lane B round B263's effects: Guardian Angel (payShieldGrant).
import type { Effect } from "../abilities";
import { log, player } from "../game";
import { grantPayShield } from "../pay-shields";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B263Effect = Extract<Effect, { type: "payShieldGrant" }>;

export function runLaneB263Effect(s: GameState, e: B263Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "payShieldGrant": {
      // Guardian Angel: "that permanent or player" is its target as it resolves (CR 608.2b: none if it's illegal now), the
      // permanent as the object it is now (CR 400.7). Its controller may pay any time they have priority this turn.
      const t = ctx.targets[e.index];
      if (!t || !ctx.legal[e.index]) return;
      if (t.kind === "player") {
        if (player(s, t.id).lost) return;
        grantPayShield(s, ctx.controller, { player: t.id }, e.cost, e.n, src);
        log(s, `${src}: until end of turn, ${player(s, ctx.controller).name} may pay ${e.cost} any time to prevent the next ${e.n} more damage to ${player(s, t.id).name}.`);
        return;
      }
      if (t.kind !== "object") return;
      const o = s.objects[t.id];
      if (!o || o.zone !== "battlefield") return;
      grantPayShield(s, ctx.controller, { object: o.id, zc: o.zoneChanges ?? 0 }, e.cost, e.n, src);
      log(s, `${src}: until end of turn, ${player(s, ctx.controller).name} may pay ${e.cost} any time to prevent the next ${e.n} more damage to it.`);
      return;
    }
  }
}

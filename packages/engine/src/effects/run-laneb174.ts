// Lane B round B174's effects.
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B174Effect = Extract<Effect, { type: "yourCreaturesUnblockedThisTurn" }>;

export function runLaneB174Effect(s: GameState, e: B174Effect, ctx: ResolveCtx, _src: string): "paused" | void {
  switch (e.type) {
    case "yourCreaturesUnblockedThisTurn": {
      // Predatory Focus (CR 510.1c, rulings): chosen now, for the rest of the turn; game.ts unblockedByTurnChoice.
      const list = ((s.turnLog ??= {}).unblockedDamage ??= []);
      if (!list.includes(ctx.controller)) list.push(ctx.controller);
      log(s, `Creatures ${player(s, ctx.controller).name} controls assign their combat damage this turn as though they weren't blocked.`);
      return;
    }
  }
}

// Lane B round B221's effects: Storyweave (nextEntersCounters).
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B221Effect = Extract<Effect, { type: "nextEntersCounters" }>;

export function runLaneB221Effect(s: GameState, e: B221Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "nextEntersCounters": {
      // Storyweave: a replacement effect waiting for the next event this turn in which permanents of these types enter under
      // this player's control (CR 614.1c); game.ts moveObject applies it, then it's used up (enterTogether).
      (s.nextEntersCounters ??= []).push({ controller: ctx.controller, types: [...e.allTypes], counter: e.counter, n: e.n, turn: s.turn, source: src });
      log(s, `The next time one or more ${e.allTypes.map((t) => t.toLowerCase()).join(" ")}s ${player(s, ctx.controller).name} controls enter this turn, each enters with ${e.n} additional ${e.counter} counters.`);
      return;
    }
  }
}

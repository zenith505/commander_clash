// Lane B round B304's effects: an instruction about cards from outside the game, which does nothing in Commander.
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B304Effect = Extract<Effect, { type: "outsideGame" }>;

export function runLaneB304Effect(s: GameState, e: B304Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "outsideGame":
      // "Parts of abilities which bring other traditional card(s) you own from outside the game into the game ... do not
      // function in Commander" (Commander format rule 10); nor is there a sideboard here (CR 100.4, 400.11a). Nothing
      // happens; the log says why, so the line isn't silently skipped.
      log(s, `${src}: ${player(s, ctx.controller).name} has no cards outside the game in Commander ("${e.text}" does nothing).`);
      return;
  }
}

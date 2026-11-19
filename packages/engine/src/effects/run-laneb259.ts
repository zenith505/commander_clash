// Lane B round B259's effects: Divine Intervention's "the game is a draw" (gameIsDraw).
import type { Effect } from "../abilities";
import { drawGame } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B259Effect = Extract<Effect, { type: "gameIsDraw" }>;

export function runLaneB259Effect(s: GameState, e: B259Effect, _ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    // CR 104.4c: an effect says the game is a draw; it ends at once (CR 104.1), no player winning or losing (rulings).
    case "gameIsDraw":
      drawGame(s, src);
      return;
  }
}

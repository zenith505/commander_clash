// Lane B round B254's effects: Peace Talks (peaceTalks).
import type { Effect } from "../abilities";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B254Effect = Extract<Effect, { type: "peaceTalks" }>;

export function runLaneB254Effect(s: GameState, e: B254Effect, _ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "peaceTalks": {
      // "This turn and next turn": exactly two turns, whoever takes them (rulings: a player with two turns in a row, or an
      // extra turn, is affected twice; in multiplayer, not a full round of turns). Rules for those turns (CR 611.2a), so a
      // creature or permanent that arrives later is covered too.
      s.peaceTalksTurns = [...new Set([...(s.peaceTalksTurns ?? []).filter((t) => t >= s.turn), s.turn, s.turn + 1])];
      log(s, `${src}: this turn and next turn, creatures can't attack, and players and permanents can't be the targets of spells or activated abilities.`);
      return;
    }
  }
}

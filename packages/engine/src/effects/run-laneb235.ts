// Lane B round B235's effects: Whippoorwill (damageUnalterable).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";

type B235Effect = Extract<Effect, { type: "damageUnalterable" }>;

export function runLaneB235Effect(s: GameState, e: B235Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "damageUnalterable": {
      // Whippoorwill: for the rest of the turn, damage that would be dealt to it can't be prevented (CR 615.12) or dealt
      // instead to another permanent or player (CR 614.9); it's the object it is now (CR 400.7), so a new object it becomes
      // later isn't affected (game.ts moveObject clears it). damage.ts damageUnalterableTo reads it.
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        o.damageUnalterableTurn = s.turn;
        log(s, `Damage that would be dealt to ${defOf(s, o).name} this turn can't be prevented or redirected (${src}).`);
      }
      return;
    }
  }
}

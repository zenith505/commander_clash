// Lane B round B250's effects: Gather Specimens (gatherSpecimens).
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B250Effect = Extract<Effect, { type: "gatherSpecimens" }>;

export function runLaneB250Effect(s: GameState, e: B250Effect, ctx: ResolveCtx, src: string): void {
  switch (e.type) {
    case "gatherSpecimens": {
      // "If a creature would enter the battlefield under an opponent's control this turn, it enters under your control
      // instead.": a replacement for the rest of this turn (CR 614.1c), whatever becomes of the spell; one of its own for
      // each time it resolves (CR 614.5). Creatures already on the battlefield stay where they are (rulings). See gather.ts.
      const live = (s.gatherSpecimens ?? []).filter((g) => g.turn === s.turn);
      s.gatherSpecimens = [...live, { id: `g${s.nextId++}`, player: ctx.controller, turn: s.turn, source: src }];
      log(s, `This turn, creatures that would enter under ${player(s, ctx.controller).name}'s opponents' control enter under ${player(s, ctx.controller).name}'s control instead (${src}).`);
      return;
    }
  }
}

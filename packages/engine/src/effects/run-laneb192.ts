// Lane B round B192's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, obj, player } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";

type B192Effect = Extract<Effect, { type: "exileSelfAndTopOneOf" }>;

export function runLaneB192Effect(s: GameState, e: B192Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileSelfAndTopOneOf": {
      // Flameskull: the card in the graveyard it went to as it died, while it's still that object (CR 400.7: a card that
      // left the graveyard and came back is a new one, and nothing is exiled, rulings). Then, only if it was exiled, the top
      // card of your library. Both face up (CR 406.3); one permission for the two (the reminder text: casting Flameskull
      // this way means you can't play the other card, and vice versa), until the end of your next turn (CR 611.2b).
      const p = player(s, ctx.controller);
      const me = objects(s, { ref: "selfCard" }, ctx).find((o) => o.zone === "graveyard");
      if (!me) return void log(s, `${src} isn't in the graveyard any more: nothing is exiled.`);
      moveObject(s, me.id, "exile");
      if (obj(s, me.id).zone !== "exile") return;
      const ids = [me.id, ...p.library.slice(0, 1)];
      if (ids.length > 1) moveObject(s, ids[1]!, "exile");
      const oneOf = `g${s.nextId++}`;
      const exiled = ids.filter((id) => obj(s, id).zone === "exile");
      for (const id of exiled) {
        const o = obj(s, id);
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "nextTurn", turn: s.turn, oneOf };
      }
      if (s.resolving) (s.resolving.impulsed ??= []).push(...exiled);
      log(s, `${p.name} exiles ${exiled.map((id) => defOf(s, obj(s, id)).name).join(" and ")} and may play ${exiled.length === 1 ? "it" : "one of them"} until the end of their next turn.`);
      return;
    }
  }
}

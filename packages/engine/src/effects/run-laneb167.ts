// Lane B round B167's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B167Effect = Extract<Effect, { type: "exileAnyOfTop" }>;

export function runLaneB167Effect(s: GameState, e: B167Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileAnyOfTop": {
      // Ancestral Knowledge: the top N cards (all of them if fewer), any number exiled and the rest back on top in the order
      // chosen (CR 401.4).
      const p = player(s, ctx.controller);
      const r = s.resolving!;
      const arranged = r.scratch?.arranged;
      if (!arranged) {
        const cards = p.library.slice(0, e.n);
        if (!cards.length) return;
        s.pending = { kind: "arrangeTop", player: p.id, how: "exile", cards, source: src };
        return "paused";
      }
      const looked = new Set([...arranged.top, ...arranged.away]);
      p.library = [...arranged.top, ...p.library.filter((id) => !looked.has(id))];
      for (const id of arranged.away) moveObject(s, id, "exile");
      const names = arranged.away.map((id) => defOf(s, s.objects[id]!).name);
      log(s, `${p.name} looks at the top ${looked.size} cards of their library${names.length ? ` and exiles ${names.join(", ")}` : ""}, putting ${arranged.top.length} back on top.`);
      return;
    }
  }
}

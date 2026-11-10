// Round 330's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, nameOf, player } from "../game";
import { controllerOf } from "../layers";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";

type R330Effect = Extract<Effect, { type: "controllersMayExile" }>;

export function runRound330Effect(s: GameState, e: R330Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "controllersMayExile": {
      // Disorienting Choice: each chosen permanent's controller decides as it resolves, the next player in turn order
      // after its controller first, then the others in turn order, each seeing the earlier answers; then those chosen
      // are exiled at the same time (rulings). A permanent that's no longer a legal target isn't asked about (CR 608.2b).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.mayExile) {
        const order = s.turnOrder;
        const start = order.indexOf(ctx.controller);
        const seat = (pid: number) => (order.indexOf(pid) - start - 1 + order.length) % order.length;
        const chosen = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield");
        chosen.sort((a, b) => seat(controllerOf(s, a)) - seat(controllerOf(s, b)));
        sc.mayExile = { queue: chosen.map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 })), yes: [] };
      }
      const st = sc.mayExile;
      while (st.queue.length) {
        const { id, zc } = st.queue[0]!;
        const o = s.objects[id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== zc) {
          st.queue.shift();
          continue;
        }
        const pid = controllerOf(s, o);
        if (sc.may === undefined) {
          s.pending = { kind: "chooseMay", player: pid, prompt: `exile ${nameOf(s, id)}`, source: src, otherwise: `If you don't, ${player(s, ctx.controller).name} may search for a land card for it.` };
          return "paused";
        }
        if (sc.may) st.yes.push({ id, zc });
        sc.may = undefined;
        st.queue.shift();
      }
      for (const { id, zc } of st.yes) {
        const o = s.objects[id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== zc) continue;
        log(s, `${src} exiles ${defOf(s, o).name}.`);
        moveObject(s, id, "exile");
      }
      sc.mayExile = undefined;
      return;
    }
  }
}

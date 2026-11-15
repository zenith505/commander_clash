// Lane B round B212's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, player } from "../game";
import { controllerOf } from "../layers";
import type { GameState } from "../types";
import { apnap, objects, runEffect, type ResolveCtx } from "./resolve";

type B212Effect = Extract<Effect, { type: "bounceUnlessDraw" }>;

export function runLaneB212Effect(s: GameState, e: B212Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "bounceUnlessDraw": {
      // Decoy Gambit: each target still legal (one that changed controller isn't, CR 608.2b, rulings); its controller
      // chooses, the active player first if it's an opponent, then the others in turn order, knowing the earlier choices.
      // After all the choices you draw that many cards, then the creatures not paid for are returned at once (rulings).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.decoy) {
        const ref = e.what;
        const n = ref.ref === "target" ? (ref.n ?? 1) : 0;
        const found: { pid: number; id: string; zc: number }[] = [];
        for (let j = 0; ref.ref === "target" && j < n; j++) {
          const o = objects(s, { ref: "target", index: ref.index + j }, ctx).find((x) => x.zone === "battlefield");
          if (o) found.push({ pid: controllerOf(s, o), id: o.id, zc: o.zoneChanges ?? 0 });
        }
        const order = apnap(s, [...new Set(found.map((f) => f.pid))]);
        sc.decoy = { queue: order.flatMap((pid) => found.filter((f) => f.pid === pid)), draws: 0, back: [], step: 0 };
      }
      const st = sc.decoy;
      const you = player(s, ctx.controller).name;
      while (st.queue.length) {
        const q = st.queue[0]!;
        const o = s.objects[q.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== q.zc || player(s, q.pid).lost) {
          st.queue.shift();
          continue;
        }
        if (sc.may === undefined) {
          s.pending = { kind: "chooseMay", player: q.pid, prompt: `have ${you} draw a card`, source: src, card: q.id, otherwise: `If you don't, ${defOf(s, o).name} returns to its owner's hand.` };
          return "paused";
        }
        if (sc.may) {
          st.draws++;
          log(s, `${player(s, q.pid).name} has ${you} draw a card.`);
        } else {
          st.back.push({ id: q.id, zc: q.zc });
          log(s, `${player(s, q.pid).name} lets ${defOf(s, o).name} return.`);
        }
        sc.may = undefined;
        st.queue.shift();
      }
      if (st.step === 0) {
        st.step = 1;
        if (st.draws > 0 && runEffect(s, { type: "draw", who: { ref: "you" }, n: st.draws }, ctx) === "paused") return "paused";
      } else if (st.step === 1 && st.draws > 0 && runEffect(s, { type: "draw", who: { ref: "you" }, n: st.draws }, ctx) === "paused") return "paused";
      st.step = 2;
      for (const b of st.back) {
        const o = s.objects[b.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== b.zc) continue;
        log(s, `${src} returns ${defOf(s, o).name} to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      sc.decoy = undefined;
      return;
    }
  }
}

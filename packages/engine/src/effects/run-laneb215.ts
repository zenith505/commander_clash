// Lane B round B215's effects.
import type { Effect } from "../abilities";
import { destroyPermanent, log, nameOf, obj, payableLife, payLife, player } from "../game";
import type { GameState, ObjectId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { objectMatches } from "./targeting";

type B215Effect = Extract<Effect, { type: "eachLandUnlessAnyPaysLife" }>;

export function runLaneB215Effect(s: GameState, e: B215Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "eachLandUnlessAnyPaysLife": {
      // Cleansing: each player in turn order from the active player (CR 101.4), each seeing the choices before theirs,
      // picks any of the lands not paid for yet and pays the life for each as they choose, no more than they can pay
      // (CR 119.4, 119.8); then the lands no one paid for are destroyed at the same time.
      const lands = () => s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      const st = (sc.cleansing ??= { queue: apnap(s, s.turnOrder.filter((p) => !player(s, p).lost)), saved: [] });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        // The answer to the pick it asked for: those lands are paid for, the life paid now.
        const picked = sc.chosen?.[pid];
        if (picked) {
          sc.chosen = undefined;
          st.queue.shift();
          const ids = picked.filter((id) => s.objects[id]?.zone === "battlefield" && !st.saved.includes(id));
          if (ids.length) {
            payLife(s, pid, e.life * ids.length);
            st.saved.push(...ids);
            log(s, `${player(s, pid).name} pays ${e.life * ids.length} life for ${ids.map((id) => nameOf(s, id)).join(", ")}.`);
          }
          continue;
        }
        const options = lands().filter((id) => !st.saved.includes(id));
        const max = e.life > 0 ? Math.min(options.length, Math.floor(Math.max(0, payableLife(s, pid)) / e.life)) : options.length;
        if (!options.length || max === 0) {
          st.queue.shift();
          continue;
        }
        sc.queue = [pid];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "keep", what: e.filter.text, options, count: max, min: 0, payLife: e.life, prompt: `click the lands (anyone's) you pay ${e.life} life for, up to ${max}. Each land no player pays for is destroyed.` };
        return "paused";
      }
      const gone: ObjectId[] = lands().filter((id) => !st.saved.includes(id));
      sc.cleansing = undefined;
      for (const id of gone) if (s.objects[id]?.zone === "battlefield") destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
      return;
    }
  }
}

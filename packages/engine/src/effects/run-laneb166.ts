// Lane B round B166's effects.
import type { Effect } from "../abilities";
import { putCounters } from "../counters";
import { log } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B166Effect = Extract<Effect, { type: "counterKindsBribe" }>;

export function runLaneB166Effect(s: GameState, e: B166Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "counterKindsBribe": {
      // Bribe Taker: the kinds of counter on permanents you control as this begins to resolve, each once however many of
      // it there are (rulings, CR 122.1), each its own choice: a +1/+1 counter, one of that kind, or none ("you may").
      // The counters are put on ~ together once every kind is chosen; one that has left the battlefield gets none.
      const you = ctx.controller;
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.bribe) {
        const kinds = new Set<string>();
        for (const id of s.battlefield) {
          const o = s.objects[id]!;
          if (controllerOf(s, o) !== you) continue;
          for (const [k, n] of Object.entries(o.counters)) if ((n ?? 0) > 0) kinds.add(k);
        }
        if (!kinds.size) return;
        sc.bribe = { kinds: [...kinds].sort(), picks: {} };
      }
      const st = sc.bribe;
      const kind = st.kinds.find((k) => st.picks[k] === undefined);
      if (kind !== undefined) {
        const plus = kind === "+1/+1";
        s.pending = {
          kind: "chooseOption",
          player: you,
          source: src,
          what: "bribeCounter",
          options: plus ? ["plus", "none"] : ["plus", "kind", "none"],
          labels: plus ? ["Put a +1/+1 counter on it", "No counter"] : ["Put a +1/+1 counter on it", `Put a ${kind} counter on it`, "No counter"],
          counterKind: kind,
          ...(ctx.sourceId ? { about: ctx.sourceId } : {}),
          prompt: `for the ${kind} counters on permanents you control: put a +1/+1 counter${plus ? "" : ` or a ${kind} counter`} on ${src}?`,
        };
        return "paused";
      }
      sc.bribe = undefined;
      const self = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!self || self.zone !== "battlefield" || (ctx.sourceZc !== undefined && (self.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const put: string[] = [];
      for (const k of st.kinds) {
        const pick = st.picks[k];
        if (pick === "none" || pick === undefined) continue;
        const counter = pick === "plus" ? "+1/+1" : k;
        const n = putCounters(s, self, counter, 1);
        if (n) put.push(`${n} ${counter}`);
      }
      invalidateCharacteristics(s);
      log(s, `${src}: ${characteristics(s, self).name} ${put.length ? `gets ${put.join(", ")} counter${put.length === 1 && put[0]!.startsWith("1 ") ? "" : "s"}` : "gets no counters"}.`);
      return;
    }
  }
}

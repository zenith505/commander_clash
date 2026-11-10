// Lane B round B168's effects.
import type { Effect } from "../abilities";
import { putCounters } from "../counters";
import { log } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B168Effect = Extract<Effect, { type: "counterKindsOnEither" }>;

export function runLaneB168Effect(s: GameState, e: B168Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "counterKindsOnEither": {
      // Exotic Pets: the kinds of counter among creatures you control once the tokens exist (they have none), each kind
      // once however many of it there are (CR 122.1); for each, one counter of that kind on the token you choose among
      // those the effect before created that are still on the battlefield (no choice with only one).
      const you = ctx.controller;
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const tokens = () => (sc.pets?.tokens ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
      if (!sc.pets) {
        const made = (r.created ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
        if (!made.length) return;
        const kinds = new Set<string>();
        for (const id of s.battlefield) {
          const o = s.objects[id]!;
          if (controllerOf(s, o) !== you || !characteristics(s, o).types.includes("Creature")) continue;
          for (const [k, n] of Object.entries(o.counters)) if ((n ?? 0) > 0) kinds.add(k);
        }
        if (!kinds.size) return;
        sc.pets = { tokens: made, kinds: [...kinds].sort(), picks: {} };
      }
      const st = sc.pets;
      for (const kind of st.kinds) {
        if (st.picks[kind] !== undefined) continue;
        const left = tokens();
        if (!left.length) break;
        if (left.length === 1) {
          st.picks[kind] = left[0]!;
          continue;
        }
        s.pending = {
          kind: "chooseOption",
          player: you,
          source: src,
          what: "eitherToken",
          options: left,
          labels: left.map((id, i) => `${characteristics(s, s.objects[id]!).name} ${i + 1}`),
          counterKind: kind,
          prompt: `choose the token that gets a ${kind} counter`,
        };
        return "paused";
      }
      sc.pets = undefined;
      const put: string[] = [];
      for (const kind of st.kinds) {
        const id = st.picks[kind];
        const o = id ? s.objects[id] : undefined;
        if (!o || o.zone !== "battlefield") continue;
        const n = putCounters(s, o, kind, 1);
        if (n) put.push(`a ${kind} counter on ${characteristics(s, o).name} ${st.tokens.indexOf(o.id) + 1}`);
      }
      invalidateCharacteristics(s);
      if (put.length) log(s, `${src}: ${put.join(", ")}.`);
      return;
    }
  }
}

// Lane B round B222's effects: Equipoise (phaseOutExcess).
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { log, obj, player } from "../game";
import { controllerOf } from "../layers";
import { phaseOut } from "../phasing";
import type { GameState, PlayerId } from "../types";
import { players, type ResolveCtx } from "./resolve";

type B222Effect = Extract<Effect, { type: "phaseOutExcess" }>;

export function runLaneB222Effect(s: GameState, e: B222Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "phaseOutExcess": {
      // Equipoise: for each type in turn, the target player's permanents of it beyond the number this ability's controller
      // controls; that many of theirs are chosen by this ability's controller as it resolves, then phase out (CR 702.26b)
      // before the next type is counted (rulings). Phased-out permanents are treated as though they don't exist (CR 702.26b),
      // so they aren't counted. With yourself as the target, there's never an excess.
      const [who] = players(s, e.who, ctx);
      const me = ctx.controller;
      const done = () => {
        sc.excessPass = undefined;
        sc.queue = undefined;
        sc.chosen = undefined;
      };
      if (who === undefined || player(s, who).lost) return done();
      const of = (type: string, pid: PlayerId) => s.battlefield.filter((id) => objIsType(s, obj(s, id), type) && controllerOf(s, obj(s, id)) === pid);
      const plural = (type: string, n: number) => `${type.toLowerCase()}${n === 1 ? "" : "s"}`;
      const names = (ids: string[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      for (let i = sc.excessPass ?? 0; i < e.types.length; i++) {
        const type = e.types[i]!;
        const theirs = of(type, who);
        if (sc.excessPass === i && sc.chosen?.[me] !== undefined) {
          const picked = sc.chosen[me]!.filter((id) => theirs.includes(id));
          sc.chosen = undefined;
          sc.queue = undefined;
          sc.excessPass = undefined;
          if (picked.length) phaseOut(s, picked);
          continue;
        }
        const excess = who === me ? 0 : theirs.length - of(type, me).length;
        if (excess <= 0) continue;
        if (excess >= theirs.length) {
          log(s, `${src}: ${player(s, who).name} controls ${excess} more ${plural(type, excess)} than ${player(s, me).name}: ${names(theirs)}.`);
          phaseOut(s, theirs);
          continue;
        }
        sc.excessPass = i;
        sc.queue = [me];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: me, source: src, action: "choose", what: `${plural(type, 2)} ${player(s, who).name} controls`, options: theirs, count: excess, prompt: `${player(s, who).name} controls ${excess} more ${plural(type, excess)} than you: choose ${excess} of their ${plural(type, 2)} to phase out` };
        return "paused";
      }
      return done();
    }
  }
}

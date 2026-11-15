// Lane B round B220's effects: Cultural Exchange (exchangeGroups).
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { log, obj, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, PlayerId } from "../types";
import { players, type ResolveCtx } from "./resolve";

type B220Effect = Extract<Effect, { type: "exchangeGroups" }>;

export function runLaneB220Effect(s: GameState, e: B220Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "exchangeGroups": {
      // Cultural Exchange: both target players still legal (CR 608.2b: without the other one, the creatures can't all be
      // exchanged, and no part of it happens, CR 701.12a). Its controller chooses as it resolves: any number of the first
      // player's creatures, then the same number of the second's, so no more than the second has (CR 608.2c); then all of
      // them change hands at once, for good (CR 701.12b, 611.2a).
      const [a] = players(s, e.a, ctx);
      const [b] = players(s, e.b, ctx);
      const done = () => {
        sc.queue = undefined;
        sc.chosen = undefined;
        sc.exchange = undefined;
      };
      if (a === undefined || b === undefined || a === b || player(s, a).lost || player(s, b).lost) return done();
      const creaturesOf = (pid: PlayerId) => s.battlefield.filter((id) => !s.phasedOut?.includes(id) && objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === pid);
      const x = (sc.exchange ??= {});
      const me = ctx.controller;
      const name = (pid: PlayerId) => (pid === me ? "you control" : `${player(s, pid).name} controls`);
      if (x.first === undefined) {
        if (sc.chosen?.[me] !== undefined) {
          x.first = sc.chosen[me]!;
          sc.chosen = undefined;
        } else {
          const mine = creaturesOf(a);
          const max = Math.min(mine.length, creaturesOf(b).length);
          if (!max) x.first = [];
          else {
            sc.queue = [me];
            sc.chosen = {};
            s.pending = { kind: "pickPermanents", player: me, source: src, action: "choose", what: `creatures ${name(a)}`, options: mine, count: max, min: 0, prompt: `choose any number of creatures ${name(a)} (at most ${max}, as many as ${name(b).replace(/ controls?$/, "")} ${b === me ? "control" : "controls"}): they're exchanged for as many creatures ${name(b)}` };
            return "paused";
          }
        }
      }
      const first = x.first.filter((id) => s.objects[id]?.zone === "battlefield" && controllerOf(s, obj(s, id)) === a);
      if (!first.length) {
        log(s, `${src}: no creatures are exchanged.`);
        return done();
      }
      if (x.second === undefined) {
        if (sc.chosen?.[me] !== undefined) {
          x.second = sc.chosen[me]!;
          sc.chosen = undefined;
        } else {
          const theirs = creaturesOf(b);
          sc.queue = [me];
          sc.chosen = {};
          s.pending = { kind: "pickPermanents", player: me, source: src, action: "choose", what: `creatures ${name(b)}`, options: theirs, count: first.length, prompt: `choose ${first.length} creature${first.length === 1 ? "" : "s"} ${name(b)} to exchange for ${first.map((id) => defOf(s, obj(s, id)).name).join(", ")}` };
          return "paused";
        }
      }
      const second = x.second.filter((id) => s.objects[id]?.zone === "battlefield" && controllerOf(s, obj(s, id)) === b);
      done();
      if (second.length !== first.length) return;
      const base = { sourceName: src, sourceId: ctx.sourceId, duration: "game" as const };
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: b, ...base, affected: first, mods: [{ kind: "control" }] });
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: a, ...base, affected: second, mods: [{ kind: "control" }] });
      invalidateCharacteristics(s);
      const names = (ids: string[]) => ids.map((id) => defOf(s, obj(s, id)).name).join(", ");
      log(s, `${player(s, a).name} and ${player(s, b).name} exchange control of ${names(first)} and ${names(second)}.`);
      return;
    }
  }
}

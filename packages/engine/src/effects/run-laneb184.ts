// Lane B round B184's effects.
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { putCounters, withPutter } from "../counters";
import { log, obj, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { apnap, players } from "./resolve";
import { objectMatches } from "./targeting";

type B184Effect = Extract<Effect, { type: "playersPutCounterEach" | "keywordCountersFromYard" }>;

const name = (s: GameState, id: string) => defOf(s, obj(s, id)).name;

/**
 * The keyword counters Kathril, Aspect Warper's ability puts for `keyword` (CR 122.1b), as the cards in its controller's
 * graveyard are now: one of that kind if a creature card there has it, once whatever how many do; for hexproof, one of
 * each hexproof ability among them, "hexproof from [quality]" variants included (rulings).
 */
export function yardKeywordCounters(s: GameState, pid: number, keyword: string): string[] {
  const cards = player(s, pid).graveyard.map((id) => obj(s, id)).filter((o) => objIsType(s, o, "Creature"));
  const kws = cards.flatMap((o) => characteristics(s, o).keywords.map((k) => k.toLowerCase()));
  if (keyword !== "hexproof") return kws.includes(keyword) ? [keyword] : [];
  return [...new Set(kws.filter((k) => k === "hexproof" || k.startsWith("hexproof from ")))].sort((a, b) => (a === "hexproof" ? -1 : b === "hexproof" ? 1 : a.localeCompare(b)));
}

export function runLaneB184Effect(s: GameState, e: B184Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "playersPutCounterEach": {
      // Each of them in APNAP order puts the counters on the permanents they control now (the friends act before the foes,
      // rulings); who puts them matters to replacements like Vorinclex, Monstrous Raider's.
      for (const pid of apnap(s, players(s, e.who, ctx))) {
        if (player(s, pid).lost) continue;
        const ids = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), pid, false));
        if (!ids.length) continue;
        for (const id of ids) withPutter(pid, () => putCounters(s, obj(s, id), e.counter, 1));
        invalidateCharacteristics(s);
        log(s, `${player(s, pid).name} puts a ${e.counter} counter on each creature they control (${src}).`);
      }
      return;
    }
    case "keywordCountersFromYard": {
      // Kathril, Aspect Warper: all as it resolves, each counter on a creature its controller chooses then (not targeted).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const st = (sc.kathril ??= { kinds: e.keywords.flatMap((k) => yardKeywordCounters(s, ctx.controller, k)), put: 0 });
      const you = ctx.controller;
      while (st.kinds.length) {
        const kind = st.kinds[0]!;
        // The answer to the question asked for this counter.
        const picked = sc.chosen?.[you];
        let target: string | undefined;
        if (picked) {
          target = picked[0];
          sc.chosen = undefined;
          sc.queue = undefined;
        } else {
          const options = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && objIsType(s, obj(s, id), "Creature"));
          if (!options.length) {
            st.kinds = [];
            break;
          }
          if (options.length > 1) {
            sc.queue = [you];
            sc.chosen = {};
            s.pending = { kind: "pickPermanents", player: you, source: src, action: "counters", counter: kind, what: "creature", options, count: 1, prompt: `put a ${kind} counter on a creature you control: click it.` };
            return "paused";
          }
          target = options[0];
        }
        st.kinds.shift();
        const o = target ? s.objects[target] : undefined;
        if (!o || o.zone !== "battlefield") continue;
        const n = withPutter(you, () => putCounters(s, o, kind, 1));
        invalidateCharacteristics(s);
        if (n > 0) {
          st.put += n;
          log(s, `${player(s, you).name} puts a ${kind} counter on ${name(s, o.id)} (${src}).`);
        }
      }
      // "Then put a +1/+1 counter on ~ for each counter put on a creature this way": on ~ if it's still the object it was.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const n = st.put;
      sc.kathril = undefined;
      if (n > 0 && me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc)) {
        const put = withPutter(you, () => putCounters(s, me, "+1/+1", n));
        invalidateCharacteristics(s);
        log(s, `${name(s, me.id)} gets ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
      }
      return;
    }
  }
}

// Lane B round B200's effects.
import type { Effect } from "../abilities";
import { destroyPermanent, log, moveObject, nameOf, obj, player, turnOrderFrom } from "../game";
import { controllerOf } from "../layers";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";
import { returnFromExile } from "./run-zones";
import { objectMatches } from "./targeting";

type B200Effect = Extract<Effect, { type: "returnExiledWithCounter" | "othersChooseDestroyRest" | "exileCreatedWithAtEndStep" | "exileTokensCreatedBy" }>;

export function runLaneB200Effect(s: GameState, e: B200Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "returnExiledWithCounter": {
      // Livio, Oathsworn Sentinel: every card in any exile zone with the counter, whoever exiled it and whenever
      // (rulings). Each comes back a new object without counters (CR 400.7, 122.2).
      void ctx;
      const cards = s.turnOrder.flatMap((pid) => player(s, pid).exile).map((id) => obj(s, id)).filter((o) => o.zone === "exile" && !o.isToken && (o.counters[e.counter] ?? 0) > 0);
      if (!cards.length) {
        log(s, `There are no exiled cards with ${e.counter} counters on them.`);
        return;
      }
      return returnFromExile(s, cards, (c) => c.owner, src);
    }
    case "othersChooseDestroyRest": {
      // Fortunate Few: you choose first, then each other player in turn order from the active player (rulings), each among
      // the permanents they don't control that nobody has chosen yet, knowing the earlier choices; nobody else acts in
      // between (rulings). Then everything else that matches is destroyed at once (an indestructible one chosen or not).
      const sc = (s.resolving!.scratch ??= {});
      const all = () => s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      const st = (sc.othersChosen ??= { queue: [ctx.controller, ...turnOrderFrom(s, s.activePlayer).filter((p) => p !== ctx.controller)], picked: [] });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        // The answer to the question asked last.
        const answer = sc.chosen?.[pid];
        if (answer) {
          sc.chosen = undefined;
          st.queue.shift();
          const id = answer.find((x) => s.objects[x]?.zone === "battlefield");
          if (id) {
            st.picked.push(id);
            log(s, `${player(s, pid).name} chooses ${nameOf(s, id)}.`);
          }
          continue;
        }
        const options = player(s, pid).lost ? [] : all().filter((id) => controllerOf(s, obj(s, id)) !== pid && !st.picked.includes(id));
        if (!options.length) {
          log(s, `${player(s, pid).name} has no nonland permanent to choose.`);
          st.queue.shift();
          continue;
        }
        // Only one to choose: it's chosen (the choice isn't optional).
        if (options.length === 1) {
          sc.chosen = { [pid]: options };
          continue;
        }
        sc.queue = [pid];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "choose", what: e.filter.text, options, count: 1, prompt: `click a ${e.filter.text} you don't control that hasn't been chosen. All other ${e.filter.text}s will be destroyed.` };
        return "paused";
      }
      const kept = new Set<ObjectId>(st.picked);
      sc.othersChosen = undefined;
      sc.queue = undefined;
      for (const id of all().filter((x) => !kept.has(x))) destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
      return;
    }
    case "exileCreatedWithAtEndStep": {
      // The leaves trigger's source is the object ~ became (CR 603.10a, 400.7); the tokens are those the permanent it was
      // created, one zone change before.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || ctx.sourceZc === undefined) return;
      const was = { id: me.id, zc: ctx.sourceZc - 1 };
      addDelayed(s, "nextEndStep", ctx.controller, me, { targets: [], effects: [{ type: "exileTokensCreatedBy" }], text: `Exile all tokens created with ${src}.` });
      s.delayed!.at(-1)!.subject = was;
      return;
    }
    case "exileTokensCreatedBy": {
      const was = ctx.subject;
      if (!was) return;
      const tokens = s.battlefield.map((id) => obj(s, id)).filter((o) => o.isToken && o.createdWith?.id === was.id && o.createdWith.zc === was.zc);
      if (!tokens.length) {
        log(s, `${src}: there are no tokens created with it to exile.`);
        return;
      }
      for (const o of tokens) {
        log(s, `${src} exiles ${nameOf(s, o.id)}.`);
        moveObject(s, o.id, "exile");
      }
      return;
    }
  }
}

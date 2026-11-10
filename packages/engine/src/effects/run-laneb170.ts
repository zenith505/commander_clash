// Lane B round B170's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { livingPlayers, log, obj, player } from "../game";
import type { GameState } from "../types";
import { apnap, runEffect, type ResolveCtx } from "./resolve";
import { printedMatches } from "./targeting";

type B170Effect = Extract<Effect, { type: "eachRevealFromHand" }>;

export function runLaneB170Effect(s: GameState, e: B170Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "eachRevealFromHand": {
      // Kamahl's Summons: each player in turn order from the active player (CR 101.4) chooses any number of the cards that
      // fit in their hand to reveal, none if they like; then each player creates the tokens for the cards they revealed.
      const sc = (s.resolving!.scratch ??= {});
      const g = (sc.revealEach ??= { queue: apnap(s, livingPlayers(s)), counts: {} });
      if (sc.found) {
        const pid = g.queue.shift();
        if (pid !== undefined) {
          const p = player(s, pid);
          const shown = sc.found.filter((id) => p.hand.includes(id) && printedMatches(e.filter, defOf(s, obj(s, id))));
          g.counts[pid] = shown.length;
          log(s, shown.length ? `${p.name} reveals ${shown.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their hand.` : `${p.name} reveals no cards.`);
        }
        delete sc.found;
      }
      while (g.queue.length) {
        const p = player(s, g.queue[0]!);
        const cards = p.hand.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
        if (cards.length) {
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `any number of ${e.filter.text}s (a token for each)`, cards, min: 0, max: cards.length, fromHand: true, reveal: true };
          return "paused";
        }
        g.counts[p.id] = 0;
        g.queue.shift();
      }
      // "Then each player creates ...": in turn order, each the controller of their own tokens (CR 111.2).
      for (sc.revealEachStep ??= 0; sc.revealEachStep < s.players.length; sc.revealEachStep++) {
        const pid = apnap(s, livingPlayers(s))[sc.revealEachStep];
        const n = pid === undefined ? 0 : (g.counts[pid] ?? 0);
        if (pid === undefined || n <= 0) continue;
        if (runEffect(s, { ...e.then, n }, { ...ctx, controller: pid }) === "paused") return "paused";
      }
      return;
    }
  }
}

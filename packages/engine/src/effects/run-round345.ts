// Round 345's effects.
import type { Effect } from "../abilities";
import { log, obj, player } from "../game";
import type { GameState } from "../types";
import { amountNow, players, runEffect, type ResolveCtx } from "./resolve";

type R345Effect = Extract<Effect, { type: "handChooseCast" }>;

export function runRound345Effect(s: GameState, e: R345Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "handChooseCast": {
      // Extract Brain: the opponent chooses as it resolves (CR 608.2d), X of their cards, all of them with fewer; you look
      // at those (hidden from the others, so the log doesn't name them), then may cast one from that hand.
      const sc = (s.resolving!.scratch ??= {});
      const whose = players(s, e.who, ctx)[0];
      if (whose === undefined) return;
      const pl = player(s, whose);
      if (!sc.castAmong) {
        let chosen: string[];
        if (sc.found) {
          chosen = sc.found.filter((id) => pl.hand.includes(id));
          sc.found = undefined;
        } else {
          const n = Math.min(Math.max(0, amountNow(s, e.n, ctx)), pl.hand.length);
          if (n === 0) {
            log(s, `${pl.name} chooses no cards from their hand (${src}).`);
            return;
          }
          if (n < pl.hand.length) {
            s.pending = { kind: "searchLibrary", player: whose, source: src, what: `${n === 1 ? "a card" : `${n} cards`} from your hand for ${player(s, ctx.controller).name} to look at (they may cast one of them without paying its mana cost)`, cards: [...pl.hand], min: n, max: n, fromHand: true, handFor: ctx.controller, forPlayer: ctx.controller, helps: true };
            return "paused";
          }
          chosen = [...pl.hand];
        }
        log(s, `${pl.name} chooses ${chosen.length === 1 ? "a card" : `${chosen.length} cards`} from their hand; ${player(s, ctx.controller).name} looks at ${chosen.length === 1 ? "it" : "them"} (${src}).`);
        if (!chosen.length) return;
        sc.castAmong = { ids: chosen.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      return runEffect(s, { type: "castFromAmong", who: e.who, n: 0, fromHand: true, max: 1 }, ctx);
    }
  }
}

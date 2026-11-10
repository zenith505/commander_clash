// Lane B round B177's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { defMv } from "../faces";
import { log, loseLife, player, simultaneousLifeLoss, turnOrderFrom } from "../game";
import type { GameObject, GameState, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";

type B177Effect = Extract<Effect, { type: "discardSharesTypeLoss" | "discardGreatestMvLoss" }>;

/** The cards this resolution discarded so far, wherever they went (madness: exile), each with the player who discarded it: its owner (CR 400.3). */
function discardedThisWay(s: GameState): { o: GameObject; by: PlayerId }[] {
  return (s.resolving?.discardedAll ?? []).flatMap((id) => (s.objects[id] ? [{ o: s.objects[id]!, by: s.objects[id]!.owner }] : []));
}

export function runLaneB177Effect(s: GameState, e: B177Effect, ctx: ResolveCtx, _src: string): "paused" | void {
  switch (e.type) {
    case "discardSharesTypeLoss": {
      // Creeping Dread: the card types of the card you discarded (a double-faced card's front face, rulings); with none
      // discarded, no one loses life (rulings).
      const cards = discardedThisWay(s);
      const mine = cards.filter((c) => c.by === ctx.controller).flatMap((c) => defOf(s, c.o).types);
      if (!mine.length) return;
      const losers = turnOrderFrom(s, ctx.controller).filter((pid) => pid !== ctx.controller && cards.some((c) => c.by === pid && defOf(s, c.o).types.some((t) => mine.includes(t))));
      simultaneousLifeLoss(s, () => {
        for (const pid of losers) {
          loseLife(s, pid, e.n);
          log(s, `${player(s, pid).name} loses ${e.n} life (their discarded card shares a card type).`);
        }
      });
      return;
    }
    case "discardGreatestMvLoss": {
      // Scythe Specter: each player who discarded one of the cards with the greatest mana value loses that much, at once.
      const cards = discardedThisWay(s);
      if (!cards.length) return;
      const top = Math.max(...cards.map((c) => defMv(defOf(s, c.o))));
      const losers = turnOrderFrom(s, s.activePlayer).filter((pid) => cards.some((c) => c.by === pid && defMv(defOf(s, c.o)) === top));
      simultaneousLifeLoss(s, () => {
        for (const pid of losers) {
          loseLife(s, pid, top);
          if (top > 0) log(s, `${player(s, pid).name} loses ${top} life (the greatest mana value discarded).`);
        }
      });
      return;
    }
  }
}

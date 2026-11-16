// Lane B round B227's effects: Aeon Engine (reverseTurnOrder).
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B227Effect = Extract<Effect, { type: "reverseTurnOrder" }>;

export function runLaneB227Effect(s: GameState, e: B227Effect, _ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "reverseTurnOrder": {
      // Aeon Engine: "Reverse the game's turn order.": the order turns go in, and with it everything that uses turn order
      // (APNAP order, CR 101.4), goes the other way around the table from now on (rulings). The players keep their seats
      // (`seating`, see seatOrder: "left" and "right" still mean seats). Reversed again, it's the order the game began with
      // (rulings). The next turn that isn't an extra turn goes to the player after the last one who took a turn that wasn't
      // an extra turn, in the new order (rulings): startNextTurn counts from that player (GameState.rotation), and pending
      // extra turns keep their order. With two players left it makes no difference (rulings).
      const seats = s.seating ?? [...s.turnOrder];
      s.turnOrder = [...s.turnOrder].reverse();
      s.seating = s.turnOrder.every((p, i) => p === seats[i]) ? undefined : seats;
      log(s, `${src}: the turn order is reversed; it now goes ${s.turnOrder.map((p) => player(s, p).name).join(", ")}.`);
      return;
    }
  }
}

// Lane B round B186's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, obj, player } from "../game";
import { shuffleLibrary } from "../rng";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B186Effect = Extract<Effect, { type: "lookFaceDownThisTurn" | "shuffleRevealTopFree" }>;

export function runLaneB186Effect(s: GameState, e: B186Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "lookFaceDownThisTurn": {
      // Lumbering Laundry: until the turn ends, whenever they want, its controller sees what face-down creatures they don't
      // control are (rulings; information only, CR 708.5).
      const you = ctx.controller;
      s.lookFaceDownTurn = [...(s.lookFaceDownTurn ?? []).filter((g) => g.turn === s.turn && g.player !== you), { player: you, turn: s.turn }];
      log(s, `${player(s, you).name} may look at face-down creatures they don't control until end of turn (${src}).`);
      return;
    }
    case "shuffleRevealTopFree": {
      // Temporal Aperture: shuffle (CR 701.24a), reveal the card now on top (CR 701.20a), then the permission for that card
      // as the object it is, while it remains on top this turn (CR 611.2b): played as usual if it's a land (CR 305.1), cast
      // without paying its mana cost otherwise (CR 118.9; X is 0, CR 107.3b), at the usual times.
      const you = ctx.controller;
      const p = player(s, you);
      shuffleLibrary(s, p);
      const top = p.library[0];
      if (top === undefined) {
        log(s, `${p.name} shuffles their library, which is empty: there's no card to reveal.`);
        return;
      }
      log(s, `${p.name} shuffles their library and reveals the top card: ${defOf(s, obj(s, top)).name} (${src}).`);
      s.topFreePlays = [...(s.topFreePlays ?? []).filter((g) => g.player !== you), { player: you, turn: s.turn, card: top, zc: obj(s, top).zoneChanges ?? 0, sourceName: src }];
      return;
    }
  }
}

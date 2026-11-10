// Round 329's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, player } from "../game";
import type { GameState } from "../types";
import { amountCtx, type ResolveCtx } from "./resolve";
import { bindBound, printedMatches } from "./targeting";

type R329Effect = Extract<Effect, { type: "surveilledToHand" | "loseInsteadThisTurn" }>;

export function runRound329Effect(s: GameState, e: R329Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "loseInsteadThisTurn": {
      // Stunning Reversal: a shield for the rest of this turn, used by the next loss (game.ts playerLoses).
      const p = player(s, ctx.controller);
      (p.loseInstead ??= []).push({ turn: s.turn, source: src });
      log(s, `The next time ${p.name} would lose the game this turn, they draw seven cards and their life total becomes 1 instead.`);
      return;
    }
    case "surveilledToHand": {
      // The card the surveil put there, still the same object in the graveyard (CR 400.7), judged by its printed
      // characteristics as it resolves (X is 0 in a mana value, CR 202.3e; Enlightened Confidant counts the life gained
      // so far this turn as this resolves, rulings).
      const filter = bindBound(s, e.filter, amountCtx(s, ctx));
      for (const { id, zc } of s.resolving?.surveilYard ?? []) {
        const o = s.objects[id];
        if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== zc || !printedMatches(filter, defOf(s, o))) continue;
        log(s, `${player(s, o.owner).name} puts ${defOf(s, o).name} into their hand.`);
        moveObject(s, id, "hand");
      }
      return;
    }
  }
}

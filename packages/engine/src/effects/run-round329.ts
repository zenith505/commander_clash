// Round 329's effects.
import type { Effect } from "../abilities";
import { abilitiesOf, defOf } from "../cards";
import { log, moveObject, nameOf, obj, player } from "../game";
import { controllerOf } from "../layers";
import { nextRandom } from "../rng";
import type { GameState } from "../types";
import { amountCtx, objects, type ResolveCtx } from "./resolve";
import { flipsRigged, noteFlipped } from "./run-dice";
import { fireEvent } from "./triggers";
import { bindBound, printedMatches } from "./targeting";

type R329Effect = Extract<Effect, { type: "surveilledToHand" | "loseInsteadThisTurn" | "flipCoinEachWon" }>;

export function runRound329Effect(s: GameState, e: R329Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "flipCoinEachWon": {
      // One flip for each, called by the controller and won or lost (CR 705.2), each a "coinFlipped" event. Edgar, King
      // of Figaro: the first flips this turn come up heads and are won (rulings). Krark's Thumb: two coins each, and the
      // won one kept (its controller's choice, CR 705.3, taken for them: ROADMAP).
      const who = ctx.controller;
      const each = objects(s, { ref: "each", filter: e.filter }, ctx);
      const r = s.resolving!;
      r.wonFlipIds = [];
      if (!each.length) {
        log(s, `${player(s, who).name} flips no coins for ${src}.`);
        return;
      }
      const rigged = flipsRigged(s, who);
      noteFlipped(s, who);
      const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === who && !!abilitiesOf(s, obj(s, id)).flipTwo);
      const won: string[] = [];
      const lost: string[] = [];
      for (const o of each) {
        const win = rigged || (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((x) => x);
        fireEvent(s, { type: "coinFlipped", player: who, won: win });
        if (win) r.wonFlipIds.push({ id: o.id, zc: o.zoneChanges ?? 0 });
        (win ? won : lost).push(nameOf(s, o.id));
      }
      log(s, `${player(s, who).name} flips ${each.length} coin${each.length === 1 ? "" : "s"} for ${src}: ${won.length ? `won for ${won.join(", ")}` : "none won"}${lost.length ? `, lost for ${lost.join(", ")}` : ""}.`);
      return;
    }
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

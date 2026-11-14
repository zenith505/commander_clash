// Lane B round B209's effects.
import { defOf } from "../cards";
import { livingPlayers, log, moveObject, obj, player } from "../game";
import type { GameState, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";
import { apnap } from "./resolve";

/**
 * Jötun Grunt's cumulative upkeep, "Put two cards from a single graveyard on the bottom of their owner's library", for `n`
 * age counters: two cards for each counter, each two from one graveyard, the same graveyard or different ones (rulings),
 * chosen by the permanent's controller, so an even number from each graveyard (every card there is its owner's). It's paid
 * all at once or not at all (CR 702.24a), and can't be paid with too few cards (CR 118.3). Each owner orders theirs on the
 * bottom (CR 401.4), asked before anything moves. "paid", "sacrifice", or "paused" while a player answers.
 */
export function yardPairsUpkeep(s: GameState, ctx: ResolveCtx, src: string, n: number): "paid" | "sacrifice" | "paused" {
  if (!n) return "paid";
  const sc = (s.resolving!.scratch ??= {});
  const yards = livingPlayers(s).map((q) => player(s, q).graveyard);
  const room = yards.reduce((k, g) => k + Math.floor(g.length / 2), 0);
  if (sc.found === undefined) {
    if (room < n) {
      log(s, `${player(s, ctx.controller).name} can't put ${n * 2} cards, two from a single graveyard for each age counter, on the bottom of their owners' libraries.`);
      return "sacrifice";
    }
    if (sc.may === undefined) {
      s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `put ${n * 2} cards from graveyards on the bottom of their owners' libraries, two from a single graveyard for each age counter, to keep ${src} (cumulative upkeep)`, otherwise: `If you don't, sacrifice ${src}.`, source: src, keep: true };
      return "paused";
    }
    if (!sc.may) return "sacrifice";
    const cards = yards.flat();
    // Exactly enough, an even number in each graveyard: every one of them, nothing to choose.
    if (cards.length === n * 2 && yards.every((g) => g.length % 2 === 0)) sc.found = cards;
    else {
      s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `${n * 2} cards from graveyards, two from a single graveyard for each age counter (an even number from each graveyard)`, cards, min: n * 2, max: n * 2, anyGraveyard: true, pairsPerYard: true, fromGraveyard: "libraryBottom" };
      return "paused";
    }
  }
  const all = sc.found.filter((id) => s.objects[id]?.zone === "graveyard");
  const orders = (sc.bottomOrders ??= {});
  for (const pid of apnap(s, [...new Set(all.map((id) => obj(s, id).owner))] as PlayerId[])) {
    if (orders[pid]) continue;
    const cards = all.filter((id) => obj(s, id).owner === pid);
    if (cards.length > 1 && !sc.arranged) {
      s.pending = { kind: "arrangeTop", player: pid, how: "bottom", cards, source: src };
      return "paused";
    }
    orders[pid] = sc.arranged ? sc.arranged.top.filter((id) => cards.includes(id)) : cards;
    sc.arranged = undefined;
  }
  const moving = Object.values(orders).flat().filter((id) => all.includes(id));
  log(s, `${player(s, ctx.controller).name} puts ${moving.map((id) => defOf(s, obj(s, id)).name).join(", ")} on the bottom of ${moving.length === 1 ? "its owner's library" : "their owners' libraries"} to keep ${src}.`);
  for (const id of moving) moveObject(s, id, "library");
  sc.bottomOrders = undefined;
  sc.found = undefined;
  return "paid";
}

// Round 383's effects: a draw replaced by each opponent discarding a card (Words of Waste).
import { continueDraws, log, opponents, player } from "../game";
import type { DrawAfter, GameState, ObjectId, Player, PlayerId, WasteDraw } from "../types";
import { RulesError } from "../types";
import { apnap } from "./resolve";
import { discardCards, lengName } from "./run-library";

/**
 * Words of Waste: "The next time you would draw a card this turn, each opponent discards a card instead." The draw doesn't
 * happen (CR 614.6), even from an empty library (CR 614.11). Each opponent still in the game discards a card of their
 * choice (CR 701.9b): those with a choice to make choose in APNAP order (CR 101.4), one with a single card discards it, one
 * with none discards nothing. All of it is done before the draws after it (CR 614.11a). "paused" while one chooses.
 */
export function wasteInstead(s: GameState, pid: PlayerId, source: string, left: number, after: DrawAfter | undefined, made: number[]): "paused" | void {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  log(s, `${player(s, pid).name} doesn't draw that card; each opponent discards a card instead (${source}).`);
  const w: WasteDraw = { drawer: pid, source, order: apnap(s, opponents(s, pid)), queue: [], chosen: {}, left, made: [...made], ...(after ? { after } : {}) };
  for (const q of w.order) {
    const hand = player(s, q).hand;
    if (hand.length > 1) w.queue.push(q);
    else w.chosen[q] = [...hand];
  }
  return wasteNext(s, w);
}

/**
 * The next step of a Words of Waste discard: the next opponent's choice, then a Library of Leng's controller's ("If an
 * effect causes you to discard a card, ... you may put it on top of your library instead", as the card is discarded), then
 * every chosen card discarded at once (CR 701.9b), caused by the Words' controller (for Obstinate Baloth). Not a discard of
 * any spell that may be resolving now: what that spell counts as "discarded this way" stays as it was.
 */
function wasteNext(s: GameState, w: WasteDraw): "paused" | void {
  const q = w.queue[0];
  if (q !== undefined) {
    s.pending = { kind: "discard", player: q, count: 1, source: w.source, waste: w };
    return "paused";
  }
  w.leng ??= w.order.filter((x) => (w.chosen[x] ?? []).length > 0 && !!lengName(s, x));
  const lq = w.leng.find((x) => !w.toTop || !(x in w.toTop));
  if (lq !== undefined) {
    s.pending = { kind: "handToTop", player: lq, count: w.chosen[lq]!.length, source: w.source, upTo: true, discarding: w.chosen[lq]!, waste: w };
    return "paused";
  }
  const r = s.resolving;
  const saved = r ? { discarded: r.discarded, discardedAll: r.discardedAll, discardedCards: r.discardedCards, discardedExiled: r.discardedExiled } : undefined;
  for (const x of w.order) {
    const ids = (w.chosen[x] ?? []).filter((id) => player(s, x).hand.includes(id));
    discardCards(s, x, ids, ` (${w.source})`, false, false, w.drawer, undefined, w.toTop?.[x] ?? []);
  }
  if (r && saved) {
    r.discarded = saved.discarded;
    r.discardedAll = saved.discardedAll;
    r.discardedCards = saved.discardedCards;
    r.discardedExiled = saved.discardedExiled;
    for (const k of ["discarded", "discardedAll", "discardedCards", "discardedExiled"] as const) if (r[k] === undefined) delete r[k];
  }
}

/** Then the draws still to make (CR 614.11a), and whatever was drawing (see `draw`). */
function wasteResume(s: GameState, w: WasteDraw) {
  if (wasteNext(s, w) === "paused") return;
  continueDraws(s, w.drawer, w.left, w.after, w.made);
}

/** Answers PendingDecision "discard" with `waste`: the card this opponent discards. */
export function chooseWasteDiscard(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "discard" || !pend.waste || pend.player !== p.id) throw new RulesError("no discard pending");
  if (new Set(ids).size !== 1 || ids.length !== 1 || !p.hand.includes(ids[0]!)) throw new RulesError("choose exactly 1 card from your hand");
  const w = pend.waste;
  w.chosen[p.id] = [...ids];
  w.queue = w.queue.filter((x) => x !== p.id);
  s.pending = null;
  wasteResume(s, w);
}

/** Answers PendingDecision "handToTop" with `waste`: Library of Leng, which of this player's discarded cards go on top. */
export function chooseWasteToTop(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "handToTop" || !pend.waste || !pend.discarding || pend.player !== p.id) throw new RulesError("no cards to put on top");
  if (new Set(ids).size !== ids.length || ids.some((id) => !pend.discarding!.includes(id))) throw new RulesError("choose from the cards being discarded");
  const w = pend.waste;
  (w.toTop ??= {})[p.id] = [...ids];
  s.pending = null;
  wasteResume(s, w);
}

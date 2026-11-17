// Round 385's effects: draws replaced by each player returning a permanent (Words of Wind), by the top card of a
// face-down pile (Mangara's Tome) and by a look at the top X cards before the draw (Aladdin's Lamp).
import { continueDraws, livingPlayers, log, moveObject, nameOf, obj, player } from "../game";
import { controllerOf } from "../layers";
import { shuffle } from "../rng";
import type { DrawAfter, GameState, ObjectId, PendingDecision, Player, PlayerId, WindDraw } from "../types";
import { RulesError } from "../types";
import { apnap, type ResolveCtx } from "./resolve";

/** The permanents `pid` controls now. */
const controlled = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);

/**
 * Words of Wind: "The next time you would draw a card this turn, each player returns a permanent they control to its
 * owner's hand instead." The draw doesn't happen (CR 614.6), even from an empty library (CR 614.11). Every player still in
 * the game, the drawing player too, chooses one of the permanents they control: those with a choice to make choose in
 * APNAP order (CR 101.4), one with a single permanent returns it, one with none returns nothing. All of them are returned
 * at the same time, before the draws after it (CR 614.11a). "paused" while one chooses.
 */
export function windInstead(s: GameState, pid: PlayerId, source: string, left: number, after: DrawAfter | undefined, made: number[]): "paused" | void {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  log(s, `${player(s, pid).name} doesn't draw that card; each player returns a permanent they control to its owner's hand instead (${source}).`);
  const order = apnap(s, livingPlayers(s));
  const w: WindDraw = { drawer: pid, source, order, queue: [], chosen: {}, left, made: [...made], ...(after ? { after } : {}) };
  for (const q of order) {
    const own = controlled(s, q);
    if (own.length > 1) w.queue.push(q);
    else w.chosen[q] = own;
  }
  return windNext(s, w);
}

/** The next player's choice, then every chosen permanent returned to its owner's hand at once. */
function windNext(s: GameState, w: WindDraw): "paused" | void {
  const q = w.queue[0];
  if (q !== undefined) {
    const options = controlled(s, q);
    s.pending = { kind: "pickPermanents", player: q, source: w.source, action: "bounce", what: "permanent", options, count: 1, prompt: "click a permanent you control to return to its owner's hand.", wind: w };
    return "paused";
  }
  const back = w.order.flatMap((x) => (w.chosen[x] ?? []).filter((id) => s.battlefield.includes(id) && controllerOf(s, obj(s, id)) === x).map((id) => ({ x, id })));
  for (const { x, id } of back) log(s, `${player(s, x).name} returns ${nameOf(s, id)} to its owner's hand (${w.source}).`);
  for (const { id } of back) moveObject(s, id, "hand");
}

/** Answers PendingDecision "pickPermanents" with `wind`: the permanent this player returns; then the next, then the draws. */
export function chooseWindPick(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "pickPermanents" || !pend.wind || pend.player !== p.id) throw new RulesError("nothing to pick");
  if (ids.length !== 1 || !pend.options.includes(ids[0]!) || !s.battlefield.includes(ids[0]!) || controllerOf(s, obj(s, ids[0]!)) !== p.id) throw new RulesError("choose a permanent you control");
  const w = pend.wind;
  w.chosen[p.id] = [...ids];
  w.queue = w.queue.filter((x) => x !== p.id);
  s.pending = null;
  if (windNext(s, w) === "paused") return;
  continueDraws(s, w.drawer, w.left, w.after, w.made);
}

/**
 * Mangara's Tome: "The next time you would draw a card this turn, instead put the top card of the exiled pile into its
 * owner's hand." The pile is the one the enters ability of the Tome that made this shield exiled (linked abilities of
 * that object, CR 607.2a), whether or not the Tome is still around; the card isn't drawn (CR 614.6) or revealed. With no
 * card left in the pile the draw is still replaced, and nothing happens (rulings, CR 614.11).
 */
export function pileInstead(s: GameState, pid: PlayerId, source: string, sourceId: ObjectId | undefined, sourceZc: number | undefined) {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const p = player(s, pid);
  const pile = sourceId === undefined ? [] : (s.linkedExile?.[`${sourceId}@${sourceZc ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (obj(s, l.id).zoneChanges ?? 0) === l.zc);
  const top = pile[0];
  if (!top) {
    log(s, `${p.name} doesn't draw that card, and the exiled pile is empty, so nothing happens instead (${source}).`);
    return;
  }
  const owner = player(s, obj(s, top.id).owner);
  log(s, `${p.name} doesn't draw that card; the top card of the exiled pile is put into ${owner === p ? "their" : `${owner.name}'s`} hand instead (${source}).`);
  moveObject(s, top.id, "hand");
}

/**
 * Mangara's Tome's "exile them in a face-down pile, and shuffle that pile": the cards linked to this source as it is (CR
 * 607.2a), the ones its search just exiled face down, in a random order, the first of them the pile's top card. Nobody
 * may look at them, the searcher either (CR 406.3).
 */
export function runShuffleExiledPileEffect(s: GameState, ctx: ResolveCtx, src: string) {
  if (ctx.sourceId === undefined) return;
  const pile = s.linkedExile?.[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`];
  if (!pile?.length) return;
  shuffle(s, pile);
  for (const l of pile) {
    const o = s.objects[l.id];
    if (o?.zone === "exile" && o.hiddenExile) o.hiddenExile.seen = [];
  }
  log(s, `${player(s, ctx.controller).name} shuffles the face-down pile of ${pile.length === 1 ? "1 card" : `${pile.length} cards`} (${src}).`);
}

/**
 * Aladdin's Lamp: "The next time you would draw a card this turn, instead look at the top X cards of your library, put all
 * but one of them on the bottom of your library in a random order, then draw a card." The draw it makes is a new draw
 * that other replacements may still replace, another Lamp's too (rulings), but not this one (CR 614.5): the Archives
 * that could still replace the draw it replaced (`madeArchives`, for a draw an Archive made) can replace it, no others.
 * With fewer cards than X, all of them are looked at; with one or none, nothing goes on the bottom. "paused" while the
 * player chooses the card to keep, "again" when the draw follows at once.
 */
export function lampInstead(s: GameState, pid: PlayerId, source: string, x: number, left: number, after: DrawAfter | undefined, made: number[], madeArchives: number | undefined): "paused" | "again" | void {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const p = player(s, pid);
  const cards = p.library.slice(0, Math.max(0, x));
  log(s, `${p.name} looks at the top ${cards.length === 1 ? "card" : `${cards.length} cards`} of their library instead of drawing (${source}).`);
  const nextLeft = madeArchives === undefined ? left + 1 : left;
  const nextMade = madeArchives === undefined ? [...made] : [madeArchives, ...made];
  if (cards.length > 1) {
    s.pending = { kind: "drawLook", lamp: true, player: pid, source, cards, left: nextLeft, made: nextMade, ...(after ? { after } : {}) };
    return "paused";
  }
  if (madeArchives === undefined) return "again";
  made.unshift(madeArchives);
}

/** Answers PendingDecision "drawLook" with `lamp`: the card that stays on top; the rest go on the bottom in a random order, then the draw. */
export function chooseLampKeep(s: GameState, p: Player, pend: Extract<PendingDecision, { kind: "drawLook" }>, id: ObjectId | undefined) {
  if (id === undefined || !pend.cards.includes(id)) throw new RulesError("choose the card to keep on top");
  if (pend.cards.some((c) => !p.library.includes(c))) throw new RulesError("those cards moved");
  s.pending = null;
  const rest = pend.cards.filter((c) => c !== id);
  shuffle(s, rest);
  p.library = [...p.library.filter((c) => !rest.includes(c)), ...rest];
  log(s, `${p.name} keeps a card on top and puts ${rest.length === 1 ? "the other" : `the other ${rest.length}`} on the bottom of their library in a random order, then draws (${pend.source}).`);
  continueDraws(s, p.id, pend.left, pend.after, [...(pend.made ?? [])]);
}

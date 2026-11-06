// The order of cards in a graveyard. Cards go on top of their owner's graveyard (CR 404.1; the top is the last id in
// `Player.graveyard`), and players can't rearrange them (404.2), except that cards put into the same graveyard at the
// same time are arranged by their owner (404.3).
//
// moveObject notes each card put into a graveyard in `s.graveyardBatch`. A batch ends with the event that moved the
// cards: one instruction of a resolving spell or ability (continueResolution), one pass of state-based actions, or an
// action's costs (both closed in runStateBasedActions). Each owner with two or more cards in it then arranges them,
// before anything else happens: before the resolution's next instruction, or before triggered abilities are put on
// the stack and anyone gets priority. Arranging only swaps those cards among the places they hold, so cards put on top
// of them since stay where they are.
//
// Only a few cards care about the order (Corpse Dance, Krovikan Horror, ...). Without one of them in the game, no
// one could tell the orders apart, so the owner isn't asked.

import type { TargetSpec } from "./abilities";
import { defOf } from "./cards";
import { printedMatches } from "./effects/targeting";
import { continueResolution } from "./effects/resolve";
import { continueDraws, log, player } from "./game";
import { RulesError, type CardDef, type GameObject, type GameState, type ObjectId, type Player, type PlayerId } from "./types";

const ORDER_WORDS =
  /\b(?:top|bottom)\b(?: (?:two|three|four|\w+)?)?(?: \w+){0,2} cards? (?:of|in) (?:your|their|target player.s|defending player.s|a|each player.s|that player.s|its owner.s|an opponent.s) graveyard|directly (?:above|below)|cards above it|top of (?:your|a|their) graveyard|reorder (?:your|their) graveyard/i;
const readsCache = new Map<string, boolean>();

/** Does this card's text care about the order of a graveyard ("the top creature card of your graveyard")? */
export function readsGraveyardOrder(d: CardDef): boolean {
  let r = readsCache.get(d.oracleId);
  if (r === undefined) readsCache.set(d.oracleId, (r = ORDER_WORDS.test(d.oracleText ?? "")));
  return r;
}

/** Is a card that cares about graveyard order anywhere in the game (in any zone)? */
export function graveyardOrderMatters(s: GameState): boolean {
  for (const o of Object.values(s.objects)) if (!o.isToken && readsGraveyardOrder(defOf(s, o))) return true;
  return false;
}

/** A card was put into a graveyard (not a token or a copy of a spell: those aren't cards, CR 111.1, 707.10). */
export function noteToGraveyard(s: GameState, o: GameObject) {
  if (o.isToken || o.spellCopy) return;
  (s.graveyardBatch ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
}

/** The current event is over: the cards it put into one graveyard together wait to be arranged (CR 404.3). */
export function closeGraveyardBatch(s: GameState) {
  const batch = s.graveyardBatch;
  s.graveyardBatch = undefined;
  if (!batch || batch.length < 2) return;
  const byOwner = new Map<PlayerId, { id: ObjectId; zc: number }[]>();
  for (const c of batch) {
    const o = s.objects[c.id];
    if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== c.zc) continue;
    byOwner.set(o.owner, [...(byOwner.get(o.owner) ?? []), c]);
  }
  const groups = [...byOwner].filter(([, cards]) => cards.length > 1);
  if (!groups.length || !graveyardOrderMatters(s)) return;
  // Each player makes their choice in turn order, starting with the active player (CR 101.4).
  const order = (pid: PlayerId) => (s.turnOrder.indexOf(pid) - s.turnOrder.indexOf(s.activePlayer) + s.turnOrder.length) % s.turnOrder.length;
  groups.sort(([a], [b]) => order(a) - order(b));
  for (const [owner, cards] of groups) (s.graveyardOrders ??= []).push({ owner, cards });
}

/**
 * A merged permanent was put into its owner's library (CR 730.3a): its cards there (`cards`, the new objects) wait to be
 * arranged by their owner, as cards put into a graveyard together do, unless the library is shuffled first.
 */
export function noteMergedToLibrary(s: GameState, owner: PlayerId, cards: { id: ObjectId; zc: number }[], bottom: boolean) {
  const here = cards.filter((c) => s.objects[c.id]?.zone === "library" && s.objects[c.id]!.owner === owner);
  if (here.length < 2) return;
  (s.graveyardOrders ??= []).push({ owner, cards: here, library: { bottom, shuffles: player(s, owner).shuffles ?? 0 } });
}

/** Ask the next owner to arrange cards that went to their graveyard (or library) together. False if there's nothing to arrange. */
export function askGraveyardOrder(s: GameState): boolean {
  while (s.graveyardOrders?.length) {
    const g = s.graveyardOrders.shift()!;
    const p = player(s, g.owner);
    if (g.library) {
      // Shuffled since, the cards aren't where they were put (CR 701.24a).
      if ((p.shuffles ?? 0) !== g.library.shuffles || p.lost) continue;
      const there = new Set(g.cards.filter((c) => s.objects[c.id]?.zone === "library" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id));
      if (there.size < 2) continue;
      const by = g.library.by !== undefined && g.library.by !== p.id && !player(s, g.library.by).lost ? g.library.by : undefined;
      s.pending = { kind: "orderLibrary", player: by ?? p.id, ...(by !== undefined ? { owner: p.id } : {}), cards: p.library.filter((id) => there.has(id)), ...(g.library.bottom ? { bottom: true as const } : {}), source: g.library.source ?? "The cards of a merged permanent put into your library" };
      return true;
    }
    const here = new Set(g.cards.filter((c) => s.objects[c.id]?.zone === "graveyard" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id));
    if (here.size < 2 || p.lost) continue;
    s.pending = { kind: "orderGraveyard", player: p.id, cards: p.graveyard.filter((id) => here.has(id)).reverse(), source: "Cards put into your graveyard at the same time" };
    return true;
  }
  s.graveyardOrders = undefined;
  return false;
}

/** "Reorder your graveyard as you choose" (Fossil Find): the owner arranges all of it. */
export function askWholeGraveyardOrder(s: GameState, pid: PlayerId, source: string): boolean {
  const p = player(s, pid);
  if (p.graveyard.length < 2) return false;
  s.pending = { kind: "orderGraveyard", player: pid, cards: [...p.graveyard].reverse(), source, whole: true };
  return true;
}

/** The answer to orderGraveyard: `order` is the cards, top first. */
export function orderGraveyard(s: GameState, p: Player, order: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "orderGraveyard" || pend.player !== p.id) throw new RulesError("nothing to arrange");
  if (order.length !== pend.cards.length || new Set(order).size !== order.length || order.some((id) => !pend.cards.includes(id))) throw new RulesError("put each of those cards in the order once");
  const yard = p.graveyard;
  const slots = pend.cards.map((id) => yard.indexOf(id)).sort((a, b) => a - b); // from the bottom up
  [...order].reverse().forEach((id, i) => (yard[slots[i]!] = id));
  s.pending = null;
  log(s, `${p.name} puts ${order.length} cards in their graveyard in this order, top first: ${order.map((id) => defOf(s, s.objects[id]!).name).join(", ")}.`);
  if (s.resolving) continueResolution(s);
}

/** The answer to orderLibrary: `order` is the cards, the one nearest the top first. The order isn't revealed (CR 730.3a). */
export function orderLibrary(s: GameState, p: Player, order: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "orderLibrary" || pend.player !== p.id) throw new RulesError("nothing to arrange");
  if (order.length !== pend.cards.length || new Set(order).size !== order.length || order.some((id) => !pend.cards.includes(id))) throw new RulesError("put each of those cards in the order once");
  const owner = player(s, pend.owner ?? p.id);
  const lib = owner.library;
  const slots = pend.cards.map((id) => lib.indexOf(id)).sort((a, b) => a - b); // from the top down
  order.forEach((id, i) => (lib[slots[i]!] = id));
  s.pending = null;
  log(s, `${p.name} puts ${order.length} cards ${pend.bottom ? "on the bottom of" : "on top of"} ${owner === p ? "their" : `${owner.name}'s`} library in the order they choose.`);
  if (pend.thenDraw) continueDraws(s, p.id, pend.thenDraw.left, pend.thenDraw.after, pend.thenDraw.made);
  else if (s.resolving) continueResolution(s);
}

/**
 * "The top creature card of your graveyard": the topmost card there that matches (the one put there most recently,
 * rulings), or with `bottom` the bottommost. `only`: only the top (bottom) card, if it matches ("if the top card of
 * target player's graveyard is a creature card").
 */
export function graveyardEnd(s: GameState, pid: PlayerId, opts: { filter?: TargetSpec; bottom?: boolean; only?: boolean } = {}): GameObject | undefined {
  const yard = player(s, pid).graveyard.map((id) => s.objects[id]!);
  if (!opts.bottom) yard.reverse();
  // Nothing changes the characteristics of a card in a graveyard, so the printed card is what's checked.
  const fits = (o: GameObject) => !opts.filter || printedMatches(opts.filter, defOf(s, o));
  return opts.only ? (yard[0] && fits(yard[0]) ? yard[0] : undefined) : yard.find(fits);
}

/** "~ is in your graveyard with a creature card directly above it" (Krovikan Horror): the card just above it is one. */
export function creatureCardAbove(s: GameState, o: GameObject): boolean {
  if (o.zone !== "graveyard") return false;
  const yard = player(s, o.owner).graveyard;
  const above = yard[yard.indexOf(o.id) + 1];
  return !!above && defOf(s, s.objects[above]!).types.includes("Creature");
}

/** Nether Shadow: how many creature cards are above `o` in its owner's graveyard (put there after it, rulings). */
export function creatureCardsAbove(s: GameState, o: GameObject): number {
  if (o.zone !== "graveyard") return 0;
  const yard = player(s, o.owner).graveyard;
  return yard.slice(yard.indexOf(o.id) + 1).filter((id) => defOf(s, s.objects[id]!).types.includes("Creature")).length;
}

/** "The top three black cards of your graveyard": the topmost `n` cards there that match, top first (fewer if there aren't). */
export function topGraveyardCards(s: GameState, pid: PlayerId, n: number, filter?: TargetSpec): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of [...player(s, pid).graveyard].reverse()) {
    if (out.length >= n) break;
    if (!filter || printedMatches(filter, defOf(s, s.objects[id]!))) out.push(id);
  }
  return out;
}

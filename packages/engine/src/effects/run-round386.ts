// Round 386's effects: Parallel Thoughts' draw replacement (game.ts drawReplacementChoices, with round 385's pileInstead)
// and Memory Vessel's ban on playing cards from the hand.
import { log, nameOf, obj, player } from "../game";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";

/** The cards still in the face-down pile linked to permanent `id` as it is now (CR 607.2a), the top one first. */
export function pileCards(s: GameState, id: ObjectId): ObjectId[] {
  const o = s.objects[id];
  if (!o) return [];
  return (s.linkedExile?.[`${id}@${o.zoneChanges ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (obj(s, l.id).zoneChanges ?? 0) === l.zc).map((l) => l.id);
}

/** Parallel Thoughts' choice for a draw: the pile's top card, or, with the pile empty, nothing (it may still replace the draw, rulings). */
export function pileDrawLabel(s: GameState, id: ObjectId): string {
  const n = pileCards(s, id).length;
  return n ? `Put the top card of the exiled pile into your hand instead (${n === 1 ? "1 card left" : `${n} cards left`}; ${nameOf(s, id)})` : `Put the top card of the exiled pile into your hand instead: it's empty, so nothing happens (${nameOf(s, id)})`;
}

/**
 * Memory Vessel: "Until your next turn, ... they can't play cards from their hand": every player, the controller too,
 * neither casts spells nor plays lands from their hand (game.ts handPlayBanned, CR 101.2) until the controller's next turn
 * begins (CR 611.2b), or would have begun if they left the game (CR 800.4m). Other zones' permissions still work (rulings).
 */
export function runNoHandPlaysEffect(s: GameState, ctx: ResolveCtx, src: string) {
  (s.handPlayBansUntil ??= []).push({ controller: ctx.controller, source: src });
  log(s, `Until ${player(s, ctx.controller).name}'s next turn, players can't play cards from their hand (${src}).`);
}

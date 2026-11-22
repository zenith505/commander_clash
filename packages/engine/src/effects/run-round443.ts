// Round 443's effects: Etrata, Deadly Fugitive's "exile it, then you may cast the exiled card without paying its mana
// cost", after its granted ability couldn't turn the creature face up.
import { defOf } from "../cards";
import { freeCastable, log, moveObject } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";

/**
 * Etrata, Deadly Fugitive (Effect exileSelfCastFree): the source, still that object on the battlefield (CR 400.7), is
 * exiled (a face-down one is revealed as it leaves, CR 708.9); gone already, nothing happens. Then its controller may cast
 * the exiled card as this resolves, without paying its mana cost: timing doesn't matter (CR 608.2g), an {X} is 0 (CR
 * 107.3b), it still needs legal targets (CR 601.2c), and a land card or a card that can't be cast stays exiled (rulings).
 * A token isn't a card: it can't be cast, and it ceases to exist (CR 111.7, 704.5d). Asked once (scratch): casting it is
 * the castFree decision's castSpell, declining a chooseMay.
 */
export function runExileSelfCastFreeEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  if (sc.exileSelfCastAsked) return;
  const me = objects(s, { ref: "self" }, ctx)[0];
  if (!me) {
    log(s, `${src}: it's no longer on the battlefield, so nothing is exiled.`);
    return;
  }
  const token = !!me.isToken;
  moveObject(s, me.id, "exile");
  const o = s.objects[me.id];
  if (!o || o.zone !== "exile") return;
  const name = defOf(s, o).name;
  log(s, `${src}: ${name} is exiled.`);
  if (token) return;
  sc.exileSelfCastAsked = true;
  s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src };
  if (freeCastable(s, ctx.controller, o.id)) return "paused";
  s.pending = null;
  log(s, `${name} can't be cast, so it stays in exile (${src}).`);
}

// Round 363's effects.
import { defOf } from "../cards";
import { livingPlayers, log, obj, player } from "../game";
import type { Effect } from "../abilities";
import type { GameState } from "../types";
import { toBottom } from "./run-library";
import { apnap, objects, type ResolveCtx } from "./resolve";

/**
 * Trial of a Time Lord: "the owner of each card exiled with ~ puts that card on the bottom of their library": the cards ~
 * exiled until it leaves the battlefield, still those cards in exile (CR 400.7), while ~ is still that object on the
 * battlefield (once it has left they're back already, CR 610.3). Each owner puts theirs on the bottom in the order they
 * choose (CR 401.4), owners in APNAP order; once there, they don't return when ~ leaves (rulings).
 */
export function runUntilLeavesToBottomEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const me = objects(s, { ref: "self" }, ctx)[0];
  if (!me || me.zone !== "battlefield") return;
  const cards = (me.exiledUntilLeaves ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).map((l) => l.id);
  const sc = (s.resolving!.scratch ??= {});
  for (const pid of apnap(s, livingPlayers(s))) {
    const theirs = cards.filter((id) => obj(s, id).owner === pid);
    if (!theirs.length) continue;
    if (!sc.arranged) log(s, `${player(s, pid).name} puts ${theirs.map((id) => defOf(s, obj(s, id)).name).join(", ")} from exile on the bottom of their library.`);
    if (toBottom(s, pid, theirs, src, false) === "paused") return "paused";
    sc.arranged = undefined;
  }
  me.exiledUntilLeaves = (me.exiledUntilLeaves ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
}

/**
 * Gale's Redirection: the card exiled from the stack by this resolution (not a copy, which ceased to exist, CR 707.10a),
 * castable by this ability's controller for as long as it remains that card in exile (CR 400.7), with its normal timing
 * and costs (CR 601.2; with `anyColor`, mana as though it were of any color, CR 609.4b) or, with `free`,
 * without paying its mana cost (CR 118.9; X is 0, CR 107.3).
 */
export function runMayCastExiledSpellEffect(s: GameState, e: Extract<Effect, { type: "mayCastExiledSpell" }>, ctx: ResolveCtx) {
  const at = s.resolving?.exiledFromStack;
  const ex = at ? s.objects[at.id] : undefined;
  if (!ex || ex.zone !== "exile" || (ex.zoneChanges ?? 0) !== at!.zc || ex.isToken || ex.spellCopy) return;
  ex.mayPlay = { player: ctx.controller, zc: ex.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true, ...(e.free ? { free: true as const } : {}), ...(e.anyColor ? { anyColor: true as const } : {}) };
  log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, ex).name}${e.free ? " without paying its mana cost" : ""} for as long as it remains exiled${e.anyColor ? ", spending mana as though it were mana of any color" : ""}.`);
}

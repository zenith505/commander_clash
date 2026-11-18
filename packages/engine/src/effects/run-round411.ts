// Round 411's effects: Guff Rewrites History's shuffle, exile and free casts for each player.
import type { Effect } from "../abilities";
import { defOf, isType } from "../cards";
import { freeCastable, log, moveObject, obj, player } from "../game";
import { controllerOf } from "../layers";
import { shuffle } from "../rng";
import type { GameState, ObjectId, PlayerId } from "../types";
import { type ResolveCtx, apnap, objects, runEffect } from "./resolve";
import { closeZoneBatch } from "./triggers";

/**
 * Guff Rewrites History: "Those permanents' owners shuffle them into their libraries. Each player who controlled one of
 * those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the
 * bottom of their library in a random order. Each player may cast the nonland card they exiled without paying its mana
 * cost."
 *
 * The targets still legal as it resolves are shuffled into their owners' libraries at once (CR 701.24, a commander going
 * to the command zone instead, CR 903.9b); an illegal target isn't affected (CR 608.2b), and as with Vaevictis Asmadi's
 * "each player who sacrificed a permanent this way" (rulings), its controller doesn't exile. "Controlled" is who controlled
 * each one as it left: that player exiles from their own library, whoever owned the permanent. Each of them, in turn
 * order from the active player (CR 101.4), exiles one card at a time until a nonland card (the whole library with none,
 * rulings on similar cards) and puts the others on the bottom in a random order. Then each of them, in the same order, may
 * cast the nonland card they exiled as this resolves (CR 608.2g), timing ignored, for free (CR 118.9: no alternative
 * costs, X is 0, CR 107.3b); one not cast stays in exile.
 */
export function runGuffRewriteEffect(s: GameState, e: Extract<Effect, { type: "guffRewrite" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.guff) {
    const targets = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield");
    const controllers = new Set<PlayerId>(targets.map((o) => controllerOf(s, o)));
    if (targets.length) runEffect(s, { type: "shuffleIntoLibrary", what: e.what }, ctx);
    const casts: { pid: PlayerId; id: ObjectId; zc: number }[] = [];
    for (const pid of apnap(s, [...controllers])) {
      const p = player(s, pid);
      if (p.lost) continue;
      const at = p.library.findIndex((id) => !isType(defOf(s, obj(s, id)), "Land"));
      const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
      const hit = at < 0 ? undefined : p.library[at];
      for (const id of seen) {
        moveObject(s, id, "exile");
        closeZoneBatch(s); // one at a time (rulings on Laelia)
      }
      log(s, `${src}: ${p.name} exiles ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${hit === undefined ? ", finding no nonland card" : ""}.`);
      const rest = seen.filter((id) => id !== hit && s.objects[id]?.zone === "exile");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts the other ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      if (hit !== undefined && s.objects[hit]?.zone === "exile") casts.push({ pid, id: hit, zc: obj(s, hit).zoneChanges ?? 0 });
    }
    sc.guff = { casts, i: 0 };
  }
  const g = sc.guff!;
  while (g.i < g.casts.length) {
    const { pid, id, zc } = g.casts[g.i++]!;
    const o = s.objects[id];
    if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== zc || player(s, pid).lost) continue;
    // castProblem judges the cast against the pending free cast, so it's set first.
    s.pending = { kind: "castFree", player: pid, objectId: id, source: src };
    if (freeCastable(s, pid, id)) return "paused";
    s.pending = null;
    log(s, `${defOf(s, o).name} can't be cast.`);
  }
}

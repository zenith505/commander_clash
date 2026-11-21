// Lane B round B283's effects: Uvilda, Dean of Perfection's refine counters on a card in exile and the two triggers it
// gains (refineExiled, from run-library.ts takeFromHand; refineTick, refineCast), and Synthesis Pod's reveal (podReveal).
// The Dragon-Kami Reborn needed no effect of its own (exileFaceDown `counter`, castFromAmong `ownExileCounter`).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { countersRemoved, removableCounters } from "../counters";
import { defMv } from "../faces";
import { freeCastable, log, moveObject, obj, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import { shuffleLibrary } from "../rng";
import type { GameObject, GameState } from "../types";
import { amountNow, players, type ResolveCtx } from "./resolve";
import { fireEvent } from "./triggers";

type B283Effect = Extract<Effect, { type: "refineTick" | "refineCast" | "podReveal" }>;

/**
 * Uvilda: "put three refine counters on it. It gains ...": the counters (CR 122.1) and the two abilities, which work in
 * exile (CR 113.6) for as long as it's this object there (CR 400.7).
 */
export function refineExiled(s: GameState, o: GameObject, n: number): void {
  if (o.zone !== "exile") return;
  o.counters.refine = (o.counters.refine ?? 0) + n;
  o.refined = o.zoneChanges ?? 0;
  invalidateCharacteristics(s);
  log(s, `${defOf(s, o).name} is exiled with ${n} refine counter${n === 1 ? "" : "s"} on it.`);
}

/** The card the trigger is about, still that object in exile (CR 400.7), or undefined. */
function exiledSubject(s: GameState, ctx: ResolveCtx): GameObject | undefined {
  const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
  return o && o.zone === "exile" && (o.zoneChanges ?? 0) === ctx.subject!.zc && o.refined === ctx.subject!.zc ? o : undefined;
}

export function runLaneB283Effect(s: GameState, e: B283Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "refineTick": {
      // "At the beginning of your upkeep, if this card is exiled, remove a refine counter from it": the intervening if
      // again as it resolves (CR 603.4). Removing the last one triggers its other ability (CR 603.2, 122.1).
      const o = exiledSubject(s, ctx);
      if (!o || (o.counters.refine ?? 0) <= 0 || removableCounters(s, o, "refine") <= 0) return;
      const left = o.counters.refine! - 1;
      if (left > 0) o.counters.refine = left;
      else delete o.counters.refine;
      invalidateCharacteristics(s);
      log(s, `${defOf(s, o).name} loses a refine counter${left ? ` (${left} left)` : ""}.`);
      countersRemoved(s, o, "refine", 1);
      if (!left) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "refine", by: ctx.controller });
      return;
    }
    case "refineCast": {
      // "When the last refine counter is removed from this card, if it's exiled, you may cast it. It costs {4} less to cast
      // this way.": its owner, who controls the trigger (CR 113.8), may cast it now as it resolves, timing ignored (CR
      // 608.2g, rulings), paying its costs (CR 601.2f-h) less {4} of generic mana (rulings: never colored). Not cast, it
      // stays exiled with no refine counters and can't be cast later this way (rulings).
      const o = exiledSubject(s, ctx);
      if (!o) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      sc.may = false;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "paid", less: 4 };
      if (freeCastable(s, ctx.controller, o.id, true)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast; it stays in exile.`);
      return;
    }
    case "podReveal": {
      // Synthesis Pod: the target opponent reveals from the top until a card with exactly that mana value (a card's in the
      // library, an {X} counting 0, CR 202.3, 202.3e; a modal double-faced card's front face's, 712.8a), any card type.
      // That card is exiled; the others revealed stay where they are for the shuffle (CR 701.20a). With none, every card
      // is revealed, nothing is exiled, and the library is shuffled. Then you may cast the exiled card free as this
      // resolves, timing ignored (rulings, CR 608.2g); not cast, it stays exiled.
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      const pid = players(s, { ref: "target", index: 0 }, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      const want = amountNow(s, e.mv, ctx);
      const at = p.library.findIndex((id) => defMv(defOf(s, obj(s, id))) === want);
      const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
      const hit = at < 0 ? undefined : p.library[at];
      log(s, `${p.name} reveals ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${hit ? "" : `, finding no card with mana value ${want}`}.`);
      if (hit) {
        moveObject(s, hit, "exile");
        log(s, `${p.name} exiles ${defOf(s, obj(s, hit)).name}.`);
      }
      shuffleLibrary(s, p);
      log(s, `${p.name} shuffles their library.`);
      sc.may = false;
      if (!hit || obj(s, hit).zone !== "exile") return;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: hit, source: src };
      if (freeCastable(s, ctx.controller, hit)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, obj(s, hit)).name} can't be cast; it stays in exile.`);
      return;
    }
  }
}

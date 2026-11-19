// Round 421's effects: Lady Loki, Agent of Chaos's "exile it" (the spell that triggered it) and "You may cast that card
// without paying its mana cost" for the nonland card its exileUntilNonland ("keep") exiled.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { freeCastable, log } from "../game";
import { characteristics } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { counterOnStack } from "./run-spells";

type R421Effect = Extract<Effect, { type: "exileCause" | "castRevealedFree" }>;

export function runRound421Effect(s: GameState, e: R421Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileCause": {
      // The spell whose casting triggered this, only while it's still that spell on the stack (CR 400.7): exiled, not
      // countered (so "can't be countered" doesn't stop it, CR 701.6a). Gone already (resolved, countered), nothing happens;
      // its mana value is still read as it last existed on the stack (amounts.ts castSpell, CR 608.2h).
      const item = ctx.cause === undefined ? undefined : s.stack.find((x) => x.id === ctx.cause && x.kind === "spell");
      if (!item) return;
      // Round 422 (Possibility Storm): its card types as it last existed on the stack (CR 608.2h), for "a card that shares
      // a card type with it" once it's in exile, a new object (CR 400.7).
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (o && s.resolving) s.resolving.causeTypes = [...characteristics(s, o).types];
      return counterOnStack(s, ctx, ctx.cause, src, undefined, "exile", true);
    }
    case "castRevealedFree": {
      // Asked once (scratch): casting it is the castFree decision's castSpell, declining is a chooseMay (CR 608.2g). Cast
      // as this resolves, so its card type's timing doesn't matter; it still needs legal targets (CR 601.2c). An {X} in
      // its cost is 0 (CR 107.3b).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.castRevealedAsked) return;
      const hit = r.revealed;
      const o = hit ? s.objects[hit.id] : undefined;
      if (!hit || !o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== hit.zc) return;
      sc.castRevealedAsked = true;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src };
      if (freeCastable(s, ctx.controller, o.id)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast, so it stays in exile (${src}).`);
      return;
    }
  }
}

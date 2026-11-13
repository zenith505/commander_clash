// Round 349's effects: a card exiled from the top of a library as "it" (Omen Machine), and "casts it without paying its
// mana cost if able" (Omen Machine, Wild Evocation).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { freeCastable, log, moveObject, player } from "../game";
import type { GameState } from "../types";
import { players, type ResolveCtx } from "./resolve";

type R349Effect = Extract<Effect, { type: "exileTopAsIt" | "castItIfAble" }>;

export function runRound349Effect(s: GameState, e: R349Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileTopAsIt": {
      // The top card of `who`'s library, exiled face up (CR 406.3); "it" from now on is that card in exile (CR 400.7).
      // An empty library: nothing is exiled, and an "if it's a land card" after it is false.
      const whose = players(s, e.who, ctx)[0];
      if (whose === undefined) return;
      const p = player(s, whose);
      const id = p.library[0];
      s.resolving!.revealed = undefined;
      if (!id) {
        log(s, `${p.name} has no cards in their library to exile (${src}).`);
        return;
      }
      log(s, `${p.name} exiles ${defOf(s, s.objects[id]!).name} from the top of their library (${src}).`);
      moveObject(s, id, "exile");
      const o = s.objects[id]!;
      if (o.zone === "exile") s.resolving!.revealed = { id, zc: o.zoneChanges ?? 0 };
      return;
    }
    case "castItIfAble": {
      // "It": the card the instruction before named, still that object in a hand or in exile (CR 400.7).
      const rv = s.resolving?.revealed;
      const o = rv ? s.objects[rv.id] : undefined;
      if (!rv || !o || (o.zoneChanges ?? 0) !== rv.zc || (o.zone !== "hand" && o.zone !== "exile")) return;
      const who = players(s, e.who, ctx)[0];
      if (who === undefined || player(s, who).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      // Asked once; casting it is a castSpell action, which ends the question (CR 608.2g).
      if (sc.castItAsked) return;
      sc.castItAsked = true;
      // Offered when it can be cast one way or another, a mandatory additional cost in mana included: its player may then
      // pay it with mana they make, or decline (rulings on Wild Evocation); timing for its card type is ignored (rulings).
      // (The pending free cast first: castProblem asks it whether the card may be cast now and for free.)
      s.pending = { kind: "castFree", player: who, objectId: o.id, source: src, must: true };
      if (freeCastable(s, who, o.id, true)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast, so it stays ${o.zone === "hand" ? `in ${player(s, o.owner).name}'s hand` : "in exile"} (${src}).`);
      return;
    }
  }
}

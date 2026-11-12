// Lane B round B185's effects.
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { copiableDef } from "../copies";
import { enterTogether, log, moveObject, obj, opponents, player, turnOrderFrom } from "../game";
import { controllerOf } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { toBottom } from "./run-library";
import { tokenCopies } from "./run-tokens";
import { printedMatches } from "./targeting";

type B185Effect = Extract<Effect, { type: "opponentsChooseFromTop" | "copiesBlockingAttackers" }>;

const name = (s: GameState, id: string) => defOf(s, obj(s, id)).name;

export function runLaneB185Effect(s: GameState, e: B185Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "copiesBlockingAttackers": {
      // Mirror Match: the creatures attacking you, or a planeswalker you control (not a battle), as it resolves; each
      // copy blocking the creature it copies even if it couldn't block it (rulings), all created at once.
      const you = ctx.controller;
      const attackers = s.battlefield.map((id) => obj(s, id)).filter((o) => {
        if (o.attacking === undefined || !objIsType(s, o, "Creature")) return false;
        const at = o.attackingPermanent && s.objects[o.attackingPermanent.id];
        if (o.attackingPermanent) return !!at && at.zone === "battlefield" && (at.zoneChanges ?? 0) === o.attackingPermanent.zc && objIsType(s, at, "Planeswalker") && controllerOf(s, at) === you;
        return o.attacking === you;
      });
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const o of attackers) tokenCopies(s, you, copiableDef(s, o), 1, ctx, { blocking: o });
      });
      return;
    }
    case "opponentsChooseFromTop": {
      // Manifold Insights: the cards revealed at once, then each opponent in turn order starting after you (CR 101.4
      // doesn't apply: the card says where to start) chooses one nonland card no one has chosen; no player acts meanwhile
      // (rulings). With fewer such cards than opponents, every one of them ends up chosen (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const me = player(s, ctx.controller);
      if (!sc.insights) {
        const revealed = me.library.slice(0, e.n);
        if (!revealed.length) return;
        log(s, `${me.name} reveals the top ${revealed.length === 1 ? "card" : `${revealed.length} cards`} of their library (${revealed.map((id) => name(s, id)).join(", ")}).`);
        const opps = opponents(s, ctx.controller);
        sc.insights = { revealed, chosen: [], left: turnOrderFrom(s, ctx.controller).filter((p) => opps.includes(p)) };
      }
      const st = sc.insights;
      if (st.asking !== undefined) {
        const pick = (sc.found ?? []).find((id) => st.revealed.includes(id) && !st.chosen.includes(id));
        sc.found = undefined;
        if (pick) {
          st.chosen.push(pick);
          log(s, `${player(s, st.asking).name} chooses ${name(s, pick)} (${src}).`);
        }
        st.asking = undefined;
      }
      const still = (id: string) => s.objects[id]?.zone === "library" && me.library.includes(id);
      while (st.left.length) {
        const opp = st.left.shift()!;
        if (player(s, opp).lost) continue;
        const options = st.revealed.filter((id) => still(id) && !st.chosen.includes(id) && printedMatches(e.filter, defOf(s, obj(s, id))));
        if (!options.length) break;
        if (options.length === 1) {
          st.chosen.push(options[0]!);
          log(s, `${player(s, opp).name} chooses ${name(s, options[0]!)} (${src}), the only one left.`);
          continue;
        }
        st.asking = opp;
        s.pending = { kind: "searchLibrary", player: opp, source: src, what: `a different ${e.filter.text}`, cards: options, min: 1, max: 1, dig: { looked: st.revealed, to: `to put into ${me.name}'s hand`, rest: st.left.some((x) => !player(s, x).lost) ? `are left for the next opponent to choose from, and those no one chooses go on the bottom of ${me.name}'s library` : `go on the bottom of ${me.name}'s library` }, forPlayer: ctx.controller, helps: true };
        return "paused";
      }
      // The chosen cards into your hand and the rest to the bottom in a random order, as one instruction.
      const chosen = st.chosen.filter(still);
      if (!sc.insightsMoved) {
        sc.insightsMoved = true;
        if (chosen.length) log(s, `${me.name} puts ${chosen.map((id) => name(s, id)).join(", ")} into their hand (${src}).`);
        for (const id of chosen) moveObject(s, id, "hand");
      }
      const rest = st.revealed.filter((id) => still(id) && !chosen.includes(id));
      if (toBottom(s, ctx.controller, rest, src, true) === "paused") return "paused";
      sc.insights = undefined;
      sc.insightsMoved = undefined;
      return;
    }
  }
}

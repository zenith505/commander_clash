// Round 350's effects: a card exiled by a trigger, linked to the tokens it created (Timothar, Baron of Bats), and cards
// put onto the battlefield from a graveyard at your next end step (Desert Warfare).
import type { Effect } from "../abilities";
import { cardIdOf } from "../cards";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";

type R350Effect = Extract<Effect, { type: "linkSubjectCardToCreated" | "putAtYourNextEndStep" }>;

export function runRound350Effect(s: GameState, e: R350Effect, ctx: ResolveCtx): "paused" | void {
  switch (e.type) {
    case "linkSubjectCardToCreated": {
      // The trigger's card, moved from the graveyard to exile by this resolution (its next zone change, CR 400.7), is "the
      // exiled card" of every token this resolution created: with several (a replacement effect), any of them can return
      // it (rulings). Not exiled (it had left the graveyard), nothing is linked.
      const card = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!card || card.zone !== "exile" || (card.zoneChanges ?? 0) !== ctx.subject!.zc + 1) return;
      for (const t of s.resolving?.created ?? []) {
        const tok = s.objects[t];
        if (tok?.zone !== "battlefield") continue;
        ((s.linkedExile ??= {})[`${t}@${tok.zoneChanges ?? 0}`] ??= []).push({ id: card.id, zc: card.zoneChanges ?? 0 });
      }
      return;
    }
    case "putAtYourNextEndStep": {
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      for (const card of objects(s, e.what, ctx)) {
        if (card.zone !== "graveyard") continue;
        addDelayed(s, "yourNextEndStep", ctx.controller, card, { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "graveyard" }, under: { ref: "you" } }], text: "Put that card onto the battlefield under your control." }, src ? cardIdOf(src) : cardIdOf(card));
      }
      return;
    }
  }
}

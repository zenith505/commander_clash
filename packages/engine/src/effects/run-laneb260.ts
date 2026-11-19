// Lane B round B260's effects: Minamo's Meddling's "discards each card with the same name as a card spliced onto that
// spell" (discardSplicedNames).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, obj, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { players } from "./resolve";
import { discardCards } from "./run-library";
import { printedMatches } from "./targeting";

type B260Effect = Extract<Effect, { type: "discardSplicedNames" }>;

export function runLaneB260Effect(s: GameState, e: B260Effect, ctx: ResolveCtx, _src: string): "paused" | void {
  switch (e.type) {
    // Minamo's Meddling: "That spell's controller reveals their hand, then discards each card with the same name as a card
    // spliced onto that spell." The spell's controller as resolution began (CR 608.2h), countered or not (one that can't
    // be countered is still a legal target, CR 701.6a); the names of the cards revealed to splice onto it as it was cast
    // (CR 702.47a), none for a spell nothing was spliced onto (a copy too: it wasn't cast). Every card in the hand with one
    // of those names, the spliced cards themselves among them (they stayed in the hand, CR 702.47a), discarded at once.
    case "discardSplicedNames": {
      const pid = players(s, { ref: "targetController", index: e.spell }, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      const hand = p.hand.map((id) => defOf(s, obj(s, id)).name);
      log(s, hand.length ? `${p.name} reveals their hand: ${hand.join(", ")}.` : `${p.name} reveals an empty hand.`);
      const names = s.resolving?.spellSpliced?.[e.spell] ?? [];
      if (!names.length) return;
      const named = { kind: "card" as const, types: [], notTypes: [], notColors: [], namedAny: [...new Set(names)], text: "card with the same name as a spliced card" };
      const hit = p.hand.filter((id) => printedMatches(named, defOf(s, obj(s, id))));
      if (hit.length) discardCards(s, pid, hit, "", false, false, ctx.controller);
      return;
    }
  }
}

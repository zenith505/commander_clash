// Lane B round B241's effects: Lucius the Eternal (exileSelfUntilTargetLeaves).
import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log } from "../game";
import type { GameState } from "../types";
import { objects, runEffect, type ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";

type B241Effect = Extract<Effect, { type: "exileSelfUntilTargetLeaves" }>;

export function runLaneB241Effect(s: GameState, e: B241Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exileSelfUntilTargetLeaves": {
      // "Exile it": the card the dies trigger came from, still in the graveyard as that object (CR 400.7, 603.10a); a
      // commander its owner put into the command zone, or a card that has left the graveyard, is a new object it can't find.
      const card = objects(s, { ref: "selfCard" }, ctx).find((o) => o.zone === "graveyard" && o.id === ctx.sourceId);
      // "Choose target creature an opponent controls": the target, legal as this resolves (one illegal target and the
      // ability doesn't resolve at all, CR 608.2b, rulings: Lucius stays in the graveyard).
      const watched = objects(s, { ref: "target", index: 0 }, ctx).find((o) => o.zone === "battlefield");
      if (!card) return void log(s, `${src} isn't in the graveyard, so it isn't exiled.`);
      const zc = card.zoneChanges ?? 0;
      const paused = runEffect(s, { type: "exile", what: { ref: "selfCard" } }, ctx);
      if (paused === "paused") return "paused";
      const now = s.objects[card.id];
      // Only a card this exiled, one zone change later in exile, comes back (CR 400.7).
      if (!now || now.zone !== "exile" || (now.zoneChanges ?? 0) !== zc + 1 || !watched) return;
      const cards = [{ id: now.id, zc: now.zoneChanges ?? 0 }];
      // "When that creature leaves the battlefield": a delayed triggered ability with no end (CR 603.7c), about the target
      // as it is now (CR 400.7), whatever zone it goes to (CR 603.6c); it returns the card "under its owner's control"
      // (CR 110.2a), if it's still that object in exile.
      const name = defOf(s, now).name;
      addDelayed(s, "leaves", ctx.controller, watched, { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "remembered", cards }, owner: true }], text: `Return ${name} from exile to the battlefield under its owner's control.` }, cardIdOf(now));
      s.delayed![s.delayed!.length - 1]!.to = ["graveyard", "exile", "hand", "library", "command"];
      log(s, `${name} returns from exile when ${defOf(s, watched).name} leaves the battlefield (${src}).`);
      return;
    }
  }
}

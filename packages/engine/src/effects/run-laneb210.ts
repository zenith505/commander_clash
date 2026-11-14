// Lane B round B210's effects.
import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log, moveObject } from "../game";
import type { GameState } from "../types";
import { fireEvent } from "./triggers";
import { type ResolveCtx, objects } from "./resolve";
import { addDelayed } from "./run-spells";

type B210Effect = Extract<Effect, { type: "cumulativeUpkeepUnpaid" | "exileReturnWhenSourceLeaves" }>;

export function runLaneB210Effect(s: GameState, e: B210Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "cumulativeUpkeepUnpaid": {
      // Thought Lash: "When a player doesn't pay ~'s cumulative upkeep": the player who could have paid it, its controller
      // (CR 702.24a), while ~ is still on the battlefield (it's sacrificed next, rulings).
      const o = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      if (o?.zone === "battlefield") fireEvent(s, { type: "cumulativeUpkeepUnpaid", id: o.id, player: ctx.controller });
      return;
    }
    case "exileReturnWhenSourceLeaves": {
      // Portcullis: the creature that entered, if it's still that permanent (rulings: otherwise nothing happens), exiled;
      // then "Return that card to the battlefield under its owner's control when ~ leaves the battlefield", a delayed
      // trigger made as part of this ability (CR 603.7), about that card in exile (CR 400.7). It triggers however ~ leaves,
      // even if it has lost its abilities by then (rulings); if ~ has already left, it never will, and the card stays
      // exiled. A token exiled this way ceases to exist (CR 704.5d), so nothing returns.
      const it = objects(s, { ref: "subject" }, ctx).find((o) => o.zone === "battlefield");
      if (!it) return;
      const name = defOf(s, it).name;
      moveObject(s, it.id, "exile");
      const card = s.objects[it.id];
      if (!card || card.zone !== "exile") return;
      const me = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) {
        log(s, `${src} has left the battlefield, so ${name} stays exiled.`);
        return;
      }
      const body = { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard", zone: "public" }, owner: true } as Effect], text: `Return ${name} to the battlefield under its owner's control.` };
      addDelayed(s, "leaves", ctx.controller, me, body, cardIdOf(me));
      Object.assign(s.delayed![s.delayed!.length - 1]!, { to: ["graveyard", "exile", "hand", "library", "command"], about: { id: card.id, zc: card.zoneChanges ?? 0 } });
      return;
    }
  }
}

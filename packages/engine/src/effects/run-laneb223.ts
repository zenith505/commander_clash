// Lane B round B223's effects: Maddening Imp (delayedForAffected).
import type { Effect, ObjRef } from "../abilities";
import { cardIdOf } from "../cards";
import { log, nameOf } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";

type B223Effect = Extract<Effect, { type: "delayedForAffected" }>;

export function runLaneB223Effect(s: GameState, e: B223Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "delayedForAffected": {
      // Maddening Imp: "those creatures" are the ones the continuous effect before this changed, locked in as it began (CR
      // 611.2c), remembered by one delayed triggered ability (CR 603.7), each as the object it is now (CR 603.7c, 400.7).
      const cards = (s.resolving?.affected ?? []).filter((c) => s.objects[c.id]?.zone === "battlefield" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc);
      const fill = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(fill);
        if (!v || typeof v !== "object") return v;
        const o = v as Record<string, unknown>;
        if (o.ref === "rememberedPermanents") return { ...(o as ObjRef), cards } as ObjRef;
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fill(x)]));
      };
      const body = { targets: [], effects: fill(e.effects) as Effect[], text: e.text };
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const cardId = s.resolving?.item.sourceCardId ?? (me ? cardIdOf(me) : undefined);
      // Its source is the ability's (CR 603.7d), even once that has left the battlefield (a token that has ceased to exist
      // too, CR 111.7: the delayed trigger works on its own once made).
      if (me) addDelayed(s, e.when, ctx.controller, me, body, cardId);
      else if (ctx.sourceId && cardId) (s.delayed ??= []).push({ when: e.when, controller: ctx.controller, sourceCardId: cardId, subject: { id: ctx.sourceId, zc: ctx.sourceZc ?? 0 }, body, turn: s.turn, step: s.step });
      else return;
      log(s, `${src}: at the beginning of the next end step, ${cards.length ? `${cards.map((c) => nameOf(s, c.id)).join(", ")}: ` : ""}${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`);
      return;
    }
  }
}

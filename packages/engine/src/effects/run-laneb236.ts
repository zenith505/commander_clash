// Lane B round B236's effects: Diabolic Servitude (servitudeLink, servitudeExile).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

type B236Effect = Extract<Effect, { type: "servitudeLink" | "servitudeExile" }>;

export function runLaneB236Effect(s: GameState, e: B236Effect, ctx: ResolveCtx, src: string): "paused" | void {
  if (!ctx.sourceId) return;
  switch (e.type) {
    case "servitudeLink": {
      // Diabolic Servitude: the creature its enters ability put onto the battlefield (a new object, CR 400.7), linked to
      // the object the enchantment was as the ability triggered (CR 607.2a), even if it has left since: then its leaves
      // ability has already come and gone, and nothing will exile the creature (rulings).
      const t = ctx.targets[e.target];
      const c = ctx.legal[e.target] && t?.kind === "object" ? s.objects[t.id] : undefined;
      if (!c || c.zone !== "battlefield") return;
      const zc = ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0;
      (s.animated ??= {})[`${ctx.sourceId}@${zc}`] = { id: c.id, zc: c.zoneChanges ?? 0 };
      return;
    }
    case "servitudeExile": {
      // "When ~ leaves the battlefield, exile the creature put onto the battlefield with ~": only while it's still that
      // object on the battlefield (rulings: returned to its owner's hand or exiled, it's lost track of, CR 400.7).
      const zc = ctx.sourceZc ?? 0;
      const link = s.animated?.[`${ctx.sourceId}@${zc}`] ?? s.animated?.[`${ctx.sourceId}@${zc - 1}`];
      const c = link && s.objects[link.id];
      if (!c || c.zone !== "battlefield" || (c.zoneChanges ?? 0) !== link.zc) return;
      log(s, `${src} exiles ${defOf(s, c).name}.`);
      moveObject(s, c.id, "exile");
      return;
    }
  }
}

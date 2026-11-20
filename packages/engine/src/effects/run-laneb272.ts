// Lane B round B272's effects: Cass, Hand of Vengeance's return of the Aura cards that were attached to a creature as it
// died. (Bruna, Light of Alabaster's and Cass's attaching are Effect attachAny's `anyAura` and `deadEquipment`, and
// Bruna's Aura cards are Effect putFromHand's `couldEnchantSelf`.)
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { auraHostOptions, enterTogether, log, moveObject, nameOf, obj, player } from "../game";
import type { GameObject, GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";

type B272Effect = Extract<Effect, { type: "deadAurasOnto" }>;

export function runLaneB272Effect(s: GameState, e: B272Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "deadAurasOnto": {
      // Cass: the target is still legal (the ability resolves at all only then, CR 608.2b) and on the battlefield.
      const t = ctx.targets[e.host];
      const host = t?.kind === "object" && ctx.legal[e.host] ? s.objects[t.id] : undefined;
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!host || host.zone !== "battlefield") return;
      // The cards the Auras became as they went from the battlefield to your graveyard (one zone change later, CR 400.7),
      // still there; only Aura cards (a Licid isn't one there) that could legally enchant the target as they enter under
      // your control (rulings, CR 303.4f, 110.2a).
      const returnable = (id: ObjectId) => {
        const a: GameObject | undefined = s.objects[id];
        return !!a && a.zone === "graveyard" && a.owner === p.id && p.graveyard.includes(id) && defOf(s, a).subtypes.includes("Aura") && auraHostOptions(s, a, p.id).some((h) => "attachTo" in h && h.attachTo === host.id);
      };
      const was = ctx.lki?.auras ?? [];
      const cards = was.filter((x) => s.objects[x.id] && (s.objects[x.id]!.zoneChanges ?? 0) === x.zc + 1 && returnable(x.id)).map((x) => x.id);
      if (!sc.found) {
        if (!cards.length) {
          log(s, `${src}: no Aura card that was attached to it is in ${p.name}'s graveyard to return attached to ${nameOf(s, host.id)}.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `any number of the Aura cards that were attached to it, to return attached to ${nameOf(s, host.id)}`, cards, min: 0, max: cards.length, fromGraveyard: "battlefield" };
        return "paused";
      }
      const ids = sc.found.filter((id) => cards.includes(id));
      sc.found = undefined;
      if (!ids.length) {
        log(s, `${p.name} returns no Aura cards.`);
        return;
      }
      log(s, `${p.name} returns ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard to the battlefield attached to ${nameOf(s, host.id)}.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, attachTo: host.id })));
      return;
    }
  }
}

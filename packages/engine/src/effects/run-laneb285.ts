// Lane B round B285's effect: Ice Cauldron's noteCauldron. Its mana and the mana's restriction are in manaabilities.ts
// (noted `all`) and spend.ts (ManaSpend lastExiled).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log } from "../game";
import type { GameState, ManaType } from "../types";
import { type ResolveCtx, objects } from "./resolve";

type B285Effect = Extract<Effect, { type: "noteCauldron" }>;

const symbols = (ms: ManaType[]) => (ms.length ? ms.map((m) => `{${m}}`).join("") : "no mana");

export function runLaneB285Effect(s: GameState, e: B285Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  switch (e.type) {
    case "noteCauldron": {
      // Ice Cauldron: "note the type and amount of mana spent to pay this activation cost": each mana spent on {X} (rulings:
      // {C}{C}{R}{R} for {X}, whatever reduced it, X 0 noting none), on ~ only while it's the same object (CR 400.7). The card
      // its "you may exile" just exiled, if one, is now the last card exiled with it; with none, the last one stays.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o || o.zone !== "battlefield") return;
      const spent = [...(r.item.manaSpentTypes ?? [])];
      o.notedManaAll = spent;
      const card = (r.exiledFromHandCards ?? []).at(-1);
      const c = card ? s.objects[card.id] : undefined;
      if (card && c && c.zone === "exile" && (c.zoneChanges ?? 0) === card.zc) o.cauldronCard = { id: card.id, zc: card.zc, name: defOf(s, c).name };
      log(s, `${src} notes ${symbols(spent)}.`);
      return;
    }
  }
}

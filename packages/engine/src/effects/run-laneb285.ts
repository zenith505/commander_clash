// Lane B round B285's effects: Pygmy Hippo's drainLose, Ice Cauldron's noteCauldron. Ice Cauldron's mana and its
// restriction are in manaabilities.ts (noted `all`) and spend.ts (ManaSpend lastExiled).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { emptyPool } from "../mana";
import type { GameState, ManaType } from "../types";
import { activateEachLand } from "./run-laneb281";
import { type ResolveCtx, objects, players } from "./resolve";

type B285Effect = Extract<Effect, { type: "drainLose" | "noteCauldron" }>;

const symbols = (ms: ManaType[]) => (ms.length ? ms.map((m) => `{${m}}`).join("") : "no mana");

export function runLaneB285Effect(s: GameState, e: B285Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  switch (e.type) {
    case "drainLose": {
      // Pygmy Hippo: "you may have defending player activate a mana ability of each land they control and lose all unspent
      // mana": that player activates them as Drain Power's target does (their choices, rulings on Drain Power), then their
      // whole pool is gone (CR 106.4), the mana they had before too; how much, for "the amount of mana that player lost this
      // way". A player who has left the game does nothing and loses nothing (CR 800.4a).
      const sc = (r.scratch ??= {});
      const tp = sc.drain?.player ?? players(s, e.who, ctx)[0];
      if (tp === undefined || player(s, tp).lost) {
        r.manaLost = 0;
        return;
      }
      if (activateEachLand(s, tp, src) === "paused") return "paused";
      const d = sc.drain!;
      if (d.done) return;
      d.done = true;
      const p = player(s, tp);
      const lost = (Object.keys(p.manaPool) as ManaType[]).flatMap((m) => Array.from({ length: p.manaPool[m] }, () => m));
      p.manaPool = emptyPool();
      p.manaLots = undefined;
      r.manaLost = lost.length;
      log(s, `${p.name} loses ${symbols(lost)}.`);
      return;
    }
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

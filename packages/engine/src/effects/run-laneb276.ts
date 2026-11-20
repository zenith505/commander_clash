// Lane B round B276's effects: Runesword (runeswordMark). Secret Invasion's copy is a becomeCopy (run-copies.ts).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";

type B276Effect = Extract<Effect, { type: "runeswordMark" }>;

export function runLaneB276Effect(s: GameState, e: B276Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "runeswordMark": {
      // The target, still legal (an illegal single target means the ability doesn't resolve, CR 608.2b), as the object it
      // is now: damage it deals this turn, as that object (CR 400.7), marks what it damages (TurnLog.runesword).
      const t = objects(s, { ref: "target", index: 0 }, ctx).find((o) => o.zone === "battlefield");
      if (!t) return;
      const key = `${t.id}@${t.zoneChanges ?? 0}`;
      const marks = ((s.turnLog ??= {}).runesword ??= []);
      if (!marks.includes(key)) marks.push(key);
      log(s, `This turn, creatures dealt damage by ${defOf(s, t).name} can't be regenerated, and are exiled instead if they would die (${src}).`);
      return;
    }
  }
}

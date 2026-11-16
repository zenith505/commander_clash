// Lane B round B232's effects: Heroism (attackersPayOrPrevent).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId } from "../types";
import { apnap, objects, type ResolveCtx } from "./resolve";
import { canPayNow } from "./run-choices";

type B232Effect = Extract<Effect, { type: "attackersPayOrPrevent" }>;

export function runLaneB232Effect(s: GameState, e: B232Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "attackersPayOrPrevent": {
      // Heroism: the attacking red creatures as it resolves, anyone's, each controller asked in turn order (CR 101.4), their
      // creatures in the order they attacked; the payment made then or never (rulings). One that can't be paid for is not
      // paid for. Then all the combat damage each one not paid for would deal this turn is prevented (CR 615.1), only that
      // creature's, as the object it is (CR 611.2c); paying doesn't stop other prevention (rulings).
      const nameOf = (id: ObjectId) => defOf(s, s.objects[id]!).name;
      if (!sc.heroism) {
        const attackers = objects(s, { ref: "each", filter: e.filter }, ctx).filter((o) => o.zone === "battlefield" && o.attacking !== undefined);
        const order = apnap(s, [...new Set(attackers.map((o) => controllerOf(s, o)))]);
        sc.heroism = { queue: order.flatMap((pid) => attackers.filter((o) => controllerOf(s, o) === pid).map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0, pid }))), unpaid: [] };
      }
      const st = sc.heroism;
      while (st.queue.length) {
        const q = st.queue[0]!;
        const o = s.objects[q.id];
        if (sc.paid === undefined && (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== q.zc || player(s, q.pid).lost)) {
          st.queue.shift();
          continue;
        }
        if (sc.paid === undefined && !canPayNow(s, q.pid, { mana: e.cost })) {
          st.unpaid.push(q.id);
          st.queue.shift();
          continue;
        }
        if (sc.paid === undefined) {
          s.pending = { kind: "payUnless", player: q.pid, cost: e.cost, source: src, what: nameOf(q.id), otherwise: `all combat damage ${nameOf(q.id)} would deal this turn is prevented` };
          return "paused";
        }
        const paid = sc.paid;
        sc.paid = undefined;
        st.queue.shift();
        if (paid) log(s, `${player(s, q.pid).name} pays ${e.cost} for ${nameOf(q.id)}.`);
        else st.unpaid.push(q.id);
      }
      const prevent = st.unpaid.filter((id) => s.objects[id]?.zone === "battlefield");
      sc.heroism = undefined;
      if (!prevent.length) return;
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfTurn", affected: prevent, mods: [{ kind: "preventDamage", by: true, combat: "only" }] });
      invalidateCharacteristics(s);
      log(s, `${src}: all combat damage ${prevent.map((id) => nameOf(id)).join(", ")} would deal this turn is prevented.`);
      return;
    }
  }
}

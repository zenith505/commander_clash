// Lane B round B262's effects: Winter's Chill (payFullOrPart).
import type { AbilityBody, Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { canPayNow } from "./run-choices";
import { addDelayed } from "./run-spells";

type B262Effect = Extract<Effect, { type: "payFullOrPart" }>;

export function runLaneB262Effect(s: GameState, e: B262Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "payFullOrPart": {
      // Winter's Chill: the targets still legal (CR 608.2b), each controller choosing in turn order (CR 101.4), their
      // creatures in the order they were targeted; the payments made as it resolves (rulings). {2} first; a player who
      // declines it (or can't pay it) is asked for {1}. One that can't be paid is not paid.
      const nameOf = (id: ObjectId) => defOf(s, s.objects[id]!).name;
      if (!sc.chill) {
        const targets: { id: ObjectId; zc: number; pid: number }[] = [];
        for (let i = e.index; i < ctx.targets.length; i++) {
          const t = ctx.targets[i];
          const o = t?.kind === "object" && ctx.legal[i] ? s.objects[t.id] : undefined;
          if (o?.zone === "battlefield" && !targets.some((x) => x.id === o.id)) targets.push({ id: o.id, zc: o.zoneChanges ?? 0, pid: controllerOf(s, o) });
        }
        const order = apnap(s, [...new Set(targets.map((x) => x.pid))]);
        sc.chill = { queue: order.flatMap((pid) => targets.filter((x) => x.pid === pid)), part: [], unpaid: [] };
      }
      const st = sc.chill;
      while (st.queue.length) {
        const q = st.queue[0]!;
        const o = s.objects[q.id];
        if (sc.paid === undefined && (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== q.zc || player(s, q.pid).lost)) {
          st.queue.shift();
          continue;
        }
        const cost = q.part ? e.part : e.full;
        if (sc.paid === undefined && !canPayNow(s, q.pid, { mana: cost })) {
          if (q.part) {
            st.unpaid.push(q.id);
            st.queue.shift();
          } else q.part = true;
          continue;
        }
        if (sc.paid === undefined) {
          // Shown as "<source>: pay <cost> or <otherwise>." (the UI's payUnless prompt).
          const n = nameOf(q.id);
          s.pending = q.part
            ? { kind: "payUnless", player: q.pid, cost, source: src, what: n, otherwise: `${n} is destroyed at end of combat. Paying ${cost}, all combat damage that would be dealt to and dealt by ${n} this combat is prevented` }
            : { kind: "payUnless", player: q.pid, cost, source: src, what: n, otherwise: `choose next whether to pay ${e.part} (all combat damage to and by ${n} this combat is prevented) or nothing (${n} is destroyed at end of combat). Paying ${cost}, ${n} deals and is dealt combat damage as usual` };
          return "paused";
        }
        const paid = sc.paid;
        sc.paid = undefined;
        if (paid) {
          log(s, `${player(s, q.pid).name} pays ${cost} for ${nameOf(q.id)}.`);
          if (q.part) st.part.push(q.id);
          st.queue.shift();
        } else if (q.part) {
          log(s, `${player(s, q.pid).name} doesn't pay for ${nameOf(q.id)}.`);
          st.unpaid.push(q.id);
          st.queue.shift();
        } else q.part = true;
      }
      sc.chill = undefined;
      // Paid only {1}: all combat damage dealt to and by it this combat is prevented (CR 615.1), the object as it is now
      // (CR 611.2c), until the combat phase ends (CR 500.5a).
      const part = st.part.filter((id) => s.objects[id]?.zone === "battlefield");
      if (part.length) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfCombat", affected: part, mods: [{ kind: "preventDamage", to: true, by: true, combat: "only" }] });
        invalidateCharacteristics(s);
        log(s, `${src}: all combat damage that would be dealt to and dealt by ${part.map((id) => nameOf(id)).join(", ")} this combat is prevented.`);
      }
      // Not paid for: destroyed at end of combat (CR 511.2), a delayed trigger about that permanent as it is now (CR 603.7c).
      const body: AbilityBody = { targets: [], effects: [{ type: "destroy", what: { ref: "subject" } }], text: "Destroy that creature." };
      const item = s.resolving?.item;
      const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      for (const id of st.unpaid) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield") continue;
        addDelayed(s, "endOfCombat", ctx.controller, o, body, spell ? cardIdOf(spell) : undefined);
        log(s, `${src}: ${nameOf(id)} will be destroyed at end of combat.`);
      }
      return;
    }
  }
}

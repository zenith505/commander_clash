// Lane B round B214's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, player } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId } from "../types";
import { apnap, objects, type ResolveCtx } from "./resolve";
import { canPayNow } from "./run-choices";
import { counterOnStack } from "./run-spells";

type B214Effect = Extract<Effect, { type: "othersPaySpellCostToCounter" | "attackersPayOrBlockersGain" }>;

/**
 * The mana cost a player pays for "pay that spell's mana cost" (Ice Cave): the spell's as it is on the stack, its {X} the
 * value announced (CR 107.3h); none for a face-down spell (CR 708.2) or one without a mana cost (CR 118.6), so it can't be
 * paid. Cost increases and reductions aren't part of it (rulings).
 */
export function spellManaCostToPay(s: GameState, stackId: string): string | null {
  const item = s.stack.find((x) => x.id === stackId);
  const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  if (!item || !o || o.faceDown) return null;
  const cost = defOf(s, o).manaCost;
  if (!cost) return null;
  return cost.replace(/\{X\}/g, `{${item.x ?? 0}}`).replace(/\{0\}(?=\{)/g, "") || "{0}";
}

export function runLaneB214Effect(s: GameState, e: B214Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "othersPaySpellCostToCounter": {
      // Ice Cave: the spell that triggered it, while it's still on the stack; each other player in turn order (CR 101.4)
      // who could pay is asked, until one does, and then the spell is countered (CR 701.6a).
      const item = ctx.cause ? s.stack.find((x) => x.id === ctx.cause) : undefined;
      if (!item || item.kind !== "spell") {
        if (!sc.iceCave) log(s, `${src}: the spell has left the stack.`);
        sc.iceCave = undefined;
        return;
      }
      const cost = spellManaCostToPay(s, item.id);
      if (cost === null) {
        log(s, `${src}: ${item.description} has no mana cost to pay.`);
        return;
      }
      const caster = ctx.event?.player ?? item.controller;
      const st = (sc.iceCave ??= { queue: apnap(s, s.turnOrder.filter((pid) => pid !== caster && !player(s, pid).lost)) });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        // The answer first: a player who has just paid can't pay again.
        if (sc.paid === undefined && (player(s, pid).lost || !canPayNow(s, pid, { mana: cost }))) {
          st.queue.shift();
          continue;
        }
        if (sc.paid === undefined) {
          s.pending = { kind: "payUnless", player: pid, cost, source: src, what: item.description, otherwise: `don't counter ${player(s, item.controller).name}'s ${item.description}` };
          return "paused";
        }
        const paid = sc.paid;
        sc.paid = undefined;
        st.queue.shift();
        if (!paid) {
          log(s, `${player(s, pid).name} doesn't pay ${cost} for ${src}.`);
          continue;
        }
        st.queue = [];
        sc.iceCave = undefined;
        log(s, `${src}: ${player(s, pid).name} paid, so ${item.description} is countered.`);
        return counterOnStack(s, ctx, item.id, src);
      }
      sc.iceCave = undefined;
      log(s, `${src}: no one pays, so ${item.description} isn't countered.`);
      return;
    }
    case "attackersPayOrBlockersGain": {
      // Tidal Flats: the attacking creatures without flying as it resolves, each controller asked in turn order (CR 101.4),
      // their creatures in the order they attacked. One with no creature of yours blocking it is skipped: paying for it
      // would change nothing. Then your creatures blocking each one not paid for gain first strike (rulings).
      const you = ctx.controller;
      const nameOf = (id: ObjectId) => defOf(s, s.objects[id]!).name;
      const blockersOf = (id: ObjectId) =>
        s.battlefield.filter((b) => {
          const o = s.objects[b]!;
          return controllerOf(s, o) === you && !!o.blocking?.includes(id);
        });
      if (!sc.tidal) {
        const attackers = objects(s, { ref: "each", filter: e.filter }, ctx).filter((o) => o.zone === "battlefield" && o.attacking !== undefined && controllerOf(s, o) !== you && blockersOf(o.id).length > 0);
        const order = apnap(s, [...new Set(attackers.map((o) => controllerOf(s, o)))]);
        sc.tidal = { queue: order.flatMap((pid) => attackers.filter((o) => controllerOf(s, o) === pid).map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0, pid }))), unpaid: [] };
      }
      const st = sc.tidal;
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
          s.pending = { kind: "payUnless", player: q.pid, cost: e.cost, source: src, what: nameOf(q.id), otherwise: `${player(s, you).name}'s creatures blocking ${nameOf(q.id)} gain ${e.keyword.toLowerCase()} until end of turn` };
          return "paused";
        }
        const paid = sc.paid;
        sc.paid = undefined;
        st.queue.shift();
        if (paid) log(s, `${player(s, q.pid).name} pays ${e.cost} for ${nameOf(q.id)}.`);
        else st.unpaid.push(q.id);
      }
      const gain = [...new Set(st.unpaid.flatMap((id) => blockersOf(id)))];
      sc.tidal = undefined;
      if (!gain.length) return;
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: you, sourceName: src, duration: "endOfTurn", affected: gain, mods: [{ kind: "addKeywords", keywords: [e.keyword] }] });
      invalidateCharacteristics(s);
      log(s, `${src}: ${gain.map((id) => nameOf(id)).join(", ")} gain${gain.length === 1 ? "s" : ""} ${e.keyword.toLowerCase()} until end of turn.`);
      return;
    }
  }
}

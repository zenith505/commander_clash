// Lane B round B230's effects: Glyph of Reincarnation (glyphReincarnation).
import type { Effect } from "../abilities";
import { defOf, isPermanentCard, objIsType } from "../cards";
import { destroyPermanent, enterTogether, log, moveObject, player } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { addDelayed } from "./run-spells";

type B230Effect = Extract<Effect, { type: "glyphReincarnation" | "authorityLink" | "authorityDestroy" }>;

export function runLaneB230Effect(s: GameState, e: B230Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "glyphReincarnation": {
      // Glyph of Reincarnation: "Destroy all creatures that were blocked by target Wall this turn. They can't be regenerated.
      // For each creature that died this way, put a creature card from the graveyard of the player who controlled that
      // creature the last time it became blocked by that Wall onto the battlefield under its owner's control.": the Wall as
      // the object it is (CR 400.7), the creatures it blocked this turn (TurnLog.blocks) still those objects on the
      // battlefield and creatures now, destroyed at once. Those put into a graveyard died (CR 700.4). Then, with all of them
      // in the graveyard (rulings: they can be chosen), you choose that many creature cards in each such player's graveyard,
      // as many as there are, and they enter together under their owners' control (CR 110.2).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.glyph) {
        const [wall] = objects(s, { ref: "target", index: 0 }, ctx);
        if (!wall || wall.zone !== "battlefield") return;
        const key = `${wall.id}@${wall.zoneChanges ?? 0}`;
        const last = new Map<string, number>();
        for (const b of s.turnLog?.blocks ?? []) if (b.blocker === key && b.ac !== undefined) last.set(b.attacker, b.ac);
        const list = [...last.keys()].flatMap((k) => {
          const [id, zc] = k.split("@");
          const o = s.objects[id!];
          return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === Number(zc) && objIsType(s, o, "Creature") ? [{ o, k }] : [];
        });
        if (!list.length) log(s, `${src}: no creature ${defOf(s, wall).name} blocked this turn is on the battlefield.`);
        const counts = new Map<number, number>();
        for (const { o, k } of list) {
          if (destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, true, ctx.controller) && s.objects[o.id]?.zone === "graveyard") counts.set(last.get(k)!, (counts.get(last.get(k)!) ?? 0) + 1);
        }
        sc.glyph = { left: s.turnOrder.filter((pid) => counts.has(pid)).map((pid) => ({ player: pid, n: counts.get(pid)! })), chosen: [] };
      }
      const g = sc.glyph;
      if (sc.found) {
        g.chosen.push(...sc.found);
        sc.found = undefined;
        g.left.shift();
      }
      while (g.left.length) {
        const { player: pid, n } = g.left[0]!;
        const p = player(s, pid);
        const cards = p.lost ? [] : p.graveyard.filter((id) => !g.chosen.includes(id) && objIsType(s, s.objects[id]!, "Creature") && isPermanentCard(defOf(s, s.objects[id]!)));
        const most = Math.min(n, cards.length);
        if (!most) {
          g.left.shift();
          continue;
        }
        s.pending = {
          kind: "searchLibrary",
          player: ctx.controller,
          source: src,
          what: `${most === 1 ? "a creature card" : `${most} creature cards`} in ${p.name}'s graveyard`,
          cards,
          min: most,
          max: most,
          fromGraveyard: "battlefield",
          ...(pid !== ctx.controller ? { forPlayer: pid, helps: true as const } : {}),
        };
        return "paused";
      }
      const put = g.chosen.filter((id) => s.objects[id]?.zone === "graveyard");
      sc.glyph = undefined;
      if (!put.length) return;
      log(s, `${player(s, ctx.controller).name} puts ${put.map((id) => defOf(s, s.objects[id]!).name).join(", ")} onto the battlefield under their owners' control (${src}).`);
      enterTogether(s, () => put.forEach((id) => moveObject(s, id, "battlefield", { controller: s.objects[id]!.owner, putBy: ctx.controller })));
      return;
    }
    case "authorityLink": {
      // Infinite Authority's trigger resolving: "destroy the other creature at end of combat" is a delayed trigger about that
      // creature as it is now (CR 603.7c, 400.7), none if it has left; "the first creature" is the one the Aura enchanted as
      // it triggered (the event's group, first), kept for the end step trigger (rulings).
      const other = objects(s, { ref: "subject" }, ctx)[0];
      const host = ctx.event?.group?.[0];
      if (!other || !host) return;
      addDelayed(s, "endOfCombat", ctx.controller, other, { targets: [], effects: [{ type: "authorityDestroy", host: { id: host.id, zc: host.zc } }], text: "Destroy the other creature." }, s.resolving?.item.sourceCardId);
      return;
    }
    case "authorityDestroy": {
      // At end of combat: destroy that creature, if it's still that object (CR 400.7). Destroyed (CR 701.8, even if a
      // replacement effect then sends it elsewhere than the graveyard), "At the beginning of the next end step, if that
      // creature was destroyed this way, put a +1/+1 counter on the first creature." will trigger; not destroyed
      // (regenerated, indestructible), it won't (CR 603.4).
      const o = objects(s, { ref: "subject" }, ctx)[0];
      if (!o) return;
      if (!destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, false, ctx.controller)) return;
      const first = s.objects[e.host.id];
      if (!first || first.zone !== "battlefield" || (first.zoneChanges ?? 0) !== e.host.zc) return;
      addDelayed(s, "nextEndStep", ctx.controller, first, { targets: [], effects: [{ type: "counters", what: { ref: "subject" }, counter: "+1/+1", n: 1 }], text: "Put a +1/+1 counter on the first creature." }, s.resolving?.item.sourceCardId);
      return;
    }
  }
}

// Lane B round B202's effects.
import type { Effect } from "../abilities";
import { defOf, power } from "../cards";
import { countersRemoved } from "../counters";
import { enterTogether, log, moveObject, obj, player } from "../game";
import { characteristics, invalidateCharacteristics } from "../layers";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { amountNow } from "./resolve";
import { printedMatches } from "./targeting";

type B202Effect = Extract<Effect, { type: "yardTotalPower" | "removeCounterThenReturn" }>;

/**
 * Loki Laufeyson's "~'s power" for a delayed cast trigger (round B202): the permanent's power now if it's still that object
 * on the battlefield, otherwise as it last existed there (CR 113.7a, 608.2h); 0 if that's no longer known.
 */
export function sourcePowerNow(s: GameState, of: { id: ObjectId; zc: number }): number {
  const o = s.objects[of.id];
  if (o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === of.zc) return power(s, o);
  const lk = s.lastKnown?.[of.id];
  return lk && lk.zc === of.zc ? lk.power : 0;
}

/** A graveyard card's power where it is (CR 208.1), a characteristic-defining ability counted there too (CR 604.3). */
const yardPower = (s: GameState, id: ObjectId) => characteristics(s, obj(s, id)).power;

export function runLaneB202Effect(s: GameState, e: B202Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "yardTotalPower": {
      // Moorland Rescuer: X as it resolves (its power as it last existed, rulings); any number of other creature cards in
      // your graveyard whose powers add up to X or less, chosen as it resolves (CR 608.2c), put onto the battlefield at once.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const max = amountNow(s, e.max, ctx);
      const fits = (id: ObjectId) => id !== ctx.sourceId && printedMatches(e.filter, defOf(s, obj(s, id))) && yardPower(s, id) <= max;
      if (!sc.found) {
        const cards = p.graveyard.filter(fits);
        if (!cards.length) {
          log(s, `${src}: no creature card in ${p.name}'s graveyard has power ${max} or less.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `any number of other creature cards with total power ${max} or less`, cards, min: 0, max: cards.length, fromGraveyard: "battlefield", totalPower: max };
        return "paused";
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id) && fits(id));
      sc.found = undefined;
      // The answer was checked against the total already (game.ts); checked again here in case anything changed.
      if (found.reduce((n, id) => n + yardPower(s, id), 0) > max) return;
      if (!found.length) return;
      log(s, `${p.name} returns ${found.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard to the battlefield.`);
      enterTogether(s, () => found.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id })));
      return;
    }
    case "removeCounterThenReturn": {
      // Darigaaz Reincarnated: the card in exile, still the same object (CR 400.7); one egg counter off it, then onto the
      // battlefield under its owner's control (CR 110.2) if it has none left.
      const id = ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      if (!o || o.zone !== "exile" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const had = o.counters[e.counter] ?? 0;
      if (had > 0) {
        if (had > 1) o.counters[e.counter] = had - 1;
        else delete o.counters[e.counter];
        log(s, `${src}: an ${e.counter} counter is removed from it (${had - 1} left).`);
        countersRemoved(s, o, e.counter, 1);
      }
      if ((o.counters[e.counter] ?? 0) > 0) return;
      log(s, `${defOf(s, o).name} returns to the battlefield under ${player(s, o.owner).name}'s control.`);
      moveObject(s, o.id, "battlefield", { controller: o.owner });
      invalidateCharacteristics(s);
      return;
    }
  }
}

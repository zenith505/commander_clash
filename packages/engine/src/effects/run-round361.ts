// Round 361's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { putCounters } from "../counters";
import { creatureTypesOf, log, obj, shareCreatureType } from "../game";
import { controllerOf, invalidateCharacteristics } from "../layers";
import { objectMatches } from "./targeting";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Resplendent Marshal's reflexive ability: "put a +1/+1 counter on each creature you control other than ~ that shares a
 * creature type with the exiled card". The exiled card is the reflexive ability's subject (the card exiled as the ability
 * that made it resolved, Effect reflexive `aboutYardChosen`); its creature types are the card's, as it is in exile (CR
 * 400.7; a changeling card has every creature type, CR 702.73a), and are known when the ability triggers (rulings). The
 * permanents are those as this resolves, all at once; ~ is left out only while it's still the object that had the
 * ability (a new object, back on the battlefield, isn't "this creature", CR 400.7).
 */
export function runKinCountersEffect(s: GameState, e: Extract<Effect, { type: "kinCounters" }>, ctx: ResolveCtx): void {
  const sub = ctx.subject;
  const card = sub ? s.objects[sub.id] : undefined;
  if (!card) return;
  // Its printed creature types, even if it has left exile since (its last known information, CR 608.2h).
  const kin = creatureTypesOf(s, card.zone === "battlefield" ? { ...card, zone: "exile" } : card);
  const self = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const isSelf = (id: string) => !!self && id === self.id && (ctx.sourceZc === undefined || (self.zoneChanges ?? 0) === ctx.sourceZc);
  const all = s.battlefield.map((id) => obj(s, id)).filter((o) => !isSelf(o.id) && controllerOf(s, o) === ctx.controller && objectMatches(s, e.filter, o, ctx.controller, false) && shareCreatureType(kin, creatureTypesOf(s, o)));
  if (!all.length) {
    log(s, `No other creature shares a creature type with ${defOf(s, card).name}.`);
    return;
  }
  for (const o of all) {
    invalidateCharacteristics(s);
    const put = putCounters(s, o, e.counter, e.n);
    log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put === 1 ? "" : "s"}.`);
  }
  invalidateCharacteristics(s);
}

// Lane B round B293: Titania's Song's effect that goes on once it has left the battlefield (lingerOnLeaving).
import { defOf } from "../cards";
import { log } from "../game";
import { invalidateCharacteristics, type Characteristics } from "../layers";
import { compileCard } from "../oracle";
import type { GameObject, GameState } from "../types";

/**
 * "If ~ leaves the battlefield, this effect continues until end of turn" (Titania's Song, StaticAbility.lingers): called as
 * a permanent that had its abilities (`last`, its characteristics as it last existed, CR 603.10a) leaves the battlefield.
 * Each such static ability it still had then (not taken away in layer 6, CR 613.1f) becomes a stored effect for a group:
 * the same mods for whatever its text indicates at any moment (not locked in, CR 611.3a; ContinuousEffect.group), its
 * controller then, with its source's timestamp (CR 613.7a), until the cleanup step (CR 514.2).
 */
export function lingerOnLeaving(s: GameState, o: GameObject, last: Characteristics): void {
  if (o.faceDown) return; // a face-down permanent has no abilities (CR 708.2)
  const d = defOf(s, o);
  for (const st of compileCard(d).statics) {
    if (!st.lingers || st.condition || st.zone || last.lostStatics?.includes(st.text)) continue;
    s.effects.push({ id: `e${s.nextId++}`, timestamp: o.timestamp, controller: last.controller, sourceName: d.name, duration: "endOfTurn", affected: [], group: st.affects, mods: st.mods });
    log(s, `${d.name} has left the battlefield; its effect continues until end of turn.`);
    invalidateCharacteristics(s);
  }
}

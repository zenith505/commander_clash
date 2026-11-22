// Guardian Beast (round B292): "As long as this creature is untapped, noncreature artifacts you control ... other players
// can't gain control of them." A rule-changing effect of a static ability (CR 604.1, Modification othersCantGainControl,
// Characteristics.controlLocked): a control-changing effect that would give such an artifact to a player other than its
// controller doesn't do that (CR 101.2: "can't" wins), checked as that effect would begin to apply (the set a resolving
// spell's or ability's control effect affects is locked in then, CR 611.2c). The rest of what the effect does still happens
// (CR 101.2 applies to the control part only); an exchange of control with such an artifact doesn't happen at all (CR
// 701.12b). It doesn't stop sacrifices (rulings) or anything else.
import { defOf } from "./cards";
import { log, player } from "./game";
import { characteristics, controllerOf } from "./layers";
import type { GameObject, GameState, ObjectId, PlayerId } from "./types";

/** Whether `to` can't gain control of `o` now: a permanent locked to its controller (Guardian Beast), and `to` someone else. */
export function controlBlocked(s: GameState, o: GameObject | undefined, to: PlayerId): boolean {
  if (!o || o.zone !== "battlefield") return false;
  return !!characteristics(s, o).controlLocked && controllerOf(s, o) !== to;
}

/** The permanents of `ids` that `to` can gain control of now; those it can't are logged (`src`: the effect's source). */
export function controlGainable(s: GameState, ids: ObjectId[], to: PlayerId, src: string): ObjectId[] {
  const locked = ids.filter((id) => controlBlocked(s, s.objects[id], to));
  if (!locked.length) return ids;
  log(s, `${player(s, to).name} can't gain control of ${locked.map((id) => defOf(s, s.objects[id]!).name).join(", ")} (${lockerName(s, locked[0]!)}), so ${src} doesn't change ${locked.length === 1 ? "its" : "their"} control.`);
  return ids.filter((id) => !locked.includes(id));
}

/** The name of the permanent whose ability locks `id`'s control (for the log): an untapped Guardian Beast its controller controls. */
function lockerName(s: GameState, id: ObjectId): string {
  const you = controllerOf(s, s.objects[id]!);
  for (const b of s.battlefield) {
    const o = s.objects[b]!;
    if (controllerOf(s, o) === you && !o.tapped && /other players can't gain control/.test(defOf(s, o).oracleText)) return characteristics(s, o).name;
  }
  return "an effect";
}

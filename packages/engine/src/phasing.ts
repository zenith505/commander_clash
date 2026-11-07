// Phasing (CR 702.26): a phased-out permanent is treated as though it doesn't exist, without changing zones.

import { objHasKeyword } from "./cards";
import { clearCombat, log, nameOf, obj, removeFromCombat } from "./game";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import { pairedWith } from "./cards";
import type { GameState, ObjectId, PlayerId } from "./types";
import { fireEvent } from "./effects";

/**
 * These permanents phase out, all at once (CR 702.26b), and with them whatever is attached to them, indirectly
 * (702.26g; an object phasing out both ways phases out indirectly, 702.26h). They're removed from combat.
 */
export function phaseOut(s: GameState, ids: ObjectId[]) {
  // "Can't phase out" (Ertai's Familiar, Spatial Binding): for any reason, not even indirectly; an Aura that stays
  // behind is then put into its owner's graveyard by state-based actions (rulings, CR 702.26d, 704.5m).
  const can = (id: ObjectId) => !characteristics(s, obj(s, id)).cantPhaseOut;
  const direct = [...new Set(ids)].filter((id) => s.objects[id]?.zone === "battlefield" && can(id));
  if (!direct.length) return;
  const indirect = new Set<ObjectId>();
  for (const queue = [...direct]; queue.length; ) {
    const host = queue.shift()!;
    for (const id of s.battlefield)
      if (s.objects[id]!.attachedTo === host && !indirect.has(id) && can(id)) {
        indirect.add(id);
        queue.push(id);
      }
  }
  const all = [...direct.filter((id) => !indirect.has(id)), ...indirect];
  // "Whenever ~ phases out" looks back in time (CR 603.10b): it triggers as it is now, on the battlefield.
  fireEvent(s, { type: "phases", ids: all, how: "out" });
  // Who controls each, before any of them stops existing.
  const by = new Map(all.map((id) => [id, controllerOf(s, obj(s, id))]));
  for (const id of all) {
    const o = obj(s, id);
    removeFromCombat(s, o); // CR 702.26b, 506.4
    clearCombat(o);
    o.provokedBy = undefined;
    o.provokedAlso = undefined;
    // A soulbond pairing lasts "for as long as both remain creatures on the battlefield under your control", and
    // such an effect ends when a permanent it tracks phases out (CR 702.26f).
    const partner = pairedWith(s, o);
    if (partner) partner.paired = undefined;
    o.paired = undefined;
    const host = !indirect.has(id) && o.attachedTo ? s.objects[o.attachedTo] : undefined;
    o.phased = { by: by.get(id)!, ...(indirect.has(id) ? { indirect: true as const } : {}), ...(host ? { host: { id: host.id, zc: host.zoneChanges ?? 0 } } : {}) };
  }
  for (const id of all) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    (s.phasedOut ??= []).push(id);
    obj(s, id).zone = "phasedOut";
  }
  log(s, `${all.map((id) => nameOf(s, id)).join(", ")} phase${all.length === 1 ? "s" : ""} out.`);
  invalidateCharacteristics(s);
}

/**
 * These phased-out permanents phase in (CR 702.26c), with what phased out indirectly along with them (702.26g). An
 * Aura or Equipment that phased out directly comes back attached to what it was attached to if that's still on the
 * battlefield, and unattached otherwise (702.26i); state-based actions do the rest.
 */
export function phaseIn(s: GameState, ids: ObjectId[]) {
  const list = (s.phasedOut ??= []);
  const all = [...new Set(ids)].filter((id) => s.objects[id]?.zone === "phasedOut");
  for (let i = 0; i < all.length; i++)
    for (const id of list) if (s.objects[id]!.phased?.indirect && s.objects[id]!.attachedTo === all[i] && !all.includes(id)) all.push(id);
  if (!all.length) return;
  for (const id of all) {
    list.splice(list.indexOf(id), 1);
    s.battlefield.push(id);
    obj(s, id).zone = "battlefield";
  }
  for (const id of all) {
    const o = obj(s, id);
    const host = o.phased?.host;
    if (host) {
      const h = s.objects[host.id];
      if (!h || h.zone !== "battlefield" || (h.zoneChanges ?? 0) !== host.zc) o.attachedTo = undefined;
    }
    o.phased = undefined;
  }
  log(s, `${all.map((id) => nameOf(s, id)).join(", ")} phase${all.length === 1 ? "s" : ""} in.`);
  invalidateCharacteristics(s);
  fireEvent(s, { type: "phases", ids: all, how: "in" });
}

/**
 * The phasing event of `ap`'s untap step, before anything untaps (CR 702.26a): their phased-in permanents with
 * phasing phase out, and at the same time what phased out under their control phases in, along with what a player
 * who left the game phased out once that player's next turn would have begun (702.26n).
 */
export function untapStepPhasing(s: GameState, ap: PlayerId) {
  const out = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === ap && objHasKeyword(s, obj(s, id), "Phasing"));
  const back = (s.phasedOut ?? []).filter((id) => {
    const p = s.objects[id]!.phased;
    return p && !p.indirect && !p.until && (p.by === ap || p.released);
  });
  phaseOut(s, out);
  phaseIn(s, back);
}

/**
 * Oubliette left the battlefield: what it phased out "until ~ leaves the battlefield" phases in now, tapped as it does
 * (CR 610.3; rulings: becoming tapped this way triggers nothing).
 */
export function phaseInUntil(s: GameState, id: ObjectId, zc: number) {
  const back = (s.phasedOut ?? []).filter((x) => {
    const u = s.objects[x]!.phased?.until;
    return u && u.id === id && u.zc === zc;
  });
  if (!back.length) return;
  // Out of Time: as they were (rulings); Oubliette's text taps them.
  const tap = back.filter((x) => !s.objects[x]!.phased?.until?.noTap);
  phaseIn(s, back);
  for (const x of tap) if (s.objects[x]?.zone === "battlefield") s.objects[x]!.tapped = true;
}

/** Players who left the game whose turns would have begun: what they phased out phases in at the next untap step (CR 702.26n). */
export function releasePhased(s: GameState, began: Set<PlayerId>) {
  for (const id of s.phasedOut ?? []) {
    const p = s.objects[id]!.phased;
    if (p && began.has(p.by) && s.players[p.by]!.lost) p.released = true;
  }
}

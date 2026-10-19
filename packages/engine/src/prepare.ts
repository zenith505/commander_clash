// Preparation cards (CR 722): a creature card with a prepare spell, alternative characteristics that only copies of it
// use. As a permanent with one becomes prepared, its controller creates a copy of the prepare spell in exile, which the
// prepared permanent's controller may cast for as long as it stays prepared on the battlefield; casting it unprepares it
// (722.3c).

import { defOf } from "./cards";
import { faceDef } from "./faces";
import { log, newObject, player } from "./game";
import { controllerOf, invalidateCharacteristics } from "./layers";
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "./types";

/**
 * The prepare spell of a permanent, from its copiable values (CR 722.2b): a copy of a preparation card has one too,
 * ignoring that copy's exceptions (rulings). Undefined if it has none.
 */
export function prepareSpellOf(s: GameState, o: GameObject): CardDef | undefined {
  if (o.faceDown) return undefined;
  const d = defOf(s, o);
  return d.layout === "prepare" && d.faces?.length === 2 ? faceDef(d, 1) : undefined;
}

/**
 * It becomes prepared (CR 722.3a): only a permanent with a prepare spell that isn't prepared already ("can't become
 * prepared more than once at the same time", rulings). Its controller creates the copy of its prepare spell in exile.
 */
export function becomePrepared(s: GameState, o: GameObject): boolean {
  if (o.zone !== "battlefield" || o.prepared || !prepareSpellOf(s, o)) return false;
  o.prepared = {};
  log(s, `${defOf(s, o).name} becomes prepared.`);
  createPreparedCopy(s, o);
  invalidateCharacteristics(s);
  return true;
}

/** The copy of its prepare spell in exile, under its controller now (CR 722.3c); not while it's phased out. */
function createPreparedCopy(s: GameState, o: GameObject) {
  const spell = prepareSpellOf(s, o);
  if (!spell || !o.prepared || o.zone !== "battlefield") return;
  const pid = controllerOf(s, o);
  const copy = newObject(s, spell, pid, "exile");
  copy.spellCopy = true; // not a card (CR 707.12)
  copy.preparedFrom = { id: o.id, zc: o.zoneChanges ?? 0 };
  player(s, pid).exile.push(copy.id);
  o.prepared.copy = copy.id;
}

/** The prepared permanent a copy in exile belongs to, if it's still on the battlefield, prepared with that copy. */
function preparedSource(s: GameState, copy: GameObject): GameObject | undefined {
  const from = copy.preparedFrom;
  const o = from && s.objects[from.id];
  // Phased out, it's treated as though it doesn't exist (CR 702.26b): the copy goes, and comes back as it phases in.
  return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === from.zc && o.prepared?.copy === copy.id ? o : undefined;
}

/** May `pid` cast this copy of a prepare spell? Only the prepared permanent's controller now (rulings), from exile. */
export function preparedCopyCastable(s: GameState, copy: GameObject, pid: PlayerId): boolean {
  if (copy.zone !== "exile" || !copy.preparedFrom) return false;
  const o = preparedSource(s, copy);
  return !!o && controllerOf(s, o) === pid;
}

/** As the copy becomes cast, its permanent stops being prepared (CR 722.3c, 601.2i). */
export function unprepareFor(s: GameState, copy: GameObject) {
  const from = copy.preparedFrom;
  const o = from && s.objects[from.id];
  if (!o?.prepared || o.prepared.copy !== copy.id) return;
  o.prepared = undefined;
  log(s, `${defOf(s, o).name} is no longer prepared.`);
  invalidateCharacteristics(s);
}

/** It becomes unprepared (CR 722.3b): the copy of its prepare spell in exile ceases to exist (rulings). */
export function unprepare(s: GameState, o: GameObject) {
  if (!o.prepared) return;
  const copy = o.prepared.copy;
  o.prepared = undefined;
  if (copy) removeCopy(s, copy);
  invalidateCharacteristics(s);
}

function removeCopy(s: GameState, id: ObjectId) {
  const c = s.objects[id];
  if (!c || c.zone !== "exile") return;
  const list = player(s, c.owner).exile;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  delete s.objects[id];
}

/**
 * Keep the copies in exile in step with their permanents (CR 722.3c): one whose permanent left the battlefield, phased
 * out or stopped being prepared ceases to exist; a prepared permanent that phased in gets a new one.
 */
export function checkPrepared(s: GameState) {
  for (const p of s.players)
    for (const id of [...p.exile]) {
      const c = s.objects[id];
      if (c?.preparedFrom && !preparedSource(s, c)) removeCopy(s, id);
    }
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (!o.prepared) continue;
    if (o.prepared.copy && s.objects[o.prepared.copy]?.zone === "exile") continue;
    o.prepared.copy = undefined;
    createPreparedCopy(s, o);
  }
}

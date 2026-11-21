// Round 435's effects: March from Velis Vel's lands of a chosen nonbasic land type becoming copies of a creature, and Olag,
// Ludevic's Hubris's copy of a creature card exiled with it as it transforms.
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { putCounters } from "../counters";
import { addCopyEffect, copyKey, exceptFor } from "../copies";
import { faceDef, isDoubleFacedDef, restingDef } from "../faces";
import { log, obj, player } from "../game";
import { LAND_TYPE_LIST } from "../keywords";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { compileCard } from "../oracle";
import { BASIC_LAND_TYPES } from "../text-changes";
import type { GameObject, GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { copiedValues } from "./run-copies";
import { fireEvent } from "./triggers";

/** The land types that aren't basic land types (CR 205.3i), in CR order. */
export const NONBASIC_LAND_TYPE_LIST: readonly string[] = LAND_TYPE_LIST.filter((t) => !(BASIC_LAND_TYPES as readonly string[]).includes(t)).sort();

/**
 * March from Velis Vel: "Choose a nonbasic land type. Each land you control of that type becomes a copy of target creature
 * you control until end of turn and gains haste until end of turn." The type is chosen as it resolves (CR 608.2d; kept in
 * resolving.chosen.landType); the lands are the ones of that type its controller controls then (CR 611.2c), which as copies
 * of a creature won't have that type any more. Each copies the target's copiable values (CR 707.2: a copy of what it copies
 * too, X 0, no counters or tapped state, rulings), nothing enters (rulings), and gains haste, both until end of turn.
 */
export function runLandTypeCopiesEffect(s: GameState, e: Extract<Effect, { type: "landTypeCopies" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const type = r.chosen?.landType;
  if (type === undefined || !NONBASIC_LAND_TYPE_LIST.includes(type)) {
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "landType", options: [...NONBASIC_LAND_TYPE_LIST], prompt: "choose a nonbasic land type: each land you control of that type becomes a copy of the target creature and gains haste until end of turn" };
    return "paused";
  }
  const base = copiedValues(s, e.of, ctx);
  if (!base) return;
  const lands = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === ctx.controller && objIsType(s, o, "Land") && characteristics(s, o).subtypes.includes(type));
  if (!lands.length) {
    log(s, `${src}: ${player(s, ctx.controller).name} controls no ${type}, so nothing happens.`);
    return;
  }
  // The same values for each, worked out before any of them changes (CR 608.2h).
  const keys = lands.map((o) => copyKey(s, base, exceptFor(s, o, undefined, src)));
  lands.forEach((o, i) => {
    const was = defOf(s, o).name;
    addCopyEffect(s, o, keys[i]!, "endOfTurn");
    log(s, `${was} becomes a copy of ${base.name} until end of turn and gains haste until end of turn (${src}).`);
  });
  s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfTurn", affected: lands.map((o) => o.id), mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
  invalidateCharacteristics(s);
}

/**
 * The creature cards "exiled with" a permanent whose back face is Olag: the cards its front face's cost exiled (linked
 * across its faces, CR 607.1b, 607.2a) that are still in exile as those objects (CR 400.7), creature cards as they are there
 * (a double-faced card's front face, CR 712.8a).
 */
export function olagCandidates(s: GameState, o: GameObject): GameObject[] {
  const key = `${o.id}@${o.zoneChanges ?? 0}`;
  return (s.linkedExile?.[key] ?? [])
    .map((l) => ({ x: s.objects[l.id], zc: l.zc }))
    .filter((l): l is { x: GameObject; zc: number } => l.x?.zone === "exile" && (l.x.zoneChanges ?? 0) === l.zc && !l.x.faceDown && !l.x.isToken)
    .map((l) => l.x)
    .filter((x) => restingDef(s.cards[x.cardId]!).types.includes("Creature"));
}

/**
 * Whether the cards a cost of this permanent's exiles are linked to it across its faces: a transforming double-faced card
 * whose other face has Olag's "creature card exiled with it" (CR 607.1b, 607.2a).
 */
export function costExileLinksAcrossFaces(s: GameState, o: GameObject): boolean {
  const d = s.cards[o.cardId];
  if (!d || !isDoubleFacedDef(d) || d.layout !== "transform" || d.faces?.length !== 2 || o.face === 1) return false;
  return !!compileCard(faceDef(d, 1)).asTransformsCopyLinked;
}

/**
 * Olag as it transforms (CR 712.20): with one creature card exiled with it, a copy of that card now; with several, the
 * controller chooses which (rulings), asked before anyone gets priority (s.entersChoices "transformCopy"), the transform's
 * event waiting for the answer so that what it transformed into is the copy (CR 701.27e). Returns whether the transform
 * event is left to olagCopyChosen.
 */
export function olagTransforms(s: GameState, o: GameObject): boolean {
  const except = compileCard(defOf(s, o)).asTransformsCopyLinked;
  if (!except) return false;
  const cards = olagCandidates(s, o);
  if (cards.length > 1) {
    (s.entersChoices ??= []).unshift({ id: o.id, zc: o.zoneChanges ?? 0, what: "transformCopy" });
    return true;
  }
  olagCopy(s, o, cards[0]?.id);
  return false;
}

/** The copy and the counters (see olagTransforms), `cardId` the creature card chosen, none with none exiled with it. */
export function olagCopy(s: GameState, o: GameObject, cardId: ObjectId | undefined) {
  const except = compileCard(defOf(s, o)).asTransformsCopyLinked!;
  const name = defOf(s, o).name;
  const n = olagCandidates(s, o).length;
  if (cardId) {
    const base = restingDef(s.cards[obj(s, cardId).cardId]!);
    addCopyEffect(s, o, copyKey(s, base, exceptFor(s, o, except, name)));
    log(s, `${name} becomes a copy of ${base.name}, except its name is ${name}.`);
  } else log(s, `There's no creature card exiled with ${name}, so it doesn't become a copy of anything.`);
  if (n > 0) {
    const put = putCounters(s, o, "+1/+1", n);
    log(s, `${defOf(s, o).name} gets ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
  }
  invalidateCharacteristics(s);
}

/** The answer to the "transformCopy" question: the copy and counters, then the transform's event (see olagTransforms). */
export function olagCopyChosen(s: GameState, o: GameObject, choice: ObjectId | undefined) {
  olagCopy(s, o, choice);
  fireEvent(s, { type: "transformed", id: o.id, face: o.face === 1 ? 1 : 0 });
}

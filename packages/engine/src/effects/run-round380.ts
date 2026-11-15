// Round 380's effect: a creature type noted for a permanent (Volo, Itinerant Scholar's Journal).
import type { Effect } from "../abilities";
import { creatureTypesOf, log, player } from "../game";
import { CREATURE_TYPES } from "../keywords";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Volo's Journal: "Whenever you cast a creature spell, note one of its creature types that hasn't been noted for Volo's
 * Journal." The spell as it was cast (its card's creature types, every one for a changeling, CR 702.73a), whether or not
 * it's still on the stack (CR 608.2h); the controller chooses as the ability resolves (CR 608.2d) among those not noted yet
 * for the Journal as this object (GameState.notedFor; a new object has none, CR 400.7). With none left, nothing is noted.
 */
export function runNoteCreatureTypeEffect(s: GameState, e: Extract<Effect, { type: "noteCreatureType" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
  const spell = item?.objectId ? s.objects[item.objectId] : undefined;
  const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
  const noted = (s.notedFor ??= {})[key] ?? [];
  if (sc.noteType === undefined) {
    // Long List of the Ents (round 381, `any`): any creature type (CR 205.3m), a spell's or not.
    const types = e.any ? "all" : spell ? creatureTypesOf(s, spell) : new Set<string>();
    const left = (types === "all" ? [...CREATURE_TYPES] : [...types]).filter((t) => !noted.includes(t)).sort();
    if (!left.length) {
      log(s, `${src}: no creature type ${e.any ? "is" : "of that spell is"} left to note.`);
      return;
    }
    if (left.length > 1) {
      s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "noteType", options: left, prompt: e.any ? "note a creature type that hasn't been noted" : "note one of its creature types that hasn't been noted" };
      return "paused";
    }
    sc.noteType = left[0]!;
  }
  const t = sc.noteType;
  sc.noteType = undefined;
  s.notedFor[key] = [...noted, t];
  r.lastNoted = t;
  log(s, `${player(s, ctx.controller).name} notes ${t} for ${src} (${s.notedFor[key]!.length} noted).`);
}

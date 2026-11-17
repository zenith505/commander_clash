// Round 382's effects: creatures goaded by every name chosen for a Saga (Day of the Moon).
import type { Effect, TargetSpec } from "../abilities";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { runEffect } from "./resolve";

/**
 * Day of the Moon: "Choose a creature card name, then goad all creatures with a name chosen for ~.": the name just chosen
 * joins the names chosen for this Saga as this object (GameState.namesChosenFor, CR 400.7: a new object has none), kept
 * even if it has left the battlefield by now. Then each creature with one of those names is goaded by this ability's
 * controller until their next turn (CR 701.15a), whoever controls it, the group locked in now (CR 611.2c).
 */
export function runGoadChosenNamesEffect(s: GameState, _e: Extract<Effect, { type: "goadChosenNames" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving;
  if (!r || ctx.sourceId === undefined) return;
  const key = `${ctx.sourceId}@${ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0}`;
  const before = (s.namesChosenFor ??= {})[key] ?? [];
  const name = r.chosen?.name;
  const names = name !== undefined && !before.includes(name) ? [...before, name] : before;
  s.namesChosenFor[key] = names;
  if (!names.length) return;
  log(s, `Names chosen for ${src}: ${names.join(", ")}.`);
  const filter: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], anyOf: names.map((n) => ({ kind: "object", named: n, text: n })), text: `creatures named ${names.join(" or ")}` };
  return runEffect(s, { type: "continuous", what: { ref: "each", filter }, mods: [{ kind: "goad" }], duration: "yourNextTurn" }, ctx);
}

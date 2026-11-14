// Round 365's effects: an Aura that moves itself to a player (Archnemesis).
import type { Effect } from "../abilities";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { players } from "./resolve";
import { attachToPlayer } from "./run-permanents";

/**
 * Archnemesis: "you may attach this Aura to that player": the Aura that's this ability's source, only while it's still that
 * object on the battlefield (CR 400.7), to the player if it could enchant them (enchant opponent, CR 702.5d; not a player
 * with protection from it, 702.16c). Already attached to them, it doesn't move or get a new timestamp (CR 701.3b-c).
 */
export function runAttachSelfToPlayerEffect(s: GameState, e: Extract<Effect, { type: "attachSelfToPlayer" }>, ctx: ResolveCtx): void {
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
  const pid = players(s, e.who, ctx)[0];
  if (pid === undefined) return;
  attachToPlayer(s, me, pid);
}

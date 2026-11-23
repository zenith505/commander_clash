// Round 452: Karn Liberated's "Restart the game, leaving in exile all non-Aura permanent cards exiled with ~. Then put
// those cards onto the battlefield under your control." (CR 727, restart.ts).
import type { GameState } from "../types";
import { restartExempt, restartGame } from "../restart";
import type { ResolveCtx } from "./resolve";

/**
 * The cards linked to the source as it was when the ability was activated (CR 607.2a: the ones its +4 and −3 exiled), the
 * non-Aura permanent cards among them still in exile, stay out of the new game (CR 727.5); the rest of this effect, putting
 * them onto the battlefield, happens just before its first untap step (CR 727.4). The old game's resolution ends here:
 * "paused" with the new game's first mulligan decision waiting (s.pending), and nothing left resolving.
 */
export function runRestartGameEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" {
  const key = ctx.sourceId ? `${ctx.sourceId}@${ctx.sourceZc ?? 0}` : undefined;
  restartGame(s, ctx.controller, restartExempt(s, key), src);
  return "paused";
}

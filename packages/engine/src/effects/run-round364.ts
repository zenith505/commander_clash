// Round 364's effects: a source of damage chosen before the rest of a resolution (Desperate Gambit).
import type { Effect } from "../abilities";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { chooseDamageSource } from "./run-prevention";

/**
 * Desperate Gambit: "Choose a source you control and flip a coin.": the source is chosen as it resolves (CR 609.7a), before
 * the coin is flipped, and kept for "that source" (ResolvingInfo.chosenSource): a permanent, a spell on the stack, or a
 * source an ability on the stack refers to (rulings). With none to choose, nothing is kept.
 */
export function runChooseSourceNowEffect(s: GameState, e: Extract<Effect, { type: "chooseSourceNow" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const chosen = chooseDamageSource(s, ctx, e.choose, src, undefined, e.yours);
  if (chosen === "paused") return "paused";
  if (chosen && s.resolving) s.resolving.chosenSource = chosen;
}

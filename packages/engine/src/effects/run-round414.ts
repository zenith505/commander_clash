// Round 414's effects: Confusion in the Ranks' exchange of control of the permanent that entered and the target its
// controller chose.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log } from "../game";
import { characteristics } from "../layers";
import type { GameState } from "../types";
import { type ResolveCtx, objects, runEffect } from "./resolve";

/**
 * Confusion in the Ranks: "Exchange control of those permanents": the permanent that entered (the trigger's subject, still
 * the same object on the battlefield, CR 400.7) and the target, if it's still legal; they must still share a card type as
 * this resolves (rulings), and with both under one player's control nothing happens (CR 701.12b). Otherwise the two
 * controllers swap them indefinitely (CR 701.12a, Effect exchangeControl).
 */
export function runExchangeWithSubjectEffect(s: GameState, e: Extract<Effect, { type: "exchangeWithSubject" }>, ctx: ResolveCtx, src: string): "paused" | void {
  if (s.resolving) s.resolving.did = false;
  const a = objects(s, { ref: "subject" }, ctx)[0];
  const b = ctx.legal[e.index] ? objects(s, { ref: "target", index: e.index }, ctx)[0] : undefined;
  if (!a || !b || b.zone !== "battlefield") {
    log(s, `${src}: ${!a ? "the permanent that entered has left the battlefield" : "its target is gone"}, so nothing is exchanged.`);
    return;
  }
  const ta = characteristics(s, a).types;
  if (!characteristics(s, b).types.some((t) => ta.includes(t))) {
    log(s, `${src}: ${defOf(s, a).name} and ${defOf(s, b).name} no longer share a card type, so nothing is exchanged.`);
    return;
  }
  return runEffect(s, { type: "exchangeControl", a: { ref: "subject" }, b: { ref: "target", index: e.index } }, ctx);
}

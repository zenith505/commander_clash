// Round 320's effects.
import type { Effect } from "../abilities";
import { log, player } from "../game";
import type { GameState } from "../types";
import { type ResolveCtx, runEffect } from "./resolve";

/**
 * Insatiable Frugivore: "create a Food token, then you may exile three cards from your graveyard. If you do, repeat this
 * process.": the instructions in order, then again while their "you may" was done (CR 608.2c), each pass asking anew
 * (rulings: until you decline, and never with fewer than three cards to exile). It ends: each pass exiles three cards.
 */
export function runRepeatIfDidEffect(s: GameState, e: Extract<Effect, { type: "repeatIfDid" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const st = (sc.repeatDid ??= { step: 0, keep: Object.keys(sc) });
  for (;;) {
    for (; st.step < e.effects.length; st.step++) if (runEffect(s, e.effects[st.step]!, ctx) === "paused") return "paused";
    const again = !!r.did;
    for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (k !== "repeatDid" && !st.keep.includes(k)) delete sc[k];
    r.did = undefined;
    st.step = 0;
    if (!again || player(s, ctx.controller).lost) break;
    log(s, `${src} repeats the process.`);
  }
  sc.repeatDid = undefined;
}

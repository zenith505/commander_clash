// Round 454's whole lines (compile.ts, before round 452's): Secret of Bloodbending, which controls an opponent during
// their next combat phase, or during their next turn if its waterbend cost was paid.
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

// "If this spell's additional cost was paid" reads "If ~ was kicked" by now (compile.ts: its "you may waterbend {10}").
const BLOODBENDING = "You control target opponent during their next combat phase. If ~ was kicked, you control that player during their next turn instead.";

/** One whole line of round 454's (compile.ts); false when it isn't one of these. */
export function round454Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Secret of Bloodbending: you control the target opponent (CR 723) during the next combat phase of their turns they
  // actually take (rulings: a skipped one doesn't count, as CR 723.1b), all of it and only it, from the beginning of combat
  // step to the end of combat step (CR 506.1); with the waterbend cost paid (its additional cost, CR 601.2b, 701.67a),
  // during their next turn instead (CR 723.1), as Mindslaver's. You make all of their choices and decisions then (CR
  // 723.5), using only their resources (723.5a), and still your own (723.8); only the player is controlled, not their
  // permanents, spells or abilities (CR 723.3, rulings).
  if (line === BLOODBENDING) {
    if (!isSpell || out.spell || !out.kicker || out.kicker.waterbend === undefined) return fail(out, raw);
    const turn = parseBody("You control target opponent during their next turn.", { spell: true });
    const e = turn?.effects[0];
    if (!turn || turn.targets.length !== 1 || turn.effects.length !== 1 || e?.type !== "controlPlayer" || e.who.ref !== "target") return fail(out, raw);
    out.spell = {
      targets: turn.targets,
      effects: [{ type: "if", cond: { kind: "kicked" }, effects: [e], otherwise: [{ ...e, combat: true }] }],
      text: line,
    };
    return true;
  }
  return false;
}

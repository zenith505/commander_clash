// Round 378's whole lines (compile.ts, after round 377's): the attacking player declaring everyone's blocks (Invasion
// Plans). Brutal Hordechief's and Berserker's Frenzy's sentences are in sentences/permanents.ts.
import type { CompiledCard } from "../abilities";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round378Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Invasion Plans: "The attacking player chooses how each creature blocks each combat.": the active player (CR 506.2)
  // declares each defending player's blockers (CR 509.1), still only legal blocks obeying as many requirements as they
  // can, its own "All creatures block each combat if able" among them (CR 509.1c); see game.ts blockersPending.
  if (line === "The attacking player chooses how each creature blocks each combat.") {
    if (isSpell) return fail(out, raw);
    out.attackerChoosesBlocks = true;
    return true;
  }
  return false;
}

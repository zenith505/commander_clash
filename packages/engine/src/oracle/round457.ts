// Round 457's whole lines (compile.ts): Pulmonic Sliver's granted replacement.
import type { CompiledCard } from "../abilities";

/** One whole line of round 457's (compile.ts); false when it isn't one of these. */
export function round457Line(line: string, _raw: string, out: CompiledCard, _isSpell: boolean): boolean {
  // Pulmonic Sliver: All Slivers have "If this permanent would be put into a graveyard, you may put it on top of its
  // owner's library instead." A replacement effect (CR 614.1a) of the permanent that has it, from the battlefield only (a
  // Sliver is a permanent, CR 109.2), optional: its controller ("you", CR 109.5) chooses as it would be put there, and with
  // other replacements of that move chooses which applies first (CR 616.1e). See move-questions.ts and game.ts moveObject.
  if (/^If (?:~|this permanent) would be put into a graveyard, you may put it on top of its owner's library instead\.$/.test(line)) {
    out.mayTopInsteadOfGraveyard = true;
    return true;
  }
  return false;
}

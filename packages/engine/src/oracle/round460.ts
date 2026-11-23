// Round 460's whole lines (compile.ts): Word of Command (effects/run-round460.ts).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";

const WORD = "Look at target opponent's hand and choose a card from it. You control that player until ~ finishes resolving. The player plays that card if able. While doing so, the player can activate mana abilities only if they're from lands that player controls and only if mana they produce is spent to activate other mana abilities of lands the player controls and/or to play that card. If the chosen card is cast as a spell, you control the player while that spell is resolving.";

/** One whole line of round 460's (compile.ts); false when it isn't one of these. */
export function round460Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Word of Command: a spell's whole text, one instruction (effects/run-round460.ts): the target, "target opponent", is the
  // usual one (CR 115.1), checked as it resolves (CR 608.2b).
  if (line !== WORD) return false;
  const target = parseBody("Target opponent loses 1 life.", { spell: true });
  if (!isSpell || out.spell || !target || target.targets.length !== 1 || target.effects[0]?.type !== "loseLife") {
    out.unsupported.push(raw);
    return true;
  }
  out.spell = { targets: target.targets, effects: [{ type: "wordOfCommand", who: { ref: "target", index: 0 } }], text: line };
  return true;
}

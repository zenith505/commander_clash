// Round 451's whole lines (compile.ts, before round 450's): Ulalek, Fused Atrocity, which copies every spell and then every
// other ability its controller has on the stack.
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const ULALEK =
  "Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies.";

/** One whole line of round 451's (compile.ts); false when it isn't one of these. */
export function round451Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ulalek, Fused Atrocity: a cast trigger (CR 603.2) whose "you may pay {C}{C}. If you do" is paid with colorless mana
  // as it resolves (CR 107.4c, 603.5). Then each spell you control on the stack is copied, the Eldrazi spell too if it's
  // still there, and after that each other activated or triggered ability you control (CR 608.2c; mana abilities don't use
  // the stack, CR 605.3b, so there are none to copy). Copies aren't cast or activated (CR 707.10, rulings), so nothing
  // triggers on casting them; each may have new targets (CR 707.10c, rulings), keeping modes, X, divisions and the
  // additional or alternative costs paid for the original (CR 707.10, rulings); a copy of a permanent spell becomes a token
  // (CR 608.3f). The copies one instruction makes go on the stack in the order their controller chooses (CR 405.3).
  if (line === ULALEK) {
    if (isSpell) return fail(out, raw);
    const t = parseTrigger("Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, draw a card.");
    const may = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "castSpell" || t.cast?.by !== "you" || t.body.effects.length !== 1 || may?.type !== "may" || may.pay?.mana !== "{C}{C}" || may.effects.length !== 1 || may.effects[0]!.type !== "draw") return fail(out, raw);
    const text = "you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies.";
    out.triggers.push({
      ...t,
      body: {
        targets: [],
        effects: [{ ...may, effects: [{ type: "copySpell", spell: "allYours", n: 1, newTargets: true }], text: "pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control" }],
        text,
      },
    });
    return true;
  }
  return false;
}

// Round 441's whole lines (compile.ts, before round 440's): The Myriad Pools' permanent that becomes a copy of the spell
// its mana was spent on. (Wayta, Trainer Prodigy's lines are in activated.ts and compile.ts triggersAgainLine.)
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const POOLS = "Whenever you cast a permanent spell using mana produced by ~, up to one other target permanent you control becomes a copy of that spell until end of turn.";

/** One whole line of round 441's (compile.ts); false when it isn't one of these. */
export function round441Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell || line !== POOLS) return false;
  // The Myriad Pools: "Whenever you cast a permanent spell using mana produced by ~, ...": some of the mana spent to cast it
  // came from this permanent (CR 601.2h), as the object it is (CR 400.7). The trigger goes on the stack above the spell
  // and resolves first (rulings). "Up to one other target permanent you control" (CR 115.1, 601.2c) becomes a copy of
  // that spell until end of turn (CR 707.4, 613.2a, 611.2a): of the spell's copiable values (CR 707.2: what's printed on
  // the card, as modified by copy effects and its face-down status, and the face it was cast as or its prototype, CR
  // 718.2a), plus the choices made when casting it (rulings), X as 0 for its mana value (rulings). It isn't entering, so the
  // spell's "enters" abilities don't apply to it (rulings); counters and non-copy effects on it still do (rulings). A spell
  // that has left the stack by then is copied as it last existed there (CR 608.2h). See effects/run-copies.ts copiedValues.
  const t = parseTrigger("Whenever you cast a permanent spell using mana produced by ~, tap up to one other target permanent you control.");
  const target = t && t !== "fail" ? t.body.targets[0] : undefined;
  if (!t || t === "fail" || t.event !== "castSpell" || !t.cast?.manaFromSelf || t.body.targets.length !== 1 || target?.kind !== "object" || !target.optional || !target.notSource || target.controller !== "you") {
    out.unsupported.push(raw);
    return true;
  }
  out.triggers.push({ ...t, body: { targets: [{ ...target, text: "other target permanent you control" }], effects: [{ type: "becomeCopy", what: { ref: "target", index: 0 }, of: { ref: "castSpell" }, duration: "endOfTurn" }], text: "Up to one other target permanent you control becomes a copy of that spell until end of turn." } });
  return true;
}

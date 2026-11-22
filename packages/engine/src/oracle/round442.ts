// Round 442's whole lines (compile.ts, before round 441's): Arna Kennerüd, Skycaptain's token copies of what's attached to
// an attacking modified creature, and Auspicious Starrix's cards exiled until X permanent cards, put onto the battlefield.
import type { CompiledCard } from "../abilities";
import { parseSearchFilter } from "./search";
import { parseTrigger } from "./triggers";

const ARNA_DOUBLE = "Whenever a modified creature you control attacks, double the number of each kind of counter on it.";
const ARNA = `${ARNA_DOUBLE.slice(0, -1)}. Then for each nontoken permanent attached to it, create a token that's a copy of that permanent attached to that creature.`;
const STARRIX = "Whenever ~ mutates, exile cards from the top of your library until you exile X permanent cards, where X is the number of times ~ has mutated. Put those permanent cards onto the battlefield.";

/** One whole line of round 442's (compile.ts); false when it isn't one of these. */
export function round442Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  if (line === ARNA) {
    // Arna Kennerüd, Skycaptain: "Whenever a modified creature you control attacks" (CR 508.1m, 700.9: equipped, enchanted
    // by an Aura its controller controls, or with a counter on it, rulings), "double the number of each kind of counter on
    // it" (CR 701.10e: as many more of each kind as it has, rulings), "Then for each nontoken permanent attached to it,
    // create a token that's a copy of that permanent attached to that creature" (effects/run-round442.ts).
    const t = parseTrigger(ARNA_DOUBLE);
    const dbl = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "creatureYouControlAttacks" || t.body.targets.length || t.body.effects.length !== 1 || dbl?.type !== "counters" || !dbl.double || !dbl.everyKind || dbl.what.ref !== "subject") {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [dbl, { type: "tokenCopiesOfAttached", what: { ref: "subject" } }], text: raw } });
    return true;
  }
  if (line === STARRIX) {
    // Auspicious Starrix: "Whenever ~ mutates" (CR 702.140d), "exile cards from the top of your library until you exile X
    // permanent cards, where X is the number of times ~ has mutated" (counted as it resolves, of the merged permanent, or
    // as it last existed, CR 608.2h; the whole library if it holds fewer, rulings), "Put those permanent cards onto the
    // battlefield." (all at once, CR 608.2c: an Aura chooses what it enchants among what's already there, CR 303.4f, and
    // with nothing to enchant stays exiled, as every other card exiled this way does, rulings; lands don't count as land
    // plays, CR 305.4).
    const t = parseTrigger("Whenever ~ mutates, draw a card.");
    const filter = parseSearchFilter("permanent card");
    if (!t || t === "fail" || t.event !== "selfMutates" || !filter) {
      out.unsupported.push(raw);
      return true;
    }
    out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "revealUntil", filter, found: "battlefield", rest: "exile", exile: true, n: { count: { kind: "mutations" } } }], text: raw } });
    return true;
  }
  return false;
}

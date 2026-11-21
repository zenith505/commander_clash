// Round 438's whole lines (compile.ts, before round 437's): casting with a permission whose extra cost is removing counters
// from creatures you control. Falco Spara, Pactweaver casts from the top of the library with it (Into the Pit's way), and
// Dawnhand Dissident casts creature cards it exiled (Intrepid Paleontologist's way).
import type { AdditionalCost, CompiledCard, TargetSpec } from "../abilities";
import { parseFromTop } from "./compile";
import { parseSearchFilter } from "./search";

const creaturesYouControl = (): TargetSpec => ({ kind: "object", types: ["Creature"], notTypes: [], notColors: [], controller: "you", text: "creatures you control" });
const WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** One whole line of round 438's (compile.ts); false when it isn't one of these. */
export function round438Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Falco Spara, Pactweaver: "You may cast spells from the top of your library by removing a counter from a creature you
  // control in addition to paying their other costs." An additional cost of each spell cast with this permission (CR
  // 601.2f-h, rulings: it may be combined with the spell's other additional or alternative costs), a counter of any kind
  // from one creature you control, Falco's own shield counter too; the usual timing (CR 601.3). With another permission to
  // cast that card that has no such cost, that one is used (topPermission).
  const falco = /^(You may cast (?:.+?) from the top of your library) by removing (a|one) counter from a creature you control in addition to paying their other costs\.$/.exec(line);
  if (falco) {
    if (isSpell) return false;
    const top = parseFromTop(falco[1]!);
    if (!top?.spells || top.lands || top.once) out.unsupported.push(raw);
    else (out.fromTop ??= []).push({ ...top, costs: [{ kind: "removeCounters", n: 1, filter: creaturesYouControl() }] });
    return true;
  }
  // Dawnhand Dissident: "During your turn, you may cast creature spells from among cards you own exiled with ~ by removing
  // three counters from among creatures you control in addition to paying their other costs." The cards its "Exile target
  // card from a graveyard" exiled (CR 607.2a, linked in compile.ts linkExile), only those you own, as creature spells with
  // their usual timing and costs (rulings), during your turn; the counters any mix of kinds from any creatures you control
  // (CR 601.2h), an additional cost of the spell (CR 601.2f). It must be under your control as the casting begins, not
  // after (rulings: the cost is kept as the spell is cast, game.ts linkedCastCosts).
  const dissident = /^During your turn, you may cast ([A-Za-z ]+?) spells from among cards you own exiled with ~ by removing (a|one|two|three|four|five|six) counters? from among creatures you control in addition to paying their other costs\.$/.exec(line);
  if (dissident) {
    if (isSpell) return false;
    const f = parseSearchFilter(`${dissident[1]!} card`);
    const n = WORDS[dissident[2]!]!;
    if (!f || !f.types?.includes("Creature") || out.playLinkedWhile || out.playLinked || out.playLinkedForLife) out.unsupported.push(raw);
    else {
      const costs: AdditionalCost[] = [{ kind: "removeCounters", n, filter: creaturesYouControl() }];
      out.playLinkedWhile = { kind: "allOf", conds: [{ kind: "yourTurn" }] };
      out.playLinkedCastOnly = true;
      out.playLinkedOnly = { filter: f, own: true, costs };
    }
    return true;
  }
  return false;
}

// Lane B round B280's lines, read by compileCard before the generic triggers and statics (after round B279's): Filigree
// Vector's two "any number of target" groups in one triggered ability, Lich's Mirror's replacement of losing the game.
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const MIRROR = "If you would lose the game, instead shuffle your hand, your graveyard, and all permanents you own into your library, then draw seven cards and your life total becomes 20.";
const VECTOR = "When ~ enters, put a +1/+1 counter on each of any number of target creatures and a charge counter on each of any number of target artifacts.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB280Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Filigree Vector: one triggered ability with two groups of targets, each "any number of target ..." (CR 115.6, 601.2c,
  // 603.3d), chosen as it's put on the stack; each "target" is a word of its own, so an artifact creature may be chosen for
  // both and gets both counters (CR 115.3, rulings), none twice within one group (fitManyGroups in modes.ts). It resolves
  // for the targets still legal (CR 608.2b).
  if (line === VECTOR) {
    if (isSpell) return fail();
    const a = parseTrigger("When ~ enters, put a +1/+1 counter on each of any number of target creatures.");
    const b = parseTrigger("When ~ enters, put a charge counter on each of any number of target artifacts.");
    if (!a || a === "fail" || !b || b === "fail" || a.body.targets.length !== 1 || b.body.targets.length !== 1 || a.body.effects.length !== 1 || b.body.effects.length !== 1) return fail();
    const second = b.body.effects[0]!;
    if (second.type !== "counters" || second.what.ref !== "target" || second.what.index !== 0) return fail();
    out.triggers.push({
      ...a,
      body: {
        targets: [a.body.targets[0]!, b.body.targets[0]!],
        effects: [a.body.effects[0]!, { ...second, what: { ...second.what, index: 1 } }],
        text: line.slice("When ~ enters, ".length),
      },
    });
    return true;
  }
  // Lich's Mirror: a replacement effect of losing the game, any way but conceding (CR 104.3a, 614.1a; rulings), applied in
  // game.ts (loseReplacements, lichsMirror).
  if (line === MIRROR) {
    if (isSpell || out.loseGameMirror) return fail();
    out.loseGameMirror = true;
    return true;
  }
  return false;
}

// Round 456's whole lines (compile.ts): Chef's Kiss (gain control of a spell, copy it, then reselect the targets of both
// at random).
import type { CompiledCard } from "../abilities";
import { parseBody } from "./body";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const KISS = "Gain control of target spell that targets only a single permanent or player. Copy it, then reselect the targets at random for the spell and the copy. The new targets can't be you or a permanent you control.";

/** One whole line of round 456's (compile.ts); false when it isn't one of these. */
export function round456Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Chef's Kiss: a target spell every target of which names one permanent or player (TargetSpec.targetsOnlyPermanentOrPlayer;
  // rulings: any such spell, yours too, and several instances of "target" all naming it count). As it resolves you gain
  // control of it (Commandeer's controlSpell), copy it (CR 707.10: the copy is yours, with the same targets), then each
  // target of the spell and of the copy is reselected at random (Effect chefsKiss, effects/run-round456.ts).
  if (line === KISS) {
    const body = isSpell && !out.spell ? parseBody("Gain control of target spell.", { spell: true }) : null;
    const spec = body?.targets[0];
    if (!body || body.targets.length !== 1 || spec?.kind !== "spell" || body.effects.length !== 1 || body.effects[0]?.type !== "controlSpell") return fail(out, raw);
    out.spell = {
      targets: [{ ...spec, targetsOnlyPermanentOrPlayer: true, text: "target spell that targets only a single permanent or player" }],
      effects: [{ type: "controlSpell", index: 0 }, { type: "chefsKiss", index: 0 }],
      text: line,
    };
    return true;
  }
  return false;
}

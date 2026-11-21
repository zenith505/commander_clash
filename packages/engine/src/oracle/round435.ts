// Round 435's whole lines (compile.ts, before round 434's) and sentences (body.ts chain, before round 434's): Olag,
// Ludevic's Hubris's copy as it transforms, and March from Velis Vel's lands of a chosen nonbasic type becoming copies.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseCopyExcept } from "./tokens";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);
const plain = (s: string | undefined) => (s ?? "").replace(/\.$/, "");

/** One whole line of round 435's (compile.ts); false when it isn't one of these. */
export function round435Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Olag, Ludevic's Hubris: "As this creature transforms into ~, it becomes a copy of a creature card exiled with it, except
  // its name is ~, it's 4/4, and it's a legendary blue and black Zombie in addition to its other colors and types. Put a
  // number of +1/+1 counters on ~ equal to the number of creature cards exiled with it.": applied while it transforms, not
  // afterwards (CR 712.20; rulings: it doesn't transform and then become a copy). "Exiled with it" is what its front face's
  // cost exiled (CR 607.1b, 607.2a; game.ts links that cost's cards for a face with this). The card is chosen as it
  // transforms (rulings), copied as printed (CR 707.2) for good, even once it leaves exile (rulings); the counters are one
  // for each creature card exiled with it then. With none, Olag is its own 4/4 self with no counters (rulings).
  const olag = /^As ~ transforms into ~, it becomes a copy of a creature card exiled with it, except (.+)\. Put a number of \+1\/\+1 counters on ~ equal to the number of creature cards exiled with it\.$/.exec(line);
  if (olag) {
    const except = parseCopyExcept(olag[1]!);
    if (isSpell || out.asTransformsCopyLinked || out.asTransforms || !except || except.name !== "~" || except.thisAbility || except.enterCounters) return fail(out, raw);
    out.asTransformsCopyLinked = except;
    return true;
  }
  return false;
}

/** One sentence of round 435's (body.ts chain); null when it isn't one of these. */
export function round435Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): { effect: Effect; next: number } | "fail" | null {
  // March from Velis Vel: "Choose a nonbasic land type. Each land you control of that type becomes a copy of target creature
  // you control until end of turn and gains haste until end of turn." The type is chosen as it resolves (CR 608.2d), one of
  // CR 205.3i's that isn't basic; the lands are those of that type as it resolves (CR 611.2c). Each becomes a copy of the
  // target as it is (its copiable values, a copy of what it copies too; X is 0; not tapped or counters, CR 707.2, rulings),
  // nothing enters (rulings), and each has haste, both until end of turn (CR 514.2). An illegal target counters it (CR 608.2b).
  if (/^[Cc]hoose a nonbasic land type$/.test(s) && plain(sentences[si + 1]) === "Each land you control of that type becomes a copy of target creature you control until end of turn and gains haste until end of turn") {
    if (!ctx.spell || effects.length || ctx.targets.length || sentences.length !== si + 2) return "fail";
    const fx = parseSentence("Each land you control becomes a copy of target creature you control until end of turn", ctx);
    const e = fx?.length === 1 ? fx[0] : undefined;
    const t = ctx.targets[0];
    if (e?.type !== "becomeCopy" || e.except || e.duration !== "endOfTurn" || e.of.ref !== "target" || e.of.index !== 0 || ctx.targets.length !== 1 || t?.kind !== "object" || t.controller !== "you" || t.types?.join() !== "Creature") return "fail";
    return { effect: { type: "landTypeCopies", of: e.of }, next: si + 2 };
  }
  return null;
}

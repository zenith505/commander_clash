// Round 389's sentences (read first by round373Sentence) and whole lines (compile.ts): The Pandorica's phasing lock while it
// stays tapped, Barroom Brawl's fight with the opponent to your left and their copy, and Over the Top's reveal for every
// player.
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 389's, read before round 388's. */
export function round389Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  const prev = effects[effects.length - 1];
  // The Pandorica: "Untap another target nonland permanent, then it phases out. It can't phase in for as long as ~ remains
  // tapped.": the permanent it phased out directly skips its controller's untap steps (CR 702.26a) while ~ is still that
  // object on the battlefield, tapped, and hasn't untapped since; once that stops (it untaps, leaves the battlefield or
  // phases out, the "for as long as" ignoring phased-out objects, rulings) the duration is over for good (CR 611.2b). If ~
  // isn't tapped as the ability resolves, the duration never begins.
  if (line === "It can't phase in for as long as ~ remains tapped") {
    const t = prev?.type === "phaseOut" && prev.what.ref === "target" ? prev.what.index : undefined;
    if (!ctx.activated || ctx.spell || t === undefined || ctx.targets[t]?.kind !== "object" || ctx.targets[t]?.many || prev?.type !== "phaseOut" || prev.untilSourceLeaves || prev.anyNumber || prev.lockedUntilYourNextTurnEnds || prev.lockWhileYouControlSource || prev.noTap) return "fail";
    effects.pop();
    return { effect: { ...prev, lockWhileSourceTapped: true }, next: si + 1 };
  }
  // The Pandorica: "When ~ becomes untapped or leaves the battlefield, that permanent phases in.": a delayed trigger watching
  // ~ as it is now, about the permanent its ability phased out (CR 603.7c, 400.7), the first time ~ untaps or leaves for any
  // zone (as Merieke Ri Berit's). Phasing out isn't leaving (CR 702.26d), so a phased-out ~ triggers it neither way; the
  // permanent phases in as the trigger resolves if it's still phased out (CR 702.26c).
  if (line === "When ~ becomes untapped or leaves the battlefield, that permanent phases in") {
    const lock = prev?.type === "phaseOut" && prev.lockWhileSourceTapped && prev.what.ref === "target" ? prev.what.index : undefined;
    if (!ctx.activated || ctx.spell || lock === undefined) return "fail";
    return { effect: { type: "delayed", when: "leaves", of: { ref: "self" }, about: lock, aboutPhasedOut: true, orUntaps: true, effects: [{ type: "phaseInSubject" }], text: "that permanent phases in" }, next: si + 1 };
  }
  // Barroom Brawl: "Target creature you control fights target creature the opponent to your left controls.": the nearest
  // opponent on your left, as seated (CR 101.4), who is "you"'s left opponent again for a copy that player controls (CR
  // 707.10). With one of the targets illegal as it resolves, neither deals damage (CR 701.14b, rulings).
  if (line === "Target creature you control fights target creature the opponent to your left controls") {
    if (!ctx.spell || effects.length || ctx.targets.length || si !== 0) return "fail";
    const fx = parseSentence("Target creature you control fights target creature an opponent controls", ctx);
    const theirs = ctx.targets[1];
    if (fx?.length !== 1 || fx[0]!.type !== "fight" || ctx.targets.length !== 2 || theirs?.kind !== "object" || theirs.controller !== "opponent") return "fail";
    ctx.targets[1] = { ...theirs, leftOpponentControls: true, text: "target creature the opponent to your left controls" };
    return { effect: fx[0]!, next: si + 1 };
  }
  // Barroom Brawl: "Then that player may copy ~ and may choose new targets for the copy." (read without its "Then"): the opponent to your left as it
  // resolves, whoever controls the creature targeted by then (rulings), even with one target illegal; the copy is that
  // player's (CR 707.10), so its "you" and "the opponent to your left" are theirs, and it can be copied again. With both
  // targets illegal the spell doesn't resolve (CR 608.2b), so no copy is made (rulings).
  if (/^(?:Then that|That) player may copy ~ and may choose new targets for the copy$/.test(line)) {
    const b = prev?.type === "fight" && prev.b.ref === "target" && !prev.b.n ? ctx.targets[prev.b.index] : undefined;
    if (!ctx.spell || b?.kind !== "object" || !b.leftOpponentControls || sentences.length !== si + 1) return "fail";
    return { effect: { type: "eachMay", who: { ref: "neighbor", side: "left" }, each: true, chain: true, effects: [{ type: "copySpell", spell: "self", n: 1, newTargets: true }], text: "copy ~ and choose new targets for the copy" }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 389's (compile.ts); false when it isn't one of these. */
export function round389Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Over the Top: the whole instruction is one effect (Effect overTheTop, effects/run-round389.ts).
  if (line === "Each player reveals a number of cards from the top of their library equal to the number of nonland permanents they control, puts all permanent cards they revealed this way onto the battlefield, and puts the rest into their graveyard.") {
    if (!isSpell || out.spell) return fail(out, raw);
    out.spell = { targets: [], effects: [{ type: "overTheTop" }], text: line };
    return true;
  }
  return false;
}

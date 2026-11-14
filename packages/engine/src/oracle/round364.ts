// Round 364's sentences, read before round 363's (round363Sentence in oracle/round363.ts reads these first), and its whole
// lines (compile.ts, after round 363's): the next exhaust ability copied (Pit Automaton), the next combat damage of an
// unblocked creature of your choice cut to 1 (Forcefield), a source of yours whose next damage a coin flip doubles or
// prevents (Desperate Gambit), and token copies attacking for each creature the defending player controls (Nacatl
// War-Pride).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { round365Sentence } from "./round365";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A spell filter nothing matches: a nextCast about exhaust abilities only (Pit Automaton). */
const NO_SPELL: TargetSpec = { kind: "spell", types: ["Instant", "Sorcery"], notTypes: [], notColors: [], text: "exhaust ability" };

export function round364Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 365's sentences first (oracle/round365.ts).
  const r365 = round365Sentence(s, sentences, si, ctx, effects);
  if (r365) return r365;
  const line = plain(s);
  const next = plain(sentences[si + 1]);
  // Pit Automaton: "{2}, {T}: When you next activate an exhaust ability that isn't a mana ability this turn, copy it. You may
  // choose new targets for the copy.": a delayed triggered ability (CR 603.7a), once (603.7c), as its controller next
  // activates an exhaust ability (CR 702.177a) that isn't a mana ability (rulings: an exhaust mana ability doesn't trigger
  // it, CR 605.1a); the copy isn't activated, so it's no exhaust activation of its own, and it resolves first (CR 707.10).
  if (ctx.activated && line === "When you next activate an exhaust ability that isn't a mana ability this turn, copy it") {
    if (next !== "You may choose new targets for the copy" || sentences.length !== si + 2 || effects.length || ctx.targets.length) return "fail";
    return { effect: { type: "nextCast", filter: NO_SPELL, effects: [{ type: "copySpell", spell: "cause", n: 1, newTargets: true }], text: "copy that ability", exhaust: true }, next: si + 2 };
  }
  // Forcefield: "{1}: The next time an unblocked creature of your choice would deal combat damage to you this turn, prevent
  // all but 1 of that damage.": the creature chosen as it resolves (CR 609.7a) among attacking creatures that aren't
  // blocked then (CR 509.1h), a permanent only; a shield for its next combat damage to you (CR 615.8), prevention (615.1a),
  // so a blocked creature with trample isn't one to choose (rulings).
  if (line === "The next time an unblocked creature of your choice would deal combat damage to you this turn, prevent all but 1 of that damage") {
    if (sentences.length !== si + 1 || effects.length) return "fail";
    const choose: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], combat: "unblocked", text: "unblocked creature" };
    return { effect: { type: "damageMod", mod: { op: "allBut", n: 1, prevent: true, nextTime: true, combat: "only", to: { players: "you" }, text: line }, choose, choosePermanent: true }, next: si + 1 };
  }
  return null;
}

const DESPERATE_GAMBIT =
  "Choose a source you control and flip a coin. If you win the flip, the next time that source would deal damage this turn, it deals double that damage instead. If you lose the flip, the next time it would deal damage this turn, prevent that damage.";

const NACATL =
  "Whenever ~ attacks, create X tokens that are copies of it and that are tapped and attacking, where X is the number of creatures defending player controls. Exile the tokens at the beginning of the next end step.";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

export function round364Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Desperate Gambit: the source chosen first, as it resolves (CR 609.7a): a permanent, a spell, or a source an ability on
  // the stack refers to (rulings); then the coin flipped (CR 705), so the result is known before the damage (rulings).
  // Won, the next time that source would deal damage this turn it deals double (a replacement, CR 614.1a); lost, that
  // damage is prevented (CR 615.8). Either applies once, to its next damage event, whoever it's dealt to.
  if (line === DESPERATE_GAMBIT) {
    if (!isSpell || out.spell) return fail(out, raw);
    const once = (op: "times" | "prevent", text: string): Effect => ({ type: "damageMod", mod: op === "times" ? { op, n: 2, nextTime: true, text } : { op, prevent: true, nextTime: true, text }, chosenSource: true });
    out.spell = {
      targets: [],
      effects: [
        { type: "chooseSourceNow", choose: { kind: "object", notTypes: [], notColors: [], text: "source you control" }, yours: true },
        { type: "flipCoin" },
        { type: "if", cond: { kind: "wonFlip" }, effects: [once("times", "The next time that source would deal damage this turn, it deals double that damage instead")], otherwise: [once("prevent", "The next time that source would deal damage this turn, prevent that damage")] },
      ],
      text: line,
    };
    return true;
  }
  // Nacatl War-Pride: copies of it as it is now, or as it last existed if it has left (rulings, CR 707.2, 608.2h), each
  // tapped and attacking what its controller chooses (CR 508.4; rulings: any player they may attack), X the creatures the
  // player it attacks (or whose planeswalker or battle it attacks) controls (CR 506.2), counted as it resolves. Entering
  // attacking, they never "attacked" (rulings, CR 508.3a).
  if (line === NACATL) {
    const t = isSpell ? null : parseTrigger("Whenever ~ attacks, create X tapped and attacking tokens that are copies of ~, where X is the number of creatures defending player controls. Exile the tokens at the beginning of the next end step.");
    const copy = t && t !== "fail" ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfAttacks" || copy?.type !== "createTokenCopy" || copy.what.ref !== "self" || !copy.attacking || t.body.effects.length !== 2) return fail(out, raw);
    out.triggers.push({ ...t, body: { ...t.body, text: NACATL.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  return false;
}

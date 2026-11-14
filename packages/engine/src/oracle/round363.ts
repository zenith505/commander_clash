// Round 363's sentences, read before round 362's (round362Sentence in oracle/round362.ts reads these first), and its whole
// lines (compile.ts, after round 362's).
import type { CompiledCard, Effect, TargetSpec } from "../abilities";
import type { Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { parseCopyExcept } from "./tokens";
import { round364Sentence } from "./round364";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");
const creatureCard: TargetSpec = { kind: "card", types: ["Creature"], notTypes: [], notColors: [], text: "creature card" };

export function round363Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 364's sentences first (oracle/round364.ts).
  const r364 = round364Sentence(s, sentences, si, ctx, effects);
  if (r364) return r364;
  const line = plain(s);
  const next = plain(sentences[si + 1]);
  // Vesuvan Drifter: "At the beginning of each combat, you may reveal the top card of your library. If you reveal a
  // creature card this way, ~ becomes a copy of that card until end of turn, except it has flying.": the card as printed
  // (CR 707.2, its front face, 712.8a; X is 0, rulings), with flying as a copiable value of its own (CR 707.9b); the card
  // stays on top of the library. Effects already applying to ~ keep applying (CR 613.7, rulings).
  if (!ctx.spell && !ctx.activated && /^[Yy]ou may reveal the top card of your library$/.test(line) && next === "If you reveal a creature card this way, ~ becomes a copy of that card until end of turn, except it has flying" && sentences.length === si + 2 && !effects.length && !ctx.targets.length) {
    const except = parseCopyExcept("it has flying");
    if (!except) return "fail";
    const copy: Effect = { type: "becomeCopy", what: { ref: "self" }, of: { ref: "revealed" }, except, duration: "endOfTurn" };
    return { effect: { type: "may", effects: [{ type: "revealTop" }, { type: "if", cond: { kind: "revealedIs", filter: creatureCard }, effects: [copy] }], text: "reveal the top card of your library" }, next: si + 2 };
  }
  // The Phasing of Zhalfir: "I, II — Another target nonland permanent phases out. It can't phase in for as long as you
  // control ~.": it skips its controller's untap steps while you control the Saga; once you don't (it left, phased out
  // or changed control) the duration is over for good and it phases in at its controller's next untap step as usual
  // (CR 611.2b, 702.26a, rulings). Phasing out triggers no leaves ability (CR 702.26d).
  if (!ctx.spell && !ctx.activated && line === "It can't phase in for as long as you control ~") {
    const prev = effects[effects.length - 1];
    if (effects.length !== 1 || prev?.type !== "phaseOut" || prev.what.ref !== "target" || prev.untilSourceLeaves || prev.anyNumber || prev.lockedUntilYourNextTurnEnds || prev.noTap || sentences.length !== si + 1) return "fail";
    effects.pop();
    return { effect: { ...prev, lockWhileYouControlSource: true }, next: si + 1 };
  }
  // Trial of a Time Lord: "IV — Starting with you, each player votes for innocent or guilty. If guilty gets more votes, the
  // owner of each card exiled with ~ puts that card on the bottom of their library.": the cards its chapters exiled until it
  // leaves (CR 610.3); a tie, or more innocent votes, leaves them to return as the Saga leaves (rulings, CR 714.4).
  if (!ctx.spell && !ctx.activated && line === "If guilty gets more votes, the owner of each card exiled with ~ puts that card on the bottom of their library") {
    if (!ctx.vote?.options?.includes("guilty") || sentences.length !== si + 1) return "fail";
    return { effect: { type: "if", cond: { kind: "voteWins", option: "guilty" }, effects: [{ type: "untilLeavesToBottom" }] }, next: si + 1 };
  }
  // Gale's Redirection: "Exile target spell, then roll a d20 and add that spell's mana value. 1—14 | You may cast the
  // exiled card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that
  // spell. 15+ | You may cast the exiled card without paying its mana cost for as long as it remains exiled.": the card the
  // spell was, exiled from the stack (not countered, rulings), a permission for this spell's controller while it stays
  // exiled (CR 400.7, 609.4b); a copy of a spell leaves no card (CR 707.10a).
  // Each row is read after the exile and the roll (the results table, body.ts closeRow).
  const [ex, roll] = effects;
  if (ctx.spell && ex?.type === "counterSpell" && ex.exileSpell && ex.index === 0 && !ex.linked && !ex.plot && !ex.ownerMayCost && roll?.type === "roll" && roll.sides === 20 && ctx.targets.length === 1 && ctx.targets[0]!.kind === "spell") {
    if (line === "You may cast the exiled card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell")
      return { effect: { type: "mayCastExiledSpell", anyColor: true }, next: si + 1 };
    if (line === "You may cast the exiled card without paying its mana cost for as long as it remains exiled") return { effect: { type: "mayCastExiledSpell", free: true }, next: si + 1 };
  }
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const DECEIVER = "At the beginning of combat on your turn, reveal the top card of your library. If a creature card is revealed this way, you may have creatures you control other than ~ become copies of that card until end of turn. You may put that card on the bottom of your library.";

export function round363Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Deceiver of Form: the card as printed (CR 707.2, rulings), each of those creatures keeping its counters and the
  // noncopy effects on it (CR 613.7, rulings); none of them enters or leaves (rulings). The card may go to the bottom
  // whatever it is, and whether or not they became copies of it (rulings). Read whole: the reveal sentence alone is
  // taken by an earlier template.
  if (line === DECEIVER) {
    const t = isSpell ? null : parseTrigger("At the beginning of combat on your turn, other creatures you control become copies of target creature until end of turn.");
    const fx = t && t !== "fail" ? t.body.effects : [];
    const what = fx.length === 1 && fx[0]!.type === "becomeCopy" ? fx[0]!.what : undefined;
    if (!t || t === "fail" || t.event !== "yourBeginCombat" || what?.ref !== "each" || !what.other) return fail(out, raw);
    const copy: Effect = { type: "becomeCopy", what, of: { ref: "revealed" }, duration: "endOfTurn" };
    const effects: Effect[] = [
      { type: "revealTop" },
      { type: "if", cond: { kind: "revealedIs", filter: creatureCard }, effects: [{ type: "may", effects: [copy], text: "have creatures you control other than ~ become copies of that card until end of turn" }] },
      { type: "may", effects: [{ type: "topToBottom" }], text: "put that card on the bottom of your library" },
    ];
    out.triggers.push({ ...t, body: { targets: [], effects, text: DECEIVER.replace(/^At the beginning of combat on your turn, /, "") } });
    return true;
  }
  return false;
}

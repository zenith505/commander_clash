// Round 391's sentences (read first by round373Sentence) and whole lines (compile.ts): cards exiled in a face-down pile,
// shuffled, then manifested or cloaked (Ghastly Conscription, Become Anonymous, Expose the Culprit), and every creature a
// player controls made to attack during their next turn (Rowan Kenrith).
import type { CompiledCard, Effect } from "../abilities";
import type { Ctx } from "./body";
import { parsePlayer, parseTargetPhrase } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 391's, read before round 390's. */
export function round391Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Expose the Culprit's second mode: the creatures chosen as it resolves (Effect faceDownPile `chooseDisguised`), cloaked
  // under your control, untapped (CR 701.58a); they're new objects (CR 400.7). No target, so it isn't parsed as one.
  // (", then cloak them" reaches here as a sentence of its own.)
  if (plain(s) === "Exile any number of face-up creatures you control with disguise in a face-down pile, shuffle that pile" && plain(sentences[si + 1]) === "Cloak them" && sentences.length === si + 2) {
    if (!ctx.spell || ctx.targets.length) return "fail";
    return { effect: { type: "faceDownPile", chooseDisguised: true, into: "cloak" }, next: si + 2 };
  }
  // Rowan Kenrith's +2: "During target player's next turn, each creature that player controls attacks if able.": the
  // requirement is a rule, so it's for every creature that player controls during that turn, those that come under their
  // control later in it too (CR 508.1d; 611.2c is only for characteristics), in each combat of it, attacking anything it
  // can (Effect attackYouNextTurn `anyone`, GameState.attackPlayerNextTurn). With you the target, your next turn, not this.
  if (plain(s) === "During target player's next turn, each creature that player controls attacks if able" && sentences.length === si + 1) {
    const who = ctx.activated && ctx.targets.length === 0 ? parsePlayer("target player", ctx) : null;
    if (who?.ref !== "target") return "fail";
    return { effect: { type: "attackYouNextTurn", who, anyone: true }, next: si + 1 };
  }
  void effects;
  return null;
}

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

/** One whole line of round 391's (compile.ts); false when it isn't one of these. */
export function round391Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Ghastly Conscription: every creature card in the target player's graveyard as it resolves, exiled face down,
  // shuffled, then manifested under your control (Effect faceDownPile, effects/run-round391.ts; CR 701.40a, rulings).
  if (line === "Exile all creature cards from target player's graveyard in a face-down pile, shuffle that pile, then manifest those cards.") {
    const player = parseTargetPhrase("player");
    if (!isSpell || out.spell || !player) return fail(out, raw);
    out.spell = { targets: [player], effects: [{ type: "faceDownPile", yardOf: { ref: "target", index: 0 }, into: "manifest" }], text: line };
    return true;
  }
  // Become Anonymous: the target creature (one you own, whoever controls it) and your library's top two cards, exiled
  // face down, shuffled, then cloaked under your control, tapped (CR 701.58a, rulings). With the target illegal as it
  // resolves, the spell doesn't resolve and nothing is exiled (CR 608.2b).
  if (line === "Exile target nontoken creature you own and the top two cards of your library in a face-down pile, shuffle that pile, then cloak those cards. They enter tapped.") {
    const creature = parseTargetPhrase("nontoken creature you own");
    if (!isSpell || out.spell || creature?.kind !== "object" || creature.owner !== "you" || creature.token !== false) return fail(out, raw);
    out.spell = { targets: [creature], effects: [{ type: "faceDownPile", what: { ref: "target", index: 0 }, top: 2, into: "cloak", tapped: true }], text: line };
    return true;
  }
  return false;
}

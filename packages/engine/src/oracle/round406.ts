// Round 406's triggers (parseTrigger), sentences (read first by round373Sentence) and whole lines (compile.ts): Lazav, Dimir
// Mastermind's copy of a creature card put into an opponent's graveyard, Quintorius, Loremaster's free cast of a card
// exiled with it, and Maralen, Fae Ascendant's once-each-turn free cast from among the cards it exiled this turn.
import type { CompiledCard, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseCount } from "./counts";
import { parseCardTarget } from "./targets";
import { parseCopyExcept } from "./tokens";
import { parseTrigger } from "./triggers";

const LAZAV = "Whenever a creature card is put into an opponent's graveyard from anywhere, you may have ~ become a copy of that card, except its name is ~, it's legendary in addition to its other types, and it has hexproof and this ability.";

/** A triggered ability of round 406's; null when the line isn't one of these. */
export function round406Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Lazav, Dimir Mastermind: once for each creature card an opponent owns put into their graveyard (CR 603.2c, rulings: you
  // order them; tokens aren't cards). "That card" is copied as it last existed in the graveyard, wherever it is as this
  // resolves (rulings): exactly as printed (CR 707.2), with the exceptions part of the copy's values (CR 707.9b), "this
  // ability" the ability's own text (CR 707.9a, compile.ts bindThisAbility). For as long as the game goes on (no duration);
  // nothing enters, so no enters abilities trigger (rulings).
  if (raw === LAZAV) {
    const base = parseTrigger("Whenever a creature card is put into an opponent's graveyard from anywhere, you gain 1 life.");
    if (!base || base === "fail" || base.event !== "batch" || base.batch?.what !== "toGraveyard" || base.batch.whose !== "opponent" || !base.batch.each || base.batch.from) return "fail";
    const except = parseCopyExcept("its name is ~, it's legendary in addition to its other types, and it has hexproof and this ability");
    if (!except?.thisAbility || except.name !== "~" || !except.legendary) return "fail";
    const copy: Effect = { type: "becomeCopy", what: { ref: "self" }, of: { ref: "eventGroup", printed: true }, except, duration: "game" };
    return { ...base, body: { targets: [], effects: [{ type: "may", effects: [copy], text: "have ~ become a copy of that card" }], text: raw.replace(/^Whenever a creature card is put into an opponent's graveyard from anywhere, /, "") } };
  }
  return null;
}

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

/** A sentence of round 406's, read before round 405's. */
export function round406Sentence(s: string, sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Quintorius, Loremaster: "Choose target card exiled with ~. You may cast that card this turn without paying its mana
  // cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.": a card its
  // end step trigger exiled (linked, CR 607.2a, compile.ts), this object in exile (CR 400.7); cast this turn with the usual
  // timing (rulings), for free (CR 118.9: X is 0, no other alternative cost, additional costs paid), and that spell goes
  // to the bottom of its owner's library rather than a graveyard (CR 614.1a, GameObject.bottomIfToGraveyard).
  if (plain(s) === "Choose target card exiled with ~" && plain(sentences[si + 1]) === "You may cast that card this turn without paying its mana cost" && plain(sentences[si + 2]) === "If that spell would be put into a graveyard, put it on the bottom of its owner's library instead" && !ctx.spell) {
    const i = ctx.targets.length;
    const what = parseCardTarget("target card exiled with ~", ctx);
    if (what?.ref !== "target" || !ctx.targets[i]?.linkedExile) {
      ctx.targets.length = i;
      return "fail";
    }
    return { effect: { type: "mayCastFromGraveyard", what, inExile: true, free: true, bottomAfter: true }, next: si + 3 };
  }
  return null;
}

const MARALEN = "Once each turn, you may cast a spell with mana value less than or equal to the number of Elves and Faeries you control from among cards exiled with ~ this turn without paying its mana cost.";

/** One whole line of round 406's (compile.ts); false when it isn't one of these. */
export function round406Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Maralen, Fae Ascendant: a static ability (CR 113.6): once each turn for each Maralen as the object it is, its controller
  // may cast a spell (not play a land) from among the cards its enters trigger exiled this turn (linked, CR 607.2a), this
  // object in exile (CR 400.7), with mana value at most the number of Elves and Faeries they control as it's cast: the
  // spell's, its face cast counting (CR 601.3e), X as 0 (rulings), for free (CR 118.9; additional costs paid, rulings).
  if (line === MARALEN) {
    const maxMv = parseCount("the number of Elves and Faeries you control", null);
    if (isSpell || !maxMv || typeof maxMv !== "object") out.unsupported.push(raw);
    else out.linkedFreeOnce = { maxMv };
    return true;
  }
  return false;
}

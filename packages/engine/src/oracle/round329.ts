// Round 329's sentences, triggers and whole texts, read before round 328's (round328Sentence, round328Trigger and
// round328WholeText in oracle/round328.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import { parseOne, type Ctx } from "./body";
import { parseBoundCount } from "./counts";
import { parseSearchFilter } from "./search";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round329Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Stunning Reversal: "The next time you would lose the game this turn, instead draw seven cards and your life total
  // becomes 1.": a one-shot replacement for the turn (CR 614.1a), for any way of losing but conceding (rulings).
  if (ctx.spell && /^The next time you would lose the game this turn, instead draw seven cards and your life total becomes 1\.?$/.test(s)) return { effect: { type: "loseInsteadThisTurn" }, next: si + 1 };
  // Chandra, Chill of Compliance: "Surveil 1. If you put a noncreature, nonland card into your graveyard this way, put that
  // card into your hand." Enlightened Confidant: "... a card with mana value less than or equal to the amount of life you
  // gained this turn ...": the card the surveil just put there (CR 701.25a), by its printed characteristics; the life is
  // counted as this resolves (rulings).
  const yardHand = /^If you put an? (.+?) into your graveyard this way, put that card into your hand\.?$/.exec(s);
  if (yardHand && effects.at(-1)?.type === "surveil") {
    const filter = parseSearchFilter(yardHand[1]!, (x) => parseBoundCount(x, ctx));
    if (!filter || filter.kind !== "card") return "fail";
    return { effect: { type: "surveilledToHand", filter }, next: si + 1 };
  }
  // Inverter of Truth: "exile all cards from your library face down, then shuffle all cards from your graveyard into your
  // library.": every card of the library as it resolves, face down (no one may look at them, rulings; CR 406.3), then the
  // graveyard is shuffled in.
  const allDown = /^(?:[Ee]xile all cards from your library face down)(?:, then (shuffle all cards from your graveyard into your library))?\.?$/.exec(s);
  if (allDown) {
    const exile: Effect = { type: "exileFaceDown", from: "top", n: { count: { kind: "cardsInLibrary", who: { ref: "you" } } } };
    if (!allDown[1]) return { effect: exile, next: si + 1 };
    const then = parseOne("Shuffle all cards from your graveyard into your library", ctx);
    if (!then || then.length !== 1) return "fail";
    effects.push(exile);
    return { effect: then[0]!, next: si + 1 };
  }
  // Misfortune Teller: "Exile target card from a graveyard. If it was a creature card, X. If it was a land card, Y.
  // Otherwise, Z.": by the exiled card's printed characteristics (CR 608.2h); "Otherwise" is neither a creature card nor
  // a land card (a Dryad Arbor card gets both the first and the second, not the third).
  const was = /^If it was an? ([a-z]+) card, (.+)$/.exec(s);
  const was2 = /^If it was an? ([a-z]+) card, (.+)$/.exec(sentences[si + 1] ?? "");
  const otherwise = /^Otherwise, (.+?)\.?$/.exec(sentences[si + 2] ?? "");
  if (was && was2 && otherwise && was[1] !== was2[1]) {
    const i = ctx.targets.length - 1;
    const t = ctx.targets[i];
    const prev = effects.at(-1);
    if (!t || t.kind !== "card" || t.many || t.optional || prev?.type !== "exile" || prev.what.ref !== "target" || prev.what.index !== i) return null;
    const a = parseSearchFilter(`${was[1]!} card`);
    const b = parseSearchFilter(`${was2[1]!} card`);
    const neither = parseSearchFilter(`non${was[1]!}, non${was2[1]!} card`);
    if (!a || !b || !neither) return "fail";
    const parts = [was[2]!, was2[2]!.replace(/\.$/, ""), otherwise[1]!].map((x) => parseOne(x.charAt(0).toUpperCase() + x.slice(1), ctx));
    if (parts.some((x) => !x || !x.length) || ctx.targets.length !== i + 1) return "fail";
    effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter: a }, effects: parts[0]! });
    effects.push({ type: "if", cond: { kind: "targetCardWas", index: i, filter: b }, effects: parts[1]! });
    return { effect: { type: "if", cond: { kind: "targetCardWas", index: i, filter: neither }, effects: parts[2]! }, next: si + 3 };
  }
  return null;
}

export function round329Trigger(raw: string): TriggeredAbility | "fail" | null {
  void raw;
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round329WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void text, parse;
  return null;
}

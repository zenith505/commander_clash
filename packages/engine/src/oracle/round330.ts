// Round 330's sentences, triggers and whole texts, read before round 329's (round329Sentence, round329Trigger and
// round329WholeText in oracle/round329.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round330Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Karn, Living Legacy: "Pay any amount of mana. Look at that many cards from the top of your library, then put one of
  // those cards into your hand and the rest on the bottom of your library in a random order.": how much is chosen as it
  // resolves, then paid (rulings); with none paid, no card is looked at, and one looked at must go to the hand (rulings).
  if (/^Pay any amount of mana\.?$/.test(s)) {
    // The sentence list splits ", then" into its own sentence.
    const joined = [sentences[si + 1], sentences[si + 2]].join(" | ");
    const look = /^Look at that many cards from the top of your library \| (?:[Tt]hen )?put one of those cards into your hand and the rest on the bottom of your library in a random order\.?$/i.exec(joined);
    if (!look || ctx.spell) return null;
    effects.push({ type: "joinForces", who: { ref: "you" } });
    return { effect: { type: "dig", n: { count: { kind: "joinForcesPaid" } }, reveal: false, count: 1, upTo: false, into: "hand", rest: "bottom", random: true }, next: si + 3 };
  }
  return null;
}

export function round330Trigger(raw: string): TriggeredAbility | "fail" | null {
  void raw;
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round330WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void text;
  void parse;
  return null;
}

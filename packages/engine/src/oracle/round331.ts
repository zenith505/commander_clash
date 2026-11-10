// Round 331's sentences, triggers and whole texts, read before round 330's (round330Sentence, round330Trigger and
// round330WholeText in oracle/round330.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseTargetPhrase } from "./targets";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round331Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void effects;
  // Osteomancer Adept: "Until end of turn, you may cast creature spells from your graveyard by foraging in addition to
  // paying their other costs. If you cast a spell this way, that creature enters with a finality counter on it.": any
  // number of them this turn, each paying all its costs and forage (CR 701.61a) and following the timing rules (rulings),
  // each creature entering with the counter (CR 614.1c).
  const forage = /^Until end of turn, you may cast (creature) spells from your graveyard by foraging in addition to paying their other costs\.?$/.exec(s);
  if (forage) {
    const rider = /^If you cast a spell this way, that creature enters with an? (finality|\+1\/\+1) counter on it\.?$/.exec(sentences[si + 1] ?? "");
    const spec = parseTargetPhrase(`${forage[1]!} card from a graveyard`);
    if (!rider || spec?.kind !== "card" || ctx.spell) return "fail";
    const { owner: _, ...rest } = spec;
    return { effect: { type: "graveyardTurn", cast: { ...rest, text: `${forage[1]!} card` }, costs: [{ kind: "forage" }], entersWith: { counter: rider[1]!, n: 1 } }, next: si + 2 };
  }
  return null;
}

export function round331Trigger(raw: string): TriggeredAbility | "fail" | null {
  void raw;
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round331WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  void text;
  void parse;
  return null;
}

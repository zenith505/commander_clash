// Round 333's sentences, triggers and whole texts (after round 334's sentences, oracle/round334.ts), read before
// round 332's (round332Sentence, round332Trigger and round332WholeText in oracle/round332.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseTargetPhrase } from "./targets";
import { round334Sentence } from "./round334";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round333Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 334's sentences first (oracle/round334.ts).
  const r334 = round334Sentence(s, sentences, si, ctx, effects);
  if (r334 !== null) return r334;
  // Zevlor, Elturel Exile: "When you next cast an instant or sorcery spell that targets only a single opponent or a single
  // permanent an opponent controls this turn, for each other opponent, choose that player or a permanent they control, copy
  // that spell, and the copy targets the chosen player or permanent.": a delayed trigger (CR 603.7), used up by the first
  // such spell (a spell with two different targets doesn't count, rulings); then, as it resolves, a copy for each other
  // opponent aimed at the player or permanent chosen for them, made only if that's a legal target (CR 707.10e).
  if (/^When you next cast an instant or sorcery spell that targets only a single opponent or a single permanent an opponent controls this turn, for each other opponent, choose that player or a permanent they control, copy that spell, and the copy targets the chosen player or permanent\.?$/.test(s)) {
    const filter = parseTargetPhrase("instant or sorcery spell");
    if (filter?.kind !== "spell" || ctx.spell) return "fail";
    return { effect: { type: "nextCast", filter, effects: [{ type: "copyPerOtherOpponent" }], text: "for each other opponent, choose that player or a permanent they control, copy that spell, and the copy targets the chosen player or permanent", onlyOpponentOrTheirs: true }, next: si + 1 };
  }
  return null;
}

export function round333Trigger(raw: string): TriggeredAbility | "fail" | null {
  void raw;
  return null;
}

/** A whole ability's text read another way (a string), or null. */
export function round333WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  // Stangg, Echo Warrior: "create Stangg Twin, a legendary 3/4 red and green Human Warrior creature token. It enters
  // tapped and attacking. For each Aura and Equipment attached to ~, create a token that's a copy of it attached to ~ Twin.
  // Sacrifice all tokens created this way at the beginning of the next end step.": the token tapped and attacking (CR
  // 508.4), then the copies attached to it, then one delayed trigger for each of them (CR 603.7), the Aura and Equipment
  // copies too, even if something changed or added to them (rulings).
  const stangg = /^create ((\S+) [A-Z][a-z]+), (a legendary [^.]+ creature token)\. It enters tapped and attacking\. For each Aura and Equipment attached to ~, create a token that's a copy of it attached to ~ ([A-Z][a-z]+)\. Sacrifice all tokens created this way at the beginning of the next end step\.$/.exec(text.trim());
  if (stangg && stangg[1] === `${stangg[2]} ${stangg[4]}`) {
    const made = parse(`Create ${stangg[1]}, ${stangg[3]} that's tapped and attacking.`);
    const one = made?.effects[0];
    if (!made || made.targets.length || made.effects.length !== 1 || one?.type !== "createToken" || !one.tapped || !one.attacking) return null;
    return {
      targets: [],
      effects: [one, { type: "copyAttachedOnto" }, { type: "delayed", when: "nextEndStep", each: "created", effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "sacrifice all tokens created this way" }],
      text: text.replace(`~ ${stangg[4]}`, stangg[1]!),
    };
  }
  return null;
}

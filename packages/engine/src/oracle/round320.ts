// Round 320's sentences and triggers, read before round 319's (round319Sentence in oracle/round319.ts) and round 318's
// triggers (round318Trigger in oracle/round318.ts).
import type { AbilityBody, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseSentence } from "./sentence";
import { parseTrigger } from "./triggers";
import { round321Sentence, round321Trigger } from "./round321";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round320Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Round 321's sentences first (oracle/round321.ts).
  const r321 = round321Sentence(s, sentences, si, ctx, effects);
  if (r321 !== null) return r321;
  const prev = effects.at(-1);
  // Aerith Rescue Mission: "Tap up to three target creatures. Put a stun counter on one of them.": the one chosen as it
  // resolves (rulings, CR 608.2d), among the targets still legal (CR 608.2b), with one left that one.
  if (s === "Put a stun counter on one of them" && prev?.type === "tap" && prev.what.ref === "target" && prev.what.index === 0 && (prev.what.n ?? 1) > 2 && ctx.targets.length === prev.what.n) {
    const options = ctx.targets.map((_, index) => [{ type: "counters", what: { ref: "target", index }, counter: "stun", n: 1 } as Effect]);
    return { effect: { type: "splitTargets", chooser: "you", options, label: "Put a stun counter on {0}" }, next: si + 1 };
  }
  // Read the Runes: "Draw X cards. For each card drawn this way, discard a card unless you sacrifice a permanent.": you
  // draw, then sacrifice as many permanents as you like (never forced, at most one for each card drawn), then discard one
  // card for each card drawn that wasn't paid for that way, the whole hand if it's smaller (rulings).
  if (s === "For each card drawn this way, discard a card unless you sacrifice a permanent" && ctx.spell && prev?.type === "draw" && prev.who.ref === "you" && typeof prev.n === "object" && prev.n.count.kind === "x" && !prev.n.times && !prev.n.plus) {
    const permanent = { kind: "object" as const, types: [], notTypes: [], notColors: [], text: "permanent" };
    effects.push({ type: "pick", who: { ref: "you" }, filter: permanent, n: { count: { kind: "x" } }, action: "sacrifice", upTo: true, prompt: "sacrifice permanents, up to one for each card drawn: you discard a card for each card drawn you don't sacrifice one for" });
    return { effect: { type: "discard", who: { ref: "you" }, n: { count: { kind: "difference", of: [{ kind: "x" }, { kind: "sacrificedThisWayCount" }] } }, random: false }, next: si + 1 };
  }
  // Sivriss, Nightmare Speaker: "For each opponent, you mill a card, then return that card from your graveyard to your hand
  // unless that player pays 3 life.": one opponent after the other in turn order, each card milled and then returned or
  // not before the next (rulings), as Protection Racket's passes. The splitter breaks it at ", then".
  if (s === "For each opponent, you mill a card" && sentences[si + 1] === "Return that card from your graveyard to your hand unless that player pays 3 life" && ctx.activated) {
    const pass: Effect[] = [
      { type: "mill", who: { ref: "you" }, n: 1 },
      { type: "punisher", who: { ref: "eachOne" }, options: [{ pay: { cost: "", life: 3 } }], effects: [{ type: "bounce", what: { ref: "milled" } }], thenText: "returns the milled card to its owner's hand" },
    ];
    return { effect: { type: "repeat", n: 0, forEach: { ref: "eachOpponent" }, effects: pass }, next: si + 2 };
  }
  return null;
}

/** Round 320's whole-text forms, run by wholeTextForms in body.ts: a body, the text rewritten, or null. */
export function round320WholeText(text: string, parse: (t: string) => AbilityBody | null): AbilityBody | string | null {
  // Myriad Construct: "When ~ becomes the target of a spell, sacrifice it and create a number of 1/1 colorless Construct
  // artifact creature tokens equal to its power.": the tokens even if it's already gone, by its power as it last existed
  // on the battlefield (rulings, CR 608.2h).
  const myriad = /^sacrifice it and (create a number of 1\/1 colorless Construct artifact creature tokens equal to its power)\.$/.exec(text.trim());
  if (myriad) return `Sacrifice it. C${myriad[1]!.slice(1)}.`;
  // Insatiable Frugivore: "create a Food token, then you may exile three cards from your graveyard. If you do, repeat this
  // process.": the Food, then the offer, again and again until you decline or can't exile three (rulings), all as it
  // resolves (nothing triggered goes on the stack meanwhile, rulings).
  if (text.trim() === "create a Food token, then you may exile three cards from your graveyard. If you do, repeat this process.") {
    // Read with an "If you do" so the exile stays a "you may" (whether it was done, CR 608.2c), then that part left off.
    const body = parse("Create a Food token. You may exile three cards from your graveyard. If you do, draw a card.");
    const [food, may, then] = body?.effects ?? [];
    if (body?.effects.length !== 3 || then?.type !== "if" || then.cond.kind !== "youDid" || body.targets.length || food?.type !== "createToken" || may?.type !== "may" || may.effects.length !== 1 || may.effects[0]!.type !== "chooseFromGraveyard") return null;
    return { targets: [], effects: [{ type: "repeatIfDid", effects: [food, may], text: "create a Food token, then you may exile three cards from your graveyard" }], text };
  }
  return null;
}

export function round320Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Round 321's triggers first (oracle/round321.ts).
  const r321 = round321Trigger(raw);
  if (r321 !== null) return r321;
  // Power Surge: "At the beginning of each player's upkeep, ~ deals X damage to that player, where X is the number of
  // untapped lands they controlled at the beginning of this turn.": counted as the turn began, before its untap step (CR
  // 502.3), whether or not ~ was there then (rulings); TurnLog.untappedLands.
  const surge = /^(At the beginning of each player's upkeep, ~ deals X damage to that player, where X is the number of untapped lands they) controlled at the beginning of this turn\.$/.exec(raw);
  if (surge) {
    const t = parseTrigger(`${surge[1]!} control.`);
    const e = t && t !== "fail" ? t.body.effects : undefined;
    if (!t || t === "fail" || t.event !== "eachUpkeep" || e?.length !== 1 || e[0]!.type !== "damage" || typeof e[0]!.amount !== "object" || e[0]!.amount.count.kind !== "permanents") return "fail";
    return { ...t, body: { ...t.body, effects: [{ ...e[0]!, amount: { count: { kind: "untappedLandsAtTurnStart" } } }], text: raw.replace(/^At the beginning of each player's upkeep, /, "") } };
  }
  // Jinxed Choker: "At the beginning of your end step, target opponent gains control of ~ and puts a charge counter on it.":
  // that player puts the counter on it, once it's theirs.
  const choker = /^At the beginning of your end step, target opponent gains control of ~ and puts a charge counter on it\.$/.exec(raw);
  if (choker) {
    const t = parseTrigger("At the beginning of your end step, target opponent gains control of ~. Put a charge counter on ~.");
    const e = t && t !== "fail" ? t.body.effects : undefined;
    if (!t || t === "fail" || t.event !== "yourEndStep" || e?.length !== 2 || e[0]!.type !== "continuous" || e[1]!.type !== "counters") return "fail";
    return { ...t, body: { ...t.body, effects: [e[0]!, { ...e[1]!, by: { ref: "target", index: 0 } }], text: raw.replace(/^At the beginning of your end step, /, "") } };
  }
  return null;
}

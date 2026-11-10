// Round 337's sentences, read before round 335's (round335Sentence in oracle/round335.ts).
import type { Effect } from "../abilities";
import type { Ctx } from "./body";
import { parseChanges } from "./sentence";
import { parseObject } from "./targets";
import { num } from "./words";

type Found = { effect: Effect; next: number } | "fail" | null;

const plain = (x: string | undefined) => (x ?? "").replace(/\.$/, "");

export function round337Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  const line = plain(s);
  // Azor's Gateway: "Draw a card, then exile a card from your hand. If cards with five or more different mana values are
  // exiled with ~, you gain 5 life, untap ~, and transform it.": the cards its one exile instruction exiled (linked in
  // compile.ts, CR 607.2a), checked as it resolves, after this card is exiled; then the three instructions in order, "it"
  // being ~ (CR 701.27 transform).
  const azor = /^If cards with (\w+) or more different mana values are exiled with ~, you gain (\d+) life, untap ~, and transform (?:it|~)$/.exec(line);
  if (azor) {
    const n = num(azor[1]!);
    const prev = effects.at(-1);
    if (!Number.isInteger(n) || prev?.type !== "discard" || !prev.exile || ctx.spell) return "fail";
    return {
      effect: {
        type: "if",
        cond: { kind: "state", cond: { kind: "amount", amount: { count: { kind: "linkedExiled", manaValues: true } }, min: n } },
        effects: [{ type: "gainLife", who: { ref: "you" }, n: Number(azor[2]) }, { type: "untap", what: { ref: "self" } }, { type: "transform", what: { ref: "self" } }],
      },
      next: si + 1,
    };
  }
  // Hunted by The Family: "Choose up to four target creatures you don't control. For each of them, that creature's
  // controller faces a villainous choice — That creature becomes a 1/1 white Human creature and loses all abilities, or you
  // create a token that's a copy of it." One choice for each legal target, faced by its controller as it resolves, one
  // at a time in APNAP order, all of the chosen option done before the next choice (CR 701.55a, 701.55d; rulings). The
  // first option has no duration: for as long as it stays on the battlefield (CR 611.2a), a white Human creature in place
  // of its colors, card types and creature types, its supertypes kept (CR 205.1a), base 1/1 (CR 613.4b), with no
  // abilities (CR 613.1f); the second is a copy of it as it is then (CR 707.2).
  const hunted = /^Choose up to (\w+) target creatures you don't control$/.exec(line);
  if (hunted && plain(sentences[si + 1]) === "For each of them, that creature's controller faces a villainous choice — That creature becomes a 1/1 white Human creature and loses all abilities, or you create a token that's a copy of it") {
    if (!ctx.spell || ctx.targets.length || effects.length) return "fail";
    const what = parseObject(`up to ${hunted[1]} target creatures you don't control`, ctx);
    const mods = parseChanges("loses all abilities and becomes a white Human creature with base power and toughness 1/1");
    if (what?.ref !== "target" || !mods) return "fail";
    return {
      effect: {
        type: "villainous",
        who: { ref: "you" },
        eachOf: what,
        options: [[{ type: "continuous", what: { ref: "subject" }, mods, duration: "game" }], [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "subject" } }]],
        labels: ["That creature becomes a 1/1 white Human creature and loses all abilities", "You create a token that's a copy of it"],
      },
      next: si + 2,
    };
  }
  return null;
}

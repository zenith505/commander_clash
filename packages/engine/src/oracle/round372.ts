// Round 372's whole lines (compile.ts, after round 371's): a target count set by another target as the spell is cast
// (Reap) and a land put in from among the cards cascade exiled (Averna, the Chaos Bloom).
import type { AbilityBody, CompiledCard, TargetSpec } from "../abilities";
import { parseBody } from "./body";
import { colorTemplate, withColors } from "./color-template";

const fail = (out: CompiledCard, raw: string) => {
  out.unsupported.push(raw);
  return true;
};

const REAP = "Return up to X target cards from your graveyard to your hand, where X is the number of black permanents target opponent controls as you cast ~.";

const AVERNA = "As you cascade, you may put a land card from among the exiled cards onto the battlefield tapped.";

export function round372Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Averna, the Chaos Bloom: whenever its controller's cascade resolves, after the last card is exiled and before the
  // nonland card is cast or not (CR 702.85a, the reminder text); not playing a land, so not limited to one a turn or to
  // their own turn (rulings). Discover and Jodah's "exile until a legendary nonland card" aren't cascade.
  if (line === AVERNA) {
    if (isSpell || out.cascadeLand) return fail(out, raw);
    out.cascadeLand = true;
    return true;
  }
  // Reap: the opponent is a target too (the errata, rulings), so it's chosen with the cards (CR 601.2c); X is how many
  // black permanents that player controls, counted then (rulings: during announcement, as it only affects how many
  // targets there are, and not again later). The opponent comes first among its targets, so its place is the same
  // whatever is chosen for "up to X" (see manyX). As it resolves, the cards still legal return (CR 608.2b), whatever
  // became of the opponent.
  const reap = colorTemplate(REAP, line);
  if (reap) {
    const word = withColors("black", reap);
    if (!isSpell || out.spell) return fail(out, raw);
    const b = parseBody(`Return up to X target cards from your graveyard to your hand, where X is the number of ${word} permanents you control.`, { spell: true });
    const cards = b?.targets.length === 1 ? b.targets[0] : undefined;
    const count = cards?.manyCount?.count;
    const bounce = b?.effects.length === 1 ? b.effects[0] : undefined;
    if (!b || !cards || cards.many !== "x" || count?.kind !== "permanents" || count.filter.controller !== "you" || bounce?.type !== "bounce" || bounce.what.ref !== "target" || bounce.what.index !== 0) return fail(out, raw);
    const { controller: _you, ...black } = count.filter;
    const opponent: TargetSpec = { kind: "player", opponent: true, text: "target opponent" };
    const many: TargetSpec = { ...cards, manyCount: { ...cards.manyCount!, count: { ...count, filter: { ...black, text: `${word} permanents target opponent controls` }, whose: { ref: "target", index: 0 } } } };
    const body: AbilityBody = { targets: [opponent, many], effects: [{ ...bounce, what: { ...bounce.what, index: 1 } }], text: line };
    out.spell = body;
    return true;
  }
  return false;
}

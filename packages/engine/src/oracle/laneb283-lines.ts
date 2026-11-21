// Lane B round B283's lines, read by compileCard before the generic triggers and statics (after round B282's): Uvilda, Dean
// of Perfection's refine ability and Synthesis Pod's; and The Dragon-Kami Reborn's first two chapters (roundB283Chapter,
// read with the other Saga chapters). Dragon-Kami's Egg's trigger is read by the generic parsers (triggers.ts "~ or a
// Dragon you control dies", sentences/zones.ts "a creature spell from among cards you own in exile with ... counters").
import type { AbilityBody, CompiledCard } from "../abilities";
import { parseActivated } from "./activated";
import { parseCount } from "./counts";

const UVILDA =
  '{T}: You may exile an instant or sorcery card from your hand and put three refine counters on it. It gains "At the beginning of your upkeep, if ~ is exiled, remove a refine counter from it" and "When the last refine counter is removed from ~, if it\'s exiled, you may cast it. It costs {4} less to cast this way."';
const POD_EFFECT =
  "Target opponent reveals cards from the top of their library until they reveal a card with mana value equal to 1 plus the exiled spell's mana value. Exile that card, then that player shuffles. You may cast that exiled card without paying its mana cost.";
const DRAGON_KAMI =
  "You gain 2 life. Look at the top three cards of your library. Exile one of them face down with a hatching counter on it, then put the rest on the bottom of your library in any order.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB283Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Uvilda, Dean of Perfection: an instant or sorcery card of your choice from your hand, or none (CR 609.3: "you may"),
  // exiled with three refine counters (CR 122.1). It gains two triggered abilities that work in exile (CR 113.6) while it's
  // that object there (CR 400.7; GameObject.refined, effects/run-laneb283.ts): its owner's upkeep removes a counter, and
  // removing the last lets them cast it then, for {4} less (generic mana only, rulings). It isn't suspend, nor suspended.
  if (line.replaceAll("this card", "~") === UVILDA) {
    const a = isSpell ? null : parseActivated("{T}: You may exile an instant or sorcery card from your hand.");
    const may = a && a !== "fail" ? a.body.effects[0] : undefined;
    const take = may?.type === "may" ? may.effects[0] : undefined;
    if (!a || a === "fail" || !a.tap || a.manaCost || a.costs?.length || a.body.targets.length || a.body.effects.length !== 1 || take?.type !== "takeFromHand" || take.action !== "exile" || !take.filter) return fail();
    out.activated.push({
      ...a,
      text: line,
      body: { targets: [], effects: [{ ...take, optional: true, refine: 3 }], text: line.slice("{T}: ".length) },
    });
    return true;
  }
  // Synthesis Pod: its cost is the generic one (an "Exile a spell you control" cost keeps that spell's mana value as it
  // last existed on the stack, X included, CR 202.3e, 608.2h); the reveal, exile, shuffle and free cast are one effect
  // (podReveal), for the target opponent (CR 115.1).
  if (line.endsWith(`: ${POD_EFFECT}`)) {
    const a = isSpell ? null : parseActivated(`${line.slice(0, -POD_EFFECT.length)}Target opponent draws a card.`);
    const mv = parseCount("1 plus the exiled spell's mana value", { targets: [] } as unknown as Parameters<typeof parseCount>[1]);
    if (!a || a === "fail" || !mv || !a.costs?.some((c) => c.kind === "exileSpell") || a.body.targets.length !== 1 || a.body.targets[0]!.kind !== "player" || !a.body.targets[0]!.opponent) return fail();
    out.activated.push({ ...a, text: line, body: { targets: a.body.targets, effects: [{ type: "podReveal", mv }], text: POD_EFFECT } });
    return true;
  }
  return false;
}

/**
 * The Dragon-Kami Reborn's "I, II — ..." (each chapter a triggered ability, CR 714.2b): you gain 2 life, then look at your
 * top three cards and exile one of them face down with a hatching counter (CR 406.3, 122.1), the others on the bottom in
 * the order you choose (CR 401.4). You may look at it as long as it stays exiled, even after the Saga leaves (rulings).
 * Undefined for any other chapter text.
 */
export function roundB283Chapter(text: string): AbilityBody | undefined {
  if (text !== DRAGON_KAMI) return undefined;
  return {
    targets: [],
    effects: [
      { type: "gainLife", who: { ref: "you" }, n: 2 },
      { type: "exileFaceDown", from: "top", n: 3, pickOne: true, bottomAnyOrder: true, look: true, counter: "hatching" },
    ],
    text,
  };
}

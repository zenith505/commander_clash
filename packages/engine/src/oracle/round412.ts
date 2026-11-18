// Round 412's whole lines (compile.ts): Xanathar, Guild Kingpin (playing the top card of another player's library this
// turn) and Sen Triplets (playing the cards in another player's hand this turn).
import type { CompiledCard } from "../abilities";
import { parseTrigger } from "./triggers";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const XANATHAR =
  "At the beginning of your upkeep, choose target opponent. Until end of turn, that player can't cast spells, you may look at the top card of their library any time, you may play the top card of their library, and you may spend mana as though it were mana of any color to cast spells this way.";

const SEN =
  "At the beginning of your upkeep, choose target opponent. This turn, that player can't cast spells or activate abilities and plays with their hand revealed. You may play lands and cast spells from that player's hand this turn.";

/** One whole line of round 412's (compile.ts); false when it isn't one of these. */
export function round412Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // Xanathar, Guild Kingpin: the target opponent can't cast spells this turn (CR 101.2), and until the turn ends (CR
  // 514.2) you may look at the top card of their library any time and play it: a land with your land play, a spell at its
  // usual timing (rulings, CR 305.2, 601.3), its costs paid as usual, alternative and additional ones too (rulings), with
  // your mana spent as though it were mana of any color (CR 609.4b). If the opponent is an illegal target as it resolves,
  // none of it happens (CR 608.2b, rulings). Effect topTurn `of` (GameState.topTurn, game.ts topPermission).
  if (line === XANATHAR) {
    const t = isSpell ? null : parseTrigger("At the beginning of your upkeep, choose target opponent. That player can't cast spells this turn.");
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.body.targets.length !== 1 || t.body.targets[0]!.kind !== "player" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "cantCast") return fail(out, raw);
    const that = { ref: "target" as const, index: 0 };
    out.triggers.push({ ...t, body: { ...t.body, effects: [...t.body.effects, { type: "topTurn", top: { lands: true, spells: "any" }, of: that, anyColor: true }], text: line.slice("At the beginning of your upkeep, ".length) } });
    return true;
  }
  // Sen Triplets: this turn the target opponent can't cast spells (CR 101.2) or activate abilities, mana abilities
  // included, in any zone (rulings; static and triggered abilities and replacement effects work as usual), and plays with
  // their hand revealed (CR 402.3); you may play lands and cast spells from their hand (a land with your land play, a
  // spell at its usual timing, with your mana and its usual costs, rulings; CR 305.2, 601.3), but not activate abilities
  // of cards there (rulings). A spell cast this way wasn't cast from "your hand" (GameObject.castFrom "anotherHand").
  if (line === SEN) {
    const t = isSpell ? null : parseTrigger("At the beginning of your upkeep, choose target opponent. That player can't cast spells this turn.");
    if (!t || t === "fail" || t.event !== "yourUpkeep" || t.body.targets.length !== 1 || t.body.targets[0]!.kind !== "player" || t.body.effects.length !== 1 || t.body.effects[0]!.type !== "cantCast") return fail(out, raw);
    const that = { ref: "target" as const, index: 0 };
    out.triggers.push({
      ...t,
      body: {
        ...t.body,
        effects: [...t.body.effects, { type: "turnRules", rules: ["noAbilities"], who: that }, { type: "revealHandTurn", who: that }, { type: "handTurn", of: that }],
        text: line.slice("At the beginning of your upkeep, ".length),
      },
    });
    return true;
  }
  return false;
}

// Lane B round B271's lines, read by compileCard before the generic triggers (after round B270's): Ian Malcolm,
// Chaotician's cast permission and Haldan, Avid Arcanist's play permission. (Araumi of the Dead Tide's cost is in
// activated.ts.)
import type { CompiledCard } from "../abilities";

const IAN = "During each player's turn, that player may cast a spell from among the cards they don't own exiled with ~, and mana of any type can be spent to cast it.";

const HALDAN = "You may play lands and cast noncreature spells from among cards you exiled that have fetch counters on them, and you may spend mana as though it were mana of any color to cast those spells.";

/** One line of a card's text, compiled into `out`; false when it isn't one of these. */
export function roundB271Line(line: string, out: CompiledCard, isSpell: boolean): boolean {
  const fail = () => (out.unsupported.push(line), true);
  // Ian Malcolm: a static ability of the permanent (CR 604.1) granting every player, on their own turn, one spell from
  // among the cards they don't own that its first ability exiled (CR 607.2a; the link is made in compile.ts), with the
  // usual timing (rulings), mana of any type (CR 609.4b), not a land played (only "cast a spell"). One spell each turn for
  // that Ian, as "during each of your turns, you may cast a spell" (Coram, the Undertaker's and Muldrotha's rulings).
  if (line === IAN) {
    if (isSpell || out.castLinkedOthersTurn) return fail();
    out.castLinkedOthersTurn = true;
    return true;
  }
  // Haldan: cards with fetch counters that its controller exiled (Pako, Arcane Retriever's), whenever Haldan is on the
  // battlefield, whatever Haldan they were exiled before (rulings), lands as land plays and noncreature spells with the
  // usual timing (rulings), mana as though of any color (CR 609.4b).
  if (line === HALDAN) {
    if (isSpell || out.playExiledCountered) return fail();
    out.playExiledCountered = "fetch";
    return true;
  }
  return false;
}

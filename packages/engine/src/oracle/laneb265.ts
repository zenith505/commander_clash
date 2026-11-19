// Lane B round B265's whole spells, read after round B264's (roundB264Spell in oracle/laneb264.ts): Reversal of Fortune.
// Phyrexian Portal's and Raging River's lines are roundB265Line in oracle/laneb265-lines.ts.
import type { AbilityBody } from "../abilities";
import { parseBody } from "./body";

const REVERSAL = "Target opponent reveals their hand. You may copy an instant or sorcery card in it. If you do, you may cast the copy without paying its mana cost.";

export function roundB265Spell(text: string): AbilityBody | null | undefined {
  // Reversal of Fortune: the hand revealed, then a copy of one of its instant or sorcery cards made in that hand and cast
  // from there as this resolves, or never (CR 707.12, 608.2g; rulings: making the copy and casting it are both optional,
  // so one choice; one not cast ceases to exist, CR 704.5e). Cast by you, owned by you (CR 112.2a), without paying its
  // mana cost (X is 0, no alternative costs, CR 118.9); whether you can cast it is all that matters, not whether the
  // opponent could (rulings). From that hand, so never "from your hand" (GameObject.copyCastFrom "anotherHand").
  if (text === REVERSAL) {
    const b = parseBody("Target opponent reveals their hand. You may cast an instant or sorcery spell from among those cards without paying its mana cost.", { spell: true });
    const [look, cast] = b?.effects ?? [];
    if (!b || b.targets.length !== 1 || b.effects.length !== 2 || look?.type !== "lookAtHand" || cast?.type !== "castFromAmong" || !cast.fromHand || cast.max !== 1 || !cast.filter) return null;
    return { ...b, effects: [look, { ...cast, copies: true }], text };
  }
  return undefined;
}

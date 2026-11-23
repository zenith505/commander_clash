// Lane B round B305: Shaman's Trance.
import type { AbilityBody } from "../abilities";

const TRANCE = "Other players can't play lands or cast spells from their graveyards this turn. You may play lands and cast spells from other players' graveyards this turn as though those cards were in your graveyard.";

/**
 * Shaman's Trance: both sentences, one effect for the rest of the turn (Effect "shamansTrance"). "Other players" are every
 * player but its controller, "their graveyards" each one's own (so another player may still cast from yours with a
 * permission for any graveyard, The Great Work). "As though those cards were in your graveyard": what lets you play a land
 * or cast a spell from your graveyard lets you play or cast one from theirs (rulings: flashback too, not those cards'
 * activated abilities, as unearth isn't casting).
 */
export function shamansTranceBody(text: string): AbilityBody | null {
  return text.trim() === TRANCE ? { targets: [], effects: [{ type: "shamansTrance" }], text: TRANCE } : null;
}

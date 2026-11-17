// Lane B round B237's lines, read by compileCard before its triggers and activated abilities (after round B236's).
import type { CompiledCard } from "../abilities";

const REED = "The first time you would draw a card each turn except the first card you draw during each of your draw steps, you draw four cards instead.";
const CHAINS = "If a player would draw a card except the first one they draw in each of their draw steps, that player discards a card instead. If the player discards a card this way, they draw a card. If the player doesn't discard a card this way, they mill a card.";
const WEIRDING = "If a player would draw a card, they reveal it instead. Then any other player may pay 2 life. If a player does, put that card into its owner's graveyard. Otherwise, that player draws a card.";

/**
 * One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these.
 * Each is a replacement of draws (CR 614.1a) applied in game.ts draw, ordered among the others by the drawing player (CR
 * 616.1, drawReplacementChoices "reed", "chains", "weirding"), once in each chain of draws it made (CR 614.5).
 */
export function roundB237Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  const flag = line === REED ? "drawFourFirstOther" : line === CHAINS ? "drawChains" : line === WEIRDING ? "drawWeirding" : undefined;
  if (!flag) return false;
  if (out[flag]) out.unsupported.push(raw);
  else out[flag] = true;
  return true;
}

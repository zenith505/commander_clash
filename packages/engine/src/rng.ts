// Seeded PRNG (mulberry32). The state lives in GameState so replays are deterministic.

import type { GameState, Player, PlayerId } from "./types";
import { fireEvent } from "./effects/triggers";

export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(state: { rngState: number }, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * Shuffle a player's library (CR 701.24a), counted in `Player.shuffles`: cards put there before it no longer are where
 * they were put, so their owner doesn't arrange them any more (CR 730.3a).
 */
export function shuffleLibrary(state: GameState, p: Player, by?: PlayerId): void {
  shuffle(state, p.library);
  p.shuffles = (p.shuffles ?? 0) + 1;
  // Temporal Aperture: "for as long as that card remains on top of your library" ends as the library is shuffled (rulings).
  if (state.topFreePlays?.some((g) => g.player === p.id)) {
    state.topFreePlays = state.topFreePlays.filter((g) => g.player !== p.id);
    if (!state.topFreePlays.length) state.topFreePlays = undefined;
  }
  // "Whenever an opponent shuffles their library" (Cosi's Trickster): its owner shuffled it. `by`: the controller of the
  // spell or ability that caused it (Psychogenic Probe, Widespread Panic), the resolving one's unless given (a static
  // replacement's, Darksteel Colossus); none for the game's own shuffles (the opening one, a mulligan, CR 103.3, 103.5).
  const cause = by ?? state.resolving?.item.controller;
  fireEvent(state, { type: "shuffledLibrary", player: p.id, ...(cause !== undefined ? { by: cause } : {}) });
}

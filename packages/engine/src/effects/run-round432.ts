// Round 432's effects: Lara Croft, Tomb Raider's permission to play a card from exile with a discovery counter this turn.
import { log, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Lara Croft: "You may play a card from exile with a discovery counter on it this turn.": the ability's controller may play
 * one card this turn (the permission is the effect's, so it lasts if Lara leaves, CR 611.2a), any face-up card in exile with
 * that counter on it as they play it, whoever owns it and whatever exiled it, a land as the turn's land play, a spell with
 * its usual timing and costs (CR 305.1, 601.3). Each resolution is a permission for one more card (TurnLog
 * playCounteredGrants; game.ts counteredGrantFor, useCounteredGrant).
 */
export function runPlayCounteredThisTurnEffect(s: GameState, ctx: ResolveCtx, counter: string): void {
  ((s.turnLog ??= {}).playCounteredGrants ??= []).push({ player: ctx.controller, counter });
  log(s, `${player(s, ctx.controller).name} may play a card from exile with a ${counter} counter on it this turn.`);
}

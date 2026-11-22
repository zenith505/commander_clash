// Channel (Yavimaya Bloomsage's prepare spell, round B294): "Until end of turn, any time you could activate a mana ability, you
// may pay 1 life. If you do, add {C}." The resolved spell leaves its controller a permission for the turn (TurnRule "channel",
// ended in the cleanup step, CR 514.2): whenever they could activate a mana ability (CR 605.3a: while they have priority, or
// while a payment is asked of them, paysManaNow), they may pay 1 life and add {C}. Like a mana ability it doesn't use the stack
// and can't be responded to; what the payment triggers ("whenever you lose life") waits, as a mana ability's triggers do, for
// the next time a player would receive priority (CR 117.5). It isn't an activated ability or a spell, so "can't pay life to
// cast spells or activate abilities" doesn't stop it; life can be paid only up to the life total (CR 119.4, rulings: none at
// 0 life) and not while the player's life total can't change or they can't lose life (CR 119.8). The mana's source is the
// spell, a sorcery: no permanent's origin goes with it (CR 106.3).
import { log, paysManaNow, payableLife, payLife, player, waitingOn } from "./game";
import { addMana } from "./spend";
import { RulesError, type GameState, type PlayerId } from "./types";

/** Whether `pid` is under Channel's permission this turn. */
export const channelling = (s: GameState, pid: PlayerId): boolean => (s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === pid && r.rule === "channel");

/** Why `pid` can't pay 1 life for {C} with Channel now, or null if they can. */
export function channelProblem(s: GameState, pid: PlayerId): string | null {
  if (s.over || player(s, pid).lost) return "the game is over for you";
  if (!channelling(s, pid)) return "no Channel lets you pay life for mana this turn";
  if (waitingOn(s) !== pid || (s.pending && (!paysManaNow(s) || s.pending.player !== pid))) return "only when you could activate a mana ability";
  if (payableLife(s, pid) < 1) return "you can't pay 1 life";
  return null;
}

/** Pay 1 life and add {C} (Action "channelMana"). */
export function channelMana(s: GameState, pid: PlayerId): void {
  const problem = channelProblem(s, pid);
  if (problem) throw new RulesError(problem);
  const exiled = payLife(s, pid, 1);
  addMana(s, pid, ["C"]);
  log(s, `${player(s, pid).name} ${exiled ? "pays for" : "pays 1 life for"} {C} (Channel).`);
}

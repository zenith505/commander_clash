// Round 453: Psychic Battle's "each player reveals the top card of their library. The player who reveals the card with the
// greatest mana value may change the target or targets. If two or more cards are tied for greatest, the target or targets
// remain unchanged." (oracle/round453.ts).
import { defOf } from "../cards";
import { defMv } from "../faces";
import { livingPlayers, log, obj, player } from "../game";
import type { GameState, PlayerId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { newTargets } from "./run-spells";

/**
 * Every player still in the game reveals their top card (one with an empty library reveals none, rulings); a land's mana
 * value is 0 and a split card's its halves' together (CR 202.3, rulings). One greatest: that player may change any of the
 * targets of the spell or ability that triggered it, if it's still on the stack (its cause): all, some or none of them,
 * each to another legal target, never changing how many there are or making anything targeted more than once (rulings,
 * CR 115.7; PendingDecision "newTargets" `changeAny`, `noRepeat`). A tie for greatest, or no card revealed: unchanged.
 * The scratch keeps the winner while their choice is asked.
 */
export function runPsychicBattleEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (sc.psychicWinner === undefined) {
    const mv = new Map<PlayerId, number>();
    for (const pid of apnap(s, livingPlayers(s))) {
      const top = player(s, pid).library[0];
      if (top === undefined) {
        log(s, `${player(s, pid).name} has no card to reveal (${src}).`);
        continue;
      }
      const d = defOf(s, obj(s, top));
      mv.set(pid, defMv(d));
      log(s, `${player(s, pid).name} reveals ${d.name} (mana value ${mv.get(pid)}) from the top of their library.`);
    }
    if (!mv.size) return;
    const most = Math.max(...mv.values());
    const best = [...mv.keys()].filter((pid) => mv.get(pid) === most);
    if (best.length > 1) {
      log(s, `${best.map((pid) => player(s, pid).name).join(" and ")} are tied for the greatest mana value, so the targets stay the same (${src}).`);
      return;
    }
    sc.psychicWinner = best[0]!;
  }
  const winner = sc.psychicWinner;
  const item = ctx.cause !== undefined ? s.stack.find((x) => x.id === ctx.cause) : undefined;
  if (!item) {
    log(s, `${player(s, winner).name} revealed the greatest mana value, but that spell or ability has left the stack (${src}).`);
    return;
  }
  return newTargets(s, ctx, item.id, src, undefined, true, winner, true);
}

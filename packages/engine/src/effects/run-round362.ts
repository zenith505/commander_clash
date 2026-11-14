// Round 362's effects.
import { canGainLife, canLoseLife, gainLife, livingPlayers, log, loseLife, player, simultaneousLifeLoss } from "../game";
import type { GameState, PlayerId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";

/**
 * The ways "redistribute any number of players' life totals" (Reverse the Sands) can go: each a list, in APNAP order of the
 * players still in the game, of whose life total each of them gets (an index into that order). Each life total goes to one
 * player, none split (rulings); leaving some or all where they are is choosing fewer players. A player who can't gain life
 * can't be given a higher total, nor one who can't lose life a lower one (CR 119.7, 119.8). The first is "as they are", and
 * ways that end with the same totals are offered once.
 */
export function redistributions(s: GameState): { order: PlayerId[]; ways: number[][] } {
  const order = apnap(s, livingPlayers(s));
  const lives = order.map((pid) => player(s, pid).life);
  const ways: number[][] = [];
  const seen = new Set<string>();
  const permute = (left: number[], acc: number[]) => {
    if (!left.length) {
      const key = acc.map((i) => lives[i]).join(",");
      const ok = acc.every((from, to) => lives[from]! === lives[to]! || (lives[from]! > lives[to]! ? canGainLife(s, order[to]!) : canLoseLife(s, order[to]!)));
      if (ok && !seen.has(key)) {
        seen.add(key);
        ways.push(acc);
      }
      return;
    }
    for (const i of left) permute(left.filter((x) => x !== i), [...acc, i]);
  };
  // The identity first: the totals as they are.
  permute(order.map((_, i) => i), []);
  return { order, ways };
}

/** How a redistribution reads: the players whose life totals change, each with the one they get. */
export function describeRedistribution(s: GameState, order: PlayerId[], way: number[]): string {
  const lives = order.map((pid) => player(s, pid).life);
  const changes = way.flatMap((from, to) => (lives[from] === lives[to] ? [] : [`${player(s, order[to]!).name} ${lives[to]} → ${lives[from]}`]));
  return changes.length ? changes.join(", ") : "Leave the life totals as they are";
}

/**
 * Reverse the Sands: "Redistribute any number of players' life totals.": its controller chooses which player gets which
 * life total as it resolves (rulings), among the players still in the game; each gains or loses the life it takes to end
 * up with the new total (CR 119.5), all at the same time.
 */
export function runRedistributeLifeEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const { order, ways } = redistributions(s);
  const sc = (r.scratch ??= {});
  if (sc.redistribute === undefined) {
    if (ways.length <= 1) {
      log(s, `${src}: the life totals stay as they are.`);
      return;
    }
    s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "redistribute", options: ways.map((w) => w.join(",")), labels: ways.map((w) => describeRedistribution(s, order, w)), prompt: "redistribute life totals: choose who gets which" };
    return "paused";
  }
  const way = sc.redistribute.split(",").map(Number);
  const lives = order.map((pid) => player(s, pid).life);
  if (way.length !== order.length) return;
  simultaneousLifeLoss(s, () => {
    way.forEach((from, to) => {
      const pid = order[to]!;
      const diff = lives[from]! - lives[to]!;
      if (diff > 0 && canGainLife(s, pid)) gainLife(s, pid, diff);
      else if (diff < 0 && canLoseLife(s, pid)) loseLife(s, pid, -diff);
      else return;
      log(s, `${player(s, pid).name}'s life total becomes ${player(s, pid).life} (${src}).`);
    });
  });
}

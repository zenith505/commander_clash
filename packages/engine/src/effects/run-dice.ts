// Rolling dice (CR 706).

import type { Effect } from "../abilities";
import { abilitiesOf } from "../cards";
import { controllerOf } from "../layers";
import { livingPlayers, log, obj, player } from "../game";
import { nextRandom } from "../rng";
import type { GameState, PlayerId } from "../types";
import { ResolveCtx, amountNow } from "./resolve";
import { fireEvent } from "./triggers";

/** Where `pid` comes in turn order, counted from the active player. */
const turnRank = (s: GameState, pid: PlayerId) => (s.turnOrder.indexOf(pid) - s.turnOrder.indexOf(s.activePlayer) + s.turnOrder.length) % s.turnOrder.length;

/** How many "roll that many dice plus one and ignore the lowest roll" effects apply to `pid`'s rolls (Pixie Guide). */
function advantages(s: GameState, pid: PlayerId): number {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).rollAdvantage).length;
}

export function runDiceEffect(s: GameState, e: Extract<Effect, { type: "roll" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const who = ctx.controller;
  const sc = (s.resolving!.scratch ??= {});
  // "Roll two d8 and choose one result": the answer, after the dice were rolled below.
  if (e.chooseOne && sc.rollChoice !== undefined) {
    const r = s.resolving!.rolled!;
    const i = Number(sc.rollChoice);
    sc.rollChoice = undefined;
    s.resolving!.rolled = { ...r, result: r.naturals[i]!, other: r.naturals[1 - i]! };
    log(s, `${player(s, who).name} chooses ${r.naturals[i]} (the other result is ${r.naturals[1 - i]}).`);
    return;
  }
  // "Each player rolls a d20" (Chaos Dragon): one die each, in turn order from the active player (CR 101.4), each with
  // their own advantage effects; every roll is an event of its own.
  if (e.eachPlayer) {
    const each: Partial<Record<PlayerId, number>> = {};
    for (const pid of livingPlayers(s).slice().sort((a, b) => turnRank(s, a) - turnRank(s, b))) {
      const all = Array.from({ length: 1 + advantages(s, pid) }, () => 1 + Math.floor(nextRandom(s) * e.sides));
      const result = Math.max(...all);
      each[pid] = result;
      log(s, `${player(s, pid).name} rolls a d${e.sides} for ${src}: ${result}${all.length > 1 ? ` (${all.join(", ")}, ${all.length - 1} ignored)` : ""}.`);
      fireEvent(s, { type: "diceRolled", player: pid, sides: e.sides, dice: [{ natural: result, result }], result });
    }
    s.resolving!.rolledEach = each;
    return;
  }
  const n = e.n === undefined ? 1 : amountNow(s, e.n, ctx);
  if (n <= 0) return; // "Roll X six-sided dice" with X = 0: nothing is rolled
  // Each advantage effect replaces the roll with one more die and ignores the lowest (CR 614.1a, 706.6): all of them, as
  // many more dice and as many lowest ones ignored. An ignored roll never happened: it doesn't count and triggers nothing.
  const extra = advantages(s, who);
  const all = Array.from({ length: n + extra }, () => 1 + Math.floor(nextRandom(s) * e.sides));
  // The dice that count, in the order rolled: all but the lowest ones; "roll two d20 and ignore the lower roll", the highest.
  const keep = e.keepHighest ? 1 : n;
  const dropped = new Set(all.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).slice(0, all.length - keep).map(([, i]) => i));
  const kept = all.filter((_, i) => !dropped.has(i));
  // The modifiers the instruction includes (CR 706.2), worked out as the dice are rolled.
  const mod = (e.add === undefined ? 0 : amountNow(s, e.add, ctx)) - (e.subtract === undefined ? 0 : amountNow(s, e.subtract, ctx));
  const result = kept.reduce((a, b) => a + b, 0) + mod;
  s.resolving!.rolled = { sides: e.sides, naturals: kept, result };
  const die = `d${e.sides}`;
  const shown = all.length > kept.length ? ` (${all.join(", ")}, ${all.length - kept.length} ignored)` : "";
  log(s, `${player(s, who).name} rolls ${kept.length === 1 ? `a ${die}` : `${kept.length} ${die}`} for ${src}: ${kept.join(" + ")}${mod ? ` ${mod > 0 ? "+" : "-"} ${Math.abs(mod)}` : ""}${kept.length > 1 || mod ? ` = ${result}` : ""}${shown}.`);
  // A die's own result: with one die, the modified result; each of several, its natural result.
  fireEvent(s, { type: "diceRolled", player: who, sides: e.sides, dice: kept.map((v) => ({ natural: v, result: kept.length === 1 ? result : v })), result });
  // "And choose one result" (the Endeavors): its controller picks which die is "that result" (CR 608.2d); with the same
  // number on both, there's nothing to choose.
  if (e.chooseOne && kept.length === 2) {
    if (kept[0] === kept[1]) {
      s.resolving!.rolled = { sides: e.sides, naturals: kept, result: kept[0]!, other: kept[1]! };
      return;
    }
    s.pending = { kind: "chooseOption", player: who, source: src, what: "rollResult", options: ["0", "1"], labels: kept.map(String), prompt: `you rolled ${kept[0]} and ${kept[1]}: choose one result` };
    return "paused";
  }
}

/**
 * "Flip a coin" (CR 705.2): its controller calls heads or tails and wins the flip if the coin matches, an even chance
 * either way, so only whether they won is kept. "Flip a coin until you lose a flip": as many as it takes. Each flip won
 * or lost is an event of its own ("whenever you win a coin flip").
 */
export function runCoinEffect(s: GameState, e: Extract<Effect, { type: "flipCoin" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const who = ctx.controller;
  const sc = (s.resolving!.scratch ??= {});
  // Krark's Thumb (a replacement, CR 614.1a): each flip is two coins, one of them ignored, so only the kept one counts
  // as won or lost. A second Thumb is treated as one (not modeled: ROADMAP).
  const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === who && !!abilitiesOf(s, obj(s, id)).flipTwo);
  const flip = () => (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]);
  // One flip won and one lost: its controller keeps the one they choose, having seen both (rulings).
  if (sc.thumbFlip !== undefined) {
    const won = sc.may !== false;
    sc.thumbFlip = undefined;
    sc.may = undefined;
    fireEvent(s, { type: "coinFlipped", player: who, won });
    s.resolving!.flipped = { won, wins: won ? 1 : 0 };
    log(s, `${player(s, who).name} flips two coins for ${src} and keeps the ${won ? "won" : "lost"} flip.`);
    return;
  }
  let first: boolean[] | undefined;
  if (!e.untilLose && thumb && !e.n) {
    const [a, b] = (first = flip());
    if (a !== b) {
      sc.thumbFlip = true;
      sc.may = undefined;
      s.pending = { kind: "chooseMay", player: who, prompt: "keep the won coin flip (Krark's Thumb flipped two coins, one won and one lost; No keeps the lost flip)", source: src, thumb: true };
      return "paused";
    }
  }
  // Ral Zarek: flips no one calls, only heads or tails (CR 705.2): no "won" or "lost" events (rulings). With Krark's Thumb
  // each is two coins and one is ignored: the heads one is kept.
  if (e.uncalled) {
    let heads = 0;
    for (let i = 0; i < (e.n ?? 1); i++) if (flip().some((h) => h)) heads++;
    s.resolving!.flipped = { won: heads > 0, wins: heads };
    log(s, `${player(s, who).name} flips ${e.n ?? 1} coins for ${src}: ${heads} came up heads.`);
    return;
  }
  let wins = 0;
  let won = false;
  // Even "until you lose a flip" ends some time; a long run of wins is cut short where paper Magic would be (CR 732).
  // With Krark's Thumb, each flip of the run keeps a won coin if there is one: a lost flip would only end the run.
  // "Flip three coins": each flip on its own (CR 705.1); with Krark's Thumb each keeps a won coin if there is one.
  for (let i = 0; i < 100; i++) {
    won = (i === 0 && first ? first : flip()).some((w) => w);
    fireEvent(s, { type: "coinFlipped", player: who, won });
    if (won) wins++;
    if (e.n ? i + 1 >= e.n : !won || !e.untilLose) break;
  }
  s.resolving!.flipped = { won, wins };
  log(s, e.n ? `${player(s, who).name} flips ${e.n} coins for ${src}: ${wins} won.` : e.untilLose ? `${player(s, who).name} flips coins for ${src} until losing a flip: ${wins} won.` : `${player(s, who).name} flips a coin for ${src} and ${won ? "wins" : "loses"} the flip.`);
}

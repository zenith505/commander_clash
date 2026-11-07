// Rolling dice (CR 706).

import type { Effect } from "../abilities";
import { abilitiesOf, defOf } from "../cards";
import { controllerOf } from "../layers";
import { destroyPermanent, gainLife, livingPlayers, log, loseLife, obj, player } from "../game";
import { nextRandom } from "../rng";
import type { GameState, PlayerId } from "../types";
import { ResolveCtx, amountNow, ctxSource, objects, players } from "./resolve";
import { dealDamage } from "../damage";
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
  // The modifiers the instruction includes (CR 706.2), worked out as the dice are rolled.
  const mod = (e.add === undefined ? 0 : amountNow(s, e.add, ctx)) - (e.subtract === undefined ? 0 : amountNow(s, e.subtract, ctx));
  const { kept, result } = rollDice(s, who, e.sides, n, src, mod, e.keepHighest);
  s.resolving!.rolled = { sides: e.sides, naturals: kept, result };
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
 * `pid` rolls `n` dice with `sides` sides for `src`, logged, and the roll is an event. Each advantage effect replaces the
 * roll with one more die and ignores the lowest (CR 614.1a, 706.6): all of them, as many more dice and as many lowest
 * ones ignored. An ignored roll never happened: it doesn't count and triggers nothing. `kept`: the dice that count, in
 * the order rolled; `result` their total plus `mod`. Also as a permanent enters (Neverwinter Hydra).
 */
export function rollDice(s: GameState, pid: PlayerId, sides: number, n: number, src: string, mod = 0, keepHighest?: true): { kept: number[]; result: number } {
  const extra = advantages(s, pid);
  const all = Array.from({ length: n + extra }, () => 1 + Math.floor(nextRandom(s) * sides));
  // All but the lowest ones; "roll two d20 and ignore the lower roll", the highest.
  const keep = keepHighest ? 1 : n;
  const dropped = new Set(all.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).slice(0, all.length - keep).map(([, i]) => i));
  const kept = all.filter((_, i) => !dropped.has(i));
  const result = kept.reduce((a, b) => a + b, 0) + mod;
  const die = `d${sides}`;
  const shown = all.length > kept.length ? ` (${all.join(", ")}, ${all.length - kept.length} ignored)` : "";
  log(s, `${player(s, pid).name} rolls ${kept.length === 1 ? `a ${die}` : `${kept.length} ${die}`} for ${src}: ${kept.join(" + ")}${mod ? ` ${mod > 0 ? "+" : "-"} ${Math.abs(mod)}` : ""}${kept.length > 1 || mod ? ` = ${result}` : ""}${shown}.`);
  // A die's own result: with one die, the modified result; each of several, its natural result.
  fireEvent(s, { type: "diceRolled", player: pid, sides, dice: kept.map((v) => ({ natural: v, result: kept.length === 1 ? result : v })), result });
  return { kept, result };
}

/**
 * Edgar, King of Figaro: "The first time you flip one or more coins each turn, those coins come up heads and you win those
 * flips": whether `pid`'s next flips are those (a replacement of the results, CR 705.3; rulings: whatever they would have
 * shown, and won even if they'd have no winner).
 */
export function flipsRigged(s: GameState, pid: PlayerId): boolean {
  return !s.turnLog?.coinsFlipped?.includes(pid) && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).firstFlipsHeads);
}

/** `pid` has flipped one or more coins this turn (TurnLog.coinsFlipped). */
export function noteFlipped(s: GameState, pid: PlayerId) {
  const t = ((s.turnLog ??= {}).coinsFlipped ??= []);
  if (!t.includes(pid)) t.push(pid);
}

/**
 * "Flip a coin" (CR 705.2): its controller calls heads or tails and wins the flip if the coin matches, an even chance
 * either way, so only whether they won is kept. "Flip a coin until you lose a flip": as many as it takes. Each flip won
 * or lost is an event of its own ("whenever you win a coin flip").
 */
export function runCoinEffect(s: GameState, e: Extract<Effect, { type: "flipCoin" }>, ctx: ResolveCtx, src: string): "paused" | void {
  // "That player flips a coin" (Planar Chaos): they flip it, win or lose it (CR 705.2), and their Krark's Thumb applies.
  const who = e.who ? players(s, e.who, ctx).find((p) => !player(s, p).lost) : ctx.controller;
  if (who === undefined) return;
  // "Flip that many coins" (Yusri): the number as it resolves; no coins for 0 (nothing won or lost).
  if (e.nAmount !== undefined) {
    const n = Math.max(0, amountNow(s, e.nAmount, ctx));
    if (!n) {
      s.resolving!.flipped = { won: false, wins: 0, flips: 0 };
      log(s, `${player(s, who).name} flips no coins for ${src}.`);
      return;
    }
    e = { ...e, n, nAmount: undefined };
  }
  const sc = (s.resolving!.scratch ??= {});
  // Krark's Thumb (a replacement, CR 614.1a): each flip is two coins, one of them ignored, so only the kept one counts
  // as won or lost. A second Thumb is treated as one (not modeled: ROADMAP).
  const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === who && !!abilitiesOf(s, obj(s, id)).flipTwo);
  const flip = () => (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]);
  // One flip won and one lost: its controller keeps the one they choose, having seen both (rulings).
  // Odds: an uncalled flip, heads and tails: its controller keeps the one they choose; nothing is won or lost.
  if (sc.thumbFlip !== undefined && sc.thumbUncalled) {
    const up = sc.may !== false;
    sc.thumbFlip = undefined;
    sc.thumbUncalled = undefined;
    sc.may = undefined;
    s.resolving!.flipped = { won: up, wins: up ? 1 : 0 };
    log(s, `${player(s, who).name} flips two coins for ${src} and keeps ${up ? "heads" : "tails"}.`);
    return;
  }
  if (sc.thumbFlip !== undefined) {
    const won = sc.may !== false;
    sc.thumbFlip = undefined;
    sc.may = undefined;
    fireEvent(s, { type: "coinFlipped", player: who, won });
    s.resolving!.flipped = { won, wins: won ? 1 : 0 };
    log(s, `${player(s, who).name} flips two coins for ${src} and keeps the ${won ? "won" : "lost"} flip.`);
    return;
  }
  // Edgar: this set of flips comes up heads and is won; with "until you lose a flip", only the first flip of the run is
  // the first time this turn.
  const heads = flipsRigged(s, who);
  const edgar = heads ? " (the first coins flipped this turn come up heads)" : "";
  noteFlipped(s, who);
  let first: boolean[] | undefined;
  if (!e.untilLose && thumb && !e.n && !heads && !e.uncalled) {
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
    // Odds: one flip that matters heads or tails: with Krark's Thumb, heads and tails, its controller keeps either.
    if (thumb && !heads && (e.n ?? 1) === 1) {
      const [a, b] = flip();
      if (a !== b) {
        sc.thumbFlip = true;
        sc.thumbUncalled = true;
        sc.may = undefined;
        s.pending = { kind: "chooseMay", player: who, prompt: "keep heads (Krark's Thumb flipped two coins, heads and tails; No keeps tails)", source: src, thumb: true };
        return "paused";
      }
      s.resolving!.flipped = { won: !!a, wins: a ? 1 : 0 };
      log(s, `${player(s, who).name} flips two coins for ${src}: both came up ${a ? "heads" : "tails"}.`);
      return;
    }
    let up = 0;
    for (let i = 0; i < (e.n ?? 1); i++) if (heads || flip().some((h) => h)) up++;
    // With Edgar they're won flips too (rulings on Edgar, King of Figaro with Ral Zarek).
    if (heads) for (let i = 0; i < (e.n ?? 1); i++) fireEvent(s, { type: "coinFlipped", player: who, won: true });
    s.resolving!.flipped = { won: up > 0, wins: up };
    log(s, (e.n ?? 1) === 1 ? `${player(s, who).name} flips a coin for ${src}: it comes up ${up ? "heads" : "tails"}${edgar}.` : `${player(s, who).name} flips ${e.n ?? 1} coins for ${src}: ${up} came up heads${edgar}.`);
    return;
  }
  // Fiery Gambit: "Flip a coin until you lose a flip or choose to stop flipping": one flip at a time, asked after each one
  // won whether to flip again (rulings); with Krark's Thumb, a won coin kept if there is one. Edgar rigs the first of the
  // run only. A run of 100 wins is cut short, as paper Magic would (CR 732).
  if (e.untilLose && e.mayStop) {
    const run = (sc.flipRun ??= { wins: 0 });
    if (run.asked) {
      run.asked = undefined;
      const again = sc.may !== false;
      sc.may = undefined;
      if (!again) {
        sc.flipRun = undefined;
        s.resolving!.flipped = { won: true, wins: run.wins };
        log(s, `${player(s, who).name} stops flipping coins for ${src}: ${run.wins} won.`);
        return;
      }
    }
    const won1 = (heads && run.wins === 0) || flip().some((w) => w);
    fireEvent(s, { type: "coinFlipped", player: who, won: won1 });
    if (!won1 || run.wins + 1 >= 100) {
      sc.flipRun = undefined;
      const wins1 = run.wins + (won1 ? 1 : 0);
      s.resolving!.flipped = { won: won1, wins: wins1 };
      log(s, `${player(s, who).name} flips coins for ${src} and ${won1 ? "wins" : "loses"} flip ${wins1 + (won1 ? 0 : 1)}${won1 ? "" : `: ${wins1} won before it`}${edgar}.`);
      return;
    }
    run.wins++;
    run.asked = true;
    log(s, `${player(s, who).name} wins coin flip ${run.wins} for ${src}${run.wins === 1 ? edgar : ""}.`);
    s.pending = { kind: "chooseMay", player: who, source: src, prompt: `flip another coin (${run.wins} won so far; if you lose a flip, ${src} has no effect)`, flipAgain: { wins: run.wins, enough: e.mayStop.enough } };
    return "paused";
  }
  let wins = 0;
  let won = false;
  let flips = 0;
  // Even "until you lose a flip" ends some time; a long run of wins is cut short where paper Magic would be (CR 732).
  // With Krark's Thumb, each flip of the run keeps a won coin if there is one: a lost flip would only end the run.
  // "Flip three coins": each flip on its own (CR 705.1); with Krark's Thumb each keeps a won coin if there is one.
  for (let i = 0; i < 100; i++) {
    won = heads && (i === 0 || !!e.n) ? true : (i === 0 && first ? first : flip()).some((w) => w);
    fireEvent(s, { type: "coinFlipped", player: who, won });
    flips++;
    if (won) wins++;
    // Squee's Revenge: "that many times or until you lose a flip, whichever comes first".
    if (e.n ? i + 1 >= e.n || (e.untilLose && !won) : !won || !e.untilLose) break;
  }
  s.resolving!.flipped = { won, wins, ...(e.n ? { flips } : {}) };
  log(s, (e.n && e.untilLose ? `${player(s, who).name} flips up to ${e.n} coins for ${src} until losing a flip: ${wins} won${won ? " (all of them)" : ""}` : e.n ? `${player(s, who).name} flips ${e.n} coins for ${src}: ${wins} won` : e.untilLose ? `${player(s, who).name} flips coins for ${src} until losing a flip: ${wins} won` : `${player(s, who).name} flips a coin for ${src} and ${won ? "wins" : "loses"} the flip`) + `${edgar}.`);
}

/**
 * Rakdos, the Showstopper: "Flip a coin for each creature that isn't a Demon, Devil, or Imp. Destroy each creature whose
 * coin comes up tails." Coins that only come up heads or tails, which no one wins or loses (CR 705.2); every creature
 * whose coin came up tails is destroyed at the same time, with no chance to act in between (rulings). With Krark's Thumb
 * each is two coins and its controller ignores one: the heads one is kept for their own creatures, the tails one for
 * everyone else's (not asked: ROADMAP).
 */
export function runCoinEachEffect(s: GameState, e: Extract<Effect, { type: "flipCoinEach" }>, ctx: ResolveCtx, src: string): void {
  const who = ctx.controller;
  const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === who && !!abilitiesOf(s, obj(s, id)).flipTwo);
  const each = objects(s, { ref: "each", filter: e.filter }, ctx);
  // Edgar: all of them come up heads, and are won (rulings).
  const heads = each.length > 0 && flipsRigged(s, who);
  if (each.length) noteFlipped(s, who);
  if (heads) for (let i = 0; i < each.length; i++) fireEvent(s, { type: "coinFlipped", player: who, won: true });
  const tails = heads ? [] : each.filter((o) => {
    const coins = thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5];
    return controllerOf(s, o) === who ? coins.every((h) => !h) : coins.some((h) => !h);
  });
  log(s, `${player(s, who).name} flips ${each.length} coin${each.length === 1 ? "" : "s"} for ${src}: ${tails.length ? `tails for ${tails.map((o) => defOf(s, o).name).join(", ")}` : "no tails"}.`);
  for (const o of tails) if (o.zone === "battlefield") destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, false, who);
}

/**
 * Mana Clash: "You and target opponent each flip a coin. ~ deals 1 damage to each player whose coin comes up tails. Repeat
 * this process until both players' coins come up heads on the same flip." Flips no one calls or wins (rulings); each point
 * of damage dealt on its own (rulings). Edgar makes a player's first flip this turn heads, and won (rulings on Edgar). With
 * Krark's Thumb a player keeps the heads coin (not asked: ROADMAP). The process ends some time; a long run is cut short
 * where paper Magic would be (CR 732).
 */
export function runFlipClashEffect(s: GameState, e: Extract<Effect, { type: "flipClash" }>, ctx: ResolveCtx, src: string): void {
  const you = ctx.controller;
  const them = players(s, e.with, ctx)[0];
  if (them === undefined) return;
  const coin = (pid: PlayerId): boolean => {
    const rig = flipsRigged(s, pid);
    noteFlipped(s, pid);
    if (rig) {
      fireEvent(s, { type: "coinFlipped", player: pid, won: true });
      return true;
    }
    const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).flipTwo);
    return (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((h) => h);
  };
  let rounds = 0;
  const hurt = { [you]: 0, [them]: 0 } as Record<PlayerId, number>;
  for (; rounds < 200; rounds++) {
    const mine = coin(you);
    const theirs = coin(them);
    for (const [pid, h] of [[you, mine], [them, theirs]] as const)
      if (!h && !player(s, pid).lost) hurt[pid] = (hurt[pid] ?? 0) + dealDamage(s, ctxSource(s, ctx), { player: pid }, e.damage);
    if (mine && theirs) break;
  }
  log(s, `${player(s, you).name} and ${player(s, them).name} flip coins for ${src} ${rounds + 1} time${rounds ? "s" : ""}: ${player(s, you).name} is dealt ${hurt[you]} damage, ${player(s, them).name} ${hurt[them]}.`);
}

/**
 * Game of Chaos (see Effect "gameOfChaos"): its controller flips; winning, they gain the stake and the opponent loses it,
 * losing the other way round; then the winner of that flip decides whether to flip again, the stake doubling (rulings).
 * Edgar makes its controller's first flip this turn won; with Krark's Thumb they keep a won coin if there is one. It ends
 * when the deciding player stops, or when either player has left the game (CR 800.4a).
 */
export function runGameOfChaosEffect(s: GameState, e: Extract<Effect, { type: "gameOfChaos" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const you = ctx.controller;
  const them = players(s, e.with, ctx)[0];
  if (them === undefined) return;
  const sc = (s.resolving!.scratch ??= {});
  const g = (sc.gameOfChaos ??= { stake: 1, net: 0 });
  if (g.asked) {
    g.asked = undefined;
    const again = sc.may !== false;
    sc.may = undefined;
    if (!again) {
      sc.gameOfChaos = undefined;
      return void log(s, `${src}: no more flips.`);
    }
    g.stake *= 2;
  }
  for (let i = 0; i < 60; i++) {
    if (player(s, you).lost || player(s, them).lost) break;
    const rig = flipsRigged(s, you);
    noteFlipped(s, you);
    const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === you && !!abilitiesOf(s, obj(s, id)).flipTwo);
    const won = rig || (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((h) => h);
    fireEvent(s, { type: "coinFlipped", player: you, won });
    const [winner, loser] = won ? [you, them] : [them, you];
    log(s, `${player(s, you).name} ${won ? "wins" : "loses"} the flip for ${src}: ${player(s, winner).name} gains ${g.stake} life and ${player(s, loser).name} loses ${g.stake} life.`);
    gainLife(s, winner, g.stake);
    loseLife(s, loser, g.stake);
    g.net += won ? g.stake : -g.stake;
    if (player(s, you).lost || player(s, them).lost || player(s, winner).life <= 0 || player(s, loser).life <= 0) break;
    // The winner decides whether to flip again, for twice the stakes.
    g.asked = true;
    const net = winner === you ? g.net : -g.net;
    s.pending = { kind: "chooseMay", player: winner, source: src, prompt: `flip again for ${g.stake * 2} life (you won this flip; so far this game you're ${net >= 0 ? `up ${net}` : `down ${-net}`} life)`, chaosAgain: { stake: g.stake * 2, net, against: loser } };
    return "paused";
  }
  sc.gameOfChaos = undefined;
}

/**
 * Goblin Assassin: "Each player flips a coin. Each player whose coin comes up tails sacrifices a creature of their choice."
 * One coin each, in turn order from the active player; no one calls them, so no one wins or loses them (rulings, CR 705.2),
 * unless Edgar makes a player's first coins this turn come up heads and won (rulings on Edgar). With Krark's Thumb a
 * player flips two and keeps the heads one (not asked: ROADMAP). Those with tails are kept for the next instruction.
 */
export function runEachPlayerFlipsEffect(s: GameState, _e: Extract<Effect, { type: "eachPlayerFlips" }>, _ctx: ResolveCtx, src: string): void {
  const order = livingPlayers(s).sort((a, b) => turnRank(s, a) - turnRank(s, b));
  const tails: PlayerId[] = [];
  for (const pid of order) {
    const rig = flipsRigged(s, pid);
    noteFlipped(s, pid);
    if (rig) {
      fireEvent(s, { type: "coinFlipped", player: pid, won: true });
      continue;
    }
    const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).flipTwo);
    if (!(thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((h) => h)) tails.push(pid);
  }
  s.resolving!.flippedTails = tails;
  log(s, `Each player flips a coin for ${src}: ${tails.length ? `tails for ${tails.map((p) => player(s, p).name).join(", ")}` : "all heads"}.`);
}

/**
 * Mutalith Vortex Beast: "Flip a coin for each opponent you have": its controller flips one coin for each opponent still
 * in the game, in turn order, calling each, so each is won or lost (CR 705.2) and is an event of its own. Edgar, King of
 * Figaro makes them all heads and won as the first flips this turn (CR 705.3); with Krark's Thumb each keeps a won coin if
 * there is one (as runCoinEffect's flips of several coins). The wins are counted (Count "flipsWon"); the opponents whose
 * flip was lost are kept as { ref: "flippedTails" }.
 */
export function runFlipEachOpponentEffect(s: GameState, _e: Extract<Effect, { type: "flipEachOpponent" }>, ctx: ResolveCtx, src: string): void {
  const who = ctx.controller;
  const opps = livingPlayers(s).filter((p) => p !== who).sort((a, b) => turnRank(s, a) - turnRank(s, b));
  const heads = flipsRigged(s, who);
  noteFlipped(s, who);
  const thumb = s.battlefield.some((id) => controllerOf(s, obj(s, id)) === who && !!abilitiesOf(s, obj(s, id)).flipTwo);
  const lost: PlayerId[] = [];
  for (const pid of opps) {
    const won = heads || (thumb ? [nextRandom(s) < 0.5, nextRandom(s) < 0.5] : [nextRandom(s) < 0.5]).some((w) => w);
    fireEvent(s, { type: "coinFlipped", player: who, won });
    if (!won) lost.push(pid);
  }
  s.resolving!.flipped = { won: lost.length < opps.length, wins: opps.length - lost.length };
  s.resolving!.flippedTails = lost;
  log(s, `${player(s, who).name} flips a coin for each opponent for ${src}: ${opps.length - lost.length} won${lost.length ? `, lost for ${lost.map((p) => player(s, p).name).join(", ")}` : ""}${heads ? " (the first coins flipped this turn come up heads)" : ""}.`);
}

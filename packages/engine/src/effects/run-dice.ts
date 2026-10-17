// Rolling dice (CR 706).

import type { Effect } from "../abilities";
import { abilitiesOf } from "../cards";
import { controllerOf } from "../layers";
import { log, obj, player } from "../game";
import { nextRandom } from "../rng";
import type { GameState, PlayerId } from "../types";
import { ResolveCtx, amountNow } from "./resolve";
import { fireEvent } from "./triggers";

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

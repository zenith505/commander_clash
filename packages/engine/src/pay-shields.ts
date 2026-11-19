// Round B263: Guardian Angel's "Until end of turn, you may pay {1} any time you could cast an instant. If you do, prevent the
// next 1 damage that would be dealt to that permanent or player this turn." An effect that lets a player take an action
// later is a special action (CR 116.2c): it doesn't use the stack, nothing can respond to it, and the player gets priority
// again afterwards (CR 116.3). "Any time you could cast an instant" is any time they have priority (CR 117.1a). The shield
// is a prevention shield like the spell's own (CR 615.7), on the permanent as the object it was as the spell resolved (CR
// 400.7) or on the player. The permission ends with the turn's "until end of turn" effects, in the cleanup step (CR 514.2).

import { log, obj, player } from "./game";
import { parseManaCost } from "./mana";
import { canPayFromPool, spendFromPool } from "./spend";
import { defOf } from "./cards";
import { RulesError, type GameState, type PayShield, type Player, type PlayerId } from "./types";

/** The permanent or player the shield would go on now, if it's still there: the same object (CR 400.7), or a player still in the game. */
export function payShieldHolder(s: GameState, ps: PayShield): { kind: "object"; id: string } | { kind: "player"; id: PlayerId } | null {
  if ("player" in ps.to) return player(s, ps.to.player).lost ? null : { kind: "player", id: ps.to.player };
  const o = s.objects[ps.to.object];
  return o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === ps.to.zc ? { kind: "object", id: o.id } : null;
}

/** The name of what a shield goes on, for buttons and the log. */
export function payShieldName(s: GameState, ps: PayShield): string {
  if ("player" in ps.to) return player(s, ps.to.player).name;
  const o = s.objects[ps.to.object];
  return o ? defOf(s, o).name : "it";
}

/** The shields `pid` may pay for this turn whose permanent or player is still there (paying for one that's gone would do nothing). */
export function payableShields(s: GameState, pid: PlayerId): PayShield[] {
  if (player(s, pid).lost) return [];
  return (s.payShields ?? []).filter((ps) => ps.player === pid && ps.turn === s.turn && payShieldHolder(s, ps) !== null);
}

/** Why `pid` can't pay for that shield now, or null (with the mana in their pool): any time they have priority (CR 116.2c). */
export function payShieldProblem(s: GameState, pid: PlayerId, id: number): string | null {
  const ps = payableShields(s, pid).find((x) => x.id === id);
  if (!ps) return "there's no shield of that kind for you to pay for";
  if (s.priority !== pid || s.pending) return "you can pay for that only while you have priority";
  if (!canPayFromPool(s, pid, parseManaCost(ps.cost), "other")) return `not enough mana to pay ${ps.cost} for ${ps.source}`;
  return null;
}

/** Pay it: the next `n` damage to that permanent or player this turn is prevented (CR 615.7); priority again (CR 116.3). */
export function payShield(s: GameState, p: Player, id: number) {
  const problem = payShieldProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const ps = payableShields(s, p.id).find((x) => x.id === id)!;
  spendFromPool(s, p.id, parseManaCost(ps.cost), "other");
  const h = payShieldHolder(s, ps)!;
  const holder = h.kind === "object" ? obj(s, h.id) : player(s, h.id);
  holder.preventNext = (holder.preventNext ?? 0) + ps.n;
  log(s, `${p.name} pays ${ps.cost} for ${ps.source}: it will prevent the next ${ps.n} more damage to ${payShieldName(s, ps)} this turn.`);
  s.passedInSuccession = [];
}

/** The permission Guardian Angel gives as it resolves, for its controller and the target (still legal, CR 608.2b). */
export function grantPayShield(s: GameState, pid: PlayerId, to: PayShield["to"], cost: string, n: number, source: string) {
  s.unlessPaidSeq = (s.unlessPaidSeq ?? 0) + 1;
  (s.payShields ??= []).push({ id: s.unlessPaidSeq, player: pid, to, cost, n, source, turn: s.turn });
}

// Spending mana from a pool that may hold restricted mana (CR 106.6): "Spend this mana only to cast a creature spell."

import type { ManaSpend } from "./abilities";
import { defOf } from "./cards";
import { objectMatches, printedMatches } from "./effects";
import { emptyPool, payFromPool, type ManaPool, type ParsedCost, type Payment } from "./mana";
import type { CardDef, GameObject, GameState, ManaType, PlayerId } from "./types";

/**
 * What a payment is for: casting a spell (as it is on the stack: face down, bestowed), activating an ability of a
 * source, or anything else (a cost paid while something resolves, a special action, another player's spell).
 */
export type ManaUse = { spell: CardDef } | { ability: GameObject } | "other";

/** Can mana restricted this way be spent on `use`? */
export function spendAllows(s: GameState, pid: PlayerId, only: ManaSpend, use: ManaUse): boolean {
  if (use === "other") return !!only.other;
  if ("spell" in use) return !!only.spells && printedMatches(only.spells, use.spell);
  if (only.abilities === "any") return true;
  if (!only.abilities) return false;
  // "Activate abilities of artifacts": of artifact permanents (CR 109.2), so only on the battlefield. A card in
  // another zone has its printed characteristics.
  if (use.ability.zone === "battlefield") return objectMatches(s, only.abilities, use.ability, pid, false);
  return !!only.anyZone && printedMatches(only.abilities, defOf(s, use.ability));
}

/** The mana `pid` can spend on `use`, and how much of it is restricted mana that's best spent first. */
export function poolFor(s: GameState, pid: PlayerId, use: ManaUse): { pool: ManaPool; prefer: ManaPool } {
  const p = s.players[pid]!;
  const pool = { ...p.manaPool };
  const prefer = emptyPool();
  for (const r of p.restrictedMana ?? []) {
    if (spendAllows(s, pid, r.only, use)) prefer[r.mana] += r.n;
    else pool[r.mana] -= r.n;
  }
  return { pool, prefer };
}

/** Could `pid` pay this from their pool for `use`? */
export function canPayFromPool(s: GameState, pid: PlayerId, cost: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity): boolean {
  return !!payFromPool(cost, poolFor(s, pid, use).pool, extraGeneric, life);
}

/**
 * Pay this from `pid`'s pool for `use`, spending restricted mana it allows first. Returns the payment (with the
 * mana spent by type), or null (and nothing changes) if it can't be paid.
 */
export function spendFromPool(s: GameState, pid: PlayerId, cost: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity, opts: { spreadColors?: boolean } = {}): (Payment & { spent: ManaPool }) | null {
  const p = s.players[pid]!;
  const { pool, prefer } = poolFor(s, pid, use);
  const paid = payFromPool(cost, pool, extraGeneric, life, { ...opts, prefer });
  if (!paid) return null;
  const spent = emptyPool();
  for (const m of Object.keys(spent) as ManaType[]) {
    spent[m] = pool[m] - paid.pool[m];
    p.manaPool[m] -= spent[m];
    // Restricted mana of that type it may be spent on goes first.
    let left = spent[m];
    for (const r of p.restrictedMana ?? []) {
      if (!left || r.mana !== m || !spendAllows(s, pid, r.only, use)) continue;
      const n = Math.min(left, r.n);
      r.n -= n;
      left -= n;
    }
  }
  if (p.restrictedMana) p.restrictedMana = p.restrictedMana.filter((r) => r.n > 0);
  if (!p.restrictedMana?.length) p.restrictedMana = undefined;
  return { ...paid, pool: { ...p.manaPool }, spent };
}

/** Add mana to `pid`'s pool, restricted if `only` says how it can be spent (CR 106.4, 106.6). */
export function addMana(s: GameState, pid: PlayerId, mana: ManaType[], only?: ManaSpend): void {
  const p = s.players[pid]!;
  for (const m of mana) {
    p.manaPool[m]++;
    if (!only) continue;
    const same = p.restrictedMana?.find((r) => r.mana === m && r.only.text === only.text);
    if (same) same.n++;
    else (p.restrictedMana ??= []).push({ mana: m, n: 1, only });
  }
}

// Spending mana from a pool that may hold restricted mana (CR 106.6): "Spend this mana only to cast a creature spell."

import type { ManaSpend } from "./abilities";
import { defOf } from "./cards";
import { objectMatches, printedMatches } from "./effects";
import { emptyPool, payFromPool, type ManaPool, type ParsedCost, type Payment } from "./mana";
import type { CardDef, Color, GameObject, GameState, ManaType, PlayerId } from "./types";

/**
 * What a payment is for: casting a spell (as it is on the stack: face down, bestowed), activating an ability of a
 * source, or anything else (a cost paid while something resolves, a special action, another player's spell).
 */
export type ManaUse = { spell: CardDef; /** Security Rhox's "Spend only mana produced by Treasures to cast it this way". */ treasureOnly?: true } | { ability: GameObject } | "other";

/** How much of `pid`'s pool a Treasure made, by type (CR 106.3): never more than is there. */
export function treasurePool(s: GameState, pid: PlayerId): ManaPool {
  const p = s.players[pid]!;
  const out = emptyPool();
  if (!p.treasureMana) return out;
  for (const m of Object.keys(out) as ManaType[]) {
    const restricted = (p.restrictedMana ?? []).reduce((n, r) => n + (r.mana === m ? r.n : 0), 0);
    out[m] = Math.max(0, Math.min(p.treasureMana[m] ?? 0, p.manaPool[m] - restricted));
  }
  return out;
}

/** How much of `pid`'s pool a snow source made, by type (CR 107.4h): never more than is there unrestricted. */
export function snowPool(s: GameState, pid: PlayerId): ManaPool {
  const p = s.players[pid]!;
  const out = emptyPool();
  if (!p.snowMana) return out;
  for (const m of Object.keys(out) as ManaType[]) {
    const restricted = (p.restrictedMana ?? []).reduce((n, r) => n + (r.mana === m ? r.n : 0), 0);
    out[m] = Math.max(0, Math.min(p.snowMana[m] ?? 0, p.manaPool[m] - restricted));
  }
  return out;
}

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

/**
 * The mana `pid` can spend on `use`, and how much of it is restricted mana that's best spent first. `treasure`: how
 * much of it a Treasure made, spent before other mana of its type on a spell or an ability ("if mana from a Treasure
 * was spent", the player chooses which mana pays, CR 601.2h).
 */
export function poolFor(s: GameState, pid: PlayerId, use: ManaUse): { pool: ManaPool; prefer: ManaPool; treasure: ManaPool; snow: ManaPool } {
  const p = s.players[pid]!;
  const treasure = treasurePool(s, pid);
  const snow = snowPool(s, pid);
  if (use !== "other" && "spell" in use && use.treasureOnly) return { pool: { ...treasure }, prefer: emptyPool(), treasure, snow: emptyPool() };
  const pool = { ...p.manaPool };
  const prefer = emptyPool();
  for (const r of p.restrictedMana ?? []) {
    if (spendAllows(s, pid, r.only, use)) prefer[r.mana] += r.n;
    else pool[r.mana] -= r.n;
  }
  return { pool, prefer, treasure, snow };
}

/** Could `pid` pay this from their pool for `use`? */
export function canPayFromPool(s: GameState, pid: PlayerId, cost: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity): boolean {
  const { pool, snow } = poolFor(s, pid, use);
  return !!payFromPool(cost, pool, extraGeneric, life, { snow });
}

/**
 * Pay this from `pid`'s pool for `use`, spending restricted mana it allows first. Returns the payment (with the
 * mana spent by type), or null (and nothing changes) if it can't be paid.
 */
export function spendFromPool(s: GameState, pid: PlayerId, cost: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity, opts: { spreadColors?: boolean; want?: Partial<Record<Color, number>>; avoid?: Partial<Record<Color, number>>; wantSnow?: boolean } = {}): (Payment & { spent: ManaPool; treasure: number }) | null {
  const p = s.players[pid]!;
  const { pool, prefer, treasure, snow } = poolFor(s, pid, use);
  const first = { ...prefer };
  if (use !== "other") for (const m of Object.keys(first) as ManaType[]) first[m] += treasure[m];
  const paid = payFromPool(cost, pool, extraGeneric, life, { ...opts, prefer: first, snow });
  if (!paid) return null;
  const spent = emptyPool();
  let fromTreasures = 0;
  for (const m of Object.keys(spent) as ManaType[]) {
    spent[m] = pool[m] - paid.pool[m];
    p.manaPool[m] -= spent[m];
    // Restricted mana of that type it may be spent on goes first, then mana from Treasures, then the rest.
    let left = spent[m];
    for (const r of p.restrictedMana ?? []) {
      if (!left || r.mana !== m || !spendAllows(s, pid, r.only, use) || (use !== "other" && "spell" in use && use.treasureOnly)) continue;
      const n = Math.min(left, r.n);
      r.n -= n;
      left -= n;
    }
    // Mana from snow sources (CR 107.4h): what it spent of that is no Treasure's, and what's left of it neither.
    if (paid.snow[m] && p.snowMana) p.snowMana[m] = Math.max(0, (p.snowMana[m] ?? 0) - paid.snow[m]);
    const snowLeft = Math.max(0, snow[m] - paid.snow[m]);
    // Spent on "other" (a cost while something resolves), the rest of the pool keeps the Treasure mana.
    const t = use === "other" ? Math.max(0, treasure[m] - (pool[m] - prefer[m] - left - snowLeft)) : Math.min(Math.max(0, left - paid.snow[m]), treasure[m]);
    if (t && p.treasureMana) p.treasureMana[m] = treasure[m] - t;
    fromTreasures += t;
  }
  if (p.restrictedMana) p.restrictedMana = p.restrictedMana.filter((r) => r.n > 0);
  if (!p.restrictedMana?.length) p.restrictedMana = undefined;
  if (p.treasureMana && !Object.values(p.treasureMana).some((n) => n)) p.treasureMana = undefined;
  if (p.snowMana && !Object.values(p.snowMana).some((n) => n)) p.snowMana = undefined;
  return { ...paid, pool: { ...p.manaPool }, spent, treasure: fromTreasures };
}

/**
 * Add mana to `pid`'s pool, restricted if `only` says how it can be spent (CR 106.4, 106.6). `treasure`: a Treasure
 * made it (CR 106.3); `snow`: a snow source made it (CR 107.4h). (Restricted mana from a Treasure isn't tracked as Treasure mana: no Treasure makes any.)
 */
export function addMana(s: GameState, pid: PlayerId, mana: ManaType[], only?: ManaSpend, treasure?: boolean, snow?: boolean): void {
  const p = s.players[pid]!;
  for (const m of mana) {
    p.manaPool[m]++;
    if (treasure && !only) (p.treasureMana ??= {})[m] = (p.treasureMana[m] ?? 0) + 1;
    if (snow && !only) (p.snowMana ??= {})[m] = (p.snowMana[m] ?? 0) + 1;
    if (!only) continue;
    const same = p.restrictedMana?.find((r) => r.mana === m && r.only.text === only.text);
    if (same) same.n++;
    else (p.restrictedMana ??= []).push({ mana: m, n: 1, only });
  }
}

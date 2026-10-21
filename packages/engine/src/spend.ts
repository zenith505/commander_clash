// Spending mana from a pool that may hold restricted mana (CR 106.6: "Spend this mana only to cast a creature spell."),
// mana from sources that matter (106.3: snow, Treasures, creatures, artifacts) and mana kept as steps end.

import type { ActivatedAbility, ManaSpend } from "./abilities";
import { abilitiesOf, defOf, isType } from "./cards";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { blackForLife, emptyPool, payFromPool, type ManaPool, type ParsedCost, type Payment } from "./mana";
import { characteristics, controllerOf } from "./layers";
import type { CardDef, Color, GameObject, GameState, ManaLot, ManaOrigin, ManaSpentTrigger, ManaType, PlayerId } from "./types";

/**
 * What a payment is for: casting a spell (as it is on the stack: face down, bestowed), activating an ability of a
 * source, or anything else (a cost paid while something resolves, a special action, another player's spell).
 */
export type ManaUse = { spell: CardDef; /** Security Rhox's "Spend only mana produced by Treasures to cast it this way". */ treasureOnly?: true; /** The card being cast, for "to cast your commander" (Opal Palace). */ object?: GameObject } | { ability: GameObject; /** "Spend only mana of the chosen color to activate this ability" (Throne of Eldraine): only mana of these types. */ onlyColors?: ManaType[] } | "other";

/** What paying an activated ability's mana cost is for: its source, and only the chosen color's mana if it says so. */
export function abilityUse(o: GameObject, ab: ActivatedAbility): ManaUse {
  return ab.spendOnlyChosenColor ? { ability: o, onlyColors: o.chosen?.color ? [o.chosen.color] : [] } : { ability: o };
}

/** The mana types a payment may use (all of them unless it says otherwise). */
export const usableTypes = (use: ManaUse): ManaType[] | undefined => (use !== "other" && "ability" in use ? use.onlyColors : undefined);

/** The mana of each type in `pid`'s pool that's in no lot: unrestricted, from a source that doesn't matter, not kept. */
export function plainMana(s: GameState, pid: PlayerId): ManaPool {
  const p = s.players[pid]!;
  const out = { ...p.manaPool };
  for (const l of p.manaLots ?? []) out[l.mana] -= l.n;
  return out;
}

/** How much of `pid`'s pool a source of this kind made, by type (CR 106.3, 107.4h), restricted or not. */
export function manaFromPool(s: GameState, pid: PlayerId, origin: ManaOrigin): ManaPool {
  const out = emptyPool();
  for (const l of s.players[pid]!.manaLots ?? []) if (l.from?.includes(origin)) out[l.mana] += l.n;
  return out;
}

/**
 * What `o` is as a source of mana now (CR 106.3): a snow object (107.4h), and on the battlefield a Treasure, a creature
 * or an artifact ("mana from a creature" means a creature permanent, CR 109.2). Sorted, as lots keep them.
 */
export function manaOriginsOf(s: GameState, o: GameObject): ManaOrigin[] {
  const c = characteristics(s, o);
  const here = o.zone === "battlefield";
  const out: ManaOrigin[] = [];
  if (here && c.types.includes("Artifact")) out.push("artifact");
  if (here && c.types.includes("Creature")) out.push("creature");
  if (c.supertypes.includes("Snow") && (here || o.zone === "stack")) out.push("snow");
  if (here && c.subtypes.includes("Treasure")) out.push("treasure");
  return out;
}

const treasureOnly = (use: ManaUse) => use !== "other" && "spell" in use && !!use.treasureOnly;

/** The lots of `pid`'s pool that can be spent on `use`. With Security Rhox's cost, only unrestricted mana from Treasures. */
function usableLots(s: GameState, pid: PlayerId, use: ManaUse): ManaLot[] {
  const lots = s.players[pid]!.manaLots ?? [];
  if (treasureOnly(use)) return lots.filter((l) => !l.only && l.from?.includes("treasure"));
  return lots.filter((l) => !l.only || spendAllows(s, pid, l.only, use));
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
 * The mana `pid` can spend on `use`, how much of it is restricted mana that's best spent first (`prefer`), and how much
 * of it a Treasure (`treasure`) or a snow source (`snow`, for {S}, CR 107.4h) made.
 */
export function poolFor(s: GameState, pid: PlayerId, use: ManaUse): { pool: ManaPool; prefer: ManaPool; treasure: ManaPool; snow: ManaPool } {
  const pool = treasureOnly(use) ? emptyPool() : plainMana(s, pid);
  const prefer = emptyPool();
  const treasure = emptyPool();
  const snow = emptyPool();
  for (const l of usableLots(s, pid, use)) {
    pool[l.mana] += l.n;
    if (l.only) prefer[l.mana] += l.n;
    if (l.from?.includes("treasure")) treasure[l.mana] += l.n;
    if (l.from?.includes("snow")) snow[l.mana] += l.n;
  }
  const only = usableTypes(use);
  if (only) for (const x of [pool, prefer, treasure, snow]) for (const m of Object.keys(x) as ManaType[]) if (!only.includes(m)) x[m] = 0;
  return { pool, prefer, treasure, snow };
}

/**
 * How `pid` may pay this cost: with K'rrik's "for each {B} in a cost, you may pay 2 life rather than pay that mana", any
 * {B} with 2 life too. It applies to every cost its controller pays with mana: spells, abilities, special actions (rulings).
 */
export function payableCost(s: GameState, pid: PlayerId, cost: ParsedCost): ParsedCost {
  const krrik = s.battlefield.some((id) => {
    const o = s.objects[id]!;
    return !!abilitiesOf(s, o).lifeForBlack && controllerOf(s, o) === pid;
  });
  return krrik ? blackForLife(cost) : cost;
}

/** Could `pid` pay this from their pool for `use`? */
export function canPayFromPool(s: GameState, pid: PlayerId, cost0: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity): boolean {
  const cost = payableCost(s, pid, cost0);
  const { pool, snow } = poolFor(s, pid, use);
  return !!payFromPool(cost, pool, extraGeneric, life, { snow });
}

/** What spending mana from these sources counts as (CR 106.3): "mana from a Treasure", "from creatures", "from an artifact". */
export type SpentFrom = Record<"treasure" | "creature" | "artifact", number>;

/**
 * Pay this from `pid`'s pool for `use`. Returns the payment (with the mana spent by type, and how much of it each kind
 * of source made), or null (and nothing changes) if it can't be paid. Which mana of a type pays is the player's choice
 * (CR 601.2h): restricted mana it may be spent on first; then, on a spell or an ability, mana from a Treasure, a creature
 * or an artifact ("if mana from a Treasure was spent"), but on anything else the rest first; mana kept as steps end last.
 */
export function spendFromPool(s: GameState, pid: PlayerId, cost0: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity, opts: { spreadColors?: boolean; want?: Partial<Record<Color, number>>; avoid?: Partial<Record<Color, number>>; wantSnow?: boolean } = {}): (Payment & { spent: ManaPool; treasure: number; from: SpentFrom; uncounterable?: true; spentTriggers?: ManaSpentTrigger[]; haste?: "endOfTurn" | "game"; commanderCounters?: number }) | null {
  const p = s.players[pid]!;
  const cost = payableCost(s, pid, cost0);
  const { pool, prefer, treasure, snow } = poolFor(s, pid, use);
  const first = { ...prefer };
  if (use !== "other") for (const m of Object.keys(first) as ManaType[]) first[m] = Math.min(pool[m], first[m] + treasure[m]);
  const paid = payFromPool(cost, pool, extraGeneric, life, { ...opts, prefer: first, snow });
  if (!paid) return null;
  const lots = usableLots(s, pid, use);
  const plain = treasureOnly(use) ? emptyPool() : plainMana(s, pid);
  const spent = emptyPool();
  const from: SpentFrom = { treasure: 0, creature: 0, artifact: 0 };
  let uncounterable = false;
  const spentTriggers: ManaSpentTrigger[] = [];
  let haste: "endOfTurn" | "game" | undefined;
  let commanderCounters = 0;
  // Mana that gives a creature spell haste is spent on one first, and kept back from anything else; Opal Palace's
  // mana the same way for its controller's commander.
  const creatureSpell = use !== "other" && "spell" in use && isType(use.spell, "Creature");
  const ownCommander = use !== "other" && "spell" in use && !!use.object?.isCommander && use.object.owner === pid;
  // Lower ranks are spent first; `plain` stands for the mana of that type in no lot.
  const rank = (l: ManaLot, plain: boolean) => (l.keep ? 10 : 0) + (l.haste ? (creatureSpell ? -1 : 3) : 0) + (l.commanderCounters ? (ownCommander ? -1 : 3) : 0) + (l.only ? 0 : plain === (use === "other") ? 1 : 2);
  for (const m of Object.keys(spent) as ManaType[]) {
    spent[m] = pool[m] - paid.pool[m];
    if (!spent[m]) continue;
    p.manaPool[m] -= spent[m];
    const plainLot: ManaLot = { mana: m, n: plain[m] };
    const take = (candidates: ManaLot[], n: number) => {
      for (const l of candidates.sort((a, b) => rank(a, a === plainLot) - rank(b, b === plainLot))) {
        const k = Math.min(n, l.n);
        l.n -= k;
        n -= k;
        if (k && l.only?.uncounterable) uncounterable = true;
        if (k && l.haste && creatureSpell && haste !== "game") haste = l.haste;
        if (l.commanderCounters && ownCommander) commanderCounters += k;
        if (l.spentTrigger && use !== "other" && "spell" in use) for (let j = 0; j < k; j++) spentTriggers.push(l.spentTrigger);
        for (const f of l.from ?? []) if (f !== "snow") from[f] += k;
      }
    };
    // The snow mana it spent came from snow lots (CR 107.4h); the rest from the other lots and plain mana.
    take(lots.filter((l) => l.mana === m && l.from?.includes("snow")), paid.snow[m]);
    take([plainLot, ...lots.filter((l) => l.mana === m && !l.from?.includes("snow"))], spent[m] - paid.snow[m]);
  }
  if (p.manaLots) p.manaLots = p.manaLots.filter((l) => l.n > 0);
  if (!p.manaLots?.length) p.manaLots = undefined;
  return { ...paid, pool: { ...p.manaPool }, spent, treasure: from.treasure, from, ...(uncounterable ? { uncounterable: true as const } : {}), ...(spentTriggers.length ? { spentTriggers } : {}), ...(haste ? { haste } : {}), ...(commanderCounters ? { commanderCounters } : {}) };
}

/**
 * A mana ability's "spend this mana only ..." for the mana `o` makes now: "of the chosen type" is the type chosen for
 * `o` (Unclaimed Territory), and mana of different types is kept apart. With none chosen, it can't be spent that way.
 */
export function boundSpend(o: GameObject, only: ManaSpend): ManaSpend;
export function boundSpend(o: GameObject, only: ManaSpend | undefined): ManaSpend | undefined;
export function boundSpend(o: GameObject, only: ManaSpend | undefined): ManaSpend | undefined {
  const abilities = typeof only?.abilities === "object" ? only.abilities : undefined;
  if (only?.spells?.chosen === "color")
    // With no color chosen, no spell is of it: colorless and white at once.
    return { ...only, spells: o.chosen?.color ? bindChosen(only.spells, o.chosen) : { ...only.spells, chosen: undefined, colorCount: "colorless", colors: ["W"] }, text: `${only.text.replace(/\.$/, "")} (${o.chosen?.color ?? "none chosen"}).` };
  if (!only || (only.spells?.chosen !== "type" && abilities?.chosen !== "type")) return only;
  return {
    ...only,
    ...(only.spells ? { spells: bindChosen(only.spells, o.chosen) } : {}),
    ...(abilities ? { abilities: bindChosen(abilities, o.chosen) } : {}),
    text: `${only.text.replace(/\.$/, "")} (${o.chosen?.type ?? "none chosen"}).`,
  };
}

/**
 * Add mana to `pid`'s pool (CR 106.4): restricted if `only` says how it can be spent (106.6), `from` what its source was
 * (106.3), `keep` if it isn't lost as steps end (until end of turn, or until end of combat for firebending).
 */
export function addMana(s: GameState, pid: PlayerId, mana: ManaType[], how: { only?: ManaSpend; from?: ManaOrigin[]; keep?: ManaLot["keep"]; spentTrigger?: ManaSpentTrigger; haste?: ManaLot["haste"]; commanderCounters?: true } = {}): void {
  const p = s.players[pid]!;
  const from = how.from?.length ? [...new Set(how.from)].sort() : undefined;
  const trig = (t: ManaSpentTrigger | undefined) => (t ? `${t.sourceId}#${t.sourceZc}` : "");
  for (const m of mana) {
    p.manaPool[m]++;
    if (!how.only && !from && !how.keep && !how.spentTrigger && !how.haste && !how.commanderCounters) continue;
    const same = p.manaLots?.find((l) => l.mana === m && l.only?.text === how.only?.text && (l.from ?? []).join() === (from ?? []).join() && l.keep === how.keep && trig(l.spentTrigger) === trig(how.spentTrigger) && l.haste === how.haste && l.commanderCounters === how.commanderCounters);
    if (same) same.n++;
    else (p.manaLots ??= []).push({ mana: m, n: 1, ...(how.only ? { only: how.only } : {}), ...(from ? { from } : {}), ...(how.keep ? { keep: how.keep } : {}), ...(how.spentTrigger ? { spentTrigger: how.spentTrigger } : {}), ...(how.haste ? { haste: how.haste } : {}), ...(how.commanderCounters ? { commanderCounters: true as const } : {}) });
  }
}

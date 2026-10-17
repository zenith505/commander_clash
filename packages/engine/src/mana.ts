import { COLORS, type Color, type ManaType, type SpentMana } from "./types";

/** One symbol of a mana cost, normalized. CR 107.4 */
export type CostSymbol =
  | { kind: "generic"; amount: number }
  | { kind: "colored"; color: ManaType } // includes {C}
  | { kind: "hybrid"; options: Color[] } // {W/U}
  | { kind: "twoHybrid"; color: Color } // {2/W}
  | { kind: "phyrexian"; color: Color } // {W/P}
  | { kind: "x" }
  /** {S}: one mana of any type produced by a snow source (CR 107.4h). Not generic for cost reductions (118.7g). */
  | { kind: "snow" }
  | { kind: "unsupported"; raw: string };

export interface ParsedCost {
  symbols: CostSymbol[];
  hasX: boolean;
  supported: boolean;
}

const isColor = (s: string): s is Color => (COLORS as readonly string[]).includes(s);

export function parseManaCost(cost: string): ParsedCost {
  const symbols: CostSymbol[] = [];
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const raw = m[1]!;
    const parts = raw.split("/");
    if (/^\d+$/.test(raw)) symbols.push({ kind: "generic", amount: Number(raw) });
    else if (raw === "X") symbols.push({ kind: "x" });
    else if (raw === "S") symbols.push({ kind: "snow" });
    else if (raw === "C" || isColor(raw)) symbols.push({ kind: "colored", color: raw as ManaType });
    else if (parts.length === 2 && parts[1] === "P" && isColor(parts[0]!)) symbols.push({ kind: "phyrexian", color: parts[0] });
    else if (parts.length === 2 && parts[0] === "2" && isColor(parts[1]!)) symbols.push({ kind: "twoHybrid", color: parts[1] });
    else if (parts.length === 2 && isColor(parts[0]!) && isColor(parts[1]!)) symbols.push({ kind: "hybrid", options: [parts[0], parts[1]] });
    else symbols.push({ kind: "unsupported", raw });
  }
  return {
    symbols,
    hasX: symbols.some((s) => s.kind === "x"),
    supported: !symbols.some((s) => s.kind === "unsupported"),
  };
}

export type ManaPool = Record<ManaType, number>;
export const emptyPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
export const poolTotal = (p: ManaPool) => Object.values(p).reduce((a, b) => a + b, 0);

export interface Payment {
  pool: ManaPool; // pool after paying
  lifePaid: number;
  /** The mana from snow sources it spent, by type (CR 107.4h). */
  snow: ManaPool;
}

/**
 * Try to pay `cost` (+ `extraGeneric`, e.g. commander tax) from `pool`.
 * Returns the remaining pool, or null if it can't be paid. Pays the most constrained
 * symbols first so a greedy pass doesn't spend mana a later symbol needed.
 * Phyrexian symbols fall back to 2 life when `life` allows.
 */
export function payFromPool(cost: ParsedCost, pool: ManaPool, extraGeneric = 0, life = Infinity, opts: { spreadColors?: boolean; prefer?: ManaPool; want?: Partial<Record<Color, number>>; avoid?: Partial<Record<Color, number>>; snow?: ManaPool; wantSnow?: boolean } = {}): Payment | null {
  if (!cost.supported) return null;
  const p = { ...pool };
  // `prefer`: mana to spend before the rest where there's a choice (mana that can only be spent on this, CR 106.6).
  const pref = { ...(opts.prefer ?? emptyPool()) };
  // `snow`: how much of the pool a snow source made (CR 107.4h). Other symbols spend other mana first, unless the
  // caster hopes to spend snow mana on it (`wantSnow`: "if {S} was spent", "the amount of {S} spent").
  const sn = emptyPool();
  for (const m of Object.keys(sn) as ManaType[]) sn[m] = Math.max(0, Math.min(opts.snow?.[m] ?? 0, p[m]));
  const snowUsed = emptyPool();
  const takeSnow = (c: ManaType) => {
    sn[c]--;
    snowUsed[c]++;
  };
  const spend = (c: ManaType) => {
    if (sn[c] > 0 && (opts.wantSnow || p[c] <= sn[c])) takeSnow(c);
    p[c]--;
    if (pref[c] > 0) pref[c]--;
  };
  let generic = extraGeneric;
  let lifePaid = 0;
  const hybrids: Color[][] = [];
  const twoHybrids: Color[] = [];
  const phyrexian: Color[] = [];
  // {S} first, each from the snow mana the rest of the cost needs least: restricted mana that may be spent on this, {C},
  // then the color there's most of to spare.
  const named = emptyPool();
  for (const sym of cost.symbols) if (sym.kind === "colored" || sym.kind === "phyrexian") named[sym.color]++;
  for (const sym of cost.symbols) {
    if (sym.kind !== "snow") continue;
    const from = (["C", ...COLORS] as ManaType[]).filter((c) => sn[c] > 0).sort((a, b) => Number(pref[b] > 0) - Number(pref[a] > 0) || Number(b === "C") - Number(a === "C") || p[b] - named[b] - (p[a] - named[a]))[0];
    if (!from) return null;
    takeSnow(from);
    p[from]--;
    if (pref[from] > 0) pref[from]--;
  }
  for (const s of cost.symbols) {
    if (s.kind === "generic") generic += s.amount;
    else if (s.kind === "colored") {
      if (p[s.color] <= 0) return null;
      spend(s.color);
    } else if (s.kind === "hybrid") hybrids.push(s.options);
    else if (s.kind === "twoHybrid") twoHybrids.push(s.color);
    else if (s.kind === "phyrexian") phyrexian.push(s.color);
    // X is chosen as 0 for now.
  }
  // `want`: how much of each color the spell hopes was spent on it ("if {U} was spent to cast ~", adamant): the caster
  // chooses which mana pays (CR 601.2h), so a hybrid or generic part takes those colors while they're short.
  const wanting = (c: Color) => (opts.want?.[c] ?? 0) > pool[c] - p[c];
  // `avoid`: what spending each color would cost the caster (Rolling Spoil's "if {B} was spent", hurting them now): kept
  // for last, the least costly first.
  const harm = (c: ManaType) => (c === "C" ? 0 : (opts.avoid?.[c] ?? 0));
  for (const opts of hybrids) {
    const best = opts.filter((c) => p[c] > 0).sort((a, b) => Number(wanting(b)) - Number(wanting(a)) || harm(a) - harm(b) || pref[b] - pref[a] || p[b] - p[a])[0];
    if (!best) return null;
    spend(best);
  }
  for (const c of phyrexian) {
    if (p[c] > 0) spend(c);
    else if (life - lifePaid >= 2) lifePaid += 2;
    else return null;
  }
  for (const c of twoHybrids) {
    if (p[c] > 0) spend(c);
    else generic += 2;
  }
  // Generic: spend colorless first, then whichever color we have most of. With `spreadColors` (sunburst, which counts
  // the colors spent, CR 702.44a), a color not spent yet comes first: the caster chooses what pays for it (CR 601.2h).
  // Hoping for snow mana, snow mana comes first of all.
  const spent = (c: ManaType) => p[c] < pool[c];
  const kinds: ManaType[] = ["C", ...COLORS];
  while (generic > 0) {
    const snowy = opts.wantSnow ? kinds.filter((c) => sn[c] > 0).sort((a, b) => harm(a) - harm(b) || sn[b] - sn[a])[0] : undefined;
    const fresh = COLORS.find((c) => p[c] > 0 && wanting(c)) ?? (opts.spreadColors ? COLORS.filter((c) => p[c] > 0 && !spent(c))[0] : undefined);
    const preferred = kinds.filter((c) => pref[c] > 0 && p[c] > 0).sort((a, b) => pref[b] - pref[a])[0];
    const from: ManaType | undefined =
      fresh ?? snowy ?? preferred ?? (p.C > 0 ? "C" : (COLORS.filter((c) => p[c] > 0).sort((a, b) => harm(a) - harm(b) || p[b] - p[a])[0] as ManaType | undefined));
    if (!from) return null;
    spend(from);
    generic--;
  }
  return { pool: p, lifePaid, snow: snowUsed };
}

/** How many {X} a cost has: {X}{X} means paying X twice (CR 107.3). */
export const xCount = (cost: ParsedCost) => cost.symbols.filter((sym) => sym.kind === "x").length;

/** Why `x` isn't a value X can have for this cost, or null (CR 107.3a; X is a whole number, CR 107.1). */
export function xProblem(cost: ParsedCost, x: number | undefined): string | null {
  if (x === undefined || x === 0) return null;
  if (!cost.hasX) return "this has no X to choose";
  if (!Number.isInteger(x) || x < 0) return "X must be a whole number, 0 or more";
  return null;
}

/** Mana value of a cost (X counts as 0 off the stack). CR 202.3 */
export function manaValue(cost: ParsedCost): number {
  let n = 0;
  for (const s of cost.symbols) {
    if (s.kind === "generic") n += s.amount;
    else if (s.kind === "twoHybrid") n += 2;
    else if (s.kind !== "x" && s.kind !== "unsupported") n += 1;
  }
  return n;
}

/**
 * Convoke (CR 702.51a): each tapped creature pays for one generic mana or one mana of its
 * color. It applies to the total cost, commander tax included (CR 702.51b), so `extraGeneric`
 * is folded in. Every creature must pay for something. Returns what's left to pay, or null if
 * these creatures can't all be used. Colored symbols are matched first (a maximum matching,
 * so a two-color creature doesn't take a symbol only another could pay), the rest pay generic.
 */
export function convokeReduce(cost: ParsedCost, extraGeneric: number, creatureColors: Color[][]): ParsedCost | null {
  if (!cost.supported) return null;
  // Symbols a creature can pay as colored mana; {C} needs colorless mana, which no creature's color is.
  const slots: { i: number; colors: Color[] }[] = [];
  cost.symbols.forEach((sym, i) => {
    if (sym.kind === "colored" && sym.color !== "C") slots.push({ i, colors: [sym.color] });
    else if (sym.kind === "phyrexian" || sym.kind === "twoHybrid") slots.push({ i, colors: [sym.color] });
    else if (sym.kind === "hybrid") slots.push({ i, colors: sym.options });
  });
  const slotOwner: (number | undefined)[] = slots.map(() => undefined);
  const augment = (c: number, seen: Set<number>): boolean => {
    for (let k = 0; k < slots.length; k++) {
      if (seen.has(k) || !slots[k]!.colors.some((col) => creatureColors[c]!.includes(col))) continue;
      seen.add(k);
      if (slotOwner[k] === undefined || augment(slotOwner[k]!, seen)) {
        slotOwner[k] = c;
        return true;
      }
    }
    return false;
  };
  let unmatched = 0;
  creatureColors.forEach((_, c) => {
    if (!augment(c, new Set())) unmatched++;
  });
  const genericTotal = cost.symbols.reduce((n, sym) => n + (sym.kind === "generic" ? sym.amount : 0), extraGeneric);
  if (unmatched > genericTotal) return null;
  const paid = new Set(slots.flatMap((slot, k) => (slotOwner[k] !== undefined ? [slot.i] : [])));
  const symbols = cost.symbols.filter((sym, i) => sym.kind !== "generic" && !paid.has(i));
  if (genericTotal - unmatched > 0) symbols.unshift({ kind: "generic", amount: genericTotal - unmatched });
  return { symbols, hasX: cost.hasX, supported: true };
}

/** A cost with all its generic mana gathered into `extra`, the way the total cost is figured (CR 601.2f). */
export function splitGeneric(cost: ParsedCost, extra: number): { cost: ParsedCost; extra: number } {
  const generic = cost.symbols.reduce((n, sym) => n + (sym.kind === "generic" ? sym.amount : 0), extra);
  return { cost: { ...cost, symbols: cost.symbols.filter((sym) => sym.kind !== "generic") }, extra: generic };
}

/**
 * Pay `n` of the generic mana another way: improvise's tapped artifacts (CR 702.126a). Each must pay
 * for one generic mana, so null if there's less generic mana than that.
 */
export function payGenericWith(cost: ParsedCost, extra: number, n: number): { cost: ParsedCost; extra: number } | null {
  const g = splitGeneric(cost, extra);
  return n > g.extra ? null : { cost: g.cost, extra: g.extra - n };
}

/**
 * The mana spent to cast a spell, by type (CR 601.2h), and how much of it a snow source made (`snow`, CR 107.4h); nothing
 * at all for a copy or a spell cast without paying mana.
 */
export type ManaSpent = SpentMana;

/** Does the mana spent to cast a spell meet "if {U} was spent", adamant's "at least three ...", "no mana was spent", "if {S} was spent"? */
export function spentMeets(spent: ManaSpent | undefined, req: import("./abilities").SpentReq, spellColors?: readonly Color[]): boolean {
  const of = (m: ManaType) => spent?.[m] ?? 0;
  const colored = COLORS.reduce((n, c) => n + of(c), 0);
  const total = colored + of("C");
  if (req.none) return (req.none === "colored" ? colored : total) === 0;
  if (req.colors && Object.entries(req.colors).some(([c, n]) => of(c as Color) < (n ?? 1))) return false;
  if (req.sameColor && !COLORS.some((c) => of(c) >= req.sameColor!)) return false;
  if (req.colorless && of("C") < req.colorless) return false;
  if (req.maxColors !== undefined && COLORS.filter((c) => of(c) > 0).length > req.maxColors) return false;
  if (req.snow && snowSpent(spent) < req.snow) return false;
  // "If {S} of any of that spell's colors was spent to cast it" (Boreal Outrider).
  if (req.snowOfColors && !(spellColors ?? []).some((c) => (spent?.snow?.[c] ?? 0) > 0)) return false;
  if (req.from && Object.entries(req.from).some(([k, n]) => (spent?.from?.[k as "creature"] ?? 0) < (n ?? 1))) return false;
  return !req.total || total >= req.total;
}

/** "The amount of {S} spent to cast ~": the mana from snow sources spent on it (CR 107.4h). */
export const snowSpent = (spent: ManaSpent | undefined): number => Object.values(spent?.snow ?? {}).reduce((a, b) => a + (b ?? 0), 0);

/**
 * A cost reduced by an amount of mana written as a mana cost ("reduced by this permanent's mana cost", power-up, CR
 * 702.193b, 118.7): each colored or colorless symbol takes off a symbol of its type, or a hybrid or Phyrexian symbol
 * that can be paid with it (the half is chosen as the reduction applies, CR 118.7e, Morophon rulings); when the cost
 * has none, it takes off one generic mana (118.7b-d). A hybrid symbol in the reduction picks a half the cost has
 * (118.7e), a Phyrexian one reduces by its color (118.7f), {S} by one generic (118.7g) and {2/W} by two generic, and X
 * is 0 (107.3b). Generic reductions apply last and only to generic mana (118.7a).
 */
export function reduceByManaCost(cost: ParsedCost, by: ParsedCost): ParsedCost {
  const symbols = [...cost.symbols];
  let generic = 0;
  // The symbol of the cost a mana of one of `colors` can stand for: one of exactly that type first.
  const take = (colors: readonly ManaType[]): boolean => {
    let i = symbols.findIndex((sym) => sym.kind === "colored" && colors.includes(sym.color));
    if (i < 0) i = symbols.findIndex((sym) => (sym.kind === "hybrid" && sym.options.some((c) => colors.includes(c))) || ((sym.kind === "phyrexian" || sym.kind === "twoHybrid") && colors.includes(sym.color)));
    if (i < 0) return false;
    symbols.splice(i, 1);
    return true;
  };
  for (const sym of by.symbols) {
    if (sym.kind === "generic") generic += sym.amount;
    else if (sym.kind === "colored" || sym.kind === "phyrexian") generic += take([sym.color]) ? 0 : 1;
    else if (sym.kind === "hybrid") generic += take(sym.options) ? 0 : 1;
    else if (sym.kind === "twoHybrid") generic += 2;
    else if (sym.kind === "snow") generic += 1;
  }
  const g = splitGeneric({ ...cost, symbols }, 0);
  const left = Math.max(0, g.extra - generic);
  return { ...g.cost, symbols: [...(left ? [{ kind: "generic" as const, amount: left }] : []), ...g.cost.symbols] };
}

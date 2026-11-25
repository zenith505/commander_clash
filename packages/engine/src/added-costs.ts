// Round B260: costs that static abilities add to other spells and abilities: Brutal Suppression's "Activated abilities of
// nontoken Rebels cost an additional "Sacrifice a land" to activate." and Drought's "Spells cost an additional "Sacrifice a
// Swamp" to cast for each black mana symbol in their mana costs." (and the same for activation costs). CR 601.2f, 602.2b:
// additional costs are part of the total cost, paid as the spell is cast or the ability activated (CR 601.2h); a player who
// can't pay them can't cast or activate it.
import type { AdditionalCost, AddedCostRule, TargetSpec } from "./abilities";
import { abilitiesOf, canSacrificeForCost } from "./cards";
import { objectMatches } from "./effects/targeting";
import { controllerOf } from "./layers";
import type { Color, GameObject, GameState, ObjectId, PlayerId } from "./types";

/**
 * How many black mana symbols a mana cost has (Drought): {B}, the hybrids with black ({B/G}, {2/B}) and Phyrexian black
 * ({B/P}), each one (rulings: "A hybrid symbol that is both black and another type is a black mana symbol, regardless of
 * what cost is paid for it"). {X} and generic mana aren't black (CR 107.4, 105.2).
 */
export function blackSymbols(cost: string | undefined, color: Color = "B"): number {
  return [...(cost ?? "").matchAll(/\{([^}]+)\}/g)].filter((m) => m[1]!.includes(color)).length;
}

const plural = (t: string) => (t === "land" ? "lands" : /s$/.test(t) ? t : `${t}s`);

/**
 * The sacrifices added by every such rule now, merged into one cost (CostChoices.addedSacrifice): the permanents for it
 * are all different ones (a land that's a Swamp pays for only one of them, as for Jarad's "a Swamp and a Forest"), and
 * none of them is one the spell's or ability's own costs sacrifice. `count` says how many each rule asks for.
 */
function merged(s: GameState, what: AddedCostRule["what"], count: (r: AddedCostRule) => number): AdditionalCost[] {
  const specs: TargetSpec[] = [];
  if (!anyAddedCosts(s)) return [];
  for (const id of s.battlefield) {
    const o = s.objects[id];
    if (!o) continue;
    for (const r of abilitiesOf(s, o).addedCosts ?? []) {
      if (r.what !== what) continue;
      const n = count(r);
      for (let i = 0; i < n; i++) specs.push(r.sacrifice);
    }
  }
  if (!specs.length) return [];
  const texts = [...new Set(specs.map((f) => f.text))];
  if (texts.length === 1) {
    const f = specs[0]!;
    return [{ kind: "sacrifice", filter: { ...f, text: specs.length > 1 ? plural(f.text) : f.text }, n: specs.length, added: true }];
  }
  // Brutal Suppression's land and Drought's Swamps together: what can pay for any of them (every Swamp is a land, CR 205.3i),
  // then one for each.
  const land = specs.find((f) => !!f.types?.includes("Land") && !f.subtypes?.length);
  const subtypes = [...new Set(specs.flatMap((f) => f.subtypes ?? []))];
  const filter: TargetSpec = land ? { ...land } : { kind: "object", types: [], notTypes: [], notColors: [], subtypes, text: subtypes.join(" or ") };
  const counts = texts.map((t) => [t, specs.filter((f) => f.text === t).length] as const);
  filter.text = counts.map(([t, n]) => (n === 1 ? t : `${n} ${plural(t)}`)).join(" and ");
  return [{ kind: "sacrifice", filter, n: specs.length, added: true, oneOfEach: specs }];
}

/**
 * The costs other permanents' static abilities add to activating an ability of `src` with this activation mana cost
 * (`manaCost`, its symbols as printed, CR 602.1a): Brutal Suppression's for a nontoken Rebel permanent's (CR 109.2: "Rebels"
 * are permanents), mana abilities too (CR 605.1a); Drought's for each black mana symbol, from any zone (cycling, ninjutsu).
 * `sacrificedSelf`: the ability also sacrifices its source, which then can't pay for these too.
 */
export function addedAbilityCosts(s: GameState, pid: PlayerId, src: GameObject | undefined, manaCost: string | undefined, sacrificedSelf = false): AdditionalCost[] {
  const out = merged(s, "abilities", (r) => {
    // Another color than black after a text change of color words (AddedCostRule perColor, round 462).
    if (r.perBlack) return blackSymbols(manaCost, r.perColor);
    if (!r.source) return 1;
    return src && src.zone === "battlefield" && objectMatches(s, r.source, src, pid, false) ? 1 : 0;
  });
  return sacrificedSelf ? out.map((c) => (c.kind === "sacrifice" ? { ...c, other: true } : c)) : out;
}

/**
 * The costs other permanents' static abilities add to casting a spell with this mana cost (Drought: for each black mana
 * symbol in it, CR 202.1; a face-down spell has none, CR 708.2). Paid however the spell is cast, without paying its mana cost
 * too (CR 118.9d: additional costs still apply).
 */
export function addedSpellCosts(s: GameState, manaCost: string | undefined): AdditionalCost[] {
  return merged(s, "spells", (r) => (r.perBlack ? blackSymbols(manaCost, r.perColor) : 1));
}

/**
 * What can pay such a sacrifice: permanents `pid` controls that fit it and can be sacrificed (CR 701.21a), not the source
 * when it sacrifices itself too (`other`).
 */
export function addedSacrificeCandidates(s: GameState, pid: PlayerId, src: GameObject | undefined, c: Extract<AdditionalCost, { kind: "sacrifice" }>): ObjectId[] {
  return s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    return controllerOf(s, o) === pid && !(c.other && id === src?.id) && objectMatches(s, c.filter, o, pid, false) && canSacrificeForCost(s, o);
  });
}

/** Can these permanents, all different, pay one each of `specs` (Brutal Suppression's land and Drought's Swamps)? */
export function fitsEach(s: GameState, pid: PlayerId, specs: TargetSpec[], ids: ObjectId[]): boolean {
  const [f, ...rest] = specs;
  return !f || ids.some((id) => objectMatches(s, f, s.objects[id]!, pid, false) && fitsEach(s, pid, rest, ids.filter((x) => x !== id)));
}

/**
 * Whether such a sacrifice can be paid (no pick: whether there's enough), or this pick pays it: `n` different permanents
 * from the candidates, one for each when they differ, none of `taken` (permanents another cost of it uses).
 */
export function addedSacrificeProblem(s: GameState, pid: PlayerId, src: GameObject | undefined, c: Extract<AdditionalCost, { kind: "sacrifice" }>, chosen?: ObjectId[], taken: ObjectId[] = []): string | null {
  const pool = addedSacrificeCandidates(s, pid, src, c).filter((id) => !taken.includes(id));
  const what = `${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : ""}${c.n === 1 ? " " : ""}${c.oneOfEach || c.n === 1 ? c.filter.text : `${c.n} ${c.filter.text}`}`;
  const fits = (ids: ObjectId[]) => (c.oneOfEach ? fitsEach(s, pid, c.oneOfEach, ids) : ids.length >= c.n);
  if (!chosen) return fits(pool) ? null : `you need to sacrifice ${what}`;
  if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id)) || !fits(chosen)) return `choose ${what} to sacrifice`;
  return null;
}

/** A pick that pays it, for the legal actions list and plans made without one: the first fit (null when none does). */
export function anyAddedSacrifice(s: GameState, pid: PlayerId, src: GameObject | undefined, c: Extract<AdditionalCost, { kind: "sacrifice" }>, taken: ObjectId[] = []): ObjectId[] | null {
  // Tapped ones first: their mana may be paying for it already.
  const pool = addedSacrificeCandidates(s, pid, src, c).filter((id) => !taken.includes(id)).sort((a, b) => Number(!!s.objects[b]!.tapped) - Number(!!s.objects[a]!.tapped));
  const specs = c.oneOfEach ?? Array.from({ length: c.n }, () => c.filter);
  const picked: ObjectId[] = [];
  const go = (i: number): boolean => {
    if (i === specs.length) return true;
    for (const id of pool) {
      if (picked.includes(id) || !objectMatches(s, specs[i]!, s.objects[id]!, pid, false)) continue;
      picked.push(id);
      if (go(i + 1)) return true;
      picked.pop();
    }
    return false;
  };
  return go(0) ? picked : null;
}

/** Is there any permanent with such a rule? (A quick check before looking at each ability.) */
export function anyAddedCosts(s: GameState): boolean {
  return s.battlefield.some((id) => !!s.objects[id] && !!abilitiesOf(s, s.objects[id]!).addedCosts?.length);
}

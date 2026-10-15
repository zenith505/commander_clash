import { abilitiesOf, bestowedDef, prototypedDef, defOf, FACE_DOWN, objIsType, power } from "./cards";
import { manaAbilitiesOn, manaAbilityProblem, manaActionAbility, manaOptions, manaPenalty } from "./manaabilities";
import { characteristics, controllerOf } from "./layers";
import { abilityProblem, activationCost, castProblem, crewCandidates, crewPower, faceUpCost, isSummoningSick, obj, player, spellCost, suspendProblem, plotProblem, foretellProblem, tapCostCandidates, turnFaceUpProblem } from "./game";
import { compileCard } from "./oracle";
import { poolFor, spendAllows, type ManaUse } from "./spend";
import type { TargetChoice } from "./abilities";
import { convokeReduce, manaValue, parseManaCost, payFromPool, payGenericWith, splitGeneric, xCount, type ManaPool, type ParsedCost } from "./mana";
import { COLORS, type Action, type CardDef, type CostChoices, type GameObject, type GameState, type ManaType, type ObjectId, type PlayerId } from "./types";

/** One way to make mana with a permanent, for planning. */
interface Option {
  id: ObjectId;
  ability: number;
  mana: ManaType;
  adds: ManaType[];
  /** The mana picked for the triggered mana abilities it triggers. */
  extra?: ManaType[];
  /** The mana part of its cost, if any (a Signet's {1}). */
  cost: ParsedCost | null;
  penalty: number;
  /** "Tap an untapped creature you control": how many, and what could pay it, the best to tap first. */
  tapCost?: { n: number; candidates: ObjectId[] };
  /** What it taps for that cost, once it's chosen to be used. */
  taps?: ObjectId[];
  /** Its mana can only be spent some ways (CR 106.6), here on what's being paid for. */
  restricted?: boolean;
}

interface Source {
  id: ObjectId;
  options: Option[];
  /** How many colors its free options can make: less flexible sources get used first. */
  colors: number;
}

function manaSources(s: GameState, pid: PlayerId, exclude: ObjectId[], use: ManaUse): Source[] {
  // Current controller, types and mana abilities, after continuous effects (CR 613).
  const isCreature = (id: string) => objIsType(s, obj(s, id), "Creature");
  return s.battlefield
    .filter((id) => !exclude.includes(id))
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid)
    .map((o) => {
      const abs = manaAbilitiesOn(s, o);
      const options = manaOptions(s, o)
        // Mana that can't be spent on this is no help (CR 106.6).
        .filter((x) => x.adds.length > 0 && !manaAbilityProblem(s, pid, o, x.ability, true) && (!abs[x.ability]!.spendOnly || spendAllows(s, pid, abs[x.ability]!.spendOnly!, use)))
        .map((x) => {
          const ab = abs[x.ability]!;
          const tapCost = ab.tapCost && { n: ab.tapCost.n, candidates: tapPreference(s, tapCostCandidates(s, pid, o, ab.tapCost).filter((id) => !exclude.includes(id))) };
          return { id: o.id, ...x, cost: ab.manaCost ? parseManaCost(ab.manaCost) : null, penalty: manaPenalty(ab), ...(tapCost ? { tapCost } : {}), ...(ab.spendOnly ? { restricted: true } : {}) };
        });
      return { id: o.id, options, colors: new Set(options.filter((x) => !x.cost).flatMap((x) => x.adds)).size };
    })
    .filter((src) => src.options.length > 0)
    // Prefer tapping lands, then the least flexible sources, so creatures and rainbow sources stay available.
    .sort((a, b) => Number(isCreature(a.id)) - Number(isCreature(b.id)) || a.colors - b.colors);
}

const toAction = (pid: PlayerId, x: Option): Action => ({ type: "activateMana", player: pid, objectId: x.id, mana: x.mana, ability: x.ability, ...(x.taps ? { tap: x.taps } : {}), ...(x.extra ? { extra: x.extra } : {}) });

/**
 * What to tap for "Tap an untapped creature you control", best first: what makes no mana itself, then what's
 * summoning sick (it couldn't attack anyway), then the smallest.
 */
function tapPreference(s: GameState, ids: ObjectId[]): ObjectId[] {
  const key = (id: ObjectId) => {
    const o = obj(s, id);
    return (manaAbilitiesOn(s, o).length ? 100 : 0) + (objIsType(s, o, "Creature") && !isSummoningSick(s, o) ? 10 : 0) + Math.max(0, power(s, o));
  };
  return [...ids].sort((a, b) => key(a) - key(b));
}

/** The permanents an option would tap for its cost, given what's already used, or null if there aren't enough. */
function tapsFor(x: Option, used: Set<ObjectId>): ObjectId[] | null {
  if (!x.tapCost) return [];
  const free = x.tapCost.candidates.filter((id) => !used.has(id) && id !== x.id);
  return free.length >= x.tapCost.n ? free.slice(0, x.tapCost.n) : null;
}

/** Colors a cost asks for by name (its colored, hybrid and Phyrexian symbols). */
function namedColors(cost: ParsedCost): Set<ManaType> {
  const out = new Set<ManaType>();
  for (const sym of cost.symbols) {
    if (sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid") out.add(sym.color);
    if (sym.kind === "hybrid") sym.options.forEach((c) => out.add(c));
  }
  return out;
}

/**
 * Pay `cost` with mana abilities that cost no mana, on top of `pool`. Greedy: each colored
 * symbol from the least flexible source that makes it, then hybrid, then generic, keeping
 * sources that make the colors in `avoid` for last.
 */
function planFree(cost: ParsedCost, extraGeneric: number, life: number, pool0: ManaPool, sources: Source[], used0: Set<ObjectId>, avoid = new Set<ManaType>()) {
  const pool = { ...pool0 };
  const used = new Set(used0);
  const chosen: Option[] = [];
  const reserved = { ...pool };
  const take = (x0: Option) => {
    const taps = tapsFor(x0, used) ?? [];
    const x = taps.length ? { ...x0, taps } : x0;
    used.add(x.id);
    for (const id of taps) used.add(id);
    chosen.push(x);
    for (const m of x.adds) {
      pool[m]++;
      reserved[m]++;
    }
  };
  // Colored mana the cost names: of two ways to use one source (Fertile Ground's "GW" and "GU"), the one adding more of it.
  const named = namedColors(cost);
  const useful = (x: Option) => x.adds.filter((m) => named.has(m)).length;
  const free = (pred: (x: Option) => boolean) =>
    sources
      .filter((src) => !used.has(src.id))
      .flatMap((src, order) => src.options.filter((x) => !x.cost && pred(x) && tapsFor(x, used)).map((x) => ({ x, order })))
      .sort((a, b) => a.x.penalty - b.x.penalty || a.order - b.order || useful(b.x) - useful(a.x))[0]?.x;
  for (const sym of cost.symbols) {
    if (sym.kind !== "colored" && sym.kind !== "phyrexian" && sym.kind !== "twoHybrid") continue;
    const c = sym.color;
    if (reserved[c] <= 0) {
      const x = free((o) => o.adds.includes(c));
      if (x) take(x);
    }
    if (reserved[c] > 0) reserved[c]--;
  }
  for (const sym of cost.symbols) {
    if (sym.kind !== "hybrid") continue;
    const opts = sym.options as ManaType[];
    let have = opts.find((c) => reserved[c] > 0);
    if (!have) {
      const x = free((o) => o.adds.some((m) => opts.includes(m)));
      if (x) take(x);
      have = opts.find((c) => reserved[c] > 0);
    }
    if (have) reserved[have]--;
  }
  for (let guard = 0; guard < 60 && !payFromPool(cost, pool, extraGeneric, life); guard++) {
    // Most mana for the least given up, colorless first, sources making colors we still need last.
    const best = sources
      .filter((src) => !used.has(src.id))
      .flatMap((src, order) => src.options.filter((x) => !x.cost && tapsFor(x, used)).map((x) => ({ x, order })))
      .sort(
        (a, b) =>
          a.x.penalty - b.x.penalty ||
          Number(a.x.adds.some((m) => avoid.has(m))) - Number(b.x.adds.some((m) => avoid.has(m))) ||
          b.x.adds.length - a.x.adds.length ||
          Number(b.x.mana === "C") - Number(a.x.mana === "C") ||
          a.order - b.order,
      )[0]?.x;
    if (!best) return null;
    take(best);
  }
  return payFromPool(cost, pool, extraGeneric, life) ? { chosen, pool, used } : null;
}

/**
 * Work out which mana abilities to activate so `pid` can cast `objectId`, and return
 * the full action sequence (taps followed by the cast). Returns null if it can't be paid
 * or can't be cast right now. Spells that target need `targets`.
 *
 * `convoke`: creatures to tap for convoke (CR 702.51a), or "auto" to add creatures only when
 * mana sources alone can't pay (see autoConvoke).
 */
export function planCast(
  s: GameState,
  pid: PlayerId,
  objectId: ObjectId,
  targets?: TargetChoice[],
  modes?: number[],
  convoke?: ObjectId[] | "auto",
  x?: number,
  choices: CostChoices = {},
): Action[] | null {
  const o = obj(s, objectId);
  const d = choices.faceDown ? FACE_DOWN : defOf(s, o);
  // The spell as it will be on the stack, for mana that can only be spent on some spells (CR 106.6).
  const use: ManaUse = { spell: choices.alt === "bestow" ? bestowedDef(d) : choices.alt === "prototype" ? prototypedDef(d) : d };
  const problem = castProblem(s, pid, objectId, targets, modes, undefined, undefined, x, choices);
  if (problem && !/not enough mana/.test(problem)) return null;
  let { cost, extra } = spellCost(s, pid, o, x, choices.kicks, { ...choices, targets });
  if (choices.delve?.length) {
    // Cards exiled for delve pay generic mana (CR 702.66a).
    const reduced = payGenericWith(cost, extra, choices.delve.length);
    if (!reduced) return null;
    ({ cost, extra } = reduced);
  }
  const paid = Object.fromEntries(Object.entries(choices).filter(([, v]) => (Array.isArray(v) ? v.length : v !== undefined && v !== false))) as CostChoices;
  const improvise = compileCard(d).improvise;
  const cast = (taps: Action[], creatures?: ObjectId[], artifacts?: ObjectId[]): Action[] => [
    ...taps,
    { type: "castSpell", player: pid, objectId, targets, ...(modes ? { modes } : {}), ...(creatures?.length ? { convoke: creatures } : {}), ...(artifacts?.length ? { improvise: artifacts } : {}), ...(x ? { x } : {}), ...paid },
  ];
  if (Array.isArray(convoke) && convoke.length) {
    const reduced = convokeReduce(cost, extra, convoke.map((id) => characteristics(s, obj(s, id)).colors));
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced, 0, undefined, convoke, use);
    if (taps) return cast(taps, convoke);
    const imp = improvise ? autoImprovise(s, pid, reduced, 0, convoke, use) : null;
    return imp ? cast(imp.taps, convoke, imp.artifacts) : null;
  }
  // "Costs {3} less if it targets a tapped creature" is worked out before mana abilities (CR 601.2f-g):
  // tapping the target for mana first mustn't make it count.
  const targetIds = compileCard(d).costLessIfTargets ? (targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])) : [];
  // Sunburst and converge count the colors of mana spent (CR 702.44a, 207.2c): pay its generic mana with as many other colors as we can.
  const pool = poolFor(s, pid, use).pool;
  const rainbow = compileCard(d).countsColors && !payFromPool(cost, pool, extra, player(s, pid).life) ? rainbowCosts(cost, extra, pool) : [];
  let taps: Action[] | null = null;
  for (const r of rainbow) if ((taps = planMana(s, pid, r.cost, r.extra, undefined, [...sacrificedTargets(s, targets), ...targetIds], use))) break;
  taps ??= planMana(s, pid, cost, extra, undefined, [...sacrificedTargets(s, targets), ...targetIds], use);
  // The total cost is locked in before mana abilities are activated (CR 601.2f-g), but here the mana
  // comes first: sacrificing a Treasure for mana would leave affinity for artifacts counting one fewer.
  // So when the cost depends on the board, don't sacrifice permanents for its mana.
  if (taps && costDependsOnBoard(s, d)) {
    const sacs = taps.flatMap((a) => (a.type === "activateMana" && manaActionAbility(s, a)?.sacrificeSelf ? [a.objectId] : []));
    if (sacs.length) taps = planMana(s, pid, cost, extra, undefined, [...sacs, ...sacrificedTargets(s, targets)], use);
  }
  if (taps) return cast(taps);
  if (convoke !== "auto") return null;
  // Tap artifacts for improvise, or creatures for convoke, only when mana alone can't pay.
  const imp = improvise ? autoImprovise(s, pid, cost, extra, [], use) : null;
  if (imp) return cast(imp.taps, undefined, imp.artifacts);
  if (!compileCard(d).convoke) return null;
  const auto = autoConvoke(s, pid, cost, extra, use);
  return auto ? cast(auto.taps, auto.creatures) : null;
}

/**
 * The cost with some of its generic mana asked for as colors it doesn't name, most colors first (and among those, the
 * ones using the mana already in the pool): paying that, the pool holds those colors when the spell is cast, and the
 * payment spends them (see payFromPool's spreadColors).
 */
function rainbowCosts(cost: ParsedCost, extra: number, pool: ManaPool): { cost: ParsedCost; extra: number }[] {
  const g = splitGeneric(cost, extra);
  const named = namedColors(cost);
  const fresh = COLORS.filter((c) => !named.has(c));
  const out: { cost: ParsedCost; extra: number }[] = [];
  for (let n = Math.min(g.extra, fresh.length); n > 0; n--)
    for (let mask = 0; mask < 1 << fresh.length; mask++) {
      const pick = fresh.filter((_, i) => mask & (1 << i));
      if (pick.length === n) out.push({ cost: { ...g.cost, symbols: [...g.cost.symbols, ...pick.map((color) => ({ kind: "colored" as const, color }))] }, extra: g.extra - n });
    }
  const inPool = (c: ParsedCost) => c.symbols.filter((sym) => sym.kind === "colored" && pool[sym.color] > 0).length;
  return out.sort((a, b) => a.extra - b.extra || inPool(b.cost) - inPool(a.cost));
}

/** Does what this spell costs depend on what's on the battlefield (affinity, "costs {1} less", Thalia)? */
function costDependsOnBoard(s: GameState, d: CardDef): boolean {
  const c = compileCard(d);
  return !!(c.costLess?.length || c.costLessIf?.length) || s.battlefield.some((id) => !!compileCard(defOf(s, obj(s, id))).costMods);
}

/**
 * Artifacts to improvise with (CR 702.126a) when mana sources can't pay alone: ones that don't
 * make mana first, then noncreatures. Each pays for one generic mana.
 */
export function autoImprovise(s: GameState, pid: PlayerId, cost: ParsedCost, extra: number, exclude: ObjectId[], use: ManaUse = "other"): { artifacts: ObjectId[]; taps: Action[] } | null {
  const candidates = s.battlefield
    .map((id) => obj(s, id))
    .filter((a) => controllerOf(s, a) === pid && !a.tapped && !exclude.includes(a.id) && objIsType(s, a, "Artifact"))
    .sort((a, b) => Number(manaOptions(s, a).length > 0) - Number(manaOptions(s, b).length > 0) || Number(objIsType(s, a, "Creature")) - Number(objIsType(s, b, "Creature")));
  const chosen: ObjectId[] = [];
  for (const a of candidates) {
    chosen.push(a.id);
    const reduced = payGenericWith(cost, extra, chosen.length);
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced.cost, reduced.extra, undefined, [...exclude, ...chosen], use);
    if (taps) return { artifacts: chosen, taps };
  }
  return null;
}

/**
 * Pick creatures to convoke with when mana sources can't pay alone: ones that can't attack
 * this turn first (summoning sick), then the smallest. Each must pay for some mana.
 */
export function autoConvoke(s: GameState, pid: PlayerId, cost: ParsedCost, tax: number, use: ManaUse = "other"): { creatures: ObjectId[]; taps: Action[] } | null {
  const candidates = s.battlefield
    .map((id) => obj(s, id))
    .filter((c) => controllerOf(s, c) === pid && !c.tapped && objIsType(s, c, "Creature"))
    .sort((a, b) => Number(isSummoningSick(s, b)) - Number(isSummoningSick(s, a)) || power(s, a) - power(s, b));
  const chosen: ObjectId[] = [];
  for (;;) {
    const reduced = convokeReduce(cost, tax, chosen.map((id) => characteristics(s, obj(s, id)).colors));
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced, 0, undefined, chosen, use);
    if (taps) return chosen.length ? { creatures: chosen, taps } : null;
    // The next creature that can pay for something: one matching a colored symbol if possible.
    const left = candidates.filter((c) => !chosen.includes(c.id));
    const fits = left.filter((c) => convokeReduce(cost, tax, [...chosen, c.id].map((id) => characteristics(s, obj(s, id)).colors)));
    const colored = fits.find((c) => {
      const cols = characteristics(s, c).colors;
      return reduced.symbols.some((sym) => (sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid" ? cols.includes(sym.color as never) : sym.kind === "hybrid" && sym.options.some((x) => cols.includes(x))));
    });
    const next = colored ?? fits[0];
    if (!next) return null;
    chosen.push(next.id);
  }
}

/**
 * Creatures to crew a Vehicle with (CR 702.122a): the fewest, weakest ones that reach the crew
 * number, preferring creatures that couldn't attack anyway. Null if they can't.
 */
export function autoCrew(s: GameState, pid: PlayerId, vehicleId: ObjectId, n: number): ObjectId[] | null {
  // What tapping a creature costs us: its power, unless it couldn't attack this turn anyway.
  const lost = (c: GameObject) => (isSummoningSick(s, c) ? 0 : crewPower(s, c));
  const pool = crewCandidates(s, pid, vehicleId)
    .filter((c) => crewPower(s, c) > 0)
    .sort((a, b) => lost(a) - lost(b) || crewPower(s, b) - crewPower(s, a));
  // Either the cheapest single creature that's enough, or the cheapest ones added up.
  const single = [...pool].filter((c) => crewPower(s, c) >= n).sort((a, b) => lost(a) - lost(b))[0];
  const several: GameObject[] = [];
  let total = 0;
  for (const c of pool) {
    if (total >= n) break;
    several.push(c);
    total += crewPower(s, c);
  }
  const options = [...(single ? [[single]] : []), ...(total >= n ? [several] : [])];
  const cost = (cs: GameObject[]) => cs.reduce((x, c) => x + lost(c), 0);
  const best = options.sort((a, b) => cost(a) - cost(b) || a.length - b.length)[0];
  return best ? best.map((c) => c.id) : null;
}

/**
 * Targets that would be sacrificed for mana ("Sacrifice this token: Add {C}."): not used to pay, or the
 * spell or ability would lose its target while being paid for (equipping the Eldrazi Spawn you sacrificed).
 */
function sacrificedTargets(s: GameState, targets: TargetChoice[] | undefined): ObjectId[] {
  return (targets ?? []).flatMap((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && manaAbilitiesOn(s, obj(s, t.id)).some((ab) => ab.sacrificeSelf) ? [t.id] : []));
}

/** Like planCast, for an activated ability. A crew ability needs the creatures to tap (`tapCreatures`). */
export function planActivate(s: GameState, pid: PlayerId, objectId: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x?: number, costs?: CostChoices): Action[] | null {
  const problem = abilityProblem(s, pid, objectId, index, targets, modes, tapCreatures, x, costs);
  if (problem && !/not enough mana/.test(problem)) return null;
  const ab = abilitiesOf(s, obj(s, objectId)).activated[index]!;
  const cost = activationCost(s, pid, obj(s, objectId), ab, targets);
  // Don't tap the source for mana if the ability itself needs {T}, nor creatures tapped to crew.
  // Don't tap for mana what's about to be sacrificed either.
  const taps = planMana(s, pid, cost, (x ?? 0) * xCount(cost), ab.tap ? objectId : undefined, [...(tapCreatures ?? []), ...(costs?.sacrifice ?? []), ...(costs?.tap ?? []), ...sacrificedTargets(s, targets)], { ability: obj(s, objectId) });
  if (!taps) return null;
  return [...taps, { type: "activateAbility", player: pid, objectId, index, targets, ...(modes ? { modes } : {}), ...(tapCreatures ? { tapCreatures } : {}), ...(x ? { x } : {}), ...(costs ? { costs } : {}) }];
}

/**
 * Choose mana abilities to activate so the pool can pay `cost` (+ `extraGeneric`). Sources
 * that cost nothing come first; when they aren't enough, abilities that cost mana and make
 * more of it or a color we lack (a Signet: "{1}, {T}: Add {W}{U}") are paid for and added.
 */
export function planMana(s: GameState, pid: PlayerId, cost: ParsedCost, extraGeneric = 0, exclude?: ObjectId, alsoExclude: ObjectId[] = [], use: ManaUse = "other"): Action[] | null {
  const p = player(s, pid);
  // Only the mana that can be spent on this counts (CR 106.6); `restricted` is how much of the pool can't be spent
  // on anything else, such as a Signet's cost.
  const start = poolFor(s, pid, use);
  if (payFromPool(cost, start.pool, extraGeneric, p.life)) return [];
  const sources = manaSources(s, pid, [...(exclude ? [exclude] : []), ...alsoExclude], use);
  const unrestricted = sources.map((src) => ({ ...src, options: src.options.filter((x) => !x.restricted) }));
  const needColors = namedColors(cost);
  let pool: ManaPool = start.pool;
  const restricted: ManaPool = start.prefer;
  let used = new Set<ObjectId>();
  const taps: Action[] = [];
  for (let round = 0; round < 8; round++) {
    const plan = planFree(cost, extraGeneric, p.life, pool, sources, used);
    if (plan) return [...taps, ...plan.chosen.map((x) => toAction(pid, x))];
    // Add one mana ability that costs mana: one making a color the cost names first, then the biggest net gain.
    const costed = sources
      .filter((src) => !used.has(src.id))
      .flatMap((src) => src.options.filter((x) => x.cost && !x.tapCost))
      .map((x) => ({ x, net: x.adds.length - manaValue(x.cost!), color: x.adds.some((m) => needColors.has(m) && pool[m] === 0) }))
      .filter((c) => c.color || c.net > 0)
      .sort((a, b) => Number(b.color) - Number(a.color) || b.net - a.net || a.x.penalty - b.x.penalty);
    let added = false;
    for (const { x } of costed) {
      const others = unrestricted.filter((src) => src.id !== x.id);
      const free = { ...pool };
      for (const m of Object.keys(free) as ManaType[]) free[m] -= restricted[m];
      const pay = planFree(x.cost!, 0, p.life, free, others, used, needColors);
      if (!pay) continue;
      taps.push(...pay.chosen.map((y) => toAction(pid, y)), toAction(pid, x));
      pool = payFromPool(x.cost!, pay.pool)!.pool;
      for (const m of Object.keys(pool) as ManaType[]) pool[m] += restricted[m];
      for (const m of x.adds) {
        pool[m]++;
        if (x.restricted) restricted[m]++;
      }
      used = new Set([...pay.used, x.id]);
      added = true;
      break;
    }
    if (!added) return null;
  }
  return null;
}

/** The actions to activate one mana ability, paying any mana it costs first. */
export function planManaAbility(s: GameState, pid: PlayerId, objectId: ObjectId, ability: number, mana: ManaType, tap?: ObjectId[], extra?: ManaType[]): Action[] | null {
  const o = obj(s, objectId);
  if (manaAbilityProblem(s, pid, o, ability, true, tap)) return null;
  const ab = manaAbilitiesOn(s, o)[ability]!;
  // "Tap an untapped creature you control": what's given, or the best to tap.
  const tapped = ab.tapCost ? (tap ?? tapPreference(s, tapCostCandidates(s, pid, o, ab.tapCost)).slice(0, ab.tapCost.n)) : undefined;
  const taps = ab.manaCost ? planMana(s, pid, parseManaCost(ab.manaCost), 0, objectId, tapped, { ability: o }) : [];
  return taps ? [...taps, { type: "activateMana", player: pid, objectId, mana, ability, ...(tapped ? { tap: tapped } : {}), ...(extra?.length ? { extra } : {}) }] : null;
}

/** Tap what's needed and turn a face-down permanent face up (CR 702.37e), or null if that can't be done now. */
export function planTurnFaceUp(s: GameState, pid: PlayerId, id: ObjectId, way = 0): Action[] | null {
  const o = s.objects[id];
  const fd = o && faceUpCost(s, o, way);
  if (!fd) return null;
  const problem = turnFaceUpProblem(s, pid, id, way);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(fd.cost)) : [];
  return taps ? [...taps, { type: "turnFaceUp", player: pid, objectId: id, ...(way ? { way } : {}) }] : null;
}

/** Tap mana for a card's suspend cost, then suspend it (CR 702.62a), or null if that can't be done now. */
export function planSuspend(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const o = s.objects[id];
  const sus = o && compileCard(defOf(s, o)).suspend;
  if (!sus) return null;
  const problem = suspendProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(sus.cost)) : [];
  return taps ? [...taps, { type: "suspend", player: pid, objectId: id }] : null;
}

/** Tap mana for {2}, then foretell the card (CR 702.143a), or null if that can't be done now. */
export function planForetell(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const problem = foretellProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost("{2}")) : [];
  return taps ? [...taps, { type: "foretell", player: pid, objectId: id }] : null;
}

/** Tap mana for a card's plot cost, then plot it (CR 702.170a), or null if that can't be done now. */
export function planPlot(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const o = s.objects[id];
  const cost = o && compileCard(defOf(s, o)).plot;
  if (!cost) return null;
  const problem = plotProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(cost)) : [];
  return taps ? [...taps, { type: "plot", player: pid, objectId: id }] : null;
}

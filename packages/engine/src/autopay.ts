import { abilitiesOf, defOf, FACE_DOWN, objIsType, power } from "./cards";
import { manaAbilitiesOn, manaAbilityProblem, manaOptions, manaPenalty } from "./manaabilities";
import { characteristics, controllerOf } from "./layers";
import { abilityProblem, castProblem, crewCandidates, crewPower, faceUpCost, isSummoningSick, obj, player, spellCost, turnFaceUpProblem } from "./game";
import { compileCard } from "./oracle";
import type { TargetChoice } from "./abilities";
import { convokeReduce, manaValue, parseManaCost, payFromPool, payGenericWith, xCount, type ManaPool, type ParsedCost } from "./mana";
import type { Action, CostChoices, GameObject, GameState, ManaType, ObjectId, PlayerId } from "./types";

/** One way to make mana with a permanent, for planning. */
interface Option {
  id: ObjectId;
  ability: number;
  mana: ManaType;
  adds: ManaType[];
  /** The mana part of its cost, if any (a Signet's {1}). */
  cost: ParsedCost | null;
  penalty: number;
}

interface Source {
  id: ObjectId;
  options: Option[];
  /** How many colors its free options can make: less flexible sources get used first. */
  colors: number;
}

function manaSources(s: GameState, pid: PlayerId, exclude: ObjectId[]): Source[] {
  // Current controller, types and mana abilities, after continuous effects (CR 613).
  const isCreature = (id: string) => objIsType(s, obj(s, id), "Creature");
  return s.battlefield
    .filter((id) => !exclude.includes(id))
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid)
    .map((o) => {
      const abs = manaAbilitiesOn(s, o);
      const options = manaOptions(s, o)
        .filter((x) => x.adds.length > 0 && !manaAbilityProblem(s, pid, o, x.ability, true))
        .map((x) => {
          const ab = abs[x.ability]!;
          return { id: o.id, ...x, cost: ab.manaCost ? parseManaCost(ab.manaCost) : null, penalty: manaPenalty(ab) };
        });
      return { id: o.id, options, colors: new Set(options.filter((x) => !x.cost).flatMap((x) => x.adds)).size };
    })
    .filter((src) => src.options.length > 0)
    // Prefer tapping lands, then the least flexible sources, so creatures and rainbow sources stay available.
    .sort((a, b) => Number(isCreature(a.id)) - Number(isCreature(b.id)) || a.colors - b.colors);
}

const toAction = (pid: PlayerId, x: Option): Action => ({ type: "activateMana", player: pid, objectId: x.id, mana: x.mana, ability: x.ability });

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
  const take = (x: Option) => {
    used.add(x.id);
    chosen.push(x);
    for (const m of x.adds) {
      pool[m]++;
      reserved[m]++;
    }
  };
  const free = (pred: (x: Option) => boolean) =>
    sources
      .filter((src) => !used.has(src.id))
      .flatMap((src, order) => src.options.filter((x) => !x.cost && pred(x)).map((x) => ({ x, order })))
      .sort((a, b) => a.x.penalty - b.x.penalty || a.order - b.order)[0]?.x;
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
      .flatMap((src, order) => src.options.filter((x) => !x.cost).map((x) => ({ x, order })))
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
  const problem = castProblem(s, pid, objectId, targets, modes, undefined, undefined, x, choices);
  if (problem && !/not enough mana/.test(problem)) return null;
  let { cost, extra } = spellCost(s, pid, o, x, choices.kicks, choices);
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
    const taps = planMana(s, pid, reduced, 0, undefined, convoke);
    if (taps) return cast(taps, convoke);
    const imp = improvise ? autoImprovise(s, pid, reduced, 0, convoke) : null;
    return imp ? cast(imp.taps, convoke, imp.artifacts) : null;
  }
  const taps = planMana(s, pid, cost, extra);
  if (taps) return cast(taps);
  if (convoke !== "auto") return null;
  // Tap artifacts for improvise, or creatures for convoke, only when mana alone can't pay.
  const imp = improvise ? autoImprovise(s, pid, cost, extra, []) : null;
  if (imp) return cast(imp.taps, undefined, imp.artifacts);
  if (!compileCard(d).convoke) return null;
  const auto = autoConvoke(s, pid, cost, extra);
  return auto ? cast(auto.taps, auto.creatures) : null;
}

/**
 * Artifacts to improvise with (CR 702.126a) when mana sources can't pay alone: ones that don't
 * make mana first, then noncreatures. Each pays for one generic mana.
 */
export function autoImprovise(s: GameState, pid: PlayerId, cost: ParsedCost, extra: number, exclude: ObjectId[]): { artifacts: ObjectId[]; taps: Action[] } | null {
  const candidates = s.battlefield
    .map((id) => obj(s, id))
    .filter((a) => controllerOf(s, a) === pid && !a.tapped && !exclude.includes(a.id) && objIsType(s, a, "Artifact"))
    .sort((a, b) => Number(manaOptions(s, a).length > 0) - Number(manaOptions(s, b).length > 0) || Number(objIsType(s, a, "Creature")) - Number(objIsType(s, b, "Creature")));
  const chosen: ObjectId[] = [];
  for (const a of candidates) {
    chosen.push(a.id);
    const reduced = payGenericWith(cost, extra, chosen.length);
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced.cost, reduced.extra, undefined, [...exclude, ...chosen]);
    if (taps) return { artifacts: chosen, taps };
  }
  return null;
}

/**
 * Pick creatures to convoke with when mana sources can't pay alone: ones that can't attack
 * this turn first (summoning sick), then the smallest. Each must pay for some mana.
 */
export function autoConvoke(s: GameState, pid: PlayerId, cost: ParsedCost, tax: number): { creatures: ObjectId[]; taps: Action[] } | null {
  const candidates = s.battlefield
    .map((id) => obj(s, id))
    .filter((c) => controllerOf(s, c) === pid && !c.tapped && objIsType(s, c, "Creature"))
    .sort((a, b) => Number(isSummoningSick(s, b)) - Number(isSummoningSick(s, a)) || power(s, a) - power(s, b));
  const chosen: ObjectId[] = [];
  for (;;) {
    const reduced = convokeReduce(cost, tax, chosen.map((id) => characteristics(s, obj(s, id)).colors));
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced, 0, undefined, chosen);
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

/** Like planCast, for an activated ability. A crew ability needs the creatures to tap (`tapCreatures`). */
export function planActivate(s: GameState, pid: PlayerId, objectId: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x?: number): Action[] | null {
  const problem = abilityProblem(s, pid, objectId, index, targets, modes, tapCreatures, x);
  if (problem && !/not enough mana/.test(problem)) return null;
  const ab = abilitiesOf(s, obj(s, objectId)).activated[index]!;
  const cost = parseManaCost(ab.manaCost);
  // Don't tap the source for mana if the ability itself needs {T}, nor creatures tapped to crew.
  const taps = planMana(s, pid, cost, (x ?? 0) * xCount(cost), ab.tap ? objectId : undefined, tapCreatures);
  if (!taps) return null;
  return [...taps, { type: "activateAbility", player: pid, objectId, index, targets, ...(modes ? { modes } : {}), ...(tapCreatures ? { tapCreatures } : {}), ...(x ? { x } : {}) }];
}

/**
 * Choose mana abilities to activate so the pool can pay `cost` (+ `extraGeneric`). Sources
 * that cost nothing come first; when they aren't enough, abilities that cost mana and make
 * more of it or a color we lack (a Signet: "{1}, {T}: Add {W}{U}") are paid for and added.
 */
export function planMana(s: GameState, pid: PlayerId, cost: ParsedCost, extraGeneric = 0, exclude?: ObjectId, alsoExclude: ObjectId[] = []): Action[] | null {
  const p = player(s, pid);
  if (payFromPool(cost, p.manaPool, extraGeneric, p.life)) return [];
  const sources = manaSources(s, pid, [...(exclude ? [exclude] : []), ...alsoExclude]);
  const needColors = namedColors(cost);
  let pool: ManaPool = { ...p.manaPool };
  let used = new Set<ObjectId>();
  const taps: Action[] = [];
  for (let round = 0; round < 8; round++) {
    const plan = planFree(cost, extraGeneric, p.life, pool, sources, used);
    if (plan) return [...taps, ...plan.chosen.map((x) => toAction(pid, x))];
    // Add one mana ability that costs mana: one making a color the cost names first, then the biggest net gain.
    const costed = sources
      .filter((src) => !used.has(src.id))
      .flatMap((src) => src.options.filter((x) => x.cost))
      .map((x) => ({ x, net: x.adds.length - manaValue(x.cost!), color: x.adds.some((m) => needColors.has(m) && pool[m] === 0) }))
      .filter((c) => c.color || c.net > 0)
      .sort((a, b) => Number(b.color) - Number(a.color) || b.net - a.net || a.x.penalty - b.x.penalty);
    let added = false;
    for (const { x } of costed) {
      const others = sources.filter((src) => src.id !== x.id);
      const pay = planFree(x.cost!, 0, p.life, pool, others, used, needColors);
      if (!pay) continue;
      taps.push(...pay.chosen.map((y) => toAction(pid, y)), toAction(pid, x));
      pool = payFromPool(x.cost!, pay.pool)!.pool;
      for (const m of x.adds) pool[m]++;
      used = new Set([...pay.used, x.id]);
      added = true;
      break;
    }
    if (!added) return null;
  }
  return null;
}

/** The actions to activate one mana ability, paying any mana it costs first. */
export function planManaAbility(s: GameState, pid: PlayerId, objectId: ObjectId, ability: number, mana: ManaType): Action[] | null {
  const o = obj(s, objectId);
  if (manaAbilityProblem(s, pid, o, ability, true)) return null;
  const ab = manaAbilitiesOn(s, o)[ability]!;
  const taps = ab.manaCost ? planMana(s, pid, parseManaCost(ab.manaCost), 0, objectId) : [];
  return taps ? [...taps, { type: "activateMana", player: pid, objectId, mana, ability }] : null;
}

/** Tap what's needed and turn a face-down permanent face up (CR 702.37e), or null if that can't be done now. */
export function planTurnFaceUp(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const o = s.objects[id];
  const fd = o && faceUpCost(s, o);
  if (!fd) return null;
  const problem = turnFaceUpProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(fd.cost)) : [];
  return taps ? [...taps, { type: "turnFaceUp", player: pid, objectId: id }] : null;
}

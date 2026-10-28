import { asFace } from "./faces";
import { liveEmblems } from "./emblems";
import { abilitiesOf, bestowedDef, prototypedDef, defOf, FACE_DOWN, objIsType, power } from "./cards";
import { MANA_ABILITY_OFFSET, payableActivatedMana, manaAbilityCost, manaAbilitiesOn, manaAbilityProblem, manaActionAbility, manaCombos, manaOptions, manaPenalty, manaLifeTax } from "./manaabilities";
import { characteristics, controllerOf } from "./layers";
import { abilityProblem, definedX, firstArtifactLess, lessWaterbend, eminenceCommanders, activationCost, applyAction, applyInPlace, cloneState, activationLessCost, altCost, convertChoices, isTreasure, castProblem, hasConvoke, hasImprovise, unlockCost, unlockProblem, endableEffect, endEffectProblem, crewCandidates, crewPower, faceUpCost, faceUpManaCost, isSummoningSick, obj, payableLife, player, spellCost, suspendProblem, plotProblem, plotCost, foretellProblem, tapCostCandidates, turnFaceUpProblem, untapViaMana } from "./game";
import { compileCard } from "./oracle";
import { printedMatches } from "./effects/targeting";
import { hopeValues, spendPlan } from "./value";
import { abilityUse, boundSpend, payableCost, poolFor, spendAllows, usableTypes, type ManaUse } from "./spend";
import type { AdditionalCost, SpentReq, TargetChoice } from "./abilities";
import { convokeReduce, emptyPool, manaValue, parseManaCost, payFromPool, payGenericWith, splitGeneric, xCount, type ManaPool, type ParsedCost } from "./mana";
import { COLORS, type Action, type CardDef, type Color, type CostChoices, type GameObject, type GameState, type ManaType, type ObjectId, type PlayerId } from "./types";

/** One way to make mana with a permanent, for planning. */
interface Option {
  id: ObjectId;
  ability: number;
  mana: ManaType;
  combo?: number;
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
  /** `ability` indexes the source's activated abilities: an activated mana ability (CR 605.1a), not a `ManaAbility`. */
  activated?: true;
  /** The part of its mana that's snow mana and can pay {S} (CR 107.4h): from a snow source. */
  snow?: ManaType[];
  /** Its mana "can't be spent to pay generic mana costs" (Jegantha): only colored symbols. */
  colorOnly?: true;
}

interface Source {
  id: ObjectId;
  options: Option[];
  /** How many colors its free options can make: less flexible sources get used first. */
  colors: number;
  /** The colors (and {C}) its free options can make. */
  makes: ManaType[];
  creature: boolean;
}

function manaSources(s: GameState, pid: PlayerId, exclude: ObjectId[], use: ManaUse): Source[] {
  const onlyTreasures = use !== "other" && "spell" in use && !!use.treasureOnly;
  // "Spend only mana of the chosen color to activate this ability": only sources of that mana help.
  const only = usableTypes(use);
  // Current controller, types and mana abilities, after continuous effects (CR 613).
  const isCreature = (id: string) => objIsType(s, obj(s, id), "Creature");
  return s.battlefield
    .filter((id) => !exclude.includes(id))
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid)
    .map((o) => {
      const abs = manaAbilitiesOn(s, o);
      const treasure = isTreasure(s, o);
      // Tapping it for mana triggers something of its own (Forbidden Orchard gives an opponent a Spirit): last.
      const tapRider = abilitiesOf(s, o).triggers.some((t) => t.event === "tappedForMana" && !t.manaTap?.filter) ? 2 : 0;
      const options = manaOptions(s, o)
        // Mana that can't be spent on this is no help (CR 106.6), nor mana a Treasure didn't make for Security Rhox's cost.
        // A storage land gives one counter's worth at a time, so a payment never takes more of them than it needs; a Mana
        // Battery gives its one mana without removing any.
        // Discarding a hand (Lion's Eye Diamond) is never an automatic choice: the player activates it.
        // Doubling Cube is never an automatic choice either: what it adds depends on what's in the pool then.
        .filter((x) => x.adds.length > 0 && (x.removes ?? 1) === (abs[x.ability]!.produces.kind === "removeX" && (abs[x.ability]!.produces as { base?: number }).base ? 0 : 1) && !abs[x.ability]!.discardHand && !abs[x.ability]!.returnSelf && abs[x.ability]!.produces.kind !== "doublePool" && !(abs[x.ability]!.sacrificeIfActivated && (o.activatedThisTurn ?? []).filter((n) => n === MANA_ABILITY_OFFSET + x.ability).length >= abs[x.ability]!.sacrificeIfActivated! - 1) && !manaAbilityProblem(s, pid, o, x.ability, true) && (!abs[x.ability]!.spendOnly || spendAllows(s, pid, boundSpend(o, abs[x.ability]!.spendOnly!), use)) && (!onlyTreasures || (treasure && !abs[x.ability]!.spendOnly)) && (!only || x.adds.every((m) => only.includes(m))))
        .map((x) => {
          const ab = abs[x.ability]!;
          const tapCost = ab.tapCost && { n: ab.tapCost.n, candidates: tapPreference(s, tapCostCandidates(s, pid, o, ab.tapCost).filter((id) => !exclude.includes(id))) };
          return { id: o.id, ...x, cost: ab.manaCost ? manaAbilityCost(s, pid, o, ab.manaCost) : null, penalty: manaPenalty(ab) + (ab.tap ? tapRider : 0), ...(tapCost ? { tapCost } : {}), ...(ab.spendOnly ? { restricted: true } : {}), ...(ab.spendOnly?.notGeneric ? { colorOnly: true as const } : {}) };
        });
      if (!onlyTreasures || treasure) options.push(...activatedOptions(s, pid, o));
      const makes = [...new Set(options.filter((x) => !x.cost).flatMap((x) => x.adds))];
      return { id: o.id, options, colors: makes.length, makes, creature: isCreature(o.id) };
    })
    .filter((src) => src.options.length > 0)
    // Prefer tapping lands, then the least flexible sources, so creatures and rainbow sources stay available.
    .sort((a, b) => Number(a.creature) - Number(b.creature) || a.colors - b.colors);
}

/** The activated mana abilities (CR 605.1a) a payment can use, as options. */
function activatedOptions(s: GameState, pid: PlayerId, o: GameObject): Option[] {
  return payableActivatedMana(s, pid, o).flatMap(({ ab, options, penalty }) => {
    const cost = ab.manaCost ? manaAbilityCost(s, pid, o, ab.manaCost) : null;
    return options.filter((x) => x.adds.length > 0).map((x) => ({ id: o.id, ...x, cost, penalty, activated: true as const }));
  });
}

const toAction = (pid: PlayerId, x: Option): Action =>
  x.activated
    ? { type: "activateAbility", player: pid, objectId: x.id, index: x.ability, mana: x.mana, ...(x.extra ? { extra: x.extra } : {}) }
    : { type: "activateMana", player: pid, objectId: x.id, mana: x.mana, ability: x.ability, ...(x.combo !== undefined ? { combo: x.combo } : {}), ...(x.taps ? { tap: x.taps } : {}), ...(x.extra ? { extra: x.extra } : {}) };

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
 * How much of each color the player's other cards ask for (their hand and command zone), for keeping those colors
 * untapped: what's being paid for now is left out once.
 */
function colorDemand(s: GameState, pid: PlayerId, use: ManaUse): Map<ManaType, number> {
  const p = player(s, pid);
  const out = new Map<ManaType, number>();
  let skip = use !== "other" && "spell" in use ? use.spell.oracleId : undefined;
  for (const id of [...p.hand, ...p.command]) {
    const o = s.objects[id];
    if (!o) continue;
    const d = defOf(s, o);
    if (d.oracleId === skip) {
      skip = undefined;
      continue;
    }
    for (const sym of parseManaCost(d.manaCost).symbols) {
      if (sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid") out.set(sym.color, (out.get(sym.color) ?? 0) + 1);
      if (sym.kind === "hybrid") for (const c of sym.options) out.set(c as ManaType, (out.get(c as ManaType) ?? 0) + 1 / sym.options.length);
    }
  }
  return out;
}

/**
 * What using a source gives up, for keeping the colors the player's other cards need untapped: each color it could make
 * counts for how much it's needed, over how many unused sources make it (a little even when nothing asks for it, so the
 * colors stay mixed). Paying {3}{B} with two Swamps and a black card in hand, other lands pay the generic mana and a Swamp
 * is left for the black card.
 */
function scarcity(sources: Source[], used: Set<ObjectId>, demand: Map<ManaType, number>): (src: Source) => number {
  const count = new Map<ManaType, number>();
  for (const src of sources) if (!used.has(src.id)) for (const m of src.makes) count.set(m, (count.get(m) ?? 0) + 1);
  return (src) => src.makes.reduce((sum, m) => sum + ((demand.get(m) ?? 0) + 0.01) / (count.get(m) ?? 1), 0);
}

/**
 * Pay `cost` with mana abilities that cost no mana, on top of `pool` (of which `snow0` is snow mana). Greedy: each {S}
 * from a snow source, each colored symbol from the least flexible source that makes it, then hybrid, then generic,
 * keeping sources that make the colors in `avoid` for last. `wantSnow`: snow sources first where there's a choice.
 */
function planFree(cost: ParsedCost, extraGeneric: number, life: number, pool0: ManaPool, sources: Source[], used0: Set<ObjectId>, avoid = new Set<ManaType>(), demand = new Map<ManaType, number>(), harm: Partial<Record<Color, number>> = {}, snow0: ManaPool = emptyPool(), wantSnow = false, colorOnly0: ManaPool = emptyPool()) {
  const pool = { ...pool0 };
  const snow = { ...snow0 };
  // Mana that can't pay generic costs (Jegantha), part of `pool`: for colored symbols only.
  const colorOnly = { ...colorOnly0 };
  const used = new Set(used0);
  const chosen: Option[] = [];
  const reserved = { ...pool };
  const snowReserved = { ...snow };
  const take = (x0: Option) => {
    const taps = tapsFor(x0, used) ?? [];
    const x = taps.length ? { ...x0, taps } : x0;
    used.add(x.id);
    for (const id of taps) used.add(id);
    chosen.push(x);
    for (const m of x.adds) {
      pool[m]++;
      reserved[m]++;
      if (x.colorOnly) colorOnly[m]++;
    }
    // Snow mana, restricted or not: restricted mana is an option only if it can be spent on this (CR 106.6).
    for (const m of x.snow ?? []) {
      snow[m]++;
      snowReserved[m]++;
    }
  };
  const pays = () => payFromPool(cost, pool, extraGeneric, life, { snow, wantSnow, colorOnly });
  // Colored mana the cost names: of two ways to use one source (Fertile Ground's "GW" and "GU"), the one adding more of it.
  const named = namedColors(cost);
  const useful = (x: Option) => x.adds.filter((m) => named.has(m)).length;
  const harmOf = (m: ManaType) => (m === "C" ? 0 : (harm[m] ?? 0));
  const free = (pred: (x: Option) => boolean) => {
    const loss = scarcity(sources, used, demand);
    return sources
      .filter((src) => !used.has(src.id))
      .flatMap((src, order) => src.options.filter((x) => !x.cost && pred(x) && tapsFor(x, used)).map((x) => ({ x, order, src })))
      .sort((a, b) => a.x.penalty - b.x.penalty || (wantSnow ? (b.x.snow?.length ?? 0) - (a.x.snow?.length ?? 0) : 0) || Number(a.src.creature) - Number(b.src.creature) || loss(a.src) - loss(b.src) || a.order - b.order || useful(b.x) - useful(a.x))[0]?.x;
  };
  // {S}: mana from a snow source (CR 107.4h), set aside from what the colored symbols count on.
  const snowFrom = () => (["C", ...COLORS] as ManaType[]).filter((m) => snowReserved[m] > 0).sort((a, b) => Number(b === "C") - Number(a === "C") || reserved[b] - reserved[a])[0];
  for (const sym of cost.symbols) {
    if (sym.kind !== "snow") continue;
    if (!snowFrom()) {
      const x = free((o) => !!o.snow?.length);
      if (x) take(x);
    }
    const m = snowFrom();
    if (!m) continue;
    snowReserved[m]--;
    reserved[m]--;
  }
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
    let have = opts.find((c) => reserved[c] > 0 && !harmOf(c)) ?? opts.find((c) => reserved[c] > 0);
    if (!have || harmOf(have)) {
      // A color whose spending hurts the caster (`harm`, see spendPlan) only when no other will do.
      const x = free((o) => o.adds.some((m) => opts.includes(m) && !harmOf(m))) ?? (have ? undefined : free((o) => o.adds.some((m) => opts.includes(m))));
      if (x) take(x);
      have = opts.filter((c) => reserved[c] > 0).sort((a, b) => harmOf(a) - harmOf(b))[0];
    }
    if (have) reserved[have]--;
  }
  for (let guard = 0; guard < 60 && !pays(); guard++) {
    // Most mana for the least given up, colorless first, sources making colors we still need last, then lands before
    // creatures and what leaves the most colors available (scarcity).
    const loss = scarcity(sources, used, demand);
    const best = sources
      .filter((src) => !used.has(src.id))
      // Mana that can't pay generic costs is no help here: the colored symbols were seen to above.
      .flatMap((src, order) => src.options.filter((x) => !x.cost && !x.colorOnly && tapsFor(x, used)).map((x) => ({ x, order, src })))
      .sort(
        (a, b) =>
          a.x.penalty - b.x.penalty ||
          (wantSnow ? (b.x.snow?.length ?? 0) - (a.x.snow?.length ?? 0) : 0) ||
          a.x.adds.reduce((n, m) => n + harmOf(m), 0) - b.x.adds.reduce((n, m) => n + harmOf(m), 0) ||
          Number(a.x.adds.some((m) => avoid.has(m))) - Number(b.x.adds.some((m) => avoid.has(m))) ||
          b.x.adds.length - a.x.adds.length ||
          Number(b.x.mana === "C") - Number(a.x.mana === "C") ||
          Number(a.src.creature) - Number(b.src.creature) ||
          loss(a.src) - loss(b.src) ||
          a.order - b.order,
      )[0]?.x;
    if (!best) return null;
    take(best);
  }
  return pays() ? { chosen, pool, used, snow, colorOnly } : null;
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
  choices = convertChoices(o, choices);
  // Cast as one of its faces: that face's cost and text (CR 709.3a, 712.11c, 715.3a).
  if (choices.face !== undefined && o.face !== choices.face) return asFace(s, o, choices.face, () => planCast(s, pid, objectId, targets, modes, convoke, x, choices));
  const d = choices.faceDown ? FACE_DOWN : defOf(s, o);
  // The spell as it will be on the stack, for mana that can only be spent on some spells (CR 106.6).
  const use: ManaUse = { spell: choices.alt === "bestow" ? bestowedDef(d) : choices.alt === "prototype" || choices.prototyped ? prototypedDef(d) : d, ...(altCost(d, choices.alt)?.treasureOnly ? { treasureOnly: true as const } : {}) };
  const problem = castProblem(s, pid, objectId, targets, modes, undefined, undefined, x, choices);
  if (problem && !/not enough mana/.test(problem)) return null;
  let { cost, extra } = spellCost(s, pid, o, x, choices.kicks, { ...choices, targets, modes });
  // Whether its total cost has {X} (CR 601.2f), for mana spent only on such costs.
  if (typeof use === "object" && "spell" in use) use.xCost = cost.hasX;
  if (choices.delve?.length) {
    // Cards exiled for delve pay generic mana (CR 702.66a).
    const reduced = payGenericWith(cost, extra, choices.delve.length);
    if (!reduced) return null;
    ({ cost, extra } = reduced);
  }
  if (choices.waterbend?.length) {
    // Artifacts and creatures tapped to waterbend pay generic mana (CR 701.67a).
    const reduced = payGenericWith(cost, extra, choices.waterbend.length);
    if (!reduced) return null;
    ({ cost, extra } = reduced);
  }
  const paid = Object.fromEntries(Object.entries(choices).filter(([, v]) => (Array.isArray(v) ? v.length : v !== undefined && v !== false))) as CostChoices;
  const improvise = hasImprovise(s, pid, obj(s, objectId));
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
  // Creatures tapped for teamwork, conspire or harmonize as it's cast can't also be tapped for mana.
  const tapping = [...(choices.teamwork ?? []), ...(choices.conspire ?? []), ...(choices.harmonize !== undefined ? [choices.harmonize] : [])];
  // Sunburst and converge count the colors of mana spent (CR 702.44a, 207.2c): pay its generic mana with as many other colors as we can.
  const pool = poolFor(s, pid, use).pool;
  const rainbow = (compileCard(d).countsColors || gainsSunburst(s, pid, d)) && !payFromPool(cost, pool, extra, player(s, pid).life) ? rainbowCosts(cost, extra, pool) : [];
  // "If {U} was spent to cast ~", adamant: ask for those colors where its generic or hybrid mana allows, as many as can be,
  // when that helps; where it hurts (Rolling Spoil's -1/-1 to their own creatures), keep those colors off it instead.
  const hopes = compileCard(d).wantSpent && !payFromPool(cost, pool, extra, player(s, pid).life) ? hopeValues(s, pid, d) : [];
  const wanted = wantCosts(cost, extra, hopes.filter((h) => h.value > 0).map((h) => h.req));
  const avoid = spendPlan(s, pid, d, pool).avoid;
  // "If {S} was spent", "for each {S} spent": tap snow sources first (CR 107.4h).
  const wantSnow = !!compileCard(d).wantSnow;
  let taps: Action[] | null = null;
  for (const r of wanted) if ((taps = planMana(s, pid, r.cost, r.extra, undefined, [...sacrificedTargets(s, targets), ...targetIds, ...tapping], use, avoid, wantSnow))) break;
  if (!taps) for (const r of rainbow) if ((taps = planMana(s, pid, r.cost, r.extra, undefined, [...sacrificedTargets(s, targets), ...targetIds, ...tapping], use, undefined, wantSnow))) break;
  taps ??= planMana(s, pid, cost, extra, undefined, [...sacrificedTargets(s, targets), ...targetIds, ...tapping], use, avoid, wantSnow);
  // The total cost is locked in before mana abilities are activated (CR 601.2f-g), but here the mana
  // comes first: sacrificing a Treasure for mana would leave affinity for artifacts counting one fewer.
  // So when the cost depends on the board, don't sacrifice permanents for its mana.
  if (taps && costDependsOnBoard(s, d)) {
    const sacs = taps.flatMap((a) => ((a.type === "activateMana" && manaActionAbility(s, a)?.sacrificeSelf) || (a.type === "activateAbility" && abilitiesOf(s, obj(s, a.objectId)).activated[a.index]?.sacrificeSelf) ? [a.objectId] : []));
    if (sacs.length) taps = planMana(s, pid, cost, extra, undefined, [...sacs, ...sacrificedTargets(s, targets), ...tapping], use, undefined, wantSnow);
  }
  if (taps) return cast(taps);
  // Waterbend as an additional cost (CR 701.67a): mana first, then artifacts and creatures for the rest of it.
  const wk = compileCard(d).kicker;
  if (wk?.waterbend !== undefined && (wk.required || choices.kicks?.includes(0)) && !choices.waterbend?.length) {
    const wb = autoWaterbend(s, pid, cost, extra, wk.waterbend, [...sacrificedTargets(s, targets), ...targetIds, ...tapping, ...(choices.tap ?? [])], use);
    const c = cast([])[0]!;
    if (wb && c.type === "castSpell") return [...wb.taps, { ...c, waterbend: wb.tapped }];
  }
  if (convoke !== "auto") return null;
  // Tap artifacts for improvise, or creatures for convoke, only when mana alone can't pay.
  const imp = improvise ? autoImprovise(s, pid, cost, extra, [], use) : null;
  if (imp) return cast(imp.taps, undefined, imp.artifacts);
  if (!hasConvoke(s, pid, o)) return null;
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

/**
 * The cost with some of its generic or hybrid mana asked for as the colors its text hopes were spent (`wantSpent`):
 * every hope met first, then fewer. Paying that, castSpell's payment spends those colors (payFromPool's `want`).
 */
function wantCosts(cost: ParsedCost, extra: number, reqs: SpentReq[]): { cost: ParsedCost; extra: number }[] {
  if (!reqs.length) return [];
  const g = splitGeneric(cost, extra);
  // Each hope as the ways to meet it: "three mana of the same color" is any one color three times.
  const ways = reqs.map((r): Partial<Record<Color, number>>[] => (r.sameColor ? COLORS.map((c) => ({ ...r.colors, [c]: Math.max(r.sameColor!, r.colors?.[c] ?? 0) })) : [r.colors ?? {}]));
  const out: { cost: ParsedCost; extra: number; met: number }[] = [];
  const seen = new Set<string>();
  const tryNeed = (need: Partial<Record<Color, number>>, met: number) => {
    const symbols = [...g.cost.symbols];
    let generic = g.extra;
    for (const c of COLORS) {
      let have = symbols.filter((sym) => sym.kind === "colored" && sym.color === c).length;
      for (let i = 0; i < symbols.length && have < (need[c] ?? 0); i++) {
        const sym = symbols[i]!;
        if (sym.kind === "hybrid" && sym.options.includes(c)) [symbols[i], have] = [{ kind: "colored", color: c }, have + 1];
      }
      const more = Math.max(0, (need[c] ?? 0) - have);
      if (more > generic) return;
      generic -= more;
      for (let k = 0; k < more; k++) symbols.push({ kind: "colored", color: c });
    }
    const key = JSON.stringify([symbols, generic]);
    if (generic === g.extra && symbols.every((sym, i) => sym === g.cost.symbols[i])) return;
    if (!seen.has(key) && seen.add(key)) out.push({ cost: { ...g.cost, symbols }, extra: generic, met });
  };
  for (let mask = (1 << reqs.length) - 1; mask > 0; mask--) {
    const picked = ways.filter((_, i) => mask & (1 << i));
    const combos = picked.reduce<Partial<Record<Color, number>>[]>((acc, w) => acc.flatMap((a) => w.map((b) => {
      const m = { ...a };
      for (const [c, n] of Object.entries(b)) m[c as Color] = Math.max(m[c as Color] ?? 0, n ?? 0);
      return m;
    })), [{}]);
    for (const need of combos) tryNeed(need, picked.length);
  }
  return out.sort((a, b) => b.met - a.met).map(({ cost, extra }) => ({ cost, extra }));
}

/** Does what this spell costs depend on what's on the battlefield (affinity, "costs {1} less", Thalia)? */
function costDependsOnBoard(s: GameState, d: CardDef): boolean {
  const c = compileCard(d);
  return !!(c.costLess?.length || c.costLessIf?.length || s.costModsThisTurn?.length) || s.battlefield.some((id) => !!abilitiesOf(s, obj(s, id)).costMods) || liveEmblems(s).some((o) => !!abilitiesOf(s, o).costMods) || eminenceCommanders(s).length > 0;
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
 * Artifacts and creatures to tap for a waterbend cost (CR 701.67a), no more than `cap`, when mana sources can't pay alone:
 * ones that make no mana first, then noncreatures, then creatures that can't attack this turn, then the smallest.
 */
export function autoWaterbend(s: GameState, pid: PlayerId, cost: ParsedCost, extra: number, cap: number, exclude: ObjectId[], use: ManaUse = "other"): { tapped: ObjectId[]; taps: Action[] } | null {
  const candidates = s.battlefield
    .map((id) => obj(s, id))
    .filter((a) => controllerOf(s, a) === pid && !a.tapped && !exclude.includes(a.id) && (objIsType(s, a, "Artifact") || objIsType(s, a, "Creature")))
    .sort((a, b) => Number(manaOptions(s, a).length > 0) - Number(manaOptions(s, b).length > 0) || Number(objIsType(s, a, "Creature")) - Number(objIsType(s, b, "Creature")) || Number(isSummoningSick(s, b)) - Number(isSummoningSick(s, a)) || power(s, a) - power(s, b));
  const tapped: ObjectId[] = [];
  for (const a of candidates.slice(0, cap)) {
    tapped.push(a.id);
    const reduced = payGenericWith(cost, extra, tapped.length);
    if (!reduced) return null;
    const taps = planMana(s, pid, reduced.cost, reduced.extra, undefined, [...exclude, ...tapped], use);
    if (taps) return { tapped, taps };
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
export function autoCrew(s: GameState, pid: PlayerId, vehicleId: ObjectId, n: number, saddle = false): ObjectId[] | null {
  const counts = (c: GameObject) => crewPower(s, c, saddle);
  // What tapping a creature costs us: its power, unless it couldn't attack this turn anyway.
  const lost = (c: GameObject) => (isSummoningSick(s, c) ? 0 : Math.max(0, power(s, c)));
  const pool = crewCandidates(s, pid, vehicleId, !saddle)
    .filter((c) => counts(c) > 0)
    .sort((a, b) => lost(a) - lost(b) || counts(b) - counts(a));
  // Either the cheapest single creature that's enough, or the cheapest ones added up.
  const single = [...pool].filter((c) => counts(c) >= n).sort((a, b) => lost(a) - lost(b))[0];
  const several: GameObject[] = [];
  let total = 0;
  for (const c of pool) {
    if (total >= n) break;
    several.push(c);
    total += counts(c);
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
  const sacrificesSelf = (o: GameObject) => manaAbilitiesOn(s, o).some((ab) => ab.sacrificeSelf) || abilitiesOf(s, o).activated.some((ab) => ab.mana && ab.sacrificeSelf);
  return (targets ?? []).flatMap((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && sacrificesSelf(obj(s, t.id)) ? [t.id] : []));
}

/**
 * Like planCast, for an activated ability. A crew ability needs the creatures to tap (`tapCreatures`). `pick`: for a
 * mana ability, the color and the triggered abilities' mana, as for activateMana.
 */
export function planActivate(s: GameState, pid: PlayerId, objectId: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x0?: number, costs?: CostChoices, pick?: { mana?: ManaType; extra?: ManaType[] }): Action[] | null {
  // "Untap a tapped creature you control" with a creature that's untapped: it's tapped for mana first (Halo Fountain).
  const ab0 = abilitiesOf(s, obj(s, objectId)).activated[index];
  // Prototype Portal: an X the ability sets (CR 107.3c).
  const x = x0 ?? (ab0 && definedX(s, obj(s, objectId), ab0)) ?? undefined;
  const untapCost = ab0?.costs?.find((c) => c.kind === "tap" && c.untap);
  const forMana = untapCost ? (costs?.tap ?? []).find((id) => s.objects[id]?.zone === "battlefield" && !obj(s, id).tapped) : undefined;
  if (forMana !== undefined) {
    if (!untapViaMana(s, pid, obj(s, objectId), untapCost as Extract<AdditionalCost, { kind: "tap" }>).includes(forMana)) return null;
    const named = namedColors(activationCost(s, pid, obj(s, objectId), ab0!, targets, x));
    const options = tapManaOptions(s, pid, forMana).sort((a, b) => Number(b.adds.some((m) => named.has(m))) - Number(a.adds.some((m) => named.has(m))));
    for (const option of options) {
      let next: GameState;
      try {
        next = applyAction(s, toAction(pid, option));
      } catch {
        continue;
      }
      const rest = planActivate(next, pid, objectId, index, targets, modes, tapCreatures, x, costs, pick);
      if (rest) return [toAction(pid, option), ...rest];
    }
    return null;
  }
  const problem = abilityProblem(s, pid, objectId, index, targets, modes, tapCreatures, x, costs);
  if (problem && !/not enough mana/.test(problem)) return null;
  const ab = abilitiesOf(s, obj(s, objectId)).activated[index]!;
  const cost = activationCost(s, pid, obj(s, objectId), ab, targets, x);
  // Don't tap the source for mana if the ability itself needs {T}, nor creatures tapped to crew.
  // Don't tap for mana what's about to be sacrificed either.
  const exclude = [...(costs?.sacrifice ?? []), ...(costs?.tap ?? []), ...(costs?.craft ?? []), ...sacrificedTargets(s, targets)];
  const use = abilityUse(obj(s, objectId), ab, s);
  const due = lessWaterbend(cost, (x ?? 0) * xCount(cost), ab, tapCreatures);
  // Tezzeret, Betrayer of Flesh: this ability is begun first and the mana abilities paying for it come after (rulings),
  // so they don't take the reduction it gets.
  const first = !ab.mana && firstArtifactLess(s, pid, obj(s, objectId), false) > 0;
  const sPay: GameState = first ? { ...s, turnLog: { ...s.turnLog, artifactAbility: { ...s.turnLog?.artifactAbility, [pid]: "mana" } } } : s;
  let taps = planMana(sPay, pid, due.cost, due.extra, ab.tap ? objectId : undefined, [...(tapCreatures ?? []), ...exclude], use);
  if (first && taps) taps = taps.map((a) => (a.type === "activateMana" || a.type === "activateAbility" ? { ...a, forNext: true as const } : a));
  // Waterbend with nothing chosen to tap: mana first, then as few artifacts and creatures as it takes (CR 701.67a).
  if (!taps && ab.waterbend !== undefined && tapCreatures === undefined) {
    const wb = autoWaterbend(s, pid, cost, (x ?? 0) * xCount(cost), ab.waterbend === "X" ? (x ?? 0) : ab.waterbend, ab.tap ? [objectId, ...exclude] : exclude, use);
    if (wb) [taps, tapCreatures] = [wb.taps, wb.tapped];
  }
  if (!taps) return null;
  return [...taps, { type: "activateAbility", player: pid, objectId, index, targets, ...(modes ? { modes } : {}), ...(tapCreatures ? { tapCreatures } : {}), ...(x ? { x } : {}), ...(costs ? { costs } : {}), ...(pick?.mana ? { mana: pick.mana } : {}), ...(pick?.extra?.length ? { extra: pick.extra } : {}) }];
}

/** The ways to make mana by tapping `id` with nothing else to pay ("{T}: Add {G}"). */
function tapManaOptions(s: GameState, pid: PlayerId, id: ObjectId): Option[] {
  const o = obj(s, id);
  const taps = (x: Option) => (x.activated ? abilitiesOf(s, o).activated[x.ability]?.tap : manaAbilitiesOn(s, o)[x.ability]?.tap);
  return (manaSources(s, pid, [], "other").find((src) => src.id === id)?.options ?? []).filter((x) => !x.cost && !x.tapCost && taps(x) && !(x.activated ? abilitiesOf(s, o).activated[x.ability]?.sacrificeSelf : manaAbilitiesOn(s, o)[x.ability]?.sacrificeSelf));
}

/**
 * Choose mana abilities to activate so the pool can pay `cost` (+ `extraGeneric`). Sources
 * that cost nothing come first; when they aren't enough, abilities that cost mana and make
 * more of it or a color we lack (a Signet: "{1}, {T}: Add {W}{U}") are paid for and added.
 */
export function planMana(s: GameState, pid: PlayerId, cost0: ParsedCost, extraGeneric = 0, exclude?: ObjectId, alsoExclude: ObjectId[] = [], use: ManaUse = "other", harm?: Partial<Record<Color, number>>, wantSnow = false): Action[] | null {
  const excluded = [...(exclude ? [exclude] : []), ...alsoExclude];
  return planManaWith(s, pid, cost0, extraGeneric, excluded, use, harm, wantSnow) ?? planXMana(s, pid, cost0, extraGeneric, excluded, use, harm, wantSnow) ?? planCubeMana(s, pid, cost0, extraGeneric, excluded, use, harm, wantSnow);
}

/**
 * Doubling Cube's "{3}, {T}: Double the amount of each type of unspent mana you have" (ManaProduce "doublePool"), used
 * only when nothing else pays: other sources first make half of what's asked (half of each color, rounded up) and the
 * {3}, then the Cube pays its {3} from the pool and doubles what's left. The plan is tried on a copy of the game, and
 * kept only if the doubled pool pays the whole cost (with whichever way of paying the {3} lets it).
 */
export function planCubeMana(s: GameState, pid: PlayerId, cost0: ParsedCost, extraGeneric: number, excluded: ObjectId[], use: ManaUse, harm?: Partial<Record<Color, number>>, wantSnow = false): Action[] | null {
  if (wantSnow || s.priority !== pid || s.pending || s.over) return null;
  const cubes = s.battlefield.filter((id) => {
    if (excluded.includes(id)) return false;
    const o = obj(s, id);
    return controllerOf(s, o) === pid && manaAbilitiesOn(s, o).some((ab) => ab.produces.kind === "doublePool");
  });
  if (!cubes.length || cost0.symbols.some((x) => x.kind === "unsupported")) return null;
  const total = manaValue(cost0) + extraGeneric;
  const colored = new Map<ManaType, number>();
  for (const x of cost0.symbols) if (x.kind === "colored") colored.set(x.color, (colored.get(x.color) ?? 0) + 1);
  const halves = [...colored].map(([m, n]) => [m, Math.ceil(n / 2)] as const);
  const named = halves.reduce((a, [, n]) => a + n, 0);
  for (const cube of cubes) {
    const o = obj(s, cube);
    const ability = manaAbilitiesOn(s, o).findIndex((ab) => ab.produces.kind === "doublePool");
    const ab = manaAbilitiesOn(s, o)[ability]!;
    if (manaAbilityProblem(s, pid, o, ability, true)) continue;
    const cubeCost = activationLessCost(s, o, parseManaCost(ab.manaCost));
    if (cubeCost.symbols.some((x) => x.kind !== "generic")) continue;
    const half = halves.map(([m, n]) => `{${m}}`.repeat(n)).join("") + `{${Math.max(0, Math.ceil(total / 2) - named) + manaValue(cubeCost)}}`;
    const before = planManaWith(s, pid, parseManaCost(half), 0, [...excluded, cube], use, harm);
    if (!before) continue;
    const t = cloneState(s);
    try {
      for (const a of before) applyInPlace(t, a);
    } catch {
      continue;
    }
    if (t.priority !== pid || t.pending) continue;
    const combos = manaCombos(t, obj(t, cube), ab) ?? [];
    for (let combo = 0; combo < combos.length; combo++) {
      const doubling: Action = { type: "activateMana", player: pid, objectId: cube, mana: combos[combo]![0]!, ability, combo };
      let u: GameState;
      try {
        u = applyAction(t, doubling);
      } catch {
        continue;
      }
      if (u.priority === pid && !u.pending && planManaWith(u, pid, cost0, extraGeneric, [...excluded, cube], use, harm)?.length === 0) return [...before, doubling];
    }
  }
  return null;
}

/**
 * Hazel of the Rootbloom's "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors":
 * a mana ability whose X is announced as it's activated (CR 107.3a, 605.1a, 602.2b). It costs life and taps tokens, so
 * it's used only when the other sources can't pay: the fewest tokens (the ones that make no mana and couldn't attack
 * first, as for other tap costs), the colors the cost still asks for, the rest of its mana for generic.
 */
function planXMana(s: GameState, pid: PlayerId, cost0: ParsedCost, extraGeneric: number, excluded: ObjectId[], use: ManaUse, harm?: Partial<Record<Color, number>>, wantSnow = false): Action[] | null {
  if (use !== "other" && "spell" in use && use.spell && use.treasureOnly) return null;
  const only = usableTypes(use);
  const need = new Map<Color, number>();
  for (const sym of cost0.symbols) {
    const named: ManaType[] = sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid" ? [sym.color] : sym.kind === "hybrid" ? sym.options : [];
    for (const c of named) if (c !== "C") need.set(c, (need.get(c) ?? 0) + 1);
  }
  const colors = COLORS.filter((c) => need.has(c) && (!only || only.includes(c)));
  const spare = colors[0] ?? COLORS.find((c) => !only || only.includes(c));
  if (!spare) return null;
  const most = manaValue(cost0) + extraGeneric;
  for (const id of s.battlefield) {
    if (excluded.includes(id)) continue;
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    for (const [index, ab] of abilitiesOf(s, o).activated.entries()) {
      const tapX = ab.costs?.length === 1 && ab.costs[0]!.kind === "tap" && ab.costs[0]!.x ? ab.costs[0]! : undefined;
      const e = ab.body.effects.length === 1 ? ab.body.effects[0]! : undefined;
      if (!ab.mana || !tapX || ab.manaCost || ab.body.modal || e?.type !== "addMana" || !e.anyColors || e.only || JSON.stringify(e.times) !== JSON.stringify({ count: { kind: "x" } })) continue;
      const candidates = tapPreference(s, tapCostCandidates(s, pid, o, tapX).filter((t) => !excluded.includes(t)));
      for (let k = 1; k <= Math.min(candidates.length, most); k++) {
        const tokens = candidates.slice(0, k);
        if (abilityProblem(s, pid, id, index, undefined, undefined, undefined, k, { tap: tokens })) continue;
        // Each mix: how much of each named color (no more than the cost asks for), the rest in one color for generic.
        let mixes: Partial<Record<Color, number>>[] = [{}];
        for (const c of colors) mixes = mixes.flatMap((m) => Array.from({ length: (need.get(c) ?? 0) + 1 }, (_, n) => ({ ...m, [c]: n })));
        const total = (m: Partial<Record<Color, number>>) => COLORS.reduce((n, c) => n + (m[c] ?? 0), 0);
        mixes = mixes.filter((m) => total(m) <= k).sort((a, b) => total(b) - total(a));
        for (const m0 of mixes) {
          const counts = { ...m0, [spare]: (m0[spare] ?? 0) + k - total(m0) };
          const bonus = emptyPool();
          for (const c of COLORS) bonus[c] += counts[c] ?? 0;
          const taps = planManaWith(s, pid, cost0, extraGeneric, [...excluded, id, ...tokens], use, harm, wantSnow, bonus, (ab.lifeCost ?? 0) + manaLifeTax(s, o));
          if (taps) return [...taps, { type: "activateAbility", player: pid, objectId: id, index, x: k, costs: { tap: tokens } }, { type: "manaMix", player: pid, counts: Object.fromEntries(Object.entries(counts).filter(([, n]) => n)) }];
        }
      }
    }
  }
  return null;
}

/** planMana without Hazel's X mana: `bonus` is mana to count on besides the pool, `lifeLess` life already spent. */
function planManaWith(s: GameState, pid: PlayerId, cost0: ParsedCost, extraGeneric: number, excluded: ObjectId[], use: ManaUse, harm?: Partial<Record<Color, number>>, wantSnow = false, bonus?: ManaPool, lifeLess = 0): Action[] | null {
  const p = player(s, pid);
  const life = payableLife(s, pid) - lifeLess;
  // Only the mana that can be spent on this counts (CR 106.6); `restricted` is how much of the pool can't be spent
  // on anything else, such as a Signet's cost. `snow`: how much of it is snow mana (CR 107.4h).
  const start = poolFor(s, pid, use);
  if (bonus) for (const m of Object.keys(bonus) as ManaType[]) start.pool[m] += bonus[m];
  const colorOnly = start.colorOnly ?? emptyPool();
  if (payFromPool(cost0, start.pool, extraGeneric, life, { snow: start.snow, wantSnow, colorOnly })) return [];
  // K'rrik's "you may pay 2 life rather than pay that mana" for {B}: mana from the player's sources first, life once
  // they can't make it (planFree).
  const cost = payableCost(s, pid, cost0, use);
  const sources = manaSources(s, pid, excluded, use);
  const unrestricted = sources.map((src) => ({ ...src, options: src.options.filter((x) => !x.restricted) }));
  const needColors = namedColors(cost);
  const demand = colorDemand(s, pid, use);
  let pool: ManaPool = start.pool;
  let snow: ManaPool = start.snow;
  const restricted: ManaPool = start.prefer;
  let used = new Set<ObjectId>();
  const taps: Action[] = [];
  for (let round = 0; round < 8; round++) {
    const plan = planFree(cost, extraGeneric, life, pool, sources, used, undefined, demand, harm, snow, wantSnow, colorOnly);
    if (plan) return [...taps, ...plan.chosen.map((x) => toAction(pid, x))];
    // Add one mana ability that costs mana: one making a color the cost names first, then the biggest net gain.
    const costed = sources
      .filter((src) => !used.has(src.id))
      .flatMap((src) => src.options.filter((x) => x.cost && !x.tapCost && !x.colorOnly))
      .map((x) => ({ x, net: x.adds.length - manaValue(x.cost!), color: x.adds.some((m) => needColors.has(m) && pool[m] === 0) }))
      .filter((c) => c.color || c.net > 0)
      .sort((a, b) => Number(b.color) - Number(a.color) || b.net - a.net || a.x.penalty - b.x.penalty);
    // The first that can be paid for, unless a later one finishes the payment right away (a filter land's {W}{U}
    // rather than its {W}{W}).
    let pick: { actions: Action[]; pool: ManaPool; snow: ManaPool; restricted: ManaPool; used: Set<ObjectId> } | undefined;
    for (const { x } of costed) {
      const others = unrestricted.filter((src) => src.id !== x.id);
      const free = { ...pool };
      for (const m of Object.keys(free) as ManaType[]) free[m] -= restricted[m];
      const pay = planFree(x.cost!, 0, life, free, others, used, needColors, demand, undefined, snow);
      if (!pay) continue;
      const paid = payFromPool(x.cost!, pay.pool, 0, Infinity, { snow: pay.snow })!;
      const next = paid.pool;
      const nextSnow = { ...pay.snow };
      for (const m of Object.keys(nextSnow) as ManaType[]) nextSnow[m] -= paid.snow[m];
      for (const m of x.snow ?? []) nextSnow[m]++;
      const nextRestricted = { ...restricted };
      for (const m of Object.keys(next) as ManaType[]) next[m] += restricted[m];
      for (const m of x.adds) {
        next[m]++;
        if (x.restricted) nextRestricted[m]++;
      }
      const option = { actions: [...pay.chosen.map((y) => toAction(pid, y)), toAction(pid, x)], pool: next, snow: nextSnow, restricted: nextRestricted, used: new Set([...pay.used, x.id]) };
      const done = !!planFree(cost, extraGeneric, life, next, sources, option.used, undefined, demand, harm, nextSnow, wantSnow, colorOnly);
      if (!pick || done) pick = option;
      if (done) break;
    }
    if (!pick) return null;
    taps.push(...pick.actions);
    pool = pick.pool;
    snow = pick.snow;
    for (const m of Object.keys(restricted) as ManaType[]) restricted[m] = pick.restricted[m];
    used = pick.used;
  }
  return null;
}

/** The actions to activate one mana ability, paying any mana it costs first. */
export function planManaAbility(s: GameState, pid: PlayerId, objectId: ObjectId, ability: number, mana: ManaType, tap?: ObjectId[], extra?: ManaType[], combo?: number): Action[] | null {
  const o = obj(s, objectId);
  if (manaAbilityProblem(s, pid, o, ability, true, tap)) return null;
  const ab = manaAbilitiesOn(s, o)[ability]!;
  // "Tap an untapped creature you control": what's given, or the best to tap.
  const tapped = ab.tapCost ? (tap ?? tapPreference(s, tapCostCandidates(s, pid, o, ab.tapCost)).slice(0, ab.tapCost.n)) : undefined;
  // Doubling Cube doubles the pool, so its cost is paid from the pool as it is (ManaProduce "doublePool").
  if (ab.produces.kind === "doublePool") return manaAbilityProblem(s, pid, o, ability) || !manaCombos(s, o, ab)?.[combo ?? -1] ? null : [{ type: "activateMana", player: pid, objectId, mana, ability, combo: combo! }];
  const taps = ab.manaCost ? planMana(s, pid, manaAbilityCost(s, pid, o, ab.manaCost), 0, objectId, tapped, { ability: o }) : [];
  return taps ? [...taps, { type: "activateMana", player: pid, objectId, mana, ability, ...(combo !== undefined ? { combo } : {}), ...(tapped ? { tap: tapped } : {}), ...(extra?.length ? { extra } : {}) }] : null;
}

/** Tap what's needed and turn a face-down permanent face up (CR 702.37e), or null if that can't be done now. */
export function planTurnFaceUp(s: GameState, pid: PlayerId, id: ObjectId, way = 0, x = 0, costs?: CostChoices): Action[] | null {
  const o = s.objects[id];
  const fd = o && faceUpCost(s, o, way);
  if (!fd) return null;
  const problem = turnFaceUpProblem(s, pid, id, way, x, costs);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(faceUpManaCost(fd.cost, x))) : [];
  return taps ? [...taps, { type: "turnFaceUp", player: pid, objectId: id, ...(way ? { way } : {}), ...(x ? { x } : {}), ...(costs && Object.keys(costs).length ? { costs } : {}) }] : null;
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

/** Tap mana for a Room's locked door's unlock cost, then unlock it (CR 709.5e), or null if that can't be done now. */
export function planUnlock(s: GameState, pid: PlayerId, id: ObjectId, door: number): Action[] | null {
  const o = s.objects[id];
  const cost = o && unlockCost(s, o, door);
  if (cost === undefined) return null;
  const problem = unlockProblem(s, pid, id, door);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(cost)) : [];
  return taps ? [...taps, { type: "unlockDoor", player: pid, objectId: id, door }] : null;
}

/** Tap mana to pay to end an effect on this permanent (a Licid; CR 116.2c), then end it, or null if that can't be done now. */
export function planEndEffect(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const e = endableEffect(s, pid, id);
  if (!e) return null;
  const problem = endEffectProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(e.endable!.cost)) : [];
  return taps ? [...taps, { type: "endEffect", player: pid, objectId: id }] : null;
}

/** Tap mana for a card's plot cost, then plot it (CR 702.170a), or null if that can't be done now. */
export function planPlot(s: GameState, pid: PlayerId, id: ObjectId): Action[] | null {
  const o = s.objects[id];
  const cost = o && plotCost(s, pid, defOf(s, o));
  if (!cost) return null;
  const problem = plotProblem(s, pid, id);
  if (problem && !/not enough mana/.test(problem)) return null;
  const taps = problem ? planMana(s, pid, parseManaCost(cost)) : [];
  return taps ? [...taps, { type: "plot", player: pid, objectId: id }] : null;
}

/** Will this spell gain sunburst as it's cast (Lux Artillery's "Whenever you cast an artifact creature spell, it gains sunburst")? */
function gainsSunburst(s: GameState, pid: PlayerId, d: CardDef): boolean {
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) return false;
    return abilitiesOf(s, o).triggers.some((t) => t.event === "castSpell" && t.cast?.by === "you" && !!t.cast.spell && printedMatches(t.cast.spell, d) && t.body.effects.some((e) => e.type === "spellGains" && e.mods.some((m) => m.kind === "addKeywords" && m.keywords.includes("Sunburst"))));
  });
}

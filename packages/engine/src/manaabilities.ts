// Mana abilities (CR 605) as they are on the battlefield: what each one can make right now,
// whether it can be activated, and which one to use for a given mana.

import type { ManaAbility, ManaTrigger } from "./abilities";
import { abilitiesOf, basicLandManaAbility, defOf, objIsType } from "./cards";
import { objectMatches } from "./effects";
import { isSummoningSick, obj, player, tapCostCandidates } from "./game";
import { characteristics, controllerOf, staticConditionNow } from "./layers";
import { parseManaCost } from "./mana";
import { canPayFromPool } from "./spend";
import { compileCard, compileGranted } from "./oracle";
import { COLORS, type Action, type Color, type GameObject, type GameState, type ManaType, type ObjectId, type PlayerId } from "./types";

/** activatedThisTurn holds activated ability indexes; mana abilities are recorded past this offset. */
export const MANA_ABILITY_OFFSET = 1000;

/**
 * The mana abilities an object has right now: one for each basic land type it has (CR 305.6),
 * then its own, unless an effect removed its abilities (CR 613.1f).
 */
export function manaAbilitiesOn(s: GameState, o: GameObject): ManaAbility[] {
  const c = characteristics(s, o);
  const out = c.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null);
  if (c.hasPrintedAbilities) out.push(...compileCard(defOf(s, o)).mana);
  for (const t of c.grantedAbilities) out.push(...compileGranted(t).mana); // 'Enchanted land has "{T}: Add ..."'
  return out;
}

/** Colors in the color identity of `pid`'s commander(s) (CR 903.4). */
function commanderIdentity(s: GameState, pid: PlayerId): ManaType[] {
  const ids = new Set<ManaType>();
  for (const o of Object.values(s.objects)) if (o.isCommander && o.owner === pid) s.cards[o.cardId]?.colorIdentity.forEach((c) => ids.add(c));
  return COLORS.filter((c) => ids.has(c));
}

/** The mana a player picks from when activating it: one entry per possible result. */
export function manaChoices(s: GameState, o: GameObject, ab: ManaAbility): ManaType[] {
  const p = ab.produces;
  if (p.kind === "fixed") return [p.mana[0]!];
  if (p.kind === "oneOf") return p.options;
  if (p.kind === "chosenColor") {
    const c = o.chosen?.color;
    return [...(p.also ? [p.also] : []), ...(c && c !== p.also ? [c] : [])];
  }
  return commanderIdentity(s, controllerOf(s, o));
}

/** Exactly what activating it with `choice` adds to the pool. */
export function manaProduced(s: GameState, o: GameObject, ab: ManaAbility, choice: ManaType): ManaType[] {
  const p = ab.produces;
  if (p.kind === "oneOf") return Array<ManaType>(p.amount).fill(choice);
  if (p.kind === "commanderIdentity" || p.kind === "chosenColor") return [choice];
  if (!p.count) return p.mana;
  const pid = controllerOf(s, o);
  const n = s.battlefield.filter((id) => objectMatches(s, p.count!, obj(s, id), pid, false)).length;
  return Array.from({ length: n }, () => p.mana).flat();
}

/**
 * A way to make mana with this object: one ability, one choice, and what the triggered mana abilities it triggers
 * add with it. `extra`: the mana picked for those, in battlefield order ("one mana of any color").
 */
export interface ManaOption {
  ability: number;
  mana: ManaType;
  adds: ManaType[];
  extra?: ManaType[];
}

/** The triggered mana abilities on the battlefield (CR 605.1b) and their sources. */
function manaTriggerSources(s: GameState): { src: GameObject; t: ManaTrigger }[] {
  return s.battlefield.flatMap((id) => {
    const src = obj(s, id);
    return (abilitiesOf(s, src).manaTriggers ?? []).map((t) => ({ src, t }));
  });
}

/**
 * What the triggered mana abilities add when `pid` taps `o` for mana with `ab`, making `made`: one entry per way to
 * pick their mana (`extra`, the picks). Tapping it for mana is activating a mana ability of it with {T} in the cost
 * (CR 106.12; not tapping it for another permanent's cost, rulings on Leyline of Abundance), and they trigger only
 * when that makes mana (106.12a). They resolve right after it (CR 605.4a), each adding its mana.
 */
export function manaTriggerResults(s: GameState, pid: PlayerId, o: GameObject, ab: ManaAbility, made: ManaType[], sources = manaTriggerSources(s)): { extra: ManaType[]; adds: ManaType[] }[] {
  let results: { extra: ManaType[]; adds: ManaType[] }[] = [{ extra: [], adds: [] }];
  if (!ab.tap || !made.length) return results;
  for (const { src, t } of sources) {
    const ctl = controllerOf(s, src);
    const chosen = src.chosen?.color;
    if (t.you && ctl !== pid) continue;
    if (t.attached && src.attachedTo !== o.id) continue;
    if (t.filter && !objectMatches(s, t.filter, o, ctl, false)) continue;
    if ((t.ofChosen || t.adds.kind === "chosenColor") && !chosen) continue; // no color chosen: it never triggers (rulings on Gauntlet of Power)
    if (t.ofChosen && !made.includes(chosen!)) continue;
    let picks: { extra: ManaType[]; adds: ManaType[] }[];
    const a = t.adds;
    if (a.kind === "fixed") picks = [{ extra: [], adds: a.mana }];
    else if (a.kind === "chosenColor") picks = [{ extra: [], adds: [chosen!] }];
    else if (a.kind === "produced") {
      // One of the types it made, picked if it made several (rulings on Mana Flare).
      const types = [...new Set(made)];
      picks = types.length === 1 ? [{ extra: [], adds: types }] : types.map((m) => ({ extra: [m], adds: [m] }));
    } else {
      // n mana in any combination of colors: each combination once.
      let combos: Color[][] = [[]];
      for (let i = 0; i < a.n; i++) combos = combos.flatMap((c) => COLORS.filter((x) => !c.length || COLORS.indexOf(x) >= COLORS.indexOf(c[c.length - 1]!)).map((x) => [...c, x]));
      picks = combos.map((c) => ({ extra: c, adds: c }));
    }
    results = results.flatMap((r) => picks.map((p) => ({ extra: [...r.extra, ...p.extra], adds: [...r.adds, ...p.adds] })));
  }
  return results;
}

export function manaOptions(s: GameState, o: GameObject): ManaOption[] {
  const pid = controllerOf(s, o);
  const sources = manaTriggerSources(s);
  return manaAbilitiesOn(s, o).flatMap((ab, ability) =>
    manaChoices(s, o, ab).flatMap((mana) => {
      const adds = manaProduced(s, o, ab, mana);
      return manaTriggerResults(s, pid, o, ab, adds, sources).map((r) => ({ ability, mana, adds: [...adds, ...r.adds], ...(r.extra.length ? { extra: r.extra } : {}) }));
    }),
  );
}

/**
 * Why `pid` can't activate this mana ability right now, or null if they can, paying any mana
 * part of the cost from their pool. With `ignorePool`, the mana part isn't checked.
 */
export function manaAbilityProblem(s: GameState, pid: PlayerId, o: GameObject, index: number, ignorePool = false, tap?: ObjectId[]): string | null {
  const ab = manaAbilitiesOn(s, o)[index];
  const name = characteristics(s, o).name;
  if (!ab) return `${name} has no such mana ability`;
  if (o.zone !== "battlefield" || controllerOf(s, o) !== pid) return "you don't control that permanent";
  if (characteristics(s, o).cantActivate === "all") return `${name}'s activated abilities can't be activated`; // Arrest: mana abilities too (CR 605.1a)
  if (ab.tap && o.tapped) return `${name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && isSummoningSick(s, o)) return `${name} has summoning sickness`; // CR 302.6
  if (ab.oncePerTurn && o.activatedThisTurn?.includes(MANA_ABILITY_OFFSET + index)) return `${name}'s ability can be activated only once each turn`;
  if (ab.activeIf && !staticConditionNow(s, ab.activeIf, o.id, pid)) return `${name} doesn't have that ability now`; // max speed (CR 702.178a)
  const p = player(s, pid);
  if (ab.lifeCost && p.life < ab.lifeCost) return `you need ${ab.lifeCost} life to pay`; // CR 119.4
  if (ab.energyCost && (p.energy ?? 0) < ab.energyCost) return `you need ${ab.energyCost} energy`; // CR 107.14
  if (ab.removeCounters && (o.counters[ab.removeCounters.counter] ?? 0) < ab.removeCounters.n) return `${name} doesn't have enough ${ab.removeCounters.counter} counters`;
  if (!ignorePool && ab.manaCost && !canPayFromPool(s, pid, parseManaCost(ab.manaCost), { ability: o })) return "not enough mana";
  // "Tap an untapped creature you control" (CR 602.2b): without a choice, whether there's enough to tap.
  if (ab.tapCost) {
    const can = tapCostCandidates(s, pid, o, ab.tapCost);
    if (!tap) return can.length >= ab.tapCost.n ? null : `you need to tap ${ab.tapCost.n === 1 ? "an" : ab.tapCost.n} ${ab.tapCost.filter.text}`;
    if (tap.length !== ab.tapCost.n || new Set(tap).size !== tap.length || tap.some((id) => !can.includes(id))) return `choose ${ab.tapCost.n === 1 ? "an" : ab.tapCost.n} ${ab.tapCost.filter.text} to tap`;
  } else if (tap?.length) return "that ability doesn't tap other permanents";
  return null;
}

/** How much a player gives up by using it, beyond the tap: lower is better. */
export function manaPenalty(ab: ManaAbility): number {
  return (ab.sacrificeSelf ? 8 : 0) + (ab.manaCost ? 4 : 0) + (ab.selfDamage || ab.lifeCost || ab.energyCost || ab.removeCounters || ab.tapCost ? 2 : 0) + (ab.skipNextUntap ? 1 : 0);
}

/**
 * Which ability an "add {G} with this" action uses when it doesn't say: the cheapest one that
 * can make that mana right now (a player would choose the ability that keeps the permanent).
 */
export function pickManaAbility(s: GameState, pid: PlayerId, o: GameObject, mana: ManaType): number | undefined {
  const abs = manaAbilitiesOn(s, o);
  return abs
    .map((ab, i) => ({ ab, i }))
    .filter(({ ab, i }) => manaChoices(s, o, ab).includes(mana) && !manaAbilityProblem(s, pid, o, i) && !ab.tapCost)
    .sort((a, b) => manaPenalty(a.ab) - manaPenalty(b.ab))[0]?.i;
}

/** The ability an activateMana action uses. */
export function manaActionAbility(s: GameState, a: Extract<Action, { type: "activateMana" }>): ManaAbility | undefined {
  const o = obj(s, a.objectId);
  const i = a.ability ?? pickManaAbility(s, a.player, o, a.mana);
  return i === undefined ? undefined : manaAbilitiesOn(s, o)[i];
}

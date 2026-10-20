// Mana abilities (CR 605) as they are on the battlefield: what each one can make right now,
// whether it can be activated, and which one to use for a given mana.

import { allEffects, type ActivatedAbility, type ManaAbility, type ManaProduce, type ManaTrigger } from "./abilities";
import { abilitiesOf, basicLandManaAbility, defOf, objIsType } from "./cards";
import { objectMatches } from "./effects";
import { abilityProblem, linkedExileCards, obj, payableLife, player, tapAbilitySick, tapCostCandidates } from "./game";
import { characteristics, controllerOf, staticConditionNow } from "./layers";
import { parseManaCost } from "./mana";
import { evalAmount } from "./amounts";
import { canPayFromPool, manaOriginsOf } from "./spend";
import { compileCard, compileGranted } from "./oracle";
import { nameActivationBan } from "./names";
import { COLORS, type Action, type Color, type GameObject, type GameState, type ManaOrigin, type ManaType, type ObjectId, type PlayerId } from "./types";

/** activatedThisTurn holds activated ability indexes; mana abilities are recorded past this offset. */
export const MANA_ABILITY_OFFSET = 1000;

/**
 * The mana abilities an object has right now: one for each basic land type it has (CR 305.6),
 * then its own, unless an effect removed its abilities (CR 613.1f).
 */
export function manaAbilitiesOn(s: GameState, o: GameObject): ManaAbility[] {
  const c = characteristics(s, o);
  const out = c.landAbilitiesLost ? [] : c.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null);
  if (c.hasPrintedAbilities) out.push(...compileCard(defOf(s, o)).mana);
  for (const t of c.grantedAbilities) out.push(...compileGranted(t).mana); // 'Enchanted land has "{T}: Add ..."'
  // "If ~ has a luck counter on it, instead add one mana of any color" (Gemstone Caverns): what it makes now.
  return out.map((ab) => (ab.insteadIf && staticConditionNow(s, ab.insteadIf.cond, o.id, controllerOf(s, o)) ? { ...ab, produces: ab.insteadIf.produces } : ab));
}

/** Colors in the color identity of `pid`'s commander(s) (CR 903.4). */
export function commanderIdentity(s: GameState, pid: PlayerId): ManaType[] {
  const ids = new Set<ManaType>();
  for (const o of Object.values(s.objects)) if (o.isCommander && o.owner === pid) s.cards[o.cardId]?.colorIdentity.forEach((c) => ids.add(c));
  return COLORS.filter((c) => ids.has(c));
}

/**
 * The types of mana the lands `whose` (relative to `pid`) could produce (CR 106.7): what their mana abilities would
 * make if they resolved now, whatever their costs. A land whose ability asks the same question of other lands counts
 * what those could produce, except the ones already being asked about (`asking`): Exotic Orchards that only see each
 * other make no mana (rulings).
 */
function landsCouldProduce(s: GameState, pid: PlayerId, whose: "you" | "opponent", anyType: boolean, asking: ReadonlySet<ObjectId>): ManaType[] {
  const out = new Set<ManaType>();
  for (const id of s.battlefield) {
    const land = obj(s, id);
    const ctrl = controllerOf(s, land);
    if (asking.has(id) || !objIsType(s, land, "Land") || (whose === "you" ? ctrl !== pid : ctrl === pid)) continue;
    for (const ab of manaAbilitiesOn(s, land)) {
      if (ab.activeIf && !staticConditionNow(s, ab.activeIf, land.id, ctrl)) continue;
      const p = ab.produces;
      const made = p.kind === "fixed" ? p.mana : p.kind === "landsCouldProduce" ? landsCouldProduce(s, ctrl, p.whose, !!p.anyType, new Set([...asking, id])) : manaChoices(s, land, ab);
      made.forEach((m) => out.add(m));
    }
    // Its activated mana abilities too ("{T}, Sacrifice a creature: Add {B}{B}"): whatever their costs (CR 106.7).
    for (const ab of abilitiesOf(s, land).activated) if (ab.mana) activatedManaTypes(s, land, ab).forEach((m) => out.add(m));
  }
  return (["W", "U", "B", "R", "G", "C"] as ManaType[]).filter((m) => out.has(m) && (anyType || m !== "C"));
}

/** The mana a player picks from when activating it: one entry per possible result. */
export function manaChoices(s: GameState, o: GameObject, ab: ManaAbility): ManaType[] {
  const p = ab.produces;
  if (p.kind === "fixed") return [p.mana[0]!];
  if (p.kind === "oneOf") return p.options;
  if (p.kind === "landsCouldProduce") return landsCouldProduce(s, controllerOf(s, o), p.whose, !!p.anyType, new Set([o.id]));
  if (p.kind === "chosenColor") {
    const c = o.chosen?.color;
    return [...(p.also ? [p.also] : []), ...(c && c !== p.also ? [c] : [])];
  }
  // A combination is picked by its number (`combo`); these are the types it could make (CR 106.7).
  if (p.kind === "combos") return [...new Set(p.options.flat())];
  if (p.kind === "removeX") return p.colors;
  if (p.kind === "colorsAmong") return colorsAmong(s, o, p);
  // "For each color among permanents you control": all of them at once, whichever is named (none with no color).
  if (p.kind === "eachColorAmong") return eachColorAmong(s, o);
  if (p.kind === "devotion") return [...COLORS];
  return commanderIdentity(s, controllerOf(s, o));
}

/**
 * Colors among the permanents matching `p.filter` that its controller controls (Mox Amber), or of the card its linked
 * imprint ability exiled (Chrome Mox, CR 607.2a): as they are now (CR 106.7, 605.3).
 */
function colorsAmong(s: GameState, o: GameObject, p: Extract<ManaProduce, { kind: "colorsAmong" }>): ManaType[] {
  const pid = controllerOf(s, o);
  const from = p.linked ? linkedExileCards(s, o) : s.battlefield.filter((id) => objectMatches(s, p.filter!, obj(s, id), pid, false));
  const colors = new Set(from.flatMap((id) => characteristics(s, obj(s, id)).colors));
  return COLORS.filter((c) => colors.has(c));
}

/** The colors among permanents `o`'s controller controls (CR 105.2): Bloom Tender itself counts if it has a color. */
function eachColorAmong(s: GameState, o: GameObject): ManaType[] {
  const pid = controllerOf(s, o);
  const colors = new Set(s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid).flatMap((id) => characteristics(s, obj(s, id)).colors));
  return COLORS.filter((c) => colors.has(c));
}

/**
 * The ways to activate a storage land's ability (ManaProduce "removeX"), numbered as `combo`: each number of counters
 * from `min` to how many are on it, and for two colors each split of that much mana between them (CR 107.3a).
 */
export function removeXCombos(o: GameObject, p: Extract<ManaProduce, { kind: "removeX" }>): ManaType[][] {
  const out: ManaType[][] = [];
  const [a, b] = p.colors;
  for (let x = p.min; x <= (o.counters[p.counter] ?? 0); x++)
    for (let i = x; i >= (b ? 0 : x); i--) out.push([...Array<ManaType>(i).fill(a!), ...Array<ManaType>(x - i).fill(b ?? a!)]);
  return out;
}

/** The combinations an ability is activated with (ManaOption.combo), or null if it has none to choose from. */
export function manaCombos(o: GameObject, ab: ManaAbility): ManaType[][] | null {
  const p = ab.produces;
  return p.kind === "combos" ? p.options : p.kind === "removeX" ? removeXCombos(o, p) : null;
}

/**
 * How many times as much mana `pid` gets for tapping a permanent for mana (CR 106.12): the replacement effects of the
 * permanents they control that say "If you tap a permanent for mana, it produces twice as much of that mana instead"
 * (CR 106.12b). They multiply together (rulings on Mana Reflection), so the order they apply in doesn't matter (616.1).
 */
export function tapManaTimes(s: GameState, pid: PlayerId): number {
  let n = 1;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const times = abilitiesOf(s, o).tapManaTimes;
    if (times && controllerOf(s, o) === pid) n *= times;
  }
  return n;
}

/** The same mana `n` times as much (the riders on it stay with all of it, rulings on Mana Reflection). */
export const timesAsMuch = (mana: ManaType[], n: number): ManaType[] => (n === 1 ? mana : mana.flatMap((m) => Array<ManaType>(n).fill(m)));

/**
 * Exactly what activating it with `choice` (or the combination numbered `combo`, for "combos") adds to the pool:
 * multiplied when it's tapped for mana (`tapManaTimes`).
 */
export function manaProduced(s: GameState, o: GameObject, ab: ManaAbility, choice: ManaType, combo?: number): ManaType[] {
  const made = baseManaProduced(s, o, ab, choice, combo);
  return ab.tap && made.length ? timesAsMuch(made, tapManaTimes(s, controllerOf(s, o))) : made;
}

function baseManaProduced(s: GameState, o: GameObject, ab: ManaAbility, choice: ManaType, combo?: number): ManaType[] {
  const p = ab.produces;
  if (p.kind === "combos") return p.options[combo ?? -1] ?? [];
  if (p.kind === "removeX") return removeXCombos(o, p)[combo ?? -1] ?? [];
  if ((p.kind === "fixed" || p.kind === "oneOf") && p.n) {
    // CR 106.1: worked out as the ability resolves, with the permanent as "~" and its controller as "you".
    // "Of the chosen type" (Three Tree City): the type chosen for it as it entered.
    const n = evalAmount(s, p.n, { controller: controllerOf(s, o), sourceId: o.id, ...(o.chosen ? { chosen: o.chosen } : {}) });
    return Array<ManaType>(n).fill(p.kind === "oneOf" ? choice : p.mana[0]!);
  }
  if (p.kind === "oneOf") return Array<ManaType>(p.amount).fill(choice);
  if (p.kind === "commanderIdentity" || p.kind === "chosenColor" || p.kind === "landsCouldProduce" || p.kind === "colorsAmong") return [choice];
  if (p.kind === "eachColorAmong") return eachColorAmong(s, o);
  if (p.kind === "devotion") return Array<ManaType>(evalAmount(s, { count: { kind: "devotion", colors: [choice as Color] } }, { controller: controllerOf(s, o), sourceId: o.id })).fill(choice);
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
  /**
   * "Add {W}{W}, {W}{U}, or {U}{U}": which combination (ManaProduce "combos"); `mana` is its first. For a storage land
   * (ManaProduce "removeX"), how many counters it removes and how that mana is split.
   */
  combo?: number;
  /** A storage land's: how many counters it removes. */
  removes?: number;
  adds: ManaType[];
  extra?: ManaType[];
  /** The part of `adds` that's snow mana (CR 107.4h): its own if the source is snow, a triggered ability's if that one's is. */
  snow?: ManaType[];
}

/** The part of the mana a source and the triggered mana abilities make that's snow mana (CR 106.3, 107.4h). */
function snowPart(s: GameState, o: GameObject, adds: ManaType[], r: ManaTriggerResult): { snow?: ManaType[] } {
  const own = manaOriginsOf(s, o).includes("snow") ? adds : [];
  const snow = [...own, ...r.adds.filter((_, i) => r.from[i]?.includes("snow"))];
  return snow.length ? { snow } : {};
}

/** The triggered mana abilities on the battlefield (CR 605.1b) and their sources. */
function manaTriggerSources(s: GameState): { src: GameObject; t: ManaTrigger }[] {
  return s.battlefield.flatMap((id) => {
    const src = obj(s, id);
    return (abilitiesOf(s, src).manaTriggers ?? []).map((t) => ({ src, t }));
  });
}

/** What the triggered mana abilities add: the picks for their mana, the mana, and each mana's source (`from`, CR 106.3). */
export interface ManaTriggerResult {
  extra: ManaType[];
  adds: ManaType[];
  from: ManaOrigin[][];
}

/**
 * What the triggered mana abilities add when `pid` taps `o` for mana with `ab`, making `made`: one entry per way to
 * pick their mana (`extra`, the picks). Tapping it for mana is activating a mana ability of it with {T} in the cost
 * (CR 106.12; not tapping it for another permanent's cost, rulings on Leyline of Abundance), and they trigger only
 * when that makes mana (106.12a). They resolve right after it (CR 605.4a), each adding its mana.
 */
export function manaTriggerResults(s: GameState, pid: PlayerId, o: GameObject, ab: ManaAbility, made: ManaType[], sources = manaTriggerSources(s)): ManaTriggerResult[] {
  let results: ManaTriggerResult[] = [{ extra: [], adds: [], from: [] }];
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
    // Each mana's source is the triggered ability's source (CR 106.3), as it is now.
    const from = manaOriginsOf(s, src);
    results = results.flatMap((r) => picks.map((p) => ({ extra: [...r.extra, ...p.extra], adds: [...r.adds, ...p.adds], from: [...r.from, ...p.adds.map(() => from)] })));
  }
  return results;
}

export function manaOptions(s: GameState, o: GameObject): ManaOption[] {
  const pid = controllerOf(s, o);
  const sources = manaTriggerSources(s);
  return manaAbilitiesOn(s, o).flatMap((ab, ability) => {
    const combos = manaCombos(o, ab);
    const picks: { mana: ManaType; combo?: number }[] = combos ? combos.map((c, combo) => ({ mana: c[0] ?? manaChoices(s, o, ab)[0]!, combo })) : manaChoices(s, o, ab).map((mana) => ({ mana }));
    return picks.flatMap(({ mana, combo }) => {
      const adds = manaProduced(s, o, ab, mana, combo);
      const removed = ab.produces.kind === "removeX" ? { removes: combos![combo!]!.length } : {};
      return manaTriggerResults(s, pid, o, ab, adds, sources).map((r) => ({ ability, mana, ...(combo !== undefined ? { combo } : {}), ...removed, adds: [...adds, ...r.adds], ...(r.extra.length ? { extra: r.extra } : {}), ...snowPart(s, o, adds, r) }));
    });
  });
}

/**
 * Why `pid` can't activate this mana ability right now, or null if they can, paying any mana
 * part of the cost from their pool. With `ignorePool`, the mana part isn't checked.
 */
/**
 * Elvish Refueler (CR 702.177b): during your turn, as long as you haven't begun to activate an exhaust ability this turn,
 * you may activate exhaust abilities as though they haven't been activated.
 */
export function mayExhaustAgain(s: GameState, pid: PlayerId): boolean {
  if (s.activePlayer !== pid || s.players[pid]?.exhaustTurn === s.turn) return false;
  return s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && !!abilitiesOf(s, s.objects[id]!).exhaustAgain);
}

/**
 * "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments"
 * (Grand Abolisher, Myrel): why `pid` can't activate an ability of `o`, or null. Only permanents on the battlefield,
 * mana abilities too; cards in other zones (cycling, unearth) aren't stopped (rulings).
 */
export function abolisherBan(s: GameState, pid: PlayerId, o: GameObject): string | null {
  if (o.zone !== "battlefield" || pid === s.activePlayer || !["Artifact", "Creature", "Enchantment"].some((t) => objIsType(s, o, t))) return null;
  const src = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === s.activePlayer && abilitiesOf(s, obj(s, id)).opponentsCantActivateYourTurn);
  return src ? `${characteristics(s, obj(s, src)).name}: opponents can't activate abilities of artifacts, creatures or enchantments during ${player(s, s.activePlayer).name}'s turn` : null;
}

export function manaAbilityProblem(s: GameState, pid: PlayerId, o: GameObject, index: number, ignorePool = false, tap?: ObjectId[]): string | null {
  const ab = manaAbilitiesOn(s, o)[index];
  const name = characteristics(s, o).name;
  if (!ab) return `${name} has no such mana ability`;
  if (o.zone !== "battlefield" || controllerOf(s, o) !== pid) return "you don't control that permanent";
  if (characteristics(s, o).cantActivate === "all") return `${name}'s activated abilities can't be activated`; // Arrest: mana abilities too (CR 605.1a)
  const banned = nameActivationBan(s, o, true) ?? abolisherBan(s, pid, o); // Phyrexian Revoker, Grand Abolisher: mana abilities too
  if (banned) return banned;
  if (ab.tap && o.tapped) return `${name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && tapAbilitySick(s, o)) return `${name} has summoning sickness`; // CR 302.6
  if (ab.oncePerTurn && o.activatedThisTurn?.includes(MANA_ABILITY_OFFSET + index)) return `${name}'s ability can be activated only once each turn`;
  if (ab.onceEver && o.activatedEver?.includes(MANA_ABILITY_OFFSET + index) && !(ab.exhaust && mayExhaustAgain(s, pid))) return `${name}'s exhaust ability can be activated only once`; // CR 702.177a
  if (ab.activeIf && !staticConditionNow(s, ab.activeIf, o.id, pid)) return `${name} doesn't have that ability now`; // max speed (CR 702.178a)
  if (ab.activateIf && !staticConditionNow(s, ab.activateIf, o.id, pid)) return `${name}'s ability can't be activated now`; // CR 602.5b
  const p = player(s, pid);
  if (ab.lifeCost && payableLife(s, pid) < ab.lifeCost) return `you need ${ab.lifeCost} life to pay`; // CR 119.4, 119.8
  if (ab.energyCost && (p.energy ?? 0) < ab.energyCost) return `you need ${ab.energyCost} energy`; // CR 107.14
  if (ab.removeCounters && (o.counters[ab.removeCounters.counter] ?? 0) < ab.removeCounters.n) return `${name} doesn't have enough ${ab.removeCounters.counter} counters`;
  if (ab.produces.kind === "removeX" && (o.counters[ab.produces.counter] ?? 0) < ab.produces.min) return `${name} has no ${ab.produces.counter} counters`;
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
  // A storage land's counters are saved-up mana: spent only when nothing else will do.
  const stored = ab.produces.kind === "removeX" ? 6 : 0;
  return (ab.sacrificeSelf || ab.onceEver ? 8 : 0) + stored + (ab.manaCost ? 4 : 0) + (ab.selfDamage || ab.lifeCost || ab.energyCost || ab.removeCounters || ab.tapCost ? 2 : 0) + (ab.skipNextUntap || ab.putCounter ? 1 : 0);
}

/**
 * Which ability an "add {G} with this" action uses when it doesn't say: the cheapest one that
 * can make that mana right now (a player would choose the ability that keeps the permanent).
 */
export function pickManaAbility(s: GameState, pid: PlayerId, o: GameObject, mana: ManaType): number | undefined {
  const abs = manaAbilitiesOn(s, o);
  return abs
    .map((ab, i) => ({ ab, i }))
    .filter(({ ab, i }) => manaChoices(s, o, ab).includes(mana) && !manaAbilityProblem(s, pid, o, i) && !ab.tapCost && !manaCombos(o, ab))
    .sort((a, b) => manaPenalty(a.ab) - manaPenalty(b.ab))[0]?.i;
}

/** The ability an activateMana action uses. */
export function manaActionAbility(s: GameState, a: Extract<Action, { type: "activateMana" }>): ManaAbility | undefined {
  const o = obj(s, a.objectId);
  const i = a.ability ?? pickManaAbility(s, a.player, o, a.mana);
  return i === undefined ? undefined : manaAbilitiesOn(s, o)[i];
}

/**
 * An activated mana ability (CR 605.1a, `ActivatedAbility.mana`) seen as a `ManaAbility`, for planning a payment and
 * for the choices offered when it's activated: what it adds when that's known before it resolves (a fixed amount, or
 * one color chosen for it), and its costs. Null when what it adds depends on how it resolves ("If you control four or
 * more creatures, add {G}{G} instead", "for each ...").
 */
export function activatedAsMana(ab: ActivatedAbility): ManaAbility | null {
  if (!ab.mana || ab.body.modal) return null;
  const top = ab.body.effects;
  const adds = allEffects(top).filter((e) => e.type === "addMana");
  const e = adds.length === 1 && top.includes(adds[0]!) ? adds[0]! : undefined;
  if (e?.type !== "addMana") return null;
  let produces: ManaAbility["produces"];
  if (e.mana && e.times === undefined) produces = { kind: "fixed", mana: [...e.mana.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaType) };
  else if (!e.mana && e.chosen && top.some((c) => c.type === "choose" && c.choice === "color")) produces = { kind: "oneOf", options: [...COLORS], amount: e.chosen };
  else return null;
  return {
    text: ab.text,
    manaCost: ab.manaCost,
    tap: ab.tap,
    sacrificeSelf: ab.sacrificeSelf,
    produces,
    ...(ab.lifeCost ? { lifeCost: ab.lifeCost } : {}),
    ...(ab.energyCost ? { energyCost: ab.energyCost } : {}),
    ...(ab.removeCounters ? { removeCounters: ab.removeCounters } : {}),
    ...(ab.exertCost ? { skipNextUntap: true } : {}),
  };
}

/**
 * The ways to activate this activated mana ability, as for `manaOptions`: the color for "one mana of any color" and
 * the picks for the triggered mana abilities it triggers. Null when what it adds isn't known before it resolves.
 */
export function activatedManaOptions(s: GameState, o: GameObject, index: number): ManaOption[] | null {
  const ab = abilitiesOf(s, o).activated[index];
  const m = ab && activatedAsMana(ab);
  if (!m) return null;
  const pid = controllerOf(s, o);
  return manaChoices(s, o, m).flatMap((mana) => {
    const adds = manaProduced(s, o, m, mana);
    return manaTriggerResults(s, pid, o, m, adds).map((r) => ({ ability: index, mana, adds: [...adds, ...r.adds], ...(r.extra.length ? { extra: r.extra } : {}), ...snowPart(s, o, adds, r) }));
  });
}

/** The types of mana an activated mana ability could add if it resolved now (CR 106.7): every one it names. */
function activatedManaTypes(s: GameState, o: GameObject, ab: ActivatedAbility): ManaType[] {
  const m = activatedAsMana(ab);
  if (m) return m.produces.kind === "fixed" ? m.produces.mana : manaChoices(s, o, m);
  const out = new Set<ManaType>();
  for (const b of ab.body.modal ? ab.body.modal.modes : [ab.body])
    for (const e of allEffects(b.effects)) {
      if (e.type !== "addMana") continue;
      if (e.mana) for (const x of e.mana.matchAll(/\{([WUBRGC])\}/g)) out.add(x[1] as ManaType);
      else if (e.chosen) COLORS.forEach((c) => out.add(c));
    }
  return [...out];
}

/**
 * The activated mana abilities of `o` that paying a cost can use (autopay, and what a bot counts on): no cost that
 * needs a choice (what to sacrifice or discard is the player's to pick, so those are activated by hand first), mana
 * known before they resolve, and activatable now apart from mana. `penalty` as for manaPenalty, more for instructions
 * besides adding mana and gaining life (losing life, damage).
 */
export function payableActivatedMana(s: GameState, pid: PlayerId, o: GameObject): { index: number; ab: ActivatedAbility; options: ManaOption[]; penalty: number }[] {
  return abilitiesOf(s, o).activated.flatMap((ab, index) => {
    if (!ab.mana || (ab.zone ?? "battlefield") !== "battlefield" || ab.costs?.length || ab.discardSelf || ab.exileSelf || ab.putCounters || ab.crew !== undefined || ab.station) return [];
    const m = activatedAsMana(ab);
    if (!m || parseManaCost(ab.manaCost).hasX) return [];
    const problem = abilityProblem(s, pid, o.id, index);
    if (problem && !(/not enough mana/.test(problem) && ab.manaCost)) return [];
    const riders = allEffects(ab.body.effects).some((e) => !["addMana", "choose", "gainLife", "delayed", "counters", "if"].includes(e.type)) ? 2 : 0;
    return [{ index, ab, options: activatedManaOptions(s, o, index) ?? [], penalty: manaPenalty(m) + riders }];
  });
}

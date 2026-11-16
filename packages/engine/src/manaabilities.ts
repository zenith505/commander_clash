// Mana abilities (CR 605) as they are on the battlefield: what each one can make right now,
// whether it can be activated, and which one to use for a given mana.

import { allEffects, type ActivatedAbility, type ManaAbility, type ManaProduce, type ManaTrigger } from "./abilities";
import { abilitiesOf, basicLandManaAbility, canSacrificeForCost, exiledLentTo, defOf, lendersOf, objIsType } from "./cards";
import { objectMatches, printedMatches } from "./effects";
import { abilityProblem, activationLessCost, canActAtSorcerySpeed, firstArtifactLess, linkedExileCards, manaActivationTax, obj, payableLife, player, sylexed, tapAbilitySick, tapCostCandidates } from "./game";
import { characteristics, controllerOf, staticConditionNow } from "./layers";
import { parseManaCost, type ParsedCost } from "./mana";
import { evalAmount } from "./amounts";
import { canPayFromPool, manaOriginsOf } from "./spend";
import { compileCard, compileGranted } from "./oracle";
import { nameActivationBan } from "./names";
import { sameName } from "./faces";
import { countersStay, removableCounters } from "./counters";
import { COLORS, type Action, type Color, type GameObject, type GameState, type ManaOrigin, type ManaType, type ObjectId, type PlayerId } from "./types";

/** activatedThisTurn holds activated ability indexes; mana abilities are recorded past this offset. */
export const MANA_ABILITY_OFFSET = 1000;

/**
 * How many activated abilities `o` has now (CR 602.1): its mana abilities among them (CR 605.1a), the intrinsic one of
 * each basic land type it has too (CR 305.6), and ones that work only from another zone, like cycling (rulings on Tazri).
 */
export function activatedAbilityCount(s: GameState, o: GameObject): number {
  return abilitiesOf(s, o).activated.length + manaAbilitiesOn(s, o).length;
}

/** While adding a lender's mana abilities to a borrower's (see lendersOf). */
let lendingMana = false;

/**
 * The mana abilities an object has right now: one for each basic land type it has (CR 305.6),
 * then its own, unless an effect removed its abilities (CR 613.1f).
 */
export function manaAbilitiesOn(s: GameState, o: GameObject): ManaAbility[] {
  const c = characteristics(s, o);
  const out = c.landAbilitiesLost ? [] : c.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null);
  // Blood Sun: its printed mana abilities stay when it loses the rest (CR 605.1a).
  if (c.hasPrintedAbilities || c.printedManaOnly) out.push(...compileCard(defOf(s, o)).mana);
  for (const t of c.grantedAbilities) out.push(...compileGranted(t).mana); // 'Enchanted land has "{T}: Add ..."'
  // "~ has all activated abilities of ...": the lenders' mana abilities too, a land's basic land types' among them
  // (rulings on Mirran Safehouse).
  const borrows = c.hasPrintedAbilities && !lendingMana ? compileCard(defOf(s, o)).borrows : undefined;
  if (borrows && !borrows.noMana) {
    const { objects, cards } = lendersOf(s, o, borrows);
    lendingMana = true; // a lender's own borrowed mana abilities aren't followed (no loops)
    try {
      for (const x of objects) out.push(...manaAbilitiesOn(s, x));
    } finally {
      lendingMana = false;
    }
    for (const d of cards) out.push(...d.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null), ...compileCard(d).mana);
  }
  // Agatha's Soul Cauldron: the exiled creature cards' mana abilities too. Steward of the Harvest: a land card's basic land
  // types' among them (CR 305.6, rulings).
  if (c.hasPrintedAbilities) for (const d of exiledLentTo(s, o)) out.push(...(d.types.includes("Land") ? d.subtypes.map(basicLandManaAbility).filter((x): x is ManaAbility => x !== null) : []), ...compileCard(d).mana);
  // "If ~ has a luck counter on it, instead add one mana of any color" (Gemstone Caverns): what it makes now.
  const swapped = out.map((ab) => (ab.insteadIf && staticConditionNow(s, ab.insteadIf.cond, o.id, controllerOf(s, o)) ? { ...ab, produces: ab.insteadIf.produces } : ab));
  // Thran Portal: its own mana abilities cost life too, not those another permanent borrows from it (rulings).
  const tax = lendingMana ? 0 : manaLifeTax(s, o);
  return tax ? swapped.map((ab) => ({ ...ab, lifeCost: (ab.lifeCost ?? 0) + tax })) : swapped;
}

/**
 * "Mana abilities of this land cost an additional 1 life to activate" (Thran Portal, CR 601.2f, 602.2b): the life every
 * mana ability of this object costs on top of its own costs, while it has that ability.
 */
export function manaLifeTax(s: GameState, o: GameObject): number {
  return characteristics(s, o).hasPrintedAbilities ? (compileCard(defOf(s, o)).manaAbilityLifeTax ?? 0) : 0;
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
function landsCouldProduce(s: GameState, pid: PlayerId, whose: "you" | "opponent", anyType: boolean, asking: ReadonlySet<ObjectId>, /** "A Gate you control" (Gond Gate). */ subtype?: string, /** "A basic land you control" (Star Compass). */ basic?: boolean): ManaType[] {
  const out = new Set<ManaType>();
  for (const id of s.battlefield) {
    const land = obj(s, id);
    const ctrl = controllerOf(s, land);
    if (asking.has(id) || !objIsType(s, land, "Land") || (whose === "you" ? ctrl !== pid : ctrl === pid)) continue;
    if (subtype && !characteristics(s, land).subtypes.includes(subtype)) continue;
    if (basic && !characteristics(s, land).supertypes.includes("Basic")) continue;
    landCouldProduce(s, land, new Set([...asking, id])).forEach((m) => out.add(m));
  }
  return (["W", "U", "B", "R", "G", "C"] as ManaType[]).filter((m) => out.has(m) && (anyType || m !== "C"));
}

/**
 * The types of mana this one permanent's mana abilities could produce (CR 106.7), whatever their costs; `asking` as for
 * landsCouldProduce (the permanent itself in it). Squandered Resources reads it for the land it sacrifices, as that land
 * last existed (LastKnown.couldProduce).
 */
export function landCouldProduce(s: GameState, land: GameObject, asking: ReadonlySet<ObjectId> = new Set([land.id])): ManaType[] {
  const out = new Set<ManaType>();
  const ctrl = controllerOf(s, land);
  for (const ab of manaAbilitiesOn(s, land)) {
    if (ab.activeIf && !staticConditionNow(s, ab.activeIf, land.id, ctrl)) continue;
    const p = ab.produces;
    const made = p.kind === "fixed" ? p.mana : p.kind === "landsCouldProduce" ? landsCouldProduce(s, ctrl, p.whose, !!p.anyType, asking, p.subtype, p.basic) : manaChoices(s, land, ab);
    // Replacement effects on the mana it's tapped for count, in any order (CR 106.7): with Infernal Darkness, only {B}.
    (ab.tap ? made.flatMap((m) => couldProduceAfterReplacements(s, land, [m])) : made).forEach((m) => out.add(m));
  }
  // Its activated mana abilities too ("{T}, Sacrifice a creature: Add {B}{B}"): whatever their costs (CR 106.7).
  for (const ab of abilitiesOf(s, land).activated) if (ab.mana) activatedManaTypes(s, land, ab).forEach((m) => out.add(m));
  return (["W", "U", "B", "R", "G", "C"] as ManaType[]).filter((m) => out.has(m));
}

/** The mana a player picks from when activating it: one entry per possible result. */
export function manaChoices(s: GameState, o: GameObject, ab: ManaAbility): ManaType[] {
  const p = ab.produces;
  if (p.kind === "fixed") return [p.mana[0]!];
  if (p.kind === "oneOf") return p.options;
  if (p.kind === "landsCouldProduce") return landsCouldProduce(s, controllerOf(s, o), p.whose, !!p.anyType, new Set([o.id]), p.subtype, p.basic);
  if (p.kind === "chosenColor") {
    const c = o.chosen?.color;
    return [...(p.also ? [p.also] : []), ...(c && c !== p.also ? [c] : [])];
  }
  // A combination is picked by its number (`combo`); these are the types it could make (CR 106.7).
  if (p.kind === "combos") return [...new Set(p.options.flat())];
  if (p.kind === "removeX") return p.colors;
  if (p.kind === "revealX") return [...new Set(p.per)];
  if (p.kind === "anyColors") return [...(p.colors ?? COLORS)];
  if (p.kind === "colorsAmong") return colorsAmong(s, o, p);
  // "For each color among permanents you control": all of them at once, whichever is named (none with no color).
  if (p.kind === "eachColorAmong") return eachColorAmong(s, o, !!p.monocolored, !!p.linked);
  if (p.kind === "devotion") return [...COLORS];
  if (p.kind === "doublePool") return [...COLORS, "C"];
  if (p.kind === "noted") return [o.notedMana ?? "C"];
  return commanderIdentity(s, controllerOf(s, o));
}

/**
 * Colors among the permanents matching `p.filter` that its controller controls (Mox Amber), or of the card its linked
 * imprint ability exiled (Chrome Mox, CR 607.2a): as they are now (CR 106.7, 605.3).
 */
function colorsAmong(s: GameState, o: GameObject, p: Extract<ManaProduce, { kind: "colorsAmong" }>): ManaType[] {
  const pid = controllerOf(s, o);
  if (p.inYard) {
    // A card's colors in a graveyard are its own (CR 105.2).
    const cards = player(s, pid).graveyard.map((id) => defOf(s, obj(s, id))).filter((d) => printedMatches(p.filter!, d));
    const yard = new Set(cards.flatMap((d) => d.colors));
    return COLORS.filter((c) => yard.has(c));
  }
  const from = p.self ? [o.id] : p.linked ? linkedExileCards(s, o) : s.battlefield.filter((id) => objectMatches(s, p.filter!, obj(s, id), pid, false));
  const colors = new Set(from.flatMap((id) => characteristics(s, obj(s, id)).colors));
  return COLORS.filter((c) => colors.has(c));
}

/** The colors among permanents `o`'s controller controls (CR 105.2): Bloom Tender itself counts if it has a color. */
function eachColorAmong(s: GameState, o: GameObject, monocolored = false, linked = false): ManaType[] {
  const pid = controllerOf(s, o);
  // Sunbird Effigy: the colors of the exiled cards used to craft it, while they stay exiled (CR 702.167c); at most five
  // (rulings).
  if (linked) {
    const colors = new Set(linkedExileCards(s, o).filter((id) => !obj(s, id).faceDown).flatMap((id) => characteristics(s, obj(s, id)).colors));
    return COLORS.filter((c) => colors.has(c));
  }
  // Tarnation Vista: only monocolored ones, exactly one color each (CR 105.2b).
  const colors = new Set(s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid).map((id) => characteristics(s, obj(s, id)).colors).filter((c) => !monocolored || c.length === 1).flat());
  return COLORS.filter((c) => colors.has(c));
}

/**
 * The ways to activate a storage land's ability (ManaProduce "removeX"), numbered as `combo`: each number of counters
 * from `min` to how many are on it, and for two colors each split of that much mana between them (CR 107.3a); for a
 * `mix`, each multiset of that many of its colors (colorCombos), all of one X before the next.
 */
export function removeXCombos(o: GameObject, p: Extract<ManaProduce, { kind: "removeX" }>): ManaType[][] {
  const out: ManaType[][] = [];
  const [a, b] = p.colors;
  for (let x = p.min; x <= (o.counters[p.counter] ?? 0); x++)
    if (p.mix) out.push(...colorCombos(x + (p.base ?? 0), p.colors as Color[]));
    else if (p.oneColor) for (const c of x ? p.colors : p.colors.slice(0, 1)) out.push(Array<ManaType>(x + (p.base ?? 0)).fill(c));
    else for (let i = x; i >= (b ? 0 : x); i--) out.push([...Array<ManaType>(i + (p.base ?? 0)).fill(a!), ...Array<ManaType>(x - i).fill(b ?? a!)]);
  return out;
}

/** Metalworker's (ManaProduce "revealX"): each number of matching cards in its controller's hand to reveal, from none. */
export function revealXCombos(s: GameState, o: GameObject, p: Extract<ManaProduce, { kind: "revealX" }>): ManaType[][] {
  const n = revealable(s, o, p).length;
  return Array.from({ length: n + 1 }, (_, k) => Array.from({ length: k }, () => p.per).flat());
}

/** The cards in `o`'s controller's hand that "revealX" may reveal, as they are in hand. */
export const revealable = (s: GameState, o: GameObject, p: Extract<ManaProduce, { kind: "revealX" }>): ObjectId[] =>
  player(s, controllerOf(s, o)).hand.filter((id) => printedMatches(p.filter, defOf(s, obj(s, id))));

/** Every combination of `n` mana of any colors (each multiset once, in WUBRG order): ManaProduce "anyColors". */
export function colorCombos(n: number, colors: readonly Color[] = COLORS): ManaType[][] {
  const among = COLORS.filter((x) => colors.includes(x));
  let out: Color[][] = [[]];
  for (let i = 0; i < n; i++) out = out.flatMap((c) => among.filter((x) => !c.length || COLORS.indexOf(x) >= COLORS.indexOf(c[c.length - 1]!)).map((x) => [...c, x]));
  return out;
}

/** How much mana an "anyColors" ability adds now: X as it resolves, with the permanent as "~" and its controller as "you". */
export function anyColorsCount(s: GameState, o: GameObject, p: Extract<ManaProduce, { kind: "anyColors" }>): number {
  return typeof p.n === "number" ? p.n : Math.max(0, evalAmount(s, p.n, { controller: controllerOf(s, o), sourceId: o.id }));
}

/** The combinations an ability is activated with (ManaOption.combo), or null if it has none to choose from. */
export function manaCombos(s: GameState, o: GameObject, ab: ManaAbility): ManaType[][] | null {
  const p = ab.produces;
  return p.kind === "combos" ? p.options : p.kind === "removeX" ? removeXCombos(o, p) : p.kind === "revealX" ? revealXCombos(s, o, p) : p.kind === "anyColors" ? colorCombos(anyColorsCount(s, o, p), p.colors) : p.kind === "doublePool" ? doublePoolPayments(s, o, ab) : null;
}

/**
 * Doubling Cube (ManaProduce "doublePool"): each way to pay its mana cost with the mana in its controller's pool, as
 * the types of mana spent (CR 601.2h, 605.3a). The pool is what's doubled, so the cost is paid from the pool only.
 */
export function doublePoolPayments(s: GameState, o: GameObject, ab: ManaAbility): ManaType[][] {
  const pid = controllerOf(s, o);
  const pool = player(s, pid).manaPool;
  const cost = activationLessCost(s, o, withManaTax(s, o, pid, parseManaCost(ab.manaCost)));
  if (cost.symbols.some((x) => x.kind !== "generic")) return [];
  const n = cost.symbols.reduce((a, x) => a + (x.kind === "generic" ? x.amount : 0), 0);
  const types: ManaType[] = [...COLORS, "C"];
  let ways: ManaType[][] = [[]];
  for (let i = 0; i < n; i++)
    ways = ways.flatMap((w) => types.filter((m) => types.indexOf(m) >= types.indexOf(w[w.length - 1] ?? "W") && w.filter((x) => x === m).length < pool[m]).map((m) => [...w, m]));
  return ways.filter((w) => canPayFromPool(s, pid, parseManaCost(w.map((m) => `{${m}}`).join("")), { ability: o }));
}

/**
 * How many times as much mana `pid` gets for tapping a permanent for mana (CR 106.12): the replacement effects of the
 * permanents they control that say "If you tap a permanent for mana, it produces twice as much of that mana instead"
 * (CR 106.12b). They multiply together (rulings on Mana Reflection), so the order they apply in doesn't matter (616.1).
 */
export function tapManaTimes(s: GameState, pid: PlayerId, tapped?: GameObject): number {
  let n = 1;
  const basic = !!tapped && tapped.zone === "battlefield" && characteristics(s, tapped).supertypes.includes("Basic") && objIsType(s, tapped, "Land");
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const ab = abilitiesOf(s, o);
    if (ab.tapManaTimes) n *= ab.tapManaTimes;
    if (basic && ab.tapBasicManaTimes) n *= ab.tapBasicManaTimes;
  }
  return n;
}

/** The same mana `n` times as much (the riders on it stay with all of it, rulings on Mana Reflection). */
export const timesAsMuch = (mana: ManaType[], n: number): ManaType[] => (n === 1 ? mana : mana.flatMap((m) => Array<ManaType>(n).fill(m)));

/**
 * One replacement effect on the mana a permanent is tapped for (CR 106.12b, 614.1a): "times", Mana Reflection's "twice as
 * much"; "damp", Damping Sphere's "If a land is tapped for two or more mana, it produces {C} instead of any other type and
 * amount"; "as", Infernal Darkness's "it produces {B} instead of any other type" (`one`: "... and amount", Contamination;
 * `only`: Quarum Trench Gnomes's "colorless mana instead of white mana", only mana of that type changes).
 */
type ManaReplacement = { kind: "times"; n: number } | { kind: "damp" } | { kind: "as"; mana: ManaType; one?: true; only?: ManaType; /** Hall of Gemstone (round B226): "of the chosen color instead of any other color": each colored mana, not colorless (rulings). */ colored?: true } | ChooseReplacement;

/**
 * A change of type whose new type the player tapping the land chooses (round B224): Pulse of Llanowar's and Harvest Mage's
 * "mana of a color of your choice instead of any other type" (`one`: "... and amount"), and Naked Singularity's for a land
 * with two of the basic land types it lists ("the player tapping the land for mana can choose to produce mana of either
 * color", rulings). All the mana becomes the one color chosen (rulings).
 */
type ChooseReplacement = { kind: "choose"; colors: ManaType[]; one?: true };

/**
 * Naked Singularity, Reality Twist: "If tapped for mana, Plains produce {R}, Islands produce {G}, ... instead of any other
 * type": the colors the land's basic land types (as it's tapped, CR 305.6) are listed as producing; one of them, or the
 * player's choice of them (rulings).
 */
function bySubtype(s: GameState, land: GameObject, map: { subtype: string; mana: ManaType }[]): ManaReplacement | null {
  const subtypes = characteristics(s, land).subtypes;
  const colors = [...new Set(map.filter((x) => subtypes.includes(x.subtype)).map((x) => x.mana))];
  return !colors.length ? null : colors.length === 1 ? { kind: "as", mana: colors[0]! } : { kind: "choose", colors: ([...COLORS, "C"] as ManaType[]).filter((m) => colors.includes(m)) };
}

/** The replacement effects that apply to mana `tapped` is tapped for by `pid`, in timestamp order (statics in battlefield order, then effects with a duration). */
function manaReplacements(s: GameState, pid: PlayerId, tapped: GameObject | undefined): ManaReplacement[] {
  const out: ManaReplacement[] = [];
  const onField = !!tapped && tapped.zone === "battlefield";
  const land = onField && objIsType(s, tapped!, "Land");
  const basic = onField && characteristics(s, tapped!).supertypes.includes("Basic");
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const ab = abilitiesOf(s, o);
    if (controllerOf(s, o) === pid) {
      if (ab.tapManaTimes) out.push({ kind: "times", n: ab.tapManaTimes });
      if (basic && land && ab.tapBasicManaTimes) out.push({ kind: "times", n: ab.tapBasicManaTimes });
    }
    if (!land) continue;
    if (ab.dampsLandMana) out.push({ kind: "damp" });
    for (const r of ab.landManaAs ?? []) out.push({ kind: "as", mana: r.mana, ...(r.one ? { one: true as const } : {}) });
    for (const map of ab.landManaBySubtype ?? []) {
      const r = bySubtype(s, tapped!, map);
      if (r) out.push(r);
    }
    // Pulse of Llanowar: "If a basic land you control is tapped for mana, it produces mana of a color of your choice instead
    // of any other type": the same amount, all of one color chosen each time (rulings), the type it would make included.
    if (basic && ab.basicLandManaAnyColor && controllerOf(s, o) === controllerOf(s, tapped!)) out.push({ kind: "choose", colors: [...COLORS] });
  }
  if (land) {
    for (const r of s.landManaRules ?? [])
      if (r.turn === s.turn && (!r.nonbasic || !basic) && (!r.yours || controllerOf(s, tapped!) === r.player) && (!r.subtype || characteristics(s, tapped!).subtypes.includes(r.subtype)))
        out.push(r.mana === "any" ? { kind: "choose", colors: [...COLORS], ...(r.one ? { one: true as const } : {}) } : { kind: "as", mana: r.mana, ...(r.colored ? { colored: true as const } : {}) });
    for (const r of tapped!.manaReplaced ?? []) out.push({ kind: "as", mana: r.to, only: r.from });
  }
  return out;
}

const applicable = (r: ManaReplacement, made: ManaType[]): boolean => made.length > 0 && (r.kind === "damp" ? made.length >= 2 : r.kind === "as" && r.only ? made.includes(r.only) : r.kind === "as" && r.colored ? made.some((m) => m !== "C") : true);
const applyReplacement = (r: Exclude<ManaReplacement, ChooseReplacement>, made: ManaType[]): ManaType[] =>
  r.kind === "times" ? timesAsMuch(made, r.n) : r.kind === "damp" ? ["C"] : r.one ? [r.mana] : made.map((m) => ((r.only ? m === r.only : !r.colored || m !== "C") ? r.mana : m));

/**
 * Every result of applying these replacement effects in an order the player could choose (CR 616.1): each time one that
 * applies now (CR 616.1e, a land that makes one mana only becomes "tapped for two or more mana" after a multiplier), and
 * each one only once (CR 614.5). In the order they're listed first. A replacement whose color the player chooses gives one
 * result for each color (`instead`: only that one, when it's among them).
 */
function replacedResults(made: ManaType[], effects: ManaReplacement[], used: boolean[] = effects.map(() => false), instead?: ManaType): ManaType[][] {
  const out: ManaType[][] = [];
  effects.forEach((r, i) => {
    if (used[i] || !applicable(r, made)) return;
    const next = used.slice();
    next[i] = true;
    const ways: Exclude<ManaReplacement, ChooseReplacement>[] = r.kind === "choose" ? (instead && r.colors.includes(instead) ? [instead] : r.colors).map((mana) => ({ kind: "as", mana, ...(r.one ? { one: true as const } : {}) })) : [r];
    for (const w of ways) out.push(...replacedResults(applyReplacement(w, made), effects, next, instead));
  });
  return out.length ? out : [made];
}

/**
 * The colors the player tapping `tapped` for mana could choose for the replacement effects that let them (round B224):
 * none when there are no such effects. What manaOptions offers as `instead`.
 */
export function insteadChoices(s: GameState, pid: PlayerId, tapped: GameObject): ManaType[] {
  const colors = new Set(manaReplacements(s, pid, tapped).flatMap((r) => (r.kind === "choose" ? r.colors : [])));
  return ([...COLORS, "C"] as ManaType[]).filter((m) => colors.has(m));
}

/**
 * The mana a permanent tapped for mana produces after the replacement effects on it (CR 106.12b, 614.1a): Mana
 * Reflection's multipliers, Damping Sphere's "If a land is tapped for two or more mana, it produces {C} instead of any
 * other type and amount", and the changes of type (Infernal Darkness, Contamination, Pale Moon, Quarum Trench Gnomes).
 * The player chooses the order (CR 616.1; rulings on Damping Sphere): the order that gives the most mana, and of those the
 * one closest to timestamp order, so a later change of type is the one that shows (the engine picks for the player).
 */
export function tappedForMana(s: GameState, pid: PlayerId, tapped: GameObject | undefined, made: ManaType[], instead?: ManaType): ManaType[] {
  if (!made.length) return made;
  const effects = manaReplacements(s, pid, tapped);
  if (!effects.length) return made;
  // A color the player chose (`instead`, round B224): an order of the effects that ends with that color, if there is one;
  // with none chosen, the type it would have made if there's a way to keep it.
  const want = effects.some((r) => r.kind === "choose") ? (instead ?? made[0]) : undefined;
  const all = replacedResults(made, effects, undefined, want);
  const chosen = want ? all.filter((r) => r.includes(want)) : [];
  let best: ManaType[] | undefined;
  for (const r of chosen.length ? chosen : all) if (!best || r.length > best.length) best = r;
  return best!;
}

/**
 * The types of mana tapping `land` for `made` could give after the replacement effects on it, in any possible order (CR
 * 106.7): what "could produce" reads (landCouldProduce).
 */
function couldProduceAfterReplacements(s: GameState, land: GameObject, made: ManaType[]): ManaType[] {
  const effects = manaReplacements(s, controllerOf(s, land), land).filter((r) => r.kind === "as" || r.kind === "damp" || r.kind === "choose");
  return effects.length ? [...new Set(replacedResults(made, effects).flat())] : made;
}

/**
 * Exactly what activating it with `choice` (or the combination numbered `combo`, for "combos") adds to the pool:
 * multiplied when it's tapped for mana (`tapManaTimes`).
 */
export function manaProduced(s: GameState, o: GameObject, ab: ManaAbility, choice: ManaType, combo?: number, instead?: ManaType): ManaType[] {
  const made = baseManaProduced(s, o, ab, choice, combo);
  return ab.tap && made.length ? tappedForMana(s, controllerOf(s, o), o, made, instead) : made;
}

/**
 * Each way the player could make `made` turn out with the color-choosing replacements on tapping `o` for mana (round
 * B224): `instead` undefined when there are none or nothing to choose, else one per color giving a different result.
 */
function insteadWays(s: GameState, o: GameObject, tap: boolean | undefined, produce: (instead?: ManaType) => ManaType[]): { instead?: ManaType; adds: ManaType[] }[] {
  const plain = produce();
  const colors = tap && plain.length ? insteadChoices(s, controllerOf(s, o), o) : [];
  if (!colors.length) return [{ adds: plain }];
  const out: { instead?: ManaType; adds: ManaType[] }[] = [];
  for (const instead of colors) {
    const adds = produce(instead);
    if (!out.some((x) => x.adds.join() === adds.join())) out.push({ instead, adds });
  }
  return out;
}

function baseManaProduced(s: GameState, o: GameObject, ab: ManaAbility, choice: ManaType, combo?: number): ManaType[] {
  const p = ab.produces;
  if (p.kind === "combos") return p.options[combo ?? -1] ?? [];
  // Jeweled Amulet: no mana if no type was noted (rulings).
  if (p.kind === "noted") return o.notedMana ? [o.notedMana] : [];
  if (p.kind === "removeX") return removeXCombos(o, p)[combo ?? -1] ?? [];
  if (p.kind === "revealX") return revealXCombos(s, o, p)[combo ?? -1] ?? [];
  if (p.kind === "doublePool") {
    // As much again of each type as is left in the pool once that payment is made.
    const paid = doublePoolPayments(s, o, ab)[combo ?? -1];
    if (!paid) return [];
    const pool = player(s, controllerOf(s, o)).manaPool;
    return ([...COLORS, "C"] as ManaType[]).flatMap((m) => Array<ManaType>(Math.max(0, pool[m] - paid.filter((x) => x === m).length)).fill(m));
  }
  if (p.kind === "anyColors") return colorCombos(anyColorsCount(s, o, p), p.colors)[combo ?? -1] ?? [];
  if ((p.kind === "fixed" || p.kind === "oneOf") && p.n) {
    // CR 106.1: worked out as the ability resolves, with the permanent as "~" and its controller as "you".
    // "Of the chosen type" (Three Tree City): the type chosen for it as it entered.
    const n = evalAmount(s, p.n, { controller: controllerOf(s, o), sourceId: o.id, ...(o.chosen ? { chosen: o.chosen } : {}) });
    return Array<ManaType>(n).fill(p.kind === "oneOf" ? choice : p.mana[0]!);
  }
  if (p.kind === "oneOf") return Array<ManaType>(p.amount).fill(choice);
  if (p.kind === "landsCouldProduce") return Array<ManaType>(p.n ?? 1).fill(choice);
  if (p.kind === "chosenColor") return Array<ManaType>(p.n ?? 1).fill(choice);
  if (p.kind === "commanderIdentity" || p.kind === "colorsAmong") return [choice];
  if (p.kind === "eachColorAmong") return eachColorAmong(s, o, !!p.monocolored, !!p.linked);
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
  /** Doubling Cube's: the mana from the pool that pays its cost (ManaProduce "doublePool"). */
  pays?: ManaType[];
  /**
   * The color chosen for a replacement effect that lets the player tapping it choose (round B224: Pulse of Llanowar,
   * Harvest Mage, Naked Singularity on a land with two of its land types).
   */
  instead?: ManaType;
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
function manaTriggerSources(s: GameState): { src?: GameObject; controller: PlayerId; t: ManaTrigger }[] {
  const out: { src?: GameObject; controller: PlayerId; t: ManaTrigger }[] = s.battlefield.flatMap((id) => {
    const src = obj(s, id);
    return (abilitiesOf(s, src).manaTriggers ?? []).map((t) => ({ src, controller: controllerOf(s, src), t }));
  });
  // High Tide's, until end of turn: its source is the spell, gone by now, so its mana has no origins of its own (CR 106.3).
  for (const x of s.manaTriggersThisTurn ?? []) out.push({ controller: x.controller, t: x.trigger });
  return out;
}

/** What the triggered mana abilities add: the picks for their mana, the mana, and each mana's source (`from`, CR 106.3). */
export interface ManaTriggerResult {
  extra: ManaType[];
  adds: ManaType[];
  from: ManaOrigin[][];
  /** Winter's Night (ManaTrigger.landSkipsUntap): the permanent tapped for mana doesn't untap during its controller's next untap step. */
  skipUntap?: true;
  /** Overabundance, Barbflare Gremlin (ManaTrigger.damage): 1 damage from each of these sources to the player who tapped it, after the mana. */
  damage?: ObjectId[];
}

/**
 * What the triggered mana abilities add when `pid` taps `o` for mana with `ab`, making `made`: one entry per way to
 * pick their mana (`extra`, the picks). Tapping it for mana is activating a mana ability of it with {T} in the cost
 * (CR 106.12; not tapping it for another permanent's cost, rulings on Leyline of Abundance), and they trigger only
 * when that makes mana (106.12a). They resolve right after it (CR 605.4a), each adding its mana.
 */
export function manaTriggerResults(s: GameState, pid: PlayerId, o: GameObject, ab: ManaAbility, made: ManaType[], sources = manaTriggerSources(s)): ManaTriggerResult[] {
  let results: ManaTriggerResult[] = [{ extra: [], adds: [], from: [] }];
  for (const { src, controller: ctl, t } of sources) {
    // Only when it made mana (CR 106.12a), except Overabundance's (rulings: its damage even when the land made none).
    if (!made.length && !t.evenWithoutMana) continue;
    if (!ab.tap && !t.anyAbility) continue;
    if (t.ifSelfTapped && !src?.tapped) continue; // Barbflare Gremlin's intervening if (CR 603.4)
    if (t.madeType && !made.includes(t.madeType)) continue;
    const chosen = src?.chosen?.color;
    if (t.you && ctl !== pid) continue;
    if (t.whileMonarch && s.monarch !== ctl) continue;
    if (t.attached && src?.attachedTo !== o.id) continue;
    if (t.filter && !objectMatches(s, t.filter, o, ctl, false)) continue;
    // Extraplanar Lens: no card exiled, nothing has its name (CR 607.2a); a face-down land has no name (CR 708.2).
    if (t.sameNameAsLinked && (!src || o.faceDown || !linkedExileCards(s, src).some((id) => sameName(defOf(s, obj(s, id)).name, characteristics(s, o).name)))) continue;
    if ((t.ofChosen || t.adds.kind === "chosenColor") && !chosen) continue; // no color chosen: it never triggers (rulings on Gauntlet of Power)
    if (t.ofChosen && !made.includes(chosen!)) continue;
    let picks: { extra: ManaType[]; adds: ManaType[] }[];
    const a = t.adds;
    if (a.kind === "fixed") {
      const n = a.times === undefined ? 1 : evalAmount(s, a.times, { controller: ctl, ...(src ? { sourceId: src.id } : {}) });
      picks = [{ extra: [], adds: Array.from({ length: n }, () => a.mana).flat() }];
    }
    else if (a.kind === "chosenColor") picks = [{ extra: [], adds: [chosen!] }];
    else if (a.kind === "produced") {
      // One of the types it made, picked if it made several (rulings on Mana Flare).
      const types = [...new Set(made)];
      if (a.perOtherSameName) {
        // Sasaya's Essence: one for each other land its controller controls with this land's name (CR 201.2), a face-down
        // one having none (CR 708.2); each of any type it made, in any mix (rulings on Mossfire Valley).
        const name = o.faceDown ? undefined : characteristics(s, o).name;
        const n = !name ? 0 : s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === ctl && objIsType(s, obj(s, id), "Land") && !obj(s, id).faceDown && sameName(characteristics(s, obj(s, id)).name, name)).length;
        let combos: ManaType[][] = [[]];
        for (let i = 0; i < n; i++) combos = combos.flatMap((c) => types.filter((x) => !c.length || types.indexOf(x) >= types.indexOf(c[c.length - 1]!)).map((x) => [...c, x]));
        picks = types.length <= 1 ? [{ extra: [], adds: Array<ManaType>(n).fill(types[0]!) }] : combos.map((c) => ({ extra: c, adds: c }));
      } else picks = types.length <= 1 ? [{ extra: [], adds: types }] : types.map((m) => ({ extra: [m], adds: [m] }));
    } else {
      // n mana in any combination of colors: each combination once.
      let combos: Color[][] = [[]];
      for (let i = 0; i < a.n; i++) combos = combos.flatMap((c) => COLORS.filter((x) => !c.length || COLORS.indexOf(x) >= COLORS.indexOf(c[c.length - 1]!)).map((x) => [...c, x]));
      picks = combos.map((c) => ({ extra: c, adds: c }));
    }
    // Each mana's source is the triggered ability's source (CR 106.3), as it is now.
    const from = src ? manaOriginsOf(s, src) : [];
    // Overabundance deals its damage, Barbflare Gremlin has the land deal it.
    const hurts = t.damage === "self" ? src?.id : t.damage === "land" ? o.id : undefined;
    results = results.flatMap((r) => picks.map((p) => ({ extra: [...r.extra, ...p.extra], adds: [...r.adds, ...p.adds], from: [...r.from, ...p.adds.map(() => from)], ...(r.skipUntap || t.landSkipsUntap ? { skipUntap: true as const } : {}), ...(hurts || r.damage ? { damage: [...(r.damage ?? []), ...(hurts ? [hurts] : [])] } : {}) })));
  }
  return results;
}

export function manaOptions(s: GameState, o: GameObject): ManaOption[] {
  const abs = manaAbilitiesOn(s, o);
  const all = allManaOptions(s, o, abs);
  if (!all.some((x) => x.instead)) return all;
  // A color chosen for a replacement (round B224) can make two ways the same, Taiga's {R} and {G} both becoming {B}: one of
  // each result, for abilities that cost the same (only `produces` and the text differ).
  const costKey = (ab: ManaAbility) => JSON.stringify({ ...ab, produces: undefined, text: undefined });
  const seen = new Set<string>();
  return all.filter((x) => {
    if (!x.instead) return true;
    const key = `${costKey(abs[x.ability]!)}|${x.adds.join("")}|${x.extra?.join("") ?? ""}|${x.removes ?? ""}|${x.pays?.join("") ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allManaOptions(s: GameState, o: GameObject, abs: ManaAbility[]): ManaOption[] {
  const pid = controllerOf(s, o);
  const sources = manaTriggerSources(s);
  return abs.flatMap((ab, ability) => {
    const combos = manaCombos(s, o, ab);
    // "X mana in any combination of colors" with a big X: for planning a payment, the ways using one or two colors.
    // A storage land's mix (Crucible of the Spirit Dragon) the same way.
    const few = (ab.produces.kind === "anyColors" || (ab.produces.kind === "removeX" && ab.produces.mix)) && combos && combos.length > 126;
    const picks: { mana: ManaType; combo?: number }[] = combos ? combos.flatMap((c, combo) => (few && new Set(c).size > 2 ? [] : [{ mana: c[0] ?? manaChoices(s, o, ab)[0]!, combo }])) : manaChoices(s, o, ab).map((mana) => ({ mana }));
    return picks.flatMap(({ mana, combo }) => {
      const removed = ab.produces.kind === "removeX" ? { removes: combos![combo!]!.length - (ab.produces.base ?? 0) } : {};
      const pays = ab.produces.kind === "doublePool" ? { pays: combos![combo!]! } : {};
      return insteadWays(s, o, ab.tap, (instead) => manaProduced(s, o, ab, mana, combo, instead)).flatMap(({ instead, adds }) =>
        manaTriggerResults(s, pid, o, ab, adds, sources).map((r) => ({ ability, mana, ...(combo !== undefined ? { combo } : {}), ...removed, ...pays, ...(instead ? { instead } : {}), adds: [...adds, ...r.adds], ...(r.extra.length ? { extra: r.extra } : {}), ...snowPart(s, o, adds, r) })),
      );
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
  // City of Solitude: no activated abilities during another player's turn, of anything anywhere (rulings).
  if (pid !== s.activePlayer) {
    const city = s.battlefield.find((id) => abilitiesOf(s, obj(s, id)).activateOnlyOwnTurn);
    if (city) return `${characteristics(s, obj(s, city)).name}: players can activate abilities only during their own turns`;
  }
  if (o.zone !== "battlefield" || pid === s.activePlayer || !["Artifact", "Creature", "Enchantment"].some((t) => objIsType(s, o, t))) return null;
  const src = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === s.activePlayer && abilitiesOf(s, obj(s, id)).opponentsCantActivateYourTurn);
  return src ? `${characteristics(s, obj(s, src)).name}: opponents can't activate abilities of artifacts, creatures or enchantments during ${player(s, s.activePlayer).name}'s turn` : null;
}

export function manaAbilityProblem(s: GameState, pid: PlayerId, o: GameObject, index: number, ignorePool = false, tap?: ObjectId[]): string | null {
  const ab = manaAbilitiesOn(s, o)[index];
  const name = characteristics(s, o).name;
  if (!ab) return `${name} has no such mana ability`;
  if (o.zone !== "battlefield" || (controllerOf(s, o) !== pid && !ab.anyPlayer)) return "you don't control that permanent";
  if (characteristics(s, o).cantActivate === "all") return `${name}'s activated abilities can't be activated`; // Arrest: mana abilities too (CR 605.1a)
  if (ab.tap && characteristics(s, o).cantActivateTap) return `${name}'s activated abilities with {T} in their costs can't be activated`; // Serra Bestiary (rulings)
  const banned = nameActivationBan(s, o, true) ?? abolisherBan(s, pid, o); // Phyrexian Revoker, Grand Abolisher: mana abilities too
  if (banned) return banned;
  if (ab.tap && o.tapped) return `${name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && tapAbilitySick(s, o)) return `${name} has summoning sickness`; // CR 302.6
  // {Q} (CR 107.6): it must be tapped, a stun counter that stays keeps it so (rulings on Fear of Sleep Paralysis), and a
  // creature can't pay it while summoning sick (CR 302.6).
  if (ab.untapSelf && !o.tapped) return `${name} is untapped`;
  if (ab.untapSelf && (o.counters.stun ?? 0) > 0 && countersStay(s, o, "stun")) return `${name}'s stun counter can't be removed`;
  if (ab.untapSelf && objIsType(s, o, "Creature") && tapAbilitySick(s, o)) return `${name} has summoning sickness`;
  if (ab.sacrificeSelf && !canSacrificeForCost(s, o)) return `${name} can't be sacrificed`; // CR 701.21, 602.2b
  if (ab.oncePerTurn && o.activatedThisTurn?.includes(MANA_ABILITY_OFFSET + index)) return `${name}'s ability can be activated only once each turn`;
  if (ab.onceEver && o.activatedEver?.includes(MANA_ABILITY_OFFSET + index) && !(ab.exhaust && mayExhaustAgain(s, pid))) return `${name}'s exhaust ability can be activated only once`; // CR 702.177a
  if (ab.activeIf && !staticConditionNow(s, ab.activeIf, o.id, pid)) return `${name} doesn't have that ability now`; // max speed (CR 702.178a)
  if (ab.activateIf && !staticConditionNow(s, ab.activateIf, o.id, pid)) return `${name}'s ability can't be activated now`; // CR 602.5b
  // "Activate only as an instant": when its controller could cast an instant, holding priority (rulings on Lion's Eye Diamond).
  if (ab.instantOnly && (s.priority !== pid || s.pending || s.resolving || s.triggerQueue.length)) return `${name}'s ability can be activated only when you could cast an instant`;
  if (ab.sorceryOnly && (!canActAtSorcerySpeed(s, pid) || s.resolving || s.triggerQueue.length)) return `${name}'s ability can be activated only as a sorcery`;
  const p = player(s, pid);
  if (ab.lifeCost && sylexed(s, payableLife(s, pid), true) < ab.lifeCost) return `you need ${ab.lifeCost} life to pay`; // CR 119.4, 119.8
  if (ab.energyCost && (p.energy ?? 0) < ab.energyCost) return `you need ${ab.energyCost} energy`; // CR 107.14
  if (ab.removeCounters && removableCounters(s, o, ab.removeCounters.counter) < ab.removeCounters.n) return `${name} doesn't have enough ${ab.removeCounters.counter} counters`;
  if (ab.produces.kind === "removeX" && (o.counters[ab.produces.counter] ?? 0) < ab.produces.min) return `${name} has no ${ab.produces.counter} counters`;
  const payCost = manaAbilityCostOf(s, pid, o, ab);
  if (!ignorePool && payCost && !canPayFromPool(s, pid, payCost, { ability: o })) return "not enough mana";
  // "Tap an untapped creature you control" (CR 602.2b): without a choice, whether there's enough to tap.
  if (ab.tapCost) {
    const can = tapCostCandidates(s, pid, o, ab.tapCost);
    if (!tap) return can.length >= ab.tapCost.n ? null : `you need to tap ${ab.tapCost.n === 1 ? "an" : ab.tapCost.n} ${ab.tapCost.filter.text}`;
    if (tap.length !== ab.tapCost.n || new Set(tap).size !== tap.length || tap.some((id) => !can.includes(id))) return `choose ${ab.tapCost.n === 1 ? "an" : ab.tapCost.n} ${ab.tapCost.filter.text} to tap`;
  } else if (tap?.length) return "that ability doesn't tap other permanents";
  return null;
}

/** A mana ability's mana cost as `pid` activates it, after reductions (CR 602.2b applies 601.2f; Tezzeret, Betrayer of Flesh). */
export function manaAbilityCost(s: GameState, pid: PlayerId, o: GameObject, manaCost: string): ParsedCost {
  const first = firstArtifactLess(s, pid, o, true);
  // Oppressive Rays, Gloom: increases first, then reductions (CR 602.2b applies 601.2f).
  return activationLessCost(s, o, withManaTax(s, o, pid, parseManaCost(manaCost)), 0, first ? { n: first, atLeastOne: false } : undefined);
}

/** `cost` with what taxes on mana abilities add to it (Oppressive Rays, Gloom). */
export function withManaTax(s: GameState, o: GameObject, pid: PlayerId, cost: ParsedCost): ParsedCost {
  const tax = manaActivationTax(s, o, pid);
  return tax ? { ...cost, symbols: [...cost.symbols, { kind: "generic" as const, amount: tax }] } : cost;
}

/** A mana ability's mana cost as `pid` activates it, or null when it costs no mana (none printed, no tax on it). */
export function manaAbilityCostOf(s: GameState, pid: PlayerId, o: GameObject, ab: { manaCost: string }): ParsedCost | null {
  return ab.manaCost || manaActivationTax(s, o, pid) ? manaAbilityCost(s, pid, o, ab.manaCost) : null;
}

/** How much a player gives up by using it, beyond the tap: lower is better. */
export function manaPenalty(ab: ManaAbility): number {
  // A storage land's counters are saved-up mana: spent only when nothing else will do.
  const stored = ab.produces.kind === "removeX" ? 6 : 0;
  return (ab.discardHand ? 50 : 0) + (ab.sacrificeSelf || ab.returnSelf || ab.onceEver ? 8 : 0) + (ab.returnAtNextUntap ? 3 : 0) + stored + (ab.manaCost ? 4 : 0) + (ab.selfDamage || ab.lifeCost || ab.energyCost || ab.removeCounters || ab.tapCost ? 2 : 0) + (ab.skipNextUntap || ab.putCounter || ab.becomesManaColor ? 1 : 0);
}

/**
 * Which ability an "add {G} with this" action uses when it doesn't say: the cheapest one that
 * can make that mana right now (a player would choose the ability that keeps the permanent).
 */
export function pickManaAbility(s: GameState, pid: PlayerId, o: GameObject, mana: ManaType): number | undefined {
  const abs = manaAbilitiesOn(s, o);
  return abs
    .map((ab, i) => ({ ab, i }))
    .filter(({ ab, i }) => manaChoices(s, o, ab).includes(mana) && !manaAbilityProblem(s, pid, o, i) && !ab.tapCost && !manaCombos(s, o, ab))
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
  // Valleymaker: mana that goes to a player chosen as it resolves isn't its controller's to count on.
  if (e?.type !== "addMana" || e.who) return null;
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
    // "This mana can't be spent to cast spells from your hand" (Vhal): the rider's restriction, for autopay (CR 106.6).
    ...(e.only ? { spendOnly: e.only } : {}),
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
  return manaChoices(s, o, m).flatMap((mana) =>
    insteadWays(s, o, m.tap, (instead) => manaProduced(s, o, m, mana, undefined, instead)).flatMap(({ instead, adds }) =>
      manaTriggerResults(s, pid, o, m, adds).map((r) => ({ ability: index, mana, ...(instead ? { instead } : {}), adds: [...adds, ...r.adds], ...(r.extra.length ? { extra: r.extra } : {}), ...snowPart(s, o, adds, r) })),
    ),
  );
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
    if (problem && !(/not enough mana/.test(problem) && (ab.manaCost || manaActivationTax(s, o, pid)))) return [];
    const riders = allEffects(ab.body.effects).some((e) => !["addMana", "choose", "gainLife", "delayed", "counters", "if"].includes(e.type)) ? 2 : 0;
    return [{ index, ab, options: activatedManaOptions(s, o, index) ?? [], penalty: manaPenalty(m) + riders }];
  });
}

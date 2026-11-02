// Spending mana from a pool that may hold restricted mana (CR 106.6: "Spend this mana only to cast a creature spell."),
// mana from sources that matter (106.3: snow, Treasures, creatures, artifacts) and mana kept as steps end.

import type { ActivatedAbility, ManaSpend } from "./abilities";
import { abilitiesOf, defOf, isType, objIsType } from "./cards";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { blackForLife, emptyPool, payFromPool, type CostSymbol, type ManaPool, type ParsedCost, type Payment } from "./mana";
import { characteristics, controllerOf, everyCreatureType } from "./layers";
import type { CardDef, Color, GameObject, GameState, ManaLot, ManaOrigin, ManaSpentTrigger, ManaType, PlayerId } from "./types";

/**
 * What a payment is for: casting a spell (as it is on the stack: face down, bestowed), activating an ability of a
 * source, or anything else (a cost paid while something resolves, a special action, another player's spell).
 */
export type ManaUse = { spell: CardDef; /** Security Rhox's "Spend only mana produced by Treasures to cast it this way". */ treasureOnly?: true; /** Whether its total cost has {X} (CR 601.2f): its mana or alternative cost, or a kicker; unset, its mana cost. */ xCost?: boolean; /** The card being cast, for "to cast your commander" (Opal Palace). */ object?: GameObject; /** Kicked as it's cast (CR 702.33d), for "only to cast kicked spells" (Throne of Makindi). */ kicked?: true; /** Cast for its disturb cost (CR 702.146a), for "only to pay a disturb cost" (Unblinking Observer). */ disturb?: true; /** Cast from its caster's hand (CR 601.2a), for "can't be spent to cast spells from your hand" (Karolina Dean). */ fromHand?: true; /** The spell's owner (CR 108.3), for "only to cast spells you don't own" (Thieving Varmint). */ owner?: PlayerId; /** A spell with flashback (its own, or given to it) cast from a graveyard, however it's cast (Altar of the Lost's rulings). */ flashbackFromGraveyard?: true } | { ability: GameObject; /** Its activation cost has {X} (Elementalist's Palette's mana). */ xCost?: true; /** A Class's level ability (CR 716.2a): "to gain a Class level". */ classLevel?: true; /** "Spend only mana of the chosen color to activate this ability" (Throne of Eldraine): only mana of these types. */ onlyColors?: ManaType[]; /** Mana of any color pays its colored symbols (Drana and Linvala's borrowed abilities, CR 609.4b). */ anyColor?: true; /** An equip ability (CR 702.6a), for "activate an equip ability" (Freya Crescent). */ equip?: true; /** Not an ability: unlocking a door of this Room, a special action (CR 709.5e, 116.2m), for "unlock doors" (Smoky Lounge). */ unlock?: true } | "other";

/** What paying an activated ability's mana cost is for: its source, and only the chosen color's mana if it says so. */
export function abilityUse(o: GameObject, ab: ActivatedAbility, s?: GameState): ManaUse {
  // A borrowed ability of Drana and Linvala's: "you may spend mana as though it were mana of any color to activate those abilities".
  const anyColor = !!s && !!ab.borrowed && o.zone === "battlefield" && !!abilitiesOf(s, o).borrows?.anyColor && characteristics(s, o).hasPrintedAbilities;
  // "To gain a Class level": its level ability, "~'s level becomes N" (CR 716.2a).
  const level = ab.activateIf?.kind === "classLevel" && ab.body.effects.some((e) => e.type === "classLevel") ? { classLevel: true as const } : {};
  const x = { ...(/\{X\}/.test(ab.manaCost) ? { xCost: true as const } : {}), ...(ab.equip ? { equip: true as const } : {}) };
  const only = ab.spendOnlyChosenColor ? (o.chosen?.color ? [o.chosen.color] : []) : ab.spendOnly;
  return only ? { ability: o, onlyColors: only, ...level, ...x, ...(anyColor ? { anyColor } : {}) } : { ability: o, ...level, ...x, ...(anyColor ? { anyColor } : {}) };
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
  // Elementalist's Palette: a spell with {X} in its mana cost, an ability with {X} in its activation cost. A cost paid as
  // something resolves isn't known to have one here, so it isn't paid this way.
  // "Spend this mana only on costs that contain {X}": a spell's total cost or an ability's cost with {X} in it, X 0 or
  // not, on any part of it (rulings on Rosheen Meanderer and Elementalist's Palette).
  if (only.xCosts) return use !== "other" && ("spell" in use ? (use.xCost ?? /\{X\}/.test(use.spell.manaCost)) : !!use.xCost);
  if (use === "other") return !!only.other;
  // Smoky Lounge: "and unlock doors": the special action, no ability (CR 116.2m); otherwise as any other cost.
  if ("ability" in use && use.unlock) return !!only.unlockDoors || !!only.other;
  // Unblinking Observer: "to pay a disturb cost": any spell cast for its disturb cost, whatever it is (CR 702.146a).
  if ("spell" in use && only.disturb && use.disturb) return true;
  // Karolina Dean, Runaway: "This mana can't be spent to cast spells from your hand" (CR 106.6).
  if ("spell" in use && only.notFromHand && use.fromHand) return false;
  // Thieving Varmint: "only to cast spells you don't own": a spell whose owner isn't the player paying (CR 108.3).
  if ("spell" in use && only.notOwnSpells) return use.owner !== undefined && use.owner !== pid;
  // Altar of the Lost: "only to cast spells with flashback from a graveyard": any such spell, flashback used or not (rulings).
  if ("spell" in use && only.flashbackFromGraveyard) return !!use.flashbackFromGraveyard;
  // Throne of Makindi: "to cast kicked spells": a spell whose kicker cost is paid as it's cast (CR 702.33d, 601.2b).
  // Volshe Tideturner: "or a kicked spell" beside other spells.
  if ("spell" in use && only.kickedSpells && (use.kicked || !only.spells)) return !!use.kicked;
  if ("spell" in use) return !!only.spells && printedMatches(only.spells, use.spell);
  if (only.classLevel && use.classLevel) return true;
  if (only.equipAbilities && use.equip) return true;
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
export function poolFor(s: GameState, pid: PlayerId, use: ManaUse): { pool: ManaPool; prefer: ManaPool; treasure: ManaPool; snow: ManaPool; colorOnly?: ManaPool } {
  const pool = treasureOnly(use) ? emptyPool() : plainMana(s, pid);
  const prefer = emptyPool();
  const treasure = emptyPool();
  const snow = emptyPool();
  const colorOnly = emptyPool();
  let anyColorOnly = false;
  for (const l of usableLots(s, pid, use)) {
    pool[l.mana] += l.n;
    if (l.only) prefer[l.mana] += l.n;
    if (l.from?.includes("treasure")) treasure[l.mana] += l.n;
    if (l.from?.includes("snow")) snow[l.mana] += l.n;
    if (l.only?.notGeneric) {
      colorOnly[l.mana] += l.n;
      anyColorOnly = true;
    }
  }
  const only = usableTypes(use);
  if (only) for (const x of [pool, prefer, treasure, snow, colorOnly]) for (const m of Object.keys(x) as ManaType[]) if (!only.includes(m)) x[m] = 0;
  return { pool, prefer, treasure, snow, ...(anyColorOnly ? { colorOnly } : {}) };
}

/**
 * How `pid` may pay this cost: with K'rrik's "for each {B} in a cost, you may pay 2 life rather than pay that mana", any
 * {B} with 2 life too. It applies to every cost its controller pays with mana: spells, abilities, special actions (rulings).
 */
export function payableCost(s: GameState, pid: PlayerId, cost: ParsedCost, use?: ManaUse): ParsedCost {
  const mine = s.battlefield.map((id) => s.objects[id]!).filter((o) => controllerOf(s, o) === pid);
  const krrik = mine.some((o) => !!abilitiesOf(s, o).lifeForBlack);
  // Agatha's Soul Cauldron: "... to activate abilities of creatures you control".
  const creatureAbility = !!use && use !== "other" && "ability" in use && use.ability.zone === "battlefield" && controllerOf(s, use.ability) === pid && objIsType(s, use.ability, "Creature");
  // Oath of Nissa: "... to cast planeswalker spells", the spell as it's cast.
  const walkerSpell = !!use && use !== "other" && "spell" in use && isType(use.spell, "Planeswalker");
  const orrery =
    (!!use && use !== "other" && "ability" in use && !!use.anyColor) ||
    mine.some((o) => !!abilitiesOf(s, o).spendAnyColor || (creatureAbility && !!abilitiesOf(s, o).spendAnyColorCreatureAbilities) || (walkerSpell && !!abilitiesOf(s, o).spendAnyColorPlaneswalkerSpells)) ||
    s.battlefield.some((id) => !!abilitiesOf(s, s.objects[id]!).spendAnyColorAll); // Mycosynth Lattice: every player
  const c = krrik ? blackForLife(cost) : cost;
  return orrery ? anyColorPays(c) : c;
}

/**
 * Chromatic Orrery: "You may spend mana as though it were mana of any color" (CR 609.4b): any mana pays a colored symbol
 * (one mana for {2/W}), so they're generic for paying; {C} still needs colorless mana, and a Phyrexian symbol (K'rrik's
 * {B} too) is any one mana or 2 life. What's spent stays what it was.
 */
function anyColorPays(cost: ParsedCost): ParsedCost {
  return {
    ...cost,
    symbols: cost.symbols.map((x): CostSymbol => {
      if ((x.kind === "colored" && x.color !== "C") || ((x.kind === "hybrid" || x.kind === "twoHybrid") && !x.life)) return { kind: "generic", amount: 1 };
      // A Phyrexian symbol: any mana, or 2 life. So is a hybrid one K'rrik lets be paid with life (as its {B}).
      if (x.kind === "phyrexian") return { ...x, any: true };
      if ((x.kind === "hybrid" || x.kind === "twoHybrid") && x.life) return { kind: "phyrexian", color: x.kind === "hybrid" ? x.options[0]! : x.color, ...(x.kind === "hybrid" && x.phyrexian ? {} : { krrik: true as const }), any: true };
      return x;
    }),
  };
}

/** Could `pid` pay this from their pool for `use`? */
export function canPayFromPool(s: GameState, pid: PlayerId, cost0: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity): boolean {
  const cost = payableCost(s, pid, cost0, use);
  const { pool, snow, colorOnly } = poolFor(s, pid, use);
  return !!payFromPool(cost, pool, extraGeneric, life, { snow, ...(colorOnly ? { colorOnly } : {}) });
}

/** What spending mana from these sources counts as (CR 106.3): "mana from a Treasure", "from creatures", "from an artifact". */
export type SpentFrom = Record<"treasure" | "creature" | "artifact", number>;

/**
 * Pay this from `pid`'s pool for `use`. Returns the payment (with the mana spent by type, and how much of it each kind
 * of source made), or null (and nothing changes) if it can't be paid. Which mana of a type pays is the player's choice
 * (CR 601.2h): restricted mana it may be spent on first; then, on a spell or an ability, mana from a Treasure, a creature
 * or an artifact ("if mana from a Treasure was spent"), but on anything else the rest first; mana kept as steps end last.
 */
export function spendFromPool(s: GameState, pid: PlayerId, cost0: ParsedCost, use: ManaUse, extraGeneric = 0, life = Infinity, opts: { spreadColors?: boolean; want?: Partial<Record<Color, number>>; avoid?: Partial<Record<Color, number>>; wantSnow?: boolean } = {}): (Payment & { spent: ManaPool; treasure: number; from: SpentFrom; uncounterable?: true; spentTriggers?: ManaSpentTrigger[]; haste?: "endOfTurn" | "game"; commanderCounters?: number; creatureCounters?: number; sources?: string[] }) | null {
  const p = s.players[pid]!;
  const cost = payableCost(s, pid, cost0, use);
  const { pool, prefer, treasure, snow, colorOnly } = poolFor(s, pid, use);
  const first = { ...prefer };
  if (use !== "other") for (const m of Object.keys(first) as ManaType[]) first[m] = Math.min(pool[m], first[m] + treasure[m]);
  const paid = payFromPool(cost, pool, extraGeneric, life, { ...opts, prefer: first, snow, ...(colorOnly ? { colorOnly } : {}) });
  if (!paid) return null;
  const lots = usableLots(s, pid, use);
  const plain = treasureOnly(use) ? emptyPool() : plainMana(s, pid);
  const spent = emptyPool();
  const from: SpentFrom = { treasure: 0, creature: 0, artifact: 0 };
  let uncounterable = false;
  const spentTriggers: ManaSpentTrigger[] = [];
  let haste: "endOfTurn" | "game" | undefined;
  let commanderCounters = 0;
  let creatureCounters = 0;
  const sources = new Set<string>();
  // Mana that gives a creature spell haste is spent on one first, and kept back from anything else; Opal Palace's
  // mana the same way for its controller's commander.
  const creatureSpell = use !== "other" && "spell" in use && isType(use.spell, "Creature");
  const ownCommander = use !== "other" && "spell" in use && !!use.object?.isCommander && use.object.owner === pid;
  // Lower ranks are spent first; `plain` stands for the mana of that type in no lot.
  // "A Dragon creature spell" (Carnelian Orb of Dragonkind): a creature spell of that type, changelings included (CR 702.73a).
  const spellDef = use !== "other" && "spell" in use ? use.spell : undefined;
  const hasteFits = (l: ManaLot) => creatureSpell && (!l.hasteType || (!!spellDef && (spellDef.subtypes.includes(l.hasteType) || everyCreatureType(spellDef))));
  // Boseiju's mana goes to an instant or sorcery spell first, which it makes uncounterable.
  const instantOrSorcery = !!spellDef && (isType(spellDef, "Instant") || isType(spellDef, "Sorcery"));
  const rank = (l: ManaLot, plain: boolean) => (l.keep ? 10 : 0) + (l.haste ? (hasteFits(l) ? -1 : 3) : 0) + (l.uncounterableInstantSorcery ? (instantOrSorcery ? -1 : 3) : 0) + (l.commanderCounters ? (ownCommander ? -1 : 3) : 0) + (l.creatureCounter ? (creatureSpell ? -1 : 3) : 0) + (l.only ? 0 : plain === (use === "other") ? 1 : 2);
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
        if (k && l.uncounterableInstantSorcery && instantOrSorcery) uncounterable = true;
        if (k && l.haste && hasteFits(l) && haste !== "game") haste = l.haste;
        if (l.commanderCounters && ownCommander) commanderCounters += k;
        if (l.creatureCounter && creatureSpell) creatureCounters += k;
        if (k && l.source) sources.add(l.source);
        if (l.spentTrigger && use !== "other" && "spell" in use) for (let j = 0; j < k; j++) spentTriggers.push(l.spentTrigger);
        for (const f of l.from ?? []) if (f !== "snow") from[f] += k;
      }
    };
    // Mana that can't pay generic costs (Jegantha) paid colored symbols only, as payFromPool chose; the snow mana it spent
    // came from snow lots (CR 107.4h); the rest from the other lots and plain mana.
    const co = paid.colorOnly?.[m] ?? 0;
    take(lots.filter((l) => l.mana === m && !!l.only?.notGeneric), co);
    const others = lots.filter((l) => l.mana === m && !l.only?.notGeneric);
    take(others.filter((l) => l.from?.includes("snow")), paid.snow[m]);
    take([plainLot, ...others.filter((l) => !l.from?.includes("snow"))], spent[m] - co - paid.snow[m]);
  }
  if (p.manaLots) p.manaLots = p.manaLots.filter((l) => l.n > 0);
  if (!p.manaLots?.length) p.manaLots = undefined;
  return { ...paid, pool: { ...p.manaPool }, spent, treasure: from.treasure, from, ...(uncounterable ? { uncounterable: true as const } : {}), ...(spentTriggers.length ? { spentTriggers } : {}), ...(haste ? { haste } : {}), ...(commanderCounters ? { commanderCounters } : {}), ...(creatureCounters ? { creatureCounters } : {}), ...(sources.size ? { sources: [...sources] } : {}) };
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
export function addMana(s: GameState, pid: PlayerId, mana: ManaType[], how: { only?: ManaSpend; from?: ManaOrigin[]; keep?: ManaLot["keep"]; spentTrigger?: ManaSpentTrigger; haste?: ManaLot["haste"]; hasteType?: string; commanderCounters?: true; creatureCounter?: true; uncounterableInstantSorcery?: true; source?: string } = {}): void {
  const p = s.players[pid]!;
  const from = how.from?.length ? [...new Set(how.from)].sort() : undefined;
  const trig = (t: ManaSpentTrigger | undefined) => (t ? `${t.sourceId}#${t.sourceZc}` : "");
  for (const m of mana) {
    p.manaPool[m]++;
    if (!how.only && !from && !how.keep && !how.spentTrigger && !how.haste && !how.commanderCounters && !how.creatureCounter && !how.uncounterableInstantSorcery && !how.source) continue;
    const same = p.manaLots?.find((l) => l.mana === m && l.only?.text === how.only?.text && (l.from ?? []).join() === (from ?? []).join() && l.keep === how.keep && trig(l.spentTrigger) === trig(how.spentTrigger) && l.haste === how.haste && l.hasteType === how.hasteType && l.commanderCounters === how.commanderCounters && l.creatureCounter === how.creatureCounter && l.uncounterableInstantSorcery === how.uncounterableInstantSorcery && l.source === how.source);
    if (same) same.n++;
    else (p.manaLots ??= []).push({ mana: m, n: 1, ...(how.only ? { only: how.only } : {}), ...(from ? { from } : {}), ...(how.keep ? { keep: how.keep } : {}), ...(how.spentTrigger ? { spentTrigger: how.spentTrigger } : {}), ...(how.haste ? { haste: how.haste, ...(how.hasteType ? { hasteType: how.hasteType } : {}) } : {}), ...(how.commanderCounters ? { commanderCounters: true as const } : {}), ...(how.creatureCounter ? { creatureCounter: true as const } : {}), ...(how.uncounterableInstantSorcery ? { uncounterableInstantSorcery: true as const } : {}), ...(how.source ? { source: how.source } : {}) });
  }
}

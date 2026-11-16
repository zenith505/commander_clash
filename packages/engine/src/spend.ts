// Spending mana from a pool that may hold restricted mana (CR 106.6: "Spend this mana only to cast a creature spell."),
// mana from sources that matter (106.3: snow, Treasures, creatures, artifacts) and mana kept as steps end.

import type { ActivatedAbility, ManaSpend } from "./abilities";
import { abilitiesOf, defOf, isType, objIsType } from "./cards";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { inRange } from "./effects/targeting";
import { defMv } from "./faces";
import { compileCard } from "./oracle";
import { blackForLife, emptyPool, parseManaCost, payFromPool, xCount, type CostSymbol, type ManaPool, type ParsedCost, type Payment } from "./mana";
import { characteristics, controllerOf, everyCreatureType } from "./layers";
import type { CardDef, Color, FaceDownKind, GameObject, GameState, ManaLot, ManaOrigin, ManaSpentTrigger, ManaType, ObjectId, PlayerId } from "./types";

/**
 * What a payment is for: casting a spell (as it is on the stack: face down, bestowed), activating an ability of a
 * source, or anything else (a cost paid while something resolves, a special action, another player's spell).
 */
export type ManaUse = { spell: CardDef; /** Security Rhox's "Spend only mana produced by Treasures to cast it this way". */ treasureOnly?: true; /** Myr Superion's "Spend only mana produced by creatures to cast ~" (CompiledCard.creatureManaOnly). */ creatureOnly?: true; /** Imperiosaur's "Spend only mana produced by basic lands to cast ~" (CompiledCard.basicLandManaOnly). */ basicLandOnly?: true; /** Whether its total cost has {X} (CR 601.2f): its mana or alternative cost, or a kicker; unset, its mana cost. */ xCost?: boolean; /** The card being cast, for "to cast your commander" (Opal Palace). */ object?: GameObject; /** Kicked as it's cast (CR 702.33d), for "only to cast kicked spells" (Throne of Makindi). */ kicked?: true; /** Cast for its disturb cost (CR 702.146a), for "only to pay a disturb cost" (Unblinking Observer). */ disturb?: true; /** Cast from its caster's hand (CR 601.2a), for "can't be spent to cast spells from your hand" (Karolina Dean). */ fromHand?: true; /** Cast from exile (CR 601.2a), for "only to cast spells from exile" (Interdimensional Web Watch). */ fromExile?: true; /** Cast from a graveyard (CR 601.2a), for "only to cast a spell from your graveyard" (Lord of the Forsaken), with `owner`. */ fromGraveyard?: true; /** The spell's owner (CR 108.3), for "only to cast spells you don't own" (Thieving Varmint). */ owner?: PlayerId; /** A spell with flashback (its own, or given to it) cast from a graveyard, however it's cast (Altar of the Lost's rulings). */ flashbackFromGraveyard?: true; /** Cast face down (CR 708.4), for "only to cast face-down spells" (Tin Street Gossip). */ faceDown?: true; /** The X announced for it (CR 601.2b), for its mana value on the stack (CR 202.3e): "only to cast spells with mana value 4 or greater" (Ashling, Rimebound, round 387). */ x?: number } | { ability: GameObject; /** Its activation cost has {X} (Elementalist's Palette's mana). */ xCost?: true; /** A Class's level ability (CR 716.2a): "to gain a Class level". */ classLevel?: true; /** "Spend only mana of the chosen color to activate this ability" (Throne of Eldraine): only mana of these types. */ onlyColors?: ManaType[]; /** Mana of any color pays its colored symbols (Drana and Linvala's borrowed abilities, CR 609.4b). */ anyColor?: true; /** An equip ability (CR 702.6a), for "activate an equip ability" (Freya Crescent). */ equip?: true; /** Not an ability: unlocking a door of this Room, a special action (CR 709.5e, 116.2m), for "unlock doors" (Smoky Lounge). */ unlock?: true; /** Not an ability: turning this face-down permanent face up this way, a special action (CR 116.2b), for "to turn creatures face up" (Tin Street Gossip). */ faceUp?: FaceDownKind; /** Not an ability: paying this permanent's cumulative upkeep (CR 702.24a), for "only to pay cumulative upkeep costs" (Adarkar Unicorn). */ cumulativeUpkeep?: true; /** A power-up ability (CR 702.193), for "only to activate power-up abilities" (Quinjet Technician). */ powerUp?: true; /** Not an ability: foretelling this card, a special action (CR 702.143a, 116.2h), for "to foretell cards" (Niko Defies Destiny). */ foretell?: true } | "other";

/** What paying an activated ability's mana cost is for: its source, and only the chosen color's mana if it says so. */
export function abilityUse(o: GameObject, ab: ActivatedAbility, s?: GameState): ManaUse {
  // A borrowed ability of Drana and Linvala's: "you may spend mana as though it were mana of any color to activate those abilities".
  const anyColor = !!s && !!ab.borrowed && o.zone === "battlefield" && !!abilitiesOf(s, o).borrows?.anyColor && characteristics(s, o).hasPrintedAbilities;
  // "To gain a Class level": its level ability, "~'s level becomes N" (CR 716.2a).
  const level = ab.activateIf?.kind === "classLevel" && ab.body.effects.some((e) => e.type === "classLevel") ? { classLevel: true as const } : {};
  const x = { ...(/\{X\}/.test(ab.manaCost) ? { xCost: true as const } : {}), ...(ab.equip ? { equip: true as const } : {}), ...(ab.keyword === "Power-up" ? { powerUp: true as const } : {}) };
  const only = ab.spendOnlyChosenColor ? (o.chosen?.color ? [o.chosen.color] : []) : ab.spendOnly;
  return only ? { ability: o, onlyColors: only, ...level, ...x, ...(anyColor ? { anyColor } : {}) } : { ability: o, ...level, ...x, ...(anyColor ? { anyColor } : {}) };
}

/** What a "you may pay" question's mana is spent on: a permanent's cumulative upkeep (Adarkar Unicorn's mana), or other. */
export function mayPayUse(s: GameState, pend: { upkeepOf?: ObjectId } | null | undefined): ManaUse {
  const o = pend?.upkeepOf ? s.objects[pend.upkeepOf] : undefined;
  return o ? { ability: o, cumulativeUpkeep: true } : "other";
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
  // Cataclysmic Prospecting: "for each mana from a Desert spent to cast ~" (CR 106.3), a Desert as it made the mana.
  if (here && c.subtypes.includes("Desert")) out.push("desert");
  // Bat Colony: "for each mana from a Cave spent to cast it": a Cave as it made the mana, the same way.
  if (here && c.subtypes.includes("Cave")) out.push("cave");
  // Imperiosaur: "mana produced by basic lands": a land with the basic supertype as it made the mana (CR 205.4a), not a
  // triggered mana ability's source when a basic land is tapped (rulings).
  if (here && c.types.includes("Land") && c.supertypes.includes("Basic")) out.push("basicLand");
  return out;
}

const treasureOnly = (use: ManaUse) => use !== "other" && "spell" in use && !!use.treasureOnly;
/** Myr Superion: only mana a creature on the battlefield made (CR 106.3, 109.2; rulings), restricted mana too if it may be spent on it. */
const creatureOnly = (use: ManaUse) => use !== "other" && "spell" in use && (!!use.creatureOnly || !!use.basicLandOnly);
/** The kind of source Myr Superion's or Imperiosaur's mana must come from. */
const onlyOrigin = (use: ManaUse): ManaOrigin | undefined => (use !== "other" && "spell" in use ? (use.creatureOnly ? "creature" : use.basicLandOnly ? "basicLand" : undefined) : undefined);

/** The lots of `pid`'s pool that can be spent on `use`. With Security Rhox's cost, only unrestricted mana from Treasures. */
function usableLots(s: GameState, pid: PlayerId, use: ManaUse): ManaLot[] {
  const lots = s.players[pid]!.manaLots ?? [];
  if (treasureOnly(use)) return lots.filter((l) => !l.only && l.from?.includes("treasure"));
  const origin = onlyOrigin(use);
  if (origin) return lots.filter((l) => l.from?.includes(origin) && (!l.only || spendAllows(s, pid, l.only, use)));
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
  // Tin Street Gossip: "to turn creatures face up", any way (CR 116.2b); Qarsi Deceiver only for a morph cost (a megamorph
  // cost is one, CR 702.37b) or a manifested creature's mana cost (CR 701.40b), not a disguise cost or a cloaked one's.
  if ("ability" in use && use.faceUp) return !!only.faceUp?.includes(use.faceUp) || !!only.other;
  // Niko Defies Destiny: "to foretell cards", the special action (CR 702.143a).
  // Karfell Harbinger: "to foretell a card from your hand", the special action only (foretelling is always from a hand,
  // CR 702.143a), not casting a foretold card.
  if ("ability" in use && use.foretell) return !!only.foretell || !!only.foretellAction || !!only.other;
  // "Or cast spells that have foretell": a spell with the keyword, wherever it's cast from and whatever cost is paid (rulings).
  if ("spell" in use && only.foretell && compileCard(use.spell).foretell) return true;
  // Adarkar Unicorn: "to pay cumulative upkeep costs" (CR 702.24a), a cost paid as the upkeep trigger resolves.
  if ("ability" in use && use.cumulativeUpkeep) return !!only.cumulativeUpkeep || !!only.other;
  // Tin Street Gossip, Qarsi Deceiver: a spell cast face down (CR 708.4), whatever its card is; a face-down spell is a
  // creature spell (CR 708.2a).
  if ("spell" in use && only.faceDownSpells && use.faceDown) return true;
  // Unblinking Observer: "to pay a disturb cost": any spell cast for its disturb cost, whatever it is (CR 702.146a).
  if ("spell" in use && only.disturb && use.disturb) return true;
  // Karolina Dean, Runaway: "This mana can't be spent to cast spells from your hand" (CR 106.6).
  if ("spell" in use && only.notFromHand && use.fromHand) return false;
  // Interdimensional Web Watch: "only to cast spells from exile": any spell cast from exile, by any permission (rulings).
  if ("spell" in use && only.fromExile) return !!use.fromExile;
  // Lord of the Forsaken, Rootcoil Creeper: "only to cast a spell from your graveyard": one cast from a graveyard the paying
  // player owns (CR 404.1), whatever let it be cast.
  if ("spell" in use && only.fromOwnGraveyard) return !!use.fromGraveyard && use.owner === pid;
  // Thieving Varmint: "only to cast spells you don't own": a spell whose owner isn't the player paying (CR 108.3).
  if ("spell" in use && only.notOwnSpells) return use.owner !== undefined && use.owner !== pid;
  // Altar of the Lost: "only to cast spells with flashback from a graveyard": any such spell, flashback used or not (rulings).
  if ("spell" in use && only.flashbackFromGraveyard) return !!use.flashbackFromGraveyard;
  // Throne of Makindi: "to cast kicked spells": a spell whose kicker cost is paid as it's cast (CR 702.33d, 601.2b).
  // Volshe Tideturner: "or a kicked spell" beside other spells.
  if ("spell" in use && only.kickedSpells && (use.kicked || !only.spells)) return !!use.kicked;
  // Ashling, Rimebound (round 387): "spells with mana value 4 or greater": the spell's mana value as it's cast, an {X} in
  // its mana cost counted as the X announced (CR 202.3e).
  if ("spell" in use && only.spells?.manaValue && !only.spells.anyOf) {
    const cost = parseManaCost(use.spell.manaCost);
    const mvNow = defMv(use.spell) + (cost.hasX && !use.faceDown ? (use.x ?? 0) * xCount(cost) : 0);
    return inRange(mvNow, only.spells.manaValue) && printedMatches({ ...only.spells, manaValue: undefined }, use.spell);
  }
  if ("spell" in use) return !!only.spells && printedMatches(only.spells, use.spell);
  if (only.classLevel && use.classLevel) return true;
  if (only.equipAbilities && use.equip) return true;
  // Quinjet Technician: "to activate power-up abilities", of any permanent (CR 702.193).
  if (only.powerUpAbilities && use.powerUp) return true;
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
  const pool = treasureOnly(use) || creatureOnly(use) ? emptyPool() : plainMana(s, pid);
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
  const creatureAbility = !!use && use !== "other" && "ability" in use && !use.faceUp && !use.cumulativeUpkeep && use.ability.zone === "battlefield" && controllerOf(s, use.ability) === pid && objIsType(s, use.ability, "Creature");
  // Oath of Nissa: "... to cast planeswalker spells", the spell as it's cast.
  const walkerSpell = !!use && use !== "other" && "spell" in use && isType(use.spell, "Planeswalker");
  // Case File Auditor: "... to cast Case spells".
  const spellSubtypes = !!use && use !== "other" && "spell" in use ? use.spell.subtypes : undefined;
  // Manascape Refractor (round 382): "to pay the activation costs of ~'s abilities": an ability of that permanent being
  // activated, a mana ability too, not a special action or cumulative upkeep (CR 602.1, 605.1a, 609.4b).
  const ownAbility = !!use && use !== "other" && "ability" in use && !use.faceUp && !use.cumulativeUpkeep && !use.unlock && !use.foretell && use.ability.zone === "battlefield" && !!abilitiesOf(s, use.ability).spendAnyColorOwnAbilities;
  const orrery =
    ownAbility ||
    (!!use && use !== "other" && "ability" in use && !!use.anyColor) ||
    mine.some((o) => !!abilitiesOf(s, o).spendAnyColor || (creatureAbility && !!abilitiesOf(s, o).spendAnyColorCreatureAbilities) || (walkerSpell && !!abilitiesOf(s, o).spendAnyColorPlaneswalkerSpells) || (!!spellSubtypes && spellSubtypes.includes(abilitiesOf(s, o).spendAnyColorSubtypeSpells ?? "\u0000"))) ||
    s.battlefield.some((id) => !!abilitiesOf(s, s.objects[id]!).spendAnyColorAll); // Mycosynth Lattice: every player
  const c0 = krrik ? blackForLife(cost) : cost;
  const c = mine.some((o) => !!abilitiesOf(s, o).spendWhiteAsRed) ? whiteAsRed(c0) : c0;
  return orrery ? anyColorPays(c) : c;
}

/**
 * Sunglasses of Urza: "You may spend white mana as though it were red mana" (CR 609.4b): white mana pays a {R} as it
 * would a {R/W}, the red half of a hybrid symbol ({R/G} as {R/G/W}), {2/R} and {R/P} too. The cost stays what it was and
 * the mana spent stays white, as payFromPool records it.
 */
function whiteAsRed(cost: ParsedCost): ParsedCost {
  return {
    ...cost,
    symbols: cost.symbols.map((x): CostSymbol => {
      if (x.kind === "colored" && x.color === "R") return { kind: "hybrid", options: ["R", "W"] };
      if (x.kind === "hybrid" && x.options.includes("R") && !x.options.includes("W")) return { ...x, options: [...x.options, "W"] };
      if (x.kind === "twoHybrid" && x.color === "R") return { ...x, also: "W" };
      // {R/P}: red or white mana, or 2 life, still a Phyrexian symbol (CR 107.4f).
      if (x.kind === "phyrexian" && x.color === "R" && !x.krrik && !x.any) return { kind: "hybrid", options: ["R", "W"], life: true, phyrexian: true };
      return x;
    }),
  };
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
export type SpentFrom = Record<"treasure" | "creature" | "artifact" | "desert" | "cave", number>;

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
  const plain = treasureOnly(use) || creatureOnly(use) ? emptyPool() : plainMana(s, pid);
  const spent = emptyPool();
  const from: SpentFrom = { treasure: 0, creature: 0, artifact: 0, desert: 0, cave: 0 };
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
  // Biophagus's mana counts for any creature spell; Guildmages' Forum's for a multicolored one (CR 105.2b), Animal
  // Attendant's for a non-Human one (a changeling is every creature type, CR 702.73a).
  const counterFits = (l: ManaLot) => creatureSpell && !!spellDef && (l.creatureCounter === true || (l.creatureCounter === "multicolored" && spellDef.colors.length >= 2) || (l.creatureCounter === "nonHuman" && !spellDef.subtypes.includes("Human") && !everyCreatureType(spellDef)));
  const rank = (l: ManaLot, plain: boolean) => (l.keep ? 10 : 0) + (l.haste ? (hasteFits(l) ? -1 : 3) : 0) + (l.uncounterableInstantSorcery ? (instantOrSorcery ? -1 : 3) : 0) + (l.commanderCounters ? (ownCommander ? -1 : 3) : 0) + (l.creatureCounter ? (counterFits(l) ? -1 : 3) : 0) + (l.only ? 0 : plain === (use === "other") ? 1 : 2);
  // Mana a basic land made and nothing else marks (Imperiosaur's "basicLand" origin) is spent as plain mana is.
  const plainLike = (l: ManaLot) => l.from?.length === 1 && l.from[0] === "basicLand" && !l.only && !l.keep && !l.spentTrigger && !l.haste && !l.commanderCounters && !l.creatureCounter && !l.uncounterableInstantSorcery && !l.source;
  for (const m of Object.keys(spent) as ManaType[]) {
    spent[m] = pool[m] - paid.pool[m];
    if (!spent[m]) continue;
    p.manaPool[m] -= spent[m];
    const plainLot: ManaLot = { mana: m, n: plain[m] };
    const take = (candidates: ManaLot[], n: number) => {
      for (const l of candidates.sort((a, b) => rank(a, a === plainLot || plainLike(a)) - rank(b, b === plainLot || plainLike(b)))) {
        const k = Math.min(n, l.n);
        l.n -= k;
        n -= k;
        if (k && l.only?.uncounterable) uncounterable = true;
        if (k && l.uncounterableInstantSorcery && instantOrSorcery) uncounterable = true;
        if (k && l.haste && hasteFits(l) && haste !== "game") haste = l.haste;
        if (l.commanderCounters && ownCommander) commanderCounters += k;
        if (l.creatureCounter && counterFits(l)) creatureCounters += k;
        if (k && l.source) sources.add(l.source);
        if (l.spentTrigger && use !== "other" && "spell" in use) for (let j = 0; j < k; j++) spentTriggers.push(l.spentTrigger);
        for (const f of l.from ?? []) if (f !== "snow" && f !== "basicLand") from[f] += k;
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
  // The Ringhart Crest: "a creature spell of the chosen type or a legendary creature spell": the type chosen for `o` in
  // its alternative; with none chosen, only a legendary creature spell (rulings).
  if (only?.spells?.anyOf?.some((a) => a.chosen === "type"))
    return { ...only, spells: { ...only.spells, anyOf: only.spells.anyOf.map((a) => bindChosen(a, o.chosen)) }, text: `${only.text.replace(/\.$/, "")} (${o.chosen?.type ?? "none chosen"}).` };
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
export function addMana(s: GameState, pid: PlayerId, mana: ManaType[], how: { only?: ManaSpend; from?: ManaOrigin[]; keep?: ManaLot["keep"]; spentTrigger?: ManaSpentTrigger; haste?: ManaLot["haste"]; hasteType?: string; commanderCounters?: true; creatureCounter?: ManaLot["creatureCounter"]; uncounterableInstantSorcery?: true; source?: string } = {}): void {
  const p = s.players[pid]!;
  const from = how.from?.length ? [...new Set(how.from)].sort() : undefined;
  const trig = (t: ManaSpentTrigger | undefined) => (t ? `${t.sourceId}#${t.sourceZc}` : "");
  for (const m of mana) {
    p.manaPool[m]++;
    if (!how.only && !from && !how.keep && !how.spentTrigger && !how.haste && !how.commanderCounters && !how.creatureCounter && !how.uncounterableInstantSorcery && !how.source) continue;
    const same = p.manaLots?.find((l) => l.mana === m && l.only?.text === how.only?.text && (l.from ?? []).join() === (from ?? []).join() && l.keep === how.keep && trig(l.spentTrigger) === trig(how.spentTrigger) && l.haste === how.haste && l.hasteType === how.hasteType && l.commanderCounters === how.commanderCounters && l.creatureCounter === how.creatureCounter && l.uncounterableInstantSorcery === how.uncounterableInstantSorcery && l.source === how.source);
    if (same) same.n++;
    else (p.manaLots ??= []).push({ mana: m, n: 1, ...(how.only ? { only: how.only } : {}), ...(from ? { from } : {}), ...(how.keep ? { keep: how.keep } : {}), ...(how.spentTrigger ? { spentTrigger: how.spentTrigger } : {}), ...(how.haste ? { haste: how.haste, ...(how.hasteType ? { hasteType: how.hasteType } : {}) } : {}), ...(how.commanderCounters ? { commanderCounters: true as const } : {}), ...(how.creatureCounter ? { creatureCounter: how.creatureCounter } : {}), ...(how.uncounterableInstantSorcery ? { uncounterableInstantSorcery: true as const } : {}), ...(how.source ? { source: how.source } : {}) });
  }
}

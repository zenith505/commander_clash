// Characteristics of permanents after continuous effects: the layer system (CR 613).
//
// An object's characteristics start from its card (or token definition) and every
// applicable continuous effect is applied in layer order:
//   2 control, 4 type, 5 color, 6 abilities, 7a defined P/T, 7b set P/T, 7c modify P/T (and counters),
//   7d switch P/T, then rules effects such as "can't block" (CR 613.11).
// Layers 1 (copy) and 3 (text) have no effects in the engine yet, so cards needing them stay
// unsupported. Characteristic-defining power and toughness (7a) work on the battlefield only.
//
// Effects come from two places:
//  - resolved spells and abilities, stored in GameState.effects with the set of objects
//    they affect locked in when they began (CR 611.2c);
//  - static abilities of permanents on the battlefield, regenerated on every computation
//    and applying to whatever matches right now (CR 611.3a).
// Within a layer, effects apply in timestamp order (CR 613.7) unless one depends on
// another (CR 613.8). Once an effect starts applying, it keeps applying to the same
// objects in later layers even if its source loses the ability meanwhile (CR 613.6).

import { creatureCardAbove } from "./graveyard";
import type { Affects, Amount, DamageMod, Modification, StaticAbility, StaticCondition, TargetSpec, TimingWindow, TurnPoint, Untargetable } from "./abilities";
import { evalAmount, partySize } from "./amounts";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { basePower, baseToughness, defOf, pairedWith } from "./cards";
import { meldPartnerName } from "./meld-results";
import { defMv, sameName } from "./faces";
import { liveEmblems } from "./emblems";
import { bindChosenKeywords, IDENTITY_PROTECTION, subtypeSet } from "./keywords";
import { compileCard, compileGranted } from "./oracle";
import type { CardDef, Color, GameObject, GameState, ObjectId, PlayerId } from "./types";

export type Layer = "2" | "4" | "5" | "6" | "7a" | "7b" | "7c" | "7d" | "rules";
const LAYERS: Layer[] = ["2", "4", "5", "6", "7a", "7b", "7c", "7d", "rules"];

export function layerOf(m: Modification): Layer {
  switch (m.kind) {
    case "control":
      return "2";
    case "addTypes":
    case "setTypes":
    case "setSubtypes":
    case "setLandTypes":
    case "loseTypes":
      return "4";
    case "setColors":
    case "addColors":
      return "5";
    case "cantBlock":
      return m.ability ? "6" : "rules";
    case "addKeywords":
    case "removeKeywords":
    case "loseAllAbilities":
    case "addAbility":
    case "unblockedDamage":
      return "6";
    case "definePT":
      return "7a";
    case "setPT":
      return "7b";
    case "modifyPT":
      return "7c";
    case "switchPT":
      return "7d";
    default:
      return "rules";
  }
}

/** One step in how a permanent's power/toughness was reached, for display and debugging. */
export interface PTPart {
  source: string;
  kind: "set" | "modify" | "switch" | "counters";
  power: number;
  toughness: number;
  untilEndOfTurn: boolean;
}

export interface Characteristics {
  name: string;
  supertypes: string[];
  types: string[];
  subtypes: string[];
  /** Changeling: it has every creature type (CR 702.73a, a characteristic-defining ability). */
  allCreatureTypes: boolean;
  colors: Color[];
  keywords: string[];
  /**
   * Keywords (lowercase) it has only from one effect that "doesn't remove" that effect's source (Cho-Manno's Blessing):
   * that protection doesn't make the source fall off (CR 702.16c), protection from anywhere else does.
   */
  sparedBy?: Record<string, ObjectId>;
  /** False once an effect made it lose all abilities: none of its printed abilities work. */
  hasPrintedAbilities: boolean;
  /** It lost all abilities, the mana abilities of its basic land types too (CR 305.6). */
  landAbilitiesLost?: true;
  /** Abilities effects gave it, as text ("~" is this object), in layer 6 order. */
  grantedAbilities: string[];
  /** The timestamp of the effect that gave each of `grantedAbilities` (CR 613.7a). */
  grantedAt?: number[];
  controller: PlayerId;
  power: number;
  toughness: number;
  printedPower: number;
  printedToughness: number;
  pt: PTPart[];
  cantAttack: boolean;
  cantBlock: boolean;
  cantBeBlocked: boolean;
  /** "You may have ~ assign its combat damage as though it weren't blocked." */
  unblockedDamage: boolean;
  doesntUntap: boolean;
  cantBeSuspected: boolean;
  /** "Can block only creatures with flying" (CR 509.1b). */
  blocksOnlyFlyers: boolean;
  /** "Attacks each combat if able" (CR 508.1d). */
  attacksIfAble: boolean;
  /** Untaps during each other player's untap step too. */
  untapsDuringOthers: boolean;
  /** Generic mana per creature attacking its controller (Ghostly Prison). */
  attackTax: number;
  /** The same for attacking a planeswalker its controller controls (Sphere of Safety). */
  attackTaxPlaneswalkers: number;
  /** Players it has to attack if able (encore). */
  mustAttack: PlayerId[];
  /** "Can't be blocked by creatures with power 2 or less", "by Walls" (CR 509.1b). */
  cantBeBlockedBy: TargetSpec[];
  /**
   * "Can't be the target of spells or abilities your opponents control" and the like. `of`: whose opponents, the
   * controller of the ability saying it (an Aura's controller, not the enchanted creature's: rulings on Canopy Cover).
   */
  untargetable?: (Untargetable & { of: PlayerId })[];
  /** "Prevent all damage that would be dealt to / by ~" (CR 615.1). */
  preventDamage?: { to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[] }[];
  /** Damage amount replacements this permanent's static abilities make (see DamageMod): `you` is the ability's controller, `from` its source. */
  damageMods?: (DamageMod & { you: PlayerId; from: ObjectId })[];
  /** The damage it would deal can't be prevented (CR 615.12): all of it, or only its combat damage. */
  unpreventable?: "all" | "combat";
  /** "Can't be blocked except by ...": each entry is a group a blocker has to belong to (CR 509.1b). */
  blockableOnlyBy?: { filters: TargetSpec[]; text: string }[];
  /** Attackers it can't block. */
  cantBlockCreatures: TargetSpec[];
  /** "Can't be blocked by more than one creature" (CR 509.1b). */
  maxOneBlocker: boolean;
  /** "Its activated abilities can't be activated": "all" (mana abilities too, CR 605.1a), "nonMana", or false. */
  cantActivate: false | "all" | "nonMana";
  /** "Can't be blocked except by three or more creatures": the most such an ability asks for, 0 if none (CR 509.1b). */
  minBlockers: number;
  /** The players who goaded it (CR 701.15): it attacks each combat if able, and a player other than them if able. */
  goadedBy: PlayerId[];
  /** "Can't attack unless defending player controls ...": what the defending player has to control. */
  attackUnless: TargetSpec[];
  cantBeBlockedByLesserPower: boolean;
  /** Can't be blocked by creatures with power less than these permanents' (Champion of Lambholt, CR 509.1b). */
  cantBeBlockedByLesserPowerThan: ObjectId[];
  /** The Ring-bearer's (CR 701.54c). */
  cantBeBlockedByGreaterPower: boolean;
  cantAttackAlone: boolean;
  cantBlockAlone: boolean;
  cantAttackSamePlayer: boolean;
  mustBeBlocked: boolean;
  allMustBlock: boolean;
  mustBlock: boolean;
  /** Doran: assigns combat damage by its toughness, always or only while its toughness is greater than its power. */
  assignsToughness: boolean;
  assignsToughnessIfGreater: boolean;
  attackDespiteDefender: boolean;
  /** "Can block an additional creature each combat", added up; "can block any number of creatures". */
  extraBlocks: number;
  blockAny: boolean;
}

/**
 * The card's keywords. The card data names some only generically ("Protection", "Toxic");
 * the text says which ("Protection from black", "Toxic 2"), so those come from the text.
 */
export function printedKeywords(d: CardDef): string[] {
  const c = compileCard(d);
  const fromText = c.textKeywords;
  // A keyword in a level or station striation is there only while the striation applies (CR 711.2, 721.2).
  const striated = new Set((c.striatedKeywords ?? []).map((k) => k.toLowerCase()));
  // Scryfall lists "Protection from X" as "Protection".
  const inStriation = (k: string) => [...striated].some((x) => x === k.toLowerCase() || x.startsWith(`${k.toLowerCase()} `));
  const own = striated.size ? d.keywords.filter((k) => !inStriation(k)) : d.keywords;
  if (!fromText.length) return [...own];
  // And "Hexproof from blue" as "Hexproof from" and "Hexproof" (CR 702.11d: it isn't hexproof itself).
  const hexFrom = fromText.some((k) => /^hexproof from /i.test(k));
  return [...own.filter((k) => k !== "Protection" && k !== "Toxic" && !(hexFrom && (k === "Hexproof" || k === "Hexproof from"))), ...fromText];
}

/** Characteristics straight from the card, with no effects applied. */
function printed(s: GameState, o: GameObject): Characteristics {
  const d = defOf(s, o);
  return {
    name: d.name,
    supertypes: [...d.supertypes],
    types: [...d.types],
    subtypes: [...d.subtypes],
    allCreatureTypes: everyCreatureType(d),
    // "~ is all colors" (CR 604.3) applies first in layer 5 (613.3). A copy whose colors an exception set doesn't have it (707.9d).
    colors: compileCard(d).allColors ? ["W", "U", "B", "R", "G"] : [...d.colors],
    keywords: printedKeywords(d),
    hasPrintedAbilities: true,
    grantedAbilities: [],
    controller: o.controller,
    power: basePower(d),
    toughness: baseToughness(d),
    printedPower: basePower(d),
    printedToughness: baseToughness(d),
    pt: [],
    cantAttack: false,
    cantBlock: false,
    cantBeBlocked: false,
    unblockedDamage: false,
    doesntUntap: false,
    cantBeSuspected: false,
    blocksOnlyFlyers: false,
    attacksIfAble: false,
    untapsDuringOthers: false,
    attackTax: 0,
    attackTaxPlaneswalkers: 0,
    mustAttack: [],
    cantBeBlockedBy: [],
    cantBlockCreatures: [],
    maxOneBlocker: false,
    minBlockers: 0,
    goadedBy: [],
    cantActivate: false,
    attackUnless: [],
    cantBeBlockedByLesserPower: false,
    cantBeBlockedByLesserPowerThan: [],
    cantBeBlockedByGreaterPower: false,
    cantAttackAlone: false,
    cantBlockAlone: false,
    cantAttackSamePlayer: false,
    mustBeBlocked: false,
    allMustBlock: false,
    mustBlock: false,
    assignsToughness: false,
    assignsToughnessIfGreater: false,
    attackDespiteDefender: false,
    extraBlocks: 0,
    blockAny: false,
  };
}

const copyChars = (c: Characteristics): Characteristics => ({
  ...c,
  supertypes: [...c.supertypes],
  types: [...c.types],
  subtypes: [...c.subtypes],
  colors: [...c.colors],
  keywords: [...c.keywords],
  ...(c.sparedBy ? { sparedBy: { ...c.sparedBy } } : {}),
  grantedAbilities: [...c.grantedAbilities],
  ...(c.grantedAt ? { grantedAt: [...c.grantedAt] } : {}),
  pt: [...c.pt],
  cantBeBlockedBy: [...c.cantBeBlockedBy],
  ...(c.untargetable ? { untargetable: [...c.untargetable] } : {}),
  cantBlockCreatures: [...c.cantBlockCreatures],
  attackUnless: [...c.attackUnless],
  goadedBy: [...c.goadedBy],
  mustAttack: [...c.mustAttack],
});

type CharMap = Map<ObjectId, Characteristics>;

/**
 * The keywords a keyword counter can be (CR 122.1b): the keyword a counter of this kind gives, if it's one.
 */
const KEYWORD_COUNTERS = ["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"];
export function keywordOfCounter(kind: string): string | undefined {
  return KEYWORD_COUNTERS.includes(kind) ? kind[0]!.toUpperCase() + kind.slice(1) : undefined;
}

/** A continuous effect being applied: a stored one, or one generated by a static ability. */
interface Inst {
  key: string;
  timestamp: number;
  order: number;
  sourceId?: ObjectId;
  sourceName: string;
  untilEndOfTurn: boolean;
  mods: Modification[];
  /** Stored effects: fixed controller and affected set. */
  controller?: PlayerId;
  fixed?: ObjectId[];
  /** Static abilities: what it applies to, evaluated continuously. */
  affects?: Affects;
  /** Static abilities that apply only while something is true (threshold). */
  condition?: StaticAbility["condition"];
  /** Set when it first applies (CR 613.6). */
  locked?: ObjectId[];
  /** A static ability an effect gave its source, not one of its card's (grantedStatics). */
  granted?: true;
  /** An emblem's static ability (CR 114.4): its source is in the command zone, with `controller` its owner. */
  emblem?: true;
  /** A static ability that works from its card's graveyard (StaticAbility.zone), with `controller` its owner. */
  fromGraveyard?: true;
  /** Its type change applies outside the battlefield too (StaticAbility.offField). */
  offField?: true;
}

function gather(s: GameState): Inst[] {
  const out: Inst[] = [];
  let order = 0;
  for (const e of s.effects)
    out.push({
      key: e.id,
      timestamp: e.timestamp,
      order: order++,
      sourceId: e.sourceId,
      sourceName: e.sourceName,
      untilEndOfTurn: e.duration === "endOfTurn",
      mods: e.mods,
      controller: e.controller,
      fixed: e.affected,
    });
  // Each player's Ring: "Your Ring-bearer is legendary and can't be blocked by creatures with greater power"
  // (CR 701.54c), with the emblem's timestamp (CR 613.7a). Another player gaining control of it ends the designation.
  for (const pid of s.turnOrder) {
    const r = s.players[pid]!.ring;
    const o = r?.bearer && s.objects[r.bearer.id];
    if (!r || !o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== r.bearer!.zc) continue;
    out.push({
      key: `ring:${pid}`,
      timestamp: r.timestamp,
      order: order++,
      sourceName: "The Ring",
      untilEndOfTurn: false,
      mods: [{ kind: "addTypes", types: [], subtypes: [], supertypes: ["Legendary"] }, { kind: "cantBeBlockedByGreaterPower" }],
      controller: pid,
      fixed: [o.id],
    });
  }
  // Emblems' static abilities, with the emblems' timestamps (CR 114.4, 613.7a).
  for (const o of liveEmblems(s))
    compileCard(defOf(s, o)).statics.forEach((st, i) => {
      // A damage replacement's (Ajani Steadfast's emblem) is read in damage.ts.
      if (st.affects.kind === "filter") out.push({ key: `${o.id}#${i}`, timestamp: o.timestamp, order: order++, sourceId: o.id, sourceName: defOf(s, o).name, untilEndOfTurn: false, mods: st.mods, affects: st.affects, controller: o.controller, emblem: true });
    });
  // Static abilities that work from a graveyard (CR 113.6b), each with its card's timestamp there (CR 613.7d).
  for (const pid of s.turnOrder)
    for (const id of s.players[pid]!.graveyard) {
      const o = s.objects[id]!;
      const d = defOf(s, o);
      compileCard(d).statics.forEach((st, i) => {
        if (st.zone === "graveyard") out.push({ key: `${id}#${i}`, timestamp: o.timestamp, order: order++, sourceId: id, sourceName: d.name, untilEndOfTurn: false, mods: st.mods, affects: st.affects, condition: st.condition, controller: o.owner, fromGraveyard: true });
      });
    }
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const d = defOf(s, o);
    // A keyword counter gives it that keyword (CR 122.1b) in layer 6 (613.1f), as of when it was put on (613.7c). Each
    // exalted counter is an instance of exalted, which triggers separately (Emissary of Soulfire rulings).
    for (const [kind, n] of Object.entries(o.counters)) {
      const kw = (n ?? 0) > 0 && keywordOfCounter(kind);
      if (kw) out.push({ key: `counter:${id}:${kind}`, timestamp: o.counterTimestamps?.[kind] ?? o.timestamp, order: order++, sourceName: `${kind} counter`, untilEndOfTurn: false, mods: kw === "Exalted" ? Array.from({ length: n! }, () => ({ kind: "addAbility" as const, text: kw })) : [{ kind: "addKeywords", keywords: [kw] }], controller: o.controller, fixed: [id] });
    }
    // A suspected permanent has menace and "This creature can't block" (CR 701.60c), from when it became suspected.
    if (o.suspected !== undefined)
      out.push({ key: `suspected:${id}`, timestamp: o.suspected, order: order++, sourceName: "Suspected", untilEndOfTurn: false, mods: [{ kind: "addKeywords", keywords: ["Menace"] }, { kind: "cantBlock", ability: true }], controller: o.controller, fixed: [id] });
    // An Equipment with reconfigure attached to a creature stops being a creature and loses its creature types until
    // it's unattached (CR 702.151b, rulings), even if it loses its abilities meanwhile. Its timestamp is the attaching's.
    if (o.attachedTo && compileCard(d).reconfigure)
      out.push({ key: `reconfigure:${id}`, timestamp: o.timestamp, order: order++, sourceName: d.name, untilEndOfTurn: false, mods: [{ kind: "loseTypes", types: ["Creature"] }], controller: o.controller, fixed: [id] });
    compileCard(d).statics.forEach((st, i) =>
      st.zone !== "graveyard" && out.push({
        key: `${id}#${i}`,
        timestamp: o.timestamp, // CR 613.7a
        order: order++,
        sourceId: id,
        sourceName: d.name,
        untilEndOfTurn: false,
        mods: st.mods,
        affects: st.affects,
        condition: st.condition,
        ...(st.offField ? { offField: true as const } : {}),
      }),
    );
  }
  return out;
}

const sameCI = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Does a static ability's source still have it? It must be on the battlefield and not have lost its abilities. */
function exists(s: GameState, e: Inst, chars: CharMap): boolean {
  if (e.fromGraveyard) return !e.condition || conditionMet(s, e.condition, e.sourceId!, e.controller!, chars);
  if (!e.affects || e.emblem) return true;
  const src = chars.get(e.sourceId!);
  if (!src || (!src.hasPrintedAbilities && !e.granted)) return false;
  if (e.condition && !conditionMet(s, e.condition, e.sourceId!, src.controller, chars)) return false;
  if (e.affects.kind === "attached") {
    const host = s.objects[e.sourceId!]!.attachedTo;
    return !!host && chars.has(host);
  }
  return true;
}

const PERMANENT_CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

/**
 * Is an "as long as" condition true? Whatever it looks at on the battlefield is seen as the layers
 * applied so far have left it, so an effect that changes that waits for it (CR 613.8a).
 */
/** Whether the game is in this part of the turn (CR 506.8): see TimingWindow. */
function inWindow(s: GameState, w: TimingWindow): boolean {
  switch (w) {
    case "upkeep":
    case "draw":
    case "end":
    case "declareAttackers":
    case "declareBlockers":
    case "endCombat":
      return s.step === w;
    case "afterUpkeep":
      return s.step !== "untap" && s.step !== "upkeep";
    case "combat": // any combat phase of the turn (CR 506.8c)
      return ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);
    case "combatBeforeBlocks": // before the declare blockers step begins (CR 506.8b)
      return s.step === "beginCombat" || s.step === "declareAttackers";
    case "beforeCombat":
    case "beforeAttackers":
    case "beforeBlockers":
    case "beforeDamage": {
      // Before that point of the turn's first combat (CR 506.8d): the beginning phase and first main phase, and the steps
      // of that combat before it. With no attackers declared, the declare blockers and combat damage steps are skipped,
      // so the window ends with the declare attackers step (506.8e).
      if (["untap", "upkeep", "draw", "main1"].includes(s.step) && !s.combatsThisTurn) return true;
      if ((s.combatsThisTurn ?? 0) !== 1) return false;
      const table: Record<Exclude<TurnPoint, "afterCombat">, string[]> = { beforeCombat: [], beforeAttackers: ["beginCombat"], beforeBlockers: ["beginCombat", "declareAttackers"], beforeDamage: ["beginCombat", "declareAttackers", "declareBlockers"] };
      return table[w].includes(s.step);
    }
    case "afterCombat": // once the turn's first combat phase has ended (CR 506.8d)
      return !!s.combatsThisTurn && !(s.combatsThisTurn === 1 && ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step));
    case "combatAfterBlocks": // not in a combat whose declare blockers step was skipped (CR 506.8f)
      return ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step) && s.blockersStep?.turn === s.turn && s.blockersStep.combat === (s.combatsThisTurn ?? 0);
  }
}

function conditionMet(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, chars: CharMap, eventPlayer?: PlayerId, eventAmount?: number, sourceZc?: number, subjectId?: ObjectId, subjectZc?: number): boolean {
  const src = s.objects[sourceId]!;
  const yard = () => s.players[you]?.graveyard.map((id) => defOf(s, s.objects[id]!)) ?? [];
  switch (cond.kind) {
    case "selfInGraveyard": // the card's own graveyard ability's intervening if (CR 603.4)
      return src.zone === "graveyard" && src.owner === you && (!cond.creatureAbove || creatureCardAbove(s, src));
    case "graveyardAtLeast": // threshold
      return (s.players[you]?.graveyard.length ?? 0) >= cond.n;
    case "graveyardTypes": // delirium: card types, not subtypes or supertypes (CR 205.2a)
      return new Set(yard().flatMap((d) => d.types)).size >= cond.n;
    case "graveyardPermanents": // descend
      return yard().filter((d) => d.types.some((t) => PERMANENT_CARD_TYPES.includes(t))).length >= cond.n;
    case "selfCounter": // unleash (CR 702.98a)
      return (src.counters[cond.counter] ?? 0) > 0;
    case "selfCounters": {
      const n = src.counters[cond.counter] ?? 0;
      return n >= cond.min && (cond.max === undefined || n <= cond.max);
    }
    case "classLevel": {
      const n = src.classLevel ?? 1; // CR 716.2d
      return n >= cond.min && (cond.max === undefined || n <= cond.max);
    }
    case "selfPT": {
      // A trigger's intervening if (CR 603.4) or "if ~'s power is 7 or greater" as it resolves, so the layers are all
      // applied by now. Given the zone change the ability is about (`sourceZc`), once that object has left the
      // battlefield it's its power as it last existed there (CR 608.2h; rulings on Vincent, Vengeful Atoner).
      const here = chars.has(sourceId) && (sourceZc === undefined || (src.zoneChanges ?? 0) === sourceZc);
      const lk = !here && sourceZc !== undefined ? s.lastKnown?.[sourceId] : undefined;
      const c = here ? chars.get(sourceId) : lk?.zc === sourceZc ? lk : undefined;
      if (!c) return false;
      const n = cond.stat === "power" ? c.power : c.toughness;
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
    case "subjectPT": {
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      const here = !!sub && chars.has(sub.id) && (sub.zoneChanges ?? 0) === subjectZc;
      const lk = !here && subjectId !== undefined ? s.lastKnown?.[subjectId] : undefined;
      const c = here ? chars.get(subjectId!) : lk?.zc === subjectZc ? lk : undefined;
      if (!c) return false;
      const n = cond.stat === "power" ? c.power : c.toughness;
      if (cond.greatest && s.battlefield.some((id) => id !== subjectId && chars.get(id)?.types.includes("Creature") && chars.get(id)!.power >= n)) return false;
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
    case "yourTurn":
      return (s.activePlayer === you) !== !!cond.not;
    case "anyOf":
      return cond.conds.some((c) => conditionMet(s, c, sourceId, you, chars, eventPlayer, eventAmount, sourceZc));
    case "beforeAttackers":
      return s.activePlayer === you && ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.step);
    case "during": // CR 506.8, 601.3, 602.5b
      return (!cond.turn || (s.activePlayer === you) === (cond.turn === "you")) && inWindow(s, cond.window);
    case "attackedThisStep": {
      // Attackers are declared as the declare attackers step begins (CR 508.1); attacking only planeswalkers doesn't count.
      const ap = s.players[s.activePlayer];
      return s.step === "declareAttackers" && ap?.attackedPlayers?.turn === s.turn && ap.attackedPlayers.players.includes(you);
    }
    case "amount": {
      // Counted as the layers applied so far left things ("permanents you control": control is layer 2).
      const n = evalAmount(s, cond.amount, { controller: you, sourceId, view: (o) => chars.get(o.id) });
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
    case "monarch":
      return s.monarch === you;
    case "initiative":
      return s.initiative === you;
    case "completedDungeon": {
      const done = s.players[you]?.completedDungeons ?? [];
      return (cond.name ? done.includes(cond.name) : done.length > 0) !== !!cond.not;
    }
    case "fullParty":
      return partySize(s, you, (o) => chars.get(o.id)) === 4;
    case "controlCommander":
      return s.battlefield.some((id) => {
        const c = s.objects[id]!.isCommander ? chars.get(id) : undefined;
        return !!c && c.controller === you && (!cond.own || s.objects[id]!.owner === you) && (!cond.types || cond.types.some((t) => c.types.includes(t)));
      });
    case "ringBearer": {
      // On the battlefield under your control, with the designation (CR 701.54e).
      const b = s.players[you]?.ring?.bearer;
      const o = b && s.objects[b.id];
      const is = !!o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === b.zc && chars.get(o.id)?.controller === you && (!cond.self || o.id === sourceId);
      return is !== !!cond.not;
    }
    case "maxSpeed":
      return s.players[you]?.speed === 4;
    case "eventPlayerHand":
      if (eventPlayer === undefined) return false;
      return (cond.max === undefined || s.players[eventPlayer]!.hand.length <= cond.max) && (cond.min === undefined || s.players[eventPlayer]!.hand.length >= cond.min);
    case "defenderMostLife": {
      // The player it attacked: from the trigger event, or the one it's attacking as it triggers.
      const that = eventPlayer ?? src.attacking;
      if (that === undefined) return false;
      return s.turnOrder.every((p) => p === you || s.players[p]!.lost || s.players[p]!.life <= s.players[that]!.life);
    }
    case "paired": {
      const other = pairedWith(s, src);
      const ok = !!other && (!cond.withKeyword || !!chars.get(other.id)?.keywords.some((k) => sameCI(k, cond.withKeyword!)));
      return ok !== !!cond.not;
    }
    case "attackedThisTurn":
      return (s.players[you]?.attackedTurn === s.turn) !== !!cond.not;
    case "committedCrime":
      return s.players[you]?.crimeTurn === s.turn;
    case "coven": {
      const powers = new Set<number>();
      for (const c of chars.values()) if (c.controller === you && c.types.includes("Creature")) powers.add(c.power);
      return powers.size >= 3;
    }
    case "controlGreatest": {
      // Among permanents of that type only (rulings on Padeem); an {X} in a permanent's mana cost is 0 (CR 202.3e).
      let mine = -Infinity;
      let all = -Infinity;
      for (const [id, c] of chars) {
        if (!c.types.includes(cond.type)) continue;
        const n = cond.stat === "power" ? c.power : cond.stat === "toughness" ? c.toughness : defMv(defOf(s, s.objects[id]!));
        all = Math.max(all, n);
        if (c.controller === you) mine = Math.max(mine, n);
      }
      return mine > -Infinity && mine >= all;
    }
    case "opponentMore": {
      const measure = (p: PlayerId) => {
        if (cond.what === "life") return s.players[p]!.life;
        if (cond.what === "hand") return s.players[p]!.hand.length;
        let n = 0;
        for (const c of chars.values()) if (c.controller === p && c.types.includes(cond.what === "lands" ? "Land" : "Creature")) n++;
        return n;
      };
      const mine = measure(you);
      if (cond.subjectController) {
        // As the land is now, or as it last existed (CR 608.2h).
        const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
        const that = sub && chars.has(sub.id) && (sub.zoneChanges ?? 0) === subjectZc ? chars.get(sub.id)!.controller : subjectId !== undefined && s.lastKnown?.[subjectId]?.zc === subjectZc ? s.lastKnown![subjectId]!.controller : undefined;
        return that !== undefined && that !== you && !s.players[that]!.lost && measure(that) > mine;
      }
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && measure(p) > mine);
    }
    case "attackingMostLife": {
      // Not when it attacks a planeswalker (dethrone rulings).
      if (src.attacking === undefined || src.attackingPermanent) return false;
      const lives = s.turnOrder.filter((p) => !s.players[p]!.lost).map((p) => s.players[p]!.life);
      return s.players[src.attacking]!.life >= Math.max(...lives);
    }
    case "phase": {
      const combat = ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);
      const now = cond.phase === "combat" ? combat : s.step === "main1" || s.step === "main2";
      return now && (!cond.yours || s.activePlayer === you) && (!cond.first || s.combatsThisTurn === 1);
    }
    case "castAnother": // checked before the spell counts itself (CR 601.2f, 601.2i)
      return (s.castThisTurn ?? []).some((c) => c.player === you);
    case "creatureDied":
      return (s.diedThisTurn ?? []).filter((p) => !cond.yours || p === you).length >= (cond.n ?? 1);
    case "meldPartner": {
      // "If you both own and control ~ and a creature named Bruna, the Fading Light" (CR 701.42): ~ as it is now.
      const me = chars.get(sourceId);
      const partner = me && meldPartnerName(defOf(s, src));
      if (!me || !partner || src.owner !== you || me.controller !== you) return false;
      for (const [id, c] of chars) if (id !== sourceId && s.objects[id]!.owner === you && c.controller === you && c.name === partner && c.types.includes(cond.type)) return true;
      return false;
    }
    case "onBattlefield": {
      let n = 0;
      for (const [id, c] of chars) if (objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) n++;
      return (cond.max === undefined || n <= cond.max) && (cond.min === undefined || n >= cond.min);
    }
    case "life": {
      const fits = (life: number) => (cond.min === undefined || life >= cond.min) && (cond.max === undefined || life <= cond.max);
      if (cond.opponent) return s.players.some((p) => p.id !== you && !p.lost && fits(p.life));
      return fits(s.players[you]?.life ?? 0);
    }
    case "opponentLostLife":
      // Paid life counts too (CR 119.4); gaining life doesn't take any back (rulings on Bloodchief Ascension).
      if (cond.n !== undefined) return Object.entries(s.turnLog?.lifeLost ?? {}).some(([p, v]) => Number(p) !== you && v >= cond.n!);
      return (s.lostLifeThisTurn ?? []).some((p) => p !== you);
    case "noCombatDamageSinceLastTurn": {
      const p = s.players[you];
      return !p || p.combatDamagedTurn === undefined || p.combatDamagedTurn < (p.lastTurnBegan ?? 0);
    }
    case "opponentSearched":
      return (s.turnLog?.searched ?? []).some((p) => p !== you);
    case "opponentEntered": {
      // Under one opponent's control: "if an opponent had two or more lands enter" counts each opponent on their own.
      const n: Record<number, number> = {};
      for (const e of s.turnLog?.entered ?? [])
        if (e.controller !== you && cond.types.every((ty) => e.types.includes(ty)) && (!cond.color || e.colors.includes(cond.color))) n[e.controller] = (n[e.controller] ?? 0) + 1;
      return Object.values(n).some((k) => k >= cond.n);
    }
    case "destroyedByOpponent":
      return (s.turnLog?.destroyed ?? []).some((e) => e.controller === you && e.by !== you);
    case "damagedByCreatures":
      return (s.turnLog?.damagedBy?.[you]?.length ?? 0) >= cond.n;
    case "damagedBySelfDied":
      return (s.turnLog?.diedDamaged ?? []).some((d) => d.by.includes(sourceId));
    case "subjectDealtExcess":
      return subjectId !== undefined && (s.turnLog?.excessDealt ?? []).some((e) => e.id === subjectId && e.zc === subjectZc);
    case "opponentsDealtExcess":
      // As the permanent was when it was dealt the damage, wherever it is now (Rith rulings).
      return (s.turnLog?.excessDealt ?? []).some((e) => e.controller !== you && e.types.some((ty) => cond.types.includes(ty)));
    case "subjectNameUnique": {
      // Checked as it triggers and as it resolves (CR 603.4): if the creature has left, the card (now maybe in your
      // graveyard) or the new object it became shares its name (rulings).
      const sub = subjectId !== undefined ? s.objects[subjectId] : undefined;
      if (!sub) return false;
      const here = sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === subjectZc;
      if (here && sub.faceDown) return true;
      const name = here ? chars.get(sub.id)?.name : defOf(s, sub).name;
      if (!name) return true;
      for (const [id, c] of chars) if (c.controller === you && c.types.includes("Creature") && !(here && id === sub.id) && !s.objects[id]!.faceDown && sameName(c.name, name)) return false;
      return !yard().some((d) => d.types.includes("Creature") && sameName(d.name, name));
    }
    case "subjectDamagedBy":
      return (s.turnLog?.damageDealtTo?.[`${subjectId}@${subjectZc}`] ?? []).some((d) => d.controller === you && ((cond.spell && !!d.spell) || d.subtypes.some((st) => cond.subtypes.includes(st))));
    case "opponentGainedLife":
      return (s.turnLog?.gainedLife ?? []).some((p) => p !== you);
    case "opponentCardsToGraveyard":
      return Object.entries(s.turnLog?.toGraveyard ?? {}).some(([p, k]) => Number(p) !== you && k >= cond.n);
    case "opponentCastCount":
      return s.turnOrder.some((p) => p !== you && (s.castThisTurn ?? []).filter((c) => c.player === p).length >= cond.n);
    case "opponentCast":
      return (s.castThisTurn ?? []).some((c) => c.player !== you && !!c.colors?.some((x) => cond.colors.includes(x)));
    case "noneInHand":
      return !(s.players[you]?.hand ?? []).some((id) => printedMatches(cond.filter, defOf(s, s.objects[id]!)));
    case "opponentDealtDamage":
      // Also an opponent who has left the game since (Spinerock Knoll rulings).
      return Object.entries(s.damageThisTurn ?? {}).some(([p, n]) => Number(p) !== you && n >= cond.n);
    case "attackedWith": {
      const w = s.players[you]?.attackedWith;
      return w?.turn === s.turn && w.keys.length >= cond.n;
    }
    case "handAtLeast":
      return (s.players[you]?.hand.length ?? 0) >= cond.n;
    case "handsEmpty":
      return s.players.filter((p) => !p.lost).every((p) => p.hand.length === 0);
    case "totalPower": {
      let n = 0;
      for (const c of chars.values()) if (c.controller === you && c.types.includes("Creature")) n += c.power;
      return n >= cond.n;
    }
    case "libraryAtMost":
      return s.players.some((p) => !p.lost && p.library.length <= cond.n);
    case "drawn": {
      const drew = (p: number) => {
        const d = s.players[p]?.draws;
        return d?.turn === s.turn && d.n >= cond.n;
      };
      return cond.opponent ? s.turnOrder.some((p) => p !== you && drew(p)) : drew(you);
    }
    case "descended":
      return (s.descendedThisTurn ?? []).includes(you);
    case "revolt":
      return (s.permanentLeftThisTurn ?? []).includes(you);
    case "void":
      return !!s.voidThisTurn;
    case "selfIs": {
      const c = chars.get(sourceId);
      return !!c && objectMatches(s, cond.filter, src, you, false, undefined, c, (x) => chars.get(x.id));
    }
    case "attachedIs": {
      const host = src.attachedTo ? s.objects[src.attachedTo] : undefined;
      const c = host && chars.get(host.id);
      return !!c && objectMatches(s, cond.filter, host, you, false, undefined, c, (x) => chars.get(x.id));
    }
    case "opponentPoison":
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && (s.players[p]!.poison ?? 0) >= cond.n);
    case "increment": {
      const c = chars.get(sourceId);
      return !!c && c.types.includes("Creature") && eventAmount !== undefined && (eventAmount > c.power || eventAmount > c.toughness);
    }
    case "suspected":
      return (src.suspected !== undefined) !== !!cond.not; // CR 701.60
    case "solved":
      return !!src.solved !== !!cond.not; // CR 719.3b
    case "anchor":
      return src.chosen?.anchor === cond.word; // CR 614.12b
    case "cardsToGraveyard":
      return Math.min(...cond.types.map((t) => s.turnLog?.toGraveyardTypes?.[t] ?? 0)) >= cond.n;
    case "cardToYourGraveyard":
      return cond.types.some((t) => !!s.turnLog?.toOwnGraveyardTypes?.[you]?.includes(t));
    case "sourceDealtAtLeast":
      return Object.values(s.turnLog?.sourceDamage?.[you] ?? {}).some((n) => n >= cond.n);
    case "sourcesDealtDamage":
      return (s.turnLog?.damageSources?.[you]?.length ?? 0) >= cond.n;
    case "castCount":
      return (s.castThisTurn ?? []).filter((c) => c.player === you && printedMatches(cond.filter, s.cards[c.card]!)).length >= cond.n;
    case "colorsAmong": {
      const colors = new Set<Color>();
      for (const c of chars.values()) if (c.controller === you) for (const k of c.colors) colors.add(k);
      return colors.size >= cond.n;
    }
    case "lifeGainedThisTurn":
      return (s.turnLog?.lifeGained?.[you] ?? 0) >= cond.n;
    case "castLastTurn": {
      // With no turn before this one there's no last turn to look at.
      const cast = s.lastTurn?.cast;
      if (!cast) return false;
      return cond.none ? cast.every((n) => n === 0) : cast.some((n) => n >= (cond.onePlayer ?? 1));
    }
    case "citysBlessing":
      return !!s.players[you]?.citysBlessing !== !!cond.not;
    case "self": {
      if (cond.not) return !conditionMet(s, { kind: "self", is: cond.is }, sourceId, you, chars, eventPlayer, eventAmount, sourceZc);
      if (cond.is === "attacking") return src.attacking !== undefined;
      // CR 506.5: "attacking alone" means it's attacking and no other creature is.
      if (cond.is === "attackingAlone") return src.attacking !== undefined && !s.battlefield.some((id) => id !== src.id && s.objects[id]!.attacking !== undefined);
      // "~ has hexproof as long as it's untapped" (Paradise Druid): tapping it doesn't change the effects' cache key otherwise.
      if (cond.is === "tapped" || cond.is === "untapped") return src.tapped === (cond.is === "tapped");
      if (cond.is === "devoured") return (src.devoured ?? 0) > 0;
      if (cond.is === "monstrous") return !!src.monstrous; // CR 701.37b
      if (cond.is === "escaped") return !!src.escaped; // CR 702.138b
      if (cond.is === "attachedToCreature") return !!src.attachedTo && !!chars.get(src.attachedTo)?.types.includes("Creature");
      if (cond.is === "attackedThisTurn") return src.attacked?.turn === s.turn;
      if (cond.is === "attackedBattleThisTurn") return src.attacked?.turn === s.turn && !!src.attacked.battle;
      // Its controller has controlled it continuously since their most recent turn began, or not (CR 302.6).
      if (cond.is === "controlledThisTurn") return src.zone === "battlefield" && src.controlledSinceTurn === s.turn;
      if (cond.is === "hasCounter") return Object.values(src.counters).some((n) => (n ?? 0) > 0);
      if (cond.is === "saddled") return !!src.saddled; // CR 702.171b
      if (cond.is === "enteredThisTurn") return src.zone === "battlefield" && src.enteredTurn === s.turn;
      if (cond.is === "onBattlefield") return src.zone === "battlefield";
      if (cond.is === "prepared") return !!src.prepared; // CR 722.3a
      const attached = s.battlefield.filter((id) => s.objects[id]!.attachedTo === sourceId).map((id) => ({ id, c: chars.get(id) }));
      const aura = (a: { c?: Characteristics }) => !!a.c?.subtypes.includes("Aura");
      if (cond.is === "enchanted") return attached.some(aura);
      if (cond.is === "equipped") return attached.some((a) => a.c?.subtypes.includes("Equipment"));
      // Modified: counters, equipped, or enchanted by an Aura its controller controls (CR 700.9).
      const mine = chars.get(sourceId)?.controller;
      return Object.values(src.counters).some((n) => (n ?? 0) > 0) || attached.some((a) => a.c?.subtypes.includes("Equipment") || (aura(a) && a.c?.controller === mine));
    }
    case "control": {
      // "Defending player" is the player the source is attacking (CR 506.2); it has none otherwise.
      // "An opponent controls seven or more lands": any one opponent.
      const whose = cond.who === "defending" ? (src.attacking !== undefined ? [src.attacking] : []) : cond.who === "opponent" ? s.turnOrder.filter((p) => p !== you && !s.players[p]!.lost) : [you];
      return whose.some((who) => {
        let n = 0;
        // A face-down permanent has no name (CR 708.2), so it adds none.
        const names = new Set<string>();
        for (const [id, c] of chars) {
          if (cond.other && id === sourceId) continue;
          if (cond.otherThanSubject && id === subjectId) continue;
          if (c.controller !== who) continue;
          if (!objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) continue;
          if (!cond.differentNames) n++;
          else if (!s.objects[id]!.faceDown) names.add(c.name);
        }
        if (cond.differentNames) n = names.size;
        return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
      });
    }
    case "allOf":
      return cond.conds.every((c) => conditionMet(s, c, sourceId, you, chars, eventPlayer, eventAmount, sourceZc, subjectId, subjectZc));
  }
}

/** Is an "as long as" or "if" condition true right now, outside of working out characteristics? */
export function staticConditionNow(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, eventPlayer?: PlayerId, eventAmount?: number, sourceZc?: number, subjectId?: ObjectId, subjectZc?: number): boolean {
  const chars: CharMap = new Map(s.battlefield.map((id) => [id, characteristics(s, s.objects[id]!)]));
  return conditionMet(s, cond, sourceId, you, chars, eventPlayer, eventAmount, sourceZc, subjectId, subjectZc);
}

function controllerOfInst(e: Inst, chars: CharMap): PlayerId {
  if (e.controller !== undefined) return e.controller;
  return chars.get(e.sourceId!)!.controller;
}

function appliesTo(s: GameState, e: Inst, chars: CharMap): ObjectId[] {
  if (e.locked) return e.locked.filter((id) => chars.has(id));
  if (e.fixed) return e.fixed.filter((id) => chars.has(id));
  const a = e.affects!;
  if (a.kind === "self") return [e.sourceId!];
  if (a.kind === "attached") {
    const host = s.objects[e.sourceId!]!.attachedTo;
    return host && chars.has(host) ? [host] : [];
  }
  if (a.kind === "paired") {
    const other = pairedWith(s, s.objects[e.sourceId!]!);
    return other && chars.has(other.id) ? [e.sourceId!, other.id] : [];
  }
  const you = controllerOfInst(e, chars);
  const out: ObjectId[] = [];
  // "Creatures you control of the chosen type": the choice made as the source entered.
  const spec = a.spec && bindChosen(a.spec, s.objects[e.sourceId!]?.chosen);
  for (const [id, c] of chars) {
    if (a.other && id === e.sourceId) continue;
    if (!a.types.every((t) => c.types.includes(t))) continue;
    if (a.subtypes?.length && !(c.allCreatureTypes && c.types.includes("Creature")) && !a.subtypes.some((t) => c.subtypes.some((x) => sameCI(x, t)))) continue;
    if (a.colors?.length && !a.colors.some((col) => c.colors.includes(col))) continue;
    if (a.controller === "you" && c.controller !== you) continue;
    if (a.controller === "opponent" && c.controller === you) continue;
    if (a.controller === "enchanted" && c.controller !== s.objects[e.sourceId!]?.attachedToPlayer) continue;
    if (a.ownedCommanders && !(s.objects[id]!.isCommander && s.objects[id]!.owner === you)) continue;
    if (spec && !objectMatches(s, spec, s.objects[id]!, you, false, undefined, c, (x) => chars.get(x.id))) continue;
    out.push(id);
  }
  return out;
}

/**
 * New subtypes replace the existing ones of the same kind only (CR 205.1a): "becomes a Frog"
 * replaces creature types and leaves an Equipment an Equipment.
 */
function setSubtypes(c: Characteristics, subtypes: string[]) {
  if (!subtypes.length) return;
  const sets = new Set(subtypes.map(subtypeSet));
  c.subtypes = [...c.subtypes.filter((st) => !sets.has(subtypeSet(st))), ...subtypes];
  if (sets.has("Creature")) c.allCreatureTypes = false;
}

function applyMod(s: GameState, c: Characteristics, m: Modification, e: Inst, chars: CharMap) {
  // Numbers a static ability counts are counted now, with what the earlier layers did (CR 611.3a, 613.4).
  const num = (a: Amount) =>
    evalAmount(s, a, { controller: controllerOfInst(e, chars), sourceId: e.sourceId, chosen: e.sourceId ? s.objects[e.sourceId]?.chosen : undefined, view: (o) => chars.get(o.id) });
  switch (m.kind) {
    case "control":
      c.controller = controllerOfInst(e, chars);
      return;
    case "addTypes": {
      for (const t of m.types) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.subtypes) if (!c.subtypes.includes(t)) c.subtypes.push(t);
      const chosen = m.chosenType && e.sourceId ? s.objects[e.sourceId]?.chosen?.type : undefined;
      if (chosen && !c.subtypes.includes(chosen)) c.subtypes.push(chosen);
      for (const t of m.supertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      if (m.allCreatureTypes) c.allCreatureTypes = true;
      return;
    }
    case "setTypes": {
      // The new card types replace the old, but an instant or sorcery stays one (CR 205.1a). Subtypes of
      // card types it no longer has go too; those of types it keeps stay unless the effect sets that kind.
      const kept = c.types.filter((t) => t === "Instant" || t === "Sorcery");
      // A planeswalker's subtypes (Sarkhan) and Siege are planeswalker and battle types (CR 205.3j, 205.3q).
      const was = c.types;
      const setOf = (st: string) => subtypeSet(st) ?? (st === "Siege" ? "Battle" : was.includes("Planeswalker") ? "Planeswalker" : null);
      c.types = [...m.types, ...kept.filter((t) => !m.types.includes(t))];
      const hasSet = (set: string | null) => set === null || (set === "Spell" ? c.types.includes("Instant") || c.types.includes("Sorcery") : c.types.includes(set));
      c.subtypes = c.subtypes.filter((st) => hasSet(setOf(st)));
      if (!c.types.includes("Creature")) c.allCreatureTypes = false;
      setSubtypes(c, m.subtypes);
      // "Becomes a legendary ... creature": it gains the supertype and keeps any others (CR 205.4b).
      for (const t of m.supertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      return;
    }
    case "setSubtypes": {
      const chosen = m.chosenType && e.sourceId ? s.objects[e.sourceId]?.chosen?.type : undefined;
      setSubtypes(c, m.chosenType ? (chosen ? [chosen] : []) : m.subtypes);
      return;
    }
    case "setLandTypes":
      // CR 305.7: its old land types go, and so do the abilities from its rules text (its keywords are all printed ones
      // this early, layer 6 grants come later). Its basic land types give it their mana abilities (manaAbilitiesOn).
      // Card types and supertypes stay: a nonbasic land stays nonbasic, a land creature stays a creature.
      if (!c.types.includes("Land")) return;
      c.subtypes = [...c.subtypes.filter((st) => subtypeSet(st) !== "Land"), ...m.subtypes];
      c.hasPrintedAbilities = false;
      c.keywords = [];
      c.sparedBy = undefined;
      return;
    case "loseTypes":
      c.types = c.types.filter((t) => !m.types.includes(t));
      c.subtypes = c.subtypes.filter((st) => !m.types.includes(subtypeSet(st) ?? ""));
      if (m.types.includes("Creature")) c.allCreatureTypes = false;
      return;
    case "setColors":
      c.colors = [...m.colors];
      return;
    case "addColors":
      for (const col of m.colors) if (!c.colors.includes(col)) c.colors.push(col);
      return;
    case "addKeywords":
      // "Has protection from the chosen color": the color chosen as the source entered.
      for (const k of bindChosenKeywords(m.keywords, e.sourceId ? s.objects[e.sourceId]?.chosen?.color : undefined, m.keywords.includes(IDENTITY_PROTECTION) ? commandersIdentity(s, controllerOfInst(e, chars)) : undefined)) {
        const key = k.toLowerCase();
        if (!c.keywords.some((x) => sameCI(x, k))) {
          c.keywords.push(k);
          if (m.spares && e.sourceId) (c.sparedBy ??= {})[key] = e.sourceId;
        } else if (c.sparedBy?.[key] !== undefined && !(m.spares && c.sparedBy[key] === e.sourceId)) delete c.sparedBy[key]; // it has it from elsewhere too
      }
      return;
    case "removeKeywords":
      // Losing hexproof loses each "hexproof from [quality]" too (CR 702.11e).
      c.keywords = c.keywords.filter((x) => !m.keywords.some((k) => sameCI(x, k) || (sameCI(k, "Hexproof") && /^hexproof from /i.test(x))));
      for (const k of m.keywords) if (c.sparedBy) delete c.sparedBy[k.toLowerCase()];
      return;
    case "loseAllAbilities":
      // Abilities granted before this (earlier timestamps) go too; later ones stay (CR 613.7). So do the mana abilities
      // its basic land types give it (CR 305.6; Imprisoned in the Moon rulings).
      c.landAbilitiesLost = true;
      c.keywords = [];
      c.sparedBy = undefined;
      c.hasPrintedAbilities = false;
      c.grantedAbilities = [];
      c.grantedAt = undefined;
      c.unblockedDamage = false;
      c.cantBlock = false; // only abilities' "can't block" is set before the rules layer
      return;
    case "unblockedDamage":
      c.unblockedDamage = true;
      return;
    case "addAbility":
      c.grantedAbilities.push(m.text);
      (c.grantedAt ??= []).push(e.timestamp);
      return;
    case "definePT":
      if (m.power !== undefined) c.power = num(m.power);
      if (m.toughness !== undefined) c.toughness = num(m.toughness);
      c.pt.push({ source: e.sourceName, kind: "set", power: c.power, toughness: c.toughness, untilEndOfTurn: false });
      return;
    case "setPT": {
      const [p, t] = [num(m.power), num(m.toughness)];
      c.power = p;
      c.toughness = t;
      c.pt.push({ source: e.sourceName, kind: "set", power: p, toughness: t, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "modifyPT": {
      const [p, t] = [num(m.power), num(m.toughness)];
      c.power += p;
      c.toughness += t;
      c.pt.push({ source: e.sourceName, kind: "modify", power: p, toughness: t, untilEndOfTurn: e.untilEndOfTurn });
      return;
    }
    case "switchPT":
      [c.power, c.toughness] = [c.toughness, c.power];
      c.pt.push({ source: e.sourceName, kind: "switch", power: c.power, toughness: c.toughness, untilEndOfTurn: e.untilEndOfTurn });
      return;
    case "cantAttack":
      c.cantAttack = true;
      return;
    case "cantBlock":
      c.cantBlock = true;
      return;
    case "cantBeBlocked":
      c.cantBeBlocked = true;
      return;
    case "doesntUntap":
      c.doesntUntap = true;
      return;
    case "cantBeSuspected":
      c.cantBeSuspected = true;
      return;
    case "untapsDuringOthers":
      c.untapsDuringOthers = true;
      return;
    case "attackTax": {
      const n = m.amount !== undefined ? Math.max(0, num(m.amount)) : m.n;
      c.attackTax += n;
      if (m.planeswalkers) c.attackTaxPlaneswalkers += n;
      return;
    }
    case "blocksOnlyFlyers":
      c.blocksOnlyFlyers = true;
      return;
    case "attacksIfAble":
      c.attacksIfAble = true;
      return;
    case "mustAttackPlayer":
      if (!c.mustAttack.includes(m.player)) c.mustAttack.push(m.player);
      return;
    case "cantBeBlockedBy":
      c.cantBeBlockedBy.push(m.filter);
      return;
    case "untargetable":
      c.untargetable = [...(c.untargetable ?? []), { ...m.by, of: e.controller ?? (e.sourceId ? chars.get(e.sourceId)?.controller : undefined) ?? c.controller }];
      return;
    case "preventDamage": {
      const { kind: _, ...p } = m;
      c.preventDamage = [...(c.preventDamage ?? []), p];
      return;
    }
    case "unpreventable":
      if (c.unpreventable !== "all") c.unpreventable = m.combat ? "combat" : "all";
      return;
    case "damageMod":
      c.damageMods = [...(c.damageMods ?? []), { ...m.mod, you: controllerOfInst(e, chars), from: e.sourceId ?? "" }];
      return;
    case "blockableOnlyBy":
      c.blockableOnlyBy = [...(c.blockableOnlyBy ?? []), { filters: m.filters, text: m.text }];
      return;
    case "cantBlockCreatures":
      c.cantBlockCreatures.push(m.filter);
      return;
    case "maxOneBlocker":
      c.maxOneBlocker = true;
      return;
    case "cantActivate":
      if (c.cantActivate !== "all") c.cantActivate = m.exceptMana ? "nonMana" : "all";
      return;
    case "goad": {
      const by = controllerOfInst(e, chars);
      if (!c.goadedBy.includes(by)) c.goadedBy.push(by);
      c.attacksIfAble = true;
      return;
    }
    case "minBlockers":
      c.minBlockers = Math.max(c.minBlockers, m.n);
      return;
    case "cantAttackUnless":
      c.attackUnless.push(m.defenderControls);
      return;
    case "cantBeBlockedByLesserPower":
      if (m.than === "source") {
        if (e.sourceId && !c.cantBeBlockedByLesserPowerThan.includes(e.sourceId)) c.cantBeBlockedByLesserPowerThan.push(e.sourceId);
      } else c.cantBeBlockedByLesserPower = true;
      return;
    case "cantBeBlockedByGreaterPower":
    case "cantAttackAlone":
    case "cantBlockAlone":
    case "cantAttackSamePlayer":
    case "mustBeBlocked":
    case "allMustBlock":
    case "mustBlock":
    case "attackDespiteDefender":
      c[m.kind] = true;
      return;
    case "assignsToughness":
      if (m.ifGreater) c.assignsToughnessIfGreater = true;
      else c.assignsToughness = true;
      return;
    case "blockAdditional":
      c.extraBlocks += m.n;
      return;
    case "blockAny":
      c.blockAny = true;
      return;
  }
}

const modsIn = (e: Inst, layer: Layer) => e.mods.filter((m) => layerOf(m) === layer);

/** Apply an effect's parts for one layer. With `lock`, its affected set is fixed from now on (CR 613.6). */
function applyInLayer(s: GameState, e: Inst, layer: Layer, chars: CharMap, lock: boolean) {
  const ids = appliesTo(s, e, chars);
  if (lock && !e.locked) e.locked = ids;
  for (const id of ids) for (const m of modsIn(e, layer)) applyMod(s, chars.get(id)!, m, e, chars);
}

/**
 * Mods that can change what another effect exists for or applies to. Effects only look at
 * controller, types, colors, and whether a source still has its abilities, so only these
 * can create a dependency (CR 613.8a).
 */
const CAN_CREATE_DEPENDENCY = new Set<Modification["kind"]>(["control", "addTypes", "setTypes", "setSubtypes", "setLandTypes", "loseTypes", "setColors", "addColors", "loseAllAbilities"]);

function signature(s: GameState, e: Inst, chars: CharMap): string {
  if (!exists(s, e, chars)) return "gone";
  return `${controllerOfInst(e, chars)}|${appliesTo(s, e, chars).join(",")}`;
}

/**
 * Does `a` depend on `b` (CR 613.8a)? It does if applying `b` would change whether `a`
 * exists, what it applies to, or what it does. Effects with a locked-in set of objects
 * from a resolved spell can't depend on anything.
 */
function dependsOn(s: GameState, a: Inst, b: Inst, layer: Layer, chars: CharMap): boolean {
  if (a.locked || a.fixed) return false;
  if (!modsIn(b, layer).some((m) => CAN_CREATE_DEPENDENCY.has(m.kind))) return false;
  if (!b.locked && !exists(s, b, chars)) return false;
  const trial: CharMap = new Map(chars);
  for (const id of appliesTo(s, b, chars)) trial.set(id, copyChars(chars.get(id)!));
  applyInLayer(s, { ...b }, layer, trial, false);
  return signature(s, a, chars) !== signature(s, a, trial);
}

/**
 * Static abilities effects gave permanents (Criminal Past's 'Commander creatures you own have "This creature gets +X/+0,
 * where X is ..."', Inspiring Leader's '"Creature tokens you control get +2/+2"'), once layer 6 has settled which
 * permanents have them. Only those whose effects all come in later layers can be granted (grants.ts grantedStaticOk).
 * Each has the later of its permanent's timestamp and the granting effect's (CR 613.7a). Whether one counts something
 * goes in `counted`, for the cache.
 */
function grantedStatics(s: GameState, chars: CharMap, order: number, counted: { yes: boolean }): Inst[] {
  const out: Inst[] = [];
  for (const [id, c] of chars)
    c.grantedAbilities.forEach((text, i) =>
      compileGranted(text).statics.forEach((st, j) => {
        if (countsSomething(st)) counted.yes = true;
        out.push({
          key: `${id}^${i}#${j}`,
          timestamp: Math.max(s.objects[id]!.timestamp, c.grantedAt?.[i] ?? 0),
          order: order++,
          sourceId: id,
          sourceName: c.name,
          untilEndOfTurn: false,
          // A granted "This creature's power and toughness are each equal to ..." isn't a characteristic-defining ability
          // (CR 604.3a): it sets them in layer 7b (613.4b), so a later one overrides it (rulings on Chimeric Mass).
          mods: st.mods.map((m) => (m.kind === "definePT" ? { kind: "setPT", power: m.power!, toughness: m.toughness! } : m)),
          affects: st.affects,
          condition: st.condition,
          granted: true,
        });
      }),
    );
  return out;
}

function computeAll(s: GameState, counted = { yes: false }, grants: OffFieldGrant[] = []): CharMap {
  // Cards and spells outside the battlefield read the off-battlefield type changes (offFieldTyped) while this runs: none
  // until layer 4 is done, then those that applied in it, so counts in layer 7 see them (CR 613.1d, 613.4).
  const outer = building;
  building = { grants: [] };
  try {
    return computeLayers(s, counted, grants);
  } finally {
    building = outer;
  }
}

function computeLayers(s: GameState, counted: { yes: boolean }, grants: OffFieldGrant[]): CharMap {
  const chars: CharMap = new Map();
  for (const id of s.battlefield) chars.set(id, printed(s, s.objects[id]!));
  let insts = gather(s).sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
  for (const layer of LAYERS) {
    if (layer === "7a") {
      const more = grantedStatics(s, chars, insts.length, counted);
      if (more.length) insts = [...insts, ...more].sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
    }
    // Suspend's "it gains haste until you lose control of the spell or the permanent it becomes" (CR 702.62a): from
    // when it was cast, so before the other layer 6 effects; only while its caster controls it (layer 2 is done).
    if (layer === "6")
      for (const [id, c] of chars) {
        const o = s.objects[id]!;
        if (o.suspendHaste !== undefined && o.suspendHaste === c.controller && !c.keywords.includes("Haste")) c.keywords.push("Haste");
      }
    let rem = insts.filter((e) => modsIn(e, layer).length && (e.locked || exists(s, e, chars)));
    while (rem.length) {
      // CR 613.8b-c: apply the earliest effect that doesn't wait on another; re-evaluate after each.
      // In a dependency loop, timestamp order wins.
      const pick = rem.find((a) => !rem.some((b) => b !== a && dependsOn(s, a, b, layer, chars))) ?? rem[0]!;
      rem = rem.filter((e) => e !== pick);
      if (!pick.locked && !exists(s, pick, chars)) continue; // an earlier effect in this layer removed it
      applyInLayer(s, pick, layer, chars, true);
      // Once it applies in layer 4 it keeps applying, even if its source loses the ability in layer 6 (CR 613.6).
      if (pick.offField && layer === "4" && pick.sourceId)
        grants.push({ sourceId: pick.sourceId, controller: chars.get(pick.sourceId)?.controller ?? s.objects[pick.sourceId]!.controller, timestamp: pick.timestamp, mods: modsIn(pick, "4"), chosen: s.objects[pick.sourceId]?.chosen?.type });
    }
    if (layer === "4") building!.grants = grants;
    if (layer === "7c") {
      // Counters apply in 7c (CR 613.4c). Everything in 7c adds up, so order doesn't matter.
      for (const [id, c] of chars) {
        const o = s.objects[id]!;
        const n = (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0);
        if (!n) continue;
        c.power += n;
        c.toughness += n;
        c.pt.push({ source: "counters", kind: "counters", power: n, toughness: n, untilEndOfTurn: false });
      }
    }
  }
  return chars;
}

// ---------------------------------------------------------------------------
// Cache. Computing every permanent at once is needed (effects look at each other), so the
// result is cached per state and thrown away whenever something that matters changes.

const cache = new WeakMap<GameState, { map: CharMap; sig?: string; grants: OffFieldGrant[] }>();
let cacheEnabled = true;

/**
 * Static abilities that count things ("+1/+1 for each card in your hand", Death's Shadow's life
 * total) can change without anything that invalidates the cache happening: a draw, a life change,
 * tapping. When the cached result used such a count, it's only good while these stay the same.
 */
function countSignature(s: GameState): string {
  const parts: string[] = [];
  for (const pid of s.turnOrder) {
    const p = s.players[pid]!;
    // The mana pool too, for "for each unspent green mana you have" (Omnath, Locus of Mana).
    parts.push(`${p.life},${p.hand.length},${p.library.length},${p.graveyard.length},${Object.values(p.manaPool).join(".")}`);
  }
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.tapped || o.attacking !== undefined || o.blocking) parts.push(`${id}${o.tapped ? "t" : ""}${o.attacking !== undefined ? "a" : ""}${o.blocking ? "b" : ""}`);
    // Enchanted, equipped and modified creatures (TargetSpec.status): what's attached to what, and counters.
    if (o.attachedTo) parts.push(`${id}@${o.attachedTo}`);
    const n = Object.values(o.counters).reduce((a, b) => a + (b ?? 0), 0);
    if (n) parts.push(`${id}#${n}`);
  }
  parts.push(`${s.activePlayer}`, `${s.turn}`); // and "this turn" conditions start over each turn
  return parts.join("|");
}

const isCounted = (a: Amount) => typeof a !== "number";
/** Does a static ability count something, or look at something that changes without invalidating the cache? */
function countsSomething(st: StaticAbility): boolean {
  if (st.condition) return true; // "as long as": attacking, tapped lands, the graveyard, whose turn it is
  if (st.affects.kind === "filter" && (st.affects.spec?.combat || st.affects.spec?.tapped !== undefined || st.affects.spec?.status)) return true; // "attacking/untapped/modified creatures you control"
  for (const m of st.mods) {
    if (m.kind === "definePT") return true;
    if ((m.kind === "modifyPT" || m.kind === "setPT") && (isCounted(m.power) || isCounted(m.toughness))) return true;
    if (m.kind === "attackTax" && m.amount !== undefined && isCounted(m.amount)) return true;
  }
  return false;
}

/** Does any static ability on the battlefield count something? */
function usesCounts(s: GameState): boolean {
  return (
    s.battlefield.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some(countsSomething)) ||
    liveEmblems(s).some((o) => compileCard(defOf(s, o)).statics.some(countsSomething)) ||
    s.turnOrder.some((pid) => s.players[pid]!.graveyard.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some((st) => st.zone === "graveyard" && countsSomething(st))))
  );
}

/** Turn the cache off to check that invalidation is complete (tests compare both ways). */
export function setCharacteristicsCache(on: boolean) {
  cacheEnabled = on;
}

/** Call after anything that could change characteristics: zones, counters, effects, attachments. */
export function invalidateCharacteristics(s: GameState) {
  cache.delete(s);
}

export function characteristics(s: GameState, o: GameObject): Characteristics {
  if (o.zone !== "battlefield") return withCounters(o, printed(s, o));
  let hit = cacheEnabled ? cache.get(s) : undefined;
  if (hit?.sig !== undefined && hit.sig !== countSignature(s)) hit = undefined;
  if (!hit || !hit.map.has(o.id)) {
    const counted = { yes: false };
    const grants: OffFieldGrant[] = [];
    hit = { map: computeAll(s, counted, grants), grants };
    if (cacheEnabled) cache.set(s, hit);
    // Looking at the graveyard's cards reads their types, which these grants change.
    const outer = building;
    building = { grants };
    try {
      if (counted.yes || usesCounts(s)) hit.sig = countSignature(s);
    } finally {
      building = outer;
    }
  }
  return hit.map.get(o.id) ?? printed(s, o);
}

/**
 * A card outside the battlefield with counters on it (an effect put them there, CR 122.2): a keyword counter gives it that
 * keyword (CR 122.1b), and +1/+1 and -1/-1 counters change a creature card's power and toughness (CR 122.1a).
 */
function withCounters(o: GameObject, c: Characteristics): Characteristics {
  for (const [kind, n] of Object.entries(o.counters)) {
    const kw = (n ?? 0) > 0 ? keywordOfCounter(kind) : undefined;
    if (kw && !c.keywords.some((k) => sameCI(k, kw))) c.keywords.push(kw);
  }
  const n = (o.counters["+1/+1"] ?? 0) - (o.counters["-1/-1"] ?? 0);
  if (n && c.types.includes("Creature")) {
    c.power += n;
    c.toughness += n;
    c.pt.push({ source: "counters", kind: "counters", power: n, toughness: n, untilEndOfTurn: false });
  }
  return c;
}

// ---------------------------------------------------------------------------
// Type changes outside the battlefield: "Creatures you control are every creature type. The same is true for creature
// spells you control and creature cards you own that aren't on the battlefield" (Maskwood Nexus, Conspiracy, Arcane
// Adaptation). Such a card's or spell's creature types are its card's, changed by these effects in timestamp order
// (CR 613.1d, 613.7); the definition it reads through (defOf) carries them, so every filter on cards and spells sees
// them. Changeling applies first, as a characteristic-defining ability (CR 613.3, Maskwood rulings).

/** A static ability changing creature types outside the battlefield, as it applied in layer 4. */
interface OffFieldGrant {
  sourceId: ObjectId;
  controller: PlayerId;
  timestamp: number;
  mods: Modification[];
  /** The creature type chosen as its source entered. */
  chosen?: string;
}

let building: { grants: OffFieldGrant[] } | undefined;

/** Does anything on the battlefield have such an ability? (Cheap: compiled cards are cached.) */
const offFieldSources = (s: GameState) => s.battlefield.some((id) => compileCard(defOf(s, s.objects[id]!)).statics.some((st) => st.offField));

function offFieldGrants(s: GameState): OffFieldGrant[] {
  if (building) return building.grants;
  const hit = cacheEnabled ? cache.get(s) : undefined;
  if (hit) return hit.grants;
  if (!offFieldSources(s)) return [];
  const first = s.battlefield[0];
  if (first) characteristics(s, s.objects[first]!);
  const after = cache.get(s);
  if (after) return after.grants;
  const grants: OffFieldGrant[] = [];
  computeAll(s, { yes: false }, grants);
  return grants;
}

/** Changeling (CR 702.73a), unless an effect outside the battlefield set the card's creature types. */
export const everyCreatureType = (d: CardDef): boolean => d.everyCreatureType ?? d.keywords.includes("Changeling");

const typedDefs = new Map<string, CardDef>();

/**
 * `d`, the definition of `o` (a card or spell outside the battlefield), with the creature types effects outside the
 * battlefield give it: creature spells its controller controls, creature cards its owner owns (not tokens, which can't
 * stay there, CR 111.7). Anything else is `d` itself.
 */
export function offFieldTyped(s: GameState, o: GameObject, d: CardDef): CardDef {
  // A phased-out permanent and a merged permanent's other cards are still on the battlefield (CR 702.26d, 730.2).
  if (o.zone === "battlefield" || o.zone === "phasedOut" || o.zone === "merged" || !d.types.includes("Creature")) return d;
  const gs = offFieldGrants(s).filter((g) => (o.zone === "stack" ? o.controller === g.controller : o.owner === g.controller && !o.isToken));
  if (!gs.length) return d;
  let subtypes = [...d.subtypes];
  let all = everyCreatureType(d);
  for (const g of [...gs].sort((a, b) => a.timestamp - b.timestamp))
    for (const m of g.mods) {
      if (m.kind === "addTypes") {
        if (m.allCreatureTypes) all = true;
        for (const t of [...m.subtypes, ...(m.chosenType && g.chosen ? [g.chosen] : [])]) if (!subtypes.includes(t)) subtypes.push(t);
      } else if (m.kind === "setSubtypes") {
        const now = m.chosenType ? (g.chosen ? [g.chosen] : []) : m.subtypes;
        if (!now.length) continue;
        subtypes = [...subtypes.filter((t) => subtypeSet(t) !== "Creature"), ...now];
        all = false;
      }
    }
  if (all === everyCreatureType(d) && subtypes.length === d.subtypes.length && subtypes.every((t, i) => t === d.subtypes[i])) return d;
  const key = `${d.oracleId}|${d.name}|${all}|${subtypes.join(",")}`;
  let out = typedDefs.get(key);
  if (!out) typedDefs.set(key, (out = { ...d, subtypes, everyCreatureType: all }));
  return out;
}

/** Who controls this object right now (after control-changing effects). */
export const controllerOf = (s: GameState, o: GameObject): PlayerId => (o.zone === "battlefield" ? characteristics(s, o).controller : o.controller);

/** The combined color identity of `pid`'s commanders (CR 903.4), or undefined if they have none. */
function commandersIdentity(s: GameState, pid: PlayerId | undefined): string[] | undefined {
  if (pid === undefined) return undefined;
  const cmds = Object.values(s.objects).filter((o) => o.isCommander && o.owner === pid);
  return cmds.length ? [...new Set(cmds.flatMap((o) => s.cards[o.cardId]?.colorIdentity ?? []))] : undefined;
}

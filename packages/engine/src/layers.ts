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

import type { Affects, Amount, Modification, StaticAbility, StaticCondition, TargetSpec } from "./abilities";
import { evalAmount, partySize } from "./amounts";
import { bindChosen, objectMatches } from "./effects";
import { basePower, baseToughness, defOf, pairedWith } from "./cards";
import { bindChosenKeywords, subtypeSet } from "./keywords";
import { compileCard } from "./oracle";
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
      return "5";
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
  /** Triggered, activated and mana abilities effects gave it, as text ("~" is this object), in layer 6 order. */
  grantedAbilities: string[];
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
  /** "Can block only creatures with flying" (CR 509.1b). */
  blocksOnlyFlyers: boolean;
  /** "Attacks each combat if able" (CR 508.1d). */
  attacksIfAble: boolean;
  /** Untaps during each other player's untap step too. */
  untapsDuringOthers: boolean;
  /** Generic mana per creature attacking its controller (Ghostly Prison). */
  attackTax: number;
  /** Players it has to attack if able (encore). */
  mustAttack: PlayerId[];
  /** "Can't be blocked by creatures with power 2 or less", "by Walls" (CR 509.1b). */
  cantBeBlockedBy: TargetSpec[];
  /** "Prevent all damage that would be dealt to / by ~" (CR 615.1). */
  preventDamage?: { to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[] }[];
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
  /** The Ring-bearer's (CR 701.54c). */
  cantBeBlockedByGreaterPower: boolean;
  cantAttackAlone: boolean;
  cantBlockAlone: boolean;
  mustBeBlocked: boolean;
  allMustBlock: boolean;
  mustBlock: boolean;
  /** "Can block an additional creature each combat", added up; "can block any number of creatures". */
  extraBlocks: number;
  blockAny: boolean;
}

/**
 * The card's keywords. The card data names some only generically ("Protection", "Toxic");
 * the text says which ("Protection from black", "Toxic 2"), so those come from the text.
 */
export function printedKeywords(d: CardDef): string[] {
  const fromText = compileCard(d).textKeywords;
  if (!fromText.length) return [...d.keywords];
  return [...d.keywords.filter((k) => k !== "Protection" && k !== "Toxic"), ...fromText];
}

/** Characteristics straight from the card, with no effects applied. */
function printed(s: GameState, o: GameObject): Characteristics {
  const d = defOf(s, o);
  return {
    name: d.name,
    supertypes: [...d.supertypes],
    types: [...d.types],
    subtypes: [...d.subtypes],
    allCreatureTypes: d.keywords.includes("Changeling"),
    colors: [...d.colors],
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
    blocksOnlyFlyers: false,
    attacksIfAble: false,
    untapsDuringOthers: false,
    attackTax: 0,
    mustAttack: [],
    cantBeBlockedBy: [],
    cantBlockCreatures: [],
    maxOneBlocker: false,
    minBlockers: 0,
    goadedBy: [],
    cantActivate: false,
    attackUnless: [],
    cantBeBlockedByLesserPower: false,
    cantBeBlockedByGreaterPower: false,
    cantAttackAlone: false,
    cantBlockAlone: false,
    mustBeBlocked: false,
    allMustBlock: false,
    mustBlock: false,
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
  pt: [...c.pt],
  cantBeBlockedBy: [...c.cantBeBlockedBy],
  cantBlockCreatures: [...c.cantBlockCreatures],
  attackUnless: [...c.attackUnless],
  goadedBy: [...c.goadedBy],
  mustAttack: [...c.mustAttack],
});

type CharMap = Map<ObjectId, Characteristics>;

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
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const d = defOf(s, o);
    // An Equipment with reconfigure attached to a creature stops being a creature and loses its creature types until
    // it's unattached (CR 702.151b, rulings), even if it loses its abilities meanwhile. Its timestamp is the attaching's.
    if (o.attachedTo && compileCard(d).reconfigure)
      out.push({ key: `reconfigure:${id}`, timestamp: o.timestamp, order: order++, sourceName: d.name, untilEndOfTurn: false, mods: [{ kind: "loseTypes", types: ["Creature"] }], controller: o.controller, fixed: [id] });
    compileCard(d).statics.forEach((st, i) =>
      out.push({
        key: `${id}#${i}`,
        timestamp: o.timestamp, // CR 613.7a
        order: order++,
        sourceId: id,
        sourceName: d.name,
        untilEndOfTurn: false,
        mods: st.mods,
        affects: st.affects,
        condition: st.condition,
      }),
    );
  }
  return out;
}

const sameCI = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Does a static ability's source still have it? It must be on the battlefield and not have lost its abilities. */
function exists(s: GameState, e: Inst, chars: CharMap): boolean {
  if (!e.affects) return true;
  const src = chars.get(e.sourceId!);
  if (!src || !src.hasPrintedAbilities) return false;
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
function conditionMet(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, chars: CharMap, eventPlayer?: PlayerId, eventAmount?: number): boolean {
  const src = s.objects[sourceId]!;
  const yard = () => s.players[you]?.graveyard.map((id) => defOf(s, s.objects[id]!)) ?? [];
  switch (cond.kind) {
    case "graveyardAtLeast": // threshold
      return (s.players[you]?.graveyard.length ?? 0) >= cond.n;
    case "graveyardTypes": // delirium: card types, not subtypes or supertypes (CR 205.2a)
      return new Set(yard().flatMap((d) => d.types)).size >= cond.n;
    case "graveyardPermanents": // descend
      return yard().filter((d) => d.types.some((t) => PERMANENT_CARD_TYPES.includes(t))).length >= cond.n;
    case "selfCounter": // unleash (CR 702.98a)
      return (src.counters[cond.counter] ?? 0) > 0;
    case "yourTurn":
      return s.activePlayer === you;
    case "beforeAttackers":
      return s.activePlayer === you && ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.step);
    case "monarch":
      return s.monarch === you;
    case "fullParty":
      return partySize(s, you, (o) => chars.get(o.id)) === 4;
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
      return s.players[you]?.attackedTurn === s.turn;
    case "castAnother": // checked before the spell counts itself (CR 601.2f, 601.2i)
      return (s.castThisTurn ?? []).some((c) => c.player === you);
    case "creatureDied":
      return (s.diedThisTurn ?? []).filter((p) => !cond.yours || p === you).length >= (cond.n ?? 1);
    case "onBattlefield": {
      let n = 0;
      for (const [id, c] of chars) if (objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c)) n++;
      return n <= cond.max;
    }
    case "life": {
      const life = s.players[you]?.life ?? 0;
      return (cond.min === undefined || life >= cond.min) && (cond.max === undefined || life <= cond.max);
    }
    case "opponentLostLife":
      return (s.lostLifeThisTurn ?? []).some((p) => p !== you);
    case "drawn": {
      const d = s.players[you]?.draws;
      return d?.turn === s.turn && d.n >= cond.n;
    }
    case "descended":
      return (s.descendedThisTurn ?? []).includes(you);
    case "revolt":
      return (s.permanentLeftThisTurn ?? []).includes(you);
    case "void":
      return !!s.voidThisTurn;
    case "attachedIs": {
      const host = src.attachedTo ? s.objects[src.attachedTo] : undefined;
      const c = host && chars.get(host.id);
      return !!c && objectMatches(s, cond.filter, host, you, false, undefined, c);
    }
    case "opponentPoison":
      return s.turnOrder.some((p) => p !== you && !s.players[p]!.lost && (s.players[p]!.poison ?? 0) >= cond.n);
    case "increment": {
      const c = chars.get(sourceId);
      return !!c && c.types.includes("Creature") && eventAmount !== undefined && (eventAmount > c.power || eventAmount > c.toughness);
    }
    case "citysBlessing":
      return !!s.players[you]?.citysBlessing !== !!cond.not;
    case "self": {
      if (cond.is === "attacking") return src.attacking !== undefined;
      // "~ has hexproof as long as it's untapped" (Paradise Druid): tapping it doesn't change the effects' cache key otherwise.
      if (cond.is === "tapped" || cond.is === "untapped") return src.tapped === (cond.is === "tapped");
      if (cond.is === "devoured") return (src.devoured ?? 0) > 0;
      if (cond.is === "monstrous") return !!src.monstrous; // CR 701.37b
      if (cond.is === "escaped") return !!src.escaped; // CR 702.138b
      if (cond.is === "attachedToCreature") return !!src.attachedTo && !!chars.get(src.attachedTo)?.types.includes("Creature");
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
        for (const [id, c] of chars) {
          if (cond.other && id === sourceId) continue;
          if (c.controller !== who) continue;
          if (objectMatches(s, cond.filter, s.objects[id]!, you, false, undefined, c)) n++;
        }
        return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
      });
    }
  }
}

/** Is an "as long as" or "if" condition true right now, outside of working out characteristics? */
export function staticConditionNow(s: GameState, cond: StaticCondition, sourceId: ObjectId, you: PlayerId, eventPlayer?: PlayerId, eventAmount?: number): boolean {
  const chars: CharMap = new Map(s.battlefield.map((id) => [id, characteristics(s, s.objects[id]!)]));
  return conditionMet(s, cond, sourceId, you, chars, eventPlayer, eventAmount);
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
    if (a.ownedCommanders && !(s.objects[id]!.isCommander && s.objects[id]!.owner === you)) continue;
    if (spec && !objectMatches(s, spec, s.objects[id]!, you, false, undefined, c)) continue;
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
    case "addTypes":
      for (const t of m.types) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.subtypes) if (!c.subtypes.includes(t)) c.subtypes.push(t);
      for (const t of m.supertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      return;
    case "setTypes": {
      // The new card types replace the old, but an instant or sorcery stays one (CR 205.1a). Subtypes of
      // card types it no longer has go too; those of types it keeps stay unless the effect sets that kind.
      const kept = c.types.filter((t) => t === "Instant" || t === "Sorcery");
      c.types = [...m.types, ...kept.filter((t) => !m.types.includes(t))];
      const hasSet = (set: string | null) => set === null || (set === "Spell" ? c.types.includes("Instant") || c.types.includes("Sorcery") : c.types.includes(set));
      c.subtypes = c.subtypes.filter((st) => hasSet(subtypeSet(st)));
      if (!c.types.includes("Creature")) c.allCreatureTypes = false;
      setSubtypes(c, m.subtypes);
      return;
    }
    case "setSubtypes":
      setSubtypes(c, m.subtypes);
      return;
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
    case "addKeywords":
      // "Has protection from the chosen color": the color chosen as the source entered.
      for (const k of bindChosenKeywords(m.keywords, e.sourceId ? s.objects[e.sourceId]?.chosen?.color : undefined)) {
        const key = k.toLowerCase();
        if (!c.keywords.some((x) => sameCI(x, k))) {
          c.keywords.push(k);
          if (m.spares && e.sourceId) (c.sparedBy ??= {})[key] = e.sourceId;
        } else if (c.sparedBy?.[key] !== undefined && !(m.spares && c.sparedBy[key] === e.sourceId)) delete c.sparedBy[key]; // it has it from elsewhere too
      }
      return;
    case "removeKeywords":
      c.keywords = c.keywords.filter((x) => !m.keywords.some((k) => sameCI(x, k)));
      for (const k of m.keywords) if (c.sparedBy) delete c.sparedBy[k.toLowerCase()];
      return;
    case "loseAllAbilities":
      // Abilities granted before this (earlier timestamps) go too; later ones stay (CR 613.7).
      c.keywords = [];
      c.sparedBy = undefined;
      c.hasPrintedAbilities = false;
      c.grantedAbilities = [];
      c.unblockedDamage = false;
      return;
    case "unblockedDamage":
      c.unblockedDamage = true;
      return;
    case "addAbility":
      c.grantedAbilities.push(m.text);
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
    case "untapsDuringOthers":
      c.untapsDuringOthers = true;
      return;
    case "attackTax":
      c.attackTax += m.n;
      return;
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
    case "preventDamage": {
      const { kind: _, ...p } = m;
      c.preventDamage = [...(c.preventDamage ?? []), p];
      return;
    }
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
    case "cantBeBlockedByGreaterPower":
    case "cantAttackAlone":
    case "cantBlockAlone":
    case "mustBeBlocked":
    case "allMustBlock":
    case "mustBlock":
      c[m.kind] = true;
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
const CAN_CREATE_DEPENDENCY = new Set<Modification["kind"]>(["control", "addTypes", "setTypes", "setSubtypes", "setLandTypes", "loseTypes", "setColors", "loseAllAbilities"]);

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

function computeAll(s: GameState): CharMap {
  const chars: CharMap = new Map();
  for (const id of s.battlefield) chars.set(id, printed(s, s.objects[id]!));
  const insts = gather(s).sort((a, b) => a.timestamp - b.timestamp || a.order - b.order);
  for (const layer of LAYERS) {
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
    }
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

const cache = new WeakMap<GameState, { map: CharMap; sig?: string }>();
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
    parts.push(`${p.life},${p.hand.length},${p.library.length},${p.graveyard.length}`);
  }
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.tapped || o.attacking !== undefined || o.blocking) parts.push(`${id}${o.tapped ? "t" : ""}${o.attacking !== undefined ? "a" : ""}${o.blocking ? "b" : ""}`);
  }
  parts.push(`${s.activePlayer}`, `${s.turn}`); // and "this turn" conditions start over each turn
  return parts.join("|");
}

const isCounted = (a: Amount) => typeof a !== "number";
/** Does any static ability on the battlefield count something? */
function usesCounts(s: GameState): boolean {
  for (const id of s.battlefield) {
    for (const st of compileCard(defOf(s, s.objects[id]!)).statics) {
      if (st.condition) return true; // "as long as": attacking, tapped lands, the graveyard, whose turn it is
      if (st.affects.kind === "filter" && st.affects.spec?.combat) return true; // "attacking creatures you control"
      for (const m of st.mods) {
        if (m.kind === "definePT") return true;
        if ((m.kind === "modifyPT" || m.kind === "setPT") && (isCounted(m.power) || isCounted(m.toughness))) return true;
      }
    }
  }
  return false;
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
  if (o.zone !== "battlefield") return printed(s, o);
  let hit = cacheEnabled ? cache.get(s) : undefined;
  if (hit?.sig !== undefined && hit.sig !== countSignature(s)) hit = undefined;
  if (!hit || !hit.map.has(o.id)) {
    hit = { map: computeAll(s), ...(usesCounts(s) ? { sig: countSignature(s) } : {}) };
    if (cacheEnabled) cache.set(s, hit);
  }
  return hit.map.get(o.id) ?? printed(s, o);
}

/** Who controls this object right now (after control-changing effects). */
export const controllerOf = (s: GameState, o: GameObject): PlayerId => (o.zone === "battlefield" ? characteristics(s, o).controller : o.controller);

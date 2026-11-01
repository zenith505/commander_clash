// Working out the numbers effects use (see Amount in abilities.ts): X, "for each ...",
// "equal to the number of ...", "where X is ...".
//
// A resolving spell or ability works its numbers out once, as it does what it says (CR 608.2h);
// a static ability's numbers are worked out again whenever characteristics are (CR 611.3a).

import type { Amount, AmountExpr, Count, ObjRef, PlayerRef, TargetSpec } from "./abilities";
import { ANY_COUNTER } from "./abilities";
import { defOf } from "./cards";
import { compileCard } from "./oracle";
import { bindChosen, objectMatches, printedMatches, ringBearer, spellManaValue, spellPT } from "./effects";
import { characteristics, controllerOf, staticConditionNow, type Characteristics } from "./layers";
import { manaValue, parseManaCost, snowSpent, spentMeets, type ManaSpent } from "./mana";
import { STARTING_LIFE, type Chosen, type Color, type GameObject, type GameState, type LastKnown, type ObjectId, type PlayerId, type TriggerEventInfo } from "./types";
import { defMv, sameName } from "./faces";
import { creatureTypesOf, opponents, shareCreatureType } from "./game";
import { CREATURE_TYPES } from "./keywords";

export interface AmountCtx {
  controller: PlayerId;
  sourceId?: ObjectId;
  /** The source's name: a spell's card's ("cards named ~", Kindle). */
  sourceName?: string;
  /** The source's zoneChanges when the ability was created: "~" means that object only (CR 400.7). */
  sourceZc?: number;
  /** The announced X (CR 107.3a); 0 when there's none (CR 107.3g). */
  x?: number;
  /** A reflexive trigger after "tap any number of untapped creatures you control": how many were tapped. */
  tapped?: number;
  /** A reflexive trigger after a roll: its result ("with total mana value X or less, where X is the result"). */
  rolled?: number;
  /** A reflexive trigger after amassing: the amassed Army's power as its targets are chosen (Grishnákh, Brash Instigator). */
  amassedPower?: number;
  /** The source as it last existed, if it has left the battlefield (CR 608.2h). */
  lki?: LastKnown;
  /** Kicker costs paid for the spell (or the spell its permanent was), CR 702.33d. */
  kicked?: number[];
  /** How many colors of mana were spent to cast the spell (or the spell its permanent was), CR 207.2c. */
  colorsSpent?: number;
  /** The amount of mana spent to cast the spell its permanent was (Marath): 0 if it wasn't cast. */
  manaSpent?: number;
  /** The mana value of the creature returned to cast it using web-slinging, as it last existed (Scarlet Spider). */
  webSlungMv?: number;
  /** The mana spent to cast it by type (adamant, CR 601.2h). */
  spent?: ManaSpent;
  /** How much mana from Treasures was spent to cast the spell (or the spell its permanent was) or activate the ability (CR 106.3). */
  treasureSpent?: number;
  /** What was sacrificed to cast the spell, as it last existed. */
  sacrificed?: LastKnown[];
  /** A station ability's tapped creature (CR 702.184a). */
  stationed?: { id: ObjectId; zc: number; power: number };
  /** The creature type or color chosen ("for each creature of the chosen type"). */
  chosen?: Chosen;
  /** For a triggered ability, what its event was about ("that much"). */
  event?: TriggerEventInfo;
  /** The stack item that triggered it: for a cast trigger, the spell cast. */
  cause?: string;
  /** How the resolving ability finds the objects and players it names. Static abilities only name themselves and "you". */
  objects?: (ref: ObjRef) => GameObject[];
  players?: (ref: PlayerRef) => PlayerId[];
  /**
   * Characteristics to count with. While the layer system is applying effects, it passes the
   * values worked out so far (layers 1-6 are done by the time power and toughness are, CR 613.4).
   */
  view?: (o: GameObject) => Characteristics | undefined;
  /** The permanent a static ability's effect is being applied to ("each creature gets +1/+1 for each other creature ... with it"). */
  affected?: ObjectId;
}

export const isFixed = (a: Amount): a is number => typeof a === "number";

/** The value of `a` right now. */
/** The mana symbols of these colors in a mana cost, a hybrid symbol of two of them counting once (CR 700.5; chroma's rulings). */
export function manaSymbolsOf(cost: string | undefined, colors: readonly Color[]): number {
  let n = 0;
  if (!cost) return 0;
  for (const sym of parseManaCost(cost).symbols) {
    if (sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid") n += colors.includes(sym.color as never) ? 1 : 0;
    else if (sym.kind === "hybrid") n += sym.options.some((x) => colors.includes(x)) ? 1 : 0;
  }
  return n;
}

export function evalAmount(s: GameState, a: Amount, ctx: AmountCtx): number {
  if (typeof a === "number") return a;
  const c = evalCount(s, a.count, ctx);
  // Two to the power of it (Mathemagics); past 1024 the number can't matter, it's more than all the cards in the game.
  const v0 = a.pow2 ? 2 ** Math.min(Math.max(0, c), 10) : Math.floor(c / (a.per ?? 1)) * (a.times ?? 1) + (a.plus ?? 0);
  const v = a.twiceIfX !== undefined && (ctx.x ?? 0) >= a.twiceIfX ? v0 * 2 : v0;
  const n0 = a.signed ? v : Math.max(0, a.half ? (a.third || a.tenth ? ((d) => (a.half === "up" ? Math.ceil(v / d) : Math.floor(v / d)))(a.tenth ? 10 : 3) : halve(v, a.half)) : v);
  const n = a.max !== undefined ? Math.min(n0, a.max) : n0;
  return a.negate ? -n : n;
}

/** Half of `n`, rounded as the text says (CR 107.1a: down unless it says up). */
export function halve(n: number, round: "up" | "down"): number {
  return round === "up" ? Math.ceil(n / 2) : Math.floor(n / 2);
}

function selfObject(s: GameState, ctx: AmountCtx): GameObject | undefined {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return undefined;
  return o;
}

function refObjects(s: GameState, ref: ObjRef, ctx: AmountCtx): GameObject[] {
  if (ctx.objects) return ctx.objects(ref);
  // "Equipped creature's power" in a static ability (Glamdring, Foe-hammer): what the source is attached to.
  const host = ref.ref === "attached" ? selfObject(s, ctx)?.attachedTo : undefined;
  const o = ref.ref === "self" ? selfObject(s, ctx) : ref.ref === "ringBearer" ? ringBearer(s, ctx.controller) : host !== undefined ? s.objects[host] : undefined;
  return o && (ref.ref !== "attached" || o.zone === "battlefield") ? [o] : [];
}

function refPlayers(s: GameState, ref: PlayerRef, ctx: AmountCtx): PlayerId[] {
  if (ctx.players) return ctx.players(ref);
  if (ref.ref === "you") return [ctx.controller];
  if (ref.ref === "eachPlayer") return s.turnOrder.filter((id) => !s.players[id]!.lost);
  if (ref.ref === "eachOpponent") return s.turnOrder.filter((id) => id !== ctx.controller && !s.players[id]!.lost);
  // "Among lands that player controls" in an intervening if (Mask of Intolerance): the trigger's player.
  if (ref.ref === "eventPlayer") return ctx.event?.player !== undefined ? [ctx.event.player] : [];
  // "The chosen player" in a static ability (Sewer Nemesis): the one chosen as the permanent entered; none once that
  // player has left the game (rulings).
  // Elturel Survivors: the player the source is attacking (CR 506.2).
  if (ref.ref === "selfDefending") {
    const p = selfObject(s, ctx)?.attacking;
    return p !== undefined && !s.players[p]!.lost ? [p] : [];
  }
  if (ref.ref === "selfChosenPlayer") {
    const p = selfObject(s, ctx)?.chosen?.player;
    return p !== undefined && !s.players[p]!.lost ? [p] : [];
  }
  return [];
}

function evalCount(s: GameState, c: Count, ctx: AmountCtx): number {
  const view = ctx.view ?? ((o: GameObject) => characteristics(s, o));
  switch (c.kind) {
    case "x":
      return ctx.x ?? 0;
    case "chosenNumber":
      return ctx.chosen?.number ?? 0;
    case "eventAmount":
      return ctx.event?.amount ?? 0;
    case "castShortfall": {
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      return item ? Math.max(0, spellManaValue(s, item) - (ctx.event?.amount ?? 0)) : 0;
    }
    case "eventExcess":
      return ctx.event?.excess ?? 0;
    case "affectedManaValue": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      return o ? manaValue(parseManaCost(defOf(s, o).manaCost)) : 0;
    }
    case "affectedColors": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      return o ? (view(o)?.colors.length ?? 0) : 0;
    }
    case "affectedCounters": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      if (c.counter === ANY_COUNTER) return Object.values(o?.counters ?? {}).reduce((a, b) => a + Math.max(0, b ?? 0), 0);
      return o?.counters[c.counter] ?? 0;
    }
    case "affectedKeywordCount": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      if (!o) return 0;
      const has = characteristics(s, o).keywords.map((k) => k.toLowerCase());
      return c.keywords.filter((k) => {
        const w = k.toLowerCase();
        if (w === "partner") return has.includes("partner") || has.includes("partner with");
        // "Protection from ...", "hexproof from ...": variants of one keyword (CR 702.11d, 702.16).
        return has.some((h) => h === w || ((w === "protection" || w === "hexproof") && h.startsWith(`${w} from`)));
      }).length;
    }
    case "affectedControllerPoison": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      return o ? (s.players[controllerOf(s, o)]?.poison ?? 0) : 0;
    }
    case "affectedControllerHand": {
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      const who = o && view(o)?.controller;
      return who !== undefined ? (s.players[who]?.hand.length ?? 0) : 0;
    }
    case "affectedBushido": {
      // Takeno, Samurai General: "each point of bushido it has": every instance's N, printed (unless it lost its abilities)
      // or granted, as the layers have it so far (CR 702.45).
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      const ch = o && view(o);
      if (!o || !ch) return 0;
      const printed = ch.hasPrintedAbilities ? compileCard(defOf(s, o)).triggers.map((tr) => /^Bushido (\d+):/.exec(tr.body.text)) : [];
      const granted = ch.grantedAbilities.map((g) => /^Bushido (\d+)$/i.exec(g));
      return [...printed, ...granted].reduce((n, x) => n + (x ? Number(x[1]) : 0), 0);
    }
    case "timesAffectedAttacked": {
      // Counted for this object only (CR 400.7), even times before the static ability's source was on the battlefield (rulings on Moraug).
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      return o?.attacked?.turn === s.turn ? o.attacked.n : 0;
    }
    case "permanents": {
      let n = 0;
      const names = new Set<string>();
      // "Named ~" (Hare Apparent): the source's name as it is now (a copy's is what it copies, CR 707.2); in a static
      // ability (Timberpack Wolf), as the layers have it so far.
      const me = c.filter.named === "~" && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const filter = c.filter.named === "~" ? { ...c.filter, named: me?.zone === "battlefield" ? (view(me)?.name ?? defOf(s, me).name) : (ctx.sourceName ?? (me ? defOf(s, me).name : "")) } : bindChosen(c.filter, ctx.chosen);
      const whose = c.whose && refPlayers(s, c.whose, ctx);
      const onPlayers = c.attachedToPlayer && refPlayers(s, c.attachedToPlayer, ctx);
      const attacked = c.attackingWho && refPlayers(s, c.attackingWho, ctx);
      const subject = c.sharesTypeWithSubject ? ctx.objects?.({ ref: "subject" })[0] : undefined;
      if (c.sharesTypeWithSubject && !subject) return 0;
      // The source's creature types now, or as it last existed (CR 608.2h).
      const src = c.sharesTypeWithSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const srcLk = src && src.zone !== "battlefield" ? s.lastKnown?.[src.id]?.creatureTypes : undefined;
      const srcTypes = c.sharesTypeWithSource ? (!src ? new Set<string>() : src.zone === "battlefield" ? creatureTypesOf(s, src) : srcLk === "all" ? "all" : new Set(srcLk ?? [])) : undefined;
      const notThis = c.otherThanSubject ? ctx.objects?.({ ref: "subject" })[0]?.id : c.otherThanTarget !== undefined ? ctx.objects?.({ ref: "target", index: c.otherThanTarget })[0]?.id : undefined;
      const lk = subject && c.includeSubject && subject.zone !== "battlefield" ? s.lastKnown?.[subject.id]?.creatureTypes : undefined;
      const types = subject && (c.includeSubject && subject.zone !== "battlefield" ? (lk === "all" ? "all" : new Set(lk ?? [])) : creatureTypesOf(s, subject));
      // Coat of Arms: the creature types of the permanent it's applied to, and of the others, as the layers have them so far.
      const typesIn = (ch: Characteristics | undefined): Set<string> | "all" => (!ch ? new Set() : ch.allCreatureTypes ? "all" : new Set(ch.subtypes.filter((t) => CREATURE_TYPES.has(t))));
      const byAffected = c.sharesTypeWithAffected || c.sameNameAsAffected;
      const affected = byAffected && ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      if (byAffected && !affected) return 0;
      const affectedTypes = affected && c.sharesTypeWithAffected && typesIn(view(affected));
      // Mirror Box: the name of the permanent it's applied to (copy effects are applied by now, layer 1); a face-down one has none (CR 708.2).
      const affectedName = affected && c.sameNameAsAffected ? (affected.faceDown ? undefined : view(affected)?.name) : undefined;
      if (c.sameNameAsAffected && !affectedName) return 0;
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if ((c.other && id === ctx.sourceId) || id === notThis || (c.otherThanAffected && id === ctx.affected)) continue;
        if (onPlayers && (o.attachedToPlayer === undefined || !onPlayers.includes(o.attachedToPlayer))) continue;
        if (attacked && (o.attacking === undefined || o.attackingPermanent || !attacked.includes(o.attacking))) continue;
        if (subject && ((id === subject.id && !c.includeSubject) || !shareCreatureType(types!, creatureTypesOf(s, o)))) continue;
        if (srcTypes && (id === ctx.sourceId || !shareCreatureType(srcTypes, creatureTypesOf(s, o)))) continue;
        if (affected && (id === affected.id || (affectedTypes && !shareCreatureType(affectedTypes, typesIn(view(o)))))) continue;
        if (affectedName && (o.faceDown || !sameName(view(o)?.name, affectedName))) continue;
        const ch = view(o);
        if (!ch || (whose && !whose.includes(ch.controller)) || !objectMatches(s, filter, o, ctx.controller, false, undefined, ch, ctx.view)) continue;
        if (c.counterKinds) for (const [k, v] of Object.entries(o.counters)) (v ?? 0) > 0 && names.add(k);
        else if (c.counter) n += c.counter === ANY_COUNTER ? Object.values(o.counters).reduce((a, b) => a + (b ?? 0), 0) : (o.counters[c.counter] ?? 0);
        else if (c.differentManaValues) names.add(String(o.faceDown ? 0 : defMv(defOf(s, o))));
        else if (c.differentPowers) names.add(String(ch.power));
        else if (!c.differentNames) n++;
        else if (ch.name && !o.faceDown) names.add(ch.name);
      }
      return c.differentNames || c.differentManaValues || c.differentPowers || c.counterKinds ? names.size : n;
    }
    case "mostSharingCreatureType": {
      // White Lotus Tile: for each creature type, how many creatures you control have it; a changeling has every one
      // (CR 702.73a), so counts for each.
      let all = 0;
      const per = new Map<string, number>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || !ch.types.includes("Creature")) continue;
        if (ch.allCreatureTypes) all++;
        else for (const t of new Set(ch.subtypes.filter((x) => CREATURE_TYPES.has(x)))) per.set(t, (per.get(t) ?? 0) + 1);
      }
      return all + Math.max(0, ...per.values());
    }
    case "greatestControlled": {
      // Each player's own count, the most of them (0 with none); players who have left the game control nothing.
      const per = new Map<PlayerId, number>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (ch && objectMatches(s, c.filter, s.objects[id]!, ctx.controller, false, undefined, ch, ctx.view)) per.set(ch.controller, (per.get(ch.controller) ?? 0) + 1);
      }
      return Math.max(0, ...[...per].filter(([p]) => !s.players[p]!.lost && !(c.opponents && p === ctx.controller)).map(([, n]) => n));
    }
    case "greatestDrawn":
      // Opponents who have left the game too (rulings).
      return Math.max(0, ...s.players.filter((p) => p.id !== ctx.controller).map((p) => (p.draws?.turn === s.turn ? p.draws.n : 0)));
    case "playersAttacked":
      return s.players.filter((p) => !p.lost && s.battlefield.some((id) => s.objects[id]!.attacking === p.id && !s.objects[id]!.attackingPermanent)).length;
    case "drawnThisTurn":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.players[pid]!.draws?.turn === s.turn ? s.players[pid]!.draws!.n : 0), 0);
    case "discardedThisTurn": {
      const who = refPlayers(s, c.who, ctx);
      return (s.turnLog?.discards ?? []).reduce((n, d) => n + (who.includes(d.player) ? d.cards.length : 0), 0);
    }
    case "cardsInHand":
    {
      // "For each card with the chosen name revealed this way" (Thought Hemorrhage): the name chosen as it resolves.
      const f = c.filter && bindChosen(c.filter, ctx.chosen);
      if (c.differentManaValues) return new Set(refPlayers(s, c.who, ctx).flatMap((pid) => s.players[pid]!.hand.map((id) => defMv(defOf(s, s.objects[id]!))))).size;
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (f ? s.players[pid]!.hand.filter((id) => printedMatches(f, defOf(s, s.objects[id]!))).length : s.players[pid]!.hand.length), 0);
    }
    case "cardsInLibrary":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.library.length, 0);
    case "handMoreThanYou": {
      const theirs = refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.hand.length, 0);
      const yours = s.players[ctx.controller]!.hand.length;
      return Math.max(0, c.yoursMinus ? yours - theirs : theirs - yours);
    }
    case "greatestPowerExiled":
      return Math.max(0, ...(s.resolving?.exiledPowers ?? []));
    case "exiledPowerOf": {
      const whose = refPlayers(s, c.who, ctx);
      return (s.resolving?.exiled ?? []).filter(({ ch }) => whose.includes(ch.controller)).reduce((n, { ch }) => n + ch.power, 0);
    }
    case "countersRemovedThisWay":
      return s.resolving?.countersRemoved ?? 0;
    case "linkedExiled": {
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return src ? (s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).length : 0;
    }
    case "linkedExiledPT": {
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!src) return 0;
      return (s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? []).reduce((n, l) => {
        const o = s.objects[l.id];
        if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== l.zc || o.faceDown) return n;
        const ch = characteristics(s, o);
        return ch.types.includes("Creature") ? n + Math.max(0, ch[c.stat]) : n;
      }, 0);
    }
    case "movedLinkedThisWay":
      return s.resolving?.movedLinked ?? 0;
    case "movedThisWayGreatestPower":
      return Math.max(0, ...(s.resolving?.movedLinkedIds ?? []).flatMap((id) => {
        const o = s.objects[id];
        if (!o || o.zone !== "graveyard") return [];
        const c = characteristics(s, o);
        return c.types.includes("Creature") ? [c.power] : [];
      }));
    case "stillExiled":
      return (c.cards ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).length;
    case "eventGroupPower":
      return ctx.event?.groupPower ?? 0;
    case "eventGroupCardTypes": {
      // The cards' own types, as Tarmogoyf's count reads a graveyard (a card that has left counts as it was, CR 608.2h).
      const types = new Set((ctx.event?.group ?? []).flatMap((g) => (s.objects[g.id] ? defOf(s, s.objects[g.id]!).types : [])));
      return types.size;
    }
    case "totalPowerOf":
      return refObjects(s, c.of, ctx).filter((o) => o.zone === "battlefield").reduce((n, o) => n + (view(o)?.power ?? 0), 0);
    case "lifeLostThisWay":
      return c.byLoss ? (s.resolving?.lifeLost ?? 0) : (s.resolving?.exchanged?.lost[ctx.controller] ?? 0);
    case "exchangedLifeDifference": {
      const ps = s.resolving?.exchanged?.players ?? [];
      return ps.length === 2 ? Math.abs(s.players[ps[0]!]!.life - s.players[ps[1]!]!.life) : 0;
    }
    case "votes":
      return (s.resolving?.votes ?? []).filter((v) => v.choice === c.option).length;
    case "choseWord":
      return Object.values(s.resolving?.chose ?? {}).filter((w) => w === c.option).length;
    case "discoveredBelow": {
      const d = s.resolving?.discovered;
      return d && d.mv < c.n ? c.n - d.mv : 0;
    }
    case "destroyedThisWay":
    case "exiledThisWay":
      // As they last existed on the battlefield (CR 608.2h).
      return (s.resolving?.[c.kind === "destroyedThisWay" ? "destroyed" : "exiled"] ?? []).filter((x) => (c.kind !== "destroyedThisWay" || !c.died || ("died" in x && x.died)) && objectMatches(s, c.filter, x.o, ctx.controller, false, undefined, x.ch)).length;
    case "discardedThisWay": {
      if (c.filter) return (s.resolving?.discardedAll ?? []).filter((id) => !!s.objects[id] && printedMatches(c.filter!, defOf(s, s.objects[id]!))).length;
      const counts = c.who ? refPlayers(s, c.who, ctx).map((pid) => s.resolving?.discarded?.[pid] ?? 0) : Object.values(s.resolving?.discarded ?? {});
      return c.greatest ? Math.max(0, ...counts) : counts.reduce((a, b) => a + b, 0);
    }
    // "The discarded card's mana value": a card the effect discarded (Ninja's Blades), else the one a discard cost
    // discarded (Mercurial Chemister, StackItem.costDiscarded), as it last existed in the graveyard.
    case "discardedManaValue": {
      const done = s.resolving?.discardedAll ?? [];
      if (done.length) return done.reduce((n, id) => n + (s.objects[id] ? defMv(defOf(s, s.objects[id]!)) : 0), 0);
      return (s.resolving?.item.costDiscarded ?? []).reduce((n, k) => n + (s.cards[k] ? defMv(s.cards[k]!) : 0), 0);
    }
    case "revealedManaValue": {
      const rv = s.resolving?.revealed;
      const o = rv && s.objects[rv.id];
      if (!o || (o.zoneChanges ?? 0) !== rv.zc) return 0;
      return c.stat ? characteristics(s, o)[c.stat] : defMv(defOf(s, o));
    }
    case "exiledFromHandThisWay":
      return s.resolving?.exiledFromHand ?? 0;
    case "returnedToughness":
      return s.resolving?.returnedToughness ?? 0;
    case "cardsExiledThisWay":
      return (s.resolving?.exiledCards ?? []).filter((id) => s.objects[id]?.zone === "exile" && (!c.filter || printedMatches(c.filter, defOf(s, s.objects[id]!)))).length;
    case "sacrificedThisWayCount":
      return s.resolving?.sacrificedThisWay?.length ?? 0;
    case "spellsCounteredThisWay":
      return s.resolving?.spellsCountered ?? 0;
    case "poisonLostThisWay":
      return s.resolving?.poisonLost ?? 0;
    case "bouncedThisWayCount":
      return (s.resolving?.bouncedThisWay ?? []).filter((b) => b.returned).length;
    case "bouncedThisWayPower":
      return (s.resolving?.bouncedThisWay ?? []).filter((b) => b.returned).reduce((n, b) => n + Math.max(0, b.power ?? 0), 0);
    case "preventedByRule":
      return s.preventedTally?.[c.rule] ?? 0;
    case "sacrificedThisWayGreatestPower":
      return Math.max(0, ...(s.resolving?.sacrificedThisWay ?? []).map((l) => l.power ?? 0));
    case "sacrificedThisWayTotalPower":
      return (s.resolving?.sacrificedThisWay ?? []).reduce((n, l) => n + (l.power ?? 0), 0);
    case "destroyedThisWayTotalPower": {
      const who = refPlayers(s, c.survivorsOf, ctx);
      const left = s.battlefield.map((id) => characteristics(s, s.objects[id]!)).filter((ch) => ch.types.includes("Creature") && who.includes(ch.controller));
      return [...(s.resolving?.destroyed ?? []).map((d) => d.ch), ...left].reduce((n, ch) => n + (ch.types.includes("Creature") ? ch.power : 0), 0);
    }
    case "costSacrificedTotalPower":
      return (ctx.sacrificed ?? []).reduce((n, l) => n + (l.power ?? 0), 0);
    case "putThisWay":
      return (s.resolving?.created ?? []).filter((id) => s.objects[id]?.zone === "battlefield").length;
    case "blockingIt":
      return ctx.objects?.({ ref: c.subject ? "subject" : "self" })[0]?.blockedBy?.length ?? 0;
    case "itBlocks":
      return ctx.objects?.({ ref: "self" })[0]?.blocking?.length ?? 0;
    case "dugToHand":
      return s.resolving?.dugToHand ?? 0;
    case "dugToHandMv":
      return (s.resolving?.dugToHandCards ?? []).reduce((a, id) => a + defMv(defOf(s, s.objects[id]!)), 0);
    case "returnedToYourHand":
      return (s.resolving?.returnedToHand ?? []).filter((id) => s.objects[id]?.zone === "hand" && s.objects[id]!.owner === ctx.controller).length;
    case "milledManaValue":
      return (s.resolving?.milled ?? []).reduce((a, { id }) => a + defMv(defOf(s, s.objects[id]!)), 0);
    case "exiledTopManaValue":
      return (s.resolving?.exiledTopCards ?? []).reduce((a, id) => a + defMv(defOf(s, s.objects[id]!)), 0);
    case "exiledTopMatching": {
      // A chosen color with none chosen: no card matches.
      const f = bindChosen(c.filter, ctx.chosen);
      return f.chosen ? 0 : (s.resolving?.exiledTopCards ?? []).filter((id) => s.objects[id]?.zone === "exile" && printedMatches(f, defOf(s, s.objects[id]!))).length;
    }
    case "revealedFromHand":
    case "bottomedFromHand":
      return s.resolving?.revealedFromHand ?? s.resolving?.item.revealed ?? 0;
    case "tappedThisWay":
      return s.resolving?.tappedThisWay ?? s.resolving?.item.tapped ?? 0;
    case "goadedThisWay":
      return s.resolving?.goadedThisWay ?? 0;
    case "revealedUntilCount":
      return s.resolving?.revealedUntilCount ?? 0;
    case "joinForcesPaid":
      return c.whose ? refPlayers(s, c.whose, ctx).reduce((a, pid) => a + (s.resolving?.joinForcesPaidBy?.[pid] ?? 0), 0) : (s.resolving?.joinForcesPaid ?? 0);
    case "manifestedThisWay":
      return s.resolving?.manifestedThisWay ?? 0;
    case "parleyRevealed":
      return (c.land ? s.resolving?.parley?.land : s.resolving?.parley?.nonland) ?? 0;
    case "damageThisWay":
      return s.resolving?.damageThisWay ?? 0;
    case "excessThisWay":
      if (c.target !== undefined) {
        const t = s.resolving?.item.targets?.[c.target];
        return t?.kind === "object" ? (s.resolving?.excessTo?.[t.id] ?? 0) : 0;
      }
      return s.resolving?.excessDamage ?? 0;
    case "tookFromHand":
      return s.resolving?.tookFromHand ?? 0;
    case "cardsInGraveyard": {
      // "Cards named ~" (Kindle, Accumulated Knowledge): the source's name, a permanent's as it is now (a copy's is what it
      // copies, CR 707.2).
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const own = () => (src?.zone === "battlefield" ? characteristics(s, src).name : (ctx.sourceName ?? (src ? defOf(s, src).name : "")));
      // The Shrines: the cast spell's name (none for a face-down spell: nothing has it).
      const cast = c.sameNameAsCast ? (ctx.cause !== undefined ? s.castItems?.[ctx.cause]?.castName : undefined) : undefined;
      if (c.sameNameAsCast && cast === undefined) return 0;
      const filter0 = c.filter && (c.filter.named === "~" ? { ...c.filter, named: own() } : bindChosen(c.filter, ctx.chosen));
      const filter = cast !== undefined ? { ...(filter0 ?? { kind: "card" as const, text: "card" }), named: cast } : filter0;
      const affected = c.affectedController && ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      const whose = c.affectedController ? (affected ? [view(affected)?.controller ?? controllerOf(s, affected)] : []) : refPlayers(s, c.who, ctx);
      if (c.greatestPower) return Math.max(0, ...whose.flatMap((pid) => s.players[pid]!.graveyard.filter((id) => !filter || printedMatches(filter, defOf(s, s.objects[id]!))).map((id) => characteristics(s, s.objects[id]!).power)));
      if (c.totalMv) return whose.reduce((n, pid) => n + s.players[pid]!.graveyard.filter((id) => !filter || printedMatches(filter, defOf(s, s.objects[id]!))).reduce((k, id) => k + defMv(defOf(s, s.objects[id]!)), 0), 0);
      if (c.greatestMv) return Math.max(0, ...whose.flatMap((pid) => s.players[pid]!.graveyard.filter((id) => !filter || printedMatches(filter, defOf(s, s.objects[id]!))).map((id) => defMv(defOf(s, s.objects[id]!)))));
      // Revivify: only those put there from the battlefield this turn.
      // Risen Executioner: "each other creature card": not the source.
      return whose.reduce((n, pid) => n + s.players[pid]!.graveyard.filter((id) => (!filter || printedMatches(filter, defOf(s, s.objects[id]!))) && (!filter?.fromBattlefieldThisTurn || s.objects[id]!.fromBattlefieldTurn === s.turn) && !(filter?.notSource && id === ctx.sourceId)).length, 0);
    }
    case "life":
      if (c.highest) return Math.max(0, ...refPlayers(s, c.who, ctx).map((pid) => s.players[pid]!.life));
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.life, 0);
    case "eventPlayerLifeAsTurnBegan": {
      const pid = ctx.event?.player;
      return pid === undefined ? 0 : (s.lifeAsTurnBegan?.[pid] ?? s.players[pid]?.life ?? 0);
    }
    case "handAsTurnBegan":
      return s.handAsTurnBegan?.[ctx.controller] ?? 0;
    case "lifeBelowStart":
      return Math.max(0, STARTING_LIFE - (s.players[ctx.controller]?.life ?? STARTING_LIFE)); // CR 103.4: 40 in Commander (CR 903.7)
    case "experience":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.players[pid]!.experience ?? 0), 0);
    case "poison":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.players[pid]!.poison ?? 0), 0);
    case "rad":
      return (c.who ? refPlayers(s, c.who, ctx) : s.players.filter((p) => !p.lost).map((p) => p.id)).reduce((n, pid) => n + (s.players[pid]!.rad ?? 0), 0);
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0; // CR 702.179f
    case "punished":
      return (s.resolving?.scratch?.punished ?? []).filter((p) => !s.players[p]!.lost).length;
    case "stateIf":
      return ctx.sourceId && staticConditionNow(s, c.cond, ctx.sourceId, ctx.controller) ? 1 : 0;
    case "creaturesLeftThisTurn":
      return s.turnLog?.creaturesLeft?.[ctx.controller] ?? 0;
    case "typeToYourGraveyardThisTurn":
      return s.turnLog?.permanentTypesToYard?.[ctx.controller]?.includes(c.type) ? 1 : 0;
    case "artifactsToGraveyardThisTurn":
      return s.turnLog?.artifactsToYard ?? 0;
    case "creaturesToYourGraveyard":
      return (s.turnLog?.creaturesToYard ?? []).filter((d) => d.owner === ctx.controller && !(c.nontoken && d.token)).length;
    case "diedThisTurn":
      if (c.subtype) return (s.diedTypesThisTurn ?? []).filter((d) => (d.all || d.subtypes.includes(c.subtype!)) && (!c.yours || d.controller === ctx.controller)).length;
      // A changeling is every creature type (CR 702.73a), so never "non-Skeleton".
      if (c.notSubtype) return (s.diedTypesThisTurn ?? []).filter((d) => !(d.all || d.subtypes.includes(c.notSubtype!)) && (!c.yours || d.controller === ctx.controller)).length;
      return ((c.nontoken ? s.nontokenDiedThisTurn : s.diedThisTurn) ?? []).filter((p) => !c.yours || p === ctx.controller).length;
    case "plusOnesPutThisTurn":
      return (s.turnLog?.plusOnes ?? [])
        .filter((p) => (!c.byYou || p.by === ctx.controller) && (!c.onYours || p.controller === ctx.controller) && (!c.creature || p.creature) && (!c.self || (p.id === ctx.sourceId && p.zc === (ctx.sourceZc ?? s.objects[p.id]?.zoneChanges ?? 0))))
        .reduce((a, p) => a + p.n, 0);
    case "tokensCreatedThisTurn":
      return (s.turnLog?.tokensCreated ?? []).filter((t) => t.player === ctx.controller && (!c.subtype || t.subtypes.includes(c.subtype))).length;
    case "enteredThisTurn": {
      const sub = c.notSubject ? ctx.objects?.({ ref: "subject" })[0] : undefined;
      return (s.turnLog?.entered ?? []).filter((e) => !(sub && e.id === sub.id && e.zc === (sub.zoneChanges ?? 0)) && e.controller === ctx.controller && (c.types ?? []).every((t) => e.types.includes(t)) && (!c.subtype || !!e.subtypes?.includes(c.subtype)) && (!c.anySubtype || c.anySubtype.some((t) => !!e.subtypes?.includes(t))) && !(c.nontoken && e.token)).length;
    }
    case "sacrificedThisTurn": {
      const sacrificed = (s.turnLog?.sacrificed ?? []).filter((t) => (c.anyPlayer || t.player === ctx.controller) && (!c.subtype || t.subtypes.includes(c.subtype)) && (!c.type || t.types.includes(c.type)) && !(c.nontoken && t.token));
      return c.cardTypes ? new Set(sacrificed.flatMap((t) => t.types)).size : sacrificed.length;
    }
    case "attackersThisTurn":
      return s.attackersThisTurn ?? 0;
    case "youAttackedWithThisTurn": {
      const w = s.players[ctx.controller]?.attackedWith;
      return w?.turn === s.turn ? w.keys.length : 0;
    }
    case "toGraveyardThisTurn":
      return s.toGraveyardThisTurn ?? 0;
    case "sum":
      return c.of.reduce((n, x) => n + evalCount(s, x, ctx), 0);
    case "greater":
      return Math.max(evalCount(s, c.of[0], ctx), evalCount(s, c.of[1], ctx));
    case "constant":
      return c.n;
    case "difference":
      return evalCount(s, c.of[0], ctx) - evalCount(s, c.of[1], ctx);
    case "absDifference":
      return Math.abs(evalCount(s, c.of[0], ctx) - evalCount(s, c.of[1], ctx));
    case "greaterOf":
      return Math.max(evalCount(s, c.of[0], ctx), evalCount(s, c.of[1], ctx));
    case "cardsToGraveyardThisTurn":
      return refPlayers(s, c.whose, ctx).reduce((n, pid) => n + (s.cardsToGraveyardThisTurn?.[pid] ?? 0), 0);
    case "chosenCommanderMv":
      return s.resolving?.commanderMv ?? 0;
    case "commandersMv": {
      const owners = c.who ? refPlayers(s, c.who, ctx) : [ctx.controller];
      return Math.max(0, ...Object.values(s.objects).filter((o) => o.isCommander && owners.includes(o.owner) && (!c.onBattlefieldOrCommand || o.zone === "battlefield" || o.zone === "command")).map((o) => (o.zone === "battlefield" ? (view(o)?.manaValue ?? 0) : defMv(defOf(s, o)))));
    }
    case "commanderCasts":
      return (c.who ? refPlayers(s, c.who, ctx) : [ctx.controller]).reduce((n, pid) => n + Object.values(s.players[pid]?.commanderCasts ?? {}).reduce((a, b) => a + b, 0), 0);
    case "party":
      return partySize(s, ctx.controller, view);
    case "unspentMana": {
      const pool = s.players[ctx.controller]?.manaPool;
      return pool ? (c.color ? pool[c.color] ?? 0 : Object.values(pool).reduce((a, b) => a + b, 0)) : 0;
    }
    case "lifeGainedThisTurn":
      return s.turnLog?.lifeGained?.[ctx.controller] ?? 0;
    case "energyLostThisTurn":
      return s.turnLog?.energyLost?.[ctx.controller] ?? 0;
    case "lifeLostThisTurn":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.turnLog?.lifeLost?.[pid] ?? 0), 0);
    case "opponentsLifeLost":
      return Object.entries(s.turnLog?.lifeLost ?? {}).reduce((n, [p, v]) => (Number(p) !== ctx.controller ? n + v : n), 0);
    case "opponentsDamage":
      return Object.entries(s.damageThisTurn ?? {}).reduce((n, [p, v]) => (Number(p) !== ctx.controller ? n + v : n), 0);
    case "playerDamageThisTurn":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.damageThisTurn?.[pid] ?? 0), 0);
    case "opponentsNoncombatDamage":
      return Object.entries(s.turnLog?.noncombatDamage ?? {}).reduce((n, [p, v]) => (Number(p) !== ctx.controller ? n + v : n), 0);
    case "kicked":
      return (ctx.kicked ?? []).filter((i) => c.which === undefined || i === c.which).length;
    case "wasKicked":
      return (ctx.kicked ?? []).some((i) => c.which === undefined || i === c.which) ? 1 : 0;
    case "spentWas":
      return spentMeets(ctx.spent, c.req) ? 1 : 0;
    case "colorsSpent": {
      if (c.of?.ref === "castSpell") {
        // As it was cast (CR 601.2h), while it's still that spell on the stack.
        const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
        const o = item?.objectId !== undefined ? s.objects[item.objectId] : undefined;
        return o && o.zone === "stack" ? (o.colorsSpent?.length ?? 0) : 0;
      }
      return ctx.colorsSpent ?? 0;
    }
    case "colorsOf": {
      const o = refObjects(s, c.of, ctx)[0];
      if (!o) return 0;
      if (o.zone === "battlefield") return characteristics(s, o).colors.length;
      // It left the battlefield on its last move (destroyed by an earlier part of this effect): as it last existed there.
      const lk = s.lastKnown?.[o.id];
      return lk && lk.zc === (o.zoneChanges ?? 0) - 1 ? (lk.source?.colors.length ?? 0) : characteristics(s, o).colors.length;
    }
    case "castSpellX": {
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      return item?.x ?? 0;
    }
    case "castSpellKicked": {
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      return item?.kicked?.length ?? 0;
    }
    case "castSpellColors": {
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      const o = item?.objectId ? s.objects[item.objectId] : undefined;
      return o?.zone === "stack" ? characteristics(s, o).colors.length : (item?.castColors?.length ?? 0);
    }
    case "castSpellManaSymbols": {
      // Its mana cost as a spell (the half cast, for a split card); it doesn't change if the spell has left the stack.
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      const o = item?.objectId ? s.objects[item.objectId] : undefined;
      return o ? manaSymbolsOf(defOf(s, o).manaCost, [c.color]) : 0;
    }
    case "castSpellCommanderCasts": {
      const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      const o = item?.objectId ? s.objects[item.objectId] : undefined;
      return o ? (s.players[o.owner]?.commanderCasts[o.id] ?? 0) : 0;
    }
    case "manaSpent":
      return ctx.manaSpent ?? 0;
    case "manaSpentOn": {
      const o = refObjects(s, c.of, ctx)[0];
      if (!o) return 0;
      if (o.zone === "stack") return o.manaSpent ?? 0;
      // Countered by this spell earlier (CR 608.2h).
      const countered = s.resolving?.countered?.[o.id];
      return countered?.zc === (o.zoneChanges ?? 0) ? (countered.manaSpent ?? 0) : 0;
    }
    case "webSlungMv":
      return ctx.webSlungMv ?? 0;
    case "treasureSpent":
      return ctx.treasureSpent ?? 0;
    case "rollResult":
      return s.resolving?.rolled?.result ?? s.resolving?.item.rolled ?? ctx.event?.amount ?? 0;
    case "rollOther":
      return s.resolving?.rolled?.other ?? 0;
    case "rollParity":
      return (s.resolving?.rolled?.naturals ?? []).filter((v) => (Math.abs(v) % 2 === 1) === c.odd).length;
    case "rollEquals":
      return (s.resolving?.rolled?.naturals ?? []).filter((v) => v === c.value).length;
    case "countersPutOnThisWay":
      return new Set((s.resolving?.countersPutThisWay ?? []).map((x) => `${x.id}@${x.zc}`)).size;
    case "flipsWon":
      return s.resolving?.flipped?.wins ?? 0;
    case "milledThisWay":
      return (s.resolving?.milled ?? []).filter((m) => !!s.objects[m.id] && (!c.filter || printedMatches(c.filter, defOf(s, s.objects[m.id]!)))).length;
    case "drawnThisWay":
      return (s.resolving?.drawing ? s.resolving.drawnBefore : s.resolving?.drawnThisWay)?.length ?? 0;
    case "drawnRevealedMv":
      return s.resolving?.drawReplaced ? 0 : (s.resolving?.drawnThisWay ?? []).reduce((n, id) => n + (s.objects[id] ? characteristics(s, s.objects[id]!).manaValue : 0), 0);
    case "asCast":
      return s.resolving?.item.asCast ?? evalCount(s, c.of, ctx);
    case "discardedMatching":
      return (s.resolving?.discardedAll ?? []).filter((id) => !!s.objects[id] && printedMatches(c.filter, defOf(s, s.objects[id]!))).length;
    case "discardedTypes":
      return new Set((s.resolving?.discardedAll ?? []).flatMap((id) => (s.objects[id] ? defOf(s, s.objects[id]!).types : []))).size;
    case "snowSpent":
      return snowSpent(ctx.spent);
    case "players":
      if (c.lostGame) return s.players.filter((p) => p.lost && !(c.opponents && p.id === ctx.controller)).length;
      // "Each opponent you attacked [this turn]": players (not planeswalkers or battles) attacked in any combat this turn.
      if (c.attacked) {
        const a = s.players[ctx.controller]?.attackedInTurn;
        return a?.turn === s.turn ? a.players.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller)).length : 0;
      }
      // Gnoll War Band: any damage this turn, by players still in the game (rulings).
      if (c.damaged) return s.players.filter((p) => !p.lost && !(c.opponents && p.id === ctx.controller) && (s.damagedThisTurn ?? []).includes(p.id)).length;
      if (c.combatDamaged) return s.players.filter((p) => !(c.opponents && p.id === ctx.controller) && p.combatDamagedTurn === s.turn).length;
      if (c.lostLife) return s.turnOrder.filter((pid) => !(c.opponents && pid === ctx.controller) && (s.lostLifeThisTurn ?? []).includes(pid)).length;
      // Cut a Deal: each one that drew a card in the draw before, however many it drew (rulings).
      // Aclazotz: an opponent with no card to discard (CR 701.9b) didn't discard one.
      if (c.discardedFewerNonland !== undefined) {
        const nonland = (pid: PlayerId) => (s.resolving?.discardedAll ?? []).filter((id) => s.objects[id]?.owner === pid && !defOf(s, s.objects[id]!).types.includes("Land")).length;
        return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && nonland(pid) < c.discardedFewerNonland!).length;
      }
      if (c.discardedNone) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && !(s.resolving?.discarded?.[pid] ?? 0)).length;
      if (c.drewThisWay) return new Set(((s.resolving?.drawing ? s.resolving.drawnBefore : s.resolving?.drawnThisWay) ?? []).map((id) => s.objects[id]?.owner).filter((pid) => pid !== undefined && !(c.opponents && pid === ctx.controller))).size;
      // Summon: Yojimbo: opponents still in the game who control at least one such permanent now.
      if (c.controlling) {
        const f = c.controlling;
        return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === pid && objectMatches(s, f, s.objects[id]!, ctx.controller, false))).length;
      }
      if (c.fewerCreaturesThanYou || c.moreCreaturesThanYou) {
        const creatures = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Creature")).length;
        return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && (c.moreCreaturesThanYou ? creatures(pid) > creatures(ctx.controller) : creatures(pid) < creatures(ctx.controller))).length;
      }
      if (c.moreLandsThanYou !== undefined) {
        const lands = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;
        return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && lands(pid) >= lands(ctx.controller) + c.moreLandsThanYou!).length;
      }
      if (c.lifeAtMost !== undefined) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.players[pid]!.life <= c.lifeAtMost!).length;
      if (c.lifeLessThanYou) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.players[pid]!.life < (s.players[ctx.controller]?.life ?? 0)).length;
      if (c.handMoreThanYou) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.players[pid]!.hand.length > (s.players[ctx.controller]?.hand.length ?? 0)).length;
      if (c.yardAtLeast !== undefined) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && s.players[pid]!.graveyard.length >= c.yardAtLeast!).length;
      if (c.poisonAtLeast !== undefined) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && (s.players[pid]!.poison ?? 0) >= c.poisonAtLeast!).length;
      if (c.handAtLeast !== undefined) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.players[pid]!.hand.length >= c.handAtLeast!).length;
      if (c.handAtMost !== undefined) return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller) && s.players[pid]!.hand.length <= c.handAtMost!).length;
      // Smuggler's Share: players still in the game, by what they did this turn.
      if (c.drewAtLeast !== undefined || c.landsEnteredAtLeast !== undefined)
        return s.turnOrder.filter((pid) => {
          if (s.players[pid]!.lost || (c.opponents && pid === ctx.controller)) return false;
          const drew = s.players[pid]!.draws?.turn === s.turn ? s.players[pid]!.draws!.n : 0;
          const lands = (s.turnLog?.entered ?? []).filter((e) => e.controller === pid && e.types.includes("Land")).length;
          return (c.drewAtLeast === undefined || drew >= c.drewAtLeast) && (c.landsEnteredAtLeast === undefined || lands >= c.landsEnteredAtLeast);
        }).length;
      return s.turnOrder.filter((pid) => !s.players[pid]!.lost && !(c.opponents && pid === ctx.controller)).length;
    case "opponentsAttacked": {
      const a = s.players[ctx.controller]?.attackedPlayers;
      return a?.turn === s.turn ? a.players.filter((pid) => pid !== ctx.controller).length : 0;
    }
    case "aurasYouControlledAttached":
      return (ctx.lki?.auraControllers ?? []).filter((pid) => pid === ctx.controller).length;
    case "devoured": {
      // "For each creature it devoured" (CR 702.82b): the source, also after it left the battlefield (CR 608.2h).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o) return 0;
      const zc = o.zoneChanges ?? 0;
      const same = ctx.sourceZc === undefined || zc === ctx.sourceZc || (zc === ctx.sourceZc + 1 && o.zone !== "battlefield");
      return same ? (o.devoured ?? 0) : 0;
    }
    case "lifePaidAsEntered": {
      // "The life paid as it entered" (Minion of the Wastes): the source as that permanent, also after it left (CR 608.2h).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o) return 0;
      const zc = o.zoneChanges ?? 0;
      const same = ctx.sourceZc === undefined || zc === ctx.sourceZc || (zc === ctx.sourceZc + 1 && o.zone !== "battlefield");
      return same ? (o.lifePaidAsEntered ?? 0) : 0;
    }
    case "mutations": {
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o) return 0;
      const zc = o.zoneChanges ?? 0;
      const same = ctx.sourceZc === undefined || zc === ctx.sourceZc || (zc === ctx.sourceZc + 1 && o.zone !== "battlefield");
      return same ? (o.mutations ?? 0) : 0;
    }
    case "stationPower": {
      // Its power as the ability resolves, or as it last existed; negative power puts on no counters (rulings).
      const st = ctx.stationed;
      const o = st && s.objects[st.id];
      if (!st) return 0;
      if (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === st.zc) return Math.max(0, characteristics(s, o).power);
      // As it last existed on the battlefield (CR 608.2h), if that's recorded; else as it was tapped.
      const lk = s.lastKnown?.[st.id];
      return Math.max(0, lk && lk.zc === st.zc ? lk.power : st.power);
    }
    case "damageDealtToThisTurn": {
      // Whipkeeper: dealt to that object this turn, regenerated or not; prevented damage wasn't dealt (rulings).
      const o = refObjects(s, c.of, ctx)[0];
      return o ? (s.turnLog?.damageDealtTo?.[`${o.id}@${o.zoneChanges ?? 0}`] ?? []).reduce((n, d) => n + (d.amount ?? 0), 0) : 0;
    }
    case "power":
    case "toughness":
    case "manaValue": {
      // "That spell's mana value" in a cast trigger: as it was cast, X included (CR 202.3e), even if it has left the stack.
      if (c.of.ref === "castSpell") {
        const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
        if (!item) return 0;
        // "That spell's power" (Eshki, Temur's Roar): as it is on the stack, or as it last existed there (CR 608.2h).
        return c.kind === "manaValue" ? spellManaValue(s, item) : (spellPT(s, item, c.kind) ?? 0);
      }
      // Not sacrificed for a cost: what the ability sacrificed as it resolved ("You may sacrifice another creature. If you do,
      // ... that creature's power", Disciple of Freyalise).
      if (c.of.ref === "sacrificed") return Math.max(0, (ctx.sacrificed?.[0] ?? s.resolving?.sacrificedThisWay?.at(-1))?.[c.kind] ?? 0);
      const o = refObjects(s, c.of, ctx)[0];
      if (!o) {
        // Gone: as it last existed on the battlefield (CR 608.2h).
        // A trigger's subject that died ("whenever another creature dies, ... its power") too.
        // "Return it to its owner's hand. If you do, create ... equal to its toughness" (Riders of the Mark, rulings): this
        // ability moved it, so as it last existed on the battlefield.
        const left = c.of.ref === "self" && !ctx.lki && ctx.sourceId !== undefined && ctx.sourceZc !== undefined ? s.lastKnown?.[ctx.sourceId] : undefined;
        if (left && left.zc === ctx.sourceZc && c.kind !== "manaValue") return Math.max(0, left[c.kind]);
        if ((c.of.ref === "self" || c.of.ref === "subject") && c.kind !== "manaValue") return Math.max(0, ctx.lki?.[c.kind] ?? 0);
        // The amassed Army that has left: as it last existed (CR 608.2h).
        const a = c.of.ref === "amassed" ? (s.resolving?.amassed ?? s.resolving?.item.amassed) : undefined;
        const lk = a && s.lastKnown?.[a.id];
        if (lk && lk.zc === a.zc && c.kind !== "manaValue") return Math.max(0, lk[c.kind] ?? 0);
        return 0;
      }
      if (c.kind === "manaValue") {
        // It left the battlefield on its last move (Ruinous Intrusion's "the permanent exiled this way"): as it last
        // existed there, a copy's copied mana cost (CR 608.2h, 707.2).
        const lk = o.zone !== "battlefield" && o.zone !== "stack" ? s.lastKnown?.[o.id] : undefined;
        const was = lk && lk.zc === (o.zoneChanges ?? 0) - 1 && lk.copyKey ? s.cards[lk.copyKey] : undefined;
        if (was) return manaValue(parseManaCost(was.manaCost));
        // On the stack, X is the value chosen for it (CR 202.3e).
        const cost = parseManaCost(defOf(s, o).manaCost);
        const item = o.zone === "stack" ? (s.stack.find((x) => x.objectId === o.id) ?? (s.resolving?.item.objectId === o.id ? s.resolving.item : undefined)) : undefined;
        // Countered by this spell or ability earlier: as it last existed on the stack.
        const countered = s.resolving?.countered?.[o.id];
        const x = item?.x ?? (countered?.zc === (o.zoneChanges ?? 0) ? countered.x : 0);
        return manaValue(cost) + x * cost.symbols.filter((x) => x.kind === "x").length;
      }
      if (o.zone !== "battlefield") {
        // It left the battlefield on its last move (destroyed by an earlier part of this effect): as it last existed there.
        const lk = s.lastKnown?.[o.id];
        if (lk && lk.zc === (o.zoneChanges ?? 0) - 1) return lk[c.kind];
      }
      const ch = o.zone === "battlefield" ? view(o) : characteristics(s, o);
      return ch?.[c.kind] ?? 0;
    }
    case "counters": {
      // "For each counter on ~" (Twitching Doll): of every kind.
      const of = (counters: Record<string, number> | undefined) => (c.counter === ANY_COUNTER ? Object.values(counters ?? {}).reduce((a, b) => a + Math.max(0, b ?? 0), 0) : (counters?.[c.counter] ?? 0));
      const o = refObjects(s, c.of, ctx)[0];
      if (o?.zone === "battlefield") return of(o.counters);
      // Parting Thoughts: "the number of counters on that creature" after an earlier part of this effect moved the target
      // permanent: as it last existed on the battlefield (CR 608.2h).
      const t = c.of.ref === "target" ? s.resolving?.item.targets?.[c.of.index] : undefined;
      const tzc = t?.kind === "object" ? t.zc : undefined;
      const tlk = o && tzc !== undefined && (o.zoneChanges ?? 0) === tzc + 1 ? s.lastKnown?.[o.id] : undefined;
      if (tlk && tlk.zc === tzc) return of(tlk.counters);
      // "For each blight counter on it" after it left: as it last existed on the battlefield (CR 608.2h).
      // Not when the ability carries its own (a dies trigger's), only other last known information (a cast spell's copy key).
      const lk = c.of.ref === "self" && !ctx.lki?.counters && ctx.sourceId && ctx.sourceZc !== undefined ? s.lastKnown?.[ctx.sourceId] : undefined;
      if (lk && lk.zc === ctx.sourceZc) return of(lk.counters);
      return c.of.ref === "self" || c.of.ref === "subject" ? of(ctx.lki?.counters) : 0;
    }
    case "devotion": {
      // Each mana symbol of that color among the mana costs of permanents you control; a hybrid
      // symbol of two of the colors counts once (CR 700.5).
      let n = 0;
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if (view(o)?.controller !== ctx.controller) continue;
        n += manaSymbolsOf(defOf(s, o).manaCost, c.colors);
        // Altar of the Pantheon: one more for each color or combination of colors (CR 700.5), even if it has lost its
        // abilities (rulings: the effect applies before any that would remove them), so from the card itself.
        n += compileCard(defOf(s, o)).devotionBonus ?? 0;
      }
      return n;
    }
    case "manaSymbols": {
      // Chroma: only mana costs count, not symbols in rules text (rulings).
      const r = s.resolving;
      const ids: ObjectId[] =
        c.in === "graveyard" ? (s.players[ctx.controller]?.graveyard ?? []) : c.in === "affected" ? (ctx.affected !== undefined ? [ctx.affected] : []) : c.in === "revealedFromHand" ? (r?.revealedFromHandIds ?? []) : c.in === "revealed" ? (r?.revealedUntil ?? []) : [];
      let n = ids.reduce((t, id) => t + (s.objects[id] ? manaSymbolsOf(defOf(s, s.objects[id]!).manaCost, [c.color]) : 0), 0);
      // What was sacrificed, as it last existed (CR 608.2h): a token that isn't a copy has no mana cost.
      if (c.of?.ref === "sacrificed") {
        const key = (ctx.sacrificed?.[0] ?? r?.sacrificedThisWay?.at(-1))?.copyKey;
        n += key && s.cards[key] ? manaSymbolsOf(s.cards[key]!.manaCost, [c.color]) : 0;
      }
      return n;
    }
    case "attachedToSelf": {
      const me = selfObject(s, ctx);
      if (!me) return 0;
      return s.battlefield.filter((id) => {
        const o = s.objects[id]!;
        return o.attachedTo === me.id && (view(o)?.subtypes ?? []).some((st) => c.subtypes.includes(st));
      }).length;
    }
    case "attachedToAffected": {
      const me = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      if (!me) return 0;
      return s.battlefield.filter((id) => {
        const o = s.objects[id]!;
        return o.attachedTo === me.id && (view(o)?.subtypes ?? []).some((st) => c.subtypes.includes(st));
      }).length;
    }
    case "attachedToHost": {
      const host = selfObject(s, ctx)?.attachedTo;
      if (!host || !s.battlefield.includes(host)) return 0;
      return s.battlefield.filter((id) => {
        const o = s.objects[id]!;
        return o.attachedTo === host && (view(o)?.subtypes ?? []).some((st) => c.subtypes.includes(st));
      }).length;
    }
    case "graveyardCardTypes": {
      const types = new Set<string>();
      for (const pid of refPlayers(s, c.who, ctx)) for (const id of s.players[pid]!.graveyard) for (const t of defOf(s, s.objects[id]!).types) if (!c.permanent || ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"].includes(t)) types.add(t);
      return types.size;
    }
    case "graveyardManaValues": {
      const mvs = new Set<number>();
      for (const pid of refPlayers(s, c.who, ctx)) for (const id of s.players[pid]!.graveyard) if (!c.filter || printedMatches(c.filter, defOf(s, s.objects[id]!))) mvs.add(defMv(defOf(s, s.objects[id]!)));
      return mvs.size;
    }
    case "greatestPower": {
      // 0 with none, or with only negative values (rulings on Inscription of Abundance: no life gained or lost).
      let best = 0;
      let least: number | undefined;
      const filter = bindChosen(c.filter, ctx.chosen);
      const whose = c.whose && refPlayers(s, c.whose, ctx);
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if (c.other && id === ctx.sourceId) continue;
        if (c.inEventGroup && !(ctx.event?.group ?? []).some((g) => g.id === id && g.zc === (o.zoneChanges ?? 0))) continue;
        const ch = view(o);
        if (ch && (!whose || whose.includes(ch.controller)) && objectMatches(s, filter, o, ctx.controller, false, undefined, ch, ctx.view)) {
          const n = c.toughness ? ch.toughness : ch.power;
          best = c.total ? best + n : Math.max(best, n);
          least = Math.min(least ?? n, n);
        }
      }
      // Those of the event's group that have left the battlefield count as they last existed (Witch-king's rulings).
      if (c.total && c.inEventGroup)
        for (const g of ctx.event?.group ?? []) {
          const o = s.objects[g.id];
          const lk = s.lastKnown?.[g.id];
          if (o && (o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== g.zc) && lk?.zc === g.zc) best += (c.toughness ? lk.toughness : lk.power) ?? 0;
        }
      return c.least ? (least ?? 0) : best;
    }
    case "cardsInExile": {
      if (!c.who) return s.turnOrder.reduce((n, pid) => n + s.players[pid]!.exile.length, 0);
      // "Named ~" (Slime Against Humanity): the source's name.
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const named = (f: TargetSpec): TargetSpec => (f.named === "~" ? { ...f, named: ctx.sourceName ?? (src ? defOf(s, src).name : "") } : f);
      const filter = c.filter && { ...named(c.filter), ...(c.filter.anyOf ? { anyOf: c.filter.anyOf.map(named) } : {}) };
      // With no filter (Dreadlight Monstrosity: "if you own a card in exile"), any card, face down or not.
      const fits = (id: ObjectId) => !filter || (!s.objects[id]!.faceDown && printedMatches(filter, defOf(s, s.objects[id]!)));
      const marked = (id: ObjectId) => !c.counter || (s.objects[id]!.counters[c.counter] ?? 0) > 0;
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.exile.filter((id) => s.objects[id]!.owner === pid && fits(id) && marked(id)).length + (c.graveyardToo ? s.players[pid]!.graveyard.filter(fits).length : 0), 0);
    }
    case "greatestMvInExile":
      return Math.max(0, ...s.turnOrder.flatMap((pid) => s.players[pid]!.exile.map((id) => (s.objects[id]!.faceDown ? 0 : defMv(defOf(s, s.objects[id]!))))));
    case "greatestManaValue": {
      // From its mana cost (copy and face-down values included, CR 202.3, 708.2); X is 0 on the battlefield (CR 107.3).
      let best = 0;
      let least: number | undefined;
      for (const id of s.battlefield) {
        if (c.other && id === ctx.sourceId) continue;
        const o = s.objects[id]!;
        const ch = view(o);
        if (ch && objectMatches(s, c.filter, o, ctx.controller, false, undefined, ch, ctx.view)) {
          best = c.total ? best + defMv(defOf(s, o)) : Math.max(best, defMv(defOf(s, o)));
          least = Math.min(least ?? Infinity, defMv(defOf(s, o)));
        }
      }
      // "The lowest mana value" (Culling Scales): the least among them, 0 with none.
      if (c.least) return least ?? 0;
      return best;
    }
    case "spellsCastThisTurn": {
      // "Other": the resolving spell's own cast is its castNth'th; a copy wasn't cast (CR 707.10).
      const self = c.other && s.resolving?.item.kind === "spell" ? s.resolving.item.castNth : c.notSource && ctx.sourceId ? s.objects[ctx.sourceId]?.castNth : undefined;
      const cast = (s.castThisTurn ?? []).filter((x, i) => i !== self && (c.anyone || (c.opponents ? opponents(s, ctx.controller).includes(x.player) : x.player === (c.eventPlayer ? ctx.event?.player : ctx.controller))) && !(c.notFromHand && x.from === "hand") && (!c.filter || (!!s.cards[x.card] && printedMatches(c.filter, s.cards[x.card]!))));
      if (c.cardTypes) return new Set(cast.flatMap((x) => x.types ?? s.cards[x.card]?.types ?? [])).size;
      const n = cast.length;
      return c.beyondFirst ? Math.max(0, n - 1) : n;
    }
    case "manaValueCastThisTurn": {
      // The resolving spell's own cast is its castNth'th; a copy wasn't cast, so it has none (CR 707.10).
      const self = c.other && s.resolving?.item.kind === "spell" ? s.resolving.item.castNth : undefined;
      const mvs = (s.castThisTurn ?? []).flatMap((x, i) => (x.player === ctx.controller && i !== self && (!c.filter || (!!s.cards[x.card] && printedMatches(c.filter, s.cards[x.card]!))) ? [x.mv ?? 0] : []));
      return c.greatest ? Math.max(0, ...mvs) : mvs.reduce((n, v) => n + v, 0);
    }
    case "colorsAmongPermanents": {
      const colors = new Set<string>();
      for (const id of s.battlefield) {
        if (c.other && id === ctx.sourceId) continue;
        const ch = view(s.objects[id]!);
        if (ch && ch.controller === ctx.controller && (!c.filter || objectMatches(s, c.filter, s.objects[id]!, ctx.controller, false, undefined, ch, ctx.view))) for (const col of ch.colors) colors.add(col);
      }
      return colors.size;
    }
    case "cardTypesAmongPermanents": {
      const types = new Set<string>();
      for (const id of s.battlefield) {
        if (c.other && id === ctx.sourceId) continue;
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || (c.nonland && ch.types.includes("Land"))) continue;
        for (const t of ch.types) types.add(t);
      }
      return types.size;
    }
    case "creatureTypesAmong": {
      const types = new Set<string>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || !ch.types.includes("Creature")) continue;
        if (ch.allCreatureTypes) return CREATURE_TYPES.size;
        for (const t of ch.subtypes) if (CREATURE_TYPES.has(t)) types.add(t);
      }
      return types.size;
    }
    case "planeswalkerTypesAmong": {
      // A planeswalker's subtypes are planeswalker types (CR 205.3j), but one that's also a creature has creature types too.
      const types = new Set<string>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || !ch.types.includes("Planeswalker")) continue;
        for (const t of ch.subtypes) if (!CREATURE_TYPES.has(t)) types.add(t);
      }
      return types.size;
    }
    case "keywordsAmong": {
      const found = new Set<string>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || !ch.types.includes("Creature")) continue;
        for (const k of c.keywords) if (ch.keywords.some((x) => x.toLowerCase() === k.toLowerCase() || (k === "Hexproof" && /^hexproof from /i.test(x)))) found.add(k);
      }
      return found.size;
    }
    case "basicLandTypes": {
      const types = new Set<string>();
      const whose = c.whose ? refPlayers(s, c.whose, ctx) : [ctx.controller];
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || !whose.includes(ch.controller) || !ch.types.includes("Land")) continue;
        for (const st of ch.subtypes) if (["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(st)) types.add(st);
      }
      return types.size;
    }
  }
}

export const PARTY_TYPES = ["Cleric", "Rogue", "Warrior", "Wizard"] as const;

/**
 * The number of creatures in a player's party (CR 700.8): up to one each of Cleric, Rogue, Warrior and Wizard among
 * creatures they control, each creature counted once, the largest such number (rulings: a Cleric and a Cleric Wizard
 * make two). Changelings have every creature type (CR 702.73a).
 */
export function partySize(s: GameState, pid: PlayerId, view: (o: GameObject) => Characteristics | undefined = (o) => characteristics(s, o)): number {
  const roles: number[][] = []; // for each creature, the party types it could fill
  for (const id of s.battlefield) {
    const c = view(s.objects[id]!);
    if (!c || c.controller !== pid || !c.types.includes("Creature")) continue;
    const r = PARTY_TYPES.flatMap((t, i) => (c.allCreatureTypes || c.subtypes.includes(t) ? [i] : []));
    if (r.length) roles.push(r);
  }
  // Largest matching of creatures to the four types, by augmenting paths.
  const filledBy: (number | undefined)[] = [];
  const place = (k: number, seen: Set<number>): boolean => {
    for (const t of roles[k]!) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (filledBy[t] === undefined || place(filledBy[t]!, seen)) {
        filledBy[t] = k;
        return true;
      }
    }
    return false;
  };
  let n = 0;
  for (let k = 0; k < roles.length && n < 4; k++) if (place(k, new Set())) n++;
  return n;
}

/** For display: "X", "the number of creatures you control", "2". */
export function describeAmount(a: Amount): string {
  if (typeof a === "number") return String(a);
  const base = a.pow2 ? `2^${describeCount(a.count)}` : a.per ? `${describeCount(a.count)} / ${a.per}, rounded down` : describeCount(a.count);
  const t = a.times ?? 1;
  const times = t === 1 ? base : t === -1 ? `-${base}` : `${t} × ${base}`;
  const v0 = a.plus ? `${times} ${a.plus > 0 ? "+" : "-"} ${Math.abs(a.plus)}` : times;
  const v1 = a.half ? `${a.third ? "a third of" : a.tenth ? "a tenth of" : "half"} ${v0}, rounded ${a.half}` : v0;
  const v = a.twiceIfX !== undefined ? `${v1} (twice that if X is ${a.twiceIfX} or more)` : v1;
  return a.negate ? `-(${v})` : v;
}

function describeCount(c: Count): string {
  switch (c.kind) {
    case "x":
      return "X";
    case "chosenNumber":
      return "the chosen number";
    case "permanents":
      return `#${c.counter ? `${c.counter === ANY_COUNTER ? "" : `${c.counter} `}counters on ` : ""}${c.counterKinds ? "kinds of counters among " : ""}${c.differentNames ? "differently named " : ""}${c.other || c.otherThanAffected ? "other " : ""}${c.filter.text.replace(/^target /, "")}${c.differentManaValues ? " (different mana values)" : ""}${c.differentPowers ? " (different powers)" : ""}`;
    case "cardsInHand":
      return "#cards in hand";
    case "handMoreThanYou":
      return c.yoursMinus ? "#cards in your hand minus theirs" : "#cards in their hand minus yours";
    case "affectedBushido":
      return "#points of bushido it has";
    case "timesAffectedAttacked":
      return "#times it attacked this turn";
    case "affectedKeywordCount":
      return `#of ${c.keywords.join(", ")} it has`;
    case "affectedCounters":
      return `#${c.counter} counters on it`;
    case "affectedManaValue":
      return "its mana value";
    case "affectedColors":
      return "#its colors";
    case "affectedControllerHand":
      return "cards in its controller's hand";
    case "affectedControllerPoison":
      return "#poison counters its controller has";
    case "cardsInLibrary":
      return "#cards in library";
    case "discardedThisWay":
      return c.greatest ? "the most cards discarded" : "#cards discarded";
    case "discardedManaValue":
      return "the discarded card's mana value";
    case "revealedManaValue":
      return `the revealed card's ${c.stat ?? "mana value"}`;
    case "exiledFromHandThisWay":
      return "#cards exiled from hand";
    case "returnedToughness":
      return "its toughness";
    case "cardsExiledThisWay":
      return `#${c.filter ? `${c.filter.text}s` : "cards"} exiled`;
    case "sacrificedThisWayCount":
      return "#sacrificed";
    case "spellsCounteredThisWay":
      return "#spells countered";
    case "poisonLostThisWay":
      return "#poison counters lost";
    case "bouncedThisWayCount":
      return "#returned";
    case "bouncedThisWayPower":
      return "the returned creature's power";
    case "preventedByRule":
      return "#damage prevented";
    case "sacrificedThisWayGreatestPower":
      return "the greatest power sacrificed";
    case "sacrificedThisWayTotalPower":
    case "costSacrificedTotalPower":
      return "the total power sacrificed";
    case "destroyedThisWayTotalPower":
      return "the total power of those creatures";
    case "putThisWay":
      return "#put onto the battlefield";
    case "blockingIt":
      return "#creatures blocking it";
    case "itBlocks":
      return "#creatures it's blocking";
    case "dugToHand":
      return "#cards put into your hand";
    case "dugToHandMv":
      return "that card's mana value";
    case "returnedToYourHand":
      return "#cards returned to your hand";
    case "milledManaValue":
      return "the total mana value of the milled cards";
    case "exiledTopMatching":
      return `#${c.filter.text}s exiled`;
    case "exiledTopManaValue":
      return "the total mana value of the exiled cards";
    case "revealedFromHand":
      return "#cards revealed";
    case "bottomedFromHand":
      return "#cards put on the bottom";
    case "tookFromHand":
      return "#cards chosen";
    case "tappedThisWay":
      return "#tapped";
    case "goadedThisWay":
      return "#goaded";
    case "joinForcesPaid":
      return c.whose ? "#mana they paid" : "#mana paid";
    case "manifestedThisWay":
      return "#cards manifested";
    case "parleyRevealed":
      return c.land ? "#land cards revealed" : "#nonland cards revealed";
    case "damageThisWay":
      return "the damage dealt";
    case "excessThisWay":
      return "the excess damage";
    case "greatestPowerExiled":
      return "the greatest power among creature cards exiled";
    case "exiledPowerOf":
      return "the power of the creature they exiled";
    case "countersRemovedThisWay":
      return "#counters removed";
    case "linkedExiled":
      return "#cards exiled with it";
    case "linkedExiledPT":
      return `the exiled creature card's ${c.stat}`;
    case "movedLinkedThisWay":
      return "#cards put into graveyards";
    case "movedThisWayGreatestPower":
      return "the greatest power among creature cards put into your graveyard";
    case "stillExiled":
      return "#those cards still exiled";
    case "eventGroupPower":
      return "the total power of those creatures";
    case "eventGroupCardTypes":
      return "#card types among those cards";
    case "totalPowerOf":
      return "the total power of those creatures";
    case "lifeLostThisWay":
      return c.byLoss ? "the life lost this way" : "the life you lost";
    case "exchangedLifeDifference":
      return "the difference between their life totals";
    case "votes":
      return `#${c.option} votes`;
    case "choseWord":
      return `#players who chose ${c.option}`;
    case "discoveredBelow":
      return `${c.n} minus the discovered card's mana value`;
    case "destroyedThisWay":
      return `#${c.filter.text} ${c.died ? "that died" : "destroyed"}`;
    case "exiledThisWay":
      return `#${c.filter.text} exiled`;
    case "cardsInGraveyard":
      if (c.greatestPower) return `the greatest power among ${c.filter ? c.filter.text.replace(/^target /, "") : "card"}s in graveyard`;
      if (c.greatestMv) return "the greatest mana value among cards in graveyard";
      if (c.sameNameAsCast) return "#cards with that spell's name in all graveyards";
      return `#${c.filter ? c.filter.text.replace(/^target /, "") : "cards"} in graveyard`;
    case "life":
      return "life";
    case "handAsTurnBegan":
      return "cards in hand as the turn began";
    case "lifeBelowStart":
      return "life below starting";
    case "experience":
      return "experience counters";
    case "poison":
      return "poison counters";
    case "rad":
      return "rad counters";
    case "speed":
      return "speed";
    case "punished":
      return "#players punished";
    case "stateIf":
      return "1 if the condition holds";
    case "players":
      return `#${c.opponents ? "opponents" : "players"}${c.lostGame ? " who have lost the game" : ""}${c.attacked ? " you attacked this turn" : ""}${c.combatDamaged ? " dealt combat damage this turn" : ""}${c.damaged ? " dealt damage this turn" : ""}${c.lostLife ? " who lost life this turn" : ""}${c.drewThisWay ? " who drew a card this way" : ""}${c.discardedNone ? " who couldn't discard" : ""}${c.discardedFewerNonland ? ` who didn't discard ${c.discardedFewerNonland} nonland cards` : ""}${c.drewAtLeast ? ` who drew ${c.drewAtLeast}+ cards this turn` : ""}${c.landsEnteredAtLeast ? ` who had ${c.landsEnteredAtLeast}+ lands enter this turn` : ""}${c.controlling ? ` who control a ${c.controlling.text}` : ""}${c.handAtMost !== undefined ? ` with ${c.handAtMost} or fewer cards in hand` : ""}${c.handAtLeast !== undefined ? ` with ${c.handAtLeast} or more cards in hand` : ""}${c.poisonAtLeast !== undefined ? ` with ${c.poisonAtLeast}+ poison counters` : ""}${c.yardAtLeast !== undefined ? ` with ${c.yardAtLeast}+ cards in their graveyard` : ""}${c.handMoreThanYou ? " with more cards in hand than you" : ""}${c.lifeLessThanYou ? " with less life than you" : ""}${c.lifeAtMost !== undefined ? ` with ${c.lifeAtMost} or less life` : ""}${c.fewerCreaturesThanYou ? " with fewer creatures than you" : ""}${c.moreCreaturesThanYou ? " with more creatures than you" : ""}${c.moreLandsThanYou !== undefined ? ` with ${c.moreLandsThanYou}+ more lands than you` : ""}`;
    case "creaturesLeftThisTurn":
      return "#creatures that left the battlefield under your control this turn";
    case "typeToYourGraveyardThisTurn":
      return `an ${c.type.toLowerCase()} put into your graveyard from the battlefield this turn`;
    case "artifactsToGraveyardThisTurn":
      return "#artifacts put into graveyards from the battlefield this turn";
    case "creaturesToYourGraveyard":
      return `#${c.nontoken ? "nontoken " : ""}creatures put into your graveyard from the battlefield this turn`;
    case "diedThisTurn":
      return `#${c.nontoken ? "nontoken " : ""}${c.notSubtype ? `non-${c.notSubtype} creature` : (c.subtype ?? "creature")}s that died${c.yours ? " under your control" : ""} this turn`;
    case "plusOnesPutThisTurn":
      return `#+1/+1 counters ${c.byYou ? "you've " : ""}put on ${c.self ? "~" : `${c.onYours ? "your " : ""}${c.creature ? "creatures" : "permanents"}`} this turn`;
    case "tokensCreatedThisTurn":
      return `#${c.subtype ? `${c.subtype} ` : ""}tokens you created this turn`;
    case "enteredThisTurn":
      return `#${c.nontoken ? "nontoken " : ""}${c.anySubtype?.join("/") ?? c.subtype ?? c.types?.join(" ").toLowerCase() ?? "permanent"}s that entered under your control this turn`;
    case "sacrificedThisTurn":
      if (c.cardTypes) return "#card types among permanents you sacrificed this turn";
      return `#${c.subtype ?? c.type?.toLowerCase() ?? "permanent"}s ${c.anyPlayer ? "" : "you "}sacrificed this turn`;
    case "attackersThisTurn":
      return "#creatures that attacked this turn";
    case "youAttackedWithThisTurn":
      return "#creatures you attacked with this turn";
    case "toGraveyardThisTurn":
      return "#permanents put into a graveyard this turn";
    case "sum":
      return c.of.map(describeCount).join(" + ");
    case "constant":
      return String(c.n);
    case "greater":
      return `the greater of ${describeCount(c.of[0])} and ${describeCount(c.of[1])}`;
    case "difference":
      return `${describeCount(c.of[0])} - ${describeCount(c.of[1])}`;
    case "absDifference":
      return `|${describeCount(c.of[0])} - ${describeCount(c.of[1])}|`;
    case "greaterOf":
      return `max(${describeCount(c.of[0])}, ${describeCount(c.of[1])})`;
    case "cardsToGraveyardThisTurn":
      return "#cards put into that graveyard this turn";
    case "commanderCasts":
      return "#times you've cast your commander";
    case "chosenCommanderMv":
      return "the chosen commander's mana value";
    case "commandersMv":
      return c.onBattlefieldOrCommand ? `the greatest mana value of a commander ${c.who ? "they" : "you"} own on the battlefield or in the command zone` : "the greatest mana value among your commanders";
    case "party":
      return "#creatures in your party";
    case "opponentsLifeLost":
      return "life your opponents lost this turn";
    case "opponentsDamage":
      return "damage dealt to your opponents this turn";
    case "playerDamageThisTurn":
      return "damage dealt to that opponent this turn";
    case "opponentsNoncombatDamage":
      return "noncombat damage dealt to your opponents this turn";
    case "lifeLostThisTurn":
      return "life lost this turn";
    case "devotion":
      return "devotion";
    case "manaSymbols":
      return `#${c.color} mana symbols`;
    case "attachedToSelf":
    case "attachedToAffected":
    case "attachedToHost":
      return `#${c.subtypes.join("/")} attached`;
    case "basicLandTypes":
      return "#basic land types";
    case "creatureTypesAmong":
      return "#creature types among your creatures";
    case "planeswalkerTypesAmong":
      return "#planeswalker types among your planeswalkers";
    case "keywordsAmong":
      return "#abilities among your creatures";
    case "cardTypesAmongPermanents":
      return `#card types among ${c.other ? "other " : ""}${c.nonland ? "nonland " : ""}permanents you control`;
    case "colorsAmongPermanents":
      return c.filter ? `#colors among ${c.other ? "other " : ""}${c.filter.text}` : "#colors among your permanents";
    case "spellsCastThisTurn":
      if (c.cardTypes) return "#card types among spells you've cast this turn";
      return `#${c.other || c.notSource ? "other " : ""}${c.filter ? `${c.filter.text.replace(/ card$/, "")} ` : ""}spells ${c.anyone ? "" : c.opponents ? "your opponents have " : c.eventPlayer ? "they've " : "you've "}cast this turn${c.notFromHand ? " from anywhere other than your hand" : ""}${c.beyondFirst ? " other than the first" : ""}`;
    case "graveyardCardTypes":
      return c.permanent ? "#permanent types in graveyards" : "#card types in graveyards";
    case "graveyardManaValues":
      return `#mana values${c.filter ? ` among ${c.filter.text}s` : ""} in your graveyard`;
    case "greatestPower":
      return `the ${c.total ? "total" : c.least ? "least" : "greatest"} ${c.toughness ? "toughness" : "power"} ${c.total ? "of" : "among"} ${c.other ? "other " : ""}${c.filter.text}`;
    case "greatestMvInExile":
      return "the greatest mana value among cards in exile";
    case "cardsInExile":
      return c.filter ? `#${c.filter.text}s in exile${c.graveyardToo ? " and graveyard" : ""}` : "#cards in exile";
    case "greatestManaValue":
      return `the ${c.total ? "total mana value of" : c.least ? "lowest mana value among" : "greatest mana value among"} ${c.other ? "other " : ""}${c.filter.text}`;
    case "kicked":
      return "times kicked";
    case "wasKicked":
      return "kicked";
    case "spentWas":
      return "mana spent";
    case "colorsSpent":
      return "colors of mana spent";
    case "castSpellX":
      return "that spell's X";
    case "castSpellKicked":
      return "times that spell was kicked";
    case "castSpellColors":
      return "that spell's colors";
    case "castSpellManaSymbols":
      return `that spell's ${c.color} mana symbols`;
    case "colorsOf":
      return "its colors";
    case "castSpellCommanderCasts":
      return "times it's been cast from the command zone";
    case "manaSpent":
      return "mana spent to cast it";
    case "manaSpentOn":
      return "mana spent to cast that spell";
    case "webSlungMv":
      return "the returned creature's mana value";
    case "mostSharingCreatureType":
      return "the most of your creatures sharing a creature type";
    case "greatestControlled":
      return `the greatest number of ${c.filter.text} ${c.opponents ? "an opponent" : "a player"} controls`;
    case "greatestDrawn":
      return "the greatest number of cards an opponent has drawn this turn";
    case "drawnThisTurn":
      return "#cards drawn this turn";
    case "discardedThisTurn":
      return "#cards discarded this turn";
    case "playersAttacked":
      return "#players being attacked";
    case "treasureSpent":
      return "mana from Treasures spent";
    case "snowSpent":
      return "{S} spent";
    case "rollResult":
      return "the result";
    case "rollOther":
      return "the other result";
    case "rollParity":
      return c.odd ? "#odd results" : "#even results";
    case "rollEquals":
      return `#${c.value}s rolled`;
    case "countersPutOnThisWay":
      return "#permanents given counters this way";
    case "drawnThisWay":
      return "#cards drawn this way";
    case "drawnRevealedMv":
      return "the drawn card's mana value";
    case "milledThisWay":
      return `#${c.filter?.text ?? "card"}s milled this way`;
    case "asCast":
      return `${describeCount(c.of)} as cast`;
    case "discardedTypes":
      return "#card types discarded";
    case "discardedMatching":
      return `#${c.filter.text}s discarded`;
    case "flipsWon":
      return c.heads ? "coins that came up heads" : "flips won";
    case "mutations":
      return "times mutated";
    default:
      return c.kind;
  }
}

/** Replace X in an amount with what the text defines it as ("where X is ..."). */
export function substituteX(a: Amount, x: AmountExpr): Amount {
  if (typeof a === "number" || a.count.kind !== "x") return a;
  // "Half X life, rounded down" with X defined as a plain count (Brass Infiniscope's spell's X): halved all the same.
  if ((a.half || a.third || a.per || a.pow2) && !x.half && !x.third && !x.tenth && !x.per && !x.pow2 && !x.negate && (x.times ?? 1) === 1 && !x.plus) return { ...a, count: x.count };
  const t = a.times ?? 1;
  // X itself is the definition, never below 0 (CR 107.1b); "-X" negates it afterwards.
  // "Half X damage, rounded up, ..., where X is the number of Mountains you control" (Eternal Flame): half the definition.
  if (a.half) return t === 1 && !a.plus && !a.negate && !x.half && !x.third && !x.tenth && !x.per && !x.negate ? { ...x, half: a.half } : a;
  if (t === 1 && !a.plus) return { ...x, ...(a.negate !== x.negate ? { negate: true } : { negate: undefined }) };
  return { count: x.count, times: t * (x.times ?? 1), plus: t * (x.plus ?? 0) + (a.plus ?? 0), ...(a.negate ? { negate: true } : {}) };
}

/** Does this amount use the announced X? */
export const usesX = (a: Amount) => typeof a !== "number" && a.count.kind === "x";

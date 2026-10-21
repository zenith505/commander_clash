// Working out the numbers effects use (see Amount in abilities.ts): X, "for each ...",
// "equal to the number of ...", "where X is ...".
//
// A resolving spell or ability works its numbers out once, as it does what it says (CR 608.2h);
// a static ability's numbers are worked out again whenever characteristics are (CR 611.3a).

import type { Amount, AmountExpr, Count, ObjRef, PlayerRef } from "./abilities";
import { ANY_COUNTER } from "./abilities";
import { defOf } from "./cards";
import { bindChosen, objectMatches, printedMatches, spellManaValue } from "./effects";
import { characteristics, staticConditionNow, type Characteristics } from "./layers";
import { manaValue, parseManaCost, snowSpent, spentMeets, type ManaSpent } from "./mana";
import type { Chosen, GameObject, GameState, LastKnown, ObjectId, PlayerId, TriggerEventInfo } from "./types";
import { defMv, sameName } from "./faces";
import { creatureTypesOf, shareCreatureType } from "./game";
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
  /** The source as it last existed, if it has left the battlefield (CR 608.2h). */
  lki?: LastKnown;
  /** Kicker costs paid for the spell (or the spell its permanent was), CR 702.33d. */
  kicked?: number[];
  /** How many colors of mana were spent to cast the spell (or the spell its permanent was), CR 207.2c. */
  colorsSpent?: number;
  /** The amount of mana spent to cast the spell its permanent was (Marath): 0 if it wasn't cast. */
  manaSpent?: number;
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
export function evalAmount(s: GameState, a: Amount, ctx: AmountCtx): number {
  if (typeof a === "number") return a;
  const v0 = evalCount(s, a.count, ctx) * (a.times ?? 1) + (a.plus ?? 0);
  const v = a.twiceIfX !== undefined && (ctx.x ?? 0) >= a.twiceIfX ? v0 * 2 : v0;
  const n = a.signed ? v : Math.max(0, a.half ? halve(v, a.half) : v);
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
  const o = ref.ref === "self" ? selfObject(s, ctx) : undefined;
  return o ? [o] : [];
}

function refPlayers(s: GameState, ref: PlayerRef, ctx: AmountCtx): PlayerId[] {
  if (ctx.players) return ctx.players(ref);
  if (ref.ref === "you") return [ctx.controller];
  if (ref.ref === "eachPlayer") return s.turnOrder.filter((id) => !s.players[id]!.lost);
  if (ref.ref === "eachOpponent") return s.turnOrder.filter((id) => id !== ctx.controller && !s.players[id]!.lost);
  return [];
}

function evalCount(s: GameState, c: Count, ctx: AmountCtx): number {
  const view = ctx.view ?? ((o: GameObject) => characteristics(s, o));
  switch (c.kind) {
    case "x":
      return ctx.x ?? 0;
    case "eventAmount":
      return ctx.event?.amount ?? 0;
    case "eventExcess":
      return ctx.event?.excess ?? 0;
    case "timesAffectedAttacked": {
      // Counted for this object only (CR 400.7), even times before the static ability's source was on the battlefield (rulings on Moraug).
      const o = ctx.affected !== undefined ? s.objects[ctx.affected] : undefined;
      return o?.attacked?.turn === s.turn ? o.attacked.n : 0;
    }
    case "permanents": {
      let n = 0;
      const names = new Set<string>();
      const filter = bindChosen(c.filter, ctx.chosen);
      const whose = c.whose && refPlayers(s, c.whose, ctx);
      const subject = c.sharesTypeWithSubject ? ctx.objects?.({ ref: "subject" })[0] : undefined;
      if (c.sharesTypeWithSubject && !subject) return 0;
      const types = subject && creatureTypesOf(s, subject);
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
        if (c.other && id === ctx.sourceId) continue;
        if (subject && (id === subject.id || !shareCreatureType(types!, creatureTypesOf(s, o)))) continue;
        if (affected && (id === affected.id || (affectedTypes && !shareCreatureType(affectedTypes, typesIn(view(o)))))) continue;
        if (affectedName && (o.faceDown || !sameName(view(o)?.name, affectedName))) continue;
        const ch = view(o);
        if (!ch || (whose && !whose.includes(ch.controller)) || !objectMatches(s, filter, o, ctx.controller, false, undefined, ch, ctx.view)) continue;
        if (!c.differentNames) n++;
        else if (ch.name && !o.faceDown) names.add(ch.name);
      }
      return c.differentNames ? names.size : n;
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
    case "cardsInHand":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.hand.length, 0);
    case "cardsInLibrary":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.library.length, 0);
    case "greatestPowerExiled":
      return Math.max(0, ...(s.resolving?.exiledPowers ?? []));
    case "countersRemovedThisWay":
      return s.resolving?.countersRemoved ?? 0;
    case "linkedExiled": {
      const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      return src ? (s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).length : 0;
    }
    case "movedLinkedThisWay":
      return s.resolving?.movedLinked ?? 0;
    case "eventGroupPower":
      return ctx.event?.groupPower ?? 0;
    case "lifeLostThisWay":
      return s.resolving?.exchanged?.lost[ctx.controller] ?? 0;
    case "exchangedLifeDifference": {
      const ps = s.resolving?.exchanged?.players ?? [];
      return ps.length === 2 ? Math.abs(s.players[ps[0]!]!.life - s.players[ps[1]!]!.life) : 0;
    }
    case "votes":
      return (s.resolving?.votes ?? []).filter((v) => v.choice === c.option).length;
    case "discoveredBelow": {
      const d = s.resolving?.discovered;
      return d && d.mv < c.n ? c.n - d.mv : 0;
    }
    case "destroyedThisWay":
    case "exiledThisWay":
      // As they last existed on the battlefield (CR 608.2h).
      return (s.resolving?.[c.kind === "destroyedThisWay" ? "destroyed" : "exiled"] ?? []).filter(({ o, ch }) => objectMatches(s, c.filter, o, ctx.controller, false, undefined, ch)).length;
    case "discardedThisWay": {
      const counts = c.who ? refPlayers(s, c.who, ctx).map((pid) => s.resolving?.discarded?.[pid] ?? 0) : Object.values(s.resolving?.discarded ?? {});
      return c.greatest ? Math.max(0, ...counts) : counts.reduce((a, b) => a + b, 0);
    }
    case "exiledFromHandThisWay":
      return s.resolving?.exiledFromHand ?? 0;
    case "sacrificedThisWayCount":
      return s.resolving?.sacrificedThisWay?.length ?? 0;
    case "milledManaValue":
      return (s.resolving?.milled ?? []).reduce((a, { id }) => a + defMv(defOf(s, s.objects[id]!)), 0);
    case "revealedFromHand":
    case "bottomedFromHand":
      return s.resolving?.revealedFromHand ?? s.resolving?.item.revealed ?? 0;
    case "tappedThisWay":
      return s.resolving?.tappedThisWay ?? s.resolving?.item.tapped ?? 0;
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
      const filter = c.filter && (c.filter.named === "~" ? { ...c.filter, named: own() } : bindChosen(c.filter, ctx.chosen));
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.graveyard.filter((id) => !filter || printedMatches(filter, defOf(s, s.objects[id]!))).length, 0);
    }
    case "life":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.life, 0);
    case "experience":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + (s.players[pid]!.experience ?? 0), 0);
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0; // CR 702.179f
    case "punished":
      return (s.resolving?.scratch?.punished ?? []).filter((p) => !s.players[p]!.lost).length;
    case "stateIf":
      return ctx.sourceId && staticConditionNow(s, c.cond, ctx.sourceId, ctx.controller) ? 1 : 0;
    case "diedThisTurn":
      return (s.diedThisTurn ?? []).filter((p) => !c.yours || p === ctx.controller).length;
    case "tokensCreatedThisTurn":
      return (s.turnLog?.tokensCreated ?? []).filter((t) => t.player === ctx.controller && (!c.subtype || t.subtypes.includes(c.subtype))).length;
    case "attackersThisTurn":
      return s.attackersThisTurn ?? 0;
    case "toGraveyardThisTurn":
      return s.toGraveyardThisTurn ?? 0;
    case "commanderCasts":
      return Object.values(s.players[ctx.controller]?.commanderCasts ?? {}).reduce((a, b) => a + b, 0);
    case "party":
      return partySize(s, ctx.controller, view);
    case "unspentMana": {
      const pool = s.players[ctx.controller]?.manaPool;
      return pool ? (c.color ? pool[c.color] ?? 0 : Object.values(pool).reduce((a, b) => a + b, 0)) : 0;
    }
    case "lifeGainedThisTurn":
      return s.turnLog?.lifeGained?.[ctx.controller] ?? 0;
    case "opponentsLifeLost":
      return Object.entries(s.turnLog?.lifeLost ?? {}).reduce((n, [p, v]) => (Number(p) !== ctx.controller ? n + v : n), 0);
    case "kicked":
      return (ctx.kicked ?? []).filter((i) => c.which === undefined || i === c.which).length;
    case "wasKicked":
      return (ctx.kicked ?? []).some((i) => c.which === undefined || i === c.which) ? 1 : 0;
    case "spentWas":
      return spentMeets(ctx.spent, c.req) ? 1 : 0;
    case "colorsSpent":
      return ctx.colorsSpent ?? 0;
    case "manaSpent":
      return ctx.manaSpent ?? 0;
    case "treasureSpent":
      return ctx.treasureSpent ?? 0;
    case "rollResult":
      return s.resolving?.rolled?.result ?? s.resolving?.item.rolled ?? ctx.event?.amount ?? 0;
    case "rollOther":
      return s.resolving?.rolled?.other ?? 0;
    case "flipsWon":
      return s.resolving?.flipped?.wins ?? 0;
    case "snowSpent":
      return snowSpent(ctx.spent);
    case "players":
      if (c.lostLife) return s.turnOrder.filter((pid) => !(c.opponents && pid === ctx.controller) && (s.lostLifeThisTurn ?? []).includes(pid)).length;
      // Cut a Deal: each one that drew a card in the draw before, however many it drew (rulings).
      if (c.drewThisWay) return new Set((s.resolving?.drawnBefore ?? []).map((id) => s.objects[id]?.owner).filter((pid) => pid !== undefined && !(c.opponents && pid === ctx.controller))).size;
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
    case "devoured": {
      // "For each creature it devoured" (CR 702.82b): the source, also after it left the battlefield (CR 608.2h).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o) return 0;
      const zc = o.zoneChanges ?? 0;
      const same = ctx.sourceZc === undefined || zc === ctx.sourceZc || (zc === ctx.sourceZc + 1 && o.zone !== "battlefield");
      return same ? (o.devoured ?? 0) : 0;
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
      return Math.max(0, o?.zone === "battlefield" && (o.zoneChanges ?? 0) === st.zc ? characteristics(s, o).power : st.power);
    }
    case "power":
    case "toughness":
    case "manaValue": {
      // "That spell's mana value" in a cast trigger: as it was cast, X included (CR 202.3e), even if it has left the stack.
      if (c.of.ref === "castSpell") {
        const item = ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
        return item && c.kind === "manaValue" ? spellManaValue(s, item) : 0;
      }
      // Not sacrificed for a cost: what the ability sacrificed as it resolved ("You may sacrifice another creature. If you do,
      // ... that creature's power", Disciple of Freyalise).
      if (c.of.ref === "sacrificed") return Math.max(0, (ctx.sacrificed?.[0] ?? s.resolving?.sacrificedThisWay?.at(-1))?.[c.kind] ?? 0);
      const o = refObjects(s, c.of, ctx)[0];
      if (!o) {
        // Gone: as it last existed on the battlefield (CR 608.2h).
        // A trigger's subject that died ("whenever another creature dies, ... its power") too.
        if ((c.of.ref === "self" || c.of.ref === "subject") && c.kind !== "manaValue") return Math.max(0, ctx.lki?.[c.kind] ?? 0);
        // The amassed Army that has left: as it last existed (CR 608.2h).
        const a = c.of.ref === "amassed" ? (s.resolving?.amassed ?? s.resolving?.item.amassed) : undefined;
        const lk = a && s.lastKnown?.[a.id];
        if (lk && lk.zc === a.zc && c.kind !== "manaValue") return Math.max(0, lk[c.kind] ?? 0);
        return 0;
      }
      if (c.kind === "manaValue") {
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
      // "For each blight counter on it" after it left: as it last existed on the battlefield (CR 608.2h).
      const lk = c.of.ref === "self" && !ctx.lki && ctx.sourceId && ctx.sourceZc !== undefined ? s.lastKnown?.[ctx.sourceId] : undefined;
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
        for (const sym of parseManaCost(defOf(s, o).manaCost).symbols) {
          if (sym.kind === "colored" || sym.kind === "phyrexian" || sym.kind === "twoHybrid") n += c.colors.includes(sym.color as never) ? 1 : 0;
          else if (sym.kind === "hybrid") n += sym.options.some((x) => c.colors.includes(x)) ? 1 : 0;
        }
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
    case "graveyardCardTypes": {
      const types = new Set<string>();
      for (const pid of refPlayers(s, c.who, ctx)) for (const id of s.players[pid]!.graveyard) for (const t of defOf(s, s.objects[id]!).types) types.add(t);
      return types.size;
    }
    case "greatestPower": {
      // 0 with none, or with only negative values (rulings on Inscription of Abundance: no life gained or lost).
      let best = 0;
      const filter = bindChosen(c.filter, ctx.chosen);
      const whose = c.whose && refPlayers(s, c.whose, ctx);
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if (c.other && id === ctx.sourceId) continue;
        const ch = view(o);
        if (ch && (!whose || whose.includes(ch.controller)) && objectMatches(s, filter, o, ctx.controller, false, undefined, ch, ctx.view)) {
          const n = c.toughness ? ch.toughness : ch.power;
          best = c.total ? best + n : Math.max(best, n);
        }
      }
      return best;
    }
    case "greatestMvInExile":
      return Math.max(0, ...s.turnOrder.flatMap((pid) => s.players[pid]!.exile.map((id) => (s.objects[id]!.faceDown ? 0 : defMv(defOf(s, s.objects[id]!))))));
    case "greatestManaValue": {
      // From its mana cost (copy and face-down values included, CR 202.3, 708.2); X is 0 on the battlefield (CR 107.3).
      let best = 0;
      for (const id of s.battlefield) {
        if (c.other && id === ctx.sourceId) continue;
        const o = s.objects[id]!;
        const ch = view(o);
        if (ch && objectMatches(s, c.filter, o, ctx.controller, false, undefined, ch, ctx.view)) best = c.total ? best + defMv(defOf(s, o)) : Math.max(best, defMv(defOf(s, o)));
      }
      return best;
    }
    case "spellsCastThisTurn":
      return (s.castThisTurn ?? []).filter((x) => x.player === ctx.controller).length;
    case "manaValueCastThisTurn": {
      // The resolving spell's own cast is its castNth'th; a copy wasn't cast, so it has none (CR 707.10).
      const self = c.other && s.resolving?.item.kind === "spell" ? s.resolving.item.castNth : undefined;
      return (s.castThisTurn ?? []).reduce((n, x, i) => n + (x.player === ctx.controller && i !== self ? (x.mv ?? 0) : 0), 0);
    }
    case "colorsAmongPermanents": {
      const colors = new Set<string>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (ch && ch.controller === ctx.controller) for (const col of ch.colors) colors.add(col);
      }
      return colors.size;
    }
    case "basicLandTypes": {
      const types = new Set<string>();
      for (const id of s.battlefield) {
        const ch = view(s.objects[id]!);
        if (!ch || ch.controller !== ctx.controller || !ch.types.includes("Land")) continue;
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
  const base = describeCount(a.count);
  const t = a.times ?? 1;
  const times = t === 1 ? base : t === -1 ? `-${base}` : `${t} × ${base}`;
  const v0 = a.plus ? `${times} ${a.plus > 0 ? "+" : "-"} ${Math.abs(a.plus)}` : times;
  const v1 = a.half ? `half ${v0}, rounded ${a.half}` : v0;
  const v = a.twiceIfX !== undefined ? `${v1} (twice that if X is ${a.twiceIfX} or more)` : v1;
  return a.negate ? `-(${v})` : v;
}

function describeCount(c: Count): string {
  switch (c.kind) {
    case "x":
      return "X";
    case "permanents":
      return `#${c.differentNames ? "differently named " : ""}${c.other ? "other " : ""}${c.filter.text.replace(/^target /, "")}`;
    case "cardsInHand":
      return "#cards in hand";
    case "timesAffectedAttacked":
      return "#times it attacked this turn";
    case "cardsInLibrary":
      return "#cards in library";
    case "discardedThisWay":
      return c.greatest ? "the most cards discarded" : "#cards discarded";
    case "exiledFromHandThisWay":
      return "#cards exiled from hand";
    case "sacrificedThisWayCount":
      return "#sacrificed";
    case "milledManaValue":
      return "the total mana value of the milled cards";
    case "revealedFromHand":
      return "#cards revealed";
    case "bottomedFromHand":
      return "#cards put on the bottom";
    case "tookFromHand":
      return "#cards chosen";
    case "tappedThisWay":
      return "#tapped";
    case "damageThisWay":
      return "the damage dealt";
    case "excessThisWay":
      return "the excess damage";
    case "greatestPowerExiled":
      return "the greatest power among creature cards exiled";
    case "countersRemovedThisWay":
      return "#counters removed";
    case "linkedExiled":
      return "#cards exiled with it";
    case "movedLinkedThisWay":
      return "#cards put into graveyards";
    case "eventGroupPower":
      return "the total power of those creatures";
    case "lifeLostThisWay":
      return "the life you lost";
    case "exchangedLifeDifference":
      return "the difference between their life totals";
    case "votes":
      return `#${c.option} votes`;
    case "discoveredBelow":
      return `${c.n} minus the discovered card's mana value`;
    case "destroyedThisWay":
      return `#${c.filter.text} destroyed`;
    case "exiledThisWay":
      return `#${c.filter.text} exiled`;
    case "cardsInGraveyard":
      return `#${c.filter ? c.filter.text.replace(/^target /, "") : "cards"} in graveyard`;
    case "life":
      return "life";
    case "experience":
      return "experience counters";
    case "speed":
      return "speed";
    case "punished":
      return "#players punished";
    case "stateIf":
      return "1 if the condition holds";
    case "players":
      return `#${c.opponents ? "opponents" : "players"}${c.lostLife ? " who lost life this turn" : ""}${c.drewThisWay ? " who drew a card this way" : ""}${c.drewAtLeast ? ` who drew ${c.drewAtLeast}+ cards this turn` : ""}${c.landsEnteredAtLeast ? ` who had ${c.landsEnteredAtLeast}+ lands enter this turn` : ""}`;
    case "diedThisTurn":
      return "#creatures that died this turn";
    case "tokensCreatedThisTurn":
      return `#${c.subtype ? `${c.subtype} ` : ""}tokens you created this turn`;
    case "attackersThisTurn":
      return "#creatures that attacked this turn";
    case "toGraveyardThisTurn":
      return "#permanents put into a graveyard this turn";
    case "commanderCasts":
      return "#times you've cast your commander";
    case "party":
      return "#creatures in your party";
    case "opponentsLifeLost":
      return "life your opponents lost this turn";
    case "devotion":
      return "devotion";
    case "attachedToSelf":
    case "attachedToAffected":
      return `#${c.subtypes.join("/")} attached`;
    case "basicLandTypes":
      return "#basic land types";
    case "colorsAmongPermanents":
      return "#colors among your permanents";
    case "spellsCastThisTurn":
      return "#spells you've cast this turn";
    case "graveyardCardTypes":
      return "#card types in graveyards";
    case "greatestPower":
      return `the ${c.total ? "total" : "greatest"} ${c.toughness ? "toughness" : "power"} ${c.total ? "of" : "among"} ${c.other ? "other " : ""}${c.filter.text}`;
    case "greatestMvInExile":
      return "the greatest mana value among cards in exile";
    case "greatestManaValue":
      return `the ${c.total ? "total mana value of" : "greatest mana value among"} ${c.other ? "other " : ""}${c.filter.text}`;
    case "kicked":
      return "times kicked";
    case "wasKicked":
      return "kicked";
    case "spentWas":
      return "mana spent";
    case "colorsSpent":
      return "colors of mana spent";
    case "manaSpent":
      return "mana spent to cast it";
    case "greatestControlled":
      return `the greatest number of ${c.filter.text} ${c.opponents ? "an opponent" : "a player"} controls`;
    case "greatestDrawn":
      return "the greatest number of cards an opponent has drawn this turn";
    case "drawnThisTurn":
      return "#cards drawn this turn";
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
    case "flipsWon":
      return "flips won";
    case "mutations":
      return "times mutated";
    default:
      return c.kind;
  }
}

/** Replace X in an amount with what the text defines it as ("where X is ..."). */
export function substituteX(a: Amount, x: AmountExpr): Amount {
  if (typeof a === "number" || a.count.kind !== "x") return a;
  const t = a.times ?? 1;
  // X itself is the definition, never below 0 (CR 107.1b); "-X" negates it afterwards.
  if (t === 1 && !a.plus) return { ...x, ...(a.negate !== x.negate ? { negate: true } : { negate: undefined }) };
  return { count: x.count, times: t * (x.times ?? 1), plus: t * (x.plus ?? 0) + (a.plus ?? 0), ...(a.negate ? { negate: true } : {}) };
}

/** Does this amount use the announced X? */
export const usesX = (a: Amount) => typeof a !== "number" && a.count.kind === "x";

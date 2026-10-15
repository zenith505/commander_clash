// Working out the numbers effects use (see Amount in abilities.ts): X, "for each ...",
// "equal to the number of ...", "where X is ...".
//
// A resolving spell or ability works its numbers out once, as it does what it says (CR 608.2h);
// a static ability's numbers are worked out again whenever characteristics are (CR 611.3a).

import type { Amount, AmountExpr, Count, ObjRef, PlayerRef } from "./abilities";
import { defOf } from "./cards";
import { bindChosen, objectMatches, printedMatches } from "./effects";
import { characteristics, type Characteristics } from "./layers";
import { manaValue, parseManaCost } from "./mana";
import type { Chosen, GameObject, GameState, LastKnown, ObjectId, PlayerId, TriggerEventInfo } from "./types";

export interface AmountCtx {
  controller: PlayerId;
  sourceId?: ObjectId;
  /** The source's zoneChanges when the ability was created: "~" means that object only (CR 400.7). */
  sourceZc?: number;
  /** The announced X (CR 107.3a); 0 when there's none (CR 107.3g). */
  x?: number;
  /** The source as it last existed, if it has left the battlefield (CR 608.2h). */
  lki?: LastKnown;
  /** Kicker costs paid for the spell (or the spell its permanent was), CR 702.33d. */
  kicked?: number[];
  /** How many colors of mana were spent to cast the spell (or the spell its permanent was), CR 207.2c. */
  colorsSpent?: number;
  /** What was sacrificed to cast the spell, as it last existed. */
  sacrificed?: LastKnown[];
  /** The creature type or color chosen ("for each creature of the chosen type"). */
  chosen?: Chosen;
  /** For a triggered ability, what its event was about ("that much"). */
  event?: TriggerEventInfo;
  /** How the resolving ability finds the objects and players it names. Static abilities only name themselves and "you". */
  objects?: (ref: ObjRef) => GameObject[];
  players?: (ref: PlayerRef) => PlayerId[];
  /**
   * Characteristics to count with. While the layer system is applying effects, it passes the
   * values worked out so far (layers 1-6 are done by the time power and toughness are, CR 613.4).
   */
  view?: (o: GameObject) => Characteristics | undefined;
}

export const isFixed = (a: Amount): a is number => typeof a === "number";

/** The value of `a` right now. */
export function evalAmount(s: GameState, a: Amount, ctx: AmountCtx): number {
  if (typeof a === "number") return a;
  const n = Math.max(0, evalCount(s, a.count, ctx) * (a.times ?? 1) + (a.plus ?? 0));
  return a.negate ? -n : n;
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
    case "permanents": {
      let n = 0;
      const filter = bindChosen(c.filter, ctx.chosen);
      for (const id of s.battlefield) {
        const o = s.objects[id]!;
        if (c.other && id === ctx.sourceId) continue;
        const ch = view(o);
        if (ch && objectMatches(s, filter, o, ctx.controller, false, undefined, ch)) n++;
      }
      return n;
    }
    case "cardsInHand":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.hand.length, 0);
    case "cardsInLibrary":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.library.length, 0);
    case "discardedThisWay": {
      const counts = Object.values(s.resolving?.discarded ?? {});
      return c.greatest ? Math.max(0, ...counts) : counts.reduce((a, b) => a + b, 0);
    }
    case "cardsInGraveyard":
      return refPlayers(s, c.who, ctx).reduce(
        (n, pid) => n + s.players[pid]!.graveyard.filter((id) => !c.filter || printedMatches(bindChosen(c.filter, ctx.chosen), defOf(s, s.objects[id]!))).length,
        0,
      );
    case "life":
      return refPlayers(s, c.who, ctx).reduce((n, pid) => n + s.players[pid]!.life, 0);
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0; // CR 702.179f
    case "party":
      return partySize(s, ctx.controller, view);
    case "kicked":
      return (ctx.kicked ?? []).filter((i) => c.which === undefined || i === c.which).length;
    case "wasKicked":
      return (ctx.kicked ?? []).some((i) => c.which === undefined || i === c.which) ? 1 : 0;
    case "colorsSpent":
      return ctx.colorsSpent ?? 0;
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
    case "power":
    case "toughness":
    case "manaValue": {
      if (c.of.ref === "sacrificed") return Math.max(0, ctx.sacrificed?.[0]?.[c.kind] ?? 0);
      const o = refObjects(s, c.of, ctx)[0];
      if (!o) {
        // Gone: as it last existed on the battlefield (CR 608.2h).
        // A trigger's subject that died ("whenever another creature dies, ... its power") too.
        if ((c.of.ref === "self" || c.of.ref === "subject") && c.kind !== "manaValue") return Math.max(0, ctx.lki?.[c.kind] ?? 0);
        return 0;
      }
      if (c.kind === "manaValue") {
        // On the stack, X is the value chosen for it (CR 202.3e).
        const cost = parseManaCost(defOf(s, o).manaCost);
        const item = o.zone === "stack" ? (s.stack.find((x) => x.objectId === o.id) ?? (s.resolving?.item.objectId === o.id ? s.resolving.item : undefined)) : undefined;
        return manaValue(cost) + (item?.x ?? 0) * cost.symbols.filter((x) => x.kind === "x").length;
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
      const o = refObjects(s, c.of, ctx)[0];
      if (o?.zone === "battlefield") return o.counters[c.counter] ?? 0;
      return c.of.ref === "self" || c.of.ref === "subject" ? (ctx.lki?.counters?.[c.counter] ?? 0) : 0;
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
  const v = a.plus ? `${times} ${a.plus > 0 ? "+" : "-"} ${Math.abs(a.plus)}` : times;
  return a.negate ? `-(${v})` : v;
}

function describeCount(c: Count): string {
  switch (c.kind) {
    case "x":
      return "X";
    case "permanents":
      return `#${c.other ? "other " : ""}${c.filter.text.replace(/^target /, "")}`;
    case "cardsInHand":
      return "#cards in hand";
    case "cardsInLibrary":
      return "#cards in library";
    case "discardedThisWay":
      return c.greatest ? "the most cards discarded" : "#cards discarded";
    case "cardsInGraveyard":
      return `#${c.filter ? c.filter.text.replace(/^target /, "") : "cards"} in graveyard`;
    case "life":
      return "life";
    case "speed":
      return "speed";
    case "party":
      return "#creatures in your party";
    case "devotion":
      return "devotion";
    case "attachedToSelf":
      return `#${c.subtypes.join("/")} attached`;
    case "basicLandTypes":
      return "#basic land types";
    case "kicked":
      return "times kicked";
    case "wasKicked":
      return "kicked";
    case "colorsSpent":
      return "colors of mana spent";
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

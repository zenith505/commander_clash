// Dealing damage (CR 120), in one place so every way of dealing it (combat, spells,
// abilities, fight) gets the same results: prevention effects stop it (CR 615: Fog, prevention
// shields, and protection, CR 702.16e), infect
// and wither turn it into -1/-1 counters (CR 702.90c, 702.80a), infect turns damage to a
// player into poison counters (CR 702.90b), toxic adds poison (CR 702.164c), and
// deathtouch and lifelink apply (CR 702.2, 702.15).

import { abilitiesOf, cardIdOf, defOf, lethalLeft, toughness, wasCastThisTurn } from "./cards";
import { isRingBearer } from "./effects/run-ring";
import { compileCard } from "./oracle";
import { liveEmblems } from "./emblems";
import { commanderOf } from "./mutate";
import { evalAmount } from "./amounts";
import { batchPlayerCounters, putPlayerCounters, putCounters, tokenBatch, withPutter } from "./counters";
import { createExtraTokens, createToken } from "./effects/run-tokens";
import { fireEvent } from "./effects";
import { bindChosen, inRange, objectMatches, playerProtectedFrom } from "./effects/targeting";
import { canPreventDamage, enterTogether, gainLife, log, loseLife, simultaneousLifeLoss, millCount, moveObject, obj, player, syncControl, turnOrderFrom, useShieldCounter } from "./game";
import { protectedFrom, toxicValue } from "./keywords";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "./layers";
import type { CardDef, Color, DamageRule, GameObject, GameState, ObjectId, PlayerId, RedirectShield } from "./types";
import type { AbilityBody, DamageMod, TargetSpec } from "./abilities";
import { defMv, hasName } from "./faces";

/** What a damage source looks like as it deals damage. */
export interface DamageSource {
  name: string;
  controller: PlayerId;
  colors: Color[];
  /** Card types and subtypes, for protection from artifacts, creatures, Goblins (CR 702.16a). */
  types: readonly string[];
  subtypes: readonly string[];
  /** For protection from legendary creatures and from non-Spirit creatures. */
  supertypes?: readonly string[];
  allCreatureTypes?: boolean;
  keywords: string[];
  /** A commander dealing combat damage counts toward commander damage (CR 903.10a). */
  commanderId?: ObjectId;
  /** The permanent dealing it, for "whenever ~ deals damage" (not set for a spell). */
  id?: ObjectId;
  /**
   * The object dealing it, as the object it is (CR 400.7): a permanent, a spell, or a gone permanent whose ability deals
   * it, as it last existed. For a source chosen earlier (CR 609.7a).
   */
  ref?: { object: ObjectId; zc: number };
  /** It's a spell (CR 112.1), for "if a spell would deal damage" (Benevolent Unicorn, Fire Servant). */
  spell?: true;
  /** The damage it deals can't be prevented (CR 615.12): all of it, or its combat damage. */
  unpreventable?: "all" | "combat";
  /** Its mana value, a spell's with its X (CR 202.3), for protection from a mana value. */
  manaValue?: number;
}

/**
 * A permanent (or a card that just left the battlefield) as a damage source: its current
 * characteristics on the battlefield, its last known ones otherwise (CR 702.90d, 702.80b).
 */
export function objectSource(s: GameState, o: GameObject): DamageSource {
  const c = characteristics(s, o);
  const zc = o.zone === "battlefield" ? (o.zoneChanges ?? 0) : (s.lastKnown?.[o.id]?.zc ?? o.zoneChanges ?? 0);
  return { name: c.name, controller: controllerOf(s, o), colors: c.colors, types: c.types, subtypes: c.subtypes, supertypes: c.supertypes, allCreatureTypes: c.allCreatureTypes, keywords: c.keywords, manaValue: c.manaValue, id: o.id, ref: { object: o.id, zc }, ...(wasCastThisTurn(s, o) ? { castThisTurn: true as const } : {}), ...(isRingBearer(s, o) ? { ringBearer: true as const } : {}), ...(o.isCommander ? { commanderId: commanderOf(s, o)?.id ?? o.id } : {}), ...(c.unpreventable ? { unpreventable: c.unpreventable } : {}) };
}

/** "Whenever an instant or sorcery spell you control deals damage to an opponent or battle" (Bloodfeather Phoenix). */
function spellDealt(s: GameState, src: DamageSource, to: { player?: PlayerId; battle?: ObjectId }) {
  const o = src.spell && src.ref ? s.objects[src.ref.object] : undefined;
  if (o) fireEvent(s, { type: "spellDealtDamage", by: src.controller, card: defOf(s, o), ...to });
}

/** A spell, or an ability whose source is gone: the card's printed characteristics. */
export const cardSource = (d: CardDef, controller: PlayerId, ref?: DamageSource["ref"]): DamageSource => ({ name: d.name, controller, colors: d.colors, types: d.types, subtypes: d.subtypes, supertypes: d.supertypes, keywords: d.keywords, manaValue: defMv(d), ...(ref ? { ref } : {}) });

/** Can't this source's damage be prevented (CR 615.12)? */
export const unpreventable = (src: DamageSource, combat: boolean) => src.unpreventable === "all" || (src.unpreventable === "combat" && combat);

const has = (src: DamageSource, k: string) => src.keywords.some((x) => x.toLowerCase() === k.toLowerCase());

export { protectedFrom };

/** Who has a permanent's protection, for protection from a player (CR 702.16k): its controller and its chosen player. */
export const protectionHolder = (s: GameState, o: GameObject) => ({ controller: controllerOf(s, o), ...(o.chosen?.player !== undefined ? { chosenPlayer: o.chosen.player } : {}) });

/**
 * What would be lethal for a permanent about to be dealt damage by `src` (CR 120.4a): for a creature its toughness minus
 * the damage already marked on it (1 at most from a source with deathtouch, 702.2c), ignoring indestructible and any
 * prevention; for a planeswalker its loyalty; for a battle its defense. One for each of those types it has; none for
 * anything else.
 */
export function lethalAmounts(s: GameState, src: DamageSource, o: GameObject): number[] {
  const c = characteristics(s, o);
  const out: number[] = [];
  if (c.types.includes("Creature")) {
    const left = lethalLeft(s, o);
    out.push(has(src, "Deathtouch") ? Math.min(left, 1) : left);
  }
  if (c.types.includes("Planeswalker")) out.push(o.counters.loyalty ?? 0);
  if (c.types.includes("Battle")) out.push(o.counters.defense ?? 0);
  return out;
}

/** The excess damage `n` is beyond those lethal amounts: the greatest for each of its types (CR 120.4a, 120.10). */
export const excessOver = (lethal: number[], n: number) => Math.max(0, ...lethal.map((l) => n - l));

/**
 * Deal `n` damage from `src` to a permanent or player. Returns how much was dealt (0 if it
 * was all prevented). Combat damage also counts for commander damage and toxic.
 *
 * Lifelink makes the source's controller gain that much life (CR 702.15b). Damage a source deals
 * to several things at once is one life-gain event (CR 119.10), so callers dealing it that way
 * pass `lifelink` to add the life up and gain it once themselves.
 *
 * Protection, shield counters and damage shields (prevention and redirection) are applied first, by
 * dealDamageBatch; `shielded` says the caller already did that.
 */
/** The permanent dealing damage, if it's still the object it was, has now dealt damage (Karakyk Guardian). */
function noteDealt(s: GameState, src: DamageSource) {
  const o = src.id ? s.objects[src.id] : undefined;
  if (!o || o.zone !== "battlefield" || o.hasDealtDamage || (src.ref?.object === o.id && src.ref.zc !== (o.zoneChanges ?? 0))) return;
  o.hasDealtDamage = true;
  invalidateCharacteristics(s);
}

export function dealDamage(
  s: GameState,
  src: DamageSource,
  to: { object: GameObject } | { player: PlayerId },
  n: number,
  opts: { combat?: boolean; lifelink?: { n: number }; shielded?: boolean; witherCounters?: Map<string, number> } = {},
): number {
  if (n <= 0) return 0;
  if (opts.combat && s.preventCombatDamage && canPreventDamage(s) && !unpreventable(src, true)) return 0;
  if (!opts.shielded) {
    const ev: DamageEvent = { src, to: "object" in to ? { object: to.object.id } : { player: to.player }, n, ...(opts.combat ? { combat: true } : {}) };
    return dealDamageBatch(s, [ev], { lifelink: opts.lifelink }).reduce((a, e) => a + e.dealt, 0);
  }
  const targetName = "object" in to ? characteristics(s, to.object).name : player(s, to.player).name;
  // The Phantom creatures: prevent it all and remove a +1/+1 counter (CR 615). Damage dealt at the same time by
  // several sources (combat) removes only one counter; with none on it, the damage is still prevented; damage that can't
  // be prevented is dealt and still removes one (rulings). Undergrowth Champion: only while it has a +1/+1 counter on it.
  const phantom = "object" in to ? abilitiesOf(s, to.object).phantom : undefined;
  if ("object" in to && phantom) {
    const o = to.object;
    const event = opts.combat ? `${s.turn}:${s.combatsThisTurn ?? 0}:${s.step}` : undefined;
    if (phantom !== "whileCounter" || (o.counters["+1/+1"] ?? 0) > 0 || (event && o.phantomEvent === event)) {
      if (!event || o.phantomEvent !== event) {
        if (o.counters["+1/+1"]) {
          o.counters["+1/+1"] -= 1;
          if (!o.counters["+1/+1"]) delete o.counters["+1/+1"];
          invalidateCharacteristics(s);
          log(s, `A +1/+1 counter is removed from ${targetName}.`);
        }
        o.phantomEvent = event;
      }
      if (canPreventDamage(s) && !unpreventable(src, !!opts.combat)) {
        log(s, `Damage from ${src.name} to ${targetName} is prevented.`);
        return 0;
      }
    }
  }
  // Phyrexian Hydra: all of it prevented, then a -1/-1 counter for each 1 damage prevented (CR 615.5). Other shields
  // came first (dealDamageBatch), its controller's choice of order (rulings, CR 616.1).
  if ("object" in to && abilitiesOf(s, to.object).preventToMinusCounters && canPreventDamage(s) && !unpreventable(src, !!opts.combat)) {
    log(s, `Damage from ${src.name} to ${targetName} is prevented.`);
    const put = putCounters(s, to.object, "-1/-1", n);
    invalidateCharacteristics(s);
    if (put) log(s, `${put} -1/-1 counter${put === 1 ? " is" : "s are"} put on ${targetName}.`);
    return 0;
  }
  // Ugin's Conjurant: "If damage would be dealt to ~ while it has a +1/+1 counter on it, prevent that damage and remove
  // that many +1/+1 counters from ~" (CR 615.5): all of it prevented, as many counters as it has removed (rulings). Combat
  // damage is one event (CR 510.2), so every source's share is prevented once it applies. Damage that can't be prevented
  // is dealt and still removes the counters (615.12, rulings).
  if ("object" in to && abilitiesOf(s, to.object).counterShield) {
    const o = to.object;
    const event = opts.combat ? `${s.turn}:${s.combatsThisTurn ?? 0}:${s.step}` : undefined;
    const has = o.counters["+1/+1"] ?? 0;
    if (has > 0 || (event && o.phantomEvent === event)) {
      if (has) {
        const off = Math.min(n, has);
        o.counters["+1/+1"] = has - off;
        if (!o.counters["+1/+1"]) delete o.counters["+1/+1"];
        invalidateCharacteristics(s);
        log(s, `${off} +1/+1 counter${off === 1 ? " is" : "s are"} removed from ${targetName}.`);
      }
      o.phantomEvent = event;
      if (canPreventDamage(s) && !unpreventable(src, !!opts.combat)) {
        log(s, `Damage from ${src.name} to ${targetName} is prevented.`);
        return 0;
      }
    }
  }
  // Case of the Burning Masks: each source once, as the object it was (CR 400.7), under its controller as it dealt damage.
  const key = src.ref ? `${src.ref.object}@${src.ref.zc}` : src.name;
  const sources = (((s.turnLog ??= {}).damageSources ??= {})[src.controller] ??= []);
  if (!sources.includes(key)) sources.push(key);
  const totals = ((s.turnLog.sourceDamage ??= {})[src.controller] ??= {});
  totals[key] = (totals[key] ?? 0) + n;
  // Temple of Power: "red sources you controlled dealt 4 or more noncombat damage this turn".
  if (!opts.combat) for (const c of src.colors) ((s.turnLog.noncombatByColor ??= {})[src.controller] ??= {})[c] = (s.turnLog.noncombatByColor[src.controller]![c] ?? 0) + n;
  if ("object" in to) {
    const o = to.object;
    const c = characteristics(s, o);
    const walker = c.types.includes("Planeswalker");
    const battle = c.types.includes("Battle");
    // Damage to a planeswalker removes that many loyalty counters (CR 120.3c, 306.8); one that's also a creature is
    // dealt damage as a creature too (CR 120.3d-e).
    if (walker) {
      const removed = Math.min(n, o.counters.loyalty ?? 0);
      if (removed) o.counters.loyalty = (o.counters.loyalty ?? 0) - removed;
      invalidateCharacteristics(s);
      log(s, `${src.name} deals ${n} damage to ${c.name} (${removed} loyalty removed).`);
    }
    // Damage to a battle removes that many defense counters (CR 120.3h, 310.6), infect and wither too (they're about
    // creatures, CR 120.3d).
    if (battle) {
      const had = o.counters.defense ?? 0;
      const removed = Math.min(n, had);
      if (removed) o.counters.defense = had - removed;
      invalidateCharacteristics(s);
      log(s, `${src.name} deals ${n} damage to ${c.name} (${removed} defense removed).`);
      if (removed && removed === had) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "defense" });
      spellDealt(s, src, { battle: o.id });
    }
    if ((!walker && !battle) || c.types.includes("Creature")) {
      // Everlasting Torment: as though every source had wither (CR 702.80a).
      if (has(src, "Infect") || has(src, "Wither") || s.battlefield.some((id) => abilitiesOf(s, s.objects[id]!).allDamageWither)) {
        // Infect and wither: -1/-1 counters instead of marked damage, but it's still damage dealt. They're put on with
        // the rest of the damage dealt at the same time, as one event for replacement effects (Vizier of Remedies rulings).
        // Keyed by the permanent and the source's controller, who puts them on (rulings on Vorinclex, All Will Be One).
        const key = `${o.id}|${src.controller}`;
        if (opts.witherCounters) opts.witherCounters.set(key, (opts.witherCounters.get(key) ?? 0) + n);
        else withPutter(src.controller, () => putCounters(s, o, "-1/-1", n));
        invalidateCharacteristics(s);
        log(s, `${src.name} deals ${n} damage to ${c.name} (as -1/-1 counters).`);
      } else {
        o.damage += n;
        log(s, `${src.name} deals ${n} damage to ${c.name}.`);
      }
    }
    if (has(src, "Deathtouch")) o.deathtouchDamage = true;
    if (src.id && !o.damagedBy?.includes(src.id)) (o.damagedBy ??= []).push(src.id);
    o.wasDealtDamage = true;
    // Aegar: what dealt damage to it this turn, as the source was then.
    (((s.turnLog ??= {}).damageDealtTo ??= {})[`${o.id}@${o.zoneChanges ?? 0}`] ??= []).push({ controller: src.controller, subtypes: [...src.subtypes], ...(src.spell ? { spell: true as const } : {}), amount: n });
    // Wolverine: "if ~ dealt damage to another creature this turn".
    const srcObj = src.id ? s.objects[src.id] : undefined;
    const srcKey = srcObj && `${srcObj.id}@${srcObj.zoneChanges ?? 0}`;
    if (srcKey && src.id !== o.id && c.types.includes("Creature") && !s.turnLog.damagedCreature?.includes(srcKey)) (s.turnLog.damagedCreature ??= []).push(srcKey);
    // "Whenever ~ deals damage to a creature" (combat damage is all dealt before any of it triggers anything), once the
    // excess damage dealt at the same time is known (see dealPlanned).
    if (src.id && c.types.includes("Creature")) {
      const ev = { type: "damagedCreature" as const, source: src.id, id: o.id, amount: n, combat: !!opts.combat };
      if (creatureBatch) creatureBatch.push(ev);
      else fireEvent(s, ev);
    }
    fireEvent(s, { type: "sourceDealtDamage", source: src.id ?? src.ref?.object ?? "", by: src.controller, id: o.id, amount: n, ...(opts.combat ? { combat: true } : {}) });
    noteDealt(s, src);
  } else {
    const p = player(s, to.player);
    if (has(src, "Infect")) {
      const k = withPutter(src.controller, () => putPlayerCounters(s, p.id, "poison", n));
      log(s, `${src.name} deals ${n} damage to ${p.name} (${k} poison counter${k === 1 ? "" : "s"}).`);
    } else {
      // "Damage that would reduce your life total to less than 1 reduces it to 1 instead" (Ali from Cairo): the damage is
      // all dealt, only the life lost changes; not if they're below 1 already (rulings).
      // Angel's Grace: the same until end of turn.
      // Serra the Benevolent's emblem: "If you control a creature, ...", checked as the damage is dealt.
      const floorOf = (o: GameObject) => {
        const a = abilitiesOf(s, o);
        return a.lifeFloor && (!a.lifeFloorIf || staticConditionNow(s, a.lifeFloorIf, o.id, p.id)) ? a.lifeFloor : 0;
      };
      const floor = Math.max(p.lifeFloorTurn === s.turn ? 1 : 0, ...s.battlefield.map((id) => (controllerOf(s, obj(s, id)) === p.id ? floorOf(obj(s, id)) : 0)), ...liveEmblems(s).map((o) => (o.owner === p.id ? floorOf(o) : 0)));
      // Archon of Coronation: the damage is dealt, without the life loss (CR 120.3a; rulings).
      const noLoss = s.battlefield.some((id) => {
        const o = obj(s, id);
        const cond = controllerOf(s, o) === p.id && abilitiesOf(s, o).damageNoLifeLossIf;
        return !!cond && staticConditionNow(s, cond, o.id, p.id);
      });
      const lost = noLoss ? 0 : floor && p.life >= floor && p.life - n < floor ? p.life - floor : n;
      if (!noLoss) loseLife(s, p.id, lost);
      log(s, `${src.name} deals ${n} damage to ${p.name}${noLoss ? " (it doesn't cause them to lose life)" : lost < n ? ` (their life total can't go below ${floor})` : ""}.`);
    }
    if (!(s.damagedThisTurn ??= []).includes(p.id)) s.damagedThisTurn.push(p.id);
    // Inferno Trap: each creature once, as the object it was then (CR 400.7); one that has left counts as it last existed.
    const from = src.id ? s.objects[src.id] : undefined;
    if (from && src.types.includes("Creature")) {
      const zc = from.zone === "battlefield" ? (from.zoneChanges ?? 0) : (s.lastKnown?.[from.id]?.zc ?? from.zoneChanges ?? 0);
      const list = (((s.turnLog ??= {}).damagedBy ??= {})[p.id] ??= []);
      if (!list.includes(`${from.id}@${zc}`)) list.push(`${from.id}@${zc}`);
    }
    (s.damageThisTurn ??= {})[p.id] = (s.damageThisTurn[p.id] ?? 0) + n;
    if (!opts.combat) ((s.turnLog ??= {}).noncombatDamage ??= {})[p.id] = (s.turnLog.noncombatDamage?.[p.id] ?? 0) + n;
    // "Whenever you're dealt damage": once for the damage dealt at the same time (see dealPlanned).
    if (playerBatch) playerBatch.set(p.id, (playerBatch.get(p.id) ?? 0) + n);
    else fireEvent(s, { type: "playerDealtDamage", player: p.id, amount: n, combat: !!opts.combat });
    // "Whenever ~ deals damage to a player" (combat damage is all dealt before any of it triggers anything).
    fireEvent(s, { type: "damagedPlayer", source: src.id ?? "", by: src.controller, player: p.id, amount: n, combat: !!opts.combat });
    fireEvent(s, { type: "sourceDealtDamage", source: src.id ?? src.ref?.object ?? "", by: src.controller, player: p.id, amount: n, ...(opts.combat ? { combat: true } : {}) });
    noteDealt(s, src);
    spellDealt(s, src, { player: p.id });
    if (opts.combat) {
      p.combatDamagedTurn = s.turn;
      if (from) {
        const zc = from.zone === "battlefield" ? (from.zoneChanges ?? 0) : (s.lastKnown?.[from.id]?.zc ?? from.zoneChanges ?? 0);
        const by = (((s.turnLog ??= {}).combatDamagedBy ??= {})[p.id] ??= []);
        if (!by.includes(`${from.id}@${zc}`)) by.push(`${from.id}@${zc}`);
      }
      if (src.types.includes("Creature")) {
        if (src.name && !p.combatDamagedByNames?.includes(src.name)) (p.combatDamagedByNames ??= []).push(src.name);
        const seen = ((s.turnLog ??= {}).combatDamageSubtypes ??= []);
        // A changeling has every creature type (CR 702.73a): "*".
        for (const t of from && from.zone === "battlefield" && characteristics(s, from).allCreatureTypes ? ["*"] : src.subtypes) if (!seen.includes(t)) seen.push(t);
        // Prowl (CR 702.76a): the source's creature types as it dealt the damage, for the player who controlled it.
        const mine = ((s.turnLog.combatDamageTypesBy ??= {})[src.controller] ??= []);
        for (const t of from && from.zone === "battlefield" && characteristics(s, from).allCreatureTypes ? ["*"] : src.subtypes) if (!mine.includes(t)) mine.push(t);
        if (from?.zone === "battlefield" && characteristics(s, from).supertypes.includes("Legendary")) {
          const legends = (s.turnLog.legendaryCombatDamaged ??= []);
          if (!legends.includes(p.id)) legends.push(p.id);
        }
      }
      if (src.commanderId) p.commanderDamage[src.commanderId] = (p.commanderDamage[src.commanderId] ?? 0) + n;
      // Freerunning (CR 702.173a): an Assassin creature or a commander, as it was when it dealt the damage, lets its
      // controller pay freerunning costs this turn.
      if (src.types.includes("Creature") && (src.subtypes.includes("Assassin") || src.commanderId) && !(s.freerunningThisTurn ??= []).includes(src.controller)) s.freerunningThisTurn.push(src.controller);
      const toxic = withPutter(src.controller, () => putPlayerCounters(s, p.id, "poison", toxicValue(src.keywords)));
      if (toxic > 0) {
        log(s, `${p.name} gets ${toxic} poison counter${toxic === 1 ? "" : "s"} (toxic).`);
      }
    }
  }
  if (has(src, "Lifelink")) {
    if (opts.lifelink) opts.lifelink.n += n;
    else gainLife(s, src.controller, n); // CR 702.15b
  }
  return n;
}

// ---------------------------------------------------------------------------
// Damage dealt at the same time, and the shields that change it (CR 614.9, 615.7, 616.1)

/** Damage about to be dealt: plain JSON, so combat damage can wait in state while a player chooses. */
export interface DamageEvent {
  src: DamageSource;
  to: { object: ObjectId } | { player: PlayerId };
  n: number;
  combat?: boolean;
  /** The shields already applied to this damage on its way here: each applies to it only once (CR 614.5). */
  applied?: string[];
}

/** A question a damage shield asks the player whose permanent or life it protects. Options are in the bot's order of preference. */
export interface ShieldQuestion {
  player: PlayerId;
  prompt: string;
  labels: string[];
}

type Rec = DamageEvent["to"];
const toPlayer = (r: Rec): { player?: PlayerId } => ("player" in r ? { player: r.player } : {});
const recKey = (r: Rec) => ("object" in r ? `o:${r.object}` : `p:${r.player}`);
const srcKey = (src: DamageSource) => src.id ?? `spell:${src.name}`;

type ShieldOp =
  | { kind: "protection"; srcName: string; toName: string; /** Damage to a player: who, and how much was prevented (Selfless Squire). */ player?: PlayerId; n?: number }
  | { kind: "preventAll"; srcName: string; toName: string; /** Damage to a player: who (Selfless Squire). */ player?: PlayerId; /** A damage rule's, with what's prevented for its additional effect. */ rule?: string; n?: number; src?: DamageSource; /** A static rule's card, for the log. */ card?: string; /** Vigor's +1/+1 counters, one for each 1 damage prevented, put by `by`. */ plusOnes?: { id: ObjectId; n: number; by: PlayerId; card: string }; /** Phyrexian Vindicator's reflexive trigger, about `n` damage prevented. */ reflect?: { id: ObjectId; n: number; by: PlayerId; card: string; body: AbilityBody } }
  | { kind: "shieldCounter"; id: ObjectId; srcName: string }
  | { kind: "prevent"; to: Rec; n: number; srcName: string; toName: string; rule?: string; src?: DamageSource; card?: string }
  | { kind: "redirect"; to: Rec; shield: string; n: number; srcName: string; fromName: string; toName: string; card: string; rule?: boolean }
  /** A damage amount replacement or a prevention effect that changes the amount (see DamageMod): `from` became `n`. */
  | { kind: "modify"; srcName: string; toName: string; from: number; n: number; card: string; prevent: boolean; /** Damage to a player: who. */ player?: PlayerId; /** A "next time" one, used up now. */ once?: string }
  /** The Mindskinner's additional effect (CR 615.5): each opponent of `by` mills `n` cards, even if the damage couldn't be prevented (615.12). */
  | { kind: "mill"; by: PlayerId; n: number; card: string; /** `by` mills it themselves (Angel of Suffering). */ self?: true }
  /** Khârn the Betrayer's additional effect (CR 615.5): `to` gains control of it, after any prevention. */
  | { kind: "betrayer"; id: ObjectId; to: PlayerId; prevented: boolean; toName: string }
  /** Nine Lives' counter (`counter` of it) for one source's damage to its controller, prevented or not (CR 615.5, 615.12). */
  | { kind: "counterOn"; id: ObjectId; counter: string; by: PlayerId; card: string }
  /** Anti-Venom's counters for damage that can't be prevented, which is dealt too (CR 615.12). */
  | { kind: "plusOnes"; id: ObjectId; n: number; by: PlayerId; card: string };

interface ShieldPlan {
  ask?: ShieldQuestion;
  ops: ShieldOp[];
  final: DamageEvent[];
  /** How many of the answers it used. */
  used?: number;
  /** The rules it planned with, static ones included (Purity's are made for this event only). */
  rules?: DamageRule[];
}

/** One of the shields around a permanent or player, as the planner sees it. */
interface PlanShield {
  key: string;
  kind: "prevent" | "redirect";
  cap: number;
  to?: Rec;
  card?: string;
  /** A damage rule's shield: it takes only the damage the rule applies to. */
  rule?: DamageRule;
}

// Damage rules (GameState.damageRules): prevention and redirection effects of resolved spells and abilities that
// aren't a shield on one permanent or player.

const live = (s: GameState) => (s.damageRules ?? []).filter((r) => r.turn === s.turn);

/**
 * The damage rules permanents' static abilities make for this damage (CR 615.1a), worked out as it would be dealt: Cover
 * of Winter's "prevent X of that damage" for each creature dealing combat damage, a shield of X for that creature's
 * damage to its controller and the creatures they control, divided as they choose (rulings). Nothing is used up: the
 * next combat damage step gets X again.
 */
function staticRules(s: GameState, events: DamageEvent[]): DamageRule[] {
  const out: DamageRule[] = [];
  for (const id of s.battlefield) {
    const cover = obj(s, id);
    // The Mindskinner: "If a source you control would deal damage to an opponent, prevent that damage and each opponent
    // mills that many cards."
    if (abilitiesOf(s, cover).damageToOpponentsMills) out.push({ id: `static-mill:${id}`, turn: s.turn, controller: controllerOf(s, cover), cardId: cover.cardId, to: { players: "opponents" }, sourceYours: true, mill: true });
    // Angel of Suffering: "If damage would be dealt to you, prevent that damage and mill twice that many cards": the cards
    // are milled even if the damage can't be prevented (rulings, CR 615.12).
    if (abilitiesOf(s, cover).damageToYouMillsTwice) out.push({ id: `static-millself:${id}`, turn: s.turn, controller: controllerOf(s, cover), cardId: cover.cardId, to: { players: "you" }, mill: true, millSelf: 2 });
    // Nine Lives: "If a source would deal damage to you, prevent that damage and put an incarnation counter on ~": one
    // counter for each source, put even if the damage can't be prevented (rulings, CR 615.12).
    const nine = abilitiesOf(s, cover).preventToYouCounter;
    if (nine) out.push({ id: `static-counter:${id}`, turn: s.turn, controller: controllerOf(s, cover), cardId: cover.cardId, to: { players: "you" }, counterOn: { id, kind: nine } });
    // The Wanderer: "Prevent all noncombat damage that would be dealt to you and other permanents you control."
    const pv = abilitiesOf(s, cover).preventToYou;
    if (pv) out.push({ id: `static-prevent:${id}`, turn: s.turn, controller: controllerOf(s, cover), cardId: cover.cardId, ...(pv.combat ? { combat: pv.combat } : {}), to: { players: "you", ...(pv.others ? { objects: { kind: "object", types: [], controller: "you", text: "permanent you control" }, notObject: id } : {}) }, ...(pv.gain ? { gainLife: {} } : {}) });
    // Stormwild Capridor: "prevent that damage. Put a +1/+1 counter on ~ for each 1 damage prevented this way."
    const selfCounters = abilitiesOf(s, cover).preventToSelfCounters;
    if (selfCounters) out.push({ id: `static-selfcounters:${id}`, turn: s.turn, controller: controllerOf(s, cover), cardId: cover.cardId, ...(selfCounters.combat ? { combat: selfCounters.combat } : {}), to: { object: { id, zc: cover.zoneChanges ?? 0 } }, countersOn: { counter: selfCounters.counter } });
    // Pariah, Palisade Giant (CR 614.9): all damage that would be dealt to its controller (and their other permanents) is
    // dealt to it or the creature it's attached to instead. Several of them: the player being dealt the damage chooses
    // which applies (CR 616.1, rulings on Palisade Giant).
    const red = abilitiesOf(s, cover).damageToYouRedirect;
    const dest = red ? (red.to === "self" ? cover : cover.attachedTo ? s.objects[cover.attachedTo] : undefined) : undefined;
    if (red && dest && !(red.untapped && cover.tapped)) {
      const you = controllerOf(s, cover);
      out.push({
        id: `static-redirect:${id}`,
        turn: s.turn,
        controller: you,
        cardId: cover.cardId,
        to: { players: "you", ...(red.others ? { objects: { kind: "object", types: [], controller: "you", text: "permanent you control" } } : {}) },
        redirect: { object: dest.id, zc: dest.zoneChanges ?? 0 },
        ...(red.by ? { by: { filter: red.by } } : {}),
      });
    }
    const n = abilitiesOf(s, cover).preventCombatFromEach;
    if (n === undefined) continue;
    const you = controllerOf(s, cover);
    const x = evalAmount(s, n, { controller: you, sourceId: id });
    if (x <= 0) continue;
    const seen = new Set<string>();
    for (const e of events) {
      const ref = e.src.ref;
      if (!e.combat || !ref || !e.src.types.includes("Creature") || seen.has(`${ref.object}:${ref.zc}`)) continue;
      seen.add(`${ref.object}:${ref.zc}`);
      out.push({ id: `static:${id}:${ref.object}`, turn: s.turn, controller: you, cardId: cover.cardId, combat: "only", to: { players: "you", objects: { kind: "object", types: ["Creature"], controller: "you", text: "creature you control" } }, by: { chosen: { id: ref.object, zc: ref.zc } }, left: x });
    }
  }
  return out;
}
/** A rule that prevents all the damage it applies to, using nothing up, as opposed to a shield (CR 615.1, 615.7-8). */
const preventsAll = (r: DamageRule) => r.left === undefined && !r.nextTime && !r.redirect;
const cardName = (s: GameState, r: DamageRule) => s.cards[r.cardId]?.name ?? "a damage shield";

/** Is the permanent or player one the rule protects? Whatever matches now, also ones that arrived later (CR 611.2c). */
function ruleCovers(s: GameState, r: DamageRule, to: Rec): boolean {
  const t = r.to;
  if (!t) return true;
  // "You and other permanents you control": not the permanent the damage is dealt to instead.
  if (r.redirect && "object" in r.redirect && "object" in to && r.redirect.object === to.object) return false;
  if ("player" in to) return t.player === to.player || t.players === "all" || (t.players === "you" && to.player === r.controller) || (t.players === "opponents" && to.player !== r.controller);
  const o = s.objects[to.object];
  if (!o || o.zone !== "battlefield" || t.notObject === o.id) return false;
  if (t.object && t.object.id === o.id && t.object.zc === (o.zoneChanges ?? 0)) return true;
  return !!t.objects && objectMatches(s, t.objects, o, r.controller, false);
}

/**
 * Does the source fit `spec` as it deals the damage (CR 609.7b)? A permanent is checked as it is now; anything else
 * (a spell, a gone permanent's ability) by its characteristics as it deals it, and not for what only a permanent can
 * be (attacking, tapped, with counters).
 */
function sourceMatches(s: GameState, spec: TargetSpec, src: DamageSource, controller: PlayerId): boolean {
  const o = src.ref ? s.objects[src.ref.object] : undefined;
  if (o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === src.ref!.zc) return objectMatches(s, spec, o, controller, false);
  // A spell's mana value counts its X (CR 202.3e); a gone permanent's is its card's.
  if (spec.manaValue && (src.manaValue === undefined || !inRange(src.manaValue, spec.manaValue))) return false;
  if (spec.combat || spec.counter || spec.tapped !== undefined || spec.token !== undefined || spec.power || spec.toughness || spec.supertypes || spec.notSupertypes || spec.anyOf || spec.chosen) return false;
  if (spec.named !== undefined && !hasName(src.name, spec.named)) return false;
  const kw = (k: string) => src.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.types?.length && !spec.types.some((t) => src.types.includes(t)) && !spec.orSubtypes?.some((t) => src.subtypes.includes(t))) return false;
  if (spec.allTypes?.some((t) => !src.types.includes(t)) || spec.notTypes?.some((t) => src.types.includes(t))) return false;
  if (spec.colors?.length && !spec.colors.some((c) => src.colors.includes(c))) return false;
  if (spec.bothColors?.some((c) => !src.colors.includes(c))) return false;
  if (spec.notColors?.some((c) => src.colors.includes(c))) return false;
  const n = src.colors.length;
  if (spec.colorCount && (spec.colorCount === "colorless" ? n !== 0 : spec.colorCount === "monocolored" ? n !== 1 : spec.colorCount === "two" ? n !== 2 : spec.colorCount === "notTwo" ? n === 2 : spec.colorCount === "colored" ? n === 0 : spec.colorCount === "all" ? n < 5 : spec.colorCount === "notAll" ? n >= 5 : n < 2)) return false;
  if (spec.subtypes?.length && !spec.subtypes.some((t) => src.subtypes.includes(t))) return false;
  if (spec.notSubtypes?.some((t) => src.subtypes.includes(t))) return false;
  if (spec.keywords?.some((k) => !kw(k)) || spec.notKeywords?.some(kw)) return false;
  if (spec.controller === "you" && src.controller !== controller) return false;
  if (spec.controller === "opponent" && src.controller === controller) return false;
  return true;
}

/** Does the rule apply to this damage, apart from who'd be dealt it: combat or not, and its source (CR 609.7a-b)? */
function ruleTakes(s: GameState, r: DamageRule, e: DamageEvent): boolean {
  if (r.combat && (r.combat === "only") !== !!e.combat) return false;
  if (r.sourceYours && e.src.controller !== r.controller) return false;
  const c = r.by?.chosen;
  if (c) {
    const ref = e.src.ref;
    // A permanent spell chosen as the source: the permanent it becomes is that source too (CR 609.7a).
    if (!ref || ref.object !== c.id || (ref.zc !== c.zc && !(c.spell && ref.zc === c.zc + 1))) return false;
  }
  const not = r.by?.not;
  if (not && e.src.ref?.object === not.id && e.src.ref.zc === not.zc) return false;
  return !r.by?.filter || sourceMatches(s, r.by.filter, e.src, r.controller);
}

/** Where a rule redirects damage to, if it's still there to be dealt it (CR 614.9). */
function ruleDestination(s: GameState, r: DamageRule): Rec | null {
  return r.redirect ? redirectDestination(s, { id: r.id, n: 0, to: r.redirect, source: "" }) : null;
}

/** An additional effect's color condition ("if damage from a black source is prevented this way"). */
const colorsOk = (cond: { colors?: Color[] } | undefined, src: DamageSource) => !!cond && (!cond.colors || cond.colors.some((c) => src.colors.includes(c)));

/** Is this redirection's destination still there to be dealt the damage (CR 614.9)? */
function redirectDestination(s: GameState, r: RedirectShield): Rec | null {
  if ("player" in r.to) return player(s, r.to.player).lost ? null : { player: r.to.player };
  const o = s.objects[r.to.object];
  if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== r.to.zc) return null;
  const c = characteristics(s, o);
  return c.types.includes("Creature") || c.types.includes("Planeswalker") ? { object: o.id } : null;
}

// Damage amount replacements (DamageMod): permanents' static abilities that change how much damage is dealt.

/** One permanent's damage amount replacement, as the planner sees it. `holder` has the ability (for an Equipment's, the creature it's attached to). */
interface LiveMod {
  key: string;
  mod: DamageMod & { you: PlayerId; from?: ObjectId };
  /** None for a resolved spell's or ability's (GameState.damageMods). */
  holder?: GameObject;
  card: string;
  /** GameState.damageMods's id of a "next time" one. */
  once?: string;
}

function liveMods(s: GameState): LiveMod[] {
  const out: LiveMod[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    for (const [i, mod] of (characteristics(s, o).damageMods ?? []).entries()) {
      const from = s.objects[mod.from];
      out.push({ key: `mod:${id}:${i}`, mod, holder: o, card: from ? characteristics(s, from).name : characteristics(s, o).name });
    }
  }
  // An emblem's (Ajani Steadfast's: "prevent all but 1 of that damage"), its owner's (CR 114.4).
  for (const o of liveEmblems(s))
    compileCard(defOf(s, o)).statics.forEach((st, i) =>
      st.mods.forEach((m, j) => {
        if (m.kind === "damageMod") out.push({ key: `mod:${o.id}:${i}:${j}`, mod: { ...m.mod, you: o.owner, from: o.id }, card: defOf(s, o).name });
      }),
    );
  // A resolved one lasts the turn, or until its controller's next turn begins (CR 611.2a).
  for (const r of s.damageMods ?? [])
    if (r.turn === s.turn || (r.until === "yourNextTurn" && !(s.activePlayer === r.you && s.turn > r.turn))) out.push({ key: `mod:${r.id}`, mod: { ...r.mod, you: r.you }, card: r.name, ...(r.mod.nextTime ? { once: r.id } : {}) });
  return out;
}

/** Does the replacement apply to this damage: its source and what it would be dealt to, combat or not (CR 609.7b)? */
function modApplies(s: GameState, m: LiveMod, e: DamageEvent, preventing: boolean): boolean {
  const d = m.mod;
  const h = m.holder;
  if (d.prevent && !preventing) return false;
  if (d.combat && (d.combat === "only") !== !!e.combat) return false;
  if (d.atMost !== undefined && e.n > d.atMost) return false;
  if (d.atLeast !== undefined && e.n < d.atLeast) return false;
  // Ojer Axonil: only damage less than its power, compared once as it would be dealt (rulings).
  if (d.op === "raiseTo" && (e.n <= 0 || e.n >= modExtra(s, m))) return false;
  const ref = e.src.ref;
  const isHolder = !!ref && !!h && ref.object === h.id && ref.zc === (h.zoneChanges ?? 0);
  if (d.by?.self && !isHolder) return false;
  // A permanent spell chosen as the source: the permanent it becomes is that source too (CR 609.7a).
  const c = d.by?.chosen;
  if (c && !(ref && ref.object === c.id && (ref.zc === c.zc || (c.spell && ref.zc === c.zc + 1)))) return false;
  if (d.by?.other && isHolder) return false;
  // Wall of Vapor: a creature the holder is blocking; Armored Transport: one blocking the holder.
  if (d.by?.combatWithHolder) {
    const o = ref ? s.objects[ref.object] : undefined;
    const with_ = d.by.combatWithHolder === "blocked" ? h?.blocking : h?.blockedBy;
    if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== ref!.zc || !with_?.includes(o.id)) return false;
  }
  if (d.by?.filters && !d.by.filters.some((f) => (!f.spell || e.src.spell) && sourceMatches(s, bindChosen(f.spec, h?.chosen), e.src, d.you))) return false;
  const t = d.to;
  if (t) {
    let ok = false;
    if ("player" in e.to) {
      const p = e.to.player;
      ok = t.players === "all" || (t.players === "you" && p === d.you) || (t.players === "opponents" && p !== d.you) || (t.players === "enchanted" && h?.attachedToPlayer === p) || (t.players === "chosen" && h?.chosen?.player === p) || t.player === p;
    } else {
      const o = s.objects[e.to.object];
      if (o && o.zone === "battlefield" && !(t.other && o.id === h?.id))
        ok =
          (!!t.self && o.id === h?.id) ||
          (!!t.objects && objectMatches(s, t.objects, o, d.you, false)) ||
          (!!t.chosenPermanents && h?.chosen?.player !== undefined && controllerOf(s, o) === h.chosen.player) ||
          (t.permanentsOf !== undefined && controllerOf(s, o) === t.permanentsOf);
    }
    if (!ok) return false;
  }
  return !d.while || (!!d.from && staticConditionNow(s, d.while, d.from, d.you));
}

const modExtra = (s: GameState, m: LiveMod) => (m.mod.amount === undefined ? 0 : Math.max(0, evalAmount(s, m.mod.amount, { controller: m.mod.you, ...(m.mod.from ? { sourceId: m.mod.from } : {}) })));

/** The damage after the replacement: double, triple, half, plus or minus (not below 0), or prevented. */
function modAmount(s: GameState, m: LiveMod, n: number): number {
  const d = m.mod;
  if (d.op === "times") return n * (d.n ?? 1);
  if (d.op === "half") return d.up ? Math.ceil(n / 2) : Math.floor(n / 2);
  if (d.op === "plus") return n + modExtra(s, m);
  if (d.op === "minus") return Math.max(0, n - modExtra(s, m));
  if (d.op === "allBut") return Math.min(n, d.n ?? 0);
  if (d.op === "raiseTo") return Math.max(n, modExtra(s, m));
  if (d.op === "setTo") return modExtra(s, m);
  return 0;
}

function modLabel(s: GameState, m: LiveMod): string {
  const d = m.mod;
  const what =
    d.op === "times" ? (d.n === 3 ? "Triple it" : "Double it")
    : d.op === "half" ? (d.prevent ? `Prevent half of it, rounded ${d.up ? "down" : "up"}` : `Halve it, rounded ${d.up ? "up" : "down"}`)
    : d.op === "plus" ? `Add ${modExtra(s, m)}`
    : d.op === "minus" ? (d.prevent ? `Prevent ${modExtra(s, m)} of it` : `Take ${modExtra(s, m)} away`)
    : d.op === "allBut" ? `Prevent all but ${d.n} of it`
    : d.op === "raiseTo" || d.op === "setTo" ? `Make it ${modExtra(s, m)}`
    : "Prevent it";
  return `${what} (${m.card})`;
}

/** Every order of a few things. */
function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (const [i, x] of xs.entries()) for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [x, ...rest];
}

/**
 * Work out what the damage shields do to damage dealt at the same time (CR 510.2), without changing anything yet:
 * protection prevents damage first (it uses up no shield), then each shield counter prevents one source's damage
 * (CR 122.1c), then "prevent the next N" and "the next N is dealt to X instead" shields (CR 615.7, 614.9). When
 * shields can't cover all of it and two or more sources deal it, the player whose permanent or life it is chooses
 * which damage each shield takes; when they'd cover more than all of it, they choose which shield applies first
 * (CR 616.1). `answers` are those choices so far, in order; without enough of them the plan asks the next one, or
 * with `auto` takes the first option. Redirected damage is still dealt by its source, and is still combat damage
 * (rulings), and the permanent or player it's redirected to can have shields of its own (CR 616.2).
 */
export function planShields(s: GameState, events: DamageEvent[], answers: number[], auto = false): ShieldPlan {
  let next = 0;
  let ask: ShieldQuestion | undefined;
  const choose = (q: ShieldQuestion): number | null => {
    if (next < answers.length) return Math.min(answers[next++]!, q.labels.length - 1);
    if (auto) return 0;
    ask = q;
    return null;
  };
  const ops: ShieldOp[] = [];
  const final: DamageEvent[] = [];
  const allRules = [...live(s), ...staticRules(s, events)];
  const allMods = liveMods(s);
  const preventCap = new Map<string, number>();
  const redirectCap = new Map<string, number>();
  const counters = new Map<ObjectId, number>();
  // "Damage can't be prevented" (CR 615.12): protection, shield counters and prevention shields don't stop it, nor
  // damage from a source whose damage can't be prevented.
  const preventing = canPreventDamage(s);
  const prev = (e: DamageEvent) => preventing && !unpreventable(e.src, !!e.combat);
  // Damage rules' shields: what's left of each, shared by all it protects, and how much of it each may take.
  const ruleCap = new Map<string, number>();
  const alloc = new Map<string, Map<string, number>>();
  const holder = (r: Rec) => ("object" in r ? s.objects[r.object] : player(s, r.player));
  const nameOf = (r: Rec) => ("object" in r ? characteristics(s, obj(s, r.object)).name : player(s, r.player).name);
  const chooserOf = (r: Rec) => ("object" in r ? controllerOf(s, obj(s, r.object)) : r.player);
  const shieldsOf = (r: Rec, applied: Set<string>): PlanShield[] => {
    const h = holder(r);
    if (!h) return [];
    const out: PlanShield[] = [];
    const pk = `${recKey(r)}:prevent`;
    if (!preventCap.has(pk)) preventCap.set(pk, h.preventNext ?? 0);
    if (preventing && preventCap.get(pk)! > 0 && !applied.has(pk)) out.push({ key: pk, kind: "prevent", cap: preventCap.get(pk)! });
    for (const sh of h.redirectNext ?? []) {
      if (!redirectCap.has(sh.id)) redirectCap.set(sh.id, sh.n);
      const dest = redirectDestination(s, sh);
      if (redirectCap.get(sh.id)! > 0 && dest && !applied.has(sh.id)) out.push({ key: sh.id, kind: "redirect", cap: redirectCap.get(sh.id)!, to: dest, card: sh.source });
    }
    for (const rule of allRules) {
      if (preventsAll(rule) || applied.has(rule.id) || !ruleCovers(s, rule, r)) continue;
      const dest = ruleDestination(s, rule);
      if (rule.redirect ? !dest : !preventing) continue;
      if (!ruleCap.has(rule.id)) ruleCap.set(rule.id, rule.left ?? Infinity);
      const cap = Math.min(ruleCap.get(rule.id)!, alloc.get(rule.id)?.get(recKey(r)) ?? Infinity);
      if (cap > 0) out.push({ key: rule.id, kind: dest ? "redirect" : "prevent", cap, ...(dest ? { to: dest } : {}), card: cardName(s, rule), rule });
    }
    return out;
  };
  // Damage one "all damage that would be dealt to you is dealt to ~ instead" permanent took isn't sent on by another:
  // with two Palisade Giants, the damage is dealt to either one, as its player chooses (rulings on Palisade Giant and
  // Pariah).
  const staticRedirect = (k: string) => k.startsWith("static-redirect:");
  const takes = (sh: PlanShield, e: DamageEvent) =>
    (sh.kind !== "prevent" || prev(e)) && !(e.applied ?? []).includes(sh.key) && !(staticRedirect(sh.key) && (e.applied ?? []).some(staticRedirect)) && (!sh.rule || ruleTakes(s, sh.rule, e));
  let queue = events.filter((e) => e.n > 0).map((e) => ({ ...e, applied: e.applied ?? [] }));
  const order = turnOrderFrom(s, s.activePlayer);
  // A rule's "next N damage" shield protecting several permanents and players (Harm's Way's "you and/or permanents you
  // control"): when its source would deal more than N to them at once, its controller chooses which N (rulings).
  for (const rule of allRules) {
    if (rule.left === undefined || rule.left <= 0 || (!rule.redirect && !preventing)) continue;
    const per = new Map<string, { to: Rec; n: number }>();
    for (const e of queue) {
      if (!ruleCovers(s, rule, e.to) || !ruleTakes(s, rule, e) || (!rule.redirect && !prev(e))) continue;
      const k = recKey(e.to);
      per.set(k, { to: e.to, n: (per.get(k)?.n ?? 0) + e.n });
    }
    const total = [...per.values()].reduce((a, x) => a + x.n, 0);
    if (per.size < 2 || total <= rule.left) continue;
    const got = new Map([...per.keys()].map((k) => [k, 0]));
    const card = cardName(s, rule);
    for (let room = rule.left; room > 0; room--) {
      const open = [...per].filter(([k, x]) => x.n > got.get(k)!);
      if (open.length === 1) {
        const [k, x] = open[0]!;
        got.set(k, got.get(k)! + Math.min(room, x.n - got.get(k)!));
        break;
      }
      const ranked = open.sort((a, b) => allocPreference(s, b[1].to, b[1].n - got.get(b[0])!) - allocPreference(s, a[1].to, a[1].n - got.get(a[0])!));
      const i = choose({
        player: rule.controller,
        prompt: `${card}: ${rule.redirect ? "redirect" : "prevent"} 1 of the damage to which (${room} left)?`,
        labels: ranked.map(([k, x]) => `${nameOf(x.to)} (${x.n - got.get(k)!} damage)`),
      });
      if (i === null) return { ask, ops, final, used: next };
      const k = ranked[i]![0];
      got.set(k, got.get(k)! + 1);
    }
    alloc.set(rule.id, got);
  }
  for (let guard = 0; queue.length && guard < 200; guard++) {
    // The next permanent or player to handle: one whose shields send damage elsewhere first, so damage redirected to
    // another one arrives before that one's own shields are used; then in APNAP order (CR 616.1).
    const keys = [...new Set(queue.map((e) => recKey(e.to)))];
    const rank = (k: string) => {
      const r = queue.find((e) => recKey(e.to) === k)!.to;
      const redirects = shieldsOf(r, new Set()).some((x) => x.kind === "redirect") ? 0 : 1;
      return redirects * 100 + Math.max(0, order.indexOf(chooserOf(r)));
    };
    const key = keys.sort((a, b) => rank(a) - rank(b))[0]!;
    const here = queue.filter((e) => recKey(e.to) === key);
    queue = queue.filter((e) => recKey(e.to) !== key);
    const to = here[0]!.to;
    const toName = nameOf(to);
    let incoming: DamageEvent[] = [];
    for (const e of here) {
      // The Mindskinner's prevention can't prevent damage that can't be prevented, but its additional effect still
      // happens, once for each such effect (CR 615.12, 615.12a); the damage is dealt.
      if (!prev(e)) for (const r of allRules.filter((r) => r.mill && ruleCovers(s, r, to) && ruleTakes(s, r, e))) ops.push({ kind: "mill", by: r.controller, n: e.n * (r.millSelf ?? 1), card: cardName(s, r), ...(r.millSelf ? { self: true as const } : {}) });
      if (!prev(e)) for (const r of allRules.filter((r) => r.counterOn && ruleCovers(s, r, to) && ruleTakes(s, r, e))) ops.push({ kind: "counterOn", id: r.counterOn!.id, counter: r.counterOn!.kind, by: r.controller, card: cardName(s, r) });
      // Anti-Venom: "prevent that damage and put that many +1/+1 counters on ~": the counters even so (CR 615.12).
      const thatMany = !prev(e) && "object" in to ? characteristics(s, obj(s, to.object)).preventDamage?.find((p) => p.plusOnes && p.thatMany && p.to && (!p.combat || (p.combat === "only") === !!e.combat)) : undefined;
      if (thatMany && "object" in to) {
        const src = thatMany.from ? s.objects[thatMany.from] : undefined;
        ops.push({ kind: "plusOnes", id: to.object, n: e.n, by: thatMany.you!, card: src ? (s.cards[src.cardId]?.name ?? "") : "" });
      }
      // "Prevent all damage that would be dealt to / by ~" uses up no shield, so it's applied first (CR 615.1, 616.1).
      // One with an additional effect ("you gain life equal to the damage prevented this way") is the one picked.
      const rules = prev(e) ? allRules.filter((r) => preventsAll(r) && !(e.applied ?? []).includes(r.id) && ruleCovers(s, r, to) && ruleTakes(s, r, e)) : [];
      const rule = rules.find((r) => (r.gainLife && colorsOk(r.gainLife, e.src)) || (r.dealBack && colorsOk(r.dealBack, e.src)) || r.tokens || r.mill || r.counterOn || r.countersOn || r.dealTo) ?? (preventedAll(s, e) ? undefined : rules[0]);
      if (rule) {
        // The player being dealt it may apply amount replacements first (CR 616.1): when the prevention gains its
        // controller life or deals that much back, they're applied first when that's who chooses, as the most it can be.
        let n = e.n;
        const boost = allMods.filter((m) => !m.mod.prevent && modApplies(s, m, e, true));
        if ((rule.gainLife || rule.dealBack || rule.tokens || rule.countersOn || rule.dealTo) && boost.length && boost.length <= 6 && rule.controller === chooserOf(to))
          for (const order of permutations(boost)) n = Math.max(n, order.reduce((a, m) => (a > 0 ? modAmount(s, m, a) : 0), e.n));
        ops.push({ kind: "preventAll", srcName: e.src.name, toName, rule: rule.id, n, src: e.src, ...(rule.mill ? { card: cardName(s, rule) } : {}), ...toPlayer(to) });
        if (rule.mill) ops.push({ kind: "mill", by: rule.controller, n: n * (rule.millSelf ?? 1), card: cardName(s, rule), ...(rule.millSelf ? { self: true as const } : {}) });
        if (rule.counterOn) ops.push({ kind: "counterOn", id: rule.counterOn.id, counter: rule.counterOn.kind, by: rule.controller, card: cardName(s, rule) });
        continue;
      }
      if (prev(e) && preventedAll(s, e)) {
        // Vigor: a +1/+1 counter for each 1 damage prevented (CR 615.5). The creature's controller (the one choosing,
        // CR 616.1) applies the amount replacements first, as the most it can be.
        const vigor = "object" in to ? characteristics(s, obj(s, to.object)).preventDamage?.find((p) => p.plusOnes && p.to && (!p.combat || (p.combat === "only") === !!e.combat)) : undefined;
        if (vigor && "object" in to) {
          let n = e.n;
          const boost = allMods.filter((m) => !m.mod.prevent && modApplies(s, m, e, true));
          if (boost.length && boost.length <= 6 && vigor.you === chooserOf(to))
            for (const order of permutations(boost)) n = Math.max(n, order.reduce((a, m) => (a > 0 ? modAmount(s, m, a) : 0), e.n));
          const src = vigor.from ? s.objects[vigor.from] : undefined;
          ops.push({ kind: "preventAll", srcName: e.src.name, toName, plusOnes: { id: to.object, n, by: vigor.you!, card: src ? (s.cards[src.cardId]?.name ?? "") : "" } });
        } else {
          // Phyrexian Vindicator: "When damage is prevented this way, ..." (CR 603.12), about the damage as it would have
          // been dealt.
          const reflect = "object" in to ? characteristics(s, obj(s, to.object)).preventDamage?.find((p) => p.reflect && p.to && (!p.combat || (p.combat === "only") === !!e.combat)) : undefined;
          ops.push({ kind: "preventAll", srcName: e.src.name, toName, n: e.n, ...toPlayer(to), ...(reflect && "object" in to ? { reflect: { id: reflect.from!, n: e.n, by: reflect.you!, card: s.objects[reflect.from!] ? (s.cards[obj(s, reflect.from!).cardId]?.name ?? "") : "", body: reflect.reflect! } } : {}) });
        }
        continue;
      }
      if (prev(e) && "player" in to && playerProtectedFrom(s, to.player, e.src.controller, e.src)) {
        ops.push({ kind: "protection", srcName: e.src.name, toName, player: to.player, n: e.n });
        continue;
      }
      if (prev(e) && "object" in to && protectedFrom(characteristics(s, obj(s, to.object)).keywords, e.src, protectionHolder(s, obj(s, to.object)))) {
        ops.push({ kind: "protection", srcName: e.src.name, toName });
        continue;
      }
      if (prev(e) && "object" in to) {
        const left = counters.get(to.object) ?? obj(s, to.object).counters.shield ?? 0;
        if (left > 0) {
          counters.set(to.object, left - 1);
          ops.push({ kind: "shieldCounter", id: to.object, srcName: e.src.name });
          continue;
        }
      }
      incoming.push(e);
    }
    // Khârn the Betrayer (CR 615.5, 615.12): the damage dealt to it at the same time is prevented, and an opponent of its
    // controller's choice gains control of it, also when it can't be prevented (then the damage is dealt too). Applied
    // after the effects above, and once for damage dealt to it at the same time.
    const betrayer = "object" in to && incoming.length && abilitiesOf(s, obj(s, to.object)).betrayer ? obj(s, to.object) : undefined;
    if (betrayer) {
      const me = controllerOf(s, betrayer);
      const opps = turnOrderFrom(s, me).filter((p) => p !== me);
      if (opps.length) {
        // A bot gives it to the opponent with the most life (the first option).
        const ranked = [...opps].sort((a, b) => player(s, b).life - player(s, a).life);
        const i = choose({ player: me, prompt: `${toName}: which opponent gains control of it?`, labels: ranked.map((p) => player(s, p).name) });
        if (i === null) return { ask, ops, final, used: next };
        ops.push({ kind: "betrayer", id: betrayer.id, to: ranked[i]!, prevented: incoming.some(prev), toName });
        for (const e of incoming) if (prev(e)) ops.push({ kind: "preventAll", srcName: e.src.name, toName });
        incoming = incoming.filter((e) => !prev(e));
      }
    }
    // The same source's damage arriving by two routes is one amount to choose from.
    const merged = new Map<string, DamageEvent>();
    for (const e of incoming) {
      const k = `${srcKey(e.src)}|${(e.applied ?? []).join(",")}`;
      const m = merged.get(k);
      if (m) m.n += e.n;
      else merged.set(k, { ...e });
    }
    incoming = [...merged.values()];
    let shields = shieldsOf(to, new Set()).filter((x) => incoming.some((e) => takes(x, e)));
    const who = chooserOf(to);
    const left = incoming.map((e) => e.n);
    const total = () => left.reduce((a, b) => a + b, 0);
    // The damage amount replacements and prevention effects that change some of it (CR 614.1a, 615.1a), each applying
    // once to each source's damage (CR 614.5): `done` is what has already applied to it.
    const done = incoming.map((e) => new Set(e.applied ?? []));
    const modLive = (m: LiveMod, at: number[], seen: Set<string>[]) => incoming.some((e, i) => at[i]! > 0 && !seen[i]!.has(m.key) && modApplies(s, m, e, prev(e)));
    const applyMod = (m: LiveMod, at: number[], seen: Set<string>[], record = false) => {
      for (const [i, e] of incoming.entries()) {
        if (at[i]! <= 0 || seen[i]!.has(m.key) || !modApplies(s, m, e, prev(e))) continue;
        const before = at[i]!;
        at[i] = modAmount(s, m, before);
        seen[i]!.add(m.key);
        if (record) ops.push({ kind: "modify", srcName: e.src.name, toName, from: before, n: at[i]!, card: m.card, prevent: !!m.mod.prevent, ...(m.once ? { once: m.once } : {}), ...toPlayer(to) });
      }
    };
    // How much of the damage a shield takes from each source's: `pick` chooses one at a time, among the options in the
    // chooser's order of preference, while two or more sources' damage is left and it can't take it all.
    const allocate = (sh: PlanShield, at: number[], pick: (ranked: number[], room: number) => number | null): number[] | null => {
      const usable = (i: number) => at[i]! > 0 && takes(sh, incoming[i]!);
      const take = new Array<number>(incoming.length).fill(0);
      let room = Math.min(sh.cap, incoming.reduce((a, _, i) => a + (usable(i) ? at[i]! : 0), 0));
      while (room > 0) {
        const open = incoming.map((_, i) => i).filter(usable);
        const openTotal = open.reduce((a, i) => a + at[i]!, 0);
        if (room < openTotal && new Set(open.map((i) => srcKey(incoming[i]!.src))).size > 1) {
          const ranked = [...open].sort((a, b) => shieldPreference(s, sh, who, to, incoming[b]!) - shieldPreference(s, sh, who, to, incoming[a]!));
          const j = pick(ranked, room);
          if (j === null) return null;
          const i = ranked[j]!;
          at[i]! -= 1;
          take[i]! += 1;
          room -= 1;
          continue;
        }
        const i = open[0]!;
        const n = Math.min(room, at[i]!);
        at[i]! -= n;
        take[i]! += n;
        room -= n;
      }
      return take;
    };
    const askSource = (sh: PlanShield) => (ranked: number[], room: number): number | null => {
      const counts = new Map<string, number>();
      const labels = ranked.map((i) => {
        const nm = incoming[i]!.src.name;
        const dup = ranked.filter((j) => incoming[j]!.src.name === nm).length > 1;
        const k = (counts.get(nm) ?? 0) + 1;
        counts.set(nm, k);
        return `${nm}${dup ? ` #${k}` : ""} (${left[i]} damage)`;
      });
      const prompt =
        sh.kind === "prevent"
          ? `Prevent 1 damage to ${toName} (${room} of the shield left): from which source?`
          : `${sh.card}: deal 1 damage to ${nameOf(sh.to!)} instead of ${toName} (${room} left): from which source?`;
      return choose({ player: who, prompt, labels });
    };
    const commit = (sh: PlanShield, take: number[]) => {
      let used = 0;
      for (const [i, n] of take.entries()) {
        if (!n) continue;
        used += n;
        const e = incoming[i]!;
        if (sh.kind === "prevent") ops.push({ kind: "prevent", to, n, srcName: e.src.name, toName, ...(sh.rule ? { rule: sh.key, src: e.src, card: sh.card! } : {}) });
        else {
          ops.push({ kind: "redirect", to, shield: sh.key, n, srcName: e.src.name, fromName: toName, toName: nameOf(sh.to!), card: sh.card!, ...(sh.rule ? { rule: true } : {}) });
          queue.push({ ...e, to: sh.to!, n, applied: [...done[i]!, sh.key] });
        }
      }
      if (sh.rule) {
        // Shared by all it protects. "The next time" takes all of this damage event, wherever it's dealt (CR 615.8).
        ruleCap.set(sh.key, ruleCap.get(sh.key)! - used);
        const a = alloc.get(sh.key);
        if (a?.has(key)) a.set(key, a.get(key)! - used);
      } else if (sh.kind === "prevent") preventCap.set(sh.key, sh.cap - used);
      else redirectCap.set(sh.key, sh.cap - used);
    };
    const part = (x: PlanShield) => (x.cap === Infinity ? "it" : `${x.cap} of it`);
    const label = (x: PlanShield) => (x.kind === "prevent" ? `Prevent ${part(x)}${x.rule ? ` (${x.card})` : ""}` : `Deal ${part(x)} to ${nameOf(x.to!)} instead (${x.card})`);
    let paused = false;
    const mods = allMods.filter((m) => modLive(m, left, done));
    if (!mods.length) {
      while (shields.length && total() > 0 && !paused) {
        // Which shield applies next: it matters only when they can't all be used up and they do different things.
        const capSum = shields.reduce((a, x) => a + x.cap, 0);
        const same = (a: PlanShield, b: PlanShield) => a.kind === b.kind && (a.to ? recKey(a.to) : "") === (b.to ? recKey(b.to) : "");
        let sh = shields[0]!;
        if (capSum > total() && shields.some((x) => !same(x, sh))) {
          const opts = [...shields].sort((a, b) => (a.kind === "prevent" ? 0 : 1) - (b.kind === "prevent" ? 0 : 1));
          const i = choose({ player: who, prompt: `Damage to ${toName}: which shield applies first?`, labels: opts.map(label) });
          if (i === null) {
            paused = true;
            break;
          }
          sh = opts[i]!;
        }
        const take = allocate(sh, left, askSource(sh));
        if (!take) {
          paused = true;
          break;
        }
        commit(sh, take);
        shields = shields.filter((x) => x !== sh);
      }
    } else {
      // With amount replacements among them, the order matters in more ways (doubling before or after preventing some of
      // it, adding 2 before or after doubling, rulings on Furnace of Rath, Torbran and Ghosts of the Innocent), so every
      // order of what's left is worked out: the player is asked which applies next only when the orders don't all come
      // to the same thing (CR 616.1, 616.1f), and a bot takes the one that leaves it the least damage.
      type Opt = { shield: PlanShield } | { mod: LiveMod };
      let opts: Opt[] = [...shields.map((sh) => ({ shield: sh })), ...mods.map((m) => ({ mod: m }))];
      const live = (o: Opt, at: number[], seen: Set<string>[]) => ("mod" in o ? modLive(o.mod, at, seen) : incoming.some((e, i) => at[i]! > 0 && takes(o.shield, e)));
      const outcome = (order: Opt[]) => {
        const at = [...left];
        const seen = done.map((x) => new Set(x));
        const taken: number[][] = [];
        for (const o of order) {
          if ("mod" in o) applyMod(o.mod, at, seen);
          else taken.push(allocate(o.shield, at, () => 0)!);
        }
        const used = taken.reduce((a, t) => a + t.reduce((x, y) => x + y, 0), 0);
        return { key: JSON.stringify([at, taken]), score: at.reduce((a, n, i) => a + n * (1 + harm(incoming[i]!, to, who) / 100), 0) + used / 1000 };
      };
      while (total() > 0 && !paused) {
        opts = opts.filter((o) => live(o, left, done));
        if (!opts.length) break;
        let pick = opts[0]!;
        if (opts.length > 1) {
          let ranked = opts;
          let differ = true;
          if (opts.length <= 6) {
            const best = new Map<Opt, number>();
            const keys = new Set<string>();
            for (const order of permutations(opts)) {
              const r = outcome(order);
              keys.add(r.key);
              best.set(order[0]!, Math.min(best.get(order[0]!) ?? Infinity, r.score));
            }
            differ = keys.size > 1;
            ranked = [...opts].sort((a, b) => best.get(a)! - best.get(b)!);
          }
          if (differ) {
            const i = choose({ player: who, prompt: `Damage to ${toName}: which applies first?`, labels: ranked.map((o) => ("mod" in o ? modLabel(s, o.mod) : label(o.shield))) });
            if (i === null) {
              paused = true;
              break;
            }
            pick = ranked[i]!;
          }
        }
        if ("mod" in pick) applyMod(pick.mod, left, done, true);
        else {
          const take = allocate(pick.shield, left, askSource(pick.shield));
          if (!take) {
            paused = true;
            break;
          }
          commit(pick.shield, take);
        }
        const used = pick;
        opts = opts.filter((o) => o !== used);
      }
    }
    if (paused) return { ask, ops, final, used: next };
    for (const [i, e] of incoming.entries()) if (left[i]! > 0) final.push({ ...e, n: left[i]! });
  }
  if (ask) return { ask, ops, final, used: next };
  // One amount per source and permanent or player: damage redirected back to where it came from adds up.
  const out = new Map<string, DamageEvent>();
  for (const e of final) {
    const k = `${srcKey(e.src)}|${recKey(e.to)}`;
    const m = out.get(k);
    if (m) m.n += e.n;
    else out.set(k, { src: e.src, to: e.to, n: e.n, ...(e.combat ? { combat: true } : {}) });
  }
  return { ops, final: [...out.values()], used: next, rules: allRules };
}

/**
 * How much of `n` damage from a permanent to a permanent or player would be dealt if it were dealt now, for bots weighing
 * attacks and blocks: after the damage amount replacements and prevention it would meet (Furnace of Rath, Torbran, Dark
 * Sphere, Fog, protection, shields and shield counters, CR 614.1a, 615), each choice made the way a bot makes it.
 * Nothing changes.
 */
export function damageEstimate(s: GameState, from: GameObject, to: Rec, n: number, combat = true): number {
  if (n <= 0) return 0;
  const src = objectSource(s, from);
  const prev = canPreventDamage(s) && !unpreventable(src, combat);
  if (combat && s.preventCombatDamage && prev) return 0;
  const phantom = "object" in to && s.objects[to.object] ? abilitiesOf(s, obj(s, to.object)).phantom : undefined;
  if ("object" in to && prev && phantom && (phantom !== "whileCounter" || (obj(s, to.object).counters["+1/+1"] ?? 0) > 0)) return 0;
  if ("object" in to && prev && s.objects[to.object] && abilitiesOf(s, obj(s, to.object)).counterShield && (obj(s, to.object).counters["+1/+1"] ?? 0) > 0) return 0;
  const k = recKey(to);
  return planShields(s, [{ src, to, n, ...(combat ? { combat: true as const } : {}) }], [], true).final.filter((e) => recKey(e.to) === k).reduce((a, e) => a + e.n, 0);
}

/**
 * Is this damage stopped by a "prevent all damage that would be dealt to / by" effect (CR 615.1): one on the permanent
 * it would be dealt to, or on the permanent dealing it?
 */
function preventedAll(s: GameState, e: DamageEvent): boolean {
  const kind = (p: { combat?: "only" | "non" }) => !p.combat || (p.combat === "only") === !!e.combat;
  const from = e.src.id ? s.objects[e.src.id] : undefined;
  if (from?.zone === "battlefield" && characteristics(s, from).preventDamage?.some((p) => p.by && kind(p))) return true;
  if (!("object" in e.to)) return false;
  const to = obj(s, e.to.object);
  return !!characteristics(s, to).preventDamage?.some((p) => p.to && kind(p) && (!p.fromTypes || p.fromTypes.every((t) => e.src.types.includes(t))) && (!p.fromColors || p.fromColors.some((c) => (e.src.colors as string[]).includes(c))));
}

/** Which of the permanents and players a rule protects its controller would rather it took damage away from: a creature the damage would destroy first, then the player. */
function allocPreference(s: GameState, to: Rec, n: number): number {
  if ("player" in to) return 50;
  const o = obj(s, to.object);
  const c = characteristics(s, o);
  return c.types.includes("Creature") && o.damage + n >= c.toughness ? 100 + c.power : c.types.includes("Planeswalker") ? 40 : 10;
}

/**
 * How much the player choosing would like this shield to take this damage, for ordering the options. A prevention
 * shield is best spent on damage that does more than its amount (deathtouch, infect, wither, lifelink, a commander's
 * combat damage); a redirection is best spent on plain damage when it lands on our own creature, and on the worst
 * damage when it lands on someone else's.
 */
/** How much worse than plain damage this damage is where it lands: deathtouch, infect, wither, a commander's combat damage, an opponent's lifelink. */
function harm(e: DamageEvent, r: Rec, who: PlayerId): number {
  const kw = (k: string) => e.src.keywords.some((x) => x.toLowerCase() === k);
  return ("object" in r ? (kw("deathtouch") ? 100 : 0) + (kw("infect") || kw("wither") ? 50 : 0) : (kw("infect") ? 50 : 0) + (e.combat && e.src.commanderId ? 20 : 0)) + (kw("lifelink") && e.src.controller !== who ? 10 : 0);
}

function shieldPreference(s: GameState, sh: PlanShield, who: PlayerId, to: Rec, e: DamageEvent): number {
  const nasty = (r: Rec) => harm(e, r, who);
  if (sh.kind === "prevent") return nasty(to) * 10 + e.n;
  const dest = sh.to!;
  const ours = "object" in dest ? controllerOf(s, obj(s, dest.object)) === who : dest.player === who;
  return (ours ? -nasty(dest) : nasty(dest)) * 10 + e.n;
}

/** A damage rule's "~ deals that much damage to that source's controller", dealt once the damage is (CR 615.5). */
interface DealBack {
  cardId: string;
  controller: PlayerId;
  to: PlayerId;
  n: number;
  /** Comeuppance: to the creature that was the source instead, while it's still that permanent (CR 400.7). */
  toObject?: { object: ObjectId; zc: number };
}

/** Where a rule's "deals that much damage" goes for damage from `src` (Comeuppance: a creature source itself). */
const backTo = (r: DamageRule, src: DamageSource, n: number): DealBack => ({
  cardId: r.cardId,
  controller: r.controller,
  to: src.controller,
  n,
  ...(r.dealBack?.creatureToIt && src.types.includes("Creature") && src.ref ? { toObject: src.ref } : {}),
});

/**
 * Make the plan's changes: use up the shields and counters, and say what happened. Damage rules' additional effects
 * happen right after the prevention (CR 615.5): life gained now, damage dealt back returned for after the damage.
 */
function commitShields(s: GameState, plan: ShieldPlan): DealBack[] {
  const back: DealBack[] = [];
  // "Whenever damage that would be dealt to you is prevented" (Selfless Squire): how much was prevented for each player.
  const preventedTo = new Map<PlayerId, number>();
  const prevented = (pid: PlayerId | undefined, n: number | undefined) => {
    if (pid !== undefined && n && n > 0) preventedTo.set(pid, (preventedTo.get(pid) ?? 0) + n);
  };
  const used = new Set<string>();
  const usedMods = new Set<string>();
  // Life gained from each rule's prevention of damage dealt at the same time is one life-gain event (CR 119.10).
  const gains = new Map<string, { pid: PlayerId; n: number }>();
  const gainLater = (r: DamageRule, n: number, src: DamageSource) => {
    if (colorsOk(r.gainLife, src)) gains.set(r.id, { pid: r.controller, n: (gains.get(r.id)?.n ?? 0) + n });
    if (r.tokens) madeLater.set(r.id, { r, n: (madeLater.get(r.id)?.n ?? 0) + n });
    // Temper: "For each 1 damage prevented this way, put a +1/+1 counter on that creature", at the same time (rulings);
    // Sacred Boon's end step counters count it up for then.
    if (r.countersOn?.tally) (s.preventedTally ??= {})[r.id] = (s.preventedTally?.[r.id] ?? 0) + n;
    else if (r.countersOn && r.to?.object) ruleCountersLater.push({ ...r.to.object, counter: r.countersOn.counter, n, by: r.controller, card: cardName(s, r) });
    // Vengeful Archon deals that much damage to the target fixed as it resolved, right after (rulings).
    if (r.dealTo) back.push({ cardId: r.cardId, controller: r.controller, to: "player" in r.dealTo ? r.dealTo.player : r.controller, n, ...("object" in r.dealTo ? { toObject: r.dealTo } : {}) });
  };
  const ruleCountersLater: { id: ObjectId; zc: number; counter: string; n: number; by: PlayerId; card: string }[] = [];
  // Vigor's +1/+1 counters, put once the damage is prevented.
  const plusOnesLater: { id: ObjectId; n: number; by: PlayerId }[] = [];
  const countersLater: { id: ObjectId; counter: string; by: PlayerId; card: string }[] = [];
  // Phyrexian Vindicator's reflexive triggers: one for each source permanent in this damage event, with all it prevented.
  const reflectLater = new Map<ObjectId, { n: number; by: PlayerId; body: AbilityBody }>();
  // Inkshield's tokens, one for each 1 damage each rule prevented, created together once the damage is prevented.
  const madeLater = new Map<string, { r: DamageRule; n: number }>();
  const ruleById = (id: string) => s.damageRules?.find((x) => x.id === id) ?? plan.rules?.find((x) => x.id === id);
  const ruleUsed = (id: string, n: number, src?: DamageSource, prevented = false) => {
    const r = ruleById(id);
    if (!r) return;
    if (r.left !== undefined) r.left -= n;
    if (r.nextTime) used.add(r.id);
    if (!prevented || !src) return;
    gainLater(r, n, src);
    if (colorsOk(r.dealBack, src)) back.push(backTo(r, src, n));
  };
  for (const op of plan.ops) {
    if (op.kind === "protection" || op.kind === "preventAll") prevented(op.player, op.n);
    else if (op.kind === "modify" && op.prevent) prevented(op.player, op.from - op.n);
    else if (op.kind === "prevent" && "player" in op.to) prevented(op.to.player, op.n);
    if (op.kind === "protection") log(s, `Damage from ${op.srcName} to ${op.toName} is prevented (protection).`);
    else if (op.kind === "preventAll") {
      const r = op.rule ? ruleById(op.rule) : undefined;
      log(s, `Damage from ${op.srcName} to ${op.toName} is prevented${r ? ` (${cardName(s, r)})` : op.card ? ` (${op.card})` : op.plusOnes?.card ? ` (${op.plusOnes.card})` : ""}.`);
      if (op.plusOnes) plusOnesLater.push(op.plusOnes);
      if (op.reflect && op.reflect.n > 0) reflectLater.set(op.reflect.id, { n: (reflectLater.get(op.reflect.id)?.n ?? 0) + op.reflect.n, by: op.reflect.by, body: op.reflect.body });
      if (r && op.n && op.src) {
        gainLater(r, op.n, op.src);
        if (colorsOk(r.dealBack, op.src)) back.push(backTo(r, op.src, op.n));
      }
    } else if (op.kind === "shieldCounter") useShieldCounter(s, obj(s, op.id), `${op.srcName} dealing damage to it`);
    else if (op.kind === "modify") {
      if (op.once) usedMods.add(op.once);
      if (op.prevent) log(s, `${op.from - op.n} damage from ${op.srcName} to ${op.toName} is prevented (${op.card}).`);
      else log(s, `${op.card}: ${op.srcName} deals ${op.n} damage to ${op.toName} instead of ${op.from}.`);
    } else if (op.kind === "mill") {
      for (const pid of op.self ? (player(s, op.by).lost ? [] : [op.by]) : turnOrderFrom(s, s.activePlayer).filter((q) => q !== op.by && !player(s, q).lost)) {
        const p = player(s, pid);
        const n = millCount(s, pid, op.n);
        for (const id of p.library.slice(0, n)) moveObject(s, id, "graveyard", { milled: true });
        log(s, `${p.name} mills ${n} card${n === 1 ? "" : "s"} (${op.card}).`);
      }
    } else if (op.kind === "counterOn") countersLater.push(op);
    else if (op.kind === "plusOnes") {
      log(s, `${op.card}: damage that can't be prevented is dealt, and the +1/+1 counters are put on it too.`);
      plusOnesLater.push(op);
    } else if (op.kind === "betrayer") {
      // A new controller each time it applies, each one noticed (rulings: the ability triggers once each time).
      const o = obj(s, op.id);
      if (o.zone !== "battlefield") continue;
      syncControl(s);
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: op.to, sourceName: op.toName, duration: "game", affected: [o.id], mods: [{ kind: "control" }] });
      invalidateCharacteristics(s);
      log(s, `${player(s, op.to).name} gains control of ${op.toName}.`);
      syncControl(s);
    }
    else if (op.kind === "prevent" && op.rule) {
      const r = ruleById(op.rule);
      log(s, `${op.n} damage from ${op.srcName} to ${op.toName} is prevented${r ? ` (${cardName(s, r)})` : op.card ? ` (${op.card})` : ""}.`);
      ruleUsed(op.rule, op.n, op.src, true);
    } else if (op.kind === "redirect" && op.rule) {
      log(s, `${op.n} damage from ${op.srcName} to ${op.fromName} is dealt to ${op.toName} instead (${op.card}).`);
      ruleUsed(op.shield, op.n);
    } else if (op.kind === "prevent") {
      const h = "object" in op.to ? obj(s, op.to.object) : player(s, op.to.player);
      h.preventNext = Math.max(0, (h.preventNext ?? 0) - op.n);
      log(s, `${op.n} damage from ${op.srcName} to ${op.toName} is prevented.`);
    } else {
      const h = "object" in op.to ? obj(s, op.to.object) : player(s, op.to.player);
      const sh = h.redirectNext?.find((x) => x.id === op.shield);
      if (sh) sh.n -= op.n;
      h.redirectNext = h.redirectNext?.filter((x) => x.n > 0);
      if (!h.redirectNext?.length) h.redirectNext = undefined;
      log(s, `${op.n} damage from ${op.srcName} to ${op.fromName} is dealt to ${op.toName} instead (${op.card}).`);
    }
  }
  for (const { pid, n } of gains.values()) if (n > 0) gainLife(s, pid, n);
  for (const { id, n, by } of plusOnesLater) {
    const o = obj(s, id);
    if (n > 0 && o.zone === "battlefield") withPutter(by, () => putCounters(s, o, "+1/+1", n));
  }
  if (plusOnesLater.length) invalidateCharacteristics(s);
  for (const { id, counter, by, card } of countersLater) {
    const o = s.objects[id];
    if (!o || o.zone !== "battlefield") continue;
    const n = withPutter(by, () => putCounters(s, o, counter, 1));
    if (n > 0) log(s, `${card} gets ${n === 1 ? `${/^[aeiou]/.test(counter) ? "an" : "a"} ${counter}` : `${n} ${counter}`} counter${n === 1 ? "" : "s"}.`);
  }
  if (countersLater.length) invalidateCharacteristics(s);
  for (const { id, zc, counter, n, by, card } of ruleCountersLater) {
    // On that creature only while it's still the same object (CR 400.7).
    const o = s.objects[id];
    if (n <= 0 || !o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== zc) continue;
    const put = withPutter(by, () => putCounters(s, o, counter, n));
    if (put > 0) log(s, `${card}: ${defOf(s, o).name} gets ${put === 1 ? `${/^[aeiou]/.test(counter) ? "an" : "a"} ${counter}` : `${put} ${counter}`} counter${put === 1 ? "" : "s"}.`);
  }
  if (ruleCountersLater.length) invalidateCharacteristics(s);
  for (const [id, { n, by, body }] of reflectLater) {
    const o = s.objects[id];
    if (!o) continue;
    s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(o), controller: by, index: -1, body, sourceZc: o.zoneChanges ?? 0, event: { amount: n } });
  }
  if (madeLater.size)
    enterTogether(s, () => {
      for (const { r, n } of madeLater.values()) {
        if (n <= 0 || player(s, r.controller).lost) continue;
        const batch = tokenBatch(s, r.controller, r.tokens!, n);
        for (let i = 0; i < batch.same; i++) createToken(s, r.controller, r.tokens!);
        log(s, `${player(s, r.controller).name} creates ${batch.same} ${r.tokens!.name} token${batch.same === 1 ? "" : "s"} (${cardName(s, r)}).`);
        createExtraTokens(s, r.controller, batch.extra);
      }
    });
  for (const [pid, amount] of preventedTo) fireEvent(s, { type: "damagePreventedToPlayer", player: pid, amount });
  if (usedMods.size && s.damageMods) {
    s.damageMods = s.damageMods.filter((r) => !usedMods.has(r.id));
    if (!s.damageMods.length) s.damageMods = undefined;
  }
  // Used up: "the next time" once it has applied, "the next N" at 0 (CR 615.7-8).
  if (s.damageRules) {
    s.damageRules = s.damageRules.filter((r) => !used.has(r.id) && (r.left === undefined || r.left > 0));
    if (!s.damageRules.length) s.damageRules = undefined;
  }
  return back;
}

/** The damage each player is being dealt by the damage dealtPlanned is dealing now, all at the same time. */
let playerBatch: Map<PlayerId, number> | null = null;
/** The "deals damage to a creature" events of the damage dealPlanned is dealing now, fired once it's all dealt. */
let creatureBatch: Extract<Parameters<typeof fireEvent>[1], { type: "damagedCreature" }>[] | null = null;

/** The excess damage `id`, as the object it is now, has been dealt this turn (CR 120.10). */
export const excessThisTurn = (s: GameState, id: ObjectId, zc: number) => (s.turnLog?.excessDealt ?? []).reduce((a, e) => a + (e.id === id && e.zc === zc ? e.amount : 0), 0);

/**
 * The players' answers about the shields of damage dealt while a spell or ability resolves (see resolve.ts
 * runAsking): the damage effect is run again from the start once each answer is in, with `used` of them taken so far.
 * Null elsewhere: the choices are made the way a bot makes them.
 */
let shieldAnswers: { answers: number[]; used: number; ask?: ShieldQuestion } | null = null;

/** Thrown out of a resolving damage effect that needs a player's answer about its damage's shields (CR 616.1). */
export class ShieldQuestionPause extends Error {}

/** Run `fn` with these answers for the shield questions of the damage it deals; null runs it without asking. */
export function withShieldAnswers<T>(answers: number[] | null, fn: (asked: () => ShieldQuestion | undefined) => T): T {
  const outer = shieldAnswers;
  const mine: typeof shieldAnswers = answers ? { answers, used: 0 } : null;
  shieldAnswers = mine;
  try {
    return fn(() => mine?.ask);
  } finally {
    shieldAnswers = outer;
  }
}

/**
 * Could damage dealt now meet a choice about its shields (CR 616.1)? Only then does a resolving damage effect need to
 * be able to stop and ask (resolve.ts). Cheap: anything that could make planShields ask.
 */
export function shieldChoicesPossible(s: GameState): boolean {
  if (live(s).length || liveMods(s).length) return true;
  if (s.turnOrder.some((p) => player(s, p).preventNext || player(s, p).redirectNext?.length)) return true;
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    const a = abilitiesOf(s, o);
    return !!(o.preventNext || o.redirectNext?.length || a.damageToYouRedirect || a.preventCombatFromEach !== undefined || a.betrayer || a.damageToOpponentsMills || a.damageToYouMillsTwice || a.preventToYou || a.preventToYouCounter || a.preventToSelfCounters);
  });
}

/**
 * The plan for damage dealt at the same time: inside a resolution that can stop to ask (withShieldAnswers), the
 * players' own choices among the shields (CR 616.1), else the way a bot would choose.
 */
export function planDamage(s: GameState, events: DamageEvent[]): ShieldPlan {
  const ask = shieldAnswers;
  if (!ask) return planShields(s, events, [], true);
  const plan = planShields(s, events, ask.answers.slice(ask.used));
  if (plan.ask) {
    ask.ask = plan.ask;
    throw new ShieldQuestionPause(plan.ask.prompt);
  }
  ask.used += plan.used ?? 0;
  return plan;
}

/**
 * Deal damage that happens at the same time, after its shields (see planShields and planDamage). Returns what each
 * source dealt to each permanent or player.
 */
export function dealDamageBatch(s: GameState, events: DamageEvent[], opts: { lifelink?: { n: number } } = {}): (DamageEvent & { dealt: number })[] {
  return dealPlanned(s, planDamage(s, events), opts);
}

/** Commit a finished plan and deal its damage. `lifelink`: add the life up for the caller instead of gaining it per event. */
export function dealPlanned(s: GameState, plan: ShieldPlan, opts: { lifelink?: { n: number } | ((e: DamageEvent) => { n: number }) } = {}): (DamageEvent & { dealt: number })[] {
  const back = commitShields(s, plan);
  const witherCounters = new Map<string, number>();
  // What would be lethal for each permanent just before (CR 120.10): from a source with deathtouch, any 1 damage is
  // (CR 120.4a, rulings on Aegar).
  const lethal = new Map<ObjectId, number[]>();
  for (const e of plan.final) {
    if (!("object" in e.to) || lethal.has(e.to.object)) continue;
    const o = obj(s, e.to.object);
    const id = o.id;
    const dt = plan.final.find((x) => "object" in x.to && x.to.object === id && x.n > 0 && has(x.src, "Deathtouch"));
    if (o.zone === "battlefield") lethal.set(id, lethalAmounts(s, dt?.src ?? e.src, o));
  }
  const outer = playerBatch;
  playerBatch = new Map();
  const outerCreatures = creatureBatch;
  creatureBatch = [];
  // Poison counters from several sources at once are put as one event (rulings on All Will Be One).
  const out = batchPlayerCounters(s, () =>
    simultaneousLifeLoss(s, () => plan.final.map((e) => {
      const lifelink = typeof opts.lifelink === "function" ? opts.lifelink(e) : opts.lifelink;
      const o = "object" in e.to ? obj(s, e.to.object) : undefined;
      const to = o ? { object: o } : { player: (e.to as { player: PlayerId }).player };
      const dealt = o && o.zone !== "battlefield" ? 0 : dealDamage(s, e.src, to, e.n, { combat: e.combat, lifelink, shielded: true, witherCounters });
      return { ...e, dealt };
    })),
  );
  for (const [key, n] of witherCounters) {
    const [id, by] = key.split("|") as [ObjectId, PlayerId];
    const o = obj(s, id);
    if (o.zone === "battlefield") withPutter(by, () => putCounters(s, o, "-1/-1", n));
  }
  if (witherCounters.size) invalidateCharacteristics(s);
  // "Whenever ~ is dealt damage": the damage dealt to a permanent at the same time is one event (rulings).
  const dealtTo = new Map<ObjectId, number>();
  for (const e of out) if ("object" in e.to && e.dealt > 0) dealtTo.set(e.to.object, (dealtTo.get(e.to.object) ?? 0) + e.dealt);
  // Excess damage: what all the sources together dealt it beyond lethal (CR 120.10), as the permanent was then.
  const combat = !!plan.final[0]?.combat;
  const hits: { id: ObjectId; amount: number; controller: PlayerId }[] = [];
  for (const [id, n] of dealtTo) {
    const amount = excessOver(lethal.get(id) ?? [], n);
    const o = obj(s, id);
    if (!amount || !lethal.has(id) || o.zone !== "battlefield") continue;
    const controller = controllerOf(s, o);
    ((s.turnLog ??= {}).excessDealt ??= []).push({ id, zc: o.zoneChanges ?? 0, controller, types: [...characteristics(s, o).types], amount, ...(combat ? { combat: true as const } : {}) });
    hits.push({ id, amount, controller });
  }
  if (hits.length) fireEvent(s, { type: "excessDamage", hits, combat });
  const toCreatures = creatureBatch;
  creatureBatch = outerCreatures;
  for (const ev of toCreatures) fireEvent(s, { ...ev, excess: excessThisTurn(s, ev.id, s.objects[ev.id]?.zoneChanges ?? 0) });
  for (const [id, amount] of dealtTo) {
    // Each permanent's damage events this turn: damage dealt at the same time is one event (CR 120.3).
    const key = `${id}@${s.objects[id]?.zoneChanges ?? 0}`;
    const times = ((s.turnLog ??= {}).timesDealtDamage ??= {});
    times[key] = (times[key] ?? 0) + 1;
    fireEvent(s, { type: "wasDealtDamage", id, amount, ...(combat ? { combat: true as const } : {}) });
  }
  // "Whenever a source deals damage to ~": each source's damage to it, apart (Phyrexian Obliterator).
  const bySource = new Map<ObjectId, Map<DamageSource, number>>();
  for (const e of out) {
    if (!("object" in e.to) || e.dealt <= 0) continue;
    const m = bySource.get(e.to.object) ?? new Map<DamageSource, number>();
    m.set(e.src, (m.get(e.src) ?? 0) + e.dealt);
    bySource.set(e.to.object, m);
  }
  for (const [id, m] of bySource) for (const [src, amount] of m) fireEvent(s, { type: "dealtDamageBySource", id, amount, by: src.controller, ...(src.id ? { srcId: src.id } : {}), ...(combat ? { combat: true as const } : {}), ...(src.id && src.types.includes("Creature") ? { creature: true as const } : {}) });
  const toPlayers = playerBatch;
  playerBatch = outer;
  for (const [pid, amount] of toPlayers) fireEvent(s, { type: "playerDealtDamage", player: pid, amount, combat });
  firePlayersDealt(s, out);
  // "If damage is prevented this way, ~ deals that much damage to that source's controller" (Deflecting Palm), after it.
  for (const b of back) {
    const d = s.cards[b.cardId];
    if (!d) continue;
    if (b.toObject) {
      // Comeuppance deals it, not the creature (rulings): only if the creature is still that permanent (CR 400.7).
      const o = s.objects[b.toObject.object];
      if (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === b.toObject.zc) dealDamage(s, cardSource(d, b.controller), { object: o }, b.n);
    } else if (!player(s, b.to).lost) {
      const src = cardSource(d, b.controller);
      firePlayersDealt(s, [{ src, to: { player: b.to }, dealt: dealDamage(s, src, { player: b.to }, b.n) }]);
    }
  }
  return out;
}

/** "Whenever one or more Pirates you control deal damage to your opponents": the damage to players dealt at once. */
function firePlayersDealt(s: GameState, out: { src: DamageSource; to: DamageEvent["to"]; dealt: number; combat?: boolean }[]) {
  const hits = out.flatMap((e) => ("player" in e.to && e.dealt > 0 ? [{ player: e.to.player, by: e.src.controller, amount: e.dealt, ...(e.src.id && !e.src.spell ? { source: e.src.id } : {}), types: e.src.types, subtypes: e.src.subtypes, ...(e.combat ? { combat: true as const } : {}) }] : []));
  if (hits.length) fireEvent(s, { type: "playersDealtDamage", hits });
}

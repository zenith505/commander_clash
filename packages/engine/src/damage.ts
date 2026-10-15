// Dealing damage (CR 120), in one place so every way of dealing it (combat, spells,
// abilities, fight) gets the same results: prevention effects stop it (CR 615: Fog, prevention
// shields, and protection, CR 702.16e), infect
// and wither turn it into -1/-1 counters (CR 702.90c, 702.80a), infect turns damage to a
// player into poison counters (CR 702.90b), toxic adds poison (CR 702.164c), and
// deathtouch and lifelink apply (CR 702.2, 702.15).

import { abilitiesOf } from "./cards";
import { gainLife, log, loseLife, player, useShieldCounter } from "./game";
import { protectedFrom, toxicValue } from "./keywords";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import type { CardDef, Color, GameObject, GameState, ObjectId, PlayerId } from "./types";

/** What a damage source looks like as it deals damage. */
export interface DamageSource {
  name: string;
  controller: PlayerId;
  colors: Color[];
  /** Card types and subtypes, for protection from artifacts, creatures, Goblins (CR 702.16a). */
  types: readonly string[];
  subtypes: readonly string[];
  keywords: string[];
  /** A commander dealing combat damage counts toward commander damage (CR 903.10a). */
  commanderId?: ObjectId;
  /** The permanent dealing it, for "whenever ~ deals damage" (not set for a spell). */
  id?: ObjectId;
}

/**
 * A permanent (or a card that just left the battlefield) as a damage source: its current
 * characteristics on the battlefield, its last known ones otherwise (CR 702.90d, 702.80b).
 */
export function objectSource(s: GameState, o: GameObject): DamageSource {
  const c = characteristics(s, o);
  return { name: c.name, controller: controllerOf(s, o), colors: c.colors, types: c.types, subtypes: c.subtypes, keywords: c.keywords, id: o.id, ...(o.isCommander ? { commanderId: o.id } : {}) };
}

/** A spell, or an ability whose source is gone: the card's printed characteristics. */
export const cardSource = (d: CardDef, controller: PlayerId): DamageSource => ({ name: d.name, controller, colors: d.colors, types: d.types, subtypes: d.subtypes, keywords: d.keywords });

const has = (src: DamageSource, k: string) => src.keywords.some((x) => x.toLowerCase() === k.toLowerCase());

export { protectedFrom };

/**
 * Deal `n` damage from `src` to a permanent or player. Returns how much was dealt (0 if it
 * was all prevented). Combat damage also counts for commander damage and toxic.
 *
 * Lifelink makes the source's controller gain that much life (CR 702.15b). Damage a source deals
 * to several things at once is one life-gain event (CR 119.10), so callers dealing it that way
 * pass `lifelink` to add the life up and gain it once themselves.
 */
export function dealDamage(
  s: GameState,
  src: DamageSource,
  to: { object: GameObject } | { player: PlayerId },
  n: number,
  opts: { combat?: boolean; lifelink?: { n: number } } = {},
): number {
  if (n <= 0) return 0;
  // Prevention effects (CR 615). Protection doesn't use up a shield, so it's applied first
  // (the affected player would choose that order, CR 616.1).
  if (opts.combat && s.preventCombatDamage) return 0;
  const shielded = "object" in to ? to.object : player(s, to.player);
  const targetName = "object" in to ? characteristics(s, to.object).name : player(s, to.player).name;
  if ("object" in to && protectedFrom(characteristics(s, to.object).keywords, src)) {
    log(s, `Damage from ${src.name} to ${targetName} is prevented (protection).`);
    return 0;
  }
  // A shield counter replaces the damage, even damage that can't be prevented (CR 122.1c).
  if ("object" in to && useShieldCounter(s, to.object, `${src.name} dealing damage to it`)) return 0;
  if (shielded.preventNext) {
    const stopped = Math.min(shielded.preventNext, n);
    shielded.preventNext -= stopped;
    n -= stopped;
    log(s, `${stopped} damage from ${src.name} to ${targetName} is prevented.`);
    if (n <= 0) return 0;
  }
  // The Phantom creatures: prevent it all and remove a +1/+1 counter (CR 615). Damage dealt at the same time by
  // several sources (combat) removes only one counter; with none on it, the damage is still prevented (rulings).
  if ("object" in to && abilitiesOf(s, to.object).phantom) {
    const o = to.object;
    const event = opts.combat ? `${s.turn}:${s.step}` : undefined;
    log(s, `Damage from ${src.name} to ${targetName} is prevented.`);
    if (!event || o.phantomEvent !== event) {
      if (o.counters["+1/+1"]) {
        o.counters["+1/+1"] -= 1;
        if (!o.counters["+1/+1"]) delete o.counters["+1/+1"];
        invalidateCharacteristics(s);
        log(s, `A +1/+1 counter is removed from ${targetName}.`);
      }
      o.phantomEvent = event;
    }
    return 0;
  }
  if ("object" in to) {
    const o = to.object;
    const c = characteristics(s, o);
    // Infect and wither: -1/-1 counters instead of marked damage, but it's still damage dealt.
    if (has(src, "Infect") || has(src, "Wither")) {
      o.counters["-1/-1"] = (o.counters["-1/-1"] ?? 0) + n;
      invalidateCharacteristics(s);
      log(s, `${src.name} deals ${n} damage to ${c.name} (as -1/-1 counters).`);
    } else {
      o.damage += n;
      log(s, `${src.name} deals ${n} damage to ${c.name}.`);
    }
    if (has(src, "Deathtouch")) o.deathtouchDamage = true;
    if (src.id && !o.damagedBy?.includes(src.id)) (o.damagedBy ??= []).push(src.id);
  } else {
    const p = player(s, to.player);
    if (has(src, "Infect")) {
      p.poison = (p.poison ?? 0) + n;
      log(s, `${src.name} deals ${n} damage to ${p.name} (${n} poison counter${n === 1 ? "" : "s"}).`);
    } else {
      loseLife(s, p.id, n);
      log(s, `${src.name} deals ${n} damage to ${p.name}.`);
    }
    if (!(s.damagedThisTurn ??= []).includes(p.id)) s.damagedThisTurn.push(p.id);
    if (opts.combat) {
      if (src.commanderId) p.commanderDamage[src.commanderId] = (p.commanderDamage[src.commanderId] ?? 0) + n;
      const toxic = toxicValue(src.keywords);
      if (toxic > 0) {
        p.poison = (p.poison ?? 0) + toxic;
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

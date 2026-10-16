// Dealing damage (CR 120), in one place so every way of dealing it (combat, spells,
// abilities, fight) gets the same results: prevention effects stop it (CR 615: Fog, prevention
// shields, and protection, CR 702.16e), infect
// and wither turn it into -1/-1 counters (CR 702.90c, 702.80a), infect turns damage to a
// player into poison counters (CR 702.90b), toxic adds poison (CR 702.164c), and
// deathtouch and lifelink apply (CR 702.2, 702.15).

import { abilitiesOf } from "./cards";
import { evalAmount } from "./amounts";
import { putCounters } from "./counters";
import { fireEvent } from "./effects";
import { objectMatches, playerProtectedFrom } from "./effects/targeting";
import { canPreventDamage, gainLife, log, loseLife, obj, player, turnOrderFrom, useShieldCounter } from "./game";
import { protectedFrom, toxicValue } from "./keywords";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import type { CardDef, Color, DamageRule, GameObject, GameState, ObjectId, PlayerId, RedirectShield } from "./types";
import type { TargetSpec } from "./abilities";

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
  /**
   * The object dealing it, as the object it is (CR 400.7): a permanent, a spell, or a gone permanent whose ability deals
   * it, as it last existed. For a source chosen earlier (CR 609.7a).
   */
  ref?: { object: ObjectId; zc: number };
}

/**
 * A permanent (or a card that just left the battlefield) as a damage source: its current
 * characteristics on the battlefield, its last known ones otherwise (CR 702.90d, 702.80b).
 */
export function objectSource(s: GameState, o: GameObject): DamageSource {
  const c = characteristics(s, o);
  const zc = o.zone === "battlefield" ? (o.zoneChanges ?? 0) : (s.lastKnown?.[o.id]?.zc ?? o.zoneChanges ?? 0);
  return { name: c.name, controller: controllerOf(s, o), colors: c.colors, types: c.types, subtypes: c.subtypes, keywords: c.keywords, id: o.id, ref: { object: o.id, zc }, ...(o.isCommander ? { commanderId: o.id } : {}) };
}

/** A spell, or an ability whose source is gone: the card's printed characteristics. */
export const cardSource = (d: CardDef, controller: PlayerId, ref?: DamageSource["ref"]): DamageSource => ({ name: d.name, controller, colors: d.colors, types: d.types, subtypes: d.subtypes, keywords: d.keywords, ...(ref ? { ref } : {}) });

const has = (src: DamageSource, k: string) => src.keywords.some((x) => x.toLowerCase() === k.toLowerCase());

export { protectedFrom };

/** Who has a permanent's protection, for protection from a player (CR 702.16k): its controller and its chosen player. */
export const protectionHolder = (s: GameState, o: GameObject) => ({ controller: controllerOf(s, o), ...(o.chosen?.player !== undefined ? { chosenPlayer: o.chosen.player } : {}) });

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
export function dealDamage(
  s: GameState,
  src: DamageSource,
  to: { object: GameObject } | { player: PlayerId },
  n: number,
  opts: { combat?: boolean; lifelink?: { n: number }; shielded?: boolean; witherCounters?: Map<ObjectId, number> } = {},
): number {
  if (n <= 0) return 0;
  if (opts.combat && s.preventCombatDamage && canPreventDamage(s)) return 0;
  if (!opts.shielded) {
    const ev: DamageEvent = { src, to: "object" in to ? { object: to.object.id } : { player: to.player }, n, ...(opts.combat ? { combat: true } : {}) };
    return dealDamageBatch(s, [ev], { lifelink: opts.lifelink }).reduce((a, e) => a + e.dealt, 0);
  }
  const targetName = "object" in to ? characteristics(s, to.object).name : player(s, to.player).name;
  // The Phantom creatures: prevent it all and remove a +1/+1 counter (CR 615). Damage dealt at the same time by
  // several sources (combat) removes only one counter; with none on it, the damage is still prevented (rulings).
  if ("object" in to && abilitiesOf(s, to.object).phantom && canPreventDamage(s)) {
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
  // Case of the Burning Masks: each source once, as the object it was (CR 400.7), under its controller as it dealt damage.
  const key = src.ref ? `${src.ref.object}@${src.ref.zc}` : src.name;
  const sources = (((s.turnLog ??= {}).damageSources ??= {})[src.controller] ??= []);
  if (!sources.includes(key)) sources.push(key);
  if ("object" in to) {
    const o = to.object;
    const c = characteristics(s, o);
    const walker = c.types.includes("Planeswalker");
    // Damage to a planeswalker removes that many loyalty counters (CR 120.3c, 306.8); one that's also a creature is
    // dealt damage as a creature too (CR 120.3d-e).
    if (walker) {
      const removed = Math.min(n, o.counters.loyalty ?? 0);
      if (removed) o.counters.loyalty = (o.counters.loyalty ?? 0) - removed;
      invalidateCharacteristics(s);
      log(s, `${src.name} deals ${n} damage to ${c.name} (${removed} loyalty removed).`);
    }
    if (!walker || c.types.includes("Creature")) {
      if (has(src, "Infect") || has(src, "Wither")) {
        // Infect and wither: -1/-1 counters instead of marked damage, but it's still damage dealt. They're put on with
        // the rest of the damage dealt at the same time, as one event for replacement effects (Vizier of Remedies rulings).
        if (opts.witherCounters) opts.witherCounters.set(o.id, (opts.witherCounters.get(o.id) ?? 0) + n);
        else putCounters(s, o, "-1/-1", n);
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
    // "Whenever ~ deals damage to a creature" (combat damage is all dealt before any of it triggers anything).
    if (src.id && c.types.includes("Creature")) fireEvent(s, { type: "damagedCreature", source: src.id, id: o.id, amount: n, combat: !!opts.combat });
  } else {
    const p = player(s, to.player);
    if (has(src, "Infect")) {
      p.poison = (p.poison ?? 0) + n;
      log(s, `${src.name} deals ${n} damage to ${p.name} (${n} poison counter${n === 1 ? "" : "s"}).`);
    } else {
      // "Damage that would reduce your life total to less than 1 reduces it to 1 instead" (Ali from Cairo): the damage is
      // all dealt, only the life lost changes; not if they're below 1 already (rulings).
      const floor = Math.max(0, ...s.battlefield.map((id) => (controllerOf(s, obj(s, id)) === p.id ? (abilitiesOf(s, obj(s, id)).lifeFloor ?? 0) : 0)));
      const lost = floor && p.life >= floor && p.life - n < floor ? p.life - floor : n;
      loseLife(s, p.id, lost);
      log(s, `${src.name} deals ${n} damage to ${p.name}${lost < n ? ` (their life total can't go below ${floor})` : ""}.`);
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
    // "Whenever ~ deals damage to a player" (combat damage is all dealt before any of it triggers anything).
    if (src.id) fireEvent(s, { type: "damagedPlayer", source: src.id, player: p.id, amount: n, combat: !!opts.combat });
    if (opts.combat) {
      if (src.commanderId) p.commanderDamage[src.commanderId] = (p.commanderDamage[src.commanderId] ?? 0) + n;
      // Freerunning (CR 702.173a): an Assassin creature or a commander, as it was when it dealt the damage, lets its
      // controller pay freerunning costs this turn.
      if (src.types.includes("Creature") && (src.subtypes.includes("Assassin") || src.commanderId) && !(s.freerunningThisTurn ??= []).includes(src.controller)) s.freerunningThisTurn.push(src.controller);
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
const recKey = (r: Rec) => ("object" in r ? `o:${r.object}` : `p:${r.player}`);
const srcKey = (src: DamageSource) => src.id ?? `spell:${src.name}`;

type ShieldOp =
  | { kind: "protection"; srcName: string; toName: string }
  | { kind: "preventAll"; srcName: string; toName: string; /** A damage rule's, with what's prevented for its additional effect. */ rule?: string; n?: number; src?: DamageSource }
  | { kind: "shieldCounter"; id: ObjectId; srcName: string }
  | { kind: "prevent"; to: Rec; n: number; srcName: string; toName: string; rule?: string; src?: DamageSource; card?: string }
  | { kind: "redirect"; to: Rec; shield: string; n: number; srcName: string; fromName: string; toName: string; card: string; rule?: boolean };

interface ShieldPlan {
  ask?: ShieldQuestion;
  ops: ShieldOp[];
  final: DamageEvent[];
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
  if ("player" in to) return t.player === to.player || t.players === "all" || (t.players === "you" && to.player === r.controller) || (t.players === "opponents" && to.player !== r.controller);
  const o = s.objects[to.object];
  if (!o || o.zone !== "battlefield") return false;
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
  if (spec.combat || spec.counter || spec.tapped !== undefined || spec.token !== undefined || spec.power || spec.toughness || spec.manaValue || spec.supertypes || spec.notSupertypes || spec.anyOf || spec.chosen) return false;
  const kw = (k: string) => src.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (spec.types?.length && !spec.types.some((t) => src.types.includes(t)) && !spec.orSubtypes?.some((t) => src.subtypes.includes(t))) return false;
  if (spec.allTypes?.some((t) => !src.types.includes(t)) || spec.notTypes?.some((t) => src.types.includes(t))) return false;
  if (spec.colors?.length && !spec.colors.some((c) => src.colors.includes(c))) return false;
  if (spec.notColors?.some((c) => src.colors.includes(c))) return false;
  if (spec.colorCount && (spec.colorCount === "colorless" ? src.colors.length !== 0 : spec.colorCount === "monocolored" ? src.colors.length !== 1 : src.colors.length < 2)) return false;
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
  const c = r.by?.chosen;
  if (c) {
    const ref = e.src.ref;
    // A permanent spell chosen as the source: the permanent it becomes is that source too (CR 609.7a).
    if (!ref || ref.object !== c.id || (ref.zc !== c.zc && !(c.spell && ref.zc === c.zc + 1))) return false;
  }
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
  const preventCap = new Map<string, number>();
  const redirectCap = new Map<string, number>();
  const counters = new Map<ObjectId, number>();
  // "Damage can't be prevented" (CR 615.12): protection, shield counters and prevention shields don't stop it.
  const preventing = canPreventDamage(s);
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
  const takes = (sh: PlanShield, e: DamageEvent) => !(e.applied ?? []).includes(sh.key) && (!sh.rule || ruleTakes(s, sh.rule, e));
  let queue = events.filter((e) => e.n > 0).map((e) => ({ ...e, applied: e.applied ?? [] }));
  const order = turnOrderFrom(s, s.activePlayer);
  // A rule's "next N damage" shield protecting several permanents and players (Harm's Way's "you and/or permanents you
  // control"): when its source would deal more than N to them at once, its controller chooses which N (rulings).
  for (const rule of allRules) {
    if (rule.left === undefined || rule.left <= 0 || (!rule.redirect && !preventing)) continue;
    const per = new Map<string, { to: Rec; n: number }>();
    for (const e of queue) {
      if (!ruleCovers(s, rule, e.to) || !ruleTakes(s, rule, e)) continue;
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
      if (i === null) return { ask, ops, final };
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
      // "Prevent all damage that would be dealt to / by ~" uses up no shield, so it's applied first (CR 615.1, 616.1).
      // One with an additional effect ("you gain life equal to the damage prevented this way") is the one picked.
      const rules = preventing ? allRules.filter((r) => preventsAll(r) && !(e.applied ?? []).includes(r.id) && ruleCovers(s, r, to) && ruleTakes(s, r, e)) : [];
      const rule = rules.find((r) => (r.gainLife && colorsOk(r.gainLife, e.src)) || (r.dealBack && colorsOk(r.dealBack, e.src))) ?? (preventedAll(s, e) ? undefined : rules[0]);
      if (rule) {
        ops.push({ kind: "preventAll", srcName: e.src.name, toName, rule: rule.id, n: e.n, src: e.src });
        continue;
      }
      if (preventing && preventedAll(s, e)) {
        ops.push({ kind: "preventAll", srcName: e.src.name, toName });
        continue;
      }
      if (preventing && "player" in to && playerProtectedFrom(s, to.player, e.src.controller, e.src)) {
        ops.push({ kind: "protection", srcName: e.src.name, toName });
        continue;
      }
      if (preventing && "object" in to && protectedFrom(characteristics(s, obj(s, to.object)).keywords, e.src, protectionHolder(s, obj(s, to.object)))) {
        ops.push({ kind: "protection", srcName: e.src.name, toName });
        continue;
      }
      if (preventing && "object" in to) {
        const left = counters.get(to.object) ?? obj(s, to.object).counters.shield ?? 0;
        if (left > 0) {
          counters.set(to.object, left - 1);
          ops.push({ kind: "shieldCounter", id: to.object, srcName: e.src.name });
          continue;
        }
      }
      incoming.push(e);
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
    let paused = false;
    while (shields.length && total() > 0 && !paused) {
      // Which shield applies next: it matters only when they can't all be used up and they do different things.
      const capSum = shields.reduce((a, x) => a + x.cap, 0);
      const same = (a: PlanShield, b: PlanShield) => a.kind === b.kind && (a.to ? recKey(a.to) : "") === (b.to ? recKey(b.to) : "");
      let sh = shields[0]!;
      if (capSum > total() && shields.some((x) => !same(x, sh))) {
        const opts = [...shields].sort((a, b) => (a.kind === "prevent" ? 0 : 1) - (b.kind === "prevent" ? 0 : 1));
        const part = (x: PlanShield) => (x.cap === Infinity ? "it" : `${x.cap} of it`);
        const label = (x: PlanShield) => (x.kind === "prevent" ? `Prevent ${part(x)}${x.rule ? ` (${x.card})` : ""}` : `Deal ${part(x)} to ${nameOf(x.to!)} instead (${x.card})`);
        const i = choose({ player: who, prompt: `Damage to ${toName}: which shield applies first?`, labels: opts.map(label) });
        if (i === null) {
          paused = true;
          break;
        }
        sh = opts[i]!;
      }
      // Which damage it takes: asked one at a time while two or more sources' damage is left and it can't take it all.
      const usable = (i: number) => left[i]! > 0 && takes(sh, incoming[i]!);
      const take = new Array<number>(incoming.length).fill(0);
      let room = Math.min(sh.cap, incoming.reduce((a, _, i) => a + (usable(i) ? left[i]! : 0), 0));
      while (room > 0) {
        const open = incoming.map((_, i) => i).filter(usable);
        const openTotal = open.reduce((a, i) => a + left[i]!, 0);
        let pick = open[0]!;
        if (room < openTotal && new Set(open.map((i) => srcKey(incoming[i]!.src))).size > 1) {
          const ranked = [...open].sort((a, b) => shieldPreference(s, sh, who, to, incoming[b]!) - shieldPreference(s, sh, who, to, incoming[a]!));
          const counts = new Map<string, number>();
          const labels = ranked.map((i) => {
            const nm = incoming[i]!.src.name;
            const dup = open.filter((j) => incoming[j]!.src.name === nm).length > 1;
            const k = (counts.get(nm) ?? 0) + 1;
            counts.set(nm, k);
            return `${nm}${dup ? ` #${k}` : ""} (${left[i]} damage)`;
          });
          const prompt =
            sh.kind === "prevent"
              ? `Prevent 1 damage to ${toName} (${room} of the shield left): from which source?`
              : `${sh.card}: deal 1 damage to ${nameOf(sh.to!)} instead of ${toName} (${room} left): from which source?`;
          const i = choose({ player: who, prompt, labels });
          if (i === null) {
            paused = true;
            break;
          }
          pick = ranked[i]!;
          left[pick]! -= 1;
          take[pick]! += 1;
          room -= 1;
          continue;
        }
        const n = Math.min(room, left[pick]!);
        left[pick]! -= n;
        take[pick]! += n;
        room -= n;
      }
      if (paused) break;
      let used = 0;
      for (const [i, n] of take.entries()) {
        if (!n) continue;
        used += n;
        const e = incoming[i]!;
        if (sh.kind === "prevent") ops.push({ kind: "prevent", to, n, srcName: e.src.name, toName, ...(sh.rule ? { rule: sh.key, src: e.src, card: sh.card! } : {}) });
        else {
          ops.push({ kind: "redirect", to, shield: sh.key, n, srcName: e.src.name, fromName: toName, toName: nameOf(sh.to!), card: sh.card!, ...(sh.rule ? { rule: true } : {}) });
          queue.push({ ...e, to: sh.to!, n, applied: [...(e.applied ?? []), sh.key] });
        }
      }
      if (sh.rule) {
        // Shared by all it protects. "The next time" takes all of this damage event, wherever it's dealt (CR 615.8).
        ruleCap.set(sh.key, ruleCap.get(sh.key)! - used);
        const a = alloc.get(sh.key);
        if (a?.has(key)) a.set(key, a.get(key)! - used);
      } else if (sh.kind === "prevent") preventCap.set(sh.key, sh.cap - used);
      else redirectCap.set(sh.key, sh.cap - used);
      shields = shields.filter((x) => x !== sh);
    }
    if (paused) return { ask, ops, final };
    for (const [i, e] of incoming.entries()) if (left[i]! > 0) final.push({ ...e, n: left[i]! });
  }
  if (ask) return { ask, ops, final };
  // One amount per source and permanent or player: damage redirected back to where it came from adds up.
  const out = new Map<string, DamageEvent>();
  for (const e of final) {
    const k = `${srcKey(e.src)}|${recKey(e.to)}`;
    const m = out.get(k);
    if (m) m.n += e.n;
    else out.set(k, { src: e.src, to: e.to, n: e.n, ...(e.combat ? { combat: true } : {}) });
  }
  return { ops, final: [...out.values()] };
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
  return !!characteristics(s, to).preventDamage?.some((p) => p.to && kind(p) && (!p.fromTypes || p.fromTypes.every((t) => e.src.types.includes(t))));
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
function shieldPreference(s: GameState, sh: PlanShield, who: PlayerId, to: Rec, e: DamageEvent): number {
  const kw = (k: string) => e.src.keywords.some((x) => x.toLowerCase() === k);
  const nasty = (r: Rec) =>
    ("object" in r ? (kw("deathtouch") ? 100 : 0) + (kw("infect") || kw("wither") ? 50 : 0) : (kw("infect") ? 50 : 0) + (e.combat && e.src.commanderId ? 20 : 0)) +
    (kw("lifelink") && e.src.controller !== who ? 10 : 0);
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
}

/**
 * Make the plan's changes: use up the shields and counters, and say what happened. Damage rules' additional effects
 * happen right after the prevention (CR 615.5): life gained now, damage dealt back returned for after the damage.
 */
function commitShields(s: GameState, plan: ShieldPlan): DealBack[] {
  const back: DealBack[] = [];
  const used = new Set<string>();
  // Life gained from each rule's prevention of damage dealt at the same time is one life-gain event (CR 119.10).
  const gains = new Map<string, { pid: PlayerId; n: number }>();
  const gainLater = (r: DamageRule, n: number) => gains.set(r.id, { pid: r.controller, n: (gains.get(r.id)?.n ?? 0) + n });
  const ruleUsed = (id: string, n: number, src?: DamageSource, prevented = false) => {
    const r = s.damageRules?.find((x) => x.id === id);
    if (!r) return;
    if (r.left !== undefined) r.left -= n;
    if (r.nextTime) used.add(r.id);
    if (!prevented || !src) return;
    if (colorsOk(r.gainLife, src)) gainLater(r, n);
    if (colorsOk(r.dealBack, src)) back.push({ cardId: r.cardId, controller: r.controller, to: src.controller, n });
  };
  for (const op of plan.ops) {
    if (op.kind === "protection") log(s, `Damage from ${op.srcName} to ${op.toName} is prevented (protection).`);
    else if (op.kind === "preventAll") {
      const r = op.rule ? s.damageRules?.find((x) => x.id === op.rule) : undefined;
      log(s, `Damage from ${op.srcName} to ${op.toName} is prevented${r ? ` (${cardName(s, r)})` : ""}.`);
      if (r && op.n && op.src) {
        if (colorsOk(r.gainLife, op.src)) gainLater(r, op.n);
        if (colorsOk(r.dealBack, op.src)) back.push({ cardId: r.cardId, controller: r.controller, to: op.src.controller, n: op.n });
      }
    } else if (op.kind === "shieldCounter") useShieldCounter(s, obj(s, op.id), `${op.srcName} dealing damage to it`);
    else if (op.kind === "prevent" && op.rule) {
      const r = s.damageRules?.find((x) => x.id === op.rule);
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
  // Used up: "the next time" once it has applied, "the next N" at 0 (CR 615.7-8).
  if (s.damageRules) {
    s.damageRules = s.damageRules.filter((r) => !used.has(r.id) && (r.left === undefined || r.left > 0));
    if (!s.damageRules.length) s.damageRules = undefined;
  }
  return back;
}

/**
 * Deal damage that happens at the same time, after its shields (see planShields), choosing for the players the way
 * a bot would (only combat damage stops to ask; see game.ts). Returns what each source dealt to each permanent or
 * player.
 */
export function dealDamageBatch(s: GameState, events: DamageEvent[], opts: { lifelink?: { n: number } } = {}): (DamageEvent & { dealt: number })[] {
  const plan = planShields(s, events, [], true);
  return dealPlanned(s, plan, opts);
}

/** Commit a finished plan and deal its damage. `lifelink`: add the life up for the caller instead of gaining it per event. */
export function dealPlanned(s: GameState, plan: ShieldPlan, opts: { lifelink?: { n: number } | ((e: DamageEvent) => { n: number }) } = {}): (DamageEvent & { dealt: number })[] {
  const back = commitShields(s, plan);
  const witherCounters = new Map<ObjectId, number>();
  const out = plan.final.map((e) => {
    const lifelink = typeof opts.lifelink === "function" ? opts.lifelink(e) : opts.lifelink;
    const o = "object" in e.to ? obj(s, e.to.object) : undefined;
    const to = o ? { object: o } : { player: (e.to as { player: PlayerId }).player };
    const dealt = o && o.zone !== "battlefield" ? 0 : dealDamage(s, e.src, to, e.n, { combat: e.combat, lifelink, shielded: true, witherCounters });
    return { ...e, dealt };
  });
  for (const [id, n] of witherCounters) {
    const o = obj(s, id);
    if (o.zone === "battlefield") putCounters(s, o, "-1/-1", n);
  }
  if (witherCounters.size) invalidateCharacteristics(s);
  // "Whenever ~ is dealt damage": the damage dealt to a permanent at the same time is one event (rulings).
  const dealtTo = new Map<ObjectId, number>();
  for (const e of out) if ("object" in e.to && e.dealt > 0) dealtTo.set(e.to.object, (dealtTo.get(e.to.object) ?? 0) + e.dealt);
  for (const [id, amount] of dealtTo) fireEvent(s, { type: "wasDealtDamage", id, amount });
  // "If damage is prevented this way, ~ deals that much damage to that source's controller" (Deflecting Palm), after it.
  for (const b of back) {
    const d = s.cards[b.cardId];
    if (d && !player(s, b.to).lost) dealDamage(s, cardSource(d, b.controller), { player: b.to }, b.n);
  }
  return out;
}

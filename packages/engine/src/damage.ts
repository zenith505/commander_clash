// Dealing damage (CR 120), in one place so every way of dealing it (combat, spells,
// abilities, fight) gets the same results: prevention effects stop it (CR 615: Fog, prevention
// shields, and protection, CR 702.16e), infect
// and wither turn it into -1/-1 counters (CR 702.90c, 702.80a), infect turns damage to a
// player into poison counters (CR 702.90b), toxic adds poison (CR 702.164c), and
// deathtouch and lifelink apply (CR 702.2, 702.15).

import { abilitiesOf } from "./cards";
import { fireEvent } from "./effects";
import { canPreventDamage, gainLife, log, loseLife, obj, player, turnOrderFrom, useShieldCounter } from "./game";
import { protectedFrom, toxicValue } from "./keywords";
import { characteristics, controllerOf, invalidateCharacteristics } from "./layers";
import type { CardDef, Color, GameObject, GameState, ObjectId, PlayerId, RedirectShield } from "./types";

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
 *
 * Protection, shield counters and damage shields (prevention and redirection) are applied first, by
 * dealDamageBatch; `shielded` says the caller already did that.
 */
export function dealDamage(
  s: GameState,
  src: DamageSource,
  to: { object: GameObject } | { player: PlayerId },
  n: number,
  opts: { combat?: boolean; lifelink?: { n: number }; shielded?: boolean } = {},
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
        // Infect and wither: -1/-1 counters instead of marked damage, but it's still damage dealt.
        o.counters["-1/-1"] = (o.counters["-1/-1"] ?? 0) + n;
        invalidateCharacteristics(s);
        log(s, `${src.name} deals ${n} damage to ${c.name} (as -1/-1 counters).`);
      } else {
        o.damage += n;
        log(s, `${src.name} deals ${n} damage to ${c.name}.`);
      }
    }
    if (has(src, "Deathtouch")) o.deathtouchDamage = true;
    if (src.id && !o.damagedBy?.includes(src.id)) (o.damagedBy ??= []).push(src.id);
    // "Whenever ~ deals damage to a creature" (combat damage is all dealt before any of it triggers anything).
    if (src.id && c.types.includes("Creature")) fireEvent(s, { type: "damagedCreature", source: src.id, id: o.id, amount: n, combat: !!opts.combat });
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
    // "Whenever ~ deals damage to a player" (combat damage is all dealt before any of it triggers anything).
    if (src.id) fireEvent(s, { type: "damagedPlayer", source: src.id, player: p.id, amount: n, combat: !!opts.combat });
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
  | { kind: "preventAll"; srcName: string; toName: string }
  | { kind: "shieldCounter"; id: ObjectId; srcName: string }
  | { kind: "prevent"; to: Rec; n: number; srcName: string; toName: string }
  | { kind: "redirect"; to: Rec; shield: string; n: number; srcName: string; fromName: string; toName: string; card: string };

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
}

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
  const preventCap = new Map<string, number>();
  const redirectCap = new Map<string, number>();
  const counters = new Map<ObjectId, number>();
  // "Damage can't be prevented" (CR 615.12): protection, shield counters and prevention shields don't stop it.
  const preventing = canPreventDamage(s);
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
    return out;
  };
  let queue = events.filter((e) => e.n > 0).map((e) => ({ ...e, applied: e.applied ?? [] }));
  const order = turnOrderFrom(s, s.activePlayer);
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
      if (preventing && preventedAll(s, e)) {
        ops.push({ kind: "preventAll", srcName: e.src.name, toName });
        continue;
      }
      if (preventing && "object" in to && protectedFrom(characteristics(s, obj(s, to.object)).keywords, e.src)) {
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
    let shields = shieldsOf(to, new Set()).filter((x) => incoming.some((e) => !(e.applied ?? []).includes(x.key)));
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
        const label = (x: PlanShield) => (x.kind === "prevent" ? `Prevent ${x.cap} of it` : `Deal ${x.cap} of it to ${nameOf(x.to!)} instead (${x.card})`);
        const i = choose({ player: who, prompt: `Damage to ${toName}: which shield applies first?`, labels: opts.map(label) });
        if (i === null) {
          paused = true;
          break;
        }
        sh = opts[i]!;
      }
      // Which damage it takes: asked one at a time while two or more sources' damage is left and it can't take it all.
      const usable = (i: number) => left[i]! > 0 && !(incoming[i]!.applied ?? []).includes(sh.key);
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
        if (sh.kind === "prevent") ops.push({ kind: "prevent", to, n, srcName: e.src.name, toName });
        else {
          ops.push({ kind: "redirect", to, shield: sh.key, n, srcName: e.src.name, fromName: toName, toName: nameOf(sh.to!), card: sh.card! });
          queue.push({ ...e, to: sh.to!, n, applied: [...(e.applied ?? []), sh.key] });
        }
      }
      if (sh.kind === "prevent") preventCap.set(sh.key, sh.cap - used);
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

/** Make the plan's changes: use up the shields and counters, and say what happened. */
function commitShields(s: GameState, plan: ShieldPlan) {
  for (const op of plan.ops) {
    if (op.kind === "protection") log(s, `Damage from ${op.srcName} to ${op.toName} is prevented (protection).`);
    else if (op.kind === "preventAll") log(s, `Damage from ${op.srcName} to ${op.toName} is prevented.`);
    else if (op.kind === "shieldCounter") useShieldCounter(s, obj(s, op.id), `${op.srcName} dealing damage to it`);
    else if (op.kind === "prevent") {
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
  commitShields(s, plan);
  const out = plan.final.map((e) => {
    const lifelink = typeof opts.lifelink === "function" ? opts.lifelink(e) : opts.lifelink;
    const o = "object" in e.to ? obj(s, e.to.object) : undefined;
    const to = o ? { object: o } : { player: (e.to as { player: PlayerId }).player };
    const dealt = o && o.zone !== "battlefield" ? 0 : dealDamage(s, e.src, to, e.n, { combat: e.combat, lifelink, shielded: true });
    return { ...e, dealt };
  });
  // "Whenever ~ is dealt damage": the damage dealt to a permanent at the same time is one event (rulings).
  const dealtTo = new Map<ObjectId, number>();
  for (const e of out) if ("object" in e.to && e.dealt > 0) dealtTo.set(e.to.object, (dealtTo.get(e.to.object) ?? 0) + e.dealt);
  for (const [id, amount] of dealtTo) fireEvent(s, { type: "wasDealtDamage", id, amount });
  return out;
}

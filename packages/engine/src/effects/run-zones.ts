import type { Amount, CounterKind, Effect, TargetSpec, TokenSpec } from "../abilities";
import { abilitiesOf, defOf, isPermanentCard, isType, objIsType, power } from "../cards";
import { attackedName, attackedPlaneswalker, auraHostKey, auraHostLabels, auraHostName, auraHostOf, auraHostOptions, type AuraHost, castProblem, destroyPermanent, landsAllowed, livingPlayers, log, moveObject, enterTogether, nameOf, obj, pairable, pairCandidates, pairCreatures, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters } from "../counters";
import { manaValue, parseManaCost } from "../mana";
import type { GameObject, GameState, LastKnown, ObjectId, PlayerId } from "../types";
import { objectMatches, pickOptions, printedMatches } from "./targeting";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { createToken, tokenCopies } from "./run-tokens";
import { compileCard } from "../oracle";
import { nextRandom, shuffle } from "../rng";
import { askWholeGraveyardOrder } from "../graveyard";
import { addDelayed, paidUnless } from "./run-spells";
import { fireEvent, inCombat } from "./triggers";

/** A suspended card (CR 702.62b): in exile, with suspend and a time counter on it. */
export function isSuspended(s: GameState, o: GameObject): boolean {
  return o.zone === "exile" && (o.counters.time ?? 0) > 0 && !!compileCard(defOf(s, o)).suspend;
}

/**
 * Put exiled cards onto the battlefield, all at once: an Aura's new controller chooses what it enchants as it enters,
 * and with nothing it can enchant it stays in exile (CR 303.4f-g, rulings on Flicker of Fate).
 */
function returnFromExile(s: GameState, cards: GameObject[], under: (c: GameObject) => PlayerId, src: string, counter?: CounterKind): "paused" | void {
  const back = cards.filter((c) => isPermanentCard(defOf(s, c)));
  const hosts = chooseAuraHosts(s, back.map((o) => ({ o, under: under(o) })), src);
  if (hosts === "paused") return "paused";
  enterTogether(s, () => {
    for (const c of back) {
      const d = defOf(s, c);
      const host = hosts.get(c.id);
      if (d.subtypes.includes("Aura") && !host) {
        log(s, `${d.name} has nothing to enchant, so it stays in exile.`);
        continue;
      }
      log(s, `${src} returns ${d.name} to the battlefield${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
      moveObject(s, c.id, "battlefield", { controller: under(c), ...host, ...(counter ? { counters: { [counter]: 1 } } : {}) });
    }
  });
}

/**
 * Auras this effect puts onto the battlefield without their being cast (CR 303.4f): the player each one enters under
 * chooses what it enchants, as it enters, among what's on the battlefield before any of them move (Replenish rulings);
 * with nothing legal it stays where it is (303.4g). One Aura at a time, in the order given; no question when only one
 * thing is legal. Returns "paused" while a player chooses, else the host of each Aura that can enter; an Aura missing
 * from it stays put. Cards that aren't Auras are skipped.
 */
export function chooseAuraHosts(s: GameState, cards: { o: GameObject; under: PlayerId }[], src: string): "paused" | Map<ObjectId, AuraHost> {
  const sc = (s.resolving!.scratch ??= {});
  const hosts = (sc.auraHosts ??= {});
  for (const { o, under } of cards) {
    if (!defOf(s, o).subtypes.includes("Aura") || hosts[o.id] !== undefined) continue;
    const options = auraHostOptions(s, o, under);
    if (options.length <= 1) {
      hosts[o.id] = options[0] ? auraHostKey(options[0]) : "none";
      continue;
    }
    sc.auraAsking = o.id;
    s.pending = { kind: "chooseOption", player: under, source: src, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose what ${defOf(s, o).name} enchants as it enters` };
    return "paused";
  }
  const out = new Map<ObjectId, AuraHost>();
  for (const { o } of cards) {
    const k = hosts[o.id];
    if (k && k !== "none") out.set(o.id, auraHostOf(k));
  }
  return out;
}

/**
 * Each player picks their own permanents, in APNAP order, then they're all sacrificed or returned to
 * their owners' hands at once (CR 101.4, 701.21a). With no more than they have to pick, there's no choice.
 */
function pickPermanents(s: GameState, e: Extract<Effect, { type: "pick" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const n = (sc.n ??= amountNow(s, e.n, ctx));
  let who = players(s, e.who, ctx);
  // "Each opponent sacrifices a permanent of their choice unless they pay {3}": each chooses in turn order whether to pay
  // (CR 101.4), then those who didn't choose what to sacrifice (rulings).
  if (e.unless) {
    sc.payQueue ??= apnap(s, who);
    while (sc.payQueue.length) {
      const pid = sc.payQueue[0]!;
      // The prompt reads "pay {2} or you sacrifice a permanent".
      const paid = pickOptions(s, e, pid, ctx.sourceId).length ? paidUnless(s, ctx, pid, e.unless, src, e.filter.text, `you ${e.action === "sacrifice" ? "sacrifice" : "choose"} ${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text}`) : false;
      if (paid === "paused") return "paused";
      if (paid) (sc.paidBy ??= []).push(pid);
      sc.paid = undefined;
      sc.payQueue.shift();
    }
    who = who.filter((pid) => !sc.paidBy?.includes(pid));
  }
  if (!sc.queue) {
    sc.queue = apnap(s, who);
    sc.chosen = {};
  }
  while (sc.queue.length) {
    const pid = sc.queue[0]!;
    const options = pickOptions(s, e, pid, ctx.sourceId);
    if (options.length > n) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.least ? `${e.filter.text} with the least toughness` : e.greatest ? `${e.filter.text} with the greatest power` : e.filter.text, options, count: n, ...(e.counter ? { counter: e.counter.kind } : {}) };
      return "paused";
    }
    sc.chosen![pid] = options;
    sc.queue.shift();
  }
  for (const pid of apnap(s, who))
    for (const id of sc.chosen?.[pid] ?? []) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.action === "populate") {
        if (s.resolving) s.resolving.created ??= [];
        tokenCopies(s, pid, defOf(s, o), 1, ctx);
        continue;
      }
      if (e.action === "counters") {
        const k = e.counter!.kind;
        const c = amountNow(s, e.counter!.n, ctx);
        if (c <= 0) continue;
        invalidateCharacteristics(s);
        const put = putCounters(s, o, k, c);
        log(s, `${player(s, pid).name} puts ${put} ${k} counter${put > 1 ? "s" : ""} on ${defOf(s, o).name}.`);
        continue;
      }
      log(s, e.action === "sacrifice" ? `${player(s, pid).name} sacrifices ${defOf(s, o).name}.` : `${player(s, pid).name} returns ${defOf(s, o).name} to its owner's hand.`);
      moveObject(s, id, e.action === "sacrifice" ? "graveyard" : "hand", e.action === "sacrifice" ? { sacrificed: true } : {});
    }
}

/**
 * "Sacrifice an artifact, a creature, and a land" (see the sacrificeEach effect). For each of the filters in turn, the
 * player picks among the permanents that still let the most of them be filled; with one such permanent, it's that one,
 * and with none, nothing is sacrificed for it.
 */
function sacrificeEach(s: GameState, e: Extract<Effect, { type: "sacrificeEach" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const sl = (sc.slots ??= { queue: apnap(s, players(s, e.who, ctx)), slot: 0, picked: {} });
  while (sl.queue.length) {
    const pid = sl.queue[0]!;
    const picked = (sl.picked[pid] ??= []);
    // The answer to the pick it asked for.
    if (sc.chosen?.[pid]) {
      picked.push(...sc.chosen[pid]!);
      sc.chosen = undefined;
      sl.slot++;
    }
    const own = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
    const fits = (i: number, id: ObjectId) => objectMatches(s, { ...e.filters[i]!, controller: "you" }, obj(s, id), pid, false);
    // The most of filters i.. that permanents other than `used` can fill, each by a different one.
    const most = (i: number, used: ObjectId[]): number => {
      if (i >= e.filters.length) return 0;
      let best = most(i + 1, used);
      for (const id of own) if (!used.includes(id) && fits(i, id)) best = Math.max(best, 1 + most(i + 1, [...used, id]));
      return best;
    };
    while (sl.slot < e.filters.length) {
      const target = most(sl.slot, picked);
      const options = own.filter((id) => !picked.includes(id) && fits(sl.slot, id) && 1 + most(sl.slot + 1, [...picked, id]) === target);
      if (options.length > 1) {
        sc.queue = [pid];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "sacrifice", what: e.filters[sl.slot]!.text, options, count: 1 };
        return "paused";
      }
      picked.push(...options);
      sl.slot++;
    }
    sl.queue.shift();
    sl.slot = 0;
  }
  for (const pid of apnap(s, players(s, e.who, ctx)))
    for (const id of sl.picked[pid] ?? []) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      log(s, `${player(s, pid).name} sacrifices ${defOf(s, o).name}.`);
      moveObject(s, id, "graveyard", { sacrificed: true });
    }
}

/**
 * "Each player puts a creature card from their graveyard onto the battlefield" (Exhume, Crypt Champion): not targeted,
 * so chosen as it resolves; the active player first, then the others in turn order, each knowing the choices before
 * theirs; a player with none does nothing; then all of them enter at the same time, each under its owner's control
 * (CR 101.4, 110.2a, rulings).
 */
function eachFromGraveyard(s: GameState, e: Extract<Effect, { type: "chooseFromGraveyard" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const yp = (sc.yardPicks ??= { queue: apnap(s, players(s, e.who!, ctx)), picked: {} });
  while (yp.queue.length) {
    const pid = yp.queue[0]!;
    const p = player(s, pid);
    if (sc.found) {
      yp.picked[pid] = sc.found.filter((id) => p.graveyard.includes(id));
      sc.found = undefined;
      yp.queue.shift();
      continue;
    }
    const cards = p.lost ? [] : p.graveyard.filter((id) => (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) && isPermanentCard(defOf(s, obj(s, id))));
    const max = Math.min(e.n, cards.length);
    // Nothing to choose between: those are the ones.
    if (!e.upTo && cards.length <= e.n) {
      yp.picked[pid] = cards;
      yp.queue.shift();
      continue;
    }
    const kind = e.filter?.text ?? "card";
    s.pending = { kind: "searchLibrary", player: pid, source: src, what: `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`, cards, min: e.upTo ? 0 : max, max, fromGraveyard: "battlefield" };
    return "paused";
  }
  sc.yardPicks = undefined;
  const moves = Object.entries(yp.picked).flatMap(([pid, ids]) => ids.filter((id) => s.objects[id]?.zone === "graveyard").map((id) => ({ id, pid: Number(pid) as PlayerId })));
  for (const { id, pid } of moves) log(s, `${player(s, pid).name} returns ${defOf(s, obj(s, id)).name} from their graveyard to the battlefield.`);
  enterTogether(s, () => moves.forEach(({ id, pid }) => moveObject(s, id, "battlefield", { controller: pid, ...(e.tapped ? { tapped: true } : {}) })));
}

/**
 * "Each player chooses an artifact, a creature, an enchantment, and a land from among the permanents they control, then
 * sacrifices the rest" (see the keepRest effect): the active player first, then the others in turn order, each knowing
 * the choices before theirs (CR 101.4, rulings); then all the rest are sacrificed at the same time.
 */
function keepRest(s: GameState, e: Extract<Effect, { type: "keepRest" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const who = apnap(s, players(s, e.who, ctx));
  const kr = (sc.keepRest ??= { queue: [...who], slot: 0, kept: {} });
  const among = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, { ...e.among, controller: "you" }, obj(s, id), pid, false));
  // "Equal to the number of lands controlled by the player who controls the fewest": counted once, before anyone
  // chooses (Restore Balance rulings).
  if (e.keep.some((k) => k.fewest)) kr.fewest ??= Math.min(...who.map((pid) => among(pid).length));
  while (kr.queue.length) {
    const pid = kr.queue[0]!;
    const chooser = e.youChoose ? ctx.controller : pid;
    const kept = (kr.kept[pid] ??= []);
    // The answer to the pick it asked for.
    if (sc.chosen?.[chooser]) {
      kept.push(...sc.chosen[chooser]!);
      sc.chosen = undefined;
      kr.slot++;
    }
    while (kr.slot < e.keep.length) {
      const k0 = e.keep[kr.slot]!;
      const k = k0.fewest ? { ...k0, n: kr.fewest ?? 0 } : k0;
      const options = among(pid).filter((id) => objectMatches(s, { ...k.filter, controller: "you" }, obj(s, id), pid, false));
      const max = Math.min(k.n, options.length);
      // Nothing to choose between: all of them are kept.
      if (!k.upTo && options.length <= k.n) {
        kept.push(...options);
        kr.slot++;
        continue;
      }
      // None to keep (Restore Balance when someone controls none): nothing to choose.
      if (!options.length || max === 0) {
        kr.slot++;
        continue;
      }
      sc.queue = [chooser];
      sc.chosen = {};
      s.pending = { kind: "pickPermanents", player: chooser, source: src, action: "keep", what: k.filter.text, options, count: max, ...(k.upTo ? { min: 0 } : {}), ...(chooser !== pid ? { of: pid } : {}) };
      return "paused";
    }
    kr.queue.shift();
    kr.slot = 0;
  }
  sc.keepRest = undefined;
  const gone: ObjectId[] = [];
  for (const pid of who) {
    const kept = new Set(kr.kept[pid] ?? []);
    if (kept.size) log(s, `${player(s, pid).name} keeps ${[...kept].map((id) => nameOf(s, id)).join(", ")}.`);
    gone.push(...among(pid).filter((id) => !kept.has(id)));
  }
  if (gone.length) log(s, `${src}: ${gone.map((id) => nameOf(s, id)).join(", ")} ${gone.length === 1 ? "is" : "are"} sacrificed.`);
  for (const id of gone) if (s.objects[id]?.zone === "battlefield") moveObject(s, id, "graveyard", { sacrificed: true });
}

/** The token empower Jace creates (CR 701.71a). */
const JACE: TokenSpec = { name: "Jace", colors: ["U"], types: ["Planeswalker"], subtypes: ["Jace"], keywords: [], abilities: "−1: Surveil 1.\n−3: Draw a card.", loyalty: 0 };

/**
 * Empower Jace N (CR 701.71a): with no Jace planeswalker token, create one with 0 loyalty; then put N loyalty counters
 * on a Jace planeswalker token you control, chosen if there are several. Only tokens count, however they were made,
 * and a nontoken Jace never does (rulings). The token isn't put into the graveyard for 0 loyalty before the counters
 * go on: state-based actions wait until the effect is done (CR 704.3).
 */
function empowerJace(s: GameState, amount: Amount, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const pid = ctx.controller;
  const jaces = () =>
    s.battlefield.filter((id) => {
      const o = obj(s, id);
      if (!o.isToken || controllerOf(s, o) !== pid) return false;
      const c = characteristics(s, o);
      return c.types.includes("Planeswalker") && c.subtypes.includes("Jace");
    });
  if (!sc.queue) {
    sc.n = amountNow(s, amount, ctx);
    if (!jaces().length) {
      log(s, `${player(s, pid).name} creates a Jace planeswalker token.`);
      createToken(s, pid, JACE);
      invalidateCharacteristics(s);
    }
    const options = jaces();
    sc.queue = [pid];
    sc.chosen = { [pid]: options };
    if (options.length > 1) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: "counters", what: "Jace planeswalker token", options, count: 1, counter: "loyalty" };
      return "paused";
    }
    sc.queue.shift();
  }
  const o = s.objects[sc.chosen![pid]?.[0] ?? ""];
  if (o?.zone !== "battlefield" || sc.n! <= 0) return;
  const put = putCounters(s, o, "loyalty", sc.n!);
  invalidateCharacteristics(s);
  log(s, `${player(s, pid).name} puts ${put} loyalty counter${put === 1 ? "" : "s"} on ${defOf(s, o).name}.`);
}

/**
 * Exploit (CR 702.110a-b): its controller may sacrifice a creature, chosen as this resolves (rulings), the
 * exploiting creature itself included. Only a source still on the battlefield exploits it. Abilities that
 * trigger on that look back in time, as for any sacrifice (CR 603.10a): the sacrificed creature's own count.
 */
function exploit(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const pid = ctx.controller;
  if (!sc.queue) {
    const options = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
    if (!options.length) return;
    sc.queue = [pid];
    sc.chosen = {};
    s.pending = { kind: "pickPermanents", player: pid, source: src, action: "sacrifice", what: "creature", options, count: 1, min: 0 };
    return "paused";
  }
  const victim = s.objects[sc.chosen?.[pid]?.[0] ?? ""];
  if (victim?.zone !== "battlefield") {
    log(s, `${player(s, pid).name} doesn't sacrifice a creature to ${src}'s exploit.`);
    return;
  }
  const exploiter = objects(s, { ref: "self" }, ctx)[0];
  const watchers = s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) === pid)
    .map((o) => ({ id: o.id, triggers: abilitiesOf(s, o).triggers }))
    .filter((w) => w.triggers.some((t) => t.event === "selfExploits" || t.event === "creatureYouControlExploits"));
  const snapshot: GameObject = { ...victim, counters: { ...victim.counters } };
  const chars = characteristics(s, victim);
  log(s, `${player(s, pid).name} sacrifices ${defOf(s, victim).name} (${src}'s exploit).`);
  moveObject(s, victim.id, "graveyard", { sacrificed: true });
  if (exploiter) fireEvent(s, { type: "exploits", exploiter: exploiter.id, controller: pid, victim: snapshot, chars, watchers });
}

/**
 * Champion (CR 702.72a): "sacrifice it unless you exile another [object] you control". Its controller may exile one
 * even after the champion has left; then its leaves trigger has come and gone, and the card stays exiled (CR 607.2a).
 */
function champion(s: GameState, filter: TargetSpec, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const pid = ctx.controller;
  if (!sc.queue) {
    const options = s.battlefield.filter((id) => id !== ctx.sourceId && controllerOf(s, obj(s, id)) === pid && objectMatches(s, filter, obj(s, id), pid, false));
    sc.queue = [pid];
    sc.chosen = {};
    if (options.length) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: "champion", what: filter.text.replace(/^another /, "").replace(/ you control$/, ""), options, count: 1, min: 0 };
      return "paused";
    }
  }
  const pick = s.objects[sc.chosen?.[pid]?.[0] ?? ""];
  if (pick?.zone === "battlefield") {
    log(s, `${player(s, pid).name} exiles ${defOf(s, pick).name} (${src}'s champion).`);
    moveObject(s, pick.id, "exile");
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (me) me.championed = { id: pick.id, zc: pick.zoneChanges ?? 0, by: ctx.sourceZc ?? 0 };
    return;
  }
  const here = objects(s, { ref: "self" }, ctx)[0];
  if (!here || controllerOf(s, here) !== pid) return;
  log(s, `${player(s, pid).name} sacrifices ${src} (champion).`);
  moveObject(s, here.id, "graveyard", { sacrificed: true });
}

/**
 * Soulbond (CR 702.95a, c): pair the source with another unpaired creature its controller picks, or with the
 * creature whose entering triggered it. Both have to still be creatures on the battlefield under that player's
 * control, and unpaired; otherwise neither becomes paired.
 */
function soulbond(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const pid = ctx.controller;
  const self = objects(s, { ref: "self" }, ctx)[0];
  const sub = ctx.subject && s.objects[ctx.subject.id];
  const subject = sub && (sub.zoneChanges ?? 0) === ctx.subject!.zc ? sub : undefined;
  if (!sc.queue) {
    if (!self) return;
    const options = ctx.subject ? (subject && pairable(s, self, subject, pid) ? [subject.id] : []) : pairCandidates(s, self, pid).map((o) => o.id);
    if (!options.length) return;
    sc.queue = [pid];
    sc.chosen = {};
    s.pending = { kind: "pickPermanents", player: pid, source: src, action: "pair", what: "creature", options, count: 1, min: 0 };
    return "paused";
  }
  const other = s.objects[sc.chosen?.[pid]?.[0] ?? ""];
  if (!self || !other || !pairable(s, self, other, pid)) return;
  pairCreatures(s, self, other, pid);
}

/**
 * Cipher (CR 702.99a): "If this spell is represented by a card, you may exile this card encoded on a creature you
 * control." It's the spell's last instruction; a copy isn't a card (CR 707.10a), so it can't be encoded.
 */
function cipher(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const item = s.resolving?.item;
  const card = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  if (!card || card.zone !== "stack" || card.spellCopy) return;
  const sc = (s.resolving!.scratch ??= {});
  const pid = ctx.controller;
  if (!sc.queue) {
    const options = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
    if (!options.length) return;
    sc.queue = [pid];
    sc.chosen = {};
    s.pending = { kind: "pickPermanents", player: pid, source: src, action: "encode", what: "creature", options, count: 1, min: 0 };
    return "paused";
  }
  const host = s.objects[sc.chosen?.[pid]?.[0] ?? ""];
  if (!host || host.zone !== "battlefield") return;
  moveObject(s, card.id, "exile");
  const moved = s.objects[card.id];
  if (moved?.zone !== "exile") return;
  (host.encoded ??= []).push({ id: moved.id, zc: moved.zoneChanges ?? 0 });
  log(s, `${src} is exiled encoded on ${defOf(s, host).name} (cipher).`);
}

/** Moving permanents and cards between zones: destroy, exile, bounce, reanimate, flicker, sacrifice, ninjutsu, impulse draw. */
export function runZonesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exploit":
      return exploit(s, ctx, src);
    case "champion":
      return champion(s, e.filter, ctx, src);
    case "returnChampioned": {
      // Only the card this permanent exiled, while it's still that card in exile (CR 400.7, 607.2a).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const link = me?.championed;
      if (!me || !link || link.by !== (ctx.sourceZc ?? 0) - 1) return;
      me.championed = undefined;
      const c = s.objects[link.id];
      if (c?.zone !== "exile" || (c.zoneChanges ?? 0) !== link.zc) return;
      log(s, `${defOf(s, c).name} returns to the battlefield (${src}).`);
      moveObject(s, c.id, "battlefield", { controller: c.owner });
      return;
    }
    case "soulbond":
      return soulbond(s, ctx, src);
    case "returnToBattlefield": {
      // Persist and undying return the card that was put into the graveyard, if it's still there as that
      // same object (CR 400.7), under its owner's control.
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== ctx.sourceZc) return;
      log(s, `${src} returns to the battlefield${e.counter ? ` with a ${e.counter} counter on it` : ""}.`);
      moveObject(s, o.id, "battlefield", { controller: o.owner, ...(e.counter ? { counters: { [e.counter]: 1 } } : {}) });
      return;
    }
    case "unearth": {
      // CR 702.84a: only if it's still the same card in the graveyard (CR 400.7).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== ctx.sourceZc) return;
      moveObject(s, o.id, "battlefield", { controller: ctx.controller });
      o.exileIfLeaves = "battlefield";
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [{ type: "exile", what: { ref: "subject" } }], text: "Exile ~ (unearth)." });
      log(s, `${src} returns to the battlefield with haste.`);
      return;
    }
    case "castFromExileFree": {
      // Rebound (CR 702.88a): the card has to still be in exile, the same object (CR 400.7).
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      sc.may = false;
      s.pending = { kind: "castFree", player: p.id, objectId: o.id, source: src };
      if (castProblem(s, p.id, o.id) === null) return "paused";
      s.pending = null;
      log(s, `${src} can't be cast.`);
      return;
    }
    case "madness": {
      // CR 702.35a: the owner may cast it for its madness cost as this resolves, ignoring timing (rulings); if they
      // don't (or can't), it goes to the graveyard. It has to still be in exile as the same object (CR 400.7).
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      const here = () => !!o && o.zone === "exile" && (o.zoneChanges ?? 0) === ctx.subject!.zc;
      if (!here()) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may === undefined) {
        sc.may = false;
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o!.id, source: src, how: "madness" };
        // Mana abilities can still be activated to pay for it (CR 601.2g), so only the mana in the pool may be short.
        const problem = castProblem(s, ctx.controller, o!.id);
        if (problem === null || /^not enough mana/.test(problem)) return "paused";
        s.pending = null;
      }
      if (!here()) return; // it was cast
      log(s, `${defOf(s, o!).name} is put into ${player(s, o!.owner).name}'s graveyard (madness).`);
      moveObject(s, o!.id, "graveyard");
      return;
    }
    case "miracle": {
      // CR 702.94a: cast it for its miracle cost as this resolves, ignoring timing; only while it's still in its owner's
      // hand as the card that was revealed (CR 400.7).
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "hand" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return;
      sc.may = false;
      o.miracleRevealed = undefined; // no longer revealed once the ability resolves (CR 702.94b)
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "miracle" };
      const problem = castProblem(s, ctx.controller, o.id);
      if (problem === null || /^not enough mana/.test(problem)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast for its miracle cost.`);
      return;
    }
    case "castFromHand": {
      // Cast as this resolves, ignoring timing based on its card type; X is 0, no alternative costs, but additional
      // costs are paid (rulings on the Expertises, CR 118.9, 107.3b). Lands can't be cast.
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (sc.castFromHand === "cast" || sc.castFromHand === "none") return;
      const castable = (id: ObjectId) => {
        s.pending = { kind: "castFree", player: p.id, objectId: id, source: src };
        const problem = castProblem(s, p.id, id);
        s.pending = null;
        return problem === null || /^not enough mana/.test(problem);
      };
      if (sc.castFromHand === undefined) {
        // "With mana value X or less": this spell's X (TargetSpec.xRange).
        const { xRange, ...rest } = e.filter;
        const filter: TargetSpec = xRange ? { ...rest, manaValue: { max: ctx.x ?? 0 } } : rest;
        // "Draw three cards and reveal them": the ones still in hand, which everyone sees (CR 701.20a).
        const drawn = e.drawn ? (s.resolving!.drawnThisWay ?? []).filter((id) => p.hand.includes(id)) : undefined;
        if (drawn?.length) log(s, `${p.name} reveals ${drawn.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
        const options = (drawn ?? p.hand).filter((id) => !isType(defOf(s, obj(s, id)), "Land") && printedMatches(filter, defOf(s, obj(s, id))) && castable(id));
        if (!options.length) {
          log(s, drawn ? `${p.name} can't cast any of them.` : `${p.name} has no ${filter.text.replace(/^an? /, "")} in hand to cast.`);
          return;
        }
        const text = filter.text.replace(/^(?!an? )/, /^[aeiou]/i.test(filter.text) ? "an " : "a ");
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "castFromHand", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name), "Don't cast"], prompt: drawn ? "cast one of the cards you drew without paying its mana cost?" : `cast ${text} from your hand without paying its mana cost?` };
        return "paused";
      }
      const id = sc.castFromHand;
      sc.castFromHand = "cast";
      if (!s.objects[id] || obj(s, id).zone !== "hand" || !castable(id)) return;
      s.pending = { kind: "castFree", player: p.id, objectId: id, source: src };
      return "paused";
    }
    case "castFromAmong": {
      // Exiled face up (CR 406.3), then cast one at a time as this resolves, ignoring timing (CR 608.2g); X is 0 and
      // no alternative costs (CR 107.3b, 118.9). The total counts the spells' mana values on the stack, which for a
      // card cast without paying its mana cost is its own with X as 0 (rulings on Primeval Spawn). Lands can't be cast.
      const sc = (s.resolving!.scratch ??= {});
      const you = player(s, ctx.controller);
      if (!sc.castAmong) {
        const whose = players(s, e.who, ctx)[0];
        if (whose === undefined) return;
        const lib = player(s, whose).library;
        const ids = lib.slice(0, amountNow(s, e.n, ctx));
        for (const id of ids) moveObject(s, id, "exile");
        log(s, `${player(s, whose).name} exiles ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from the top of their library.`);
        sc.castAmong = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}), ...(e.maxMv !== undefined ? { maxMv: amountNow(s, e.maxMv, ctx) } : {}) };
      }
      const st = sc.castAmong;
      if (st.done) return;
      const mvOf = (id: ObjectId) => manaValue(parseManaCost(defOf(s, obj(s, id)).manaCost));
      const exiled = (id: ObjectId) => st.ids.some((x) => x.id === id && s.objects[id]?.zone === "exile" && (s.objects[id]!.zoneChanges ?? 0) === x.zc);
      if (st.casting) {
        // Cast: it's on the stack now (a new object, CR 400.7); declined: it stays in exile.
        if (exiled(st.casting)) st.declined.push(st.casting);
        else if (st.budget !== undefined) st.budget -= mvOf(st.casting);
        st.casting = undefined;
      }
      if (st.pick !== undefined) {
        const pick = st.pick;
        st.pick = undefined;
        if (pick === "none" || !exiled(pick)) {
          st.done = true;
          return;
        }
        st.casting = pick;
        s.pending = { kind: "castFree", player: you.id, objectId: pick, source: src };
        return "paused";
      }
      const castable = (id: ObjectId) => {
        s.pending = { kind: "castFree", player: you.id, objectId: id, source: src };
        const problem = castProblem(s, you.id, id);
        s.pending = null;
        return problem === null || /^not enough mana/.test(problem);
      };
      const options = st.ids
        .map((x) => x.id)
        .filter((id) => exiled(id) && !st.declined.includes(id) && !isType(defOf(s, obj(s, id)), "Land") && (st.maxMv === undefined || mvOf(id) <= st.maxMv) && (st.budget === undefined || mvOf(id) <= st.budget) && castable(id));
      if (!options.length) {
        st.done = true;
        return;
      }
      const left = st.budget !== undefined ? ` (total mana value ${st.budget} left)` : "";
      s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name), "Done"], prompt: `cast a spell from among the exiled cards without paying its mana cost${left}?` };
      return "paused";
    }
    case "suspendTick": {
      // CR 702.62a: "At the beginning of your upkeep, if this card is suspended, remove a time counter from it."
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc || !isSuspended(s, o)) return;
      const left = o.counters.time! - 1;
      if (left > 0) o.counters.time = left;
      else delete o.counters.time;
      log(s, `${defOf(s, o).name} loses a time counter${left ? ` (${left} left)` : ""}.`);
      if (!left) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "time" });
      return;
    }
    case "suspendCast": {
      // CR 702.62a: "you may play it without paying its mana cost if able. If you don't, it remains exiled."
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      sc.may = false;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "suspend" };
      if (castProblem(s, ctx.controller, o.id) === null) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast; it stays in exile.`);
      return;
    }
    case "exileSpell":
    case "exileSelfWithTime": {
      const item = s.resolving?.item;
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      if (!o || o.zone !== "stack") return;
      const name = defOf(s, o).name;
      moveObject(s, o.id, "exile"); // a copy ceases to exist (CR 707.10a)
      const moved = s.objects[o.id];
      if (moved?.zone !== "exile") return;
      if (e.type === "exileSpell") {
        log(s, `${name} is exiled.`);
        return;
      }
      moved.counters.time = e.n;
      log(s, `${name} is exiled with ${e.n} time counter${e.n === 1 ? "" : "s"} on it.`);
      return;
    }
    case "destroy":
      for (const o of objects(s, e.what, ctx)) {
        // As it last existed, for "for each creature destroyed this way" (CR 608.2h).
        const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)) };
        if (destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, e.noRegen, ctx.controller) && s.resolving) (s.resolving.destroyed ??= []).push(before);
      }
      return;
    case "regenerate":
      for (const o of objects(s, e.what, ctx)) {
        o.regenShields = (o.regenShields ?? 0) + 1;
        log(s, `${defOf(s, o).name} gets a regeneration shield.`);
      }
      return;
    case "exile": {
      // "Until ~ leaves the battlefield": if it already left, nothing is exiled (CR 610.3a-b).
      const me = e.until ? objects(s, { ref: "self" }, ctx)[0] : undefined;
      if (e.until && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} exiles ${defOf(s, o).name}${e.until ? ` until ${src} leaves the battlefield` : ""}.`);
        // As it last existed, for "for each nontoken creature exiled this way" (CR 608.2h).
        const before = o.zone === "battlefield" ? { o: structuredClone(o), ch: structuredClone(characteristics(s, o)) } : undefined;
        moveObject(s, o.id, "exile");
        if (before && o.zone === "exile" && s.resolving) (s.resolving.exiled ??= []).push(before);
        if (me && o.zone === "exile") (me.exiledUntilLeaves ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
        // Linked to the source as it was when the ability triggered: if that object has already left, its
        // leaves ability has nothing to return, and the card stays exiled (CR 607.2a, rulings).
        if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
      }
      return;
    }
    case "grantFlashback": {
      // Locked to the cards there now (Past in Flames rulings); it ends with the turn (cleanup, CR 514.2).
      const each = e.each;
      const cards = each
        ? player(s, ctx.controller).graveyard.map((id) => obj(s, id)).filter((o) => printedMatches(each, defOf(s, o)))
        : e.what
          ? objects(s, e.what, ctx).filter((o) => o.zone === "graveyard")
          : [];
      for (const o of cards) (s.flashbackGrants ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
      if (cards.length) log(s, `${cards.length > 2 ? `${cards.length} cards` : cards.map((o) => defOf(s, o).name).join(" and ")} ${cards.length === 1 ? "gains" : "gain"} flashback until end of turn.`);
      return;
    }
    case "cipher":
      return cipher(s, ctx, src);
    case "haunt": {
      // "Exile it haunting target creature" (CR 702.55a-b): the card still in the graveyard it was put into, onto the
      // creature targeted, if that's still legal (a single target that's illegal means the ability does nothing at all,
      // CR 608.2b, so the card stays in the graveyard).
      const card = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const t = ctx.targets[0];
      const host = t?.kind === "object" && ctx.legal[0] ? s.objects[t.id] : undefined;
      if (!card || card.zone !== "graveyard" || (card.zoneChanges ?? 0) !== (ctx.sourceZc ?? 0) || host?.zone !== "battlefield") return;
      moveObject(s, card.id, "exile");
      if (s.objects[card.id]?.zone !== "exile") return;
      card.haunting = { id: host.id, zc: host.zoneChanges ?? 0 };
      log(s, `${defOf(s, card).name} is exiled haunting ${defOf(s, host).name}.`);
      return;
    }
    case "playLinked": {
      // The card this permanent's hideaway exiled, still the same object in exile (CR 400.7, 607.2a), played as this
      // resolves (rulings: it can't wait). Asked once; a land goes through "you may" since it isn't cast.
      const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      const linked = s.linkedExile?.[key] ?? [];
      const card = linked.map((l) => ({ o: s.objects[l.id], zc: l.zc })).find((x) => x.o && x.o.zone === "exile" && (x.o.zoneChanges ?? 0) === x.zc)?.o;
      const sc = (s.resolving!.scratch ??= {});
      if (!card) return;
      const p = player(s, ctx.controller);
      const d = defOf(s, card);
      if (!sc.playLinked) {
        sc.playLinked = true;
        if (isType(d, "Land")) {
          // A land is played only on your turn, with a land play left (CR 305.2b, 305.3).
          if (s.activePlayer !== p.id || p.landsPlayedThisTurn >= landsAllowed(s, p.id)) {
            log(s, `${p.name} can't play ${d.name} now.`);
            return;
          }
          s.pending = { kind: "chooseMay", player: p.id, prompt: `play ${d.name} without paying its mana cost`, source: src, card: card.id };
          return "paused";
        }
        s.pending = { kind: "castFree", player: p.id, objectId: card.id, source: src };
        if (castProblem(s, p.id, card.id) === null) return "paused";
        s.pending = null;
        log(s, `${d.name} can't be cast.`);
        return;
      }
      if (isType(d, "Land") && sc.may) {
        p.landsPlayedThisTurn++;
        moveObject(s, card.id, "battlefield");
        log(s, `${p.name} plays ${d.name} from exile.`);
      }
      return;
    }
    case "returnLinked": {
      // The leaves ability triggered after the source moved, so the object it links to is the one before (CR 400.7).
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.flickered) {
        sc.flickered = (s.linkedExile?.[key] ?? []).filter((l) => !s.objects[l.id]?.isToken);
        delete s.linkedExile?.[key];
      }
      const cards = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      if (e.dest === "hand") {
        for (const c of cards) {
          log(s, `${src} returns ${defOf(s, c).name} to its owner's hand.`);
          moveObject(s, c.id, "hand");
        }
        return;
      }
      // Under their owners' control; an Aura's owner chooses what it enchants (CR 303.4f, Oblivion Ring rulings).
      return returnFromExile(s, cards, (c) => c.owner, src);
    }
    case "pick":
      return pickPermanents(s, e, ctx, src);
    case "sacrificeEach":
      return sacrificeEach(s, e, ctx, src);
    case "keepRest":
      return keepRest(s, e, ctx, src);
    case "empowerJace":
      return empowerJace(s, e.n, ctx, src);
    case "bounce": {
      // "If you win, return ~ to its owner's hand": a resolving spell goes from the stack to its owner's hand as part of
      // its resolution, never to the graveyard (Release the Ants rulings, CR 608.2n).
      const spell = e.what.ref === "self" && s.resolving?.item.kind === "spell" ? s.objects[s.resolving.item.objectId ?? ""] : undefined;
      if (spell?.zone === "stack") {
        log(s, `${src} returns to its owner's hand.`);
        moveObject(s, spell.id, "hand");
        return;
      }
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} returns ${defOf(s, o).name}${o.zone === "graveyard" ? " from the graveyard" : ""} to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      return;
    }
    case "putFromHand": {
      // The player picks as it resolves, among the matching cards in their hand (CR 608.2d); it isn't playing a land.
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!sc.found) {
        const cards = p.hand.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        if (!cards.length) return;
        const what = `${e.any ? "any number of " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}`;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.may ? 0 : 1, max: e.any ? cards.length : 1, fromHand: true };
        return "paused";
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "hand" && o.owner === p.id);
      // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g).
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: p.id })), src);
      if (hosts === "paused") return "paused";
      enterTogether(s, () => {
        for (const o of cards) {
          const host = hosts.get(o.id);
          if (defOf(s, o).subtypes.includes("Aura") && !host) {
            log(s, `${defOf(s, o).name} has nothing to enchant, so it stays in ${p.name}'s hand.`);
            continue;
          }
          log(s, `${p.name} puts ${defOf(s, o).name} from their hand onto the battlefield${e.tapped ? ", tapped" : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...host });
        }
      });
      return;
    }
    case "putOntoBattlefield": {
      const list = objects(s, e.what, ctx);
      const under = (o: GameObject) => (e.owner ? o.owner : ctx.controller);
      // Auras: their controller chooses what each enchants as it enters (CR 303.4f), all before any card moves; one with
      // nothing to enchant stays where it is (303.4g).
      const hosts = e.attachToSubject ? new Map<ObjectId, AuraHost>() : chooseAuraHosts(s, list.filter((o) => isPermanentCard(defOf(s, o))).map((o) => ({ o, under: under(o) })), src);
      if (hosts === "paused") return "paused";
      // "Put a +1/+1 counter on it": the permanents these cards became (CR 400.7), like tokens just created.
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const o of list) {
          const d = defOf(s, o);
          if (e.attachToSubject) {
            // An Aura returned "attached to that creature" (CR 303.4f): only to one it could enchant, protection
            // included (CR 303.4d); otherwise it stays where it is (CR 303.4g). Being attached isn't targeting.
            const enchant = compileCard(d).enchant;
            const host = ctx.subject && s.objects[ctx.subject.id];
            const ok = enchant?.kind === "object" && !!host && host.zone === "battlefield" && (host.zoneChanges ?? 0) === ctx.subject!.zc && objectMatches(s, enchant, host, ctx.controller, false, d);
            if (!ok) {
              log(s, `${d.name} can't be attached to that creature, so it stays in the graveyard.`);
              continue;
            }
            log(s, `${src} returns ${d.name} to the battlefield attached to ${defOf(s, host).name}.`);
            moveObject(s, o.id, "battlefield", { controller: ctx.controller, attachTo: host.id });
            continue;
          }
          if (!isPermanentCard(d)) continue;
          const host = hosts.get(o.id);
          if (d.subtypes.includes("Aura") && !host) {
            log(s, `${d.name} has nothing to enchant, so it stays ${o.zone === "graveyard" ? "in the graveyard" : "where it is"}.`);
            continue;
          }
          log(s, `${src} puts ${d.name} onto the battlefield under ${player(s, under(o)).name}'s control${e.tapped ? ", tapped" : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: under(o), tapped: e.tapped, ...(e.becomes ? { becomes: e.becomes } : {}), ...(e.counters ? { counters: e.counters } : {}), ...host }); // CR 110.2a
          // "That creature gains haste until end of turn. Exile it at the beginning of the next end step" (Corpse Dance): only
          // the permanent it became, while it's still that object (CR 400.7, rulings).
          if (o.zone !== "battlefield") continue;
          s.resolving?.created?.push(o.id);
          if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
          if (e.atEndStep)
            addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [e.atEndStep === "exile" ? { type: "exile", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${e.atEndStep === "exile" ? "Exile" : "Sacrifice"} ~.` });
        }
      });
      return;
    }
    case "randomFromGraveyard": {
      const p = player(s, ctx.controller);
      const pool = p.graveyard.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, s.objects[id]!)));
      if (!pool.length) return;
      const o = obj(s, pool[Math.floor(nextRandom(s) * pool.length)]!);
      const d = defOf(s, o);
      if (e.dest === "hand") {
        log(s, `${src} returns ${d.name}, chosen at random, from ${p.name}'s graveyard to their hand.`);
        moveObject(s, o.id, "hand");
      } else if (isPermanentCard(d) && d.types.includes("Creature") && !d.subtypes.includes("Aura")) {
        log(s, `${src}: ${d.name} is chosen at random and put onto the battlefield.`);
        moveObject(s, o.id, "battlefield", { controller: ctx.controller }); // CR 110.2a
      } else {
        log(s, `${src}: ${d.name} is chosen at random and exiled.`);
        moveObject(s, o.id, "exile");
      }
      return;
    }
    case "chooseFromGraveyard": {
      if (e.who?.ref === "eachPlayer") return eachFromGraveyard(s, e, ctx, src);
      const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (pid === undefined || player(s, pid).lost) return;
      const p = player(s, pid);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.found) {
        // Only permanent cards can be put onto the battlefield (CR 110.4b).
        const mvMax = e.mvMax === undefined ? undefined : amountNow(s, e.mvMax, ctx);
        const filter = e.filter && mvMax !== undefined ? { ...e.filter, manaValue: { max: mvMax }, text: e.filter.text.replace(/ X or less$/, ` ${mvMax} or less`) } : e.filter;
        const cards = p.graveyard.filter((id) => (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (e.dest !== "battlefield" || isPermanentCard(defOf(s, obj(s, id)))));
        const max = Math.min(e.n, cards.length);
        if (!max) return;
        const kind = filter?.text ?? "card";
        const what = e.n === 1 ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}` : `${e.upTo ? "up to " : ""}${e.n} ${kind.replace(/\bcard\b/, "cards")}`;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.upTo ? 0 : max, max, fromGraveyard: e.dest ?? "hand" };
        return "paused";
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id));
      if (e.dest === "battlefield") {
        // An Aura's controller chooses what it enchants as it enters (CR 303.4f), or it stays in the graveyard (303.4g).
        const hosts = chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: p.id })), src);
        if (hosts === "paused") return "paused";
        const ids = found.filter((id) => !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        if (ids.length) log(s, `${p.name} returns ${ids.map((id) => defOf(s, obj(s, id)).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} from their graveyard to the battlefield${e.tapped ? ", tapped" : ""}.`);
        enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...(e.counters ? { counters: { ...e.counters } } : {}), ...hosts.get(id) })));
        return;
      }
      const names = found.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (found.length) log(s, e.dest === "exile" ? `${p.name} exiles ${names} from their graveyard.` : `${p.name} returns ${names} from their graveyard to their hand.`);
      for (const id of found) moveObject(s, id, e.dest ?? "hand");
      return;
    }
    case "reorderGraveyard": {
      const p = player(s, ctx.controller);
      if (e.random) {
        shuffle(s, p.graveyard);
        log(s, `${src}: ${p.name} reorders their graveyard at random.`);
        return;
      }
      // Its owner arranges all of it (an exception to CR 404.2), then the resolution carries on (see graveyard.ts).
      const sc = (s.resolving!.scratch ??= {});
      if (sc.ordered) return;
      sc.ordered = true;
      return askWholeGraveyardOrder(s, p.id, src) ? "paused" : undefined;
    }
    case "returnAllFromGraveyard": {
      // All at once, as one move: under your control (CR 110.2a) or, with "under their owners' control", each owner's.
      // Only permanent cards can be put onto the battlefield (CR 110.4b). Which cards is fixed as it starts (Replenish
      // rulings), before any Aura's host is chosen; an Aura with nothing to enchant stays in the graveyard (CR 303.4g).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.found) {
        sc.found = [];
        // The active player chooses for their Auras first, then the others in turn order (APNAP, Open the Vaults rulings).
        for (const pid of apnap(s, players(s, e.who, ctx)))
          for (const id of player(s, pid).graveyard) {
            const d = defOf(s, s.objects[id]!);
            if (isPermanentCard(d) && printedMatches(e.filter, d)) sc.found.push(id);
          }
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "graveyard");
      const under = (o: GameObject) => (e.owners ? o.owner : ctx.controller);
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: under(o) })), src);
      if (hosts === "paused") return "paused";
      const ids = cards.filter((o) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id)).map((o) => o.id);
      if (ids.length) log(s, `${src} returns ${ids.map((id) => defOf(s, s.objects[id]!).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} to the battlefield${e.tapped ? ", tapped" : ""}.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: under(obj(s, id)), tapped: e.tapped, ...hosts.get(id) })));
      return;
    }
    case "putInGraveyard":
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} into their graveyard.`);
        moveObject(s, o.id, "graveyard");
      }
      return;
    case "putInLibrary":
      for (const o of objects(s, e.what, ctx)) {
        let position = e.position;
        if (position === "ownersChoice") {
          // Its owner chooses as it resolves; a token goes too, then ceases to exist (CR 111.7).
          const sc = (s.resolving!.scratch ??= {});
          if (!sc.topOrBottom) {
            s.pending = { kind: "chooseOption", player: o.owner, source: src, what: "topOrBottom", options: ["top", "bottom"], labels: ["Top", "Bottom"], prompt: `put ${defOf(s, o).name} on the top or bottom of your library?` };
            return "paused";
          }
          position = sc.topOrBottom as "top" | "bottom";
          sc.topOrBottom = undefined;
        }
        if (position === "second") {
          log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} into their library second from the top.`);
          moveObject(s, o.id, "library", { top: true });
          // Under the top card, if there is one (a commander may have gone to the command zone instead).
          const lib = player(s, o.owner).library;
          if (o.zone === "library" && lib[0] === o.id && lib.length > 1) [lib[0], lib[1]] = [lib[1]!, lib[0]!];
          continue;
        }
        log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} on the ${position} of their library.`);
        moveObject(s, o.id, "library", { top: position === "top" });
      }
      return;
    case "exileGraveyard":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = p.graveyard.length;
        for (const id of [...p.graveyard]) {
          // "Creature cards exiled this way": their power as it was in the graveyard (rulings on Szat's Will).
          const o = obj(s, id);
          if (s.resolving && objIsType(s, o, "Creature")) (s.resolving.exiledPowers ??= []).push(power(s, o));
          moveObject(s, id, "exile");
        }
        log(s, `${src} exiles ${p.name}'s graveyard (${n} card${n === 1 ? "" : "s"}).`);
      }
      return;
    case "flicker": {
      // Exiled, then returned together once any Aura's host is chosen (CR 303.4f).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.flickered) {
        sc.flickered = [];
        for (const o of objects(s, e.what, ctx)) {
          if (o.zone !== "battlefield") continue;
          const d = defOf(s, o);
          log(s, `${src} exiles ${d.name}${e.at ? "" : " and returns it"}.`);
          moveObject(s, o.id, "exile");
          if (o.isToken) continue; // a token that left the battlefield doesn't come back (CR 111.7)
          if (e.at)
            addDelayed(s, "nextEndStep", ctx.controller, o, {
              targets: [],
              effects: [{ type: "returnExiled", under: e.under, ...(e.counter ? { counter: e.counter } : {}) }],
              text: `Return ${d.name} to the battlefield under ${e.under === "owner" ? "its owner's" : "your"} control.`,
            });
          else sc.flickered.push({ id: o.id, zc: o.zoneChanges ?? 0 });
        }
      }
      const back = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      return returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counter);
    }
    case "returnExiled": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      return returnFromExile(s, [o], (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counter);
    }
    case "exileIfDies":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield" && (!e.ifCreature || objIsType(s, o, "Creature"))) o.exileIfDiesTurn = s.turn;
      return;
    case "noRegen":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield" && (!e.ifCreature || objIsType(s, o, "Creature"))) o.noRegenTurn = s.turn;
      return;
    case "lookAtHand":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const cards = p.hand.map((id) => defOf(s, obj(s, id)).name).join(", ") || "no cards";
        if (e.reveal) log(s, `${p.name} reveals their hand: ${cards}.`);
        else {
          log(s, `${player(s, ctx.controller).name} looks at ${p.name}'s hand.`);
          log(s, `${p.name}'s hand: ${cards}.`, ctx.controller);
        }
      }
      return;
    case "noCombatDamage":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.noCombatDamageTurn = s.turn;
      return;
    case "sacrifice":
      for (const o of objects(s, e.what, ctx)) {
        const by = controllerOf(s, o);
        if (by !== ctx.controller && !e.byController) continue; // only your own permanents (CR 701.21a)
        log(s, `${player(s, by).name} sacrifices ${characteristics(s, o).name}.`);
        moveObject(s, o.id, "graveyard", { sacrificed: true });
      }
      return;
    case "ninjutsu": {
      // Put this card onto the battlefield from your hand tapped and attacking whom the returned creature was
      // attacking (CR 702.49a, c). It was never declared as an attacker, so "whenever attacks" doesn't trigger (508.4).
      const id = ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      const zc = s.resolving?.item.sourceZc;
      if (!o || o.zone !== "hand" || o.owner !== ctx.controller || (zc !== undefined && (o.zoneChanges ?? 0) !== zc)) return;
      moveObject(s, o.id, "battlefield", { tapped: true });
      if ((o.zone as string) !== "battlefield") return;
      if (ctx.lki) enterAttacking(s, o, ctx.lki);
      log(s, `${player(s, ctx.controller).name} puts ${characteristics(s, o).name} onto the battlefield tapped${o.attacking !== undefined ? ` and attacking ${attackedName(s, o)}` : ""} (ninjutsu).`);
      return;
    }
    case "warpExile":
      for (const o of objects(s, { ref: "subject" }, ctx)) {
        log(s, `${defOf(s, o).name} is exiled (warp). Its owner may cast it after this turn.`);
        moveObject(s, o.id, "exile");
        // The card, while it stays exiled (CR 702.185a, 400.7); a token has stopped existing (CR 111.8).
        if (o.zone === "exile" && !o.isToken) o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "warp", turn: s.turn };
      }
      return;
    case "impulse": {
      // Exiled face up (CR 406.3); the permission belongs to this object only (CR 400.7).
      const p = player(s, ctx.controller);
      const ids = p.library.slice(0, amountNow(s, e.n, ctx));
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn };
      }
      if (ids.length)
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library and may play ${ids.length === 1 ? "it" : "them"}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : ""}.`);
      return;
    }
  }
}

/**
 * A permanent put onto the battlefield attacking whom a returned creature was attacking: ninjutsu (CR 702.49c), sneak
 * (CR 702.190b). It was never declared as an attacker (CR 506.3a, 508.4). A planeswalker that's gone, or a player
 * who has left, leaves it not attacking (CR 506.3c). Whether it's attacking now.
 */
export function enterAttacking(s: GameState, o: GameObject, returned: LastKnown): boolean {
  const defender = returned.attacking;
  const pw = returned.attackingPermanent;
  if (defender === undefined || !inCombat(s) || !livingPlayers(s).includes(defender)) return false;
  o.attacking = defender;
  if (pw) {
    o.attackingPermanent = pw;
    if (!attackedPlaneswalker(s, o)) {
      o.attacking = undefined;
      o.attackingPermanent = undefined;
      return false;
    }
  }
  return true;
}

import type { Amount, CounterKind, Effect, TargetSpec, TokenSpec } from "../abilities";
import { abilitiesOf, canBeSacrificed, cardIdOf, defOf, isPermanentCard, isType, objIsType, power } from "../cards";
import { nameLandBan } from "../names";
import { attackablePermanentProblem, attackedName, attackedPlaneswalker, attackingPermanentOf, auraHostKey, auraHostLabels, auraHostName, auraHostOf, auraHostOptions, type AuraHost, castProblem, destroyPermanent, landsAllowed, livingPlayers, log, moveObject, enterTogether, nameOf, newObject, obj, pairable, pairCandidates, pairCreatures, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters, withPutter } from "../counters";
import { manaValue } from "../mana";
import type { GameObject, GameState, LastKnown, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, objectMatches, pickOptions, printedMatches } from "./targeting";
import { ResolveCtx, apnap, objects, players, amountNow, amountCtx, amountFor, runEffect } from "./resolve";
import { createToken, tokenCopies } from "./run-tokens";
import { compileCard } from "../oracle";
import { nextRandom, shuffle } from "../rng";
import { askWholeGraveyardOrder } from "../graveyard";
import { foundWith, newObjects } from "../mutate";
import { addDelayed, paidUnless, removeCopy } from "./run-spells";
import { toBottom } from "./run-library";
import { attackDefault, fireEvent, inCombat } from "./triggers";
import { asFace, defMv, registerFace, sameName, transformedFace } from "../faces";
import { meld, meldPartners } from "../meld";

/** A suspended card (CR 702.62b): in exile, with suspend and a time counter on it. */
export function isSuspended(s: GameState, o: GameObject): boolean {
  return o.zone === "exile" && (o.counters.time ?? 0) > 0 && !!compileCard(defOf(s, o)).suspend;
}

/**
 * Put exiled cards onto the battlefield, all at once: an Aura's new controller chooses what it enchants as it enters,
 * and with nothing it can enchant it stays in exile (CR 303.4f-g, rulings on Flicker of Fate).
 */
function returnFromExile(s: GameState, cards: GameObject[], under: (c: GameObject) => PlayerId, src: string, counter?: CounterKind, tapped?: boolean, transformed?: boolean): "paused" | void {
  // Returned transformed: only a double-faced card, with its back face up (CR 712.14a); anything else stays in exile.
  const back = cards.filter((c) => (transformed ? transformedFace(s, c) !== undefined : isPermanentCard(defOf(s, c))));
  const faceOf = (c: GameObject) => (transformed ? transformedFace(s, c) : undefined);
  const hosts = chooseAuraHosts(s, back.map((o) => ({ o, under: under(o), face: faceOf(o) })), src);
  if (hosts === "paused") return "paused";
  enterTogether(s, () => {
    for (const c of back) {
      const d = asFace(s, c, faceOf(c), () => defOf(s, c));
      const host = hosts.get(c.id);
      if (d.subtypes.includes("Aura") && !host) {
        log(s, `${d.name} has nothing to enchant, so it stays in exile.`);
        continue;
      }
      log(s, `${src} returns ${d.name} to the battlefield${tapped ? " tapped" : ""}${transformed ? " transformed" : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
      moveObject(s, c.id, "battlefield", { controller: under(c), ...host, ...(counter ? { counters: { [counter]: 1 } } : {}), ...(tapped ? { tapped: true } : {}), ...(transformed ? { face: transformedFace(s, c) } : {}) });
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
export function chooseAuraHosts(s: GameState, cards: { o: GameObject; under: PlayerId; face?: number }[], src: string): "paused" | Map<ObjectId, AuraHost> {
  const sc = (s.resolving!.scratch ??= {});
  const hosts = (sc.auraHosts ??= {});
  for (const { o, under, face } of cards) {
    // A card entering transformed is an Aura, and enchants, as its back face (CR 712.14a, 303.4f).
    const d = asFace(s, o, face, () => defOf(s, o));
    if (!d.subtypes.includes("Aura") || hosts[o.id] !== undefined) continue;
    const options = asFace(s, o, face, () => auraHostOptions(s, o, under));
    if (options.length <= 1) {
      hosts[o.id] = options[0] ? auraHostKey(options[0]) : "none";
      continue;
    }
    sc.auraAsking = o.id;
    s.pending = { kind: "chooseOption", player: under, source: src, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose what ${d.name} enchants as it enters` };
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
  let who = players(s, e.who, ctx);
  // Each player's own number when it's "half the creatures they control" (CR 107.1a), all worked out before anyone picks.
  const nFor = amountFor(s, e.n, ctx, who);
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
    r.couldntPick = [];
  }
  // Among another player's permanents (Split the Party): the first of them, if they're still in the game.
  const among = e.among ? players(s, e.among, ctx)[0] : undefined;
  while (sc.queue.length) {
    const pid = sc.queue[0]!;
    const n = nFor[pid] ?? 0;
    // "One of those Dragons" (Zurgo and Ojutai): those still on the battlefield as the objects they were, whoever controls them now.
    const group = e.fromGroup ? (ctx.event?.group ?? []).filter((g) => s.objects[g.id]?.zone === "battlefield" && (obj(s, g.id).zoneChanges ?? 0) === g.zc).map((g) => g.id) : undefined;
    const options = group ?? (e.among ? (among === undefined ? [] : pickOptions(s, e, among, ctx.sourceId)) : pickOptions(s, e, pid, ctx.sourceId));
    // "Sacrifice any number of other creatures": as many as they like, asked even with only one.
    if (e.anyNumber) {
      if (!options.length) {
        sc.chosen![pid] = [];
        sc.queue.shift();
        continue;
      }
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.filter.text, options, count: options.length, min: 0, anyNumber: true };
      return "paused";
    }
    if (!n) {
      sc.chosen![pid] = [];
      sc.queue.shift();
      continue;
    }
    // "Each player who can't discards a card" (Plaguecrafter): who had none.
    if (!options.length) (r.couldntPick ??= []).push(pid);
    if (options.length > n) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.least ? `${e.filter.text} with the least toughness` : e.greatest ? `${e.filter.text} with the greatest ${e.greatest === "power" ? "power" : "mana value"}` : e.filter.text, options, count: n, ...(e.counter ? { counter: e.counter.kind } : {}), ...(among !== undefined && among !== pid ? { of: among } : {}) };
      return "paused";
    }
    sc.chosen![pid] = options;
    sc.queue.shift();
  }
  // "Put a +1/+1 counter on a creature you control. It gains ...": "it" is the one picked, while it's that object (CR 400.7).
  if ((e.action === "counters" || e.action === "choose") && s.resolving) s.resolving.created = apnap(s, who).flatMap((pid) => sc.chosen?.[pid] ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
  for (const pid of apnap(s, who))
    for (const id of sc.chosen?.[pid] ?? []) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.action === "choose") {
        log(s, `${player(s, pid).name} chooses ${defOf(s, o).name}.`);
        continue;
      }
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
      // As it last existed, for a reflexive trigger: "When you do, ~ deals damage equal to that creature's power" (CR 608.2h).
      if (e.action === "sacrifice" && s.resolving) {
        const ch = characteristics(s, o);
        (s.resolving.sacrificedThisWay ??= []).push({ power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), controller: pid, types: [...ch.types] });
      }
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
    const own = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && canBeSacrificed(s, obj(s, id)));
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
    const whose = e.youChoose ? ` in ${pid === ctx.controller ? "your" : `${p.name}'s`} graveyard` : "";
    s.pending = { kind: "searchLibrary", player: e.youChoose ? ctx.controller : pid, source: src, what: `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}${whose}`, cards, min: e.upTo ? 0 : max, max, fromGraveyard: "battlefield" };
    return "paused";
  }
  sc.yardPicks = undefined;
  // Each under its owner's control, or all under yours when you chose them (Breach the Multiverse, CR 110.2a).
  const moves = Object.entries(yp.picked).flatMap(([pid, ids]) => ids.filter((id) => s.objects[id]?.zone === "graveyard").map((id) => ({ id, pid: Number(pid) as PlayerId })));
  const under = (pid: PlayerId) => (e.youChoose ? ctx.controller : pid);
  for (const { id, pid } of moves) log(s, e.youChoose ? `${player(s, ctx.controller).name} puts ${defOf(s, obj(s, id)).name} from ${pid === ctx.controller ? "their" : `${player(s, pid).name}'s`} graveyard onto the battlefield.` : `${player(s, pid).name} returns ${defOf(s, obj(s, id)).name} from their graveyard to the battlefield.`);
  enterTogether(s, () => moves.forEach(({ id, pid }) => moveObject(s, id, "battlefield", { controller: under(pid), ...(e.tapped ? { tapped: true } : {}) })));
}

/**
 * "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield" (Show and
 * Tell, Iwamori, Tempting Wurm, Kynaios and Tiro): the active player first, then the others in turn order, each choosing
 * a card without revealing it (CR 101.4, 101.4a, rulings), so no one sees the others' picks; then all the chosen cards
 * enter at the same time, each under its owner's control. Choices those cards need as they enter (an Aura's host, a
 * Clone's copy) are made after all players have chosen, in APNAP order (rulings on Show and Tell).
 */
function eachPutFromHand(s: GameState, e: Extract<Effect, { type: "putFromHand" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const hp = (sc.handPicks ??= { queue: apnap(s, players(s, e.who!, ctx)), picked: {} });
  const filter = e.filter && bindBound(s, e.filter, amountCtx(s, ctx));
  while (hp.queue.length) {
    const pid = hp.queue[0]!;
    const p = player(s, pid);
    if (sc.found) {
      hp.picked[pid] = sc.found.filter((id) => p.hand.includes(id));
      sc.found = undefined;
      log(s, hp.picked[pid]!.length ? `${p.name} chooses ${hp.picked[pid]!.length === 1 ? "a card" : `${hp.picked[pid]!.length} cards`} from their hand.` : `${p.name} chooses no card.`);
      hp.queue.shift();
      continue;
    }
    const cards = p.lost ? [] : p.hand.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
    if (!cards.length) {
      hp.queue.shift();
      continue;
    }
    const what = `${e.any ? "any number of " : /^[aeiou]/i.test(e.filter?.text ?? "card") ? "an " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}`;
    s.pending = { kind: "searchLibrary", player: pid, source: src, what, cards, min: 0, max: e.any ? cards.length : 1, fromHand: true };
    return "paused";
  }
  const picks = apnap(s, Object.keys(hp.picked).map(Number) as PlayerId[]).flatMap((pid) => hp.picked[pid]!.filter((id) => obj(s, id).zone === "hand").map((id) => ({ o: obj(s, id), under: pid })));
  s.resolving!.choseThisWay = apnap(s, Object.keys(hp.picked).map(Number) as PlayerId[]).filter((pid) => hp.picked[pid]!.length);
  // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g). It can't
  // enchant a card entering with it, which isn't on the battlefield yet.
  const hosts = chooseAuraHosts(s, picks, src);
  if (hosts === "paused") return "paused";
  if (s.resolving) s.resolving.created = [];
  enterTogether(s, () => {
    for (const { o, under } of picks) {
      const host = hosts.get(o.id);
      const name = defOf(s, o).name;
      if (defOf(s, o).subtypes.includes("Aura") && !host) {
        log(s, `${name} has nothing to enchant, so it stays in ${player(s, under).name}'s hand.`);
        continue;
      }
      log(s, `${player(s, under).name} puts ${name} from their hand onto the battlefield${e.tapped ? ", tapped" : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
      moveObject(s, o.id, "battlefield", { controller: under, ...(e.tapped ? { tapped: true } : {}), ...host });
      if (o.zone === "battlefield") s.resolving?.created?.push(o.id);
    }
  });
  sc.handPicks = undefined;
  // What happens to those who did or didn't comes next ("then each opponent who didn't draws a card").
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
  const keptAll: ObjectId[] = [];
  for (const pid of who) {
    const kept = new Set(kr.kept[pid] ?? []);
    if (kept.size && e.counter) {
      // Promise of Loyalty: each player puts the counter on theirs (who puts it matters to Vorinclex and the like).
      for (const id of kept) {
        if (s.objects[id]?.zone !== "battlefield") continue;
        const put = withPutter(pid, () => putCounters(s, obj(s, id), e.counter!, 1));
        log(s, `${player(s, pid).name} puts ${put === 1 ? "a" : put} ${e.counter} counter${put === 1 ? "" : "s"} on ${nameOf(s, id)}.`);
      }
      invalidateCharacteristics(s);
    } else if (kept.size) log(s, `${player(s, pid).name} keeps ${[...kept].map((id) => nameOf(s, id)).join(", ")}.`);
    keptAll.push(...kept);
    gone.push(...among(pid).filter((id) => !kept.has(id)));
  }
  if (e.counter && s.resolving) s.resolving.created = keptAll.filter((id) => s.objects[id]?.zone === "battlefield");
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
    const options = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature") && canBeSacrificed(s, obj(s, id)));
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
/**
 * "Exile them, then meld them into ..." (CR 701.42a, meld.ts): ~, still the object with the ability (CR 400.7), and a
 * permanent named its counterpart, if you both own and control them (and both are attacking). With several of that name,
 * you choose the one exiled (rulings). "It enters tapped and attacking": you choose what it attacks (rulings on Mishra,
 * Lost to Phyrexia), during combat only (CR 506.3d).
 */
function runMeld(s: GameState, e: Extract<Effect, { type: "meld" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!me || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
  const pid = ctx.controller;
  const options = meldPartners(s, me.id, pid, e.partnerType, e.attacking);
  if (!options.length) return;
  const sc = (s.resolving!.scratch ??= {});
  if (options.length > 1 && !sc.chosen?.[pid]?.length) {
    sc.queue = [pid];
    sc.chosen = {};
    s.pending = { kind: "pickPermanents", player: pid, source: src, action: "meld", what: `${e.partnerType.toLowerCase()} named ${characteristics(s, options[0]!).name}`, options: options.map((o) => o.id), count: 1 };
    return "paused";
  }
  const partner = options.length > 1 ? sc.chosen![pid]![0]! : options[0]!.id;
  const attackOptions = e.attacking && inCombat(s) ? attackChoices(s, pid, me.id) : [];
  if (attackOptions.length > 1 && sc.attackWhom === undefined) {
    s.pending = { kind: "chooseOption", player: pid, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what the melded permanent attacks` };
    return "paused";
  }
  const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
  meld(s, me.id, partner, pid, attack && { player: attack.player, ...(attack.planeswalker ? { planeswalker: attack.planeswalker } : {}) });
}

export function runZonesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "commanderToHand": {
      // "Your commander" is a commander you own (CR 903.3); in the command zone as this resolves, or nothing happens.
      const p = player(s, ctx.controller);
      const mine = p.command.filter((id) => obj(s, id).isCommander && obj(s, id).owner === p.id);
      if (!mine.length) return;
      const sc = (s.resolving!.scratch ??= {});
      if (mine.length > 1 && (sc.commander === undefined || !mine.includes(sc.commander))) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "commander", options: mine, labels: mine.map((id) => defOf(s, obj(s, id)).name), prompt: "put which commander into your hand?" };
        return "paused";
      }
      const id = mine.length > 1 ? sc.commander! : mine[0]!;
      sc.commander = undefined;
      log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their hand from the command zone.`);
      moveObject(s, id, "hand");
      return;
    }
    case "meld":
      return runMeld(s, e, ctx, src);
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
      // same object (CR 400.7), under its owner's control; a merged permanent's cards each return (730.3c).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const cards = [...(me && (me.zoneChanges ?? 0) === ctx.sourceZc ? [me] : []), ...foundWith(s, ctx.lki, ctx.sourceId)].filter((o) => o.zone === "graveyard");
      if (!cards.length) return;
      log(s, `${src} returns to the battlefield${e.counter ? ` with a ${e.counter} counter on it` : ""}${cards.length > 1 ? ` (${cards.map((o) => defOf(s, o).name).join(", ")})` : ""}.`);
      enterTogether(s, () => cards.forEach((o) => moveObject(s, o.id, "battlefield", { controller: o.owner, ...(e.counter ? { counters: { [e.counter]: 1 } } : {}) })));
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
    case "castTargetFree": {
      // Cast as this resolves, or not (CR 608.2g); then "if that spell would be put into your graveyard, exile it
      // instead" applies to the spell it became.
      const sc = (s.resolving!.scratch ??= {});
      if (sc.castingTarget !== undefined) {
        const o = s.objects[sc.castingTarget];
        const d = o && defOf(s, o);
        if (o?.zone === "stack" && e.exileAfter && (e.exileAfter === true || isType(d!, "Instant") || isType(d!, "Sorcery"))) o.exileIfToGraveyard = true;
        return;
      }
      const o = objects(s, e.what, ctx)[0];
      if (!o || o.zone !== "graveyard") return;
      sc.castingTarget = o.id;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src };
      if (castProblem(s, ctx.controller, o.id) === null) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast.`);
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
        // "With mana value less than or equal to the other result" (TargetSpec.bound): as it resolves.
        const { xRange, ...rest } = bindBound(s, e.filter, amountCtx(s, ctx));
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
        if (e.each) {
          // Etali: the top card of each player's library, all exiled at once.
          // Etali, Primal Conqueror: each player's cards down to their first nonland card, all of them if there's none.
          const upTo = (lib: ObjectId[]) => {
            if (!e.untilNonland) return lib.slice(0, amountNow(s, e.n, ctx));
            const at = lib.findIndex((id) => !isType(defOf(s, obj(s, id)), "Land"));
            return at < 0 ? [...lib] : lib.slice(0, at + 1);
          };
          const ids = livingPlayers(s).flatMap((pid) => upTo(player(s, pid).library));
          for (const id of ids) moveObject(s, id, "exile");
          log(s, ids.length ? `${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} exiled from the top of each library.` : "No library has a card to exile.");
          sc.castAmong = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
        }
      }
      if (!sc.castAmong && e.fromYard) {
        // Mizzix's Mastery: the target card if it's still legal, or (overloaded) each one in your graveyard, all exiled.
        const ids = e.fromYard.target !== undefined ? objects(s, { ref: "target", index: e.fromYard.target }, ctx).map((o) => o.id) : you.graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        if (gone.length) log(s, `${you.name} exiles ${gone.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard.`);
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong) {
        const whose = players(s, e.who, ctx)[0];
        if (whose === undefined) return;
        const lib = player(s, whose).library;
        let ids = lib.slice(0, amountNow(s, e.n, ctx));
        if (e.untilMv !== undefined) {
          // A card's mana value with X as 0 (CR 202.3e); lands count 0. All of them if the total never gets there.
          let total = 0;
          const at = lib.findIndex((id) => (total += defMv(defOf(s, obj(s, id)))) >= e.untilMv!);
          ids = lib.slice(0, at < 0 ? lib.length : at + 1);
        }
        let hits: ObjectId[] | undefined;
        if (e.untilHits) {
          // All of the library if it never has that many (like other "until" exiles).
          hits = [];
          let at = -1;
          for (let i = 0; i < lib.length && hits.length < e.untilHits.n; i++) if (printedMatches(e.untilHits.filter, defOf(s, obj(s, lib[i]!)))) (hits.push(lib[i]!), (at = i));
          ids = hits.length < e.untilHits.n ? [...lib] : lib.slice(0, at + 1);
        }
        for (const id of ids) moveObject(s, id, "exile");
        log(s, `${player(s, whose).name} exiles ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from the top of their library.`);
        sc.castAmong = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}), ...(e.maxMv !== undefined ? { maxMv: amountNow(s, e.maxMv, ctx) } : {}), ...(hits ? { hits } : {}) };
      }
      const st = sc.castAmong;
      if (st.done) return;
      const mvOf = (id: ObjectId) => defMv(defOf(s, obj(s, id)));
      const exiled = (id: ObjectId) => st.ids.some((x) => x.id === id && s.objects[id]?.zone === "exile" && (s.objects[id]!.zoneChanges ?? 0) === x.zc);
      // Done: the exiled cards that weren't cast go where `rest` says (rulings on Muse Vortex: all the instants and
      // sorceries to your hand if you cast none; on Epic Experiment: one that couldn't be cast goes too).
      const finish = (): "paused" | undefined => {
        st.done = true;
        let left = st.ids.map((x) => x.id).filter(exiled);
        if (e.hitToHand) {
          // "Put one of them into your hand": the one not cast; if neither was, the one you pick, and the other stays
          // exiled (rulings on Invasion of Alara).
          const hits = (st.hits ?? []).filter(exiled);
          const named = st.handPick ? st.pick : undefined;
          st.pick = undefined;
          if (hits.length === 2 && !named) {
            st.done = undefined;
            st.handPick = true;
            s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options: hits, labels: hits.map((id) => defOf(s, obj(s, id)).name), prompt: "put which of them into your hand? The other stays exiled." };
            return "paused";
          }
          const toHand = named && hits.includes(named) ? named : hits.length === 1 ? hits[0] : undefined;
          if (toHand) {
            moveObject(s, toHand, "hand");
            log(s, `${you.name} puts ${defOf(s, obj(s, toHand)).name} into their hand.`);
          }
          left = left.filter((id) => !(st.hits ?? []).includes(id));
        }
        if (!e.rest) return;
        const toHand = e.rest.toHand ? left.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) : [];
        for (const id of toHand) moveObject(s, id, "hand");
        if (toHand.length) log(s, `${you.name} puts ${toHand.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their hand.`);
        const others = left.filter((id) => !toHand.includes(id));
        if (e.rest.dest === "graveyard") {
          for (const id of others) moveObject(s, id, "graveyard");
          if (others.length) log(s, `${you.name} puts ${others.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their graveyard.`);
          return;
        }
        const byOwner = new Map<PlayerId, ObjectId[]>();
        for (const id of others) byOwner.set(obj(s, id).owner, [...(byOwner.get(obj(s, id).owner) ?? []), id]);
        for (const [owner, ids] of byOwner) toBottom(s, owner, ids, src, true);
        return;
      };
      if (st.casting && st.copyOf) {
        // A copy: one not cast ceases to exist (CR 704.5e); the card it copied stays exiled, copied once (rulings).
        if (s.objects[st.casting]?.zone === "exile") removeCopy(s, st.casting);
        else st.cast = (st.cast ?? 0) + 1;
        st.declined.push(st.copyOf);
        st.casting = st.copyOf = undefined;
      }
      if (st.casting) {
        // Cast: it's on the stack now (a new object, CR 400.7); declined: it stays in exile.
        if (exiled(st.casting)) st.declined.push(st.casting);
        else {
          if (st.budget !== undefined) st.budget -= mvOf(st.casting);
          st.cast = (st.cast ?? 0) + 1;
        }
        st.casting = undefined;
      }
      if (st.handPick) return finish();
      if (st.pick !== undefined) {
        const pick = st.pick;
        st.pick = undefined;
        if (pick === "none" || !exiled(pick)) return finish();
        st.casting = pick;
        if (e.copies) {
          // "Copy it, and you may cast the copy without paying its mana cost": made in exile and cast now (CR 707.12).
          const copy = newObject(s, defOf(s, obj(s, pick)), you.id, "exile");
          copy.spellCopy = true;
          you.exile.push(copy.id);
          log(s, `${src} copies ${defOf(s, obj(s, pick)).name}.`);
          st.casting = copy.id;
          st.copyOf = pick;
          s.pending = { kind: "castFree", player: you.id, objectId: copy.id, source: src };
          return "paused";
        }
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
        .filter((id) => exiled(id) && !st.declined.includes(id) && !isType(defOf(s, obj(s, id)), "Land") && (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) && (st.maxMv === undefined || mvOf(id) <= st.maxMv) && (st.budget === undefined || mvOf(id) <= st.budget) && (!st.hits || st.hits.includes(id)) && castable(id));
      if (!options.length || (e.max !== undefined && (st.cast ?? 0) >= e.max)) return finish();
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
    case "siegeDefeated": {
      // CR 310.12b: "exile it, then you may cast it transformed without paying its mana cost." Only a transforming
      // double-faced card can be cast transformed; anything else stays in exile (rulings).
      const sc = (s.resolving!.scratch ??= {});
      if (sc.may !== undefined) return; // asked already
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      const name = characteristics(s, o).name;
      moveObject(s, o.id, "exile");
      log(s, `${name} is defeated: it's exiled.`);
      sc.may = false;
      if ((o.zone as string) !== "exile" || o.isToken || s.cards[o.cardId]?.layout !== "transform") return;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "transformed" };
      if (castProblem(s, ctx.controller, o.id, undefined, undefined, undefined, undefined, undefined, { face: 1 }) === null) return "paused";
      s.pending = null;
      log(s, `${s.cards[registerFace(s, o, 1)]!.name} can't be cast; it stays in exile.`);
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
        // "If that creature dies this way": it was put into a graveyard (CR 700.4), not exiled or moved elsewhere instead.
        if (destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, e.noRegen, ctx.controller) && s.resolving) (s.resolving.destroyed ??= []).push({ ...before, ...(s.objects[o.id]?.zone === "graveyard" ? { died: true as const } : {}) });
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
        // A merged permanent's cards are all exiled with it, and found by what returns it (CR 730.3c).
        for (const l of newObjects(o)) {
          if (s.objects[l.id]?.zone !== "exile") continue;
          if (me) (me.exiledUntilLeaves ??= []).push(l);
          // Linked to the source as it was when the ability triggered: if that object has already left, its
          // leaves ability has nothing to return, and the card stays exiled (CR 607.2a, rulings).
          if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push(l);
          const card = s.objects[l.id]!;
          if (e.ownerMay && !card.isToken) {
            const m = e.ownerMay;
            const more = m.more && (!m.moreOpponents || card.owner !== ctx.controller) ? m.more : undefined;
            card.mayPlay = { player: card.owner, zc: card.zoneChanges ?? 0, until: "exiled", turn: s.turn, ...(m.play ? {} : { castOnly: true as const }), ...(m.free ? { free: true as const } : {}), ...(m.cost ? { cost: m.cost } : {}), ...(more ? { more } : {}) };
          }
        }
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
      const linked = e.revealed ? (s.resolving?.revealed ? [s.resolving.revealed] : []) : (s.linkedExile?.[key] ?? []);
      const from = e.revealed ? "library" : "exile";
      const card = linked.map((l) => ({ o: s.objects[l.id], zc: l.zc })).find((x) => x.o && x.o.zone === from && (x.o.zoneChanges ?? 0) === x.zc)?.o;
      const sc = (s.resolving!.scratch ??= {});
      if (!card) return;
      const p = player(s, ctx.controller);
      const d = defOf(s, card);
      if (!sc.playLinked) {
        sc.playLinked = true;
        if (isType(d, "Land")) {
          // A land is played only on your turn, with a land play left (CR 305.2b, 305.3).
          if (s.activePlayer !== p.id || p.landsPlayedThisTurn >= landsAllowed(s, p.id) || nameLandBan(s, p.id, d)) {
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
        log(s, `${p.name} plays ${d.name} from ${e.revealed ? "their library" : "exile"}.`);
      }
      return;
    }
    case "exileFaceDown": {
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      let ids: ObjectId[];
      if (e.from === "handCard") {
        if (!sc.faceDownPick) {
          if (!p.hand.length) return;
          sc.faceDownPick = true;
          delete sc.found;
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards: [...p.hand], min: 1, max: 1, dig: { looked: [...p.hand], to: "to exile face down", rest: "stay in your hand" }, hand: p.id };
          return "paused";
        }
        sc.faceDownPick = undefined;
        ids = (sc.found ?? []).filter((id) => obj(s, id).zone === "hand" && obj(s, id).owner === p.id);
      } else if (e.from === "hand") ids = (e.who ? players(s, e.who, ctx) : [p.id]).flatMap((pid) => [...player(s, pid).hand]);
      else {
        const n = e.n === undefined ? 1 : amountNow(s, e.n, ctx);
        ids = (e.who ? players(s, e.who, ctx) : [p.id]).flatMap((pid) => player(s, pid).library.slice(0, n));
      }
      const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      const done: ObjectId[] = [];
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        // Face down: only its controller may look, if the ability says so or lets them play it (CR 406.3; rulings on
        // Gonti: "you may look at and play").
        o.hiddenExile = { by: ctx.sourceId ?? "", seen: e.look || e.play ? [p.id] : [], label: "Face down" };
        if (ctx.sourceId) ((s.linkedExile ??= {})[key] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        // The permission belongs to this object only (CR 400.7), and to the player who exiled it, whoever controls the
        // source later (rulings on Gonti).
        if (e.play) {
          const { until, ...how } = e.play;
          const source = until === "source" && ctx.sourceId ? { source: { id: ctx.sourceId, zc: ctx.sourceZc ?? 0 } } : {};
          o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until, turn: s.turn, ...how, ...source };
        }
        if (e.endStepHand)
          addDelayed(s, "yourNextEndStep", p.id, o, { targets: [], effects: [{ type: "bounce", what: { ref: "subjectCard" }, hidden: true }], text: "Put that card into your hand." }, ctx.sourceDef.oracleId);
        if (e.upkeepGraveyard)
          addDelayed(s, "yourNextUpkeep", p.id, o, { targets: [], effects: [{ type: "putInGraveyard", what: { ref: "subjectCard" } }], text: "Put that card, if you didn't play it, into its owner's graveyard." }, ctx.sourceDef.oracleId);
        done.push(id);
      }
      s.resolving!.faceDownExiled = [...(s.resolving!.faceDownExiled ?? []), ...done];
      const n = done.length;
      const owners = [...new Set(done.map((id) => obj(s, id).owner))];
      const whose = owners.length === 1 && owners[0] === p.id ? "their" : owners.map((pid) => `${player(s, pid).name}'s`).join(" and ");
      log(s, `${p.name} exiles ${n === 1 ? "a card" : `${n} cards`} ${e.from === "top" ? `from the top of ${whose} library` : "from their hand"} face down with ${src}${e.play ? `, and may ${e.play.castOnly ? "cast" : "play"} ${n === 1 ? "it" : "them"}` : ""}.`);
      if ((e.look || e.play) && n) log(s, `You exiled ${done.map((id) => defOf(s, obj(s, id)).name).join(", ")} face down with ${src}.`, p.id);
      return;
    }
    case "moveLinked": {
      // Linked to the source as it is (an activated ability, a control change) or, after it left the battlefield, as it
      // was (CR 607.2a, 400.7).
      const zc = ctx.sourceZc ?? 0;
      const key = s.linkedExile?.[`${ctx.sourceId}@${zc}`] ? `${ctx.sourceId}@${zc}` : `${ctx.sourceId}@${zc - 1}`;
      const sc = (s.resolving!.scratch ??= {});
      const linked = (s.linkedExile?.[key] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
      let cards = linked.map((l) => obj(s, l.id)).filter((c) => (!e.yours || c.owner === ctx.controller) && !(e.other && s.resolving!.faceDownExiled?.includes(c.id)));
      const p = player(s, ctx.controller);
      if (e.one) {
        if (!sc.linkedPick) {
          if (!cards.length) return;
          sc.linkedPick = true;
          delete sc.found;
          const ids = cards.map((c) => c.id);
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card exiled with " + src, cards: ids, min: 1, max: 1, dig: { looked: ids, to: e.dest === "hand" ? "into your hand" : "into its owner's graveyard", rest: "stay exiled" } };
          return "paused";
        }
        sc.linkedPick = undefined;
        cards = cards.filter((c) => sc.found?.includes(c.id));
      }
      if (!cards.length) return;
      if (e.dest === "hand") log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} exiled with ${src} into their hand.`);
      else log(s, `${cards.map((c) => defOf(s, c).name).join(", ")} ${cards.length === 1 ? "goes" : "go"} from exile to ${cards.length === 1 ? "its owner's graveyard" : "their owners' graveyards"} (${src}).`);
      for (const c of cards) moveObject(s, c.id, e.dest);
      if (s.linkedExile?.[key]) s.linkedExile[key] = s.linkedExile[key]!.filter((l) => !cards.some((c) => c.id === l.id));
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
    case "keepDestroyRest": {
      // Mount Doom: chosen as it resolves (CR 608.2d), then the rest destroyed at once.
      const sc = (s.resolving!.scratch ??= {});
      const all = () => s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      if (!sc.chosen?.[ctx.controller]) {
        const options = all();
        if (!options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "keep", what: e.filter.text, options, count: Math.min(e.n, options.length), min: 0, destroy: true };
        return "paused";
      }
      const kept = new Set(sc.chosen[ctx.controller]!);
      sc.chosen = undefined;
      sc.queue = undefined;
      if (kept.size) log(s, `${player(s, ctx.controller).name} chooses ${[...kept].map((id) => nameOf(s, id)).join(", ")}.`);
      for (const id of all().filter((x) => !kept.has(x))) destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
      return;
    }
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
        if (e.hidden) {
          log(s, `${src} puts a card into ${player(s, o.owner).name}'s hand.`);
          log(s, `It's ${defOf(s, o).name}.`, o.owner);
        } else log(s, `${src} returns ${defOf(s, o).name}${o.zone === "graveyard" ? " from the graveyard" : ""} to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      return;
    }
    case "revealFromHand": {
      // You choose which of them to reveal as it resolves (CR 608.2d); revealing none is revealing "any number".
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!sc.found) {
        const filter = e.filter && bindChosen(e.filter, ctx.chosen);
        const cards = p.hand.filter((id) => !filter || printedMatches(filter, defOf(s, obj(s, id))));
        s.resolving!.revealedFromHand = 0;
        if (!cards.length) {
          log(s, e.bottom ? `${p.name} has no cards in hand to put on the bottom of their library.` : `${p.name} reveals no cards.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `any number of ${e.filter?.text ?? "card"}s`, cards, min: 0, max: cards.length, fromHand: true, ...(e.bottom ? { bottom: true as const } : { reveal: true as const }) };
        return "paused";
      }
      const shown = sc.found.filter((id) => p.hand.includes(id));
      sc.found = undefined;
      s.resolving!.revealedFromHand = shown.length;
      if (e.bottom) {
        // In the order picked, the first lowest (its owner orders them, CR 401.4).
        for (const id of [...shown].reverse()) moveObject(s, id, "library");
        log(s, `${p.name} puts ${shown.length === 1 ? "a card" : `${shown.length} cards`} from their hand on the bottom of their library.`);
        return;
      }
      log(s, shown.length ? `${p.name} reveals ${shown.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their hand.` : `${p.name} reveals no cards.`);
      return;
    }
    case "castNow": {
      const sc = (s.resolving!.scratch ??= {});
      if (sc.castNow === undefined) {
        const o = objects(s, e.what, ctx)[0];
        if (!o || o.zone !== "graveyard" || o.owner !== ctx.controller) return;
        if (e.unlessCast && (s.castThisTurn ?? []).some((c) => c.player === ctx.controller)) return;
        sc.castNow = { id: o.id };
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "paid" };
        // Mana abilities can still be activated to pay for it (CR 601.2g), so only the mana in the pool may be short.
        const problem = castProblem(s, ctx.controller, o.id);
        if (problem === null || /^not enough mana/.test(problem)) return "paused";
        s.pending = null;
        log(s, `${defOf(s, o).name} can't be cast.`);
        return;
      }
      const was = sc.castNow;
      const o = s.objects[was.id];
      // Cast: it moved from the graveyard to the stack as this was paused (casting doesn't count as a zone change here).
      const cast = !!o && o.zone === "stack";
      if (cast && e.thenNoMore) {
        (s.cantCastThisTurn ??= []).push({ player: ctx.controller, turn: s.turn, source: src });
        log(s, `${player(s, ctx.controller).name} can't cast additional spells this turn.`);
      }
      return;
    }
    case "mayCastFromGraveyard": {
      // The permission is this object's only (CR 400.7), and ends with the turn (cleanup, like an exiled card's).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "graveyard") continue;
        o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true };
        log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, o).name} from their graveyard this turn.`);
      }
      return;
    }
    case "exileHand": {
      const p = player(s, ctx.controller);
      const ids = [...p.hand];
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn };
      }
      s.resolving!.exiledFromHand = ids.length;
      log(s, ids.length ? `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their hand and may play them until the end of their next turn.` : `${p.name} has no cards in hand to exile.`);
      return;
    }
    case "putFromHand": {
      if (e.who) return eachPutFromHand(s, e, ctx, src);
      // The player picks as it resolves, among the matching cards in their hand (CR 608.2d); it isn't playing a land.
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!sc.found) {
        const filter = e.filter && bindBound(s, e.filter, amountCtx(s, ctx));
        // "With lesser power" (Shadowfax): its power in your hand, less than the source's, or the source's as it last
        // existed on the battlefield (rulings).
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        const most = !e.lesserPower ? Infinity : me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? power(s, me) : (ctx.lki?.power ?? (ctx.sourceId ? s.lastKnown?.[ctx.sourceId]?.power : undefined) ?? -Infinity);
        const cards = p.hand.filter((id) => (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (!e.lesserPower || power(s, obj(s, id)) < most));
        if (!cards.length) return;
        const what = `${e.any ? "any number of " : /^[aeiou]/i.test(e.filter?.text ?? "card") ? "an " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}`;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.may ? 0 : 1, max: e.any ? cards.length : 1, fromHand: true };
        return "paused";
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "hand" && o.owner === p.id);
      // "Tapped and attacking" (CR 508.4): only during combat, attacking a player its controller chooses as it enters (it
      // was never declared as an attacker, rulings on Kinscaer Sentry); outside combat it's only tapped (CR 506.3d).
      // "Attacking that opponent" (Kaalia): the player its creature attacked, even if it's attacking something else now, and
      // with that player gone, it isn't attacking (rulings).
      const eventFoe = e.attackingEvent ? ctx.event?.player : undefined;
      const attackOptions = !e.attacking || !cards.some((o) => isType(defOf(s, o), "Creature")) ? [] : e.attackingEvent ? (eventFoe !== undefined && eventFoe !== p.id && !player(s, eventFoe).lost && attackChoices(s, p.id, ctx.sourceId).length ? [{ key: String(eventFoe), label: player(s, eventFoe).name, player: eventFoe }] : []) : attackChoices(s, p.id, ctx.sourceId);
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        const name = defOf(s, cards[0]!).name;
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      const defender = attack?.player;
      // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g).
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: p.id })), src);
      if (hosts === "paused") return "paused";
      // "That creature gains haste": the permanents these cards became (CR 400.7), like tokens just created.
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const o of cards) {
          const host = hosts.get(o.id);
          if (defOf(s, o).subtypes.includes("Aura") && !host) {
            log(s, `${defOf(s, o).name} has nothing to enchant, so it stays in ${p.name}'s hand.`);
            continue;
          }
          const attacks = defender !== undefined && isType(defOf(s, o), "Creature");
          log(s, `${p.name} puts ${defOf(s, o).name} from their hand onto the battlefield${e.tapped ? ", tapped" : ""}${attacks ? ` and attacking ${attack!.label}` : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...host });
          if (attacks && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
            o.attacking = defender;
            if (attack?.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
          }
          if (o.zone !== "battlefield") continue;
          const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (me) o.putBy = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
          s.resolving?.created?.push(o.id);
          if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
          if (e.atEndStep) {
            const verb = e.atEndStep === "exile" ? "Exile" : e.atEndStep === "hand" ? "Return" : "Sacrifice";
            addDelayed(s, "nextEndStep", p.id, o, { targets: [], effects: [e.atEndStep === "exile" ? { type: "exile", what: { ref: "subject" } } : e.atEndStep === "hand" ? { type: "bounce", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${verb} ~${e.atEndStep === "hand" ? " to your hand" : ""}.` });
          }
        }
      });
      return;
    }
    case "putOntoBattlefield": {
      const list = objects(s, e.what, ctx);
      // Who controls ~ is watched from now on (CR 400.7): a ~ that has left by then never makes you sacrifice (Seraph rulings).
      const watch = e.sacrificeOnLostControl === true ? (ctx.sourceId ? s.objects[ctx.sourceId] : undefined) : undefined;
      const watched = e.sacrificeOnLostControl === true ? (watch?.zone === "battlefield" && (ctx.sourceZc === undefined || (watch.zoneChanges ?? 0) === ctx.sourceZc) ? { id: watch.id, zc: watch.zoneChanges ?? 0 } : undefined) : e.sacrificeOnLostControl;
      if (e.atNextEndStep) {
        // Seraph: "put that card onto the battlefield under your control at the beginning of the next end step" (CR 603.7),
        // if it's still that card then.
        const { atNextEndStep: _, ...later } = e;
        for (const o of list) addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [{ ...later, what: { ref: "subjectCard" }, ...(watched ? { sacrificeOnLostControl: watched } : { sacrificeOnLostControl: undefined }) }], text: `Put ${defOf(s, o).name} onto the battlefield under your control.` }, ctx.sourceId && s.objects[ctx.sourceId] ? cardIdOf(s.objects[ctx.sourceId]!) : cardIdOf(o));
        return;
      }
      const under = (o: GameObject) => (e.owner ? o.owner : ctx.controller);
      // Auras: their controller chooses what each enchants as it enters (CR 303.4f), all before any card moves; one with
      // nothing to enchant stays where it is (303.4g).
      // "Transformed": a double-faced card with its back face up; anything else stays where it is (CR 712.14a).
      // "Flipped": a flip card enters flipped (CR 710.1b); any other card enters as it is, the flip being impossible.
      const faceOf = (o: GameObject) => (e.transformed ? transformedFace(s, o) : e.flipped && s.cards[o.cardId]?.layout === "flip" && s.cards[o.cardId]!.faces?.length === 2 ? 1 : undefined);
      const entering = list.filter((o) => (e.transformed ? faceOf(o) !== undefined : isPermanentCard(defOf(s, o))));
      const hosts = e.attachToSubject || e.attachToTarget !== undefined || e.attachToEnchanted ? new Map<ObjectId, AuraHost>() : chooseAuraHosts(s, entering.map((o) => ({ o, under: under(o), face: faceOf(o) })), src);
      if (hosts === "paused") return "paused";
      // "Put a +1/+1 counter on it": the permanents these cards became (CR 400.7), like tokens just created.
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const o of list) {
          const face = faceOf(o);
          const d = asFace(s, o, face, () => defOf(s, o));
          if (e.attachToTarget !== undefined) {
            // "Attached to target opponent": the target, if the Aura could enchant it as it enters (CR 303.4f); else it
            // stays where it is (303.4g).
            if (e.transformed && face === undefined) continue;
            const t = ctx.targets[e.attachToTarget];
            const host = d.subtypes.includes("Aura") ? asFace(s, o, face, () => auraHostOptions(s, o, under(o))).find((h) => ("attachTo" in h ? t?.kind === "object" && t.id === h.attachTo : t?.kind === "player" && t.id === h.attachToPlayer)) : undefined;
            if (!host) {
              log(s, `${d.name} can't be attached to that, so it stays ${o.zone === "graveyard" ? "in the graveyard" : "where it is"}.`);
              continue;
            }
            log(s, `${src} returns ${d.name} to the battlefield${face ? " transformed" : ""} attached to ${auraHostName(s, host)}.`);
            moveObject(s, o.id, "battlefield", { controller: under(o), ...(face ? { face } : {}), ...host });
            continue;
          }
          if (e.attachToEnchanted) {
            // "Attached to enchanted creature" (Mantle of the Ancients): what the source Aura is attached to now, or was
            // last attached to if it has left (rulings). An Aura only to a permanent it could enchant (CR 303.4d, 303.4f),
            // an Equipment only to a creature it could equip (CR 301.5c-d); otherwise it stays in the graveyard (rulings).
            const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
            const here = !!me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
            const lk = !here && ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
            const was = lk && (ctx.sourceZc === undefined || lk.zc === ctx.sourceZc) ? lk.attachedTo : undefined;
            const host = here ? (me!.attachedTo ? s.objects[me!.attachedTo] : undefined) : was && s.objects[was.id]?.zone === "battlefield" && (s.objects[was.id]!.zoneChanges ?? 0) === was.zc ? s.objects[was.id] : undefined;
            const enchant = compileCard(d).enchant;
            const ok =
              !!host &&
              host.zone === "battlefield" &&
              (d.subtypes.includes("Aura")
                ? enchant?.kind === "object" && objectMatches(s, enchant, host, ctx.controller, false, d)
                : d.subtypes.includes("Equipment") && !isType(d, "Creature") && objectMatches(s, { kind: "object", types: ["Creature"], text: "creature" }, host, ctx.controller, false, d));
            if (!ok) {
              log(s, `${d.name} can't be attached to ${host ? defOf(s, host).name : "that creature"}, so it stays in the graveyard.`);
              continue;
            }
            log(s, `${src} returns ${d.name} to the battlefield attached to ${defOf(s, host!).name}.`);
            moveObject(s, o.id, "battlefield", { controller: ctx.controller, attachTo: host!.id });
            continue;
          }
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
          if (e.transformed ? face === undefined : !isPermanentCard(d)) continue;
          const host = hosts.get(o.id);
          if (d.subtypes.includes("Aura") && !host) {
            log(s, `${d.name} has nothing to enchant, so it stays ${o.zone === "graveyard" ? "in the graveyard" : "where it is"}.`);
            continue;
          }
          log(s, `${src} puts ${d.name} onto the battlefield under ${player(s, under(o)).name}'s control${e.tapped ? ", tapped" : ""}${face ? (e.flipped ? " flipped" : " and transformed") : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: under(o), tapped: e.tapped, ...(e.becomes ? { becomes: e.becomes } : {}), ...(e.counters ? { counters: e.counters } : {}), ...(face ? { face } : {}), ...host }); // CR 110.2a
          // "That creature gains haste until end of turn. Exile it at the beginning of the next end step" (Corpse Dance): only
          // the permanent it became, while it's still that object (CR 400.7, rulings).
          if (o.zone !== "battlefield") continue;
          s.resolving?.created?.push(o.id);
          if (e.alsoMods) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [o.id], mods: e.alsoMods });
          if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
          if (e.atEndStep)
            addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [e.atEndStep === "exile" ? { type: "exile", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${e.atEndStep === "exile" ? "Exile" : "Sacrifice"} ~.` });
          // "Sacrifice it when you lose control of ~" (Krovikan Vampire): once you've controlled ~ since now (Seraph rulings).
          const w = watched && s.objects[watched.id];
          if (w && w.zone === "battlefield" && (w.zoneChanges ?? 0) === watched!.zc) {
            const d = { when: "lostControl" as const, controller: ctx.controller, sourceCardId: cardIdOf(w), subject: watched!, about: { id: o.id, zc: o.zoneChanges ?? 0 }, ...(controllerOf(s, w) === ctx.controller ? { held: true as const } : {}), body: { targets: [], effects: [{ type: "sacrifice" as const, what: { ref: "subject" as const } }], text: `Sacrifice ${defOf(s, o).name}.` }, turn: s.turn, step: s.step };
            (s.delayed ??= []).push(d);
          }
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
        // Only the cards milled just before, still in the graveyard (CR 400.7).
        const milled = (id: ObjectId) => !e.milled || !!s.resolving!.milled?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc);
        const all = p.graveyard.filter((id) => milled(id) && (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (e.dest !== "battlefield" || isPermanentCard(defOf(s, obj(s, id)))));
        // "With different names": one card of each name is offered (cards of one name are alike).
        const cards = e.oneEach ? all.filter((id, i) => all.findIndex((x) => sameName(defOf(s, obj(s, x)).name, defOf(s, obj(s, id)).name)) === i) : all;
        const max = e.distinctManaValues ? new Set(cards.map((id) => defMv(defOf(s, obj(s, id))))).size : Math.min(e.n, cards.length);
        // "If you don't" after a card from among the milled ones (Ainok Wayfarer): whether one was put into your hand.
        if (e.milled) s.resolving!.did = false;
        if (!max) return;
        const kind = filter?.text ?? "card";
        const what = e.distinctManaValues
          ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different mana values`
          : e.oneEach && e.upTo && e.n >= 99
            ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different names`
          : e.n === 1
            ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`
            : `${e.upTo ? "up to " : ""}${e.n} ${kind.replace(/\bcard\b/, "cards")}`;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.upTo ? 0 : max, max, fromGraveyard: e.dest ?? "hand", ...(e.distinctManaValues ? { distinctManaValues: true as const } : {}) };
        return "paused";
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id));
      if (e.dest === "battlefield") {
        // An Aura's controller chooses what it enchants as it enters (CR 303.4f), or it stays in the graveyard (303.4g).
        const hosts = chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: p.id })), src);
        if (hosts === "paused") return "paused";
        const ids = found.filter((id) => !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        if (ids.length) log(s, `${p.name} returns ${ids.map((id) => defOf(s, obj(s, id)).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} from their graveyard to the battlefield${e.tapped ? ", tapped" : ""}.`);
        enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...(e.counters ? { counters: e.countersN === undefined ? { ...e.counters } : Object.fromEntries(Object.keys(e.counters).map((k) => [k, Math.max(0, amountNow(s, e.countersN!, ctx))])) } : {}), ...hosts.get(id) })));
        return;
      }
      const names = found.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (found.length) log(s, e.dest === "exile" ? `${p.name} exiles ${names} from their graveyard.` : e.dest === "libraryTop" ? `${p.name} puts ${names} from their graveyard on top of their library.` : `${p.name} returns ${names} from their graveyard to their hand.`);
      for (const id of found) (e.dest === "libraryTop" ? moveObject(s, id, "library", { top: true }) : moveObject(s, id, e.dest ?? "hand"));
      if (e.milled) s.resolving!.did = found.length > 0;
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
      if (e.toHand) {
        // All at once (CR 608.2c), whatever they are.
        const ids = players(s, e.who, ctx).flatMap((pid) => player(s, pid).graveyard.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id)))));
        if (ids.length) log(s, `${src} returns ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} to ${player(s, ctx.controller).name}'s hand.`);
        for (const id of ids) moveObject(s, id, "hand");
        return;
      }
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
    case "returnFaceDownExiled": {
      const cards = (e.cards ?? []).filter((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => obj(s, c.id));
      for (const pid of apnap(s, [...new Set(cards.map((c) => c.owner))])) {
        const mine = cards.filter((c) => c.owner === pid);
        log(s, `${player(s, pid).name} returns ${mine.length} card${mine.length === 1 ? "" : "s"} they exiled to their hand (${src}).`);
        for (const c of mine) moveObject(s, c.id, "hand");
      }
      return;
    }
    case "putAllOnBottom": {
      const sc = (s.resolving!.scratch ??= {});
      const all = s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      const orders = (sc.bottomOrders ??= {});
      // Each owner's cards, in APNAP order; tokens and commanders don't stay in a library, so there's nothing to order.
      for (const pid of apnap(s, [...new Set(all.map((id) => obj(s, id).owner))])) {
        if (orders[pid]) continue;
        const cards = all.filter((id) => obj(s, id).owner === pid && !obj(s, id).isToken && !obj(s, id).isCommander);
        if (cards.length > 1 && !sc.arranged) {
          s.pending = { kind: "arrangeTop", player: pid, how: "bottom", cards, source: src };
          return "paused";
        }
        orders[pid] = sc.arranged ? sc.arranged.top.filter((id) => cards.includes(id)) : cards;
        sc.arranged = undefined;
      }
      const ordered = new Set(Object.values(orders).flat());
      const moving = [...Object.values(orders).flat(), ...all.filter((id) => !ordered.has(id))].filter((id) => s.objects[id]?.zone === "battlefield");
      if (moving.length) log(s, `${src} puts ${moving.map((id) => characteristics(s, obj(s, id)).name).join(", ")} on the bottom of their owners' libraries.`);
      for (const id of moving) moveObject(s, id, "library");
      sc.bottomOrders = undefined;
      return;
    }
    case "livingDeath": {
      const who = apnap(s, livingPlayers(s));
      const exiled: [ObjectId, number][] = [];
      for (const pid of who) {
        const cards = player(s, pid).graveyard.filter((id) => objIsType(s, obj(s, id), "Creature"));
        if (cards.length) log(s, `${player(s, pid).name} exiles ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard.`);
        for (const id of cards) {
          moveObject(s, id, "exile");
          if (obj(s, id).zone === "exile") exiled.push([id, obj(s, id).zoneChanges ?? 0]);
        }
      }
      for (const pid of who) {
        const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
        if (mine.length) log(s, `${player(s, pid).name} sacrifices ${mine.map((id) => characteristics(s, obj(s, id)).name).join(", ")}.`);
        for (const id of mine) moveObject(s, id, "graveyard", { sacrificed: true });
      }
      // The same cards, if they're still in exile (a commander may have gone to the command zone instead).
      const back = exiled.filter(([id, zc]) => s.objects[id]?.zone === "exile" && (s.objects[id]!.zoneChanges ?? 0) === zc).map(([id]) => id);
      if (back.length) log(s, `${src} puts ${back.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield.`);
      enterTogether(s, () => back.forEach((id) => moveObject(s, id, "battlefield", { controller: obj(s, id).owner })));
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
        if (position === "second" || position === "third") {
          log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} into their library ${position} from the top.`);
          moveObject(s, o.id, "library", { top: true });
          // Under the top card or two, if there are; with fewer, it's on the bottom (rulings on Enigma Sphinx, Long-Term
          // Plans). A commander may have gone to the command zone instead.
          const lib = player(s, o.owner).library;
          if (o.zone === "library" && lib[0] === o.id) lib.splice(Math.min(position === "second" ? 1 : 2, lib.length - 1), 0, lib.shift()!);
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
      // Exiled, then returned together once any Aura's host is chosen (CR 303.4f). With `at`, one delayed trigger returns
      // all the cards exiled this way together (CR 603.7), those still in exile then (CR 400.7).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.flickered) {
        sc.flickered = [];
        const later: { id: ObjectId; zc: number }[] = [];
        let first: GameObject | undefined;
        for (const o of objects(s, e.what, ctx)) {
          if (o.zone !== "battlefield") continue;
          const d = defOf(s, o);
          log(s, `${src} exiles ${d.name}${e.at || e.hold ? "" : " and returns it"}.`);
          moveObject(s, o.id, "exile");
          // A merged permanent comes back as all of its cards (CR 730.3c).
          for (const l of newObjects(o)) {
            const c = s.objects[l.id];
            if (!c || c.isToken) continue; // a token that left the battlefield doesn't come back (CR 111.7)
            if (e.at) {
              first ??= c;
              later.push(l);
            } else if (e.hold) (s.resolving!.held ??= []).push(l);
            else sc.flickered.push(l);
          }
        }
        if (first) {
          const names = later.map((l) => defOf(s, s.objects[l.id]!).name).join(", ");
          addDelayed(s, "nextEndStep", ctx.controller, first, {
            targets: [],
            effects: [{ type: "returnExiled", under: e.under, ...(e.counter ? { counter: e.counter } : {}), ...(e.tapped ? { tapped: true as const } : {}), ...(later.length > 1 ? { cards: later } : {}) }],
            text: `Return ${names} to the battlefield${e.tapped ? " tapped" : ""} under ${e.under === "owner" ? (later.length > 1 ? "their owners'" : "its owner's") : "your"} control.`,
          });
        }
      }
      const back = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      if (returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counter, e.tapped, e.transformed) === "paused") return "paused";
      if (e.counterIf) {
        for (const c of back) {
          if (c.zone !== "battlefield" || !objectMatches(s, e.counterIf.filter, c, ctx.controller, false)) continue;
          putCounters(s, c, e.counterIf.counter, 1);
          log(s, `${src} puts a ${e.counterIf.counter} counter on ${defOf(s, c).name}.`);
        }
        invalidateCharacteristics(s);
      }
      return;
    }
    case "returnExiled": {
      const list = e.cards ?? (ctx.subject ? [ctx.subject] : []);
      const back = list.map((l) => s.objects[l.id]).filter((o, i): o is GameObject => o?.zone === "exile" && (o.zoneChanges ?? 0) === list[i]!.zc);
      if (!back.length) return;
      return returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counter, e.tapped);
    }
    case "exileIfLeaves":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.exileIfLeaves = "battlefield";
      return;
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
    case "animateDead": {
      // Animate Dead (rulings): nothing happens unless the Aura is still on the battlefield as this resolves, attached to
      // the card in the graveyard; the creature it becomes is a new object (CR 400.7), which the Aura is attached to.
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const t = e.target !== undefined ? ctx.targets[e.target] : undefined;
      const link = e.target !== undefined ? (ctx.legal[e.target] && t?.kind === "object" ? { id: t.id, zc: s.objects[t.id]?.zoneChanges ?? 0 } : undefined) : me.enchantsCard;
      const c = link && s.objects[link.id];
      if (!c || c.zone !== "graveyard" || (c.zoneChanges ?? 0) !== link.zc) return;
      if (e.target !== undefined) {
        // Necromancy becomes an Aura with "enchant creature put onto the battlefield with ~" (rulings).
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: me.id, duration: "game", affected: [me.id], mods: [{ kind: "addTypes", types: [], subtypes: ["Aura"] }] });
        log(s, `${src} becomes an Aura.`);
      }
      log(s, `${src} ${e.target !== undefined ? "puts" : "returns"} ${defOf(s, c).name} ${e.target !== undefined ? "onto" : "to"} the battlefield${e.tapped ? " tapped" : ""} under ${player(s, ctx.controller).name}'s control.`);
      moveObject(s, c.id, "battlefield", { controller: ctx.controller, ...(e.tapped ? { tapped: true } : {}) });
      if ((c.zone as string) !== "battlefield") return;
      (s.animated ??= {})[`${me.id}@${me.zoneChanges ?? 0}`] = { id: c.id, zc: c.zoneChanges ?? 0 };
      // "Enchant creature put onto the battlefield with ~": if it can't enchant it (protection), it goes to the graveyard
      // as a state-based action and the creature is sacrificed (rulings).
      me.attachedTo = c.id;
      me.enchantsCard = undefined;
      invalidateCharacteristics(s);
      return;
    }
    case "sacrificeAnimated": {
      // "That creature's controller sacrifices it": the creature it put onto the battlefield, if it's still that object.
      const zc = ctx.sourceZc ?? 0;
      const link = s.animated?.[`${ctx.sourceId}@${zc}`] ?? s.animated?.[`${ctx.sourceId}@${zc - 1}`];
      const c = link && s.objects[link.id];
      if (!c || c.zone !== "battlefield" || (c.zoneChanges ?? 0) !== link.zc) return;
      log(s, `${player(s, controllerOf(s, c)).name} sacrifices ${characteristics(s, c).name}.`);
      moveObject(s, c.id, "graveyard", { sacrificed: true });
      return;
    }
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
    case "forEachThisWay": {
      // All of them left first (rulings on Rampage of the Clans); each player then gets theirs, in APNAP order, as many as
      // they controlled (CR 608.2h). A destroyed one counts even if it went somewhere other than a graveyard (rulings).
      const counts = new Map<PlayerId, number>();
      for (const x of s.resolving?.[e.which] ?? [])
        if ((!e.graveyard || ("died" in x && x.died)) && objectMatches(s, e.filter, x.o, ctx.controller, false, undefined, x.ch)) counts.set(x.ch.controller, (counts.get(x.ch.controller) ?? 0) + 1);
      for (const pid of apnap(s, [...counts.keys()])) {
        if (player(s, pid).lost) continue;
        const n = counts.get(pid)!;
        for (const inner of e.effects) runEffect(s, inner.type === "createToken" || inner.type === "draw" ? { ...inner, n } : inner, { ...ctx, eachOne: pid });
      }
      return;
    }
    case "playExiled": {
      const sc = (s.resolving!.scratch ??= {});
      const you = ctx.controller;
      const ok = (id: ObjectId) => s.objects[id]?.zone === "exile" && obj(s, id).owner !== you && !obj(s, id).isToken && (obj(s, id).counters[e.counter] ?? 0) > 0;
      if (!sc.found) {
        const cards = s.turnOrder.flatMap((pid) => player(s, pid).exile).filter(ok);
        if (!cards.length) {
          log(s, `${player(s, you).name} has no exiled card with a ${e.counter} counter to choose.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: you, source: src, what: `an exiled card an opponent owns with a ${e.counter} counter on it`, cards, min: 1, max: 1, exiled: true, dig: { looked: cards, to: `to play this turn${e.free ? " without paying its mana cost" : ""}`, rest: "stay in exile" } };
        return "paused";
      }
      const id = sc.found.find(ok);
      sc.found = undefined;
      if (!id) return;
      const o = obj(s, id);
      o.mayPlay = { player: you, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.free ? { free: true as const } : {}) };
      log(s, `${player(s, you).name} chooses ${defOf(s, o).name} and may play it this turn${e.free ? " without paying its mana cost" : ""}.`);
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
      const from = e.who ? players(s, e.who, ctx)[0] : p.id;
      if (from === undefined) return;
      const ids = player(s, from).library.slice(0, amountNow(s, e.n, ctx));
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.castOnly ? { castOnly: true as const } : {}), ...(e.free ? { free: true as const } : {}) };
      }
      if (ids.length === 1 && s.resolving) s.resolving.exiledTop = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0 };
      if (s.resolving) (s.resolving.impulsed ??= []).push(...ids);
      if (ids.length)
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of ${from === p.id ? "their" : `${player(s, from).name}'s`} library and may ${e.castOnly ? "cast" : "play"} ${ids.length === 1 ? "it" : "them"}${e.free ? " without paying its mana cost" : ""}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : e.until === "yourNextEndStep" ? " until their next end step" : ""}.`);
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

/**
 * What a creature put onto the battlefield attacking may attack (CR 508.4): each opponent, a planeswalker they control or
 * a battle they protect (CR 310.9b), chosen by its controller; the one the source attacks first. None outside combat, or
 * on another player's turn.
 */
export function attackChoices(s: GameState, pid: PlayerId, sourceId?: ObjectId): { key: string; label: string; player: PlayerId; planeswalker?: ObjectId }[] {
  const first = attackDefault(s, pid, sourceId);
  if (first === undefined) return [];
  const foes = livingPlayers(s).filter((x) => x !== pid).sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
  return foes.flatMap((x) => [
    { key: String(x), label: player(s, x).name, player: x },
    ...s.battlefield.filter((id) => attackablePermanentProblem(s, pid, x, id) === null).map((id) => ({ key: `${x}:${id}`, label: `${defOf(s, obj(s, id)).name} (${objIsType(s, obj(s, id), "Battle") ? "protected by " : ""}${player(s, x).name})`, player: x, planeswalker: id })),
  ]);
}

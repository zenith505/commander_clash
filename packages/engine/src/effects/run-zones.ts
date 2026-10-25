import type { Amount, CounterKind, Effect, TargetSpec, TokenSpec } from "../abilities";
import { abilitiesOf, canBeSacrificed, cardIdOf, defOf, isPermanentCard, isType, objIsType, power } from "../cards";
import { nameLandBan } from "../names";
import { freeCastable, canPlayLandNow, loseLife, opponents, tapPermanent, landUntappedOffer, playLandByEffect, attackablePermanentProblem, attackedName, attackedPlaneswalker, attackingPermanentOf, auraHostKey, auraHostLabels, auraHostName, auraHostOf, auraHostOptions, type AuraHost, castProblem, creatureTypesOf, draw, destroyPermanent, landsAllowed, livingPlayers, log, moveObject, enterTogether, nameOf, newObject, obj, pairable, pairCandidates, pairCreatures, player, shareCreatureType } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters, withPutter } from "../counters";
import { manaValue } from "../mana";
import type { GameObject, GameState, LastKnown, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, linkedCards, objectMatches, pickOptions, printedMatches, spellManaValue } from "./targeting";
import { ResolveCtx, apnap, objects, players, amountNow, amountCtx, amountFor, runEffect } from "./resolve";
import { createToken, tokenCopies } from "./run-tokens";
import { compileCard } from "../oracle";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { askWholeGraveyardOrder } from "../graveyard";
import { foundWith, newObjects } from "../mutate";
import { attachTo } from "./run-permanents";
import { addDelayed, paidUnless, removeCopy } from "./run-spells";
import { toBottom } from "./run-library";
import { attackDefault, fireEvent, inCombat } from "./triggers";
import { asFace, defMv, registerFace, sameName, transformedFace } from "../faces";
import { meld, meldPartners } from "../meld";

/** A suspended card (CR 702.62b): in exile, with suspend and a time counter on it. */
export function isSuspended(s: GameState, o: GameObject): boolean {
  return o.zone === "exile" && (o.counters.time ?? 0) > 0 && hasSuspend(s, o);
}

/** Suspend printed on the card, or gained in exile (Delay, Jhoira of the Ghitu). */
export function hasSuspend(s: GameState, o: GameObject): boolean {
  return !!compileCard(defOf(s, o)).suspend || o.gainedSuspend === (o.zoneChanges ?? 0);
}

/**
 * "Exile it with three time counters on it. If it doesn't have suspend, it gains suspend." (Delay): a card in exile gets
 * the time counters and, without suspend of its own, suspend's abilities for as long as it stays this object (CR 702.62a,
 * 400.7). It's then suspended (CR 702.62b).
 */
export function suspendExiled(s: GameState, o: GameObject, n: number): void {
  if (o.zone !== "exile") return;
  o.counters.time = (o.counters.time ?? 0) + n;
  const had = hasSuspend(s, o);
  if (!had) o.gainedSuspend = o.zoneChanges ?? 0;
  invalidateCharacteristics(s);
  log(s, `${defOf(s, o).name} is exiled with ${n} time counter${n === 1 ? "" : "s"} on it${had ? "" : " and gains suspend"}.`);
}

/**
 * Put exiled cards onto the battlefield, all at once: an Aura's new controller chooses what it enchants as it enters,
 * and with nothing it can enchant it stays in exile (CR 303.4f-g, rulings on Flicker of Fate).
 */
function returnFromExile(s: GameState, cards: GameObject[], under: (c: GameObject) => PlayerId, src: string, counter?: CounterKind | CounterKind[], tapped?: boolean, transformed?: boolean, counterIfCreature?: boolean, loyaltyIfPlaneswalker?: boolean): "paused" | void {
  const counters = counter === undefined || (Array.isArray(counter) && !counter.length) ? undefined : Object.fromEntries((Array.isArray(counter) ? counter : [counter]).map((k) => [k, 1]));
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
      moveObject(s, c.id, "battlefield", { controller: under(c), ...host, ...(counters ? { [counterIfCreature ? "countersIfCreature" : "counters"]: counters } : {}), ...(loyaltyIfPlaneswalker ? { countersIfPlaneswalker: { loyalty: 1 } } : {}), ...(tapped ? { tapped: true } : {}), ...(transformed ? { face: transformedFace(s, c) } : {}) });
    }
  });
}

/**
 * Auras this effect puts onto the battlefield without their being cast (CR 303.4f): the player each one enters under
 * chooses what it enchants, as it enters, among what's on the battlefield before any of them move (Replenish rulings);
 * with nothing legal it stays where it is (303.4g). One Aura at a time, in the order given; no question when only one
 * thing is legal. Returns "paused" while a player chooses, else the host of each Aura that can enter; an Aura missing
 * from it stays put. Cards that aren't Auras are skipped. `onlyTo`: "attached to ~" (Light-Paws), only that permanent, if
 * it could enchant it (null: it's gone, so nothing).
 */
export function chooseAuraHosts(s: GameState, cards: { o: GameObject; under: PlayerId; face?: number }[], src: string, onlyTo?: ObjectId | null, onCreature?: boolean): "paused" | Map<ObjectId, AuraHost> {
  const sc = (s.resolving!.scratch ??= {});
  const hosts = (sc.auraHosts ??= {});
  for (const { o, under, face } of cards) {
    // A card entering transformed is an Aura, and enchants, as its back face (CR 712.14a, 303.4f).
    const d = asFace(s, o, face, () => defOf(s, o));
    if (!d.subtypes.includes("Aura") || hosts[o.id] !== undefined) continue;
    const options = asFace(s, o, face, () => auraHostOptions(s, o, under)).filter((h) => (onlyTo === undefined || ("attachTo" in h && h.attachTo === onlyTo)) && (!onCreature || ("attachTo" in h && s.objects[h.attachTo]?.zone === "battlefield" && objIsType(s, obj(s, h.attachTo), "Creature"))));
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
    const options = group ?? (e.among ? (among === undefined ? [] : pickOptions(s, e, among, ctx.sourceId, ctx.sourceZc)) : pickOptions(s, e, pid, ctx.sourceId, ctx.sourceZc));
    // "Sacrifice any number of other creatures": as many as they like, asked even with only one.
    if (e.anyNumber) {
      if (!options.length) {
        sc.chosen![pid] = [];
        sc.queue.shift();
        continue;
      }
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.filter.text, options, count: options.length, min: 0, anyNumber: true, ...(e.prompt ? { prompt: e.prompt.replace(/~/g, src) } : {}) };
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
  if ((e.action === "counters" || e.action === "choose" || e.action === "flicker") && s.resolving) s.resolving.created = apnap(s, who).flatMap((pid) => sc.chosen?.[pid] ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
  // "Unattach an Equipment from a creature you control. If you do, tap that creature" (Akiri, Fearless Voyager): it stays
  // on the battlefield, attached to nothing (CR 701.3d); "that creature" is the one it was attached to.
  if (e.action === "unattach") {
    const hosts: ObjectId[] = [];
    for (const pid of apnap(s, who))
      for (const id of sc.chosen?.[pid] ?? []) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || !o.attachedTo) continue;
        const host = o.attachedTo;
        log(s, `${player(s, pid).name} unattaches ${defOf(s, o).name} from ${defOf(s, obj(s, host)).name}.`);
        fireEvent(s, { type: "unattached", id, host });
        o.attachedTo = undefined;
        invalidateCharacteristics(s);
        hosts.push(host);
      }
    if (s.resolving) s.resolving.created = hosts;
    return;
  }
  for (const pid of apnap(s, who))
    for (const id of sc.chosen?.[pid] ?? []) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.action === "choose") {
        log(s, `${player(s, pid).name} chooses ${defOf(s, o).name}.`);
        continue;
      }
      if (e.action === "flicker") continue; // the flicker after it says what it exiles
      if (e.action === "tap") {
        if (o.tapped) continue;
        tapPermanent(s, o);
        log(s, `${player(s, pid).name} taps ${defOf(s, o).name}.`);
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
        if (put > 0 && s.resolving) (s.resolving.countersPutThisWay ??= []).push({ id, zc: o.zoneChanges ?? 0, kind: k });
        continue;
      }
      if (e.action === "exile") {
        log(s, `${player(s, pid).name} exiles ${defOf(s, o).name}.`);
        // As it last existed, for "the power of the creature they exiled" (Olórin's Searing Light, CR 608.2h).
        const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)) };
        moveObject(s, id, "exile");
        if (s.objects[id]?.zone === "exile" && s.resolving) (s.resolving.exiled ??= []).push(before);
        continue;
      }
      log(s, e.action === "sacrifice" ? `${player(s, pid).name} sacrifices ${defOf(s, o).name}.` : `${player(s, pid).name} returns ${defOf(s, o).name} to its owner's hand.`);
      // As it last existed, for a reflexive trigger: "When you do, ~ deals damage equal to that creature's power" (CR 608.2h).
      if (e.action === "sacrifice" && s.resolving) {
        const ch = characteristics(s, o);
        (s.resolving.sacrificedThisWay ??= []).push({ id, power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), controller: pid, types: [...ch.types], subtypes: [...ch.subtypes], ...(ch.allCreatureTypes && ch.types.includes("Creature") ? { allCreatureTypes: true as const } : {}), ...(ch.supertypes.includes("Legendary") ? { legendary: true as const } : {}), ...(o.isCommander ? { commander: true as const } : {}) });
      }
      if (e.action === "bounce" && s.resolving) (s.resolving.bouncedThisWay ??= []).push({ id, subtypes: [...characteristics(s, o).subtypes] });
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
    // Manifest: exactly that many, and with that many or fewer there's nothing to choose (rulings).
    if (e.manifest) {
      if (cards.length <= e.manifest) {
        hp.picked[pid] = cards;
        hp.queue.shift();
        continue;
      }
      s.pending = { kind: "searchLibrary", player: pid, source: src, what: e.manifest === 1 ? "a card" : `${e.manifest} cards`, cards, min: e.manifest, max: e.manifest, fromHand: true, manifest: true };
      return "paused";
    }
    const what = `${e.any ? "any number of " : /^[aeiou]/i.test(e.filter?.text ?? "card") ? "an " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}`;
    s.pending = { kind: "searchLibrary", player: pid, source: src, what, cards, min: 0, max: e.any ? cards.length : 1, fromHand: true };
    return "paused";
  }
  const picks = apnap(s, Object.keys(hp.picked).map(Number) as PlayerId[]).flatMap((pid) => hp.picked[pid]!.filter((id) => obj(s, id).zone === "hand").map((id) => ({ o: obj(s, id), under: pid })));
  s.resolving!.choseThisWay = apnap(s, Object.keys(hp.picked).map(Number) as PlayerId[]).filter((pid) => hp.picked[pid]!.length);
  // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g). It can't
  // enchant a card entering with it, which isn't on the battlefield yet.
  if (e.manifest) {
    // Face down, each a 2/2 creature with no name (CR 701.40a); nobody else sees which cards they were (CR 708.5).
    s.resolving!.created = [];
    enterTogether(s, () => {
      for (const [pid, ids] of Object.entries(hp.picked)) {
        const mine = ids.filter((id) => obj(s, id).zone === "hand");
        if (!mine.length) continue;
        log(s, `${player(s, Number(pid) as PlayerId).name} manifests ${mine.length === 1 ? "a card" : `${mine.length} cards`} from their hand: ${mine.length === 1 ? "a" : "each a"} face-down 2/2 creature.`);
        for (const id of mine) {
          moveObject(s, id, "battlefield", { controller: Number(pid) as PlayerId, faceDown: "manifest" });
          if (obj(s, id).zone === "battlefield") s.resolving!.created!.push(id);
        }
      }
    });
    s.resolving!.manifestedThisWay = s.resolving!.created!.length;
    sc.handPicks = undefined;
    return;
  }
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
      const options0 = among(pid).filter((id) => objectMatches(s, { ...k0.filter, controller: "you" }, obj(s, id), pid, false));
      const k = k0.fewest ? { ...k0, n: kr.fewest ?? 0 } : k0.maxTotalPower !== undefined ? { ...k0, n: options0.length } : k0;
      const options = options0;
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
      s.pending = { kind: "pickPermanents", player: chooser, source: src, action: "keep", what: k.filter.text, options, count: max, ...(k.upTo ? { min: 0 } : {}), ...(e.destroy ? { destroy: true as const } : {}), ...(e.bounce ? { bounce: true as const } : {}), ...(chooser !== pid ? { of: pid } : {}), ...(k.maxTotalPower !== undefined ? { maxTotalPower: k.maxTotalPower } : {}) };
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
  if (e.destroy) {
    for (const id of gone) if (s.objects[id]?.zone === "battlefield") destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
    return;
  }
  // Consuming Tide: the rest return to their owners' hands at the same time (rulings).
  if (e.bounce) {
    if (gone.length) log(s, `${src} returns ${gone.map((id) => nameOf(s, id)).join(", ")} to ${gone.length === 1 ? "its owner's hand" : "their owners' hands"}.`);
    for (const id of gone) if (s.objects[id]?.zone === "battlefield") moveObject(s, id, "hand");
    return;
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

/** A commander's mana value: a permanent's from its characteristics (0 face down, CR 708.2), else its card's. */
const commanderMv = (s: GameState, o: GameObject) => (o.zone === "battlefield" ? characteristics(s, o).manaValue : defMv(defOf(s, o)));

export function runZonesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "suspendCard":
      for (const o of objects(s, e.what, ctx)) if (!o.isToken) suspendExiled(s, o, e.n);
      return;
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
    case "eachMayCounter": {
      // In turn order from its controller (rulings), each choosing one of their creatures or none.
      const sc = (s.resolving!.scratch ??= {});
      const i = s.turnOrder.indexOf(ctx.controller);
      const order = [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((p) => !player(s, p).lost);
      sc.chosen ??= {};
      for (const pid of order) {
        if (sc.chosen[pid]) continue;
        const options = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
        if (!options.length) {
          sc.chosen[pid] = [];
          continue;
        }
        sc.queue = [pid];
        const you = player(s, ctx.controller).name;
        const ban = e.attackBan && pid !== ctx.controller ? ` If you do, your creatures can't attack ${you} or planeswalkers ${you} controls until ${you}'s next turn.` : "";
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "counters", counter: e.counter, what: "creature", options, count: 1, min: 0, prompt: `click a creature of yours to put ${e.n} ${e.counter} counters on, or put none.${ban}` };
        return "paused";
      }
      const chosen = sc.chosen;
      sc.chosen = undefined;
      sc.queue = undefined;
      const did = order.filter((pid) => chosen[pid]?.length);
      for (const pid of order) if (!chosen[pid]?.length) log(s, `${player(s, pid).name} puts no counters (${src}).`);
      for (const pid of did) {
        const o = s.objects[chosen[pid]![0]!];
        // Each player puts the counters on their own creature (who puts them matters for Hardened Scales and the like).
        if (o?.zone === "battlefield") withPutter(pid, () => putCounters(s, o, e.counter, e.n));
      }
      if (e.attackBan)
        for (const pid of did.filter((p) => p !== ctx.controller)) {
          const you = player(s, ctx.controller);
          if (!(you.attackBansUntil ??= []).includes(pid)) you.attackBansUntil.push(pid);
          log(s, `${player(s, pid).name}'s creatures can't attack ${you.name} or their planeswalkers until ${you.name}'s next turn.`);
        }
      invalidateCharacteristics(s);
      return;
    }
    case "chooseOwnCommander": {
      const p = player(s, ctx.controller);
      const mine = [...s.battlefield, ...p.command].filter((id) => obj(s, id).isCommander && obj(s, id).owner === p.id);
      const sc = (s.resolving!.scratch ??= {});
      if (mine.length > 1 && (sc.commander === undefined || !mine.includes(sc.commander))) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "commander", options: mine, labels: mine.map((id) => `${defOf(s, obj(s, id)).name} (mana value ${commanderMv(s, obj(s, id))})`), prompt: "choose which commander's mana value counts" };
        return "paused";
      }
      const id = mine.length > 1 ? sc.commander! : mine[0];
      sc.commander = undefined;
      s.resolving!.commanderMv = id ? commanderMv(s, obj(s, id)) : 0;
      if (id && mine.length > 1) log(s, `${p.name} chooses ${defOf(s, obj(s, id)).name} (${src}).`);
      return;
    }
    case "commanderToBattlefield": {
      // A commander you own (CR 903.3), a permanent card in the command zone as this resolves; it isn't cast, so the
      // commander tax doesn't go up (rulings).
      const p = player(s, ctx.controller);
      const mine = p.command.filter((id) => obj(s, id).isCommander && obj(s, id).owner === p.id && isPermanentCard(defOf(s, obj(s, id))));
      if (!mine.length) {
        log(s, `${p.name} has no commander in the command zone to put onto the battlefield (${src}).`);
        return;
      }
      const sc = (s.resolving!.scratch ??= {});
      if (mine.length > 1 && (sc.commander === undefined || !mine.includes(sc.commander))) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "commander", options: mine, labels: mine.map((id) => defOf(s, obj(s, id)).name), prompt: "put which commander onto the battlefield?" };
        return "paused";
      }
      const id = mine.length > 1 ? sc.commander! : mine[0]!;
      sc.commander = undefined;
      const o = obj(s, id);
      log(s, `${p.name} puts ${defOf(s, o).name} onto the battlefield from the command zone (${src}).`);
      moveObject(s, id, "battlefield", { controller: p.id });
      if (o.zone !== "battlefield") return;
      if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      if (e.atEndStep) addDelayed(s, "nextEndStep", p.id, o, { targets: [], effects: [{ type: "toCommandZone", what: { ref: "subject" } }], text: "Return ~ to the command zone." }, ctx.sourceId && s.objects[ctx.sourceId] ? cardIdOf(s.objects[ctx.sourceId]!) : cardIdOf(o));
      invalidateCharacteristics(s);
      return;
    }
    case "toCommandZone":
      // Only while it's still that permanent (rulings: one that went to another zone stays there).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        log(s, `${defOf(s, o).name} returns to the command zone (${src}).`);
        moveObject(s, o.id, "command");
      }
      return;
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
      // Several targets (Diluvian Primordial's one for each opponent): offered one at a time, in order (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const done = (sc.castTargetsDone ??= []);
      if (sc.castingTarget !== undefined) {
        const o = s.objects[sc.castingTarget];
        const d = o && defOf(s, o);
        if (o?.zone === "stack" && e.exileAfter && (e.exileAfter === true || isType(d!, "Instant") || isType(d!, "Sorcery"))) o.exileIfToGraveyard = true;
        done.push(sc.castingTarget);
        sc.castingTarget = undefined;
      }
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "graveyard" || done.includes(o.id)) continue;
        sc.castingTarget = o.id;
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src };
        if (freeCastable(s, ctx.controller, o.id)) return "paused";
        s.pending = null;
        sc.castingTarget = undefined;
        done.push(o.id);
        log(s, `${defOf(s, o).name} can't be cast.`);
      }
      sc.castTargetsDone = undefined;
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
      if (freeCastable(s, p.id, o.id)) return "paused";
      s.pending = null;
      log(s, `${src} can't be cast.`);
      return;
    }
    case "exileRandomThenPlay": {
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.exiledAtRandom) {
        const pid = players(s, e.who, ctx)[0];
        const hand = pid === undefined ? [] : player(s, pid).hand;
        if (pid === undefined || !hand.length) return;
        const id = hand[Math.floor(nextRandom(s) * hand.length)]!;
        log(s, `${player(s, pid).name} exiles ${defOf(s, obj(s, id)).name} from their hand at random.`);
        moveObject(s, id, "exile");
        if (obj(s, id).zone !== "exile") return;
        sc.exiledAtRandom = { id, zc: obj(s, id).zoneChanges ?? 0 };
      }
      const got = sc.exiledAtRandom;
      const o = s.objects[got.id];
      // Still that card in exile (CR 400.7).
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== got.zc) return;
      const name = defOf(s, o).name;
      const you = player(s, ctx.controller);
      if (isType(defOf(s, o), "Land")) {
        if (!got.asked) {
          got.asked = true;
          sc.may = undefined;
          s.pending = { kind: "chooseMay", player: you.id, prompt: `put ${name} onto the battlefield under your control`, source: src, card: o.id };
          return "paused";
        }
        if (!sc.may) return;
        sc.may = undefined;
        moveObject(s, o.id, "battlefield", { controller: you.id });
        log(s, `${you.name} puts ${name} onto the battlefield.`);
        return;
      }
      if (got.asked) return;
      got.asked = true;
      s.pending = { kind: "castFree", player: you.id, objectId: o.id, source: src };
      if (freeCastable(s, you.id, o.id)) return "paused";
      s.pending = null;
      log(s, `${name} can't be cast.`);
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
      // From the graveyard: "if that spell would be put into your graveyard, exile it instead" applies to the spell it became.
      if (sc.castFromHand === "cast" && e.fromGraveyard && sc.castFromYard) {
        const o = s.objects[sc.castFromYard];
        if (o?.zone === "stack") o.exileIfToGraveyard = true;
        sc.castFromYard = undefined;
      }
      if (sc.castFromHand === "cast" || sc.castFromHand === "none") return;
      const zone = e.fromGraveyard ? p.graveyard : p.hand;
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
        const options = (drawn ?? zone).filter((id) => !isType(defOf(s, obj(s, id)), "Land") && printedMatches(filter, defOf(s, obj(s, id))) && castable(id));
        if (!options.length) {
          log(s, drawn ? `${p.name} can't cast any of them.` : `${p.name} has no ${filter.text.replace(/^an? /, "")} ${e.fromGraveyard ? "in their graveyard" : "in hand"} to cast.`);
          return;
        }
        const text = filter.text.replace(/^(?!an? )/, /^[aeiou]/i.test(filter.text) ? "an " : "a ");
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "castFromHand", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name), "Don't cast"], prompt: drawn ? "cast one of the cards you drew without paying its mana cost?" : `cast ${text} from your ${e.fromGraveyard ? "graveyard" : "hand"} without paying its mana cost?` };
        return "paused";
      }
      const id = sc.castFromHand;
      sc.castFromHand = "cast";
      if (!s.objects[id] || obj(s, id).zone !== (e.fromGraveyard ? "graveyard" : "hand") || !castable(id)) return;
      if (e.fromGraveyard) sc.castFromYard = id;
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
          // Wand of Wonder: each opponent's down to their first instant or sorcery card, the rest shuffled back.
          const hit = (id: ObjectId) => (e.untilHit ? printedMatches(e.untilHit, defOf(s, obj(s, id))) : !isType(defOf(s, obj(s, id)), "Land"));
          const upTo = (lib: ObjectId[]) => {
            if (!e.untilNonland && !e.untilHit) return lib.slice(0, amountNow(s, e.n, ctx));
            const at = lib.findIndex(hit);
            return at < 0 ? [...lib] : lib.slice(0, at + 1);
          };
          const who = livingPlayers(s).filter((pid) => !e.opponents || pid !== ctx.controller);
          const exiledBy = who.map((pid) => [pid, upTo(player(s, pid).library)] as const);
          let ids = exiledBy.flatMap(([, x]) => x);
          for (const id of ids) moveObject(s, id, "exile");
          log(s, ids.length ? `${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} exiled from the top of ${e.opponents ? "each opponent's library" : "each library"}.` : "No library has a card to exile.");
          if (e.untilHit) {
            for (const [pid, theirs] of exiledBy) {
              const rest = theirs.filter((id) => !hit(id) && obj(s, id).zone === "exile");
              if (!rest.length) continue;
              for (const id of rest) moveObject(s, id, "library");
              shuffleLibrary(s, player(s, pid));
              log(s, `${player(s, pid).name} shuffles the other ${rest.length} card${rest.length === 1 ? "" : "s"} into their library.`);
            }
            ids = ids.filter((id) => obj(s, id).zone === "exile");
          }
          sc.castAmong = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
        }
      }
      if (!sc.castAmong && e.pushLuck !== undefined) {
        // Dance with Calamity: one card at a time, looked at before deciding to go on (rulings), a card's mana value with
        // X as 0 (CR 202.3e). Over the limit, none can be cast and they all stay exiled.
        const pl = (sc.pushLuck ??= { ids: [] });
        if (pl.asked) {
          pl.asked = undefined;
          const yes = sc.may;
          sc.may = undefined;
          const top = you.library[0];
          if (yes && top) {
            moveObject(s, top, "exile");
            const o = obj(s, top);
            if (o.zone === "exile") pl.ids.push({ id: top, zc: o.zoneChanges ?? 0 });
            log(s, `${you.name} exiles ${defOf(s, o).name} from the top of their library (total mana value ${pl.ids.reduce((n, x) => n + defMv(defOf(s, obj(s, x.id))), 0)}).`);
          } else pl.stop = true;
        }
        const total = pl.ids.reduce((n, x) => n + defMv(defOf(s, obj(s, x.id))), 0);
        if (!pl.stop && you.library.length) {
          pl.asked = true;
          s.pending = { kind: "chooseMay", player: you.id, prompt: `exile the top card of your library (total mana value so far: ${total}; ${e.pushLuck} or less to cast them)`, source: src };
          return "paused";
        }
        if (total > e.pushLuck) {
          log(s, `The total mana value of the cards exiled is ${total}, more than ${e.pushLuck}: ${you.name} can't cast any of them.`);
          sc.castAmong = { ids: [], declined: [], done: true };
          return;
        }
        sc.castAmong = { ids: pl.ids, declined: [] };
      }
      if (!sc.castAmong && e.fromYard?.randomLinked) {
        // Arcane Bombardment: one card at random, linked to the source; then every card still exiled with it.
        const pool = you.graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        if (pool.length) {
          const id = pool[Math.floor(nextRandom(s) * pool.length)]!;
          moveObject(s, id, "exile");
          const o = obj(s, id);
          log(s, `${you.name} exiles ${defOf(s, o).name}, chosen at random, from their graveyard.`);
          if (o.zone === "exile" && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        }
        sc.castAmong = { ids: linkedCards(s, ctx.sourceId, ctx.sourceZc ?? 0), declined: [] };
      }
      if (!sc.castAmong && e.fromYard?.randomEachOpponent) {
        // Kefka, Dancing Mad: one card at random from each opponent's graveyard, in turn order (any card, lands too).
        const gone: ObjectId[] = [];
        for (const pid of apnap(s, opponents(s, you.id))) {
          const yard = player(s, pid).graveyard;
          if (!yard.length) continue;
          const id = yard[Math.floor(nextRandom(s) * yard.length)]!;
          moveObject(s, id, "exile");
          if (obj(s, id).zone === "exile") gone.push(id);
        }
        log(s, gone.length ? `${you.name} exiles ${gone.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, obj(s, id).owner).name}'s)`).join(", ")}, chosen at random from each opponent's graveyard.` : "No opponent has a card in their graveyard.");
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.fromYard) {
        // Mizzix's Mastery: the target card if it's still legal, or (overloaded) each one in your graveyard, all exiled.
        const ids = e.fromYard.target !== undefined ? objects(s, { ref: "target", index: e.fromYard.target }, ctx).map((o) => o.id) : you.graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        if (gone.length) log(s, `${you.name} exiles ${gone.map((id) => `${defOf(s, obj(s, id)).name}${obj(s, id).owner === you.id ? "" : ` (${player(s, obj(s, id).owner).name}'s)`}`).join(", ")} from ${gone.every((id) => obj(s, id).owner === you.id) ? "their" : "a"} graveyard.`);
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.handAndYard) {
        // Invoke Calamity: cast from your hand and/or graveyard, where they are (rulings: the spells' mana values on the
        // stack count toward the total).
        sc.castAmong = { ids: [...you.hand, ...you.graveyard].map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}) };
      }
      if (!sc.castAmong && e.fromHand) {
        const whose = players(s, e.who, ctx)[0];
        if (whose === undefined) return;
        sc.castAmong = { ids: player(s, whose).hand.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
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
        if (!e.reveal) for (const id of ids) moveObject(s, id, "exile");
        if (e.look) log(s, `${player(s, whose).name} looks at the top ${ids.length === 1 ? "card" : `${ids.length} cards`} of their library.`);
        else log(s, `${player(s, whose).name} ${e.reveal ? "reveals" : "exiles"} ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from the top of their library.`);
        sc.castAmong = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}), ...(e.maxMv !== undefined ? { maxMv: amountNow(s, e.maxMv, ctx) } : {}), ...(e.exactMv !== undefined ? { exactMv: amountNow(s, e.exactMv, ctx) } : {}), ...(hits ? { hits } : {}) };
      }
      const st = sc.castAmong;
      if (st.done) return;
      const mvOf = (id: ObjectId) => defMv(defOf(s, obj(s, id)));
      // Still where they were put: in exile, or revealed in the library (`reveal`).
      const exiled = (id: ObjectId) => st.ids.some((x) => x.id === id && (e.handAndYard ? ["hand", "graveyard"].includes(s.objects[id]?.zone ?? "") : s.objects[id]?.zone === (e.fromHand ? "hand" : e.reveal ? "library" : "exile")) && (s.objects[id]!.zoneChanges ?? 0) === x.zc);
      // Done: the exiled cards that weren't cast go where `rest` says (rulings on Muse Vortex: all the instants and
      // sorceries to your hand if you cast none; on Epic Experiment: one that couldn't be cast goes too).
      const finish = (): "paused" | undefined => {
        st.done = true;
        // Kefka: after all the casting, each owner loses life for each of their spells cast this way, its mana value on
        // the stack (X is 0, CR 107.3b).
        if (e.ownersLoseLife)
          for (const { owner, mv } of st.castSpells ?? []) {
            if (mv <= 0 || !livingPlayers(s).includes(owner)) continue;
            log(s, `${player(s, owner).name} loses ${mv} life (${src}).`);
            loseLife(s, owner, mv);
          }
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
        // Mnemonic Deluge: three copies of the card, each cast or not in turn; those not cast cease to exist (rulings).
        const made = ((st.copied ??= {})[st.copyOf] ?? 0) + 1;
        st.copied[st.copyOf] = made;
        if (made >= (e.copyTimes ?? 1)) st.declined.push(st.copyOf);
        st.casting = st.copyOf = undefined;
      }
      if (st.casting) {
        // Cast: it's on the stack now (a new object, CR 400.7); declined: it stays in exile.
        if (exiled(st.casting)) st.declined.push(st.casting);
        else {
          // The spell's mana value on the stack: the half or face cast (rulings on Invoke Calamity, CR 709.3, 712.11c).
          const cast = s.stack.find((x) => x.objectId === st.casting);
          if (st.budget !== undefined) st.budget -= cast ? spellManaValue(s, cast) : mvOf(st.casting);
          if (e.exileCast && s.objects[st.casting]?.zone === "stack") s.objects[st.casting]!.exileIfToGraveyard = true;
          st.cast = (st.cast ?? 0) + 1;
          if (e.ownersLoseLife) {
            const item = s.stack.find((x) => x.objectId === st.casting);
            if (item) (st.castSpells ??= []).push({ owner: obj(s, st.casting).owner, mv: spellManaValue(s, item) });
          }
          // "Do this only once each turn": done (CR 603.2h).
          const source = e.once && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (source) (source.triggeredThisTurn ??= []).push(`${ctx.sourceZc ?? source.zoneChanges ?? 0}|do:castNow`);
        }
        st.casting = undefined;
      }
      // "With mana value X or less", "the same mana value", what's left of a total: the spell as it's cast (a split
      // card's half, a prototyped spell), checked as it's cast (CR 202.3, 709.3, 718.3b; rulings on Powerbalance).
      const maxMv = st.maxMv === undefined ? st.budget : st.budget === undefined ? st.maxMv : Math.min(st.maxMv, st.budget);
      const mv = maxMv === undefined && st.exactMv === undefined ? undefined : { ...(maxMv !== undefined ? { max: maxMv } : {}), ...(st.exactMv !== undefined ? { exact: st.exactMv } : {}) };
      // Invoke Calamity: the spell's types as it's cast, not the card's (rulings).
      const freeCast = (id: ObjectId) => ({ kind: "castFree" as const, player: you.id, objectId: id, source: src, ...(mv ? { mv } : {}), ...(e.handAndYard && e.filter?.types ? { types: e.filter.types } : {}) });
      if (st.handPick) return finish();
      // Plargg and Nassari: an opponent chosen by you picks one of the nonland cards; the others may be cast (rulings).
      if (e.opponentExcludes && !st.excluded) {
        const nonland = st.ids.map((x) => x.id).filter((id) => exiled(id) && !isType(defOf(s, obj(s, id)), "Land"));
        if (st.excludeBy !== undefined && st.pick !== undefined) {
          st.excluded = st.pick;
          st.pick = undefined;
          log(s, `${player(s, st.excludeBy).name} chooses ${defOf(s, obj(s, st.excluded)).name}.`);
        } else if (nonland.length) {
          const opps = opponents(s, you.id);
          const by = opps.length === 1 ? opps[0] : (s.resolving!.chosen?.player ?? undefined);
          if (by === undefined) {
            if (!opps.length) return finish();
            s.pending = { kind: "chooseOption", player: you.id, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt: "choose an opponent to choose a nonland card exiled this way" };
            return "paused";
          }
          st.excludeBy = by;
          s.pending = { kind: "chooseOption", player: by, source: src, what: "castFromAmong", options: nonland, labels: nonland.map((id) => defOf(s, obj(s, id)).name), prompt: `choose a nonland card exiled this way: ${you.name} may cast up to two of the others` };
          return "paused";
        }
      }
      if (st.landPick) {
        // Gix: the land picked, played now; untapped if its controller paid for that (a shock land).
        const id = st.landPick;
        st.landPick = undefined;
        const untapped = !!sc.may;
        sc.may = undefined;
        if (exiled(id) && canPlayLandNow(s, you.id, id)) playLandByEffect(s, you.id, id, untapped);
        st.declined.push(id);
      }
      if (st.pick !== undefined) {
        const pick = st.pick;
        st.pick = undefined;
        if (pick === "none" || !exiled(pick)) return finish();
        if (e.lands && isType(defOf(s, obj(s, pick)), "Land")) {
          st.landPick = pick;
          const offer = landUntappedOffer(s, you.id, pick);
          if (offer) {
            s.pending = { kind: "chooseMay", player: you.id, prompt: offer, source: src, card: pick };
            return "paused";
          }
          return runEffect(s, e, ctx);
        }
        st.casting = pick;
        if (e.copies) {
          // "Copy it, and you may cast the copy without paying its mana cost": made in exile and cast now (CR 707.12).
          const copy = newObject(s, defOf(s, obj(s, pick)), you.id, "exile");
          copy.spellCopy = true;
          you.exile.push(copy.id);
          log(s, `${src} copies ${defOf(s, obj(s, pick)).name}${e.copyTimes ? ` (copy ${(st.copied?.[pick] ?? 0) + 1} of ${e.copyTimes})` : ""}.`);
          st.casting = copy.id;
          st.copyOf = pick;
          s.pending = { kind: "castFree", player: you.id, objectId: copy.id, source: src };
          return "paused";
        }
        s.pending = freeCast(pick);
        return "paused";
      }
      const castable = (id: ObjectId) => {
        s.pending = freeCast(id);
        const ok = freeCastable(s, you.id, id, true);
        s.pending = null;
        return ok;
      };
      const isLand = (id: ObjectId) => isType(defOf(s, obj(s, id)), "Land");
      const sharesType = (id: ObjectId) => s.battlefield.some((b) => controllerOf(s, obj(s, b)) === you.id && objIsType(s, obj(s, b), "Creature") && shareCreatureType(creatureTypesOf(s, obj(s, id)), creatureTypesOf(s, obj(s, b))));
      const options = st.ids
        .map((x) => x.id)
        .filter((id) => exiled(id) && !st.declined.includes(id) && id !== st.excluded && (isLand(id) && !e.handAndYard ? !!e.lands && canPlayLandNow(s, you.id, id) : (!e.filter || e.handAndYard || printedMatches(e.filter, defOf(s, obj(s, id)))) && (!st.hits || st.hits.includes(id)) && (!e.sharesTypeWithYours || sharesType(id)) && castable(id)));
      if (!options.length || (e.max !== undefined && (st.cast ?? 0) >= e.max)) return finish();
      if (e.look && options.length === 1) {
        // Planetarium: the one card looked at is offered as the free cast itself (cast it, or decline).
        st.pick = options[0];
        return runEffect(s, e, ctx);
      }
      const left = st.budget !== undefined ? ` (total mana value ${st.budget} left)` : "";
      s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name + (e.handAndYard ? ` (${obj(s, id).zone})` : "")), "Done"], prompt: e.handAndYard ? `cast a spell from your hand or graveyard without paying its mana cost${left}?` : `${e.lands ? "play a land or " : ""}cast a spell from ${e.fromHand ? (obj(s, options[0]!).owner === you.id ? "your hand" : `among the cards in ${player(s, obj(s, options[0]!).owner).name}'s hand`) : "among "}${e.fromHand ? "" : `the ${e.reveal ? "revealed" : "exiled"} cards`} without paying its mana cost${left}?` };
      return "paused";
    }
    case "exileCastEachType": {
      // The land is put onto the battlefield as this resolves, even after a land play (rulings); a land card that wasn't
      // can't be played later, nor cast (rulings). Each nonland card may be cast this turn as one of its types not yet used.
      const sc = (s.resolving!.scratch ??= {});
      const you = player(s, ctx.controller);
      if (!sc.castAmong) {
        const ids = you.library.slice(0, amountNow(s, e.n, ctx));
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        log(s, `${you.name} exiles ${gone.length ? gone.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from the top of their library.`);
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
        const group = `${src}#${s.nextId++}`;
        for (const id of gone) {
          const o = obj(s, id);
          if (!isType(defOf(s, o), "Land")) o.mayPlay = { player: you.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, free: true, castOnly: true, byType: group };
        }
        const lands = gone.filter((id) => isType(defOf(s, obj(s, id)), "Land"));
        if (!lands.length) return;
        s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options: [...lands, "none"], labels: [...lands.map((id) => defOf(s, obj(s, id)).name), "None"], prompt: "you may put a land card from among them onto the battlefield" };
        return "paused";
      }
      const st = sc.castAmong;
      const pick = st.pick;
      st.pick = undefined;
      const was = st.ids.find((x) => x.id === pick);
      if (!was || s.objects[was.id]?.zone !== "exile" || (s.objects[was.id]!.zoneChanges ?? 0) !== was.zc) return;
      moveObject(s, was.id, "battlefield");
      log(s, `${you.name} puts ${defOf(s, obj(s, was.id)).name} onto the battlefield.`);
      return;
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
      if (freeCastable(s, ctx.controller, o.id)) return "paused";
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
      const me = e.until === "sourceLeaves" ? objects(s, { ref: "self" }, ctx)[0] : undefined;
      const monarch = e.until === "opponentMonarch" ? { controller: ctx.controller, source: src, cards: [] as { id: ObjectId; zc: number }[] } : undefined;
      if (monarch) (s.exiledUntilMonarch ??= []).push(monarch);
      if (e.until === "sourceLeaves" && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} exiles ${defOf(s, o).name}${e.until === "sourceLeaves" ? ` until ${src} leaves the battlefield` : e.until === "opponentMonarch" ? " until an opponent becomes the monarch" : ""}.`);
        // As it last existed, for "for each nontoken creature exiled this way" (CR 608.2h).
        const before = o.zone === "battlefield" ? { o: structuredClone(o), ch: structuredClone(characteristics(s, o)) } : undefined;
        const fromYard = o.zone === "graveyard";
        moveObject(s, o.id, "exile");
        if (before && o.zone === "exile" && s.resolving) (s.resolving.exiled ??= []).push(before);
        if (fromYard && o.zone === "exile" && s.resolving) (s.resolving.exiledCards ??= []).push(o.id);
        // A merged permanent's cards are all exiled with it, and found by what returns it (CR 730.3c).
        for (const l of newObjects(o)) {
          if (s.objects[l.id]?.zone !== "exile") continue;
          if (me) (me.exiledUntilLeaves ??= []).push(l);
          monarch?.cards.push(l);
          // Linked to the source as it was when the ability triggered: if that object has already left, its
          // leaves ability has nothing to return, and the card stays exiled (CR 607.2a, rulings).
          if (e.linked && ctx.sourceId) {
            ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push(l);
            if (s.resolving) (s.resolving.linkedNow ??= []).push(l.id);
          }
          const card = s.objects[l.id]!;
          if (e.ownerMay && !card.isToken) {
            const m = e.ownerMay;
            const more = m.more && (!m.moreOpponents || card.owner !== ctx.controller) ? m.more : undefined;
            card.mayPlay = { player: card.owner, zc: card.zoneChanges ?? 0, until: m.until ?? "exiled", turn: s.turn, ...(m.play ? {} : { castOnly: true as const }), ...(m.free ? { free: true as const } : {}), ...(m.cost ? { cost: m.cost } : {}), ...(more ? { more } : {}) };
          }
          // Mari, Tinybones: the counter goes on the card in exile (a token ceases to exist, CR 704.5d).
          if (e.counters && !card.isToken) for (const [k, n] of Object.entries(e.counters)) card.counters[k] = (card.counters[k] ?? 0) + n;
          // Suspend: the card gets its time counters and suspend (CR 702.62); a token ceases to exist (CR 704.5d).
          if (e.suspend && !card.isToken) suspendExiled(s, card, e.suspend);
          // Hostage Taker: its controller may cast the card, not a token (rulings), for as long as it remains exiled.
          // Dire Fleet Daredevil: this turn only, with its usual timing (rulings).
          if (e.youMay && !card.isToken) card.mayPlay = { player: ctx.controller, zc: card.zoneChanges ?? 0, until: e.youMay.thisTurn ? "thisTurn" : "exiled", turn: s.turn, ...(e.youMay.play ? {} : { castOnly: true as const }), ...(e.youMay.anyType ? { anyType: true as const } : {}), ...(e.youMay.exileAfter ? { exileAfter: true as const } : {}) };
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
    case "revealHandOrTop": {
      // Eladamri: the card picked as it resolves, revealed; a creature card goes onto the battlefield under your control.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const options = [...p.hand, ...(p.library.length ? ["top"] : [])];
      if (sc.revealPick === undefined) {
        if (!options.length) return;
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "revealHandOrTop", options, labels: [...p.hand.map((id) => defOf(s, obj(s, id)).name), ...(p.library.length ? ["Top card of your library"] : [])], prompt: `reveal a card from your hand or the top card of your library (a ${e.filter.text} is put onto the battlefield)` };
        return "paused";
      }
      const id = sc.revealPick === "top" ? p.library[0] : p.hand.includes(sc.revealPick) ? sc.revealPick : undefined;
      sc.revealPick = undefined;
      if (!id) return;
      const d = defOf(s, obj(s, id));
      log(s, `${p.name} reveals ${d.name} from their ${obj(s, id).zone === "hand" ? "hand" : "library"}.`);
      if (!printedMatches(e.filter, d)) return;
      moveObject(s, id, "battlefield", { controller: p.id });
      if (obj(s, id).zone === "battlefield") log(s, `${p.name} puts ${d.name} onto the battlefield.`);
      return;
    }
    case "exileHandOrPermanent": {
      // Each chooses in turn order (APNAP, CR 101.4) a card in their hand, unrevealed, or a permanent they control; then all
      // the chosen ones are exiled simultaneously (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.handOrPermanent ??= { queue: apnap(s, players(s, e.who, ctx)), picks: [] });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        const p = player(s, pid);
        const perms = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
        const options = [...p.hand, ...perms];
        if (p.lost || !options.length) {
          st.queue.shift();
          continue;
        }
        s.pending = { kind: "chooseOption", player: pid, source: src, what: "exileHandOrPermanent", options, labels: [...p.hand.map((id) => `${defOf(s, obj(s, id)).name} (hand)`), ...perms.map((id) => nameOf(s, id))], prompt: "exile a card from your hand or a permanent you control" };
        return "paused";
      }
      sc.handOrPermanent = undefined;
      for (const id of st.picks) {
        const o = obj(s, id);
        if (o.zone !== "hand" && o.zone !== "battlefield") continue;
        log(s, `${player(s, o.zone === "hand" ? o.owner : controllerOf(s, o)).name} exiles ${o.zone === "hand" ? `${defOf(s, o).name} from their hand` : nameOf(s, o.id)}.`);
        moveObject(s, id, "exile");
      }
      invalidateCharacteristics(s);
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
        if (freeCastable(s, p.id, card.id)) return "paused";
        s.pending = null;
        log(s, `${d.name} can't be cast.`);
        return;
      }
      // Played: it counts as the turn's land play and triggers "whenever you play a land" (CR 305.2, 305.1).
      if (isType(d, "Land") && sc.may && canPlayLandNow(s, p.id, card.id)) playLandByEffect(s, p.id, card.id);
      return;
    }
    case "exileFaceDown": {
      const actor = e.actor ? players(s, e.actor, ctx)[0] : ctx.controller;
      if (actor === undefined) return;
      const p = player(s, actor);
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
        if (e.pickOne) {
          // Siphon Insight: the actor looks at the cards and exiles the one they choose; the others go to the bottom of
          // their owner's library (one card left, so no order to choose). Nobody else learns which went where (rulings).
          if (!sc.faceDownPick) {
            if (!ids.length) return;
            if (ids.length > 1) {
              sc.faceDownPick = true;
              sc.faceDownLooked = ids;
              delete sc.found;
              s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards: ids, min: 1, max: 1, dig: { looked: ids, to: "to exile face down", rest: "on the bottom of that library" } };
              return "paused";
            }
            sc.found = ids;
            sc.faceDownLooked = ids;
          }
          sc.faceDownPick = undefined;
          const looked = (sc.faceDownLooked ?? ids).filter((id) => obj(s, id).zone === "library");
          sc.faceDownLooked = undefined;
          const chosen = (sc.found ?? []).filter((id) => looked.includes(id));
          for (const id of looked.filter((id) => !chosen.includes(id))) {
            const owner = player(s, obj(s, id).owner);
            owner.library = [...owner.library.filter((x) => x !== id), id];
          }
          if (looked.length > chosen.length) log(s, `${p.name} puts ${looked.length - chosen.length === 1 ? "a card" : `${looked.length - chosen.length} cards`} on the bottom of ${[...new Set(looked.map((id) => player(s, obj(s, id).owner).name))].join(" and ")}'s library.`);
          ids = chosen;
        }
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
      if (e.ifLinkedNow && !s.resolving!.linkedNow?.length) return;
      let cards = linked.map((l) => obj(s, l.id)).filter((c) => (!e.yours || c.owner === ctx.controller) && !(e.other && s.resolving!.faceDownExiled?.includes(c.id)) && !(e.ifLinkedNow && s.resolving!.linkedNow?.includes(c.id)));
      const p = player(s, ctx.controller);
      if (e.filter) cards = cards.filter((c) => printedMatches(e.filter!, defOf(s, c)));
      if (e.one) {
        if (!sc.linkedPick) {
          if (!cards.length) return;
          sc.linkedPick = true;
          delete sc.found;
          const ids = cards.map((c) => c.id);
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `a ${e.filter ? `${e.filter.text} ` : "card "}exiled with ${src}`.replace("card card", "card"), cards: ids, min: 1, max: 1, dig: { looked: ids, to: e.dest === "hand" ? "into your hand" : e.dest === "battlefield" ? "onto the battlefield" : "into its owner's graveyard", rest: "stay exiled" } };
          return "paused";
        }
        sc.linkedPick = undefined;
        cards = cards.filter((c) => sc.found?.includes(c.id));
      }
      if (!cards.length) return;
      if (e.dest === "battlefield") {
        // All at once (CR 608.2f), under this ability's controller's control.
        log(s, `${p.name} puts ${cards.map((c) => defOf(s, c).name).join(", ")} onto the battlefield from exile (${src}).`);
        const ids = cards.map((c) => c.id);
        enterTogether(s, () => {
          for (const c of cards) moveObject(s, c.id, "battlefield", { controller: p.id, ...(e.counters ? { counters: { ...e.counters } } : {}) });
        });
        const now = ids.filter((id) => obj(s, id).zone === "battlefield");
        if (e.gain && now.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: "game", affected: now, mods: [{ kind: "addKeywords", keywords: e.gain }] });
        if (e.alsoMods && now.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: "game", affected: now, mods: e.alsoMods });
        invalidateCharacteristics(s);
        if (s.linkedExile?.[key]) s.linkedExile[key] = s.linkedExile[key]!.filter((l) => !ids.includes(l.id));
        return;
      }
      if (e.dest === "hand") log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} exiled with ${src} into their hand.`);
      else log(s, `${cards.map((c) => defOf(s, c).name).join(", ")} ${cards.length === 1 ? "goes" : "go"} from exile to ${cards.length === 1 ? "its owner's graveyard" : "their owners' graveyards"} (${src}).`);
      for (const c of cards) moveObject(s, c.id, e.dest);
      s.resolving!.movedLinked = cards.length;
      s.resolving!.movedLinkedIds = cards.map((c) => c.id);
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
      // "Return it to its owner's hand. If you do, ..." (Cartographer's Hawk): only if it went there (not if it had left
      // the battlefield, rulings, or a commander went to the command zone instead, CR 903.9b).
      if (e.setsDid && s.resolving) s.resolving.did = false;
      for (const o of objects(s, e.what, ctx)) {
        if (e.hidden) {
          log(s, `${src} puts a card into ${player(s, o.owner).name}'s hand.`);
          log(s, `It's ${defOf(s, o).name}.`, o.owner);
        } else log(s, `${src} returns ${defOf(s, o).name}${o.zone === "graveyard" ? " from the graveyard" : ""} to its owner's hand.`);
        // Flood of Tears: who controlled the nontoken permanents returned, even one a replacement sends elsewhere (rulings).
        if (o.zone === "battlefield" && !o.isToken && s.resolving) (s.resolving.returnedNontoken ??= []).push(controllerOf(s, o));
        const token = o.isToken;
        moveObject(s, o.id, "hand");
        if (e.setsDid && s.resolving && (token || s.objects[o.id]?.zone === "hand")) s.resolving.did = true;
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
        s.resolving!.did = false;
        const o = objects(s, e.what, ctx)[0];
        // "Exile the top card of your library. You may cast that card." (Chandra, Torch of Defiance): the card exiled.
        if (!o || (e.what.ref === "exiledTop" ? o.zone !== "exile" : o.zone !== "graveyard" || (!e.anyOwner && o.owner !== ctx.controller))) return;
        if (e.unlessCast && (s.castThisTurn ?? []).some((c) => c.player === ctx.controller)) return;
        sc.castNow = { id: o.id };
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "paid", ...(e.anyType ? { anyType: true as const } : {}) };
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
      sc.castNow = undefined;
      s.resolving!.did = cast;
      if (cast && e.exileAfter) o.exileIfToGraveyard = true;
      // "Do this only once each turn": done (CR 603.2h).
      const source = cast && e.once && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (source) (source.triggeredThisTurn ??= []).push(`${ctx.sourceZc ?? source.zoneChanges ?? 0}|do:castNow`);
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
        o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.play ? {} : { castOnly: true as const }), ...(e.exileAfter ? { exileAfter: true as const } : {}) };
        log(s, `${player(s, ctx.controller).name} may ${e.play ? "play" : "cast"} ${defOf(s, o).name} from their graveyard this turn.`);
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
        const cards = [...p.hand, ...(e.orGraveyard ? p.graveyard : [])].filter((id) => (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (!e.lesserPower || power(s, obj(s, id)) < most));
        const upTo = e.upTo === undefined ? Infinity : amountNow(s, e.upTo, ctx);
        // "You may put a land card from your hand onto the battlefield. If you don't, ..." (Hakbal): whether one was put.
        s.resolving!.did = false;
        if (!cards.length || upTo <= 0) return;
        const what = `${e.upTo !== undefined ? `up to ${upTo} ` : e.any ? "any number of " : /^[aeiou]/i.test(e.filter?.text ?? "card") ? "an " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}${e.orGraveyard ? (e.any || e.upTo !== undefined ? " from your hand and/or graveyard" : " from your hand or graveyard") : ""}`;
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.may ? 0 : 1, max: e.any ? Math.min(cards.length, upTo) : 1, fromHand: true };
        return "paused";
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => (o.zone === "hand" || (e.orGraveyard && o.zone === "graveyard")) && o.owner === p.id);
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
      // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g). "Attached to
      // ~" (Danitha): only to the source, still on the battlefield as the same object (CR 400.7).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const self = me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me : undefined;
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: p.id })), src, e.attachToSelf ? (self?.id ?? null) : undefined);
      if (hosts === "paused") return "paused";
      // "That creature gains haste": the permanents these cards became (CR 400.7), like tokens just created.
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        for (const o of cards) {
          const host = hosts.get(o.id);
          if (defOf(s, o).subtypes.includes("Aura") && !host) {
            log(s, `${defOf(s, o).name} has nothing to enchant, so it stays in ${p.name}'s ${o.zone}.`);
            continue;
          }
          // An Equipment "attached to ~": only to a creature it could equip (CR 301.5c-d); otherwise it enters unattached
          // (rulings on Danitha, Benalia's Hope).
          const d = defOf(s, o);
          const equip = e.attachToSelf && !d.subtypes.includes("Aura") && d.subtypes.includes("Equipment") && !isType(d, "Creature") && !!self && objectMatches(s, { kind: "object", types: ["Creature"], text: "creature" }, self, p.id, false, d) ? { attachTo: self.id } : undefined;
          const attacks = defender !== undefined && isType(defOf(s, o), "Creature");
          log(s, `${p.name} puts ${defOf(s, o).name} from their ${o.zone} onto the battlefield${e.tapped ? ", tapped" : ""}${attacks ? ` and attacking ${attack!.label}` : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}${equip ? ` attached to ${defOf(s, self!).name}` : e.attachToSelf && !host ? ", unattached" : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: p.id, ...(e.tapped ? { tapped: true } : {}), ...(e.counters ? { counters: e.counters } : {}), ...host, ...equip });
          if (attacks && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
            o.attacking = defender;
            if (attack?.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
          }
          if (o.zone !== "battlefield") continue;
          if (me) o.putBy = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
          s.resolving?.created?.push(o.id);
          if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
          if (e.atEndStep) {
            const verb = e.atEndStep === "exile" ? "Exile" : e.atEndStep === "hand" ? "Return" : "Sacrifice";
            addDelayed(s, "nextEndStep", p.id, o, { targets: [], effects: [e.atEndStep === "exile" ? { type: "exile", what: { ref: "subject" } } : e.atEndStep === "hand" ? { type: "bounce", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${verb} ~${e.atEndStep === "hand" ? " to your hand" : ""}.` });
          }
        }
      });
      s.resolving!.did = cards.some((o) => o.zone === "battlefield");
      // Cultivator Colossus: a card was put, so draw and go again (its triggers wait until this resolves, rulings).
      if (e.drawRepeat && cards.some((o) => o.zone === "battlefield")) {
        draw(s, p.id);
        delete sc.found;
        return runZonesEffect(s, e, ctx, src);
      }
      return;
    }
    case "weld": {
      if (!ctx.legal[e.artifact] || !ctx.legal[e.card]) return;
      const [ta, tc] = [ctx.targets[e.artifact], ctx.targets[e.card]];
      const a = ta?.kind === "object" ? s.objects[ta.id] : undefined;
      const c = tc?.kind === "object" ? s.objects[tc.id] : undefined;
      if (a?.zone !== "battlefield" || c?.zone !== "graveyard") return;
      // The card must still be in that player's graveyard: the artifact's controller now (a target still legal, CR 608.2b).
      const pid = controllerOf(s, a);
      if (c.owner !== pid) return;
      log(s, `${player(s, pid).name} sacrifices ${defOf(s, a).name} and returns ${defOf(s, c).name} to the battlefield.`);
      moveObject(s, a.id, "graveyard", { sacrificed: true });
      enterTogether(s, () => moveObject(s, c.id, "battlefield", { controller: pid }));
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
      if (e.faceDown) {
        // Yedora: face down as a Forest land, whatever the card is (CR 708.2a); not an Aura there, so it enchants nothing.
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const o of list) {
            log(s, `${src} returns ${defOf(s, o).name} to the battlefield face down under ${player(s, under(o)).name}'s control: it's a Forest land.`);
            moveObject(s, o.id, "battlefield", { controller: under(o), faceDown: e.faceDown });
            if (o.zone === "battlefield") s.resolving?.created?.push(o.id);
          }
        });
        return;
      }
      // Auras: their controller chooses what each enchants as it enters (CR 303.4f), all before any card moves; one with
      // nothing to enchant stays where it is (303.4g).
      // "Transformed": a double-faced card with its back face up; anything else stays where it is (CR 712.14a).
      // "Flipped": a flip card enters flipped (CR 710.1b); any other card enters as it is, the flip being impossible.
      const faceOf = (o: GameObject) => (e.transformed ? transformedFace(s, o) : e.flipped && s.cards[o.cardId]?.layout === "flip" && s.cards[o.cardId]!.faces?.length === 2 ? 1 : undefined);
      const entering = list.filter((o) => (e.transformed ? faceOf(o) !== undefined : isPermanentCard(defOf(s, o))));
      // Unfinished Business: the creature the instruction before returned, while it's still on the battlefield.
      const returned = e.attachToCreated ? (s.resolving?.created ?? []).map((id) => s.objects[id]).find((o) => o?.zone === "battlefield" && objIsType(s, o, "Creature")) : undefined;
      // "Put it onto the battlefield attacking" (Senu): only during combat, attacking what its controller chooses as it
      // enters (CR 508.4, rulings); outside combat it just enters (CR 506.3d).
      const attackOptions = e.attacking && inCombat(s) && entering.some((o) => isType(defOf(s, o), "Creature")) ? attackChoices(s, ctx.controller, ctx.sourceId) : [];
      const sc = (s.resolving!.scratch ??= {});
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, entering.find((o) => isType(defOf(s, o), "Creature"))!).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      const hosts = e.attachToSubject || e.attachToTarget !== undefined || e.attachToEnchanted || e.attachToCreated ? new Map<ObjectId, AuraHost>() : chooseAuraHosts(s, entering.map((o) => ({ o, under: under(o), face: faceOf(o) })), src);
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
          if (e.attachToCreated) {
            // An Aura only onto a creature it could enchant (CR 303.4d, 303.4f), otherwise it stays in the graveyard; an
            // Equipment that can't be attached to it (or with no creature returned) enters unattached (rulings, CR 301.5c).
            const aura = d.subtypes.includes("Aura");
            const enchant = aura ? compileCard(d).enchant : undefined;
            const ok =
              !!returned &&
              (aura
                ? enchant?.kind === "object" && objectMatches(s, enchant, returned, ctx.controller, false, d)
                : d.subtypes.includes("Equipment") && !isType(d, "Creature") && objectMatches(s, { kind: "object", types: ["Creature"], text: "creature" }, returned, ctx.controller, false, d));
            if (!ok && (aura || !isPermanentCard(d))) {
              log(s, `${d.name} can't be attached to ${returned ? defOf(s, returned).name : "that creature"}, so it stays in the graveyard.`);
              continue;
            }
            log(s, `${src} returns ${d.name} to the battlefield${ok ? ` attached to ${defOf(s, returned!).name}` : ", unattached"}.`);
            moveObject(s, o.id, "battlefield", { controller: ctx.controller, ...(ok ? { attachTo: returned!.id } : {}) });
            if (o.zone === "battlefield") s.resolving?.created?.push(o.id);
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
          const attacks = attack !== undefined && isType(d, "Creature");
          log(s, `${src} puts ${d.name} onto the battlefield under ${player(s, under(o)).name}'s control${e.tapped ? ", tapped" : ""}${face ? (e.flipped ? " flipped" : " and transformed") : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}${attacks ? ` and attacking ${attack!.label}` : ""}.`);
          moveObject(s, o.id, "battlefield", { controller: under(o), tapped: e.tapped, ...(e.becomes ? { becomes: e.becomes } : {}), ...(e.entersAs && (ctx.x ?? 0) >= e.entersAs.x ? { entersAs: e.entersAs.mods } : {}), ...(e.counters ? { counters: e.counters } : {}), ...(e.countersFromLast ? { counters: { [e.countersFromLast.kind]: Math.max(0, (s.lastKnown?.[o.id]?.counters?.[e.countersFromLast.kind] ?? 0) + e.countersFromLast.plus) } } : {}), ...(face ? { face } : {}), ...host }); // CR 110.2a
          // Attacking as it enters, before its enters abilities trigger (CR 508.4).
          if (attacks && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
            o.attacking = attack!.player;
            if (attack!.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack!.planeswalker);
          }
          // "That creature gains haste until end of turn. Exile it at the beginning of the next end step" (Corpse Dance): only
          // the permanent it became, while it's still that object (CR 400.7, rulings).
          if (o.zone !== "battlefield") continue;
          s.resolving?.created?.push(o.id);
          if (e.alsoMods) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [o.id], mods: e.alsoMods });
          // Nim Deathmantle: attached to it if it could be; otherwise it stays where it is (CR 701.3b; rulings).
          if (e.attachSelf) {
            const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
            if (me?.zone === "battlefield") attachTo(s, me, o);
          }
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
      } else if (e.dest === "creatureOrHand") {
        log(s, `${src}: ${d.name} is chosen at random and put into ${p.name}'s hand.`);
        moveObject(s, o.id, "hand");
      } else {
        log(s, `${src}: ${d.name} is chosen at random and exiled.`);
        moveObject(s, o.id, "exile");
      }
      return;
    }
    case "chooseFromGraveyard": {
      if (e.who?.ref === "eachPlayer") return eachFromGraveyard(s, e, ctx, src);
      if (e.fromExile) {
        // Karn, the Great Creator: a face-up card you own in exile, into your hand (rulings: never a face-down one).
        // Oblivion Sower: that player's face-up land cards in exile, onto the battlefield under your control.
        const p = player(s, ctx.controller);
        const ownerId = e.who ? players(s, e.who, ctx)[0] : p.id;
        if (ownerId === undefined) return;
        const owner = player(s, ownerId);
        const sc = (s.resolving!.scratch ??= {});
        const fits = (id: ObjectId) => obj(s, id).owner === owner.id && obj(s, id).zone === "exile" && !obj(s, id).faceDown && !obj(s, id).hiddenExile && (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        if (!sc.found) {
          const cards = owner.exile.filter(fits);
          if (!cards.length) return;
          const kind = e.filter?.text ?? "card";
          const toField = e.dest === "battlefield";
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: e.anyNumber ? `any number of ${kind}s` : `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`, cards, min: e.upTo ? 0 : 1, max: e.anyNumber ? cards.length : 1, exiled: true, dig: { looked: cards, to: toField ? "to put onto the battlefield under your control" : "to put into your hand", rest: "stay in exile" } };
          return "paused";
        }
        if (e.dest === "battlefield") {
          const found = sc.found.filter(fits);
          sc.found = undefined;
          if (found.length) log(s, `${p.name} puts ${found.map((id) => defOf(s, obj(s, id)).name).join(", ")} from exile onto the battlefield under their control.`);
          enterTogether(s, () => {
            for (const id of found) moveObject(s, id, "battlefield", { controller: p.id });
          });
          return;
        }
        const found = sc.found.filter((id) => p.exile.includes(id) && !obj(s, id).faceDown && !obj(s, id).hiddenExile);
        if (found.length) log(s, `${p.name} puts ${found.map((id) => defOf(s, obj(s, id)).name).join(", ")} from exile into their hand.`);
        for (const id of found) moveObject(s, id, "hand");
        return;
      }
      if (e.anyGraveyard) {
        // "Exile a card from a graveyard" (Cemetery Prowler): you choose one in any graveyard as it resolves (CR 608.2c);
        // it's linked to this source (CR 607.2a).
        const sc = (s.resolving!.scratch ??= {});
        // "Put a creature card from a graveyard onto the battlefield under your control" (Extract from Darkness): not
        // targeted; any permanent card matching, chosen as it resolves (CR 110.4b).
        const toField = e.dest === "battlefield";
        const fits = (id: ObjectId) => (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) && (!toField || isPermanentCard(defOf(s, obj(s, id))));
        // "From among the milled cards" after "each player mills four cards" (Gyruda, Doom of Depths): only those, still the
        // same objects (CR 400.7), the ones a replacement exiled instead too (rulings).
        const same = (m: { id: ObjectId; zc: number }) => (obj(s, m.id).zoneChanges ?? 0) === m.zc;
        const yards = () =>
          e.milled
            ? [...(s.resolving!.milled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "graveyard"), ...(s.resolving!.milledExiled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "exile")].map((m) => m.id).filter(fits)
            : livingPlayers(s).flatMap((pid) => player(s, pid).graveyard).filter(fits);
        if (!sc.found) {
          const cards = yards();
          if (!cards.length) return;
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: e.filter?.text ? `a ${e.filter.text}` : "a card", cards, min: 1, max: 1, fromGraveyard: toField ? "battlefield" : "exile", anyGraveyard: true, ...(cards.some((id) => obj(s, id).zone === "exile") ? { exiled: true as const } : {}) };
          return "paused";
        }
        const found = sc.found.filter((id) => yards().includes(id));
        sc.found = undefined;
        // "When that creature dies, ..." (The Deck of Many Things): the permanent it became (CR 400.7).
        if (toField && s.resolving) s.resolving.created = [];
        for (const id of found) {
          const o = obj(s, id);
          if (toField) {
            log(s, `${player(s, ctx.controller).name} puts ${defOf(s, o).name} from ${o.zone === "exile" ? "exile" : `${o.owner === ctx.controller ? "their" : `${player(s, o.owner).name}'s`} graveyard`} onto the battlefield.`);
            moveObject(s, id, "battlefield", { controller: ctx.controller });
            if (o.zone === "battlefield" && s.resolving) s.resolving.created!.push(id);
            continue;
          }
          log(s, `${player(s, ctx.controller).name} exiles ${defOf(s, o).name} from ${o.owner === ctx.controller ? "their" : `${player(s, o.owner).name}'s`} graveyard.`);
          moveObject(s, id, "exile");
          if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
        }
        return;
      }
      const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (pid === undefined || player(s, pid).lost) return;
      const p = player(s, pid);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.found) {
        // Only permanent cards can be put onto the battlefield (CR 110.4b).
        const mvMax = e.mvMax === undefined ? undefined : amountNow(s, e.mvMax, ctx);
        // "Of the chosen type" (Haunting Voyage): the type chosen as it resolves; with none, nothing fits.
        const bound = e.filter?.chosen ? bindChosen(e.filter, ctx.chosen) : e.filter;
        if (bound?.chosen) return;
        const filter = bound && mvMax !== undefined ? { ...bound, manaValue: { max: mvMax }, text: bound.text.replace(/ X or less$/, ` ${mvMax} or less`) } : bound;
        // Only the cards milled just before, still in the graveyard (CR 400.7).
        // Colossal Grave-Reaver: only the cards the trigger's event put there, still the same objects.
        const milled = (id: ObjectId) =>
          (!e.milled || !!s.resolving!.milled?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc)) && (!e.eventGroup || !!ctx.event?.group?.some((g) => g.id === id && (obj(s, id).zoneChanges ?? 0) === g.zc)) &&
          // "Another permanent card" than the one you sacrificed this way (rulings on Rise of the Witch-king).
          (!e.notSacrificed || !s.resolving!.sacrificedThisWay?.some((k) => k.id === id && k.controller === ctx.controller)) &&
          // Starfall Invocation: a card that died to this destroy and hasn't moved since (CR 400.7).
          (!e.destroyedThisWay || !!s.resolving!.destroyed?.some((d) => d.died && d.o.id === id && (obj(s, id).zoneChanges ?? 0) === (d.o.zoneChanges ?? 0) + 1));
        const all = p.graveyard.filter((id) => milled(id) && (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (e.dest !== "battlefield" || isPermanentCard(defOf(s, obj(s, id)))) && (e.totalMv === undefined || defMv(defOf(s, obj(s, id))) <= e.totalMv));
        // "With different names": one card of each name is offered (cards of one name are alike).
        const cards = e.oneEach ? all.filter((id, i) => all.findIndex((x) => sameName(defOf(s, obj(s, x)).name, defOf(s, obj(s, id)).name)) === i) : all;
        // "Return that many creature cards" (Lich-Knights' Conquest): counted as it resolves.
        const count = e.nAmount !== undefined ? Math.max(0, amountNow(s, e.nAmount, ctx)) : e.n;
        const max = e.distinctManaValues ? new Set(cards.map((id) => defMv(defOf(s, obj(s, id))))).size : Math.min(count, cards.length);
        // "If you don't" after a card from among the milled ones (Ainok Wayfarer): whether one was put into your hand.
        if (e.milled) s.resolving!.did = false;
        if (!max) return;
        const kind = filter?.text ?? "card";
        const what = e.distinctManaValues
          ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different mana values`
          : e.oneEach && e.upTo && e.n >= 99
            ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different names`
          : count === 1
            ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`
            : `${e.upTo ? "up to " : ""}${count} ${kind.replace(/\bcard\b/, "cards")}${e.totalMv !== undefined ? ` with total mana value ${e.totalMv} or less` : ""}`;
        // Realmbreaker: you choose from their graveyard.
        s.pending = { kind: "searchLibrary", player: e.youChoose ? ctx.controller : p.id, source: src, what: e.youChoose ? `${what} in ${p.name}'s graveyard` : what, cards, min: e.upTo ? 0 : max, max, fromGraveyard: e.dest ?? "hand", ...(e.distinctManaValues ? { distinctManaValues: true as const } : {}), ...(e.totalMv !== undefined ? { totalMv: e.totalMv } : {}) };
        return "paused";
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id));
      if (e.dest === "battlefield") {
        // An Aura's controller chooses what it enchants as it enters (CR 303.4f), or it stays in the graveyard (303.4g).
        const hosts = chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: e.youChoose ? ctx.controller : p.id })), src);
        if (hosts === "paused") return "paused";
        const ids = found.filter((id) => !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        if (e.youChoose) {
          // Realmbreaker: under your control; "it" afterwards is the permanent it became (CR 400.7).
          const me = player(s, ctx.controller);
          if (ids.length) log(s, `${me.name} puts ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${p.name}'s graveyard onto the battlefield under their control${e.tapped ? ", tapped" : ""}.`);
          enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: me.id, ...(e.tapped ? { tapped: true } : {}), ...hosts.get(id) })));
          if (s.resolving) s.resolving.created = ids.filter((id) => obj(s, id).zone === "battlefield");
          return;
        }
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
    case "commandersOntoBattlefield": {
      // Tevesh Szat: each commander card in a command zone that's a permanent card (CR 110.4b), all at once, under your
      // control; their owners stay who they were (CR 108.3).
      const sc = (s.resolving!.scratch ??= {});
      sc.found ??= apnap(s, s.turnOrder.filter((pid) => !player(s, pid).lost)).flatMap((pid) => player(s, pid).command.filter((id) => obj(s, id).isCommander && isPermanentCard(defOf(s, obj(s, id)))));
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "command");
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: ctx.controller })), src);
      if (hosts === "paused") return "paused";
      const ids = cards.filter((o) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id)).map((o) => o.id);
      if (ids.length) log(s, `${src} puts ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield under ${player(s, ctx.controller).name}'s control.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller, ...hosts.get(id) })));
      return;
    }
    case "returnAllFromGraveyard": {
      if (e.toHand) {
        // All at once (CR 608.2c), whatever they are.
        // Garna: only those put there this turn (GameObject.toGraveyardTurn).
        const ids = players(s, e.who, ctx).flatMap((pid) => player(s, pid).graveyard.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))) && (!e.filter.putThereThisTurn || obj(s, id).toGraveyardTurn === s.turn)));
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
        // "With mana value X or less": this spell's X (TargetSpec.xRange).
        const { xRange, ...rest } = bindChosen(e.filter, ctx.chosen);
        const filter: TargetSpec = xRange ? { ...rest, manaValue: { max: ctx.x ?? 0 } } : rest;
        // The active player chooses for their Auras first, then the others in turn order (APNAP, Open the Vaults rulings).
        for (const pid of apnap(s, players(s, e.who, ctx)))
          for (const id of player(s, pid).graveyard) {
            const d = defOf(s, s.objects[id]!);
            if (isPermanentCard(d) && printedMatches(filter, d) && (!filter.putThereThisTurn || obj(s, id).toGraveyardTurn === s.turn) && !(e.notSacrificedThisWay && s.resolving!.sacrificedThisWay?.some((k) => k.id === id))) sc.found.push(id);
          }
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "graveyard");
      const under = (o: GameObject) => (e.owners ? o.owner : ctx.controller);
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: under(o) })), src, undefined, e.auraOnCreature);
      if (hosts === "paused") return "paused";
      const ids = cards.filter((o) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id)).map((o) => o.id);
      if (ids.length) log(s, `${src} returns ${ids.map((id) => defOf(s, s.objects[id]!).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} to the battlefield${e.tapped ? ", tapped" : ""}.`);
      enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: under(obj(s, id)), tapped: e.tapped, ...hosts.get(id) })));
      // "They gain haste until end of turn" (Wake the Past): the permanents they became.
      (s.resolving!.created ??= []).push(...ids.filter((id) => obj(s, id).zone === "battlefield"));
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
    case "exiledToGraveyard": {
      const cards = (e.cards ?? []).filter((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id);
      if (cards.length) log(s, `${src} puts ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} into ${cards.length === 1 ? "its owner's graveyard" : "their owners' graveyards"}.`);
      for (const id of cards) moveObject(s, id, "graveyard");
      // Only what got there (not what a replacement effect sent elsewhere) was put there this way.
      s.resolving!.movedLinked = cards.filter((id) => s.objects[id]?.zone === "graveyard").length;
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
    case "putInLibrary": {
      // Owners choosing for several objects (Aetherspouts): the active player makes all of their choices first, then each
      // other player in turn order (rulings, CR 101.4).
      const order = e.position === "ownersChoice" ? apnap(s, s.turnOrder) : [];
      const todo = [...objects(s, e.what, ctx)];
      if (order.length) todo.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner));
      for (const o of todo) {
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
    }
    case "exileGraveyard": {
      // "Until ~ leaves the battlefield" (Idol of Endurance): if it already left, nothing is exiled (CR 610.3c).
      const me = e.until ? objects(s, { ref: "self" }, ctx)[0] : undefined;
      if (e.until && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (e.library) {
          const n = p.library.length;
          for (const id of [...p.library]) moveObject(s, id, "exile");
          log(s, `${src} exiles ${p.name}'s library (${n} card${n === 1 ? "" : "s"}).`);
          continue;
        }
        const cards = p.graveyard.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))));
        const n = cards.length;
        for (const id of cards) {
          // "Creature cards exiled this way": their power as it was in the graveyard (rulings on Szat's Will).
          const o = obj(s, id);
          if (s.resolving && objIsType(s, o, "Creature")) (s.resolving.exiledPowers ??= []).push(power(s, o));
          moveObject(s, id, "exile");
          if (o.zone === "exile" && s.resolving) (s.resolving.exiledCards ??= []).push(id);
          if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
          if (me && o.zone === "exile") (me.exiledUntilLeaves ??= []).push({ id, zc: o.zoneChanges ?? 0, graveyard: true });
        }
        if (e.filter) log(s, `${src} exiles ${n ? cards.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from ${p.name}'s graveyard${e.until ? ` until ${src} leaves the battlefield` : ""}.`);
        else log(s, `${src} exiles ${p.name}'s graveyard (${n} card${n === 1 ? "" : "s"}).`);
      }
      return;
    }
    case "flicker": {
      // Exiled, then returned together once any Aura's host is chosen (CR 303.4f). With `at`, one delayed trigger returns
      // all the cards exiled this way together (CR 603.7), those still in exile then (CR 400.7).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.flickered) {
        sc.flickered = [];
        const later: { id: ObjectId; zc: number }[] = [];
        let first: GameObject | undefined;
        // A target that already left and came back this resolution is a new object, no longer the target (CR 400.7):
        // Eldrazi Confluence's blink chosen twice for the same permanent blinks it once (rulings).
        const stamped = (o: GameObject) => {
          if (e.what.ref !== "target") return true;
          const t = ctx.targets.slice(e.what.index, e.what.index + (e.what.n ?? 1)).find((x) => x?.kind === "object" && x.id === o.id);
          return t?.kind !== "object" || t.zc === undefined || t.zc === (o.zoneChanges ?? 0);
        };
        for (const o of objects(s, e.what, ctx)) {
          if (o.zone !== "battlefield" || !stamped(o)) continue;
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
          addDelayed(s, e.at === "ownersNextEndStep" ? "playersNextEndStep" : "nextEndStep", ctx.controller, first, {
            targets: [],
            effects: [{ type: "returnExiled", under: e.under, ...(e.counter ? { counter: e.counter } : {}), ...(e.counterIfCreature ? { counterIfCreature: true as const } : {}), ...(e.loyaltyIfPlaneswalker ? { loyaltyIfPlaneswalker: true as const } : {}), ...(e.tapped ? { tapped: true as const } : {}), ...(later.length > 1 ? { cards: later } : {}), ...(e.selfCounterIfYours && ctx.sourceId ? { selfCounter: { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0, counter: e.selfCounterIfYours } } : {}) }],
            text: `Return ${names} to the battlefield${e.tapped ? " tapped" : ""} under ${e.under === "owner" ? (later.length > 1 ? "their owners'" : "its owner's") : "your"} control.`,
          }, cardIdOf(first), e.at === "ownersNextEndStep" ? first.owner : undefined);
        }
      }
      const back = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      if (returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counter, e.tapped, e.transformed) === "paused") return "paused";
      s.resolving!.flickeredBack = back.filter((c) => c.zone === "battlefield").map((c) => c.id);
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
    case "permanentPiles": {
      // CR 700.3: you separate every permanent the player controls into two piles (one can be empty, and an Aura can go
      // in a different pile from what it enchants: rulings); that player chooses one, and all of it is sacrificed at once.
      const sc = (s.resolving!.scratch ??= {});
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined) return;
      if (!sc.looked) {
        sc.looked = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
        if (!sc.looked.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "pile", what: "permanent", options: sc.looked, count: sc.looked.length, min: 0, anyNumber: true, of: pid };
        return "paused";
      }
      const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no permanents");
      const one = sc.chosen?.[ctx.controller] ?? [];
      const two = sc.looked.filter((id) => !one.includes(id));
      if (sc.pileChoice === undefined) {
        log(s, `${player(s, ctx.controller).name} separates ${player(s, pid).name}'s permanents into two piles: ${names(one)}; and ${names(two)}.`);
        s.pending = { kind: "chooseOption", player: pid, source: src, what: "pile", options: ["0", "1"], labels: [`Pile 1: ${names(one)}`, `Pile 2: ${names(two)}`], piles: [one, two], of: pid, sacrificePile: true, prompt: "choose the pile of your permanents to sacrifice" };
        return "paused";
      }
      for (const id of sc.pileChoice === 0 ? one : two) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || controllerOf(s, o) !== pid || !canBeSacrificed(s, o)) continue;
        log(s, `${player(s, pid).name} sacrifices ${defOf(s, o).name}.`);
        moveObject(s, id, "graveyard", { sacrificed: true });
      }
      return;
    }
    case "returnHeld": {
      const sc = (s.resolving!.scratch ??= {});
      const list = sc.returningHeld ?? (s.resolving!.held ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
      s.resolving!.held = undefined;
      if (!list.length) return;
      if (e.at) {
        const first = s.objects[list[0]!.id]!;
        const names = list.map((l) => defOf(s, s.objects[l.id]!).name).join(", ");
        addDelayed(s, "nextEndStep", ctx.controller, first, {
          targets: [],
          effects: [{ type: "returnExiled", under: e.under, ...(list.length > 1 ? { cards: list } : {}), ...(e.counters ? { counters: e.counters } : {}) }],
          text: `Return ${names} to the battlefield under ${e.under === "owner" ? (list.length > 1 ? "their owners'" : "its owner's") : "your"} control.`,
        }, cardIdOf(first));
        return;
      }
      const back = list.map((l) => s.objects[l.id]!).filter((o) => o.zone === "exile");
      if (returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counters) === "paused") {
        sc.returningHeld = list;
        return "paused";
      }
      sc.returningHeld = undefined;
      if (!e.thenExile) return;
      // "Then exile them again": the permanents those cards became (CR 400.7), held for the next instruction.
      const held: { id: ObjectId; zc: number }[] = [];
      for (const l of list) {
        const o = s.objects[l.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== l.zc + 1) continue;
        log(s, `${src} exiles ${defOf(s, o).name} again.`);
        moveObject(s, o.id, "exile");
        for (const n of newObjects(o)) if (!s.objects[n.id]?.isToken) held.push(n);
      }
      s.resolving!.held = held;
      return;
    }
    case "returnExiled": {
      const list = e.cards ?? (ctx.subject ? [ctx.subject] : []);
      const back = list.map((l) => s.objects[l.id]).filter((o, i): o is GameObject => o?.zone === "exile" && (o.zoneChanges ?? 0) === list[i]!.zc);
      const sc = (s.resolving!.scratch ??= {});
      if (back.length && returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counters ? [...(e.counter ? [e.counter] : []), ...e.counters] : e.counter, e.tapped, false, e.counterIfCreature, e.loyaltyIfPlaneswalker) === "paused") {
        sc.returning ??= list.filter((l) => back.some((b) => b.id === l.id));
        return "paused";
      }
      // Phelia: "If it entered under your control" (the card it became, CR 400.7), a counter on the source if it's still there.
      const came = sc.returning ?? list.filter((l) => back.some((b) => b.id === l.id));
      sc.returning = undefined;
      const me = e.selfCounter && s.objects[e.selfCounter.id];
      if (me && me.zone === "battlefield" && (me.zoneChanges ?? 0) === e.selfCounter!.zc && came.some((l) => { const c = s.objects[l.id]; return c?.zone === "battlefield" && (c.zoneChanges ?? 0) === l.zc + 1 && controllerOf(s, c) === ctx.controller; })) {
        const put = putCounters(s, me, e.selfCounter!.counter, 1);
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, me).name} gets ${put} ${e.selfCounter!.counter} counter${put > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "exileIfLeaves":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.exileIfLeaves = "battlefield";
      return;
    case "exileReturnThisTurn": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      s.exileReturnTurn = [...(s.exileReturnTurn ?? []).filter((x) => x.turn === s.turn), { player: ctx.controller, turn: s.turn, source: src, sourceCardId: me ? cardIdOf(me) : "" }];
      log(s, `This turn, ${player(s, ctx.controller).name}'s permanents are exiled instead of being put into a graveyard, and return at the beginning of the next end step.`);
      return;
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
        // One card chosen at random, seen only by the player looking.
        if (e.atRandom) {
          const id = p.hand.length ? p.hand[Math.floor(nextRandom(s) * p.hand.length)]! : undefined;
          log(s, `${player(s, ctx.controller).name} looks at a card at random in ${p.name}'s hand.`);
          if (id) log(s, `${p.name}'s card: ${defOf(s, obj(s, id)).name}.`, ctx.controller);
          continue;
        }
        const cards = p.hand.map((id) => defOf(s, obj(s, id)).name).join(", ") || "no cards";
        if (e.reveal) log(s, `${p.name} reveals their hand: ${cards}.`);
        else {
          log(s, `${player(s, ctx.controller).name} looks at ${p.name}'s hand.`);
          log(s, `${p.name}'s hand: ${cards}.`, ctx.controller);
        }
      }
      return;
    case "noCombatDamage":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") e.combat ? (o.noCombatDamageCombat = { turn: s.turn, combat: s.combatsThisTurn ?? 0 }) : (o.noCombatDamageTurn = s.turn);
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
        const ch = characteristics(s, o);
        const last = { id: o.id, power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), controller: by, types: [...ch.types] };
        moveObject(s, o.id, "graveyard", { sacrificed: true });
        // "If you do" (Dark Depths): it was sacrificed (CR 701.21a).
        if (s.resolving && o.zone !== "battlefield") (s.resolving.sacrificedThisWay ??= []).push(last);
      }
      return;
    case "ninjutsu": {
      // Put this card onto the battlefield from your hand tapped and attacking whom the returned creature was
      // attacking (CR 702.49a, c). It was never declared as an attacker, so "whenever attacks" doesn't trigger (508.4).
      const id = ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      const zc = s.resolving?.item.sourceZc;
      // Commander ninjutsu: from the command zone too (CR 702.49d).
      if (!o || (o.zone !== "hand" && o.zone !== "command") || o.owner !== ctx.controller || (zc !== undefined && (o.zoneChanges ?? 0) !== zc)) return;
      // Attacking as it enters, before its enters abilities trigger ("if it's attacking", Thousand-Faced Shadow).
      enterTogether(s, () => {
        moveObject(s, o.id, "battlefield", { tapped: true });
        if ((o.zone as string) === "battlefield" && ctx.lki) enterAttacking(s, o, ctx.lki);
      });
      if ((o.zone as string) !== "battlefield") return;
      log(s, `${player(s, ctx.controller).name} puts ${characteristics(s, o).name} onto the battlefield tapped${o.attacking !== undefined ? ` and attacking ${attackedName(s, o)}` : ""} (ninjutsu).`);
      return;
    }
    case "forEachThisWay": {
      // All of them left first (rulings on Rampage of the Clans); each player then gets theirs, in APNAP order, as many as
      // they controlled (CR 608.2h). A destroyed one counts even if it went somewhere other than a graveyard (rulings).
      const counts = new Map<PlayerId, number>();
      for (const x of s.resolving?.[e.which] ?? [])
        if ((!e.graveyard || ("died" in x && x.died)) && objectMatches(s, e.filter, x.o, ctx.controller, false, undefined, x.ch)) counts.set(x.ch.controller, (counts.get(x.ch.controller) ?? 0) + 1);
      // A search pauses for its player's choice (Winds of Abandon): the players done so far are kept.
      const done = (s.resolving!.scratch ??= {}).forEachDone ?? [];
      s.resolving!.scratch.forEachDone = done;
      for (const pid of apnap(s, [...counts.keys()])) {
        if (player(s, pid).lost || done.includes(pid)) continue;
        const n = counts.get(pid)!;
        for (const inner of e.effects) if (runEffect(s, inner.type === "createToken" || inner.type === "draw" || inner.type === "search" || inner.type === "loseLife" ? { ...inner, n } : inner, { ...ctx, eachOne: pid }) === "paused") return "paused";
        done.push(pid);
        // The next player's search starts afresh (its queue, count and found cards are in the scratch).
        s.resolving!.scratch = { forEachDone: done };
      }
      s.resolving!.scratch = {};
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
    case "castLinkedFree": {
      // Court of Locthwain: one spell from among the cards its own exile took (CR 607.2a), for the rest of this turn.
      if (!ctx.sourceId) return;
      (s.linkedFreeCasts ??= []).push({ player: ctx.controller, source: `${ctx.sourceId}@${ctx.sourceZc ?? 0}`, turn: s.turn, sourceName: src, ...(e.filter ? { filter: e.filter } : {}) });
      log(s, `${player(s, ctx.controller).name} may cast ${e.filter ? `a ${e.filter.text.replace(/ card$/, "")}` : "a"} spell from among the cards exiled with ${src} this turn without paying its mana cost.`);
      return;
    }
    case "impulse": {
      // Exiled face up (CR 406.3); the permission belongs to this object only (CR 400.7).
      const p = player(s, ctx.controller);
      // "Exile the top card of each player's library" (Nashi): each library in turn, all part of one group.
      // "Exile the top card of each opponent's library" (Brainstealer Dragon, Stolen Strategy): the same, opponents only.
      // "Each of those opponents' libraries" (Breeches, Brazen Plunderer): the opponents dealt damage.
      if (e.who?.ref === "eachPlayer" || e.who?.ref === "eachOpponent" || e.who?.ref === "eventPlayers") {
        const oneOf = e.oneOf ? `g${s.nextId++}` : undefined;
        const all: ObjectId[] = [];
        for (const pid of apnap(s, players(s, e.who, ctx))) {
          const ids = e.graveyards ? [...player(s, pid).graveyard] : player(s, pid).library.slice(0, amountNow(s, e.n, ctx));
          for (const id of ids) {
            moveObject(s, id, "exile");
            const o = obj(s, id);
            o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.castOnly ? { castOnly: true as const } : {}), ...(oneOf ? { oneOf } : {}), ...(e.life ? { life: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}) };
          }
          all.push(...ids);
        }
        if (s.resolving) (s.resolving.impulsed ??= []).push(...all);
        if (all.length) log(s, `${p.name} exiles ${all.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${e.graveyards ? "each opponent's graveyard" : `the top of each ${e.who.ref === "eachOpponent" ? "opponent's " : ""}library`} and may ${e.oneOf ? "play one of them" : e.castOnly ? "cast them" : "play them"}${e.life ? ", paying life rather than mana for a spell" : ""}${e.anyType ? ", spending mana as though it were mana of any color" : ""}${e.until === "thisTurn" ? " this turn" : ""}.`);
        return;
      }
      const from = e.who ? players(s, e.who, ctx)[0] : p.id;
      if (from === undefined) return;
      if (e.hand) {
        // Elder Brain: the whole hand, then that player draws as many as were exiled.
        const sc = (s.resolving!.scratch ??= {});
        if (sc.handExiled) return;
        sc.handExiled = true;
        const ids = [...player(s, from).hand];
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        for (const id of gone) {
          const o = obj(s, id);
          o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.anyType ? { anyType: true as const } : {}) };
        }
        if (s.resolving) (s.resolving.impulsed ??= []).push(...gone);
        log(s, gone.length ? `${p.name} exiles ${gone.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${player(s, from).name}'s hand and may play them, spending mana as though it were mana of any color.` : `${player(s, from).name} has no cards in hand.`);
        if (gone.length && !draw(s, from, gone.length)) return "paused";
        return;
      }
      if (e.choose) {
        // Party Thrasher: the cards exiled (face up, CR 406.3), then one of them chosen as this resolves (CR 608.2d); only
        // that one may be played. The rest stay exiled.
        const sc = (s.resolving!.scratch ??= {});
        if (!sc.impulseChoice) {
          const ids = player(s, from).library.slice(0, amountNow(s, e.n, ctx));
          for (const id of ids) moveObject(s, id, "exile");
          sc.impulseChoice = { ids };
          if (ids.length) log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of ${from === p.id ? "their" : `${player(s, from).name}'s`} library.`);
          if (ids.length > 1) {
            s.pending = { kind: "chooseOption", player: p.id, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => defOf(s, obj(s, id)).name), prompt: `choose one of them; you may play it${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of your next turn" : ""}` };
            return "paused";
          }
        }
        const st = sc.impulseChoice;
        sc.impulseChoice = undefined;
        const id = st.pick ?? st.ids[0];
        const o = id ? s.objects[id] : undefined;
        if (!o || o.zone !== "exile") return;
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.castOnly ? { castOnly: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}) };
        if (s.resolving) (s.resolving.impulsed ??= []).push(o.id);
        log(s, `${p.name} chooses ${defOf(s, o).name} and may play it${e.anyType ? ", spending mana as though it were mana of any color" : ""}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : ""}.`);
        return;
      }
      const ids = player(s, from).library.slice(0, amountNow(s, e.n, ctx));
      // "You may cast an instant or sorcery spell from among those exiled cards" (Chandra, Hope's Beacon): one group.
      const oneOf = e.oneOf ? `g${s.nextId++}` : undefined;
      // Unstable Amulet: exiling another card with this object ends the permission for the one before (the same object,
      // CR 400.7; once it has left, the last card's permission lasts as long as the card stays exiled, rulings).
      const another = e.untilAnother && ctx.sourceId ? `${ctx.sourceId}@${ctx.sourceZc ?? 0}` : undefined;
      if (another && ids.length)
        for (const x of Object.values(s.objects)) if (x.zone === "exile" && x.mayPlay?.untilAnother === another) x.mayPlay = undefined;
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (e.castFilter && !printedMatches(e.castFilter, defOf(s, o))) continue;
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.castOnly ? { castOnly: true as const } : {}), ...(oneOf ? { oneOf } : {}), ...(e.spellFilter ? { castFilter: e.spellFilter } : {}), ...(another ? { untilAnother: another } : {}), ...(e.free ? { free: true as const } : {}), ...(e.orPay ? { orPay: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.attackedWithToken ? { attackedWithToken: true as const } : {}) };
        if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
      }
      if (ids.length === 1 && s.resolving) s.resolving.exiledTop = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0 };
      if (s.resolving) (s.resolving.impulsed ??= []).push(...ids);
      if (ids.length)
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of ${from === p.id ? "their" : `${player(s, from).name}'s`} library and may ${e.castOnly ? "cast" : "play"} ${e.spellFilter && e.oneOf ? `${/^[aeiou]/i.test(e.spellFilter.text) ? "an" : "a"} ${e.spellFilter.text.replace(/ card$/, "")} spell from among them` : e.castFilter ? `the ${e.castFilter.text.replace(/ card$/, "")} spells among them` : ids.length === 1 ? "it" : "them"}${e.free ? (e.orPay ? ", with or without paying their mana costs" : " without paying its mana cost") : ""}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : e.until === "yourNextEndStep" ? " until their next end step" : ""}${e.attackedWithToken ? " during any turn they attacked with a token" : ""}.`);
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

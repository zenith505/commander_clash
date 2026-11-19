import type { AbilityBody, Amount, CounterKind, Effect, TargetSpec, TokenSpec } from "../abilities";
import { abilitiesOf, canBeSacrificed, cardIdOf, defOf, isPermanentCard, isType, objHasKeyword, objIsType, power, realDefOf, toughness } from "../cards";
import { nameLandBan } from "../names";
import { cardTypesAmong, castPayText, nearestOpponent, faceDownExileGroup, hiddenInExile, adventureExileCards, graveyardWays, processCandidates, processExiled, payableLife, freeCastable, canPlayLandNow, loseLife, payLife, opponents, tapPermanent, landUntappedOffer, playLandByEffect, attackablePermanentProblem, attackedName, attackedPlaneswalker, attackingPermanentOf, auraHostKey, auraHostLabels, auraHostName, auraHostOf, auraHostOptions, type AuraHost, castProblem, creatureTypesOf, draw, destroyPermanent, damagedNoRegen, landsAllowed, livingPlayers, log, moveObject, enterTogether, nameOf, newObject, obj, pairable, pairCandidates, pairCreatures, player, shareCreatureType, turnOrderFrom } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { countersRemoved, putCounters, withPutter } from "../counters";
import { manaValue } from "../mana";
import { describeAmount } from "../amounts";
import type { GameObject, GameState, LastKnown, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, linkedCards, objectMatches, pickOptions, playerProtectedFrom, printedMatches, spellManaValue } from "./targeting";
import { phaseOut } from "../phasing";
import { ResolveCtx, apnap, startingWith, objects, players, amountNow, amountCtx, amountFor, runEffect } from "./resolve";
import { attackWhomOptions, createToken, takeAttackWhom, tokenCopies, tokenCopyBatch } from "./run-tokens";
import { compileCard } from "../oracle";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { askWholeGraveyardOrder, topGraveyardCards } from "../graveyard";
import { foundWith, newObjects } from "../mutate";
import { attachTo } from "./run-permanents";
import { addDelayed, paidUnless, removeCopy } from "./run-spells";
import { toBottom } from "./run-library";
import { attackDefault, closeZoneBatch, fireEvent, inCombat } from "./triggers";
import { asFace, defMv, hasName, layoutOf, registerFace, sameName, transformedFace } from "../faces";
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
export function returnFromExile(s: GameState, cards: GameObject[], under: (c: GameObject) => PlayerId, src: string, counter?: CounterKind | CounterKind[], tapped0?: boolean | "lands", transformed?: boolean, counterIfCreature?: boolean, loyaltyIfPlaneswalker?: boolean): "paused" | void {
  const counters = counter === undefined || (Array.isArray(counter) && !counter.length) ? undefined : Object.fromEntries((Array.isArray(counter) ? counter : [counter]).map((k) => [k, 1]));
  // Returned transformed: only a double-faced card, with its back face up (CR 712.14a); anything else stays in exile.
  const back = cards.filter((c) => (transformed ? transformedFace(s, c) !== undefined : isPermanentCard(defOf(s, c))));
  const faceOf = (c: GameObject) => (transformed ? transformedFace(s, c) : undefined);
  const hosts = chooseAuraHosts(s, back.map((o) => ({ o, under: under(o), face: faceOf(o) })), src);
  if (hosts === "paused") return "paused";
  enterTogether(s, () => {
    for (const c of back) {
      const d = asFace(s, c, faceOf(c), () => defOf(s, c));
      // Silver Surfer, Cosmic Voyager: "If a land enters this way, it enters tapped": a land as it enters.
      const tapped = tapped0 === true || (tapped0 === "lands" && d.types.includes("Land"));
      const host = hosts.get(c.id);
      if (d.subtypes.includes("Aura") && !host) {
        log(s, `${d.name} has nothing to enchant, so it stays in exile.`);
        continue;
      }
      log(s, `${src} returns ${d.name} to the battlefield${tapped ? " tapped" : ""}${transformed ? " transformed" : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
      moveObject(s, c.id, "battlefield", { controller: under(c), ...(s.resolving ? { putBy: s.resolving.item.controller } : {}), ...host, ...(counters ? { [counterIfCreature ? "countersIfCreature" : "counters"]: counters } : {}), ...(loyaltyIfPlaneswalker ? { countersIfPlaneswalker: { loyalty: 1 } } : {}), ...(tapped ? { tapped: true } : {}), ...(transformed ? { face: transformedFace(s, c) } : {}) });
    }
  });
}

/**
 * Infectious Rage (attachRandom): each Aura's host, a creature chosen at random among those it could enchant as it enters
 * under that player's control (CR 303.4f; not targeted, so shroud and hexproof don't matter, rulings). One with no such
 * creature has none, and stays where it is (CR 303.4g).
 */
function randomAuraHosts(s: GameState, cards: GameObject[], under: (o: GameObject) => PlayerId, src: string): Map<ObjectId, AuraHost> {
  const out = new Map<ObjectId, AuraHost>();
  for (const o of cards) {
    if (!defOf(s, o).subtypes.includes("Aura")) continue;
    const options = auraHostOptions(s, o, under(o)).filter((h) => "attachTo" in h && s.objects[h.attachTo]?.zone === "battlefield" && objIsType(s, obj(s, h.attachTo), "Creature"));
    if (!options.length) continue;
    const host = options[Math.floor(nextRandom(s) * options.length)]!;
    log(s, `${src} chooses ${auraHostName(s, host)} at random.`);
    out.set(o.id, host);
  }
  return out;
}

/**
 * Auras this effect puts onto the battlefield without their being cast (CR 303.4f): the player each one enters under
 * chooses what it enchants, as it enters, among what's on the battlefield before any of them move (Replenish rulings);
 * with nothing legal it stays where it is (303.4g). One Aura at a time, in the order given; no question when only one
 * thing is legal. Returns "paused" while a player chooses, else the host of each Aura that can enter; an Aura missing
 * from it stays put. Cards that aren't Auras are skipped. `onlyTo`: "attached to ~" (Light-Paws), only that permanent, if
 * it could enchant it (null: it's gone, so nothing); `onlyToPlayer`: "attached to target player" (Bitterheart Witch), the
 * same for a player (null: the target is illegal).
 */
export function chooseAuraHosts(s: GameState, cards: { o: GameObject; under: PlayerId; face?: number }[], src: string, onlyTo?: ObjectId | null, onCreature?: boolean, onlyToPlayer?: PlayerId | null, fits?: (host: GameObject) => boolean): "paused" | Map<ObjectId, AuraHost> {
  const sc = (s.resolving!.scratch ??= {});
  const hosts = (sc.auraHosts ??= {});
  for (const { o, under, face } of cards) {
    // A card entering transformed is an Aura, and enchants, as its back face (CR 712.14a, 303.4f).
    const d = asFace(s, o, face, () => defOf(s, o));
    if (!d.subtypes.includes("Aura") || hosts[o.id] !== undefined) continue;
    const options = asFace(s, o, face, () => auraHostOptions(s, o, under)).filter((h) => (onlyTo === undefined || ("attachTo" in h && h.attachTo === onlyTo)) && (onlyToPlayer === undefined || ("attachToPlayer" in h && h.attachToPlayer === onlyToPlayer)) && (!onCreature || ("attachTo" in h && s.objects[h.attachTo]?.zone === "battlefield" && objIsType(s, obj(s, h.attachTo), "Creature"))) && (!fits || ("attachTo" in h && s.objects[h.attachTo]?.zone === "battlefield" && fits(obj(s, h.attachTo)))));
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
 * One Last Job: what each Equipment card entering (not an Aura) is attached to as it enters, a creature `you` control it
 * could be attached to (CR 301.5c-d: not one with protection from it or that can't be equipped, and not while the
 * Equipment would be a creature itself unless it has reconfigure, CR 702.151b), chosen as it resolves (not targeted,
 * rulings); "" with none, so it enters unattached.
 */
function chooseEquipHosts(s: GameState, cards: GameObject[], you: PlayerId, src: string): "paused" | Map<ObjectId, ObjectId | ""> {
  const sc = (s.resolving!.scratch ??= {});
  const chosen = (sc.equipHosts ??= {});
  const ids = new Set(cards.map((o) => o.id));
  for (const o of cards) {
    const d = defOf(s, o);
    if (d.subtypes.includes("Aura") || !d.subtypes.includes("Equipment") || chosen[o.id] !== undefined) continue;
    const compiled = compileCard(d);
    const only = compiled.attachOnly ?? { kind: "object" as const, text: "" };
    const options = isType(d, "Creature") && !compiled.reconfigure ? [] : s.battlefield.filter((id) => !ids.has(id) && controllerOf(s, obj(s, id)) === you && objIsType(s, obj(s, id), "Creature") && !characteristics(s, obj(s, id)).cantBeEquipped && objectMatches(s, only, obj(s, id), you, false, d));
    if (options.length <= 1) {
      chosen[o.id] = options[0] ?? "";
      continue;
    }
    sc.equipAsking = o.id;
    s.pending = { kind: "chooseOption", player: you, source: src, what: "attachHost", options, labels: options.map((id) => defOf(s, obj(s, id)).name), prompt: `choose a creature you control for ${d.name} to enter attached to` };
    return "paused";
  }
  const out = new Map<ObjectId, ObjectId | "">();
  for (const o of cards) if (chosen[o.id] !== undefined) out.set(o.id, chosen[o.id]!);
  return out;
}

/**
 * Each player picks their own permanents, in APNAP order, then they're all sacrificed or returned to
 * their owners' hands at once (CR 101.4, 701.21a). With no more than they have to pick, there's no choice.
 */
/** A pick's options that leave another permanent for the pick after it (`leaving`), or all of them if none does. */
export function pickLeaving(s: GameState, e: Extract<Effect, { type: "pick" }>, options: ObjectId[], pid: PlayerId, ctx: ResolveCtx): ObjectId[] {
  if (!e.leaving) return options;
  const next = pickOptions(s, { filter: e.leaving }, pid, ctx.sourceId, ctx.sourceZc);
  const ok = options.filter((id) => next.some((x) => x !== id));
  return ok.length ? ok : options;
}

function pickPermanents(s: GameState, e: Extract<Effect, { type: "pick" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  // Rite of Ruin: "of the first type", the order chosen as it resolves.
  if (e.filter.chosen === "typeOrder") e = { ...e, filter: bindChosen(e.filter, r.chosen) };
  // Martyr's Bond: the card types of the trigger's subject, on the battlefield or as it last existed (CR 608.2h).
  if (e.filter.sharesTypeWithSubject) {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    const lk = ctx.subject ? s.lastKnown?.[ctx.subject.id] : undefined;
    // Gone from the battlefield, the subject is the card in its new zone, one zone change on from what last existed.
    const here = o?.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc;
    const types = here ? characteristics(s, o!).types : lk && (lk.zc === ctx.subject!.zc || lk.zc === ctx.subject!.zc - 1) ? (lk.source?.types ?? []) : [];
    e = { ...e, filter: { ...e.filter, sharesTypeWithSubject: undefined, types: types.length ? [...types] : ["(none)"] } };
  }
  // Fatal Grudge: the card types of the permanent its cost sacrificed, as it last existed (CR 608.2h).
  if (e.filter.sharesTypeWithSacrificed) {
    const types = (ctx.sacrificed?.[0] ?? r.sacrificedThisWay?.at(-1))?.types ?? [];
    e = { ...e, filter: { ...e.filter, sharesTypeWithSacrificed: undefined, types: types.length ? [...types] : ["(none)"] } };
  }
  // Saw: "a permanent other than that creature or ~": not the trigger's subject while it's still that object (CR 400.7).
  if (e.filter.notSubject) {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    const here = o?.zone === "battlefield" && (o.zoneChanges ?? 0) === ctx.subject!.zc;
    const { notSubject: _, ...rest } = e.filter;
    e = { ...e, filter: { ...rest, ...(here ? { notId: o!.id } : {}) } };
  }
  // Yannik, Scavenging Sentinel: "until ~ leaves the battlefield" with ~ already gone exiles nothing (CR 610.3c, rulings).
  const untilMe = e.untilSourceLeaves ? objects(s, { ref: "self" }, ctx)[0] : undefined;
  if (e.untilSourceLeaves && untilMe?.zone !== "battlefield") {
    log(s, `${src} has left the battlefield, so nothing is exiled.`);
    return;
  }
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
    // "Starting with you, each player chooses" (Grenzo's Rebuttal): in turn order from you (CR 101.4).
    const order = apnap(s, who);
    const at = e.fromYou ? order.indexOf(ctx.controller) : -1;
    sc.queue = at > 0 ? [...order.slice(at), ...order.slice(0, at)] : order;
    sc.chosen = {};
    r.couldntPick = [];
  }
  // Among another player's permanents (Split the Party): the first of them, if they're still in the game.
  const among = e.among ? players(s, e.among, ctx)[0] : undefined;
  // Tariff: the player who has just picked pays that creature's mana cost or doesn't, before the next one picks (rulings).
  const payForPick = (): "paused" | void => {
    if (!e.unlessManaCost) return;
    const done = (sc.tariffDone ??= []);
    for (const pid of apnap(s, who)) {
      if (done.includes(pid) || sc.chosen?.[pid] === undefined) continue;
      const o = sc.chosen[pid]![0] !== undefined ? s.objects[sc.chosen[pid]![0]!] : undefined;
      // A face-down creature or a token with no mana cost: an unpayable cost (CR 118.6, 708.2).
      const cost = o?.zone === "battlefield" && !o.faceDown ? defOf(s, o).manaCost.replace(/\{X\}/g, "") : "";
      const name = o ? defOf(s, o).name : "";
      const paid = o?.zone === "battlefield" && defOf(s, o).manaCost && !o.faceDown ? paidUnless(s, ctx, pid, { cost: cost || "{0}" }, src, name, `you sacrifice ${name}`) : false;
      if (paid === "paused") return "paused";
      if (paid) sc.chosen[pid] = [];
      sc.paid = undefined;
      done.push(pid);
    }
  };
  while (sc.queue.length) {
    if (payForPick() === "paused") return "paused";
    const pid = sc.queue[0]!;
    const n = nFor[pid] ?? 0;
    // "One of those Dragons" (Zurgo and Ojutai): those still on the battlefield as the objects they were, whoever controls them now.
    const group = e.fromGroup ? (ctx.event?.group ?? []).filter((g) => s.objects[g.id]?.zone === "battlefield" && (obj(s, g.id).zoneChanges ?? 0) === g.zc).map((g) => g.id) : undefined;
    // Orvar, the All-Form: "one of those permanents": the cast spell's targets, from the stack or, once it has left, as it
    // was cast (rulings), each still that object on the battlefield, matching, and not ~ ("other permanents", CR 603.4).
    const causeItem = e.fromCauseTargets && ctx.cause !== undefined ? (s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause]) : undefined;
    const ofCause = e.fromCauseTargets ? [...new Set((causeItem?.targets ?? []).flatMap((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && (t.zc === undefined || (obj(s, t.id).zoneChanges ?? 0) === t.zc) && t.id !== ctx.sourceId && objectMatches(s, e.filter, obj(s, t.id), pid, false) ? [t.id] : [])))] : undefined;
    // "On either of them" (Call of the Death-Dweller): the permanents the targets became, still on the battlefield.
    const ofTargets = e.fromTargets ? objects(s, { ref: "target", index: e.fromTargets.index, n: e.fromTargets.n }, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id) : undefined;
    // Suppression Ray: "creatures tapped this way", the ones that became tapped (rulings), still those objects.
    const tappedHere = e.fromTapped ? (r.tappedIds ?? []).filter((c) => s.objects[c.id]?.zone === "battlefield" && (obj(s, c.id).zoneChanges ?? 0) === c.zc && objectMatches(s, e.filter, obj(s, c.id), pid, false)).map((c) => c.id) : undefined;
    // Tetravus: the tokens it created, still on the battlefield (rulings: not another Tetravus's).
    const createdHere = e.createdWithSelf ? objects(s, { ref: "tokensCreatedWithSelf" }, ctx).filter((o) => objectMatches(s, e.filter, o, pid, false)).map((o) => o.id) : undefined;
    // Grenzo's Rebuttal: among the permanents of the player to this one's left (the next in turn order, CR 101.4).
    const left = e.amongLeft ? nearestOpponent(s, pid, "left") : undefined;
    // The Legend of Yangchen: among the permanents this ability's controller's opponents control, whoever picks.
    const options0 = e.amongYourOpponents ? s.battlefield.filter((id) => controllerOf(s, obj(s, id)) !== ctx.controller && objectMatches(s, e.filter, obj(s, id), ctx.controller, false)) : e.amongLeft ? (left === undefined ? [] : pickOptions(s, e, left, ctx.sourceId, ctx.sourceZc)) : tappedHere ?? createdHere ?? ofCause ?? ofTargets ?? group ?? (e.among ? (among === undefined ? [] : pickOptions(s, e, among, ctx.sourceId, ctx.sourceZc)) : pickOptions(s, e, pid, ctx.sourceId, ctx.sourceZc));
    // Labyrinth Raptor: only creatures blocking the trigger's subject now, the same attacking object (CR 400.7, 509.1h).
    const attacker = e.filter.blockingSubject && ctx.subject ? s.objects[ctx.subject.id] : undefined;
    const options1 = !e.filter.blockingSubject ? options0 : attacker && attacker.zone === "battlefield" && (attacker.zoneChanges ?? 0) === ctx.subject!.zc && attacker.attacking !== undefined ? options0.filter((id) => !!attacker.blockedBy?.includes(id) && obj(s, id).blocking?.includes(attacker.id)) : [];
    // Fugitive of the Judoon: "exile a Human you control and an artifact you control": the Human picked first leaves an
    // artifact to pick next, when one can (an artifact Human can't be both).
    const options2 = e.leaving ? pickLeaving(s, e, options1, pid, ctx) : options1;
    // Feast of Worms: "another land": not the target, if it survived (an indestructible one).
    const other = e.otherThanTarget !== undefined ? objects(s, { ref: "target", index: e.otherThanTarget }, ctx).map((o) => o.id) : [];
    // Burning of Xinye: "you destroy four lands you control": not one with indestructible (rulings, CR 702.12b).
    const options3 = (other.length ? options2.filter((id) => !other.includes(id)) : options2).filter((id) => !(e.destroyable && !e.least && objHasKeyword(s, obj(s, id), "indestructible")));
    // Kamiz, Obscura Oculus: "with lesser power" than the target, as it is now (after it connived).
    const than = e.lesserPowerThanTarget !== undefined ? objects(s, { ref: "target", index: e.lesserPowerThanTarget }, ctx).find((o) => o.zone === "battlefield") : undefined;
    const options4 = e.lesserPowerThanTarget === undefined ? options3 : than ? options3.filter((id) => power(s, obj(s, id)) < power(s, than)) : [];
    // Light of Judgment: only what's attached to that target as it resolves.
    const host = e.attachedToTargetAt !== undefined ? objects(s, { ref: "target", index: e.attachedToTargetAt }, ctx).find((o) => o.zone === "battlefield") : undefined;
    const options5 = e.attachedToTargetAt === undefined ? options4 : host ? options4.filter((id) => obj(s, id).attachedTo === host.id) : [];
    // Spirit-Sister's Call (round B220): sharing a card type with the target card as it is now (CR 205.2a), wherever it is.
    const kin = e.sharesCardTypeWithTarget !== undefined ? objects(s, { ref: "target", index: e.sharesCardTypeWithTarget }, ctx)[0] : undefined;
    const kinTypes = kin ? characteristics(s, kin).types : [];
    const options6 = e.sharesCardTypeWithTarget === undefined ? options5 : options5.filter((id) => characteristics(s, obj(s, id)).types.some((ty) => kinTypes.includes(ty)));
    // Frantic Scapegoat (round B241): only one that can become suspected (CR 701.60d, Airtight Alibi).
    const options = e.suspectable ? options6.filter((id) => obj(s, id).suspected === undefined && !characteristics(s, obj(s, id)).cantBeSuspected) : options6;
    // "Sacrifice any number of other creatures": as many as they like, asked even with only one.
    if (e.anyNumber) {
      if (!options.length) {
        sc.chosen![pid] = [];
        sc.queue.shift();
        continue;
      }
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.filter.text, options, count: options.length, min: 0, anyNumber: true, ...(e.prompt ? { prompt: e.prompt.replace(/~/g, src) } : {}), ...(e.differentNames ? { differentNames: true as const } : {}), ...(e.differentPowers ? { differentPowers: true as const } : {}), ...(e.minTotalPower !== undefined ? { minTotalPower: e.minTotalPower } : {}), ...(e.payEach ? { payEach: e.payEach } : {}) };
      return "paused";
    }
    if (!n || (e.upTo && !options.length)) {
      sc.chosen![pid] = [];
      sc.queue.shift();
      continue;
    }
    // "Put a +1/+1 counter on each of up to two Soldiers you control": as many as they like, up to that many.
    if (e.upTo) {
      // Krenko's Buzzcrusher: you pick among each player's permanents in turn.
      const picker = e.youChoose ? ctx.controller : pid;
      // "{player}": whose permanents these are.
      const prompt = e.prompt?.replace(/~/g, src).replace("{player}", picker === pid ? "yours" : `${player(s, pid).name}'s`);
      s.pending = { kind: "pickPermanents", player: picker, source: src, action: e.action, what: e.filter.text, options, count: Math.min(n, options.length), min: 0, ...(e.counter ? { counter: e.counter.kind } : {}), ...(prompt ? { prompt } : {}), ...(picker !== pid ? { of: pid, pickFor: pid } : {}) };
      return "paused";
    }
    // "Each player who can't discards a card" (Plaguecrafter): who had none.
    if (!options.length) (r.couldntPick ??= []).push(pid);
    if (options.length > n) {
      // Imperial Edict ("Target opponent chooses a creature they control. Destroy that creature."): the question says what
      // happens to the one chosen.
      const after = e.action === "choose" && s.resolving ? s.resolving.body.effects[s.resolving.next + 1] : undefined;
      // Drop of Honey, Purging Scythe: one of those tied for the least power or toughness, anyone's.
      const tied = e.anyController && e.least ? `click a creature tied for the least ${e.least} (anyone's). ${src} ${after?.type === "destroy" ? "destroys it" : after?.type === "damage" ? `deals ${describeAmount(after.amount)} damage to it` : "chooses it"}.` : undefined;
      const lose = after?.type === "continuous" && after.what.ref === "created" && after.mods.some((m) => m.kind === "control") && after.duration === "game";
      // The Horus Heresy: anyone's creature, in the ability's own words.
      const fate = tied ?? ((e.anyController || e.amongLeft) && e.prompt ? undefined : (after?.type === "destroy" || after?.type === "exile") && after.what.ref === "created" ? `click ${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} you control. ${src} ${after.type === "destroy" ? "destroys" : "exiles"} it.` : lose ? `click ${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text} you control. ${player(s, ctx.controller).name} gains control of it.` : undefined);
      // Chaos Defiler: you pick among each opponent's permanents in turn ("{player}": whose these are).
      const picker = e.youChoose ? ctx.controller : pid;
      // The ability's own words otherwise (Sunder the Gateway: "click an Incubator token you control to transform it").
      const own = e.prompt?.replace(/~/g, src).replace("{player}", picker === pid ? "yours" : `${player(s, pid).name}'s`).replace("{left}", left === undefined ? "" : player(s, left).name);
      s.pending = { kind: "pickPermanents", player: picker, source: src, action: e.action, ...(fate && picker === pid ? { prompt: fate } : own ? { prompt: own } : {}), what: e.least ? `${e.filter.text} with the least ${e.least}` : e.greatest ? `${e.filter.text} with the greatest ${e.greatest === "power" ? "power" : "mana value"}` : e.filter.text, options, count: n, ...(e.counter ? { counter: e.counter.kind } : {}), ...(among !== undefined && among !== pid ? { of: among } : {}), ...(picker !== pid ? { of: pid, pickFor: pid } : {}), ...(e.differentPowers ? { differentPowers: true as const } : {}) };
      return "paused";
    }
    sc.chosen![pid] = options;
    sc.queue.shift();
  }
  if (payForPick() === "paused") return "paused";
  // "Put a +1/+1 counter on a creature you control. It gains ...": "it" is the one picked, while it's that object (CR 400.7).
  if ((e.action === "counters" || e.action === "choose" || e.action === "flicker") && s.resolving) {
    const picked = apnap(s, who).flatMap((pid) => sc.chosen?.[pid] ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
    // Grenzo's Rebuttal: "each permanent chosen this way" by its three picks, each once (an artifact creature can be
    // chosen as both, rulings).
    s.resolving.created = e.addChosen && e.action === "choose" ? [...new Set([...(s.resolving.created ?? []), ...picked])] : picked;
  }
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
        tapPermanent(s, o, undefined, pid);
        log(s, `${player(s, pid).name} taps ${defOf(s, o).name}.`);
        continue;
      }
      if (e.action === "populate") {
        // Ghired: "The token enters tapped and attacking": its controller chooses what each one attacks as it's created
        // (CR 508.4, rulings), not declared as an attacker (CR 506.3d).
        let attackAt: ReturnType<typeof attackChoices> | undefined;
        if (e.attacking) {
          const choices = attackChoices(s, pid, ctx.sourceId);
          if (choices.length > 1) {
            const k = tokenCopyBatch(s, pid, defOf(s, o));
            const picks = [...(sc.attackPicks ?? [])];
            if (sc.attackWhom !== undefined) takeAttackWhom(sc, picks, k);
            sc.attackPicks = picks;
            if (picks.length < k) {
              const which = k > 1 ? ` (${picks.length + 1} of ${k})` : "";
              s.pending = { kind: "chooseOption", player: pid, source: src, what: "attackWhom", ...attackWhomOptions(choices, k - picks.length), prompt: `choose what the copy of ${defOf(s, o).name} attacks${which}` };
              return "paused";
            }
            sc.attackPicks = undefined;
            attackAt = picks.flatMap((key) => choices.filter((a) => a.key === key));
          }
        }
        if (s.resolving) s.resolving.created ??= [];
        tokenCopies(s, pid, defOf(s, o), 1, ctx, e.attacking ? { attacking: true, ...(attackAt ? { attackAt } : {}) } : {});
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
      // Nulltread Gargantuan: on top of its owner's library.
      if (e.action === "libraryTop") {
        log(s, `${player(s, pid).name} puts ${defOf(s, o).name} on top of its owner's library.`);
        moveObject(s, id, "library", { top: true });
        continue;
      }
      if (e.action === "exile") {
        log(s, `${player(s, pid).name} exiles ${defOf(s, o).name}.`);
        // As it last existed, for "the power of the creature they exiled" (Olórin's Searing Light, CR 608.2h).
        const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)), controller: controllerOf(s, o) };
        moveObject(s, id, "exile");
        if (s.objects[id]?.zone === "exile" && s.resolving) (s.resolving.exiled ??= []).push(before);
        if (untilMe && s.objects[id]?.zone === "exile" && !s.objects[id]!.isToken) (untilMe.exiledUntilLeaves ??= []).push({ id, zc: s.objects[id]!.zoneChanges ?? 0 });
        // The Master, Formed Anew: the counter goes on the card in exile (CR 122.1), not a token, which is gone (CR 111.7).
        const exiledCard = s.objects[id];
        if (e.exiledCounter && exiledCard?.zone === "exile" && !exiledCard.isToken) {
          exiledCard.counters[e.exiledCounter] = (exiledCard.counters[e.exiledCounter] ?? 0) + 1;
          log(s, `${player(s, pid).name} puts a ${e.exiledCounter} counter on ${defOf(s, exiledCard).name} in exile.`);
        }
        // Azula, Cunning Usurper: "exiled with ~" (CR 607.2a), as the card it is in exile.
        if (e.linked && ctx.sourceId && s.objects[id]?.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: s.objects[id]!.zoneChanges ?? 0 });
        continue;
      }
      log(s, e.action === "sacrifice" ? `${player(s, pid).name} sacrifices ${defOf(s, o).name}.` : `${player(s, pid).name} returns ${defOf(s, o).name} to its owner's hand.`);
      // As it last existed, for a reflexive trigger: "When you do, ~ deals damage equal to that creature's power" (CR 608.2h).
      if (e.action === "sacrifice" && s.resolving) {
        const ch = characteristics(s, o);
        (s.resolving.sacrificedThisWay ??= []).push({ id, power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), controller: pid, types: [...ch.types], subtypes: [...ch.subtypes], colors: [...ch.colors], ...(ch.allCreatureTypes && ch.types.includes("Creature") ? { allCreatureTypes: true as const } : {}), ...(ch.supertypes.includes("Legendary") ? { legendary: true as const } : {}), ...(ch.supertypes.includes("Snow") ? { snow: true as const } : {}), ...(o.isCommander ? { commander: true as const } : {}) });
      }
      const bounced = e.action === "bounce" && s.resolving ? { id, subtypes: [...characteristics(s, o).subtypes], power: characteristics(s, o).power } : undefined;
      if (bounced) (s.resolving!.bouncedThisWay ??= []).push(bounced);
      moveObject(s, id, e.action === "sacrifice" ? "graveyard" : "hand", e.action === "sacrifice" ? { sacrificed: true } : {});
      if (bounced && s.objects[id]?.zone === "hand") (bounced as { returned?: true }).returned = true;
      // Heart-Shaped Herb's "return that card": the card it became in the graveyard (CR 400.7), if it went there.
      if (e.action === "sacrifice" && s.resolving && s.objects[id]?.zone === "graveyard") {
        const last = s.resolving.sacrificedThisWay?.at(-1);
        if (last?.id === id) last.cardZc = s.objects[id]!.zoneChanges ?? 0;
      }
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
  // Rejoin the Fight: from your graveyard, starting with the next opponent in turn order (not APNAP).
  const order = e.fromYours ? turnOrderFrom(s, ctx.controller).filter((pid) => players(s, e.who!, ctx).includes(pid)) : apnap(s, players(s, e.who!, ctx));
  const yp = (sc.yardPicks ??= { queue: order, picked: {} });
  const yardOf = (pid: PlayerId) => (e.fromYours ? player(s, ctx.controller) : player(s, pid));
  while (yp.queue.length) {
    const pid = yp.queue[0]!;
    const p = player(s, pid);
    if (sc.found) {
      yp.picked[pid] = sc.found.filter((id) => yardOf(pid).graveyard.includes(id));
      sc.found = undefined;
      yp.queue.shift();
      continue;
    }
    const taken = new Set(Object.values(yp.picked).flat());
    // Ill-Gotten Gains: into their hands, any cards; onto the battlefield, only permanent cards (CR 110.4b).
    // The Three Seasons: any cards, shuffled into their libraries.
    const toHand = e.dest === undefined || e.dest === "exile" || e.dest === "keep" || e.dest === "shuffleIn";
    // Grave Sifter: "of that type", the type this player chose (none chosen: none fit).
    const own = e.filter?.chosen === "pickerType" ? s.resolving!.chosen?.typesBy?.[pid] : undefined;
    const filter = e.filter?.chosen === "pickerType" ? (own ? (({ chosen: _, ...f }) => ({ ...f, subtypes: [...(f.subtypes ?? []), own] }))(e.filter) : undefined) : e.filter;
    const cards = p.lost || (e.filter?.chosen === "pickerType" && !filter) ? [] : yardOf(pid).graveyard.filter((id) => !taken.has(id) && (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (toHand || isPermanentCard(defOf(s, obj(s, id)))));
    const max = Math.min(e.n, cards.length);
    // Nothing to choose between: those are the ones (none at all, for a "may" with nothing there).
    if ((!e.upTo && cards.length <= e.n) || !cards.length) {
      yp.picked[pid] = cards;
      yp.queue.shift();
      continue;
    }
    const kind = own ? `${own} card` : e.filter?.text ?? "card";
    const whose = e.youChoose ? ` in ${pid === ctx.controller ? "your" : `${p.name}'s`} graveyard` : e.fromYours ? ` in ${player(s, ctx.controller).name}'s graveyard` : "";
    // Dredge the Mire: they choose for you, so the card that helps you least (bots), as Visions of Dread.
    const forYou = e.underYours && pid !== ctx.controller ? { forPlayer: ctx.controller, helps: true as const, under: ctx.controller } : {};
    const what = e.n >= 999 ? `any number of ${kind.replace(/\bcard\b/, "cards")}` : e.n > 1 ? `${e.upTo ? "up to " : ""}${e.n} ${kind.replace(/\bcard\b/, "cards")}` : `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`;
    s.pending = { kind: "searchLibrary", player: e.youChoose ? ctx.controller : pid, source: src, what: `${what}${whose}`, ...forYou, cards, min: e.upTo ? 0 : max, max, fromGraveyard: e.dest === "exile" || e.dest === "keep" || e.dest === "shuffleIn" ? e.dest : toHand ? "hand" : "battlefield" };
    return "paused";
  }
  sc.yardPicks = undefined;
  // Each under its owner's control, or all under yours when you chose them (Breach the Multiverse, CR 110.2a).
  const moves = Object.entries(yp.picked).flatMap(([pid, ids]) => ids.filter((id) => s.objects[id]?.zone === "graveyard").map((id) => ({ id, pid: Number(pid) as PlayerId })));
  // Ill-Gotten Gains: each into its owner's hand, all at the same time.
  if (e.dest === undefined) {
    for (const { id, pid } of moves) log(s, `${player(s, pid).name} returns ${defOf(s, obj(s, id)).name} from their graveyard to their hand.`);
    for (const { id } of moves) moveObject(s, id, "hand");
    return;
  }
  // Watchers of the Dead: everything but the chosen cards, from every one of those graveyards, all at the same time.
  if (e.dest === "keep") {
    const rest = Object.entries(yp.picked).flatMap(([pid, ids]) => player(s, Number(pid) as PlayerId).graveyard.filter((id) => !ids.includes(id)).map((id) => ({ id, pid: Number(pid) as PlayerId })));
    for (const pid of Object.keys(yp.picked).map((x) => Number(x) as PlayerId)) {
      const gone = rest.filter((r) => r.pid === pid);
      if (gone.length) log(s, `${player(s, pid).name} exiles ${gone.length === 1 ? defOf(s, obj(s, gone[0]!.id)).name : `${gone.length} cards`} from their graveyard.`);
    }
    for (const { id } of rest) moveObject(s, id, "exile");
    return;
  }
  // Augusta, Order Returned: each exiles the card they chose, all at the same time; "this way" is those cards.
  if (e.dest === "exile") {
    for (const { id, pid } of moves) log(s, `${player(s, pid).name} exiles ${defOf(s, obj(s, id)).name} from their graveyard.`);
    for (const { id } of moves) moveObject(s, id, "exile");
    s.resolving!.yardChosen = moves.map((m) => m.id).filter((id) => obj(s, id).zone === "exile");
    // Summon: Esper Valigarmanda, King Narfi's Betrayal: "exiled with ~" for its later chapters (CR 607.2a).
    if (e.linked && ctx.sourceId) for (const id of s.resolving!.yardChosen) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
    return;
  }
  // The Three Seasons: "Their owners shuffle those cards into their libraries": all moved at once, then each owner who got
  // one shuffles (a player with none chosen doesn't shuffle, rulings).
  if (e.dest === "shuffleIn") {
    const owners = [...new Set(moves.map((m) => obj(s, m.id).owner))];
    for (const q of owners) {
      const mine = moves.filter((m) => obj(s, m.id).owner === q);
      log(s, `${player(s, q).name} shuffles ${mine.map((m) => defOf(s, obj(s, m.id)).name).join(", ")} from their graveyard into their library.`);
    }
    for (const { id } of moves) moveObject(s, id, "library");
    for (const q of apnap(s, owners)) if (!player(s, q).lost) shuffleLibrary(s, player(s, q));
    return;
  }
  const under = (pid: PlayerId) => (e.youChoose || e.underYours ? ctx.controller : pid);
  for (const { id, pid } of moves) log(s, e.youChoose || e.underYours ? `${player(s, ctx.controller).name} puts ${defOf(s, obj(s, id)).name} from ${pid === ctx.controller || e.fromYours ? "their" : `${player(s, pid).name}'s`} graveyard onto the battlefield.` : `${player(s, pid).name} returns ${defOf(s, obj(s, id)).name} from their graveyard to the battlefield.`);
  // Ghouls' Night Out: "They're black Zombies ... and they gain decayed", each as it enters (CR 614.12) and for good.
  enterTogether(s, () => moves.forEach(({ id, pid }) => moveObject(s, id, "battlefield", { controller: under(pid), ...(e.tapped ? { tapped: true } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: ctx.controller, source: src } } : {}) })));
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
      s.pending = { kind: "searchLibrary", player: pid, source: src, what: e.manifest === 1 ? "a card" : `${e.manifest} cards`, cards, min: e.manifest, max: e.manifest, fromHand: true, manifest: true, ...(e.cloak ? { cloak: true as const } : {}) };
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
        log(s, `${player(s, Number(pid) as PlayerId).name} ${e.cloak ? "cloaks" : "manifests"} ${mine.length === 1 ? "a card" : `${mine.length} cards`} from their hand: ${mine.length === 1 ? "a" : "each a"} face-down 2/2 creature${e.cloak ? " with ward {2}" : ""}.`);
        for (const id of mine) {
          moveObject(s, id, "battlefield", { controller: Number(pid) as PlayerId, faceDown: e.cloak ? "cloak" : "manifest" });
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
  // Disciple of Caelus Nin: "starting with you", in turn order from this ability's controller (CR 101.4 is for APNAP).
  const who = e.startingWithYou ? startingWith(s, ctx.controller, players(s, e.who, ctx)) : apnap(s, players(s, e.who, ctx));
  const kr = (sc.keepRest ??= { queue: [...who], slot: 0, kept: {} });
  // "Other than ~": the source, while it's still that object (CR 400.7), is neither kept nor among the rest.
  const me = e.notSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const self = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? me.id : undefined;
  const among = (pid: PlayerId) => s.battlefield.filter((id) => id !== self && controllerOf(s, obj(s, id)) === pid && objectMatches(s, { ...e.among, controller: "you" }, obj(s, id), pid, false));
  // "Equal to the number of lands controlled by the player who controls the fewest": counted once, before anyone
  // chooses (Restore Balance rulings).
  if (e.keep.some((k) => k.fewest)) kr.fewest ??= Math.min(...who.map((pid) => among(pid).length));
  // Killing Wave: the life for each one kept, as it starts.
  if (e.payLife !== undefined) kr.lifeEach ??= Math.max(0, amountNow(s, e.payLife, ctx));
  const lifeEach = kr.lifeEach ?? 0;
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
      // "Unless they pay X life": as many as they can pay for, any number with X 0 (CR 119.4).
      // Choice of Damnations: "all but that many", the number chosen as it resolves.
      const k = k0.nChosen ? { ...k0, n: Math.max(0, s.resolving?.chosen?.number ?? 0) } : k0.fewest ? { ...k0, n: kr.fewest ?? 0 } : k0.maxTotalPower !== undefined ? { ...k0, n: options0.length } : e.payLife !== undefined ? { ...k0, n: lifeEach > 0 ? Math.floor(payableLife(s, pid) / lifeEach) : options0.length } : k0;
      // Stick Together: a creature already in the party fills no second slot (CR 700.8b).
      const options = k.notKept ? options0.filter((id) => !kept.includes(id)) : options0;
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
      // Planar Overlay: the ones chosen are returned, so the question is which one goes.
      if (e.bounceChosen) {
        s.pending = { kind: "pickPermanents", player: chooser, source: src, action: "bounce", what: k.filter.text, options, count: max, prompt: `click ${/^[AEIOU]/.test(k.filter.text) ? "an" : "a"} ${k.filter.text} of yours to return to its owner's hand.` };
        return "paused";
      }
      // Stick Together: which slot of the party this is.
      const party = k.notKept ? { prompt: `choose your party: click up to one ${k.filter.text} of yours${kr.slot < e.keep.length - 1 ? ` (then ${e.keep.slice(kr.slot + 1).map((x) => `a ${x.filter.text}`).join(", ")})` : ""}. Creatures not in your party are sacrificed.` } : {};
      // Disciple of Caelus Nin: the rest phase out.
      const phase = e.phaseOut ? { prompt: `${max === 1 ? "click up to one" : `click up to ${max}`} ${k.filter.text}${max === 1 ? "" : "s"} of yours to keep. The rest of yours ${self && controllerOf(s, obj(s, self)) === pid ? `(other than ${nameOf(s, self)}) ` : ""}phase out, and while ${src} is on the battlefield, permanents can't phase in.` } : {};
      s.pending = { kind: "pickPermanents", player: chooser, source: src, action: "keep", what: k.filter.text, options, count: max, ...party, ...phase, ...(k.upTo ? { min: 0 } : {}), ...(e.destroy ? { destroy: true as const } : {}), ...(e.bounce ? { bounce: true as const } : {}), ...(e.tap ? { tap: true as const } : {}), ...(chooser !== pid ? { of: pid } : {}), ...(k.maxTotalPower !== undefined ? { maxTotalPower: k.maxTotalPower } : {}), ...(e.payLife !== undefined ? { payLife: lifeEach } : {}), ...(e.sparesTypeOfKept ? { sparesKin: true as const } : {}) };
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
    } else if (kept.size && !e.bounceChosen) log(s, `${player(s, pid).name} keeps ${[...kept].map((id) => nameOf(s, id)).join(", ")}${e.payLife !== undefined ? ` and pays ${lifeEach * kept.size} life` : ""}.`);
    // Killing Wave: the life is paid as the creatures are sacrificed, all at once (rulings).
    if (e.payLife !== undefined && kept.size && lifeEach > 0) payLife(s, pid, lifeEach * kept.size);
    keptAll.push(...kept);
    // Winnowing: only those sharing no creature type with the kept one (CR 702.73a: a changeling shares them all).
    const keptTypes = e.sparesTypeOfKept ? [...kept].filter((id) => s.objects[id]?.zone === "battlefield").map((id) => creatureTypesOf(s, obj(s, id))) : [];
    gone.push(...among(pid).filter((id) => !kept.has(id) && !(e.sparesTypeOfKept && keptTypes.some((t) => shareCreatureType(t, creatureTypesOf(s, obj(s, id)))))));
  }
  // Planar Overlay: the chosen lands return at the same time (one chosen for several types returns once).
  if (e.bounceChosen) {
    const back = [...new Set(keptAll)].filter((id) => s.objects[id]?.zone === "battlefield");
    if (back.length) log(s, `${src} returns ${back.map((id) => nameOf(s, id)).join(", ")} to ${back.length === 1 ? "its owner's hand" : "their owners' hands"}.`);
    for (const id of back) moveObject(s, id, "hand");
    return;
  }
  if (e.counter && s.resolving) s.resolving.created = keptAll.filter((id) => s.objects[id]?.zone === "battlefield");
  // Disciple of Caelus Nin: every player's rest phase out at once (CR 702.26b), with what's attached to them, chosen or not
  // (indirectly, 702.26g).
  if (e.phaseOut) {
    phaseOut(s, gone.filter((id) => s.objects[id]?.zone === "battlefield"));
    return;
  }
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
  // Regna's Sanction: the rest are tapped at the same time, each by the player who chose (rulings).
  if (e.tap) {
    const tap = gone.filter((id) => s.objects[id]?.zone === "battlefield" && !obj(s, id).tapped);
    if (tap.length) log(s, `${src} taps ${tap.map((id) => nameOf(s, id)).join(", ")}.`);
    for (const id of tap) tapPermanent(s, obj(s, id), undefined, controllerOf(s, obj(s, id)));
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
  moveObject(s, victim.id, "graveyard", { sacrificed: true, ...(exploiter ? { exploitedBy: { id: exploiter.id, zc: exploiter.zoneChanges ?? 0 } } : {}) });
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
    const was = characteristics(s, pick);
    const wasTypes = { subtypes: [...was.subtypes], allTypes: !!was.allCreatureTypes };
    moveObject(s, pick.id, "exile");
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (me) me.championed = { id: pick.id, zc: pick.zoneChanges ?? 0, by: ctx.sourceZc ?? 0 };
    // "When a Faerie is championed with ~" (Mistbind Clique): it's championed even if ~ has left (CR 702.72c), but then
    // ~ isn't there to trigger.
    if (me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc)) fireEvent(s, { type: "championed", id: me.id, card: pick.id, ...wasTypes });
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
  // "Four cards named ~ from your graveyard" (Dragon's Approach): the source's name (CR 201.5).
  if (e.type === "chooseFromGraveyard" && e.filter?.named === "~") e = { ...e, filter: { ...e.filter, named: ctx.sourceDef.name, text: e.filter.text.replace(/~/g, ctx.sourceDef.name) } };
  switch (e.type) {
    case "sunburstChoose": {
      // Sculpted Sunburst: you choose first, then each opponent in turn order, one with power no greater than the power of
      // yours as they choose (rulings: chosen as it resolves, nothing targeted). Then, if you chose one, every creature no
      // player chose is exiled, all at once.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const creature: TargetSpec = { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
      if (!sc.queue) {
        const from = s.turnOrder.indexOf(ctx.controller);
        sc.queue = [...s.turnOrder.slice(from), ...s.turnOrder.slice(0, from)].filter((pid) => !player(s, pid).lost);
        sc.chosen = {};
      }
      const chosen = sc.chosen!;
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        const mine = chosen[ctx.controller]?.[0];
        const yours = mine && s.objects[mine]?.zone === "battlefield" ? s.objects[mine] : undefined;
        if (player(s, pid).lost || (pid !== ctx.controller && !yours)) {
          sc.queue.shift();
          continue;
        }
        const options = s.battlefield.filter((id) => objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === pid && (!yours || power(s, obj(s, id)) <= power(s, yours)));
        if (!options.length) {
          chosen[pid] = [];
          sc.queue.shift();
          continue;
        }
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "choose", what: "creature", options, count: 1, prompt: pid === ctx.controller ? "choose a creature you control" : `choose a creature you control with power ${yours ? power(s, yours) : 0} or less` };
        return "paused";
      }
      const kept = Object.values(chosen).flat();
      if (!sc.done) {
        sc.done = true;
        const names = apnap(s, Object.keys(chosen).map(Number) as PlayerId[]).filter((pid) => chosen[pid]?.length).map((pid) => `${player(s, pid).name}: ${characteristics(s, obj(s, chosen[pid]![0]!)).name}`);
        log(s, names.length ? `Chosen (${src}): ${names.join("; ")}.` : `No creature is chosen (${src}).`);
      }
      if (!chosen[ctx.controller]?.length) return;
      r.created = kept;
      return runEffect(s, { type: "exile", what: { ref: "each", filter: creature, notCreated: true } }, ctx);
    }
    case "suspendCard":
      for (const o of objects(s, e.what, ctx)) if (!o.isToken) suspendExiled(s, o, e.n);
      return;
    case "suspendImpulsed":
      for (const id of s.resolving?.impulsed ?? []) {
        const o = s.objects[id];
        if (o?.zone === "exile" && hasSuspend(s, o)) suspendExiled(s, o, e.n);
      }
      return;
    case "secretChoose": {
      // Malik, Grim Manipulator: you choose first, then that player; neither choice is logged until both are made.
      const them = players(s, e.who, ctx)[0];
      if (them === undefined || player(s, them).lost) return;
      const sc = (s.resolving!.scratch ??= {});
      const options = () => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === them && objectMatches(s, e.filter, obj(s, id), them, false));
      if (!sc.queue) {
        sc.queue = [ctx.controller, them];
        sc.chosen = {};
      }
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        const opts = options();
        if (opts.length <= 1) {
          sc.chosen![pid] = opts;
          sc.queue.shift();
          continue;
        }
        const a = /^[aeiou]/i.test(e.filter.text) ? "an" : "a";
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "choose", what: e.filter.text, options: opts, count: 1, secret: pid === them ? "own" : "theirs", ...(pid !== them ? { of: them } : {}), prompt: pid === them ? `secretly choose ${a} ${e.filter.text} you control. Both choices are then revealed, and you sacrifice the chosen ones.` : `secretly choose ${a} ${e.filter.text} ${player(s, them).name} controls. Both choices are then revealed, and they sacrifice the chosen ones.` };
        return "paused";
      }
      const mine = sc.chosen?.[ctx.controller] ?? [];
      const theirs = sc.chosen?.[them] ?? [];
      const name = (ids: ObjectId[]) => (ids.length ? defOf(s, obj(s, ids[0]!)).name : "nothing");
      log(s, `The choices are revealed: ${player(s, ctx.controller).name} chose ${name(mine)}, ${player(s, them).name} chose ${name(theirs)}.`);
      s.resolving!.created = [...new Set([...mine, ...theirs])].filter((id) => s.objects[id]?.zone === "battlefield");
      sc.queue = undefined;
      sc.chosen = undefined;
      return;
    }
    case "eachExilesPermanentsOrHand": {
      const sc = (s.resolving!.scratch ??= {});
      const pool = (pid: PlayerId) => [...s.battlefield.filter((id) => !s.phasedOut?.includes(id) && controllerOf(s, obj(s, id)) === pid), ...player(s, pid).hand];
      if (!sc.madness) {
        const n = Math.max(0, amountNow(s, e.n, ctx));
        if (!n) return;
        sc.madness = { n, queue: turnOrderFrom(s, ctx.controller).filter((p) => !player(s, p).lost), picked: [] };
      }
      const st = sc.madness;
      if (sc.found) {
        const pid = st.queue.shift()!;
        const ok = sc.found.filter((id) => pool(pid).includes(id));
        st.picked.push(...ok);
        const fromHand = ok.filter((id) => obj(s, id).zone === "hand").length;
        const perms = ok.filter((id) => obj(s, id).zone === "battlefield").map((id) => defOf(s, obj(s, id)).name);
        log(s, `${player(s, pid).name} chooses ${[...perms, ...(fromHand ? [`${fromHand} card${fromHand === 1 ? "" : "s"} from their hand`] : [])].join(", ") || "nothing"} to exile (${src}).`);
        delete sc.found;
      }
      while (st.queue.length) {
        const pid = st.queue[0]!;
        const cards = pool(pid);
        if (cards.length <= st.n) {
          st.picked.push(...cards);
          if (cards.length) log(s, `${player(s, pid).name} exiles everything they control and their whole hand (${src}).`);
          st.queue.shift();
          continue;
        }
        s.pending = { kind: "searchLibrary", player: pid, source: src, what: `${st.n} permanent${st.n === 1 ? "" : "s"} you control and/or card${st.n === 1 ? "" : "s"} from your hand to exile`, cards, min: st.n, max: st.n };
        return "paused";
      }
      sc.madness = undefined;
      for (const id of st.picked) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" && o?.zone !== "hand") continue;
        if (o.zone === "battlefield") log(s, `${src} exiles ${defOf(s, o).name}.`);
        moveObject(s, id, "exile");
      }
      return;
    }
    case "secretChooseEach": {
      // Call to the Void: each player in turn order from the active player, a creature they control then one they don't
      // (a player with none to choose from chooses nothing there); revealed together once all are made (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const creatures = () => s.battlefield.filter((id) => !s.phasedOut?.includes(id) && objIsType(s, obj(s, id), "Creature"));
      if (!sc.queue) {
        sc.queue = apnap(s, livingPlayers(s)).flatMap((p) => [p, p]);
        sc.chosen = {};
        sc.secretPicks = [];
      }
      for (;;) {
        // An answer just given (game.ts files it under the player): kept with the others.
        for (const [pid, ids] of Object.entries(sc.chosen ?? {})) for (const id of ids) sc.secretPicks!.push({ player: Number(pid), id });
        sc.chosen = {};
        if (!sc.queue.length) break;
        const pid = sc.queue[0]!;
        const own = sc.queue[1] === pid;
        const opts = creatures().filter((id) => (controllerOf(s, obj(s, id)) === pid) === own);
        if (opts.length <= 1) {
          sc.chosen[pid] = opts;
          sc.queue.shift();
          continue;
        }
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "choose", what: own ? "creature you control" : "creature you don't control", options: opts, count: 1, secret: own ? "own" : "theirs", prompt: `secretly choose a creature you ${own ? "control" : "don't control"}. All choices are then revealed, and each creature chosen is destroyed.` };
        return "paused";
      }
      const picks = sc.secretPicks ?? [];
      log(s, `The choices are revealed: ${apnap(s, livingPlayers(s)).map((pid) => `${player(s, pid).name} chose ${picks.filter((p) => p.player === pid).map((p) => defOf(s, obj(s, p.id)).name).join(" and ") || "nothing"}`).join("; ")}.`);
      s.resolving!.created = [...new Set(picks.map((p) => p.id))].filter((id) => s.objects[id]?.zone === "battlefield");
      sc.queue = undefined;
      sc.chosen = undefined;
      sc.secretPicks = undefined;
      return;
    }
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
    case "commandersToHand": {
      // Every commander you own (CR 903.3) in the command zone or your graveyard as this resolves, all at once.
      const p = player(s, ctx.controller);
      const mine = [...p.command, ...p.graveyard].filter((id) => obj(s, id).isCommander && obj(s, id).owner === p.id);
      for (const id of mine) {
        log(s, `${p.name} puts ${defOf(s, obj(s, id)).name} into their hand from ${obj(s, id).zone === "command" ? "the command zone" : "their graveyard"}.`);
        moveObject(s, id, "hand");
      }
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
      moveObject(s, c.id, "battlefield", { controller: c.owner, putBy: ctx.controller });
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
      enterTogether(s, () => cards.forEach((o) => moveObject(s, o.id, "battlefield", { controller: o.owner, putBy: ctx.controller, ...(e.counter ? { counters: { [e.counter]: 1 } } : {}) })));
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
      if (e.setsDid && sc.castingTarget === undefined && !done.length) s.resolving!.did = false;
      if (sc.castingTarget !== undefined) {
        const o = s.objects[sc.castingTarget];
        const d = o && defOf(s, o);
        if (e.setsDid && o?.zone === "stack") s.resolving!.did = true;
        if (o?.zone === "stack" && e.exileAfter && (e.exileAfter === true || isType(d!, "Instant") || isType(d!, "Sorcery"))) o.exileIfToGraveyard = true;
        done.push(sc.castingTarget);
        sc.castingTarget = undefined;
      }
      for (const o of objects(s, e.what, ctx)) {
        // Hidetsugu and Kairi: "exile the top card of your library ... you may cast it": the card just exiled, still there.
        if ((o.zone !== "graveyard" && !(o.zone === "exile" && e.what.ref === "exiledTop")) || done.includes(o.id)) continue;
        sc.castingTarget = o.id;
        const caster = e.byOwner ? o.owner : ctx.controller;
        // Rashmi and Ragavan: a mana value less than the count as this resolves, the Treasure it made counted (rulings).
        const below = e.mvLessThan ? amountNow(s, e.mvLessThan, ctx) : undefined;
        if (below !== undefined && below <= 0) {
          done.push(o.id);
          log(s, `${defOf(s, o).name} can't be cast this way.`);
          continue;
        }
        s.pending = { kind: "castFree", player: caster, objectId: o.id, source: src, ...(below !== undefined ? { mv: { max: below - 1 } } : {}) };
        if (freeCastable(s, caster, o.id)) return "paused";
        s.pending = null;
        sc.castingTarget = undefined;
        done.push(o.id);
        log(s, `${defOf(s, o).name} can't be cast.`);
      }
      sc.castTargetsDone = undefined;
      return;
    }
    case "castFromExileFree": {
      // Rebound (CR 702.88a): the card has to still be in exile, the same object (CR 400.7). Transcendent Dragon: the card
      // its counter exiled.
      const at = e.countered ? s.resolving?.counteredExiled : ctx.subject;
      const o = at ? s.objects[at.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== at!.zc) return;
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
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o!.id, source: src, how: "madness", ...(e.cost ? { madnessCost: e.cost } : {}) };
        // Mana abilities can still be activated to pay for it (CR 601.2g), so only the mana in the pool may be short.
        const problem = castProblem(s, ctx.controller, o!.id);
        if (problem === null || /^not enough mana/.test(problem)) return "paused";
        s.pending = null;
      }
      if (!here()) return; // it was cast
      log(s, `${defOf(s, o!).name} is put into ${player(s, o!.owner).name}'s graveyard (madness).`);
      moveObject(s, o!.id, "graveyard");
      // It was discarded this turn (rulings on Shadow of the Grave: a madness card not cast is found there).
      if (o!.zone === "graveyard") o!.discardedTurn = s.turn;
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
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "miracle", ...(e.cost ? { miracleCost: e.cost } : {}) };
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
        if (o?.zone === "stack" && !e.yardNoExile) o.exileIfToGraveyard = true;
        sc.castFromYard = undefined;
      }
      if (sc.castFromHand === "cast" || sc.castFromHand === "none") {
        // In Search of Greatness: "If you don't": whether the spell was cast (it's on the stack now).
        if (e.setsDid) s.resolving!.did = sc.castFromHand === "cast" && s.objects[sc.castFromHandId ?? ""]?.zone === "stack";
        return;
      }
      if (e.setsDid) s.resolving!.did = false;
      // Jace's Mindseeker: the cards this resolution milled, still where they went.
      const milled = e.milled ? [...(s.resolving!.milled ?? []), ...(s.resolving!.milledExiled ?? [])].filter((m) => s.objects[m.id] && (s.objects[m.id]!.zoneChanges ?? 0) === m.zc).map((m) => m.id) : undefined;
      const zone = milled ?? (e.fromGraveyard ? p.graveyard : p.hand);
      // Twinning Glass: the names of the spells cast this turn, by anyone (rulings); a face-down spell has none (CR 708.2a).
      const names = e.sameNameCastThisTurn ? [...new Set((s.castThisTurn ?? []).flatMap((c) => c.name?.split(" // ") ?? []))] : undefined;
      // Baral and Kari Zev: the triggering spell as it was cast (CR 202.3e, its X included), or as it last existed on the
      // stack (CR 608.2h): a spell cast this way must have a lesser mana value and share one of its card types, both checked
      // on the spell as it's cast (a split card's half, an Adventure, a modal double-faced card's face, CR 709.3, 715.3, 712.11).
      const cause = e.lesserSharingCast && ctx.cause !== undefined ? s.castItems?.[ctx.cause] : undefined;
      if (e.lesserSharingCast && !cause) return;
      const causeObj = cause?.objectId ? s.objects[cause.objectId] : undefined;
      const lesser = cause ? { mv: { max: spellManaValue(s, cause) - 1 }, types: [...(causeObj?.zone === "stack" ? characteristics(s, causeObj).types : causeObj ? defOf(s, causeObj).types : [])] } : undefined;
      const castable = (id: ObjectId) => {
        s.pending = { kind: "castFree", player: p.id, objectId: id, source: src, ...(names ? { names } : {}), ...(lesser ?? {}) };
        // With names: some way to cast it has one (a split card's half, an Adventure, a back face, CR 709.3, 715.3, 712.11).
        const d = defOf(s, obj(s, id));
        const faces = (names || lesser) && d.faces?.length ? [undefined, ...d.faces.map((_, i) => i), ...(d.layout === "split" ? [d.faces.length] : [])] : [undefined];
        const ok = faces.some((face) => {
          const problem = castProblem(s, p.id, id, undefined, undefined, undefined, undefined, undefined, face === undefined ? undefined : { face });
          return problem === null || /^not enough mana/.test(problem);
        });
        s.pending = null;
        return ok;
      };
      if (sc.castFromHand === undefined) {
        // "With mana value X or less": this spell's X (TargetSpec.xRange).
        // "With mana value less than or equal to the other result" (TargetSpec.bound): as it resolves.
        // Counterlash: sharing a card type with the countered spell (any one of them); with none, nothing does.
        const shared = e.sharesTypeWithCountered ? (s.resolving!.counterTargetTypes?.length ? s.resolving!.counterTargetTypes : ["(none)"]) : undefined;
        const { xRange, ...rest } = bindBound(s, shared ? { ...e.filter, types: shared } : e.filter, amountCtx(s, ctx));
        const x = ctx.x ?? 0;
        const filter: TargetSpec = xRange ? { ...rest, manaValue: xRange.at === "exact" ? { min: x, max: x } : xRange.at === "least" ? { min: x } : { max: x } } : rest;
        // "Draw three cards and reveal them": the ones still in hand, which everyone sees (CR 701.20a).
        const drawn = e.drawn ? (s.resolving!.drawnThisWay ?? []).filter((id) => p.hand.includes(id)) : undefined;
        if (drawn?.length) log(s, `${p.name} reveals ${drawn.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
        const options = (drawn ?? zone).filter((id) => !isType(defOf(s, obj(s, id)), "Land") && printedMatches(filter, defOf(s, obj(s, id))) && castable(id));
        if (!options.length) {
          log(s, drawn || milled ? `${p.name} can't cast any of them.` : `${p.name} has no ${filter.text.replace(/^an? /, "")} ${e.fromGraveyard ? "in their graveyard" : "in hand"} to cast.`);
          return;
        }
        // Brain in a Jar: "with mana value equal to the number of charge counters on ~" says the number it is now.
        const exact = e.filter.bound?.at === "exact" && filter.manaValue?.min !== undefined && filter.manaValue.min === filter.manaValue.max ? filter.manaValue.min : undefined;
        const said = exact !== undefined ? filter.text.replace(/ with mana value equal to .+$/, ` with mana value ${exact}`) : filter.text;
        const text = said.replace(/^(?!an? )/, /^[aeiou]/i.test(said) ? "an " : "a ");
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "castFromHand", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name), "Don't cast"], prompt: drawn ? "cast one of the cards you drew without paying its mana cost?" : milled ? `cast ${text} from among the milled cards without paying its mana cost?` : `cast ${text} from your ${e.fromGraveyard ? "graveyard" : "hand"} without paying its mana cost?` };
        return "paused";
      }
      const id = sc.castFromHand;
      sc.castFromHand = "cast";
      sc.castFromHandId = id;
      if (!s.objects[id] || (milled ? !milled.includes(id) : obj(s, id).zone !== (e.fromGraveyard ? "graveyard" : "hand")) || !castable(id)) return;
      if (e.fromGraveyard) sc.castFromYard = id;
      s.pending = { kind: "castFree", player: p.id, objectId: id, source: src, ...(names ? { names } : {}), ...(lesser ?? {}) };
      return "paused";
    }
    case "castFromAmong": {
      // Exiled face up (CR 406.3), then cast one at a time as this resolves, ignoring timing (CR 608.2g); X is 0 and
      // no alternative costs (CR 107.3b, 118.9). The total counts the spells' mana values on the stack, which for a
      // card cast without paying its mana cost is its own with X as 0 (rulings on Primeval Spawn). Lands can't be cast.
      const sc = (s.resolving!.scratch ??= {});
      const by = e.castBy ? players(s, e.castBy, ctx)[0] : ctx.controller;
      if (by === undefined) return;
      const you = player(s, by);
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
      // Jace, Architect of Thought: the cards its searches exiled this resolution (see searchEachExile).
      if (!sc.castAmong && e.fromSearched) sc.castAmong = { ids: (s.resolving!.searchedExiled ?? []).filter((x) => (obj(s, x.id).zoneChanges ?? 0) === x.zc && obj(s, x.id).zone === "exile"), declined: [] };
      // Emergent Ultimatum: the cards this resolution's search exiled, those still in exile now (one shuffled back isn't).
      // Portent of Calamity (round 409): the cards its dig exiled, still in exile as those objects (CR 400.7); fewer than
      // `minDug` exiled, none may be cast (they still go where `rest` says).
      if (!sc.castAmong && e.fromDug) {
        const dug = s.resolving!.dugExiled ?? [];
        const ids = dug.filter((x) => s.objects[x.id]?.zone === "exile" && (s.objects[x.id]!.zoneChanges ?? 0) === x.zc);
        const enough = e.minDug === undefined || dug.length >= e.minDug;
        if (!enough && ids.length) log(s, `${you.name} exiled fewer than ${e.minDug} cards this way, so they can't cast any of them.`);
        sc.castAmong = { ids, declined: [], ...(enough ? {} : { max: 0 }) };
      }
      if (!sc.castAmong && e.fromExiledThisWay) sc.castAmong = { ids: [...new Set(s.resolving!.exiledCards ?? [])].filter((id) => s.objects[id]?.zone === "exile").map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
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
      if (!sc.castAmong && e.fromLinked) {
        // Kaho, Jeleva, Shell of the Last Kappa: the cards exiled with this object (CR 607.2a), still in exile (CR 400.7).
        let ids = linkedCards(s, ctx.sourceId, ctx.sourceZc ?? 0);
        // Boiling Rock Rioter: "cards you own exiled with ~".
        if (e.ownedOnly) ids = ids.filter((x) => obj(s, x.id).owner === ctx.controller);
        // River Song's Diary: one of them chosen at random, the only one that may be cast.
        if (e.randomOne && ids.length) {
          const one = ids[Math.floor(nextRandom(s) * ids.length)]!;
          log(s, `${src}: ${defOf(s, obj(s, one.id)).name} is chosen at random from among the cards exiled with it.`);
          ids = [one];
        }
        // Rod of Absorption: "with total mana value X or less", what's left of X as each is cast.
        sc.castAmong = { ids, declined: [], ...(e.exactMv !== undefined ? { exactMv: amountNow(s, e.exactMv, ctx) } : {}), ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}) };
      }
      if (!sc.castAmong && e.opponentsExile) {
        // Ashiok, Nightmare Muse: every face-up card your opponents own in exile (each player's own exile here, CR 406.3).
        const pool = s.turnOrder.filter((pid) => pid !== you.id).flatMap((pid) => s.players[pid]!.exile);
        sc.castAmong = { ids: pool.filter((id) => obj(s, id).owner !== you.id && !obj(s, id).faceDown).map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.ownExileCounter) {
        // Goliath Daydreamer: every card you own in exile with that kind of counter on it, whatever put it there (rulings).
        const k = e.ownExileCounter;
        // Tasha: every player's cards in exile (each player has their own exile here).
        const pool = e.anyOwnerExile ? s.turnOrder.flatMap((pid) => s.players[pid]!.exile) : you.exile;
        sc.castAmong = { ids: pool.filter((id) => (obj(s, id).counters[k] ?? 0) > 0 && (e.anyOwnerExile || obj(s, id).owner === you.id) && !obj(s, id).faceDown).map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.fromYard?.causeLinked) {
        // Eye of the Storm: the card that was cast, while it's still that spell on the stack (CR 400.7), exiled, not
        // countered; then every card still exiled with Eye of the Storm, whoever owns it (rulings).
        const item = ctx.cause ? s.stack.find((x) => x.id === ctx.cause && x.kind === "spell") : undefined;
        const o = item?.objectId ? s.objects[item.objectId] : undefined;
        if (item && o && !o.spellCopy && !item.copy && o.zone === "stack") {
          s.stack.splice(s.stack.indexOf(item), 1);
          moveObject(s, o.id, "exile");
          log(s, `${src} exiles ${defOf(s, o).name} from the stack.`);
          const gone = obj(s, o.id);
          if (gone.zone === "exile" && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id: gone.id, zc: gone.zoneChanges ?? 0 });
        }
        sc.castAmong = { ids: linkedCards(s, ctx.sourceId, ctx.sourceZc ?? 0).filter((x) => !e.fromYard!.filter || printedMatches(e.fromYard!.filter, defOf(s, obj(s, x.id)))), declined: [] };
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
      if (!sc.castAmong && e.fromYard?.chooser) {
        // Wildfire Devils: the chosen player picks the card from their own graveyard (rulings) and exiles it; then a copy
        // of only that card. None there: nothing happens.
        const whose = players(s, e.fromYard.chooser, ctx)[0];
        const pool = whose === undefined ? [] : player(s, whose).graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        const picked = sc.found?.filter((id) => pool.includes(id)) ?? (pool.length === 1 ? pool : undefined);
        if (whose !== undefined && pool.length && !picked?.length) {
          s.pending = { kind: "searchLibrary", player: whose, source: src, what: `${/^[aeiou]/i.test(e.fromYard.filter!.text) ? "an" : "a"} ${e.fromYard.filter!.text}`, cards: pool, min: 1, max: 1, fromGraveyard: "exile", copiedBy: you.id };
          return "paused";
        }
        const gone: ObjectId[] = [];
        if (whose !== undefined && picked?.length) {
          moveObject(s, picked[0]!, "exile");
          log(s, `${player(s, whose).name} exiles ${defOf(s, obj(s, picked[0]!)).name} from their graveyard.`);
          if (obj(s, picked[0]!).zone === "exile") gone.push(picked[0]!);
        } else if (whose !== undefined) log(s, `${player(s, whose).name} has no ${e.fromYard.filter!.text} in their graveyard.`);
        sc.found = undefined;
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.fromYard?.random) {
        // Wondrous Crucible: one card at random; a copy of that card only.
        const pool = you.graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        const gone: ObjectId[] = [];
        // Capricious Hellraiser: "exile three cards at random": that many, each chosen at random from those left.
        const had = pool.length;
        for (let k = 0; k < (e.fromYard.n ?? 1) && pool.length; k++) {
          const id = pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!;
          moveObject(s, id, "exile");
          log(s, `${you.name} exiles ${defOf(s, obj(s, id)).name}, chosen at random, from their graveyard.`);
          if (obj(s, id).zone === "exile") gone.push(id);
        }
        if (!had) log(s, `${you.name} has no ${e.fromYard.filter!.text} in their graveyard.`);
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
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
        // Spelltwine: both target cards, each still legal (rulings: one illegal target, the other is still exiled and copied).
        const ids = e.fromYard.target !== undefined ? [e.fromYard.target, ...(e.fromYard.alsoTarget !== undefined ? [e.fromYard.alsoTarget] : [])].flatMap((index) => objects(s, { ref: "target", index, ...(e.fromYard!.many ? { n: e.fromYard!.n ?? 1 } : {}) }, ctx).map((o) => o.id)) : you.graveyard.filter((id) => printedMatches(e.fromYard!.filter!, defOf(s, obj(s, id))));
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        if (gone.length) log(s, `${you.name} exiles ${gone.map((id) => `${defOf(s, obj(s, id)).name}${obj(s, id).owner === you.id ? "" : ` (${player(s, obj(s, id).owner).name}'s)`}`).join(", ")} from ${gone.every((id) => obj(s, id).owner === you.id) ? "their" : "a"} graveyard.`);
        // Mysterious Stranger (round 411): "If two or more cards are exiled this way, choose one of them at random and copy
        // it": the cards this exile moved there (an illegal target isn't exiled, CR 608.2b), and only one of them, chosen at
        // random as it resolves; with fewer, no copy at all. The copy is cast as it resolves or never (rulings).
        const atLeast = e.fromYard.randomOfAtLeast;
        if (atLeast !== undefined) {
          const one = gone.length >= atLeast ? gone[Math.floor(nextRandom(s) * gone.length)] : undefined;
          if (one !== undefined) log(s, `${src}: ${defOf(s, obj(s, one)).name} is chosen at random to copy.`);
          else log(s, `${src}: fewer than ${atLeast} cards were exiled this way, so none is copied.`);
          gone.splice(0, gone.length, ...(one !== undefined ? [one] : []));
        }
        // Uldaros Theorix: "spells with total mana value 6 or less from among the copies", what's left of it as each is cast.
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}) };
      }
      if (!sc.castAmong && e.handAndYard) {
        // Invoke Calamity: cast from your hand and/or graveyard, where they are (rulings: the spells' mana values on the
        // stack count toward the total).
        // Kaya the Inexorable's emblem: the cards you own in exile too, those you can look at (rulings).
        const exiled = e.andExile ? you.exile.filter((id) => obj(s, id).owner === you.id && !hiddenInExile(obj(s, id), you.id)) : [];
        sc.castAmong = { ids: [...you.hand, ...you.graveyard, ...exiled].map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.totalMv !== undefined ? { budget: amountNow(s, e.totalMv, ctx) } : {}) };
      }
      if (!sc.castAmong && e.anyYard) {
        // Spectral Arcanist: a card from any graveyard, cast from there as this resolves (rulings, CR 608.2g); the mana value
        // limit counted now.
        // Sorcerous Squall: only that player's graveyard.
        sc.castAmong = { ids: (e.yardOf ? players(s, e.yardOf, ctx) : apnap(s, livingPlayers(s))).flatMap((pid) => player(s, pid).graveyard).map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [], ...(e.maxMv !== undefined ? { maxMv: amountNow(s, e.maxMv, ctx) } : {}) };
      }
      if (!sc.castAmong && e.yourYard) {
        // Chandra Ablaze: the cards in your graveyard, cast from there one after another as this resolves, ignoring timing
        // (rulings, CR 608.2g).
        sc.castAmong = { ids: you.graveyard.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
      }
      if (!sc.castAmong && e.topYardHand) {
        // Crabomination: the top card of that player's library, a card at random from their graveyard and one at random
        // from their hand, all exiled at once (face up, CR 406.3); a zone with no card gives none.
        const whose = players(s, e.who, ctx)[0];
        if (whose === undefined) return;
        const pl = player(s, whose);
        const pick = (zone: ObjectId[]) => (zone.length ? zone[Math.floor(nextRandom(s) * zone.length)] : undefined);
        const ids = [pl.library[0], pick(pl.graveyard), pick(pl.hand)].filter((id): id is ObjectId => id !== undefined);
        for (const id of ids) moveObject(s, id, "exile");
        const gone = ids.filter((id) => obj(s, id).zone === "exile");
        log(s, gone.length ? `${pl.name} exiles ${gone.map((id) => defOf(s, obj(s, id)).name).join(", ")} (the top card of their library, a card at random from their graveyard and one at random from their hand).` : `${pl.name} has no cards to exile.`);
        sc.castAmong = { ids: gone.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), declined: [] };
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
      // Spell mastery (Talent of the Telepath): checked once, as it starts resolving (rulings).
      if (e.maxIfYard && st.max === undefined) st.max = you.graveyard.filter((id) => printedMatches(e.maxIfYard!.has, defOf(s, obj(s, id)))).length >= e.maxIfYard.min ? e.maxIfYard.max : (e.max ?? Number.MAX_SAFE_INTEGER);
      const maxCast = st.max ?? e.max;
      const mvOf = (id: ObjectId) => defMv(defOf(s, obj(s, id)));
      // Still where they were put: in exile, or revealed in the library (`reveal`).
      const exiled = (id: ObjectId) => st.ids.some((x) => x.id === id && (e.handAndYard ? (e.andExile ? ["hand", "graveyard", "exile"] : ["hand", "graveyard"]).includes(s.objects[id]?.zone ?? "") : s.objects[id]?.zone === (e.yourYard || e.anyYard ? "graveyard" : e.fromHand ? "hand" : e.reveal ? "library" : "exile")) && (s.objects[id]!.zoneChanges ?? 0) === x.zc);
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
        // Kaervek, the Punisher: "If you do, you lose 2 life": after the copy is cast.
        if (e.castLoseLife && st.cast && livingPlayers(s).includes(you.id)) {
          log(s, `${you.name} loses ${e.castLoseLife} life (${src}).`);
          loseLife(s, you.id, e.castLoseLife);
        }
        // Yennett: none cast, so you draw (the card revealed, still on top: rulings).
        if (e.noneCastDraw && !st.cast) draw(s, you.id, e.noneCastDraw);
        if (!e.rest) return;
        // Glorious Purpose (round 405): all of them into the hand.
        const toHand = e.rest.dest === "hand" ? left.filter((id) => s.objects[id]?.zone === "exile") : e.rest.toHand ? left.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) : [];
        for (const id of toHand) moveObject(s, id, "hand");
        if (toHand.length) log(s, `${you.name} puts ${toHand.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their hand.`);
        if (e.rest.dest === "hand") return;
        const others = left.filter((id) => !toHand.includes(id));
        if (e.rest.dest === "graveyard") {
          // Each card to its owner's graveyard (CR 404.2): the target opponent's own, for Talent of the Telepath.
          for (const id of others) moveObject(s, id, "graveyard");
          if (others.length) log(s, `${player(s, obj(s, others[0]!).owner).name} puts ${others.map((id) => defOf(s, obj(s, id)).name).join(", ")} into their graveyard.`);
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
        else {
          st.cast = (st.cast ?? 0) + 1;
          // Uldaros Theorix: the copy's mana value as it's cast counts toward the total (CR 202.3).
          const item = s.stack.find((x) => x.objectId === st.casting);
          if (st.budget !== undefined) st.budget -= item ? spellManaValue(s, item) : 0;
        }
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
          // Bilbo: only an instant or sorcery spell, its types as it was cast (an Adventure's, CR 715.3).
          if (e.exileCast && s.objects[st.casting]?.zone === "stack" && (!e.exileCastTypes || e.exileCastTypes.some((ty) => objIsType(s, obj(s, st.casting!), ty)))) s.objects[st.casting]!.exileIfToGraveyard = true;
          // Kylox's Voltstrider (round 401): "put it on the bottom of its owner's library instead" (CR 614.1a).
          if (e.bottomCast && s.objects[st.casting]?.zone === "stack") s.objects[st.casting]!.bottomIfToGraveyard = true;
          st.cast = (st.cast ?? 0) + 1;
          // Jetsam: one spell from each graveyard, so none more from this one's owner's.
          if (e.onePerOwner) (st.ownersCast ??= []).push(obj(s, st.casting).owner);
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
      // Jacob Frye: "You may cast the copy", paying its costs (rulings).
      const freeCast = (id: ObjectId) => ({ kind: "castFree" as const, player: you.id, objectId: id, source: src, ...(mv ? { mv } : {}), ...((e.handAndYard || e.asSpell) && e.filter?.types?.length ? { types: e.filter.types } : {}), ...(e.handAndYard && e.filter?.supertypes?.length ? { supertypes: e.filter.supertypes } : {}), ...(e.asSpell && e.filter && !e.filter.types?.length ? { spellFilter: e.filter } : {}), ...(e.paid || e.pay?.kind === "mana" ? { how: "paid" as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.pay ? { pay: e.pay } : {}) });
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
        if (exiled(id) && canPlayLandNow(s, you.id, id)) {
          playLandByEffect(s, you.id, id, untapped);
          // Vault 112: "play one of those cards": a land played is the one.
          if (e.max !== undefined && obj(s, id).zone === "battlefield") st.cast = (st.cast ?? 0) + 1;
        }
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
          s.pending = { kind: "castFree", player: you.id, objectId: copy.id, source: src, ...(mv ? { mv } : {}), ...(e.paid || e.pay?.kind === "mana" ? { how: "paid" as const } : {}), ...(e.pay ? { pay: e.pay } : {}), ...(e.must ? { must: true as const } : {}) };
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
      // Chandra, Pyromaster: one card chosen, then only its copies.
      const copiedOne = e.oneCard ? Object.keys(st.copied ?? {}) : [];
      const options = st.ids
        .map((x) => x.id)
        .filter((id) => !copiedOne.length || copiedOne.includes(id))
        .filter((id) => exiled(id) && !st.declined.includes(id) && id !== st.excluded && !st.ownersCast?.includes(obj(s, id).owner) && (isLand(id) && !e.handAndYard ? !!e.lands && canPlayLandNow(s, you.id, id) : (!e.filter || e.handAndYard || e.asSpell || printedMatches(e.filter, defOf(s, obj(s, id)))) && (!st.hits || st.hits.includes(id)) && (!e.sharesTypeWithYours || sharesType(id)) && castable(id)));
      if (!options.length || (maxCast !== undefined && (st.cast ?? 0) >= maxCast)) return finish();
      // Spelltwine: "Cast the copies if able": no stopping while one can be cast; the order is its player's (rulings), so
      // only a choice of which one first.
      if (e.must && options.length === 1) {
        st.pick = options[0];
        return runEffect(s, e, ctx);
      }
      if (e.must) {
        s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options, labels: options.map((id) => `${defOf(s, obj(s, id)).name}${obj(s, id).owner === you.id ? "" : ` (${player(s, obj(s, id).owner).name}'s)`}`), prompt: "cast a copy of which card first, without paying its mana cost? You cast the other copy after it, if able." };
        return "paused";
      }
      if (e.look && options.length === 1) {
        // Planetarium: the one card looked at is offered as the free cast itself (cast it, or decline).
        st.pick = options[0];
        return runEffect(s, e, ctx);
      }
      const left = st.budget !== undefined ? ` (total mana value ${st.budget} left)` : "";
      s.pending = { kind: "chooseOption", player: you.id, source: src, what: "castFromAmong", options: [...options, "none"], labels: [...options.map((id) => defOf(s, obj(s, id)).name + (e.handAndYard ? ` (${obj(s, id).zone})` : e.anyYard ? ` (${player(s, obj(s, id).owner).name}'s graveyard)` : "")), "Done"], prompt: e.anyYard ? `cast ${e.filter ? `${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text.replace(/ cards?$/, "")}` : "a"} spell from ${e.onePerOwner ? "each opponent's graveyard (one from each)" : e.yardOf && options[0] ? `${player(s, obj(s, options[0]).owner).name}'s graveyard` : "a graveyard"} without paying its mana cost${st.maxMv !== undefined ? ` (mana value ${st.maxMv} or less)` : ""}?` : e.handAndYard ? `cast ${e.filter?.supertypes?.includes("Legendary") ? "a legendary" : e.pay && e.filter?.types?.length === 1 ? `${/^[AEIOU]/.test(e.filter.types[0]!) ? "an" : "a"} ${e.filter.types[0]!.toLowerCase()}` : "a"} spell from your hand${e.andExile ? ", graveyard or exile" : " or graveyard"} ${e.pay ? `${castPayText(e.pay)} rather than paying its mana cost` : "without paying its mana cost"}${left}?` : e.yourYard ? `cast ${e.filter ? `${/^[aeiou]/i.test(e.filter.text) ? "an" : "a"} ${e.filter.text.replace(/ cards?$/, "")}` : "a"} spell from your graveyard${e.paid ? "" : " without paying its mana cost"}?` : `${e.lands ? "play a land or " : ""}cast a spell from ${e.fromHand ? (obj(s, options[0]!).owner === you.id ? "your hand" : `among the cards in ${player(s, obj(s, options[0]!).owner).name}'s hand`) : "among "}${e.fromHand ? "" : `the ${e.reveal ? "revealed" : "exiled"} cards`}${e.paid ? "" : e.pay ? ` ${castPayText(e.pay)} rather than paying its mana cost` : " without paying its mana cost"}${left}?` };
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
      countersRemoved(s, o, "time", 1);
      fireEvent(s, { type: "timeCountersRemovedExiled", id: o.id, n: 1, by: ctx.controller });
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
    case "mayCastExiledSelf": {
      // Shattered Seraph: the card its cost exiled, while it's still that object in exile (CR 400.7), with its usual timing
      // and costs; its owner, who activated it from their hand, casts it.
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "exile" || ctx.sourceZc === undefined || (o.zoneChanges ?? 0) !== ctx.sourceZc + 1) return;
      o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true };
      log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, o).name} for as long as it remains exiled.`);
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
        // Esper Origins: then onto the battlefield with its back face up, under its owner's control (CR 712.14a).
        if (e.thenTransformed) return returnFromExile(s, [moved], (c) => c.owner, src, e.thenTransformed.counter, false, true);
        return;
      }
      moved.counters.time = e.n;
      log(s, `${name} is exiled with ${e.n} time counter${e.n === 1 ? "" : "s"} on it.`);
      return;
    }
    case "destroy": {
      let list = objects(s, e.what, ctx);
      // Capricious Efreet: one of those still legal, chosen at random as it resolves, nobody acting in between (rulings).
      if (e.oneAtRandom) {
        list = list.filter((o) => o.zone === "battlefield");
        if (list.length > 1) {
          const pick = list[Math.floor(nextRandom(s) * list.length)]!;
          log(s, `${src} chooses ${defOf(s, pick).name} at random.`);
          list = [pick];
        }
      }
      // Bone Shaman (round B230): which can't be regenerated, before any of them is destroyed (they're destroyed at once).
      const barred = list.length > 1 && !e.noRegen ? damagedNoRegen(s) : undefined;
      for (const o of list) {
        // As it last existed, for "for each creature destroyed this way" (CR 608.2h).
        const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)), controller: controllerOf(s, o) };
        // "If that creature dies this way": it was put into a graveyard (CR 700.4), not exiled or moved elsewhere instead.
        if (destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, e.noRegen === "creatures" ? objIsType(s, o, "Creature") : !!e.noRegen || !!barred?.has(o.id), ctx.controller) && s.resolving) (s.resolving.destroyed ??= []).push({ ...before, ...(s.objects[o.id]?.zone === "graveyard" ? { died: true as const } : {}) });
      }
      return;
    }
    case "removeDamageShield":
      for (const o of objects(s, e.what, ctx)) {
        o.removeDamageShields = (o.removeDamageShields ?? 0) + 1;
        log(s, `The next time ${defOf(s, o).name} would be destroyed this turn, all damage marked on it is removed instead.`);
      }
      return;
    case "regenerate":
      for (const o of objects(s, e.what, ctx)) {
        o.regenShields = (o.regenShields ?? 0) + 1;
        // "When it regenerates this way, ..." (Matopi Golem): this shield's own delayed trigger (CR 603.7), made now; its
        // source is the ability's (CR 603.7d), "that player" the player the ability targeted (Soldevi Sentry).
        if (e.rider || e.riderControl) {
          const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          const t = e.riderPlayer !== undefined ? ctx.targets[e.riderPlayer] : undefined;
          (o.regenRiders ??= []).push({ ...(e.rider ? { body: e.rider } : {}), ...(e.riderControl ? { control: true as const } : {}), controller: ctx.controller, sourceId: src?.id ?? o.id, sourceCardId: src ? cardIdOf(src) : cardIdOf(o), sourceZc: ctx.sourceZc ?? src?.zoneChanges ?? o.zoneChanges ?? 0, ...(t?.kind === "player" ? { player: t.id } : {}) });
        }
        log(s, `${defOf(s, o).name} gets a regeneration shield.`);
      }
      return;
    case "exile": {
      // "Until ~ leaves the battlefield": if it already left, nothing is exiled (CR 610.3a-b).
      const me = e.until === "sourceLeaves" ? objects(s, { ref: "self" }, ctx)[0] : e.until === "targetLeaves" ? objects(s, { ref: "target", index: e.untilTarget! }, ctx).find((o) => o.zone === "battlefield") : undefined;
      if (e.until === "targetLeaves" && !me) {
        log(s, `${src}: the permanent it waits on is gone, so nothing is exiled.`);
        return;
      }
      const monarch = e.until === "opponentMonarch" ? { controller: ctx.controller, source: src, cards: [] as { id: ObjectId; zc: number }[] } : undefined;
      if (monarch) (s.exiledUntilMonarch ??= []).push(monarch);
      if (e.until === "sourceLeaves" && !me) {
        log(s, `${src} has left the battlefield, so nothing is exiled.`);
        return;
      }
      // Hofri Ghostforge: "exile it. If you do": only if it went to exile (not if it had left the graveyard, CR 400.7).
      if (e.setsDid && s.resolving) s.resolving.did = false;
      // Lagrella, the Magpie: the delayed trigger made as this resolves (CR 603.7a), one for all the cards it exiles; its
      // source is this ability's, as it was, and its controller this ability's controller (CR 603.7e).
      const rider = e.returnRider && me ? { key: `r${s.nextId++}`, controller: ctx.controller, sourceId: me.id, sourceCardId: cardIdOf(me), sourceZc: me.zoneChanges ?? 0, body: e.returnRider } : undefined;
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} exiles ${defOf(s, o).name}${e.until === "sourceLeaves" ? ` until ${src} leaves the battlefield` : e.until === "targetLeaves" && me ? ` until ${defOf(s, me).name} leaves the battlefield` : e.until === "opponentMonarch" ? " until an opponent becomes the monarch" : ""}.`);
        // As it last existed, for "for each nontoken creature exiled this way" (CR 608.2h).
        const before = o.zone === "battlefield" ? { o: structuredClone(o), ch: structuredClone(characteristics(s, o)), controller: controllerOf(s, o) } : undefined;
        const fromYard = o.zone === "graveyard";
        moveObject(s, o.id, "exile");
        if (e.setsDid && o.zone === "exile" && s.resolving) s.resolving.did = true;
        if (before && o.zone === "exile" && s.resolving) (s.resolving.exiled ??= []).push(before);
        if (fromYard && o.zone === "exile" && s.resolving) (s.resolving.exiledCards ??= []).push(o.id);
        // A merged permanent's cards are all exiled with it, and found by what returns it (CR 730.3c).
        for (const l of newObjects(o)) {
          if (s.objects[l.id]?.zone !== "exile") continue;
          if (me) (me.exiledUntilLeaves ??= []).push(rider ? { ...l, rider } : l);
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
          if (e.youMay && !card.isToken) card.mayPlay = { player: ctx.controller, zc: card.zoneChanges ?? 0, until: e.youMay.thisTurn ? "thisTurn" : e.youMay.nextTurn ? "nextTurn" : e.youMay.whileControlled ? "whileControlled" : "exiled", turn: s.turn, ...(e.youMay.whileControlled && ctx.sourceId ? { source: { id: ctx.sourceId, zc: ctx.sourceZc ?? 0 } } : {}), ...(e.youMay.play ? {} : { castOnly: true as const }), ...(e.youMay.anyType ? { anyType: true as const } : {}), ...(e.youMay.colorlessAny ? { colorlessAny: true as const } : {}), ...(e.youMay.exileAfter ? { exileAfter: true as const } : {}) };
        }
      }
      return;
    }
    case "grantYardKeyword": {
      // Cursecloth Wrappings: the target card, still in its owner's graveyard (CR 608.2b), has embalm with its own mana cost
      // until end of turn; a card with no mana cost gets an ability it can't pay for (CR 118.6, see cards.ts).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "graveyard") continue;
        (s.yardKeywordGrants ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, keyword: e.keyword });
        log(s, `${defOf(s, o).name} gains ${e.keyword.toLowerCase()} until end of turn (${src}).`);
      }
      return;
    }
    case "grantYardKeywordEach": {
      // Ghost Ark: each matching card in its controller's graveyard as this resolves (CR 611.2c, rulings), unearth with
      // this cost until end of turn, while it's that card (CR 400.7).
      const cards = player(s, ctx.controller).graveyard.map((id) => obj(s, id)).filter((o) => printedMatches(e.filter, defOf(s, o)));
      for (const o of cards) (s.yardKeywordGrants ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, keyword: e.keyword, cost: e.cost });
      if (cards.length) log(s, `${cards.length > 2 ? `${cards.length} cards` : cards.map((o) => defOf(s, o).name).join(" and ")} ${cards.length === 1 ? "gains" : "gain"} ${e.keyword.toLowerCase()} ${e.cost} until end of turn (${src}).`);
      return;
    }
    case "grantYardCast": {
      // Filigree Racer, Songcrafter Mage: the target card, still in its owner's graveyard (CR 608.2b), may be cast from
      // there this turn with jump-start or harmonize (game.ts grantedCastUntilEot).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "graveyard") continue;
        (s.yardCastGrants ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, kind: e.kind });
        log(s, `${defOf(s, o).name} gains ${e.kind === "jumpStart" ? "jump-start" : "harmonize"} until end of turn (${src}).`);
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
      // Confession Dial: an escape cost made of the card's own mana cost; a card with none has no such cost and can't be cast
      // this way (as with flashback, rulings on Snapcaster Mage).
      const escapeOf = (o: GameObject) => (e.escape ? { mana: e.escape.mana ?? defOf(s, o).manaCost ?? "", exile: e.escape.exile } : undefined);
      for (const o of cards) {
        const escape = escapeOf(o);
        if (escape && !escape.mana) continue;
        (s.flashbackGrants ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, ...(escape ? { escape } : {}), ...(e.cast ? { cast: true as const } : {}), ...(e.mana && !escape && !e.cast ? { mana: e.mana } : {}) });
      }
      if (cards.length) log(s, `${cards.length > 2 ? `${cards.length} cards` : cards.map((o) => defOf(s, o).name).join(" and ")} ${cards.length === 1 ? "gains" : "gain"} ${e.escape ? `escape (${cards.length === 1 ? escapeOf(cards[0]!)!.mana : (e.escape.mana ?? "its mana cost")}, exile ${e.escape.exile} other cards from your graveyard)` : e.cast ? `"You may cast this card from your graveyard"` : e.mana ? `flashback ${e.mana}` : "flashback"} until end of turn.`);
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
      // Lich's Mastery: that many from the hand, the graveyard and the battlefield, any mix, one at a time; all of them when
      // there aren't more (rulings).
      const many = e.n !== undefined ? Math.max(0, amountNow(s, e.n, ctx)) : 1;
      const st = (sc.handOrPermanent ??= { queue: apnap(s, players(s, e.who, ctx)), picks: [], ...(e.n !== undefined ? { left: many } : {}) });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        const p = player(s, pid);
        const perms = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !st.picks.includes(id));
        const hand = p.hand.filter((id) => !st.picks.includes(id));
        const yard = e.graveyard ? p.graveyard.filter((id) => !st.picks.includes(id)) : [];
        const options = [...hand, ...yard, ...perms];
        const next = () => {
          st.queue.shift();
          if (e.n !== undefined) st.left = many;
        };
        if (p.lost || !options.length || st.left === 0) {
          next();
          continue;
        }
        if (st.left !== undefined && options.length <= st.left) {
          st.picks.push(...options);
          next();
          continue;
        }
        const which = st.left !== undefined && many > 1 ? ` (${many - st.left + 1} of ${many})` : "";
        s.pending = { kind: "chooseOption", player: pid, source: src, what: "exileHandOrPermanent", options, labels: [...hand.map((id) => `${defOf(s, obj(s, id)).name} (hand)`), ...yard.map((id) => `${defOf(s, obj(s, id)).name} (graveyard)`), ...perms.map((id) => nameOf(s, id))], prompt: e.graveyard ? `exile a permanent you control or a card from your hand or graveyard${which}` : "exile a card from your hand or a permanent you control" };
        return "paused";
      }
      sc.handOrPermanent = undefined;
      const gone = st.picks.filter((id) => ["hand", "battlefield", ...(e.graveyard ? ["graveyard"] : [])].includes(obj(s, id).zone));
      for (const id of gone) {
        const o = obj(s, id);
        log(s, `${player(s, o.zone === "battlefield" ? controllerOf(s, o) : o.owner).name} exiles ${o.zone === "hand" ? `${defOf(s, o).name} from their hand` : o.zone === "graveyard" ? `${defOf(s, o).name} from their graveyard` : nameOf(s, o.id)}.`);
      }
      enterTogether(s, () => {
        for (const id of gone) moveObject(s, id, "exile");
      });
      invalidateCharacteristics(s);
      return;
    }
    case "takeOneExiled": {
      // Dubious Challenge: the cards still exiled as the objects the dig made them (CR 400.7); the opponent may take one
      // (rulings: with one exiled card, they choose who gets it), then the rest are yours. Face up, so they see them.
      const sc = (s.resolving!.scratch ??= {});
      const live = (s.resolving?.dugExiled ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).map((l) => l.id);
      const who = players(s, e.who, ctx)[0];
      if (!live.length) return;
      if (who !== undefined && sc.takeExiled === undefined) {
        s.pending = { kind: "chooseOption", player: who, source: src, what: "takeExiled", options: [...live, "none"], labels: [...live.map((id) => defOf(s, obj(s, id)).name), "None"], prompt: `you may choose one of the exiled cards and put it onto the battlefield under your control; ${player(s, ctx.controller).name} gets the rest` };
        return "paused";
      }
      const pick = sc.takeExiled !== undefined && live.includes(sc.takeExiled) ? sc.takeExiled : undefined;
      sc.takeExiled = undefined;
      if (pick && who !== undefined) {
        log(s, `${player(s, who).name} puts ${defOf(s, obj(s, pick)).name} onto the battlefield under their control.`);
        moveObject(s, pick, "battlefield", { controller: who });
      } else if (who !== undefined) log(s, `${player(s, who).name} takes none of the exiled cards.`);
      const rest = live.filter((id) => id !== pick && s.objects[id]?.zone === "exile");
      if (rest.length) {
        log(s, `${player(s, ctx.controller).name} puts ${rest.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield under their control.`);
        enterTogether(s, () => rest.forEach((id) => moveObject(s, id, "battlefield", { controller: ctx.controller })));
      }
      return;
    }
    case "mayPlayLinked": {
      // Muse Vessel: one of the cards exiled with this object (as it is or last was, CR 400.7, 607.2a), chosen as this
      // resolves (CR 608.2d); its controller may play that one this turn, paying for it as usual.
      // King Narfi's Betrayal: every card still exiled with it, spells only, this turn, with mana of any type (CR 609.4b);
      // each with its usual timing (rulings), not again once it's a new object (CR 400.7).
      // Urianger Augurelt: every one of them, played (lands too), each spell {2} less (`less`).
      // Lobelia, Defender of Bag End: one of them, any, for free (`free`, `oneOf`): a group for this source and turn, one more
      // card of it allowed each time this resolves (GameObject.mayPlay.oneOfMax; GameState.oneOfUsed counts the plays).
      if (e.all) {
        const ids = linkedCards(s, ctx.sourceId, ctx.sourceZc).map((l) => l.id).filter((id) => s.objects[id]?.zone === "exile");
        const group = e.oneOf ? `linked:${ctx.sourceId}@${ctx.sourceZc ?? 0}:${s.turn}` : undefined;
        for (const id of ids) {
          const o = obj(s, id);
          const before = group && o.mayPlay?.oneOf === group && o.mayPlay.zc === (o.zoneChanges ?? 0) ? (o.mayPlay.oneOfMax ?? 1) : 0;
          o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.castOnly ? { castOnly: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.free ? { free: true as const } : {}), ...(e.less ? { less: e.less } : {}), ...(group ? { oneOf: group, oneOfMax: before + 1 } : {}) };
        }
        const verb = e.castOnly ? "cast" : "play";
        const what = e.oneOf ? `one of the cards exiled with ${src}` : ids.map((id) => (s.objects[id]?.hiddenExile ? "a face-down card" : defOf(s, obj(s, id)).name)).join(", ");
        return void log(s, ids.length ? `Until end of turn, ${player(s, ctx.controller).name} may ${verb} ${what}${e.free ? " without paying its mana cost" : ""}${e.less ? `, spells for {${e.less}} less` : ""}${e.anyType ? ", spending mana as though it were mana of any color" : ""}.` : `There's no card exiled with ${src}.`);
      }
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.impulseChoice) {
        const ids = linkedCards(s, ctx.sourceId, ctx.sourceZc).map((l) => l.id);
        sc.impulseChoice = { ids };
        if (!ids.length) return void log(s, `There's no card exiled with ${src}.`);
        if (ids.length > 1) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => defOf(s, obj(s, id)).name), prompt: "choose a card exiled with it; you may play it this turn" };
          return "paused";
        }
      }
      const st = sc.impulseChoice;
      sc.impulseChoice = undefined;
      const id = st.pick ?? st.ids[0];
      const o = id ? s.objects[id] : undefined;
      if (!o || o.zone !== "exile") return;
      o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
      log(s, `${player(s, ctx.controller).name} chooses ${defOf(s, o).name} and may play it this turn.`);
      return;
    }
    case "playLinked": {
      // The card this permanent's hideaway exiled, still the same object in exile (CR 400.7, 607.2a), played as this
      // resolves (rulings: it can't wait). Asked once; a land goes through "you may" since it isn't cast.
      const nowKey = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      // Spell Queller's leaves ability triggered after it moved: the object it links to is the one before (CR 400.7).
      const key = e.byOwner && !s.linkedExile?.[nowKey] ? `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}` : nowKey;
      const linked = e.revealed ? (s.resolving?.revealed ? [s.resolving.revealed] : []) : (s.linkedExile?.[key] ?? []);
      const from = e.revealed ? "library" : "exile";
      const live = linked.map((l) => ({ o: s.objects[l.id], zc: l.zc })).filter((x) => x.o && x.o.zone === from && (x.o.zoneChanges ?? 0) === x.zc).map((x) => x.o!);
      const sc = (s.resolving!.scratch ??= {});
      // Smuggler's Buggy: "If you do": the card offered was cast, so it's a spell on the stack now (CR 601.2a).
      if (e.setsDid && s.resolving) {
        const asked = sc.playLinked && sc.playLinkedId !== undefined ? s.objects[sc.playLinkedId] : undefined;
        s.resolving.did = asked?.zone === "stack";
        if (sc.playLinked) return;
      }
      // "Play one of them" (Evercoat Ursine): with more than one, its controller picks one first, or none.
      if (e.one && (live.length > 1 || sc.playLinkedPick)) {
        if (!sc.playLinkedPick) {
          sc.playLinkedPick = true;
          delete sc.found;
          const ids = live.map((o) => o.id);
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: "a card", cards: ids, min: 0, max: 1, dig: { looked: ids, to: "to play without paying its mana cost", rest: "stay in exile" } };
          return "paused";
        }
        const chosen = (sc.found ?? []).find((id) => live.some((o) => o.id === id));
        if (!chosen) return;
        live.splice(0, live.length, obj(s, chosen));
      }
      const card = live[0];
      if (!card) return;
      // Spell Queller: its owner casts it (a player who has left the game can't, CR 800.4a).
      const p = player(s, e.byOwner ? card.owner : ctx.controller);
      if (p.lost) return;
      const d = defOf(s, card);
      if (!sc.playLinked) {
        sc.playLinked = true;
        sc.playLinkedId = card.id;
        // "Cast the exiled card" (Smirking Spelljacker): a land card can't be cast (CR 305.9).
        if (isType(d, "Land") && e.castOnly) {
          log(s, `${d.name} can't be cast.`);
          return;
        }
        if (isType(d, "Land")) {
          // A land is played only on your turn, with a land play left (CR 305.2b, 305.3).
          if (s.activePlayer !== p.id || p.landsPlayedThisTurn >= landsAllowed(s, p.id) || nameLandBan(s, p.id, d)) {
            log(s, `${p.name} can't play ${d.name} now.`);
            return;
          }
          s.pending = { kind: "chooseMay", player: p.id, prompt: `play ${d.name} without paying its mana cost`, source: src, card: card.id };
          return "paused";
        }
        // Jadzi (round 409): for an alternative cost in mana (CR 118.9), paid as it's cast.
        s.pending = { kind: "castFree", player: p.id, objectId: card.id, source: src, ...(e.pay ? { pay: e.pay, ...(e.pay.kind === "mana" ? { how: "paid" as const } : {}) } : {}) };
        if (freeCastable(s, p.id, card.id, !!e.pay)) return "paused";
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
      // Clone Shell: the card is exiled; the rest go on the bottom in the order the actor chooses.
      // Discover the Impossible: the exiled card, cast as this resolves or not (CR 608.2g); not cast, it's put into its
      // owner's hand (the hidden card's name stays private).
      const castOrHand = (): "paused" | undefined => {
        const id = sc.faceDownCast;
        if (!e.castOrHand || id === undefined) return;
        if (!sc.faceDownCastAsked) {
          sc.faceDownCastAsked = true;
          s.pending = { kind: "castFree", player: p.id, objectId: id, source: src, how: "orHand", types: e.castOrHand.types, mv: { max: e.castOrHand.maxMv } };
          if (freeCastable(s, p.id, id)) return "paused";
          s.pending = null;
        }
        const o = s.objects[id];
        if (o?.zone === "exile") {
          moveObject(s, id, "hand");
          log(s, `${p.name} puts the exiled card into their hand.`);
          log(s, `You put ${defOf(s, obj(s, id)).name} into your hand.`, p.id);
        }
        sc.faceDownCast = undefined;
        return;
      };
      if (sc.faceDownCast !== undefined) return castOrHand();
      if (sc.faceDownBottom) return toBottom(s, p.id, sc.faceDownBottom.filter((id) => obj(s, id).zone === "library"), src, false);
      let ids: ObjectId[];
      let restBottom: ObjectId[] = [];
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
        // Counted for each player in turn: "all but the bottom six cards of their library" (Doomsday Excruciator).
        ids = (e.who ? players(s, e.who, ctx) : [p.id]).flatMap((pid) => player(s, pid).library.slice(0, Math.max(0, e.n === undefined ? 1 : amountNow(s, e.n, { ...ctx, eachOne: pid }))));
        if (e.pickOne) {
          // Siphon Insight: the actor looks at the cards and exiles the one they choose; the others go to the bottom of
          // their owner's library (one card left, so no order to choose). Nobody else learns which went where (rulings).
          // Urianger Augurelt (`optional`): "You may exile it face down": none at all, and the card left stays on top.
          if (!sc.faceDownPick) {
            if (!ids.length) return;
            if (ids.length > 1 || e.optional) {
              sc.faceDownPick = true;
              sc.faceDownLooked = ids;
              delete sc.found;
              s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards: ids, min: e.optional ? 0 : 1, max: 1, dig: { looked: ids, to: "to exile face down", rest: e.optional ? "back on top of your library" : e.bottomRandom ? "on the bottom of your library in a random order" : "on the bottom of that library" } };
              return "paused";
            }
            sc.found = ids;
            sc.faceDownLooked = ids;
          }
          sc.faceDownPick = undefined;
          const looked = (sc.faceDownLooked ?? ids).filter((id) => obj(s, id).zone === "library");
          sc.faceDownLooked = undefined;
          const chosen = (sc.found ?? []).filter((id) => looked.includes(id));
          if (e.optional) {
            if (!chosen.length) log(s, `${p.name} leaves the card on top of their library.`);
          } else if (e.bottomAnyOrder) restBottom = looked.filter((id) => !chosen.includes(id));
          else for (const id of ((r) => (e.bottomRandom && shuffle(s, r), r))(looked.filter((id) => !chosen.includes(id)))) {
            const owner = player(s, obj(s, id).owner);
            owner.library = [...owner.library.filter((x) => x !== id), id];
          }
          if (looked.length > chosen.length && !e.bottomAnyOrder && !e.optional) log(s, `${p.name} puts ${looked.length - chosen.length === 1 ? "a card" : `${looked.length - chosen.length} cards`} on the bottom of ${[...new Set(looked.map((id) => player(s, obj(s, id).owner).name))].join(" and ")}'s library${e.bottomRandom && looked.length - chosen.length > 1 ? " in a random order" : ""}.`);
          ids = chosen;
        }
      }
      const key = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      const done: ObjectId[] = [];
      const at = s.nextTimestamp;
      for (const id of ids) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        // Ethereal Valkyrie: "It becomes foretold" (CR 702.143a, d): its owner may look at it and cast it on a later turn for
        // the foretell cost it was given; they didn't foretell it, so nothing triggers on foretelling (rulings).
        if (e.foretold !== undefined) {
          o.foretold = true;
          o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "foretell", turn: s.turn, foretellReduce: e.foretold };
          done.push(id);
          continue;
        }
        // Face down: only its controller may look, if the ability says so or lets them play it (CR 406.3; rulings on
        // Gonti: "you may look at and play").
        o.hiddenExile = { by: ctx.sourceId ?? "", seen: e.look || e.play ? [p.id] : [], label: "Face down", at };
        // Grimoire Thief: any later controller of the source may look as well (rulings; GameState.exileLookWatch).
        if (e.lookControllers && ctx.sourceId) {
          o.hiddenExile.watch = { id: ctx.sourceId, zc: ctx.sourceZc ?? 0 };
          s.exileLookWatch = true;
        }
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
      log(s, `${p.name} exiles ${n === 1 ? "a card" : `${n} cards`} ${e.from === "top" ? `from the top of ${whose} library` : "from their hand"} face down with ${src}${e.play ? `, and may ${e.play.castOnly ? "cast" : "play"} ${n === 1 ? "it" : "them"}` : ""}${e.foretold !== undefined ? `. ${n === 1 ? "It becomes" : "They become"} foretold` : ""}.`);
      if ((e.look || e.play || e.pickOne) && n) log(s, `You exiled ${done.map((id) => defOf(s, obj(s, id)).name).join(", ")} face down with ${src}.`, p.id);
      if (restBottom.length) {
        sc.faceDownBottom = restBottom;
        return toBottom(s, p.id, restBottom, src, false);
      }
      if (e.castOrHand && done.length === 1) {
        sc.faceDownCast = done[0];
        return castOrHand();
      }
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
      let cards = linked.map((l) => obj(s, l.id)).filter((c) => (!e.yours || c.owner === ctx.controller) && !(e.other && s.resolving!.faceDownExiled?.includes(c.id)) && !((e.ifLinkedNow || e.exceptLinkedNow) && s.resolving!.linkedNow?.includes(c.id)));
      const p = player(s, ctx.controller);
      if (e.turnFaceUp)
        for (const c of cards.filter((c) => c.hiddenExile)) {
          // Clone Shell: turned face up for everyone to see (CR 406.3); a noncreature card stays exiled face up (rulings).
          delete c.hiddenExile;
          log(s, `${p.name} turns ${defOf(s, c).name} face up (${src}).`);
        }
      if (e.filter) {
        // "With mana value X" (Ashiok, Nightmare Weaver): the X of its loyalty cost.
        const filter = bindBound(s, e.filter, amountCtx(s, ctx));
        cards = cards.filter((c) => printedMatches(filter, defOf(s, c)));
      }
      if (e.one && e.random) {
        // Skyship Weatherlight: one at random as it resolves.
        if (!cards.length) return;
        const pick = cards[Math.floor(nextRandom(s) * cards.length)]!;
        // Wall of Mourning: a face-down card stays unknown to the players who may not look at it (CR 406.3).
        if (pick.hiddenExile && e.dest === "hand") {
          log(s, `${src} chooses a card at random.`);
          log(s, `${src} chooses ${defOf(s, pick).name} at random.`, pick.owner);
        } else log(s, `${src} chooses ${defOf(s, pick).name} at random.`);
        cards = [pick];
      } else if (e.exactly !== undefined && cards.length > e.exactly) {
        // Vault 13: exactly that many of them, chosen as it resolves; with that many or fewer, all of them.
        if (!sc.linkedPick) {
          // Bane Alley Broker: "You may look at cards exiled with ~": whoever controls it as this resolves (rulings).
          if (e.dest === "hand" && e.exactly === 1 && ctx.sourceId && s.objects[ctx.sourceId] && abilitiesOf(s, s.objects[ctx.sourceId]!).activated.some((a) => a.body.effects.some((x) => x.type === "exileFaceDown" && x.look)))
            for (const c of cards) if (c.hiddenExile && !c.hiddenExile.seen.includes(p.id)) c.hiddenExile.seen.push(p.id);
          sc.linkedPick = true;
          delete sc.found;
          const ids = cards.map((c) => c.id);
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `${e.exactly} cards exiled with ${src}`, cards: ids, min: e.exactly, max: e.exactly, dig: { looked: ids, to: e.dest === "hand" ? "into their owners' hands" : e.dest === "battlefield" ? "onto the battlefield" : "into their owners' graveyards", rest: "stay exiled for now" } };
          return "paused";
        }
        sc.linkedPick = undefined;
        cards = cards.filter((c) => sc.found?.includes(c.id));
      } else if (e.upTo !== undefined) {
        // Bag of Devouring: up to that many of them, chosen as it resolves.
        if (!sc.linkedPick) {
          const max = Math.min(cards.length, Math.max(0, amountNow(s, e.upTo, ctx)));
          if (!max) return;
          sc.linkedPick = true;
          delete sc.found;
          const ids = cards.map((c) => c.id);
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `up to ${max} card${max === 1 ? "" : "s"} exiled with ${src}`, cards: ids, min: 0, max, dig: { looked: ids, to: e.dest === "hand" ? "into their owners' hands" : e.dest === "battlefield" ? "onto the battlefield" : "into their owners' graveyards", rest: "stay exiled" } };
          return "paused";
        }
        sc.linkedPick = undefined;
        cards = cards.filter((c) => sc.found?.includes(c.id));
      } else if (e.one && sc.linkedTaken) {
        // The Grim Captain: picked before what it attacks was chosen.
        const taken = sc.linkedTaken;
        cards = cards.filter((c) => taken.includes(c.id));
      } else if (e.one) {
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
        if (e.attacking) sc.linkedTaken = cards.map((c) => c.id);
      }
      if (!cards.length) return;
      // The Grim Captain: "onto the battlefield under your control tapped and attacking": what it attacks chosen as it
      // enters, any opponent, planeswalker or battle, not necessarily what the source attacks (CR 508.4; rulings). Never
      // declared as an attacker, so "whenever ... attacks" doesn't trigger. Outside combat it enters tapped only.
      let attack: ReturnType<typeof attackChoices>[number] | undefined;
      if (e.attacking && e.dest === "battlefield") {
        const attackOptions = inCombat(s) && cards.some((c) => isType(defOf(s, c), "Creature")) ? attackChoices(s, ctx.controller, ctx.sourceId) : [];
        if (attackOptions.length > 1 && sc.attackWhom === undefined) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, cards[0]!).name} attacks` };
          return "paused";
        }
        attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
        sc.linkedTaken = undefined;
        sc.attackWhom = undefined;
      }
      if (e.dest === "battlefield") {
        // All at once (CR 608.2f), under this ability's controller's control.
        if (e.faceDown) log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} exiled with ${src} onto the battlefield face down: ${cards.length === 1 ? "a 2/2 Cyberman artifact creature" : "2/2 Cyberman artifact creatures"}.`);
        else log(s, `${e.ownersControl ? "" : `${p.name} puts `}${cards.map((c) => defOf(s, c).name).join(", ")} ${e.ownersControl ? `${cards.length === 1 ? "returns" : "return"} to the battlefield under ${cards.length === 1 ? "its owner's" : "their owners'"} control` : "onto the battlefield"} from exile (${src}).`);
        const ids = cards.map((c) => c.id);
        enterTogether(s, () => {
          for (const c of cards) {
            moveObject(s, c.id, "battlefield", { controller: e.ownersControl ? c.owner : p.id, putBy: p.id, ...(e.counters ? { counters: { ...e.counters } } : {}), ...(e.faceDown ? { faceDown: e.faceDown } : {}), ...(e.tapped || e.attacking ? { tapped: true } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: p.id, source: src } } : {}) }); // as it enters (CR 614.12)
            // Attacking as it enters, before its enters abilities trigger (CR 508.4).
            if (attack && (c.zone as string) === "battlefield" && objIsType(s, c, "Creature")) {
              c.attacking = attack.player;
              if (attack.planeswalker) c.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
            }
          }
        });
        const now = ids.filter((id) => obj(s, id).zone === "battlefield");
        if (e.gain && now.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: "game", affected: now, mods: [{ kind: "addKeywords", keywords: e.gain }] });
        // Emperor of Bones: "It gains haste. Sacrifice it at the beginning of the next end step." (CR 603.7, while it's that object).
        if (e.haste && now.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: p.id, sourceName: src, duration: e.haste, affected: now, mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
        if (e.atEndStep) for (const id of now) addDelayed(s, "nextEndStep", p.id, obj(s, id), { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "Sacrifice ~." });
        invalidateCharacteristics(s);
        if (s.linkedExile?.[key]) s.linkedExile[key] = s.linkedExile[key]!.filter((l) => !ids.includes(l.id));
        return;
      }
      if (e.dest === "hand") log(s, `${p.name} puts ${cards.length === 1 ? "a card" : `${cards.length} cards`} exiled with ${src} into their hand.`);
      else log(s, `${cards.map((c) => defOf(s, c).name).join(", ")} ${cards.length === 1 ? "goes" : "go"} from exile to ${cards.length === 1 ? "its owner's graveyard" : "their owners' graveyards"} (${src}).`);
      for (const c of cards) moveObject(s, c.id, e.dest);
      // Pinnacle Starcage: "for each card put into a graveyard this way": not one a replacement sent elsewhere.
      s.resolving!.movedLinked = e.countInGraveyard ? cards.filter((c) => obj(s, c.id).zone === "graveyard").length : cards.length;
      s.resolving!.movedLinkedIds = cards.map((c) => c.id);
      if (s.linkedExile?.[key]) s.linkedExile[key] = s.linkedExile[key]!.filter((l) => !cards.some((c) => c.id === l.id));
      return;
    }
    case "returnLinked": {
      // The leaves ability triggered after the source moved, so the object it links to is the one before (CR 400.7).
      // A Saga's chapter III (The Princess Takes Flight): the Saga is still there, the same object as its chapter I's.
      // Pyxis of Pandemonium: an activated ability's source, still there or just sacrificed for its cost.
      const nowKey = `${ctx.sourceId}@${ctx.sourceZc ?? 0}`;
      const key = e.here || (e.permanentCards && s.linkedExile?.[nowKey]) ? nowKey : `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const sc = (s.resolving!.scratch ??= {});
      if (e.permanentCards && !sc.flickered) {
        // Every linked card is turned face up (CR 406.3); the nonpermanent ones stay in exile.
        const all = (s.linkedExile?.[key] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
        for (const l of all) obj(s, l.id).hiddenExile = undefined;
        if (all.length) log(s, `${src} turns face up ${all.map((l) => defOf(s, obj(s, l.id)).name).join(", ")}.`);
        sc.flickered = all.filter((l) => isPermanentCard(defOf(s, obj(s, l.id))));
        delete s.linkedExile?.[key];
      }
      if (!sc.flickered) {
        sc.flickered = (s.linkedExile?.[key] ?? []).filter((l) => !s.objects[l.id]?.isToken);
        delete s.linkedExile?.[key];
      }
      const cards = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      if (e.dest === "hand" || e.dest === "graveyard") {
        for (const c of cards) {
          // Induced Amnesia: a face-down card returned to a hand stays unknown to the others (CR 406.3).
          if (c.hiddenExile && e.dest === "hand") {
            log(s, `${src} returns a card to ${player(s, c.owner).name}'s hand.`);
            log(s, `${src} returns ${defOf(s, c).name} to your hand.`, c.owner);
          } else log(s, `${src} returns ${defOf(s, c).name} to its owner's ${e.dest}.`);
          moveObject(s, c.id, e.dest);
        }
        return;
      }
      // Under their owners' control; an Aura's owner chooses what it enchants (CR 303.4f, Oblivion Ring rulings).
      return returnFromExile(s, cards, (c) => (e.yours ? ctx.controller : c.owner), src, undefined, e.tapped);
    }
    case "pick":
      return pickPermanents(s, e, ctx, src);
    case "sacrificeEach":
      return sacrificeEach(s, e, ctx, src);
    case "randomCounterKind": {
      const o = objects(s, e.what, ctx)[0];
      if (!o || o.zone !== "battlefield") return;
      // Only the counters on it count: a keyword it has from elsewhere still leaves that kind eligible (rulings).
      const kinds = e.kinds.filter((k) => !((o.counters[k] ?? 0) > 0));
      if (!kinds.length) {
        log(s, `${defOf(s, o).name} already has every kind of counter it could get.`);
        return;
      }
      const k = kinds[Math.floor(nextRandom(s) * kinds.length)]!;
      log(s, `${src} chooses a ${k} counter at random.`);
      withPutter(ctx.controller, () => putCounters(s, o, k, 1));
      invalidateCharacteristics(s);
      return;
    }
    case "sacrificeRandom":
      for (const pid of apnap(s, players(s, e.who, ctx)))
        for (;;) {
          const own = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
          if (!own.length) break;
          const id = own[Math.floor(nextRandom(s) * own.length)]!;
          // One that can't be sacrificed is still chosen, then nothing more happens (rulings).
          if (!canBeSacrificed(s, obj(s, id))) {
            log(s, `${player(s, pid).name} chooses ${defOf(s, obj(s, id)).name} at random, which can't be sacrificed.`);
            break;
          }
          const land = objIsType(s, obj(s, id), "Land");
          log(s, `${player(s, pid).name} sacrifices ${defOf(s, obj(s, id)).name} (chosen at random).`);
          moveObject(s, id, "graveyard", { sacrificed: true });
          if (!e.repeatNonland || land) break;
        }
      return;
    case "destroyRandom": {
      // Metzali: chosen at random as it resolves, then destroyed (an indestructible one is chosen and survives, rulings).
      // Haphazard Bombardment: only among those without indestructible (rulings, CR 702.12b), chosen and destroyed with
      // nothing in between (rulings).
      const options = s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false) && !(e.destroyable && objHasKeyword(s, obj(s, id), "indestructible")));
      if (!options.length) return;
      const id = options[Math.floor(nextRandom(s) * options.length)]!;
      log(s, `${src} chooses ${nameOf(s, id)} at random.`);
      destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
      return;
    }
    case "chooseRandom": {
      // Cinderheart Giant: chosen at random as it resolves among those it could be (rulings: not targeted).
      const options = s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      s.resolving!.created = [];
      if (!options.length) return;
      const id = options[Math.floor(nextRandom(s) * options.length)]!;
      log(s, `${src} chooses ${nameOf(s, id)} at random.`);
      s.resolving!.created = [id];
      return;
    }
    case "keepRest":
      return keepRest(s, e, ctx, src);
    case "keepDestroyRest": {
      // Mount Doom: chosen as it resolves (CR 608.2d), then the rest destroyed at once.
      const sc = (s.resolving!.scratch ??= {});
      const all = () => s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      if (e.random) {
        // Last One Standing: one at random, then the rest at once, with nothing in between (rulings).
        const options = all();
        if (!options.length) return;
        const keep = options[Math.floor(nextRandom(s) * options.length)]!;
        log(s, `${src} chooses ${nameOf(s, keep)} at random.`);
        for (const id of options.filter((x) => x !== keep)) destroyPermanent(s, obj(s, id), `${src} destroys ${nameOf(s, id)}.`, false, ctx.controller);
        return;
      }
      if (!sc.chosen?.[ctx.controller]) {
        const options = all();
        if (!options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "keep", what: e.filter.text, options, count: Math.min(e.n, options.length), ...(e.exactly ? {} : { min: 0 }), destroy: true };
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
    case "returnOneElsewhere": {
      const sc = (s.resolving!.scratch ??= {});
      const cards = objects(s, e.what, ctx).filter((o) => o.zone === "graveyard");
      if (!sc.found) {
        const options = cards.filter((o) => printedMatches(e.onto, defOf(s, o))).map((o) => o.id);
        if (options.length) {
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `up to one ${e.onto.text}`, cards: options, min: 0, max: 1, dig: { looked: options, to: "to put onto the battlefield instead of into your hand", rest: "go to your hand" } };
          return "paused";
        }
        sc.found = [];
      }
      const chosen = sc.found.find((id) => cards.some((o) => o.id === id));
      sc.found = undefined;
      s.resolving!.chosenFromYard = chosen ? { id: chosen, zc: obj(s, chosen).zoneChanges ?? 0 } : undefined;
      // The rest go to the hand first: the chosen card enters as it would have with them all moving at once, the others
      // already gone from the graveyard.
      for (const o of cards) {
        if (o.id === chosen) continue;
        log(s, `${src} returns ${defOf(s, o).name} from the graveyard to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      return;
    }
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
        const from = o.zone === "battlefield" ? controllerOf(s, o) : undefined;
        moveObject(s, o.id, "hand");
        if (!token && s.objects[o.id]?.zone === "hand" && s.resolving) (s.resolving.returnedToHand ??= []).push(o.id);
        // A token goes to the hand too, then ceases to exist (CR 111.7, 704.5d).
        if (from !== undefined && s.resolving && (token || s.objects[o.id]?.zone === "hand")) (s.resolving.returnedFrom ??= []).push(from);
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
        // Behold: or choose a permanent you control with that quality (CR 701.4a).
        if (e.orControl && filter) cards.push(...s.battlefield.filter((id) => objectMatches(s, { ...filter, kind: "object", controller: "you" }, obj(s, id), p.id, false)));
        s.resolving!.revealedFromHand = 0;
        if (!cards.length) {
          log(s, e.bottom ? `${p.name} has no cards in hand to put on the bottom of their library.` : e.shuffle ? `${p.name} has no cards in hand to shuffle into their library.` : `${p.name} reveals no cards.`);
          return;
        }
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: e.one ? `${/^[aeiou]/i.test(e.filter?.text ?? "card") ? "an" : "a"} ${e.filter?.text ?? "card"}` : e.max !== undefined ? `up to ${e.max} ${e.filter?.text ?? "card"}s` : `any number of ${e.filter?.text ?? "card"}s`, cards, min: e.must ? 1 : 0, max: e.one ? 1 : Math.min(e.max ?? cards.length, cards.length), fromHand: true, ...(e.bottom ? { bottom: true as const } : e.shuffle ? { shuffle: true as const } : { reveal: true as const }), ...(e.orControl ? { behold: true as const } : {}) };
        return "paused";
      }
      const chosen = sc.found.filter((id) => e.orControl && s.objects[id]?.zone === "battlefield" && controllerOf(s, obj(s, id)) === p.id);
      const shown = sc.found.filter((id) => p.hand.includes(id)).slice(0, e.max ?? Infinity);
      sc.found = undefined;
      if (chosen.length) {
        s.resolving!.revealedFromHand = chosen.length;
        log(s, `${p.name} beholds ${chosen.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
        return;
      }
      s.resolving!.revealedFromHand = shown.length;
      if (e.shuffle) {
        // Credit Voucher: into the library, then it's shuffled (CR 701.24a), even with none chosen.
        for (const id of shown) moveObject(s, id, "library");
        shuffleLibrary(s, p);
        log(s, `${p.name} shuffles ${shown.length === 1 ? "a card" : `${shown.length} cards`} from their hand into their library.`);
        return;
      }
      if (!e.bottom) s.resolving!.revealedFromHandIds = shown;
      if (e.bottom) {
        // In the order picked, the first lowest (its owner orders them, CR 401.4).
        for (const id of [...shown].reverse()) moveObject(s, id, "library");
        log(s, `${p.name} puts ${shown.length === 1 ? "a card" : `${shown.length} cards`} from their hand on the bottom of their library.`);
        return;
      }
      log(s, shown.length ? `${p.name} ${e.orControl ? "beholds" : "reveals"} ${shown.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their hand.` : `${p.name} ${e.orControl ? "beholds nothing" : "reveals no cards"}.`);
      return;
    }
    case "struggleForHand": {
      // Struggle for Sanity: the hand was revealed; its owner exiles one card, then you do, until none is left (exiled face
      // up, CR 406.3); then the owner's go back to their hand and yours to their graveyard (CR 608.2c).
      const pid = players(s, e.who, ctx).find((x) => !player(s, x).lost);
      if (pid === undefined) return;
      const them = player(s, pid);
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.struggle ??= { theirs: [], yours: [], next: "them" });
      while (them.hand.length) {
        const picker = st.next === "them" ? pid : ctx.controller;
        const pick = them.hand.length === 1 ? them.hand[0]! : st.pick !== undefined && them.hand.includes(st.pick) ? st.pick : undefined;
        st.pick = undefined;
        if (pick === undefined) {
          s.pending = { kind: "chooseOption", player: picker, source: src, what: "struggleExile", options: [...them.hand], labels: them.hand.map((id) => defOf(s, obj(s, id)).name), prompt: st.next === "them" ? `exile a card from your hand (it returns to your hand afterwards)` : `exile a card from ${them.name}'s hand (it goes to their graveyard afterwards)` };
          return "paused";
        }
        moveObject(s, pick, "exile");
        log(s, `${player(s, picker).name} exiles ${defOf(s, obj(s, pick)).name} from ${them.name}'s hand.`);
        (st.next === "them" ? st.theirs : st.yours).push(pick);
        st.next = st.next === "them" ? "you" : "them";
      }
      const back = st.theirs.filter((id) => s.objects[id]?.zone === "exile");
      const rest = st.yours.filter((id) => s.objects[id]?.zone === "exile");
      for (const id of back) moveObject(s, id, "hand");
      for (const id of rest) moveObject(s, id, "graveyard");
      if (back.length || rest.length) log(s, `${them.name} returns ${back.length} card${back.length === 1 ? "" : "s"} to their hand and puts ${rest.length} into their graveyard.`);
      return;
    }
    case "destroyEachUnlessLife": {
      // Giant Albatross: the creatures as it begins (CR 608.2c), their controllers deciding in APNAP order, one creature at
      // a time; paying needs that much life (CR 119.4). Then the rest are destroyed at once.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.unlessLife) {
        const all = objects(s, e.what, ctx);
        const order = apnap(s, s.turnOrder);
        all.sort((a, b) => order.indexOf(controllerOf(s, a)) - order.indexOf(controllerOf(s, b)));
        sc.unlessLife = { ids: all.map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 })), i: 0, doomed: [] };
      }
      const st = sc.unlessLife;
      for (; st.i < st.ids.length; st.i++) {
        const at = st.ids[st.i]!;
        const o = s.objects[at.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== at.zc) continue;
        const who = controllerOf(s, o);
        const name = defOf(s, o).name;
        let answer = st.answer;
        st.answer = undefined;
        if (answer === undefined && payableLife(s, who) < e.life) answer = "none";
        if (answer === undefined) {
          s.pending = { kind: "chooseOption", player: who, source: src, what: "payLifeOrDestroy", about: o.id, options: ["pay", "none"], labels: [`Pay ${e.life} life`, `Let ${name} be destroyed`], prompt: `pay ${e.life} life, or ${name} is destroyed${e.noRegen ? " (it can't be regenerated)" : ""}?` };
          return "paused";
        }
        if (answer === "pay") {
          payLife(s, who, e.life);
          log(s, `${player(s, who).name} pays ${e.life} life for ${name}.`);
        } else st.doomed.push(o.id);
      }
      const doomed = st.doomed.filter((id) => s.objects[id]?.zone === "battlefield");
      if (!doomed.length) return;
      s.resolving!.created = doomed;
      return runEffect(s, { type: "destroy", what: { ref: "created" }, ...(e.noRegen ? { noRegen: true as const } : {}) }, ctx);
    }
    case "alternatePicks": {
      // Memories Returning: revealed (CR 701.20a) and kept on top until picked; each step from those still there.
      const sc = (s.resolving!.scratch ??= {});
      const you = player(s, ctx.controller);
      if (!sc.alternate) {
        const ids = you.library.slice(0, e.n);
        log(s, `${you.name} reveals ${ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from the top of their library.`);
        sc.alternate = { ids, step: 0 };
      }
      const st = sc.alternate;
      for (;;) {
        const left = st.ids.filter((id) => you.library.includes(id));
        if (!left.length || st.step >= e.steps.length) return;
        const step = e.steps[st.step]!;
        // "Then choose an opponent": before the first step that's theirs.
        if (step === "bottom" && st.opp === undefined) {
          const opps = opponents(s, you.id);
          if (!opps.length) return;
          if (opps.length === 1) {
            st.opp = opps[0];
            log(s, `${you.name} chooses ${player(s, st.opp!).name}.`);
          } else if (s.resolving!.chosen?.player !== undefined && opps.includes(s.resolving!.chosen.player)) st.opp = s.resolving!.chosen.player;
          else {
            s.pending = { kind: "chooseOption", player: you.id, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt: `choose an opponent to put cards on the bottom of your library` };
            return "paused";
          }
        }
        const last = st.step === e.steps.length - 1 && step === "hand" && left.length === 1;
        const picker = step === "hand" ? you.id : st.opp!;
        const pick = left.length === 1 ? left[0]! : st.pick !== undefined && left.includes(st.pick) ? st.pick : undefined;
        st.pick = undefined;
        if (pick === undefined) {
          s.pending = { kind: "chooseOption", player: picker, source: src, what: "alternatePick", options: left, labels: left.map((id) => defOf(s, obj(s, id)).name), prompt: step === "hand" ? `put one of the revealed cards into your hand` : `put one of the cards ${you.name} revealed on the bottom of their library` };
          return "paused";
        }
        if (step === "hand") {
          moveObject(s, pick, "hand");
          log(s, `${you.name} puts ${defOf(s, obj(s, pick)).name} into their hand${last ? " (the last one)" : ""}.`);
        } else {
          you.library.splice(you.library.indexOf(pick), 1);
          you.library.push(pick);
          log(s, `${player(s, picker).name} puts ${defOf(s, obj(s, pick)).name} on the bottom of ${you.name}'s library.`);
        }
        // No longer among those revealed and still to be picked.
        st.ids = st.ids.filter((id) => id !== pick);
        st.step++;
      }
    }
    case "predicament": {
      // Master of Predicaments (rulings): the card chosen without revealing it; the guess made blind; nothing revealed
      // unless it's cast.
      const sc = (s.resolving!.scratch ??= {});
      const you = player(s, ctx.controller);
      const guesser = players(s, e.who, ctx).find((pid) => !player(s, pid).lost);
      if (guesser === undefined) return;
      const st = (sc.predicament ??= {});
      if (st.card === undefined) {
        if (!you.hand.length) return log(s, `${you.name} has no card in hand to choose.`);
        s.pending = { kind: "chooseOption", player: you.id, source: src, what: "predicamentCard", options: [...you.hand], labels: you.hand.map((id) => defOf(s, obj(s, id)).name), prompt: `choose a card in your hand: ${player(s, guesser).name} guesses whether its mana value is greater than ${e.over}; if they guess wrong, you may cast it without paying its mana cost` };
        return "paused";
      }
      if (st.guess === undefined) {
        s.pending = { kind: "chooseOption", player: guesser, source: src, what: "predicamentGuess", options: ["over", "notOver"], labels: [`Greater than ${e.over}`, `${e.over} or less`], prompt: `${you.name} chose a card in their hand. Guess whether its mana value is greater than ${e.over}: if you guess wrong, they may cast it without paying its mana cost` };
        return "paused";
      }
      if (st.offered) return;
      st.offered = true;
      const o = s.objects[st.card.id];
      if (!o || o.zone !== "hand" || (o.zoneChanges ?? 0) !== st.card.zc) return;
      // A split card's mana value is that of both halves together (CR 709.4, rulings).
      const right = (defMv(defOf(s, o)) > e.over) === (st.guess === "over");
      if (right) return log(s, `${player(s, guesser).name} guessed right.`);
      log(s, `${player(s, guesser).name} guessed wrong.`);
      s.pending = { kind: "castFree", player: you.id, objectId: o.id, source: src };
      if (!isType(defOf(s, o), "Land") && freeCastable(s, you.id, o.id)) return "paused";
      s.pending = null;
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
        s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src, how: "paid", ...(e.anyType ? { anyType: true as const } : {}), ...(e.addedMana ? { addedMana: e.addedMana } : {}), ...(e.thenNoMore ? { thenNoMore: true as const } : {}), ...(e.exileAfter ? { exileAfter: true as const } : {}) };
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
      // Ogre Battlecaster (round 401): "that spell's mana value", as it was cast (CR 202.3).
      if (cast && e.addedMana) {
        const item = s.stack.find((x) => x.objectId === o.id);
        s.resolving!.castThisWayMv = item ? spellManaValue(s, item) : characteristics(s, o).manaValue;
      }
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
        if (o.zone !== (e.inExile ? "exile" : "graveyard")) continue;
        // Mosswood Dreadknight: as its Adventure, until the end of its controller's next turn (cleanup ends it).
        if (e.asAdventure) {
          if (layoutOf(s, o) !== "adventure") continue;
          o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "nextTurn", turn: s.turn, castOnly: true, face: 1 };
          log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, o).name} from their graveyard as an Adventure until the end of their next turn.`);
          continue;
        }
        o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.play ? {} : { castOnly: true as const }), ...(e.exileAfter ? { exileAfter: true as const } : {}), ...(e.bottomAfter ? { bottomAfter: true as const } : {}), ...(e.free ? { free: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.tapped ? { tapped: true as const } : {}), ...(e.moreUnlessTargets ? { moreUnlessTargets: e.moreUnlessTargets } : {}) };
        log(s, `${player(s, ctx.controller).name} may ${e.play ? "play" : "cast"} ${defOf(s, o).name} from ${e.inExile ? "exile" : "their graveyard"} this turn${e.free ? " without paying its mana cost" : ""}${e.anyType ? ", spending mana of any type" : ""}${e.tapped ? " (it enters tapped)" : ""}.`);
      }
      return;
    }
    case "exileHand": {
      // "Exile all cards from all hands" (Decree of Annihilation): each player's in turn.
      const all = e.who ? players(s, e.who, ctx) : [ctx.controller];
      let total = 0;
      for (const whose of all) {
        const p = player(s, whose);
        const ids = [...p.hand];
        total += ids.length;
        for (const id of ids) {
          moveObject(s, id, "exile");
          const o = obj(s, id);
          if (e.until) o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn };
          // Wheel of Potential: only the cards its controller owns, with seven or more energy paid.
          else if (e.mayPlayIfNoted !== undefined && (s.resolving?.notedAmount ?? 0) >= e.mayPlayIfNoted && o.owner === ctx.controller && o.zone === "exile") o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "nextTurn", turn: s.turn };
          // Face up (CR 406.3); "the exiled cards" of its leaves ability (Wormfang Behemoth).
          if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
        }
        log(s, ids.length ? `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their hand${e.until ? " and may play them until the end of their next turn" : ""}.` : `${p.name} has no cards in hand to exile.`);
      }
      s.resolving!.exiledFromHand = total;
      return;
    }
    case "putFromHand": {
      if (e.who) return eachPutFromHand(s, e, ctx, src);
      // The player picks as it resolves, among the matching cards in their hand (CR 608.2d); it isn't playing a land.
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      // Zara: from another player's hand (looked at just before), under your control.
      const from = e.fromHandOf ? players(s, e.fromHandOf, ctx)[0] : p.id;
      if (from === undefined || player(s, from).lost) return;
      // Aura swap (CR 702.65): the source, still on the battlefield as the same object, yours (you own and control it),
      // and what it's attached to; with neither half of the exchange possible, nothing happens (702.65b).
      const swapper = e.auraSwap && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const swapFrom = swapper?.zone === "battlefield" && (ctx.sourceZc === undefined || (swapper.zoneChanges ?? 0) === ctx.sourceZc) && swapper.owner === p.id && controllerOf(s, swapper) === p.id ? swapper : undefined;
      const swapHost: AuraHost | undefined = swapFrom?.attachedTo && s.objects[swapFrom.attachedTo]?.zone === "battlefield" ? { attachTo: swapFrom.attachedTo } : swapFrom?.attachedToPlayer !== undefined ? { attachToPlayer: swapFrom.attachedToPlayer } : undefined;
      const swapFits = (id: ObjectId) => !!swapHost && auraHostOptions(s, obj(s, id), p.id).some((h) => auraHostKey(h) === auraHostKey(swapHost));
      if (e.auraSwap && !swapHost) {
        s.resolving!.did = false;
        log(s, `${src} can't be exchanged.`);
        return;
      }
      if (!sc.found) {
        // Belbe's Portal: "a creature card of the chosen type", the type chosen as its source entered.
        const filter = e.filter && bindBound(s, e.filter.chosen === "type" ? bindChosen(e.filter, ctx.chosen) : e.filter, amountCtx(s, ctx));
        // "With lesser power" (Shadowfax): its power in your hand, less than the source's, or the source's as it last
        // existed on the battlefield (rulings).
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        const most = !e.lesserPower ? Infinity : me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? power(s, me) : (ctx.lki?.power ?? (ctx.sourceId ? s.lastKnown?.[ctx.sourceId]?.power : undefined) ?? -Infinity);
        // Cryptic Gateway: sharing a creature type with each creature tapped, each as it is now or last existed (CR 608.2h).
        const tapped = (ctx.costTapped ?? []).map((t) => {
          const o = s.objects[t.id];
          const now = o?.zone === "battlefield" && (o.zoneChanges ?? 0) === t.zc ? creatureTypesOf(s, o) : undefined;
          return now ?? (t.types === "all" ? "all" : new Set(t.types));
        });
        const kin = (id: ObjectId) => !e.kinOfCostTapped || (tapped.length > 0 && tapped.every((t) => shareCreatureType(t, creatureTypesOf(s, obj(s, id)))));
        const cards = [...player(s, from).hand, ...(e.orGraveyard ? p.graveyard : [])].filter((id) => (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (!e.lesserPower || power(s, obj(s, id)) < most) && (!e.auraSwap || swapFits(id)) && kin(id) && (!e.hostableAuras || !defOf(s, obj(s, id)).subtypes.includes("Aura") || auraHostOptions(s, obj(s, id), p.id).length > 0));
        const upTo = e.upTo === undefined ? Infinity : amountNow(s, e.upTo, ctx);
        // "You may put a land card from your hand onto the battlefield. If you don't, ..." (Hakbal): whether one was put.
        s.resolving!.did = false;
        if (!cards.length || upTo <= 0) return;
        // Manabond: "put all land cards from it onto the battlefield": each one, nothing chosen.
        if (e.all) sc.found = cards;
        else {
          const what = `${e.upTo !== undefined ? `up to ${upTo} ` : e.any ? "any number of " : /^[aeiou]/i.test(e.filter?.text ?? "card") ? "an " : "a "}${e.filter?.text ?? "card"}${e.any ? "s" : ""}${e.orGraveyard ? (e.any || e.upTo !== undefined ? " from your hand and/or graveyard" : " from your hand or graveyard") : ""}`;
          // Another player's hand: all of it shown, the cards that fit to choose from.
          if (from !== p.id) s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.may ? 0 : 1, max: 1, hand: from, dig: { looked: [...player(s, from).hand], to: `from ${player(s, from).name}'s hand to put onto the battlefield under your control${e.tapped ? ", tapped" : ""}${e.attacking ? " and attacking" : ""}`, rest: `stay in ${player(s, from).name}'s hand` } };
          else s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: e.may ? 0 : 1, max: e.any ? Math.min(cards.length, upTo) : 1, fromHand: true, ...(e.auraSwap ? { swap: true as const } : {}), ...(e.oneOfEach ? { oneOfEach: e.oneOfEach } : {}) };
          return "paused";
        }
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => (o.zone === "hand" || (e.orGraveyard && o.zone === "graveyard")) && o.owner === from);
      if (e.auraSwap) {
        // The exchange happens at once (rulings): the source to its owner's hand, the Aura card attached to what it enchanted.
        const card = cards.find((o) => swapFits(o.id));
        s.resolving!.did = !!card;
        if (!card || !swapFrom || !swapHost) return;
        log(s, `${p.name} exchanges ${defOf(s, swapFrom).name} with ${defOf(s, card).name} from their hand, enchanting ${auraHostName(s, swapHost)}.`);
        enterTogether(s, () => {
          moveObject(s, swapFrom.id, "hand");
          moveObject(s, card.id, "battlefield", { controller: p.id, ...swapHost });
        });
        return;
      }
      // "Tapped and attacking" (CR 508.4): only during combat, attacking a player its controller chooses as it enters (it
      // was never declared as an attacker, rulings on Kinscaer Sentry); outside combat it's only tapped (CR 506.3d).
      // "Attacking that opponent" (Kaalia): the player its creature attacked, even if it's attacking something else now, and
      // with that player gone, it isn't attacking (rulings).
      const eventFoe = e.attackingEvent ? ctx.event?.player : undefined;
      // Summoner's Grimoire: tapped and attacking only if it's an enchantment card.
      const fits = (o: GameObject) => !e.onlyIf || printedMatches(e.onlyIf, defOf(s, o));
      // Tezzeret, Cruel Machinist: face down as 5/5 artifact creatures, all at once, whatever the cards are; which cards
      // they are is hidden from everyone but their controller (CR 708.2a, 708.5, rulings).
      if (e.faceDown) {
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const o of cards) {
            moveObject(s, o.id, "battlefield", { controller: p.id, faceDown: e.faceDown });
            if (o.zone === "battlefield") s.resolving?.created?.push(o.id);
          }
        });
        const n = cards.filter((o) => o.zone === "battlefield").length;
        log(s, `${p.name} puts ${n === 1 ? "a card" : `${n} cards`} from their hand onto the battlefield face down: ${n === 1 ? "a" : "each a"} 5/5 artifact creature.`);
        s.resolving!.did = n > 0;
        return;
      }
      const attackOptions = !e.attacking || !cards.some((o) => isType(defOf(s, o), "Creature") && fits(o)) ? [] : e.fromHandOf ? attackChoices(s, p.id, ctx.sourceId).filter((a) => a.player === from) : e.attackingEvent ? (eventFoe !== undefined && eventFoe !== p.id && !player(s, eventFoe).lost && attackChoices(s, p.id, ctx.sourceId).length ? [{ key: String(eventFoe), label: player(s, eventFoe).name, player: eventFoe }] : []) : attackChoices(s, p.id, ctx.sourceId);
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
      // Holy Avenger: the trigger's creature, if it's still on the battlefield as that object (CR 400.7).
      const subject = e.attachToSubject ? objects(s, { ref: "subject" }, ctx).find((o) => o.zone === "battlefield") : undefined;
      // Evershrike: the permanent the source card became as this returned it (CR 400.7).
      const returned = e.attachToReturned ? objects(s, { ref: "selfCard", returned: true }, ctx)[0] : undefined;
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: p.id })), src, e.attachToSelf ? (self?.id ?? null) : e.attachToReturned ? (returned?.id ?? null) : e.attachToSubject ? (subject?.id ?? null) : undefined);
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
          const attacks = defender !== undefined && isType(defOf(s, o), "Creature") && fits(o);
          const tapped = e.tapped && fits(o);
          log(s, `${p.name} puts ${defOf(s, o).name} from ${from === p.id ? "their" : `${player(s, from).name}'s`} ${o.zone} onto the battlefield${tapped ? ", tapped" : ""}${attacks ? ` and attacking ${attack!.label}` : ""}${host ? ` enchanting ${auraHostName(s, host)}` : ""}${equip ? ` attached to ${defOf(s, self!).name}` : e.attachToSelf && !host ? ", unattached" : ""}.`);
          // The First Tyrannic War: the number counted now, as it resolves; the {X} judged as it enters (game.ts).
          const ifX = e.countersIfXCost ? { countersIfXCost: { [e.countersIfXCost.counter]: Math.max(0, amountNow(s, e.countersIfXCost.n, ctx)) } } : {};
          moveObject(s, o.id, "battlefield", { controller: p.id, ...(tapped ? { tapped: true } : {}), ...(e.counters ? { counters: e.counters } : {}), ...ifX, ...host, ...equip });
          if (attacks && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
            o.attacking = defender;
            if (attack?.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
          }
          if (o.zone !== "battlefield") continue;
          if (me) o.putBy = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
          s.resolving?.created?.push(o.id);
          // Deathrender: attached if it could be, otherwise it stays unattached (CR 701.3b; rulings).
          if (e.attachSelf && self) attachTo(s, self, o);
          // The Invincible Iron Man: an Equipment attached to the source after it enters, if it could be (CR 701.3b).
          if (e.equipToSelf && self && objIsType(s, o, "Artifact") && characteristics(s, o).subtypes.includes("Equipment")) attachTo(s, o, self);
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
      // Coffin Queen: "When ~ becomes untapped or you lose control of ~, exile that creature" watches it the same way.
      const watchSelf = e.sacrificeOnLostControl === true || !!e.exileOnUntapOrLostControl;
      const watch = watchSelf ? (ctx.sourceId ? s.objects[ctx.sourceId] : undefined) : undefined;
      const watched = watchSelf ? (watch?.zone === "battlefield" && (ctx.sourceZc === undefined || (watch.zoneChanges ?? 0) === ctx.sourceZc) ? { id: watch.id, zc: watch.zoneChanges ?? 0 } : undefined) : e.sacrificeOnLostControl === true ? undefined : e.sacrificeOnLostControl;
      if (e.atNextEndStep) {
        // Seraph: "put that card onto the battlefield under your control at the beginning of the next end step" (CR 603.7),
        // if it's still that card then.
        const { atNextEndStep: _, ifSourceHere, mayThen, ...later } = e;
        // Shirei: "you may return that card ... if ~ is still on the battlefield": the source as the object it was when this
        // ability triggered (CR 400.7, rulings), and the choice made as the delayed trigger resolves.
        const here = ifSourceHere && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        for (const o of list) {
          const put: Effect = { ...later, what: { ref: "subjectCard" }, ...(watched ? { sacrificeOnLostControl: watched } : { sacrificeOnLostControl: undefined }) };
          const text = `${mayThen ? "you may put" : "Put"} ${defOf(s, o).name} onto the battlefield under your control`;
          const may: Effect = mayThen ? { type: "may", effects: [put], text: `put ${defOf(s, o).name} onto the battlefield` } : put;
          addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [ifSourceHere ? { type: "if", cond: { kind: "selfHere" }, effects: [may] } : may], text: `${ifSourceHere ? `If ${here ? defOf(s, here).name : "its source"} is still on the battlefield, ` : ""}${text}.`.replace(/^./, (c) => c.toUpperCase()) }, ctx.sourceId && s.objects[ctx.sourceId] ? cardIdOf(s.objects[ctx.sourceId]!) : cardIdOf(o));
          if (ifSourceHere) s.delayed![s.delayed!.length - 1]!.source = here ? { id: here.id, zc: ctx.sourceZc ?? here.zoneChanges ?? 0 } : { id: "none", zc: 0 };
        }
        return;
      }
      const toPlayer = e.under ? players(s, e.under, ctx).find((p) => !player(s, p).lost) : undefined;
      if (e.under && toPlayer === undefined) return;
      const under = (o: GameObject) => (toPlayer !== undefined ? toPlayer : e.owner ? o.owner : ctx.controller);
      // Endless Whispers: "that player puts ~ ... onto the battlefield under their control": they put it there (GameObject.putter).
      const putter = e.putByUnder && toPlayer !== undefined ? toPlayer : ctx.controller;
      if (e.faceDown) {
        // Yedora: face down as a Forest land, whatever the card is (CR 708.2a); not an Aura there, so it enchants nothing.
        // The Cyber-Controller: face down as 2/2 Cyberman artifact creatures, all at once; which cards they are is hidden
        // from everyone but their controller (CR 708.5, rulings).
        if (s.resolving) s.resolving.created = [];
        enterTogether(s, () => {
          for (const o of list) {
            log(s, e.faceDown === "cyberman" ? `${src} puts a card onto the battlefield face down under ${player(s, under(o)).name}'s control: it's a 2/2 Cyberman artifact creature.` : e.faceDown === "plain" ? `${src} returns a card to the battlefield face down under ${player(s, under(o)).name}'s control: it's a 2/2 creature.` : `${src} returns ${defOf(s, o).name} to the battlefield face down under ${player(s, under(o)).name}'s control: it's a Forest land.`);
            moveObject(s, o.id, "battlefield", { controller: under(o), putBy: putter, faceDown: e.faceDown === "plain" ? "morph" : e.faceDown });
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
      const returned = e.attachToCreated ? (s.resolving?.created ?? []).map((id) => s.objects[id]).find((o) => o?.zone === "battlefield" && objIsType(s, o, "Creature")) : e.attachToSource ? ((me) => (me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) && objIsType(s, me, "Creature") ? me : undefined))(ctx.sourceId ? s.objects[ctx.sourceId] : undefined) : undefined;
      // "Put it onto the battlefield attacking" (Senu): only during combat, attacking what its controller chooses as it
      // enters (CR 508.4, rulings); outside combat it just enters (CR 506.3d).
      // Shark Shredder: "attacking that player", the trigger's player, if they're still in the game.
      const foe = e.attackingEvent ? ctx.event?.player : undefined;
      const attackOptions = e.attacking && inCombat(s) && entering.some((o) => isType(defOf(s, o), "Creature")) ? (e.attackingEvent ? (foe !== undefined && foe !== ctx.controller && !player(s, foe).lost ? [{ key: String(foe), label: player(s, foe).name, player: foe }] : []) : attackChoices(s, ctx.controller, ctx.sourceId)) : [];
      const sc = (s.resolving!.scratch ??= {});
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, entering.find((o) => isType(defOf(s, o), "Creature"))!).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      // Reins of the Vinesteed: "attached to a creature that shares a creature type with that creature", the trigger's
      // subject as it last existed (rulings), chosen as this resolves; not targeted (CR 303.4f).
      let kin: ((h: GameObject) => boolean) | undefined;
      if (e.attachSharesTypeWithSubject) {
        const subj = ctx.subject ? s.objects[ctx.subject.id] : undefined;
        const here = subj?.zone === "battlefield" && (subj.zoneChanges ?? 0) === ctx.subject!.zc;
        const lk = !here && ctx.subject ? s.lastKnown?.[ctx.subject.id] : undefined;
        const types = here ? creatureTypesOf(s, subj!) : lk && (lk.zc === ctx.subject!.zc || lk.zc === ctx.subject!.zc - 1) && lk.creatureTypes ? (lk.creatureTypes === "all" ? ("all" as const) : new Set(lk.creatureTypes)) : undefined;
        kin = (h) => !!types && objIsType(s, h, "Creature") && shareCreatureType(types, creatureTypesOf(s, h));
      }
      // One Last Job: an Aura only onto a creature you control (CR 303.4f), chosen as it resolves (rulings).
      if (e.attachToYours) kin = (h) => objIsType(s, h, "Creature") && controllerOf(s, h) === ctx.controller;
      const hosts = e.attachRandom ? randomAuraHosts(s, entering, under, src) : e.attachToSubject || e.attachToTarget !== undefined || e.attachToYou || e.attachToEnchanted || e.attachToCreated || e.attachToSource ? new Map<ObjectId, AuraHost>() : chooseAuraHosts(s, entering.map((o) => ({ o, under: under(o), face: faceOf(o) })), src, undefined, undefined, undefined, kin);
      if (hosts === "paused") return "paused";
      // One Last Job: an Equipment onto a creature you control it could be attached to, chosen as it resolves (not
      // targeted); with none it enters unattached (rulings, CR 301.5c).
      const equipHosts = e.attachToYours ? chooseEquipHosts(s, entering, ctx.controller, src) : undefined;
      if (equipHosts === "paused") return "paused";
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
            moveObject(s, o.id, "battlefield", { controller: under(o), putBy: putter, ...(face ? { face } : {}), ...host });
            continue;
          }
          if (e.attachToYou) {
            // Lynde, Cheerful Tormentor (round 394): "return it to the battlefield attached to you": an Aura that could
            // enchant you as it enters (CR 303.4f; not with protection from it, 702.16c), else it stays where it is (303.4g).
            const me = ctx.controller;
            const host = d.subtypes.includes("Aura") ? asFace(s, o, face, () => auraHostOptions(s, o, under(o))).find((h) => "attachToPlayer" in h && h.attachToPlayer === me) : undefined;
            const ch = asFace(s, o, face, () => ({ name: d.name, colors: [...d.colors], types: [...d.types], subtypes: [...d.subtypes], controller: under(o) }));
            if (!host || playerProtectedFrom(s, me, under(o), ch)) {
              log(s, `${d.name} can't be attached to ${player(s, me).name}, so it stays ${o.zone === "graveyard" ? "in the graveyard" : "where it is"}.`);
              continue;
            }
            log(s, `${src} returns ${d.name} to the battlefield attached to ${player(s, me).name}.`);
            moveObject(s, o.id, "battlefield", { controller: under(o), putBy: putter, ...(face ? { face } : {}), ...host });
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
          if (e.attachToCreated || e.attachToSource) {
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
          if (equipHosts?.has(o.id)) {
            const host = equipHosts.get(o.id)!;
            log(s, `${src} returns ${d.name} to the battlefield${host ? ` attached to ${defOf(s, obj(s, host)).name}` : ", unattached"}.`);
            moveObject(s, o.id, "battlefield", { controller: under(o), putBy: putter, ...(host ? { attachTo: host } : {}) });
            if (o.zone === "battlefield") s.resolving?.created?.push(o.id);
            continue;
          }
          if (e.attachToSubject && !d.subtypes.includes("Aura") && d.subtypes.includes("Equipment")) {
            // Forum Filibuster (round 371): an Equipment "attached to that token": attached if that token is still the same
            // creature on the battlefield and the Equipment could equip it, otherwise it enters unattached (CR 301.5b-c).
            const host = ctx.subject && s.objects[ctx.subject.id];
            const ok = !!host && host.zone === "battlefield" && (host.zoneChanges ?? 0) === ctx.subject!.zc && !isType(d, "Creature") && objectMatches(s, { kind: "object", types: ["Creature"], text: "creature" }, host, ctx.controller, false, d);
            log(s, `${src} returns ${d.name} to the battlefield${ok ? ` attached to ${defOf(s, host!).name}` : ", unattached"}.`);
            moveObject(s, o.id, "battlefield", { controller: ctx.controller, ...(ok ? { attachTo: host!.id } : {}) });
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
          // "It's a 3/3 Robot artifact creature", "it's a Zombie in addition to its other types": it has that as it enters, so
          // replacements on entering and enters triggers see it (CR 614.12, rulings on Chainer, Dementia Master). Whether it's a
          // Vehicle or a creature card is what the card is as it's put there.
          const also = e.alsoMods && (!e.alsoModsIfSubtype || characteristics(s, o).subtypes.includes(e.alsoModsIfSubtype)) && (!e.alsoModsIfCreature || objIsType(s, o, "Creature")) ? e.alsoMods : undefined;
          const entersAs = [...(e.entersAs && (ctx.x ?? 0) >= e.entersAs.x ? e.entersAs.mods : []), ...(also ?? [])];
          moveObject(s, o.id, "battlefield", { controller: under(o), putBy: putter, tapped: e.tapped, ...(e.becomes ? { becomes: e.becomes } : {}), ...(entersAs.length ? { entersAs, ...(also ? { entersAsBy: { controller: ctx.controller, source: src, ...(e.alsoModsWhileCounter ? { whileCounter: e.alsoModsWhileCounter } : {}) } } : {}) } : {}), ...(e.counters ? e.countersIfSubtype ? { countersIfSubtype: { subtype: e.countersIfSubtype, counters: e.counters } } : { [e.countersIfCreature ? "countersIfCreature" : "counters"]: e.counters } : {}), ...(e.countersFromLast ? { counters: { [e.countersFromLast.kind]: Math.max(0, (s.lastKnown?.[o.id]?.counters?.[e.countersFromLast.kind] ?? 0) + e.countersFromLast.plus) } } : {}), ...(e.countersAmount ? { counters: { [e.countersAmount.kind]: Math.max(0, amountNow(s, e.countersAmount.n, ctx)) } } : {}), ...(face ? { face } : {}), ...host }); // CR 110.2a
          // Attacking as it enters, before its enters abilities trigger (CR 508.4).
          if (attacks && o.zone === "battlefield" && objIsType(s, o, "Creature")) {
            o.attacking = attack!.player;
            if (attack!.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack!.planeswalker);
          }
          // "That creature gains haste until end of turn. Exile it at the beginning of the next end step" (Corpse Dance): only
          // the permanent it became, while it's still that object (CR 400.7, rulings).
          if (o.zone !== "battlefield") continue;
          s.resolving?.created?.push(o.id);
          // Craft: "the exiled cards used to craft it" are the cards the cost exiled, while they stay exiled (CR 702.167c).
          if (e.linkCostExiled && s.resolving?.item.costExiled?.length) (s.linkedExile ??= {})[`${o.id}@${o.zoneChanges ?? 0}`] = [...s.resolving.item.costExiled];
          // Nim Deathmantle: attached to it if it could be; otherwise it stays where it is (CR 701.3b; rulings).
          if (e.attachSelf) {
            const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
            if (me?.zone === "battlefield") attachTo(s, me, o);
          }
          if (e.haste) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: e.haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
          // Random Encounter: "return those creatures to their owner's hand", each while it's still that object (CR 400.7).
          if (e.atEndStep)
            addDelayed(s, "nextEndStep", ctx.controller, o, { targets: [], effects: [e.atEndStep === "exile" ? { type: "exile", what: { ref: "subject" } } : e.atEndStep === "hand" ? { type: "bounce", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${e.atEndStep === "exile" ? "Exile" : e.atEndStep === "hand" ? "Return" : "Sacrifice"} ~${e.atEndStep === "hand" ? " to its owner's hand" : ""}.` });
          if (e.exileAtYourNextUpkeep) addDelayed(s, "yourNextUpkeep", ctx.controller, o, { targets: [], effects: [{ type: "exile", what: { ref: "subject" } }], text: "Exile ~." });
          // "Sacrifice it when you lose control of ~" (Krovikan Vampire): once you've controlled ~ since now (Seraph rulings).
          const w = watched && s.objects[watched.id];
          if (w && w.zone === "battlefield" && (w.zoneChanges ?? 0) === watched!.zc) {
            // Coffin Queen: exiled instead, and the first time ~ becomes untapped too (CR 603.7c).
            const body: AbilityBody = e.exileOnUntapOrLostControl ? { targets: [], effects: [{ type: "exile", what: { ref: "subject" } }], text: `Exile ${defOf(s, o).name}.` } : { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: `Sacrifice ${defOf(s, o).name}.` };
            const d = { when: "lostControl" as const, controller: ctx.controller, sourceCardId: cardIdOf(w), subject: watched!, about: { id: o.id, zc: o.zoneChanges ?? 0 }, ...(controllerOf(s, w) === ctx.controller ? { held: true as const } : {}), ...(e.exileOnUntapOrLostControl ? { orUntaps: true as const } : {}), body, turn: s.turn, step: s.step };
            (s.delayed ??= []).push(d);
          }
        }
      });
      return;
    }
    case "randomTargetsToBottom": {
      // Sinister Waltz: the cards that aren't returned, chosen at random as it resolves among the legal targets left.
      const left = objects(s, e.what, ctx).map((o) => o.id);
      while (left.length > e.keep) {
        const id = left.splice(Math.floor(nextRandom(s) * left.length), 1)[0]!;
        log(s, `${src} puts ${defOf(s, obj(s, id)).name}, chosen at random, on the bottom of its owner's library.`);
        moveObject(s, id, "library");
        // It's a new object now (CR 400.7): the next instruction's "them" no longer finds it.
        const i = ctx.targets.findIndex((t, j) => j >= (e.what.ref === "target" ? e.what.index : 0) && t?.kind === "object" && t.id === id);
        if (i >= 0) ctx.legal[i] = false;
      }
      return;
    }
    case "destroyRandomTarget": {
      // Wild Swing: chosen at random among the legal targets left, then destroyed at once (CR 701.8).
      const left0 = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield");
      // Chaos Defiler: one without indestructible, while any of them lacks it (rulings, CR 702.12b).
      const breakable = e.destroyable ? left0.filter((o) => !objHasKeyword(s, o, "indestructible")) : [];
      const left = breakable.length ? breakable : left0;
      if (!left.length) return;
      const o = left[Math.floor(nextRandom(s) * left.length)]!;
      const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)), controller: controllerOf(s, o) };
      if (destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}, chosen at random.`, false, ctx.controller) && s.resolving) (s.resolving.destroyed ??= []).push({ ...before, ...(s.objects[o.id]?.zone === "graveyard" ? { died: true as const } : {}) });
      return;
    }
    case "randomFromGraveyard": {
      const from = e.from ? players(s, e.from, ctx)[0] : ctx.controller;
      if (from === undefined) return;
      const p = player(s, from);
      const pool = p.graveyard.filter((id) => !e.filter || printedMatches(e.filter, defOf(s, s.objects[id]!)));
      // Reap the Past: "X cards at random", none for an X of 0.
      const count = e.n === undefined ? 1 : amountNow(s, e.n, ctx);
      if (!pool.length || count <= 0) return;
      // Make a Wish: "two cards at random", chosen as it resolves (rulings), one of them if that's all there is; all of
      // them if X is that many or more (rulings on Reap the Past).
      if (count > 1 && e.dest === "hand") {
        const left = [...pool];
        const picked: string[] = [];
        while (left.length && picked.length < count) picked.push(left.splice(Math.floor(nextRandom(s) * left.length), 1)[0]!);
        log(s, `${src} returns ${picked.map((id) => defOf(s, obj(s, id)).name).join(" and ")}, chosen at random, from ${p.name}'s graveyard to their hand.`);
        for (const id of picked) moveObject(s, id, "hand");
        return;
      }
      // Moldgraf Monstrosity: "two creature cards at random ... to the battlefield": put there at the same time.
      if (count > 1 && e.dest === "battlefield") {
        const left = [...pool];
        const picked: string[] = [];
        while (left.length && picked.length < count) picked.push(left.splice(Math.floor(nextRandom(s) * left.length), 1)[0]!);
        log(s, `${src}: ${picked.map((id) => defOf(s, obj(s, id)).name).join(" and ")}, chosen at random, ${picked.length > 1 ? "are" : "is"} put onto the battlefield from ${p.name}'s graveyard${p.id === ctx.controller ? "" : ` under ${player(s, ctx.controller).name}'s control`}.`);
        enterTogether(s, () => {
          for (const id of picked) moveObject(s, id, "battlefield", { controller: ctx.controller }); // CR 110.2a
        });
        return;
      }
      const o = obj(s, pool[Math.floor(nextRandom(s) * pool.length)]!);
      const d = defOf(s, o);
      if (e.dest === "hand") {
        log(s, `${src} returns ${d.name}, chosen at random, from ${p.name}'s graveyard to their hand.`);
        moveObject(s, o.id, "hand");
      } else if (e.dest === "exilePlay") {
        // Tersa Lightshatter: played the usual way, paying its costs and following timing rules (rulings).
        log(s, `${src}: ${d.name} is chosen at random and exiled. ${p.name} may play it this turn.`);
        moveObject(s, o.id, "exile");
        if (o.zone === "exile") o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, ...(e.exileAfter ? { exileAfter: true as const } : {}) };
      } else if ((e.dest === "battlefield" || isPermanentCard(d)) && d.types.includes("Creature") && !d.subtypes.includes("Aura")) {
        log(s, `${src}: ${d.name} is chosen at random and put onto the battlefield${p.id === ctx.controller ? "" : ` under ${player(s, ctx.controller).name}'s control`}.`);
        moveObject(s, o.id, "battlefield", { controller: ctx.controller }); // CR 110.2a
        // Kheru Lich Lord: "It gains flying, trample, and haste. ..." is about the permanent it became.
        if (s.resolving && o.zone === "battlefield") s.resolving.created = [o.id];
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
      if (e.who?.ref === "eachPlayer" || e.who?.ref === "eachOpponent" || e.who?.ref === "choseWord") return eachFromGraveyard(s, e, ctx, src);
      if (e.fromExile) {
        // Karn, the Great Creator: a face-up card you own in exile, into your hand (rulings: never a face-down one).
        // Oblivion Sower: that player's face-up land cards in exile, onto the battlefield under your control.
        const p = player(s, ctx.controller);
        const ownerId = e.who ? players(s, e.who, ctx)[0] : p.id;
        if (ownerId === undefined) return;
        const owner = player(s, ownerId);
        const sc = (s.resolving!.scratch ??= {});
        // Karn, Scion of Urza: "a card you own with a silver counter on it" (TargetSpec.counter): on that card in exile.
        const fits = (id: ObjectId) => obj(s, id).owner === owner.id && obj(s, id).zone === "exile" && !obj(s, id).faceDown && !obj(s, id).hiddenExile && (!e.filter || printedMatches(e.filter.counter ? { ...e.filter, counter: undefined } : e.filter, defOf(s, obj(s, id)))) && (!e.filter?.counter || (obj(s, id).counters[e.filter.counter] ?? 0) > 0);
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
        // Cemetery Desecrator (round B221): "another card", not the card with the ability (in a graveyard once it died).
        const fits = (id: ObjectId) => (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))) && (!toField || isPermanentCard(defOf(s, obj(s, id)))) && (!e.notSelf || id !== ctx.sourceId);
        // "From among the milled cards" after "each player mills four cards" (Gyruda, Doom of Depths): only those, still the
        // same objects (CR 400.7), the ones a replacement exiled instead too (rulings).
        const same = (m: { id: ObjectId; zc: number }) => (obj(s, m.id).zoneChanges ?? 0) === m.zc;
        const yards = () =>
          e.milled
            ? [...(s.resolving!.milled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "graveyard"), ...(e.milledInYard ? [] : (s.resolving!.milledExiled ?? []).filter((m) => same(m) && obj(s, m.id).zone === "exile"))].map((m) => m.id).filter(fits)
            : livingPlayers(s).filter((pid) => !e.opponentsYards || opponents(s, ctx.controller).includes(pid)).flatMap((pid) => player(s, pid).graveyard).filter(fits);
        if (!sc.found) {
          const cards = yards();
          if (!cards.length) return;
          // Liliana, the Necromancer: "Put up to two creature cards from graveyards onto the battlefield under your control":
          // up to that many, from one graveyard or several.
          const most = Math.min(e.n, cards.length);
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: e.n > 1 ? `${e.upTo ? "up to " : ""}${e.n} ${e.filter?.text ?? "card"}s` : e.filter?.text ? `a ${e.filter.text}` : "a card", cards, min: e.upTo ? 0 : most, max: most, fromGraveyard: toField ? "battlefield" : "exile", anyGraveyard: true, ...(cards.some((id) => obj(s, id).zone === "exile") ? { exiled: true as const } : {}) };
          return "paused";
        }
        const found = sc.found.filter((id) => yards().includes(id)).slice(0, e.n);
        sc.found = undefined;
        // "When that creature dies, ..." (The Deck of Many Things): the permanent it became (CR 400.7).
        if (toField && s.resolving) s.resolving.created = [];
        if (toField) {
          // Several enter at once (CR 614.12, 603.6a: each sees the others enter).
          const putAll = () => {
            for (const id of found) {
              const o = obj(s, id);
              log(s, `${player(s, ctx.controller).name} puts ${defOf(s, o).name} from ${o.zone === "exile" ? "exile" : `${o.owner === ctx.controller ? "their" : `${player(s, o.owner).name}'s`} graveyard`} onto the battlefield.`);
              moveObject(s, id, "battlefield", { controller: ctx.controller, ...(e.tapped ? { tapped: true } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: ctx.controller, source: src } } : {}) }); // CR 614.12
              if (o.zone === "battlefield" && s.resolving) s.resolving.created!.push(id);
            }
          };
          if (found.length > 1) enterTogether(s, putAll);
          else putAll();
          return;
        }
        for (const id of found) {
          const o = obj(s, id);
          log(s, `${player(s, ctx.controller).name} exiles ${defOf(s, o).name} from ${o.owner === ctx.controller ? "their" : `${player(s, o.owner).name}'s`} graveyard.`);
          moveObject(s, id, "exile");
          if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
        }
        // "If a creature card was exiled this way" (Deathbonnet Hulk): the card exiled.
        if (!toField) s.resolving!.yardChosen = found.filter((id) => obj(s, id).zone === "exile");
        // Lazav, Familiar Stranger: "become a copy of that card", the one card exiled, while it's still that card (CR 400.7).
        const exiledOne = toField ? undefined : s.resolving!.yardChosen;
        if (exiledOne?.length === 1) s.resolving!.chosenFromYard = { id: exiledOne[0]!, zc: obj(s, exiledOne[0]!).zoneChanges ?? 0 };
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
        // Queen Kayla bin-Kroog: discarded cards exiled instead are found in exile (rulings).
        const exiledToo = e.discarded && e.discardedExiled ? p.exile.filter((id) => !!s.resolving!.discardedExiled?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc)) : [];
        // Only the cards milled just before, still in the graveyard (CR 400.7).
        // Colossal Grave-Reaver: only the cards the trigger's event put there, still the same objects.
        const milled = (id: ObjectId) =>
          (!e.milled || !!s.resolving!.milled?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc)) &&
          (!e.discarded || !!s.resolving!.discardedCards?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc) || exiledToo.includes(id)) && (!e.eventGroup || !!ctx.event?.group?.some((g) => g.id === id && (obj(s, id).zoneChanges ?? 0) === g.zc)) &&
          // "Another permanent card" than the one you sacrificed this way (rulings on Rise of the Witch-king).
          (!e.notSacrificed || !s.resolving!.sacrificedThisWay?.some((k) => k.id === id && k.controller === ctx.controller)) &&
          // Blood for Bones: "another creature card" than the one chosen for the battlefield.
          (!e.another || !s.resolving!.yardToBattlefield?.includes(id)) &&
          // Ichorid: "other than ~", not the card with the ability.
          (!e.notSelf || id !== ctx.sourceId) &&
          // Starfall Invocation: a card that died to this destroy and hasn't moved since (CR 400.7).
          (!e.destroyedThisWay || !!s.resolving!.destroyed?.some((d) => d.died && d.o.id === id && (obj(s, id).zoneChanges ?? 0) === (d.o.zoneChanges ?? 0) + 1));
        const all = [...p.graveyard, ...exiledToo].filter((id) => milled(id) && (!filter || printedMatches(filter, defOf(s, obj(s, id)))) && (e.dest !== "battlefield" || isPermanentCard(defOf(s, obj(s, id)))) && (e.totalMv === undefined || defMv(defOf(s, obj(s, id))) <= e.totalMv));
        // Desecrator Hag: the greatest power among them, a characteristic-defining "*" counted there too (rulings).
        const top = e.greatestPower ? Math.max(...all.map((id) => characteristics(s, obj(s, id)).power)) : 0;
        const fit = e.greatestPower ? all.filter((id) => characteristics(s, obj(s, id)).power === top) : all;
        // "With different names": one card of each name is offered (cards of one name are alike).
        const cards = e.oneEach ? fit.filter((id, i) => fit.findIndex((x) => sameName(defOf(s, obj(s, x)).name, defOf(s, obj(s, id)).name)) === i) : fit;
        // "Return that many creature cards" (Lich-Knights' Conquest): counted as it resolves.
        const count = e.nAmount !== undefined ? Math.max(0, amountNow(s, e.nAmount, ctx)) : e.n;
        const max = e.distinctManaValues ? new Set(cards.map((id) => defMv(defOf(s, obj(s, id))))).size : Math.min(count, cards.length);
        // "If you don't" after a card from among the milled ones (Ainok Wayfarer): whether one was put into your hand.
        if (e.milled) s.resolving!.did = false;
        if (!max) return;
        // Winter, Cynical Opportunist: nothing to choose if the cards don't have that many card types among them.
        if (e.cardTypes && cardTypesAmong(s, cards) < e.cardTypes) return;
        const kind = filter?.text ?? "card";
        const what = e.oneOfEach
          ? `up to one ${kind}`
          : e.distinctManaValues && !e.upTo
          ? `one ${kind} of each mana value`
          : e.distinctManaValues
          ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different mana values`
          : e.oneEach && e.upTo && e.n >= 99
            ? `any number of ${kind.replace(/\bcard\b/, "cards")} with different names`
          : count === 1
            ? `${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}`
            : e.upTo && count >= 99
            ? `any number of ${kind.replace(/\bcard\b/, "cards")}${e.totalMv !== undefined ? ` with total mana value ${e.totalMv} or less` : ""}${e.cardTypes ? ` with ${e.cardTypes} or more card types among them` : ""}`
            : `${e.upTo ? "up to " : ""}${count} ${kind.replace(/\bcard\b/, "cards")}${e.totalMv !== undefined ? ` with total mana value ${e.totalMv} or less` : ""}`;
        // Realmbreaker: you choose from their graveyard. O-Kagachi Made Manifest: another player chooses from yours, for you.
        const chooser = e.chooser ? players(s, e.chooser, ctx).find((pid) => !player(s, pid).lost) : undefined;
        if (e.chooser && chooser === undefined) return;
        // Visions of Dread: they choose for you, so the card that helps you least (bots).
        const under = e.underYours && p.id !== ctx.controller ? { forPlayer: ctx.controller, helps: true as const, under: ctx.controller } : {};
        // Seek Thrills: "put all cards that have an Adventure from among the milled cards": every one, no choice.
        if (e.all) sc.found = cards.slice(0, max);
        else {
          s.pending = { kind: "searchLibrary", player: e.youChoose ? ctx.controller : (chooser ?? p.id), source: src, what: e.youChoose || chooser !== undefined ? `${what} in ${p.name}'s graveyard` : what, ...under, ...(chooser !== undefined && chooser !== p.id ? { forPlayer: p.id, ...(e.dest === undefined || e.dest === "battlefield" ? { helps: true as const } : {}) } : {}), cards, min: e.upTo ? 0 : max, max, fromGraveyard: e.dest ?? "hand", ...(e.distinctManaValues ? { distinctManaValues: true as const } : {}), ...(e.totalMv !== undefined ? { totalMv: e.totalMv } : {}), ...(e.oneOfEach ? { oneOfEach: e.oneOfEach } : {}), ...(e.cardTypes ? { cardTypes: e.cardTypes } : {}) };
          return "paused";
        }
      }
      const found = sc.found.filter((id) => p.graveyard.includes(id) || (!!e.discardedExiled && p.exile.includes(id)));
      if (e.dest === "battlefield") {
        // An Aura's controller chooses what it enchants as it enters (CR 303.4f), or it stays in the graveyard (303.4g).
        const hosts = chooseAuraHosts(s, found.map((id) => ({ o: obj(s, id), under: e.youChoose || e.underYours ? ctx.controller : p.id })), src);
        if (hosts === "paused") return "paused";
        const ids = found.filter((id) => !defOf(s, obj(s, id)).subtypes.includes("Aura") || hosts.has(id));
        (s.resolving!.yardToBattlefield ??= []).push(...found);
        if (e.youChoose || e.underYours) {
          // Realmbreaker: under your control; "it" afterwards is the permanent it became (CR 400.7).
          const me = player(s, ctx.controller);
          if (ids.length) log(s, `${me.name} puts ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${p.name}'s graveyard onto the battlefield under their control${e.tapped ? ", tapped" : ""}.`);
          enterTogether(s, () => ids.forEach((id) => moveObject(s, id, "battlefield", { controller: me.id, ...(e.tapped ? { tapped: true } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: ctx.controller, source: src } } : {}), ...hosts.get(id) })));
          if (s.resolving) s.resolving.created = ids.filter((id) => obj(s, id).zone === "battlefield");
          return;
        }
        if (ids.length) log(s, `${p.name} returns ${ids.map((id) => defOf(s, obj(s, id)).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} from their graveyard to the battlefield${e.tapped ? ", tapped" : ""}.`);
        enterTogether(s, () => {
          // Drana, the Last Bloodchief: "The creature is a Vampire in addition to its other types", as it enters (CR 614.12) and for good.
          ids.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, ...(e.chooser ? { putBy: ctx.controller } : {}), ...(e.tapped ? { tapped: true } : {}), ...(e.counters ? { counters: e.countersN === undefined ? { ...e.counters } : Object.fromEntries(Object.keys(e.counters).map((k) => [k, Math.max(0, amountNow(s, e.countersN!, ctx))])) } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: ctx.controller, source: src } } : {}), ...hosts.get(id) }));
        });
        // Revival Experiment: "You lose 3 life for each card returned this way": the cards now on the battlefield.
        if (e.lifeEach) {
          const n = ids.filter((id) => obj(s, id).zone === "battlefield").length;
          if (n) loseLife(s, p.id, n * e.lifeEach);
        }
        return;
      }
      if (e.dest === "castThisTurn") {
        // Mission Briefing: a permission for that card only (CR 400.7), until the turn ends, at its normal timing (rulings).
        for (const id of found) {
          const o = obj(s, id);
          o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true, ...(e.exileAfter ? { exileAfter: true as const } : {}) };
          log(s, `${p.name} chooses ${defOf(s, o).name} in their graveyard and may cast it this turn.`);
        }
        return;
      }
      // "keep" is only compiled for each player's own graveyard (eachFromGraveyard).
      if (e.dest === "keep") return;
      const names = found.map((id) => defOf(s, obj(s, id)).name).join(", ");
      if (found.length) log(s, e.dest === "exile" ? `${p.name} exiles ${names} from their graveyard.` : e.dest === "libraryTop" ? `${p.name} puts ${names} from their graveyard on top of their library.` : e.dest === "libraryBottom" ? `${p.name} puts ${names} from their graveyard on the bottom of their library.` : e.dest === "shuffleIn" ? `${p.name} shuffles ${names} from their graveyard into their library.` : `${p.name} returns ${names} from their graveyard to their hand.`);
      for (const id of found) (e.dest === "libraryTop" ? moveObject(s, id, "library", { top: true }) : e.dest === "libraryBottom" || e.dest === "shuffleIn" ? moveObject(s, id, "library") : moveObject(s, id, e.dest ?? "hand"));
      if (e.dest === "shuffleIn" && found.length) shuffleLibrary(s, p);
      // Azula, Cunning Usurper: "exiled with ~" (CR 607.2a), as the card it is in exile.
      if (e.linked && e.dest === "exile" && ctx.sourceId)
        for (const id of found) if (obj(s, id).zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: obj(s, id).zoneChanges ?? 0 });
      // Conspiracy Theorist: the card in exile (a new object, CR 400.7) may be cast this turn by the player who exiled it.
      if (e.castExiledThisTurn)
        for (const id of found) {
          const o = obj(s, id);
          if (o.zone !== "exile") continue;
          o.mayPlay = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true };
          log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, o).name} this turn.`);
        }
      // God-Pharaoh's Gift: "you may exile a creature card from your graveyard. If you do, ... that card": the one exiled.
      if ((e.chooser || (e.dest === "exile" && e.n === 1)) && found.length === 1) s.resolving!.chosenFromYard = { id: found[0]!, zc: obj(s, found[0]!).zoneChanges ?? 0 };
      s.resolving!.yardChosen = found;
      if (e.milled) s.resolving!.did = found.length > 0;
      if (e.milled && (e.dest ?? "hand") === "hand") s.resolving!.putIntoHand = found;
      return;
    }
    case "loreChoices": {
      // Shrouded Lore: the opponent chooses a card in your graveyard; each time you pay, they choose again among the cards
      // not chosen yet (none left: no more choosing, rulings); the last card chosen goes into your hand (CR 608.2c).
      const me = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.lore ??= { chosen: [], pay: false });
      const chooser = players(s, e.who, ctx).find((q) => !player(s, q).lost);
      const left = () => me.graveyard.filter((id) => !st.chosen.includes(id));
      for (;;) {
        if (!st.pay) {
          // The opponent's choice.
          const pick = sc.found?.[0];
          sc.found = undefined;
          if (pick !== undefined) {
            st.chosen.push(pick);
            st.last = pick;
            st.pay = true;
            log(s, `${player(s, chooser ?? me.id).name} chooses ${defOf(s, obj(s, pick)).name} in ${me.name}'s graveyard for ${src}.`);
            continue;
          }
          const cards = left();
          if (chooser === undefined || !cards.length) break;
          s.pending = { kind: "searchLibrary", player: chooser, source: src, what: `a card in ${me.name}'s graveyard`, cards, min: 1, max: 1, fromGraveyard: "hand", ...(chooser !== me.id ? { forPlayer: me.id, helps: true as const } : {}) };
          return "paused";
        }
        // Paying for another choice, only with a card left to choose (rulings).
        if (sc.may !== undefined) {
          const again = sc.may;
          sc.may = undefined;
          if (!again) break;
          st.pay = false;
          continue;
        }
        if (chooser === undefined || !left().length) break;
        s.pending = { kind: "chooseMay", player: me.id, source: src, prompt: `pay ${e.pay} to have ${player(s, chooser).name} choose another card`, pay: { mana: e.pay } };
        return "paused";
      }
      const last = st.last;
      sc.lore = undefined;
      if (last !== undefined && me.graveyard.includes(last)) {
        log(s, `${me.name} puts ${defOf(s, obj(s, last)).name} from their graveyard into their hand.`);
        moveObject(s, last, "hand");
      }
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
        // Garna: only those put there this turn (GameObject.toGraveyardTurn); Gleancrawler: from the battlefield.
        // Echoing Return: the target's name, as it is now (CR 201.2).
        const t = e.sameNameAs !== undefined ? ctx.targets[e.sameNameAs] : undefined;
        const name = t?.kind === "object" && s.objects[t.id] ? defOf(s, obj(s, t.id)).name : undefined;
        if (e.sameNameAs !== undefined && name === undefined) return;
        // "Cards of the chosen type" (Creeping Renaissance): the type chosen as it resolved.
        const filter = bindChosen(e.filter, ctx.chosen);
        const ids = players(s, e.who, ctx).flatMap((pid) => player(s, pid).graveyard.filter((id) => printedMatches(filter, defOf(s, obj(s, id))) && (name === undefined || sameName(defOf(s, obj(s, id)).name, name)) && (!e.filter.putThereThisTurn || obj(s, id).toGraveyardTurn === s.turn) && (!e.filter.fromBattlefieldThisTurn || obj(s, id).fromBattlefieldTurn === s.turn) && (!e.filter.discardedThisTurn || obj(s, id).discardedTurn === s.turn) && (!e.milled || !!s.resolving!.milled?.some((m) => m.id === id && (obj(s, id).zoneChanges ?? 0) === m.zc))));
        if (ids.length) log(s, `${src} returns ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} to ${e.who.ref === "you" ? `${player(s, ctx.controller).name}'s hand` : "their owners' hands"}.`);
        for (const id of ids) moveObject(s, id, "hand");
        return;
      }
      // All at once, as one move: under your control (CR 110.2a) or, with "under their owners' control", each owner's.
      // Only permanent cards can be put onto the battlefield (CR 110.4b). Which cards is fixed as it starts (Replenish
      // rulings), before any Aura's host is chosen; an Aura with nothing to enchant stays in the graveyard (CR 303.4g).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.found) {
        sc.found = [];
        // Rat King, Verminister: only cards with target `sameNameAs`'s name, that card included (CR 201.2).
        const t = e.sameNameAs !== undefined ? ctx.targets[e.sameNameAs] : undefined;
        // Bloodbond March: the name the cast spell had as it was cast, even if it has left the stack since (CR 201.2,
        // 608.2h); none face down (CR 708.2a), so nothing returns then.
        const name = e.sameNameAsCast ? (ctx.cause !== undefined ? s.castItems?.[ctx.cause]?.castName : undefined) : t?.kind === "object" && s.objects[t.id]?.zone === "graveyard" ? defOf(s, obj(s, t.id)).name : undefined;
        if ((e.sameNameAs !== undefined || e.sameNameAsCast) && name === undefined) return;
        // "With mana value X or less": this spell's X (TargetSpec.xRange).
        // "With mana value X" (Fix What's Broken, Immortal Servitude): exactly X.
        // Demigod of Revenge: "all cards named ~", the source's name (CR 201.5).
        const { xRange, ...rest } = bindChosen(e.filter.named === "~" ? { ...e.filter, named: ctx.sourceDef.name } : e.filter, ctx.chosen);
        const x = ctx.x ?? 0;
        const filter: TargetSpec = xRange ? { ...rest, manaValue: xRange.at === "exact" ? { min: x, max: x } : xRange.at === "least" ? { min: x } : { max: x } } : rest;
        // Cleansing Meditation: only the cards the destroy before this put there, still there as those cards (CR 400.7).
        const destroyed = e.destroyedThisWay ? new Set((s.resolving?.destroyed ?? []).filter((x) => x.died && s.objects[x.o.id]?.zone === "graveyard" && (s.objects[x.o.id]!.zoneChanges ?? 0) === (x.o.zoneChanges ?? 0) + 1).map((x) => x.o.id)) : undefined;
        // The active player chooses for their Auras first, then the others in turn order (APNAP, Open the Vaults rulings).
        for (const pid of apnap(s, players(s, e.who, ctx)))
          for (const id of player(s, pid).graveyard) {
            if (destroyed && !destroyed.has(id)) continue;
            const d = defOf(s, s.objects[id]!);
            if (isPermanentCard(d) && printedMatches(filter, d) && (name === undefined || sameName(d.name, name)) && (!filter.putThereThisTurn || obj(s, id).toGraveyardTurn === s.turn) && (!filter.fromBattlefieldThisTurn || obj(s, id).fromBattlefieldTurn === s.turn) && !(e.notSacrificedThisWay && s.resolving!.sacrificedThisWay?.some((k) => k.id === id))) sc.found.push(id);
          }
      }
      const cards = sc.found.map((id) => obj(s, id)).filter((o) => o.zone === "graveyard");
      const under = (o: GameObject) => (e.owners ? o.owner : ctx.controller);
      const hosts = chooseAuraHosts(s, cards.map((o) => ({ o, under: under(o) })), src, undefined, e.auraOnCreature);
      if (hosts === "paused") return "paused";
      const ids = cards.filter((o) => !defOf(s, o).subtypes.includes("Aura") || hosts.has(o.id)).map((o) => o.id);
      if (ids.length) log(s, `${src} returns ${ids.map((id) => defOf(s, s.objects[id]!).name + (hosts.has(id) ? ` (enchanting ${auraHostName(s, hosts.get(id)!)})` : "")).join(", ")} to the battlefield${e.tapped ? ", tapped" : ""}.`);
      // Storm of Souls: "Each of them is a 1/1 Spirit with flying ...", for good (CR 611.2c); Grimoire of the Dead: "They're
      // black Zombies ...". They are already that as they enter, before their enters abilities trigger (rulings on Chainer,
      // Dementia Master's like ability).
      enterTogether(s, () => {
        ids.forEach((id) => moveObject(s, id, "battlefield", { controller: under(obj(s, id)), ...(e.byYou ? { putBy: ctx.controller } : {}), tapped: e.tapped, ...hosts.get(id), ...(e.counters ? { counters: e.counters } : {}), ...(e.alsoMods ? { entersAs: e.alsoMods, entersAsBy: { controller: ctx.controller, source: src } } : {}) }));
      });
      const entered = ids.filter((id) => obj(s, id).zone === "battlefield");
      // "They gain haste until end of turn" (Wake the Past): the permanents they became.
      (s.resolving!.created ??= []).push(...entered);
      // Rally the Ancestors: each one exiled when your next upkeep begins, if it's still that object (CR 400.7, 603.7).
      if (e.exileAtYourNextUpkeep) for (const id of entered) addDelayed(s, "yourNextUpkeep", ctx.controller, obj(s, id), { targets: [], effects: [{ type: "exile", what: { ref: "subject" } }], text: "Exile ~." });
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
    case "processExile": {
      if (e.adventureOf) {
        // Memory Theft: that player's face-up adventurer cards in exile (CR 715.2; rulings), one or none.
        const sc = (s.resolving!.scratch ??= {});
        const owner = players(s, e.adventureOf, ctx)[0];
        const cards = adventureExileCards(s, owner);
        if (!sc.found) {
          if (!cards.length) return;
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: "a card that has an Adventure", cards, min: 1, max: 1, exiled: true, dig: { looked: cards, to: `to put into ${player(s, owner!).name}'s graveyard`, rest: "stay in exile" } };
          return "paused";
        }
        const found = sc.found.filter((id) => cards.includes(id));
        sc.found = undefined;
        for (const id of found) {
          log(s, `${src} puts ${defOf(s, obj(s, id)).name} into its owner's graveyard.`);
          moveObject(s, id, "graveyard");
        }
        return;
      }
      // The Eldrazi processors: cards an opponent owns in exile, chosen as it resolves; a face-down one by its group, then
      // at random within it (rulings). Two cards can't be the same card (rulings on Ulamog's Despoiler).
      const sc = (s.resolving!.scratch ??= {});
      const cards = processCandidates(s, ctx.controller);
      if (!sc.found) {
        if (cards.length < e.n) return;
        const what = e.n === 1 ? "a card an opponent owns" : `${e.n} cards your opponents own`;
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what, cards, min: e.n, max: e.n, exiled: true, dig: { looked: cards, to: e.n === 1 ? "to put into its owner's graveyard" : "to put into their owners' graveyards", rest: "stay in exile" } };
        return "paused";
      }
      const found = sc.found.filter((id) => cards.includes(id));
      sc.found = undefined;
      processExiled(s, ctx.controller, found);
      return;
    }
    case "exiledToGraveyard": {
      const cards = (e.cards ?? []).filter((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id);
      // Psychic Theft: "return it to its owner's hand".
      if (e.toHand) {
        if (cards.length) log(s, `${src} returns ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} to ${cards.length === 1 ? "its owner's hand" : "their owners' hands"}.`);
        for (const id of cards) moveObject(s, id, "hand");
        return;
      }
      if (cards.length) log(s, `${src} puts ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} into ${cards.length === 1 ? "its owner's graveyard" : "their owners' graveyards"}.`);
      for (const id of cards) moveObject(s, id, "graveyard");
      // Only what got there (not what a replacement effect sent elsewhere) was put there this way.
      s.resolving!.movedLinked = cards.filter((id) => s.objects[id]?.zone === "graveyard").length;
      return;
    }
    case "exileRemembered": {
      const ids = (e.cards ?? []).filter((c) => s.objects[c.id]?.zone === "battlefield" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc).map((c) => c.id);
      if (ids.length) log(s, `${src} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
      for (const id of ids) moveObject(s, id, "exile");
      return;
    }
    case "untilLeavesToGraveyard": {
      const sc = (s.resolving!.scratch ??= {});
      const me = objects(s, { ref: "self" }, ctx)[0] ?? (ctx.sourceId ? s.objects[ctx.sourceId] : undefined);
      // Its exiles last only while it's that object on the battlefield (CR 610.3); once it has left they're back.
      const here = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
      const live = (id: ObjectId) => !!here && (me!.exiledUntilLeaves ?? []).some((l) => l.id === id && s.objects[id]?.zone === "exile" && (s.objects[id]!.zoneChanges ?? 0) === l.zc);
      s.resolving!.did = false;
      if (!sc.found) {
        const cards = here ? (me!.exiledUntilLeaves ?? []).map((l) => l.id).filter(live) : [];
        if (!cards.length) return;
        if (cards.length > 1) {
          s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `a card exiled with ${src}`, cards, min: 1, max: 1, exiled: true, dig: { looked: cards, to: "to put into its owner's graveyard", rest: "stay in exile" } };
          return "paused";
        }
        sc.found = cards;
      }
      const found = sc.found.filter(live);
      sc.found = undefined;
      for (const id of found) {
        log(s, `${player(s, ctx.controller).name} puts ${defOf(s, obj(s, id)).name} from exile into its owner's graveyard.`);
        me!.exiledUntilLeaves = me!.exiledUntilLeaves!.filter((l) => l.id !== id);
        moveObject(s, id, "graveyard");
        if (obj(s, id).zone === "graveyard") s.resolving!.did = true;
      }
      return;
    }
    case "returnOtherUntilLeaves": {
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.flickered) {
        const now = s.resolving?.exiled ?? [];
        if (!now.some((x) => x.ch.types.includes("Creature"))) return;
        // Exiled until it leaves: if it has left, nothing was exiled (CR 610.3a), so this did nothing either.
        const me = objects(s, { ref: "self" }, ctx)[0];
        if (!me || me.zone !== "battlefield") return;
        const just = new Set(now.map((x) => x.o.id));
        const all = me.exiledUntilLeaves ?? [];
        me.exiledUntilLeaves = all.filter((l) => just.has(l.id));
        sc.flickered = all.filter((l) => !just.has(l.id) && !l.hand && !l.graveyard && s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
      }
      const cards = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      return returnFromExile(s, cards, (c) => c.owner, src);
    }
    case "pileOnTop": {
      // Triumph of Saint Katherine: nothing happens unless the card is still in its owner's graveyard (CR 400.7) and
      // that library has at least `n` cards (rulings). The pile is exiled face down, then shuffled and put back on top.
      const card = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!card || card.zone !== "graveyard" || (ctx.sourceZc !== undefined && (card.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const lib = player(s, card.owner).library;
      if (lib.length < e.n) {
        log(s, `${src} does nothing: there are fewer than ${e.n} cards in ${player(s, card.owner).name}'s library.`);
        return;
      }
      const pile = [card.id, ...lib.slice(0, e.n)];
      for (const id of pile) {
        moveObject(s, id, "exile");
        obj(s, id).hiddenExile = { by: ctx.sourceId ?? "", seen: [], label: "Face down", at: s.nextTimestamp };
      }
      closeZoneBatch(s);
      const back = pile.filter((id) => obj(s, id).zone === "exile");
      shuffle(s, back);
      log(s, `${player(s, card.owner).name} exiles ${defOf(s, card).name} and the top ${e.n} cards of their library in a face-down pile, shuffles it and puts it back on top of their library.`);
      for (const id of back) moveObject(s, id, "library", { top: true });
      return;
    }
    case "topYardSplit": {
      // Phyrexian Grimoire: the top two cards of the controller's graveyard (CR 404.1); the chooser picks the one exiled,
      // the other goes to the controller's hand. One card only: it's exiled, nothing more (rulings).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const top = topGraveyardCards(s, p.id, 2);
      if (!top.length) return;
      const chooser = players(s, e.chooser, ctx)[0];
      let pick = top.length === 1 || chooser === undefined ? top[0]! : undefined;
      if (!pick) {
        if (!sc.yardSplit) {
          sc.yardSplit = true;
          delete sc.found;
          s.pending = { kind: "searchLibrary", player: chooser!, source: src, what: `one of the top two cards of ${p.name}'s graveyard`, cards: top, min: 1, max: 1, dig: { looked: top, to: "to exile", rest: `into ${p.name}'s hand` } };
          return "paused";
        }
        sc.yardSplit = undefined;
        pick = top.find((id) => sc.found?.includes(id)) ?? top[0]!;
      }
      if (chooser !== undefined && top.length > 1) log(s, `${player(s, chooser).name} chooses ${defOf(s, obj(s, pick)).name} (${src}).`);
      log(s, `${src} exiles ${defOf(s, obj(s, pick)).name}.`);
      moveObject(s, pick, "exile");
      const other = top.find((id) => id !== pick);
      if (other && obj(s, other).zone === "graveyard") {
        log(s, `${p.name} puts ${defOf(s, obj(s, other)).name} into their hand (${src}).`);
        moveObject(s, other, "hand");
      }
      return;
    }
    case "linkedToBottom": {
      // Vault 13: the cards still exiled with the source (CR 607.2a, 400.7) to the bottom of their owners' libraries, each
      // owner ordering theirs (rulings), in APNAP order.
      const zc = ctx.sourceZc ?? 0;
      const key = s.linkedExile?.[`${ctx.sourceId}@${zc}`] ? `${ctx.sourceId}@${zc}` : `${ctx.sourceId}@${zc - 1}`;
      const sc = (s.resolving!.scratch ??= {});
      const all = (s.linkedExile?.[key] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).map((l) => l.id);
      const orders = (sc.bottomOrders ??= {});
      for (const pid of apnap(s, [...new Set(all.map((id) => obj(s, id).owner))])) {
        if (orders[pid]) continue;
        const cards = all.filter((id) => obj(s, id).owner === pid);
        if (cards.length > 1 && !sc.arranged) {
          s.pending = { kind: "arrangeTop", player: pid, how: "bottom", cards, source: src };
          return "paused";
        }
        orders[pid] = sc.arranged ? sc.arranged.top.filter((id) => cards.includes(id)) : cards;
        sc.arranged = undefined;
      }
      const moving = Object.values(orders).flat().filter((id) => all.includes(id));
      if (moving.length) log(s, `${src} puts ${moving.map((id) => defOf(s, obj(s, id)).name).join(", ")} on the bottom of ${moving.length === 1 ? "its owner's library" : "their owners' libraries"}.`);
      for (const id of moving) moveObject(s, id, "library");
      if (s.linkedExile?.[key]) s.linkedExile[key] = s.linkedExile[key]!.filter((l) => !moving.includes(l.id));
      sc.bottomOrders = undefined;
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
      const type = e.cardType ?? "Creature";
      for (const pid of who) {
        const cards = player(s, pid).graveyard.filter((id) => objIsType(s, obj(s, id), type));
        if (cards.length) log(s, `${player(s, pid).name} exiles ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard.`);
        for (const id of cards) {
          moveObject(s, id, "exile");
          if (obj(s, id).zone === "exile") exiled.push([id, obj(s, id).zoneChanges ?? 0]);
        }
      }
      for (const pid of who) {
        const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), type));
        if (mine.length) log(s, `${player(s, pid).name} sacrifices ${mine.map((id) => characteristics(s, obj(s, id)).name).join(", ")}.`);
        for (const id of mine) moveObject(s, id, "graveyard", { sacrificed: true });
      }
      // The same cards, if they're still in exile (a commander may have gone to the command zone instead).
      const back = exiled.filter(([id, zc]) => s.objects[id]?.zone === "exile" && (s.objects[id]!.zoneChanges ?? 0) === zc).map(([id]) => id);
      if (back.length) log(s, `${src} puts ${back.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield.`);
      enterTogether(s, () => back.forEach((id) => moveObject(s, id, "battlefield", { controller: obj(s, id).owner })));
      return;
    }
    case "exiledCardToGraveyard": {
      // Binding Negotiation: "you may put a face-up exiled card they own into their graveyard": chosen as it resolves, not
      // targeted; a face-down exiled card can't be chosen (CR 406.3).
      const sc = (s.resolving!.scratch ??= {});
      const pid = players(s, e.owner, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      const faceUp = (id: ObjectId) => {
        const o = s.objects[id];
        return !!o && o.zone === "exile" && o.owner === pid && !o.isToken && !o.faceDown && faceDownExileGroup(o) === undefined;
      };
      if (!sc.found) {
        const cards = p.exile.filter(faceUp);
        if (!cards.length) return;
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `up to one face-up exiled card ${p.name} owns`, cards, min: 0, max: 1, exiled: true, dig: { looked: cards, to: `to put into ${p.name}'s graveyard`, rest: "stay in exile" } };
        return "paused";
      }
      const found = sc.found.filter(faceUp);
      sc.found = undefined;
      for (const id of found) {
        log(s, `${player(s, ctx.controller).name} puts ${defOf(s, obj(s, id)).name} from exile into ${p.name}'s graveyard.`);
        moveObject(s, id, "graveyard");
      }
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
      // Lost in the Woods: "Then put the revealed card on the bottom of your library": the card revealed from the top,
      // still there, moves to the bottom of that library (no zone change, CR 400.7).
      if (e.what.ref === "revealed" && e.position === "bottom")
        for (const o of objects(s, e.what, ctx).filter((x) => x.zone === "library")) {
          const lib = player(s, o.owner).library;
          lib.splice(lib.indexOf(o.id), 1);
          lib.push(o.id);
          log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} on the bottom of their library.`);
        }
      // Back after an owner's choice: those already put there are done (Tolarian Contempt's several targets).
      const todo = objects(s, e.what, ctx).filter((o) => o.zone !== "library");
      if (order.length) todo.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner));
      const moved: Record<number, { id: ObjectId; zc: number }[]> = {};
      if (e.setsDid) s.resolving!.did = false;
      for (const o of todo) {
        let position = e.position;
        if (position === "ownersChoice" || position === "ownersChoiceSecond" || position === "yourChoice") {
          // Its owner chooses as it resolves; a token goes too, then ceases to exist (CR 111.7). "Your choice" (Arashin
          // Sovereign): this ability's controller chooses, whoever owns it (rulings).
          const sc = (s.resolving!.scratch ??= {});
          if (!sc.topOrBottom) {
            const chooser = position === "yourChoice" ? ctx.controller : o.owner;
            s.pending = position !== "ownersChoiceSecond"
              ? { kind: "chooseOption", player: chooser, source: src, what: "topOrBottom", options: ["top", "bottom"], labels: ["Top", "Bottom"], ...(chooser !== o.owner ? { about: o.id } : {}), prompt: `put ${defOf(s, o).name} on the top or bottom of ${chooser === o.owner ? "your" : `${player(s, o.owner).name}'s`} library?` }
              : { kind: "chooseOption", player: o.owner, source: src, what: "topOrBottom", options: ["second", "bottom"], labels: ["Second from the top", "Bottom"], about: o.id, prompt: `put ${defOf(s, o).name} into your library second from the top or on the bottom?` };
            return "paused";
          }
          position = sc.topOrBottom as "top" | "bottom" | "second";
          sc.topOrBottom = undefined;
          if (position === "top" && e.position === "ownersChoice") s.resolving!.putOnTop = true;
        }
        if (position === "second" || position === "third" || position === "fourth" || position === "fifth") {
          log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} into their library ${position} from the top.`);
          moveObject(s, o.id, "library", { top: true });
          // Under the top card or two, if there are; with fewer, it's on the bottom (rulings on Enigma Sphinx, Long-Term
          // Plans). A commander may have gone to the command zone instead.
          const lib = player(s, o.owner).library;
          if (o.zone === "library" && lib[0] === o.id) lib.splice(Math.min(["second", "third", "fourth", "fifth"].indexOf(position) + 1, lib.length - 1), 0, lib.shift()!);
          continue;
        }
        if (e.beneath !== undefined) {
          // Unexpectedly Absent: under the top X cards; on the bottom with fewer; on top with X = 0 (rulings).
          const n = Math.max(0, amountNow(s, e.beneath, ctx));
          log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} into their library beneath the top ${n} cards.`);
          moveObject(s, o.id, "library", { top: true });
          const lib = player(s, o.owner).library;
          if (o.zone === "library" && lib[0] === o.id) lib.splice(Math.min(n, lib.length - 1), 0, lib.shift()!);
          continue;
        }
        log(s, `${src}: ${player(s, o.owner).name} puts ${defOf(s, o).name} on the ${position} of their library.`);
        moveObject(s, o.id, "library", { top: position === "top" });
        if (o.zone === "library" && !o.isToken) (moved[o.owner] ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
        // The Spot, Living Portal: "If you do": the card is in that library now (a commander may have gone elsewhere).
        if (e.setsDid && o.zone === "library" && !o.isToken) s.resolving!.did = true;
      }
      // Two or more cards put on top (or the bottom) of a library at once: their owner arranges them (CR 401.4), as the
      // instruction ends.
      for (const [owner, cards] of Object.entries(moved))
        if (cards.length > 1) (s.graveyardOrders ??= []).push({ owner: Number(owner), cards, library: { bottom: e.position === "bottom", shuffles: player(s, Number(owner)).shuffles ?? 0, source: src, ...(e.youOrder ? { by: ctx.controller } : {}) } });
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
        if (e.hand && e.filter) {
          // Thought Distortion: "Exile all noncreature, nonland cards from that player's hand and graveyard".
          const inHand = p.hand.filter((id) => printedMatches(e.filter!, defOf(s, obj(s, id))));
          for (const id of inHand) moveObject(s, id, "exile");
          log(s, `${src} exiles ${inHand.length ? inHand.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from ${p.name}'s hand.`);
        } else if (e.hand) {
          const n = p.hand.length;
          for (const id of [...p.hand]) {
            moveObject(s, id, "exile");
            const o = obj(s, id);
            if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
          }
          log(s, `${src} exiles ${p.name}'s hand (${n} card${n === 1 ? "" : "s"}).`);
        }
        const flashback = (id: ObjectId) => graveyardWays(s, obj(s, id)).some((w) => w.kind === "flashback" || w.kind === "grantedFlashback");
        // Cry of the Carnarium: "that were put there from the battlefield this turn" (GameObject.fromBattlefieldTurn).
        // Sphere of Annihilation: "with mana value less than or equal to the number of void counters on ~", worked out now.
        const yardFilter = e.filter?.bound ? bindBound(s, e.filter, amountCtx(s, ctx)) : e.filter;
        const cards = p.graveyard.filter((id) => (!yardFilter || printedMatches(yardFilter, defOf(s, obj(s, id)))) && (!e.filter?.fromBattlefieldThisTurn || obj(s, id).fromBattlefieldTurn === s.turn) && (!e.withFlashback || flashback(id)));
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
        if (e.filter || e.withFlashback) log(s, `${src} exiles ${n ? cards.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing"} from ${p.name}'s graveyard${e.until ? ` until ${src} leaves the battlefield` : ""}.`);
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
        // Fortune, Loyal Steed: "exile it and up to one creature that saddled it this turn": the source too, while it's the
        // object it was (CR 400.7), all exiled at once.
        const me = e.withSelf && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        const withMe = me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) ? [me] : [];
        for (const o of [...withMe, ...objects(s, e.what, ctx).filter((x) => !withMe.includes(x))]) {
          if (o.zone !== "battlefield" || (!withMe.includes(o) && !stamped(o))) continue;
          const d = defOf(s, o);
          log(s, `${src} exiles ${d.name}${e.at || e.hold ? "" : " and returns it"}.`);
          // As it last existed, for "if a Pirate was exiled this way" (Siren's Ruse, CR 608.2h).
          const before = { o: structuredClone(o), ch: structuredClone(characteristics(s, o)), controller: controllerOf(s, o) };
          moveObject(s, o.id, "exile");
          if (s.objects[o.id]?.zone === "exile") (s.resolving!.exiled ??= []).push(before);
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
          const back: Effect = { type: "returnExiled", under: e.under, ...(e.thenDiscardToughness ? { toughnessThisWay: true as const } : {}), ...(e.haste ? { haste: e.haste } : {}), ...(e.counter ? { counter: e.counter } : {}), ...(e.counterIfCreature ? { counterIfCreature: true as const } : {}), ...(e.loyaltyIfPlaneswalker ? { loyaltyIfPlaneswalker: true as const } : {}), ...(e.tapped ? { tapped: true as const } : {}), ...(e.landsTapped ? { landsTapped: true as const } : {}), ...(later.length > 1 ? { cards: later } : {}), ...(e.selfCounterIfYours && ctx.sourceId ? { selfCounter: { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0, counter: e.selfCounterIfYours } } : {}) };
          // Koya, Death from Above: "you may pay {3}{B}. If you don't, return that card ...": the payment asked as the delayed
          // trigger resolves, even if Koya is gone by then (rulings).
          const backs: Effect[] = e.unlessPay ? [{ type: "may", effects: [], pay: { mana: e.unlessPay }, otherwise: [back], text: `pay ${e.unlessPay} to keep ${names} in exile` }] : [back];
          addDelayed(s, e.at === "ownersNextEndStep" ? "playersNextEndStep" : e.at === "yourNextUpkeep" ? "yourNextUpkeep" : e.at === "nextBeginCombat" ? "nextBeginCombat" : "nextEndStep", ctx.controller, first, {
            targets: [],
            effects: [...backs, ...(e.thenDiscardToughness ? [{ type: "discard" as const, who: { ref: "you" as const }, n: { count: { kind: "returnedToughness" as const } } }] : [])],
            text: `${e.unlessPay ? `You may pay ${e.unlessPay}. If you don't, return` : "Return"} ${names} to the battlefield${e.tapped ? " tapped" : ""} under ${e.under === "owner" ? (later.length > 1 ? "their owners'" : "its owner's") : "your"} control${e.thenDiscardToughness ? ", then discard cards equal to its toughness" : ""}.`,
          }, cardIdOf(first), e.at === "ownersNextEndStep" ? first.owner : undefined);
        }
      }
      const back = sc.flickered.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => c?.zone === "exile" && (c.zoneChanges ?? 0) === sc.flickered![i]!.zc);
      // "Tapped and attacking" (The Neutrinos): its controller chooses what it attacks as it enters, during combat only; it
      // was never declared as an attacker (CR 506.3d, 508.4; rulings).
      const attackOptions = e.attacking && inCombat(s) && back.some((c) => isType(defOf(s, c), "Creature")) ? attackChoices(s, ctx.controller, ctx.sourceId) : [];
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, back.find((c) => isType(defOf(s, c), "Creature"))!).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      // Shorecrasher Elemental: face down, whatever the card is (an Aura too: a 2/2 creature enchants nothing, CR 708.2).
      if (e.faceDown) {
        enterTogether(s, () => {
          for (const c of back) {
            log(s, `${src} returns a card to the battlefield face down under ${player(s, e.under === "owner" ? c.owner : ctx.controller).name}'s control.`);
            moveObject(s, c.id, "battlefield", { controller: e.under === "owner" ? c.owner : ctx.controller, putBy: ctx.controller, faceDown: "morph" });
          }
        });
        s.resolving!.flickeredBack = back.filter((c) => c.zone === "battlefield").map((c) => c.id);
        return;
      }
      // Sol'Kanar the Tainted: under the opponent chosen before it (CR 110.2a); with none still in the game, its owner's.
      const chosen = e.underPlayer ? players(s, e.underPlayer, ctx).find((pid) => !player(s, pid).lost) : undefined;
      if (returnFromExile(s, back, (c) => (e.underPlayer ? (chosen ?? c.owner) : e.under === "owner" ? c.owner : ctx.controller), src, e.counter, e.tapped, e.transformed) === "paused") return "paused";
      s.resolving!.flickeredBack = back.filter((c) => c.zone === "battlefield").map((c) => c.id);
      if (attack)
        for (const c of back) {
          if (c.zone !== "battlefield" || !objIsType(s, c, "Creature")) continue;
          c.attacking = attack.player;
          if (attack.planeswalker) c.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
          log(s, `${defOf(s, c).name} is attacking ${attack.label}.`);
        }
      if (e.counterIf) {
        for (const c of back) {
          if (c.zone !== "battlefield" || !objectMatches(s, e.counterIf.filter, c, ctx.controller, false)) continue;
          putCounters(s, c, e.counterIf.counter, 1);
          log(s, `${src} puts a ${e.counterIf.counter} counter on ${defOf(s, c).name}.`);
        }
        invalidateCharacteristics(s);
      }
      if (e.yoursCounterElseTap) {
        for (const c of back) {
          if (c.zone !== "battlefield") continue;
          if (controllerOf(s, c) === ctx.controller) {
            putCounters(s, c, e.yoursCounterElseTap, 1);
            log(s, `${src} puts a ${e.yoursCounterElseTap} counter on ${defOf(s, c).name}.`);
          } else if (!c.tapped) {
            tapPermanent(s, c, undefined, ctx.controller);
            log(s, `${src} taps ${defOf(s, c).name}.`);
          }
        }
        invalidateCharacteristics(s);
      }
      return;
    }
    case "permanentPiles": {
      // CR 700.3: every permanent the player controls (Do or Die: every creature) is separated into two piles (one can be
      // empty, and an Aura can go in a different pile from what it enchants: rulings); a pile is chosen, and all of it is
      // sacrificed (or destroyed) at once. Liliana of the Veil, Do or Die: you separate, that player chooses. Make an
      // Example: each opponent separates their own, in turn order (CR 101.4), then you choose one of each of their piles
      // ("their chosen pile" is the one you chose, rulings), and all of those piles are sacrificed at once.
      const sc = (s.resolving!.scratch ??= {});
      const what = e.types?.length ? e.types.map((t) => t.toLowerCase()).join(" or ") : "permanent";
      const fits = (o: GameObject) => !e.types?.length || e.types.some((t) => objIsType(s, o, t));
      const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : `no ${what}s`);
      if (!sc.pileOf) {
        const pids = e.theySeparate ? apnap(s, players(s, e.who, ctx)) : players(s, e.who, ctx).slice(0, 1);
        sc.pileOf = {};
        for (const pid of pids) {
          const ids = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && fits(obj(s, id)));
          if (ids.length) sc.pileOf[pid] = ids;
        }
        sc.queue = Object.keys(sc.pileOf).map(Number);
        sc.chosen = {};
        sc.pileChoices = {};
      }
      const pileOf = sc.pileOf as Record<number, ObjectId[]>;
      const order = Object.keys(pileOf).map(Number);
      if (!order.length) return;
      // Separating: the next player in the queue, or you for Liliana of the Veil and Do or Die.
      const next = sc.queue![0];
      if (next !== undefined && sc.chosen![next] === undefined) {
        const separator = e.theySeparate ? next : ctx.controller;
        const theirs = separator === next ? "you control" : `${player(s, next).name} controls`;
        const rule = e.theySeparate
          ? `${player(s, ctx.controller).name} chooses one of them, and you sacrifice the ${what}s in it.`
          : `${player(s, next).name} chooses one of them, and all ${what}s in it are ${e.destroy ? "destroyed (they can't be regenerated)" : "sacrificed"}.`;
        s.pending = { kind: "pickPermanents", player: separator, source: src, action: "pile", what, options: pileOf[next]!, count: pileOf[next]!.length, min: 0, anyNumber: true, of: next, pickFor: next, ...(e.types?.length || e.theySeparate ? { prompt: `separate all ${what}s ${theirs} into two piles: click the ones for the first pile (the rest form the second). ${rule}` } : {}) };
        return "paused";
      }
      // Choosing: you for each opponent's piles (Make an Example), or that player (Liliana, Do or Die).
      if (sc.pileChoice !== undefined) {
        const done = order.find((pid) => sc.pileChoices![pid] === undefined)!;
        sc.pileChoices![done] = sc.pileChoice;
        sc.pileChoice = undefined;
      }
      const pilesOf = (pid: number): [ObjectId[], ObjectId[]] => {
        const one = sc.chosen![pid] ?? [];
        return [one, pileOf[pid]!.filter((id) => !one.includes(id))];
      };
      const undecided = order.find((pid) => sc.pileChoices![pid] === undefined);
      if (undecided !== undefined) {
        const [one, two] = pilesOf(undecided);
        const separator = e.theySeparate ? undecided : ctx.controller;
        log(s, `${player(s, separator).name} separates ${separator === undecided ? `their ${what}s` : `${player(s, undecided).name}'s ${what}s`} into two piles: ${names(one)}; and ${names(two)}.`);
        const chooser = e.theySeparate ? ctx.controller : undecided;
        const verb = e.destroy ? "destroy" : "sacrifice";
        s.pending = {
          kind: "chooseOption",
          player: chooser,
          source: src,
          what: "pile",
          options: ["0", "1"],
          labels: [`Pile 1: ${names(one)}`, `Pile 2: ${names(two)}`],
          piles: [one, two],
          of: undecided,
          sacrificePile: true,
          ...(e.destroy ? { destroyPile: true as const } : {}),
          prompt: chooser === undecided ? `choose the pile of your ${what}s to ${verb}` : `choose the pile of ${player(s, undecided).name}'s ${what}s that they sacrifice`,
        };
        return "paused";
      }
      // All at once (CR 608.2c): every chosen pile, as it is now.
      const gone = order.flatMap((pid) => pilesOf(pid)[sc.pileChoices![pid]!]!.map((id) => ({ pid, id })));
      for (const { pid, id } of gone) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || controllerOf(s, o) !== pid) continue;
        if (e.destroy) destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, true, ctx.controller);
        else if (canBeSacrificed(s, o)) {
          log(s, `${player(s, pid).name} sacrifices ${defOf(s, o).name}.`);
          moveObject(s, id, "graveyard", { sacrificed: true });
        }
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
      if (back.length && returnFromExile(s, back, (c) => (e.under === "owner" ? c.owner : ctx.controller), src, e.counters ? [...(e.counter ? [e.counter] : []), ...e.counters] : e.counter, e.tapped || (e.landsTapped ? "lands" : undefined), false, e.counterIfCreature, e.loyaltyIfPlaneswalker) === "paused") {
        sc.returning ??= list.filter((l) => back.some((b) => b.id === l.id));
        return "paused";
      }
      // Phelia: "If it entered under your control" (the card it became, CR 400.7), a counter on the source if it's still there.
      const came = sc.returning ?? list.filter((l) => back.some((b) => b.id === l.id));
      sc.returning = undefined;
      // Obzedat: "It gains haste", for as long as it remains on the battlefield (rulings).
      if (e.haste)
        for (const l of came) {
          const c = s.objects[l.id];
          if (c?.zone === "battlefield" && (c.zoneChanges ?? 0) === l.zc + 1) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: c.id, duration: e.haste === "endOfTurn" ? "endOfTurn" : "game", affected: [c.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
        }
      if (e.haste) invalidateCharacteristics(s);
      if (e.toughnessThisWay)
        s.resolving!.returnedToughness = came.reduce((n, l) => {
          const c = s.objects[l.id];
          return c?.zone === "battlefield" && (c.zoneChanges ?? 0) === l.zc + 1 && characteristics(s, c).types.includes("Creature") ? n + Math.max(0, toughness(s, c)) : n;
        }, 0);
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
    case "shuffleFromExileThisTurn":
      s.dontBlinkTurn = s.turn;
      log(s, "Until end of turn, creatures that would enter from exile or after being cast from exile are shuffled into their owners' libraries instead.");
      return;
    case "exileUncastThisTurn":
      if (e.tokens) s.exileUncastAnyTurn = s.turn;
      else s.exileUncastTurn = s.turn;
      log(s, `Until end of turn, ${e.tokens ? "creatures" : "nontoken creatures"} that weren't cast are exiled instead of entering the battlefield.`);
      return;
    case "exileDyingThisTurn":
      if (e.opponentsOfYou) s.exileDyingOpponents = [...(s.exileDyingOpponents ?? []).filter((x) => x.turn === s.turn && x.player !== ctx.controller), { turn: s.turn, player: ctx.controller }];
      else s.exileDyingTurn = s.turn;
      return;
    case "noSearchThisTurn":
      s.noSearchTurn = s.turn;
      log(s, "Players can't search libraries this turn.");
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
        // One card chosen at random, seen only by the player looking.
        if (e.atRandom) {
          const id = p.hand.length ? p.hand[Math.floor(nextRandom(s) * p.hand.length)]! : undefined;
          log(s, `${player(s, ctx.controller).name} looks at a card at random in ${p.name}'s hand.`);
          if (id) log(s, `${p.name}'s card: ${defOf(s, obj(s, id)).name}.`, ctx.controller);
          continue;
        }
        // Case the Joint: the top card of their library, seen only by the player looking; it stays there.
        if (e.topCard) {
          const top = p.library[0];
          log(s, `${player(s, ctx.controller).name} looks at the top card of ${pid === ctx.controller ? "their" : `${p.name}'s`} library.`);
          log(s, `The top card of ${p.name}'s library: ${top ? defOf(s, obj(s, top)).name : "none (it's empty)"}.`, ctx.controller);
          continue;
        }
        // Mindblaze: "reveals their library", every card in it, the order unchanged.
        if (e.library) {
          log(s, `${p.name} reveals their library: ${p.library.map((id) => defOf(s, obj(s, id)).name).join(", ") || "no cards"}.`);
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
    case "lookAtFaceDown":
      // Only the player looking learns what it is; a creature that's been turned face up shows nothing new.
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || !o.faceDown) continue;
        log(s, `${player(s, ctx.controller).name} looks at a face-down creature.`);
        log(s, `That face-down creature is ${realDefOf(s, o).name}.`, ctx.controller);
      }
      return;
    case "attackWithoutTapping": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (me?.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc)) me.attackWithoutTappingCombat = { turn: s.turn, combat: s.combatsThisTurn ?? 0 };
      return;
    }
    case "noCombatDamage":
      if (e.asUnblocked) {
        for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.unblockedDamageTurn = s.turn;
        return;
      }
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
      fireEvent(s, { type: "attached", id: me.id, host: c.id });
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
        if (e.byEventPlayer ? by !== ctx.event?.player : by !== ctx.controller && !e.byController) continue; // only your own permanents (CR 701.21a)
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
      // Zareth San: what it attacks is chosen as it enters (CR 508.4), during combat only (506.3d).
      const attackOptions = e.chooseDefender && inCombat(s) ? attackChoices(s, ctx.controller, ctx.sourceId) : [];
      const sc = (s.resolving!.scratch ??= {});
      if (attackOptions.length > 1 && sc.attackWhom === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attackWhom", options: attackOptions.map((a) => a.key), labels: attackOptions.map((a) => a.label), prompt: `choose what ${defOf(s, o).name} attacks` };
        return "paused";
      }
      const attack = attackOptions.length > 1 ? attackOptions.find((a) => a.key === sc.attackWhom) : attackOptions[0];
      // Attacking as it enters, before its enters abilities trigger ("if it's attacking", Thousand-Faced Shadow).
      enterTogether(s, () => {
        moveObject(s, o.id, "battlefield", { tapped: true });
        if ((o.zone as string) !== "battlefield") return;
        if (e.chooseDefender) {
          if (attack) {
            o.attacking = attack.player;
            if (attack.planeswalker) o.attackingPermanent = attackingPermanentOf(s, attack.planeswalker);
          }
        } else if (ctx.lki) enterAttacking(s, o, ctx.lki);
      });
      if ((o.zone as string) !== "battlefield") return;
      log(s, `${player(s, ctx.controller).name} puts ${characteristics(s, o).name} onto the battlefield tapped${o.attacking !== undefined ? ` and attacking ${attackedName(s, o)}` : ""}${e.chooseDefender ? "" : " (ninjutsu)"}.`);
      return;
    }
    case "forEachThisWay": {
      // All of them left first (rulings on Rampage of the Clans); each player then gets theirs, in APNAP order, as many as
      // they controlled (CR 608.2h). A destroyed one counts even if it went somewhere other than a graveyard (rulings).
      const counts = new Map<PlayerId, number>();
      for (const x of s.resolving?.[e.which] ?? [])
        if ((!e.graveyard || ("died" in x && x.died)) && objectMatches(s, e.filter, x.o, ctx.controller, false, undefined, x.ch)) counts.set(x.ch.controller, (counts.get(x.ch.controller) ?? 0) + (e.manaValue ? (x.o.faceDown ? 0 : defMv(defOf(s, x.o))) : e.power ? Math.max(0, x.ch.power ?? 0) : 1));
      // A search pauses for its player's choice (Winds of Abandon): the players done so far are kept.
      const done = (s.resolving!.scratch ??= {}).forEachDone ?? [];
      s.resolving!.scratch.forEachDone = done;
      for (const pid of apnap(s, [...counts.keys()])) {
        if (player(s, pid).lost || done.includes(pid)) continue;
        const n = counts.get(pid)! * (e.times ?? 1);
        if (!n) continue;
        // Stench of Evil: a punisher once for each of theirs ("repeat this process", Effect punisher `times`).
        for (const inner of e.effects) if (runEffect(s, inner.type === "createToken" || inner.type === "draw" || inner.type === "search" || inner.type === "loseLife" || inner.type === "gainLife" ? { ...inner, n } : inner.type === "punisher" ? { ...inner, times: n } : inner.type === "dig" ? { ...inner, n, count: n } : inner, { ...ctx, eachOne: pid }) === "paused") return "paused";
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
    case "returnExiledNamed": {
      // Sengir Nosferatu's Bat: a card in exile with that name (a face-down card has none, CR 708.2a), anyone's (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const ok = (id: ObjectId) => s.objects[id]?.zone === "exile" && !obj(s, id).isToken && !obj(s, id).faceDown && !obj(s, id).hiddenExile && hasName(defOf(s, obj(s, id)).name, e.name);
      const cards = s.turnOrder.flatMap((pid) => player(s, pid).exile).filter(ok);
      if (!sc.found && cards.length > 1) {
        s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `an exiled card named ${e.name}`, cards, min: 1, max: 1, exiled: true, dig: { looked: cards, to: "to return to the battlefield under its owner's control", rest: "stay in exile" } };
        return "paused";
      }
      const id = (sc.found ?? cards).find(ok);
      sc.found = undefined;
      if (!id) {
        log(s, `There's no exiled card named ${e.name} to return.`);
        return;
      }
      return returnFromExile(s, [obj(s, id)], (c) => c.owner, src);
    }
    case "warpExile":
      for (const o of objects(s, { ref: "subject" }, ctx)) {
        log(s, `${defOf(s, o).name} is exiled (warp). Its owner may cast it after this turn.`);
        moveObject(s, o.id, "exile");
        // The card, while it stays exiled (CR 702.185a, 400.7); a token has stopped existing (CR 111.8).
        if (o.zone === "exile" && !o.isToken) o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "warp", turn: s.turn };
      }
      return;
    case "playLinkedThisTurn": {
      // Raphael, Serpent's Soul-Jar, Kayla's Music Box: the cards its own exile took (CR 607.2a), for the rest of this turn.
      if (!ctx.sourceId) return;
      (s.linkedPlays ??= []).push({ player: ctx.controller, source: `${ctx.sourceId}@${ctx.sourceZc ?? 0}`, turn: s.turn, sourceName: src, ...(e.filter ? { filter: e.filter } : {}), ...(e.castOnly ? { castOnly: true as const } : {}), ...(e.all ? { all: true as const } : {}), ...(e.owned ? { owned: true as const } : {}) });
      log(s, `${player(s, ctx.controller).name} may ${e.castOnly ? "cast" : "play"} ${e.all ? "cards" : e.filter ? `a ${e.filter.text.replace(/ card$/, "")} ${e.castOnly ? "spell" : "card"}` : "a card"} ${e.all && e.owned ? "they own " : ""}exiled with ${src} this turn.`);
      return;
    }
    case "castLinkedFree": {
      // Court of Locthwain: one spell from among the cards its own exile took (CR 607.2a), for the rest of this turn.
      if (!ctx.sourceId) return;
      (s.linkedFreeCasts ??= []).push({ player: ctx.controller, source: `${ctx.sourceId}@${ctx.sourceZc ?? 0}`, turn: s.turn, sourceName: src, ...(e.filter ? { filter: e.filter } : {}) });
      log(s, `${player(s, ctx.controller).name} may cast ${e.filter ? `a ${e.filter.text.replace(/ card$/, "")}` : "a"} spell from among the cards exiled with ${src} this turn without paying its mana cost.`);
      return;
    }
    case "impulse": {
      // Exiled face up (CR 406.3); the permission belongs to this object only (CR 400.7). Casey & Raph: the player whose
      // library it is plays it.
      const p = player(s, e.player ? (players(s, e.player, ctx)[0] ?? ctx.controller) : e.theyPlay && e.who ? (players(s, e.who, ctx)[0] ?? ctx.controller) : ctx.controller);
      // "Exile the top card of each player's library" (Nashi): each library in turn, all part of one group.
      // "Exile the top card of each opponent's library" (Brainstealer Dragon, Stolen Strategy): the same, opponents only.
      // "Each of those opponents' libraries" (Breeches, Brazen Plunderer): the opponents dealt damage.
      // Author of Shadows: every opponent's graveyard exiled, then one card among them chosen (CR 608.2d) to get the
      // permission below; the rest stay exiled with none.
      if (e.graveyards && e.choose && e.who) {
        const sc = (s.resolving!.scratch ??= {});
        if (!sc.impulseChoice) {
          const all: ObjectId[] = [];
          for (const pid of apnap(s, players(s, e.who, ctx))) {
            const ids = [...player(s, pid).graveyard];
            for (const id of ids) moveObject(s, id, "exile");
            all.push(...(e.ownersPlay || e.ownAndLesser ? ids.filter((id) => obj(s, id).zone === "exile") : ids));
          }
          if (all.length) log(s, `${p.name} exiles ${all.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${e.who.ref === "eachOpponent" ? "each opponent's graveyard" : "graveyards"}.`);
          const ids = all.filter((id) => !e.chooseAmong || printedMatches(e.chooseAmong, defOf(s, obj(s, id))));
          sc.impulseChoice = { ids };
          if (ids.length > 1) {
            s.pending = { kind: "chooseOption", player: p.id, source: src, what: "impulseChoice", options: ids, labels: ids.map((id) => defOf(s, obj(s, id)).name), prompt: `choose ${e.chooseAmong ? `a ${e.chooseAmong.text}` : "one of them"}; you may ${e.castOnly ? "cast" : "play"} it${e.until === "exiled" ? " for as long as it remains exiled" : ""}` };
            return "paused";
          }
        }
      }
      if (!(e.graveyards && e.choose) && (e.who?.ref === "eachPlayer" || e.who?.ref === "eachOpponent" || e.who?.ref === "eventPlayers" || (e.graveyards && e.who?.ref === "target"))) {
        const oneOf = e.oneOf ? `g${s.nextId++}` : undefined;
        const all: ObjectId[] = [];
        for (const pid of apnap(s, players(s, e.who, ctx))) {
          const lib = player(s, pid).library;
          // Dream Harvest: down to the card that brings the total mana value to the number (X as 0, CR 202.3e; a land
          // counts 0), the whole library if it never gets there.
          let total = 0;
          const at = e.untilTotalMv !== undefined ? lib.findIndex((id) => (total += defMv(defOf(s, obj(s, id)))) >= e.untilTotalMv!) : -1;
          const ids = e.graveyards ? player(s, pid).graveyard.filter((id) => !e.graveyardFilter || printedMatches(e.graveyardFilter, defOf(s, obj(s, id)))) : e.untilTotalMv !== undefined ? lib.slice(0, at < 0 ? lib.length : at + 1) : lib.slice(0, amountNow(s, e.n, ctx));
          for (const id of ids) {
            moveObject(s, id, "exile");
            const o = obj(s, id);
            if (o.zone !== "exile" && (e.ownersPlay || e.ownAndLesser)) continue;
            // Rocco: each player plays the card they exiled, until this ability's controller's next end step.
            const holder = e.ownersPlay ? pid : p.id;
            o.mayPlay = { player: holder, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.ownersPlay && holder !== ctx.controller ? { untilOf: ctx.controller } : {}), ...(e.castOnly ? { castOnly: true as const } : {}), ...(oneOf ? { oneOf } : {}), ...(e.life ? { life: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.free ? { free: true as const } : {}) };
          }
          all.push(...(e.ownersPlay || e.ownAndLesser ? ids.filter((id) => obj(s, id).zone === "exile") : ids));
        }
        // Triple Triad: only the card you own exiled this way and those with lesser mana value than it (X as 0, CR 202.3e,
        // rulings); none at all if you exiled none.
        if (e.ownAndLesser) {
          const mine = all.find((id) => obj(s, id).owner === ctx.controller);
          const mv = mine !== undefined ? defMv(defOf(s, obj(s, mine))) : -1;
          for (const id of all) if (id !== mine && !(defMv(defOf(s, obj(s, id))) < mv)) obj(s, id).mayPlay = undefined;
        }
        if (s.resolving) (s.resolving.impulsed ??= []).push(...all);
        if (all.length && (e.ownersPlay || e.ownAndLesser)) {
          const playable = all.filter((id) => obj(s, id).mayPlay);
          log(s, `Each player exiles the top ${typeof e.n === "number" && e.n > 1 ? `${e.n} cards` : "card"} of their library: ${all.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, obj(s, id).owner).name})`).join(", ")}. ${e.ownersPlay ? `Until ${p.name}'s next ${e.until === "yourNextTurn" ? "turn" : "end step"}, each player may play the ${typeof e.n === "number" && e.n > 1 ? "cards" : "card"} they exiled` : playable.length ? `${p.name} may play ${playable.map((id) => defOf(s, obj(s, id)).name).join(", ")} without paying their mana costs this turn` : `${p.name} may play none of them`}.`);
          return;
        }
        if (all.length) log(s, `${p.name} exiles ${all.map((id) => defOf(s, obj(s, id)).name).join(", ")} from ${e.graveyards ? (e.who.ref === "target" ? `${players(s, e.who, ctx).map((pid) => player(s, pid).name).join("")}'s graveyard` : "each opponent's graveyard") : `the top of each ${e.who.ref === "eachOpponent" ? "opponent's " : ""}library`} and may ${e.oneOf ? "play one of them" : e.castOnly ? "cast them" : "play them"}${e.free ? " without paying their mana costs" : ""}${e.life ? ", paying life rather than mana for a spell" : ""}${e.anyType ? ", spending mana as though it were mana of any color" : ""}${e.until === "thisTurn" ? " this turn" : e.until === "exiled" ? " for as long as they remain exiled" : ""}.`);
        return;
      }
      const from = e.who ? players(s, e.who, ctx)[0] : p.id;
      if (from === undefined) return;
      if (e.randomFromHand) {
        // Elkin Lair: one card chosen at random from that player's hand, exiled face up (CR 406.3); that player may play it
        // this turn, the usual way (rulings: at any point this turn, not only as this resolves).
        const hand = player(s, from).hand;
        if (!hand.length) return void log(s, `${player(s, from).name} has no cards in hand.`);
        const id = hand[Math.floor(nextRandom(s) * hand.length)]!;
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") return;
        o.mayPlay = { player: from, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn };
        if (s.resolving) (s.resolving.impulsed ??= []).push(o.id);
        log(s, `${player(s, from).name} exiles ${defOf(s, o).name}, chosen at random, from their hand and may play it this turn.`);
        return;
      }
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
        log(s, `${p.name} chooses ${defOf(s, o).name} and may ${e.castOnly ? "cast" : "play"} it${e.anyType ? ", spending mana as though it were mana of any color" : ""}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : e.until === "exiled" ? " for as long as it remains exiled" : ""}.`);
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
        // Nahiri: free only if it's an Equipment card.
        const free = e.free && (!e.freeFor || printedMatches(e.freeFor, defOf(s, o)));
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: e.until, turn: s.turn, ...(e.until === "whileControlled" && ctx.sourceId ? { source: { id: ctx.sourceId, zc: ctx.sourceZc ?? 0 } } : {}), ...(e.castOnly ? { castOnly: true as const } : {}), ...(oneOf ? { oneOf } : {}), ...(oneOf && e.oneOfMax ? { oneOfMax: e.oneOfMax } : {}), ...(e.spellFilter ? { castFilter: e.spellFilter } : {}), ...(another ? { untilAnother: another } : {}), ...(free ? { free: true as const } : {}), ...(free && e.orPay ? { orPay: true as const } : {}), ...(e.anyType ? { anyType: true as const } : {}), ...(e.life ? { life: true as const } : {}), ...(e.attackedWithToken ? { attackedWithToken: true as const } : {}), ...(e.attackedWithCommander ? { attackedWithCommander: true as const } : {}), ...(e.attackedWithType ? { attackedWithType: e.attackedWithType } : {}), ...(e.attackedWithSource && ctx.sourceId ? { attackedWithSource: { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 } } : {}), ...(e.attackedWithAtLeast ? { attackedWithAtLeast: e.attackedWithAtLeast } : {}), ...(e.loreOnSource && ctx.sourceId ? { loreOn: { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 } } : {}), ...(e.ifControl ? { ifControl: e.ifControl } : {}), ...(e.affinity ? { affinity: e.affinity } : {}), ...(e.castAnotherThisTurn ? { castAnotherThisTurn: true as const } : {}), ...(e.castTrigger && ctx.sourceId ? { castTrigger: { body: e.castTrigger, sourceId: ctx.sourceId, sourceZc: ctx.sourceZc ?? 0, sourceCardId: cardIdOf(obj(s, ctx.sourceId)), ...(e.playTrigger ? { play: true as const } : {}) } } : {}) };
        if (e.linked && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
      }
      if (ids.length === 1 && s.resolving) s.resolving.exiledTop = { id: ids[0]!, zc: s.objects[ids[0]!]!.zoneChanges ?? 0 };
      if (s.resolving) (s.resolving.impulsed ??= []).push(...ids);
      if (ids.length)
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of ${from === p.id ? "their" : `${player(s, from).name}'s`} library and may ${e.castOnly ? "cast" : "play"} ${e.oneOfMax ? `up to ${e.oneOfMax} of them` : e.spellFilter && e.oneOf ? `${/^[aeiou]/i.test(e.spellFilter.text) ? "an" : "a"} ${e.spellFilter.text.replace(/ card$/, "")} spell from among them` : e.spellFilter && /^card /.test(e.spellFilter.text) ? `spells ${e.spellFilter.text.replace(/^card /, "")} from among them` : e.castFilter ? `the ${e.castFilter.text.replace(/ card$/, "")} spells among them` : ids.length === 1 ? "it" : "them"}${e.freeFor ? `, ${e.freeFor.text.replace(/ card$/, "")} spells with or without paying their mana costs` : e.free ? (e.orPay ? ", with or without paying their mana costs" : " without paying its mana cost") : ""}${e.until === "thisTurn" ? " this turn" : e.until === "nextTurn" ? " until the end of their next turn" : e.until === "yourNextTurn" ? " until their next turn" : e.until === "yourNextEndStep" ? " until their next end step" : e.until === "yourNextUpkeep" ? " until their next upkeep" : e.until === "duringNextTurn" ? " during their next turn" : e.until === "yourNextCombat" ? " until end of combat on their next turn" : e.until === "whileControlled" ? ` for as long as they control ${ctx.sourceId ? defOf(s, obj(s, ctx.sourceId)).name : "it"}` : ""}${e.attackedWithToken ? " during any turn they attacked with a token" : ""}${e.attackedWithCommander ? " during any turn they attacked with a commander" : ""}${e.attackedWithType ? ` during any turn they attacked with ${/^[AEIOU]/.test(e.attackedWithType) ? "an" : "a"} ${e.attackedWithType}` : ""}${e.loreOnSource ? ` during any turn they put a lore counter on ${src}` : ""}${e.ifControl ? ` while they control ${/^[AEIOU]/.test(e.ifControl.text) ? "an" : "a"} ${e.ifControl.text}` : ""}.`);
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

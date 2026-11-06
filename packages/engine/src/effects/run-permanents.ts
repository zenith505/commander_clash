import type { Effect, Modification, TokenSpec } from "../abilities";
import { abilitiesOf, realDefOf, enchantOf, basePowerNow, cardIdOf, defOf, roomOf, isType, objHasKeyword, objIsType, power, toughness } from "../cards";
import { turnFaceUpByEffect, attackablePermanentProblem, attackedName, attackingPermanentOf, auraHostKey, auraHostLabels, auraHostOptions, clearCombat, draw, enterTogether, livingPlayers, log, provokersOf, moveObject, obj, opponents, player, removeFromCombat, setUnlocked, tapPermanent, untapPermanent, whileControlledHolds, whileTappedHolds, isEnchanted } from "../game";
import { nextRandom } from "../rng";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { countersRemoved, countersStay, putPlayerCounters, putCounters, removableCounters, tokenBatch, withModular, withPutter } from "../counters";
import { compileCard } from "../oracle";
import type { ContinuousEffect, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { isDoubleFacedDef, setFace } from "../faces";
import { becomePrepared, unprepare } from "../prepare";
import { objectMatches, playerProtectedFrom } from "./targeting";
import { ResolveCtx, convokedFor, objects, amountNow, fixMods, players, runEffect } from "./resolve";
import { exiledWithCounter } from "./run-choices";
import { voteTally } from "./run-votes";
import { createExtraTokens, createToken } from "./run-tokens";
import { discardCards, discardToTop } from "./run-library";
import { describeMods } from "./describe";
import { evolves, fireEvent } from "./triggers";
import { phaseIn, phaseOut } from "../phasing";
import { isSuspended } from "./run-zones";
import { keywordLabel, protectionFromPlayer, THAT_PLAYER_PROTECTION } from "../keywords";

/**
 * Transform a permanent (CR 701.27a): turn it over so its other face is up. Only a double-faced card or token can
 * (701.27c, 712.9), not one that's face down (712.15a), and not into an instant or sorcery face (701.27d, 712.10). It's
 * the same object (712.18): its counters, damage, attachments and the effects on it stay.
 */
export function transformPermanent(s: GameState, o: GameObject, byDayNight = false, convert = false): boolean {
  if (!canTransform(s, o, byDayNight)) return false;
  const d = s.cards[o.cardId]!;
  const to = o.face === 1 ? 0 : 1;
  const was = defOf(s, o).name;
  setFace(s, o, to === 0 ? undefined : to);
  o.transforms = (o.transforms ?? 0) + 1;
  invalidateCharacteristics(s);
  log(s, `${was} ${convert ? "converts" : "transforms"} into ${defOf(s, o).name}.`);
  // "As this creature transforms into ~, you get an emblem with ..." (CR 712.20): part of transforming.
  const as = compileCard(defOf(s, o)).asTransforms;
  if (as) {
    const ctx: ResolveCtx = { controller: controllerOf(s, o), sourceId: o.id, sourceZc: o.zoneChanges ?? 0, sourceDef: defOf(s, o), targets: [], legal: [] };
    for (const e of as.effects) runEffect(s, e, ctx);
  }
  fireEvent(s, { type: "transformed", id: o.id, face: to });
  return true;
}

/** Whether transformPermanent would turn this permanent over now. */
export function canTransform(s: GameState, o: GameObject, byDayNight = false): boolean {
  const d = s.cards[o.cardId];
  if (o.zone !== "battlefield" || o.faceDown || !d?.faces || d.faces.length !== 2 || (d.layout !== "transform" && d.layout !== "modal_dfc")) return false;
  // "Can't transform" (Bound by Moonsilver): not by any effect, daybound and nightbound too, nor convert (CR 701.28f).
  if (characteristics(s, o).cantTransform) return false;
  // A daybound or nightbound permanent transforms only as day and night say (CR 702.145b, e).
  if (!byDayNight && (objHasKeyword(s, o, "Daybound") || objHasKeyword(s, o, "Nightbound"))) return false;
  const to = o.face === 1 ? 0 : 1;
  return !d.faces[to]!.types.some((t) => t === "Instant" || t === "Sorcery");
}

/**
 * Turn a face-up permanent face down (Cyber Conversion): it's what `as` says, a 2/2 Cyberman artifact creature with no
 * name, color or other text (CR 708.2), still the same object with its counters, attachments and the effects on it
 * (708.8 for the other way), and a new timestamp (613.7f). A face-down one stays as it is (708.2b); a double-faced one
 * (a melded one, a double-faced token, CR 707.8a) can't be turned face down (712.16), nor a merged permanent with one
 * among its components, since each of them would be (730.2f).
 */
function turnFaceDown(s: GameState, o: GameObject, as: "cyberman" | "morph", src: string) {
  if (o.zone !== "battlefield" || o.faceDown) return;
  const doubleFaced = (x: GameObject) => !!x.melded || !!x.tokenBackUp || (!!s.cards[x.cardId] && (isDoubleFacedDef(s.cards[x.cardId]!) || !!s.cards[x.cardId]!.tokenBack));
  const name = defOf(s, o).name;
  if ([o, ...(o.merged?.parts ?? []).map((id) => obj(s, id))].some(doubleFaced)) {
    log(s, `${src}: ${name} is double-faced and can't be turned face down.`);
    return;
  }
  o.faceDown = as;
  o.timestamp = s.nextTimestamp++;
  invalidateCharacteristics(s);
  log(s, `${src} turns ${name} face down: it's a 2/2 ${as === "cyberman" ? "Cyberman artifact " : ""}creature.`);
}

/**
 * A double-faced token turns its back face up (CR 701.27a, 111.10i): only a token that is one, not one copying it (CR
 * 707.8a covers token copies). A Phyrexian has no other face to go back to, so transforming it again does nothing
 * (CR 701.27f).
 */
function transformToken(s: GameState, me: GameObject): boolean {
  if (me.zone !== "battlefield" || !me.isToken || me.copyOf || me.copyEffects?.length || characteristics(s, me).cantTransform) return false;
  const front = defOf(s, me);
  const back = front.tokenBack;
  if (!back) return false;
  s.cards[back.oracleId] ??= back;
  me.cardId = back.oracleId;
  me.tokenBackUp = true;
  me.transforms = (me.transforms ?? 0) + 1;
  invalidateCharacteristics(s);
  log(s, `${front.name} transforms into ${back.name}.`);
  fireEvent(s, { type: "transformed", id: me.id, face: 1 });
  return true;
}

/**
 * Flip a permanent (CR 710): a flip card's, unflipped, turns so its flipped half's name, text, type line, power and
 * toughness apply; its color and mana cost don't change (710.1c). Nothing else can flip, and it can't flip back (710.4).
 * It's the same object: counters, damage and effects on it stay.
 */
export function flipPermanent(s: GameState, o: GameObject): boolean {
  const d = s.cards[o.cardId];
  if (o.zone !== "battlefield" || o.faceDown || o.face === 1 || d?.layout !== "flip" || d.faces?.length !== 2) return false;
  const was = defOf(s, o).name;
  setFace(s, o, 1);
  invalidateCharacteristics(s);
  log(s, `${was} flips into ${defOf(s, o).name}.`);
  return true;
}

/**
 * Proliferate (CR 701.27a): choose any number of permanents and players with counters; each gets another of
 * each kind it has. Chosen for the player: their own permanents' helpful counters, opponents' permanents'
 * -1/-1 and stun counters, their own energy and experience, and opponents' poison.
 */
export function proliferate(s: GameState, you: PlayerId, src: string): ObjectId[] {
  const helpful = (k: string) => k !== "-1/-1" && k !== "stun" && k !== "age" && k !== "time" && k !== "fade";
  const names: string[] = [];
  const got: ObjectId[] = [];
  invalidateCharacteristics(s);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const mine = controllerOf(s, o) === you;
    let added = false;
    for (const [k, n] of Object.entries(o.counters)) {
      if (!n || (mine ? !helpful(k) : !harmfulCounter(k))) continue;
      if (putCounters(s, o, k, 1)) added = true;
    }
    if (added) names.push(defOf(s, o).name), got.push(id);
  }
  for (const p of s.players) {
    if (p.lost) continue;
    if (p.id === you) {
      if (p.energy) putPlayerCounters(s, p.id, "energy", 1), names.push(`${p.name} (energy)`);
      if (p.experience) putPlayerCounters(s, p.id, "experience", 1), names.push(`${p.name} (experience)`);
    } else {
      if (p.poison) putPlayerCounters(s, p.id, "poison", 1), names.push(`${p.name} (poison)`);
      if (p.rad) putPlayerCounters(s, p.id, "rad", 1), names.push(`${p.name} (rad)`);
    }
  }
  log(s, `${src}: ${player(s, you).name} proliferates${names.length ? ` (${names.join(", ")})` : ""}.`);
  fireEvent(s, { type: "proliferated", player: you });
  return got;
}

/**
 * How many times a player proliferates for one instruction to (`n`): twice as many for each Tekuthal they control, each
 * one's replacement applying to the proliferating another made (CR 614.1a, 616.1).
 */
export function proliferateTimes(s: GameState, you: PlayerId, n: number): number {
  const doublers = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && abilitiesOf(s, obj(s, id)).proliferateTwice).length;
  return n * 2 ** doublers;
}

/** What an attacking creature could be made to attack instead (reselectAttack): not what it attacks now. */
export function reselectOptions(s: GameState, o: GameObject): { key: string; label: string; player: PlayerId; planeswalker?: ObjectId }[] {
  const you = controllerOf(s, o);
  const now = o.attackingPermanent ? `${o.attacking}:${o.attackingPermanent.id}` : String(o.attacking);
  return livingPlayers(s)
    .filter((x) => x !== you)
    .flatMap((x) => [
      { key: String(x), label: player(s, x).name, player: x as PlayerId },
      ...s.battlefield.filter((id) => attackablePermanentProblem(s, you, x, id) === null).map((id) => ({ key: `${x}:${id}`, label: `${defOf(s, obj(s, id)).name} (${objIsType(s, obj(s, id), "Battle") ? "protected by " : ""}${player(s, x).name})`, player: x as PlayerId, planeswalker: id })),
    ])
    .filter((x) => x.key !== now);
}

/** Counters that hurt the permanent they're on: -1/-1 shrinks it, stun keeps it from untapping (CR 122.1d). */
export const harmfulCounter = (k: string) => k === "-1/-1" || k === "stun";

/** Changing permanents: tap, counters, connive, explore, renown, evolve, continuous effects, attaching. */
export function runPermanentsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "unlockDoor": {
      // CR 709.5f: its controller chooses a locked door of a Room they control, and the Room gets that designation.
      const among = e.what ? objects(s, e.what, ctx).map((o) => o.id) : undefined;
      // "Lock or unlock" (CR 709.5g): its unlocked doors too, each to be locked.
      const doors = [...lockedDoors(s, ctx.controller, among), ...(e.orLock ? unlockedDoors(s, ctx.controller, among).map((d) => ({ ...d, lock: true })) : [])];
      if (!doors.length) return;
      const sc = (s.resolving!.scratch ??= {});
      if ((doors.length > 1 || e.orLock) && sc.door === undefined) {
        const rooms = new Set(doors.map((d) => d.id)).size;
        const name = (d: (typeof doors)[number]) => (rooms > 1 ? `${d.name} (${defOf(s, obj(s, d.id)).name})` : d.name);
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "unlockDoor", options: doors.map((d) => `${d.id}:${d.door}`), labels: doors.map((d) => (e.orLock ? `${"lock" in d ? "Lock" : "Unlock"} ${name(d)}` : name(d))), prompt: e.orLock ? "choose a door to lock or unlock" : "choose a locked door to unlock" };
        return "paused";
      }
      const pick = doors.find((d) => `${d.id}:${d.door}` === sc.door) ?? doors[0]!;
      sc.door = undefined;
      const o = obj(s, pick.id);
      if ("lock" in pick) {
        log(s, `${player(s, ctx.controller).name} locks ${pick.name} (${src}).`);
        setUnlocked(s, o, (o.unlocked ?? []).filter((i) => i !== pick.door));
        return;
      }
      log(s, `${player(s, ctx.controller).name} unlocks ${pick.name} (${src}).`);
      setUnlocked(s, o, [...(o.unlocked ?? []), pick.door]);
      return;
    }
    case "removeFromCombat": {
      const removed: ObjectId[] = [];
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || (o.attacking === undefined && o.blocking === undefined)) continue;
        removeFromCombat(s, o);
        clearCombat(o);
        removed.push(o.id);
        log(s, `${src} removes ${defOf(s, o).name} from combat.`);
      }
      if (e.remember && s.resolving) s.resolving.created = removed;
      return;
    }
    case "becomeBlocked": {
      // An unblocked attacking creature becomes blocked, by no creature (CR 509.1h): it stays blocked for the rest of
      // combat and deals no combat damage unless it has trample (CR 702.19d). Every creature in its band too (CR
      // 702.22i). Already blocked, nothing happens (rulings on Choking Vines). "Becomes blocked" abilities trigger, not
      // "becomes blocked by a creature" ones (CR 509.3c-d).
      const now: ObjectId[] = [];
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || o.attacking === undefined || o.blockedBy) continue;
        for (const m of o.band ? s.battlefield.map((id) => s.objects[id]!).filter((x) => x.band === o.band && x.attacking !== undefined && !x.blockedBy) : [o]) {
          m.blockedBy = [];
          m.becameBlockedTurn = s.turn;
          now.push(m.id);
          log(s, `${defOf(s, m).name} becomes blocked (${src}).`);
        }
      }
      if (now.length) fireEvent(s, { type: "becameBlocked", ids: now });
      return;
    }
    case "reselectAttack": {
      // Another player, or a planeswalker or battle it could attack (CR 506.2, 310.9b), never its controller or theirs;
      // requirements, restrictions and costs ignored, and it still attacked what it did (rulings).
      // Windshaper Planetar: each attacking creature in turn (the ones done so far in scratch), each one optional.
      // Portal Manipulator: each of them attacks that player now (never its controller, CR 506.2), no choice.
      if (e.toPlayer) {
        const to = players(s, e.toPlayer, ctx).find((pid) => !player(s, pid).lost);
        if (to === undefined) return;
        for (const o of objects(s, e.what, ctx)) {
          if (o.zone !== "battlefield" || o.attacking === undefined || controllerOf(s, o) === to) continue;
          o.attacking = to;
          o.attackingPermanent = undefined;
          log(s, `${src}: ${defOf(s, o).name} now attacks ${attackedName(s, o)}.`);
        }
        return;
      }
      const sc = (s.resolving!.scratch ??= {});
      const done = (sc.reselected ??= []);
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || o.attacking === undefined || done.includes(o.id)) continue;
        const options = reselectOptions(s, o);
        if (!options.length) {
          if (e.each) done.push(o.id);
          continue;
        }
        if (sc.reselect === undefined) {
          const keep = e.each ? [{ key: "keep", label: `Keep attacking ${attackedName(s, o)}` }] : [];
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "reselectAttack", options: [...keep, ...options].map((x) => x.key), labels: [...keep, ...options].map((x) => x.label), about: o.id, prompt: `choose what ${defOf(s, o).name} attacks now` };
          return "paused";
        }
        const pick = options.find((x) => x.key === sc.reselect);
        sc.reselect = undefined;
        if (e.each) done.push(o.id);
        if (pick) {
          o.attacking = pick.player;
          o.attackingPermanent = pick.planeswalker !== undefined ? attackingPermanentOf(s, pick.planeswalker) : undefined;
          log(s, `${src}: ${defOf(s, o).name} now attacks ${attackedName(s, o)}.`);
        }
        if (!e.each) break;
      }
      sc.reselected = undefined;
      return;
    }
    case "suspect":
      // Only permanents can be suspected (CR 701.60b); a suspected one isn't suspected again (701.60d), so it keeps its
      // timestamp.
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || (o.suspected !== undefined) !== !!e.no) continue;
        // "Enchanted creature can't become suspected" (Airtight Alibi).
        if (!e.no && characteristics(s, o).cantBeSuspected) continue;
        o.suspected = e.no ? undefined : s.nextTimestamp++;
        log(s, e.no ? `${defOf(s, o).name} is no longer suspected.` : `${src} suspects ${defOf(s, o).name}.`);
      }
      invalidateCharacteristics(s);
      return;
    case "turnFaceDown":
      for (const o of objects(s, e.what, ctx)) turnFaceDown(s, o, e.as, src);
      return;
    case "turnFaceUp":
      for (const o of objects(s, e.what, ctx)) {
        // Hauntwoods Shrieker: reveal it (CR 701.20a), then turn it face up only if the card is a creature card as printed
        // (rulings: effects on the permanent don't count; a double-faced card's front face).
        if (e.revealOnly) {
          if (o.zone === "battlefield" && o.faceDown) log(s, `${src}: ${player(s, controllerOf(s, o)).name} reveals a face-down permanent: it's ${realDefOf(s, o).name}.`);
          continue;
        }
        if (e.ifCreatureCard && !isType(realDefOf(s, o), "Creature")) continue;
        turnFaceUpByEffect(s, o, src, ctx.controller);
      }
      return;
    case "tap":
    case "untap": {
      let tapped = 0;
      if (e.type === "tap" && e.swap) {
        const all = objects(s, e.what, ctx);
        const wasTapped = all.filter((o) => o.tapped);
        const wasUntapped = all.filter((o) => !o.tapped);
        for (const o of wasTapped) untapPermanent(s, o);
        for (const o of wasUntapped) tapPermanent(s, o, undefined, ctx.controller);
        log(s, `${wasTapped.length} tapped creature${wasTapped.length === 1 ? "" : "s"} untap and ${wasUntapped.length} untapped creature${wasUntapped.length === 1 ? "" : "s"} tap.`);
        return;
      }
      for (const o of objects(s, e.what, ctx)) {
        if (e.type === "untap") untapPermanent(s, o);
        else if (!o.tapped) {
          tapPermanent(s, o, undefined, ctx.controller);
          if (o.tapped) tapped++;
        }
      }
      if (e.type === "tap" && e.noteTapped) s.resolving!.tappedThisWay = tapped;
      return;
    }
    case "harness": {
      // "Harness ~" (CR 701.64a): the same object only (CR 400.7); it stays harnessed until it leaves (701.64b).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc) || o.harnessed) return;
      o.harnessed = true;
      invalidateCharacteristics(s); // its "∞" abilities
      log(s, `${defOf(s, o).name} is harnessed.`);
      return;
    }
    case "untapUpTo": {
      // Chosen as it resolves among the tapped ones (CR 608.2d), then untapped together.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const who = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (who === undefined) return;
      if (!sc.chosen?.[who]) {
        const n = amountNow(s, e.n, ctx);
        const options = s.battlefield.filter((id) => obj(s, id).tapped && objectMatches(s, e.filter, obj(s, id), who, false));
        if (n <= 0 || !options.length) return;
        sc.queue = [who];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: who, source: src, action: "untap", what: `tapped ${e.filter.text}`, options, count: Math.min(n, options.length), min: 0 };
        return "paused";
      }
      const ids = sc.chosen[who]!;
      sc.chosen = undefined;
      sc.queue = undefined;
      for (const id of ids) if (s.objects[id]?.zone === "battlefield") untapPermanent(s, obj(s, id));
      if (ids.length) log(s, `${player(s, who).name} untaps ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
      return;
    }
    case "tapAnyNumber": {
      // Which untapped ones are chosen as it resolves (CR 608.2d), any number including none, then tapped together. Tapping
      // none still counts as doing it: a "When you do" after it triggers with X = 0 (rulings on Teferi Akosa, Yotia
      // Declares War). The number tapped stays what it was even if they untap or leave later (rulings on Siege Striker).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.chosen?.[ctx.controller]) {
        r.tappedThisWay = 0;
        const options = s.battlefield.filter((id) => !obj(s, id).tapped && objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
        if (!options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "tap", what: `untapped ${e.filter.text}`, options, count: options.length, min: 0 };
        return "paused";
      }
      const ids = sc.chosen[ctx.controller]!.filter((id) => s.objects[id]?.zone === "battlefield" && !obj(s, id).tapped);
      sc.chosen = undefined;
      sc.queue = undefined;
      for (const id of ids) tapPermanent(s, obj(s, id), undefined, ctx.controller);
      r.tappedThisWay = ids.length;
      r.tappedIds = ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
      log(s, ids.length ? `${player(s, ctx.controller).name} taps ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}.` : `${player(s, ctx.controller).name} taps nothing.`);
      return;
    }
    case "tapOrUntap": {
      // Its controller chooses as it resolves (CR 608.2d); an illegal target isn't asked about (CR 608.2b).
      const o = objects(s, e.what, ctx).find((x) => x.zone === "battlefield");
      if (!o) return;
      const sc = (s.resolving!.scratch ??= {});
      if (sc.tapOrUntap === undefined) {
        const name = defOf(s, o).name;
        s.pending = {
          kind: "chooseOption",
          player: ctx.controller,
          source: src,
          what: "tapOrUntap",
          about: o.id,
          options: ["tap", "untap", ...(e.may ? ["neither"] : [])],
          labels: [`Tap ${name}`, `Untap ${name}`, ...(e.may ? ["Neither"] : [])],
          prompt: `tap or untap ${name}${o.tapped ? " (tapped)" : " (untapped)"}?`,
        };
        return "paused";
      }
      const choice = sc.tapOrUntap;
      sc.tapOrUntap = undefined;
      if (choice === "tap") tapPermanent(s, o, undefined, ctx.controller);
      else if (choice === "untap") untapPermanent(s, o);
      log(s, choice === "neither" ? `${src}: ${defOf(s, o).name} is neither tapped nor untapped.` : `${src} ${choice}s ${defOf(s, o).name}.`);
      return;
    }
    case "classLevel": {
      // "This Class's level becomes N" (CR 716.2a): the same object only (CR 400.7).
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      o.classLevel = e.n;
      invalidateCharacteristics(s); // its abilities at that level
      log(s, `${defOf(s, o).name} becomes level ${e.n}.`);
      fireEvent(s, { type: "becameLevel", id: o.id, level: e.n });
      return;
    }
    case "transform":
      for (const o of objects(s, e.what, ctx)) {
        // An ability of the permanent transforms it only if it hasn't transformed since the ability was put on the stack
        // (CR 701.27f).
        if (o.id === ctx.sourceId && (o.transforms ?? 0) !== (ctx.sourceTransforms ?? 0)) continue;
        // "Transform target Incubator token you control" (Attentive Skywarden): a double-faced token turns over too.
        if (o.isToken && defOf(s, o).tokenBack) transformToken(s, o);
        else if (transformPermanent(s, o, false, e.convert) && s.resolving) s.resolving.transformedThisWay = true;
      }
      return;
    case "becomePrepared":
      for (const o of objects(s, e.what, ctx)) if (e.un) unprepare(s, o);
      else becomePrepared(s, o);
      return;
    case "flip":
      for (const o of objects(s, e.what, ctx)) flipPermanent(s, o);
      return;
    case "solve": {
      // "This Case becomes solved" (CR 719.3a-b): the same object only (CR 400.7); it stays solved until it leaves.
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!o || o.zone !== "battlefield" || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc) || o.solved) return;
      o.solved = true;
      invalidateCharacteristics(s); // its "Solved" abilities
      log(s, `${defOf(s, o).name} is solved.`);
      fireEvent(s, { type: "solved", id: o.id, controller: controllerOf(s, o) });
      return;
    }
    case "becameCrewed": {
      // "Whenever this Vehicle becomes crewed" (CR 702.122e): its crew ability resolved, whatever it is now.
      const o = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      if (o?.zone !== "battlefield") return;
      // Mighty Servant of Leuk-o: "for the first time each turn, if it was crewed by exactly two creatures" (rulings: the
      // creatures tapped to pay the crew cost of the ability that crewed it).
      const times = ((s.turnLog ??= {}).timesCrewed ??= {});
      const key = `${o.id}@${o.zoneChanges ?? 0}`;
      times[key] = (times[key] ?? 0) + 1;
      const by = s.resolving?.item.crewers;
      fireEvent(s, { type: "crewed", id: o.id, ...(times[key] === 1 ? { first: true as const } : {}), ...(by !== undefined ? { by } : {}) });
      return;
    }
    case "cumulativeUpkeepPaid": {
      // Hibernation's End: its cumulative upkeep was paid (CR 702.24a), while it's still on the battlefield.
      const o = ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined;
      if (o?.zone === "battlefield") fireEvent(s, { type: "cumulativeUpkeepPaid", id: o.id });
      return;
    }
    case "gaveGift":
      // A gift was given (CR 702.174c), whatever it gave.
      fireEvent(s, { type: "gaveGift", player: ctx.controller });
      return;
    case "replaceLandMana":
      // Quarum Trench Gnomes: on that permanent from now on (CR 614.1a); a new object if it changes zones (CR 400.7).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        (o.manaReplaced ??= []).push({ from: e.from, to: e.into });
        log(s, `${defOf(s, o).name} produces colorless mana instead of {${e.from}} from now on.`);
      }
      return;
    case "becomeSaddled":
      // Only permanents can become saddled (CR 702.171b).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        o.saddled = true;
        invalidateCharacteristics(s); // "as long as ~ is saddled"
        log(s, `${defOf(s, o).name} becomes saddled.`);
      }
      return;
    case "toggleTapped": {
      // Sands of Time: the tapped ones and the untapped ones, found first, then flipped together.
      for (const pid of players(s, e.who, ctx)) {
        const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
        const [tapped, untapped] = [mine.filter((id) => obj(s, id).tapped), mine.filter((id) => !obj(s, id).tapped)];
        for (const id of tapped) untapPermanent(s, obj(s, id));
        for (const id of untapped) tapPermanent(s, obj(s, id));
        log(s, `${player(s, pid).name} untaps ${tapped.length} and taps ${untapped.length} of their artifacts, creatures and lands.`);
      }
      return;
    }
    case "phaseSwap": {
      // Time and Tide: what phased out directly and is a creature (as printed: a phased-out permanent is treated as though
      // it doesn't exist, CR 702.26b), with what's attached to it (702.26g), and the creatures with phasing, both found
      // first and then phasing at once.
      const back = (s.phasedOut ?? []).filter((id) => !s.objects[id]!.phased?.indirect && objIsType(s, obj(s, id), "Creature"));
      const out = s.battlefield.filter((id) => objIsType(s, obj(s, id), "Creature") && objHasKeyword(s, obj(s, id), "Phasing"));
      phaseOut(s, out);
      phaseIn(s, back);
      return;
    }
    case "phaseOut": {
      // Only what's on the battlefield: "it" may have left (CR 702.26b).
      const ids = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id);
      if (e.anyNumber) {
        // Change of Plans: which of them, chosen as it resolves (rulings: after they've connived), none too.
        const sc = (s.resolving!.scratch ??= {});
        if (!sc.chosen?.[ctx.controller]) {
          if (!ids.length) return;
          sc.queue = [ctx.controller];
          sc.chosen = {};
          s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "phaseOut", what: "of those creatures", options: ids, count: ids.length, min: 0 };
          return "paused";
        }
        const picked = sc.chosen[ctx.controller]!.filter((id) => ids.includes(id));
        sc.chosen = undefined;
        sc.queue = undefined;
        if (picked.length) phaseOut(s, picked);
        return;
      }
      if (e.untilSourceLeaves) {
        // Oubliette: with the source gone already, nothing happens (rulings, CR 610.3a).
        const me = objects(s, { ref: "self" }, ctx)[0];
        if (!me) {
          log(s, `${src} has left the battlefield, so nothing phases out.`);
          return;
        }
        phaseOut(s, ids);
        let n = 0;
        for (const id of ids) {
          const p = s.objects[id]!.phased;
          if (p && !p.indirect) {
            p.until = { id: me.id, zc: me.zoneChanges ?? 0, ...(e.noTap ? { noTap: true as const } : {}) };
            if (objIsType(s, s.objects[id]!, "Creature")) n++;
          }
        }
        s.resolving!.phasedThisWay = n;
        return;
      }
      phaseOut(s, ids);
      return;
    }
    case "earthbend": {
      // CR 701.66a. Its effect lasts as long as the land stays on the battlefield (CR 611.2c, 400.7).
      const n = amountNow(s, e.n, ctx);
      for (const o of objects(s, e.what, ctx).filter((x) => x.zone === "battlefield")) {
        const mods: Modification[] = [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 0, toughness: 0 }, { kind: "addKeywords", keywords: ["Haste"] }];
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected: [o.id], mods });
        invalidateCharacteristics(s);
        const put = n > 0 ? putCounters(s, o, "+1/+1", n) : 0;
        invalidateCharacteristics(s);
        log(s, `${src}: ${defOf(s, o).name} becomes a 0/0 land creature with haste${put ? ` with ${put} +1/+1 counter${put > 1 ? "s" : ""}` : ""} (earthbend ${n}).`);
        (s.delayed ??= []).push({
          when: "leaves",
          to: ["graveyard", "exile"],
          controller: ctx.controller,
          sourceCardId: ctx.sourceId && s.objects[ctx.sourceId] ? cardIdOf(s.objects[ctx.sourceId]!) : cardIdOf(o),
          subject: { id: o.id, zc: o.zoneChanges ?? 0 },
          body: { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard" }, tapped: true }], text: "When that land dies or is put into exile, return it to the battlefield tapped under your control." },
          turn: s.turn,
          step: s.step,
        });
      }
      return;
    }
    case "mustBlockSource": {
      // Provoke (CR 702.39a): only the creature that provoked it, as long as it's still that object. "Blocks target
      // creature": that one, if it's still a legal target (CR 608.2b).
      const source = e.attacker ? objects(s, e.attacker, ctx)[0] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!source || source.zone !== "battlefield" || (!e.attacker && (source.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      for (const o of objects(s, e.what, ctx)) {
        // Already required to block another creature this combat (Fighter Class twice): one of them (rulings).
        const others = provokersOf(s, o).filter((x) => x.id !== source.id);
        if (others.length && !e.thisTurn) (o.provokedAlso ??= []).push({ id: source.id, zc: source.zoneChanges ?? 0 });
        else o.provokedBy = { id: source.id, zc: source.zoneChanges ?? 0, ...(e.thisTurn ? { turn: s.turn } : {}) };
        log(s, `${characteristics(s, o).name} must block ${characteristics(s, source).name} this ${e.thisTurn ? "turn" : "combat"} if able.`);
      }
      return;
    }
    case "cantBlockSource": {
      // The source as it is now; if it has left the battlefield, there's nothing for this to apply to (CR 400.7).
      const source = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!source || source.zone !== "battlefield" || (source.zoneChanges ?? 0) !== ctx.sourceZc) return;
      for (const o of objects(s, e.what, ctx)) {
        (o.cantBlockThis ??= []).push({ id: source.id, zc: source.zoneChanges ?? 0, turn: s.turn, selfZc: o.zoneChanges ?? 0 });
        log(s, `${characteristics(s, o).name} can't block ${characteristics(s, source).name} this turn.`);
      }
      return;
    }
    case "blockLimitThisCombat": {
      // Until this combat ends (CR 511.3); outside combat there's no combat for it to apply to.
      if (!["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step)) return;
      for (const pid of players(s, e.who, ctx)) {
        (s.blockLimits ??= []).push({ player: pid, n: e.n });
        log(s, `${player(s, pid).name} can't block with more than ${e.n === 1 ? "one creature" : `${e.n} creatures`} this combat.`);
      }
      return;
    }
    case "proliferate": {
      const times = proliferateTimes(s, ctx.controller, e.n ? amountNow(s, e.n, ctx) : e.twice ? 2 : 1);
      if (!e.thenPhaseOut) {
        for (let i = 0; i < times; i++) proliferate(s, ctx.controller, src);
        return;
      }
      // Ripples of Potential: then any number of your permanents that got a counter this way phase out (CR 702.26), chosen
      // after proliferating; none is fine (rulings: "any number" includes zero).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.chosen?.[ctx.controller]) {
        const got = [...new Set(Array.from({ length: times }, () => proliferate(s, ctx.controller, src)).flat())].filter((id) => s.objects[id]?.zone === "battlefield" && controllerOf(s, obj(s, id)) === ctx.controller);
        if (!got.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "phaseOut", what: "permanents of yours that got a counter", options: got, count: got.length, min: 0 };
        return "paused";
      }
      const ids = sc.chosen[ctx.controller]!.filter((id) => s.objects[id]?.zone === "battlefield");
      sc.chosen = undefined;
      sc.queue = undefined;
      if (ids.length) phaseOut(s, ids);
      return;
    }
    case "removeTimeSuspended": {
      // Amy Pond: one suspended card its controller owns (CR 702.62b), chosen as it resolves; that many time counters off
      // it, or all it has. The last one removed triggers its suspend (rulings, CR 702.62a).
      const you = ctx.controller;
      const sc = (s.resolving!.scratch ??= {});
      const options = player(s, you).exile.filter((id) => obj(s, id).owner === you && isSuspended(s, obj(s, id)));
      if (!sc.timeTravel) {
        if (!options.length) return;
        sc.timeTravel = { ids: [], picks: {} };
        delete sc.found;
        s.pending = { kind: "searchLibrary", player: you, source: src, what: "a suspended card you own", cards: options, min: 1, max: 1, dig: { looked: options, to: `to remove ${amountNow(s, e.n, ctx)} time counters from`, rest: "keep their time counters" } };
        return "paused";
      }
      sc.timeTravel = undefined;
      const id = (sc.found ?? []).find((x) => options.includes(x));
      if (!id) return;
      const o = obj(s, id);
      const n = Math.min(amountNow(s, e.n, ctx), removableCounters(s, o, "time"));
      if (n <= 0) return;
      const left = o.counters.time! - n;
      if (left > 0) o.counters.time = left;
      else delete o.counters.time;
      invalidateCharacteristics(s);
      log(s, `${player(s, you).name} removes ${n} time counter${n === 1 ? "" : "s"} from ${defOf(s, o).name} (${src}).`);
      countersRemoved(s, o, "time", n);
      if (o.zone === "exile") fireEvent(s, { type: "timeCountersRemovedExiled", id: o.id, n });
      if (!left) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "time" });
      return;
    }
    case "counterKindsAddOrRemove": {
      // Quarry Hauler, Dramatist's Puppet: the target's kinds of counter as this resolves, each its own choice (rulings),
      // made one after another; then the counters are put and removed together.
      const you = ctx.controller;
      const sc = (s.resolving!.scratch ??= {});
      // Clockspinning, Jhoira's Timebug: the target may be a suspended card in exile (TargetSpec.orSuspended), which
      // must still be suspended as it resolves; a permanent with no counter on it is left as it is (rulings).
      const here = (x: GameObject) => x.zone === "battlefield" || (x.zone === "exile" && isSuspended(s, x));
      if (!sc.addOrRemove) {
        const o = objects(s, e.what, ctx).find(here);
        let kinds = o ? Object.keys(o.counters).filter((k) => (o.counters[k] ?? 0) > 0 && (e.kind === undefined || k === e.kind)) : [];
        if (!o || !kinds.length) return;
        // Clockspinning: one kind of counter it has, chosen as it resolves (rulings).
        if (e.one && kinds.length > 1) {
          if (sc.counterKind === undefined || !kinds.includes(sc.counterKind)) {
            s.pending = { kind: "chooseOption", player: you, source: src, what: "counterKind", options: kinds, labels: kinds.map((k) => `A ${k} counter`), about: o.id, prompt: `choose a counter on ${o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name}` };
            return "paused";
          }
          kinds = [sc.counterKind];
        }
        sc.counterKind = undefined;
        sc.addOrRemove = { id: o.id, zc: o.zoneChanges ?? 0, kinds, picks: {} };
      }
      const st = sc.addOrRemove;
      const o = s.objects[st.id];
      if (!o || !here(o) || (o.zoneChanges ?? 0) !== st.zc) {
        sc.addOrRemove = undefined;
        return;
      }
      const name = o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
      const kind = st.kinds.find((k) => st.picks[k] === undefined);
      if (kind !== undefined) {
        const n = o.counters[kind] ?? 0;
        s.pending = {
          kind: "chooseOption",
          player: you,
          source: src,
          what: "addOrRemoveCounter",
          options: ["add", "remove", ...(e.may ? ["none"] : [])],
          labels: [`Put another ${kind} counter on it`, `Remove a ${kind} counter from it`, ...(e.may ? ["Neither"] : [])],
          about: o.id,
          counterKind: kind,
          prompt: `${name} has ${n} ${kind} counter${n === 1 ? "" : "s"}: put another or remove one`,
        };
        return "paused";
      }
      sc.addOrRemove = undefined;
      const changed: string[] = [];
      const last: string[] = [];
      for (const k of st.kinds) {
        if (st.picks[k] === "none") continue;
        if (st.picks[k] === "add") {
          const put = putCounters(s, o, k, 1);
          if (put) changed.push(`+${put} ${k}`);
        } else if (removableCounters(s, o, k) > 0) {
          const left = (o.counters[k] ?? 0) - 1;
          if (left > 0) o.counters[k] = left;
          else delete o.counters[k];
          changed.push(`-1 ${k}`);
          countersRemoved(s, o, k, 1);
          // A time counter off a suspended card (CR 702.62a): "while it's exiled" triggers see it too.
          if (k === "time" && o.zone === "exile") fireEvent(s, { type: "timeCountersRemovedExiled", id: o.id, n: 1 });
          if (!left) last.push(k);
        }
      }
      invalidateCharacteristics(s);
      log(s, `${src}: ${name}${changed.length ? ` (${changed.join(", ")})` : " is unchanged"}.`);
      for (const k of last) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
      return;
    }
    case "timeTravel": {
      // CR 701.56a: "choose any number of permanents you control with one or more time counters on them and/or suspended
      // cards you own in exile with one or more time counters on them and, for each of those objects, put a time counter
      // on it or remove a time counter from it." Each is asked in turn, then the counters change together.
      const you = ctx.controller;
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.timeTravel) {
        const ids = [
          ...s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && (obj(s, id).counters.time ?? 0) > 0),
          ...player(s, you).exile.filter((id) => obj(s, id).owner === you && isSuspended(s, obj(s, id))),
        ];
        if (!ids.length) {
          log(s, `${src}: ${player(s, you).name} time travels (nothing has a time counter).`);
          return;
        }
        sc.timeTravel = { ids: ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 })), picks: {} };
      }
      const st = sc.timeTravel;
      const here = (x: { id: ObjectId; zc: number }) => s.objects[x.id] && (s.objects[x.id]!.zoneChanges ?? 0) === x.zc;
      const next = st.ids.find((x) => st.picks[x.id] === undefined && here(x));
      if (next) {
        const o = obj(s, next.id);
        const name = o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
        const n = o.counters.time ?? 0;
        const where = o.zone === "battlefield" ? "" : " (suspended)";
        s.pending = {
          kind: "chooseOption",
          player: you,
          source: src,
          what: "timeTravel",
          options: ["add", "remove", "none"],
          labels: [`Put a time counter on ${name}`, `Remove a time counter from ${name}`, "Leave it"],
          about: next.id,
          prompt: `time travel: ${name}${where} has ${n} time counter${n === 1 ? "" : "s"}.`,
        };
        return "paused";
      }
      sc.timeTravel = undefined;
      const changed: string[] = [];
      const last: ObjectId[] = [];
      const removedExiled: ObjectId[] = [];
      for (const x of st.ids) {
        const o = s.objects[x.id];
        const pick = st.picks[x.id];
        if (!o || !here(x) || !pick || pick === "none") continue;
        const name = o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name;
        if (pick === "add") {
          if (putCounters(s, o, "time", 1)) changed.push(`+1 on ${name}`);
        } else if (removableCounters(s, o, "time") > 0) {
          const left = o.counters.time! - 1;
          if (left > 0) o.counters.time = left;
          else delete o.counters.time;
          changed.push(`-1 on ${name}`);
          countersRemoved(s, o, "time", 1);
          if (o.zone === "exile") removedExiled.push(o.id);
          if (!left) last.push(o.id);
        }
      }
      invalidateCharacteristics(s);
      log(s, `${src}: ${player(s, you).name} time travels${changed.length ? ` (${changed.join(", ")})` : ""}.`);
      // Removing the last one triggers suspend's cast ability and vanishing's sacrifice (CR 702.62a, 702.63a).
      for (const id of removedExiled) fireEvent(s, { type: "timeCountersRemovedExiled", id, n: 1 });
      for (const id of last) fireEvent(s, { type: "lastCounterRemoved", id, counter: "time" });
      return;
    }
    case "amass": {
      // CR 701.47a: with no Army, create a 0/0 black [subtype] Army first; then counters on an Army you control,
      // which becomes that subtype too. With several Armies, the one with the most counters is chosen.
      // Azog, Moria's Ruin: "its controller amasses": the target's controller, as it last existed (none with no target).
      const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (pid === undefined) return;
      const n = amountNow(s, e.n, ctx);
      const armies = () => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid && characteristics(s, o).subtypes.includes("Army") && objIsType(s, o, "Creature"));
      if (!armies().length) {
        const army: TokenSpec = { name: `${e.subtype} Army`, power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: [e.subtype, "Army"], keywords: [] };
        enterTogether(s, () => {
          const { same, extra } = tokenBatch(s, pid, army, 1);
          for (let i = same; i > 0; i--) createToken(s, pid, army);
          createExtraTokens(s, pid, extra);
        });
      }
      const army = armies().sort((a, b) => (b.counters["+1/+1"] ?? 0) - (a.counters["+1/+1"] ?? 0))[0];
      if (!army) return;
      if (s.resolving) s.resolving.amassed = { id: army.id, zc: army.zoneChanges ?? 0 };
      invalidateCharacteristics(s);
      if (n > 0) putCounters(s, army, "+1/+1", n);
      log(s, `${player(s, pid).name} amasses ${e.subtype} ${n}.`);
      if (!characteristics(s, army).subtypes.includes(e.subtype))
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: pid, sourceName: src, duration: "game", affected: [army.id], mods: [{ kind: "addTypes", types: [], subtypes: [e.subtype] }] });
      return;
    }
    case "recruit":
    case "connive": {
      // CR 701.50a: its controller draws, then discards; each nonland card discarded is a +1/+1 counter on it.
      // If it already left the battlefield, its controller as it last existed still draws and discards (CR 701.50c).
      // Recruit (CR 701.70a) is the same draw and discard, with a Human Soldier token for a nonland card.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.connive) {
        // "Each creature that convoked ~ connives": each one that did, gone or not (rulings), one at a time.
        if (e.type === "connive" && e.what.ref === "convoker" && !convokedFor(s, ctx)[e.what.index]) return;
        const o = e.type === "connive" ? objects(s, e.what, ctx)[0] : undefined;
        const pid = o ? controllerOf(s, o) : ctx.controller;
        const n = (sc.n = e.type === "connive" ? amountNow(s, e.n, ctx) : 1);
        sc.connive = { pid, ...(o ? { id: o.id, zc: o.zoneChanges ?? 0 } : {}) };
        if (n <= 0) return;
        log(s, e.type === "recruit" ? `${player(s, pid).name} recruits.` : `${o ? defOf(s, o).name : src} connives${n > 1 ? ` ${n}` : ""}.`);
        sc.queue = [pid];
        sc.chosen = {};
        if (!draw(s, pid, n)) return "paused"; // dredge's choice finishes the draws (CR 702.52a)
      }
      const { pid, id, zc } = sc.connive;
      const n = sc.n ?? 0;
      if (n <= 0) return;
      if (sc.queue!.length) {
        const hand = player(s, pid).hand;
        if (hand.length > n) {
          s.pending = { kind: "discard", player: pid, count: n, source: src };
          return "paused";
        }
        sc.chosen![pid] = [...hand];
        sc.queue!.shift();
      }
      const ids = sc.chosen![pid] ?? [];
      const nonland = ids.filter((x) => !defOf(s, obj(s, x)).types.includes("Land")).length;
      const tops = discardToTop(s, pid, ids, src, ctx);
      if (tops === "paused") return "paused";
      discardCards(s, pid, ids, "", false, false, ctx.controller, undefined, tops);
      if (e.type === "recruit") {
        if (!nonland) return;
        const soldier: TokenSpec = { name: "Human Soldier", power: 1, toughness: 1, colors: ["W"], types: ["Creature"], subtypes: ["Human", "Soldier"], keywords: [] };
        const { same: k, extra } = tokenBatch(s, pid, soldier, 1);
        enterTogether(s, () => {
          for (let i = 0; i < k; i++) createToken(s, pid, soldier);
          if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a" : k} 1/1 Human Soldier token${k > 1 ? "s" : ""}.`);
          createExtraTokens(s, pid, extra);
        });
        return;
      }
      const o = id ? s.objects[id] : undefined;
      const here = o?.zone === "battlefield" && (o.zoneChanges ?? 0) === zc;
      if (nonland && here) {
        invalidateCharacteristics(s);
        putCounters(s, o, "+1/+1", nonland);
        log(s, `${defOf(s, o).name} gets ${nonland} +1/+1 counter${nonland > 1 ? "s" : ""}.`);
      }
      // It has connived now, whatever could be done (CR 701.50f), gone or not (Toluz rulings): "whenever a creature you
      // control connives" triggers for its controller as it last existed (CR 701.50b).
      if (o) fireEvent(s, { type: "connived", id: o.id, controller: here ? controllerOf(s, o) : pid });
      return;
    }
    case "skipUntap":
      // Its controller's next untap step skips it, then it untaps as usual (CR 502.3).
      // "Next two untap steps" (Telekinesis): the one after that too, whoever controls it then (rulings); another effect
      // that skips the next one overlaps this one's first.
      for (const o of objects(s, e.what, ctx)) {
        o.skipNextUntap = true;
        if ((e.n ?? 1) > 1) o.skipMoreUntaps = Math.max(o.skipMoreUntaps ?? 0, e.n! - 1);
      }
      return;
    case "noUntapNext":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        if (e.all) {
          p.noUntapNextAll = [...new Set([...(p.noUntapNextAll ?? []), ...e.types])];
          log(s, `${e.types.map((t) => `${t.toLowerCase()}s`).join(" and ")} won't untap during ${p.name}'s next untap step.`.replace(/^./, (c) => c.toUpperCase()));
          continue;
        }
        p.noUntapNext = [...new Set([...(p.noUntapNext ?? []), ...e.types])];
        log(s, `${e.types.map((t) => `${t.toLowerCase()}s`).join(" and ")} ${p.name} controls won't untap during their next untap step.`.replace(/^./, (c) => c.toUpperCase()));
      }
      return;
    case "noMaxHandSize":
      // "For as long as you control ~": nothing if you no longer do (CR 611.2b; rulings on The Great Synthesis).
      if (e.whileControlled) {
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        if (!me || me.zone !== "battlefield" || (me.zoneChanges ?? 0) !== (ctx.sourceZc ?? 0) || controllerOf(s, me) !== ctx.controller) return;
        (player(s, ctx.controller).noMaxHandSizeWhile ??= []).push({ id: me.id, zc: me.zoneChanges ?? 0 });
        log(s, `${player(s, ctx.controller).name} has no maximum hand size for as long as they control ${src}.`);
        return;
      }
      // "Until your next turn" (Enter the Infinite): over as that turn begins (CR 611.2b).
      if (e.untilYourNextTurn) {
        player(s, ctx.controller).noMaxHandSizeUntilNextTurn = true;
        log(s, `${player(s, ctx.controller).name} has no maximum hand size until their next turn.`);
        return;
      }
      player(s, ctx.controller).noMaxHandSize = true;
      log(s, `${player(s, ctx.controller).name} has no maximum hand size for the rest of the game.`);
      return;
    case "entersWithCountersThisTurn":
      (s.entersWithCountersThisTurn ??= []).push({ controller: ctx.controller, filter: e.filter, counter: e.counter, n: e.n, source: src });
      log(s, `This turn, each creature ${player(s, ctx.controller).name} controls enters with an additional ${e.counter} counter (${src}).`);
      return;
    case "enterTappedUntil":
      (s.entersTappedUntil ??= []).push({ controller: ctx.controller, filter: e.filter, source: src, ...(e.thisTurn ? { thisTurn: true as const } : {}) });
      return;
    case "counters": {
      if (e.copyFrom) {
        const from = objects(s, e.copyFrom, ctx)[0];
        const kinds = from ? Object.entries(from.counters).filter(([, n]) => (n ?? 0) > 0) : [];
        for (const o of objects(s, e.what, ctx)) {
          if (o.zone !== "battlefield") continue;
          for (const [kind, n] of kinds) {
            invalidateCharacteristics(s);
            const put = putCounters(s, o, kind, n!);
            if (put) log(s, `${defOf(s, o).name} gets ${put} ${kind} counter${put > 1 ? "s" : ""}.`);
          }
        }
        return;
      }
      // Distributed (CR 601.2d): each target gets its part; a part for an illegal target isn't put anywhere (CR 608.2b).
      if (e.divided && e.what.ref === "target") {
        for (let k = 0; k < (e.what.n ?? 1); k++) {
          const t = ctx.targets[e.what.index + k];
          const part = t?.kind === "object" ? (t.amount ?? 0) : 0;
          for (const o of part > 0 ? objects(s, { ref: "target", index: e.what.index + k }, ctx) : []) {
            invalidateCharacteristics(s);
            const put = putCounters(s, o, e.counter, part);
            log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
            if (put > 0 && s.resolving) (s.resolving.countersPutThisWay ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, kind: e.counter, n: put });
          }
        }
        return;
      }
      // Doubling: as many more as it has now, of that kind or of each kind (CR 701.10e). Putting them can be modified (CR
      // 122.6; rulings on Kalonian Hydra and doublers).
      if (e.double) {
        for (const o of objects(s, e.what, ctx)) {
          const kinds = e.everyKind ? Object.keys(o.counters).filter((k) => (o.counters[k] ?? 0) > 0) : [e.counter];
          for (const kind of kinds) {
            const have = o.counters[kind] ?? 0;
            if (have <= 0) continue;
            invalidateCharacteristics(s);
            const put = putCounters(s, o, kind, have);
            log(s, `${defOf(s, o).name} gets ${put} ${kind} counter${put > 1 ? "s" : ""}.`);
          }
        }
        return;
      }
      // Sovereign Okinec Ahau: each creature's difference between its power and base power, all found before any are put.
      if (e.aboveBase || e.perOwn) {
        const each = objects(s, e.what, ctx).map((o) => [o, e.perOwn === "toughness" ? toughness(s, o) : e.perOwn === "power" ? power(s, o) : power(s, o) - basePowerNow(s, o)] as const);
        for (const [o, n] of each) {
          if (n <= 0 || o.zone !== "battlefield") continue;
          invalidateCharacteristics(s);
          const put = putCounters(s, o, e.counter, n);
          log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
        }
        return;
      }
      // Trap the Trespassers: each one with votes gets that many, for each vote it got.
      if (e.perVote) {
        const tally = voteTally(s);
        const n = amountNow(s, e.n, ctx);
        for (const o of objects(s, e.what, ctx)) {
          const k = n * (tally.get(`${o.id}@${o.zoneChanges ?? 0}`) ?? 0);
          if (k <= 0 || o.zone !== "battlefield") continue;
          invalidateCharacteristics(s);
          const put = putCounters(s, o, e.counter, k);
          log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put === 1 ? "" : "s"}.`);
        }
        return;
      }
      // Agitator Ant: each player's choice gets the counters from that player, all once everyone has chosen (rulings).
      if (e.byVoter) {
        const n = amountNow(s, e.n, ctx);
        for (const { voter, choice } of n > 0 ? (s.resolving?.votes ?? []) : []) {
          const [id, zc] = choice.split("@");
          const o = id ? s.objects[id] : undefined;
          if (o?.zone !== "battlefield" || String(o.zoneChanges ?? 0) !== zc) continue;
          invalidateCharacteristics(s);
          const put = withPutter(voter, () => putCounters(s, o, e.counter, n));
          log(s, `${player(s, voter).name} puts ${put} ${e.counter} counter${put === 1 ? "" : "s"} on ${defOf(s, o).name}.`);
          if (put > 0 && s.resolving) (s.resolving.countersPutThisWay ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, kind: e.counter });
        }
        return;
      }
      const base = amountNow(s, e.n, ctx);
      const n = e.perLastKnownCounter ? base * (ctx.lki?.counters?.[e.perLastKnownCounter] ?? 0) : base;
      if (n <= 0) return;
      const by = e.by && players(s, e.by, ctx)[0];
      // "A +1/+1 counter or a loyalty counter": its controller chooses which as this resolves (rulings on Elspeth Conquers Death).
      // Bold Plagiarist: the kind its trigger's event put.
      let kind = e.eventCounter ? ctx.event?.counter : e.counter;
      if (kind === undefined) return;
      if (e.orCounter) {
        const sc = (s.resolving!.scratch ??= {});
        const on = objects(s, e.what, ctx)[0];
        if (!on) return;
        if (!sc.counterKind) {
          const kinds = [e.counter, e.orCounter, ...(e.orCounters ?? [])];
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "counterKind", options: kinds, labels: kinds.map((k) => `A ${k} counter`), prompt: `choose the kind of counter to put on ${characteristics(s, on).name}`, about: on.id };
          return "paused";
        }
        kind = sc.counterKind;
        sc.counterKind = undefined;
      }
      for (const o of objects(s, e.what, ctx)) {
        // Clockwork Beast: fewer, up to the total allowed (the "up to X" lets its controller put fewer, rulings).
        const m = e.maxTotal !== undefined ? Math.min(n, e.maxTotal - (o.counters[kind] ?? 0)) : n;
        if (m <= 0) continue;
        invalidateCharacteristics(s);
        // Modular's own counters (the only effect counting a permanent's last known counters): Zabaz adds one more.
        const putNow = () => (e.perLastKnownCounter ? withModular(() => putCounters(s, o, kind, m)) : putCounters(s, o, kind, m));
        const put = by !== undefined ? withPutter(by, putNow) : putNow();
        log(s, `${defOf(s, o).name} gets ${put} ${kind} counter${put > 1 ? "s" : ""}.`);
        // "Each creature that had a +1/+1 counter put on it this way" (Fangs of Kalonia): not one a replacement kept them off.
        if (put > 0 && s.resolving) (s.resolving.countersPutThisWay ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, kind, n: put });
      }
      return;
    }
    case "distribute": {
      // Chosen as it resolves (CR 608.2d), among what its controller controls then; untargeted, so protection doesn't
      // matter (rulings on Blessing of Frost).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const n = (sc.n ??= amountNow(s, e.n, ctx));
      // Moving them (Forgotten Ancient): from this permanent, still here as the same object (CR 122.5, 400.7), onto other
      // creatures anyone controls.
      const self = e.move ? objects(s, { ref: "self" }, ctx).find((o) => o.zone === "battlefield") : undefined;
      if (e.move && !self) return;
      // Sensational Spider-Man: "remove up to three stun counters from among all permanents": any permanents that have one
      // that can come off them (Fear of Sleep Paralysis), anyone's (rulings).
      if (e.remove) {
        const has = Object.fromEntries(s.battlefield.flatMap((id) => (objectMatches(s, e.filter, obj(s, id), ctx.controller, false) && removableCounters(s, obj(s, id), e.counter) > 0 ? [[id, removableCounters(s, obj(s, id), e.counter)] as const] : [])));
        const removable = Object.keys(has);
        if (n <= 0 || !removable.length) return;
        const parts = sc.distributed;
        if (!parts) {
          s.pending = { kind: "distribute", player: ctx.controller, source: src, counter: e.counter, total: n, options: removable, what: e.filter.text, remove: true, has };
          return "paused";
        }
        let removed = 0;
        for (const id of removable) {
          const o = obj(s, id);
          const k = Math.min(parts[id] ?? 0, removableCounters(s, o, e.counter));
          if (k <= 0) continue;
          const had = o.counters[e.counter] ?? 0;
          o.counters[e.counter] = had - k;
          removed += k;
          invalidateCharacteristics(s);
          log(s, `${characteristics(s, o).name} loses ${k} ${e.counter} counter${k > 1 ? "s" : ""}.`);
          countersRemoved(s, o, e.counter, k);
          if (had === k) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
        }
        r.countersRemoved = (r.countersRemoved ?? 0) + removed;
        return;
      }
      const options = s.battlefield.filter((id) => (e.move ? id !== self!.id && objectMatches(s, e.filter, obj(s, id), ctx.controller, false) : objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), ctx.controller, false)));
      if (n <= 0 || !options.length) return;
      let parts = sc.distributed;
      if (!parts && options.length === 1 && !e.move) parts = { [options[0]!]: n };
      if (!parts) {
        s.pending = { kind: "distribute", player: ctx.controller, source: src, counter: e.counter, total: n, options, what: e.filter.text, ...(e.move ? { move: true as const } : {}) };
        return "paused";
      }
      for (const id of options) {
        const k = parts[id] ?? 0;
        const o = obj(s, id);
        if (k <= 0) continue;
        if (self) {
          // Only as many as are still on it (and can come off it, Fear of Sleep Paralysis).
          const has = self.counters[e.counter] ?? 0;
          const m = Math.min(k, removableCounters(s, self, e.counter));
          if (m <= 0) continue;
          self.counters[e.counter] = has - m;
          invalidateCharacteristics(s);
          countersRemoved(s, self, e.counter, m);
          const put = putCounters(s, o, e.counter, m);
          log(s, `${defOf(s, self).name} moves ${m} ${e.counter} counter${m > 1 ? "s" : ""} onto ${defOf(s, o).name}${put !== m ? ` (${put} are put on it)` : ""}.`);
          continue;
        }
        invalidateCharacteristics(s);
        const put = putCounters(s, o, e.counter, k);
        log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "lastKnownCounters": {
      const had = Object.entries(ctx.lki?.counters ?? {}).filter(([k, n]) => n > 0 && (!e.only || k === e.only));
      for (const o of objects(s, e.what, ctx))
        for (const [k, n] of had) {
          invalidateCharacteristics(s);
          const put = putCounters(s, o, k, n);
          log(s, `${defOf(s, o).name} gets ${put} ${k} counter${put > 1 ? "s" : ""}.`);
        }
      return;
    }
    case "endure": {
      // CR 701.63a: "that permanent's controller creates an N/N white Spirit creature token unless they put N +1/+1
      // counters on that permanent", chosen as it resolves. Gone from the battlefield: just the token (rulings).
      const sc = (s.resolving!.scratch ??= {});
      const n = (sc.n ??= amountNow(s, e.n, ctx));
      if (n <= 0) return; // CR 701.63b
      const o = objects(s, e.what, ctx)[0];
      const who = o ? controllerOf(s, o) : ctx.controller;
      if (o && sc.endure === undefined) {
        const name = defOf(s, o).name;
        s.pending = { kind: "chooseOption", player: who, source: src, what: "endure", options: ["counters", "token"], labels: [`${n} +1/+1 counter${n > 1 ? "s" : ""} on ${name}`, `a ${n}/${n} Spirit token`] };
        return "paused";
      }
      if (o && sc.endure === "counters") {
        invalidateCharacteristics(s);
        const put = putCounters(s, o, "+1/+1", n);
        log(s, `${defOf(s, o).name} endures ${n}: it gets ${put} +1/+1 counter${put > 1 ? "s" : ""}.`);
        return;
      }
      const spirit: TokenSpec = { name: "Spirit", power: n, toughness: n, colors: ["W"], types: ["Creature"], subtypes: ["Spirit"], keywords: [] };
      if (s.resolving) s.resolving.created = [];
      enterTogether(s, () => {
        const { same, extra } = tokenBatch(s, who, spirit, 1);
        for (let i = same; i > 0; i--) createToken(s, who, spirit);
        log(s, `${src} endures ${n}: ${player(s, who).name} creates ${same === 1 ? "a" : same} ${n}/${n} Spirit token${same === 1 ? "" : "s"}.`);
        createExtraTokens(s, who, extra);
      });
      return;
    }
    case "moveCounter": {
      // Remove it from the first and put it on the second; if either can't happen, neither does (CR 122.5).
      const from = objects(s, e.from, ctx)[0];
      const to = objects(s, e.to, ctx)[0];
      if (!from || !to || from.id === to.id) return;
      let counter = e.counter;
      if (counter === "any") {
        // "Move a counter": a kind it has, chosen as it resolves (rulings on Nesting Grounds).
        const kinds = Object.keys(from.counters).filter((k) => removableCounters(s, from, k) > 0);
        const sc = (s.resolving!.scratch ??= {});
        if (kinds.length > 1 && sc.counterKind === undefined) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "counterKind", options: kinds, labels: kinds.map((k) => `A ${k} counter`), prompt: `choose the kind of counter to move from ${characteristics(s, from).name} onto ${characteristics(s, to).name}` };
          return "paused";
        }
        counter = sc.counterKind ?? kinds[0] ?? "";
        sc.counterKind = undefined;
      }
      // A counter that can't be removed doesn't move: none is put on the other one either (rulings on Fear of Sleep Paralysis).
      if (!removableCounters(s, from, counter)) return;
      from.counters[counter]! -= 1;
      countersRemoved(s, from, counter, 1);
      const put = putCounters(s, to, counter, 1);
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, from).name} moves a ${counter} counter onto ${characteristics(s, to).name}${put > 1 ? ` (${put} counters are put on it)` : ""}.`);
      if (!from.counters[counter]) fireEvent(s, { type: "lastCounterRemoved", id: from.id, counter });
      return;
    }
    case "counterOfKindOnIt": {
      // A kind of counter it has, chosen as it resolves (with one kind, that one); with none, nothing happens.
      // Animation Module: a target player's counters too (CR 122.1), if the target is still legal (CR 608.2b).
      const t = e.host !== undefined && ctx.legal[e.host] ? ctx.targets[e.host] : undefined;
      if (t?.kind === "player") {
        const p = player(s, t.id);
        if (p.lost) return;
        const kinds = (["poison", "energy", "experience", "rad"] as const).filter((k) => (p[k] ?? 0) > 0);
        if (e.eachKind) {
          for (const k of kinds) {
            const put = putPlayerCounters(s, p.id, k, 1);
            log(s, `${src} gives ${p.name} ${put === 1 ? "a" : put} ${k} counter${put === 1 ? "" : "s"}.`);
          }
          return;
        }
        const sc = (s.resolving!.scratch ??= {});
        if (kinds.length > 1 && sc.counterKind === undefined) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "counterKind", options: [...kinds], labels: kinds.map((k) => `A ${k} counter`), prompt: `choose a kind of counter ${p.name} has to give them another of` };
          return "paused";
        }
        const counter = (sc.counterKind ?? kinds[0]) as (typeof kinds)[number] | undefined;
        sc.counterKind = undefined;
        if (!counter || !kinds.includes(counter)) return;
        const put = putPlayerCounters(s, p.id, counter, 1);
        log(s, `${src} gives ${p.name} ${put === 1 ? "a" : put} ${counter} counter${put === 1 ? "" : "s"}.`);
        return;
      }
      const o = objects(s, e.what, ctx)[0];
      if (!o) return;
      const kinds = Object.keys(o.counters).filter((k) => (o.counters[k] ?? 0) > 0);
      if (e.eachKind) {
        for (const k of kinds) {
          const put = putCounters(s, o, k, 1);
          invalidateCharacteristics(s);
          log(s, `${src} puts ${put === 1 ? "a" : put} ${k} counter${put === 1 ? "" : "s"} on ${characteristics(s, o).name}.`);
        }
        return;
      }
      const sc = (s.resolving!.scratch ??= {});
      if (kinds.length > 1 && sc.counterKind === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "counterKind", options: kinds, labels: kinds.map((k) => `A ${k} counter`), prompt: `choose a kind of counter on ${characteristics(s, o).name} to put another of` };
        return "paused";
      }
      const counter = sc.counterKind ?? kinds[0];
      sc.counterKind = undefined;
      if (!counter || !kinds.includes(counter)) return;
      const put = putCounters(s, o, counter, 1);
      invalidateCharacteristics(s);
      log(s, `${src} puts ${put === 1 ? "a" : put} ${counter} counter${put === 1 ? "" : "s"} on ${characteristics(s, o).name}.`);
      return;
    }
    case "noteAmount":
      s.resolving!.notedAmount = amountNow(s, e.n, ctx);
      return;
    case "noteManaSpent": {
      // Its source, if it's still the same object (CR 400.7); one type of mana spent (the cost {1} paid with one mana).
      const o = objects(s, { ref: "self" }, ctx)[0];
      const types = [...new Set(s.resolving?.item.manaSpentTypes ?? [])];
      if (!o || types.length !== 1) return;
      o.notedMana = types[0]!;
      log(s, `${src} notes ${types[0] === "C" ? "colorless" : ({ W: "white", U: "blue", B: "black", R: "red", G: "green" } as const)[types[0] as "W"]} mana.`);
      return;
    }
    case "removeCounters":
      if (e.setsDid && s.resolving) s.resolving.did = false;
      for (const o of objects(s, e.what, ctx)) {
        const had = o.counters[e.counter] ?? 0;
        const can = removableCounters(s, o, e.counter);
        const want = e.n === "all" ? had : e.n === "allButOne" ? had - 1 : amountNow(s, e.n, ctx);
        const n = Math.min(can, want);
        if (n <= 0) continue;
        if (e.setsDid && s.resolving) s.resolving.did = n === want;
        o.counters[e.counter] = had - n;
        // "For each charge counter removed this way" (Coalition Relic).
        if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + n;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses ${n} ${e.counter} counter${n > 1 ? "s" : ""}.`);
        countersRemoved(s, o, e.counter, n);
        // Deep-Sea Kraken removing a time counter from itself in exile: "whenever a time counter is removed from ~ while
        // it's exiled" sees it too (CR 113.6).
        if (e.counter === "time" && o.zone === "exile") fireEvent(s, { type: "timeCountersRemovedExiled", id: o.id, n });
        if (had === n) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      }
      return;
    case "removeAnyCounters": {
      // The counters are chosen one at a time as it resolves, any kinds (rulings on Glissa Sunslayer), then removed
      // together; with fewer on it than that, all of them (rulings on Thornmantle Striker).
      const o0 = objects(s, e.what, ctx)[0];
      // Moving: none if the other one is gone or is the same (CR 122.5).
      const to = e.moveTo ? objects(s, e.moveTo, ctx)[0] : undefined;
      const o = e.moveTo && (!to || to.id === o0?.id) ? undefined : o0;
      const sc = (s.resolving!.scratch ??= {});
      const picked = (sc.countersPicked ??= {});
      const n = !o ? 0 : e.moveTo ? Object.entries(o.counters).reduce((a, [k, b]) => a + (!e.kinds || e.kinds.includes(k) ? Math.max(0, b) : 0), 0) : amountNow(s, e.n, ctx);
      const left = (k: string) => (o!.counters[k] ?? 0) - (picked[k] ?? 0);
      const count = () => Object.values(picked).reduce((a, b) => a + b, 0);
      while (o && count() < n && !sc.countersDone) {
        const kinds = Object.keys(o.counters).filter((k) => left(k) > 0 && !countersStay(s, o, k) && (!e.kinds || e.kinds.includes(k)));
        if (!kinds.length) break;
        if (sc.counterKind !== undefined) {
          if (sc.counterKind === "done") sc.countersDone = true;
          else if (left(sc.counterKind) > 0) picked[sc.counterKind] = (picked[sc.counterKind] ?? 0) + 1;
          sc.counterKind = undefined;
          continue;
        }
        if (kinds.length === 1 && !e.upTo) {
          picked[kinds[0]!] = (picked[kinds[0]!] ?? 0) + Math.min(left(kinds[0]!), n - count());
          break;
        }
        const name = characteristics(s, o).name;
        const prompt = to ? `choose a counter to move from ${name} onto ${characteristics(s, to).name} (${count()} so far)` : `choose a counter to remove from ${name} (${count() + 1} of ${n})`;
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "removeCounter", about: o.id, ...(to ? { onto: to.id } : {}), options: [...kinds, ...(e.upTo ? ["done"] : [])], labels: [...kinds.map((k) => `A ${k} counter (${left(k)} left)`), ...(e.upTo ? [count() ? "That's all" : "None"] : [])], prompt };
        return "paused";
      }
      sc.countersPicked = undefined;
      sc.countersDone = undefined;
      if (!o) return;
      if (to) {
        for (const [k, m] of Object.entries(picked)) {
          if (m <= 0) continue;
          const had = o.counters[k] ?? 0;
          o.counters[k] = had - m;
          countersRemoved(s, o, k, m);
          const put = putCounters(s, to, k, m);
          invalidateCharacteristics(s);
          log(s, `${characteristics(s, o).name} moves ${m} ${k} counter${m > 1 ? "s" : ""} onto ${characteristics(s, to).name}${put !== m ? ` (${put} are put on it)` : ""}.`);
          if (had === m) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
        }
        return;
      }
      // "For each counter removed this way" (Hex Parasite): only those actually removed (rulings).
      if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + Object.values(picked).reduce((a, b) => a + Math.max(0, b), 0);
      for (const [k, m] of Object.entries(picked)) {
        if (m <= 0) continue;
        const had = o.counters[k] ?? 0;
        o.counters[k] = had - m;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses ${m} ${k} counter${m > 1 ? "s" : ""}.`);
        countersRemoved(s, o, k, m);
        if (had === m) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
      }
      return;
    }
    case "gatherCounters": {
      // Slippery Bogbonder: one counter at a time from any creature it may come from (not the one they go onto, rulings),
      // then all moved at once (CR 122.5); none if the target is gone.
      // Eventide's Shadow (no `onto`): removed from any of them instead, all at once.
      const to = e.onto ? objects(s, e.onto, ctx)[0] : undefined;
      const removing = !e.onto;
      const sc = (s.resolving!.scratch ??= {});
      const picked = (sc.gathered ??= {});
      const sources = () => (removing ? s.battlefield.map((id) => obj(s, id)).filter((o) => objectMatches(s, e.from, o, ctx.controller, false)) : to?.zone === "battlefield" ? s.battlefield.map((id) => obj(s, id)).filter((o) => o.id !== to.id && objectMatches(s, e.from, o, ctx.controller, false)) : []);
      const left = (id: ObjectId, k: string) => (obj(s, id).counters[k] ?? 0) - (picked[`${id}:${k}`] ?? 0);
      const count = () => Object.values(picked).reduce((a, b) => a + b, 0);
      while ((to || removing) && !sc.countersDone) {
        if (sc.counterKind !== undefined) {
          if (sc.counterKind === "done") sc.countersDone = true;
          else {
            const [id, k] = [sc.counterKind.slice(0, sc.counterKind.indexOf(":")), sc.counterKind.slice(sc.counterKind.indexOf(":") + 1)];
            if (left(id, k) > 0) picked[sc.counterKind] = (picked[sc.counterKind] ?? 0) + 1;
          }
          sc.counterKind = undefined;
          continue;
        }
        const options = sources().flatMap((o) => Object.keys(o.counters).filter((k) => left(o.id, k) > 0 && !countersStay(s, o, k)).map((k) => `${o.id}:${k}`));
        if (!options.length) break;
        const label = (opt: string) => {
          const id = opt.slice(0, opt.indexOf(":"));
          const k = opt.slice(opt.indexOf(":") + 1);
          return `A ${k} counter from ${characteristics(s, obj(s, id)).name} (${left(id, k)} left)`;
        };
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "removeCounter", ...(to ? { onto: to.id } : {}), options: [...options, "done"], labels: [...options.map(label), count() ? "That's all" : "None"], prompt: to ? `choose a counter to move onto ${characteristics(s, to).name} (${count()} so far)` : `choose a counter to remove (${count()} so far)` };
        return "paused";
      }
      sc.gathered = undefined;
      sc.countersDone = undefined;
      if (removing) {
        let total = 0;
        for (const [key, m] of Object.entries(picked)) {
          const id = key.slice(0, key.indexOf(":"));
          const k = key.slice(key.indexOf(":") + 1);
          const o = obj(s, id);
          const n = Math.min(m, removableCounters(s, o, k));
          if (n <= 0 || o.zone !== "battlefield") continue;
          const had = o.counters[k] ?? 0;
          o.counters[k] = had - n;
          total += n;
          invalidateCharacteristics(s);
          log(s, `${characteristics(s, o).name} loses ${n} ${k} counter${n > 1 ? "s" : ""}.`);
          countersRemoved(s, o, k, n);
          if (had === n) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
        }
        if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + total;
        return;
      }
      if (!to || to.zone !== "battlefield") return;
      for (const [key, m] of Object.entries(picked)) {
        const id = key.slice(0, key.indexOf(":"));
        const k = key.slice(key.indexOf(":") + 1);
        const o = obj(s, id);
        if (m <= 0 || o.zone !== "battlefield") continue;
        const had = o.counters[k] ?? 0;
        o.counters[k] = had - m;
        countersRemoved(s, o, k, m);
        const put = putCounters(s, to, k, m);
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} moves ${m} ${k} counter${m > 1 ? "s" : ""} onto ${characteristics(s, to).name}${put !== m ? ` (${put} are put on it)` : ""}.`);
        if (had === m) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
      }
      return;
    }
    case "battleDefense":
      // Its protector is "who protects it" (CR 310.9e): an opponent's protection, defense counters off; else on.
      for (const o of objects(s, e.what, ctx)) {
        if (!objIsType(s, o, "Battle")) continue;
        const name = characteristics(s, o).name;
        if (o.protector !== undefined && opponents(s, ctx.controller).includes(o.protector)) {
          const had = o.counters.defense ?? 0;
          const n = Math.min(had, e.n);
          if (n <= 0) continue;
          o.counters.defense = had - n;
          invalidateCharacteristics(s);
          log(s, `${name} loses ${n} defense counter${n > 1 ? "s" : ""}.`);
          countersRemoved(s, o, "defense", n);
          if (had === n) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "defense" });
        } else {
          const put = putCounters(s, o, "defense", e.n);
          invalidateCharacteristics(s);
          log(s, `${name} gets ${put} defense counter${put === 1 ? "" : "s"}.`);
        }
      }
      return;
    case "removeAllCounters":
      for (const o of objects(s, e.what, ctx)) {
        const kinds = Object.entries(o.counters).filter(([k, n]) => n > 0 && !countersStay(s, o, k));
        if (!kinds.length) continue;
        const total = kinds.reduce((a, [, n]) => a + n, 0);
        for (const [kind] of kinds) o.counters[kind] = 0;
        if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + total;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses all its counters (${kinds.map(([k, n]) => `${n} ${k}`).join(", ")}).`);
        for (const [k, n] of kinds) countersRemoved(s, o, k, n);
        for (const [k] of kinds) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
      }
      return;
    case "moveAllCounters": {
      // Both have to still be there and legal targets, or no counters move (CR 122.5; rulings on Fate Transfer).
      // Spike Cannibal (`only`): from every other object in the group, each kind removed from all of them first.
      const to = objects(s, e.to, ctx)[0];
      const froms = (e.only ? objects(s, e.from, ctx) : objects(s, e.from, ctx).slice(0, 1)).filter((o) => o.id !== to?.id);
      if (!to || !froms.length) return;
      const moved = froms.map((from) => ({ from, kinds: Object.entries(from.counters).filter(([k, n]) => n > 0 && (!e.only || k === e.only) && !countersStay(s, from, k)) }));
      for (const { from, kinds } of moved)
        for (const [kind, n] of kinds) {
          from.counters[kind] = 0;
          countersRemoved(s, from, kind, n);
          // Black Panther: "if one or more +1/+1 counters are moved this way, ... that much": those taken off to move.
          if (e.only !== undefined && s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + n;
        }
      for (const { kinds } of moved)
        for (const [kind, n] of kinds)
          // Put onto the other one, so replacement effects and "whenever counters are put" apply (Nexus Mentality rulings).
          putCounters(s, to, kind, n);
      invalidateCharacteristics(s);
      for (const { from, kinds } of moved) if (kinds.length) log(s, `${characteristics(s, from).name}'s counters (${kinds.map(([k, n]) => `${n} ${k}`).join(", ")}) move onto ${characteristics(s, to).name}.`);
      return;
    }
    case "removeSelfCounter": {
      // Fading (CR 702.32a): "remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      // Vanishing (CR 702.63a): removing the last time counter triggers its sacrifice ability.
      // Cocoon: "remove a pupa counter from ~. If you can't, ...": whether one was removed (ResolvingInfo.did).
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (s.resolving) s.resolving.did = false;
      if (!o) return;
      const name = characteristics(s, o).name;
      const had = o.counters[e.counter] ?? 0;
      if (removableCounters(s, o, e.counter) > 0) {
        if (s.resolving) s.resolving.did = true;
        o.counters[e.counter] = had - 1;
        log(s, `${name} loses a ${e.counter} counter (${had - 1} left).`);
        countersRemoved(s, o, e.counter, 1);
        if (had === 1) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      } else if (e.orSacrifice && controllerOf(s, o) === ctx.controller) {
        log(s, `${player(s, ctx.controller).name} sacrifices ${name}: it has no ${e.counter} counters left.`);
        moveObject(s, o.id, "graveyard", { sacrificed: true });
      }
      return;
    }
    case "renown": {
      // "If it isn't renowned" again as it resolves (CR 603.4); gone means it can't become renowned.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o || o.renowned) return;
      putCounters(s, o, "+1/+1", e.n);
      o.renowned = true;
      // "As long as ~ is renowned" (Honored Hierarch) reads it (CR 702.112b).
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, o).name} gets ${e.n} +1/+1 counter${e.n > 1 ? "s" : ""} and becomes renowned.`);
      fireEvent(s, { type: "becameRenowned", id: o.id });
      return;
    }
    case "adapt": {
      // As it resolves: any +1/+1 counter on it, for whatever reason, and it gets none (rulings). Gone: nothing.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o) return;
      // Biomancer's Familiar: this time as though it had none; it adapts either way, so that's used up (CR 701.46a).
      const fresh = o.adaptFresh === s.turn;
      o.adaptFresh = undefined;
      if ((o.counters["+1/+1"] ?? 0) > 0 && !fresh) {
        log(s, `${characteristics(s, o).name} already has a +1/+1 counter, so it doesn't adapt.`);
        return;
      }
      const n = amountNow(s, e.n, ctx);
      invalidateCharacteristics(s);
      const put = n > 0 ? putCounters(s, o, "+1/+1", n) : 0;
      log(s, `${characteristics(s, o).name} adapts: it gets ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
      return;
    }
    case "adaptFresh": {
      for (const o of objects(s, e.what, ctx)) {
        o.adaptFresh = s.turn;
        log(s, `The next time ${characteristics(s, o).name} adapts this turn, it adapts as though it had no +1/+1 counters on it.`);
      }
      return;
    }
    case "monstrosity": {
      // "If this permanent isn't monstrous" as it resolves (CR 701.37a); it becomes monstrous even if no counters
      // end up on it (X is 0, CR 701.37c).
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o || o.monstrous) return;
      const n = amountNow(s, e.n, ctx);
      invalidateCharacteristics(s);
      const put = n > 0 ? putCounters(s, o, "+1/+1", n) : 0;
      o.monstrous = true;
      invalidateCharacteristics(s); // "as long as ~ is monstrous"
      log(s, `${characteristics(s, o).name} gets ${put} +1/+1 counter${put === 1 ? "" : "s"} and becomes monstrous.`);
      fireEvent(s, { type: "becameMonstrous", id: o.id, x: n });
      return;
    }
    case "evolve": {
      // Compared again as it resolves; with the entering creature gone, as it last existed (CR 603.4, 702.100a).
      const o = objects(s, { ref: "self" }, ctx)[0];
      const sub = ctx.subject && s.objects[ctx.subject.id];
      const still = sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === ctx.subject!.zc;
      if (still && !objIsType(s, sub, "Creature")) return; // CR 702.100c
      const stats = still ? { power: power(s, sub), toughness: toughness(s, sub) } : ctx.lki;
      if (!o || !stats || !evolves(s, o, stats)) {
        log(s, `${src}'s evolve does nothing.`);
        return;
      }
      // It evolves only if one or more counters were put on it (CR 702.100d; rulings on Watchful Radstag: once, however many).
      if (putCounters(s, o, e.counter ?? "+1/+1", 1) <= 0 || e.notKeyword) return;
      log(s, `${characteristics(s, o).name} evolves.`);
      fireEvent(s, { type: "evolved", id: o.id });
      return;
    }
    case "explore":
      return exploreReplaced(s, objects(s, e.what ?? { ref: "self" }, ctx)[0], ctx, src);
    case "exploreEach": {
      // The rulings: each of them explores, in the order its controller chooses; nobody acts in between.
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.exploreEach ??= { left: objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id) });
      for (;;) {
        if (st.current === undefined) {
          if (!st.left.length) break;
          const picked = sc.chosen?.[ctx.controller]?.[0];
          sc.chosen = sc.queue = undefined;
          if (st.left.length > 1 && !(picked && st.left.includes(picked))) {
            sc.queue = [ctx.controller];
            sc.chosen = {};
            s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "choose", what: "creature to explore next", options: [...st.left], count: 1 };
            return "paused";
          }
          st.current = picked && st.left.includes(picked) ? picked : st.left[0]!;
          st.left = st.left.filter((id) => id !== st.current);
        }
        if (exploreReplaced(s, s.objects[st.current], ctx, src) === "paused") return "paused";
        st.current = sc.explored = sc.may = undefined;
      }
      sc.exploreEach = undefined;
      return;
    }
    case "doublePT": {
      // Each one's own power and toughness as this resolves (CR 701.10b-c), so one effect for each, locked onto it.
      // All worked out before any of them changes (the effect is one event). Tripling adds twice them (CR 701.11b-c).
      const k = e.triple ? 2 : 1;
      const list = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield" && objIsType(s, o, "Creature")).map((o) => ({ o, p: e.power ? k * power(s, o) : 0, t: e.toughness ? k * toughness(s, o) : 0 }));
      for (const { o, p, t } of list) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: ctx.sourceId, duration: "endOfTurn", affected: [o.id], mods: [{ kind: "modifyPT", power: p, toughness: t }] });
        log(s, `${defOf(s, o).name} gets ${p < 0 ? "" : "+"}${p}/${t < 0 ? "" : "+"}${t} until end of turn.`);
      }
      if (list.length) invalidateCharacteristics(s);
      return;
    }
    case "exchangePower": {
      // CR 701.12g: each power becomes the other's previous power, by a layer 7b effect on each (CR 613.4b). Only if both
      // ~ and its target are still on the battlefield (rulings on Serene Master).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const [other] = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield" && objIsType(s, o, "Creature"));
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !objIsType(s, me, "Creature") || !other || other.id === me.id) {
        log(s, `${src}: the exchange can't happen.`);
        return;
      }
      const [mine, theirs] = [power(s, me), power(s, other)];
      const timestamp = s.nextTimestamp++;
      for (const [o, p] of [[me, theirs], [other, mine]] as const)
        s.effects.push({ id: `e${s.nextId++}`, timestamp, controller: ctx.controller, sourceName: src, sourceId: me.id, duration: e.duration, affected: [o.id], mods: [{ kind: "setPower", power: p }] });
      invalidateCharacteristics(s);
      log(s, `${src} and ${defOf(s, other).name} exchange their power (${mine} and ${theirs})${e.duration === "endOfCombat" ? " until end of combat" : " until end of turn"}.`);
      return;
    }
    case "ungoad": {
      const ids = new Set(objects(s, e.what, ctx).map((o) => o.id));
      let n = 0;
      const next: typeof s.effects = [];
      for (const ef of s.effects) {
        const goad = (m: Modification) => m.kind === "goad" && !m.notGoaded;
        const hit = ef.affected?.filter((id) => ids.has(id)) ?? [];
        if (!hit.length || !ef.mods.some(goad)) {
          next.push(ef);
          continue;
        }
        n += hit.length;
        const rest = ef.mods.filter((m) => !goad(m));
        // The others it affects stay goaded; what else it does to these goes on (a copy without the goad, same timestamp).
        if (ef.affected!.length > hit.length) next.push({ ...ef, affected: ef.affected!.filter((id) => !ids.has(id)) });
        if (rest.length) next.push({ ...ef, id: `e${s.nextId++}`, affected: hit, mods: rest });
      }
      s.effects = next;
      invalidateCharacteristics(s);
      if (n) log(s, `${src}: ${n} creature${n === 1 ? " is" : "s are"} no longer goaded.`);
      return;
    }
    case "continuous": {
      // The Laces: a target spell's color changes while it's that spell (CR 105.3); a permanent spell's change stays with
      // the permanent it becomes, for as long as the effect lasts (CR 112.4, 400.7a).
      const st = e.what.ref === "target" && ctx.legal[e.what.index] ? ctx.targets[e.what.index] : undefined;
      if (st?.kind === "stack") {
        const item = s.stack.find((x) => x.id === st.id);
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        if (!o || o.zone !== "stack") return;
        const mods = fixMods(s, e.mods, ctx);
        (o.spellGains ??= []).push({ mods, timestamp: s.nextTimestamp++, controller: ctx.controller, source: src, ...(e.duration === "game" ? { forever: true as const } : {}) });
        log(s, `${defOf(s, o).name} ${describeMods(s, mods, ctx.controller, false)}${e.duration === "endOfTurn" ? " until end of turn" : ""}.`);
        return;
      }
      // Dulcet Sirens: with its target opponent illegal, the creature isn't made to attack anyone (rulings).
      if (e.mods.some((m) => m.kind === "mustAttackPlayer" && typeof m.player === "object" && !ctx.legal[m.player.target])) return;
      // Inferno of the Star Mounts: its power as this begins, for "when its power becomes 20 this way" after it.
      if (e.notePower && s.resolving) {
        const me = objects(s, { ref: "self" }, ctx)[0];
        s.resolving.powerBefore = me?.zone === "battlefield" ? power(s, me) : undefined;
      }
      // The affected set is locked in now (CR 611.2c).
      // Backup: "If that's another creature, it gains ..." (CR 702.165a).
      // Rootwater Matriarch: an unenchanted creature isn't affected at all (rulings).
      // Stiltzkin, Moogle Merchant: "If they do" asks whether the player gained control of it (set below).
      if (e.setsDid && s.resolving) s.resolving.did = false;
      const affected = objects(s, e.what, ctx).map((o) => o.id).filter((id) => !(e.notSource && id === ctx.sourceId) && (!e.whileEnchanted || isEnchanted(s, id)));
      if (s.resolving) s.resolving.affected = affected.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
      if (s.resolving && e.mods.some((m) => m.kind === "goad")) s.resolving.goadedThisWay = affected.length;
      if (!affected.length) return;
      const mods = fixMods(s, e.mods, ctx);
      // "For as long as ~ remains tapped" (CR 611.2b): if that's already over, the effect does nothing. An activated
      // ability's source must not have untapped since it was activated (rulings on Rubinia Soulsinger, Preacher).
      let whileTapped: ContinuousEffect["whileTapped"];
      if (e.duration === "whileTapped") {
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        whileTapped = me && { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0, untaps: ctx.sourceUntaps ?? me.untaps ?? 0, ...(e.whileControlled ? { controller: ctx.controller } : {}) };
        if (!whileTapped || !whileTappedHolds(s, whileTapped)) {
          log(s, `${src}'s effect does nothing: ${e.whileControlled ? "its controller lost control of it or it" : "it"} didn't remain tapped.`);
          return;
        }
      }
      // "For as long as you control ~": over already if it left or changed control since (CR 611.2b, Master Thief).
      let whileControlled: ContinuousEffect["whileControlled"];
      if (e.duration === "whileControlled") {
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        whileControlled = me && { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0, ...(e.whileOnBattlefield ? {} : { controller: ctx.controller }) };
        if (!whileControlled || !whileControlledHolds(s, whileControlled)) {
          log(s, `${src}'s effect does nothing: ${e.whileOnBattlefield ? "it left the battlefield" : "its controller no longer controls it"}.`);
          return;
        }
      }
      // "Until ~ is cast from exile" (Shattered Seraph): the card its cost exiled, while it's still that object in exile; gone
      // from exile some other way already, it never ends (rulings).
      const exiledSelf = e.untilCastFromExile && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const untilCast = exiledSelf && exiledSelf.zone === "exile" && ctx.sourceZc !== undefined && (exiledSelf.zoneChanges ?? 0) === ctx.sourceZc + 1 ? { id: exiledSelf.id, zc: exiledSelf.zoneChanges ?? 0 } : undefined;
      // "Target player gains control of target permanent you control" (Donate): that player's effect.
      const giveTo = e.giveTo ? players(s, e.giveTo, ctx)[0] : undefined;
      if (e.giveTo && (giveTo === undefined || player(s, giveTo).lost)) return;
      // Keywords an affected object can't have now (an Archetype) are never gained from this effect (rulings).
      const notGranted: Record<ObjectId, string[]> = {};
      const gains = mods.flatMap((m) => (m.kind === "addKeywords" ? m.keywords : []));
      if (gains.length)
        for (const id of affected) {
          const cant = characteristics(s, obj(s, id)).cantHave ?? [];
          const no = gains.filter((k) => cant.some((x) => x.toLowerCase() === k.toLowerCase()));
          if (no.length) notGranted[id] = no;
        }
      // "For each poison counter its controller has" (Phyresis Outbreak): each controller's creatures get their own amount,
      // counted once now (rulings), as effects with one timestamp.
      const perController = JSON.stringify(e.mods).includes('"affectedControllerPoison"');
      // Akroma, Vision of Ixidor: each creature's own bonus, by the keywords it has now (rulings).
      const perAffected = JSON.stringify(e.mods).includes('"affectedKeywordCount"');
      const groups = perAffected ? affected.map((id) => [id]) : perController ? [...new Set(affected.map((id) => controllerOf(s, obj(s, id))))].map((pid) => affected.filter((id) => controllerOf(s, obj(s, id)) === pid)) : [affected];
      const timestamp = s.nextTimestamp++; // CR 613.7b
      for (const group of groups) {
        const groupMods = perController || perAffected ? fixMods(s, e.mods, ctx, group[0]) : mods;
        s.effects.push({
          id: `e${s.nextId++}`,
          timestamp,
          ...(Object.keys(notGranted).length ? { notGranted } : {}),
          controller: giveTo ?? ctx.controller,
          sourceName: src,
          sourceId: ctx.sourceId,
          duration: e.duration,
          ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : e.duration === "endOfYourNextTurn" || e.duration === "yourNextUpkeep" ? { turnOf: ctx.controller, sinceTurn: s.turn } : {}),
          ...(whileTapped ? { whileTapped } : {}),
          ...(whileControlled ? { whileControlled } : {}),
          ...(e.whileCounter ? { whileCounter: e.whileCounter } : {}),
          ...(e.whileEnchanted ? { whileEnchanted: true as const } : {}),
          ...(untilCast ? { untilCast } : {}),
          affected: group,
          mods: groupMods,
        });
        const names = group.map((id) => defOf(s, obj(s, id)).name);
        log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, groupMods, giveTo ?? ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : e.duration === "endOfCombat" ? " until end of combat" : e.duration === "yourNextTurn" ? ` until ${player(s, ctx.controller).name}'s next turn` : e.duration === "endOfYourNextTurn" ? ` until the end of ${player(s, ctx.controller).name}'s next turn` : e.duration === "yourNextUpkeep" ? ` until ${player(s, ctx.controller).name}'s next upkeep` : untilCast ? ` until ${src} is cast from exile` : e.duration === "whileTapped" ? ` for as long as ${src} remains tapped` : e.duration === "whileControlled" ? (e.whileOnBattlefield ? ` for as long as ${src} remains on the battlefield` : ` for as long as ${player(s, ctx.controller).name} controls ${src}`) : ""}.`);
      }
      if (e.setsDid && giveTo !== undefined && s.resolving) {
        invalidateCharacteristics(s);
        s.resolving.did = affected.some((id) => obj(s, id).zone === "battlefield" && controllerOf(s, obj(s, id)) === giveTo);
      }
      return;
    }
    case "exchangeControl": {
      // CR 701.12b: with either target gone or illegal, or both under one player's control, nothing happens (rulings on
      // Oko, Thief of Crowns). Otherwise each player gains control of the other's, at once, indefinitely.
      const a = objects(s, e.a, ctx)[0];
      const b = objects(s, e.b, ctx)[0];
      // "If you do" after it (Volatile Stormdrake): whether the exchange happened.
      if (s.resolving) s.resolving.did = false;
      if (!a || !b || a.zone !== "battlefield" || b.zone !== "battlefield") return;
      const [ca, cb] = [controllerOf(s, a), controllerOf(s, b)];
      if (ca === cb) {
        log(s, `${src}: ${defOf(s, a).name} and ${defOf(s, b).name} have the same controller, so nothing is exchanged.`);
        return;
      }
      for (const [o, to] of [[a, cb], [b, ca]] as const) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: to, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected: [o.id], mods: [{ kind: "control" }] });
      invalidateCharacteristics(s);
      log(s, `${player(s, ca).name} and ${player(s, cb).name} exchange control of ${defOf(s, a).name} and ${defOf(s, b).name}.`);
      if (s.resolving) s.resolving.did = true;
      return;
    }
    case "juxtapose": {
      // Juxtapose: for each type in turn, each of the two players' permanents of it with the greatest mana value (a tie
      // chosen by its controller), then the two exchanged (CR 701.12a); with either player having none, or both being the
      // same player, nothing happens for that type (rulings). An artifact creature can be in both exchanges (rulings).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const them = players(s, e.who, ctx)[0];
      if (them === undefined || player(s, them).lost || them === ctx.controller) return;
      const pair = [ctx.controller, them];
      const jux = (sc.jux ??= { stage: 0, picked: {} });
      for (; jux.stage < e.types.length; jux.stage++, jux.picked = {}) {
        const type = e.types[jux.stage]!;
        for (const pid of pair) {
          if (pid in jux.picked) continue;
          const mine = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), type));
          const top = Math.max(-1, ...mine.map((id) => characteristics(s, obj(s, id)).manaValue));
          const tied = mine.filter((id) => characteristics(s, obj(s, id)).manaValue === top);
          if (tied.length > 1) {
            if (sc.tieChoice === undefined || !tied.includes(sc.tieChoice)) {
              sc.tieChoice = undefined;
              s.pending = { kind: "chooseOption", player: pid, source: src, what: "greatestTie", options: tied, labels: tied.map((id) => defOf(s, obj(s, id)).name), prompt: `choose which of your ${type === "Creature" ? "creatures" : "artifacts"} with the greatest mana value (${top}) to exchange` };
              return "paused";
            }
            jux.picked[pid] = sc.tieChoice;
            sc.tieChoice = undefined;
          } else jux.picked[pid] = tied[0] ?? null;
        }
        const [a, b] = pair.map((pid) => jux.picked[pid]);
        const oa = a ? s.objects[a] : undefined;
        const ob = b ? s.objects[b] : undefined;
        if (!oa || !ob || oa.zone !== "battlefield" || ob.zone !== "battlefield") {
          log(s, `${src}: no ${type.toLowerCase()} exchange (a player controls none).`);
          continue;
        }
        const [ca, cb] = [controllerOf(s, oa), controllerOf(s, ob)];
        if (ca === cb) continue;
        for (const [o, to] of [[oa, cb], [ob, ca]] as const) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: to, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected: [o.id], mods: [{ kind: "control" }] });
        invalidateCharacteristics(s);
        log(s, `${player(s, ca).name} and ${player(s, cb).name} exchange control of ${defOf(s, oa).name} and ${defOf(s, ob).name}.`);
      }
      return;
    }
    case "swapCreatures": {
      // Each group is what each player controls as it resolves (CR 611.2c): the creatures are untapped, then each player
      // gains control of the other's at once, until end of turn, and all of them gain haste (rulings on Reins of Power).
      const opp = players(s, e.who, ctx)[0];
      if (opp === undefined || player(s, opp).lost) return;
      const creaturesOf = (pid: PlayerId) => s.battlefield.filter((id) => !s.phasedOut?.includes(id) && objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === pid);
      if (!e.untapAfter) for (const id of [...creaturesOf(ctx.controller), ...creaturesOf(opp)]) untapPermanent(s, obj(s, id));
      const mine = creaturesOf(ctx.controller);
      const theirs = creaturesOf(opp);
      const base = { sourceName: src, sourceId: ctx.sourceId, duration: "endOfTurn" as const };
      if (mine.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: opp, ...base, affected: mine, mods: [{ kind: "control" }] });
      if (theirs.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, ...base, affected: theirs, mods: [{ kind: "control" }] });
      if (e.untapAfter) {
        // Twist Allegiance: "Untap those creatures" once they've changed hands.
        invalidateCharacteristics(s);
        for (const id of [...mine, ...theirs]) if (obj(s, id).zone === "battlefield") untapPermanent(s, obj(s, id));
      }
      if (mine.length + theirs.length) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, ...base, affected: [...mine, ...theirs], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      invalidateCharacteristics(s);
      log(s, `${player(s, ctx.controller).name} and ${player(s, opp).name} exchange control of their creatures until end of turn (${mine.length} and ${theirs.length}).`);
      return;
    }
    case "ownersGainControl": {
      // Each owner's own effect, for the permanents of theirs others control (CR 613.1b, 613.7b).
      const byOwner = new Map<PlayerId, ObjectId[]>();
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (s.phasedOut?.includes(id) || controllerOf(s, o) === o.owner || player(s, o.owner).lost || !objectMatches(s, e.filter, o, ctx.controller, false)) continue;
        byOwner.set(o.owner, [...(byOwner.get(o.owner) ?? []), id]);
      }
      for (const [owner, affected] of byOwner) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: owner, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected, mods: [{ kind: "control" }] });
        log(s, `${player(s, owner).name} gains control of ${affected.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
      }
      if (!byOwner.size) log(s, `${src}: everyone already controls what they own.`);
      invalidateCharacteristics(s);
      return;
    }
    case "scrambleControl": {
      // One random pick per permanent, any living player (rulings); then each player's own effect for those they got
      // (CR 613.1b), all at the same time; then each of them untaps, whoever got it (rulings).
      const who = livingPlayers(s);
      const picked = s.battlefield.filter((id) => !s.phasedOut?.includes(id) && objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
      const byPlayer = new Map<PlayerId, ObjectId[]>();
      for (const id of picked) {
        const to = who[Math.floor(nextRandom(s) * who.length)]!;
        byPlayer.set(to, [...(byPlayer.get(to) ?? []), id]);
      }
      for (const [to, affected] of byPlayer) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: to, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected, mods: [{ kind: "control" }] });
        log(s, `${player(s, to).name} is chosen at random for ${affected.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
      }
      invalidateCharacteristics(s);
      for (const id of picked) if (obj(s, id).zone === "battlefield" && obj(s, id).tapped) untapPermanent(s, obj(s, id));
      if (!picked.length) log(s, `${src}: there's no nonland permanent.`);
      return;
    }
    case "groupRules": {
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: ctx.sourceId, duration: e.duration, ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : {}), affected: [], group: e.affects, mods: e.mods });
      invalidateCharacteristics(s);
      log(s, `Until ${e.duration === "endOfTurn" ? "end of turn" : `${player(s, ctx.controller).name}'s next turn`}, ${e.text} ${describeMods(s, e.mods, ctx.controller, true)}.`);
      return;
    }
    case "cantAttackNextTurn": {
      // Its controller as this resolves; their next turn, not this one (CR 500.1).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        const pid = controllerOf(s, o);
        (s.cantAttackNextTurn ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, player: pid, since: s.turn });
        log(s, `${defOf(s, o).name} can't attack during ${player(s, pid).name}'s next turn.`);
      }
      return;
    }
    case "attackWalkerNextTurn": {
      // The planeswalker whose ability this is, as it is now (CR 400.7): gone, there's nothing to attack.
      const pw = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!pw || pw.zone !== "battlefield" || (ctx.sourceZc !== undefined && (pw.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const name = defOf(s, pw).name;
      for (const o of e.what ? objects(s, e.what, ctx) : []) {
        if (o.zone !== "battlefield") continue;
        (s.attackWalkerNextTurn ??= []).push({ pw: pw.id, pwZc: pw.zoneChanges ?? 0, id: o.id, zc: o.zoneChanges ?? 0, since: s.turn });
        log(s, `${defOf(s, o).name} attacks ${name} during its controller's next turn if able.`);
      }
      for (const pid of e.who ? players(s, e.who, ctx) : []) {
        (s.attackWalkerNextTurn ??= []).push({ pw: pw.id, pwZc: pw.zoneChanges ?? 0, player: pid, since: s.turn });
        log(s, `During ${player(s, pid).name}'s next turn, creatures they control attack ${name} if able.`);
      }
      return;
    }
    case "attackYouNextTurn": {
      for (const pid of players(s, e.who, ctx)) {
        (s.attackPlayerNextTurn ??= []).push({ player: pid, attack: ctx.controller, since: s.turn });
        log(s, `During ${player(s, pid).name}'s next turn, creatures they control attack ${player(s, ctx.controller).name} if able.`);
      }
      return;
    }
    case "attackBanThisTurn": {
      // Call for Aid: "You can't attack that player this turn": that player only, not their planeswalkers (CR 506.2).
      if (e.protects) {
        const safe = players(s, e.protects, ctx)[0];
        if (safe === undefined) return;
        for (const pid of players(s, e.who, ctx)) {
          if (pid === safe) continue;
          (player(s, pid).attackBansThisTurn ??= []).push({ player: safe, turn: s.turn });
          log(s, `Creatures ${player(s, pid).name} controls can't attack ${player(s, safe).name} this turn.`);
        }
        return;
      }
      const you = player(s, ctx.controller).name;
      for (const pid of players(s, e.who, ctx)) {
        if (pid === ctx.controller) continue;
        (player(s, pid).attackBansThisTurn ??= []).push({ player: ctx.controller, turn: s.turn, ...(e.subtype ? { subtype: e.subtype } : {}), ...(e.combat ? { combat: s.combatsThisTurn ?? 0 } : {}) });
        log(s, `Creatures ${player(s, pid).name} controls can't attack ${e.subtype ? `${e.subtype}s ${you} controls` : you} this ${e.combat ? "combat" : "turn"}.`);
      }
      return;
    }
    case "attackBanNextTurn": {
      for (const pid of players(s, e.who, ctx)) {
        (player(s, pid).attackBansNextTurn ??= []).push({ player: ctx.controller });
        log(s, `${player(s, pid).name} can't attack ${player(s, ctx.controller).name} or permanents ${player(s, ctx.controller).name} controls during their next turn.`);
      }
      return;
    }
    case "playerGains": {
      // The chosen color or player filled in now (CR 608.2h); until end of turn (CR 514.2).
      const mod = fixMods(s, [{ kind: "addKeywords", keywords: e.keywords }], ctx)[0];
      // "Protection from that player": the player this instruction is being done for (Noble Heritage).
      const keywords = (mod?.kind === "addKeywords" ? mod.keywords : []).flatMap((k) => (k !== THAT_PLAYER_PROTECTION ? [k] : ctx.eachOne !== undefined ? [protectionFromPlayer(ctx.eachOne)] : []));
      // "Players gain hexproof until end of turn" (Everybody Lives!): each of them.
      if (e.everyone) {
        for (const pid of livingPlayers(s)) {
          const q = player(s, pid);
          q.gained = [...new Set([...(q.gained ?? []), ...keywords])];
        }
        log(s, `Players gain ${keywords.map((k) => k.toLowerCase()).join(" and ")} until end of turn.`);
        return;
      }
      // Teferi's Reproach: the target player (none if it's gone, CR 608.2b).
      const gainer = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (gainer === undefined) return;
      const p = player(s, gainer);
      if (e.lifeCantChange) {
        p.lifeCantChange = true;
        log(s, `${p.name}'s life total can't change until their next turn.`);
      }
      if (e.lifeFloorThisTurn) {
        p.lifeFloorTurn = s.turn;
        log(s, `Until end of turn, damage can't reduce ${p.name}'s life total below 1.`);
      }
      if (e.lifeCantChangeThisTurn) {
        p.lifeCantChangeTurn = s.turn;
        log(s, `${p.name}'s life total can't change this turn.`);
      }
      if (e.attackTax) {
        p.attackTaxUntil = [...(p.attackTaxUntil ?? []), e.attackTax];
        log(s, `Until ${p.name}'s next turn, creatures can't attack them${e.attackTax.planeswalkers ? " or planeswalkers they control" : ""} unless their controller pays {${e.attackTax.n}} for each.`);
      }
      if (e.unattackable) {
        p.unattackableUntil = true;
        log(s, `Until ${p.name}'s next turn, creatures can't attack them.`);
      }
      if (!keywords.length) return;
      if (e.untilYourNextTurn) p.gainedUntilNextTurn = [...new Set([...(p.gainedUntilNextTurn ?? []), ...keywords])];
      else p.gained = [...new Set([...(p.gained ?? []), ...keywords])];
      log(s, `${p.name} gains ${keywords.map((k) => keywordLabel(k, (x) => player(s, x).name).toLowerCase()).join(" and ")} ${e.untilYourNextTurn ? "until their next turn" : "until end of turn"}.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      // Armory Automaton: "any number of target Equipment", each legal one in turn.
      const mine = e.source ? objects(s, e.source, ctx) : ctx.sourceId && s.objects[ctx.sourceId] ? [s.objects[ctx.sourceId]!] : [];
      if (!host) return;
      for (const me of e.source?.ref === "target" && e.source.n ? mine : mine.slice(0, 1)) {
        // Something that isn't an Equipment (or an Aura, for "attach target Aura") doesn't move (CR 701.3b).
        if (e.source && !characteristics(s, me).subtypes.some((t) => t === "Equipment" || (t === "Aura" && !e.equipmentOnly))) continue;
        // Haunted Plate Mail: its equip ability while it's "no longer an Equipment" does nothing (rulings, CR 701.3b).
        if (!e.source && !characteristics(s, me).subtypes.some((t) => t === "Equipment" || t === "Aura" || t === "Fortification")) continue;
        const before = me.attachedTo;
        attachTo(s, me, host, e.asCreature);
        // Thorin: what became attached this way (one already attached there doesn't become attached, CR 701.3c).
        if (me.attachedTo === host.id && before !== host.id && s.resolving) (s.resolving.attachedThisWay ??= []).push(me.id);
      }
      return;
    }
    case "becomeLicid": {
      // A Licid (CR 116.2c): the effect lasts until its controller pays to end it, or the Licid leaves the battlefield.
      // It stops being every other card type and its creature types with them (CR 205.1a; rulings). Its ability does
      // nothing to a Licid that left and came back (CR 400.7); an illegal target already countered it (CR 608.2b).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const t = ctx.targets[0];
      const host = t?.kind === "object" && ctx.legal[0] ? s.objects[t.id] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !host) return;
      const index = compileCard(defOf(s, me)).activated.findIndex((ab) => ab.body.effects.some((x) => x.type === "becomeLicid"));
      s.effects.push({
        id: `e${s.nextId++}`,
        timestamp: s.nextTimestamp++,
        controller: ctx.controller,
        sourceName: src,
        sourceId: me.id,
        duration: "game",
        affected: [me.id],
        mods: [{ kind: "setTypes", types: ["Enchantment"], subtypes: ["Aura"] }, ...(index >= 0 ? [{ kind: "loseActivated" as const, index }] : []), { kind: "enchantCreature" }],
        endable: { cost: e.endCost },
      });
      invalidateCharacteristics(s);
      log(s, `${src} loses that ability and becomes an Aura enchantment with enchant creature (${player(s, ctx.controller).name} may pay ${e.endCost} to end this).`);
      // "Attach it to target creature" (CR 701.3a): not to itself (CR 303.4d), which the state-based actions then deal with.
      attachTo(s, me, host);
      return;
    }
    case "attachAny": {
      // Ardenn: the Auras and Equipment are chosen as it resolves, and attached at once (rulings), each only if it could
      // be attached to the target (CR 701.3a-b). Nothing happens with an illegal target (CR 608.2b).
      // Heavenly Blademaster: to the source, if it's still the same permanent (rulings).
      // Winter Soldier, Icy Assassin: "Return this card from your graveyard to the battlefield ... Then you may attach an
      // Equipment you control to him": the permanent the card became, put there by this ability (CR 400.7).
      const me = e.self && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const returned = !!me && (s.resolving?.created ?? []).includes(me.id);
      if (e.self && (!me || me.zone !== "battlefield" || (!returned && ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc))) return;
      const t = me ? ({ kind: "object", id: me.id } as const) : ctx.targets[e.host];
      if (!t || (!me && !ctx.legal[e.host])) return;
      const host = t.kind === "object" ? s.objects[t.id] : undefined;
      if (t.kind === "object" && host?.zone !== "battlefield") return;
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.queue) {
        const options = s.battlefield.filter((id) => {
          const o = obj(s, id);
          return controllerOf(s, o) === ctx.controller && (!e.equipment || characteristics(s, o).subtypes.includes("Equipment")) && canAttachTo(s, o, host ?? (t as { id: PlayerId }).id);
        });
        if (!options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        const to = host ? defOf(s, host).name : player(s, (t as { id: PlayerId }).id).name;
        s.pending = e.one
          ? { kind: "pickPermanents", player: ctx.controller, source: src, action: "attach", what: to, options, count: 1, min: 0, prompt: `you may click one of your Equipment to attach to ${to}, then attach it (or attach none).` }
          : { kind: "pickPermanents", player: ctx.controller, source: src, action: "attach", what: to, options, count: options.length, min: 0, anyNumber: true, ...(e.equipment ? { prompt: `click any number of your Equipment to attach to ${to}, then attach them (or attach none).` } : {}) };
        return "paused";
      }
      const chosen = sc.chosen?.[ctx.controller] ?? [];
      if (!chosen.length) log(s, `${player(s, ctx.controller).name} attaches nothing.`);
      for (const id of chosen) {
        const o = s.objects[id];
        if (!o || o.zone !== "battlefield") continue;
        if (host) attachTo(s, o, host);
        else attachToPlayer(s, o, (t as { id: PlayerId }).id);
      }
      return;
    }
    case "attachAll": {
      // Balan: each Equipment that isn't attached to the source already (CR 701.3c) and could be (CR 701.3b).
      const host = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || host.zone !== "battlefield" || (ctx.sourceZc !== undefined && (host.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      // Rhuk: the Equipment attached to the trigger's creature: now if it's still there, else as it last existed (the
      // same objects, still on the battlefield, CR 400.7).
      const subj = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      const stillThere = !!subj && subj.zone === "battlefield" && (subj.zoneChanges ?? 0) === ctx.subject!.zc;
      const fromSubject = (o: GameObject) => (stillThere ? o.attachedTo === subj!.id : (ctx.lki?.equipment ?? []).some((x) => x.id === o.id && x.zc === (o.zoneChanges ?? 0)));
      for (const id of [...s.battlefield]) {
        const o = obj(s, id);
        if (e.fromSubject && (!ctx.subject || !fromSubject(o) || !canAttachTo(s, o, host))) continue;
        if (o.id !== host.id && o.attachedTo !== host.id && objectMatches(s, e.filter, o, ctx.controller, false)) attachTo(s, o, host);
      }
      return;
    }
    case "doubleX": {
      // Unbound Flourishing: the spell's X on the stack (CR 107.3a), doubled; gone from the stack, nothing happens.
      const item = s.stack.find((x) => x.id === ctx.cause && x.kind === "spell");
      if (!item) return;
      const x = (item.x ?? 0) * 2;
      item.x = x;
      item.description = item.description.replace(/\(X=\d+\)$/, `(X=${x})`);
      log(s, `${src} doubles the value of X for ${item.description.replace(/ \(X=\d+\)$/, "")}: X is ${x}.`);
      return;
    }
    case "removeExiledCounter": {
      const options = exiledWithCounter(s, players(s, e.owner, ctx), e.counter);
      if (!options.length) return;
      const sc = (s.resolving!.scratch ??= {});
      const picked = (sc.auraHosts ??= {});
      const key = "exiledCounter";
      // Which card only matters when they have different numbers of them.
      const counts = new Set(options.map((id) => obj(s, id).counters[e.counter]));
      if (picked[key] === undefined) {
        if (counts.size > 1) {
          sc.auraAsking = key;
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options, labels: options.map((id) => `${defOf(s, obj(s, id)).name} (${obj(s, id).counters[e.counter]})`), prompt: `remove a ${e.counter} counter from which card?` };
          return "paused";
        }
        picked[key] = options[0]!;
      }
      const o = s.objects[picked[key]!];
      if (!o || !options.includes(o.id)) return;
      const left = (o.counters[e.counter] ?? 0) - 1;
      if (left > 0) o.counters[e.counter] = left;
      else delete o.counters[e.counter];
      log(s, `${player(s, ctx.controller).name} removes a ${e.counter} counter from ${defOf(s, o).name} in exile.`);
      countersRemoved(s, o, e.counter, 1);
      return;
    }
    case "attachLastKnown": {
      const host = objects(s, e.what, ctx).find((o) => o.zone === "battlefield");
      if (!host) return;
      // Still the same objects (CR 400.7), still Equipment, and able to be attached to it (CR 701.3b).
      const options = (ctx.lki?.equipment ?? [])
        .map((x) => s.objects[x.id])
        .filter((o): o is GameObject => !!o && o.zone === "battlefield" && characteristics(s, o).subtypes.includes("Equipment") && canAttachTo(s, o, host))
        .filter((o) => ctx.lki!.equipment!.some((x) => x.id === o.id && x.zc === (o.zoneChanges ?? 0)))
        .map((o) => o.id);
      if (!options.length) return;
      const sc = (s.resolving!.scratch ??= {});
      const picked = (sc.auraHosts ??= {});
      const key = "lastKnownEquipment";
      if (picked[key] === undefined) {
        if (options.length > 1) {
          sc.auraAsking = key;
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options, labels: options.map((id) => defOf(s, obj(s, id)).name), prompt: `choose an Equipment to attach to ${defOf(s, host).name}` };
          return "paused";
        }
        picked[key] = options[0]!;
      }
      const me = s.objects[picked[key]!];
      if (me && options.includes(me.id)) {
        attachTo(s, me, host);
        log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
      }
      return;
    }
    case "attachEquipmentTo": {
      const sc = (s.resolving!.scratch ??= {});
      const hosts = (sc.attachEach ??= objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id));
      for (; (sc.attachEqAt ?? 0) < hosts.length; sc.attachEqAt = (sc.attachEqAt ?? 0) + 1, sc.attachWhich = undefined) {
        const host = s.objects[hosts[sc.attachEqAt ?? 0]!];
        if (!host || host.zone !== "battlefield") continue;
        const options = s.battlefield.map((x) => obj(s, x)).filter((o) => controllerOf(s, o) === ctx.controller && characteristics(s, o).subtypes.includes("Equipment") && o.attachedTo !== host.id && canAttachTo(s, o, host));
        if (sc.attachWhich === undefined) {
          if (!options.length) continue;
          const choices = [...options.map((o) => o.id), "none"];
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attachWhich", options: choices, labels: choices.map((x) => (x === "none" ? "Don't attach" : defOf(s, obj(s, x)).name)), prompt: `choose an Equipment to attach to ${defOf(s, host).name}, or none` };
          return "paused";
        }
        const me = sc.attachWhich === "none" ? undefined : options.find((o) => o.id === sc.attachWhich);
        if (me) attachTo(s, me, host);
        // "If you do, unattach it ..." (Unexpected Request): the Equipment attached this way.
        if (me && me.attachedTo === host.id) (s.resolving!.attachedThisWay ??= []).push(me.id);
      }
      return;
    }
    case "attachToRandomOpponent": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      const options = opponents(s, ctx.controller).filter((pid) => pid !== me.attachedToPlayer && canAttachTo(s, me, pid));
      if (!options.length) return;
      attachToPlayer(s, me, options[Math.floor(nextRandom(s) * options.length)]!);
      return;
    }
    case "attachElsewhere": {
      // "Attach target Aura attached to a creature to another creature" (Crown of the Ages): the creature is chosen as
      // it resolves, not targeted (rulings), among those the Aura could enchant (CR 303.4d, 702.16c).
      const sc = (s.resolving!.scratch ??= {});
      const hosts = (sc.auraHosts ??= {});
      if (e.aurasOn) {
        // Glamer Spinners: the Auras on that permanent now, all to one other permanent its controller controls that each
        // of them could enchant (CR 303.4d, 702.16c); none move if there's no such permanent (rulings).
        const from = objects(s, e.source, ctx)[0];
        if (!from || from.zone !== "battlefield") return;
        const auras = s.battlefield.map((id) => obj(s, id)).filter((a) => a.attachedTo === from.id && characteristics(s, a).subtypes.includes("Aura"));
        if (!auras.length) return;
        const key = auras[0]!.id;
        if (hosts[key] === undefined) {
          const options = s.battlefield.filter((id) => id !== from.id && controllerOf(s, obj(s, id)) === controllerOf(s, from) && auras.every((a) => canAttachTo(s, a, obj(s, id))));
          if (!options.length) return;
          if (options.length > 1) {
            sc.auraAsking = key;
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options, labels: auraHostLabels(s, options.map((id) => ({ attachTo: id }))), prompt: `choose the permanent to attach the Auras on ${characteristics(s, from).name} to` };
            return "paused";
          }
          hosts[key] = options[0]!;
        }
        const host = s.objects[hosts[key]!];
        if (host) for (const a of auras) attachTo(s, a, host);
        return;
      }
      const me = objects(s, e.source, ctx)[0];
      if (!me || me.zone !== "battlefield" || !characteristics(s, me).subtypes.includes("Aura")) return;
      if (hosts[me.id] === undefined) {
        // Simic Guildmage: controlled by the controller of the permanent it's attached to; Enchantment Alteration: sharing a
        // type, creature or land, with it, as it is now. Neither if it isn't attached to a permanent now.
        const was = me.attachedTo ? s.objects[me.attachedTo] : undefined;
        if (e.host && was?.zone !== "battlefield") return;
        const wasTypes = e.host === "sameType" ? (["Creature", "Land"] as const).filter((t) => objIsType(s, was!, t)) : [];
        const fits = (h: GameObject) =>
          e.host === "sameController" ? controllerOf(s, h) === controllerOf(s, was!) : e.host === "sameType" ? wasTypes.some((t) => objIsType(s, h, t)) : objIsType(s, h, "Creature");
        const options = auraHostOptions(s, me, controllerOf(s, me)).flatMap((h) => ("attachTo" in h && h.attachTo !== me.attachedTo && fits(obj(s, h.attachTo)) ? [h] : []));
        if (!options.length) return;
        if (options.length > 1) {
          sc.auraAsking = me.id;
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose the creature to attach ${defOf(s, me).name} to` };
          return "paused";
        }
        hosts[me.id] = auraHostKey(options[0]!);
      }
      const host = s.objects[hosts[me.id]!];
      if (host) attachTo(s, me, host);
      return;
    }
    case "attachToChosen": {
      const sc = (s.resolving!.scratch ??= {});
      // Kudzu: another player chooses (the destroyed land's controller as it last existed, CR 608.2h).
      const chooser = e.chooser ? players(s, e.chooser, ctx)[0] : ctx.controller;
      if (chooser === undefined) return;
      const hosts = (sc.auraHosts ??= {});
      // "For each Aura and Equipment you control" (Inventory Management): each of those there as it resolves, one at a
      // time, each attached as its creature is chosen.
      const each = e.source.ref === "each";
      let all = each ? (sc.attachEach ??= objects(s, e.source, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id)) : objects(s, e.source, ctx).filter((o) => o.zone === "battlefield").slice(0, 1).map((o) => o.id);
      // Gilgamesh: "you may attach one of them to a Samurai you control": which one first, among those that could be
      // attached to one (rulings: not one that can't legally be attached).
      if (e.pickOne && !each) {
        const fits = (me: GameObject) => (!e.equipmentOnly || characteristics(s, me).subtypes.includes("Equipment")) && s.battlefield.some((x) => objectMatches(s, e.filter, obj(s, x), ctx.controller, false) && canAttachTo(s, me, obj(s, x)));
        const options = objects(s, e.source, ctx).filter((o) => o.zone === "battlefield" && fits(o));
        if (sc.attachWhich === undefined) {
          if (!options.length) return;
          if (options.length > 1 || e.may) {
            const choices = [...options.map((o) => o.id), ...(e.may ? ["none"] : [])];
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "attachWhich", options: choices, labels: choices.map((x) => (x === "none" ? "Don't attach" : defOf(s, obj(s, x)).name)), prompt: `choose one of them to attach to ${e.filter.text.replace(/^an? /, "a ")}${e.may ? ", or none" : ""}` };
            return "paused";
          }
          sc.attachWhich = options[0]!.id;
        }
        if (sc.attachWhich === "none") return;
        all = options.some((o) => o.id === sc.attachWhich) ? [sc.attachWhich] : [];
      }
      const may = e.may && !e.pickOne;
      for (const id of all) {
        const me = s.objects[id];
        if (!me || me.zone !== "battlefield" || hosts[id] === "done") continue;
        const ch = characteristics(s, me);
        if (e.equipmentOnly && !ch.subtypes.includes("Equipment")) continue;
        if (hosts[me.id] === undefined) {
          // The biggest creature first: what a bot picks. Not the one it's already attached to (CR 701.3b: nothing would happen).
          const options = s.battlefield
            .filter((x) => objectMatches(s, e.filter, obj(s, x), ctx.controller, false) && canAttachTo(s, me, obj(s, x)) && (!each || me.attachedTo !== x))
            .sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)));
          if (!options.length) continue;
          if (options.length > 1 || may) {
            sc.auraAsking = me.id;
            const choices = [...options, ...(may ? ["none"] : [])];
            const labels = choices.map((x) => (x === "none" ? (each && me.attachedTo ? "Leave it where it is" : "Don't attach it") : `${defOf(s, obj(s, x)).name}${controllerOf(s, obj(s, x)) === chooser ? "" : ` (${player(s, controllerOf(s, obj(s, x))).name})`}`));
            s.pending = { kind: "chooseOption", player: chooser, source: src, what: "enchant", options: choices, labels, prompt: `choose ${e.filter.text.replace(/^an? /, "a ")} to attach ${defOf(s, me).name} to${may ? ", or none" : ""}` };
            return "paused";
          }
          hosts[me.id] = options[0]!;
        }
        const host = s.objects[hosts[me.id]!];
        if (host && canAttachTo(s, me, host)) {
          attachTo(s, me, host);
          log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
        }
        if (each) hosts[me.id] = "done";
      }
      return;
    }
    case "transformSelf": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc)) return;
      transformToken(s, me);
      return;
    }
    case "unattach": {
      // CR 701.3d: it stays on the battlefield, attached to nothing.
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || !o.attachedTo) continue;
        if (e.ifAttachedToYours && !(objIsType(s, obj(s, o.attachedTo), "Creature") && controllerOf(s, obj(s, o.attachedTo)) === ctx.controller)) continue;
        if (e.ifEquipment && !characteristics(s, o).subtypes.includes("Equipment")) continue;
        log(s, `${defOf(s, o).name} is unattached from ${defOf(s, obj(s, o.attachedTo)).name}.`);
        fireEvent(s, { type: "unattached", id: o.id, host: o.attachedTo });
        o.attachedTo = undefined;
        invalidateCharacteristics(s);
      }
      return;
    }
    case "unattachSelf": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !me.attachedTo) return;
      log(s, `${defOf(s, me).name} is unattached from ${defOf(s, obj(s, me.attachedTo)).name}.`);
      fireEvent(s, { type: "unattached", id: me.id, host: me.attachedTo });
      me.attachedTo = undefined;
      invalidateCharacteristics(s);
      return;
    }
  }
}

/**
 * Could this Aura or Equipment on the battlefield be attached to this permanent or player now (CR 701.3a-b)? Not to what
 * it's attached to already, nor to itself; an Equipment only to a creature, and not while it's a creature itself unless
 * it has reconfigure (CR 301.5c); an Aura to what its enchant ability allows (CR 303.4d, 702.5d); neither to something
 * with protection from it (CR 702.16c-d).
 */
export function canAttachTo(s: GameState, me: GameObject, host: GameObject | PlayerId, asCreature?: boolean): boolean {
  if (me.zone !== "battlefield") return false;
  const meChars = characteristics(s, me);
  const aura = meChars.subtypes.includes("Aura");
  // A Fortification is to lands what an Equipment is to creatures (CR 301.6): only to a land, and not while it's a
  // creature itself.
  const fortification = !aura && !meChars.subtypes.includes("Equipment") && meChars.subtypes.includes("Fortification");
  if (!aura && !meChars.subtypes.includes("Equipment") && !fortification) return false;
  if (fortification) return typeof host !== "number" && me.attachedTo !== host.id && host.zone === "battlefield" && !objIsType(s, me, "Creature") && objIsType(s, host, "Land") && objectMatches(s, { kind: "object", text: "" }, host, controllerOf(s, me), false, meChars);
  const enchant = enchantOf(s, me);
  // "Enchant creature you control" is about the Aura's controller.
  const who = controllerOf(s, me);
  if (typeof host === "number") {
    // "Enchant player", "enchant opponent" (CR 702.5d); a player's protection is checked as for an Aura entering (CR 702.16c).
    if (!aura || enchant?.kind !== "player" || me.attachedToPlayer === host || s.players[host]?.lost) return false;
    if (enchant.opponent && host === who) return false;
    return !playerProtectedFrom(s, host, who, { ...meChars, controller: who });
  }
  if (me.attachedTo === host.id || host.id === me.id || host.zone !== "battlefield") return false;
  // An Aura or Equipment that's also a creature can't be attached, unless it has reconfigure (CR 301.5c, 303.4d).
  if (objIsType(s, me, "Creature") && !compileCard(defOf(s, me)).reconfigure) return false;
  // "Equip planeswalker": to a planeswalker as though it were a creature (Luxior rulings).
  const creature = objIsType(s, host, "Creature") || (!!asCreature && !aura && objIsType(s, host, "Planeswalker"));
  // Goblin Brawler: "can't be equipped" (CR 701.3b).
  if (!aura && characteristics(s, host).cantBeEquipped) return false;
  const only = aura ? undefined : abilitiesOf(s, me).attachOnly; // O-Naginata
  return aura ? enchant?.kind === "object" && objectMatches(s, enchant, host, who, false, meChars) : creature && objectMatches(s, only ?? { kind: "object", text: "" }, host, who, false, meChars);
}

/** Attach an Aura to a player (CR 701.3a): "enchant player" (CR 702.5d), with a new timestamp (701.3c). */
function attachToPlayer(s: GameState, me: GameObject, pid: PlayerId) {
  if (!canAttachTo(s, me, pid)) return;
  const was = me.attachedTo;
  me.attachedTo = undefined;
  me.attachedToPlayer = pid;
  me.timestamp = s.nextTimestamp++;
  if (was) fireEvent(s, { type: "unattached", id: me.id, host: was });
  invalidateCharacteristics(s);
  log(s, `${defOf(s, me).name} is attached to ${player(s, pid).name}.`);
}

/**
 * Attach an Aura or Equipment to `host` (CR 701.3a), with a new timestamp (613.7e). Not to what it's attached to already,
 * nor to itself (701.3b-c); only to something it could be attached to: an Equipment to a creature (CR 301.5c), an Aura
 * to what it can enchant (CR 303.4d), neither to something with protection from it (CR 702.16c-d).
 */
export function attachTo(s: GameState, me: GameObject, host: GameObject, asCreature?: boolean) {
  if (!canAttachTo(s, me, host, asCreature)) return;
  const was = me.attachedTo;
  me.attachedTo = host.id;
  me.attachedToPlayer = undefined;
  me.timestamp = s.nextTimestamp++;
  if (was) fireEvent(s, { type: "unattached", id: me.id, host: was });
  invalidateCharacteristics(s); // reconfigure: it stops being a creature (CR 702.151b)
  log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
  fireEvent(s, { type: "attached", id: me.id, host: host.id });
}

/** The locked doors of Rooms `pid` controls (CR 709.5c), of `among` only if given: what "unlock a locked door" can unlock. */
export function lockedDoors(s: GameState, pid: PlayerId, among?: ObjectId[], unlocked = false): { id: ObjectId; door: number; name: string }[] {
  return s.battlefield.flatMap((id) => {
    const o = obj(s, id);
    const d = roomOf(s, o);
    if (!d || o.unlocked === undefined || controllerOf(s, o) !== pid || (among && !among.includes(id))) return [];
    return [0, 1].filter((door) => o.unlocked!.includes(door) === unlocked && d.faces![door]).map((door) => ({ id, door, name: d.faces![door]!.name }));
  });
}

/** The unlocked doors of Rooms `pid` controls (among `among`), the ones they could lock (CR 709.5g). */
export function unlockedDoors(s: GameState, pid: PlayerId, among?: ObjectId[]) {
  return lockedDoors(s, pid, among, true);
}

/**
 * `self` explores (CR 701.44a): its controller reveals the top card of their library; a land card goes to their hand,
 * otherwise `self` gets a +1/+1 counter, then they decide whether the card goes to their graveyard (rulings). A
 * creature that has left still explores, with no counter.
 */
/**
 * One instruction to explore, replaced: Topography Tracker makes it explore twice, each one of them doubling it again
 * (replacement effects of one kind applied to the modified event, cumulative like Alhammarret's Archive, CR 614.5, 616.1).
 * "A creature you control": its controller's, the instruction's controller's once it has left.
 */
function exploreReplaced(s: GameState, self: GameObject | undefined, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const you = self && self.zone === "battlefield" ? controllerOf(s, self) : ctx.controller;
  if (sc.exploresLeft === undefined) {
    // Twists and Turns: "instead you scry 1, then that creature explores", once for each of them (rulings: two copies
    // scry 1 twice). With Topography Tracker too, the scries come first: they replace the instruction to explore, and
    // the explore they leave is the one Tracker doubles (CR 616.1; it can't apply to the same event twice, 614.5).
    sc.exploreScries ??= s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && !!abilitiesOf(s, obj(s, id)).scryBeforeExplore).length;
    while (sc.exploreScries > 0) {
      if (runEffect(s, { type: "scry", n: 1 }, { ...ctx, controller: you }) === "paused") return "paused";
      sc.arranged = undefined;
      sc.exploreScries--;
    }
    const trackers = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && !!abilitiesOf(s, obj(s, id)).exploresTwice).length;
    sc.exploresLeft = 2 ** Math.min(trackers, 6);
    if (trackers) log(s, `${self ? characteristics(s, self).name : src} explores ${sc.exploresLeft} times instead (Topography Tracker).`);
  }
  while (sc.exploresLeft > 0) {
    if (explore(s, self, ctx, src) === "paused") return "paused";
    sc.exploresLeft--;
  }
  sc.exploresLeft = sc.exploreScries = undefined;
}

function explore(s: GameState, self: GameObject | undefined, ctx: ResolveCtx, src: string): "paused" | void {
  const p = player(s, ctx.controller);
  const sc = (s.resolving!.scratch ??= {});
  // The permanent has explored once this is done, whatever could be done of it (CR 701.44b): "whenever a creature you
  // control explores" (Wildgrowth Walker) triggers.
  const explored = (revealed?: "land" | "nonland") => {
    if (self) fireEvent(s, { type: "explored", id: self.id, controller: self.zone === "battlefield" ? controllerOf(s, self) : ctx.controller, ...(revealed ? { revealed } : {}) });
  };
  if (sc.explored === undefined) {
    const top = p.library[0];
    const name = self ? characteristics(s, self).name : src;
    if (top && isType(defOf(s, obj(s, top)), "Land")) {
      log(s, `${name} explores: ${p.name} reveals ${defOf(s, obj(s, top)).name} and puts it into their hand.`);
      moveObject(s, top, "hand");
      explored("land");
      return;
    }
    log(s, `${name} explores${top ? `: ${p.name} reveals ${defOf(s, obj(s, top)).name}` : ""}.`);
    if (self && self.zone === "battlefield") {
      putCounters(s, self, "+1/+1", 1);
      invalidateCharacteristics(s);
    }
    if (!top) return explored(); // nothing revealed: just the counter (rulings)
    sc.explored = top;
    s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${defOf(s, obj(s, top)).name} into your graveyard`, source: src, card: top };
    return "paused";
  }
  if (sc.may && p.library[0] === sc.explored) moveObject(s, sc.explored, "graveyard");
  // Done: "it explores, then it explores again" (Jadelight Ranger) starts over, revealing the same card if it stayed.
  sc.explored = sc.may = undefined;
  explored("nonland");
}

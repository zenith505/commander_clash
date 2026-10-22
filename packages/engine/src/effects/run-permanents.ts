import type { Effect, Modification, TokenSpec } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, isType, objHasKeyword, objIsType, power, toughness } from "../cards";
import { auraHostKey, auraHostLabels, auraHostOptions, clearCombat, draw, enterTogether, livingPlayers, log, provokersOf, moveObject, obj, opponents, player, removeFromCombat, tapPermanent, untapPermanent, whileControlledHolds, whileTappedHolds } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putPlayerCounters, putCounters, tokenBatch, withPutter } from "../counters";
import { compileCard } from "../oracle";
import type { ContinuousEffect, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { setFace } from "../faces";
import { becomePrepared } from "../prepare";
import { objectMatches, playerProtectedFrom } from "./targeting";
import { ResolveCtx, convokedFor, objects, amountNow, fixMods, players, runEffect } from "./resolve";
import { exiledWithCounter } from "./run-choices";
import { createExtraTokens, createToken } from "./run-tokens";
import { discardCards } from "./run-library";
import { describeMods } from "./describe";
import { evolves, fireEvent } from "./triggers";
import { phaseOut } from "../phasing";
import { keywordLabel, protectionFromPlayer, THAT_PLAYER_PROTECTION } from "../keywords";

/**
 * Transform a permanent (CR 701.27a): turn it over so its other face is up. Only a double-faced card or token can
 * (701.27c, 712.9), not one that's face down (712.15a), and not into an instant or sorcery face (701.27d, 712.10). It's
 * the same object (712.18): its counters, damage, attachments and the effects on it stay.
 */
export function transformPermanent(s: GameState, o: GameObject, byDayNight = false, convert = false): boolean {
  const d = s.cards[o.cardId];
  if (o.zone !== "battlefield" || o.faceDown || !d?.faces || d.faces.length !== 2 || (d.layout !== "transform" && d.layout !== "modal_dfc")) return false;
  // A daybound or nightbound permanent transforms only as day and night say (CR 702.145b, e).
  if (!byDayNight && (objHasKeyword(s, o, "Daybound") || objHasKeyword(s, o, "Nightbound"))) return false;
  const to = o.face === 1 ? 0 : 1;
  if (d.faces[to]!.types.some((t) => t === "Instant" || t === "Sorcery")) return false;
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

/**
 * A double-faced token turns its back face up (CR 701.27a, 111.10i): only a token that is one, not one copying it (CR
 * 707.8a covers token copies). A Phyrexian has no other face to go back to, so transforming it again does nothing
 * (CR 701.27f).
 */
function transformToken(s: GameState, me: GameObject): boolean {
  if (me.zone !== "battlefield" || !me.isToken || me.copyOf || me.copyEffects?.length) return false;
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
    } else if (p.poison) putPlayerCounters(s, p.id, "poison", 1), names.push(`${p.name} (poison)`);
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

/** Counters that hurt the permanent they're on: -1/-1 shrinks it, stun keeps it from untapping (CR 122.1d). */
export const harmfulCounter = (k: string) => k === "-1/-1" || k === "stun";

/** Changing permanents: tap, counters, connive, explore, renown, evolve, continuous effects, attaching. */
export function runPermanentsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "removeFromCombat":
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield" || (o.attacking === undefined && o.blocking === undefined)) continue;
        removeFromCombat(s, o);
        clearCombat(o);
        log(s, `${src} removes ${defOf(s, o).name} from combat.`);
      }
      return;
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
    case "tap":
    case "untap":
      for (const o of objects(s, e.what, ctx)) {
        if (e.type === "tap") tapPermanent(s, o);
        else untapPermanent(s, o);
      }
      return;
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
      if (!sc.chosen?.[ctx.controller]) {
        const n = amountNow(s, e.n, ctx);
        const options = s.battlefield.filter((id) => obj(s, id).tapped && objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
        if (n <= 0 || !options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "untap", what: `tapped ${e.filter.text}`, options, count: Math.min(n, options.length), min: 0 };
        return "paused";
      }
      const ids = sc.chosen[ctx.controller]!;
      sc.chosen = undefined;
      sc.queue = undefined;
      for (const id of ids) if (s.objects[id]?.zone === "battlefield") untapPermanent(s, obj(s, id));
      if (ids.length) log(s, `${player(s, ctx.controller).name} untaps ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
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
      for (const id of ids) tapPermanent(s, obj(s, id));
      r.tappedThisWay = ids.length;
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
      if (choice === "tap") tapPermanent(s, o);
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
        else transformPermanent(s, o, false, e.convert);
      }
      return;
    case "becomePrepared":
      for (const o of objects(s, e.what, ctx)) becomePrepared(s, o);
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
    case "becomeSaddled":
      // Only permanents can become saddled (CR 702.171b).
      for (const o of objects(s, e.what, ctx)) {
        if (o.zone !== "battlefield") continue;
        o.saddled = true;
        invalidateCharacteristics(s); // "as long as ~ is saddled"
        log(s, `${defOf(s, o).name} becomes saddled.`);
      }
      return;
    case "phaseOut":
      // Only what's on the battlefield: "it" may have left (CR 702.26b).
      phaseOut(s, objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id));
      return;
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
      const times = proliferateTimes(s, ctx.controller, e.twice ? 2 : 1);
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
    case "amass": {
      // CR 701.47a: with no Army, create a 0/0 black [subtype] Army first; then counters on an Army you control,
      // which becomes that subtype too. With several Armies, the one with the most counters is chosen.
      const n = amountNow(s, e.n, ctx);
      const armies = () => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === ctx.controller && characteristics(s, o).subtypes.includes("Army") && objIsType(s, o, "Creature"));
      if (!armies().length) {
        const army: TokenSpec = { name: `${e.subtype} Army`, power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: [e.subtype, "Army"], keywords: [] };
        enterTogether(s, () => {
          const { same, extra } = tokenBatch(s, ctx.controller, army, 1);
          for (let i = same; i > 0; i--) createToken(s, ctx.controller, army);
          createExtraTokens(s, ctx.controller, extra);
        });
      }
      const army = armies().sort((a, b) => (b.counters["+1/+1"] ?? 0) - (a.counters["+1/+1"] ?? 0))[0];
      if (!army) return;
      if (s.resolving) s.resolving.amassed = { id: army.id, zc: army.zoneChanges ?? 0 };
      invalidateCharacteristics(s);
      if (n > 0) putCounters(s, army, "+1/+1", n);
      log(s, `${player(s, ctx.controller).name} amasses ${e.subtype} ${n}.`);
      if (!characteristics(s, army).subtypes.includes(e.subtype))
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [army.id], mods: [{ kind: "addTypes", types: [], subtypes: [e.subtype] }] });
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
      discardCards(s, pid, ids, "", false, false, ctx.controller);
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
      if (nonland && o?.zone === "battlefield" && (o.zoneChanges ?? 0) === zc) {
        invalidateCharacteristics(s);
        putCounters(s, o, "+1/+1", nonland);
        log(s, `${defOf(s, o).name} gets ${nonland} +1/+1 counter${nonland > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "skipUntap":
      // Its controller's next untap step skips it, then it untaps as usual (CR 502.3).
      for (const o of objects(s, e.what, ctx)) o.skipNextUntap = true;
      return;
    case "noMaxHandSize":
      player(s, ctx.controller).noMaxHandSize = true;
      log(s, `${player(s, ctx.controller).name} has no maximum hand size for the rest of the game.`);
      return;
    case "enterTappedUntil":
      (s.entersTappedUntil ??= []).push({ controller: ctx.controller, filter: e.filter, source: src });
      return;
    case "counters": {
      // Distributed (CR 601.2d): each target gets its part; a part for an illegal target isn't put anywhere (CR 608.2b).
      if (e.divided && e.what.ref === "target") {
        for (let k = 0; k < (e.what.n ?? 1); k++) {
          const t = ctx.targets[e.what.index + k];
          const part = t?.kind === "object" ? (t.amount ?? 0) : 0;
          for (const o of part > 0 ? objects(s, { ref: "target", index: e.what.index + k }, ctx) : []) {
            invalidateCharacteristics(s);
            const put = putCounters(s, o, e.counter, part);
            log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
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
      for (const o of objects(s, e.what, ctx)) {
        invalidateCharacteristics(s);
        const put = by !== undefined ? withPutter(by, () => putCounters(s, o, e.counter, n)) : putCounters(s, o, e.counter, n);
        log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
        // "Each creature that had a +1/+1 counter put on it this way" (Fangs of Kalonia): not one a replacement kept them off.
        if (put > 0 && s.resolving) (s.resolving.countersPutThisWay ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, kind: e.counter });
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
          // Only as many as are still on it.
          const has = self.counters[e.counter] ?? 0;
          const m = Math.min(k, has);
          if (m <= 0) continue;
          self.counters[e.counter] = has - m;
          invalidateCharacteristics(s);
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
        const kinds = Object.keys(from.counters).filter((k) => (from.counters[k] ?? 0) > 0);
        const sc = (s.resolving!.scratch ??= {});
        if (kinds.length > 1 && sc.counterKind === undefined) {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "counterKind", options: kinds, labels: kinds.map((k) => `A ${k} counter`), prompt: `choose the kind of counter to move from ${characteristics(s, from).name} onto ${characteristics(s, to).name}` };
          return "paused";
        }
        counter = sc.counterKind ?? kinds[0] ?? "";
        sc.counterKind = undefined;
      }
      if (!(from.counters[counter] ?? 0)) return;
      from.counters[counter]! -= 1;
      const put = putCounters(s, to, counter, 1);
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, from).name} moves a ${counter} counter onto ${characteristics(s, to).name}${put > 1 ? ` (${put} counters are put on it)` : ""}.`);
      if (!from.counters[counter]) fireEvent(s, { type: "lastCounterRemoved", id: from.id, counter });
      return;
    }
    case "removeCounters":
      for (const o of objects(s, e.what, ctx)) {
        const had = o.counters[e.counter] ?? 0;
        const n = Math.min(had, e.n === "all" ? had : amountNow(s, e.n, ctx));
        if (n <= 0) continue;
        o.counters[e.counter] = had - n;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses ${n} ${e.counter} counter${n > 1 ? "s" : ""}.`);
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
      const n = !o ? 0 : e.moveTo ? Object.values(o.counters).reduce((a, b) => a + Math.max(0, b), 0) : amountNow(s, e.n, ctx);
      const left = (k: string) => (o!.counters[k] ?? 0) - (picked[k] ?? 0);
      const count = () => Object.values(picked).reduce((a, b) => a + b, 0);
      while (o && count() < n && !sc.countersDone) {
        const kinds = Object.keys(o.counters).filter((k) => left(k) > 0);
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
        const kinds = Object.entries(o.counters).filter(([, n]) => n > 0);
        if (!kinds.length) continue;
        const total = kinds.reduce((a, [, n]) => a + n, 0);
        for (const [kind] of kinds) o.counters[kind] = 0;
        if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + total;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses all its counters (${kinds.map(([k, n]) => `${n} ${k}`).join(", ")}).`);
        for (const [k] of kinds) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: k });
      }
      return;
    case "moveAllCounters": {
      // Both have to still be there and legal targets, or no counters move (CR 122.5; rulings on Fate Transfer).
      const from = objects(s, e.from, ctx)[0];
      const to = objects(s, e.to, ctx)[0];
      if (!from || !to || from.id === to.id) return;
      const kinds = Object.entries(from.counters).filter(([, n]) => n > 0);
      for (const [kind, n] of kinds) {
        from.counters[kind] = 0;
        // Put onto the other one, so replacement effects and "whenever counters are put" apply (Nexus Mentality rulings).
        putCounters(s, to, kind, n);
      }
      invalidateCharacteristics(s);
      if (kinds.length) log(s, `${characteristics(s, from).name}'s counters (${kinds.map(([k, n]) => `${n} ${k}`).join(", ")}) move onto ${characteristics(s, to).name}.`);
      return;
    }
    case "removeSelfCounter": {
      // Fading (CR 702.32a): "remove a fade counter from this permanent. If you can't, sacrifice the permanent."
      // Vanishing (CR 702.63a): removing the last time counter triggers its sacrifice ability.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o) return;
      const name = characteristics(s, o).name;
      const had = o.counters[e.counter] ?? 0;
      if (had > 0) {
        o.counters[e.counter] = had - 1;
        log(s, `${name} loses a ${e.counter} counter (${had - 1} left).`);
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
      log(s, `${characteristics(s, o).name} gets ${e.n} +1/+1 counter${e.n > 1 ? "s" : ""} and becomes renowned.`);
      return;
    }
    case "adapt": {
      // As it resolves: any +1/+1 counter on it, for whatever reason, and it gets none (rulings). Gone: nothing.
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (!o) return;
      if ((o.counters["+1/+1"] ?? 0) > 0) {
        log(s, `${characteristics(s, o).name} already has a +1/+1 counter, so it doesn't adapt.`);
        return;
      }
      const n = amountNow(s, e.n, ctx);
      invalidateCharacteristics(s);
      const put = n > 0 ? putCounters(s, o, "+1/+1", n) : 0;
      log(s, `${characteristics(s, o).name} adapts: it gets ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
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
      putCounters(s, o, "+1/+1", 1);
      log(s, `${characteristics(s, o).name} evolves.`);
      return;
    }
    case "explore": {
      // CR 701.44a. The controller decides about a nonland card after the counter is put on (rulings).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (sc.explored === undefined) {
        const self = objects(s, e.what ?? { ref: "self" }, ctx)[0];
        const top = p.library[0];
        const name = self ? characteristics(s, self).name : src;
        if (top && isType(defOf(s, obj(s, top)), "Land")) {
          log(s, `${name} explores: ${p.name} reveals ${defOf(s, obj(s, top)).name} and puts it into their hand.`);
          moveObject(s, top, "hand");
          return;
        }
        log(s, `${name} explores${top ? `: ${p.name} reveals ${defOf(s, obj(s, top)).name}` : ""}.`);
        if (self) {
          putCounters(s, self, "+1/+1", 1);
          invalidateCharacteristics(s);
        }
        if (!top) return; // nothing revealed: just the counter (rulings)
        sc.explored = top;
        s.pending = { kind: "chooseMay", player: p.id, prompt: `put ${defOf(s, obj(s, top)).name} into your graveyard`, source: src, card: top };
        return "paused";
      }
      if (sc.may && p.library[0] === sc.explored) moveObject(s, sc.explored, "graveyard");
      return;
    }
    case "doublePT": {
      // Each one's own power and toughness as this resolves (CR 701.10b-c), so one effect for each, locked onto it.
      // All worked out before any of them changes (the effect is one event).
      const list = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield" && objIsType(s, o, "Creature")).map((o) => ({ o, p: e.power ? power(s, o) : 0, t: e.toughness ? toughness(s, o) : 0 }));
      for (const { o, p, t } of list) {
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: ctx.sourceId, duration: "endOfTurn", affected: [o.id], mods: [{ kind: "modifyPT", power: p, toughness: t }] });
        log(s, `${defOf(s, o).name} gets ${p < 0 ? "" : "+"}${p}/${t < 0 ? "" : "+"}${t} until end of turn.`);
      }
      if (list.length) invalidateCharacteristics(s);
      return;
    }
    case "continuous": {
      // The affected set is locked in now (CR 611.2c).
      // Backup: "If that's another creature, it gains ..." (CR 702.165a).
      const affected = objects(s, e.what, ctx).map((o) => o.id).filter((id) => !(e.notSource && id === ctx.sourceId));
      if (s.resolving) s.resolving.affected = affected.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
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
        whileControlled = me && { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0, controller: ctx.controller };
        if (!whileControlled || !whileControlledHolds(s, whileControlled)) {
          log(s, `${src}'s effect does nothing: its controller no longer controls it.`);
          return;
        }
      }
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
      s.effects.push({
        id: `e${s.nextId++}`,
        timestamp: s.nextTimestamp++, // CR 613.7b
        ...(Object.keys(notGranted).length ? { notGranted } : {}),
        controller: giveTo ?? ctx.controller,
        sourceName: src,
        sourceId: ctx.sourceId,
        duration: e.duration,
        ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : e.duration === "endOfYourNextTurn" ? { turnOf: ctx.controller, sinceTurn: s.turn } : {}),
        ...(whileTapped ? { whileTapped } : {}),
        ...(whileControlled ? { whileControlled } : {}),
        ...(e.whileCounter ? { whileCounter: e.whileCounter } : {}),
        affected,
        mods,
      });
      const names = affected.map((id) => defOf(s, obj(s, id)).name);
      log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, mods, ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : e.duration === "yourNextTurn" ? ` until ${player(s, ctx.controller).name}'s next turn` : e.duration === "endOfYourNextTurn" ? ` until the end of ${player(s, ctx.controller).name}'s next turn` : e.duration === "whileTapped" ? ` for as long as ${src} remains tapped` : e.duration === "whileControlled" ? ` for as long as ${player(s, ctx.controller).name} controls ${src}` : ""}.`);
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
    case "groupRules": {
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, sourceId: ctx.sourceId, duration: e.duration, ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : {}), affected: [], group: e.affects, mods: e.mods });
      invalidateCharacteristics(s);
      log(s, `Until ${e.duration === "endOfTurn" ? "end of turn" : `${player(s, ctx.controller).name}'s next turn`}, ${e.text} ${describeMods(s, e.mods, ctx.controller, true)}.`);
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
      const p = player(s, ctx.controller);
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
      if (!keywords.length) return;
      if (e.untilYourNextTurn) p.gainedUntilNextTurn = [...new Set([...(p.gainedUntilNextTurn ?? []), ...keywords])];
      else p.gained = [...new Set([...(p.gained ?? []), ...keywords])];
      log(s, `${p.name} gains ${keywords.map((k) => keywordLabel(k, (x) => player(s, x).name).toLowerCase()).join(" and ")} ${e.untilYourNextTurn ? "until their next turn" : "until end of turn"}.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      const me = e.source ? objects(s, e.source, ctx)[0] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || !me) return;
      // Something that isn't an Equipment (or an Aura, for "attach target Aura") doesn't move (CR 701.3b).
      if (e.source && !characteristics(s, me).subtypes.some((t) => t === "Equipment" || (t === "Aura" && !e.equipmentOnly))) return;
      attachTo(s, me, host);
      return;
    }
    case "attachAny": {
      // Ardenn: the Auras and Equipment are chosen as it resolves, and attached at once (rulings), each only if it could
      // be attached to the target (CR 701.3a-b). Nothing happens with an illegal target (CR 608.2b).
      const t = ctx.targets[e.host];
      if (!t || !ctx.legal[e.host]) return;
      const host = t.kind === "object" ? s.objects[t.id] : undefined;
      if (t.kind === "object" && host?.zone !== "battlefield") return;
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.queue) {
        const options = s.battlefield.filter((id) => {
          const o = obj(s, id);
          return controllerOf(s, o) === ctx.controller && canAttachTo(s, o, host ?? (t as { id: PlayerId }).id);
        });
        if (!options.length) return;
        sc.queue = [ctx.controller];
        sc.chosen = {};
        const to = host ? defOf(s, host).name : player(s, (t as { id: PlayerId }).id).name;
        s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "attach", what: to, options, count: options.length, min: 0, anyNumber: true };
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
    case "attachElsewhere": {
      // "Attach target Aura attached to a creature to another creature" (Crown of the Ages): the creature is chosen as
      // it resolves, not targeted (rulings), among those the Aura could enchant (CR 303.4d, 702.16c).
      const me = objects(s, e.source, ctx)[0];
      if (!me || me.zone !== "battlefield" || !characteristics(s, me).subtypes.includes("Aura")) return;
      const sc = (s.resolving!.scratch ??= {});
      const hosts = (sc.auraHosts ??= {});
      if (hosts[me.id] === undefined) {
        const options = auraHostOptions(s, me, controllerOf(s, me)).flatMap((h) => ("attachTo" in h && h.attachTo !== me.attachedTo && objIsType(s, obj(s, h.attachTo), "Creature") ? [h] : []));
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
      const me = objects(s, e.source, ctx).find((o) => o.zone === "battlefield");
      if (!me) return;
      const ch = characteristics(s, me);
      if (e.equipmentOnly && !ch.subtypes.includes("Equipment")) return;
      const sc = (s.resolving!.scratch ??= {});
      const hosts = (sc.auraHosts ??= {});
      if (hosts[me.id] === undefined) {
        // The biggest creature first: what a bot picks.
        const options = s.battlefield
          .filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false) && canAttachTo(s, me, obj(s, id)))
          .sort((a, b) => power(s, obj(s, b)) - power(s, obj(s, a)));
        if (!options.length) return;
        if (options.length > 1 || e.may) {
          sc.auraAsking = me.id;
          const choices = [...options, ...(e.may ? ["none"] : [])];
          const labels = choices.map((id) => (id === "none" ? "Don't attach it" : `${defOf(s, obj(s, id)).name}${controllerOf(s, obj(s, id)) === ctx.controller ? "" : ` (${player(s, controllerOf(s, obj(s, id))).name})`}`));
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "enchant", options: choices, labels, prompt: `choose ${e.filter.text.replace(/^an? /, "a ")} to attach ${defOf(s, me).name} to${e.may ? ", or none" : ""}` };
          return "paused";
        }
        hosts[me.id] = options[0]!;
      }
      const host = s.objects[hosts[me.id]!];
      if (host && canAttachTo(s, me, host)) {
        attachTo(s, me, host);
        log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
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
export function canAttachTo(s: GameState, me: GameObject, host: GameObject | PlayerId): boolean {
  if (me.zone !== "battlefield") return false;
  const meChars = characteristics(s, me);
  const aura = meChars.subtypes.includes("Aura");
  if (!aura && !meChars.subtypes.includes("Equipment")) return false;
  const enchant = compileCard(defOf(s, me)).enchant;
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
  return aura ? enchant?.kind === "object" && objectMatches(s, enchant, host, who, false, meChars) : objIsType(s, host, "Creature") && objectMatches(s, { kind: "object", text: "" }, host, who, false, meChars);
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
function attachTo(s: GameState, me: GameObject, host: GameObject) {
  if (!canAttachTo(s, me, host)) return;
  const was = me.attachedTo;
  me.attachedTo = host.id;
  me.attachedToPlayer = undefined;
  me.timestamp = s.nextTimestamp++;
  if (was) fireEvent(s, { type: "unattached", id: me.id, host: was });
  invalidateCharacteristics(s); // reconfigure: it stops being a creature (CR 702.151b)
  log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
}

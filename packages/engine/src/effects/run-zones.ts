import type { CounterKind, Effect } from "../abilities";
import { abilitiesOf, defOf, isPermanentCard, objIsType } from "../cards";
import { auraHostFor, castProblem, destroyPermanent, livingPlayers, log, moveObject, obj, pairable, pairCandidates, pairCreatures, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters } from "../counters";
import type { GameObject, GameState, ObjectId, PlayerId } from "../types";
import { pickOptions } from "./targeting";
import { ResolveCtx, apnap, objects, players, amountNow } from "./resolve";
import { tokenCopies } from "./run-tokens";
import { compileCard } from "../oracle";
import { addDelayed } from "./run-spells";
import { fireEvent, inCombat } from "./triggers";

/** A suspended card (CR 702.62b): in exile, with suspend and a time counter on it. */
export function isSuspended(s: GameState, o: GameObject): boolean {
  return o.zone === "exile" && (o.counters.time ?? 0) > 0 && !!compileCard(defOf(s, o)).suspend;
}

/** Put an exiled card onto the battlefield; an Aura needs something to enchant, or it stays in exile (CR 303.4f-g). */
function returnFromExile(s: GameState, c: GameObject, controller: PlayerId, src: string, counter?: CounterKind) {
  const d = defOf(s, c);
  if (!isPermanentCard(d)) return;
  let attachTo: ObjectId | undefined;
  if (d.subtypes.includes("Aura")) {
    attachTo = auraHostFor(s, c, controller);
    if (!attachTo) return;
  }
  log(s, `${src} returns ${d.name} to the battlefield.`);
  moveObject(s, c.id, "battlefield", { controller, ...(attachTo ? { attachTo } : {}), ...(counter ? { counters: { [counter]: 1 } } : {}) });
}

/**
 * Each player picks their own permanents, in APNAP order, then they're all sacrificed or returned to
 * their owners' hands at once (CR 101.4, 701.21a). With no more than they have to pick, there's no choice.
 */
function pickPermanents(s: GameState, e: Extract<Effect, { type: "pick" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const n = (sc.n ??= amountNow(s, e.n, ctx));
  const who = players(s, e.who, ctx);
  if (!sc.queue) {
    sc.queue = apnap(s, who);
    sc.chosen = {};
  }
  while (sc.queue.length) {
    const pid = sc.queue[0]!;
    const options = pickOptions(s, e, pid);
    if (options.length > n) {
      s.pending = { kind: "pickPermanents", player: pid, source: src, action: e.action, what: e.filter.text, options, count: n, ...(e.counter ? { counter: e.counter.kind } : {}) };
      return "paused";
    }
    sc.chosen![pid] = options;
    sc.queue.shift();
  }
  for (const pid of apnap(s, who))
    for (const id of sc.chosen![pid] ?? []) {
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
      moveObject(s, id, e.action === "sacrifice" ? "graveyard" : "hand");
    }
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
  moveObject(s, victim.id, "graveyard");
  if (exploiter) fireEvent(s, { type: "exploits", exploiter: exploiter.id, controller: pid, victim: snapshot, chars, watchers });
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

/** Moving permanents and cards between zones: destroy, exile, bounce, reanimate, flicker, sacrifice, ninjutsu, impulse draw. */
export function runZonesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "exploit":
      return exploit(s, ctx, src);
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
    case "exileSelfWithTime": {
      const item = s.resolving?.item;
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      if (!o || o.zone !== "stack") return;
      const name = defOf(s, o).name;
      moveObject(s, o.id, "exile"); // a copy ceases to exist (CR 707.10a)
      const moved = s.objects[o.id];
      if (moved?.zone !== "exile") return;
      moved.counters.time = e.n;
      log(s, `${name} is exiled with ${e.n} time counter${e.n === 1 ? "" : "s"} on it.`);
      return;
    }
    case "destroy":
      for (const o of objects(s, e.what, ctx)) destroyPermanent(s, o, `${src} destroys ${defOf(s, o).name}.`, e.noRegen);
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
        moveObject(s, o.id, "exile");
        if (me && o.zone === "exile") (me.exiledUntilLeaves ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
        // Linked to the source as it was when the ability triggered: if that object has already left, its
        // leaves ability has nothing to return, and the card stays exiled (CR 607.2a, rulings).
        if (e.linked && ctx.sourceId && o.zone === "exile") ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
      }
      return;
    }
    case "returnLinked": {
      // The leaves ability triggered after the source moved, so the object it links to is the one before (CR 400.7).
      const key = `${ctx.sourceId}@${(ctx.sourceZc ?? 1) - 1}`;
      const cards = (s.linkedExile?.[key] ?? []).map((l) => s.objects[l.id]).filter((c, i): c is GameObject => !!c && c.zone === "exile" && (c.zoneChanges ?? 0) === s.linkedExile![key]![i]!.zc && !c.isToken);
      delete s.linkedExile?.[key];
      for (const c of cards) {
        const d = defOf(s, c);
        if (e.dest === "hand") {
          log(s, `${src} returns ${d.name} to its owner's hand.`);
          moveObject(s, c.id, "hand");
          continue;
        }
        let attachTo: ObjectId | undefined;
        if (d.subtypes.includes("Aura")) {
          attachTo = auraHostFor(s, c, c.owner);
          if (!attachTo) continue; // nothing it can enchant: it stays in exile (CR 303.4g)
        }
        log(s, `${src} returns ${d.name} to the battlefield.`);
        moveObject(s, c.id, "battlefield", { controller: c.owner, ...(attachTo ? { attachTo } : {}) });
      }
      return;
    }
    case "pick":
      return pickPermanents(s, e, ctx, src);
    case "bounce":
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} returns ${defOf(s, o).name}${o.zone === "graveyard" ? " from the graveyard" : ""} to its owner's hand.`);
        moveObject(s, o.id, "hand");
      }
      return;
    case "putOntoBattlefield":
      for (const o of objects(s, e.what, ctx)) {
        const d = defOf(s, o);
        // An Aura put onto the battlefield this way needs a choice of what it enchants (CR 303.4f);
        // the compiler doesn't produce this effect for cards that could be Auras, so this is a safeguard.
        if (!isPermanentCard(d) || d.subtypes.includes("Aura")) continue;
        log(s, `${src} puts ${d.name} onto the battlefield under ${player(s, ctx.controller).name}'s control${e.tapped ? ", tapped" : ""}.`);
        moveObject(s, o.id, "battlefield", { controller: ctx.controller, tapped: e.tapped }); // CR 110.2a
      }
      return;
    case "putInLibrary":
      for (const o of objects(s, e.what, ctx)) {
        log(s, `${src} puts ${defOf(s, o).name} on the ${e.position} of its owner's library.`);
        moveObject(s, o.id, "library", { top: e.position === "top" });
      }
      return;
    case "exileGraveyard":
      for (const pid of players(s, e.who, ctx)) {
        const p = player(s, pid);
        const n = p.graveyard.length;
        for (const id of [...p.graveyard]) moveObject(s, id, "exile");
        log(s, `${src} exiles ${p.name}'s graveyard (${n} card${n === 1 ? "" : "s"}).`);
      }
      return;
    case "flicker":
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
        else returnFromExile(s, o, e.under === "owner" ? o.owner : ctx.controller, src, e.counter);
      }
      return;
    case "returnExiled": {
      const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
      if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== ctx.subject!.zc) return;
      returnFromExile(s, o, e.under === "owner" ? o.owner : ctx.controller, src, e.counter);
      return;
    }
    case "exileIfDies":
      for (const o of objects(s, e.what, ctx)) if (o.zone === "battlefield") o.exileIfDiesTurn = s.turn;
      return;
    case "sacrifice":
      for (const o of objects(s, e.what, ctx)) {
        if (controllerOf(s, o) !== ctx.controller) continue; // only your own permanents (CR 701.21a)
        log(s, `${player(s, ctx.controller).name} sacrifices ${characteristics(s, o).name}.`);
        moveObject(s, o.id, "graveyard");
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
      const defender = ctx.lki?.attacking;
      if (defender !== undefined && inCombat(s) && livingPlayers(s).includes(defender)) o.attacking = defender;
      log(s, `${player(s, ctx.controller).name} puts ${characteristics(s, o).name} onto the battlefield tapped${o.attacking !== undefined ? ` and attacking ${player(s, o.attacking).name}` : ""} (ninjutsu).`);
      return;
    }
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
        log(s, `${p.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library and may play ${ids.length === 1 ? "it" : "them"} ${e.until === "thisTurn" ? "this turn" : "until the end of their next turn"}.`);
      return;
    }
  }
}

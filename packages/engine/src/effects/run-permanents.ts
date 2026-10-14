import type { Effect, TokenSpec } from "../abilities";
import { defOf, isType, objIsType, power, toughness } from "../cards";
import { draw, log, moveObject, obj, player, untapPermanent } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters, tokensToCreate } from "../counters";
import { compileCard } from "../oracle";
import type { GameState, PlayerId } from "../types";
import { objectMatches } from "./targeting";
import { ResolveCtx, objects, amountNow, fixMods } from "./resolve";
import { createToken } from "./run-tokens";
import { discardCards } from "./run-library";
import { describeMods } from "./describe";
import { evolves, fireEvent } from "./triggers";

/**
 * Proliferate (CR 701.27a): choose any number of permanents and players with counters; each gets another of
 * each kind it has. Chosen for the player: their own permanents' helpful counters, opponents' permanents'
 * -1/-1 and stun counters, their own energy and experience, and opponents' poison.
 */
export function proliferate(s: GameState, you: PlayerId, src: string) {
  const helpful = (k: string) => k !== "-1/-1" && k !== "stun" && k !== "age" && k !== "time" && k !== "fade";
  const names: string[] = [];
  invalidateCharacteristics(s);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const mine = controllerOf(s, o) === you;
    let added = false;
    for (const [k, n] of Object.entries(o.counters)) {
      if (!n || (mine ? !helpful(k) : !harmfulCounter(k))) continue;
      if (putCounters(s, o, k, 1)) added = true;
    }
    if (added) names.push(defOf(s, o).name);
  }
  for (const p of s.players) {
    if (p.lost) continue;
    if (p.id === you) {
      if (p.energy) (p.energy += 1), names.push(`${p.name} (energy)`);
    } else if (p.poison) (p.poison += 1), names.push(`${p.name} (poison)`);
  }
  log(s, `${src}: ${player(s, you).name} proliferates${names.length ? ` (${names.join(", ")})` : ""}.`);
}

/** Counters that hurt the permanent they're on: -1/-1 shrinks it, stun keeps it from untapping (CR 122.1d). */
export const harmfulCounter = (k: string) => k === "-1/-1" || k === "stun";

/** Changing permanents: tap, counters, connive, explore, renown, evolve, continuous effects, attaching. */
export function runPermanentsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "tap":
    case "untap":
      for (const o of objects(s, e.what, ctx)) {
        if (e.type === "tap") o.tapped = true;
        else untapPermanent(s, o);
      }
      return;
    case "proliferate":
      return proliferate(s, ctx.controller, src);
    case "amass": {
      // CR 701.47a: with no Army, create a 0/0 black [subtype] Army first; then counters on an Army you control,
      // which becomes that subtype too. With several Armies, the one with the most counters is chosen.
      const n = amountNow(s, e.n, ctx);
      const armies = () => s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === ctx.controller && characteristics(s, o).subtypes.includes("Army") && objIsType(s, o, "Creature"));
      if (!armies().length) {
        const army: TokenSpec = { name: `${e.subtype} Army`, power: 0, toughness: 0, colors: ["B"], types: ["Creature"], subtypes: [e.subtype, "Army"], keywords: [] };
        for (let i = 0; i < tokensToCreate(s, ctx.controller, army, 1); i++) createToken(s, ctx.controller, army);
      }
      const army = armies().sort((a, b) => (b.counters["+1/+1"] ?? 0) - (a.counters["+1/+1"] ?? 0))[0];
      if (!army) return;
      invalidateCharacteristics(s);
      if (n > 0) putCounters(s, army, "+1/+1", n);
      log(s, `${player(s, ctx.controller).name} amasses ${e.subtype} ${n}.`);
      if (!characteristics(s, army).subtypes.includes(e.subtype))
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "game", affected: [army.id], mods: [{ kind: "addTypes", types: [], subtypes: [e.subtype] }] });
      return;
    }
    case "connive": {
      // CR 701.50a: its controller draws, then discards; each nonland card discarded is a +1/+1 counter on it.
      // If it already left the battlefield, its controller as it last existed still draws and discards (CR 701.50c).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.connive) {
        const o = objects(s, e.what, ctx)[0];
        const pid = o ? controllerOf(s, o) : ctx.controller;
        const n = (sc.n = amountNow(s, e.n, ctx));
        sc.connive = { pid, ...(o ? { id: o.id, zc: o.zoneChanges ?? 0 } : {}) };
        if (n <= 0) return;
        log(s, `${o ? defOf(s, o).name : src} connives${n > 1 ? ` ${n}` : ""}.`);
        draw(s, pid, n);
        sc.queue = [pid];
        sc.chosen = {};
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
      discardCards(s, pid, ids);
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
    case "counters": {
      const base = amountNow(s, e.n, ctx);
      const n = e.perLastKnownCounter ? base * (ctx.lki?.counters?.[e.perLastKnownCounter] ?? 0) : base;
      if (n <= 0) return;
      for (const o of objects(s, e.what, ctx)) {
        invalidateCharacteristics(s);
        const put = putCounters(s, o, e.counter, n);
        log(s, `${defOf(s, o).name} gets ${put} ${e.counter} counter${put > 1 ? "s" : ""}.`);
      }
      return;
    }
    case "moveCounter": {
      // Remove it from the first and put it on the second; if either can't happen, neither does (CR 122.5).
      const from = objects(s, e.from, ctx)[0];
      const to = objects(s, e.to, ctx)[0];
      if (!from || !to || from.id === to.id || !(from.counters[e.counter] ?? 0)) return;
      from.counters[e.counter]! -= 1;
      const put = putCounters(s, to, e.counter, 1);
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, from).name} moves a ${e.counter} counter onto ${characteristics(s, to).name}${put > 1 ? ` (${put} counters are put on it)` : ""}.`);
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
        if (had === n && e.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      }
      return;
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
        if (had === 1 && e.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
      } else if (e.orSacrifice && controllerOf(s, o) === ctx.controller) {
        log(s, `${player(s, ctx.controller).name} sacrifices ${name}: it has no ${e.counter} counters left.`);
        moveObject(s, o.id, "graveyard");
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
        const self = objects(s, { ref: "self" }, ctx)[0];
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
    case "continuous": {
      // The affected set is locked in now (CR 611.2c).
      // Backup: "If that's another creature, it gains ..." (CR 702.165a).
      const affected = objects(s, e.what, ctx).map((o) => o.id).filter((id) => !(e.notSource && id === ctx.sourceId));
      if (!affected.length) return;
      const mods = fixMods(s, e.mods, ctx);
      s.effects.push({
        id: `e${s.nextId++}`,
        timestamp: s.nextTimestamp++, // CR 613.7b
        controller: ctx.controller,
        sourceName: src,
        sourceId: ctx.sourceId,
        duration: e.duration,
        affected,
        mods,
      });
      const names = affected.map((id) => defOf(s, obj(s, id)).name);
      log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, mods, ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : ""}.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || !me || me.zone !== "battlefield" || me.attachedTo === host.id || host.id === me.id) return; // CR 701.3b-c
      if (objIsType(s, me, "Creature")) return; // an Equipment that's also a creature can't equip (CR 301.5c)
      // Only to something it could be attached to: an Equipment to a creature (CR 301.5c), an Aura to
      // what it can enchant (CR 303.4d), neither to something with protection from it (CR 702.16c-d).
      const enchant = compileCard(defOf(s, me)).enchant;
      const meChars = characteristics(s, me);
      if (meChars.subtypes.includes("Aura") ? !enchant || !objectMatches(s, enchant, host, ctx.controller, false, meChars) : !objIsType(s, host, "Creature") || !objectMatches(s, { kind: "object", text: "" }, host, ctx.controller, false, meChars)) return;
      me.attachedTo = host.id;
      me.timestamp = s.nextTimestamp++;
      log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
      return;
    }
  }
}

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
import { phaseOut } from "../phasing";

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
    case "phaseOut":
      // Only what's on the battlefield: "it" may have left (CR 702.26b).
      phaseOut(s, objects(s, e.what, ctx).filter((o) => o.zone === "battlefield").map((o) => o.id));
      return;
    case "mustBlockSource": {
      // Provoke (CR 702.39a): only the creature that provoked it, as long as it's still that object.
      if (!ctx.sourceId) return;
      const source = s.objects[ctx.sourceId];
      if (!source || source.zone !== "battlefield" || (source.zoneChanges ?? 0) !== ctx.sourceZc) return;
      for (const o of objects(s, e.what, ctx)) {
        o.provokedBy = { id: source.id, zc: source.zoneChanges ?? 0 };
        log(s, `${characteristics(s, o).name} must block ${characteristics(s, source).name} this combat if able.`);
      }
      return;
    }
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
      for (let i = tokensToCreate(s, who, spirit, 1); i > 0; i--) createToken(s, who, spirit);
      log(s, `${src} endures ${n}: ${player(s, who).name} creates a ${n}/${n} Spirit token.`);
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
        ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : {}),
        affected,
        mods,
      });
      const names = affected.map((id) => defOf(s, obj(s, id)).name);
      log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, mods, ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : e.duration === "yourNextTurn" ? ` until ${player(s, ctx.controller).name}'s next turn` : ""}.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || !me || me.zone !== "battlefield" || me.attachedTo === host.id || host.id === me.id) return; // CR 701.3b-c
      // An Equipment that's also a creature can't equip, unless it has reconfigure (CR 301.5c).
      if (objIsType(s, me, "Creature") && !compileCard(defOf(s, me)).reconfigure) return;
      // Only to something it could be attached to: an Equipment to a creature (CR 301.5c), an Aura to
      // what it can enchant (CR 303.4d), neither to something with protection from it (CR 702.16c-d).
      const enchant = compileCard(defOf(s, me)).enchant;
      const meChars = characteristics(s, me);
      if (meChars.subtypes.includes("Aura") ? !enchant || !objectMatches(s, enchant, host, ctx.controller, false, meChars) : !objIsType(s, host, "Creature") || !objectMatches(s, { kind: "object", text: "" }, host, ctx.controller, false, meChars)) return;
      me.attachedTo = host.id;
      me.timestamp = s.nextTimestamp++;
      invalidateCharacteristics(s); // reconfigure: it stops being a creature (CR 702.151b)
      log(s, `${defOf(s, me).name} is attached to ${defOf(s, host).name}.`);
      return;
    }
    case "transformSelf": {
      // Only a double-faced token (CR 701.27a, c): not a card copying one (CR 707.8a covers token copies). It turns its
      // back face up; a Phyrexian has no other face to go back to, so a second activation does nothing (CR 701.27f).
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !me.isToken || me.copyOf || me.copyEffects?.length) return;
      const front = defOf(s, me);
      const back = front.tokenBack;
      if (!back) return;
      s.cards[back.oracleId] ??= back;
      me.cardId = back.oracleId;
      invalidateCharacteristics(s);
      log(s, `${front.name} transforms into ${back.name}.`);
      return;
    }
    case "unattachSelf": {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !me.attachedTo) return;
      log(s, `${defOf(s, me).name} is unattached from ${defOf(s, obj(s, me.attachedTo)).name}.`);
      me.attachedTo = undefined;
      invalidateCharacteristics(s);
      return;
    }
  }
}

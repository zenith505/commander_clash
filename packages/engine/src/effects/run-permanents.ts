import type { Effect, Modification, TokenSpec } from "../abilities";
import { cardIdOf, defOf, isType, objIsType, power, toughness } from "../cards";
import { clearCombat, draw, enterTogether, log, moveObject, obj, player, removeFromCombat, tapPermanent, untapPermanent, whileTappedHolds } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { putCounters, tokensToCreate } from "../counters";
import { compileCard } from "../oracle";
import type { ContinuousEffect, GameState, PlayerId } from "../types";
import { objectMatches } from "./targeting";
import { ResolveCtx, objects, amountNow, fixMods } from "./resolve";
import { createToken } from "./run-tokens";
import { discardCards } from "./run-library";
import { describeMods } from "./describe";
import { evolves, fireEvent } from "./triggers";
import { phaseOut } from "../phasing";
import { keywordLabel } from "../keywords";

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
        o.provokedBy = { id: source.id, zc: source.zoneChanges ?? 0, ...(e.thisTurn ? { turn: s.turn } : {}) };
        log(s, `${characteristics(s, o).name} must block ${characteristics(s, source).name} this ${e.thisTurn ? "turn" : "combat"} if able.`);
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
        enterTogether(s, () => {
          for (let i = tokensToCreate(s, ctx.controller, army, 1); i > 0; i--) createToken(s, ctx.controller, army);
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
        const k = tokensToCreate(s, pid, soldier, 1);
        enterTogether(s, () => {
          for (let i = 0; i < k; i++) createToken(s, pid, soldier);
        });
        if (k) log(s, `${player(s, pid).name} creates ${k === 1 ? "a" : k} 1/1 Human Soldier token${k > 1 ? "s" : ""}.`);
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
    case "distribute": {
      // Chosen as it resolves (CR 608.2d), among what its controller controls then; untargeted, so protection doesn't
      // matter (rulings on Blessing of Frost).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const n = (sc.n ??= amountNow(s, e.n, ctx));
      const options = s.battlefield.filter((id) => objectMatches(s, { ...e.filter, controller: "you" }, obj(s, id), ctx.controller, false));
      if (n <= 0 || !options.length) return;
      let parts = sc.distributed;
      if (!parts && options.length === 1) parts = { [options[0]!]: n };
      if (!parts) {
        s.pending = { kind: "distribute", player: ctx.controller, source: src, counter: e.counter, total: n, options, what: e.filter.text };
        return "paused";
      }
      for (const id of options) {
        const k = parts[id] ?? 0;
        const o = obj(s, id);
        if (k <= 0) continue;
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
        for (let i = tokensToCreate(s, who, spirit, 1); i > 0; i--) createToken(s, who, spirit);
      });
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
    case "removeAllCounters":
      for (const o of objects(s, e.what, ctx)) {
        const kinds = Object.entries(o.counters).filter(([, n]) => n > 0);
        if (!kinds.length) continue;
        const total = kinds.reduce((a, [, n]) => a + n, 0);
        for (const [kind] of kinds) o.counters[kind] = 0;
        if (s.resolving) s.resolving.countersRemoved = (s.resolving.countersRemoved ?? 0) + total;
        invalidateCharacteristics(s);
        log(s, `${characteristics(s, o).name} loses all its counters (${kinds.map(([k, n]) => `${n} ${k}`).join(", ")}).`);
        if (kinds.some(([k]) => k === "time")) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "time" });
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
        if (had === 1 && e.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: e.counter });
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
      s.effects.push({
        id: `e${s.nextId++}`,
        timestamp: s.nextTimestamp++, // CR 613.7b
        controller: ctx.controller,
        sourceName: src,
        sourceId: ctx.sourceId,
        duration: e.duration,
        ...(e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : {}),
        ...(whileTapped ? { whileTapped } : {}),
        affected,
        mods,
      });
      const names = affected.map((id) => defOf(s, obj(s, id)).name);
      log(s, `${names.length > 2 ? `${names.length} creatures` : names.join(" and ")} ${describeMods(s, mods, ctx.controller, names.length > 1)}${e.duration === "endOfTurn" ? " until end of turn" : e.duration === "yourNextTurn" ? ` until ${player(s, ctx.controller).name}'s next turn` : e.duration === "whileTapped" ? ` for as long as ${src} remains tapped` : ""}.`);
      return;
    }
    case "playerGains": {
      // The chosen color or player filled in now (CR 608.2h); until end of turn (CR 514.2).
      const mod = fixMods(s, [{ kind: "addKeywords", keywords: e.keywords }], ctx)[0];
      const keywords = mod?.kind === "addKeywords" ? mod.keywords : [];
      if (!keywords.length) return;
      const p = player(s, ctx.controller);
      p.gained = [...new Set([...(p.gained ?? []), ...keywords])];
      log(s, `${p.name} gains ${keywords.map((k) => keywordLabel(k, (x) => player(s, x).name).toLowerCase()).join(" and ")} until end of turn.`);
      return;
    }
    case "attach": {
      // CR 701.3: attach the source to the object; it gets a new timestamp (CR 613.7e).
      const host = objects(s, e.what, ctx)[0];
      const me = e.source ? objects(s, e.source, ctx)[0] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!host || !me || me.zone !== "battlefield" || me.attachedTo === host.id || host.id === me.id) return; // CR 701.3b-c
      // Something that isn't an Equipment doesn't move (CR 701.3b).
      if (e.source && !characteristics(s, me).subtypes.includes("Equipment")) return;
      // An Equipment that's also a creature can't equip, unless it has reconfigure (CR 301.5c).
      if (objIsType(s, me, "Creature") && !compileCard(defOf(s, me)).reconfigure) return;
      // Only to something it could be attached to: an Equipment to a creature (CR 301.5c), an Aura to
      // what it can enchant (CR 303.4d), neither to something with protection from it (CR 702.16c-d).
      const enchant = compileCard(defOf(s, me)).enchant;
      const meChars = characteristics(s, me);
      if (meChars.subtypes.includes("Aura") ? enchant?.kind !== "object" || !objectMatches(s, enchant, host, ctx.controller, false, meChars) : !objIsType(s, host, "Creature") || !objectMatches(s, { kind: "object", text: "" }, host, ctx.controller, false, meChars)) return;
      const was = me.attachedTo;
      me.attachedTo = host.id;
      me.timestamp = s.nextTimestamp++;
      if (was) fireEvent(s, { type: "unattached", id: me.id, host: was });
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

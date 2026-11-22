// Round 424's effects: Swindler's Scheme's "reveal the top card of your library. If it shares a card type with that spell,
// counter that spell and that opponent may cast the revealed card without paying its mana cost." and Dack Fayden, Helping
// Hand's "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for
// which they were chosen."
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { freeCastable, log, opponents, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import { controlGainable } from "../guardian";
import type { ResolveCtx } from "./resolve";
import { counterOnStack } from "./run-spells";

type R424Effect = Extract<Effect, { type: "revealTopCounterSharing" | "giveEachToDifferentOpponent" }>;

export function runRound424Effect(s: GameState, e: R424Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "revealTopCounterSharing": {
      // Asked once: the revealed card and whether its caster has been asked are kept while this resolves.
      if (sc.scheme?.asked) return;
      const you = player(s, ctx.controller);
      if (!sc.scheme) {
        const top = you.library[0];
        if (top === undefined) {
          log(s, `${you.name}'s library is empty: there's no card to reveal (${src}).`);
          return;
        }
        const card = s.objects[top]!;
        sc.scheme = { id: top, zc: card.zoneChanges ?? 0 };
        log(s, `${you.name} reveals the top card of their library: ${defOf(s, card).name} (${src}).`);
        // "That spell": as it is on the stack, or as it last existed there if it's gone (CR 608.2h).
        const item = ctx.cause === undefined ? undefined : s.stack.find((x) => x.id === ctx.cause && x.kind === "spell");
        const spell = item?.objectId ? s.objects[item.objectId] : undefined;
        const spellTypes = spell ? characteristics(s, spell).types : ctx.cause !== undefined ? (s.castItems?.[ctx.cause]?.castTypes ?? []) : [];
        // Its card types as a card in the library (CR 205.2a; a double-faced card's front face, CR 712.8a).
        const shares = defOf(s, card).types.some((t) => spellTypes.includes(t));
        if (!shares) {
          sc.scheme.asked = true;
          log(s, `${defOf(s, card).name} shares no card type with that spell, so nothing happens.`);
          return;
        }
        // Countered only if it's still that spell on the stack (CR 400.7); "can't be countered" stops only this (CR
        // 101.2). "And that opponent may cast ..." doesn't depend on it (CR 608.2c).
        if (item && counterOnStack(s, ctx, ctx.cause, src) === "paused") return "paused";
      }
      // The spell's caster ("that opponent", the trigger's event player) may cast it as this resolves, from your library,
      // without paying its mana cost, or never (CR 608.2g; X is 0, CR 107.3b). They control that spell (CR 601.2a); it's
      // still yours (CR 108.3). Not cast, it stays on top of your library.
      sc.scheme.asked = true;
      const caster = ctx.event?.player;
      const card = s.objects[sc.scheme.id];
      if (caster === undefined || player(s, caster).lost || !card || card.zone !== "library" || (card.zoneChanges ?? 0) !== sc.scheme.zc) return;
      s.pending = { kind: "castFree", player: caster, objectId: card.id, source: src };
      if (freeCastable(s, caster, card.id)) return "paused";
      s.pending = null;
      log(s, `${player(s, caster).name} can't cast ${defOf(s, card).name}, so it stays on top of ${you.name}'s library.`);
      return;
    }
    case "giveEachToDifferentOpponent": {
      // "Those permanents": the ones put onto the battlefield this way, each still that object there (CR 400.7), in the
      // order they entered. Each is given a different opponent, chosen by this ability's controller (CR 608.2d); there are
      // never more of them than opponents (X is the number of opponents).
      const g = (sc.giveEach ??= {
        queue: (r.created ?? []).filter((id) => s.objects[id]?.zone === "battlefield").map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })),
        given: [],
      });
      if (g.done) return;
      if (sc.giveControlTo !== undefined && g.queue.length) {
        g.given.push({ ...g.queue.shift()!, to: sc.giveControlTo });
        sc.giveControlTo = undefined;
      }
      while (g.queue.length) {
        const next = g.queue[0]!;
        const o = s.objects[next.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== next.zc) {
          g.queue.shift();
          continue;
        }
        const left = opponents(s, ctx.controller).filter((pid) => !g.given.some((x) => x.to === pid));
        if (!left.length) {
          g.queue.shift();
          continue;
        }
        if (left.length === 1) {
          g.given.push({ ...g.queue.shift()!, to: left[0]! });
          continue;
        }
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "giveControlTo", options: left.map(String), labels: left.map((pid) => player(s, pid).name), about: o.id, prompt: `choose the opponent who gains control of ${defOf(s, o).name}` };
        return "paused";
      }
      // All at once, one timestamp (CR 613.7b): a layer 2 effect for each, for the rest of the game (CR 611.2a).
      const timestamp = s.nextTimestamp++;
      for (const x of g.given) {
        const o = s.objects[x.id];
        if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== x.zc || player(s, x.to).lost) continue;
        if (!controlGainable(s, [o.id], x.to, src).length) continue; // Guardian Beast (round B292)
        s.effects.push({ id: `e${s.nextId++}`, timestamp, controller: x.to, sourceName: src, sourceId: ctx.sourceId, duration: "game", affected: [o.id], mods: [{ kind: "control" }] });
        log(s, `${player(s, x.to).name} gains control of ${defOf(s, o).name}.`);
      }
      invalidateCharacteristics(s);
      for (const x of g.given) {
        const o = s.objects[x.id];
        if (o?.zone === "battlefield" && controllerOf(s, o) !== x.to) log(s, `${defOf(s, o).name} stays under ${player(s, controllerOf(s, o)).name}'s control.`);
      }
      g.done = true;
      return;
    }
  }
}

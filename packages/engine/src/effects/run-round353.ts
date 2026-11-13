// Round 353's effects: copies of a spell for other players, each deciding in turn (Hive Mind, Curse of Echoes, Tempt with
// Mayhem).
import type { Effect } from "../abilities";
import { compileCard } from "../oracle";
import { cardIdOf } from "../cards";
import { opponents, player } from "../game";
import type { GameState } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { runSpellsEffect } from "./run-spells";

type R353Effect = Extract<Effect, { type: "copyForPlayers" }>;

export function runRound353Effect(s: GameState, e: R353Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "copyForPlayers": {
      // "Each other player copies that spell" (Hive Mind), "each other player may copy that spell" (Curse of Echoes), "Each
      // opponent may copy that spell ... You copy that spell once plus an additional time for each opponent who copied the
      // spell this way" (Tempt with Mayhem): starting with the active player (or the next player after it, if it's left
      // out), each in turn order (CR 101.4) decides if it may, then copies it, choosing new targets for that copy if they
      // like (CR 707.10c), and only then does the next one decide: so the last of them controls the copy that resolves
      // first (rulings). The copies aren't cast (CR 707.10); one copied after the spell has left the stack is copied as it
      // last was there, as the other copy effects are.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const i = e.spell === "cause" ? -1 : e.spell.target;
      const t = i >= 0 ? ctx.targets[i] : undefined;
      const id = i < 0 ? ctx.cause : t?.kind === "stack" && ctx.legal[i] ? t.id : undefined;
      const orig = id ? (s.stack.find((x) => x.id === id) ?? s.castItems?.[id]) : undefined;
      if (!orig || orig.kind !== "spell") return;
      const copy: Effect = { type: "copySpell", spell: e.spell === "cause" ? "cause" : { target: e.spell.target }, n: 1, newTargets: true };
      if (!sc.forPlayers) {
        // "~ can't be copied" (See Double): nobody is asked; copySpell says so.
        const card = orig.objectId ? s.objects[orig.objectId] : undefined;
        if (orig.body?.uncopyable || (card && compileCard(s.cards[cardIdOf(card)]!).spell?.uncopyable)) return runSpellsEffect(s, copy, ctx, src);
        // "Each other player": other than the player who cast it, as it was cast.
        const caster = (id && s.castItems?.[id]?.controller) ?? orig.controller;
        const who = e.copiers === "opponents" ? opponents(s, ctx.controller) : s.turnOrder.filter((p) => p !== caster);
        sc.forPlayers = { queue: apnap(s, who), copied: 0 };
      }
      const fp = sc.forPlayers;
      while (fp.queue.length) {
        const pid = fp.queue[0]!;
        if (player(s, pid).lost) {
          fp.queue.shift();
          continue;
        }
        if (e.may && !fp.copying) {
          if (sc.may === undefined) {
            s.pending = { kind: "chooseMay", player: pid, prompt: `copy ${orig.description}${orig.body?.targets.length ? " (you may choose new targets for your copy)" : ""}`, source: src };
            return "paused";
          }
          const yes = sc.may;
          sc.may = undefined;
          if (!yes) {
            fp.queue.shift();
            continue;
          }
          fp.copying = true;
        }
        // The copy is theirs, and theirs to aim (CR 707.10c), as if they were "you" for it.
        if (runSpellsEffect(s, copy, { ...ctx, controller: pid }, src) === "paused") return "paused";
        sc.copies = undefined;
        fp.copying = undefined;
        fp.copied++;
        fp.queue.shift();
      }
      // Tempt with Mayhem: then yours, once plus once for each opponent who copied it, after theirs (rulings).
      if (e.thenYou) return runSpellsEffect(s, { ...copy, n: 1 + fp.copied }, ctx, src);
      return;
    }
  }
}

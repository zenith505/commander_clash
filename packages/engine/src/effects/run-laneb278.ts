// Lane B round B278's effects: Noxious Vapors (keepOneOfEachColor). Land Equilibrium's replacement is in game.ts
// (equilibriumOwed, equilibriumSacrifices).
import type { Effect, TargetSpec } from "../abilities";
import { defOf } from "../cards";
import { livingPlayers, log, obj, oneOfEachAllFits, player } from "../game";
import { COLORS, type GameState, type ObjectId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { discardCards, discardToTopEach, sparedFromDiscard } from "./run-library";
import { printedMatches } from "./targeting";

type B278Effect = Extract<Effect, { type: "keepOneOfEachColor" }>;

const WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
/** One spec for each color (CR 105.1): a card of that color, whatever its other colors (CR 105.2). */
const COLOR_SPECS: TargetSpec[] = COLORS.map((c) => ({ kind: "card", types: [], notTypes: [], notColors: [], colors: [c], text: `${WORD[c]} card` }));

export function runLaneB278Effect(s: GameState, e: B278Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "keepOneOfEachColor": {
      // Noxious Vapors: each player reveals their hand (CR 701.20a) and chooses, in APNAP order (CR 101.4), one card of
      // each color from it: a different card for each color, a multicolored card counting for whichever one of its colors
      // its player chooses it for, and a card chosen for each color there's a card left for (as the rulings on Conflux and
      // Selective Adaptation read "a white card, a blue card, ..." and "a card with flying, a card with first strike, and
      // so on"; oneOfEachAllFits). Then they all discard their other nonland cards at the same time (CR 701.9b); land cards
      // stay. A player another player's spell can't make discard (Tamiyo, Collector of Tales) discards none.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.queue) {
        const all = apnap(s, livingPlayers(s));
        for (const pid of all) {
          const hand = player(s, pid).hand;
          log(s, hand.length ? `${player(s, pid).name} reveals their hand (${hand.map((id) => defOf(s, obj(s, id)).name).join(", ")}).` : `${player(s, pid).name} reveals an empty hand.`);
        }
        sc.queue = sparedFromDiscard(s, all, ctx.controller);
        sc.chosen = {};
      }
      if (sc.found && sc.queue.length) {
        sc.chosen![sc.queue.shift()!] = sc.found;
        sc.found = undefined;
      }
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        const hand = player(s, pid).hand;
        const colored = hand.filter((id) => COLOR_SPECS.some((f) => printedMatches(f, defOf(s, obj(s, id)))));
        const defs = (ids: ObjectId[]) => ids.map((id) => defOf(s, obj(s, id)));
        // No choice to make when keeping every colored card is the only way (each color at most one card, no card with two).
        const forced = oneOfEachAllFits(COLOR_SPECS, defs(colored), []) && colored.every((id) => COLOR_SPECS.filter((f) => printedMatches(f, defOf(s, obj(s, id)))).length === 1);
        if (!forced) {
          s.pending = { kind: "searchLibrary", player: pid, source: src, what: "one card of each color (a multicolored card for one of its colors)", cards: colored, min: 0, max: Math.min(5, colored.length), fromHand: true, keepColors: true, oneOfEach: COLOR_SPECS, oneOfEachAll: true };
          return "paused";
        }
        sc.chosen![pid] = colored;
        sc.queue.shift();
      }
      const who = Object.keys(sc.chosen!).map(Number);
      const order = apnap(s, who);
      const discards: Record<string, ObjectId[]> = {};
      for (const pid of order) {
        const kept = new Set(sc.chosen![pid] ?? []);
        if (kept.size) log(s, `${player(s, pid).name} keeps ${[...kept].map((id) => defOf(s, obj(s, id)).name).join(", ")}.`);
        discards[pid] = player(s, pid).hand.filter((id) => !kept.has(id) && !defOf(s, obj(s, id)).types.includes("Land"));
      }
      const tops = discardToTopEach(s, discards, order, src, ctx);
      if (tops === "paused") return "paused";
      for (const pid of order) discardCards(s, pid, discards[pid] ?? [], "", false, false, ctx.controller, undefined, tops[pid]);
      return;
    }
  }
}

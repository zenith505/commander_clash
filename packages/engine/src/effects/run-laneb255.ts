// Lane B round B255's effects: Whims of the Fates (whimsPiles).
import type { Effect } from "../abilities";
import { canBeSacrificed, defOf } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { controllerOf } from "../layers";
import { nextRandom } from "../rng";
import type { GameState, ObjectId } from "../types";
import { startingWith, type ResolveCtx } from "./resolve";

type B255Effect = Extract<Effect, { type: "whimsPiles" }>;

export function runLaneB255Effect(s: GameState, e: B255Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  switch (e.type) {
    case "whimsPiles": {
      // CR 700.3: starting with the caster and going in turn order (CR 101.4), each player separates every permanent they
      // control into three piles, which can be empty (the reminder text, CR 700.3c), each permanent in exactly one (CR
      // 700.3a; an Aura may go in a different pile from what it enchants, rulings). They're asked for the first pile, then
      // the second from the rest; the rest is the third. Then one pile of each player's is chosen at random, each pile
      // equally likely (rulings; no die is rolled), and all of the chosen piles are sacrificed at once (CR 608.2c).
      if (!sc.pilesOrder) {
        sc.pilesOrder = startingWith(s, ctx.controller, s.turnOrder).filter((pid) => !player(s, pid).lost);
        sc.pileOf = {};
        for (const pid of sc.pilesOrder) sc.pileOf[pid] = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
        sc.chosen = {};
        sc.whimsFirst = {};
        sc.whimsLogged = [];
      }
      const pileOf = sc.pileOf!;
      const first = sc.whimsFirst!;
      const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "nothing");
      const pilesOf = (pid: number): [ObjectId[], ObjectId[], ObjectId[]] => {
        const one = first[pid] ?? [];
        const two = sc.chosen![pid] ?? [];
        return [one, two, pileOf[pid]!.filter((id) => !one.includes(id) && !two.includes(id))];
      };
      for (const pid of sc.pilesOrder) {
        const all = pileOf[pid]!;
        if (!all.length || sc.whimsLogged!.includes(pid)) continue;
        const name = player(s, pid).name;
        const rule = "One of the three piles is chosen at random, and you sacrifice the permanents in it.";
        if (first[pid] === undefined) {
          if (sc.chosen![pid] === undefined) {
            sc.queue = [pid];
            s.pending = { kind: "pickPermanents", player: pid, source: src, action: "pile", what: "permanent", options: all, count: all.length, min: 0, anyNumber: true, piles3: 1, prompt: `separate all permanents you control into three piles: click the ones for the first pile (the rest are split into the second and third next). ${rule}` };
            return "paused";
          }
          first[pid] = sc.chosen![pid]!;
          delete sc.chosen![pid];
        }
        const rest = all.filter((id) => !first[pid]!.includes(id));
        if (sc.chosen![pid] === undefined) {
          if (rest.length) {
            sc.queue = [pid];
            s.pending = { kind: "pickPermanents", player: pid, source: src, action: "pile", what: "permanent", options: rest, count: rest.length, min: 0, anyNumber: true, piles3: 2, prompt: `click the permanents for the second pile (the rest form the third pile). First pile: ${names(first[pid]!)}. ${rule}` };
            return "paused";
          }
          sc.chosen![pid] = [];
        }
        const [one, two, three] = pilesOf(pid);
        log(s, `${name} separates their permanents into three piles: ${names(one)}; ${names(two)}; and ${names(three)}.`);
        sc.whimsLogged!.push(pid);
      }
      // At random, each player's in the same order, then all at once.
      const gone: { pid: number; id: ObjectId }[] = [];
      for (const pid of sc.pilesOrder) {
        if (!pileOf[pid]!.length) continue;
        const k = Math.floor(nextRandom(s) * 3);
        const pile = pilesOf(pid)[k]!;
        log(s, `${src}: pile ${k + 1} of ${player(s, pid).name}'s is chosen at random (${names(pile)}).`);
        gone.push(...pile.map((id) => ({ pid, id })));
      }
      for (const { pid, id } of gone) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || controllerOf(s, o) !== pid || !canBeSacrificed(s, o)) continue;
        log(s, `${player(s, pid).name} sacrifices ${defOf(s, o).name}.`);
        moveObject(s, id, "graveyard", { sacrificed: true });
      }
      return;
    }
  }
}

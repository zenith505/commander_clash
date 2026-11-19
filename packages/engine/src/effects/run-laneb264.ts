// Lane B round B264's effects: Bend or Break (bendOrBreak).
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { damagedNoRegen, destroyPermanent, log, obj, opponents, player, tapPermanent } from "../game";
import { controllerOf } from "../layers";
import type { GameState, ObjectId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";

type B264Effect = Extract<Effect, { type: "bendOrBreak" }>;

export function runLaneB264Effect(s: GameState, e: B264Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "bendOrBreak": {
      // CR 700.3: each player separates their own nontoken lands into two piles, one of them possibly empty (CR 700.3d), in
      // APNAP order, each knowing the earlier piles (CR 101.4). Each pile is the lands as they were then, each the object it
      // is (CR 400.7).
      if (!sc.bend) {
        const order = apnap(s, s.players.map((p) => p.id)).filter((pid) => !player(s, pid).lost);
        const lands: Record<number, ObjectId[]> = {};
        for (const pid of order) lands[pid] = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !obj(s, id).isToken && objIsType(s, obj(s, id), "Land"));
        sc.bend = { order, lands, chooser: {}, pile: {} };
        sc.chosen = {};
      }
      const bend = sc.bend;
      const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no lands");
      const pilesOf = (pid: number): [ObjectId[], ObjectId[]] => {
        const one = sc.chosen![pid] ?? [];
        return [one, bend.lands[pid]!.filter((id) => !one.includes(id))];
      };
      for (const pid of bend.order) {
        if (sc.chosen![pid] !== undefined || player(s, pid).lost) continue;
        if (!bend.lands[pid]!.length) {
          sc.chosen![pid] = [];
          continue;
        }
        sc.queue = [pid];
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "pile", what: "land", options: bend.lands[pid]!, count: bend.lands[pid]!.length, min: 0, anyNumber: true, of: pid, pickFor: pid, prompt: `separate all nontoken lands you control into two piles: click the lands for the first pile (the rest form the second). An opponent of your choice chooses one pile: its lands are destroyed, and the other pile's are tapped.` };
        return "paused";
      }
      // "For each player, one of their piles is chosen by one of their opponents of their choice": in APNAP order, each player
      // chooses one of their opponents, who chooses one of that player's piles (CR 101.4).
      if (sc.bendAsked !== undefined) {
        const pid = sc.bendAsked;
        sc.bendAsked = undefined;
        if (bend.chooser[pid] === undefined) {
          bend.chooser[pid] = r.chosen?.player ?? -1;
          if (r.chosen) {
            const { player: _, ...rest } = r.chosen;
            r.chosen = rest;
          }
        } else if (sc.pileChoice !== undefined) {
          bend.pile[pid] = sc.pileChoice;
          sc.pileChoice = undefined;
        }
      }
      for (const pid of bend.order) {
        if (bend.pile[pid] !== undefined) continue;
        // No lands: two empty piles, and whichever is chosen nothing happens; not asked.
        if (!bend.lands[pid]!.length) {
          bend.pile[pid] = 0;
          continue;
        }
        const [one, two] = pilesOf(pid);
        if (bend.chooser[pid] === undefined) {
          log(s, `${player(s, pid).name} separates their lands into two piles: ${names(one)}; and ${names(two)}.`);
          const opps = player(s, pid).lost ? [] : opponents(s, pid);
          if (!opps.length) {
            bend.chooser[pid] = -1;
          } else if (opps.length === 1) {
            bend.chooser[pid] = opps[0]!;
          } else {
            sc.bendAsked = pid;
            s.pending = { kind: "chooseOption", player: pid, source: src, what: "opponent", options: opps.map(String), labels: opps.map((q) => player(s, q).name), prompt: "which opponent chooses one of your piles of lands? Its lands are destroyed and the other pile's are tapped" };
            return "paused";
          }
        }
        const by = bend.chooser[pid]!;
        if (by < 0 || player(s, by).lost) {
          // No opponent left to choose: no pile is chosen, so none is destroyed and both are "the other piles".
          bend.pile[pid] = -1;
          continue;
        }
        sc.bendAsked = pid;
        s.pending = {
          kind: "chooseOption",
          player: by,
          source: src,
          what: "pile",
          options: ["0", "1"],
          labels: [`Pile 1: ${names(one)}`, `Pile 2: ${names(two)}`],
          piles: [one, two],
          of: pid,
          sacrificePile: true,
          destroyPile: true,
          prompt: `choose one of ${player(s, pid).name}'s piles of lands: its lands are destroyed, and the other pile's are tapped`,
        };
        return "paused";
      }
      // "Destroy all lands in the chosen piles. Tap all lands in the other piles.": destroyed at once, then the rest tapped,
      // each only while it's still the object it was (CR 400.7).
      const still = (id: ObjectId, zc: number) => s.objects[id]?.zone === "battlefield" && (s.objects[id]!.zoneChanges ?? 0) === zc;
      const stamp = (ids: ObjectId[]) => ids.map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
      const doomed = stamp(bend.order.flatMap((pid) => (bend.pile[pid]! >= 0 ? pilesOf(pid)[bend.pile[pid]!]! : [])));
      const spared = stamp(bend.order.flatMap((pid) => (bend.pile[pid]! >= 0 ? pilesOf(pid)[1 - bend.pile[pid]!]! : [...pilesOf(pid)[0], ...pilesOf(pid)[1]])));
      const live = doomed.filter((x) => still(x.id, x.zc));
      const barred = live.length > 1 ? damagedNoRegen(s) : undefined;
      for (const x of live) destroyPermanent(s, obj(s, x.id), `${src} destroys ${defOf(s, obj(s, x.id)).name}.`, !!barred?.has(x.id), ctx.controller);
      for (const x of spared) if (still(x.id, x.zc) && !obj(s, x.id).tapped) tapPermanent(s, obj(s, x.id), undefined, ctx.controller);
      const tapped = spared.filter((x) => still(x.id, x.zc));
      if (tapped.length) log(s, `${src} taps ${names(tapped.map((x) => x.id))}.`);
      return;
    }
  }
}

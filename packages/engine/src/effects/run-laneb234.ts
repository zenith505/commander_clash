// Lane B round B234's effects: Fight or Flight and Stand or Fall (pilesOnly).
import type { Effect } from "../abilities";
import { defOf, objIsType } from "../cards";
import { log, obj, player } from "../game";
import { controllerOf } from "../layers";
import type { GameState, ObjectId } from "../types";
import { apnap, players, type ResolveCtx } from "./resolve";

type B234Effect = Extract<Effect, { type: "pilesOnly" }>;

export function runLaneB234Effect(s: GameState, e: B234Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "pilesOnly": {
      // CR 700.3: for each of those players (each defending player, CR 802.2), you separate all creatures they control into
      // two piles, one of them possibly empty (CR 700.3c), and that player chooses one. "Only creatures in the chosen piles
      // can attack (block) this turn": the creatures in none can't, ones that enter later included (rulings), whoever
      // controls them then; each is the object it was (CR 400.7). A player with no creatures has two empty piles.
      const verb = e.kind === "attack" ? "attack" : "block";
      if (!sc.pilesOrder) {
        sc.pilesOrder = apnap(s, players(s, e.who, ctx)).filter((pid) => !player(s, pid).lost);
        sc.pileOf = {};
        for (const pid of sc.pilesOrder) sc.pileOf[pid] = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature"));
        sc.chosen = {};
        sc.pileChoices = {};
      }
      const pileOf = sc.pileOf!;
      const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no creatures");
      const pilesOf = (pid: number): [ObjectId[], ObjectId[]] => {
        const one = sc.chosen![pid] ?? [];
        return [one, pileOf[pid]!.filter((id) => !one.includes(id))];
      };
      if (sc.pileChoice !== undefined) {
        const done = sc.pilesOrder.find((pid) => sc.pileChoices![pid] === undefined)!;
        sc.pileChoices![done] = sc.pileChoice;
        sc.pileChoice = undefined;
      }
      for (const pid of sc.pilesOrder) {
        if (sc.pileChoices![pid] !== undefined) continue;
        if (!pileOf[pid]!.length) {
          sc.pileChoices![pid] = 0;
          continue;
        }
        const name = player(s, pid).name;
        if (sc.chosen![pid] === undefined) {
          sc.queue = [pid];
          s.pending = { kind: "pickPermanents", player: ctx.controller, source: src, action: "pile", what: "creature", options: pileOf[pid]!, count: pileOf[pid]!.length, min: 0, anyNumber: true, of: pid, pickFor: pid, prompt: `separate all creatures ${name} controls into two piles: click the ones for the first pile (the rest form the second). ${name} chooses one of them, and only the creatures in it can ${verb} this turn.` };
          return "paused";
        }
        const [one, two] = pilesOf(pid);
        log(s, `${player(s, ctx.controller).name} separates ${name}'s creatures into two piles: ${names(one)}; and ${names(two)}.`);
        s.pending = {
          kind: "chooseOption",
          player: pid,
          source: src,
          what: "pile",
          options: ["0", "1"],
          labels: [`Pile 1: ${names(one)}`, `Pile 2: ${names(two)}`],
          piles: [one, two],
          of: pid,
          pileMode: e.kind === "attack" ? "canAttack" : "canBlock",
          prompt: `choose a pile of your creatures: only the creatures in it can ${verb} this turn`,
        };
        return "paused";
      }
      const ids = sc.pilesOrder.flatMap((pid) => pilesOf(pid)[sc.pileChoices![pid]!]!).map((id) => `${id}@${obj(s, id).zoneChanges ?? 0}`);
      (s.pilesOnlyThisTurn ??= []).push({ kind: e.kind, ids, source: src });
      return;
    }
  }
}

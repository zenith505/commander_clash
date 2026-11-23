// Lane B round B265's effects: Phyrexian Portal (portalPiles) and Raging River (ragingRiver).
import type { Effect } from "../abilities";
import { objHasKeyword, objIsType } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { characteristics, controllerOf } from "../layers";
import { shuffleLibrary } from "../rng";
import type { GameState, ObjectId } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { notePileOrGuess } from "./run-laneb306";

type B265Effect = Extract<Effect, { type: "portalPiles" | "ragingRiver" }>;

const count = (n: number) => (n === 1 ? "1 card" : `${n} cards`);

export function runLaneB265Effect(s: GameState, e: B265Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const names = (ids: ObjectId[], none = "no cards") => (ids.length ? ids.map((id) => characteristics(s, obj(s, id)).name).join(", ") : none);
  switch (e.type) {
    case "portalPiles": {
      // CR 700.3: the target opponent looks at the top cards and separates them into two face-down piles while they're
      // still in the library (CR 700.3c); either may be empty (rulings). The library's size is checked as it resolves.
      const p = player(s, ctx.controller);
      const t = ctx.targets[e.by];
      if (t?.kind !== "player" || !ctx.legal[e.by] || player(s, t.id).lost) return;
      const opp = t.id;
      if (!sc.looked) {
        if (p.library.length < e.n) {
          log(s, `${p.name}'s library has fewer than ${e.n} cards: ${src} does nothing.`);
          return;
        }
        sc.looked = p.library.slice(0, e.n);
        notePileOrGuess(s); // The Celestial Toymaker (round B306): they'll be separated into piles (CR 700.3).
        log(s, `${player(s, opp).name} looks at the top ${count(sc.looked.length)} of ${p.name}'s library.`);
      }
      const inLibrary = (ids: ObjectId[]) => ids.filter((id) => s.objects[id]?.zone === "library" && p.library.includes(id));
      if (!sc.portalExiled) {
        const looked = inLibrary(sc.looked);
        if (sc.separating && sc.found) {
          sc.pileOne = sc.found;
          sc.separating = undefined;
          sc.found = undefined;
        }
        if (!sc.pileOne) {
          sc.separating = true;
          s.pending = { kind: "searchLibrary", player: opp, source: src, what: "the cards", cards: looked, min: 0, max: looked.length, dig: { looked, to: "for the first face-down pile", rest: "form the second face-down pile" }, piles: true, forPlayer: p.id };
          return "paused";
        }
        const one = sc.pileOne.filter((id) => looked.includes(id));
        const two = looked.filter((id) => !one.includes(id));
        if (sc.pileChoice === undefined) {
          log(s, `${player(s, opp).name} separates them into two face-down piles of ${count(one.length)} and ${count(two.length)}.`);
          // You choose without seeing either pile (they're face down): only their sizes are shown.
          s.pending = { kind: "chooseOption", player: p.id, source: src, what: "pile", options: ["0", "1"], labels: [`Face-down pile 1: ${count(one.length)}`, `Face-down pile 2: ${count(two.length)}`], piles: [one, two], of: p.id, pileMode: "blindExile", prompt: "choose a face-down pile to exile: you then search the other pile for a card to put into your hand, and shuffle the rest of it into your library" };
          return "paused";
        }
        const gone = sc.pileChoice === 0 ? one : two;
        sc.looked = sc.pileChoice === 0 ? two : one;
        sc.pileChoice = undefined;
        sc.portalExiled = true;
        // Exiled face up (CR 406.3).
        for (const id of gone) moveObject(s, id, "exile");
        log(s, `${p.name} exiles ${names(gone.filter((id) => s.objects[id]?.zone === "exile"))} (${src}).`);
      }
      // "Search the other pile for a card": a card with no stated quality, so one is found if the pile has any (CR 701.23d).
      const kept = inLibrary(sc.looked);
      if (kept.length && !sc.found) {
        s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards: kept, min: 1, max: 1, dig: { looked: kept, to: "into your hand", rest: "be shuffled into your library" } };
        return "paused";
      }
      const found = (sc.found ?? []).filter((id) => kept.includes(id));
      for (const id of found) moveObject(s, id, "hand");
      if (found.length) log(s, `${p.name} puts a card from the other pile into their hand.`);
      // "Then shuffle the rest of that pile into your library": still in it, so the library is shuffled (CR 701.24a).
      shuffleLibrary(s, p);
      log(s, `${p.name} shuffles their library.`);
      return;
    }
    case "ragingRiver": {
      // As it resolves: the creatures you control that are attacking, and their defending players (CR 506.2), each of
      // whom divides their creatures without flying into a "left" and a "right" pile (CR 700.3), in APNAP order (CR 101.4).
      const you = ctx.controller;
      if (!sc.river) {
        const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined && controllerOf(s, o) === you && objIsType(s, o, "Creature"));
        const order = apnap(s, [...new Set(mine.map((o) => o.attacking!))]).filter((pid) => !player(s, pid).lost);
        const creatures: Record<number, ObjectId[]> = {};
        for (const pid of order) creatures[pid] = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Creature") && !objHasKeyword(s, obj(s, id), "Flying"));
        sc.river = { order, creatures };
        sc.chosen = {};
      }
      const river = sc.river;
      const pilesOf = (pid: number): [ObjectId[], ObjectId[]] => {
        const left = sc.chosen?.[pid] ?? [];
        return [left, (river.creatures[pid] ?? []).filter((id) => !left.includes(id))];
      };
      for (const pid of river.order) {
        if (sc.chosen![pid] !== undefined) continue;
        if (!river.creatures[pid]!.length || player(s, pid).lost) {
          sc.chosen![pid] = [];
          continue;
        }
        sc.queue = [pid];
        s.pending = { kind: "pickPermanents", player: pid, source: src, action: "pile", what: "creature", options: river.creatures[pid]!, count: river.creatures[pid]!.length, min: 0, anyNumber: true, of: pid, pickFor: pid, pileNames: ["Left", "Right"], prompt: `divide all creatures without flying you control into a "left" pile and a "right" pile: click the creatures for the "left" pile (the rest form the "right" pile). Each creature ${player(s, you).name} attacks with is then given a label, and only creatures with flying and creatures in the pile with that label can block it this combat.` };
        return "paused";
      }
      if (!river.attackers) {
        for (const pid of river.order) {
          const [left, right] = pilesOf(pid);
          if (river.creatures[pid]!.length) log(s, `${player(s, pid).name} divides their creatures without flying into a "left" pile (${names(left, "none")}) and a "right" pile (${names(right, "none")}).`);
        }
        river.attackers = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined && controllerOf(s, o) === you && objIsType(s, o, "Creature")).map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 }));
        river.sides = [];
      }
      const still = (x: { id: ObjectId; zc: number }) => s.objects[x.id]?.zone === "battlefield" && (s.objects[x.id]!.zoneChanges ?? 0) === x.zc && s.objects[x.id]!.attacking !== undefined;
      if (sc.riverSide !== undefined) {
        river.sides!.push(sc.riverSide);
        sc.riverSide = undefined;
      }
      // "For each attacking creature you control, choose "left" or "right"": one at a time, in the order they're listed.
      while (river.sides!.length < river.attackers.length) {
        const x = river.attackers[river.sides!.length]!;
        if (!still(x)) {
          river.sides!.push("left");
          continue;
        }
        const a = obj(s, x.id);
        const [left, right] = pilesOf(a.attacking!);
        const whose = a.attacking === you ? "your" : `${player(s, a.attacking!).name}'s`;
        s.pending = { kind: "chooseOption", player: you, source: src, what: "riverSide", options: ["left", "right"], labels: [`"Left" (${whose}: ${names(left, "no creatures")})`, `"Right" (${whose}: ${names(right, "no creatures")})`], about: x.id, prompt: `choose "left" or "right" for ${characteristics(s, a).name}: it can't be blocked this combat except by creatures with flying and creatures in a pile with that label` };
        return "paused";
      }
      // "That creature can't be blocked this combat except by creatures with flying and creatures in a pile with the
      // chosen label" (CR 509.1b): the piles' creatures as the objects they are now (CR 400.7), every defending player's
      // pile with that label (only the player it attacks can block it anyway, CR 802.4a).
      const stamp = (ids: ObjectId[]) => ids.filter((id) => s.objects[id]?.zone === "battlefield").map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }));
      const labelled = (side: "left" | "right") => stamp(river.order.flatMap((pid) => pilesOf(pid)[side === "left" ? 0 : 1]));
      river.attackers.forEach((x, i) => {
        if (!still(x)) return;
        const a = obj(s, x.id);
        const side = river.sides![i]!;
        (a.riverOnly ??= []).push({ turn: s.turn, combat: s.combatsThisTurn ?? 0, selfZc: x.zc, allowed: labelled(side) });
        log(s, `${player(s, you).name} chooses "${side}" for ${characteristics(s, a).name} (${src}).`);
      });
      return;
    }
  }
}

// Lane B round B172's effects.
import type { Effect } from "../abilities";
import { defOf, isPermanentCard } from "../cards";
import { auraHostName, log, moveObject, obj, player, turnOrderFrom } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { chooseAuraHosts } from "./run-zones";

type B172Effect = Extract<Effect, { type: "putFromHandRounds" }>;

export function runLaneB172Effect(s: GameState, e: B172Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "putFromHandRounds": {
      // Eureka: starting with you and in turn order, each player may put a permanent card from their hand onto the
      // battlefield, each one entering as it's chosen; around and around until every player in the game, one after the
      // other, has put none (rulings: one who put none may put one the next time around). X in a mana cost is 0 there
      // (CR 107.3b). Its triggers wait until it has resolved (CR 603.3).
      const sc = (s.resolving!.scratch ??= {});
      const hr = (sc.handRounds ??= { next: ctx.controller, passes: 0, entered: [] });
      for (;;) {
        const order = turnOrderFrom(s, ctx.controller);
        if (!order.length || hr.passes >= order.length) break;
        // A player who has left the game is skipped (CR 800.4a): the next one still in it, in turn order.
        if (!order.includes(hr.next)) {
          const ti = s.turnOrder.indexOf(hr.next);
          hr.next = [...s.turnOrder.slice(ti + 1), ...s.turnOrder.slice(0, ti)].find((pid) => order.includes(pid))!;
        }
        const pid = hr.next;
        const p = player(s, pid);
        if (hr.picked === undefined) {
          if (sc.found !== undefined && hr.asked === pid) {
            hr.picked = sc.found.find((id) => p.hand.includes(id) && isPermanentCard(defOf(s, obj(s, id))));
            sc.found = undefined;
            hr.asked = undefined;
            if (hr.picked === undefined) log(s, `${p.name} puts no card onto the battlefield.`);
          } else {
            const cards = p.hand.filter((id) => isPermanentCard(defOf(s, obj(s, id))));
            if (cards.length) {
              hr.asked = pid;
              s.pending = { kind: "searchLibrary", player: pid, source: src, what: "a permanent card", cards, min: 0, max: 1, fromHand: true };
              return "paused";
            }
          }
        }
        let put = false;
        if (hr.picked !== undefined) {
          const o = obj(s, hr.picked);
          // An Aura: its controller chooses what it enchants as it enters, or it stays in the hand (CR 303.4f-g).
          const hosts = o.zone === "hand" ? chooseAuraHosts(s, [{ o, under: pid }], src) : new Map();
          if (hosts === "paused") return "paused";
          if (sc.auraHosts) delete sc.auraHosts[o.id];
          const host = hosts.get(o.id);
          const name = defOf(s, o).name;
          if (o.zone !== "hand") {
            // Nothing to put.
          } else if (defOf(s, o).subtypes.includes("Aura") && !host) {
            log(s, `${name} has nothing to enchant, so it stays in ${p.name}'s hand.`);
          } else {
            log(s, `${p.name} puts ${name} from their hand onto the battlefield${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
            moveObject(s, o.id, "battlefield", { controller: pid, ...host });
            if (obj(s, o.id).zone === "battlefield") {
              put = true;
              // A choice it makes as it enters is asked once this is over; the cards put after it weren't on the
              // battlefield yet (CR 614.12), so a copy can't be of them.
              for (const c of s.entersChoices ?? []) if (hr.entered.includes(c.id)) (c.together ??= []).push(o.id);
              hr.entered.push(o.id);
            }
          }
          hr.picked = undefined;
        }
        hr.passes = put ? 0 : hr.passes + 1;
        const ti = s.turnOrder.indexOf(pid);
        hr.next = [...s.turnOrder.slice(ti + 1), ...s.turnOrder.slice(0, ti + 1)].find((x) => order.includes(x))!;
      }
      sc.handRounds = undefined;
      return;
    }
  }
}

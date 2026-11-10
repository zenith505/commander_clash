// Round 327's effects.
import type { Effect } from "../abilities";
import { defOf, isPermanentCard } from "../cards";
import { auraHostName, log, moveObject, obj, player } from "../game";
import type { GameState } from "../types";
import { amountCtx, type ResolveCtx } from "./resolve";
import { bindBound, printedMatches } from "./targeting";
import { chooseAuraHosts } from "./run-zones";

type R327Effect = Extract<Effect, { type: "revealPutIfNamedAsPermanent" }>;

export function runRound327Effect(s: GameState, e: R327Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "revealPutIfNamedAsPermanent": {
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      // The card revealed: chosen by the player (with one card, that one), remembered across an Aura's host choice.
      if (sc.retraced === undefined) {
        if (sc.found) {
          sc.retraced = sc.found[0] ?? "";
          delete sc.found;
        } else if (p.hand.length > 1) {
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card to reveal", cards: [...p.hand], min: 1, max: 1, fromHand: true, reveal: true };
          return "paused";
        } else sc.retraced = p.hand[0] ?? "";
        const id = sc.retraced;
        if (!id || !p.hand.includes(id)) {
          log(s, `${p.name} has no card in hand to reveal.`);
          sc.retraced = "";
          return;
        }
        log(s, `${p.name} reveals ${defOf(s, obj(s, id)).name} from their hand.`);
      }
      const id = sc.retraced;
      if (!id || obj(s, id).zone !== "hand" || obj(s, id).owner !== p.id) return;
      const d = defOf(s, obj(s, id));
      // Named like a permanent now (rulings of Mitotic Manipulation); only a permanent card can be put onto the
      // battlefield (CR 400.4a).
      const named = bindBound(s, { kind: "card", sameNameAsPermanent: true, text: "card with the same name as a permanent" }, amountCtx(s, ctx));
      if (!isPermanentCard(d) || !printedMatches(named, d)) {
        log(s, `${d.name} doesn't have the same name as a permanent${isPermanentCard(d) ? "" : " that could be put onto the battlefield"}.`);
        return;
      }
      // An Aura: what it enchants is chosen as it enters, or it stays in the hand (CR 303.4f-g).
      const hosts = chooseAuraHosts(s, [{ o: obj(s, id), under: p.id }], src);
      if (hosts === "paused") return "paused";
      const host = hosts.get(id);
      if (d.subtypes.includes("Aura") && !host) {
        log(s, `${d.name} has nothing to enchant, so it stays in ${p.name}'s hand.`);
        return;
      }
      log(s, `${p.name} puts ${d.name} from their hand onto the battlefield${host ? ` enchanting ${auraHostName(s, host)}` : ""}.`);
      moveObject(s, id, "battlefield", { controller: p.id, ...host });
      return;
    }
  }
}

// Lane B round B160's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { enterTogether, livingPlayers, log, moveObject, obj, player } from "../game";
import { nextRandom } from "../rng";
import type { GameState, ObjectId } from "../types";
import { amountNow, apnap, players, runEffect, type ResolveCtx } from "./resolve";
import { characteristics } from "../layers";
import { defMv, sameName } from "../faces";
import { bindChosen, printedMatches } from "./targeting";
import { discardCards, discardToTop } from "./run-library";
import { charView, viewsShareName } from "../all-names";

type B160Effect = Extract<Effect, { type: "revealRandomDiscardNamed" | "counterCauseIfNamed" | "eachChoosesFromHand" }>;

export function runLaneB160Effect(s: GameState, e: B160Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "revealRandomDiscardNamed": {
      const pid = players(s, e.who, ctx)[0];
      if (pid === undefined) return;
      const p = player(s, pid);
      // Revealed once: Nephalia Academy's question (round 430) below comes back here.
      const sc = (s.resolving!.scratch ??= {});
      let seen = sc.randomPicks?.[pid];
      if (!seen) {
        // X cards of the hand at random, all of them with fewer (rulings: the name was chosen first, as it resolved).
        const pool = [...p.hand];
        seen = [];
        for (let n = Math.min(amountNow(s, e.n, ctx), pool.length); n > 0; n--) seen.push(...pool.splice(Math.floor(nextRandom(s) * pool.length), 1));
        (sc.randomPicks ??= {})[pid] = seen;
        if (!seen.length) {
          log(s, `${p.name} reveals no cards from their hand.`);
          return;
        }
        log(s, `${p.name} reveals ${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")} at random from their hand.`);
      }
      // No name chosen (none to choose from): nothing has it.
      if (ctx.chosen?.name === undefined) return;
      const named = bindChosen({ kind: "card", types: [], notTypes: [], notColors: [], chosen: "name", text: "card with the chosen name" }, ctx.chosen);
      const hit = seen.filter((id: ObjectId) => p.hand.includes(id) && printedMatches(named, defOf(s, obj(s, id))));
      const tops = discardToTop(s, pid, hit, src, ctx);
      if (tops === "paused") return "paused";
      discardCards(s, pid, hit, "", false, false, ctx.controller, undefined, tops);
      return;
    }
    case "counterCauseIfNamed": {
      const item = s.stack.find((x) => x.id === ctx.cause);
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      // Gone from the stack, or face down (no name, CR 708.2a): nothing to counter.
      if (!o || o.faceDown) return;
      const name = defOf(s, o).name;
      const inYard = s.players.some((p) => p.graveyard.some((id) => sameName(defOf(s, obj(s, id)).name, name)));
      const onField = s.battlefield.some((id) => {
        const x = obj(s, id);
        // Spy Kit's names count (CR 612.7).
        return !x.isToken && !x.faceDown && viewsShareName(s, charView(characteristics(s, x)), { name });
      });
      if (!inYard && !onField) return;
      return runEffect(s, { type: "counterCause" }, ctx);
    }
    case "eachChoosesFromHand": {
      const sc = (s.resolving!.scratch ??= {});
      const g = (sc.gambit ??= { queue: apnap(s, livingPlayers(s)), picks: {} });
      // The card the last player asked chose, still in their hand.
      if (sc.found) {
        const pid = g.queue.shift();
        const id = sc.found[0];
        if (pid !== undefined && id && player(s, pid).hand.includes(id)) g.picks[pid] = id;
        delete sc.found;
      }
      while (g.queue.length) {
        const p = player(s, g.queue[0]!);
        // A player with no cards in hand chooses none; with one card, it's the one.
        if (p.hand.length > 1) {
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card", cards: [...p.hand], min: 1, max: 1, fromHand: true, reveal: true };
          return "paused";
        }
        if (p.hand[0]) g.picks[p.id] = p.hand[0];
        g.queue.shift();
      }
      const shown = Object.entries(g.picks).filter(([pid, id]) => !!id && player(s, Number(pid)).hand.includes(id)) as [string, ObjectId][];
      for (const [pid, id] of shown) log(s, `${player(s, Number(pid)).name} reveals ${defOf(s, obj(s, id)).name}.`);
      const creatures = shown.filter(([, id]) => defOf(s, obj(s, id)).types.includes("Creature"));
      if (!creatures.length) return;
      const low = Math.min(...creatures.map(([, id]) => defMv(defOf(s, obj(s, id)))));
      const winners = creatures.filter(([, id]) => defMv(defOf(s, obj(s, id))) === low);
      log(s, `${winners.map(([pid, id]) => `${player(s, Number(pid)).name} puts ${defOf(s, obj(s, id)).name}`).join(", ")} onto the battlefield.`);
      enterTogether(s, () => winners.forEach(([pid, id]) => moveObject(s, id, "battlefield", { controller: Number(pid) })));
      return;
    }
  }
  void src;
}

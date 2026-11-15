// Lane B round B218's effects: Conundrum Sphinx's guesses (eachGuessTop) and Mirror of Fate (exiledToLibraryTop).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, player } from "../game";
import { cardNameOptions } from "../names";
import type { GameState } from "../types";
import { apnap, type ResolveCtx } from "./resolve";
import { bindChosen, printedMatches } from "./targeting";

type B218Effect = Extract<Effect, { type: "eachGuessTop" | "exiledToLibraryTop" }>;

export function runLaneB218Effect(s: GameState, e: B218Effect, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  switch (e.type) {
    case "eachGuessTop": {
      // Conundrum Sphinx: the active player names a card first, then each other player in turn order (rulings, CR 101.4),
      // each answer kept for that player; only then does each player reveal the top card of their own library, all at once
      // (rulings). A card with the name its own player chose goes into that player's hand, any other to the bottom of their
      // library, even one another player named (rulings). An empty library reveals nothing.
      const g = (sc.guessTop ??= { asked: [], names: {} });
      if (g.waiting !== undefined) {
        if (r.chosen?.name !== undefined) g.names[g.waiting] = r.chosen.name;
        g.waiting = undefined;
      }
      const order = apnap(s, s.turnOrder).filter((pid) => !player(s, pid).lost);
      const next = order.find((pid) => !g.asked.includes(pid));
      const options = cardNameOptions(s);
      if (next !== undefined && options.length) {
        g.asked.push(next);
        g.waiting = next;
        r.chosen = { ...r.chosen, name: undefined };
        s.pending = { kind: "chooseOption", player: next, source: src, what: "cardName", options, prompt: "choose a card name: if the top card of your library has it, you put that card into your hand; otherwise it goes to the bottom of your library", purpose: "guess", of: next };
        return "paused";
      }
      for (const pid of order) {
        const p = player(s, pid);
        const top = p.library[0];
        if (top === undefined) continue;
        const card = s.objects[top]!;
        const name = g.names[pid];
        const hit = name !== undefined && printedMatches(bindChosen({ kind: "card", chosen: "name", text: "card with the chosen name" }, { name }), defOf(s, card));
        log(s, `${p.name} reveals ${defOf(s, card).name} from the top of their library${name !== undefined ? ` (they chose ${name})` : ""}.`);
        if (hit) {
          moveObject(s, top, "hand");
          log(s, `${p.name} puts ${defOf(s, card).name} into their hand.`);
        } else {
          p.library = [...p.library.filter((id) => id !== top), top];
          log(s, `${p.name} puts ${defOf(s, card).name} on the bottom of their library.`);
        }
      }
      sc.guessTop = undefined;
      return;
    }
    case "exiledToLibraryTop": {
      // Mirror of Fate: up to `n` face-up cards in exile its controller owns, chosen as it resolves, however they got there
      // (rulings); then every card of that player's library is exiled face up (rulings), and the chosen cards still in exile
      // (CR 400.7) go on top of the library in the order that player chooses (rulings: hidden from the others, CR 401.4).
      const p = player(s, ctx.controller);
      const faceUp = (id: string) => {
        const o = s.objects[id];
        return !!o && o.zone === "exile" && o.owner === p.id && !o.faceDown && !o.hiddenExile;
      };
      if (sc.mirrorTop === undefined) {
        if (!sc.found) {
          const cards = p.exile.filter(faceUp);
          if (cards.length) {
            s.pending = { kind: "searchLibrary", player: p.id, source: src, what: `up to ${e.n} face-up exiled cards you own`, cards, min: 0, max: Math.min(e.n, cards.length), exiled: true, dig: { looked: cards, to: "to put on top of your library", rest: "stay in exile" } };
            return "paused";
          }
          sc.found = [];
        }
        const chosen = sc.found.filter(faceUp);
        sc.found = undefined;
        const library = [...p.library];
        for (const id of library) moveObject(s, id, "exile");
        log(s, `${p.name} exiles all ${library.length} card${library.length === 1 ? "" : "s"} from their library.`);
        for (const id of [...chosen].reverse()) moveObject(s, id, "library", { top: true });
        const put = chosen.filter((id) => s.objects[id]?.zone === "library");
        sc.mirrorTop = put;
        if (put.length > 1) {
          s.pending = { kind: "arrangeTop", player: p.id, how: "order", cards: put, source: src };
          return "paused";
        }
      } else if (sc.arranged) {
        const order = sc.arranged.top.filter((id) => sc.mirrorTop!.includes(id) && p.library.includes(id));
        p.library = [...order, ...p.library.filter((id) => !order.includes(id))];
        sc.arranged = undefined;
      }
      const n = sc.mirrorTop.length;
      if (n) log(s, `${p.name} puts ${n === 1 ? defOf(s, s.objects[sc.mirrorTop[0]!]!).name : `${n} cards`} on top of their library.`);
      sc.mirrorTop = undefined;
      return;
    }
  }
}

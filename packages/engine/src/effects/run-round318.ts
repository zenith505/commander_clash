// Round 318's effects.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, enterTogether, obj, player } from "../game";
import type { GameState, ObjectId, PlayerId } from "../types";
import { type ResolveCtx } from "./resolve";
import { chooseAnOpponent } from "./run-library";

/**
 * Hostile Negotiations: "Exile the top three cards of your library in a face-down pile, then exile the top three cards of
 * your library in another face-down pile. Look at the cards in each pile, then turn a pile of your choice face up. An
 * opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard." Both piles are
 * exiled face down (only you may look at them, CR 406.3), the second smaller or empty with fewer than six cards left
 * (rulings); you turn one face up (an empty one too, rulings), then an opponent you choose as it resolves chooses a pile
 * for your hand, seeing the face-up pile and only the size of the other.
 */
export function runFaceDownPilesEffect(s: GameState, e: Extract<Effect, { type: "faceDownPiles" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const p = player(s, ctx.controller);
  const names = (ids: ObjectId[]) => (ids.length ? ids.map((id) => defOf(s, obj(s, id)).name).join(", ") : "no cards");
  const count = (n: number) => (n === 1 ? "1 card" : `${n} cards`);
  if (!sc.facePiles) {
    const piles: [ObjectId[], ObjectId[]] = [[], []];
    for (const pile of piles) {
      const at = s.nextTimestamp++;
      for (const id of p.library.slice(0, e.n)) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        o.hiddenExile = { by: ctx.sourceId ?? "", seen: [p.id], label: "Face down", at };
        pile.push(id);
      }
    }
    sc.facePiles = piles;
    log(s, `${p.name} exiles the top cards of their library face down in two piles of ${count(piles[0].length)} and ${count(piles[1].length)}.`);
  }
  // Only the cards still in exile, as they are now (CR 400.7).
  const [a, b] = sc.facePiles.map((pile) => pile.filter((id) => s.objects[id]?.zone === "exile")) as [ObjectId[], ObjectId[]];
  if (sc.faceUpPile === undefined) {
    if (sc.pileChoice === undefined) {
      s.pending = { kind: "chooseOption", player: p.id, source: src, what: "pile", options: ["0", "1"], labels: [`Pile 1: ${names(a)}`, `Pile 2: ${names(b)}`], piles: [a, b], of: p.id, pileMode: "turnFaceUp", prompt: "choose a pile to turn face up (an opponent then chooses the pile you put into your hand; the other goes into your graveyard)" };
      return "paused";
    }
    sc.faceUpPile = sc.pileChoice;
    sc.pileChoice = undefined;
    const up = sc.faceUpPile === 0 ? a : b;
    for (const id of up) obj(s, id).hiddenExile = undefined;
    log(s, `${p.name} turns a pile face up: ${names(up)}.`);
  }
  // The face-down pile first, as the chooser sees it.
  const down = sc.faceUpPile === 0 ? b : a;
  const up = sc.faceUpPile === 0 ? a : b;
  if (sc.pileChoice === undefined) {
    const opp: PlayerId | undefined | "paused" = chooseAnOpponent(s, ctx, src, "choose an opponent to choose a pile");
    if (opp === "paused") return "paused";
    if (opp === undefined || player(s, opp).lost) return;
    s.pending = { kind: "chooseOption", player: opp, source: src, what: "pile", options: ["0", "1"], labels: [`Face-down pile: ${count(down.length)}`, `Face-up pile: ${names(up)}`], piles: [down, up], of: p.id, pileMode: "faceDown", prompt: `choose the pile to put into ${p.name}'s hand (the other goes into the graveyard)` };
    return "paused";
  }
  const hand = sc.pileChoice === 0 ? down : up;
  const rest = sc.pileChoice === 0 ? up : down;
  log(s, `${p.name} puts ${sc.pileChoice === 0 ? `the face-down pile (${count(hand.length)})` : names(hand)} into their hand and ${names(rest)} into their graveyard.`);
  enterTogether(s, () => {
    for (const id of hand) moveObject(s, id, "hand");
    for (const id of rest) moveObject(s, id, "graveyard");
  });
}

// Lane B round B305: Panglacial Wurm, cast from your library while you search it.
import { defOf } from "../cards";
import { compileCard } from "../oracle";
import type { Effect } from "../abilities";
import { castProblem, log, obj, player } from "../game";
import type { GameState, PlayerId } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Panglacial Wurm: "While you're searching your library, you may cast ~ from your library." An ability of the card in its
 * owner's library (CR 113.6b). Before `pid` finds anything searching their own library (rulings: "you must do so before you
 * find any cards with the search effect"), each card there with it that they may cast is offered once in this search: cast
 * for its mana cost, timing ignored (rulings: "casting the Wurm this way always occurs during the resolution of another spell
 * or ability"), with mana abilities to pay for it (CR 605.3a). It goes on the stack (CR 601.2a), can't be found by the
 * search, and the search goes on; the active player gets priority once the search's spell or ability has resolved
 * (rulings). Several may be cast in one search (rulings). `top`: an opponent's Aven Mindcensor lets them look at only that
 * many cards, and a card they don't look at isn't one they can cast (judgment call, no ruling). Returns "paused" while one is
 * offered (PendingDecision "castFree" `how` "paid", `whileSearching`); the search effect runs again once it's answered.
 */
export function castWhileSearching(s: GameState, pid: PlayerId, src: string, sc: { searchCastOffered?: string[] }, top: number | undefined): "paused" | undefined {
  if (!s.resolving) return undefined;
  const p = player(s, pid);
  const seen = top === undefined ? p.library : p.library.slice(0, top);
  const offered = (sc.searchCastOffered ??= []);
  for (const id of seen) {
    if (offered.includes(id)) continue;
    const o = obj(s, id);
    if (o.owner !== pid || !compileCard(defOf(s, o)).castWhileSearching) continue;
    offered.push(id);
    s.pending = { kind: "castFree", player: pid, objectId: id, source: src, how: "paid", whileSearching: true };
    // Mana abilities can still be activated to pay for it (CR 601.2g), so only the mana in the pool may be short.
    const problem = castProblem(s, pid, id);
    if (problem === null || /^not enough mana/.test(problem)) return "paused";
    s.pending = null;
  }
  return undefined;
}

type B305Effect = Extract<Effect, { type: "shamansTrance" }>;

export function runLaneB305Effect(s: GameState, e: B305Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "shamansTrance": {
      // Shaman's Trance: for the rest of this turn (CR 611.2a, a "this turn" effect of a resolved spell); the turn's entries only.
      const list = (s.tranceTurn = (s.tranceTurn ?? []).filter((t) => t.turn === s.turn));
      list.push({ player: ctx.controller, turn: s.turn, source: src });
      const me = player(s, ctx.controller).name;
      log(s, `${src}: other players can't play lands or cast spells from their graveyards this turn; ${me} may play lands and cast spells from other players' graveyards as though they were in ${me}'s graveyard.`);
      return;
    }
  }
}

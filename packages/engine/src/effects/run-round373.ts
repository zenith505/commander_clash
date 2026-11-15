// Round 373's effects: milling one card at a time until a creature card or X cards are put into a graveyard (Helm of
// Obedience).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, millCount, moveObject, obj, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { amountNow, players } from "./resolve";
import { printedMatches } from "./targeting";

/**
 * Helm of Obedience: the player mills a card (CR 701.17a), then again, until a card matching `until` or `n` cards in all
 * have been put into their graveyard this way, or their library is empty (CR 701.17b: nothing more to mill). Each mill is
 * the card's own event, so a replacement that changes how many cards a mill is (Bruvac) applies to each one, and a card
 * a replacement exiles instead isn't put there (rulings: with Leyline of the Void the whole library is exiled). The cards
 * put into the graveyard are kept for "if one or more creature cards were put into that graveyard this way" and "one of
 * them" (ResolvingInfo.milled, SpellCondition milledIs, chooseFromGraveyard `milled`).
 */
export function runMillUntilEffect(s: GameState, e: Extract<Effect, { type: "millUntil" }>, ctx: ResolveCtx): void {
  s.resolving!.milled = [];
  s.resolving!.milledExiled = [];
  const max = Math.max(0, amountNow(s, e.n, ctx));
  for (const pid of players(s, e.who, ctx)) {
    const p = player(s, pid);
    const names: string[] = [];
    let put = 0;
    let hit = false;
    while (!p.lost && p.library.length && !hit && put < max) {
      const ids = p.library.slice(0, millCount(s, pid, 1));
      if (!ids.length) break;
      for (const id of ids) {
        moveObject(s, id, "graveyard", { milled: true });
        const o = obj(s, id);
        names.push(defOf(s, o).name);
        if (o.zone === "graveyard") {
          s.resolving!.milled.push({ id, zc: o.zoneChanges ?? 0 });
          put++;
          if (printedMatches(e.until, defOf(s, o))) hit = true;
        } else if (o.zone === "exile") s.resolving!.milledExiled.push({ id, zc: o.zoneChanges ?? 0 });
      }
    }
    log(s, `${p.name} mills ${names.length} card${names.length === 1 ? "" : "s"}${names.length ? ` (${names.join(", ")})` : ""}.`);
  }
}

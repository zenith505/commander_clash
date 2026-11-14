// Round 359's effects.
import type { Effect } from "../abilities";
import { defOf, isType } from "../cards";
import { restingDef } from "../faces";
import { log, moveObject, obj, player } from "../game";
import { nextRandom } from "../rng";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { printedMatches } from "./targeting";
import { auraCopyHost, tokenCopies } from "./run-tokens";

/**
 * Sin, Spira's Punishment: "exile a permanent card from your graveyard at random, then create a tapped token that's a copy
 * of that card. If the exiled card is a land card, repeat this process." One card at random among those matching as it
 * resolves (nothing with none), exiled; then a token copy of exactly what's printed on it (CR 707.2, rulings; the front
 * face of a double-faced card, CR 712.8a; X in its mana cost is 0, CR 107.3f), tapped. A copy of an Aura enters attached to
 * what its controller chooses, and isn't created with nothing it could enchant (CR 303.4f-g). If that card was a land
 * card, the whole process again, with a new random card; it ends once a nonland card is exiled or none is left, so it
 * can't go on forever (each pass exiles a card). The tokens' enters abilities trigger, and wait until this has resolved
 * (CR 603.3).
 */
export function runExileRandomTokenCopyEffect(s: GameState, e: Extract<Effect, { type: "exileRandomTokenCopy" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const p = player(s, ctx.controller);
  for (;;) {
    if (!sc.randomCopy) {
      const pool = p.graveyard.filter((id) => printedMatches(e.filter, defOf(s, obj(s, id))));
      if (!pool.length) {
        log(s, `${src}: ${p.name} has no ${e.filter.text} in their graveyard.`);
        return;
      }
      const o = obj(s, pool[Math.floor(nextRandom(s) * pool.length)]!);
      const land = isType(defOf(s, o), "Land");
      log(s, `${src}: ${defOf(s, o).name} is chosen at random and exiled from ${p.name}'s graveyard.`);
      moveObject(s, o.id, "exile");
      // Exiled somewhere else instead: "that card" isn't the card exiled, and nothing is copied or repeated.
      if (o.zone !== "exile") return;
      sc.randomCopy = { id: o.id, zc: o.zoneChanges ?? 0, land };
    }
    const pick = sc.randomCopy;
    const card = s.objects[pick.id];
    const base = card ? restingDef(s.cards[card.cardId]!) : undefined;
    if (base) {
      // A copy of an Aura: what it enchants, chosen as it's created (asked about the exiled card).
      const host = auraCopyHost(s, ctx.controller, base, undefined, pick.id, src);
      if (host === "paused") return "paused";
      tokenCopies(s, ctx.controller, base, 1, ctx, { ...(e.tapped ? { tapped: true } : {}), ...(host !== undefined ? { auraHost: host } : {}) });
    }
    sc.randomCopy = undefined;
    if (!e.repeatIfLand || !pick.land) return;
    log(s, `${src}: the exiled card was a land card, so the process repeats.`);
  }
}

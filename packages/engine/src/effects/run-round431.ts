// Round 431's effects: Hama, the Bloodbender's exiled card, cast during your turn by waterbending {X} while you control it.
import { defOf } from "../cards";
import { defMv } from "../faces";
import { log, obj, player, stillControlsSource } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Hama: "For as long as you control ~, you may cast the exiled card during your turn by waterbending {X} rather than paying
 * its mana cost, where X is its mana value.": the card the "exile up to one ... card from that player's graveyard" before
 * this exiled, still that card in exile (CR 400.7). X is that card's mana value as it is in exile (an {X} in its cost as 0,
 * CR 202.3e), fixed now. "For as long as you control ~": the source as the object it is now, under this ability's
 * controller; if it has already left or changed control, the duration ended before it began and nothing may be cast (CR
 * 611.2b, rulings on Nihiloor and Kotose). Normal timing rules still apply (rulings); X in its own cost is 0 (rulings, CR
 * 107.3b); additional costs are still paid; no other alternative cost goes with it (rulings, CR 118.9a).
 */
export function runMayCastExiledWaterbendEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const c = s.resolving?.chosenFromYard;
  const o = c && s.objects[c.id];
  if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== c.zc || o.isToken || !ctx.sourceId) return;
  const source = { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 };
  const probe = { player: ctx.controller, zc: o.zoneChanges ?? 0, until: "whileControlled" as const, turn: s.turn, source };
  const name = defOf(s, obj(s, o.id)).name;
  if (!stillControlsSource(s, probe)) {
    log(s, `${player(s, ctx.controller).name} no longer controls ${src}, so ${name} can't be cast.`);
    return;
  }
  const x = defMv(defOf(s, o));
  o.mayPlay = { ...probe, castOnly: true, cost: `{${x}}`, waterbend: true, yourTurnOnly: true };
  log(s, `${player(s, ctx.controller).name} may cast ${name} during their turn by waterbending {${x}}, for as long as they control ${src}.`);
}

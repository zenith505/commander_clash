// Round 368's effects: Aura tokens copying a sacrificed Aura onto each other attacking creature (Three Dog, Galaxy News
// DJ).
import { objIsType } from "../cards";
import { enterTogether, log } from "../game";
import { controllerOf } from "../layers";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { tokenCopies } from "./run-tokens";

/**
 * Three Dog, Galaxy News DJ: "for each other attacking creature you control, create a token that's a copy of that Aura
 * attached to that creature": the Aura its trigger sacrificed, its copiable values as it last existed (CR 707.2, 608.2h:
 * what was printed on it, or what it was copying; not counters, tapped status or other effects, rulings), one for each
 * creature attacking now that its controller controls, other than ~ (as it last existed, if it has left). Not targeted, so
 * a creature with shroud gets one; a copy that couldn't legally be attached to its creature isn't created (rulings, CR
 * 303.4g). All of them enter at once.
 */
export function runAuraCopiesOnAttackersEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const key = ctx.sacrificed?.[0]?.copyKey;
  const base = key ? s.cards[key] : undefined;
  if (!base) return;
  const attackers = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.id !== ctx.sourceId && o.attacking !== undefined && objIsType(s, o, "Creature") && controllerOf(s, o) === ctx.controller);
  if (!attackers.length) {
    log(s, `${src}: no other attacking creature to copy ${base.name} onto.`);
    return;
  }
  enterTogether(s, () => {
    for (const o of attackers) tokenCopies(s, ctx.controller, base, 1, ctx, { auraHost: { attachTo: o.id } });
  });
}

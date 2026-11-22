// Round 442's effects: Arna Kennerüd, Skycaptain's token copies of the permanents attached to an attacking creature.
import type { Effect } from "../abilities";
import { copiableDef, tokenCopyKey } from "../copies";
import { enterTogether, log, obj } from "../game";
import type { GameState } from "../types";
import { objects, type ResolveCtx } from "./resolve";
import { tokenCopies } from "./run-tokens";

/**
 * Arna Kennerüd, Skycaptain: "Then for each nontoken permanent attached to it, create a token that's a copy of that
 * permanent attached to that creature." The creature as it is now, still that object on the battlefield (CR 400.7); with
 * it gone nothing is attached to it, so nothing is created. Each nontoken permanent attached to it then, whoever controls
 * it (rulings), is copied as it is now (CR 707.2) for a token its controller (this ability's) creates, all of them at once
 * (CR 608.2c). An Aura token enters attached to that creature only if it could enchant it, else it isn't created (CR
 * 303.4i, rulings); an Equipment token that can't equip it is created unattached (CR 301.5e, rulings), and so is anything
 * else (CR 303.4h: a bestowed Aura's copy is the creature card's, not an Aura, CR 702.103b, 707.2).
 */
export function runTokenCopiesOfAttachedEffect(s: GameState, e: Extract<Effect, { type: "tokenCopiesOfAttached" }>, ctx: ResolveCtx, src: string): void {
  const host = objects(s, e.what, ctx)[0];
  if (!host) return;
  const attached = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attachedTo === host.id && !o.isToken);
  if (!attached.length) {
    log(s, `${src}: no nontoken permanent is attached to it, so no token is created.`);
    return;
  }
  // Every copiable value is read before any token is created. A bestowed Aura's copy is of the card, an enchantment
  // creature: being an Aura is the bestow ability's effect (CR 702.103b), not a copiable value (CR 707.2).
  const bases = attached.map((o) => copiableDef(s, o.bestowed ? { ...o, bestowed: false } : o));
  if (s.resolving) s.resolving.created = [];
  enterTogether(s, () => {
    for (const base of bases) {
      const aura = s.cards[tokenCopyKey(s, base).key]!.subtypes.includes("Aura");
      tokenCopies(s, ctx.controller, base, 1, ctx, aura ? { auraHost: { attachTo: host.id } } : { attachTo: host.id });
    }
  });
}

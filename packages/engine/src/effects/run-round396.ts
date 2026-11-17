// Round 396's effects: a creature becoming a copy of a creature card exiled with its Equipment for as long as the Equipment
// remains attached to it (Assimilation Aegis). The other "for as long as" copies run in run-copies.ts (becomeCopyWhile).
import type { Effect } from "../abilities";
import { isType } from "../cards";
import { restingDef } from "../faces";
import { copyWhileHolds, log } from "../game";
import type { GameState } from "../types";
import { becomeCopyWhile } from "./run-copies";
import type { ResolveCtx } from "./resolve";
import { objects } from "./resolve";

/**
 * Assimilation Aegis: "Whenever this Equipment becomes attached to a creature, for as long as this Equipment remains attached
 * to it, that creature becomes a copy of a creature card exiled with this Equipment." The cards its enters ability exiled
 * (linked, CR 607.2a) that are creature cards in exile, as printed (CR 707.2; a noncreature card can't be chosen, rulings),
 * one chosen as this resolves when there are several, not necessarily the same each time (rulings); with none, the creature
 * stays as it is (rulings). Not if the Equipment isn't attached to it any more as this resolves (CR 611.2b).
 */
export function runBecomeCopyOfLinkedEffect(s: GameState, e: Extract<Effect, { type: "becomeCopyOfLinked" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const host = objects(s, e.what, ctx).find((o) => o.zone === "battlefield");
  const attached = !!host && copyWhileHolds(s, { whileAttached: { id: ctx.sourceId ?? "", zc: ctx.sourceZc ?? 0, host: host.id, hostZc: host.zoneChanges ?? 0 } });
  const cards = objects(s, { ref: "linkedCard" }, ctx).filter((o) => !o.isToken && isType(restingDef(s.cards[o.cardId]!), "Creature"));
  if (!host || !attached || !cards.length) {
    sc.aegisCopy = undefined;
    if (host && !attached) log(s, `${src} isn't attached to ${host ? "that creature" : "anything"} any more, so nothing becomes a copy.`);
    else if (host) log(s, `There's no creature card exiled with ${src}, so nothing becomes a copy.`);
    return;
  }
  let card = cards.length === 1 ? cards[0] : undefined;
  if (!card) {
    if (sc.aegisCopy === undefined) {
      sc.aegisCopy = "";
      s.pending = {
        kind: "chooseOption",
        player: ctx.controller,
        source: src,
        what: "aegisCopy",
        options: cards.map((o) => o.id),
        labels: cards.map((o) => restingDef(s.cards[o.cardId]!).name),
        prompt: `choose a creature card exiled with ${src} for the equipped creature to become a copy of.`,
      };
      return "paused";
    }
    card = cards.find((o) => o.id === sc.aegisCopy);
    sc.aegisCopy = undefined;
    if (!card) return;
  }
  becomeCopyWhile(s, { type: "becomeCopy", what: e.what, of: { ref: "linkedCard" }, duration: "whileSourceAttached" }, restingDef(s.cards[card.cardId]!), ctx);
}

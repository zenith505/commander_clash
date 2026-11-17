// Round 399's effects: Koh, the Face Stealer's "Choose a creature card exiled with ~" (Effect chooseLinkedCard), for its
// "~ has all activated and triggered abilities of the last chosen card" (CompiledCard.borrows chosen, cards.ts lendersOf).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { invalidateCharacteristics } from "../layers";
import { log } from "../game";
import { printedMatches } from "./targeting";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";

/**
 * Koh, the Face Stealer: "Choose a creature card exiled with ~." The cards its exile abilities exiled (linked, CR 607.2a,
 * 607.4), each still that card in exile (CR 400.7), that are creature cards there (a token is gone, CR 111.7). Chosen as
 * this resolves, not targeted (CR 115.1), asked only when there are several (chooseOption "kohCard"). The choice is
 * remembered on ~ as the object it is now (Chosen.card) for "the last chosen card" (CR 607.2d): not if ~ has left the
 * battlefield since (a new object, CR 400.7). With none to choose, nothing is chosen and the last choice stands.
 */
export function runChooseLinkedCardEffect(s: GameState, e: Extract<Effect, { type: "chooseLinkedCard" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const here = !!me && me.zone === "battlefield" && (me.zoneChanges ?? 0) === (ctx.sourceZc ?? 0);
  // Only this object's own (not a "linkedCard" fallback to what it was before it left, CR 400.7).
  const cards = (here ? (s.linkedExile?.[`${me!.id}@${me!.zoneChanges ?? 0}`] ?? []) : []).flatMap((l) => {
    const o = s.objects[l.id];
    return o && o.zone === "exile" && (o.zoneChanges ?? 0) === l.zc && !o.isToken && !o.faceDown && printedMatches(e.filter, defOf(s, o)) ? [o] : [];
  });
  if (!here || !cards.length) {
    sc.kohCard = undefined;
    log(s, !here ? `${src} has left the battlefield, so no card is chosen.` : `There's no ${e.filter.text} exiled with ${src}, so no card is chosen.`);
    return;
  }
  let card = cards.length === 1 ? cards[0] : undefined;
  if (!card) {
    if (sc.kohCard === undefined) {
      sc.kohCard = "";
      s.pending = {
        kind: "chooseOption",
        player: ctx.controller,
        source: src,
        what: "kohCard",
        options: cards.map((o) => o.id),
        labels: cards.map((o) => defOf(s, o).name),
        prompt: `choose a ${e.filter.text} exiled with ${src}.`,
      };
      return "paused";
    }
    card = cards.find((o) => o.id === sc.kohCard);
    sc.kohCard = undefined;
    if (!card) return;
  }
  me!.chosen = { ...me!.chosen, card: { id: card.id, zc: card.zoneChanges ?? 0 } };
  invalidateCharacteristics(s);
  log(s, `${src} chooses ${defOf(s, card).name}.`);
}

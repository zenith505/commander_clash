// Round 444's effects: Altaïr Ibn-La'Ahad's tapped and attacking token copies of the creature cards you own in exile with
// memory counters on them.
import type { Effect } from "../abilities";
import { copiableDef } from "../copies";
import { enterTogether, log, obj, player } from "../game";
import type { GameState } from "../types";
import { type ResolveCtx } from "./resolve";
import { attackChoices } from "./run-zones";
import { attackWhomOptions, takeAttackWhom, tokenCopies, tokenCopyBatch } from "./run-tokens";
import { printedMatches } from "./targeting";

/**
 * Altaïr Ibn-La'Ahad (Effect tokenCopiesOfExiledWithCounter): "Then for each creature card you own in exile with a memory
 * counter on it, create a tapped and attacking token that's a copy of it." The cards as they are now, after the exile
 * before it (CR 608.2c): each face-up card this ability's controller owns in exile with one or more of these counters on it
 * that is a creature card by its printed characteristics (a face-down card has none, CR 406.3, 708.2), whatever exiled it.
 * Each token copies exactly what's printed on the card (CR 707.2, rulings: X as 0, nothing of what the card was before).
 * What each one attacks is chosen as it's created, a player, planeswalker or battle, not necessarily what Altaïr attacks
 * (CR 508.4, rulings), asked for each token (a token doubler's extra ones too) before they're all created at once; they
 * were never declared as attackers, so "whenever ... attacks" abilities don't trigger (rulings). Outside its controller's
 * combat they're only tapped. The tokens made are ResolvingState.created, for the delayed exile after it.
 */
export function runTokenCopiesOfExiledWithCounterEffect(s: GameState, e: Extract<Effect, { type: "tokenCopiesOfExiledWithCounter" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const me = ctx.controller;
  const cards = player(s, me)
    .exile.map((id) => obj(s, id))
    .filter((o) => o.zone === "exile" && !o.faceDown && !o.hiddenExile && !o.isToken && (o.counters[e.counter] ?? 0) > 0 && printedMatches(e.filter, s.cards[o.cardId]!));
  if (s.resolving) s.resolving.created = [];
  if (!cards.length) {
    log(s, `${src}: no ${e.filter.text} you own is in exile with a ${e.counter} counter on it, so no token is created.`);
    return;
  }
  const bases = cards.map((o) => copiableDef(s, o));
  // What each token attacks, in the order of the cards, `k` for each (token doublers, CR 614.1a).
  const choices = attackChoices(s, me, ctx.sourceId);
  const counts = bases.map((b) => tokenCopyBatch(s, me, b));
  const total = counts.reduce((a, b) => a + b, 0);
  const sc = (s.resolving!.scratch ??= {});
  const picks: string[] = [...(sc.attackPicks ?? [])];
  if (choices.length > 1) {
    if (sc.attackWhom !== undefined) takeAttackWhom(sc, picks, total);
    sc.attackPicks = picks;
    if (picks.length < total) {
      let i = 0;
      let seen = counts[0]!;
      while (picks.length >= seen) seen += counts[++i]!;
      const which = total > 1 ? ` (${picks.length + 1} of ${total})` : "";
      s.pending = { kind: "chooseOption", player: me, source: src, what: "attackWhom", ...attackWhomOptions(choices, total - picks.length), prompt: `choose what the token copy of ${bases[i]!.name} attacks${which}` };
      return "paused";
    }
    sc.attackPicks = undefined;
  }
  const at = picks.flatMap((k) => choices.filter((a) => a.key === k));
  let from = 0;
  if (s.resolving) s.resolving.created = [];
  enterTogether(s, () => {
    bases.forEach((base, i) => {
      const attackAt = at.slice(from, from + counts[i]!);
      from += counts[i]!;
      tokenCopies(s, me, base, 1, ctx, { tapped: true, attacking: true, ...(attackAt.length ? { attackAt } : {}) });
    });
  });
}

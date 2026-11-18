// Round 408's effects: Valki, God of Lies's enters trigger (a creature card from each opponent's revealed hand exiled until
// it leaves) and its "{X}: Choose a creature card exiled with ~ with mana value X. ~ becomes a copy of that card."
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { addCopyEffect, copyKey } from "../copies";
import { defMv, restingDef } from "../faces";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { apnap, objects, players, runEffect } from "./resolve";
import { printedMatches } from "./targeting";

/**
 * Valki: "For each opponent, exile a creature card they revealed this way until ~ leaves the battlefield." One opponent at a
 * time, from the active player in turn order (CR 101.4), the card chosen by this ability's controller among the creature
 * cards in that opponent's hand (the whole hand was just revealed); none if there's none. If Valki has already left, no card
 * is exiled (CR 610.3c, rulings). Each card is linked to Valki (CR 607.2a) and returns to its owner's hand when Valki leaves
 * (CR 610.3).
 */
export function runEachOpponentTakesEffect(s: GameState, e: Extract<Effect, { type: "eachOpponentTakes" }>, ctx: ResolveCtx): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const who = apnap(s, players(s, { ref: "eachOpponent" }, ctx));
  for (let i = sc.eachTakeAt ?? 0; i < who.length; i++) {
    sc.eachTakeAt = i;
    const got = runEffect(s, e.take, { ...ctx, eachOne: who[i]! });
    if (got === "paused") return "paused";
    sc.found = undefined;
  }
  sc.eachTakeAt = undefined;
}

/**
 * Valki: "Choose a creature card exiled with ~ with mana value X. ~ becomes a copy of that card." The card is chosen as this
 * resolves (rulings), among the creature cards its enters ability exiled (linked, CR 607.2a) still in exile as those objects
 * (CR 400.7) whose mana value is the X paid (CR 107.3m; a modal double-faced card's front face's in exile, rulings). Valki
 * becomes a copy of it as printed (CR 707.2; a double-faced card's front face, CR 712.8a), with no end (CR 611.2a): it keeps
 * effects that applied to it before (CR 613), loses this ability (rulings), and nothing enters or leaves. With no such card,
 * nothing happens (rulings); nor if Valki isn't on the battlefield any more.
 */
export function runBecomeCopyOfLinkedXEffect(s: GameState, e: Extract<Effect, { type: "becomeCopyOfLinkedX" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const host = objects(s, { ref: "self" }, ctx).find((o) => o.zone === "battlefield");
  const x = ctx.x ?? 0;
  const cards = objects(s, { ref: "linkedCard" }, ctx).filter((o) => o.zone === "exile" && !o.isToken && printedMatches(e.filter, restingDef(s.cards[o.cardId]!)) && defMv(restingDef(s.cards[o.cardId]!)) === x);
  if (!host || !cards.length) {
    sc.aegisCopy = undefined;
    if (host) log(s, `There's no creature card with mana value ${x} exiled with ${src}, so nothing happens.`);
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
        prompt: `choose a creature card with mana value ${x} exiled with ${src} for ${defOf(s, host).name} to become a copy of.`,
      };
      return "paused";
    }
    card = cards.find((o) => o.id === sc.aegisCopy);
    sc.aegisCopy = undefined;
    if (!card) return;
  }
  const base = restingDef(s.cards[card.cardId]!);
  const was = defOf(s, host).name;
  addCopyEffect(s, host, copyKey(s, base));
  log(s, `${was} becomes a copy of ${base.name} (${src}).`);
}

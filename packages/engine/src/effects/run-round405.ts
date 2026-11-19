// Round 405's effects: a permanent becoming a copy, until end of turn, of a card chosen from among the cards exiled with it
// (Lazav, Wearer of Faces) or the cards that just left its controller's graveyard (Spirit of Resilience).
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { addCopyEffect, copyKey } from "../copies";
import { restingDef } from "../faces";
import { log } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { objects } from "./resolve";
import { printedMatches } from "./targeting";

/**
 * "You may have ~ become a copy of a creature card exiled with it until end of turn" (Lazav, Wearer of Faces: the cards its
 * attack trigger exiled, linked, CR 607.2a, still in exile) or "of an artifact or creature card from among those cards"
 * (Spirit of Resilience: the cards that left its controller's graveyard in the event, CR 603.2c, each still that object
 * wherever it went, CR 400.7). The card is copied exactly as printed (CR 707.2, rulings: nothing about the object it was;
 * the front face of a double-faced card, CR 712.8a), and judged artifact or creature by that. Chosen as this resolves, or
 * none ("you may"); it neither enters nor leaves (rulings), so no enters or leaves abilities trigger. Nothing if the
 * permanent isn't on the battlefield any more.
 */
export function runBecomeCopyOfAmongEffect(s: GameState, e: Extract<Effect, { type: "becomeCopyOfAmong" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const host = objects(s, e.what, ctx).find((o) => o.zone === "battlefield");
  const pool = objects(s, e.from === "linked" ? { ref: "linkedCard" } : { ref: "eventGroup" }, ctx);
  const cards = pool.filter((o) => !o.isToken && !o.spellCopy && (e.from !== "linked" || o.zone === "exile") && (!e.inExile || o.zone === "exile") && printedMatches(e.filter, restingDef(s.cards[o.cardId]!)));
  if (!host || !cards.length) {
    sc.copyAmong = undefined;
    if (host) log(s, `${src}: there's no ${e.filter.text} to copy.`);
    return;
  }
  if (sc.copyAmong === undefined) {
    sc.copyAmong = "";
    sc.copyAmongHost = host.id;
    s.pending = {
      kind: "chooseOption",
      player: ctx.controller,
      source: src,
      what: "copyAmong",
      options: [...cards.map((o) => o.id), "none"],
      labels: [...cards.map((o) => restingDef(s.cards[o.cardId]!).name), `Don't copy (stay ${defOf(s, host).name})`],
      prompt: `you may have ${defOf(s, host).name} become a copy of ${/^[aeiou]/.test(e.filter.text) ? "an" : "a"} ${e.filter.text}${e.except?.keywords?.length ? `, except it has ${e.except.keywords.join(" and ").toLowerCase()},` : ""} until end of turn.`,
    };
    return "paused";
  }
  const card = cards.find((o) => o.id === sc.copyAmong);
  sc.copyAmong = undefined;
  sc.copyAmongHost = undefined;
  if (!card) {
    log(s, `${defOf(s, host).name} doesn't become a copy of anything (${src}).`);
    return;
  }
  const base = restingDef(s.cards[card.cardId]!);
  const was = defOf(s, host).name;
  // Kaya, Spirits' Justice (round 425): "except it has flying" (CR 707.9a).
  addCopyEffect(s, host, copyKey(s, base, e.except), "endOfTurn");
  log(s, `${was} becomes a copy of ${base.name}${e.except?.keywords?.length ? `, except it has ${e.except.keywords.join(" and ").toLowerCase()},` : ""} until end of turn.`);
}

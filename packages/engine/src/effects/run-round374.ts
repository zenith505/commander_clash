// Round 374's effects: an opponent splitting the two cards a cost exiled between the bottom of your library and the
// battlefield (Coin of Fate), and a target card and the sacrificed card returned at your next upkeep (Rescue from the
// Underworld), and creature cards chosen in an opponent's graveyard and in yours, returned together (Dawnbreak Reclaimer).
import type { Effect } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log, obj, opponents, player } from "../game";
import type { GameState } from "../types";
import type { ResolveCtx } from "./resolve";
import { objects, runEffect } from "./resolve";
import { chooseAnOpponent, opponentPicks, toBottom } from "./run-library";
import { addDelayed } from "./run-spells";

/**
 * Coin of Fate: "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return
 * the other to the battlefield tapped." The cards its cost exiled, still in exile and still those objects (CR 400.7);
 * its controller chooses the opponent, who chooses as it resolves (CR 608.2d). With only one left in exile, that one is
 * the card the opponent chooses, and none returns. The other enters tapped under its controller's control, who returns
 * it (CR 110.2).
 */
export function runOpponentSplitsCostExiledEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (sc.splitDone) return;
  const cards = objects(s, { ref: "costExiled" }, ctx).map((o) => o.id);
  if (!cards.length) return;
  const me = player(s, ctx.controller);
  const got = opponentPicks(s, ctx, src, undefined, ctx.controller, cards, cards, 1, { zone: "libraryTop" }, { zone: "battlefield", tapped: true }, `on the bottom of ${me.name}'s library`);
  if (got === "paused") return "paused";
  sc.splitDone = true;
  const bottom = got.filter((id) => obj(s, id).zone === "exile");
  if (bottom.length) {
    log(s, `${defOf(s, obj(s, bottom[0]!)).name} goes on the bottom of ${me.name}'s library (${src}).`);
    if (toBottom(s, me.id, bottom, src, false) === "paused") return "paused";
  }
  // The other: the cost's cards still in exile now.
  return runEffect(s, { type: "putOntoBattlefield", what: { ref: "costExiled" }, tapped: true }, ctx);
}

/**
 * Rescue from the Underworld: one delayed trigger at the beginning of your next upkeep (CR 603.7) that returns the target
 * card, as it is now in your graveyard, and the card the sacrificed creature became, in whatever public zone it went to
 * (rulings; a token is gone, CR 111.7), both at once under your control. Each returns only if it's still that object
 * then (CR 400.7, rulings: one that left the graveyard doesn't return). A commander moved to the command zone by the
 * state-based action is a new object there (CR 903.9a, 400.7), so it doesn't return either.
 */
export function runReturnWithSacrificedEffect(s: GameState, e: Extract<Effect, { type: "returnWithSacrificedAtYourNextUpkeep" }>, ctx: ResolveCtx, src: string): void {
  const cards: { id: string; zc: number }[] = [];
  for (const o of objects(s, e.what, ctx)) if (o.zone === "graveyard") cards.push({ id: o.id, zc: o.zoneChanges ?? 0 });
  for (const l of ctx.sacrificed ?? []) if (l.cardIn && !cards.some((c) => c.id === l.cardIn!.id)) cards.push(l.cardIn);
  const live = objects(s, { ref: "remembered", cards }, ctx);
  if (!live.length) return;
  const item = s.resolving?.item;
  const self = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const subject = self ?? live[0]!;
  const names = live.map((o) => defOf(s, o).name).join(" and ");
  addDelayed(s, "yourNextUpkeep", ctx.controller, subject, { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "remembered", cards } }], text: `Return ${names} to the battlefield under your control.` }, self ? cardIdOf(self) : cardIdOf(live[0]!));
  log(s, `${names} will return to the battlefield at the beginning of ${player(s, ctx.controller).name}'s next upkeep (${src}).`);
}

/**
 * Dawnbreak Reclaimer: you choose a creature card in an opponent's graveyard, which you must do if any opponent has one
 * (rulings: not an opponent with none instead); then that card's owner chooses a creature card in your graveyard. With no
 * creature card in any opponent's graveyard, you choose the opponent who chooses (rulings). Neither is targeted (CR
 * 115.1), so both are chosen as it resolves (CR 608.2d). Then you may return the chosen cards, all or none (one choice
 * for "those cards"), at once, each under its owner's control (CR 110.2a).
 */
export function runSwapFromGraveyardsEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const st = (sc.swap ??= {});
  const me = player(s, ctx.controller);
  const creature = (id: string) => defOf(s, obj(s, id)).types.includes("Creature");
  const taken = () => {
    const f = sc.found?.[0];
    sc.found = undefined;
    st.asking = undefined;
    return f ? { id: f, zc: obj(s, f).zoneChanges ?? 0 } : ("none" as const);
  };
  if (st.theirs === undefined) {
    if (st.asking === "theirs") st.theirs = taken();
    else {
      const cards = opponents(s, me.id).flatMap((pid) => player(s, pid).graveyard).filter(creature);
      if (cards.length) {
        st.asking = "theirs";
        s.pending = { kind: "searchLibrary", player: me.id, source: src, what: "a creature card in an opponent's graveyard", cards, min: 1, max: 1, anyGraveyard: true, dig: { looked: cards, to: `(you may return it to the battlefield under its owner's control)`, rest: "stay in their graveyards" }, forPlayer: me.id, helps: true };
        return "paused";
      }
      st.theirs = "none";
    }
  }
  if (st.chooser === undefined) {
    if (st.theirs !== "none") st.chooser = obj(s, st.theirs.id).owner;
    else {
      const opp = chooseAnOpponent(s, ctx, src, "choose an opponent to choose a creature card in your graveyard");
      if (opp === "paused") return "paused";
      if (opp === undefined) return;
      st.chooser = opp;
    }
  }
  if (st.yours === undefined) {
    if (st.asking === "yours") st.yours = taken();
    else {
      const cards = me.graveyard.filter(creature);
      if (cards.length && !player(s, st.chooser).lost) {
        st.asking = "yours";
        s.pending = { kind: "searchLibrary", player: st.chooser, source: src, what: `a creature card in ${me.name}'s graveyard`, cards, min: 1, max: 1, dig: { looked: cards, to: `(${me.name} may return it to the battlefield)`, rest: "stay in the graveyard" }, forPlayer: me.id, helps: true };
        return "paused";
      }
      st.yours = "none";
    }
  }
  const cards = [st.theirs, st.yours].flatMap((c) => (c && c !== "none" ? [c] : []));
  const live = objects(s, { ref: "remembered", cards }, ctx).filter((o) => o.zone === "graveyard");
  if (!live.length) return;
  const names = live.map((o) => defOf(s, o).name).join(" and ");
  if (sc.may === undefined) {
    log(s, `${me.name} chooses ${names} (${src}).`);
    s.pending = { kind: "chooseMay", player: me.id, source: src, prompt: `return ${names} to the battlefield under ${live.length === 1 ? "its owner's" : "their owners'"} control` };
    return "paused";
  }
  const yes = sc.may;
  sc.may = undefined;
  if (!yes) return void log(s, `${me.name} doesn't return ${names} (${src}).`);
  return runEffect(s, { type: "putOntoBattlefield", what: { ref: "remembered", cards: live.map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 })) }, owner: true }, ctx);
}

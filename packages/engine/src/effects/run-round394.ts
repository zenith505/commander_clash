// Round 394's effects: tokens created under another player's control (Crafty Cutpurse), one of the attacking creatures
// that died returned (Rinoa, Angel Wing), and a Curse attached to you moved to an opponent (Lynde, Cheerful Tormentor).
import type { Effect } from "../abilities";
import { defOf, isPermanentCard } from "../cards";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { log, moveObject, obj, opponents, player } from "../game";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { attachToPlayer, canAttachTo } from "./run-permanents";

/**
 * Crafty Cutpurse: "each token that would be created under an opponent's control this turn is created under your control
 * instead": a replacement effect from now until the turn ends (CR 611.2a; it doesn't change tokens already there,
 * rulings), applied by counters.ts tokenMaker.
 */
export function runStealTokensEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  ((s.turnLog ??= {}).tokenSteals ??= []).push({ player: ctx.controller, source: src });
  log(s, `${src}: tokens that would be created under ${player(s, ctx.controller).name}'s opponents' control this turn are created under their control instead.`);
}

/** The prompt for Rinoa's choice (bot.ts, App.tsx). */
export const RETURN_ONE_PROMPT = "you may return one of them";

/**
 * Rinoa, Angel Wing: "Whenever one or more attacking creatures you control die, you may return one of them to the
 * battlefield tapped under its owner's control with a flying counter on it. Do this only once each turn." Them: the cards
 * those creatures became in their owners' graveyards, while they're still there (CR 400.7; a token has ceased to exist,
 * CR 111.7, 704.5d), Rinoa too if it died with them (rulings). Choosing one is doing it (CR 603.2h): the ability then
 * doesn't trigger again this turn (triggers.ts). The card returns under its owner's control (CR 110.2a), tapped, with the
 * counter (CR 122.6, 614.1c); an Aura card can't be among them (only creatures die).
 */
export function runReturnOneOfThemEffect(s: GameState, e: Extract<Effect, { type: "returnOneOfThem" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const them = (): ObjectId[] =>
    (ctx.event?.group ?? []).flatMap((g) => {
      const o = s.objects[g.id];
      return o && o.zone === "graveyard" && (o.zoneChanges ?? 0) === g.zc && !o.isToken && isPermanentCard(defOf(s, o)) ? [o.id] : [];
    });
  if (!sc.found) {
    const cards = them();
    if (!cards.length) return;
    const counters = Object.entries(e.counters).map(([k, n]) => `${n === 1 ? "a" : n} ${k} counter${n === 1 ? "" : "s"}`).join(" and ");
    s.pending = { kind: "searchLibrary", player: ctx.controller, source: src, what: `one of the attacking creature cards that died (tapped, with ${counters} on it)`, cards, min: 0, max: 1, fromGraveyard: "battlefield", anyGraveyard: true, owners: true };
    return "paused";
  }
  const id = sc.found.find((x) => them().includes(x));
  sc.found = undefined;
  if (!id) {
    log(s, `${player(s, ctx.controller).name} returns none of them (${src}).`);
    return;
  }
  // Done this turn (CR 603.2h), for this object of the source.
  const source = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (source) (source.triggeredThisTurn ??= []).push(`${ctx.sourceZc ?? source.zoneChanges ?? 0}|do:returnOneOfThem`);
  const o = obj(s, id);
  log(s, `${src} returns ${defOf(s, o).name} to the battlefield tapped under ${player(s, o.owner).name}'s control with ${Object.entries(e.counters).map(([k, n]) => `${n === 1 ? "a" : n} ${k} counter${n === 1 ? "" : "s"}`).join(" and ")} on it.`);
  moveObject(s, id, "battlefield", { controller: o.owner, tapped: true, counters: { ...e.counters } });
  invalidateCharacteristics(s);
}

/** The Curses attached to this player that could be attached to one of their opponents, with those opponents. */
export function curseMoves(s: GameState, pid: number): { id: ObjectId; to: number }[] {
  const out: { id: ObjectId; to: number }[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.attachedToPlayer !== pid || !characteristics(s, o).subtypes.includes("Curse")) continue;
    for (const q of opponents(s, pid)) if (!player(s, q).lost && canAttachTo(s, o, q)) out.push({ id, to: q });
  }
  return out;
}

/**
 * Lynde, Cheerful Tormentor: "At the beginning of your upkeep, you may attach a Curse attached to you to one of your
 * opponents. If you do, draw two cards." Any Curse attached to you, whoever controls it (its controller stays the same,
 * CR 701.3a); not targeted, so hexproof doesn't matter (rulings), but only to an opponent it could enchant (CR 701.3b;
 * not one with protection from it, 702.16c). One question: which Curse to which opponent, or none. "If you do": it moved.
 */
export function runMoveCurseEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  r.did = false;
  const moves = curseMoves(s, ctx.controller);
  const key = (m: { id: ObjectId; to: number }) => `${m.id}>${m.to}`;
  if (sc.curseMove === undefined) {
    if (!moves.length) return;
    sc.curseMove = "";
    s.pending = {
      kind: "chooseOption",
      player: ctx.controller,
      source: src,
      what: "curseMove",
      options: [...moves.map(key), "none"],
      labels: [...moves.map((m) => `Attach ${characteristics(s, obj(s, m.id)).name} to ${player(s, m.to).name}`), "Don't attach a Curse"],
      prompt: "you may attach a Curse attached to you to one of your opponents. If you do, draw two cards.",
    };
    return "paused";
  }
  const pick = moves.find((m) => key(m) === sc.curseMove);
  sc.curseMove = undefined;
  if (!pick) return;
  const o = obj(s, pick.id);
  attachToPlayer(s, o, pick.to);
  r.did = o.attachedToPlayer === pick.to && controllerOf(s, o) !== undefined;
}

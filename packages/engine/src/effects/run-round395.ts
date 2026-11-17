// Round 395's effects: cards each opponent exiles until a nonland card, linked to the source (Krang & Shredder), and each
// opponent's top card revealed and matched against the spell that triggered it (Gandalf, Westward Voyager).
import type { Effect } from "../abilities";
import { defOf, isType } from "../cards";
import { characteristics } from "../layers";
import { log, moveObject, obj, player } from "../game";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { players } from "./resolve";

/**
 * Krang & Shredder: "each opponent exiles cards from the top of their library until they exile a nonland card": each in
 * turn order, every card exiled, lands too, and all of them "exiled with ~" (CR 607.2a), linked to the source as the object
 * it is (or last was) as this resolves. With no nonland card, the whole library is exiled (rulings on similar cards).
 */
export function runExileUntilNonlandLinkedEffect(s: GameState, e: Extract<Effect, { type: "exileUntilNonlandLinked" }>, ctx: ResolveCtx, src: string): void {
  for (const pid of players(s, e.who, ctx)) {
    const p = player(s, pid);
    const at = p.library.findIndex((id) => !isType(defOf(s, obj(s, id)), "Land"));
    const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
    const names: string[] = [];
    for (const id of seen) {
      moveObject(s, id, "exile");
      const o = obj(s, id);
      if (o.zone !== "exile") continue;
      names.push(defOf(s, o).name);
      if (ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id, zc: o.zoneChanges ?? 0 });
    }
    log(s, `${src}: ${p.name} exiles ${names.length} card${names.length === 1 ? "" : "s"} from the top of their library${names.length ? ` (${names.join(", ")})` : ""}${at < 0 ? ", finding no nonland card" : ""}.`);
  }
}

/** The card types of the spell that triggered this (ctx.cause), as it is on the stack or last was there (CR 113.7a). */
function causeSpellTypes(s: GameState, ctx: ResolveCtx): string[] {
  const item = ctx.cause !== undefined ? (s.stack.find((x) => x.id === ctx.cause && x.kind === "spell") ?? s.castItems?.[ctx.cause]) : undefined;
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return [];
  return o.zone === "stack" ? [...characteristics(s, o).types] : [...defOf(s, o).types];
}

/**
 * Gandalf, Westward Voyager: "each opponent reveals the top card of their library. If any of those cards shares a card type
 * with that spell": each opponent with a card in their library reveals it (it stays there); `did` is whether any of them has
 * a card type the spell has (CR 205.2a), one copy however many do (rulings).
 */
export function runRevealTopsShareTypeEffect(s: GameState, ctx: ResolveCtx, src: string): void {
  const types = causeSpellTypes(s, ctx);
  const revealed: ObjectId[] = [];
  for (const pid of players(s, { ref: "eachOpponent" }, ctx)) {
    const p = player(s, pid);
    const top = p.library[0];
    if (!top) {
      log(s, `${src}: ${p.name} has no card in their library to reveal.`);
      continue;
    }
    revealed.push(top);
    log(s, `${src}: ${p.name} reveals ${defOf(s, obj(s, top)).name} from the top of their library.`);
  }
  const shares = revealed.some((id) => defOf(s, obj(s, id)).types.some((t) => types.includes(t)));
  s.resolving!.did = shares;
  log(s, shares ? `${src}: a revealed card shares a card type with the spell.` : `${src}: no revealed card shares a card type with the spell.`);
}

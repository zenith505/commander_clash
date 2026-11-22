// Round 445's effects: Flamewar, Brash Veteran's cards with intel counters back to hand, Cosima, God of the Voyage's
// ability gained in exile and its voyage, and The Omenkeel's land plays from exile.
import type { Effect } from "../abilities";
import { defOf } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameState } from "../types";
import { amountNow, players, runEffect, type ResolveCtx } from "./resolve";

/**
 * Flamewar, Brash Veteran (Effect exiledWithCounterToHand): every card this ability's controller owns in exile with one or
 * more `counter` counters on it, face down ones too (they were exiled face down with the counters, CR 406.3, 122.1), put
 * into their hand at once. A face-down card's name isn't told to the other players (it goes to a hidden zone).
 */
export function runExiledWithCounterToHandEffect(s: GameState, e: Extract<Effect, { type: "exiledWithCounterToHand" }>, ctx: ResolveCtx, src: string): void {
  const p = player(s, ctx.controller);
  const ids = p.exile.filter((id) => {
    const o = obj(s, id);
    return o.zone === "exile" && o.owner === p.id && !o.isToken && (o.counters[e.counter] ?? 0) > 0;
  });
  if (!ids.length) {
    log(s, `${src}: ${p.name} owns no card in exile with ${/^[aeiou]/.test(e.counter) ? "an" : "a"} ${e.counter} counter on it.`);
    return;
  }
  const hidden = ids.filter((id) => !!obj(s, id).faceDown || !!obj(s, id).hiddenExile);
  const shown = ids.filter((id) => !hidden.includes(id)).map((id) => defOf(s, obj(s, id)).name);
  for (const id of ids) moveObject(s, id, "hand");
  invalidateCharacteristics(s);
  const parts = [...shown, ...(hidden.length ? [hidden.length === 1 ? "a face-down card" : `${hidden.length} face-down cards`] : [])];
  log(s, `${p.name} puts ${parts.join(", ")} with ${e.counter} counters from exile into their hand with ${src}.`);
  if (hidden.length) log(s, `You put ${hidden.map((id) => defOf(s, obj(s, id)).name).join(", ")} into your hand with ${src}.`, p.id);
}

/**
 * Cosima, God of the Voyage (Effect gainInExile): the source, which the exile just before moved to exile (setsDid, CR
 * 400.7j), gains the ability there for as long as it remains that object (CR 611.2c, 400.7; GameObject.gainedInExile).
 */
export function runGainInExileEffect(s: GameState, e: Extract<Effect, { type: "gainInExile" }>, ctx: ResolveCtx, src: string): void {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (!o || o.zone !== "exile" || o.faceDown || (o.zoneChanges ?? 0) !== (ctx.sourceZc ?? 0) + 1) return;
  const zc = o.zoneChanges ?? 0;
  o.gainedInExile = { zc, texts: [...(o.gainedInExile?.zc === zc ? o.gainedInExile.texts : []), e.text] };
  invalidateCharacteristics(s);
  log(s, `${src}: ${defOf(s, o).name} gains "${e.text.replaceAll("~", defOf(s, o).name)}" in exile.`);
}

/**
 * Cosima's gained ability (Effect exiledSelfCounterOrReturn): the source, still that object in its owner's exile (CR 400.7;
 * the intervening if, CR 603.4). Its controller may put a `counter` counter on it there; if they don't, it returns to the
 * battlefield under their control with as many `plus` counters as it had `counter` counters (CR 122.6: it enters with
 * them), and then they draw that many cards (rulings: X is counted in exile; with none it returns with none, no draw).
 * Asked once (scratch `may`); the draw is a step of its own, so a paused draw goes on where it was.
 */
export function runExiledSelfCounterOrReturnEffect(s: GameState, e: Extract<Effect, { type: "exiledSelfCounterOrReturn" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  const st = (sc.voyage ??= { step: 0, x: 0 });
  if (st.step === 0) {
    const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    if (!o || o.zone !== "exile" || o.faceDown || (ctx.sourceZc !== undefined && (o.zoneChanges ?? 0) !== ctx.sourceZc)) {
      sc.voyage = undefined;
      log(s, `${src} is no longer exiled, so nothing happens.`);
      return;
    }
    const name = defOf(s, o).name;
    const n = o.counters[e.counter] ?? 0;
    if (sc.may === undefined) {
      s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `put a ${e.counter} counter on ${name}`, source: src, card: o.id, otherwise: `If you don't, ${name} returns to the battlefield with ${n} ${e.plus} counter${n === 1 ? "" : "s"} and you draw ${n} card${n === 1 ? "" : "s"}.` };
      return "paused";
    }
    const yes = sc.may;
    sc.may = undefined;
    if (yes) {
      o.counters[e.counter] = n + 1;
      sc.voyage = undefined;
      log(s, `${player(s, ctx.controller).name} puts a ${e.counter} counter on ${name} in exile (${n + 1}).`);
      return;
    }
    moveObject(s, o.id, "battlefield", { controller: o.owner, ...(n ? { counters: { [e.plus]: n } } : {}) });
    invalidateCharacteristics(s);
    log(s, `${name} returns to the battlefield${n ? ` with ${n} ${e.plus} counter${n === 1 ? "" : "s"}` : ""}.`);
    st.step = 1;
    st.x = n;
  }
  if (st.step === 1 && st.x > 0) {
    st.step = 2;
    if (runEffect(s, { type: "draw", who: { ref: "you" }, n: st.x }, ctx) === "paused") return "paused";
  }
  sc.voyage = undefined;
}

/**
 * The Omenkeel (Effect exileTopLandsPlayable): each `who` player exiles the top `n` cards of their library (all of it with
 * fewer); this ability's controller may play the land cards among them for as long as they remain exiled (MayPlay
 * landOnly, until "exiled": whoever controls The Omenkeel later, rulings), only as a land play of theirs (CR 305.2).
 */
export function runExileTopLandsPlayableEffect(s: GameState, e: Extract<Effect, { type: "exileTopLandsPlayable" }>, ctx: ResolveCtx, src: string): void {
  const me = ctx.controller;
  for (const pid of players(s, e.who, ctx)) {
    const q = player(s, pid);
    const ids = q.library.slice(0, Math.max(0, amountNow(s, e.n, ctx)));
    if (!ids.length) continue;
    for (const id of ids) {
      moveObject(s, id, "exile");
      const o = obj(s, id);
      // Only the cards with a land face (a modal double-faced card's back too, rulings) get the permission.
      const card = s.cards[o.cardId];
      if (o.zone !== "exile" || !(card?.types.includes("Land") || card?.faces?.some((f) => f.types.includes("Land")))) continue;
      o.mayPlay = { player: me, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, landOnly: true };
    }
    invalidateCharacteristics(s);
    log(s, `${q.name} exiles ${ids.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library with ${src}; ${player(s, me).name} may play the lands among them for as long as they remain exiled.`);
  }
}

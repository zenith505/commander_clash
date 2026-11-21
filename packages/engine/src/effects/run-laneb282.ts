// Lane B round B282's effects: Ertai's Meddling (meddleExile, called from counterSpell's exileSpell; meddleReturn, its
// delayed triggered ability) and Shared Fate's draw replacement (sharedFateInstead, from game.ts applyDrawReplacement).
import type { Effect } from "../abilities";
import { abilitiesOf, defOf } from "../cards";
import { countersRemoved, removableCounters } from "../counters";
import { setFace } from "../faces";
import { describeTargets, log, moveObject, nameOf, obj, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import type { GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import type { ResolveCtx } from "./resolve";
import { counterOnStack } from "./run-spells";
import { fireEvent } from "./triggers";

type CounterSpell = Extract<Effect, { type: "counterSpell" }>;
type B282Effect = Extract<Effect, { type: "meddleReturn" }>;

/** The "if the [cost] was paid, exile this card instead ... any time it would leave the stack" ways (CR 702.34a, 702.180a): a decision a copy copies (CR 707.10, rulings on Ertai's Meddling). */
const PAID_EXILE_WAYS = ["flashback", "grantedFlashback", "harmonize"];

/**
 * Ertai's Meddling: "Target spell's controller exiles it with X delay counters on it." Not a counter, so a spell that can't
 * be countered is exiled too (CR 101.2 doesn't apply, CR 701.6a); a copy of a spell ceases to exist (CR 707.10a, rulings)
 * and gets nothing. The card it was, if it's still that object in exile (a commander its owner moves to the command zone
 * isn't, CR 903.9a), gets its counters, and with `meddleReturn` a delayed triggered ability controlled by this spell's
 * controller (CR 603.7d) at the beginning of each of that player's upkeeps from the next one on, with the spell as it was on
 * the stack noted (GameState.meddled).
 */
export function meddleExile(s: GameState, e: CounterSpell, ctx: ResolveCtx, src: string): void {
  const t = ctx.targets[e.index];
  if (!ctx.legal[e.index] || t?.kind !== "stack") return;
  const item = s.stack.find((x) => x.id === t.id);
  if (!item || item.kind !== "spell") return;
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  // The spell as it is now, before it leaves the stack (its choices are what a copy copies, CR 707.10).
  const snap = o && !o.spellCopy && !o.isToken ? { item: structuredClone(item), card: structuredClone(o) } : undefined;
  const who = item.controller;
  counterOnStack(s, ctx, t.id, src, undefined, "exile", true);
  if (!o || !snap || s.objects[o.id] !== o || o.zone !== "exile" || s.stack.some((x) => x.id === t.id)) return;
  // "X can't be 0" (CR 107.3b), so it's at least 1 when it was cast; a copy of it cast for X = 0 can't be made (rulings).
  const n = Math.max(0, ctx.x ?? 0);
  if (n > 0) {
    o.counters.delay = (o.counters.delay ?? 0) + n;
    invalidateCharacteristics(s);
  }
  log(s, `${defOf(s, o).name} is exiled with ${n} delay counter${n === 1 ? "" : "s"} on it.`);
  if (!e.meddleReturn) return;
  const zc = o.zoneChanges ?? 0;
  (s.meddled ??= []).push({ id: o.id, zc, item: snap.item, card: snap.card });
  (s.delayed ??= []).push({
    when: "eachPlayersUpkeepWhileExiled",
    controller: ctx.controller,
    player: who,
    event: { player: who },
    sourceCardId: ctx.sourceDef.oracleId,
    subject: { id: o.id, zc },
    body: { targets: [], effects: [{ type: "meddleReturn" }], text: "If that card is exiled, remove a delay counter from it. If the card has no delay counters on it, the player puts it onto the stack as a copy of the original spell." },
    turn: s.turn,
    step: s.step,
  });
}

/** The noted spell of an exiled card Ertai's Meddling exiled, as that object (CR 400.7). */
const meddledAt = (s: GameState, id: ObjectId, zc: number) => (s.meddled ?? []).findIndex((m) => m.id === id && m.zc === zc);

/** Forget the noted spells of cards that aren't those objects in exile any more. */
export function pruneMeddled(s: GameState): void {
  if (!s.meddled) return;
  s.meddled = s.meddled.filter((m) => s.objects[m.id]?.zone === "exile" && (s.objects[m.id]!.zoneChanges ?? 0) === m.zc);
  if (!s.meddled.length) s.meddled = undefined;
}

export function runLaneB282Effect(s: GameState, e: B282Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "meddleReturn": {
      // "If that card is exiled" again as it resolves (CR 603.4): that object (CR 400.7).
      const sub = ctx.subject;
      const o = sub ? s.objects[sub.id] : undefined;
      if (!sub || !o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== sub.zc) return;
      const who = ctx.event?.player;
      if (who === undefined || !s.players[who] || player(s, who).lost) return;
      // "Remove a delay counter from it": one, if it has one that can be removed.
      const had = o.counters.delay ?? 0;
      if (had > 0 && removableCounters(s, o, "delay") > 0) {
        o.counters.delay = had - 1;
        invalidateCharacteristics(s);
        log(s, `${defOf(s, o).name} loses a delay counter (${src}).`);
        countersRemoved(s, o, "delay", 1);
        if (had === 1) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "delay" });
      }
      // "If the card has no delay counters on it" (checked now, as this part of the resolution happens).
      if ((o.counters.delay ?? 0) > 0) return;
      const at = meddledAt(s, o.id, sub.zc);
      if (at < 0) return;
      const [m] = s.meddled!.splice(at, 1);
      if (!s.meddled!.length) s.meddled = undefined;
      putMeddled(s, o, m!.item, m!.card, who);
      // Nothing more to wait for.
      s.delayed = s.delayed?.filter((d) => !(d.when === "eachPlayersUpkeepWhileExiled" && d.subject.id === sub.id && d.subject.zc === sub.zc));
      return;
    }
  }
}

/**
 * "The player puts it onto the stack as a copy of the original spell": the card itself goes onto the stack under that
 * player's control (rulings), a spell with the original's copiable values and every decision made for it, its modes,
 * targets (the objects they were then, CR 400.7, so one that has changed zones since is illegal), X, and its additional and
 * alternative costs (CR 707.10), the flashback cost paid among them, so it's exiled as it leaves the stack (rulings). It
 * isn't cast (rulings, CR 707.10): nothing triggers on casting it, nothing counts it as cast, and a permanent it becomes
 * wasn't cast (GameObject.putNotCast). It's put onto the stack as a copy of a spell, so "cast or copy" abilities see it, and
 * its targets become its targets (ward). It can be countered (rulings).
 */
function putMeddled(s: GameState, o: GameObject, orig: StackItem, card: GameObject, who: PlayerId): void {
  const ex = player(s, o.owner).exile;
  const i = ex.indexOf(o.id);
  if (i >= 0) ex.splice(i, 1);
  // It keeps its zone-change count, as a cast spell does (counted as it leaves the stack).
  o.zone = "stack";
  o.controller = who;
  o.counters = {};
  o.putNotCast = true;
  o.castFrom = undefined;
  o.castBy = undefined;
  o.castVia = undefined;
  if (card.face !== undefined) setFace(s, o, card.face);
  // A face-down spell's copiable values are a 2/2 with no name, text or color (CR 708.2): it comes back as such, face down
  // (round B282's known gap: the rulings make it a face-up 2/2, which can't be turned face up).
  if (card.faceDown) o.faceDown = card.faceDown;
  // The decisions about its costs (as putSpellCopy copies them, CR 707.10).
  o.kicked = card.kickedByControl ? undefined : card.kicked;
  o.castAlt = card.castAlt;
  o.bestowed = card.bestowed;
  o.prototyped = card.prototyped;
  o.overloaded = card.overloaded;
  o.cleaved = card.cleaved;
  o.mutating = card.mutating;
  o.bargained = card.bargained;
  o.evidence = card.evidence;
  o.teamwork = card.teamwork;
  o.gift = card.gift;
  o.castType = card.castType;
  if (o.castType) o.chosen = { ...o.chosen, type: o.castType };
  if (card.exileIfLeaves === "stack" && PAID_EXILE_WAYS.includes(card.castVia ?? "")) o.exileIfLeaves = "stack";
  invalidateCharacteristics(s);
  // Its stack entry: the original's, but not cast (no storm count, no "cast during your main phase", no splice names) and
  // under this player's control from the start.
  const { castNth: _n, castInMain: _m, kickedByControl: byControl, spliced: _sp, controlTaken: _ct, controlledBefore: _cb, uncounterable: _u, ...rest } = structuredClone(orig);
  if (byControl) delete rest.kicked;
  const id = `s${s.nextId++}`;
  const name = orig.description;
  s.stack.push({ ...rest, id, kind: "spell", objectId: o.id, controller: who, copy: true, description: name });
  log(s, `${player(s, who).name} puts ${o.faceDown ? "a face-down spell" : nameOf(s, o.id)} onto the stack as a copy of the original spell${describeTargets(s, rest.targets ?? [])}.`);
  fireEvent(s, { type: "cast", stackId: id, controller: who, card: defOf(s, o), copy: true });
  fireEvent(s, { type: "targeted", stackId: id });
}

/**
 * Shared Fate: "If a player would draw a card, that player exiles the top card of one of their opponents' libraries face
 * down instead." (CR 614.1a), that opponent's chosen by the drawing player as the draw is replaced (drawReplacementChoices
 * offers one choice for each opponent and each Shared Fate, rulings: they choose which one replaces it). Not optional, and
 * never from their own library (rulings); an empty library exiles nothing. With its other ability, "Each player may look at
 * cards they exiled with ~, and they may play lands and cast spells from among those cards.": that player sees it (CR
 * 406.3) and may play it for as long as that Shared Fate stays on the battlefield as that object, paying its costs (rulings).
 */
export function sharedFateInstead(s: GameState, pid: PlayerId, src: ObjectId, from: PlayerId): void {
  const fate = obj(s, src);
  const name = nameOf(s, src);
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const q = player(s, from);
  const top = q.library[0];
  if (top === undefined) {
    log(s, `${player(s, pid).name} would exile the top card of ${q.name}'s library instead of drawing (${name}), but it's empty.`);
    return;
  }
  moveObject(s, top, "exile");
  const c = obj(s, top);
  if (c.zone !== "exile") return;
  const play = !!abilitiesOf(s, fate).sharedFatePlay;
  c.hiddenExile = { by: src, seen: play ? [pid] : [], label: "Face down", at: s.nextTimestamp };
  if (play) c.mayPlay = { player: pid, zc: c.zoneChanges ?? 0, until: "source", turn: s.turn, source: { id: src, zc: fate.zoneChanges ?? 0 } };
  log(s, `${player(s, pid).name} exiles the top card of ${q.name}'s library face down instead of drawing (${name}).`);
}

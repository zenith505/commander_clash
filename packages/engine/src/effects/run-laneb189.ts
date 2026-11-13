// Lane B round B189's effects.
import type { Effect } from "../abilities";
import { defOf, isType } from "../cards";
import { sameName } from "../faces";
import { log, moveObject, obj, player } from "../game";
import { characteristics, controllerOf } from "../layers";
import { shuffleLibrary } from "../rng";
import type { Color, GameObject, GameState, ObjectId, StackItem } from "../types";
import { apnap, players, type ResolveCtx } from "./resolve";
import { counterOnStack, offerGuileCasts } from "./run-spells";

type B189Effect = Extract<Effect, { type: "keepUpToShuffleRest" | "exileTopLandToHandElseCounter" | "faceUpLinkedCounterNamed" }>;

/**
 * Thought Prison: does a spell with these colors and this mana value share a color or the mana value with a card the
 * source's linked imprint ability exiled, still that card in exile (CR 607.2a, 400.7)? A colorless spell shares no color
 * (CR 105.2c).
 */
export function sharesColorOrMvWithLinked(s: GameState, src: GameObject, colors: readonly Color[], mv: number): boolean {
  return (s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? []).some((l) => {
    const c = s.objects[l.id];
    if (!c || c.zone !== "exile" || (c.zoneChanges ?? 0) !== l.zc) return false;
    const ch = characteristics(s, c);
    return ch.colors.some((x) => colors.includes(x)) || ch.manaValue === mv;
  });
}

/**
 * Grimoire Thief: whoever controls the source while it's still the object that exiled them may look at the face-down cards
 * it exiled, and keeps that once allowed, after it leaves or changes hands again (rulings).
 */
export function watchExileLookers(s: GameState): void {
  let any = false;
  for (const p of s.players)
    for (const id of p.exile) {
      const h = s.objects[id]?.hiddenExile;
      if (!h?.watch) continue;
      any = true;
      const src = s.objects[h.watch.id];
      if (!src || src.zone !== "battlefield" || (src.zoneChanges ?? 0) !== h.watch.zc) continue;
      const who = controllerOf(s, src);
      if (!h.seen.includes(who)) h.seen = [...h.seen, who];
    }
  if (!any) s.exileLookWatch = undefined;
}

/** The spells on the stack with one of these names (either half of a split card's, rulings on Grimoire Thief), bottom first. */
function spellsNamed(s: GameState, names: string[]): StackItem[] {
  return s.stack.filter((item) => {
    const spell = item.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
    return !!spell && !spell.faceDown && names.some((n) => sameName(n, characteristics(s, spell).name));
  });
}

/** Grimoire Thief, for bots: the spells its sacrifice ability would counter now (the cards still exiled with it). */
export function spellsGrimoireCounters(s: GameState, src: GameObject): StackItem[] {
  const cards = (s.linkedExile?.[`${src.id}@${src.zoneChanges ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc);
  return spellsNamed(s, cards.map((l) => characteristics(s, s.objects[l.id]!).name));
}

export function runLaneB189Effect(s: GameState, e: B189Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "keepUpToShuffleRest": {
      // Worldpurge: each player in APNAP order chooses the cards they keep (CR 101.4), none to `n` of them, then every
      // player shuffles the rest of their hand into their library at the same time.
      const who = players(s, e.who, ctx);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.queue) {
        sc.queue = apnap(s, who);
        sc.chosen = {};
      }
      while (sc.queue.length) {
        const pid = sc.queue[0]!;
        if (player(s, pid).hand.length) {
          s.pending = { kind: "discard", player: pid, count: e.n, source: src, upTo: true, keep: true };
          return "paused";
        }
        sc.chosen![pid] = [];
        sc.queue.shift();
      }
      for (const pid of apnap(s, who)) {
        const p = player(s, pid);
        const kept = sc.chosen![pid] ?? [];
        const rest = p.hand.filter((id) => !kept.includes(id));
        for (const id of rest) moveObject(s, id, "library");
        shuffleLibrary(s, p);
        log(s, `${p.name} keeps ${kept.length === 1 ? "a card" : `${kept.length} cards`} and shuffles ${rest.length === 1 ? "the other card" : `${rest.length} cards`} into their library (${src}).`);
      }
      sc.queue = undefined;
      sc.chosen = undefined;
      return;
    }
    case "exileTopLandToHandElseCounter": {
      // Kianne: the card as it is in exile (CR 400.7): a land card goes to the hand, any other card gets the counter there.
      const p = player(s, ctx.controller);
      const top = p.library[0];
      if (top === undefined) return;
      moveObject(s, top, "exile");
      const o = obj(s, top);
      if (o.zone !== "exile") return;
      const name = defOf(s, o).name;
      if (isType(defOf(s, o), "Land")) {
        log(s, `${p.name} exiles ${name} from the top of their library, a land card, and puts it into their hand (${src}).`);
        moveObject(s, top, "hand");
        return;
      }
      o.counters[e.counter] = (o.counters[e.counter] ?? 0) + 1;
      log(s, `${p.name} exiles ${name} from the top of their library with a ${e.counter} counter on it (${src}).`);
      return;
    }
    case "faceUpLinkedCounterNamed": {
      // Grimoire Thief: the cards exiled with this object (the cost sacrificed it: as it was, CR 607.2a, 400.7), still there,
      // turned face up (so everyone may look at them, CR 406.3); then every spell with one of their names, whoever controls
      // it, either half of a split card's (rulings); a face-down spell has no name (CR 708.2).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.guileLoop) {
        const zc = ctx.sourceZc ?? 0;
        const key = s.linkedExile?.[`${ctx.sourceId}@${zc}`] ? `${ctx.sourceId}@${zc}` : `${ctx.sourceId}@${zc - 1}`;
        const cards: ObjectId[] = (s.linkedExile?.[key] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).map((l) => l.id);
        for (const id of cards) obj(s, id).hiddenExile = undefined;
        const names = cards.map((id) => characteristics(s, obj(s, id)).name);
        log(s, cards.length ? `${src}: ${cards.map((id) => defOf(s, obj(s, id)).name).join(", ")} ${cards.length === 1 ? "is" : "are"} turned face up.` : `${src}: no cards exiled with it are left to turn face up.`);
        for (const item of spellsNamed(s, names).reverse()) if (s.stack.includes(item) && item.id !== s.resolving?.item.id) counterOnStack(s, ctx, item.id, src);
      }
      sc.guileLoop = true;
      if (offerGuileCasts(s, src)) return "paused";
      sc.guileLoop = undefined;
      return;
    }
  }
}

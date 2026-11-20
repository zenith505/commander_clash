import type { Effect, ObjRef } from "../abilities";
import { defOf } from "../cards";
import { restingDef } from "../faces";
import { copyWhileHolds, log, player } from "../game";
import { addCopyEffect, copiableDef, copyKey, exceptFor, setChosenTypeAside } from "../copies";
import type { CardDef, CopyWhile, GameState } from "../types";
import { ResolveCtx, objects } from "./resolve";

/**
 * The copiable values of what an effect copies (CR 707.2): the permanent or card as it is now, or as it last existed
 * if it's gone (CR 608.2h): a creature that died ("becomes a copy of that creature"), the sacrificed creature, a
 * target that left the battlefield, the ability's own source. A token is copied as the effect that made it said
 * (rulings).
 */
export function copiedValues(s: GameState, ref: ObjRef, ctx: ResolveCtx): CardDef | undefined {
  const key = (k?: string) => (k ? s.cards[k] : undefined);
  if (ref.ref === "sacrificed") return key(ctx.sacrificed?.[0]?.copyKey);
  // "A copy of that card" (Myrkul, Lord of Bones): the card as it last existed in the graveyard, wherever it is now
  // (rulings), not the permanent it was.
  if (ref.ref === "subjectCard" && ref.printed) {
    const o = ctx.subject ? s.objects[ctx.subject.id] : undefined;
    return o && o.zone !== "battlefield" && !o.isToken ? restingDef(s.cards[o.cardId]!) : undefined;
  }
  if (ref.ref === "subjectCard" && ctx.lki?.copyKey) return key(ctx.lki.copyKey);
  // Lazav, Dimir Mastermind (round 406): "a copy of that card", the creature card the trigger saw put into an opponent's
  // graveyard: as it last existed there, wherever it is now (rulings), so exactly as printed (CR 707.2: copy effects on the
  // permanent it was aren't copied), the front face of a double-faced card (CR 712.8a).
  if (ref.ref === "eventGroup" && ref.printed) {
    const g = ctx.event?.group?.[0];
    const o = g ? s.objects[g.id] : undefined;
    return o && !o.isToken && !o.spellCopy ? restingDef(s.cards[o.cardId]!) : undefined;
  }
  // Lazav, Familiar Stranger: "a copy of that card", the card exiled this way: exactly what's printed on it (rulings, CR
  // 707.2), the front face of a double-faced card (CR 712.8a).
  // Scion of the Ur-Dragon: the card the search put into the graveyard, as printed (CR 707.2), the front face of a
  // double-faced card (CR 712.8a); removing it from the graveyard later changes nothing (rulings).
  // Vesuvan Drifter, Deceiver of Form: the card revealed from the top of the library, as printed (CR 707.2, rulings), the
  // front face of a double-faced card (CR 712.8a).
  // Dermotaxi (round 423): "the exiled card", linked to it (CR 607.2a), as printed (CR 707.2).
  if (ref.ref === "chosenFromYard" || ref.ref === "searchFound" || ref.ref === "revealed" || ref.ref === "linkedCard") {
    const o = objects(s, ref, ctx)[0];
    return o && o.zone !== "battlefield" && o.zone !== "stack" && !o.isToken ? restingDef(s.cards[o.cardId]!) : undefined;
  }
  if (ref.ref === "target") {
    const t = ctx.targets[ref.index];
    if (!ctx.legal[ref.index] || t?.kind !== "object") return undefined;
    const o = s.objects[t.id]!;
    // A targeted card this spell or ability moved since: copied as that card (CR 707.2, rulings on The Scarab God).
    if (ref.card && o.zone !== "battlefield" && o.zone !== "stack" && !o.isToken) return restingDef(s.cards[o.cardId]!);
    // A permanent that left since (bounced earlier in the same spell): as it last existed there.
    const lk = s.lastKnown?.[t.id];
    if (t.zc !== undefined && (o.zoneChanges ?? 0) !== t.zc) return lk && lk.zc === t.zc ? key(lk.copyKey) : undefined;
    return copiableDef(s, o);
  }
  const o = objects(s, ref, ctx)[0];
  if (o) return copiableDef(s, o);
  // A subject that left the battlefield since: as it last existed there (rulings on Vesuvan Duplimancy, CR 608.2h).
  if (ref.ref === "subject" && ctx.subject) {
    const lk = s.lastKnown?.[ctx.subject.id];
    if (lk && lk.zc === ctx.subject.zc && s.objects[ctx.subject.id]?.zone !== "battlefield") return key(lk.copyKey);
  }
  return ref.ref === "self" ? ctx.sourceDef : undefined;
}

/** "Becomes a copy" (CR 707.4). */
export function runCopiesEffect(s: GameState, e: Effect, ctx: ResolveCtx): "paused" | void {
  if (e.type === "nextEntersAsCopy") {
    // Mystic Reflection: waits for the next creatures or planeswalkers to enter this turn (game.ts reflectionKey).
    const o = objects(s, e.of, ctx)[0];
    if (!o || o.zone !== "battlefield") return;
    const base = copiableDef(s, o);
    (s.nextEntersAsCopy ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0, key: copyKey(s, base), turn: s.turn, timestamp: s.nextTimestamp++, source: ctx.sourceDef.name });
    log(s, `The next time one or more creatures or planeswalkers enter this turn, they enter as copies of ${base.name}.`);
    return;
  }
  if (e.type !== "becomeCopy") return;
  const base = copiedValues(s, e.of, ctx);
  if (!base) return;
  if (e.duration === "whileTargetTapped" || e.duration === "whileSourceAttached") return becomeCopyWhile(s, e, base, ctx);
  const until = e.duration === "endOfTurn" ? "endOfTurn" : e.duration === "yourNextTurn" ? { turnOf: ctx.controller } : undefined;
  const changing = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield");
  // Each copies the same values, worked out before any of them changes (CR 608.2h).
  const keys = changing.map((o) => copyKey(s, base, exceptFor(s, o, e.except, ctx.sourceDef.name)));
  changing.forEach((o, i) => {
    const was = defOf(s, o).name;
    setChosenTypeAside(o); // Mirror of the Forebears (round 423)
    addCopyEffect(s, o, keys[i]!, until);
    log(s, `${was} becomes a copy of ${base.name}${until === "endOfTurn" ? " until end of turn" : until ? ` until ${player(s, ctx.controller).name}'s next turn` : ""}.`);
  });
}

/**
 * Round 396's "for as long as" copy effects (CR 611.2b): Zygon Infiltrator's "for as long as that creature remains tapped"
 * (the target, `of`) and Blade of Shared Souls' "for as long as ~ remains attached to it" (`what`). If that isn't so as
 * the effect would begin, it does nothing; once it stops, it's over for good (game.ts endWhileTapped).
 */
export function becomeCopyWhile(s: GameState, e: Extract<Effect, { type: "becomeCopy" }>, base: CardDef, ctx: ResolveCtx) {
  const changing = objects(s, e.what, ctx).filter((o) => o.zone === "battlefield");
  const keys = changing.map((o) => copyKey(s, base, exceptFor(s, o, e.except, ctx.sourceDef.name)));
  const tracked = e.duration === "whileTargetTapped" ? objects(s, e.of, ctx).find((o) => o.zone === "battlefield") : undefined;
  changing.forEach((o, i) => {
    const w: CopyWhile =
      tracked
        ? { whileTapped: { id: tracked.id, zc: tracked.zoneChanges ?? 0, untaps: tracked.untaps ?? 0 } }
        : { whileAttached: { id: ctx.sourceId ?? "", zc: ctx.sourceZc ?? 0, host: o.id, hostZc: o.zoneChanges ?? 0 } };
    const was = defOf(s, o).name;
    if ((e.duration === "whileTargetTapped" && !tracked) || !copyWhileHolds(s, w)) {
      log(s, `${was} doesn't become a copy of ${base.name}: ${e.duration === "whileTargetTapped" ? "that creature isn't tapped" : `${ctx.sourceDef.name} isn't attached to it`}.`);
      return;
    }
    setChosenTypeAside(o);
    addCopyEffect(s, o, keys[i]!, w);
    log(s, `${was} becomes a copy of ${base.name} for as long as ${e.duration === "whileTargetTapped" ? `${defOf(s, tracked!).name} remains tapped` : `${ctx.sourceDef.name} remains attached to it`}.`);
  });
}

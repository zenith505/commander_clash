import type { Effect, PayCost } from "../abilities";
import { parseManaCost } from "../mana";
import { canPayFromPool } from "../spend";
import { planMana } from "../autopay";
import { autoEvidence, collectEvidence, draw, evidenceProblem, log, obj, player } from "../game";
import { cardIdOf, defOf } from "../cards";
import { staticConditionNow } from "../layers";
import type { GameState, PlayerId } from "../types";
import { choiceOptions, pickOptions, printedMatches } from "./targeting";
import { ResolveCtx, apnap, objects, players, runEffect, amountNow, gifteeOf, evidenceCollected } from "./resolve";
import { kickedMatches } from "./run-spells";
import { describePay } from "./describe";
import { doesNothingNow } from "./heuristics";

/** Choices while resolving: "you may", cumulative upkeep, choosing, "if". */
export function runChoicesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "may": {
      // The controller decides now whether to do it (CR 608.2d); the answer is kept while it runs.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.may === undefined) {
        // Fabricate: with the permanent gone, the counters can't be put on it, so it's the tokens (rulings).
        const onSelf = e.effects.every((x) => "what" in x && x.what?.ref === "self");
        if (e.otherwise && onSelf && !objects(s, { ref: "self" }, ctx).length) sc.may = false;
        else if (e.pay && !canPayNow(s, ctx.controller, e.pay)) sc.may = false; // can't pay, so can't do it
        else if (!canDoNow(s, e.effects, ctx)) sc.may = false; // nothing to discard: "if you do" can't happen
        // Paying to untap what's already untapped gets nothing: not worth asking.
        else if (e.pay && ctx.sourceId && doesNothingNow(s, ctx.sourceId, { targets: [], effects: e.effects, text: "" })) sc.may = false;
        else if (e.effects.length === 1 && e.effects[0]!.type === "collectEvidence") {
          // "You may collect evidence N": picking the cards is the answer, none is "no" (CR 701.59a).
          s.pending = { kind: "collectEvidence", player: ctx.controller, n: e.effects[0]!.n, source: src };
          return "paused";
        } else {
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: e.text.replace(/~/g, src), source: src, ...(e.pay ? { pay: e.pay } : {}), ...(e.keep ? { keep: true } : {}) };
          return "paused";
        }
      }
      r.did = sc.may;
      if (!sc.may) {
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        return;
      }
      for (const inner of e.effects) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
    case "eachMay": {
      // Each player decides in APNAP order, seeing the earlier answers (CR 101.4); then it happens to those who chose to.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.mayQueue) {
        sc.mayQueue = apnap(s, players(s, e.who, ctx));
        sc.mayers = [];
      }
      while (sc.mayQueue.length) {
        const pid = sc.mayQueue[0]!;
        if (sc.may === undefined) {
          s.pending = { kind: "chooseMay", player: pid, prompt: e.text, source: src, ...(e.wheel !== undefined ? { wheel: e.wheel } : {}) };
          return "paused";
        }
        if (sc.may) sc.mayers!.push(pid);
        sc.may = undefined;
        sc.mayQueue.shift();
      }
      // Each instruction once, also when one of them waits on a player (a draw that stops for dredge).
      for (sc.mayStep ??= 0; sc.mayStep < e.effects.length; sc.mayStep++) if (runEffect(s, e.effects[sc.mayStep]!, ctx) === "paused") return "paused";
      return;
    }
    case "collectEvidence": {
      // The cards picked as it asked (see "may"); anyone else's choice is made for them, the fewest that do.
      const sc = s.resolving!.scratch ?? {};
      const p = player(s, ctx.controller);
      const ids = sc.evidence?.filter((id) => p.graveyard.includes(id)) ?? autoEvidence(s, p.id, e.n);
      if (evidenceProblem(s, p.id, e.n, ids)) return;
      collectEvidence(s, p, ids, e.n);
      return;
    }
    case "reflexive": {
      // "When you do, ...": it triggers now and is put on the stack the next time a player would receive priority,
      // with its targets chosen then (CR 603.12, 603.3).
      const item = s.resolving!.item;
      const sourceId = ctx.sourceId ?? item.objectId ?? "";
      const cardId = item.sourceCardId ?? (sourceId && s.objects[sourceId] ? cardIdOf(s.objects[sourceId]!) : undefined);
      if (!cardId) return;
      s.triggerQueue.push({
        sourceId,
        sourceCardId: cardId,
        controller: ctx.controller,
        index: -1,
        body: e.body,
        ...(item.sourceZc !== undefined ? { sourceZc: item.sourceZc } : {}),
        ...(item.subject ? { subject: item.subject } : {}),
        ...(item.event ? { event: item.event } : {}),
        ...(item.x ? { x: item.x } : {}),
      });
      return;
    }
    case "cumulativeUpkeep": {
      // CR 702.24a: an age counter first (once, even if it waits on the answer), then pay for each one or sacrifice.
      const sc = (s.resolving!.scratch ??= {});
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (sc.n === undefined) {
        if (!o) return;
        o.counters.age = (o.counters.age ?? 0) + 1;
        sc.n = o.counters.age;
        log(s, `${src} gets an age counter (${sc.n}).`);
      }
      const pay = timesPay(e.pay, sc.n);
      // "If [cost] has choices ... either the entire set of costs is paid, or none of them is" (CR 702.24a).
      return runEffect(s, { type: "may", effects: [], pay, otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Pay ${describePay(pay)} to keep ~ (cumulative upkeep)`, keep: true }, ctx);
    }
    case "choose": {
      // "Choose a creature type": the controller names one as it resolves (CR 608.2c-d); it's kept for the rest.
      const r = s.resolving!;
      if (r.chosen?.[e.choice === "color" ? "color" : e.choice === "basicLandType" ? "landType" : "type"] === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: e.choice, options: choiceOptions(e.choice, e.except) };
        return "paused";
      }
      return;
    }
    case "if": {
      // How it was cast doesn't change while it resolves, so this can be checked again on resuming.
      const holds =
        e.cond.kind === "youDid"
          ? !!s.resolving!.did
          : e.cond.kind === "wonClash"
            ? !!s.resolving!.wonClash
            : e.cond.kind === "foretold"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.foretold
            : e.cond.kind === "bargained"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.bargained
            : e.cond.kind === "evidence"
            ? evidenceCollected(s, ctx)
            : e.cond.kind === "teamwork"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.teamwork
            : e.cond.kind === "gift"
            ? gifteeOf(s, ctx) !== undefined
            : e.cond.kind === "state"
            ? staticConditionNow(s, e.cond.cond, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller)
            : kickedMatches(ctx.kicked, e.cond);
      const branch = holds ? e.effects : (e.otherwise ?? []);
      for (const inner of branch) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
  }
}

/** Can `pid` pay this now: mana from their pool or untapped sources, life (CR 119.4), energy (CR 107.14)? */
export function canPayNow(s: GameState, pid: PlayerId, pay: PayCost): boolean {
  const p = player(s, pid);
  if (pay.life && p.life < pay.life) return false;
  if (pay.energy && (p.energy ?? 0) < pay.energy) return false;
  return !pay.mana || canPayFromPool(s, pid, parseManaCost(pay.mana), "other") || !!planMana(s, pid, parseManaCost(pay.mana));
}

/** A cost paid `n` times over, as one cost (cumulative upkeep, CR 702.24a). */
export function timesPay(pay: PayCost, n: number): PayCost {
  return {
    ...(pay.mana ? { mana: timesMana(pay.mana, n) } : {}),
    ...(pay.life ? { life: pay.life * n } : {}),
    ...(pay.energy ? { energy: pay.energy * n } : {}),
  };
}

/** "{1}{U}" three times is "{3}{U}{U}{U}". */
function timesMana(mana: string, n: number): string {
  let generic = 0;
  const rest = mana.replace(/\{(\d+)\}/g, (_, d: string) => {
    generic += Number(d);
    return "";
  });
  return (generic ? `{${generic * n}}` : "") + rest.repeat(n);
}

/**
 * Can "you may [do this]" be done right now? A player can't discard from an empty hand, draw from an empty
 * library (CR 121.4) or sacrifice what's gone, and then "If you do" doesn't happen either.
 */
function canDoNow(s: GameState, effects: Effect[], ctx: ResolveCtx): boolean {
  for (const e of effects) {
    if (e.type === "discard" && e.who.ref === "you" && !player(s, ctx.controller).hand.some((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))))) return false;
    if (e.type === "draw" && e.who.ref === "you" && !player(s, ctx.controller).library.length) return false;
    if (e.type === "sacrifice" && !objects(s, e.what, ctx).length) return false;
    // Damage to a target that's no longer legal isn't dealt (CR 608.2b); a creature that's gone deals none.
    if (e.type === "damage" && "index" in e.to && !ctx.legal[e.to.index]) return false;
    if (e.type === "bite" && (!objects(s, e.a, ctx).length || !objects(s, e.b, ctx).length)) return false;
    // Collecting evidence takes enough mana value in your graveyard (CR 701.59b).
    if (e.type === "collectEvidence" && evidenceProblem(s, ctx.controller, e.n, undefined)) return false;
    // "Unless you return a non-Lair land you control": you can't if you have none.
    if (e.type === "pick" && e.who.ref === "you" && pickOptions(s, e, ctx.controller, ctx.sourceId).length < amountNow(s, e.n, ctx)) return false;
  }
  return true;
}

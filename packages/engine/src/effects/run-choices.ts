import type { Effect, PayCost, PunisherOption } from "../abilities";
import { parseManaCost } from "../mana";
import { canPayFromPool } from "../spend";
import { planMana } from "../autopay";
import { autoEvidence, collectEvidence, draw, evidenceProblem, log, moveObject, obj, player } from "../game";
import { cardIdOf, defOf } from "../cards";
import { staticConditionNow } from "../layers";
import type { GameState, PlayerId } from "../types";
import { choiceOptions, pickOptions, printedMatches } from "./targeting";
import { ResolveCtx, apnap, objects, players, runEffect, amountNow, gifteeOf, evidenceCollected } from "./resolve";
import { kickedMatches, paidUnless } from "./run-spells";
import { discardCards } from "./run-library";
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
    case "punisher":
      return punisher(s, e, ctx, src);
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
            : e.cond.kind === "treasure"
            ? (ctx.treasureSpent ?? 0) > 0
            : e.cond.kind === "teamwork"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.teamwork
            : e.cond.kind === "gift"
            ? gifteeOf(s, ctx) !== undefined
            : e.cond.kind === "altPaid"
            ? (s.resolving!.item.kind === "spell" ? s.objects[s.resolving!.item.objectId ?? ""]?.castAlt : ctx.event?.castAlt) === e.cond.alt
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
    // "Unless you exile the top creature card of your graveyard" (Barrow Ghoul): you can't with no creature card there.
    if ((e.type === "exile" || e.type === "putOntoBattlefield") && e.what.ref === "graveyardEnd" && !objects(s, e.what, ctx).length) return false;
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

/** What a punisher's option reads as on its button: "Discard a card", "Sacrifice a nonland permanent", "Pay {2}". */
export function punisherLabel(o: PunisherOption): string {
  if ("discard" in o) return o.discard === 1 ? "Discard a card" : `Discard ${o.discard} cards`;
  if ("sacrifice" in o) return `Sacrifice ${/^[aeiou]/i.test(o.sacrifice.text) ? "an" : "a"} ${o.sacrifice.text}`;
  return `Pay ${o.pay.cost}${o.pay.life ? ` and ${o.pay.life} life` : ""}`;
}

/** Which of a punisher's options this player can do now: enough cards to discard (CR 701.9b), a permanent to sacrifice. */
export function punisherOptions(s: GameState, e: Extract<Effect, { type: "punisher" }>, pid: PlayerId, sourceId?: string): number[] {
  const p = player(s, pid);
  return e.options.flatMap((o, i) => (("discard" in o && p.hand.length < o.discard) || ("sacrifice" in o && !pickOptions(s, { filter: o.sacrifice }, pid, sourceId).length) ? [] : [i]));
}

/**
 * A punisher (see its effect): each player chooses in APNAP order, cards and permanents included, then the discards and
 * sacrifices happen at once, then the penalty to those who did neither. Payments are made as they're chosen.
 */
function punisher(s: GameState, e: Extract<Effect, { type: "punisher" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.punish) {
    const times = e.times === undefined ? 1 : amountNow(s, e.times, ctx);
    if (times <= 0) return;
    const lose = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
    sc.punish = { queue: apnap(s, players(s, e.who, ctx)), picked: {}, round: 0, times, options: e.options, ...(typeof lose === "number" ? { lose } : {}) };
  }
  const pu = sc.punish;
  for (;;) {
    while (pu.queue.length) {
      const pid = pu.queue[0]!;
      const p = player(s, pid);
      if (pu.picked[pid] === undefined) {
        const can = p.lost ? [] : punisherOptions(s, e, pid, ctx.sourceId);
        if (!can.length) pu.picked[pid] = "none";
        // Only a payment: its own prompt has "Don't pay".
        else if (can.length === 1 && e.options.length === 1 && "pay" in e.options[can[0]!]!) pu.picked[pid] = String(can[0]);
        else {
          const penalty = describePenalty(e);
          s.pending = { kind: "chooseOption", player: pid, source: src, what: "punisher", options: [...can.map(String), "none"], labels: [...can.map((i) => punisherLabel(e.options[i]!)), penalty], prompt: `${can.map((i) => punisherLabel(e.options[i]!).toLowerCase()).join(" or ")}, or ${penalty.toLowerCase()}?` };
          return "paused";
        }
      }
      const pick = pu.picked[pid]!;
      const o = pick === "none" ? undefined : e.options[Number(pick)];
      if (o && "pay" in o) {
        const paid = paidUnless(s, ctx, pid, o.pay, src, describePenalty(e).toLowerCase(), describePenalty(e).toLowerCase());
        if (paid === "paused") return "paused";
        if (!paid) pu.picked[pid] = "none";
        sc.paid = undefined;
      } else if (o && !sc.chosen?.[pid]) {
        // Which cards or permanent: a card to be discarded isn't revealed until it's discarded (rulings).
        sc.chosen ??= {};
        if ("discard" in o) {
          if (p.hand.length <= o.discard) sc.chosen[pid] = [...p.hand];
          else {
            sc.queue = [pid];
            s.pending = { kind: "discard", player: pid, count: o.discard, source: src };
            return "paused";
          }
        } else if ("sacrifice" in o) {
          const options = pickOptions(s, { filter: o.sacrifice }, pid, ctx.sourceId);
          if (options.length <= 1) sc.chosen[pid] = options;
          else {
            sc.queue = [pid];
            s.pending = { kind: "pickPermanents", player: pid, source: src, action: "sacrifice", what: o.sacrifice.text, options, count: 1 };
            return "paused";
          }
        }
      }
      pu.queue.shift();
    }
    if (!sc.punished) {
      const who = apnap(s, Object.keys(pu.picked).map(Number) as PlayerId[]);
      for (const pid of who) {
        const o = e.options[Number(pu.picked[pid])];
        if (o && "discard" in o) discardCards(s, pid, (sc.chosen?.[pid] ?? []).filter((id) => player(s, pid).hand.includes(id)), "", false, false, ctx.controller);
      }
      for (const pid of who) {
        const o = e.options[Number(pu.picked[pid])];
        if (!o || !("sacrifice" in o)) continue;
        for (const id of sc.chosen?.[pid] ?? []) {
          const x = s.objects[id];
          if (x?.zone !== "battlefield") continue;
          log(s, `${player(s, pid).name} sacrifices ${defOf(s, x).name}.`);
          moveObject(s, id, "graveyard", { sacrificed: true });
        }
      }
      sc.punished = who.filter((pid) => pu.picked[pid] === "none");
      sc.mayStep = 0;
    }
    for (; sc.mayStep! < e.effects.length; sc.mayStep!++) if (runEffect(s, e.effects[sc.mayStep!]!, ctx) === "paused") return "paused";
    if (++pu.round >= pu.times) {
      // Done: another punisher later in the same resolution starts afresh.
      sc.punish = sc.chosen = sc.punished = sc.mayStep = undefined;
      return;
    }
    // "Repeat this process": the same players, all over again.
    pu.queue = apnap(s, players(s, e.who, ctx));
    pu.picked = {};
    sc.chosen = undefined;
    sc.punished = undefined;
  }
}

/** The penalty, for its button: "Lose 3 life". */
function describePenalty(e: Extract<Effect, { type: "punisher" }>): string {
  const lose = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
  return typeof lose === "number" ? `Lose ${lose} life` : "Take the penalty";
}

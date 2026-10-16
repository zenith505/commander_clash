import { allEffects, type Effect, type PayCost, type PunisherOption, type TargetSpec } from "../abilities";
import { parseManaCost, spentMeets, type ManaSpent } from "../mana";
import { canPayFromPool } from "../spend";
import { planMana } from "../autopay";
import { autoEvidence, collectEvidence, draw, evidenceProblem, log, moveObject, obj, opponents, payableLife, player } from "../game";
import { cardIdOf, defOf } from "../cards";
import { staticConditionNow } from "../layers";
import type { GameState, PlayerId } from "../types";
import { choiceOptions, objectMatches, pickOptions, printedMatches } from "./targeting";
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
      const source = e.once && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const key = `${ctx.sourceZc ?? source?.zoneChanges ?? 0}|do:${e.text}`;
      if (sc.may === undefined && source?.triggeredThisTurn?.includes(key)) sc.may = false; // done already this turn (CR 603.2h)
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
          // About the card "reveal/look at the top card" found: it's named, and shown (the controller has seen it).
          const rv = s.resolving?.revealed;
          const card = rv && allEffects(e.effects).some((x) => "what" in x && (x.what as { ref?: string } | undefined)?.ref === "revealed") ? s.objects[rv.id] : undefined;
          const prompt = card ? e.text.replace("the revealed card", defOf(s, card).name) : e.text;
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: prompt.replace(/~/g, src), source: src, ...(card ? { card: card.id } : {}), ...(e.pay ? { pay: e.pay } : {}), ...(e.keep ? { keep: true } : {}) };
          return "paused";
        }
      }
      r.did = sc.may;
      if (!sc.may) {
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        return;
      }
      if (source && !source.triggeredThisTurn?.includes(key)) (source.triggeredThisTurn ??= []).push(key);
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
      if (e.choice === "opponent") {
        // "Choose an opponent" (CR 608.2d): one still in the game (CR 800.4a); with one, there's nothing to ask.
        if (r.chosen?.player !== undefined) return;
        const opps = opponents(s, ctx.controller);
        if (opps.length === 1) {
          r.chosen = { ...r.chosen, player: opps[0]! };
          log(s, `${player(s, ctx.controller).name} chooses ${player(s, opps[0]!).name} for ${src}.`);
        }
        if (opps.length <= 1) return;
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt: "choose an opponent" };
        return "paused";
      }
      if (r.chosen?.[e.choice === "color" ? "color" : e.choice === "basicLandType" ? "landType" : e.choice === "keyword" ? "keyword" : "type"] === undefined) {
        const chooser = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
        if (chooser === undefined) return;
        s.pending = { kind: "chooseOption", player: chooser, source: src, what: e.choice, options: e.options ?? choiceOptions(e.choice, e.except) };
        return "paused";
      }
      return;
    }
    case "if": {
      // Checked once, as the instruction is reached (CR 608.2c): resuming after a choice inside it keeps the answer (a
      // draw can change "if you have no cards in hand").
      const held = s.resolving!.scratch?.ifs?.[ifDepth];
      const holds = held ? held.holds :
        e.cond.kind === "youDid"
          ? !!s.resolving!.did
          : e.cond.kind === "wonClash"
            ? !!s.resolving!.wonClash
            : e.cond.kind === "destroyedThisWay"
            ? !!s.resolving!.destroyed?.length
            : e.cond.kind === "rollIn"
            ? rollIn(e.cond, e.cond.event ? ctx.event?.amount : s.resolving!.rolled?.result)
            : e.cond.kind === "foretold"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.foretold
            : e.cond.kind === "bargained"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.bargained
            : e.cond.kind === "evidence"
            ? evidenceCollected(s, ctx)
            : e.cond.kind === "treasure"
            ? (ctx.treasureSpent ?? 0) > 0
            : e.cond.kind === "spent"
            ? spentMeets(e.cond.target === undefined ? ctx.spent : targetSpellSpent(s, ctx, e.cond.target), e.cond.req)
            : e.cond.kind === "revealedIs"
            ? revealedIs(s, e.cond.filter) !== !!e.cond.not
            : e.cond.kind === "targetIs"
            ? objects(s, { ref: "target", index: e.cond.index }, ctx).some((o) => o.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, o, ctx.controller, false))
            : e.cond.kind === "teamwork"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.teamwork
            : e.cond.kind === "gift"
            ? gifteeOf(s, ctx) !== undefined
            : e.cond.kind === "altPaid"
            ? (s.resolving!.item.kind === "spell" ? s.objects[s.resolving!.item.objectId ?? ""]?.castAlt : ctx.event?.castAlt) === e.cond.alt
            : e.cond.kind === "sacrificedSuspected"
            ? !!ctx.sacrificed?.[0]?.suspected
            : e.cond.kind === "suspected"
            ? objects(s, e.cond.what, ctx).some((o) => o.zone === "battlefield" && o.suspected !== undefined)
            : e.cond.kind === "state"
            ? staticConditionNow(s, e.cond.cond, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller)
            : kickedMatches(ctx.kicked, e.cond);
      return runBranch(s, holds, holds ? e.effects : (e.otherwise ?? []), ctx);
    }
  }
}

/** A results table's row (CR 706.3a): no roll, no row. */
function rollIn(c: { min?: number; max?: number }, result: number | undefined): boolean {
  return result !== undefined && (c.min === undefined || result >= c.min) && (c.max === undefined || result <= c.max);
}

/** Is the card the last "reveal the top card of your library" revealed one like this (printed characteristics, in the library)? */
function revealedIs(s: GameState, filter: TargetSpec): boolean {
  const rv = s.resolving?.revealed;
  const o = rv && s.objects[rv.id];
  return !!o && (o.zoneChanges ?? 0) === rv.zc && printedMatches(filter, defOf(s, o));
}

/** How many "if" instructions are running inside one another right now: each keeps its place in `scratch.ifs`. */
let ifDepth = 0;

/** Scratch that belongs to the instructions around an "if", kept between the instructions inside it. */
const OUTER_SCRATCH = ["may", "mayQueue", "mayers", "mayStep", "punish", "punished", "paid", "payQueue", "paidBy", "ifs"] as const;

/**
 * An "if"'s instructions in order, each done once, also when one waits on a player: "If you control a blue creature,
 * draw a card, then discard a card" (Statute of Denial) resumes at the discard, not the draw (CR 608.2c). Between two of
 * them, what the finished one kept for its own choices goes, so the next one starts afresh.
 */
function runBranch(s: GameState, holds: boolean, branch: Effect[], ctx: ResolveCtx): "paused" | void {
  const r = s.resolving!;
  const d = ifDepth++;
  try {
    for (;;) {
      const sc = (r.scratch ??= {});
      const ifs = (sc.ifs ??= []);
      const at = (ifs[d] ??= { holds, step: 0 });
      if (at.step >= branch.length) break;
      if (runEffect(s, branch[at.step]!, ctx) === "paused") return "paused";
      if (at.step + 1 < branch.length) {
        const kept: NonNullable<typeof r.scratch> = {};
        for (const k of OUTER_SCRATCH) if (sc[k] !== undefined) (kept as Record<string, unknown>)[k] = sc[k];
        r.scratch = kept;
      }
      at.step++;
    }
    // Done: a later "if" at this depth starts afresh.
    const ifs = r.scratch?.ifs;
    if (ifs) {
      ifs.length = d;
      if (!d) r.scratch!.ifs = undefined;
    }
  } finally {
    ifDepth--;
  }
}

/**
 * The mana spent to cast a target spell (Nix): any player's (rulings), none for a copy or a spell no longer on the stack's
 * object as it was cast.
 */
function targetSpellSpent(s: GameState, ctx: ResolveCtx, i: number): ManaSpent | undefined {
  const t = ctx.targets[i];
  const item = t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
  return item?.kind === "spell" && !item.copy ? s.objects[item.objectId ?? ""]?.spent : undefined;
}

/** Can `pid` pay this now: mana from their pool or untapped sources, life (CR 119.4), energy (CR 107.14)? */
export function canPayNow(s: GameState, pid: PlayerId, pay: PayCost): boolean {
  const p = player(s, pid);
  if (pay.life && payableLife(s, pid) < pay.life) return false;
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
    // "You may put it into your graveyard" after revealing nothing (an empty library) or a card that has left: nothing to ask.
    if ("what" in e && typeof e.what === "object" && e.what && "ref" in e.what && e.what.ref === "revealed" && !objects(s, e.what, ctx).length) return false;
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
export function punisherOptions(s: GameState, e: Extract<Effect, { type: "punisher" }>, pid: PlayerId, sourceId?: string, made: string[] = []): number[] {
  const p = player(s, pid);
  // With several picks (Rottenmouth Viper), the cards and permanents picked before can't be picked again (rulings).
  const discarding = made.reduce((n, m) => n + (e.options[Number(m)] && "discard" in e.options[Number(m)]! ? (e.options[Number(m)] as { discard: number }).discard : 0), 0);
  const sacrificing = made.filter((m) => e.options[Number(m)] && "sacrifice" in e.options[Number(m)]!).length;
  return e.options.flatMap((o, i) => (("discard" in o && p.hand.length < discarding + o.discard) || ("sacrifice" in o && pickOptions(s, { filter: o.sacrifice }, pid, sourceId).length <= sacrificing) ? [] : [i]));
}

/**
 * A punisher (see its effect): each player chooses in APNAP order, cards and permanents included, then the discards and
 * sacrifices happen at once, then the penalty to those who did neither. Payments are made as they're chosen. With
 * `picks`, each player makes that many choices before picking the cards and permanents, and takes the penalty once
 * for each "neither" (rulings on Rottenmouth Viper).
 */
function punisher(s: GameState, e: Extract<Effect, { type: "punisher" }>, ctx: ResolveCtx, src: string): "paused" | void {
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.punish) {
    const times = e.times === undefined ? 1 : amountNow(s, e.times, ctx);
    const picks = e.picks === undefined ? 1 : amountNow(s, e.picks, ctx);
    if (times <= 0 || picks <= 0) return;
    sc.punish = { queue: apnap(s, players(s, e.who, ctx)), picked: {}, made: {}, round: 0, times, picks, options: e.options, ...punisherHarm(e) };
  }
  const pu = sc.punish;
  for (;;) {
    while (pu.queue.length) {
      const pid = pu.queue[0]!;
      const p = player(s, pid);
      const made = (pu.made[pid] ??= []);
      while (made.length < pu.picks) {
        if (pu.picked[pid] === undefined) {
          const can = p.lost ? [] : punisherOptions(s, e, pid, ctx.sourceId, made);
          if (!can.length) pu.picked[pid] = "none";
          // Only a payment: its own prompt has "Don't pay".
          else if (can.length === 1 && e.options.length === 1 && "pay" in e.options[can[0]!]!) pu.picked[pid] = String(can[0]);
          else {
            const penalty = describePenalty(e);
            const which = pu.picks > 1 ? ` (${made.length + 1} of ${pu.picks})` : "";
            s.pending = { kind: "chooseOption", player: pid, source: src, what: "punisher", options: [...can.map(String), "none"], labels: [...can.map((i) => punisherLabel(e.options[i]!)), penalty], prompt: `${can.map((i) => punisherLabel(e.options[i]!).toLowerCase()).join(" or ")}, or ${penalty.toLowerCase()}?${which}` };
            return "paused";
          }
        }
        const o = pu.picked[pid] === "none" ? undefined : e.options[Number(pu.picked[pid])];
        if (o && "pay" in o) {
          const paid = paidUnless(s, ctx, pid, o.pay, src, describePenalty(e).toLowerCase(), describePenalty(e).toLowerCase());
          if (paid === "paused") return "paused";
          if (!paid) pu.picked[pid] = "none";
          sc.paid = undefined;
        }
        made.push(pu.picked[pid]!);
        delete pu.picked[pid];
      }
      // Which cards and permanents: a card to be discarded isn't revealed until it's discarded (rulings).
      const chosen = (pu.chosen ??= {});
      const mine = (chosen[pid] ??= {});
      const discards = made.reduce((n, m) => {
        const o = e.options[Number(m)];
        return n + (o && "discard" in o ? o.discard : 0);
      }, 0);
      if (discards && !mine.discard) {
        if (sc.chosen?.[pid] && sc.queue?.length === 0) mine.discard = sc.chosen[pid]!;
        else if (p.hand.length <= discards) mine.discard = [...p.hand];
        else {
          sc.chosen = {};
          sc.queue = [pid];
          s.pending = { kind: "discard", player: pid, count: discards, source: src };
          return "paused";
        }
        sc.chosen = undefined;
        sc.queue = undefined;
      }
      const sacs = made.flatMap((m) => {
        const o = e.options[Number(m)];
        return o && "sacrifice" in o ? [o.sacrifice] : [];
      });
      if (sacs.length && !mine.sacrifice) {
        // The same kind of permanent each time (one sacrifice option when there are several picks, see the parser).
        const options = pickOptions(s, { filter: sacs[0]! }, pid, ctx.sourceId);
        if (sc.chosen?.[pid] && sc.queue?.length === 0) mine.sacrifice = sc.chosen[pid]!;
        else if (options.length <= sacs.length) mine.sacrifice = options;
        else {
          sc.chosen = {};
          sc.queue = [pid];
          s.pending = { kind: "pickPermanents", player: pid, source: src, action: "sacrifice", what: sacs[0]!.text, options, count: sacs.length };
          return "paused";
        }
        sc.chosen = undefined;
        sc.queue = undefined;
      }
      pu.queue.shift();
    }
    if (!pu.acted) {
      const who = apnap(s, Object.keys(pu.made).map(Number) as PlayerId[]);
      for (const pid of who) discardCards(s, pid, (pu.chosen?.[pid]?.discard ?? []).filter((id) => player(s, pid).hand.includes(id)), "", false, false, ctx.controller);
      for (const pid of who)
        for (const id of pu.chosen?.[pid]?.sacrifice ?? []) {
          const x = s.objects[id];
          if (x?.zone !== "battlefield") continue;
          log(s, `${player(s, pid).name} sacrifices ${defOf(s, x).name}.`);
          moveObject(s, id, "graveyard", { sacrificed: true });
        }
      pu.acted = true;
      pu.penalty = 0;
      sc.mayStep = e.effects.length;
    }
    // The penalty once for each "neither": the players with that many or more (rulings on Rottenmouth Viper).
    for (;;) {
      if (sc.mayStep! >= e.effects.length) {
        const nones = (pid: string) => pu.made[pid]!.filter((m) => m === "none").length;
        const next = Object.keys(pu.made).filter((pid) => nones(pid) > pu.penalty!).map(Number) as PlayerId[];
        if (!next.length) break;
        sc.punished = apnap(s, next);
        pu.penalty!++;
        sc.mayStep = 0;
      }
      for (; sc.mayStep! < e.effects.length; sc.mayStep!++) if (runEffect(s, e.effects[sc.mayStep!]!, ctx) === "paused") return "paused";
    }
    if (++pu.round >= pu.times) {
      // Done: another punisher later in the same resolution starts afresh.
      sc.punish = sc.punished = sc.mayStep = undefined;
      return;
    }
    // "Repeat this process": the same players, all over again.
    pu.queue = apnap(s, players(s, e.who, ctx));
    pu.picked = {};
    pu.made = {};
    pu.chosen = undefined;
    pu.acted = undefined;
    sc.punished = undefined;
  }
}

/** What the penalty costs the punished player, for the bots: life lost, or tokens made for its controller. */
function punisherHarm(e: Extract<Effect, { type: "punisher" }>): { lose?: number; tokens?: number } {
  const [f] = e.effects;
  if (e.effects.length !== 1 || !f) return {};
  if (f.type === "loseLife" && typeof f.n === "number") return { lose: f.n };
  if (f.type === "damage" && typeof f.amount === "number") return { lose: f.amount };
  if (f.type === "createToken") return { tokens: 1 };
  return {};
}

/** The penalty, for its button: "Lose 3 life". */
function describePenalty(e: Extract<Effect, { type: "punisher" }>): string {
  const lose = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
  return typeof lose === "number" ? `Lose ${lose} life` : "Take the penalty";
}

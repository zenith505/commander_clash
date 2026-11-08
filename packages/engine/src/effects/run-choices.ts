import { allEffects, type Effect, type ObjRef, type PayCost, type PunisherOption, type UnlessPays, type SpellCondition, type StaticCondition, type TargetSpec } from "../abilities";
import { coloredManaSymbols, manaValue, parseManaCost, spentMeets, type ManaSpent } from "../mana";
import { canPayFromPool, mayPayUse, type ManaUse } from "../spend";
import { planMana } from "../autopay";
import { autoEvidence, livingPlayers, gainLife, inCombatPhase, loseEnergy, processCandidates, adventureExileCards, availableMana, canGainLife, canLoseLife, cantDraw, collectEvidence, creatureTypesOf, draw, evidenceProblem, log, loseLife, payLife, moveObject, obj, opponents, payableLife, player, shareCreatureType, whileControlledHolds } from "../game";
import { abilitiesOf, realDefOf, canBeSacrificed, cardIdOf, defOf, isType, objIsType, power } from "../cards";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "../layers";
import type { Color, GameObject, GameState, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, choiceOptions, objectMatches, TYPE_ORDERS, pickOptions, printedMatches, sayBound, spellMatches, targetsMatch } from "./targeting";
import { tokenDef } from "./run-tokens";
import { ResolveCtx, apnap, objects, players, runEffect, amountNow, amountCtx, gifteeOf, evidenceCollected, sourceCreatureTypes, ctxSource } from "./resolve";
import { dealDamageBatch } from "../damage";
import { kickedMatches, paidUnless } from "./run-spells";
import { discardCards } from "./run-library";
import { canTransform, lockedDoors } from "./run-permanents";
import { describePay } from "./describe";
import { doesNothingNow } from "./heuristics";
import { cardNameOptions } from "../names";
import { voteWins } from "./run-votes";
import { defMv, sameName } from "../faces";
import { putCounters } from "../counters";
import { CREATURE_TYPES, LAND_TYPES } from "../keywords";
import { nextRandom } from "../rng";
import { fireEvent } from "./triggers";

/** Choices while resolving: "you may", cumulative upkeep, choosing, "if". */
export function runChoicesEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "may": {
      // (Thick-Skinned Goblin's {0} echo: see echoZeroFor.)
      // The controller decides now whether to do it (CR 608.2d); the answer is kept while it runs.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const source = e.once && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      const key = `${ctx.sourceZc ?? source?.zoneChanges ?? 0}|do:${e.text}`;
      // Declined, and what happens instead is another "you may" (Gathering Stone: "If you don't put the card into your hand,
      // you may put it into your graveyard"): that one is asked on its own.
      if (sc.mayOtherwise === e.text) {
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        sc.mayOtherwise = undefined;
        return;
      }
      if (sc.may === undefined && source?.triggeredThisTurn?.includes(key)) sc.may = false; // done already this turn (CR 603.2h)
      // Learn with a Retriever Phoenix in the learner's graveyard as they're told to learn (rulings): "you may instead return
      // ~ to the battlefield" replaces the whole learn (CR 614.1a, 616.1), asked first; each one there is a choice.
      if (e.learn && sc.may === undefined) {
        const li = (sc.learnInstead ??= { asked: [] });
        const last = li.asked.at(-1);
        if (li.yes && last !== undefined) {
          li.yes = undefined;
          const o = s.objects[last];
          if (o?.zone === "graveyard" && o.owner === ctx.controller) {
            moveObject(s, last, "battlefield", { controller: ctx.controller });
            log(s, `${player(s, ctx.controller).name} returns ${defOf(s, o).name} to the battlefield instead of learning.`);
          }
          r.did = false;
          return;
        }
        const phoenix = player(s, ctx.controller).graveyard.find((id) => !li.asked.includes(id) && !!abilitiesOf(s, obj(s, id)).returnInsteadOfLearn);
        if (phoenix !== undefined) {
          li.asked.push(phoenix);
          const name = defOf(s, obj(s, phoenix)).name;
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `return ${name} to the battlefield instead of learning`, source: name, card: phoenix, insteadOfLearn: phoenix };
          return "paused";
        }
      }
      // "You may pay any amount of life" (Necrodominance): the amount first, at most their life total (0 when it's 0 or
      // less, or when they can't lose life, CR 119.4, 119.8); paying 0 is paying (CR 107.1b). Paid at once.
      if (e.payX?.life && sc.may === undefined) {
        if (sc.payX === undefined) {
          const most = Math.max(0, payableLife(s, ctx.controller));
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "payLife", options: ["0"], numberRange: { min: 0, max: most }, prompt: `${e.text.replace(/~/g, src)}: how much life?` };
          return "paused";
        }
        const n = Number(sc.payX);
        payLife(s, ctx.controller, n);
        log(s, `${player(s, ctx.controller).name} pays ${n} life for ${src}.`);
        sc.may = true;
      }
      // "You may pay any amount of {E}" (Galvanic Discharge): the amount first, at most the energy they have; paying 0 is
      // paying (rulings). Paid at once (CR 107.14).
      if (e.payX?.energy && sc.may === undefined) {
        if (sc.payX === undefined) {
          const most = Math.max(0, player(s, ctx.controller).energy ?? 0);
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "payEnergy", options: ["0"], numberRange: { min: 0, max: most }, prompt: `${e.text.replace(/~/g, src)}: how much energy?` };
          return "paused";
        }
        const n = Number(sc.payX);
        const p = player(s, ctx.controller);
        if (n || !e.payX.atLeastOne) {
          loseEnergy(s, p.id, n);
          log(s, `${p.name} pays ${n} energy for ${src}.`);
        }
        sc.may = n > 0 || !e.payX.atLeastOne;
      }
      // "You may pay {1}{W} any number of times" (Intrepid Adversary): how many times first, at most as many as the player
      // could pay, then the whole payment at once.
      if (e.payX?.times && e.pay?.mana && sc.may === undefined) {
        if (sc.payX === undefined) {
          let cap = 0;
          // "Up to three times" (Tranquil Frillback): no more than that.
          const most = e.payX.max !== undefined ? Math.min(40, amountNow(s, e.payX.max, ctx)) : 40;
          while (cap < most && planMana(s, ctx.controller, parseManaCost(timesMana(e.pay.mana, cap + 1)))) cap++;
          if (!cap) sc.may = false;
          else {
            const options = ["none", ...Array.from({ length: cap }, (_, i) => String(i + 1))];
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "payX", options, labels: options.map((o) => (o === "none" ? "Don't pay" : `${o} time${o === "1" ? "" : "s"} (${timesMana(e.pay!.mana!, Number(o))})`)), prompt: `pay ${e.pay.mana} how many times?` };
            return "paused";
          }
        } else if (sc.payX === "none") sc.may = false;
        else {
          const pay = timesPay(e.pay, Number(sc.payX));
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `pay ${describePay(pay)}`, source: src, pay };
          return "paused";
        }
      }
      // "You may pay {X}": X first (CR 107.1c), at most what the player could pay, then the payment with that X.
      if (e.payX && !e.payX.times && e.pay?.mana && sc.may === undefined) {
        if (sc.payX === undefined) {
          const rest = manaValue(parseManaCost(e.pay.mana.replaceAll("{X}", "")));
          // Numa, Joraga Chieftain: "you may pay {X}{X}": X twice (CR 107.3), so at most half of what's left.
          const xs = e.pay.mana.split("{X}").length - 1;
          let cap = Math.min(Math.floor((availableMana(s, ctx.controller) - rest) / xs), e.payX.max ? amountNow(s, e.payX.max, ctx) : Infinity);
          // Mana of one color only (Leyline Tyrant): as much of it as the player could make.
          const color = e.payX.color;
          if (color) while (cap > 0 && !planMana(s, ctx.controller, parseManaCost(`{${color}}`.repeat(cap)))) cap--;
          if (cap < 0) sc.may = false;
          else {
            const options = ["none", ...Array.from({ length: Math.min(cap, 40) + 1 }, (_, i) => String(i))];
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "payX", options, labels: options.map((o) => (o === "none" ? "Don't pay" : `X = ${o}`)), prompt: `${e.text.replace(/~/g, src)}: choose X` };
            return "paused";
          }
        } else if (sc.payX === "none") sc.may = false;
        else {
          const n = Number(sc.payX);
          const pay = { ...e.pay, mana: e.pay.mana.replaceAll("{X}", e.payX.color && n > 0 ? `{${e.payX.color}}`.repeat(n) : `{${n}}`) };
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `pay ${describePay(pay)}`, source: src, pay };
          return "paused";
        }
      }
      // Each target in turn (Sepulchral Primordial); the ones turned down are left alone, as if no longer legal.
      if (e.eachTarget && sc.may === undefined) {
        const ref = allEffects(e.effects).map((x) => ("what" in x ? (x.what as ObjRef | undefined) : undefined)).find((w): w is Extract<ObjRef, { ref: "target" }> => w?.ref === "target");
        if (ref) {
          const each = (sc.mayEach ??= { at: ref.index, yes: [] as number[] });
          if (sc.mayAnswer !== undefined) {
            if (sc.mayAnswer) each.yes.push(each.at - 1);
            sc.mayAnswer = undefined;
          }
          for (; each.at < ref.index + (ref.n ?? 1); each.at++) {
            const t = ctx.targets[each.at];
            if (!ctx.legal[each.at] || t?.kind !== "object") continue;
            const name = defOf(s, obj(s, t.id)).name;
            const prompt = e.text.replace(/\btarget .+? (?:from an opponent's graveyard|an opponent controls)\b/, name);
            s.pending = { kind: "chooseMay", player: ctx.controller, prompt: (prompt === e.text ? `${e.text}: ${name}` : prompt).replace(/~/g, src), source: src, card: t.id, eachTarget: true };
            each.at++;
            return "paused";
          }
          for (let i = ref.index; i < ref.index + (ref.n ?? 1); i++) if (!each.yes.includes(i)) ctx.legal[i] = false;
          sc.mayEach = undefined;
          sc.may = each.yes.length > 0;
        }
      }
      // "An amount of {E} equal to its mana value" (Volatile Stormdrake): counted now (CR 608.2h).
      // "Pay X life, where X is its power" (Mask of Griselbrand): counted now too. Paying 0 life is paying (CR 119.4, 107.1b).
      // "{1} for each card in your hand" (Megatherium): counted now as well; {0} for none, which is paid by doing nothing.
      // Pendrell Flux: "unless you pay its mana cost", ~'s as this resolves, colored symbols and all; X is 0 (rulings). With
      // no mana cost it can't be paid (CR 118.6).
      const ownCost = e.payManaCost ? manaCostToPay(s, ctx) : undefined;
      // Thick-Skinned Goblin: {0} rather than the echo cost of a permanent its controller controls (CR 118.9; rulings: paying
      // {0} is paying the echo cost). Paying the echo cost itself instead would only cost more, so {0} is what's offered.
      if (e.echo && echoZeroFor(s, ctx)) {
        const zero: Extract<Effect, { type: "may" }> = { ...e, echo: undefined, effects: [{ type: "echoPaid" }], pay: { mana: "{0}" }, text: `${e.text} (paying {0} rather than its echo cost)` };
        return runEffect(s, zero, ctx);
      }
      const pay = ownCost !== undefined ? (ownCost === null ? undefined : { mana: ownCost }) : e.payEnergy !== undefined ? { ...e.pay, energy: Math.max(0, amountNow(s, e.payEnergy, ctx)) } : e.payLife !== undefined ? { ...e.pay, life: Math.max(0, amountNow(s, e.payLife, ctx)) } : e.payTimes !== undefined && e.pay ? timesPay(e.pay, Math.max(0, amountNow(s, e.payTimes, ctx))) : e.pay;
      // Greenbelt Rampager: "pay {E}{E}. If you can't, ...": paid if it can be (rulings), no choice; energy only.
      if (e.must && sc.may === undefined) {
        const p = player(s, ctx.controller);
        sc.may = !!pay?.energy && !pay.mana && !pay.life && (p.energy ?? 0) >= pay.energy;
        if (sc.may) {
          loseEnergy(s, p.id, pay!.energy!);
          log(s, `${p.name} pays ${pay!.energy} energy for ${src}.`);
        }
      }
      if (sc.may === undefined) {
        // Fabricate: with the permanent gone, the counters can't be put on it, so it's the tokens (rulings).
        const onSelf = e.effects.every((x) => "what" in x && x.what?.ref === "self") && (e.effects.length > 0 || !!e.otherwise?.every((x) => "what" in x && x.what?.ref === "self"));
        if (e.otherwise && onSelf && !objects(s, { ref: "self" }, ctx).length) sc.may = false;
        else if (ownCost === null || (pay && !canPayNow(s, ctx.controller, pay, mayPayUse(s, e.cumulativeUpkeep ? { upkeepOf: ctx.sourceId } : undefined)))) sc.may = false; // can't pay, so can't do it
        else if (!canDoNow(s, e.effects, ctx)) sc.may = false; // nothing to discard: "if you do" can't happen
        // Paying to untap what's already untapped gets nothing: not worth asking (unless not paying does something).
        else if (pay && !e.otherwise?.length && ctx.sourceId && doesNothingNow(s, ctx.sourceId, { targets: [], effects: e.effects, text: "" })) sc.may = false;
        else if (e.effects.length === 1 && e.effects[0]!.type === "collectEvidence") {
          // "You may collect evidence N": picking the cards is the answer, none is "no" (CR 701.59a).
          s.pending = { kind: "collectEvidence", player: ctx.controller, n: e.effects[0]!.n, source: src };
          return "paused";
        } else if (e.effects.length === 2 && e.effects[1]!.type === "collectEvidence" && selfCardExiled(s, e.effects, ctx)) {
          // Lamplight Phoenix: "you may exile it and collect evidence 4": the same, the card itself not among them (rulings).
          s.pending = { kind: "collectEvidence", player: ctx.controller, n: e.effects[1]!.n, source: src, not: selfCardExiled(s, e.effects, ctx) };
          return "paused";
        } else {
          // About the card "reveal/look at the top card" found: it's named, and shown (the controller has seen it).
          const rv = s.resolving?.revealed;
          const card = rv && allEffects(e.effects).some((x) => x.type === "revealRevealed" || ("what" in x && (x.what as { ref?: string } | undefined)?.ref === "revealed")) ? s.objects[rv.id] : undefined;
          // "You may search your library for an Aura card with mana value less than or equal to that Aura" (Light-Paws): the number.
          const first = e.effects[0];
          const text = first?.type === "search" ? sayBound(s, e.text, first.filter, amountCtx(s, ctx)) : e.text;
          const prompt = card ? text.replace("the revealed card", defOf(s, card).name) : e.payEnergy !== undefined ? `${text} (${pay!.energy} energy)` : e.payTimes !== undefined || e.payManaCost ? `${text} (${describePay(pay!) || "{0}"})` : text;
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: prompt.replace(/~/g, src), source: src, ...(card ? { card: card.id } : {}), ...(pay ? { pay } : {}), ...(e.keep ? { keep: true } : {}), ...(e.cumulativeUpkeep && ctx.sourceId ? { upkeepOf: ctx.sourceId } : {}) };
          return "paused";
        }
      }
      r.did = sc.may;
      if (!sc.may) {
        if (e.otherwise?.some((x) => x.type === "may")) {
          sc.mayOtherwise = e.text;
          sc.may = undefined;
          for (const inner of e.otherwise) if (runEffect(s, inner, ctx) === "paused") return "paused";
          sc.mayOtherwise = undefined;
          return;
        }
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        return;
      }
      if (source && !source.triggeredThisTurn?.includes(key)) (source.triggeredThisTurn ??= []).push(key);
      // "You may [do something]. If you do, ...": what they do is a cost, paid as it resolves (CR 118.12), so a discard
      // isn't one an effect causes (Library of Leng's rulings).
      const next = r.body.effects[r.body.effects.indexOf(e) + 1];
      const asCost = r.body.effects.includes(e) && next?.type === "if" && next.cond.kind === "youDid";
      const xctx = e.payX ? { ...ctx, x: Number(sc.payX) } : ctx;
      // A copy that keeps ctx's live "chosen".
      const cctx: ResolveCtx = asCost ? (Object.defineProperties({ asCost: true }, Object.getOwnPropertyDescriptors(xctx)) as ResolveCtx) : xctx;
      for (const inner of e.effects) if (runEffect(s, inner, cctx) === "paused") return "paused";
      return;
    }
    case "repeatMay": {
      // Each time, the controller decides whether to go on after seeing what happened (rulings on Ad Nauseam). Their
      // life total may be 0 or less meanwhile: state-based actions wait until the spell is done (CR 704.3).
      const sc = (s.resolving!.scratch ??= {});
      const again = sc.may;
      sc.may = undefined;
      if (again === false) return;
      if (again === true) log(s, `${player(s, ctx.controller).name} repeats the process.`);
      // Kindle the Carnage: each pass discards anew, "that card" being only this pass's (the random pick is redone).
      if (e.needsHand) {
        sc.randomPicks = undefined;
        s.resolving!.discarded = undefined;
        s.resolving!.discardedAll = undefined;
      }
      for (const inner of e.effects) if (runEffect(s, inner, ctx) === "paused") return "paused";
      if (!(e.needsHand ? player(s, ctx.controller).hand : player(s, ctx.controller).library).length) return;
      s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `repeat: ${e.text}`, source: src, repeat: true };
      return "paused";
    }
    case "repeat": {
      // Another Round: the process `n` times, worked out once (CR 608.2h); each pass's choices made anew (rulings). The
      // scratch a pass leaves behind is cleared before the next one.
      const sc = (s.resolving!.scratch ??= {});
      // Protection Racket: a pass for each opponent, in turn order starting after you (worked out once, as it begins).
      const order = (pids: PlayerId[]) => {
        const i = s.turnOrder.indexOf(ctx.controller);
        return [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i + 1)].filter((p) => pids.includes(p));
      };
      type Pass = { left: number; step?: number; keep: string[]; gathered?: ObjectId[]; order?: PlayerId[] };
      const first = (): Pass => {
        if (!e.forEach) return { left: amountNow(s, e.n, ctx), keep: Object.keys(sc) };
        const o = order(players(s, e.forEach, ctx));
        return { left: o.length, keep: Object.keys(sc), order: o };
      };
      const st = (sc.repeat ??= first());
      while (st.left > 0) {
        // A player who left the game is skipped (CR 800.4a).
        const who = st.order?.[st.order.length - st.left];
        if (who !== undefined && player(s, who).lost) {
          st.left--;
          continue;
        }
        const sub: ResolveCtx = who !== undefined ? { ...ctx, eachOne: who } : ctx;
        for (st.step ??= 0; st.step < e.effects.length; st.step++) if (runEffect(s, e.effects[st.step]!, sub) === "paused") return "paused";
        for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (k !== "repeat" && !st.keep.includes(k)) delete sc[k];
        st.step = undefined;
        // Valgavoth's Onslaught: each pass's face-down creature, kept for "each of those creatures" afterwards.
        if (e.gather) st.gathered = [...(st.gathered ?? []), ...(s.resolving!.created ?? [])];
        if (--st.left > 0) log(s, `${src} repeats the process.`);
      }
      if (e.gather) s.resolving!.created = (st.gathered ?? []).filter((id) => s.objects[id]?.zone === "battlefield");
      sc.repeat = undefined;
      return;
    }
    case "repeatIf": {
      // Grist: each pass, its instructions in order, then if the card milled qualifies, `then` and another pass; it ends
      // when one misses (an empty library mills nothing). Even with ~ gone, the process goes on (rulings).
      const sc = (s.resolving!.scratch ??= {});
      // What its instructions keep while they run (a draw's progress) starts over each pass, as for "repeat".
      const keep = (sc.repeatKeep ??= Object.keys(sc));
      for (let pass = 0; pass < 1000; pass++) {
        for (sc.repeatStep ??= 0; sc.repeatStep < e.effects.length; sc.repeatStep++) if (runEffect(s, e.effects[sc.repeatStep]!, ctx) === "paused") return "paused";
        sc.repeatStep = undefined;
        for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (k !== "repeatKeep" && !keep.includes(k)) delete sc[k];
        const milled = (s.resolving!.milled ?? []).map(({ id }) => defOf(s, s.objects[id]!));
        const cond = e.cond;
        // Sphinx's Tutelage: both cards nonland with a color in common, as they are in the graveyard (colorless isn't a color, rulings).
        // Hoarder's Greed: until a clash isn't won (rulings).
        const hit = cond.kind === "wonClash" ? !!s.resolving!.wonClash : cond.kind === "milledIs" ? milled.some((d) => printedMatches(cond.filter, d)) : milled.length === 2 && milled.every((d) => !isType(d, "Land")) && milled[0]!.colors.some((c) => milled[1]!.colors.includes(c));
        if (!hit) {
          sc.repeatKeep = undefined;
          return;
        }
        for (const inner of e.then) runEffect(s, inner, ctx);
        log(s, `${src} repeats the process.`);
      }
      sc.repeatKeep = undefined;
      return;
    }
    case "rollAgain": {
      // "You may roll again" (CR 706.3c): the same roll, with its modifiers, and the results table after it once more.
      // Asked after the row's other instructions are done (rulings on Delina: rolling again is optional).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const again = sc.may;
      if (again === undefined) {
        s.pending = { kind: "chooseMay", player: ctx.controller, prompt: "roll again", source: src };
        return "paused";
      }
      sc.may = undefined;
      if (!again) return;
      // The top-level roll this table belongs to: resolution goes on from it (the loop moves on to `next + 1`).
      let at = r.next - 1;
      while (at >= 0 && r.body.effects[at]!.type !== "roll") at--;
      if (at < 0) return;
      log(s, `${player(s, ctx.controller).name} rolls again.`);
      r.next = at - 1;
      return;
    }
    case "either": {
      // The controller picks one as it resolves (CR 608.2d), and only that one happens.
      const sc = (s.resolving!.scratch ??= {});
      // Invoke the Ancients: one choice for each permanent created, "it" being that one; one that's gone is skipped.
      if (e.eachCreated) {
        const r = s.resolving!;
        const st = (sc.eitherEach ??= { ids: [...(r.created ?? [])], done: 0 });
        for (; st.done < st.ids.length; st.done++) {
          const id = st.ids[st.done]!;
          if (s.objects[id]?.zone !== "battlefield") continue;
          if (sc.either === undefined) {
            const n = st.ids.length > 1 ? ` (${st.done + 1} of ${st.ids.length})` : "";
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: e.labels.map((_, i) => String(i)), labels: e.labels.map((l) => l.replace(/~/g, src)), prompt: `choose one for ${defOf(s, obj(s, id)).name}${n}`, about: id };
            return "paused";
          }
          r.created = [id];
          for (const inner of e.options[sc.either] ?? []) runEffect(s, inner, ctx);
          sc.either = undefined;
        }
        r.created = st.ids;
        sc.eitherEach = undefined;
        return;
      }
      if (sc.either === undefined) {
        // "Return an enchantment card ... or unlock a locked door": an option that can't be done can't be chosen (CR 608.2d).
        const can = e.labels.map((_, i) => i).filter((i) => !e.onlyDoable || canDoNow(s, e.options[i]!, ctx));
        if (!can.length) return;
        if (can.length === 1 && e.onlyDoable) sc.either = can[0]!;
        else {
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: can.map(String), labels: can.map((i) => e.labels[i]!.replace(/~/g, src)), prompt: "choose one" };
          return "paused";
        }
      }
      for (const inner of e.options[sc.either] ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
      if (e.forage) fireEvent(s, { type: "foraged", player: ctx.controller });
      return;
    }
    case "splitTargets": {
      // Retribution: one of the two targets picked as it resolves (CR 608.2d), among those still legal (CR 608.2b,
      // rulings: with one left, it's that one), by their controller or by the spell's controller (Cannibalize).
      const sc = (s.resolving!.scratch ??= {});
      if (sc.either === undefined) {
        const ids = [0, 1].map((i) => (s.resolving!.legal[i] ? objects(s, { ref: "target", index: i }, ctx)[0] : undefined));
        const can = [0, 1].filter((i) => ids[i]?.zone === "battlefield");
        if (!can.length) return;
        if (can.length === 1) sc.either = can[0]!;
        else {
          const chooser = e.chooser === "you" ? ctx.controller : controllerOf(s, ids[0]!);
          const name = (o: GameObject) => defOf(s, o).name;
          s.pending = { kind: "chooseOption", player: chooser, source: src, what: "splitTargets", options: can.map(String), labels: can.map((i) => e.label.replace("{0}", name(ids[i]!)).replace("{1}", name(ids[1 - i]!))), prompt: "choose one of the two creatures" };
          return "paused";
        }
      }
      for (const inner of e.options[sc.either] ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
    case "villainous": {
      // CR 701.55: each player facing it in APNAP order chooses an option, and all of it is done before the next one
      // chooses (701.55d); an option that can't be done is still a choice, done as far as it can be (701.55b). Each run
      // starts with what the one before it chose and found forgotten. The Valeyard has an opponent of its controller face
      // it once more for each, one time after the other (701.55c).
      const sc = (s.resolving!.scratch ??= {});
      const st = (sc.villain ??= { queue: apnap(s, players(s, e.who, ctx)).flatMap((pid) => Array<PlayerId>(1 + villainAgain(s, pid)).fill(pid)), keep: [...Object.keys(sc), "villain"] });
      while (st.queue.length) {
        const pid = st.queue[0]!;
        if (st.pick === undefined) {
          if (player(s, pid).lost) {
            st.queue.shift();
            continue;
          }
          s.pending = { kind: "chooseOption", player: pid, source: src, what: "villainous", options: ["0", "1"], labels: [...e.labels], prompt: "you face a villainous choice" };
          return "paused";
        }
        const sub: ResolveCtx = { ...ctx, event: { ...ctx.event, player: pid }, eachOne: pid };
        const fx = e.options[st.pick] ?? [];
        for (st.step ??= 0; st.step < fx.length; st.step++) if (runEffect(s, fx[st.step]!, sub) === "paused") return "paused";
        for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (!st.keep.includes(k)) delete sc[k];
        st.pick = st.step = undefined;
        st.queue.shift();
      }
      sc.villain = undefined;
      return;
    }
    case "joinForces": {
      // Join forces: from the controller on, in turn order, each player may pay any amount of mana (Minds Aglow; CR 101.4
      // doesn't apply, "starting with you" does), seeing what the ones before paid. Each says how much, then pays it.
      const sc = (s.resolving!.scratch ??= {});
      // Liege of the Hollows: from the active player on instead (rulings).
      const i = s.turnOrder.indexOf(e.activeFirst ? s.activePlayer : ctx.controller);
      // Errant Minion: "that player may pay any amount of mana": only that player.
      const j = (sc.join ??= { queue: e.who ? players(s, e.who, ctx).filter((pid) => !player(s, pid).lost).slice(0, 1) : [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((pid) => !player(s, pid).lost), paid: 0, by: {} });
      while (j.queue.length) {
        const pid = j.queue[0]!;
        if (j.asked === undefined && sc.payX === undefined) {
          const cap = Math.min(availableMana(s, pid), 40);
          if (cap > 0) {
            const options = ["none", ...Array.from({ length: cap }, (_, k) => String(k + 1))];
            s.pending = { kind: "chooseOption", player: pid, source: src, what: "payX", options, labels: options.map((o) => (o === "none" ? "Don't pay" : `Pay ${o}`)), prompt: `${src}: pay any amount of mana${e.activeFirst || e.who ? "" : ` (${j.paid} paid so far)`}` };
            return "paused";
          }
        } else if (j.asked === undefined && sc.payX !== "none") {
          j.asked = Number(sc.payX);
          sc.payX = undefined;
          sc.may = undefined;
          const pay = { mana: `{${j.asked}}` };
          s.pending = { kind: "chooseMay", player: pid, prompt: `pay ${describePay(pay)}`, source: src, pay };
          return "paused";
        } else if (j.asked !== undefined && sc.may) {
          j.paid += j.asked;
          j.by[pid] = j.asked;
        }
        sc.payX = sc.may = j.asked = undefined;
        j.queue.shift();
      }
      s.resolving!.joinForcesPaid = j.paid;
      s.resolving!.joinForcesPaidBy = j.by;
      log(s, `${j.paid} mana was paid for ${src}.`);
      sc.join = undefined;
      return;
    }
    case "eachMay": {
      // Each player decides in APNAP order, seeing the earlier answers (CR 101.4); then it happens to those who chose to.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.mayQueue) {
        // Someone who can't do it isn't asked (CR 101.3): "put two +1/+1 counters on a creature they control" with none.
        const need = e.need;
        // Maralen of the Mornsong: nobody can choose to draw or to have another player draw (rulings).
        const onlyDraws = e.effects.length > 0 && e.effects.every((x) => x.type === "draw");
        const can = (pid: PlayerId) =>
          !(onlyDraws && cantDraw(s, pid)) &&
          (!e.pay || canPayNow(s, pid, e.pay)) &&
          (!need ||
            (need.zone === "battlefield"
              ? s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, need.filter, obj(s, id), pid, false))
              : need.zone === "hand"
                ? player(s, pid).hand.length > 0
                : player(s, pid).graveyard.some((id) => printedMatches(need.filter, defOf(s, obj(s, id))))));
        const sub = ctx.subject && s.objects[ctx.subject.id];
        const untapped = !e.untappedSubject || (!!sub && sub.zone === "battlefield" && (sub.zoneChanges ?? 0) === ctx.subject!.zc && !sub.tapped);
        sc.mayQueue = untapped ? apnap(s, players(s, e.who, ctx)).filter(can) : [];
        sc.mayers = [];
      }
      while (sc.mayQueue.length) {
        const pid = sc.mayQueue[0]!;
        if (sc.may === undefined) {
          // "Each opponent who doesn't loses 2 life for each ..." (Fandaniel): the prompt says what declining costs.
          const after = e.each ? s.resolving!.body.effects[s.resolving!.next + 1] : undefined;
          const loss = after?.type === "loseLife" && after.who.ref === "notChoseThisWay" ? amountNow(s, after.n, ctx) : undefined;
          // The Second Doctor: what doing it means for an opponent.
          const you = player(s, ctx.controller).name;
          const ban = after?.type === "attackBanNextTurn" && pid !== ctx.controller ? `If you do, you can't attack ${you} or permanents ${you} controls during your next turn.` : undefined;
          // Web of Inertia, Jace, Multiverse Architect: what not doing it means for that player's attack this turn.
          const next = s.resolving!.body.effects[s.resolving!.next + 1];
          const webBan = next?.type === "if" && next.cond.kind === "theyChose" && next.cond.not && next.effects[0]?.type === "attackBanThisTurn" ? next.effects[0] : undefined;
          const webText = webBan ? `If you don't, creatures you control can't attack ${webBan.subtype ? `${webBan.subtype}s ${you} controls` : you} this turn.` : undefined;
          const otherwise = loss !== undefined ? `If you don't, you lose ${loss} life.` : (ban ?? webText);
          s.pending = { kind: "chooseMay", player: pid, prompt: e.text.replace(/~/g, src), source: src, ...(e.wheel !== undefined ? { wheel: typeof e.wheel === "number" ? e.wheel : amountNow(s, e.wheel, { ...ctx, eachOne: pid }) } : {}), ...(e.pay ? { pay: e.pay } : {}), ...(otherwise ? { otherwise } : {}) };
          return "paused";
        }
        if (sc.may) sc.mayers!.push(pid);
        sc.may = undefined;
        sc.mayQueue.shift();
      }
      // Who did, for the instructions after this one ("each player who drew a card this way gains 1 life").
      s.resolving!.choseThisWay = [...sc.mayers!];
      if (e.each) return eachAccepted(s, e, ctx);
      // Nobody did: nothing happens ("target opponent may have you draw three cards", Combustible Gearhulk).
      if (!sc.mayers!.length) return;
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
      // A spell's: the spell is its source (CR 113.7a), that object on the stack.
      const spell = item.kind === "spell" ? s.objects[sourceId] : undefined;
      const sourceZc = item.sourceZc ?? (spell ? (spell.zoneChanges ?? 0) : undefined);
      // "Return target creature card ... to the battlefield. When you do, it fights ..." (Back for More): about the object
      // acted on, which must be there for it to trigger (rulings on Curse of the Werefox).
      let about: { id: string; zc: number } | undefined;
      if (e.about) {
        const o = e.about === "created" ? objects(s, { ref: "created" }, ctx)[0] : objects(s, { ref: "target", index: e.about.target }, ctx).find((x) => x.zone === "battlefield");
        if (!o) return;
        if (typeof e.about === "object" && e.about.attached && !(s.resolving!.created ?? []).some((id) => s.objects[id]?.attachedTo === o.id)) return;
        if (typeof e.about === "object" && e.about.attachedThisWay && !(s.resolving!.attachedThisWay ?? []).some((id) => s.objects[id]?.zone === "battlefield" && s.objects[id]!.attachedTo === o.id && characteristics(s, s.objects[id]!).subtypes.includes("Equipment"))) return;
        about = { id: o.id, zc: o.zoneChanges ?? 0 };
      }
      const subject = about ?? item.subject;
      // Gilgamesh: "When you put one or more Equipment onto the battlefield this way": only if any are there now.
      // Yuna's Whistle: "When you reveal a creature card this way": only if one was found.
      if (e.xRevealedMv && s.resolving!.revealedUntilMv === undefined) return;
      // Cait Sith, Fortune Teller: "When you exile a card this way": only if the card is there; Hidetsugu, Devouring Chaos's
      // "a nonland card" only if it isn't a land card (CR 603.12).
      const exiled = e.xExiledMv && s.resolving!.exiledTop ? s.objects[s.resolving!.exiledTop.id] : undefined;
      if (e.xExiledMv && (!exiled || exiled.zone !== "exile" || (exiled.zoneChanges ?? 0) !== s.resolving!.exiledTop!.zc || (e.xExiledMv === "nonland" && characteristics(s, exiled).types.includes("Land")))) return;
      const put = e.putThisWay ? (s.resolving!.created ?? []).flatMap((id) => (s.objects[id]?.zone === "battlefield" ? [{ id, zc: s.objects[id]!.zoneChanges ?? 0 }] : [])) : undefined;
      if (put && !put.length) return;
      // "Create a Food token. When you do, ...": once for each of them created (CR 603.12a).
      const kind = e.perToken && tokenDef(e.perToken).oracleId;
      // Craig Boone, Novac Guard: once for every two quest counters put on it this way, so twice with Doubling Season's
      // four and not at all if none could be put (rulings).
      const perCounters = e.perCounters;
      const times = perCounters ? Math.floor((s.resolving!.countersPutThisWay ?? []).filter((c) => c.id === sourceId && c.kind === perCounters.counter).reduce((a, c) => a + (c.n ?? 1), 0) / perCounters.n) : kind ? (s.resolving!.created ?? []).filter((id) => s.objects[id]?.cardId === kind).length : 1;
      for (let i = 0; i < times; i++) s.triggerQueue.push({
        sourceId,
        sourceCardId: cardId,
        controller: ctx.controller,
        index: -1,
        body: e.body,
        ...(sourceZc !== undefined ? { sourceZc } : {}),
        ...(subject ? { subject } : {}),
        ...(spell ? { fromSpell: true as const } : {}),
        ...(s.resolving!.amassed ? { amassed: s.resolving!.amassed } : {}),
        // "When ~ dies, you may pay {E}{E}{E}. When you do, ~ deals damage equal to its power" (Cyclops Superconductor):
        // ~ as it last existed on the battlefield, like the ability that created it (CR 608.2h, 113.7a).
        ...(item.lki ? { lki: item.lki } : {}),
        ...(item.event ? { event: item.event } : {}),
        // "When you win the flip, copy that spell" in a cast trigger (Breeches, the Blastmaker): the same spell.
        ...(item.cause ? { cause: item.cause } : {}),
        // "That amount of excess damage" (Unleash the Inferno): the excess this spell dealt, its X (CR 603.12).
        // "You may pay {X}. When you do, ..." (Electro): the X paid, which the "may" put in ctx.
        // "Up to that many target creatures" after "you may sacrifice one or more Treasures" (Swashbuckler Extraordinaire).
        ...(e.xAmount ? { x: Math.max(0, amountNow(s, e.xAmount, ctx)) } : e.xDiscardedMv ? { x: ((id) => (id && s.objects[id] ? characteristics(s, s.objects[id]!).manaValue : 0))((s.resolving!.discardedAll ?? []).at(-1)) } : e.xDiscardedTypes ? { x: new Set((s.resolving!.discardedAll ?? []).flatMap((id) => (s.objects[id] ? defOf(s, s.objects[id]!).types : []))).size } : e.xExcess ? { x: s.resolving!.excessDamage ?? 0 } : e.xSacrificed ? { x: s.resolving!.sacrificedThisWay?.length ?? 0 } : e.xDiscarded ? { x: s.resolving!.discardedAll?.length ?? 0 } : e.xRevealedMv ? { x: s.resolving!.revealedUntilMv ?? 0 } : exiled ? { x: characteristics(s, exiled).manaValue } : ctx.x || item.x ? { x: ctx.x || item.x } : {}),
        ...(s.resolving!.rolled ? { rolled: s.resolving!.rolled.result } : {}),
        ...(s.resolving!.revealedFromHand !== undefined ? { revealed: s.resolving!.revealedFromHand } : {}),
        ...(s.resolving!.tappedThisWay !== undefined ? { tapped: s.resolving!.tappedThisWay } : {}),
        ...(e.sacrificed && s.resolving!.sacrificedThisWay ? { sacrificed: s.resolving!.sacrificedThisWay } : {}),
        ...(put ? { putThisWay: put } : {}),
      });
      return;
    }
    case "cumulativeUpkeep": {
      // CR 702.24a: an age counter first (once, even if it waits on the answer), then pay for each one or sacrifice.
      const sc = (s.resolving!.scratch ??= {});
      const o = objects(s, { ref: "self" }, ctx)[0];
      if (sc.n === undefined) {
        if (!o) return;
        // Through the replacement effects on counters (Doubling Season); with Solemnity none is put, and what's paid is
        // for the age counters already on it, {0} for none (rulings).
        const put = putCounters(s, o, "age", 1);
        sc.n = o.counters.age ?? 0;
        log(s, put ? `${src} gets ${put === 1 ? "an age counter" : `${put} age counters`} (${sc.n}).` : `${src} gets no age counter (${sc.n}).`);
      }
      // Hibernation's End: "Whenever you pay ~'s cumulative upkeep" triggers once it's paid.
      const paid: Effect = { type: "cumulativeUpkeepPaid" };
      if (e.selfCounter) return runEffect(s, { type: "may", effects: [...(sc.n ? [{ type: "counters", what: { ref: "self" }, counter: e.selfCounter, n: sc.n } as Effect] : []), paid], otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Put ${sc.n} ${e.selfCounter} counter${sc.n === 1 ? "" : "s"} on ~ to keep it (cumulative upkeep)`, keep: true }, ctx);
      if (e.drawCost) return runEffect(s, { type: "may", effects: [...(sc.n ? [{ type: "draw", who: { ref: "you" }, n: sc.n } as Effect] : []), paid], otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Draw ${sc.n === 1 ? "a card" : `${sc.n} cards`} to keep ~ (cumulative upkeep)`, keep: true }, ctx);
      if (e.addMana) return runEffect(s, { type: "may", effects: [...(sc.n ? [{ type: "addMana", mana: e.addMana.repeat(sc.n) } as Effect] : []), paid], otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Add ${e.addMana.repeat(sc.n)} to keep ~ (cumulative upkeep)`, keep: true }, ctx);
      // Phyrexian Soulgorger: that many different creatures, chosen and sacrificed as it resolves, or ~ is sacrificed; none
      // to sacrifice for no age counters (rulings).
      if (e.sacrificeCost) {
        if (!sc.n) return runEffect(s, paid, ctx);
        return runEffect(s, { type: "punisher", who: { ref: "you" }, options: [{ sacrifice: e.sacrificeCost, n: sc.n }], mode: "ifNone", effects: [{ type: "sacrifice", what: { ref: "self" } }], otherwise: [paid], thenText: "sacrifice ~ (cumulative upkeep)" }, ctx);
      }
      // Vexing Sphinx: that many cards discarded, or ~ is sacrificed; none to discard for no age counters.
      if (e.discardCost) {
        if (!sc.n) return runEffect(s, paid, ctx);
        return runEffect(s, { type: "punisher", who: { ref: "you" }, options: [{ discard: sc.n }], mode: "ifNone", effects: [{ type: "sacrifice", what: { ref: "self" } }], otherwise: [paid], thenText: "sacrifice ~ (cumulative upkeep)" }, ctx);
      }
      // Wall of Shards: whether to pay first, then an opponent for each age counter (the same or different ones, rulings),
      // only ones who can gain life (CR 119.7); then each chosen gains it all at once, as one payment (CR 702.24a). With no
      // such opponent it can't be paid (CR 118.3); with no age counter there's nothing to pay.
      if (e.giveLife) {
        if (!sc.n) return runEffect(s, paid, ctx);
        const can = opponents(s, ctx.controller).filter((q) => !player(s, q).lost && canGainLife(s, q));
        if (sc.may === undefined) {
          if (!can.length) sc.may = false;
          else {
            s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `have opponents gain ${sc.n * e.giveLife} life in all (${e.giveLife} for each age counter) to keep ~ (cumulative upkeep)`.replace(/~/g, src), otherwise: `If you don't, sacrifice ${src}.`, source: src, keep: true };
            return "paused";
          }
        }
        if (!sc.may) return runEffect(s, { type: "sacrifice", what: { ref: "self" } }, ctx);
        const picks = (sc.lifeTo ??= []);
        while (picks.length < sc.n) {
          if (can.length === 1) {
            picks.push(can[0]!);
            continue;
          }
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "giveLife", options: can.map(String), labels: can.map((q) => player(s, q).name), prompt: `choose an opponent to gain ${e.giveLife} life (${picks.length + 1} of ${sc.n})` };
          return "paused";
        }
        const each = new Map<PlayerId, number>();
        for (const q of picks) each.set(q, (each.get(q) ?? 0) + e.giveLife);
        log(s, `${player(s, ctx.controller).name} has ${[...each].map(([q, n]) => `${player(s, q).name} gain ${n} life`).join(", ")} to keep ${src}.`);
        for (const [q, n] of each) gainLife(s, q, n);
        return runEffect(s, paid, ctx);
      }
      const pay = timesPay(e.pay, sc.n);
      // "If [cost] has choices ... either the entire set of costs is paid, or none of them is" (CR 702.24a).
      return runEffect(s, { type: "may", effects: [paid], pay, otherwise: [{ type: "sacrifice", what: { ref: "self" } }], text: `Pay ${describePay(pay)} to keep ~ (cumulative upkeep)`, keep: true, cumulativeUpkeep: true }, ctx);
    }
    case "choosePlayer": {
      // Gluntch: one more player, different from those chosen before (rulings), any of them you; asked each time the
      // instruction is reached. With one left there's still that one to choose; with none, nobody is chosen.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (sc.asked) return;
      sc.asked = true;
      const left = apnap(s, s.turnOrder).filter((x) => !player(s, x).lost && !r.chosen?.players?.includes(x));
      r.chosen = { ...r.chosen, players: [...(r.chosen?.players ?? [])] };
      if (!left.length) return;
      s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "nthPlayer", options: left.map(String), labels: left.map((x) => (x === ctx.controller ? "You" : player(s, x).name)), prompt: e.prompt };
      return "paused";
    }
    case "choose": {
      // "Choose a creature type": the controller names one as it resolves (CR 608.2c-d); it's kept for the rest.
      const r = s.resolving!;
      if (e.choice === "opponent") {
        // "Choose an opponent" (CR 608.2d): one still in the game (CR 800.4a); with one, there's nothing to ask.
        // Sylvan Offering's second "Choose an opponent": a new choice (the same opponent allowed, rulings).
        const sc = (r.scratch ??= {});
        if (e.again && !sc.asked) {
          sc.asked = true;
          if (r.chosen) r.chosen = { ...r.chosen, player: undefined };
        }
        // Triarch Stalker: "the last chosen player" is kept on the permanent, while it's still that object (CR 400.7).
        const keep = () => {
          const me = e.keepOnSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) && r.chosen?.player !== undefined) {
            me.chosen = { ...me.chosen, player: r.chosen.player };
            invalidateCharacteristics(s);
          }
        };
        if (r.chosen?.player !== undefined) return keep();
        const living = apnap(s, s.turnOrder).filter((x) => !player(s, x).lost && (e.mostLife !== "opponents" || x !== ctx.controller));
        const most = e.mostLife === "least" ? Math.min(...living.map((x) => player(s, x).life)) : Math.max(...living.map((x) => player(s, x).life));
        // Wildfire Devils: "choose a player at random": any of them, you too (rulings).
        let opps = e.mostLife ? living.filter((x) => player(s, x).life === most) : e.anyPlayer ? living : opponents(s, ctx.controller);
        // Territorial Hellkite: not the player it attacked during its controller's last combat; any of them if it didn't
        // attack then, or wasn't theirs then (rulings). None left: none chosen.
        if (e.notAttackedLastCombat) {
          const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          const begun = player(s, ctx.controller).combatsBegun ?? [];
          const now = begun.at(-1);
          const ongoing = !!now && s.activePlayer === ctx.controller && inCombatPhase(s) && now.turn === s.turn && now.combat === (s.combatsThisTurn ?? 0);
          const last = ongoing ? begun.at(-2) : now;
          const hit = me?.attackedInCombat && last && me.attackedInCombat.turn === last.turn && me.attackedInCombat.combat === last.combat ? me.attackedInCombat.player : undefined;
          opps = opps.filter((x) => x !== hit);
          if (!opps.length) {
            log(s, `No opponent can be chosen for ${src}.`);
            return keep();
          }
        }
        // "At random": no one chooses (CR 608.2d doesn't apply).
        if (e.random && opps.length > 1) {
          const pick = opps[Math.floor(nextRandom(s) * opps.length)]!;
          r.chosen = { ...r.chosen, player: pick };
          log(s, `${player(s, pick).name} is chosen at random for ${src}.`);
          return keep();
        }
        if (opps.length === 1) {
          r.chosen = { ...r.chosen, player: opps[0]! };
          log(s, `${player(s, ctx.controller).name} chooses ${player(s, opps[0]!).name} for ${src}.`);
        }
        if (opps.length <= 1) return keep();
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt: e.mostLife === "opponents" ? "choose an opponent with the most life" : e.mostLife === "least" ? "choose a player with the lowest life total" : e.mostLife ? "choose a player with the most life" : "choose an opponent" };
        return "paused";
      }
      if (e.each) {
        // "Each player chooses a creature type": the active player first, then the others in turn order (Patriarch's
        // Bidding rulings). Each answer is added to Chosen.types (see chooseOption).
        const sc = (r.scratch ??= {});
        const asked = (sc.eachAsked ??= []);
        const next = apnap(s, s.turnOrder).find((x) => !player(s, x).lost && !asked.includes(x));
        if (next === undefined) return;
        asked.push(next);
        // "Each player chooses a color" (Selective Obliteration): in turn order too, each one's own (rulings).
        if (e.choice === "color") {
          r.chosen = { ...r.chosen, colorsBy: r.chosen?.colorsBy ?? {} };
          s.pending = { kind: "chooseOption", player: next, source: src, what: "color", options: choiceOptions("color") };
          return "paused";
        }
        r.chosen = { ...r.chosen, types: r.chosen?.types ?? [] };
        s.pending = { kind: "chooseOption", player: next, source: src, what: "creatureType", options: choiceOptions("creatureType") };
        return "paused";
      }
      if (e.choice === "cardType") {
        // "Choose artifact or enchantment. Destroy all permanents of the chosen type": a choice of its own each time the
        // instruction is reached (a mode chosen twice asks twice).
        const sc = (r.scratch ??= {});
        if (sc.asked) return;
        sc.asked = true;
        r.chosen = { ...r.chosen, cardType: undefined };
        // Teferi's Realm: "that player chooses" (the upkeep's player).
        const chooser = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
        if (chooser === undefined) return;
        s.pending = { kind: "chooseOption", player: chooser, source: src, what: "cardType", options: e.options ?? [] };
        return "paused";
      }
      if (e.choice === "typeOrder") {
        // Rite of Ruin: the order is chosen as it resolves, then each player sacrifices in it (rulings).
        if (r.chosen?.typeOrder) return;
        const labels = TYPE_ORDERS.map((o) => o.split(",").map((t) => `${t.toLowerCase()}s`).join(", then "));
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "typeOrder", options: [...TYPE_ORDERS], labels, prompt: "choose an order for artifacts, creatures, and lands: each player sacrifices one of the first, two of the second, then three of the third." };
        return "paused";
      }
      if (e.choice === "cardName") {
        // "Choose a nonland card name" (CR 201.4), as it resolves (rulings on Cabal Therapy): asked each time it's reached.
        const sc = (r.scratch ??= {});
        if (sc.asked) return;
        sc.asked = true;
        const chooser = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
        const options = cardNameOptions(s, e.names);
        r.chosen = { ...r.chosen, name: undefined };
        if (chooser === undefined || !options.length) return;
        const of = ctx.targets.find((t) => t?.kind === "player");
        s.pending = { kind: "chooseOption", player: chooser, source: src, what: "cardName", options, prompt: `choose ${e.names ? `a ${e.names.text} name` : "a card name"}`, purpose: e.purpose ?? "deny", ...(of?.kind === "player" ? { of: of.id } : {}) };
        return "paused";
      }
      if (e.choice === "number") {
        // Rites of Initiation: how many cards to discard at random, none to all of them (CR 107.1c); with none in hand, 0.
        if (r.chosen?.number === undefined && e.upToHand) {
          const most = player(s, ctx.controller).hand.length;
          if (!most) {
            r.chosen = { ...r.chosen, number: 0 };
            return;
          }
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "number", options: ["0"], numberRange: { min: 0, max: most }, prompt: `discard how many cards at random (0 to ${most})?` };
          return "paused";
        }
        if (r.chosen?.number !== undefined || !e.range) {
          // Shapeshifter: "the last chosen number" is kept on the permanent, while it's still that object (CR 400.7).
          const me = e.keepOnSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
          if (me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc) && r.chosen?.number !== undefined) {
            me.chosen = { ...me.chosen, number: r.chosen.number };
            invalidateCharacteristics(s);
          }
          return;
        }
        const bound = e.maxHandOf ?? e.maxLibraryOf;
        const range = bound ? { min: e.range.min, max: Math.max(e.range.min, ...players(s, bound, ctx).map((x) => player(s, x)[e.maxHandOf ? "hand" : "library"].length)) } : e.range;
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "number", options: [String(range.min)], numberRange: range, prompt: e.prompt ?? (bound ? `choose a number greater than ${e.range.min - 1} (up to ${range.max}, the cards in that player's ${e.maxHandOf ? "hand" : "library"})` : `choose a number between ${range.min} and ${range.max}`) };
        return "paused";
      }
      if (r.chosen?.[e.choice === "color" ? "color" : e.choice === "colors" ? "colors" : e.choice === "basicLandType" || e.choice === "landType" ? "landType" : e.choice === "keyword" ? "keyword" : e.choice === "parity" ? "parity" : e.choice === "direction" ? "direction" : e.choice === "landOrNonland" ? "landOrNonland" : "type"] === undefined) {
        const chooser = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
        if (chooser === undefined) return;
        s.pending = { kind: "chooseOption", player: chooser, source: src, what: e.choice, options: e.options ?? choiceOptions(e.choice, e.except), ...(e.choice === "landOrNonland" ? { labels: ["Land", "Nonland"], prompt: "choose land or nonland." } : e.choice === "direction" ? { labels: ["Left", "Right"], prompt: "choose left or right: each player may attack only the nearest opponent that way." } : {}) };
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
          : e.cond.kind === "theyChose"
          ? !!s.resolving!.choseThisWay?.length !== !!e.cond.not
          : e.cond.kind === "selfHere"
          ? objects(s, { ref: "self" }, ctx).some((o) => {
              const c = e.cond as { yours?: true; controlledByTarget?: number; controlledByEventPlayer?: true };
              const t = c.controlledByTarget !== undefined ? ctx.targets[c.controlledByTarget] : undefined;
              if (c.controlledByEventPlayer) return ctx.event?.player !== undefined && controllerOf(s, o) === ctx.event.player;
              return c.controlledByTarget !== undefined ? t?.kind === "player" && controllerOf(s, o) === t.id : !c.yours || controllerOf(s, o) === ctx.controller;
            })
          : e.cond.kind === "targetAlone"
          ? ((t) => {
              const o = t?.kind === "object" ? s.objects[t.id] : undefined;
              if (!o || o.zone !== "battlefield") return false;
              const pid = controllerOf(s, o);
              return !s.battlefield.some((id) => id !== o.id && objIsType(s, obj(s, id), "Creature") && controllerOf(s, obj(s, id)) === pid);
            })(ctx.targets[(e.cond as { index: number }).index])
          : e.cond.kind === "lifeAtLeastNoted"
          ? ((o) => o?.notedLife !== undefined && player(s, ctx.controller).life >= o.notedLife)(ctx.sourceId !== undefined ? s.objects[ctx.sourceId] : undefined)
          : e.cond.kind === "libraryHas"
          ? player(s, ctx.controller).library.length >= e.cond.n
          : e.cond.kind === "resolvedNth"
          ? e.cond.n.includes(s.resolving!.nth ?? 0) !== !!e.cond.not
          : e.cond.kind === "putOnTopThisWay"
          ? !!s.resolving!.putOnTop
          : e.cond.kind === "wonClash"
            ? !!(s.resolving!.wonClash ?? ctx.event?.wonClash)
            : e.cond.kind === "wonBidding"
            ? s.resolving!.bidWinner === ctx.controller
            : e.cond.kind === "wonFlip"
            ? !!s.resolving!.flipped && s.resolving!.flipped.won !== !!e.cond.lost
            : e.cond.kind === "atRandom"
            ? nextRandom(s) < 0.5
            : e.cond.kind === "destroyedThisWay"
            ? !!s.resolving!.destroyed?.some((d) => (!(e.cond as { died?: true }).died || d.died) && (!(e.cond as { you?: true }).you || d.ch.controller === ctx.controller) && (!(e.cond as { youOrToken?: true }).youOrToken || d.ch.controller === ctx.controller || !!d.o.isToken) && (!(e.cond as { cardType?: string }).cardType || d.ch.types.includes((e.cond as { cardType: string }).cardType)) && (!(e.cond as { color?: Color }).color || d.ch.colors.includes((e.cond as { color: Color }).color)))
            : e.cond.kind === "ownsNamedEverywhere"
            ? ((name) => {
                const mine = Object.values(s.objects).filter((o) => o.owner === ctx.controller && !o.isToken && !o.faceDown && !(o.zone === "exile" && (o.foretold || o.hiddenExile)));
                const card = (zone: string) => mine.some((o) => o.zone === zone && sameName(defOf(s, o).name, name));
                return card("exile") && card("hand") && card("graveyard") && mine.some((o) => o.zone === "battlefield" && sameName(characteristics(s, o).name, name));
              })(ctx.sourceDef.name)
            : e.cond.kind === "sacrificedThisWay"
            ? !!s.resolving!.sacrificedThisWay?.some((k) => (!(e.cond as { you?: true }).you || k.controller === ctx.controller) && (!(e.cond as { commander?: true }).commander || !!k.commander) && (!(e.cond as { snow?: true }).snow || !!k.snow) && ((sub) => !sub || !!k.subtypes?.includes(sub) || (!!k.allCreatureTypes && CREATURE_TYPES.has(sub)))((e.cond as { subtype?: string }).subtype))
            : e.cond.kind === "anotherDied"
            ? ((t) => (s.diedThisTurn?.length ?? 0) - (t?.kind === "object" && s.resolving!.destroyed?.some((d) => d.died && d.o.id === t.id) ? 1 : 0) > 0)(ctx.targets[e.cond.index])
            : e.cond.kind === "targetSpellTargets"
            ? ((t, f) => t?.kind === "stack" && targetsMatch(s, (s.stack.find((x) => x.id === t.id)?.targets ?? []).filter((x) => x.kind === "object" && s.objects[x.id]?.zone === "battlefield"), f, ctx.controller))(ctx.targets[e.cond.index], e.cond.filter)
            : e.cond.kind === "exiledThisWay"
            ? !!((e.cond as { cards?: true }).cards ? s.resolving!.exiledCards : s.resolving!.exiled)?.length
            : e.cond.kind === "digTook"
            ? !!s.resolving!.digTook
            : e.cond.kind === "searchFound"
            ? !!s.resolving!.searchFound?.some((id) => printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, obj(s, id))))
            : e.cond.kind === "shuffledInThisWay"
            ? !!s.resolving!.shuffledIn?.length
            : e.cond.kind === "bouncedThisWay"
            ? ((c) => !!s.resolving!.bouncedThisWay?.some((b) => (!c.subtype || b.subtypes.includes(c.subtype)) && (!c.another || b.id !== ctx.sourceId) && (!c.returned || !!(b as { returned?: true }).returned)))(e.cond as Extract<SpellCondition, { kind: "bouncedThisWay" }>)
            : e.cond.kind === "excessDealt"
            ? e.cond.redirected ? (s.resolving!.excessRedirected ?? 0) > 0 : (e.cond.target !== undefined ? (objects(s, { ref: "target", index: e.cond.target }, ctx).reduce((a, o) => a + (s.resolving!.excessTo?.[o.id] ?? 0), 0)) : e.cond.creature ? (s.resolving!.excessToCreatures ?? 0) : (s.resolving!.excessDamage ?? 0)) > 0
            : e.cond.kind === "noneAttackedYou"
            ? ctx.event?.amount === 0
            : e.cond.kind === "eventPlayerAttackedYou"
            ? ((a) => a?.turn === s.turn && a.players.includes(ctx.controller))(s.players[ctx.event?.player ?? -1]?.attackedInTurn) !== !!e.cond.not
            : e.cond.kind === "returnedYoursAtLeast"
            ? (s.resolving!.returnedNontoken ?? []).filter((c) => c === ctx.controller).length >= (e.cond as { n: number }).n
            : e.cond.kind === "rollIn"
            ? e.cond.aboveEvent
              ? ((r) => r !== undefined && (r > (ctx.event?.amount ?? 0) || r >= ((e.cond as { min?: number }).min ?? Infinity)))(s.resolving!.rolled?.result)
              : rollIn(e.cond, e.cond.eventMax ? ctx.event?.rollMax : e.cond.event ? ctx.event?.amount : s.resolving!.rolled?.result)
            : e.cond.kind === "foretold"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.foretold
            : e.cond.kind === "castInMain"
            ? !!s.resolving!.item.castInMain
            : e.cond.kind === "selfFromYourLibrary"
            ? ((o) => !!o && o.owner === ctx.controller && (ctx.sourceZc === undefined || (o.zoneChanges ?? 0) === ctx.sourceZc ? !!o.fromOwnLibrary : s.lastKnown?.[o.id]?.zc === ctx.sourceZc && !!s.lastKnown[o.id]!.fromOwnLibrary))(ctx.sourceId ? s.objects[ctx.sourceId] : undefined)
            : e.cond.kind === "castFromHandAndAnotherNamed"
            ? ((o) => !s.resolving!.item.copy && o?.castFrom === "hand" && (player(s, ctx.controller).castNames?.[defOf(s, o).name] ?? 0) >= 2)(s.objects[s.resolving!.item.objectId ?? ""])
            : e.cond.kind === "castFromGraveyard"
            ? !s.resolving!.item.copy && ((from) => (e.cond.kind === "castFromGraveyard" && e.cond.notHand ? !!from && from !== "hand" : from === (e.cond.kind === "castFromGraveyard" && e.cond.hand ? "hand" : e.cond.kind === "castFromGraveyard" && e.cond.exile ? "exile" : "graveyard")))(s.objects[s.resolving!.item.objectId ?? ""]?.castFrom)
            : e.cond.kind === "bargained"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.bargained
            : e.cond.kind === "costOrPaid"
            ? !s.resolving!.item.copy && s.objects[s.resolving!.item.objectId ?? ""]?.costOrPaid === e.cond.index
            : e.cond.kind === "evidence"
            ? evidenceCollected(s, ctx)
            : e.cond.kind === "treasure"
            ? (ctx.treasureSpent ?? 0) > 0
            : e.cond.kind === "colorsSpentActivated"
            ? new Set((s.resolving!.item.manaSpentTypes ?? []).filter((m) => "WUBRG".includes(m))).size === e.cond.exactly
            : e.cond.kind === "spent"
            ? spentMeets(e.cond.target === undefined ? ctx.spent : targetSpellSpent(s, ctx, e.cond.target), e.cond.req)
            : e.cond.kind === "revealedColoredSymbols"
            ? ((rv, n) => {
                const card = rv && s.objects[rv.id];
                return !!card && (card.zoneChanges ?? 0) === rv.zc && coloredManaSymbols(defOf(s, card).manaCost) >= n;
              })(s.resolving?.revealed, e.cond.atLeast)
            : e.cond.kind === "revealedIs"
            ? revealedIs(s, bindBound(s, bindChosen(e.cond.filter, ctx.chosen), amountCtx(s, ctx))) !== !!e.cond.not
            : e.cond.kind === "movedLinkedIs"
            ? (s.resolving!.movedLinkedIds ?? []).some((id) => s.objects[id] && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!)))
            : e.cond.kind === "revealedSharesCreatureType"
            ? revealedSharesType(s, ctx)
            : e.cond.kind === "subjectWasToken"
            ? !!ctx.lki?.token
            : e.cond.kind === "revealedSharesCardTypeWithSubject"
            ? ((rv) => {
                const card = rv && s.objects[rv.id];
                if (!card || (card.zoneChanges ?? 0) !== rv.zc) return false;
                const sub = objects(s, { ref: "subject" }, ctx)[0];
                const types = sub?.zone === "battlefield" ? characteristics(s, sub).types : (ctx.lki?.types ?? []);
                return defOf(s, card).types.some((t) => types.includes(t));
              })(s.resolving!.revealed)
            : e.cond.kind === "targetExiled"
            ? ((t) => !!t && t.kind === "object" && !!ctx.legal[e.cond.index] && s.objects[t.id]?.zone === "exile" && (s.objects[t.id]!.zoneChanges ?? 0) === (t.zc ?? 0) + 1)(ctx.targets[e.cond.index])
            : e.cond.kind === "revealedMv"
            ? revealedMv(s) === amountNow(s, e.cond.mv, ctx)
            : e.cond.kind === "createdNone"
            ? !s.resolving!.created?.length
            : e.cond.kind === "putThisWayIs"
            ? (s.resolving!.created ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "revealedNameInYard"
            ? ((rv) => !!rv && !!s.objects[rv.id] && (s.objects[rv.id]!.zoneChanges ?? 0) === rv.zc && player(s, ctx.controller).graveyard.some((id) => id !== rv.id && sameName(defOf(s, obj(s, id)).name, defOf(s, s.objects[rv.id]!).name)))(s.resolving!.revealed)
            : e.cond.kind === "yardChosenIs"
            ? (s.resolving!.yardChosen ?? []).some((id) => !!s.objects[id] && printedMatches(bindBound(s, (e.cond as { filter: TargetSpec }).filter, amountCtx(s, ctx)), defOf(s, s.objects[id]!)))
            : e.cond.kind === "putIntoHandIs"
            ? [...(s.resolving!.putIntoHand ?? []), ...(s.resolving!.dugToHandCards ?? [])].some((id) => s.objects[id]?.zone === "hand" && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!))) || (!!e.cond.orState && staticConditionNow(s, e.cond.orState, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller, ctx.event?.player, undefined, ctx.sourceId ? ctx.sourceZc : undefined))
            : e.cond.kind === "returnedToHandIs"
            ? (s.resolving!.returnedToHand ?? []).some((id) => s.objects[id]?.zone === "hand" && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!)))
            : e.cond.kind === "impulsedIs"
            ? (s.resolving!.impulsed ?? []).some((id) => s.objects[id] && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!)))
            : e.cond.kind === "revealedTopIs"
            ? ((f) => (s.resolving!.revealedUntil ?? []).some((id) => !!s.objects[id] && printedMatches(f, defOf(s, s.objects[id]!))))(((f) => (f.named === "~" ? { ...f, named: ctx.sourceDef.name } : f))((e.cond as { filter: TargetSpec }).filter))
            : e.cond.kind === "milledShareTypes"
            ? ((ds) => ds.length === 2 && [...ds[0]!.types].sort().join() === [...ds[1]!.types].sort().join())((s.resolving!.milled ?? []).map(({ id }) => defOf(s, s.objects[id]!)))
            : e.cond.kind === "milledIs"
            ? (s.resolving!.milled ?? []).some(({ id }) => printedMatches(bindChosen((e.cond as { filter: TargetSpec }).filter, ctx.chosen), defOf(s, s.objects[id]!)))
            : e.cond.kind === "targetIs"
            ? targetIs(s, ctx, e.cond.index, e.cond.filter)
            : e.cond.kind === "targetSharesName"
            ? // Winnow: another permanent on the battlefield has its name; a face-down permanent has none (CR 708.2).
              ((o) => !!o && o.zone === "battlefield" && !o.faceDown && s.battlefield.some((id) => id !== o.id && !obj(s, id).faceDown && characteristics(s, obj(s, id)).name === characteristics(s, o).name))(ctx.legal[e.cond.index] ? objects(s, { ref: "target", index: e.cond.index }, ctx)[0] : undefined)
            : e.cond.kind === "targetSharesTypeWithCostExiled"
            ? ((o) => !!o && ((types) => objects(s, { ref: "costExiled" }, ctx).some((x) => defOf(s, x).types.some((t) => types.includes(t))))(defOf(s, o).types))(ctx.legal[e.cond.index] ? objects(s, { ref: "target", index: e.cond.index }, ctx)[0] : undefined)
            : e.cond.kind === "targetsSameColors"
            ? targetsSameColors(s, ctx, e.cond.index, e.cond.n)
            : e.cond.kind === "targetSharesColorWith"
            ? ((f, i) => {
                // Jaded Response: the colors among those permanents as it resolves (rulings), none for colorless ones.
                const colors = [...new Set(s.battlefield.map((id) => obj(s, id)).filter((o) => objectMatches(s, f, o, ctx.controller, false)).flatMap((o) => characteristics(s, o).colors))];
                const t = ctx.targets[i];
                return colors.length > 0 && !!t && targetIs(s, ctx, i, { kind: t.kind === "stack" ? "spell" : "object", types: [], notTypes: [], notColors: [], colors, text: "shares a color" });
              })(e.cond.filter, e.cond.index)
            : e.cond.kind === "targetGreatestPower"
            ? ((o) => !!o && o.zone === "battlefield" && objIsType(s, o, "Creature") && !s.battlefield.some((id) => id !== o.id && objIsType(s, obj(s, id), "Creature") && power(s, obj(s, id)) > power(s, o)))(ctx.legal[e.cond.index] ? objects(s, { ref: "target", index: e.cond.index }, ctx)[0] : undefined)
            : e.cond.kind === "flickeredIs"
            ? (s.resolving!.flickeredBack ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "damagedThisWayIs"
            ? (s.resolving!.damagedThisWay ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "playerDamagedThisWay"
            ? (s.resolving!.playersDamagedThisWay ?? []).length > 0
            : e.cond.kind === "playerMoreLifeThanYou"
            ? ((c) => {
                const lands = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && objIsType(s, s.objects[id]!, "Land")).length;
                const measure = (pid: PlayerId) => (c.lands ? lands(pid) : player(s, pid).life);
                return players(s, c.who, ctx).some((pid) => (!c.lands || !player(s, pid).lost) && measure(pid) > measure(ctx.controller));
              })(e.cond)
            : e.cond.kind === "subjectExploitedBySelf"
            ? !!ctx.lki?.exploitedBy && ctx.lki.exploitedBy.id === ctx.sourceId && (ctx.sourceZc === undefined || ctx.lki.exploitedBy.zc === ctx.sourceZc)
            : e.cond.kind === "subjectWasAttacking"
            ? ((o) => (o ? o.attacking !== undefined : ctx.lki?.attacking !== undefined))(objects(s, { ref: "subject" }, ctx)[0])
            : e.cond.kind === "cycledSelfNamed"
            ? ((o) => !!o && (player(s, ctx.controller).cycledNames?.[defOf(s, o).name] ?? 0) >= (e.cond as { n: number }).n)(ctx.sourceId ? s.objects[ctx.sourceId] : undefined)
            : e.cond.kind === "causeTargetsPermanentOrPlayer"
            ? (() => {
                const item = s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause ?? ""];
                return (item?.targets ?? []).some((t) => t.kind === "player" || (t.kind === "object" && ((o) => !!o && o.zone === "battlefield" && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc))(s.objects[t.id])));
              })()
            : e.cond.kind === "causeSpellIs"
            ? ((f) => {
                // The spell the cast trigger is about, on the stack or gone from it (its card, as it was cast).
                const item = s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause ?? ""];
                const o = item?.objectId ? s.objects[item.objectId] : undefined;
                return !!o && printedMatches(f, defOf(s, o));
              })(e.cond.filter)
            : e.cond.kind === "subjectIs"
            ? ((f) => {
                // Gone from the battlefield: a creature type as it last existed (CR 608.2h), when that's all it asks.
                const o = objects(s, { ref: "subject" }, ctx)[0];
                const typeOnly = Object.entries(f).every(([k, v]) => ["kind", "types", "notTypes", "notColors", "subtypes", "text"].includes(k) && (!Array.isArray(v) || k === "subtypes" || !v.length));
                if (o?.zone !== "battlefield" && ctx.lki?.subtypes && typeOnly && f.subtypes?.length) return f.subtypes.some((t) => ctx.lki!.subtypes!.includes(t) || (!!ctx.lki!.allCreatureTypes && CREATURE_TYPES.has(t)));
                return objects(s, { ref: "subject" }, ctx).some((x) => objectMatches(s, f, x, ctx.controller, false));
              })(e.cond.filter)
            : e.cond.kind === "noPlayerChosen"
            ? s.resolving?.chosen?.player === undefined
            : e.cond.kind === "subjectYours"
            ? players(s, { ref: "subjectController" }, ctx).includes(ctx.controller)
            : e.cond.kind === "subjectCardIs"
            ? objects(s, { ref: "subjectCard" }, ctx).some((o) => printedMatches(e.cond.kind === "subjectCardIs" ? e.cond.filter : ({} as TargetSpec), defOf(s, o)))
            : e.cond.kind === "targetCardWas"
            ? Array.from({ length: e.cond.n ?? 1 }, (_, k) => (e.cond as { index: number }).index + k).some((i) => targetCardWas(s, ctx, i, (e.cond as { filter: TargetSpec }).filter))
            : e.cond.kind === "unlessPaid"
            ? !!s.resolving!.unlessPaid
            : e.cond.kind === "spellCountered"
            ? !!s.resolving!.spellCountered
            : e.cond.kind === "targetPlayerIsYou"
            ? ((t) => !!ctx.legal[(e.cond as { index: number }).index] && t?.kind === "player" && t.id === ctx.controller)(ctx.targets[e.cond.index])
            : e.cond.kind === "targetWarped"
            ? ((t) => !!ctx.legal[(e.cond as { index: number }).index] && t?.kind === "object" && ["warp", "grantedWarp"].includes(s.objects[t.id]?.castAlt ?? ""))(ctx.targets[e.cond.index])
            : e.cond.kind === "targetPlayerLostLife"
            ? ((t) => !!ctx.legal[(e.cond as { index: number }).index] && t?.kind === "player" && (s.lostLifeThisTurn ?? []).includes(t.id))(ctx.targets[e.cond.index])
            : e.cond.kind === "targetWasYours"
            ? targetWasYours(s, ctx, e.cond.index)
            : e.cond.kind === "teamwork"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.teamwork
            : e.cond.kind === "gift"
            ? gifteeOf(s, ctx) !== undefined
            : e.cond.kind === "altPaid"
            ? e.cond.alt === "mayhem"
              ? s.resolving!.item.kind === "spell" && s.objects[s.resolving!.item.objectId ?? ""]?.castVia === "mayhem"
              : (s.resolving!.item.kind === "spell" ? s.objects[s.resolving!.item.objectId ?? ""]?.castAlt : ctx.event?.castAlt) === e.cond.alt
            : e.cond.kind === "returnedNonbasicLandType"
            ? !!ctx.lki?.returnedSubtypes?.some((t) => LAND_TYPES.has(t) && !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(t))
            : e.cond.kind === "sacrificedSuspected"
            ? !!ctx.sacrificed?.[0]?.suspected
            : e.cond.kind === "sacrificedLegendary"
            ? !!ctx.sacrificed?.[0]?.legendary
            : e.cond.kind === "sacrificedColor"
            ? !!ctx.sacrificed?.[0]?.colors?.includes((e.cond as { color: Color }).color)
            : e.cond.kind === "sacrificedType"
            ? !!ctx.sacrificed?.[0]?.types?.includes((e.cond as { type: string }).type)
            : e.cond.kind === "sacrificedSubtype"
            ? ((k, c) => !!k && (!!k.allCreatureTypes || [c.subtype, ...(c.orSubtypes ?? [])].some((t) => !!k.subtypes?.includes(t))))(ctx.sacrificed?.[0], e.cond)
            : e.cond.kind === "youDiscardedGreatestMv"
            ? ((ids) => {
                const mv = (id: ObjectId) => characteristics(s, s.objects[id]!).manaValue;
                const top = Math.max(...ids.map(mv));
                return ids.some((id) => s.objects[id]!.owner === ctx.controller && mv(id) === top);
              })((s.resolving!.discardedAll ?? []).filter((id) => !!s.objects[id]))
            : e.cond.kind === "discardedThisWayIs"
            ? ((f) => (s.resolving!.discardedAll ?? []).some((id) => !!s.objects[id] && printedMatches(f, defOf(s, s.objects[id]!))))(e.cond.filter)
            : e.cond.kind === "activatedTimes"
            ? ((src, index) => index !== undefined && !!src && (src.zoneChanges ?? 0) === s.resolving!.item.sourceZc && (src.activatedThisTurn ?? []).filter((n) => n === index).length >= (e.cond as { n: number }).n)(s.objects[s.resolving!.item.sourceId ?? ""], s.resolving!.item.activatedIndex)
            : e.cond.kind === "costExiledIs"
            ? ((f) => (s.resolving!.item.costExiled ?? []).some((c) => !!s.objects[c.id] && printedMatches(f, defOf(s, s.objects[c.id]!))))(e.cond.filter)
            : e.cond.kind === "exiledFromHandIs"
            ? ((f) => (s.resolving!.exiledFromHandCards ?? []).some((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc && printedMatches(f, defOf(s, s.objects[c.id]!))))(e.cond.filter)
            : e.cond.kind === "discardedIs"
            ? ((f) => (s.resolving!.item.costDiscarded ?? []).some((k) => !!s.cards[k] && printedMatches(f, s.cards[k]!)))(e.cond.filter)
            : e.cond.kind === "suspected"
            ? objects(s, e.cond.what, ctx).some((o) => o.zone === "battlefield" && o.suspected !== undefined)
            : e.cond.kind === "state"
            ? ((sub) => staticConditionNow(s, (e.cond as { cond: StaticCondition }).cond, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller, ctx.event?.player, undefined, ctx.sourceId ? ctx.sourceZc : undefined, sub?.id, sub?.zc))(e.cond.subject ? objects(s, e.cond.subject, ctx).map((o) => ({ id: o.id, zc: o.zoneChanges ?? 0 }))[0] : ctx.subject)
            : e.cond.kind === "voteWins"
            ? voteWins(s, e.cond.option, !!e.cond.orTie)
            : e.cond.kind === "allChose"
            ? ((option) => { const chose = Object.entries(s.resolving!.chose ?? {}).filter(([p]) => !player(s, Number(p)).lost); return chose.length > 0 && chose.every(([, w]) => w === option); })(e.cond.option)
            : e.cond.kind === "amountNow"
            ? ((n) => (e.cond.kind !== "amountNow" ? false : (e.cond.min === undefined || n >= e.cond.min) && (e.cond.max === undefined || n <= e.cond.max)))(amountNow(s, e.cond.amount, ctx))
            : e.cond.kind === "transformedThisWay"
            ? !!s.resolving!.transformedThisWay
            : e.cond.kind === "powerBecame"
            ? ((me, n) => s.resolving!.powerBefore !== undefined && s.resolving!.powerBefore !== n && me?.zone === "battlefield" && power(s, me) === n)(objects(s, { ref: "self" }, ctx)[0], e.cond.n)
            : e.cond.kind === "amountsCompare"
            ? amountNow(s, e.cond.a, ctx) >= amountNow(s, e.cond.atLeast, ctx)
            : e.cond.kind === "xAtLeast"
            ? (ctx.x ?? 0) >= e.cond.n
            : kickedMatches(ctx.kicked, e.cond);
      return runBranch(s, holds, holds ? e.effects : (e.otherwise ?? []), ctx);
    }
  }
}

/**
 * "If it's a creature", "if its mana value is less than or equal to ..." about a target (SpellCondition "targetIs"): that
 * permanent as it is now, a card in a graveyard or a spell by its printed characteristics (a spell's mana value with its X,
 * CR 202.3e), still a legal target. An amount is counted now (TargetSpec.bound).
 */
function targetIs(s: GameState, ctx: ResolveCtx, index: number, filter0: TargetSpec): boolean {
  const filter = bindBound(s, filter0, amountCtx(s, ctx));
  const t = ctx.targets[index];
  if (!ctx.legal[index] || !t) return false;
  if (t.kind === "stack") {
    const item = s.stack.find((x) => x.id === t.id);
    return !!item && item.kind === "spell" && spellMatches(s, filter, item);
  }
  if (t.kind !== "object") return false;
  // "If that creature is another Hero" (Wakandan Royal Guard): not the source itself.
  if (filter.notSource && t.id === ctx.sourceId) return false;
  const o = objects(s, { ref: "target", index }, ctx)[0];
  if (o?.zone === "battlefield") return objectMatches(s, filter, o, ctx.controller, false);
  const card = s.objects[t.id];
  return !!card && card.zone === "graveyard" && (t.zc === undefined || (card.zoneChanges ?? 0) === t.zc) && printedMatches(filter, defOf(s, card));
}

/** Dead Ringers (SpellCondition "targetsSameColors"): each target's colors now, or as it last existed on the battlefield. */
function targetsSameColors(s: GameState, ctx: ResolveCtx, index: number, n: number): boolean {
  const sets: string[] = [];
  for (let i = index; i < index + n; i++) {
    const t = ctx.targets[i];
    if (t?.kind !== "object") return false;
    const o = s.objects[t.id];
    const here = o?.zone === "battlefield" && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc);
    const lk = s.lastKnown?.[t.id];
    const colors = here ? characteristics(s, o).colors : lk && (t.zc === undefined || lk.zc === t.zc) ? lk.source?.colors : undefined;
    if (!colors) return false;
    sets.push([...colors].sort().join(""));
  }
  return sets.every((x) => x === sets[0]);
}

/** "If it was a creature card" (SpellCondition "targetCardWas"): the target card, wherever it went, by its printed characteristics. */
function targetCardWas(s: GameState, ctx: ResolveCtx, index: number, filter: TargetSpec): boolean {
  const t = ctx.targets[index];
  // Glorious Gale: "If it was a legendary spell": the target spell, on the stack or the card it became once countered.
  const spellId = t?.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.objectId ?? ctx.spellObjects?.[index]) : undefined;
  const card = t?.kind === "object" ? s.objects[t.id] : spellId ? s.objects[spellId] : undefined;
  return !!ctx.legal[index] && !!card && printedMatches(bindChosen(filter, ctx.chosen), defOf(s, card));
}

/**
 * "If you controlled that permanent" (SpellCondition "targetWasYours"): a legal target still on the battlefield is checked
 * as it is now; one this resolution moved, by its controller as it last existed on the battlefield (CR 608.2h).
 */
function targetWasYours(s: GameState, ctx: ResolveCtx, index: number): boolean {
  const t = ctx.targets[index];
  if (!ctx.legal[index] || t?.kind !== "object") return false;
  const o = s.objects[t.id];
  if (o?.zone === "battlefield" && (t.zc === undefined || (o.zoneChanges ?? 0) === t.zc)) return controllerOf(s, o) === ctx.controller;
  const lk = s.lastKnown?.[t.id];
  return !!lk && (t.zc === undefined || lk.zc === t.zc) && lk.controller === ctx.controller;
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

/** The revealed card's mana value, by its printed mana cost (X is 0 off the stack, CR 202.3e); none revealed, none. */
function revealedMv(s: GameState): number | undefined {
  const rv = s.resolving?.revealed;
  const o = rv && s.objects[rv.id];
  return o && (o.zoneChanges ?? 0) === rv.zc ? defMv(defOf(s, o)) : undefined;
}

/**
 * Does the revealed card share a creature type with this ability's source (kinship)? The source as it is on the
 * battlefield; once gone, as it last existed there (CR 608.2h), or its card if it never was. Changeling counts in any
 * zone (CR 702.73a).
 */
function revealedSharesType(s: GameState, ctx: ResolveCtx): boolean {
  const rv = s.resolving?.revealed;
  const o = rv && s.objects[rv.id];
  if (!o || (o.zoneChanges ?? 0) !== rv.zc) return false;
  return shareCreatureType(sourceCreatureTypes(s, ctx), creatureTypesOf(s, o));
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
export function canPayNow(s: GameState, pid: PlayerId, pay: PayCost, use: ManaUse = "other"): boolean {
  const p = player(s, pid);
  if (pay.life && payableLife(s, pid) < pay.life) return false;
  if (pay.energy && (p.energy ?? 0) < pay.energy) return false;
  return !pay.mana || canPayFromPool(s, pid, parseManaCost(pay.mana), use) || !!planMana(s, pid, parseManaCost(pay.mana), 0, undefined, [], use);
}

/** The mana cost of the resolving ability's source, X as 0; null when it has none (an unpayable cost, CR 118.6). */
function manaCostToPay(s: GameState, ctx: ResolveCtx): string | null {
  const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const cost = o ? defOf(s, o).manaCost : "";
  if (!cost) return null;
  return cost.replace(/\{X\}/g, "") || "{0}";
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
/** The card a "you may exile it and collect evidence N" exiles first (Lamplight Phoenix), if it's there to exile. */
function selfCardExiled(s: GameState, effects: Effect[], ctx: ResolveCtx): ObjectId | undefined {
  const first = effects[0];
  return first?.type === "exile" && first.what.ref === "selfCard" ? objects(s, first.what, ctx)[0]?.id : undefined;
}

function canDoNow(s: GameState, effects: Effect[], ctx: ResolveCtx): boolean {
  for (const e0 of effects) {
    // "Cards named ~" (Dragon's Approach): the source's name (CR 201.5).
    const e = e0.type === "chooseFromGraveyard" && e0.filter?.named === "~" ? { ...e0, filter: { ...e0.filter, named: ctx.sourceDef.name } } : e0;
    // What a pick picks ("it", Akiri's "that creature") isn't known until it's made.
    if ("what" in e && typeof e.what === "object" && e.what && "ref" in e.what && e.what.ref === "created" && effects.some((x) => x.type === "pick" && effects.indexOf(x) < effects.indexOf(e))) continue;
    // Discarding your hand can be done with an empty hand (rulings on Moonveil Regent).
    if (e.type === "discard" && e.who.ref === "you" && !e.hand && !player(s, ctx.controller).hand.some((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))))) return false;
    // "You may discard two cards. If you do, ..." (Thrilling Discovery): discarding fewer isn't doing it (CR 609.3).
    if (e.type === "discard" && e.who.ref === "you" && !e.hand && typeof e.n === "number" && e.n > 1 && !e.upTo && player(s, ctx.controller).hand.length < e.n) return false;
    if (e.type === "draw" && e.who.ref === "you" && !player(s, ctx.controller).library.length) return false;
    if (e.type === "draw" && cantDraw(s, ctx.controller)) return false;
    if (e.type === "draw" && e.who.ref === "target" && !players(s, e.who, ctx).some((pid) => !player(s, pid).lost && player(s, pid).library.length)) return false;
    if (e.type === "handToTop" && !player(s, ctx.controller).hand.length) return false;
    // Neera, Wild Mage: "you may put it on the bottom of its owner's library. If you do": only while the spell is still on the stack.
    if (e.type === "causeToBottom" && !s.stack.some((x) => x.id === ctx.cause && x.kind === "spell")) return false;
    // "You may mill three cards" (Druidic Ritual): not with fewer cards in your library (CR 701.17b, rulings).
    if (e.type === "mill" && e.who.ref === "you" && typeof e.n === "number" && player(s, ctx.controller).library.length < e.n) return false;
    // "You may discard a card or sacrifice a land" (Highway Robbery): only with one of them possible (rulings).
    if (e.type === "either" && e.onlyDoable && !e.options.some((o) => canDoNow(s, o, ctx))) return false;
    if (e.type === "unlockDoor" && !e.what && !lockedDoors(s, ctx.controller).length) return false;
    // Ratchet, Field Medic: "you may convert ~. When you do, ...": only if it turns over now, the same object that hasn't
    // transformed since the ability was put on the stack (CR 701.27f, rulings: a second trigger does nothing).
    if (e.type === "transform" && e.what.ref === "self") {
      const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (!me || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || (me.transforms ?? 0) !== (ctx.sourceTransforms ?? 0) || (me.isToken ? !defOf(s, me).tokenBack || me.tokenBackUp : !canTransform(s, me))) return false;
    }
    // Petals of Insight: only with a looked-at card still on top to put on the bottom.
    if (e.type === "revealedUntilToBottom" && !(s.resolving?.revealedUntil ?? []).some((id) => s.objects[id]?.zone === "library")) return false;
    // Entrails Feaster: "you may exile a creature card from a graveyard": any player's graveyard.
    if (e.type === "chooseFromGraveyard" && (e.dest === "exile" || e.dest === "libraryBottom" || (!e.dest && !e.fromExile && !e.upTo && !e.anyNumber)) && !e.who && !(e.anyGraveyard ? livingPlayers(s).flatMap((pid) => player(s, pid).graveyard) : player(s, ctx.controller).graveyard).some((id) => (!e.notSelf || id !== ctx.sourceId) && (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id)))))) return false;
    // "You may exile eight cards from your graveyard. If you do, ..." (Emeritus of Ideation): exiling fewer isn't doing it
    // (CR 609.3).
    if (e.type === "chooseFromGraveyard" && (e.dest === "exile" || e.dest === "libraryBottom") && !e.who && !e.upTo && !e.nAmount && e.n > 1 && player(s, ctx.controller).graveyard.filter((id) => (!e.notSelf || id !== ctx.sourceId) && (!e.filter || printedMatches(e.filter, defOf(s, obj(s, id))))).length < e.n) return false;
    if (e.type === "loseLife" && !players(s, e.who, ctx).some((pid) => !player(s, pid).lost && canLoseLife(s, pid))) return false;
    // "You may gain 1 life for each creature card in your graveyard. If you do, ..." (Skyfisher Spider): gaining no life,
    // or life that can't be gained, isn't gaining life (CR 119.7, 119.9).
    if (e.type === "gainLife" && e.who.ref === "you" && (!canGainLife(s, ctx.controller) || amountNow(s, e.n, ctx) <= 0)) return false;
    // Sigarda, Host of Herons: an opponent's spell or ability can't give its controller the option (rulings).
    if (e.type === "sacrifice" && !objects(s, e.what, ctx).some((o) => (e.byController || controllerOf(s, o) === ctx.controller) && canBeSacrificed(s, o))) return false;
    if (e.type === "exile" && (e.what.ref === "selfCard" || e.what.ref === "subjectCard") && !objects(s, e.what, ctx).length) return false;
    if (e.type === "tap" && e.what.ref === "self" && !objects(s, e.what, ctx).some((o) => !o.tapped)) return false;
    // Only tapped permanents can be untapped (CR 701.26b), but with more to do it does only as much as it can (CR 609.3):
    // Yasova Dragonclaw's "you may pay ... If you do, gain control of target creature ..., untap that creature, and it gains
    // haste" can be paid for an untapped creature.
    // Hauntwoods Shrieker: "If it's a creature card, you may turn it face up": no choice unless it is one, still face down.
    if (e.type === "turnFaceUp" && e.ifCreatureCard && !objects(s, e.what, ctx).some((o) => o.zone === "battlefield" && !!o.faceDown && isType(realDefOf(s, o), "Creature"))) return false;
    if (e.type === "untap" && e.what.ref === "target" && effects.length === 1 && !objects(s, e.what, ctx).some((o) => o.tapped)) return false;
    if (e.type === "continuous" && e.what.ref === "target" && !objects(s, e.what, ctx).some((o) => o.zone === "battlefield")) return false;
    if (e.type === "continuous" && !objects(s, e.what, ctx).length) return false;
    // Jolted Awake: "If you do, return it from your graveyard to the battlefield", with no target chosen ("up to one"):
    // nothing to return, so nothing to pay for.
    if (e.type === "putOntoBattlefield" && e.what.ref === "target" && !objects(s, e.what, ctx).length) return false;
    // Iroh, Tea Master: "have target opponent gain control of ...": only with that player still a legal target, in the game.
    if (e.type === "continuous" && e.giveTo && !players(s, e.giveTo, ctx).some((p) => !player(s, p).lost)) return false;
    if (e.type === "counters" && (e.what.ref === "target" || (e.what.ref === "self" && effects.length === 1)) && !objects(s, e.what, ctx).some((o) => o.zone === "battlefield")) return false;
    // "Gain control of target land ... for as long as you control ~" (Orcish Squatters): over before it begins if you no
    // longer control ~ (CR 611.2b), so it can't be done.
    if (e.type === "continuous" && e.duration === "whileControlled" && !e.whileOnBattlefield && !(ctx.sourceId && whileControlledHolds(s, { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0, controller: ctx.controller }))) return false;
    // "You may have it assign no combat damage this turn" (Cloak of Confusion): only a creature still on the battlefield.
    if (e.type === "noCombatDamage" && !objects(s, e.what, ctx).some((o) => o.zone === "battlefield")) return false;
    if (e.type === "becomeCopy" && (!objects(s, e.what, ctx).length || !objects(s, e.of, ctx).length)) return false;
    if (e.type === "attach" && e.what.ref === "target" && !e.source && ((me) => !me || me.zone !== "battlefield" || (ctx.sourceZc !== undefined && (me.zoneChanges ?? 0) !== ctx.sourceZc) || !characteristics(s, me).subtypes.includes("Equipment") || !objects(s, e.what, ctx).some((h) => h.zone === "battlefield" && h.id !== me.id))(ctx.sourceId ? s.objects[ctx.sourceId] : undefined)) return false;
    // Magnanimous Magistrate: "you may remove that many reprieve counters": a number counted as it resolves.
    if (e.type === "removeCounters" && typeof e.n !== "string" && ((n) => !objects(s, e.what, ctx).some((o) => (o.counters[e.counter] ?? 0) >= n))(amountNow(s, e.n, ctx))) return false;
    if (e.type === "removeAnyCounters" && typeof e.n === "number" && !e.upTo && !objects(s, e.what, ctx).some((o) => Object.values(o.counters).reduce((a, b) => a + Math.max(0, b ?? 0), 0) >= (e.n as number))) return false;
    // A processor's "you may put two cards your opponents own from exile ...": not with fewer there (rulings).
    if (e.type === "processExile" && !e.adventureOf && processCandidates(s, ctx.controller).length < e.n) return false;
    if (e.type === "processExile" && e.adventureOf && !adventureExileCards(s, players(s, e.adventureOf, ctx)[0]).length) return false;
    if (e.type === "parleyToGraveyards" && !(s.resolving?.parley?.ids ?? []).some((id) => s.objects[id]?.zone === "library")) return false;
    if (e.type === "removeExiledCounter" && !exiledWithCounter(s, players(s, e.owner, ctx), e.counter).length) return false;
    // "Unless you exile the top creature card of your graveyard" (Barrow Ghoul): you can't with no creature card there.
    if ((e.type === "exile" || e.type === "putOntoBattlefield") && e.what.ref === "graveyardEnd" && !objects(s, e.what, ctx).length) return false;
    // "You may put it into your graveyard" after revealing nothing (an empty library) or a card that has left: nothing to ask.
    if ("what" in e && typeof e.what === "object" && e.what && "ref" in e.what && e.what.ref === "revealed" && !objects(s, e.what, ctx).length) return false;
    // Damage to a target that's no longer legal isn't dealt (CR 608.2b); a creature that's gone deals none.
    if (e.type === "damage" && "index" in e.to && !ctx.legal[e.to.index]) return false;
    if (e.type === "bounce" && e.what.ref === "target" && !objects(s, e.what, ctx).length) return false;
    if (e.type === "bite" && (!objects(s, e.a, ctx).length || !objects(s, e.b, ctx).length)) return false;
    // Collecting evidence takes enough mana value in your graveyard (CR 701.59b).
    if (e.type === "collectEvidence" && evidenceProblem(s, ctx.controller, e.n, undefined, selfCardExiled(s, effects, ctx))) return false;
    // "Unless you return a non-Lair land you control": you can't if you have none.
    if (e.type === "pick" && e.who.ref === "you" && pickOptions(s, e, ctx.controller, ctx.sourceId).length < amountNow(s, e.n, ctx)) return false;
    // Phyrexian Dreadnought: "unless you sacrifice any number of creatures with total power 12 or greater": only with that
    // much power to sacrifice (rulings: otherwise that option can't be chosen).
    if (e.type === "pick" && e.who.ref === "you" && e.minTotalPower !== undefined && pickOptions(s, e, ctx.controller, ctx.sourceId).reduce((t, id) => t + Math.max(0, power(s, obj(s, id))), 0) < e.minTotalPower) return false;
    // Fugitive of the Judoon: "exile a Human you control and an artifact you control": two different permanents.
    if (e.type === "pick" && e.who.ref === "you" && e.leaving) {
      const next = pickOptions(s, { filter: e.leaving }, ctx.controller, ctx.sourceId);
      if (!pickOptions(s, e, ctx.controller, ctx.sourceId).some((id) => next.some((x) => x !== id))) return false;
    }
  }
  return true;
}

/** "Pay life equal to that card's mana value" (Protection Racket): only life, counted as the punisher starts. */
function lifeOnly(o: PunisherOption): o is { pay: UnlessPays } {
  return "pay" in o && !o.pay.cost && !o.pay.generic && o.pay.life === undefined && !!o.pay.lifeAmount && Object.keys(o.pay).every((k) => k === "cost" || k === "lifeAmount");
}

/** What a punisher's option reads as on its button: "Discard a card", "Sacrifice a nonland permanent", "Pay {2}". */
export function punisherLabel(o: PunisherOption): string {
  if ("discard" in o) return o.filter ? `Discard ${o.discard === 1 ? (/^[aeiou]/i.test(o.filter.text) ? "an" : "a") : o.discard} ${o.filter.text}` : o.discard === 1 ? "Discard a card" : `Discard ${o.discard} cards`;
  if ("sacrifice" in o) return (o.n ?? 1) > 1 ? `Sacrifice ${o.n} ${o.sacrifice.text.replace(/\b(creature|land|artifact|permanent)\b/, "$1s")}` : `Sacrifice ${o.sacrifice.sourceHost ? "the" : /^[aeiou]/i.test(o.sacrifice.text) ? "an" : "a"} ${o.sacrifice.text}`;
  if ("damage" in o) return `Be dealt ${o.damage} damage`;
  if ("allow" in o) return o.allow;
  if ("halfLife" in o) return `Pay half your life, rounded ${o.halfLife}`;
  if ("handToTop" in o) return `Put ${o.handToTop === 1 ? "a card" : `${o.handToTop} cards`} from your hand on top of your library`;
  if ("exileFromGraveyard" in o) return `Exile ${o.exileFromGraveyard === 1 ? "a card" : `${o.exileFromGraveyard} cards`} from your graveyard`;
  if (!o.pay.cost && o.pay.generic === undefined && o.pay.life !== undefined) return `Pay ${o.pay.life} life`;
  return `Pay ${o.pay.cost}${o.pay.life ? ` and ${o.pay.life} life` : ""}`;
}

/** Which of a punisher's options this player can do now: enough cards to discard (CR 701.9b), a permanent to sacrifice. */
export function punisherOptions(s: GameState, e: Extract<Effect, { type: "punisher" }>, pid: PlayerId, sourceId?: string, made: string[] = []): number[] {
  const p = player(s, pid);
  // With several picks (Rottenmouth Viper), the cards and permanents picked before can't be picked again (rulings).
  const discarding = made.reduce((n, m) => n + (e.options[Number(m)] && "discard" in e.options[Number(m)]! ? (e.options[Number(m)] as { discard: number }).discard : 0), 0);
  const sacrificing = made.reduce((n, m) => {
    const o = e.options[Number(m)];
    return n + (o && "sacrifice" in o ? (o.n ?? 1) : 0);
  }, 0);
  // "Pay 5 life": only with at least that much (CR 119.4, rulings on Dash Hopes).
  // "Unless they discard a nonland card": only with one in hand.
  return e.options.flatMap((o, i) => (("discard" in o && (o.filter ? p.hand.filter((id) => printedMatches(o.filter!, defOf(s, obj(s, id)))) : p.hand).length < discarding + o.discard) || ("sacrifice" in o && pickOptions(s, { filter: o.sacrifice }, pid, sourceId).length < sacrificing + (o.n ?? 1)) || ("pay" in o && !o.pay.cost && !o.pay.generic && (o.pay.life ?? 0) > payableLife(s, pid)) || ("halfLife" in o && halfOfLife(s, pid, o.halfLife) > payableLife(s, pid)) || ("exileFromGraveyard" in o && p.graveyard.length < o.exileFromGraveyard) || ("handToTop" in o && p.hand.length < discarding + o.handToTop) ? [] : [i]));
}

/** Half a player's life total, rounded as the text says; 0 for a total of 0 or less (CR 107.1a-b). */
export function halfOfLife(s: GameState, pid: PlayerId, round: "up" | "down"): number {
  const life = Math.max(0, player(s, pid).life);
  return round === "up" ? Math.ceil(life / 2) : Math.floor(life / 2);
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
    // "Equal to ~'s power" (Combustion Man): the amount as the choices start, the same for everyone.
    // Protection Racket: "pay life equal to that card's mana value", likewise (a payment of 0 life can always be made, CR 119.4).
    // A lone "unless pays life equal to ..." (Essence Vortex) stays with paidUnless, which counts it as it asks.
    const chosen = !!e.mode || e.options.length > 1;
    // Archfiend of Spite: "sacrifice that many permanents": that many as the choices start.
    const options = e.options.map((o) => ("damage" in o && typeof o.damage !== "number" ? { damage: amountNow(s, o.damage, ctx) } : "sacrifice" in o && o.nAmount !== undefined ? { sacrifice: o.sacrifice, n: Math.max(1, amountNow(s, o.nAmount, ctx)) } : chosen && lifeOnly(o) ? { pay: { cost: "", life: Math.max(0, amountNow(s, o.pay.lifeAmount!, ctx)) } } : o));
    const doomed = e.effects.length === 1 && e.effects[0]!.type === "destroy" ? objects(s, e.effects[0]!.what, ctx)[0]?.id : undefined;
    // For the bots: damage counted as the choices start (Osseous Sticktwister's "equal to its power", Craig Boone's counters).
    const dmg = e.effects.length === 1 && e.effects[0]!.type === "damage" ? e.effects[0]! : undefined;
    const dmgN = dmg?.type === "damage" && typeof dmg.amount !== "number" ? Math.max(0, amountNow(s, dmg.amount, ctx)) : undefined;
    // Archfiend of Spite: "loses that much life", counted as the choices start.
    const lost = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
    const loseN = lost !== undefined && typeof lost !== "number" ? Math.max(0, amountNow(s, lost, ctx)) : undefined;
    const hurt = dmg?.type === "damage" && "index" in dmg.to && dmg.to.ref === "target" ? objects(s, { ref: "target", index: dmg.to.index }, ctx)[0] : undefined;
    sc.punish = { queue: apnap(s, players(s, e.who, ctx)), picked: {}, made: {}, round: 0, times, picks, options, ...punisherHarm(e), ...(dmgN !== undefined && !hurt ? { lose: dmgN } : {}), ...(loseN !== undefined ? { lose: loseN } : {}), ...(hurt && dmg?.type === "damage" ? { hurts: { id: hurt.id, n: dmgN ?? (typeof dmg.amount === "number" ? dmg.amount : 0) }, lose: undefined } : {}), ...(doomed ? { destroys: doomed } : {}), ...(e.mode ? { mode: e.mode } : {}) };
  }
  const fixLife = (o: PunisherOption) => (!!e.mode || e.options.length > 1) && lifeOnly(o);
  if (e.options.some((o) => ("damage" in o && typeof o.damage !== "number") || ("sacrifice" in o && o.nAmount !== undefined) || fixLife(o))) e = { ...e, options: e.options.map((o, i) => ("damage" in o || ("sacrifice" in o && o.nAmount !== undefined) || fixLife(o) ? sc.punish!.options[i]! : o)) };
  // "A permanent of their choice that shares a card type with it" (Braids): the types of what was sacrificed this way.
  if (e.options.some((o) => "sacrifice" in o && o.sacrifice.sharesTypeWithSacrificed)) {
    const types = [...new Set((s.resolving!.sacrificedThisWay ?? []).flatMap((k) => k.types ?? []))];
    e = { ...e, options: e.options.map((o) => ("sacrifice" in o && o.sacrifice.sharesTypeWithSacrificed ? { ...o, sacrifice: { ...o.sacrifice, sharesTypeWithSacrificed: undefined, types: types.length ? types : ["(none)"] } } : o)) };
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
          else if (!e.mode && can.length === 1 && e.options.length === 1 && "pay" in e.options[can[0]!]!) pu.picked[pid] = String(can[0]);
          else {
            const penalty = e.mode ? "Don't" : describePenalty(s, e, ctx);
            const which = pu.picks > 1 ? ` (${made.length + 1} of ${pu.picks})` : "";
            const did = Object.values(pu.made).some((m) => m.some((x) => x !== "none"));
            const prompt = !e.mode ? `${can.map((i) => punisherLabel(e.options[i]!).toLowerCase()).join(" or ")}, or ${lowerFirst(penalty)}?${which}` : `${can.map((i, k) => (k ? punisherLabel(e.options[i]!).toLowerCase() : punisherLabel(e.options[i]!))).join(" or ")}? ${e.who.ref === "you" ? (e.mode === "ifAny" ? "If you do" : "If you don't") : e.mode === "ifAny" ? "If anyone does" : "If no one does"}, ${(e.thenText ?? "it happens").replace(/~/g, src)}${did ? " (someone already has)" : ""}.`;
            s.pending = { kind: "chooseOption", player: pid, source: src, what: "punisher", options: [...can.map(String), "none"], labels: [...can.map((i) => punisherLabel(e.options[i]!)), penalty], prompt };
            return "paused";
          }
        }
        const o = pu.picked[pid] === "none" ? undefined : e.options[Number(pu.picked[pid])];
        if (o && "halfLife" in o) {
          // Temporal Extortion: half their life as it is now, paid as it's chosen (CR 119.4); 0 life can always be paid.
          const n = halfOfLife(s, pid, o.halfLife);
          if (n) payLife(s, pid, n);
          log(s, `${p.name} pays ${n} life (half their life, rounded ${o.halfLife}).`);
        } else if (o && "pay" in o && (e.mode || e.options.length > 1) && !o.pay.cost && !o.pay.generic && !o.pay.discard && o.pay.life !== undefined) {
          // "Any player may pay 5 life" (Dash Hopes), "sacrifices a creature or pays 3 life" (Indulgent Tormentor):
          // chosen on the prompt above, so paid now, not asked again (CR 119.4).
          if (o.pay.life) payLife(s, pid, o.pay.life);
          log(s, `${p.name} pays ${o.pay.life} life.`);
        } else if (o && "pay" in o) {
          const paid = e.mode ? paidUnless(s, ctx, pid, o.pay, src, "don't", "don't pay") : paidUnless(s, ctx, pid, o.pay, src, lowerFirst(describePenalty(s, e, ctx)), lowerFirst(describePenalty(s, e, ctx)));
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
      // A card of a kind ("a nonland card", one option only, see the parser): only those can be picked.
      const discardFilter = made.map((m) => e.options[Number(m)]).find((o): o is Extract<PunisherOption, { discard: number }> => !!o && "discard" in o && !!o.filter)?.filter;
      const discardable = discardFilter ? p.hand.filter((id) => printedMatches(discardFilter, defOf(s, obj(s, id)))) : p.hand;
      if (discards && !mine.discard) {
        if (sc.chosen?.[pid] && sc.queue?.length === 0) mine.discard = sc.chosen[pid]!;
        else if (discardable.length <= discards) mine.discard = [...discardable];
        else {
          sc.chosen = {};
          sc.queue = [pid];
          s.pending = { kind: "discard", player: pid, count: discards, source: src, ...(discardFilter ? { filter: discardFilter } : {}) };
          return "paused";
        }
        sc.chosen = undefined;
        sc.queue = undefined;
      }
      // Carrion Wurm: which cards of their graveyard they exile (only exactly that many can be, CR 701.13a).
      const yardN = made.reduce((n, m) => {
        const o = e.options[Number(m)];
        return n + (o && "exileFromGraveyard" in o ? o.exileFromGraveyard : 0);
      }, 0);
      if (yardN && !mine.exile) {
        if (pu.yardAsked === pid && sc.found) mine.exile = sc.found;
        else if (p.graveyard.length <= yardN) mine.exile = [...p.graveyard];
        else {
          pu.yardAsked = pid;
          sc.found = undefined;
          s.pending = { kind: "searchLibrary", player: pid, source: src, what: yardN === 1 ? "a card" : `${yardN} cards`, cards: [...p.graveyard], min: yardN, max: yardN, fromGraveyard: "exile" };
          return "paused";
        }
        pu.yardAsked = undefined;
        sc.found = undefined;
      }
      // Tainted Specter: which cards of their hand go on top of their library (the last one picked ends on top).
      const topN = made.reduce((n, m) => {
        const o = e.options[Number(m)];
        return n + (o && "handToTop" in o ? o.handToTop : 0);
      }, 0);
      if (topN && !mine.top) {
        const rest = p.hand.filter((id) => !(mine.discard ?? []).includes(id));
        if (pu.topAsked === pid && sc.chosen?.[pid]) mine.top = sc.chosen[pid]!;
        else if (rest.length <= topN) mine.top = [...rest];
        else {
          pu.topAsked = pid;
          sc.chosen = undefined;
          s.pending = { kind: "handToTop", player: pid, count: topN, source: src };
          return "paused";
        }
        pu.topAsked = undefined;
        sc.chosen = undefined;
      }
      const sacs = made.flatMap((m) => {
        const o = e.options[Number(m)];
        return o && "sacrifice" in o ? Array.from({ length: o.n ?? 1 }, () => o.sacrifice) : [];
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
      // Sin Prodder: once a player does, no one else is asked (rulings).
      if (e.firstOnly && made.some((x) => x !== "none")) pu.queue.length = 0;
    }
    if (!pu.acted) {
      const who = apnap(s, Object.keys(pu.made).map(Number) as PlayerId[]);
      // "Unless that player discards a card": a cost, paid as it resolves (CR 118.12a), so not Library of Leng's.
      for (const pid of who) discardCards(s, pid, (pu.chosen?.[pid]?.discard ?? []).filter((id) => player(s, pid).hand.includes(id)), "", false, false, ctx.controller);
      for (const pid of who) {
        const top = (pu.chosen?.[pid]?.top ?? []).filter((id) => player(s, pid).hand.includes(id));
        for (const id of [...top].reverse()) moveObject(s, id, "library", { top: true });
        if (top.length) log(s, `${player(s, pid).name} puts ${top.length === 1 ? "a card" : `${top.length} cards`} from their hand on top of their library.`);
      }
      for (const pid of who) {
        const gone = (pu.chosen?.[pid]?.exile ?? []).filter((id) => player(s, pid).graveyard.includes(id));
        if (gone.length) log(s, `${player(s, pid).name} exiles ${gone.map((id) => defOf(s, obj(s, id)).name).join(", ")} from their graveyard.`);
        for (const id of gone) moveObject(s, id, "exile");
      }
      for (const pid of who)
        for (const id of pu.chosen?.[pid]?.sacrifice ?? []) {
          const x = s.objects[id];
          if (x?.zone !== "battlefield") continue;
          log(s, `${player(s, pid).name} sacrifices ${defOf(s, x).name}.`);
          moveObject(s, id, "graveyard", { sacrificed: true });
        }
      // "Have it deal 4 damage to them": the source deals it, to each who chose to, all at once.
      const hurt = who.flatMap((pid) => pu.made[pid]!.flatMap((m) => {
        const o = e.options[Number(m)];
        return o && "damage" in o && typeof o.damage === "number" ? [{ pid, n: o.damage }] : [];
      }));
      if (hurt.length) {
        const from = ctxSource(s, ctx);
        dealDamageBatch(s, hurt.map((h) => ({ src: from, to: { player: h.pid }, n: h.n })));
      }
      pu.acted = true;
      pu.penalty = 0;
      sc.mayStep = e.mode ? 0 : e.effects.length;
    }
    // "If a player does" / "If no one does": once, or not at all; Rhystic Lightning's `otherwise` if not.
    if (e.mode) {
      const did = Object.values(pu.made).some((m) => m.some((x) => x !== "none"));
      const then = did === (e.mode === "ifAny") ? e.effects : (e.otherwise ?? []);
      // "That player" (Sin Prodder): the one who did.
      if (e.firstOnly && did && sc.mayStep === 0) s.resolving!.choseThisWay = Object.keys(pu.made).map(Number).filter((pid) => pu.made[pid]!.some((x) => x !== "none")) as PlayerId[];
      for (; sc.mayStep! < then.length; sc.mayStep!++) if (runEffect(s, then[sc.mayStep!]!, ctx) === "paused") return "paused";
      sc.punish = sc.punished = sc.mayStep = undefined;
      return;
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

/** "Lose 3 life" in the middle of a sentence, but not "Ana may draw a card". */
const lowerFirst = (t: string) => (/^(?:Lose|Take|Let) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** What the penalty costs the punished player, for the bots: life lost, or tokens made for its controller. */
function punisherHarm(e: Extract<Effect, { type: "punisher" }>): { lose?: number; tokens?: number; discards?: number; losesSource?: true } {
  const [f] = e.effects;
  if (e.effects.length !== 1 || !f) return {};
  if (f.type === "sacrifice" && f.what.ref === "self") return { losesSource: true };
  if (f.type === "loseLife" && typeof f.n === "number") return { lose: f.n };
  if (f.type === "damage" && typeof f.amount === "number") return { lose: f.amount };
  if (f.type === "createToken") return { tokens: 1 };
  if (f.type === "discard" && typeof f.n === "number" && f.who.ref === "punished" && !f.filter) return { discards: f.n };
  return {};
}

/** The penalty, for its button: "Lose 3 life", "Ana may draw a card" (Rhystic Study). */
function describePenalty(s: GameState, e: Extract<Effect, { type: "punisher" }>, ctx: ResolveCtx): string {
  if (e.penalty) return e.penalty.replace(/\{you\}/g, player(s, ctx.controller).name).replace(/~/g, ctx.sourceDef?.name ?? "it");
  if (e.thenText) return `${player(s, ctx.controller).name} ${e.thenText}`;
  const lose = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
  if (typeof lose === "number") return `Lose ${lose} life`;
  if (lose !== undefined) return `Lose ${Math.max(0, amountNow(s, lose, ctx))} life`;
  const d = punisherHarm(e).discards;
  return d ? `Discard ${d} cards` : "Take the penalty";
}

/**
 * A tempting offer's instructions for each player who accepted, as if each were "you" (rulings on Tempt with Glory: then
 * the second part once for each opponent who did, "that player" being them). One player's after another; each run starts
 * with the choices of the one before forgotten, while what the resolution held before it began is kept.
 */
function eachAccepted(s: GameState, e: Extract<Effect, { type: "eachMay" }>, ctx: ResolveCtx): "paused" | void {
  const sc = s.resolving!.scratch!;
  const did = sc.mayers ?? [];
  const second = e.perAccepted ? did.filter((p) => !e.perAccepted!.opponents || opponents(s, ctx.controller).includes(p)) : [];
  const runs = [...did.map((p) => ({ p, fx: e.effects, as: p })), ...second.map((p) => ({ p, fx: e.perAccepted!.effects, as: ctx.controller }))];
  sc.offer ??= { i: 0, keep: [...Object.keys(sc), "offer", "mayStep"] };
  while (sc.offer.i < runs.length) {
    const run = runs[sc.offer.i]!;
    if (player(s, run.p).lost) {
      sc.offer.i++;
      continue;
    }
    const sub: ResolveCtx = { ...ctx, controller: run.as, eachOne: run.p };
    for (sc.mayStep ??= 0; sc.mayStep < run.fx.length; sc.mayStep++) if (runEffect(s, run.fx[sc.mayStep]!, sub) === "paused") return "paused";
    for (const k of Object.keys(sc) as (keyof typeof sc)[]) if (!sc.offer.keep.includes(k)) delete sc[k];
    sc.mayStep = undefined;
    sc.offer.i++;
  }
}

/** Cards in exile owned by these players with one or more of these counters on them, the most counters first. */
export function exiledWithCounter(s: GameState, owners: PlayerId[], counter: string): ObjectId[] {
  return owners
    .flatMap((pid) => player(s, pid).exile)
    .filter((id) => (obj(s, id).counters[counter] ?? 0) > 0)
    .sort((a, b) => (obj(s, b).counters[counter] ?? 0) - (obj(s, a).counters[counter] ?? 0));
}

/** How many more times `pid` faces a villainous choice: one for each The Valeyard an opponent of theirs controls (CR 701.55c). */
function villainAgain(s: GameState, pid: PlayerId): number {
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return abilitiesOf(s, o).villainAgain && controllerOf(s, o) !== pid;
  }).length;
}

/** Thick-Skinned Goblin: does the echo trigger's permanent's controller control one that lets them pay {0} instead? */
function echoZeroFor(s: GameState, ctx: ResolveCtx): boolean {
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  if (me?.zone !== "battlefield") return false;
  const you = controllerOf(s, me);
  return s.battlefield.some((id) => controllerOf(s, obj(s, id)) === you && !!abilitiesOf(s, obj(s, id)).echoZero);
}

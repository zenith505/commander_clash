import { allEffects, type Effect, type ObjRef, type PayCost, type PunisherOption, type TargetSpec } from "../abilities";
import { manaValue, parseManaCost, spentMeets, type ManaSpent } from "../mana";
import { canPayFromPool } from "../spend";
import { planMana } from "../autopay";
import { autoEvidence, availableMana, canLoseLife, collectEvidence, creatureTypesOf, draw, evidenceProblem, log, loseLife, moveObject, obj, opponents, payableLife, player, shareCreatureType } from "../game";
import { cardIdOf, defOf } from "../cards";
import { controllerOf, staticConditionNow } from "../layers";
import type { GameState, ObjectId, PlayerId } from "../types";
import { bindBound, bindChosen, choiceOptions, objectMatches, pickOptions, printedMatches, spellMatches } from "./targeting";
import { ResolveCtx, apnap, objects, players, runEffect, amountNow, amountCtx, gifteeOf, evidenceCollected, sourceCreatureTypes, ctxSource } from "./resolve";
import { dealDamageBatch } from "../damage";
import { kickedMatches, paidUnless } from "./run-spells";
import { discardCards } from "./run-library";
import { describePay } from "./describe";
import { doesNothingNow } from "./heuristics";
import { cardNameOptions } from "../names";
import { voteWins } from "./run-votes";

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
      // "You may pay {X}": X first (CR 107.1c), at most what the player could pay, then the payment with that X.
      if (e.payX && e.pay?.mana && sc.may === undefined) {
        if (sc.payX === undefined) {
          const rest = manaValue(parseManaCost(e.pay.mana.replace("{X}", "")));
          let cap = Math.min(availableMana(s, ctx.controller) - rest, e.payX.max ? amountNow(s, e.payX.max, ctx) : Infinity);
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
          const pay = { ...e.pay, mana: e.pay.mana.replace("{X}", e.payX.color && n > 0 ? `{${e.payX.color}}`.repeat(n) : `{${n}}`) };
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
      const pay = e.payEnergy !== undefined ? { ...e.pay, energy: Math.max(0, amountNow(s, e.payEnergy, ctx)) } : e.pay;
      if (sc.may === undefined) {
        // Fabricate: with the permanent gone, the counters can't be put on it, so it's the tokens (rulings).
        const onSelf = e.effects.every((x) => "what" in x && x.what?.ref === "self") && (e.effects.length > 0 || !!e.otherwise?.every((x) => "what" in x && x.what?.ref === "self"));
        if (e.otherwise && onSelf && !objects(s, { ref: "self" }, ctx).length) sc.may = false;
        else if (pay && !canPayNow(s, ctx.controller, pay)) sc.may = false; // can't pay, so can't do it
        else if (!canDoNow(s, e.effects, ctx)) sc.may = false; // nothing to discard: "if you do" can't happen
        // Paying to untap what's already untapped gets nothing: not worth asking (unless not paying does something).
        else if (pay && !e.otherwise?.length && ctx.sourceId && doesNothingNow(s, ctx.sourceId, { targets: [], effects: e.effects, text: "" })) sc.may = false;
        else if (e.effects.length === 1 && e.effects[0]!.type === "collectEvidence") {
          // "You may collect evidence N": picking the cards is the answer, none is "no" (CR 701.59a).
          s.pending = { kind: "collectEvidence", player: ctx.controller, n: e.effects[0]!.n, source: src };
          return "paused";
        } else {
          // About the card "reveal/look at the top card" found: it's named, and shown (the controller has seen it).
          const rv = s.resolving?.revealed;
          const card = rv && allEffects(e.effects).some((x) => x.type === "revealRevealed" || ("what" in x && (x.what as { ref?: string } | undefined)?.ref === "revealed")) ? s.objects[rv.id] : undefined;
          const prompt = card ? e.text.replace("the revealed card", defOf(s, card).name) : e.payEnergy !== undefined ? `${e.text} (${pay!.energy} energy)` : e.text;
          s.pending = { kind: "chooseMay", player: ctx.controller, prompt: prompt.replace(/~/g, src), source: src, ...(card ? { card: card.id } : {}), ...(pay ? { pay } : {}), ...(e.keep ? { keep: true } : {}) };
          return "paused";
        }
      }
      r.did = sc.may;
      if (!sc.may) {
        for (const inner of e.otherwise ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
        return;
      }
      if (source && !source.triggeredThisTurn?.includes(key)) (source.triggeredThisTurn ??= []).push(key);
      const xctx = e.payX ? { ...ctx, x: Number(sc.payX) } : ctx;
      for (const inner of e.effects) if (runEffect(s, inner, xctx) === "paused") return "paused";
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
      for (const inner of e.effects) if (runEffect(s, inner, ctx) === "paused") return "paused";
      if (!player(s, ctx.controller).library.length) return;
      s.pending = { kind: "chooseMay", player: ctx.controller, prompt: `repeat: ${e.text}`, source: src, repeat: true };
      return "paused";
    }
    case "repeatIf": {
      // Grist: each pass, its instructions in order, then if the card milled qualifies, `then` and another pass; it ends
      // when one misses (an empty library mills nothing). Even with ~ gone, the process goes on (rulings).
      const sc = (s.resolving!.scratch ??= {});
      for (let pass = 0; pass < 1000; pass++) {
        for (sc.repeatStep ??= 0; sc.repeatStep < e.effects.length; sc.repeatStep++) if (runEffect(s, e.effects[sc.repeatStep]!, ctx) === "paused") return "paused";
        sc.repeatStep = undefined;
        const hit = (s.resolving!.milled ?? []).some(({ id }) => printedMatches(e.cond.filter, defOf(s, s.objects[id]!)));
        if (!hit) return;
        for (const inner of e.then) runEffect(s, inner, ctx);
        log(s, `${src} repeats the process.`);
      }
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
      if (sc.either === undefined) {
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: e.labels.map((_, i) => String(i)), labels: e.labels, prompt: "choose one" };
        return "paused";
      }
      for (const inner of e.options[sc.either] ?? []) if (runEffect(s, inner, ctx) === "paused") return "paused";
      return;
    }
    case "eachMay": {
      // Each player decides in APNAP order, seeing the earlier answers (CR 101.4); then it happens to those who chose to.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.mayQueue) {
        // Someone who can't do it isn't asked (CR 101.3): "put two +1/+1 counters on a creature they control" with none.
        const need = e.need;
        const can = (pid: PlayerId) =>
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
          s.pending = { kind: "chooseMay", player: pid, prompt: e.text.replace(/~/g, src), source: src, ...(e.wheel !== undefined ? { wheel: e.wheel } : {}), ...(e.pay ? { pay: e.pay } : {}) };
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
        about = { id: o.id, zc: o.zoneChanges ?? 0 };
      }
      const subject = about ?? item.subject;
      s.triggerQueue.push({
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
        // "That amount of excess damage" (Unleash the Inferno): the excess this spell dealt, its X (CR 603.12).
        // "You may pay {X}. When you do, ..." (Electro): the X paid, which the "may" put in ctx.
        ...(e.xExcess ? { x: s.resolving!.excessDamage ?? 0 } : ctx.x || item.x ? { x: ctx.x || item.x } : {}),
        ...(s.resolving!.rolled ? { rolled: s.resolving!.rolled.result } : {}),
        ...(s.resolving!.revealedFromHand !== undefined ? { revealed: s.resolving!.revealedFromHand } : {}),
        ...(s.resolving!.tappedThisWay !== undefined ? { tapped: s.resolving!.tappedThisWay } : {}),
        ...(e.sacrificed && s.resolving!.sacrificedThisWay ? { sacrificed: s.resolving!.sacrificedThisWay } : {}),
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
        const living = apnap(s, s.turnOrder).filter((x) => !player(s, x).lost);
        const most = Math.max(...living.map((x) => player(s, x).life));
        const opps = e.mostLife ? living.filter((x) => player(s, x).life === most) : opponents(s, ctx.controller);
        if (opps.length === 1) {
          r.chosen = { ...r.chosen, player: opps[0]! };
          log(s, `${player(s, ctx.controller).name} chooses ${player(s, opps[0]!).name} for ${src}.`);
        }
        if (opps.length <= 1) return;
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "opponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), prompt: e.mostLife ? "choose a player with the most life" : "choose an opponent" };
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
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "cardType", options: e.options ?? [] };
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
        if (r.chosen?.number !== undefined || !e.range) return;
        s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "number", options: [String(e.range.min)], numberRange: e.range, prompt: `choose a number between ${e.range.min} and ${e.range.max}` };
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
          : e.cond.kind === "theyChose"
          ? !!s.resolving!.choseThisWay?.length !== !!e.cond.not
          : e.cond.kind === "selfHere"
          ? objects(s, { ref: "self" }, ctx).some((o) => !(e.cond as { yours?: true }).yours || controllerOf(s, o) === ctx.controller)
          : e.cond.kind === "libraryHas"
          ? player(s, ctx.controller).library.length >= e.cond.n
          : e.cond.kind === "resolvedNth"
          ? e.cond.n.includes(s.resolving!.nth ?? 0) !== !!e.cond.not
          : e.cond.kind === "wonClash"
            ? !!s.resolving!.wonClash
            : e.cond.kind === "wonFlip"
            ? !!s.resolving!.flipped && s.resolving!.flipped.won !== !!e.cond.lost
            : e.cond.kind === "destroyedThisWay"
            ? !!s.resolving!.destroyed?.some((d) => !(e.cond as { died?: true }).died || d.died)
            : e.cond.kind === "sacrificedThisWay"
            ? !!s.resolving!.sacrificedThisWay?.some((k) => !(e.cond as { you?: true }).you || k.controller === ctx.controller)
            : e.cond.kind === "digTook"
            ? !!s.resolving!.digTook
            : e.cond.kind === "bouncedThisWay"
            ? !!s.resolving!.bouncedThisWay?.some((b) => b.subtypes.includes((e.cond as { subtype: string }).subtype) && b.id !== ctx.sourceId)
            : e.cond.kind === "excessDealt"
            ? (e.cond.target !== undefined ? (objects(s, { ref: "target", index: e.cond.target }, ctx).reduce((a, o) => a + (s.resolving!.excessTo?.[o.id] ?? 0), 0)) : e.cond.creature ? (s.resolving!.excessToCreatures ?? 0) : (s.resolving!.excessDamage ?? 0)) > 0
            : e.cond.kind === "noneAttackedYou"
            ? ctx.event?.amount === 0
            : e.cond.kind === "rollIn"
            ? rollIn(e.cond, e.cond.event ? ctx.event?.amount : s.resolving!.rolled?.result)
            : e.cond.kind === "foretold"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.foretold
            : e.cond.kind === "castInMain"
            ? !!s.resolving!.item.castInMain
            : e.cond.kind === "castFromHandAndAnotherNamed"
            ? ((o) => !s.resolving!.item.copy && o?.castFrom === "hand" && (player(s, ctx.controller).castNames?.[defOf(s, o).name] ?? 0) >= 2)(s.objects[s.resolving!.item.objectId ?? ""])
            : e.cond.kind === "castFromGraveyard"
            ? !s.resolving!.item.copy && s.objects[s.resolving!.item.objectId ?? ""]?.castFrom === (e.cond.hand ? "hand" : e.cond.exile ? "exile" : "graveyard")
            : e.cond.kind === "bargained"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.bargained
            : e.cond.kind === "evidence"
            ? evidenceCollected(s, ctx)
            : e.cond.kind === "treasure"
            ? (ctx.treasureSpent ?? 0) > 0
            : e.cond.kind === "spent"
            ? spentMeets(e.cond.target === undefined ? ctx.spent : targetSpellSpent(s, ctx, e.cond.target), e.cond.req)
            : e.cond.kind === "revealedIs"
            ? revealedIs(s, bindChosen(e.cond.filter, ctx.chosen)) !== !!e.cond.not
            : e.cond.kind === "movedLinkedIs"
            ? (s.resolving!.movedLinkedIds ?? []).some((id) => s.objects[id] && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!)))
            : e.cond.kind === "revealedSharesCreatureType"
            ? revealedSharesType(s, ctx)
            : e.cond.kind === "createdNone"
            ? !s.resolving!.created?.length
            : e.cond.kind === "putThisWayIs"
            ? (s.resolving!.created ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "impulsedIs"
            ? (s.resolving!.impulsed ?? []).some((id) => s.objects[id] && printedMatches((e.cond as { filter: TargetSpec }).filter, defOf(s, s.objects[id]!)))
            : e.cond.kind === "milledIs"
            ? (s.resolving!.milled ?? []).some(({ id }) => printedMatches(bindChosen((e.cond as { filter: TargetSpec }).filter, ctx.chosen), defOf(s, s.objects[id]!)))
            : e.cond.kind === "targetIs"
            ? targetIs(s, ctx, e.cond.index, e.cond.filter)
            : e.cond.kind === "flickeredIs"
            ? (s.resolving!.flickeredBack ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "damagedThisWayIs"
            ? (s.resolving!.damagedThisWay ?? []).some((id) => s.objects[id]?.zone === "battlefield" && objectMatches(s, (e.cond as { filter: TargetSpec }).filter, s.objects[id]!, ctx.controller, false))
            : e.cond.kind === "subjectWasAttacking"
            ? ((o) => (o ? o.attacking !== undefined : ctx.lki?.attacking !== undefined))(objects(s, { ref: "subject" }, ctx)[0])
            : e.cond.kind === "causeSpellIs"
            ? ((f) => {
                // The spell the cast trigger is about, on the stack or gone from it (its card, as it was cast).
                const item = s.stack.find((x) => x.id === ctx.cause) ?? s.castItems?.[ctx.cause ?? ""];
                const o = item?.objectId ? s.objects[item.objectId] : undefined;
                return !!o && printedMatches(f, defOf(s, o));
              })(e.cond.filter)
            : e.cond.kind === "subjectIs"
            ? ((f) => objects(s, { ref: "subject" }, ctx).some((o) => objectMatches(s, f, o, ctx.controller, false)))(e.cond.filter)
            : e.cond.kind === "targetCardWas"
            ? targetCardWas(s, ctx, e.cond.index, e.cond.filter)
            : e.cond.kind === "unlessPaid"
            ? !!s.resolving!.unlessPaid
            : e.cond.kind === "targetWasYours"
            ? targetWasYours(s, ctx, e.cond.index)
            : e.cond.kind === "teamwork"
            ? !!s.objects[s.resolving!.item.objectId ?? ""]?.teamwork
            : e.cond.kind === "gift"
            ? gifteeOf(s, ctx) !== undefined
            : e.cond.kind === "altPaid"
            ? (s.resolving!.item.kind === "spell" ? s.objects[s.resolving!.item.objectId ?? ""]?.castAlt : ctx.event?.castAlt) === e.cond.alt
            : e.cond.kind === "sacrificedSuspected"
            ? !!ctx.sacrificed?.[0]?.suspected
            : e.cond.kind === "sacrificedLegendary"
            ? !!ctx.sacrificed?.[0]?.legendary
            : e.cond.kind === "discardedThisWayIs"
            ? ((f) => (s.resolving!.discardedAll ?? []).some((id) => !!s.objects[id] && printedMatches(f, defOf(s, s.objects[id]!))))(e.cond.filter)
            : e.cond.kind === "discardedIs"
            ? ((f) => (s.resolving!.item.costDiscarded ?? []).some((k) => !!s.cards[k] && printedMatches(f, s.cards[k]!)))(e.cond.filter)
            : e.cond.kind === "suspected"
            ? objects(s, e.cond.what, ctx).some((o) => o.zone === "battlefield" && o.suspected !== undefined)
            : e.cond.kind === "state"
            ? staticConditionNow(s, e.cond.cond, ctx.sourceId ?? s.resolving!.item.objectId!, ctx.controller, ctx.event?.player, undefined, ctx.sourceId ? ctx.sourceZc : undefined, ctx.subject?.id, ctx.subject?.zc)
            : e.cond.kind === "voteWins"
            ? voteWins(s, e.cond.option, !!e.cond.orTie)
            : e.cond.kind === "amountNow"
            ? ((n) => (e.cond.kind !== "amountNow" ? false : (e.cond.min === undefined || n >= e.cond.min) && (e.cond.max === undefined || n <= e.cond.max)))(amountNow(s, e.cond.amount, ctx))
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
  const o = objects(s, { ref: "target", index }, ctx)[0];
  if (o?.zone === "battlefield") return objectMatches(s, filter, o, ctx.controller, false);
  const card = s.objects[t.id];
  return !!card && card.zone === "graveyard" && (t.zc === undefined || (card.zoneChanges ?? 0) === t.zc) && printedMatches(filter, defOf(s, card));
}

/** "If it was a creature card" (SpellCondition "targetCardWas"): the target card, wherever it went, by its printed characteristics. */
function targetCardWas(s: GameState, ctx: ResolveCtx, index: number, filter: TargetSpec): boolean {
  const t = ctx.targets[index];
  const card = t?.kind === "object" ? s.objects[t.id] : undefined;
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
    // What a pick picks ("it", Akiri's "that creature") isn't known until it's made.
    if ("what" in e && typeof e.what === "object" && e.what && "ref" in e.what && e.what.ref === "created" && effects.some((x) => x.type === "pick" && effects.indexOf(x) < effects.indexOf(e))) continue;
    // Discarding your hand can be done with an empty hand (rulings on Moonveil Regent).
    if (e.type === "discard" && e.who.ref === "you" && !e.hand && !player(s, ctx.controller).hand.some((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))))) return false;
    if (e.type === "draw" && e.who.ref === "you" && !player(s, ctx.controller).library.length) return false;
    if (e.type === "handToTop" && !player(s, ctx.controller).hand.length) return false;
    if (e.type === "chooseFromGraveyard" && e.dest === "exile" && !e.who && !player(s, ctx.controller).graveyard.some((id) => !e.filter || printedMatches(e.filter, defOf(s, obj(s, id))))) return false;
    if (e.type === "loseLife" && !players(s, e.who, ctx).some((pid) => !player(s, pid).lost && canLoseLife(s, pid))) return false;
    if (e.type === "sacrifice" && !objects(s, e.what, ctx).some((o) => e.byController || controllerOf(s, o) === ctx.controller)) return false;
    if (e.type === "exile" && e.what.ref === "selfCard" && !objects(s, e.what, ctx).length) return false;
    if (e.type === "tap" && e.what.ref === "self" && !objects(s, e.what, ctx).some((o) => !o.tapped)) return false;
    if (e.type === "continuous" && !objects(s, e.what, ctx).length) return false;
    if (e.type === "becomeCopy" && (!objects(s, e.what, ctx).length || !objects(s, e.of, ctx).length)) return false;
    if (e.type === "removeCounters" && typeof e.n === "number" && !objects(s, e.what, ctx).some((o) => (o.counters[e.counter] ?? 0) >= (e.n as number))) return false;
    if (e.type === "removeExiledCounter" && !exiledWithCounter(s, players(s, e.owner, ctx), e.counter).length) return false;
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
  if ("sacrifice" in o) return (o.n ?? 1) > 1 ? `Sacrifice ${o.n} ${o.sacrifice.text.replace(/\b(creature|land|artifact|permanent)\b/, "$1s")}` : `Sacrifice ${/^[aeiou]/i.test(o.sacrifice.text) ? "an" : "a"} ${o.sacrifice.text}`;
  if ("damage" in o) return `Be dealt ${o.damage} damage`;
  if (!o.pay.cost && o.pay.generic === undefined && o.pay.life) return `Pay ${o.pay.life} life`;
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
  return e.options.flatMap((o, i) => (("discard" in o && p.hand.length < discarding + o.discard) || ("sacrifice" in o && pickOptions(s, { filter: o.sacrifice }, pid, sourceId).length < sacrificing + (o.n ?? 1)) || ("pay" in o && !o.pay.cost && !o.pay.generic && (o.pay.life ?? 0) > payableLife(s, pid)) ? [] : [i]));
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
    sc.punish = { queue: apnap(s, players(s, e.who, ctx)), picked: {}, made: {}, round: 0, times, picks, options: e.options, ...punisherHarm(e), ...(e.mode ? { mode: e.mode } : {}) };
  }
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
            const prompt = !e.mode ? `${can.map((i) => punisherLabel(e.options[i]!).toLowerCase()).join(" or ")}, or ${lowerFirst(penalty)}?${which}` : `${can.map((i, k) => (k ? punisherLabel(e.options[i]!).toLowerCase() : punisherLabel(e.options[i]!))).join(" or ")}? ${e.mode === "ifAny" ? "If anyone does" : "If no one does"}, ${(e.thenText ?? "it happens").replace(/~/g, src)}${did ? " (someone already has)" : ""}.`;
            s.pending = { kind: "chooseOption", player: pid, source: src, what: "punisher", options: [...can.map(String), "none"], labels: [...can.map((i) => punisherLabel(e.options[i]!)), penalty], prompt };
            return "paused";
          }
        }
        const o = pu.picked[pid] === "none" ? undefined : e.options[Number(pu.picked[pid])];
        if (o && "pay" in o && e.mode && !o.pay.cost && !o.pay.generic && !o.pay.discard && o.pay.life) {
          // "Any player may pay 5 life" (Dash Hopes): chosen on the prompt above, so paid now (CR 119.4).
          loseLife(s, pid, o.pay.life);
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
      // "Have it deal 4 damage to them": the source deals it, to each who chose to, all at once.
      const hurt = who.flatMap((pid) => pu.made[pid]!.flatMap((m) => {
        const o = e.options[Number(m)];
        return o && "damage" in o ? [{ pid, n: o.damage }] : [];
      }));
      if (hurt.length) {
        const from = ctxSource(s, ctx);
        dealDamageBatch(s, hurt.map((h) => ({ src: from, to: { player: h.pid }, n: h.n })));
      }
      pu.acted = true;
      pu.penalty = 0;
      sc.mayStep = e.effects.length;
    }
    // "If a player does" / "If no one does": once, or not at all.
    if (e.mode) {
      const did = Object.values(pu.made).some((m) => m.some((x) => x !== "none"));
      if (did === (e.mode === "ifAny")) {
        if (sc.mayStep! >= e.effects.length) sc.mayStep = 0;
        for (; sc.mayStep! < e.effects.length; sc.mayStep!++) if (runEffect(s, e.effects[sc.mayStep!]!, ctx) === "paused") return "paused";
      }
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
const lowerFirst = (t: string) => (/^(?:Lose|Take) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** What the penalty costs the punished player, for the bots: life lost, or tokens made for its controller. */
function punisherHarm(e: Extract<Effect, { type: "punisher" }>): { lose?: number; tokens?: number } {
  const [f] = e.effects;
  if (e.effects.length !== 1 || !f) return {};
  if (f.type === "loseLife" && typeof f.n === "number") return { lose: f.n };
  if (f.type === "damage" && typeof f.amount === "number") return { lose: f.amount };
  if (f.type === "createToken") return { tokens: 1 };
  return {};
}

/** The penalty, for its button: "Lose 3 life", "Ana may draw a card" (Rhystic Study). */
function describePenalty(s: GameState, e: Extract<Effect, { type: "punisher" }>, ctx: ResolveCtx): string {
  if (e.thenText) return `${player(s, ctx.controller).name} ${e.thenText}`;
  const lose = e.effects.length === 1 && e.effects[0]!.type === "loseLife" ? e.effects[0]!.n : undefined;
  return typeof lose === "number" ? `Lose ${lose} life` : "Take the penalty";
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

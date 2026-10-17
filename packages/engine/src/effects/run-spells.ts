import type { AbilityBody, Effect, SpellCondition, TargetChoice, TargetSpec, UnlessPays } from "../abilities";
import { manaValue, parseManaCost, xCount } from "../mana";
import { abilitiesOf, cardIdOf, defOf, isType } from "../cards";
import { controllerOf } from "../layers";
import { shuffle } from "../rng";
import { castProblem, describeTargets, log, moveObject, newObject, obj, opponents, player } from "../game";
import { compileCard, spellTargetSpecs } from "../oracle";
import type { DelayedTrigger, GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import { isLegalTarget, legalTargets, printedMatches, sameTarget, sourceQuality, spellManaValue, spellQuality, stampTargets } from "./targeting";
import { ResolveCtx, objects, amountNow, players } from "./resolve";
import { fireEvent } from "./triggers";
import { discardCards, toBottom } from "./run-library";

/**
 * Put a copy of this spell on the stack under `controller` (CR 707.10): its values and every choice made casting
 * it (modes, X, kicker, what was sacrificed), with these targets. It isn't cast.
 */
function putSpellCopy(s: GameState, orig: StackItem, controller: PlayerId, targets: TargetChoice[] | undefined) {
  const card = orig.objectId ? s.objects[orig.objectId] : undefined;
  if (!card) return;
  const o = newObject(s, s.cards[cardIdOf(card)]!, controller, "stack");
  o.spellCopy = true;
  o.kicked = card.kicked;
  o.castAlt = card.castAlt;
  o.bestowed = card.bestowed; // a copy of a bestowed Aura spell is one too (CR 702.103c)
  o.prototyped = card.prototyped; // and of a prototyped spell (CR 718.3c)
  o.overloaded = card.overloaded; // a copy copies the alternative cost paid, and so its text change (CR 707.10, 702.96a)
  // Decisions about additional costs are copied too (CR 707.10): bargain, evidence, teamwork, and the gift's opponent.
  o.bargained = card.bargained;
  o.evidence = card.evidence;
  o.teamwork = card.teamwork;
  o.gift = card.gift;
  const name = orig.description.replace(/ \(copy\)$/, "");
  const id = `s${s.nextId++}`;
  const { castNth: _, ...rest } = structuredClone(orig);
  s.stack.push({ ...rest, id, objectId: o.id, controller, targets: stampTargets(s, targets), copy: true, description: `${name} (copy)` });
  log(s, `${player(s, controller).name} copies ${name}${describeTargets(s, targets ?? [])}.`);
  fireEvent(s, { type: "cast", stackId: id, controller, card: defOf(s, o), copy: true }); // magecraft: "cast or copy"
  fireEvent(s, { type: "targeted", stackId: id });
}

/** A copy of a card that wasn't cast ceases to exist (CR 704.5e). */
function removeCopy(s: GameState, id: ObjectId) {
  const o = s.objects[id];
  if (!o) return;
  const list = player(s, o.owner).exile;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  delete s.objects[id];
}

/** Spells on the stack: copying, countering, cascade, "when you next cast", delayed triggers. */
export function runSpellsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "delayed": {
      // A spell's own object (it's on its way to the graveyard), or the source of the ability.
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const body = { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." };
      if (e.when === "lostControl") {
        // About the object as it is now (CR 400.7); one that isn't on the battlefield can't be controlled.
        for (const o of objects(s, e.of!, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, e.when, ctx.controller, o, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(o));
          if (e.thisTurn) s.delayed![s.delayed!.length - 1]!.thisTurn = s.turn;
        }
        return;
      }
      if (e.each === "created") {
        for (const t of s.resolving?.created ?? []) if (s.objects[t]?.zone === "battlefield") addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
        return;
      }
      if (e.each === "selfCard") {
        const card = objects(s, { ref: "selfCard" }, ctx)[0];
        if (card) addDelayed(s, e.when, ctx.controller, card, body);
        return;
      }
      if (e.each === "subject") {
        const subj = objects(s, { ref: "subject" }, ctx)[0];
        if (subj) addDelayed(s, e.when, ctx.controller, subj, body, cardIdOf(s.objects[id ?? ""] ?? subj));
        return;
      }
      const o = id ? s.objects[id] : undefined;
      if (o) addDelayed(s, e.when, ctx.controller, o, body);
      return;
    }
    case "castCipher": {
      // "You may copy the encoded card and you may cast the copy without paying its mana cost" (CR 702.99a): the copy
      // is made in exile, where the card is, then cast (CR 707.12); if it isn't cast it ceases to exist (CR 704.5e).
      const card = s.objects[e.card];
      if (!card || card.zone !== "exile" || (card.zoneChanges ?? 0) !== e.zc) return;
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (sc.playLinked) {
        if (sc.cipherCopy && s.objects[sc.cipherCopy]?.zone === "exile") removeCopy(s, sc.cipherCopy);
        return;
      }
      sc.playLinked = true;
      const copy = newObject(s, defOf(s, card), p.id, "exile");
      copy.spellCopy = true;
      p.exile.push(copy.id);
      sc.cipherCopy = copy.id;
      s.pending = { kind: "castFree", player: p.id, objectId: copy.id, source: src };
      if (castProblem(s, p.id, copy.id) === null) return "paused";
      s.pending = null;
      removeCopy(s, copy.id);
      log(s, `The copy of ${defOf(s, card).name} can't be cast.`);
      return;
    }
    case "castParadigm": {
      // "Create a copy of this object in exile. You may cast the copy without paying its mana cost" (CR 702.192a): one
      // not cast ceases to exist (704.5e; rulings).
      const def = s.cards[e.card];
      if (!def) return;
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (sc.playLinked) {
        if (sc.cipherCopy && s.objects[sc.cipherCopy]?.zone === "exile") removeCopy(s, sc.cipherCopy);
        return;
      }
      sc.playLinked = true;
      const copy = newObject(s, def, p.id, "exile");
      copy.spellCopy = true;
      p.exile.push(copy.id);
      sc.cipherCopy = copy.id;
      log(s, `${p.name} creates a copy of ${def.name} in exile (paradigm).`);
      s.pending = { kind: "castFree", player: p.id, objectId: copy.id, source: src };
      if (castProblem(s, p.id, copy.id) === null) return "paused";
      s.pending = null;
      removeCopy(s, copy.id);
      log(s, `The copy of ${def.name} can't be cast.`);
      return;
    }
    case "copySpell": {
      // Copies of a spell go on the stack one at a time, each with its targets chosen first (CR 707.10, 707.10c).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.copies) {
        const i = e.spell === "cause" || "epic" in e.spell ? -1 : e.spell.target;
        const t = i >= 0 ? ctx.targets[i] : undefined;
        const id = typeof e.spell === "object" && "epic" in e.spell ? e.spell.epic : i < 0 ? ctx.cause : t?.kind === "stack" && ctx.legal[i] ? t.id : undefined;
        const orig = id ? (s.stack.find((x) => x.id === id) ?? s.castItems?.[id] ?? s.epics?.[id]) : undefined;
        if (!orig || orig.kind !== "spell") return;
        const n = e.n === "storm" ? (orig.castNth ?? 0) : e.n === "kicked" ? (orig.kicked?.length ?? 0) : amountNow(s, e.n, ctx);
        if (n <= 0) return;
        sc.copies = { of: id!, left: n };
      }
      const c = sc.copies;
      // As it is now, or as it was cast if it has left the stack.
      const orig = s.stack.find((x) => x.id === c.of) ?? s.castItems?.[c.of] ?? s.epics?.[c.of];
      const specs = orig?.body?.targets ?? [];
      while (orig && c.left > 0) {
        if (e.newTargets && specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: ctx.controller, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.left };
          return "paused";
        }
        putSpellCopy(s, orig, ctx.controller, c.targets ?? orig.targets);
        c.targets = undefined;
        c.left--;
      }
      if (orig && e.demonstrate && !c.oppDone) {
        // Demonstrate (CR 702.144a): you copied it, so choose an opponent, who copies it too; their copy goes on the
        // stack above yours, and they choose its new targets knowing the others (rulings).
        if (c.opp === undefined) {
          const opps = opponents(s, ctx.controller);
          if (!opps.length) return;
          if (opps.length > 1) {
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "demonstrate", options: opps.map(String), labels: opps.map((pid) => player(s, pid).name), prompt: `demonstrate: choose an opponent to also copy ${src}` };
            return "paused";
          }
          c.opp = opps[0]!;
        }
        if (e.newTargets && specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: c.opp, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: 1 };
          return "paused";
        }
        putSpellCopy(s, orig, c.opp, c.targets ?? orig.targets);
        c.targets = undefined;
        c.oppDone = true;
      }
      return;
    }
    case "nextCast": {
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      for (const caster of e.who ? players(s, e.who, ctx) : [ctx.controller])
        (s.nextCast ??= []).push({
          controller: caster,
          filter: e.filter,
          sourceId: id ?? "",
          sourceCardId: o ? cardIdOf(o) : ctx.sourceDef.oracleId,
          body: { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." },
          turn: s.turn,
          ...(e.cascade ? { cascade: true as const } : {}),
        });
      return;
    }
    case "cascade": {
      // CR 702.85a. The spell's mana value is its own, even if it has left the stack by now: as it last existed there
      // (CR 113.7a), its X included (CR 202.3e). A countered spell's cascade still resolves (rulings).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.cascade) {
        const spell = ctx.cause !== undefined ? (s.stack.find((x) => x.id === ctx.cause && x.kind === "spell") ?? s.castItems?.[ctx.cause]) : undefined;
        const limit = spell ? spellManaValue(s, spell) : manaValue(parseManaCost(ctx.sourceDef.manaCost));
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && manaValue(parseManaCost(d.manaCost)) < limit) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        log(s, `${src} cascades: ${p.name} exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, hitting ${defOf(s, obj(s, hit)).name}` : ", finding nothing to cast"}.`);
        if (hit) {
          // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src };
          if (castProblem(s, p.id, hit) === null) return "paused";
          s.pending = null;
          log(s, `${defOf(s, obj(s, hit)).name} can't be cast.`);
        }
      }
      const rest = sc.cascade.exiled.filter((id) => s.objects[id]?.zone === "exile");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      return;
    }
    case "exileUntilNonland": {
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.untilNonland) {
        const pid = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
        if (pid === undefined) return;
        const p = player(s, pid);
        if (e.shuffleFirst) {
          shuffle(s, p.library);
          log(s, `${p.name} shuffles their library.`);
        }
        const at = p.library.findIndex((id) => !isType(defOf(s, obj(s, id)), "Land"));
        // No nonland card: every card is revealed or exiled (rulings on Stolen Goods and Treasure Hunt).
        const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
        const hit = at < 0 ? undefined : p.library[at];
        const names = seen.map((id) => defOf(s, obj(s, id)).name).join(", ");
        log(s, `${p.name} ${e.reveal ? "reveals" : "exiles"} ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${names})` : ""}${hit ? "" : ", finding no nonland card"}.`);
        if (e.then === "hand") {
          for (const id of seen) moveObject(s, id, "hand");
          return;
        }
        if (e.reveal) {
          // "Exile that card and put the rest on the bottom of your library in a random order" (Creative Technique).
          if (hit) moveObject(s, hit, "exile");
          const rest = seen.filter((id) => id !== hit);
          shuffle(s, rest);
          for (const id of rest) moveObject(s, id, "library");
        } else for (const id of seen) moveObject(s, id, "exile");
        const caster = e.ownerCasts ? pid : ctx.controller;
        sc.untilNonland = { ...(hit ? { hit } : {}), caster };
        if (!hit) return;
        if (e.then !== "castFree") {
          // "Until end of turn, you may cast that card (without paying its mana cost)": with its usual timing (rulings).
          const o = obj(s, hit);
          o.mayPlay = { player: caster, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true, ...(e.then === "freeThisTurn" ? { free: true as const } : {}) };
          return;
        }
        // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
        s.pending = { kind: "castFree", player: caster, objectId: hit, source: src };
        if (castProblem(s, caster, hit) === null) return "paused";
        s.pending = null;
        log(s, `${defOf(s, obj(s, hit)).name} can't be cast.`);
      }
      return;
    }
    case "discover": {
      // CR 701.57a: the mana value of the spell it would be is checked too (701.57a), the card's own for the cards we have.
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.cascade) {
        const n = amountNow(s, e.n, ctx);
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && manaValue(parseManaCost(d.manaCost)) <= n) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        // The discovered card (CR 701.57c), cast or not: "the discovered card's mana value" (Hit the Mother Lode).
        if (hit) s.resolving!.discovered = { id: hit, mv: manaValue(parseManaCost(defOf(s, obj(s, hit)).manaCost)) };
        log(s, `${p.name} discovers ${n}: exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, finding ${defOf(s, obj(s, hit)).name}` : ", finding nothing"}.`);
        if (hit) {
          // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src, how: "discover" };
          if (castProblem(s, p.id, hit) === null) return "paused";
          s.pending = null;
        }
      }
      // Not cast: into its owner's hand (701.57a).
      const hit = sc.cascade.hit;
      if (hit && s.objects[hit]?.zone === "exile") {
        moveObject(s, hit, "hand");
        log(s, `${p.name} puts ${defOf(s, obj(s, hit)).name} into their hand.`);
      }
      const rest = sc.cascade.exiled.filter((id) => id !== hit && s.objects[id]?.zone === "exile");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      return;
    }
    case "ripple": {
      // CR 702.60a. The spell's name as it last existed, even if it has left the stack (CR 608.2h).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      const name = e.of === "cause" ? (ctx.lki?.copyKey ? s.cards[ctx.lki.copyKey]?.name : undefined) : ctx.sourceDef.name;
      if (!sc.ripple) {
        const revealed = p.library.slice(0, e.n); // all of them if there are fewer (702.60a)
        if (!revealed.length) return;
        log(s, `${p.name} reveals the top ${revealed.length === 1 ? "card" : `${revealed.length} cards`} of their library for ripple (${revealed.map((id) => defOf(s, obj(s, id)).name).join(", ")}).`);
        sc.ripple = { revealed, queue: revealed.filter((id) => defOf(s, obj(s, id)).name === name) };
      }
      // Each card with that name, one at a time, cast as this resolves (its card type's timing doesn't matter).
      while (sc.ripple.queue.length) {
        const id = sc.ripple.queue.shift()!;
        if (obj(s, id).zone !== "library") continue;
        s.pending = { kind: "castFree", player: p.id, objectId: id, source: src };
        if (castProblem(s, p.id, id) === null) return "paused";
        s.pending = null;
        log(s, `${defOf(s, obj(s, id)).name} can't be cast.`);
      }
      const rest = sc.ripple.revealed.filter((id) => s.objects[id]?.zone === "library");
      return toBottom(s, p.id, rest, src, false);
    }
    case "counterUnlessPays": {
      // Ward (CR 702.21a) and "counter it unless that player pays": the spell or ability that triggered this.
      return counterOnStack(s, ctx, ctx.cause, e.ward ? `${src}'s ward` : src, e.unless);
    }
    case "counterCause":
      return counterOnStack(s, ctx, ctx.cause, src);
    case "changeTarget": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      return changeTarget(s, ctx, t.id, src, e.unless);
    }
    case "counterEach": {
      // Each spell on the stack it matches as it resolves, one at a time (CR 701.6a); this spell itself is excluded
      // since it isn't one it can counter (CR 608.2: it's resolving).
      for (const item of [...s.stack]) {
        if (item.kind !== "spell" || item.id === s.resolving?.item.id || !isLegalTarget(s, e.filter, { kind: "stack", id: item.id }, ctx.controller)) continue;
        counterOnStack(s, ctx, item.id, src);
      }
      return;
    }
    case "spellEntersWith": {
      // Only the spell that was cast (a copy isn't), while it's still that spell on the stack (CR 400.7).
      const item = s.stack.find((x) => x.id === ctx.cause);
      const o = item?.kind === "spell" && !item.copy && item.objectId ? s.objects[item.objectId] : undefined;
      const n = amountNow(s, e.n, ctx);
      if (!o || o.zone !== "stack" || n <= 0) return;
      (o.extraCounters ??= {})[e.counter] = (o.extraCounters[e.counter] ?? 0) + n;
      log(s, `${defOf(s, o).name} will enter with ${n} more ${e.counter} counter${n === 1 ? "" : "s"}.`);
      return;
    }
    case "counterSpell": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      // Disrupting Shoal: its mana value with the X chosen for it (CR 202.3e) against this spell's X.
      if (e.ifMvX) {
        const item = s.stack.find((x) => x.id === t.id);
        const o = item?.objectId ? s.objects[item.objectId] : undefined;
        const cost = o && parseManaCost(defOf(s, o).manaCost);
        const mv = cost ? manaValue(cost) + (item!.x ?? 0) * xCount(cost) : 0;
        if (!item || item.kind !== "spell" || mv !== (ctx.x ?? 0)) {
          log(s, `${src} doesn't counter ${item?.description ?? "it"}: its mana value isn't ${ctx.x ?? 0}.`);
          return;
        }
      }
      // Jester's Scepter: only a spell with the name of the card put into a graveyard for the cost; a split card's either
      // half (rulings).
      if (e.ifCostCardName) {
        const item = s.stack.find((x) => x.id === t.id);
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        const names = (s.resolving?.item.costCardNames ?? []).flatMap((n) => [n, ...n.split(" // ")]);
        if (!o || !names.includes(defOf(s, o).name)) {
          log(s, `${src} doesn't counter ${item?.description ?? "it"}: it doesn't have the same name as that card.`);
          return;
        }
      }
      return counterOnStack(s, ctx, t.id, src, e.unless, e.exile ? "exile" : e.top ? "libraryTop" : undefined);
    }
  }
}

/**
 * Counter a spell or ability on the stack (CR 701.6a), or with `unless`, only if its controller
 * doesn't pay (CR 118.12): they choose as this resolves, and may activate mana abilities to pay
 * (CR 605.3a). A spell that can't be countered stays, paid for or not (CR 101.2). A countered spell
 * goes to its owner's graveyard, or where "instead" says (CR 701.6a).
 */
function counterOnStack(s: GameState, ctx: ResolveCtx, stackId: string | undefined, by: string, unless?: UnlessPays, instead?: "exile" | "libraryTop"): "paused" | void {
  const i = s.stack.findIndex((x) => x.id === stackId);
  const item = s.stack[i];
  if (!item) return; // it already left the stack
  const what = item.kind === "spell" ? item.description : `${item.description.split(":")[0]}'s ability`;
  if (item.objectId && cantBeCountered(s, item)) {
    log(s, `${item.description} can't be countered.`); // CR 101.2
    return;
  }
  if (unless) {
    const paid = paidUnless(s, ctx, item.controller, unless, by, what);
    if (paid === "paused") return paid;
    if (paid) return;
  }
  s.stack.splice(i, 1);
  if (item.objectId) moveObject(s, item.objectId, instead === "exile" ? "exile" : instead ? "library" : "graveyard", instead === "libraryTop" ? { top: true } : {});
  // "Discover X, where X is that spell's mana value" (Hurl into History): with the X chosen for it (CR 202.3e, rulings).
  const gone = item.objectId && s.objects[item.objectId];
  if (gone && item.x && s.resolving) (s.resolving.countered ??= {})[gone.id] = { zc: gone.zoneChanges ?? 0, x: item.x };
  log(s, `${by} counters ${what}${!item.objectId ? "" : instead === "exile" ? " and exiles it" : instead ? " and puts it on top of its owner's library" : ""}.`);
}

/**
 * A spell that can't be countered (CR 101.2): its own "~ can't be countered", or a permanent's "Creature spells you
 * control can't be countered". The counter effect still does whatever else it does (rulings on Prowling Serpopard).
 */
export function cantBeCountered(s: GameState, item: StackItem): boolean {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return false;
  const d = defOf(s, o);
  if (compileCard(d).cantBeCountered) return true;
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    return !!abilitiesOf(s, p).uncounterable?.some((u) => (u.anyone || controllerOf(s, p) === item.controller) && printedMatches(u.filter, d));
  });
}

/**
 * "Unless [payer] pays ...", as this resolves (CR 118.12): true if they paid, false if they didn't, "paused" while they
 * choose. They may activate mana abilities to pay (CR 605.3a).
 */
export function paidUnless(s: GameState, ctx: ResolveCtx, payer: PlayerId, unless: UnlessPays, by: string, what: string, otherwise?: string): boolean | "paused" {
  const sc = (s.resolving!.scratch ??= {});
  // "Ward—Discard a card": the cards they chose to discard (see payUnless).
  if (sc.paid === undefined && unless.discard && sc.chosen?.[payer]) {
    discardCards(s, payer, sc.chosen[payer]!);
    sc.paid = true;
  }
  if (sc.paid === undefined) {
    const p = player(s, payer);
    // The amount is fixed as the choice is offered (CR 608.2h).
    const cost = unlessCost(unless.cost, unless.generic === undefined ? 0 : amountNow(s, unless.generic, ctx));
    // A player can't discard more cards than they have (CR 701.9b), so they can't pay that.
    if (p.lost || (unless.discard && p.hand.length < unless.discard)) sc.paid = false;
    else if (cost === "{0}" && !unless.life && !unless.discard) {
      // Paying {0} is just saying so (CR 118.5); nobody would refuse.
      log(s, `${p.name} pays {0} for ${by}.`);
      sc.paid = true;
    } else {
      s.pending = { kind: "payUnless", player: p.id, cost, source: by, what, ...(otherwise ? { otherwise } : {}), ...(unless.life ? { life: unless.life } : {}), ...(unless.discard ? { discard: unless.discard } : {}) };
      return "paused";
    }
  }
  return sc.paid;
}

/**
 * "Change the target of target spell with a single target" (CR 115.7a): the new target is chosen as this resolves, and
 * must be another legal target for that spell, as if it were choosing now (this spell included: it's still on the
 * stack, CR 608.2n; the spell itself isn't, CR 115.5). With none, the target stays as it is, legal or not. Its new
 * target becomes a target of it ("becomes the target" triggers, ward).
 */
function changeTarget(s: GameState, ctx: ResolveCtx, stackId: string, by: string, unless?: UnlessPays): "paused" | void {
  const item = s.stack.find((x) => x.id === stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!item || (item.kind === "spell" && !o)) return;
  const j = (item.targets ?? []).findIndex((t) => t.kind !== "none");
  const current = item.targets?.[j];
  if (!current || current.kind === "none") return;
  if (unless) {
    const paid = paidUnless(s, ctx, item.controller, unless, by, item.description, `${by} changes its target`);
    if (paid === "paused") return paid;
    if (paid) return;
  }
  const sc = (s.resolving!.scratch ??= {});
  const spec = (item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []))[j];
  if (!spec) return;
  if (!sc.newTarget) {
    const options = changeTargetOptions(s, item, spec, current);
    if (!options.length) {
      log(s, `${item.description} has no other legal target, so its target stays the same.`);
      return;
    }
    if (options.length > 1) {
      s.pending = { kind: "changeTarget", player: ctx.controller, source: by, spell: item.description, stackId: item.id, index: j, spec, current, options };
      return "paused";
    }
    sc.newTarget = options[0]!;
  }
  // A divided amount stays with the one target (CR 601.2d).
  const amount = current.kind === "object" || current.kind === "player" ? current.amount : undefined;
  const t = sc.newTarget;
  const next = amount !== undefined && (t.kind === "object" || t.kind === "player") ? { ...t, amount } : t;
  item.targets = item.targets!.map((x, i) => (i === j ? stampTargets(s, [next])![0]! : x));
  log(s, `${by} changes the target of ${item.description}${describeTargets(s, [next]).replace(/^ targeting/, " to")}.`);
  fireEvent(s, { type: "targeted", stackId: item.id });
}

/** The legal new targets for a spell's one target (see changeTarget). */
export function changeTargetOptions(s: GameState, item: StackItem, spec: TargetSpec, current: TargetChoice): TargetChoice[] {
  // A spell's own characteristics, or an ability's source's (CR 113.7a), for protection and hexproof.
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  const src = o ? spellQuality(s, cardIdOf(o)) : sourceQuality(s, item.sourceId, item.sourceCardId);
  const all: TargetChoice[] = legalTargets(s, spec, item.controller, item.id, src, item.sourceId);
  const self = s.resolving?.item;
  if (spec.kind === "spell" && self && self.id !== item.id && isLegalTarget(s, spec, { kind: "stack", id: self.id }, item.controller, src)) all.push({ kind: "stack", id: self.id });
  return all.filter((t) => !sameTarget(current, t));
}

/** "{1}{U}" plus 3 generic: "{4}{U}". */
export function unlessCost(cost: string, generic: number): string {
  let n = generic;
  const rest = cost.replace(/\{(\d+)\}/g, (_, d: string) => {
    n += Number(d);
    return "";
  });
  return n || !rest ? `{${n}}${rest}` : rest;
}

/** "At the beginning of the next end step" / "your next upkeep", about this object as it is now (CR 603.7). */
export function addDelayed(s: GameState, when: DelayedTrigger["when"], controller: PlayerId, o: GameObject, body: AbilityBody, sourceCardId = cardIdOf(o)) {
  (s.delayed ??= []).push({ when, controller, sourceCardId, subject: { id: o.id, zc: o.zoneChanges ?? 0 }, body, turn: s.turn, step: s.step });
}

/** Was it kicked (CR 702.33d), with that kicker cost if the condition names one (702.33f)? */
export function kickedMatches(kicked: number[] | undefined, cond: SpellCondition): boolean {
  if (cond.kind !== "kicked") return false;
  return cond.which === undefined ? !!kicked?.length : !!kicked?.includes(cond.which);
}

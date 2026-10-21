import type { AbilityBody, Effect, Modification, SpellCondition, TargetChoice, TargetSpec, UnlessPays } from "../abilities";
import { manaValue, parseManaCost, xCount } from "../mana";
import { abilitiesOf, cardIdOf, defOf, isType } from "../cards";
import { controllerOf } from "../layers";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { castProblem, describeTargets, log, moveObject, newObject, obj, opponents, player } from "../game";
import { compileCard, spellTargetSpecs } from "../oracle";
import type { DelayedTrigger, GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import { isLegalTarget, legalTargets, pickOptions, printedMatches, sameTarget, sourceQuality, spellManaValue, spellQuality, stampTargets, swapKeepsOthersLegal } from "./targeting";
import { ResolveCtx, objects, amountNow, players } from "./resolve";
import { fireEvent } from "./triggers";
import { discardCards, toBottom } from "./run-library";
import { defMv, sameName } from "../faces";
import { copyKey } from "../copies";

/**
 * Put a copy of this spell on the stack under `controller` (CR 707.10): its values and every choice made casting
 * it (modes, X, kicker, what was sacrificed), with these targets. It isn't cast.
 */
function putSpellCopy(s: GameState, orig: StackItem, controller: PlayerId, targets: TargetChoice[] | undefined, gains?: { mods: Modification[]; source: string }) {
  const card = orig.objectId ? s.objects[orig.objectId] : undefined;
  if (!card) return;
  // A copy of a nonmodal double-faced spell's back face (cast transformed: disturb) has mana value 0 (CR 202.3b).
  const def = s.cards[cardIdOf(card)]!;
  const o = newObject(s, def.faceOf && def.faceOf.face > 0 && def.layout === "transform" ? s.cards[copyKey(s, def)]! : def, controller, "stack");
  o.spellCopy = true;
  if (gains) o.copyGains = { mods: gains.mods, timestamp: s.nextTimestamp++, controller, source: gains.source };
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
  const { castNth: _, castInMain: _main, ...rest } = structuredClone(orig);
  s.stack.push({ ...rest, id, objectId: o.id, controller, targets: stampTargets(s, targets), copy: true, description: `${name} (copy)` });
  log(s, `${player(s, controller).name} copies ${name}${describeTargets(s, targets ?? [])}.`);
  fireEvent(s, { type: "cast", stackId: id, controller, card: defOf(s, o), copy: true }); // magecraft: "cast or copy"
  fireEvent(s, { type: "targeted", stackId: id });
}

/**
 * A copy of an activated or triggered ability on the stack (CR 707.10): its source, choices and event are the original's,
 * and the player copying it controls it (CR 707.10c). It wasn't activated, so nothing about activating triggers.
 */
function putAbilityCopy(s: GameState, orig: StackItem, controller: PlayerId, targets: TargetChoice[] | undefined) {
  const id = `s${s.nextId++}`;
  const name = orig.description.replace(/ \(copy\)$/, "");
  s.stack.push({ ...structuredClone(orig), id, controller, targets: stampTargets(s, targets), copy: true, description: `${name} (copy)` });
  log(s, `${player(s, controller).name} copies ${name}${describeTargets(s, targets ?? [])}.`);
  fireEvent(s, { type: "targeted", stackId: id });
}

/** A copy of a card that wasn't cast ceases to exist (CR 704.5e). */
export function removeCopy(s: GameState, id: ObjectId) {
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
      // Memory Jar: the cards this ability exiled face down go with the delayed trigger ("each card they exiled this way").
      const exiled = (s.resolving?.faceDownExiled ?? []).map((x) => ({ id: x, zc: s.objects[x]?.zoneChanges ?? 0 }));
      const effects = e.effects.map((x): Effect => (x.type === "returnFaceDownExiled" ? { ...x, cards: exiled } : x));
      const body = { targets: [], effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." };
      if (e.when === "dies") {
        // "When that creature dies this turn, flip ~" (Initiate of Blood): about that permanent as it is now (CR 603.7c,
        // 400.7), its instructions about this ability's source.
        const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        for (const o of objects(s, e.of!, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, "leaves", ctx.controller, o, body, src ? cardIdOf(src) : cardIdOf(o));
          const d = s.delayed![s.delayed!.length - 1]!;
          Object.assign(d, { to: ["graveyard"], dies: true, ...(e.thisTurn ? { thisTurn: s.turn } : {}), ...(src ? { source: { id: src.id, zc: ctx.sourceZc ?? src.zoneChanges ?? 0 } } : {}) });
        }
        return;
      }
      if (e.when === "lostControl") {
        // About the object as it is now (CR 400.7); one that isn't on the battlefield can't be controlled.
        for (const o of objects(s, e.of!, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, e.when, ctx.controller, o, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(o));
          if (e.thisTurn) s.delayed![s.delayed!.length - 1]!.thisTurn = s.turn;
        }
        return;
      }
      if (e.of) {
        // About each of those permanents as it is now (CR 603.7c, 400.7).
        for (const o of objects(s, e.of, ctx)) if (o.zone === "battlefield") addDelayed(s, e.when, ctx.controller, o, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(o));
        return;
      }
      if (e.each === "created") {
        for (const t of s.resolving?.created ?? []) if (s.objects[t]?.zone === "battlefield") addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
        return;
      }
      // A merged permanent's cards each (CR 730.3c): one delayed trigger for each.
      if (e.each === "subjectCard") {
        for (const card of objects(s, { ref: "subjectCard" }, ctx)) addDelayed(s, e.when, ctx.controller, card, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(card));
        return;
      }
      if (e.each === "selfCard") {
        for (const card of objects(s, { ref: "selfCard" }, ctx)) addDelayed(s, e.when, ctx.controller, card, body);
        return;
      }
      if (e.each === "subject") {
        const subj = objects(s, { ref: "subject" }, ctx)[0];
        if (subj) addDelayed(s, e.when, ctx.controller, subj, body, cardIdOf(s.objects[id ?? ""] ?? subj));
        return;
      }
      const o = id ? s.objects[id] : undefined;
      if (o) addDelayed(s, e.when, ctx.controller, o, body);
      // What it remembers from now (CR 603.7c, 608.2h): the countered spell's controller, its mana value.
      if (o && e.event) {
        const who = e.event.player ? players(s, e.event.player, ctx)[0] : undefined;
        if (e.event.player && who === undefined) s.delayed!.pop();
        else s.delayed![s.delayed!.length - 1]!.event = { ...(who !== undefined ? { player: who } : {}), ...(e.event.amount !== undefined ? { amount: amountNow(s, e.event.amount, ctx) } : {}) };
      }
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
    case "castLinkedCopy": {
      // Isochron Scepter: "You may copy the exiled card. If you do, you may cast the copy without paying its mana cost"
      // (CR 707.12, 607.2a): the card exiled with this object, the same one (CR 400.7); a copy not cast ceases to exist.
      const sc = (s.resolving!.scratch ??= {});
      if (sc.linkedCopy !== undefined) {
        if (s.objects[sc.linkedCopy]?.zone === "exile") removeCopy(s, sc.linkedCopy);
        return;
      }
      const key = ctx.sourceId ? `${ctx.sourceId}@${ctx.sourceZc ?? 0}` : undefined;
      const card = (key ? (s.linkedExile?.[key] ?? []) : []).map((l) => ({ o: s.objects[l.id], zc: l.zc })).find(({ o, zc }) => o?.zone === "exile" && (o.zoneChanges ?? 0) === zc)?.o;
      if (!card) return;
      const p = player(s, ctx.controller);
      const copy = newObject(s, defOf(s, card), p.id, "exile");
      copy.spellCopy = true;
      p.exile.push(copy.id);
      sc.linkedCopy = copy.id;
      log(s, `${src} copies ${defOf(s, card).name}.`);
      s.pending = { kind: "castFree", player: p.id, objectId: copy.id, source: src };
      if (castProblem(s, p.id, copy.id) === null) return "paused";
      s.pending = null;
      removeCopy(s, copy.id);
      log(s, `The copy of ${defOf(s, card).name} can't be cast.`);
      return;
    }
    case "castFaceDownExiled": {
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      const card = (s.resolving!.faceDownExiled ?? []).map((id) => s.objects[id]).find((o) => o?.zone === "exile");
      if (!card) return;
      // Beseech the Mirror's card's own mana value, as discover reads it (CR 202.3e: X is 0).
      const bargained = !e.ifBargained || !!s.objects[s.resolving!.item.objectId ?? ""]?.bargained;
      if (!sc.may && bargained && defMv(defOf(s, card)) <= e.maxMv) {
        sc.may = true;
        s.pending = { kind: "castFree", player: p.id, objectId: card.id, source: src };
        if (castProblem(s, p.id, card.id) === null) return "paused";
        s.pending = null;
      }
      if (e.elseHand && card.zone === "exile") {
        moveObject(s, card.id, "hand");
        log(s, `${p.name} puts the exiled card into their hand.`);
      }
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
        const i = e.spell === "cause" || e.spell === "self" || "epic" in e.spell ? -1 : e.spell.target;
        const t = i >= 0 ? ctx.targets[i] : undefined;
        const id = e.spell === "self" ? r.item.id : typeof e.spell === "object" && "epic" in e.spell ? e.spell.epic : i < 0 ? ctx.cause : t?.kind === "stack" && ctx.legal[i] ? t.id : undefined;
        const orig = e.spell === "self" ? r.item : id ? (s.stack.find((x) => x.id === id) ?? s.castItems?.[id] ?? s.epics?.[id]) : undefined;
        if (!orig || (orig.kind !== "spell" && !(orig.kind === "ability" && orig.body))) return;
        const n = e.n === "storm" ? (orig.castNth ?? 0) : e.n === "kicked" ? (orig.kicked?.length ?? 0) : amountNow(s, e.n, ctx);
        if (n <= 0) return;
        sc.copies = { of: id!, left: n };
      }
      const c = sc.copies;
      // As it is now, or as it was cast if it has left the stack.
      const orig = s.stack.find((x) => x.id === c.of) ?? s.castItems?.[c.of] ?? s.epics?.[c.of] ?? (r.item.id === c.of ? r.item : undefined);
      const specs = orig?.body?.targets ?? [];
      while (orig && c.left > 0) {
        if (e.newTargets && specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: ctx.controller, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.left };
          return "paused";
        }
        if (orig.kind === "ability") putAbilityCopy(s, orig, ctx.controller, c.targets ?? orig.targets);
        else putSpellCopy(s, orig, ctx.controller, c.targets ?? orig.targets, e.gains && { mods: e.gains, source: src });
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
    case "nextSpellImprovise":
      player(s, ctx.controller).nextSpellImprovise = s.turn;
      log(s, `${src}: the next spell ${player(s, ctx.controller).name} casts this turn has improvise.`);
      return;
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
          ...(e.uncounterable ? { uncounterable: true as const } : {}),
          ...(e.fromHand ? { fromHand: true as const } : {}),
        });
      return;
    }
    case "floatingTrigger": {
      // A delayed triggered ability with a duration (CR 603.7b). Its source is the spell, or the source of the ability
      // making it; its controller, whoever controlled that as it resolved (CR 603.7d-e).
      const item = s.resolving?.item;
      const spell = item?.kind === "spell";
      const id = spell ? item.objectId : ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      if (!id || !o) return;
      const about = e.about !== undefined ? objects(s, { ref: "target", index: e.about }, ctx).find((x) => x.zone === "battlefield") : undefined;
      if (e.about !== undefined && !about) return;
      const toPlayer = e.aboutPlayer !== undefined ? players(s, { ref: "target", index: e.aboutPlayer }, ctx)[0] : undefined;
      if (e.aboutPlayer !== undefined && toPlayer === undefined) return;
      (s.floatingTriggers ??= []).push({
        ...(about ? { about: { id: about.id, zc: about.zoneChanges ?? 0 } } : {}),
        ...(toPlayer !== undefined ? { toPlayer } : {}),
        id: `f${s.nextId++}`,
        controller: ctx.controller,
        sourceId: id,
        sourceCardId: cardIdOf(o),
        sourceZc: spell ? (o.zoneChanges ?? 0) : (ctx.sourceZc ?? o.zoneChanges ?? 0),
        ...(spell || item?.fromSpell ? { fromSpell: true as const } : {}),
        trigger: e.trigger,
        until: e.until,
        turn: s.turn,
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
        const limit = spell ? spellManaValue(s, spell) : defMv(ctx.sourceDef);
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && defMv(d) < limit) {
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
          shuffleLibrary(s, p);
          log(s, `${p.name} shuffles their library.`);
        }
        // Tibalt's Trickery: mill 1, 2 or 3, chosen at random (CR 701.13), first.
        if (e.millFirst) {
          const n = 1 + Math.floor(nextRandom(s) * e.millFirst);
          const milled = p.library.slice(0, n);
          for (const id of milled) moveObject(s, id, "graveyard");
          log(s, `${n} is chosen at random: ${p.name} mills ${milled.length} card${milled.length === 1 ? "" : "s"}.`);
        }
        // "With a different name than that spell": the countered spell's name (CR 201.2).
        const other = e.notNamedAs !== undefined ? spellNameOf(s, ctx, e.notNamedAs) : undefined;
        const at = p.library.findIndex((id) => !isType(defOf(s, obj(s, id)), "Land") && (other === undefined || !sameName(defOf(s, obj(s, id)).name, other)));
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
        sc.untilNonland = { ...(hit ? { hit } : {}), caster, ...(e.restBottom ? { seen } : {}) };
        if (!hit) return bottomRest(s, sc.untilNonland.seen);
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
      return bottomRest(s, sc.untilNonland.seen);
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
          if (!isType(d, "Land") && defMv(d) <= n) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        // The discovered card (CR 701.57c), cast or not: "the discovered card's mana value" (Hit the Mother Lode).
        if (hit) s.resolving!.discovered = { id: hit, mv: defMv(defOf(s, obj(s, hit))) };
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
        sc.ripple = { revealed, queue: revealed.filter((id) => sameName(defOf(s, obj(s, id)).name, name)) };
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
      return e.anyOne ? changeATargetToSelf(s, ctx, t.id, src) : changeTarget(s, ctx, t.id, src, e.unless, e.toSelf);
    }
    case "newTargets": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      return newTargets(s, ctx, t.id, src);
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
    case "spellGains": {
      // The spell that was cast, while it's still that spell on the stack (CR 400.7); a copy becomes a token (CR 111.12).
      const item = s.stack.find((x) => x.id === ctx.cause);
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      if (!o || o.zone !== "stack") return;
      // Rebound works as the spell resolves (CR 702.88a); the rest on the permanent it becomes.
      const rebound = e.mods.some((x) => x.kind === "addKeywords" && x.keywords.includes("Rebound"));
      if (rebound) {
        o.reboundGained = true;
        log(s, `${defOf(s, o).name} gains rebound.`);
      }
      const mods = e.mods.flatMap((x): Modification[] => (x.kind !== "addKeywords" ? [x] : x.keywords.some((k) => k !== "Rebound") ? [{ ...x, keywords: x.keywords.filter((k) => k !== "Rebound") }] : []));
      if (mods.length) (o.spellGains ??= []).push({ mods, timestamp: s.nextTimestamp++, controller: ctx.controller, source: src });
      return;
    }
    case "counterSpell": {
      // The spell itself, if it's still on the stack (CR 701.6a).
      if (e.cause) return ctx.cause && s.stack.some((x) => x.id === ctx.cause) ? counterOnStack(s, ctx, ctx.cause, src) : undefined;
      // "Exile any number of target spells" (Mindbreak Trap): each target still legal.
      if (e.exileSpell) {
        for (let k = e.index; k < e.index + (e.n ?? 1); k++) {
          const t = ctx.targets[k];
          if (ctx.legal[k] && t?.kind === "stack") counterOnStack(s, ctx, t.id, src, undefined, "exile", true);
        }
        return;
      }
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
      return counterOnStack(s, ctx, t.id, src, e.unless, e.exile ? "exile" : e.top ? "libraryTop" : e.hand || e.bounce ? "hand" : undefined, e.bounce);
    }
  }
}

/**
 * Counter a spell or ability on the stack (CR 701.6a), or with `unless`, only if its controller
 * doesn't pay (CR 118.12): they choose as this resolves, and may activate mana abilities to pay
 * (CR 605.3a). A spell that can't be countered stays, paid for or not (CR 101.2). A countered spell
 * goes to its owner's graveyard, or where "instead" says (CR 701.6a).
 */
/** "Then they put the exiled cards on the bottom of their library in a random order": those still in exile. */
function bottomRest(s: GameState, seen: ObjectId[] | undefined): void {
  const rest = (seen ?? []).filter((id) => s.objects[id]?.zone === "exile");
  if (!rest.length) return;
  shuffle(s, rest);
  for (const id of rest) moveObject(s, id, "library");
  log(s, `${rest.length} exiled card${rest.length === 1 ? " goes" : "s go"} to the bottom of ${player(s, s.objects[rest[0]!]!.owner).name}'s library in a random order.`);
}

/**
 * The name of target spell `index`: as it is on the stack, or its card once it has left (countered). A modal
 * double-faced card cast as its back face has its front face's name once it's gone (CR 712.8a; Tibalt's Trickery's rulings
 * want the back face's here, which isn't kept).
 */
function spellNameOf(s: GameState, ctx: ResolveCtx, index: number): string | undefined {
  const t = ctx.targets[index];
  const id = t?.kind === "stack" ? (s.stack.find((x) => x.id === t.id)?.objectId ?? ctx.spellObjects?.[index]) : undefined;
  const o = id ? s.objects[id] : undefined;
  return o && !o.faceDown ? defOf(s, o).name : undefined;
}

function counterOnStack(s: GameState, ctx: ResolveCtx, stackId: string | undefined, by: string, unless?: UnlessPays, instead?: "exile" | "libraryTop" | "hand", bounce?: true): "paused" | void {
  const i = s.stack.findIndex((x) => x.id === stackId);
  const item = s.stack[i];
  if (!item) return; // it already left the stack
  const what = item.kind === "spell" ? item.description : `${item.description.split(":")[0]}'s ability`;
  if (bounce) {
    // Returned or exiled, not countered (Reprieve, Mindbreak Trap). A copy of a spell ceases to exist (CR 707.10a).
    s.stack.splice(i, 1);
    if (item.objectId) moveObject(s, item.objectId, instead === "exile" ? "exile" : "hand");
    log(s, instead === "exile" ? `${by} exiles ${what}.` : `${by} returns ${what} to its owner's hand.`);
    return;
  }
  if (item.objectId && cantBeCountered(s, item)) {
    log(s, `${item.description} can't be countered.`); // CR 101.2
    return;
  }
  if (unless) {
    const paid = paidUnless(s, ctx, item.controller, unless, by, what);
    if (paid === "paused") return paid;
    if (s.resolving) s.resolving.unlessPaid = paid;
    if (paid) return;
  }
  s.stack.splice(i, 1);
  if (item.objectId) moveObject(s, item.objectId, instead === "exile" ? "exile" : instead === "hand" ? "hand" : instead ? "library" : "graveyard", instead === "libraryTop" ? { top: true } : {});
  // "Discover X, where X is that spell's mana value" (Hurl into History): with the X chosen for it (CR 202.3e, rulings).
  const gone = item.objectId && s.objects[item.objectId];
  if (gone && item.x && s.resolving) (s.resolving.countered ??= {})[gone.id] = { zc: gone.zoneChanges ?? 0, x: item.x };
  log(s, `${by} counters ${what}${!item.objectId ? "" : instead === "exile" ? " and exiles it" : instead === "hand" ? " and returns it to its owner's hand" : instead ? " and puts it on top of its owner's library" : ""}.`);
}

/**
 * A spell that can't be countered (CR 101.2): its own "~ can't be countered", or a permanent's "Creature spells you
 * control can't be countered". The counter effect still does whatever else it does (rulings on Prowling Serpopard).
 */
export function cantBeCountered(s: GameState, item: StackItem): boolean {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return false;
  const d = defOf(s, o);
  if (compileCard(d).cantBeCountered || (o.uncounterableCast && !item.copy)) return true;
  // "Spells you control can't be countered this turn" (Veil of Summer): those on the stack already too (rulings).
  if ((s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === item.controller && r.rule === "spellsUncounterable")) return true;
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
  // "Ward—Sacrifice a creature": the permanents they chose (see payUnless), sacrificed as the payment (CR 701.21a).
  if (sc.paid === undefined && unless.sacrifice && sc.chosen?.[payer]) {
    for (const id of sc.chosen[payer]!) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      log(s, `${player(s, payer).name} sacrifices ${defOf(s, o).name}.`);
      moveObject(s, id, "graveyard", { sacrificed: true });
    }
    sc.paid = true;
  }
  if (sc.paid === undefined) {
    const p = player(s, payer);
    // The amount is fixed as the choice is offered (CR 608.2h).
    const cost = unlessCost(unless.cost, unless.generic === undefined ? 0 : Math.max(0, amountNow(s, unless.generic, ctx)));
    // "Pay life equal to this creature's power": its power now, or as it last existed (CR 608.2h). Paying 0 life is
    // allowed (CR 119.4).
    const life = unless.life ?? (unless.lifeAmount ? Math.max(0, amountNow(s, unless.lifeAmount, ctx)) : 0);
    // A player can't discard more cards than they have (CR 701.9b), nor sacrifice permanents they don't control
    // (CR 118.3), so they can't pay that.
    if (p.lost || (unless.discard && p.hand.length < unless.discard) || (unless.sacrifice && pickOptions(s, unless.sacrifice, payer).length < unless.sacrifice.n)) sc.paid = false;
    else if (cost === "{0}" && !life && !unless.discard && !unless.sacrifice) {
      // Paying {0} is just saying so (CR 118.5); nobody would refuse.
      log(s, `${p.name} pays {0}${unless.lifeAmount ? " (0 life)" : ""} for ${by}.`);
      sc.paid = true;
    } else {
      s.pending = { kind: "payUnless", player: p.id, cost, source: by, what, ...(otherwise ? { otherwise } : {}), ...(life ? { life } : {}), ...(unless.discard ? { discard: unless.discard } : {}), ...(unless.sacrifice ? { sacrifice: unless.sacrifice } : {}) };
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
function changeTarget(s: GameState, ctx: ResolveCtx, stackId: string, by: string, unless?: UnlessPays, toSelf?: true): "paused" | void {
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
  if (toSelf) {
    // To this ability's source, still on the battlefield as the same object, and only if it's a legal target for it.
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const here = !!me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
    const to = here ? changeTargetOptions(s, item, spec, current).find((t) => t.kind === "object" && t.id === me!.id) : undefined;
    if (!to) {
      log(s, `${by} can't become the target of ${item.description}, so its target stays the same.`);
      return;
    }
    sc.newTarget = to;
  }
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
  fireEvent(s, { type: "targeted", stackId: item.id, only: next.kind === "object" ? [next.id] : [] });
}

/**
 * "Change a target of target spell or ability to ~" (Spellskite): any one of its targets that ~, still on the battlefield
 * as the same object, could legally become without making another of its targets illegal, chosen as this resolves
 * (rulings); "up to" targets left unchosen stay so (the number of targets doesn't change). With none, nothing changes.
 */
function changeATargetToSelf(s: GameState, ctx: ResolveCtx, stackId: string, by: string): "paused" | void {
  const item = s.stack.find((x) => x.id === stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!item || (item.kind === "spell" && !o)) return;
  const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
  const here = !!me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
  const current = item.targets ?? [];
  const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
  const slots = !here
    ? []
    : current.flatMap((c, j) => {
        const spec = specs[j];
        if (!spec || c.kind === "none") return [];
        const to = changeTargetOptions(s, item, spec, c).find((t) => t.kind === "object" && t.id === me!.id);
        return to && swapKeepsOthersLegal(s, specs, current, j, to) ? [{ j, to }] : [];
      });
  if (!slots.length) {
    log(s, `${by} can't become a target of ${item.description}, so its targets stay the same.`);
    return;
  }
  const sc = (s.resolving!.scratch ??= {});
  if (sc.targetSlot === undefined && slots.length > 1) {
    s.pending = { kind: "chooseOption", player: ctx.controller, source: by, what: "targetSlot", prompt: `Which target of ${item.description} becomes ${by}?`, options: slots.map((x) => String(x.j)), labels: slots.map((x) => `Instead of ${describeTargets(s, [current[x.j]!]).replace(/^ targeting /, "")}`) };
    return "paused";
  }
  const pick = slots.find((x) => x.j === (sc.targetSlot ?? slots[0]!.j)) ?? slots[0]!;
  const was = current[pick.j]!;
  const amount = was.kind === "object" || was.kind === "player" ? was.amount : undefined;
  const next = amount !== undefined && pick.to.kind === "object" ? { ...pick.to, amount } : pick.to;
  item.targets = current.map((x, i) => (i === pick.j ? stampTargets(s, [next])![0]! : x));
  log(s, `${by} changes a target of ${item.description}${describeTargets(s, [was]).replace(/^ targeting/, " from")}${describeTargets(s, [next]).replace(/^ targeting/, " to")}.`);
  fireEvent(s, { type: "targeted", stackId: item.id, only: [me!.id] });
}

/**
 * "You may choose new targets for target spell or ability" (CR 115.7d): its targets are chosen again as this resolves,
 * keeping any, legal or not, and changing others to legal ones. Its new targets become targets of it ("becomes the
 * target" triggers, ward); the ones it keeps don't again. With nothing it could change to, nothing is asked.
 */
function newTargets(s: GameState, ctx: ResolveCtx, stackId: string, by: string): "paused" | void {
  const item = s.stack.find((x) => x.id === stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!item || (item.kind === "spell" && !o)) return;
  const current = item.targets ?? [];
  const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
  if (!current.some((t) => t.kind !== "none") || specs.length !== current.length) return;
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.retargets) {
    if (!current.some((t, j) => t.kind !== "none" && changeTargetOptions(s, item, specs[j]!, t).length)) {
      log(s, `${item.description} has no other legal targets, so its targets stay the same.`);
      return;
    }
    s.pending = { kind: "newTargets", player: ctx.controller, source: by, spell: item.description, stackId: item.id, controller: item.controller, specs, current };
    return "paused";
  }
  const next = sc.retargets;
  const changed = next.flatMap((t, j) => (t.kind !== "none" && !sameTarget(current[j], t) ? [t] : []));
  if (!changed.length) {
    log(s, `${player(s, ctx.controller).name} keeps the targets of ${item.description}.`);
    return;
  }
  item.targets = next.map((t, j) => (t.kind !== "none" && !sameTarget(current[j], t) ? stampTargets(s, [t])![0]! : t));
  log(s, `${by} changes the targets of ${item.description}${describeTargets(s, item.targets).replace(/^ targeting/, " to")}.`);
  fireEvent(s, { type: "targeted", stackId: item.id, only: changed.flatMap((t) => (t.kind === "object" ? [t.id] : [])) });
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
  (s.delayed ??= []).push({ when, controller, sourceCardId, subject: { id: o.id, zc: o.zoneChanges ?? 0 }, body, turn: s.turn, step: s.step, ...(o.transforms ? { transforms: o.transforms } : {}) });
}

/** Was it kicked (CR 702.33d), with that kicker cost if the condition names one (702.33f)? */
export function kickedMatches(kicked: number[] | undefined, cond: SpellCondition): boolean {
  if (cond.kind !== "kicked") return false;
  return cond.which === undefined ? !!kicked?.length : !!kicked?.includes(cond.which);
}

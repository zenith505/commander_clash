import { isRealKicker, type AbilityBody, type Amount, type Effect, type Modification, type SpellCondition, type TargetChoice, type TargetSpec, type UnlessPays } from "../abilities";
import { manaValue, parseManaCost, xCount } from "../mana";
import { abilitiesOf, cardIdOf, defOf, isType, objIsType } from "../cards";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "../layers";
import { nextRandom, shuffle, shuffleLibrary } from "../rng";
import { blightOptions, putCounters } from "../counters";
import { castProblem, collectEvidence, destroyPermanent, enterTogether, evidenceProblem, freeCastable, describeTargets, log, millCount, moveObject, newObject, obj, opponents, player } from "../game";
import { compileCard, spellTargetSpecs } from "../oracle";
import { PERMANENT_TYPES } from "../oracle/targets";
import type { CardDef, Chosen, DelayedTrigger, GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import { bindChosen, isLegalTarget, legalTargets, objectMatches, pickOptions, printedMatches, sameTarget, sourceQuality, spellManaValue, spellQuality, stampTargets, swapKeepsOthersLegal } from "./targeting";
import { ResolveCtx, objects, amountNow, players, blockHistoryAt } from "./resolve";
import { closeZoneBatch, fireEvent } from "./triggers";
import { discardCards, toBottom } from "./run-library";
import { suspendExiled } from "./run-zones";
import { defMv, sameName } from "../faces";
import { copyKey, type CopyExcept } from "../copies";

/**
 * Zada, Ink-Treader Nephilim, Precursor Golem: the permanents a copy of `orig` is made for (see Effect copySpell's
 * `eachOther`), in the order they're on the battlefield (the copies' controller then picks the order, see copySpell). Each must be one every target of the spell could name, as its
 * caster and with the spell as the source (rulings: shroud, protection and targeting restrictions leave one out).
 */
export function eachOtherTargets(s: GameState, orig: StackItem, eo: NonNullable<Extract<Effect, { type: "copySpell" }>["eachOther"]>, ctx: Pick<ResolveCtx, "sourceId" | "controller" | "sourceZc">): ObjectId[] {
  const chosen = (orig.targets ?? []).map((t, i) => ({ t, spec: orig.body?.targets[i] })).filter((x) => x.t.kind !== "none");
  const first = chosen[0]?.t;
  if (first?.kind !== "object" || chosen.some((x) => x.t.kind !== "object" || x.t.id !== first.id || !x.spec)) return [];
  const me = ctx.sourceId;
  // "If that spell targets only ~" (Ink-Treader Nephilim): again as it resolves (CR 603.4).
  if (eo.onlySelf && first.id !== me) return [];
  const card = orig.objectId ? s.objects[orig.objectId] : undefined;
  const src = card ? spellQuality(s, cardIdOf(card), orig) : undefined;
  // Ivy, Gleeful Spellthief: only ~, if it's still on the battlefield and the copy (this ability's controller's) could
  // target it (rulings).
  // Frontline Heroism: the tokens this resolution created that the copy (this ability's controller's) could target with
  // every target of the spell (CR 707.10e).
  if (eo.toCreated) return (s.resolving?.created ?? []).filter((id) => id !== first.id && s.objects[id]?.zone === "battlefield" && s.objects[id]!.isToken && chosen.every((x) => isLegalTarget(s, x.spec!, { kind: "object", id }, ctx.controller, src)));
  if (eo.toSource) return me && me !== first.id && s.objects[me]?.zone === "battlefield" && (ctx.sourceZc === undefined || (s.objects[me]!.zoneChanges ?? 0) === ctx.sourceZc) && chosen.every((x) => isLegalTarget(s, x.spec!, { kind: "object", id: me }, ctx.controller, src)) ? [me] : [];
  return s.battlefield.filter((id) => {
    if (id === first.id || (eo.self && id === me)) return false;
    if (!objectMatchesFor(s, eo.among, id, eo.casterControls ? orig.controller : ctx.controller)) return false;
    return chosen.every((x) => isLegalTarget(s, x.spec!, { kind: "object", id }, orig.controller, src));
  });
}

const objectMatchesFor = (s: GameState, spec: TargetSpec, id: ObjectId, you: PlayerId) => objectMatches(s, spec, obj(s, id), you, false);

/**
 * Put a copy of this spell on the stack under `controller` (CR 707.10): its values and every choice made casting
 * it (modes, X, kicker, what was sacrificed), with these targets. It isn't cast.
 */
export function putSpellCopy(s: GameState, orig: StackItem, controller: PlayerId, targets: TargetChoice[] | undefined, gains?: { mods: Modification[]; source: string }, except?: CopyExcept, cardThen?: GameObject) {
  // `cardThen`: the spell's object as it last was on the stack, once it has left (Psychic Rebuttal, CR 707.10).
  const card = cardThen ?? (orig.objectId ? s.objects[orig.objectId] : undefined);
  if (!card) return;
  // A copy of a nonmodal double-faced spell's back face (cast transformed: disturb) has mana value 0 (CR 202.3b).
  const def = s.cards[cardIdOf(card)]!;
  // "~ can't be copied" (See Double): no copy is made (CR 707.10).
  if (compileCard(def).spell?.uncopyable) {
    log(s, `${def.name} can't be copied.`);
    return;
  }
  const base = def.faceOf && def.faceOf.face > 0 && def.layout === "transform" ? s.cards[copyKey(s, def)]! : def;
  // "Except it isn't legendary" (Double Major): an exception to the copy's copiable values (CR 707.9b).
  const o = newObject(s, except ? s.cards[copyKey(s, base, except)]! : base, controller, "stack");
  o.spellCopy = true;
  if (gains) o.copyGains = { mods: gains.mods, timestamp: s.nextTimestamp++, controller, source: gains.source };
  // A Dragons of Tarkir spell's bonus for controlling a Dragon as it was cast: the copy wasn't cast (rulings).
  o.kicked = card.kickedByControl ? undefined : card.kicked;
  o.castAlt = card.castAlt;
  o.bestowed = card.bestowed; // a copy of a bestowed Aura spell is one too (CR 702.103c)
  o.prototyped = card.prototyped; // and of a prototyped spell (CR 718.3c)
  o.overloaded = card.overloaded; // a copy copies the alternative cost paid, and so its text change (CR 707.10, 702.96a)
  o.cleaved = card.cleaved; // and cleave's (CR 707.10, 702.148a)
  // Decisions about additional costs are copied too (CR 707.10): bargain, evidence, teamwork, and the gift's opponent.
  o.bargained = card.bargained;
  o.evidence = card.evidence;
  o.teamwork = card.teamwork;
  o.gift = card.gift;
  const name = orig.description.replace(/ \(copy\)$/, "");
  const id = `s${s.nextId++}`;
  const { castNth: _, castInMain: _main, kickedByControl: _byControl, ...rest } = structuredClone(orig);
  if (_byControl) delete rest.kicked;
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

/** Spinerock Tyrant: a spell on the stack gains these until it leaves it (GameObject.spellGains; its damage, CR 702.80a). */
function thoseGain(s: GameState, mods: Modification[], item: StackItem, controller: PlayerId, src: string) {
  const o = item.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
  if (!o || o.zone !== "stack") return;
  (o.spellGains ??= []).push({ mods, timestamp: s.nextTimestamp++, controller, source: src });
  invalidateCharacteristics(s);
  log(s, `${item.description} gains ${mods.flatMap((m) => (m.kind === "addKeywords" ? m.keywords : [])).join(", ").toLowerCase()}.`);
}

/** Twinning Staff: how many additional copies a player gets when they copy a spell (one per permanent with it, rulings). */
/** Whether `pid` could cast this card as a pending free cast of it (PendingDecision "castFree") now, mana for its additional costs (the commander tax) aside. */
function freeCastableFor(s: GameState, pid: PlayerId, id: ObjectId, src: string): boolean {
  const keep = s.pending;
  s.pending = { kind: "castFree", player: pid, objectId: id, source: src };
  const ok = freeCastable(s, pid, id, true);
  s.pending = keep;
  return ok;
}

export function extraSpellCopies(s: GameState, pid: PlayerId): number {
  return s.battlefield.filter((id) => abilitiesOf(s, obj(s, id)).extraSpellCopy && controllerOf(s, obj(s, id)) === pid).length;
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
      // Glimpse the Impossible: the cards this spell exiled to play ("those cards").
      const impulsed = (s.resolving?.impulsed ?? []).map((x) => ({ id: x, zc: s.objects[x]?.zoneChanges ?? 0 }));
      // Mechtitan Core: the permanents its cost exiled.
      const costExiled = s.resolving?.item.costExiled ?? [];
      const effects = e.effects.map((x): Effect => (x.type === "returnFaceDownExiled" ? { ...x, cards: exiled } : x.type === "exiledToGraveyard" ? { ...x, cards: impulsed } : x.type === "returnExiled" && x.fromCost ? { ...x, cards: costExiled } : x.type === "exileRemembered" ? { ...x, cards: (s.resolving?.created ?? []).map((c) => ({ id: c, zc: s.objects[c]?.zoneChanges ?? 0 })) } : x));
      // Ochre Jelly: a copy of ~ as it last existed on the battlefield, with half the counters of that kind it had then,
      // rounded down (CR 608.2h): both known now, from the dies trigger's last known information.
      for (const [i, x] of effects.entries())
        if (x.type === "createTokenCopy" && x.lkiCopy) {
          const { lkiCopy, ...rest } = x;
          // ~ as it last existed on the battlefield, the zone change before the one that put it in the graveyard.
          const lk = ctx.sourceId ? s.lastKnown?.[ctx.sourceId] : undefined;
          const copyKey = lk && ctx.sourceZc !== undefined && lk.zc === ctx.sourceZc - 1 ? lk.copyKey : undefined;
          if (!copyKey || !ctx.lki) return;
          const n = Math.floor((ctx.lki.counters?.[lkiCopy.halfCounters] ?? 0) / 2);
          effects[i] = { ...rest, copyKey, ...(n > 0 ? { except: { ...rest.except, enterCounters: [...(rest.except?.enterCounters ?? []), { counter: lkiCopy.halfCounters, n }] } } : {}) };
        }
      // Venomous Breath: "destroy all creatures that blocked or were blocked by it this turn": the target as it is now.
      for (const [i, x] of effects.entries())
        if ("what" in x && x.what && typeof x.what === "object" && "ref" in x.what && x.what.ref === "blockHistory" && !x.what.at) {
          // Triton Tactics: "one of those creatures", each of the targets still legal (CR 608.2b).
          const of = x.what.of;
          if (of.ref === "target" && "n" in of && of.n) {
            const ats: { id: ObjectId; zc: number }[] = [];
            for (let j = of.index; j < of.index + of.n; j++) {
              const t = ctx.targets[j];
              if (t?.kind === "object" && ctx.legal?.[j] !== false) ats.push({ id: t.id, zc: t.zc ?? s.objects[t.id]?.zoneChanges ?? 0 });
            }
            effects[i] = { ...x, what: { ...x.what, ats } } as Effect;
            continue;
          }
          const at = blockHistoryAt(s, x.what, ctx);
          if (at) effects[i] = { ...x, what: { ...x.what, at } } as Effect;
        }
      // Dragonhawk: "for each of those cards that are still exiled", the cards this ability exiled.
      for (const x of effects) if (x.type === "damage" && typeof x.amount === "object" && x.amount.count.kind === "stillExiled") Object.assign(x, { amount: { ...x.amount, count: { kind: "stillExiled", cards: impulsed } } });
      const body = { targets: e.targets ?? [], effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." };
      if (e.when === "dies") {
        // "When that creature dies this turn, flip ~" (Initiate of Blood): about that permanent as it is now (CR 603.7c,
        // 400.7), its instructions about this ability's source.
        const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        for (const o of objects(s, e.of!, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, "leaves", ctx.controller, o, body, src ? cardIdOf(src) : cardIdOf(o));
          const d = s.delayed![s.delayed!.length - 1]!;
          Object.assign(d, { to: ["graveyard"], dies: true, ...(e.thisTurn ? { thisTurn: s.turn } : {}), ...(e.underYourControl ? { underControl: true } : {}), ...(e.anyPermanent ? { anyPermanent: true } : {}), ...(e.intoYourGraveyard ? { ownedByController: true } : {}), ...(e.ifHadCounter ? { ifHadCounter: e.ifHadCounter } : {}), ...(e.ifCond ? { ifCond: e.ifCond } : {}), ...(e.lkiCounters ? { lkiCounters: true as const } : {}), ...(src ? { source: { id: src.id, zc: ctx.sourceZc ?? src.zoneChanges ?? 0 } } : {}) });
        }
        return;
      }
      if (e.when === "leaves" && e.of && (e.thisTurn || e.orUntaps)) {
        // "When that creature leaves the battlefield this turn, sacrifice ~" (Kjeldoran Elite Guard): about that permanent as
        // it is now (CR 603.7c, 400.7), whatever zone it goes to (CR 603.6c); its instructions about this ability's source.
        const src = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        // War Barge: "When ~ leaves the battlefield this turn, destroy that creature": ~ watched, about the target as it is
        // now (CR 603.7c, 400.7); none if that target is gone.
        const about = e.about !== undefined ? objects(s, { ref: "target", index: e.about }, ctx).find((x) => x.zone === "battlefield") : undefined;
        if (e.about !== undefined && !about) return;
        for (const o of objects(s, e.of, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, "leaves", ctx.controller, o, body, src ? cardIdOf(src) : cardIdOf(o));
          // Merieke Ri Berit: "or becomes untapped", with no end (CR 603.7c).
          Object.assign(s.delayed![s.delayed!.length - 1]!, { to: ["graveyard", "exile", "hand", "library", "command"], ...(e.thisTurn ? { thisTurn: s.turn } : {}), ...(e.orUntaps ? { orUntaps: true as const } : {}), ...(src ? { source: { id: src.id, zc: ctx.sourceZc ?? src.zoneChanges ?? 0 } } : {}), ...(about ? { about: { id: about.id, zc: about.zoneChanges ?? 0 } } : {}) });
        }
        return;
      }
      // Maeve, Insidious Singer: "Whenever that creature attacks one of your opponents this turn", the same way.
      if (e.when === "becomesBlocked" || e.when === "attacksOpponent") {
        // Barreling Attack: "When that creature becomes blocked this turn, it gets ...": about that permanent as it is now
        // (CR 603.7c, 400.7), each time it becomes blocked this turn (CR 603.7b); its source is the spell (603.7d).
        for (const o of objects(s, e.of!, ctx)) {
          if (o.zone !== "battlefield") continue;
          addDelayed(s, e.when, ctx.controller, o, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(o));
          s.delayed![s.delayed!.length - 1]!.thisTurn = s.turn;
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
      // Phytotitan: the card in the graveyard now (CR 400.7), at its owner's next upkeep.
      if (e.when === "ownersNextUpkeep") {
        // Plague Reaver: "at the beginning of their next upkeep", `whose` (the target opponent), who is the delayed trigger's
        // event player ("that player"); none if they've left the game (rulings).
        const whose = e.whose ? players(s, e.whose, ctx)[0] : undefined;
        if (e.whose && whose === undefined) return;
        if (e.each === "selfCard")
          // An activated ability's "Sacrifice ~" cost put the card there after it was activated (CR 400.7).
          for (const card of objects(s, { ref: "selfCard", ...(e.whose ? { moved: true as const } : {}) }, ctx)) {
            addDelayed(s, "playersNextUpkeep", ctx.controller, card, body, undefined, whose ?? card.owner);
            if (whose !== undefined) s.delayed![s.delayed!.length - 1]!.event = { player: whose };
          }
        return;
      }
      if (e.of && e.each !== "selfCard") {
        // About each of those permanents as it is now (CR 603.7c, 400.7).
        for (const o of objects(s, e.of, ctx))
          if (o.zone === "battlefield") {
            // Shambling Swarm: as many removed as were put on that creature this way (the ones removed needn't be the same
            // counters, rulings).
            const put = e.perCounterPut ? (s.resolving?.countersPutThisWay ?? []).filter((c) => c.id === o.id && c.zc === (o.zoneChanges ?? 0) && (e.of!.ref !== "countersPutThisWay" || !e.of!.kind || c.kind === e.of!.kind)).reduce((a, c) => a + (c.n ?? 1), 0) : 0;
            const own = e.perCounterPut ? { ...body, effects: body.effects.map((x): Effect => (x.type === "removeCounters" ? { ...x, n: put } : x)) } : body;
            addDelayed(s, e.when, ctx.controller, o, own, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(o));
            // Mysterio, Master of Illusion: "when ~ leaves the battlefield", for whatever zone it goes to (CR 603.6c).
            if (e.when === "leaves") s.delayed![s.delayed!.length - 1]!.to = ["graveyard", "exile", "hand", "library", "command"];
            // Goblin Sappers: "destroy it and ~": ~ as it is now, too; if it left, it's a new object (CR 400.7).
            const me = e.withSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
            if (me) s.delayed![s.delayed!.length - 1]!.source = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
          }
        return;
      }
      if (e.each === "attachedThisWay") {
        for (const t of s.resolving?.attachedThisWay ?? []) if (s.objects[t]?.zone === "battlefield") addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
        return;
      }
      if (e.each === "created") {
        for (const t of s.resolving?.created ?? [])
          if (s.objects[t]?.zone === "battlefield") {
            addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
            // "When that token leaves the battlefield" (Ugin, the Ineffable): for whatever zone it goes to (CR 603.6c).
            if (e.when === "leaves") s.delayed![s.delayed!.length - 1]!.to = ["graveyard", "exile", "hand", "library", "command"];
            // Stangg: "Sacrifice ~ when that token leaves the battlefield": ~ as it is now; if it left, it's a new object (CR 400.7).
            const me = e.withSource && ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
            if (me) s.delayed![s.delayed!.length - 1]!.source = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
          }
        return;
      }
      // A merged permanent's cards each (CR 730.3c): one delayed trigger for each.
      if (e.each === "subjectCard") {
        for (const card of objects(s, { ref: "subjectCard" }, ctx)) addDelayed(s, e.when, ctx.controller, card, body, id && s.objects[id] ? cardIdOf(s.objects[id]!) : cardIdOf(card));
        return;
      }
      // Gift of Immortality: the creature the dead card became (CR 400.7), and the Aura's card in the graveyard it went
      // to. A token never comes back, so nothing is set up then (rulings).
      if (e.each === "returned") {
        const card = ctx.subject ? s.objects[ctx.subject.id] : undefined;
        const aura = objects(s, { ref: "selfCard", moved: true }, ctx)[0];
        if (!card || !aura || card.zone !== "battlefield" || (card.zoneChanges ?? 0) !== ctx.subject!.zc + 1) return;
        addDelayed(s, e.when, ctx.controller, card, body, cardIdOf(aura));
        s.delayed![s.delayed!.length - 1]!.source = { id: aura.id, zc: aura.zoneChanges ?? 0 };
        return;
      }
      if (e.each === "selfCard") {
        // An Aura's card that went to the graveyard as its creature died (Ghoulish Impetus): `of` says so.
        // Endless Whispers: "choose target opponent. That player puts ~ ...": the delayed trigger remembers that player as its
        // event player (CR 603.7c); none is made for a player who has left.
        const who = e.event?.player ? players(s, e.event.player, ctx)[0] : undefined;
        if (e.event?.player && who === undefined) return;
        for (const card of objects(s, e.of?.ref === "selfCard" ? e.of : { ref: "selfCard" }, ctx)) {
          addDelayed(s, e.when, ctx.controller, card, body);
          if (who !== undefined) s.delayed![s.delayed!.length - 1]!.event = { player: who };
        }
        return;
      }
      if (e.each === "subject") {
        const subj = objects(s, { ref: "subject" }, ctx)[0];
        if (subj) addDelayed(s, e.when, ctx.controller, subj, body, cardIdOf(s.objects[id ?? ""] ?? subj));
        // Contempt: "return it and ~ ... at end of combat": ~ as it is now, too; if it left, it's a new object (CR 400.7).
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        if (subj && e.withSource && me) s.delayed![s.delayed!.length - 1]!.source = { id: me.id, zc: ctx.sourceZc ?? me.zoneChanges ?? 0 };
        return;
      }
      const o = id ? s.objects[id] : undefined;
      // Faramir: "that player's next end step", the chosen opponent's (CR 603.7), who is "they" then.
      // Suppress: "the end step of that player's next turn", the target player's, on a later turn.
      if (e.when === "playersNextEndStep" || e.when === "playersNextTurnEndStep") {
        const whose = e.whose ? players(s, e.whose, ctx)[0] : undefined;
        if (o && whose !== undefined) {
          addDelayed(s, e.when, ctx.controller, o, body, undefined, whose);
          s.delayed![s.delayed!.length - 1]!.event = { player: whose };
        }
        return;
      }
      // A token that died has ceased to exist (CR 704.5d, 111.7), but its dies trigger still makes the delayed trigger,
      // which works on its own once made (CR 603.7): "When this creature dies, create a 4/4 red Bird ... at the
      // beginning of the next end step" (a token Rukh Egg). It's about the object that was, its source the ability's
      // card definition (CR 113.7a); Ochre Jelly's copy is already known (createTokenCopy.copyKey).
      const key = effects.find((x) => x.type === "createTokenCopy" && x.copyKey) as { copyKey: string } | undefined;
      const goneCardId = !o && id ? (key?.copyKey ?? (item?.kind !== "spell" ? item?.sourceCardId : undefined)) : undefined;
      if (o) addDelayed(s, e.when, ctx.controller, o, body);
      else if (id && goneCardId) (s.delayed ??= []).push({ when: e.when as DelayedTrigger["when"], controller: ctx.controller, sourceCardId: goneCardId, subject: { id, zc: ctx.sourceZc ?? 0 }, body, turn: s.turn, step: s.step });
      const made = !!o || !!(id && goneCardId);
      // "At this turn's next end of combat" (Venomous Breath): never on a later turn.
      // Feral Encounter: "At the beginning of the next combat phase this turn": the same.
      if (made && e.thisTurn && (e.when === "endOfCombat" || e.when === "nextBeginCombat")) s.delayed![s.delayed!.length - 1]!.thisTurn = s.turn;
      // What it remembers from now (CR 603.7c, 608.2h): the countered spell's controller, its mana value.
      if (made && e.event) {
        const who = e.event.player ? players(s, e.event.player, ctx)[0] : undefined;
        if (e.event.player && who === undefined) s.delayed!.pop();
        else s.delayed![s.delayed!.length - 1]!.event = { ...(who !== undefined ? { player: who } : {}), ...(e.event.amount !== undefined ? { amount: amountNow(s, e.event.amount, ctx) } : {}) };
      }
      return;
    }
    case "castSearched": {
      // "Search your library for ... and cast that card without paying its mana cost" (Sunforger): cast from the library
      // as this resolves (CR 608.2g); X is 0 (CR 107.3b). One that can't be cast stays there, to be shuffled. Not casting
      // it is offered too, as finding nothing was (CR 701.23b).
      const sc = (s.resolving!.scratch ??= {});
      const id = s.resolving!.searchCast;
      // Bring to Light: from exile, where the search put it (SearchDest.castFree); it stays there if it isn't cast (rulings).
      if (sc.playLinked || !id || (s.objects[id]?.zone !== "library" && s.objects[id]?.zone !== "exile")) return;
      sc.playLinked = true;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: id, source: src };
      if (freeCastable(s, ctx.controller, id)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, obj(s, id)).name} can't be cast.`);
      return;
    }
    case "castSelfFree": {
      // Thunderblade Charge: the card in its owner's graveyard, still the object the ability came from (CR 400.7), cast
      // from there as this resolves, timing ignored (CR 608.2g); X is 0 (CR 107.3b). Not casting it is offered too.
      const sc = (s.resolving!.scratch ??= {});
      const o = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
      if (sc.playLinked || !o || o.zone !== "graveyard" || (o.zoneChanges ?? 0) !== ctx.sourceZc || o.owner !== ctx.controller) return;
      sc.playLinked = true;
      s.pending = { kind: "castFree", player: ctx.controller, objectId: o.id, source: src };
      if (freeCastable(s, ctx.controller, o.id)) return "paused";
      s.pending = null;
      log(s, `${defOf(s, o).name} can't be cast.`);
      return;
    }
    case "castCommanderFree": {
      // Geode Golem: a commander you own (CR 903.3) in the command zone as this resolves, cast then (CR 608.2g); the
      // commander tax is an additional cost, still paid (CR 903.8, 118.9d; rulings). With two, either one (rulings on
      // partner): the choice first, then whether to cast it.
      const sc = (s.resolving!.scratch ??= {});
      const p = player(s, ctx.controller);
      if (sc.playLinked) return;
      const mine = p.command.filter((id) => obj(s, id).isCommander && obj(s, id).owner === p.id && freeCastableFor(s, p.id, id, src));
      if (!mine.length) return;
      if (mine.length > 1 && (sc.commander === undefined || !mine.includes(sc.commander))) {
        s.pending = { kind: "chooseOption", player: p.id, source: src, what: "commander", options: mine, labels: mine.map((id) => defOf(s, obj(s, id)).name), prompt: "cast which commander without paying its mana cost?" };
        return "paused";
      }
      const id = mine.length > 1 ? sc.commander! : mine[0]!;
      sc.commander = undefined;
      sc.playLinked = true;
      s.pending = { kind: "castFree", player: p.id, objectId: id, source: src };
      return "paused";
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
      const linked = (key ? (s.linkedExile?.[key] ?? []) : []).map((l) => ({ o: s.objects[l.id], zc: l.zc })).filter(({ o, zc }) => o?.zone === "exile" && (o.zoneChanges ?? 0) === zc).map(({ o }) => o!);
      const p = player(s, ctx.controller);
      // Panoptic Mirror: "a card exiled with ~": with several, the one to copy is chosen as it resolves (or none: copying
      // is optional, rulings).
      let card = linked[0];
      if (e.choose && linked.length > 1) {
        if (!sc.found) {
          const cards = linked.map((o) => o.id);
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: "a card exiled with it", cards, min: 0, max: 1, exiled: true, dig: { looked: cards, to: "to copy (you may cast the copy without paying its mana cost)", rest: "stay in exile" } };
          return "paused";
        }
        card = linked.find((o) => sc.found!.includes(o.id));
        sc.found = undefined;
      }
      if (!card) return;
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
        if (freeCastable(s, p.id, card.id)) return "paused";
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
      // Display of Power: each target spell copied in turn, in the order they were targeted (one copy of each, rulings).
      if (typeof e.spell === "object" && "target" in e.spell && e.spell.many) {
        const { target: first, n: many = 1 } = e.spell;
        for (sc.copyManyAt ??= 0; sc.copyManyAt < many; sc.copyManyAt++) {
          if (runSpellsEffect(s, { ...e, spell: { target: first + sc.copyManyAt } }, ctx, src) === "paused") return "paused";
          sc.copies = undefined;
        }
        sc.copyManyAt = undefined;
        return;
      }
      if (!sc.copies) {
        // Psychic Rebuttal: the spell countered this way, as it last was on the stack (none if it wasn't countered).
        if (e.spell === "countered") {
          const snap = r.counteredCopy;
          if (!snap) return;
          const extra = extraSpellCopies(s, ctx.controller); // Twinning Staff (CR 614.1a)
          sc.copies = { of: snap.item.id, left: 1, ...(extra ? { extra } : {}) };
        }
      }
      if (!sc.copies) {
        const i = e.spell === "cause" || e.spell === "self" || e.spell === "countered" || "epic" in e.spell ? -1 : e.spell.target;
        const t = i >= 0 ? ctx.targets[i] : undefined;
        const id = e.spell === "self" ? r.item.id : typeof e.spell === "object" && "epic" in e.spell ? e.spell.epic : i < 0 ? ctx.cause : t?.kind === "stack" && ctx.legal[i] ? t.id : undefined;
        const orig = e.spell === "self" ? r.item : id ? (s.stack.find((x) => x.id === id) ?? s.castItems?.[id] ?? s.epics?.[id]) : undefined;
        if (!orig || (orig.kind !== "spell" && !(orig.kind === "ability" && orig.body))) return;
        // "This ability can't be copied" (Gogo), "~ can't be copied" (See Double): no copy is made.
        const origCard = orig.kind === "spell" && orig.objectId ? s.objects[orig.objectId] : undefined;
        if (orig.body?.uncopyable || (origCard && compileCard(s.cards[cardIdOf(origCard)]!).spell?.uncopyable)) {
          log(s, `${orig.description} can't be copied.`);
          return;
        }
        if (e.n === "eachOther") {
          // Zada, Ink-Treader Nephilim, Precursor Golem: no copy is made if the spell has left the stack.
          // Ivy, Gleeful Spellthief's is made from the spell as it last was (rulings).
          if (orig.kind !== "spell" || (!e.eachOther!.toSource && !e.eachOther!.toCreated && !e.eachOther!.choosePay && !s.stack.some((x) => x.id === orig.id))) return;
          const all = eachOtherTargets(s, orig, e.eachOther!, ctx);
          const by = e.eachOther!.caster ? orig.controller : ctx.controller;
          // Feather, Radiant Arbiter: its controller picks any of them, paying for each (pickPermanents `payEach`).
          const pay = e.eachOther!.choosePay;
          if (pay && all.length && !sc.chosen?.[by]) {
            sc.queue = [by];
            sc.chosen = {};
            s.pending = { kind: "pickPermanents", player: by, source: src, action: "copyFor", what: "creature", options: all, count: all.length, min: 0, anyNumber: true, payEach: pay, prompt: `click any number of other creatures ${orig.description} could target, paying ${pay} for each: a copy of it targets each one` };
            return "paused";
          }
          const each = pay ? (sc.chosen?.[by] ?? []).filter((id) => all.includes(id)) : all;
          if (pay) {
            sc.queue = undefined;
            sc.chosen = undefined;
          }
          if (!each.length) return;
          const extra = extraSpellCopies(s, by);
          // Frontline Heroism: one copy, aimed at one of the tokens, its controller's choice if a replacement made more
          // than one it could target (CR 707.10e).
          // Beamsplitter Mage: one copy, aimed at the creature its controller chooses among them (rulings).
          if (e.eachOther!.toCreated || e.eachOther!.chooseOne) sc.copies = { of: id!, left: 1, each, by, ...(each.length > 1 ? { pickOne: true as const } : {}), ...(extra ? { extra } : {}) };
          else sc.copies = { of: id!, left: each.length, each, by, ...(extra ? { extra } : {}) };
        } else {
        const n =
          e.n === "storm"
            ? (orig.castNth ?? 0)
            : e.n === "stormInstantSorcery"
              ? (s.castThisTurn ?? []).slice(0, orig.castNth ?? 0).filter((c) => c.player === orig.controller && s.cards[c.card] && (isType(s.cards[c.card]!, "Instant") || isType(s.cards[c.card]!, "Sorcery"))).length
              : e.n === "otherInstantSorcery"
              ? (s.castThisTurn ?? []).filter((c, i) => i !== orig.castNth && c.player === orig.controller && s.cards[c.card] && (isType(s.cards[c.card]!, "Instant") || isType(s.cards[c.card]!, "Sorcery"))).length
              : e.n === "kicked"
                ? (orig.kicked?.length ?? 0)
                : amountNow(s, e.n, ctx);
        if (n <= 0) return;
        // Twinning Staff: one more for each of them the player copying it controls (CR 614.1a; rulings), whose targets may
        // always be chosen anew. Only for spells: copying a card or an ability isn't copying a spell.
        // Bonus Round: "that player copies it", the spell's controller (rulings), who chooses the copy's new targets.
        const by = e.byController && orig.kind === "spell" ? orig.controller : undefined;
        const extra = orig.kind === "spell" ? extraSpellCopies(s, by ?? ctx.controller) : 0;
        sc.copies = { of: id!, left: n, ...(extra ? { extra } : {}), ...(by !== undefined ? { by } : {}) };
        }
      }
      const c = sc.copies;
      // As it is now, or as it was cast if it has left the stack.
      const countered = r.counteredCopy?.item.id === c.of ? r.counteredCopy : undefined;
      const orig = countered?.item ?? s.stack.find((x) => x.id === c.of) ?? s.castItems?.[c.of] ?? s.epics?.[c.of] ?? (r.item.id === c.of ? r.item : undefined);
      const specs = orig?.body?.targets ?? [];
      // Ob Nixilis, the Adversary: "The copy isn't legendary and has starting loyalty X" (CR 707.9b), X from its casualty.
      const except = e.casualtyLoyalty && orig?.casualtyX !== undefined ? { ...e.except, loyalty: orig.casualtyX } : e.except;
      while (orig && c.left > 0) {
        if (e.newTargets && specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: c.by ?? ctx.controller, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.left };
          return "paused";
        }
        // The copies' controller chooses the order they go on the stack (rulings on Zada, Ink-Treader Nephilim and
        // Precursor Golem): which creature the next copy targets. Copies put on the stack later resolve first.
        if (c.each && c.pickOne && !c.picked) {
          const names = c.each.map((id) => characteristics(s, obj(s, id)).name);
          const labels = names.map((n, i) => (names.filter((x) => x === n).length > 1 ? `${n} ${names.slice(0, i + 1).filter((x) => x === n).length}` : n));
          s.pending = { kind: "chooseOption", player: c.by ?? ctx.controller, source: src, what: "copyOrder", options: [...c.each], labels, prompt: `choose the ${e.n === "eachOther" && e.eachOther?.chooseOne ? "creature" : "token"} the copy of ${orig.description} targets` };
          return "paused";
        }
        if (c.each && c.left > 1 && !c.picked) {
          const rest = c.each.slice(c.each.length - c.left);
          s.pending = { kind: "chooseOption", player: c.by ?? ctx.controller, source: src, what: "copyOrder", options: rest, labels: rest.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, controllerOf(s, obj(s, id))).name})`), prompt: `choose the creature the next copy of ${orig.description} targets (copies put on the stack later resolve first)` };
          return "paused";
        }
        c.picked = undefined;
        // "Each copy targets a different one of those creatures": that one in each target the spell has.
        const one = c.each?.[c.each.length - c.left];
        const aimed = one !== undefined ? (orig.targets ?? []).map((t): TargetChoice => (t.kind === "object" ? { kind: "object", id: one } : t)) : undefined;
        if (orig.kind === "ability") putAbilityCopy(s, orig, ctx.controller, c.targets ?? orig.targets);
        else {
          putSpellCopy(s, orig, c.by ?? ctx.controller, aimed ?? c.targets ?? orig.targets, e.gains && { mods: e.gains, source: src }, except, countered?.card);
          if (e.thoseGain) thoseGain(s, e.thoseGain, s.stack[s.stack.length - 1]!, ctx.controller, src);
        }
        c.targets = undefined;
        c.left--;
      }
      // Twinning Staff's additional copies, after the others (its controller chooses where they go, rulings).
      while (orig && c.left === 0 && c.extra) {
        if (specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: c.by ?? ctx.controller, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.extra };
          return "paused";
        }
        putSpellCopy(s, orig, c.by ?? ctx.controller, c.targets ?? orig.targets, e.gains && { mods: e.gains, source: src }, except, countered?.card);
        c.targets = undefined;
        c.extra--;
      }
      // Spinerock Tyrant: "those spells gain wither": the original too, if it's still that spell on the stack (CR 400.7).
      if (orig && e.thoseGain && !c.gained) {
        const there = s.stack.find((x) => x.id === orig.id);
        if (there) thoseGain(s, e.thoseGain, there, ctx.controller, src);
        c.gained = true;
      }
      if (orig && e.demonstrate && !c.oppDone) {
        // Demonstrate (CR 702.144a): you copied it, so choose an opponent, who copies it too; their copy goes on the
        // stack above yours, and they choose its new targets knowing the others (rulings). Their Twinning Staffs give
        // them more copies (CR 614.1a).
        if (c.opp === undefined) {
          const opps = opponents(s, ctx.controller);
          if (!opps.length) return;
          if (opps.length > 1) {
            s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "demonstrate", options: opps.map(String), labels: opps.map((pid) => player(s, pid).name), prompt: `demonstrate: choose an opponent to also copy ${src}` };
            return "paused";
          }
          c.opp = opps[0]!;
        }
        c.oppLeft ??= 1 + extraSpellCopies(s, c.opp);
        while (c.oppLeft > 0) {
          if (e.newTargets && specs.length && c.targets === undefined) {
            s.pending = { kind: "copyTargets", player: c.opp, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.oppLeft };
            return "paused";
          }
          putSpellCopy(s, orig, c.opp, c.targets ?? orig.targets);
          c.targets = undefined;
          c.oppLeft--;
        }
        c.oppDone = true;
      }
      return;
    }
    case "nextSpellImprovise":
      if (e.convoke) player(s, ctx.controller).nextSpellConvoke = s.turn;
      else player(s, ctx.controller).nextSpellImprovise = s.turn;
      log(s, `${src}: the next spell ${player(s, ctx.controller).name} casts this turn has ${e.convoke ? "convoke" : "improvise"}.`);
      return;
    case "nextCast": {
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      // "Of the chosen type": the source's; with none chosen, it does nothing (rulings on Progenitor's Icon).
      const filter = e.filter.chosen ? bindChosen(e.filter, o?.chosen) : e.filter;
      if (filter.chosen) {
        log(s, `${src}: no type was chosen, so it does nothing.`);
        return;
      }
      if (e.flash) log(s, `${src}: ${player(s, ctx.controller).name} may cast ${e.text.replace(/^the next (.+?) you cast this turn can be cast .*$/, (_, w: string) => (w === "spell of the chosen type" ? `their next ${filter.subtypes?.join(" ") ?? ""} spell` : `their next ${w}`))} this turn as though it had flash.`);
      if (e.alt) log(s, `${src}: ${player(s, ctx.controller).name} may cast their next ${filter.text.replace(/^target /, "")} this turn ${e.alt === "free" ? "without paying its mana cost" : "for life equal to its mana value"}.`);
      if (e.counter) log(s, `${src}: the next ${filter.text.replace(/^target /, "")} ${player(s, ctx.controller).name} casts this turn enters with an additional ${e.counter} counter.`);
      for (const caster of e.who ? players(s, e.who, ctx) : [ctx.controller])
        (s.nextCast ??= []).push({
          controller: caster,
          filter,
          sourceId: id ?? "",
          sourceCardId: o ? cardIdOf(o) : ctx.sourceDef.oracleId,
          body: { targets: e.targets ?? [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." },
          turn: s.turn,
          ...(e.cascade ? { cascade: true as const } : {}),
          ...(e.onlyOpponentOrTheirs ? { onlyOpponentOrTheirs: true as const } : {}),
          ...(e.allTurn ? { allTurn: true as const } : {}),
          ...(e.storm ? { storm: true as const } : {}),
          ...(e.uncounterable ? { uncounterable: true as const } : {}),
          ...(e.fromHand ? { fromHand: true as const } : {}),
          ...(e.flash ? { flash: true as const } : {}),
          ...(e.toHand ? { toHand: true as const } : {}),
          ...(e.counter ? { counter: e.counter } : {}),
          ...(e.alt ? { alt: e.alt } : {}),
          ...(e.loyalty ? { loyalty: e.loyalty } : {}),
          ...(e.exhaust ? { exhaust: true as const } : {}),
          ...(ctx.x ? { x: ctx.x } : {}),
          // Loki Laufeyson: its power as each spell is cast, the source as the object that activated it (round B202), even if
          // it left the battlefield before this resolved.
          ...(e.mvMaxSourcePower && o ? { mvMaxPowerOf: { id: o.id, zc: item?.kind !== "spell" && ctx.sourceZc !== undefined ? ctx.sourceZc : (o.zoneChanges ?? 0) } } : {}),
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
      const abouts = e.aboutGroup ? objects(s, { ref: "eventGroup" }, ctx).filter((x) => x.zone === "battlefield") : e.aboutCreated ? objects(s, { ref: "created" }, ctx).filter((x) => x.zone === "battlefield") : e.about !== undefined ? objects(s, { ref: "target", index: e.about, ...(e.each ? { n: e.each } : {}) }, ctx).filter((x) => x.zone === "battlefield") : [undefined];
      if (!abouts.length) return;
      const toPlayer = e.aboutPlayer !== undefined ? players(s, { ref: "target", index: e.aboutPlayer }, ctx)[0] : undefined;
      if (e.aboutPlayer !== undefined && toPlayer === undefined) return;
      const forPlayer = e.forPlayer ? players(s, e.forPlayer, ctx)[0] : undefined;
      if (e.forPlayer && forPlayer === undefined) return;
      for (const about of e.each || e.aboutGroup ? abouts : abouts.slice(0, 1)) {
        (s.floatingTriggers ??= []).push({
          ...(about ? { about: { id: about.id, zc: about.zoneChanges ?? 0 } } : {}),
          ...(toPlayer !== undefined ? { toPlayer } : {}),
          ...(forPlayer !== undefined ? { forPlayer } : {}),
          id: `f${s.nextId++}`,
          controller: ctx.controller,
          sourceId: id,
          sourceCardId: cardIdOf(o),
          sourceZc: spell ? (o.zoneChanges ?? 0) : (ctx.sourceZc ?? o.zoneChanges ?? 0),
          ...(spell || item?.fromSpell ? { fromSpell: true as const } : {}),
          // The Clone Saga: "a creature with the chosen name" is the name chosen as this resolved, kept with the delayed
          // trigger (its source may be gone by the time it triggers).
          // Zombie Boa: "a creature of that color", the color chosen as this resolved, likewise.
          trigger: e.bound ? bindMilledCounts(s, ctx.chosen?.name !== undefined || ctx.chosen?.color !== undefined || ctx.chosen?.planeswalkerType !== undefined ? bindChosenName(e.trigger, ctx.chosen) : e.trigger, ctx) : ctx.chosen?.name !== undefined || ctx.chosen?.color !== undefined || ctx.chosen?.planeswalkerType !== undefined ? bindChosenName(e.trigger, ctx.chosen) : e.trigger,
          until: e.until,
          turn: s.turn,
          ...(e.once ? { once: true as const } : {}),
        });
      }
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
          closeZoneBatch(s); // one at a time: each exile is an event of its own (rulings on Laelia)
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          // Jodah, the Unifier: the same, but only a legendary card stops it.
          if (!isType(d, "Land") && defMv(d) < limit && (!e.legendary || d.supertypes.includes("Legendary"))) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        log(s, `${src} cascades: ${p.name} exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, hitting ${defOf(s, obj(s, hit)).name}` : ", finding nothing to cast"}.`);
      }
      // Averna, the Chaos Bloom: "As you cascade, you may put a land card from among the exiled cards onto the battlefield
      // tapped": after the last card is exiled, before the nonland card is cast or not (its reminder text, rulings), one
      // land for each such ability its controller has. Not playing a land (rulings). Jodah's isn't cascade.
      if (!e.legendary && !sc.cascade.landsDone) {
        const n = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === p.id && !!abilitiesOf(s, obj(s, id)).cascadeLand).length;
        const lands = sc.cascade.exiled.filter((id) => s.objects[id]?.zone === "exile" && isType(defOf(s, obj(s, id)), "Land"));
        if (n && lands.length && !sc.found) {
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what: n === 1 ? "a land card" : `up to ${n} land cards`, cards: lands, min: 0, max: Math.min(n, lands.length), exiled: true, dig: { looked: sc.cascade.exiled.filter((id) => s.objects[id]?.zone === "exile"), to: "to put onto the battlefield tapped", rest: "stay in exile for now" } };
          return "paused";
        }
        const put = (sc.found ?? []).filter((id) => lands.includes(id));
        sc.found = undefined;
        sc.cascade.landsDone = true;
        if (put.length) {
          enterTogether(s, () => put.forEach((id) => moveObject(s, id, "battlefield", { controller: p.id, tapped: true })));
          log(s, `${p.name} puts ${put.map((id) => defOf(s, obj(s, id)).name).join(", ")} onto the battlefield tapped.`);
        }
      }
      const hit = sc.cascade.hit;
      if (hit && !sc.cascade.castAsked) {
        sc.cascade.castAsked = true;
        // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
        if (s.objects[hit]?.zone === "exile") {
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src };
          if (freeCastable(s, p.id, hit)) return "paused";
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
          const milled = p.library.slice(0, millCount(s, p.id, n));
          for (const id of milled) moveObject(s, id, "graveyard", { milled: true });
          log(s, `${n} is chosen at random: ${p.name} mills ${milled.length} card${milled.length === 1 ? "" : "s"}.`);
        }
        // "With a different name than that spell": the countered spell's name (CR 201.2).
        const other = e.notNamedAs !== undefined ? spellNameOf(s, ctx, e.notNamedAs) : undefined;
        // Treasure Keeper: "a nonland card with mana value 3 or less", an {X} in its cost counting 0 there (CR 202.3e).
        // Plargg: "a nonlegendary, nonland card"; Illuna: "a nonland permanent card" (not an artifact land).
        // Codie, Vociferous Codex: less than the mana value of the spell that triggered it (none found without one).
        const causeSpell = e.lesserThanCause && ctx.cause !== undefined ? (s.stack.find((x) => x.id === ctx.cause && x.kind === "spell") ?? s.castItems?.[ctx.cause]) : undefined;
        const lessThan = e.lesserThanCause ? (causeSpell ? spellManaValue(s, causeSpell) : 0) : undefined;
        const fits = (id: ObjectId) =>
          (lessThan === undefined || defMv(defOf(s, obj(s, id))) < lessThan) &&
          (e.untilTypes ? e.untilTypes.some((t) => isType(defOf(s, obj(s, id)), t)) && !(e.untilNonlandType && isType(defOf(s, obj(s, id)), "Land")) : !isType(defOf(s, obj(s, id)), "Land")) &&
          (e.untilMv === undefined || defMv(defOf(s, obj(s, id))) <= e.untilMv) &&
          (e.untilMvAtLeast === undefined || defMv(defOf(s, obj(s, id))) >= e.untilMvAtLeast) &&
          !(e.untilNonlegendary && defOf(s, obj(s, id)).supertypes?.includes("Legendary"));
        // Demonlord Belzenlok: "exile cards ... until you exile a nonland card, then put that card into your hand. If the
        // card's mana value is 4 or greater, repeat this process." Exiled one at a time (rulings on Laelia); the land cards
        // stay exiled; it goes on until a nonland card with a lesser mana value, or no nonland card (rulings).
        if (e.then === "hitToHand") {
          let toHand = 0;
          for (;;) {
            const at = p.library.findIndex(fits);
            const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
            const hit = at < 0 ? undefined : p.library[at];
            for (const id of seen) {
              moveObject(s, id, "exile");
              closeZoneBatch(s);
            }
            log(s, `${p.name} exiles ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")})` : ""}${hit ? "" : ", finding no nonland card"}.`);
            if (!hit || s.objects[hit]?.zone !== "exile") break;
            const mv = defMv(defOf(s, obj(s, hit)));
            moveObject(s, hit, "hand");
            if (obj(s, hit).zone === "hand") toHand++;
            log(s, `${p.name} puts ${defOf(s, obj(s, hit)).name} into their hand.`);
            if (e.repeatMvAtLeast === undefined || mv < e.repeatMvAtLeast) break;
          }
          s.resolving!.dugToHand = toHand;
          return;
        }
        const at = p.library.findIndex((id) => fits(id) && (other === undefined || !sameName(defOf(s, obj(s, id)).name, other)));
        // No nonland card: every card is revealed or exiled (rulings on Stolen Goods and Treasure Hunt).
        const seen = p.library.slice(0, at < 0 ? p.library.length : at + 1);
        const hit = at < 0 ? undefined : p.library[at];
        const names = seen.map((id) => defOf(s, obj(s, id)).name).join(", ");
        log(s, `${p.name} ${e.reveal ? "reveals" : "exiles"} ${seen.length} card${seen.length === 1 ? "" : "s"} from the top of their library${seen.length ? ` (${names})` : ""}${hit ? "" : `, finding no ${e.untilTypes ? "instant or sorcery" : "nonland"} card${e.untilMv !== undefined ? ` with mana value ${e.untilMv} or less` : ""}${e.untilMvAtLeast !== undefined ? ` with mana value ${e.untilMvAtLeast} or greater` : ""}`}.`);
        if (e.then === "hand") {
          for (const id of seen) moveObject(s, id, "hand");
          return;
        }
        // Calibrated Blast: all of them to the bottom in a random order, the nonland card's mana value noted for the
        // reflexive trigger (none if there was no nonland card); it's there with the others (rulings).
        if (e.then === "bottomRandom") {
          if (hit) s.resolving!.revealedUntilMv = defMv(defOf(s, obj(s, hit)));
          else delete s.resolving!.revealedUntilMv;
          const all = [...seen];
          shuffle(s, all);
          for (const id of all) moveObject(s, id, "library");
          return;
        }
        // Erratic Explosion: they stay in the library for now; "that card" is the nonland card (none if every card was a
        // land: its mana value counts as 0, rulings).
        if (e.then === "keep") {
          // Undying Flames: exiled, not revealed, one at a time (rulings on Laelia); "that card" is the one in exile.
          if (!e.reveal)
            for (const id of seen) {
              moveObject(s, id, "exile");
              closeZoneBatch(s);
            }
          s.resolving!.revealed = hit ? { id: hit, zc: obj(s, hit).zoneChanges ?? 0 } : undefined;
          s.resolving!.revealedUntil = seen;
          return;
        }
        if (e.reveal && e.inPlace) {
          // Treasure Keeper: they stay in the library, revealed, while the found card may be cast from there.
        } else if (e.reveal) {
          // "Exile that card and put the rest on the bottom of your library in a random order" (Creative Technique).
          if (hit) moveObject(s, hit, "exile");
          const rest = seen.filter((id) => id !== hit);
          shuffle(s, rest);
          for (const id of rest) moveObject(s, id, "library");
        } else
          for (const id of seen) {
            moveObject(s, id, "exile");
            closeZoneBatch(s); // exiled one at a time (rulings on Laelia)
          }
        const caster = e.ownerCasts ? pid : ctx.controller;
        sc.untilNonland = { ...(hit ? { hit } : {}), caster, ...(e.restBottom || e.inPlace ? { seen } : {}) };
        if (!hit) return e.restStays ? undefined : e.inPlace ? revealedToBottom(s, seen) : bottomRest(s, sc.untilNonland.seen);
        if (e.then === "suspend") {
          suspendExiled(s, obj(s, hit), e.suspend ?? 0);
          return;
        }
        if (e.then === "battlefieldOrHand") {
          // Illuna: chosen after seeing the card (rulings); a permanent card only, so either can be done.
          const name = defOf(s, obj(s, hit)).name;
          s.pending = { kind: "chooseOption", player: ctx.controller, source: src, what: "either", options: ["0", "1"], labels: [`Put ${name} onto the battlefield`, `Put ${name} into your hand`], prompt: "choose one" };
          return "paused";
        }
        if (e.then !== "castFree") {
          // "Until end of turn, you may cast that card (without paying its mana cost)": with its usual timing (rulings).
          const o = obj(s, hit);
          o.mayPlay = { player: caster, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true, ...(e.then === "freeThisTurn" ? { free: true as const } : {}) };
          // Codie: "Put each other card exiled this way on the bottom of your library in a random order": not that one.
          if (e.restBottom) bottomRest(s, (sc.untilNonland.seen ?? []).filter((id) => id !== hit));
          return;
        }
        // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
        // Solstice Revelations: "less than the number of Mountains you control", counted now.
        const maxMv = e.mvLessThan !== undefined ? amountNow(s, e.mvLessThan, ctx) - 1 : e.maxMv;
        // The Infamous Cruelclaw: "You may cast that card by discarding a card rather than paying its mana cost", that
        // alternative cost instead (CR 118.9); Jadzi's "by paying {1}" is mana, paid as it's cast.
        const pay = e.pay;
        s.pending = { kind: "castFree", player: caster, objectId: hit, source: src, ...(maxMv !== undefined ? { mv: { max: maxMv } } : {}), ...(pay ? { pay } : {}), ...(pay?.kind === "mana" ? { how: "paid" as const } : {}) };
        if (maxMv === undefined || maxMv >= 0) if (freeCastable(s, caster, hit, pay?.kind === "mana")) return "paused";
        s.pending = null;
        log(s, `${defOf(s, obj(s, hit)).name} can't be cast${maxMv !== undefined ? ` (mana value ${maxMv < 0 ? "less than 0" : `${maxMv} or less`})` : ""}.`);
      }
      if (e.then === "battlefieldOrHand") {
        const hit = sc.untilNonland.hit;
        if (!hit || s.objects[hit]?.zone !== "exile") return;
        const name = defOf(s, obj(s, hit)).name;
        if (sc.either === 0) moveObject(s, hit, "battlefield", { controller: ctx.controller });
        else moveObject(s, hit, "hand");
        log(s, `${player(s, ctx.controller).name} puts ${name} ${sc.either === 0 ? "onto the battlefield" : "into their hand"}.`);
        return;
      }
      // Strago and Relm: the card cast this way, still that spell on the stack (CR 400.7), if it's a creature spell as cast
      // (a modal double-faced card's face, CR 712.11), gains these for as long as the permanent it becomes stays (CR 400.7a).
      const castHit = sc.untilNonland.hit ? s.objects[sc.untilNonland.hit] : undefined;
      if (e.creatureSpellGains && castHit?.zone === "stack" && objIsType(s, castHit, "Creature")) {
        (castHit.spellGains ??= []).push({ mods: e.creatureSpellGains.mods, timestamp: s.nextTimestamp++, controller: ctx.controller, source: src, forever: true });
        invalidateCharacteristics(s);
        log(s, `${defOf(s, castHit).name} gains ${e.creatureSpellGains.text}.`);
      }
      // "If you don't, put that card into your hand": its owner's, from exile (Breaching Dragonstorm).
      const left = sc.untilNonland.hit;
      if (e.orHand && left && s.objects[left]?.zone === "exile") {
        moveObject(s, left, "hand");
        log(s, `${player(s, obj(s, left).owner).name} puts ${defOf(s, obj(s, left)).name} into their hand.`);
      }
      // Spellshift: the revealed cards stay in the library for the shuffle that follows.
      if (e.restStays) return;
      return e.inPlace ? revealedToBottom(s, sc.untilNonland.seen ?? []) : bottomRest(s, sc.untilNonland.seen);
    }
    case "discover": {
      // CR 701.57a: the mana value of the spell it would be is checked too (701.57a), the card's own for the cards we have.
      const who = e.who ? players(s, e.who, ctx)[0] : ctx.controller;
      if (who === undefined) return;
      const p = player(s, who);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.cascade) {
        const n = amountNow(s, e.n, ctx);
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          closeZoneBatch(s); // one at a time: each exile is an event of its own (rulings on Laelia)
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && defMv(d) <= n) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}), n };
        // The discovered card (CR 701.57c), cast or not: "the discovered card's mana value" (Hit the Mother Lode).
        if (hit) s.resolving!.discovered = { id: hit, mv: defMv(defOf(s, obj(s, hit))) };
        log(s, `${p.name} discovers ${n}: exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, finding ${defOf(s, obj(s, hit)).name}` : ", finding nothing"}.`);
        if (hit) {
          // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src, how: "discover" };
          if (freeCastable(s, p.id, hit)) return "paused";
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
      // "Whenever you discover" (Curator of Sun's Creation): once the whole process is done, even if parts of it were
      // impossible (rulings), with its value.
      fireEvent(s, { type: "discovered", player: p.id, amount: sc.cascade.n ?? 0 });
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
        if (freeCastable(s, p.id, id)) return "paused";
        s.pending = null;
        log(s, `${defOf(s, obj(s, id)).name} can't be cast.`);
      }
      const rest = sc.ripple.revealed.filter((id) => s.objects[id]?.zone === "library");
      return toBottom(s, p.id, rest, src, false);
    }
    case "counterUnlessPays": {
      // Ward (CR 702.21a) and "counter it unless that player pays": the spell or ability that triggered this.
      return counterOnStack(s, ctx, ctx.cause, e.ward ? `${src}'s ward` : src, e.unless) ?? offerGuileCasts(s, src);
    }
    case "counterCause":
      return counterOnStack(s, ctx, ctx.cause, src) ?? offerGuileCasts(s, src);
    case "causeToBottom":
      return counterOnStack(s, ctx, ctx.cause, src, undefined, "libraryBottom", true);
    case "changeTarget": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      // Meddle, Quicksilver Dragon: only a spell with one target now (the same thing targeted twice is two, rulings on
      // Deflection), and that target a creature on the battlefield / ~ itself, still the same object (CR 400.7).
      if (e.ifOnly) {
        const item = s.stack.find((x) => x.id === t.id);
        const chosen = (item?.targets ?? []).filter((x) => x.kind !== "none");
        const only = chosen.length === 1 && chosen[0]!.kind === "object" ? chosen[0] : undefined;
        const o = only?.kind === "object" ? s.objects[only.id] : undefined;
        const same = !!o && o.zone === "battlefield" && (only!.kind !== "object" || only!.zc === undefined || (o.zoneChanges ?? 0) === only!.zc);
        const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
        const fits = same && (e.ifOnly === "creature" ? objIsType(s, o!, "Creature") : !!me && me.id === o!.id && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc));
        if (!fits) {
          log(s, `${item?.description ?? "That spell"} doesn't have only one target that is ${e.ifOnly === "creature" ? "a creature" : src}, so ${src} does nothing.`);
          return;
        }
      }
      return e.anyOne ? changeATargetToSelf(s, ctx, t.id, src) : changeTarget(s, ctx, t.id, src, e.unless, e.toSelf, e.all, e.mustBe);
    }
    case "controlSpell": {
      const t = ctx.targets[e.index];
      const item = t?.kind === "stack" && ctx.legal[e.index] ? s.stack.find((x) => x.id === t.id) : undefined;
      if (!item || item.controller === ctx.controller) return;
      item.controller = ctx.controller;
      item.controlTaken = true;
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (o) o.controller = ctx.controller;
      invalidateCharacteristics(s);
      log(s, `${player(s, ctx.controller).name} gains control of ${item.description} (${src}).`);
      return;
    }
    case "newTargets": {
      // Speedball, New Warrior: the spell whose casting triggered this, if it's still on the stack.
      if (e.cause) return ctx.cause && s.stack.some((x) => x.id === ctx.cause) ? newTargets(s, ctx, ctx.cause, src) : undefined;
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      return newTargets(s, ctx, t.id, src, e.allOrNone, e.changeAny);
    }
    case "counterEach": {
      // Each spell on the stack it matches as it resolves, one at a time (CR 701.6a); this spell itself is excluded
      // since it isn't one it can counter (CR 608.2: it's resolving).
      // Guile: once through them, only the casts are left (a spell cast that way isn't countered too).
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.guileLoop)
        for (const item of [...s.stack]) {
          if (item.kind !== "spell" || item.id === s.resolving?.item.id || !isLegalTarget(s, e.filter, { kind: "stack", id: item.id }, ctx.controller)) continue;
          counterOnStack(s, ctx, item.id, src);
        }
      sc.guileLoop = true;
      if (offerGuileCasts(s, src)) return "paused";
      sc.guileLoop = undefined;
      return;
    }
    case "dismissStack": {
      // Summary Dismissal: from the top down, all at once as far as anyone can tell (nothing can happen in between).
      for (const item of [...s.stack].reverse()) {
        if (item.id === s.resolving?.item.id) continue;
        if (item.kind === "spell") counterOnStack(s, ctx, item.id, src, undefined, "exile", true);
        else counterOnStack(s, ctx, item.id, src);
      }
      return;
    }
    case "counterOpponentsStack": {
      // Glen Elendra's Answer: each spell and ability an opponent controls, from the top down; one that can't be countered
      // stays and isn't counted (CR 101.2), and only those really countered count for its tokens.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.guileLoop)
        for (const item of [...s.stack].reverse()) {
          if (item.id === s.resolving?.item.id || item.controller === ctx.controller || !s.stack.includes(item)) continue;
          if (e.abilitiesOnly && item.kind === "spell") continue;
          counterOnStack(s, ctx, item.id, src);
        }
      sc.guileLoop = true;
      if (offerGuileCasts(s, src)) return "paused";
      sc.guileLoop = undefined;
      return;
    }
    case "counterOpponentsStackUnless": {
      // Whirlwind Denial: the opponents in turn order from the one whose turn it is (from the next one after you on your
      // turn), each asked about each of theirs from the top of the stack down, paying as they choose; then those not paid
      // for are countered, all at the same time (rulings). One that has left the stack meanwhile isn't asked about.
      const sc = (s.resolving!.scratch ??= {});
      // Guile: the counters are done, only the casts are left.
      if (sc.guileLoop) {
        if (offerGuileCasts(s, src)) return "paused";
        sc.guileLoop = undefined;
        return;
      }
      if (!sc.denial) {
        const order = s.turnOrder;
        const start = order.indexOf(s.activePlayer);
        const opps = order.map((_, k) => order[(start + k) % order.length]!).filter((p) => p !== ctx.controller && !player(s, p).lost);
        const items = [...s.stack].reverse().filter((x) => x.id !== s.resolving?.item.id);
        sc.denial = { queue: opps.flatMap((p) => items.filter((x) => x.controller === p).map((x) => x.id)), unpaid: [] };
        sc.paid = undefined;
      }
      const st = sc.denial;
      while (st.queue.length) {
        const item = s.stack.find((x) => x.id === st.queue[0]);
        if (!item) {
          st.queue.shift();
          continue;
        }
        const paid = paidUnless(s, ctx, item.controller, e.unless, src, item.description);
        if (paid === "paused") return paid;
        sc.paid = undefined;
        st.queue.shift();
        if (paid) log(s, `${player(s, item.controller).name} pays for ${item.description}.`);
        else st.unpaid.push(item.id);
      }
      sc.denial = undefined;
      for (const id of st.unpaid) if (s.stack.some((x) => x.id === id)) counterOnStack(s, ctx, id, src);
      sc.guileLoop = true;
      if (offerGuileCasts(s, src)) return "paused";
      sc.guileLoop = undefined;
      return;
    }
    case "bounceEachUnless": {
      // Cut the Tethers: each of them, its owner asked (rulings on such "for each" punishers: APNAP order, CR 101.4), each
      // owner about each of theirs; then the ones not paid for return to their owners' hands at the same time. One that
      // has left the battlefield meanwhile isn't asked about.
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.tethers) {
        const order = s.turnOrder;
        const start = order.indexOf(s.activePlayer);
        const apnap = order.map((_, k) => order[(start + k) % order.length]!).filter((p) => !player(s, p).lost);
        const hit = s.battlefield.filter((id) => objectMatches(s, e.filter, obj(s, id), ctx.controller, false));
        sc.tethers = { queue: apnap.flatMap((p) => hit.filter((id) => obj(s, id).owner === p).map((id) => ({ id, zc: obj(s, id).zoneChanges ?? 0 }))), unpaid: [] };
        sc.paid = undefined;
      }
      const st = sc.tethers;
      while (st.queue.length) {
        const { id, zc } = st.queue[0]!;
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || (o.zoneChanges ?? 0) !== zc) {
          st.queue.shift();
          continue;
        }
        const paid = paidUnless(s, ctx, o.owner, e.unless, src, `${defOf(s, o).name} (or it returns to your hand)`);
        if (paid === "paused") return paid;
        sc.paid = undefined;
        st.queue.shift();
        if (paid) log(s, `${player(s, o.owner).name} pays for ${defOf(s, o).name}.`);
        else st.unpaid.push({ id, zc });
      }
      sc.tethers = undefined;
      for (const { id, zc } of st.unpaid) {
        const o = s.objects[id];
        if (o?.zone !== "battlefield" || (o.zoneChanges ?? 0) !== zc) continue;
        log(s, `${defOf(s, o).name} returns to ${player(s, o.owner).name}'s hand.`);
        moveObject(s, id, "hand");
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
      // Sunburst works as it enters from the stack (CR 702.44a): one more instance for each time it's gained.
      const sunburst = e.mods.some((x) => x.kind === "addKeywords" && x.keywords.includes("Sunburst"));
      if (sunburst) {
        o.sunburstGained = (o.sunburstGained ?? 0) + 1;
        log(s, `${defOf(s, o).name} gains sunburst.`);
      }
      // Bloodthirst likewise as it enters (Bloodlord of Vaasgoth, CR 702.54a, 614.12).
      for (const x of e.mods) {
        if (x.kind !== "addKeywords") continue;
        for (const k of x.keywords) {
          const bt = /^Bloodthirst (\d+)$/.exec(k);
          if (!bt) continue;
          o.bloodthirstGained = (o.bloodthirstGained ?? 0) + Number(bt[1]);
          log(s, `${defOf(s, o).name} gains bloodthirst ${bt[1]}.`);
        }
      }
      const stackOnly = (k: string) => k === "Rebound" || k === "Sunburst" || /^Bloodthirst \d+$/.test(k);
      const mods = e.mods.flatMap((x): Modification[] => (x.kind !== "addKeywords" ? [x] : x.keywords.some((k) => !stackOnly(k)) ? [{ ...x, keywords: x.keywords.filter((k) => !stackOnly(k)) }] : []));
      if (mods.length) (o.spellGains ??= []).push({ mods, timestamp: s.nextTimestamp++, controller: ctx.controller, source: src, ...(e.forever ? { forever: true as const } : {}), ...(e.whileSpell ? { whileSpell: true as const } : {}), ...(e.until ? { until: e.until } : {}) });
      return;
    }
    case "exileAsResolves": {
      // The spell that triggered this, while it's still that spell on the stack (CR 400.7); a copy isn't a card and never
      // goes to a graveyard (CR 707.10a), so it isn't exiled. One its controller doesn't own isn't going to your graveyard
      // (rulings on Feather, the Redeemed).
      const item = ctx.cause ? s.stack.find((x) => x.id === ctx.cause) : undefined;
      const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      if (!o || o.zone !== "stack" || o.spellCopy || o.isToken) return;
      if (!e.anyGraveyard && o.owner !== ctx.controller) return;
      const link = e.linked && ctx.sourceId ? `${ctx.sourceId}@${ctx.sourceZc ?? 0}` : undefined;
      (o.exileAsResolves ??= []).push({ by: ctx.controller, zc: o.zoneChanges ?? 0, src, ...(e.then ? { then: e.then } : {}), ...(e.suspend ? { suspend: e.suspend } : {}), ...(link ? { link } : {}), ...(e.anyGraveyard ? { anyGraveyard: true as const } : {}), ...(e.counters ? { counters: e.counters } : {}) });
      return;
    }
    case "spellUncounterable": {
      // Vexing Shusher: the targeted spell, if it's still a legal target (CR 608.2b).
      const t = ctx.targets[e.index];
      const item = ctx.legal[e.index] && t?.kind === "stack" ? s.stack.find((x) => x.id === t.id) : undefined;
      if (!item) return;
      item.uncounterable = true;
      log(s, `${src}: ${item.kind === "spell" && item.objectId ? defOf(s, obj(s, item.objectId)).name : "that spell"} can't be countered.`);
      return;
    }
    case "counterSpell": {
      // The spell itself, if it's still on the stack (CR 701.6a).
      // "Return that spell to its owner's hand" (Krark): not a counter (CR 701.6a), so even one that can't be countered.
      // Taigam: "exile the spell you cast with four time counters on it ... it gains suspend": not a counter either; the card
      // (a copy has ceased to exist, CR 707.10a) suspended in exile.
      if (e.cause && e.exileSpell) {
        const item = ctx.cause ? s.stack.find((x) => x.id === ctx.cause) : undefined;
        if (!item) return;
        const o = item.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        counterOnStack(s, ctx, item.id, src, undefined, "exile", true);
        if (e.suspend && o && s.objects[o.id] === o && o.zone === "exile" && !o.isToken && !s.stack.some((x) => x.id === item.id)) suspendExiled(s, o, e.suspend);
        return;
      }
      if (e.cause) return (ctx.cause && s.stack.some((x) => x.id === ctx.cause) ? counterOnStack(s, ctx, ctx.cause, src, undefined, e.bounce ? "hand" : undefined, e.bounce) : undefined) ?? offerGuileCasts(s, src);
      // "Exile any number of target spells" (Mindbreak Trap): each target still legal.
      if (e.exileSpell) {
        for (let k = e.index; k < e.index + (e.n ?? 1); k++) {
          const t = ctx.targets[k];
          if (!ctx.legal[k] || t?.kind !== "stack") continue;
          const item = s.stack.find((x) => x.id === t.id);
          const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
          counterOnStack(s, ctx, t.id, src, undefined, "exile", true);
          // Smirking Spelljacker: the card, still that object in exile, linked to this permanent (CR 607.2a, 400.7); a copy
          // of a spell ceases to exist (CR 707.10a), so nothing is.
          if (e.linked && o && s.objects[o.id] === o && o.zone === "exile" && !o.isToken && ctx.sourceId) ((s.linkedExile ??= {})[`${ctx.sourceId}@${ctx.sourceZc ?? 0}`] ??= []).push({ id: o.id, zc: o.zoneChanges ?? 0 });
          // It becomes plotted (CR 702.170c-d): its owner may cast it on a later turn, if it's still that card in exile.
          if (e.plot && o && s.objects[o.id] === o && o.zone === "exile") {
            o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "plot", turn: s.turn };
            log(s, `${defOf(s, o).name} becomes plotted: ${player(s, o.owner).name} may cast it without paying its mana cost on a later turn.`);
            fireEvent(s, { type: "plotted", id: o.id });
          }
          if (e.ownerMayCost && o && s.objects[o.id] === o && o.zone === "exile" && !o.isToken) o.mayPlay = { player: o.owner, zc: o.zoneChanges ?? 0, until: "exiled", turn: s.turn, castOnly: true, cost: e.ownerMayCost };
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
      // Hisoka, Minamo Sensei: the spell's mana value with its X (CR 202.3e) against the discarded card's, its X as 0 (CR
      // 202.3e), as the ability resolves.
      if (e.ifMvDiscarded) {
        const item = s.stack.find((x) => x.id === t.id);
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        const cost = o && parseManaCost(defOf(s, o).manaCost);
        const mv = cost ? manaValue(cost) + (item!.x ?? 0) * xCount(cost) : 0;
        const discarded = (s.resolving?.item.costDiscarded ?? []).flatMap((k) => (s.cards[k] ? [defMv(s.cards[k]!)] : []));
        if (!o || !discarded.length || discarded[0] !== mv) {
          log(s, `${src} doesn't counter ${item?.description ?? "it"}: its mana value isn't the discarded card's.`);
          return;
        }
      }
      // Ertai's Trickery: kicked as it was cast (CR 702.33d); a copy of a kicked spell is kicked too (CR 707.10).
      if (e.ifKicked) {
        const item = s.stack.find((x) => x.id === t.id);
        // An optional cost paid like kicker isn't kicker ("you may blight 1", replicate).
        const real = !item?.objectId || !s.objects[item.objectId] || isRealKicker(compileCard(defOf(s, s.objects[item.objectId]!)).kicker);
        if (!item || item.kind !== "spell" || !item.kicked?.length || !real) {
          log(s, `${src} doesn't counter ${item?.description ?? "it"}: it wasn't kicked.`);
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
      const spellObj = e.suspend ? s.stack.find((x) => x.id === t.id && x.kind === "spell")?.objectId : undefined;
      const countered = e.thenSource ? s.stack.find((x) => x.id === t.id) : undefined;
      // Thranduil's Decree: a permanent spell (CR 110.4b), by its types on the stack.
      const exileIt = e.exile && (!e.exileIfPermanent || (() => {
        const item = s.stack.find((x) => x.id === t.id);
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        return !!o && characteristics(s, o).types.some((ty) => PERMANENT_TYPES.includes(ty));
      })());
      // Desertion: an artifact or creature spell by its types on the stack; a copy ceases to exist as usual (CR 707.10a).
      const toField = !!e.battlefieldIf && (() => {
        const item = s.stack.find((x) => x.id === t.id);
        const o = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
        return !!o && !o.spellCopy && !item!.copy && characteristics(s, o).types.some((ty) => e.battlefieldIf!.types!.includes(ty));
      })();
      // Psychic Rebuttal: the spell as it is on the stack, kept only if it's countered this way (not if it can't be, or
      // Guile exiles it instead, rulings).
      const snapItem = e.copyCountered ? s.stack.find((x) => x.id === t.id && x.kind === "spell") : undefined;
      const snapCard = snapItem?.objectId ? s.objects[snapItem.objectId] : undefined;
      const snap = snapItem && snapCard ? { item: structuredClone(snapItem), card: structuredClone(snapCard) } : undefined;
      // Counterlash: "it" is the target spell, countered or not; its card types as it is on the stack now.
      if (e.noteTypes && s.resolving) {
        const item = s.stack.find((x) => x.id === t.id && x.kind === "spell");
        const o = item?.objectId ? s.objects[item.objectId] : undefined;
        s.resolving.counterTargetTypes = o ? [...characteristics(s, o).types] : [];
      }
      const counteredBefore = s.resolving?.spellsCountered ?? 0;
      const done = counterOnStack(s, ctx, t.id, src, e.unless, toField ? "battlefield" : exileIt ? "exile" : e.librarySecond ? "librarySecond" : e.libraryChoice ? "libraryChoice" : e.top ? "libraryTop" : e.bottom ? "libraryBottom" : e.hand || e.bounce ? "hand" : undefined, e.bounce);
      if (done === "paused") return done;
      if (snap && s.resolving && (s.resolving.spellsCountered ?? 0) > counteredBefore) s.resolving.counteredCopy = snap;
      if (offerGuileCasts(s, src)) return "paused";
      // Spelljack, Kheru Spellsnatcher: the card countered and exiled this way, while it stays exiled (CR 400.7).
      const ex = e.youMayFree && s.resolving?.counteredExiled ? s.objects[s.resolving.counteredExiled.id] : undefined;
      if (ex && ex.zone === "exile" && (ex.zoneChanges ?? 0) === s.resolving!.counteredExiled!.zc && !ex.isToken) {
        ex.mayPlay = { player: ctx.controller, zc: ex.zoneChanges ?? 0, until: "exiled", turn: s.turn, free: true, ...(e.youMayFree === "cast" ? { castOnly: true as const } : {}) };
        log(s, `${player(s, ctx.controller).name} may cast ${defOf(s, ex).name} without paying its mana cost for as long as it remains exiled.`);
      }
      // Green Slime, Trickbind: a permanent's ability countered (gone from the stack), its source still on the battlefield as
      // the object it was (CR 400.7); a card's ability in another zone isn't a permanent's.
      const by = countered?.kind === "ability" && countered.sourceId && !s.stack.some((x) => x.id === t.id) ? s.objects[countered.sourceId] : undefined;
      if (by && by.zone === "battlefield" && (countered!.sourceZc === undefined || (by.zoneChanges ?? 0) === countered!.sourceZc)) {
        if (e.thenSource === "destroy") destroyPermanent(s, by, `${src} destroys ${defOf(s, by).name}.`, false, ctx.controller);
        else {
          // Its activated abilities, mana abilities too, until end of turn (rulings on Trickbind).
          s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ctx.controller, sourceName: src, duration: "endOfTurn", affected: [by.id], mods: [{ kind: "cantActivate" }] });
          invalidateCharacteristics(s);
          log(s, `${defOf(s, by).name}'s activated abilities can't be activated this turn.`);
        }
      }
      // Delay: the card it was, countered and exiled this way (a copy has ceased to exist, CR 707.10a).
      const o = spellObj ? s.objects[spellObj] : undefined;
      // Only one countered and exiled this way, not one Guile exiled instead (never countered).
      if (e.suspend && o?.zone === "exile" && !s.stack.some((x) => x.id === t.id) && s.resolving?.counteredExiled?.id === o.id) suspendExiled(s, o, e.suspend);
      return;
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
/** Treasure Keeper: "Put all revealed cards not cast this way on the bottom of your library in a random order." */
function revealedToBottom(s: GameState, seen: ObjectId[]): void {
  const rest = seen.filter((id) => s.objects[id]?.zone === "library");
  if (!rest.length) return;
  const p = player(s, s.objects[rest[0]!]!.owner);
  shuffle(s, rest);
  for (const id of rest) {
    p.library.splice(p.library.indexOf(id), 1);
    p.library.push(id);
  }
  log(s, `${p.name} puts ${rest.length} revealed card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
}

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

/**
 * Guile: each card exiled instead of being countered (counterOnStack), which the counter effect's controller may cast now
 * without paying its mana cost, timing ignored (CR 608.2g), or never (rulings). "paused" while one is offered.
 */
export function offerGuileCasts(s: GameState, src: string): "paused" | void {
  const sc = s.resolving?.scratch;
  while (sc?.guileCasts?.length) {
    const next = sc.guileCasts.shift()!;
    const o = s.objects[next.id];
    if (!o || o.zone !== "exile" || (o.zoneChanges ?? 0) !== next.zc) continue;
    s.pending = { kind: "castFree", player: next.player, objectId: o.id, source: src };
    if (freeCastable(s, next.player, o.id)) return "paused";
    s.pending = null;
    log(s, `${defOf(s, o).name} can't be cast.`);
  }
  if (sc) sc.guileCasts = undefined;
}

export function counterOnStack(s: GameState, ctx: ResolveCtx, stackId: string | undefined, by: string, unless?: UnlessPays, instead?: "exile" | "libraryTop" | "hand" | "librarySecond" | "libraryChoice" | "battlefield" | "libraryBottom", bounce?: true): "paused" | void {
  const i = s.stack.findIndex((x) => x.id === stackId);
  const item = s.stack[i];
  if (!item) return; // it already left the stack
  const what = item.kind === "spell" ? item.description : `${item.description.split(":")[0]}'s ability`;
  if (item.kind !== "spell" && item.sourceId && s.resolving) s.resolving.targetedAbilitySource = { id: item.sourceId, zc: item.sourceZc ?? 0 };
  if (bounce) {
    // Subtlety: its owner chooses the top or the bottom as this resolves (CR 608.2d); a copy just ceases to exist.
    let position: "top" | "bottom" | undefined;
    if (instead === "libraryChoice") {
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      const sc = (s.resolving!.scratch ??= {});
      if (o && !o.spellCopy && !sc.topOrBottom) {
        s.pending = { kind: "chooseOption", player: o.owner, source: by, what: "topOrBottom", options: ["top", "bottom"], labels: ["Top", "Bottom"], prompt: `put ${defOf(s, o).name} on the top or bottom of your library?` };
        return "paused";
      }
      position = sc.topOrBottom === "bottom" ? "bottom" : "top";
      sc.topOrBottom = undefined;
    }
    // Returned or exiled, not countered (Reprieve, Mindbreak Trap). A copy of a spell ceases to exist (CR 707.10a).
    s.stack.splice(i, 1);
    if (instead === "libraryChoice") {
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (o) moveObject(s, o.id, "library", { top: position === "top" });
      log(s, o && !o.spellCopy ? `${by}: ${player(s, o.owner).name} puts ${what} on the ${position} of their library.` : `${by} removes ${what} from the stack.`);
      return;
    }
    // Neera, Wild Mage: on the bottom of its owner's library.
    if (instead === "libraryBottom") {
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (o) moveObject(s, o.id, "library");
      log(s, o && !o.spellCopy ? `${by}: ${player(s, o.owner).name} puts ${what} on the bottom of their library.` : `${by} removes ${what} from the stack.`);
      return;
    }
    // Commit: second from the top, or the only card of an empty library (rulings).
    if (instead === "librarySecond") {
      const o = item.objectId ? s.objects[item.objectId] : undefined;
      if (o) {
        moveObject(s, o.id, "library", { top: true });
        const lib = s.players[o.owner]!.library;
        if (o.zone === "library" && lib[0] === o.id) lib.splice(Math.min(1, lib.length - 1), 0, lib.shift()!);
      }
      log(s, `${by} puts ${what} into its owner's library second from the top.`);
      return;
    }
    if (item.objectId) moveObject(s, item.objectId, instead === "exile" ? "exile" : "hand");
    // Press the Enemy: "with equal or lesser mana value" reads a spell returned this way as it was on the stack, X
    // included (rulings, CR 202.3e).
    const moved = item.objectId && s.objects[item.objectId];
    if (moved && item.x && s.resolving) (s.resolving.countered ??= {})[moved.id] = { zc: moved.zoneChanges ?? 0, x: item.x };
    // Gale's Redirection: "the exiled card", the card the spell was (a copy ceases to exist, CR 707.10a).
    if (instead === "exile" && moved && moved.zone === "exile" && !moved.spellCopy && !moved.isToken && item.kind === "spell" && s.resolving) s.resolving.exiledFromStack = { id: moved.id, zc: moved.zoneChanges ?? 0 };
    log(s, instead === "exile" ? `${by} exiles ${what}.` : `${by} returns ${what} to its owner's hand.`);
    return;
  }
  if (item.kind !== "spell" && s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).abilitiesUncounterable)) {
    log(s, `${what} can't be countered.`); // CR 101.2 (Spider-Punk)
    return;
  }
  if (item.objectId && cantBeCountered(s, item)) {
    // Power Sink: its controller may still pay, to avoid what not paying does.
    if (unless?.askAnyway) {
      const paid = paidUnless(s, ctx, item.controller, unless, by, what);
      if (paid === "paused") return paid;
      if (s.resolving) s.resolving.unlessPaid = paid;
    }
    log(s, `${item.description} can't be countered.`); // CR 101.2
    return;
  }
  if (unless) {
    const paid = paidUnless(s, ctx, item.controller, unless, by, what);
    if (paid === "paused") return paid;
    if (s.resolving) s.resolving.unlessPaid = paid;
    if (paid) return;
  }
  // Guile: "If a spell or ability you control would counter a spell, instead exile that spell and you may play that card
  // without paying its mana cost." The counter is replaced whatever it would have done with the spell (CR 614.1a, 614.6);
  // the spell is never countered (rulings), so nothing about countering it happens. A copy ceases to exist (CR 707.10a).
  // The card may be cast right away, as the counter effect carries on (rulings; offerGuileCasts).
  const guile = item.kind === "spell" ? s.battlefield.find((id) => controllerOf(s, obj(s, id)) === ctx.controller && abilitiesOf(s, obj(s, id)).counterExilesFree) : undefined;
  if (guile) {
    s.stack.splice(i, 1);
    if (item.objectId) moveObject(s, item.objectId, "exile");
    const ex = item.objectId ? s.objects[item.objectId] : undefined;
    log(s, `${defOf(s, obj(s, guile)).name}: instead of being countered by ${by}, ${what} is exiled.`);
    if (ex && ex.zone === "exile" && !ex.spellCopy && !ex.isToken && !item.copy && s.resolving) ((s.resolving.scratch ??= {}).guileCasts ??= []).push({ id: ex.id, zc: ex.zoneChanges ?? 0, player: ctx.controller });
    return;
  }
  // Hinder: "put that card on your choice of the top or bottom of its owner's library": the countering spell's controller
  // chooses as it resolves (rulings); a copy just ceases to exist (CR 707.10a). Spell Crumple: the bottom.
  let bottom = instead === "libraryBottom";
  if (instead === "libraryChoice") {
    const o = item.objectId ? s.objects[item.objectId] : undefined;
    const sc = (s.resolving!.scratch ??= {});
    if (o && !o.spellCopy && !sc.topOrBottom) {
      s.pending = { kind: "chooseOption", player: ctx.controller, source: by, what: "topOrBottom", options: ["top", "bottom"], labels: ["Top", "Bottom"], about: o.id, prompt: `put ${defOf(s, o).name} on the top or bottom of ${o.owner === ctx.controller ? "your" : `${player(s, o.owner).name}'s`} library?` };
      return "paused";
    }
    bottom = sc.topOrBottom === "bottom";
    sc.topOrBottom = undefined;
  }
  // Summoning Trap: a creature spell someone cast (not a copy, which isn't cast, CR 707.10), countered by this spell's or
  // ability's controller, its types as it was on the stack.
  if (item.kind === "spell" && !item.copy && item.objectId && s.objects[item.objectId] && objIsType(s, s.objects[item.objectId]!, "Creature")) ((s.turnLog ??= {}).creaturesCountered ??= []).push({ caster: item.controller, by: ctx.controller });
  s.stack.splice(i, 1);
  const spent = item.objectId ? s.objects[item.objectId]?.manaSpent : undefined;
  // Desertion: onto the battlefield under the countering spell's controller's control, never cast (rulings).
  if (item.objectId && instead === "battlefield") moveObject(s, item.objectId, "battlefield", { controller: ctx.controller });
  else if (item.objectId) moveObject(s, item.objectId, instead === "exile" ? "exile" : instead === "hand" ? "hand" : instead ? "library" : "graveyard", instead === "libraryTop" || (instead === "libraryChoice" && !bottom) ? { top: true } : {});
  // "Discover X, where X is that spell's mana value" (Hurl into History): with the X chosen for it (CR 202.3e, rulings).
  const gone = item.objectId && s.objects[item.objectId];
  // "The amount of mana spent to cast that spell" (Mana Sculpt): as it was on the stack.
  if (gone && (item.x || spent) && s.resolving) (s.resolving.countered ??= {})[gone.id] = { zc: gone.zoneChanges ?? 0, x: item.x ?? 0, ...(spent ? { manaSpent: spent } : {}) };
  if (item.kind !== "spell" && item.sourceId && s.resolving) s.resolving.counteredSource = { id: item.sourceId, zc: item.sourceZc ?? 0 };
  if (gone && gone.zone === "exile" && !gone.spellCopy && item.kind === "spell" && s.resolving) s.resolving.counteredExiled = { id: gone.id, zc: gone.zoneChanges ?? 0 };
  log(s, `${by} counters ${what}${!item.objectId ? "" : instead === "battlefield" ? ` and puts it onto the battlefield under ${player(s, ctx.controller).name}'s control` : instead === "exile" ? " and exiles it" : instead === "hand" ? " and returns it to its owner's hand" : bottom ? " and puts it on the bottom of its owner's library" : instead ? " and puts it on top of its owner's library" : ""}.`);
  // "Whenever a spell or ability you control counters a spell" (Baral): only a spell, and only when it's countered.
  if (s.resolving) s.resolving.stackCountered = (s.resolving.stackCountered ?? 0) + 1;
  if (item.kind === "spell" && s.resolving) {
    s.resolving.spellCountered = true;
    s.resolving.spellsCountered = (s.resolving.spellsCountered ?? 0) + 1;
  }
  if (item.kind === "spell") fireEvent(s, { type: "spellCountered", by: ctx.controller, caster: item.controller, ...(item.copy ? { copy: true as const } : {}) });
}

/**
 * A spell that can't be countered (CR 101.2): its own "~ can't be countered", or a permanent's "Creature spells you
 * control can't be countered". The counter effect still does whatever else it does (rulings on Prowling Serpopard).
 */
/** A spell's mana value on the stack: its mana cost with the X chosen for it (CR 202.3e). */
const spellMv = (d: CardDef, x = 0) => {
  const cost = parseManaCost(d.manaCost);
  return manaValue(cost) + x * xCount(cost);
};

export function cantBeCountered(s: GameState, item: StackItem): boolean {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  if (!o) return false;
  const d = defOf(s, o);
  const compiled = compileCard(d);
  if (compiled.cantBeCountered || (o.uncounterableCast && !item.copy) || item.uncounterable) return true;
  // Banefire: its X, chosen as it was cast (a copy has the same X, CR 707.10).
  if (compiled.cantBeCounteredX !== undefined && (item.x ?? 0) >= compiled.cantBeCounteredX) return true;
  // Dragonlord's Prerogative: how it was cast, which a copy copies (CR 707.10).
  if (compiled.cantBeCounteredKicked && item.kicked?.length) return true;
  // Exquisite Firecraft: its controller's graveyard as something would counter it.
  if (compiled.cantBeCounteredIf && staticConditionNow(s, compiled.cantBeCounteredIf, o.id, item.controller)) return true;
  // "Spells you control can't be countered this turn" (Veil of Summer): those on the stack already too (rulings).
  // "Can't be countered by blue or black spells this turn" (Autumn's Veil): the countering spell's colors as it resolves
  // (rulings); abilities still can.
  const by = s.resolving?.item.kind === "spell" && s.resolving.item.objectId ? s.objects[s.resolving.item.objectId] : undefined;
  const byColors = by ? characteristics(s, by).colors : [];
  if ((s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === item.controller && r.rule === "spellsUncounterable" && (!r.byColors || r.byColors.some((c) => byColors.includes(c))))) return true;
  if (!item.copy && isType(d, "Creature") && (s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === item.controller && r.rule === "creatureSpellsUncounterable")) return true;
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    return !!abilitiesOf(s, p).uncounterable?.some((u) => (u.anyone || controllerOf(s, p) === item.controller) && printedMatches(u.filter, d) && (u.minMv === undefined || (!item.copy && spellMv(d, item.x) >= u.minMv)) && (!u.castOnly || (!item.copy && !item.controlTaken)));
  });
}

/**
 * "Unless [payer] pays ...", as this resolves (CR 118.12): true if they paid, false if they didn't, "paused" while they
 * choose. They may activate mana abilities to pay (CR 605.3a).
 */
export function paidUnless(s: GameState, ctx: ResolveCtx, payer: PlayerId, unless: UnlessPays, by: string, what: string, otherwise?: string): boolean | "paused" {
  const sc = (s.resolving!.scratch ??= {});
  // "Ward—Discard a card or pay {2}" (Titania, Rugged Rumbler): its payer chooses which cost to pay, or neither (CR
  // 702.21a, 118.12); one they can't pay (no cards to discard) isn't offered.
  if (unless.orElse) {
    if (sc.paid !== undefined) return sc.paid;
    const ways = [{ ...unless, orElse: undefined }, unless.orElse];
    if (sc.unlessWay === undefined) {
      const p = player(s, payer);
      const can = (u: UnlessPays) => !p.lost && !(u.discard && p.hand.length < u.discard);
      const options = ways.flatMap((u, i) => (can(u) ? [String(i)] : []));
      if (!options.length) {
        sc.paid = false;
        return false;
      }
      s.pending = { kind: "chooseOption", player: payer, source: by, what: "unlessWay", prompt: `which cost do you pay, or is ${what} countered?`, options: [...options, "none"], labels: [...options.map((i) => ways[Number(i)]!.label ?? ways[Number(i)]!.cost), "Pay neither"] };
      return "paused";
    }
    if (sc.unlessWay === "none") {
      sc.unlessWay = undefined;
      sc.paid = false;
      return false;
    }
    const r = paidUnless(s, ctx, payer, ways[Number(sc.unlessWay)]!, by, what, otherwise);
    if (r !== "paused") sc.unlessWay = undefined;
    return r;
  }
  // "Ward—Discard a card": the cards they chose to discard (see payUnless).
  if (sc.paid === undefined && (unless.discard || unless.discardHand || unless.discardRandom) && sc.chosen?.[payer]) {
    discardCards(s, payer, sc.chosen[payer]!);
    sc.paid = true;
  }
  // Grip of Amnesia: the cards in their graveyard as they chose to pay (see payUnless), exiled as the payment.
  if (sc.paid === undefined && unless.exileGraveyard && sc.chosen?.[payer]) {
    const ids = sc.chosen[payer]!.filter((id) => s.objects[id]?.zone === "graveyard");
    if (ids.length) log(s, `${player(s, payer).name} exiles all cards from their graveyard.`);
    for (const id of ids) moveObject(s, id, "exile");
    sc.paid = true;
  }
  // "Ward—Blight 2": the creature they chose (see payUnless), the -1/-1 counters put on it as the payment (CR 701.68a).
  if (sc.paid === undefined && unless.blight && sc.chosen?.[payer]) {
    for (const id of sc.chosen[payer]!) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      const put = putCounters(s, o, "-1/-1", unless.blight);
      log(s, `${player(s, payer).name} blights ${unless.blight}, putting ${put === 1 ? "a" : put} -1/-1 counter${put === 1 ? "" : "s"} on ${defOf(s, o).name}.`);
    }
    sc.paid = true;
  }
  // "Ward—Collect evidence 4": the cards they chose (see payUnless), exiled as the payment (CR 701.59a).
  if (sc.paid === undefined && unless.collectEvidence && sc.chosen?.[payer]) {
    const ids = sc.chosen[payer]!.filter((id) => s.objects[id]?.zone === "graveyard");
    collectEvidence(s, player(s, payer), ids, unless.collectEvidence);
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
    if (p.lost || (unless.discard && p.hand.length < unless.discard) || (unless.discardRandom && p.hand.length < unless.discardRandom) || (unless.sacrifice && pickOptions(s, unless.sacrifice, payer).length < unless.sacrifice.n) || (unless.blight && !blightOptions(s, payer, unless.blight).length) || (unless.collectEvidence && evidenceProblem(s, payer, unless.collectEvidence, undefined))) sc.paid = false;
    else if (cost === "{0}" && !life && !unless.discard && !unless.sacrifice && !unless.discardHand && !unless.exileGraveyard && !unless.discardRandom && !unless.poison && !unless.blight && !unless.collectEvidence) {
      // Paying {0} is just saying so (CR 118.5); nobody would refuse.
      log(s, `${p.name} pays {0}${unless.lifeAmount ? " (0 life)" : ""} for ${by}.`);
      sc.paid = true;
    } else {
      s.pending = { kind: "payUnless", player: p.id, cost, source: by, what, ...(otherwise ? { otherwise } : {}), ...(life ? { life } : {}), ...(unless.discard ? { discard: unless.discard } : {}), ...(unless.discardHand ? { discardHand: true as const } : {}), ...(unless.exileGraveyard ? { exileGraveyard: true as const } : {}), ...(unless.discardRandom ? { discardRandom: unless.discardRandom } : {}), ...(unless.poison ? { poison: unless.poison } : {}), ...(unless.sacrifice ? { sacrifice: unless.sacrifice } : {}), ...(unless.waterbend ? { waterbend: unless.waterbend } : {}), ...(unless.blight ? { blight: unless.blight } : {}), ...(unless.collectEvidence ? { collectEvidence: unless.collectEvidence } : {}) };
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
function changeTarget(s: GameState, ctx: ResolveCtx, stackId: string, by: string, unless?: UnlessPays, toSelf?: true, all?: true, mustBe?: "player" | "creature"): "paused" | void {
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
  const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
  const spec = specs[j];
  if (!spec) return;
  // Torchling: every target naming that one thing (TargetSpec.targetsOnly), all to one new target that meets each of their
  // conditions; "The new target must be a player / a creature" (Rebound, Silver Wyvern).
  const slots = all ? (item.targets ?? []).flatMap((x, k) => (sameTarget(x, current) ? [k] : [])) : [j];
  const fits = (t: TargetChoice) =>
    slots.every((k) => !!specs[k] && changeTargetOptions(s, item, specs[k]!, current).some((x) => sameTarget(x, t))) &&
    (mustBe !== "player" || t.kind === "player") &&
    (mustBe !== "creature" || (t.kind === "object" && !!s.objects[t.id] && objIsType(s, s.objects[t.id]!, "Creature")));
  if (toSelf) {
    // To this ability's source, still on the battlefield as the same object, and only if it's a legal target for it.
    const me = ctx.sourceId ? s.objects[ctx.sourceId] : undefined;
    const here = !!me && me.zone === "battlefield" && (ctx.sourceZc === undefined || (me.zoneChanges ?? 0) === ctx.sourceZc);
    // Muck Drubb: with `all`, ~ must be a legal target for each of them (rulings).
    const to = here ? changeTargetOptions(s, item, spec, current).find((t) => t.kind === "object" && t.id === me!.id && (!all || slots.every((k) => !!specs[k] && changeTargetOptions(s, item, specs[k]!, current).some((x) => sameTarget(x, t))))) : undefined;
    if (!to) {
      log(s, `${by} can't become the target of ${item.description}, so its target stays the same.`);
      return;
    }
    sc.newTarget = to;
  }
  if (!sc.newTarget) {
    const options = changeTargetOptions(s, item, spec, current).filter(fits);
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
  item.targets = item.targets!.map((x, i) => (slots.includes(i) ? stampTargets(s, [next])![0]! : x));
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
function newTargets(s: GameState, ctx: ResolveCtx, stackId: string, by: string, allOrNone?: true, changeAny?: true): "paused" | void {
  const item = s.stack.find((x) => x.id === stackId);
  const o = item?.objectId ? s.objects[item.objectId] : undefined;
  if (!item || (item.kind === "spell" && !o)) return;
  const current = item.targets ?? [];
  const specs = item.body?.targets ?? (o ? spellTargetSpecs(defOf(s, o), item.modes) : []);
  if (!current.some((t) => t.kind !== "none") || specs.length !== current.length) return;
  const sc = (s.resolving!.scratch ??= {});
  if (!sc.retargets) {
    // "Change the targets" (CR 115.7a): if any one target can't change to another legal one, none of them change.
    if (allOrNone ? current.some((t, j) => t.kind !== "none" && !changeTargetOptions(s, item, specs[j]!, t).length) : !current.some((t, j) => t.kind !== "none" && changeTargetOptions(s, item, specs[j]!, t).length)) {
      log(s, `${item.description} has no other legal targets, so its targets stay the same.`);
      return;
    }
    s.pending = { kind: "newTargets", player: ctx.controller, source: by, spell: item.description, stackId: item.id, controller: item.controller, specs, current, ...(allOrNone ? { allOrNone } : {}), ...(changeAny ? { changeAny } : {}) };
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
  const src = o ? spellQuality(s, cardIdOf(o), item) : sourceQuality(s, item.sourceId, item.sourceCardId);
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
export function addDelayed(s: GameState, when: DelayedTrigger["when"], controller: PlayerId, o: GameObject, body: AbilityBody, sourceCardId = cardIdOf(o), whose?: PlayerId) {
  (s.delayed ??= []).push({ when, controller, sourceCardId, subject: { id: o.id, zc: o.zoneChanges ?? 0 }, body, turn: s.turn, step: s.step, ...(o.transforms ? { transforms: o.transforms } : {}), ...(whose !== undefined ? { player: whose } : {}) });
}

/** Was it kicked (CR 702.33d), with that kicker cost if the condition names one (702.33f)? */
export function kickedMatches(kicked: number[] | undefined, cond: SpellCondition): boolean {
  if (cond.kind !== "kicked") return false;
  if (cond.times) return (kicked?.length ?? 0) >= cond.times;
  return cond.which === undefined ? !!kicked?.length : !!kicked?.includes(cond.which);
}

/** Song of Blood: a copy of `t` with every amount counting this resolution's milled cards fixed at what it is now (CR 608.2h). */
function bindMilledCounts<T>(s: GameState, t: T, ctx: ResolveCtx): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    if (o.count && typeof o.count === "object" && (o.count as { kind?: string }).kind === "milledThisWay") return amountNow(s, o as unknown as Amount, ctx);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
  };
  return walk(t) as T;
}

/** A copy of `t` with every "with the chosen name" (CR 201.4) or "of the chosen color" filter in it bound to what `chosen` holds. */
function bindChosenName<T>(t: T, chosen: Chosen): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out = Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    return ((o.chosen === "name" && chosen.name !== undefined) || (o.chosen === "color" && chosen.color !== undefined) || (o.chosen === "planeswalkerType" && chosen.planeswalkerType !== undefined)) && typeof o.kind === "string" ? bindChosen(out as unknown as TargetSpec, chosen) : out;
  };
  return walk(t) as T;
}

import type { AbilityBody, TargetChoice, TargetSpec, TriggeredAbility, TriggerEvent } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, NO_ABILITIES, withGranted, describeAbility, objIsType, power, toughness } from "../cards";
import { describeTargets, draw, log, obj, opponents, player } from "../game";
import { controllerOf, invalidateCharacteristics, staticConditionNow, type Characteristics } from "../layers";
import { withModes } from "../modes";
import { compileCard } from "../oracle";
import type { CardDef, GameObject, GameState, LastKnown, ObjectId, PendingTrigger, PlayerId, TriggerEventInfo, ZoneName } from "../types";
import { objectMatches, bindChosen, sourceQuality, printedMatches, stampTargets, hasLegalTargets, legalModes } from "./targeting";
import { monarchTrigger } from "./run-basics";
import { kickedMatches } from "./run-spells";

/** The trigger events for the beginning of a step: on your turn, and on every turn. */
const STEP_TRIGGERS: Record<Extract<TriggerSourceEvent, { type: "step" }>["step"], [TriggerEvent, TriggerEvent]> = {
  upkeep: ["yourUpkeep", "eachUpkeep"],
  draw: ["yourDrawStep", "eachDrawStep"],
  end: ["yourEndStep", "eachEndStep"],
  beginCombat: ["yourBeginCombat", "eachBeginCombat"], // CR 507.1
  endCombat: ["yourEndCombat", "eachEndCombat"], // "at end of combat" (CR 511.2)
};

/** From the declare attackers step to the end of combat step: when creatures can be attacking (CR 506.1). */
export const inCombat = (s: GameState) => ["declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);

/**
 * Whom a creature put onto the battlefield attacking attacks (CR 508.4): its controller chooses; we pick whom
 * the source (or the creature it's attached to) is attacking, else whom most of their attackers attack, else
 * the next opponent. Undefined outside combat, where it just isn't attacking.
 */
export function attackDefault(s: GameState, pid: PlayerId, sourceId?: ObjectId): PlayerId | undefined {
  if (!inCombat(s) || s.activePlayer !== pid) return undefined;
  const living = opponents(s, pid);
  const src = sourceId ? s.objects[sourceId] : undefined;
  const host = src?.attachedTo ? s.objects[src.attachedTo] : undefined;
  for (const o of [src, host]) if (o?.zone === "battlefield" && o.attacking !== undefined && living.includes(o.attacking)) return o.attacking;
  const count = new Map<PlayerId, number>();
  for (const id of s.battlefield) {
    const a = s.objects[id]!.attacking;
    if (a !== undefined && living.includes(a)) count.set(a, (count.get(a) ?? 0) + 1);
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : living[0];
}

// ---------------------------------------------------------------------------
// Triggered abilities (CR 603)

export type TriggerSourceEvent =
  | { type: "enters"; id: ObjectId; x?: number }
  /** `counters`: the counters it had on the battlefield (last known information, for persist and undying). */
  /** It left the battlefield for `to` (only a graveyard makes it "die"). */
  | { type: "dies"; to: ZoneName; id: ObjectId; controller: PlayerId; hadAbilities: boolean; grantedAbilities?: string[]; counters: Record<string, number>; wasCreature: boolean; power?: number; toughness?: number; /** It as it last existed on the battlefield. */ snapshot?: GameObject; chars?: Characteristics; /** The Auras and Equipment that were attached to it. */ attachments?: ObjectId[] }
  /** Every defending player has declared blockers (CR 509.3). */
  | { type: "blocksDeclared" }
  /** A player gained life (one life-gain event, CR 119.10). */
  | { type: "lifeGained"; player: PlayerId }
  | { type: "attacks"; id: ObjectId }
  /** A player declared these attackers (CR 508.1): "whenever one or more creatures you control attack". */
  | { type: "groupAttack"; controller: PlayerId; ids: ObjectId[] }
  /** In one combat damage step, these creatures of `controller` dealt `player` combat damage. */
  | { type: "groupCombatDamage"; controller: PlayerId; player: PlayerId; ids: ObjectId[]; amounts: number[] }
  /** The last counter of a kind was removed from it (vanishing's time counters, CR 702.63a). */
  | { type: "lastCounterRemoved"; id: ObjectId; counter: string }
  /** A face-down permanent was turned face up (CR 702.37e, 708.8). */
  | { type: "turnedFaceUp"; id: ObjectId }
  /** It's the only creature declared as an attacker this combat (CR 506.5, exalted 702.83b). */
  | { type: "attacksAlone"; id: ObjectId }
  | { type: "combatDamageToPlayer"; id: ObjectId; player: PlayerId; amount: number }
  /** A source dealt damage: everything it dealt at once is one event (CR 120.3, 603.2c). */
  | { type: "dealtDamage"; id: ObjectId; amount: number; combat: boolean }
  | { type: "step"; step: "upkeep" | "draw" | "end" | "beginCombat" | "endCombat"; active: PlayerId }
  /** A spell was just cast (CR 601.2i): "whenever you cast" abilities and prowess. */
  | { type: "cast"; stackId: string; controller: PlayerId; card: CardDef; /** A copy was put on the stack instead (magecraft's "or copy"). */ copy?: boolean }
  /** A spell or ability was just put on the stack with its targets: "becomes the target" (CR 601.2c, ward 702.21a). */
  | { type: "targeted"; stackId: string }
  /** A player drew a card, their `nth` this turn (CR 121.2). */
  | { type: "draw"; player: PlayerId; nth: number };

/**
 * Echo (CR 702.30a): "if this permanent came under your control since the beginning of your last
 * upkeep". This runs as the current upkeep begins, so "your last upkeep" is the one before it.
 */
export function echoDue(s: GameState, o: GameObject, you: PlayerId): boolean {
  const last = player(s, you).lastUpkeepTurn;
  return last === undefined || o.controlledSinceTurn >= last;
}

/** Evolve's comparison (CR 702.100a): is the entering creature bigger in power or toughness? */
export function evolves(s: GameState, o: GameObject, stats: LastKnown): boolean {
  if (!objIsType(s, o, "Creature")) return false; // CR 702.100c
  return (stats.power ?? 0) > power(s, o) || (stats.toughness ?? 0) > toughness(s, o);
}

/** Does this death set off a "whenever another creature dies" ability of `srcId` (which may have died with it)? */
function diesMatches(
  s: GameState,
  d: NonNullable<TriggeredAbility["dies"]>,
  srcId: ObjectId,
  attachedTo: ObjectId | undefined,
  dying: { o: GameObject; c: Characteristics },
  you: PlayerId,
): boolean {
  if (d.attached) return attachedTo === dying.o.id && dying.c.types.includes("Creature");
  if (d.damagedBySelf && !dying.o.damagedBy?.includes(srcId)) return false;
  if (srcId === dying.o.id) {
    if (d.orSelf) return true;
    if (d.other) return false;
  }
  return objectMatches(s, d.filter, dying.o, you, false, undefined, dying.c);
}

/** Does `entering` set off `o`'s "whenever a/another/~ or another ... enters" ability? */
function entersMatches(s: GameState, en: NonNullable<TriggeredAbility["enters"]>, o: GameObject, entering: GameObject, you: PlayerId): boolean {
  if (o.id === entering.id) {
    if (en.orSelf) return true;
    if (en.other) return false;
  }
  return objectMatches(s, en.filter, entering, you, false);
}

/** Record every triggered ability that `ev` triggers. They go on the stack the next time a player would get priority. */
/** Dethrone (CR 702.105a): it attacks the player with the most life or tied for most life. */
function attacksMostLife(s: GameState, o: GameObject): boolean {
  if (o.attacking === undefined) return false;
  const lives = s.turnOrder.map((pid) => s.players[pid]!).filter((p) => !p.lost).map((p) => p.life);
  return s.players[o.attacking]!.life >= Math.max(...lives);
}

/** Training (CR 702.149a): another creature with greater power attacks alongside it. */
function trains(s: GameState, o: GameObject): boolean {
  const mine = power(s, o);
  return s.battlefield.some((id) => id !== o.id && s.objects[id]!.attacking !== undefined && objIsType(s, s.objects[id]!, "Creature") && power(s, s.objects[id]!) > mine);
}

export function fireEvent(s: GameState, ev: TriggerSourceEvent) {
  // Abilities that trigger on the battlefield use the permanent's abilities right now;
  // leaves-the-battlefield triggers look back in time (CR 603.10a), so "dies" passes them in.
  const add = (
    o: GameObject,
    controller: PlayerId,
    pred: (event: string, t: TriggeredAbility) => boolean,
    triggers = abilitiesOf(s, o).triggers,
    cause?: string,
    subject?: GameObject,
    lki?: LastKnown,
    x?: number,
    kicked?: number[],
    event?: TriggerEventInfo,
  ) => {
    const printed = compileCard(defOf(s, o)).triggers;
    triggers.forEach((t, index) => {
      // An intervening "if" has to be true for it to trigger at all (CR 603.4).
      if (pred(t.event, t) && (!t.ifCond || staticConditionNow(s, t.ifCond, o.id, controller)))
        s.triggerQueue.push({
          ...(t.ifCond ? { ifCond: t.ifCond } : {}),
          // An ability an effect gave it isn't on its card, so the trigger carries what it does.
          ...(printed[index] !== t ? { body: t.body } : {}),
          sourceId: o.id,
          sourceCardId: cardIdOf(o),
          controller,
          index,
          sourceZc: o.zoneChanges ?? 0,
          ...(cause ? { cause } : {}),
          ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
          ...(lki ? { lki } : {}),
          ...(x ? { x } : {}),
          ...(kicked ? { kicked } : {}),
          ...(event ? { event } : {}),
        });
    });
  };
  if (ev.type === "enters") {
    // Static effects apply as it enters, before checking what triggers (CR 611.3c).
    invalidateCharacteristics(s);
    const entering = obj(s, ev.id);
    const you = controllerOf(s, entering);
    // Its own enters abilities use the X of the spell it was (CR 107.3m), and know whether it was kicked;
    // "if it was kicked" is an intervening if (CR 603.4), and that can't change by the time it resolves.
    // Evoke's sacrifice trigger only if the evoke cost was paid (CR 702.74a).
    add(
      entering,
      you,
      (e, t) => e === "selfEnters" && (!t.ifKicked || kickedMatches(entering.kicked, t.ifKicked)) && (!t.ifEvoked || entering.castAlt === "evoke"),
      undefined,
      undefined,
      undefined,
      undefined,
      ev.x,
      entering.kicked,
    );
    if (objIsType(s, entering, "Creature")) {
      const lki = { power: power(s, entering), toughness: toughness(s, entering) };
      for (const id of s.battlefield) {
        if (id === ev.id || controllerOf(s, obj(s, id)) !== you) continue;
        const o = obj(s, id);
        // Evolve only triggers if the new creature is bigger in some way (CR 702.100a, 603.4).
        add(o, you, (e, t) => e === "anotherCreatureYouControlEnters" && (!t.ifEvolves || evolves(s, o, lki)), undefined, undefined, entering, lki);
      }
    }
    // Landfall. The land itself sees itself enter too (CR 603.6a).
    if (objIsType(s, entering, "Land"))
      for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e) => e === "landYouControlEnters");
    // "Whenever a creature you control enters", "another Ally", "~ or another artifact": on every permanent,
    // the entering one too, which is the subject ("that creature"). It sees itself enter (CR 603.6a).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const ctrl = controllerOf(s, o);
      add(o, ctrl, (e, t) => e === "permanentEnters" && !!t.enters && entersMatches(s, t.enters, o, entering, ctrl), undefined, undefined, entering);
    }
  } else if (ev.type === "dies") {
    const o = obj(s, ev.id);
    // Persist and undying: "if it had no -1/-1 counters on it" (an intervening if, CR 603.4; last known information).
    add(
      o,
      ev.controller,
      (e, t) =>
        (((e === "selfDies" && ev.wasCreature) || e === "selfToGraveyard") && ev.to === "graveyard" && !(t.ifNoCounter && (ev.counters[t.ifNoCounter] ?? 0) > 0)) ||
        e === "selfLeaves",
      withGranted(ev.hadAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, ev.grantedAbilities ?? []).triggers,
      undefined,
      undefined,
      { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) },
    );
    // "Whenever another creature dies", "a creature you control", "equipped creature": abilities of permanents
    // on the battlefield, and of ones leaving at the same time, which look back in time (CR 603.10a).
    if (ev.to === "graveyard" && ev.snapshot && ev.chars) {
      const lki = { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) };
      const dying = { o: ev.snapshot, c: ev.chars };
      const consider = (src: GameObject, ctrl: PlayerId, attachedTo: ObjectId | undefined, triggers?: TriggeredAbility[]) =>
        add(src, ctrl, (e, t) => e === "permanentDies" && !!t.dies && diesMatches(s, t.dies, src.id, attachedTo, dying, ctrl), triggers, undefined, o, lki);
      for (const id of s.battlefield) {
        const src = obj(s, id);
        consider(src, controllerOf(s, src), ev.attachments?.includes(id) ? ev.id : src.attachedTo);
      }
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src) continue;
        if (src.zone === "battlefield") continue; // it already came back as a new object
        consider(src, left.controller, left.attachedTo, withGranted(left.hadAbilities ? compileCard(defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
      }
    }
  } else if (ev.type === "blocksDeclared") {
    // "Blocks" and "becomes blocked" trigger once each; "blocks a creature" / "becomes blocked by a creature"
    // once for each such creature, which is the trigger's subject (CR 509.3c-d).
    const fits = (t: TriggeredAbility, subject: GameObject, you: PlayerId) => !t.subjectFilter || objectMatches(s, t.subjectFilter, subject, you, false);
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (o.blocking) {
        add(o, you, (e) => e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks");
        const at = s.objects[o.blocking];
        if (at) add(o, you, (e, t) => (e === "selfBlocksCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, at, you), undefined, undefined, at);
      }
      if (o.attacking !== undefined && o.blockedBy?.length) {
        // "Defending player" (afflict) is the player it's attacking.
        add(o, you, (e) => e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked", undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        for (const b of o.blockedBy) {
          const bl = s.objects[b];
          if (bl) add(o, you, (e, t) => (e === "selfBlockedByCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, bl, you), undefined, undefined, bl);
        }
      }
    }
  } else if (ev.type === "lifeGained") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youGainLife");
    }
  } else if (ev.type === "turnedFaceUp") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfTurnedFaceUp");
  } else if (ev.type === "attacks") {
    const o = obj(s, ev.id);
    // "Defending player" is the player it attacked as it became an attacking creature (myriad rulings).
    add(o, controllerOf(s, o), (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.training || trains(s, o)), undefined, undefined, undefined, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
  } else if (ev.type === "groupAttack" || ev.type === "groupCombatDamage") {
    const want = ev.type === "groupAttack" ? "creaturesYouControlAttack" : "creaturesYouControlDealCombatDamageToPlayer";
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== ev.controller) continue;
      // Only the creatures that match count ("one or more Rogues you control"): "that much" is what they dealt.
      const fits = (t: TriggeredAbility) => ev.ids.map((x, i) => [x, i] as const).filter(([x]) => s.objects[x] && (!t.group || objectMatches(s, t.group, obj(s, x), ev.controller, false)));
      for (const t of abilitiesOf(s, o).triggers) {
        if (t.event !== want) continue;
        const hit = fits(t);
        if (!hit.length) continue;
        const amount = ev.type === "groupCombatDamage" ? hit.reduce((n, [, i]) => n + ev.amounts[i]!, 0) : undefined;
        const same = (tt: TriggeredAbility) => tt.event === want && tt.body.text === t.body.text && JSON.stringify(tt.group) === JSON.stringify(t.group);
        add(o, ev.controller, (_, tt) => same(tt), undefined, undefined, undefined, undefined, undefined, undefined, ev.type === "groupCombatDamage" ? { player: ev.player, amount } : undefined);
      }
    }
  } else if (ev.type === "lastCounterRemoved") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield" && ev.counter === "time") add(o, controllerOf(s, o), (e) => e === "selfLastTimeCounterRemoved");
  } else if (ev.type === "attacksAlone") {
    // Exalted: each permanent its controller controls with exalted triggers (CR 702.83a).
    const attacker = obj(s, ev.id);
    const you = controllerOf(s, attacker);
    for (const id of s.battlefield)
      if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e) => e === "creatureYouControlAttacksAlone", undefined, undefined, attacker);
  } else if (ev.type === "dealtDamage") {
    // Its abilities work only on the battlefield; a spell or a card that left isn't "~" any more.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield")
      add(o, controllerOf(s, o), (e) => e === "selfDealsDamage" || (ev.combat && e === "selfDealsCombatDamage"), undefined, undefined, undefined, undefined, undefined, undefined, { amount: ev.amount });
  } else if (ev.type === "combatDamageToPlayer") {
    const o = obj(s, ev.id);
    const info = { player: ev.player, amount: ev.amount };
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && !(t.ifNotRenowned && o.renowned), undefined, undefined, undefined, undefined, undefined, undefined, info);
    // "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch" (CR 725.2).
    if (ev.player === s.monarch && objIsType(s, o, "Creature")) monarchTrigger(s, 1, o);
  } else if (ev.type === "cast") {
    // "When you cast this spell" abilities work from the stack (CR 702.85a, 603.2).
    const item = s.stack.find((x) => x.id === ev.stackId);
    const spell = item?.objectId ? s.objects[item.objectId] : undefined;
    // "When you next cast ... this turn": once, for the first such spell (CR 603.7c).
    for (const d of ev.copy ? [] : [...(s.nextCast ?? [])]) {
      if (d.controller !== ev.controller || d.turn !== s.turn || !printedMatches(d.filter, ev.card)) continue;
      s.nextCast = s.nextCast!.filter((x) => x !== d);
      s.triggerQueue.push({ sourceId: d.sourceId, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, body: d.body, cause: ev.stackId });
    }
    if (spell && !ev.copy) add(spell, ev.controller, (e) => e === "selfCast", compileCard(defOf(s, spell)).triggers, ev.stackId, undefined, undefined, item?.x, item?.kicked);
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        if (e !== "castSpell" || !t.cast || (ev.copy && !t.cast.orCopy)) return false;
        const by = t.cast.by;
        if ((by === "you" && ev.controller !== you) || (by === "opponent" && ev.controller === you)) return false;
        return printedMatches(bindChosen(t.cast.spell, o.chosen), ev.card);
      }, undefined, ev.stackId); // "counter it unless that player pays" acts on the spell cast
    }
    // Heroic: "Whenever you cast a spell that targets ~", once however many of its targets name it.
    const targeted = new Set(ev.copy ? [] : (item?.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])));
    for (const id of targeted) {
      const o = s.objects[id];
      if (o?.zone === "battlefield" && controllerOf(s, o) === ev.controller) add(o, ev.controller, (e) => e === "selfTargetedByYourSpell", undefined, ev.stackId);
    }
  } else if (ev.type === "targeted") {
    // Each permanent becomes the target once, however many of the item's targets name it.
    const item = s.stack.find((x) => x.id === ev.stackId);
    const seen = new Set<ObjectId>();
    for (const t of item?.targets ?? []) {
      if (t.kind !== "object" || seen.has(t.id)) continue;
      seen.add(t.id);
      const o = s.objects[t.id];
      if (!o || o.zone !== "battlefield") continue;
      const you = controllerOf(s, o);
      add(o, you, (e) => (e === "becomesTargetOfOpponent" && you !== item!.controller) || e === "selfBecomesTarget", undefined, ev.stackId);
    }
  } else if (ev.type === "draw") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        if (e !== "playerDraws" || !t.draws) return false;
        const by = t.draws.by;
        if ((by === "you" && ev.player !== you) || (by === "opponent" && ev.player === you)) return false;
        return t.draws.nth === undefined || t.draws.nth === ev.nth;
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "step") {
    // Delayed triggers whose moment this is (CR 603.7): each triggers once.
    for (const d of [...(s.delayed ?? [])]) {
      // Made during that step, "the next end step" or "end of combat" is a later one (CR 603.7c, 511.2).
      const due =
        d.when === "nextEndStep"
          ? ev.step === "end" && !(d.turn === s.turn && d.step === "end")
          : d.when === "endOfCombat"
            ? ev.step === "endCombat" && !(d.turn === s.turn && d.step === "endCombat")
            : ev.step === "upkeep" && (d.when === "nextTurnUpkeep" || ev.active === d.controller) && d.turn < s.turn;
      if (!due) continue;
      s.delayed = s.delayed!.filter((x) => x !== d);
      s.triggerQueue.push({ sourceId: d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, body: d.body });
    }
    // "At the beginning of the monarch's end step, that player draws a card" (CR 725.2).
    if (ev.step === "end" && s.monarch === ev.active) monarchTrigger(s, 0);
    const [want, each] = STEP_TRIGGERS[ev.step];
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      // "That player" in "at the beginning of each player's upkeep" is the active player.
      add(o, you, (e, t) => (e === want && you === ev.active && (!t.ifEcho || echoDue(s, o, you))) || e === each, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.active });
    }
  }
}

/**
 * Put waiting triggers on the stack in APNAP order (CR 603.3b). A trigger that needs
 * targets stops here with a chooseTargets decision; one with no legal targets is removed
 * (CR 603.3d). Returns true if anything was added to the stack.
 */
export function processTriggerQueue(s: GameState, turnOrderFromActive: PlayerId[]): boolean {
  if (s.pending || !s.triggerQueue.length) return false;
  const rank = (pid: PlayerId) => {
    const i = turnOrderFromActive.indexOf(pid);
    return i < 0 ? 99 : i;
  };
  s.triggerQueue = s.triggerQueue.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.controller) - rank(b.t.controller) || a.i - b.i).map((x) => x.t);
  let added = false;
  while (s.triggerQueue.length) {
    const t = s.triggerQueue[0]!;
    if (player(s, t.controller).lost) {
      s.triggerQueue.shift();
      continue;
    }
    const def = s.cards[t.sourceCardId]!;
    const printed = triggerBody(s, t);
    if (printed.modal && !t.modes) {
      // Modes are chosen as it's put on the stack; a mode without legal targets can't be (CR 603.3c).
      const legal = legalModes(s, printed, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId));
      const n = legal.filter(Boolean).length;
      if (n === 0 || n < printed.modal.min) {
        log(s, `${def.name}'s ability has no mode that can be chosen and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      if (n === printed.modal.min) t.modes = legal.flatMap((ok, i) => (ok ? [i] : [])); // the only possible choice
      else {
        const modes = printed.modal.modes.map((m) => m.text);
        s.pending = { kind: "chooseModes", player: t.controller, sourceId: t.sourceId, description: describeAbility(def, printed.text), min: printed.modal.min, max: printed.modal.max, modes, legal };
        return added;
      }
    }
    if (printed.modal && !t.modes?.length) {
      log(s, `${def.name}'s ability has no modes chosen and is removed.`); // CR 603.3c
      s.triggerQueue.shift();
      continue;
    }
    const body = withModes(printed, t.modes);
    if (body.targets.length) {
      if (!hasLegalTargets(s, body.targets, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId)) {
        log(s, `${def.name}'s ability has no legal targets and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      s.pending = { kind: "chooseTargets", player: t.controller, sourceId: t.sourceId, specs: body.targets, description: describeAbility(def, body.text) };
      return added;
    }
    pushTrigger(s, t, []);
    added = true;
  }
  return added;
}

const triggerOf = (s: GameState, t: PendingTrigger) => (t.body ? undefined : compileCard(s.cards[t.sourceCardId]!).triggers[t.index]);

/**
 * State triggers (CR 603.8): one triggers when its state is true, and not again until that instance has
 * resolved or left the stack.
 */
export function checkStateTriggers(s: GameState) {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const triggers = abilitiesOf(s, o).triggers;
    triggers.forEach((t, index) => {
      if (t.event !== "state" || !t.state) return;
      const waiting = s.triggerQueue.some((q) => q.sourceId === id && q.index === index) || s.stack.some((x) => x.sourceId === id && x.stateIndex === index && x.sourceZc === (o.zoneChanges ?? 0));
      if (waiting || !staticConditionNow(s, t.state, id, controllerOf(s, o))) return;
      s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(o), controller: controllerOf(s, o), index, sourceZc: o.zoneChanges ?? 0 });
    });
  }
}

/** What a waiting trigger does: its source's printed ability, or a delayed trigger's own (CR 603.7). */
export function triggerBody(s: GameState, t: PendingTrigger): AbilityBody {
  const body = t.body ?? compileCard(s.cards[t.sourceCardId]!).triggers[t.index]!.body;
  // "Target creature that player controls": that player is known once it triggers.
  const who = t.event?.player;
  if (!body.targets.some((x) => x.controller === "eventPlayer")) return body;
  const fix = (x: TargetSpec): TargetSpec => (x.controller === "eventPlayer" ? (({ controller: _, ...rest }) => ({ ...rest, ...(who !== undefined ? { controlledBy: who } : { controller: "eventPlayer" as const }) }))(x) : x);
  return { ...body, targets: body.targets.map(fix), ...(body.modal ? { modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, targets: m.targets?.map(fix) })) } } : {}) };
}

export function pushTrigger(s: GameState, t: PendingTrigger, targets: TargetChoice[]) {
  const def = s.cards[t.sourceCardId]!;
  const body = withModes(triggerBody(s, t), t.modes);
  s.triggerQueue = s.triggerQueue.filter((x) => x !== t);
  s.stack.push({
    id: `s${s.nextId++}`,
    kind: "ability",
    sourceId: t.sourceId,
    sourceCardId: t.sourceCardId,
    sourceZc: t.sourceZc,
    controller: t.controller,
    description: describeAbility(def, body.text),
    body,
    targets: stampTargets(s, targets),
    modes: t.modes,
    ...(t.cause ? { cause: t.cause } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    ...(t.lki ? { lki: t.lki } : {}),
    ...(t.x ? { x: t.x } : {}),
    ...(t.kicked ? { kicked: t.kicked } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.ifCond ? { ifCond: t.ifCond } : {}),
    ...(t.index >= 0 && triggerOf(s, t)?.event === "state" ? { stateIndex: t.index } : {}),
  });
  log(s, `${def.name}'s ability triggers (${body.text.replace(/~/g, def.name).replace(/\.$/, "")})${describeTargets(s, targets)}.`);
  if (targets.length) fireEvent(s, { type: "targeted", stackId: s.stack[s.stack.length - 1]!.id });
}

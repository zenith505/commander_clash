import type { AbilityBody, BatchTrigger, TargetChoice, TargetSpec, TriggeredAbility, TriggerEvent } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, NO_ABILITIES, withGranted, describeAbility, objIsType, power, toughness } from "../cards";
import { checkAscend, describeTargets, draw, log, obj, opponents, pairable, pairCandidates, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow, type Characteristics } from "../layers";
import { fitMany, withModes } from "../modes";
import { compileCard } from "../oracle";
import type { CardDef, GameObject, ManaType, SpentMana, GameState, LastKnown, ObjectId, PendingTrigger, PlayerId, StackItem, TriggerEventInfo, ZoneMove, ZoneName } from "../types";
import { RulesError } from "../types";
import { spentMeets } from "../mana";
import { nextRandom } from "../rng";
import { evalAmount } from "../amounts";
import { objectMatches, bindChosen, sourceQuality, printedMatches, spellManaValue, spellMatches, stampTargets, hasLegalTargets, legalModes, noteModesChosen, offerTargets, settleDivided } from "./targeting";
import { monarchTrigger } from "./run-basics";
import { initiativeTrigger } from "./run-dungeons";
import { INITIATIVE } from "../oracle";
import { isRingBearer, ringTrigger } from "./run-ring";
import { kickedMatches } from "./run-spells";
import { isSuspended } from "./run-zones";

/** The trigger events for the beginning of a step: on your turn, and on every turn. */
const STEP_TRIGGERS: Partial<Record<Extract<TriggerSourceEvent, { type: "step" }>["step"], [TriggerEvent, TriggerEvent]>> = {
  upkeep: ["yourUpkeep", "eachUpkeep"],
  draw: ["yourDrawStep", "eachDrawStep"],
  end: ["yourEndStep", "eachEndStep"],
  beginCombat: ["yourBeginCombat", "eachBeginCombat"], // CR 507.1
  endCombat: ["yourEndCombat", "eachEndCombat"], // "at end of combat" (CR 511.2)
  main1: ["yourFirstMain", "eachFirstMain"], // CR 505.1a
  main2: ["yourPostcombatMain", "eachPostcombatMain"],
};

/** Who controls the permanent `o` is attached to, if it's attached to one on the battlefield. */
function hostController(s: GameState, o: GameObject): PlayerId | undefined {
  const host = o.zone === "battlefield" && o.attachedTo ? s.objects[o.attachedTo] : undefined;
  return host?.zone === "battlefield" ? controllerOf(s, host) : undefined;
}

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
  /** `sacrificed`: its controller sacrificed it (CR 701.21a). */
  /** An Aura or Equipment that stays on the battlefield became unattached from `host` (moved, or unattached). */
  | { type: "unattached"; id: ObjectId; host: ObjectId }
  /** Another player gained control of it; `from` lost control (CR 603.2, "When you lose control of ~"). */
  | { type: "controlChanged"; id: ObjectId; from: PlayerId }
  | { type: "dies"; to: ZoneName; id: ObjectId; controller: PlayerId; sacrificed?: boolean; hadAbilities: boolean; grantedAbilities?: string[]; counters: Record<string, number>; wasCreature: boolean; power?: number; toughness?: number; /** It as it last existed on the battlefield. */ snapshot?: GameObject; chars?: Characteristics; /** The Auras and Equipment that were attached to it. */ attachments?: ObjectId[] }
  /** Every defending player has declared blockers (CR 509.3). */
  | { type: "blocksDeclared" }
  /** A player gained life (one life-gain event, CR 119.9). */
  | { type: "lifeGained"; player: PlayerId; amount: number }
  /** A player lost life: from damage, an effect, or paying life (one life-loss event, CR 119.2-119.4). */
  | { type: "lifeLost"; player: PlayerId; amount: number }
  /** All the damage dealt to a player at the same time (CR 120.3a): "whenever you're dealt damage". */
  | { type: "playerDealtDamage"; player: PlayerId; amount: number }
  /** A player collected evidence (CR 701.59a), once for each time. */
  | { type: "evidenceCollected"; player: PlayerId }
  | { type: "dungeonCompleted"; player: PlayerId }
  /** A player rolled dice (CR 706): each die that counts (706.6), its natural result and its result. */
  | { type: "diceRolled"; player: PlayerId; sides: number; dice: { natural: number; result: number }[]; result: number }
  | { type: "coinFlipped"; player: PlayerId; won: boolean }
  | { type: "attacks"; id: ObjectId }
  /** A permanent became tapped (CR 701.26a). */
  | { type: "tapped"; id: ObjectId }
  /** Counters were put on a permanent, `amount` of them, on the battlefield or as it entered (CR 122.6). */
  | { type: "countersPut"; id: ObjectId; counter: string; amount: number }
  /** A permanent became monstrous (CR 701.37b), with `x` the N, the X of its "when ~ becomes monstrous" abilities (701.37c). */
  | { type: "becameMonstrous"; id: ObjectId; x: number }
  | { type: "becameLevel"; id: ObjectId; level: number }
  /** A Case became solved (CR 719.3a), under `controller`. */
  | { type: "solved"; id: ObjectId; controller: PlayerId }
  /** An attacker was exerted as it attacked (CR 701.43d). */
  | { type: "exerted"; id: ObjectId; /** By its "you may exert ~ as it attacks" (its "when you do" is linked to that, CR 607.2h). */ attacking?: true }
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
  /** An attacking creature enlisted another by tapping it (CR 702.154c). */
  | { type: "enlists"; id: ObjectId; enlisted: ObjectId }
  | { type: "combatDamageToPlayer"; id: ObjectId; player: PlayerId; amount: number }
  /** A permanent was dealt this much damage, all at the same time (one event however many sources dealt it). */
  | { type: "wasDealtDamage"; id: ObjectId; amount: number }
  /** A permanent dealt damage to a player, in combat or not. */
  /** `source` is the permanent dealing it, or "" for a spell or a gone permanent's ability (CR 120.3); `by` controls it. */
  | { type: "damagedPlayer"; source: ObjectId; by: PlayerId; player: PlayerId; amount: number; combat: boolean }
  /** A permanent dealt damage to a creature (`id`). */
  | { type: "damagedCreature"; source: ObjectId; id: ObjectId; amount: number; combat: boolean }
  /** The Ring tempted a player, who chose `chosen` as their Ring-bearer, if they could choose one (CR 701.54d). */
  | { type: "ringTempted"; player: PlayerId; chosen?: ObjectId }
  /** A source dealt damage: everything it dealt at once is one event (CR 120.3, 603.2c). */
  | { type: "dealtDamage"; id: ObjectId; amount: number; combat: boolean }
  | { type: "step"; step: "upkeep" | "draw" | "main1" | "main2" | "end" | "beginCombat" | "endCombat" | "cleanup"; active: PlayerId }
  /** A spell was just cast (CR 601.2i): "whenever you cast" abilities and prowess. */
  | { type: "cast"; stackId: string; controller: PlayerId; card: CardDef; /** A copy was put on the stack instead (magecraft's "or copy"). */ copy?: boolean; /** The mana spent to cast it (increment, CR 702.191a). */ manaSpent?: number; /** How much of it Treasures made (CR 106.3). */ treasureSpent?: number; /** What was spent, by type (CR 601.2h). */ spent?: SpentMana }
  /** A spell or ability was just put on the stack with its targets: "becomes the target" (CR 601.2c, ward 702.21a). */
  | { type: "targeted"; stackId: string }
  /** A player discarded a card (CR 701.9), `cycled` to pay a cycling cost (CR 702.29a). `id`: the card, in its new zone. */
  | { type: "discarded"; player: PlayerId; id: ObjectId; card: CardDef; cycled?: boolean }
  /** A card (or token) was put into a graveyard, from any zone. */
  | { type: "toGraveyard"; id: ObjectId }
  /** A resolved instant or sorcery card was put into its owner's graveyard (CR 608.2n): haunt on a spell (702.55a). */
  | { type: "resolvedToGraveyard"; id: ObjectId }
  /** A player drew a card, their `nth` this turn (CR 121.2). */
  | { type: "draw"; player: PlayerId; nth: number }
  /** A player activated an ability that isn't a mana ability; its source as it was then, if it was a permanent. */
  | { type: "activated"; player: PlayerId; source?: { snapshot: GameObject; chars: Characteristics }; /** A mana ability (CR 605.1a). */ mana?: true; /** Mana from Treasures spent to activate it (CR 106.3). */ treasure?: number }
  /**
   * A creature exploited `victim` (CR 702.110b). `watchers`: the permanents of its controller with exploit
   * triggers just before the sacrifice, with those abilities, since they look back in time (CR 603.10a).
   */
  | { type: "exploits"; exploiter: ObjectId; controller: PlayerId; victim: GameObject; chars: Characteristics; watchers: { id: ObjectId; triggers: TriggeredAbility[] }[] }
  /** An event (one instruction, one pass of state-based actions, one action's costs) ended, having moved these objects. */
  | { type: "batch"; moves: ZoneMove[] };

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
  return objectMatches(s, bindEnchanted(d.filter, s.objects[srcId]), dying.o, you, false, undefined, dying.c);
}

/** Does `entering` set off `o`'s "whenever a/another/~ or another ... enters" ability? */
function entersMatches(s: GameState, en: NonNullable<TriggeredAbility["enters"]>, o: GameObject, entering: GameObject, you: PlayerId): boolean {
  if (o.id === entering.id) {
    if (en.orSelf) return true;
    if (en.other) return false;
  }
  return objectMatches(s, bindEnchanted(en.filter, o), entering, you, false);
}

/** "A creature enchanted player controls": the player the watching Aura is attached to now. */
function bindEnchanted(spec: TargetSpec, aura: GameObject | undefined): TargetSpec {
  if (spec.controller !== "enchanted" || aura?.attachedToPlayer === undefined) return spec;
  const { controller: _, ...rest } = spec;
  return { ...rest, controlledBy: aura.attachedToPlayer };
}

/** Record every triggered ability that `ev` triggers. They go on the stack the next time a player would get priority. */
/** Dethrone (CR 702.105a): it attacks the player with the most life or tied for most life. */
function attacksMostLife(s: GameState, o: GameObject): boolean {
  if (o.attacking === undefined || o.attackingPermanent) return false; // not when it attacks a planeswalker (rulings)
  const lives = s.turnOrder.map((pid) => s.players[pid]!).filter((p) => !p.lost).map((p) => p.life);
  return s.players[o.attacking]!.life >= Math.max(...lives);
}

/** Training (CR 702.149a): another creature with greater power attacks alongside it. */
function trains(s: GameState, o: GameObject): boolean {
  const mine = power(s, o);
  return s.battlefield.some((id) => id !== o.id && s.objects[id]!.attacking !== undefined && objIsType(s, s.objects[id]!, "Creature") && power(s, s.objects[id]!) > mine);
}

/** The other creatures attacking along with it (battalion): those just declared as attackers with it. */
function othersAttacking(s: GameState, o: GameObject): number {
  return s.battlefield.filter((id) => id !== o.id && s.objects[id]!.attacking !== undefined && objIsType(s, s.objects[id]!, "Creature")).length;
}

export function fireEvent(s: GameState, ev: TriggerSourceEvent) {
  // The Traps look back at what entered this turn, as it entered (after "as it enters" choices, CR 614.12).
  if (ev.type === "enters" && s.objects[ev.id]) {
    const c = characteristics(s, s.objects[ev.id]!);
    ((s.turnLog ??= {}).entered ??= []).push({ controller: c.controller, types: [...c.types], colors: [...c.colors] });
  }
  // While set, `add` is looking at an Aura's or Equipment's abilities about this creature it's attached to.
  let hosting: GameObject | null = null;
  // While set, `add` is looking at the abilities of a card in a graveyard that work there (CR 113.6m).
  let fromYard = false;
  // Torpor Orb: while set, the controllers whose abilities the event can't trigger.
  let locked: ((controller: PlayerId) => boolean) | null = null;
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
    colorsSpent?: number,
  ) => {
    if (locked?.(controller)) return;
    const printed = compileCard(defOf(s, o)).triggers;
    triggers.forEach((t, index) => {
      // "Whenever enchanted creature ..." is about the creature, not the Aura; "~ or equipped creature" about both.
      if (hosting ? !t.host : t.host === "attached") return;
      if ((t.zone === "graveyard") !== fromYard) return;
      // An intervening "if" has to be true for it to trigger at all (CR 603.4).
      // "Max speed — Whenever ...": only while it has the ability (CR 702.178a).
      if (t.activeIf && !staticConditionNow(s, t.activeIf, o.id, controller)) return;
      if (t.oncePerTurn && onceUsed(o, t.zone, t.body.text)) return;
      const once = t.body.effects[0];
      if (once?.type === "may" && once.once && onceUsed(o, t.zone, `do:${once.text}`)) return; // CR 603.2h
      if (pred(t.event, t) && (!t.ifCond || staticConditionNow(s, t.ifCond, o.id, controller, event?.player, event?.amount))) {
        if (t.oncePerTurn) (o.triggeredThisTurn ??= []).push(`${lookingBack(o, t.zone) ? (o.zoneChanges ?? 0) - 1 : (o.zoneChanges ?? 0)}|${t.body.text}`);
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
          ...(colorsSpent ? { colorsSpent } : {}),
          ...(event ? { event } : {}),
        });
      }
    });
  };
  /**
   * The same event for the Auras and Equipment attached to `host` (TriggeredAbility.host): `subject` is the creature
   * by default ("put a +1/+1 counter on it"). `player`: the player it dealt damage to, for "an opponent".
   */
  const addHosted = (host: GameObject, pred: (event: string, t: TriggeredAbility) => boolean, cause?: string, subject: GameObject = host, event?: TriggerEventInfo) => {
    for (const id of s.battlefield) {
      const a = s.objects[id]!;
      if (a.attachedTo !== host.id || id === host.id) continue;
      const you = controllerOf(s, a);
      hosting = host;
      try {
        add(a, you, (e, t) => pred(e, t) && !(t.toOpponent && event?.player === you), undefined, cause, subject, undefined, undefined, undefined, event);
      } finally {
        hosting = null;
      }
    }
  };
  /**
   * The cards in graveyards with abilities that work there, each with its owner, who controls those abilities
   * (CR 113.6m, 113.8); `f` adds the ones that trigger.
   */
  const fromGraveyards = (f: (o: GameObject, owner: PlayerId) => void) => {
    for (const pid of s.turnOrder) {
      if (player(s, pid).lost) continue;
      for (const id of player(s, pid).graveyard) {
        const o = obj(s, id);
        if (!compileCard(defOf(s, o)).triggers.some((t) => t.zone === "graveyard")) continue;
        fromYard = true;
        try {
          f(o, pid);
        } finally {
          fromYard = false;
        }
      }
    }
  };
  if (ev.type === "enters") {
    // Static effects apply as it enters, before checking what triggers (CR 611.3c).
    invalidateCharacteristics(s);
    // So does ascend: the tenth permanent gives the city's blessing before anything else happens (CR 702.131b, d).
    checkAscend(s);
    const entering = obj(s, ev.id);
    const you = controllerOf(s, entering);
    // "Creatures entering don't cause abilities to trigger": the permanent as it entered (rulings), with Torpor Orb on the
    // battlefield, itself entering at the same time included. Replacement effects aren't triggers, so still apply.
    const types = characteristics(s, entering).types;
    const locks = s.battlefield.flatMap((id) => {
      const lock = compileCard(defOf(s, obj(s, id))).enterLock;
      const c = lock && characteristics(s, obj(s, id));
      return lock && c!.hasPrintedAbilities && (!lock.types || lock.types.some((t) => types.includes(t))) ? [{ lock, by: c!.controller }] : [];
    });
    if (locks.length) locked = (ctrl) => locks.some((l) => !l.lock.opponents || l.by !== ctrl);
    (s.zoneBatch ??= []).push({
      id: entering.id,
      zc: entering.zoneChanges ?? 0,
      to: "battlefield",
      owner: entering.owner,
      ...(entering.isToken ? { notCard: true as const } : {}),
      card: cardIdOf(entering),
      controller: you,
      entered: true,
      ...(locks.length ? { locks: locks.map((l) => ({ by: l.by, ...(l.lock.opponents ? { opponents: true } : {}) })) } : {}),
    });
    // Its own enters abilities use the X of the spell it was (CR 107.3m), and know whether it was kicked;
    // "if it was kicked" is an intervening if (CR 603.4), and that can't change by the time it resolves.
    // Evoke's sacrifice trigger only if the evoke cost was paid (CR 702.74a).
    add(
      entering,
      you,
      // Soulbond's intervening if: there's another unpaired creature to pair it with (CR 702.95a, 603.4).
      (e, t) => e === "selfEnters" && (!t.ifKicked || kickedMatches(entering.kicked, t.ifKicked)) && (!t.ifX || (ev.x ?? 0) >= t.ifX) && (!t.ifEvoked || entering.castAlt === "evoke") && (!t.ifAlt || entering.castAlt === t.ifAlt) && (!t.ifBargained || !!entering.bargained) && (!t.ifEvidence || !!entering.evidence) && (!t.ifTreasure || (entering.treasureSpent ?? 0) > 0) && (!t.ifSpent || spentMeets(entering.spent, t.ifSpent)) && (t.ifCastFromHand === undefined || !!entering.castFromHand === t.ifCastFromHand) && (!t.ifCast || !!entering.wasCast) &&  (!t.ifGift || entering.gift !== undefined) && (!t.ifTributeUnpaid || !entering.tribute?.paid) && (!t.ifSoulbond || pairCandidates(s, entering, you).length > 0),
      undefined,
      undefined,
      undefined,
      undefined,
      ev.x,
      entering.kicked,
      // Whom its spell's gift was promised to: "the chosen player" (CR 702.174b).
      entering.gift !== undefined || entering.evidence || entering.treasureSpent || entering.spent || entering.castAlt === "surge" || entering.castAlt === "spectacle"
        ? { ...(entering.gift !== undefined ? { gift: entering.gift } : {}), ...(entering.evidence ? { evidence: true as const } : {}), ...(entering.treasureSpent ? { treasureSpent: entering.treasureSpent } : {}), ...(entering.spent ? { spent: entering.spent } : {}), ...(entering.castAlt === "surge" || entering.castAlt === "spectacle" ? { castAlt: entering.castAlt } : {}) }
        : undefined,
      entering.colorsSpent?.length,
    );
    if (objIsType(s, entering, "Creature")) {
      const lki = { power: power(s, entering), toughness: toughness(s, entering) };
      for (const id of s.battlefield) {
        if (id === ev.id || controllerOf(s, obj(s, id)) !== you) continue;
        const o = obj(s, id);
        // Evolve only triggers if the new creature is bigger in some way (CR 702.100a, 603.4).
        add(o, you, (e, t) => e === "anotherCreatureYouControlEnters" && (!t.ifEvolves || evolves(s, o, lki)) && (!t.ifSoulbond || pairable(s, o, entering, you)), undefined, undefined, entering, lki);
      }
      fromGraveyards((o, owner) => owner === you && add(o, you, (e) => e === "anotherCreatureYouControlEnters", undefined, undefined, entering, lki));
    }
    // Landfall. The land itself sees itself enter too (CR 603.6a).
    if (objIsType(s, entering, "Land")) {
      for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e) => e === "landYouControlEnters");
      fromGraveyards((o, owner) => owner === you && add(o, you, (e) => e === "landYouControlEnters"));
    }
    // "Whenever a creature you control enters", "another Ally", "~ or another artifact": on every permanent,
    // the entering one too, which is the subject ("that creature"). It sees itself enter (CR 603.6a).
    const entersWatch = (o: GameObject, ctrl: PlayerId) => add(o, ctrl, (e, t) => e === "permanentEnters" && !!t.enters && entersMatches(s, t.enters, o, entering, ctrl), undefined, undefined, entering);
    for (const id of s.battlefield) entersWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(entersWatch);
    locked = null;
  } else if (ev.type === "controlChanged") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") add(o, ev.from, (e) => e === "selfLostControl");
  } else if (ev.type === "unattached") {
    const o = s.objects[ev.id];
    const host = s.objects[ev.host];
    if (o?.zone === "battlefield" && host) add(o, controllerOf(s, o), (e) => e === "selfBecomesUnattached", undefined, undefined, host);
  } else if (ev.type === "dies") {
    const o = obj(s, ev.id);
    // Earthbend's "when that land dies or is put into exile" (CR 701.66a): it triggers once, for that object only; gone
    // anywhere else, it never will.
    const was = ev.snapshot?.zoneChanges ?? 0;
    for (const d of [...(s.delayed ?? [])]) {
      if (d.when !== "leaves" || d.subject.id !== ev.id || d.subject.zc !== was) continue;
      s.delayed = s.delayed!.filter((x) => x !== d);
      if (d.to?.includes(ev.to)) s.triggerQueue.push({ sourceId: ev.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: { id: ev.id, zc: o.zoneChanges ?? 0 }, body: d.body });
    }
    // Persist and undying: "if it had no -1/-1 counters on it" (an intervening if, CR 603.4; last known information).
    add(
      o,
      ev.controller,
      (e, t) =>
        (((e === "selfDies" && ev.wasCreature) || (e === "selfToGraveyard" && (!t.ownGraveyard || ev.controller === o.owner))) && ev.to === "graveyard" && !(t.ifNoCounter && (t.ifNoCounter === "any" ? Object.values(ev.counters).some((n) => n > 0) : (ev.counters[t.ifNoCounter] ?? 0) > 0))) ||
        (e === "selfDiesOrExiled" && (ev.to === "graveyard" || ev.to === "exile")) ||
        e === "selfLeaves" ||
        e === "selfLostControl",
      withGranted(ev.hadAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, ev.grantedAbilities ?? []).triggers,
      undefined,
      undefined,
      { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) },
    );
    // "Whenever ~ becomes unattached from a permanent": it left while attached (looking back in time, CR 603.10a), or what
    // was attached to it stayed.
    const host = ev.snapshot?.attachedTo ? s.objects[ev.snapshot.attachedTo] : undefined;
    if (host) add(o, ev.controller, (e) => e === "selfBecomesUnattached", withGranted(ev.hadAbilities ? compileCard(defOf(s, o)) : NO_ABILITIES, ev.grantedAbilities ?? []).triggers, undefined, host);
    for (const a of ev.attachments ?? []) {
      const att = s.objects[a];
      if (att?.zone === "battlefield") add(att, controllerOf(s, att), (e) => e === "selfBecomesUnattached", undefined, undefined, o);
    }
    // "When the creature ~ haunts dies": the cards in exile haunting it as it was on the battlefield (CR 702.55b-c),
    // under their owners' control (CR 108.4a, 113.8). Dying means going to a graveyard, creature or not (CR 700.4).
    if (ev.to === "graveyard")
      for (const pid of s.turnOrder) {
        if (player(s, pid).lost) continue;
        for (const id of player(s, pid).exile) {
          const card = obj(s, id);
          if (card.haunting?.id === ev.id && card.haunting.zc === was) add(card, pid, (e) => e === "hauntedDies", compileCard(defOf(s, card)).triggers);
        }
      }
    // "Whenever another creature dies", "a creature you control", "equipped creature": abilities of permanents
    // on the battlefield, and of ones leaving at the same time, which look back in time (CR 603.10a).
    // "Whenever a creature you control leaves the battlefield" (and "without dying"): the same, wherever it went.
    if (ev.snapshot && ev.chars) {
      const lki = { counters: ev.counters, copyKey: cardIdOf(ev.snapshot), controller: ev.controller, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) };
      const dying = { o: ev.snapshot, c: ev.chars };
      const hadCounter = Object.values(ev.counters).some((n) => n > 0);
      const went = (d: NonNullable<TriggeredAbility["dies"]>) => (d.leaves ? !(d.notDies && ev.to === "graveyard") : ev.to === "graveyard") && (!d.hadCounter || hadCounter);
      const consider = (src: GameObject, ctrl: PlayerId, attachedTo: ObjectId | undefined, triggers?: TriggeredAbility[]) =>
        add(src, ctrl, (e, t) => e === "permanentDies" && !!t.dies && went(t.dies) && diesMatches(s, t.dies, src.id, attachedTo, dying, ctrl), triggers, undefined, o, lki);
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
    // "Whenever you sacrifice another permanent": the permanents of the player who sacrificed it, and the ones leaving at
    // the same time (CR 603.10a), whatever zone it went to.
    if (ev.sacrificed && ev.snapshot && ev.chars) {
      const lki = { counters: ev.counters, copyKey: cardIdOf(ev.snapshot), controller: ev.controller, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) };
      const dying = { o: ev.snapshot, c: ev.chars };
      const consider = (src: GameObject, triggers?: TriggeredAbility[]) =>
        add(src, ev.controller, (e, t) => e === "youSacrifice" && !!t.sacrifices && diesMatches(s, t.sacrifices, src.id, undefined, dying, ev.controller), triggers, undefined, o, lki);
      for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === ev.controller) consider(obj(s, id));
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src || src.zone === "battlefield" || left.controller !== ev.controller) continue;
        consider(src, withGranted(left.hadAbilities ? compileCard(defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
      }
    }
  } else if (ev.type === "blocksDeclared") {
    // "Blocks" and "becomes blocked" trigger once each; "blocks a creature" / "becomes blocked by a creature"
    // once for each such creature, which is the trigger's subject (CR 509.3c-d).
    const fits = (t: TriggeredAbility, subject: GameObject, you: PlayerId) => !t.subjectFilter || objectMatches(s, t.subjectFilter, subject, you, false);
    // "Whenever a creature blocks", "whenever a creature you control becomes blocked": every permanent watching for it,
    // once for each such creature.
    const watchers = s.battlefield.map((id) => obj(s, id));
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const event = o.blocking ? "creatureBlocks" : o.attacking !== undefined && o.blockedBy?.length ? "creatureBecomesBlocked" : undefined;
      if (event) for (const w of watchers) add(w, controllerOf(s, w), (e, t) => e === event && fits(t, o, controllerOf(s, w)), undefined, undefined, o);
    }
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (o.blocking) {
        // Blocking several creatures, "blocks" still triggers once; "blocks a creature" once for each (CR 509.3a-b).
        add(o, you, (e) => e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks");
        addHosted(o, (e) => e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks");
        for (const a of o.blocking) {
          const at = s.objects[a];
          if (at) add(o, you, (e, t) => (e === "selfBlocksCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, at, you), undefined, undefined, at);
        }
      }
      // "Whenever ~ attacks and isn't blocked": no creature was declared to block it (rulings).
      if (o.attacking !== undefined && !o.blockedBy) {
        add(o, you, (e) => e === "selfAttacksUnblocked", undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        addHosted(o, (e) => e === "selfAttacksUnblocked", undefined, o, { player: o.attacking });
      }
      if (o.attacking !== undefined && o.blockedBy?.length) {
        // "Defending player" (afflict) is the player it's attacking.
        add(o, you, (e) => e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked", undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        addHosted(o, (e) => e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked", undefined, o, { player: o.attacking });
        const bearer = isRingBearer(s, o);
        for (const b of o.blockedBy) {
          const bl = s.objects[b];
          if (bl) add(o, you, (e, t) => (e === "selfBlockedByCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, bl, you), undefined, undefined, bl);
          // "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices
          // it at end of combat" (CR 701.54c).
          if (bl && bearer) ringTrigger(s, you, 1, bl);
        }
      }
    }
  } else if (ev.type === "lifeGained") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youGainLife", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
  } else if (ev.type === "diceRolled") {
    // "Whenever you roll one or more dice" once for the roll; "whenever you roll a 4 or higher" once for each die that
    // is (Mr. House rulings; Netherese Puzzle-Ward rulings: "that many times").
    const watch = (o: GameObject) => {
      add(o, ev.player, (e) => e === "youRollDice", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.result });
      for (const d of ev.dice)
        add(o, ev.player, (e, t) => e === "youRollDie" && (t.rolls?.min === undefined || d.result >= t.rolls.min) && (t.rolls?.natural === undefined || d.natural === (t.rolls.natural === "max" ? ev.sides : t.rolls.natural)), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: d.result });
    };
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) watch(o);
    }
    // "When you roll a natural 20, return ~ from your graveyard to your hand" (Critical Hit, CR 113.6m).
    fromGraveyards((o, owner) => owner === ev.player && watch(o));
  } else if (ev.type === "coinFlipped") {
    // "Whenever you win a coin flip" (its controller's), "whenever a player wins a coin flip" (anyone's): once per flip.
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e) => (you === ev.player && e === (ev.won ? "youWinFlip" : "youLoseFlip")) || (ev.won && e === "playerWinsFlip"), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "dungeonCompleted") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youCompleteDungeon", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "evidenceCollected") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youCollectEvidence", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "lifeLost") {
    // Every other player is an opponent (CR 102.3); "that player" is the one who lost life, "that much" how much.
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (you !== ev.player) add(o, you, (e) => e === "opponentLosesLife", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
    speedTrigger(s, ev.player);
  } else if (ev.type === "playerDealtDamage") {
    // "That many" is the damage; "they" and "that player" the player dealt it. An Aura's controller controls its ability.
    const info = { player: ev.player, amount: ev.amount };
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e) => (e === "youAreDealtDamage" && you === ev.player) || (e === "opponentIsDealtDamage" && you !== ev.player) || (e === "enchantedPlayerDealtDamage" && o.attachedToPlayer === ev.player), undefined, undefined, undefined, undefined, undefined, undefined, info);
    }
  } else if (ev.type === "ringTempted") {
    // "Whenever the Ring tempts you" (CR 701.54d), "if you chose a creature other than ~ as your Ring-bearer" (CR 603.4);
    // "whenever you choose a creature as your Ring-bearer".
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== ev.player) continue;
      add(o, ev.player, (e, t) => (e === "ringTemptsYou" && (!t.ifOtherBearer || (ev.chosen !== undefined && ev.chosen !== o.id))) || (e === "youChooseRingBearer" && ev.chosen !== undefined));
    }
  } else if (ev.type === "tapped") {
    // "Whenever ~ becomes tapped", "whenever enchanted land becomes tapped", "whenever a Dwarf you control becomes
    // tapped" (the tapped permanent is the subject: "put a wind counter on it").
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesTapped");
    addHosted(o, (e) => e === "selfBecomesTapped");
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentBecomesTapped" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false), undefined, undefined, o);
    }
  } else if (ev.type === "countersPut") {
    // "Whenever one or more +1/+1 counters are put on ~ / on a creature you control": "that many" is how many.
    const o = obj(s, ev.id);
    const kindOk = (t: TriggeredAbility) => t.countersKind === undefined || t.countersKind === ev.counter;
    const info = { amount: ev.amount };
    add(o, controllerOf(s, o), (e, t) => e === "selfCountersPut" && kindOk(t), undefined, undefined, undefined, undefined, undefined, undefined, info);
    // Chapter abilities: "if the number of lore counters on it was less than N and became at least N" (CR 714.2b).
    // With read ahead, the turn it entered only the chapter it has exactly that many lore counters for (CR 702.155a).
    if (ev.counter === "lore" && o.zone === "battlefield") {
      const after = o.counters.lore ?? 0;
      const before = after - ev.amount;
      const readAhead = !!compileCard(defOf(s, o)).readAhead && characteristics(s, o).hasPrintedAbilities && o.enteredTurn === s.turn;
      const from = s.triggerQueue.length;
      add(o, controllerOf(s, o), (e, t) => e === "chapter" && before < t.chapter! && t.chapter! <= after && (!readAhead || t.chapter === after));
      for (const t of s.triggerQueue.slice(from)) t.chapter = true;
    }
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentCountersPut" && kindOk(t) && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false) && !(t.tappedFilter.notSource && id === o.id), undefined, undefined, o, undefined, undefined, undefined, info);
    }
  } else if (ev.type === "exerted") {
    // Exert's linked "When you do" (CR 607.2h), and "whenever you exert a creature" (the creature is the subject).
    const o = obj(s, ev.id);
    const you = controllerOf(s, o);
    if (ev.attacking) add(o, you, (e) => e === "selfExerted");
    for (const id of s.battlefield) {
      const w = obj(s, id);
      if (controllerOf(s, w) === you) add(w, you, (e) => e === "youExert", undefined, undefined, o);
    }
  } else if (ev.type === "becameLevel") {
    // "When this Class becomes level 2": an ability it has from that level on (CR 716.2a), so it has it now.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e, t) => e === "selfBecomesLevel" && t.level === ev.level);
  } else if (ev.type === "becameMonstrous") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesMonstrous", undefined, undefined, undefined, undefined, ev.x);
  } else if (ev.type === "turnedFaceUp") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfTurnedFaceUp");
  } else if (ev.type === "attacks") {
    const o = obj(s, ev.id);
    // Is it attacking `pid` ("attacks you"), or them or a planeswalker they control (CR 506.2: `attacking` is then the
    // planeswalker's controller)?
    const attackingYou = (a: GameObject, pid: PlayerId) => ({ player: a.attacking === pid && !a.attackingPermanent, orPlaneswalker: a.attacking === pid });
    // "Defending player" is the player it attacked as it became an attacking creature (myriad rulings).
    add(o, controllerOf(s, o), (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.attacksPlayer || !o.attackingPermanent) && (!t.firstAttack || o.attacked?.n === 1) && (!t.training || trains(s, o)) && (!t.withOthers || othersAttacking(s, o) >= t.withOthers), undefined, undefined, undefined, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
    addHosted(o, (e) => e === "selfAttacks" || e === "selfAttacksOrBlocks", undefined, o, o.attacking !== undefined ? { player: o.attacking } : undefined);
    // "Whenever a creature you control attacks": each permanent its controller controls that watches for one (CR 508.3a).
    const by = controllerOf(s, o);
    // "Whenever a creature attacks": anyone's, for the watcher's controller.
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      const at = attackingYou(o, wc);
      add(w, wc, (e, t) => e === "creatureYouControlAttacks" && !!t.attacker && (wc === by || !!t.attacker.anyone) && !(t.attacker.other && w.id === o.id) && (!t.attacker.attacksYou || at[t.attacker.attacksYou]) && objectMatches(s, t.attacker.filter, o, wc, false), undefined, undefined, o, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
    }
    // "Whenever your Ring-bearer attacks, draw a card, then discard a card" (CR 701.54c).
    if (isRingBearer(s, o)) ringTrigger(s, controllerOf(s, o), 0);
    // "Whenever a creature attacks enchanted player": not one attacking a planeswalker of theirs (rulings).
    if (o.attacking !== undefined && !o.attackingPermanent)
      for (const id of s.battlefield) {
        const aura = obj(s, id);
        if (aura.attachedToPlayer === o.attacking) add(aura, controllerOf(s, aura), (e) => e === "creatureAttacksEnchantedPlayer", undefined, undefined, o);
      }
  } else if (ev.type === "groupAttack" || ev.type === "groupCombatDamage") {
    const want = ev.type === "groupAttack" ? "creaturesYouControlAttack" : "creaturesYouControlDealCombatDamageToPlayer";
    const groupWatch = (o: GameObject) => {
      // Only the creatures that match count ("one or more Rogues you control"): "that much" is what they dealt.
      const fits = (t: TriggeredAbility) => ev.ids.map((x, i) => [x, i] as const).filter(([x]) => s.objects[x] && (!t.group || objectMatches(s, t.group, obj(s, x), ev.controller, false)));
      for (const t of abilitiesOf(s, o).triggers) {
        if (t.event !== want) continue;
        const hit = fits(t);
        if (hit.length < (t.minAttackers ?? 1)) continue;
        const amount = ev.type === "groupCombatDamage" ? hit.reduce((n, [, i]) => n + ev.amounts[i]!, 0) : undefined;
        const same = (tt: TriggeredAbility) => tt.event === want && tt.body.text === t.body.text && JSON.stringify(tt.group) === JSON.stringify(t.group) && tt.minAttackers === t.minAttackers;
        add(o, ev.controller, (_, tt) => same(tt), undefined, undefined, undefined, undefined, undefined, undefined, ev.type === "groupCombatDamage" ? { player: ev.player, amount } : undefined);
      }
    };
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === ev.controller) groupWatch(obj(s, id));
    fromGraveyards((o, owner) => owner === ev.controller && groupWatch(o));
    // "Whenever enchanted player is attacked": once, however many creatures attack them; not for a planeswalker (rulings).
    if (ev.type === "groupAttack") {
      const attacked = new Set(ev.ids.map((x) => s.objects[x]).filter((a) => a?.attacking !== undefined && !a.attackingPermanent).map((a) => a!.attacking!));
      for (const id of s.battlefield) {
        const aura = obj(s, id);
        if (aura.attachedToPlayer !== undefined && attacked.has(aura.attachedToPlayer))
          add(aura, controllerOf(s, aura), (e) => e === "enchantedPlayerAttacked", undefined, undefined, undefined, undefined, undefined, undefined, { player: aura.attachedToPlayer });
      }
    }
  } else if (ev.type === "lastCounterRemoved") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield" && ev.counter === "time") add(o, controllerOf(s, o), (e) => e === "selfLastTimeCounterRemoved");
    // Suspend's third ability (CR 702.62a), whatever removed the counter (rulings): its owner may cast it.
    if (o?.zone === "exile" && ev.counter === "time" && compileCard(defOf(s, o)).suspend)
      s.triggerQueue.push({
        sourceId: o.id,
        sourceCardId: cardIdOf(o),
        controller: o.owner,
        index: -1,
        subject: { id: o.id, zc: o.zoneChanges ?? 0 },
        body: { targets: [], effects: [{ type: "suspendCast" }], text: "Suspend: the last time counter was removed from ~. You may cast it without paying its mana cost." },
      });
  } else if (ev.type === "enlists") {
    // Enlist's "when you do" (CR 702.154a) and "whenever ~ enlists a creature": that creature is the subject.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfEnlists", undefined, undefined, obj(s, ev.enlisted));
  } else if (ev.type === "attacksAlone") {
    // Exalted: each permanent its controller controls with exalted triggers (CR 702.83a).
    const attacker = obj(s, ev.id);
    const you = controllerOf(s, attacker);
    const that = attacker.attacking !== undefined ? { player: attacker.attacking } : undefined;
    add(attacker, you, (e) => e === "selfAttacksAlone", undefined, undefined, undefined, undefined, undefined, undefined, that);
    addHosted(attacker, (e) => e === "selfAttacksAlone", undefined, attacker, that);
    for (const id of s.battlefield)
      if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e, t) => e === "creatureYouControlAttacksAlone" && (!t.subjectFilter || objectMatches(s, t.subjectFilter, attacker, you, false)), undefined, undefined, attacker, undefined, undefined, undefined, that);
  } else if (ev.type === "dealtDamage") {
    // Its abilities work only on the battlefield; a spell or a card that left isn't "~" any more.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") {
      add(o, controllerOf(s, o), (e) => e === "selfDealsDamage" || (ev.combat && e === "selfDealsCombatDamage"), undefined, undefined, undefined, undefined, undefined, undefined, { amount: ev.amount });
      addHosted(o, (e) => e === "selfDealsDamage" || (ev.combat && e === "selfDealsCombatDamage"), undefined, o, { amount: ev.amount });
    }
  } else if (ev.type === "damagedPlayer") {
    // "Whenever ~ deals damage to a player / an opponent": once for each player dealt damage (CR 603.2c).
    const o = s.objects[ev.source];
    const info = { player: ev.player, amount: ev.amount };
    if (o?.zone === "battlefield") {
      const you = controllerOf(s, o);
      add(o, you, (e, t) => e === "selfDealsDamageToPlayer" && !(t.toOpponent && ev.player === you), undefined, undefined, undefined, undefined, undefined, undefined, info);
      addHosted(o, (e) => e === "selfDealsDamageToPlayer", undefined, o, info);
    }
    // "Whenever a creature deals damage to you", "Whenever a source an opponent controls deals damage to you": the damaged
    // player's permanents, once for each source. A permanent source is the subject; whose source it is, the event player.
    const fromPermanent = o?.zone === "battlefield" ? o : undefined;
    for (const id of s.battlefield) {
      const w = obj(s, id);
      if (controllerOf(s, w) !== ev.player) continue;
      const fits = (t: TriggeredAbility) => {
        const d = t.damagesYou;
        if (!d || (d.combat && !ev.combat)) return false;
        if (d.by) return d.by === "any" || (d.by === "you") === (ev.by === ev.player);
        return !!fromPermanent && (!t.subjectFilter || objectMatches(s, t.subjectFilter, fromPermanent, ev.player, false));
      };
      add(w, ev.player, (e, t) => e === "dealsDamageToYou" && fits(t), undefined, undefined, fromPermanent, undefined, undefined, undefined, { player: ev.by, amount: ev.amount });
    }
  } else if (ev.type === "damagedCreature") {
    const o = s.objects[ev.source];
    const hit = s.objects[ev.id];
    if (o?.zone === "battlefield" && hit) {
      add(o, controllerOf(s, o), (e) => e === "selfDealsDamageToCreature" || (ev.combat && e === "selfDealsCombatDamageToCreature"), undefined, undefined, hit, undefined, undefined, undefined, { amount: ev.amount });
      addHosted(o, (e) => e === "selfDealsDamageToCreature" || (ev.combat && e === "selfDealsCombatDamageToCreature"), undefined, hit, { amount: ev.amount });
    }
  } else if (ev.type === "wasDealtDamage") {
    // "Whenever ~ is dealt damage", "When enchanted creature is dealt damage": it's still on the battlefield as the
    // damage is dealt, before state-based actions (CR 704.3), so it triggers even if the damage destroys it.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") {
      add(o, controllerOf(s, o), (e) => e === "selfIsDealtDamage", undefined, undefined, o, undefined, undefined, undefined, { amount: ev.amount });
      addHosted(o, (e) => e === "selfIsDealtDamage", undefined, o, { amount: ev.amount });
    }
  } else if (ev.type === "combatDamageToPlayer") {
    const o = obj(s, ev.id);
    const info = { player: ev.player, amount: ev.amount };
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && !(t.ifNotRenowned && o.renowned) && !(t.toOpponent && ev.player === controllerOf(s, o)), undefined, undefined, undefined, undefined, undefined, undefined, info);
    addHosted(o, (e) => e === "selfDealsCombatDamageToPlayer", undefined, o, info);
    // "Whenever a creature you control deals combat damage to a player": the creature is the subject.
    const dealerBy = controllerOf(s, o);
    for (const id of s.battlefield) {
      const w = obj(s, id);
      if (controllerOf(s, w) !== dealerBy) continue;
      add(w, dealerBy, (e, t) => e === "creatureYouControlDealsCombatDamageToPlayer" && !!t.dealer && !(t.dealer.other && w.id === o.id) && objectMatches(s, t.dealer.filter, o, dealerBy, false) && !(t.toOpponent && ev.player === dealerBy), undefined, undefined, o, undefined, undefined, undefined, info);
    }
    // "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch" (CR 725.2).
    if (ev.player === s.monarch && objIsType(s, o, "Creature")) monarchTrigger(s, 1, o);
    // "Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the
    // controller of those creatures takes the initiative" (CR 726.2): once for each such player in a damage step.
    const by = controllerOf(s, o);
    if (ev.player === s.initiative && objIsType(s, o, "Creature") && !s.triggerQueue.some((t) => t.sourceCardId === INITIATIVE.oracleId && t.index === 1 && t.event?.player === by))
      initiativeTrigger(s, 1, s.initiative, by);
    // "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life" (CR 701.54c).
    if (isRingBearer(s, o)) ringTrigger(s, controllerOf(s, o), 2);
  } else if (ev.type === "cast") {
    // "When you cast this spell" abilities work from the stack (CR 702.85a, 603.2).
    const item = s.stack.find((x) => x.id === ev.stackId);
    const spell = item?.objectId ? s.objects[item.objectId] : undefined;
    // "When you next cast ... this turn": once, for the first such spell (CR 603.7c).
    for (const d of ev.copy ? [] : [...(s.nextCast ?? [])]) {
      if (d.controller !== ev.controller || d.turn !== s.turn || !printedMatches(d.filter, ev.card)) continue;
      s.nextCast = s.nextCast!.filter((x) => x !== d);
      // "Has cascade": the spell's own cascade ability triggers (CR 702.85a).
      if (d.cascade && spell) s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: CASCADE_BODY, cause: ev.stackId });
      else if (!d.cascade) s.triggerQueue.push({ sourceId: d.sourceId, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, body: d.body, cause: ev.stackId });
    }
    // Casualty's copy only if its casualty cost was paid (CR 702.153a).
    if (spell && !ev.copy) add(spell, ev.controller, (e, t) => e === "selfCast" && (!t.ifCasualty || !!item?.casualty) && (!t.ifConspired || !!item?.conspired), compileCard(defOf(s, spell)).triggers, ev.stackId, undefined, undefined, item?.x, item?.kicked);
    // Cascade a permanent gives the spells its controller casts: the spell's own ability, one for each (CR 702.85a, 702.85c).
    if (spell && item && !ev.copy) for (const _ of grantedCascades(s, item, spell, ev.controller)) s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: CASCADE_BODY, cause: ev.stackId });
    const castWatch = (o: GameObject, you: PlayerId) =>
      add(o, you, (e, t) => {
        if (e !== "castSpell" || !t.cast || (ev.copy && !t.cast.orCopy)) return false;
        const by = t.cast.by;
        if ((by === "you" && ev.controller !== you) || (by === "opponent" && ev.controller === you) || (by === "enchanted" && o.attachedToPlayer !== ev.controller)) return false;
        // Its caster's spells this turn, this one included (it was counted as it was cast).
        if (t.cast.nth && (s.castThisTurn ?? []).filter((c) => c.player === ev.controller).length !== t.cast.nth) return false;
        if (t.cast.treasure && !(ev.treasureSpent && !ev.copy)) return false;
        // "If at least four mana was spent to cast it" (CR 603.4): a copy wasn't cast, so nothing was spent on it.
        // "If {S} of any of that spell's colors was spent": its colors as it was cast.
        if (t.cast.spent && !spentMeets(ev.copy ? undefined : ev.spent, t.cast.spent, spell ? characteristics(s, spell).colors : ev.card.colors)) return false;
        // As the spell is on the stack: its mana value with X (CR 202.3e), its power from a "*" ability (604.3).
        const spec = bindChosen(t.cast.spell, o.chosen);
        return item?.objectId ? spellMatches(s, spec, item) : printedMatches(spec, ev.card);
      }, undefined, ev.stackId, undefined, spell ? { copyKey: cardIdOf(spell) } : undefined, undefined, undefined, { player: ev.controller, ...(ev.manaSpent !== undefined ? { amount: ev.manaSpent } : {}), ...(ev.treasureSpent ? { treasureSpent: ev.treasureSpent } : {}), ...(ev.spent && !ev.copy ? { spent: ev.spent } : {}) }); // "counter it unless" that player pays" acts on the spell cast
    for (const id of s.battlefield) castWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(castWatch);
    // Heroic: "Whenever you cast a spell that targets ~", once however many of its targets name it.
    const targeted = new Set(ev.copy ? [] : (item?.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])));
    for (const id of targeted) {
      const o = s.objects[id];
      if (o?.zone === "battlefield" && controllerOf(s, o) === ev.controller) add(o, ev.controller, (e) => e === "selfTargetedByYourSpell", undefined, ev.stackId);
    }
  } else if (ev.type === "targeted") {
    // Each permanent becomes the target once, however many of the item's targets name it.
    const item = s.stack.find((x) => x.id === ev.stackId);
    // Committing a crime (CR 700.13): casting a spell, activating an ability or putting a triggered ability on the stack
    // that targets an opponent, a permanent, spell or ability an opponent controls, or a card in an opponent's graveyard.
    // Once for the spell or ability, however many of its targets do.
    if (item && isCrime(s, item)) {
      const criminal = item.controller;
      player(s, criminal).crimeTurn = s.turn;
      const that = { player: criminal };
      const crime = (o: GameObject, wc: PlayerId) => add(o, wc, (e) => (e === "youCommitCrime" && wc === criminal) || (e === "opponentCommitsCrime" && wc !== criminal), undefined, ev.stackId, undefined, undefined, undefined, undefined, that);
      for (const id of s.battlefield) crime(obj(s, id), controllerOf(s, obj(s, id)));
      fromGraveyards(crime);
    }
    const seen = new Set<ObjectId>();
    for (const t of item?.targets ?? []) {
      if (t.kind !== "object" || seen.has(t.id)) continue;
      seen.add(t.id);
      const o = s.objects[t.id];
      if (!o || o.zone !== "battlefield") continue;
      const you = controllerOf(s, o);
      const by = item!.controller;
      // Who targeted it earlier this turn (each player once is enough to know what's a first time).
      const before = o.targetedThisTurn?.turn === s.turn ? o.targetedThisTurn.by : [];
      o.targetedThisTurn = { turn: s.turn, by: before.includes(by) ? before : [...before, by] };
      // "Of a spell", "you control", "an opponent controls", "for the first time each turn" (counting those it names).
      const fits = (tr: TriggeredAbility, watcher: PlayerId) => {
        const w = tr.targeted;
        if (!w) return true;
        if (w.spell && item!.kind !== "spell") return false;
        const mine = (p: PlayerId) => (w.by === "you" ? p === watcher : w.by === "opponent" ? p !== watcher : true);
        if (!mine(by)) return false;
        return !w.first || !before.some(mine);
      };
      const that = { player: by };
      add(o, you, (e, tr) => (e === "becomesTargetOfOpponent" && you !== by) || (e === "selfBecomesTarget" && fits(tr, you)), undefined, ev.stackId, undefined, undefined, undefined, undefined, that);
      addHosted(o, (e) => e === "selfBecomesTarget", ev.stackId);
      for (const id of s.battlefield) {
        const w = obj(s, id);
        const wc = controllerOf(s, w);
        add(w, wc, (e, tr) => e === "permanentBecomesTarget" && fits(tr, wc) && !(tr.targeted?.other && w.id === o.id) && (!tr.subjectFilter || objectMatches(s, tr.subjectFilter, o, wc, false)), undefined, ev.stackId, o, undefined, undefined, undefined, that);
      }
    }
  } else if (ev.type === "exploits") {
    const lki = { power: ev.chars.power, toughness: ev.chars.toughness };
    for (const w of ev.watchers) {
      const o = s.objects[w.id];
      if (!o) continue;
      add(
        o,
        ev.controller,
        (e, t) =>
          (e === "selfExploits" && w.id === ev.exploiter) ||
          (e === "creatureYouControlExploits" && (!t.subjectFilter || objectMatches(s, t.subjectFilter, ev.victim, ev.controller, false, undefined, ev.chars))),
        w.triggers,
        undefined,
        ev.victim,
        lki,
      );
    }
  } else if (ev.type === "toGraveyard") {
    // "When ~ is put into a graveyard from anywhere": the card's ability, in the graveyard (CR 603.6c).
    const card = s.objects[ev.id];
    if (card?.zone === "graveyard") add(card, card.owner, (e) => e === "selfToGraveyardAnywhere", compileCard(defOf(s, card)).triggers);
  } else if (ev.type === "resolvedToGraveyard") {
    // Haunt on an instant or sorcery: "When this spell is put into a graveyard during its resolution" (CR 702.55a). It
    // triggers in the graveyard, where the card has no controller, so its owner controls it (CR 108.4a, 113.8).
    const card = s.objects[ev.id];
    if (card?.zone === "graveyard") add(card, card.owner, (e) => e === "selfResolvedToGraveyard", compileCard(defOf(s, card)).triggers);
  } else if (ev.type === "discarded") {
    const card = s.objects[ev.id];
    const moved = card && s.zoneBatch?.find((m) => m.id === ev.id && m.zc === (card.zoneChanges ?? 0));
    if (moved) moved.discardedBy = ev.player;
    else if (card) (s.zoneBatch ??= []).push({ id: ev.id, zc: card.zoneChanges ?? 0, from: "hand", to: card.zone, owner: card.owner, card: card.cardId, discardedBy: ev.player });
    // "Whenever you discard a card", "whenever a player cycles a card": once for each card (CR 603.2c). "That player" is
    // the one who discarded.
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        const d = t.discards;
        if (e !== "playerDiscards" || !d) return false;
        if ((d.by === "you" && ev.player !== you) || (d.by === "opponent" && ev.player === you)) return false;
        if ((d.cycled && !ev.cycled) || (d.other && ev.id === o.id)) return false;
        return !d.filter || printedMatches(d.filter, ev.card);
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
    // "When you cycle ~" works from the zone the card went to (CR 702.29c), and its owner controls it (CR 113.8).
    if (ev.cycled && card && card.zone !== "battlefield") add(card, card.owner, (e) => e === "selfCycled", compileCard(defOf(s, card)).triggers);
  } else if (ev.type === "activated") {
    // "Whenever an opponent activates an ability of a creature that isn't a mana ability" (its source as it was activated).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        // Vazi: "Whenever an opponent casts a spell or activates an ability, if mana from a Treasure was spent to ...".
        if (e === "castSpell" && t.cast?.orActivates) return !!ev.treasure && (t.cast.by !== "opponent" || ev.player !== you) && (t.cast.by !== "you" || ev.player === you);
        const a = t.activates;
        if (e !== "abilityActivated" || !a || ev.mana || (a.by === "opponent" && ev.player === you)) return false;
        return !a.of || (!!ev.source && objectMatches(s, a.of, ev.source.snapshot, you, false, undefined, ev.source.chars));
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "draw") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        if (e !== "playerDraws" || !t.draws) return false;
        const by = t.draws.by;
        if ((by === "you" && ev.player !== you) || (by === "opponent" && ev.player === you) || (by === "enchanted" && o.attachedToPlayer !== ev.player)) return false;
        return t.draws.nth === undefined || t.draws.nth === ev.nth;
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "batch") {
    // "One or more" triggers: once for the whole event, if anything it moved matches (CR 603.2c). Leaving the battlefield
    // or a graveyard looks back in time (CR 603.10a): permanents leaving at the same time see it, as they were, and ones
    // that just arrived don't.
    const arrived = new Set(ev.moves.filter((m) => m.to === "battlefield").map((m) => `${m.id}@${m.zc}`));
    const lookBack = (b: BatchTrigger) => b.what === "leaves" || b.what === "leavesGraveyard";
    const batchWatch = (w: GameObject, you: PlayerId, triggers: TriggeredAbility[], gone: boolean) => {
      for (const t of triggers) {
        if (t.event !== "batch" || !t.batch) continue;
        const b = t.batch;
        if (gone ? !lookBack(b) : lookBack(b) && arrived.has(`${w.id}@${w.zoneChanges ?? 0}`)) continue;
        const matched = ev.moves.filter((m) => batchMoveMatches(s, b, m, w, you, gone));
        const n = matched.length;
        if (!n) continue;
        // Satoru: not if any of them was cast with mana spent on it (rulings: mana for additional costs counts too).
        if (b.noneCastWithMana && matched.some((m) => s.objects[m.id]?.wasCast && (s.objects[m.id]!.manaSpent ?? 0) > 0)) continue;
        if (b.first && b.what === "discards" && (s.turnLog?.discards ?? []).some((d) => (b.whose !== "you" || d.player === you) && d.cards.some((c) => !b.filter || printedMatches(b.filter, s.cards[c]!)))) continue;
        add(w, you, (_, tt) => tt === t, triggers, undefined, undefined, undefined, undefined, undefined, { amount: n, ...(b.whose === "you" ? { player: you } : {}) });
      }
    };
    for (const id of s.battlefield) {
      const w = obj(s, id);
      batchWatch(w, controllerOf(s, w), abilitiesOf(s, w).triggers, false);
    }
    for (const m of ev.moves) {
      const w = s.objects[m.id];
      if (!w || m.from !== "battlefield" || !m.snapshot || w.zone === "battlefield") continue; // back already: a new object
      batchWatch(w, m.controller!, withGranted(m.hadAbilities ? compileCard(s.cards[m.card]!) : NO_ABILITIES, m.granted ?? []).triggers, true);
    }
    // "For the first time each turn" looks at the events before this one.
    const discards = new Map<PlayerId, string[]>();
    for (const m of ev.moves) if (m.discardedBy !== undefined) discards.set(m.discardedBy, [...(discards.get(m.discardedBy) ?? []), m.card]);
    for (const [player, cards] of discards) ((s.turnLog ??= {}).discards ??= []).push({ player, cards });
  } else if (ev.type === "step") {
    // Delayed triggers whose moment this is (CR 603.7): each triggers once.
    for (const d of [...(s.delayed ?? [])]) {
      // Made during that step, "the next end step" or "end of combat" is a later one (CR 603.7c, 511.2).
      // "The next cleanup step": every one made before this one began, so also during an earlier cleanup step of
      // this turn (CR 514.3a).
      const due =
        d.when === "nextCleanup"
          ? ev.step === "cleanup"
          : d.when === "nextEndStep"
          ? ev.step === "end" && !(d.turn === s.turn && d.step === "end")
          : d.when === "endOfCombat"
            ? ev.step === "endCombat" && !(d.turn === s.turn && d.step === "endCombat")
            : d.when === "eachYourPrecombatMain"
              ? ev.step === "main1" && ev.active === d.controller
              : d.when !== "leaves" && d.when !== "lostControl" && ev.step === "upkeep" && (d.when === "nextTurnUpkeep" || ev.active === d.controller) && d.turn < s.turn;
      if (!due) continue;
      if (d.when !== "eachYourUpkeep" && d.when !== "eachYourPrecombatMain") s.delayed = s.delayed!.filter((x) => x !== d);
      s.triggerQueue.push({ sourceId: d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, body: d.body });
    }
    // "At the beginning of the monarch's end step, that player draws a card" (CR 725.2).
    if (ev.step === "end" && s.monarch === ev.active) monarchTrigger(s, 0);
    // "At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity" (CR 726.2).
    if (ev.step === "upkeep" && s.initiative === ev.active) initiativeTrigger(s, 0, ev.active);
    // Suspend's second ability works in exile (CR 702.62a): "At the beginning of your upkeep, if this card is
    // suspended, remove a time counter from it." Its owner controls it (CR 113.8).
    if (ev.step === "upkeep")
      for (const id of player(s, ev.active).exile) {
        const o = obj(s, id);
        if (isSuspended(s, o))
          s.triggerQueue.push({
            sourceId: id,
            sourceCardId: cardIdOf(o),
            controller: ev.active,
            index: -1,
            subject: { id, zc: o.zoneChanges ?? 0 },
            body: { targets: [], effects: [{ type: "suspendTick" }], text: "Suspend: remove a time counter from ~." },
          });
      }
    const pair = STEP_TRIGGERS[ev.step];
    if (!pair) return;
    const [want, each] = pair;
    // "That player" in "at the beginning of each player's upkeep" is the active player.
    const stepWatch = (o: GameObject, you: PlayerId) =>
      add(o, you, (e, t) => (e === "yourMain" && you === ev.active && (ev.step === "main1" || ev.step === "main2")) || (e === want && you === ev.active && (!t.ifEcho || echoDue(s, o, you)) && (!t.secondMain || s.mainPhasesThisTurn === 2)) || (e === each && (!t.hostControllersUpkeep || hostController(s, o) === ev.active) && (!t.opponentsTurn || opponents(s, you).includes(ev.active)) && (!t.enchantedPlayersTurn || o.attachedToPlayer === ev.active)), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.active });
    for (const id of s.battlefield) stepWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(stepWatch);
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
      // "Choose one that hasn't been chosen": not one this object has had chosen (rulings on Demonic Pact).
      const legal = legalModes(s, printed, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
      const n = legal.filter(Boolean).length;
      if (n === 0 || n < printed.modal.min) {
        log(s, `${def.name}'s ability has no mode that can be chosen and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      if (n === printed.modal.min) t.modes = legal.flatMap((ok, i) => (ok ? [i] : [])); // the only possible choice
      else if (printed.modal.random) {
        // "Choose one at random": among the modes that can be chosen (rulings on Umaro), as it's put on the stack.
        const can = legal.flatMap((ok, i) => (ok ? [i] : []));
        t.modes = [can[Math.floor(nextRandom(s) * can.length)]!];
        log(s, `${def.name}'s ability chooses at random: ${printed.modal.modes[t.modes[0]!]!.text.replace(/~/g, def.name)}`);
      } else {
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
      // "Any number of target creatures" with none to choose and nothing else to target: zero targets (CR 115.6).
      const offered = offerTargets(s, body.targets, t.controller, t.x ?? 0, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
      if (offered.every((x) => x.skip)) {
        pushTrigger(s, t, offered.map(() => ({ kind: "none" as const })));
        added = true;
        continue;
      }
      s.pending = { kind: "chooseTargets", player: t.controller, sourceId: t.sourceId, specs: body.targets, description: describeAbility(def, body.text), ...(t.x ? { x: t.x } : {}) };
      return added;
    }
    pushTrigger(s, t, []);
    added = true;
  }
  return added;
}

/** A trigger of a permanent that just left the battlefield (CR 603.10a): it's about the object it was there. */
const lookingBack = (o: GameObject, zone: TriggeredAbility["zone"]) => o.zone !== "battlefield" && zone !== "graveyard" && (o.zoneChanges ?? 0) > 0;

/** Whether this object's "only once each turn" ability (by its text, or "do:" and its may's) was used this turn. */
export function onceUsed(o: GameObject, zone: TriggeredAbility["zone"], text: string): boolean {
  const zc = lookingBack(o, zone) ? (o.zoneChanges ?? 0) - 1 : (o.zoneChanges ?? 0);
  return !!o.triggeredThisTurn?.includes(`${zc}|${text}`);
}

const triggerOf = (s: GameState, t: PendingTrigger) => (t.body ? undefined : compileCard(s.cards[t.sourceCardId]!).triggers[t.index]);

/**
 * State triggers (CR 603.8): one triggers when its state is true, and not again until that instance has
 * resolved or left the stack.
 */
/**
 * "When you lose control of the creature, tap it" (Ray of Command): a delayed trigger that triggers once, when its
 * controller no longer controls that object (CR 603.7). Once the object has left the battlefield it's gone for good.
 */
export function checkLostControl(s: GameState) {
  for (const d of [...(s.delayed ?? [])]) {
    if (d.when !== "lostControl") continue;
    // "This turn" is over (Stolen Uniform).
    if (d.thisTurn !== undefined && d.thisTurn !== s.turn) {
      s.delayed = s.delayed!.filter((x) => x !== d);
      continue;
    }
    const o = s.objects[d.subject.id];
    const here = !!o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === d.subject.zc;
    // What it would sacrifice is gone (CR 400.7): nothing left to do.
    const it = d.about && s.objects[d.about.id];
    if (d.about && !(it && it.zone === "battlefield" && (it.zoneChanges ?? 0) === d.about.zc)) {
      s.delayed = s.delayed!.filter((x) => x !== d);
      continue;
    }
    if (here && controllerOf(s, o) === d.controller) {
      d.held = true;
      continue;
    }
    if (d.about) {
      // "Sacrifice it when you lose control of ~" (Krovikan Vampire): ~ leaving counts too (Khârn rulings); one you
      // haven't controlled since it was made can't be lost yet, or ever once it's gone (Seraph rulings).
      if (here && !d.held) continue;
      s.delayed = s.delayed!.filter((x) => x !== d);
      if (d.held) s.triggerQueue.push({ sourceId: d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.about, body: d.body });
      continue;
    }
    s.delayed = s.delayed!.filter((x) => x !== d);
    if (here) s.triggerQueue.push({ sourceId: d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, body: d.body });
  }
}

export function checkStateTriggers(s: GameState) {
  checkLostControl(s);
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const triggers = abilitiesOf(s, o).triggers;
    triggers.forEach((t, index) => {
      if (t.event !== "state" || !t.state || (t.activeIf && !staticConditionNow(s, t.activeIf, id, controllerOf(s, o)))) return;
      const waiting = s.triggerQueue.some((q) => q.sourceId === id && q.index === index) || s.stack.some((x) => x.sourceId === id && x.stateIndex === index && x.sourceZc === (o.zoneChanges ?? 0));
      if (waiting || !staticConditionNow(s, t.state, id, controllerOf(s, o))) return;
      s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(o), controller: controllerOf(s, o), index, sourceZc: o.zoneChanges ?? 0 });
    });
  }
}

/** What a waiting trigger does: its source's printed ability, or a delayed trigger's own (CR 603.7). */
export function triggerBody(s: GameState, t: PendingTrigger): AbilityBody {
  // "Deals X damage divided as you choose": worked out as it's put on the stack (CR 603.3d, 601.2d).
  const body = settleDivided(s, t.body ?? compileCard(s.cards[t.sourceCardId]!).triggers[t.index]!.body, { controller: t.controller, sourceId: t.sourceId, ...(t.sourceZc !== undefined ? { sourceZc: t.sourceZc } : {}), x: t.x ?? 0, ...(t.lki ? { lki: t.lki } : {}), ...(t.event ? { event: t.event } : {}), ...(t.cause ? { cause: t.cause } : {}) });
  // "Target creature that player controls": that player is known once it triggers.
  const who = t.event?.player;
  if (!body.targets.some((x) => x.controller === "eventPlayer")) return body;
  const fix = (x: TargetSpec): TargetSpec => (x.controller === "eventPlayer" ? (({ controller: _, ...rest }) => ({ ...rest, ...(who !== undefined ? { controlledBy: who } : { controller: "eventPlayer" as const }) }))(x) : x);
  return { ...body, targets: body.targets.map(fix), ...(body.modal ? { modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, targets: m.targets?.map(fix) })) } } : {}) };
}

export function pushTrigger(s: GameState, t: PendingTrigger, chosen: TargetChoice[]) {
  const def = s.cards[t.sourceCardId]!;
  // With "any number of target ...", as many targets as were chosen (CR 601.2c, 603.3d).
  const fit = fitMany(withModes(triggerBody(s, t), t.modes), chosen, t.x ?? 0);
  if (typeof fit === "string") throw new RulesError(fit);
  const { body, targets } = fit;
  s.triggerQueue = s.triggerQueue.filter((x) => x !== t);
  // Chosen as it's put on the stack, it stays chosen even if the ability doesn't resolve (rulings on Demonic Pact).
  if (t.modes) noteModesChosen(s, triggerBody(s, t), t.sourceId, t.modes, t.sourceZc);
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
    triggered: true,
    ...(t.cause ? { cause: t.cause } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    ...(t.lki ? { lki: t.lki } : {}),
    ...(t.x ? { x: t.x } : {}),
    ...(t.rolled !== undefined ? { rolled: t.rolled } : {}),
    ...(t.kicked ? { kicked: t.kicked } : {}),
    ...(t.colorsSpent ? { colorsSpent: t.colorsSpent } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.ifCond ? { ifCond: t.ifCond } : {}),
    ...(t.index >= 0 && triggerOf(s, t)?.event === "state" ? { stateIndex: t.index } : {}),
    ...(t.chapter ? { chapter: true as const } : {}),
  });
  log(s, `${def.name}'s ability triggers (${body.text.replace(/~/g, def.name).replace(/\.$/, "")})${describeTargets(s, targets)}.`);
  if (targets.length) fireEvent(s, { type: "targeted", stackId: s.stack[s.stack.length - 1]!.id });
}

/** Whether this spell or ability, as it's put on the stack, makes its controller commit a crime (CR 700.13). */
function isCrime(s: GameState, item: StackItem): boolean {
  const you = item.controller;
  return (item.targets ?? []).some((t) => {
    if (t.kind === "player") return t.id !== you;
    if (t.kind === "stack") {
      const target = s.stack.find((x) => x.id === t.id);
      return !!target && target.controller !== you;
    }
    if (t.kind !== "object") return false;
    const o = s.objects[t.id];
    if (!o) return false;
    if (o.zone === "battlefield") return controllerOf(s, o) !== you;
    if (o.zone === "graveyard") return o.owner !== you;
    if (o.zone === "stack") return o.controller !== you;
    return false;
  });
}

/** Stands in as the "source" of speed's inherent triggered ability, which has none (CR 702.179d). */
export const SPEED: CardDef = { oracleId: "speed", name: "Speed", manaCost: "", cmc: 0, typeLine: "", supertypes: [], types: [], subtypes: [], oracleText: "", colors: [], colorIdentity: [], keywords: [] };

/**
 * Speed's inherent ability (CR 702.179d), controlled by the active player if they have speed: "Whenever one or more
 * opponents lose life during your turn, if your speed is less than 4, your speed increases by 1. This ability
 * triggers only once each turn."
 */
function speedTrigger(s: GameState, loser: PlayerId) {
  const ap = s.activePlayer;
  const p = player(s, ap);
  if (loser === ap || p.lost || !p.speed || p.speed >= 4 || p.speedTurn === s.turn) return;
  p.speedTurn = s.turn;
  s.cards[SPEED.oracleId] ??= SPEED;
  s.triggerQueue.push({
    sourceId: "",
    sourceCardId: SPEED.oracleId,
    controller: ap,
    index: -1,
    body: { targets: [], effects: [{ type: "increaseSpeed" }], text: "Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1." },
  });
}

const CASCADE_BODY: AbilityBody = { targets: [], effects: [{ type: "cascade" }], text: "Cascade: exile cards from the top of your library until you exile a cheaper nonland card. You may cast it without paying its mana cost." };

/** The cascade abilities the permanents `you` controls give this spell as it's cast ("Sliver spells you cast have cascade"). */
function grantedCascades(s: GameState, item: StackItem, spell: GameObject, you: PlayerId): unknown[] {
  const cast = (s.castThisTurn ?? []).filter((c) => c.player === you);
  const out: unknown[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== you) continue;
    for (const g of abilitiesOf(s, o).spellsHaveCascade ?? []) {
      if (g.from && spell.castFrom !== g.from) continue;
      if (g.commander && !spell.isCommander) continue;
      if (g.yourTurn && s.activePlayer !== you) continue;
      if (g.maxMv !== undefined && spellManaValue(s, item) > evalAmount(s, g.maxMv, { controller: you, sourceId: o.id })) continue;
      if (g.treasure && !spell.treasureSpent) continue;
      if (g.filter && !spellMatches(s, g.filter, item)) continue;
      // "The first spell you cast each turn ...": this one is the first of its kind this turn (it's already counted).
      if (g.first && cast.filter((c) => (!g.from || c.from === g.from) && (!g.treasure || c.treasure)).length !== 1) continue;
      out.push(g);
    }
  }
  return out;
}

/** Is this moved object one that `b` counts, for the permanent `w` (as it is now, or as it last existed: `gone`)? */
function batchMoveMatches(s: GameState, b: BatchTrigger, m: ZoneMove, w: GameObject, you: PlayerId, gone: boolean): boolean {
  const whose = (p: PlayerId | undefined) => !b.whose || (b.whose === "you" ? p === you : p !== undefined && p !== you);
  if (b.what === "enters") {
    const o = s.objects[m.id];
    if (!m.entered || !o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== m.zc) return false;
    // Torpor Orb: "creatures entering don't cause abilities to trigger" for these controllers.
    if (m.locks?.some((l) => !l.opponents || l.by !== you)) return false;
    if (b.orSelf && o.id === w.id) return true;
    if (b.other && o.id === w.id) return false;
    return whose(m.controller) && (!b.filter || objectMatches(s, b.filter, o, you, false));
  }
  if (b.what === "leaves") {
    if (m.from !== "battlefield" || !m.snapshot || !m.chars) return false;
    if (b.dies && m.to !== "graveyard") return false;
    if (b.notDies && m.to === "graveyard" && m.chars.types.includes("Creature")) return false; // CR 700.4
    if (b.other && m.id === w.id && (gone || (w.zoneChanges ?? 0) === m.zc)) return false;
    return whose(m.controller) && (!b.filter || objectMatches(s, b.filter, m.snapshot, you, false, undefined, m.chars));
  }
  // The rest are about cards (not tokens or copies of spells, CR 111.1, 707.10), as they are in that zone.
  if (m.notCard) return false;
  const card = s.cards[m.card];
  if (!card || (b.filter && !printedMatches(b.filter, card))) return false;
  if (b.what === "leavesGraveyard") return m.from === "graveyard" && m.to !== "graveyard" && whose(m.owner) && (!b.to || m.to === b.to);
  if (b.what === "toGraveyard") return m.to === "graveyard" && m.from !== "graveyard" && whose(m.owner) && (!b.from || m.from === b.from);
  return m.discardedBy !== undefined && whose(m.discardedBy);
}

/** The current event is over: its "one or more" triggers trigger (CR 603.2c). */
export function closeZoneBatch(s: GameState) {
  const moves = s.zoneBatch;
  s.zoneBatch = undefined;
  if (moves?.length) fireEvent(s, { type: "batch", moves });
}

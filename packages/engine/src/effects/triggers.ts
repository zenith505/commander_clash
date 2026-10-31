import { defMv, restingDef, sameName } from "../faces";
import { isSiege, siegeTrigger } from "../battles";
import { isRealKicker, type AbilityBody, type BatchTrigger, type CompiledCard, type TargetChoice, type TargetSpec, type TriggeredAbility, type TriggerEvent } from "../abilities";
import { abilitiesOf, cardIdOf, defOf, NO_ABILITIES, withGranted, describeAbility, objIsType, power, toughness } from "../cards";
import { checkAscend, sharesTypeWithLinked, creatureTypesOf, describeTargets, draw, hasConvoke, log, obj, opponents, pairable, pairCandidates, player, shareCreatureType, STEP_ORDER, stillControlsSource } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow, type Characteristics } from "../layers";
import { fitMany, modeRange, withModes } from "../modes";
import { compileCard, compileGranted } from "../oracle";
import type { CardDef, GameObject, ManaType, SpentMana, GameState, LastKnown, ObjectId, PendingTrigger, PlayerId, StackItem, TriggerEventInfo, ZoneMove, ZoneName } from "../types";
import { RulesError } from "../types";
import { parseManaCost, spentMeets } from "../mana";
import { nextRandom } from "../rng";
import { evalAmount, manaSymbolsOf } from "../amounts";
import { objectMatches, bindBound, manyX, bindChosen, legalTargets, sourceQuality, printedMatches, spellManaValue, spellMatches, stampTargets, targetsMatch, targetsOnlyOne, hasLegalTargets, legalModes, distinctModeCap, noteModesChosen, offerTargets, settleDivided, exposed } from "./targeting";
import { monarchTrigger } from "./run-basics";
import { initiativeTrigger } from "./run-dungeons";
import { INITIATIVE, RAD } from "../oracle";
import { isRingBearer, ringTrigger } from "./run-ring";
import { kickedMatches } from "./run-spells";
import { hasSuspend, isSuspended } from "./run-zones";
import { liveEmblems } from "../emblems";

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

/** See `causedBy` in fireEvent. */
type Cause = { event: "enters" | "dies" | /** Left the battlefield, not dying. */ "leaves" | "attacks" | "combatDamage"; objs: { o: GameObject; c?: Characteristics; controller: PlayerId }[] } | { event: "castOrCopy"; caster: PlayerId; objs?: undefined };

/**
 * How many more times a triggered ability of `src` triggers (CR 603.2d): one for each "triggers an additional time" effect
 * of a permanent `controller` controls that applies, the ones leaving the battlefield at the same time included (rulings
 * on Teysa Karlov). Only abilities of permanents, as they are or as they were leaving (CR 603.10a).
 */
function triggersAgain(s: GameState, src: GameObject, controller: PlayerId, cause: Cause | null): number {
  const leaving = cause?.event === "dies" || cause?.event === "leaves" ? cause.objs.find((x) => x.o.id === src.id) : undefined;
  const permanent = src.zone === "battlefield" || !!leaving || (s.leftTogether ?? []).some((l) => l.id === src.id && src.zone !== "battlefield");
  // A spell's own triggered abilities ("When you cast ~", storm, cascade): only for "a triggered ability of a colorless
  // spell you control" (Echoes of Eternity).
  const spell = !permanent && src.zone === "stack" ? s.stack.find((x) => x.objectId === src.id && x.kind === "spell") : undefined;
  // An emblem's (CR 114.4): only for The Masamune's "a triggered ability of this creature or an emblem you own".
  const emblem = !permanent && !spell && !!src.emblem && src.zone === "command";
  if (!permanent && !spell && !emblem) return 0;
  const statics: { id: ObjectId; again: NonNullable<CompiledCard["triggersAgain"]> }[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const c = characteristics(s, o);
    // Printed, or granted (The Masamune's equipped creature).
    // Wizard's Staff's is about the creature it's attached to, whoever controls the Staff.
    const again = [...(c.hasPrintedAbilities ? (compileCard(defOf(s, o)).triggersAgain ?? []) : []), ...(c.grantedAbilities?.length ? (withGranted(NO_ABILITIES, c.grantedAbilities).triggersAgain ?? []) : [])].filter((a) => c.controller === controller || a.ofEquipped);
    if (again.length) statics.push({ id, again });
  }
  for (const l of s.leftTogether ?? []) {
    const o = s.objects[l.id];
    if (!o || o.zone === "battlefield") continue;
    const again = [...(l.hadAbilities ? (compileCard(defOf(s, o)).triggersAgain ?? []) : []), ...(l.granted?.length ? (withGranted(NO_ABILITIES, l.granted).triggersAgain ?? []) : [])];
    if (again.length && l.controller === controller && !statics.some((x) => x.id === l.id)) statics.push({ id: l.id, again });
  }
  if (!statics.length) return 0;
  // Whose ability it is: as it is, or as it last existed.
  const view = leaving ? { o: leaving.o, c: leaving.c } : { o: src, c: src.zone === "battlefield" ? undefined : characteristics(s, src) };
  const ofMatches = (f: TargetSpec) =>
    spell ? f.kind === "spell" && spellMatches(s, { ...f, controller: undefined }, spell) : f.kind !== "spell" && objectMatches(s, { ...f, controller: undefined }, view.o, controller, false, undefined, view.c);
  let n = 0;
  for (const { id, again } of statics)
    for (const a of again) {
      if (a.anchor !== undefined && s.objects[id]?.chosen?.anchor !== a.anchor) continue;
      if (a.enduringStory && !s.players[controller]?.enduringStory) continue;
      // The others are about abilities of permanents only.
      if (spell && !a.of) continue;
      if (emblem !== !!a.selfOrEmblems && !(a.selfOrEmblems && view.o.id === id)) continue;
      if (a.ofEquipped) {
        if (!spell && !emblem && s.objects[id]!.attachedTo === view.o.id) n++;
        continue;
      }
      if (a.selfOrEquipment) {
        const host = s.objects[id]!;
        const equipped = host.zone === "battlefield" && s.battlefield.some((e) => s.objects[e]!.attachedTo === id && characteristics(s, s.objects[e]!).subtypes.includes("Equipment"));
        const equipment = view.o.id !== id && view.o.attachedTo === id && (view.c ?? characteristics(s, view.o)).subtypes.includes("Equipment");
        if (!spell && equipped && (view.o.id === id || equipment)) n++;
        continue;
      }
      // Veyran: "If you casting or copying an instant or sorcery spell causes ...": that player is this static's controller.
      if (a.by?.event === "castOrCopy") {
        if (cause?.event !== "castOrCopy" || cause.caster !== controller) continue;
      } else if (a.by && !(cause && cause.event !== "castOrCopy" && (cause.event === a.by.event || (a.by.event === "entersOrLeaves" && (cause.event === "enters" || cause.event === "dies" || cause.event === "leaves"))) && cause.objs!.some((x) => !a.by!.filter || a.by!.filter.some((f) => objectMatches(s, f, x.o, controller, false, undefined, x.c) && (f.controller !== "you" || x.controller === controller))))) continue;
      // "Of the chosen type": the one chosen as that permanent entered (Roaming Throne).
      if (a.of && !a.of.some((k) => !(k.other && src.id === id) && ((f) => !f.chosen && ofMatches(f))(bindChosen(k.filter, s.objects[id]?.chosen)))) continue;
      n++;
    }
  return n;
}

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
  /** An Aura or Equipment became attached to `host`: entering attached, or attached by an effect (CR 701.3a). */
  | { type: "attached"; id: ObjectId; host: ObjectId }
  /** Another player gained control of it; `from` lost control (CR 603.2, "When you lose control of ~"). */
  | { type: "controlChanged"; id: ObjectId; from: PlayerId }
  | { type: "dies"; to: ZoneName; id: ObjectId; controller: PlayerId; sacrificed?: boolean; /** A spell or ability this player controls destroyed it (CR 701.8a). */ destroyedBy?: PlayerId; hadAbilities: boolean; grantedAbilities?: string[]; counters: Record<string, number>; wasCreature: boolean; power?: number; toughness?: number; /** It as it last existed on the battlefield. */ snapshot?: GameObject; chars?: Characteristics; /** The Auras and Equipment that were attached to it. */ attachments?: ObjectId[]; /** A merged permanent's other cards, where they went with it (CR 730.3c). */ movedWith?: { id: ObjectId; zc: number }[] }
  /** Every defending player has declared blockers (CR 509.3). */
  | { type: "blocksDeclared" }
  /** Creatures fought (CR 701.14a): "whenever one or more creatures you control fight". */
  | { type: "fought"; ids: ObjectId[]; /** Their controllers as they fought. */ controllers: PlayerId[] }
  /** A player gained life (one life-gain event, CR 119.9). */
  | { type: "lifeGained"; player: PlayerId; amount: number; /** The player's first life gain this turn. */ first?: boolean }
  /** The active player's permanents untapped by their untap step's turn-based action (CR 502.3), how many. */
  | { type: "untapStepUntapped"; player: PlayerId; amount: number }
  /** A player lost life: from damage, an effect, or paying life (one life-loss event, CR 119.2-119.4). */
  | { type: "lifeLost"; player: PlayerId; amount: number; /** The player's first life loss this turn. */ first?: boolean; /** Life lost at the same time by several players shares this number ("one or more opponents lose life"). */ batch?: number }
  /** `player` created a token (CR 111.2), `id` (it may have left already: "whenever you create a token" still triggers). */
  | { type: "tokenCreated"; player: PlayerId; id: ObjectId }
  /** All the damage dealt to a player at the same time (CR 120.3a): "whenever you're dealt damage". */
  | { type: "playerDealtDamage"; player: PlayerId; amount: number; combat?: boolean }
  /** Damage that would have been dealt to `player` was prevented, `amount` of it, all at the same time (Selfless Squire). */
  | { type: "damagePreventedToPlayer"; player: PlayerId; amount: number }
  /** A player collected evidence (CR 701.59a), once for each time. */
  | { type: "evidenceCollected"; player: PlayerId }
  /** A player investigated (CR 701.16a), once for each time; `first`: their first time this turn. */
  | { type: "investigated"; player: PlayerId; first: boolean }
  | { type: "foretold"; player: PlayerId }
  | { type: "proliferated"; player: PlayerId }
  /** A player who wasn't the monarch became it (CR 725.3). */
  | { type: "becameMonarch"; player: PlayerId }
  /** Day became night or night became day (CR 731.1), not the first time it became either. */
  | { type: "dayNightChanged" }
  /** The final chapter ability of a Saga (`amount`: its mana value) finished resolving and left the stack; `player` controlled it. */
  | { type: "finalChapterResolved"; player: PlayerId; amount: number }
  | { type: "gaveGift"; player: PlayerId }
  /** A player paid mana to cast a spell: what they had spent this turn on spells before and after (CR 700.14). */
  | { type: "expended"; player: PlayerId; before: number; after: number }
  /** A player scried or surveilled (CR 701.22d, 701.25d): `n`, how many cards they looked at. */
  | { type: "scried"; player: PlayerId; how: "scry" | "surveil"; n: number; /** A surveil that was the player's first this turn (TurnLog.surveilled). */ firstSurveil?: true }
  /** A player clashed (CR 701.30a), whether or not they started it; `won`, whether they won it (701.30d). */
  | { type: "clashed"; player: PlayerId; won: boolean }
  /** A spell was countered by a spell or ability `by` controls (CR 701.6a). */
  | { type: "spellCountered"; by: PlayerId; /** The countered spell's controller, the player who cast it unless `copy`. */ caster: PlayerId; copy?: true }
  /** `from`: the zone it was played from. */
  | { type: "landPlayed"; player: PlayerId; id: ObjectId; from: ZoneName }
  | { type: "dungeonCompleted"; player: PlayerId }
  /** A player rolled dice (CR 706): each die that counts (706.6), its natural result and its result. */
  | { type: "diceRolled"; player: PlayerId; sides: number; dice: { natural: number; result: number }[]; result: number }
  | { type: "coinFlipped"; player: PlayerId; won: boolean }
  | { type: "attacks"; id: ObjectId }
  /** A permanent became tapped (CR 701.26a). */
  | { type: "tapped"; id: ObjectId; /** As it was declared as an attacker (CR 508.1f). */ attacking?: true }
  | { type: "untapped"; id: ObjectId }
  /** Counters were put on a permanent, `amount` of them, on the battlefield or as it entered (CR 122.6). */
  | { type: "countersPut"; id: ObjectId; counter: string; amount: number; /** Who put them (Hapatra's "whenever you put"). */ by: PlayerId }
  /** Counters were put on a player (poison, energy), by `by` (All Will Be One's "whenever you put ... on a player"). */
  | { type: "playerCountersPut"; player: PlayerId; counter: string; amount: number; by: PlayerId }
  /** A permanent became monstrous (CR 701.37b), with `x` the N, the X of its "when ~ becomes monstrous" abilities (701.37c). */
  | { type: "becameMonstrous"; id: ObjectId; x: number }
  /** These permanents phased in or are about to phase out (looking back in time, CR 603.10b). */
  | { type: "phases"; ids: ObjectId[]; how: "in" | "out" }
  /** A crew ability of this Vehicle resolved (CR 702.122e). */
  | { type: "crewed"; id: ObjectId }
  | { type: "crews"; id: ObjectId; vehicle: ObjectId }
  /** A permanent explored (CR 701.44b), `controller` controlling it then or as it last existed (701.44c). */
  | { type: "connived"; id: ObjectId; controller: PlayerId }
  /** It became renowned (CR 702.112b). */
  | { type: "becameRenowned"; id: ObjectId }
  | { type: "lostGame"; player: PlayerId }
  | { type: "explored"; id: ObjectId; controller: PlayerId; /** The card it revealed was a land card or not; unset with none revealed. */ revealed?: "land" | "nonland" }
  /** Its evolve ability put one or more +1/+1 counters on it (CR 702.100d). */
  | { type: "evolved"; id: ObjectId }
  /** A mutating spell merged with this permanent (CR 702.140d). */
  | { type: "mutates"; id: ObjectId }
  | { type: "becameLevel"; id: ObjectId; level: number }
  /** A Room's door became unlocked (CR 709.5h). */
  | { type: "doorUnlocked"; id: ObjectId; door: number }
  /** A Room got both unlocked designations (CR 709.5i), unlocked by its controller `player`. */
  | { type: "roomFullyUnlocked"; id: ObjectId; player: PlayerId }
  /** A Case became solved (CR 719.3a), under `controller`. */
  | { type: "solved"; id: ObjectId; controller: PlayerId }
  /** A permanent transformed (CR 701.27a), now with the face `face` up (0: the front). */
  | { type: "transformed"; id: ObjectId; face: number }
  /** An attacker was exerted as it attacked (CR 701.43d). */
  | { type: "exerted"; id: ObjectId; /** By its "you may exert ~ as it attacks" (its "when you do" is linked to that, CR 607.2h). */ attacking?: true }
  /** A player declared these attackers (CR 508.1): "whenever one or more creatures you control attack". */
  | { type: "groupAttack"; controller: PlayerId; ids: ObjectId[] }
  /** In one combat damage step, these creatures of `controller` dealt `player` combat damage. */
  | { type: "groupCombatDamage"; controller: PlayerId; player: PlayerId; ids: ObjectId[]; amounts: number[]; /** Dealt to this battle, `player` its protector (CR 310). */ battle?: ObjectId }
  /** Creatures dealt combat damage to this player in one combat damage step, whoever controls them (Witch-king of Angmar). */
  | { type: "creaturesDamagedPlayer"; player: PlayerId; ids: ObjectId[]; controllers: PlayerId[] }
  | { type: "creaturesDamagedPlayers"; controller: PlayerId; players: PlayerId[] }
  /** The last counter of a kind was removed from it (vanishing's time counters, CR 702.63a). */
  | { type: "lastCounterRemoved"; id: ObjectId; counter: string }
  /** A face-down permanent was turned face up (CR 702.37e, 708.8). */
  | { type: "turnedFaceUp"; id: ObjectId; /** The X chosen for its morph or disguise cost (CR 702.37f, 702.168e). */ x?: number; /** Who turned it face up: the player taking the special action (CR 116.2b), or the controller of the effect that did. */ by?: PlayerId }
  /** It's the only creature declared as an attacker this combat (CR 506.5, exalted 702.83b). */
  | { type: "attacksAlone"; id: ObjectId }
  /** An attacking creature enlisted another by tapping it (CR 702.154c). */
  | { type: "enlists"; id: ObjectId; enlisted: ObjectId }
  /** With `planeswalker`, the damage was dealt to that planeswalker, and `player` controls it. */
  | { type: "combatDamageToPlayer"; id: ObjectId; player: PlayerId; amount: number; /** The first time this turn this object dealt combat damage to a player. */ first?: true; planeswalker?: ObjectId; /** Dealt to a battle instead, `player` its protector. */ battle?: ObjectId }
  /** A permanent was dealt this much damage, all at the same time (one event however many sources dealt it). */
  | { type: "wasDealtDamage"; id: ObjectId; amount: number; /** Combat damage (a batch is all combat damage or none, CR 510.2). */ combat?: true }
  /** The damage one source dealt a permanent in one event (Phyrexian Obliterator), and that source's controller. */
  | { type: "dealtDamageBySource"; id: ObjectId; amount: number; by: PlayerId; /** The permanent dealing it. */ srcId?: ObjectId; combat?: true }
  /** A permanent dealt damage to a player, in combat or not. */
  /** `source` is the permanent dealing it, or "" for a spell or a gone permanent's ability (CR 120.3); `by` controls it. */
  | { type: "damagedPlayer"; source: ObjectId; by: PlayerId; player: PlayerId; amount: number; combat: boolean }
  /** A source (`source`: its object, "" if none) controlled by `by` dealt damage to a permanent (`id`) or a player. */
  | { type: "sourceDealtDamage"; source: ObjectId; by: PlayerId; id?: ObjectId; player?: PlayerId; amount: number; combat?: true }
  /** A permanent dealt damage to a creature (`id`). */
  | { type: "damagedCreature"; source: ObjectId; id: ObjectId; amount: number; combat: boolean; /** The excess damage that creature has been dealt this turn (CR 120.10). */ excess?: number }
  /** A spell (`card`, controlled by `by`) dealt damage to a player or a battle. */
  | { type: "spellDealtDamage"; by: PlayerId; card: CardDef; player?: PlayerId; battle?: ObjectId }
  /**
   * Damage dealt to players at the same time (CR 603.2c): each source's to each player, with the source's controller and
   * its card types and subtypes as it dealt it, and the permanent it was (not for a spell).
   */
  | { type: "playersDealtDamage"; hits: { player: PlayerId; by: PlayerId; amount: number; source?: ObjectId; types: readonly string[]; subtypes: readonly string[]; combat?: true }[] }
  /** Damage dealt at the same time was excess damage to these permanents (CR 120.10), under `controller` then. */
  | { type: "excessDamage"; hits: { id: ObjectId; amount: number; controller: PlayerId }[]; combat: boolean }
  /** The Ring tempted a player, who chose `chosen` as their Ring-bearer, if they could choose one (CR 701.54d). */
  | { type: "ringTempted"; player: PlayerId; chosen?: ObjectId }
  /** A source dealt damage: everything it dealt at once is one event (CR 120.3, 603.2c). */
  | { type: "dealtDamage"; id: ObjectId; amount: number; combat: boolean }
  | { type: "step"; step: "upkeep" | "draw" | "main1" | "main2" | "end" | "beginCombat" | "endCombat" | "cleanup"; active: PlayerId }
  /** A spell was just cast (CR 601.2i): "whenever you cast" abilities and prowess. */
  | { type: "cast"; stackId: string; controller: PlayerId; card: CardDef; /** A copy was put on the stack instead (magecraft's "or copy"). */ copy?: boolean; /** The mana spent to cast it (increment, CR 702.191a). */ manaSpent?: number; /** How much of it Treasures made (CR 106.3). */ treasureSpent?: number; /** What was spent, by type (CR 601.2h). */ spent?: SpentMana; /** The permanents whose kept-apart mana was spent on it ("id#zoneChanges", ManaLot.source). */ manaSources?: string[] }
  /** A spell or ability was just put on the stack with its targets: "becomes the target" (CR 601.2c, ward 702.21a). */
  /** `only`: its targets were changed (CR 115.7), and these are the new ones; that isn't a crime (CR 700.13). */
  | { type: "targeted"; stackId: string; only?: ObjectId[] }
  /** A player searched their own library (CR 701.23). */
  | { type: "searchedLibrary"; player: PlayerId }
  /** A player discarded a card (CR 701.9), `cycled` to pay a cycling cost (CR 702.29a). `id`: the card, in its new zone. */
  | { type: "discarded"; player: PlayerId; id: ObjectId; card: CardDef; cycled?: boolean; /** The X of the cycling cost. */ x?: number; /** The controller of the spell or ability whose effect made them discard, if one did (not a cost). */ cause?: PlayerId }
  /** A card (or token) was put into a graveyard, from any zone. */
  | { type: "toGraveyard"; id: ObjectId; from?: ZoneName }
  /** A resolved instant or sorcery card was put into its owner's graveyard (CR 608.2n): haunt on a spell (702.55a). */
  | { type: "resolvedToGraveyard"; id: ObjectId }
  /** A player drew a card, their `nth` this turn (CR 121.2). */
  | { type: "draw"; player: PlayerId; nth: number; /** The first card they draw in their draw step. */ firstInDrawStep?: true }
  /** A player tapped this permanent for mana: activated its mana ability with {T} in the cost (CR 106.12). */
  | { type: "tappedForMana"; id: ObjectId; player: PlayerId }
  /** A player activated an ability that isn't a mana ability; its source as it was then, if it was a permanent. */
  | { type: "activated"; player: PlayerId; /** The ability on the stack ("copy that ability"). */ stackId?: string; source?: { snapshot: GameObject; chars: Characteristics }; /** A mana ability (CR 605.1a). */ mana?: true; /** Mana from Treasures spent to activate it (CR 106.3). */ treasure?: number; /** Its activation cost has the mana symbol {X} (Unbound Flourishing). */ xCost?: true; /** A ninjutsu ability (CR 702.49). */ ninjutsu?: true; /** A boast ability (CR 702.142a). */ boast?: true; /** An exhaust ability (CR 702.177a), a mana ability too. */ exhaust?: true; /** An outlast ability (CR 702.107a). */ outlast?: true; /** An ability of a card in its activator's own graveyard (Neerdiv, Devious Diver). */ fromOwnGraveyard?: true; /** A loyalty ability (CR 606.3): how many loyalty counters its cost removed (0 for a + one, CR 606.4). */ loyalty?: { removed: number } }
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
  chosen?: GameObject["chosen"],
): boolean {
  // "When enchanted creature dies, if that creature was a Horror" (Endless Evil): its types as it last existed (CR 603.10a).
  // "When enchanted permanent leaves the battlefield, if it was historic" (Curator's Ward): any permanent, of that kind.
  if (d.attached) return attachedTo === dying.o.id && (!d.filter.types?.length || d.filter.types.some((ty) => dying.c.types.includes(ty))) && ((!d.filter.subtypes?.length && !d.filter.anyOf?.length) || objectMatches(s, d.filter, dying.o, you, false, undefined, dying.c));
  // One with the Kami: the creature it was attached to, whoever controlled it, or one matching the filter.
  if (d.orAttached && attachedTo !== undefined && attachedTo === dying.o.id) return true;
  if (d.damagedBySelf && !dying.o.damagedBy?.includes(srcId)) return false;
  if (d.damagedByEquipped && (!attachedTo || !dying.o.damagedBy?.includes(attachedTo))) return false;
  if (srcId === dying.o.id) {
    if (d.orSelf) return true;
    if (d.other) return false;
  } else if (d.self) return false;
  // "A creature of the chosen type" (Species Specialist): the type chosen for the watcher, as it last existed if it's
  // dying too (rulings; CR 603.10a).
  return objectMatches(s, bindChosen(bindEnchanted(d.filter, s.objects[srcId]), chosen), dying.o, you, false, undefined, dying.c);
}

/** Does `entering` set off `o`'s "whenever a/another/~ or another ... enters" ability? */
function entersMatches(s: GameState, en: NonNullable<TriggeredAbility["enters"]>, o: GameObject, entering: GameObject, you: PlayerId): boolean {
  if (en.ifCast && !entering.wasCast) return false;
  if (en.notFromHand && entering.castFromHand) return false;
  if (o.id === entering.id) {
    if (en.orSelf) return true;
    if (en.other) return false;
  }
  // "A creature you control of the chosen type" (Kindred Discovery): the type chosen for the watcher.
  return objectMatches(s, bindChosen(bindEnchanted(en.filter, o), o.chosen), entering, you, false);
}

/**
 * "Enters from a graveyard" / "from your graveyard" (CR 603.6a), or "if it entered from your graveyard or you cast it from
 * your graveyard" (Grist, Voracious Larva): a card is only in its owner's graveyard (CR 404.2), so "your" is its owner;
 * the spell was cast by the player who controls the permanent it became (CR 608.3).
 */
function fromGraveyardMatches(s: GameState, how: NonNullable<TriggeredAbility["ifFromGraveyard"]>, entering: GameObject, you: PlayerId): boolean {
  if (how === "any") return !!entering.enteredFromGraveyard;
  if (entering.owner !== you) return false;
  if (how === "castYours") return !!entering.castFromGraveyard && controllerOf(s, entering) === you;
  return !!entering.enteredFromGraveyard || (how === "yoursOrCast" && !!entering.castFromGraveyard && controllerOf(s, entering) === you);
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
/** Wedding Ring: the event's player controls an artifact with this object's name (CR 201.2), during their own turn. */
function eventPlayerFits(s: GameState, o: GameObject, t: TriggeredAbility, pid: PlayerId): boolean {
  const c = t.eventPlayerIf;
  if (!c) return true;
  if (c.theirTurn && s.activePlayer !== pid) return false;
  const name = characteristics(s, o).name;
  return !c.controlsArtifactNamedSelf || s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Artifact") && characteristics(s, obj(s, id)).name === name);
}

function othersAttacking(s: GameState, o: GameObject, type?: string, tokens?: true): number {
  return s.battlefield.filter((id) => id !== o.id && s.objects[id]!.attacking !== undefined && objIsType(s, s.objects[id]!, "Creature") && (!tokens || s.objects[id]!.isToken) && (!type || characteristics(s, s.objects[id]!).subtypes.includes(type))).length;
}

/** Is this creature attacking `you`, or (`orPlaneswalkers`) a planeswalker `you` control? Not a battle (CR 506.2, 310). */
export function attackingYouNow(s: GameState, id: ObjectId, you: PlayerId, orPlaneswalkers: boolean): boolean {
  const a = s.objects[id];
  if (!a || a.zone !== "battlefield" || a.attacking !== you) return false;
  if (!a.attackingPermanent) return true;
  const p = s.objects[a.attackingPermanent.id];
  return orPlaneswalkers && !!p && p.zone === "battlefield" && (p.zoneChanges ?? 0) === a.attackingPermanent.zc && objIsType(s, p, "Planeswalker") && controllerOf(s, p) === you;
}

export function fireEvent(s: GameState, ev: TriggerSourceEvent) {
  // The Traps look back at what entered this turn, as it entered (after "as it enters" choices, CR 614.12).
  if (ev.type === "enters" && s.objects[ev.id]) {
    const c = characteristics(s, s.objects[ev.id]!);
    ((s.turnLog ??= {}).entered ??= []).push({ controller: c.controller, types: [...c.types], subtypes: [...c.subtypes], colors: [...c.colors], id: ev.id, zc: s.objects[ev.id]!.zoneChanges ?? 0, ...(s.objects[ev.id]!.isToken ? { token: true as const } : {}) });
  }
  // While set, `add` is looking at an Aura's or Equipment's abilities about this creature it's attached to.
  let hosting: GameObject | null = null;
  // While set, `add` is looking at the abilities of a card in a graveyard that work there (CR 113.6m).
  let fromYard = false;
  let fromExile = false;
  // Torpor Orb: while set, the controllers whose abilities the event can't trigger.
  let locked: ((controller: PlayerId) => boolean) | null = null;
  // While set, what the event is for "triggers an additional time" (Panharmonicon, Teysa Karlov, Isshin; CR 603.2d) and
  // the objects doing it, as they were then.
  let causedBy: Cause | null = null;
  // While set, `add` is looking at a delayed triggered ability with a duration (CR 603.7b), made by a spell or ability.
  let floating: NonNullable<GameState["floatingTriggers"]>[number] | null = null;
  // Abilities that trigger on the battlefield use the permanent's abilities right now;
  // leaves-the-battlefield triggers look back in time (CR 603.10a), so "dies" passes them in.
  const add = (
    o: GameObject,
    controller: PlayerId,
    pred: (event: string, t: TriggeredAbility) => boolean,
    triggersIn?: TriggeredAbility[],
    cause?: string,
    subject?: GameObject,
    lki?: LastKnown,
    x?: number,
    kicked?: number[],
    event?: TriggerEventInfo,
    colorsSpent?: number,
  ) => {
    if (locked?.(controller)) return;
    // Passed-in abilities look back in time (a commander that left for the command zone still has its "leaves" trigger).
    const triggers = triggersIn ?? abilitiesOf(s, o).triggers;
    const printed = compileCard(defOf(s, o)).triggers;
    // Two instances of one "triggers only once each turn" ability (two Dionus, Elvish Archdruid granting it) each
    // trigger once (rulings): the nth instance is used up once n of them have triggered this turn.
    const instance = new Map<string, number>();
    const grantedAt = o.zone === "battlefield" ? characteristics(s, o).grantedAt : undefined;
    triggers.forEach((t, index) => {
      // "Whenever enchanted creature ..." is about the creature, not the Aura; "~ or equipped creature" about both.
      if (hosting ? !t.host : t.host === "attached") return;
      if ((t.zone === "graveyard") !== fromYard || (t.zone === "exile") !== fromExile) return;
      // In the command zone, only an eminence ability works (CR 113.6).
      if (o.zone === "command" && !o.emblem && !t.eminence && !triggersIn) return;
      // An intervening "if" has to be true for it to trigger at all (CR 603.4).
      // "Max speed — Whenever ...": only while it has the ability (CR 702.178a).
      if (t.activeIf && !staticConditionNow(s, t.activeIf, o.id, controller)) return;
      // (Keyed by event too: "Whenever ~ enters or attacks, ..." is one ability compiled as two triggers.)
      // A granted one is keyed by the granting effect's timestamp too: when Dionus, Elvish Archdruid leaves and returns
      // (or another one enters), the ability it grants is a new one that can trigger again that turn (CR 400.7, rulings).
      const onceKey = t.grant !== undefined && grantedAt?.[t.grant] !== undefined ? `${t.body.text}@${grantedAt[t.grant]}` : t.body.text;
      const nth = t.oncePerTurn ? (instance.get(`${t.event}|${onceKey}`) ?? 0) : 0;
      if (t.oncePerTurn) instance.set(`${t.event}|${onceKey}`, nth + 1);
      if (t.oncePerTurn && onceUsed(o, t.zone, onceKey, nth)) return;
      const once = t.body.effects[0];
      if (once?.type === "may" && once.once && onceUsed(o, t.zone, `do:${once.text}`)) return; // CR 603.2h
      if ((once?.type === "castNow" || once?.type === "castFromAmong") && once.once && onceUsed(o, t.zone, "do:castNow")) return;
      if (pred(t.event, t) && (!t.ifCond || staticConditionNow(s, t.ifCond, o.id, controller, event?.player, event?.amount, undefined, subject?.id, subject?.zoneChanges ?? 0))) {
        if (t.oncePerTurn) (o.triggeredThisTurn ??= []).push(`${lookingBack(o, t.zone) ? (o.zoneChanges ?? 0) - 1 : (o.zoneChanges ?? 0)}|${onceKey}`);
        const queued: PendingTrigger = {
          ...(t.ifCond ? { ifCond: t.ifCond } : {}),
          // An ability an effect gave it isn't on its card, so the trigger carries what it does.
          ...(printed[index] !== t ? { body: t.body } : {}),
          sourceId: o.id,
          sourceCardId: cardIdOf(o),
          controller,
          index,
          // A delayed one is about its source as it was when it was made (CR 603.7c).
          sourceZc: floating ? floating.sourceZc : (o.zoneChanges ?? 0),
          ...(floating ? { body: t.body, ...(floating.fromSpell ? { fromSpell: true as const } : {}) } : {}),
          ...(cause ? { cause } : {}),
          ...(subject ? { subject: { id: subject.id, zc: subject.zoneChanges ?? 0 } } : {}),
          ...(lki ? { lki } : {}),
          ...(t.xKicked ? (kicked?.length ? { x: kicked.length } : {}) : x ? { x } : t.eventX && event?.amount ? { x: event.amount } : {}),
          ...(kicked ? { kicked } : {}),
          ...(colorsSpent ? { colorsSpent } : {}),
          ...(event ? { event } : {}),
        };
        s.triggerQueue.push(queued);
        // "That ability triggers an additional time" (CR 603.2d): only a permanent's (or one leaving's) own abilities.
        // Not delayed triggered abilities (CR 603.2d).
        const again = !fromYard && !fromExile && !floating ? triggersAgain(s, o, controller, causedBy) : 0;
        attackCaused(queued);
        entersCaused(queued);
        for (let n = again; n > 0; n--) {
          const more: PendingTrigger = { ...queued };
          delete more.tag;
          s.triggerQueue.push(more);
          attackCaused(more);
          entersCaused(more);
        }
      }
    });
  };
  /**
   * Firebender Ascension: "Whenever a creature you control attacking causes a triggered ability of that creature to
   * trigger": an ability of the attacking creature itself (not of an Aura or Equipment on it, nor a delayed one). Its
   * trigger goes on the stack just above that ability (rulings), which becomes its `cause` once it's there.
   */
  const attackCaused = (q: PendingTrigger) => {
    if (fromYard || fromExile || floating || hosting || causedBy?.event !== "attacks" || !causedBy.objs.some((x) => x.o.id === q.sourceId)) return;
    const creature = s.objects[q.sourceId];
    if (creature?.zone !== "battlefield" || !objIsType(s, creature, "Creature") || controllerOf(s, creature) !== q.controller) return;
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      if (wc !== q.controller || locked?.(wc)) continue;
      abilitiesOf(s, w).triggers.forEach((t, index) => {
        if (t.event !== "attackCausesTrigger" || (t.activeIf && !staticConditionNow(s, t.activeIf, id, wc))) return;
        q.tag ??= `t${s.nextId++}`;
        const printed = compileCard(defOf(s, w)).triggers;
        s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(w), controller: wc, index, sourceZc: w.zoneChanges ?? 0, causeTag: q.tag, ...(printed[index] !== t ? { body: t.body } : {}) });
      });
    }
  };
  /**
   * Aboleth Spawn: "Whenever a creature entering under an opponent's control causes a triggered ability of that creature
   * to trigger": an ability of the entering creature itself (not of another permanent, nor a delayed one; rulings), for
   * each opponent of that creature's controller with such a watcher. Its trigger goes on the stack just above that
   * ability (rulings), which becomes its `cause` once it's there.
   */
  const entersCaused = (q: PendingTrigger) => {
    if (fromYard || fromExile || floating || hosting || causedBy?.event !== "enters" || !causedBy.objs.some((x) => x.o.id === q.sourceId)) return;
    const creature = s.objects[q.sourceId];
    if (creature?.zone !== "battlefield" || !objIsType(s, creature, "Creature")) return;
    const owner = controllerOf(s, creature);
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      if (!opponents(s, owner).includes(wc) || locked?.(wc)) continue;
      abilitiesOf(s, w).triggers.forEach((t, index) => {
        if (t.event !== "opponentEntersCausesTrigger" || (t.activeIf && !staticConditionNow(s, t.activeIf, id, wc))) return;
        q.tag ??= `t${s.nextId++}`;
        const printed = compileCard(defOf(s, w)).triggers;
        s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(w), controller: wc, index, sourceZc: w.zoneChanges ?? 0, causeTag: q.tag, ...(printed[index] !== t ? { body: t.body } : {}) });
      });
    }
  };
  /**
   * The same event for the Auras and Equipment attached to `host` (TriggeredAbility.host): `subject` is the creature
   * by default ("put a +1/+1 counter on it"). `player`: the player it dealt damage to, for "an opponent".
   */
  const addHosted = (host: GameObject, pred: (event: string, t: TriggeredAbility, you: PlayerId) => boolean, cause?: string, subject: GameObject = host, event?: TriggerEventInfo) => {
    for (const id of s.battlefield) {
      const a = s.objects[id]!;
      if (a.attachedTo !== host.id || id === host.id) continue;
      const you = controllerOf(s, a);
      hosting = host;
      try {
        add(a, you, (e, t) => pred(e, t, you) && !(t.toOpponent && event?.player === you), undefined, cause, subject, undefined, undefined, undefined, event);
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
  /**
   * The face-up cards in exile with abilities that work there ("if this card is exiled", CR 113.6k), each with its
   * owner, who controls those abilities (CR 113.8); `f` adds the ones that trigger.
   */
  const fromExiled = (f: (o: GameObject, owner: PlayerId) => void) => {
    for (const pid of s.turnOrder) {
      if (player(s, pid).lost) continue;
      for (const id of player(s, pid).exile) {
        const o = obj(s, id);
        if (o.faceDown || o.owner !== pid || !compileCard(defOf(s, o)).triggers.some((t) => t.zone === "exile")) continue;
        fromExile = true;
        try {
          f(o, pid);
        } finally {
          fromExile = false;
        }
      }
    }
  };
  /**
   * The emblems in the command zone, each with its owner, who controls it (CR 114.2, 114.4); `f` adds the abilities that
   * trigger. Only the events in EMBLEM_EVENTS (oracle/grants.ts) look at emblems.
   */
  const fromEmblems = (f: (o: GameObject, owner: PlayerId) => void) => {
    for (const o of liveEmblems(s)) f(o, o.owner);
    fromCommand(f);
  };
  /** Commanders in the command zone with an eminence ability, which works there (CR 113.6), controlled by their owner. */
  const fromCommand = (f: (o: GameObject, owner: PlayerId) => void) => {
    for (const p of s.players) {
      if (p.lost) continue;
      for (const id of p.command) {
        const o = s.objects[id];
        if (o?.zone === "command" && !o.emblem && compileCard(defOf(s, o)).triggers.some((t) => t.eminence)) f(o, p.id);
      }
    }
  };
  /**
   * The delayed triggered abilities with a duration still in effect (CR 603.7b), each with its source object, wherever it
   * is now, and its controller (603.7d-e); `f` adds the ones this event triggers. `self`: only those about this object, as
   * the object it was when the ability was made (603.7c, 400.7).
   */
  const fromFloating = (f: (o: GameObject, controller: PlayerId, triggers: TriggeredAbility[]) => void, self?: GameObject, /** The player dealt combat damage. */ dealtTo?: PlayerId) => {
    for (const ft of [...(s.floatingTriggers ?? [])]) {
      const o = s.objects[ft.sourceId];
      if (!o || player(s, ft.controller).lost) continue;
      if (ft.toPlayer !== undefined && ft.toPlayer !== dealtTo) continue;
      if (self && (ft.about ? ft.about.id !== self.id || (self.zoneChanges ?? 0) !== ft.about.zc : o.id !== self.id || (o.zoneChanges ?? 0) !== ft.sourceZc)) continue;
      floating = ft;
      const queued = s.triggerQueue.length;
      try {
        f(o, ft.controller, [ft.trigger]);
      } finally {
        floating = null;
      }
      // "When you next ... this turn": gone once it has triggered (CR 603.7c).
      if (ft.once && s.triggerQueue.length > queued) s.floatingTriggers = s.floatingTriggers!.filter((x) => x !== ft);
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
    causedBy = { event: "enters", objs: [{ o: entering, controller: you }] };
    (s.zoneBatch ??= []).push({
      id: entering.id,
      zc: entering.zoneChanges ?? 0,
      to: "battlefield",
      owner: entering.owner,
      ...(entering.isToken ? { notCard: true as const } : {}),
      card: cardIdOf(entering),
      controller: you,
      entered: true,
      ...(s.playingLand === entering.id ? { played: true as const } : {}),
      ...(locks.length ? { locks: locks.map((l) => ({ by: l.by, ...(l.lock.opponents ? { opponents: true } : {}) })) } : {}),
    });
    // Its own enters abilities use the X of the spell it was (CR 107.3m), and know whether it was kicked;
    // "if it was kicked" is an intervening if (CR 603.4), and that can't change by the time it resolves.
    // Evoke's sacrifice trigger only if the evoke cost was paid (CR 702.74a).
    add(
      entering,
      you,
      // Soulbond's intervening if: there's another unpaired creature to pair it with (CR 702.95a, 603.4).
      (e, t) => e === "selfEnters" && !(t.ifNotToken && entering.isToken) && (!t.ifKicked || kickedMatches(entering.kicked, t.ifKicked)) && (!t.ifX || (ev.x ?? 0) >= t.ifX) && (!t.ifEvoked || entering.castAlt === "evoke") && (!t.ifAlt || (t.ifAlt === "webSlinging" ? !!entering.webSlung : entering.castAlt === t.ifAlt)) && (!t.ifBargained || !!entering.bargained) && (!t.ifEvidence || !!entering.evidence) && (!t.ifTreasure || (entering.treasureSpent ?? 0) > 0) && (!t.ifSpent || spentMeets(entering.spent, t.ifSpent)) && (t.ifCastFromHand === undefined || !!entering.castFromHand === t.ifCastFromHand) && (!t.ifCast || !!entering.wasCast) && (!t.ifCastInMain || (!!entering.wasCast && !!entering.castInMain)) && (!t.ifFromGraveyard || fromGraveyardMatches(s, t.ifFromGraveyard, entering, you)) && (!t.ifFromHand || (!!entering.enteredFromHand && entering.owner === you)) && (!t.ifEnteredUntapped || !entering.tapped) && (!t.ifGift || entering.gift !== undefined) && (!t.ifTributeUnpaid || !entering.tribute?.paid) && (!t.ifSoulbond || pairCandidates(s, entering, you).length > 0),
      undefined,
      undefined,
      undefined,
      undefined,
      ev.x,
      entering.kicked,
      // Whom its spell's gift was promised to: "the chosen player" (CR 702.174b).
      entering.gift !== undefined || entering.evidence || entering.treasureSpent || entering.spent || entering.manaSpent || entering.castAlt === "surge" || entering.castAlt === "spectacle" || entering.castAlt === "prowl"
        ? { ...(entering.gift !== undefined ? { gift: entering.gift } : {}), ...(entering.evidence ? { evidence: true as const } : {}), ...(entering.treasureSpent ? { treasureSpent: entering.treasureSpent } : {}), ...(entering.spent ? { spent: entering.spent } : {}), ...(entering.manaSpent ? { manaSpent: entering.manaSpent } : {}), ...(entering.castAlt === "surge" || entering.castAlt === "spectacle" || entering.castAlt === "prowl" ? { castAlt: entering.castAlt } : {}) }
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
      fromEmblems((o, owner) => owner === you && add(o, you, (e) => e === "anotherCreatureYouControlEnters", undefined, undefined, entering, lki));
    }
    // Landfall. The land itself sees itself enter too (CR 603.6a).
    if (objIsType(s, entering, "Land")) {
      // Faldorn: "Whenever you cast a spell from exile or a land you control enters from exile".
      for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e, t) => e === "landYouControlEnters" || (e === "castSpell" && !!t.cast?.orLandEntersFromExile && !!entering.enteredFromExile));
      fromGraveyards((o, owner) => owner === you && add(o, you, (e) => e === "landYouControlEnters"));
      fromEmblems((o, owner) => owner === you && add(o, you, (e) => e === "landYouControlEnters"));
    }
    // "Whenever a creature you control enters", "another Ally", "~ or another artifact": on every permanent,
    // the entering one too, which is the subject ("that creature"). It sees itself enter (CR 603.6a).
    const entersWatch = (o: GameObject, ctrl: PlayerId) => add(o, ctrl, (e, t) => e === "permanentEnters" && !!t.enters && entersMatches(s, t.enters, o, entering, ctrl) && (!t.ifFromGraveyard || fromGraveyardMatches(s, t.ifFromGraveyard, entering, ctrl)), undefined, undefined, entering);
    for (const id of s.battlefield) entersWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(entersWatch);
    fromEmblems(entersWatch);
    // "This turn, whenever a creature or enchantment you control enters" (Rite of Harmony; CR 603.7b).
    fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "permanentEnters" && !!t.enters && entersMatches(s, t.enters, src, entering, ctrl), triggers, undefined, entering));
    // Brood Keeper: an Aura entering attached to it becomes attached to it (rulings).
    const host = entering.attachedTo ? s.objects[entering.attachedTo] : undefined;
    if (host?.zone === "battlefield" && characteristics(s, entering).subtypes.includes("Aura")) add(host, controllerOf(s, host), (e) => e === "auraAttachedToSelf", undefined, undefined, entering);
    locked = null;
    causedBy = null;
  } else if (ev.type === "controlChanged") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") add(o, ev.from, (e) => e === "selfLostControl");
  } else if (ev.type === "attached") {
    // "Whenever an Aura becomes attached to ~" (Brood Keeper): the host's controller's trigger, about the Aura.
    const o = s.objects[ev.id];
    const host = s.objects[ev.host];
    if (o?.zone === "battlefield" && host?.zone === "battlefield" && o.attachedTo === host.id && characteristics(s, o).subtypes.includes("Aura")) add(host, controllerOf(s, host), (e) => e === "auraAttachedToSelf", undefined, undefined, o);
  } else if (ev.type === "unattached") {
    const o = s.objects[ev.id];
    const host = s.objects[ev.host];
    if (o?.zone === "battlefield" && host) add(o, controllerOf(s, o), (e) => e === "selfBecomesUnattached", undefined, undefined, host);
  } else if (ev.type === "dies") {
    const o = obj(s, ev.id);
    // A creature dying (CR 700.4): put into a graveyard from the battlefield.
    // Any other way of leaving the battlefield (Gandalf the White's "leaving the battlefield").
    if (ev.snapshot && ev.chars) causedBy = { event: ev.to === "graveyard" && ev.wasCreature ? "dies" : "leaves", objs: [{ o: ev.snapshot, c: ev.chars, controller: ev.controller }] };
    // Earthbend's "when that land dies or is put into exile" (CR 701.66a): it triggers once, for that object only; gone
    // anywhere else, it never will.
    const was = ev.snapshot?.zoneChanges ?? 0;
    for (const d of [...(s.delayed ?? [])]) {
      if (d.when !== "leaves" || d.subject.id !== ev.id || d.subject.zc !== was) continue;
      s.delayed = s.delayed!.filter((x) => x !== d);
      // "When that creature dies this turn": only this turn, and only if it dies (CR 700.4).
      if (d.thisTurn !== undefined && d.thisTurn !== s.turn) continue;
      if (d.dies && !ev.wasCreature) continue;
      if (d.underControl && ev.controller !== d.controller) continue;
      if (d.ownedByController && o.owner !== d.controller) continue;
      if (d.to?.includes(ev.to))
        s.triggerQueue.push({ sourceId: d.source?.id ?? ev.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: { id: ev.id, zc: o.zoneChanges ?? 0 }, body: d.body, ...(d.source ? { sourceZc: d.source.zc } : {}) });
    }
    // Its abilities as it last existed on the battlefield (CR 603.10a): a merged permanent's from all its cards (730.2a),
    // a copy's from what it copied.
    const lastAbilities = withGranted(ev.hadAbilities ? compileCard(ev.snapshot ? defOf(s, ev.snapshot) : defOf(s, o)) : NO_ABILITIES, ev.grantedAbilities ?? []).triggers;
    // Persist and undying: "if it had no -1/-1 counters on it" (an intervening if, CR 603.4; last known information).
    add(
      o,
      ev.controller,
      (e, t) =>
        (((e === "selfDies" && ev.wasCreature) || (e === "selfToGraveyard" && (!t.ownGraveyard || ev.controller === o.owner))) && ev.to === "graveyard" && !(t.ifNotToken && o.isToken) && !(t.ifNotBlocking && !!ev.snapshot?.blocking) && !(t.ifBlockedThisTurn && ev.snapshot?.becameBlockedTurn !== s.turn) && !(t.ifHadCounter && !((ev.counters[t.ifHadCounter] ?? 0) > 0)) && !(t.ifDamagedThisTurn !== undefined && (s.turnLog?.damageDealtTo?.[`${ev.id}@${was}`] ?? []).reduce((n, d) => n + (d.amount ?? 0), 0) < t.ifDamagedThisTurn) && !(t.ifNoCounter && (t.ifNoCounter === "any" ? Object.values(ev.counters).some((n) => n > 0) : (ev.counters[t.ifNoCounter] ?? 0) > 0))) ||
        (e === "selfDiesOrExiled" && (ev.to === "graveyard" || ev.to === "exile")) ||
        e === "selfLeaves" ||
        e === "selfLostControl",
      lastAbilities,
      undefined,
      undefined,
      { counters: ev.counters, ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}), ...(ev.movedWith?.length ? { mergedCards: { of: ev.id, cards: ev.movedWith } } : {}) },
    );
    // "Whenever ~ becomes unattached from a permanent": it left while attached (looking back in time, CR 603.10a), or what
    // was attached to it stayed.
    const host = ev.snapshot?.attachedTo ? s.objects[ev.snapshot.attachedTo] : undefined;
    if (host) add(o, ev.controller, (e) => e === "selfBecomesUnattached", lastAbilities, undefined, host);
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
      // Its subtypes then: "if that creature was a Cleric" (Taborax, Hope's Demise, CR 608.2h).
      const lki = { counters: ev.counters, copyKey: cardIdOf(ev.snapshot), controller: ev.controller, manaValue: defMv(defOf(s, ev.snapshot)), subtypes: [...ev.chars.subtypes], ...(ev.chars.allCreatureTypes ? { allCreatureTypes: true as const } : {}), ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}), ...(ev.snapshot.attacking !== undefined ? { attacking: ev.snapshot.attacking } : {}), ...(ev.movedWith?.length ? { mergedCards: { of: ev.id, cards: ev.movedWith } } : {}) };
      // The Auras attached to it then, by their controllers then (Hateful Eidolon): one gone too, as it last existed.
      const auraControllers = (ev.attachments ?? []).flatMap((aid) => {
        const a = s.objects[aid];
        if (!a || !characteristics(s, a).subtypes.includes("Aura")) return [];
        return [a.zone === "battlefield" ? controllerOf(s, a) : (s.lastKnown?.[aid]?.controller ?? a.owner)];
      });
      if (auraControllers.length) (lki as LastKnown).auraControllers = auraControllers;
      const dying = { o: ev.snapshot, c: ev.chars };
      const hadCounter = Object.values(ev.counters).some((n) => n > 0);
      const went = (d: NonNullable<TriggeredAbility["dies"]>) => (d.leaves ? !(d.notDies && ev.to === "graveyard") && (!d.toZones || (d.toZones as string[]).includes(ev.to)) : ev.to === "graveyard") && (!d.hadCounter || (d.hadCounter === true ? hadCounter : (ev.counters[d.hadCounter] ?? 0) > 0));
      const consider = (src: GameObject, ctrl: PlayerId, attachedTo: ObjectId | undefined, triggers?: TriggeredAbility[]) =>
        add(src, ctrl, (e, t) => e === "permanentDies" && !!t.dies && went(t.dies) && diesMatches(s, t.dies, src.id, attachedTo, dying, ctrl, src.chosen), triggers, undefined, o, lki);
      for (const id of s.battlefield) {
        const src = obj(s, id);
        consider(src, controllerOf(s, src), ev.attachments?.includes(id) ? ev.id : src.attachedTo);
      }
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src) continue;
        if (src.zone === "battlefield") continue; // it already came back as a new object
        consider(src, left.controller, left.attachedTo, withGranted(left.hadAbilities ? compileCard(left.card ? s.cards[left.card]! : defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
      }
      fromFloating((src, ctrl, triggers) => consider(src, ctrl, undefined, triggers));
      fromEmblems((src, owner) => consider(src, owner, undefined));
      // "Whenever another creature is put into your graveyard from the battlefield, you may pay {B}. If you do, return ~
      // from your graveyard to the battlefield" (Nether Traitor): a card already in the graveyard (CR 113.6m), not one that
      // left the battlefield at the same time, which was still there then (CR 603.10a).
      fromGraveyards((src, owner) => {
        if (src.id !== ev.id && !s.leftTogether?.some((l) => l.id === src.id)) consider(src, owner, undefined);
      });
    }
    // "Whenever a spell or ability an opponent controls destroys a noncreature permanent you control" (Karmic Justice): the
    // permanents on the battlefield and the ones destroyed at the same time (this one too), as they last existed (CR
    // 603.10a); "that opponent" is the destroying spell's or ability's controller.
    if (ev.destroyedBy !== undefined && ev.snapshot && ev.chars) {
      const by = ev.destroyedBy;
      const lki = { counters: ev.counters, copyKey: cardIdOf(ev.snapshot), controller: ev.controller, manaValue: defMv(defOf(s, ev.snapshot)), ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}) };
      const destroyed = { o: ev.snapshot, c: ev.chars };
      const consider = (src: GameObject, ctrl: PlayerId, triggers?: TriggeredAbility[]) =>
        add(src, ctrl, (e, t) => e === "permanentDestroyed" && !!t.destroyed && opponents(s, ctrl).includes(by) && diesMatches(s, t.destroyed, src.id, undefined, destroyed, ctrl), triggers, undefined, o, lki, undefined, undefined, { player: by });
      for (const id of s.battlefield) consider(obj(s, id), controllerOf(s, obj(s, id)));
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src || src.zone === "battlefield") continue;
        consider(src, left.controller, withGranted(left.hadAbilities ? compileCard(left.card ? s.cards[left.card]! : defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
      }
    }
    // "Whenever you sacrifice a creature" isn't caused by its dying (rulings on Teysa Karlov).
    causedBy = null;
    // "Whenever you sacrifice another permanent": the permanents of the player who sacrificed it, and the ones leaving at
    // the same time (CR 603.10a), whatever zone it went to.
    if (ev.sacrificed && ev.snapshot && ev.chars) {
      const lki = { counters: ev.counters, copyKey: cardIdOf(ev.snapshot), controller: ev.controller, manaValue: defMv(defOf(s, ev.snapshot)), ...(ev.wasCreature ? { power: ev.power, toughness: ev.toughness } : {}), ...(ev.snapshot.attacking !== undefined ? { attacking: ev.snapshot.attacking } : {}), ...(ev.movedWith?.length ? { mergedCards: { of: ev.id, cards: ev.movedWith } } : {}) };
      const dying = { o: ev.snapshot, c: ev.chars };
      // "Whenever a player sacrifices", "whenever an opponent sacrifices": the other players' permanents too, each
      // triggering for its own controller, "that player" being the one who sacrificed it.
      const byOk = (by: "any" | "opponent" | undefined, watcher: PlayerId) => (watcher === ev.controller ? by !== "opponent" : by === "any" || (by === "opponent" && opponents(s, watcher).includes(ev.controller)));
      const consider = (src: GameObject, watcher: PlayerId, triggers?: TriggeredAbility[]) =>
        add(src, watcher, (e, t) => e === "youSacrifice" && !!t.sacrifices && (!t.sacrifices.self || src.id === ev.id) && byOk(t.sacrifices.by, watcher) && diesMatches(s, t.sacrifices, src.id, undefined, dying, ev.controller), triggers, undefined, o, lki, undefined, undefined, { player: ev.controller });
      for (const id of s.battlefield) consider(obj(s, id), controllerOf(s, obj(s, id)));
      for (const left of s.leftTogether ?? []) {
        const src = s.objects[left.id];
        if (!src || src.zone === "battlefield") continue;
        consider(src, left.controller, withGranted(left.hadAbilities ? compileCard(left.card ? s.cards[left.card]! : defOf(s, src)) : NO_ABILITIES, left.granted ?? []).triggers);
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
      // "Whenever a creature blocks this turn, ..." (Noxious Assault): a delayed trigger (CR 603.7b).
      if (event === "creatureBlocks") fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === event && fits(t, o, ctrl), triggers, undefined, o));
      // Righteous Indignation: "Whenever a creature blocks a black or red creature": once for each one it blocks (CR 509.3b).
      for (const a of o.blocking ?? []) {
        const at = s.objects[a];
        if (at) for (const w of watchers) add(w, controllerOf(s, w), (e, t) => e === "creatureBlocksCreature" && fits(t, o, controllerOf(s, w)) && !!t.blockFilter && objectMatches(s, t.blockFilter, at, controllerOf(s, w), false), undefined, undefined, o);
      }
    }
    // Neyith of the Dire Hunt: once if one or more creatures its controller controls became blocked (rulings).
    for (const w of watchers) {
      const you = controllerOf(s, w);
      if (s.battlefield.some((id) => obj(s, id).attacking !== undefined && !!obj(s, id).blockedBy?.length && controllerOf(s, obj(s, id)) === you)) add(w, you, (e) => e === "yourCreaturesFightOrBlocked");
    }
    // "Whenever one or more creatures an opponent controls attack you and aren't blocked" (Coveted Jewel): for each such
    // opponent (rulings), whoever controls the watcher now.
    for (const w of watchers) {
      const you = controllerOf(s, w);
      const by = new Set(s.battlefield.map((id) => obj(s, id)).filter((a) => a.attacking === you && !a.attackingPermanent && !a.blockedBy?.length && opponents(s, you).includes(controllerOf(s, a))).map((a) => controllerOf(s, a)));
      for (const pid of by) add(w, you, (e) => e === "opponentCreaturesUnblocked", undefined, undefined, undefined, undefined, undefined, undefined, { player: pid });
    }
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (o.blocking) {
        // Blocking several creatures, "blocks" still triggers once; "blocks a creature" once for each (CR 509.3a-b).
        // "Blocks one or more black creatures" (Rashka the Slayer): once, if any of them is one.
        // Lairwatch Giant: "blocks two or more creatures".
        const anyBlocked = (t: TriggeredAbility) => (!t.blockFilter || o.blocking!.some((a) => !!s.objects[a] && objectMatches(s, t.blockFilter!, s.objects[a]!, you, false))) && (!t.blocksAtLeast || o.blocking!.length >= t.blocksAtLeast);
        add(o, you, (e, t) => (e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks") && anyBlocked(t));
        addHosted(o, (e) => e === "selfBlocks" || e === "selfBlocksOrBecomesBlocked" || e === "selfAttacksOrBlocks");
        for (const a of o.blocking) {
          const at = s.objects[a];
          if (at) add(o, you, (e, t) => (e === "selfBlocksCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, at, you), undefined, undefined, at);
          // "Whenever enchanted creature blocks or becomes blocked by a creature" (Mammoth Harness): once for each, that
          // creature the subject; the two of them the event's group ("destroy both creatures", Dead-Iron Sledge).
          if (at) addHosted(o, (e, t, w) => e === "selfBlocksOrBlockedByCreature" && fits(t, at, w), undefined, at, { group: [o, at].map((x) => ({ id: x.id, zc: x.zoneChanges ?? 0 })) });
        }
      }
      // "Whenever ~ attacks and isn't blocked": no creature was declared to block it (rulings).
      if (o.attacking !== undefined && !o.blockedBy) {
        // Senu: "When a legendary creature you control attacks and isn't blocked, if this card is exiled": only a card
        // already in exile as blockers are declared (rulings), once for each such creature.
        fromExiled((w, owner) => owner === you && add(w, owner, (e, t) => e === "creatureYouControlAttacksUnblocked" && !!t.attacker && objectMatches(s, t.attacker.filter, o, owner, false), undefined, undefined, o, undefined, undefined, undefined, { player: o.attacking }));
        // "Whenever a Rogue you control attacks and isn't blocked" (Stinkdrinker Bandit): each permanent of the attacker's
        // controller, once for each such creature, "it" being that creature.
        for (const w of watchers)
          if (controllerOf(s, w) === you) add(w, you, (e, t) => e === "creatureYouControlAttacksUnblocked" && !t.zone && !!t.attacker && !(t.attacker.other && w.id === o.id) && objectMatches(s, t.attacker.filter, o, you, false), undefined, undefined, o, undefined, undefined, undefined, { player: o.attacking });
        add(o, you, (e, t) => e === "selfAttacksUnblocked" && (!t.attacksPlayer || !o.attackingPermanent), undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        addHosted(o, (e) => e === "selfAttacksUnblocked", undefined, o, { player: o.attacking });
      }
      if (o.attacking !== undefined && o.blockedBy?.length) {
        // "Defending player" (afflict) is the player it's attacking.
        // "Whenever ~ or equipped creature becomes blocked" (Simian Sling): about ~ itself here, the subject.
        const anyBlocker = (t: TriggeredAbility) => !t.blockFilter || o.blockedBy!.some((b) => !!s.objects[b] && objectMatches(s, t.blockFilter!, s.objects[b]!, you, false));
        add(o, you, (e, t) => (e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked") && t.host !== "orSelf" && anyBlocker(t), undefined, undefined, undefined, undefined, undefined, undefined, { player: o.attacking });
        add(o, you, (e, t) => (e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked") && t.host === "orSelf", undefined, undefined, o, undefined, undefined, undefined, { player: o.attacking });
        addHosted(o, (e) => e === "selfBecomesBlocked" || e === "selfBlocksOrBecomesBlocked", undefined, o, { player: o.attacking });
        // Barreling Attack: "When that creature becomes blocked this turn" (a delayed trigger, CR 603.7b).
        for (const d of s.delayed ?? []) if (d.when === "becomesBlocked" && d.thisTurn === s.turn && d.subject.id === o.id && d.subject.zc === (o.zoneChanges ?? 0)) s.triggerQueue.push({ sourceId: o.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, sourceZc: d.subject.zc, body: d.body });
        const bearer = isRingBearer(s, o);
        for (const b of o.blockedBy) {
          const bl = s.objects[b];
          if (bl) add(o, you, (e, t) => (e === "selfBlockedByCreature" || e === "selfBlocksOrBlockedByCreature") && fits(t, bl, you), undefined, undefined, bl);
          if (bl) addHosted(o, (e, t, w) => e === "selfBlocksOrBlockedByCreature" && fits(t, bl, w), undefined, bl, { player: o.attacking, group: [o, bl].map((x) => ({ id: x.id, zc: x.zoneChanges ?? 0 })) });
          // "Whenever equipped creature becomes blocked by a creature" (Infiltration Lens): once for each blocker (rulings).
          if (bl) addHosted(o, (e) => e === "selfBlockedByCreature", undefined, bl, { player: o.attacking });
          // "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices
          // it at end of combat" (CR 701.54c).
          if (bl && bearer) ringTrigger(s, you, 1, bl);
        }
      }
    }
  } else if (ev.type === "fought") {
    // Neyith of the Dire Hunt: once for the fight, however many of the creatures are its controller's (rulings).
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const you = controllerOf(s, w);
      if (ev.controllers.includes(you)) add(w, you, (e) => e === "yourCreaturesFightOrBlocked");
    }
  } else if (ev.type === "untapStepUntapped") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youUntapInUntapStep", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
  } else if (ev.type === "lifeGained") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      // Cat Collector: "for the first time during each of your turns".
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e, t) => e === "youGainLife" && (!t.firstOnTheirTurn || (!!ev.first && s.activePlayer === ev.player)) && (!t.firstEachTurn || !!ev.first) && (!t.orLoseLife || s.activePlayer === ev.player) && (!t.onYourTurn || s.activePlayer === ev.player), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
    fromEmblems((o, owner) => owner === ev.player && add(o, ev.player, (e) => e === "youGainLife", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount }));
    // "Whenever you gain life this turn, ..." (Vizkopa Guildmage): a delayed trigger of its controller's (CR 603.7b, d).
    fromFloating((o, ctrl, triggers) => ctrl === ev.player && add(o, ctrl, (e) => e === "youGainLife", triggers, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount }));
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (you !== ev.player) add(o, you, (e, t) => e === "opponentGainsLife" && eventPlayerFits(s, o, t, ev.player), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
  } else if (ev.type === "diceRolled") {
    // "Whenever you roll one or more dice" once for the roll; "whenever you roll a 4 or higher" once for each die that
    // is (Mr. House rulings; Netherese Puzzle-Ward rulings: "that many times").
    const watch = (o: GameObject) => {
      add(o, ev.player, (e) => e === "youRollDice", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.result, rollMax: Math.max(...ev.dice.map((d) => d.result)) });
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
    // Dungeon Crawler: "Whenever you complete a dungeon, you may return this card from your graveyard to your hand."
    fromGraveyards((o, owner) => owner === ev.player && add(o, owner, (e) => e === "youCompleteDungeon", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player }));
  } else if (ev.type === "landPlayed") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      // "Whenever you play a land or cast a spell (from exile)": the land played, from that zone.
      // "Whenever a player plays a land or casts a spell" (Cemetery Gatekeeper): anyone's.
      const land = obj(s, ev.id);
      const asCast = (t: TriggeredAbility) =>
        !!t.cast?.orPlaysLand &&
        (t.cast.by === "any" || you === ev.player) &&
        printedMatches(t.cast.orPlaysLand, defOf(s, land)) &&
        (!t.cast.from || castFromMatches(t.cast.from, { castFrom: ev.from } as GameObject, ev.player)) &&
        (!t.cast.sharesTypeWithLinked || sharesTypeWithLinked(s, `${o.id}@${o.zoneChanges ?? 0}`, characteristics(s, land).types));
      add(o, you, (e, t) => e === "playerPlaysLand" || (e === "youPlayLand" && you === ev.player && (!t.subjectFilter || objectMatches(s, t.subjectFilter, land, you, false))) || (e === "youPlayAnotherLand" && you === ev.player && ev.id !== o.id) || (e === "opponentPlaysLand" && you !== ev.player && (!t.subjectFilter || objectMatches(s, t.subjectFilter, land, you, false))) || (e === "castSpell" && asCast(t)), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, played: { id: land.id, zc: land.zoneChanges ?? 0 } });
    }
  } else if (ev.type === "finalChapterResolved") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youFinalChapterResolves", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
  } else if (ev.type === "gaveGift") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youGiveGift", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "investigated") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e, t) => e === "youInvestigate" && (!t.firstEachTurn || ev.first), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "dayNightChanged") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      add(o, controllerOf(s, o), (e) => e === "dayNightChanges");
    }
    // Sunstreak Phoenix: "return this card from your graveyard to the battlefield": its owner's.
    fromGraveyards((o, owner) => add(o, owner, (e) => e === "dayNightChanges"));
  } else if (ev.type === "evidenceCollected" || ev.type === "proliferated" || ev.type === "foretold" || ev.type === "becameMonarch") {
    const kind = ev.type === "proliferated" ? "youProliferate" : ev.type === "foretold" ? "youForetell" : ev.type === "becameMonarch" ? "youBecomeMonarch" : "youCollectEvidence";
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === kind, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
      // Knights of the Black Rose: "Whenever an opponent becomes the monarch".
      else if (ev.type === "becameMonarch" && opponents(s, controllerOf(s, o)).includes(ev.player)) add(o, controllerOf(s, o), (e) => e === "opponentBecomesMonarch", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
    // Voidwing Hybrid: "When you proliferate, return ~ from your graveyard to your hand": its owner's.
    if (ev.type === "proliferated") fromGraveyards((o, owner) => owner === ev.player && add(o, ev.player, (e) => e === kind, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player }));
  } else if (ev.type === "expended") {
    // "Whenever you expend 4": the total crossed 4 with this payment (CR 700.14).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e, t) => e === "youExpend" && t.expend !== undefined && ev.before < t.expend && ev.after >= t.expend, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "scried") {
    const kind = ev.how === "scry" ? "youScry" : "youSurveil";
    // Whispering Snitch: "Whenever you surveil for the first time each turn", counting surveils before it was on the
    // battlefield.
    const watch = (o: GameObject) => add(o, ev.player, (e, t) => (e === kind && (!t.firstEachTurn || !!ev.firstSurveil)) || e === "youScryOrSurveil", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.n });
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === ev.player) watch(obj(s, id));
    // "Whenever you surveil, if ~ is in your graveyard" (Blood Operative): its owner's.
    fromGraveyards((o, owner) => owner === ev.player && watch(o));
  } else if (ev.type === "clashed") {
    // "Whenever you clash" triggers on a clash an opponent's spell started too (rulings on Entangling Trap); "If you
    // won" is about that clash (TriggerEventInfo.wonClash).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youClash" || (ev.won && e === "youWinClash"), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, wonClash: ev.won });
    }
  } else if (ev.type === "spellCountered") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.by) add(o, ev.by, (e) => e === "youCounterSpell");
      if (!ev.copy && controllerOf(s, o) === ev.caster) add(o, ev.caster, (e) => e === "yourSpellCountered");
    }
  } else if (ev.type === "tokenCreated") {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const made = s.objects[ev.id];
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e, t) => e === "youCreateToken" && (!t.createdFilter || (!!made && objectMatches(s, t.createdFilter, made, ev.player, false))));
    }
  } else if (ev.type === "lifeLost") {
    // Every other player is an opponent (CR 102.3); "that player" is the one who lost life, "that much" how much.
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      // Valgavoth: "for the first time during each of their turns".
      add(o, you, (e) => e === "playerLosesLife", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
      if (you !== ev.player) add(o, you, (e, t) => e === "opponentLosesLife" && (!t.firstOnTheirTurn || (!!ev.first && s.activePlayer === ev.player)), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
      // "Whenever one or more opponents lose life": once for life lost at the same time (Emet-Selch), not once per player.
      // "Each lose exactly 1 life" (Ob Nixilis): once for that event too, with what each opponent lost in it added up; it
      // stays queued only if one of them lost exactly 1 (see processTriggerQueue).
      if (you !== ev.player && ev.batch !== undefined)
        add(o, you, (e, t) => {
          if (e !== "opponentsLoseOneLife") return false;
          const q = s.triggerQueue.find((q) => q.sourceId === o.id && q.event?.lifeEach && q.event.lifeBatch === ev.batch && (q.body ?? triggerOf(s, q)?.body)?.text === t.body.text);
          if (!q) return true;
          q.event!.lifeEach![ev.player] = (q.event!.lifeEach![ev.player] ?? 0) + ev.amount;
          return false;
        }, undefined, undefined, undefined, undefined, undefined, undefined, { lifeBatch: ev.batch, lifeEach: { [ev.player]: ev.amount } });
      if (you !== ev.player)
        add(o, you, (e, t) => e === "opponentsLoseLife" && !s.triggerQueue.some((q) => q.sourceId === o.id && q.event?.lifeBatch !== undefined && q.event.lifeBatch === ev.batch && (q.body ?? triggerOf(s, q)?.body)?.text === t.body.text), undefined, undefined, undefined, undefined, undefined, undefined, { ...(ev.batch !== undefined ? { lifeBatch: ev.batch } : {}) });
      else add(o, you, (e, t) => (e === "youLoseLife" && (!t.firstEachTurn || !!ev.first) && (!t.onYourTurn || s.activePlayer === you)) || (e === "youGainLife" && !!t.orLoseLife && s.activePlayer === you), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
    speedTrigger(s, ev.player);
  } else if (ev.type === "playerDealtDamage") {
    // "That many" is the damage; "they" and "that player" the player dealt it. An Aura's controller controls its ability.
    const info = { player: ev.player, amount: ev.amount };
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      // Swarmborn Giant: "When you're dealt combat damage" (CR 510.2: all of it at once).
      add(o, you, (e) => (e === "youAreDealtDamage" && you === ev.player) || (e === "youAreDealtCombatDamage" && you === ev.player && !!ev.combat) || (e === "opponentIsDealtDamage" && you !== ev.player) || (e === "opponentIsDealtNoncombatDamage" && you !== ev.player && !ev.combat) || (e === "enchantedPlayerDealtDamage" && o.attachedToPlayer === ev.player), undefined, undefined, undefined, undefined, undefined, undefined, info);
      // Sower of Discord: damage to one of the two chosen players; "that player" is the other one, who loses that much.
      const pair = o.chosen?.players;
      const other = pair?.length === 2 && pair.includes(ev.player) ? pair.find((p) => p !== ev.player) : undefined;
      if (other !== undefined) add(o, you, (e) => e === "chosenPlayerDealtDamage", undefined, undefined, undefined, undefined, undefined, undefined, { player: other, amount: ev.amount });
    }
  } else if (ev.type === "damagePreventedToPlayer") {
    // "Whenever damage that would be dealt to you is prevented, put that many +1/+1 counters on ~" (Selfless Squire).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (you === ev.player) add(o, you, (e) => e === "youDamagePrevented", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    }
  } else if (ev.type === "ringTempted") {
    // "Whenever the Ring tempts you" (CR 701.54d), "if you chose a creature other than ~ as your Ring-bearer" (CR 603.4);
    // "whenever you choose a creature as your Ring-bearer".
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== ev.player) continue;
      add(o, ev.player, (e, t) => (e === "ringTemptsYou" && (!t.ifOtherBearer || (ev.chosen !== undefined && ev.chosen !== o.id))) || (e === "youChooseRingBearer" && ev.chosen !== undefined));
    }
    // Ringwraiths: "When the Ring tempts you, return ~ from your graveyard to your hand" works from its owner's graveyard.
    fromGraveyards((o, owner) => owner === ev.player && add(o, ev.player, (e, t) => e === "ringTemptsYou" && !t.ifOtherBearer));
  } else if (ev.type === "tapped") {
    // "Whenever ~ becomes tapped", "whenever enchanted land becomes tapped", "whenever a Dwarf you control becomes
    // tapped" (the tapped permanent is the subject: "put a wind counter on it").
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesTapped");
    addHosted(o, (e) => e === "selfBecomesTapped");
    const tapWatch = (w: GameObject, ctrl: PlayerId) => add(w, ctrl, (e, t) => e === "permanentBecomesTapped" && !!t.tappedFilter && !(t.notDeclaringAttack && ev.attacking) && objectMatches(s, t.tappedFilter, o, ctrl, false), undefined, undefined, o);
    for (const id of s.battlefield) tapWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromEmblems(tapWatch);
    // Don't Move: "Until your next turn, whenever a creature becomes tapped, destroy it" (a delayed trigger, CR 603.7b).
    fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "permanentBecomesTapped" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false), triggers, undefined, o));
  } else if (ev.type === "untapped") {
    // "Whenever ~ becomes untapped" (inspired), "whenever equipped creature becomes untapped", "whenever a permanent
    // you control becomes untapped" (the untapped permanent is the subject).
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesUntapped");
    addHosted(o, (e) => e === "selfBecomesUntapped");
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentBecomesUntapped" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false), undefined, undefined, o);
    }
  } else if (ev.type === "tappedForMana") {
    // "Whenever you tap ~ for mana", "whenever an opponent taps a Mountain for mana" (the land is the subject, "that
    // land"; "that player" is who tapped it).
    const o = obj(s, ev.id);
    const info = { player: ev.player };
    const byOk = (t: TriggeredAbility, you: PlayerId) => !!t.manaTap && (t.manaTap.by === "any" || (t.manaTap.by === "you") === (ev.player === you));
    add(o, controllerOf(s, o), (e, t) => e === "tappedForMana" && !t.manaTap?.filter && byOk(t, controllerOf(s, o)), undefined, undefined, undefined, undefined, undefined, undefined, info);
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "tappedForMana" && !!t.manaTap?.filter && byOk(t, ctrl) && objectMatches(s, t.manaTap.filter, o, ctrl, false), undefined, undefined, o, undefined, undefined, undefined, info);
    }
  } else if (ev.type === "countersPut") {
    // "Whenever one or more +1/+1 counters are put on ~ / on a creature you control": "that many" is how many.
    const o = obj(s, ev.id);
    const kindOk = (t: TriggeredAbility, you: PlayerId) => (t.countersKind === undefined || t.countersKind === ev.counter) && (!t.countersByYou || ev.by === you);
    const info = { amount: ev.amount };
    const after = o.counters[ev.counter] ?? 0;
    const reached = (t: TriggeredAbility) => t.countersReach === undefined || (after - ev.amount < t.countersReach && after >= t.countersReach);
    // "For the first time each turn": counters put on this object earlier this turn count, whatever had the ability then.
    const zc = o.zoneChanges ?? 0;
    const earlier = o.countersPutAt && o.countersPutAt.turn === s.turn && o.countersPutAt.zc === zc ? o.countersPutAt : undefined;
    const first = !earlier;
    // Axgard Artisan: "+1/+1 counters ... for the first time each turn": the first time that kind is put on it this turn.
    const firstOfKind = !earlier?.kinds?.includes(ev.counter);
    o.countersPutAt = { turn: s.turn, zc, kinds: [...(earlier?.kinds ?? []).filter((k) => k !== ev.counter), ev.counter] };
    add(o, controllerOf(s, o), (e, t) => e === "selfCountersPut" && !t.countersEach && kindOk(t, controllerOf(s, o)) && reached(t) && (!t.countersFirstTime || (t.countersKind === undefined ? first : firstOfKind)), undefined, undefined, undefined, undefined, undefined, undefined, info);
    // "Whenever a +1/+1 counter is put on ~" (Fathom Mage): once for each counter (rulings).
    for (let i = 0; i < ev.amount; i++) add(o, controllerOf(s, o), (e, t) => e === "selfCountersPut" && !!t.countersEach && kindOk(t, controllerOf(s, o)), undefined, undefined, undefined, undefined, undefined, undefined, { amount: 1 });
    // Chapter abilities: "if the number of lore counters on it was less than N and became at least N" (CR 714.2b).
    // With read ahead, the turn it entered only the chapter it has exactly that many lore counters for (CR 702.155a).
    if (ev.counter === "lore" && o.zone === "battlefield") {
      const after = o.counters.lore ?? 0;
      const before = after - ev.amount;
      const readAhead = ((!!compileCard(defOf(s, o)).readAhead && characteristics(s, o).hasPrintedAbilities) || characteristics(s, o).grantedAbilities.some((g) => !!compileGranted(g).readAhead)) && o.enteredTurn === s.turn;
      const from = s.triggerQueue.length;
      add(o, controllerOf(s, o), (e, t) => e === "chapter" && before < t.chapter! && t.chapter! <= after && (!readAhead || t.chapter === after));
      // The final chapter ability: the greatest chapter number among the Saga's chapter abilities (rulings on Narci).
      const last = Math.max(0, ...abilitiesOf(s, o).triggers.map((t) => (t.event === "chapter" ? (t.chapter ?? 0) : 0)));
      for (const t of s.triggerQueue.slice(from)) {
        t.chapter = true;
        if (triggerOf(s, t)?.chapter === last) t.finalChapter = defMv(defOf(s, o));
      }
    }
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      // Botanical Brawler: "if it's the first time +1/+1 counters have been put on that permanent this turn".
      add(w, ctrl, (e, t) => e === "permanentCountersPut" && !t.countersEach && kindOk(t, ctrl) && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false) && !(t.tappedFilter.notSource && id === o.id) && (!t.countersFirstTime || (t.countersKind === undefined ? first : firstOfKind)), undefined, undefined, o, undefined, undefined, undefined, info);
      // "Whenever a -1/-1 counter is put on a creature" (Flourishing Defenses): once for each counter.
      for (let i = 0; i < ev.amount; i++) add(w, ctrl, (e, t) => e === "permanentCountersPut" && !!t.countersEach && kindOk(t, ctrl) && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false) && !(t.tappedFilter.notSource && id === o.id), undefined, undefined, o, undefined, undefined, undefined, { amount: 1 });
    }
    // Moss-Pit Skeleton: "Whenever one or more +1/+1 counters are put on a creature you control, if this card is in your
    // graveyard, ...": only if it's there already (rulings), its owner controlling the ability (CR 113.8).
    if (o.zone === "battlefield") fromGraveyards((w, owner) => add(w, owner, (e, t) => e === "permanentCountersPut" && !t.countersEach && !t.countersFirstTime && kindOk(t, owner) && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, owner, false), undefined, undefined, o, undefined, undefined, undefined, info));
  } else if (ev.type === "playerCountersPut") {
    // "Whenever you put one or more counters on a permanent or player" (All Will Be One): "that much" is how many.
    const info = { amount: ev.amount, player: ev.player };
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentCountersPut" && !!t.countersOrPlayer && (t.countersKind === undefined || t.countersKind === ev.counter) && (!t.countersByYou || ev.by === ctrl), undefined, undefined, undefined, undefined, undefined, undefined, info);
      // "Whenever you get one or more {E}" (Aether Revolt): once for the counters put at once.
      if (ev.counter === "energy" && ctrl === ev.player) add(w, ctrl, (e) => e === "youGetEnergy", undefined, undefined, undefined, undefined, undefined, undefined, info);
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
  } else if (ev.type === "transformed") {
    // "When this creature transforms into [this face]" (CR 701.27e): an ability of the face now up.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfTransformsInto");
    // "Whenever a permanent you control transforms into a Phyrexian" (CR 701.27e): the permanent, as it is now, is the subject.
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentTransformsInto" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false), undefined, undefined, o);
    }
  } else if (ev.type === "doorUnlocked") {
    // "When you unlock this door": an ability of that door, which the Room has now that it's unlocked (CR 709.5h).
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e, t) => e === "selfDoorUnlocked" && t.door === ev.door);
  } else if (ev.type === "roomFullyUnlocked") {
    // "Eerie — ... whenever you fully unlock a Room": the player who did is its controller (CR 709.5e-f).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) === ev.player) add(o, ev.player, (e) => e === "youFullyUnlockRoom", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "becameLevel") {
    // "When this Class becomes level 2": an ability it has from that level on (CR 716.2a), so it has it now.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e, t) => e === "selfBecomesLevel" && t.level === ev.level);
  } else if (ev.type === "crewed") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesCrewed");
  } else if (ev.type === "crews") {
    // "Whenever ~ crews a Vehicle" (CR 702.122d): the creature tapped for the cost, "that Vehicle" the one it crewed.
    const o = s.objects[ev.id];
    const vehicle = s.objects[ev.vehicle];
    if (o?.zone === "battlefield" && vehicle) add(o, controllerOf(s, o), (e) => e === "selfCrewsVehicle", undefined, undefined, vehicle);
  } else if (ev.type === "phases") {
    for (const id of ev.ids) {
      const o = obj(s, id);
      add(o, controllerOf(s, o), (e) => e === (ev.how === "in" ? "selfPhasesIn" : "selfPhasesOut"));
    }
  } else if (ev.type === "becameMonstrous") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfBecomesMonstrous", undefined, undefined, undefined, undefined, ev.x);
  } else if (ev.type === "becameRenowned") {
    // Relic Seeker, Valeron Wardens (CR 702.112b).
    const o = obj(s, ev.id);
    const you = controllerOf(s, o);
    add(o, you, (e) => e === "selfBecomesRenowned");
    if (objIsType(s, o, "Creature"))
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) === you) add(w, you, (e) => e === "creatureYouControlBecomesRenowned", undefined, undefined, o);
      }
  } else if (ev.type === "evolved") {
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfEvolves");
  } else if (ev.type === "explored") {
    // "Whenever a creature you control explores" (Wildgrowth Walker): even one that has left the battlefield (rulings),
    // a creature as it last existed there (CR 701.44c).
    const o = s.objects[ev.id];
    const creature = o && (o.zone === "battlefield" ? objIsType(s, o, "Creature") : defOf(s, o).types.includes("Creature"));
    if (o && creature)
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) === ev.controller) add(w, ev.controller, (e, t) => e === "creatureYouControlExplores" && (!t.explored || t.explored === ev.revealed), undefined, undefined, o);
      }
  } else if (ev.type === "lostGame") {
    // "Whenever another player loses the game" (Sengir): the permanents still on the battlefield once they've left.
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (you !== ev.player) add(o, you, (e) => e === "anotherPlayerLosesGame", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "connived") {
    // "Whenever a creature you control connives" (Iron Monger, Ultron): even one that has left the battlefield (Toluz
    // rulings), as it last existed there (CR 701.50b).
    const o = s.objects[ev.id];
    const creature = o && (o.zone === "battlefield" ? objIsType(s, o, "Creature") : defOf(s, o).types.includes("Creature"));
    if (o && creature)
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) === ev.controller) add(w, ev.controller, (e) => e === "creatureYouControlConnives", undefined, undefined, o);
      }
  } else if (ev.type === "mutates") {
    // "Whenever this creature mutates" (CR 702.140d): an ability of the merged permanent, from any of its components.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e) => e === "selfMutates");
    // "Whenever a creature you control mutates" (Essence Symbiote): the merged creature is the subject.
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentMutates" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false), undefined, undefined, o);
    }
  } else if (ev.type === "turnedFaceUp") {
    const o = obj(s, ev.id);
    // An X in its morph or disguise cost is the X its own abilities use (CR 702.37f, 702.168e).
    add(o, controllerOf(s, o), (e) => e === "selfTurnedFaceUp", undefined, undefined, undefined, undefined, ev.x);
    // "When enchanted creature is turned face up" (Fatal Mutation): the Auras on it.
    addHosted(o, (e) => e === "selfTurnedFaceUp");
    // "Whenever a permanent (you control) is turned face up": the permanent is the subject.
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const ctrl = controllerOf(s, w);
      add(w, ctrl, (e, t) => e === "permanentTurnedFaceUp" && !!t.tappedFilter && objectMatches(s, t.tappedFilter, o, ctrl, false) && (!t.turnedByYou || ev.by === ctrl), undefined, undefined, o);
    }
  } else if (ev.type === "attacks") {
    const o = obj(s, ev.id);
    causedBy = { event: "attacks", objs: [{ o, controller: controllerOf(s, o) }] };
    // Is it attacking `pid` ("attacks you"), or them or a planeswalker they control (CR 506.2: `attacking` is then the
    // planeswalker's controller)?
    const attackingYou = (a: GameObject, pid: PlayerId) => {
      const opp = a.attacking !== undefined && a.attacking !== pid && opponents(s, pid).includes(a.attacking);
      return { player: a.attacking === pid && !a.attackingPermanent, orPlaneswalker: a.attacking === pid, opponent: opp && !a.attackingPermanent, opponentOrPlaneswalker: opp && a.attackingPermanent?.battleController === undefined };
    };
    // "Defending player" is the player it attacked as it became an attacking creature (myriad rulings).
    add(o, controllerOf(s, o), (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && t.host !== "orSelf" && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.attacksPlayer || !o.attackingPermanent) && (!t.attacksBattle || o.attackingPermanent?.battleController !== undefined) && (!t.firstAttack || o.attacked?.n === 1) && (!t.training || trains(s, o)) && (!t.withOthers || othersAttacking(s, o, t.withOthersType, t.withOthersToken) >= t.withOthers), undefined, undefined, undefined, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
    // "Whenever ~ or equipped creature attacks" (Tanuki Transplanter): about ~ itself here, the subject.
    add(o, controllerOf(s, o), (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && t.host === "orSelf" && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.attacksPlayer || !o.attackingPermanent) && (!t.attacksBattle || o.attackingPermanent?.battleController !== undefined) && (!t.firstAttack || o.attacked?.n === 1) && (!t.training || trains(s, o)) && (!t.withOthers || othersAttacking(s, o, t.withOthersType, t.withOthersToken) >= t.withOthers), undefined, undefined, o, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
    // Glimmer Lens: "Whenever equipped creature and at least one other creature attack" (`withOthers`, as for battalion).
    addHosted(o, (e, t) => (e === "selfAttacks" || e === "selfAttacksOrBlocks") && (!t.attacksMostLife || attacksMostLife(s, o)) && (!t.withOthers || othersAttacking(s, o, t.withOthersType, t.withOthersToken) >= t.withOthers), undefined, o, o.attacking !== undefined ? { player: o.attacking } : undefined);
    // "Whenever a creature you control attacks": each permanent its controller controls that watches for one (CR 508.3a).
    const by = controllerOf(s, o);
    // "Whenever a creature attacks": anyone's, for the watcher's controller.
    const attackWatch = (w: GameObject, wc: PlayerId, triggers?: TriggeredAbility[]) => {
      const at = attackingYou(o, wc);
      add(w, wc, (e, t) => e === "creatureYouControlAttacks" && !!t.attacker && (wc === by || !!t.attacker.anyone) && !(t.attacker.other && w.id === o.id) && (!t.attacker.attacksYou || at[t.attacker.attacksYou]) && objectMatches(s, bindChosen(t.attacker.filter, w.chosen), o, wc, false), triggers, undefined, o, undefined, undefined, undefined, o.attacking !== undefined ? { player: o.attacking } : undefined);
    };
    for (const id of s.battlefield) attackWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromEmblems((w, wc) => attackWatch(w, wc));
    // "Whenever your commander attacks, you may pay {2}. If you do, return ~ from your graveyard to your hand" (Vivi's
    // Persistence): cards in graveyards, their owners watching (CR 113.6m, 113.8).
    fromGraveyards((w, owner) => attackWatch(w, owner));
    // "Until end of turn, whenever a Kraken, ... or Serpent attacks, draw a card" (Summon: Leviathan, CR 603.7b).
    fromFloating((src, ctrl, triggers) => attackWatch(src, ctrl, triggers));
    // "Whenever your Ring-bearer attacks, draw a card, then discard a card" (CR 701.54c).
    if (isRingBearer(s, o)) ringTrigger(s, controllerOf(s, o), 0);
    // "Whenever a creature attacks enchanted player": not one attacking a planeswalker of theirs (rulings).
    if (o.attacking !== undefined && !o.attackingPermanent)
      for (const id of s.battlefield) {
        const aura = obj(s, id);
        if (aura.attachedToPlayer === o.attacking) add(aura, controllerOf(s, aura), (e) => e === "creatureAttacksEnchantedPlayer", undefined, undefined, o);
      }
    causedBy = null;
  } else if (ev.type === "creaturesDamagedPlayer") {
    // "Whenever one or more creatures deal combat damage to you": once for the step's combat damage (CR 510.2, 603.2c).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (controllerOf(s, o) !== ev.player) continue;
      add(o, ev.player, (e) => e === "creaturesDealCombatDamageToYou");
      // Norn's Decree: once for each opponent whose creatures dealt it (CR 603.2c), that opponent being "that opponent".
      for (const c of ev.controllers) if (c !== ev.player) add(o, ev.player, (e) => e === "opponentCreaturesDealCombatDamageToYou", undefined, undefined, undefined, undefined, undefined, undefined, { player: c });
    }
  } else if (ev.type === "creaturesDamagedPlayers") {
    // Nelly Borca: an opponent's creatures dealt combat damage to one or more of the watcher's opponents; that opponent
    // is "the controller of those creatures".
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const w = controllerOf(s, o);
      const opp = opponents(s, w);
      if (opp.includes(ev.controller) && ev.players.some((p) => opp.includes(p))) add(o, w, (e) => e === "opponentCreaturesDamageYourOpponents", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.controller });
    }
  } else if (ev.type === "groupAttack" || ev.type === "groupCombatDamage") {
    const want = ev.type === "groupAttack" ? "creaturesYouControlAttack" : "creaturesYouControlDealCombatDamageToPlayer";
    causedBy = { event: ev.type === "groupAttack" ? "attacks" : "combatDamage", objs: ev.ids.filter((x) => s.objects[x]).map((x) => ({ o: obj(s, x), controller: ev.controller })) };
    // `list`: a delayed trigger's own (Forth Eorlingas!), not the object's.
    const groupWatch = (o: GameObject, anyone = false, list?: TriggeredAbility[]) => {
      // Only the creatures that match count ("one or more Rogues you control"): "that much" is what they dealt.
      const fits = (t: TriggeredAbility) =>
        // Any player's attack (Killian, Decisive Mentor: "creatures that are enchanted by an Aura you control"): "you" is
        // the watcher's controller.
        ev.ids.map((x, i) => [x, i] as const).filter(([x]) => s.objects[x] && (!t.group || objectMatches(s, t.group, obj(s, x), anyone ? controllerOf(s, o) : ev.controller, false)) && (!t.selfOrCommander || x === o.id || (!!obj(s, x).isCommander && obj(s, x).owner === ev.controller)));
      for (const t of list ?? abilitiesOf(s, o).triggers) {
        if (t.event !== want || !!t.anyoneAttacks !== anyone) continue;
        if (t.anotherPlayer && controllerOf(s, o) === ev.controller) continue;
        if (t.selfAnd && !(ev.ids.includes(o.id) && ev.ids.some((x) => x !== o.id && s.objects[x] && objectMatches(s, t.selfAnd!, obj(s, x), ev.controller, false)))) continue;
        // "To a player or battle": only those are about a battle dealt it (CR 310).
        if (ev.type === "groupCombatDamage" && ev.battle !== undefined && !t.orBattle) continue;
        const hit = fits(t);
        if (hit.length < (t.minAttackers ?? 1)) continue;
        if (t.minTotalPower && hit.reduce((n, [x]) => n + power(s, obj(s, x)), 0) < t.minTotalPower) continue;
        const amount = ev.type === "groupCombatDamage" ? hit.reduce((n, [, i]) => n + ev.amounts[i]!, 0) : undefined;
        const same = (tt: TriggeredAbility) => tt.event === want && tt.body.text === t.body.text && JSON.stringify(tt.group) === JSON.stringify(t.group) && tt.minAttackers === t.minAttackers && tt.minTotalPower === t.minTotalPower && !!tt.anyoneAttacks === anyone && !!tt.perPlayer === !!t.perPlayer && !!tt.selfOrCommander === !!t.selfOrCommander;
        const group = hit.map(([x]) => ({ id: x, zc: obj(s, x).zoneChanges ?? 0 }));
        // "Whenever another player attacks": the attacking player, and how many of those creatures attack this one's
        // controller, as they were declared (rulings on Firemane Commando).
        const watcher = controllerOf(s, o);
        // Otherwise, "that many": how many of them attacked (The Ur-Dragon).
        // Any player's attack (Norn's Decree): "the attacking player".
        const attacked = t.anotherPlayer ? { player: ev.controller, amount: hit.filter(([x]) => obj(s, x).attacking === watcher && !obj(s, x).attackingPermanent).length } : ev.type === "groupAttack" && !anyone ? { amount: hit.length, group } : anyone ? { player: ev.controller, ...(ev.type === "groupAttack" ? { group } : {}) } : undefined;
        // "Whenever one or more creatures attack one of your opponents" (Frontier Warmonger): once for each of the
        // watcher's opponents attacked, about the creatures attacking them (CR 508.3e).
        if (t.attacksOpponent) {
          for (const p of s.turnOrder.filter((q) => opponents(s, watcher).includes(q))) {
            const at = hit.filter(([x]) => attackingYouNow(s, x, p, !!t.attacksOpponent!.orPlaneswalkers)).map(([x]) => ({ id: x, zc: obj(s, x).zoneChanges ?? 0 }));
            if (at.length) add(o, watcher, (_, tt) => same(tt) && JSON.stringify(tt.attacksOpponent) === JSON.stringify(t.attacksOpponent), list, undefined, undefined, undefined, undefined, undefined, { player: p, group: at });
          }
          continue;
        }
        // "Whenever you attack a player": once for each player the matching creatures attack (CR 508.3e).
        if (t.perPlayer) {
          for (const p of s.turnOrder)
            if (hit.filter(([x]) => obj(s, x).attacking === p && !obj(s, x).attackingPermanent).length >= (t.minAttackers ?? 1))
              add(o, ev.controller, (_, tt) => same(tt), list, undefined, undefined, undefined, undefined, undefined, { player: p });
          // Rigo: each planeswalker attacked too, its controller as "that player".
          if (t.perWalker)
            for (const w of [...new Set(hit.map(([x]) => obj(s, x).attackingPermanent?.id).filter((w): w is ObjectId => w !== undefined))])
              if (s.objects[w] && objIsType(s, obj(s, w), "Planeswalker") && hit.filter(([x]) => obj(s, x).attackingPermanent?.id === w).length >= (t.minAttackers ?? 1))
                add(o, ev.controller, (_, tt) => same(tt), list, undefined, undefined, undefined, undefined, undefined, { player: controllerOf(s, obj(s, w)) });
          continue;
        }
        add(o, anyone ? watcher : ev.controller, (_, tt) => same(tt) && !(ev.type === "groupCombatDamage" && ev.battle !== undefined && !tt.orBattle), list, undefined, undefined, undefined, undefined, undefined, ev.type === "groupCombatDamage" ? { player: ev.player, amount, group } : attacked);
      }
    };
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === ev.controller) groupWatch(obj(s, id));
    // "Whenever one or more creatures attack" (Duelist's Heritage): every permanent's, whoever attacked.
    if (ev.type === "groupAttack") for (const id of s.battlefield) groupWatch(obj(s, id), true);
    fromGraveyards((o, owner) => owner === ev.controller && groupWatch(o));
    // An emblem's too (Lolth's: "whenever an opponent is dealt combat damage by one or more creatures you control").
    fromEmblems((o, owner) => owner === ev.controller && groupWatch(o));
    // "Whenever one or more creatures you control deal combat damage to one or more players this turn" (Forth Eorlingas!).
    // "Whenever you attack this turn" (Dalkovan Encampment): its controller's attacks.
    fromFloating((src, ctrl, triggers) => ctrl === ev.controller && groupWatch(src, false, triggers));
    // "Whenever an opponent attacks you with two or more creatures" (Mangara): each of the attacker's opponents counts
    // the ones attacking them (and their planeswalkers, for Mangara).
    if (ev.type === "groupAttack") {
      for (const id of s.battlefield) {
        const o = obj(s, id);
        const you = controllerOf(s, o);
        if (you === ev.controller) continue;
        for (const t of abilitiesOf(s, o).triggers) {
          if (t.event !== "opponentAttacksYou" || !t.attacksYou) continue;
          // Mila, Crafty Companion: "attacks one or more planeswalkers you control": only those attacking a planeswalker.
          const at = ev.ids.filter((x) => attackingYouNow(s, x, you, !!t.attacksYou!.orPlaneswalkers) && (!t.attacksYou!.walkersOnly || !!obj(s, x).attackingPermanent));
          if (at.length < t.attacksYou.min) continue;
          if (t.attacksYou.perWalker) {
            for (const w of new Set(at.map((x) => obj(s, x).attackingPermanent!.id)))
              add(o, you, (e, tt) => e === "opponentAttacksYou" && tt.body.text === t.body.text, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.controller, group: at.filter((x) => obj(s, x).attackingPermanent!.id === w).map((x) => ({ id: x, zc: obj(s, x).zoneChanges ?? 0 })) });
            continue;
          }
          const group = at.map((x) => ({ id: x, zc: obj(s, x).zoneChanges ?? 0 }));
          const info = { player: ev.controller, group, amount: at.length, ...(t.attacksYou.recheck ? { attackingYou: { you, min: t.attacksYou.min, orPlaneswalkers: true as const } } : {}) };
          add(o, you, (e, tt) => e === "opponentAttacksYou" && tt.body.text === t.body.text, undefined, undefined, undefined, undefined, undefined, undefined, info);
        }
      }
    }
    // "Whenever a player attacks one of your opponents" (Breena): once for each of the watcher's opponents that player's
    // creatures attack, not their planeswalkers or battles (CR 508.3e). The attacking player may be the watcher's controller.
    if (ev.type === "groupAttack") {
      const attacked = [...new Set(ev.ids.map((x) => s.objects[x]).filter((a) => a?.attacking !== undefined && !a.attackingPermanent).map((a) => a!.attacking!))];
      for (const id of s.battlefield) {
        const o = obj(s, id);
        const you = controllerOf(s, o);
        if (!abilitiesOf(s, o).triggers.some((t) => t.event === "playerAttacksYourOpponent")) continue;
        const theirs = s.turnOrder.filter((q) => attacked.includes(q) && opponents(s, you).includes(q));
        for (const p of theirs) add(o, you, (e, t) => e === "playerAttacksYourOpponent" && !t.anyOpponent, undefined, undefined, undefined, undefined, undefined, undefined, { player: p, attacker: ev.controller });
        // "One or more of your opponents" (Jolene): once.
        if (theirs.length) add(o, you, (e, t) => e === "playerAttacksYourOpponent" && !!t.anyOpponent, undefined, undefined, undefined, undefined, undefined, undefined, { player: theirs[0]!, attacker: ev.controller });
      }
    }
    // "Whenever enchanted player is attacked": once, however many creatures attack them; not for a planeswalker (rulings).
    if (ev.type === "groupAttack") {
      const attacked = new Set(ev.ids.map((x) => s.objects[x]).filter((a) => a?.attacking !== undefined && !a.attackingPermanent).map((a) => a!.attacking!));
      for (const id of s.battlefield) {
        const aura = obj(s, id);
        if (aura.attachedToPlayer !== undefined && attacked.has(aura.attachedToPlayer))
          add(aura, controllerOf(s, aura), (e) => e === "enchantedPlayerAttacked", undefined, undefined, undefined, undefined, undefined, undefined, { player: aura.attachedToPlayer });
      }
    }
    // Tenuous Truce: "When you attack enchanted opponent or a planeswalker they control or when they attack you or a
    // planeswalker you control": once for the declaration, if a creature attacks the other of the two (CR 506.2, 508.3a).
    if (ev.type === "groupAttack") {
      for (const id of s.battlefield) {
        const aura = obj(s, id);
        const them = aura.attachedToPlayer;
        if (them === undefined) continue;
        const you = controllerOf(s, aura);
        const other = ev.controller === you ? them : ev.controller === them ? you : undefined;
        if (other !== undefined && other !== ev.controller && ev.ids.some((x) => attackingYouNow(s, x, other, true)))
          add(aura, you, (e) => e === "attackBetweenYouAndEnchanted", undefined, undefined, undefined, undefined, undefined, undefined, { player: them });
      }
    }
    causedBy = null;
  } else if (ev.type === "lastCounterRemoved") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield" && ev.counter === "time") add(o, controllerOf(s, o), (e) => e === "selfLastTimeCounterRemoved");
    // A Siege's intrinsic "When the last defense counter is removed from this permanent" (CR 310.12b).
    if (o?.zone === "battlefield" && ev.counter === "defense" && isSiege(s, o)) siegeTrigger(s, o);
    // Suspend's third ability (CR 702.62a), whatever removed the counter (rulings): its owner may cast it.
    if (o?.zone === "exile" && ev.counter === "time" && hasSuspend(s, o))
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
    causedBy = { event: "attacks", objs: [{ o: attacker, controller: you }] };
    add(attacker, you, (e) => e === "selfAttacksAlone", undefined, undefined, undefined, undefined, undefined, undefined, that);
    addHosted(attacker, (e) => e === "selfAttacksAlone", undefined, attacker, that);
    for (const id of s.battlefield)
      if (controllerOf(s, obj(s, id)) === you) add(obj(s, id), you, (e, t) => e === "creatureYouControlAttacksAlone" && (!t.subjectFilter || (t.subjectOrSelf && id === attacker.id) || objectMatches(s, t.subjectFilter, attacker, you, false)), undefined, undefined, attacker, undefined, undefined, undefined, that);
    causedBy = null;
  } else if (ev.type === "dealtDamage") {
    // Its abilities work only on the battlefield; a spell or a card that left isn't "~" any more.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") {
      add(o, controllerOf(s, o), (e, t) => (e === "selfDealsDamage" && ev.amount >= (t.minDamage ?? 0)) || (ev.combat && e === "selfDealsCombatDamage"), undefined, undefined, undefined, undefined, undefined, undefined, { amount: ev.amount });
      addHosted(o, (e, t) => (e === "selfDealsDamage" && ev.amount >= (t.minDamage ?? 0)) || (ev.combat && e === "selfDealsCombatDamage"), undefined, o, { amount: ev.amount });
      // "Until your next turn, whenever either of those creatures deals combat damage" (Tamiyo, Field Researcher).
      if (ev.combat) fromFloating((src, ctrl, triggers) => add(src, ctrl, (e) => e === "selfDealsCombatDamage", triggers, undefined, undefined, undefined, undefined, undefined, { amount: ev.amount }), o);
      // "Whenever a creature you control deals combat damage" (Quilled Greatwurm): the creature is the subject.
      const dealerBy = controllerOf(s, o);
      if (ev.combat)
        for (const id of s.battlefield) {
          const w = obj(s, id);
          if (controllerOf(s, w) === dealerBy) add(w, dealerBy, (e, t) => e === "creatureYouControlDealsCombatDamage" && !!t.dealer && !(t.dealer.other && w.id === o.id) && ((t.dealer.orSelf && w.id === o.id) || objectMatches(s, t.dealer.filter, o, dealerBy, false)), undefined, undefined, o, undefined, undefined, undefined, { amount: ev.amount });
        }
    }
  } else if (ev.type === "damagedPlayer") {
    // "Whenever ~ deals damage to a player / an opponent": once for each player dealt damage (CR 603.2c).
    const o = s.objects[ev.source];
    const info = { player: ev.player, amount: ev.amount };
    if (o?.zone === "battlefield") {
      const you = controllerOf(s, o);
      add(o, you, (e, t) => e === "selfDealsDamageToPlayer" && !(t.toOpponent && ev.player === you) && ev.amount >= (t.minDamage ?? 0), undefined, undefined, undefined, undefined, undefined, undefined, info);
      addHosted(o, (e) => e === "selfDealsDamageToPlayer", undefined, o, info);
    }
    // "Whenever a source you control deals noncombat damage to an opponent" (Niv-Mizzet, Visionary): the source's
    // controller's permanents, once for each source and player.
    // "Whenever a source you control deals 5 or more damage to a player" (Dragonborn Champion): that much at once (rulings).
    if (ev.by !== undefined)
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) === ev.by) add(w, ev.by, (e, t) => e === "sourceYouControlDamagesOpponent" && (ev.by !== ev.player || !!t.anyPlayer) && !(t.otherSource && ev.source === w.id) && !(t.noncombatOnly && ev.combat) && ev.amount >= (t.minDamage ?? 0), undefined, undefined, undefined, undefined, undefined, undefined, info);
      }
    // Pain Magnification: "Whenever an opponent is dealt 3 or more damage by a single source": every permanent whose
    // controller that player is an opponent of, once for each source (rulings).
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const you = controllerOf(s, w);
      if (opponents(s, you).includes(ev.player)) add(w, you, (e, t) => e === "opponentDealtDamageBySource" && ev.amount >= (t.minDamage ?? 0), undefined, undefined, undefined, undefined, undefined, undefined, info);
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
  } else if (ev.type === "sourceDealtDamage") {
    // "Whenever another source you control deals exactly 1 damage to a permanent or player" (Ghyrson Starn): its
    // controller's permanents, once for each source and recipient (rulings); the permanent is the subject.
    const hit = ev.id ? s.objects[ev.id] : undefined;
    // Elesh Norn: "a source an opponent controls deals damage to you or a permanent you control": the damaged player's, or
    // the damaged permanent's controller's, once for each source and recipient (rulings).
    const hurt = ev.player ?? (hit ? controllerOf(s, hit) : undefined);
    if (hurt !== undefined && ev.by !== hurt && opponents(s, hurt).includes(ev.by))
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) === hurt) add(w, hurt, (e) => e === "opponentSourceDamagesYouOrYours", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.by, amount: ev.amount });
      }
    // Hooded Blightfang: a creature its controller controls dealing damage to a planeswalker (or a player), with deathtouch
    // as it deals it (rulings); the subject is the creature or the planeswalker.
    const dealer = s.objects[ev.source];
    const toWalker = !!hit && hit.zone === "battlefield" && objIsType(s, hit, "Planeswalker");
    if (dealer?.zone === "battlefield" && objIsType(s, dealer, "Creature") && controllerOf(s, dealer) === ev.by && (toWalker || ev.player !== undefined))
      for (const id of s.battlefield) {
        const w = obj(s, id);
        if (controllerOf(s, w) !== ev.by) continue;
        const fits = (t: TriggeredAbility, dealt: boolean) => !!t.damageTo && !!t.damageTo.subjectDealt === dealt && (!t.damageTo.combat || !!ev.combat) && (toWalker || t.damageTo.what === "playerOrPlaneswalker") && (t.damageTo.self ? w.id === dealer.id : objectMatches(s, t.dealer!.filter, dealer, ev.by, false));
        add(w, ev.by, (e, t) => e === "yourCreatureDealsDamage" && fits(t, false), undefined, undefined, dealer, undefined, undefined, undefined, { amount: ev.amount, ...(ev.player !== undefined ? { player: ev.player } : {}) });
        if (toWalker) add(w, ev.by, (e, t) => e === "yourCreatureDealsDamage" && fits(t, true), undefined, undefined, hit, undefined, undefined, undefined, { amount: ev.amount });
      }
    for (const id of s.battlefield) {
      const w = obj(s, id);
      if (controllerOf(s, w) !== ev.by) continue;
      add(w, ev.by, (e, t) => e === "sourceYouControlDealsDamage" && !!t.sourceDamage && ev.amount === t.sourceDamage.exactly && !(t.sourceDamage.other && ev.source === w.id), undefined, undefined, hit, undefined, undefined, undefined, { amount: ev.amount, ...(ev.player !== undefined ? { player: ev.player } : {}) });
    }
  } else if (ev.type === "damagedCreature") {
    const o = s.objects[ev.source];
    const hit = s.objects[ev.id];
    if (o?.zone === "battlefield" && hit) {
      const info = { amount: ev.amount, ...(ev.excess ? { excess: ev.excess } : {}) };
      // Vampire Slayer: "deals damage to a Vampire", only a creature that fits (as it's dealt the damage).
      add(o, controllerOf(s, o), (e, t) => (e === "selfDealsDamageToCreature" || (ev.combat && e === "selfDealsCombatDamageToCreature")) && (!t.subjectFilter || objectMatches(s, t.subjectFilter, hit, controllerOf(s, o), false)), undefined, undefined, hit, undefined, undefined, undefined, info);
      addHosted(o, (e) => e === "selfDealsDamageToCreature" || (ev.combat && e === "selfDealsCombatDamageToCreature"), undefined, hit, info);
      // Toxin Sliver: "Whenever a Sliver deals combat damage to a creature": anyone's, as it deals the damage.
      if (ev.combat)
        for (const id of s.battlefield) {
          const w = obj(s, id);
          const wc = controllerOf(s, w);
          add(w, wc, (e, t) => e === "creatureDealsCombatDamageToCreature" && !!t.dealer && objectMatches(s, t.dealer.filter, o, wc, false), undefined, undefined, hit, undefined, undefined, undefined, info);
        }
    }
  } else if (ev.type === "spellDealtDamage") {
    // "Whenever an instant or sorcery spell you control deals damage to an opponent or battle" (Bloodfeather Phoenix, in
    // a graveyard too): once for each player or battle dealt damage (CR 603.2c).
    const fits = (t: TriggeredAbility) => !!t.spellDamage && printedMatches(t.spellDamage.filter, ev.card) && (ev.battle !== undefined ? !!t.spellDamage.orBattle : ev.player !== ev.by);
    const watch = (w: GameObject) => add(w, ev.by, (e, t) => e === "spellYouControlDealsDamage" && fits(t));
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === ev.by) watch(obj(s, id));
    fromGraveyards((o, owner) => owner === ev.by && watch(o));
  } else if (ev.type === "playersDealtDamage") {
    // "Whenever one or more Pirates you control deal damage to your opponents" (Malcolm): the permanents its controller
    // controlled as they dealt it; one that has left as it last existed (its types and subtypes then).
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      for (const t of abilitiesOf(s, w).triggers) {
        const g = t.event === "groupDealsDamageToPlayers" ? t.damageGroup : undefined;
        if (!g) continue;
        const fits = (h: (typeof ev.hits)[number]) => {
          if ((h.by !== wc && !g.anyController) || h.source === undefined || (g.opponents && !opponents(s, wc).includes(h.player)) || (g.combat && !h.combat)) return false;
          const o = s.objects[h.source];
          if (o?.zone === "battlefield") return objectMatches(s, g.filter, o, wc, false);
          const { kind: _k, text: _t, types = [], subtypes = [], ...rest } = g.filter;
          return !Object.values(rest).some((v) => v !== undefined && !(Array.isArray(v) && !v.length)) && types.every((x) => h.types.includes(x)) && subtypes.every((x) => h.subtypes.includes(x));
        };
        const hit = [...new Set(ev.hits.filter(fits).map((h) => h.player))];
        if (!hit.length) continue;
        const same = (e: string, tt: TriggeredAbility) => e === "groupDealsDamageToPlayers" && tt.body.text === t.body.text && JSON.stringify(tt.damageGroup) === JSON.stringify(g);
        if (g.perPlayer) for (const p of s.turnOrder.filter((q) => hit.includes(q))) add(w, wc, same, undefined, undefined, undefined, undefined, undefined, undefined, { player: p });
        else add(w, wc, same, undefined, undefined, undefined, undefined, undefined, undefined, { amount: hit.length, players: hit });
      }
    }
  } else if (ev.type === "excessDamage") {
    // "Whenever a creature an opponent controls is dealt excess damage" (CR 120.10): once for each permanent, which is
    // the subject and its excess "that excess damage"; "one or more creatures ... are dealt" once for all of them.
    const fits = (t: TriggeredAbility, hit: GameObject, wc: PlayerId) => !!t.excess && !(t.excess.noncombat && ev.combat) && objectMatches(s, t.excess.filter, hit, wc, false);
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      for (const h of ev.hits) add(w, wc, (e, t) => e === "permanentDealtExcess" && !t.excess?.oneOrMore && fits(t, obj(s, h.id), wc), undefined, undefined, obj(s, h.id), undefined, undefined, undefined, { amount: h.amount, player: h.controller });
      add(w, wc, (e, t) => e === "permanentDealtExcess" && !!t.excess?.oneOrMore && ev.hits.some((h) => fits(t, obj(s, h.id), wc)));
    }
  } else if (ev.type === "wasDealtDamage") {
    // "Whenever ~ is dealt damage", "When enchanted creature is dealt damage": it's still on the battlefield as the
    // damage is dealt, before state-based actions (CR 704.3), so it triggers even if the damage destroys it.
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") {
      add(o, controllerOf(s, o), (e) => e === "selfIsDealtDamage" || (e === "selfIsDealtNoncombatDamage" && !ev.combat) || (e === "selfIsDealtCombatDamage" && !!ev.combat), undefined, undefined, o, undefined, undefined, undefined, { amount: ev.amount });
      addHosted(o, (e) => e === "selfIsDealtDamage", undefined, o, { amount: ev.amount });
      // "Whenever a Dragon you control is dealt damage" (Wrathful Red Dragon): that permanent is the subject.
      for (const id of s.battlefield) {
        const w = obj(s, id);
        const wc = controllerOf(s, w);
        add(w, wc, (e, t) => e === "permanentIsDealtDamage" && !!t.dealtFilter && objectMatches(s, t.dealtFilter, o, wc, false), undefined, undefined, o, undefined, undefined, undefined, { amount: ev.amount });
      }
      // "Until end of turn, whenever a creature an opponent controls is dealt damage, destroy it." (Green Dragon): a delayed
      // trigger with a duration (CR 603.7b), that permanent the subject.
      fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "permanentIsDealtDamage" && !!t.dealtFilter && objectMatches(s, t.dealtFilter, o, ctrl, false), triggers, undefined, o, undefined, undefined, undefined, { amount: ev.amount }));
    }
  } else if (ev.type === "dealtDamageBySource") {
    const o = s.objects[ev.id];
    if (o?.zone === "battlefield") add(o, controllerOf(s, o), (e) => e === "selfDealtDamageBySource", undefined, undefined, o, undefined, undefined, undefined, { amount: ev.amount, player: ev.by });
    // "Until your next turn, whenever a creature deals combat damage to ~, destroy that creature" (Vraska the Unseen): once
    // for each creature dealing it combat damage (only creatures deal combat damage, CR 510.1), that creature the subject.
    const dealer = ev.combat && ev.srcId ? s.objects[ev.srcId] : undefined;
    if (o?.zone === "battlefield" && dealer) {
      add(o, controllerOf(s, o), (e) => e === "creatureDealsCombatDamageToSelf", undefined, undefined, dealer, undefined, undefined, undefined, { amount: ev.amount, player: ev.by });
      fromFloating((src, ctrl, triggers) => add(src, ctrl, (e) => e === "creatureDealsCombatDamageToSelf", triggers, undefined, dealer, undefined, undefined, undefined, { amount: ev.amount, player: ev.by }), o);
    }
  } else if (ev.type === "combatDamageToPlayer" && ev.planeswalker) {
    // "Whenever ~ deals combat damage to a player or planeswalker": nothing else is about a planeswalker dealt it.
    const o = obj(s, ev.id);
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && !!t.orPlaneswalker, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount });
    fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "selfDealsCombatDamageToPlayer" && !!t.orPlaneswalker, triggers, undefined, undefined, undefined, undefined, undefined, { player: ev.player, amount: ev.amount }), o);
  } else if (ev.type === "combatDamageToPlayer" && ev.battle) {
    // "Whenever ~ deals combat damage to a player or battle" (CR 310): only those are about a battle dealt it.
    const o = obj(s, ev.id);
    const info = { amount: ev.amount };
    causedBy = { event: "combatDamage", objs: [{ o, controller: controllerOf(s, o) }] };
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && !!t.orBattle, undefined, undefined, undefined, undefined, undefined, undefined, info);
    addHosted(o, (e, t) => e === "selfDealsCombatDamageToPlayer" && !!t.orBattle, undefined, o, info);
    const dealerBy = controllerOf(s, o);
    for (const id of s.battlefield) {
      const w = obj(s, id);
      if (controllerOf(s, w) !== dealerBy) continue;
      add(w, dealerBy, (e, t) => e === "creatureYouControlDealsCombatDamageToPlayer" && !!t.orBattle && !!t.dealer && !(t.dealer.other && w.id === o.id) && ((t.dealer.orSelf && w.id === o.id) || objectMatches(s, t.dealer.filter, o, dealerBy, false)), undefined, undefined, o, undefined, undefined, undefined, info);
    }
    fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "selfDealsCombatDamageToPlayer" && !!t.orBattle, triggers, undefined, undefined, undefined, undefined, undefined, info), o);
    causedBy = null;
  } else if (ev.type === "combatDamageToPlayer") {
    const o = obj(s, ev.id);
    const info = { player: ev.player, amount: ev.amount };
    causedBy = { event: "combatDamage", objs: [{ o, controller: controllerOf(s, o) }] };
    // Cartographer's Hawk: "to a player who controls more lands than you", as the damage is dealt.
    const lands = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length;
    const selfHit = (t: TriggeredAbility) => !(t.firstHit && !ev.first) && !(t.ifNotRenowned && o.renowned) && !(t.toOpponent && ev.player === controllerOf(s, o)) && !(t.toMoreLands && lands(ev.player) <= lands(controllerOf(s, o)));
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && t.host !== "orSelf" && selfHit(t), undefined, undefined, undefined, undefined, undefined, undefined, info);
    // "Whenever ~ or equipped creature deals combat damage to a player, you may sacrifice it" (Ogre-Head Helm): ~ itself is
    // the subject when it dealt the damage.
    add(o, controllerOf(s, o), (e, t) => e === "selfDealsCombatDamageToPlayer" && t.host === "orSelf" && selfHit(t), undefined, undefined, o, undefined, undefined, undefined, info);
    addHosted(o, (e) => e === "selfDealsCombatDamageToPlayer", undefined, o, info);
    // "Whenever a creature you control deals combat damage to a player": the creature is the subject.
    const dealerBy = controllerOf(s, o);
    const dealWatch = (w: GameObject) => add(w, dealerBy, (e, t) => e === "creatureYouControlDealsCombatDamageToPlayer" && !!t.dealer && !(t.dealer.other && w.id === o.id) && ((t.dealer.orSelf && w.id === o.id) || objectMatches(s, t.dealer.filter, o, dealerBy, false)) && !(t.toOpponent && ev.player === dealerBy) && !(t.toEnchanted && w.attachedToPlayer !== ev.player), undefined, undefined, o, undefined, undefined, undefined, info);
    for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === dealerBy) dealWatch(obj(s, id));
    // "Whenever a creature deals combat damage to one of your opponents" (Edric): anyone's creature, to an opponent of
    // the watcher's controller (its own controller's watchers saw it above).
    for (const id of s.battlefield) {
      const w = obj(s, id);
      const wc = controllerOf(s, w);
      // Brood Sliver's "to a player": to the watcher's controller too.
      if (wc !== dealerBy) add(w, wc, (e, t) => e === "creatureYouControlDealsCombatDamageToPlayer" && !!t.dealer?.anyone && !(t.toOpponent && ev.player === wc) && !(t.toEnchanted && w.attachedToPlayer !== ev.player) && objectMatches(s, t.dealer.filter, o, wc, false), undefined, undefined, o, undefined, undefined, undefined, info);
    }
    fromEmblems((w, owner) => owner === dealerBy && dealWatch(w));
    // "Whenever a Vehicle you control deals combat damage to a player, you may return this card from your graveyard to
    // your hand" (Adéwalé, Breaker of Chains): works only there (CR 113.6m), its owner the "you".
    fromGraveyards((w, owner) => owner === dealerBy && dealWatch(w));
    // "Until end of turn, whenever ~ deals combat damage to a player" (Lyra), "... a creature you control" (Mistway Spy).
    fromFloating((src, ctrl, triggers) => add(src, ctrl, (e, t) => e === "selfDealsCombatDamageToPlayer" && !(t.toOpponent && ev.player === ctrl), triggers, undefined, undefined, undefined, undefined, undefined, info), o);
    fromFloating((src, ctrl, triggers) => ctrl === dealerBy && add(src, ctrl, (e, t) => e === "creatureYouControlDealsCombatDamageToPlayer" && !!t.dealer && !(t.dealer.other && src.id === o.id) && ((t.dealer.orSelf && src.id === o.id) || objectMatches(s, t.dealer.filter, o, ctrl, false)) && !(t.toOpponent && ev.player === ctrl), triggers, undefined, o, undefined, undefined, undefined, info), undefined, ev.player);
    causedBy = null;
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
    let nextCastCascade = false;
    for (const d of ev.copy ? [] : [...(s.nextCast ?? [])]) {
      if (d.controller !== ev.controller || d.turn !== s.turn || !printedMatches(d.filter, ev.card) || (d.fromHand && spell?.castFrom !== "hand")) continue;
      s.nextCast = s.nextCast!.filter((x) => x !== d);
      // "Has cascade": the spell's own cascade ability triggers (CR 702.85a). "Can be cast as though it had flash": used
      // up now, whenever it was cast.
      if (d.flash) continue;
      if (d.uncounterable) {
        if (spell) spell.uncounterableCast = true;
      } else if (d.cascade && spell) {
        nextCastCascade = true;
        s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: CASCADE_BODY, cause: ev.stackId });
      } else if (d.storm) {
        // "Has storm" (Crackling Spellslinger): likewise the spell's own storm ability (CR 702.40a).
        if (spell) s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: STORM_BODY, cause: ev.stackId });
      }
      else if (!d.cascade) s.triggerQueue.push({ sourceId: d.sourceId, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, body: d.body, cause: ev.stackId, ...(d.x ? { x: d.x } : {}) });
    }
    // Casualty's copy only if its casualty cost was paid (CR 702.153a).
    if (spell && !ev.copy) add(spell, ev.controller, (e, t) => e === "selfCast" && (!t.ifKicked || kickedMatches(item?.kicked, t.ifKicked)) && (!t.ifCasualty || !!item?.casualty) && (!t.ifX || (item?.x ?? 0) >= t.ifX) && (!t.ifConspired || !!item?.conspired), compileCard(defOf(s, spell)).triggers, ev.stackId, undefined, undefined, item?.x, item?.kicked, ev.manaSpent ? { manaSpent: ev.manaSpent } : undefined); // Prossh: the mana spent on it (CR 601.2h)
    // Cascade a permanent gives the spells its controller casts: the spell's own ability, one for each (CR 702.85a, 702.85c).
    const granted = spell && item && !ev.copy ? grantedCascades(s, item, spell, ev.controller) : [];
    // "Whenever you cast a spell with cascade" (Aurora Phoenix): printed, or given to it as it was cast.
    const hasCascade = !!spell && (defOf(s, spell).keywords.includes("Cascade") || nextCastCascade || granted.length > 0);
    if (spell && item && !ev.copy) for (const _ of granted) for (let n = triggersAgain(s, spell, ev.controller, null); n >= 0; n--) s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: CASCADE_BODY, cause: ev.stackId });
    // Storm a permanent or an emblem gives the spells its controller casts (Prismari, Ral's emblem): the spell's own (CR 702.40a).
    if (spell && item && !ev.copy)
      for (const src of [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s)])
        for (const g of abilitiesOf(s, src).spellsHaveStorm ?? [])
          if (controllerOf(s, src) === ev.controller && spellMatches(s, g.filter, item))
            for (let n = triggersAgain(s, spell, ev.controller, null); n >= 0; n--) s.triggerQueue.push({ sourceId: spell.id, sourceCardId: cardIdOf(spell), controller: ev.controller, index: -1, body: STORM_BODY, cause: ev.stackId });
    // Vesuvan Duplimancy: the one permanent every target of the spell names, as it was cast (rulings).
    const onlyTarget = (() => {
      const chosen = (item?.targets ?? []).filter((t) => t.kind !== "none");
      const first = chosen[0];
      if (ev.copy || first?.kind !== "object" || chosen.some((t) => t.kind !== "object" || t.id !== first.id)) return undefined;
      const it = s.objects[first.id];
      return it?.zone === "battlefield" ? it : undefined;
    })();
    const castWatch = (o: GameObject, you: PlayerId, triggers?: TriggeredAbility[]) =>
      add(o, you, (e, t) => {
        if (e !== "castSpell" || !t.cast || (ev.copy && !t.cast.orCopy) || (!ev.copy && t.cast.onlyCopy)) return false;
        const by = t.cast.by;
        if ((by === "you" && ev.controller !== you) || (by === "opponent" && ev.controller === you) || (by === "enchanted" && o.attachedToPlayer !== ev.controller) || (by === "chosen" && o.chosen?.player !== ev.controller)) return false;
        if (t.cast.ownTurn && ev.controller !== s.activePlayer) return false;
        if (t.cast.mainPhase && s.step !== "main1" && s.step !== "main2") return false;
        if (t.cast.yourTurn && you !== s.activePlayer) return false;
        if (t.cast.selfAttacking && (o.zone !== "battlefield" || o.attacking === undefined)) return false;
        if (t.cast.opponentsTurn && ev.controller === s.activePlayer) return false;
        // Its caster's spells this turn, this one included (it was counted as it was cast).
        if (t.cast.notFirst && (s.castThisTurn ?? []).filter((c) => c.player === ev.controller && (!t.cast!.nthOfKind || (!!s.cards[c.card] && printedMatches(t.cast!.spell, s.cards[c.card]!)))).length < 2) return false;
        if (t.cast.nth && (s.castThisTurn ?? []).filter((c) => c.player === ev.controller && (!t.cast!.nthOfKind || (!!s.cards[c.card] && printedMatches(t.cast!.spell, s.cards[c.card]!)))).length !== t.cast.nth) return false;
        // Alania: the first spell of one of these kinds its caster has cast this turn, this one (a copy wasn't cast).
        if (t.cast.firstOfKinds) {
          const mine = (s.castThisTurn ?? []).filter((c) => c.player === ev.controller && !!s.cards[c.card]);
          const name = characteristics(s, o).name;
          const counts = (k: { spec: TargetSpec; notSelfName?: true }, d: CardDef) => printedMatches(k.spec, d) && !(k.notSelfName && sameName(d.name, name));
          if (ev.copy || !t.cast.firstOfKinds.some((k) => counts(k, ev.card) && mine.filter((c) => counts(k, s.cards[c.card]!)).length === 1)) return false;
        }
        if (t.cast.treasure && !(ev.treasureSpent && !ev.copy)) return false;
        // "Using mana produced by Tecutlan": this permanent's mana, as this object (CR 400.7).
        if (t.cast.manaFromSelf && !ev.manaSources?.includes(`${o.id}#${o.zoneChanges ?? 0}`)) return false;
        // "If at least four mana was spent to cast it" (CR 603.4): a copy wasn't cast, so nothing was spent on it.
        // "If {S} of any of that spell's colors was spent": its colors as it was cast.
        if (t.cast.spent && !spentMeets(ev.copy ? undefined : ev.spent, t.cast.spent, spell ? characteristics(s, spell).colors : ev.card.colors)) return false;
        // "A spell that targets a creature you control": its targets as it was cast (CR 601.2c), once however many match.
        if (t.cast.targets && !t.cast.targets.some((w) => targetsMatch(s, item?.targets ?? [], w, you))) return false;
        // "That targets only ~" (Zada), "only a single Golem": every target it has names one permanent.
        if (t.cast.targetsOnly && !targetsOnlyOne(s, item?.targets ?? [], t.cast.targetsOnly, o, you)) return false;
        // Where it was cast from (CR 601.2a); a copy wasn't cast from anywhere.
        if (t.cast.from && !castFromMatches(t.cast.from, ev.copy ? undefined : spell, ev.controller)) return false;
        if (t.cast.notOwned && !(spell && !ev.copy && spell.owner !== ev.controller)) return false;
        if (t.cast.nameInCasterYard) {
          const name = spell && !ev.copy && !spell.faceDown ? characteristics(s, spell).name : undefined;
          if (!name || !player(s, ev.controller).graveyard.some((g) => sameName(defOf(s, obj(s, g)).name, name))) return false;
        }
        if (t.cast.spentLessThanMv && !(item && !ev.copy && (ev.manaSpent ?? 0) < spellManaValue(s, item))) return false;
        if (t.cast.sharesTypeWithSelf && !(spell && shareCreatureType(creatureTypesOf(s, o), creatureTypesOf(s, spell)))) return false;
        if (t.cast.sharesNoTypeWithYours) {
          if (!spell) return false;
          const kinds = creatureTypesOf(s, spell);
          const mine = [...s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === you && objIsType(s, obj(s, id), "Creature")), ...player(s, you).graveyard.filter((id) => defOf(s, obj(s, id)).types.includes("Creature"))];
          if (mine.some((id) => shareCreatureType(kinds, creatureTypesOf(s, obj(s, id))))) return false;
        }
        // "If it shares a card type with the exiled card" (Cemetery Protector, CR 603.4), checked again as it resolves.
        if (t.cast.sharesTypeWithLinked && !sharesTypeWithLinked(s, `${o.id}@${o.zoneChanges ?? 0}`, spell ? characteristics(s, spell).types : ev.card.types)) return false;
        // "A spell with {X} in its mana cost": the half cast, for a split card (CR 709.3b); a copy has the same mana cost.
        if (t.cast.xInCost && !(spell && parseManaCost(defOf(s, spell).manaCost).hasX)) return false;
        // "With one or more blue mana symbols in its mana cost" (Namor): the same mana cost.
        if (t.cast.manaSymbol && !(spell && manaSymbolsOf(defOf(s, spell).manaCost, [t.cast.manaSymbol]) > 0)) return false;
        // "A kicked spell": kicked as it was cast (CR 702.33d), or a copy of one (CR 707.10).
        // Not an optional cost paid like kicker, as "you may blight 1" (Burning Curiosity) or replicate.
        if (t.cast.kicked && !(item?.kicked?.length && (!spell || isRealKicker(compileCard(defOf(s, spell)).kicker)))) return false;
        // "A creature spell that has an Adventure" (Garenbrig Squire): the card is an adventurer card (CR 715.2).
        if (t.cast.adventure && !(spell && s.cards[spell.cardId]?.layout === "adventure")) return false;
        // "A spell that has convoke": printed, or given by "spells you cast have convoke" (rulings on Joyful Stormsculptor:
        // whether or not any creatures were tapped for it).
        if (t.cast.keyword === "Cascade" ? !hasCascade : t.cast.keyword && !(spell && (defOf(s, spell).keywords.includes(t.cast.keyword) || (t.cast.keyword === "Convoke" && hasConvoke(s, ev.controller, spell))))) return false;
        // As the spell is on the stack: its mana value with X (CR 202.3e), its power from a "*" ability (604.3).
        const spec = bindBound(s, bindChosen(t.cast.spell, o.chosen), { controller: you, sourceId: o.id });
        return item?.objectId ? spellMatches(s, spec, item) : printedMatches(spec, ev.card);
      }, triggers, ev.stackId, onlyTarget && (triggers ?? abilitiesOf(s, o).triggers).some((t) => t.cast?.subjectTarget) ? onlyTarget : undefined, spell ? { copyKey: cardIdOf(spell) } : undefined, undefined, undefined, { player: ev.controller, ...(spell && !ev.copy ? { played: { id: spell.id, zc: spell.zoneChanges ?? 0 } } : {}), ...(ev.manaSpent !== undefined ? { amount: ev.manaSpent } : {}), ...(ev.treasureSpent ? { treasureSpent: ev.treasureSpent } : {}), ...(ev.spent && !ev.copy ? { spent: ev.spent } : {}) }); // "counter it unless" that player pays" acts on the spell cast
    // Veyran (CR 603.2d): casting or copying an instant or sorcery spell, as the spell is.
    const instantOrSorcery = spell ? characteristics(s, spell).types.some((t) => t === "Instant" || t === "Sorcery") : ev.card.types.some((t) => t === "Instant" || t === "Sorcery");
    causedBy = instantOrSorcery ? { event: "castOrCopy", caster: ev.controller } : null;
    for (const id of s.battlefield) castWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(castWatch);
    fromFloating(castWatch);
    fromEmblems(castWatch);
    // Heroic: "Whenever you cast a spell that targets ~", once however many of its targets name it.
    const targeted = new Set(ev.copy ? [] : (item?.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])));
    for (const id of targeted) {
      const o = s.objects[id];
      if (o?.zone === "battlefield" && controllerOf(s, o) === ev.controller) add(o, ev.controller, (e, t) => e === "selfTargetedByYourSpell" && (!t.heroicSpell || (item ? spellMatches(s, t.heroicSpell, item) : printedMatches(t.heroicSpell, ev.card))), undefined, ev.stackId);
    }
    causedBy = null;
  } else if (ev.type === "targeted") {
    // Each permanent becomes the target once, however many of the item's targets name it.
    const item = s.stack.find((x) => x.id === ev.stackId);
    // Committing a crime (CR 700.13): casting a spell, activating an ability or putting a triggered ability on the stack
    // that targets an opponent, a permanent, spell or ability an opponent controls, or a card in an opponent's graveyard.
    // Once for the spell or ability, however many of its targets do.
    if (item && !ev.only && isCrime(s, item)) {
      const criminal = item.controller;
      player(s, criminal).crimeTurn = s.turn;
      const that = { player: criminal };
      const crime = (o: GameObject, wc: PlayerId) => add(o, wc, (e) => (e === "youCommitCrime" && wc === criminal) || (e === "opponentCommitsCrime" && wc !== criminal), undefined, ev.stackId, undefined, undefined, undefined, undefined, that);
      for (const id of s.battlefield) crime(obj(s, id), controllerOf(s, obj(s, id)));
      fromGraveyards(crime);
    }
    const seen = new Set<ObjectId>();
    for (const t of item?.targets ?? []) {
      if (t.kind !== "object" || seen.has(t.id) || (ev.only && !ev.only.includes(t.id))) continue;
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
        if (w.spellTypes && !(item!.objectId && s.objects[item!.objectId] && w.spellTypes.some((t) => objIsType(s, s.objects[item!.objectId!]!, t)))) return false;
        if (w.spellSubtypes && !(item!.kind === "spell" && item!.objectId && s.objects[item!.objectId] && w.spellSubtypes.some((t) => characteristics(s, s.objects[item!.objectId!]!).subtypes.includes(t)))) return false;
        const mine = (p: PlayerId) => (w.by === "you" ? p === watcher : w.by === "opponent" ? p !== watcher : true);
        if (!mine(by)) return false;
        return !w.first || !before.some(mine);
      };
      const that = { player: by };
      // Nowhere to Run: ward abilities of the creatures it exposes don't trigger.
      // Shay Cormac: nor those of a permanent that lost ward.
      const noWard = exposed(s, o) || !!characteristics(s, o).wardLost;
      const ward = (tr: TriggeredAbility) => tr.body.effects.some((x) => x.type === "counterUnlessPays" && x.ward);
      add(o, you, (e, tr) => ((e === "becomesTargetOfOpponent" && you !== by) || (e === "selfBecomesTarget" && fits(tr, you))) && !(noWard && ward(tr)), undefined, ev.stackId, undefined, undefined, undefined, undefined, that);
      // Spectral Prison: "When enchanted creature becomes the target of a spell" (TriggeredAbility.targeted).
      addHosted(o, (e, tr) => e === "selfBecomesTarget" && fits(tr, you), ev.stackId);
      for (const id of s.battlefield) {
        const w = obj(s, id);
        const wc = controllerOf(s, w);
        add(w, wc, (e, tr) => e === "permanentBecomesTarget" && fits(tr, wc) && !tr.targeted?.onlyYou && !(tr.targeted?.other && w.id === o.id) && (!tr.subjectFilter || objectMatches(s, tr.subjectFilter, o, wc, false)), undefined, ev.stackId, o, undefined, undefined, undefined, that);
      }
    }
    // Surrak, Elusive Hunter: "or a creature spell you control" (TriggeredAbility.targeted.orSpell): a spell the item
    // targets, once for each.
    const spells = new Set<string>();
    for (const t of item?.targets ?? []) if (t.kind === "stack" && !ev.only) spells.add(t.id);
    for (const sid of spells) {
      const target = s.stack.find((x) => x.id === sid);
      if (target?.kind !== "spell") continue;
      const by = item!.controller;
      for (const id of s.battlefield) {
        const w = obj(s, id);
        const wc = controllerOf(s, w);
        if (target.controller !== wc) continue;
        add(w, wc, (e, tr) => e === "permanentBecomesTarget" && !!tr.targeted?.orSpell && spellMatches(s, tr.targeted.orSpell, target) && (!tr.targeted.spell || item!.kind === "spell") && (tr.targeted.by === "you" ? by === wc : tr.targeted.by === "opponent" ? by !== wc : true), undefined, ev.stackId, undefined, undefined, undefined, undefined, { player: by });
      }
    }
    // "Whenever you or a permanent you control becomes the target of ..." (Unsettled Mariner): a player the item targets,
    // once however many of its targets name them (rulings).
    const players = new Set<PlayerId>();
    for (const t of item?.targets ?? []) if (t.kind === "player" && !ev.only) players.add(t.id);
    for (const pid of players) {
      const by = item!.controller;
      for (const id of s.battlefield) {
        const w = obj(s, id);
        const wc = controllerOf(s, w);
        if (wc !== pid) continue;
        add(w, wc, (e, tr) => e === "permanentBecomesTarget" && !!tr.targeted?.orYou && (!tr.targeted.spell || item!.kind === "spell") && (tr.targeted.by === "you" ? by === wc : tr.targeted.by === "opponent" ? by !== wc : true), undefined, ev.stackId, undefined, undefined, undefined, undefined, { player: by });
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
    if (card?.zone === "graveyard") add(card, card.owner, (e) => e === "selfToGraveyardAnywhere" || (e === "selfToGraveyardFromLibrary" && ev.from === "library"), compileCard(defOf(s, card)).triggers);
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
        // Spiritual Focus: only a discard an opponent's spell or ability caused (not a cost).
        if (d.byOpponent && (ev.cause === undefined || ev.cause === ev.player)) return false;
        if (d.firstEachTurn && (s.turnLog?.cycled?.[ev.player] ?? 0) !== 1) return false;
        return !d.filter || printedMatches(d.filter, ev.card);
        // The card as it is now, where it went ("exile that card from your graveyard").
      }, undefined, undefined, card, undefined, undefined, undefined, { player: ev.player });
    }
    // "When you cycle ~" works from the zone the card went to (CR 702.29c), and its owner controls it (CR 113.8).
    if (ev.cycled && card && card.zone !== "battlefield") add(card, card.owner, (e) => e === "selfCycled", compileCard(defOf(s, card)).triggers, undefined, undefined, undefined, ev.x ?? 0);
    // "When you discard ~": the same, for any discard (cycling is one, CR 702.29a).
    // "When a spell or ability an opponent controls causes you to discard ~" (Sand Golem): only then; "that player" is
    // that opponent.
    const byOpp = ev.cause !== undefined && ev.cause !== card?.owner;
    if (card && card.zone !== "battlefield" && card.zone !== "hand")
      add(card, card.owner, (e, t) => e === "selfDiscarded" && (!t.discardedByOpponent || byOpp), compileCard(defOf(s, card)).triggers, undefined, undefined, undefined, undefined, undefined, byOpp ? { player: ev.cause! } : undefined);
  } else if (ev.type === "activated") {
    // "Whenever an opponent activates an ability of a creature that isn't a mana ability" (its source as it was activated).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      add(o, you, (e, t) => {
        // Vazi: "Whenever an opponent casts a spell or activates an ability, if mana from a Treasure was spent to ...".
        if (e === "castSpell" && t.cast?.orActivates) return !!ev.treasure && (t.cast.by !== "opponent" || ev.player !== you) && (t.cast.by !== "you" || ev.player === you);
        const a = t.activates;
        if (e !== "abilityActivated" || !a || (ev.mana && !a.mana) || (a.by === "opponent" && ev.player === you) || (a.by === "you" && ev.player !== you) || (a.xCost && !ev.xCost) || (a.ninjutsu && !ev.ninjutsu) || (a.boast && !ev.boast) || (a.exhaust && !ev.exhaust) || (a.inYourGraveyard && !ev.fromOwnGraveyard)) return false;
        // Way of the Paradox: "Whenever you activate a loyalty ability"; Way of the Mind Sculptor: "if you removed two or
        // more loyalty counters to activate it" (the cost paid, CR 606.4; fixed once paid, so true as it resolves too).
        if (a.loyalty && (!ev.loyalty || ev.loyalty.removed < (a.loyaltyRemoved ?? 0))) return false;
        // Herald of Anafenza: "Whenever you activate ~'s outlast ability": this object's own.
        if (a.ownOutlast && (!ev.outlast || ev.source?.snapshot.id !== o.id || (ev.source.snapshot.zoneChanges ?? 0) !== (o.zoneChanges ?? 0))) return false;
        if (a.equipped) {
          const host = o.attachedTo === undefined ? undefined : s.objects[o.attachedTo];
          if (!ev.source || !host || host.id !== ev.source.snapshot.id || host.zone !== "battlefield" || (host.zoneChanges ?? 0) !== (ev.source.snapshot.zoneChanges ?? 0)) return false;
        }
        return !a.of || (!!ev.source && objectMatches(s, a.of, ev.source.snapshot, you, false, undefined, ev.source.chars));
      }, undefined, ev.stackId, undefined, undefined, undefined, undefined, { player: ev.player });
    }
    // Afterburner Expert: "Whenever you activate an exhaust ability, return this card from your graveyard ...".
    if (ev.exhaust) fromGraveyards((o, owner) => owner === ev.player && add(o, owner, (e, t) => e === "abilityActivated" && !!t.activates?.exhaust && t.activates.by === "you", undefined, ev.stackId, undefined, undefined, undefined, undefined, { player: ev.player }));
  } else if (ev.type === "searchedLibrary") {
    // Archivist of Oghma: it waits until the search's spell or ability has resolved, like any trigger (rulings).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const you = controllerOf(s, o);
      if (you !== ev.player) add(o, you, (e) => e === "opponentSearchesLibrary", undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    }
  } else if (ev.type === "draw") {
    const draws = (o: GameObject, you: PlayerId) =>
      add(o, you, (e, t) => {
        if (e !== "playerDraws" || !t.draws) return false;
        const by = t.draws.by;
        if ((by === "you" && ev.player !== you) || (by === "opponent" && ev.player === you) || (by === "enchanted" && o.attachedToPlayer !== ev.player)) return false;
        if (t.draws.notFirstInDrawStep && ev.firstInDrawStep) return false;
        if (t.draws.ownTurn && ev.player !== s.activePlayer) return false;
        if (!eventPlayerFits(s, o, t, ev.player)) return false;
        return t.draws.nth === undefined || t.draws.nth === ev.nth;
      }, undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.player });
    for (const o of [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s)]) draws(o, controllerOf(s, o));
    // Dogged Detective: "Whenever an opponent draws their second card each turn, you may return ~ from your graveyard to
    // your hand": a card in its owner's graveyard (CR 113.6m).
    fromGraveyards(draws);
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
        const fromYard = (m: { id: ObjectId }) => !!(s.objects[m.id]?.enteredFromGraveyard || s.objects[m.id]?.castFromGraveyard);
        const matched = ev.moves.filter((m) => batchMoveMatches(s, b, m, w, you, gone) && (!b.onlyFromGraveyard || fromYard(m)));
        const n = matched.length;
        if (!n) continue;
        // Satoru: not if any of them was cast with mana spent on it (rulings: mana for additional costs counts too).
        if (b.noneCastWithMana && matched.some((m) => s.objects[m.id]?.wasCast && (s.objects[m.id]!.manaSpent ?? 0) > 0)) continue;
        if (b.fromGraveyard && !matched.some(fromYard)) continue;
        if (b.first && b.what === "created" && (s.turnLog?.tokensCreated ?? []).filter((c) => c.player === you).length > n) continue;
        if (b.first && b.what === "discards" && (s.turnLog?.discards ?? []).some((d) => (b.whose !== "you" || d.player === you) && d.cards.some((c) => !b.filter || printedMatches(b.filter, s.cards[c]!)))) continue;
        if (b.first && b.what === "toGraveyard" && (s.turnLog?.toGraveyardEvents ?? []).some((d) => (b.whose !== "you" || d.player === you) && d.cards.some((c) => !b.filter || printedMatches(b.filter, s.cards[c]!)))) continue;
        // "Whenever one or more creatures enter / die": caused by each of them entering or dying (CR 603.2d).
        const died = matched.filter((m) => m.from === "battlefield" && m.to === "graveyard" && m.snapshot && m.chars?.types.includes("Creature"));
        causedBy =
          b.what === "enters"
            ? { event: "enters", objs: matched.filter((m) => s.objects[m.id]).map((m) => ({ o: obj(s, m.id), controller: m.controller ?? you })) }
            : (b.what === "leaves" || b.what === "toGraveyard") && died.length
              ? { event: "dies", objs: died.map((m) => ({ o: m.snapshot!, c: m.chars!, controller: m.controller ?? m.owner })) }
              : null;
        // Zellix: "Whenever a player mills one or more creature cards": once for each player who milled them. Tinybones,
        // Pocket Nuisance: "Whenever a player discards one or more cards", once for each player who discarded.
        if ((b.milled || b.eachPlayer) && !b.together && !b.each) {
          for (const pid of [...new Set(matched.map((m) => m.owner))]) {
            const theirs = matched.filter((m) => m.owner === pid);
            add(w, you, (_, tt) => tt === t, triggers, undefined, undefined, undefined, undefined, undefined, { amount: theirs.length, player: pid, group: theirs.map((m) => ({ id: m.id, zc: m.zc })) });
          }
          causedBy = null;
          continue;
        }
        // "Whenever a creature card leaves your graveyard": once for each of them (CR 603.2c).
        for (let k = 0; k < (b.each ? n : 1); k++) add(w, you, (_, tt) => tt === t, triggers, undefined, undefined, undefined, undefined, undefined, { amount: b.each ? 1 : n, ...(b.each ? { player: matched[k]!.owner } : b.whose === "you" ? { player: you } : {}), ...((b.what === "enters" || b.what === "toGraveyard") && !b.each ? { group: matched.map((m) => ({ id: m.id, zc: m.zc })) } : {}), ...(b.dies && !b.each ? { groupPower: died.reduce((a, m) => a + (m.chars?.power ?? 0), 0) } : {}) });
        causedBy = null;
      }
    };
    for (const id of s.battlefield) {
      const w = obj(s, id);
      batchWatch(w, controllerOf(s, w), abilitiesOf(s, w).triggers, false);
    }
    // Duskmantle Guildmage: "Whenever a card is put into an opponent's graveyard from anywhere this turn" (CR 603.7b).
    fromFloating((src, ctrl, triggers) => batchWatch(src, ctrl, triggers, false));
    // Infesting Radroach: a card's ability that works in its owner's graveyard, there after the event, even if it was
    // milled in the same event (rulings).
    fromGraveyards((o, owner) => batchWatch(o, owner, compileCard(defOf(s, o)).triggers, false));
    for (const m of ev.moves) {
      const w = s.objects[m.id];
      if (!w || m.from !== "battlefield" || !m.snapshot || w.zone === "battlefield") continue; // back already: a new object
      batchWatch(w, m.controller!, withGranted(m.hadAbilities ? compileCard(s.cards[m.card]!) : NO_ABILITIES, m.granted ?? []).triggers, true);
    }
    // Golgari Brownscale: "When ~ is put into your hand from your graveyard": the card's ability, in the hand, under its
    // owner's control (CR 113.8), the same object that arrived.
    for (const m of ev.moves) {
      const card = s.objects[m.id];
      if (m.from === "graveyard" && m.to === "hand" && !m.notCard && card?.zone === "hand" && (card.zoneChanges ?? 0) === m.zc) add(card, card.owner, (e) => e === "selfToHandFromGraveyard", compileCard(defOf(s, card)).triggers);
    }
    // "For the first time each turn" looks at the events before this one.
    const discards = new Map<PlayerId, string[]>();
    for (const m of ev.moves) if (m.discardedBy !== undefined) discards.set(m.discardedBy, [...(discards.get(m.discardedBy) ?? []), m.card]);
    for (const [player, cards] of discards) ((s.turnLog ??= {}).discards ??= []).push({ player, cards });
    const toYard = new Map<PlayerId, string[]>();
    for (const m of ev.moves) if (m.to === "graveyard") toYard.set(m.owner, [...(toYard.get(m.owner) ?? []), m.card]);
    for (const [player, cards] of toYard) ((s.turnLog ??= {}).toGraveyardEvents ??= []).push({ player, cards });
  } else if (ev.type === "step") {
    // Delayed triggers whose moment this is (CR 603.7): each triggers once.
    // An additional end step (Y'shtola Rhul): one made during an earlier end step of this turn is due now (rulings).
    const laterEndStep = ev.step === "end" && (s.turnLog?.endSteps ?? 1) > 1;
    for (const d of [...(s.delayed ?? [])]) {
      // Made during that step, "the next end step" or "end of combat" is a later one (CR 603.7c, 511.2).
      // "The next cleanup step": every one made before this one began, so also during an earlier cleanup step of
      // this turn (CR 514.3a).
      // "When that creature becomes blocked this turn": only blocks trigger it, and this turn is over.
      if (d.when === "becomesBlocked") {
        if (d.thisTurn !== s.turn) s.delayed = s.delayed!.filter((x) => x !== d);
        continue;
      }
      // "At this turn's next end of combat" (Venomous Breath): none came this turn, so none will.
      if (d.when === "endOfCombat" && d.thisTurn !== undefined && d.thisTurn !== s.turn) {
        s.delayed = s.delayed!.filter((x) => x !== d);
        continue;
      }
      // "That combat" never came this turn: it never will.
      if (d.when === "thatCombat" && d.turn !== s.turn) {
        s.delayed = s.delayed!.filter((x) => x !== d);
        continue;
      }
      const due =
        d.when === "thatCombat"
          ? ev.step === "beginCombat" && s.thatCombat === d.combat
          : d.when === "nextCleanup"
          ? ev.step === "cleanup"
          : d.when === "nextBeginCombat"
          ? ev.step === "beginCombat" && !(d.turn === s.turn && d.step === "beginCombat")
          : d.when === "nextEndStep"
          ? ev.step === "end" && !(d.turn === s.turn && d.step === "end" && !laterEndStep)
          : d.when === "yourNextTurnEndStep"
          ? ev.step === "end" && ev.active === d.controller && d.turn < s.turn
          : d.when === "yourNextEndStep" || d.when === "playersNextEndStep"
          ? ev.step === "end" && ev.active === (d.when === "playersNextEndStep" ? d.player : d.controller) && !(d.turn === s.turn && d.step === "end" && !laterEndStep)
          : d.when === "endOfCombat"
            ? ev.step === "endCombat" && !(d.turn === s.turn && d.step === "endCombat")
            : d.when === "eachYourPrecombatMain"
              ? ev.step === "main1" && ev.active === d.controller
              : d.when === "yourNextMain"
              ? (ev.step === "main1" || ev.step === "main2") && ev.active === d.controller && (d.turn < s.turn || STEP_ORDER.indexOf(d.step) < STEP_ORDER.indexOf(ev.step))
              : d.when === "yourNextFirstMain"
              ? ev.step === "main1" && ev.active === d.controller && (d.turn < s.turn || STEP_ORDER.indexOf(d.step) < STEP_ORDER.indexOf(ev.step))
              : d.when !== "leaves" && d.when !== "lostControl" && ev.step === "upkeep" && (d.when === "nextTurnUpkeep" || ev.active === d.controller) && d.turn < s.turn;
      if (!due) continue;
      if (d.when !== "eachYourUpkeep" && d.when !== "eachYourPrecombatMain") s.delayed = s.delayed!.filter((x) => x !== d);
      // "If any of those cards remain exiled" (Glimpse the Impossible): it triggers only if one does (CR 603.4).
      const lead = d.body.effects[0];
      if (lead?.type === "exiledToGraveyard" && !(lead.cards ?? []).some((c) => s.objects[c.id]?.zone === "exile" && (s.objects[c.id]!.zoneChanges ?? 0) === c.zc)) continue;
      // "~" is the subject, or the source it remembers (Gift of Immortality's Aura card).
      s.triggerQueue.push({ sourceId: d.source?.id ?? d.subject.id, sourceCardId: d.sourceCardId, controller: d.controller, index: -1, subject: d.subject, sourceZc: d.source?.zc ?? d.subject.zc, body: d.body, transformsAt: d.transforms ?? 0, ...(d.event ? { event: d.event } : {}) });
    }
    // "At the beginning of the monarch's end step, that player draws a card" (CR 725.2).
    if (ev.step === "end" && s.monarch === ev.active) monarchTrigger(s, 0);
    // Rad counters (CR 728.1): at the beginning of a player's precombat main phase, if they have one or more.
    if (ev.step === "main1" && (player(s, ev.active).rad ?? 0) > 0) {
      s.cards[RAD.oracleId] ??= RAD;
      s.triggerQueue.push({ sourceId: "", sourceCardId: RAD.oracleId, controller: ev.active, index: 0 });
    }
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
      add(o, you, (e, t) => (e === "yourMain" && you === ev.active && (ev.step === "main1" || ev.step === "main2")) || (e === want && you === ev.active && (!t.ifEcho || echoDue(s, o, you)) && (!t.secondMain || s.mainPhasesThisTurn === 2)) || (e === each && (!t.hostControllersUpkeep || hostController(s, o) === ev.active) && (!t.opponentsTurn || opponents(s, you).includes(ev.active)) && (!t.enchantedPlayersTurn || o.attachedToPlayer === ev.active) && (!t.chosenPlayersTurn || o.chosen?.player === ev.active) && (!t.monarchsTurn || s.monarch === ev.active) && (!t.firstUpkeep || (s.turnLog?.upkeeps ?? 1) === 1)), undefined, undefined, undefined, undefined, undefined, undefined, { player: ev.active });
    for (const id of s.battlefield) stepWatch(obj(s, id), controllerOf(s, obj(s, id)));
    fromGraveyards(stepWatch);
    fromEmblems(stepWatch);
    // "At the beginning of each combat this turn" (Full Throttle): a delayed trigger made by a spell (CR 603.7b).
    fromFloating((o, you, triggers) => add(o, you, (e) => e === each, triggers, undefined, undefined, undefined, undefined, undefined, { player: ev.active }));
  }
}

/**
 * Put waiting triggers on the stack in APNAP order (CR 603.3b). A trigger that needs
 * targets stops here with a chooseTargets decision; one with no legal targets is removed
 * (CR 603.3d). Returns true if anything was added to the stack.
 */
export function processTriggerQueue(s: GameState, turnOrderFromActive: PlayerId[]): boolean {
  if (s.pending || !s.triggerQueue.length) return false;
  // "Whenever one or more opponents each lose exactly 1 life" (Ob Nixilis): the whole event is over by now.
  s.triggerQueue = s.triggerQueue.filter((t) => !t.event?.lifeEach || Object.values(t.event.lifeEach).includes(1));
  const rank = (pid: PlayerId) => {
    const i = turnOrderFromActive.indexOf(pid);
    return i < 0 ? 99 : i;
  };
  s.triggerQueue = s.triggerQueue.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.controller) - rank(b.t.controller) || a.i - b.i).map((x) => x.t);
  // Firebender Ascension's and Aboleth Spawn's triggers go on the stack just above the ability that caused them (rulings),
  // whoever controls them.
  for (const t of s.triggerQueue.filter((x) => x.causeTag)) {
    const at = s.triggerQueue.findIndex((x) => x.tag === t.causeTag);
    if (at < 0) continue;
    s.triggerQueue = s.triggerQueue.filter((x) => x !== t);
    let k = s.triggerQueue.findIndex((x) => x.tag === t.causeTag) + 1;
    while (k < s.triggerQueue.length && s.triggerQueue[k]!.causeTag === t.causeTag) k++;
    s.triggerQueue.splice(k, 0, t);
  }
  let added = false;
  while (s.triggerQueue.length) {
    const t = s.triggerQueue[0]!;
    if (player(s, t.controller).lost) {
      s.triggerQueue.shift();
      continue;
    }
    const def = restingDef(s.cards[t.sourceCardId]!);
    let printed = triggerBody(s, t);
    // Bumi, King of Three Trials: "choose up to X": X counted now (CR 603.3c), kept for the answer (see triggerBody).
    if (printed.modal?.maxCount && !t.modes && t.maxModes === undefined) {
      t.maxModes = Math.max(0, Math.min(printed.modal.modes.length, evalAmount(s, printed.modal.maxCount, { controller: t.controller, sourceId: t.sourceId })));
      printed = triggerBody(s, t);
    }
    if (printed.modal && !t.modes) {
      // Modes are chosen as it's put on the stack; a mode without legal targets can't be (CR 603.3c).
      // "Choose one that hasn't been chosen": not one this object has had chosen (rulings on Demonic Pact).
      const legal = legalModes(s, printed, t.controller, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
      const n = legal.filter(Boolean).length;
      // "Choose one. If you control a commander, you may choose both instead." (SOLDIER Military Program): checked now,
      // as it's put on the stack (rulings on Prophetic Titan); kept for the answer (chooseTriggerModes).
      if (printed.modal.bothIf && staticConditionNow(s, printed.modal.bothIf, t.sourceId, t.controller)) t.both = true;
      const [min, max0] = modeRange(printed, !!t.both);
      const max = distinctModeCap(s, printed, t.controller, max0, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
      // "Choose both instead": both, or the one that can be chosen (CR 603.3c).
      if (t.both && printed.modal.bothExactly && n > 0) t.modes = legal.flatMap((ok, i) => (ok ? [i] : []));
      // "Choose up to X" with X 0: no modes, so it's removed (CR 603.3c).
      else if (max === 0 && min === 0) t.modes = [];
      else if (n === 0 || n < min) {
        log(s, `${def.name}'s ability has no mode that can be chosen and is removed.`);
        s.triggerQueue.shift();
        continue;
      }
      // The only possible choice, unless choosing none is one too ("you may choose two").
      else if (n === min && !printed.modal.optional) t.modes = legal.flatMap((ok, i) => (ok ? [i] : []));
      else if (printed.modal.random) {
        // "Choose one at random": among the modes that can be chosen (rulings on Umaro), as it's put on the stack.
        const can = legal.flatMap((ok, i) => (ok ? [i] : []));
        t.modes = [can[Math.floor(nextRandom(s) * can.length)]!];
        log(s, `${def.name}'s ability chooses at random: ${printed.modal.modes[t.modes[0]!]!.text.replace(/~/g, def.name)}`);
      } else {
        const modes = printed.modal.modes.map((m) => m.text);
        s.pending = { kind: "chooseModes", player: t.controller, sourceId: t.sourceId, description: describeAbility(def, printed.text), min, max, modes, legal, ...(printed.modal.optional ? { optional: true as const } : {}) };
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
      // "Target creature an opponent controls chosen at random" (Scab-Clan Giant): picked among the legal ones as it's put
      // on the stack, each with an equal chance (rulings).
      if (body.targets.length === 1 && body.targets[0]!.random) {
        const legal = legalTargets(s, body.targets[0]!, t.controller, undefined, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
        const pick = legal[Math.floor(nextRandom(s) * legal.length)]!;
        log(s, `${def.name}'s ability targets ${pick.kind === "player" ? player(s, pick.id).name : defOf(s, obj(s, pick.id)).name}, chosen at random.`);
        pushTrigger(s, t, [pick]);
        added = true;
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
export function onceUsed(o: GameObject, zone: TriggeredAbility["zone"], text: string, nth = 0): boolean {
  const zc = lookingBack(o, zone) ? (o.zoneChanges ?? 0) - 1 : (o.zoneChanges ?? 0);
  return (o.triggeredThisTurn?.filter((k) => k === `${zc}|${text}`).length ?? 0) > nth;
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
  // "You may play that card for as long as you control ~": once you don't, never again, even if you regain control
  // (rulings on Lightning, Security Sergeant).
  for (const q of s.players)
    for (const id of q.exile) {
      const m = s.objects[id]!.mayPlay;
      if (m?.until === "whileControlled" && !stillControlsSource(s, m)) s.objects[id]!.mayPlay = undefined;
    }
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
  checkStateConditions(s);
}

/**
 * The state triggers whose state is true now (CR 603.8). Checked continuously: also between the instructions of a
 * resolving spell or ability, as "even if only for a brief moment" (rulings on Emperor Crocodile, Veiled Crocodile).
 */
export function checkStateConditions(s: GameState) {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const triggers = abilitiesOf(s, o).triggers;
    triggers.forEach((t, index) => {
      if (t.event !== "state" || !t.state || (t.activeIf && !staticConditionNow(s, t.activeIf, id, controllerOf(s, o)))) return;
      // Not again until it has resolved (CR 603.8): one waiting, on the stack, or resolving now.
      const mine = (x: StackItem) => x.sourceId === id && x.stateIndex === index && x.sourceZc === (o.zoneChanges ?? 0);
      const waiting = s.triggerQueue.some((q) => q.sourceId === id && q.index === index) || s.stack.some(mine) || (!!s.resolving && mine(s.resolving.item));
      if (waiting || !staticConditionNow(s, t.state, id, controllerOf(s, o))) return;
      // "When an opponent has 10 or less life, if ~ is an enchantment" (Lurking Jackals): an intervening if, checked as it
      // triggers and again as it resolves (CR 603.4); once it's false, the state doesn't trigger it again.
      if (t.ifCond && !staticConditionNow(s, t.ifCond, id, controllerOf(s, o))) return;
      s.triggerQueue.push({ sourceId: id, sourceCardId: cardIdOf(o), controller: controllerOf(s, o), index, sourceZc: o.zoneChanges ?? 0, ...(t.ifCond ? { ifCond: t.ifCond } : {}) });
    });
  }
}

/** The amassed Army's power now, or as it last existed on the battlefield (CR 608.2h). */
function amassedPowerNow(s: GameState, a: { id: ObjectId; zc: number }): number {
  const o = s.objects[a.id];
  if (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === a.zc) return power(s, o);
  const lk = s.lastKnown?.[a.id];
  return lk && lk.zc === a.zc ? (lk.power ?? 0) : 0;
}

/** What a waiting trigger does: its source's printed ability, or a delayed trigger's own (CR 603.7). */
export function triggerBody(s: GameState, t: PendingTrigger): AbilityBody {
  const body = triggerBodyAsIs(s, t);
  // "Choose up to X" (Bumi, King of Three Trials): no more modes than X was as it was put on the stack.
  return body.modal?.maxCount && t.maxModes !== undefined ? { ...body, modal: { ...body.modal, max: t.maxModes } } : body;
}

function triggerBodyAsIs(s: GameState, t: PendingTrigger): AbilityBody {
  // "Deals X damage divided as you choose": worked out as it's put on the stack (CR 603.3d, 601.2d).
  // Clement: "with lesser mana value" than a subject still on the battlefield: its mana value now (CR 202.3).
  const subj = t.subject && s.objects[t.subject.id];
  const lki = t.lki?.manaValue === undefined && subj?.zone === "battlefield" && (subj.zoneChanges ?? 0) === t.subject!.zc ? { ...t.lki, manaValue: evalAmount(s, { count: { kind: "manaValue", of: { ref: "subject" } } }, { controller: t.controller, objects: (r) => (r.ref === "subject" ? [subj] : []) }) } : t.lki;
  const body = settleDivided(s, t.body ?? compileCard(s.cards[t.sourceCardId]!).triggers[t.index]!.body, { controller: t.controller, sourceId: t.sourceId, ...(t.sourceZc !== undefined ? { sourceZc: t.sourceZc } : {}), x: t.x ?? 0, ...(lki ? { lki } : {}), ...(t.event ? { event: t.event } : {}), ...(t.cause ? { cause: t.cause } : {}), ...(t.tapped !== undefined ? { tapped: t.tapped } : {}), ...(t.rolled !== undefined ? { rolled: t.rolled } : {}), ...(t.amassed ? { amassedPower: amassedPowerNow(s, t.amassed) } : {}) });
  // "Target creature that player controls": that player is known once it triggers.
  const who = t.event?.player;
  // Colfenor: "other target creature card": not the card that died (TargetSpec.notSubject).
  if (t.subject && body.targets.some((x) => x.notSubject)) return { ...body, targets: body.targets.map((x) => (x.notSubject ? { ...x, notId: t.subject!.id } : x)) };
  const isEvent = (x: TargetSpec): boolean => x.controller === "eventPlayer" || x.protector === "eventPlayer" || x.attackingWhom === "eventPlayer" || !!x.notEventPlayer || !!x.anyOf?.some(isEvent);
  if (!body.targets.some(isEvent) && !body.modal?.modes.some((m) => m.targets?.some(isEvent))) return body;
  const fix = (x0: TargetSpec): TargetSpec => {
    const x = x0.anyOf ? { ...x0, anyOf: x0.anyOf.map(fix) } : x0;
    if (x.notEventPlayer && who !== undefined) {
      const { notEventPlayer: _, ...rest } = x;
      return { ...rest, notPlayer: who };
    }
    if (x.attackingWhom === "eventPlayer" && who !== undefined) return fix({ ...x, attackingWhom: who });
    if (x.protector === "eventPlayer" && who !== undefined) {
      const { protector: _, ...rest } = x;
      return fix({ ...rest, protectedBy: who });
    }
    return x.controller === "eventPlayer" ? (({ controller: _, ...rest }) => ({ ...rest, ...(who !== undefined ? { controlledBy: who } : { controller: "eventPlayer" as const }) }))(x) : x;
  };
  return { ...body, targets: body.targets.map(fix), ...(body.modal ? { modal: { ...body.modal, modes: body.modal.modes.map((m) => ({ ...m, targets: m.targets?.map(fix) })) } } : {}) };
}

export function pushTrigger(s: GameState, t: PendingTrigger, chosen: TargetChoice[]) {
  const def = restingDef(s.cards[t.sourceCardId]!);
  // With "any number of target ...", as many targets as were chosen (CR 601.2c, 603.3d).
  const body0 = withModes(triggerBody(s, t), t.modes);
  const fit = fitMany(body0, chosen, manyX(s, body0.targets, t.controller, t.sourceId, t.x ?? 0));
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
    ...(t.revealed !== undefined ? { revealed: t.revealed } : {}),
    ...(t.tapped !== undefined ? { tapped: t.tapped } : {}),
    ...(t.sacrificed ? { sacrificed: t.sacrificed } : {}),
    ...(t.amassed ? { amassed: t.amassed } : {}),
    ...(t.putThisWay ? { putThisWay: t.putThisWay } : {}),
    ...(t.fromSpell ? { fromSpell: true as const } : {}),
    ...(t.kicked ? { kicked: t.kicked } : {}),
    ...(t.colorsSpent ? { colorsSpent: t.colorsSpent } : {}),
    ...(t.event ? { event: t.event } : {}),
    ...(t.ifCond ? { ifCond: t.ifCond } : {}),
    ...(t.index >= 0 && triggerOf(s, t)?.event === "state" ? { stateIndex: t.index } : {}),
    ...(t.chapter ? { chapter: true as const } : {}),
    ...(t.finalChapter !== undefined ? { finalChapter: t.finalChapter } : {}),
    // Whether its source transforms before it resolves, or for a delayed trigger since it was made (CR 701.27f).
    ...((t.transformsAt ?? s.objects[t.sourceId]?.transforms) ? { sourceTransforms: t.transformsAt ?? s.objects[t.sourceId]!.transforms } : {}),
  });
  // Soul Scourge: the player targeted is remembered as it's put on the stack (rulings on Laquatus's Champion).
  const linking = t.index >= 0 && triggerOf(s, t)?.linksTarget ? targets.find((x) => x.kind === "player") : undefined;
  if (linking?.kind === "player") (s.linkedPlayer ??= {})[`${t.sourceId}@${t.sourceZc ?? 0}`] = linking.id;
  // Firebender Ascension's trigger is about this one, now on the stack.
  if (t.tag) for (const q of s.triggerQueue) if (q.causeTag === t.tag) q.cause = s.stack[s.stack.length - 1]!.id;
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

const STORM_BODY: AbilityBody = { targets: [], effects: [{ type: "copySpell", spell: "cause", n: "storm", newTargets: true }], text: "Storm: copy ~ for each other spell cast before it this turn." };
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
      if (g.twice) out.push(g);
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
    if (b.notPlayed && m.played) return false;
    return whose(m.controller) && (!b.filter || objectMatches(s, b.filter, o, you, false));
  }
  if (b.what === "leaves") {
    if (m.from !== "battlefield" || !m.snapshot || !m.chars) return false;
    if (b.dies && m.to !== "graveyard") return false;
    if (b.notDies && m.to === "graveyard" && m.chars.types.includes("Creature")) return false; // CR 700.4
    if (b.sacrificed && !m.sacrificed) return false;
    if (b.other && m.id === w.id && (gone || (w.zoneChanges ?? 0) === m.zc)) return false;
    return whose(m.controller) && (!b.filter || objectMatches(s, b.filter, m.snapshot, you, false, undefined, m.chars));
  }
  if (b.what === "created") {
    // As it is now, or as it was created if it's gone already.
    const o = s.objects[m.id];
    if (m.createdBy === undefined || !whose(m.createdBy)) return false;
    return !b.filter || (o?.zone === "battlefield" && (o.zoneChanges ?? 0) === m.zc ? objectMatches(s, b.filter, o, you, false) : printedMatches(b.filter, s.cards[m.card]!));
  }
  if (m.createdBy !== undefined) return false;
  // The rest are about cards (not tokens or copies of spells, CR 111.1, 707.10), as they are in that zone.
  if (m.notCard) return false;
  const card = s.cards[m.card];
  if (!card || (b.filter && !printedMatches(b.filter, card))) return false;
  if (b.what === "leavesGraveyard") return m.from === "graveyard" && m.to !== "graveyard" && whose(m.owner) && (!b.to || m.to === b.to);
  if (b.what === "exiledFromLibraryOrGraveyard") return m.to === "exile" && (m.from === "library" || m.from === "graveyard") && whose(m.owner);
  if (b.what === "exiledFromGraveyardsOrBattlefield") return m.to === "exile" && (m.from === "battlefield" || m.from === "graveyard");
  if (b.what === "toGraveyard") return m.to === "graveyard" && m.from !== "graveyard" && whose(m.owner) && (!b.milled || !!m.milled) && (!b.from || (b.from === "notBattlefield" ? m.from !== "battlefield" : m.from === b.from));
  return m.discardedBy !== undefined && whose(m.discardedBy);
}

/** The current event is over: its "one or more" triggers trigger (CR 603.2c). */
export function closeZoneBatch(s: GameState) {
  const moves = s.zoneBatch;
  s.zoneBatch = undefined;
  if (moves?.length) fireEvent(s, { type: "batch", moves });
}

/** Was this spell cast from the zone a "whenever you cast a spell from ..." trigger asks for? */
function castFromMatches(from: NonNullable<NonNullable<TriggeredAbility["cast"]>["from"]>, spell: GameObject | undefined, caster: PlayerId): boolean {
  const z = spell?.castFrom;
  if (!z) return false;
  switch (from) {
    case "hand":
      return z === "hand";
    case "notHand":
      return z !== "hand";
    case "exile":
      return z === "exile";
    case "graveyard":
      return z === "graveyard";
    case "ownGraveyard":
      return z === "graveyard" && spell.owner === caster;
    case "ownLibrary":
      return z === "library" && spell.owner === caster;
  }
}

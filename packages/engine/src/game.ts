import { isRealKicker, kickerName } from "./abilities";
import type { AbilityBody, ActivatedAbility, Count, AdditionalCost, ManaAbility, AltCostKind, ChoiceKind, CounterKind, CastFromGraveyard, CastFromGraveyardKind, CompiledCard, EntersChoice, EntersCondition, EntersOption, Modification, TargetChoice, TargetSpec } from "./abilities";
import { mergeSpell } from "./mutate";
import { battleSBAs, isSiege, protectorOptions, setProtector } from "./battles";
import { joinMeld } from "./meld";
import { liveEmblems } from "./emblems";
import { meldResultsFor } from "./meld-results";
import { asFace, castableFaces, defMv, faceDef, hasName, isRoom, landFaces, layoutOf, registerFace, registerRoom, restingDef, setFace, transformedFace } from "./faces";
import { checkDayNight, dayNightUntapCheck, setDayNight } from "./daynight";
import { becomePrepared, checkPrepared, preparedCopyCastable, unprepareFor } from "./prepare";
import { GRANTED_WAY_COSTS } from "./abilities";
import { abilitiesOf, lethalLeft, enchantOf, canBeSacrificed, withCastThisTurn, NO_ABILITIES, bestowedDef, mutatingDef, prototypedDef, overloadedDef, cleavedDef, cardIdOf, defOf, lockIfRoom, roomOf, pairedWith, FACE_DOWN, FACE_DOWN_WARD, FACE_DOWN_FOREST, faceUpDefOf, realDefOf, describeAbility, hasKeyword, isPermanentCard, isType, objHasKeyword, objIsType, power, shareLandType, toughness, withGranted } from "./cards";
import { MANA_ABILITY_OFFSET, manaAbilityCost, revealable, abolisherBan, commanderIdentity, activatedAsMana, activatedManaOptions, payableActivatedMana, manaAbilitiesOn, manaAbilityProblem, manaCombos, mayExhaustAgain, manaChoices, manaOptions, manaProduced, manaTriggerResults, pickManaAbility, manaLifeTax } from "./manaabilities";
import { untapStepPhasing, releasePhased, phaseInUntil } from "./phasing";
import { bindBound, cardPT, linkedCards, manyX, pickOptions, playerProtectedFrom, spellManaValue, spellMatches, targetsMatch } from "./effects/targeting";
import { takeInitiative, dungeonSBAs, loseRingBearer, addDelayed, canChooseTarget, sameTarget, modsAreHarmful, becomeMonarch, triggerBody, canChooseModes, choiceOptions, ENTERS_COUNTER, describePay, withChoice, discardCards, printedMatches, bindChosen, sourceQuality, spellQuality, stampTargets, fireEvent, hasLegalTargets, isLegalTarget, modesProblem, objectMatches, processTriggerQueue, pushTrigger, checkStateTriggers, checkLostControl, closeZoneBatch, noteModesChosen, settleDivided, beginResolution, continueResolution, resolveManaAbility, targetProblem, enterAttacking, attackingYouNow, COLOR_NAMES } from "./effects";
import { describeCount, entwined, withModes, withSplices, gateBody, hasGatedTargets, fitMany, manySlot, type CastHow } from "./modes";
import { dealDamage, dealPlanned, objectSource, planShields, protectedFrom, protectionHolder, unpreventable, type DamageEvent } from "./damage";
import { countersBanned, countersStay, putCounters, putPlayerCounters, removableCounters, tokenBatch } from "./counters";
import { createToken, createExtraTokens } from "./effects/run-tokens";
import { rollDice } from "./effects/run-dice";
import { addCopyEffect, copiableDef, copyEnterCounters, copyKey, endCopyEffects, exceptFor } from "./copies";
import { characteristics, controllerOf, everyCreatureType, invalidateCharacteristics, staticConditionNow, type Characteristics } from "./layers";
import { compileCard, compileGranted, mutateTarget, spellTargetSpecs } from "./oracle";
import { convokeReduce, emptyPool, manaValue, parseManaCost, payGenericWith, reduceByManaCost, reduceColored, reduceSymbolsByManaCost, splitGeneric, xCount, xProblem, type ParsedCost } from "./mana";
import { evalAmount, halve } from "./amounts";
import { abilityUse, addMana, boundSpend, canPayFromPool, manaOriginsOf, poolFor, spendFromPool, type ManaUse } from "./spend";
import { nextRandom, shuffle, shuffleLibrary } from "./rng";
import { watchForMandatoryLoop } from "./shortcuts";
import { askGraveyardOrder, closeGraveyardBatch, noteMergedToLibrary, noteToGraveyard, orderGraveyard, orderLibrary, topGraveyardCards } from "./graveyard";
import { CREATURE_TYPES, landwalkLand, type SourceQuality } from "./keywords";
import { spendPlan } from "./value";
import { cardNameOptions, currentName, nameActivationBan, nameCastBan, nameLandBan } from "./names";
import {
  COLORS,
  RulesError,
  type Action,
  type CardDef,
  type Color,
  type ContinuousEffect,
  type AttackCostDue,
  type CostChoices,
  type ExtraTurn,
  type FaceDownKind,
  type GameObject,
  type GameState,
  type LastKnown,
  type StackItem,
  type ManaLot,
  type ManaOrigin,
  type ManaType,
  type SpentMana,
  type ManaSpentTrigger,
  type ObjectId,
  type PendingDecision,
  type Player,
  type PlayerId,
  type SkipWhat,
  type Step,
  type ZoneName,
  STARTING_LIFE,
  type TurnRule,
} from "./types";

export const COMMANDER_DAMAGE_LIMIT = 21; // CR 903.10a
export const MAX_HAND_SIZE = 7; // CR 402.2

export interface PlayerSetup {
  name: string;
  commander: CardDef;
  /** A second commander: partners, or a Background beside a "choose a Background" creature (CR 702.124). */
  secondCommander?: CardDef;
  /** The rest of the 100 cards (98 with two commanders, CR 702.124b). */
  deck: CardDef[];
  isBot?: boolean;
}

// ---------------------------------------------------------------------------
// Setup

/** `mulligans`: start with the mulligan process (CR 103.5) instead of keeping every opening hand. */
export function createGame(setup: PlayerSetup[], seed = Date.now() >>> 0, opts: { mulligans?: boolean } = {}): GameState {
  const s: GameState = {
    seed,
    rngState: seed,
    turn: 1,
    activePlayer: 0,
    priority: 0,
    step: "untap",
    passedInSuccession: [],
    turnOrder: setup.map((_, i) => i),
    players: [],
    objects: {},
    cards: { [FACE_DOWN.oracleId]: FACE_DOWN, [FACE_DOWN_WARD.oracleId]: FACE_DOWN_WARD, [FACE_DOWN_FOREST.oracleId]: FACE_DOWN_FOREST },
    battlefield: [],
    stack: [],
    triggerQueue: [],
    effects: [],
    nextTimestamp: 1,
    pending: null,
    resolving: null,
    nextId: 1,
    log: [],
    winner: null,
    over: false,
  };
  setup.forEach((p, pid) => {
    const player: Player = {
      id: pid,
      name: p.name,
      life: STARTING_LIFE,
      library: [],
      hand: [],
      graveyard: [],
      exile: [],
      command: [],
      manaPool: emptyPool(),
      landsPlayedThisTurn: 0,
      commanderCasts: {},
      commanderDamage: {},
      lost: false,
      drewFromEmptyLibrary: false,
      isBot: !!p.isBot,
    };
    s.players.push(player);
    // Both commanders start in the command zone, and each is tracked on its own: tax, damage (CR 702.124b, d).
    for (const c of p.secondCommander ? [p.commander, p.secondCommander] : [p.commander]) {
      const cmd = newObject(s, c, pid, "command");
      cmd.isCommander = true;
      player.command.push(cmd.id);
      player.commanderCasts[cmd.id] = 0;
    }
    for (const card of p.deck) player.library.push(newObject(s, card, pid, "library").id);
    shuffleLibrary(s, player);
  });
  // The combined back faces its meld cards can meld into (CR 712.4): not in any deck, but part of the game's cards.
  for (const r of meldResultsFor(setup.flatMap((p) => [p.commander, ...(p.secondCommander ? [p.secondCommander] : []), ...p.deck]))) s.cards[r.oracleId] ??= r;
  // CR 103.1: randomly determine the starting player.
  const first = Math.floor(nextRandom(s) * setup.length);
  s.activePlayer = first;
  s.priority = first;
  // The starting player's first turn (set after choosing them).
  s.players[first]!.turnBegan = s.turn;
  s.players[first]!.turnsTaken = 1;
  s.lifeAsTurnBegan = s.players.map((p) => p.life);
  for (const p of s.players) draw(s, p.id, 7);
  s.handAsTurnBegan = s.players.map((p) => p.hand.length);
  // Opening hands are drawn before the first turn begins (CR 103.5, 103.8): they aren't draws "this turn".
  for (const p of s.players) delete p.draws;
  log(s, `Game start. ${s.players[first]!.name} goes first.`);
  if (opts.mulligans) {
    s.mulligans = { taken: {}, kept: [], toDeclare: turnOrderFrom(s, first), going: [] };
    nextMulliganDecision(s);
  } else startOpeningActions(s);
  return s;
}

/**
 * Once mulligans are done, the starting player and then each other player in turn order may take the actions their
 * opening hands allow (CR 103.6): the Leylines' "begin the game with it on the battlefield" (103.6a). Then the
 * first turn begins.
 */
function startOpeningActions(s: GameState) {
  s.openingActions = turnOrderFrom(s, s.activePlayer).filter((pid) => !player(s, pid).lost);
  nextOpeningAction(s);
}

function nextOpeningAction(s: GameState) {
  while (s.openingActions?.length) {
    const pid = s.openingActions[0]!;
    // Gemstone Caverns: not for the starting player (CR 103.1), who takes the first turn.
    const cards = player(s, pid).hand.filter((id) => {
      const begin = compileCard(defOf(s, obj(s, id))).beginOnBattlefield;
      return begin === true || (!!begin && pid !== s.activePlayer);
    });
    // First the cards that may begin the game on the battlefield (CR 103.6a), then the ones to reveal (103.6b).
    if (!s.openingStage) {
      s.openingStage = "reveal";
      if (cards.length) {
        s.pending = { kind: "searchLibrary", player: pid, source: "Opening hand", what: "these cards", cards, min: 0, max: cards.length, fromHand: true, opening: true };
        return;
      }
    }
    if (s.openingStage === "reveal") {
      s.openingStage = "done";
      const reveals = player(s, pid).hand.filter((id) => !!compileCard(defOf(s, obj(s, id))).openingReveal);
      if (reveals.length) {
        s.pending = { kind: "searchLibrary", player: pid, source: "Opening hand", what: "these cards", cards: reveals, min: 0, max: reveals.length, fromHand: true, opening: true, reveal: true };
        return;
      }
    }
    s.openingStage = undefined;
    s.openingActions.shift();
  }
  s.openingActions = undefined;
  beginStep(s, "untap");
}

// ---------------------------------------------------------------------------
// Mulligans (CR 103.5): the starting player declares, then each other player in turn order;
// everyone who chose to mulligan does so at once, and it repeats until everyone has kept.
// Keeping after N mulligans puts N cards on the bottom, except that a multiplayer game's
// first mulligan is free (CR 103.5c).

const OPENING_HAND = 7;
/** Cards put on the bottom when keeping after `taken` mulligans. */
export const mulliganBottom = (taken: number) => Math.max(0, taken - 1); // CR 103.5c

function nextMulliganDecision(s: GameState) {
  const m = s.mulligans!;
  // Players who left the game don't declare.
  m.toDeclare = m.toDeclare.filter((pid) => !player(s, pid).lost);
  const pid = m.toDeclare[0];
  if (pid !== undefined) {
    const taken = m.taken[pid] ?? 0;
    // Mulligans are allowed until the opening hand would be zero cards (CR 103.5).
    s.pending = { kind: "mulligan", player: pid, taken, bottomIfKept: mulliganBottom(taken), canMulligan: OPENING_HAND - mulliganBottom(taken) > 0 };
    return;
  }
  if (m.going.length) {
    // Everyone who declared a mulligan takes it at the same time.
    for (const g of m.going) {
      const p = player(s, g);
      for (const id of p.hand) obj(s, id).zone = "library";
      p.library.push(...p.hand);
      p.hand = [];
      shuffleLibrary(s, p);
      draw(s, g, OPENING_HAND);
      delete p.draws; // CR 103.5, as above
      m.taken[g] = (m.taken[g] ?? 0) + 1;
    }
    m.going = [];
    m.toDeclare = turnOrderFrom(s, s.activePlayer).filter((x) => !m.kept.includes(x));
    return nextMulliganDecision(s);
  }
  s.mulligans = null;
  s.pending = null;
  // If the starting player left during mulligans, the next player in turn order starts instead.
  if (player(s, s.activePlayer).lost) s.activePlayer = s.priority = nextLivingAfter(s, s.activePlayer);
  log(s, "Everyone has kept. The game begins.");
  startOpeningActions(s);
}

function declareMulligan(s: GameState, p: Player, keep: boolean) {
  const pend = s.pending;
  const m = s.mulligans;
  if (pend?.kind !== "mulligan" || pend.player !== p.id || !m) throw new RulesError("not deciding on a mulligan now");
  if (!keep && !pend.canMulligan) throw new RulesError("you can't mulligan any further");
  m.toDeclare.shift();
  s.pending = null;
  if (!keep) {
    m.going.push(p.id);
    const next = OPENING_HAND - mulliganBottom(pend.taken + 1);
    log(s, `${p.name} takes a mulligan${pend.taken === 0 ? " (the first one is free)" : ""}, to ${next}.`);
    return nextMulliganDecision(s);
  }
  m.kept.push(p.id);
  if (pend.bottomIfKept > 0) {
    s.pending = { kind: "bottomCards", player: p.id, count: pend.bottomIfKept };
    return;
  }
  log(s, `${p.name} keeps ${p.hand.length} cards.`);
  nextMulliganDecision(s);
}

function bottomCards(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "bottomCards" || pend.player !== p.id) throw new RulesError("no cards to put on the bottom");
  if (new Set(ids).size !== pend.count || ids.some((id) => !p.hand.includes(id))) throw new RulesError(`choose exactly ${pend.count} card(s) from your hand`);
  p.hand = p.hand.filter((id) => !ids.includes(id));
  // The library's top is index 0, so its bottom is the end; the first chosen card ends up lowest.
  p.library.push(...[...ids].reverse());
  for (const id of ids) obj(s, id).zone = "library";
  s.pending = null;
  log(s, `${p.name} keeps ${p.hand.length} cards, putting ${ids.length} on the bottom of their library.`);
  nextMulliganDecision(s);
}

export function newObject(s: GameState, card: CardDef, owner: PlayerId, zone: ZoneName): GameObject {
  s.cards[card.oracleId] ??= restingDef(card);
  const o: GameObject = {
    id: `o${s.nextId++}`,
    cardId: card.oracleId,
    owner,
    controller: owner,
    zone,
    timestamp: s.nextTimestamp++,
    tapped: false,
    controlledSinceTurn: 0,
    damage: 0,
    deathtouchDamage: false,
    counters: {},
    isCommander: false,
    isToken: false,
    // A Room made on the battlefield has both doors locked (CR 709.5d).
    ...(zone === "battlefield" && isRoom(card) ? { unlocked: [] } : {}),
  };
  s.objects[o.id] = o;
  return o;
}

// ---------------------------------------------------------------------------
// Public API

/** Which player the engine is waiting on, or null when the game is over. */
export function waitingOn(s: GameState): PlayerId | null {
  if (s.over) return null;
  return s.pending ? s.pending.player : s.priority;
}

/** Apply one action, returning a new state. Throws RulesError for illegal actions. */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.over) throw new RulesError("game is over");
  const s = cloneState(state);
  applyInPlace(s, action);
  return s;
}

/**
 * `applyAction` on a state that's changed in place, for a shortcut repeating a loop (shortcuts.ts). A RulesError can
 * leave `s` half-changed, so the caller keeps a copy to go back to.
 */
export function applyInPlace(s: GameState, action: Action): void {
  if (s.over) throw new RulesError("game is over");
  invalidateCharacteristics(s); // a fresh copy would start with nothing cached
  const p = player(s, action.player);
  if (action.type === "concede") {
    playerLoses(s, p.id, "conceded", true);
    afterAction(s);
    return;
  }
  /** Everyone passed in succession: the top of the stack resolved, or the step ended. */
  let allPassed = false;
  /** An activated mana ability was activated, and has resolved (CR 605.3b). */
  let manaAbility = false;
  const expected = waitingOn(s);
  if (action.player !== expected) throw new RulesError(`waiting on player ${expected}, not ${action.player}`);
  // Tezzeret, Betrayer of Flesh: whether this activates an ability of an artifact on the battlefield, as it's activated.
  const artifactAbility = artifactAbilityKind(s, action);
  // A mana ability paying for the next ability, which is begun first (rulings): it doesn't take the reduction.
  if (artifactAbility.artifact && artifactAbility.kind === "mana" && "forNext" in action && action.forNext && !s.turnLog?.artifactAbility?.[p.id]) ((s.turnLog ??= {}).artifactAbility ??= {})[p.id] = "mana";

  switch (action.type) {
    case "passPriority":
      requireNoPending(s);
      // Triggers held while activating mana abilities go on the stack before anyone passes (CR 117.5).
      if (s.triggerQueue.length) break;
      allPassed = passPriority(s, p.id);
      break;
    case "playLand":
      requireNoPending(s);
      playLand(s, p, action.objectId, action.untapped, action.face);
      s.passedInSuccession = [];
      break;
    case "activateMana":
      if (!paysManaNow(s)) requireNoPending(s);
      activateMana(s, p, action.objectId, action.mana, action.ability, action.tap, action.extra, action.combo, action.to);
      break;
    case "castSpell":
      if (action.assisted !== undefined) throw new RulesError("the assisting player chooses how much they pay");
      if (action.assist !== undefined && freeCastOf(s, p.id) !== action.objectId) {
        requireNoPending(s);
        askAssist(s, p, action);
        break;
      }
      if (freeCastOf(s, p.id) === action.objectId) {
        // Cascade's "you may cast it without paying its mana cost", as the ability resolves.
        castSpell(s, p, action.objectId, action.targets, action.modes, undefined, undefined, action.x, action);
        s.pending = null;
        continueResolution(s);
        break;
      }
      requireNoPending(s);
      castSpell(s, p, action.objectId, action.targets, action.modes, action.convoke, action.improvise, action.x, action);
      s.passedInSuccession = [];
      break;
    case "activateAbility":
      // A mana ability can be activated wherever mana abilities can (CR 605.3a); abilityProblem says which it is.
      if (!paysManaNow(s)) requireNoPending(s);
      manaAbility = activateAbility(s, p, action.objectId, action.index, action.targets, action.modes, action.tapCreatures, action.x, action.costs, action.mana, action.extra);
      s.passedInSuccession = [];
      break;
    case "chooseModes":
      chooseTriggerModes(s, p, action.modes);
      break;
    case "chooseTargets":
      chooseTriggerTargets(s, p, action.targets);
      break;
    case "copyTargets":
      chooseCopyTargets(s, p, action.targets);
      break;
    case "declareAttackers":
      declareAttackers(s, p, action.attacks);
      break;
    case "declareBlockers":
      declareBlockers(s, p, action.blocks);
      break;
    case "discard":
      if (s.pending?.kind === "discard") chooseDiscard(s, p, action.objectIds);
      else discardToHandSize(s, p, action.objectIds);
      break;
    case "arrangeTop":
      arrangeTop(s, p, action.top, action.away);
      break;
    case "orderGraveyard":
      orderGraveyard(s, p, action.order);
      break;
    case "orderLibrary":
      orderLibrary(s, p, action.order);
      break;
    case "searchLibrary":
      searchLibrary(s, p, action.found);
      break;
    case "pickPermanents":
      pickPermanents(s, p, action.ids);
      break;
    case "distribute":
      distributeChosen(s, p, action.parts);
      break;
    case "manaMix":
      manaMixChosen(s, p, action.counts);
      break;
    case "chooseMay":
      chooseMay(s, p, action.yes);
      break;
    case "collectEvidence":
      chooseEvidence(s, p, action.ids);
      break;
    case "chooseOption":
      chooseOption(s, p, action.choice);
      break;
    case "changeTarget":
      chooseNewTarget(s, p, action.target);
      break;
    case "newTargets":
      chooseNewTargets(s, p, action.targets);
      break;
    case "payUnless":
      payUnless(s, p, action.pay, action.tap);
      break;
    case "mulligan":
      declareMulligan(s, p, action.keep);
      break;
    case "handToTop":
      chooseHandToTop(s, p, action.objectIds);
      break;
    case "bottomCards":
      bottomCards(s, p, action.objectIds);
      break;
    case "turnFaceUp":
      requireNoPending(s);
      turnFaceUp(s, p, action.objectId, action.way, action.x, action.costs);
      break;
    case "suspend":
      requireNoPending(s);
      suspendCard(s, p, action.objectId);
      break;
    case "plot":
      requireNoPending(s);
      plotCard(s, p, action.objectId);
      break;
    case "unlockDoor":
      requireNoPending(s);
      unlockDoor(s, p, action.objectId, action.door);
      break;
    case "endEffect":
      requireNoPending(s);
      endEffect(s, p, action.objectId);
      break;
    case "foretell":
      requireNoPending(s);
      foretellCard(s, p, action.objectId);
      break;
    case "assist":
      assistPays(s, p, action.n);
      break;
    case "finishAssistedCast":
      finishAssistedCast(s, p, action.cancel);
      break;
    case "dredge":
      chooseDredge(s, p, action.objectId, action.abundance);
      break;
    case "drawEmptyReturn":
      chooseDrawEmptyReturn(s, p, action.objectId);
      break;
    case "drawLook":
      chooseDrawLook(s, p, action.objectId, action.instead);
      break;
  }
  // Mana abilities activated just before casting are part of paying for it (CR 601.2g): what they
  // trigger ("whenever a creature dies" from sacrificing a Scion) waits until the spell is cast.
  if (artifactAbility.kind !== "none" || s.turnLog?.artifactAbility?.[p.id] === "mana") noteArtifactAbility(s, p.id, artifactAbility.artifact, artifactAbility.kind);
  afterAction(s, action.type === "activateMana" || manaAbility);
  watchForMandatoryLoop(s, action, allPassed);
}

/** The kind of ability `action` activates, and whether its source is an artifact on the battlefield (CR 109.2), for noteArtifactAbility. */
function artifactAbilityKind(s: GameState, action: Action): { artifact: boolean; kind: "mana" | "costedMana" | "other" | "none" } {
  if (action.type !== "activateMana" && action.type !== "activateAbility") return { artifact: false, kind: "none" };
  const o = s.objects[action.objectId];
  if (!o) return { artifact: false, kind: "none" };
  const artifact = o.zone === "battlefield" && objIsType(s, o, "Artifact");
  if (action.type === "activateAbility") {
    const ab = abilitiesOf(s, o).activated[action.index];
    return { artifact, kind: !ab ? "none" : !ab.mana ? "other" : ab.manaCost && parseManaCost(ab.manaCost).symbols.length && !action.forNext ? "costedMana" : "mana" };
  }
  const i = action.ability ?? pickManaAbility(s, action.player, o, action.mana);
  const ab = i === undefined ? undefined : manaAbilitiesOn(s, o)[i];
  return { artifact, kind: !ab ? "none" : (ab.manaCost || ab.produces.kind === "doublePool") && !action.forNext ? "costedMana" : "mana" };
}

/**
 * Copy a state for a new action. Card definitions and log entries are never mutated,
 * so they are shared rather than deep-copied (that's most of the bytes).
 */
export function cloneState(state: GameState): GameState {
  const { cards, log: entries, ...rest } = state;
  return { ...structuredClone(rest), cards, log: [...entries] };
}

// ---------------------------------------------------------------------------
// Helpers

export function player(s: GameState, id: PlayerId): Player {
  const p = s.players[id];
  if (!p) throw new RulesError(`no player ${id}`);
  return p;
}
export function obj(s: GameState, id: ObjectId): GameObject {
  const o = s.objects[id];
  if (!o) throw new RulesError(`no object ${id}`);
  return o;
}
export const livingPlayers = (s: GameState) => s.turnOrder.filter((id) => !player(s, id).lost);
export const opponents = (s: GameState, pid: PlayerId) => livingPlayers(s).filter((id) => id !== pid);
export const nameOf = (s: GameState, id: ObjectId) => defOf(s, obj(s, id)).name;

/** "~ assigns no combat damage this turn" or "this combat" (CR 510.1): not the same as preventing it (rulings). */
const assignsNoCombatDamage = (s: GameState, o: GameObject) => o.noCombatDamageTurn === s.turn || (o.noCombatDamageCombat?.turn === s.turn && o.noCombatDamageCombat.combat === (s.combatsThisTurn ?? 0));

export function log(s: GameState, text: string, to?: PlayerId) {
  s.log.push({ seq: s.log.length, turn: s.turn, step: s.step, text, ...(to !== undefined ? { to } : {}) });
}

/** The card `pid` may cast for free right now, as cascade resolves (see PendingDecision "castFree"), or for its madness cost. */
export function freeCastOf(s: GameState, pid: PlayerId): ObjectId | undefined {
  return s.pending?.kind === "castFree" && s.pending.player === pid ? s.pending.objectId : undefined;
}

/**
 * The madness or miracle cost `pid` may cast this card for right now, as its madness or miracle ability resolves (CR
 * 702.35a, 702.94a): an alternative cost, cast while the ability resolves, so its timing doesn't matter.
 */
export function madnessCastOf(s: GameState, pid: PlayerId, id: ObjectId): string | undefined {
  const pend = s.pending;
  if (pend?.kind !== "castFree" || pend.player !== pid || pend.objectId !== id || (pend.how !== "madness" && pend.how !== "miracle" && pend.how !== "paid")) return undefined;
  return pend.how === "paid" ? defOf(s, obj(s, id)).manaCost : pend.how === "miracle" ? compileCard(defOf(s, obj(s, id))).miracle : compileCard(defOf(s, obj(s, id))).madness;
}

/**
 * A decision that asks for a mana payment, during which mana abilities can be activated (CR 605.3a): paying a cost
 * mid-resolution, like ward's; casting a card for its madness cost as madness's trigger resolves (CR 702.35a, 601.2g);
 * helping to pay for a spell with assist, or paying the rest of it (CR 702.132a); declaring attackers, to pay what
 * attacking costs (CR 508.1i); declaring blockers, to pay what blocking costs (CR 509.1f); casting a commander free
 * from the command zone, for the commander tax (Geode Golem, CR 903.8); any free cast while Trinisphere raises what it costs.
 */
export function paysManaNow(s: GameState): boolean {
  const pd = s.pending;
  return pd?.kind === "payUnless" || pd?.kind === "declareAttackers" || (pd?.kind === "declareBlockers" && blocksMayCost(s, pd.player)) || pd?.kind === "assist" || pd?.kind === "assistCast" || (pd?.kind === "chooseMay" && !!pd.pay?.mana) || (pd?.kind === "castFree" && (pd.how === "madness" || pd.how === "miracle" || pd.how === "paid" || s.objects[pd.objectId]?.zone === "command" || costFloorInPlay(s)));
}

function requireNoPending(s: GameState) {
  if (s.pending) throw new RulesError(`waiting for ${s.pending.kind}`);
}

function nextLivingAfter(s: GameState, pid: PlayerId): PlayerId {
  const order = s.turnOrder;
  const start = order.indexOf(pid);
  for (let i = 1; i <= order.length; i++) {
    const cand = order[(start + i) % order.length]!;
    if (!player(s, cand).lost) return cand;
  }
  return pid;
}

function zoneList(s: GameState, o: GameObject): ObjectId[] | null {
  const p = player(s, o.owner);
  switch (o.zone) {
    case "library":
      return p.library;
    case "hand":
      return p.hand;
    case "graveyard":
      return p.graveyard;
    case "exile":
      return p.exile;
    case "command":
      return p.command;
    case "battlefield":
      return s.battlefield;
    case "phasedOut":
      return (s.phasedOut ??= []);
    case "stack":
      return null; // tracked through s.stack
    case "merged":
      return null; // a component of a merged permanent (CR 730.2), see mutate.ts
  }
}

/** The permanents entering together while `enterTogether` runs, kept off the battlefield list until all have entered. */
type EnteringTogether = { ids: ObjectId[]; events: Parameters<typeof fireEvent>[1][] };
let together: EnteringTogether | null = null;

/**
 * An event that happens as permanents enter: while some enter together (enterTogether), after all of them have, so
 * what it triggers sees them all on the battlefield (CR 603.2, 603.6a). "Whenever you create a Blood token, if you
 * control five or more Blood tokens" (Voldaren Bloodcaster) counts the tokens created with it.
 */
export function fireOnceEntered(s: GameState, ev: Parameters<typeof fireEvent>[1]) {
  if (together) together.events.push(ev);
  else fireEvent(s, ev);
}

/**
 * Several cards put onto the battlefield at the same time by one instruction (Collected Company, Genesis Wave): each
 * enters without seeing the others, so their replacement effects and "enters with" counts don't count each other
 * (CR 614.12), nor can one enter as a copy of another; then they're all there before anything triggers, so each one's
 * enters abilities see the others enter too (CR 603.6a). `run` makes the moves; one at a time, or nested, is as before.
 */
export function enterTogether(s: GameState, run: () => void) {
  if (together) return run();
  const batch: EnteringTogether = { ids: [], events: [] };
  together = batch;
  try {
    run();
  } finally {
    together = null;
    s.battlefield = [...batch.ids.filter((id) => s.objects[id]?.zone === "battlefield").reverse(), ...s.battlefield];
    invalidateCharacteristics(s);
    for (const c of s.entersChoices ?? []) if (batch.ids.includes(c.id) && batch.ids.length > 1) c.together = batch.ids.filter((id) => id !== c.id);
    // Mystic Reflection's replacement is used up once that event is over.
    if (s.nextEntersAsCopy?.some((r) => r.used)) s.nextEntersAsCopy = s.nextEntersAsCopy.filter((r) => !r.used);
  }
  for (const ev of batch.events) fireEvent(s, ev);
}

/**
 * Mystic Reflection's copy for a permanent entering now (GameState.nextEntersAsCopy): if it's a creature or planeswalker as
 * it would enter (CR 614.12), the copiable values of the chosen creature as it is now or last existed (rulings). With
 * several waiting, the latest applies last and wins (its controller could choose the order, rulings: not offered).
 * Used up by the first such event; the others entering with it too (enterTogether).
 */
function reflectionKey(s: GameState, o: GameObject): string | undefined {
  const waiting = (s.nextEntersAsCopy ?? []).filter((r) => r.turn === s.turn && (!r.used || together));
  if (!waiting.length) return undefined;
  invalidateCharacteristics(s);
  if (!objIsType(s, o, "Creature") && !objIsType(s, o, "Planeswalker")) return undefined;
  let key: string | undefined;
  for (const r of [...waiting].sort((a, b) => a.timestamp - b.timestamp)) {
    const t = s.objects[r.id];
    const lk = s.lastKnown?.[r.id];
    key = t && t.zone === "battlefield" && (t.zoneChanges ?? 0) === r.zc && t.id !== o.id ? copyKey(s, copiableDef(s, t)) : lk && lk.zc === r.zc && lk.copyKey ? lk.copyKey : r.key;
    r.used = true;
  }
  if (!together) s.nextEntersAsCopy = s.nextEntersAsCopy!.filter((r) => !r.used);
  return key;
}

/** Move an object between zones. It becomes a new object with no memory of its old one (CR 400.7). */
/** The name of a permanent whose ability stops this card entering the battlefield from its graveyard or library. */
export function cantEnterFromHere(s: GameState, o: GameObject, zone: "graveyard" | "library", faceDown = false): string | undefined {
  const d = defOf(s, o);
  for (const b of s.battlefield) {
    const ban = abilitiesOf(s, obj(s, b)).cantEnterFrom;
    if (!ban?.zones.includes(zone)) continue;
    const hit = faceDown || (ban.what === "creature" ? isType(d, "Creature") : isPermanentCard(d) && (ban.what === "permanent" || !isType(d, "Land")));
    if (hit) return characteristics(s, obj(s, b)).name;
  }
  return undefined;
}

export function moveObject(
  s: GameState,
  id: ObjectId,
  to: ZoneName,
  opts: {
    top?: boolean;
    controller?: PlayerId;
    attachTo?: ObjectId;
    /** An Aura with "enchant player" enters attached to this player (CR 303.4f). */
    attachToPlayer?: PlayerId;
    tapped?: boolean;
    /** Counters it enters the battlefield with (persist, undying). */
    counters?: Record<string, number>;
    /** "If it enters as a creature, it enters with an additional +1/+1 counter on it" (Teferi's Time Twist): judged as it would exist there (CR 614.12, rulings). */
    countersIfCreature?: Record<string, number>;
    /** "If a Hero enters this way, it enters with two additional +1/+1 counters on it" (Heroic Return): judged the same way. */
    countersIfSubtype?: { subtype: string; counters: Record<string, number> };
    /** "... and an additional loyalty counter on it if it's a planeswalker" (Semester's End): judged the same way. */
    countersIfPlaneswalker?: Record<string, number>;
    /** For a land that may enter untapped by paying life or revealing a card: that was done (CR 614.12). */
    untapped?: boolean;
    /** The X of the spell it was, for "enters with X counters" and its enters triggers (CR 107.3m). */
    x?: number;
    /** Its controller is sacrificing it (CR 701.21a), for "whenever you sacrifice" triggers. */
    sacrificed?: boolean;
    /** A spell or ability this player controls destroyed it (CR 701.8a), for Karmic Justice. */
    destroyedBy?: PlayerId;
    /** Sacrificed for this creature's exploit (CR 702.110a): "if it exploited that creature" (Silumgar Scavenger). */
    exploitedBy?: { id: ObjectId; zc: number };
    /** Milled (CR 701.17a), for "whenever a player mills one or more creature cards" (Zellix). */
    milled?: boolean;
    /** "It's an enchantment": the card types it has from the moment it enters, for as long as it's there. */
    becomes?: { types: string[]; subtypes: string[] };
    /** "Those permanents are 4/4 creatures in addition to their other types" (Dance of the Manse): it enters that way (rulings). */
    entersAs?: Modification[];
    /** Manifested or cloaked: turned face down, then put onto the battlefield (CR 701.40a, 701.58a). */
    faceDown?: FaceDownKind;
    /** The face it enters with up: a modal double-faced land's (CR 712.12), "transformed" (712.14a). */
    face?: number;
    /** Melded with its counterpart `with` (in exile), as the combined back face `key` (CR 701.42a, 712.14c): meld.ts. */
    meld?: { with: ObjectId; key: string };
  } = {},
) {
  const o = obj(s, id);
  const fromZone = o.zone;
  // "Can't be sacrificed": an instruction to sacrifice it does nothing (rulings on Alexios, CR 701.21).
  if (opts.sacrificed && fromZone === "battlefield" && !canBeSacrificed(s, o)) {
    log(s, `${defOf(s, o).name} can't be sacrificed.`);
    return;
  }
  // The Master, Multiplied: a triggered ability its controller controls doesn't sacrifice or exile their creature tokens
  // (the ability still resolves, rulings).
  if ((opts.sacrificed || to === "exile") && fromZone === "battlefield" && o.isToken && s.resolving?.item.triggered && objIsType(s, o, "Creature")) {
    const you = s.resolving.item.controller;
    if (controllerOf(s, o) === you && s.battlefield.some((x) => controllerOf(s, obj(s, x)) === you && abilitiesOf(s, obj(s, x)).ownTriggersSpareTokens)) {
      log(s, `${defOf(s, o).name} isn't ${opts.sacrificed ? "sacrificed" : "exiled"} (The Master, Multiplied).`);
      return;
    }
  }
  // A creature tapped for a station ability that's still on the stack: its power as it last existed (rulings on station).
  if (fromZone === "battlefield")
    for (const item of s.stack) if (item.stationed?.id === id && item.stationed.zc === (o.zoneChanges ?? 0)) item.stationed.power = power(s, o);
  // A copy of a spell anywhere but the stack ceases to exist (CR 707.10a); it isn't a card, so nothing sees it arrive.
  if (o.spellCopy && to !== "stack" && to !== "battlefield") {
    delete s.objects[id];
    return;
  }
  // Grafdigger's Cage: "Creature cards in graveyards and libraries can't enter the battlefield": it stays where it is,
  // judged as the card is there (rulings), a manifested or cloaked card as the face-down 2/2 creature it's turned into
  // (CR 701.40a, 701.58a; rulings on Grafdigger's Cage).
  if (to === "battlefield" && (fromZone === "graveyard" || fromZone === "library")) {
    const cage = cantEnterFromHere(s, o, fromZone, !!opts.faceDown);
    if (cage) {
      log(s, `${opts.faceDown ? "The face-down card" : defOf(s, o).name} can't enter the battlefield from ${fromZone === "graveyard" ? "a graveyard" : "a library"} (${cage}).`);
      return;
    }
  }
  // Primeval Spawn: "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead" (CR 614.1a),
  // with the abilities it would have there (614.12). Mana paid for any cost to cast it counts; a copy of a spell, or a
  // token, wasn't cast (rulings).
  if (to === "battlefield" && fromZone !== "battlefield" && entersRulesOf(s, opts.controller ?? o.controller, id).exileUnlessCastWithMana && !(fromZone === "stack" && !o.spellCopy && (o.manaSpent ?? 0) > 0)) {
    log(s, `${defOf(s, o).name} is exiled instead of entering: ${fromZone === "stack" && !o.spellCopy ? "no mana was spent to cast it" : "it wasn't cast"}.`);
    to = "exile";
  }
  // Containment Priest: "If a nontoken creature would enter and it wasn't cast, exile it instead" (CR 614.1a): from a
  // permanent already on the battlefield (not one entering with it, rulings), for a card that would be a creature there
  // (CR 614.12: a noncreature card entering as a creature too, rulings). A spell resolving was cast; a copy is a token.
  if (to === "battlefield" && fromZone !== "battlefield" && fromZone !== "stack" && fromZone !== "phasedOut" && fromZone !== "merged" && !o.isToken && !o.spellCopy) {
    const priest = s.battlefield.find((b) => b !== id && abilitiesOf(s, obj(s, b)).exileUncastCreatures);
    // Mistcaller: the same until end of turn (CR 614.1a), whatever became of it.
    const mist = s.exileUncastTurn === s.turn;
    if ((priest || mist) && entersAsCreature(s, o, opts.controller ?? o.controller, opts.faceDown)) {
      log(s, `${opts.faceDown ? "The face-down card" : defOf(s, o).name} is exiled instead of entering: it wasn't cast (${priest ? characteristics(s, obj(s, priest)).name : "this turn"}).`);
      to = "exile";
    }
  }
  // Cosmic Intervention: "If a permanent you control would be put into a graveyard from the battlefield this turn, exile it
  // instead" (CR 614.1a), with a delayed trigger to return it (below). With other replacements that would exile it, its
  // controller applies this one first (CR 616.1), the one that brings it back.
  const exileReturn = fromZone === "battlefield" && to === "graveyard" ? s.exileReturnTurn?.find((x) => x.turn === s.turn && x.player === controllerOf(s, o)) : undefined;
  if (exileReturn) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of being put into a graveyard (${exileReturn.source}).`);
  }
  // "If it would leave, exile it instead" (flashback, unearth): a replacement effect (CR 614.1a). Realmbreaker's land:
  // the same, from an ability it has.
  if (o.exileIfLeaves === fromZone && to !== "exile") to = "exile";
  if (fromZone === "battlefield" && to !== "exile" && abilitiesOf(s, o).exileIfLeavesSelf) to = "exile";
  o.exileIfLeaves = undefined;
  if (o.exileIfToGraveyard && fromZone === "stack" && to === "graveyard") {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of being put into a graveyard.`);
  }
  o.exileIfToGraveyard = undefined;
  // "If that creature would die this turn, exile it instead" (CR 614.1a).
  // Malicious Eclipse: only a creature an opponent of that spell's controller controls.
  if (fromZone === "battlefield" && to === "graveyard" && (o.exileIfDiesTurn === s.turn || ((s.exileDyingTurn === s.turn || s.exileDyingOpponents?.some((x) => x.turn === s.turn && controllerOf(s, o) !== x.player)) && objIsType(s, o, "Creature")))) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of dying.`);
  }
  // A finality counter: "If this permanent would be put into a graveyard from the battlefield, exile it instead" (CR 122.1h).
  if (fromZone === "battlefield" && to === "graveyard" && (o.counters.finality ?? 0) > 0) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead (finality counter).`);
  }
  o.exileIfDiesTurn = undefined;
  o.noRegenTurn = undefined;
  o.noCombatDamageTurn = undefined; // a new object (CR 400.7)
  o.noCombatDamageCombat = undefined;
  o.attacked = undefined;
  o.foughtTurn = undefined;
  o.combatHitTurn = undefined;
  o.blockedTurn = undefined;
  o.declaredInCombat = undefined;
  o.attackedTurns = undefined;
  o.couldAttack = undefined;
  o.exertedTurn = undefined;
  // Kumano: "If a creature dealt damage by ~ this turn would die, exile it instead" (CR 614.1a), while Kumano is on the
  // battlefield or leaving it at the same time (rulings).
  if (fromZone === "battlefield" && to === "graveyard" && o.damagedBy?.length && objIsType(s, o, "Creature") && exiledByWhatDamagedIt(s, o)) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of dying.`);
  }
  // "If ~ would die, exile it instead", "If a creature an opponent controls would die, exile it instead" (CR 614.1a): from
  // the permanent itself or another one on the battlefield, as the creature would leave (CR 603.10a-style look back).
  const insteadOfDying = fromZone === "battlefield" && to === "graveyard" && objIsType(s, o, "Creature") ? exiledInsteadOfDying(s, o) : null;
  if (insteadOfDying) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of dying.`);
    const { id: by, controller: you, x } = insteadOfDying;
    // "Exiled with ~" while that permanent is still on the battlefield (CR 607.2a): the card as it will be in exile.
    const src = s.objects[by];
    if (x.linked && src?.zone === "battlefield" && by !== o.id) ((s.linkedExile ??= {})[`${by}@${src.zoneChanges ?? 0}`] ??= []).push({ id, zc: (o.zoneChanges ?? 0) + 1 });
    if (x.gainLife) gainLife(s, you, x.gainLife);
    if (x.token) {
      const { same, extra } = tokenBatch(s, you, x.token, 1);
      for (let i = 0; i < same; i++) createToken(s, you, x.token);
      createExtraTokens(s, you, extra);
      if (same) log(s, `${player(s, you).name} creates ${same === 1 ? "a" : same} ${x.token.name} token${same > 1 ? "s" : ""}.`);
    }
    // Nemata: "When you do, ...": a reflexive trigger of that permanent's (CR 603.12), also if it's leaving at the same time.
    const from = s.objects[by];
    if (x.reflexive && from) s.triggerQueue.push({ sourceId: by, sourceCardId: cardIdOf(from), controller: you, index: -1, sourceZc: from.zoneChanges ?? 0, body: x.reflexive });
  }
  // Darksteel Colossus: "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's
  // library instead" (CR 614.1a). On the battlefield it's the permanent's ability now (it could have lost it);
  // elsewhere the card's. If an "exile it instead" effect also applies, its owner would choose the order (CR 616.1):
  // those were applied above, so the card goes to exile.
  // "If ~ would be put into a graveyard from anywhere, exile it instead" (a disturb card's back face): the same way.
  // Rest in Peace, Leyline of the Void, Dauthi Voidwalker: "If a card would be put into an opponent's graveyard from
  // anywhere, exile it instead" (CR 614.1a), from a permanent on the battlefield, or one leaving it at the same time
  // (rulings on Rest in Peace: destroyed by a spell, it's exiled, and the spell goes to the graveyard).
  const yardExile = to === "graveyard" ? graveyardExileFor(s, o, fromZone) : undefined;
  if (yardExile) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of being put into a graveyard (${yardExile.source}).`);
    // "Exiled with ~" (Valgavoth, CR 607.2a): the card as it will be in exile.
    const src = yardExile.linkTo ? s.objects[yardExile.linkTo] : undefined;
    if (src) ((s.linkedExile ??= {})[`${src.id}@${src.zoneChanges ?? 0}`] ??= []).push({ id, zc: (o.zoneChanges ?? 0) + 1 });
  }
  if (to === "graveyard" && (fromZone === "battlefield" ? abilitiesOf(s, o) : compileCard(defOf(s, o))).exileInsteadOfGraveyard) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of being put into a graveyard.`);
  }
  // Ugin's Nexus: exiled instead, and its controller takes an extra turn after this one (CR 500.7, 614.1a).
  if (to === "graveyard" && fromZone === "battlefield" && abilitiesOf(s, o).exileForExtraTurn) {
    to = "exile";
    const pid = controllerOf(s, o);
    (s.extraTurns ??= []).push({ player: pid });
    log(s, `${defOf(s, o).name} is exiled instead of being put into a graveyard; ${player(s, pid).name} will take an extra turn after this one.`);
  }
  const shuffleIn = to === "graveyard" && (fromZone === "battlefield" ? abilitiesOf(s, o) : compileCard(defOf(s, o))).shuffleInsteadOfGraveyard;
  if (shuffleIn) {
    to = "library";
    log(s, `${player(s, o.owner).name} reveals ${defOf(s, o).name} and shuffles it into their library instead.`);
  }
  // Gravebane Zombie: "If ~ would die, put it on top of its owner's library instead" (CR 614.1a), the permanent's own
  // ability as it would leave (an "exile it instead" applied above comes first, as its owner would choose, CR 616.1).
  // Nissa's Chosen puts it on the bottom.
  const libraryDies = to === "graveyard" && fromZone === "battlefield" && objIsType(s, o, "Creature") ? abilitiesOf(s, o).libraryInsteadOfDying : undefined;
  if (libraryDies) {
    to = "library";
    opts = { ...opts, top: libraryDies === "top" };
    log(s, `${defOf(s, o).name} is put on ${libraryDies === "top" ? "top" : "the bottom"} of its owner's library instead of dying.`);
  }
  // A merged permanent's components all go where it goes (CR 730.3, 730.3d), but the commander redirect below is the
  // commander card's alone (903.9c).
  const merged = fromZone === "battlefield" ? o.merged : undefined;
  const partsTo = to;
  // A commander that would be put into its owner's library goes to the command zone instead, if its owner
  // wants (CR 903.9b); owners always do. Into a hand it stays: it can be cast from there without tax.
  if ((merged ? merged.ownCommander : o.isCommander) && to === "library" && fromZone !== "library") {
    to = "command";
    log(s, `${defOf(s, o).name} goes to the command zone instead.`);
  }
  const escaped = fromZone === "stack" && to === "battlefield" && (o.castVia === "escape" || o.castVia === "grantedEscape");
  // The Myojin: "~ enters with a divinity counter on it if you cast it from your hand" (a commander cast from the command
  // zone wasn't, rulings).
  const castFromHand = fromZone === "stack" && o.castFrom === "hand" && !o.spellCopy;
  const castFromGraveyard = fromZone === "stack" && o.castFrom === "graveyard" && !o.spellCopy;
  o.discardedTurn = undefined;
  o.foretold = undefined; // a spell that was foretold is cast without moving it here; anywhere else it's a new object
  if (fromZone === "stack") {
    o.castFrom = undefined;
    o.castVia = undefined;
    o.buyback = undefined;
    o.toHandOnResolve = undefined;
  }
  // Last known information, for leaves-the-battlefield triggers (CR 603.10a, 608.2h).
  const last = characteristics(s, o);
  const lastCounters = { ...o.counters };
  const lastController = last.controller;
  // "If you sacrificed a Food this turn" (Elanor Gardner): as it last existed (CR 701.21a: its controller sacrifices it).
  if (opts.sacrificed && fromZone === "battlefield") ((s.turnLog ??= {}).sacrificed ??= []).push({ player: lastController, types: [...last.types], subtypes: [...last.subtypes], ...(o.isToken ? { token: true as const } : {}) });
  const wasCreature = last.types.includes("Creature");
  // A face-down permanent has no abilities of its own (CR 708.2), so nothing of the card's triggers as it leaves.
  const hadAbilities = last.hasPrintedAbilities && !o.faceDown;
  // The permanent as it last existed, for "whenever a creature you control with a +1/+1 counter dies".
  const snapshot: GameObject | undefined = fromZone === "battlefield" ? { ...o, counters: lastCounters } : undefined;
  const snapshotKey = cardIdOf(o);
  if (fromZone === "battlefield") {
    (s.leftTogether ??= []).push({ id, controller: lastController, hadAbilities, ...(last.grantedAbilities?.length ? { granted: last.grantedAbilities } : {}), ...(o.attachedTo ? { attachedTo: o.attachedTo } : {}), ...(hadAbilities ? { card: snapshotKey } : {}) });
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    (s.lastKnown ??= {})[id] = { zc: o.zoneChanges ?? 0, ...(o.tapped ? { tapped: true as const } : {}), power: last.power, toughness: last.toughness, basePower: [...last.pt].reverse().find((p) => p.kind === "set")?.power ?? last.printedPower, controller: last.controller, copyKey: cardIdOf(o), ...(Object.keys(lastCounters).length ? { counters: { ...lastCounters } } : {}), ...(host ? { attachedTo: { id: host.id, zc: host.zoneChanges ?? 0 } } : {}), ...(o.attachedToPlayer !== undefined ? { attachedToPlayer: o.attachedToPlayer } : {}), ...(o.chosen?.player !== undefined ? { chosenPlayer: o.chosen.player } : {}), ...(o.blocking?.length ? { blocking: [...o.blocking] } : {}), ...(o.blockedBy?.length ? { blockedBy: [...o.blockedBy] } : {}), ...(o.attacking !== undefined ? { attacking: o.attacking, ...(o.attackingPermanent ? { attackingPermanent: { ...o.attackingPermanent } } : {}) } : {}), creatureTypes: last.allCreatureTypes ? "all" : last.subtypes.filter((t) => CREATURE_TYPES.has(t)), source: { name: last.name, colors: last.colors, types: last.types, subtypes: last.subtypes, ...(last.supertypes.length ? { supertypes: last.supertypes } : {}), ...(last.allCreatureTypes ? { allCreatureTypes: true } : {}), keywords: last.keywords, ...(last.unpreventable ? { unpreventable: last.unpreventable } : {}) } };
  }
  // Its components become objects of their own (CR 730.3): this one is the card or token it was.
  o.movedWith = undefined;
  if (merged) {
    o.isToken = merged.ownToken;
    o.isCommander = merged.ownCommander;
    o.merged = undefined;
  }
  const exiledUntil = fromZone === "battlefield" ? o.exiledUntilLeaves : undefined;
  const attachments: ObjectId[] = []; // what was attached to it, for "whenever equipped creature dies"
  if (snapshot) snapshot.lastAttachments = attachments;
  // An Aura or Equipment that left at the same time was attached to it as it last existed too (CR 603.10a; rulings on
  // Hateful Eidolon).
  if (fromZone === "battlefield") for (const l of s.leftTogether ?? []) if (l.attachedTo === id && l.id !== id && !attachments.includes(l.id)) attachments.push(l.id);
  o.exiledUntilLeaves = undefined;
  const from = zoneList(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  if (o.zone === "battlefield") {
    removeFromCombat(s, o);
    // Leaving the battlefield breaks a soulbond pair (CR 702.95e).
    const partner = pairedWith(s, o);
    if (partner) partner.paired = undefined;
    o.paired = undefined;
  }
  // Whether it was kicked stays with a spell that becomes a permanent, and nothing else (CR 400.7).
  if (!(fromZone === "stack" && to === "battlefield")) {
    o.kicked = undefined;
    o.kickedByControl = undefined;
    o.colorsSpent = undefined;
    o.phyrexianLife = undefined;
    o.convoked = undefined;
    o.manaSpent = undefined;
    o.spent = undefined;
    o.castNth = undefined;
    o.castInMain = undefined;
    o.castAlt = undefined; // so is whether its evoke or dash cost was paid (CR 702.74a, 702.109a)
    o.webSlung = undefined;
    o.bargained = undefined; // and whether it was bargained (CR 702.166b)
    o.costOrPaid = undefined; // and which of its either-or costs was paid
    o.evidence = undefined; // and whether evidence was collected for it (CR 701.59c)
    o.treasureSpent = undefined; // and the mana from Treasures spent to cast it
    o.extraCounters = undefined; // and the counters a spell will enter with
    o.spellGains = undefined;
    o.reboundGained = undefined;
    o.sunburstGained = undefined;
    o.bloodthirstGained = undefined;
    o.teamwork = undefined;
    o.gift = undefined; // and whom its gift was promised to (CR 702.174a)
    o.sneak = undefined;
    o.bestowed = undefined; // a bestowed spell is a bestowed Aura as it resolves, and nothing else is (CR 702.103b)
    o.mutating = undefined; // so is a mutating creature spell (CR 702.140a-b)
    o.prototyped = undefined; // only on the stack and the battlefield (CR 718.4)
    o.overloaded = undefined; // the text change lasts while it's a spell (CR 702.96a)
    o.cleaved = undefined; // so does cleave's (CR 702.148a)
    o.suspendHaste = undefined; // suspend's haste is the spell's and the permanent's it becomes (CR 702.62a)
    // The face up on the stack stays up as it resolves into a permanent (CR 712.13); anywhere else it's a new object.
    o.face = undefined;
    // A face-down spell becomes a face-down permanent (CR 708.4); anywhere else, it's revealed (CR 708.9).
    if (o.faceDown) {
      o.faceDown = undefined;
      log(s, `(The face-down creature was ${realDefOf(s, o).name}.)`);
    }
  }
  o.zone = to;
  if (opts.face !== undefined && to === "battlefield") setFace(s, o, opts.face);
  // Daybound: "If it is night and this permanent is represented by a double-faced card, it enters transformed" (CR
  // 702.145b).
  else if (to === "battlefield" && s.dayNight === "night" && o.face === undefined && !o.faceDown && transformedFace(s, o) === 1 && hasKeyword(defOf(s, o), "Daybound")) setFace(s, o, 1);
  o.zoneChanges = (o.zoneChanges ?? 0) + 1; // a new object (CR 400.7)
  o.copyOf = undefined; // copy effects end with the object (CR 400.7)
  o.textFrom = undefined; // so do text-changing effects
  o.melded = undefined; // a melded permanent's cards are separate cards again (CR 712.21)
  o.copyEffects = undefined;
  // Krovikan Vampire: a creature that died after being dealt damage this turn, and what dealt it (rulings: any damage).
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature && o.damagedBy?.length) ((s.turnLog ??= {}).diedDamaged ??= []).push({ id, zc: o.zoneChanges, by: [...o.damagedBy] });
  o.tapped = false;
  o.damage = 0;
  o.damagedBy = undefined;
  o.wasDealtDamage = undefined;
  o.hasDealtDamage = undefined;
  o.deathtouchDamage = false;
  o.regenShields = undefined;
  o.preventNext = undefined;
  o.redirectNext = undefined;
  o.activatedThisTurn = undefined;
  o.activatedEver = undefined; // exhaust (CR 702.177a): a new object can activate it again
  o.targetedThisTurn = undefined;
  o.modesChosen = undefined; // "choose one that hasn't been chosen": a new object starts over (CR 400.7)
  o.skipNextUntap = undefined;
  o.skipMoreUntaps = undefined;
  o.renowned = undefined;
  o.monstrous = undefined;
  o.adaptFresh = undefined;
  o.suspected = undefined; // CR 701.60a
  o.putBy = undefined;
  o.classLevel = undefined; // CR 716.2b
  o.solved = undefined; // CR 719.3b
  o.harnessed = undefined; // CR 701.64b
  o.transforms = undefined; // a new object (CR 400.7)
  o.prepared = undefined; // CR 722.3a
  o.saddled = undefined; // CR 702.171b
  o.tribute = undefined; // CR 702.104
  o.hiddenExile = undefined; // a hideaway card that leaves exile is face up again
  o.encoded = undefined; // cards stay encoded only on the permanent as long as it's on the battlefield (CR 702.99c)
  o.haunting = undefined; // a haunting card that leaves exile is a new object that haunts nothing (CR 400.7, 702.55b)
  o.escaped = escaped || undefined; // CR 702.138b
  o.chosen = undefined;
  o.notedMana = undefined; // a new object (CR 400.7)
  o.protector = undefined;
  // A Room enters with the door that was cast unlocked, and from anywhere but the stack with both locked (CR 709.5d,
  // rulings). On the battlefield it's the whole card, its doors locked or unlocked, not a half (709.5).
  o.unlocked = undefined;
  if (to === "battlefield" && isRoom(s.cards[o.cardId]) && !o.faceDown) {
    o.unlocked = fromZone === "stack" && o.face !== undefined && o.face < 2 ? [o.face] : [];
    o.face = undefined;
    registerRoom(s, cardIdOf(o));
  }
  if (to === "battlefield") o.devoured = undefined; // kept elsewhere for "for each creature it devoured" (CR 608.2h)
  if (to === "battlefield") o.lifePaidAsEntered = undefined; // and for "the life paid as it entered"
  if (to === "battlefield") o.mutations = undefined; // and for "the number of times ~ has mutated"
  o.counters = {};
  o.counterTimestamps = undefined;
  // "Instead exile it with a void counter on it" (Dauthi Voidwalker).
  if (yardExile?.counter && to === "exile") o.counters[yardExile.counter] = 1;
  o.controller = opts.controller ?? o.owner;
  o.seenController = undefined;
  o.attacking = undefined;
  o.attackingPermanent = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
  o.becameBlockedTurn = undefined; // after the dies snapshot: Fyndhorn Druid looks back at it (CR 603.10a)
  o.band = undefined;
  o.timestamp = s.nextTimestamp++; // CR 613.7d
  o.attachedTo = to === "battlefield" ? opts.attachTo : undefined;
  // An Aura with "enchant creature card in a graveyard" (Animate Dead) attached to that card, as that object.
  const card = to === "battlefield" && opts.attachTo ? s.objects[opts.attachTo] : undefined;
  o.enchantsCard = card?.zone === "graveyard" ? { id: card.id, zc: card.zoneChanges ?? 0 } : undefined;
  o.attachedToPlayer = to === "battlefield" ? opts.attachToPlayer : undefined;
  if (fromZone === "battlefield") {
    // It's a new object now (CR 400.7): effects locked onto it end, and things attached to it
    // are no longer attached (Auras then go to the graveyard and Equipment stays, CR 704.5m-n).
    for (const e of s.effects) e.affected = e.affected.filter((x) => x !== id);
    // "For as long as ~ remains tapped": it isn't tapped anymore (rulings on Vedalken Shackles).
    s.effects = s.effects.filter((e) => e.affected.length && e.whileTapped?.id !== id && e.whileControlled?.id !== id);
    for (const other of s.battlefield)
      if (s.objects[other]!.attachedTo === id) {
        s.objects[other]!.attachedTo = undefined;
        attachments.push(other);
      }
  }
  if (to === "battlefield") [o.controlledSinceTurn, o.enteredTurn] = [s.turn, s.turn];
  o.toGraveyardTurn = to === "graveyard" ? s.turn : undefined;
  o.fromLibraryTurn = to === "graveyard" && fromZone === "library" ? s.turn : undefined;
  o.fromBattlefieldTurn = to === "graveyard" && fromZone === "battlefield" ? s.turn : undefined;
  o.milledTurn = to === "graveyard" && fromZone === "library" && opts.milled ? s.turn : undefined;
  o.castFromHand = to === "battlefield" && castFromHand ? true : undefined;
  o.castFromGraveyard = to === "battlefield" && castFromGraveyard ? true : undefined;
  o.wasCast = to === "battlefield" && fromZone === "stack" && !o.spellCopy ? true : undefined;
  o.enteredFromGraveyard = to === "battlefield" && fromZone === "graveyard" ? true : undefined;
  o.enteredFromHand = to === "battlefield" && fromZone === "hand" ? true : undefined;
  o.enteredFromExile = to === "battlefield" && fromZone === "exile" ? true : undefined;
  if (to === "battlefield" && opts.faceDown) o.faceDown = opts.faceDown; // it enters as a face-down 2/2 (CR 701.40a)
  if (to === "battlefield" && opts.meld) joinMeld(s, o, opts.meld.with, opts.meld.key);
  if (to === "battlefield" && opts.becomes)
    s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: defOf(s, o).name, duration: "game", affected: [id], mods: [{ kind: "setTypes", ...opts.becomes }] });
  if (to === "battlefield" && opts.entersAs)
    s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: defOf(s, o).name, duration: "game", affected: [id], mods: opts.entersAs });
  // The Volvers: kicked with that kicker, it enters with those abilities (CR 614.1c), from an effect as it enters.
  if (to === "battlefield" && o.kicked?.length)
    for (const k of compileCard(defOf(s, o)).entersKicked ?? [])
      if (k.which !== undefined && o.kicked.includes(k.which)) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: defOf(s, o).name, duration: "game", affected: [id], mods: k.mods });
  invalidateCharacteristics(s);
  // "Enters with N counters" is a replacement effect (CR 614.1c): N is counted before it's on the battlefield.
  const printedCounters = to === "battlefield" ? compileCard(defOf(s, o)).entersWithCounters : undefined;
  // Raid: "~ enters with a +1/+1 counter on it if you attacked this turn".
  // Counted after its "as ~ enters, choose" is answered when it counts what's chosen (afterChoice, see chooseOption).
  const withCounters = (printedCounters?.if && !staticConditionNow(s, printedCounters.if, id, o.controller)) || (printedCounters?.castFromHand && !castFromHand) || (printedCounters?.notCastFromHand && castFromHand) || (printedCounters?.ifCast && !(fromZone === "stack" && !o.spellCopy)) || (printedCounters?.ifWebSlung && !(fromZone === "stack" && o.webSlung)) || printedCounters?.afterChoice || printedCounters?.afterPlayer ? undefined : printedCounters;
  const counterN = withCounters ? Math.max(0, evalAmount(s, withCounters.n, { controller: o.controller, sourceId: id, x: opts.x, kicked: o.kicked, colorsSpent: o.colorsSpent?.length, manaSpent: o.manaSpent ?? 0, spent: o.spent, webSlungMv: o.webSlung?.manaValue })) * (withCounters.doubleIfXAtLeast !== undefined && (opts.x ?? 0) >= withCounters.doubleIfXAtLeast ? 2 : 1) : 0;
  const dest = zoneList(s, o);
  if (dest) opts.top || to === "battlefield" ? dest.unshift(id) : dest.push(id);
  if (to === "graveyard") noteToGraveyard(s, o); // its owner may arrange cards put there at the same time (CR 404.3)
  // "If a card left your graveyard this turn" (Gau, Feral Youth): a card, not a token (CR 111.1).
  if (fromZone === "graveyard" && to !== "graveyard" && !o.isToken) {
    const left = ((s.turnLog ??= {}).leftGraveyard ??= []);
    if (!left.includes(o.owner)) left.push(o.owner);
    const count = (s.turnLog!.leftGraveyardCount ??= {});
    count[o.owner] = (count[o.owner] ?? 0) + 1;
  }
  // For "one or more" triggers, checked as the event ends (CR 603.2c).
  if (fromZone === "battlefield" || fromZone === "graveyard" || to === "graveyard" || (fromZone === "library" && to === "exile"))
    (s.zoneBatch ??= []).push({
      id,
      zc: o.zoneChanges,
      from: fromZone,
      to,
      owner: o.owner,
      ...(o.isToken || o.spellCopy ? { notCard: true as const } : {}),
      ...(opts.milled && fromZone === "library" ? { milled: true as const } : {}),
      card: fromZone === "battlefield" ? snapshotKey : o.cardId,
      ...(fromZone === "battlefield" ? { controller: lastController, snapshot, chars: last, hadAbilities, ...(last.grantedAbilities?.length ? { granted: last.grantedAbilities } : {}), ...(opts.sacrificed ? { sacrificed: true as const } : {}) } : {}),
    });
  if (to === "graveyard" || to === "exile") o.justMovedForCommander = o.isCommander;
  if (merged) o.movedWith = scatterMerged(s, merged.parts.filter((x) => x !== id), partsTo, !!opts.top);
  // Into its owner's library, its owner arranges its cards there (CR 730.3a).
  if (merged && partsTo === "library") noteMergedToLibrary(s, o.owner, [{ id, zc: o.zoneChanges ?? 0 }, ...o.movedWith!], !opts.top);
  // A countered Serra Paragon spell doesn't keep the ability for later (CR 400.7).
  if (to !== "battlefield" && to !== "stack") o.entersGaining = undefined;
  // Edgar's "that artifact enters tapped": only the permanent the spell becomes (CR 400.7).
  const castTapped = to === "battlefield" && fromZone === "stack" && !!o.castEntersTapped;
  if (to !== "stack") o.castEntersTapped = undefined;
  if (to === "battlefield") {
    // Mystic Reflection: a creature or planeswalker enters as a copy (CR 614.1c, 707.5), before the rest of how it enters.
    const reflected = reflectionKey(s, o);
    if (reflected) {
      o.copyOf = reflected;
      invalidateCharacteristics(s);
      log(s, `${realDefOf(s, o).name} enters as a copy of ${s.cards[reflected]!.name}.`);
    }
    const printed = compileCard(defOf(s, o));
    // A spell that will "enter with an additional +1/+1 counter" (Boreal Outrider) as it resolves.
    const counters = { ...opts.counters };
    for (const [k, n] of Object.entries(fromZone === "stack" ? (o.extraCounters ?? {}) : {})) counters[k] = (counters[k] ?? 0) + n;
    o.extraCounters = undefined;
    // "It gains haste until end of turn" while it was a spell (Tyvar Kell's emblem): the permanent it becomes has it (CR 400.7a).
    for (const g of fromZone === "stack" ? (o.spellGains ?? []).filter((g) => !g.whileSpell) : []) s.effects.push({ id: `e${s.nextId++}`, timestamp: g.timestamp, controller: g.controller, sourceName: g.source, duration: g.forever ? "game" : (g.until ?? "endOfTurn"), ...(g.until ? { turnOf: g.controller } : {}), affected: [o.id], mods: g.mods });
    o.spellGains = undefined;
    // Serra Paragon: "If you do, it gains '...'": the permanent the land or spell becomes has the ability for good.
    if (o.entersGaining && (fromZone === "stack" || fromZone === "graveyard")) s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: "Serra Paragon", duration: "game", affected: [o.id], mods: [{ kind: "addAbility", text: o.entersGaining }] });
    o.entersGaining = undefined;
    const sunburstGained = fromZone === "stack" ? (o.sunburstGained ?? 0) : 0;
    o.sunburstGained = undefined;
    const bloodthirstGained = fromZone === "stack" ? (o.bloodthirstGained ?? 0) : 0;
    o.bloodthirstGained = undefined;
    const how: EnterOpts = { ...(sunburstGained ? { sunburstGained } : {}), ...(bloodthirstGained ? { bloodthirstGained } : {}), ...(opts.x ? { x: opts.x } : {}), ...(opts.tapped || castTapped ? { tapped: true } : {}), ...(opts.untapped ? { untapped: true } : {}), ...(Object.keys(counters).length ? { counters } : {}), ...(opts.countersIfCreature ? { countersIfCreature: opts.countersIfCreature } : {}), ...(opts.countersIfSubtype ? { countersIfSubtype: opts.countersIfSubtype } : {}), ...(opts.countersIfPlaneswalker ? { countersIfPlaneswalker: opts.countersIfPlaneswalker } : {}), ...(escaped ? { escaped } : {}), ...(fromZone === "stack" ? { fromStack: true } : {}) };
    // "You may have ~ enter as a copy of ...": it becomes the copy as it enters (CR 707.5), so how it
    // enters and what it triggers wait for that choice.
    if (printed.entersAsCopy && copyCandidates(s, o, printed.entersAsCopy.filter).length) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "copy", enterOpts: how });
    else if (printed.entersExchangeText && textExchangeCandidates(s, o).length) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "exchangeText", enterOpts: how });
    else if (printed.entersUnderOpponent && opponents(s, o.controller).length) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "controlOpponent", enterOpts: how });
    // Neverwinter Hydra: that many dice, rolled as it enters; the counters their total (none rolled with X 0).
    else finishEntering(s, o, printed, how, withCounters && counterN ? { counter: withCounters.counter, n: withCounters.rollD ? rollDice(s, o.controller, withCounters.rollD, counterN, realDefOf(s, o).name).result : counterN, ...(withCounters.also ? { also: withCounters.also } : {}) } : undefined);
    // Entering with others (enterTogether): off the list until they all have, so the next ones don't see it.
    if (together && o.zone === "battlefield") {
      s.battlefield = s.battlefield.filter((x) => x !== id);
      together.ids.push(id);
      invalidateCharacteristics(s);
    }
  }
  // Leaving the battlefield: "dies" is a creature put into a graveyard from the battlefield (CR 700.4); other
  // triggers say "put into a graveyard" or "leaves the battlefield".
  // A creature put into a graveyard from the battlefield died (CR 700.4), a token too (it goes there first, CR 111.7).
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature) (s.diedThisTurn ??= []).push(lastController);
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature) (s.diedNamesThisTurn ??= []).push(o.faceDown ? "" : last.name);
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature) (s.diedTypesThisTurn ??= []).push(o.faceDown ? { subtypes: [], controller: lastController } : { subtypes: [...last.subtypes], ...(last.allCreatureTypes ? { all: true as const } : {}), controller: lastController });
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature && !o.isToken) (s.nontokenDiedThisTurn ??= []).push(lastController);
  // "Put into your graveyard from the battlefield": its owner's graveyard (CR 404.2), a token too (CR 111.7).
  if (fromZone === "battlefield" && to === "graveyard" && wasCreature) ((s.turnLog ??= {}).creaturesToYard ??= []).push({ owner: o.owner, ...(o.isToken ? { token: true as const } : {}) });
  if (fromZone === "battlefield" && to === "graveyard") s.toGraveyardThisTurn = (s.toGraveyardThisTurn ?? 0) + 1;
  if (fromZone === "battlefield" && to === "graveyard") {
    const mine = (((s.turnLog ??= {}).permanentTypesToYard ??= {})[o.owner] ??= []);
    for (const t of last.types) if (!mine.includes(t)) mine.push(t);
    if (last.types.includes("Artifact")) s.turnLog.artifactsToYard = (s.turnLog.artifactsToYard ?? 0) + 1;
  }
  // Cards put into each player's graveyard from anywhere this turn (Fraying Sanity), by owner; a token isn't a card.
  if (to === "graveyard" && o.zone === "graveyard" && fromZone !== "graveyard" && !o.isToken) (s.cardsToGraveyardThisTurn ??= {})[o.owner] = (s.cardsToGraveyardThisTurn?.[o.owner] ?? 0) + 1;
  if (fromZone === "battlefield") {
    if (!(s.permanentLeftThisTurn ??= []).includes(lastController)) s.permanentLeftThisTurn.push(lastController); // revolt
    if (wasCreature) {
      const left = ((s.turnLog ??= {}).creaturesLeft ??= {});
      left[lastController] = (left[lastController] ?? 0) + 1;
    }
    if (!last.types.includes("Land")) s.voidThisTurn = true;
  }
  // Descend: a permanent card (not a token, CR 700.11) put into its owner's graveyard from anywhere.
  if (to === "graveyard" && !o.isToken && !o.spellCopy && isPermanentCard(defOf(s, o)) && !(s.descendedThisTurn ??= []).includes(o.owner)) s.descendedThisTurn.push(o.owner);
  // Ennis, Debate Moderator: a card put into exile from anywhere, so not a token or a copy of a spell (rulings).
  if (to === "exile" && o.zone === "exile" && fromZone !== "exile" && !o.isToken && !o.spellCopy) (s.turnLog ??= {}).cardExiled = true;
  // Ravenous Trap: cards put into a graveyard from anywhere, so not tokens or copies of spells (CR 111.1, 707.10).
  if (to === "graveyard" && !o.isToken && !o.spellCopy) {
    const yards = ((s.turnLog ??= {}).toGraveyard ??= {});
    yards[o.owner] = (yards[o.owner] ?? 0) + 1;
    const types = (s.turnLog.toGraveyardTypes ??= {});
    for (const t of defOf(s, o).types) types[t] = (types[t] ?? 0) + 1;
    noteOwnGraveyardTypes(s, o);
  }
  if (fromZone === "battlefield")
    fireEvent(s, { type: "dies", to, id, controller: lastController, ...(opts.sacrificed ? { sacrificed: true } : {}), ...(opts.destroyedBy !== undefined ? { destroyedBy: opts.destroyedBy } : {}), ...(opts.exploitedBy ? { exploitedBy: opts.exploitedBy } : {}), hadAbilities, grantedAbilities: last.grantedAbilities, counters: lastCounters, wasCreature, power: last.power, toughness: last.toughness, snapshot, chars: last, attachments, ...(o.movedWith?.length ? { movedWith: o.movedWith } : {}) });
  // From the battlefield it's a leaves-the-battlefield ability: it looks back to the permanent, which may have had no
  // abilities (face down, Humility) (CR 603.10a).
  if (to === "graveyard" && !(fromZone === "battlefield" && !hadAbilities)) fireEvent(s, { type: "toGraveyard", id, from: fromZone });
  if (shuffleIn && to === "library") shuffleLibrary(s, player(s, o.owner));
  if (exiledUntil?.length) returnUntilLeaves(s, exiledUntil, last.name);
  if (fromZone === "battlefield" && s.phasedOut?.length) phaseInUntil(s, id, (o.zoneChanges ?? 1) - 1);
  // Cosmic Intervention: each card exiled this way gets its own delayed trigger (rulings); a token ceases to exist and
  // won't return (CR 111.7, rulings).
  if (exileReturn && o.zone === "exile" && !o.isToken)
    addDelayed(s, "nextEndStep", exileReturn.player, o, { targets: [], effects: [{ type: "putOntoBattlefield", what: { ref: "subjectCard" }, owner: true }], text: `Return ${last.name} to the battlefield under its owner's control.` }, exileReturn.sourceCardId || cardIdOf(o));
}

/** A card put into its owner's graveyard: its card types there, for "if a creature card was put into your graveyard". */
function noteOwnGraveyardTypes(s: GameState, o: GameObject) {
  const mine = ((s.turnLog ??= {}).toOwnGraveyardTypes ??= {})[o.owner] ??= [];
  for (const t of defOf(s, o).types) if (!mine.includes(t)) mine.push(t);
}

/**
 * The other components of a merged permanent that left the battlefield go to the zone it went to (CR 730.3), each a new
 * object; a commander that would go to its owner's library goes to the command zone instead (903.9c). Returns the ones
 * that went there, so an effect that finds the new object finds them all (730.3c).
 */
function scatterMerged(s: GameState, ids: ObjectId[], to: ZoneName, top: boolean): { id: ObjectId; zc: number }[] {
  const moved: { id: ObjectId; zc: number }[] = [];
  for (const id of ids) {
    const p = s.objects[id];
    if (!p || p.zone !== "merged") continue;
    const dest = p.isCommander && to === "library" ? "command" : to;
    if (dest !== to) log(s, `${defOf(s, p).name} goes to the command zone instead.`);
    p.zone = dest;
    p.zoneChanges = (p.zoneChanges ?? 0) + 1;
    p.mergedInto = undefined;
    p.controller = p.owner;
    p.timestamp = s.nextTimestamp++;
    const list = zoneList(s, p);
    if (list) top ? list.unshift(id) : list.push(id);
    if (dest === "graveyard") noteToGraveyard(s, p);
    if (dest === "graveyard" || dest === "exile") p.justMovedForCommander = p.isCommander;
    if (dest === "graveyard" && !p.isToken) {
      const yards = ((s.turnLog ??= {}).toGraveyard ??= {});
      yards[p.owner] = (yards[p.owner] ?? 0) + 1;
      const types = (s.turnLog.toGraveyardTypes ??= {});
      for (const t of defOf(s, p).types) types[t] = (types[t] ?? 0) + 1;
      noteOwnGraveyardTypes(s, p);
      if (!(s.descendedThisTurn ??= []).includes(p.owner)) s.descendedThisTurn.push(p.owner);
    }
    if (dest === "graveyard") (s.zoneBatch ??= []).push({ id, zc: p.zoneChanges, from: "merged", to: dest, owner: p.owner, ...(p.isToken ? { notCard: true as const } : {}), card: p.cardId });
    // A commander that went to the command zone instead isn't where the effect looks for the new objects.
    if (dest === to) moved.push({ id, zc: p.zoneChanges });
  }
  invalidateCharacteristics(s);
  return moved;
}

/** `fromStack`: it's a resolving spell becoming a permanent (sunburst, CR 702.44b). */
type EnterOpts = { /** Sunburst the spell gained (Lux Artillery), each instance apart. */ sunburstGained?: number; /** Bloodthirst the spell gained (Bloodlord of Vaasgoth), its total N. */ bloodthirstGained?: number; x?: number; tapped?: boolean; untapped?: boolean; counters?: Record<string, number>; countersIfCreature?: Record<string, number>; /** Counters only if it enters with that subtype (Heroic Return). */ countersIfSubtype?: { subtype: string; counters: Record<string, number> }; countersIfPlaneswalker?: Record<string, number>; escaped?: boolean; fromStack?: boolean; /** Its "enters under the control of an opponent of your choice" was applied. */ controlChosen?: boolean };

/**
 * The rest of entering the battlefield (CR 614.1c, 614.12): tapped or not, counters, "as it enters" choices,
 * then its enters event. `withCounters`: its "enters with N counters", counted before it was on the battlefield.
 */
function finishEntering(s: GameState, o: GameObject, compiled: CompiledCard, opts: EnterOpts, withCounters?: { counter: string; n: number; also?: { counter: string; n: number } }) {
  const id = o.id;
  // Its own replacement effects apply only if it has them as it would exist on the battlefield (CR 614.12): a nonbasic
  // land entering under Blood Moon has lost them (CR 305.7, rulings), so it doesn't enter tapped.
  const printed = characteristics(s, o).hasPrintedAbilities ? compiled : NO_ABILITIES;
  if (!characteristics(s, o).hasPrintedAbilities) withCounters = undefined;
  if (printed.entersTapped || opts.tapped || entersTappedNow(s, o, printed, opts.untapped) || othersMakeItEnterTapped(s, o)) o.tapped = !othersMakeItEnterUntapped(s, o);
  // Brimstone Vandal: day from the moment it enters, with neither (CR 731.1, 614.12).
  if (printed.entersDay && !s.dayNight) setDayNight(s, "day");
  // "As a historic permanent you control enters, it becomes a 7/7 Dinosaur creature in addition to its other types"
  // (Displaced Dinosaurs): from permanents already on the battlefield, judged by the permanent as it would exist there
  // (CR 614.12, as for othersAddCounters); it's that from the moment it enters (rulings).
  othersChangeIt(s, o);
  // A planeswalker enters with its printed loyalty in loyalty counters (CR 306.5b), its copiable values' if it's a copy.
  // Nissa, Steward of Elements: loyalty X, the X it was cast with, 0 if it wasn't cast (CR 107.3m, 306.5b).
  const loyalty = isType(defOf(s, o), "Planeswalker") ? (defOf(s, o).loyalty === "X" ? (opts.x ?? 0) : Number.parseInt(defOf(s, o).loyalty ?? "", 10)) : NaN;
  // The counters it enters with arrive at once (CR 614.1c): its own "enters with", a spell's "additional" ones (opts),
  // and others' "enters with an additional" (Renata). Each kind is one placement, so Hardened Scales adds one, and its
  // controller orders those replacement effects (CR 616.1) the way that gives the most.
  const entering: Record<string, number> = {};
  const add = (k: string, n: number) => n > 0 && (entering[k] = (entering[k] ?? 0) + n);
  // Compleated: two fewer for each Phyrexian symbol its caster paid life for (CR 702.150a).
  if (loyalty > 0) add("loyalty", printed.compleated && o.phyrexianLife ? loyalty - 2 * o.phyrexianLife : loyalty);
  // A battle enters with its printed defense in defense counters (CR 310.4b), its copiable values' if it's a copy (rulings).
  const defense = isType(defOf(s, o), "Battle") ? Number.parseInt(defOf(s, o).defense ?? "", 10) : NaN;
  if (defense > 0) add("defense", defense);
  // Polukranos, Unchained: "It escapes with twelve +1/+1 counters on it instead" (CR 702.138c).
  if (withCounters && opts.escaped && printed.entersWithCounters?.escaped !== undefined) withCounters = { ...withCounters, n: printed.entersWithCounters.escaped };
  if (withCounters) add(withCounters.counter, withCounters.n);
  if (withCounters?.also) add(withCounters.also.counter, withCounters.also.n);
  for (const [k, n] of Object.entries(opts.counters ?? {})) add(k, n);
  if (characteristics(s, o).types.includes("Creature")) for (const [k, n] of Object.entries(opts.countersIfCreature ?? {})) add(k, n);
  if (characteristics(s, o).types.includes("Planeswalker")) for (const [k, n] of Object.entries(opts.countersIfPlaneswalker ?? {})) add(k, n);
  if (opts.countersIfSubtype && characteristics(s, o).subtypes.includes(opts.countersIfSubtype.subtype)) for (const [k, n] of Object.entries(opts.countersIfSubtype.counters)) add(k, n);
  // "And as a Mutant in addition to its other types" (Master Biomancer): a type it has from the moment it enters, for as
  // long as it's on the battlefield (CR 614.1c, 613.1d).
  const asTypes: string[] = [];
  for (const [k, n] of Object.entries(othersAddCounters(s, o, asTypes))) add(k, n);
  if (asTypes.length) {
    s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: controllerOf(s, o), sourceName: defOf(s, o).name, duration: "game", affected: [o.id], mods: [{ kind: "addTypes", types: [], subtypes: asTypes, supertypes: [] }] });
    invalidateCharacteristics(s);
  }
  // Its own "enters with an additional counter", printed or granted as it enters (Master Chef, CR 614.12).
  for (const e of withGranted(printed, characteristics(s, o).grantedAbilities).entersWithAdditional ?? []) add(e.counter, evalAmount(s, e.n, { controller: controllerOf(s, o), sourceId: o.id }));
  for (const [k, n] of Object.entries(entering)) putCounters(s, o, k, n, true);
  // Bloodthirst: "if an opponent was dealt damage this turn" (CR 702.54a).
  // Bloodlord of Vaasgoth: bloodthirst the spell gained too, each instance applying (CR 702.54c).
  const thirst = (printed.bloodthirst ?? 0) + (opts.bloodthirstGained ?? 0);
  if (thirst && (s.damagedThisTurn ?? []).some((pid) => opponents(s, o.controller).includes(pid)))
    putCounters(s, o, "+1/+1", thirst, true);
  // Bloodthirst X: "where X is the total damage your opponents have been dealt this turn" (CR 702.54b).
  if (printed.bloodthirstX) {
    const n = opponents(s, o.controller).reduce((sum, pid) => sum + (s.damageThisTurn?.[pid] ?? 0), 0);
    if (n > 0) putCounters(s, o, "+1/+1", n, true);
  }
  // "~ escapes with N +1/+1 counters on it" (CR 702.138c).
  if (opts.escaped && printed.escapesWith) putCounters(s, o, "+1/+1", printed.escapesWith, true);
  // Sunburst: only a resolving spell, and only for colored mana spent to cast it (CR 702.44b). Whether it enters as a
  // creature ignores type-changing effects (702.44a): its copiable values decide.
  // One it gained as a spell (Lux Artillery) works the same, each instance apart (rulings).
  const sunbursts = [...(printed.sunburst ? [printed.sunburst] : []), ...Array.from({ length: opts.sunburstGained ?? 0 }, () => ({}) as { counter?: "+1/+1" })];
  for (const sb of opts.fromStack && o.colorsSpent?.length ? sunbursts : []) {
    const counter = sb.counter ?? (isType(defOf(s, o), "Creature") ? "+1/+1" : "charge");
    const put = putCounters(s, o, counter, o.colorsSpent!.length, true);
    log(s, `${defOf(s, o).name} enters with ${put} ${counter} counter${put === 1 ? "" : "s"} (sunburst).`);
  }
  // "This creature enters prepared" (CR 722.3a): the copy of its prepare spell is created as it enters (722.3c).
  if (printed.entersPrepared) becomePrepared(s, o);
  // Heightened Awareness: "As ~ enters, discard your hand" (CR 614.1c), before what its entering triggers.
  if (printed.entersDiscardHand) discardCards(s, controllerOf(s, o), [...player(s, controllerOf(s, o)).hand]);
  // Urborg Lhurgoyf: "mill three cards for each time it was kicked", as it enters (rulings: it doesn't use the stack).
  if (printed.entersMillPerKick && o.kicked?.length) {
    const pid = controllerOf(s, o);
    const n = millCount(s, pid, printed.entersMillPerKick * o.kicked.length);
    for (const id of player(s, pid).library.slice(0, n)) moveObject(s, id, "graveyard", { milled: true });
    log(s, `${player(s, pid).name} mills ${n} card${n === 1 ? "" : "s"}.`);
  }
  // A Saga enters with a lore counter (CR 714.3a), or with read ahead, the number its controller chooses (714.3b).
  const saga = characteristics(s, o).subtypes.includes("Saga");
  // Read ahead granted by another permanent (Barbara Wright) applies as it enters too (CR 614.12).
  const readAhead = !!printed.readAhead || characteristics(s, o).grantedAbilities.some((t) => !!compileGranted(t).readAhead);
  if (saga && !readAhead) putCounters(s, o, "lore", 1, true);
  // "Look at an opponent's hand, then choose a card type" (Arachne): the opponent first.
  if (printed.entersChoosePlayer && printed.entersLookHand) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "player", except: "you", lookHand: true });
  // "As ~ enters, choose a color": its controller chooses before anything else happens (CR 614.12).
  for (const c of printed.entersChoose ?? []) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, ...c });
  if (printed.entersAnchor) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "anchor" });
  // As a battle enters, its controller chooses its protector (CR 310.9a).
  if (isType(defOf(s, o), "Battle")) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "protector" });
  if (printed.entersChooseTwoPlayers) for (let i = 0; i < 2; i++) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "player", pair: true });
  if (printed.entersChoosePlayer && !printed.entersLookHand) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "player", ...(printed.entersChoosePlayer === "opponent" ? { except: "you" } : {}), ...(printed.entersChooseSecret ? { secret: true as const } : {}) });
  // Devour, riot and unleash: how many +1/+1 counters it has is part of how it enters (CR 614.12), so what it
  // triggers waits for that choice (evolve compares its power as it entered, CR 702.100a).
  // Riot granted by another permanent ("Nontoken creatures you control have riot", Rhythm of the Wild) applies too: it has
  // it as it would exist on the battlefield (CR 614.12, rulings).
  const grantedRiot = characteristics(s, o).grantedAbilities.flatMap((t) => (compileGranted(t).entersOptions ?? []).filter((x) => x === "riot"));
  const options: EntersOption[] = [...(printed.entersDiscardInstead ? (["discardInstead"] as const) : []), ...(printed.entersSacrificeInstead ? (["sacrificeInstead"] as const) : []), ...(saga && readAhead ? (["readAhead"] as const) : []), ...(printed.devour ? (["devour"] as const) : []), ...(printed.amplify ? (["amplify"] as const) : []), ...(printed.entersOptions ?? []), ...grantedRiot, ...(printed.entersForms ? (["form"] as const) : []), ...(printed.entersCounterChoice && (!printed.entersCounterChoice.escaped || opts.escaped) ? (["counterChoice"] as const) : [])];
  options.forEach((what, i) => (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what, ...(i === options.length - 1 ? { enters: opts.x ? { x: opts.x } : {} } : {}) }));
  if (!options.length) {
    const ev = { type: "enters" as const, id, ...(opts.x ? { x: opts.x } : {}) };
    if (together) together.events.push(ev);
    else fireEvent(s, ev);
  }
  // The door that was cast becomes unlocked as the Room enters (CR 709.5d, 709.5h).
  for (const door of o.unlocked ?? []) fireEvent(s, { type: "doorUnlocked", id, door });
}

/** What a permanent entering "as a copy of" something could copy: other permanents on the battlefield (not targeted). */
export function copyCandidates(s: GameState, o: GameObject, filter: TargetSpec): ObjectId[] {
  // A card in a graveyard (Lazotep Convert): by its printed characteristics there.
  if (filter.kind === "card") return livingPlayers(s).flatMap((pid) => player(s, pid).graveyard.filter((id) => id !== o.id && printedMatches(filter, defOf(s, obj(s, id)))));
  // Mockingbird's "with mana value less than or equal to the amount of mana spent to cast ~": the spell it was.
  const bound = filter.bound ? bindBound(s, filter, { controller: controllerOf(s, o), sourceId: o.id, manaSpent: o.manaSpent ?? 0 }) : filter;
  return s.battlefield.filter((id) => id !== o.id && objectMatches(s, bound, obj(s, id), controllerOf(s, o), false));
}

/** What Deadpool can exchange its text box with as it enters: another creature on the battlefield (not one entering with it). */
export function textExchangeCandidates(s: GameState, o: GameObject): ObjectId[] {
  return s.battlefield.filter((id) => id !== o.id && objIsType(s, obj(s, id), "Creature"));
}

/**
 * Exchange the text boxes of two permanents (CR 612.5, 701.12h): the rules text of each becomes the other's previous rules
 * text, a text-changing effect (layer 3, CR 613.1c) that lasts as long as each is on the battlefield.
 */
export function exchangeText(s: GameState, a: GameObject, b: GameObject) {
  const [da, db] = [defOf(s, a), defOf(s, b)];
  s.cards[da.oracleId] ??= da;
  s.cards[db.oracleId] ??= db;
  a.textFrom = db.oracleId;
  b.textFrom = da.oracleId;
  // Their new definitions, registered now (cardIdOf names them for triggers and the like).
  defOf(s, a);
  defOf(s, b);
  invalidateCharacteristics(s);
}

/** "As ~ enters, you may exchange ~'s text box and another creature's" (Deadpool): with `choice`, or not ("none"). */
function enterExchangingText(s: GameState, o: GameObject, choice: ObjectId | "none", opts: EnterOpts) {
  if (choice !== "none") {
    const other = obj(s, choice);
    if (other.zone !== "battlefield" || !objIsType(s, other, "Creature") || other.id === o.id) throw new RulesError("choose another creature on the battlefield");
    const [mine, theirs] = [defOf(s, o).name, defOf(s, other).name];
    exchangeText(s, o, other);
    log(s, `${mine} exchanges its text box with ${theirs}'s.`);
  }
  finishEnteringAs(s, o, opts);
}

/** It enters as a copy of `target`, or of nothing ("none"), then finishes entering as what it now is (CR 707.5). */
function enterAsCopy(s: GameState, o: GameObject, choice: ObjectId | "none", opts: EnterOpts) {
  const own = compileCard(defOf(s, o)).entersAsCopy;
  if (choice !== "none" && own) {
    const target = obj(s, choice);
    // Vizier of Many Faces: more exceptions for an embalmed token (CR 702.128b).
    const except = own.ifEmbalmed && o.embalmed ? { ...own.except, ...own.ifEmbalmed } : own.except;
    const key = copyKey(s, defOf(s, target), exceptFor(s, o, except, realDefOf(s, o).name));
    if (own.tapped) opts = { ...opts, tapped: true };
    if (own.untilEndOfTurn) addCopyEffect(s, o, key, "endOfTurn");
    else o.copyOf = key;
    lockIfRoom(s, o);
    invalidateCharacteristics(s);
    log(s, `${realDefOf(s, o).name} enters as a copy of ${defOf(s, target).name}${own.untilEndOfTurn ? " until end of turn" : ""}.`);
    // Spark Double: "an additional +1/+1 counter on it if it's a creature", judged as the copy (rulings).
    const more = copyEnterCounters(own.except, (type) => objIsType(s, o, type), opts.x ?? 0, controllerOf(s, target) === o.controller);
    if (Object.keys(more).length) {
      const counters = { ...opts.counters };
      for (const [k, n] of Object.entries(more)) counters[k] = (counters[k] ?? 0) + n;
      opts = { ...opts, counters };
    }
  }
  finishEnteringAs(s, o, opts);
}

/** Finish entering as what it now is, after "as it enters" copy or text choices (CR 614.12). */
function finishEnteringAs(s: GameState, o: GameObject, opts: EnterOpts) {
  const printed = compileCard(defOf(s, o));
  // A Clone entering as a copy of Xantcha enters under an opponent's control too (CR 614.12, 707.5).
  if (printed.entersUnderOpponent && !opts.controlChosen && opponents(s, o.controller).length) {
    (s.entersChoices ??= []).unshift({ id: o.id, zc: o.zoneChanges ?? 0, what: "controlOpponent", enterOpts: opts });
    return;
  }
  // A Clone entering as a copy of Primeval Spawn has its "If ~ would enter and it wasn't cast or no mana was spent to cast
  // it, exile it instead" as it would exist on the battlefield (CR 614.12, 707.5), judged by the Clone's own casting. It
  // never was on the battlefield, so nothing sees it leave.
  if (printed.exileUnlessCastWithMana && characteristics(s, o).hasPrintedAbilities && !(opts.fromStack && !o.isToken && (o.manaSpent ?? 0) > 0)) {
    log(s, `${realDefOf(s, o).name} is exiled instead of entering: ${opts.fromStack && !o.isToken ? "no mana was spent to cast it" : "it wasn't cast"}.`);
    s.battlefield = s.battlefield.filter((x) => x !== o.id);
    o.zone = "stack"; // in no zone list, so moving it isn't leaving the battlefield
    moveObject(s, o.id, "exile");
    return;
  }
  const ewc = printed.entersWithCounters?.afterChoice || printed.entersWithCounters?.afterPlayer ? undefined : printed.entersWithCounters;
  const n0 = ewc && !(ewc.if && !staticConditionNow(s, ewc.if, o.id, o.controller)) && !(ewc.ifWebSlung && !o.webSlung) ? Math.max(0, evalAmount(s, ewc.n, { controller: o.controller, sourceId: o.id, x: opts.x, manaSpent: o.manaSpent ?? 0, spent: o.spent, webSlungMv: o.webSlung?.manaValue })) * (ewc.doubleIfXAtLeast !== undefined && (opts.x ?? 0) >= ewc.doubleIfXAtLeast ? 2 : 1) : 0;
  // Neverwinter Hydra: that many dice, rolled as it enters; the counters their total (none rolled with X 0).
  const n = ewc?.rollD && n0 > 0 ? rollDice(s, o.controller, ewc.rollD, n0, realDefOf(s, o).name).result : n0;
  finishEntering(s, o, printed, opts, ewc && n ? { counter: ewc.counter, n, ...(ewc.also ? { also: ewc.also } : {}) } : undefined);
}

/**
 * "Exile ... until ~ leaves the battlefield" ends: right after the source leaves, the cards come back
 * under their owners' control, all at once (CR 610.3, 610.3c-d). Only if each is still the object it
 * exiled; a token has ceased to exist (CR 111.7). An Aura's owner chooses what it enchants as it returns
 * (CR 303.4f, rulings on Banishing Light and Oblivion Ring): that waits in `s.untilReturns` until the event that made
 * the source leave is over (askAuraReturns), since a choice can't be asked partway through one. It can't enchant
 * anything that returned at the same time, and with nothing it can enchant it stays in exile (CR 303.4g).
 */
export function returnUntilLeaves(s: GameState, links: { id: ObjectId; zc: number; hand?: true; graveyard?: true }[], source: string, why = `${source} left`) {
  const back = links.filter((l) => {
    const c = s.objects[l.id];
    return !!c && c.zone === "exile" && (c.zoneChanges ?? 0) === l.zc && !c.isToken;
  });
  enterTogether(s, () => {
    for (const l of back) {
      const c = obj(s, l.id);
      const d = defOf(s, c);
      // It returns to the zone it was exiled from (CR 610.3): Kitesail Freebooter's card goes back to its owner's hand.
      if (l.hand) {
        log(s, `${d.name} returns to its owner's hand (${why}).`);
        moveObject(s, c.id, "hand");
        continue;
      }
      // Idol of Endurance: to its owner's graveyard, where it was exiled from (rulings).
      if (l.graveyard) {
        log(s, `${d.name} returns to its owner's graveyard (${why}).`);
        moveObject(s, c.id, "graveyard");
        continue;
      }
      const r = (s.untilReturns ??= { auras: [], returned: [] });
      if (d.subtypes.includes("Aura")) {
        r.auras.push({ id: c.id, zc: c.zoneChanges ?? 0, under: c.owner, source });
        continue;
      }
      log(s, `${d.name} returns to the battlefield (${why}).`);
      moveObject(s, c.id, "battlefield", { controller: c.owner });
      r.returned.push(c.id); // at the same time as the rest of this event's returns (CR 610.3d)
    }
  });
}

/**
 * Auras waiting to return from "until ~ leaves" (returnUntilLeaves): each in turn, its owner chooses what it enchants
 * among what's legal now, apart from what returned with it (CR 303.4f); with one choice there's no question, with none
 * it stays in exile (303.4g). "asked" when a player has to choose, "moved" when one came back without a question.
 */
export function askAuraReturns(s: GameState): "asked" | "moved" | false {
  let moved = false;
  const r = s.untilReturns;
  while (r?.auras.length) {
    const e = r.auras[0]!;
    const c = s.objects[e.id];
    if (!c || c.zone !== "exile" || (c.zoneChanges ?? 0) !== e.zc) {
      r.auras.shift();
      continue;
    }
    const options = auraHostOptions(s, c, e.under).filter((h) => !("attachTo" in h && r.returned.includes(h.attachTo)));
    if (options.length > 1) {
      e.asking = true;
      s.pending = { kind: "chooseOption", player: e.under, source: e.source, what: "enchant", options: options.map(auraHostKey), labels: auraHostLabels(s, options), prompt: `choose what ${defOf(s, c).name} enchants as it returns` };
      return "asked";
    }
    r.auras.shift();
    returnAura(s, c, e.source, options[0]);
    moved = true;
  }
  s.untilReturns = undefined;
  return moved ? "moved" : false;
}

/** The owner chose what a returning Aura enchants (askAuraReturns). */
function auraReturnChosen(s: GameState, choice: string) {
  const e = s.untilReturns!.auras.shift()!;
  const c = s.objects[e.id];
  if (c && c.zone === "exile" && (c.zoneChanges ?? 0) === e.zc) returnAura(s, c, e.source, auraHostOf(choice));
}

function returnAura(s: GameState, c: GameObject, source: string, host: AuraHost | undefined) {
  const d = defOf(s, c);
  if (!host) {
    log(s, `${d.name} stays in exile (nothing it can enchant).`);
    return;
  }
  log(s, `${d.name} returns to the battlefield (${source} left) attached to ${auraHostName(s, host)}.`);
  moveObject(s, c.id, "battlefield", { controller: c.owner, ...host });
}

/** Button labels for an Aura's possible hosts: "Grizzly Bears (Ana)", numbered when two read the same. */
export function auraHostLabels(s: GameState, options: AuraHost[]): string[] {
  const labels = options.map((h) => ("attachTo" in h ? `${defOf(s, obj(s, h.attachTo)).name} (${player(s, controllerOf(s, obj(s, h.attachTo))).name})` : player(s, h.attachToPlayer).name));
  const seen = new Map<string, number>();
  return labels.map((l) => (labels.filter((x) => x === l).length > 1 ? `${l} #${seen.set(l, (seen.get(l) ?? 0) + 1).get(l)}` : l));
}

/**
 * Where an Aura put onto the battlefield without a spell goes (CR 303.4f): something its enchant
 * ability allows (it isn't targeted, so hexproof doesn't stop it). The player picks: one of their own
 * if the Aura only helps what it enchants, an opponent's otherwise.
 */
export function auraHostFor(s: GameState, aura: GameObject, pid: PlayerId, among?: string[]): AuraHost | undefined {
  const enchant = compileCard(defOf(s, aura)).enchant;
  if (!enchant) return undefined;
  // "Enchant player" (CR 702.5d): a player, not targeted. Curses hurt the player they enchant: an opponent.
  if (enchant.kind === "player") {
    const ok = (p: PlayerId) => !among || among.includes(auraHostKey({ attachToPlayer: p }));
    const p = opponents(s, pid).find(ok) ?? (enchant.opponent || !ok(pid) ? undefined : pid);
    return p === undefined ? undefined : { attachToPlayer: p };
  }
  const id = auraObjectHost(s, aura, pid, enchant, among);
  return id ? { attachTo: id } : undefined;
}

/** Where an Aura goes as it's put onto the battlefield: the permanent or the player it's attached to. */
export type AuraHost = { attachTo: ObjectId } | { attachToPlayer: PlayerId };
export const auraHostName = (s: GameState, h: AuraHost) => ("attachTo" in h ? nameOf(s, h.attachTo) : player(s, h.attachToPlayer).name);

/**
 * Everything an Aura entering under `pid`'s control without being cast could enchant (CR 303.4f): what its enchant
 * ability allows, on the battlefield now, not itself (303.4d), nothing with protection from it (702.16c). It isn't
 * targeted, so hexproof and shroud don't matter.
 */
export function auraHostOptions(s: GameState, aura: GameObject, pid: PlayerId): AuraHost[] {
  const enchant = compileCard(defOf(s, aura)).enchant;
  if (!enchant) return [];
  // "Enchant player", "enchant opponent" (CR 702.5d): a player still in the game.
  if (enchant.kind === "player") return (enchant.opponent ? opponents(s, pid) : livingPlayers(s)).map((p) => ({ attachToPlayer: p }));
  // "Enchant creature card in a graveyard" (Animate Dead): such a card in any graveyard.
  if (enchant.kind === "card") return graveyardCards(s, enchant).map((id) => ({ attachTo: id }));
  return s.battlefield.filter((id) => id !== aura.id && objectMatches(s, enchant, obj(s, id), pid, false, defOf(s, aura))).map((id) => ({ attachTo: id }));
}

/** An AuraHost as a chooseOption option ("enchant"), and back. */
export const auraHostKey = (h: AuraHost) => ("attachTo" in h ? h.attachTo : `player:${h.attachToPlayer}`);
export const auraHostOf = (key: string): AuraHost => (key.startsWith("player:") ? { attachToPlayer: Number(key.slice(7)) } : { attachTo: key });

/** The cards in every living player's graveyard that match a card filter (Animate Dead's "creature card in a graveyard"). */
const graveyardCards = (s: GameState, f: TargetSpec): ObjectId[] => livingPlayers(s).flatMap((p) => player(s, p).graveyard.filter((id) => printedMatches(f, defOf(s, obj(s, id)))));

function auraObjectHost(s: GameState, aura: GameObject, pid: PlayerId, enchant: TargetSpec, among?: string[]): ObjectId | undefined {
  // Animate Dead entering without being cast: the biggest creature card in a graveyard.
  if (enchant.kind === "card") return graveyardCards(s, enchant).filter((id) => !among || among.includes(id)).sort((a, b) => defMv(defOf(s, obj(s, b))) - defMv(defOf(s, obj(s, a))))[0];
  const legal = s.battlefield.filter((id) => id !== aura.id && (!among || among.includes(id)) && objectMatches(s, enchant, obj(s, id), pid, false, defOf(s, aura)));
  const mine = (id: ObjectId) => controllerOf(s, obj(s, id)) === pid;
  const good = (m: Modification) =>
    m.kind === "addKeywords" || (m.kind === "addAbility" && !modsAreHarmful([m])) || (m.kind === "modifyPT" && !(typeof m.power === "number" && m.power < 0) && !(typeof m.toughness === "number" && m.toughness < 0));
  const statics = compileCard(defOf(s, aura)).statics;
  const helps = statics.length > 0 && statics.every((st) => st.mods.every(good));
  return (helps ? legal.find(mine) : legal.find((id) => !mine(id))) ?? legal[0];
}

/**
 * "Enters tapped unless you control two or fewer other lands" and the like (CR 614.1d): checked
 * as it enters, so it doesn't count itself. "As it enters, you may pay 2 life (reveal a card). If you
 * don't, it enters tapped" depends on `choice` (CR 614.12).
 */
/**
 * "Creatures your opponents control enter tapped" (Authority of the Consuls): permanents already on the battlefield, not
 * the entering one itself; such an effect wins over "enters tapped unless" (rulings), since it applies either way.
 */
/**
 * "Each other creature you control enters with an additional +1/+1 counter on it" (Renata, Called to the Hunt): from
 * permanents already on the battlefield, so not ones entering at the same time (rulings on Renata, Grumgully, Dragonstorm
 * Globe), judged by the permanent as it would exist there: one entering as a copy of a Human is a Human (CR 614.12,
 * rulings on Grumgully).
 */
function othersAddCounters(s: GameState, o: GameObject, subtypes: string[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of s.battlefield) {
    if (id === o.id) continue;
    const src = obj(s, id);
    const rules = abilitiesOf(s, src).othersEnterWithCounters;
    if (!rules) continue;
    const you = controllerOf(s, src);
    for (const r of rules) {
      // "Of the chosen type": the one chosen as the source entered.
      const filter = bindChosen(r.filter, src.chosen);
      if (r.while && !staticConditionNow(s, r.while, src.id, you)) continue;
      if (!filter.chosen && objectMatches(s, filter, o, you, false)) {
        // Giada: "for each Angel you already control", the entering one aside, Giada included (rulings).
        // Arwen: its toughness as the creature enters (rulings), none if 0 or less.
        // Master Biomancer: its power, likewise.
        // Kalain, Coin of Mastery: the mana from Treasures or artifact sources spent to cast it, kept as the spell became
        // this permanent (none for one not cast, or a token copy of a spell, CR 707.10).
        const times = r.perControlled ? s.battlefield.filter((x) => x !== o.id && controllerOf(s, obj(s, x)) === you && objectMatches(s, r.perControlled!, obj(s, x), you, false)).length : r.perSourceToughness ? Math.max(0, toughness(s, src)) : r.perSourcePower ? Math.max(0, power(s, src)) : r.perSpentFrom ? (o.spent?.from?.[r.perSpentFrom] ?? 0) : r.per !== undefined ? evalAmount(s, r.per, { controller: you, sourceId: src.id }) : 1;
        if (times) out[r.counter] = (out[r.counter] ?? 0) + r.n * times;
        if (r.asSubtype && !subtypes.includes(r.asSubtype)) subtypes.push(r.asSubtype);
      }
    }
  }
  return out;
}

function othersChangeIt(s: GameState, o: GameObject) {
  for (const id of s.battlefield) {
    if (id === o.id) continue;
    const src = obj(s, id);
    const rules = abilitiesOf(s, src).othersEnterAs;
    if (!rules) continue;
    const you = controllerOf(s, src);
    for (const r of rules) {
      if (!objectMatches(s, r.filter, o, you, false)) continue;
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: you, sourceName: characteristics(s, src).name, duration: "game", affected: [o.id], mods: r.mods });
      invalidateCharacteristics(s);
      log(s, `${characteristics(s, o).name} enters as ${r.text.replace(/^.*?, it becomes /, "").replace(/ in addition to its other types\.$/, "")} (${characteristics(s, src).name}).`);
    }
  }
}

/** "Lands you control enter untapped" (Spelunking): a permanent already on the battlefield lets `o` enter untapped. */
export function othersMakeItEnterUntapped(s: GameState, o: GameObject): boolean {
  return s.battlefield.some((id) => {
    if (id === o.id) return false;
    const src = obj(s, id);
    const rules = compileCard(defOf(s, src)).othersEnterUntapped;
    if (!rules || !characteristics(s, src).hasPrintedAbilities) return false;
    const you = controllerOf(s, src);
    return rules.some((r) => objectMatches(s, r.filter, o, you, false));
  });
}

function othersMakeItEnterTapped(s: GameState, o: GameObject): boolean {
  if (s.entersTappedUntil?.some((r) => objectMatches(s, r.filter, o, r.controller, false))) return true;
  return s.battlefield.some((id) => {
    if (id === o.id) return false;
    const src = obj(s, id);
    const rules = compileCard(defOf(s, src)).othersEnterTapped;
    if (!rules || !characteristics(s, src).hasPrintedAbilities) return false;
    const you = controllerOf(s, src);
    // "Of the chosen quality" (Ashling's Prerogative): chosen as the source entered. "Enchanted player controls"
    // (Radiant Restraints): the player the Aura is attached to now.
    return rules.some((r) => {
      if (r.filter.controller !== "enchanted") return objectMatches(s, bindChosen(r.filter, src.chosen), o, you, false);
      const { controller: _, ...rest } = r.filter;
      return src.attachedToPlayer !== undefined && objectMatches(s, { ...rest, controlledBy: src.attachedToPlayer }, o, you, false);
    });
  });
}

function entersTappedNow(s: GameState, o: GameObject, printed: CompiledCard, choice?: boolean): boolean {
  if (printed.entersTappedUnless) return !conditionHolds(s, printed.entersTappedUnless, o.controller, o.id);
  if (printed.entersTappedChoice) return !choice && !controlsForEntry(s, o.controller, printed.entersTappedChoice, o.id);
  return false;
}

/** Temple of the Dragon Queen's "or you control a Dragon": a permanent other than the land itself, as it enters. */
function controlsForEntry(s: GameState, pid: PlayerId, choice: EntersChoice, landId: ObjectId): boolean {
  return choice.kind === "reveal" && !!choice.orControl && s.battlefield.some((id) => id !== landId && controllerOf(s, obj(s, id)) === pid && objectMatches(s, choice.orControl!, obj(s, id), pid, false));
}

export function conditionHolds(s: GameState, cond: EntersCondition, you: PlayerId, self?: ObjectId): boolean {
  switch (cond.kind) {
    case "playerLifeAtMost":
      return livingPlayers(s).some((pid) => player(s, pid).life <= cond.n);
    case "opponents":
      return opponents(s, you).length >= cond.min;
    // Starting Town: "unless it's your first, second, or third turn of the game".
    case "ownTurnAtMost":
      return s.activePlayer === you && (player(s, you).turnsTaken ?? 0) <= cond.n;
    case "yourTurn":
      return s.activePlayer === you;
    case "control": {
      const n = s.battlefield.filter((id) => {
        if (id === self) return false;
        const x = obj(s, id);
        const mine = controllerOf(s, x) === you;
        if (cond.who === "you" ? !mine : mine) return false;
        const c = characteristics(s, x);
        if (cond.types && !cond.types.every((ty) => c.types.includes(ty))) return false;
        if (cond.supertypes && !cond.supertypes.every((ty) => c.supertypes.includes(ty))) return false;
        if (cond.colors && !cond.colors.every((col) => c.colors.includes(col))) return false;
        return !cond.subtypes || cond.subtypes.some((ty) => c.subtypes.includes(ty));
      }).length;
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
  }
}

/**
 * The abilities a card about to enter the battlefield under `pid`'s control would have there, which decide how it
 * enters (CR 614.12): under Blood Moon a nonbasic land has lost them (CR 305.7), so a shock land doesn't ask for 2
 * life and a tapland enters untapped (rulings). Looked at by putting it on the battlefield for a moment, with the
 * newest timestamp, and taking it back.
 */
export function entersRulesOf(s: GameState, pid: PlayerId, id: ObjectId): CompiledCard {
  const o = obj(s, id);
  const compiled = compileCard(defOf(s, o));
  if (o.zone === "battlefield") return characteristics(s, o).hasPrintedAbilities ? compiled : NO_ABILITIES;
  const was = { zone: o.zone, controller: o.controller, timestamp: o.timestamp };
  o.zone = "battlefield";
  o.controller = pid;
  o.timestamp = s.nextTimestamp;
  s.battlefield.unshift(id);
  invalidateCharacteristics(s);
  try {
    return characteristics(s, o).hasPrintedAbilities ? compiled : NO_ABILITIES;
  } finally {
    s.battlefield.shift();
    Object.assign(o, was);
    invalidateCharacteristics(s);
  }
}

/** Would this card be a creature on the battlefield under `pid`, face down as `faceDown` says (CR 614.12)? */
function entersAsCreature(s: GameState, o: GameObject, pid: PlayerId, faceDown?: FaceDownKind): boolean {
  if (o.zone === "battlefield") return objIsType(s, o, "Creature");
  const was = { zone: o.zone, controller: o.controller, timestamp: o.timestamp, faceDown: o.faceDown };
  o.zone = "battlefield";
  o.controller = pid;
  o.timestamp = s.nextTimestamp;
  if (faceDown) o.faceDown = faceDown;
  s.battlefield.unshift(o.id);
  invalidateCharacteristics(s);
  try {
    return objIsType(s, o, "Creature");
  } finally {
    s.battlefield.shift();
    Object.assign(o, was);
    if (was.faceDown === undefined) delete o.faceDown;
    invalidateCharacteristics(s);
  }
}

/**
 * Can this land enter untapped by its "you may pay 2 life / reveal a card" choice right now?
 * Paying life needs at least that much life (CR 119.4); revealing needs a matching card in hand
 * besides the land itself.
 */
export function canEnterUntapped(s: GameState, pid: PlayerId, landId: ObjectId): boolean {
  const choice = entersRulesOf(s, pid, landId).entersTappedChoice;
  if (!choice) return false;
  const p = player(s, pid);
  if (choice.kind === "payLife") return payableLife(s, pid) >= choice.n;
  if (controlsForEntry(s, pid, choice, landId)) return true;
  return p.hand.some((id) => id !== landId && printedMatches(choice.filter, defOf(s, obj(s, id))));
}

/** A player gains life (CR 119.3): one life-gain event, which "whenever you gain life" abilities see (CR 119.10). */
export function gainLife(s: GameState, pid: PlayerId, n: number) {
  if (n <= 0) return;
  if (!canGainLife(s, pid)) {
    log(s, `${player(s, pid).name} can't gain life.`); // CR 119.7
    return;
  }
  // "That player gains no life instead" (Sulfuric Vortex, CR 614.1a): whatever order the player applies it in with the
  // others below, no life is gained (CR 616.1). Unlike "can't gain life", it doesn't stop costs or exchanges.
  if (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).gainsNoLife)) {
    log(s, `${player(s, pid).name} gains no life instead.`);
    return;
  }
  // "That player loses that much life instead" (Tainted Remedy, CR 614.1a): the player chooses the order of the
  // replacements (CR 616.1, rulings); this one first replaces the gain before anything doubles it, so the least is lost.
  if (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).opponentsGainLose && controllerOf(s, obj(s, id)) !== pid)) {
    log(s, `${player(s, pid).name} loses ${n} life instead of gaining it.`);
    loseLife(s, pid, n);
    return;
  }
  // "You gain that much life plus 1 instead" (rulings: one more for each), then "twice that much" (CR 614.1a): the
  // player gaining life chooses the order (CR 616.1, Alhammarret's Archive rulings); adding first gains the most.
  const plus = s.battlefield.reduce((a, id) => a + (controllerOf(s, obj(s, id)) === pid ? (abilitiesOf(s, obj(s, id)).lifeGainPlus ?? 0) : 0), 0);
  if (plus) {
    n += plus;
    log(s, `${player(s, pid).name} gains ${plus} more life.`);
  }
  // "If you would gain life, you gain twice that much life instead" (CR 614.1a): each one doubles it again (rulings).
  // Phial of Galadriel: only while its controller has 5 or less life, before the gain.
  const doublers = s.battlefield.filter((id) => {
    const ab = controllerOf(s, obj(s, id)) === pid ? abilitiesOf(s, obj(s, id)) : undefined;
    return !!ab?.doubleLifeGain && (!ab.doubleLifeGainIf || staticConditionNow(s, ab.doubleLifeGainIf, id, pid));
  }).length;
  if (doublers) {
    n *= 2 ** doublers;
    log(s, `${player(s, pid).name} gains twice as much life${doublers > 1 ? `, ${doublers} times over` : ""}.`);
  }
  player(s, pid).life += n;
  const gained = ((s.turnLog ??= {}).gainedLife ??= []);
  const first = !gained.includes(pid);
  if (first) gained.push(pid);
  const total = (s.turnLog.lifeGained ??= {});
  total[pid] = (total[pid] ?? 0) + n;
  fireEvent(s, { type: "lifeGained", player: pid, amount: n, first });
}

/** `pid` pays or loses `n` energy counters (CR 107.14, 122.1), counted for the turn (Blaster Hulk). */
export function loseEnergy(s: GameState, pid: PlayerId, n: number) {
  const p = player(s, pid);
  const lost = Math.min(n, p.energy ?? 0);
  if (lost <= 0) return;
  p.energy = (p.energy ?? 0) - lost;
  const total = ((s.turnLog ??= {}).energyLost ??= {});
  total[pid] = (total[pid] ?? 0) + lost;
}

/** A rule for one player this turn (Courageous Resolve): see GameState.turnRules. */
const turnRule = (s: GameState, pid: PlayerId, rule: TurnRule["rule"]) => (s.turnRules ?? []).some((r) => r.turn === s.turn && r.player === pid && r.rule === rule);

/** Can this player lose life, or does "you can't lose life this turn" stop it (CR 119.8)? */
export function canLoseLife(s: GameState, pid: PlayerId): boolean {
  return !turnRule(s, pid, "cantLoseLife") && !player(s, pid).lifeCantChange && player(s, pid).lifeCantChangeTurn !== s.turn && !lifeLocked(s, pid);
}

/** "Your life total can't change" (Platinum Emperion, CR 119.7-8): a permanent of this player's says so. */
const lifeLocked = (s: GameState, pid: PlayerId) => s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).lifeCantChange && controllerOf(s, obj(s, id)) === pid);

/** An activated ability's "pay half your life, rounded up" right now: 0 with 0 or less life (rulings on Lurking Evil). */
export function halfLifeCost(s: GameState, pid: PlayerId, ab: ActivatedAbility): number {
  return ab.halfLifeCost ? halve(Math.max(0, player(s, pid).life), ab.halfLifeCost) : 0;
}

/** The most life `pid` can pay (CR 119.4): none while they can't lose life (CR 119.8). */
export function payableLife(s: GameState, pid: PlayerId): number {
  return canLoseLife(s, pid) ? player(s, pid).life : 0;
}

/** Can this player gain life, or does a "can't gain life" effect stop it (CR 119.7)? */
export function canGainLife(s: GameState, pid: PlayerId): boolean {
  if (player(s, pid).lifeCantChange || player(s, pid).lifeCantChangeTurn === s.turn || player(s, pid).cantGainLifeForGame || lifeLocked(s, pid)) return false;
  const stops = (who: "all" | "opponents" | "enchanted" | undefined, controller: PlayerId, o?: GameObject) => who === "all" || (who === "opponents" && controller !== pid) || (who === "enchanted" && o?.attachedToPlayer === pid);
  if ((s.noLifeGain ?? []).some((e) => e.turn === s.turn && stops(e.who, e.controller))) return false;
  return !s.battlefield.some((id) => stops(abilitiesOf(s, obj(s, id)).cantGainLife, controllerOf(s, obj(s, id)), obj(s, id)));
}

/** Can damage be prevented now, or does a "damage can't be prevented" effect stop prevention effects (CR 615.12)? */
export function canPreventDamage(s: GameState): boolean {
  return s.noPreventionTurn !== s.turn && !s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).damageCantBePrevented);
}

/** A player loses life (CR 119.3): from damage (119.2), an effect, or paying life (119.4). One life-loss event. */
export function loseLife(s: GameState, pid: PlayerId, n: number) {
  if (n <= 0) return;
  // "You can't lose life this turn" (Courageous Resolve): damage is still dealt, but the life total doesn't change.
  if (!canLoseLife(s, pid)) return;
  // Bloodletter of Aclazotz: an opponent of the active player loses twice that much, again for each one (CR 614.1a, 616.1).
  const doublers = pid === s.activePlayer ? 0 : s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === s.activePlayer && abilitiesOf(s, obj(s, id)).opponentsLoseDouble).length;
  if (doublers) {
    n *= 2 ** doublers;
    log(s, `${player(s, pid).name} loses twice as much life${doublers > 1 ? `, ${doublers} times over` : ""}.`);
  }
  player(s, pid).life -= n;
  const first = !(s.lostLifeThisTurn ??= []).includes(pid);
  if (first) s.lostLifeThisTurn.push(pid);
  const lost = ((s.turnLog ??= {}).lifeLost ??= {});
  lost[pid] = (lost[pid] ?? 0) + n;
  const batch = lifeBatch ?? (s.lifeLossEvents = (s.lifeLossEvents ?? 0) + 1);
  fireEvent(s, { type: "lifeLost", player: pid, amount: n, first, batch });
}

let lifeBatch: number | undefined;

/** Life that several players lose at the same time inside `fn` (damage dealt at once, "each opponent loses 2 life") is one event. */
export function simultaneousLifeLoss<T>(s: GameState, fn: () => T): T {
  if (lifeBatch !== undefined) return fn();
  lifeBatch = s.lifeLossEvents = (s.lifeLossEvents ?? 0) + 1;
  try {
    return fn();
  } finally {
    lifeBatch = undefined;
  }
}

/**
 * The "If a card would be put into an opponent's graveyard from anywhere, exile it instead" effect (CompiledCard
 * graveyardExile) that applies to `o` going to its owner's graveyard, if one does: the name of its source, and the
 * counter it's exiled with.
 */
function graveyardExileFor(s: GameState, o: GameObject, fromZone: ZoneName): { source: string; counter?: CounterKind; linkTo?: ObjectId } | undefined {
  // Who controlled it: as a permanent or spell, its controller; anywhere else, its owner (CR 108.4a).
  const item = fromZone === "stack" ? s.stack.find((x) => x.objectId === o.id) : undefined;
  const controlled = fromZone === "battlefield" ? controllerOf(s, o) : fromZone === "stack" ? (item?.controller ?? o.controller) : o.owner;
  const applies = (x: CompiledCard["graveyardExile"], controller: PlayerId) =>
    !!x && (!o.isToken || !!x.tokens) && (!x.permanents || fromZone === "battlefield") && (x.whose === "any" || (x.whose === "yours") === (o.owner === controller)) && (!x.filter || printedMatches(x.filter, defOf(s, o))) && !(x.notYours && controlled === controller);
  for (const id of s.battlefield) {
    const p = obj(s, id);
    const x = abilitiesOf(s, p).graveyardExile;
    if (applies(x, controllerOf(s, p))) return { source: characteristics(s, p).name, ...(x!.counter ? { counter: x!.counter } : {}), ...(x!.linked && p.id !== o.id ? { linkTo: p.id } : {}) };
  }
  // "If a card would be put into your graveyard from anywhere this turn, exile it instead" (Yawgmoth's Will, Forgotten
  // Cellar): its owner's graveyard, a card only (rulings: tokens go to the graveyard as normal).
  const turn = !o.isToken && s.graveyardTurn?.find((g) => g.player === o.owner && g.turn === s.turn && g.exileInstead);
  if (turn) return { source: turn.source };
  if (fromZone !== "battlefield") return undefined;
  for (const l of s.leftTogether ?? []) {
    if (!l.hadAbilities || l.id === o.id) continue;
    const x = withGranted(compileCard(defOf(s, obj(s, l.id))), l.granted ?? []).graveyardExile;
    if (applies(x, l.controller)) return { source: defOf(s, obj(s, l.id)).name, ...(x!.counter ? { counter: x!.counter } : {}) };
  }
  return undefined;
}

/** Birgi: "Creatures you control can boast twice during each of your turns rather than once" (CR 702.142a). */
function boastsTwice(s: GameState, pid: PlayerId): boolean {
  return s.activePlayer === pid && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).boastTwice);
}

/**
 * Does an "exile it instead" replacement effect apply to `o` dying: its own, or another permanent's about it? Which
 * permanent's, for "instead exile it and you gain 2 life" (The Darkness Crystal) and "... and create a 2/2 black Zombie
 * creature token" (Kalitas).
 */
function exiledInsteadOfDying(s: GameState, o: GameObject): { id: ObjectId; controller: PlayerId; x: NonNullable<CompiledCard["exileInsteadOfDying"]> } | null {
  const own = abilitiesOf(s, o).exileInsteadOfDying;
  if (own?.self) return { id: o.id, controller: controllerOf(s, o), x: own };
  if (own?.alsoSelf) return { id: o.id, controller: controllerOf(s, o), x: { self: true } };
  const applies = (id: ObjectId, x: CompiledCard["exileInsteadOfDying"], controller: PlayerId) => !!x?.filter && !(x.other && id === o.id) && objectMatches(s, x.filter, o, controller, false);
  for (const id of s.battlefield) {
    const x = abilitiesOf(s, obj(s, id)).exileInsteadOfDying;
    if (applies(id, x, controllerOf(s, obj(s, id)))) return { id, controller: controllerOf(s, obj(s, id)), x: x! };
  }
  // One leaving the battlefield at the same time still applies (rulings on Kalitas, Traitor of Ghet).
  for (const l of s.leftTogether ?? []) {
    const x = l.hadAbilities ? withGranted(compileCard(defOf(s, obj(s, l.id))), l.granted ?? []).exileInsteadOfDying : undefined;
    if (applies(l.id, x, l.controller)) return { id: l.id, controller: l.controller, x: x! };
  }
  return null;
}

/** Is a permanent that dealt `o` damage this turn one that exiles it instead of letting it die (Kumano)? */
function exiledByWhatDamagedIt(s: GameState, o: GameObject): boolean {
  const by = o.damagedBy ?? [];
  for (const id of s.battlefield) {
    const w = obj(s, id);
    const how = abilitiesOf(s, w).exileWhatItDamaged;
    if ((how === "self" && by.includes(id)) || (how === "attached" && w.attachedTo && by.includes(w.attachedTo))) return true;
  }
  return (s.leftTogether ?? []).some((l) => l.hadAbilities && by.includes(l.id) && withGranted(compileCard(defOf(s, obj(s, l.id))), l.granted ?? []).exileWhatItDamaged === "self");
}

/**
 * Tap a permanent (CR 701.26a). Only an untapped one can be: then it "becomes tapped", which triggers abilities
 * (rulings: tapping a tapped permanent, or one entering tapped, doesn't).
 */
export function tapPermanent(s: GameState, o: GameObject, /** Tapped as it's declared as an attacker (CR 508.1f). */ attacking?: true) {
  if (o.tapped) return;
  o.tapped = true;
  const zc = o.zoneChanges ?? 0;
  const before = o.tapsThisTurn?.turn === s.turn && o.tapsThisTurn.zc === zc ? o.tapsThisTurn.n : 0;
  o.tapsThisTurn = { turn: s.turn, zc, n: before + 1 };
  if (o.zone === "battlefield") fireEvent(s, { type: "tapped", id: o.id, ...(attacking ? { attacking } : {}) });
}

/**
 * Untap a permanent. A stun counter replaces that: one is removed instead (CR 122.1d). Untapping
 * an untapped permanent isn't an untap, so the counter stays.
 */
export function untapPermanent(s: GameState, o: GameObject) {
  if (!o.tapped) return;
  // Frozen in Ice: "can't become untapped": nothing untaps it, so no stun counter is removed either (CR 122.1d).
  if (o.zone === "battlefield" && characteristics(s, o).cantBecomeUntapped) return;
  if ((o.counters.stun ?? 0) > 0) {
    // Fear of Sleep Paralysis: the counter can't be removed, so it neither untaps nor loses it (rulings).
    if (countersStay(s, o, "stun")) return;
    o.counters.stun! -= 1;
    log(s, `A stun counter is removed from ${defOf(s, o).name} instead of untapping it.`);
    return;
  }
  o.tapped = false;
  o.untaps = (o.untaps ?? 0) + 1;
  endWhileTapped(s);
  // It "becomes untapped" (CR 701.26b); during the untap step, what that triggers waits for the upkeep (CR 502.4).
  if (o.zone === "battlefield") fireEvent(s, { type: "untapped", id: o.id });
}

/**
 * End "for as long as ~ remains tapped" effects (CR 611.2b) whose permanent untapped, left the battlefield (it's no
 * longer tapped, rulings), phased out (CR 702.26f), or, with "for as long as you control ~", changed control; and "for
 * as long as you control ~" effects whose permanent left, phased out or changed control.
 */
export function endWhileTapped(s: GameState): boolean {
  // "For as long as it has a shadow counter on it" (CR 611.2b): over for a permanent once it has none, even if one is
  // put on it again later.
  let lost = false;
  for (const e of s.effects) {
    if (!e.whileCounter) continue;
    const kept = e.affected.filter((id) => (s.objects[id]?.counters[e.whileCounter!] ?? 0) > 0);
    if (kept.length < e.affected.length) [e.affected, lost] = [kept, true];
  }
  const ended = s.effects.filter((e) => (e.whileTapped && !whileTappedHolds(s, e.whileTapped)) || (e.whileControlled && !whileControlledHolds(s, e.whileControlled)) || (e.whileCounter && !e.affected.length));
  if (!ended.length) {
    if (lost) invalidateCharacteristics(s);
    return lost;
  }
  s.effects = s.effects.filter((e) => !ended.includes(e));
  invalidateCharacteristics(s);
  return true;
}

export function whileControlledHolds(s: GameState, w: NonNullable<ContinuousEffect["whileControlled"]>): boolean {
  const o = s.objects[w.id];
  return !!o && o.zone === "battlefield" && (o.zoneChanges ?? 0) === w.zc && (w.controller === undefined || controllerOf(s, o) === w.controller);
}

export function whileTappedHolds(s: GameState, w: NonNullable<ContinuousEffect["whileTapped"]>): boolean {
  const o = s.objects[w.id];
  if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== w.zc || !o.tapped || (o.untaps ?? 0) !== w.untaps) return false;
  return w.controller === undefined || controllerOf(s, o) === w.controller;
}

/**
 * Remove a shield counter if `o` has one (CR 122.1c): it replaces the damage or destruction that
 * was about to happen. Returns true when it did.
 */
export function useShieldCounter(s: GameState, o: GameObject, what: string): boolean {
  if ((o.counters.shield ?? 0) <= 0) return false;
  o.counters.shield! -= 1;
  log(s, `A shield counter is removed from ${defOf(s, o).name} instead of ${what}.`);
  return true;
}

/**
 * Destroy a permanent (CR 701.8): indestructible ones aren't (CR 702.12b), and a
 * regeneration shield replaces it (CR 701.19a): damage is removed, it's tapped, and it
 * leaves combat. Returns true if it was destroyed, wherever a replacement effect then sent it.
 */
export function destroyPermanent(s: GameState, o: GameObject, message: string, noRegen = false, /** The controller of the spell or ability destroying it (Cobra Trap). */ by?: PlayerId): boolean {
  if (objHasKeyword(s, o, "Indestructible")) return false;
  if (useShieldCounter(s, o, "it being destroyed")) return false;
  const name = defOf(s, o).name;
  // "It can't be regenerated (this turn)": its shields don't apply (CR 701.19c); they stay for later.
  // Mossbridge Troll: "If ~ would be destroyed, regenerate it": regenerated with no shield used up (rulings).
  const always = !noRegen && o.noRegenTurn !== s.turn && !!abilitiesOf(s, o).regeneratesInsteadOfDestroyed;
  if (!noRegen && o.noRegenTurn !== s.turn && ((o.regenShields ?? 0) > 0 || always)) {
    if (!always) o.regenShields! -= 1;
    o.damage = 0;
    o.deathtouchDamage = false;
    tapPermanent(s, o);
    if (o.attacking !== undefined || o.blocking !== undefined) {
      removeFromCombat(s, o);
      clearCombat(o);
    }
    log(s, `${name} regenerates.`);
    return false;
  }
  // Umbra armor (CR 702.89a) replaces the destruction even when it can't be regenerated. With a regeneration
  // shield too, the controller could pick either (CR 616.1); the shield is used first, which keeps the Aura.
  const umbra = s.battlefield.map((id) => obj(s, id)).find((a) => a.attachedTo === o.id && (objHasKeyword(s, a, "Umbra armor") || objHasKeyword(s, a, "Totem armor")));
  if (umbra) {
    o.damage = 0;
    o.deathtouchDamage = false;
    log(s, `${defOf(s, umbra).name}'s umbra armor saves ${name}.`);
    destroyPermanent(s, umbra, `${defOf(s, umbra).name} is destroyed instead.`);
    return false;
  }
  log(s, message);
  const noncreature = !objIsType(s, o, "Creature");
  const controller = controllerOf(s, o);
  moveObject(s, o.id, "graveyard", by !== undefined ? { destroyedBy: by } : {});
  // Destroyed even when a replacement (Rest in Peace, "exile it instead") sends it elsewhere: that replaces only where it
  // goes (CR 614.6), not the destruction (Fumigate's and Bane of Progress' rulings). Only regeneration, a shield counter
  // or umbra armor replace the destruction itself, and they returned above.
  if (by !== undefined && noncreature) ((s.turnLog ??= {}).destroyed ??= []).push({ controller, by });
  return true;
}

/** Could `pid` pair these two now (CR 702.95a, 702.95c): two different creatures on the battlefield under their control, both unpaired. */
export function pairable(s: GameState, a: GameObject, b: GameObject, pid: PlayerId): boolean {
  return a.id !== b.id && [a, b].every((o) => o.zone === "battlefield" && objIsType(s, o, "Creature") && controllerOf(s, o) === pid && !pairedWith(s, o));
}

/** The creatures `pid` could pair `o` with. */
export const pairCandidates = (s: GameState, o: GameObject, pid: PlayerId) => s.battlefield.map((id) => obj(s, id)).filter((x) => pairable(s, o, x, pid));

export function pairCreatures(s: GameState, a: GameObject, b: GameObject, pid: PlayerId) {
  a.paired = { id: b.id, zc: b.zoneChanges ?? 0, by: pid };
  b.paired = { id: a.id, zc: a.zoneChanges ?? 0, by: pid };
  invalidateCharacteristics(s);
  log(s, `${characteristics(s, a).name} and ${characteristics(s, b).name} are paired.`);
}

/**
 * A paired creature becomes unpaired if another player gains control of it or the creature it's paired with, or
 * either stops being a creature or leaves the battlefield (CR 702.95e). Leaving is handled as it happens.
 */
function checkPairs(s: GameState) {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!o.paired) continue;
    const other = pairedWith(s, o);
    const ok = (x: GameObject) => controllerOf(s, x) === o.paired!.by && objIsType(s, x, "Creature");
    if (other && ok(o) && ok(other)) continue;
    o.paired = undefined;
    if (other) {
      other.paired = undefined;
      log(s, `${characteristics(s, o).name} and ${characteristics(s, other).name} are no longer paired.`);
    }
    invalidateCharacteristics(s);
  }
}

export function removeFromCombat(s: GameState, o: GameObject) {
  for (const a of o.blocking ?? []) {
    const att = s.objects[a];
    if (att?.blockedBy) att.blockedBy = att.blockedBy.filter((b) => b !== o.id);
  }
  // A creature blocking it is still a blocking creature, blocking whatever else it blocks (CR 506.4, 510.1d).
  for (const b of o.blockedBy ?? []) {
    const bl = s.objects[b];
    if (bl?.blocking) bl.blocking = bl.blocking.filter((a) => a !== o.id);
  }
}

/**
 * `pid` draws `n` cards, one at a time (CR 121.2). Dredge can replace each draw (CR 702.52a): when the player has a
 * card that could, the draws stop for that choice and it returns false; answering it (chooseDredge) does the rest
 * of them, then carries on with what was drawing (`after`, or the resolving spell or ability).
 */
export function draw(s: GameState, pid: PlayerId, n = 1, after?: "drawStep", made: number[] = [], resumed = false): boolean {
  // Maralen of the Mornsong: the draws don't happen, so no replacement applies to them and an empty library loses nothing
  // (rulings).
  if (cantDraw(s, pid)) {
    if (n > 0 || made.length) log(s, `${player(s, pid).name} can't draw cards (${nameOf(s, cantDraw(s, pid)!)}).`);
    return true;
  }
  // `made`: draws a replacement effect already made of an earlier one, which that effect doesn't replace again (CR
  // 614.5); each number is how many Alhammarret's Archives can still replace that draw.
  made = [...made];
  // `resumed`: the rest of an instruction that already began, which Alms Collector looked at then.
  const alms = !resumed && n >= 2 && !made.length ? almsCollector(s, pid) : undefined;
  if (alms) {
    // Alms Collector (CR 616.1g): the instruction becomes one draw for its controller and one for this player, the
    // active player's first (CR 121.2c). The first of the two is drawn without asking about dredge or a look (as for
    // Notion Thief); the second is an ordinary draw, which can pause.
    const to = controllerOf(s, alms);
    log(s, `${player(s, to).name} and ${player(s, pid).name} each draw a card instead (${nameOf(s, alms.id)}).`);
    const seat = (x: PlayerId) => (s.turnOrder.indexOf(x) - s.turnOrder.indexOf(s.activePlayer) + s.turnOrder.length) % s.turnOrder.length;
    const [first, second] = seat(to) < seat(pid) ? [to, pid] : [pid, to];
    drawWithoutAsking(s, first);
    return player(s, second).lost ? true : draw(s, second, 1, undefined, [], true);
  }
  while (n > 0 || made.length) {
    // Narset, Parter of Veils (Spirit of the Labyrinth: any player): an opponent who has drawn a card this turn can't
    // draw another; the draw doesn't happen, so nothing replaces it (rulings), and the rest of these don't either.
    const narset = (player(s, pid).draws?.turn === s.turn ? player(s, pid).draws!.n : 0) >= 1 ? s.battlefield.find((id) => (controllerOf(s, obj(s, id)) !== pid && abilitiesOf(s, obj(s, id)).opponentsDrawOnce) || abilitiesOf(s, obj(s, id)).playersDrawOnce) : undefined;
    if (narset) {
      log(s, `${player(s, pid).name} can't draw more than one card each turn (${nameOf(s, narset)}).`);
      break;
    }
    // Urabrask, Heretic Praetor: "the next time they would draw a card this turn, instead they exile the top card of their
    // library. They may play it this turn." The draw doesn't happen (CR 614.6), so an empty library loses nothing. With
    // other replacements for the same draw, this one applies first (the drawing player's choice, CR 616.1, isn't asked).
    const urabrask = player(s, pid).nextDrawExiles?.findIndex((x) => x.turn === s.turn) ?? -1;
    if (urabrask >= 0) {
      const p = player(s, pid);
      const { source } = p.nextDrawExiles!.splice(urabrask, 1)[0]!;
      p.nextDrawExiles = p.nextDrawExiles!.filter((x) => x.turn === s.turn);
      if (!p.nextDrawExiles.length) p.nextDrawExiles = undefined;
      if (made.length) made.shift();
      else n--;
      const top = p.library[0];
      if (top === undefined) {
        log(s, `${p.name} would draw a card; ${source} replaces it, and their library is empty.`);
        continue;
      }
      moveObject(s, top, "exile");
      const o = obj(s, top);
      o.mayPlay = { player: pid, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
      log(s, `${p.name} exiles ${nameOf(s, top)} from the top of their library instead of drawing, and may play it this turn (${source}).`);
      continue;
    }
    // Notion Thief: this draw is skipped and its controller draws instead.
    const thief = notionThief(s, pid);
    if (thief) {
      if (made.length) made.shift();
      else n--;
      stealDraw(s, pid, thief);
      continue;
    }
    let archives: number;
    if (!made.length) {
      n--;
      const look = firstDrawLook(s, pid, n, after);
      if (look === "paused") return false;
      archives = archivesFor(s, pid);
    } else archives = made.shift()!;
    const dig = digInstead(s, pid, n, after, made, archives);
    if (dig === "paused") return false;
    if (dig) continue;
    const options = dredgeOptions(s, pid);
    // Abundance: "you may instead ..." for each draw (rulings), even with nothing left to draw.
    const abundance = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawAbundance);
    if (options.length || abundance) {
      // Dredge and an Archive could both replace this draw: the player picks which applies first (CR 616.1, Archive
      // ruling). Not dredging means the Archive's "draw two instead", which isn't optional.
      s.pending = { kind: "dredge", player: pid, options, left: 1 + n + made.length, ...(made.length ? { made } : {}), ...(archives ? { archive: archives } : {}), ...(abundance ? { abundance: nameOf(s, abundance) } : {}), ...(after ? { after } : {}) };
      return false;
    }
    if (archives) {
      // Nothing can dredge, and a draw can't put a card with dredge into the graveyard: every Archive applies.
      log(s, `${player(s, pid).name} draws ${2 ** archives} cards instead of one.`);
      if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
      made.unshift(...Array<number>(2 ** archives).fill(0));
      continue;
    }
    const one = drawOne(s, pid, { left: n, made, ...(after ? { after } : {}) });
    if (one === "paused") return false;
    if (!one) break;
  }
  return true;
}

/**
 * Underrealm Lich: "If you would draw a card, instead look at the top three cards of your library, then put one into your
 * hand and the rest into your graveyard" (CR 614.1a), each draw separately (rulings). Dredge, Abundance or Alhammarret's
 * Archive could replace the same draw: the player chooses which applies (CR 616.1), so they're offered with it. With one
 * card or none to look at and nothing else to choose, it just happens (an empty library loses no game: nothing is drawn).
 * `left` and `made` are the draws after this one. "paused" when it waits for the player, true when it replaced the draw.
 */
function digInstead(s: GameState, pid: PlayerId, left: number, after: "drawStep" | undefined, made: number[], archives: number): "paused" | boolean {
  const src = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawDig);
  if (!src) return false;
  const p = player(s, pid);
  const cards = p.library.slice(0, abilitiesOf(s, obj(s, src)).drawDig!);
  const dredge = dredgeOptions(s, pid);
  const abundance = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawAbundance);
  const instead = archives || dredge.length || abundance ? { ...(archives ? { archive: 2 } : {}), ...(dredge.length ? { dredge } : {}), ...(abundance ? { abundance: nameOf(s, abundance) } : {}) } : undefined;
  if (cards.length > 1 || instead) {
    s.pending = { kind: "drawLook", keep: true, player: pid, source: nameOf(s, src), cards, left, made: [...made], ...(archives ? { archives } : {}), ...(after ? { after } : {}), ...(instead ? { instead } : {}) };
    return "paused";
  }
  keepOne(s, p, nameOf(s, src), cards, cards[0]);
  return true;
}

function keepOne(s: GameState, p: Player, source: string, cards: ObjectId[], keep?: ObjectId) {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  log(s, cards.length ? `${p.name} looks at the top ${cards.length === 1 ? "card" : `${cards.length} cards`} of their library instead of drawing (${source}).` : `${p.name} would draw from an empty library; ${source} replaces it, so nothing happens.`);
  if (keep !== undefined) moveObject(s, keep, "hand");
  const rest = cards.filter((id) => id !== keep);
  for (const id of rest) moveObject(s, id, "graveyard");
  if (cards.length) log(s, `${p.name} puts a card into their hand${rest.length ? ` and ${rest.map((id) => nameOf(s, id)).join(", ")} into their graveyard` : ""}.`);
}

/**
 * Alms Collector: one controlled by an opponent of `pid` (who hasn't left the game). With several, the first in turn
 * order applies (the drawing player's choice, CR 616.1, isn't asked).
 */
function almsCollector(s: GameState, pid: PlayerId): GameObject | undefined {
  const seat = (o: GameObject) => (s.turnOrder.indexOf(controllerOf(s, o)) - s.turnOrder.indexOf(s.activePlayer) + s.turnOrder.length) % s.turnOrder.length;
  return s.battlefield
    .map((id) => obj(s, id))
    .filter((o) => controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost && abilitiesOf(s, o).splitsBigDraws)
    .sort((a, b) => seat(a) - seat(b))[0];
}

/** One draw for `pid` that doesn't stop to offer dredge or Scion of Halaster's look (the card is just drawn). */
/**
 * The players creature `o` has to attack if able (CR 508.1d): encore's, and with Galactus, Devourer of Worlds the opponents
 * of its controller with the most life among them, as attackers are declared.
 */
export function mustAttackPlayers(s: GameState, o: GameObject): PlayerId[] {
  const c = characteristics(s, o);
  if (!c.mustAttackMostLife) return c.mustAttack;
  const opps = opponents(s, controllerOf(s, o));
  const most = Math.max(...opps.map((p) => player(s, p).life));
  return [...new Set([...c.mustAttack, ...opps.filter((p) => player(s, p).life === most)])];
}

/** A permanent that says players can't draw cards (Maralen of the Mornsong), if there is one. */
export function cantDraw(s: GameState, pid: PlayerId): ObjectId | undefined {
  void pid;
  return s.battlefield.find((id) => abilitiesOf(s, obj(s, id)).playersCantDraw);
}

function drawWithoutAsking(s: GameState, pid: PlayerId) {
  if (cantDraw(s, pid)) return;
  const p = player(s, pid);
  const asks = dredgeOptions(s, pid).length > 0 || (p.firstWouldDraw !== s.turn && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).firstDrawLook));
  if (!asks) draw(s, pid, 1, undefined, [], true);
  else if (!notionThief(s, pid)) drawOne(s, pid);
  else draw(s, pid, 1, undefined, [], true);
}

/** The Notion Thieves that already replaced a draw in the chain of draws being made now (CR 614.5). */
let notionUsed: ObjectId[] = [];

/**
 * Notion Thief (CR 614.1a): one controlled by an opponent of `pid` that applies to `pid`'s draw now, unless it's the first
 * card `pid` draws in their own draw step (a card actually drawn, CR 614.6), and that hasn't replaced this chain of
 * draws already (CR 614.5). With several, the first in turn order applies first (the drawing player's choice, CR 616.1,
 * isn't asked); it applies before the player's own replacements (dredge, Alhammarret's Archive).
 */
function notionThief(s: GameState, pid: PlayerId): GameObject | undefined {
  const p = player(s, pid);
  if (s.step === "draw" && s.activePlayer === pid && p.drewInDrawStep !== s.turn) return undefined;
  const thieves = s.battlefield.map((id) => obj(s, id)).filter((o) => !notionUsed.includes(o.id) && controllerOf(s, o) !== pid && !player(s, controllerOf(s, o)).lost && abilitiesOf(s, o).stealsDraws);
  const seat = (o: GameObject) => (s.turnOrder.indexOf(controllerOf(s, o)) - s.turnOrder.indexOf(s.activePlayer) + s.turnOrder.length) % s.turnOrder.length;
  return thieves.sort((a, b) => seat(a) - seat(b))[0];
}

/**
 * "Instead that player skips that draw and you draw a card": the Thief's controller's draw, which their own replacement
 * effects and other Notion Thieves can replace in turn; dredge and Scion of Halaster's look, which would ask them, aren't
 * offered for it (the card is just drawn).
 */
function stealDraw(s: GameState, pid: PlayerId, thief: GameObject) {
  const to = controllerOf(s, thief);
  log(s, `${player(s, pid).name} skips that draw and ${player(s, to).name} draws a card instead (${nameOf(s, thief.id)}).`);
  notionUsed.push(thief.id);
  try {
    drawWithoutAsking(s, to);
  } finally {
    notionUsed = notionUsed.filter((x) => x !== thief.id);
  }
}

/**
 * "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them
 * into your graveyard and the other back on top of your library. Then draw a card." (Scion of Halaster's grant to
 * commander creatures, CR 614.1a). Only the turn's first would-be draw, so the draw it makes isn't replaced again (614.5),
 * and two such abilities replace it once. With one card in the library, that card goes to the graveyard: as much as
 * possible (CR 609.3). When Alhammarret's Archive or dredge could replace the same draw, the player chooses which applies
 * first (CR 616.1); if it's the look, they can still replace the draw it makes; if it's another, that was the first
 * time, so the look is gone.
 */
function firstDrawLook(s: GameState, pid: PlayerId, left: number, after?: "drawStep"): "paused" | void {
  const p = player(s, pid);
  if (p.firstWouldDraw === s.turn) return;
  p.firstWouldDraw = s.turn;
  const src = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).firstDrawLook);
  if (!src) return;
  const cards = p.library.slice(0, 2);
  const archive = archiveDraws(s, pid);
  const dredge = dredgeOptions(s, pid);
  const dig = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawDig);
  const instead = archive > 1 || dredge.length || dig ? { ...(archive > 1 ? { archive } : {}), ...(dredge.length ? { dredge } : {}), ...(dig ? { dig: nameOf(s, dig) } : {}) } : undefined;
  if (cards.length === 2 || instead) {
    s.pending = { kind: "drawLook", player: pid, source: nameOf(s, src), cards, left, ...(after ? { after } : {}), ...(instead ? { instead } : {}) };
    return "paused";
  }
  lookInstead(s, p, nameOf(s, src), cards);
}

function lookInstead(s: GameState, p: Player, source: string, cards: ObjectId[], bin?: ObjectId) {
  if (!cards.length) return;
  log(s, `${p.name} looks at the top ${cards.length === 1 ? "card" : `${cards.length} cards`} of their library instead of drawing (${source}).`);
  bin ??= cards.length === 1 ? cards[0] : undefined;
  if (bin === undefined) return;
  moveObject(s, bin, "graveyard");
  log(s, cards.length === 1 ? `${p.name} puts ${nameOf(s, bin)} into their graveyard.` : `${p.name} puts ${nameOf(s, bin)} into their graveyard and the other card back on top, then draws.`);
}

/**
 * Answering firstDrawLook: that card to the graveyard, the other stays on top; then the draw, the rest, and what was
 * drawing. Or another replacement first: the Archive's draws, or a dredge, then the rest.
 */
function chooseDrawLook(s: GameState, p: Player, id?: ObjectId, instead?: "archive" | "dig" | { dredge: ObjectId } | { abundance: "land" | "nonland" }) {
  const pend = s.pending;
  if (pend?.kind !== "drawLook" || pend.player !== p.id) throw new RulesError("no cards to choose from");
  if (pend.keep) return chooseDig(s, p, pend, id, instead);
  if (instead !== undefined && typeof instead === "object" && "abundance" in instead) throw new RulesError("nothing lets you reveal instead");
  let more: [number, number[]];
  if (instead === "dig") {
    // Underrealm Lich first: the draw is still to come, and the look is used up (the first time you would draw).
    if (!pend.instead?.dig) throw new RulesError("no other way to replace that draw");
    s.pending = null;
    more = [pend.left + 1, []];
  } else if (instead === "archive") {
    if (!pend.instead?.archive) throw new RulesError("no other way to replace that draw");
    s.pending = null;
    const n = archivesFor(s, p.id) - 1;
    log(s, `${p.name} draws two cards instead of one.`);
    more = [pend.left, [n, n]];
  } else if (instead) {
    if (!pend.instead?.dredge?.includes(instead.dredge) || !dredgeOptions(s, p.id).includes(instead.dredge)) throw new RulesError("that card can't be dredged");
    s.pending = null;
    dredgeInstead(s, p, instead.dredge);
    more = [pend.left, []];
  } else {
    if (pend.cards.length === 2 && (id === undefined || !pend.cards.includes(id) || !p.library.includes(id))) throw new RulesError("that isn't one of the cards");
    s.pending = null;
    lookInstead(s, p, pend.source, pend.cards, pend.cards.length === 2 ? id : undefined);
    more = [pend.left + 1, []];
  }
  if (!draw(s, p.id, more[0], pend.after, more[1], true)) return;
  if (pend.after === "drawStep") drawStepDrawn(s);
  else if (s.resolving) continueResolution(s);
}

/** Answering Underrealm Lich's look (digInstead): the card to keep, or another replacement of that draw first. */
function chooseDig(s: GameState, p: Player, pend: Extract<PendingDecision, { kind: "drawLook" }>, id?: ObjectId, instead?: "archive" | "dig" | { dredge: ObjectId } | { abundance: "land" | "nonland" }) {
  const made = [...(pend.made ?? [])];
  if (instead === "archive") {
    if (!pend.instead?.archive || !pend.archives) throw new RulesError("no other way to replace that draw");
    s.pending = null;
    log(s, `${p.name} draws two cards instead of one.`);
    if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
    made.unshift(pend.archives - 1, pend.archives - 1);
  } else if (instead === "dig") throw new RulesError("no other way to replace that draw");
  else if (instead && "dredge" in instead) {
    if (!pend.instead?.dredge?.includes(instead.dredge) || !dredgeOptions(s, p.id).includes(instead.dredge)) throw new RulesError("that card can't be dredged");
    s.pending = null;
    dredgeInstead(s, p, instead.dredge);
  } else if (instead) {
    if (!pend.instead?.abundance) throw new RulesError("nothing lets you reveal instead");
    s.pending = null;
    const rest = abundanceInstead(s, p, instead.abundance, pend.instead.abundance);
    if (rest.length > 1) {
      s.pending = { kind: "orderLibrary", player: p.id, cards: rest, bottom: true, source: pend.instead.abundance, thenDraw: { left: pend.left, made, ...(pend.after ? { after: pend.after } : {}) } };
      return;
    }
  } else {
    if (pend.cards.length > 1 && (id === undefined || !pend.cards.includes(id))) throw new RulesError("that isn't one of the cards");
    if (pend.cards.some((c) => !p.library.includes(c))) throw new RulesError("those cards moved");
    s.pending = null;
    keepOne(s, p, pend.source, pend.cards, id ?? pend.cards[0]);
  }
  continueDraws(s, p.id, pend.left, pend.after, made);
}

/**
 * How many Alhammarret's Archives replace one draw: "If you would draw a card except the first one you draw in each of
 * your draw steps, draw two cards instead", each one doubling it again (rulings: two make four). Each is its own
 * replacement, so dredge can come before or after any of them (CR 616.1). Counts the draw step's first draw.
 */
function archivesFor(s: GameState, pid: PlayerId): number {
  const p = player(s, pid);
  const n = Math.log2(archiveDraws(s, pid));
  if (s.step === "draw" && s.activePlayer === pid && p.firstDrawStepDraw !== s.turn) p.firstDrawStepDraw = s.turn;
  return n;
}

/** What archivesFor makes of `pid`'s next draw, without counting it. Thought Reflection's doubles the first one too. */
function archiveDraws(s: GameState, pid: PlayerId): number {
  const first = s.step === "draw" && s.activePlayer === pid && player(s, pid).firstDrawStepDraw !== s.turn;
  return 2 ** s.battlefield.filter((id) => {
    const ab = controllerOf(s, obj(s, id)) === pid ? abilitiesOf(s, obj(s, id)) : undefined;
    const two = ab?.drawTwoInstead;
    // Vnwxt: only at max speed (CR 702.178a).
    if (two && ab.drawTwoIf && !staticConditionNow(s, ab.drawTwoIf, id, pid)) return false;
    return two === "always" || (two && !first);
  }).length;
}

/**
 * One draw, which nothing but an empty library's replacements can change any more. False when nothing was drawn and the
 * draws stop; "paused" when Out of the Tombs waits for its player to choose (`rest`: the draws after this one).
 */
function drawOne(s: GameState, pid: PlayerId, rest: { left: number; made: number[]; after?: "drawStep" } = { left: 0, made: [] }): boolean | "paused" {
  const p = player(s, pid);
  const top = p.library[0];
  if (!top) {
    // Laboratory Maniac: the draw is replaced, so it isn't a draw from an empty library, even if the win is stopped
    // (Platinum Angel) (CR 614.1a, 104.2b). With Out of the Tombs too, the player would choose which applies (CR 616.1):
    // winning is taken.
    const maniac = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawEmptyWins);
    if (maniac) {
      winGame(s, pid, nameOf(s, maniac));
      return false;
    }
    // Out of the Tombs: a creature card from the graveyard instead, chosen by its player; with none, they lose (CR
    // 614.1a). Either way nothing was drawn from an empty library (CR 704.5b), and the draws after this go on.
    const tombs = s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).drawEmptyReturn);
    if (tombs) {
      const cards = p.graveyard.filter((id) => isType(defOf(s, obj(s, id)), "Creature"));
      if (!cards.length) {
        log(s, `${p.name} would draw from an empty library, and has no creature card in their graveyard to return instead (${nameOf(s, tombs)}).`);
        playerLoses(s, pid, `${nameOf(s, tombs)}: no creature card to return`);
        return false;
      }
      if (cards.length === 1) {
        returnFromTombs(s, pid, cards[0]!, nameOf(s, tombs));
        return true;
      }
      s.pending = { kind: "drawEmptyReturn", player: pid, source: nameOf(s, tombs), cards, left: rest.left, ...(rest.made.length ? { made: [...rest.made] } : {}), ...(rest.after ? { after: rest.after } : {}) };
      return "paused";
    }
    p.drewFromEmptyLibrary = true; // CR 704.5b
    return false;
  }
  moveObject(s, top, "hand");
  s.resolving?.drawnThisWay?.push(top);
  const drawnCard = obj(s, top);
  if (drawnCard.zone === "hand") drawnCard.drawn = { turn: s.turn, zc: drawnCard.zoneChanges ?? 0 };
  // Every card drawn is its own draw (CR 121.2), and counts toward "your second card each turn".
  p.draws = p.draws?.turn === s.turn ? { turn: s.turn, n: p.draws.n + 1 } : { turn: s.turn, n: 1 };
  // "Except the first one they draw in each of their draw steps" (Orcish Bowmasters): a card actually drawn, so not a
  // draw that was replaced (CR 614.6).
  const firstInDrawStep = s.step === "draw" && s.activePlayer === pid && p.drewInDrawStep !== s.turn;
  if (firstInDrawStep) p.drewInDrawStep = s.turn;
  fireEvent(s, { type: "draw", player: pid, nth: p.draws.n, ...(firstInDrawStep ? { firstInDrawStep: true as const } : {}) });
  // Miracle (CR 702.94a-b): the first card drawn this turn is revealed as it's drawn, and its trigger lets its owner cast
  // it for its miracle cost. It's always revealed here; whether to cast it is asked as the trigger resolves.
  const card = obj(s, top);
  const miracle = p.draws.n === 1 && card.zone === "hand" ? compileCard(defOf(s, card)).miracle : undefined;
  if (miracle) {
    log(s, `${p.name} reveals ${defOf(s, card).name} (miracle).`);
    card.miracleRevealed = { turn: s.turn, zc: card.zoneChanges ?? 0 };
    s.triggerQueue.push({
      sourceId: top,
      sourceCardId: cardIdOf(card),
      controller: pid,
      index: -1,
      subject: { id: top, zc: card.zoneChanges ?? 0 },
      body: { targets: [], effects: [{ type: "miracle" }], text: `Miracle ${miracle}: you may cast ~ for its miracle cost.` },
    });
  }
  return true;
}

/**
 * How many cards `pid` mills when told to mill `n` (CR 701.17): The Water Crystal's "that many cards plus four" and
 * Bruvac's "twice that many" for each of their controllers' opponents (CR 614.1a). With both, the milled player would
 * choose the order (CR 616.1); we double first, the smaller total. Zero stays zero ("one or more cards").
 */
export function millCount(s: GameState, pid: PlayerId, n: number): number {
  if (n <= 0) return n;
  let plus = 0;
  let twice = 0;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const more = abilitiesOf(s, o).millMore;
    if (!more || controllerOf(s, o) === pid || !opponents(s, controllerOf(s, o)).includes(pid)) continue;
    for (const m of more) {
      if ("plus" in m) plus += m.plus;
      else twice++;
    }
  }
  return n * 2 ** twice + plus;
}

/** Cards in `pid`'s graveyard whose dredge could replace their next draw: dredge N needs N cards in their library (CR 702.52a-b). */
export function dredgeOptions(s: GameState, pid: PlayerId): ObjectId[] {
  const p = player(s, pid);
  if (p.lost) return [];
  return p.graveyard.filter((id) => {
    const n = dredgeAmount(s, pid, id);
    return n !== undefined && p.library.length >= n;
  });
}

/**
 * A card's dredge N in `pid`'s graveyard: its own, else one a permanent they control gives it ("Land cards in your
 * graveyard have dredge 2", The Necrobloom). Every such grant says dredge 2 and no land card has dredge of its own, so
 * there's never a choice between two Ns.
 */
export function dredgeAmount(s: GameState, pid: PlayerId, id: ObjectId): number | undefined {
  const d = defOf(s, obj(s, id));
  const own = compileCard(d).dredge;
  if (own !== undefined) return own;
  for (const pid2 of s.battlefield) {
    const p = obj(s, pid2);
    if (controllerOf(s, p) !== pid) continue;
    const g = abilitiesOf(s, p).dredgeGrants?.find((x) => printedMatches(x.filter, d));
    if (g) return g.n;
  }
  return undefined;
}

/**
 * Dredge instead of drawing (CR 702.52a): mill N, then return the card to hand; it isn't a draw. Or draw. Then the
 * rest of the draws, and whatever was drawing carries on.
 */
function dredgeInstead(s: GameState, p: Player, id: ObjectId) {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const n = millCount(s, p.id, dredgeAmount(s, p.id, id)!);
  const milled = p.library.slice(0, n);
  for (const c of milled) moveObject(s, c, "graveyard", { milled: true });
  moveObject(s, id, "hand");
  log(s, `${p.name} dredges ${nameOf(s, id)} instead of drawing, milling ${n} card${n === 1 ? "" : "s"}.`);
}

/**
 * Abundance instead of a draw: reveal from the top until a land (or nonland) card, put it into the hand (not drawn,
 * rulings), and the other revealed cards on the bottom in the order the player chooses (none found: all of them). Returns
 * those other cards.
 */
function abundanceInstead(s: GameState, p: Player, kind: "land" | "nonland", source: string): ObjectId[] {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  const i = p.library.findIndex((id) => isType(defOf(s, obj(s, id)), "Land") === (kind === "land"));
  const seen = i < 0 ? [...p.library] : p.library.slice(0, i + 1);
  log(s, `${p.name} chooses ${kind} and reveals ${seen.length ? seen.map((id) => nameOf(s, id)).join(", ") : "nothing"} instead of drawing (${source}).`);
  const found = i < 0 ? undefined : seen[i];
  if (found) {
    moveObject(s, found, "hand");
    log(s, `${p.name} puts ${nameOf(s, found)} into their hand.`);
  } else log(s, `${p.name} reveals no ${kind} card.`);
  const rest = seen.filter((id) => id !== found);
  for (const id of rest) p.library.push(...p.library.splice(p.library.indexOf(id), 1));
  return rest;
}

/**
 * The draw step after the active player's draw (CR 504.1): "you draw a card during each opponent's draw step" (Teferi,
 * Who Slows the Sunset's emblem) for each other player with one, in turn order, right after it with no priority in
 * between (rulings); then "at the beginning of the draw step" triggers (CR 504.2). A player's draws happen once, however
 * often a draw pauses on the way (dredge and the like resume here).
 */
export function drawStepDrawn(s: GameState) {
  const ap = s.activePlayer;
  const order = s.turnOrder.slice(s.turnOrder.indexOf(ap) + 1).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap)));
  for (const pid of order) {
    if (player(s, pid).lost || s.turnLog?.drawStepDraws?.includes(pid)) continue;
    const n = [...s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid), ...liveEmblems(s).filter((o) => o.owner === pid)].filter((o) => abilitiesOf(s, o).drawsInOpponentsDrawStep).length;
    if (!n) continue;
    ((s.turnLog ??= {}).drawStepDraws ??= []).push(pid);
    log(s, `${player(s, pid).name} draws ${n === 1 ? "a card" : `${n} cards`} during ${player(s, ap).name}'s draw step.`);
    if (!draw(s, pid, n, "drawStep")) return;
  }
  fireEvent(s, { type: "step", step: "draw", active: ap });
}

/** The draws left after one was replaced, then whatever was drawing: the draw step, or a resolving spell or ability. */
export function continueDraws(s: GameState, pid: PlayerId, left: number, after: "drawStep" | undefined, made: number[]) {
  if (!draw(s, pid, left, after, made, true)) return;
  if (after === "drawStep") drawStepDrawn(s);
  else if (s.resolving) continueResolution(s);
}

/** Out of the Tombs instead of a draw: the creature card returns to the battlefield under its owner's control. */
function returnFromTombs(s: GameState, pid: PlayerId, id: ObjectId, source: string) {
  if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
  log(s, `${player(s, pid).name} would draw from an empty library and returns ${nameOf(s, id)} from their graveyard to the battlefield instead (${source}).`);
  enterTogether(s, () => moveObject(s, id, "battlefield", { controller: pid }));
}

function chooseDrawEmptyReturn(s: GameState, p: Player, id: ObjectId) {
  const pend = s.pending;
  if (pend?.kind !== "drawEmptyReturn" || pend.player !== p.id) throw new RulesError("no draw to replace");
  if (!pend.cards.includes(id) || obj(s, id).zone !== "graveyard") throw new RulesError("choose a creature card in your graveyard");
  s.pending = null;
  returnFromTombs(s, p.id, id, pend.source);
  continueDraws(s, p.id, pend.left, pend.after, [...(pend.made ?? [])]);
}

function chooseDredge(s: GameState, p: Player, id?: ObjectId, abundance?: "land" | "nonland") {
  const pend = s.pending;
  if (pend?.kind !== "dredge" || pend.player !== p.id) throw new RulesError("no draw to replace");
  if (id !== undefined && !pend.options.includes(id)) throw new RulesError("that card can't be dredged");
  if (abundance && (!pend.abundance || id !== undefined)) throw new RulesError("nothing lets you reveal instead");
  s.pending = null;
  const made = [...(pend.made ?? [])];
  if (abundance) {
    const rest = abundanceInstead(s, p, abundance, pend.abundance!);
    const left = pend.left - 1 - (pend.made?.length ?? 0);
    if (rest.length > 1) {
      s.pending = { kind: "orderLibrary", player: p.id, cards: rest, bottom: true, source: pend.abundance!, thenDraw: { left, made, ...(pend.after ? { after: pend.after } : {}) } };
      return;
    }
    return continueDraws(s, p.id, left, pend.after, made);
  }
  if (id !== undefined) dredgeInstead(s, p, id);
  else if (pend.archive) {
    // The Archive first: two draws, which the other Archives and dredge can each still replace.
    log(s, `${p.name} draws two cards instead of one.`);
    if (s.resolving) s.resolving.drawReplaced = true; // a draw replaced (Sindbad rulings)
    made.unshift(pend.archive - 1, pend.archive - 1);
  } else if (drawOne(s, p.id, { left: pend.left - 1 - (pend.made?.length ?? 0), made, ...(pend.after ? { after: pend.after } : {}) }) === "paused") return;
  if (!draw(s, p.id, pend.left - 1 - (pend.made?.length ?? 0), pend.after, made, true)) return;
  if (pend.after === "drawStep") drawStepDrawn(s);
  else if (s.resolving) continueResolution(s);
}

// ---------------------------------------------------------------------------
// Turn structure (CR 500-514)

export const STEP_ORDER: Step[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
  "main2",
  "end",
  "cleanup",
];

/** Steps that firebending's mana survives the end of: every combat step but the last (CR 702.189a). */
const KEEPS_COMBAT_MANA = new Set<Step>(["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage"]);

/**
 * Which of `pid`'s unspent mana isn't lost as a step or phase ends (CR 500.4): `all` of it (Upwelling), mana of `colors`
 * (Leyline Tyrant's red), and what the rest becomes instead of being lost (Kruphix's colorless, a replacement effect, CR
 * 614.1a). With two such replacements its controller would choose one (616.1); the first one found is used.
 */
function manaKeeping(s: GameState, pid: PlayerId): { all: boolean; colors: Set<ManaType>; becomes?: ManaType } {
  const out: { all: boolean; colors: Set<ManaType>; becomes?: ManaType } = { all: false, colors: new Set() };
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const k = abilitiesOf(s, o).keepMana;
    if (!k || (k.who === "you" && controllerOf(s, o) !== pid)) continue;
    if (k.becomes) out.becomes ??= k.becomes;
    else if (k.color) out.colors.add(k.color);
    else out.all = true;
  }
  // "Until end of turn, you don't lose unspent red mana" (The Last Agni Kai): not past the cleanup step (CR 514.2).
  if (s.step !== "cleanup")
    for (const k of s.keepManaThisTurn ?? []) {
      if (k.player !== pid) continue;
      if (k.color) out.colors.add(k.color);
      else out.all = true;
    }
  return out;
}

function emptyManaPools(s: GameState): void {
  for (const p of s.players) {
    // Mana empties as each step ends (CR 500.4), except firebending's red until end of combat (702.189a), mana kept
    // "until end of turn", lost as the cleanup step ends (514.2), and mana a permanent keeps (manaKeeping). Kept mana keeps
    // what its source was and how it can be spent, even when it becomes another type (rulings on Horizon Stone).
    const keeping = manaKeeping(s, p.id);
    const stays = (m: ManaType) => keeping.all || keeping.colors.has(m);
    const pool = emptyPool();
    const inLots = emptyPool();
    const kept: ManaLot[] = [];
    let changed = 0;
    for (const l of p.manaLots ?? []) {
      inLots[l.mana] += l.n;
      if ((l.keep === "combat" ? KEEPS_COMBAT_MANA.has(s.step) : l.keep === "turn" && s.step !== "cleanup") || stays(l.mana)) kept.push(l);
      else if (keeping.becomes) {
        const { keep: _, ...rest } = l;
        kept.push({ ...rest, mana: keeping.becomes });
        if (l.mana !== keeping.becomes) changed += l.n;
      }
    }
    for (const l of kept) pool[l.mana] += l.n;
    for (const m of Object.keys(pool) as ManaType[]) {
      const plain = p.manaPool[m] - inLots[m];
      if (plain <= 0) continue;
      if (stays(m)) pool[m] += plain;
      else if (keeping.becomes) {
        pool[keeping.becomes] += plain;
        if (m !== keeping.becomes) changed += plain;
      }
    }
    if (changed) log(s, `${p.name}'s unspent mana becomes ${keeping.becomes === "C" ? "colorless" : COLOR_NAMES[keeping.becomes as Color].toLowerCase()} instead of emptying.`);
    p.manaPool = pool;
    p.manaLots = kept.length ? kept : undefined;
  }
}

function advanceStep(s: GameState): void {
  emptyManaPools(s);
  if (s.step === "cleanup" && s.cleanupAgain) {
    s.cleanupAgain = undefined;
    return beginStep(s, "cleanup"); // CR 514.3a
  }
  if (s.step === "cleanup") return startNextTurn(s);
  // "There is an additional end step after this step" (Y'shtola Rhul, CR 500.8): only an end step, no cleanup before it
  // (rulings).
  // "That player gets an additional upkeep step after this step" (Paradox Haze, CR 500.8).
  if (s.step === "upkeep" && s.extraUpkeeps) {
    s.extraUpkeeps = s.extraUpkeeps > 1 ? s.extraUpkeeps - 1 : undefined;
    log(s, "An additional upkeep step begins.");
    return beginStep(s, "upkeep");
  }
  if (s.step === "end" && s.extraEndSteps) {
    s.extraEndSteps = s.extraEndSteps > 1 ? s.extraEndSteps - 1 : undefined;
    log(s, "An additional end step begins.");
    return beginStep(s, "end");
  }
  // CR 511.3: as the end of combat step ends, everything is removed from combat. Provoke's requirement was for
  // this combat only (CR 702.39a).
  if (s.step === "endCombat") {
    s.thatCombat = undefined;
    // "Whenever that creature deals combat damage to a player this combat" (Stensian Sanguinist): this combat is over.
    s.floatingTriggers = s.floatingTriggers?.filter((f) => f.until !== "endOfCombat");
    if (!s.floatingTriggers?.length) s.floatingTriggers = undefined;
    // Effects that last "until end of combat" expire at the end of the combat phase (CR 500.5a).
    if (s.effects.some((e) => e.duration === "endOfCombat")) {
      s.effects = s.effects.filter((e) => e.duration !== "endOfCombat");
      invalidateCharacteristics(s);
    }
    for (const o of attackersAndBlockers(s)) clearCombat(o);
    for (const id of s.battlefield) if (obj(s, id).provokedBy?.turn === undefined) obj(s, id).provokedBy = undefined;
    for (const id of s.battlefield) obj(s, id).provokedAlso = undefined;
    s.unblockedChoice = undefined; // made for this combat's damage steps
    s.blockLimits = undefined;
  }
  const next = STEP_ORDER[STEP_ORDER.indexOf(s.step) + 1]!;
  // Added phases come directly after the phase they were added after (CR 500.8); then the turn goes on as it would
  // have from there.
  if (PHASE_ENDS.has(s.step)) {
    const added = s.addedPhases?.shift();
    if (!s.addedPhases?.length) s.addedPhases = undefined;
    if (added) {
      s.resumeStep ??= next;
      log(s, added === "beginning" ? "An additional beginning phase begins." : added !== "main" ? "An additional combat phase begins." : "An additional main phase begins.");
      s.thatCombat = typeof added === "object" ? added.combat : undefined;
      // An additional beginning phase has its untap, upkeep and draw steps (CR 500.8, 501.1; Sphinx of the Second Sun rulings).
      return beginStep(s, added === "beginning" ? "untap" : added !== "main" ? "beginCombat" : "main2");
    }
    if (s.resumeStep) {
      const resume = s.resumeStep;
      s.resumeStep = undefined;
      return beginStep(s, resume);
    }
  }
  beginStep(s, next);
}

/**
 * "End the turn" (CR 724.1), after the spell or ability doing it has finished resolving (`item`): abilities waiting to
 * go on the stack cease to exist (724.1a); every object on the stack is exiled, the resolving spell too (724.1b); state-
 * based actions are checked with no priority and no triggers put on the stack (724.1c); the current step ends, combat
 * with it, and the game skips straight to the cleanup step (724.1d), so no end step and no "at the beginning of the end
 * step" (724.1e). Abilities that trigger from here on go on the stack in the cleanup step, which then happens again
 * (724.1f, 514.3a).
 */
export function endTheTurn(s: GameState, item?: StackItem): void {
  s.triggerQueue = [];
  const spells = [...(item?.kind === "spell" && item.objectId ? [item.objectId] : []), ...s.stack.flatMap((x) => (x.kind === "spell" && x.objectId ? [x.objectId] : []))];
  s.stack = [];
  for (const id of spells) if (s.objects[id]?.zone === "stack") moveObject(s, id, "exile");
  log(s, `The turn ends${spells.length ? `: ${spells.map((id) => nameOf(s, id)).join(", ")} ${spells.length === 1 ? "is" : "are"} exiled from the stack` : ""}.`);
  runStateBasedActions(s, true);
  emptyManaPools(s);
  s.thatCombat = undefined;
  for (const o of attackersAndBlockers(s)) clearCombat(o);
  for (const id of s.battlefield) if (obj(s, id).provokedBy?.turn === undefined) obj(s, id).provokedBy = undefined;
  for (const id of s.battlefield) obj(s, id).provokedAlso = undefined;
  s.unblockedChoice = undefined;
  s.blockLimits = undefined;
  // The phases and steps skipped go with the ones added after them (CR 500.8) and the end steps added to this one.
  s.addedPhases = undefined;
  s.afterSecondMain = undefined;
  s.resumeStep = undefined;
  s.extraEndSteps = undefined;
  s.extraUpkeeps = undefined;
  s.cleanupAgain = undefined;
  beginStep(s, "cleanup");
}

/** The last step of each phase that can have phases added after it (CR 500.8): beginning, main, combat. */
const PHASE_ENDS = new Set<Step>(["draw", "main1", "endCombat", "main2"]);

/**
 * "After this phase, there is an additional combat phase [followed by an additional main phase]" (CR 500.8): added
 * directly after the current phase, before any added after it earlier. "After this main phase" and "after this combat
 * phase" add nothing when it isn't one (rulings on Relentless Assault and Full Throttle).
 */
export function addPhases(s: GameState, phases: ("combat" | "main" | "beginning")[], after?: "main" | "combat" | "secondMain", combatKey?: number): boolean {
  const added = phases.map((p) => (p === "combat" && combatKey !== undefined ? { combat: combatKey } : p));
  // "After the second main phase this turn" (World at War): before it begins, they wait for it, the most recently created
  // first (CR 500.8; rulings); during it, they come after it; after it has ended, there are none.
  if (after === "secondMain") {
    const mains = s.mainPhasesThisTurn ?? 0;
    if (mains < 2) {
      s.afterSecondMain = [...added, ...(s.afterSecondMain ?? [])];
      return true;
    }
    if (mains > 2 || !isMainPhase(s)) return false;
  }
  if (after === "main" && !isMainPhase(s)) return false;
  if (after === "combat" && !inCombatPhase(s)) return false;
  if (s.step === "end" || s.step === "cleanup") return false; // nothing comes after the ending phase but the next turn
  s.addedPhases = [...added, ...(s.addedPhases ?? [])];
  return true;
}

/**
 * The turn that's beginning is the one the player-controlling effects waiting for its player apply to (CR 723.1, 723.1b):
 * the last one created works (723.1a), and each Emrakul among them makes an extra turn after it (rulings).
 */
function takeControl(s: GameState) {
  const pid = s.activePlayer;
  const mine = s.playerControls?.filter((c) => c.controlled === pid) ?? [];
  if (!mine.length) return;
  s.playerControls = s.playerControls!.filter((c) => c.controlled !== pid);
  if (!s.playerControls.length) s.playerControls = undefined;
  const controller = mine.filter((c) => !c.ended).pop()?.controller ?? pid;
  const extraTurns = mine.filter((c) => c.extraTurnAfter).length;
  s.controlledTurn = { controlled: pid, controller, ...(extraTurns ? { extraTurns } : {}) };
  // Controlling yourself changes nothing (CR 723.9).
  if (controller !== pid) log(s, `${player(s, controller).name} controls ${player(s, pid).name} during this turn.`);
}

/**
 * Who makes `pid`'s choices and decisions right now: the player controlling them during their turn (CR 723.5), or
 * themselves (723.8, 723.9). The engine still waits on `pid` (waitingOn), and actions name `pid`: only who chooses
 * them changes, using `pid`'s resources (723.5a).
 */
export function deciderOf(s: GameState, pid: PlayerId): PlayerId {
  const c = s.controlledTurn;
  return c && c.controlled === pid && c.controller !== pid && !player(s, c.controller).lost ? c.controller : pid;
}

/** The combat phase's steps (CR 506.1). */
export const inCombatPhase = (s: GameState) => ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step);

function startNextTurn(s: GameState, skipping = false) {
  const prev = s.activePlayer;
  // The turn just taken (not one skipped): who cast how many spells in it (CR 731.2).
  if (!skipping) s.lastTurn = { active: prev, cast: s.players.map((p) => (s.castThisTurn ?? []).filter((c) => c.player === p.id).length), ...(s.lostLifeThisTurn?.length ? { lostLife: [...s.lostLifeThisTurn] } : {}) };
  // A player-controlling effect ends as the next turn begins (CR 723.1); Emrakul's "After that turn, that player takes
  // an extra turn" is created now, so it's the most recently created and taken first (CR 500.7).
  const controlled = s.controlledTurn;
  s.controlledTurn = undefined;
  for (let i = 0; i < (controlled?.extraTurns ?? 0); i++) (s.extraTurns ??= []).push({ player: controlled!.controlled });
  // An extra turn is taken directly after this one, the most recently created first (CR 500.7); one for a player who
  // left the game isn't taken (CR 800.4a). After them, the normal order goes on from the last normal turn.
  let extra: ExtraTurn | undefined;
  while ((extra = s.extraTurns?.pop()) && player(s, extra.player).lost);
  if (!s.extraTurns?.length) s.extraTurns = undefined;
  const began = new Set<PlayerId>();
  if (extra) {
    if (!s.extraTurn) s.rotation = prev;
    s.activePlayer = extra.player;
    began.add(extra.player);
    // Trouble in Pairs, Ugin's Nexus: "If an opponent would begin an extra turn, that player skips that turn instead"
    // (CR 614.10): the turn doesn't happen and the next one comes, from wherever the normal order was.
    const skipper = s.battlefield.find((id) => {
      const who = abilitiesOf(s, obj(s, id)).skipsExtraTurns;
      return who === "all" || (who === "opponents" && controllerOf(s, obj(s, id)) !== extra!.player);
    });
    if (skipper) {
      log(s, `${player(s, extra.player).name} skips their extra turn (${defOf(s, obj(s, skipper)).name}).`);
      s.extraTurn = extra;
      return startNextTurn(s, true);
    }
    log(s, `${player(s, extra.player).name} takes an extra turn.`);
  } else {
    const from = s.rotation !== undefined && s.extraTurn ? s.rotation : prev;
    s.rotation = undefined;
    s.activePlayer = nextLivingAfter(s, from);
    // "Until your next turn" ends as that turn begins, or when it would have begun for a player who left (CR 800.4m).
    const order = s.turnOrder;
    for (let i = (order.indexOf(from) + 1) % order.length; ; i = (i + 1) % order.length) {
      began.add(order[i]!);
      if (order[i] === s.activePlayer || began.size >= order.length) break;
    }
  }
  // "Skip your next turn" (CR 614.10): that turn doesn't happen; the one after it is next.
  if (takeSkip(s, s.activePlayer, "turn")) {
    log(s, `${player(s, s.activePlayer).name} skips their turn.`);
    s.extraTurn = extra;
    return startNextTurn(s, true);
  }
  s.extraTurn = extra;
  takeControl(s);
  endCopyEffects(s, (e) => typeof e.until === "object" && began.has(e.until.turnOf));
  const ending = s.effects.filter((e) => e.duration === "yourNextTurn" && e.turnOf !== undefined && began.has(e.turnOf));
  if (ending.length) {
    s.effects = s.effects.filter((e) => !ending.includes(e));
    invalidateCharacteristics(s);
  }
  releasePhased(s, began);
  // "Until your next turn, whenever ...": those end as that turn begins (CR 603.7b, 611.2b, 800.4m).
  s.floatingTriggers = s.floatingTriggers?.filter((f) => !(f.until === "yourNextTurn" && began.has(f.controller)));
  if (!s.floatingTriggers?.length) s.floatingTriggers = undefined;
  // "Until your next turn, if a source would deal damage to you, ..." (Lightning, Army of One; Morningtide's Light): those
  // end as that turn begins too, not only for the turn itself (CR 611.2b).
  s.damageMods = s.damageMods?.filter((r) => !(r.until === "yourNextTurn" && began.has(r.you)));
  if (!s.damageMods?.length) s.damageMods = undefined;
  // "Noncreature spells your opponents cast cost {2} more to cast until your next turn" (Elspeth Conquers Death).
  s.costModsThisTurn = s.costModsThisTurn?.filter((c) => c.untilYourNextTurn && !began.has(c.player));
  if (s.entersTappedUntil) s.entersTappedUntil = s.entersTappedUntil.filter((r) => !began.has(r.controller));
  for (const p of s.players)
    if (began.has(p.id)) {
      p.gainedUntilNextTurn = undefined;
      p.lifeCantChange = undefined;
      p.noMaxHandSizeUntilNextTurn = undefined;
      p.attackTaxUntil = undefined;
      p.unattackableUntil = undefined;
      p.attackBansUntil = undefined;
    }
  if (s.namedBansUntil) s.namedBansUntil = s.namedBansUntil.filter((r) => !began.has(r.controller));
  if (!s.namedBansUntil?.length) s.namedBansUntil = undefined;
  if (s.flashUntil) s.flashUntil = s.flashUntil.filter((r) => !began.has(r.controller) && r.turn === undefined);
  if (!s.flashUntil?.length) s.flashUntil = undefined;
  if (s.graveGrants) s.graveGrants = s.graveGrants.filter((g) => g.turn === s.turn).length ? s.graveGrants.filter((g) => g.turn === s.turn) : undefined;
  if (s.handOnlyUntil) s.handOnlyUntil = s.handOnlyUntil.filter((r) => !began.has(r.controller));
  if (!s.handOnlyUntil?.length) s.handOnlyUntil = undefined;
  if (!s.entersTappedUntil?.length) s.entersTappedUntil = undefined;
  s.turn++;
  s.monarchAsTurnBegan = s.monarch;
  s.lifeAsTurnBegan = s.players.map((p) => p.life);
  s.handAsTurnBegan = s.players.map((p) => p.hand.length);
  const ap = player(s, s.activePlayer);
  ap.lastTurnBegan = ap.turnBegan;
  ap.turnBegan = s.turn;
  // Wall of Dust: "can't attack during its controller's next turn": this is that turn, for the same object (CR 400.7).
  if (s.cantAttackNextTurn) {
    for (const b of s.cantAttackNextTurn) {
      const o = s.objects[b.id];
      if (b.player !== ap.id || s.turn <= b.since || o?.zone !== "battlefield" || (o.zoneChanges ?? 0) !== b.zc) continue;
      s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: b.player, sourceName: defOf(s, o).name, duration: "endOfTurn", affected: [o.id], mods: [{ kind: "cantAttack" }] });
      invalidateCharacteristics(s);
    }
    // Done with, or about an object that has left (a new object, CR 400.7).
    s.cantAttackNextTurn = s.cantAttackNextTurn.filter((b) => s.objects[b.id]?.zone === "battlefield" && (s.objects[b.id]!.zoneChanges ?? 0) === b.zc && !(b.player === ap.id && s.turn > b.since));
    if (!s.cantAttackNextTurn.length) s.cantAttackNextTurn = undefined;
  }
  // "Skips all combat phases of their next turn": this is that turn (CR 614.10).
  for (const k of ap.skips ?? []) if (k.wholeTurn && k.turn === undefined) k.turn = s.turn;
  // The Second Doctor's bans: for this turn of theirs, those from before it over (Player.attackBansNextTurn).
  if (ap.attackBansNextTurn) {
    ap.attackBansNextTurn = ap.attackBansNextTurn.flatMap((b) => (b.turn === undefined ? [{ ...b, turn: s.turn }] : []));
    if (!ap.attackBansNextTurn.length) ap.attackBansNextTurn = undefined;
  }
  ap.turnsTaken = (ap.turnsTaken ?? 0) + 1;
  for (const p of s.players) {
    p.landsPlayedThisTurn = 0;
    // "Skips their next combat phase this turn" with that turn over.
    if (p.skips) p.skips = p.skips.filter((k) => k.turn === undefined || k.turn >= s.turn);
    if (!p.skips?.length) p.skips = undefined;
  }
  for (const o of Object.values(s.objects)) {
    o.activatedThisTurn = undefined; // "once each turn" (CR 602.5b)
    o.triggeredThisTurn = undefined;
  }
  s.damagedThisTurn = undefined;
  s.damageThisTurn = undefined;
  s.turnLog = undefined;
  s.extraEndSteps = undefined;
  s.extraUpkeeps = undefined;
  // "Until the end of your next turn, you may cast an instant or sorcery spell from among those exiled cards" (Chandra,
  // Hope's Beacon): a group whose permission lasts past this turn stays used up.
  s.oneOfUsed = s.oneOfUsed?.filter((g) => Object.values(s.objects).some((o) => o.zone === "exile" && o.mayPlay?.oneOf === g && o.mayPlay.until !== "thisTurn"));
  if (!s.oneOfUsed?.length) s.oneOfUsed = undefined;
  s.linkedFreeCasts = undefined;
  s.byTypeCast = undefined;
  s.diedThisTurn = undefined;
  s.diedNamesThisTurn = undefined;
  s.diedTypesThisTurn = undefined;
  s.nontokenDiedThisTurn = undefined;
  s.toGraveyardThisTurn = undefined;
  s.cardsToGraveyardThisTurn = undefined;
  s.attackersThisTurn = undefined;
  s.combatsThisTurn = undefined;
  s.mainPhasesThisTurn = undefined;
  s.combatAttackOnly = undefined;
  s.blockersStep = undefined;
  s.addedPhases = undefined;
  s.afterSecondMain = undefined;
  s.resumeStep = undefined;
  s.lostLifeThisTurn = undefined;
  s.nextEntersAsCopy = undefined; // Mystic Reflection: "this turn"
  s.permanentLeftThisTurn = undefined;
  s.freerunningThisTurn = undefined;
  s.voidThisTurn = undefined;
  s.descendedThisTurn = undefined;
  s.noLifeGain = undefined;
  s.turnRules = undefined;
  // "Until the end of your next turn" (Single Combat): kept until that player's next turn has ended, or they've left the
  // game (as other such effects, below).
  // "Until your next turn" (Hope of Ghirapur): until that player's next turn begins, this one (CR 611.2b), or they've left.
  s.cantCastThisTurn = s.cantCastThisTurn?.filter((c) => {
    if (c.untilTurnOf !== undefined) return !player(s, c.untilTurnOf).lost && s.activePlayer !== c.untilTurnOf;
    if (c.untilEndOfTurnOf === undefined) return false;
    const by = player(s, c.untilEndOfTurnOf);
    return !by.lost && !(by.id !== s.activePlayer && (by.turnBegan ?? 0) > c.turn);
  });
  if (!s.cantCastThisTurn?.length) s.cantCastThisTurn = undefined;
  s.cantPlayLandsThisTurn = undefined;
  s.spellsCastThisTurn = undefined;
  s.castThisTurn = undefined;
  s.cantBlockThisTurn = undefined;
  s.cantAttackThisTurn = undefined;
  s.cantBeBlockedThisTurn = undefined;
  if (!s.costModsThisTurn?.length) s.costModsThisTurn = undefined;
  s.keepManaThisTurn = undefined;
  s.nextCast = undefined;
  s.castItems = undefined;
  s.lastKnown = undefined;
  log(s, `— Turn ${s.turn}: ${player(s, s.activePlayer).name} —`);
  beginStep(s, "untap");
}

/**
 * The limits on what untaps in the active player's untap step (Winter Orb, Static Orb, Winter Moon, Smoke, Mungha Wurm):
 * each its own, all of them holding at once (rulings on Winter Moon). Winter Orb's is looked at as the step begins: tapped
 * then, it doesn't limit anything (rulings).
 */
export function untapLimitsNow(s: GameState, ap: PlayerId): { n: number; filter: TargetSpec }[] {
  return s.battlefield.flatMap((id) => {
    const o = obj(s, id);
    return (abilitiesOf(s, o).untapLimits ?? []).filter((l) => (!l.you || controllerOf(s, o) === ap) && !(l.whileUntapped && o.tapped)).map((l) => ({ n: l.n, filter: l.filter }));
  });
}

const UNTAP_WORDS = ["no", "one", "two"];

/** Is `chosen` a choice of what untaps that keeps to every limit, with nothing more that could untap (CR 502.3)? */
export function untapChoiceProblem(s: GameState, ap: PlayerId, options: ObjectId[], chosen: ObjectId[]): string | undefined {
  const limits = untapLimitsNow(s, ap);
  const fits = (ids: ObjectId[]) => limits.every((l) => ids.filter((id) => objectMatches(s, l.filter, obj(s, id), ap, false)).length <= l.n);
  const over = limits.find((l) => chosen.filter((id) => objectMatches(s, l.filter, obj(s, id), ap, false)).length > l.n);
  if (over) return `you can't untap more than ${UNTAP_WORDS[over.n] ?? over.n} ${over.filter.text}`;
  const more = options.find((id) => !chosen.includes(id) && fits([...chosen, id]));
  return more ? `${nameOf(s, more)} can untap too: untap as many as the limits allow` : undefined;
}

/** The untap step untaps the active player's permanents, except `keep` (CR 502.3), then ends (no priority, CR 502.4). */
function untapStep(s: GameState, keep: ObjectId[], limited?: ObjectId[]): void {
  const ap = s.activePlayer;
  // "Players can't untap more than one land during their untap steps": the active player chooses which (CR 502.3).
  if (!limited) {
    const limits = untapLimitsNow(s, ap);
    const would = s.battlefield.filter((id) => {
      const o = obj(s, id);
      return o.tapped && controllerOf(s, o) === ap && !o.skipNextUntap && !keep.includes(id) && !characteristics(s, o).doesntUntap;
    });
    const options = would.filter((id) => limits.some((l) => objectMatches(s, l.filter, obj(s, id), ap, false)));
    if (limits.some((l) => options.filter((id) => objectMatches(s, l.filter, obj(s, id), ap, false)).length > l.n)) {
      const what = limits.map((l) => `${UNTAP_WORDS[l.n] ?? l.n} ${l.filter.text}`).join(" and ");
      s.pending = { kind: "pickPermanents", player: ap, source: "Untap step", action: "untapLimited", what, options, count: options.length, min: 0, ...(keep.length ? { kept: keep } : {}) };
      return;
    }
  }
  let untapped = 0;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== ap) {
      // "Untap ~ during each other player's untap step": at the same time; what stops it untapping during its
      // controller's own untap step doesn't apply (Seedborn Muse and Quest for Renewal rulings).
      if (characteristics(s, o).untapsDuringOthers) untapPermanent(s, o);
      continue;
    }
    if (o.skipNextUntap) {
      o.skipNextUntap = o.skipMoreUntaps ? true : undefined;
      o.skipMoreUntaps = o.skipMoreUntaps && o.skipMoreUntaps > 1 ? o.skipMoreUntaps - 1 : undefined;
    } else if (!keep.includes(id) && !characteristics(s, o).doesntUntap && !(limited && untapLimitsNow(s, ap).some((l) => objectMatches(s, l.filter, o, ap, false)) && !limited.includes(id))) {
      if (o.tapped) untapped++;
      untapPermanent(s, o); // CR 502.3
    }
  }
  // "Whenever you untap one or more permanents during your untap step" (The Millennium Calendar): put on the stack once
  // the upkeep starts (rulings, CR 503.1a).
  if (untapped) fireEvent(s, { type: "untapStepUntapped", player: ap, amount: untapped });
  return advanceStep(s);
}

/**
 * Use up one of `pid`'s "skip your next ..." (CR 614.10): true if this one is skipped. A skip waits for the next
 * occurrence that hasn't started; two skips skip the next two (614.10a).
 */
function takeSkip(s: GameState, pid: PlayerId, what: SkipWhat): boolean {
  const p = player(s, pid);
  const i = p.skips?.findIndex((k) => k.what === what && (k.turn === undefined ? !k.wholeTurn : k.turn === s.turn)) ?? -1;
  if (i < 0) return false;
  if (p.skips![i]!.wholeTurn) return true; // every combat phase of that turn
  p.skips!.splice(i, 1);
  if (!p.skips!.length) p.skips = undefined;
  return true;
}

/** Enter a step, perform its turn-based actions, and give the active player priority if the step has priority. */
function beginStep(s: GameState, step: Step): void {
  s.step = step;
  invalidateCharacteristics(s); // "during your turn", "during your end step": statics that hold only in some steps
  s.passedInSuccession = [];
  s.priority = s.activePlayer;
  const ap = s.activePlayer;
  // "Skip your next untap step / draw step" replaces the whole step (CR 614.10); a skipped combat phase goes straight to
  // what comes after it.
  const skipped = step === "untap" || step === "draw" ? step : step === "beginCombat" ? "combat" : undefined;
  if (skipped && takeSkip(s, ap, skipped)) {
    log(s, `${player(s, ap).name} skips their ${{ untap: "untap step", draw: "draw step", combat: "combat phase" }[skipped]}.`);
    if (skipped === "combat") s.step = "endCombat";
    return advanceStep(s);
  }
  switch (step) {
    case "untap": {
      // "Players skip their untap steps" (Stasis) replaces the whole step (CR 614.10): no phasing, no untapping. So does
      // "Take an extra turn after this one. Skip the untap step of that turn." (Savor the Moment).
      if (s.extraTurn?.skipUntap || s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).skipUntapSteps)) {
        log(s, `${player(s, ap).name} skips their untap step.`);
        return advanceStep(s);
      }
      untapStepPhasing(s, ap); // CR 502.1, 702.26a
      dayNightUntapCheck(s); // CR 502.2
      // "Lands you control don't untap during your next untap step": this is that step, for whatever they control now.
      const noUntap = player(s, ap).noUntapNext;
      if (noUntap) {
        player(s, ap).noUntapNext = undefined;
        for (const id of s.battlefield) {
          const o = obj(s, id);
          if (controllerOf(s, o) === ap && characteristics(s, o).types.some((t) => noUntap.includes(t))) o.skipNextUntap = true;
        }
      }
      // "You may choose not to untap ~": the active player decides which permanents will untap (CR 502.3).
      const may = s.battlefield.filter((id) => {
        const o = obj(s, id);
        return o.tapped && controllerOf(s, o) === ap && !o.skipNextUntap && !characteristics(s, o).doesntUntap && abilitiesOf(s, o).mayNotUntap;
      });
      if (may.length) {
        s.pending = { kind: "pickPermanents", player: ap, source: "Untap step", action: "keepTapped", what: "permanents to keep tapped", options: may, count: may.length, min: 0 };
        return;
      }
      return untapStep(s, []);
    }
    case "upkeep": {
      // Eon Hub: "Players skip their upkeep steps" replaces the whole step (CR 614.10): nothing triggers "at the beginning
      // of the upkeep", and abilities that triggered in the untap step go on the stack in the draw step (rulings).
      // "Skip your upkeep step if you have no cards in hand" (Gibbering Descent): checked as it would start (rulings); the
      // whole step is replaced (CR 614.10), so "until your next upkeep" effects go on to the next one that happens.
      if (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).skipUpkeepSteps) || (!player(s, ap).hand.length && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === ap && abilitiesOf(s, obj(s, id)).skipUpkeepIfHellbent))) {
        log(s, `${player(s, ap).name} skips their upkeep step.`);
        return advanceStep(s);
      }
      const p = player(s, ap);
      p.lastUpkeepTurn = p.upkeepTurn;
      p.upkeepTurn = s.turn;
      // "Until the beginning of your next upkeep, you may play that card" (Elkin Bottle): over as that upkeep begins.
      for (const q of s.players)
        for (const id of q.exile) {
          const m = obj(s, id).mayPlay;
          if (m?.until === "yourNextUpkeep" && m.player === ap) obj(s, id).mayPlay = undefined;
        }
      (s.turnLog ??= {}).upkeeps = (s.turnLog.upkeeps ?? 0) + 1;
      // "Until your next upkeep" (Erhnam Djinn): it ends as that player's next upkeep begins, before its triggers; for a
      // player who left the game, at the next upkeep (CR 800.4m).
      const ending = s.effects.filter((e) => e.duration === "yourNextUpkeep" && ((e.turnOf === ap && s.turn > (e.sinceTurn ?? 0)) || (e.turnOf !== undefined && player(s, e.turnOf).lost)));
      if (ending.length) {
        s.effects = s.effects.filter((e) => !ending.includes(e));
        invalidateCharacteristics(s);
      }
      fireEvent(s, { type: "step", step: "upkeep", active: ap });
      break;
    }
    case "draw":
      // "Skip your draw step" replaces the whole step (CR 614.10): no draw, no triggers, no priority.
      if (s.battlefield.some((id) => controllerOf(s, obj(s, id)) === ap && abilitiesOf(s, obj(s, id)).skipDrawStep)) {
        log(s, `${player(s, ap).name} skips their draw step.`);
        return advanceStep(s);
      }
      if (!draw(s, ap, 1, "drawStep")) return; // CR 504.1 (no one skips in multiplayer, CR 103.8c); dredge may replace it
      drawStepDrawn(s); // "at the beginning of the draw step" triggers after it (CR 504.2)
      break;
    case "end":
      // "Until your next end step, you may play that card" (Yasmin Khan): over as that player's next end step begins; one
      // granted during an end step lasts until their following one.
      for (const q of s.players)
        for (const id of q.exile) {
          const m = obj(s, id).mayPlay;
          if (m?.until === "yourNextEndStep" && m.player === ap) obj(s, id).mayPlay = undefined;
        }
      (s.turnLog ??= {}).endSteps = (s.turnLog.endSteps ?? 0) + 1;
      fireEvent(s, { type: "step", step: "end", active: ap });
      // "At the beginning of that turn's end step, you lose the game" (Final Fortune): a delayed trigger (CR 603.7).
      if (s.extraTurn?.loseAtEnd) {
        const l = s.extraTurn.loseAtEnd;
        s.triggerQueue.push({ sourceId: l.subject.id, sourceCardId: l.sourceCardId, controller: l.controller, index: -1, subject: l.subject, body: { targets: [], effects: [{ type: "loseGame", who: { ref: "you" } }], text: "At the beginning of that turn's end step, you lose the game." } });
      }
      break;
    case "declareAttackers": {
      // Which creatures could be declared as attackers this turn (CR 508.1a), for "except for creatures that couldn't attack".
      const able = opponents(s, ap).length ? potentialAttackers(s, ap) : [];
      for (const o of able) o.couldAttack = s.turn;
      if (able.length === 0) return beginStep(s, "endCombat");
      s.pending = { kind: "declareAttackers", player: ap };
      return;
    }
    case "declareBlockers": {
      s.blockersStep = { turn: s.turn, combat: s.combatsThisTurn ?? 0 };
      const attacked = livingPlayers(s).filter((pid) => attackers(s).some((a) => a.attacking === pid));
      const order = turnOrderFrom(s, ap).filter((pid) => attacked.includes(pid));
      if (order.length) {
        s.pending = blockersPending(s, order[0]!, order.slice(1));
        return;
      }
      break;
    }
    case "firstStrikeDamage":
      if (!attackersAndBlockers(s).some((o) => hasFirstOrDouble(s, o))) return beginStep(s, "combatDamage");
      if (askUnblocked(s) || dealCombatDamage(s, true)) return;
      break;
    case "combatDamage":
      if (askUnblocked(s) || dealCombatDamage(s, false)) return;
      break;
    case "main1":
      s.mainPhasesThisTurn = (s.mainPhasesThisTurn ?? 0) + 1;
      // As the precombat main phase begins, the active player puts a lore counter on each Saga they control with
      // one or more chapter abilities (CR 505.4, 714.3c).
      for (const id of [...s.battlefield]) {
        const o = obj(s, id);
        if (controllerOf(s, o) !== ap || !characteristics(s, o).subtypes.includes("Saga") || finalChapter(s, o) < 1) continue;
        const put = putCounters(s, o, "lore", 1);
        if (put) log(s, `${player(s, ap).name} puts ${put === 1 ? "a lore counter" : `${put} lore counters`} on ${nameOf(s, id)}.`);
      }
      invalidateCharacteristics(s);
      fireEvent(s, { type: "step", step: "main1", active: ap }); // paradigm's "at the beginning of each of your precombat main phases"
      break;
    case "main2":
      // Every main phase after the first is a postcombat main phase, an added one too (CR 505.1a).
      s.mainPhasesThisTurn = (s.mainPhasesThisTurn ?? 0) + 1;
      // World at War's phases, waiting for the turn's second main phase, now come right after it.
      if (s.mainPhasesThisTurn === 2 && s.afterSecondMain) {
        s.addedPhases = [...s.afterSecondMain, ...(s.addedPhases ?? [])];
        s.afterSecondMain = undefined;
      }
      fireEvent(s, { type: "step", step: "main2", active: ap });
      break;
    case "beginCombat":
      s.combatsThisTurn = (s.combatsThisTurn ?? 0) + 1;
      // "Attacks this combat if able" holds in one combat only.
      invalidateCharacteristics(s);
      fireEvent(s, { type: "step", step: "beginCombat", active: ap });
      break;
    case "endCombat":
      fireEvent(s, { type: "step", step: "endCombat", active: ap });
      break;
    case "cleanup": {
      for (const o of attackersAndBlockers(s)) clearCombat(o);
      // "At the beginning of the next cleanup step" triggers now, and goes on the stack after the discard and
      // damage removal, when players get priority (CR 514.3a).
      fireEvent(s, { type: "step", step: "cleanup", active: ap });
      const p = player(s, ap);
      if (p.hand.length > maxHandSize(s, ap)) {
        s.pending = { kind: "discardToHandSize", player: ap, count: p.hand.length - maxHandSize(s, ap) };
        return;
      }
      finishCleanup(s);
      return;
    }
  }
  runStateBasedActions(s);
}

/** A Saga's final chapter number: the greatest among the chapter abilities it has, 0 with none (CR 714.2d). */
export function finalChapter(s: GameState, o: GameObject): number {
  return Math.max(0, ...abilitiesOf(s, o).triggers.map((t) => (t.event === "chapter" ? t.chapter! : 0)));
}

/** I, II, III ... for chapter numbers. */
export const roman = (n: number) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);

/**
 * A Saga with one or more chapter abilities and at least its final chapter number in lore counters is sacrificed,
 * unless it's the source of a chapter ability that has triggered but not yet left the stack (CR 704.5s, 714.4).
 */
function sagaSBAs(s: GameState): boolean {
  let changed = false;
  for (const id of [...s.battlefield]) {
    const o = s.objects[id];
    if (!o || o.zone !== "battlefield" || !characteristics(s, o).subtypes.includes("Saga")) continue;
    const last = finalChapter(s, o);
    if (last < 1 || (o.counters.lore ?? 0) < last) continue;
    const mine = (x: { sourceId?: ObjectId; sourceZc?: number; chapter?: true }) => !!x.chapter && x.sourceId === id && (x.sourceZc === undefined || x.sourceZc === (o.zoneChanges ?? 0));
    if (s.triggerQueue.some(mine) || s.stack.some(mine)) continue;
    log(s, `${player(s, controllerOf(s, o)).name} sacrifices ${nameOf(s, id)} (its last chapter is done).`);
    moveObject(s, id, "graveyard", { sacrificed: true });
    changed = true;
  }
  return changed;
}

/** "You have no maximum hand size" on a permanent the player controls, or "Players have ..." on any (CR 402.2, 514.1). */
export const hasNoMaxHandSize = (s: GameState, pid: PlayerId) =>
  !!player(s, pid).noMaxHandSize ||
  !!player(s, pid).noMaxHandSizeUntilNextTurn ||
  !!player(s, pid).noMaxHandSizeWhile?.some((w) => s.objects[w.id]?.zone === "battlefield" && (s.objects[w.id]!.zoneChanges ?? 0) === w.zc && controllerOf(s, s.objects[w.id]!) === pid) ||
  s.battlefield.some((id) => {
    const a = abilitiesOf(s, obj(s, id)).noMaxHandSize;
    return a === "all" || (!!a && controllerOf(s, obj(s, id)) === pid);
  }) ||
  liveEmblems(s).some((o) => o.owner === pid && !!abilitiesOf(s, o).noMaxHandSize);

/**
 * `pid`'s maximum hand size (CR 402.2): seven, changed by "Your maximum hand size is eight" (Doctor Octopus), "... is
 * increased by one", "Each opponent's maximum hand size is reduced by seven" (Jin-Gitaxias, Core Augur). Rules-changing
 * effects, applied in timestamp order (CR 613.11); none with no maximum hand size. Never below 0.
 */
export function maxHandSize(s: GameState, pid: PlayerId): number {
  if (hasNoMaxHandSize(s, pid)) return Infinity;
  let n = MAX_HAND_SIZE;
  const mods = s.battlefield
    .map((id) => obj(s, id))
    .flatMap((o) => (abilitiesOf(s, o).handSize ?? []).map((h) => ({ h, o })))
    .filter(({ h, o }) => (h.who === "you" ? controllerOf(s, o) === pid : opponents(s, controllerOf(s, o)).includes(pid)))
    .filter(({ h, o }) => !h.if || staticConditionNow(s, h.if, o.id, controllerOf(s, o)))
    .sort((a, b) => a.o.timestamp - b.o.timestamp);
  for (const { h, o } of mods) n = h.set !== undefined ? h.set - (h.minus ? evalAmount(s, h.minus, { controller: controllerOf(s, o), sourceId: o.id }) : 0) : n + (h.plus ?? 0);
  return Math.max(0, n);
}

function finishCleanup(s: GameState) {
  closeZoneBatch(s); // discarding to hand size (CR 514.1) triggers "whenever you discard one or more cards"
  // "Until the end of your next turn": in the cleanup step of that player's next turn (CR 514.2), or once they've left
  // the game (CR 800.4m).
  s.effects = s.effects.filter((e) => e.duration !== "endOfTurn" && !(e.duration === "endOfYourNextTurn" && ((s.activePlayer === e.turnOf && s.turn > (e.sinceTurn ?? 0)) || (e.turnOf !== undefined && player(s, e.turnOf).lost)))); // CR 514.2
  // Delayed triggered abilities lasting "until end of turn", or "until the end of your next turn" in that turn (CR 603.7b).
  s.floatingTriggers = s.floatingTriggers?.filter((f) => !(f.until === "endOfTurn" || (f.until === "endOfYourNextTurn" && s.activePlayer === f.controller && s.turn > f.turn)));
  if (!s.floatingTriggers?.length) s.floatingTriggers = undefined;
  s.flashbackGrants = undefined;
  // "Lands you control enter tapped this turn" (Nahiri's Lithoforming, CR 514.2).
  if (s.entersTappedUntil) s.entersTappedUntil = s.entersTappedUntil.some((r) => !r.thisTurn) ? s.entersTappedUntil.filter((r) => !r.thisTurn) : undefined;
  s.topTurn = undefined; // Gwenom's "until end of turn" (CR 514.2)
  s.manaTriggersThisTurn = undefined;
  endCopyEffects(s, (e) => e.until === "endOfTurn");
  invalidateCharacteristics(s);
  for (const id of [...s.battlefield, ...(s.phasedOut ?? [])]) {
    const o = obj(s, id);
    // CR 514.2, phased-out permanents too; not from a permanent whose damage isn't removed (Ancient Adamantoise).
    if (!(o.zone === "battlefield" && abilitiesOf(s, o).keepsDamage)) o.damage = 0;
    o.damagedBy = undefined;
    o.wasDealtDamage = undefined;
    o.deathtouchDamage = false;
    o.regenShields = undefined; // "this turn" effects end
    o.preventNext = undefined;
    o.redirectNext = undefined;
    o.saddled = undefined; // "until end of turn" (CR 702.171b)
  }
  invalidateCharacteristics(s);
  for (const p of s.players) {
    p.gained = undefined; // "until end of turn" (CR 514.2)
    p.preventNext = undefined;
    p.redirectNext = undefined;
  }
  s.preventCombatDamage = undefined;
  s.damageRules = undefined;
  // "Until end of turn" control ends: "when you lose control of the creature" triggers now (rulings on Ray of Command).
  checkLostControl(s);
  // "You may play that card this turn" / "until the end of your next turn" ends now.
  for (const q of s.players)
    for (const id of q.exile) {
      const m = obj(s, id).mayPlay;
      if (m && (m.until === "thisTurn" || ((m.until === "nextTurn" || m.until === "duringNextTurn") && s.activePlayer === m.player && s.turn > m.turn))) obj(s, id).mayPlay = undefined;
    }
  // Mosswood Dreadknight's "until the end of your next turn" from a graveyard.
  for (const q of s.players)
    for (const id of q.graveyard) {
      const m = obj(s, id).mayPlay;
      if (m?.until === "nextTurn" && s.activePlayer === m.player && s.turn > m.turn) obj(s, id).mayPlay = undefined;
    }
  // Abilities that triggered during cleanup (madness, from discarding down to hand size): players get priority, then
  // there's another cleanup step (CR 514.3a).
  if (s.triggerQueue.length) {
    s.cleanupAgain = true;
    s.priority = s.activePlayer;
    s.passedInSuccession = [];
    return;
  }
  advanceStep(s);
}

export function turnOrderFrom(s: GameState, pid: PlayerId): PlayerId[] {
  const i = s.turnOrder.indexOf(pid);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((id) => !player(s, id).lost);
}

// ---------------------------------------------------------------------------
// Priority and the stack (CR 117, 405, 608)

/** Returns whether every player has now passed in succession (CR 117.4). */
function passPriority(s: GameState, pid: PlayerId): boolean {
  if (!s.passedInSuccession.includes(pid)) s.passedInSuccession.push(pid);
  const living = livingPlayers(s);
  if (living.every((id) => s.passedInSuccession.includes(id))) {
    s.passedInSuccession = [];
    if (s.stack.length) {
      resolveTop(s);
      s.priority = s.activePlayer; // CR 117.3b
    } else {
      advanceStep(s); // CR 500.2
    }
    return true;
  }
  s.priority = nextLivingAfter(s, pid);
  return false;
}

function resolveTop(s: GameState) {
  const item = s.stack.pop()!;
  if (item.kind === "ability") {
    const def = s.cards[item.sourceCardId!]!;
    // Mangara: those attackers still at you or your planeswalkers, or gone from the battlefield (as they last were, rulings).
    const still = item.event?.attackingYou;
    const atYou = still && (item.event!.group ?? []).filter((g) => { const a = s.objects[g.id]; return !a || a.zone !== "battlefield" || (a.zoneChanges ?? 0) !== g.zc || attackingYouNow(s, g.id, still.you, !!still.orPlaneswalkers); }).length;
    // Cemetery Protector: the spell or land played, as it is now (or as the card it was, once gone), still shares a card
    // type with the exiled card (CR 603.4).
    const trig = item.event?.played && item.body ? compileCard(def).triggers.find((t) => t.body.text === item.body!.text) : undefined;
    const played = item.event?.played;
    const playedNow = played && s.objects[played.id];
    const sharesNo = trig?.cast?.sharesTypeWithLinked && played && !sharesTypeWithLinked(s, `${item.sourceId}@${item.sourceZc ?? 0}`, playedNow && (playedNow.zoneChanges ?? 0) === played.zc ? characteristics(s, playedNow).types : playedNow ? defOf(s, playedNow).types : []);
    if (sharesNo || (still && atYou! < still.min) || (item.ifCond && item.sourceId && !staticConditionNow(s, item.ifCond, item.sourceId, item.controller, item.event?.player, item.event?.amount, item.sourceZc, item.subject?.id, item.subject?.zc))) {
      log(s, `${def.name}'s ability does nothing (its "if" condition is no longer true).`); // CR 603.4
      return;
    }
    if (item.body && beginResolution(s, item, item.body) === "fizzled") log(s, `${def.name}'s ability does nothing (its targets are gone).`);
    return;
  }
  if (!item.objectId) return;
  const o = obj(s, item.objectId);
  const d = defOf(s, o);
  if (isPermanentCard(d) && o.spellCopy) {
    // A copy of a permanent spell becomes a token as it resolves (CR 608.3f, 111.12).
    o.spellCopy = undefined;
    o.isToken = true;
  }
  if (o.mutating) {
    const t = item.targets?.[0];
    if (t?.kind === "object" && isLegalTarget(s, mutateTarget(o.owner), t, item.controller, d)) {
      // It merges with its target (CR 702.140c); its controller chooses top or bottom. It waits off the stack meanwhile.
      const host = obj(s, t.id);
      s.mutatingSpell = { id: o.id, host: host.id, controller: item.controller };
      const name = nameOf(s, host.id);
      s.pending = {
        kind: "chooseOption", player: item.controller, source: d.name, what: "mutate", options: ["top", "bottom"], about: host.id,
        labels: [`On top: it's ${d.name}, with ${name}'s abilities too`, `Underneath: it stays ${name}, with ${d.name}'s abilities too`],
        prompt: `mutate onto ${name}: put ${d.name} on top or underneath`,
      };
      return;
    }
    // Its target is gone: it's a creature spell again and enters the battlefield (CR 702.140b).
    o.mutating = undefined;
    log(s, `${d.name}'s target is gone, so it resolves as a creature.`);
    return resolvePermanentSpell(s, item, o, defOf(s, o));
  }
  if (isPermanentCard(d)) return resolvePermanentSpell(s, item, o, d);
  const body = item.body ?? compileCard(d).spell;
  if (body) {
    log(s, `${d.name} resolves.`);
    // When done (now, or after a choice it waits on), it goes to the graveyard (CR 608.2n).
    if (beginResolution(s, item, body) !== "fizzled") return;
    log(s, `${d.name} does nothing (its targets are gone).`); // CR 608.2b
  } else {
    log(s, `${d.name} resolves. (Its effect is not implemented yet.)`);
  }
  if (s.objects[o.id]?.zone === "stack") moveObject(s, o.id, "graveyard");
}

/** A permanent spell resolves: it enters the battlefield (CR 608.3), an Aura attached to its target (303.4f). */
function resolvePermanentSpell(s: GameState, item: StackItem, o: GameObject, d: CardDef) {
  const enchant = compileCard(d).enchant;
  if (enchant) {
    // An Aura spell's target is checked on resolution like any other (CR 608.2b); it enters attached to it (CR 303.4f).
    const t = item.targets?.[0];
    const legal = !!t && (t.kind === "object" || t.kind === "player") && isLegalTarget(s, enchant, t, item.controller, d);
    if (legal && t.kind === "player") {
      // "Enchant player" (CR 702.5d): it enters attached to the player.
      log(s, `${d.name} resolves and enters attached to ${player(s, t.id).name}.`);
      moveObject(s, o.id, "battlefield", { controller: item.controller, ...(item.x ? { x: item.x } : {}), attachToPlayer: t.id });
      return;
    }
    // An Aura with {X} (Nyxborn Hydra bestowed): its "enters with X counters" uses the spell's X (CR 107.3m).
    if (legal && t.kind === "object") {
      log(s, `${d.name} resolves and enters attached to ${nameOf(s, t.id)}.`);
      moveObject(s, o.id, "battlefield", { controller: item.controller, ...(item.x ? { x: item.x } : {}), attachTo: t.id });
      return;
    }
    if (!o.bestowed) {
      log(s, `${d.name} does nothing (its target is gone).`);
      moveObject(s, o.id, "graveyard");
      return;
    }
    // A bestowed Aura spell with an illegal target becomes a creature spell and resolves (CR 702.103e, 608.3b).
    o.bestowed = undefined;
    log(s, `${d.name}'s target is gone, so it resolves as a creature.`);
  }
  log(s, `${d.name} resolves and enters the battlefield${o.castAlt === "sneak" ? " tapped" : ""}.`);
  const sneak = o.castAlt === "sneak" ? o.sneak : undefined;
  o.sneak = undefined;
  const gains = o.copyGains;
  o.copyGains = undefined;
  const haste = o.hasteCast;
  o.hasteCast = undefined;
  // Opal Palace: as many more +1/+1 counters as times it's been cast from the command zone, for each of its mana spent.
  // Biophagus: one more for each of its mana spent (CR 614.1c).
  const opal = (o.commanderCountersCast ?? 0) * (player(s, o.owner).commanderCasts[o.id] ?? 0) + (o.creatureCountersCast ?? 0);
  o.commanderCountersCast = undefined;
  o.creatureCountersCast = undefined;
  // Impending: "If you chose to pay this permanent's impending cost, it enters with N time counters on it" (CR 702.176a).
  const impending = o.castAlt === "impending" ? (compileCard(d).impending ?? 0) : 0;
  const enterCounters = { ...(opal ? { "+1/+1": opal } : {}), ...(impending ? { time: impending } : {}) };
  moveObject(s, o.id, "battlefield", { controller: item.controller, ...(item.x ? { x: item.x } : {}), ...(sneak ? { tapped: true } : {}), ...(Object.keys(enterCounters).length ? { counters: enterCounters } : {}) });
  // Sneak: tapped and attacking whom the returned creature was attacking (CR 702.190b, 506.3a).
  if (sneak && o.zone === "battlefield" && objIsType(s, o, "Creature") && enterAttacking(s, o, sneak)) log(s, `${d.name} is attacking ${attackedName(s, o)}.`);
  if (gains && o.zone === "battlefield") {
    // "The copy gains haste and ...": the effect on the spell goes on applying to the token it became (CR 400.7a).
    s.effects.push({ id: `e${s.nextId++}`, timestamp: gains.timestamp, controller: gains.controller, sourceName: gains.source, duration: "game", affected: [o.id], mods: gains.mods });
    invalidateCharacteristics(s);
  }
  if (haste && o.zone === "battlefield") {
    // Mana spent on it gave the creature spell haste (Arena of Glory): the creature it became has it (rulings).
    s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: item.controller, sourceName: d.name, duration: haste, affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
    invalidateCharacteristics(s);
  }
  if (o.zone === "battlefield" && o.castAlt === "dash") dashed(s, o, item.controller);
  if (o.zone === "battlefield" && o.castAlt === "blitz") blitzed(s, o, item.controller);
  if (o.zone === "battlefield" && (o.castAlt === "warp" || o.castAlt === "grantedWarp")) warped(s, o, item.controller);
}

/**
 * Dash (CR 702.109a): "As long as this permanent's dash cost was paid, it has haste", and "return the
 * permanent this spell becomes to its owner's hand at the beginning of the next end step".
 */
function dashed(s: GameState, o: GameObject, controller: PlayerId) {
  s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller, sourceName: defOf(s, o).name, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
  addDelayed(s, "nextEndStep", controller, o, { targets: [], effects: [{ type: "bounce", what: { ref: "subject" } }], text: "Return ~ to its owner's hand (dash)." });
}

/**
 * Blitz (CR 702.152a): "As long as this permanent's blitz cost was paid, it has haste and 'When this permanent is put
 * into a graveyard from the battlefield, draw a card'", and "sacrifice the permanent this spell becomes at the beginning
 * of the next end step". Only this object has them: a copy of it doesn't (rulings).
 */
function blitzed(s: GameState, o: GameObject, controller: PlayerId) {
  s.effects.push({
    id: `e${s.nextId++}`,
    timestamp: s.nextTimestamp++,
    controller,
    sourceName: defOf(s, o).name,
    sourceId: o.id,
    duration: "game",
    affected: [o.id],
    mods: [
      { kind: "addKeywords", keywords: ["Haste"] },
      { kind: "addAbility", text: "When ~ dies, draw a card." }, // "dies" is put into a graveyard from the battlefield (CR 700.4)
    ],
  });
  invalidateCharacteristics(s);
  addDelayed(s, "nextEndStep", controller, o, { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "Sacrifice ~ (blitz)." });
}

/**
 * Warp (CR 702.185a): "exile the permanent this spell becomes at the beginning of the next end step. Its owner may
 * cast this card after the current turn has ended for as long as it remains exiled."
 */
function warped(s: GameState, o: GameObject, controller: PlayerId) {
  addDelayed(s, "nextEndStep", controller, o, { targets: [], effects: [{ type: "warpExile" }], text: "Exile ~ (warp). Its owner may cast it after this turn." });
}

// ---------------------------------------------------------------------------
// Player actions

function isMainPhase(s: GameState) {
  return s.step === "main1" || s.step === "main2";
}

/** Sorcery timing: your main phase, empty stack, you have priority. CR 307.1 */
export function canActAtSorcerySpeed(s: GameState, pid: PlayerId) {
  return !s.pending && s.activePlayer === pid && s.priority === pid && isMainPhase(s) && s.stack.length === 0;
}

/**
 * Split second (CR 702.61a-b): while a spell with it is on the stack, players can't cast spells or activate
 * abilities that aren't mana abilities. Mana abilities, special actions (turning a face-down creature face up)
 * and triggered abilities still work; so does a spell's split second only while it's on the stack.
 */
export function splitSecondOnStack(s: GameState): boolean {
  return s.stack.some((x) => x.kind === "spell" && !!x.objectId && !!s.objects[x.objectId] && hasSplitSecond(s, s.objects[x.objectId]!, x.controller, x));
}

/**
 * A spell's split second: its own, Samut, Tyrant of Naktamun's for its controller's spells of a kind, or Shadow the
 * Hedgehog's for its controller's spells cast with mana from an artifact.
 */
function hasSplitSecond(s: GameState, o: GameObject, controller: PlayerId, item: StackItem): boolean {
  if (objHasKeyword(s, o, "Split second")) return true;
  if (s.battlefield.some((id) => controllerOf(s, obj(s, id)) === controller && abilitiesOf(s, obj(s, id)).spellsHaveSplitSecond?.some((f) => spellMatches(s, f, item)))) return true;
  if (!o.spent?.from?.artifact) return false;
  return s.battlefield.some((id) => controllerOf(s, obj(s, id)) === controller && !!abilitiesOf(s, obj(s, id)).splitSecondIfArtifactMana);
}

/**
 * The city's blessing (CR 702.131): a player who controls ten or more permanents gets it, if a permanent they
 * control has ascend (`any`: always, for a resolving ascend spell). Once they have it, it's theirs for the rest
 * of the game. Continuous effects that care see it right away (CR 702.131d).
 */
export function giveCitysBlessing(s: GameState, pid: PlayerId, any = false): boolean {
  const p = player(s, pid);
  if (p.citysBlessing || p.lost) return false;
  const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid);
  if (mine.length < 10 || (!any && !mine.some((o) => objHasKeyword(s, o, "Ascend")))) return false;
  p.citysBlessing = true;
  invalidateCharacteristics(s);
  log(s, `${p.name} gets the city's blessing.`);
  return true;
}

/**
 * An enduring story (CR 702.195a): a player who controls a permanent with storied and three or more permanents that are
 * artifacts, Sagas and/or legendary gets it for the rest of the game. Continuous effects see it at once (702.195c).
 */
function giveEnduringStory(s: GameState, pid: PlayerId): boolean {
  const p = player(s, pid);
  if (p.enduringStory || p.lost) return false;
  const mine = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid);
  if (!mine.some((o) => objHasKeyword(s, o, "Storied"))) return false;
  const storied = (o: GameObject) => {
    const c = characteristics(s, o);
    return c.types.includes("Artifact") || c.supertypes.includes("Legendary") || c.subtypes.includes("Saga");
  };
  if (mine.filter(storied).length < 3) return false;
  p.enduringStory = true;
  invalidateCharacteristics(s);
  log(s, `${p.name} has an enduring story.`);
  return true;
}

/**
 * Ascend on permanents (CR 702.131b) isn't a triggered ability: it applies any time its condition is true. Neither is
 * storied (CR 702.195a).
 */
export function checkAscend(s: GameState) {
  for (const p of s.players) giveCitysBlessing(s, p.id), giveEnduringStory(s, p.id);
}

/**
 * "You may play cards exiled with ~" (Rogue Class): a permanent `pid` controls with that permission now, whose linked
 * exile took this card (CR 607.2a), as the objects they both are now (CR 400.7).
 */
function linkedPlayPermission(s: GameState, o: GameObject, pid: PlayerId): false | "anyType" | "life" | "plain" {
  if (o.zone !== "exile") return false;
  let how: false | "anyType" | "life" | "plain" = false;
  for (const id of s.battlefield) {
    const p = obj(s, id);
    if (controllerOf(s, p) !== pid) continue;
    const a = abilitiesOf(s, p);
    // Tinybones: during your turn, a face-up card you don't own with a stash counter on it.
    if (a.playCountered && s.activePlayer === pid && o.owner !== pid && !o.faceDown && (o.counters[a.playCountered] ?? 0) > 0) return "anyType";
    if (!s.linkedExile) continue;
    // Valgavoth's: during its controller's turn, for life.
    const life = !!a.playLinkedForLife && s.activePlayer === pid;
    // Evendo Brushrazer's: while its condition holds, paying as usual.
    const plain = !!a.playLinkedWhile && staticConditionNow(s, a.playLinkedWhile, id, pid);
    if (!life && !plain && !a.playLinked && !(a.playLinkedIf && staticConditionNow(s, a.playLinkedIf, id, pid))) continue;
    if (!(s.linkedExile[`${id}@${p.zoneChanges ?? 0}`] ?? []).some((l) => l.id === o.id && l.zc === (o.zoneChanges ?? 0))) continue;
    if (a.playLinked || (a.playLinkedIf && staticConditionNow(s, a.playLinkedIf, id, pid))) return "anyType";
    if (life) how = "life";
    else if (!how) how = "plain";
  }
  return how;
}

/**
 * How `pid` may play this exiled card now: its own permission, or a "play cards exiled with ~" one (any color of mana;
 * Valgavoth's for life equal to its mana value, `life`).
 */
function exilePermission(s: GameState, o: GameObject, pid: PlayerId): (Pick<NonNullable<GameObject["mayPlay"]>, "anyType" | "free" | "orPay" | "cost" | "more"> & { life?: true }) | undefined {
  if (ownExilePermission(s, o, pid)) return o.mayPlay;
  const how = linkedPlayPermission(s, o, pid);
  return how === "anyType" ? { anyType: true } : how === "life" ? { life: true } : how === "plain" ? {} : undefined;
}

/**
 * "You may play one of those cards" (Nashi): playing this exiled card uses up its group's permission. Aminatou's Augury:
 * the card type it's cast as is used up (`asType`, or the one `defaultByType` picks).
 */
function useOneOf(s: GameState, o: GameObject, pid: PlayerId, asType?: string): void {
  if (o.zone === "exile" && o.mayPlay?.oneOf && ownExilePermission(s, o, pid)) (s.oneOfUsed ??= []).push(o.mayPlay.oneOf);
  if (o.zone === "exile" && o.mayPlay?.byType && ownExilePermission(s, o, pid)) ((s.byTypeCast ??= {})[o.mayPlay.byType] ??= []).push([asType ?? defaultByType(s, o, pid)!]);
}

const nonlandTypes = (d: CardDef) => d.types.filter((t) => t !== "Land");

/**
 * Aminatou's Augury: whether one more card with these nonland card types can be cast too, each card cast as a different
 * one of its types. Each card cast was cast as one type, chosen as it was cast (rulings: "you may cast it as either of
 * those types").
 */
function byTypeFits(cast: string[][], more: string[]): boolean {
  const all = [...cast, more];
  const used = new Set<string>();
  const assign = (i: number): boolean => {
    if (i === all.length) return true;
    for (const t of all[i]!) {
      if (used.has(t)) continue;
      used.add(t);
      if (assign(i + 1)) return true;
      used.delete(t);
    }
    return false;
  };
  return assign(0);
}

/**
 * Aminatou's Augury: the card types `pid` may cast this exiled card as now, the nonland types of its that no card cast
 * from its group was cast as (an artifact creature as either, rulings). Empty for a card without such a permission.
 */
export function byTypeChoices(s: GameState, o: GameObject, pid: PlayerId): string[] {
  const group = o.mayPlay?.byType;
  if (!group || o.zone !== "exile" || !ownExilePermission(s, o, pid)) return [];
  const cast = s.byTypeCast?.[group] ?? [];
  return nonlandTypes(defOf(s, o)).filter((t) => byTypeFits(cast, [t]));
}

/**
 * The type to cast this card as when none was chosen: the one that leaves the most of the group's other exiled cards
 * castable, then the first printed.
 */
export function defaultByType(s: GameState, o: GameObject, pid: PlayerId): string | undefined {
  const options = byTypeChoices(s, o, pid);
  if (options.length < 2) return options[0];
  const cast = s.byTypeCast?.[o.mayPlay!.byType!] ?? [];
  const others = Object.values(s.objects).filter((c) => c.id !== o.id && c.zone === "exile" && c.mayPlay?.byType === o.mayPlay!.byType && c.mayPlay?.zc === (c.zoneChanges ?? 0));
  const left = (t: string) => {
    // As many of the others as can still be cast each as a different type, greedily.
    const taken = [...cast, [t]];
    let n = 0;
    for (const c of others) {
      const ts = nonlandTypes(defOf(s, c));
      if (byTypeFits(taken, ts)) {
        taken.push(ts.filter((x) => byTypeFits(taken, [x])).slice(0, 1));
        n++;
      }
    }
    return n;
  };
  return options.reduce((best, t) => (left(t) > left(best) ? t : best), options[0]!);
}

/** Valgavoth's permission is the one `pid` would cast this exiled card with: for life equal to its mana value, only. */
export const castFromExileForLife = (s: GameState, o: GameObject, pid: PlayerId): boolean => o.zone === "exile" && !!exilePermission(s, o, pid)?.life;

/** "Until the end of your next turn, you may play that card": `pid` may play this exiled card now. */
export function mayPlayFromExile(s: GameState, o: GameObject, pid: PlayerId): boolean {
  return mayPlayExiledOtherwise(s, o, pid) || linkedFreeGrant(s, o, pid) >= 0;
}

/** May `pid` play this exiled card now other than for Court of Locthwain's "without paying its mana cost"? */
const mayPlayExiledOtherwise = (s: GameState, o: GameObject, pid: PlayerId): boolean => ownExilePermission(s, o, pid) || selfCastFromExile(s, o, pid) || !!linkedPlayPermission(s, o, pid) || preparedCopyCastable(s, o, pid);

/**
 * Court of Locthwain: the index in GameState.linkedFreeCasts of a grant this turn that lets `pid` cast this exiled card
 * without paying its mana cost, the card one exiled with that grant's source (CR 607.2a); -1 if none. A spell: not a land.
 */
export function linkedFreeGrant(s: GameState, o: GameObject, pid: PlayerId): number {
  if (o.zone !== "exile" || !s.linkedFreeCasts?.length || isType(defOf(s, o), "Land")) return -1;
  return s.linkedFreeCasts.findIndex((g) => g.player === pid && g.turn === s.turn && (!g.filter || printedMatches(g.filter, defOf(s, o))) && (s.linkedExile?.[g.source] ?? []).some((l) => l.id === o.id && l.zc === (o.zoneChanges ?? 0)));
}

/** "You may cast ~ from exile" (Squee): its owner, a face-up card; cast, not played as a land. */
const selfCastFromExile = (s: GameState, o: GameObject, pid: PlayerId): boolean =>
  o.zone === "exile" && o.owner === pid && !o.isToken && !o.faceDown && !!compileCard(defOf(s, o)).castFromExile && !isType(defOf(s, o), "Land");

/** A "for as long as you control ~" permission's source is still on the battlefield, that object, under that player's control. */
export function stillControlsSource(s: GameState, m: NonNullable<GameObject["mayPlay"]>): boolean {
  const src = m.source && s.objects[m.source.id];
  return !!src && src.zone === "battlefield" && (src.zoneChanges ?? 0) === m.source!.zc && controllerOf(s, src) === m.player;
}

/** The card's own permission to be played from exile (GameObject.mayPlay), if it's `pid`'s and holds now. */
function ownExilePermission(s: GameState, o: GameObject, pid: PlayerId): boolean {
  if (o.zone !== "exile" || o.mayPlay?.player !== pid || o.mayPlay.zc !== (o.zoneChanges ?? 0)) return false;
  const m = o.mayPlay;
  // "Until your next turn" (Three Wishes): over once that turn begins.
  if (m.until === "yourNextTurn" && s.activePlayer === pid && s.turn > m.turn) return false;
  // "For as long as Intet remains on the battlefield": that object (CR 400.7).
  if (m.until === "source" && !(m.source && s.objects[m.source.id]?.zone === "battlefield" && (s.objects[m.source.id]!.zoneChanges ?? 0) === m.source.zc)) return false;
  // "For as long as you control ~" (Lightning, Security Sergeant): that object, controlled by that player.
  if (m.until === "whileControlled" && !stillControlsSource(s, m)) return false;
  // "During your next turn" (Galvanic Relay): not the turn it was exiled (rulings).
  if (m.until === "duringNextTurn" && !(s.activePlayer === pid && s.turn > m.turn)) return false;
  if (m.castOnly && isType(defOf(s, o), "Land")) return false;
  // Neyali: only during a turn they attacked with a token.
  if (m.attackedWithToken && s.players[pid]?.tokenAttackedTurn !== s.turn) return false;
  // "You may play one of those cards" (Nashi): not once one of them has been played.
  if (m.oneOf && s.oneOfUsed?.includes(m.oneOf)) return false;
  // Chandra, Hope's Beacon: only a card with a face that is a spell of this kind.
  if (m.castFilter && !castFilterFits(s, o, m.castFilter)) return false;
  // "For each nonland card type, ... a spell of that type" (Aminatou's Augury): a type still free for it.
  if (m.byType && !byTypeFits(s.byTypeCast?.[m.byType] ?? [], nonlandTypes(defOf(s, o)))) return false;
  // A warped or plotted card: only on a later turn (CR 702.185a, 702.170d), and only cast, not played as a land.
  return !castOnlyFromExile(o) || (s.turn > o.mayPlay.turn && !isType(defOf(s, o), "Land"));
}

/** Is this card, or a face it may be cast as (an Adventure, CR 715.3a), a spell like this? */
const castFilterFits = (s: GameState, o: GameObject, f: TargetSpec): boolean =>
  printedMatches(f, defOf(s, o)) || castableFaces(s, o).some((face) => asFace(s, o, face, () => printedMatches(f, defOf(s, o))));

/** A warped or plotted card in exile, which its owner may cast on a later turn (CR 702.185a, 702.170d). */
const castOnlyFromExile = (o: GameObject) => o.mayPlay?.until === "warp" || o.mayPlay?.until === "plot" || o.mayPlay?.until === "foretell";

/** A foretold card its owner may cast now, for its foretell cost (CR 702.143a). */
export const foretoldCast = (s: GameState, pid: PlayerId, o: GameObject): boolean => o.mayPlay?.until === "foretell" && mayPlayFromExile(s, o, pid);

/** A plotted card `pid` may cast now, without paying its mana cost (CR 702.170d). */
export function plottedCast(s: GameState, pid: PlayerId, o: GameObject): boolean {
  return o.mayPlay?.until === "plot" && mayPlayFromExile(s, o, pid);
}

/**
 * A land card in `pid`'s own graveyard that "you may play lands from your graveyard" lets them play (Crucible of Worlds),
 * or that card's own permission (Tablet of Discovery).
 * Playing it is still their land play for the turn, with the usual timing (CR 305.1-2).
 */
export function mayPlayLandFromGraveyard(s: GameState, o: GameObject, pid: PlayerId): boolean {
  if (o.zone !== "graveyard" || o.owner !== pid || !isType(defOf(s, o), "Land")) return false;
  return ownGraveyardPlay(s, o, pid) || mayhemPlay(s, o) || landsFromGraveyardNow(s, pid, o) || !!landPermit(s, pid);
}

/** Mayhem on a land (Oscorp Industries): discarded this turn, so its owner may play it from their graveyard (CR 702.187c). */
function mayhemPlay(s: GameState, o: GameObject): boolean {
  return o.zone === "graveyard" && o.discardedTurn === s.turn && !!compileCard(defOf(s, o)).mayhemLand;
}

/** "Mill a card. You may play that card this turn." (Tablet of Discovery): that card's own permission (CR 400.7). */
function ownGraveyardPlay(s: GameState, o: GameObject, pid: PlayerId): boolean {
  const m = o.mayPlay;
  return o.zone === "graveyard" && !!m && m.player === pid && m.zc === (o.zoneChanges ?? 0) && m.until === "thisTurn" && m.turn === s.turn && !m.castOnly;
}

/**
 * Every land may be played from `pid`'s graveyard now: Crucible of Worlds, or an effect this turn (Yawgmoth's Will); or
 * this land card `o`, by its subtype (Titania, Nature's Force's Forests).
 */
function landsFromGraveyardNow(s: GameState, pid: PlayerId, o: GameObject): boolean {
  const typed = (id: ObjectId) => {
    const of = abilitiesOf(s, obj(s, id)).landsFromGraveyardOf;
    return !!of && of.some((st) => characteristics(s, o).subtypes.includes(st));
  };
  const anchored = (id: ObjectId) => {
    const cond = abilitiesOf(s, obj(s, id)).landsFromGraveyardIf;
    return !!cond && staticConditionNow(s, cond, id, pid);
  };
  return s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && (abilitiesOf(s, obj(s, id)).landsFromGraveyard || typed(id) || anchored(id))) || liveEmblems(s).some((e) => e.owner === pid && abilitiesOf(s, e).landsFromGraveyard) || !!s.graveyardTurn?.some((g) => g.player === pid && g.turn === s.turn && g.lands);
}

/** Muldrotha's "you may play a land ... from your graveyard" during each of your turns, if one isn't used yet this turn. */
function landPermit(s: GameState, pid: PlayerId): string | undefined {
  if (s.activePlayer !== pid) return undefined;
  const used = s.turnLog?.gravePermits ?? [];
  for (const id of s.battlefield) {
    const p = obj(s, id);
    const once = controllerOf(s, p) === pid ? abilitiesOf(s, p).landFromGraveyardOnce : undefined;
    if (!once) continue;
    // Serra Paragon: the one use it shares with its spell permission.
    const key = `${p.id}@${p.zoneChanges ?? 0}:${once === "shared" ? "" : "Land"}`;
    if (!used.includes(key)) return key;
  }
  return undefined;
}

/**
 * The top card of `pid`'s own library, which "you may play lands / cast creature spells from the top of your library"
 * lets them play (Courser of Kruphix, Future Sight), at its usual timing (CR 401.5, rulings).
 */
export function mayPlayFromTop(s: GameState, o: GameObject, pid: PlayerId, way?: "mana" | "life"): boolean {
  return !!topPermission(s, o, pid, way);
}

/**
 * The permanent whose permission lets `pid` play `o` from the top of their library: one without "once each turn" if
 * there is one, so a once-a-turn permission is kept for later (Johann). "Of the chosen type" is the permanent's choice.
 */
function topPermission(s: GameState, o: GameObject, pid: PlayerId, way?: "mana" | "life"): { by?: GameObject; once?: true; haste?: "endOfTurn" } | undefined {
  if (o.zone !== "library" || o.owner !== pid || player(s, pid).library[0] !== o.id) return undefined;
  const d = defOf(s, o);
  const land = isType(d, "Land");
  // A resolved effect's, for the rest of the turn (Gwenom).
  for (const g of s.topTurn ?? []) {
    const top = g.top;
    if (g.player !== pid || g.turn !== s.turn || (!land && way && !!top.payLife !== (way === "life"))) continue;
    if (land ? top.lands && (!top.landFilter || printedMatches(top.landFilter, d)) : top.spells === "any" || !!top.spells?.some((f) => printedMatches(f, d))) return {};
  }
  let once: GameObject | undefined;
  // A permission that also gives haste (Thundermane Dragon) is the one used when several apply: its controller's pick.
  let plain: GameObject | undefined;
  for (const id of s.battlefield) {
    const src = obj(s, id);
    if (controllerOf(s, src) !== pid) continue;
    for (const top of abilitiesOf(s, src).fromTop ?? []) {
      // Bolas's Citadel's spells are cast for life (`way` "life"); the other permissions' for their mana costs.
      if (!land && way && !!top.payLife !== (way === "life")) continue;
      if ((top.if && !staticConditionNow(s, top.if, src.id, pid)) || !(land ? top.lands && (!top.landFilter || printedMatches(top.landFilter, d)) : top.spells === "any" || !!top.spells?.some((f) => printedMatches(bindChosen(f, src.chosen), d)))) continue;
      if (!top.once && top.haste) return { by: src, haste: top.haste };
      if (!top.once) plain ??= src;
      else if (src.topUsedTurn !== s.turn) once ??= src;
    }
  }
  if (plain) return { by: plain };
  return once && { by: once, once: true };
}

/** "You may look at the top card of your library any time" (Vizier of the Menagerie): whether `viewer` may see `pid`'s top card. */
export function topVisible(s: GameState, pid: PlayerId, viewer: PlayerId): boolean {
  return (
    topRevealed(s, pid) ||
    (pid === viewer && !!s.topTurn?.some((g) => g.player === pid && g.turn === s.turn)) ||
    (pid === viewer &&
      s.battlefield.some((id) => {
        const a = controllerOf(s, obj(s, id)) === pid ? abilitiesOf(s, obj(s, id)) : undefined;
        return !!a && (!!a.lookTop || (!!a.lookTopIf && staticConditionNow(s, a.lookTopIf, id, pid)));
      }))
  );
}

/** Cards `pid` may play from the top of their library right now (see mayPlayFromTop). */
export function topPlayable(s: GameState, pid: PlayerId): ObjectId[] {
  const top = player(s, pid).library[0];
  return top !== undefined && mayPlayFromTop(s, obj(s, top), pid) ? [top] : [];
}

/** Whether everyone can see the top card of `pid`'s library (CR 401.5): "play with the top card of your library revealed". */
export function topRevealed(s: GameState, pid: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const r = abilitiesOf(s, obj(s, id)).revealTop;
    return r === "players" || (r === "you" && controllerOf(s, obj(s, id)) === pid);
  });
}

/** Whether `pid`'s hand is revealed (to `viewer`): "players play with their hands revealed", Telepathy (CR 402.3). */
export function handRevealed(s: GameState, pid: PlayerId, viewer: PlayerId): boolean {
  if (pid === viewer) return true;
  return s.battlefield.some((id) => {
    const r = abilitiesOf(s, obj(s, id)).revealHands;
    return r === "players" || (r === "opponents" && controllerOf(s, obj(s, id)) !== pid);
  });
}

/** One land a turn, plus one for each "you may play an additional land on each of your turns" (CR 305.2, 305.2a). */
export function landsAllowed(s: GameState, pid: PlayerId): number {
  // "Can't play lands this turn" wins over anything that lets them (CR 101.2).
  if (s.cantPlayLandsThisTurn?.some((c) => c.player === pid && c.turn === s.turn)) return 0;
  // Territorial Dispute: "Players can't play lands."
  if (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).playersCantPlayLands)) return 0;
  // Rock Jockey: "You can't play lands if ~ was cast this turn".
  if (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).noLandsIfCastThisTurn && controllerOf(s, obj(s, id)) === pid && obj(s, id).wasCast && obj(s, id).enteredTurn === s.turn)) return 0;
  let n = 1;
  const extra = player(s, pid).extraLands;
  if (s.activePlayer === pid && extra?.turn === s.turn) n += extra.n;
  if (s.activePlayer === pid)
    for (const id of s.battlefield) {
      const a = abilitiesOf(s, obj(s, id));
      n += a.extraLandsEach ?? 0; // Rites of Flourishing: whoever controls it
      if (controllerOf(s, obj(s, id)) !== pid) continue;
      n += (a.extraLands ?? 0) + (a.extraLandsIf ?? []).filter((c) => staticConditionNow(s, c, id, pid)).length;
    }
  return n;
}

function playLand(s: GameState, p: Player, id: ObjectId, untapped?: boolean, face?: number): void {
  const o = obj(s, id);
  // A modal double-faced card is played as one of its land faces, chosen first (CR 712.12).
  if (face !== undefined && o.face !== face) {
    if (!landFaces(s, o).includes(face)) throw new RulesError(`${defOf(s, o).name} has no land face to play that way`);
    return asFace(s, o, face, () => playLand(s, p, id, untapped, face));
  }
  const d = defOf(s, o);
  if (!((o.zone === "hand" && o.owner === p.id) || mayPlayFromExile(s, o, p.id) || mayPlayLandFromGraveyard(s, o, p.id) || mayPlayFromTop(s, o, p.id))) throw new RulesError("land must be in your hand");
  if (!isType(d, "Land")) throw new RulesError(`${d.name} is not a land`);
  if (!canActAtSorcerySpeed(s, p.id)) throw new RulesError("lands can only be played at sorcery speed");
  if (p.landsPlayedThisTurn >= landsAllowed(s, p.id)) throw new RulesError("already played a land this turn"); // CR 305.2
  const banned = nameLandBan(s, p.id, d);
  if (banned) throw new RulesError(banned);
  const choice = entersRulesOf(s, p.id, id).entersTappedChoice;
  if (untapped && !canEnterUntapped(s, p.id, id))
    throw new RulesError(choice?.kind === "payLife" ? `you can't pay ${choice.n} life` : choice ? `you have no ${choice.filter.text} to reveal` : `${d.name} has no choice to make as it enters`);
  putLandPlayed(s, p, id, untapped, face);
}

/**
 * A land played as an effect resolves ("You may play lands ... from among cards exiled this way", Gix; hideaway): only
 * on the player's own turn with a land play left (CR 305.2, 305.3; rulings), timing otherwise ignored (CR 608.2g).
 */
export function canPlayLandNow(s: GameState, pid: PlayerId, id: ObjectId): boolean {
  const d = defOf(s, obj(s, id));
  return isType(d, "Land") && s.activePlayer === pid && player(s, pid).landsPlayedThisTurn < landsAllowed(s, pid) && !nameLandBan(s, pid, d);
}

/** What the player could do so a land they play now enters untapped ("pay 2 life", a shock land), or null. */
export function landUntappedOffer(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const choice = entersRulesOf(s, pid, id).entersTappedChoice;
  if (!choice || !canEnterUntapped(s, pid, id) || controlsForEntry(s, pid, choice, id)) return null;
  const name = defOf(s, obj(s, id)).name;
  return choice.kind === "payLife" ? `pay ${choice.n} life so ${name} enters untapped` : `reveal a ${choice.filter.text} from your hand so ${name} enters untapped`;
}

/** Plays a land as an effect resolves (see canPlayLandNow): it counts as the turn's land play (CR 305.2). */
export function playLandByEffect(s: GameState, pid: PlayerId, id: ObjectId, untapped?: boolean): void {
  putLandPlayed(s, player(s, pid), id, untapped && canEnterUntapped(s, pid, id));
}

function putLandPlayed(s: GameState, p: Player, id: ObjectId, untapped?: boolean, face?: number): void {
  const o = obj(s, id);
  const d = defOf(s, o);
  const choice = entersRulesOf(s, p.id, id).entersTappedChoice;
  useOneOf(s, o, p.id);
  p.landsPlayedThisTurn++;
  if (untapped && choice?.kind === "payLife") {
    loseLife(s, p.id, choice.n);
    log(s, `${p.name} pays ${choice.n} life so ${d.name} enters untapped.`);
  } else if (untapped && choice?.kind === "reveal" && !controlsForEntry(s, p.id, choice, id)) {
    const shown = p.hand.find((x) => x !== id && printedMatches(choice.filter, defOf(s, obj(s, x))))!;
    log(s, `${p.name} reveals ${nameOf(s, shown)} so ${d.name} enters untapped.`);
  }
  // Muldrotha's land from the graveyard is used up, unless something lets every land be played from there (Crucible).
  if (o.zone === "graveyard" && !ownGraveyardPlay(s, o, p.id) && !mayhemPlay(s, o) && !landsFromGraveyardNow(s, p.id, o)) {
    const permit = landPermit(s, p.id)!;
    ((s.turnLog ??= {}).gravePermits ??= []).push(permit);
    // Serra Paragon: "it gains ..." as the land it becomes.
    const gains = permitGains(s, permit);
    if (gains) o.entersGaining = gains;
  }
  const fromZone = o.zone;
  const from = o.zone === "exile" || o.zone === "graveyard" || o.zone === "library" ? ` from ${o.zone === "exile" ? "exile" : o.zone === "library" ? "their library" : "their graveyard"}` : "";
  // Under the control of the player who plays it (CR 305.1, 110.2), an opponent's card from exile too (Opposition Agent).
  s.playingLand = id;
  moveObject(s, id, "battlefield", { controller: p.id, untapped, ...(face !== undefined ? { face } : {}) });
  s.playingLand = undefined;
  log(s, `${p.name} plays ${d.name}${from}${obj(s, id).tapped ? " (tapped)" : ""}.`);
  fireEvent(s, { type: "landPlayed", player: p.id, id, from: fromZone });
}

/** "Remove N counters from ~" paid as a cost (CR 602.2b); removing the last time counter triggers vanishing. */
function removeCountersCost(s: GameState, o: GameObject, rc: { counter: string; n: number }) {
  if (rc.n <= 0) return;
  const left = (o.counters[rc.counter] ?? 0) - rc.n;
  o.counters[rc.counter] = left;
  invalidateCharacteristics(s);
  if (left === 0) fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: rc.counter });
}

export function isSummoningSick(s: GameState, o: GameObject) {
  return o.controlledSinceTurn >= s.turn && !objHasKeyword(s, o, "Haste");
}

/**
 * A creature's {T} ability can't be activated while it's summoning sick (CR 302.6), unless its controller controls a
 * permanent saying they may activate them as though it had haste (Thousand-Year Elixir). It doesn't let it attack.
 */
export function tapAbilitySick(s: GameState, o: GameObject) {
  if (!isSummoningSick(s, o)) return false;
  const you = controllerOf(s, o);
  return !s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).creatureAbilitiesHaste && controllerOf(s, obj(s, id)) === you);
}

function activateMana(s: GameState, p: Player, id: ObjectId, mana: ManaType, index?: number, tap?: ObjectId[], extra: ManaType[] = [], combo?: number, to?: PlayerId) {
  const o = obj(s, id);
  // Its source as it was activated ("whenever you activate an ability of a creature", Elrond), before its costs.
  const activatedFrom = o.zone === "battlefield" ? { snapshot: structuredClone(o), chars: characteristics(s, o) } : undefined;
  const name = characteristics(s, o).name;
  const i = index ?? pickManaAbility(s, p.id, o, mana);
  if (i === undefined) throw new RulesError(`${name} can't produce {${mana}} right now`);
  const ab = manaAbilitiesOn(s, o)[i]!;
  const problem = manaAbilityProblem(s, p.id, o, i, false, tap ?? (ab?.tapCost ? [] : undefined));
  if (problem) throw new RulesError(problem);
  if (!manaChoices(s, o, ab).includes(mana)) throw new RulesError(`${name} can't produce {${mana}}`);
  // Victory Chimes: the player chosen as it's activated, any player still in the game.
  if (to !== undefined && to !== p.id && (!ab.toChosenPlayer || !s.players[to] || s.players[to]!.lost)) throw new RulesError(`${name}'s mana can't go to that player`);
  const getter = to ?? p.id;
  // "Add {W}{W}, {W}{U}, or {U}{U}": one of the combinations, chosen as it resolves (CR 605.3b). A storage land's: how
  // many counters it removes, announced as it's activated (CR 107.3a), and how that mana is split.
  const combos = manaCombos(s, o, ab);
  if (combos ? combo === undefined || !combos[combo] : combo !== undefined) throw new RulesError(combos ? `choose which mana ${name} adds` : `${name}'s ability has no combinations of mana to choose from`);
  // What it makes is worked out before the costs change anything ("for each creature you control").
  const adds = manaProduced(s, o, ab, mana, combo);
  // The triggered mana abilities tapping it triggers (CR 605.1b), with the player's picks for their mana.
  const triggered = manaTriggerResults(s, p.id, o, ab, adds);
  const picked = triggered.find((r) => r.extra.length === extra.length && r.extra.every((m, i) => m === extra[i]));
  if (!picked) throw new RulesError(triggered.length > 1 ? `choose the mana that tapping ${name} also adds` : `${name} adds no other mana to choose`);
  const src = objectSource(s, o);
  // What its source was as it was activated, before it's sacrificed (CR 106.3): a Treasure, a snow permanent, ...
  const from = manaOriginsOf(s, o);
  // Pay the costs (CR 602.2b, 605.3a), then add the mana.
  // Doubling Cube's cost is paid with the mana from the pool chosen for it (`combo`).
  const payCost = ab.produces.kind === "doublePool" ? parseManaCost(combos![combo!]!.map((m) => `{${m}}`).join("")) : ab.manaCost ? manaAbilityCost(s, p.id, o, ab.manaCost) : null;
  const manaPaid = payCost ? spendFromPool(s, p.id, payCost, { ability: o }) : null;
  if (payCost && !manaPaid) throw new RulesError("not enough mana");
  if (ab.tap) tapPermanent(s, o);
  // Tapped for mana (CR 106.12): triggers that aren't mana abilities wait for the stack (CR 605.1b, 603.3). Only if it
  // makes mana (CR 106.12a): not a storage land tapped removing no counters (rulings on Bottomless Vault).
  if (ab.tap && adds.length) fireEvent(s, { type: "tappedForMana", id: o.id, player: p.id });
  for (const t of tap ?? []) tapPermanent(s, obj(s, t));
  if (tap?.length) log(s, `${p.name} taps ${tap.map((t) => nameOf(s, t)).join(", ")} for ${name}'s mana ability.`);
  if (ab.lifeCost) loseLife(s, p.id, ab.lifeCost);
  if (ab.energyCost) loseEnergy(s, p.id, ab.energyCost);
  if (ab.discardHand) discardCards(s, p.id, [...p.hand]); // Lion's Eye Diamond (CR 701.9a)
  if (ab.removeCounters) removeCountersCost(s, o, ab.removeCounters);
  if (ab.produces.kind === "removeX") {
    const n = combos![combo!]!.length - (ab.produces.base ?? 0);
    removeCountersCost(s, o, { counter: ab.produces.counter, n });
    log(s, `${p.name} removes ${n} ${ab.produces.counter} counter${n === 1 ? "" : "s"} from ${name}.`);
  }
  if (ab.produces.kind === "revealX") {
    const shown = revealable(s, o, ab.produces).slice(0, combo!);
    log(s, shown.length ? `${p.name} reveals ${shown.map((c) => nameOf(s, c)).join(", ")} for ${name}.` : `${p.name} reveals no cards for ${name}.`);
  }
  if (ab.oncePerTurn || ab.sacrificeIfActivated) (o.activatedThisTurn ??= []).push(MANA_ABILITY_OFFSET + i);
  // Farrelite Priest: the fourth activation this turn and each one after it make a delayed trigger that sacrifices it
  // (rulings on Dragon Whelp); one made during an end step waits for the next turn's (CR 603.7).
  if (ab.sacrificeIfActivated && o.zone === "battlefield" && (o.activatedThisTurn ?? []).filter((n) => n === MANA_ABILITY_OFFSET + i).length >= ab.sacrificeIfActivated)
    addDelayed(s, "nextEndStep", p.id, o, { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" } }], text: "Sacrifice ~" });
  if (ab.onceEver) (o.activatedEver ??= []).push(MANA_ABILITY_OFFSET + i); // exhaust (CR 702.177a)
  if (ab.exhaust) p.exhaustTurn = s.turn; // CR 702.177b
  if (ab.sacrificeSelf) {
    log(s, `${p.name} sacrifices ${name} for mana.`);
    moveObject(s, id, "graveyard", { sacrificed: true });
  }
  if (ab.returnSelf) {
    log(s, `${p.name} returns ${name} to its owner's hand for mana.`);
    moveObject(s, id, "hand");
  }
  const spentTrigger: ManaSpentTrigger | undefined = ab.spentTrigger && { ...ab.spentTrigger, sourceId: o.id, sourceCardId: cardIdOf(o), sourceZc: o.zoneChanges ?? 0 };
  // "Whenever you cast a permanent spell using mana produced by Tecutlan": its mana is kept apart, to tell.
  const source = abilitiesOf(s, o).triggers.some((t) => t.cast?.manaFromSelf) ? `${o.id}#${o.zoneChanges ?? 0}` : undefined;
  if (getter !== p.id) log(s, `${p.name} taps ${name}: ${player(s, getter).name} adds ${adds.map((m) => `{${m}}`).join("")}.`);
  addMana(s, getter, adds, { only: boundSpend(o, ab.spendOnly), from, ...(spentTrigger ? { spentTrigger } : {}), ...(ab.spentHaste ? { haste: ab.spentHaste, ...(ab.spentHasteType ? { hasteType: ab.spentHasteType } : {}) } : {}), ...(ab.spentCommanderCounters ? { commanderCounters: true as const } : {}), ...(ab.spentCreatureCounter ? { creatureCounter: true as const } : {}), ...(ab.spentUncounterable ? { uncounterableInstantSorcery: true as const } : {}), ...(source ? { source } : {}) });
  // Right after it, without the stack (CR 605.4a), and without the riders of its mana (rulings on Mana Flare).
  addTriggeredMana(s, p.id, picked);
  // Yuna, Grand Summoner: "When you next cast a creature spell this turn, ..." (a delayed trigger, CR 603.7a).
  if (ab.nextCast) {
    const e = ab.nextCast;
    (s.nextCast ??= []).push({ controller: p.id, filter: e.filter, sourceId: o.id, sourceCardId: cardIdOf(o), body: { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." }, turn: s.turn, ...(e.uncounterable ? { uncounterable: true as const } : {}), ...(e.fromHand ? { fromHand: true as const } : {}) });
  }
  if (ab.skipNextUntap && o.zone === "battlefield") o.skipNextUntap = true;
  // Depletion lands, as the ability resolves: "Put a depletion counter on ~", "If there are no depletion counters on ~,
  // sacrifice it" (checked after the cost removed one).
  if (ab.putCounter && o.zone === "battlefield") putCounters(s, o, ab.putCounter, 1);
  if (ab.sacrificeIfNo && o.zone === "battlefield" && !(o.counters[ab.sacrificeIfNo] ?? 0)) {
    log(s, `${p.name} sacrifices ${name}.`);
    moveObject(s, id, "graveyard", { sacrificed: true });
  }
  if (ab.selfDamage && dealDamage(s, src, { player: p.id }, ab.selfDamage) && o.zone === "battlefield") fireEvent(s, { type: "dealtDamage", id: o.id, amount: ab.selfDamage, combat: false });
  // Vazi: "if mana from a Treasure was spent to ... activate it" counts mana abilities too.
  fireEvent(s, { type: "activated", player: p.id, mana: true, ...(activatedFrom ? { source: activatedFrom } : {}), ...(manaPaid?.treasure ? { treasure: manaPaid.treasure } : {}), ...(ab.exhaust ? { exhaust: true as const } : {}) });
}

/** What mana casting it can spend (CR 106.6): Security Rhox's alternative cost only mana from Treasures (CR 106.3). */
export const spellUse = (d: CardDef, alt?: AltCostKind, cost?: ParsedCost, choices?: CostChoices, o?: GameObject): ManaUse => ({ spell: d, ...(altCost(d, alt)?.treasureOnly ? { treasureOnly: true as const } : {}), ...(cost ? { xCost: cost.hasX } : {}), ...spellHow(d, choices, o) });

/** Kicked (CR 702.33d), cast for its disturb cost (CR 702.146a) or from a hand, for mana spent only on such spells or not on them (ManaUse). */
export const spellHow = (d: CardDef, choices?: CostChoices, o?: GameObject): { kicked?: true; disturb?: true; fromHand?: true } => ({ ...(choices?.kicks?.length && isRealKicker(compileCard(d).kicker) ? { kicked: true as const } : {}), ...(choices?.via === "disturb" ? { disturb: true as const } : {}), ...(o?.zone === "hand" ? { fromHand: true as const } : {}) });

/** Is this a Treasure now (its mana is "mana from a Treasure", CR 106.3)? */
export const isTreasure = (s: GameState, o: GameObject) => o.zone === "battlefield" && characteristics(s, o).subtypes.includes("Treasure");
/** A snow permanent: the mana its abilities make is snow mana, for {S} (CR 107.4h, 205.4g). */
export const isSnowSource = (s: GameState, o: GameObject) => o.zone === "battlefield" && characteristics(s, o).supertypes.includes("Snow");

/**
 * Add the mana that triggered mana abilities add (CR 605.4a). Its source is each ability's source (CR 106.3): mana from
 * Utopia Sprawl on a snow Forest isn't snow mana, mana from a snow Mana Flare is.
 */
export function addTriggeredMana(s: GameState, pid: PlayerId, picked: { adds: ManaType[]; from?: ManaOrigin[][] }): void {
  picked.adds.forEach((m, i) => addMana(s, pid, [m], { from: picked.from?.[i] ?? [] }));
}

/**
 * The life an activated ability's cost asks for: "Pay 2 life", or "Pay life equal to the number of colors in your
 * commanders' color identity" (War Room: set before the game, CR 903.4; none for a colorless one, rulings).
 */
export function activatedLifeCost(s: GameState, pid: PlayerId, ab: ActivatedAbility, o?: GameObject, x?: number): number {
  return (ab.lifeCost ?? 0) + (ab.lifeCostIdentity ? commanderIdentity(s, pid).length : 0) + (ab.lifeCostX ? (x ?? 0) : 0) + (ab.mana && o ? manaLifeTax(s, o) : 0);
}

export function commanderTax(p: Player, o: GameObject) {
  return 2 * (p.commanderCasts[o.id] ?? 0); // CR 903.8
}

/**
 * Why `pid` can't cast this card right now, or null if they can (with the mana already in their pool).
 * Without `targets`, only checks that legal targets exist; for a modal spell, without `modes`
 * only checks that some mode can be chosen (CR 700.2a).
 */
/**
 * Whether the pending free cast (PendingDecision "castFree") can cast this card one way or another: whole, as a split
 * card's half or another face (CR 709.3, 712.11b, 715.3), or prototyped (CR 718.3). `manaOk`: a problem with mana alone
 * (an additional cost) doesn't count.
 */
export function freeCastable(s: GameState, pid: PlayerId, id: ObjectId, manaOk = false): boolean {
  const o = s.objects[id];
  if (!o) return false;
  const ways: CostChoices[] = [{}, ...castableFaces(s, o).filter((f) => !isType(s.cards[registerFace(s, o, f)]!, "Land")).map((face) => ({ face })), ...(altCost(defOf(s, o), "prototype") ? [{ alt: "prototype" as const }] : [])];
  return ways.some((how) => {
    const problem = castProblem(s, pid, id, undefined, undefined, undefined, undefined, undefined, how);
    // Under Trinisphere a free spell can cost mana too (CR 601.2f), paid as it's cast.
    return problem === null || ((manaOk || costFloorInPlay(s)) && /^not enough mana/.test(problem));
  });
}

/** The least mana a spell costs now: Trinisphere's three while it's untapped (spellCostAtLeast), or 0. */
function spellCostFloor(s: GameState): number {
  let min = 0;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const n = abilitiesOf(s, o).spellCostAtLeast;
    if (n && !(n.whileUntapped && o.tapped)) min = Math.max(min, n.n);
  }
  return min;
}

/** Trinisphere is on the battlefield, untapped: a spell cast without paying its mana cost can still cost mana (costAtLeast). */
export const costFloorInPlay = (s: GameState) => spellCostFloor(s) > 0;

/** CR 205.4e: a legendary instant or sorcery can be cast only by a player who controls one of these. */
const controlsLegendaryCreatureOrPlaneswalker = (s: GameState, pid: PlayerId) =>
  s.battlefield.some((b) => {
    const ob = obj(s, b);
    const c = characteristics(s, ob);
    return controllerOf(s, ob) === pid && c.supertypes.includes("Legendary") && (c.types.includes("Creature") || c.types.includes("Planeswalker"));
  });

export function castProblem(
  s: GameState,
  pid: PlayerId,
  id: ObjectId,
  targets?: TargetChoice[],
  modes?: number[],
  convoke?: ObjectId[],
  improvise?: ObjectId[],
  x?: number,
  choices?: CostChoices,
): string | null {
  const p = player(s, pid);
  const o = s.objects[id];
  if (!o) return "no such card";
  choices = convertChoices(o, choices);
  if (choices?.alt === "convert" && (choices.face ?? o.face) !== 1) return `${defOf(s, o).name} is cast converted with its back face up`;
  // A defeated Siege is cast transformed, or not at all (CR 310.12b).
  if (siegeCastTransformed(s, pid, o) && (choices?.face ?? o.face) !== 1) return `${defOf(s, o).name} can only be cast transformed`;
  if (choices?.face !== undefined && o.face !== choices.face) {
    // A split card's half, a modal double-faced card's face, an Adventure: only that face is looked at (CR 709.3a,
    // 712.11c, 715.3a).
    const fp = faceProblem(s, pid, o, choices);
    if (fp) return fp;
    return asFace(s, o, choices.face, () => castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices));
  }
  // A split card is cast as one of its halves (CR 709.3).
  if (layoutOf(s, o) === "split" && o.face === undefined && o.zone !== "stack") return `choose which half of ${defOf(s, o).name} to cast`;
  if (choices?.faceDown && !o.faceDown) {
    // Cast face down (CR 702.37c, 708.4): it's turned face down first, so the checks see a 2/2 creature spell.
    const fd = compileCard(defOf(s, o)).faceDownCast;
    if (!fd) return `${defOf(s, o).name} can't be cast face down`;
    if (o.zone !== "hand" || o.owner !== pid) return "only a card in your hand can be cast face down";
    o.faceDown = fd.kind;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.faceDown = undefined;
    }
  }
  if (o.faceDown && !choices?.faceDown) return "a face-down card can't be cast";
  if ((choices?.alt === "prototype" || choices?.prototyped) && !o.prototyped) {
    // Cast prototyped, only its alternative characteristics are looked at (CR 718.3a).
    if (!altCost(defOf(s, o), "prototype")) return `${defOf(s, o).name} doesn't have prototype`;
    o.prototyped = true;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.prototyped = undefined;
    }
  }
  if (choices?.alt === "cleave" && !o.cleaved) {
    // Cast for its cleave cost, the words in square brackets are gone from the moment it's proposed (CR 702.148a, 601.2b).
    if (!altCost(defOf(s, o), "cleave")) return `${defOf(s, o).name} doesn't have cleave`;
    o.cleaved = true;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.cleaved = undefined;
    }
  }
  if (choices?.alt === "overload" && !o.overloaded) {
    // Cast overloaded, its text says "each" instead of "target" from the moment it's proposed (CR 702.96a, 601.2b).
    if (!altCost(defOf(s, o), "overload")) return `${defOf(s, o).name} doesn't have overload`;
    o.overloaded = true;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.overloaded = undefined;
    }
  }
  if (choices?.alt === "mutate" && !o.mutating) {
    // Cast for its mutate cost, it's a mutating creature spell with a target (CR 702.140a).
    if (!altCost(defOf(s, o), "mutate")) return `${defOf(s, o).name} doesn't have mutate`;
    o.mutating = true;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.mutating = undefined;
    }
  }
  if (choices?.alt === "bestow" && !o.bestowed) {
    // Cast bestowed, only its characteristics as an Aura spell are looked at (CR 702.103d).
    if (!altCost(defOf(s, o), "bestow")) return `${defOf(s, o).name} doesn't have bestow`;
    o.bestowed = true;
    try {
      return castProblem(s, pid, id, targets, modes, convoke, improvise, x, choices);
    } finally {
      o.bestowed = undefined;
    }
  }
  const d = defOf(s, o);
  const fromCommand = o.zone === "command";
  const free = freeCastOf(s, pid) === id;
  const madness = madnessCastOf(s, pid, id);
  // Cast plotted, without paying its mana cost: an alternative cost (CR 702.170d, 118.9a).
  const plotted = !free && plottedCast(s, pid, o);
  // Casting it face down is an alternative cost: no other one can go with it (CR 118.9a).
  if (choices?.faceDown && (free || plotted || choices.via || choices.alt)) return "a face-down spell can't be cast that way";
  // An aftermath half can't be cast from any zone other than a graveyard (CR 702.127a).
  if (o.zone !== "graveyard" && compileCard(d).fromGraveyard?.some((g) => g.kind === "aftermath")) return `${d.name} can be cast only from a graveyard (aftermath)`;
  const via = graveyardWay(s, o, choices?.via, pid);
  if (choices?.via && !via) return `${d.name} doesn't have ${describeVia(choices.via)}`;
  // Mosswood Dreadknight's permission is for its Adventure only (the face is chosen first, above).
  if (via?.face !== undefined && o.face !== via.face && layoutOf(s, o) === "adventure") return `${d.name} can be cast from your graveyard only as an Adventure`;
  if (!free && via && (o.zone !== "graveyard" || (o.owner !== pid && !via.anyOwner))) return `${describeVia(via.kind)} works only from your graveyard`;
  if (via?.if && !staticConditionNow(s, via.if, o.id, pid)) return `you can't cast ${d.name} from your graveyard now`;
  if (via?.kind === "mayhem" && o.discardedTurn !== s.turn) return `mayhem works only if you discarded ${d.name} this turn`; // CR 702.187b
  if (choices?.permit !== undefined && (via?.kind !== "turnPermission" || !pickPermit(s, o, via.permits ?? [], choices.permit))) return `that permission doesn't let you cast ${d.name} now`;
  // Lurrus: "with mana value 2 or less", the X chosen counted (CR 202.3e).
  if (via?.kind === "turnPermission" && !permitsForMv(s, choices?.permit !== undefined ? [choices.permit] : (via.permits ?? []), defMv(d) + (x ?? 0) * xCount(parseManaCost(d.manaCost))).length) return `${d.name}'s mana value is too high for that permission`;
  // Flashback and jump-start only if the resulting spell is an instant or sorcery (CR 702.34a, 702.133a).
  if (via && (via.kind === "flashback" || via.kind === "grantedFlashback" || via.kind === "jumpStart") && !isType(d, "Instant") && !isType(d, "Sorcery")) return `${d.name} isn't an instant or sorcery`;
  if (!free && !via && !mayPlayFromExile(s, o, pid) && !mayPlayFromTop(s, o, pid) && (!(o.zone === "hand" || (fromCommand && o.isCommander)) || o.owner !== pid))
    return o.zone === "graveyard" && graveyardWays(s, o, pid).length ? `choose how to cast ${d.name} from ${o.owner === pid ? "your" : "a"} graveyard` : "you can only cast spells from your hand or your commander";
  // "You may cast an instant or sorcery spell from among those exiled cards" (Chandra, Hope's Beacon): the face cast must
  // be one, unless something else lets it be cast (rulings).
  if (!free && !via && o.zone === "exile" && o.mayPlay?.castFilter && ownExilePermission(s, o, pid) && !printedMatches(o.mayPlay.castFilter, d) && !linkedPlayPermission(s, o, pid))
    return `only ${/^[aeiou]/i.test(o.mayPlay.castFilter.text) ? "an" : "a"} ${o.mayPlay.castFilter.text.replace(/ card$/, "")} spell can be cast this way`;
  // Court of Locthwain's card with no other permission: only without paying its mana cost.
  if (!free && !via && o.zone === "exile" && choices?.alt !== "linkedFree" && !mayPlayExiledOtherwise(s, o, pid) && linkedFreeGrant(s, o, pid) >= 0) return `${d.name} can only be cast without paying its mana cost`;
  if (choices?.buyback && compileCard(d).buyback === undefined) return `${d.name} doesn't have buyback`;
  // Aminatou's Augury: cast as one of its nonland card types no other card from the group was cast as (rulings).
  if (choices?.asType !== undefined && !byTypeChoices(s, o, pid).includes(choices.asType)) return `${d.name} can't be cast as ${/^[AEIOU]/.test(choices.asType) ? "an" : "a"} ${choices.asType.toLowerCase()} spell now`;
  // From the top of the library, a permission for this way of paying: Bolas's Citadel's spells for life (CR 118.9).
  // Valgavoth's exiled cards: for life equal to their mana value, and no other way (rulings).
  if (!free && !via && castFromExileForLife(s, o, pid) && choices?.alt !== "citadel" && !isType(d, "Land")) return `pay life equal to ${d.name}'s mana value rather than its mana cost`;
  if (!free && !via && o.zone === "library" && !mayPlayFromTop(s, o, pid, choices?.alt === "citadel" ? "life" : "mana"))
    return choices?.alt === "citadel" ? `nothing lets you pay life rather than ${d.name}'s mana cost` : `cast ${d.name} from the top of your library by paying life equal to its mana value`;
  if (choices?.alt) {
    if (choices.alt === "madness") return "madness is cast as its ability resolves";
    if (!altCost(d, choices.alt, s, pid, o))
      return choices.alt === "wubrg" ? "you don't control a permanent that lets you pay {W}{U}{B}{R}{G}" : choices.alt === "omniscience" ? "you don't control a permanent that lets you cast spells from your hand without paying their mana costs" : choices.alt === "evidence" ? "you don't control a permanent that lets you collect evidence instead" : `${d.name} doesn't have ${choices.alt}`;
    // An alternative cost without X: X is 0 (CR 107.3, rulings on Fist of Suns).
    if (choices.alt === "wubrg" && x) return "X is 0 when you pay {W}{U}{B}{R}{G} rather than the mana cost";
    if (choices.alt === "payZero" && x) return "X is 0 when you pay {0} rather than the mana cost";
    if (choices.alt === "payZero" && !payZeroSource(s, pid, o)) return `nothing lets you pay {0} rather than ${d.name}'s mana cost now`;
    if (choices.alt === "lifeForMv" && !payZeroSource(s, pid, o, true)) return `nothing lets you pay life rather than ${d.name}'s mana cost now`;
    if (choices.alt === "omniscience" && o.zone !== "hand") return "only spells cast from your hand are free";
    if (choices.alt === "linkedFree" && linkedFreeGrant(s, o, pid) < 0) return `${d.name} isn't a card you may cast this way`;
    if (choices.alt === "citadel" && o.zone !== "library" && !castFromExileForLife(s, o, pid)) return "only the top card of your library is cast for life";
    // A foretell cost is paid only for a foretold card, after the turn it was foretold (CR 702.143a).
    if (choices.alt === "foretell" && !foretoldCast(s, pid, o)) return `only a card foretold on an earlier turn can be cast for its foretell cost`;
    // Freerunning (CR 702.173a): only after an Assassin or commander of yours dealt combat damage to a player this turn.
    if (choices.alt === "freerunning" && !(s.freerunningThisTurn ?? []).includes(pid)) return "no Assassin or commander of yours has dealt combat damage to a player this turn";
    // Sneak (CR 702.190a): only during your declare blockers step, once blockers are declared (an unblocked attacker).
    if (choices.alt === "sneak" && (s.activePlayer !== pid || s.step !== "declareBlockers" || s.pending?.kind === "declareBlockers")) return "sneak works only during your declare blockers step";
    // Only one alternative cost can be applied to a spell (CR 118.9a). A permission to cast it from the graveyard that
    // names no cost (Yawgmoth's Will, Muldrotha, Lurrus) allows one (rulings), except those that say where the card is.
    // Casting a prototype card prototyped isn't an alternative cost (CR 718.3): it may be cast so without paying its mana
    // cost (rulings on Powerbalance).
    if (((via && !permissionWay(via)) || free || plotted) && choices.alt !== "prototype") return `${d.name} can't be cast for its ${choices.alt} cost this way`;
    if (via && (choices.alt === "foretell" || choices.alt === "citadel" || choices.alt === "omniscience" || choices.alt === "miracle")) return `${d.name} can't be cast for its ${choices.alt} cost from a graveyard`;
    // "If you control a Swamp, you may pay 4 life rather than pay ~'s mana cost": only while that's true (CR 601.2b).
    const cond = altCost(d, choices.alt, s, pid, o)?.if;
    if (cond && !staticConditionNow(s, cond, id, pid)) return `${d.name}'s alternative cost can't be paid now`;
    // Paying an alternative cost that has no X, X is 0 (CR 107.3b); the Shoals' "a red card with mana value X" has one.
    const paid = altCost(d, choices.alt, s, pid, o)!;
    if (x && parseManaCost(d.manaCost).hasX && !parseManaCost(paid.mana).hasX && !paid.costs?.some((c) => xCost(c) || (c.kind === "exileFromHand" && c.mvX))) return "X is 0 unless the cost you pay has X";
    if ((choices.alt === "warp" || choices.alt === "grantedWarp") && o.zone !== "hand" && !(via?.alt === "warp" && choices.alt === "warp")) return "warp works only from your hand"; // CR 702.185a
  }
  if (via?.alt && choices?.alt !== via.alt) return `${d.name} can be cast from your graveyard only for its ${via.alt} cost`;
  // A foretold card is cast for its foretell cost (CR 702.143a), unless something lets it be cast without paying.
  if (!free && o.zone === "exile" && o.mayPlay?.until === "foretell" && choices?.alt !== "foretell") return `${d.name} is foretold: cast it for its foretell cost`;
  if (isType(d, "Land")) return "lands are played, not cast";
  // Vivien, Champion of the Wilds: "you may cast it if it's a creature spell", the spell as it would be cast (its face,
  // CR 601.3e), unless something else lets it be cast from exile.
  if (!free && !via && o.zone === "exile" && o.mayPlay?.creatureOnly && ownExilePermission(s, o, pid) && !selfCastFromExile(s, o, pid) && !linkedPlayPermission(s, o, pid) && !preparedCopyCastable(s, o, pid) && linkedFreeGrant(s, o, pid) < 0) {
    const cast = choices?.face !== undefined && d.faces?.length ? faceDef(d, choices.face) : d;
    if (!isType(cast, "Creature")) return `${cast.name} can be cast from exile only as a creature spell`;
  }
  // "A spell with mana value X or less", "the same mana value": the spell as cast, a split card's half or a prototyped
  // spell, not the card (CR 202.3, 709.3, 718.3b; rulings on Powerbalance).
  const pendMv = s.pending?.kind === "castFree" && s.pending.objectId === id ? s.pending.mv : undefined;
  if (pendMv) {
    const spellMv = choices?.faceDown ? 0 : defMv(d) + (x ?? 0) * xCount(parseManaCost(d.manaCost));
    if (pendMv.exact !== undefined && spellMv !== pendMv.exact) return `the spell must have mana value ${pendMv.exact}`;
    if (pendMv.max !== undefined && spellMv > pendMv.max) return `the spell must have mana value ${pendMv.max} or less`;
  }
  const pendTypes = s.pending?.kind === "castFree" && s.pending.objectId === id ? s.pending.types : undefined;
  if (pendTypes && (choices?.faceDown || !pendTypes.some((t) => isType(d, t)))) return `the spell must be ${pendTypes.map((t) => `${/^[AEIOU]/.test(t) ? "an" : "a"} ${t.toLowerCase()}`).join(" or ")} spell`;
  // Its mana value as proposed (CR 601.2e): a face-down spell's is 0 (CR 708.2), X is the X chosen (202.3e).
  const proposedCost = parseManaCost(d.manaCost);
  const limit = castLimitProblem(s, pid, d, choices?.faceDown ? 0 : defMv(d) + (proposedCost.hasX ? (x ?? 0) * xCount(proposedCost) : 0));
  if (limit) return limit;
  // Grafdigger's Cage: "Players can't cast spells from graveyards or libraries" (the spell is cast from where the card is,
  // CR 601.2a; a card exiled from a library is cast from exile, rulings). Soulless Jailer: noncreature spells only.
  for (const b of s.battlefield) {
    const ban = abilitiesOf(s, obj(s, b)).cantCastFrom;
    if (ban && (ban.zones as string[]).includes(o.zone) && !(ban.noncreature && isType(d, "Creature"))) return `${characteristics(s, obj(s, b)).name}: players can't cast ${ban.noncreature ? "noncreature " : ""}spells from ${o.zone === "library" ? "libraries" : `${o.zone === "graveyard" ? "graveyards" : "exile"}`}`;
  }
  // Drannith Magistrate: "Your opponents can't cast spells from anywhere other than their hands", commanders from the
  // command zone included (CR 101.2).
  if (o.zone !== "hand") {
    const magistrate = s.battlefield.map((b) => obj(s, b)).find((m) => abilitiesOf(s, m).opponentsOnlyFromHand && controllerOf(s, m) !== pid);
    if (magistrate) return `${characteristics(s, magistrate).name}: opponents can't cast spells from anywhere other than their hands`;
    // Avatar's Wrath: the same until its caster's next turn.
    const until = s.handOnlyUntil?.find((r) => r.controller !== pid);
    if (until) return `${until.source}: opponents can't cast spells from anywhere other than their hands`;
  }
  // "Cast this spell only if you've cast another spell this turn" (Illusory Angel), checked as it's proposed, before it
  // counts itself (CR 601.3); the other spell needn't have resolved (rulings). Face down it has no abilities (CR 708.2).
  if (compileCard(d).castOnlyAfterAnother && !choices?.faceDown && !(s.castThisTurn ?? []).some((c) => c.player === pid)) return `${d.name} can be cast only if you've cast another spell this turn`;
  // "Cast this spell only during combat" (CR 506.8, 601.3): also when it's cast during another's resolution (rulings).
  const only = compileCard(d).castOnly;
  if (only && !choices?.faceDown && !staticConditionNow(s, only, id, pid)) return `${d.name} can be cast only ${/Cast (?:this spell|~) only ([^.\n]+)\./.exec(d.oracleText ?? "")?.[1] ?? "at certain times"}`;
  // A legendary instant or sorcery spell: only while you control a legendary creature or a legendary planeswalker (CR
  // 205.4e), whatever lets you cast it; face down it's a creature spell with no supertypes (CR 708.2).
  if (!choices?.faceDown && d.supertypes.includes("Legendary") && (isType(d, "Instant") || isType(d, "Sorcery")) && !controlsLegendaryCreatureOrPlaneswalker(s, pid)) return `you can cast ${d.name} only if you control a legendary creature or planeswalker`;
  // A card with no mana cost can't be cast by paying it (CR 118.6, 202.1b): only for an alternative cost or free.
  if (!d.manaCost && !free && !plotted && !choices?.alt && !choices?.faceDown && !via?.mana) return `${d.name} has no mana cost and can't be cast this way`;
  // Also a spell cast as an ability resolves, like cascade's (split second rulings).
  if (splitSecondOnStack(s)) return "a spell with split second is on the stack";
  if (!free && (s.priority !== pid || s.pending)) return "you don't have priority";
  // Timely Ward: with a commander among its targets; before they're chosen, a commander on the battlefield to target.
  const commanderTarget = !!compileCard(d).flashIfTargetsCommander && (targets ? targets.some((t) => t.kind === "object" && !!s.objects[t.id]?.isCommander && s.objects[t.id]!.zone === "battlefield") : s.battlefield.some((b) => obj(s, b).isCommander));
  const yoursTarget = !!compileCard(d).flashIfTargetsYours && (targets ? targets.some((t) => t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && controllerOf(s, s.objects[t.id]!) === pid) : s.battlefield.some((b) => controllerOf(s, obj(s, b)) === pid));
  // Silver Scrutiny: begun as though it had flash when an X it could be cast with is small enough (CR 601.3b), then only
  // with that X announced (601.2b); before X is announced it counts as 0.
  const smallX = compileCard(d).flashIfXAtMost !== undefined && (x ?? 0) <= compileCard(d).flashIfXAtMost!;
  const instantSpeed = choices?.alt === "sneak" || (choices?.alt === "payZero" && !!s.objects[id] && payZeroFlash(s, pid, s.objects[id]!)) || yoursTarget || smallX || (!!choices?.teamwork?.length && !!compileCard(d).teamworkFlash) || isType(d, "Instant") || d.keywords.includes("Flash") || !!compileCard(d).flashSacrifice || !!compileCard(d).flashCost || commanderTarget || flashGranted(s, pid, d, s.objects[id]?.owner);
  // Offering (CR 702.48a): with a permanent sacrificed for it; before its costs are chosen, when there's one to sacrifice.
  const offered = !!compileCard(d).offering && (choices ? choices.offering !== undefined : offeringCandidates(s, pid, id).length > 0);
  if (!free && !instantSpeed && !offered && !canActAtSorcerySpeed(s, pid)) return `${d.name} can only be cast at sorcery speed`;
  // A plotted card is cast during its owner's main phase while the stack is empty, whatever its type (CR 702.170d).
  if (plotted && !canActAtSorcerySpeed(s, pid)) return `a plotted card can only be cast at sorcery speed`;
  const spell = compileCard(d).spell;
  // A spell's colors and name are its card's (CR 702.16b, 201.2), and it's a spell ("can't be the target of spells").
  // Its mana value counts the X announced for it (CR 202.3e, rulings on Reaver Titan).
  const printedCost = parseManaCost(d.manaCost);
  const sq: SourceQuality = { colors: d.colors, types: d.types, subtypes: d.subtypes, supertypes: d.supertypes, name: d.name, spell: true, manaValue: defMv(d) + (printedCost.hasX ? (x ?? 0) * xCount(printedCost) : 0) };
  if (spell?.modal) {
    if (modes === undefined) {
      if (!canChooseModes(s, spell, pid, sq)) return `${d.name} has no mode that can be chosen`;
    } else {
      const mp = modesProblem(s, spell, modes, pid, sq, bothModes(s, pid, spell, choices));
      if (mp) return mp;
    }
  }
  // "X damage divided as you choose": the X announced (CR 601.2b, 601.2d).
  // Before targets are chosen, "with mana value X" asks for none in particular: X is announced as it's cast (601.2b).
  let specs = settleDivided(s, { targets: spellTargetSpecs(d, modes, castHow(choices)), effects: [], text: "" }, { controller: pid, sourceId: id, x: x ?? 0 }, !targets).targets;
  if (targets && manySlot(specs) >= 0) {
    // "Any number of target creatures": as many as were chosen (CR 601.2c).
    const fit = fitMany({ targets: specs, effects: [], text: "" }, targets, manyX(s, specs, pid, id, x));
    if (typeof fit === "string") return fit;
    [specs, targets] = [fit.body.targets, fit.targets];
  }
  // Splice (CR 702.47b): the spliced cards' targets come after the spell's own, and must be choosable too.
  if (choices?.splice?.length) {
    const sp = spliceProblem(s, pid, id, choices.splice);
    if (sp) return sp;
    specs = withSplices({ targets: specs, effects: [], text: "" }, splicedBodies(s, choices.splice)).targets;
  }
  if (specs.length) {
    // A spell's colors are its card's (CR 702.16b: protection stops spells of that color). Before its optional costs
    // are announced, it can be cast if it has legal targets with them paid or without (CR 702.33g).
    const any = () => hasLegalTargetsFor(s, specs, pid, sq) || (!choices && !!spell && hasGatedTargets(specs) && hasLegalTargetsFor(s, spellTargetSpecs(d, modes, ALL_PAID), pid, sq));
    const tp = targets ? targetProblem(s, specs, targets, pid, sq) : any() ? null : `${d.name} has no legal targets`;
    if (tp) return tp;
  }
  const tax = fromCommand ? commanderTax(p, o) : 0;
  // "Pay X life", "discard X cards": X can be in an additional cost, or the flashback cost paid, too (CR 107.3a).
  const manaX = parseManaCost(d.manaCost).hasX;
  const costX = costsHaveX(d, choices);
  // "Kicker {X}": X only when it's kicked (CR 107.3a, 601.2b); "X can't be 0" then.
  const kicker = compileCard(d).kicker;
  const kickX = !!choices?.kicks?.some((i) => parseManaCost(kicker?.costs[i] ?? "").hasX);
  const xp = xProblem(costX || kickX ? parseManaCost("{X}") : parseManaCost(d.manaCost), x);
  if (xp) return xp;
  if (kickX && (x ?? 0) < (kicker?.xMin ?? 0)) return "X can't be 0";
  // Mind Grind: "X can't be 0", so it can't be cast without paying its mana cost either (rulings, CR 107.3b).
  if (manaX && !costX && (x ?? 0) < (compileCard(d).xMin ?? 0)) return "X can't be 0";
  // Cast without paying an {X} in its mana cost, the only choice for X is 0 (CR 107.3b); not so for an X in an
  // additional cost (Toxic Deluge's rulings).
  if ((free || plotted) && !madness && x && manaX) return "X is 0 when a spell is cast without paying its mana cost";
  // Cast from exile without paying its mana cost, or for airbend's {2} (CR 107.3b, 701.65a; rulings on Airbending Lesson).
  const fromExile = !free && !choices?.via && o.zone === "exile" ? exilePermission(s, o, pid) : undefined;
  if (fromExile?.cost && (choices?.alt || choices?.faceDown)) return `${d.name} can be cast from exile only for ${fromExile.cost}`;
  // Ignite the Future's: with an X, its mana cost is paid instead (`orPay`).
  if (fromExile?.free && !fromExile.orPay && !choices?.alt && x && manaX) return "X is 0 when a spell is cast without paying its mana cost";
  if (fromExile?.cost && !parseManaCost(fromExile.cost).hasX && x && manaX) return "X is 0 unless the cost you pay has {X}"; // airbend's {2} (CR 107.3b)
  if (madness && x && manaX && !parseManaCost(madness).hasX) return "X is 0 unless the cost you pay has {X}";
  // Open the Way: "X can't be greater than the number of players in the game" (a player who left isn't, CR 800.4a).
  if (compileCard(d).xMaxPlayers && (x ?? 0) > livingPlayers(s).length) return "X can't be greater than the number of players in the game";
  const kp = kickProblem(d, choices?.kicks);
  if (kp) return kp;
  const or = compileCard(d).costOr;
  if (choices?.costOr !== undefined && (!or || !Number.isInteger(choices.costOr) || !or[choices.costOr])) return `${d.name} has no such cost to choose`;
  // Not chosen yet: one of the ways has to be possible (a mana one is, as far as the mana check below goes).
  if (or && choices?.costOr === undefined && or.every((c) => c.cost && extraCostProblem(s, pid, o, [c.cost], undefined, `cast ${d.name}`)))
    return `you can't pay ${d.name}'s additional cost (${or.map((c) => c.text).join(" or ")})`;
  if (via && x && manaX && via.mana && !parseManaCost(via.mana).hasX && !costX) return "X is 0 unless the cost you pay has {X}";
  const ap = additionalCostProblem(s, pid, o, choices, x ?? 0, spell?.modal ? modes : undefined, targets);
  if (ap) return ap;
  const cp = casualtyProblem(s, pid, d, choices) ?? bargainProblem(s, pid, id, d, choices) ?? offeringProblem(s, pid, id, d, choices) ?? evidenceCastProblem(s, pid, o, d, choices) ?? teamworkProblem(s, pid, d, choices, convoke) ?? conspireProblem(s, pid, id, choices, convoke) ?? harmonizeProblem(s, pid, choices, convoke) ?? giftProblem(s, pid, d, choices);
  if (cp) return cp;
  const cost = costToPay(s, pid, o, convoke, improvise, x, choices?.kicks, { ...choices, targets, modes });
  if (typeof cost === "string") return cost;
  // Hogaak, Arisen Necropolis: no mana can be spent, so convoke and delve have to pay all of its total cost (rulings).
  if (compileCard(d).noManaSpend && !costIsPaid(cost.cost, cost.extra)) return `not enough mana for ${d.name}: no mana can be spent to cast it, so convoke and delve have to pay all of its cost`;
  // The helper's mana is spent on the spell's total cost (CR 702.132a), so restrictions see that spell (CR 106.6).
  if (choices?.assisted && (choices.assist === undefined || !canPayFromPool(s, choices.assist, parseManaCost(`{${choices.assisted}}`), { spell: d })))
    return "the assisting player can't pay that much";
  if (!canPayFromPool(s, pid, cost.cost, spellUse(d, choices?.alt, cost.cost, choices, o), cost.extra, p.life)) {
    // Costs not chosen yet: a permanent offered pays part of it (CR 702.48c).
    const offerable = !choices && compileCard(d).offering ? offeringCandidates(s, pid, id) : [];
    const paid = offerable.some((offering) => {
      const c = costToPay(s, pid, o, convoke, improvise, x, undefined, { offering, targets, modes });
      return typeof c !== "string" && canPayFromPool(s, pid, c.cost, spellUse(d, undefined, c.cost, undefined, o), c.extra, p.life);
    });
    if (!paid) return `not enough mana for ${d.name}${tax ? ` (commander tax ${tax})` : ""}`;
  }
  return null;
}

/**
 * More Than Meets the Eye (CR 702.162a): a card cast converted is put on the stack with its back face up (rulings), so
 * casting it for that cost casts its back face.
 */
export function convertChoices<C extends Pick<CostChoices, "alt" | "face">>(o: GameObject, choices: C): C;
export function convertChoices<C extends Pick<CostChoices, "alt" | "face">>(o: GameObject, choices: C | undefined): C | undefined;
export function convertChoices<C extends Pick<CostChoices, "alt" | "face">>(o: GameObject, choices: C | undefined): C | undefined {
  return choices?.alt === "convert" && choices.face === undefined && o.face === undefined ? { ...choices, face: 1 } : choices;
}

/** `pid` may cast this card now only transformed, as a defeated Siege's trigger resolves (CR 310.12b). */
const siegeCastTransformed = (s: GameState, pid: PlayerId, o: GameObject) => s.pending?.kind === "castFree" && s.pending.how === "transformed" && s.pending.player === pid && s.pending.objectId === o.id;

/** Why this card can't be cast with the face `choices.face` (CR 709.3, 712.11b, 715.3), or null. */
function faceProblem(s: GameState, pid: PlayerId, o: GameObject, choices: CostChoices): string | null {
  const face = choices.face!;
  if (choices.faceDown || o.faceDown) return "a face-down spell has no face to choose";
  // A double-faced card is cast transformed only by an ability that says so (CR 712.11a, 712.11d): disturb.
  const transformedWay =
    (choices.via !== undefined && layoutOf(s, o) === "transform" && graveyardWays(s, o).some((g) => g.kind === choices.via && g.face === face)) ||
    // Cast converted for its More Than Meets the Eye cost (CR 702.162a).
    (choices.alt === "convert" && layoutOf(s, o) === "transform" && face === 1 && !!altCost(defOf(s, o), "convert")) ||
    // A defeated Siege (CR 310.12b).
    (siegeCastTransformed(s, pid, o) && layoutOf(s, o) === "transform" && face === 1);
  if (!castableFaces(s, o).includes(face) && !transformedWay) return `${defOf(s, o).name} can't be cast as that face`;
  // A card that went on an adventure may be cast from exile, but not as an Adventure again (CR 715.3d), unless
  // something else lets it be cast from there.
  if (layoutOf(s, o) === "adventure" && face === 1 && o.zone === "exile" && o.mayPlay?.until === "adventure" && ownExilePermission(s, o, pid) && !linkedPlayPermission(s, o, pid))
    return `${defOf(s, o).name} can't go on an adventure again from exile`;
  return null;
}

/**
 * The total cost of casting this card (CR 601.2f): its mana cost, plus commander tax (CR 903.8) as
 * extra generic mana, minus cost reductions like affinity (CR 702.41a), which only reduce generic mana.
 */
export function spellCost(s: GameState, pid: PlayerId, o: GameObject, x = 0, kicks: number[] = [], how: Pick<CostChoices, "via" | "buyback" | "alt" | "faceDown" | "face" | "costOr" | "sacrifice" | "bargain" | "offering" | "evidence" | "splice" | "harmonize" | "exileFromHand" | "lifeFor"> & { targets?: TargetChoice[]; modes?: number[] } = {}): { cost: ParsedCost; extra: number } {
  how = convertChoices(o, how);
  // As the face cast, only that face's mana cost (CR 709.3a, 712.11c, 715.3a).
  if (how.face !== undefined && o.face !== how.face) return asFace(s, o, how.face, () => spellCost(s, pid, o, x, kicks, how));
  // Face down, it's a 2/2 with no abilities that costs {3} to cast (CR 702.37c).
  const d = how.faceDown ? FACE_DOWN : defOf(s, o);
  // Kicker and buyback costs are additional costs, added to the total (CR 702.33a, 702.27a, 601.2f).
  const kicker = compileCard(d).kicker;
  // So are spree's costs for the chosen modes (CR 702.172a), also when it's cast without paying its mana cost (rulings).
  const spree = compileCard(d).spell?.modal?.costs;
  const spell = compileCard(d).spell;
  const entwine = spell && entwined(spell, how.modes) ? spell.modal!.entwine! : "";
  // Strive's cost for each target beyond the first is one too, paid even when it's cast without paying its mana cost (rulings).
  const strive = compileCard(d).strive?.repeat(Math.max(0, (how.targets ?? []).filter((t) => t.kind !== "none").length - 1)) ?? "";
  // Escalate's for each mode beyond the first (CR 702.120a), paid even when it's cast without paying its mana cost (rulings).
  const escalate = spell?.modal?.escalate?.mana?.repeat(Math.max(0, (how.modes?.length ?? 0) - 1)) ?? "";
  // "As an additional cost to cast this spell, waterbend {5}": always paid, with or without kicks (CR 601.2b).
  const kickCost = (kicker?.required ? kicker.costs[0]! : kicks.map((i) => kicker?.costs[i] ?? "").join("")) + (how.buyback ? (compileCard(d).buyback ?? "") : "") + costOrMana(d, how.costOr) + (spree ? (how.modes ?? []).map((i) => spree[i] ?? "").join("") : "") + entwine + strive + escalate + spliceMana(s, how.splice);
  // Cost increases and reductions from permanents (CR 601.2f), worked out for what's cast: a bestowed creature card is
  // an Aura spell (CR 702.103b, Hero of Iroas rulings).
  const mods = costModsFor(s, pid, o, how.alt === "bestow" && !o.bestowed && !how.faceDown ? bestowedDef(d) : d, x, how.lifeFor);
  // Colored increases (Ruby Leech) are added to the total cost like an additional cost, also when it's cast without
  // paying its mana cost (CR 601.2f, 118.9d).
  const moreMana = mods.moreColored.map((c) => `{${c}}`).join("");
  // "During your turn, ~ costs {2}{U}{U} less to cast" (Discontinuity): its colored part.
  for (const c of compileCard(d).costLessIf ?? []) if (c.colored && staticConditionNow(s, c.cond, o.id, pid)) mods.lessColored.push(...c.colored);
  // Khalni Hydra: "{G} less for each ...", counted as it's cast (rulings): {G} off while there's {G} to take, then {1}.
  for (const c of compileCard(d).costLessEachColored ?? []) for (let i = Math.max(0, evalAmount(s, c.count, { controller: pid, sourceId: o.id })); i > 0; i--) mods.lessColoredOrGeneric.push(c.color);
  const targetsFor = (filter: TargetSpec) =>
    !!how.targets?.some((t) => (t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && objectMatches(s, filter, obj(s, t.id), pid, false)) || (t.kind === "object" && filter.kind === "card" && s.objects[t.id]?.zone === "graveyard" && printedMatches(filter, defOf(s, obj(s, t.id)))) || (t.kind === "stack" && filter.kind === "spell" && !!filter.targetsWhat && targetsMatch(s, s.stack.find((x) => x.id === t.id)?.targets ?? [], filter.targetsWhat, pid)) || (t.kind === "stack" && filter.kind === "spell" && !filter.targetsWhat && ((x) => x?.kind === "spell" && spellMatches(s, filter, x))(s.stack.find((x) => x.id === t.id))));
  // Brush Off: "~ costs {1}{U} less to cast if it targets an instant or sorcery spell": its colored part.
  for (const c of compileCard(d).costLessIfTargets ?? []) if (c.colored && targetsFor(c.filter)) mods.lessColored.push(...c.colored);
  // Colored reductions (Morophon) after the costs are added up, on any of their colored mana (CR 601.2f, rulings).
  // Eluge's "{U} (or {1})": the {U} it can take off, the rest as generic (rulings).
  const lessColored = (c: ParsedCost) => {
    const r = reduceColored(c, mods.lessColored);
    if (!mods.lessColoredOrGeneric.length) return r;
    const r2 = reduceColored(r, mods.lessColoredOrGeneric);
    mods.less += mods.lessColoredOrGeneric.length - (r.symbols.length - r2.symbols.length);
    return r2;
  };
  // "~ costs {2} less to cast if it's bargained" (a cost reduction, CR 601.2f).
  if (how.bargain && !how.faceDown) mods.less += compileCard(d).bargainReduction ?? 0;
  // "This spell costs {2} less to cast if evidence was collected" (CR 601.2f).
  if (how.evidence && !how.faceDown) mods.less += compileCard(d).evidenceReduction ?? 0;
  // The Marches: "~ costs {2} less to cast for each card exiled this way" (CR 601.2f).
  if (how.exileFromHand?.length && !how.faceDown) mods.less += (compileCard(d).exiledReduction ?? 0) * how.exileFromHand.length;
  // Rottenmouth Viper: "~ costs {1} less to cast for each permanent sacrificed this way", its X (CR 601.2f).
  if (!how.faceDown) mods.less += (compileCard(d).sacrificedReduction ?? 0) * x;
  // "Spells your opponents cast that target ~ cost {2} more": each such permanent once, however often it's targeted.
  for (const id of new Set((how.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])))) {
    const t = s.objects[id];
    if (t?.zone === "battlefield" && controllerOf(s, t) !== pid) mods.more += abilitiesOf(s, t).targetTax ?? 0;
    // Accursed Witch: "Spells your opponents cast that target ~ cost {1} less to cast".
    if (t?.zone === "battlefield" && !how.faceDown && opponents(s, controllerOf(s, t)).includes(pid)) mods.less += abilitiesOf(s, t).targetDiscount ?? 0;
    // Spellwild Ouphe: "Spells that target ~ cost {2} less to cast", whoever casts them.
    if (t?.zone === "battlefield" && !how.faceDown) mods.less += abilitiesOf(s, t).targetDiscountAny ?? 0;
  }
  // Infectious Curse: "Spells you cast that target enchanted player cost {1} less to cast": each such Curse once.
  const playersTargeted = new Set((how.targets ?? []).flatMap((t) => (t.kind === "player" ? [t.id] : [])));
  if (playersTargeted.size && !how.faceDown)
    for (const id of s.battlefield) {
      const src = obj(s, id);
      const n = src.attachedToPlayer !== undefined && playersTargeted.has(src.attachedToPlayer) && controllerOf(s, src) === pid ? abilitiesOf(s, src).castTargetEnchantedPlayerLess : undefined;
      if (n) mods.less += n;
    }
  // Killian, Ink Duelist: "Spells you cast that target a creature cost {2} less"; Esior, Wardwing Familiar: "Spells your
  // opponents cast that target one or more commanders you control cost {3} more". Each such permanent once, with the
  // targets chosen before the cost is worked out (CR 601.2c, 601.2f).
  const targeted = [...new Set((how.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])))].map((id) => s.objects[id]).filter((t) => t?.zone === "battlefield") as GameObject[];
  if (targeted.length && !how.faceDown)
    for (const id of s.battlefield) {
      const src = obj(s, id);
      const ab = abilitiesOf(s, src);
      if (!ab.castTargetLess && !ab.commanderTargetTax && !ab.opponentsTargetTax) continue;
      const by = controllerOf(s, src);
      // Kopala, Warden of Waves: a permanent its controller controls (CR 601.2f).
      if (by !== pid && opponents(s, by).includes(pid)) for (const c of ab.opponentsTargetTax ?? []) if (!c.abilities && targeted.some((t) => controllerOf(s, t) === by && objectMatches(s, c.filter, t, by, false))) mods.more += c.n;
      if (by === pid) for (const c of ab.castTargetLess ?? []) if (targeted.some((t) => objectMatches(s, c.filter, t, by, false))) mods.less += c.n;
      if (ab.commanderTargetTax && by !== pid && opponents(s, by).includes(pid) && targeted.some((t) => t.isCommander && t.owner === by && controllerOf(s, t) === by)) mods.more += ab.commanderTargetTax;
    }
  // Hinata, Dawn-Crowned: {1} less (or more) for each target, counting each different player or object it targets once,
  // however many times the spell says "target" (rulings; CR 601.2c before 601.2f).
  const targetCount = new Set((how.targets ?? []).flatMap((t) => (t.kind === "none" ? [] : [`${t.kind}:${t.id}`]))).size;
  if (targetCount && !how.faceDown)
    for (const id of s.battlefield) {
      const src = obj(s, id);
      const per = abilitiesOf(s, src).perTargetCost;
      if (!per) continue;
      const by = controllerOf(s, src);
      for (const c of per) {
        if (c.opponents ? !opponents(s, by).includes(pid) : by !== pid) continue;
        if (c.n < 0) mods.less += -c.n * targetCount;
        else mods.more += c.n * targetCount;
      }
    }
  // "Aura spells you cast that target enchanted creature cost {3} less to cast" (Strong Back): its target is what it
  // will enchant (CR 303.4a), chosen before the cost is worked out (CR 601.2c, 601.2f).
  const auraTarget = how.targets?.[0]?.kind === "object" ? how.targets[0].id : undefined;
  const asAura = how.alt === "bestow" && !o.bestowed && !how.faceDown ? bestowedDef(d) : d;
  if (auraTarget && asAura.subtypes.includes("Aura") && !how.faceDown)
    for (const id of s.battlefield) {
      const src = obj(s, id);
      const n = src.attachedTo === auraTarget ? compileCard(defOf(s, src)).auraLessEnchanted : undefined;
      if (n && controllerOf(s, src) === pid && characteristics(s, src).hasPrintedAbilities) mods.less += n;
    }
  // "Without paying its mana cost": additional costs like kicker are still paid, and so are cost
  // increases (CR 118.9d, 601.2f).
  const madness = madnessCastOf(s, pid, o.id);
  // Cast from exile with "mana of any type can be spent to cast it" (CR 609.4b): each mana symbol but snow and
  // Phyrexian ones can be paid with any type, so it's generic.
  const exiled = !how.via ? exilePermission(s, o, pid) : undefined;
  // Tinybones: cast as its trigger resolves, "and mana of any type can be spent to cast that spell".
  const pend = s.pending;
  // Vizier of the Menagerie: any creature spell, wherever it's cast from (rulings); bestowed, it's an Aura spell (CR 702.103b).
  const creatureAnyType = asAura.types.includes("Creature") && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).spendAnyTypeCreatureSpells);
  const anyTypeNow = !!exiled?.anyType || (pend?.kind === "castFree" && pend.player === pid && pend.objectId === o.id && !!pend.anyType) || creatureAnyType;
  const anyType = (c: ParsedCost): ParsedCost => (anyTypeNow ? { ...c, symbols: c.symbols.map((y) => (y.kind === "colored" || y.kind === "hybrid" || y.kind === "twoHybrid" ? { kind: "generic" as const, amount: 1 } : y)) } : c);
  // "You may play that card without paying its mana cost" (Intet, CR 118.9): additional costs are still paid.
  // Prototyped isn't an alternative cost (CR 718.3): it's still free.
  const realAlt = how.alt && how.alt !== "prototype";
  // "With or without paying its mana cost" (Ignite the Future): paying it only to choose an X other than 0.
  const freeFromExile = !!exiled?.free && !how.faceDown && !realAlt && !(exiled.orPay && x > 0 && parseManaCost(d.manaCost).hasX);
  // "A spell cast this way costs {2} more" (Soul Partition): an increase (CR 601.2f).
  if (exiled?.more && !madness && freeCastOf(s, pid) !== o.id) mods.more += exiled.more;
  // A "Kicker {X}" is still paid, with its X (CR 118.9d).
  if ((freeCastOf(s, pid) === o.id && !madness) || (!how.faceDown && !realAlt && plottedCast(s, pid, o)) || freeFromExile) {
    const kicked = anyType(lessColored(parseManaCost(kickCost + moreMana)));
    const kx = x * xCount(kicked);
    // From the command zone (Geode Golem): the commander tax is an additional cost, still paid (CR 903.8, 118.9d).
    const freeTax = o.zone === "command" ? commanderTax(player(s, pid), o) : 0;
    return costAtLeast(s, { cost: kx ? splitGeneric(kicked, 0).cost : kicked, extra: Math.max(0, mods.more - mods.less) + freeTax + (kx ? splitGeneric(kicked, kx).extra : 0) });
  }
  const tax = o.zone === "command" ? commanderTax(player(s, pid), o) : 0;
  // {X} is generic mana, paid once for each {X} (CR 107.4b); reductions can take it down too (CR 601.2f).
  // Flashback and escape pay their cost instead of the mana cost (an alternative cost, CR 118.9).
  // So do evoke, dash, bestow and madness (CR 702.74a, 702.109a, 702.103a, 702.35a).
  // Airbend's "{2} rather than its mana cost" (CR 701.65a), an alternative cost.
  const airbent = !how.faceDown && !how.alt && freeCastOf(s, pid) !== o.id ? exiled?.cost : undefined;
  // From a graveyard with a permission that names no cost, an alternative cost replaces the mana cost (CastFromGraveyard).
  const way = graveyardWay(s, o, how.via, pid);
  const wayMana = way && !(how.alt && permissionWay(way)) ? way.mana : undefined;
  const base = how.faceDown ? "{3}" : (madness ?? wayMana ?? altCost(d, how.alt, s, pid, o)?.mana ?? airbent ?? d.manaCost);
  const mana = anyType(lessColored(parseManaCost(base + kickCost + moreMana)));
  const total = splitGeneric(mana, tax + x * xCount(mana));
  let less = mods.less;
  for (const a of compileCard(d).costLess ?? []) less += Math.max(0, evalAmount(s, a, { controller: pid, sourceId: o.id }));
  if (way?.less !== undefined && wayMana !== undefined) less += Math.max(0, evalAmount(s, way.less, { controller: pid, sourceId: o.id }));
  // Risen Executioner: more generic mana when cast this way (CR 601.2f).
  const wayMore = way?.more !== undefined ? Math.max(0, evalAmount(s, way.more, { controller: pid, sourceId: o.id })) : 0;
  // Catalyst Stone: "Flashback costs you pay cost {2} less. Flashback costs your opponents pay cost {2} more.": the flashback
  // cost, a card's own or one an effect gave it (CR 702.34a, 601.2f).
  let flashbackMore = 0;
  if (wayMana !== undefined && (way!.kind === "flashback" || way!.kind === "grantedFlashback"))
    for (const id of s.battlefield) {
      const a = abilitiesOf(s, obj(s, id));
      const by = controllerOf(s, obj(s, id));
      if (by === pid) less += a.flashbackLess ?? 0;
      else if (opponents(s, by).includes(pid)) flashbackMore += a.flashbackTax ?? 0;
    }
  for (const c of compileCard(d).costLessIf ?? []) if (staticConditionNow(s, c.cond, o.id, pid)) less += c.n;
  // Emerge (CR 702.119a): the total cost is reduced by the sacrificed creature's mana value, in generic mana only. It's
  // chosen as the emerge cost is (702.119c), so it's known when the total cost is (601.2f).
  const emerged = how.alt === "emerge" && how.sacrifice?.[0] !== undefined ? s.objects[how.sacrifice[0]] : undefined;
  if (emerged?.zone === "battlefield") less += defMv(defOf(s, emerged));
  // Offering (CR 702.48c): the sacrificed permanent's mana cost, colored mana included.
  const offered = how.offering !== undefined && !how.faceDown ? s.objects[how.offering] : undefined;
  let reducedCost = total.cost;
  if (offered?.zone === "battlefield") {
    const r = reduceSymbolsByManaCost(total.cost, parseManaCost(offered.faceDown ? "" : (defOf(s, offered).manaCost ?? "")));
    reducedCost = r.cost;
    less += r.generic;
  }
  // Harmonize (CR 702.180a-b): less generic mana equal to the tapped creature's power (none for 0 or less).
  const harmonizer = how.via === "harmonize" && how.harmonize !== undefined ? s.objects[how.harmonize] : undefined;
  if (harmonizer?.zone === "battlefield") less += Math.max(0, power(s, harmonizer));
  // "You may cast ~ as though it had flash if you pay {2} more to cast it": cast when a sorcery couldn't be, it costs more
  // (CR 601.2f). Not when something else lets it be cast then: a resolving madness trigger, or Flash from elsewhere.
  const flashCost = compileCard(d).flashCost;
  const more = flashCost && !madness && !isType(d, "Instant") && !d.keywords.includes("Flash") && !flashGranted(s, pid, d, o.owner) && !canActAtSorcerySpeed(s, pid) ? flashCost : 0;
  // "Costs {3} less to cast if it targets a tapped creature": the targets are chosen before the cost is (CR 601.2c, 601.2f).
  // "... if it targets a spell or ability that targets a creature you control with power 7 or greater" (Not of This
  // World): what that spell or ability targets now (rulings).
  for (const c of compileCard(d).costLessIfTargets ?? []) if (targetsFor(c.filter)) less += c.n;
  // Increases first, then reductions, which only take off generic mana (CR 601.2f, 118.7a).
  return costAtLeast(s, { cost: reducedCost, extra: Math.max(0, total.extra + mods.more + more + flashbackMore + wayMore - less) });
}

/**
 * Trinisphere: "each spell that would cost less than three mana to cast costs three mana to cast", applied to the total
 * cost once it's determined, increases and reductions included, before it's locked in (CR 601.2f, rulings); a spell cast
 * without paying its mana cost too. The difference is generic mana. Its mana value doesn't change.
 */
function costAtLeast(s: GameState, r: { cost: ParsedCost; extra: number }): { cost: ParsedCost; extra: number } {
  const min = spellCostFloor(s);
  const mana = manaValue(r.cost) + r.extra;
  return mana < min ? { cost: r.cost, extra: r.extra + min - mana } : r;
}

/**
 * What permanents' static abilities add to and take off a spell's cost as `pid` casts it: "Creature
 * spells you cast cost {1} less", "Noncreature spells cost {1} more" (CR 601.2f). The spell is checked
 * as it will be on the stack, X included in its mana value (CR 202.3e).
 */
/** Commanders in the command zone with an eminence cost reduction (The Ur-Dragon), which works there (CR 113.6). */
export function eminenceCommanders(s: GameState): GameObject[] {
  return s.players.filter((p) => !p.lost).flatMap((p) => p.command.map((id) => s.objects[id]!)).filter((o) => o?.zone === "command" && !o.emblem && !!compileCard(defOf(s, o)).costMods?.some((m) => m.eminence));
}

function costModsFor(s: GameState, pid: PlayerId, o: GameObject, d: CardDef, x: number, lifeFor?: ObjectId[]): { more: number; less: number; moreColored: Color[]; lessColored: Color[]; lessColoredOrGeneric: Color[]; lifeOffers: { id: ObjectId; life: number }[] } {
  let [more, less] = [0, 0];
  const moreColored: Color[] = [];
  const lessColored: Color[] = [];
  const lessColoredOrGeneric: Color[] = [];
  const lifeOffers: { id: ObjectId; life: number }[] = [];
  const mv = defMv(d) + x * xCount(parseManaCost(d.manaCost));
  // Emblems' too, which work in the command zone (CR 114.4).
  for (const src of [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s), ...eminenceCommanders(s)]) {
    // Its own or granted ones (Acolyte of Bahamut's "The first Dragon spell you cast each turn costs {2} less").
    const mods = abilitiesOf(s, src).costMods;
    if (!mods) continue;
    const inCommand = src.zone === "command";
    const c = inCommand ? { controller: src.owner } : characteristics(s, src);
    for (const m of mods) {
      // In the command zone only eminence works, controlled by its owner (CR 113.6, 903.3).
      if (inCommand && !m.eminence) continue;
      if (m.other && src.id === o.id) continue;
      if (m.who === "you" ? pid !== c.controller : m.who === "opponents" ? pid === c.controller : m.who === "enchanted" ? src.attachedToPlayer !== pid : false) continue;
      if (m.turn === "notCasters" ? s.activePlayer === pid : m.turn && (s.activePlayer === c.controller) !== (m.turn === "yours")) continue;
      if (m.fromGraveyard && !m.fromZones && o.zone !== "graveyard") continue;
      if (m.fromZones && !m.fromZones.includes(o.zone as "graveyard" | "exile")) continue;
      if (m.notFromHand && o.zone === "hand") continue;
      // "From your graveyard": a card cast from another player's graveyard isn't (a card is in its owner's, CR 404.2).
      if (m.fromGraveyard && o.zone === "graveyard" && o.owner !== pid) continue;
      if (m.notOwned && o.owner === pid) continue;
      // Semblance Anvil: a card type (CR 205.2a) the spell shares with a card exiled with it (CR 607.2a).
      if (m.sharesTypeWithLinked && !linkedExileCards(s, src).some((x) => defOf(s, obj(s, x)).types.some((t) => d.types.includes(t)))) continue;
      if (m.if && !staticConditionNow(s, m.if, src.id, c.controller)) continue;
      const { manaValue: range, power: pw, toughnessAbovePower: tough, ...rest } = bindChosen(m.filter, src.chosen);
      if (!printedMatches(rest, d)) continue;
      // "With toughness greater than their power" (Doran, Besieged by Time): the spell's own, a "*" by its
      // characteristic-defining ability (CR 604.3), as for power below.
      if (tough) {
        const [p, t] = (["power", "toughness"] as const).map((k) => (/^\d+$/.test(d[k] ?? "") ? Number(d[k]) : characteristics(s, o)[k]));
        if (!(t! > p!)) continue;
      }
      if (range && !((range.min === undefined || mv >= range.min) && (range.max === undefined || mv <= range.max))) continue;
      // "With power 4 or greater" (Goreclaw): the spell's own power, a "*" by its characteristic-defining ability (CR
      // 604.3); not counters or effects it would have on the battlefield (rulings).
      if (pw) {
        const p = /^\d+$/.test(d.power ?? "") ? Number(d.power) : characteristics(s, o).power;
        if ((pw.min !== undefined && p < pw.min) || (pw.max !== undefined && p > pw.max)) continue;
      }
      // "The first creature spell you cast each turn": the creature spells you cast earlier this turn count, even before this permanent was on the battlefield (rulings).
      if (m.nth && (s.castThisTurn ?? []).filter((c) => c.player === pid && printedMatches(rest, s.cards[c.card]!)).length !== m.nth - 1) continue;
      // The Defilers: offered as an additional cost, and only then a reduction.
      if (m.payLife) {
        if (!lifeOffers.some((l) => l.id === src.id)) lifeOffers.push({ id: src.id, life: m.payLife });
        if (!lifeFor?.includes(src.id)) continue;
      }
      if (m.colored) {
        lessColored.push(...m.colored);
        continue;
      }
      if (m.moreColored) {
        moreColored.push(...m.moreColored);
        continue;
      }
      if (m.coloredOrGeneric) {
        const k = Math.max(0, m.times ? evalAmount(s, m.times, { controller: c.controller, sourceId: src.id }) : 0);
        for (let i = 0; i < k; i++) lessColoredOrGeneric.push(m.coloredOrGeneric);
        continue;
      }
      // Cemetery Prowler: once for each card type of the spell among the cards exiled with it (rulings: not per card).
      const shared = m.perTypeSharedWithLinked ? new Set(linkedExileCards(s, src).flatMap((x) => defOf(s, obj(s, x)).types)) : undefined;
      const n = shared ? m.n * d.types.filter((t) => shared.has(t)).length : m.times ? m.n * Math.max(0, evalAmount(s, m.times, { controller: m.timesForCaster ? pid : c.controller, sourceId: src.id })) : m.n;
      if (n > 0) more += n;
      else less -= n;
    }
  }
  // "Spells you cast this turn cost {2} less to cast" (Urza, Planeswalker): from resolved spells and abilities (CR 611.2a).
  // "Spells your opponents cast" (Elspeth Conquers Death): the opponents of who it's from.
  for (const c of s.costModsThisTurn ?? []) {
    const m = c.mod;
    if (!costModThisTurnApplies(s, c, pid, d, mv)) continue;
    // Saheeli, the Gifted's affinity: counted as this spell's cost is determined (CR 601.2f), for who it's from.
    const n = m.times ? m.n * Math.max(0, evalAmount(s, m.times, { controller: c.player, sourceId: o.id })) : m.n;
    if (n > 0) more += n;
    else less -= n;
  }
  return { more, less, moreColored, lessColored, lessColoredOrGeneric, lifeOffers };
}

/** Does a cost change from a resolved spell or ability (GameState.costModsThisTurn) apply to `d` as `pid` casts it? */
function costModThisTurnApplies(s: GameState, c: NonNullable<GameState["costModsThisTurn"]>[number], pid: PlayerId, d: CardDef, mv: number): boolean {
  const m = c.mod;
  if (m.who === "opponents" ? c.player === pid || !opponents(s, c.player).includes(pid) : c.player !== pid) return false;
  const { manaValue: range, ...rest } = m.filter;
  if (!printedMatches(rest, d)) return false;
  return !range || ((range.min === undefined || mv >= range.min) && (range.max === undefined || mv <= range.max));
}

/**
 * The Defilers: the permanents whose "As an additional cost to cast green permanent spells, you may pay 2 life" applies
 * to casting this card (CR 601.2b), and how much life each asks.
 */
export function lifeCostOffers(s: GameState, pid: PlayerId, id: ObjectId, x = 0): { id: ObjectId; life: number }[] {
  const o = obj(s, id);
  return costModsFor(s, pid, o, defOf(s, o), x).lifeOffers;
}

/**
 * Does `o`, cast by `pid` as it is now (its face being cast), have convoke (CR 702.51)? Its own, or from a permanent
 * `pid` controls ("noncreature spells you cast have convoke"), checked by its printed characteristics as a spell.
 */
export function hasConvoke(s: GameState, pid: PlayerId, o: GameObject): boolean {
  const d = defOf(s, o);
  if (compileCard(d).convoke) return true;
  if (player(s, pid).nextSpellConvoke === s.turn) return true;
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    // "From exile": where it's cast from, the zone it's still in while it's paid for (CR 601.2a, 601.2g-h).
    return controllerOf(s, p) === pid && (abilitiesOf(s, p).spellsHaveConvoke ?? []).some((g) => printedMatches(g.filter, d) && (!g.fromExile || (o.zone === "stack" ? o.castFrom : o.zone) === "exile") && (!g.firstEachTurn || firstOfKindThisTurn(s, pid, o, g.filter)));
  });
}

/**
 * Peri Brown's "the first historic spell you cast each turn": no other spell `pid` cast this turn matched `filter`. `o`
 * itself is in TurnLog's list once it has been cast (its castNth is set then, CR 601.2i).
 */
function firstOfKindThisTurn(s: GameState, pid: PlayerId, o: GameObject, filter: TargetSpec): boolean {
  const n = (s.castThisTurn ?? []).filter((c) => c.player === pid && !!s.cards[c.card] && printedMatches(filter, s.cards[c.card]!)).length;
  return n <= (o.zone === "stack" && o.castNth !== undefined ? 1 : 0);
}

/** Does `o`, cast by `pid`, have improvise (CR 702.126)? Its own, or from "nonartifact spells you cast have improvise". */
export function hasImprovise(s: GameState, pid: PlayerId, o: GameObject): boolean {
  const d = defOf(s, o);
  if (compileCard(d).improvise) return true;
  if (player(s, pid).nextSpellImprovise === s.turn) return true;
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    return controllerOf(s, p) === pid && (abilitiesOf(s, p).spellsHaveImprovise ?? []).some((g) => printedMatches(g.filter, d) && (!g.firstEachTurn || firstOfKindThisTurn(s, pid, o, g.filter)));
  });
}

/** Nothing left of a cost: no symbols but {0}, no extra generic mana. */
export const costIsPaid = (cost: ParsedCost, extra: number) => extra <= 0 && cost.symbols.every((sym) => sym.kind === "generic" && sym.amount === 0);

/** Does `o`, cast by `pid`, have delve (CR 702.66)? Its own, or from "spells you cast have delve" (Teval, Arbiter of Virtue). */
export function hasDelve(s: GameState, pid: PlayerId, o: GameObject): boolean {
  const d = defOf(s, o);
  if (compileCard(d).delve) return true;
  return s.battlefield.some((id) => {
    const p = obj(s, id);
    return controllerOf(s, p) === pid && (abilitiesOf(s, p).spellsHaveDelve ?? []).some((g) => printedMatches(g.filter, d));
  });
}

/**
 * What's left to pay for casting this card after any convoke creatures (CR 702.51) and improvise
 * artifacts (CR 702.126), as a cost plus extra generic mana. A string says why they can't be used.
 */
function costToPay(s: GameState, pid: PlayerId, o: GameObject, convoke?: ObjectId[], improvise?: ObjectId[], x?: number, kicks?: number[], how: CostChoices & { targets?: TargetChoice[]; modes?: number[] } = {}): { cost: ParsedCost; extra: number } | string {
  const d = defOf(s, o);
  let { cost, extra } = spellCost(s, pid, o, x, kicks, how);
  if (convoke?.length) {
    if (!hasConvoke(s, pid, o)) return `${d.name} doesn't have convoke`;
    const problem = convokeProblem(s, pid, convoke);
    if (problem) return problem;
    const reduced = convokeReduce(cost, extra, convoke.map((c) => characteristics(s, obj(s, c)).colors));
    if (!reduced) return `that's more creatures than ${d.name}'s cost has mana for`;
    [cost, extra] = [reduced, 0];
  }
  if (improvise?.length) {
    if (!hasImprovise(s, pid, o)) return `${d.name} doesn't have improvise`;
    const problem = improviseProblem(s, pid, improvise, convoke ?? []);
    if (problem) return problem;
    const reduced = payGenericWith(cost, extra, improvise.length);
    if (!reduced) return `that's more artifacts than ${d.name}'s cost has generic mana for`;
    ({ cost, extra } = reduced);
  }
  if (how.waterbend?.length) {
    // Waterbend as an additional cost (CR 701.67a): up to the waterbend cost's own generic mana, if it's being paid.
    const k = compileCard(d).kicker;
    const cap = k?.waterbend !== undefined && (k.required || kicks?.includes(0)) ? k.waterbend : 0;
    if (!cap) return `${d.name} has no waterbend cost being paid`;
    const problem = castWaterbendProblem(s, pid, how.waterbend, cap, [...(convoke ?? []), ...(improvise ?? []), ...(how.tap ?? []), ...(how.teamwork ?? []), ...(how.conspire ?? []), ...(how.harmonize !== undefined ? [how.harmonize] : []), ...(how.sacrifice ?? [])]);
    if (problem) return problem;
    const reduced = payGenericWith(cost, extra, how.waterbend.length);
    if (!reduced) return `that's more artifacts and creatures than ${d.name}'s cost has generic mana for`;
    ({ cost, extra } = reduced);
  }
  if (how.assisted) {
    // The assisting player pays for generic mana only (CR 702.132a).
    const reduced = payGenericWith(cost, extra, how.assisted);
    if (!reduced) return `that's more than ${d.name}'s generic mana`;
    ({ cost, extra } = reduced);
  }
  if (how.delve?.length) {
    // Delve pays generic mana only, after the total cost is worked out (CR 702.66a-b).
    if (!hasDelve(s, pid, o)) return `${d.name} doesn't have delve`;
    const problem = delveProblem(s, pid, o, how.delve, how.exileCards ?? []);
    if (problem) return problem;
    const reduced = payGenericWith(cost, extra, how.delve.length);
    if (!reduced) return `that's more cards than ${d.name}'s cost has generic mana for`;
    ({ cost, extra } = reduced);
  }
  return { cost, extra };
}

/** Artifacts and creatures tapped to waterbend as a spell is cast: untapped ones you control, each once, no more than `cap` (CR 701.67a). */
function castWaterbendProblem(s: GameState, pid: PlayerId, ids: ObjectId[], cap: number, used: ObjectId[]): string | null {
  if (ids.length > cap) return `waterbend {${cap}} can be paid by tapping no more than ${cap} artifact${cap === 1 ? "" : "s"} or creature${cap === 1 ? "" : "s"}`;
  if (new Set(ids).size !== ids.length) return "each artifact or creature can only be tapped once to waterbend";
  for (const id of ids) {
    const c = s.objects[id];
    if (!c || c.zone !== "battlefield" || controllerOf(s, c) !== pid || !(objIsType(s, c, "Artifact") || objIsType(s, c, "Creature"))) return "only artifacts and creatures you control can be tapped to waterbend";
    if (c.tapped || used.includes(id)) return `${nameOf(s, id)} is already tapped`;
  }
  return null;
}

/** Cards exiled for delve: other cards in your graveyard, each once, not also exiled for another cost. */
function delveProblem(s: GameState, pid: PlayerId, spell: GameObject, ids: ObjectId[], exiled: ObjectId[]): string | null {
  if (new Set(ids).size !== ids.length) return "each card can only be exiled once for delve";
  for (const id of ids) {
    const c = s.objects[id];
    if (!c || c.zone !== "graveyard" || c.owner !== pid || id === spell.id) return "delve exiles cards from your graveyard";
    if (exiled.includes(id)) return `${nameOf(s, id)} is already being exiled`;
  }
  return null;
}

/**
 * How many cards delve could exile for this spell: one for each generic mana in its total cost
 * (CR 702.66a-b, rulings), no more than the other cards in your graveyard. Zero without delve.
 */
export function delveRoom(s: GameState, pid: PlayerId, id: ObjectId, choices: CostChoices = {}, x = 0): number {
  const o = obj(s, id);
  if (!hasDelve(s, pid, o)) return 0;
  const { cost, extra } = spellCost(s, pid, o, x, choices.kicks, choices);
  const generic = splitGeneric(cost, extra).extra;
  const pool = player(s, pid).graveyard.filter((c) => c !== id && !choices.exileCards?.includes(c)).length;
  return Math.min(generic, pool);
}

/** A card's own alternative cost of that kind; with `s` and the caster, Fist of Suns' {W}{U}{B}{R}{G} too (CR 118.9). */
export function altCost(d: CardDef, alt?: AltCostKind, s?: GameState, pid?: PlayerId, /** The card being cast: a foretold one's cost from Dream Devourer. */ o?: GameObject): NonNullable<CompiledCard["altCosts"]>[number] | undefined {
  if (alt === "foretell") {
    const mana = s && o ? foretellCostOf(s, o, d, pid) : compileCard(d).foretell;
    return mana ? { kind: "foretell", mana } : undefined;
  }
  if (alt === "wubrg") return s && pid !== undefined && controlsPayWUBRG(s, pid) ? { kind: "wubrg", mana: "{W}{U}{B}{R}{G}" } : undefined;
  // Omniscience: nothing at all, for a spell cast from the hand (checked in castProblem).
  if (alt === "omniscience") return s && pid !== undefined && controlsPayWUBRG(s, pid, "castFromHandFree") ? { kind: "omniscience", mana: "", text: "without paying its mana cost" } : undefined;
  // Court of Locthwain: nothing at all, for a card exiled with it (castProblem checks the card is one).
  if (alt === "linkedFree") return s && pid !== undefined && s.linkedFreeCasts?.some((g) => g.player === pid && g.turn === s.turn) ? { kind: "linkedFree", mana: "", text: "without paying its mana cost" } : undefined;
  // Bolas's Citadel: the top card of the caster's library, for life equal to its mana value (X is 0, CR 107.3b).
  if (alt === "citadel") {
    const top = s && pid !== undefined ? s.objects[player(s, pid).library[0] ?? ""] : undefined;
    // Valgavoth's exiled cards too (castProblem checks the card is one).
    // Nashi's exiled cards: their own permission says so.
    const valgavoth = s && pid !== undefined && (s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).playLinkedForLife) || s.turnOrder.some((q) => player(s, q).exile.some((id) => obj(s, id).mayPlay?.life && obj(s, id).mayPlay?.player === pid)));
    if (!valgavoth && (!top || !mayPlayFromTop(s!, top, pid!, "life"))) return undefined;
    const n = manaValue(parseManaCost(d.manaCost));
    return { kind: "citadel", mana: "", costs: [{ kind: "payLife", n }], text: `pay ${n} life` };
  }
  // As Foretold, Rooftop Storm: {0}, while one of `pid`'s permanents lets them (castProblem checks it's for this spell).
  if (alt === "payZero") return s && pid !== undefined && s.battlefield.some((id) => (controllerOf(s, obj(s, id)) === pid || compileCard(defOf(s, obj(s, id))).payZero?.eachPlayerFirst || compileCard(defOf(s, obj(s, id))).payZero?.anyPlayer) && compileCard(defOf(s, obj(s, id))).payZero && characteristics(s, obj(s, id)).hasPrintedAbilities) ? { kind: "payZero", mana: "{0}" } : undefined;
  // Demon of Fate's Design: life equal to the spell's mana value, X at 0 (rulings); castProblem checks it covers this spell.
  if (alt === "lifeForMv") {
    if (!s || pid === undefined || !s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && compileCard(defOf(s, obj(s, id))).payZero?.life && characteristics(s, obj(s, id)).hasPrintedAbilities)) return undefined;
    const n = manaValue(parseManaCost(d.manaCost));
    return { kind: "lifeForMv", mana: "", costs: [{ kind: "payLife", n }], text: `pay ${n} life` };
  }
  if (alt === "evidence") {
    const n = s && pid !== undefined ? payEvidenceOf(s, pid) : undefined;
    return n === undefined ? undefined : { kind: "evidence", mana: "", costs: [{ kind: "collectEvidence", n }], text: `collect evidence ${n}` };
  }
  // Prowl (CR 702.76a): the card's own, else one a permanent of `pid`'s gives it ("Dinosaur spells you cast have prowl").
  if (alt === "prowl") return compileCard(d).altCosts?.find((a) => a.kind === alt) ?? (s && pid !== undefined ? grantedProwl(s, pid, d) : undefined);
  if (alt === "grantedWarp") return s && pid !== undefined ? grantedWarp(s, pid, d) : undefined;
  return alt ? compileCard(d).altCosts?.find((a) => a.kind === alt) : undefined;
}

/**
 * The warp cost a permanent `pid` controls gives this card in their hand (Tannuk, Steadfast Second; CR 702.185a), checked
 * by the card's characteristics there. Several: the cheapest by mana value (the same mana otherwise).
 */
function grantedWarp(s: GameState, pid: PlayerId, d: CardDef): NonNullable<CompiledCard["altCosts"]>[number] | undefined {
  if (!["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"].some((t) => isType(d, t))) return undefined;
  const costs = s.battlefield.flatMap((id) => {
    const p = obj(s, id);
    return controllerOf(s, p) === pid ? (abilitiesOf(s, p).handWarp ?? []).filter((x) => printedMatches(x.filter, d)).map((x) => x.mana) : [];
  });
  const mana = costs.sort((a, b) => manaValue(parseManaCost(a)) - manaValue(parseManaCost(b)))[0];
  return mana ? { kind: "grantedWarp", mana } : undefined;
}

/** The prowl cost a permanent `pid` controls gives this spell, checked by its characteristics as a spell (CR 702.76a). */
function grantedProwl(s: GameState, pid: PlayerId, d: CardDef): NonNullable<CompiledCard["altCosts"]>[number] | undefined {
  for (const id of s.battlefield) {
    const p = obj(s, id);
    if (controllerOf(s, p) !== pid) continue;
    const g = (abilitiesOf(s, p).spellsHaveProwl ?? []).find((x) => printedMatches(x.filter, d));
    if (g) return { kind: "prowl", mana: g.mana, if: { kind: "prowl" } };
  }
  return undefined;
}

const controlsPayWUBRG = (s: GameState, pid: PlayerId, what: "payWUBRG" | "castFromHandFree" = "payWUBRG") =>
  s.battlefield.some((id) => {
    const o = obj(s, id);
    if (!compileCard(defOf(s, o))[what]) return false;
    const c = characteristics(s, o);
    return c.controller === pid && c.hasPrintedAbilities;
  }) ||
  // Tamiyo, Field Researcher's emblem (CR 114.4).
  (what === "castFromHandFree" && liveEmblems(s).some((e) => e.controller === pid && compileCard(defOf(s, e)).castFromHandFree));

/**
 * Conspiracy Unraveler's "You may collect evidence 10 rather than pay the mana cost for spells you cast": the N, the
 * smallest if `pid` controls several (each is the same choice, CR 118.9).
 */
function payEvidenceOf(s: GameState, pid: PlayerId): number | undefined {
  let best: number | undefined;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const n = compileCard(defOf(s, o)).payEvidence;
    if (n === undefined) continue;
    const c = characteristics(s, o);
    if (c.controller === pid && c.hasPrintedAbilities && (best === undefined || n < best)) best = n;
  }
  return best;
}

/**
 * The permanent of `pid`'s whose "you may pay {0} rather than pay the mana cost" covers this spell now (As Foretold, Rooftop
 * Storm, Darksteel Monolith), or any player's Weftwalking, X counted as 0 (rulings): one with no once-each-turn limit
 * first, then the first unused one.
 */
export function payZeroSource(s: GameState, pid: PlayerId, o: GameObject, life = false): GameObject | undefined {
  const ok = payZeroSources(s, pid, o, life);
  return ok.find((p) => !compileCard(defOf(s, p)).payZero!.once) ?? ok[0];
}

/** Every permanent whose "pay {0} rather than the mana cost" (or life, `life`) covers `pid`'s spell `o` now. */
function payZeroSources(s: GameState, pid: PlayerId, o: GameObject, life = false): GameObject[] {
  const d = defOf(s, o);
  if (isType(d, "Land")) return [];
  const used = s.turnLog?.payZeroUsed ?? [];
  const ok = s.battlefield.map((id) => obj(s, id)).filter((p) => {
    const z = compileCard(defOf(s, p)).payZero;
    if (!z || !!z.life !== life || (controllerOf(s, p) !== pid && !z.eachPlayerFirst && !z.anyPlayer) || !characteristics(s, p).hasPrintedAbilities) return false;
    // Weftwalking: during `pid`'s own turn, before they've cast a spell this turn.
    if (z.eachPlayerFirst && (s.activePlayer !== pid || (s.castThisTurn ?? []).some((c) => c.player === pid))) return false;
    if (z.once && used.includes(`${p.id}@${p.zoneChanges ?? 0}`)) return false;
    if (z.fromHand && o.zone !== "hand") return false;
    if (z.fromExile && o.zone !== "exile") return false;
    if (z.yourTurn && s.activePlayer !== pid) return false;
    if (z.fromHandOrTop && o.zone !== "hand" && !(o.zone === "library" && player(s, pid).library[0] === o.id)) return false;
    if (z.filter && !printedMatches(z.filter, d)) return false;
    return z.maxMvCounters === undefined || defMv(d) <= (p.counters[z.maxMvCounters] ?? 0);
  });
  return ok;
}

/** Aluren: a "without paying their mana costs and as though they had flash" that covers this spell now (the flash only that way, rulings). */
export const payZeroFlash = (s: GameState, pid: PlayerId, o: GameObject) => payZeroSources(s, pid, o).some((p) => compileCard(defOf(s, p)).payZero!.flash);

/** The alternative costs `pid` could cast this card for: its own, Fist of Suns' and Conspiracy Unraveler's (CR 118.9). */
export function altCostsFor(s: GameState, pid: PlayerId, o: GameObject): NonNullable<CompiledCard["altCosts"]> {
  const own = compileCard(defOf(s, o)).altCosts ?? [];
  if (isType(defOf(s, o), "Land")) return own;
  const prowl = own.some((a) => a.kind === "prowl") ? undefined : grantedProwl(s, pid, defOf(s, o));
  const warp = o.zone === "hand" && o.owner === pid ? grantedWarp(s, pid, defOf(s, o)) : undefined;
  return [...own, ...(prowl ? [prowl] : []), ...(warp ? [warp] : []), ...(controlsPayWUBRG(s, pid) ? [{ kind: "wubrg" as const, mana: "{W}{U}{B}{R}{G}" }] : []), ...(payZeroSource(s, pid, o) ? [{ kind: "payZero" as const, mana: "{0}" }] : []), ...(payZeroSource(s, pid, o, true) ? [altCost(defOf(s, o), "lifeForMv", s, pid)!] : []), ...(o.zone === "hand" ? [altCost(defOf(s, o), "omniscience", s, pid)].filter((a) => !!a) : []), ...(linkedFreeGrant(s, o, pid) >= 0 ? [altCost(defOf(s, o), "linkedFree", s, pid)!] : []), ...(["evidence" as const].flatMap((k) => altCost(defOf(s, o), k, s, pid) ?? [])), ...(o.zone === "library" || castFromExileForLife(s, o, pid) ? [altCost(defOf(s, o), "citadel", s, pid)].filter((a) => !!a) : [])];
}

/** Artifacts tapped for improvise: untapped artifacts you control, each once, not also tapped for convoke. */
function improviseProblem(s: GameState, pid: PlayerId, ids: ObjectId[], convoke: ObjectId[]): string | null {
  if (new Set(ids).size !== ids.length) return "each artifact can only be tapped once to improvise";
  for (const id of ids) {
    const c = s.objects[id];
    if (!c || c.zone !== "battlefield" || controllerOf(s, c) !== pid || !objIsType(s, c, "Artifact")) return "only artifacts you control can improvise";
    if (c.tapped || convoke.includes(id)) return `${nameOf(s, id)} is already tapped`;
  }
  return null;
}

/**
 * Creatures tapped for convoke or crew: untapped creatures you control, each once. Neither is a
 * {T} cost, so summoning sickness doesn't matter (CR 302.6 covers only {T} and {Q} abilities).
 */
function tapCreaturesProblem(s: GameState, pid: PlayerId, ids: ObjectId[], what: string): string | null {
  if (new Set(ids).size !== ids.length) return `each creature can only be tapped once to ${what}`;
  for (const id of ids) {
    const c = s.objects[id];
    if (!c || c.zone !== "battlefield" || controllerOf(s, c) !== pid || !objIsType(s, c, "Creature")) return `only creatures you control can ${what}`;
    if (c.tapped) return `${nameOf(s, id)} is already tapped`;
    if (what === "crew" && characteristics(s, c).cantCrew) return `${nameOf(s, id)} can't crew Vehicles`;
  }
  return null;
}
const convokeProblem = (s: GameState, pid: PlayerId, ids: ObjectId[]) => tapCreaturesProblem(s, pid, ids, "convoke");

/** Harmonize's creature: one untapped creature you control, only when it's cast using harmonize (CR 702.180a-b). */
function harmonizeProblem(s: GameState, pid: PlayerId, choices?: CostChoices, convoke?: ObjectId[]): string | null {
  const id = choices?.harmonize;
  if (id === undefined) return null;
  if (choices?.via !== "harmonize") return "a creature is tapped that way only when it's cast using harmonize";
  if (convoke?.includes(id) || choices?.teamwork?.includes(id) || choices?.conspire?.includes(id)) return "a creature can't be tapped twice to cast it";
  return tapCreaturesProblem(s, pid, [id], "pay for harmonize");
}

/** Target specs a card needs when cast (empty for most permanents). For a modal spell, those of the chosen modes. */
export const spellTargets = (s: GameState, id: ObjectId, modes?: number[], alt?: AltCostKind, how?: CastHow) => asFace(s, obj(s, id), how?.face, () => spellTargetSpecs(castDef(s, id, alt), modes, how));

/** Which optional costs these choices announce, for the targets that depend on them (see gateTargets). */
export const castHow = (choices?: Pick<CostChoices, "kicks" | "bargain" | "teamwork" | "gift" | "evidence" | "alt" | "face">): CastHow => ({
  ...(choices?.alt ? { alt: choices.alt } : {}),
  ...(choices?.face !== undefined ? { face: choices.face } : choices?.alt === "convert" ? { face: 1 } : {}),
  ...(choices?.kicks?.length ? { kicks: choices.kicks } : {}),
  ...(choices?.bargain ? { bargained: true } : {}),
  ...(choices?.evidence ? { evidence: true } : {}),
  ...(choices?.teamwork?.length ? { teamwork: true } : {}),
  ...(choices?.gift !== undefined ? { gift: true } : {}),
});
/** Every optional cost paid (each kicker cost too): the most targets a spell can have. */
const ALL_PAID: CastHow = { kicks: [0, 1], bargained: true, teamwork: true, gift: true, evidence: true };

/**
 * What casting this card puts on the stack: the card, or for a bestowed cast, the Aura it is then (CR 702.103b, d); for
 * an overloaded cast, its "each" text (702.96a).
 */
export const castDef = (s: GameState, id: ObjectId, alt?: AltCostKind): CardDef =>
  alt === "mutate" && !obj(s, id).mutating ? mutatingDef(defOf(s, obj(s, id)), obj(s, id).owner) : alt === "bestow" ? bestowedDef(defOf(s, obj(s, id))) : alt === "prototype" ? prototypedDef(defOf(s, obj(s, id))) : alt === "overload" && !obj(s, id).overloaded ? overloadedDef(defOf(s, obj(s, id))) : alt === "cleave" && !obj(s, id).cleaved ? cleavedDef(defOf(s, obj(s, id))) : defOf(s, obj(s, id));

/**
 * "You may cast sorcery spells as though they had flash" (Hypersonic Dragon), "... spells ..." (Vedalken Orrery): a
 * permanent `pid` controls lets them cast this card any time they could cast an instant (CR 702.8a). It's a spell then,
 * so it's matched as one.
 */
export function flashGranted(s: GameState, pid: PlayerId, d: CardDef, owner?: PlayerId): boolean {
  // "This spell has flash as long as you've committed a crime this turn" (CompiledCard.flashIf): about the player only.
  const own = compileCard(d).flashIf;
  if (own && staticConditionNow(s, own, "", pid)) return true;
  if (turnRule(s, pid, "flash")) return true;
  if (s.flashUntil?.some((r) => r.controller === pid && (r.turn === undefined || r.turn === s.turn) && printedMatches(r.filter, d))) return true;
  // Progenitor's Icon: the next such spell this turn.
  if (s.nextCast?.some((r) => r.flash && r.controller === pid && r.turn === s.turn && printedMatches(r.filter, d))) return true;
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    // Teferi, Mage of Zhalfir: the card's owner's Teferi, whoever casts it.
    if (owner !== undefined && controllerOf(s, o) === owner && abilitiesOf(s, o).flashOwned?.some((spec) => printedMatches(spec, d))) return true;
    // Quick Sliver: any player, whoever controls it.
    if (abilitiesOf(s, o).flashForAll?.some((spec) => printedMatches(spec, d))) return true;
    if (controllerOf(s, o) !== pid) return false;
    // Final-Word Phantom: any spell, during an opponent's end step.
    if (abilitiesOf(s, o).flashInOpponentsEndStep && s.step === "end" && s.activePlayer !== pid) return true;
    if (abilitiesOf(s, o).flashWhile?.some((c) => staticConditionNow(s, c, id, pid))) return true;
    if (abilitiesOf(s, o).flashForWhile?.some((f) => printedMatches(f.filter, d) && staticConditionNow(s, f.condition, id, pid))) return true;
    // Radagast: the first creature spell you cast this turn, those cast before it was on the battlefield counted (rulings).
    const first = (spec: TargetSpec) => printedMatches(spec, d) && !(s.castThisTurn ?? []).some((c) => c.player === pid && printedMatches(spec, s.cards[c.card]!));
    return !!abilitiesOf(s, o).flashFor?.some((spec) => printedMatches(spec, d)) || !!abilitiesOf(s, o).flashForFirst?.some(first);
  });
}

/** A modal spell's choices, if this card is one (CR 700.2). */
export const spellModes = (s: GameState, id: ObjectId) => compileCard(defOf(s, obj(s, id))).spell?.modal;

function castSpell(s: GameState, p: Player, id: ObjectId, targets?: TargetChoice[], modes?: number[], convoke?: ObjectId[], improvise?: ObjectId[], x?: number, choices: CostChoices = {}) {
  const o = obj(s, id);
  choices = convertChoices(o, choices);
  if (choices.face !== undefined && o.face !== choices.face) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    setFace(s, o, choices.face); // the face cast is the one up on the stack (CR 709.3b, 712.11, 715.3b)
  }
  if (choices.faceDown && !o.faceDown) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.faceDown = compileCard(defOf(s, o)).faceDownCast!.kind; // turned face down before it's put on the stack (CR 708.4)
  }
  if ((choices.alt === "prototype" || choices.prototyped) && !o.prototyped) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.prototyped = true; // a prototyped spell from the moment it's cast (CR 718.3b)
  }
  if (choices.alt === "overload" && !o.overloaded) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.overloaded = true; // CR 702.96a
  }
  if (choices.alt === "cleave" && !o.cleaved) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.cleaved = true; // CR 702.148a
  }
  if (choices.alt === "mutate" && !o.mutating) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.mutating = true; // a mutating creature spell from the moment it's cast (CR 702.140a)
  }
  if (choices.alt === "bestow" && !o.bestowed) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.bestowed = true; // an Aura spell with enchant creature from the moment it's cast (CR 702.103b)
  }
  const madness = madnessCastOf(s, p.id, id);
  const suspended = s.pending?.kind === "castFree" && s.pending.how === "suspend" && s.pending.objectId === id;
  const d = defOf(s, o);
  const spell = compileCard(d).spell;
  // Modes first (CR 601.2b), then the targets they need (601.2c).
  if (spell?.modal && modes === undefined) throw new RulesError(castProblem(s, p.id, id) ?? `choose ${describeCount(spell.modal.min, spell.modal.max)} for ${d.name}`);
  // "Sacrifice a creature or pay {3}{B}": which one is announced as it's cast (CR 601.2b).
  const or = compileCard(d).costOr;
  if (or && choices.costOr === undefined) throw new RulesError(`choose how to pay ${d.name}'s additional cost: ${or.map((x) => x.text).join(" or ")}`);
  const specs = withSplices({ targets: spellTargets(s, id, modes, undefined, castHow(choices)), effects: [], text: "" }, splicedBodies(s, choices.splice)).targets;
  const problem = castProblem(s, p.id, id, specs.length ? (targets ?? []) : undefined, spell?.modal ? modes : undefined, convoke, improvise, x, choices);
  if (problem) throw new RulesError(problem);
  // What pays a cost beyond mana (which creatures are sacrificed, which cards discarded) is chosen as it's cast (CR
  // 601.2h): a cast that doesn't say can't skip the cost. As for abilities (activateAbility).
  const unpicked = castExtraCosts(d, { ...choices, objectId: id, ...(spell?.modal && modes ? { modes } : {}) }, x ?? 0, s, p.id).find((c) => "n" in c && c.n > 0 && costNeedsPick(c) && !choices[costPickKey(c)]?.length);
  if (unpicked) throw new RulesError(`choose what to pay ${d.name}'s additional cost with`);
  // The targets it has, cast this way (CR 702.33g): copies of it have the same ones (CR 707.10).
  let body = spell ? settleDivided(s, gateBody(withModes(spell, modes), castHow(choices)), { controller: p.id, sourceId: id, x: x ?? 0 }) : undefined;
  if (body && manySlot(body.targets) >= 0) {
    // As many targets as were chosen for "any number of target ..." (CR 601.2c); castProblem checked them.
    const fit = fitMany(body, targets ?? [], manyX(s, body.targets, p.id, id, x)) as Exclude<ReturnType<typeof fitMany>, string>;
    [body, targets] = [fit.body, fit.targets];
  }
  // Spliced cards' text, after the spell's own (CR 702.47c); the cards stay in your hand, revealed.
  if (body && choices.splice?.length) body = withSplices(body, splicedBodies(s, choices.splice));
  const fromCommand = o.zone === "command";
  const tax = fromCommand ? commanderTax(p, o) : 0;
  // The total cost is locked in, then paid (CR 601.2f-h): convoke creatures are tapped as part of paying it.
  const cost = costToPay(s, p.id, o, convoke, improvise, x, choices.kicks, { ...choices, targets, modes }) as { cost: ParsedCost; extra: number };
  const sunburst = !!compileCard(d).countsColors;
  // "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, ...": only
  // when cast with that permission, not free or for madness during a resolution (Armor of Thorns ruling).
  const flashSacrifice = !!compileCard(d).flashSacrifice && !flashGranted(s, p.id, d, o.owner) && !madness && !suspended && freeCastOf(s, p.id) !== id && !isType(d, "Instant") && !d.keywords.includes("Flash") && !canActAtSorcerySpeed(s, p.id);
  // Mana that can only be spent on spells like this one can pay any part of its total cost (CR 106.6).
  // Text hoping some color was spent to cast it: spent where that helps the caster, kept back where it hurts (CR 601.2h).
  const hopes = spendPlan(s, p.id, d, poolFor(s, p.id, spellUse(d, choices.alt, cost.cost, choices, o)).pool);
  const paid = spendFromPool(s, p.id, cost.cost, { ...(spellUse(d, choices.alt, cost.cost, choices, o) as Exclude<ManaUse, "other" | { ability: GameObject }>), object: o }, cost.extra, payableLife(s, p.id), { spreadColors: sunburst, ...hopes, wantSnow: !!compileCard(d).wantSnow })!;
  // Sunburst counts the colors of mana spent on its total cost, additional and alternative costs included (CR 702.44b).
  const colorsSpent = COLORS.filter((c) => paid.spent[c] > 0);
  loseLife(s, p.id, paid.lifePaid);
  // The amount of mana spent to cast it, by anyone (increment, CR 702.191a).
  const manaSpent = Object.values(paid.spent).reduce((a, b) => a + b, 0) + (choices.assisted && choices.assist !== undefined ? choices.assisted : 0);
  if (choices.assisted && choices.assist !== undefined) {
    const helper = player(s, choices.assist);
    spendFromPool(s, helper.id, parseManaCost(`{${choices.assisted}}`), { spell: d });
    log(s, `${helper.name} pays {${choices.assisted}} of ${d.name}'s cost (assist).`);
  }
  for (const c of [...(convoke ?? []), ...(improvise ?? []), ...(choices.waterbend ?? [])]) tapPermanent(s, obj(s, c));
  if (choices.waterbend?.length) log(s, `${p.name} taps ${choices.waterbend.map((c) => nameOf(s, c)).join(", ")} to waterbend.`);
  // The Dragons of Tarkir reveal cycle: controlling a Dragon as it's finished being cast counts the same as revealing one
  // (rulings), with nothing revealed; a copy doesn't get that (StackItem.kickedByControl).
  const ifControl = compileCard(d).kicker?.ifControl;
  const byControl = !!ifControl && !choices.kicks?.length && s.battlefield.some((b) => controllerOf(s, obj(s, b)) === p.id && objectMatches(s, ifControl, obj(s, b), p.id, false));
  const kicks = byControl ? [0] : choices.kicks?.length ? [...choices.kicks].sort() : undefined;
  o.kicked = kicks;
  o.kickedByControl = byControl || undefined;
  o.colorsSpent = colorsSpent.length ? colorsSpent : undefined;
  o.phyrexianLife = paid.phyrexianLife;
  o.convoked = convoke?.length ? convoke.map((c) => ({ id: c, zc: obj(s, c).zoneChanges ?? 0 })) : undefined;
  o.manaSpent = manaSpent || undefined;
  // What was spent, by type, for "if {U} was spent to cast ~" and adamant (CR 601.2h).
  const spent: SpentMana = Object.fromEntries(Object.entries(paid.spent).filter(([, n]) => n > 0));
  // How much of it snow sources made: "if {S} was spent", "for each {S} spent" (CR 107.4h).
  const snow = Object.fromEntries(Object.entries(paid.snow).filter(([, n]) => n > 0));
  if (Object.keys(snow).length) spent.snow = snow;
  // And how much a Treasure, a creature or an artifact made (CR 106.3): "three or more mana from creatures".
  const spentFrom = Object.fromEntries(Object.entries(paid.from).filter(([, n]) => n > 0));
  if (Object.keys(spentFrom).length) spent.from = spentFrom;
  o.spent = Object.keys(spent).length ? spent : undefined;
  o.treasureSpent = paid.treasure || undefined;
  // "Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered" (Cavern of Souls).
  o.uncounterableCast = paid.uncounterable;
  // "If any of that mana is spent on a creature spell, it gains haste" (Arena of Glory): the spell and the creature it becomes.
  o.hasteCast = paid.haste;
  o.commanderCountersCast = paid.commanderCounters;
  o.creatureCountersCast = paid.creatureCounters;
  // "When that mana is spent to cast a creature spell that shares a creature type with your commander" (Path of
  // Ancestry): one trigger for each such mana, its commanders' types checked now (rulings). "... to cast a red instant
  // or sorcery spell" (Pyromancer's Goggles): queued once the spell is on the stack, "that spell" being it.
  const spentQueue: ManaSpentTrigger[] = [];
  for (const t of paid.spentTriggers ?? []) {
    if ("sharesCommanderType" in t) {
      if (!isType(d, "Creature")) continue;
      // Changeling is every creature type (CR 702.73a); a commander with no creature type shares none (rulings).
      const kinds = (types: string[], all: boolean) => (all ? [...CREATURE_TYPES] : types.filter((x) => CREATURE_TYPES.has(x)));
      const mine = kinds(d.subtypes, everyCreatureType(d));
      const theirs = Object.values(s.objects).flatMap((c) => (c.isCommander && c.owner === p.id ? kinds(characteristics(s, c).subtypes, characteristics(s, c).allCreatureTypes) : []));
      if (mine.some((x) => theirs.includes(x))) spentQueue.push(t);
    } else if ("spell" in t) spentQueue.push(t); // checked once it's on the stack
    // "Your commander": a commander you own (CR 903.3).
    else if ("commander" in t) {
      if (o.isCommander && o.owner === p.id) spentQueue.push(t);
    } else if ((isType(d, "Instant") || isType(d, "Sorcery")) && (!t.color || characteristics(s, o).colors.includes(t.color))) spentQueue.push(t);
  }
  if (fromCommand) p.commanderCasts[o.id] = (p.commanderCasts[o.id] ?? 0) + 1;
  const castFrom = o.zone;
  useOneOf(s, o, p.id, choices.asType);
  // Court of Locthwain: one spell for each time its ability resolved.
  if (choices.alt === "linkedFree") s.linkedFreeCasts!.splice(linkedFreeGrant(s, o, p.id), 1);
  // A once-a-turn permission to cast from the top is used up (Johann).
  if (castFrom === "library") {
    const how = topPermission(s, o, p.id);
    if (how?.once && how.by) how.by.topUsedTurn = s.turn;
    // "If you cast a creature spell this way, it gains haste until end of turn": the spell and the creature it becomes.
    if (how?.haste && isType(d, "Creature") && o.hasteCast !== "game") o.hasteCast = how.haste;
  }
  const via = graveyardWay(s, o, choices.via, p.id);
  // A once-each-turn permission is used up (Karador; Muldrotha's slot for one of the spell's types).
  if (via?.kind === "turnPermission") {
    const permit = pickPermit(s, o, permitsForMv(s, via.permits ?? [], defMv(d) + (x ?? 0) * xCount(parseManaCost(d.manaCost))), choices.permit)!;
    ((s.turnLog ??= {}).gravePermits ??= []).push(permit);
    log(s, `${p.name} uses ${permitLabel(s, permit)} to cast it from ${o.owner === p.id ? "their" : `${player(s, o.owner).name}'s`} graveyard.`);
    choices = { ...choices, permit }; // its costs are paid below
    const gains = permitGains(s, permit);
    if (gains) o.entersGaining = gains;
    if (permitEntersTapped(s, permit)) o.castEntersTapped = true;
    // The Tomb of Aclazotz: "If you do, it enters with a finality counter on it and is a Vampire in addition to its other
    // types": the spell, and the permanent it becomes (rulings, CR 614.1c, 400.7a).
    const rider = s.graveGrants?.find((g) => g.key === permit)?.rider;
    if (rider?.counter) o.extraCounters = { ...o.extraCounters, [rider.counter]: (o.extraCounters?.[rider.counter] ?? 0) + 1 };
    if (rider?.subtypes?.length) (o.spellGains ??= []).push({ mods: [{ kind: "addTypes", types: [], subtypes: rider.subtypes }], timestamp: s.nextTimestamp++, controller: p.id, source: s.graveGrants!.find((g) => g.key === permit)!.source, forever: true });
  }
  // Undead Sprinter: "If you do, ~ enters with a +1/+1 counter on it": the spell cast with that permission (CR 614.1c).
  if (via?.entersWith) o.extraCounters = { ...o.extraCounters, [via.entersWith.counter]: (o.extraCounters?.[via.entersWith.counter] ?? 0) + via.entersWith.n };
  // "Once each turn, you may pay {0} ..." (As Foretold): that permanent's permission is used up for this turn.
  if (choices.alt === "payZero") {
    const by = payZeroSource(s, p.id, o)!;
    if (compileCard(defOf(s, by)).payZero!.once) ((s.turnLog ??= {}).payZeroUsed ??= []).push(`${by.id}@${by.zoneChanges ?? 0}`);
    log(s, `${p.name} pays {0} rather than ${d.name}'s mana cost (${characteristics(s, by).name}).`);
  }
  if (choices.alt === "lifeForMv") {
    const by = payZeroSource(s, p.id, o, true)!;
    ((s.turnLog ??= {}).payZeroUsed ??= []).push(`${by.id}@${by.zoneChanges ?? 0}`);
    log(s, `${p.name} pays life rather than ${d.name}'s mana cost (${characteristics(s, by).name}).`);
  }
  // Cast with a permission that says "if that spell would be put into a graveyard, exile it instead" (Dire Fleet Daredevil).
  const exileAfter = castFrom === "exile" && !!o.mayPlay?.exileAfter && ownExilePermission(s, o, p.id);
  const from = zoneList(s, o)!;
  from.splice(from.indexOf(id), 1);
  o.zone = "stack";
  // Cast from a graveyard, it left the graveyard (CR 601.2a), an event of its own: paying the costs comes later (601.2h).
  if (castFrom === "graveyard") {
    (s.zoneBatch ??= []).push({ id, zc: o.zoneChanges ?? 0, from: "graveyard", to: "stack", owner: o.owner, card: o.cardId });
    closeZoneBatch(s);
  }
  o.castFrom = castFrom;
  o.castVia = via?.kind;
  o.buyback = choices.buyback || undefined;
  const paidHow = s.pending?.kind === "castFree" ? s.pending.how : undefined;
  o.castAlt = madness && paidHow !== "paid" ? (paidHow === "miracle" ? "miracle" : "madness") : choices.alt;
  if (choices.alt === "warp" || choices.alt === "grantedWarp") s.voidThisTurn = true; // a spell was warped this turn (CR 702.185c)
  // A creature spell cast with suspend gains haste until its caster loses control of it (CR 702.62a).
  if (suspended && isType(d, "Creature")) o.suspendHaste = p.id;
  // CR 702.34a, 702.133a; an aftermath half cast from a graveyard any way (702.127a).
  // A once-each-turn permission's own "exile it instead" (Maestros Ascendancy), not another's it shares the way with.
  const exiles = via?.kind === "turnPermission" ? !!choices.permit && permitExiles(s, choices.permit) : via?.exile;
  if (exiles || (castFrom === "graveyard" && compileCard(d).fromGraveyard?.some((g) => g.kind === "aftermath"))) o.exileIfLeaves = "stack";
  if (via?.exileIfToGraveyard || exileAfter) o.exileIfToGraveyard = true;
  o.controller = p.id;
  o.timestamp = s.nextTimestamp++;
  const chosen = spell?.modal ? modes : undefined;
  const free = freeCastOf(s, p.id) === id && !madness;
  // X is announced as it's cast (CR 601.2b) and is part of the spell while it's on the stack (CR 107.3a).
  const hasX = parseManaCost(d.manaCost).hasX || costsHaveX(d, choices) || !!choices?.kicks?.some((i) => parseManaCost(compileCard(d).kicker?.costs[i] ?? "").hasX);
  s.stack.push({
    id: `s${s.nextId++}`,
    kind: "spell",
    objectId: id,
    controller: p.id,
    description: hasX ? `${d.name} (X=${x ?? 0})` : d.name,
    body,
    targets: specs.length ? stampTargets(s, targets) : undefined,
    modes: chosen,
    ...(hasX ? { x: x ?? 0 } : {}),
    ...(kicks ? { kicked: kicks } : {}),
    ...(byControl ? { kickedByControl: true as const } : {}),
  });
  const item = s.stack[s.stack.length - 1]!;
  const stackId = item.id;
  for (const t of spentQueue) if (!("spell" in t) || spellMatches(s, t.spell, item)) s.triggerQueue.push({ sourceId: t.sourceId, sourceCardId: t.sourceCardId, sourceZc: t.sourceZc, controller: p.id, index: -1, body: t.body, cause: stackId });
  // "... the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step": about
  // the permanent it becomes as it enters (one more zone change, CR 400.7).
  if (flashSacrifice)
    (s.delayed ??= []).push({
      when: "nextCleanup",
      controller: p.id,
      sourceCardId: cardIdOf(o),
      subject: { id, zc: (o.zoneChanges ?? 0) + 1 },
      body: { targets: [], effects: [{ type: "sacrifice", what: { ref: "subject" }, byController: true }], text: "Its controller sacrifices ~." },
      turn: s.turn,
      step: s.step,
    });
  const convoked =
    (convoke?.length ? `, convoking with ${convoke.map((c) => nameOf(s, c)).join(", ")}` : "") +
    (improvise?.length ? `, improvising with ${improvise.map((c) => nameOf(s, c)).join(", ")}` : "");
  const kickText = byControl ? ` (controlling ${/^[aeiou]/i.test(ifControl!.text) ? "an" : "a"} ${ifControl!.text.replace(/ you control$/, "")})` : kicks ? describeKicks(d, kicks) : "";
  const howText =
    (via ? ` from their graveyard (${describeVia(via.kind)})` : castFrom === "exile" ? " from exile" : "") +
    (choices.prototyped && choices.alt !== "prototype" ? " prototyped" : "") +
    (choices.alt === "bestow" ? " bestowed" : choices.alt === "prototype" ? " prototyped" : choices.alt === "wubrg" ? " for {W}{U}{B}{R}{G}" : choices.alt === "payZero" ? " for {0}" : choices.alt === "lifeForMv" ? " for life" : choices.alt === "omniscience" ? " without paying its mana cost" : choices.alt === "evidence" ? " collecting evidence rather than paying its mana cost" : choices.alt === "convert" ? " converted, for its More Than Meets the Eye cost" : choices.alt ? ` for its ${choices.alt.replace(/^granted(.)/, (_, c: string) => c.toLowerCase())} cost` : "") +
    (madness && o.castAlt === "madness" ? " for its madness cost" : madness && o.castAlt === "miracle" ? " for its miracle cost" : "") +
    (choices.buyback ? ", paying buyback" : "") +
    (choices.splice?.length ? `, splicing ${choices.splice.map((c) => nameOf(s, c)).join(" and ")} onto it` : "") +
    (costOrMana(d, choices.costOr) ? `, paying ${costOrMana(d, choices.costOr)} more` : "") +
    (choices.delve?.length ? `, exiling ${choices.delve.map((c) => nameOf(s, c)).join(", ")} from their graveyard (delve)` : "");
  if (o.faceDown) log(s, `${p.name} casts a face-down creature spell (${o.faceDown})${tax ? ` (commander tax ${tax})` : ""}.`);
  else log(s, `${p.name} casts ${d.name}${howText}${hasX ? ` with X=${x ?? 0}` : ""}${kickText}${free ? " without paying its mana cost" : ""}${tax ? ` (commander tax ${tax})` : ""}${chosen ? ` choosing "${body!.text.replace(/~/g, d.name).replace(/\.$/, "")}"` : ""}${describeTargets(s, targets)}${convoked}.`);
  for (const c of choices.delve ?? []) moveObject(s, c, "exile"); // CR 702.66a
  // Each cost paid is an event of its own for "one or more" triggers (rulings on Conspiracy Unraveler).
  closeZoneBatch(s);
  // Additional costs are paid with the mana (CR 601.2h); what they did is known to the spell.
  const returned: LastKnown = {};
  const discarded: string[] = [];
  const costExiled: { id: ObjectId; zc: number }[] = [];
  const sacrificed = payExtraCosts(s, p, castExtraCosts(d, { ...choices, targets, ...(chosen ? { modes: chosen } : {}) }, x ?? 0, s, p.id), choices, returned, undefined, discarded, costExiled);
  // "Behold a Kithkin and exile it": linked to the permanent this spell becomes, one zone change from now (CR 607.2q).
  // "Exile a creature you control" (Fear of Abduction): the same (CompiledCard.costExileLinked).
  if (costExiled.length && (compileCard(d).additionalCosts?.some((c) => c.kind === "reveal" && c.exile) || compileCard(d).costExileLinked)) (s.linkedExile ??= {})[`${o.id}@${(o.zoneChanges ?? 0) + 1}`] = costExiled;
  if (sacrificed.length) item.sacrificed = sacrificed;
  if (discarded.length) item.costDiscarded = discarded;
  if (choices.alt === "sneak") o.sneak = returned;
  // Cast using web-slinging (CR 702.188a): the creature it returned, for "the returned creature".
  if (choices.alt === "alternative" && altCost(d, "alternative")?.webSlinging) o.webSlung = returned;
  // Casualty: "you may sacrifice a creature with power N or greater" (CR 702.153a).
  if (choices.casualty) {
    log(s, `${p.name} sacrifices ${nameOf(s, choices.casualty)} (casualty).`);
    moveObject(s, choices.casualty, "graveyard", { sacrificed: true });
    item.casualty = true;
    closeZoneBatch(s);
  }
  // Lethal Throwdown: which of its "sacrifice a creature or sacrifice a modified creature" was paid, for "if the modified
  // creature was sacrificed" (CR 601.2b).
  if (choices.costOr !== undefined && compileCard(defOf(s, o)).costOr) o.costOrPaid = choices.costOr;
  // Bargain: "you may sacrifice an artifact, enchantment, or token" (CR 702.166a).
  if (choices.bargain) {
    log(s, `${p.name} sacrifices ${nameOf(s, choices.bargain)} (bargain).`);
    moveObject(s, choices.bargain, "graveyard", { sacrificed: true });
    o.bargained = true;
    closeZoneBatch(s);
  }
  // Offering: the permanent is sacrificed as the total cost is paid (CR 702.48b).
  if (choices.offering) {
    log(s, `${p.name} sacrifices ${nameOf(s, choices.offering)} (offering).`);
    moveObject(s, choices.offering, "graveyard", { sacrificed: true });
    closeZoneBatch(s);
  }
  // "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a, c).
  if (choices.evidence) {
    collectEvidence(s, p, choices.evidence, compileCard(d).evidence ?? 0);
    o.evidence = true;
    closeZoneBatch(s);
  }
  // Teamwork: "you may tap any number of creatures you control with total power N or more".
  if (choices.teamwork?.length) {
    for (const c of choices.teamwork) tapPermanent(s, obj(s, c));
    log(s, `${p.name} taps ${choices.teamwork.map((c) => nameOf(s, c)).join(", ")} (teamwork).`);
    o.teamwork = true;
  }
  // Harmonize: the creature chosen is tapped as the total cost is paid (CR 702.180b).
  if (choices.harmonize !== undefined && via?.kind === "harmonize") {
    tapPermanent(s, obj(s, choices.harmonize));
    log(s, `${p.name} taps ${nameOf(s, choices.harmonize)} (harmonize).`);
  }
  // Conspire: "you may tap two untapped creatures you control that each share a color with it" (CR 702.78a).
  if (choices.conspire?.length) {
    for (const c of choices.conspire) tapPermanent(s, obj(s, c));
    log(s, `${p.name} taps ${choices.conspire.map((c) => nameOf(s, c)).join(" and ")} (conspire).`);
    item.conspired = true;
  }
  // Gift: "you may choose an opponent" (CR 702.174a); the gift is promised to them (702.174k).
  if (choices.gift !== undefined) {
    log(s, `${p.name} promises ${player(s, choices.gift).name} a gift (${compileCard(d).gift!.what}).`);
    o.gift = choices.gift;
  }
  // "Where X is ... as you cast this spell": counted now, as it becomes cast (rulings on Lifestream's Blessing); a copy
  // copies it (CR 707.10).
  const asCast = findAsCast(compileCard(d).spell);
  if (asCast) item.asCast = evalAmount(s, { count: asCast.of }, { controller: p.id, sourceId: o.id });
  // Storm counts the spells cast before it (CR 702.40a); a copy of it made later copies it as it was cast (707.10).
  item.castNth = s.spellsCastThisTurn ?? 0;
  s.spellsCastThisTurn = item.castNth + 1;
  o.castNth = item.castNth;
  p.nextSpellImprovise = undefined; // it was the next spell cast (Archway of Innovation)
  p.nextSpellConvoke = undefined; // and Wand of the Worldsoul's
  // "The next spell you cast this turn costs {1} less to cast" (Hardened Berserker): this was that spell, so the
  // reduction is used up as it becomes cast (CR 601.2i), each such one that applied to it.
  if (s.costModsThisTurn?.some((c) => c.next)) {
    const mvNow = defMv(d) + (x ?? 0) * xCount(parseManaCost(d.manaCost));
    s.costModsThisTurn = s.costModsThisTurn.filter((c) => !c.next || !costModThisTurnApplies(s, c, p.id, d, mvNow));
  }
  if (isMainPhase(s) && s.activePlayer === p.id) item.castInMain = o.castInMain = true;
  s.cards[d.oracleId] ??= d;
  (p.castNames ??= {})[d.name] = (p.castNames[d.name] ?? 0) + 1;
  const castMv = spellManaValue(s, item);
  (s.castThisTurn ??= []).push({ player: p.id, card: d.oracleId, colors: [...characteristics(s, o).colors], types: [...characteristics(s, o).types], from: castFrom, ...(paid.treasure ? { treasure: true as const } : {}), mv: castMv });
  (s.castItems ??= {})[stackId] = { ...structuredClone(item), castMv, castColors: [...characteristics(s, o).colors], ...(o.faceDown ? {} : { castName: d.name }) };
  // A copy of a prepare spell: its permanent stops being prepared as it becomes cast (CR 722.3c, 601.2i).
  if (o.preparedFrom) unprepareFor(s, o);
  // Expend (CR 700.14): the mana this player spent to cast spells this turn, before and after paying this cost (the
  // mana another player paid with assist isn't theirs).
  const own = Object.values(paid.spent).reduce((a, b) => a + b, 0);
  const before = p.expended?.turn === s.turn ? p.expended.n : 0;
  p.expended = { turn: s.turn, n: before + own };
  // Once it's cast, "whenever you cast" and "becomes the target" abilities trigger (CR 601.2i).
  fireEvent(s, { type: "cast", stackId, controller: p.id, card: d, manaSpent, ...(paid.treasure ? { treasureSpent: paid.treasure } : {}), ...(o.spent ? { spent: o.spent } : {}), ...(paid.sources ? { manaSources: paid.sources } : {}) });
  if (own) fireEvent(s, { type: "expended", player: p.id, before, after: before + own });
  fireEvent(s, { type: "targeted", stackId });
}

/** Splice (CR 702.47a): the cards in your hand that can be spliced onto this spell as it's cast, not the spell itself. */
export function spliceCandidates(s: GameState, pid: PlayerId, id: ObjectId): ObjectId[] {
  const o = s.objects[id];
  if (!o || o.faceDown) return [];
  const d = defOf(s, o);
  return player(s, pid).hand.filter((c) => {
    const sp = c !== id ? compileCard(defOf(s, obj(s, c))).splice : undefined;
    return !!sp && (sp.onto === "Arcane" ? d.subtypes.includes("Arcane") : isType(d, "Instant") || isType(d, "Sorcery"));
  });
}

/** Spliced cards are each spliced once (CR 702.47b), from your hand, onto a spell they can be spliced onto. */
function spliceProblem(s: GameState, pid: PlayerId, id: ObjectId, ids: ObjectId[]): string | null {
  if (new Set(ids).size !== ids.length) return "a card can be spliced onto a spell only once";
  const ok = spliceCandidates(s, pid, id);
  const bad = ids.find((c) => !ok.includes(c));
  return bad === undefined ? null : `${s.objects[bad] ? nameOf(s, bad) : "that card"} can't be spliced onto ${nameOf(s, id)}`;
}

/** The rules text the spliced cards add (CR 702.47c): each one's spell ability. */
export const splicedBodies = (s: GameState, ids: ObjectId[] = []): AbilityBody[] => ids.flatMap((c) => compileCard(defOf(s, obj(s, c))).spell ?? []);
const spliceMana = (s: GameState, ids: ObjectId[] = []) => ids.map((c) => compileCard(defOf(s, obj(s, c))).splice?.mana ?? "").join("");

/**
 * "Each player can't cast more than one spell each turn" and the like: a "can't" that wins over any "can" (CR 101.2).
 * `mv`: the proposed spell's mana value, X chosen (CR 601.2e); without it, only whether it can begin to be cast, where a
 * choice still to be made (X) that could lift a mana value ban counts as lifting it (CR 601.3a).
 */
function castLimitProblem(s: GameState, pid: PlayerId, d: CardDef, mv?: number): string | null {
  const epic = player(s, pid).cantCastSpells;
  if (epic) return `${epic}: you can't cast spells for the rest of the game`;
  const named = nameCastBan(s, pid, d);
  if (named) return named;
  // "Your opponents can't cast spells this turn" (Silence) and the like.
  for (const c of s.cantCastThisTurn ?? [])
    if (c.player === pid && (c.turn === s.turn || c.untilEndOfTurnOf !== undefined || c.untilTurnOf !== undefined) && !(c.duringTheirNextTurn && !(s.activePlayer === pid && (player(s, pid).turnBegan ?? 0) > c.turn)) && (!c.filter || printedMatches(c.filter, d))) return `${c.source}: you can't cast ${c.filter ? `${c.filter.text.replace(/ spell$/, "")} ` : ""}spells ${c.untilEndOfTurnOf !== undefined || c.untilTurnOf !== undefined ? "for now" : "this turn"}`;
  // Permanents, and emblems in the command zone (CR 114.4).
  for (const o of [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s)]) {
    // "Each opponent can cast spells only any time they could cast a sorcery" (Teferi, Time Raveler).
    if (abilitiesOf(s, o).opponentsSorceryTiming && controllerOf(s, o) !== pid && (s.resolving || !canActAtSorcerySpeed(s, pid)))
      return `${characteristics(s, o).name}: opponents can cast spells only any time they could cast a sorcery`;
    if (abilitiesOf(s, o).castOnlyOwnTurn && pid !== s.activePlayer) return `${characteristics(s, o).name}: players can cast spells only during their own turns`;
    // "Your opponents can't cast spells during your turn" (Dragonlord Dromoka).
    const cantCastIf = abilitiesOf(s, o).opponentsCantCastYourTurnIf;
    if (abilitiesOf(s, o).opponentsCantCastYourTurn && controllerOf(s, o) === s.activePlayer && pid !== s.activePlayer && (!cantCastIf || (o.zone === "battlefield" && staticConditionNow(s, cantCastIf, o.id, controllerOf(s, o)))))
      return `${characteristics(s, o).name}: opponents can't cast spells during ${player(s, s.activePlayer).name}'s turn`;
    const duringCombat = abilitiesOf(s, o).opponentsCantCastDuringCombat;
    if (duringCombat && (duringCombat === "all" || controllerOf(s, o) !== pid) && inCombatPhase(s))
      return `${characteristics(s, o).name}: ${duringCombat === "all" ? "players" : "opponents"} can't cast spells during combat`;
    // Wardscale Dragon: the player it's attacking, or the controller of the planeswalker or battle it attacks (CR 506.2).
    if (abilitiesOf(s, o).defendingCantCastWhileAttacking && o.zone === "battlefield" && o.attacking === pid)
      return `${characteristics(s, o).name}: the defending player can't cast spells while it's attacking`;
    // Angelic Arbiter: an opponent who declared an attacking creature this turn (rulings).
    if (abilitiesOf(s, o).opponentsWhoAttackedCantCast && o.zone === "battlefield" && controllerOf(s, o) !== pid && player(s, pid).attackedTurn === s.turn)
      return `${characteristics(s, o).name}: opponents who attacked with a creature this turn can't cast spells`;
    // "Your opponents can't cast spells with mana value 3 or less" (Brisela, Voice of Nightmares).
    const most = abilitiesOf(s, o).opponentsCantCastMvAtMost;
    const value = mv ?? (parseManaCost(d.manaCost).hasX ? undefined : defMv(d));
    if (most !== undefined && controllerOf(s, o) !== pid && value !== undefined && value <= most)
      return `${characteristics(s, o).name}: opponents can't cast spells with mana value ${most} or less`;
    // Sanctum Prelate: anyone's noncreature spell with that mana value, X as chosen (rulings).
    if (abilitiesOf(s, o).noncreatureChosenMvCantBeCast && o.chosen?.number !== undefined && !isType(d, "Creature") && value === o.chosen.number)
      return `${characteristics(s, o).name}: noncreature spells with mana value ${o.chosen.number} can't be cast`;
    if (abilitiesOf(s, o).opponentsNoncreatureMvAboveLands && controllerOf(s, o) !== pid && value !== undefined && !isType(d, "Creature") && value > s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objIsType(s, obj(s, id), "Land")).length)
      return `${characteristics(s, o).name}: opponents can't cast noncreature spells with mana value greater than the number of lands they control`;
    if (abilitiesOf(s, o).opponentsCantCastEven && controllerOf(s, o) !== pid && value !== undefined && value % 2 === 0)
      return `${characteristics(s, o).name}: opponents can't cast spells with even mana values`;
    for (const b of abilitiesOf(s, o).cantBeCast ?? []) {
      const { manaValue: range, ...rest } = b.filter;
      if (!printedMatches(rest, d) || (b.hasX && !parseManaCost(d.manaCost).hasX)) continue;
      if (range && (value === undefined || value < (range.min ?? 0) || value > (range.max ?? Infinity))) continue;
      return `${characteristics(s, o).name}: ${b.filter.text}s can't be cast`;
    }
    for (const f of abilitiesOf(s, o).youCantCast ?? [])
      if (controllerOf(s, o) === pid && printedMatches(f, d)) return `${characteristics(s, o).name}: you can't cast ${f.text.replace(/ spell$/, "")} spells`;
    for (const f of abilitiesOf(s, o).opponentsCantCast ?? [])
      if (controllerOf(s, o) !== pid && printedMatches(f, d)) return `${characteristics(s, o).name}: opponents can't cast ${f.text.replace(/ spell$/, "")} spells`;
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    for (const f of abilitiesOf(s, o).enchantedControllerCantCast ?? [])
      if (host?.zone === "battlefield" && controllerOf(s, host) === pid && printedMatches(f, d)) return `${characteristics(s, o).name}: enchanted creature's controller can't cast ${f.text.replace(/ spell$/, "")} spells`;
    for (const l of abilitiesOf(s, o).castLimits ?? []) {
      if (l.who === "you" && controllerOf(s, o) !== pid) continue;
      if (l.who === "enchanted" && o.attachedToPlayer !== pid) continue;
      if (l.filter && !printedMatches(l.filter, d)) continue;
      if ((s.castThisTurn ?? []).some((c) => c.player === pid && (!l.filter || printedMatches(l.filter, s.cards[c.card]!))))
        return `${characteristics(s, o).name}: ${l.text.replace(/~/g, characteristics(s, o).name).replace(/\.$/, "")}`;
    }
  }
  return null;
}

/** The card's way of being cast from a graveyard of this kind, if it has one. */
export function graveyardCast(d: CardDef, via?: CastFromGraveyardKind): CastFromGraveyard | undefined {
  if (via && GRANTED_WAY_COSTS[via]) return { kind: via, costs: GRANTED_WAY_COSTS[via]!, exile: false };
  return via ? compileCard(d).fromGraveyard?.find((g) => g.kind === via) : undefined;
}

/** Flashback an effect gave this card until end of turn, its cost equal to the card's mana cost (Snapcaster Mage). */
export const hasGrantedFlashback = (s: GameState, o: GameObject) => o.zone === "graveyard" && !!s.flashbackGrants?.some((g) => g.id === o.id && g.zc === (o.zoneChanges ?? 0));

/** The ways to cast this card from a graveyard: its own (flashback, escape, ...), and flashback an effect gave it. */
/** `caster`: who would cast it, for a permission to cast from any graveyard (The Great Work); its owner if left out. */
export function graveyardWays(s: GameState, o: GameObject, caster?: PlayerId): CastFromGraveyard[] {
  // Cast transformed (disturb): the front face's ability is considered too (CR 712.11d).
  if (o.face !== undefined && layoutOf(s, o) === "transform") {
    const face = o.face;
    o.face = undefined;
    try {
      return graveyardWays(s, o, caster).filter((g) => g.face === face);
    } finally {
      o.face = face;
    }
  }
  // A split card in a graveyard is cast as one of its halves (CR 709.3): each half's ways, aftermath's among them
  // (702.127a), or flashback an effect gave the card, for that half's mana cost.
  if (o.face === undefined && layoutOf(s, o) === "split") return castableFaces(s, o).flatMap((f) => asFace(s, o, f, () => graveyardWays(s, o, caster)).map((g) => ({ ...g, face: f })));
  const d = defOf(s, o);
  // An adventurer card its owner may cast only as its Adventure (Mosswood Dreadknight): that way, as that face.
  const face = o.face === undefined && o.mayPlay?.face !== undefined && layoutOf(s, o) === "adventure" ? o.mayPlay.face : undefined;
  const asAdventure = face !== undefined ? asFace(s, o, face, () => grantedWays(s, o, defOf(s, o), caster ?? o.owner)).filter((g) => g.kind === "permission").map((g) => ({ ...g, face })) : [];
  return [...(compileCard(d).fromGraveyard ?? []), ...(hasGrantedFlashback(s, o) ? [{ kind: "grantedFlashback" as const, mana: d.manaCost, costs: [], exile: true }] : []), ...grantedWays(s, o, d, caster ?? o.owner), ...asAdventure];
}

/**
 * Escape, flashback or retrace a permanent its owner controls gives this card in their graveyard (Underworld Breach,
 * Lier, Six), one of each kind; the cost is the card's mana cost, so a card without one can't be cast this way (rulings).
 */
function grantedWays(s: GameState, o: GameObject, d: CardDef, caster: PlayerId): CastFromGraveyard[] {
  if (o.zone !== "graveyard") return [];
  const out: CastFromGraveyard[] = [];
  // "You may cast that card this turn" (Emry): its owner, paying its mana cost; a card without one can't be cast.
  const m = o.mayPlay;
  // Mosswood Dreadknight: "as an Adventure until the end of your next turn" (cleanup ends it), only as that face.
  const lasts = m && ((m.until === "thisTurn" && m.turn === s.turn) || (m.until === "nextTurn" && m.face !== undefined));
  if (m && lasts && (m.face === undefined || m.face === o.face) && m.player === o.owner && m.zc === (o.zoneChanges ?? 0) && d.manaCost && !compileCard(d).fromGraveyard?.some((w) => w.kind === "permission" && !w.costs.length))
    // Vohar, Vodalian Desecrator: "If that spell would be put into your graveyard, exile it instead".
    out.push({ kind: "permission", mana: d.manaCost, costs: [], exile: false, ...(m.exileAfter ? { exileIfToGraveyard: true as const } : {}) });
  // Permanents, and emblems in the command zone (Wrenn and Realmbreaker's, CR 114.4).
  for (const p of [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s)]) {
    if (controllerOf(s, p) !== o.owner) continue;
    for (const g of abilitiesOf(s, p).graveyardGrants ?? []) {
      if (g.yourTurn && s.activePlayer !== o.owner) continue;
      if (g.if && !staticConditionNow(s, g.if, p.id, o.owner)) continue;
      if (!d.manaCost && !g.way.mana) continue;
      if (!printedMatches(g.filter, d)) continue;
      // Lurrus: a card that can be cast with mana value that low (X counted as it's cast, see permitsForMv).
      if (g.maxMv !== undefined && defMv(d) > g.maxMv) continue;
      // Once each turn (Karador, Muldrotha's permanent types): the permissions not used yet, from every such permanent.
      if (g.once) {
        const used = s.turnLog?.gravePermits ?? [];
        const permits = g.once.filter((slot) => slot === "" || d.types.includes(slot)).map((slot) => `${p.id}@${p.zoneChanges ?? 0}:${slot}`).filter((k) => !used.includes(k));
        if (!permits.length) continue;
        const had = out.find((w) => w.kind === "turnPermission");
        if (had) had.permits = [...had.permits!, ...permits];
        else out.push({ ...g.way, mana: d.manaCost, permits });
        continue;
      }
      // Its caster would choose a permission that doesn't exile the spell afterwards over one that does (Jaya Ballard's emblem).
      const had = out.findIndex((w) => w.kind === g.way.kind);
      if (had >= 0 && g.way.kind === "permission" && out[had]!.exileIfToGraveyard && !g.way.exileIfToGraveyard) out.splice(had, 1);
      else if (had >= 0 || (g.way.kind === "grantedFlashback" && hasGrantedFlashback(s, o))) continue;
      out.push({ ...g.way, mana: g.way.mana ?? d.manaCost });
    }
  }
  // "You may cast spells from your graveyard this turn" (Forgotten Cellar, Yawgmoth's Will): any number of them, paying
  // their mana costs (rulings), for the rest of the turn.
  // Its caster would choose it over a permission that exiles the spell afterwards (Vohar's).
  if (d.manaCost && s.graveyardTurn?.some((g) => !g.anyGraveyard && g.player === o.owner && g.turn === s.turn && g.cast && printedMatches(g.cast, d)) && !out.some((w) => w.kind === "permission" && !w.exileIfToGraveyard)) {
    const i = out.findIndex((w) => w.kind === "permission");
    if (i >= 0) out.splice(i, 1);
    out.push({ kind: "permission", mana: d.manaCost, costs: [], exile: false });
  }
  // "Until end of turn, you may cast instant and sorcery spells from any graveyard" (The Great Work): for the player it
  // gave the permission, whoever owns the card; "if a spell cast this way would be put into a graveyard, exile it instead".
  const any = d.manaCost ? s.graveyardTurn?.find((g) => g.anyGraveyard && g.player === caster && g.turn === s.turn && g.cast && printedMatches(g.cast, d)) : undefined;
  if (any && !out.some((w) => w.kind === "permission")) out.push({ kind: "permission", mana: d.manaCost, costs: [], exile: false, anyOwner: true, ...(any.exileCast ? { exileIfToGraveyard: true as const } : {}) });
  // "You may cast a creature spell from your graveyard this turn" (Chainer, Nightmare Adept): one spell for each, with
  // the once-each-turn permissions (rulings: each activation is a permission of its own).
  const used = s.turnLog?.gravePermits ?? [];
  // Locke, Treasure Hunter: one spell from among the cards milled, for its controller, whoever owns them.
  const fits = (g: NonNullable<GameState["graveGrants"]>[number]) => (g.cards ? g.player === caster && g.cards.some((c) => c.id === o.id && c.zc === (o.zoneChanges ?? 0)) : g.player === o.owner);
  const grants = d.manaCost ? (s.graveGrants ?? []).filter((g) => fits(g) && g.turn === s.turn && !used.includes(g.key) && printedMatches(g.filter, d)).map((g) => g.key) : [];
  if (grants.length) {
    const had = out.find((w) => w.kind === "turnPermission");
    if (had) had.permits = [...had.permits!, ...grants];
    else out.push({ kind: "turnPermission", mana: d.manaCost, costs: [], exile: false, permits: grants, ...(o.owner !== caster ? { anyOwner: true as const } : {}) });
  }
  return out;
}

/**
 * Which once-each-turn permission casting this card from a graveyard uses (TurnLog.gravePermits): the one chosen, or the
 * one fewest other cards in that graveyard could use (an artifact creature takes Muldrotha's artifact slot when no other
 * artifact card is there to cast, rulings).
 */
/**
 * The permits a spell with this mana value (its X counted, CR 202.3e) can use: Lurrus's only for 2 or less
 * (graveyardGrants maxMv).
 */
export function permitsForMv(s: GameState, permits: string[], mv: number): string[] {
  return permits.filter((k) => {
    const src = s.objects[k.split("@")[0]!];
    const max = src ? abilitiesOf(s, src).graveyardGrants?.find((g) => g.once)?.maxMv : undefined;
    return max === undefined || mv <= max;
  });
}

export function pickPermit(s: GameState, o: GameObject, permits: string[], chosen?: string): string | undefined {
  if (chosen !== undefined) return permits.includes(chosen) ? chosen : undefined;
  const others = player(s, o.owner).graveyard.filter((id) => id !== o.id);
  const demand = (k: string) => others.filter((id) => graveyardWays(s, obj(s, id)).some((w) => w.permits?.includes(k))).length;
  // One with no cost of its own first (Karador's before Exploration Broodship's sacrifice).
  return [...permits].sort((a, b) => permitCosts(s, a).length - permitCosts(s, b).length || demand(a) - demand(b))[0];
}

/**
 * A once-each-turn permission's own costs: Exploration Broodship's "by sacrificing a land in addition to paying its other
 * costs" (CR 601.2f-h).
 */
/** Whether a once-each-turn permission exiles the spell instead of putting it into a graveyard (Maestros Ascendancy). */
/** Serra Paragon: the ability a land or spell played with this once-each-turn permission gains ("If you do, it gains ..."). */
function permitGains(s: GameState, key: string): string | undefined {
  const src = s.objects[key.split("@")[0]!];
  return src ? abilitiesOf(s, src).graveyardGrants?.find((g) => g.once && g.gains)?.gains : undefined;
}

/** Edgar, Master Machinist: whether a spell cast with this once-each-turn permission enters tapped. */
function permitEntersTapped(s: GameState, key: string): boolean {
  const src = s.objects[key.split("@")[0]!];
  return !!src && !!abilitiesOf(s, src).graveyardGrants?.some((g) => g.once && g.entersTapped);
}

function permitExiles(s: GameState, key: string): boolean {
  const src = s.objects[key.split("@")[0]!];
  return !!(src && abilitiesOf(s, src).graveyardGrants?.find((g) => g.once)?.way.exile);
}

export function permitCosts(s: GameState, key: string): AdditionalCost[] {
  const src = s.objects[key.split("@")[0]!];
  return (src && abilitiesOf(s, src).graveyardGrants?.find((g) => g.once)?.way.costs) ?? [];
}

/** The permission a cast from this graveyard card uses: the one chosen, or the one pickPermit takes. */
function castPermit(s: GameState, id: ObjectId | undefined, d: CardDef, x: number, chosen?: string, caster?: PlayerId): string | undefined {
  if (chosen !== undefined) return chosen;
  const o = id !== undefined ? s.objects[id] : undefined;
  const via = o && graveyardWay(s, o, "turnPermission", caster);
  return o && via ? pickPermit(s, o, permitsForMv(s, via.permits ?? [], defMv(d) + x * xCount(parseManaCost(d.manaCost)))) : undefined;
}

/** A permission's label: Muldrotha's slot ("creature"), or the permanent's name. */
export function permitLabel(s: GameState, key: string): string {
  const grant = s.graveGrants?.find((g) => g.key === key);
  if (grant) return grant.source;
  const [ref, slot] = key.split(":");
  const src = s.objects[ref!.split("@")[0]!];
  return `${src ? characteristics(s, src).name : "a permanent"}${slot ? ` (${slot.toLowerCase()})` : ""}`;
}

/**
 * A permission to cast it from a graveyard that doesn't name a cost ("you may cast spells from your graveyard this turn",
 * Muldrotha's): its mana cost is paid, or an alternative cost instead (rulings on Muldrotha, Karador, Lurrus, Emry).
 */
export const permissionWay = (g: CastFromGraveyard) => g.kind === "permission" || g.kind === "turnPermission";

/** One way to cast it from a graveyard, if it has it. */
export function graveyardWay(s: GameState, o: GameObject, via?: CastFromGraveyardKind, caster?: PlayerId): CastFromGraveyard | undefined {
  return via ? graveyardWays(s, o, caster).find((g) => g.kind === via) : undefined;
}

export function describeVia(via: CastFromGraveyardKind | FaceDownKind): string {
  return via === "jumpStart" ? "jump-start" : via === "grantedFlashback" ? "flashback" : via === "grantedEscape" ? "escape" : via === "grantedRetrace" ? "retrace" : via === "permission" ? "a way to cast it from your graveyard" : via === "turnPermission" ? "a once-each-turn permission" : via;
}

/** ", kicked", ", kicked twice", ", kicked with {1}{U}", for the log. */
function describeKicks(d: CardDef, kicks: number[]): string {
  const k = compileCard(d).kicker!;
  const times = kicks.length === 1 ? "" : kicks.length === 2 ? " twice" : ` ${kicks.length} times`;
  const name = kickerName(k);
  if (k.optional) return `, paying its additional cost (${k.text})`;
  if (name !== "kicker" && name !== "multikicker") return `, paying its ${name} cost${times}`;
  if (k.extraCosts) return `, kicked (${k.text})`;
  if (k.multi || k.costs.length === 1) return kicks.length === 1 ? ", kicked" : `, kicked${times}`;
  return `, kicked with ${kicks.map((i) => k.costs[i]).join(" and ")}`;
}

/**
 * The parts of a kicker-like cost that aren't mana, for the times it's paid: once for kicker; for squad (CR 702.157a) each
 * time ("Squad—Exile four cards from your graveyard" paid twice exiles eight cards).
 */
function kickerExtraCosts(d: CardDef, kicks?: number[]): AdditionalCost[] {
  const k = compileCard(d).kicker;
  const times = kicks?.filter((i) => i === 0).length ?? 0;
  if (!k?.extraCosts || !times) return [];
  if (times === 1 || !k.multi) return k.extraCosts;
  return k.extraCosts.map((c) => (c.kind === "exileFromGraveyard" ? { ...c, n: c.n * times } : c));
}

/** Why these kicker choices aren't allowed (CR 702.33): each kicker cost once, multikicker's any number of times. */
function kickProblem(d: CardDef, kicks?: number[]): string | null {
  if (!kicks?.length) return null;
  const k = compileCard(d).kicker;
  // "As an additional cost to cast this spell, waterbend {5}": always paid, so nothing to choose.
  if (k?.required) return `${d.name}'s ${kickerName(k)} cost is always paid`;
  if (!k) return `${d.name} has no kicker`;
  if (kicks.some((i) => !Number.isInteger(i) || i < 0 || i >= k.costs.length)) return `${d.name} has no such kicker cost`;
  if (!k.multi && new Set(kicks).size !== kicks.length) return "each kicker cost can be paid only once";
  return null;
}

/** Creatures `pid` could sacrifice for this card's casualty N: creatures they control with power N or greater (CR 702.153a). */
export function casualtyCandidates(s: GameState, pid: PlayerId, d: CardDef): ObjectId[] {
  const n = compileCard(d).casualty;
  if (n === undefined) return [];
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) === pid && objIsType(s, o, "Creature") && power(s, o) >= n && canBeSacrificed(s, o);
  });
}

/**
 * "Choose both instead" of "Choose one" (see AbilityBody.modal.both): when the spell is cast using teamwork, or by a
 * player who controls a commander as they cast it (any commander, rulings on Akroma's Will); "choose any number instead"
 * when it's kicked (Inscriptions).
 */
export function bothModes(s: GameState, pid: PlayerId, body: AbilityBody, choices?: Pick<CostChoices, "teamwork" | "kicks">): boolean {
  const both = body.modal?.both;
  if (both === "teamwork") return !!choices?.teamwork?.length;
  if (both === "kicked") return !!choices?.kicks?.length;
  if (both === "commander") return s.battlefield.some((id) => obj(s, id).isCommander && controllerOf(s, obj(s, id)) === pid);
  // "If you control a Wizard as you cast ~" (Flame of Anor): as it's cast; what happens to the Wizard later doesn't matter (rulings).
  if (both === "control" && body.modal?.bothIf) return staticConditionNow(s, body.modal.bothIf, "", pid);
  return false;
}

/** The power a creature adds toward teamwork's total: like crew's, a negative power counts as 0. */
export const teamworkPower = (s: GameState, id: ObjectId) => Math.max(0, power(s, obj(s, id)));

/**
 * Creatures `pid` could tap for teamwork: untapped creatures they control, summoning sick or not (tapping them isn't a
 * {T} cost, CR 302.6).
 */
export function teamworkCandidates(s: GameState, pid: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return !o.tapped && controllerOf(s, o) === pid && objIsType(s, o, "Creature");
  });
}

function teamworkProblem(s: GameState, pid: PlayerId, d: CardDef, choices?: CostChoices, convoke?: ObjectId[]): string | null {
  const ids = choices?.teamwork;
  if (ids === undefined || !ids.length) return null;
  const n = compileCard(d).teamwork;
  if (n === undefined) return `${d.name} doesn't have teamwork`;
  const tp = tapCreaturesProblem(s, pid, ids, "pay for teamwork");
  if (tp) return tp;
  if (ids.some((id) => convoke?.includes(id))) return "a creature can't be tapped for both convoke and teamwork";
  const total = ids.reduce((x, id) => x + teamworkPower(s, id), 0);
  if (total < n) return `teamwork ${n} taps creatures with total power ${n} or more (these have ${total})`;
  return null;
}

/** Creatures `pid` could tap for conspire: untapped creatures they control that share a color with the spell (CR 702.78a). */
export function conspireCandidates(s: GameState, pid: PlayerId, spell: ObjectId): ObjectId[] {
  const o = obj(s, spell);
  if (!compileCard(defOf(s, o)).conspire) return [];
  const colors = defOf(s, o).colors;
  return s.battlefield.filter((id) => {
    const c = obj(s, id);
    return !c.tapped && controllerOf(s, c) === pid && objIsType(s, c, "Creature") && characteristics(s, c).colors.some((x) => colors.includes(x));
  });
}

function conspireProblem(s: GameState, pid: PlayerId, spell: ObjectId, choices?: CostChoices, convoke?: ObjectId[]): string | null {
  const ids = choices?.conspire;
  if (ids === undefined || !ids.length) return null;
  if (!compileCard(defOf(s, obj(s, spell))).conspire) return `${nameOf(s, spell)} doesn't have conspire`;
  if (ids.length !== 2 || ids[0] === ids[1]) return "conspire taps two untapped creatures you control";
  const ok = conspireCandidates(s, pid, spell);
  if (ids.some((id) => !ok.includes(id))) return "conspire taps untapped creatures you control that share a color with it";
  if (ids.some((id) => convoke?.includes(id) || choices?.teamwork?.includes(id))) return "a creature can't be tapped twice to cast it";
  return null;
}

function giftProblem(s: GameState, pid: PlayerId, d: CardDef, choices?: CostChoices): string | null {
  const to = choices?.gift;
  if (to === undefined) return null;
  if (!compileCard(d).gift) return `${d.name} doesn't have gift`;
  if (!opponents(s, pid).includes(to)) return "a gift is promised to an opponent";
  return null;
}

/** What `pid` could sacrifice for this card's bargain: an artifact, enchantment, or token they control (CR 702.166a). */
export function bargainCandidates(s: GameState, pid: PlayerId, spell: ObjectId): ObjectId[] {
  if (!compileCard(defOf(s, obj(s, spell))).bargain) return [];
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return id !== spell && controllerOf(s, o) === pid && (o.isToken || objIsType(s, o, "Artifact") || objIsType(s, o, "Enchantment")) && canBeSacrificed(s, o);
  });
}

function bargainProblem(s: GameState, pid: PlayerId, spell: ObjectId, d: CardDef, choices?: CostChoices): string | null {
  const id = choices?.bargain;
  if (id === undefined) return null;
  if (!compileCard(d).bargain) return `${d.name} doesn't have bargain`;
  if (!bargainCandidates(s, pid, spell).includes(id)) return "bargain sacrifices an artifact, enchantment, or token you control";
  if (choices?.sacrifice?.includes(id) || choices?.casualty === id) return `${nameOf(s, id)} is already being sacrificed`;
  return null;
}

/** What `pid` could sacrifice for this card's offering (CR 702.48a): a permanent they control of its quality. */
export function offeringCandidates(s: GameState, pid: PlayerId, spell: ObjectId): ObjectId[] {
  const filter = compileCard(defOf(s, obj(s, spell))).offering;
  if (!filter) return [];
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return id !== spell && controllerOf(s, o) === pid && objectMatches(s, filter, o, pid, false) && canBeSacrificed(s, o);
  });
}

function offeringProblem(s: GameState, pid: PlayerId, spell: ObjectId, d: CardDef, choices?: CostChoices): string | null {
  const id = choices?.offering;
  if (id === undefined) return null;
  const filter = compileCard(d).offering;
  if (!filter) return `${d.name} doesn't have offering`;
  if (!offeringCandidates(s, pid, spell).includes(id)) return `offering sacrifices ${/^[AEIOU]/i.test(filter.text) ? "an" : "a"} ${filter.text} you control`;
  if (choices?.sacrifice?.includes(id) || choices?.casualty === id || choices?.bargain === id) return `${nameOf(s, id)} is already being sacrificed`;
  return null;
}

/** A card's mana value in a graveyard: its mana cost's, X as 0 (CR 202.3). */
const cardMv = (s: GameState, id: ObjectId) => defMv(defOf(s, obj(s, id)));

/** The total mana value of these cards, for collecting evidence (CR 701.59a). */
export const evidenceValue = (s: GameState, ids: ObjectId[]) => ids.reduce((n, id) => n + cardMv(s, id), 0);

/** The cards `pid` could exile to collect evidence: their graveyard, but not `not` (a spell on its way to the stack) or `taken`. */
export const evidenceCandidates = (s: GameState, pid: PlayerId, not?: ObjectId, taken: ObjectId[] = []) => player(s, pid).graveyard.filter((id) => id !== not && !taken.includes(id));

/**
 * Why `ids` can't collect evidence N, or null: cards in `pid`'s graveyard with total mana value N or more (CR 701.59a).
 * Without `ids`, whether they could: without enough, they can't choose to (701.59b).
 */
export function evidenceProblem(s: GameState, pid: PlayerId, n: number, ids: ObjectId[] | undefined, not?: ObjectId, taken: ObjectId[] = []): string | null {
  const pool = evidenceCandidates(s, pid, not, taken);
  if (!ids) return evidenceValue(s, pool) >= n ? null : `you need cards with total mana value ${n} or more in your graveyard`;
  if (new Set(ids).size !== ids.length || ids.some((id) => !pool.includes(id))) return "collect evidence with cards from your graveyard";
  if (evidenceValue(s, ids) < n) return `collect evidence ${n}: those cards have total mana value ${evidenceValue(s, ids)}`;
  return null;
}

/** Cards to collect evidence N with when nobody picked them: the fewest, biggest mana values first (null if it can't be done). */
export function autoEvidence(s: GameState, pid: PlayerId, n: number, not?: ObjectId, taken: ObjectId[] = []): ObjectId[] {
  const pool = evidenceCandidates(s, pid, not, taken).sort((a, b) => cardMv(s, b) - cardMv(s, a));
  const out: ObjectId[] = [];
  for (const id of pool) {
    if (evidenceValue(s, out) >= n) break;
    out.push(id);
  }
  // Then drop the biggest ones the rest already make up for, so as little as possible is exiled.
  for (let i = 0; i < out.length; i++) if (evidenceValue(s, out.filter((_, j) => j !== i)) >= n) out.splice(i--, 1);
  return out;
}

/** Collect evidence N with these cards (CR 701.59a): they're exiled, and "whenever you collect evidence" triggers. */
export function collectEvidence(s: GameState, p: Player, ids: ObjectId[], n: number) {
  log(s, `${p.name} collects evidence ${n}${ids.length ? `, exiling ${ids.map((id) => nameOf(s, id)).join(", ")} from their graveyard` : ""}.`);
  for (const id of ids) moveObject(s, id, "exile");
  fireEvent(s, { type: "evidenceCollected", player: p.id });
}

/** "You may collect evidence N" as an additional cost to cast it (CR 701.59a). */
function evidenceCastProblem(s: GameState, pid: PlayerId, o: GameObject, d: CardDef, choices?: CostChoices): string | null {
  if (!choices?.evidence) return null;
  const n = compileCard(d).evidence;
  if (n === undefined) return `${d.name} doesn't let you collect evidence`;
  const taken = [...(choices.exileCards ?? []), ...(choices.delve ?? []), ...(choices.collect ?? [])];
  return evidenceProblem(s, pid, n, choices.evidence, o.id, taken);
}

function casualtyProblem(s: GameState, pid: PlayerId, d: CardDef, choices?: CostChoices): string | null {
  const id = choices?.casualty;
  if (id === undefined) return null;
  const n = compileCard(d).casualty;
  if (n === undefined) return `${d.name} doesn't have casualty`;
  if (!casualtyCandidates(s, pid, d).includes(id)) return `casualty ${n} sacrifices a creature you control with power ${n} or greater`;
  if (choices?.sacrifice?.includes(id)) return `${nameOf(s, id)} is already being sacrificed`;
  return null;
}

/** Can these additional costs be paid (CR 601.2b, 601.2f-h)? Without choices, just whether they could be. */
function additionalCostProblem(s: GameState, pid: PlayerId, o: GameObject, choices?: CostChoices, x = 0, modes?: number[], targets?: TargetChoice[]): string | null {
  const d = defOf(s, o);
  // The Defilers: each permanent's life once, and only one whose offer applies to this spell.
  const lifeFor = choices?.lifeFor ?? [];
  if (lifeFor.length) {
    const offers = costModsFor(s, pid, o, d, x).lifeOffers;
    if (new Set(lifeFor).size !== lifeFor.length || lifeFor.some((id) => !offers.some((l) => l.id === id))) return `${d.name} can't pay life for that`;
  }
  return extraCostProblem(s, pid, o, castExtraCosts(d, { ...choices, objectId: o.id, ...(modes ? { modes } : {}), ...(targets ? { targets } : {}) }, x, s, pid), choices, `cast ${d.name}`);
}

/** The costs beyond mana of casting it this way: additional costs, and those of a graveyard or alternative cost (CR 601.2f-h). */
export function castExtraCosts(d: CardDef, choices?: Pick<CostChoices, "via" | "alt" | "costOr" | "buyback" | "permit" | "lifeFor" | "kicks"> & { modes?: number[]; targets?: TargetChoice[]; /** The card being cast, for the once-each-turn permission it would use. */ objectId?: ObjectId }, x = 0, s?: GameState, pid?: PlayerId): AdditionalCost[] {
  const or = choices?.costOr === undefined ? undefined : compileCard(d).costOr?.[choices.costOr]?.cost;
  // "Escalate—Discard a card": that cost once for each mode beyond the first (CR 702.120a).
  const esc = compileCard(d).spell?.modal?.escalate?.cost;
  const beyond = Math.max(0, (choices?.modes?.length ?? 0) - 1);
  const escalate: AdditionalCost[] = esc && beyond && "n" in esc ? [{ ...esc, n: esc.n * beyond }] : [];
  // "Spells your opponents cast that target ~ cost an additional 3 life to cast" (Terror of the Peaks): each such
  // permanent once, however often it's targeted, as for a mana increase.
  let lifeTax = 0;
  if (s && pid !== undefined)
    for (const id of new Set((choices?.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])))) {
      const t = s.objects[id];
      if (t?.zone === "battlefield" && controllerOf(s, t) !== pid) lifeTax += abilitiesOf(s, t).targetLifeTax ?? 0;
    }
  const permit = s && choices?.via === "turnPermission" ? castPermit(s, choices.objectId, d, x, choices.permit, pid) : undefined;
  // The Defilers: the life chosen to pay for each one (CR 601.2b); castProblem checks each one applies.
  const defilerLife = s ? (choices?.lifeFor ?? []).reduce((n, id) => n + Math.max(0, ...((s.objects[id] && s.objects[id]!.zone === "battlefield" ? abilitiesOf(s, s.objects[id]!).costMods : undefined) ?? []).map((m) => m.payLife ?? 0)), 0) : 0;
  // "Madness—{2}{B}, Pay 8 life" (Shadowgrange Archfiend): the life too, cast for its madness cost as madness's trigger
  // resolves (CR 702.35a).
  const madnessPend = s?.pending?.kind === "castFree" && s.pending.how === "madness" && s.pending.player === pid ? s.pending : undefined;
  const madnessLife = madnessPend && s!.objects[madnessPend.objectId] && defOf(s!, s!.objects[madnessPend.objectId]!).name === d.name ? (compileCard(d).madnessLife ?? 0) : 0;
  const costs = [...(compileCard(d).additionalCosts ?? []), ...(madnessLife ? [{ kind: "payLife" as const, n: madnessLife }] : []), ...(or ? [or] : []), ...(graveyardCast(d, choices?.via)?.costs ?? []), ...(permit ? permitCosts(s!, permit) : []), ...(altCost(d, choices?.alt, s, pid)?.costs ?? []), ...escalate, ...(choices?.buyback ? (compileCard(d).buybackCosts ?? []) : []), ...kickerExtraCosts(d, choices?.kicks), ...(lifeTax ? [{ kind: "payLife" as const, n: lifeTax }] : []), ...(defilerLife ? [{ kind: "payLife" as const, n: defilerLife }] : [])];
  // "Pay X life", "sacrifice X creatures": as many as the X announced (CR 107.3a); the Shoals' "a red card with mana value
  // X", that mana value.
  return costs.map((c) =>
    xCost(c) ? { ...c, n: x } : c.kind === "sacrifice" && c.half && s && pid !== undefined ? { ...c, n: Math.ceil(s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, c.filter, obj(s, id), pid, false)).length / 2) } : c.kind === "exileFromHand" && c.mvX && c.filter ? { ...c, filter: { ...c.filter, manaValue: { min: x, max: x }, text: c.filter.text.replace(/\bX\b/, String(x)) } } : c,
  );
}

const xCost = (c: AdditionalCost) => "x" in c && !!c.x;

/** An activated ability's costs beyond mana with its X announced: "Sacrifice X Squirrels" is X of them (CR 107.3a, 602.2b). */
export function activatedCosts(ab: ActivatedAbility, x: number | undefined, src?: GameObject): AdditionalCost[] {
  return (ab.costs ?? []).map((c0) => {
    // "Sacrifice a creature of the chosen type" (Etchings of the Chosen): the type chosen for the source (linked, CR 607.2d).
    const c = c0.kind === "sacrifice" && c0.filter.chosen ? { ...c0, filter: bindChosen(c0.filter, src?.chosen) } : c0;
    return xCost(c) ? { ...c, n: x ?? 0 } : c.kind === "discard" && c.mvX && c.filter ? { ...c, filter: { ...c.filter, manaValue: { min: x ?? 0, max: x ?? 0 }, text: c.filter.text.replace(/\bX\b/, String(x ?? 0)) } } : c;
  });
}

/** "Discard a card with mana value X" (Kozilek, the Great Distortion): X announced, then a card with that mana value. */
const mvXCost = (c: AdditionalCost) => c.kind === "discard" && !!c.mvX && !!c.filter;

/** Does the ability have an X to announce in a cost beyond mana, as Chatterfang's "Sacrifice X Squirrels"? */
export const abilityCostsHaveX = (ab: ActivatedAbility): boolean => !!ab.energyX || !!ab.removeCounters?.x || !!ab.costs?.some((c) => xCost(c) || mvXCost(c));

/** Costs paid with objects the player picks; "discard a card at random" and "the top card of your graveyard" aren't. */
const costNeedsPick = (c: AdditionalCost) =>
  c.kind === "sacrifice" || c.kind === "craft" || (c.kind === "discard" && !c.random) || c.kind === "returnToHand" || c.kind === "tap" || c.kind === "reveal" || c.kind === "exileFromHand" || (c.kind === "exileFromGraveyard" && !c.top) || c.kind === "removeCounters" || c.kind === "putCounter";
const costPickKey = (c: AdditionalCost): "sacrifice" | "discard" | "returnToHand" | "tap" | "reveal" | "exileFromHand" | "exileCards" | "counters" | "craft" | "counterOn" =>
  c.kind === "exileFromGraveyard" ? "exileCards" : c.kind === "removeCounters" ? "counters" : c.kind === "putCounter" ? "counterOn" : (c.kind as "sacrifice" | "discard" | "returnToHand" | "tap" | "reveal" | "exileFromHand" | "craft");

/** What can get the counter for "Put a -1/-1 counter on a creature you control" (Hatchet Bully): ~ too. */
export function counterOnCandidates(s: GameState, pid: PlayerId, c: Extract<AdditionalCost, { kind: "putCounter" }>): ObjectId[] {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, c.filter, obj(s, id), pid, false) && !countersBanned(s, obj(s, id), c.counter));
}

/** Does casting it this way have an X to announce in a cost beyond mana, as Toxic Deluge's "pay X life" (CR 107.3a)? */
export function costsHaveX(d: CardDef, choices?: Pick<CostChoices, "via" | "alt" | "costOr">): boolean {
  return castExtraCosts(d, choices).some(xCost);
}

/** "Sacrifice a creature or pay {3}{B}": the extra mana of the way chosen to pay it, if that's mana (CR 601.2f). */
const costOrMana = (d: CardDef, i?: number) => (i === undefined ? "" : (compileCard(d).costOr?.[i]?.mana ?? ""));

/**
 * Can these costs beyond mana be paid, for a spell (`o` is the card being cast) or an ability (`o` is its
 * source)? Without choices, just whether they could be. `doing`: "cast X", "activate X's ability".
 */
function extraCostProblem(s: GameState, pid: PlayerId, o: GameObject, costs: AdditionalCost[], choices: CostChoices | undefined, doing: string): string | null {
  const d = defOf(s, o);
  const p = player(s, pid);
  const given = (k: "sacrifice" | "discard" | "exileCards" | "returnToHand" | "tap" | "reveal" | "exileFromHand") => choices?.[k];
  for (const k of ["sacrifice", "discard", "exileCards", "returnToHand", "tap", "reveal", "exileFromHand"] as const)
    if (given(k)?.length && !costs.some((c) => c.kind === (k === "exileCards" ? "exileFromGraveyard" : k) || (c.kind === "forage" && (k === "sacrifice" || k === "exileCards")))) return `${d.name} doesn't ask you to ${k === "exileCards" ? "exile cards" : k === "returnToHand" ? "return a permanent to hand" : k === "tap" ? "tap permanents" : k === "reveal" ? "reveal cards" : k === "exileFromHand" ? "exile cards from your hand" : k}`;
  const both = [...(choices?.tap ?? []), ...(choices?.sacrifice ?? [])];
  if (new Set(both).size !== both.length) return "one permanent can't pay two costs";
  if (choices?.collect && !costs.some((c) => c.kind === "collectEvidence")) return `${d.name} doesn't ask you to collect evidence`;
  if (choices?.craft?.length && !costs.some((c) => c.kind === "craft")) return `${d.name} doesn't ask you to exile materials`;
  if (choices?.counters?.length && !costs.some((c) => c.kind === "removeCounters")) return `${d.name} doesn't ask you to remove counters`;
  if (choices?.counterOn?.length && !costs.some((c) => c.kind === "putCounter")) return `${d.name} doesn't ask you to put a counter on a permanent`;
  if (costs.filter((c) => c.kind === "collectEvidence").length > 1) return `${d.name} would collect evidence twice`;
  for (const c of costs) {
    if (c.kind === "collectEvidence") {
      // Each card pays one cost only: not also exiled for another cost, delve or the spell's own evidence.
      const taken = [...(choices?.exileCards ?? []), ...(choices?.delve ?? []), ...(choices?.evidence ?? [])];
      const problem = evidenceProblem(s, pid, c.n, choices?.collect, o.id, taken);
      if (problem) return `${problem} to ${doing}`;
      continue;
    }
    if (c.kind === "payLife") {
      if (c.n && payableLife(s, p.id) < c.n) return `you can't pay ${c.n} life`; // CR 119.4, 119.8
      continue;
    }
    if (c.kind === "craft") {
      // Craft's materials (CR 702.167a-b): any mix of permanents you control and cards in your graveyard, each once, and
      // not one that pays another cost.
      const pool = craftCandidates(s, pid, o, c).filter((id) => !both.includes(id));
      const what = `${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.filter.text}`;
      const chosen = choices?.craft;
      if (!chosen) {
        if (pool.length < c.n) return `you need to exile ${what} you control or in your graveyard to ${doing}`;
        continue;
      }
      if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id))) return `choose ${what} to exile`;
      continue;
    }
    if (c.kind === "revealHand") continue; // always possible, even with an empty or already revealed hand (rulings)
    if (c.kind === "forage") {
      // CR 701.61a: three cards from your graveyard (the card itself isn't there while it's cast, CR 601.2a), or a Food.
      const ways = forageWays(s, pid, o);
      const sac = choices?.sacrifice;
      const ex = choices?.exileCards;
      if (sac?.length && ex?.length) return "forage one way: exile three cards from your graveyard or sacrifice a Food";
      if (sac?.length) {
        if (sac.length !== 1 || !ways.foods.includes(sac[0]!)) return "choose a Food to sacrifice to forage";
      } else if (ex?.length) {
        if (ex.length !== 3 || new Set(ex).size !== 3 || ex.some((id) => !ways.cards.includes(id))) return "choose three cards in your graveyard to exile to forage";
      } else if (!ways.foods.length && ways.cards.length < 3) return `you need to forage (exile three cards from your graveyard or sacrifice a Food) to ${doing}`;
      continue;
    }
    if (c.kind === "removeCounters") {
      // Any mix of the counters on those permanents (CR 602.2b): as many as it says, each one there to remove.
      const pool = counterCostCandidates(s, pid, o, c);
      const what = `${c.n} ${c.counter ? `${c.counter} ` : ""}counter${c.n === 1 ? "" : "s"} ${c.self ? `from ${d.name}` : `from among ${c.filter.text}`}`;
      const chosen = choices?.counters;
      if (!chosen) {
        if (pool.reduce((n, x) => n + x.n, 0) < c.n) return `you need to remove ${what} to ${doing}`;
        continue;
      }
      const used = new Map<string, number>();
      for (const x of chosen) used.set(`${x.id}|${x.kind}`, (used.get(`${x.id}|${x.kind}`) ?? 0) + 1);
      if (chosen.length !== c.n || [...used].some(([k, n]) => n > (pool.find((x) => `${x.id}|${x.kind}` === k)?.n ?? 0))) return `choose ${what} to remove`;
      continue;
    }
    if (c.kind === "putCounter") {
      // Hatchet Bully: one permanent you control that matches, not one counters can't be put on (rulings on Solemnity).
      const pool = counterOnCandidates(s, pid, c);
      // Blight N: all N counters on one creature you control (CR 701.68a, rulings), which can't be done with none (701.68b).
      const what = `${/^[aeiou]/i.test(c.filter.text) ? "an" : "a"} ${c.filter.text}`;
      const counters = c.n === 1 ? `a ${c.counter} counter` : `${c.n} ${c.counter} counters`;
      const chosen = choices?.counterOn;
      if (!chosen) {
        if (!pool.length) return c.blight ? `you need a creature to blight ${c.n} to ${doing}` : `you need to put ${counters} on ${what} to ${doing}`;
        continue;
      }
      if (chosen.length !== 1 || !pool.includes(chosen[0]!)) return `choose ${what} to put ${counters} on`;
      continue;
    }
    if (c.kind === "mill") {
      // Not with fewer cards in the library (CR 701.17b).
      if (p.library.length < c.n) return `you need ${c.n === 1 ? "a card" : `${c.n} cards`} in your library to ${c.exile ? "exile" : "mill"} to ${doing}`;
      continue;
    }
    if (c.kind === "giveLife") {
      // A player who can't gain life can't be had gain life to pay a cost (CR 119.7; Invigorate rulings), though a
      // replaced life gain (Sulfuric Vortex's) can. Players who left the game aren't players any more (CR 800.4a).
      const others = opponents(s, pid);
      if (c.each) {
        if (others.some((q) => !canGainLife(s, q))) return `every other player must be able to gain life to ${doing} this way`;
        continue;
      }
      const to = choices?.lifeTo;
      if (to === undefined) {
        if (!others.some((q) => canGainLife(s, q))) return "no opponent can gain life";
        continue; // chosen as it's paid
      }
      if (!others.includes(to)) return "choose an opponent to gain the life";
      if (!canGainLife(s, to)) return `${player(s, to).name} can't gain life`;
      continue;
    }
    // "Exile the top creature card of your graveyard": those cards and no others, nothing to choose (CR 404.1).
    if (c.kind === "exileFromGraveyard" && c.top) {
      const top = topGraveyardCards(s, pid, c.n, c.filter);
      const what = `the top ${c.n === 1 ? (c.filter?.text ?? "card") : `${c.n} ${c.filter?.text ?? "card"}s`} of your graveyard`;
      if (top.length < c.n) return `you need to exile ${what} to ${doing}`;
      const chosen = choices?.exileCards;
      if (chosen?.length && (chosen.length !== top.length || chosen.some((id) => !top.includes(id)))) return `you exile ${what}, not cards of your choice`;
      continue;
    }
    const pool =
      c.kind === "sacrifice"
        ? s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !(c.other && id === o.id && !(c.selfIf && objectMatches(s, c.selfIf, o, pid, false))) && objectMatches(s, c.filter, obj(s, id), pid, false) && (c.exile || canBeSacrificed(s, obj(s, id))))
        : c.kind === "tap"
          ? tapCostCandidates(s, pid, o, c)
        : c.kind === "returnToHand"
          ? returnCandidates(s, pid, c)
          : c.kind === "reveal" && c.orControl
          ? beholdCandidates(s, pid, o, c)
          : c.kind === "discard" || c.kind === "reveal" || c.kind === "exileFromHand"
          ? p.hand.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))) // it's on the stack by the time costs are paid (CR 601.2a)
          : c.kind === "exileFromGraveyard" && c.linked
          ? linkedExileCards(s, o)
          : c.kind === "exileFromGraveyard" && c.process
          ? processCandidates(s, pid)
          : p.graveyard.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))); // "other cards" for escape
    const what =
      c.kind === "sacrifice"
        ? `${c.n === 1 ? (c.other ? "another" : "a") : c.n} ${c.filter.text}`
        : c.kind === "tap"
        ? `${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.filter.text}`
        : c.kind === "reveal" && c.orControl
        ? `${beholdWhat(c)}${c.exile ? " and exile it" : ""}`
        : c.kind === "discard" || c.kind === "reveal" || c.kind === "exileFromHand"
          ? c.filter
            ? `${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.filter.text}`
            : `${c.n === 1 ? "a card" : `${c.n} cards`}`
          : c.kind === "exileFromGraveyard" && c.linked
          ? `a card exiled with ${d.name}`
          : c.kind === "exileFromGraveyard" && c.process
          ? "a card an opponent owns from exile"
          : `${c.n === 1 ? (/^[aeiou]/i.test(c.filter?.text ?? "card") ? "an" : "a") : c.n} ${c.filter?.text ?? "card"}`;
    const verb = c.kind === "sacrifice" ? (c.exile ? "exile" : "sacrifice") : c.kind === "discard" ? "discard" : c.kind === "returnToHand" ? "return" : c.kind === "tap" ? (c.untap ? "untap" : "tap") : c.kind === "reveal" ? (c.orControl ? "behold" : "reveal") : c.kind === "exileFromHand" ? (c.toLibrary ? "put on top of your library" : "exile from your hand") : c.kind === "exileFromGraveyard" && (c.linked || c.process) ? "put into its owner's graveyard" : "exile";
    const chosen = given(c.kind === "exileFromGraveyard" ? "exileCards" : c.kind);
    // "Discard a card at random": nothing to choose (CR 701.9b).
    if (c.kind === "discard" && c.random) {
      if (chosen?.length) return `${d.name}'s discard is at random`;
      if (pool.length < c.n) return `you need to ${verb} ${what} to ${doing}`;
      continue;
    }
    // "Sacrifice a Swamp and a Forest" (Jarad): one permanent for each, a land that's both being only one (rulings).
    const each = c.kind === "sacrifice" ? c.oneOfEach : undefined;
    if (each) {
      const fitEach = (specs: TargetSpec[], ids: ObjectId[]): boolean => {
        const [f, ...rest] = specs;
        return !f || ids.some((id) => objectMatches(s, f, obj(s, id), pid, false) && fitEach(rest, ids.filter((x) => x !== id)));
      };
      if (!chosen) {
        if (!fitEach(each, pool)) return `you need to ${verb} ${what} to ${doing}`;
        continue;
      }
      if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id)) || !fitEach(each, chosen)) return `choose ${what} to ${verb}`;
      continue;
    }
    // "Discard an Island card and another card" (Foil): one of them an Island card.
    const oneOf = c.kind === "discard" ? c.oneOf : undefined;
    const fits = (id: ObjectId) => !oneOf || printedMatches(oneOf, defOf(s, obj(s, id)));
    const full = oneOf ? `${/^[aeiou]/i.test(oneOf.text) ? "an" : "a"} ${oneOf.text} and ${c.n === 2 ? "another card" : `${c.n - 1} other cards`}` : what;
    // "You may exile any number of blue cards from your hand": none is fine.
    if (c.kind === "exileFromHand" && c.anyNumber) {
      if (chosen && (new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id)))) return `choose ${c.filter?.text ?? "card"}s in your hand to exile`;
      continue;
    }
    if (!chosen) {
      // Untapping: also what can be tapped for mana first (Halo Fountain).
      const can = c.kind === "tap" && c.untap ? [...pool, ...untapViaMana(s, pid, o, c)] : pool;
      if (c.n > 0 && (can.length < c.n || !can.some(fits))) return `you need to ${verb} ${full} to ${doing}`;
      if (c.kind === "sacrifice" && c.differentNames && differentlyNamed(s, pool).length < c.n) return `you need to ${verb} ${full} to ${doing}`;
      continue;
    }
    // X can be 0 ("Exile any number of cards from your graveyard", Painbringer): nothing chosen.
    if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id)) || (chosen.length > 0 && !chosen.some(fits))) return `choose ${full} to ${verb}`;
    if (c.kind === "sacrifice" && c.differentNames && !namesDiffer(s, chosen)) return `choose ${full} to ${verb}`;
  }
  return null;
}

/** "With different names" (Transmutation Font): no two share a name; a face-down permanent has none (CR 708.2). */
export function namesDiffer(s: GameState, ids: ObjectId[]): boolean {
  const names = ids.map((id) => characteristics(s, obj(s, id)).name).filter((n) => n);
  return new Set(names).size === names.length;
}

/** As many of `ids` as can be taken with different names, in their order (see namesDiffer). */
export function differentlyNamed(s: GameState, ids: ObjectId[]): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ids) if (namesDiffer(s, [...out, id])) out.push(id);
  return out;
}

const FOOD: TargetSpec = { kind: "object", types: ["Artifact"], subtypes: ["Food"], text: "Food" };

/** What can pay forage (CR 701.61a): the cards in `pid`'s graveyard other than `o`, and the Foods they could sacrifice. */
export function forageWays(s: GameState, pid: PlayerId, o?: GameObject): { cards: ObjectId[]; foods: ObjectId[] } {
  return {
    cards: player(s, pid).graveyard.filter((id) => id !== o?.id),
    foods: s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, FOOD, obj(s, id), pid, false) && canBeSacrificed(s, obj(s, id))),
  };
}

/**
 * What can be tapped for "Tap an untapped creature you control": untapped ones you control, summoning sick or not
 * (CR 302.6 restricts only {T} and {Q}). Not the source when the ability's {T} taps it already.
 */
export function tapCostCandidates(s: GameState, pid: PlayerId, source: GameObject, c: Extract<AdditionalCost, { kind: "tap" }>): ObjectId[] {
  return s.battlefield.filter((id) => {
    const x = obj(s, id);
    // "Untap a tapped creature you control": tapped ones, but not one a stun counter would keep tapped (CR 122.1d).
    if (c.untap ? !x.tapped || (x.counters.stun ?? 0) > 0 : x.tapped) return false;
    return controllerOf(s, x) === pid && !(c.other && id === source.id) && objectMatches(s, c.filter, x, pid, false);
  });
}

/**
 * The untapped permanents "Untap a tapped creature you control" (Halo Fountain) can untap all the same: ones that can
 * be tapped for mana while paying for the ability, then untapped for its cost, since mana abilities are activated
 * before costs are paid (CR 601.2g-h, 602.2b; rulings on Halo Fountain). Not one with a stun counter (CR 122.1d).
 */
export function untapViaMana(s: GameState, pid: PlayerId, source: GameObject, c: Extract<AdditionalCost, { kind: "tap" }>): ObjectId[] {
  return s.battlefield.filter((id) => {
    const x = obj(s, id);
    if (id === source.id || x.tapped || (x.counters.stun ?? 0) > 0 || controllerOf(s, x) !== pid || !objectMatches(s, c.filter, x, pid, false)) return false;
    return manaAbilitiesOn(s, x).some((m, i) => m.tap && !m.manaCost && !m.tapCost && !m.sacrificeSelf && !manaAbilityProblem(s, pid, x, i, true)) || payableActivatedMana(s, pid, x).some((m) => m.ab.tap && !m.ab.manaCost && !m.ab.sacrificeSelf);
  });
}

/**
 * The counters "Remove three counters from among other artifacts, creatures, and planeswalkers you control" can remove:
 * each permanent you control that matches and each kind of counter on it (only `counter`'s kind if the cost names one).
 */
export function counterCostCandidates(s: GameState, pid: PlayerId, source: GameObject, c: Extract<AdditionalCost, { kind: "removeCounters" }>): { id: ObjectId; kind: string; n: number }[] {
  return s.battlefield.flatMap((id) => {
    const x = obj(s, id);
    if (controllerOf(s, x) !== pid || (c.other && id === source.id) || (c.self && id !== source.id) || !objectMatches(s, c.filter, x, pid, false)) return [];
    return Object.entries(x.counters).filter(([k, n]) => n > 0 && (!c.counter || k === c.counter) && !countersStay(s, x, k)).map(([kind, n]) => ({ id, kind, n }));
  });
}

/** The cards still exiled with `o` by its linked exile ability, as this object (CR 607.2a, 400.7): Jester's Scepter's cost. */
/**
 * "If it shares a card type with the exiled card" (Cemetery Protector): one of `types` is a card type (CR 205.2a) of a card
 * the linked ability of the source exiled (its key in `s.linkedExile`, "id@zoneChanges"), still in exile (CR 607.2a).
 */
export function sharesTypeWithLinked(s: GameState, key: string, types: readonly string[]): boolean {
  return (s.linkedExile?.[key] ?? []).some((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc && defOf(s, s.objects[l.id]!).types.some((t) => types.includes(t)));
}

export function linkedExileCards(s: GameState, o: GameObject): ObjectId[] {
  return (s.linkedExile?.[`${o.id}@${o.zoneChanges ?? 0}`] ?? []).filter((l) => s.objects[l.id]?.zone === "exile" && (s.objects[l.id]!.zoneChanges ?? 0) === l.zc).map((l) => l.id);
}

/**
 * A card in exile face down (CR 406.3): foretold (CR 702.143a), hidden away (702.75a) or exiled face down by an effect;
 * the group it was exiled in (what exiled it, and when), or undefined for a face-up card.
 */
export function faceDownExileGroup(o: GameObject): string | undefined {
  if (o.zone !== "exile") return undefined;
  if (o.foretold) return `foretold:${o.id}`; // each card is foretold on its own (CR 702.143a)
  if (o.hiddenExile) return `${o.hiddenExile.by}@${o.hiddenExile.at ?? ""}`;
  return undefined;
}

/** May `viewer` look at this card in exile? Not at someone else's foretold card, nor at one exiled face down they haven't seen (CR 406.3). */
export function hiddenInExile(o: GameObject, viewer: PlayerId): boolean {
  if (o.zone !== "exile") return false;
  if (o.foretold) return o.owner !== viewer;
  return !!o.hiddenExile && !o.hiddenExile.seen.includes(viewer);
}

/**
 * The Eldrazi processors (BFZ): the cards `pid`'s opponents own in exile, any of which may be put into its owner's
 * graveyard ("put a card an opponent owns from exile into that player's graveyard").
 */
export function processCandidates(s: GameState, pid: PlayerId): ObjectId[] {
  return opponents(s, pid).flatMap((x) => player(s, x).exile.filter((id) => !obj(s, id).isToken));
}

/**
 * The cards actually put into graveyards for processing `chosen`: a face-down card is chosen by its group, then the card
 * is taken from that group at random (rulings on Ruin Processor), and a card can't be used twice (rulings on Ulamog's
 * Despoiler).
 */
export function processPicks(s: GameState, pid: PlayerId, chosen: ObjectId[]): ObjectId[] {
  const all = processCandidates(s, pid);
  const out: ObjectId[] = [];
  for (const id of chosen) {
    const group = faceDownExileGroup(obj(s, id));
    if (group === undefined || !hiddenInExile(obj(s, id), pid)) {
      out.push(id);
      continue;
    }
    const pool = all.filter((x) => faceDownExileGroup(obj(s, x)) === group && hiddenInExile(obj(s, x), pid) && !out.includes(x));
    out.push(pool.length ? pool[Math.floor(nextRandom(s) * pool.length)]! : id);
  }
  return out;
}

/** Put the processed cards into their owners' graveyards, logged. */
export function processExiled(s: GameState, pid: PlayerId, chosen: ObjectId[], moved?: string[]): ObjectId[] {
  const ids = processPicks(s, pid, chosen);
  for (const id of ids) {
    moved?.push(defOf(s, obj(s, id)).name);
    log(s, `${player(s, pid).name} puts ${nameOf(s, id)} from exile into ${player(s, obj(s, id).owner).name}'s graveyard.`);
    moveObject(s, id, "graveyard");
  }
  closeZoneBatch(s);
  return ids;
}

/**
 * What can be exiled for craft's materials (CR 702.167a-b): permanents `pid` controls that match (by their
 * characteristics), then cards in their graveyard that match (by their printed ones, CR 109.2), never `o`, the source.
 */
export function craftCandidates(s: GameState, pid: PlayerId, o: GameObject, c: Extract<AdditionalCost, { kind: "craft" }>): ObjectId[] {
  const field = s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === pid && objectMatches(s, c.filter, obj(s, id), pid, false));
  const yard = player(s, pid).graveyard.filter((id) => id !== o.id && printedMatches(c.filter, defOf(s, obj(s, id))));
  return [...field, ...yard];
}

/** Behold (CR 701.4a): the matching cards in `pid`'s hand and the matching permanents they control, not `o` itself. */
export function beholdCandidates(s: GameState, pid: PlayerId, o: GameObject, c: Extract<AdditionalCost, { kind: "reveal" }>): ObjectId[] {
  const hand = player(s, pid).hand.filter((id) => id !== o.id && printedMatches(c.filter, defOf(s, obj(s, id))));
  const field = c.orControl ? s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === pid && objectMatches(s, c.orControl!, obj(s, id), pid, false)) : [];
  return [...field, ...hand];
}

/** "An Elf" for "behold an Elf". */
export const beholdWhat = (c: Extract<AdditionalCost, { kind: "reveal" }>) => {
  const kind = c.filter.subtypes?.[0] ? `${c.filter.subtypes[0]}${c.filter.types?.includes("Creature") ? " creature" : ""}` : c.filter.text;
  return `${c.n === 1 ? (/^[AEIOU]/.test(kind) ? "an" : "a") : c.n} ${kind}`;
};

/**
 * What can be returned to hand for a cost. Ninjutsu wants an unblocked attacker: one that's attacking once
 * blockers have been declared and wasn't blocked (CR 509.1h, 702.49a).
 */
export function returnCandidates(s: GameState, pid: PlayerId, c: Extract<AdditionalCost, { kind: "returnToHand" }>): ObjectId[] {
  const afterBlocks = ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.step) && s.pending?.kind !== "declareBlockers";
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid || !objectMatches(s, c.filter, o, pid, false)) return false;
    return !c.unblockedAttacker || (afterBlocks && o.attacking !== undefined && o.blockedBy === undefined);
  });
}

/**
 * Pay costs beyond mana, for a spell or an ability; returns what was sacrificed as it last existed (CR 608.2h).
 * `returned` gets whom a creature returned to hand was attacking (ninjutsu, CR 702.49c).
 */
function payExtraCosts(s: GameState, p: Player, costs: AdditionalCost[], choices: CostChoices, returned?: LastKnown, moved?: string[], discarded?: string[], exiled?: { id: ObjectId; zc: number }[]) {
  const sacrificed: LastKnown[] = [];
  for (const c of costs) {
    if (c.kind === "exileFromGraveyard" && c.process) {
      // The Eldrazi processors: the chosen card an opponent owns, or one at random from a face-down group (rulings).
      processExiled(s, p.id, choices.exileCards ?? [], moved);
      continue;
    }
    if (c.kind === "exileFromGraveyard" && c.linked) {
      // Jester's Scepter: the chosen card exiled with it goes to its owner's graveyard; "that card" is it (CR 608.2h).
      for (const id of choices.exileCards ?? []) {
        moved?.push(defOf(s, obj(s, id)).name);
        log(s, `${p.name} puts ${nameOf(s, id)} from exile into ${player(s, obj(s, id).owner).name}'s graveyard.`);
        moveObject(s, id, "graveyard");
      }
      closeZoneBatch(s);
      continue;
    }
    if (c.kind === "forage") {
      // CR 701.61a.
      if (choices.sacrifice?.length) {
        for (const id of choices.sacrifice) {
          log(s, `${p.name} forages, sacrificing ${nameOf(s, id)}.`);
          moveObject(s, id, "graveyard", { sacrificed: true });
        }
      } else {
        const ids = choices.exileCards ?? [];
        log(s, `${p.name} forages, exiling ${ids.map((id) => nameOf(s, id)).join(", ")} from their graveyard.`);
        for (const id of ids) moveObject(s, id, "exile");
      }
      closeZoneBatch(s);
      continue;
    }
    if (c.kind === "returnToHand") {
      for (const id of choices.returnToHand ?? []) {
        if (returned) {
          returned.attacking = obj(s, id).attacking;
          returned.attackingPermanent = obj(s, id).attackingPermanent;
          // "The mana value of the returned creature" (Scarlet Spider): as it last existed (rulings, CR 608.2h); face
          // down, 0 (CR 708.2).
          returned.manaValue = obj(s, id).faceDown ? 0 : defMv(defOf(s, obj(s, id)));
        }
        log(s, `${p.name} returns ${nameOf(s, id)} to ${player(s, obj(s, id).owner).name === p.name ? "their" : "its owner's"} hand.`);
        moveObject(s, id, "hand");
      }
    } else if (c.kind === "removeCounters") {
      const done = new Map<ObjectId, Record<string, number>>();
      for (const x of choices.counters ?? []) {
        const t = done.get(x.id) ?? {};
        t[x.kind] = (t[x.kind] ?? 0) + 1;
        done.set(x.id, t);
      }
      for (const [id, kinds] of done) for (const [kind, n] of Object.entries(kinds)) removeCountersCost(s, obj(s, id), { counter: kind, n });
      log(s, `${p.name} removes ${[...done].map(([id, kinds]) => `${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(" and ")} counter${Object.values(kinds).reduce((a, b) => a + b, 0) === 1 ? "" : "s"} from ${nameOf(s, id)}`).join(", ")}.`);
    } else if (c.kind === "putCounter") {
      // Through the replacement effects on counters, as any counter put on a permanent (CR 122.6).
      for (const id of choices.counterOn ?? []) {
        const put = putCounters(s, obj(s, id), c.counter, c.n);
        log(s, `${p.name} ${c.blight ? `blights ${c.n}, putting` : "puts"} ${put === 1 ? "a" : put} ${c.counter} counter${put === 1 ? "" : "s"} on ${nameOf(s, id)}.`);
      }
    } else if (c.kind === "tap") {
      const ids = choices.tap ?? [];
      for (const id of ids) (c.untap ? untapPermanent : tapPermanent)(s, obj(s, id));
      log(s, `${p.name} ${c.untap ? "untaps" : "taps"} ${ids.map((id) => nameOf(s, id)).join(", ")}.`);
    } else if (c.kind === "payLife") {
      if (!c.n) continue; // "pay X life" with X = 0
      loseLife(s, p.id, c.n);
      log(s, `${p.name} pays ${c.n} life.`);
    } else if (c.kind === "craft") {
      // Craft's materials (CR 702.167a): exiled; the cards are "used to craft" what it becomes (702.167c). A token isn't
      // a card and ceases to exist (CR 111.7, rulings).
      const ids = choices.craft ?? [];
      log(s, `${p.name} exiles ${ids.map((id) => `${nameOf(s, id)}${obj(s, id).zone === "graveyard" ? " from their graveyard" : ""}`).join(", ")} to craft.`);
      for (const id of ids) {
        const o = obj(s, id);
        moveObject(s, id, "exile");
        if (o.zone === "exile" && !o.isToken) exiled?.push({ id, zc: o.zoneChanges ?? 0 });
      }
      closeZoneBatch(s);
    } else if (c.kind === "sacrifice" && c.exile) {
      for (const id of choices.sacrifice ?? []) {
        // "The exiled creature's mana value" (Food Chain): as it last existed (CR 608.2h).
        const o = obj(s, id);
        const ch = characteristics(s, o);
        sacrificed.push({ power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o) });
        log(s, `${p.name} exiles ${nameOf(s, id)}.`);
        moveObject(s, id, "exile");
        // "Cards exiled with ~" (Mechtitan Core): the cards it became in exile (CR 400.7); a token is gone (CR 704.5d).
        if (o.zone === "exile") exiled?.push({ id, zc: o.zoneChanges ?? 0 });
      }
    } else if (c.kind === "sacrifice") {
      for (const id of choices.sacrifice ?? []) {
        const o = obj(s, id);
        const ch = characteristics(s, o);
        sacrificed.push({ power: ch.power, toughness: ch.toughness, manaValue: defMv(defOf(s, o)), counters: { ...o.counters }, copyKey: cardIdOf(o), ...(o.suspected !== undefined ? { suspected: true as const } : {}), ...(ch.supertypes.includes("Legendary") ? { legendary: true as const } : {}), types: [...ch.types], subtypes: [...ch.subtypes], colors: [...ch.colors], ...(ch.allCreatureTypes && ch.types.includes("Creature") ? { allCreatureTypes: true as const } : {}) });
        log(s, `${p.name} sacrifices ${nameOf(s, id)}.`);
        moveObject(s, id, "graveyard", { sacrificed: true });
      }
    } else if (c.kind === "discard" && c.random) {
      // Chosen by the game as the cost is paid (CR 701.9b); a spell being cast is on the stack already (CR 601.2a).
      const pool = [...p.hand];
      const picked: ObjectId[] = [];
      for (let i = 0; i < c.n && pool.length; i++) picked.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
      discarded?.push(...picked.map((id) => cardIdOf(obj(s, id))));
      discardCards(s, p.id, picked, " at random");
    } else if (c.kind === "discard") {
      discarded?.push(...(choices.discard ?? []).map((id) => cardIdOf(obj(s, id))));
      discardCards(s, p.id, choices.discard ?? []);
    }
    else if (c.kind === "reveal" && c.orControl) {
      // Behold (CR 701.4a): a card revealed from the hand or a permanent chosen; "and exile it": that card or permanent,
      // linked to what the spell becomes (CR 607.2q).
      for (const id of choices.reveal ?? []) {
        const o = obj(s, id);
        const onField = o.zone === "battlefield";
        log(s, `${p.name} beholds ${nameOf(s, id)}${onField ? "" : " from their hand"}${c.exile ? " and exiles it" : ""}.`);
        if (!c.exile) continue;
        moveObject(s, id, "exile");
        exiled?.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
      }
    }
    else if (c.kind === "reveal") {
      log(s, `${p.name} reveals ${(choices.reveal ?? []).map((id) => nameOf(s, id)).join(", ")} from their hand.`);
      // "The revealed card's power" (Titan's Presence): as it last existed in the hand, wherever it goes (rulings).
      for (const id of choices.reveal ?? []) {
        const o = obj(s, id);
        sacrificed.push({ power: cardPT(s, o, "power"), toughness: cardPT(s, o, "toughness"), manaValue: defMv(defOf(s, o)), counters: {}, copyKey: cardIdOf(o) });
      }
    }
    else if (c.kind === "mill" && c.exile) {
      const ids = p.library.slice(0, c.n);
      log(s, `${p.name} exiles the top ${ids.length === 1 ? "card" : `${ids.length} cards`} of their library: ${ids.map((id) => nameOf(s, id)).join(", ")}.`);
      for (const id of ids) {
        moveObject(s, id, "exile");
        exiled?.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
      }
    } else if (c.kind === "mill") {
      const n = millCount(s, p.id, c.n);
      log(s, `${p.name} mills ${n === 1 ? "a card" : `${n} cards`}.`);
      for (const id of p.library.slice(0, n)) moveObject(s, id, "graveyard", { milled: true });
    } else if (c.kind === "revealHand") log(s, `${p.name} reveals their hand${p.hand.length ? `: ${p.hand.map((id) => nameOf(s, id)).join(", ")}` : " (it's empty)"}.`);
    else if (c.kind === "giveLife") {
      // Unchosen (a caller that didn't ask), the cost is still paid: by the first opponent who can gain life.
      const to = c.each ? opponents(s, p.id) : [choices.lifeTo ?? opponents(s, p.id).find((q) => canGainLife(s, q))!];
      log(s, `${p.name} has ${to.map((q) => player(s, q).name).join(", ")} gain ${c.n} life.`);
      for (const q of to) gainLife(s, q, c.n);
    }
    else if (c.kind === "exileFromHand" && c.toLibrary) {
      const ids = choices.exileFromHand ?? [];
      log(s, `${p.name} puts ${ids.length === 1 ? "a card" : `${ids.length} cards`} from their hand on top of their library.`);
      for (const id of [...ids].reverse()) moveObject(s, id, "library", { top: true });
    } else if (c.kind === "exileFromHand") {
      const ids = choices.exileFromHand ?? [];
      if (!ids.length) continue;
      log(s, `${p.name} exiles ${ids.map((id) => nameOf(s, id)).join(", ")} from their hand.`);
      for (const id of ids) {
        moveObject(s, id, "exile");
        exiled?.push({ id, zc: obj(s, id).zoneChanges ?? 0 });
      }
    } else if (c.kind === "collectEvidence") collectEvidence(s, p, choices.collect ?? autoEvidence(s, p.id, c.n), c.n);
    else {
      const ids = c.kind === "exileFromGraveyard" && c.top ? topGraveyardCards(s, p.id, c.n, c.filter) : (choices.exileCards ?? []);
      if (!ids.length) continue;
      // "The exiled card's power" (Corpse Lunge): the one card exiled, as it was in the graveyard (CR 608.2h).
      if (c.kind === "exileFromGraveyard" && !c.top && c.n === 1 && ids.length === 1 && !costs.some((x) => x.kind === "sacrifice")) {
        const o = obj(s, ids[0]!);
        sacrificed.push({ power: cardPT(s, o, "power"), toughness: cardPT(s, o, "toughness"), manaValue: defMv(defOf(s, o)), counters: {}, copyKey: cardIdOf(o) });
      }
      log(s, `${p.name} exiles ${ids.map((id) => nameOf(s, id)).join(", ")} from their graveyard.`);
      for (const id of ids) moveObject(s, id, "exile");
    }
    closeZoneBatch(s); // each cost is an event of its own (rulings on Conspiracy Unraveler)
  }
  return sacrificed;
}

export function describeTargets(s: GameState, targets?: TargetChoice[]): string {
  if (!targets?.length) return "";
  const names = targets.flatMap((t) =>
    t.kind === "none"
      ? []
      : (t.kind === "player" ? player(s, t.id).name : t.kind === "object" ? nameOf(s, t.id) : ((s.stack.find((x) => x.id === t.id) ?? (s.resolving?.item.id === t.id ? s.resolving.item : undefined))?.description ?? "a spell")) +
        (t.kind !== "stack" && t.amount !== undefined ? ` (${t.amount})` : ""),
  );
  return names.length ? ` targeting ${names.join(", ")}` : "";
}

/**
 * Why this activated ability can't be activated right now, or null. Without `targets`, only
 * checks that legal targets exist; for a modal ability, without `modes` only that a mode can be chosen.
 */
/** Teferi, Temporal Archmage's emblem: loyalty abilities any time you could cast an instant (you have priority). */
const loyaltyAtInstantSpeed = (s: GameState, pid: PlayerId, o?: GameObject) =>
  // Teferi, Master of Time: "You may activate loyalty abilities of ~ on any player's turn any time you could cast an instant."
  (!!o && (abilitiesOf(s, o).selfLoyaltyAtInstantSpeed === true || (abilitiesOf(s, o).selfLoyaltyAtInstantSpeed === "enteredThisTurn" && o.enteredTurn === s.turn))) ||
  [...s.battlefield.map((x) => obj(s, x)).filter((x) => controllerOf(s, x) === pid), ...liveEmblems(s).filter((x) => x.owner === pid)].some((x) => abilitiesOf(s, x).loyaltyAtInstantSpeed);

/**
 * The X an ability's own text sets (CR 107.3c), its controller not choosing it: Prototype Portal's "X is the mana value of
 * that card", the card exiled with it (X in that card's mana cost as 0, CR 107.3g). Null with no such card: X isn't defined,
 * so it can't be paid (rulings). Undefined for an ability whose X is chosen.
 */
export function definedX(s: GameState, o: GameObject, ab: ActivatedAbility): number | null | undefined {
  if (ab.xIs !== "linkedCardMv") return undefined;
  const card = linkedCards(s, o.id)[0];
  return card ? defMv(defOf(s, obj(s, card.id))) : null;
}

export function abilityProblem(s: GameState, pid: PlayerId, id: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x0?: number, costs?: CostChoices): string | null {
  const p = player(s, pid);
  const o = s.objects[id];
  if (!o) return "no such card";
  const d = defOf(s, o);
  const ab = abilitiesOf(s, o).activated[index];
  if (!ab) return `${d.name} has no such ability`;
  const fixedX = definedX(s, o, ab);
  if (fixedX === null) return `no card is exiled with ${d.name}, so X isn't defined`;
  if (fixedX !== undefined && x0 !== undefined && x0 !== fixedX) return `X is ${fixedX} for ${d.name}'s ability`;
  const x = x0 ?? fixedX;
  // Stabilizer: "Players can't cycle cards" (typecycling too, CR 702.29f).
  if (ab.cycling) {
    const ban = s.battlefield.find((b) => abilitiesOf(s, obj(s, b)).noCycling);
    if (ban) return `${characteristics(s, obj(s, ban)).name}: players can't cycle cards`;
  }
  if (ab.zone === "hand") {
    // Cycling works only while the card is in your hand (CR 702.29a); commander ninjutsu from the command zone too (CR 702.49d).
    if (!(o.zone === "hand" || (o.zone === "command" && ab.orCommand)) || o.owner !== pid) return `${ab.text} works only from your hand${ab.orCommand ? " or the command zone" : ""}`;
  } else if (ab.zone === "graveyard") {
    // Unearth works only while the card is in your graveyard (CR 702.84a).
    if (o.zone !== "graveyard" || o.owner !== pid) return `${ab.text} works only from your graveyard`;
    // Ashes of the Abhorrent: no activated abilities of cards in graveyards (embalm, unearth, scavenge, ...; rulings).
    const ashes = s.battlefield.find((b) => abilitiesOf(s, obj(s, b)).noGraveyardActivations);
    if (ashes) return `${characteristics(s, obj(s, ashes)).name}: players can't activate abilities of cards in graveyards`;
  } else if (ab.zone === "command") {
    // Derevi: only from the command zone (rulings).
    if (o.zone !== "command" || o.owner !== pid) return `${ab.text} works only from the command zone`;
  } else if (o.zone !== "battlefield" || (controllerOf(s, o) !== pid && !ab.anyPlayer)) return "you don't control that permanent";
  else if (ab.ownerOnly && o.owner !== pid) return `only ${d.name}'s owner may activate that ability`;
  else if (ab.opponentsOnly && !opponents(s, controllerOf(s, o)).includes(pid)) return `only ${d.name}'s controller's opponents may activate that ability`;
  else if (characteristics(s, o).cantActivate) return `${d.name}'s activated abilities can't be activated`; // Arrest
  else if (ab.tap && characteristics(s, o).cantActivateTap) return `${d.name}'s activated abilities with {T} in their costs can't be activated`; // Serra Bestiary
  const banned = nameActivationBan(s, o, !!ab.mana) ?? abolisherBan(s, pid, o); // Pithing Needle, in any zone (rulings); Grand Abolisher
  if (banned) return banned;
  // Solemnity: a cost that puts counters on an artifact, creature, enchantment or land can't be paid (rulings).
  if (ab.putCounters && countersBanned(s, o, ab.putCounters.counter)) return `counters can't be put on ${d.name}`;
  // The Immortal Sun: no loyalty abilities (CR 606.3) while it's on the battlefield.
  if (ab.loyalty !== undefined || ab.loyaltyX) {
    const sun = s.battlefield.find((id) => abilitiesOf(s, obj(s, id)).noLoyaltyAbilities);
    if (sun) return `${characteristics(s, obj(s, sun)).name}: players can't activate planeswalkers' loyalty abilities`;
    // Revel in Silence: this turn only, for the players it named.
    if (turnRule(s, pid, "noLoyalty")) return "you can't activate planeswalkers' loyalty abilities this turn";
  }
  if (ab.mana) {
    // A mana ability: with priority, or while paying mana for something (CR 605.3a), even under split second (702.61b).
    if (!(s.priority === pid && !s.pending) && !(paysManaNow(s) && waitingOn(s) === pid)) return "you can't activate mana abilities now";
  } else {
    if (s.priority !== pid || s.pending) return "you don't have priority";
    if (splitSecondOnStack(s)) return "a spell with split second is on the stack"; // CR 702.61a
    // Abeyance: this turn, in any zone (rulings).
    if (turnRule(s, pid, "noActivations")) return "you can't activate abilities that aren't mana abilities this turn";
  }
  if (ab.sorcerySpeed && !canActAtSorcerySpeed(s, pid) && !((ab.loyalty !== undefined || ab.loyaltyX) && loyaltyAtInstantSpeed(s, pid, o)) && !(ab.equip && equipAtInstantSpeed(s, pid))) return "activate only as a sorcery";
  if (ab.tap && o.tapped) return `${d.name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && tapAbilitySick(s, o)) return `${d.name} has summoning sickness`; // CR 602.5a
  if (ab.untapSelf && !o.tapped) return `${d.name} is untapped`; // CR 107.6
  // A stun counter that can't be removed keeps it tapped, so {Q} can't be paid (rulings on Fear of Sleep Paralysis).
  if (ab.untapSelf && (o.counters.stun ?? 0) > 0 && countersStay(s, o, "stun")) return `${d.name}'s stun counter can't be removed`;
  if (ab.untapSelf && objIsType(s, o, "Creature") && tapAbilitySick(s, o)) return `${d.name} has summoning sickness`; // CR 302.6
  if (ab.sacrificeSelf && o.zone === "battlefield" && !canBeSacrificed(s, o)) return `${d.name} can't be sacrificed`; // CR 701.21, 602.2b
  if (ab.oncePerTurn && (o.activatedThisTurn?.filter((n) => n === index).length ?? 0) >= (ab.keyword === "Boast" && boastsTwice(s, pid) ? 2 : 1)) return `${d.name}'s ability can be activated only ${ab.keyword === "Boast" && boastsTwice(s, pid) ? "twice" : "once"} each turn`; // CR 602.5b
  if (ab.onceEver && o.activatedEver?.includes(index) && !(ab.keyword === "Exhaust" && mayExhaustAgain(s, pid)) && !(ab.keyword === "Power-up" && o.activatedEver.filter((i) => i === index).length <= powerUpAgain(s, pid))) return `${d.name}'s ${ab.keyword === "Exhaust" ? "exhaust " : ""}ability can be activated only once`; // CR 702.177a-b, 602.5b
  // "Reveal the player you chose": not if no player was chosen as it entered (rulings on Guardian Archon).
  if (ab.revealChosen && o.chosen?.player === undefined) return `no player was chosen for ${d.name}`;
  // "Unattach ~" (Sunforger): only while it's attached to a creature (rulings, CR 602.2b).
  if (ab.unattachCost && !(o.attachedTo && s.objects[o.attachedTo]?.zone === "battlefield" && objIsType(s, obj(s, o.attachedTo), "Creature"))) return `${d.name} isn't attached to a creature`;
  if (ab.tapAttached) {
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    if (!host || host.zone !== "battlefield") return `${d.name} isn't attached to anything`;
    if (host.tapped) return `${nameOf(s, host.id)} is tapped`;
  }
  if (ab.maxPerTurn && (o.activatedThisTurn?.filter((n) => n === index).length ?? 0) >= ab.maxPerTurn) return `${d.name}'s ability can be activated no more than ${ab.maxPerTurn === 2 ? "twice" : `${ab.maxPerTurn} times`} each turn`;
  if (ab.maxPerTurnCount && (o.activatedThisTurn?.filter((n) => n === index).length ?? 0) >= evalAmount(s, ab.maxPerTurnCount, { controller: pid, sourceId: id })) return `${d.name}'s ability can't be activated more times this turn`;
  if (ab.loyalty !== undefined || ab.loyaltyX) {
    // Loyalty abilities: as a sorcery, one per permanent per turn (CR 606.3); a negative cost needs that many counters (CR 606.6).
    if (!loyaltyAtInstantSpeed(s, pid, o) && !canActAtSorcerySpeed(s, pid)) return "loyalty abilities can be activated only as a sorcery";
    // Gained loyalty abilities count too, and stay counted if the effect that gave them ends (rulings).
    const used = o.activatedThisTurn?.filter((n) => n === LOYALTY_USED).length ?? 0;
    if (used >= loyaltyPerTurn(s, o)) return `${used === 1 ? "a loyalty ability" : used === 2 ? "two loyalty abilities" : `${used} loyalty abilities`} of ${d.name} ${used === 1 ? "was" : "were"} already activated this turn`;
    const remove = ab.loyaltyX ? (x ?? 0) : -(ab.loyalty ?? 0);
    if (remove > (o.counters.loyalty ?? 0)) return `${d.name} doesn't have ${remove} loyalty to remove`;
  }
  if (ab.activateIf && !staticConditionNow(s, ab.activateIf, id, pid)) return `${d.name}'s ability can't be activated now`; // CR 602.5b
  const lifeCost = activatedLifeCost(s, p.id, ab, o, x);
  if (lifeCost && payableLife(s, p.id) < lifeCost) return `you can't pay ${lifeCost} life`; // CR 119.4, 119.8
  const half = halfLifeCost(s, p.id, ab);
  if (half && payableLife(s, p.id) < half + lifeCost) return `you can't pay ${half} life`; // CR 119.4, 119.8
  // "Remove X ki counters from ~": X counters, up to how many it has (CR 107.3a).
  const toRemove = ab.removeCounters?.x ? (x ?? 0) : (ab.removeCounters?.n ?? 0);
  if (ab.removeCounters && removableCounters(s, o, ab.removeCounters.counter) < toRemove) return `${d.name} doesn't have ${toRemove} ${ab.removeCounters.counter} counter${toRemove === 1 ? "" : "s"} to remove`;
  if (ab.energyCost && (p.energy ?? 0) < ab.energyCost) return `you need ${ab.energyCost} energy`; // CR 107.14
  if (ab.crew !== undefined) {
    const cp = crewProblem(s, pid, o, ab.crew, tapCreatures, ab.saddle);
    if (cp) return cp;
  } else if (ab.station) {
    // Station (CR 702.184a): tap another untapped creature you control, whatever its power.
    if (tapCreatures === undefined) {
      if (!crewCandidates(s, pid, o.id, false).length) return "no other untapped creature to tap for station";
    } else {
      if (tapCreatures.length !== 1) return "station taps exactly one other creature";
      if (tapCreatures[0] === o.id) return "the creature tapped for station must be another one";
      const tp = tapCreaturesProblem(s, pid, tapCreatures, "station");
      if (tp) return tp;
    }
  } else if (ab.waterbend !== undefined) {
    if (tapCreatures?.length) {
      const wp = waterbendProblem(s, pid, o, ab, tapCreatures, x ?? 0, costs);
      if (wp) return wp;
    }
  } else if (tapCreatures?.length) return "this ability doesn't tap creatures";
  if (ab.body.modal) {
    const mp = modes === undefined ? (canChooseModes(s, ab.body, pid, sourceQuality(s, id), id) ? null : "no mode can be chosen") : modesProblem(s, ab.body, modes, pid, sourceQuality(s, id), false, id);
    if (mp) return mp;
  }
  // "Discard a card with mana value X: Counter target spell with mana value X" (Kozilek): before X is announced, the
  // ability can be activated if some X works for both the cost and the target (CR 107.3a, 602.2b).
  if (x === undefined && ab.costs?.some((c) => c.kind === "discard" && c.mvX)) {
    for (let n = 0; n <= 20; n++) {
      if (abilityProblem(s, pid, id, index, targets, modes, tapCreatures, n, costs)) continue;
      // Without targets chosen, the check above lets any X target; here the target must have mana value n too.
      const b = settleDivided(s, withModes(ab.body, modes), { controller: pid, sourceId: id, x: n }, false);
      if (targets || !b.targets.length || hasLegalTargetsFor(s, b.targets, pid, sourceQuality(s, id), id)) return null;
    }
    return abilityProblem(s, pid, id, index, targets, modes, tapCreatures, 0, costs);
  }
  let body = settleDivided(s, withModes(ab.body, modes), { controller: pid, sourceId: id, x: x ?? 0 }, !targets);
  if (targets && manySlot(body.targets) >= 0) {
    // "Any number of target creatures": as many as were chosen (CR 601.2c, 602.2b).
    const fit = fitMany(body, targets, manyX(s, body.targets, pid, id, x));
    if (typeof fit === "string") return fit;
    [body, targets] = [fit.body, fit.targets];
  }
  if (body.targets.length) {
    const src = sourceQuality(s, id);
    const tp = targets ? targetProblem(s, body.targets, targets, pid, src, id) : hasLegalTargetsFor(s, body.targets, pid, src, id) ? null : "no legal targets";
    if (tp) return tp;
  }
  if (ab.costs?.length || costs?.sacrifice?.length || costs?.discard?.length || costs?.returnToHand?.length || costs?.tap?.length) {
    const cp = extraCostProblem(s, pid, o, activatedCosts(ab, x, o), costs, `activate ${d.name}'s ability`);
    if (cp) return cp;
  }
  const cost = activationCost(s, pid, o, ab, targets, x);
  const xp = ab.loyaltyX || abilityCostsHaveX(ab) ? (x !== undefined && (!Number.isInteger(x) || x < 0) ? "X must be a whole number, 0 or more" : (x ?? 0) < (ab.xMin ?? 0) ? "X can't be 0" : null) : (x ?? 0) < (ab.xMin ?? 0) ? "X can't be 0" : xProblem(cost, x);
  if (xp) return xp;
  if (ab.energyX && (x ?? 0) > (p.energy ?? 0)) return `you need ${x} energy`; // CR 107.14
  const due = lessWaterbend(cost, ab.loyaltyX ? 0 : (x ?? 0) * xCount(cost), ab, tapCreatures);
  if (!canPayFromPool(s, pid, due.cost, abilityUse(o, ab, s), due.extra, p.life)) return `not enough mana for ${d.name}'s ability`;
  return null;
}

/**
 * Waterbend (CR 701.67a-b): "Pay [cost]. For each generic mana in that cost, you may tap an untapped artifact or creature
 * you control rather than pay that mana." The ones tapped are the activation's `tapCreatures`: no more than the generic
 * mana in the waterbend cost itself, even if the total cost went up or down (rulings), each one once.
 */
function waterbendProblem(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, ids: ObjectId[], x: number, costs?: CostChoices): string | null {
  const cap = ab.waterbend === "X" ? x : (ab.waterbend ?? 0);
  if (ids.length > cap) return `waterbend {${cap}} can be paid by tapping no more than ${cap} artifact${cap === 1 ? "" : "s"} or creature${cap === 1 ? "" : "s"}`;
  if (new Set(ids).size !== ids.length) return "each artifact or creature can only be tapped once to waterbend";
  for (const id of ids) {
    const c = s.objects[id];
    if (!c || c.zone !== "battlefield" || controllerOf(s, c) !== pid || !(objIsType(s, c, "Artifact") || objIsType(s, c, "Creature"))) return "only artifacts and creatures you control can be tapped to waterbend";
    // The source tapped by its own {T} cost, or tapped or sacrificed for another cost, can't be tapped again (rulings).
    if (c.tapped || (ab.tap && id === o.id) || costs?.tap?.includes(id) || costs?.sacrifice?.includes(id)) return `${nameOf(s, id)} is already tapped`;
  }
  return null;
}

/** An activation's mana cost after the artifacts and creatures tapped to waterbend each pay {1} of its generic mana (CR 701.67a). */
export function lessWaterbend(cost: ParsedCost, extra: number, ab: ActivatedAbility, taps?: ObjectId[]): { cost: ParsedCost; extra: number } {
  if (ab.waterbend === undefined || !taps?.length) return { cost, extra };
  return payGenericWith(cost, extra, taps.length) ?? { cost, extra };
}

/**
 * An activated ability's mana cost as `pid` activates it, after "Equip abilities you activate cost {1} less to activate"
 * (CR 602.2b applies 601.2f): reductions only take off generic mana. Without `targets` chosen yet, as if the best one were.
 */
export function activationCost(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets?: TargetChoice[], x = 0): ParsedCost {
  // Zirda, the Dawnwaker: abilities `pid` activates that aren't mana abilities, wherever they are (rulings).
  let less = 0;
  let atLeastOne = false;
  if (!ab.mana)
    for (const id of s.battlefield) {
      const src = obj(s, id);
      if (ab.cycling && controllerOf(s, src) === pid) less += abilitiesOf(s, src).cyclingLess ?? 0;
      const z = controllerOf(s, src) === pid ? abilitiesOf(s, src).youActivateLess : undefined;
      if (!z) continue;
      less += z.n;
      if (z.atLeastOne) atLeastOne = true;
    }
  less += firstArtifactLess(s, pid, o, !!ab.mana);
  return activationLessCost(s, o, activationCostBefore(s, pid, o, ab, targets), x, less ? { n: less, atLeastOne } : undefined);
}

/**
 * Tezzeret, Betrayer of Flesh: what "the first activated ability of an artifact you activate each turn costs {2} less"
 * takes off this ability of `o`, an artifact on the battlefield (CR 109.2), if `pid` activates it now. A mana ability gets
 * it only as the very first: one activated just before another ability may be paying for it (TurnLog.artifactAbility).
 */
export function firstArtifactLess(s: GameState, pid: PlayerId, o: GameObject, mana: boolean): number {
  const was = s.turnLog?.artifactAbility?.[pid];
  if (was === "used" || (mana && was) || o.zone !== "battlefield" || !objIsType(s, o, "Artifact")) return 0;
  let less = 0;
  for (const id of s.battlefield) {
    const src = obj(s, id);
    if (controllerOf(s, src) === pid) less += abilitiesOf(s, src).firstArtifactAbilityLess ?? 0;
  }
  return less;
}

/** Tezzeret, Betrayer of Flesh: after `pid`'s action, whether they've now activated an ability of an artifact this turn (TurnLog.artifactAbility). */
function noteArtifactAbility(s: GameState, pid: PlayerId, artifact: boolean, kind: "mana" | "costedMana" | "other" | "none"): void {
  const marks = s.turnLog?.artifactAbility;
  const was = marks?.[pid];
  if (was === "used") return;
  const now = kind === "mana" ? (artifact ? "mana" : was) : kind === "costedMana" ? (artifact ? "used" : was) : artifact || was ? "used" : undefined;
  if (now && now !== was) ((s.turnLog ??= {}).artifactAbility ??= {})[pid] = now;
}

/**
 * An activated ability's mana cost after "activated abilities of creatures you control cost {2} less to activate"
 * (CompiledCard.activationLess; CR 602.2b applies 601.2f), the last change to it: generic mana only, the X chosen
 * counting (its symbols become that much generic mana then), and not below one mana where the reduction says so (rulings
 * on Training Grounds: a cost with no generic mana, {0} included, stays as it is). Only for a permanent on the battlefield.
 */
export function activationLessCost(s: GameState, o: GameObject, cost: ParsedCost, x = 0, also?: { n: number; atLeastOne: boolean }): ParsedCost {
  let less = also?.n ?? 0;
  let atLeastOne = !!also?.atLeastOne;
  for (const id of o.zone === "battlefield" ? s.battlefield : []) {
    const src = obj(s, id);
    for (const m of abilitiesOf(s, src).activationLess ?? []) {
      if (!objectMatches(s, m.filter, o, controllerOf(s, src), false) || (m.enchanted && src.attachedTo !== o.id)) continue;
      less += m.n;
      if (m.atLeastOne) atLeastOne = true;
    }
  }
  if (!less) return cost;
  const xs = xCount(cost) * x;
  const g = splitGeneric(cost, xs);
  if (!g.extra) return cost;
  const others = g.cost.symbols.filter((sym) => sym.kind !== "x");
  // Not below one mana (rulings on Training Grounds and Zirda: {1}{R} becomes {R}, {2} becomes {1}).
  const left = Math.max(atLeastOne && !others.length ? 1 : 0, g.extra - less);
  // Still "with X" (CR 107.3): the X chosen is its value for the ability, now paid as generic mana.
  return { ...g.cost, symbols: [...(left ? [{ kind: "generic" as const, amount: left }] : []), ...others] };
}

/** Leonin Shikari, Forge Anew (during your turn): `pid` may activate equip abilities any time they could cast an instant. */
function equipAtInstantSpeed(s: GameState, pid: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    const w = controllerOf(s, o) === pid ? abilitiesOf(s, o).equipAtInstantSpeed : undefined;
    return w === "always" || (w === "yourTurn" && s.activePlayer === pid);
  });
}

/**
 * Forge Anew: {0} rather than the equip cost of the first equip ability `pid` activates during each of their turns;
 * Bruenor Battlehammer: during each turn (CR 118.9; increases still apply, 601.2f). Taken whenever it applies, and only
 * for an equip cost that's all mana.
 */
export function freeEquip(s: GameState, pid: PlayerId, ab: ActivatedAbility): boolean {
  if (!ab.equip || ab.costs?.length || ab.tap || s.turnLog?.equipped?.includes(pid)) return false;
  return s.battlefield.some((id) => {
    const a = controllerOf(s, obj(s, id)) === pid ? abilitiesOf(s, obj(s, id)) : undefined;
    const f = a?.firstEquipFree;
    if (a?.firstEquipFreeWhile && !staticConditionNow(s, a.firstEquipFreeWhile, id, pid)) return false;
    return f === "eachTurn" || (f === "yourTurn" && s.activePlayer === pid);
  });
}

function activationCostBefore(s: GameState, pid: PlayerId, o: GameObject, ab: ActivatedAbility, targets?: TargetChoice[]): ParsedCost {
  const cost0 = parseManaCost(freeEquip(s, pid, ab) ? "{0}" : ab.manaCost);
  // "Activated abilities cost {2} more to activate unless they're mana abilities" (Suppression Field): increases first
  // (CR 602.2b applies 601.2f).
  const more = (ab.mana ? 0 : activationTax(s, o, pid, ab) + opponentsTargetTax(s, pid, targets)) + (ab.costMore ? Math.max(0, evalAmount(s, ab.costMore, { controller: pid, sourceId: o.id })) : 0);
  const cost1 = more ? { ...cost0, symbols: [...cost0.symbols, { kind: "generic" as const, amount: more }] } : cost0;
  // Power-up: "If this permanent entered this turn, this ability's cost is reduced by this permanent's mana cost" (CR
  // 702.193a-b, 118.7).
  const powerUp = ab.keyword === "Power-up" && o.zone === "battlefield";
  const cost = powerUp && o.enteredTurn === s.turn ? reduceByManaCost(cost1, parseManaCost(defOf(s, o).manaCost ?? "")) : cost1;
  // Embalmer's Tools: "Activated abilities of creature cards in your graveyard cost {1} less to activate": generic mana
  // only (CR 601.2f), whoever's permanent says so about their own graveyard.
  const yardLess = o.zone === "graveyard" && objIsType(s, o, "Creature") ? s.battlefield.reduce((n, id) => n + (controllerOf(s, obj(s, id)) === o.owner ? (abilitiesOf(s, obj(s, id)).yardCreatureAbilityLess ?? 0) : 0), 0) : 0;
  if (!ab.equip && !ab.costLess && !ab.costLessIf && !ab.costLessIfTarget && !powerUp && !yardLess && ab.keyword !== "Ninjutsu" && ab.keyword !== "Boast" && ab.keyword !== "Exhaust") return cost;
  let less = (ab.costLess ? Math.max(0, evalAmount(s, ab.costLess, { controller: pid, sourceId: o.id })) : 0) + yardLess;
  if (ab.costLessIf && staticConditionNow(s, ab.costLessIf.cond, o.id, pid)) less += ab.costLessIf.n;
  // Raft Security Officer: "if it targets a creature with power 3 or less", as that target is now.
  const lessAim = ab.costLessIfTarget && targets?.[0]?.kind === "object" ? s.objects[targets[0].id] : undefined;
  if (lessAim && objectMatches(s, ab.costLessIfTarget!.filter, lessAim, pid, false)) less += ab.costLessIfTarget!.n;
  // "For each color of the creature it targets": as the target is when the cost is worked out (CR 601.2f).
  const per = ab.costLessPerTarget;
  const aim = per && targets?.[0]?.kind === "object" ? s.objects[targets[0].id] : undefined;
  if (per && aim) less += per.n * (per.each === "color" ? characteristics(s, aim).colors.length : (aim.counters["+1/+1"] ?? 0));
  // "Power-up abilities of other creatures you control cost {3} less to activate." (Hulk, Gamma Goliath)
  for (const id of powerUp ? s.battlefield : []) {
    const src = obj(s, id);
    const n = abilitiesOf(s, src).powerUpLess;
    if (n && src.id !== o.id && controllerOf(s, src) === pid && controllerOf(s, o) === pid && objIsType(s, o, "Creature")) less += n;
  }
  // "Exhaust abilities of other permanents you control cost {2} less to activate." (Boom Scholar)
  for (const id of ab.keyword === "Exhaust" && o.zone === "battlefield" ? s.battlefield : []) {
    const src = obj(s, id);
    const n = abilitiesOf(s, src).exhaustLess;
    if (n && src.id !== o.id && controllerOf(s, src) === pid && controllerOf(s, o) === pid) less += n;
  }
  // "Ninjutsu abilities you activate cost {1} less to activate" (Silver-Fur Master): generic mana only.
  for (const id of ab.keyword === "Ninjutsu" ? s.battlefield : []) {
    const src = obj(s, id);
    const n = controllerOf(s, src) === pid ? abilitiesOf(s, src).ninjutsuLess : undefined;
    if (n) less += n;
  }
  // "Boast abilities you activate cost {1} less to activate for each Dragon you control" (Dragonkin Berserker).
  for (const id of ab.keyword === "Boast" ? s.battlefield : []) {
    const src = obj(s, id);
    const n = controllerOf(s, src) === pid ? abilitiesOf(s, src).boastLess : undefined;
    if (n) less += Math.max(0, evalAmount(s, n, { controller: pid, sourceId: src.id }));
  }
  const target = targets?.[0]?.kind === "object" ? targets[0].id : undefined;
  for (const id of ab.equip ? s.battlefield : []) {
    const src = obj(s, id);
    const mods = compileCard(defOf(s, src)).equipLess;
    if (!mods) continue;
    const c = characteristics(s, src);
    if (!c.hasPrintedAbilities || c.controller !== pid) continue;
    for (const m of mods) {
      if (m.otherEquipment && src.id === o.id) continue;
      if (m.self && src.id !== o.id) continue;
      if (m.if && !staticConditionNow(s, m.if, src.id, pid)) continue;
      // "That target ~": it's a creature you control, so it could be the target (CR 702.6a).
      if (m.targetSelf && (targets ? target !== src.id : !c.types.includes("Creature"))) continue;
      // "That target enchanted creature" (Strong Back): the creature it's attached to (CR 601.2f, after targets).
      if (m.targetEnchanted && (!src.attachedTo || (targets ? target !== src.attachedTo : !s.objects[src.attachedTo] || controllerOf(s, obj(s, src.attachedTo)) !== pid))) continue;
      less += m.n;
    }
  }
  if (!less) return cost;
  const g = splitGeneric(cost, 0);
  const left = Math.max(0, g.extra - less);
  return { ...g.cost, symbols: [...(left ? [{ kind: "generic" as const, amount: left }] : []), ...g.cost.symbols] };
}

/**
 * "Each power-up ability of permanents you control can be activated an additional time." (Wonder Man, Hollywood Hero; CR
 * 702.193a): how many more times than once, one for each such permanent.
 */
function powerUpAgain(s: GameState, pid: PlayerId): number {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !!abilitiesOf(s, obj(s, id)).powerUpAgain).length;
}

/**
 * Kopala, Warden of Waves: "Abilities your opponents activate that target a Merfolk you control cost {2} more to activate",
 * once for each such permanent's ability however many it targets (rulings), with the targets chosen first (CR 602.2b).
 */
function opponentsTargetTax(s: GameState, pid: PlayerId, targets?: TargetChoice[]): number {
  const targeted = [...new Set((targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])))].map((id) => s.objects[id]).filter((t): t is GameObject => t?.zone === "battlefield");
  if (!targeted.length) return 0;
  let n = 0;
  for (const id of s.battlefield) {
    const src = obj(s, id);
    const taxes = abilitiesOf(s, src).opponentsTargetTax;
    if (!taxes) continue;
    const by = controllerOf(s, src);
    if (by === pid || !opponents(s, by).includes(pid)) continue;
    for (const c of taxes) if (c.abilities && targeted.some((t) => controllerOf(s, t) === by && objectMatches(s, c.filter, t, by, false))) n += c.n;
  }
  return n;
}

/** What permanents' "activated abilities [of sources with the chosen name] cost {2} more to activate" add (CompiledCard.activationTaxes). */
function activationTax(s: GameState, o: GameObject, pid: PlayerId, ab: ActivatedAbility): number {
  let n = 0;
  for (const id of s.battlefield) {
    const src = obj(s, id);
    for (const tax of abilitiesOf(s, src).activationTaxes ?? []) {
      const owner = controllerOf(s, src);
      if ((tax.opponents && (owner === pid || !opponents(s, owner).includes(pid))) || (tax.yourTurn && s.activePlayer !== owner)) continue;
      if (tax.loyalty && ((ab.loyalty === undefined && !ab.loyaltyX) || !objIsType(s, o, "Planeswalker"))) continue;
      if (tax.filter?.chosen === "name" ? src.chosen?.name === undefined || !hasName(currentName(s, o), src.chosen.name) : !!tax.filter) continue;
      n += tax.n;
    }
  }
  return n;
}

/**
 * Creatures that could crew this Vehicle: other untapped creatures you control (CR 702.122a), not one that "can't crew
 * Vehicles" (Revoke Privileges). `crewing` false: for saddle or station, which aren't crewing.
 */
export function crewCandidates(s: GameState, pid: PlayerId, vehicleId: ObjectId, crewing = true): GameObject[] {
  return creaturesOf(s, pid).filter((c) => c.id !== vehicleId && !c.tapped && !(crewing && characteristics(s, c).cantCrew));
}

/**
 * A creature's contribution to "total power N or greater": negative power adds nothing. "Crews Vehicles as though its
 * power were 2 greater", "using its toughness": its own static abilities say otherwise; for saddling only if they say so.
 */
export function crewPower(s: GameState, c: GameObject, saddle = false): number {
  const as = abilitiesOf(s, c).crewsAs;
  if (!as || (saddle && !as.saddles)) return Math.max(0, power(s, c));
  return Math.max(0, (as.toughness ? toughness(s, c) : power(s, c)) + (as.n ?? 0));
}

/**
 * Crew N's cost (CR 702.122a): tap any number of other untapped creatures you control with total
 * power N or greater. Without a choice, whether some choice would do.
 */
function crewProblem(s: GameState, pid: PlayerId, vehicle: GameObject, n: number, chosen?: ObjectId[], saddle = false): string | null {
  const what = saddle ? "saddle" : "crew";
  if (chosen === undefined) {
    const total = crewCandidates(s, pid, vehicle.id, !saddle).reduce((x, c) => x + crewPower(s, c, saddle), 0);
    return total >= n ? null : `not enough untapped creatures to ${what} ${n}`;
  }
  if (chosen.includes(vehicle.id)) return saddle ? "a Mount can't saddle itself" : "a Vehicle can't crew itself";
  const problem = tapCreaturesProblem(s, pid, chosen, what);
  if (problem) return problem;
  const total = chosen.reduce((x, id) => x + crewPower(s, obj(s, id), saddle), 0);
  return total >= n ? null : `those creatures have total power ${total}; ${what} ${n} needs ${n} or more`;
}

/**
 * Activate an ability (CR 602.2). Returns whether it was a mana ability, which resolved right away instead of going on
 * the stack (CR 605.3b). `mana` and `extra`: for a mana ability, as for activateMana.
 */
function activateAbility(s: GameState, p: Player, id: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x0?: number, costs?: CostChoices, mana?: ManaType, extra?: ManaType[]): boolean {
  const o = obj(s, id);
  const d = defOf(s, o);
  const ab = abilitiesOf(s, o).activated[index];
  // Prototype Portal: an X its text sets (CR 107.3c).
  const x = x0 ?? (ab && definedX(s, o, ab)) ?? undefined;
  if (ab?.body.modal && modes === undefined) throw new RulesError(abilityProblem(s, p.id, id, index) ?? `choose ${describeCount(ab.body.modal.min, ab.body.modal.max)} for ${d.name}'s ability`);
  if (ab?.station && !tapCreatures) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose a creature to tap for station");
  if (ab?.crew !== undefined && !tapCreatures) throw new RulesError(abilityProblem(s, p.id, id, index) ?? `choose creatures to ${ab.saddle ? "saddle" : "crew"} with`);
  // What pays each cost beyond mana is chosen as it's activated (CR 602.2b, 601.2h): an activation that doesn't say,
  // or says for one cost and not another, can't skip it. As for spells (castSpell).
  if (ab && activatedCosts(ab, x, o).some((c) => "n" in c && c.n > 0 && costNeedsPick(c) && !costs?.[costPickKey(c)]?.length)) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose what to pay the cost with");
  if (ab?.costs?.some((c) => c.kind === "forage") && !costs?.sacrifice?.length && !costs?.exileCards?.length) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose how to forage: three cards in your graveyard to exile, or a Food to sacrifice");
  let body = ab ? settleDivided(s, withModes(ab.body, modes), { controller: p.id, sourceId: id, x: x ?? 0 }) : undefined;
  const problem = abilityProblem(s, p.id, id, index, body?.targets.length ? (targets ?? []) : undefined, ab?.body.modal ? modes : undefined, tapCreatures, x, costs ?? {});
  if (problem || !ab || !body) throw new RulesError(problem ?? "no such ability");
  if (manySlot(body.targets) >= 0) {
    const fit = fitMany(body, targets ?? [], manyX(s, body.targets, p.id, id, x)) as Exclude<ReturnType<typeof fitMany>, string>;
    [body, targets] = [fit.body, fit.targets];
  }
  const manaPick = ab.mana ? manaAbilityPick(s, p.id, o, index, mana, extra) : undefined;
  if (!ab.mana && (mana !== undefined || extra !== undefined)) throw new RulesError(`${d.name}'s ability isn't a mana ability`);
  // The source as it was activated, for "whenever an opponent activates an ability of a creature".
  const activatedFrom = o.zone === "battlefield" ? { snapshot: structuredClone(o), chars: characteristics(s, o) } : undefined;
  // "Whenever you activate an ability of a card in your graveyard" (Neerdiv): where it was as it was activated (CR 602.2),
  // even if a cost moves it (unearth's doesn't, embalm's does).
  const fromOwnGraveyard = o.zone === "graveyard" && o.owner === p.id ? (true as const) : undefined;
  // Costs (CR 602.2b, 601.2g-h): mana, tapping, then sacrificing or discarding the card itself.
  const abCost = activationCost(s, p.id, o, ab, targets, x);
  // "Pay half your life, rounded up": worked out with the rest of the cost, before any of it is paid (CR 601.2f-h).
  const halfLife = halfLifeCost(s, p.id, ab);
  const lifeCost = activatedLifeCost(s, p.id, ab, o, x);
  const due = lessWaterbend(abCost, ab.loyaltyX ? 0 : (x ?? 0) * xCount(abCost), ab, tapCreatures);
  const paid = spendFromPool(s, p.id, due.cost, abilityUse(o, ab, s), due.extra, payableLife(s, p.id) - halfLife - lifeCost)!;
  // A Treasure's mana ability makes "mana from a Treasure" (CR 106.3), even though it's sacrificed as it's activated.
  const manaFrom = manaPick ? manaOriginsOf(s, o) : [];
  // The source as it is now, for "its power" after it's sacrificed as a cost (CR 608.2h).
  const equipment = o.zone === "battlefield" ? s.battlefield.filter((b) => obj(s, b).attachedTo === o.id && characteristics(s, obj(s, b)).subtypes.includes("Equipment")).map((b) => ({ id: b, zc: obj(s, b).zoneChanges ?? 0 })) : [];
  const lki: LastKnown | undefined = o.zone === "battlefield" ? { power: power(s, o), toughness: toughness(s, o), counters: { ...o.counters }, ...(o.chosen?.player !== undefined ? { chosenPlayer: o.chosen.player } : {}), ...(equipment.length ? { equipment } : {}) } : ab.costs?.some((c) => c.kind === "returnToHand") ? {} : undefined;
  if (ab.revealChosen && o.chosen?.player !== undefined) {
    o.chosen = { ...o.chosen, secret: undefined };
    log(s, `${p.name} reveals the player chosen for ${d.name}: ${player(s, o.chosen.player!).name}.`);
  }
  loseLife(s, p.id, paid.lifePaid + lifeCost + halfLife);
  if (halfLife) log(s, `${p.name} pays ${halfLife} life (half their life, rounded ${ab.halfLifeCost}).`);
  if (ab.energyCost) loseEnergy(s, p.id, ab.energyCost);
  if (ab.discardHand) {
    log(s, `${p.name} discards their hand${p.hand.length ? "" : " (no cards)"}.`);
    discardCards(s, p.id, [...p.hand]);
  }
  if (ab.energyX && x) {
    loseEnergy(s, p.id, x);
    log(s, `${p.name} pays ${x} energy.`);
  }
  const countersRemoved = ab.removeCounters?.all ? Math.max(0, o.counters[ab.removeCounters.counter] ?? 0) : ab.removeCounters?.x ? (x ?? 0) : undefined;
  if (ab.removeCounters) removeCountersCost(s, o, countersRemoved !== undefined ? { counter: ab.removeCounters.counter, n: countersRemoved } : ab.removeCounters);
  if (countersRemoved !== undefined) log(s, `${p.name} removes ${countersRemoved} ${ab.removeCounters!.counter} counter${countersRemoved === 1 ? "" : "s"} from ${d.name}.`);
  // "Put a -1/-1 counter on ~" (Devoted Druid): through the replacement effects on counters (Vizier of Remedies rulings).
  if (ab.putCounters) {
    const put = putCounters(s, o, ab.putCounters.counter, ab.putCounters.n);
    invalidateCharacteristics(s);
    log(s, `${p.name} puts ${put === 1 ? "a" : put} ${ab.putCounters.counter} counter${put === 1 ? "" : "s"} on ${d.name}.`);
  }
  // A loyalty cost puts on or removes loyalty counters (CR 606.4); counters put on as a cost aren't doubled (rulings).
  let loyaltyRemoved: number | undefined;
  if (ab.loyalty !== undefined || ab.loyaltyX) {
    const change = ab.loyaltyX ? -(x ?? 0) : ab.loyalty!;
    loyaltyRemoved = Math.max(0, -change);
    o.counters.loyalty = (o.counters.loyalty ?? 0) + change;
    (o.activatedThisTurn ??= []).push(LOYALTY_USED);
    if (objIsType(s, o, "Planeswalker")) p.loyaltyTurn = s.turn; // The Chain Veil
    invalidateCharacteristics(s);
    // They're still put on, so "whenever you put one or more loyalty counters on a planeswalker" triggers (CR 122.6).
    if (change > 0) fireEvent(s, { type: "countersPut", id: o.id, counter: "loyalty", amount: change, by: p.id });
  }
  (o.activatedThisTurn ??= []).push(index); // "once each turn" (CR 602.5b); bots also count repeats (bot.ts)
  if (ab.equip && !s.turnLog?.equipped?.includes(p.id)) ((s.turnLog ??= {}).equipped ??= []).push(p.id);
  if (ab.onceEver) (o.activatedEver ??= []).push(index); // exhaust (CR 702.177a)
  if (ab.keyword === "Exhaust") p.exhaustTurn = s.turn; // CR 702.177b
  // "Choose one that hasn't been chosen" (Three Bowls of Porridge): chosen as it's activated.
  if (ab.body.modal && modes) noteModesChosen(s, ab.body, o.id, modes);
  if (ab.tap) tapPermanent(s, o);
  if (ab.untapSelf) untapPermanent(s, o);
  if (ab.exertCost && o.zone === "battlefield") {
    o.skipNextUntap = true; // CR 701.43a
    o.exertedTurn = s.turn;
    log(s, `${p.name} exerts ${d.name}.`);
    fireEvent(s, { type: "exerted", id: o.id });
  }
  if (ab.tapAttached && o.attachedTo && s.objects[o.attachedTo]?.zone === "battlefield") tapPermanent(s, obj(s, o.attachedTo));
  if (ab.unattachCost && o.attachedTo) {
    log(s, `${p.name} unattaches ${d.name} from ${nameOf(s, o.attachedTo)}.`);
    fireEvent(s, { type: "unattached", id: o.id, host: o.attachedTo });
    o.attachedTo = undefined;
    invalidateCharacteristics(s);
  }
  for (const c of tapCreatures ?? []) tapPermanent(s, obj(s, c));
  if (ab.waterbend !== undefined && tapCreatures?.length) log(s, `${p.name} taps ${tapCreatures.map((c) => nameOf(s, c)).join(", ")} to waterbend.`);
  // Its last known information takes in the counters its cost put on or removed (CR 608.2h): Nissa, Ascended Animist's
  // +1 gone before it resolves makes a Horror as big as her loyalty after the +1.
  if (lki?.counters && o.zone === "battlefield" && (ab.loyalty !== undefined || ab.loyaltyX || ab.putCounters || ab.removeCounters)) Object.assign(lki, { power: power(s, o), toughness: toughness(s, o), counters: { ...o.counters } });
  const sourceZc = o.zoneChanges ?? 0;
  const stamped = stampTargets(s, targets);
  const costCardNames: string[] = [];
  const costDiscarded: string[] = [];
  const costExiled: { id: ObjectId; zc: number }[] = [];
  const sacrificed = ab.costs?.length ? payExtraCosts(s, p, activatedCosts(ab, x, o), costs ?? {}, lki, costCardNames, costDiscarded, costExiled) : [];
  const tappedOne = ab.costs?.some((c) => c.kind === "tap" && c.n === 1 && !c.untap && !c.x) && costs?.tap?.length === 1 ? costs.tap[0] : undefined;
  if (ab.sacrificeSelf && o.zone === "battlefield" && (o.zoneChanges ?? 0) === sourceZc) moveObject(s, id, "graveyard", { sacrificed: true });
  if (ab.discardSelf) discardCards(s, p.id, [id], "", true, !!ab.cycling, undefined, ab.cycling ? x : undefined);
  // Scavenge (CR 702.97a) from the graveyard; "Exile ~" on the battlefield, if it's still the same object (CR 400.7).
  if (ab.exileSelf && (ab.zone !== undefined || (o.zone === "battlefield" && (o.zoneChanges ?? 0) === sourceZc))) moveObject(s, id, "exile");
  if (ab.returnSelf && o.zone === "battlefield" && (o.zoneChanges ?? 0) === sourceZc) moveObject(s, id, ab.toLibraryBottom ? "library" : "hand"); // "library": to the bottom
  const stackId = `s${s.nextId++}`;
  const item: StackItem = {
    id: stackId,
    kind: "ability",
    sourceId: id,
    sourceCardId: cardIdOf(o),
    sourceZc,
    controller: p.id,
    description: describeAbility(d, body.text),
    body,
    targets: body.targets.length ? stamped : undefined,
    modes: ab.body.modal ? modes : undefined,
    ...(lki ? { lki } : {}),
    ...(abCost.hasX || ab.loyaltyX || abilityCostsHaveX(ab) ? { x: x ?? 0 } : {}),
    // A loyalty ability (CR 606.3): "target loyalty ability of a planeswalker" (Verdant Command).
    ...(ab.loyalty !== undefined || ab.loyaltyX ? { loyalty: true as const } : {}),
    ...(sacrificed.length ? { sacrificed } : {}),
    ...(costCardNames.length ? { costCardNames } : {}),
    ...(costDiscarded.length ? { costDiscarded } : {}),
    ...(countersRemoved !== undefined ? { countersRemoved } : {}),
    ...(costExiled.length ? { costExiled } : {}),
    ...(ab.station ? { stationed: { id: tapCreatures![0]!, zc: obj(s, tapCreatures![0]!).zoneChanges ?? 0, power: power(s, obj(s, tapCreatures![0]!)) } } : {}),
    // "Tap an untapped creature you control: ... where X is the power of the creature tapped this way" (Keldon Battlewagon).
    ...(!ab.station && tappedOne !== undefined ? { stationed: { id: tappedOne, zc: obj(s, tappedOne).zoneChanges ?? 0, power: power(s, obj(s, tappedOne)) } } : {}),
    ...(o.tapped ? { sourceUntaps: o.untaps ?? 0 } : {}),
    ...(o.transforms ? { sourceTransforms: o.transforms } : {}),
    ...(JSON.stringify(body.effects).includes('"kind":"activatedTimes"') ? { activatedIndex: index } : {}),
    ...(manaPick ? { manaAbility: { index, tapped: ab.tap, ...(manaPick.extra ? { extra: manaPick.extra } : {}), ...(manaFrom.length ? { from: manaFrom } : {}) } } : {}),
    ...(paid.treasure ? { treasureSpent: paid.treasure } : {}),
    ...(paid.spent && Object.values(paid.spent).some((n) => n > 0) ? { manaSpentTypes: (Object.keys(paid.spent) as ManaType[]).flatMap((m) => Array<ManaType>(paid.spent[m]).fill(m)) } : {}),
  };
  if (manaPick) {
    // A mana ability doesn't go on the stack: it resolves as soon as it's activated (CR 605.3b).
    log(s, `${p.name} activates ${d.name} (${ab.text.replace(/~/g, d.name).replace(/\.$/, "")}).`);
    resolveManaAbility(s, item, body, manaPick.mana);
    fireEvent(s, { type: "activated", player: p.id, mana: true, ...(activatedFrom ? { source: activatedFrom } : {}), ...(paid.treasure ? { treasure: paid.treasure } : {}), ...(ab.keyword === "Exhaust" ? { exhaust: true as const } : {}) });
    return true;
  }
  s.stack.push(item);
  // The creatures tapped for a saddle cost saddled it (CR 702.171c), whether or not the ability resolves.
  // The creatures tapped for a crew cost crewed it (CR 702.122d), the same way.
  if (ab.crew !== undefined && tapCreatures?.length) {
    const list = (((s.turnLog ??= {})[ab.saddle ? "saddledBy" : "crewedBy"] ??= {})[`${o.id}@${o.zoneChanges ?? 0}`] ??= []);
    for (const c of tapCreatures) if (!list.includes(`${c}@${obj(s, c).zoneChanges ?? 0}`)) list.push(`${c}@${obj(s, c).zoneChanges ?? 0}`);
  }
  if (ab.cycling) log(s, `${p.name} cycles ${d.name} (${ab.text}).`);
  else if (ab.discardSelf) log(s, `${p.name} discards ${d.name} (${ab.text}).`);
  else if (ab.crew !== undefined) log(s, `${p.name} ${ab.saddle ? "saddles" : "crews"} ${d.name} with ${tapCreatures!.map((c) => nameOf(s, c)).join(", ")}.`);
  else if (ab.station) log(s, `${p.name} stations ${d.name} with ${nameOf(s, tapCreatures![0]!)}.`);
  else {
    // Say which ability: its cost and, for a modal one, the chosen modes.
    const cost = ab.text.split(":")[0]!;
    const what = ab.body.modal ? `${cost}: ${body.text}` : ab.text;
    log(s, `${p.name} activates ${d.name} (${what.replace(/~/g, d.name).replace(/\.$/, "")})${abCost.hasX ? ` with X=${x ?? 0}` : ""}${describeTargets(s, targets)}.`);
  }
  // Each creature tapped for a crew cost crewed the Vehicle (CR 702.122d), whether or not the ability resolves.
  if (ab.crew !== undefined && !ab.saddle) for (const c of tapCreatures ?? []) fireEvent(s, { type: "crews", id: c, vehicle: o.id });
  // Once it's activated (CR 602.2i), abilities that trigger on that do.
  // As it was activated, for "copy that ability" once it has left the stack (rulings on Rings of Brighthearth).
  (s.castItems ??= {})[stackId] = structuredClone(item);
  fireEvent(s, { type: "activated", player: p.id, stackId, ...(activatedFrom ? { source: activatedFrom } : {}), ...(fromOwnGraveyard ? { fromOwnGraveyard } : {}), ...(paid.treasure ? { treasure: paid.treasure } : {}), ...(parseManaCost(ab.manaCost).hasX ? { xCost: true as const } : {}), ...(ab.keyword === "Ninjutsu" ? { ninjutsu: true as const } : {}), ...(ab.keyword === "Boast" ? { boast: true as const } : {}), ...(ab.keyword === "Exhaust" ? { exhaust: true as const } : {}), ...(ab.outlast ? { outlast: true as const } : {}), ...(loyaltyRemoved !== undefined ? { loyalty: { removed: loyaltyRemoved } } : {}) });
  fireEvent(s, { type: "targeted", stackId });
  return false;
}

/**
 * The choices for activating a mana ability that resolves right away: the color for "one mana of any color" and the
 * picks for the triggered mana abilities tapping its source triggers (CR 605.4a). Without a color, it's asked as it
 * resolves, which can't happen while another decision is open (paying for ward, say). Throws if a choice is missing.
 */
function manaAbilityPick(s: GameState, pid: PlayerId, o: GameObject, index: number, mana?: ManaType, extra?: ManaType[]): { mana?: Color; extra?: ManaType[] } {
  const name = characteristics(s, o).name;
  const ab = abilitiesOf(s, o).activated[index]!;
  const options = activatedManaOptions(s, o, index);
  const sameExtra = (x: { extra?: ManaType[] }) => (x.extra ?? []).length === (extra ?? []).length && (x.extra ?? []).every((m, i) => m === extra![i]);
  if (options) {
    const colors = [...new Set(options.map((x) => x.mana))];
    if (mana === undefined) {
      if (colors.length === 1) mana = colors[0]!; // fixed mana: nothing to choose
      else {
        // The color is chosen as it resolves (CR 608.2d): not inside another decision, and only if that's the only choice.
        if (s.pending) throw new RulesError(`choose the mana ${name} adds`);
        if (options.length !== colors.length) throw new RulesError(`choose the mana that tapping ${name} also adds`);
        return {};
      }
    }
    const ofColor = options.filter((x) => x.mana === mana);
    if (!ofColor.length) throw new RulesError(`${name} can't add {${mana}}`);
    const pick = ofColor.length === 1 ? ofColor[0]! : ofColor.find(sameExtra);
    if (!pick) throw new RulesError(`choose the mana that tapping ${name} also adds`);
    // A color only for "one mana of any color" (a fixed {C}{C} has none to choose).
    return { ...(activatedAsMana(ab)!.produces.kind === "oneOf" ? { mana: mana as Color } : {}), ...(pick.extra ? { extra: pick.extra } : {}) };
  }
  if (mana !== undefined) throw new RulesError(`${name}'s ability has no color to choose before it resolves`);
  // What it adds isn't known until it resolves ("add {G}{G} instead"): it can't be activated if what tapping it
  // triggers would then need a choice (Fertile Ground's color), which isn't modeled yet.
  if (ab.tap && manaTriggerResults(s, pid, o, { tap: true } as ManaAbility, ["W", "U"]).length > 1) throw new RulesError(`${name}'s mana ability can't be used yet with what tapping it for mana triggers`);
  return {};
}

function chooseTriggerModes(s: GameState, p: Player, modes: number[]) {
  const pend = s.pending;
  if (pend?.kind !== "chooseModes" || pend.player !== p.id) throw new RulesError("no modes to choose");
  const t = s.triggerQueue[0]!;
  const problem = modesProblem(s, triggerBody(s, t), modes, p.id, sourceQuality(s, t.sourceId, t.sourceCardId), !!t.both, t.sourceId);
  // Choosing no modes is allowed for "choose up to"; the ability is then removed (CR 603.3c).
  if (problem && !(modes.length === 0 && pend.min === 0)) throw new RulesError(problem);
  t.modes = modes;
  s.pending = null;
}

/**
 * What a spell copy choosing new targets is, for protection and "can't be the target of" (CR 702.16b, 115.4): a spell
 * with the copied spell's characteristics (CR 707.10).
 */
export function copyTargetQuality(s: GameState): SourceQuality | undefined {
  const sc = s.resolving?.scratch?.copies;
  const orig = sc ? (s.stack.find((x) => x.id === sc.of) ?? s.castItems?.[sc.of] ?? s.epics?.[sc.of]) : undefined;
  const card = orig?.objectId ? s.objects[orig.objectId] : undefined;
  return card ? spellQuality(s, cardIdOf(card), orig) : undefined;
}

/** A spell copy's targets (CR 707.10c): any it keeps may be illegal now; any it changes must be legal. */
function chooseCopyTargets(s: GameState, p: Player, targets?: TargetChoice[]) {
  const pend = s.pending;
  const sc = s.resolving?.scratch?.copies;
  if (pend?.kind !== "copyTargets" || pend.player !== p.id || !sc) throw new RulesError("no copy to choose targets for");
  if (targets) {
    if (targets.length !== pend.specs.length) throw new RulesError(`choose ${pend.specs.length} target${pend.specs.length === 1 ? "" : "s"}`);
    const key = (t: TargetChoice | undefined) => (t ? (t.kind === "none" ? "none" : `${t.kind}:${t.id}`) : "");
    const changed = targets.map((t, i) => key(t) !== key(pend.current[i]));
    // A divided amount stays as it was: the number of targets and the division can't change (rulings on Pyrotechnics).
    const part = (t: TargetChoice | undefined) => (t && (t.kind === "object" || t.kind === "player") ? t.amount : undefined);
    if (targets.some((t, i) => changed[i] && pend.specs[i]?.divided && (t.kind === "none" || pend.current[i]?.kind === "none"))) throw new RulesError("the number of targets of a divided amount can't change");
    const kept = targets.map((t, i) => (!changed[i] ? pend.current[i]! : part(pend.current[i]) !== undefined && (t.kind === "object" || t.kind === "player") ? { ...t, amount: part(pend.current[i]) } : t));
    for (let i = 0; i < targets.length; i++)
      if (changed[i] && !canChooseTarget(s, pend.specs, kept, i, targets[i]!, p.id, copyTargetQuality(s))) throw new RulesError("that isn't a legal new target");
    targets = kept;
  }
  sc.targets = targets ?? pend.current;
  s.pending = null;
  continueResolution(s);
}

/** What a spell or ability on the stack is, for its targets: the spell's own characteristics, or its source's (CR 113.7a). */
export function stackItemQuality(s: GameState, item: StackItem): SourceQuality | undefined {
  const o = item.objectId ? s.objects[item.objectId] : undefined;
  return o ? spellQuality(s, cardIdOf(o), item) : sourceQuality(s, item.sourceId, item.sourceCardId);
}

/**
 * New targets for a spell or ability (CR 115.7d): any kept may be illegal now; any changed must be legal for it, as its
 * controller, and mustn't make a kept one illegal ("another target"). A divided amount stays as it was (rulings).
 */
function chooseNewTargets(s: GameState, p: Player, targets?: TargetChoice[]) {
  const pend = s.pending;
  const sc = s.resolving?.scratch ?? (s.resolving ? (s.resolving.scratch = {}) : undefined);
  if (pend?.kind !== "newTargets" || pend.player !== p.id || !sc) throw new RulesError("no targets to choose");
  const item = s.stack.find((x) => x.id === pend.stackId);
  if (targets && item) {
    if (targets.length !== pend.specs.length) throw new RulesError(`choose ${pend.specs.length} target${pend.specs.length === 1 ? "" : "s"}`);
    const changed = targets.map((t, i) => (t.kind === "none" ? (pend.current[i]?.kind ?? "none") !== "none" : !sameTarget(pend.current[i], t)));
    const part = (t: TargetChoice | undefined) => (t && (t.kind === "object" || t.kind === "player") ? t.amount : undefined);
    if (targets.some((t, i) => changed[i] && (pend.specs[i]?.divided || part(pend.current[i]) !== undefined) && (t.kind === "none" || pend.current[i]?.kind === "none"))) throw new RulesError("the number of targets of a divided amount can't change");
    const kept = targets.map((t, i) => (!changed[i] ? pend.current[i]! : part(pend.current[i]) !== undefined && (t.kind === "object" || t.kind === "player") ? { ...t, amount: part(pend.current[i]) } : t));
    const q = stackItemQuality(s, item);
    for (let i = 0; i < targets.length; i++) {
      if (!changed[i]) continue;
      const t = targets[i]!;
      // Not itself (CR 115.5).
      if ((t.kind === "stack" && t.id === item.id) || !canChooseTarget(s, pend.specs, kept, i, t, pend.controller, q, item.sourceId)) throw new RulesError("that isn't a legal new target");
    }
    for (let i = 0; i < kept.length; i++)
      if ((pend.specs[i]?.distinctFrom ?? []).some((j) => (changed[i] || changed[j]) && kept[i]!.kind !== "none" && sameTarget(kept[j], kept[i]!))) throw new RulesError("those targets must be different");
    targets = kept;
  }
  sc.retargets = targets ?? pend.current;
  s.pending = null;
  continueResolution(s);
}

/** The new target of a spell whose target is being changed (CR 115.7a): one of the legal ones offered. */
function chooseNewTarget(s: GameState, p: Player, target: TargetChoice) {
  const pend = s.pending;
  const sc = s.resolving?.scratch ?? (s.resolving ? (s.resolving.scratch = {}) : undefined);
  if (pend?.kind !== "changeTarget" || pend.player !== p.id || !sc) throw new RulesError("no target to change");
  const t = pend.options.find((o) => sameTarget(o, target));
  if (!t) throw new RulesError("that isn't a legal new target");
  sc.newTarget = t;
  s.pending = null;
  continueResolution(s);
}

function chooseTriggerTargets(s: GameState, p: Player, targets: TargetChoice[]) {
  const pend = s.pending;
  if (pend?.kind !== "chooseTargets" || pend.player !== p.id) throw new RulesError("no targets to choose");
  const t = s.triggerQueue[0]!;
  // "Any number of target creatures": as many as were chosen (CR 601.2c, 603.3d).
  const fit = fitMany({ targets: pend.specs, effects: [], text: "" }, targets, manyX(s, pend.specs, p.id, t.sourceId, t.x ?? 0));
  if (typeof fit === "string") throw new RulesError(fit);
  const problem = targetProblem(s, fit.body.targets, fit.targets, p.id, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
  if (problem) throw new RulesError(problem);
  s.pending = null;
  pushTrigger(s, t, targets);
  s.passedInSuccession = [];
}

const hasLegalTargetsFor: typeof hasLegalTargets = (...a) => hasLegalTargets(...a);

/** A resolving spell or ability is waiting for `p` to choose cards to discard (CR 701.9b). */
function chooseDiscard(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "discard" || pend.player !== p.id || !r?.scratch?.queue) throw new RulesError("no discard pending");
  if ((pend.upTo ? new Set(ids).size !== ids.length || ids.length > pend.count : new Set(ids).size !== pend.count) || ids.some((id) => !p.hand.includes(id))) throw new RulesError(pend.upTo ? `choose up to ${pend.count} card(s) from your hand` : `choose exactly ${pend.count} card(s) from your hand`);
  if (pend.filter && ids.some((id) => !printedMatches(pend.filter!, defOf(s, obj(s, id))))) throw new RulesError(`choose ${pend.filter.text.replace(/^(?!an? )/, "a ")}`);
  if (pend.among && ids.some((id) => !pend.among!.includes(id))) throw new RulesError("choose one of the cards just drawn");
  r.scratch.chosen![p.id] = ids;
  r.scratch.queue.shift();
  s.pending = null;
  continueResolution(s);
}

/** Brainstorm's "put two cards from your hand on top of your library in any order": the cards, top one first. */
function chooseHandToTop(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "handToTop" || pend.player !== p.id || !r) throw new RulesError("no cards to put on top");
  if (pend.discarding) {
    // Library of Leng: which of the cards being discarded go on top instead (see discardToTop).
    if (new Set(ids).size !== ids.length || ids.some((id) => !pend.discarding!.includes(id))) throw new RulesError("choose from the cards being discarded");
    ((r.scratch ??= {}).toTop ??= {})[p.id] = ids;
    s.pending = null;
    continueResolution(s);
    return;
  }
  if (new Set(ids).size !== ids.length || (pend.upTo ? ids.length > pend.count : ids.length !== pend.count) || ids.some((id) => !p.hand.includes(id))) throw new RulesError(pend.upTo ? "choose cards from your hand" : `choose exactly ${pend.count} card(s) from your hand`);
  ((r.scratch ??= {}).chosen ??= {})[p.id] = ids;
  s.pending = null;
  continueResolution(s);
}

/** "Sacrifice a creature", "return a land you control": the permanents this player picked (see the "pick" effect). */
function pickPermanents(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "pickPermanents" || pend.player !== p.id || (!pend.objectId && pend.action !== "unblocked" && pend.action !== "band" && pend.action !== "exert" && pend.action !== "keepTapped" && pend.action !== "untapLimited" && !r?.scratch?.queue)) throw new RulesError("nothing to pick");
  if (ids.some((id) => !pend.options.includes(id))) throw new RulesError("choose from the permanents offered");
  const n = new Set(ids).size;
  if (n !== ids.length || n > pend.count || n < (pend.min ?? pend.count))
    throw new RulesError(pend.min === undefined ? `choose exactly ${pend.count} of the permanents offered` : `choose at most ${pend.count} of the permanents offered`);
  if (pend.maxTotalPower !== undefined && ids.reduce((t, id) => t + power(s, obj(s, id)), 0) > pend.maxTotalPower) throw new RulesError(`choose creatures with total power ${pend.maxTotalPower} or less`);
  if (pend.attackCost) {
    attackCostPaid(s, p, ids);
    return;
  }
  if (pend.action === "exert") {
    exertChosen(s, ids);
    return;
  }
  if (pend.action === "keepTapped") {
    s.pending = null;
    if (ids.length) log(s, `${p.name} keeps ${ids.map((id) => nameOf(s, id)).join(", ")} tapped.`);
    untapStep(s, ids);
    return;
  }
  if (pend.action === "untapLimited") {
    const problem = untapChoiceProblem(s, p.id, pend.options, ids);
    if (problem) throw new RulesError(problem);
    s.pending = null;
    log(s, `${p.name} untaps ${ids.length ? ids.map((id) => nameOf(s, id)).join(", ") : "none"} of ${pend.options.length} (${pend.what} at most).`);
    untapStep(s, pend.kept ?? [], ids);
    return;
  }
  if (pend.action === "enlist") {
    enlistChosen(s, pend.objectId!, ids);
    return;
  }
  if (pend.action === "band") {
    bandChosen(s, ids);
    return;
  }
  if (pend.action === "unblocked") {
    const c = s.unblockedChoice!;
    c.asked.push(p.id);
    c.ids.push(...ids);
    if (ids.length) log(s, `${p.name} has ${ids.map((id) => nameOf(s, id)).join(", ")} assign combat damage as though not blocked.`);
    s.pending = null;
    if (!askUnblocked(s)) dealCombatDamage(s, s.step === "firstStrikeDamage");
    return;
  }
  if (pend.objectId) {
    s.pending = null;
    const entry = s.entersChoices?.shift();
    if (entry?.what === "sacrificeInstead") {
      sacrificedInstead(s, obj(s, pend.objectId), ids, entry.enters);
      return;
    }
    if (pend.action === "reveal") amplifyChosen(s, obj(s, pend.objectId), ids, entry?.enters);
    else devourChosen(s, obj(s, pend.objectId), ids, entry?.enters);
    return;
  }
  if (!r?.scratch?.queue) throw new RulesError("nothing to pick");
  r.scratch.chosen![p.id] = ids;
  r.scratch.queue.shift();
  s.pending = null;
  continueResolution(s);
}

/** How a "distribute" effect's counters are divided (CR 608.2d): all of them, among the permanents offered. */
function distributeChosen(s: GameState, p: Player, parts: Record<ObjectId, number>) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "distribute" || pend.player !== p.id || !r) throw new RulesError("nothing to distribute");
  const given = Object.entries(parts).filter(([, n]) => n !== 0);
  if (given.some(([id, n]) => !pend.options.includes(id) || !Number.isInteger(n) || n < 0)) throw new RulesError(`distribute the counters among the ${pend.what}`);
  const sum = given.reduce((a, [, n]) => a + n, 0);
  // Sensational Spider-Man: up to that many, none from a permanent more than it has.
  if (pend.remove) {
    if (sum > pend.total || given.some(([id, n]) => n > (pend.has?.[id] ?? 0))) throw new RulesError(`remove at most ${pend.total} ${pend.counter} counters, no more from each than it has`);
    r.scratch = { ...r.scratch, distributed: Object.fromEntries(given) };
    s.pending = null;
    log(s, sum ? `${p.name} removes ${sum} ${pend.counter} counter${sum > 1 ? "s" : ""}: ${given.map(([id, n]) => `${n} from ${nameOf(s, id)}`).join(", ")}.` : `${p.name} removes no ${pend.counter} counters.`);
    continueResolution(s);
    return;
  }
  if (pend.move ? sum > pend.total : sum !== pend.total) throw new RulesError(pend.move ? `move at most ${pend.total} ${pend.counter} counters` : `distribute all ${pend.total} ${pend.counter} counters`);
  r.scratch = { ...r.scratch, distributed: Object.fromEntries(given) };
  s.pending = null;
  if (pend.move) log(s, sum ? `${p.name} moves ${sum} ${pend.counter} counter${sum > 1 ? "s" : ""}: ${given.map(([id, n]) => `${n} onto ${nameOf(s, id)}`).join(", ")}.` : `${p.name} moves no counters.`);
  else log(s, `${p.name} distributes ${pend.total} ${pend.counter} counter${pend.total > 1 ? "s" : ""}: ${given.map(([id, n]) => `${n} on ${nameOf(s, id)}`).join(", ")}.`);
  continueResolution(s);
}

/** "Add X mana in any combination of colors": how much of each color, X in all (CR 106.1b, 608.2d). */
function manaMixChosen(s: GameState, p: Player, counts: Partial<Record<Color, number>>) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "manaMix" || pend.player !== p.id || !r) throw new RulesError("no mana to choose");
  const given = Object.entries(counts).filter(([, n]) => n !== 0) as [Color, number][];
  if (given.some(([c, n]) => !(pend.colors ?? COLORS).includes(c) || !Number.isInteger(n) || n < 0)) throw new RulesError(`choose ${pend.colors ? "among those colors" : "colors"} for the mana`);
  if (given.reduce((a, [, n]) => a + n, 0) !== pend.n) throw new RulesError(`choose colors for all ${pend.n} mana`);
  r.scratch = { ...r.scratch, manaMix: Object.fromEntries(given) };
  s.pending = null;
  continueResolution(s);
}

/** Scry or surveil: put the looked-at cards back on top in the given order, the rest on the bottom or into the graveyard. */
function arrangeTop(s: GameState, p: Player, top: ObjectId[], away: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "arrangeTop" || pend.player !== p.id || !r) throw new RulesError("nothing to arrange");
  const all = [...top, ...away];
  if ((pend.how === "order" || pend.how === "bottom" || pend.how === "look") && away.length) throw new RulesError(pend.how === "bottom" ? "put them all on the bottom" : "put them all back on top");
  if (all.length !== pend.cards.length || new Set(all).size !== all.length || all.some((id) => !pend.cards.includes(id)))
    throw new RulesError("put each card on top or " + (pend.how === "scry" ? "on the bottom" : "into your graveyard"));
  // Visions: "Look at the top five cards": only looked at, so they stay in the order they were in.
  if (pend.how === "look" && top.some((id, i) => id !== pend.cards[i])) throw new RulesError("leave them in the order they were in");
  r.scratch = { ...r.scratch, arranged: { top, away } };
  s.pending = null;
  continueResolution(s);
}

/** Marks, in `activatedThisTurn`, that a loyalty ability of the permanent was activated this turn (CR 606.3). */
const LOYALTY_USED = -1;

/**
 * How many loyalty abilities of this permanent its controller may activate each turn: one (CR 606.3), or two with its
 * own "twice each turn" (Urza, Planeswalker) or its controller's Oath of Teferi.
 */
function loyaltyPerTurn(s: GameState, o: GameObject): number {
  const pid = controllerOf(s, o);
  // The Chain Veil: one more for each time its ability resolved for this player this turn, planeswalkers only.
  const veil = objIsType(s, o, "Planeswalker") ? (s.turnRules ?? []).filter((r) => r.turn === s.turn && r.player === pid && r.rule === "extraLoyalty").length : 0;
  if (abilitiesOf(s, o).loyaltyTwice) return 2 + veil;
  return (s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).loyaltyTwice === "yours" && controllerOf(s, obj(s, id)) === pid) ? 2 : 1) + veil;
}

/** The cards a library search found (CR 701.23). */
function searchLibrary(s: GameState, p: Player, found: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind === "searchLibrary" && pend.opening && pend.player === p.id) {
    if (new Set(found).size !== found.length || found.some((id) => !pend.cards.includes(id))) throw new RulesError(`those cards aren't ${pend.what}`);
    s.pending = null;
    if (pend.reveal) {
      // Revealed from the opening hand (CR 103.6b): each makes its delayed trigger (CR 603.7), made before the first turn.
      for (const id of found) {
        const o = obj(s, id);
        const r = compileCard(defOf(s, o)).openingReveal!;
        log(s, `${p.name} reveals ${nameOf(s, id)} from their opening hand.`);
        (s.delayed ??= []).push({ when: r.when, controller: p.id, sourceCardId: cardIdOf(o), subject: { id, zc: o.zoneChanges ?? 0 }, body: r.body, turn: 0, step: s.step });
      }
      nextOpeningAction(s);
      return;
    }
    if (pend.exile) {
      // "If you do, exile a card from your hand" (Gemstone Caverns): one for each that began the game on the battlefield.
      if (found.length !== pend.min) throw new RulesError(`exile ${pend.min} card${pend.min === 1 ? "" : "s"}`);
      for (const id of found) {
        log(s, `${p.name} exiles ${nameOf(s, id)} from their hand.`);
        moveObject(s, id, "exile");
      }
    } else {
      let exile = 0;
      for (const id of found) {
        const begin = compileCard(defOf(s, obj(s, id))).beginOnBattlefield;
        moveObject(s, id, "battlefield");
        // "With a luck counter on it": it begins the game with it, it doesn't enter with it (CR 103.6a).
        if (typeof begin === "object") {
          obj(s, id).counters[begin.counter] = (obj(s, id).counters[begin.counter] ?? 0) + 1;
          exile++;
        }
        log(s, `${p.name} begins the game with ${nameOf(s, id)}${typeof begin === "object" ? ` on the battlefield with a ${begin.counter} counter on it` : " on the battlefield"}.`);
      }
      const n = Math.min(exile, p.hand.length);
      if (n) {
        invalidateCharacteristics(s);
        s.pending = { kind: "searchLibrary", player: p.id, source: "Gemstone Caverns", what: n === 1 ? "a card" : `${n} cards`, cards: [...p.hand], min: n, max: n, fromHand: true, opening: true, exile: true };
        return;
      }
    }
    invalidateCharacteristics(s);
    nextOpeningAction(s);
    return;
  }
  const r = s.resolving;
  if (pend?.kind !== "searchLibrary" || pend.player !== p.id || !r) throw new RulesError("you aren't searching a library");
  if (new Set(found).size !== found.length || found.some((id) => !pend.cards.includes(id))) throw new RulesError(`those cards aren't ${pend.what}`);
  if (found.length > pend.max) throw new RulesError(`find at most ${pend.max}`);
  // Searching simply for a number of cards, you find as many as you can (CR 701.23d).
  if (found.length < pend.min) throw new RulesError(`find ${pend.min} card${pend.min === 1 ? "" : "s"}`);
  if (pend.distinctManaValues && new Set(found.map((id) => defMv(defOf(s, obj(s, id))))).size !== found.length)
    throw new RulesError("choose cards with different mana values");
  if (pend.totalMv !== undefined && found.reduce((n, id) => n + defMv(defOf(s, obj(s, id))), 0) > pend.totalMv) throw new RulesError(`choose cards with total mana value ${pend.totalMv} or less`);
  if (pend.shareLandType && !shareLandType(found.map((id) => defOf(s, obj(s, id)))))
    throw new RulesError("choose cards that share a land type");
  if (pend.oneOfEach && !oneOfEachFits(pend.oneOfEach, found.map((id) => defOf(s, obj(s, id)))))
    throw new RulesError(`find one card for each: ${pend.oneOfEach.map((f) => f.text).join(", ")}`);
  r.scratch = { ...r.scratch, found };
  s.pending = null;
  continueResolution(s);
}

/** "A Forest card and a Plains card" (Krosan Verge): each card matches a different one of `specs` (a dual land is either). */
export function oneOfEachFits(specs: TargetSpec[], defs: CardDef[]): boolean {
  if (defs.length > specs.length) return false;
  const [d, ...rest] = defs;
  if (!d) return true;
  return specs.some((f, i) => printedMatches(f, d) && oneOfEachFits(specs.filter((_, j) => j !== i), rest));
}

/** A creature type or color named for a permanent entering (CR 614.12) or a resolving spell. */
function chooseOption(s: GameState, p: Player, choice: string) {
  const pend = s.pending;
  if (pend?.kind !== "chooseOption" || pend.player !== p.id) throw new RulesError("nothing to choose");
  if (pend.what === "devour" || pend.what === "amplify") throw new RulesError(`${pend.what} is chosen by picking cards`);
  const inRange = pend.numberRange && /^\d+$/.test(choice) && Number(choice) >= pend.numberRange.min && Number(choice) <= pend.numberRange.max;
  // "The color or colors of your choice" (CR 105.3): one or more different colors, named together ("White,Blue").
  if (pend.what === "colors") {
    const named = choice.split(",");
    if (!named.length || named.some((c) => !pend.options.includes(c)) || new Set(named).size !== named.length) throw new RulesError(`${choice} isn't one or more colors you can choose`);
    s.pending = null;
    const r = s.resolving!;
    r.chosen = withChoice(r.chosen, "colors", choice);
    log(s, `${p.name} chooses ${named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named[0]}.`);
    continueResolution(s);
    return;
  }
  if (!pend.options.includes(choice) && !inRange) throw new RulesError(`${choice} isn't ${pend.what === "color" ? "a color" : pend.what === "creatureType" ? "a creature type" : pend.numberRange ? `a number from ${pend.numberRange.min} to ${pend.numberRange.max}` : "an option"} you can choose`);
  s.pending = null;
  if (pend.what === "secretNumber") {
    // Kept secret until all are revealed (Wheel of Misfortune): the log says only that it was chosen.
    const st = s.resolving?.scratch?.numbers;
    if (!st) throw new RulesError("nothing to choose a number for");
    st.pick = Number(choice);
    continueResolution(s);
    return;
  }
  if (pend.what === "damageShield") {
    // Which damage a shield takes, or which shield applies first (CR 615.7, 616.1); combat damage waits for it. Damage
    // a resolving spell or ability deals: its instruction runs again with the answers so far (resolve.ts runAsking).
    if (s.damageBatch) {
      s.damageBatch.answers.push(Number(choice));
      finishCombatDamage(s);
      return;
    }
    const answers = s.resolving?.shieldAnswers;
    if (!answers) throw new RulesError("no damage is waiting on its shields");
    answers.push(Number(choice));
    continueResolution(s);
    return;
  }
  if (pend.what === "mutate") {
    // A mutating spell's controller puts it on top of the creature or underneath (CR 702.140c).
    const m = s.mutatingSpell;
    if (!m) throw new RulesError("nothing is mutating");
    s.mutatingSpell = undefined;
    const spell = obj(s, m.id);
    const host = obj(s, m.host);
    log(s, `${p.name} puts ${defOf(s, spell).name} ${choice === "top" ? "on top of" : "under"} ${nameOf(s, host.id)}: it mutates.`);
    mergeSpell(s, spell, host, choice === "top");
    return;
  }
  if (pend.what === "legend") {
    // The legend rule (CR 704.5j): kept as the state-based actions are performed, after any other group is asked about.
    (s.legendKeep ??= []).push(choice);
    log(s, `${p.name} keeps ${characteristics(s, obj(s, choice)).name}${obj(s, choice).isToken ? " (a token)" : ""} (legend rule).`);
    return;
  }
  if (pend.what === "enchant" && s.untilReturns?.auras[0]?.asking) {
    // An Aura returning from "until ~ leaves": its owner chose what it enchants (CR 303.4f).
    auraReturnChosen(s, choice);
    if (s.resolving) continueResolution(s);
    return;
  }
  if (pend.objectId) {
    const o = obj(s, pend.objectId);
    const entry = s.entersChoices?.shift();
    if (pend.what === "copy") {
      enterAsCopy(s, o, choice, entry?.enterOpts ?? {});
      return;
    }
    if (pend.what === "exchangeText") {
      if (!pend.options.includes(choice)) throw new RulesError("choose a creature offered, or none");
      enterExchangingText(s, o, choice, entry?.enterOpts ?? {});
      return;
    }
    if (pend.what === "controlOpponent") {
      if (!pend.options.includes(choice)) throw new RulesError("choose an opponent offered");
      // It enters under that player's control (CR 614.1c, 110.2).
      o.controller = Number(choice);
      invalidateCharacteristics(s);
      log(s, `${defOf(s, o).name} enters under ${player(s, o.controller).name}'s control.`);
      finishEnteringAs(s, o, { ...(entry?.enterOpts ?? {}), controlChosen: true });
      return;
    }
    if (pend.what === "discardInstead") {
      if (!pend.options.includes(choice)) throw new RulesError("choose a card offered, or none");
      if (choice !== "none" && obj(s, choice).zone === "hand") {
        discardCards(s, p.id, [choice]);
        log(s, `${pend.source} enters.`);
        if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
        return;
      }
      log(s, `${p.name} doesn't discard a card, so ${pend.source} goes to its owner's graveyard instead.`);
      neverEnters(s, o);
      return;
    }
    if (pend.what === "sacrificeInstead") {
      if (!pend.options.includes(choice)) throw new RulesError("choose a permanent offered");
      sacrificedInstead(s, o, choice, entry?.enters);
      return;
    }
    if (pend.what === "tribute") {
      // Tribute (CR 702.104a): the chosen opponent decides next, still as it enters.
      o.tribute = { to: Number(choice) };
      log(s, `${p.name} chooses ${player(s, Number(choice)).name} for ${pend.source}'s tribute.`);
      s.entersChoices!.unshift({ id: o.id, zc: o.zoneChanges ?? 0, what: "tributePay", ...(entry?.enters ? { enters: entry.enters } : {}) });
      return;
    }
    if (pend.what === "lifeAsEnters") {
      // "As ~ enters, pay any amount of life" (CR 614.12, 119.4): that much life is paid now, as it enters.
      const n = Number(choice);
      if (n) loseLife(s, p.id, n);
      o.lifePaidAsEntered = n;
      log(s, `${p.name} pays ${n} life as ${pend.source} enters.`);
      invalidateCharacteristics(s);
      if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
      return;
    }
    if (pend.what === "tributePay") {
      const n = compileCard(defOf(s, o)).tribute ?? 0;
      if (choice === "pay") {
        const put = putCounters(s, o, "+1/+1", n, true);
        o.tribute = { to: p.id, paid: true };
        log(s, `${p.name} pays tribute: ${pend.source} enters with ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
      } else log(s, `${p.name} doesn't pay tribute for ${pend.source}.`);
      invalidateCharacteristics(s);
      if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
      return;
    }
    if (pend.what === "player") {
      const pid = Number(choice);
      if (!pend.options.includes(choice)) throw new RulesError("choose one of the players offered");
      // "Secretly choose an opponent": nobody else learns who until it's revealed (Guardian Archon).
      if (entry?.pair) o.chosen = { ...o.chosen, players: [...(o.chosen?.players ?? []), pid] };
      else o.chosen = { ...o.chosen, player: pid, ...(entry?.secret ? { secret: true as const } : {}) };
      log(s, entry?.secret ? `${p.name} secretly chooses an opponent for ${pend.source}.` : `${p.name} chooses ${player(s, pid).name} for ${pend.source}.`);
      // Canker Abomination: "enters with a -1/-1 counter on it for each creature that player controls", counted with the
      // player chosen, as part of how it enters (CR 614.12), if it still has that ability as it is.
      const ewc = compileCard(defOf(s, o)).entersWithCounters;
      if (ewc?.afterPlayer && !entry?.pair && characteristics(s, o).hasPrintedAbilities) {
        const n = Math.max(0, evalAmount(s, ewc.n, { controller: o.controller, sourceId: o.id, chosen: o.chosen }));
        if (n) log(s, `${pend.source} enters with ${putCounters(s, o, ewc.counter, n, true)} ${ewc.counter} counter${n === 1 ? "" : "s"}.`);
      }
      if (entry?.lookHand) {
        log(s, `${p.name} looks at ${player(s, pid).name}'s hand.`);
        log(s, `${player(s, pid).name}'s hand: ${player(s, pid).hand.map((id) => defOf(s, obj(s, id)).name).join(", ") || "no cards"}.`, p.id);
      }
      invalidateCharacteristics(s);
      return;
    }
    if (pend.what === "protector") {
      setProtector(s, o, Number(choice));
      return;
    }
    if (pend.what === "anchor") {
      if (!pend.options.includes(choice)) throw new RulesError(`choose ${pend.options.join(" or ")}`);
      o.chosen = { ...o.chosen, anchor: choice };
      log(s, `${p.name} chooses ${choice} for ${pend.source}.`);
      invalidateCharacteristics(s);
      if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
      return;
    }
    if (pend.what === "readAhead") {
      // Read ahead: it enters with the chosen number of lore counters (CR 702.155b, 714.3b).
      const n = Number(choice);
      putCounters(s, o, "lore", n, true);
      log(s, `${p.name} chooses chapter ${roman(n)}: ${pend.source} enters with ${n} lore counter${n === 1 ? "" : "s"} (read ahead).`);
      invalidateCharacteristics(s);
      if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
      return;
    }
    if (pend.what === "form") {
      // "It becomes your choice of a 3/3 creature with flying, ...": those values are part of its copiable values (CR
      // 208.2b, 707.2), a copy effect over what it is now (a copy of Primal Clay adds its own choice to the copied one's,
      // rulings), from the moment it enters.
      const form = compileCard(defOf(s, o)).entersForms?.[Number(choice)];
      if (!form || !pend.options.includes(choice)) throw new RulesError("choose one of the offered forms");
      addCopyEffect(s, o, copyKey(s, copiableDef(s, o), form.except));
      log(s, `${pend.source} enters as ${form.text}.`);
    } else if (pend.what === "counterChoice") {
      // "Enters with your choice of a reach counter or a vigilance counter on it" (CR 614.1c, 614.12).
      if (!pend.options.includes(choice)) throw new RulesError(`choose ${pend.options.join(" or ")}`);
      const put = putCounters(s, o, choice, 1, true);
      log(s, `${pend.source} enters with ${put ? `a ${choice} counter` : `no ${choice} counter`}.`);
    } else if (pend.what === "riot" || pend.what === "unleash") {
      // Riot: a +1/+1 counter, or haste for as long as it's on the battlefield (CR 702.136a). Unleash: a counter or not (CR 702.98a).
      if (choice === ENTERS_COUNTER) putCounters(s, o, "+1/+1", 1, true);
      else if (pend.what === "riot")
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: pend.source, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      log(s, `${pend.source} enters ${choice === ENTERS_COUNTER ? "with a +1/+1 counter" : pend.what === "riot" ? "with haste" : "without a counter"} (${pend.what}).`);
    } else {
      o.chosen = withChoice(o.chosen, pend.what as ChoiceKind, choice);
      log(s, `${p.name} chooses ${choice} for ${pend.source}.`);
      // Banner of Kinship: "~ enters with a fellowship counter on it for each creature you control of the chosen type",
      // counted with the choice made, as part of how it enters (CR 614.12), if it still has that ability as it is.
      const ewc = compileCard(defOf(s, o)).entersWithCounters;
      if (ewc?.afterChoice === pend.what && characteristics(s, o).hasPrintedAbilities) {
        const n = Math.max(0, evalAmount(s, ewc.n, { controller: o.controller, sourceId: o.id, chosen: o.chosen }));
        if (n) log(s, `${pend.source} enters with ${putCounters(s, o, ewc.counter, n, true)} ${ewc.counter} counter${n === 1 ? "" : "s"}.`);
      }
    }
    invalidateCharacteristics(s);
    if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
    return;
  }
  const r = s.resolving;
  if (!r || pend.what === "lifeAsEnters" || pend.what === "riot" || pend.what === "unleash" || pend.what === "counterChoice" || pend.what === "form" || pend.what === "discardInstead" || pend.what === "sacrificeInstead" || pend.what === "copy" || pend.what === "exchangeText" || pend.what === "controlOpponent" || pend.what === "tribute" || pend.what === "tributePay" || pend.what === "readAhead" || pend.what === "player" || pend.what === "anchor" || pend.what === "protector") throw new RulesError("nothing to choose");
  if (pend.what === "searchZones") {
    if (!pend.options.includes(choice)) throw new RulesError("choose both or the graveyard only");
    (r.scratch ??= {}).searchZones = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "targetSlot") {
    (r.scratch ??= {}).targetSlot = Number(choice);
    continueResolution(s);
    return;
  }
  if (pend.what === "reselectAttack") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the players or permanents offered");
    (r.scratch ??= {}).reselect = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "attackWhom") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the players or planeswalkers offered");
    (r.scratch ??= {}).attackWhom = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "topOrBottom") {
    if (!pend.options.includes(choice)) throw new RulesError(`choose ${pend.options.join(" or ")}`);
    (r.scratch ??= {}).topOrBottom = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "pile") {
    if (choice !== "0" && choice !== "1") throw new RulesError("choose one of the two piles");
    (r.scratch ??= {}).pileChoice = Number(choice);
    log(s, `${p.name} chooses ${(pend.labels?.[Number(choice)] ?? `pile ${Number(choice) + 1}`).replace(/^Pile/, "pile")} (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "castFromHand") {
    (r.scratch ??= {}).castFromHand = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "revealHandOrTop") {
    if (!pend.options.includes(choice)) throw new RulesError("choose a card from your hand or the top card of your library");
    (r.scratch ??= {}).revealPick = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "exileHandOrPermanent") {
    const st = r.scratch?.handOrPermanent;
    if (!st || !pend.options.includes(choice)) throw new RulesError("choose a card in your hand or a permanent you control");
    st.queue.shift();
    st.picks.push(choice);
    log(s, `${player(s, pend.player).name} chooses ${s.objects[choice]?.zone === "hand" ? "a card in their hand" : (pend.labels?.[pend.options.indexOf(choice)] ?? "a permanent")} (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "impulseChoice") {
    const st = r.scratch?.impulseChoice;
    if (!st || !pend.options.includes(choice)) throw new RulesError("choose one of the exiled cards");
    st.pick = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "castFromAmong") {
    const st = r.scratch?.castAmong;
    if (!st || !pend.options.includes(choice)) throw new RulesError("choose one of the cards offered, or none");
    st.pick = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "timeTravel") {
    const st = r.scratch?.timeTravel;
    if (!st || !pend.about || !pend.options.includes(choice)) throw new RulesError("put a time counter on it, remove one, or leave it");
    st.picks[pend.about] = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "tapOrUntap") {
    (r.scratch ??= {}).tapOrUntap = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "payLife") {
    // "You may pay any amount of life": that much, paid next (CR 119.4).
    (r.scratch ??= {}).payX = choice;
    log(s, `${p.name} chooses to pay ${choice} life for ${pend.source}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "payEnergy") {
    // "You may pay any amount of {E}": that much, paid next (CR 107.14).
    (r.scratch ??= {}).payX = choice;
    log(s, `${p.name} chooses to pay ${choice} energy for ${pend.source}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "payX") {
    // "You may pay {X}": the X chosen (CR 107.1c), paid next.
    (r.scratch ??= {}).payX = choice;
    log(s, choice === "none" ? `${p.name} doesn't pay for ${pend.source}.` : `${p.name} chooses X = ${choice} for ${pend.source}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "drawUpTo") {
    // "Draw up to two cards": how many (rulings on Arcane Denial).
    (r.scratch ??= {}).drawUpTo = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "commander") {
    // Command Beacon with two commanders: which one (rulings).
    (r.scratch ??= {}).commander = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "punisher") {
    // An option's index, or "none" to take the penalty (see the punisher effect).
    const pu = r.scratch?.punish;
    if (pu) pu.picked[p.id] = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "payOrTop") {
    const pt = r.scratch?.payOrTop;
    if (!pt) throw new RulesError("nothing to choose");
    pt.answer = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "counterKind") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the kinds of counter it has");
    (r.scratch ??= {}).counterKind = choice;
    log(s, `${p.name} chooses a ${choice} counter (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "removeCounter") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the kinds of counter it has");
    (r.scratch ??= {}).counterKind = choice;
    // Slippery Bogbonder's options are "objectId:kind", labeled.
    if (choice !== "done") log(s, choice.includes(":") ? `${p.name} chooses ${pend.labels?.[pend.options.indexOf(choice)]?.replace(/^A /, "a ").replace(/ \(\d+ left\)$/, "") ?? "a counter"} (${pend.source}).` : `${p.name} chooses a ${choice} counter to remove (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "villainous") {
    const v = r.scratch?.villain;
    if (!v || !pend.options.includes(choice)) throw new RulesError("choose one of the two options");
    v.pick = Number(choice);
    log(s, `${p.name} faces a villainous choice and chooses: ${(pend.labels?.[v.pick] ?? choice).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())} (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "unlockDoor") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the locked doors");
    (r.scratch ??= {}).door = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "either") {
    (r.scratch ??= {}).either = Number(choice);
    log(s, `${p.name} chooses to ${(pend.labels?.[Number(choice)] ?? choice).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())} (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "endure") {
    (r.scratch ??= {}).endure = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "copyOrder") {
    const c = r.scratch?.copies;
    if (!c?.each) throw new RulesError("no copies to order");
    const at = c.each.length - c.left;
    const i = c.each.indexOf(choice);
    if (i < at) throw new RulesError("not one of the copies still to make");
    // The next copy targets this one (rulings on Zada: its controller chooses the order the copies go on the stack).
    c.each.splice(i, 1);
    c.each.splice(at, 0, choice);
    c.picked = true;
    continueResolution(s);
    return;
  }
  if (pend.what === "demonstrate") {
    const c = r.scratch?.copies;
    if (!c) throw new RulesError("nothing to demonstrate");
    c.opp = Number(choice) as PlayerId; // the opponent who also copies the spell (CR 702.144a)
    log(s, `${p.name} chooses ${player(s, c.opp).name} to also copy ${pend.source} (demonstrate).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "clash") {
    (r.scratch ??= {}).clash = { ...r.scratch?.clash, opp: Number(choice) as PlayerId }; // the opponent to clash with (CR 701.30b)
    log(s, `${p.name} clashes with ${player(s, Number(choice) as PlayerId).name}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "venture") {
    (r.scratch ??= {}).venture = choice; // which dungeon, or which room the arrows lead to (CR 701.49a-b)
    continueResolution(s);
    return;
  }
  if (pend.what === "rollResult") {
    // "Roll two d8 and choose one result": which die is "that result" (see runDiceEffect).
    (r.scratch ??= {}).rollChoice = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "damageWhom") {
    // "That player or a planeswalker that player controls": the one the damage is dealt to (see Effect "damage").
    if (!pend.options.includes(choice)) throw new RulesError("choose the player or one of their planeswalkers");
    (r.scratch ??= {}).damageWhom = choice;
    log(s, `${p.name} chooses ${pend.labels?.[pend.options.indexOf(choice)] ?? choice} for ${pend.source}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "damageSource") {
    // The source of damage a prevention or redirection effect is about, chosen as it resolves (CR 609.7a).
    (r.scratch ??= {}).damageSource = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "nthPlayer") {
    // Gluntch: one more player chosen (see Effect "choosePlayer").
    if (!pend.options.includes(choice)) throw new RulesError("choose one of the players offered");
    r.chosen = { ...r.chosen, players: [...(r.chosen?.players ?? []), Number(choice) as PlayerId] };
    log(s, `${p.name} chooses ${player(s, Number(choice)).name} ${pend.prompt ?? `for ${pend.source}`}.`);
    continueResolution(s);
    return;
  }
  if (pend.what === "word") {
    // "Each opponent chooses fame or fortune" (see runVotesEffect's eachChooses).
    const st = r.scratch?.words;
    if (!st || !pend.options.includes(choice)) throw new RulesError(`choose ${pend.options.join(" or ")}`);
    st.pick = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "vote") {
    // A vote (CR 701.38a), or "none" to pass on an extra vote that's optional (see runVotesEffect).
    const v = r.scratch?.vote;
    if (!v) throw new RulesError("nothing to vote on");
    v.pick = choice;
    continueResolution(s);
    return;
  }
  if (pend.what === "attachWhich") {
    if (!pend.options.includes(choice)) throw new RulesError("choose one of them, or none");
    (r.scratch ??= {}).attachWhich = choice;
    log(s, `${p.name} chooses ${choice === "none" ? "not to attach any of them" : `to attach ${defOf(s, obj(s, choice)).name}`} (${pend.source}).`);
    continueResolution(s);
    return;
  }
  if (pend.what === "enchant") {
    // What an Aura entering without being cast enchants, chosen as it enters (CR 303.4f).
    const sc = (r.scratch ??= {});
    if (sc.auraAsking) (sc.auraHosts ??= {})[sc.auraAsking] = choice;
    sc.auraAsking = undefined;
    continueResolution(s);
    return;
  }
  // "Each player chooses a creature type": one more for "a type chosen this way".
  if (pend.what === "creatureType" && r.scratch?.eachAsked && r.chosen?.types) r.chosen = { ...r.chosen, types: [...r.chosen.types, choice] };
  else if (pend.what === "color" && r.scratch?.eachAsked && r.chosen?.colorsBy) r.chosen = { ...r.chosen, colorsBy: { ...r.chosen.colorsBy, [p.id]: withChoice({}, "color", choice).color! } };
  else r.chosen = withChoice(r.chosen, pend.what, choice);
  log(s, `${p.name} chooses ${pend.what === "opponent" ? player(s, Number(choice)).name : choice}${pend.what === "opponent" ? ` for ${pend.source}` : ""}.`);
  continueResolution(s);
}

/**
 * Devour (CR 702.82a-b): the chosen permanents are sacrificed as it enters, and it enters with N +1/+1 counters
 * for each (Thromok: X for each, where X is how many). What it devoured is remembered for "for each creature it
 * devoured". Then it has entered, and its enters abilities trigger.
 */
function devourChosen(s: GameState, o: GameObject, ids: ObjectId[], enters?: { x?: number }) {
  const d = defOf(s, o);
  const devour = compileCard(d).devour;
  s.leftTogether = undefined; // sacrificed all at once
  let n = 0;
  // Dracoplasm: "the total power of those creatures ... their total toughness", as they last existed (CR 608.2h).
  const totals = { power: 0, toughness: 0 };
  for (const id of ids) {
    const x = s.objects[id];
    if (x?.zone === "battlefield" && devour?.defines === "total") {
      totals.power += power(s, x);
      totals.toughness += toughness(s, x);
    }
  }
  for (const id of ids) {
    const x = s.objects[id];
    if (x?.zone !== "battlefield") continue;
    log(s, `${player(s, controllerOf(s, x)).name} sacrifices ${defOf(s, x).name} ${devour?.defines || devour?.n === 1 ? "as" : "to"} ${d.name}${devour?.defines || devour?.n === 1 ? " enters" : "'s devour"}.`);
    moveObject(s, id, "graveyard", { sacrificed: true });
    n++;
  }
  s.leftTogether = undefined;
  o.devoured = n;
  if (devour?.defines === "total") {
    // Its power and toughness become those totals (layer 7b, CR 613.4b) for as long as it's on the battlefield.
    s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: d.name, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "setPT", power: totals.power, toughness: totals.toughness }] });
    log(s, `${d.name} enters as a ${totals.power}/${totals.toughness}.`);
  }
  if (n && devour && devour.n) {
    invalidateCharacteristics(s);
    const put = putCounters(s, o, "+1/+1", n * (devour.n === "devoured" ? n : devour.n), true);
    log(s, `${d.name} devours ${n} and enters with ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
  }
  invalidateCharacteristics(s);
  if (enters) fireEvent(s, { type: "enters", id: o.id, ...enters });
}

/** The creature types an object has: "all" with changeling (CR 702.73a). On the battlefield, as the layers make it. */
export function creatureTypesOf(s: GameState, o: GameObject): Set<string> | "all" {
  if (o.zone === "battlefield") {
    const c = characteristics(s, o);
    return c.allCreatureTypes ? "all" : new Set(c.subtypes.filter((t) => CREATURE_TYPES.has(t)));
  }
  const d = defOf(s, o);
  return everyCreatureType(d) ? "all" : new Set(d.subtypes.filter((t) => CREATURE_TYPES.has(t)));
}
export const shareCreatureType = (a: Set<string> | "all", b: Set<string> | "all") =>
  a === "all" ? b === "all" || b.size > 0 : b === "all" ? a.size > 0 : [...a].some((t) => b.has(t));

/** Amplify's choice (CR 702.38a): cards in its controller's hand that share a creature type with it. */
export function amplifyOptions(s: GameState, o: GameObject): ObjectId[] {
  const filter = compileCard(defOf(s, o)).amplifyFilter;
  if (filter) return player(s, controllerOf(s, o)).hand.filter((id) => id !== o.id && printedMatches(filter, defOf(s, obj(s, id))));
  const mine = creatureTypesOf(s, o);
  return player(s, controllerOf(s, o)).hand.filter((id) => shareCreatureType(mine, creatureTypesOf(s, obj(s, id))));
}

/** Dragon's Disciple: does its controller control a Dragon (other than it) as it would enter? */
function amplifyOneControls(s: GameState, o: GameObject): boolean {
  const one = compileCard(defOf(s, o)).amplifyOne;
  const you = controllerOf(s, o);
  return !!one && s.battlefield.some((id) => id !== o.id && objectMatches(s, one.orControl, obj(s, id), you, false));
}

/**
 * Amplify N (CR 702.38a): "As this object enters, reveal any number of cards from your hand that share a creature type
 * with it. This permanent enters with N +1/+1 counters on it for each card revealed this way." Then it has entered.
 */
function amplifyChosen(s: GameState, o: GameObject, ids: ObjectId[], enters?: { x?: number }) {
  const d = defOf(s, o);
  const n = compileCard(d).amplify ?? 0;
  const shown = ids.filter((id) => s.objects[id]?.zone === "hand");
  // Dragon's Disciple: one counter if a card was revealed or you control a Dragon (CompiledCard.amplifyOne).
  const one = compileCard(d).amplifyOne;
  if (one && !shown.length && amplifyOneControls(s, o)) {
    const put = putCounters(s, o, "+1/+1", 1, true);
    log(s, `${d.name} enters with ${put} +1/+1 counter${put === 1 ? "" : "s"} (its controller controls ${one.orControl.text.replace(/ you control$/, "")}).`);
  } else if (shown.length && n) {
    const put = putCounters(s, o, "+1/+1", one ? 1 : n * shown.length, true);
    log(s, `${player(s, controllerOf(s, o)).name} reveals ${shown.map((id) => nameOf(s, id)).join(", ")}: ${d.name} enters with ${put} +1/+1 counter${put === 1 ? "" : "s"}${compileCard(d).amplifyFilter ? "" : " (amplify)"}.`);
  }
  invalidateCharacteristics(s);
  if (enters) fireEvent(s, { type: "enters", id: o.id, ...enters });
}

/**
 * A permanent that would have entered goes to its owner's graveyard instead (Mox Diamond, Lake of the Dead): it never
 * entered (rulings), so nothing sees it enter or leave.
 */
function neverEnters(s: GameState, o: GameObject) {
  s.entersChoices = (s.entersChoices ?? []).filter((c) => c.id !== o.id);
  s.battlefield = s.battlefield.filter((x) => x !== o.id);
  o.zone = "stack"; // in no zone list, so moving it isn't leaving the battlefield
  moveObject(s, o.id, "graveyard");
  invalidateCharacteristics(s);
}

/** Lake of the Dead: the permanent chosen is sacrificed, then it enters (CR 614.1a). */
function sacrificedInstead(s: GameState, o: GameObject, id: ObjectId | ObjectId[], enters?: { x?: number }) {
  const ids = typeof id === "string" ? [id] : id;
  log(s, `${player(s, controllerOf(s, o)).name} sacrifices ${ids.map((id) => nameOf(s, id)).join(" and ")}, so ${defOf(s, o).name} enters.`);
  for (const id of ids) if (obj(s, id).zone === "battlefield") moveObject(s, id, "graveyard", { sacrificed: true });
  invalidateCharacteristics(s);
  if (enters) fireEvent(s, { type: "enters", id: o.id, ...enters });
}

/**
 * Ask for the next "as ~ enters, choose ..." choice still to be made. It's made as the permanent
 * enters (CR 614.12), so before state-based actions and before its enters triggers go on the stack.
 */
function askEntersChoice(s: GameState): boolean {
  const q = s.entersChoices;
  while (q?.length) {
    const c = q[0]!;
    const o = s.objects[c.id];
    if (!o || o.zone !== "battlefield" || (o.zoneChanges ?? 0) !== c.zc) {
      q.shift();
      continue;
    }
    if (c.what === "devour") {
      // Devour (CR 702.82a): any number of the other permanents its controller controls that match. It isn't on
      // the battlefield yet as they're chosen, so it can't devour itself.
      const devour = compileCard(defOf(s, o)).devour;
      const you = controllerOf(s, o);
      const options = devour ? s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === you && objectMatches(s, devour.filter, obj(s, id), you, false) && canBeSacrificed(s, obj(s, id))) : [];
      if (!options.length) {
        q.shift();
        devourChosen(s, o, [], c.enters);
        continue;
      }
      // Not devour itself (Wood Elemental, Dracoplasm, Shimatsu): what the sacrifice does, said in the prompt.
      const said = devour!.defines === "count" ? "its power and toughness are how many" : devour!.defines === "total" ? "it gets their total power and toughness" : devour!.n === 1 && devour!.filter.text === "permanent" ? "a +1/+1 counter for each" : undefined;
      s.pending = { kind: "pickPermanents", player: you, source: defOf(s, o).name, action: "sacrifice", what: devour!.filter.text, options, count: options.length, min: 0, objectId: o.id, ...(said ? { prompt: `sacrifice any number of ${devour!.filter.text}s as it enters (${said}): click them, then sacrifice.` } : {}) };
      return true;
    }
    if (c.what === "amplify") {
      // The card itself isn't in the hand, nor is anything entering with it (CR 702.38a).
      const options = amplifyOptions(s, o);
      const one = compileCard(defOf(s, o)).amplifyOne;
      if (!options.length || (one && amplifyOneControls(s, o))) {
        q.shift();
        amplifyChosen(s, o, [], c.enters);
        continue;
      }
      const own = compileCard(defOf(s, o)).amplifyFilter;
      s.pending = { kind: "pickPermanents", player: controllerOf(s, o), source: defOf(s, o).name, action: "reveal", what: own ? own.text : "card that shares a creature type with it", options, count: one ? 1 : options.length, min: 0, objectId: o.id, ...(one ? { prompt: `you may reveal ${/^[AEIOU]/.test(own!.text) ? "an" : "a"} ${own!.text} from your hand (a +1/+1 counter): click it, then reveal.` } : own ? { prompt: `reveal any number of other ${own.text}s from your hand (a +1/+1 counter for each): click them, then reveal.` } : {}) };
      return true;
    }
    if (c.what === "controlOpponent") {
      // "~ enters under the control of an opponent of your choice": the player it would have entered under chooses.
      const you = o.controller;
      const opps = opponents(s, you);
      s.pending = { kind: "chooseOption", player: you, source: defOf(s, o).name, what: "controlOpponent", options: opps.map(String), labels: opps.map((x) => player(s, x).name), objectId: o.id, prompt: "choose an opponent to control it" };
      return true;
    }
    if (c.what === "exchangeText") {
      const ids = textExchangeCandidates(s, o).filter((id) => !c.together?.includes(id));
      const labels = ids.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, controllerOf(s, obj(s, id))).name})`);
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "exchangeText", options: [...ids, "none"], labels: [...labels, "Don't exchange"], objectId: o.id, prompt: "you may exchange its text box with another creature's" };
      return true;
    }
    if (c.what === "copy") {
      // "You may have ~ enter as a copy of ...": any of them, or none (CR 707.5).
      // Not one that entered at the same time (CR 614.12, rulings on Clone).
      const ids = copyCandidates(s, o, compileCard(defOf(s, o)).entersAsCopy!.filter).filter((id) => !c.together?.includes(id));
      const labels = ids.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, controllerOf(s, obj(s, id))).name}${obj(s, id).zone === "graveyard" ? "'s graveyard" : ""})`);
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "copy", options: [...ids, "none"], labels: [...labels, "Don't copy"], objectId: o.id };
      return true;
    }
    if (c.what === "tribute") {
      // "As this creature enters, choose an opponent" (CR 702.104a).
      const opps = opponents(s, controllerOf(s, o));
      if (!opps.length) {
        q.shift();
        if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
        continue;
      }
      const n = compileCard(defOf(s, o)).tribute;
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "tribute", options: opps.map(String), labels: opps.map((x) => player(s, x).name), objectId: o.id, prompt: `tribute ${n}: choose an opponent, who may put ${n} +1/+1 counter${n === 1 ? "" : "s"} on it` };
      return true;
    }
    if (c.what === "player") {
      // "As ~ enters, choose a player" (CR 614.12): one still in the game (CR 800.4a), or an opponent.
      const you = controllerOf(s, o);
      // "Choose two players" (Sower of Discord): two different ones (rulings).
      const options = s.turnOrder.filter((x) => !player(s, x).lost && (c.except !== "you" || x !== you) && !(c.pair && o.chosen?.players?.includes(x)));
      if (!options.length) {
        q.shift();
        continue;
      }
      const pairPrompt = o.chosen?.players?.length ? "choose the second of two players" : "choose two players: the first";
      s.pending = { kind: "chooseOption", player: you, source: defOf(s, o).name, what: "player", options: options.map(String), labels: options.map((x) => (x === you ? `${player(s, x).name} (you)` : player(s, x).name)), objectId: o.id, prompt: c.pair ? pairPrompt : `${c.secret ? "secretly " : ""}choose ${c.except === "you" ? "an opponent" : "a player"}` };
      return true;
    }
    if (c.what === "protector") {
      // As a battle enters, or when it needs a new protector, its controller chooses one (CR 310.9a, 704.5x-y).
      const options = protectorOptions(s, o);
      if (options.length <= 1) {
        q.shift();
        if (options.length) setProtector(s, o, options[0]!);
        continue;
      }
      const siege = isSiege(s, o);
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "protector", options: options.map(String), labels: options.map((x) => player(s, x).name), objectId: o.id, prompt: siege ? "choose an opponent to protect it; you and the others can attack it" : "choose its protector" };
      return true;
    }
    if (c.what === "discardInstead") {
      // Mox Diamond (CR 614.1a): a land card from its controller's hand, or it goes to the graveyard instead.
      const you = controllerOf(s, o);
      const filter = compileCard(defOf(s, o)).entersDiscardInstead!;
      const cards = player(s, you).hand.filter((id) => printedMatches(filter, defOf(s, obj(s, id))));
      s.pending = { kind: "chooseOption", player: you, source: defOf(s, o).name, what: "discardInstead", options: [...cards, "none"], labels: [...cards.map((id) => `Discard ${nameOf(s, id)}`), "Don't (it goes to the graveyard)"], objectId: o.id, prompt: `discard a ${filter.text} for it to enter` };
      return true;
    }
    if (c.what === "sacrificeInstead") {
      // Lake of the Dead (CR 614.1a): a Swamp its controller controls, if they have one to sacrifice; otherwise it goes
      // to the graveyard instead. It isn't on the battlefield yet, so it can't be the one.
      const you = controllerOf(s, o);
      const filter = compileCard(defOf(s, o)).entersSacrificeInstead!;
      const n = compileCard(defOf(s, o)).entersSacrificeInsteadN ?? 1;
      const options = s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === you && objectMatches(s, filter, obj(s, id), you, false) && canBeSacrificed(s, obj(s, id)));
      if (n > 1) {
        // Lotus Vale: "two untapped lands", sacrificed together; with fewer, none is sacrificed and it never enters
        // (rulings).
        if (options.length <= n) {
          q.shift();
          if (options.length === n) sacrificedInstead(s, o, options, c.enters);
          else {
            log(s, `${player(s, you).name} doesn't have ${n} ${filter.text}s to sacrifice, so ${defOf(s, o).name} goes to its owner's graveyard instead.`);
            neverEnters(s, o);
          }
          continue;
        }
        s.pending = { kind: "pickPermanents", player: you, source: defOf(s, o).name, action: "sacrifice", what: filter.text, options, count: n, objectId: o.id, prompt: `sacrifice ${n} ${filter.text}s for it to enter` };
        return true;
      }
      if (options.length <= 1) {
        q.shift();
        if (options.length) sacrificedInstead(s, o, options[0]!, c.enters);
        else {
          log(s, `${player(s, you).name} has no ${filter.text} to sacrifice, so ${defOf(s, o).name} goes to its owner's graveyard instead.`);
          neverEnters(s, o);
        }
        continue;
      }
      s.pending = { kind: "chooseOption", player: you, source: defOf(s, o).name, what: "sacrificeInstead", options, labels: options.map((id) => `Sacrifice ${nameOf(s, id)}`), objectId: o.id, prompt: `sacrifice a ${filter.text} for it to enter` };
      return true;
    }
    if (c.what === "anchor") {
      // "As ~ enters, choose Khans or Dragons" (CR 614.12b).
      const words = compileCard(defOf(s, o)).entersAnchor ?? [];
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "anchor", options: words, objectId: o.id, prompt: `choose ${words.join(" or ")}` };
      return true;
    }
    if (c.what === "readAhead") {
      // "As this Saga enters, choose a number between one and this Saga's final chapter number" (CR 702.155b).
      const last = finalChapter(s, o);
      if (last < 1) {
        q.shift();
        if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
        continue;
      }
      const options = Array.from({ length: last }, (_, i) => String(i + 1));
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "readAhead", options, labels: options.map((n) => `Chapter ${roman(Number(n))}`), objectId: o.id, prompt: "read ahead: choose the chapter to start on; the chapters before it don't trigger" };
      return true;
    }
    if (c.what === "tributePay") {
      const n = compileCard(defOf(s, o)).tribute ?? 0;
      const to = o.tribute?.to;
      // Solemnity: the chosen opponent can't pay tribute (rulings).
      if (to === undefined || player(s, to).lost || countersBanned(s, o, "+1/+1")) {
        if (to !== undefined && !player(s, to).lost) log(s, `${player(s, to).name} can't pay tribute for ${defOf(s, o).name}: counters can't be put on it.`);
        q.shift();
        if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
        continue;
      }
      s.pending = { kind: "chooseOption", player: to, source: defOf(s, o).name, what: "tributePay", options: ["pay", "no"], labels: [`Put ${n} +1/+1 counter${n === 1 ? "" : "s"} on it`, "Don't"], objectId: o.id, prompt: `pay tribute ${n}? If you don't, its "if tribute wasn't paid" ability triggers` };
      return true;
    }
    if (c.what === "cardName") {
      // "As ~ enters, choose a nonland card name" (CR 614.12, 201.4).
      const options = cardNameOptions(s, c.names);
      if (!options.length) {
        q.shift();
        if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
        continue;
      }
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "cardName", options, objectId: o.id, prompt: `choose ${c.names ? `a ${c.names.text} name` : "a card name"}`, purpose: c.purpose ?? "deny" };
      return true;
    }
    if (c.what === "form") {
      // "As ~ enters, it becomes your choice of ..." (CR 614.12): its controller picks one of them.
      const forms = compileCard(defOf(s, o)).entersForms ?? [];
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "form", options: forms.map((_, i) => String(i)), labels: forms.map((f) => f.text.charAt(0).toUpperCase() + f.text.slice(1)), objectId: o.id, prompt: `choose what ${defOf(s, o).name} becomes as it enters` };
      return true;
    }
    if (c.what === "counterChoice") {
      const counters = compileCard(defOf(s, o)).entersCounterChoice?.counters ?? [];
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "counterChoice", options: [...counters], labels: counters.map((k) => `A ${k} counter`), objectId: o.id, prompt: `enter with your choice of ${counters.length > 2 ? `a ${counters.slice(0, -1).join(", ")}, or ${counters.at(-1)} counter` : counters.map((k) => `a ${k} counter`).join(" or ")}` };
      return true;
    }
    if (c.what === "lifeAsEnters") {
      // "Pay any amount of life" (CR 119.4): no more than its controller's life (none with a "can't lose life" effect),
      // nor than Nameless Race's cap, counted now.
      const you = controllerOf(s, o);
      const cap = compileCard(defOf(s, o)).entersPayLife?.max;
      const max = Math.max(0, Math.min(payableLife(s, you), cap === undefined ? Infinity : evalAmount(s, cap, { controller: you, sourceId: o.id })));
      if (!max) {
        q.shift();
        o.lifePaidAsEntered = 0;
        log(s, `${player(s, you).name} pays no life as ${defOf(s, o).name} enters.`);
        if (c.enters) fireEvent(s, { type: "enters", id: o.id, ...c.enters });
        continue;
      }
      s.pending = { kind: "chooseOption", player: you, source: defOf(s, o).name, what: "lifeAsEnters", options: ["0"], numberRange: { min: 0, max }, objectId: o.id, prompt: `pay any amount of life as it enters (up to ${max})` };
      return true;
    }
    if (c.what === "number") {
      const r = c.range ?? { min: 0, max: 999 };
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "number", options: [String(r.min)], numberRange: r, objectId: o.id, prompt: r.max === 999 ? "choose a number" : `choose a number between ${r.min} and ${r.max}` };
      return true;
    }
    s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: c.what, options: c.options ?? choiceOptions(c.what, c.except), objectId: o.id, ...(c.what === "cardType" ? { prompt: "choose a card type" } : {}) };
    return true;
  }
  return false;
}

/** "You may ...": the resolving spell or ability's controller says whether to do it. */
function chooseMay(s: GameState, p: Player, yes: boolean) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind === "castFree" && pend.player === p.id && r && !yes) {
    // Declining cascade's free cast; casting it is a castSpell action instead.
    log(s, `${p.name} chooses not to cast ${nameOf(s, pend.objectId)}.`);
    s.pending = null;
    continueResolution(s);
    return;
  }
  if (pend?.kind === "chooseMay" && pend.player === p.id && pend.blockTax) {
    const bt = pend.blockTax;
    const chooser = player(s, bt.chooser);
    if (!yes) {
      // Odric: "If that player decides to not pay that cost, you must propose a new set of blocking creatures" (rulings).
      log(s, `${p.name} doesn't pay for those blocks; ${chooser.name} chooses again.`);
      s.pending = chooser.lost ? { kind: "declareBlockers", player: p.id, remaining: bt.remaining } : { kind: "declareBlockers", player: chooser.id, remaining: bt.remaining, defender: p.id };
      return;
    }
    const paid = spendFromPool(s, p.id, parseManaCost(pend.pay!.mana!), "other", 0, payableLife(s, p.id));
    if (!paid) throw new RulesError(`blocking costs ${pend.pay!.mana}: add the mana first`);
    log(s, `${p.name} pays ${pend.pay!.mana} to block.`);
    blocksDeclared(s, chooser, p, bt.blocks, bt.remaining);
    return;
  }
  if (pend?.kind !== "chooseMay" || pend.player !== p.id || !r) throw new RulesError("nothing to decide");
  if (yes && pend.pay) {
    // "You may pay {2}. If you do, ...": paid now, from the mana pool (mana abilities first, CR 605.3a).
    const { mana, life = 0, energy = 0 } = pend.pay;
    if (life && payableLife(s, p.id) < life) throw new RulesError(`you can't pay ${life} life`); // CR 119.4, 119.8
    if ((p.energy ?? 0) < energy) throw new RulesError(`you don't have ${energy} energy`);
    const paid = mana ? spendFromPool(s, p.id, parseManaCost(mana), "other", 0, payableLife(s, p.id) - life) : null;
    if (mana && !paid) throw new RulesError(`not enough mana in your pool to pay ${mana}`);
    loseLife(s, p.id, (paid?.lifePaid ?? 0) + life);
    loseEnergy(s, p.id, energy);
    log(s, `${p.name} pays ${describePay(pend.pay)} for ${pend.source}.`);
  }
  if (pend.clash) {
    (r.scratch ??= {}).clash = { ...r.scratch?.clash, answer: yes };
    s.pending = null;
    continueResolution(s);
    return;
  }
  if (pend.eachTarget) {
    (r.scratch ??= {}).mayAnswer = yes;
    if (!yes) log(s, `${p.name} chooses not to ${pend.prompt.replace(/\.$/, "")}.`);
    s.pending = null;
    continueResolution(s);
    return;
  }
  (r.scratch ??= {}).may = yes;
  // The prompt speaks to the player ("discard your hand"); the log is about them.
  if (!yes) log(s, `${p.name} chooses not to ${pend.prompt.replace(/\.$/, "").replace(/ or lose the game$/, "").replace(/\byour\b/g, "their")}.`);
  s.pending = null;
  continueResolution(s);
}

/** "You may collect evidence N" as it resolves: the cards to exile, or none for "no" (CR 701.59a). */
function chooseEvidence(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "collectEvidence" || pend.player !== p.id || !r) throw new RulesError("nothing to collect evidence for");
  if (ids.length) {
    const problem = evidenceProblem(s, p.id, pend.n, ids, pend.not);
    if (problem) throw new RulesError(problem);
  } else log(s, `${p.name} chooses not to collect evidence.`);
  (r.scratch ??= {}).may = ids.length > 0;
  if (ids.length) r.scratch.evidence = ids;
  s.pending = null;
  continueResolution(s);
}

/** "Counter it unless its controller pays": pay from the mana pool, or don't (CR 702.21a, 118.12). */
function payUnless(s: GameState, p: Player, pay: boolean, tap?: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "payUnless" || pend.player !== p.id || !r) throw new RulesError("nothing to pay for");
  // Waterbend (CR 701.67a): each untapped artifact or creature they control pays {1} of its generic mana, no more than
  // the waterbend cost's own, each one once.
  let due = { cost: parseManaCost(pend.cost), extra: 0 };
  if (pay && tap?.length) {
    const cap = pend.waterbend ?? 0;
    if (tap.length > cap) throw new RulesError(cap ? `no more than ${cap} artifact${cap === 1 ? "" : "s"} or creature${cap === 1 ? "" : "s"} can be tapped to waterbend` : "this cost can't be paid by tapping");
    if (new Set(tap).size !== tap.length) throw new RulesError("each artifact or creature can only be tapped once to waterbend");
    for (const id of tap) {
      const c = s.objects[id];
      if (!c || c.zone !== "battlefield" || controllerOf(s, c) !== p.id || !(objIsType(s, c, "Artifact") || objIsType(s, c, "Creature"))) throw new RulesError("only artifacts and creatures you control can be tapped to waterbend");
      if (c.tapped) throw new RulesError(`${nameOf(s, id)} is already tapped`);
    }
    due = payGenericWith(due.cost, 0, tap.length) ?? due;
  }
  if (pay) {
    const life = pend.life ?? 0;
    // You can pay life only if your life total is at least that much (CR 119.4).
    if (life && payableLife(s, p.id) < life) throw new RulesError(`you can't pay ${life} life`); // CR 119.8
    const sacrificeOptions = pend.sacrifice ? pickOptions(s, pend.sacrifice, p.id) : [];
    if (pend.sacrifice && sacrificeOptions.length < pend.sacrifice.n) throw new RulesError(`you don't control enough of ${pend.sacrifice.filter.text} to sacrifice`); // CR 118.3
    const paid = spendFromPool(s, p.id, due.cost, "other", due.extra, payableLife(s, p.id) - life);
    if (!paid) throw new RulesError(`not enough mana in your pool to pay ${pend.cost}`);
    if (tap?.length) {
      for (const id of tap) tapPermanent(s, obj(s, id));
      log(s, `${p.name} taps ${tap.map((id) => nameOf(s, id)).join(", ")} to waterbend.`);
    }
    loseLife(s, p.id, paid.lifePaid + life);
    log(s, `${p.name} pays ${pend.cost}${life ? ` and ${life} life` : ""} for ${pend.source}.`);
    if (pend.poison) {
      // "Ward—Get five poison counters": getting them is the payment (CR 118.3); ten or more loses as a state-based
      // action (CR 704.5c).
      const n = putPlayerCounters(s, p.id, "poison", pend.poison);
      log(s, `${p.name} gets ${n} poison counter${n === 1 ? "" : "s"} for ${pend.source}.`);
    }
    if (pend.discardRandom) {
      // "Ward—Discard a card at random" (CR 701.9c): the cards are chosen at random now and discarded as the counter
      // effect carries on (see paidUnless).
      if (p.hand.length < pend.discardRandom) throw new RulesError(`you don't have ${pend.discardRandom} card${pend.discardRandom === 1 ? "" : "s"} to discard`);
      const pool = [...p.hand];
      const chosen: ObjectId[] = [];
      for (let k = 0; k < pend.discardRandom; k++) chosen.push(pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0]!);
      r.scratch = { ...r.scratch, queue: [p.id], chosen: { [p.id]: chosen } };
      s.pending = null;
      continueResolution(s);
      return;
    }
    if (pend.sacrifice) {
      // Then which permanents to sacrifice, sacrificed as the counter effect carries on (see paidUnless).
      const options = sacrificeOptions;
      r.scratch = { ...r.scratch, queue: [p.id], chosen: {} };
      if (options.length > pend.sacrifice.n) {
        s.pending = { kind: "pickPermanents", player: p.id, source: pend.source, action: "sacrifice", what: pend.sacrifice.filter.text, options, count: pend.sacrifice.n };
        return;
      }
      r.scratch.chosen![p.id] = options;
      s.pending = null;
      continueResolution(s);
      return;
    }
    if (pend.exileGraveyard) {
      // Grip of Amnesia: every card in their graveyard, exiled as the counter effect carries on (see paidUnless); an empty
      // graveyard can be "exiled" too (rulings).
      r.scratch = { ...r.scratch, queue: [p.id], chosen: { [p.id]: [...p.graveyard] } };
      s.pending = null;
      continueResolution(s);
      return;
    }
    if (pend.discardHand) {
      // The whole hand, discarded as the counter effect carries on (see paidUnless); an empty hand can be "discarded" too
      // (rulings on Perplex).
      r.scratch = { ...r.scratch, queue: [p.id], chosen: { [p.id]: [...p.hand] } };
      s.pending = null;
      continueResolution(s);
      return;
    }
    if (pend.discard) {
      // Then which cards to discard; the cards are discarded as the counter effect carries on (see counterOnStack).
      if (p.hand.length < pend.discard) throw new RulesError(`you don't have ${pend.discard} card${pend.discard === 1 ? "" : "s"} to discard`);
      r.scratch = { ...r.scratch, queue: [p.id], chosen: {} };
      if (p.hand.length > pend.discard) {
        s.pending = { kind: "discard", player: p.id, count: pend.discard, source: pend.source };
        return;
      }
      r.scratch.chosen![p.id] = [...p.hand];
      s.pending = null;
      continueResolution(s);
      return;
    }
  }
  (r.scratch ??= {}).paid = pay;
  s.pending = null;
  continueResolution(s);
}

function discardToHandSize(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  if (pend?.kind !== "discardToHandSize" || pend.player !== p.id) throw new RulesError("no discard pending");
  if (new Set(ids).size !== pend.count || ids.some((id) => !p.hand.includes(id)))
    throw new RulesError(`choose exactly ${pend.count} card(s) from your hand`);
  discardCards(s, p.id, ids);
  s.pending = null;
  finishCleanup(s);
}

// ---------------------------------------------------------------------------
// Combat (CR 506-511)

const creaturesOf = (s: GameState, pid: PlayerId) =>
  s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === pid && objIsType(s, o, "Creature"));

/**
 * Ensnaring Bridge: a creature with power greater than the number of cards in the hand of a Bridge's controller can't
 * attack, checked only as attackers are declared (rulings; CR 508.1c).
 */
function bridged(s: GameState, o: GameObject): boolean {
  return s.battlefield.some((id) => abilitiesOf(s, obj(s, id)).attackPowerCapHand && power(s, o) > player(s, controllerOf(s, obj(s, id))).hand.length);
}

/** Angelic Arbiter: `pid` cast a spell this turn and an opponent of theirs controls an Arbiter, so they can't attack (rulings). */
export function arbiterStopsAttacks(s: GameState, pid: PlayerId): string | null {
  if (!(s.castThisTurn ?? []).some((c) => c.player === pid)) return null;
  const o = s.battlefield.map((id) => obj(s, id)).find((x) => abilitiesOf(s, x).opponentsWhoCastCantAttack && controllerOf(s, x) !== pid);
  return o ? `${characteristics(s, o).name}: opponents who cast a spell this turn can't attack with creatures` : null;
}

export function potentialAttackers(s: GameState, pid: PlayerId) {
  const opps = opponents(s, pid);
  if (arbiterStopsAttacks(s, pid)) return [];
  return creaturesOf(s, pid).filter(
    (o) =>
      !o.tapped &&
      (!isSummoningSick(s, o) || characteristics(s, o).attackAsThoughHaste) && // CR 302.6
      !objIsType(s, o, "Battle") && // a battle can't attack, even one that's also a creature (rulings)
      (!objHasKeyword(s, o, "Defender") || characteristics(s, o).attackDespiteDefender || (characteristics(s, o).attackDespiteDefenderVs && opps.some((d) => attackedYouLastTurn(s, d, pid)))) &&
      !characteristics(s, o).cantAttack &&
      !bridged(s, o) &&
      !(s.cantAttackThisTurn ?? []).some((r) => objectMatches(s, r.filter, o, r.controller, false) && !(r.except && r.except.id === o.id && r.except.zc === (o.zoneChanges ?? 0))) &&
      // "Only land creatures can attack during that combat phase" (Bumi, Unleashed): an added combat phase's own rule.
      !(s.thatCombat !== undefined && s.combatAttackOnly?.[s.thatCombat] && !objectMatches(s, s.combatAttackOnly[s.thatCombat]!, o, pid, false)) &&
      (!(characteristics(s, o).attackUnless.length || characteristics(s, o).attackUnlessYard || characteristics(s, o).attackIfNot?.length || characteristics(s, o).attackUnlessMore?.length || characteristics(s, o).cantAttackPlayers.length || characteristics(s, o).cantAttackPlayersOnly.length || characteristics(s, o).cantAttackOwner) || opps.some((d) => !attackProblem(s, o, d))),
  );
}

/**
 * Why `o` can't attack `defender` in particular, or null: "can't attack unless defending player controls
 * an Island" (CR 508.1c). Each attacking creature has its own defending player (CR 506.2).
 */
/**
 * What attacking `defender` costs for each creature (Ghostly Prison, Propaganda): generic mana, paid as attackers are
 * declared (CR 508.1g-h). Attacking their planeswalkers isn't attacking them, except for "you or planeswalkers you
 * control" (Sphere of Safety); a battle they protect never is.
 */
export function attackTaxPer(s: GameState, defender: PlayerId, planeswalker = false, attacker?: ObjectId): number {
  const { generic, mana } = attackTaxParts(s, defender, planeswalker, attacker);
  return generic + mana.length;
}

/**
 * The generic mana and the other symbols ({W/P}, Norn's Annex) attacking `defender` costs for each creature; with the
 * `attacker`, what it costs for that one ("each creature with one or more counters on it", Nils).
 */
function attackTaxParts(s: GameState, defender: PlayerId, planeswalker: boolean, attacker?: ObjectId): { generic: number; mana: string[] } {
  let generic = 0;
  const mana: string[] = [];
  const counters = attacker !== undefined && s.objects[attacker] ? Object.values(obj(s, attacker).counters).reduce((a, b) => a + Math.max(0, b ?? 0), 0) : 0;
  for (const id of s.battlefield) {
    const c = characteristics(s, obj(s, id));
    if (c.controller !== defender) continue;
    generic += planeswalker ? c.attackTaxPlaneswalkers : c.attackTax;
    generic += counters * (planeswalker ? c.attackTaxCountersPlaneswalkers : c.attackTaxCounters);
    mana.push(...(planeswalker ? c.attackTaxManaPlaneswalkers : c.attackTaxMana));
  }
  // "Until your next turn, creatures can't attack you unless ..." (Summon: Yojimbo): the defender's own effects.
  for (const t of s.players[defender]?.attackTaxUntil ?? []) if (!planeswalker || t.planeswalkers) generic += t.n;
  return { generic: generic + ownAttackTax(s, attacker), mana };
}

/** Brainwash, Phyrexian Marauder: what attacking with this creature costs, whatever it attacks. */
function ownAttackTax(s: GameState, attacker?: ObjectId): number {
  const o = attacker !== undefined ? s.objects[attacker] : undefined;
  return o?.zone === "battlefield" ? characteristics(s, o).ownAttackTax : 0;
}

/** What one attack costs: at a player, or at a planeswalker or battle (`planeswalker`, the permanent attacked). */
export function attackTaxOf(s: GameState, a: { attacker?: ObjectId; defender: PlayerId; planeswalker?: ObjectId }): number {
  if (a.planeswalker === undefined) return attackTaxPer(s, a.defender, false, a.attacker);
  const pw = s.objects[a.planeswalker];
  return pw && objIsType(s, pw, "Planeswalker") && controllerOf(s, pw) === a.defender ? attackTaxPer(s, a.defender, true, a.attacker) : ownAttackTax(s, a.attacker);
}

/**
 * What blocking with `n` creatures costs, "{2}" ("" when blocking is free): Archangel of Tithes (CR 509.1d), and what
 * blocking with each of `blockers` costs itself (Qal Sisma Behemoth, Cowed by Wisdom, CR 509.1d-e).
 */
export function blockCost(s: GameState, n: number, blockers: ObjectId[] = []): string {
  const per = s.battlefield.reduce((t, id) => t + characteristics(s, obj(s, id)).blockTax, 0);
  const own = blockers.reduce((t, id) => t + (s.objects[id]?.zone === "battlefield" ? characteristics(s, obj(s, id)).ownBlockTax : 0), 0);
  const total = (n ? per * n : 0) + own;
  return total ? `{${total}}` : "";
}

/** Could blocking cost `pid` mana now: every block (Archangel of Tithes), or one of their creatures' own (Qal Sisma Behemoth)? */
export function blocksMayCost(s: GameState, pid: PlayerId): boolean {
  return !!blockCost(s, 1) || creaturesOf(s, pid).some((o) => characteristics(s, o).ownBlockTax > 0);
}

/** The total attack tax for a declaration: how many mana symbols (generic mana, and {W/P} each for Norn's Annex). */
export function attackTax(s: GameState, attacks: { attacker?: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]): number {
  return attacks.reduce((n, a) => n + attackTaxOf(s, a), 0);
}

/** The total attack cost of a declaration as a mana cost, "{4}{W/P}{W/P}" ("" when attacking is free). */
export function attackCost(s: GameState, attacks: { attacker?: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]): string {
  let generic = 0;
  const mana: string[] = [];
  for (const a of attacks) {
    if (!attackTaxOf(s, a)) continue;
    // Attacking a battle: only the attacker's own tax (attackTaxOf).
    const pw = a.planeswalker !== undefined ? s.objects[a.planeswalker] : undefined;
    if (pw && !(objIsType(s, pw, "Planeswalker") && controllerOf(s, pw) === a.defender)) {
      generic += ownAttackTax(s, a.attacker);
      continue;
    }
    const parts = attackTaxParts(s, a.defender, a.planeswalker !== undefined, a.attacker);
    generic += parts.generic;
    mana.push(...parts.mana);
  }
  return `${generic ? `{${generic}}` : ""}${mana.join("")}`;
}

/** The permanents of `pid`'s that could pay a cost to attack that isn't mana (Exalted Dragon's "sacrifice a land"). */
export function attackCostOptions(s: GameState, pid: PlayerId, cost: { filter: TargetSpec }): ObjectId[] {
  return s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && objectMatches(s, cost.filter, obj(s, id), pid, false));
}

/**
 * Can `pid` pay all these costs to attack at once (CR 508.1i): each permanent needed a different one of theirs that fits,
 * none of `taken`? A matching of the permanents needed to the permanents there, by augmenting paths.
 */
export function attackCostsPayable(s: GameState, pid: PlayerId, costs: { filter: TargetSpec; n: number }[], taken: ObjectId[] = []): boolean {
  const slots = costs.flatMap((c) => {
    const options = attackCostOptions(s, pid, c).filter((id) => !taken.includes(id));
    return Array.from({ length: c.n }, () => options);
  });
  const by = new Map<ObjectId, number>();
  const place = (k: number, seen: Set<ObjectId>): boolean => {
    for (const id of slots[k]!) {
      if (seen.has(id)) continue;
      seen.add(id);
      const other = by.get(id);
      if (other === undefined || place(other, seen)) {
        by.set(id, k);
        return true;
      }
    }
    return false;
  };
  return slots.every((_, k) => place(k, new Set()));
}

/** "Sacrifice a land", "return an enchantment you control to its owner's hand": a cost to attack, said. */
export function describeAttackCost(c: { action: "sacrifice" | "bounce"; filter: TargetSpec; n: number }): string {
  const what = c.n === 1 ? `${/^[aeiou]/i.test(c.filter.text) ? "an" : "a"} ${c.filter.text}` : `${c.n} ${c.filter.text}s`;
  return c.action === "sacrifice" ? `sacrifice ${what}` : `return ${what} you control to ${c.n === 1 ? "its owner's hand" : "their owners' hands"}`;
}

export function attackProblem(s: GameState, o: GameObject, defender: PlayerId, planeswalker = false, /** The planeswalker or battle attacked. */ attacked?: ObjectId): string | null {
  const c = characteristics(s, o);
  // Exalted Dragon: only if the cost can be paid (CR 508.1d, 508.1i).
  if (c.ownAttackCosts.length && !attackCostsPayable(s, c.controller, c.ownAttackCosts)) return `${c.name} can't attack unless you ${c.ownAttackCosts.map(describeAttackCost).join(" and ")}`;
  // Weathered Sentinels: defender stops it attacking anyone but those players themselves (CR 702.3b).
  if (c.attackDespiteDefenderVs && !c.attackDespiteDefender && objHasKeyword(s, o, "Defender") && (planeswalker || attacked !== undefined || !attackedYouLastTurn(s, defender, c.controller))) return `${c.name} has defender`;
  // "Can't attack you or planeswalkers you control": that player, and their planeswalkers (a battle they protect isn't one).
  const atBattle = !!attacked && !!s.objects[attacked] && objIsType(s, obj(s, attacked), "Battle") && !objIsType(s, obj(s, attacked), "Planeswalker");
  // The Second Doctor: during the attacker's next turn, not the player or a permanent they control.
  const hit = attacked !== undefined && s.objects[attacked] ? controllerOf(s, obj(s, attacked)) : defender;
  if (player(s, c.controller).attackBansNextTurn?.some((b) => b.turn === s.turn && b.player === hit)) return `${c.name} can't attack ${player(s, hit).name}${attacked !== undefined || planeswalker ? "'s permanents" : ""} this turn`;
  // Chronomantic Escape: that player, not their planeswalkers or battles.
  if (player(s, defender).unattackableUntil && !planeswalker && attacked === undefined) return `${c.name} can't attack ${player(s, defender).name} until their next turn`;
  if (player(s, defender).attackBansUntil?.includes(c.controller) && !atBattle) return `${c.name} can't attack ${player(s, defender).name}${planeswalker ? "'s planeswalkers" : ""} until their next turn`;
  if (c.cantAttackPlayers.includes(defender) && !atBattle) return `${c.name} can't attack ${player(s, defender).name}${planeswalker ? "'s planeswalkers" : ""}`;
  if (c.cantAttackPlayersOnly.includes(defender) && !planeswalker && attacked === undefined) return `${c.name} can't attack ${player(s, defender).name}`;
  // Alexios: its owner, but not their planeswalkers or the battles they protect (rulings).
  if (c.cantAttackOwner && !planeswalker && attacked === undefined && defender === o.owner) return `${c.name} can't attack its owner`;
  // Xantcha: nor its owner's planeswalkers (a battle its owner protects isn't one).
  if (c.cantAttackOwnerWalkers && planeswalker && !atBattle && defender === o.owner) return `${c.name} can't attack planeswalkers its owner controls`;
  if (c.cantAttackSamePlayer && !planeswalker && o.attacked?.turn === s.turn && o.attacked.players?.includes(defender)) return `${c.name} can't attack a player it has already attacked this turn`;
  for (const f of c.attackUnless)
    if (!s.battlefield.some((id) => controllerOf(s, obj(s, id)) === defender && objectMatches(s, f, obj(s, id), c.controller, false)))
      return `${c.name} can't attack unless defending player controls ${f.text}`;
  if (c.attackUnlessYard && player(s, defender).graveyard.length < c.attackUnlessYard) return `${c.name} can't attack unless defending player has ${c.attackUnlessYard} or more cards in their graveyard`; // CR 508.1c
  for (const f of c.attackIfNot ?? [])
    if (s.battlefield.some((id) => controllerOf(s, obj(s, id)) === defender && objectMatches(s, f, obj(s, id), c.controller, false)))
      return `${c.name} can't attack while defending player controls ${f.text}`;
  for (const what of c.attackUnlessMore ?? []) {
    const count = (p: PlayerId) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === p && objIsType(s, obj(s, id), what === "lands" ? "Land" : "Creature")).length;
    if (count(c.controller) <= count(defender)) return `${c.name} can't attack unless you control more ${what} than defending player`;
  }
  return null;
}
/**
 * "Can't attack unless a black or green creature also attacks" (Scarred Puma): why this attacker can't attack with these
 * others (another creature in the declaration that fits, as it is now, CR 508.1c), or null.
 */
export function withoutCompany(s: GameState, id: ObjectId, attacks: { attacker: ObjectId }[]): string | null {
  const o = obj(s, id);
  const others = characteristics(s, o).attackWithOthers;
  if (others && new Set(attacks.filter((a) => a.attacker !== id).map((a) => a.attacker)).size < others) return `${nameOf(s, id)} can't attack unless at least ${others} other creatures attack`;
  for (const f of characteristics(s, o).attackOnlyWith ?? [])
    if (!attacks.some((a) => a.attacker !== id && objectMatches(s, f, obj(s, a.attacker), controllerOf(s, o), false))) return `${nameOf(s, id)} can't attack unless ${f.text} also attacks`;
  return null;
}

/**
 * Orcish Conscripts: "can't block unless at least two other creatures block": the creatures blocking this combat, these
 * blocks and those other defending players declared before (`earlier`), not counting it (CR 509.1b).
 */
export function blockWithoutCompany(s: GameState, blocks: { blocker: ObjectId }[], earlier: number): string | null {
  const ids = [...new Set(blocks.map((b) => b.blocker))];
  for (const id of ids) {
    const others = characteristics(s, obj(s, id)).blockWithOthers;
    if (others && earlier + ids.length - 1 < others) return `${nameOf(s, id)} can't block unless at least ${others} other creatures block`;
  }
  return null;
}

/** A player's last turn: their latest one that has begun, or the one before it while it's theirs (the turn number it began). */
export function lastTurnOf(s: GameState, pid: PlayerId): number | undefined {
  const p = player(s, pid);
  return s.activePlayer === pid ? p.lastTurnBegan : p.turnBegan;
}

/** "That attacked during its controller's last turn" (Giant Turtle, Halls of Mist): whoever controls it now (rulings). */
export function attackedDuringLastTurn(s: GameState, o: GameObject, controller: PlayerId): boolean {
  const last = lastTurnOf(s, controller);
  return last !== undefined && !!o.attackedTurns?.includes(last);
}

/** Did `them` attack `you` during their last turn (their latest one that has begun, or the one before it while it's theirs)? */
export function attackedYouLastTurn(s: GameState, them: PlayerId, you: PlayerId): boolean {
  const p = player(s, them);
  const last = s.activePlayer === them ? p.lastTurnBegan : p.turnBegan;
  return last !== undefined && p.attackedInTurn?.turn === last && p.attackedInTurn.players.includes(you);
}
export const attackers = (s: GameState) => s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined);
const attackersAndBlockers = (s: GameState) =>
  s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined || o.blocking !== undefined);
const hasFirstOrDouble = (s: GameState, o: GameObject) =>
  objHasKeyword(s, o, "First strike") || objHasKeyword(s, o, "Double strike");

export function clearCombat(o: GameObject) {
  o.attacking = undefined;
  o.attackingPermanent = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
  o.band = undefined; // CR 702.22f
}

/**
 * The planeswalker or battle an attacking creature attacks, while it's still in combat: on the battlefield as the same
 * object, still a planeswalker controlled by the defending player, or still a battle that player protects, under the
 * same controller (CR 506.4).
 */
export function attackedPlaneswalker(s: GameState, o: GameObject): GameObject | undefined {
  const a = o.attackingPermanent;
  const pw = a && s.objects[a.id];
  if (!pw || pw.zone !== "battlefield" || (pw.zoneChanges ?? 0) !== a.zc) return undefined;
  if (a.battleController !== undefined) return objIsType(s, pw, "Battle") && pw.protector === o.attacking && controllerOf(s, pw) === a.battleController ? pw : undefined;
  return objIsType(s, pw, "Planeswalker") && controllerOf(s, pw) === o.attacking ? pw : undefined;
}

/**
 * Why `pid` can't attack this permanent while `defender` is a defending player, or null: a planeswalker that player
 * controls (CR 506.2, 508.1b), or a battle that player protects (310.9b), but not a battle (CR 506.3).
 */
export function attackablePermanentProblem(s: GameState, pid: PlayerId, defender: PlayerId, id: ObjectId): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "battlefield") return "that permanent isn't on the battlefield";
  if (objIsType(s, o, "Battle")) return o.protector === defender && defender !== pid ? null : "must attack a battle that player protects";
  if (!objIsType(s, o, "Planeswalker") || controllerOf(s, o) !== defender) return "must attack a planeswalker that player controls";
  return characteristics(s, o).cantBeAttacked ? `${characteristics(s, o).name} can't be attacked` : null;
}

/** Where an attacking creature attacks a permanent: which one, and for a battle, its controller now (CR 506.4). */
export function attackingPermanentOf(s: GameState, id: ObjectId): NonNullable<GameObject["attackingPermanent"]> {
  const o = obj(s, id);
  return { id, zc: o.zoneChanges ?? 0, ...(objIsType(s, o, "Battle") ? { battleController: controllerOf(s, o) } : {}) };
}

/** Attacking a player, not a planeswalker: "whenever ~ attacks a player", dethrone, melee (rulings). */
export const attacksAPlayer = (o: GameObject) => o.attacking !== undefined && !o.attackingPermanent;

/** Where an attacking creature's combat damage goes when it isn't blocked (CR 510.1a): nowhere if what it attacked is gone (CR 506.4c). */
function attackedRecipient(s: GameState, at: GameObject): { toPlayer: PlayerId } | { toObject: GameObject } | null {
  if (at.attacking === undefined) return null;
  if (!at.attackingPermanent) return { toPlayer: at.attacking };
  const pw = attackedPlaneswalker(s, at);
  return pw ? { toObject: pw } : null;
}

/** "Jace" or "Ana" for the log: what a creature attacks. */
export function attackedName(s: GameState, o: GameObject): string {
  const pw = o.attackingPermanent && s.objects[o.attackingPermanent.id];
  if (pw && o.attackingPermanent?.battleController !== undefined) return `${characteristics(s, pw).name}${o.attacking !== undefined ? ` (protected by ${player(s, o.attacking).name})` : ""}`;
  return pw ? `${player(s, controllerOf(s, pw)).name}'s ${characteristics(s, pw).name}` : o.attacking !== undefined ? player(s, o.attacking).name : "nothing";
}

/** The most creatures that can attack, or block, each combat (Silent Arbiter): Infinity with no such rule. */
export function combatLimit(s: GameState, what: "attack" | "block"): number {
  let n = Infinity;
  for (const id of s.battlefield) {
    const m = abilitiesOf(s, obj(s, id)).combatLimit?.[what];
    if (m !== undefined) n = Math.min(n, m);
  }
  return n;
}

/** Mirri, Weatherlight Duelist: the most creatures this player can block with this combat; Infinity with no such limit. */
export function playerBlockLimit(s: GameState, pid: PlayerId): number {
  return Math.min(Infinity, ...(s.blockLimits ?? []).filter((l) => l.player === pid).map((l) => l.n));
}

/** Crawlspace: the most creatures that can attack this player (not their planeswalkers) each combat; Infinity with no such rule. */
export function attackYouLimit(s: GameState, defender: PlayerId): number {
  let n = Infinity;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const lim = abilitiesOf(s, o).combatLimit;
    const m = lim?.attackYou ?? (lim?.attackYouIfTapped !== undefined && o.tapped ? lim.attackYouIfTapped : undefined);
    if (m !== undefined && controllerOf(s, o) === defender) n = Math.min(n, m);
  }
  return n;
}

function declareAttackers(s: GameState, p: Player, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) {
  if (s.pending?.kind !== "declareAttackers" || s.pending.player !== p.id) throw new RulesError("not declaring attackers now");
  const legal = new Set(potentialAttackers(s, p.id).map((o) => o.id));
  const opps = opponents(s, p.id);
  const seen = new Set<ObjectId>();
  for (const a of attacks) {
    if (!legal.has(a.attacker) || seen.has(a.attacker)) throw new RulesError(`${nameOf(s, a.attacker)} can't attack`);
    if (!opps.includes(a.defender)) throw new RulesError("must attack a living opponent");
    // A planeswalker a defending player controls can be attacked instead (CR 506.2, 508.1b, 802.3).
    // So can a battle that player protects, its own controller's too (CR 310.9b).
    if (a.planeswalker !== undefined) {
      const why = attackablePermanentProblem(s, p.id, a.defender, a.planeswalker);
      if (why) throw new RulesError(why);
    }
    const why = attackProblem(s, obj(s, a.attacker), a.defender, a.planeswalker !== undefined, a.planeswalker);
    if (why) throw new RulesError(why);
    seen.add(a.attacker);
  }
  // "Can't attack alone": the only creature declared as an attacker attacks alone (CR 506.5).
  if (attacks.length === 1 && characteristics(s, obj(s, attacks[0]!.attacker)).cantAttackAlone) throw new RulesError(`${nameOf(s, attacks[0]!.attacker)} can't attack alone`);
  const lonely = attacks.find((a) => withoutCompany(s, a.attacker, attacks));
  if (lonely) throw new RulesError(withoutCompany(s, lonely.attacker, attacks)!);
  const loner = attacks.length > 1 ? attacks.find((a) => characteristics(s, obj(s, a.attacker)).onlyAttacksAlone) : undefined;
  if (loner) throw new RulesError(`${nameOf(s, loner.attacker)} can only attack alone`);
  // Requirements (CR 508.1d): every creature that "attacks each combat if able" and can attack has to,
  // unless that would break a restriction: one that can't attack alone needn't attack by itself.
  // A requirement that would need a cost paid to obey (Ghostly Prison) doesn't oblige anyone to pay it (CR 508.1d).
  // "No more than two creatures can attack you each combat" (Crawlspace): a restriction too (CR 508.1c); a player whose
  // limit the others already fill can't be attacked by one more.
  const atPlayer = (d: PlayerId, not?: ObjectId) => attacks.filter((a) => a.defender === d && a.planeswalker === undefined && a.attacker !== not).length;
  const youLimits = new Map(opps.map((d) => [d, attackYouLimit(s, d)] as const));
  for (const d of opps) {
    const cap = youLimits.get(d)!;
    if (atPlayer(d) > cap) throw new RulesError(`no more than ${cap === 1 ? "one creature" : `${cap} creatures`} can attack ${player(s, d).name} each combat`);
  }
  // "No more than one creature can attack ~ each combat" (The Eternal Wanderer): a restriction on that permanent (CR 508.1c).
  for (const pw of new Set(attacks.flatMap((a) => (a.planeswalker !== undefined ? [a.planeswalker] : [])))) {
    const cap = s.objects[pw] ? abilitiesOf(s, obj(s, pw)).combatLimit?.attackSelf : undefined;
    if (cap !== undefined && attacks.filter((a) => a.planeswalker === pw).length > cap) throw new RulesError(`no more than ${cap === 1 ? "one creature" : `${cap} creatures`} can attack ${nameOf(s, pw)} each combat`);
  }
  const free = (o: GameObject, d: PlayerId) => !attackProblem(s, o, d) && !attackTaxPer(s, d, false, o.id) && !characteristics(s, o).ownAttackCosts.length && atPlayer(d, o.id) < youLimits.get(d)!;
  // "No more than one creature can attack each combat" (Silent Arbiter): a restriction, which requirements can't break;
  // as many of the creatures that have to attack as the limit allows do (CR 508.1c-d).
  const limit = combatLimit(s, "attack");
  if (attacks.length > limit) throw new RulesError(`no more than ${limit === 1 ? "one creature" : `${limit} creatures`} can attack each combat`);
  const shirking = potentialAttackers(s, p.id).find(
    (o) => characteristics(s, o).attacksIfAble && !seen.has(o.id) && !(characteristics(s, o).cantAttackAlone && attacks.length === 0) && !withoutCompany(s, o.id, [...attacks, { attacker: o.id }]) && opps.some((d) => free(o, d)),
  );
  const required = potentialAttackers(s, p.id).filter((o) => characteristics(s, o).attacksIfAble && opps.some((d) => free(o, d)));
  if (attacks.length >= limit) {
    if (attacks.filter((a) => required.some((o) => o.id === a.attacker)).length < Math.min(limit, required.length)) throw new RulesError(`${defOf(s, shirking!).name} attacks each combat if able`);
  } else if (shirking && opps.length) throw new RulesError(`${defOf(s, shirking).name} attacks each combat if able`);
  // Goaded: it attacks a player other than the ones who goaded it, if it can (CR 701.15b, 508.1d). Each goad is a
  // requirement, and the attack must obey as many as it can: attacking a planeswalker obeys none of them (rulings).
  for (const a of attacks) {
    const o = obj(s, a.attacker);
    const by = characteristics(s, o).goadedBy;
    if (!by.length) continue;
    const obeyed = (d: PlayerId) => by.filter((g) => g !== d).length;
    const best = Math.max(0, ...opps.filter((d) => free(o, d) || d === a.defender).map(obeyed));
    if ((a.planeswalker !== undefined ? 0 : obeyed(a.defender)) < best)
      throw new RulesError(`${defOf(s, o).name} is goaded: it must attack a player other than ${by.map((p) => player(s, p).name).join(" or ")} if able`);
  }
  // "Attacks that opponent this turn if able" (encore): it attacks one of those players, not a planeswalker, if it can
  // (CR 508.1d). One that can't attack them, or only by paying a cost, needn't attack at all (encore rulings).
  for (const o of potentialAttackers(s, p.id)) {
    const able = mustAttackPlayers(s, o).filter((d) => opps.includes(d) && free(o, d));
    if (!able.length) continue;
    const a = attacks.find((x) => x.attacker === o.id);
    if (!a || a.planeswalker !== undefined || !able.includes(a.defender)) throw new RulesError(`${defOf(s, o).name} must attack ${able.map((d) => player(s, d).name).join(" or ")} if able`);
  }
  // Costs to attack that aren't mana (Exalted Dragon): all of them together, a permanent paying only one (CR 508.1i).
  const costs: AttackCostDue[] = attacks.flatMap((a) => characteristics(s, obj(s, a.attacker)).ownAttackCosts.map((c) => ({ id: a.attacker, ...c })));
  if (!attackCostsPayable(s, p.id, costs)) throw new RulesError(`you can't pay all the costs to attack with these creatures: ${costs.map((c) => `${nameOf(s, c.id)} needs you to ${describeAttackCost(c)}`).join("; ")}`);
  // Attack costs are totalled and paid, with mana abilities activated first (CR 508.1g-i).
  // A Phyrexian symbol is paid with its color's mana from the pool, otherwise 2 life (CR 107.4f, 119.4).
  const tax = attackCost(s, attacks);
  if (tax) {
    const paid = spendFromPool(s, p.id, parseManaCost(tax), "other", 0, payableLife(s, p.id));
    if (!paid) throw new RulesError(`attacking these players costs ${tax}: add the mana first`);
    loseLife(s, p.id, paid.lifePaid);
    log(s, `${p.name} pays ${tax}${paid.lifePaid ? ` (${paid.lifePaid} life)` : ""} to attack.`);
  }
  for (const a of attacks) {
    const o = obj(s, a.attacker);
    o.attacking = a.defender;
    if (a.planeswalker !== undefined) o.attackingPermanent = attackingPermanentOf(s, a.planeswalker);
    if (!objHasKeyword(s, o, "Vigilance")) tapPermanent(s, o, true); // CR 508.1f
    const before = o.attacked?.turn === s.turn ? o.attacked : undefined;
    const players = [...(before?.players ?? []), ...(a.planeswalker === undefined ? [a.defender] : [])];
    const battle = before?.battle || (a.planeswalker !== undefined && !!s.objects[a.planeswalker] && objIsType(s, obj(s, a.planeswalker), "Battle"));
    o.declaredInCombat = { turn: s.turn, combat: s.combatsThisTurn ?? 0 };
    o.attacked = { turn: s.turn, n: (before?.n ?? 0) + 1, ...(players.length ? { players } : {}), ...(battle ? { battle: true as const } : {}) };
    if (o.attackedTurns?.at(-1) !== s.turn) o.attackedTurns = [...(o.attackedTurns ?? []), s.turn].slice(-8);
    log(s, `${defOf(s, o).name} attacks ${attackedName(s, o)}.`);
  }
  // Attacking and "each time it has attacked this turn" (Moraug) change what the layers give it.
  if (attacks.length) invalidateCharacteristics(s);
  if (attacks.length) p.attackedTurn = s.turn; // raid
  if (attacks.some((a) => obj(s, a.attacker).isToken)) p.tokenAttackedTurn = s.turn; // Neyali
  const w = p.attackedWith?.turn === s.turn ? p.attackedWith.keys : [];
  const keys = attacks.map((a) => `${a.attacker}@${obj(s, a.attacker).zoneChanges ?? 0}`);
  const kinds = { ...(p.attackedWith?.turn === s.turn ? p.attackedWith.kinds : {}) };
  for (const a of attacks) {
    const c = characteristics(s, obj(s, a.attacker));
    kinds[`${a.attacker}@${obj(s, a.attacker).zoneChanges ?? 0}`] = c.allCreatureTypes ? "all" : c.subtypes.filter((t) => CREATURE_TYPES.has(t));
  }
  if (attacks.length) p.attackedWith = { turn: s.turn, keys: [...new Set([...w, ...keys])], kinds };
  s.attackersThisTurn = (s.attackersThisTurn ?? 0) + attacks.length;
  // Pack tactics: their power as they attack, statics for attacking creatures counted; a power below 0 adds nothing.
  p.attackPower = { turn: s.turn, n: attacks.reduce((n, a) => n + Math.max(0, power(s, obj(s, a.attacker))), 0) };
  // Melee counts the opponents attacked, not their planeswalkers (rulings).
  p.attackedPlayers = { turn: s.turn, players: [...new Set(attacks.filter((a) => a.planeswalker === undefined).map((a) => a.defender))] };
  if (p.attackedPlayers.players.length) p.attackedInTurn = { turn: s.turn, players: [...new Set([...(p.attackedInTurn?.turn === s.turn ? p.attackedInTurn.players : []), ...p.attackedPlayers.players])] };
  s.pending = null;
  if (attacks.length === 0) {
    log(s, `${p.name} declares no attackers.`);
    beginStep(s, "endCombat"); // CR 508.8
    return;
  }
  // Optional costs to attack, like enlist's, are chosen as the attackers are tapped (CR 508.1g; enlist rulings).
  const ids = attacks.map((a) => a.attacker);
  const exert = ids.filter((id) => {
    const e = abilitiesOf(s, obj(s, id)).exert;
    return e === true || (e === "notThisTurn" && obj(s, id).exertedTurn !== s.turn);
  });
  s.declaring = { ids, bands: canBand(s, ids), enlist: ids.filter((id) => objHasKeyword(s, obj(s, id), "Enlist") && abilitiesOf(s, obj(s, id)).enlist), enlisted: [], ...(exert.length ? { exert, exerted: [] } : {}), ...(costs.length ? { costs } : {}) };
  finishAttacks(s);
}

/** Attackers not in a band yet that could form one: one with banding and another attacking the same player (CR 702.22c-d). */
function bandOptions(s: GameState, ids: ObjectId[]): ObjectId[] {
  const free = ids.filter((id) => s.objects[id]?.attacking !== undefined && !obj(s, id).band);
  const bands = (id: ObjectId) => objHasKeyword(s, obj(s, id), "Banding");
  return free.filter((id) => free.some((x) => x !== id && sameAttack(obj(s, x), obj(s, id)) && (bands(id) || bands(x))));
}
const canBand = (s: GameState, ids: ObjectId[]) => bandOptions(s, ids).length > 0;
/** Attacking the same player or the same planeswalker (CR 702.22c). */
const sameAttack = (a: GameObject, b: GameObject) => a.attacking === b.attacking && a.attackingPermanent?.id === b.attackingPermanent?.id;

/** Why these attackers can't be a band (CR 702.22c-d): one or more with banding, up to one without, attacking the same player. */
export function bandProblem(s: GameState, ids: ObjectId[]): string | null {
  const options = bandOptions(s, s.declaring?.ids ?? []);
  if (ids.length < 2) return "a band needs two or more attacking creatures";
  if (ids.some((id) => !options.includes(id))) return "choose attacking creatures that aren't in a band yet";
  if (ids.filter((id) => !objHasKeyword(s, obj(s, id), "Banding")).length > 1) return "a band can have only one creature without banding";
  if (ids.some((id) => !sameAttack(obj(s, id), obj(s, ids[0]!)))) return "all creatures in a band must attack the same player or planeswalker";
  return null;
}

/** The active player puts these attackers in a band, or (none) declares no more bands. */
function bandChosen(s: GameState, ids: ObjectId[]) {
  const d = s.declaring!;
  const why = ids.length ? bandProblem(s, ids) : null;
  if (why) throw new RulesError(why);
  s.pending = null;
  if (!ids.length) d.bands = false;
  else {
    const band = `band${s.nextId++}`;
    for (const id of ids) obj(s, id).band = band;
    log(s, `${ids.map((id) => nameOf(s, id)).join(", ")} attack in a band.`);
    d.bands = canBand(s, d.ids);
  }
  finishAttacks(s);
}

/** Creatures an attacker could enlist (CR 702.154a): untapped, not attacking, able to tap (haste or controlled since the turn began), and not tapped for another enlist ability (rulings). */
export function enlistCandidates(s: GameState, attackerId: ObjectId): ObjectId[] {
  const at = obj(s, attackerId);
  const you = controllerOf(s, at);
  return s.battlefield.filter((id) => {
    const o = obj(s, id);
    return id !== attackerId && controllerOf(s, o) === you && objIsType(s, o, "Creature") && !o.tapped && o.attacking === undefined && !isSummoningSick(s, o);
  });
}

/** Each attacker's enlist choice, then attackers have been declared: "whenever ~ attacks" triggers (CR 508.3a). */
function finishAttacks(s: GameState) {
  const d = s.declaring!;
  // Bands first (CR 508.1e), then optional costs like enlist (508.1g).
  if (d.bands) {
    const options = bandOptions(s, d.ids);
    s.pending = { kind: "pickPermanents", player: s.activePlayer, source: "Banding", action: "band", what: "attacking creatures to band together", options, count: options.length, min: 0 };
    return;
  }
  while (d.enlist.length) {
    const at = d.enlist[0]!;
    const options = enlistCandidates(s, at);
    if (!options.length) {
      d.enlist.shift();
      continue;
    }
    s.pending = { kind: "pickPermanents", player: controllerOf(s, obj(s, at)), source: nameOf(s, at), action: "enlist", what: "creature to enlist", options, count: 1, min: 0, objectId: at };
    return;
  }
  // Costs to attack that aren't mana (Exalted Dragon's "sacrifice a land"): the permanents that pay each, chosen and paid
  // now (CR 508.1i), any that keep the rest payable.
  const cost = d.costs?.[0];
  if (cost) {
    s.pending = { kind: "pickPermanents", player: s.activePlayer, source: nameOf(s, cost.id), action: cost.action, what: cost.filter.text, options: attackCostOptions(s, s.activePlayer, cost), count: cost.n, objectId: cost.id, attackCost: true, prompt: `to attack with it, ${describeAttackCost(cost)}: click ${cost.n === 1 ? "one" : `${cost.n} of them`}.` };
    return;
  }
  // "You may exert ~ as it attacks" (CR 701.43d): one choice for all of them; it's still attacking (rulings).
  const exertable = (d.exert ?? []).filter((id) => s.objects[id]?.attacking !== undefined);
  if (exertable.length) {
    d.exert = [];
    s.pending = { kind: "pickPermanents", player: s.activePlayer, source: "Exert", action: "exert", what: "attacking creatures to exert", options: exertable, count: exertable.length, min: 0 };
    return;
  }
  s.declaring = undefined;
  const attacks = d.ids.filter((id) => s.objects[id]?.attacking !== undefined);
  for (const id of attacks) fireEvent(s, { type: "attacks", id }); // CR 508.3a
  if (attacks.length) fireEvent(s, { type: "groupAttack", controller: s.activePlayer, ids: attacks });
  if (attacks.length === 1) fireEvent(s, { type: "attacksAlone", id: attacks[0]! }); // CR 506.5
  for (const [at, enlisted] of d.enlisted) fireEvent(s, { type: "enlists", id: at, enlisted });
  for (const id of d.exerted ?? []) fireEvent(s, { type: "exerted", id, attacking: true });
}

/** Exalted Dragon's cost to attack, paid with these permanents (CR 508.1i), if the costs still to pay can be paid without them. */
function attackCostPaid(s: GameState, p: Player, ids: ObjectId[]) {
  const d = s.declaring!;
  const [cost, ...rest] = d.costs!;
  if (!attackCostsPayable(s, p.id, rest, ids)) throw new RulesError(`those are needed for the other costs to attack: ${rest.map((c) => `${nameOf(s, c.id)} needs you to ${describeAttackCost(c)}`).join("; ")}`);
  d.costs = rest;
  for (const id of ids) {
    if (cost!.action === "sacrifice") {
      log(s, `${p.name} sacrifices ${nameOf(s, id)} to attack with ${nameOf(s, cost!.id)}.`);
      moveObject(s, id, "graveyard", { sacrificed: true });
    } else {
      log(s, `${p.name} returns ${nameOf(s, id)} to ${obj(s, id).owner === p.id ? "their" : "its owner's"} hand to attack with ${nameOf(s, cost!.id)}.`);
      moveObject(s, id, "hand");
    }
  }
  s.pending = null;
  finishAttacks(s);
}

/** The attackers their controller exerts (CR 701.43a): they don't untap during that player's next untap step. */
function exertChosen(s: GameState, ids: ObjectId[]) {
  const d = s.declaring!;
  for (const id of ids) {
    obj(s, id).skipNextUntap = true;
    obj(s, id).exertedTurn = s.turn;
    (d.exerted ??= []).push(id);
    log(s, `${player(s, s.activePlayer).name} exerts ${nameOf(s, id)}.`);
  }
  s.pending = null;
  finishAttacks(s);
}

/** An attacker enlists the chosen creature (or none): tap it as the cost (CR 702.154a, c). */
function enlistChosen(s: GameState, at: ObjectId, ids: ObjectId[]) {
  const d = s.declaring!;
  d.enlist.shift();
  const c = ids[0];
  if (c) {
    tapPermanent(s, obj(s, c));
    d.enlisted.push([at, c]);
    log(s, `${nameOf(s, at)} enlists ${nameOf(s, c)}.`);
  }
  s.pending = null;
  finishAttacks(s);
}

/**
 * How many attackers a creature may block (CR 509.1a): one, plus each "can block an additional creature"
 * (they add up, rulings), or any number.
 */
/** How many creatures it takes to block this attacker: two with menace (CR 702.111b), three or more with "can't be blocked except by three or more creatures" (509.1b). */
export function blockersNeeded(s: GameState, at: GameObject): number {
  return Math.max(objHasKeyword(s, at, "Menace") ? 2 : 1, characteristics(s, at).minBlockers);
}

export function maxBlocks(s: GameState, o: GameObject): number {
  const c = characteristics(s, o);
  return c.blockAny ? Infinity : 1 + Math.max(0, c.extraBlocks);
}

/**
 * The defending player `defender` declares blockers next (CR 509.1), or, after Odric, Master Tactician's trigger this
 * combat, its controller declares them for that player (GameState.blocksChosenBy).
 */
export function blockersPending(s: GameState, defender: PlayerId, remaining: PlayerId[]): PendingDecision {
  const by = s.blocksChosenBy;
  const chooser = by && by.turn === s.turn && by.combat === (s.combatsThisTurn ?? 0) && by.player !== defender && !player(s, by.player).lost ? by.player : undefined;
  return chooser !== undefined ? { kind: "declareBlockers", player: chooser, remaining, defender } : { kind: "declareBlockers", player: defender, remaining };
}

function declareBlockers(s: GameState, chooser: Player, blocks: { blocker: ObjectId; attacker: ObjectId }[]) {
  const pend = s.pending;
  if (pend?.kind !== "declareBlockers" || pend.player !== chooser.id) throw new RulesError("not declaring blockers now");
  // The defending player, whose creatures block; Odric's controller may be declaring for them.
  const p = player(s, pend.defender ?? chooser.id);
  const seen = new Map<ObjectId, ObjectId[]>();
  const count: Record<ObjectId, number> = {};
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const at = obj(s, b.attacker);
    const bd = defOf(s, bl);
    const ad = defOf(s, at);
    if (controllerOf(s, bl) !== p.id || bl.zone !== "battlefield" || !objIsType(s, bl, "Creature") || bl.tapped)
      throw new RulesError(`${bd.name} can't block`);
    const already = seen.get(bl.id) ?? [];
    if (already.includes(at.id)) throw new RulesError(`${bd.name} already blocks ${ad.name}`);
    const max = maxBlocks(s, bl);
    if (already.length >= max) throw new RulesError(`${bd.name} can only block ${max === 1 ? "one creature" : `${max} creatures`}`);
    if (at.attacking !== p.id) throw new RulesError(`${ad.name} isn't attacking ${p.id === chooser.id ? "you" : p.name}`);
    const problem = blockProblem(s, bl, at);
    if (problem) throw new RulesError(problem);
    seen.set(bl.id, [...already, at.id]);
    count[at.id] = (count[at.id] ?? 0) + 1;
  }
  for (const [atId, n] of Object.entries(count)) {
    const need = blockersNeeded(s, obj(s, atId));
    if (n < need) throw new RulesError(need === 2 && objHasKeyword(s, obj(s, atId), "Menace") ? `${nameOf(s, atId)} has menace` : `${nameOf(s, atId)} can't be blocked except by ${need} or more creatures`); // CR 702.111b, 509.1b
    if (n > 1 && characteristics(s, obj(s, atId)).maxOneBlocker) throw new RulesError(`${nameOf(s, atId)} can't be blocked by more than one creature`); // CR 509.1b
  }
  // "Can't block alone": the only creature declared as a blocker this combat blocks alone (CR 506.5).
  const earlier = s.battlefield.filter((id) => obj(s, id).blocking !== undefined).length;
  if (seen.size === 1 && !earlier && characteristics(s, obj(s, blocks[0]!.blocker)).cantBlockAlone) throw new RulesError(`${nameOf(s, blocks[0]!.blocker)} can't block alone`);
  const unaccompanied = blockWithoutCompany(s, blocks, earlier);
  if (unaccompanied) throw new RulesError(unaccompanied);
  // "No more than one creature can block each combat" (Silent Arbiter), counting every defending player's blockers
  // (CR 509.1b). At the limit, a block that obeys a requirement obeys as many as can be (509.1c).
  const limit = combatLimit(s, "block");
  if (earlier + seen.size > limit) throw new RulesError(`no more than ${limit === 1 ? "one creature" : `${limit} creatures`} can block each combat`);
  // Mirri, Weatherlight Duelist: this player's own blockers this combat (CR 509.1b).
  const mineLimit = playerBlockLimit(s, p.id);
  const mineEarlier = s.battlefield.filter((id) => obj(s, id).blocking !== undefined && controllerOf(s, obj(s, id)) === p.id).length;
  if (mineEarlier + seen.size > mineLimit) throw new RulesError(`${p.name} can't block with more than ${mineLimit === 1 ? "one creature" : `${mineLimit} creatures`} this combat`);
  const obeys = (b: { blocker: ObjectId; attacker: ObjectId }) => {
    const at = characteristics(s, obj(s, b.attacker));
    return at.allMustBlock || at.mustBeBlocked || lureBinds(s, obj(s, b.attacker), obj(s, b.blocker)) || characteristics(s, obj(s, b.blocker)).mustBlock || provokersOf(s, obj(s, b.blocker)).some((x) => x.id === b.attacker);
  };
  // When every block costs mana (Archangel of Tithes), no requirement makes a creature block: nothing obliges paying a
  // cost to block (CR 509.1c).
  const taxed = !!blockCost(s, 1);
  const req = taxed || ((earlier + seen.size >= limit || mineEarlier + seen.size >= mineLimit) && blocks.some(obeys)) ? null : blockRequirementProblem(s, p.id, blocks);
  if (req) throw new RulesError(req);
  // Block costs are totalled and paid, with mana abilities activated first (CR 509.1d-f).
  const tax = blockCost(s, seen.size, [...seen.keys()]);
  // Odric: the blocks' controller chooses whether to pay their cost; if they don't, another set must be proposed (rulings).
  if (tax && p.id !== chooser.id) {
    s.pending = {
      kind: "chooseMay",
      player: p.id,
      prompt: `pay ${tax} for the blocks ${chooser.name} chose (${blocks.map((b) => `${nameOf(s, b.blocker)} blocks ${nameOf(s, b.attacker)}`).join(", ")})`,
      source: "Blocking",
      pay: { mana: tax },
      blockTax: { chooser: chooser.id, blocks, remaining: pend.remaining },
    };
    log(s, `${chooser.name} chooses blocks for ${p.name}, which cost ${tax}.`);
    return;
  }
  if (tax) {
    const paid = spendFromPool(s, p.id, parseManaCost(tax), "other", 0, payableLife(s, p.id));
    if (!paid) throw new RulesError(`blocking with ${seen.size === 1 ? "this creature" : `these ${seen.size} creatures`} costs ${tax}: add the mana first`);
    log(s, `${p.name} pays ${tax} to block.`);
  }
  blocksDeclared(s, chooser, p, blocks, pend.remaining);
}

/** The blocks are declared (and paid for): each blocks, then the next defending player declares (CR 509.1). */
function blocksDeclared(s: GameState, chooser: Player, p: Player, blocks: { blocker: ObjectId; attacker: ObjectId }[], remaining: PlayerId[]) {
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const at = obj(s, b.attacker);
    (bl.blocking ??= []).push(at.id);
    (at.blockedBy ??= []).push(bl.id);
    bl.blockedTurn = s.turn;
    bl.declaredInCombat = { turn: s.turn, combat: s.combatsThisTurn ?? 0 };
    ((s.turnLog ??= {}).blocks ??= []).push({ blocker: `${bl.id}@${bl.zoneChanges ?? 0}`, attacker: `${at.id}@${at.zoneChanges ?? 0}` });
    at.becameBlockedTurn = s.turn;
    log(s, `${defOf(s, bl).name} blocks ${defOf(s, at).name}${p.id !== chooser.id ? ` (${chooser.name} chose)` : ""}.`);
  }
  if (p.id !== chooser.id && !blocks.length) log(s, `${chooser.name} chose no blocks for ${p.name}.`);
  // Blocking one creature in a band blocks every creature in it (CR 702.22h).
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const band = obj(s, b.attacker).band;
    if (!band) continue;
    for (const m of attackers(s)) {
      if (m.band !== band || bl.blocking!.includes(m.id)) continue;
      bl.blocking!.push(m.id);
      (m.blockedBy ??= []).push(bl.id);
      m.becameBlockedTurn = s.turn;
      ((s.turnLog ??= {}).blocks ??= []).push({ blocker: `${bl.id}@${bl.zoneChanges ?? 0}`, attacker: `${m.id}@${m.zoneChanges ?? 0}` });
      log(s, `${defOf(s, bl).name} also blocks ${defOf(s, m).name} (banding).`);
    }
  }
  const [next, ...rest] = remaining;
  s.pending = next !== undefined ? blockersPending(s, next, rest) : null;
  if (!s.pending) {
    // Once every defending player has declared, "blocks" and "becomes blocked" abilities trigger (CR 509.3).
    fireEvent(s, { type: "blocksDeclared" });
    runStateBasedActions(s);
  }
}

/**
 * Whether these blocks obey as many blocking requirements as they can (CR 509.1c): every creature able
 * to block a creature with "all creatures able to block it do so" blocks one such creature, and a creature
 * that "must be blocked if able" is blocked when some creature not already obeying a requirement could
 * block it. Restrictions come first: menace needs two creatures able to block (CR 702.111b).
 */
export function blockRequirementProblem(s: GameState, pid: PlayerId, blocks: { blocker: ObjectId; attacker: ObjectId }[]): string | null {
  const incoming = s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking === pid);
  const demanding = incoming.filter((a) => characteristics(s, a).allMustBlock || characteristics(s, a).mustBeBlocked || !!characteristics(s, a).allMustBlockBy);
  const provoked = creaturesOf(s, pid).filter((o) => provokerOf(s, o) || characteristics(s, o).mustBlock);
  if (!demanding.length && !provoked.length) return null;
  const blocking = new Map<ObjectId, ObjectId[]>();
  for (const b of blocks) blocking.set(b.blocker, [...(blocking.get(b.blocker) ?? []), b.attacker]);
  const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
  // One that has to pay to block (Qal Sisma Behemoth) is never obliged to (CR 509.1c).
  const mine = creaturesOf(s, pid).filter((o) => !o.tapped && !cantBlockNow(s, o) && !characteristics(s, o).ownBlockTax && !(characteristics(s, o).cantBlockAlone && !earlier && blocking.size <= 1 && !blocking.has(o.id)));
  // A creature already blocking as many demanding attackers as it can block obeys all the requirements it can.
  const full = (b: GameObject) => {
    const at = blocking.get(b.id) ?? [];
    return at.length >= maxBlocks(s, b) && at.every((x) => demanding.some((a) => a.id === x) || provokersOf(s, b).some((p) => p.id === x));
  };
  // Provoke (CR 702.39a): the provoked creature blocks the creature that provoked it if able. With menace, that
  // takes another creature able to block it too (CR 702.111b), two more with "except by three or more" (509.1b).
  // Required to block more than one of them, it blocks any one it can (rulings on Fighter Class).
  for (const b of mine) {
    const ats = provokersOf(s, b);
    if (!ats.length || ats.some((at) => (blocking.get(b.id) ?? []).includes(at.id)) || full(b)) continue;
    const at = ats.find((a) => !blockProblem(s, b, a) && mine.filter((o) => o.id !== b.id && !blockProblem(s, o, a)).length >= blockersNeeded(s, a) - 1);
    if (!at) continue;
    return `${characteristics(s, b).name} must block ${characteristics(s, at).name} if able (provoke)`;
  }
  // "Target creature blocks this turn if able": it blocks some attacking creature if one it can block, with another
  // creature beside it against menace (CR 509.1c).
  for (const b of mine) {
    if (!characteristics(s, b).mustBlock || blocking.has(b.id)) continue;
    if (incoming.some((at) => !blockProblem(s, b, at) && mine.filter((o) => o.id !== b.id && !blockProblem(s, o, at)).length >= blockersNeeded(s, at) - 1))
      return `${characteristics(s, b).name} must block this turn if able`;
  }
  for (const at of demanding) {
    const ac = characteristics(s, at);
    const could = mine.filter((b) => !blockProblem(s, b, at));
    if (could.length < blockersNeeded(s, at)) continue;
    if (ac.allMustBlock && !ac.maxOneBlocker) {
      const shirk = could.find((b) => !(blocking.get(b.id) ?? []).includes(at.id) && !full(b));
      if (shirk) return `${characteristics(s, shirk).name} must block ${ac.name} (all creatures able to block it do so)`;
    }
    // "All Walls able to block ~ do so" (Marble Priest): each Wall able to block it does (CR 509.1c), with enough other
    // creatures able to block it beside them against menace.
    if (ac.allMustBlockBy && !ac.allMustBlock && !ac.maxOneBlocker) {
      const shirk = could.find((b) => lureBinds(s, at, b) && !(blocking.get(b.id) ?? []).includes(at.id) && !full(b));
      if (shirk) return `${characteristics(s, shirk).name} must block ${ac.name} (${ac.allMustBlockBy.map((f) => f.text).join(" and ")} able to block it do so)`;
    }
    if (!ac.allMustBlock && !ac.mustBeBlocked) continue;
    const blocked = blocks.some((b) => b.attacker === at.id);
    if (!blocked && could.some((b) => !full(b))) return `${ac.name} must be blocked if able`;
  }
  return null;
}

/** "All Walls able to block ~ do so" (Marble Priest): is this blocker one the attacker's requirement binds (CR 509.1c)? */
export function lureBinds(s: GameState, at: GameObject, b: GameObject): boolean {
  const by = characteristics(s, at).allMustBlockBy;
  return !!by?.some((f) => objectMatches(s, f, b, controllerOf(s, at), false));
}

/** The attacking creature that provoked this one and that it must block, if that's still so (CR 702.39a). */
export function provokerOf(s: GameState, b: GameObject): GameObject | undefined {
  return provokersOf(s, b)[0];
}

/** Every attacking creature this one must block, if able; blocking any one of them obeys the requirement (rulings on Fighter Class). */
export function provokersOf(s: GameState, b: GameObject): GameObject[] {
  const live = (p: { id: ObjectId; zc: number }) => {
    const at = s.objects[p.id];
    return at && at.zone === "battlefield" && (at.zoneChanges ?? 0) === p.zc && at.attacking === controllerOf(s, b) ? [at] : [];
  };
  const first = b.provokedBy && (b.provokedBy.turn === undefined || b.provokedBy.turn === s.turn) ? live(b.provokedBy) : [];
  return [...first, ...(b.provokedAlso ?? []).flatMap(live).filter((at) => !first.includes(at))];
}

/**
 * The landwalk abilities a blocker may ignore (CR 509.1b): "*" for all of them, from its own "can block creatures with
 * landwalk abilities as though they didn't have those abilities" (Street Savvy) or from a permanent that lets creatures
 * with some landwalk "be blocked as though they didn't have" it (Undertow, Staff of the Ages).
 */
function walksIgnored(s: GameState, b: Characteristics): Set<string> {
  const out = new Set<string>(b.blocksLandwalkers ? ["*"] : []);
  for (const id of s.battlefield) for (const w of abilitiesOf(s, s.objects[id]!).walkBlockable ?? []) out.add(w.toLowerCase());
  return out;
}

/**
 * Why `blocker` can't block `attacker` on its own, or null. Covers evasion and blocking
 * restrictions; menace (needs two blockers) is checked over the whole declaration.
 */
/** "Can't be blocked": from its abilities, or from a rule for the turn like Venser, the Sojourner's. */
export function cantBeBlockedNow(s: GameState, o: GameObject): boolean {
  return characteristics(s, o).cantBeBlocked || (s.cantBeBlockedThisTurn ?? []).some((r) => objectMatches(s, r.filter, o, r.controller, false));
}
/** "Can't block": from its abilities, or from a rule for the turn like Falter's. */
export function cantBlockNow(s: GameState, o: GameObject): boolean {
  // Decayed means "This creature can't block" (CR 702.147a).
  if (characteristics(s, o).cantBlock || objHasKeyword(s, o, "Decayed") || (s.cantBlockThisTurn ?? []).some((r) => objectMatches(s, r.filter, o, r.controller, false) && !(r.except && r.except.id === o.id && r.except.zc === (o.zoneChanges ?? 0)))) return true;
  // Void Winnower: an opponent's creature with an even mana value (X is 0, CR 202.3b; a face-down one's is 0).
  const you = controllerOf(s, o);
  return defMv(defOf(s, o)) % 2 === 0 && s.battlefield.some((id) => controllerOf(s, s.objects[id]!) !== you && abilitiesOf(s, s.objects[id]!).opponentsCantBlockEven);
}

export function blockProblem(s: GameState, blocker: GameObject, attacker: GameObject, defender = attacker.attacking): string | null {
  const b = characteristics(s, blocker);
  const a = characteristics(s, attacker);
  const has = (c: typeof a, k: string) => c.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  // A battle can't block, even one that's also a creature (CR 509.1a; rulings).
  if (!b.types.includes("Creature") || b.types.includes("Battle") || blocker.tapped) return `${b.name} can't block`;
  if (cantBlockNow(s, blocker)) return `${b.name} can't block`;
  if (cantBeBlockedNow(s, attacker)) return `${a.name} can't be blocked`;
  if (has(a, "Flying") && !has(b, "Flying") && !has(b, "Reach") && !b.reachVs?.some((t) => a.allCreatureTypes || a.subtypes.includes(t))) return `${b.name} can't block a creature with flying`; // CR 702.9b
  // Aetherflame Wall: "as though they didn't have shadow": the attacker counts as having none as this blocks.
  const aShadow = has(a, "Shadow") && !b.blocksShadowAsNone;
  if (aShadow !== has(b, "Shadow") && !(aShadow && b.blocksShadow)) return aShadow ? `only creatures with shadow can block ${a.name}` : `${b.name} has shadow and can only block creatures with shadow`; // CR 702.28b
  if (has(a, "Fear") && !b.types.includes("Artifact") && !b.colors.includes("B")) return `${a.name} has fear`; // CR 702.36b
  if (has(a, "Intimidate") && !b.types.includes("Artifact") && !b.colors.some((c) => a.colors.includes(c))) return `${a.name} has intimidate`; // CR 702.13b
  if (protectedFrom(a.keywords, withCastThisTurn(s, blocker, b), protectionHolder(s, attacker))) return `${a.name} has protection from ${b.name}`; // CR 702.16f, 702.16k
  if (b.blocksOnlyFlyers && !has(a, "Flying")) return `${b.name} can block only creatures with flying`; // CR 509.1b
  if (has(a, "Horsemanship") && !has(b, "Horsemanship")) return `${a.name} has horsemanship`; // CR 702.31b
  if (has(a, "Skulk") && b.power > a.power) return `${a.name} has skulk`; // CR 702.118b
  if (a.cantBeBlockedByLesserPower && b.power < a.power) return `creatures with power less than ${a.name}'s can't block it`; // CR 509.1b
  for (const id of a.cantBeBlockedByLesserPowerThan) {
    const src = s.objects[id];
    if (src?.zone === "battlefield" && b.power < power(s, src)) return `creatures with power less than ${nameOf(s, id)}'s can't block ${a.name}`; // CR 509.1b
  }
  if (a.cantBeBlockedByGreaterPower && b.power > a.power) return `creatures with power greater than ${a.name}'s can't block it`; // CR 701.54c, 509.1b
  if (b.cantBlockGreaterPower && a.power > b.power) return `${b.name} can't block creatures with greater power`; // CR 509.1b
  if (b.cantBlockPowerAtLeastToughness && a.power >= b.toughness) return `${b.name} can't block creatures with power equal to or greater than its toughness`; // CR 509.1b
  for (const f of a.cantBeBlockedBy) if (objectMatches(s, f, blocker, b.controller, false)) return `${a.name} can't be blocked by ${f.text}`; // CR 509.1b
  for (const only of a.blockableOnlyBy ?? []) if (!only.filters.some((f) => objectMatches(s, f, blocker, b.controller, false))) return `${a.name} can't be blocked except by ${only.text}`; // CR 509.1b
  for (const f of b.cantBlockCreatures) if (objectMatches(s, f, attacker, a.controller, false)) return `${b.name} can't block ${f.text}`; // CR 509.1b
  if (blocker.cantBlockThis?.some((x) => x.turn === s.turn && x.selfZc === (blocker.zoneChanges ?? 0) && x.id === attacker.id && x.zc === (attacker.zoneChanges ?? 0))) return `${b.name} can't block ${a.name} this turn`; // CR 509.1b
  // Landwalk (CR 702.14c): not while the defending player controls such a land, unless it can be blocked as though it
  // didn't have it.
  const walks = defender !== undefined ? a.keywords.flatMap((kw) => (landwalkLand(kw) ? [[kw, landwalkLand(kw)!] as const] : [])) : [];
  const ignored = walks.length ? walksIgnored(s, b) : undefined;
  for (const [kw, land] of walks)
    if (!ignored!.has("*") && !ignored!.has(kw.toLowerCase()) && s.battlefield.some((id) => { const l = obj(s, id); return controllerOf(s, l) === defender && land(characteristics(s, l)); }))
      return `${a.name} has ${kw.toLowerCase()}`; // CR 702.14c
  return null;
}

function dealsDamageThisStep(s: GameState, o: GameObject, firstStrikeStep: boolean) {
  const fs = objHasKeyword(s, o, "First strike");
  const ds = objHasKeyword(s, o, "Double strike");
  return firstStrikeStep ? fs || ds : !fs || ds;
}

/**
 * Blocked creatures that may assign their combat damage as though they weren't blocked, by who decides: their
 * controller, the active player (CR 510.1), or the defending player if a creature with banding blocks it (CR 702.22k).
 */
export function unblockedCandidates(s: GameState): Map<PlayerId, ObjectId[]> {
  const out = new Map<PlayerId, ObjectId[]>();
  const fs = s.step === "firstStrikeDamage";
  for (const at of attackers(s)) {
    if (!at.blockedBy || at.attacking === undefined || !characteristics(s, at).unblockedDamage || !dealsDamageThisStep(s, at, fs) || combatDamageOf(s, at) <= 0) continue;
    const banded = at.blockedBy.some((id) => s.objects[id] && objHasKeyword(s, obj(s, id), "Banding"));
    const who = banded ? at.attacking : controllerOf(s, at);
    out.set(who, [...(out.get(who) ?? []), at.id]);
  }
  return out;
}

/** Ask the next player who decides whether blocked creatures assign combat damage as though unblocked; true if asked. */
function askUnblocked(s: GameState): boolean {
  let c = s.unblockedChoice;
  if (!c || c.turn !== s.turn || c.step !== s.step) c = s.unblockedChoice = { turn: s.turn, step: s.step, asked: [], ids: [] };
  const cands = unblockedCandidates(s);
  // The active player announces how attacking creatures assign their damage first (CR 510.1).
  for (const pid of turnOrderFrom(s, s.activePlayer)) {
    const ids = cands.get(pid);
    if (!ids?.length || c.asked.includes(pid)) continue;
    s.pending = { kind: "pickPermanents", player: pid, source: "Combat damage", action: "unblocked", what: "blocked creature to assign its combat damage as though it weren't blocked", options: ids, count: ids.length, min: 0 };
    return true;
  }
  return false;
}

/**
 * Banding's division of a creature's combat damage by the player whose creatures take it (CR 702.22j-k): as few of
 * them die as possible. Each takes what it survives, the one with protection from the source or indestructible
 * all of it; the rest goes on the least valuable one.
 */
function bandSplit(s: GameState, source: GameObject, targets: GameObject[], dmg: number): [GameObject, number][] {
  const src = objectSource(s, source);
  const deathtouch = objHasKeyword(s, source, "Deathtouch");
  const room = (t: GameObject) =>
    protectedFrom(characteristics(s, t).keywords, src, protectionHolder(s, t)) || objHasKeyword(s, t, "Indestructible") ? Infinity : deathtouch ? 0 : Math.max(0, lethalLeft(s, t) - 1);
  const out = new Map<GameObject, number>();
  let left = dmg;
  for (const t of [...targets].sort((a, b) => room(b) - room(a))) {
    const n = Math.min(left, room(t));
    if (n > 0) out.set(t, n);
    left -= n;
  }
  if (left > 0) {
    const victim = [...targets].sort((a, b) => power(s, a) + toughness(s, a) - (power(s, b) + toughness(s, b)))[0]!;
    out.set(victim, (out.get(victim) ?? 0) + left);
  }
  return [...out];
}

/**
 * How much combat damage a creature assigns: its power (CR 510.1a), or its toughness under Doran's "assigns combat
 * damage equal to its toughness rather than its power" (only while its toughness is greater, for "with toughness
 * greater than its power"). Its power itself doesn't change (rulings).
 */
export function combatDamageOf(s: GameState, o: GameObject): number {
  const c = characteristics(s, o);
  const [p, t] = [power(s, o), toughness(s, o)];
  if (c.assignsToughness || (c.assignsToughnessIfGreater && t > p)) return t;
  // Loot, the Anomaly: its toughness still wins when something has it assign damage by toughness (rulings).
  return c.assignsAbsPower && p < 0 ? -p : p;
}

/** Combat damage is dealt simultaneously (CR 510.2); we compute all assignments first, then apply. True if it waits on a choice. */
function dealCombatDamage(s: GameState, firstStrikeStep: boolean): boolean {
  type Hit = { source: GameObject; toPlayer?: PlayerId; toObject?: GameObject; amount: number };
  const hits: Hit[] = [];
  // Trample over planeswalkers (CR 702.19c): at a planeswalker, damage up to its loyalty (less what's already assigned
  // to it this step) goes to it and the rest to its controller; with the planeswalker removed from combat, all of it
  // goes to the defending player (CR 702.19e). Not a battle's protector.
  const toRecipient = (at: GameObject, target: { toPlayer: PlayerId } | { toObject: GameObject } | null, amount: number) => {
    const a = at.attackingPermanent;
    if (a && a.battleController === undefined && at.attacking !== undefined && objHasKeyword(s, at, "Trample over planeswalkers") && (!target || "toObject" in target)) {
      const pw = target && "toObject" in target ? target.toObject : undefined;
      const assigned = pw ? hits.filter((h) => h.toObject === pw).reduce((n, h) => n + h.amount, 0) : 0;
      const n = pw ? Math.min(amount, Math.max(0, (pw.counters.loyalty ?? 0) - assigned)) : 0;
      if (pw && n > 0) hits.push({ source: at, toObject: pw, amount: n });
      if (amount > n) hits.push({ source: at, toPlayer: at.attacking, amount: amount - n });
      return;
    }
    if (target) hits.push({ source: at, ...target, amount });
  };
  for (const at of attackers(s)) {
    if (!dealsDamageThisStep(s, at, firstStrikeStep) || assignsNoCombatDamage(s, at)) continue;
    const trample = objHasKeyword(s, at, "Trample") || objHasKeyword(s, at, "Trample over planeswalkers");
    let dmg = combatDamageOf(s, at);
    if (dmg <= 0) continue;
    // "As though it weren't blocked": all of it to the player it's attacking, none to blockers (CR 510.1b; rulings).
    const unblocked = s.unblockedChoice?.turn === s.turn && s.unblockedChoice.step === s.step && s.unblockedChoice.ids.includes(at.id);
    // To the player or planeswalker it attacks; nothing if that planeswalker has left combat (CR 506.4c).
    const target = attackedRecipient(s, at);
    if (!at.blockedBy || unblocked) {
      toRecipient(at, target, dmg);
      continue;
    }
    const blockers = at.blockedBy.map((id) => obj(s, id));
    if (blockers.length === 0) {
      if (trample) toRecipient(at, target, dmg); // CR 702.19d
      continue;
    }
    // Blocked by a creature with banding, the defending player divides its damage among the blockers as they
    // choose (CR 702.22j), none to themselves even with trample.
    if (blockers.some((bl) => objHasKeyword(s, bl, "Banding"))) {
      for (const [bl, amount] of bandSplit(s, at, blockers, dmg)) hits.push({ source: at, toObject: bl, amount });
      continue;
    }
    // Assign lethal damage in blocker order (CR 510.1c); deathtouch makes 1 lethal (CR 702.2c).
    blockers.forEach((bl, i) => {
      const lethal = objHasKeyword(s, at, "Deathtouch") ? 1 : lethalLeft(s, bl);
      const last = i === blockers.length - 1;
      const amt = last && !(trample && (target || objHasKeyword(s, at, "Trample over planeswalkers"))) ? dmg : Math.min(dmg, lethal);
      if (amt > 0) hits.push({ source: at, toObject: bl, amount: amt });
      dmg -= amt;
    });
    // Trample: the rest to the player or planeswalker it attacks (CR 702.19b).
    if (dmg > 0 && trample) toRecipient(at, target, dmg);
  }
  for (const id of s.battlefield) {
    const bl = obj(s, id);
    if (!bl.blocking || !dealsDamageThisStep(s, bl, firstStrikeStep) || assignsNoCombatDamage(s, bl)) continue;
    const blocked = bl.blocking.map((a) => s.objects[a]).filter((at): at is GameObject => !!at && at.zone === "battlefield");
    let dmg = combatDamageOf(s, bl);
    if (dmg <= 0) continue;
    // Blocking a creature with banding, the active player divides its damage among those it blocks (CR 702.22k).
    if (blocked.length > 1 && blocked.some((at) => objHasKeyword(s, at, "Banding"))) {
      for (const [at, amount] of bandSplit(s, bl, blocked, dmg)) hits.push({ source: bl, toObject: at, amount });
      continue;
    }
    // Blocking two or more creatures, its damage is divided among them (CR 510.1d): lethal damage to each in
    // turn (1 with deathtouch, CR 702.2c), the rest to the last.
    blocked.forEach((at, i) => {
      const lethal = objHasKeyword(s, bl, "Deathtouch") ? 1 : lethalLeft(s, at);
      const amt = i === blocked.length - 1 ? dmg : Math.min(dmg, lethal);
      if (amt > 0) hits.push({ source: bl, toObject: at, amount: amt });
      dmg -= amt;
    });
  }
  // Fog: all combat damage is prevented, unless damage can't be prevented (CR 615.12): from anything, or from this source.
  if (s.preventCombatDamage && hits.length && canPreventDamage(s)) {
    const kept = hits.filter((h) => unpreventable(objectSource(s, h.source), true));
    log(s, kept.length ? "Combat damage is prevented, except damage that can't be." : "All combat damage is prevented.");
    // "Whenever damage that would be dealt to you is prevented" (Selfless Squire).
    const toPlayers = new Map<PlayerId, number>();
    for (const h of hits) if (!kept.includes(h) && h.toPlayer !== undefined) toPlayers.set(h.toPlayer, (toPlayers.get(h.toPlayer) ?? 0) + h.amount);
    for (const [pid, amount] of toPlayers) fireEvent(s, { type: "damagePreventedToPlayer", player: pid, amount });
    if (!kept.length) return false;
    hits.splice(0, hits.length, ...kept);
  }
  // Sources as they are now, before any of the damage changes anything (it's all dealt at once).
  const sources = new Map(hits.map((h) => [h.source.id, objectSource(s, h.source)]));
  const events: DamageEvent[] = hits.map((h) => ({ src: sources.get(h.source.id)!, to: h.toPlayer !== undefined ? { player: h.toPlayer } : { object: h.toObject!.id }, n: h.amount, combat: true }));
  s.damageBatch = { events, answers: [] };
  return finishCombatDamage(s);
}

/**
 * Deal the combat damage waiting in s.damageBatch, once its players have chosen what their damage shields take
 * (CR 615.7, 616.1). Returns true while it's waiting on a choice.
 */
function finishCombatDamage(s: GameState): boolean {
  const batch = s.damageBatch!;
  const plan = planShields(s, batch.events, batch.answers);
  if (plan.ask) {
    const q = plan.ask;
    s.pending = { kind: "chooseOption", player: q.player, source: "Combat damage", what: "damageShield", prompt: q.prompt, options: q.labels.map((_, i) => String(i)), labels: q.labels };
    return true;
  }
  s.damageBatch = undefined;
  // Each source's lifelink is one life-gain event however many things it damaged (CR 119.10).
  const lifelink = new Map<string, { n: number }>();
  const key = (e: DamageEvent) => e.src.id!;
  const done = dealPlanned(s, plan, { lifelink: (e) => lifelink.get(key(e)) ?? lifelink.set(key(e), { n: 0 }).get(key(e))! });
  const dealt = new Map<ObjectId, number>();
  for (const e of done) {
    dealt.set(key(e), (dealt.get(key(e)) ?? 0) + e.dealt);
    if ("player" in e.to && e.dealt) {
      const hitter = s.objects[key(e)];
      const first = hitter?.combatHitTurn !== s.turn;
      if (hitter) hitter.combatHitTurn = s.turn;
      fireEvent(s, { type: "combatDamageToPlayer", id: key(e), player: e.to.player, amount: e.dealt, ...(first ? { first: true as const } : {}) });
    }
    // To a planeswalker: still on the battlefield as the damage is dealt, before state-based actions (CR 704.3).
    const pw = "object" in e.to && e.dealt ? s.objects[e.to.object] : undefined;
    if (pw?.zone === "battlefield" && objIsType(s, pw, "Planeswalker")) fireEvent(s, { type: "combatDamageToPlayer", id: key(e), player: controllerOf(s, pw), amount: e.dealt, planeswalker: pw.id });
    else if (pw?.zone === "battlefield" && objIsType(s, pw, "Battle")) fireEvent(s, { type: "combatDamageToPlayer", id: key(e), player: pw.protector ?? controllerOf(s, pw), amount: e.dealt, battle: pw.id });
  }
  // "Whenever one or more creatures you control deal combat damage to a player": once per player dealt damage.
  // "... to a player or battle" (Zurgo and Ojutai): once per battle dealt damage too (rulings).
  const groups = new Map<string, { controller: PlayerId; player: PlayerId; ids: ObjectId[]; amounts: number[]; battle?: ObjectId }>();
  for (const e of done) {
    if (!e.dealt) continue;
    const b = "object" in e.to ? s.objects[e.to.object] : undefined;
    const battle = b?.zone === "battlefield" && objIsType(s, b, "Battle") ? b : undefined;
    if (!("player" in e.to) && !battle) continue;
    const controller = e.src.controller;
    const k = battle ? `${controller}|b${battle.id}` : `${controller}|${"player" in e.to ? e.to.player : ""}`;
    const g = groups.get(k) ?? { controller, player: battle ? (battle.protector ?? controllerOf(s, battle)) : (e.to as { player: PlayerId }).player, ids: [], amounts: [], ...(battle ? { battle: battle.id } : {}) };
    g.ids.push(key(e));
    g.amounts.push(e.dealt);
    groups.set(k, g);
  }
  for (const e of done) {
    const gained = lifelink.get(key(e));
    if (gained?.n) gainLife(s, e.src.controller, gained.n);
    lifelink.delete(key(e));
  }
  // "Whenever ~ deals (combat) damage": once per creature, for all it dealt this step (CR 510.2, 603.2c).
  for (const [id, n] of dealt) if (n) fireEvent(s, { type: "dealtDamage", id, amount: n, combat: true });
  for (const g of groups.values()) fireEvent(s, { type: "groupCombatDamage", ...g });
  // "Whenever one or more creatures deal combat damage to you" (Witch-king of Angmar): each player dealt it by creatures.
  // Who controlled each creature as it dealt it: "creatures an opponent controls" (Norn's Decree).
  const toPlayers = new Map<PlayerId, { ids: ObjectId[]; controllers: PlayerId[] }>();
  for (const e of done)
    if (e.dealt && "player" in e.to && e.src.types.includes("Creature")) {
      const g = toPlayers.get(e.to.player) ?? { ids: [], controllers: [] };
      g.ids.push(key(e));
      if (!g.controllers.includes(e.src.controller)) g.controllers.push(e.src.controller);
      toPlayers.set(e.to.player, g);
    }
  for (const [player, g] of toPlayers) fireEvent(s, { type: "creaturesDamagedPlayer", player, ...g });
  // "Whenever one or more creatures an opponent controls deal combat damage to one or more of your opponents" (Nelly
  // Borca): once for the step for each player whose creatures dealt it, with the players they dealt it to (CR 603.2c).
  const byController = new Map<PlayerId, PlayerId[]>();
  for (const [player, g] of toPlayers) for (const c of g.controllers) byController.set(c, [...(byController.get(c) ?? []), player]);
  for (const [controller, players] of byController) fireEvent(s, { type: "creaturesDamagedPlayers", controller, players });
  return false;
}

// ---------------------------------------------------------------------------
// State-based actions (CR 704) and leaving the game (CR 800.4)

/**
 * The groups of two or more legendary permanents with the same name one player controls (CR 704.5j), in the order they
 * entered. "The "legend rule" doesn't apply to permanents you control" (Sakashima of a Thousand Faces) leaves some out.
 */
function legendGroups(s: GameState): ObjectId[][] {
  const exempt = s.battlefield.flatMap((id) => (abilitiesOf(s, obj(s, id)).noLegendRule ?? []).map((filter) => ({ filter, you: controllerOf(s, obj(s, id)) })));
  const groups = new Map<string, ObjectId[]>();
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const c = characteristics(s, o);
    if (!c.supertypes.includes("Legendary") || exempt.some((x) => objectMatches(s, x.filter, o, x.you, false))) continue;
    const key = `${c.controller}:${c.name}`;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const byAge = (a: ObjectId, b: ObjectId) => obj(s, a).timestamp - obj(s, b).timestamp;
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort(byAge)).sort((a, b) => byAge(a[0]!, b[0]!));
}

/** Which legend a bot keeps: the one with Auras and Equipment on it, then more counters, then not a token, then the oldest. */
export function legendBotKeep(s: GameState, group: ObjectId[]): ObjectId {
  const score = (id: ObjectId) => {
    const o = obj(s, id);
    const attached = s.battlefield.filter((a) => obj(s, a).attachedTo === id).length;
    const counters = Object.entries(o.counters).reduce((n, [k, v]) => n + (k === "-1/-1" ? -v : v), 0);
    return attached * 100 + counters * 10 + (o.isToken ? 0 : 1);
  };
  return group.reduce((best, id) => (score(id) > score(best) ? id : best), group[0]!);
}

/** Ask a player which of a group of their legends to keep (CR 704.5j), for each group not yet answered. */
function askLegendRule(s: GameState): boolean {
  for (const group of legendGroups(s)) {
    if (group.some((id) => s.legendKeep?.includes(id))) continue;
    const you = controllerOf(s, obj(s, group[0]!));
    const label = (id: ObjectId, i: number) => {
      const o = obj(s, id);
      const counters = Object.entries(o.counters).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
      const attached = s.battlefield.filter((a) => obj(s, a).attachedTo === id).map((a) => nameOf(s, a));
      const notes = [o.isToken ? "token" : "", ...counters.map((c) => `${c} counter${c.startsWith("1 ") ? "" : "s"}`), ...attached, o.tapped ? "tapped" : "", i === group.length - 1 ? "newest" : i === 0 ? "oldest" : ""].filter(Boolean);
      return `Keep ${characteristics(s, o).name}${notes.length ? ` (${notes.join(", ")})` : ""}`;
    };
    s.pending = { kind: "chooseOption", player: you, source: characteristics(s, obj(s, group[0]!)).name, what: "legend", options: group, labels: group.map(label), prompt: "legend rule: keep which one? The rest go to the graveyard." };
    return true;
  }
  return false;
}

function afterAction(s: GameState, holdTriggers = false) {
  runStateBasedActions(s, holdTriggers);
}

export function runStateBasedActions(s: GameState, holdTriggers = false) {
  if (s.resolving) return; // not while a spell or ability is partway through resolving (CR 704.3)
  if (!s.pending && askEntersChoice(s)) return;
  for (let guard = 0; guard < 100; guard++) {
    s.leftTogether = undefined; // each pass happens all at once (CR 704.3)
    closeZoneBatch(s); // the action before, or the last pass, was one event for "one or more" triggers (CR 603.2c)
    closeGraveyardBatch(s); // the action before, or the last pass, put those cards there together (CR 404.3)
    // Auras coming back from "until ~ leaves" as the action before, or the last pass, ended (CR 303.4f, 610.3).
    const auras = s.pending || holdTriggers ? false : askAuraReturns(s);
    if (auras === "asked") return;
    invalidateCharacteristics(s);
    endWhileTapped(s);
    syncControl(s);
    checkPairs(s);
    checkAscend(s);
    checkDayNight(s); // not a state-based action, but done at once (CR 702.145c-g)
    checkPrepared(s); // the copies of prepare spells last as long as their permanents stay prepared (CR 722.3c)
    // The legend rule's choices come first, so this pass's actions all happen at once (CR 704.3).
    if (!s.pending && askLegendRule(s)) return;
    let changed = auras === "moved";
    for (const p of s.players) {
      if (p.lost) continue;
      if (p.life <= 0 && !zeroLifeOk(s, p.id)) changed = playerLoses(s, p.id, "life total reached 0") || changed; // 704.5a
      else if (p.drewFromEmptyLibrary) changed = playerLoses(s, p.id, "drew from an empty library") || changed; // 704.5b
      else if ((p.poison ?? 0) >= 10) changed = playerLoses(s, p.id, "ten poison counters") || changed; // 704.5c
      else {
        const fatal = Object.entries(p.commanderDamage).find(([, n]) => n >= COMMANDER_DAMAGE_LIMIT);
        if (fatal) changed = playerLoses(s, p.id, `took 21 combat damage from ${nameOf(s, fatal[0])}`) || changed; // 704.5u
      }
      // 704.5b is about draws since state-based actions were last checked: one that didn't lose (Platinum Angel) is past.
      if (!p.lost) p.drewFromEmptyLibrary = false;
    }
    // Start your engines!: a player with no speed who controls a permanent with it gets speed 1 (704.5aa).
    for (const p of s.players)
      if (!p.lost && p.speed === undefined && s.battlefield.some((id) => controllerOf(s, obj(s, id)) === p.id && abilitiesOf(s, obj(s, id)).startYourEngines)) {
        p.speed = 1;
        log(s, `${p.name} starts their engines: speed 1.`);
        changed = true;
      }
    for (const id of [...s.battlefield]) {
      const o = s.objects[id];
      if (!o || o.zone !== "battlefield") continue;
      const d = defOf(s, o);
      // A planeswalker with no loyalty goes to its owner's graveyard (704.5i, CR 306.9).
      if (objIsType(s, o, "Planeswalker") && (o.counters.loyalty ?? 0) <= 0) {
        log(s, `${characteristics(s, o).name} has no loyalty left and is put into the graveyard.`);
        moveObject(s, id, "graveyard");
        changed = true;
        continue;
      }
      if (!objIsType(s, o, "Creature")) continue;
      const t = toughness(s, o);
      if (t <= 0) {
        // Zero toughness isn't destruction: regeneration and indestructible don't help (704.5f).
        log(s, `${d.name} dies.`);
        moveObject(s, id, "graveyard");
        changed = true;
      } else if (((o.damage > 0 && lethalLeft(s, o) === 0) || o.deathtouchDamage) && !objHasKeyword(s, o, "Indestructible")) {
        destroyPermanent(s, o, `${d.name} dies.`); // 704.5g, 704.5h: destroyed (or regenerated)
        changed = true;
      }
    }
    // +1/+1 and -1/-1 counters cancel out (704.5q). This pass's other actions saw the counters as they
    // were (CR 704.3: all at once), so a creature dying now still had both (persist, modular).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const n = Math.min(o.counters["+1/+1"] ?? 0, o.counters["-1/-1"] ?? 0);
      if (n > 0) {
        o.counters["+1/+1"]! -= n;
        o.counters["-1/-1"]! -= n;
        changed = true;
      }
    }
    // Legend rule (704.5j): the rest of each group go to the graveyard, all but the one its controller chose (asked at the
    // start of this pass, askLegendRule). Not while another choice waits: they're checked again once it's made.
    const keep = s.legendKeep ?? [];
    s.legendKeep = undefined;
    if (!s.pending)
      for (const group of legendGroups(s)) {
        const kept = group.find((id) => keep.includes(id)) ?? legendBotKeep(s, group);
        for (const id of group) {
          if (id === kept) continue;
          log(s, `${characteristics(s, obj(s, id)).name} is put into the graveyard (legend rule).`);
          moveObject(s, id, "graveyard");
          changed = true;
        }
      }
    // World rule (704.5k): of two or more world permanents, all but the one that has been one for the shortest time go to
    // the graveyard; on a tie, all of them. That time is read from when each entered (its timestamp).
    const worlds = s.battlefield.filter((id) => characteristics(s, obj(s, id)).supertypes.includes("World"));
    if (worlds.length > 1) {
      const newest = Math.max(...worlds.map((id) => obj(s, id).timestamp));
      const kept = worlds.filter((id) => obj(s, id).timestamp === newest);
      for (const id of worlds) {
        if (kept.length === 1 && id === kept[0]) continue;
        log(s, `${characteristics(s, obj(s, id)).name} is put into the graveyard (world rule).`);
        moveObject(s, id, "graveyard");
        changed = true;
      }
    }
    if (attachmentSBAs(s)) changed = true;
    if (battleSBAs(s)) changed = true; // 704.5v-y
    if (!s.pending && s.entersChoices?.length && askEntersChoice(s)) return;
    if (roleSBAs(s)) changed = true; // 704.5z
    if (sagaSBAs(s)) changed = true; // 704.5s
    if (dungeonSBAs(s)) changed = true; // 704.5t
    // Commanders in graveyard/exile may return to the command zone (903.9a). Owners always choose yes for now.
    for (const o of Object.values(s.objects)) {
      if (o.justMovedForCommander && (o.zone === "graveyard" || o.zone === "exile")) {
        o.justMovedForCommander = false;
        moveObject(s, o.id, "command");
        log(s, `${defOf(s, o).name} returns to the command zone.`);
        changed = true;
      }
    }
    // Tokens that left the battlefield cease to exist (704.5d).
    for (const o of Object.values(s.objects)) {
      // A phased-out token still exists on the battlefield (CR 702.26d).
      if (!o.isToken || o.zone === "battlefield" || o.zone === "stack" || o.zone === "phasedOut" || o.zone === "merged") continue;
      const list = zoneList(s, o);
      if (list) list.splice(list.indexOf(o.id), 1);
      delete s.objects[o.id];
      changed = true;
    }
    if (!changed) break;
  }
  s.leftTogether = undefined;
  checkGameOver(s);
  // Cards that went to a graveyard together are arranged as they get there, before triggers go on the stack (CR 404.3).
  if (!s.over && !s.pending && !holdTriggers && askGraveyardOrder(s)) return;
  checkStateTriggers(s);
  // Then waiting triggered abilities go on the stack before anyone gets priority (CR 117.5).
  if (!s.over && !holdTriggers && processTriggerQueue(s, turnOrderFrom(s, s.activePlayer))) s.passedInSuccession = [];
}

/**
 * Auras attached illegally or to nothing go to the graveyard (CR 704.5m); Equipment
 * attached to something that isn't a creature becomes unattached (CR 704.5n).
 */
function attachmentSBAs(s: GameState): boolean {
  let changed = false;
  for (const id of [...s.battlefield]) {
    const o = s.objects[id];
    if (!o || o.zone !== "battlefield") continue;
    const c = characteristics(s, o);
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    if (c.subtypes.includes("Aura") && compileCard(defOf(s, o)).enchant?.kind === "player") {
      // An Aura with "enchant player" stays only while attached to a player still in the game that it can enchant
      // (CR 303.4d, 704.5m): "enchant opponent" checks against its controller now, so a change of control can end it.
      const p = o.attachedToPlayer;
      const enchant = compileCard(defOf(s, o)).enchant!;
      // Nor can it stay on a player with protection from its controller (CR 702.16c, 702.16k).
      const legal = p !== undefined && !o.attachedTo && !player(s, p).lost && (!enchant.opponent || opponents(s, c.controller).includes(p)) && !playerProtectedFrom(s, p, c.controller, c);
      if (!legal) {
        log(s, `${c.name} is put into the graveyard (not attached to a player it can enchant).`);
        moveObject(s, id, "graveyard");
        changed = true;
      }
    } else if (c.subtypes.includes("Aura") && compileCard(defOf(s, o)).animate) {
      // Animate Dead: attached to the creature card in a graveyard it entered attached to, then to the creature it put
      // onto the battlefield ("enchant creature put onto the battlefield with ~", rulings), which it can't leave for another.
      const link = s.animated?.[`${o.id}@${o.zoneChanges ?? 0}`];
      const card = o.enchantsCard;
      const hc = host && host.zone === "battlefield" ? characteristics(s, host) : undefined;
      const legal = link
        ? !!host && host.id === link.id && (host.zoneChanges ?? 0) === link.zc && !!hc && hc.types.includes("Creature") && !protectedFrom(hc.keywords, c, protectionHolder(s, host))
        : !!host && !!card && host.id === card.id && host.zone === "graveyard" && (host.zoneChanges ?? 0) === card.zc && printedMatches(compileCard(defOf(s, o)).enchant!, defOf(s, host));
      if (!legal) {
        log(s, `${c.name} is put into the graveyard (not attached to anything it can enchant).`);
        moveObject(s, id, "graveyard");
        changed = true;
      }
    } else if (c.subtypes.includes("Aura")) {
      const enchant = enchantOf(s, o);
      // Protection from the Aura's color makes it illegal too (CR 702.16c), unless that protection is only from an
      // effect that "doesn't remove" this Aura.
      const hc = host && characteristics(s, host);
      const shielding = hc ? hc.keywords.filter((k) => hc.sparedBy?.[k.toLowerCase()] !== o.id) : [];
      const legal =
        !!host &&
        host.zone === "battlefield" &&
        host.id !== o.id &&
        !!enchant &&
        objectMatches(s, enchant, host, c.controller, false) &&
        !protectedFrom(shielding, withCastThisTurn(s, o, c), protectionHolder(s, host)) &&
        // Daybreak Coronet: another Aura attached to it (rulings: once they're all gone, the Coronet goes too).
        (!compileCard(defOf(s, o)).enchantAnotherAura || s.battlefield.some((x) => x !== o.id && s.objects[x]!.attachedTo === host.id && characteristics(s, s.objects[x]!).subtypes.includes("Aura")));
      if (!legal && o.bestowed) {
        // A bestowed Aura becomes unattached and stops being bestowed: it's an enchantment creature (CR 702.103f).
        o.attachedTo = undefined;
        o.bestowed = undefined;
        invalidateCharacteristics(s);
        log(s, `${c.name} becomes unattached and is a creature again (bestow).`);
        changed = true;
      } else if (!legal) {
        log(s, `${c.name} is put into the graveyard (not attached to anything it can enchant).`);
        moveObject(s, id, "graveyard");
        changed = true;
      }
    } else if (c.subtypes.includes("Equipment") && o.attachedTo) {
      // Unattached from anything but a creature, and when it becomes a creature itself (CR 301.5c, 704.5n, 704.5p).
      // Also when the creature has protection from the Equipment's color (CR 702.16d).
      // And from one an "~ can be attached only to" no longer allows (O-Naginata rulings), or one that "can't be equipped".
      const only = abilitiesOf(s, o).attachOnly;
      if (!host || host.zone !== "battlefield" || !objIsType(s, host, "Creature") || c.types.includes("Creature") || characteristics(s, host).cantBeEquipped || protectedFrom(characteristics(s, host).keywords, withCastThisTurn(s, o, c), protectionHolder(s, host)) || (only && !objectMatches(s, only, host, controllerOf(s, o), false))) {
        if (host) fireEvent(s, { type: "unattached", id: o.id, host: host.id });
        o.attachedTo = undefined;
        invalidateCharacteristics(s);
        log(s, `${c.name} becomes unattached.`);
        changed = true;
      }
    } else if (o.attachedTo || o.attachedToPlayer !== undefined) {
      // A creature, or anything that's no longer an Aura or Equipment, can't stay attached (CR 704.5p).
      o.attachedTo = undefined;
      o.attachedToPlayer = undefined;
      invalidateCharacteristics(s);
      log(s, `${c.name} becomes unattached.`);
      changed = true;
    }
  }
  return changed;
}

/**
 * A permanent with more than one Role controlled by the same player attached to it: all but the one with the most recent
 * timestamp go to their owners' graveyards (CR 303.7a, 704.5z). Roles that became attached at the same time (a token
 * doubler) are the same Role, so which one stays doesn't matter.
 */
function roleSBAs(s: GameState): boolean {
  const newest = new Map<string, GameObject>();
  const extra: GameObject[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!o.attachedTo) continue;
    const c = characteristics(s, o);
    if (!c.subtypes.includes("Role")) continue;
    const key = `${o.attachedTo}:${c.controller}`;
    const other = newest.get(key);
    if (!other) newest.set(key, o);
    else if (o.timestamp > other.timestamp) {
      extra.push(other);
      newest.set(key, o);
    } else extra.push(o);
  }
  for (const o of extra) {
    log(s, `${characteristics(s, o).name} is put into the graveyard (a newer Role is attached to ${nameOf(s, o.attachedTo!)}).`);
    moveObject(s, o.id, "graveyard");
  }
  return extra.length > 0;
}

/**
 * Notice permanents whose controller changed. The new controller hasn't controlled it
 * continuously since their turn began (CR 302.6), and it leaves combat (CR 506.4), as does one that stopped being a creature.
 */
export function syncControl(s: GameState) {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    const now = controllerOf(s, o);
    // Suspend's haste lasts until its controller loses control of it (CR 702.62a), for good.
    if (o.suspendHaste !== undefined && o.suspendHaste !== now) {
      o.suspendHaste = undefined;
      invalidateCharacteristics(s);
    }
    if (o.seenController === undefined) o.seenController = now;
    else if (o.seenController !== now) {
      const was = o.seenController;
      o.seenController = now;
      fireEvent(s, { type: "controlChanged", id: o.id, from: was });
      loseRingBearer(s, o.id); // CR 701.54a
      o.controlledSinceTurn = s.turn;
      if (o.attacking !== undefined || o.blocking !== undefined) {
        removeFromCombat(s, o);
        clearCombat(o);
      }
    }
    // An attacking or blocking creature that stops being a creature (a Vehicle whose Aerial Modification fell off) is
    // removed from combat too (CR 506.4).
    if ((o.attacking !== undefined || o.blocking !== undefined) && !objIsType(s, o, "Creature")) {
      log(s, `${nameOf(s, o.id)} is no longer a creature and is removed from combat.`);
      removeFromCombat(s, o);
      clearCombat(o);
    }
  }
}

/**
 * "You can't lose the game and your opponents can't win the game" (Platinum Angel), "You can't win the game and your
 * opponents can't lose the game" (Abyssal Persecutor): does a permanent on the battlefield stop `pid` from losing
 * (`what` "lose") or winning? Only conceding gets past it (rulings).
 */
export function gameEndBlocked(s: GameState, pid: PlayerId, what: "lose" | "win"): boolean {
  // "You can't lose the game this turn and your opponents can't win the game this turn" (Courageous Resolve).
  // "Players can't lose the game or win the game this turn" (Everybody Lives!).
  if (what === "lose" ? turnRule(s, pid, "cantLoseGame") : turnRule(s, pid, "cantWinGame") || s.turnOrder.some((p) => p !== pid && turnRule(s, p, "opponentsCantWin"))) return true;
  // Emblems too, controlled by their owners (CR 114.4): Gideon of the Trials'.
  return [...s.battlefield.map((id) => obj(s, id)), ...liveEmblems(s)].some((o) => {
    // Its own, and ones an effect gave it (The Book of Exalted Deeds' Angel): each a rule of its own, so Platinum Angel's
    // given to Abyssal Persecutor blocks both ways.
    const emblem = o.zone === "command";
    const all = emblem ? [abilitiesOf(s, o)] : [abilitiesOf(s, o), ...characteristics(s, o).grantedAbilities.map(compileGranted)];
    const you = emblem ? o.owner : controllerOf(s, o);
    return all.some((a) => {
      const rule = what === "lose" ? a.cantLose : a.cantWin;
      return !!rule && (rule === "you" ? you === pid : you !== pid) && (!a.gameEndIf || staticConditionNow(s, a.gameEndIf, o.id, you));
    });
  });
}

/** "You don't lose the game for having 0 or less life" (Marina Vendrell's Grimoire): a permanent `pid` controls says so. */
export function zeroLifeOk(s: GameState, pid: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    return controllerOf(s, o) === pid && [abilitiesOf(s, o), ...characteristics(s, o).grantedAbilities.map(compileGranted)].some((a) => a.noZeroLifeLoss);
  });
}

/**
 * "You win the game" (CR 104.2b): the game ends at once (CR 104.1) with that player the winner, unless something says
 * they can't win (Platinum Angel's "your opponents can't win the game").
 */
export function winGame(s: GameState, pid: PlayerId, reason: string) {
  const p = player(s, pid);
  if (p.lost || s.over) return;
  if (gameEndBlocked(s, pid, "win")) {
    log(s, `${p.name} can't win the game.`);
    return;
  }
  s.over = true;
  s.winner = pid;
  s.pending = null;
  log(s, `${p.name} wins the game (${reason}).`);
}

/** An effect says the game is a draw (CR 104.4c): it ends with no winner. */
export function drawGame(s: GameState, reason: string) {
  if (s.over) return;
  s.over = true;
  s.winner = null;
  s.pending = null;
  log(s, `The game is a draw (${reason}).`);
}

/** `conceded`: leaving the game this way can't be stopped (CR 104.3a; rulings on Platinum Angel). */
export function playerLoses(s: GameState, pid: PlayerId, reason: string, conceded = false): boolean {
  const p = player(s, pid);
  if (p.lost) return false;
  if (!conceded && gameEndBlocked(s, pid, "lose")) return false;
  // The Golden Throne: "If you would lose the game, instead exile ~ and your life total becomes 1" (CR 614.1a). Several:
  // one applies, its controller's choice, and they're all the same (CR 616.1). The life it takes is gained or lost
  // (CR 119.5), so a player who can't might still be at 0 and lose at the next check (rulings).
  const throne = conceded ? undefined : s.battlefield.find((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).loseGameExileSelf);
  if (throne) {
    log(s, `${p.name} would lose the game (${reason}), but exiles ${nameOf(s, throne)} instead and their life total becomes 1.`);
    moveObject(s, throne, "exile");
    if (p.life < 1 && canGainLife(s, pid)) gainLife(s, pid, 1 - p.life);
    else if (p.life > 1 && canLoseLife(s, pid)) loseLife(s, pid, p.life - 1);
    invalidateCharacteristics(s);
    return true;
  }
  p.lost = true;
  p.lossReason = reason;
  log(s, `${p.name} loses the game (${reason}).`);
  // CR 800.4a: everything they own leaves the game, and effects giving them control of things end.
  s.stack = s.stack.filter((item) => item.controller !== pid);
  for (const e of s.effects) if (e.controller === pid) e.mods = e.mods.filter((m) => m.kind !== "control");
  // ... and of players (CR 723): Emrakul's extra turn still comes.
  if (s.controlledTurn?.controller === pid) s.controlledTurn = { ...s.controlledTurn, controller: s.controlledTurn.controlled };
  s.playerControls = s.playerControls?.flatMap((c) => (c.controller !== pid ? [c] : c.extraTurnAfter ? [{ ...c, ended: true as const }] : []));
  if (!s.playerControls?.length) s.playerControls = undefined;
  invalidateCharacteristics(s);
  for (const id of [...s.battlefield]) {
    const o = obj(s, id);
    if (o.owner === pid) {
      removeFromCombat(s, o);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      delete s.objects[id];
    }
  }
  // Phased-out permanents they own leave too (CR 702.26k).
  if (s.phasedOut)
    s.phasedOut = s.phasedOut.filter((id) => {
      if (s.objects[id]!.owner !== pid) return true;
      delete s.objects[id];
      return false;
    });
  for (const other of s.battlefield) if (s.objects[other]!.attachedTo && !s.objects[s.objects[other]!.attachedTo!]) s.objects[other]!.attachedTo = undefined;
  invalidateCharacteristics(s);
  // "Then, if there are any objects still controlled by that player, those objects are exiled" (CR 800.4a): a permanent
  // someone else owns that was put onto the battlefield under their control (Yavimaya Dryad's Forest, rulings).
  const still = s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid);
  for (const id of still) {
    log(s, `${defOf(s, obj(s, id)).name} is exiled (its controller left the game).`);
    moveObject(s, id, "exile");
  }
  if (still.length) invalidateCharacteristics(s);
  for (const o of attackers(s)) if (o.attacking === pid) clearCombat(o);
  s.passedInSuccession = s.passedInSuccession.filter((id) => id !== pid);
  // Odric's controller leaving while declaring for someone: that player declares their own blockers.
  if (s.pending?.kind === "declareBlockers" && s.pending.player === pid && s.pending.defender !== undefined) s.pending = { kind: "declareBlockers", player: s.pending.defender, remaining: s.pending.remaining };
  else if (s.pending?.kind === "declareBlockers" && s.pending.defender === pid) {
    const [next, ...rest] = s.pending.remaining;
    s.pending = next !== undefined ? blockersPending(s, next, rest) : null;
  } else if (s.pending?.player === pid) {
    if (s.pending.kind === "declareBlockers") {
      const [next, ...rest] = s.pending.remaining;
      s.pending = next !== undefined ? blockersPending(s, next, rest) : null;
    } else s.pending = null;
  }
  // An assisted cast waiting on a player who left: it isn't cast.
  if ((s.pending?.kind === "assist" && s.pending.caster === pid) || (s.pending?.kind === "assistCast" && s.pending.helper === pid)) s.pending = null;
  if (s.monarch === pid) {
    // The active player becomes the monarch, or if it's them leaving, the next player in turn order (CR 725.4).
    s.monarch = undefined;
    const order = s.turnOrder;
    const from = order.indexOf(s.activePlayer);
    const next = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, order.length).map((i) => order[(from + i) % order.length]!).find((id) => !player(s, id).lost);
    if (next !== undefined) becomeMonarch(s, next);
  }
  if (s.initiative === pid) {
    // The active player takes the initiative, or if it's them leaving, the next player in turn order (CR 726.4).
    s.initiative = undefined;
    const order = s.turnOrder;
    const from = order.indexOf(s.activePlayer);
    const next = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, order.length).map((i) => order[(from + i) % order.length]!).find((id) => !player(s, id).lost);
    if (next !== undefined && livingPlayers(s).length > 1) takeInitiative(s, next);
  }
  if (livingPlayers(s).length <= 1) return true;
  if (!s.mulligans) fireEvent(s, { type: "lostGame", player: pid });
  if (s.mulligans) {
    // Leaving before the game starts: the others carry on with their mulligans.
    s.mulligans.going = s.mulligans.going.filter((id) => id !== pid);
    if (!s.pending) nextMulliganDecision(s);
    return true;
  }
  if (s.activePlayer === pid) {
    // The rest of the turn proceeds without an active player (CR 800.4j); we skip straight to the next turn.
    s.pending = null;
    startNextTurn(s);
  } else if (s.priority === pid) {
    s.priority = nextLivingAfter(s, pid);
  }
  return true;
}

function checkGameOver(s: GameState) {
  const living = livingPlayers(s);
  if (living.length <= 1 && !s.over) {
    s.over = true;
    s.winner = living[0] ?? null;
    s.pending = null;
    log(s, s.winner !== null ? `${player(s, s.winner).name} wins!` : "The game is a draw.");
  }
}

// ---------------------------------------------------------------------------
// Legal action enumeration (for UIs and bots)

/**
 * Simple actions available to `pid` right now. Combat declarations, and spells or abilities
 * that need targets, are built by the caller (see castProblem / abilityProblem).
 */
/** Cards in exile `pid` may play right now (impulse draw), whoever owns them. */
export function exilePlayable(s: GameState, pid: PlayerId): ObjectId[] {
  return s.players.flatMap((q) => q.exile).filter((id) => mayPlayFromExile(s, obj(s, id), pid));
}

export function legalActions(s: GameState, pid: PlayerId): Action[] {
  if (waitingOn(s) !== pid) return [];
  if (s.pending) return [];
  const p = player(s, pid);
  const out: Action[] = [{ type: "passPriority", player: pid }];
  for (const id of [...p.hand, ...exilePlayable(s, pid), ...topPlayable(s, pid)]) {
    const d = defOf(s, obj(s, id));
    const o = obj(s, id);
    if (isType(d, "Land")) {
      if (canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < landsAllowed(s, pid) && !nameLandBan(s, pid, d)) out.push({ type: "playLand", player: pid, objectId: id });
    } else if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
    // A modal double-faced card's other land face (CR 712.12), and the faces it can be cast as (709.3, 712.11b, 715.3).
    for (const face of landFaces(s, o))
      if (face !== 0 && canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < landsAllowed(s, pid) && !asFace(s, o, face, () => nameLandBan(s, pid, defOf(s, o)))) out.push({ type: "playLand", player: pid, objectId: id, face });
    for (const face of castableFaces(s, o))
      if (castProblem(s, pid, id, undefined, undefined, undefined, undefined, undefined, { face }) === null && asFace(s, o, face, () => !spellTargets(s, id).length && !spellModes(s, id))) out.push({ type: "castSpell", player: pid, objectId: id, face });
    if (suspendProblem(s, pid, id) === null) out.push({ type: "suspend", player: pid, objectId: id });
    if (plotProblem(s, pid, id) === null) out.push({ type: "plot", player: pid, objectId: id });
    if (foretellProblem(s, pid, id) === null) out.push({ type: "foretell", player: pid, objectId: id });
  }
  for (const id of s.battlefield) for (const door of [0, 1]) if (unlockProblem(s, pid, id, door) === null) out.push({ type: "unlockDoor", player: pid, objectId: id, door });
  for (const id of s.battlefield) if (endEffectProblem(s, pid, id) === null) out.push({ type: "endEffect", player: pid, objectId: id });
  // "You may play lands from your graveyard" (Crucible of Worlds).
  if (canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < landsAllowed(s, pid))
    for (const id of p.graveyard) if (mayPlayLandFromGraveyard(s, obj(s, id), pid) && !nameLandBan(s, pid, defOf(s, obj(s, id)))) out.push({ type: "playLand", player: pid, objectId: id });
  for (const id of p.command) if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const options = manaOptions(s, o);
    manaAbilitiesOn(s, o).forEach((ab, i) => {
      if (manaAbilityProblem(s, pid, o, i)) return;
      const tap = ab.tapCost ? tapCostCandidates(s, pid, o, ab.tapCost).slice(0, ab.tapCost.n) : undefined;
      for (const x of options) if (x.ability === i) out.push({ type: "activateMana", player: pid, objectId: id, mana: x.mana, ability: i, ...(x.combo !== undefined ? { combo: x.combo } : {}), ...(tap ? { tap } : {}), ...(x.extra ? { extra: x.extra } : {}) });
    });
  }
  return out;
}

/**
 * Why `pid` can't suspend this card right now, or null (with the mana in their pool). Suspending is a special
 * action (CR 116.2f) they can take whenever they could begin to cast the card from their hand (CR 702.62a, c):
 * its card type's timing and anything stopping it from being cast count; targets and its mana cost don't (rulings).
 */
export function suspendProblem(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "hand" || o.owner !== pid) return "only a card in your hand can be suspended";
  const d = defOf(s, o);
  const sus = compileCard(d).suspend;
  if (!sus) return `${d.name} doesn't have suspend`;
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (splitSecondOnStack(s)) return "a spell with split second is on the stack";
  // Whenever they could begin to cast it (CR 702.62a), with "as though it had flash" too.
  const instantSpeed = isType(d, "Instant") || d.keywords.includes("Flash") || flashGranted(s, pid, d, o.owner);
  if (!instantSpeed && !canActAtSorcerySpeed(s, pid)) return `${d.name} can only be suspended when you could cast it (sorcery speed)`;
  // Only if you could begin to cast it: not under Silence or Rule of Law (CR 702.62a, rulings on Silence).
  const limit = castLimitProblem(s, pid, d);
  if (limit) return limit;
  if (!canPayFromPool(s, pid, parseManaCost(sus.cost), "other")) return `not enough mana to suspend ${d.name} (${sus.cost})`;
  return null;
}

/** Suspend a card (CR 702.62a): pay its suspend cost and exile it with N time counters on it. It doesn't use the stack. */
function suspendCard(s: GameState, p: Player, id: ObjectId) {
  const problem = suspendProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const d = defOf(s, o);
  const sus = compileCard(d).suspend!;
  spendFromPool(s, p.id, parseManaCost(sus.cost), "other");
  moveObject(s, id, "exile");
  o.counters.time = sus.n;
  log(s, `${p.name} suspends ${d.name} with ${sus.n} time counter${sus.n === 1 ? "" : "s"} (${sus.cost}).`);
  s.passedInSuccession = [];
}

/**
 * Assist (CR 702.132a): before paying, the caster chooses another player, who may activate mana abilities and pay for
 * any amount of the generic mana in the spell's total cost; then the caster pays the rest. The cast waits on them.
 */
function askAssist(s: GameState, p: Player, action: Extract<Action, { type: "castSpell" }>) {
  const o = obj(s, action.objectId);
  const d = defOf(s, o);
  if (!compileCard(d).assist) throw new RulesError(`${d.name} doesn't have assist`);
  const helper = action.assist!;
  if (helper === p.id || !s.players[helper] || player(s, helper).lost) throw new RulesError("choose another player in the game to assist");
  const { assist: _, ...rest } = action;
  const problem = castProblem(s, p.id, o.id, action.targets, action.modes, action.convoke, action.improvise, action.x, rest);
  if (problem && !/not enough mana/.test(problem)) throw new RulesError(problem);
  const cost = costToPay(s, p.id, o, action.convoke, action.improvise, action.x, action.kicks, { ...rest, targets: action.targets });
  const generic = typeof cost === "string" ? 0 : splitGeneric(cost.cost, cost.extra).extra;
  if (!generic) throw new RulesError(`${d.name}'s total cost has no generic mana for another player to pay`);
  s.pending = { kind: "assist", player: helper, caster: p.id, source: d.name, max: generic, cast: action };
  log(s, `${p.name} asks ${player(s, helper).name} to help pay for ${d.name} (assist, up to {${generic}}).`);
}

function assistPays(s: GameState, p: Player, n: number) {
  const pend = s.pending;
  if (pend?.kind !== "assist" || pend.player !== p.id) throw new RulesError("no spell to assist");
  if (!Number.isInteger(n) || n < 0 || n > pend.max) throw new RulesError(`pay from 0 to ${pend.max}`);
  const spell = pend.cast.faceDown ? FACE_DOWN : castDef(s, pend.cast.objectId, pend.cast.alt);
  if (n && !canPayFromPool(s, p.id, parseManaCost(`{${n}}`), { spell })) throw new RulesError(`not enough mana in your pool to pay {${n}}`);
  log(s, n ? `${p.name} will pay {${n}} of ${pend.source}'s cost.` : `${p.name} doesn't help pay for ${pend.source}.`);
  s.pending = { kind: "assistCast", player: pend.caster, helper: p.id, source: pend.source, n, cast: { ...pend.cast, ...(n ? { assisted: n } : { assist: undefined }) } };
}

/** The caster pays what's left and casts it; or, if they can't or won't, the cast is undone (CR 733.1). */
function finishAssistedCast(s: GameState, p: Player, cancel?: boolean) {
  const pend = s.pending;
  if (pend?.kind !== "assistCast" || pend.player !== p.id) throw new RulesError("no assisted spell to cast");
  s.pending = null;
  if (cancel) {
    log(s, `${p.name} doesn't cast ${pend.source}.`);
    return;
  }
  const a = pend.cast;
  castSpell(s, p, a.objectId, a.targets, a.modes, a.convoke, a.improvise, a.x, a);
  s.passedInSuccession = [];
}

/** What the caster still pays for an assisted spell, once the helper has chosen (for planning mana). */
export function assistedRemaining(s: GameState): { cost: ParsedCost; extra: number } | null {
  const pend = s.pending;
  if (pend?.kind !== "assistCast") return null;
  const a = pend.cast;
  const cost = costToPay(s, pend.player, obj(s, a.objectId), a.convoke, a.improvise, a.x, a.kicks, { ...a, targets: a.targets });
  return typeof cost === "string" ? null : cost;
}

/**
 * Why `pid` can't plot this card right now, or null (with the mana in their pool). Plotting is a special action
 * (CR 116.2k) any time they have priority during their main phase while the stack is empty (CR 702.170a).
 */
export function plotProblem(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "hand" || o.owner !== pid) return "only a card in your hand can be plotted";
  const d = defOf(s, o);
  const cost = plotCost(s, pid, d);
  if (cost === undefined) return `${d.name} doesn't have plot`;
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (!canActAtSorcerySpeed(s, pid)) return "you can only plot during your main phase while the stack is empty";
  if (!canPayFromPool(s, pid, parseManaCost(cost), "other")) return `not enough mana to plot ${d.name} (${cost})`;
  return null;
}

/**
 * Why `pid` can't foretell this card right now, or null (with the mana in their pool). Foretelling is a special action
 * (CR 116.2h) any time they have priority during their own turn (CR 702.143a), even with spells on the stack.
 */
export function foretellProblem(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "hand" || o.owner !== pid) return "only a card in your hand can be foretold";
  const d = defOf(s, o);
  if (!compileCard(d).foretell && grantedForetell(s, pid, o) === undefined) return `${d.name} doesn't have foretell`;
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (s.activePlayer !== pid) return "you can only foretell during your own turn";
  if (!canPayFromPool(s, pid, parseManaCost("{2}"), "other")) return `not enough mana to foretell ${d.name} ({2})`;
  return null;
}

/**
 * Foretell a card (CR 702.143a): pay {2} and exile it face down. Only its owner may look at it (the others see that a
 * card was foretold); it can be cast for its foretell cost after this turn.
 */
function foretellCard(s: GameState, p: Player, id: ObjectId) {
  const problem = foretellProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const d = defOf(s, o);
  // Dream Devourer's foretell: the card keeps the foretell cost it was given, not the ability (rulings).
  const reduce = compileCard(d).foretell ? undefined : grantedForetell(s, p.id, o);
  spendFromPool(s, p.id, parseManaCost("{2}"), "other");
  moveObject(s, id, "exile");
  o.foretold = true;
  o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "foretell", turn: s.turn, ...(reduce !== undefined ? { foretellReduce: reduce } : {}) };
  log(s, `${p.name} foretells a card.`);
  log(s, `(You foretold ${d.name}: cast it on a later turn for ${foretellCostOf(s, o, d) ?? "its foretell cost"}.)`, p.id);
  s.passedInSuccession = [];
  fireEvent(s, { type: "foretold", player: p.id });
}

/**
 * The foretell a permanent `pid` controls gives this nonland card without foretell in their hand (Dream Devourer, CR
 * 702.143a): how much generic mana its foretell cost is less than its mana cost. The least of several reductions is
 * no use, so the greatest.
 */
function grantedForetell(s: GameState, pid: PlayerId, o: GameObject): number | undefined {
  const d = defOf(s, o);
  if (o.zone !== "hand" || o.owner !== pid || isType(d, "Land") || compileCard(d).foretell) return undefined;
  const all = s.battlefield.flatMap((id) => {
    const p = obj(s, id);
    return controllerOf(s, p) === pid ? (abilitiesOf(s, p).handForetell ?? []).map((x) => x.reduce) : [];
  });
  return all.length ? Math.max(...all) : undefined;
}

/**
 * A card's foretell cost: its own (CR 702.143a), or, for one in hand with foretell from Dream Devourer or foretold with
 * it, `d`'s mana cost (the face it's cast as, rulings) less that much generic mana, never colored mana (rulings). A card
 * with no mana cost has none to reduce: no foretell cost to pay (CR 118.6).
 */
export function foretellCostOf(s: GameState, o: GameObject, d: CardDef = defOf(s, o), pid: PlayerId = o.owner): string | undefined {
  const own = compileCard(d).foretell;
  if (own) return own;
  const reduce = o.zone === "exile" && o.mayPlay?.until === "foretell" ? o.mayPlay.foretellReduce : grantedForetell(s, pid, o);
  if (reduce === undefined || !d.manaCost) return undefined;
  let left = reduce;
  const cost = d.manaCost.replace(/\{(\d+)\}/g, (_, n: string) => {
    const k = Math.max(0, Number(n) - left);
    left = Math.max(0, left - Number(n));
    return k ? `{${k}}` : "";
  });
  return cost || "{0}";
}

/**
 * A Room permanent's locked door's unlock cost: that half's mana cost (CR 709.5e), less generic mana for each "Unlock
 * costs you pay cost {1} less" its controller controls (Inquisitive Glimmer, CR 601.2f), or undefined if there's none
 * to unlock.
 */
export function unlockCost(s: GameState, o: GameObject, door: number): string | undefined {
  const d = roomOf(s, o);
  if (o.zone !== "battlefield" || o.unlocked === undefined || o.unlocked.includes(door) || !d) return undefined;
  const cost = d.faces![door]?.manaCost;
  if (cost === undefined) return undefined;
  const pid = controllerOf(s, o);
  const less = s.battlefield.reduce((n, id) => n + (controllerOf(s, obj(s, id)) === pid ? (abilitiesOf(s, obj(s, id)).unlockLess ?? 0) : 0), 0);
  const generic = /\{(\d+)\}/.exec(cost);
  if (!less || !generic) return cost;
  const left = Math.max(0, Number(generic[1]) - less);
  const out = cost.replace(generic[0], left ? `{${left}}` : "");
  return out || "{0}";
}

/**
 * Why `pid` can't unlock this door of a Room now, or null (with the mana in their pool). Unlocking is a special action
 * its controller takes any time they have priority during a main phase of their turn with the stack empty (CR 116.2m,
 * 709.5e).
 */
export function unlockProblem(s: GameState, pid: PlayerId, id: ObjectId, door: number): string | null {
  const o = s.objects[id];
  const cost = o && unlockCost(s, o, door);
  if (!o || cost === undefined) return "only a locked door of a Room on the battlefield can be unlocked";
  if (controllerOf(s, o) !== pid) return "only a Room you control can be unlocked";
  if (!canActAtSorcerySpeed(s, pid)) return "you can only unlock a door during your main phase while the stack is empty";
  if (!canPayFromPool(s, pid, parseManaCost(cost), "other")) return `not enough mana to unlock ${roomOf(s, o)!.faces![door]!.name} (${cost})`;
  return null;
}

/** Unlock a door of a Room (CR 709.5e): pay its mana cost, and it has that door's name, cost and text from now on. */
function unlockDoor(s: GameState, p: Player, id: ObjectId, door: number) {
  const problem = unlockProblem(s, p.id, id, door);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const cost = unlockCost(s, o, door)!;
  spendFromPool(s, p.id, parseManaCost(cost), "other");
  log(s, `${p.name} unlocks ${roomOf(s, o)!.faces![door]!.name} (${cost}).`);
  setUnlocked(s, o, [...o.unlocked!, door]);
  s.passedInSuccession = [];
}

/** The effect on this permanent `pid` may pay to end ("You may pay {W} to end this effect", a Licid), if any. */
export function endableEffect(s: GameState, pid: PlayerId, id: ObjectId): ContinuousEffect | undefined {
  return s.effects.find((e) => e.endable && e.controller === pid && e.affected.includes(id));
}

/**
 * Why `pid` can't pay to end the effect on this permanent now, or null (with the mana in their pool). It's a special
 * action they may take any time they have priority (CR 116.2c), so nothing can respond to it (rulings on the Licids).
 */
export function endEffectProblem(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const e = endableEffect(s, pid, id);
  if (!e || s.objects[id]?.zone !== "battlefield") return "there's no effect on that permanent you may pay to end";
  if (s.priority !== pid || s.pending) return "you can end that effect only while you have priority";
  if (!canPayFromPool(s, pid, parseManaCost(e.endable!.cost), "other")) return `not enough mana to end ${e.sourceName}'s effect (${e.endable!.cost})`;
  return null;
}

/** Pay to end an effect (CR 116.2c), then get priority again (CR 116.3). */
function endEffect(s: GameState, p: Player, id: ObjectId) {
  const problem = endEffectProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const e = endableEffect(s, p.id, id)!;
  spendFromPool(s, p.id, parseManaCost(e.endable!.cost), "other");
  s.effects = s.effects.filter((x) => x !== e);
  invalidateCharacteristics(s);
  log(s, `${p.name} pays ${e.endable!.cost} to end ${e.sourceName}'s effect.`);
  s.passedInSuccession = [];
}

/** Give a Room these unlocked designations (CR 709.5c); each door that becomes unlocked triggers its abilities (709.5h). */
export function setUnlocked(s: GameState, o: GameObject, doors: number[]) {
  const was = o.unlocked ?? [];
  // In the order they were unlocked (faces.ts roomDef).
  o.unlocked = [...was.filter((i) => doors.includes(i)), ...[0, 1].filter((i) => doors.includes(i) && !was.includes(i))];
  registerRoom(s, cardIdOf(o));
  invalidateCharacteristics(s);
  for (const door of o.unlocked) if (!was.includes(door)) fireEvent(s, { type: "doorUnlocked", id: o.id, door });
  // "Fully unlocks" (CR 709.5i): it had one designation and gets the other, or had neither and gets both.
  if (was.length < 2 && o.unlocked.length === 2) fireEvent(s, { type: "roomFullyUnlocked", id: o.id, player: controllerOf(s, o) });
}

/**
 * What `pid` pays to plot this card now: its plot cost, less generic mana for each "Plotting cards from your hand costs
 * {2} less" they control (Doc Aurlock; reductions take off only generic mana, CR 601.2f). Undefined without plot.
 */
export function plotCost(s: GameState, pid: PlayerId, d: CardDef): string | undefined {
  const cost = compileCard(d).plot;
  if (cost === undefined) return undefined;
  let less = 0;
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const n = abilitiesOf(s, o).plotLess;
    if (n && controllerOf(s, o) === pid) less += n;
  }
  if (!less) return cost;
  const generic = /\{(\d+)\}/.exec(cost);
  if (!generic) return cost;
  const left = Math.max(0, Number(generic[1]) - less);
  const out = cost.replace(generic[0], left ? `{${left}}` : "");
  return out || "{0}";
}

/** Plot a card (CR 702.170a): pay its plot cost and exile it. Its owner may cast it free on a later turn (702.170d). */
function plotCard(s: GameState, p: Player, id: ObjectId) {
  const problem = plotProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const d = defOf(s, o);
  const cost = plotCost(s, p.id, d)!;
  spendFromPool(s, p.id, parseManaCost(cost), "other");
  moveObject(s, id, "exile");
  o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "plot", turn: s.turn };
  log(s, `${p.name} plots ${d.name} (${cost}). They may cast it without paying its mana cost on a later turn.`);
  s.passedInSuccession = [];
  fireEvent(s, { type: "plotted", id });
}

/**
 * The ways to turn a face-down permanent face up: the morph or disguise cost the card would have face up (CR 702.37e,
 * 702.168d), and for a manifested or cloaked creature card, its mana cost too (CR 701.40b-d, 701.58b-d). That's the
 * card's own types and cost, whatever copy or type-changing effects say, and works even if it would lose its
 * abilities (rulings). A manifested instant or sorcery stays face down (CR 701.40g). An {X} in the mana cost is 0:
 * its controller chooses X (CR 107.3d), and it would mean nothing on the battlefield (CR 107.3g).
 */
export function faceUpWays(s: GameState, o: GameObject): { kind: FaceDownKind; cost: string; costs?: AdditionalCost[]; text?: string }[] {
  if (!o.faceDown) return [];
  const ways: { kind: FaceDownKind; cost: string; costs?: AdditionalCost[]; text?: string }[] = [];
  const fd = compileCard(faceUpDefOf(s, o)).faceDownCast;
  // Exiled Doomsayer: "All morph costs cost {2} more" (a megamorph cost is a morph cost, CR 702.37b).
  const tax = fd && (fd.kind === "morph" || fd.kind === "megamorph") ? s.battlefield.reduce((n, id) => n + (abilitiesOf(s, s.objects[id]!).morphTax ?? 0), 0) : 0;
  if (fd) ways.push(tax ? { ...fd, cost: moreGeneric(fd.cost, tax) } : fd);
  if (o.faceDown === "manifest" || o.faceDown === "cloak") {
    const card = realDefOf(s, o);
    if (isType(card, "Creature") && card.manaCost) ways.push({ kind: o.faceDown, cost: card.manaCost.replace(/\{X\}/g, "") || "{0}" });
  }
  return ways;
}

/**
 * Why `pid` can't turn this permanent face up right now (the `way`-th of faceUpWays), or null (with the mana in
 * their pool). It's a special action, any time they have priority (CR 116.2b).
 */
export function turnFaceUpProblem(s: GameState, pid: PlayerId, id: ObjectId, way = 0, x = 0, costs?: CostChoices): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "battlefield" || !o.faceDown) return "that isn't a face-down permanent";
  if (controllerOf(s, o) !== pid) return "you don't control that permanent";
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (characteristics(s, o).cantTurnFaceUp) return "it can't be turned face up"; // Unable to Scream
  const ways = faceUpWays(s, o);
  if (!ways.length) return o.faceDown === "manifest" || o.faceDown === "cloak" ? "it isn't a creature card with a mana cost" : "it has no morph or disguise cost"; // CR 702.37e, 701.40b
  const fd = ways[way];
  if (!fd) return "it can't be turned face up that way";
  if (!Number.isInteger(x) || x < 0 || (x > 0 && !parseManaCost(fd.cost).hasX)) return "that isn't a value of X for it";
  // "Morph—Pay 5 life", "Morph—Sacrifice two Mountains" (CR 702.37e, 118.8): paid as it's turned face up; without the
  // choices, only whether it could be.
  const cp = fd.costs ? extraCostProblem(s, pid, o, fd.costs, costs, "turn it face up") : costs && Object.keys(costs).length ? "it has no costs to choose" : null;
  if (cp) return cp;
  const cost = faceUpManaCost(fd.cost, x);
  if (!canPayFromPool(s, pid, parseManaCost(cost), "other")) return `not enough mana to turn it face up (${cost})`;
  return null;
}

/** A mana cost with `n` more generic mana: "{1}{U}" and 2 is "{3}{U}", "" (no mana) is "{2}". */
function moreGeneric(cost: string, n: number): string {
  const generic = /\{(\d+)\}/.exec(cost);
  return generic ? cost.replace(generic[0], `{${Number(generic[1]) + n}}`) : `{${n}}${cost}`;
}

/** The cost of turning a face-down permanent face up the `way`-th way, if it has one. */
export const faceUpCost = (s: GameState, o: GameObject, way = 0) => faceUpWays(s, o)[way];

/** A morph or disguise cost with its {X} as the X chosen (CR 107.3d): "{X}{3}{W}" with X 2 is "{2}{3}{W}". */
export const faceUpManaCost = (cost: string, x = 0) => cost.replace(/\{X\}/g, x ? `{${x}}` : "") || "{0}";

function turnFaceUp(s: GameState, p: Player, id: ObjectId, way = 0, x = 0, costs?: CostChoices) {
  const problem = turnFaceUpProblem(s, p.id, id, way, x, costs);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const fd = faceUpWays(s, o)[way]!;
  // What pays it is chosen as it's paid (as for abilities, activateAbility): no skipping a cost by not saying.
  if (fd.costs?.some((c) => "n" in c && c.n > 0 && costNeedsPick(c) && !costs?.[costPickKey(c)]?.length)) throw new RulesError("choose what to pay its morph cost with");
  // The whole cost is shown, then paid (CR 702.37e); the permanent is turned face up after.
  const name = defOf(s, { ...o, faceDown: undefined }).name;
  if (fd.costs) payExtraCosts(s, p, fd.costs, { ...costs });
  // Mana with it too: "Morph—Pay 5 life" with Exiled Doomsayer's {2}.
  if (!fd.costs || fd.cost) spendFromPool(s, p.id, parseManaCost(faceUpManaCost(fd.cost, x)), "other");
  turnedFaceUp(s, o, `${p.name} turns a face-down creature face up: it's ${name} (${fd.kind === "manifest" || fd.kind === "cloak" ? "its mana cost" : describeVia(fd.kind)} ${fd.text ?? fd.cost}${parseManaCost(fd.cost).hasX ? `, X = ${x}` : ""}).`, fd.kind === "megamorph", x, p.id);
  s.passedInSuccession = [];
}

/**
 * Turns a face-down permanent face up. Its copiable values go back to the card's, or what a copy effect made it (CR
 * 708.8, 707.3); it's the same permanent, so nothing "enters". `megamorph`: its megamorph cost was paid (CR 702.37b).
 */
function turnedFaceUp(s: GameState, o: GameObject, text: string, megamorph = false, x = 0, by?: PlayerId) {
  o.faceDown = undefined;
  lockIfRoom(s, o);
  invalidateCharacteristics(s);
  const d = defOf(s, o);
  log(s, text);
  // Megamorph: a +1/+1 counter as it's turned face up, if its megamorph cost was paid (CR 702.37b).
  if (megamorph) putCounters(s, o, "+1/+1", 1);
  // Hooded Hydra: its counters as it's turned face up, not a trigger (CR 614.1e, rulings).
  const up = compileCard(d).faceUpCounters;
  // Crowd-Control Warden: "put X +1/+1 counters on it, where X is the number of other creatures you control", counted then.
  if (up) putCounters(s, o, up.counter, typeof up.n === "number" ? up.n : Math.max(0, evalAmount(s, up.n, { controller: controllerOf(s, o), sourceId: o.id })));
  fireEvent(s, { type: "turnedFaceUp", id: o.id, ...(x ? { x } : {}), ...(by !== undefined ? { by } : {}) });
}

/**
 * An effect turns a face-down permanent face up (Ugin's Mastery), with no cost to pay. Not one that can't be turned face up
 * (Unable to Scream); a manifested or cloaked instant or sorcery card is revealed and stays face down, and nothing
 * triggers (CR 701.40g, 701.58g). Whether it turned face up.
 */
export function turnFaceUpByEffect(s: GameState, o: GameObject, src: string, by?: PlayerId): boolean {
  if (o.zone !== "battlefield" || !o.faceDown) return false;
  if (characteristics(s, o).cantTurnFaceUp) {
    log(s, `${src}: that face-down permanent can't be turned face up.`);
    return false;
  }
  const card = realDefOf(s, o);
  if ((o.faceDown === "manifest" || o.faceDown === "cloak") && (isType(card, "Instant") || isType(card, "Sorcery"))) {
    log(s, `${src}: ${player(s, controllerOf(s, o)).name} reveals the face-down permanent, ${card.name}, an ${isType(card, "Instant") ? "instant" : "sorcery"} card; it stays face down.`);
    return false;
  }
  turnedFaceUp(s, o, `${src} turns a face-down permanent of ${player(s, controllerOf(s, o)).name}'s face up: it's ${defOf(s, { ...o, faceDown: undefined }).name}.`, false, 0, by);
  return true;
}

/** Could `pid` cast this card right now with the mana in their pool? */
export const canCast = (s: GameState, pid: PlayerId, id: ObjectId) => castProblem(s, pid, id) === null;

/** Total mana `pid` could make by tapping everything available, ignoring color. */
export function availableMana(s: GameState, pid: PlayerId): number {
  let n = Object.values(player(s, pid).manaPool).reduce((a, b) => a + b, 0);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    // Each permanent's best ability, net of any mana it costs (a Signet nets one).
    let best = 0;
    manaAbilitiesOn(s, o).forEach((ab, i) => {
      if (manaAbilityProblem(s, pid, o, i, true)) return;
      // A storage land as autopay uses it: one counter at a time.
      const combos = manaCombos(s, o, ab);
      const most = ab.produces.kind === "removeX" ? Math.min(1, o.counters[ab.produces.counter] ?? 0) + (ab.produces.base ?? 0) : combos ? Math.max(0, ...combos.map((c) => c.length)) : Math.max(0, ...manaChoices(s, o, ab).map((m) => manaProduced(s, o, ab, m).length));
      best = Math.max(best, most - manaValue(parseManaCost(ab.manaCost)));
    });
    for (const { ab, options } of payableActivatedMana(s, pid, o)) best = Math.max(best, Math.max(0, ...options.map((x) => x.adds.length)) - manaValue(parseManaCost(ab.manaCost)));
    n += best;
  }
  return n;
}


/** The first "as you cast this spell" count in a spell's text (Count asCast), if any. */
function findAsCast(x: unknown): { kind: "asCast"; of: Count } | undefined {
  if (!x || typeof x !== "object") return undefined;
  if ((x as { kind?: string }).kind === "asCast") return x as { kind: "asCast"; of: Count };
  for (const v of Object.values(x)) {
    const f = findAsCast(v);
    if (f) return f;
  }
  return undefined;
}

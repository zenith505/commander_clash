import { kickerName } from "./abilities";
import type { AdditionalCost, AltCostKind, ChoiceKind, CastFromGraveyard, CastFromGraveyardKind, CompiledCard, EntersCondition, EntersOption, Modification, TargetChoice, TargetSpec } from "./abilities";
import { abilitiesOf, bestowedDef, cardIdOf, defOf, pairedWith, FACE_DOWN, FACE_DOWN_WARD, faceUpDefOf, realDefOf, describeAbility, isPermanentCard, isType, objHasKeyword, objIsType, power, toughness } from "./cards";
import { MANA_ABILITY_OFFSET, manaAbilitiesOn, manaAbilityProblem, manaChoices, manaOptions, manaProduced, manaTriggerResults, pickManaAbility } from "./manaabilities";
import { untapStepPhasing, releasePhased } from "./phasing";
import { takeInitiative, dungeonSBAs, loseRingBearer, addDelayed, canChooseTarget, modsAreHarmful, becomeMonarch, triggerBody, canChooseModes, choiceOptions, ENTERS_COUNTER, describePay, withChoice, discardCards, printedMatches, sourceQuality, stampTargets, fireEvent, hasLegalTargets, isLegalTarget, modesProblem, objectMatches, processTriggerQueue, pushTrigger, checkStateTriggers, beginResolution, continueResolution, targetProblem } from "./effects";
import { describeCount, withModes } from "./modes";
import { dealDamage, objectSource, protectedFrom } from "./damage";
import { putCounters } from "./counters";
import { addCopyEffect, copyKey, endCopyEffects, exceptFor } from "./copies";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "./layers";
import { compileCard, spellTargetSpecs } from "./oracle";
import { convokeReduce, emptyPool, manaValue, parseManaCost, payGenericWith, splitGeneric, xCount, xProblem, type ParsedCost } from "./mana";
import { evalAmount } from "./amounts";
import { addMana, canPayFromPool, spendFromPool } from "./spend";
import { nextRandom, shuffle } from "./rng";
import { watchForMandatoryLoop } from "./shortcuts";
import { CREATURE_TYPES } from "./keywords";
import {
  COLORS,
  RulesError,
  type Action,
  type CardDef,
  type CostChoices,
  type FaceDownKind,
  type GameObject,
  type GameState,
  type LastKnown,
  type ManaType,
  type ObjectId,
  type Player,
  type PlayerId,
  type Step,
  type ZoneName,
} from "./types";

export const STARTING_LIFE = 40; // CR 903.7
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
    cards: { [FACE_DOWN.oracleId]: FACE_DOWN, [FACE_DOWN_WARD.oracleId]: FACE_DOWN_WARD },
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
    shuffle(s, player.library);
  });
  // CR 103.1: randomly determine the starting player.
  const first = Math.floor(nextRandom(s) * setup.length);
  s.activePlayer = first;
  s.priority = first;
  for (const p of s.players) draw(s, p.id, 7);
  log(s, `Game start. ${s.players[first]!.name} goes first.`);
  if (opts.mulligans) {
    s.mulligans = { taken: {}, kept: [], toDeclare: turnOrderFrom(s, first), going: [] };
    nextMulliganDecision(s);
  } else beginStep(s, "untap");
  return s;
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
      shuffle(s, p.library);
      draw(s, g, OPENING_HAND);
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
  beginStep(s, "untap");
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
  s.cards[card.oracleId] ??= card;
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
    playerLoses(s, p.id, "conceded");
    afterAction(s);
    return;
  }
  /** Everyone passed in succession: the top of the stack resolved, or the step ended. */
  let allPassed = false;
  const expected = waitingOn(s);
  if (action.player !== expected) throw new RulesError(`waiting on player ${expected}, not ${action.player}`);

  switch (action.type) {
    case "passPriority":
      requireNoPending(s);
      // Triggers held while activating mana abilities go on the stack before anyone passes (CR 117.5).
      if (s.triggerQueue.length) break;
      allPassed = passPriority(s, p.id);
      break;
    case "playLand":
      requireNoPending(s);
      playLand(s, p, action.objectId, action.untapped);
      s.passedInSuccession = [];
      break;
    case "activateMana":
      // Mana abilities can also be activated while paying a cost mid-resolution, like ward's (CR 605.3a).
      // So can they while casting a card for its madness cost as madness's trigger resolves (CR 702.35a, 601.2g).
      // And while helping to pay for a spell with assist, or paying the rest of it (CR 702.132a).
      if (s.pending?.kind !== "payUnless" && s.pending?.kind !== "assist" && s.pending?.kind !== "assistCast" && !(s.pending?.kind === "chooseMay" && s.pending.pay?.mana) && !(s.pending?.kind === "castFree" && s.pending.how === "madness")) requireNoPending(s);
      activateMana(s, p, action.objectId, action.mana, action.ability, action.tap, action.extra);
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
      requireNoPending(s);
      activateAbility(s, p, action.objectId, action.index, action.targets, action.modes, action.tapCreatures, action.x, action.costs);
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
    case "searchLibrary":
      searchLibrary(s, p, action.found);
      break;
    case "pickPermanents":
      pickPermanents(s, p, action.ids);
      break;
    case "chooseMay":
      chooseMay(s, p, action.yes);
      break;
    case "chooseOption":
      chooseOption(s, p, action.choice);
      break;
    case "payUnless":
      payUnless(s, p, action.pay);
      break;
    case "mulligan":
      declareMulligan(s, p, action.keep);
      break;
    case "bottomCards":
      bottomCards(s, p, action.objectIds);
      break;
    case "turnFaceUp":
      requireNoPending(s);
      turnFaceUp(s, p, action.objectId);
      break;
    case "suspend":
      requireNoPending(s);
      suspendCard(s, p, action.objectId);
      break;
    case "plot":
      requireNoPending(s);
      plotCard(s, p, action.objectId);
      break;
    case "assist":
      assistPays(s, p, action.n);
      break;
    case "finishAssistedCast":
      finishAssistedCast(s, p, action.cancel);
      break;
    case "dredge":
      chooseDredge(s, p, action.objectId);
      break;
  }
  // Mana abilities activated just before casting are part of paying for it (CR 601.2g): what they
  // trigger ("whenever a creature dies" from sacrificing a Scion) waits until the spell is cast.
  afterAction(s, action.type === "activateMana");
  watchForMandatoryLoop(s, action, allPassed);
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

export function log(s: GameState, text: string) {
  s.log.push({ seq: s.log.length, turn: s.turn, text });
}

/** The card `pid` may cast for free right now, as cascade resolves (see PendingDecision "castFree"), or for its madness cost. */
export function freeCastOf(s: GameState, pid: PlayerId): ObjectId | undefined {
  return s.pending?.kind === "castFree" && s.pending.player === pid ? s.pending.objectId : undefined;
}

/** The madness cost `pid` may cast this card for right now, as its madness ability resolves (CR 702.35a). */
export function madnessCastOf(s: GameState, pid: PlayerId, id: ObjectId): string | undefined {
  const pend = s.pending;
  if (pend?.kind !== "castFree" || pend.player !== pid || pend.objectId !== id || pend.how !== "madness") return undefined;
  return compileCard(defOf(s, obj(s, id))).madness;
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
  }
}

/** Move an object between zones. It becomes a new object with no memory of its old one (CR 400.7). */
export function moveObject(
  s: GameState,
  id: ObjectId,
  to: ZoneName,
  opts: {
    top?: boolean;
    controller?: PlayerId;
    attachTo?: ObjectId;
    tapped?: boolean;
    /** Counters it enters the battlefield with (persist, undying). */
    counters?: Record<string, number>;
    /** For a land that may enter untapped by paying life or revealing a card: that was done (CR 614.12). */
    untapped?: boolean;
    /** The X of the spell it was, for "enters with X counters" and its enters triggers (CR 107.3m). */
    x?: number;
  } = {},
) {
  const o = obj(s, id);
  const fromZone = o.zone;
  // A copy of a spell anywhere but the stack ceases to exist (CR 707.10a); it isn't a card, so nothing sees it arrive.
  if (o.spellCopy && to !== "stack" && to !== "battlefield") {
    delete s.objects[id];
    return;
  }
  // "If it would leave, exile it instead" (flashback, unearth): a replacement effect (CR 614.1a).
  if (o.exileIfLeaves === fromZone && to !== "exile") to = "exile";
  o.exileIfLeaves = undefined;
  // "If that creature would die this turn, exile it instead" (CR 614.1a).
  if (fromZone === "battlefield" && to === "graveyard" && o.exileIfDiesTurn === s.turn) {
    to = "exile";
    log(s, `${defOf(s, o).name} is exiled instead of dying.`);
  }
  o.exileIfDiesTurn = undefined;
  // A commander that would be put into its owner's library goes to the command zone instead, if its owner
  // wants (CR 903.9b); owners always do. Into a hand it stays: it can be cast from there without tax.
  if (o.isCommander && to === "library" && fromZone !== "library") {
    to = "command";
    log(s, `${defOf(s, o).name} goes to the command zone instead.`);
  }
  const escaped = fromZone === "stack" && to === "battlefield" && o.castVia === "escape";
  if (fromZone === "stack") {
    o.castFrom = undefined;
    o.castVia = undefined;
    o.buyback = undefined;
  }
  // Last known information, for leaves-the-battlefield triggers (CR 603.10a, 608.2h).
  const last = characteristics(s, o);
  const lastCounters = { ...o.counters };
  const lastController = last.controller;
  const wasCreature = last.types.includes("Creature");
  // A face-down permanent has no abilities of its own (CR 708.2), so nothing of the card's triggers as it leaves.
  const hadAbilities = last.hasPrintedAbilities && !o.faceDown;
  // The permanent as it last existed, for "whenever a creature you control with a +1/+1 counter dies".
  const snapshot: GameObject | undefined = fromZone === "battlefield" ? { ...o, counters: lastCounters } : undefined;
  if (fromZone === "battlefield") {
    (s.leftTogether ??= []).push({ id, controller: lastController, hadAbilities, ...(last.grantedAbilities?.length ? { granted: last.grantedAbilities } : {}), ...(o.attachedTo ? { attachedTo: o.attachedTo } : {}) });
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    (s.lastKnown ??= {})[id] = { zc: o.zoneChanges ?? 0, power: last.power, toughness: last.toughness, controller: last.controller, copyKey: cardIdOf(o), ...(host ? { attachedTo: { id: host.id, zc: host.zoneChanges ?? 0 } } : {}) };
  }
  const exiledUntil = fromZone === "battlefield" ? o.exiledUntilLeaves : undefined;
  const attachments: ObjectId[] = []; // what was attached to it, for "whenever equipped creature dies"
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
    o.colorsSpent = undefined;
    o.castAlt = undefined; // so is whether its evoke or dash cost was paid (CR 702.74a, 702.109a)
    o.bestowed = undefined; // a bestowed spell is a bestowed Aura as it resolves, and nothing else is (CR 702.103b)
    o.suspendHaste = undefined; // suspend's haste is the spell's and the permanent's it becomes (CR 702.62a)
    // A face-down spell becomes a face-down permanent (CR 708.4); anywhere else, it's revealed (CR 708.9).
    if (o.faceDown) {
      o.faceDown = undefined;
      log(s, `(The face-down creature was ${realDefOf(s, o).name}.)`);
    }
  }
  o.zone = to;
  o.zoneChanges = (o.zoneChanges ?? 0) + 1; // a new object (CR 400.7)
  o.copyOf = undefined; // copy effects end with the object (CR 400.7)
  o.copyEffects = undefined;
  o.tapped = false;
  o.damage = 0;
  o.damagedBy = undefined;
  o.deathtouchDamage = false;
  o.regenShields = undefined;
  o.preventNext = undefined;
  o.activatedThisTurn = undefined;
  o.skipNextUntap = undefined;
  o.renowned = undefined;
  o.chosen = undefined;
  if (to === "battlefield") o.devoured = undefined; // kept elsewhere for "for each creature it devoured" (CR 608.2h)
  o.counters = {};
  o.controller = opts.controller ?? o.owner;
  o.seenController = undefined;
  o.attacking = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
  o.band = undefined;
  o.timestamp = s.nextTimestamp++; // CR 613.7d
  o.attachedTo = to === "battlefield" ? opts.attachTo : undefined;
  if (fromZone === "battlefield") {
    // It's a new object now (CR 400.7): effects locked onto it end, and things attached to it
    // are no longer attached (Auras then go to the graveyard and Equipment stays, CR 704.5m-n).
    for (const e of s.effects) e.affected = e.affected.filter((x) => x !== id);
    s.effects = s.effects.filter((e) => e.affected.length);
    for (const other of s.battlefield)
      if (s.objects[other]!.attachedTo === id) {
        s.objects[other]!.attachedTo = undefined;
        attachments.push(other);
      }
  }
  if (to === "battlefield") o.controlledSinceTurn = s.turn;
  invalidateCharacteristics(s);
  // "Enters with N counters" is a replacement effect (CR 614.1c): N is counted before it's on the battlefield.
  const printedCounters = to === "battlefield" ? compileCard(defOf(s, o)).entersWithCounters : undefined;
  // Raid: "~ enters with a +1/+1 counter on it if you attacked this turn".
  const withCounters = printedCounters?.if && !staticConditionNow(s, printedCounters.if, id, o.controller) ? undefined : printedCounters;
  const counterN = withCounters ? Math.max(0, evalAmount(s, withCounters.n, { controller: o.controller, sourceId: id, x: opts.x, kicked: o.kicked, colorsSpent: o.colorsSpent?.length })) : 0;
  const dest = zoneList(s, o);
  if (dest) opts.top || to === "battlefield" ? dest.unshift(id) : dest.push(id);
  if (to === "graveyard" || to === "exile") o.justMovedForCommander = o.isCommander;
  if (to === "battlefield") {
    const printed = compileCard(defOf(s, o));
    const how: EnterOpts = { ...(opts.x ? { x: opts.x } : {}), ...(opts.tapped ? { tapped: true } : {}), ...(opts.untapped ? { untapped: true } : {}), ...(opts.counters ? { counters: opts.counters } : {}), ...(escaped ? { escaped } : {}), ...(fromZone === "stack" ? { fromStack: true } : {}) };
    // "You may have ~ enter as a copy of ...": it becomes the copy as it enters (CR 707.5), so how it
    // enters and what it triggers wait for that choice.
    if (printed.entersAsCopy && copyCandidates(s, o, printed.entersAsCopy.filter).length) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what: "copy", enterOpts: how });
    else finishEntering(s, o, printed, how, withCounters && counterN ? { counter: withCounters.counter, n: counterN } : undefined);
  }
  // Leaving the battlefield: "dies" is a creature put into a graveyard from the battlefield (CR 700.4); other
  // triggers say "put into a graveyard" or "leaves the battlefield".
  if (fromZone === "battlefield")
    fireEvent(s, { type: "dies", to, id, controller: lastController, hadAbilities, grantedAbilities: last.grantedAbilities, counters: lastCounters, wasCreature, power: last.power, toughness: last.toughness, snapshot, chars: last, attachments });
  if (exiledUntil?.length) returnUntilLeaves(s, exiledUntil, last.name);
}

/** `fromStack`: it's a resolving spell becoming a permanent (sunburst, CR 702.44b). */
type EnterOpts = { x?: number; tapped?: boolean; untapped?: boolean; counters?: Record<string, number>; escaped?: boolean; fromStack?: boolean };

/**
 * The rest of entering the battlefield (CR 614.1c, 614.12): tapped or not, counters, "as it enters" choices,
 * then its enters event. `withCounters`: its "enters with N counters", counted before it was on the battlefield.
 */
function finishEntering(s: GameState, o: GameObject, printed: CompiledCard, opts: EnterOpts, withCounters?: { counter: string; n: number }) {
  const id = o.id;
  if (printed.entersTapped || opts.tapped || entersTappedNow(s, o, printed, opts.untapped) || othersMakeItEnterTapped(s, o)) o.tapped = true;
  if (withCounters) putCounters(s, o, withCounters.counter, withCounters.n, true); // CR 614.1c
  // Bloodthirst: "if an opponent was dealt damage this turn" (CR 702.54a).
  if (printed.bloodthirst && (s.damagedThisTurn ?? []).some((pid) => opponents(s, o.controller).includes(pid)))
    putCounters(s, o, "+1/+1", printed.bloodthirst, true);
  for (const [k, n] of Object.entries(opts.counters ?? {})) putCounters(s, o, k, n, true);
  // "~ escapes with N +1/+1 counters on it" (CR 702.138c).
  if (opts.escaped && printed.escapesWith) putCounters(s, o, "+1/+1", printed.escapesWith, true);
  // Sunburst: only a resolving spell, and only for colored mana spent to cast it (CR 702.44b). Whether it enters as a
  // creature ignores type-changing effects (702.44a): its copiable values decide.
  if (printed.sunburst && opts.fromStack && o.colorsSpent?.length) {
    const counter = printed.sunburst.counter ?? (isType(defOf(s, o), "Creature") ? "+1/+1" : "charge");
    const put = putCounters(s, o, counter, o.colorsSpent.length, true);
    log(s, `${defOf(s, o).name} enters with ${put} ${counter} counter${put === 1 ? "" : "s"} (sunburst).`);
  }
  // "As ~ enters, choose a color": its controller chooses before anything else happens (CR 614.12).
  for (const c of printed.entersChoose ?? []) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, ...c });
  // Devour, riot and unleash: how many +1/+1 counters it has is part of how it enters (CR 614.12), so what it
  // triggers waits for that choice (evolve compares its power as it entered, CR 702.100a).
  const options: EntersOption[] = [...(printed.devour ? (["devour"] as const) : []), ...(printed.amplify ? (["amplify"] as const) : []), ...(printed.entersOptions ?? [])];
  options.forEach((what, i) => (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what, ...(i === options.length - 1 ? { enters: opts.x ? { x: opts.x } : {} } : {}) }));
  if (!options.length) fireEvent(s, { type: "enters", id, ...(opts.x ? { x: opts.x } : {}) });
}

/** What a permanent entering "as a copy of" something could copy: other permanents on the battlefield (not targeted). */
export function copyCandidates(s: GameState, o: GameObject, filter: TargetSpec): ObjectId[] {
  return s.battlefield.filter((id) => id !== o.id && objectMatches(s, filter, obj(s, id), controllerOf(s, o), false));
}

/** It enters as a copy of `target`, or of nothing ("none"), then finishes entering as what it now is (CR 707.5). */
function enterAsCopy(s: GameState, o: GameObject, choice: ObjectId | "none", opts: EnterOpts) {
  const own = compileCard(defOf(s, o)).entersAsCopy;
  if (choice !== "none" && own) {
    const target = obj(s, choice);
    const key = copyKey(s, defOf(s, target), exceptFor(s, o, own.except, realDefOf(s, o).name));
    if (own.untilEndOfTurn) addCopyEffect(s, o, key, "endOfTurn");
    else o.copyOf = key;
    invalidateCharacteristics(s);
    log(s, `${realDefOf(s, o).name} enters as a copy of ${defOf(s, target).name}${own.untilEndOfTurn ? " until end of turn" : ""}.`);
  }
  const printed = compileCard(defOf(s, o));
  const ewc = printed.entersWithCounters;
  const n = ewc && !(ewc.if && !staticConditionNow(s, ewc.if, o.id, o.controller)) ? Math.max(0, evalAmount(s, ewc.n, { controller: o.controller, sourceId: o.id, x: opts.x })) : 0;
  finishEntering(s, o, printed, opts, ewc && n ? { counter: ewc.counter, n } : undefined);
}

/**
 * "Exile ... until ~ leaves the battlefield" ends: right after the source leaves, the cards come back
 * under their owners' control, all at once (CR 610.3, 610.3c-d). Only if each is still the object it
 * exiled; a token has ceased to exist (CR 111.7). An Aura's owner chooses what it enchants, and with
 * nothing it can enchant it stays in exile (CR 303.4f-g).
 */
function returnUntilLeaves(s: GameState, links: { id: ObjectId; zc: number }[], source: string) {
  const back = links.map((l) => s.objects[l.id]).filter((c, i): c is GameObject => !!c && c.zone === "exile" && (c.zoneChanges ?? 0) === links[i]!.zc && !c.isToken);
  for (const c of back) {
    const d = defOf(s, c);
    let attachTo: ObjectId | undefined;
    if (d.subtypes.includes("Aura")) {
      attachTo = auraHostFor(s, c, c.owner);
      if (!attachTo) {
        log(s, `${d.name} stays in exile (nothing it can enchant).`);
        continue;
      }
    }
    log(s, `${d.name} returns to the battlefield (${source} left)${attachTo ? ` attached to ${nameOf(s, attachTo)}` : ""}.`);
    moveObject(s, c.id, "battlefield", { controller: c.owner, ...(attachTo ? { attachTo } : {}) });
  }
}

/**
 * Where an Aura put onto the battlefield without a spell goes (CR 303.4f): something its enchant
 * ability allows (it isn't targeted, so hexproof doesn't stop it). The player picks: one of their own
 * if the Aura only helps what it enchants, an opponent's otherwise.
 */
export function auraHostFor(s: GameState, aura: GameObject, pid: PlayerId): ObjectId | undefined {
  const enchant = compileCard(defOf(s, aura)).enchant;
  if (!enchant) return undefined;
  const legal = s.battlefield.filter((id) => id !== aura.id && objectMatches(s, enchant, obj(s, id), pid, false, defOf(s, aura)));
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
function othersMakeItEnterTapped(s: GameState, o: GameObject): boolean {
  return s.battlefield.some((id) => {
    if (id === o.id) return false;
    const src = obj(s, id);
    const rules = compileCard(defOf(s, src)).othersEnterTapped;
    if (!rules || !characteristics(s, src).hasPrintedAbilities) return false;
    const you = controllerOf(s, src);
    return rules.some((r) => objectMatches(s, r.filter, o, you, false));
  });
}

function entersTappedNow(s: GameState, o: GameObject, printed: CompiledCard, choice?: boolean): boolean {
  if (printed.entersTappedUnless) return !conditionHolds(s, printed.entersTappedUnless, o.controller, o.id);
  if (printed.entersTappedChoice) return !choice;
  return false;
}

export function conditionHolds(s: GameState, cond: EntersCondition, you: PlayerId, self?: ObjectId): boolean {
  switch (cond.kind) {
    case "playerLifeAtMost":
      return livingPlayers(s).some((pid) => player(s, pid).life <= cond.n);
    case "opponents":
      return opponents(s, you).length >= cond.min;
    case "control": {
      const n = s.battlefield.filter((id) => {
        if (id === self) return false;
        const x = obj(s, id);
        const mine = controllerOf(s, x) === you;
        if (cond.who === "you" ? !mine : mine) return false;
        const c = characteristics(s, x);
        if (cond.types && !cond.types.every((ty) => c.types.includes(ty))) return false;
        if (cond.supertypes && !cond.supertypes.every((ty) => c.supertypes.includes(ty))) return false;
        return !cond.subtypes || cond.subtypes.some((ty) => c.subtypes.includes(ty));
      }).length;
      return (cond.min === undefined || n >= cond.min) && (cond.max === undefined || n <= cond.max);
    }
  }
}

/**
 * Can this land enter untapped by its "you may pay 2 life / reveal a card" choice right now?
 * Paying life needs at least that much life (CR 119.4); revealing needs a matching card in hand
 * besides the land itself.
 */
export function canEnterUntapped(s: GameState, pid: PlayerId, landId: ObjectId): boolean {
  const choice = compileCard(defOf(s, obj(s, landId))).entersTappedChoice;
  if (!choice) return false;
  const p = player(s, pid);
  if (choice.kind === "payLife") return p.life >= choice.n;
  return p.hand.some((id) => id !== landId && printedMatches(choice.filter, defOf(s, obj(s, id))));
}

/** A player gains life (CR 119.3): one life-gain event, which "whenever you gain life" abilities see (CR 119.10). */
export function gainLife(s: GameState, pid: PlayerId, n: number) {
  if (n <= 0) return;
  player(s, pid).life += n;
  fireEvent(s, { type: "lifeGained", player: pid, amount: n });
}

/** A player loses life (CR 119.3): from damage (119.2), an effect, or paying life (119.4). One life-loss event. */
export function loseLife(s: GameState, pid: PlayerId, n: number) {
  if (n <= 0) return;
  player(s, pid).life -= n;
  fireEvent(s, { type: "lifeLost", player: pid, amount: n });
}

/**
 * Untap a permanent. A stun counter replaces that: one is removed instead (CR 122.1d). Untapping
 * an untapped permanent isn't an untap, so the counter stays.
 */
export function untapPermanent(s: GameState, o: GameObject) {
  if (!o.tapped) return;
  if ((o.counters.stun ?? 0) > 0) {
    o.counters.stun! -= 1;
    log(s, `A stun counter is removed from ${defOf(s, o).name} instead of untapping it.`);
    return;
  }
  o.tapped = false;
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
 * leaves combat. Returns true if it went to the graveyard.
 */
export function destroyPermanent(s: GameState, o: GameObject, message: string, noRegen = false): boolean {
  if (objHasKeyword(s, o, "Indestructible")) return false;
  if (useShieldCounter(s, o, "it being destroyed")) return false;
  const name = defOf(s, o).name;
  if (!noRegen && (o.regenShields ?? 0) > 0) {
    o.regenShields! -= 1;
    o.damage = 0;
    o.deathtouchDamage = false;
    o.tapped = true;
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
  moveObject(s, o.id, "graveyard");
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
export function draw(s: GameState, pid: PlayerId, n = 1, after?: "drawStep"): boolean {
  for (let i = 0; i < n; i++) {
    const options = dredgeOptions(s, pid);
    if (options.length) {
      s.pending = { kind: "dredge", player: pid, options, left: n - i, ...(after ? { after } : {}) };
      return false;
    }
    if (!drawOne(s, pid)) break;
  }
  return true;
}

function drawOne(s: GameState, pid: PlayerId): boolean {
  const p = player(s, pid);
  const top = p.library[0];
  if (!top) {
    p.drewFromEmptyLibrary = true; // CR 704.5b
    return false;
  }
  moveObject(s, top, "hand");
  // Every card drawn is its own draw (CR 121.2), and counts toward "your second card each turn".
  p.draws = p.draws?.turn === s.turn ? { turn: s.turn, n: p.draws.n + 1 } : { turn: s.turn, n: 1 };
  fireEvent(s, { type: "draw", player: pid, nth: p.draws.n });
  return true;
}

/** Cards in `pid`'s graveyard whose dredge could replace their next draw: dredge N needs N cards in their library (CR 702.52a-b). */
export function dredgeOptions(s: GameState, pid: PlayerId): ObjectId[] {
  const p = player(s, pid);
  if (p.lost) return [];
  return p.graveyard.filter((id) => {
    const n = compileCard(defOf(s, obj(s, id))).dredge;
    return n !== undefined && p.library.length >= n;
  });
}

/**
 * Dredge instead of drawing (CR 702.52a): mill N, then return the card to hand; it isn't a draw. Or draw. Then the
 * rest of the draws, and whatever was drawing carries on.
 */
function chooseDredge(s: GameState, p: Player, id?: ObjectId) {
  const pend = s.pending;
  if (pend?.kind !== "dredge" || pend.player !== p.id) throw new RulesError("no draw to replace");
  if (id !== undefined && !pend.options.includes(id)) throw new RulesError("that card can't be dredged");
  s.pending = null;
  if (id !== undefined) {
    const n = compileCard(defOf(s, obj(s, id))).dredge!;
    const milled = p.library.slice(0, n);
    for (const c of milled) moveObject(s, c, "graveyard");
    moveObject(s, id, "hand");
    log(s, `${p.name} dredges ${nameOf(s, id)} instead of drawing, milling ${n} card${n === 1 ? "" : "s"}.`);
  } else drawOne(s, p.id);
  if (!draw(s, p.id, pend.left - 1, pend.after)) return;
  if (pend.after === "drawStep") fireEvent(s, { type: "step", step: "draw", active: s.activePlayer });
  else if (s.resolving) continueResolution(s);
}

// ---------------------------------------------------------------------------
// Turn structure (CR 500-514)

const STEP_ORDER: Step[] = [
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

function advanceStep(s: GameState): void {
  for (const p of s.players) {
    // Mana empties as each step ends (CR 500.4), except firebending's red until end of combat (702.189a). Red mana
    // spent is spent from the rest first, so what's kept is the red left, up to firebending's.
    const restrictedRed = (p.restrictedMana ?? []).reduce((n, r) => n + (r.mana === "R" ? r.n : 0), 0);
    const keep = p.combatMana && KEEPS_COMBAT_MANA.has(s.step) ? Math.min(p.combatMana, p.manaPool.R - restrictedRed) : 0;
    p.manaPool = emptyPool();
    p.restrictedMana = undefined;
    p.manaPool.R = keep;
    p.combatMana = keep || undefined;
  }
  if (s.step === "cleanup" && s.cleanupAgain) {
    s.cleanupAgain = undefined;
    return beginStep(s, "cleanup"); // CR 514.3a
  }
  if (s.step === "cleanup") return startNextTurn(s);
  // CR 511.3: as the end of combat step ends, everything is removed from combat. Provoke's requirement was for
  // this combat only (CR 702.39a).
  if (s.step === "endCombat") {
    for (const o of attackersAndBlockers(s)) clearCombat(o);
    for (const id of s.battlefield) obj(s, id).provokedBy = undefined;
  }
  const next = STEP_ORDER[STEP_ORDER.indexOf(s.step) + 1]!;
  beginStep(s, next);
}

function startNextTurn(s: GameState) {
  const prev = s.activePlayer;
  s.activePlayer = nextLivingAfter(s, s.activePlayer);
  // "Until your next turn" ends as that turn begins, or when it would have begun for a player who left (CR 800.4m).
  const order = s.turnOrder;
  const began = new Set<PlayerId>();
  for (let i = (order.indexOf(prev) + 1) % order.length; ; i = (i + 1) % order.length) {
    began.add(order[i]!);
    if (order[i] === s.activePlayer || began.size >= order.length) break;
  }
  endCopyEffects(s, (e) => typeof e.until === "object" && began.has(e.until.turnOf));
  const ending = s.effects.filter((e) => e.duration === "yourNextTurn" && e.turnOf !== undefined && began.has(e.turnOf));
  if (ending.length) {
    s.effects = s.effects.filter((e) => !ending.includes(e));
    invalidateCharacteristics(s);
  }
  releasePhased(s, began);
  s.turn++;
  for (const p of s.players) p.landsPlayedThisTurn = 0;
  for (const o of Object.values(s.objects)) o.activatedThisTurn = undefined; // "once each turn" (CR 602.5b)
  s.damagedThisTurn = undefined;
  s.spellsCastThisTurn = undefined;
  s.castThisTurn = undefined;
  s.nextCast = undefined;
  s.castItems = undefined;
  s.lastKnown = undefined;
  log(s, `— Turn ${s.turn}: ${player(s, s.activePlayer).name} —`);
  beginStep(s, "untap");
}

/** Enter a step, perform its turn-based actions, and give the active player priority if the step has priority. */
function beginStep(s: GameState, step: Step): void {
  s.step = step;
  s.passedInSuccession = [];
  s.priority = s.activePlayer;
  const ap = s.activePlayer;
  switch (step) {
    case "untap":
      untapStepPhasing(s, ap); // CR 502.1, 702.26a
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (controllerOf(s, o) !== ap) continue;
        if (o.skipNextUntap) o.skipNextUntap = undefined;
        else if (!characteristics(s, o).doesntUntap) untapPermanent(s, o); // CR 502.3
      }
      return advanceStep(s); // no priority in untap (CR 502.4)
    case "upkeep": {
      const p = player(s, ap);
      p.lastUpkeepTurn = p.upkeepTurn;
      p.upkeepTurn = s.turn;
      fireEvent(s, { type: "step", step: "upkeep", active: ap });
      break;
    }
    case "draw":
      if (!draw(s, ap, 1, "drawStep")) return; // CR 504.1 (no one skips in multiplayer, CR 103.8c); dredge may replace it
      fireEvent(s, { type: "step", step: "draw", active: ap }); // "at the beginning of the draw step" triggers after it (CR 504.2)
      break;
    case "end":
      fireEvent(s, { type: "step", step: "end", active: ap });
      break;
    case "declareAttackers":
      if (potentialAttackers(s, ap).length === 0 || opponents(s, ap).length === 0) return beginStep(s, "endCombat");
      s.pending = { kind: "declareAttackers", player: ap };
      return;
    case "declareBlockers": {
      const attacked = livingPlayers(s).filter((pid) => attackers(s).some((a) => a.attacking === pid));
      const order = turnOrderFrom(s, ap).filter((pid) => attacked.includes(pid));
      if (order.length) {
        s.pending = { kind: "declareBlockers", player: order[0]!, remaining: order.slice(1) };
        return;
      }
      break;
    }
    case "firstStrikeDamage":
      if (!attackersAndBlockers(s).some((o) => hasFirstOrDouble(s, o))) return beginStep(s, "combatDamage");
      if (askUnblocked(s)) return;
      dealCombatDamage(s, true);
      break;
    case "combatDamage":
      if (askUnblocked(s)) return;
      dealCombatDamage(s, false);
      break;
    case "beginCombat":
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
      if (p.hand.length > MAX_HAND_SIZE && !hasNoMaxHandSize(s, ap)) {
        s.pending = { kind: "discardToHandSize", player: ap, count: p.hand.length - MAX_HAND_SIZE };
        return;
      }
      finishCleanup(s);
      return;
    }
  }
  runStateBasedActions(s);
}

/** "You have no maximum hand size" on a permanent the player controls (CR 402.2, 514.1). */
export const hasNoMaxHandSize = (s: GameState, pid: PlayerId) =>
  s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).noMaxHandSize);

function finishCleanup(s: GameState) {
  s.effects = s.effects.filter((e) => e.duration !== "endOfTurn"); // CR 514.2
  endCopyEffects(s, (e) => e.until === "endOfTurn");
  invalidateCharacteristics(s);
  for (const id of [...s.battlefield, ...(s.phasedOut ?? [])]) {
    const o = obj(s, id);
    o.damage = 0; // CR 514.2, phased-out permanents too
    o.damagedBy = undefined;
    o.deathtouchDamage = false;
    o.regenShields = undefined; // "this turn" effects end
    o.preventNext = undefined;
  }
  for (const p of s.players) p.preventNext = undefined;
  s.preventCombatDamage = undefined;
  // "You may play that card this turn" / "until the end of your next turn" ends now.
  for (const q of s.players)
    for (const id of q.exile) {
      const m = obj(s, id).mayPlay;
      if (m && (m.until === "thisTurn" || (m.until === "nextTurn" && s.activePlayer === m.player && s.turn > m.turn))) obj(s, id).mayPlay = undefined;
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

function turnOrderFrom(s: GameState, pid: PlayerId): PlayerId[] {
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
    if (item.ifCond && item.sourceId && !staticConditionNow(s, item.ifCond, item.sourceId, item.controller, item.event?.player)) {
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
  if (isPermanentCard(d)) {
    const enchant = compileCard(d).enchant;
    if (enchant) {
      // An Aura spell's target is checked on resolution like any other (CR 608.2b); it enters attached to it (CR 303.4f).
      const t = item.targets?.[0];
      const legal = !!t && t.kind === "object" && isLegalTarget(s, enchant, t, item.controller, d);
      if (legal) {
        log(s, `${d.name} resolves and enters attached to ${nameOf(s, t.id)}.`);
        moveObject(s, o.id, "battlefield", { controller: item.controller, attachTo: t.id });
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
    log(s, `${d.name} resolves and enters the battlefield.`);
    moveObject(s, o.id, "battlefield", { controller: item.controller, ...(item.x ? { x: item.x } : {}) });
    if (o.zone === "battlefield" && o.castAlt === "dash") dashed(s, o, item.controller);
    if (o.zone === "battlefield" && o.castAlt === "blitz") blitzed(s, o, item.controller);
    if (o.zone === "battlefield" && o.castAlt === "warp") warped(s, o, item.controller);
    return;
  }
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
  return s.stack.some((x) => x.kind === "spell" && !!x.objectId && !!s.objects[x.objectId] && objHasKeyword(s, s.objects[x.objectId]!, "Split second"));
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

/** Ascend on permanents (CR 702.131b) isn't a triggered ability: it applies any time its condition is true. */
export function checkAscend(s: GameState) {
  for (const p of s.players) giveCitysBlessing(s, p.id);
}

/** "Until the end of your next turn, you may play that card": `pid` may play this exiled card now. */
export function mayPlayFromExile(s: GameState, o: GameObject, pid: PlayerId): boolean {
  if (o.zone !== "exile" || o.mayPlay?.player !== pid || o.mayPlay.zc !== (o.zoneChanges ?? 0)) return false;
  // A warped or plotted card: only on a later turn (CR 702.185a, 702.170d), and only cast, not played as a land.
  return !castOnlyFromExile(o) || (s.turn > o.mayPlay.turn && !isType(defOf(s, o), "Land"));
}

/** A warped or plotted card in exile, which its owner may cast on a later turn (CR 702.185a, 702.170d). */
const castOnlyFromExile = (o: GameObject) => o.mayPlay?.until === "warp" || o.mayPlay?.until === "plot";

/** A plotted card `pid` may cast now, without paying its mana cost (CR 702.170d). */
export function plottedCast(s: GameState, pid: PlayerId, o: GameObject): boolean {
  return o.mayPlay?.until === "plot" && mayPlayFromExile(s, o, pid);
}

/**
 * A land card in `pid`'s own graveyard that "you may play lands from your graveyard" lets them play (Crucible of Worlds).
 * Playing it is still their land play for the turn, with the usual timing (CR 305.1-2).
 */
export function mayPlayLandFromGraveyard(s: GameState, o: GameObject, pid: PlayerId): boolean {
  if (o.zone !== "graveyard" || o.owner !== pid || !isType(defOf(s, o), "Land")) return false;
  return s.battlefield.some((id) => controllerOf(s, obj(s, id)) === pid && abilitiesOf(s, obj(s, id)).landsFromGraveyard);
}

/** One land a turn, plus one for each "you may play an additional land on each of your turns" (CR 305.2, 305.2a). */
export function landsAllowed(s: GameState, pid: PlayerId): number {
  let n = 1;
  if (s.activePlayer === pid) for (const id of s.battlefield) if (controllerOf(s, obj(s, id)) === pid) n += abilitiesOf(s, obj(s, id)).extraLands ?? 0;
  return n;
}

function playLand(s: GameState, p: Player, id: ObjectId, untapped?: boolean) {
  const o = obj(s, id);
  const d = defOf(s, o);
  if (!((o.zone === "hand" && o.owner === p.id) || mayPlayFromExile(s, o, p.id) || mayPlayLandFromGraveyard(s, o, p.id))) throw new RulesError("land must be in your hand");
  if (!isType(d, "Land")) throw new RulesError(`${d.name} is not a land`);
  if (!canActAtSorcerySpeed(s, p.id)) throw new RulesError("lands can only be played at sorcery speed");
  if (p.landsPlayedThisTurn >= landsAllowed(s, p.id)) throw new RulesError("already played a land this turn"); // CR 305.2
  const choice = compileCard(d).entersTappedChoice;
  if (untapped && !canEnterUntapped(s, p.id, id))
    throw new RulesError(choice?.kind === "payLife" ? `you can't pay ${choice.n} life` : choice ? `you have no ${choice.filter.text} to reveal` : `${d.name} has no choice to make as it enters`);
  p.landsPlayedThisTurn++;
  if (untapped && choice?.kind === "payLife") {
    loseLife(s, p.id, choice.n);
    log(s, `${p.name} pays ${choice.n} life so ${d.name} enters untapped.`);
  } else if (untapped && choice?.kind === "reveal") {
    const shown = p.hand.find((x) => x !== id && printedMatches(choice.filter, defOf(s, obj(s, x))))!;
    log(s, `${p.name} reveals ${nameOf(s, shown)} so ${d.name} enters untapped.`);
  }
  const from = o.zone === "exile" || o.zone === "graveyard" ? ` from ${o.zone === "exile" ? "exile" : "their graveyard"}` : "";
  moveObject(s, id, "battlefield", { untapped });
  log(s, `${p.name} plays ${d.name}${from}${obj(s, id).tapped ? " (tapped)" : ""}.`);
}

/** "Remove N counters from ~" paid as a cost (CR 602.2b); removing the last time counter triggers vanishing. */
function removeCountersCost(s: GameState, o: GameObject, rc: { counter: string; n: number }) {
  const left = (o.counters[rc.counter] ?? 0) - rc.n;
  o.counters[rc.counter] = left;
  if (left === 0 && rc.counter === "time") fireEvent(s, { type: "lastCounterRemoved", id: o.id, counter: "time" });
}

export function isSummoningSick(s: GameState, o: GameObject) {
  return o.controlledSinceTurn >= s.turn && !objHasKeyword(s, o, "Haste");
}

function activateMana(s: GameState, p: Player, id: ObjectId, mana: ManaType, index?: number, tap?: ObjectId[], extra: ManaType[] = []) {
  const o = obj(s, id);
  const name = characteristics(s, o).name;
  const i = index ?? pickManaAbility(s, p.id, o, mana);
  if (i === undefined) throw new RulesError(`${name} can't produce {${mana}} right now`);
  const ab = manaAbilitiesOn(s, o)[i]!;
  const problem = manaAbilityProblem(s, p.id, o, i, false, tap ?? (ab?.tapCost ? [] : undefined));
  if (problem) throw new RulesError(problem);
  if (!manaChoices(s, o, ab).includes(mana)) throw new RulesError(`${name} can't produce {${mana}}`);
  // What it makes is worked out before the costs change anything ("for each creature you control").
  const adds = manaProduced(s, o, ab, mana);
  // The triggered mana abilities tapping it triggers (CR 605.1b), with the player's picks for their mana.
  const triggered = manaTriggerResults(s, p.id, o, ab, adds);
  const picked = triggered.find((r) => r.extra.length === extra.length && r.extra.every((m, i) => m === extra[i]));
  if (!picked) throw new RulesError(triggered.length > 1 ? `choose the mana that tapping ${name} also adds` : `${name} adds no other mana to choose`);
  const src = objectSource(s, o);
  // Pay the costs (CR 602.2b, 605.3a), then add the mana.
  if (ab.manaCost) spendFromPool(s, p.id, parseManaCost(ab.manaCost), { ability: o });
  if (ab.tap) o.tapped = true;
  for (const t of tap ?? []) obj(s, t).tapped = true;
  if (tap?.length) log(s, `${p.name} taps ${tap.map((t) => nameOf(s, t)).join(", ")} for ${name}'s mana ability.`);
  if (ab.lifeCost) loseLife(s, p.id, ab.lifeCost);
  if (ab.energyCost) p.energy = (p.energy ?? 0) - ab.energyCost;
  if (ab.removeCounters) removeCountersCost(s, o, ab.removeCounters);
  if (ab.oncePerTurn) (o.activatedThisTurn ??= []).push(MANA_ABILITY_OFFSET + i);
  if (ab.sacrificeSelf) {
    log(s, `${p.name} sacrifices ${name} for mana.`);
    moveObject(s, id, "graveyard");
  }
  addMana(s, p.id, adds, ab.spendOnly);
  // Right after it, without the stack (CR 605.4a), and without the riders of its mana (rulings on Mana Flare).
  addMana(s, p.id, picked.adds);
  if (ab.skipNextUntap && o.zone === "battlefield") o.skipNextUntap = true;
  if (ab.selfDamage && dealDamage(s, src, { player: p.id }, ab.selfDamage) && o.zone === "battlefield") fireEvent(s, { type: "dealtDamage", id: o.id, amount: ab.selfDamage, combat: false });
}

export function commanderTax(p: Player, o: GameObject) {
  return 2 * (p.commanderCasts[o.id] ?? 0); // CR 903.8
}

/**
 * Why `pid` can't cast this card right now, or null if they can (with the mana already in their pool).
 * Without `targets`, only checks that legal targets exist; for a modal spell, without `modes`
 * only checks that some mode can be chosen (CR 700.2a).
 */
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
  const via = graveyardCast(d, choices?.via);
  if (choices?.via && !via) return `${d.name} doesn't have ${describeVia(choices.via)}`;
  if (!free && via && (o.zone !== "graveyard" || o.owner !== pid)) return `${describeVia(via.kind)} works only from your graveyard`;
  // Flashback and jump-start only if the resulting spell is an instant or sorcery (CR 702.34a, 702.133a).
  if (via && (via.kind === "flashback" || via.kind === "jumpStart") && !isType(d, "Instant") && !isType(d, "Sorcery")) return `${d.name} isn't an instant or sorcery`;
  if (!free && !via && !mayPlayFromExile(s, o, pid) && (!(o.zone === "hand" || (fromCommand && o.isCommander)) || o.owner !== pid))
    return o.zone === "graveyard" && compileCard(d).fromGraveyard?.length ? `choose how to cast ${d.name} from your graveyard` : "you can only cast spells from your hand or your commander";
  if (choices?.buyback && !compileCard(d).buyback) return `${d.name} doesn't have buyback`;
  if (choices?.alt) {
    if (choices.alt === "madness") return "madness is cast as its ability resolves";
    if (!altCost(d, choices.alt)) return `${d.name} doesn't have ${choices.alt}`;
    // Only one alternative cost can be applied to a spell (CR 118.9a).
    if (via || free || plotted) return `${d.name} can't be cast for its ${choices.alt} cost this way`;
    if (choices.alt === "warp" && o.zone !== "hand") return "warp works only from your hand"; // CR 702.185a
  }
  if (isType(d, "Land")) return "lands are played, not cast";
  const limit = castLimitProblem(s, pid, d);
  if (limit) return limit;
  // A card with no mana cost can't be cast by paying it (CR 118.6, 202.1b): only for an alternative cost or free.
  if (!d.manaCost && !free && !plotted && !choices?.alt && !choices?.faceDown && !via?.mana) return `${d.name} has no mana cost and can't be cast this way`;
  // Also a spell cast as an ability resolves, like cascade's (split second rulings).
  if (splitSecondOnStack(s)) return "a spell with split second is on the stack";
  if (!free && (s.priority !== pid || s.pending)) return "you don't have priority";
  const instantSpeed = isType(d, "Instant") || d.keywords.includes("Flash") || !!compileCard(d).flashSacrifice;
  if (!free && !instantSpeed && !canActAtSorcerySpeed(s, pid)) return `${d.name} can only be cast at sorcery speed`;
  // A plotted card is cast during its owner's main phase while the stack is empty, whatever its type (CR 702.170d).
  if (plotted && !canActAtSorcerySpeed(s, pid)) return `a plotted card can only be cast at sorcery speed`;
  const spell = compileCard(d).spell;
  if (spell?.modal) {
    if (modes === undefined) {
      if (!canChooseModes(s, spell, pid, d)) return `${d.name} has no mode that can be chosen`;
    } else {
      const mp = modesProblem(s, spell, modes, pid, d);
      if (mp) return mp;
    }
  }
  const specs = spellTargetSpecs(d, modes);
  if (specs.length) {
    // A spell's colors are its card's (CR 702.16b: protection stops spells of that color).
    const tp = targets ? targetProblem(s, specs, targets, pid, d) : hasLegalTargetsFor(s, specs, pid, d) ? null : `${d.name} has no legal targets`;
    if (tp) return tp;
  }
  const tax = fromCommand ? commanderTax(p, o) : 0;
  const xp = xProblem(parseManaCost(d.manaCost), x);
  if (xp) return xp;
  // Cast without paying its mana cost, the only choice for X is 0 (CR 107.3b).
  if ((free || plotted) && !madness && x) return "X is 0 when a spell is cast without paying its mana cost";
  if (madness && x && !parseManaCost(madness).hasX) return "X is 0 unless the cost you pay has {X}";
  const kp = kickProblem(d, choices?.kicks);
  if (kp) return kp;
  if (via && x && via.mana && !parseManaCost(via.mana).hasX) return "X is 0 unless the cost you pay has {X}";
  const ap = additionalCostProblem(s, pid, o, choices);
  if (ap) return ap;
  const cp = casualtyProblem(s, pid, d, choices);
  if (cp) return cp;
  const cost = costToPay(s, pid, o, convoke, improvise, x, choices?.kicks, { ...choices, targets });
  if (typeof cost === "string") return cost;
  // The helper's mana is spent on the spell's total cost (CR 702.132a), so restrictions see that spell (CR 106.6).
  if (choices?.assisted && (choices.assist === undefined || !canPayFromPool(s, choices.assist, parseManaCost(`{${choices.assisted}}`), { spell: d })))
    return "the assisting player can't pay that much";
  if (!canPayFromPool(s, pid, cost.cost, { spell: d }, cost.extra, p.life)) return `not enough mana for ${d.name}${tax ? ` (commander tax ${tax})` : ""}`;
  return null;
}

/**
 * The total cost of casting this card (CR 601.2f): its mana cost, plus commander tax (CR 903.8) as
 * extra generic mana, minus cost reductions like affinity (CR 702.41a), which only reduce generic mana.
 */
export function spellCost(s: GameState, pid: PlayerId, o: GameObject, x = 0, kicks: number[] = [], how: Pick<CostChoices, "via" | "buyback" | "alt" | "faceDown"> & { targets?: TargetChoice[] } = {}): { cost: ParsedCost; extra: number } {
  // Face down, it's a 2/2 with no abilities that costs {3} to cast (CR 702.37c).
  const d = how.faceDown ? FACE_DOWN : defOf(s, o);
  // Kicker and buyback costs are additional costs, added to the total (CR 702.33a, 702.27a, 601.2f).
  const kicker = compileCard(d).kicker;
  const kickCost = kicks.map((i) => kicker?.costs[i] ?? "").join("") + (how.buyback ? (compileCard(d).buyback ?? "") : "");
  // Cost increases and reductions from permanents (CR 601.2f), worked out for what's cast.
  const mods = costModsFor(s, pid, o, d, x);
  // "Spells your opponents cast that target ~ cost {2} more": each such permanent once, however often it's targeted.
  for (const id of new Set((how.targets ?? []).flatMap((t) => (t.kind === "object" ? [t.id] : [])))) {
    const t = s.objects[id];
    if (t?.zone === "battlefield" && controllerOf(s, t) !== pid) mods.more += abilitiesOf(s, t).targetTax ?? 0;
  }
  // "Without paying its mana cost": additional costs like kicker are still paid, and so are cost
  // increases (CR 118.9d, 601.2f).
  const madness = madnessCastOf(s, pid, o.id);
  if ((freeCastOf(s, pid) === o.id && !madness) || (!how.faceDown && !how.alt && plottedCast(s, pid, o))) return { cost: parseManaCost(kickCost), extra: Math.max(0, mods.more - mods.less) };
  const tax = o.zone === "command" ? commanderTax(player(s, pid), o) : 0;
  // {X} is generic mana, paid once for each {X} (CR 107.4b); reductions can take it down too (CR 601.2f).
  // Flashback and escape pay their cost instead of the mana cost (an alternative cost, CR 118.9).
  // So do evoke, dash, bestow and madness (CR 702.74a, 702.109a, 702.103a, 702.35a).
  const base = how.faceDown ? "{3}" : (madness ?? graveyardCast(d, how.via)?.mana ?? altCost(d, how.alt)?.mana ?? d.manaCost);
  const mana = parseManaCost(base + kickCost);
  const total = splitGeneric(mana, tax + x * xCount(mana));
  let less = mods.less;
  for (const a of compileCard(d).costLess ?? []) less += Math.max(0, evalAmount(s, a, { controller: pid, sourceId: o.id }));
  for (const c of compileCard(d).costLessIf ?? []) if (staticConditionNow(s, c.cond, o.id, pid)) less += c.n;
  // "Costs {3} less to cast if it targets a tapped creature": the targets are chosen before the cost is (CR 601.2c, 601.2f).
  for (const c of compileCard(d).costLessIfTargets ?? [])
    if (how.targets?.some((t) => t.kind === "object" && s.objects[t.id]?.zone === "battlefield" && objectMatches(s, c.filter, obj(s, t.id), pid, false))) less += c.n;
  // Increases first, then reductions, which only take off generic mana (CR 601.2f, 118.7a).
  return { cost: total.cost, extra: Math.max(0, total.extra + mods.more - less) };
}

/**
 * What permanents' static abilities add to and take off a spell's cost as `pid` casts it: "Creature
 * spells you cast cost {1} less", "Noncreature spells cost {1} more" (CR 601.2f). The spell is checked
 * as it will be on the stack, X included in its mana value (CR 202.3e).
 */
function costModsFor(s: GameState, pid: PlayerId, o: GameObject, d: CardDef, x: number): { more: number; less: number } {
  let [more, less] = [0, 0];
  const mv = manaValue(parseManaCost(d.manaCost)) + x * xCount(parseManaCost(d.manaCost));
  for (const id of s.battlefield) {
    const src = obj(s, id);
    const mods = compileCard(defOf(s, src)).costMods;
    if (!mods) continue;
    const c = characteristics(s, src);
    if (!c.hasPrintedAbilities) continue;
    for (const m of mods) {
      if (m.who === "you" ? pid !== c.controller : m.who === "opponents" ? pid === c.controller : false) continue;
      if (m.turn && (s.activePlayer === c.controller) !== (m.turn === "yours")) continue;
      if (m.fromGraveyard && o.zone !== "graveyard") continue;
      const { manaValue: range, ...rest } = m.filter;
      if (!printedMatches(rest, d)) continue;
      if (range && !((range.min === undefined || mv >= range.min) && (range.max === undefined || mv <= range.max))) continue;
      if (m.n > 0) more += m.n;
      else less -= m.n;
    }
  }
  return { more, less };
}

/**
 * What's left to pay for casting this card after any convoke creatures (CR 702.51) and improvise
 * artifacts (CR 702.126), as a cost plus extra generic mana. A string says why they can't be used.
 */
function costToPay(s: GameState, pid: PlayerId, o: GameObject, convoke?: ObjectId[], improvise?: ObjectId[], x?: number, kicks?: number[], how: CostChoices & { targets?: TargetChoice[] } = {}): { cost: ParsedCost; extra: number } | string {
  const d = defOf(s, o);
  let { cost, extra } = spellCost(s, pid, o, x, kicks, how);
  if (convoke?.length) {
    if (!compileCard(d).convoke) return `${d.name} doesn't have convoke`;
    const problem = convokeProblem(s, pid, convoke);
    if (problem) return problem;
    const reduced = convokeReduce(cost, extra, convoke.map((c) => characteristics(s, obj(s, c)).colors));
    if (!reduced) return `that's more creatures than ${d.name}'s cost has mana for`;
    [cost, extra] = [reduced, 0];
  }
  if (improvise?.length) {
    if (!compileCard(d).improvise) return `${d.name} doesn't have improvise`;
    const problem = improviseProblem(s, pid, improvise, convoke ?? []);
    if (problem) return problem;
    const reduced = payGenericWith(cost, extra, improvise.length);
    if (!reduced) return `that's more artifacts than ${d.name}'s cost has generic mana for`;
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
    if (!compileCard(d).delve) return `${d.name} doesn't have delve`;
    const problem = delveProblem(s, pid, o, how.delve, how.exileCards ?? []);
    if (problem) return problem;
    const reduced = payGenericWith(cost, extra, how.delve.length);
    if (!reduced) return `that's more cards than ${d.name}'s cost has generic mana for`;
    ({ cost, extra } = reduced);
  }
  return { cost, extra };
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
  if (!compileCard(defOf(s, o)).delve) return 0;
  const { cost, extra } = spellCost(s, pid, o, x, choices.kicks, choices);
  const generic = splitGeneric(cost, extra).extra;
  const pool = player(s, pid).graveyard.filter((c) => c !== id && !choices.exileCards?.includes(c)).length;
  return Math.min(generic, pool);
}

/** The card's evoke or dash cost, if it has that one. */
export function altCost(d: CardDef, alt?: AltCostKind) {
  return alt ? compileCard(d).altCosts?.find((a) => a.kind === alt) : undefined;
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
  }
  return null;
}
const convokeProblem = (s: GameState, pid: PlayerId, ids: ObjectId[]) => tapCreaturesProblem(s, pid, ids, "convoke");

/** Target specs a card needs when cast (empty for most permanents). For a modal spell, those of the chosen modes. */
export const spellTargets = (s: GameState, id: ObjectId, modes?: number[], alt?: AltCostKind) => spellTargetSpecs(castDef(s, id, alt), modes);

/** What casting this card puts on the stack: the card, or for a bestowed cast, the Aura it is then (CR 702.103b, d). */
export const castDef = (s: GameState, id: ObjectId, alt?: AltCostKind): CardDef => (alt === "bestow" ? bestowedDef(defOf(s, obj(s, id))) : defOf(s, obj(s, id)));

/** A modal spell's choices, if this card is one (CR 700.2). */
export const spellModes = (s: GameState, id: ObjectId) => compileCard(defOf(s, obj(s, id))).spell?.modal;

function castSpell(s: GameState, p: Player, id: ObjectId, targets?: TargetChoice[], modes?: number[], convoke?: ObjectId[], improvise?: ObjectId[], x?: number, choices: CostChoices = {}) {
  const o = obj(s, id);
  if (choices.faceDown && !o.faceDown) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.faceDown = compileCard(defOf(s, o)).faceDownCast!.kind; // turned face down before it's put on the stack (CR 708.4)
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
  const specs = spellTargets(s, id, modes);
  const problem = castProblem(s, p.id, id, specs.length ? (targets ?? []) : undefined, spell?.modal ? modes : undefined, convoke, improvise, x, choices);
  if (problem) throw new RulesError(problem);
  const body = spell ? withModes(spell, modes) : undefined;
  const fromCommand = o.zone === "command";
  const tax = fromCommand ? commanderTax(p, o) : 0;
  // The total cost is locked in, then paid (CR 601.2f-h): convoke creatures are tapped as part of paying it.
  const cost = costToPay(s, p.id, o, convoke, improvise, x, choices.kicks, { ...choices, targets }) as { cost: ParsedCost; extra: number };
  const sunburst = !!compileCard(d).countsColors;
  // "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, ...": only
  // when cast with that permission, not free or for madness during a resolution (Armor of Thorns ruling).
  const flashSacrifice = !!compileCard(d).flashSacrifice && !madness && !suspended && freeCastOf(s, p.id) !== id && !isType(d, "Instant") && !d.keywords.includes("Flash") && !canActAtSorcerySpeed(s, p.id);
  // Mana that can only be spent on spells like this one can pay any part of its total cost (CR 106.6).
  const paid = spendFromPool(s, p.id, cost.cost, { spell: d }, cost.extra, p.life, { spreadColors: sunburst })!;
  // Sunburst counts the colors of mana spent on its total cost, additional and alternative costs included (CR 702.44b).
  const colorsSpent = COLORS.filter((c) => paid.spent[c] > 0);
  loseLife(s, p.id, paid.lifePaid);
  if (choices.assisted && choices.assist !== undefined) {
    const helper = player(s, choices.assist);
    spendFromPool(s, helper.id, parseManaCost(`{${choices.assisted}}`), { spell: d });
    log(s, `${helper.name} pays {${choices.assisted}} of ${d.name}'s cost (assist).`);
  }
  for (const c of [...(convoke ?? []), ...(improvise ?? [])]) obj(s, c).tapped = true;
  const kicks = choices.kicks?.length ? [...choices.kicks].sort() : undefined;
  o.kicked = kicks;
  o.colorsSpent = colorsSpent.length ? colorsSpent : undefined;
  if (fromCommand) p.commanderCasts[o.id] = (p.commanderCasts[o.id] ?? 0) + 1;
  const castFrom = o.zone;
  const via = graveyardCast(d, choices.via);
  const from = zoneList(s, o)!;
  from.splice(from.indexOf(id), 1);
  o.zone = "stack";
  o.castFrom = castFrom;
  o.castVia = via?.kind;
  o.buyback = choices.buyback || undefined;
  o.castAlt = madness ? "madness" : choices.alt;
  // A creature spell cast with suspend gains haste until its caster loses control of it (CR 702.62a).
  if (suspended && isType(d, "Creature")) o.suspendHaste = p.id;
  if (via?.exile) o.exileIfLeaves = "stack"; // CR 702.34a, 702.133a
  o.controller = p.id;
  o.timestamp = s.nextTimestamp++;
  const chosen = spell?.modal ? modes : undefined;
  const free = freeCastOf(s, p.id) === id && !madness;
  // X is announced as it's cast (CR 601.2b) and is part of the spell while it's on the stack (CR 107.3a).
  const hasX = parseManaCost(d.manaCost).hasX;
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
  });
  const item = s.stack[s.stack.length - 1]!;
  const stackId = item.id;
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
  const kickText = kicks ? describeKicks(d, kicks) : "";
  const howText =
    (via ? ` from their graveyard (${describeVia(via.kind)})` : castFrom === "exile" ? " from exile" : "") +
    (choices.alt === "bestow" ? " bestowed" : choices.alt ? ` for its ${choices.alt} cost` : "") +
    (madness ? " for its madness cost" : "") +
    (choices.buyback ? ", paying buyback" : "") +
    (choices.delve?.length ? `, exiling ${choices.delve.map((c) => nameOf(s, c)).join(", ")} from their graveyard (delve)` : "");
  if (o.faceDown) log(s, `${p.name} casts a face-down creature spell (${o.faceDown})${tax ? ` (commander tax ${tax})` : ""}.`);
  else log(s, `${p.name} casts ${d.name}${howText}${hasX ? ` with X=${x ?? 0}` : ""}${kickText}${free ? " without paying its mana cost" : ""}${tax ? ` (commander tax ${tax})` : ""}${chosen ? ` choosing "${body!.text.replace(/~/g, d.name).replace(/\.$/, "")}"` : ""}${describeTargets(s, targets)}${convoked}.`);
  for (const c of choices.delve ?? []) moveObject(s, c, "exile"); // CR 702.66a
  // Additional costs are paid with the mana (CR 601.2h); what they did is known to the spell.
  const sacrificed = payAdditionalCosts(s, p, d, choices, [...(via?.costs ?? []), ...(altCost(d, choices.alt)?.costs ?? [])]);
  if (sacrificed.length) item.sacrificed = sacrificed;
  // Casualty: "you may sacrifice a creature with power N or greater" (CR 702.153a).
  if (choices.casualty) {
    log(s, `${p.name} sacrifices ${nameOf(s, choices.casualty)} (casualty).`);
    moveObject(s, choices.casualty, "graveyard");
    item.casualty = true;
  }
  // Storm counts the spells cast before it (CR 702.40a); a copy of it made later copies it as it was cast (707.10).
  item.castNth = s.spellsCastThisTurn ?? 0;
  s.spellsCastThisTurn = item.castNth + 1;
  s.cards[d.oracleId] ??= d;
  (s.castThisTurn ??= []).push({ player: p.id, card: d.oracleId });
  (s.castItems ??= {})[stackId] = structuredClone(item);
  // Once it's cast, "whenever you cast" and "becomes the target" abilities trigger (CR 601.2i).
  fireEvent(s, { type: "cast", stackId, controller: p.id, card: d });
  fireEvent(s, { type: "targeted", stackId });
}

/** "Each player can't cast more than one spell each turn" and the like: a "can't" that wins over any "can" (CR 101.2). */
function castLimitProblem(s: GameState, pid: PlayerId, d: CardDef): string | null {
  for (const id of s.battlefield) {
    const o = obj(s, id);
    for (const l of abilitiesOf(s, o).castLimits ?? []) {
      if (l.who === "you" && controllerOf(s, o) !== pid) continue;
      if (l.filter && !printedMatches(l.filter, d)) continue;
      if ((s.castThisTurn ?? []).some((c) => c.player === pid && (!l.filter || printedMatches(l.filter, s.cards[c.card]!))))
        return `${characteristics(s, o).name}: ${l.text.replace(/~/g, characteristics(s, o).name).replace(/\.$/, "")}`;
    }
  }
  return null;
}

/** The card's way of being cast from a graveyard of this kind, if it has one. */
export function graveyardCast(d: CardDef, via?: CastFromGraveyardKind): CastFromGraveyard | undefined {
  return via ? compileCard(d).fromGraveyard?.find((g) => g.kind === via) : undefined;
}

export function describeVia(via: CastFromGraveyardKind | FaceDownKind): string {
  return via === "jumpStart" ? "jump-start" : via;
}

/** ", kicked", ", kicked twice", ", kicked with {1}{U}", for the log. */
function describeKicks(d: CardDef, kicks: number[]): string {
  const k = compileCard(d).kicker!;
  const times = kicks.length === 1 ? "" : kicks.length === 2 ? " twice" : ` ${kicks.length} times`;
  const name = kickerName(k);
  if (name !== "kicker" && name !== "multikicker") return `, paying its ${name} cost${times}`;
  if (k.multi || k.costs.length === 1) return kicks.length === 1 ? ", kicked" : `, kicked${times}`;
  return `, kicked with ${kicks.map((i) => k.costs[i]).join(" and ")}`;
}

/** Why these kicker choices aren't allowed (CR 702.33): each kicker cost once, multikicker's any number of times. */
function kickProblem(d: CardDef, kicks?: number[]): string | null {
  if (!kicks?.length) return null;
  const k = compileCard(d).kicker;
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
    return controllerOf(s, o) === pid && objIsType(s, o, "Creature") && power(s, o) >= n;
  });
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
function additionalCostProblem(s: GameState, pid: PlayerId, o: GameObject, choices?: CostChoices): string | null {
  const d = defOf(s, o);
  return extraCostProblem(s, pid, o, castExtraCosts(d, choices), choices, `cast ${d.name}`);
}

/** The costs beyond mana of casting it this way: additional costs, and those of a graveyard or alternative cost (CR 601.2f-h). */
export function castExtraCosts(d: CardDef, choices?: Pick<CostChoices, "via" | "alt">): AdditionalCost[] {
  return [...(compileCard(d).additionalCosts ?? []), ...(graveyardCast(d, choices?.via)?.costs ?? []), ...(altCost(d, choices?.alt)?.costs ?? [])];
}

/**
 * Can these costs beyond mana be paid, for a spell (`o` is the card being cast) or an ability (`o` is its
 * source)? Without choices, just whether they could be. `doing`: "cast X", "activate X's ability".
 */
function extraCostProblem(s: GameState, pid: PlayerId, o: GameObject, costs: AdditionalCost[], choices: CostChoices | undefined, doing: string): string | null {
  const d = defOf(s, o);
  const p = player(s, pid);
  const given = (k: "sacrifice" | "discard" | "exileCards" | "returnToHand" | "tap") => choices?.[k];
  for (const k of ["sacrifice", "discard", "exileCards", "returnToHand", "tap"] as const)
    if (given(k)?.length && !costs.some((c) => c.kind === (k === "exileCards" ? "exileFromGraveyard" : k))) return `${d.name} doesn't ask you to ${k === "exileCards" ? "exile cards" : k === "returnToHand" ? "return a permanent to hand" : k === "tap" ? "tap permanents" : k}`;
  const both = [...(choices?.tap ?? []), ...(choices?.sacrifice ?? [])];
  if (new Set(both).size !== both.length) return "one permanent can't pay two costs";
  for (const c of costs) {
    if (c.kind === "payLife") {
      if (p.life < c.n) return `you can't pay ${c.n} life`; // CR 119.4
      continue;
    }
    const pool =
      c.kind === "sacrifice"
        ? s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !(c.other && id === o.id) && objectMatches(s, c.filter, obj(s, id), pid, false))
        : c.kind === "tap"
          ? tapCostCandidates(s, pid, o, c)
        : c.kind === "returnToHand"
          ? returnCandidates(s, pid, c)
          : c.kind === "discard"
          ? p.hand.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))) // it's on the stack by the time costs are paid (CR 601.2a)
          : p.graveyard.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))); // "other cards" for escape
    const what =
      c.kind === "sacrifice"
        ? `${c.n === 1 ? (c.other ? "another" : "a") : c.n} ${c.filter.text}`
        : c.kind === "tap"
        ? `${c.n === 1 ? (/^[aeiou]/i.test(c.filter.text) ? "an" : "a") : c.n} ${c.filter.text}`
        : c.kind === "discard"
          ? c.filter
            ? `${c.n === 1 ? "a" : c.n} ${c.filter.text}`
            : `${c.n === 1 ? "a card" : `${c.n} cards`}`
          : `${c.n === 1 ? (/^[aeiou]/i.test(c.filter?.text ?? "card") ? "an" : "a") : c.n} ${c.filter?.text ?? "card"}`;
    const verb = c.kind === "sacrifice" ? "sacrifice" : c.kind === "discard" ? "discard" : c.kind === "returnToHand" ? "return" : c.kind === "tap" ? "tap" : "exile";
    const chosen = given(c.kind === "exileFromGraveyard" ? "exileCards" : c.kind);
    if (!chosen) {
      if (pool.length < c.n) return `you need to ${verb} ${what} to ${doing}`;
      continue;
    }
    if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id))) return `choose ${what} to ${verb}`;
  }
  return null;
}

/**
 * What can be tapped for "Tap an untapped creature you control": untapped ones you control, summoning sick or not
 * (CR 302.6 restricts only {T} and {Q}). Not the source when the ability's {T} taps it already.
 */
export function tapCostCandidates(s: GameState, pid: PlayerId, source: GameObject, c: Extract<AdditionalCost, { kind: "tap" }>): ObjectId[] {
  return s.battlefield.filter((id) => {
    const x = obj(s, id);
    return !x.tapped && controllerOf(s, x) === pid && !(c.other && id === source.id) && objectMatches(s, c.filter, x, pid, false);
  });
}

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

/** Pay a spell's additional costs; returns what was sacrificed as it last existed. */
function payAdditionalCosts(s: GameState, p: Player, d: CardDef, choices: CostChoices, more: AdditionalCost[] = []) {
  return payExtraCosts(s, p, [...(compileCard(d).additionalCosts ?? []), ...more], choices);
}

/**
 * Pay costs beyond mana, for a spell or an ability; returns what was sacrificed as it last existed (CR 608.2h).
 * `returned` gets whom a creature returned to hand was attacking (ninjutsu, CR 702.49c).
 */
function payExtraCosts(s: GameState, p: Player, costs: AdditionalCost[], choices: CostChoices, returned?: LastKnown) {
  const sacrificed: LastKnown[] = [];
  for (const c of costs) {
    if (c.kind === "returnToHand") {
      for (const id of choices.returnToHand ?? []) {
        if (returned) returned.attacking = obj(s, id).attacking;
        log(s, `${p.name} returns ${nameOf(s, id)} to ${player(s, obj(s, id).owner).name === p.name ? "their" : "its owner's"} hand.`);
        moveObject(s, id, "hand");
      }
    } else if (c.kind === "tap") {
      const ids = choices.tap ?? [];
      for (const id of ids) obj(s, id).tapped = true;
      log(s, `${p.name} taps ${ids.map((id) => nameOf(s, id)).join(", ")}.`);
    } else if (c.kind === "payLife") {
      loseLife(s, p.id, c.n);
      log(s, `${p.name} pays ${c.n} life.`);
    } else if (c.kind === "sacrifice") {
      for (const id of choices.sacrifice ?? []) {
        const o = obj(s, id);
        const ch = characteristics(s, o);
        sacrificed.push({ power: ch.power, toughness: ch.toughness, manaValue: manaValue(parseManaCost(defOf(s, o).manaCost)), counters: { ...o.counters }, copyKey: cardIdOf(o) });
        log(s, `${p.name} sacrifices ${nameOf(s, id)}.`);
        moveObject(s, id, "graveyard");
      }
    } else if (c.kind === "discard") discardCards(s, p.id, choices.discard ?? []);
    else {
      const ids = choices.exileCards ?? [];
      log(s, `${p.name} exiles ${ids.map((id) => nameOf(s, id)).join(", ")} from their graveyard.`);
      for (const id of ids) moveObject(s, id, "exile");
    }
  }
  return sacrificed;
}

export function describeTargets(s: GameState, targets?: TargetChoice[]): string {
  if (!targets?.length) return "";
  const names = targets.flatMap((t) =>
    t.kind === "none"
      ? []
      : (t.kind === "player" ? player(s, t.id).name : t.kind === "object" ? nameOf(s, t.id) : (s.stack.find((x) => x.id === t.id)?.description ?? "a spell")) +
        (t.kind !== "stack" && t.amount !== undefined ? ` (${t.amount})` : ""),
  );
  return names.length ? ` targeting ${names.join(", ")}` : "";
}

/**
 * Why this activated ability can't be activated right now, or null. Without `targets`, only
 * checks that legal targets exist; for a modal ability, without `modes` only that a mode can be chosen.
 */
export function abilityProblem(s: GameState, pid: PlayerId, id: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x?: number, costs?: CostChoices): string | null {
  const p = player(s, pid);
  const o = s.objects[id];
  if (!o) return "no such card";
  const d = defOf(s, o);
  const ab = abilitiesOf(s, o).activated[index];
  if (!ab) return `${d.name} has no such ability`;
  if (ab.zone === "hand") {
    // Cycling works only while the card is in your hand (CR 702.29a).
    if (o.zone !== "hand" || o.owner !== pid) return `${ab.text} works only from your hand`;
  } else if (ab.zone === "graveyard") {
    // Unearth works only while the card is in your graveyard (CR 702.84a).
    if (o.zone !== "graveyard" || o.owner !== pid) return `${ab.text} works only from your graveyard`;
  } else if (o.zone !== "battlefield" || controllerOf(s, o) !== pid) return "you don't control that permanent";
  else if (characteristics(s, o).cantActivate) return `${d.name}'s activated abilities can't be activated`; // Arrest
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (splitSecondOnStack(s)) return "a spell with split second is on the stack"; // CR 702.61a
  if (ab.sorcerySpeed && !canActAtSorcerySpeed(s, pid)) return "activate only as a sorcery";
  if (ab.tap && o.tapped) return `${d.name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && isSummoningSick(s, o)) return `${d.name} has summoning sickness`; // CR 602.5a
  if (ab.oncePerTurn && o.activatedThisTurn?.includes(index)) return `${d.name}'s ability can be activated only once each turn`; // CR 602.5b
  if (ab.activateIf && !staticConditionNow(s, ab.activateIf, id, pid)) return `${d.name}'s ability can't be activated now`; // CR 602.5b
  if (ab.lifeCost && p.life < ab.lifeCost) return `you can't pay ${ab.lifeCost} life`; // CR 119.4
  if (ab.removeCounters && (o.counters[ab.removeCounters.counter] ?? 0) < ab.removeCounters.n) return `${d.name} doesn't have ${ab.removeCounters.n} ${ab.removeCounters.counter} counter${ab.removeCounters.n === 1 ? "" : "s"} to remove`;
  if (ab.energyCost && (p.energy ?? 0) < ab.energyCost) return `you need ${ab.energyCost} energy`; // CR 107.14
  if (ab.crew !== undefined) {
    const cp = crewProblem(s, pid, o, ab.crew, tapCreatures);
    if (cp) return cp;
  } else if (tapCreatures?.length) return "this ability doesn't tap creatures";
  if (ab.body.modal) {
    const mp = modes === undefined ? (canChooseModes(s, ab.body, pid, sourceQuality(s, id)) ? null : "no mode can be chosen") : modesProblem(s, ab.body, modes, pid, sourceQuality(s, id));
    if (mp) return mp;
  }
  const body = withModes(ab.body, modes);
  if (body.targets.length) {
    const src = sourceQuality(s, id);
    const tp = targets ? targetProblem(s, body.targets, targets, pid, src, id) : hasLegalTargetsFor(s, body.targets, pid, src, id) ? null : "no legal targets";
    if (tp) return tp;
  }
  if (ab.costs?.length || costs?.sacrifice?.length || costs?.discard?.length || costs?.returnToHand?.length || costs?.tap?.length) {
    const cp = extraCostProblem(s, pid, o, ab.costs ?? [], costs, `activate ${d.name}'s ability`);
    if (cp) return cp;
  }
  const cost = parseManaCost(ab.manaCost);
  const xp = xProblem(cost, x);
  if (xp) return xp;
  if (!canPayFromPool(s, pid, cost, { ability: o }, (x ?? 0) * xCount(cost), p.life)) return `not enough mana for ${d.name}'s ability`;
  return null;
}

/** Creatures that could crew this Vehicle: other untapped creatures you control (CR 702.122a). */
export function crewCandidates(s: GameState, pid: PlayerId, vehicleId: ObjectId): GameObject[] {
  return creaturesOf(s, pid).filter((c) => c.id !== vehicleId && !c.tapped);
}

/** A creature's contribution to "total power N or greater": negative power adds nothing. */
export const crewPower = (s: GameState, c: GameObject) => Math.max(0, power(s, c));

/**
 * Crew N's cost (CR 702.122a): tap any number of other untapped creatures you control with total
 * power N or greater. Without a choice, whether some choice would do.
 */
function crewProblem(s: GameState, pid: PlayerId, vehicle: GameObject, n: number, chosen?: ObjectId[]): string | null {
  if (chosen === undefined) {
    const total = crewCandidates(s, pid, vehicle.id).reduce((x, c) => x + crewPower(s, c), 0);
    return total >= n ? null : `not enough untapped creatures to crew ${n}`;
  }
  if (chosen.includes(vehicle.id)) return "a Vehicle can't crew itself";
  const problem = tapCreaturesProblem(s, pid, chosen, "crew");
  if (problem) return problem;
  const total = chosen.reduce((x, id) => x + crewPower(s, obj(s, id)), 0);
  return total >= n ? null : `those creatures have total power ${total}; crew ${n} needs ${n} or more`;
}

function activateAbility(s: GameState, p: Player, id: ObjectId, index: number, targets?: TargetChoice[], modes?: number[], tapCreatures?: ObjectId[], x?: number, costs?: CostChoices) {
  const o = obj(s, id);
  const d = defOf(s, o);
  const ab = abilitiesOf(s, o).activated[index];
  if (ab?.body.modal && modes === undefined) throw new RulesError(abilityProblem(s, p.id, id, index) ?? `choose ${describeCount(ab.body.modal.min, ab.body.modal.max)} for ${d.name}'s ability`);
  if (ab?.crew !== undefined && !tapCreatures) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose creatures to crew with");
  if (ab?.costs?.some((c) => c.kind === "sacrifice" || c.kind === "discard" || c.kind === "returnToHand" || c.kind === "tap") && !costs) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose what to pay the cost with");
  const body = ab ? withModes(ab.body, modes) : undefined;
  const problem = abilityProblem(s, p.id, id, index, body?.targets.length ? (targets ?? []) : undefined, ab?.body.modal ? modes : undefined, tapCreatures, x, costs ?? {});
  if (problem || !ab || !body) throw new RulesError(problem ?? "no such ability");
  // Costs (CR 602.2b, 601.2g-h): mana, tapping, then sacrificing or discarding the card itself.
  const abCost = parseManaCost(ab.manaCost);
  const paid = spendFromPool(s, p.id, abCost, { ability: o }, (x ?? 0) * xCount(abCost), p.life)!;
  // The source as it is now, for "its power" after it's sacrificed as a cost (CR 608.2h).
  const lki: LastKnown | undefined = o.zone === "battlefield" ? { power: power(s, o), toughness: toughness(s, o), counters: { ...o.counters } } : ab.costs?.some((c) => c.kind === "returnToHand") ? {} : undefined;
  loseLife(s, p.id, paid.lifePaid + (ab.lifeCost ?? 0));
  if (ab.energyCost) p.energy = (p.energy ?? 0) - ab.energyCost;
  if (ab.removeCounters) removeCountersCost(s, o, ab.removeCounters);
  (o.activatedThisTurn ??= []).push(index); // "once each turn" (CR 602.5b); bots also count repeats (bot.ts)
  if (ab.tap) o.tapped = true;
  for (const c of tapCreatures ?? []) obj(s, c).tapped = true;
  const sourceZc = o.zoneChanges ?? 0;
  const stamped = stampTargets(s, targets);
  const sacrificed = ab.costs?.length ? payExtraCosts(s, p, ab.costs, costs ?? {}, lki) : [];
  if (ab.sacrificeSelf && o.zone === "battlefield" && (o.zoneChanges ?? 0) === sourceZc) moveObject(s, id, "graveyard");
  if (ab.discardSelf) discardCards(s, p.id, [id], "", true);
  if (ab.exileSelf) moveObject(s, id, "exile"); // scavenge (CR 702.97a)
  const stackId = `s${s.nextId++}`;
  s.stack.push({
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
    ...(abCost.hasX ? { x: x ?? 0 } : {}),
    ...(sacrificed.length ? { sacrificed } : {}),
  });
  if (ab.discardSelf) log(s, `${p.name} cycles ${d.name} (${ab.text}).`);
  else if (ab.crew !== undefined) log(s, `${p.name} crews ${d.name} with ${tapCreatures!.map((c) => nameOf(s, c)).join(", ")}.`);
  else {
    // Say which ability: its cost and, for a modal one, the chosen modes.
    const cost = ab.text.split(":")[0]!;
    const what = ab.body.modal ? `${cost}: ${body.text}` : ab.text;
    log(s, `${p.name} activates ${d.name} (${what.replace(/~/g, d.name).replace(/\.$/, "")})${abCost.hasX ? ` with X=${x ?? 0}` : ""}${describeTargets(s, targets)}.`);
  }
  fireEvent(s, { type: "targeted", stackId });
}

function chooseTriggerModes(s: GameState, p: Player, modes: number[]) {
  const pend = s.pending;
  if (pend?.kind !== "chooseModes" || pend.player !== p.id) throw new RulesError("no modes to choose");
  const t = s.triggerQueue[0]!;
  const problem = modesProblem(s, triggerBody(s, t), modes, p.id);
  // Choosing no modes is allowed for "choose up to"; the ability is then removed (CR 603.3c).
  if (problem && !(modes.length === 0 && pend.min === 0)) throw new RulesError(problem);
  t.modes = modes;
  s.pending = null;
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
      if (changed[i] && !canChooseTarget(s, pend.specs, kept, i, targets[i]!, p.id)) throw new RulesError("that isn't a legal new target");
    targets = kept;
  }
  sc.targets = targets ?? pend.current;
  s.pending = null;
  continueResolution(s);
}

function chooseTriggerTargets(s: GameState, p: Player, targets: TargetChoice[]) {
  const pend = s.pending;
  if (pend?.kind !== "chooseTargets" || pend.player !== p.id) throw new RulesError("no targets to choose");
  const t = s.triggerQueue[0]!;
  const problem = targetProblem(s, pend.specs, targets, p.id, sourceQuality(s, t.sourceId, t.sourceCardId), t.sourceId);
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
  if (new Set(ids).size !== pend.count || ids.some((id) => !p.hand.includes(id))) throw new RulesError(`choose exactly ${pend.count} card(s) from your hand`);
  r.scratch.chosen![p.id] = ids;
  r.scratch.queue.shift();
  s.pending = null;
  continueResolution(s);
}

/** "Sacrifice a creature", "return a land you control": the permanents this player picked (see the "pick" effect). */
function pickPermanents(s: GameState, p: Player, ids: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "pickPermanents" || pend.player !== p.id || (!pend.objectId && pend.action !== "unblocked" && pend.action !== "band" && !r?.scratch?.queue)) throw new RulesError("nothing to pick");
  if (ids.some((id) => !pend.options.includes(id))) throw new RulesError("choose from the permanents offered");
  const n = new Set(ids).size;
  if (n !== ids.length || n > pend.count || n < (pend.min ?? pend.count))
    throw new RulesError(pend.min === undefined ? `choose exactly ${pend.count} of the permanents offered` : `choose at most ${pend.count} of the permanents offered`);
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

/** Scry or surveil: put the looked-at cards back on top in the given order, the rest on the bottom or into the graveyard. */
function arrangeTop(s: GameState, p: Player, top: ObjectId[], away: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "arrangeTop" || pend.player !== p.id || !r) throw new RulesError("nothing to arrange");
  const all = [...top, ...away];
  if (pend.how === "order" && away.length) throw new RulesError("put them all back on top");
  if (all.length !== pend.cards.length || new Set(all).size !== all.length || all.some((id) => !pend.cards.includes(id)))
    throw new RulesError("put each card on top or " + (pend.how === "scry" ? "on the bottom" : "into your graveyard"));
  r.scratch = { ...r.scratch, arranged: { top, away } };
  s.pending = null;
  continueResolution(s);
}

/** The cards a library search found (CR 701.23). */
function searchLibrary(s: GameState, p: Player, found: ObjectId[]) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "searchLibrary" || pend.player !== p.id || !r) throw new RulesError("you aren't searching a library");
  if (new Set(found).size !== found.length || found.some((id) => !pend.cards.includes(id))) throw new RulesError(`those cards aren't ${pend.what}`);
  if (found.length > pend.max) throw new RulesError(`find at most ${pend.max}`);
  // Searching simply for a number of cards, you find as many as you can (CR 701.23d).
  if (found.length < pend.min) throw new RulesError(`find ${pend.min} card${pend.min === 1 ? "" : "s"}`);
  r.scratch = { ...r.scratch, found };
  s.pending = null;
  continueResolution(s);
}

/** A creature type or color named for a permanent entering (CR 614.12) or a resolving spell. */
function chooseOption(s: GameState, p: Player, choice: string) {
  const pend = s.pending;
  if (pend?.kind !== "chooseOption" || pend.player !== p.id) throw new RulesError("nothing to choose");
  if (pend.what === "devour" || pend.what === "amplify") throw new RulesError(`${pend.what} is chosen by picking cards`);
  if (!pend.options.includes(choice)) throw new RulesError(`${choice} isn't ${pend.what === "color" ? "a color" : pend.what === "creatureType" ? "a creature type" : "an option"} you can choose`);
  s.pending = null;
  if (pend.objectId) {
    const o = obj(s, pend.objectId);
    const entry = s.entersChoices?.shift();
    if (pend.what === "copy") {
      enterAsCopy(s, o, choice, entry?.enterOpts ?? {});
      return;
    }
    if (pend.what === "riot" || pend.what === "unleash") {
      // Riot: a +1/+1 counter, or haste for as long as it's on the battlefield (CR 702.136a). Unleash: a counter or not (CR 702.98a).
      if (choice === ENTERS_COUNTER) putCounters(s, o, "+1/+1", 1, true);
      else if (pend.what === "riot")
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: pend.source, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      log(s, `${pend.source} enters ${choice === ENTERS_COUNTER ? "with a +1/+1 counter" : pend.what === "riot" ? "with haste" : "without a counter"} (${pend.what}).`);
    } else {
      o.chosen = withChoice(o.chosen, pend.what as ChoiceKind, choice);
      log(s, `${p.name} chooses ${choice} for ${pend.source}.`);
    }
    invalidateCharacteristics(s);
    if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
    return;
  }
  const r = s.resolving;
  if (!r || pend.what === "riot" || pend.what === "unleash" || pend.what === "copy") throw new RulesError("nothing to choose");
  if (pend.what === "endure") {
    (r.scratch ??= {}).endure = choice;
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
  r.chosen = withChoice(r.chosen, pend.what, choice);
  log(s, `${p.name} chooses ${choice}.`);
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
  for (const id of ids) {
    const x = s.objects[id];
    if (x?.zone !== "battlefield") continue;
    log(s, `${player(s, controllerOf(s, x)).name} sacrifices ${defOf(s, x).name} to ${d.name}'s devour.`);
    moveObject(s, id, "graveyard");
    n++;
  }
  s.leftTogether = undefined;
  o.devoured = n;
  if (n && devour) {
    invalidateCharacteristics(s);
    const put = putCounters(s, o, "+1/+1", n * (devour.n === "devoured" ? n : devour.n), true);
    log(s, `${d.name} devours ${n} and enters with ${put} +1/+1 counter${put === 1 ? "" : "s"}.`);
  }
  invalidateCharacteristics(s);
  if (enters) fireEvent(s, { type: "enters", id: o.id, ...enters });
}

/** The creature types an object has: "all" with changeling (CR 702.73a). On the battlefield, as the layers make it. */
function creatureTypesOf(s: GameState, o: GameObject): Set<string> | "all" {
  if (o.zone === "battlefield") {
    const c = characteristics(s, o);
    return c.allCreatureTypes ? "all" : new Set(c.subtypes.filter((t) => CREATURE_TYPES.has(t)));
  }
  const d = defOf(s, o);
  return d.keywords.includes("Changeling") ? "all" : new Set(d.subtypes.filter((t) => CREATURE_TYPES.has(t)));
}
const shareCreatureType = (a: Set<string> | "all", b: Set<string> | "all") =>
  a === "all" ? b === "all" || b.size > 0 : b === "all" ? a.size > 0 : [...a].some((t) => b.has(t));

/** Amplify's choice (CR 702.38a): cards in its controller's hand that share a creature type with it. */
export function amplifyOptions(s: GameState, o: GameObject): ObjectId[] {
  const mine = creatureTypesOf(s, o);
  return player(s, controllerOf(s, o)).hand.filter((id) => shareCreatureType(mine, creatureTypesOf(s, obj(s, id))));
}

/**
 * Amplify N (CR 702.38a): "As this object enters, reveal any number of cards from your hand that share a creature type
 * with it. This permanent enters with N +1/+1 counters on it for each card revealed this way." Then it has entered.
 */
function amplifyChosen(s: GameState, o: GameObject, ids: ObjectId[], enters?: { x?: number }) {
  const d = defOf(s, o);
  const n = compileCard(d).amplify ?? 0;
  const shown = ids.filter((id) => s.objects[id]?.zone === "hand");
  if (shown.length && n) {
    const put = putCounters(s, o, "+1/+1", n * shown.length, true);
    log(s, `${player(s, controllerOf(s, o)).name} reveals ${shown.map((id) => nameOf(s, id)).join(", ")}: ${d.name} enters with ${put} +1/+1 counter${put === 1 ? "" : "s"} (amplify).`);
  }
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
      const options = devour ? s.battlefield.filter((id) => id !== o.id && controllerOf(s, obj(s, id)) === you && objectMatches(s, devour.filter, obj(s, id), you, false)) : [];
      if (!options.length) {
        q.shift();
        devourChosen(s, o, [], c.enters);
        continue;
      }
      s.pending = { kind: "pickPermanents", player: you, source: defOf(s, o).name, action: "sacrifice", what: devour!.filter.text, options, count: options.length, min: 0, objectId: o.id };
      return true;
    }
    if (c.what === "amplify") {
      // The card itself isn't in the hand, nor is anything entering with it (CR 702.38a).
      const options = amplifyOptions(s, o);
      if (!options.length) {
        q.shift();
        amplifyChosen(s, o, [], c.enters);
        continue;
      }
      s.pending = { kind: "pickPermanents", player: controllerOf(s, o), source: defOf(s, o).name, action: "reveal", what: "card that shares a creature type with it", options, count: options.length, min: 0, objectId: o.id };
      return true;
    }
    if (c.what === "copy") {
      // "You may have ~ enter as a copy of ...": any of them, or none (CR 707.5).
      const ids = copyCandidates(s, o, compileCard(defOf(s, o)).entersAsCopy!.filter);
      const labels = ids.map((id) => `${defOf(s, obj(s, id)).name} (${player(s, controllerOf(s, obj(s, id))).name})`);
      s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: "copy", options: [...ids, "none"], labels: [...labels, "Don't copy"], objectId: o.id };
      return true;
    }
    s.pending = { kind: "chooseOption", player: controllerOf(s, o), source: defOf(s, o).name, what: c.what, options: choiceOptions(c.what, c.except), objectId: o.id };
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
  if (pend?.kind !== "chooseMay" || pend.player !== p.id || !r) throw new RulesError("nothing to decide");
  if (yes && pend.pay) {
    // "You may pay {2}. If you do, ...": paid now, from the mana pool (mana abilities first, CR 605.3a).
    const { mana, life = 0, energy = 0 } = pend.pay;
    if (p.life < life) throw new RulesError(`you don't have ${life} life to pay`); // CR 119.4
    if ((p.energy ?? 0) < energy) throw new RulesError(`you don't have ${energy} energy`);
    const paid = mana ? spendFromPool(s, p.id, parseManaCost(mana), "other", 0, p.life - life) : null;
    if (mana && !paid) throw new RulesError(`not enough mana in your pool to pay ${mana}`);
    loseLife(s, p.id, (paid?.lifePaid ?? 0) + life);
    p.energy = (p.energy ?? 0) - energy;
    log(s, `${p.name} pays ${describePay(pend.pay)} for ${pend.source}.`);
  }
  if (pend.clash) {
    (r.scratch ??= {}).clash = { ...r.scratch?.clash, answer: yes };
    s.pending = null;
    continueResolution(s);
    return;
  }
  (r.scratch ??= {}).may = yes;
  if (!yes) log(s, `${p.name} chooses not to ${pend.prompt.replace(/\.$/, "")}.`);
  s.pending = null;
  continueResolution(s);
}

/** "Counter it unless its controller pays": pay from the mana pool, or don't (CR 702.21a, 118.12). */
function payUnless(s: GameState, p: Player, pay: boolean) {
  const pend = s.pending;
  const r = s.resolving;
  if (pend?.kind !== "payUnless" || pend.player !== p.id || !r) throw new RulesError("nothing to pay for");
  if (pay) {
    const life = pend.life ?? 0;
    // You can pay life only if your life total is at least that much (CR 119.4).
    if (life && p.life < life) throw new RulesError(`you don't have ${life} life to pay`);
    const paid = spendFromPool(s, p.id, parseManaCost(pend.cost), "other", 0, p.life - life);
    if (!paid) throw new RulesError(`not enough mana in your pool to pay ${pend.cost}`);
    loseLife(s, p.id, paid.lifePaid + life);
    log(s, `${p.name} pays ${pend.cost}${life ? ` and ${life} life` : ""} for ${pend.source}.`);
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

export function potentialAttackers(s: GameState, pid: PlayerId) {
  const opps = opponents(s, pid);
  return creaturesOf(s, pid).filter(
    (o) =>
      !o.tapped &&
      !isSummoningSick(s, o) &&
      !objHasKeyword(s, o, "Defender") &&
      !characteristics(s, o).cantAttack &&
      (!characteristics(s, o).attackUnless.length || opps.some((d) => !attackProblem(s, o, d))),
  );
}

/**
 * Why `o` can't attack `defender` in particular, or null: "can't attack unless defending player controls
 * an Island" (CR 508.1c). Each attacking creature has its own defending player (CR 506.2).
 */
export function attackProblem(s: GameState, o: GameObject, defender: PlayerId): string | null {
  const c = characteristics(s, o);
  for (const f of c.attackUnless)
    if (!s.battlefield.some((id) => controllerOf(s, obj(s, id)) === defender && objectMatches(s, f, obj(s, id), c.controller, false)))
      return `${c.name} can't attack unless defending player controls ${f.text}`;
  return null;
}
export const attackers = (s: GameState) => s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined);
const attackersAndBlockers = (s: GameState) =>
  s.battlefield.map((id) => obj(s, id)).filter((o) => o.attacking !== undefined || o.blocking !== undefined);
const hasFirstOrDouble = (s: GameState, o: GameObject) =>
  objHasKeyword(s, o, "First strike") || objHasKeyword(s, o, "Double strike");

export function clearCombat(o: GameObject) {
  o.attacking = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
  o.band = undefined; // CR 702.22f
}

function declareAttackers(s: GameState, p: Player, attacks: { attacker: ObjectId; defender: PlayerId }[]) {
  if (s.pending?.kind !== "declareAttackers" || s.pending.player !== p.id) throw new RulesError("not declaring attackers now");
  const legal = new Set(potentialAttackers(s, p.id).map((o) => o.id));
  const opps = opponents(s, p.id);
  const seen = new Set<ObjectId>();
  for (const a of attacks) {
    if (!legal.has(a.attacker) || seen.has(a.attacker)) throw new RulesError(`${nameOf(s, a.attacker)} can't attack`);
    if (!opps.includes(a.defender)) throw new RulesError("must attack a living opponent");
    const why = attackProblem(s, obj(s, a.attacker), a.defender);
    if (why) throw new RulesError(why);
    seen.add(a.attacker);
  }
  // "Can't attack alone": the only creature declared as an attacker attacks alone (CR 506.5).
  if (attacks.length === 1 && characteristics(s, obj(s, attacks[0]!.attacker)).cantAttackAlone) throw new RulesError(`${nameOf(s, attacks[0]!.attacker)} can't attack alone`);
  // Requirements (CR 508.1d): every creature that "attacks each combat if able" and can attack has to,
  // unless that would break a restriction: one that can't attack alone needn't attack by itself.
  const shirking = potentialAttackers(s, p.id).find(
    (o) => characteristics(s, o).attacksIfAble && !seen.has(o.id) && !(characteristics(s, o).cantAttackAlone && attacks.length === 0),
  );
  if (shirking && opps.length) throw new RulesError(`${defOf(s, shirking).name} attacks each combat if able`);
  // Goaded: it attacks a player other than the ones who goaded it, if it can (CR 701.15b, 508.1d).
  for (const a of attacks) {
    const o = obj(s, a.attacker);
    const by = characteristics(s, o).goadedBy;
    if (by.includes(a.defender) && opps.some((d) => !by.includes(d) && !attackProblem(s, o, d)))
      throw new RulesError(`${defOf(s, o).name} is goaded: it must attack a player other than ${by.map((p) => player(s, p).name).join(" or ")} if able`);
  }
  for (const a of attacks) {
    const o = obj(s, a.attacker);
    o.attacking = a.defender;
    if (!objHasKeyword(s, o, "Vigilance")) o.tapped = true; // CR 508.1f
    log(s, `${defOf(s, o).name} attacks ${player(s, a.defender).name}.`);
  }
  if (attacks.length) p.attackedTurn = s.turn; // raid
  p.attackedPlayers = { turn: s.turn, players: [...new Set(attacks.map((a) => a.defender))] }; // melee
  s.pending = null;
  if (attacks.length === 0) {
    log(s, `${p.name} declares no attackers.`);
    beginStep(s, "endCombat"); // CR 508.8
    return;
  }
  // Optional costs to attack, like enlist's, are chosen as the attackers are tapped (CR 508.1g; enlist rulings).
  const ids = attacks.map((a) => a.attacker);
  s.declaring = { ids, bands: canBand(s, ids), enlist: ids.filter((id) => objHasKeyword(s, obj(s, id), "Enlist") && abilitiesOf(s, obj(s, id)).enlist), enlisted: [] };
  finishAttacks(s);
}

/** Attackers not in a band yet that could form one: one with banding and another attacking the same player (CR 702.22c-d). */
function bandOptions(s: GameState, ids: ObjectId[]): ObjectId[] {
  const free = ids.filter((id) => s.objects[id]?.attacking !== undefined && !obj(s, id).band);
  const bands = (id: ObjectId) => objHasKeyword(s, obj(s, id), "Banding");
  return free.filter((id) => free.some((x) => x !== id && obj(s, x).attacking === obj(s, id).attacking && (bands(id) || bands(x))));
}
const canBand = (s: GameState, ids: ObjectId[]) => bandOptions(s, ids).length > 0;

/** Why these attackers can't be a band (CR 702.22c-d): one or more with banding, up to one without, attacking the same player. */
export function bandProblem(s: GameState, ids: ObjectId[]): string | null {
  const options = bandOptions(s, s.declaring?.ids ?? []);
  if (ids.length < 2) return "a band needs two or more attacking creatures";
  if (ids.some((id) => !options.includes(id))) return "choose attacking creatures that aren't in a band yet";
  if (ids.filter((id) => !objHasKeyword(s, obj(s, id), "Banding")).length > 1) return "a band can have only one creature without banding";
  if (new Set(ids.map((id) => obj(s, id).attacking)).size > 1) return "all creatures in a band must attack the same player";
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
  s.declaring = undefined;
  const attacks = d.ids.filter((id) => s.objects[id]?.attacking !== undefined);
  for (const id of attacks) fireEvent(s, { type: "attacks", id }); // CR 508.3a
  if (attacks.length) fireEvent(s, { type: "groupAttack", controller: s.activePlayer, ids: attacks });
  if (attacks.length === 1) fireEvent(s, { type: "attacksAlone", id: attacks[0]! }); // CR 506.5
  for (const [at, enlisted] of d.enlisted) fireEvent(s, { type: "enlists", id: at, enlisted });
}

/** An attacker enlists the chosen creature (or none): tap it as the cost (CR 702.154a, c). */
function enlistChosen(s: GameState, at: ObjectId, ids: ObjectId[]) {
  const d = s.declaring!;
  d.enlist.shift();
  const c = ids[0];
  if (c) {
    obj(s, c).tapped = true;
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

function declareBlockers(s: GameState, p: Player, blocks: { blocker: ObjectId; attacker: ObjectId }[]) {
  const pend = s.pending;
  if (pend?.kind !== "declareBlockers" || pend.player !== p.id) throw new RulesError("not declaring blockers now");
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
    if (at.attacking !== p.id) throw new RulesError(`${ad.name} isn't attacking you`);
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
  const req = blockRequirementProblem(s, p.id, blocks);
  if (req) throw new RulesError(req);
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const at = obj(s, b.attacker);
    (bl.blocking ??= []).push(at.id);
    (at.blockedBy ??= []).push(bl.id);
    log(s, `${defOf(s, bl).name} blocks ${defOf(s, at).name}.`);
  }
  // Blocking one creature in a band blocks every creature in it (CR 702.22h).
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const band = obj(s, b.attacker).band;
    if (!band) continue;
    for (const m of attackers(s)) {
      if (m.band !== band || bl.blocking!.includes(m.id)) continue;
      bl.blocking!.push(m.id);
      (m.blockedBy ??= []).push(bl.id);
      log(s, `${defOf(s, bl).name} also blocks ${defOf(s, m).name} (banding).`);
    }
  }
  const [next, ...rest] = pend.remaining;
  s.pending = next !== undefined ? { kind: "declareBlockers", player: next, remaining: rest } : null;
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
  const demanding = incoming.filter((a) => characteristics(s, a).allMustBlock || characteristics(s, a).mustBeBlocked);
  const provoked = creaturesOf(s, pid).filter((o) => provokerOf(s, o));
  if (!demanding.length && !provoked.length) return null;
  const blocking = new Map<ObjectId, ObjectId[]>();
  for (const b of blocks) blocking.set(b.blocker, [...(blocking.get(b.blocker) ?? []), b.attacker]);
  const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
  const mine = creaturesOf(s, pid).filter((o) => !o.tapped && !characteristics(s, o).cantBlock && !(characteristics(s, o).cantBlockAlone && !earlier && blocking.size <= 1 && !blocking.has(o.id)));
  // A creature already blocking as many demanding attackers as it can block obeys all the requirements it can.
  const full = (b: GameObject) => {
    const at = blocking.get(b.id) ?? [];
    return at.length >= maxBlocks(s, b) && at.every((x) => demanding.some((a) => a.id === x) || provokerOf(s, b)?.id === x);
  };
  // Provoke (CR 702.39a): the provoked creature blocks the creature that provoked it if able. With menace, that
  // takes another creature able to block it too (CR 702.111b), two more with "except by three or more" (509.1b).
  for (const b of mine) {
    const at = provokerOf(s, b);
    if (!at || (blocking.get(b.id) ?? []).includes(at.id) || blockProblem(s, b, at) || full(b)) continue;
    if (mine.filter((o) => o.id !== b.id && !blockProblem(s, o, at)).length < blockersNeeded(s, at) - 1) continue;
    return `${characteristics(s, b).name} must block ${characteristics(s, at).name} if able (provoke)`;
  }
  for (const at of demanding) {
    const ac = characteristics(s, at);
    const could = mine.filter((b) => !blockProblem(s, b, at));
    if (could.length < blockersNeeded(s, at)) continue;
    if (ac.allMustBlock && !ac.maxOneBlocker) {
      const shirk = could.find((b) => !(blocking.get(b.id) ?? []).includes(at.id) && !full(b));
      if (shirk) return `${characteristics(s, shirk).name} must block ${ac.name} (all creatures able to block it do so)`;
    }
    const blocked = blocks.some((b) => b.attacker === at.id);
    if (!blocked && could.some((b) => !full(b))) return `${ac.name} must be blocked if able`;
  }
  return null;
}

/** The attacking creature that provoked this one and that it must block, if that's still so (CR 702.39a). */
export function provokerOf(s: GameState, b: GameObject): GameObject | undefined {
  const at = b.provokedBy && s.objects[b.provokedBy.id];
  return at && at.zone === "battlefield" && (at.zoneChanges ?? 0) === b.provokedBy!.zc && at.attacking === controllerOf(s, b) ? at : undefined;
}

const LANDWALK: Record<string, string> = { Swampwalk: "Swamp", Islandwalk: "Island", Forestwalk: "Forest", Mountainwalk: "Mountain", Plainswalk: "Plains" };

/**
 * Why `blocker` can't block `attacker` on its own, or null. Covers evasion and blocking
 * restrictions; menace (needs two blockers) is checked over the whole declaration.
 */
export function blockProblem(s: GameState, blocker: GameObject, attacker: GameObject, defender = attacker.attacking): string | null {
  const b = characteristics(s, blocker);
  const a = characteristics(s, attacker);
  const has = (c: typeof a, k: string) => c.keywords.some((x) => x.toLowerCase() === k.toLowerCase());
  if (!b.types.includes("Creature") || blocker.tapped) return `${b.name} can't block`;
  if (b.cantBlock) return `${b.name} can't block`;
  if (a.cantBeBlocked) return `${a.name} can't be blocked`;
  if (has(a, "Flying") && !has(b, "Flying") && !has(b, "Reach")) return `${b.name} can't block a creature with flying`; // CR 702.9b
  if (has(a, "Shadow") !== has(b, "Shadow")) return has(a, "Shadow") ? `only creatures with shadow can block ${a.name}` : `${b.name} has shadow and can only block creatures with shadow`; // CR 702.28b
  if (has(a, "Fear") && !b.types.includes("Artifact") && !b.colors.includes("B")) return `${a.name} has fear`; // CR 702.36b
  if (has(a, "Intimidate") && !b.types.includes("Artifact") && !b.colors.some((c) => a.colors.includes(c))) return `${a.name} has intimidate`; // CR 702.13b
  if (protectedFrom(a.keywords, b)) return `${a.name} has protection from ${b.name}`; // CR 702.16f
  if (b.blocksOnlyFlyers && !has(a, "Flying")) return `${b.name} can block only creatures with flying`; // CR 509.1b
  if (has(a, "Horsemanship") && !has(b, "Horsemanship")) return `${a.name} has horsemanship`; // CR 702.31b
  if (has(a, "Skulk") && b.power > a.power) return `${a.name} has skulk`; // CR 702.118b
  if (a.cantBeBlockedByLesserPower && b.power < a.power) return `creatures with power less than ${a.name}'s can't block it`; // CR 509.1b
  if (a.cantBeBlockedByGreaterPower && b.power > a.power) return `creatures with power greater than ${a.name}'s can't block it (Ring-bearer)`; // CR 701.54c
  for (const f of a.cantBeBlockedBy) if (objectMatches(s, f, blocker, b.controller, false)) return `${a.name} can't be blocked by ${f.text}`; // CR 509.1b
  if (defender !== undefined)
    for (const [kw, land] of Object.entries(LANDWALK))
      if (has(a, kw) && s.battlefield.some((id) => { const l = obj(s, id); return controllerOf(s, l) === defender && characteristics(s, l).subtypes.includes(land); }))
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
    if (!at.blockedBy || at.attacking === undefined || !characteristics(s, at).unblockedDamage || !dealsDamageThisStep(s, at, fs) || power(s, at) <= 0) continue;
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
    protectedFrom(characteristics(s, t).keywords, src) || objHasKeyword(s, t, "Indestructible") ? Infinity : deathtouch ? 0 : Math.max(0, toughness(s, t) - t.damage - 1);
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

/** Combat damage is dealt simultaneously (CR 510.2); we compute all assignments first, then apply. */
function dealCombatDamage(s: GameState, firstStrikeStep: boolean) {
  type Hit = { source: GameObject; toPlayer?: PlayerId; toObject?: GameObject; amount: number };
  const hits: Hit[] = [];
  for (const at of attackers(s)) {
    if (!dealsDamageThisStep(s, at, firstStrikeStep)) continue;
    let dmg = power(s, at);
    if (dmg <= 0) continue;
    // "As though it weren't blocked": all of it to the player it's attacking, none to blockers (CR 510.1b; rulings).
    const unblocked = s.unblockedChoice?.turn === s.turn && s.unblockedChoice.step === s.step && s.unblockedChoice.ids.includes(at.id);
    if (!at.blockedBy || unblocked) {
      hits.push({ source: at, toPlayer: at.attacking!, amount: dmg });
      continue;
    }
    const blockers = at.blockedBy.map((id) => obj(s, id));
    if (blockers.length === 0) {
      if (objHasKeyword(s, at, "Trample")) hits.push({ source: at, toPlayer: at.attacking!, amount: dmg }); // CR 702.19e
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
      const lethal = objHasKeyword(s, at, "Deathtouch") ? 1 : Math.max(0, toughness(s, bl) - bl.damage);
      const last = i === blockers.length - 1;
      const amt = last && !objHasKeyword(s, at, "Trample") ? dmg : Math.min(dmg, lethal);
      if (amt > 0) hits.push({ source: at, toObject: bl, amount: amt });
      dmg -= amt;
    });
    if (dmg > 0 && objHasKeyword(s, at, "Trample")) hits.push({ source: at, toPlayer: at.attacking!, amount: dmg });
  }
  for (const id of s.battlefield) {
    const bl = obj(s, id);
    if (!bl.blocking || !dealsDamageThisStep(s, bl, firstStrikeStep)) continue;
    const blocked = bl.blocking.map((a) => s.objects[a]).filter((at): at is GameObject => !!at && at.zone === "battlefield");
    let dmg = power(s, bl);
    if (dmg <= 0) continue;
    // Blocking a creature with banding, the active player divides its damage among those it blocks (CR 702.22k).
    if (blocked.length > 1 && blocked.some((at) => objHasKeyword(s, at, "Banding"))) {
      for (const [at, amount] of bandSplit(s, bl, blocked, dmg)) hits.push({ source: bl, toObject: at, amount });
      continue;
    }
    // Blocking two or more creatures, its damage is divided among them (CR 510.1d): lethal damage to each in
    // turn (1 with deathtouch, CR 702.2c), the rest to the last.
    blocked.forEach((at, i) => {
      const lethal = objHasKeyword(s, bl, "Deathtouch") ? 1 : Math.max(0, toughness(s, at) - at.damage);
      const amt = i === blocked.length - 1 ? dmg : Math.min(dmg, lethal);
      if (amt > 0) hits.push({ source: bl, toObject: at, amount: amt });
      dmg -= amt;
    });
  }
  if (s.preventCombatDamage && hits.length) {
    log(s, "All combat damage is prevented.");
    return;
  }
  // Sources as they are now, before any of the damage changes anything (it's all dealt at once).
  const sources = new Map(hits.map((h) => [h.source.id, objectSource(s, h.source)]));
  // Each source's lifelink is one life-gain event however many things it damaged (CR 119.10).
  const lifelink = new Map<ObjectId, { n: number }>(hits.map((h) => [h.source.id, { n: 0 }]));
  const dealt = new Map<ObjectId, number>();
  const hitDealt: number[] = [];
  for (const h of hits) {
    const src = sources.get(h.source.id)!;
    const opts = { combat: true, lifelink: lifelink.get(h.source.id)! };
    let n = 0;
    if (h.toPlayer !== undefined) {
      n = dealDamage(s, src, { player: h.toPlayer }, h.amount, opts);
      if (n) fireEvent(s, { type: "combatDamageToPlayer", id: h.source.id, player: h.toPlayer, amount: n });
    } else if (h.toObject) n = dealDamage(s, src, { object: h.toObject }, h.amount, opts);
    dealt.set(h.source.id, (dealt.get(h.source.id) ?? 0) + n);
    hitDealt.push(n);
  }
  // "Whenever one or more creatures you control deal combat damage to a player": once per player dealt damage.
  const groups = new Map<string, { controller: PlayerId; player: PlayerId; ids: ObjectId[]; amounts: number[] }>();
  for (const [i, h] of hits.entries()) {
    if (h.toPlayer === undefined || !hitDealt[i]) continue;
    const controller = sources.get(h.source.id)!.controller;
    const g = groups.get(`${controller}|${h.toPlayer}`) ?? { controller, player: h.toPlayer, ids: [], amounts: [] };
    g.ids.push(h.source.id);
    g.amounts.push(hitDealt[i]!);
    groups.set(`${controller}|${h.toPlayer}`, g);
  }
  for (const [id, gained] of lifelink) gainLife(s, sources.get(id)!.controller, gained.n);
  // "Whenever ~ deals (combat) damage": once per creature, for all it dealt this step (CR 510.2, 603.2c).
  for (const [id, n] of dealt) if (n) fireEvent(s, { type: "dealtDamage", id, amount: n, combat: true });
  for (const g of groups.values()) fireEvent(s, { type: "groupCombatDamage", ...g });
}

// ---------------------------------------------------------------------------
// State-based actions (CR 704) and leaving the game (CR 800.4)

function afterAction(s: GameState, holdTriggers = false) {
  runStateBasedActions(s, holdTriggers);
}

export function runStateBasedActions(s: GameState, holdTriggers = false) {
  if (s.resolving) return; // not while a spell or ability is partway through resolving (CR 704.3)
  if (!s.pending && askEntersChoice(s)) return;
  for (let guard = 0; guard < 100; guard++) {
    s.leftTogether = undefined; // each pass happens all at once (CR 704.3)
    invalidateCharacteristics(s);
    syncControl(s);
    checkPairs(s);
    checkAscend(s);
    let changed = false;
    for (const p of s.players) {
      if (p.lost) continue;
      if (p.life <= 0) changed = playerLoses(s, p.id, "life total reached 0") || changed; // 704.5a
      else if (p.drewFromEmptyLibrary) changed = playerLoses(s, p.id, "drew from an empty library") || changed; // 704.5b
      else if ((p.poison ?? 0) >= 10) changed = playerLoses(s, p.id, "ten poison counters") || changed; // 704.5c
      else {
        const fatal = Object.entries(p.commanderDamage).find(([, n]) => n >= COMMANDER_DAMAGE_LIMIT);
        if (fatal) changed = playerLoses(s, p.id, `took 21 combat damage from ${nameOf(s, fatal[0])}`) || changed; // 704.5u
      }
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
      if (!objIsType(s, o, "Creature")) continue;
      const t = toughness(s, o);
      if (t <= 0) {
        // Zero toughness isn't destruction: regeneration and indestructible don't help (704.5f).
        log(s, `${d.name} dies.`);
        moveObject(s, id, "graveyard");
        changed = true;
      } else if ((o.damage >= t || o.deathtouchDamage) && !objHasKeyword(s, o, "Indestructible")) {
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
    // Legend rule (704.5j). TODO: let the controller choose; for now keep the newest.
    const seen = new Map<string, ObjectId>();
    for (const id of [...s.battlefield]) {
      const o = s.objects[id];
      if (!o || o.zone !== "battlefield") continue;
      const c = characteristics(s, o);
      const d = defOf(s, o);
      if (!c.supertypes.includes("Legendary")) continue;
      const key = `${c.controller}:${c.name}`;
      if (seen.has(key)) {
        log(s, `${d.name} is put into the graveyard (legend rule).`);
        moveObject(s, id, "graveyard");
        changed = true;
      } else seen.set(key, id);
    }
    if (attachmentSBAs(s)) changed = true;
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
      if (!o.isToken || o.zone === "battlefield" || o.zone === "stack" || o.zone === "phasedOut") continue;
      const list = zoneList(s, o);
      if (list) list.splice(list.indexOf(o.id), 1);
      delete s.objects[o.id];
      changed = true;
    }
    if (!changed) break;
  }
  s.leftTogether = undefined;
  checkGameOver(s);
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
    if (c.subtypes.includes("Aura")) {
      const enchant = compileCard(defOf(s, o)).enchant;
      // Protection from the Aura's color makes it illegal too (CR 702.16c), unless that protection is only from an
      // effect that "doesn't remove" this Aura.
      const hc = host && characteristics(s, host);
      const shielding = hc ? hc.keywords.filter((k) => hc.sparedBy?.[k.toLowerCase()] !== o.id) : [];
      const legal = !!host && host.zone === "battlefield" && host.id !== o.id && !!enchant && objectMatches(s, enchant, host, c.controller, false) && !protectedFrom(shielding, c);
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
      if (!host || host.zone !== "battlefield" || !objIsType(s, host, "Creature") || c.types.includes("Creature") || protectedFrom(characteristics(s, host).keywords, c)) {
        o.attachedTo = undefined;
        invalidateCharacteristics(s);
        log(s, `${c.name} becomes unattached.`);
        changed = true;
      }
    } else if (o.attachedTo) {
      // A creature, or anything that's no longer an Aura or Equipment, can't stay attached (CR 704.5p).
      o.attachedTo = undefined;
      invalidateCharacteristics(s);
      log(s, `${c.name} becomes unattached.`);
      changed = true;
    }
  }
  return changed;
}

/**
 * Notice permanents whose controller changed. The new controller hasn't controlled it
 * continuously since their turn began (CR 302.6), and it leaves combat (CR 506.4).
 */
function syncControl(s: GameState) {
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
      o.seenController = now;
      loseRingBearer(s, o.id); // CR 701.54a
      o.controlledSinceTurn = s.turn;
      if (o.attacking !== undefined || o.blocking !== undefined) {
        removeFromCombat(s, o);
        clearCombat(o);
      }
    }
  }
}

function playerLoses(s: GameState, pid: PlayerId, reason: string): boolean {
  const p = player(s, pid);
  if (p.lost) return false;
  p.lost = true;
  p.lossReason = reason;
  log(s, `${p.name} loses the game (${reason}).`);
  // CR 800.4a: everything they own leaves the game, and effects giving them control of things end.
  s.stack = s.stack.filter((item) => item.controller !== pid);
  for (const e of s.effects) if (e.controller === pid) e.mods = e.mods.filter((m) => m.kind !== "control");
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
  for (const o of attackers(s)) if (o.attacking === pid) clearCombat(o);
  s.passedInSuccession = s.passedInSuccession.filter((id) => id !== pid);
  if (s.pending?.player === pid) {
    if (s.pending.kind === "declareBlockers") {
      const [next, ...rest] = s.pending.remaining;
      s.pending = next !== undefined ? { ...s.pending, player: next, remaining: rest } : null;
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
  for (const id of [...p.hand, ...exilePlayable(s, pid)]) {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) {
      if (canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < landsAllowed(s, pid)) out.push({ type: "playLand", player: pid, objectId: id });
    } else if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
    if (suspendProblem(s, pid, id) === null) out.push({ type: "suspend", player: pid, objectId: id });
    if (plotProblem(s, pid, id) === null) out.push({ type: "plot", player: pid, objectId: id });
  }
  // "You may play lands from your graveyard" (Crucible of Worlds).
  if (canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < landsAllowed(s, pid))
    for (const id of p.graveyard) if (mayPlayLandFromGraveyard(s, obj(s, id), pid)) out.push({ type: "playLand", player: pid, objectId: id });
  for (const id of p.command) if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    const options = manaOptions(s, o);
    manaAbilitiesOn(s, o).forEach((ab, i) => {
      if (manaAbilityProblem(s, pid, o, i)) return;
      const tap = ab.tapCost ? tapCostCandidates(s, pid, o, ab.tapCost).slice(0, ab.tapCost.n) : undefined;
      for (const x of options) if (x.ability === i) out.push({ type: "activateMana", player: pid, objectId: id, mana: x.mana, ability: i, ...(tap ? { tap } : {}), ...(x.extra ? { extra: x.extra } : {}) });
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
  const instantSpeed = isType(d, "Instant") || d.keywords.includes("Flash");
  if (!instantSpeed && !canActAtSorcerySpeed(s, pid)) return `${d.name} can only be suspended when you could cast it (sorcery speed)`;
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
  const cost = compileCard(d).plot;
  if (!cost) return `${d.name} doesn't have plot`;
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (!canActAtSorcerySpeed(s, pid)) return "you can only plot during your main phase while the stack is empty";
  if (!canPayFromPool(s, pid, parseManaCost(cost), "other")) return `not enough mana to plot ${d.name} (${cost})`;
  return null;
}

/** Plot a card (CR 702.170a): pay its plot cost and exile it. Its owner may cast it free on a later turn (702.170d). */
function plotCard(s: GameState, p: Player, id: ObjectId) {
  const problem = plotProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const d = defOf(s, o);
  const cost = compileCard(d).plot!;
  spendFromPool(s, p.id, parseManaCost(cost), "other");
  moveObject(s, id, "exile");
  o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "plot", turn: s.turn };
  log(s, `${p.name} plots ${d.name} (${cost}). They may cast it without paying its mana cost on a later turn.`);
  s.passedInSuccession = [];
}

/**
 * Why `pid` can't turn this permanent face up right now, or null (with the mana in their pool). It's
 * a special action, any time they have priority (CR 116.2b), paying the morph or disguise cost the
 * card would have face up (CR 702.37e, 702.168d).
 */
export function turnFaceUpProblem(s: GameState, pid: PlayerId, id: ObjectId): string | null {
  const o = s.objects[id];
  if (!o || o.zone !== "battlefield" || !o.faceDown) return "that isn't a face-down permanent";
  if (controllerOf(s, o) !== pid) return "you don't control that permanent";
  if (s.priority !== pid || s.pending) return "you don't have priority";
  const fd = compileCard(faceUpDefOf(s, o)).faceDownCast;
  if (!fd) return "it has no morph or disguise cost"; // CR 702.37e
  if (!canPayFromPool(s, pid, parseManaCost(fd.cost), "other")) return `not enough mana to turn it face up (${fd.cost})`;
  return null;
}

/** The cost of turning a face-down permanent face up, if it has one. */
export const faceUpCost = (s: GameState, o: GameObject) => (o.faceDown ? compileCard(faceUpDefOf(s, o)).faceDownCast : undefined);

function turnFaceUp(s: GameState, p: Player, id: ObjectId) {
  const problem = turnFaceUpProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const fd = compileCard(faceUpDefOf(s, o)).faceDownCast!;
  spendFromPool(s, p.id, parseManaCost(fd.cost), "other");
  // Its copiable values go back to the card's, or what a copy effect made it (CR 708.8, 707.3); it's the same
  // permanent, so nothing "enters".
  o.faceDown = undefined;
  invalidateCharacteristics(s);
  const d = defOf(s, o);
  log(s, `${p.name} turns a face-down creature face up: it's ${d.name} (${describeVia(fd.kind)} ${fd.cost}).`);
  // Megamorph: a +1/+1 counter as it's turned face up, if its megamorph cost was paid (CR 702.37b).
  if (fd.kind === "megamorph") putCounters(s, o, "+1/+1", 1);
  fireEvent(s, { type: "turnedFaceUp", id });
  s.passedInSuccession = [];
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
      const most = Math.max(0, ...manaChoices(s, o, ab).map((m) => manaProduced(s, o, ab, m).length));
      best = Math.max(best, most - manaValue(parseManaCost(ab.manaCost)));
    });
    n += best;
  }
  return n;
}


import type { AdditionalCost, AltCostKind, CastFromGraveyard, CastFromGraveyardKind, CompiledCard, EntersCondition, Modification, TargetChoice } from "./abilities";
import { abilitiesOf, cardIdOf, defOf, FACE_DOWN, FACE_DOWN_WARD, realDefOf, describeAbility, isPermanentCard, isType, objHasKeyword, objIsType, power, toughness } from "./cards";
import { MANA_ABILITY_OFFSET, manaAbilitiesOn, manaAbilityProblem, manaChoices, manaProduced, pickManaAbility } from "./manaabilities";
import { addDelayed, modsAreHarmful, becomeMonarch, triggerBody, canChooseModes, choiceOptions, ENTERS_COUNTER, describePay, withChoice, discardCards, printedMatches, sourceQuality, stampTargets, fireEvent, hasLegalTargets, isLegalTarget, modesProblem, objectMatches, processTriggerQueue, pushTrigger, beginResolution, continueResolution, targetProblem } from "./effects";
import { describeCount, withModes } from "./modes";
import { dealDamage, objectSource, protectedFrom } from "./damage";
import { characteristics, controllerOf, invalidateCharacteristics, staticConditionNow } from "./layers";
import { compileCard, spellTargetSpecs } from "./oracle";
import { convokeReduce, emptyPool, manaValue, parseManaCost, payFromPool, payGenericWith, splitGeneric, xCount, xProblem, type ParsedCost } from "./mana";
import { evalAmount } from "./amounts";
import { nextRandom, shuffle } from "./rng";
import {
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
  /** The other 99 cards. */
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
    const cmd = newObject(s, p.commander, pid, "command");
    cmd.isCommander = true;
    player.command.push(cmd.id);
    player.commanderCasts[cmd.id] = 0;
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
  const p = player(s, action.player);
  if (action.type === "concede") {
    playerLoses(s, p.id, "conceded");
    afterAction(s);
    return s;
  }
  const expected = waitingOn(s);
  if (action.player !== expected) throw new RulesError(`waiting on player ${expected}, not ${action.player}`);

  switch (action.type) {
    case "passPriority":
      requireNoPending(s);
      passPriority(s, p.id);
      break;
    case "playLand":
      requireNoPending(s);
      playLand(s, p, action.objectId, action.untapped);
      s.passedInSuccession = [];
      break;
    case "activateMana":
      // Mana abilities can also be activated while paying a cost mid-resolution, like ward's (CR 605.3a).
      if (s.pending?.kind !== "payUnless" && !(s.pending?.kind === "chooseMay" && s.pending.pay?.mana)) requireNoPending(s);
      activateMana(s, p, action.objectId, action.mana, action.ability);
      break;
    case "castSpell":
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
  }
  afterAction(s);
  return s;
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

/** The card `pid` may cast for free right now, as cascade resolves (see PendingDecision "castFree"). */
export function freeCastOf(s: GameState, pid: PlayerId): ObjectId | undefined {
  return s.pending?.kind === "castFree" && s.pending.player === pid ? s.pending.objectId : undefined;
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
  // "If it would leave, exile it instead" (flashback, unearth): a replacement effect (CR 614.1a).
  if (o.exileIfLeaves === fromZone && to !== "exile") to = "exile";
  o.exileIfLeaves = undefined;
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
  if (fromZone === "battlefield") {
    const host = o.attachedTo ? s.objects[o.attachedTo] : undefined;
    (s.lastKnown ??= {})[id] = { zc: o.zoneChanges ?? 0, power: last.power, toughness: last.toughness, controller: last.controller, ...(host ? { attachedTo: { id: host.id, zc: host.zoneChanges ?? 0 } } : {}) };
  }
  const exiledUntil = fromZone === "battlefield" ? o.exiledUntilLeaves : undefined;
  o.exiledUntilLeaves = undefined;
  const from = zoneList(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  if (o.zone === "battlefield") removeFromCombat(s, o);
  // Whether it was kicked stays with a spell that becomes a permanent, and nothing else (CR 400.7).
  if (!(fromZone === "stack" && to === "battlefield")) {
    o.kicked = undefined;
    o.castAlt = undefined; // so is whether its evoke or dash cost was paid (CR 702.74a, 702.109a)
    // A face-down spell becomes a face-down permanent (CR 708.4); anywhere else, it's revealed (CR 708.9).
    if (o.faceDown) {
      o.faceDown = undefined;
      log(s, `(The face-down creature was ${realDefOf(s, o).name}.)`);
    }
  }
  o.zone = to;
  o.zoneChanges = (o.zoneChanges ?? 0) + 1; // a new object (CR 400.7)
  o.tapped = false;
  o.damage = 0;
  o.deathtouchDamage = false;
  o.regenShields = undefined;
  o.preventNext = undefined;
  o.activatedThisTurn = undefined;
  o.skipNextUntap = undefined;
  o.renowned = undefined;
  o.chosen = undefined;
  o.counters = {};
  o.controller = opts.controller ?? o.owner;
  o.seenController = undefined;
  o.attacking = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
  o.timestamp = s.nextTimestamp++; // CR 613.7d
  o.attachedTo = to === "battlefield" ? opts.attachTo : undefined;
  if (fromZone === "battlefield") {
    // It's a new object now (CR 400.7): effects locked onto it end, and things attached to it
    // are no longer attached (Auras then go to the graveyard and Equipment stays, CR 704.5m-n).
    for (const e of s.effects) e.affected = e.affected.filter((x) => x !== id);
    s.effects = s.effects.filter((e) => e.affected.length);
    for (const other of s.battlefield) if (s.objects[other]!.attachedTo === id) s.objects[other]!.attachedTo = undefined;
  }
  if (to === "battlefield") o.controlledSinceTurn = s.turn;
  invalidateCharacteristics(s);
  // "Enters with N counters" is a replacement effect (CR 614.1c): N is counted before it's on the battlefield.
  const withCounters = to === "battlefield" ? compileCard(defOf(s, o)).entersWithCounters : undefined;
  const counterN = withCounters ? Math.max(0, evalAmount(s, withCounters.n, { controller: o.controller, sourceId: id, x: opts.x, kicked: o.kicked })) : 0;
  const dest = zoneList(s, o);
  if (dest) opts.top || to === "battlefield" ? dest.unshift(id) : dest.push(id);
  if (to === "graveyard" || to === "exile") o.justMovedForCommander = o.isCommander;
  if (to === "battlefield") {
    const printed = compileCard(defOf(s, o));
    if (printed.entersTapped || opts.tapped || entersTappedNow(s, o, printed, opts.untapped)) o.tapped = true;
    if (withCounters && counterN) o.counters[withCounters.counter] = counterN; // CR 614.1c
    // Bloodthirst: "if an opponent was dealt damage this turn" (CR 702.54a).
    if (printed.bloodthirst && (s.damagedThisTurn ?? []).some((pid) => opponents(s, o.controller).includes(pid)))
      o.counters["+1/+1"] = (o.counters["+1/+1"] ?? 0) + printed.bloodthirst;
    for (const [k, n] of Object.entries(opts.counters ?? {})) o.counters[k] = (o.counters[k] ?? 0) + n;
    // "~ escapes with N +1/+1 counters on it" (CR 702.138c).
    if (escaped && printed.escapesWith) o.counters["+1/+1"] = (o.counters["+1/+1"] ?? 0) + printed.escapesWith;
    // "As ~ enters, choose a color": its controller chooses before anything else happens (CR 614.12).
    for (const c of printed.entersChoose ?? []) (s.entersChoices ??= []).push({ id, zc: o.zoneChanges, ...c });
    // Riot and unleash: whether it has a +1/+1 counter is part of how it enters (CR 614.12), so what it
    // triggers waits for that choice (evolve compares its power as it entered, CR 702.100a).
    const options = printed.entersOptions ?? [];
    options.forEach((what, i) => (s.entersChoices ??= []).push({ id, zc: o.zoneChanges ?? 0, what, ...(i === options.length - 1 ? { enters: opts.x ? { x: opts.x } : {} } : {}) }));
    if (!options.length) fireEvent(s, { type: "enters", id, ...(opts.x ? { x: opts.x } : {}) });
  }
  // "Dies" is a creature put into a graveyard from the battlefield (CR 700.4); other triggers say "put into a graveyard".
  if (fromZone === "battlefield" && to === "graveyard") fireEvent(s, { type: "dies", id, controller: lastController, hadAbilities, grantedAbilities: last.grantedAbilities, counters: lastCounters, wasCreature, power: last.power, toughness: last.toughness });
  if (exiledUntil?.length) returnUntilLeaves(s, exiledUntil, last.name);
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
function auraHostFor(s: GameState, aura: GameObject, pid: PlayerId): ObjectId | undefined {
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
  fireEvent(s, { type: "lifeGained", player: pid });
}

/**
 * Destroy a permanent (CR 701.8): indestructible ones aren't (CR 702.12b), and a
 * regeneration shield replaces it (CR 701.19a): damage is removed, it's tapped, and it
 * leaves combat. Returns true if it went to the graveyard.
 */
export function destroyPermanent(s: GameState, o: GameObject, message: string, noRegen = false): boolean {
  if (objHasKeyword(s, o, "Indestructible")) return false;
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

function removeFromCombat(s: GameState, o: GameObject) {
  if (o.blocking) {
    const att = s.objects[o.blocking];
    if (att?.blockedBy) att.blockedBy = att.blockedBy.filter((b) => b !== o.id);
  }
  if (o.blockedBy) for (const b of o.blockedBy) if (s.objects[b]) s.objects[b]!.blocking = undefined;
}

export function draw(s: GameState, pid: PlayerId, n = 1) {
  const p = player(s, pid);
  for (let i = 0; i < n; i++) {
    const top = p.library[0];
    if (!top) {
      p.drewFromEmptyLibrary = true; // CR 704.5b
      return;
    }
    moveObject(s, top, "hand");
  }
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

function advanceStep(s: GameState) {
  for (const p of s.players) p.manaPool = emptyPool(); // CR 500.4
  if (s.step === "cleanup") return startNextTurn(s);
  // CR 511.3: as the end of combat step ends, everything is removed from combat.
  if (s.step === "endCombat") for (const o of attackersAndBlockers(s)) clearCombat(o);
  const next = STEP_ORDER[STEP_ORDER.indexOf(s.step) + 1]!;
  beginStep(s, next);
}

function startNextTurn(s: GameState) {
  s.activePlayer = nextLivingAfter(s, s.activePlayer);
  s.turn++;
  for (const p of s.players) p.landsPlayedThisTurn = 0;
  for (const o of Object.values(s.objects)) o.activatedThisTurn = undefined; // "once each turn" (CR 602.5b)
  s.damagedThisTurn = undefined;
  s.lastKnown = undefined;
  log(s, `— Turn ${s.turn}: ${player(s, s.activePlayer).name} —`);
  beginStep(s, "untap");
}

/** Enter a step, perform its turn-based actions, and give the active player priority if the step has priority. */
function beginStep(s: GameState, step: Step) {
  s.step = step;
  s.passedInSuccession = [];
  s.priority = s.activePlayer;
  const ap = s.activePlayer;
  switch (step) {
    case "untap":
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (controllerOf(s, o) !== ap) continue;
        if (o.skipNextUntap) o.skipNextUntap = undefined;
        else if (!characteristics(s, o).doesntUntap) o.tapped = false; // CR 502.3
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
      draw(s, ap); // CR 504.1 (no one skips in multiplayer, CR 103.8c)
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
      dealCombatDamage(s, true);
      break;
    case "combatDamage":
      dealCombatDamage(s, false);
      break;
    case "endCombat":
      break;
    case "cleanup": {
      for (const o of attackersAndBlockers(s)) clearCombat(o);
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
  invalidateCharacteristics(s);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    o.damage = 0; // CR 514.2
    o.deathtouchDamage = false;
    o.regenShields = undefined; // "this turn" effects end
    o.preventNext = undefined;
  }
  for (const p of s.players) p.preventNext = undefined;
  s.preventCombatDamage = undefined;
  advanceStep(s);
}

function turnOrderFrom(s: GameState, pid: PlayerId): PlayerId[] {
  const i = s.turnOrder.indexOf(pid);
  return [...s.turnOrder.slice(i), ...s.turnOrder.slice(0, i)].filter((id) => !player(s, id).lost);
}

// ---------------------------------------------------------------------------
// Priority and the stack (CR 117, 405, 608)

function passPriority(s: GameState, pid: PlayerId) {
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
    return;
  }
  s.priority = nextLivingAfter(s, pid);
}

function resolveTop(s: GameState) {
  const item = s.stack.pop()!;
  if (item.kind === "ability") {
    const def = s.cards[item.sourceCardId!]!;
    if (item.body && beginResolution(s, item, item.body) === "fizzled") log(s, `${def.name}'s ability does nothing (its targets are gone).`);
    return;
  }
  if (!item.objectId) return;
  const o = obj(s, item.objectId);
  const d = defOf(s, o);
  if (isPermanentCard(d)) {
    const enchant = compileCard(d).enchant;
    if (enchant) {
      // An Aura spell's target is checked on resolution like any other (CR 608.2b); it enters attached to it (CR 303.4f).
      const t = item.targets?.[0];
      if (!t || t.kind !== "object" || !isLegalTarget(s, enchant, t, item.controller, d)) {
        log(s, `${d.name} does nothing (its target is gone).`);
        moveObject(s, o.id, "graveyard");
        return;
      }
      log(s, `${d.name} resolves and enters attached to ${nameOf(s, t.id)}.`);
      moveObject(s, o.id, "battlefield", { controller: item.controller, attachTo: t.id });
      return;
    }
    log(s, `${d.name} resolves and enters the battlefield.`);
    moveObject(s, o.id, "battlefield", { controller: item.controller, ...(item.x ? { x: item.x } : {}) });
    if (o.zone === "battlefield" && o.castAlt === "dash") dashed(s, o, item.controller);
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

// ---------------------------------------------------------------------------
// Player actions

function isMainPhase(s: GameState) {
  return s.step === "main1" || s.step === "main2";
}

/** Sorcery timing: your main phase, empty stack, you have priority. CR 307.1 */
export function canActAtSorcerySpeed(s: GameState, pid: PlayerId) {
  return !s.pending && s.activePlayer === pid && s.priority === pid && isMainPhase(s) && s.stack.length === 0;
}

function playLand(s: GameState, p: Player, id: ObjectId, untapped?: boolean) {
  const o = obj(s, id);
  const d = defOf(s, o);
  if (o.zone !== "hand" || o.owner !== p.id) throw new RulesError("land must be in your hand");
  if (!isType(d, "Land")) throw new RulesError(`${d.name} is not a land`);
  if (!canActAtSorcerySpeed(s, p.id)) throw new RulesError("lands can only be played at sorcery speed");
  if (p.landsPlayedThisTurn >= 1) throw new RulesError("already played a land this turn"); // CR 305.2
  const choice = compileCard(d).entersTappedChoice;
  if (untapped && !canEnterUntapped(s, p.id, id))
    throw new RulesError(choice?.kind === "payLife" ? `you can't pay ${choice.n} life` : choice ? `you have no ${choice.filter.text} to reveal` : `${d.name} has no choice to make as it enters`);
  p.landsPlayedThisTurn++;
  if (untapped && choice?.kind === "payLife") {
    p.life -= choice.n;
    log(s, `${p.name} pays ${choice.n} life so ${d.name} enters untapped.`);
  } else if (untapped && choice?.kind === "reveal") {
    const shown = p.hand.find((x) => x !== id && printedMatches(choice.filter, defOf(s, obj(s, x))))!;
    log(s, `${p.name} reveals ${nameOf(s, shown)} so ${d.name} enters untapped.`);
  }
  moveObject(s, id, "battlefield", { untapped });
  log(s, `${p.name} plays ${d.name}${obj(s, id).tapped ? " (tapped)" : ""}.`);
}

export function isSummoningSick(s: GameState, o: GameObject) {
  return o.controlledSinceTurn >= s.turn && !objHasKeyword(s, o, "Haste");
}

function activateMana(s: GameState, p: Player, id: ObjectId, mana: ManaType, index?: number) {
  const o = obj(s, id);
  const name = characteristics(s, o).name;
  const i = index ?? pickManaAbility(s, p.id, o, mana);
  if (i === undefined) throw new RulesError(`${name} can't produce {${mana}} right now`);
  const problem = manaAbilityProblem(s, p.id, o, i);
  if (problem) throw new RulesError(problem);
  const ab = manaAbilitiesOn(s, o)[i]!;
  if (!manaChoices(s, o, ab).includes(mana)) throw new RulesError(`${name} can't produce {${mana}}`);
  // What it makes is worked out before the costs change anything ("for each creature you control").
  const adds = manaProduced(s, o, ab, mana);
  const src = objectSource(s, o);
  // Pay the costs (CR 602.2b, 605.3a), then add the mana.
  if (ab.manaCost) p.manaPool = payFromPool(parseManaCost(ab.manaCost), p.manaPool)!.pool;
  if (ab.tap) o.tapped = true;
  if (ab.lifeCost) p.life -= ab.lifeCost;
  if (ab.energyCost) p.energy = (p.energy ?? 0) - ab.energyCost;
  if (ab.oncePerTurn) (o.activatedThisTurn ??= []).push(MANA_ABILITY_OFFSET + i);
  if (ab.sacrificeSelf) {
    log(s, `${p.name} sacrifices ${name} for mana.`);
    moveObject(s, id, "graveyard");
  }
  for (const m of adds) p.manaPool[m]++;
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
  const d = defOf(s, o);
  const fromCommand = o.zone === "command";
  const free = freeCastOf(s, pid) === id;
  // Casting it face down is an alternative cost: no other one can go with it (CR 118.9a).
  if (choices?.faceDown && (free || choices.via || choices.alt)) return "a face-down spell can't be cast that way";
  const via = graveyardCast(d, choices?.via);
  if (choices?.via && !via) return `${d.name} doesn't have ${describeVia(choices.via)}`;
  if (!free && via && (o.zone !== "graveyard" || o.owner !== pid)) return `${describeVia(via.kind)} works only from your graveyard`;
  // Flashback and jump-start only if the resulting spell is an instant or sorcery (CR 702.34a, 702.133a).
  if (via && (via.kind === "flashback" || via.kind === "jumpStart") && !isType(d, "Instant") && !isType(d, "Sorcery")) return `${d.name} isn't an instant or sorcery`;
  if (!free && !via && (!(o.zone === "hand" || (fromCommand && o.isCommander)) || o.owner !== pid))
    return o.zone === "graveyard" && compileCard(d).fromGraveyard?.length ? `choose how to cast ${d.name} from your graveyard` : "you can only cast spells from your hand or your commander";
  if (choices?.buyback && !compileCard(d).buyback) return `${d.name} doesn't have buyback`;
  if (choices?.alt) {
    if (!altCost(d, choices.alt)) return `${d.name} doesn't have ${choices.alt}`;
    // Only one alternative cost can be applied to a spell (CR 118.9a).
    if (via || free) return `${d.name} can't be cast for its ${choices.alt} cost this way`;
  }
  if (isType(d, "Land")) return "lands are played, not cast";
  if (!free && (s.priority !== pid || s.pending)) return "you don't have priority";
  const instantSpeed = isType(d, "Instant") || d.keywords.includes("Flash");
  if (!free && !instantSpeed && !canActAtSorcerySpeed(s, pid)) return `${d.name} can only be cast at sorcery speed`;
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
  if (free && x) return "X is 0 when a spell is cast without paying its mana cost";
  const kp = kickProblem(d, choices?.kicks);
  if (kp) return kp;
  if (via && x && via.mana && !parseManaCost(via.mana).hasX) return "X is 0 unless the cost you pay has {X}";
  const ap = additionalCostProblem(s, pid, o, choices);
  if (ap) return ap;
  const cost = costToPay(s, pid, o, convoke, improvise, x, choices?.kicks, { ...choices, targets });
  if (typeof cost === "string") return cost;
  if (!payFromPool(cost.cost, p.manaPool, cost.extra, p.life)) return `not enough mana for ${d.name}${tax ? ` (commander tax ${tax})` : ""}`;
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
  // "Without paying its mana cost": additional costs like kicker are still paid, and so are cost
  // increases (CR 118.9d, 601.2f).
  if (freeCastOf(s, pid) === o.id) return { cost: parseManaCost(kickCost), extra: Math.max(0, mods.more - mods.less) };
  const tax = o.zone === "command" ? commanderTax(player(s, pid), o) : 0;
  // {X} is generic mana, paid once for each {X} (CR 107.4b); reductions can take it down too (CR 601.2f).
  // Flashback and escape pay their cost instead of the mana cost (an alternative cost, CR 118.9).
  // So do evoke and dash (CR 702.74a, 702.109a).
  const base = how.faceDown ? "{3}" : (graveyardCast(d, how.via)?.mana ?? altCost(d, how.alt)?.mana ?? d.manaCost);
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
export const spellTargets = (s: GameState, id: ObjectId, modes?: number[]) => spellTargetSpecs(defOf(s, obj(s, id)), modes);

/** A modal spell's choices, if this card is one (CR 700.2). */
export const spellModes = (s: GameState, id: ObjectId) => compileCard(defOf(s, obj(s, id))).spell?.modal;

function castSpell(s: GameState, p: Player, id: ObjectId, targets?: TargetChoice[], modes?: number[], convoke?: ObjectId[], improvise?: ObjectId[], x?: number, choices: CostChoices = {}) {
  const o = obj(s, id);
  if (choices.faceDown && !o.faceDown) {
    const problem = castProblem(s, p.id, id, targets, modes, convoke, improvise, x, choices);
    if (problem) throw new RulesError(problem);
    o.faceDown = compileCard(defOf(s, o)).faceDownCast!.kind; // turned face down before it's put on the stack (CR 708.4)
  }
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
  const paid = payFromPool(cost.cost, p.manaPool, cost.extra, p.life)!;
  p.manaPool = paid.pool;
  p.life -= paid.lifePaid;
  for (const c of [...(convoke ?? []), ...(improvise ?? [])]) obj(s, c).tapped = true;
  const kicks = choices.kicks?.length ? [...choices.kicks].sort() : undefined;
  o.kicked = kicks;
  if (fromCommand) p.commanderCasts[o.id] = (p.commanderCasts[o.id] ?? 0) + 1;
  const castFrom = o.zone;
  const via = graveyardCast(d, choices.via);
  const from = zoneList(s, o)!;
  from.splice(from.indexOf(id), 1);
  o.zone = "stack";
  o.castFrom = castFrom;
  o.castVia = via?.kind;
  o.buyback = choices.buyback || undefined;
  o.castAlt = choices.alt;
  if (via?.exile) o.exileIfLeaves = "stack"; // CR 702.34a, 702.133a
  o.controller = p.id;
  o.timestamp = s.nextTimestamp++;
  const chosen = spell?.modal ? modes : undefined;
  const free = freeCastOf(s, p.id) === id;
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
  const convoked =
    (convoke?.length ? `, convoking with ${convoke.map((c) => nameOf(s, c)).join(", ")}` : "") +
    (improvise?.length ? `, improvising with ${improvise.map((c) => nameOf(s, c)).join(", ")}` : "");
  const kickText = kicks ? describeKicks(d, kicks) : "";
  const howText =
    (via ? ` from their graveyard (${describeVia(via.kind)})` : castFrom === "exile" ? " from exile" : "") +
    (choices.alt ? ` for its ${choices.alt} cost` : "") +
    (choices.buyback ? ", paying buyback" : "") +
    (choices.delve?.length ? `, exiling ${choices.delve.map((c) => nameOf(s, c)).join(", ")} from their graveyard (delve)` : "");
  if (o.faceDown) log(s, `${p.name} casts a face-down creature spell (${o.faceDown})${tax ? ` (commander tax ${tax})` : ""}.`);
  else log(s, `${p.name} casts ${d.name}${howText}${hasX ? ` with X=${x ?? 0}` : ""}${kickText}${free ? " without paying its mana cost" : ""}${tax ? ` (commander tax ${tax})` : ""}${chosen ? ` choosing "${body!.text.replace(/~/g, d.name).replace(/\.$/, "")}"` : ""}${describeTargets(s, targets)}${convoked}.`);
  for (const c of choices.delve ?? []) moveObject(s, c, "exile"); // CR 702.66a
  // Additional costs are paid with the mana (CR 601.2h); what they did is known to the spell.
  const sacrificed = payAdditionalCosts(s, p, d, choices, via?.costs ?? []);
  if (sacrificed.length) item.sacrificed = sacrificed;
  // Once it's cast, "whenever you cast" and "becomes the target" abilities trigger (CR 601.2i).
  fireEvent(s, { type: "cast", stackId, controller: p.id, card: d });
  fireEvent(s, { type: "targeted", stackId });
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
  if (k.multi || k.costs.length === 1) return kicks.length === 1 ? ", kicked" : `, kicked ${kicks.length === 2 ? "twice" : `${kicks.length} times`}`;
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

/** Can these additional costs be paid (CR 601.2b, 601.2f-h)? Without choices, just whether they could be. */
function additionalCostProblem(s: GameState, pid: PlayerId, o: GameObject, choices?: CostChoices): string | null {
  const d = defOf(s, o);
  return extraCostProblem(s, pid, o, [...(compileCard(d).additionalCosts ?? []), ...(graveyardCast(d, choices?.via)?.costs ?? [])], choices, `cast ${d.name}`);
}

/**
 * Can these costs beyond mana be paid, for a spell (`o` is the card being cast) or an ability (`o` is its
 * source)? Without choices, just whether they could be. `doing`: "cast X", "activate X's ability".
 */
function extraCostProblem(s: GameState, pid: PlayerId, o: GameObject, costs: AdditionalCost[], choices: CostChoices | undefined, doing: string): string | null {
  const d = defOf(s, o);
  const p = player(s, pid);
  const given = (k: "sacrifice" | "discard" | "exileCards") => choices?.[k];
  for (const k of ["sacrifice", "discard", "exileCards"] as const)
    if (given(k)?.length && !costs.some((c) => c.kind === (k === "exileCards" ? "exileFromGraveyard" : k))) return `${d.name} doesn't ask you to ${k === "exileCards" ? "exile cards" : k}`;
  for (const c of costs) {
    if (c.kind === "payLife") {
      if (p.life < c.n) return `you can't pay ${c.n} life`; // CR 119.4
      continue;
    }
    const pool =
      c.kind === "sacrifice"
        ? s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === pid && !(c.other && id === o.id) && objectMatches(s, c.filter, obj(s, id), pid, false))
        : c.kind === "discard"
          ? p.hand.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))) // it's on the stack by the time costs are paid (CR 601.2a)
          : p.graveyard.filter((id) => id !== o.id && (!c.filter || printedMatches(c.filter, defOf(s, obj(s, id))))); // "other cards" for escape
    const what =
      c.kind === "sacrifice"
        ? `${c.n === 1 ? (c.other ? "another" : "a") : c.n} ${c.filter.text}`
        : c.kind === "discard"
          ? c.filter
            ? `${c.n === 1 ? "a" : c.n} ${c.filter.text}`
            : `${c.n === 1 ? "a card" : `${c.n} cards`}`
          : `${c.n === 1 ? "a" : c.n} ${c.filter?.text ?? "card"}`;
    const verb = c.kind === "sacrifice" ? "sacrifice" : c.kind === "discard" ? "discard" : "exile";
    const chosen = given(c.kind === "exileFromGraveyard" ? "exileCards" : c.kind);
    if (!chosen) {
      if (pool.length < c.n) return `you need to ${verb} ${what} to ${doing}`;
      continue;
    }
    if (chosen.length !== c.n || new Set(chosen).size !== chosen.length || chosen.some((id) => !pool.includes(id))) return `choose ${what} to ${verb}`;
  }
  return null;
}

/** Pay a spell's additional costs; returns what was sacrificed as it last existed. */
function payAdditionalCosts(s: GameState, p: Player, d: CardDef, choices: CostChoices, more: AdditionalCost[] = []) {
  return payExtraCosts(s, p, [...(compileCard(d).additionalCosts ?? []), ...more], choices);
}

/** Pay costs beyond mana, for a spell or an ability; returns what was sacrificed as it last existed (CR 608.2h). */
function payExtraCosts(s: GameState, p: Player, costs: AdditionalCost[], choices: CostChoices) {
  const sacrificed: LastKnown[] = [];
  for (const c of costs) {
    if (c.kind === "payLife") {
      p.life -= c.n;
      log(s, `${p.name} pays ${c.n} life.`);
    } else if (c.kind === "sacrifice") {
      for (const id of choices.sacrifice ?? []) {
        const o = obj(s, id);
        const ch = characteristics(s, o);
        sacrificed.push({ power: ch.power, toughness: ch.toughness, manaValue: manaValue(parseManaCost(defOf(s, o).manaCost)), counters: { ...o.counters } });
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
    t.kind === "none" ? [] : t.kind === "player" ? player(s, t.id).name : t.kind === "object" ? nameOf(s, t.id) : (s.stack.find((x) => x.id === t.id)?.description ?? "a spell"),
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
  if (s.priority !== pid || s.pending) return "you don't have priority";
  if (ab.sorcerySpeed && !canActAtSorcerySpeed(s, pid)) return "activate only as a sorcery";
  if (ab.tap && o.tapped) return `${d.name} is tapped`;
  if (ab.tap && objIsType(s, o, "Creature") && isSummoningSick(s, o)) return `${d.name} has summoning sickness`; // CR 602.5a
  if (ab.oncePerTurn && o.activatedThisTurn?.includes(index)) return `${d.name}'s ability can be activated only once each turn`; // CR 602.5b
  if (ab.lifeCost && p.life < ab.lifeCost) return `you can't pay ${ab.lifeCost} life`; // CR 119.4
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
  if (ab.costs?.length || costs?.sacrifice?.length || costs?.discard?.length) {
    const cp = extraCostProblem(s, pid, o, ab.costs ?? [], costs, `activate ${d.name}'s ability`);
    if (cp) return cp;
  }
  const cost = parseManaCost(ab.manaCost);
  const xp = xProblem(cost, x);
  if (xp) return xp;
  if (!payFromPool(cost, p.manaPool, (x ?? 0) * xCount(cost), p.life)) return `not enough mana for ${d.name}'s ability`;
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
  if (ab?.costs?.some((c) => c.kind === "sacrifice" || c.kind === "discard") && !costs) throw new RulesError(abilityProblem(s, p.id, id, index) ?? "choose what to pay the cost with");
  const body = ab ? withModes(ab.body, modes) : undefined;
  const problem = abilityProblem(s, p.id, id, index, body?.targets.length ? (targets ?? []) : undefined, ab?.body.modal ? modes : undefined, tapCreatures, x, costs ?? {});
  if (problem || !ab || !body) throw new RulesError(problem ?? "no such ability");
  // Costs (CR 602.2b, 601.2g-h): mana, tapping, then sacrificing or discarding the card itself.
  const abCost = parseManaCost(ab.manaCost);
  const paid = payFromPool(abCost, p.manaPool, (x ?? 0) * xCount(abCost), p.life)!;
  // The source as it is now, for "its power" after it's sacrificed as a cost (CR 608.2h).
  const lki = o.zone === "battlefield" ? { power: power(s, o), toughness: toughness(s, o) } : undefined;
  p.manaPool = paid.pool;
  p.life -= paid.lifePaid + (ab.lifeCost ?? 0);
  if (ab.energyCost) p.energy = (p.energy ?? 0) - ab.energyCost;
  if (ab.oncePerTurn) (o.activatedThisTurn ??= []).push(index);
  if (ab.tap) o.tapped = true;
  for (const c of tapCreatures ?? []) obj(s, c).tapped = true;
  const sourceZc = o.zoneChanges ?? 0;
  const stamped = stampTargets(s, targets);
  const sacrificed = ab.costs?.length ? payExtraCosts(s, p, ab.costs, costs ?? {}) : [];
  if (ab.sacrificeSelf && o.zone === "battlefield" && (o.zoneChanges ?? 0) === sourceZc) moveObject(s, id, "graveyard");
  if (ab.discardSelf) moveObject(s, id, "graveyard");
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
  if (pend?.kind !== "pickPermanents" || pend.player !== p.id || !r?.scratch?.queue) throw new RulesError("nothing to pick");
  if (new Set(ids).size !== pend.count || ids.some((id) => !pend.options.includes(id))) throw new RulesError(`choose exactly ${pend.count} of the permanents offered`);
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
  if (!pend.options.includes(choice)) throw new RulesError(`${choice} isn't ${pend.what === "color" ? "a color" : pend.what === "creatureType" ? "a creature type" : "an option"} you can choose`);
  s.pending = null;
  if (pend.objectId) {
    const o = obj(s, pend.objectId);
    const entry = s.entersChoices?.shift();
    if (pend.what === "riot" || pend.what === "unleash") {
      // Riot: a +1/+1 counter, or haste for as long as it's on the battlefield (CR 702.136a). Unleash: a counter or not (CR 702.98a).
      if (choice === ENTERS_COUNTER) o.counters["+1/+1"] = (o.counters["+1/+1"] ?? 0) + 1;
      else if (pend.what === "riot")
        s.effects.push({ id: `e${s.nextId++}`, timestamp: s.nextTimestamp++, controller: o.controller, sourceName: pend.source, sourceId: o.id, duration: "game", affected: [o.id], mods: [{ kind: "addKeywords", keywords: ["Haste"] }] });
      log(s, `${pend.source} enters ${choice === ENTERS_COUNTER ? "with a +1/+1 counter" : pend.what === "riot" ? "with haste" : "without a counter"} (${pend.what}).`);
    } else {
      o.chosen = withChoice(o.chosen, pend.what, choice);
      log(s, `${p.name} chooses ${choice} for ${pend.source}.`);
    }
    invalidateCharacteristics(s);
    if (entry?.enters) fireEvent(s, { type: "enters", id: o.id, ...entry.enters });
    return;
  }
  const r = s.resolving;
  if (!r || pend.what === "riot" || pend.what === "unleash") throw new RulesError("nothing to choose");
  r.chosen = withChoice(r.chosen, pend.what, choice);
  log(s, `${p.name} chooses ${choice}.`);
  continueResolution(s);
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
    const paid = mana ? payFromPool(parseManaCost(mana), p.manaPool, 0, p.life - life) : null;
    if (mana && !paid) throw new RulesError(`not enough mana in your pool to pay ${mana}`);
    if (paid) {
      p.manaPool = paid.pool;
      p.life -= paid.lifePaid;
    }
    p.life -= life;
    p.energy = (p.energy ?? 0) - energy;
    log(s, `${p.name} pays ${describePay(pend.pay)} for ${pend.source}.`);
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
    const paid = payFromPool(parseManaCost(pend.cost), p.manaPool, 0, p.life - life);
    if (!paid) throw new RulesError(`not enough mana in your pool to pay ${pend.cost}`);
    p.manaPool = paid.pool;
    p.life -= paid.lifePaid + life;
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
  for (const id of ids) {
    log(s, `${p.name} discards ${nameOf(s, id)}.`);
    moveObject(s, id, "graveyard");
  }
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

function clearCombat(o: GameObject) {
  o.attacking = undefined;
  o.blocking = undefined;
  o.blockedBy = undefined;
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
  for (const a of attacks) {
    const o = obj(s, a.attacker);
    o.attacking = a.defender;
    if (!objHasKeyword(s, o, "Vigilance")) o.tapped = true; // CR 508.1f
    log(s, `${defOf(s, o).name} attacks ${player(s, a.defender).name}.`);
  }
  for (const a of attacks) fireEvent(s, { type: "attacks", id: a.attacker }); // CR 508.3a
  if (attacks.length === 1) fireEvent(s, { type: "attacksAlone", id: attacks[0]!.attacker }); // CR 506.5
  s.pending = null;
  if (attacks.length === 0) {
    log(s, `${p.name} declares no attackers.`);
    beginStep(s, "endCombat"); // CR 508.8
  }
}

function declareBlockers(s: GameState, p: Player, blocks: { blocker: ObjectId; attacker: ObjectId }[]) {
  const pend = s.pending;
  if (pend?.kind !== "declareBlockers" || pend.player !== p.id) throw new RulesError("not declaring blockers now");
  const seen = new Set<ObjectId>();
  const count: Record<ObjectId, number> = {};
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const at = obj(s, b.attacker);
    const bd = defOf(s, bl);
    const ad = defOf(s, at);
    if (controllerOf(s, bl) !== p.id || bl.zone !== "battlefield" || !objIsType(s, bl, "Creature") || bl.tapped)
      throw new RulesError(`${bd.name} can't block`);
    if (seen.has(bl.id)) throw new RulesError(`${bd.name} can only block one creature`);
    if (at.attacking !== p.id) throw new RulesError(`${ad.name} isn't attacking you`);
    const problem = blockProblem(s, bl, at);
    if (problem) throw new RulesError(problem);
    seen.add(bl.id);
    count[at.id] = (count[at.id] ?? 0) + 1;
  }
  for (const [atId, n] of Object.entries(count)) {
    if (n < 2 && objHasKeyword(s, obj(s, atId), "Menace")) throw new RulesError(`${nameOf(s, atId)} has menace`); // CR 702.111b
    if (n > 1 && characteristics(s, obj(s, atId)).maxOneBlocker) throw new RulesError(`${nameOf(s, atId)} can't be blocked by more than one creature`); // CR 509.1b
  }
  // "Can't block alone": the only creature declared as a blocker this combat blocks alone (CR 506.5).
  const earlier = s.battlefield.filter((id) => obj(s, id).blocking !== undefined).length;
  if (blocks.length === 1 && !earlier && characteristics(s, obj(s, blocks[0]!.blocker)).cantBlockAlone) throw new RulesError(`${nameOf(s, blocks[0]!.blocker)} can't block alone`);
  const req = blockRequirementProblem(s, p.id, blocks);
  if (req) throw new RulesError(req);
  for (const b of blocks) {
    const bl = obj(s, b.blocker);
    const at = obj(s, b.attacker);
    bl.blocking = at.id;
    (at.blockedBy ??= []).push(bl.id);
    log(s, `${defOf(s, bl).name} blocks ${defOf(s, at).name}.`);
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
  if (!demanding.length) return null;
  const blocking = new Map(blocks.map((b) => [b.blocker, b.attacker]));
  const earlier = s.battlefield.some((id) => obj(s, id).blocking !== undefined);
  const mine = creaturesOf(s, pid).filter((o) => !o.tapped && !characteristics(s, o).cantBlock && !(characteristics(s, o).cantBlockAlone && !earlier && blocks.length <= 1 && !blocking.has(o.id)));
  const obeys = (b: GameObject) => {
    const at = blocking.get(b.id);
    return at !== undefined && demanding.some((a) => a.id === at);
  };
  for (const at of demanding) {
    const ac = characteristics(s, at);
    const could = mine.filter((b) => !blockProblem(s, b, at));
    if (could.length < (objHasKeyword(s, at, "Menace") ? 2 : 1)) continue;
    if (ac.allMustBlock && !ac.maxOneBlocker) {
      const shirk = could.find((b) => !obeys(b));
      if (shirk) return `${characteristics(s, shirk).name} must block ${ac.name} (all creatures able to block it do so)`;
    }
    const blocked = blocks.some((b) => b.attacker === at.id);
    if (!blocked && could.some((b) => !obeys(b))) return `${ac.name} must be blocked if able`;
  }
  return null;
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

/** Combat damage is dealt simultaneously (CR 510.2); we compute all assignments first, then apply. */
function dealCombatDamage(s: GameState, firstStrikeStep: boolean) {
  type Hit = { source: GameObject; toPlayer?: PlayerId; toObject?: GameObject; amount: number };
  const hits: Hit[] = [];
  for (const at of attackers(s)) {
    if (!dealsDamageThisStep(s, at, firstStrikeStep)) continue;
    let dmg = power(s, at);
    if (dmg <= 0) continue;
    if (!at.blockedBy) {
      hits.push({ source: at, toPlayer: at.attacking!, amount: dmg });
      continue;
    }
    const blockers = at.blockedBy.map((id) => obj(s, id));
    if (blockers.length === 0) {
      if (objHasKeyword(s, at, "Trample")) hits.push({ source: at, toPlayer: at.attacking!, amount: dmg }); // CR 702.19e
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
    const at = s.objects[bl.blocking];
    const dmg = power(s, bl);
    if (at && at.zone === "battlefield" && dmg > 0) hits.push({ source: bl, toObject: at, amount: dmg });
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
  for (const h of hits) {
    const src = sources.get(h.source.id)!;
    const opts = { combat: true, lifelink: lifelink.get(h.source.id)! };
    let n = 0;
    if (h.toPlayer !== undefined) {
      n = dealDamage(s, src, { player: h.toPlayer }, h.amount, opts);
      if (n) fireEvent(s, { type: "combatDamageToPlayer", id: h.source.id, player: h.toPlayer, amount: n });
    } else if (h.toObject) n = dealDamage(s, src, { object: h.toObject }, h.amount, opts);
    dealt.set(h.source.id, (dealt.get(h.source.id) ?? 0) + n);
  }
  for (const [id, gained] of lifelink) gainLife(s, sources.get(id)!.controller, gained.n);
  // "Whenever ~ deals (combat) damage": once per creature, for all it dealt this step (CR 510.2, 603.2c).
  for (const [id, n] of dealt) if (n) fireEvent(s, { type: "dealtDamage", id, amount: n, combat: true });
}

// ---------------------------------------------------------------------------
// State-based actions (CR 704) and leaving the game (CR 800.4)

function afterAction(s: GameState) {
  runStateBasedActions(s);
}

export function runStateBasedActions(s: GameState) {
  if (s.resolving) return; // not while a spell or ability is partway through resolving (CR 704.3)
  if (!s.pending && askEntersChoice(s)) return;
  for (let guard = 0; guard < 100; guard++) {
    invalidateCharacteristics(s);
    syncControl(s);
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
      if (!o.isToken || o.zone === "battlefield" || o.zone === "stack") continue;
      const list = zoneList(s, o);
      if (list) list.splice(list.indexOf(o.id), 1);
      delete s.objects[o.id];
      changed = true;
    }
    if (!changed) break;
  }
  checkGameOver(s);
  // Then waiting triggered abilities go on the stack before anyone gets priority (CR 117.5).
  if (!s.over && processTriggerQueue(s, turnOrderFrom(s, s.activePlayer))) s.passedInSuccession = [];
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
      // Protection from the Aura's color makes it illegal too (CR 702.16c).
      const legal = !!host && host.zone === "battlefield" && host.id !== o.id && !!enchant && objectMatches(s, enchant, host, c.controller, false, c);
      if (!legal) {
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
    if (o.seenController === undefined) o.seenController = now;
    else if (o.seenController !== now) {
      o.seenController = now;
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
  if (s.monarch === pid) {
    // The active player becomes the monarch, or if it's them leaving, the next player in turn order (CR 725.4).
    s.monarch = undefined;
    const order = s.turnOrder;
    const from = order.indexOf(s.activePlayer);
    const next = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, order.length).map((i) => order[(from + i) % order.length]!).find((id) => !player(s, id).lost);
    if (next !== undefined) becomeMonarch(s, next);
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
export function legalActions(s: GameState, pid: PlayerId): Action[] {
  if (waitingOn(s) !== pid) return [];
  if (s.pending) return [];
  const p = player(s, pid);
  const out: Action[] = [{ type: "passPriority", player: pid }];
  for (const id of p.hand) {
    const d = defOf(s, obj(s, id));
    if (isType(d, "Land")) {
      if (canActAtSorcerySpeed(s, pid) && p.landsPlayedThisTurn < 1) out.push({ type: "playLand", player: pid, objectId: id });
    } else if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
  }
  for (const id of p.command) if (canCast(s, pid, id) && !spellTargets(s, id).length && !spellModes(s, id)) out.push({ type: "castSpell", player: pid, objectId: id });
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (controllerOf(s, o) !== pid) continue;
    manaAbilitiesOn(s, o).forEach((ab, i) => {
      if (manaAbilityProblem(s, pid, o, i)) return;
      for (const m of manaChoices(s, o, ab)) out.push({ type: "activateMana", player: pid, objectId: id, mana: m, ability: i });
    });
  }
  return out;
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
  const fd = compileCard(realDefOf(s, o)).faceDownCast;
  if (!fd) return "it has no morph or disguise cost"; // CR 702.37e
  if (!payFromPool(parseManaCost(fd.cost), player(s, pid).manaPool)) return `not enough mana to turn it face up (${fd.cost})`;
  return null;
}

/** The cost of turning a face-down permanent face up, if it has one. */
export const faceUpCost = (s: GameState, o: GameObject) => (o.faceDown ? compileCard(realDefOf(s, o)).faceDownCast : undefined);

function turnFaceUp(s: GameState, p: Player, id: ObjectId) {
  const problem = turnFaceUpProblem(s, p.id, id);
  if (problem) throw new RulesError(problem);
  const o = obj(s, id);
  const fd = compileCard(realDefOf(s, o)).faceDownCast!;
  p.manaPool = payFromPool(parseManaCost(fd.cost), p.manaPool)!.pool;
  // Its copiable values go back to the card's (CR 708.8); it's the same permanent, so nothing "enters".
  o.faceDown = undefined;
  invalidateCharacteristics(s);
  const d = defOf(s, o);
  log(s, `${p.name} turns a face-down creature face up: it's ${d.name} (${describeVia(fd.kind)} ${fd.cost}).`);
  // Megamorph: a +1/+1 counter as it's turned face up, if its megamorph cost was paid (CR 702.37b).
  if (fd.kind === "megamorph") o.counters["+1/+1"] = (o.counters["+1/+1"] ?? 0) + 1;
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


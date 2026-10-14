import type { AbilityBody, AltCostKind, CastFromGraveyardKind, ChoiceKind, CounterKind, EntersOption, Modification, PayCost, PickAction, StaticCondition, TargetChoice, TargetSpec } from "./abilities";

// Core data model for the rules engine. Everything in GameState is plain JSON so a
// game can be serialized, replayed, sent over a network, or snapshotted for undo.

export type Color = "W" | "U" | "B" | "R" | "G";
export const COLORS: readonly Color[] = ["W", "U", "B", "R", "G"];
export type ManaType = Color | "C";

export type PlayerId = number;
export type ObjectId = string;

/** Static, printed characteristics of a card (one per oracle card). CR 109.3 */
export interface CardDef {
  oracleId: string;
  name: string;
  manaCost: string; // Scryfall notation, e.g. "{2}{W}{U}"
  cmc: number;
  typeLine: string;
  supertypes: string[]; // Legendary, Basic, Snow, World
  types: string[]; // Creature, Instant, Land, ...
  subtypes: string[];
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors: Color[];
  colorIdentity: Color[];
  keywords: string[];
  producedMana?: ManaType[];
  imageUrl?: string;
  artUrl?: string;
}

/** How a face-down spell or permanent got that way (CR 708): which ability lets it be turned face up. */
export type FaceDownKind = "morph" | "megamorph" | "disguise";

export type ZoneName = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "stack" | "command";

/** A game object (card or token) in some zone. CR 109 */
export interface GameObject {
  id: ObjectId;
  cardId: string; // key into GameState.cards
  /** A copy effect's values (CR 707.2), a key into GameState.cards: Clone as it entered, until it leaves. */
  copyOf?: string;
  owner: PlayerId;
  /**
   * The player it came under the control of when it entered its zone (or who cast it).
   * Control-changing effects apply on top of this in layer 2, so read the current
   * controller with `controllerOf`, never this field. CR 108.4, 613.1b
   */
  controller: PlayerId;
  zone: ZoneName;
  /** When it entered its zone, or (for Auras/Equipment) last became attached. CR 613.7d-e */
  timestamp: number;
  /** The permanent this Aura or Equipment is attached to. CR 301.5, 303.4 */
  attachedTo?: ObjectId;
  /** Controller as of the last control check, to notice control changes (summoning sickness, combat). */
  seenController?: PlayerId;
  tapped: boolean;
  /** Turn number the current controller gained control of it (summoning sickness, CR 302.6). */
  controlledSinceTurn: number;
  damage: number;
  deathtouchDamage: boolean;
  counters: Record<string, number>;
  isCommander: boolean;
  isToken: boolean;
  /** A copy of a spell (CR 707.10): not a card; it ceases to exist off the stack (707.10a), or becomes a token (608.3f). */
  spellCopy?: boolean;
  /** Regeneration shields made this turn (CR 701.19a); each replaces one destruction. */
  regenShields?: number;
  /** "Prevent the next N damage that would be dealt to it this turn": what's left of such shields (CR 615.7). */
  preventNext?: number;
  /** Activated abilities (by index) activated this turn, for "activate only once each turn" (CR 602.5b). */
  activatedThisTurn?: number[];
  /** Renown's designation (CR 702.112b), until it leaves the battlefield. */
  renowned?: boolean;
  /** "~ doesn't untap during your next untap step" (from a mana ability like Cinder Marsh's). */
  skipNextUntap?: boolean;
  /** The permanents that dealt it damage this turn, for "whenever a creature dealt damage by ~ this turn dies". */
  damagedBy?: ObjectId[];
  /** "If that creature would die this turn, exile it instead": the turn that replacement lasts for (CR 614.1a). */
  exileIfDiesTurn?: number;
  /**
   * "Until the end of your next turn, you may play that card" (impulse draw): who may play it from exile,
   * while it's still the same object (`zc`), until the end of this turn or of their next turn.
   */
  mayPlay?: { player: PlayerId; zc: number; until: "thisTurn" | "nextTurn"; turn: number };
  /** Attack/block bookkeeping, cleared at end of combat. */
  attacking?: PlayerId;
  blocking?: ObjectId;
  blockedBy?: ObjectId[];
  /** Set when a commander lands in graveyard/exile; consumed by the SBA in CR 903.9a. */
  justMovedForCommander?: boolean;
  /**
   * How many times it has changed zones. A card that changes zones is a new object with no
   * memory of its old one (CR 400.7), so targets and abilities remember this number and stop
   * applying when it changes.
   */
  zoneChanges?: number;
  /** As a spell, and as the permanent it became: the kicker costs paid for it, by index (CR 702.33d). */
  kicked?: number[];
  /** As a spell: the zone it was cast from, how (flashback, escape, ...), and whether buyback was paid. */
  castFrom?: ZoneName;
  castVia?: CastFromGraveyardKind;
  buyback?: boolean;
  /** As a spell, and as the permanent it became: evoke or dash paid (CR 702.74a, 702.109a). */
  castAlt?: AltCostKind;
  /**
   * Face down (CR 708): a 2/2 creature with no name, text, subtypes or mana cost (with ward {2} for
   * disguise). Only its controller may look at it (CR 708.5).
   */
  faceDown?: FaceDownKind;
  /** Cards this permanent exiled "until ~ leaves the battlefield" (CR 610.3), as they are in exile. */
  exiledUntilLeaves?: { id: ObjectId; zc: number }[];
  /** A replacement effect: if it would leave this zone, it's exiled instead (flashback, CR 702.34a; unearth, 702.84a). */
  exileIfLeaves?: ZoneName;
  /** "As ~ enters, choose a creature type / color": what was chosen (CR 614.12). Forgotten when it leaves (CR 400.7). */
  chosen?: Chosen;
}

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  library: ObjectId[]; // index 0 is the top
  hand: ObjectId[];
  graveyard: ObjectId[];
  exile: ObjectId[];
  command: ObjectId[];
  manaPool: Record<ManaType, number>;
  landsPlayedThisTurn: number;
  /** Times each commander (by object id) has been cast from the command zone. CR 903.8 */
  commanderCasts: Record<ObjectId, number>;
  /** Poison counters (CR 122.1f); ten or more loses the game (CR 704.5c). */
  poison?: number;
  /** Energy counters (CR 107.14, 122.1). */
  energy?: number;
  /** The turns this player's current and previous upkeeps began, for echo's "since the beginning of your last upkeep" (CR 702.30a). */
  upkeepTurn?: number;
  lastUpkeepTurn?: number;
  /** What's left of "prevent the next N damage that would be dealt to [this player] this turn" shields (CR 615.7). */
  preventNext?: number;
  /** Combat damage received from each commander, keyed by commander object id. CR 903.10a */
  commanderDamage: Record<ObjectId, number>;
  lost: boolean;
  lossReason?: string;
  drewFromEmptyLibrary: boolean;
  /** Cards drawn in turn `turn`, for "whenever you draw your second card each turn". */
  draws?: { turn: number; n: number };
  /** The turn this player last attacked with a creature, for raid's "if you attacked this turn". */
  attackedTurn?: number;
  isBot: boolean;
}

export type Step =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "beginCombat"
  | "declareAttackers"
  | "declareBlockers"
  | "firstStrikeDamage"
  | "combatDamage"
  | "endCombat"
  | "main2"
  | "end"
  | "cleanup";

export interface StackItem {
  id: string;
  kind: "spell" | "ability";
  objectId?: ObjectId; // the card on the stack, for spells
  sourceId?: ObjectId; // the permanent an ability came from
  sourceCardId?: string; // its card definition (abilities remember their source, CR 113.7a)
  sourceZc?: number; // the source's zoneChanges when the ability was created: "this creature" means that object only
  controller: PlayerId;
  description: string;
  /** For a triggered ability: the spell or ability on the stack that triggered it ("that spell", ward). */
  cause?: string;
  /** What it does: for a modal spell or ability, just the chosen modes (CR 700.2). */
  body?: AbilityBody;
  targets?: TargetChoice[];
  /** Chosen modes, for display. */
  modes?: number[];
  /** For a triggered ability: the object its event was about (exalted's attacker), see PendingTrigger.subject. */
  subject?: { id: ObjectId; zc: number };
  /** For a state trigger: which of its source's triggered abilities it is (CR 603.8). */
  stateIndex?: number;
  lki?: LastKnown;
  /** The value of X announced while casting or activating it (CR 107.3a), or a spell's X for its permanent's ETB trigger (CR 107.3m). */
  x?: number;
  /** Kicker costs paid (CR 702.33d), for a spell or its permanent's enters trigger. */
  kicked?: number[];
  /** What its trigger event was about: the damage dealt ("that much"), the player dealt it ("that player"). */
  event?: TriggerEventInfo;
  /** What was sacrificed to cast it, as it last existed ("the sacrificed creature's power", CR 608.2h). */
  sacrificed?: LastKnown[];
  /** A triggered ability's intervening "if": it does nothing unless this is still true as it resolves (CR 603.4). */
  ifCond?: StaticCondition;
  /** For a spell: how many spells were cast before it this turn (storm, CR 702.40a). */
  castNth?: number;
  /** A copy of a spell (CR 707.10), not cast. */
  copy?: boolean;
}

/**
 * A delayed triggered ability (CR 603.7): "at the beginning of the next end step" or "at the
 * beginning of your next upkeep". It triggers once, about `subject` (the card as it was then).
 */
export interface DelayedTrigger {
  when: "nextEndStep" | "yourNextUpkeep" | "nextTurnUpkeep" | "endOfCombat";
  controller: PlayerId;
  sourceCardId: string;
  subject: { id: ObjectId; zc: number };
  body: AbilityBody;
  /** Made during an end step, "the next end step" is the following turn's (CR 603.7c doesn't fire it in the same step). */
  turn: number;
  step: Step;
}

/** A triggered ability waiting to be put on the stack. CR 603.3 */
export interface PendingTrigger {
  sourceId: ObjectId;
  sourceCardId: string;
  controller: PlayerId;
  index: number; // which of the card's triggered abilities
  sourceZc?: number; // the source's zoneChanges when it triggered
  modes?: number[]; // once chosen, for a modal trigger (CR 603.3c)
  cause?: string; // the stack item that triggered it, see StackItem.cause
  /** The object the event was about, as it was then ("that creature" for exalted). */
  subject?: { id: ObjectId; zc: number };
  /** Last known information the ability needs: the counters on a permanent that left, evolve's creature's P/T. */
  lki?: LastKnown;
  /** For an enters trigger of a permanent that was a spell with X: that X (CR 107.3m). */
  x?: number;
  kicked?: number[];
  /** What its trigger event was about: the damage dealt ("that much"), the player dealt it ("that player"). */
  event?: TriggerEventInfo;
  /** A delayed trigger's own ability (its source card has no such printed ability). */
  body?: AbilityBody;
  /** Its intervening "if" (CR 603.4), checked again as it resolves. */
  ifCond?: StaticCondition;
}

export interface LastKnown {
  counters?: Record<string, number>;
  power?: number;
  toughness?: number;
  manaValue?: number;
  /** The player a creature returned for ninjutsu was attacking (CR 702.49c). */
  attacking?: PlayerId;
}

/** Choices for a spell's additional costs (CR 601.2b, 601.2f-h). */
export interface CostChoices {
  /** Kicker costs to pay, by index; multikicker's index 0 once per time (CR 702.33). */
  kicks?: number[];
  /** Casting from a graveyard: which way (flashback, jump-start, retrace, escape). */
  via?: CastFromGraveyardKind;
  /** Pay the buyback cost (CR 702.27a). */
  buyback?: boolean;
  /** Cast it for its evoke or dash cost instead of its mana cost (CR 118.9). */
  alt?: AltCostKind;
  /** Delve (CR 702.66a): cards exiled from your graveyard, each paying for {1}. */
  delve?: ObjectId[];
  /** Cast it face down for {3} with its morph or disguise ability (CR 702.37c, 702.168b). */
  faceDown?: boolean;
  /** Permanents to sacrifice, cards to discard, cards to exile from your graveyard. */
  sacrifice?: ObjectId[];
  discard?: ObjectId[];
  exileCards?: ObjectId[];
  /** Permanents to return to their owner's hand: ninjutsu's unblocked attacker (CR 702.49a). */
  returnToHand?: ObjectId[];
}

/**
 * A continuous effect created by a resolving spell or ability (CR 611.2). The objects it
 * affects are locked in when it begins (CR 611.2c). Continuous effects from static
 * abilities aren't stored: they're generated from the permanents on the battlefield
 * whenever characteristics are computed (CR 611.3), see layers.ts.
 */
export interface ContinuousEffect {
  id: string;
  timestamp: number; // CR 613.7b
  controller: PlayerId;
  sourceName: string;
  sourceId?: ObjectId;
  /** "endOfTurn" ends in the cleanup step (CR 514.2); "game" lasts until the game ends (CR 611.2a). */
  duration: "endOfTurn" | "game";
  affected: ObjectId[];
  mods: Modification[];
}

/** What the engine is waiting on from a specific player, beyond normal priority. */
export type PendingDecision =
  | { kind: "declareAttackers"; player: PlayerId }
  | { kind: "declareBlockers"; player: PlayerId; remaining: PlayerId[] }
  | { kind: "discardToHandSize"; player: PlayerId; count: number }
  /** A resolving spell or ability makes this player discard `count` cards of their choice (CR 701.9b). */
  | { kind: "discard"; player: PlayerId; count: number; source: string }
  /** Scry or surveil (CR 701.22, 701.25): `cards` are the top of their library, top first. */
  | { kind: "arrangeTop"; player: PlayerId; how: "scry" | "surveil"; cards: ObjectId[]; source: string }
  /** "You may ...": whether to do it, decided as the ability resolves (CR 603.5, 608.2d). */
  | { kind: "chooseMay"; player: PlayerId; prompt: string; source: string; card?: ObjectId; pay?: PayCost; /** Pay to keep a permanent: echo, cumulative upkeep. */ keep?: boolean }
  /**
   * "Counter that spell or ability unless its controller pays {2}" (ward, CR 702.21a). The player
   * may activate mana abilities first (CR 605.3a), then pays or declines.
   */
  | { kind: "payUnless"; player: PlayerId; cost: string; life?: number; source: string; what: string }
  /**
   * "You may cast that card without paying its mana cost" (cascade, CR 702.85a), as an ability
   * resolves: answered by casting it (castSpell, targets and modes as usual) or chooseMay "no".
   */
  | { kind: "castFree"; player: PlayerId; objectId: ObjectId; source: string }
  /**
   * Before the game: keep this opening hand or take a mulligan (CR 103.5). `taken` is how many
   * mulligans this player has taken so far; `bottomIfKept` how many cards keeping now costs.
   */
  | { kind: "mulligan"; player: PlayerId; taken: number; bottomIfKept: number; canMulligan: boolean }
  /** After keeping, put this many cards from the hand on the bottom of the library (CR 103.5). */
  | { kind: "bottomCards"; player: PlayerId; count: number }
  /**
   * Searching your library (CR 701.23): `cards` are the ones that match; pick between `min` and
   * `max` of them. With `firstTo`, the first one picked goes there and the rest to `othersTo`.
   */
  | { kind: "searchLibrary"; player: PlayerId; source: string; what: string; cards: ObjectId[]; min: number; max: number; firstTo?: string; othersTo?: string; /** Picking from the top of the library: all the cards looked at, and where the rest go. */ dig?: { looked: ObjectId[]; to: string; rest: string } }
  /**
   * Choosing a creature type or a color by name: as a permanent enters (`objectId`, CR 614.12) or
   * while a spell or ability resolves. `options` are the names allowed.
   */
  /** `labels`: what to show for each option, when the options are ids (entering as a copy of a permanent). */
  | { kind: "chooseOption"; player: PlayerId; source: string; what: ChoiceKind | EntersOption; options: string[]; labels?: string[]; objectId?: ObjectId }
  /**
   * "Sacrifice a creature", "return a land you control to its owner's hand": pick `count` of `options`
   * (your own permanents) as a spell or ability resolves.
   */
  | { kind: "pickPermanents"; player: PlayerId; source: string; action: PickAction; what: string; options: ObjectId[]; count: number; /** For "counters": the kind put on the picked permanent. */ counter?: CounterKind }
  | { kind: "chooseTargets"; player: PlayerId; sourceId: ObjectId; specs: TargetSpec[]; description: string }
  /**
   * A copy of a spell may get new targets (CR 707.10c): keep them all, or choose new legal ones. `copyOf` is the
   * spell's description; `left` counts this copy and the ones after it.
   */
  | { kind: "copyTargets"; player: PlayerId; source: string; copyOf: string; specs: TargetSpec[]; current: TargetChoice[]; left: number }
  /** A modal triggered ability is being put on the stack (CR 603.3c). `legal[i]`: mode i can be chosen (CR 700.2b). */
  | { kind: "chooseModes"; player: PlayerId; sourceId: ObjectId; description: string; min: number; max: number; modes: string[]; legal: boolean[] };

export interface GameEvent {
  seq: number;
  turn: number;
  text: string;
}

export interface GameState {
  /**
   * Permanents that left the battlefield in the current event (one effect, or one pass of state-based
   * actions): their leaves-the-battlefield abilities look back and see each other leave (CR 603.10a).
   */
  leftTogether?: { id: ObjectId; controller: PlayerId; hadAbilities: boolean; granted?: string[]; attachedTo?: ObjectId }[];
  /** Cards exiled by a permanent's linked exile ability (CR 607.2a), by `${source id}@${its zone changes}`. */
  linkedExile?: Record<string, { id: ObjectId; zc: number }[]>;
  /** "When you next cast an instant or sorcery spell this turn, copy that spell": delayed triggers on a cast (CR 603.7). */
  nextCast?: { controller: PlayerId; filter: TargetSpec; sourceId: ObjectId; sourceCardId: string; body: AbilityBody; turn: number }[];
  /** Spells cast this turn, by anyone (storm, CR 702.40a). */
  spellsCastThisTurn?: number;
  /** Each spell cast this turn as it was cast, by stack id: what a copy of it copies if it has left the stack (CR 707.10). */
  castItems?: Record<string, StackItem>;
  seed: number;
  rngState: number;
  turn: number;
  activePlayer: PlayerId;
  priority: PlayerId;
  step: Step;
  /** Players who have passed priority in succession without any action. CR 117.4 */
  passedInSuccession: PlayerId[];
  turnOrder: PlayerId[];
  players: Player[];
  objects: Record<ObjectId, GameObject>;
  cards: Record<string, CardDef>;
  battlefield: ObjectId[];
  stack: StackItem[];
  triggerQueue: PendingTrigger[];
  effects: ContinuousEffect[];
  /** "Prevent all combat damage that would be dealt this turn" (Fog) is in effect until cleanup. */
  preventCombatDamage?: boolean;
  /** Players dealt damage this turn, for bloodthirst (CR 702.54a). */
  damagedThisTurn?: PlayerId[];
  /**
   * Power and toughness of permanents as they last existed on the battlefield (CR 608.2h), for
   * "destroy target creature; you gain life equal to its power". `zc` is its zoneChanges while it
   * was there. Cleared each turn.
   */
  /** Delayed triggered abilities waiting for their moment (CR 603.7): unearth's exile, rebound's cast. */
  delayed?: DelayedTrigger[];
  /** The player who is the monarch (CR 725), once someone has become it. */
  monarch?: PlayerId;
  /** How permanents were as they last existed on the battlefield (CR 608.2h); `attachedTo` with that permanent's zoneChanges then. */
  lastKnown?: Record<ObjectId, { zc: number; power: number; toughness: number; controller: PlayerId; attachedTo?: { id: ObjectId; zc: number } }>;
  nextTimestamp: number;
  pending: PendingDecision | null;
  /** The mulligan process before the first turn (CR 103.5), or null once everyone has kept. */
  mulligans?: MulliganState | null;
  /** A spell or ability partway through resolving, waiting on `pending` (see continueResolution). */
  resolving: Resolving | null;
  /** Permanents that just entered and still have an "as ~ enters, choose ..." choice to make (CR 614.12). */
  /**
   * Choices made as permanents enter (CR 614.12), still to ask. `enters`: its enters event waits for
   * the choice (riot, unleash: whether it has a +1/+1 counter as it enters matters to what triggers).
   */
  entersChoices?: { id: ObjectId; zc: number; what: ChoiceKind | EntersOption; except?: string; enters?: { x?: number }; enterOpts?: { x?: number; tapped?: boolean; untapped?: boolean; counters?: Record<string, number>; escaped?: boolean } }[];
  nextId: number;
  log: GameEvent[];
  winner: PlayerId | null;
  over: boolean;
}

/**
 * A spell or ability that stopped partway through resolving for a player's choice. Its
 * effects run in order (CR 608.2c); `next` is the one waiting, and `scratch` holds choices
 * made for it so far. No player gets priority and state-based actions aren't checked until
 * it finishes (CR 608.2, 704.3).
 */
export interface MulliganState {
  /** Mulligans each player has taken so far. */
  taken: Record<string, number>;
  /** Players who have kept their hand. */
  kept: PlayerId[];
  /** Players still to declare this round, in turn order from the starting player. */
  toDeclare: PlayerId[];
  /** Players who declared a mulligan this round; they all take it once everyone has declared. */
  going: PlayerId[];
}

/** A creature type and/or color chosen for an object or a resolving spell. */
export interface Chosen {
  type?: string;
  color?: Color;
}

/** What a trigger event was about, beyond its object: "you gain that much life", "that player discards a card". */
export interface TriggerEventInfo {
  amount?: number;
  player?: PlayerId;
}

export interface Resolving {
  item: StackItem;
  body: AbilityBody;
  legal: boolean[]; // which targets were legal as it began resolving (CR 608.2b)
  /** Who controlled each targeted spell as resolution began, for "its controller" after it's countered (CR 608.2h). */
  spellControllers?: (PlayerId | null)[];
  /** The cards of targeted spells, for "its mana value" after it's countered (CR 608.2h). */
  spellObjects?: (ObjectId | null)[];
  /** The tokens its last "create" made, for "put a counter on it". */
  created?: ObjectId[];
  /** Permanents its damage effects dealt damage to, for "a creature dealt damage this way". */
  damagedThisWay?: ObjectId[];
  /** "Choose a creature type / a color": what was chosen, for the rest of its instructions. */
  chosen?: Chosen;
  next: number;
  /** Whether the last "you may ..." was done, for a following "If you do, ..." (CR 608.2c). */
  did?: boolean;
  scratch?: {
    queue?: PlayerId[]; // players still to choose, in APNAP order (CR 101.4)
    chosen?: Record<string, ObjectId[]>; // cards each player chose to discard
    arranged?: { top: ObjectId[]; away: ObjectId[] };
    may?: boolean; // the answer to "you may ..."
    paid?: boolean; // the answer to "unless that player pays ..."
    explored?: ObjectId; // the nonland card explore revealed, waiting on "graveyard or top?"
    cascade?: { exiled: ObjectId[]; hit?: ObjectId }; // cards cascade exiled, and the one it may cast
    n?: number; // an amount the effect worked out before waiting on a player (CR 608.2h)
    found?: ObjectId[]; // the cards a library search found
    looked?: ObjectId[]; // the top cards a "look at the top N" effect is choosing from
    connive?: { pid: PlayerId; id?: ObjectId; zc?: number }; // who connives, and the conniving permanent (CR 701.50)
    copies?: { of: string; left: number; targets?: TargetChoice[] }; // spell copies still to make, and the next one's targets
  };
}

/** Everything a player can do. Every input to the engine is one of these. */
export type Action =
  | { type: "passPriority"; player: PlayerId }
  /** `untapped`: for a land that may enter untapped by paying life or revealing a card (CR 614.12), do that. */
  | { type: "playLand"; player: PlayerId; objectId: ObjectId; untapped?: boolean }
  /**
   * Activate a mana ability (CR 605.3): `ability` indexes manaAbilitiesOn (unset: the cheapest
   * one that makes `mana`), `mana` is the choice for one that offers several.
   */
  | { type: "activateMana"; player: PlayerId; objectId: ObjectId; mana: ManaType; ability?: number }
  /** `convoke`: creatures tapped to help pay (CR 702.51a); `improvise`: artifacts (CR 702.126a). */
  | ({ type: "castSpell"; player: PlayerId; objectId: ObjectId; targets?: TargetChoice[]; modes?: number[]; convoke?: ObjectId[]; improvise?: ObjectId[]; x?: number } & CostChoices)
  /** `tapCreatures`: the creatures tapped to pay a crew cost (CR 702.122a). */
  /** `costs`: what's sacrificed or discarded to pay for it (see ActivatedAbility.costs). */
  | { type: "activateAbility"; player: PlayerId; objectId: ObjectId; index: number; targets?: TargetChoice[]; modes?: number[]; tapCreatures?: ObjectId[]; x?: number; costs?: CostChoices }
  | { type: "chooseModes"; player: PlayerId; modes: number[] }
  | { type: "chooseTargets"; player: PlayerId; targets: TargetChoice[] }
  /** New targets for a spell copy, or none to keep the original's (CR 707.10c). */
  | { type: "copyTargets"; player: PlayerId; targets?: TargetChoice[] }
  | { type: "declareAttackers"; player: PlayerId; attacks: { attacker: ObjectId; defender: PlayerId }[] }
  | { type: "declareBlockers"; player: PlayerId; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: "discard"; player: PlayerId; objectIds: ObjectId[] }
  /** Answer to arrangeTop: `top` goes back on top in this order (first = top); `away` goes to the bottom (scry) or graveyard (surveil). */
  | { type: "arrangeTop"; player: PlayerId; top: ObjectId[]; away: ObjectId[] }
  /** Answer to searchLibrary: the cards found (first = the one for `firstTo`). */
  | { type: "searchLibrary"; player: PlayerId; found: ObjectId[] }
  /** Answer to pickPermanents. */
  | { type: "pickPermanents"; player: PlayerId; ids: ObjectId[] }
  /** Answer to chooseOption: one of its options. */
  | { type: "chooseOption"; player: PlayerId; choice: string }
  /** Answer to chooseMay. */
  | { type: "chooseMay"; player: PlayerId; yes: boolean }
  /** Answer to mulligan: keep the hand, or shuffle it away and draw a new one. */
  | { type: "mulligan"; player: PlayerId; keep: boolean }
  /** Answer to bottomCards: these cards go on the bottom of the library, the first one lowest. */
  | { type: "bottomCards"; player: PlayerId; objectIds: ObjectId[] }
  /** Turn a face-down permanent face up by paying its morph or disguise cost: a special action (CR 116.2b, 702.37e). */
  | { type: "turnFaceUp"; player: PlayerId; objectId: ObjectId }
  /** Answer to payUnless: pay the cost from your mana pool, or let it be countered. */
  | { type: "payUnless"; player: PlayerId; pay: boolean }
  | { type: "concede"; player: PlayerId };

export class RulesError extends Error {}

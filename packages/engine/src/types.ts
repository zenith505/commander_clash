import type { AbilityBody, AltCostKind, DamageRuleSpec, ManaSpend, CastFromGraveyardKind, ChoiceKind, CostMod, NamePurpose, CounterKind, DamageMod, EntersOption, Modification, PayCost, PickAction, PunisherOption, StaticCondition, TargetChoice, TargetSpec, TriggeredAbility, TriggerDuration } from "./abilities";
import type { DamageEvent } from "./damage";
import type { Characteristics } from "./layers";

// Core data model for the rules engine. Everything in GameState is plain JSON so a
// game can be serialized, replayed, sent over a network, or snapshotted for undo.

/**
 * A redirection shield (CR 614.9) for the next `n` damage that would be dealt to the permanent or player it's on this
 * turn: that damage is dealt to `to` instead, by the same source. It does nothing while `to` is gone or isn't a
 * creature or planeswalker any more.
 */
export interface RedirectShield {
  id: string;
  n: number;
  to: { object: ObjectId; zc: number } | { player: PlayerId };
  /** The card whose effect made it, for the log. */
  source: string;
}

/**
 * A prevention or redirection effect from a resolved spell or ability, until the turn ends (CR 615, 614.9): what a
 * "damageRule" effect made, with its choices made and targets fixed as it resolved. `to` and `by` are checked when
 * damage would be dealt (CR 611.2c, 609.7b).
 */
export interface DamageRule {
  id: string;
  turn: number;
  /** "You": who made it, the player "you" and "your" refer to, and who chose the source. */
  controller: PlayerId;
  /** The card that made it, a key into `cards`: its name for the log, and the source of the damage `dealBack` deals. */
  cardId: string;
  combat?: "only" | "non";
  to?: { players?: "you" | "opponents" | "all"; objects?: TargetSpec; object?: { id: ObjectId; zc: number }; player?: PlayerId };
  /**
   * `chosen`: the source chosen (CR 609.7a), as the object it was then; `spell`: it was a spell, so the permanent it
   * becomes is that source too. `filter`: what the source has to be when it would deal the damage (CR 609.7b).
   */
  by?: { chosen?: { id: ObjectId; zc: number; spell?: true }; filter?: TargetSpec };
  /** What's left of "the next N damage" (CR 615.7). */
  left?: number;
  /** "The next time": it applies to the next damage event it can, then it's used up (CR 615.8). */
  nextTime?: true;
  redirect?: { object: ObjectId; zc: number } | { player: PlayerId };
  gainLife?: { colors?: Color[] };
  dealBack?: { colors?: Color[] };
}

/** Each player's starting life total in Commander (CR 903.7). */
export const STARTING_LIFE = 40;

export type Color = "W" | "U" | "B" | "R" | "G";
export const COLORS: readonly Color[] = ["W", "U", "B", "R", "G"];
export type ManaType = Color | "C";
/** The mana spent to cast a spell by type (CR 601.2h), and how much of each type a snow source made (`snow`, CR 107.4h). */
export type SpentMana = Partial<Record<ManaType, number>> & {
  /** How much of it a snow source made, by type (CR 107.4h). */
  snow?: Partial<Record<ManaType, number>>;
  /** How much of it a Treasure, a creature or an artifact made (CR 106.3). */
  from?: Partial<Record<"treasure" | "creature" | "artifact", number>>;
};

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
  /** A battle's printed defense (CR 310.4a). */
  defense?: string;
  colors: Color[];
  colorIdentity: Color[];
  keywords: string[];
  producedMana?: ManaType[];
  /** A double-faced token's back face (CR 111.10i, 712): what it becomes as it transforms (CR 701.27a). */
  tokenBack?: CardDef;
  /**
   * A mutating creature spell (CR 702.140a): it targets a non-Human creature with this owner, the spell's (see
   * mutatingDef). Set only on the definition a mutating spell uses on the stack.
   */
  mutateOwner?: PlayerId;
  imageUrl?: string;
  artUrl?: string;
  /** Scryfall's layout: "normal", "split", "flip", "transform", "modal_dfc", "meld", "adventure", "prepare", ... */
  layout?: string;
  /**
   * Every face of a card with more than one, in printed order: the halves of a split card (CR 709), a flip card's two
   * halves (710), the front and back of a double-faced card (712), an adventurer card's creature and Adventure (715),
   * a preparation card's creature and prepare spell (722). In the card data the fields above are its first face's,
   * except `name` ("A // B"), `cmc`, `colorIdentity`, `keywords` and `producedMana`, which are the whole card's; in a
   * game the card has its resting characteristics (faces.ts restingDef) and each face a definition of its own (faceDef).
   */
  faces?: CardFace[];
  /** A face's own definition (faces.ts faceDef): the card it's a face of, and which face. */
  faceOf?: { oracleId: string; face: number };
  /** A double-faced token's card, made as a copy of a double-faced object (CR 707.8a): its back face has mana value 0 (202.3b). */
  dfcCopy?: true;
  /**
   * A transforming double-faced card's back face, when its front face has More Than Meets the Eye: that cost, to cast
   * the card converted (CR 702.162a), with this face up on the stack.
   */
  convertCost?: string;
  /** A Room permanent's definition (faces.ts roomDef): the doors it has unlocked (CR 709.5c), whose text it has. */
  roomDoors?: number[];
  /**
   * A meld pair (CR 712.4, 712.5): the two cards that meld and the melded permanent they become. A melded permanent's
   * card exists only as the back faces of the pair (712.4b), so the card named `result` can't be in a deck.
   */
  meld?: { parts: string[]; result: string };
}

/** One face of a card with several (CardDef.faces). Each face has its own characteristics (CR 709.1, 712.8a). */
export interface CardFace {
  name: string;
  manaCost: string; // "" for a face with none, such as a transforming card's back face (CR 202.1b)
  typeLine: string;
  supertypes: string[];
  types: string[];
  subtypes: string[];
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  /** A battle's defense (CR 310.4). */
  defense?: string;
  /** From its mana cost and color indicator (CR 105.2, 202.2); a flip card's bottom half has the card's (CR 710.1c). */
  colors: Color[];
  /** A color indicator: the colors of a face with no mana cost, usually a back face (CR 204). */
  colorIndicator?: Color[];
  /** Its keywords (the card's list is the whole card's): set on a game's resting definition (restingDef). */
  keywords?: string[];
  /** Only a face printed on its own side has its own image (a double-faced card's back); the others share the card's. */
  imageUrl?: string;
  artUrl?: string;
}

/** How a face-down spell or permanent got that way (CR 708): which ability lets it be turned face up. */
/** How it became face down: cast with morph, megamorph or disguise, or put onto the battlefield manifested or cloaked (CR 701.40, 701.58). */
export type FaceDownKind = "morph" | "megamorph" | "disguise" | "manifest" | "cloak";

/**
 * "merged": a card or token that's a component of a merged permanent other than the permanent's own object (CR 730.2):
 * it's part of that permanent (GameObject.mergedInto), in no zone list of its own.
 */
export type ZoneName = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "stack" | "command" | "phasedOut" | "merged";

/** A game object (card or token) in some zone. CR 109 */
export interface GameObject {
  id: ObjectId;
  cardId: string; // key into GameState.cards
  /**
   * The face of its card that's up, an index into CardDef.faces (faces.ts): the half of a split card or the face of a
   * modal double-faced card cast (CR 709.3, 712.11b), an Adventure (715.3), a transformed permanent's back face
   * (712.8e), a flipped permanent (710.1b). Unset, it has its card's resting characteristics. Only on the stack and the
   * battlefield (a new object anywhere else, CR 400.7).
   */
  face?: number;
  /** A copy effect's values (CR 707.2), a key into GameState.cards: Clone as it entered, until it leaves. */
  copyOf?: string;
  /**
   * "Becomes a copy" effects on it (CR 707.4), in timestamp order. Each one overwrites every copiable value, so the
   * latest decides (CR 613.2a); `until` is when it ends (see CopyEffect). They end with the object (CR 400.7).
   */
  copyEffects?: CopyEffect[];
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
  /**
   * Only on a snapshot of a permanent that left the battlefield (look back in time, CR 603.10a): what was attached to it,
   * for "whenever a modified creature you control dies" (TargetSpec.status).
   */
  lastAttachments?: ObjectId[];
  /** The player this Aura with "enchant player" is attached to. CR 303.4, 702.5d */
  attachedToPlayer?: PlayerId;
  /** Controller as of the last control check, to notice control changes (summoning sickness, combat). */
  seenController?: PlayerId;
  tapped: boolean;
  /** Turn number the current controller gained control of it (summoning sickness, CR 302.6). */
  controlledSinceTurn: number;
  /** Turn number it last entered the battlefield ("activate only if ~ entered this turn"); phasing in isn't entering (CR 702.26d). */
  enteredTurn?: number;
  damage: number;
  deathtouchDamage: boolean;
  counters: Record<string, number>;
  /** When keyword counters of each kind were last put on it (CR 613.7c): their effect's timestamp in layer 6. */
  counterTimestamps?: Record<string, number>;
  isCommander: boolean;
  isToken: boolean;
  /** An emblem in its owner's command zone (CR 114): neither a card nor a permanent, its abilities working there (114.4). */
  emblem?: true;
  /** A double-faced token (an Incubator) with its back face up (CR 111.10i, 701.27a): a transformed permanent. */
  tokenBackUp?: true;
  /** A spell cast for its mutate cost: a mutating creature spell (CR 702.140a). */
  mutating?: true;
  /**
   * A merged permanent (CR 730.2): its components top first, this object's own card or token among them. Its own
   * card's token and commander status, which the merged permanent's may not be (730.2d, 903.3c), are `ownToken` and
   * `ownCommander`. Its characteristics are a copy effect (GameObject.copyEffects, 730.2a).
   */
  merged?: { parts: ObjectId[]; ownToken: boolean; ownCommander: boolean };
  /** A component of a merged permanent (zone "merged"): the permanent's object. */
  mergedInto?: ObjectId;
  /**
   * A melded permanent (CR 701.42, 712.4a): the key of the combined back face it has the characteristics of (712.8g).
   * It's this card's object, represented by this card and its counterpart (`merged.parts`, the other one in "merged").
   */
  melded?: string;
  /** How many times it has mutated (CR 702.140d): "where X is the number of times ~ has mutated". */
  mutations?: number;
  /**
   * The other components of the merged permanent this object was, as they left the battlefield with it (CR 730.3c):
   * an effect that finds this new object finds them too.
   */
  movedWith?: { id: ObjectId; zc: number }[];
  /** A copy of a spell (CR 707.10): not a card; it ceases to exist off the stack (707.10a), or becomes a token (608.3f). */
  spellCopy?: boolean;
  /** "The copy gains haste and ..." (Nalfeshnee): an effect on the copy, which goes on applying to the token it becomes (CR 400.7a). */
  copyGains?: { mods: Modification[]; timestamp: number; controller: PlayerId; source: string };
  /** Regeneration shields made this turn (CR 701.19a); each replaces one destruction. */
  regenShields?: number;
  /** "Prevent the next N damage that would be dealt to it this turn": what's left of such shields (CR 615.7). */
  preventNext?: number;
  /** "The next N damage that would be dealt to it this turn is dealt to [X] instead" (CR 614.9, 615.7). */
  redirectNext?: RedirectShield[];
  /** Activated abilities (by index, once per activation) activated this turn, for "activate only once each turn" (CR 602.5b). */
  activatedThisTurn?: number[];
  /** Exhaust abilities activated since it became this object (CR 702.177a, 400.7): their indexes. */
  activatedEver?: number[];
  /**
   * Its "triggers only once each turn" abilities that triggered this turn, and ("do:" and the may's text) its "you may
   * ... Do this only once each turn" abilities done this turn (CR 603.2h), as "zoneChanges|text": a new object starts
   * over (CR 400.7), and one that just left the battlefield still remembers (see onceUsed).
   */
  triggeredThisTurn?: string[];
  /**
   * "Choose one that hasn't been chosen [this turn]" (Demonic Pact, Gala Greeters): the modes chosen so far for each such
   * ability of this object, keyed by the ability's text, with the turn for "this turn". Any player's choices count, and a
   * new object starts over (rulings on Demonic Pact, CR 400.7).
   */
  modesChosen?: Record<string, { modes: number[]; turn: number }>;
  /** The players whose spells and abilities targeted it this turn, each once ("for the first time each turn"). */
  targetedThisTurn?: { turn: number; by: PlayerId[] };
  /** Renown's designation (CR 702.112b), until it leaves the battlefield. */
  renowned?: boolean;
  /** Monstrous (CR 701.37b): a designation it keeps until it leaves the battlefield. */
  monstrous?: boolean;
  /**
   * Suspected (CR 701.60): a designation, not copiable (701.60b), until it leaves the battlefield or an effect ends it. It
   * gives menace and "can't block" (701.60c) with the timestamp it became suspected, so losing all abilities later removes
   * them but not the designation (rulings).
   */
  suspected?: number;
  /** A Class's level (CR 716.2a-b), a designation it keeps until it leaves the battlefield; unset is level 1 (716.2d). */
  classLevel?: number;
  /** A Case's solved designation (CR 719.3b), kept until it leaves the battlefield; not a copiable value. */
  solved?: true;
  /** How many times it has transformed on the battlefield (CR 701.27f). */
  transforms?: number;
  /**
   * The prepared designation (CR 722.3a), until it leaves the battlefield or becomes unprepared; not a copiable value
   * (rulings). `copy`: the copy of its prepare spell in exile (722.3c), none while it's phased out.
   */
  prepared?: { copy?: ObjectId };
  /**
   * A Room permanent's unlocked designations (CR 709.5c): the doors (0 left, 1 right) that are unlocked. Set as it
   * enters (709.5d), for as long as it's on the battlefield; not a copiable value.
   */
  unlocked?: number[];
  /** A copy of a prepare spell in exile (CR 722.3c): the prepared permanent it was created for, as that object. */
  preparedFrom?: { id: ObjectId; zc: number };
  /** Saddled (CR 702.171b): until end of turn or until it leaves the battlefield. */
  saddled?: true;
  /** It escaped: the spell that became this permanent was cast with escape (CR 702.138b). */
  escaped?: boolean;
  /** "~ doesn't untap during your next untap step" (from a mana ability like Cinder Marsh's). */
  skipNextUntap?: boolean;
  /** The permanents that dealt it damage this turn, for "whenever a creature dealt damage by ~ this turn dies". */
  damagedBy?: ObjectId[];
  /** It was dealt damage this turn (forgotten in the cleanup step, CR 514.2, and when it leaves the battlefield). */
  wasDealtDamage?: true;
  /** "If that creature would die this turn, exile it instead": the turn that replacement lasts for (CR 614.1a). */
  exileIfDiesTurn?: number;
  /** "It can't be regenerated this turn": the turn its regeneration shields don't apply (CR 701.19c). */
  noRegenTurn?: number;
  /** "~ assigns no combat damage this turn": the turn (CR 510.1). */
  noCombatDamageTurn?: number;
  /**
   * "Until the end of your next turn, you may play that card" (impulse draw): who may play it from exile,
   * while it's still the same object (`zc`), until the end of this turn or of their next turn, or ("exiled") for as
   * long as it stays exiled. A warped card
   * (CR 702.185a) and a plotted card (CR 702.170d) may only be cast, by their owner, on a later turn than `turn`,
   * for as long as they stay exiled; a plotted one without paying its mana cost, as a sorcery. "yourNextTurn": until
   * that player's next turn begins (Three Wishes); "source": while `source` stays on the battlefield (Intet);
   * "yourNextEndStep": until that player's next end step begins (Yasmin Khan). "adventure": a card that went on an
   * adventure (CR 715.3d), for as long as it stays exiled, but not cast as an Adventure again this way.
   */
  mayPlay?: {
    player: PlayerId;
    zc: number;
    until: "thisTurn" | "nextTurn" | "exiled" | "warp" | "plot" | "foretell" | "yourNextTurn" | "source" | "yourNextEndStep" | "adventure";
    turn: number;
    source?: { id: ObjectId; zc: number };
    /** "Without paying its mana cost" (CR 118.9). */
    free?: true;
    /** "Mana of any type can be spent to cast it" (CR 609.4b). */
    anyType?: true;
    /** "You may cast that card": not played as a land (rulings on Rev, Tithe Extractor). */
    castOnly?: true;
    /** Airbend's "by paying {2} rather than paying its mana cost" (CR 701.65a): an alternative cost, the only way. */
    cost?: string;
    /** "A spell cast this way costs {2} more to cast" (Soul Partition, Elite Spellbinder). */
    more?: number;
  };
  /**
   * Foretold (CR 702.143a, 702.143c): exiled face down with foretell, which only its owner may look at; still so as the
   * spell it's cast as, for "if this spell was foretold".
   */
  foretold?: true;
  /** The turn its "once each turn, you may cast ... from the top of your library" was used (Johann). */
  topUsedTurn?: number;
  /** The turn it was last exerted (CR 701.43), for "if ~ hasn't been exerted this turn". */
  exertedTurn?: number;
  /** How many times it has attacked in turn `turn` ("creatures that attacked this turn", Moraug), as this object (CR 400.7). */
  attacked?: { turn: number; n: number; /** The players it attacked (not their planeswalkers). */ players?: PlayerId[]; /** It attacked a battle this turn (War Historian). */ battle?: true };
  /**
   * The turn it last could have been declared as an attacker, as this object (CR 508.1a): it was one of the active
   * player's creatures able to attack as a declare attackers step began. Season of the Witch spares "creatures that
   * couldn't attack" (rulings: even if something could have enabled it).
   */
  couldAttack?: number;
  /** Attack/block bookkeeping, cleared at end of combat. */
  attacking?: PlayerId;
  /**
   * The planeswalker it's attacking, if it attacks one: `attacking` is then that planeswalker's controller, the
   * defending player (CR 506.2, 802.2a). Once the planeswalker is removed from combat, the creature attacks nothing
   * but is still attacking (CR 506.4c).
   */
  attackingPermanent?: { id: ObjectId; zc: number; /** A battle it attacks: the battle's controller then, which mustn't change (CR 506.4). */ battleController?: PlayerId };
  /**
   * Provoked: it must block this attacking creature this combat if able (CR 702.39a), cleared at end of combat; or,
   * with `turn`, any combat of that turn ("target creature blocks ~ this turn if able").
   */
  provokedBy?: { id: ObjectId; zc: number; turn?: number };
  /** "Target creature can't block ~ this turn" (Duct Crawler): the attackers it can't block that turn, while it's still the object at `selfZc` (CR 400.7). */
  cantBlockThis?: { id: ObjectId; zc: number; turn: number; selfZc: number }[];
  /** The attackers it blocks: one, or more if it can block additional creatures (CR 509.1a, 509.1g). */
  blocking?: ObjectId[];
  blockedBy?: ObjectId[];
  /** The attacking band it's in (CR 702.22c), for the rest of combat or until it's removed from combat (702.22e-f). */
  band?: string;
  /** Set when a commander lands in graveyard/exile; consumed by the SBA in CR 903.9a. */
  justMovedForCommander?: boolean;
  /**
   * How many times it has changed zones. A card that changes zones is a new object with no
   * memory of its old one (CR 400.7), so targets and abilities remember this number and stop
   * applying when it changes.
   */
  zoneChanges?: number;
  /** How many times it has untapped as this object: "for as long as ~ remains tapped" ends at the next (CR 611.2b). */
  untaps?: number;
  /** As a spell, and as the permanent it became: the kicker costs paid for it, by index (CR 702.33d). */
  kicked?: number[];
  /** As a spell, and as the permanent it became: the colors of mana spent to cast it (sunburst, CR 702.44a). */
  colorsSpent?: Color[];
  /** The amount of mana spent to cast it (CR 601.2h), kept by the permanent the spell becomes. */
  manaSpent?: number;
  /** The mana spent to cast it by type (CR 601.2h), kept by the permanent the spell becomes ("if {U} was spent"). */
  spent?: SpentMana;
  /** A Phantom creature's last combat damage step ("turn:step") that removed a counter: one per damage event. */
  phantomEvent?: string;
  /**
   * Phased out (CR 702.26b): `zone` is "phasedOut", but it hasn't changed zones (CR 702.26d), so it keeps its
   * zoneChanges. `by`: the player it phased out under the control of, whose untap step phases it in (702.26a).
   * `indirect`: it phased out with the permanent it's attached to, and phases in with it (702.26g).
   * `host`: for an Aura or Equipment that phased out directly, what it was attached to (702.26i).
   * `released`: `by` left the game and their next turn would have begun, so it phases in at the next untap step (702.26n).
   */
  phased?: { by: PlayerId; indirect?: true; host?: { id: ObjectId; zc: number }; released?: true };
  /** As a spell: the zone it was cast from, how (flashback, escape, ...), and whether buyback was paid. */
  castFrom?: ZoneName;
  /** On the battlefield: it entered as a spell cast from its owner's hand ("if you cast it from your hand"). */
  castFromHand?: true;
  /** It entered from the stack as a resolving permanent spell (not a copy), for "when ~ enters, if you cast it". */
  wasCast?: true;
  /** On the battlefield: it entered from a graveyard, its owner's, for "when ~ enters from a graveyard" (CR 603.6a). */
  enteredFromGraveyard?: true;
  castVia?: CastFromGraveyardKind;
  buyback?: boolean;
  /** The turn this card was discarded into its owner's graveyard; cleared when it moves again (mayhem, CR 702.187b). */
  discardedTurn?: number;
  /** As a spell, and as the permanent it became: evoke or dash paid (CR 702.74a, 702.109a). */
  castAlt?: AltCostKind;
  /** A spell cast for its sneak cost: whom the creature returned to pay it was attacking (CR 702.190b). */
  sneak?: LastKnown;
  /** As a spell, and as the permanent it became: it was bargained (CR 702.166b). */
  bargained?: true;
  /** As a spell, and as the permanent it became: its "you may collect evidence N" additional cost was paid (CR 701.59c). */
  evidence?: true;
  /** As a spell, and as the permanent it became: how much mana from Treasures was spent to cast it (CR 106.3). */
  treasureSpent?: number;
  /** A spell: "that creature enters with an additional +1/+1 counter on it" (Boreal Outrider, CR 614.1c), as it resolves. */
  extraCounters?: Record<string, number>;
  /** Tribute (CR 702.104): the opponent chosen as it entered, and whether they put the +1/+1 counters on it. */
  tribute?: { to: PlayerId; paid?: true };
  /**
   * Exiled face down by hideaway (CR 702.75a): only players who controlled `by`, the permanent that exiled it, may look
   * at it (`seen`). Gone when it changes zones.
   */
  hiddenExile?: { by: ObjectId; seen: PlayerId[]; /** What its back says ("Face down"); hideaway's by default. */ label?: string };
  /** Cards exiled encoded on this permanent with cipher (CR 702.99b-c), as they are in exile. Gone when it leaves. */
  encoded?: { id: ObjectId; zc: number }[];
  /**
   * Exiled by haunt (CR 702.55b): the creature it haunts, as it was on the battlefield then (its zone changes). "The
   * creature it haunts" is that object whether or not it's still a creature. Gone when this card leaves exile.
   */
  haunting?: { id: ObjectId; zc: number };
  /** As a spell: it was cast using teamwork (its optional "tap creatures with total power N" cost was paid). */
  teamwork?: true;
  /** As a spell, and as the permanent it became: the opponent its gift was promised to (CR 702.174a, k). */
  gift?: PlayerId;
  /**
   * Face down (CR 708): a 2/2 creature with no name, text, subtypes or mana cost (with ward {2} for
   * disguise). Only its controller may look at it (CR 708.5).
   */
  faceDown?: FaceDownKind;
  /** Cards this permanent exiled "until ~ leaves the battlefield" (CR 610.3), as they are in exile; `hand`: it came from a hand and goes back there. */
  exiledUntilLeaves?: { id: ObjectId; zc: number; hand?: true }[];
  /** Cast as a prototyped spell (CR 718.3): its alternative mana cost, color, power and toughness, on the stack and the battlefield. */
  prototyped?: boolean;
  /** Revealed for miracle as it was drawn (CR 702.94b): it stays revealed while it's in hand and its trigger waits. */
  miracleRevealed?: { turn: number; zc: number };
  /** A spell cast for its overload cost (CR 702.96a): "target" in its text is "each" while it's on the stack. */
  overloaded?: true;
  /**
   * The card this champion exiled (CR 702.72a), as it is in exile, and the champion's zoneChanges on the battlefield
   * then: its leaves-the-battlefield trigger returns it only if that's the permanent that left (CR 607.2a).
   */
  championed?: { id: ObjectId; zc: number; by: number };
  /** A replacement effect: if it would leave this zone, it's exiled instead (flashback, CR 702.34a; unearth, 702.84a). */
  exileIfLeaves?: ZoneName;
  /** A spell: "if that spell would be put into your graveyard, exile it instead" (Torrential Gearhulk, CR 614.1a). */
  exileIfToGraveyard?: true;
  /** "As ~ enters, choose a creature type / color": what was chosen (CR 614.12). Forgotten when it leaves (CR 400.7). */
  chosen?: Chosen;
  /** A battle's protector (CR 310.9), chosen as it enters (310.9a) and again when that player can't be (704.5x-y). */
  protector?: PlayerId;
  /** How many permanents it devoured as it entered (CR 702.82b), for "for each creature it devoured". */
  devoured?: number;
  /**
   * Cast bestowed (CR 702.103b): as a spell and as the permanent it becomes, it's an Aura with enchant creature, not a
   * creature (see defOf). It stops being bestowed when it becomes unattached or resolves with an illegal target (702.103e-f).
   */
  bestowed?: boolean;
  /** A creature spell cast with suspend has haste until this player loses control of it (CR 702.62a). */
  suspendHaste?: PlayerId;
  /** Soulbond (CR 702.95b): the creature it's paired with (that object, by its zone changes) and who paired them. */
  paired?: { id: ObjectId; zc: number; by: PlayerId };
}

/**
 * A copy effect that began after the permanent entered (CR 707.4): `key` is the copiable values, a key into
 * GameState.cards. It lasts for the rest of the game, until end of turn (CR 514.2), or until `turnOf`'s next
 * turn begins (CR 611.2a; if that player has left, until it would have begun, CR 800.4m).
 */
export interface CopyEffect {
  key: string;
  timestamp: number;
  until?: "endOfTurn" | { turnOf: PlayerId };
}

/**
 * What a mana's source was as it made the mana (CR 106.3): snow mana pays {S} (107.4h); "mana from a Treasure", "mana
 * from a creature", "mana from an artifact".
 */
export type ManaOrigin = "snow" | "treasure" | "creature" | "artifact";

/**
 * `n` of the `mana` in a player's pool that's set apart from the rest (counted in manaPool too): it can only be spent
 * as `only` says (CR 106.6), its source was `from` (106.3), or it isn't lost as steps end (`keep`: until end of turn,
 * or firebending's until end of combat, 702.189a). Mana of a type not in any lot is plain mana.
 */
export interface ManaLot {
  mana: ManaType;
  n: number;
  only?: ManaSpend;
  /** Sorted, without repeats. */
  from?: ManaOrigin[];
  keep?: "turn" | "combat";
}

export interface Player {
  /** How many times their library has been shuffled (see rng.ts shuffleLibrary). */
  shuffles?: number;
  /** "You have no maximum hand size for the rest of the game" from a resolved spell or ability (CR 402.2). */
  noMaxHandSize?: true;
  /** Epic (CR 702.50a-b): "for the rest of the game, you can't cast spells", and the spell that said so. */
  cantCastSpells?: string;
  /** The names of paradigm spells this player has had resolve (CR 702.192a): only the first of each name counts. */
  paradigms?: string[];
  /**
   * "Skip your next untap step / draw step / combat phase / turn" (CR 614.10): each entry skips one, the next to happen;
   * `turn`: only during that turn ("skips their next combat phase this turn").
   */
  skips?: { what: SkipWhat; turn?: number }[];
  id: PlayerId;
  name: string;
  life: number;
  library: ObjectId[]; // index 0 is the top
  hand: ObjectId[];
  graveyard: ObjectId[];
  exile: ObjectId[];
  command: ObjectId[];
  manaPool: Record<ManaType, number>;
  /** The mana in the pool that's restricted, from a source that matters, or kept as steps end (see ManaLot). */
  manaLots?: ManaLot[];
  landsPlayedThisTurn: number;
  /** "You may play an additional land this turn" (CR 305.2a): how many more this turn (`turn`). */
  extraLands?: { turn: number; n: number };
  /** Speed (CR 702.179): none until a rule sets it, then 1 to 4. `speedTurn`: the turn its inherent ability last triggered. */
  speed?: number;
  speedTurn?: number;
  /**
   * What this player gained until end of turn ("You gain shroud until end of turn", "you gain protection from the chosen
   * player"): Hexproof, Shroud or a protection keyword (CR 702.11d, 702.16b-e, 702.18d), lost in the cleanup step (514.2).
   */
  gained?: string[];
  /** The same, until this player's next turn ("you gain protection from that player until your next turn", CR 611.2b). */
  gainedUntilNextTurn?: string[];
  /** The turn this player last began to activate an exhaust ability (CR 702.177b, Elvish Refueler). */
  exhaustTurn?: number;
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
  /** "The next N damage that would be dealt to [this player] this turn is dealt to [X] instead" (CR 614.9). */
  redirectNext?: RedirectShield[];
  /** Combat damage received from each commander, keyed by commander object id. CR 903.10a */
  commanderDamage: Record<ObjectId, number>;
  lost: boolean;
  lossReason?: string;
  drewFromEmptyLibrary: boolean;
  /** Cards drawn in turn `turn`, for "whenever you draw your second card each turn". */
  draws?: { turn: number; n: number };
  /** The turn of their draw step in which they last drew (the first card drawn in it isn't doubled by Alhammarret's Archive). */
  firstDrawStepDraw?: number;
  /** The turn this player last would have drawn a card: "the first time you would draw a card each turn" (Scion of Halaster). */
  firstWouldDraw?: number;
  /** The turn this player was last dealt combat damage, and the turns their current and previous turns began (s.turn), for "if you haven't been dealt combat damage since your last turn". */
  combatDamagedTurn?: number;
  turnBegan?: number;
  lastTurnBegan?: number;
  /** The turn this player last attacked with a creature, for raid's "if you attacked this turn". */
  attackedTurn?: number;
  /** The turn this player last committed a crime (CR 700.13), for "if you've committed a crime this turn". */
  crimeTurn?: number;
  /**
   * The creatures this player declared as attackers this turn ("id@zoneChanges"): one declared in two combats counts once,
   * one put onto the battlefield attacking not at all (Windbrisk Heights rulings).
   */
  attackedWith?: { turn: number; keys: string[] };
  /** The players this player attacked with creatures in the latest combat, and its turn (melee, CR 702.121a). */
  attackedPlayers?: { turn: number; players: PlayerId[] };
  /** The city's blessing (CR 702.131c): once a player has it, they keep it for the rest of the game. */
  citysBlessing?: boolean;
  /**
   * The Ring (CR 701.54c): the emblem this player got the first time the Ring tempted them (`timestamp`), how many
   * times it has tempted them, and their Ring-bearer (CR 701.54a-b), the creature it was as it was chosen.
   */
  ring?: { tempted: number; timestamp: number; bearer?: { id: ObjectId; zc: number } };
  /** The dungeon card they own in the command zone and the room their venture marker is on (CR 309.4). */
  dungeon?: { name: string; room: number };
  /** The dungeons they've completed, in order (CR 309.7). */
  completedDungeons?: string[];
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
  /** A Saga's chapter ability: while it's on the stack, the Saga isn't sacrificed (CR 714.4). */
  chapter?: true;
  lki?: LastKnown;
  /** A station ability: the creature tapped to pay for it, and its power as it last existed if it has left (CR 702.184a). */
  stationed?: { id: ObjectId; zc: number; power: number };
  /** Its source's transform count as it was put on the stack: an ability of it transforms it only if unchanged (CR 701.27f). */
  sourceTransforms?: number;
  /** Its source's untap count as it was activated: if the source untaps before it resolves, "for as long as ~ remains tapped" never starts (rulings). */
  sourceUntaps?: number;
  /** The value of X announced while casting or activating it (CR 107.3a), or a spell's X for its permanent's ETB trigger (CR 107.3m). */
  x?: number;
  /** See PendingTrigger.rolled. */
  rolled?: number;
  /** See PendingTrigger.revealed. */
  revealed?: number;
  /**
   * In `castItems` only: the spell's mana value as it was put on the stack, X included (CR 202.3e), for when it has left
   * the stack by the time something asks (a countered spell's cascade uses its last known information, CR 113.7a).
   */
  castMv?: number;
  /** Kicker costs paid (CR 702.33d), for a spell or its permanent's enters trigger. */
  kicked?: number[];
  /** For its permanent's enters trigger: how many colors of mana were spent to cast it (converge, CR 207.2c). */
  colorsSpent?: number;
  /** What its trigger event was about: the damage dealt ("that much"), the player dealt it ("that player"). */
  event?: TriggerEventInfo;
  /** What was sacrificed to cast it, as it last existed ("the sacrificed creature's power", CR 608.2h). */
  sacrificed?: LastKnown[];
  /** See PendingTrigger.amassed. */
  amassed?: { id: ObjectId; zc: number };
  /** See PendingTrigger.fromSpell. */
  fromSpell?: true;
  /** The names of cards moved to pay its cost beyond mana: Jester's Scepter's "that card" (CR 608.2h). */
  costCardNames?: string[];
  /**
   * An activated mana ability resolving right away, never on the stack (CR 605.3b): `index`, the ability; `tapped`, {T}
   * was in its cost, so it tapped its source for mana (CR 106.12); `extra`, the mana picked for what that triggers.
   */
  manaAbility?: { index: number; tapped: boolean; extra?: ManaType[]; /** What its source was as it was activated: a snow permanent, a Treasure, a creature, an artifact (CR 106.3). */ from?: ManaOrigin[] };
  /** For an activated ability: how much mana from Treasures was spent to activate it (CR 106.3). */
  treasureSpent?: number;
  /** A triggered ability's intervening "if": it does nothing unless this is still true as it resolves (CR 603.4). */
  ifCond?: StaticCondition;
  /** For a spell: how many spells were cast before it this turn (storm, CR 702.40a). */
  castNth?: number;
  /** For a spell: its casualty cost was paid (CR 702.153a). */
  casualty?: boolean;
  /** For a spell: its conspire cost was paid (CR 702.78a). */
  conspired?: boolean;
  /** A copy of a spell (CR 707.10), not cast. */
  copy?: boolean;
  /** A triggered ability (CR 603), not an activated one (CR 602). */
  triggered?: true;
}

/**
 * A delayed triggered ability (CR 603.7): "at the beginning of the next end step" or "at the
 * beginning of your next upkeep". It triggers once, about `subject` (the card as it was then).
 */
export interface DelayedTrigger {
  /** `leaves`: when the subject leaves the battlefield for one of the zones in `to` (earthbend's return, CR 701.66a). */
  /** `eachYourUpkeep`: at the beginning of each of its controller's upkeeps for the rest of the game (epic, CR 702.50a). */
  /** `lostControl`: when `controller` no longer controls the subject (Ray of Command), checked like a state trigger. */
  when: "nextEndStep" | "yourNextEndStep" | "yourNextUpkeep" | "nextTurnUpkeep" | "eachYourUpkeep" | "eachYourPrecombatMain" | "endOfCombat" | "nextCleanup" | "leaves" | "lostControl";
  to?: ZoneName[];
  controller: PlayerId;
  sourceCardId: string;
  subject: { id: ObjectId; zc: number };
  /**
   * `lostControl` only: what its instructions are about, when that isn't the object watched ("Sacrifice it when you lose
   * control of ~", Krovikan Vampire): it triggers even if the watched object left the battlefield (Khârn rulings).
   */
  about?: { id: ObjectId; zc: number };
  /** `lostControl` with `about`: `controller` has controlled the watched object since this was made (Seraph rulings). */
  held?: true;
  /**
   * `lostControl` and `leaves`: it lasts only until the end of this turn ("When you lose control of that Equipment this
   * turn", "When that creature dies this turn").
   */
  thisTurn?: number;
  /** `leaves`: only when it dies, a creature put into a graveyard from the battlefield (CR 700.4). */
  dies?: true;
  /**
   * The ability's source as it was when this was made, when its instructions are about that and not the subject ("When
   * that creature dies this turn, flip ~", Initiate of Blood): "~" is that object only (CR 603.7c, 400.7).
   */
  source?: { id: ObjectId; zc: number };
  body: AbilityBody;
  /** Made during an end step, "the next end step" is the following turn's (CR 603.7c doesn't fire it in the same step). */
  turn: number;
  /** How many times its subject had transformed when it was made: it transforms it only if that's still so (CR 701.27f). */
  transforms?: number;
  step: Step;
}

/** An extra turn (CR 500.7). */
export interface ExtraTurn {
  player: PlayerId;
  /** "At the beginning of that turn's end step, you lose the game": the spell's controller and card. */
  loseAtEnd?: { controller: PlayerId; sourceCardId: string; subject: { id: ObjectId; zc: number } };
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
  /** A delayed trigger: how many times its source had transformed when it was made (CR 701.27f). */
  transformsAt?: number;
  /** Last known information the ability needs: the counters on a permanent that left, evolve's creature's P/T. */
  lki?: LastKnown;
  /** For an enters trigger of a permanent that was a spell with X: that X (CR 107.3m). */
  x?: number;
  /** A reflexive trigger after a roll ("roll a d20. When you do, ... where X is the result"): that result. */
  rolled?: number;
  /** A reflexive trigger after "reveal any number of Dragon cards from your hand": how many were revealed. */
  revealed?: number;
  /** A reflexive trigger after "you may sacrifice another creature": that creature as it last existed (CR 608.2h). */
  sacrificed?: LastKnown[];
  /** A reflexive trigger after amassing: the amassed Army (CR 701.47c). */
  amassed?: { id: ObjectId; zc: number };
  /** A reflexive trigger of an instant or sorcery spell: its source is that spell, by now gone from the stack (CR 113.7a). */
  fromSpell?: true;
  kicked?: number[];
  colorsSpent?: number;
  /** What its trigger event was about: the damage dealt ("that much"), the player dealt it ("that player"). */
  event?: TriggerEventInfo;
  /** A delayed trigger's own ability (its source card has no such printed ability). */
  body?: AbilityBody;
  /** A Saga's chapter ability (CR 714.4). */
  chapter?: true;
  /** Its intervening "if" (CR 603.4), checked again as it resolves. */
  ifCond?: StaticCondition;
}

export interface LastKnown {
  counters?: Record<string, number>;
  power?: number;
  toughness?: number;
  manaValue?: number;
  /** The player a creature returned for ninjutsu was attacking (CR 702.49c), and the planeswalker if it was one. */
  attacking?: PlayerId;
  attackingPermanent?: { id: ObjectId; zc: number; battleController?: PlayerId };
  /** Its copiable values as it last existed (CR 707.2, 608.2h), a key into GameState.cards: "becomes a copy of that creature". */
  copyKey?: string;
  /** Who controlled it as it last existed: "that creature's controller" after it died (CR 608.2h). */
  controller?: PlayerId;
  /** It was suspected as it last existed (CR 701.60): "if the sacrificed creature was suspected". */
  suspected?: true;
  /** The player chosen for it as it entered ("the chosen player"), as it last existed. */
  chosenPlayer?: PlayerId;
  /**
   * A merged permanent `of` that left the battlefield (an ability triggered by its leaving): the other cards it became
   * (CR 730.3c), which an effect finding the new object `of` finds too.
   */
  mergedCards?: { of: ObjectId; cards: { id: ObjectId; zc: number }[] };
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
  /**
   * Which face of a card with several to cast (CardDef.faces): a split card's half (CR 709.3), a modal double-faced
   * card's face (712.11b), the Adventure (715.3). Unset: the card as it is.
   */
  face?: number;
  /** Permanents to sacrifice, cards to discard, cards to exile from your graveyard. */
  sacrifice?: ObjectId[];
  discard?: ObjectId[];
  exileCards?: ObjectId[];
  /** Untapped permanents to tap for "Tap an untapped creature you control" (CR 602.2b). */
  tap?: ObjectId[];
  /** Cards in hand revealed for "reveal a Pirate card from your hand". */
  reveal?: ObjectId[];
  /** Cards exiled from your hand for "exile a blue card from your hand" (Force of Will). */
  exileFromHand?: ObjectId[];
  /** Which way to pay "sacrifice a creature or pay {3}{B}" (an index into CompiledCard.costOr, CR 601.2b). */
  costOr?: number;
  /** Permanents to return to their owner's hand: ninjutsu's unblocked attacker (CR 702.49a). */
  returnToHand?: ObjectId[];
  /** The creature sacrificed for casualty (CR 702.153a), if any. */
  casualty?: ObjectId;
  /** The artifact, enchantment, or token sacrificed for bargain (CR 702.166a), if any. */
  bargain?: ObjectId;
  /** "As an additional cost to cast this spell, you may collect evidence N": the cards exiled for it, if it's paid (CR 701.59a). */
  evidence?: ObjectId[];
  /** "Collect evidence N" as a cost (an ability's, Conspiracy Unraveler's): the cards exiled from your graveyard for it. */
  collect?: ObjectId[];
  /** Teamwork N: the untapped creatures you control, with total power N or more, tapped as you cast it. */
  teamwork?: ObjectId[];
  /**
   * Harmonize (CR 702.180a-b): the untapped creature you control tapped as you cast it from your graveyard, its power
   * taken off the total cost in generic mana.
   */
  harmonize?: ObjectId;
  /** Conspire (CR 702.78a): the two untapped creatures you control that share a color with it, tapped to copy it. */
  conspire?: ObjectId[];
  /** Gift (CR 702.174a): the opponent chosen to promise the gift to. */
  gift?: PlayerId;
  /** Splice (CR 702.47a-b): the cards revealed from your hand to splice onto this spell, in the order their effects happen. */
  splice?: ObjectId[];
  /** "Have an opponent gain 3 life" (Invigorate's alternative cost): the opponent who gains it. */
  lifeTo?: PlayerId;
  /** Assist (CR 702.132a): the other player asked to help pay for the generic mana in its total cost. */
  assist?: PlayerId;
  /** How much of that generic mana they pay, from their mana pool: set by the game once they've chosen. */
  assisted?: number;
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
  /**
   * "endOfTurn" ends in the cleanup step (CR 514.2); "game" lasts until the game ends (CR 611.2a); "yourNextTurn" ends
   * as `turnOf`'s next turn begins (CR 611.2b), or when it would have for a player who left (CR 800.4m).
   */
  duration: "endOfTurn" | "game" | "yourNextTurn" | "whileTapped" | "whileControlled";
  turnOf?: PlayerId;
  /**
   * "For as long as ~ remains tapped" (CR 611.2b): it ends when that object (`zc` as it was) untaps, leaves the
   * battlefield or phases out (CR 702.26f); `controller`: "for as long as you control ~" too.
   */
  whileTapped?: { id: ObjectId; zc: number; untaps: number; controller?: PlayerId };
  /**
   * "For as long as you control ~" (CR 611.2b): it ends when that object (`zc` as it was) leaves the battlefield, phases
   * out (CR 702.26f) or comes under another player's control, and doesn't start again if `controller` regains it (rulings
   * on Dragonlord Silumgar, Aegis Angel).
   */
  whileControlled?: { id: ObjectId; zc: number; controller: PlayerId };
  affected: ObjectId[];
  mods: Modification[];
}

/** What the engine is waiting on from a specific player, beyond normal priority. */
export type PendingDecision =
  | { kind: "declareAttackers"; player: PlayerId }
  | { kind: "declareBlockers"; player: PlayerId; remaining: PlayerId[] }
  | { kind: "discardToHandSize"; player: PlayerId; count: number }
  /** A resolving spell or ability makes this player discard `count` cards of their choice (CR 701.9b). */
  | { kind: "discard"; player: PlayerId; count: number; source: string; /** Only cards like this: "discard a creature card". */ filter?: TargetSpec; /** Exiled, not discarded ("exiles a card from their hand"). */ exile?: true }
  /** "Put two cards from your hand on top of your library in any order": which, and their order (first on top). */
  | { kind: "handToTop"; player: PlayerId; count: number; source: string; /** On the bottom instead, the first pick lowest. */ bottom?: true }
  /** Scry or surveil (CR 701.22, 701.25): `cards` are the top of their library, top first. */
  /** `order`: put them all back in any order (no bottom or graveyard); `owner` = whose library, if not the player's. */
  /** "bottom": the cards go to the bottom of the library together and their owner orders them (CR 401.4). */
  | { kind: "arrangeTop"; player: PlayerId; how: "scry" | "surveil" | "order" | "bottom" | "look"; cards: ObjectId[]; source: string; owner?: PlayerId }
  /** "You may ...": whether to do it, decided as the ability resolves (CR 603.5, 608.2d). */
  /**
   * "You may collect evidence N" as a spell or ability resolves (CR 701.59a): pick cards in your graveyard with total
   * mana value N or more, or none to decline. `not`: a card that can't be one of them.
   */
  | { kind: "collectEvidence"; player: PlayerId; n: number; source: string; not?: ObjectId }
  | { kind: "chooseMay"; player: PlayerId; prompt: string; source: string; card?: ObjectId; /** "Each player may discard their hand and draw this many cards". */ wheel?: number; pay?: PayCost; /** Pay to keep a permanent: echo, cumulative upkeep. */ keep?: boolean; /** Clash: put the revealed `card` on the bottom of the library (CR 701.30a)? */ clash?: boolean }
  /**
   * "Counter that spell or ability unless its controller pays {2}" (ward, CR 702.21a). The player
   * may activate mana abilities first (CR 605.3a), then pays or declines.
   */
  | { kind: "payUnless"; player: PlayerId; cost: string; life?: number; /** Cards to discard as (part of) the payment. */ discard?: number; /** Permanents to sacrifice as (part of) the payment ("Ward—Sacrifice a creature"), chosen after saying yes. */ sacrifice?: { n: number; filter: TargetSpec }; source: string; what: string; /** What happens if they don't, when it isn't "[what] is countered". */ otherwise?: string }
  /**
   * "You may cast that card without paying its mana cost" (cascade, CR 702.85a), as an ability
   * resolves: answered by casting it (castSpell, targets and modes as usual) or chooseMay "no".
   */
  /**
   * Assist (CR 702.132a): `caster` chose this player, who may activate mana abilities and then pay up to `max` of the
   * generic mana in the spell's total cost. The spell isn't on the stack yet; `cast` is the caster's cast.
   */
  | { kind: "assist"; player: PlayerId; caster: PlayerId; source: string; max: number; cast: Extract<Action, { type: "castSpell" }> }
  /** Assist: `helper` will pay `n`; now the caster may activate mana abilities and pay the rest, or not cast it. */
  | { kind: "assistCast"; player: PlayerId; helper: PlayerId; source: string; n: number; cast: Extract<Action, { type: "castSpell" }> }
  | { kind: "castFree"; player: PlayerId; objectId: ObjectId; source: string; /** Madness: for its madness cost instead (CR 702.35a), miracle for its miracle cost (702.94a); suspend: free, and a creature gains haste (702.62a). */ how?: "madness" | "suspend" | "miracle" | /** Discover (CR 701.57a): if it isn't cast, it goes to the hand. */ "discover" | /** A defeated Siege: only transformed (CR 310.12b). */ "transformed" }
  /**
   * A draw that dredge could replace (CR 702.52a): dredge one of `options` (cards in the player's graveyard), or draw.
   * `left` counts this draw and the ones after it; `after`: the draw step's turn-based draw, whose triggers wait.
   */
  /**
   * "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them
   * into your graveyard and the other back on top" (Scion of Halaster): which of `cards` goes to the graveyard; then
   * the player draws, and `left` more draws, and `after` carries on as with dredge.
   */
  | {
      kind: "drawLook";
      player: PlayerId;
      source: string;
      cards: ObjectId[];
      left: number;
      after?: "drawStep";
      /**
       * Other replacements of the same draw the player may apply first instead (CR 616.1): Alhammarret's Archive's
       * "draw two cards instead" (`archive`, the draws it makes) or dredging one of `dredge`. Either uses up "the
       * first time you would draw", so the look doesn't happen.
       */
      instead?: { archive?: number; dredge?: ObjectId[] };
    }
  | {
      kind: "dredge";
      player: PlayerId;
      options: ObjectId[];
      left: number;
      /** Of those, the draws after this one that a replacement already made (Alhammarret's Archive), each with how many Archives can still replace it. */
      made?: number[];
      /**
       * Alhammarret's Archives that could replace this draw too (CR 616.1): not dredging applies one of them, "draw two
       * cards instead", rather than drawing.
       */
      archive?: number;
      after?: "drawStep";
    }
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
  | { kind: "searchLibrary"; player: PlayerId; source: string; what: string; cards: ObjectId[]; min: number; max: number; firstTo?: string; othersTo?: string; /** Picking from the top of the library: all the cards looked at, and where the rest go. */ dig?: { looked: ObjectId[]; to: string; rest: string }; /** Not a search: cards in the hand to put onto the battlefield, or with `reveal` to reveal, with `bottom` to put on the bottom of the library. */ fromHand?: boolean; reveal?: true; bottom?: true; /** Not a search: cards in the graveyard to return to the hand, to exile, or to put onto the battlefield. */ fromGraveyard?: "hand" | "exile" | "battlefield" | "libraryTop"; /** "Cards with different mana values" (Seasons Past): no two found may share a mana value. */ distinctManaValues?: true; /** The Leylines' "begin the game with it on the battlefield", before the first turn (CR 103.6a). */ opening?: true; /** Choosing from this player's revealed hand ("You choose a nonland card from it"); `dig.looked` is the whole hand. */ hand?: PlayerId; /** Searching this player's graveyard, hand and library (Memoricide): `cards` are in any of them; `also`, the graveyard's that are found anyway ("all cards"). */ zonesOf?: PlayerId; also?: ObjectId[] }
  /**
   * Choosing a creature type or a color by name: as a permanent enters (`objectId`, CR 614.12) or
   * while a spell or ability resolves. `options` are the names allowed.
   */
  /** `labels`: what to show for each option, when the options are ids (entering as a copy of a permanent). */
  | { kind: "chooseOption"; player: PlayerId; source: string; what: ChoiceKind | EntersOption | "venture" | "clash" | "endure" | "tapOrUntap" | "punisher" | "castFromHand" | "castFromAmong" | "demonstrate" | "damageShield" | "topOrBottom" | "damageSource" | "enchant" | "rollResult" | "attackWhom" | "searchZones" | "vote" | "mutate"; options: string[]; labels?: string[]; objectId?: ObjectId; /** The question, when `source` alone doesn't say it (damage shields). */ prompt?: string; /** The permanent a choice is about, as it resolves ("tap or untap target permanent"). */ about?: ObjectId; /** A card name: what it's for (bots). */ purpose?: NamePurpose; /** A card name: the player whose cards it's about ("target player reveals their hand"). */ of?: PlayerId; /** A vote made by `player` for another player (Illusion of Choice): whose vote it is. */ voter?: PlayerId }
  /**
   * "Sacrifice a creature", "return a land you control to its owner's hand": pick `count` of `options`
   * (your own permanents) as a spell or ability resolves. With `min`, anywhere from `min` to `count` of them
   * (exploit's "you may sacrifice a creature"). With `objectId`, it's devour's choice as that permanent enters
   * (CR 702.82a): any number of them.
   */
  | { kind: "pickPermanents"; player: PlayerId; source: string; action: PickAction; what: string; options: ObjectId[]; count: number; /** For "counters": the kind put on the picked permanent. */ counter?: CounterKind; min?: number; objectId?: ObjectId; /** The player whose permanents these are, when someone else chooses: for "keep" (Mythos of Snapdax), or the target player of Split the Party. */ of?: PlayerId }
  /** "Distribute X +1/+1 counters among any number of creatures you control": how many each of `options` gets, adding up to `total`. */
  | { kind: "distribute"; player: PlayerId; source: string; counter: CounterKind; total: number; options: ObjectId[]; what: string }
  /** `x`: the trigger's X (an enters trigger's is its spell's, CR 107.3m), which "up to X target ..." can't choose more than. */
  | { kind: "chooseTargets"; player: PlayerId; sourceId: ObjectId; specs: TargetSpec[]; description: string; x?: number }
  /**
   * A copy of a spell may get new targets (CR 707.10c): keep them all, or choose new legal ones. `copyOf` is the
   * spell's description; `left` counts this copy and the ones after it.
   */
  | { kind: "copyTargets"; player: PlayerId; source: string; copyOf: string; specs: TargetSpec[]; current: TargetChoice[]; left: number }
  /** "Change the target of target spell" (CR 115.7a): pick the spell's new target among `options`, the legal ones. */
  | { kind: "changeTarget"; player: PlayerId; source: string; spell: string; stackId: string; index: number; spec: TargetSpec; current: TargetChoice; options: TargetChoice[] }
  /** A modal triggered ability is being put on the stack (CR 603.3c). `legal[i]`: mode i can be chosen (CR 700.2b). */
  | { kind: "chooseModes"; player: PlayerId; sourceId: ObjectId; description: string; min: number; max: number; modes: string[]; legal: boolean[] }
  /**
   * Cards put into this player's graveyard at the same time (CR 404.3), or with `whole` their whole graveyard ("reorder
   * your graveyard as you choose", Fossil Find): put them in any order. `cards` are as they are now, top first.
   */
  | { kind: "orderGraveyard"; player: PlayerId; cards: ObjectId[]; source: string; whole?: true }
  /**
   * A merged permanent was put into its owner's library (CR 730.3a): its cards are `cards` there, top first, together on
   * top of the library or at the bottom, and the owner arranges them without revealing the order.
   */
  | { kind: "orderLibrary"; player: PlayerId; cards: ObjectId[]; bottom?: true; source: string };

export interface GameEvent {
  seq: number;
  turn: number;
  /** The step it happened in (the log groups entries by phase). */
  step?: Step;
  text: string;
  /** Hidden information only this player sees ("you look at target opponent's hand", CR 402.3). */
  to?: PlayerId;
}

/** What happened this turn, for the Traps' alternative cost conditions (CR 601.2b). */
export interface TurnLog {
  /** Players who searched their library (Archive Trap). */
  searched?: PlayerId[];
  /** Each token created this turn (CR 111.2): who created it and its subtypes then ("Treasure tokens you created"). */
  tokensCreated?: { player: PlayerId; subtypes: string[] }[];
  /** Permanents that entered the battlefield, with their controller, card types and colors as they entered. */
  entered?: { controller: PlayerId; types: string[]; colors: Color[] }[];
  /** Noncreature permanents destroyed by a spell or ability: their controller and the destroying spell's or ability's (Cobra Trap). */
  destroyed?: { controller: PlayerId; by: PlayerId }[];
  /** For each player, the creatures (`id@zoneChanges`) that dealt them damage (Inferno Trap). */
  damagedBy?: Record<number, string[]>;
  /** Players who gained life (Needlebite Trap). */
  gainedLife?: PlayerId[];
  /** How many cards were put into each player's graveyard, from anywhere (Ravenous Trap). */
  toGraveyard?: Record<number, number>;
  /** Each event this turn that discarded cards: who discarded them, and the cards (keys into `cards`). */
  discards?: { player: PlayerId; cards: string[] }[];
  /** Cards put into graveyards from anywhere, anyone's, counted by each card type they had there (Case of the Gorgon's Kiss). */
  toGraveyardTypes?: Record<string, number>;
  /** Life each player gained in total (Case of the Uneaten Feast). */
  lifeGained?: Record<number, number>;
  /** Life each player lost in total, paid life included (CR 119.4): "the total amount of life your opponents have lost this turn". */
  lifeLost?: Record<number, number>;
  /**
   * Creatures that died this turn having been dealt damage that turn: the card in the graveyard (`id`, `zc`) and the
   * permanents that dealt it damage (Krovikan Vampire's "if a creature dealt damage by ~ this turn died").
   */
  diedDamaged?: { id: ObjectId; zc: number; by: ObjectId[] }[];
  /** The sources that dealt damage, as `id@zoneChanges` (a card's name without one), by the player who controlled each as it did. */
  damageSources?: Record<number, string[]>;
  /** The damage each source dealt in total, by the player who controlled it as it dealt it (Dragon Cultist). */
  sourceDamage?: Record<number, Record<string, number>>;
  /** The card types of the cards put into each player's graveyard from anywhere (Cloakwood Hermit). */
  toOwnGraveyardTypes?: Record<number, string[]>;
}

/**
 * One object an event moved, for the "one or more" triggers (CR 603.2c) checked as the event ends: `id` and `zc` are
 * the object after the move. A permanent that left the battlefield carries itself as it last existed there (CR
 * 603.10a). `entered`: it entered the battlefield and finished entering (its enters event, after "as it enters"
 * choices). `discardedBy`: a discarded card.
 */
export interface ZoneMove {
  id: ObjectId;
  zc: number;
  from?: ZoneName;
  to: ZoneName;
  owner: PlayerId;
  /** A token or a copy of a spell, not a card (CR 111.1, 707.10). */
  notCard?: true;
  /** Its copiable values as it moved (a key into `cards`), for "creature cards". */
  card: string;
  /** Who controlled it: as it left the battlefield, or as it entered. */
  controller?: PlayerId;
  entered?: true;
  discardedBy?: PlayerId;
  /** Torpor Orb: the controllers whose abilities its entering can't trigger (`opponents`: only those of `by`'s opponents). */
  locks?: { by: PlayerId; opponents?: boolean }[];
  /** Leaving the battlefield: it as it last existed there, whether it had its abilities then, and those granted to it. */
  snapshot?: GameObject;
  chars?: Characteristics;
  hadAbilities?: boolean;
  granted?: string[];
}

export interface GameState {
  /** Phased-out permanents (CR 702.26b), which are treated as though they don't exist. */
  phasedOut?: ObjectId[];
  /**
   * Permanents that left the battlefield in the current event (one effect, or one pass of state-based
   * actions): their leaves-the-battlefield abilities look back and see each other leave (CR 603.10a).
   */
  /** `card`: its copiable values as it last existed (CR 603.10a), a key into `cards`. */
  leftTogether?: { id: ObjectId; controller: PlayerId; hadAbilities: boolean; granted?: string[]; attachedTo?: ObjectId; card?: string }[];
  /**
   * Cards put into a graveyard in the current event (one instruction of a resolving spell or ability, one pass of
   * state-based actions, one action's costs), as they are there: their owner arranges them (CR 404.3). See graveyard.ts.
   */
  graveyardBatch?: { id: ObjectId; zc: number }[];
  /** The objects the current event (as `graveyardBatch` counts events) moved, for "one or more" triggers (CR 603.2c). */
  zoneBatch?: ZoneMove[];
  /** Groups of two or more cards that went to one graveyard at the same time, waiting for their owner to arrange them. */
  /** `library`: a merged permanent's cards put into its owner's library together (CR 730.3a), unless it's shuffled since (`shuffles`, Player.shuffles then). */
  graveyardOrders?: { owner: PlayerId; cards: { id: ObjectId; zc: number }[]; library?: { bottom: boolean; shuffles: number } }[];
  /** Cards exiled by a permanent's linked exile ability (CR 607.2a), by `${source id}@${its zone changes}`. */
  linkedExile?: Record<string, { id: ObjectId; zc: number }[]>;
  /** Cards in graveyards that gained flashback until end of turn (Snapcaster Mage), as they are there. */
  flashbackGrants?: { id: ObjectId; zc: number }[];
  /** "When you next cast an instant or sorcery spell this turn, copy that spell": delayed triggers on a cast (CR 603.7). */
  nextCast?: { controller: PlayerId; filter: TargetSpec; sourceId: ObjectId; sourceCardId: string; body: AbilityBody; turn: number; cascade?: true }[];
  /**
   * "Until end of turn, whenever you cast a spell, ...": delayed triggered abilities with a stated duration, which trigger
   * every time their event happens until then (CR 603.7b). Their source is the spell or the source of the ability that made
   * them (603.7d-e), `sourceZc` as it was then: an ability about "~" is about that object only (603.7c, 400.7). `turn`: the
   * turn it was made, for "until the end of your next turn".
   */
  floatingTriggers?: { id: string; controller: PlayerId; sourceId: ObjectId; sourceCardId: string; sourceZc: number; fromSpell?: true; trigger: TriggeredAbility; until: TriggerDuration; turn: number }[];
  /** Spells cast this turn, by anyone (storm, CR 702.40a). */
  spellsCastThisTurn?: number;
  /** Who cast each spell this turn, and its card (a key into `cards`) as it was cast: "can't cast more than one spell each turn". */
  castThisTurn?: { player: PlayerId; card: string; /** Its colors as it was cast (Ricochet Trap). */ colors?: Color[]; /** The zone it was cast from. */ from?: ZoneName; /** Mana from a Treasure was spent to cast it (CR 106.3). */ treasure?: true }[];
  /** "Instant and sorcery spells you cast this turn cost {1} less to cast": cost changes for one player this turn (CR 601.2f). */
  costModsThisTurn?: { player: PlayerId; mod: CostMod }[];
  /** "Creatures without flying can't block this turn": matching creatures can't block, also ones that arrive later. */
  cantBlockThisTurn?: { filter: TargetSpec; controller: PlayerId }[];
  /** "Creatures can't attack this turn": matching creatures can't attack, also ones that arrive later. */
  cantAttackThisTurn?: { filter: TargetSpec; controller: PlayerId }[];
  /** Each spell cast this turn as it was cast, by stack id: what a copy of it copies if it has left the stack (CR 707.10). */
  castItems?: Record<string, StackItem>;
  /** Spells with epic as they resolved, by stack id: copied at each of their controller's upkeeps (CR 702.50a). */
  epics?: Record<string, StackItem>;
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
  /** Prevention and redirection effects from resolved spells and abilities that apply to damage this turn (see DamageRule). */
  damageRules?: DamageRule[];
  /**
   * Combat damage about to be dealt, waiting on choices about which of it damage shields apply to (CR 615.7, 616.1):
   * the damage as assigned, and the options picked so far (see damage.ts planShields).
   */
  damageBatch?: { events: DamageEvent[]; answers: number[] };
  /** The controllers of the creatures that died this turn, one entry per creature (morbid, CR 700.4). */
  diedThisTurn?: PlayerId[];
  /** Permanents put into a graveyard from the battlefield this turn, tokens included (gravestorm, CR 702.69a). */
  toGraveyardThisTurn?: number;
  /** Creatures declared as attackers this turn ("for each creature that attacked this turn"). */
  attackersThisTurn?: number;
  /** Combat phases begun this turn: "if it's the first combat phase of the turn" (CR 506.1, 500.8). */
  combatsThisTurn?: number;
  /** Main phases begun this turn: "your second main phase" is the second (CR 505.1b). */
  mainPhasesThisTurn?: number;
  /**
   * The combat phase whose declare blockers step began (the turn and which combat of it): "only during combat after
   * blockers are declared" can't be used in a combat that skipped that step (CR 506.8f).
   */
  blockersStep?: { turn: number; combat: number };
  /**
   * Phases added to this turn that come directly after the current phase, in order: the most recently created first
   * (CR 500.8). An additional main phase is a postcombat main phase (CR 505.1a), so it's run as "main2".
   */
  addedPhases?: ("combat" | "main")[];
  /** While added phases run: the step the turn's own order goes on with once they're done (CR 500.8). */
  resumeStep?: Step;
  /** "Your opponents can't cast spells this turn" (Silence): who can't cast what, until that turn ends (CR 101.2). */
  cantCastThisTurn?: { player: PlayerId; turn: number; filter?: TargetSpec; source: string }[];
  /** Players who can't play lands this turn (Moonhold), and what said so. */
  cantPlayLandsThisTurn?: { player: PlayerId; turn: number; source: string }[];
  /** "Players can't gain life this turn" effects from resolved spells and abilities, by the turn they were made (CR 119.7). */
  noLifeGain?: { turn: number; controller: PlayerId; who: "all" | "opponents" }[];
  /** Rules for one player this turn: "you can't lose life this turn" (CR 119.8), "you can't lose the game this turn", "your opponents can't win the game this turn". */
  turnRules?: TurnRule[];
  /**
   * "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): a replacement effect from a
   * resolved spell (CR 614.1c), with `filter` from `controller`'s view, ending as `controller`'s next turn begins
   * (CR 611.2b, 800.4m).
   */
  entersTappedUntil?: { controller: PlayerId; filter: TargetSpec; source: string }[];
  /**
   * "Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played"
   * (Conjurer's Ban), "that creature's owner can't cast spells with the same name as that creature until your next turn"
   * (Reflector Mage): the name, who it stops (everyone without `players`), until `controller`'s next turn begins.
   */
  /** Illusion of Choice: "You choose how each player votes this turn" (the last one to resolve, rulings). */
  votesChosenBy?: { player: PlayerId; turn: number };
  namedBansUntil?: { name: string; players?: PlayerId[]; lands?: true; controller: PlayerId; source: string }[];
  /** The turn a "damage can't be prevented this turn" effect was made in (CR 615.12). */
  noPreventionTurn?: number;
  /** Damage amount replacements of resolved spells and abilities (Effect damageMod): made in `turn`, by `you`. */
  damageMods?: { id: string; mod: DamageMod; you: PlayerId; name: string; turn: number; until?: "yourNextTurn" }[];
  /** Players who lost life this turn ("if an opponent lost life this turn", CR 119.3). */
  lostLifeThisTurn?: PlayerId[];
  /** Revolt: the players a permanent left the battlefield under the control of this turn, tokens too (rulings). */
  permanentLeftThisTurn?: PlayerId[];
  /** Players whose Assassin creature or commander dealt combat damage to a player this turn: they may pay freerunning costs (CR 702.173a). */
  freerunningThisTurn?: PlayerId[];
  /** Void: a nonland permanent left the battlefield this turn, or a spell was warped this turn (CR 702.185c). */
  voidThisTurn?: boolean;
  /** Descend: the players a permanent card was put into the graveyard of this turn, from anywhere (CR 700.11). */
  descendedThisTurn?: PlayerId[];
  /** Players dealt damage this turn, for bloodthirst (CR 702.54a). */
  damagedThisTurn?: PlayerId[];
  /** How much damage each player was dealt this turn (Spinerock Knoll). */
  damageThisTurn?: Record<number, number>;
  /** What the Traps' "this turn" conditions look back at (StaticCondition opponentSearched and the rest); cleared each turn. */
  turnLog?: TurnLog;
  /**
   * Power and toughness of permanents as they last existed on the battlefield (CR 608.2h), for
   * "destroy target creature; you gain life equal to its power". `zc` is its zoneChanges while it
   * was there. Cleared each turn.
   */
  /** Delayed triggered abilities waiting for their moment (CR 603.7): unearth's exile, rebound's cast. */
  delayed?: DelayedTrigger[];
  /**
   * Extra turns still to be taken (CR 500.7): the most recently created is taken first. `loseAtEnd`: "At the beginning of
   * that turn's end step, you lose the game", a delayed trigger of that player's.
   */
  extraTurns?: ExtraTurn[];
  /** The extra turn being taken now, if this is one. */
  extraTurn?: ExtraTurn;
  /** During extra turns: the player whose turn came before them in the normal order, who the next normal turn follows. */
  rotation?: PlayerId;
  /** The player who is the monarch (CR 725), once someone has become it. */
  monarch?: PlayerId;
  /** The emblems in the command zone (CR 114.1), in the order they were made: objects with `emblem`. */
  emblems?: ObjectId[];
  /** Day or night (CR 731.1): neither until something makes it one, then always one of the two. */
  dayNight?: "day" | "night";
  /** The last turn taken: its active player and how many spells each player cast during it (CR 731.2, "last turn"). */
  lastTurn?: { active: PlayerId; cast: number[] };
  /** The player who has the initiative (CR 726), once someone has taken it. */
  initiative?: PlayerId;
  /** How permanents were as they last existed on the battlefield (CR 608.2h); `attachedTo` with that permanent's zoneChanges then. */
  lastKnown?: Record<ObjectId, { zc: number; power: number; toughness: number; controller: PlayerId; attachedTo?: { id: ObjectId; zc: number }; attachedToPlayer?: PlayerId; /** Its copiable values (CR 707.2), a key into `cards`. */ copyKey?: string; counters?: Record<string, number>; /** Its creature types ("all" for changeling-like), for kinship once it's gone. */ creatureTypes?: string[] | "all"; /** What it was as a source of damage, for "it deals damage" once it's gone (CR 608.2h): its lifelink, deathtouch, colors, and a "can't be prevented" that applied to it (Questing Beast). */ source?: { name: string; colors: Color[]; types: string[]; subtypes: string[]; keywords: string[]; unpreventable?: "all" | "combat" } }>;
  nextTimestamp: number;
  /** Something happened during the cleanup step, so players get priority and then there's another one (CR 514.3a). */
  cleanupAgain?: boolean;
  /**
   * In a combat damage step, before damage is assigned: the players who've chosen which blocked creatures assign
   * their combat damage as though they weren't blocked, and those creatures (CR 510.1).
   */
  unblockedChoice?: { turn: number; step: Step; asked: PlayerId[]; ids: ObjectId[] };
  /** Attackers just declared, waiting on their enlist choices (CR 508.1g) before "whenever ~ attacks" triggers. */
  declaring?: { ids: ObjectId[]; /** Bands can still be declared (CR 508.1e). */ bands: boolean; enlist: ObjectId[]; enlisted: [ObjectId, ObjectId][]; /** Attackers that may still be exerted (CR 701.43d), and those that were. */ exert?: ObjectId[]; exerted?: ObjectId[] };
  pending: PendingDecision | null;
  /** The mulligan process before the first turn (CR 103.5), or null once everyone has kept. */
  mulligans?: MulliganState | null;
  /** Players still to take actions with their opening hands, in turn order from the starting player (CR 103.6). */
  openingActions?: PlayerId[];
  /** A spell or ability partway through resolving, waiting on `pending` (see continueResolution). */
  resolving: Resolving | null;
  /**
   * A mutating creature spell resolving onto `host` (CR 702.140c), while its controller chooses whether it goes on top
   * or underneath (the pending "mutate" choice).
   */
  mutatingSpell?: { id: ObjectId; host: ObjectId; controller: PlayerId };
  /** Permanents that just entered and still have an "as ~ enters, choose ..." choice to make (CR 614.12). */
  /**
   * Choices made as permanents enter (CR 614.12), still to ask. `enters`: its enters event waits for
   * the choice (riot, unleash: whether it has a +1/+1 counter as it enters matters to what triggers).
   */
  /**
   * Cards coming back from "until ~ leaves" in the current event (CR 610.3, 610.3d): `returned`, what already came back;
   * `auras`, Auras that come back once their owner has chosen what each enchants (CR 303.4f), which can't be anything
   * in `returned`. `asking`: that one is being asked now.
   */
  untilReturns?: { auras: { id: ObjectId; zc: number; under: PlayerId; source: string; asking?: true }[]; returned: ObjectId[] };
  entersChoices?: { id: ObjectId; zc: number; what: ChoiceKind | EntersOption; except?: string; names?: TargetSpec; purpose?: NamePurpose; secret?: true; enters?: { x?: number }; together?: ObjectId[]; enterOpts?: { x?: number; tapped?: boolean; untapped?: boolean; counters?: Record<string, number>; escaped?: boolean; fromStack?: boolean } }[];
  nextId: number;
  /**
   * Resolutions in a row in this step with every player only passing priority, and the states they left (as hashes,
   * see shortcuts.ts): a state seen again means a loop of mandatory actions, and the game is a draw (CR 104.4b).
   */
  loopWatch?: { turn: number; step: Step; resolutions: number; seen: string[] };
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
/** What a player can be made to skip (CR 614.10). */
export type SkipWhat = "untap" | "draw" | "combat" | "turn";

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
  /** "The basic land type of your choice" (Reef Shaman). */
  landType?: string;
  /** "Gains your choice of menace or lifelink" (Rattleback Apothecary). */
  keyword?: string;
  /** "Choose artifact or enchantment" (Season of Gathering): a card type. */
  cardType?: string;
  /** "As ~ enters, choose a player" (True-Name Nemesis). */
  player?: PlayerId;
  /** "Secretly choose an opponent" (Guardian Archon): only its controller knows who, until it's revealed. */
  secret?: true;
  /** "As ~ enters, choose Khans or Dragons": the anchor word chosen (CR 614.12b). */
  anchor?: string;
  /** "Choose a card name" (CR 201.4). */
  name?: string;
}

export interface TurnRule {
  turn: number;
  player: PlayerId;
  rule: "cantLoseLife" | "cantLoseGame" | "opponentsCantWin";
}

/** What a trigger event was about, beyond its object: "you gain that much life", "that player discards a card". */
export interface TriggerEventInfo {
  amount?: number;
  player?: PlayerId;
  /** A permanent's enters trigger: the opponent its spell's gift was promised to (CR 702.174b). */
  gift?: PlayerId;
  /** A permanent's enters trigger: evidence was collected for its spell (CR 701.59c). */
  evidence?: true;
  /** A permanent's enters trigger, or a cast trigger: how much mana from Treasures was spent to cast that spell (CR 106.3). */
  treasureSpent?: number;
  /** A permanent's enters trigger: its spell's surge or spectacle cost was paid (CR 702.117a, 702.137a). */
  castAlt?: "surge" | "spectacle";
  /** A permanent's enters trigger, or a cast trigger: the mana spent to cast that spell by type (CR 601.2h). */
  spent?: SpentMana;
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
  /** The permanents its last continuous effect changed, for "untap those creatures" after it (ObjRef "affected"). */
  affected?: { id: ObjectId; zc: number }[];
  /** Permanents its damage effects dealt damage to, for "a creature dealt damage this way". */
  damagedThisWay?: ObjectId[];
  /** Players its damage effects dealt damage to, for "players dealt damage this way". */
  playersDamagedThisWay?: PlayerId[];
  /** "Each player may put ... onto the battlefield": those who did, for the instructions after it ("each opponent who didn't"). */
  choseThisWay?: PlayerId[];
  /** The cards drawn so far while this resolves, for "you may cast one of them" (Dungeon of the Mad Mage's last room). */
  drawnThisWay?: ObjectId[];
  /** How many cards each player discarded so far while this resolves ("draw that many cards"). */
  discarded?: Record<PlayerId, number>;
  /** The powers of the creature cards exiling graveyards exiled so far while this resolves ("exiled this way"). */
  exiledPowers?: number[];
  /**
   * The permanents its destroy instructions destroyed so far while this resolves, as they last existed on the
   * battlefield ("for each creature destroyed this way"): one that went elsewhere instead of its owner's graveyard still
   * counts; one that wasn't destroyed (indestructible, regenerated) doesn't (rulings on Fumigate and Bane of Progress).
   */
  destroyed?: { o: GameObject; ch: Characteristics }[];
  /** The permanents its exile instructions exiled so far while this resolves, as they last existed ("exiled this way"). */
  exiled?: { o: GameObject; ch: Characteristics }[];
  /** The cards exiled face down so far (exileFaceDown), for Duplicity's "all other cards you own exiled with ~". */
  faceDownExiled?: ObjectId[];
  /** Spells with an X its counter instructions countered, as the cards they became, and the X they had (CR 202.3e). */
  countered?: Record<ObjectId, { zc: number; x: number }>;
  /** The card its "reveal the top card of your library" revealed (CR 701.20a), for "if it's a creature card, put it ...". */
  revealed?: { id: ObjectId; zc: number };
  /** The one card an "exile the top card of your library" exiled, for "that card's mana value" (Tavern Brawler). */
  exiledTop?: { id: ObjectId; zc: number };
  /** The cards its mill instructions milled, as they are in the graveyard ("if a card with the chosen name was milled this way"). */
  milled?: { id: ObjectId; zc: number }[];
  /** How many cards its exileNamed instruction exiled from the hand ("for each card exiled from their hand this way"). */
  exiledFromHand?: number;
  /** How many cards its revealFromHand instruction revealed ("for each card revealed this way"). */
  revealedFromHand?: number;
  /** Whether the player paid its counterSpell instruction's "unless" cost ("If they do, ..."). */
  unlessPaid?: boolean;
  /** How many cards its takeFromHand instruction took ("You may choose a nonland card from it. If you do, ..."). */
  tookFromHand?: number;
  /** The card its discover instruction discovered (CR 701.57c), cast or put into the hand, and that card's mana value. */
  discovered?: { id: ObjectId; mv: number };
  /** How many counters "remove all counters" removed so far while this resolves ("for each counter removed this way"). */
  countersRemoved?: number;
  /** The two players its exchangeLife instruction named (even one no longer a legal target), and the life each lost doing it. */
  exchanged?: { players: PlayerId[]; lost: Record<PlayerId, number> };
  /** "Choose a creature type / a color": what was chosen, for the rest of its instructions. */
  chosen?: Chosen;
  /**
   * Its vote (CR 701.38): each vote, in the order made, by the player it belongs to; `choice` is the option's word, or the
   * id of the permanent or card voted for.
   */
  votes?: { voter: PlayerId; choice: string }[];
  /** The mana it added, for a mana ability: what the triggered mana abilities of tapping its source see (CR 106.12a). */
  made?: ManaType[];
  next: number;
  /** Whether the last "you may ..." was done, for a following "If you do, ..." (CR 608.2c). */
  did?: boolean;
  /** What its instructions sacrificed, as it last existed: "When you do, ~ deals damage equal to that creature's power". */
  sacrificedThisWay?: LastKnown[];
  /** The Army its amass instruction chose (CR 701.47c), for "the amassed Army". */
  amassed?: { id: ObjectId; zc: number };
  /** Whether its controller won its last clash (CR 701.30d), for "If you win, ...". */
  wonClash?: boolean;
  /** Its last coin flip (CR 705.2): won or lost, and how many were won ("flip a coin until you lose a flip"). */
  flipped?: { won: boolean; wins: number };
  /** Its last roll (CR 706.2): each die's natural result that counts (not the ignored ones, 706.6), and the result. */
  rolled?: { sides: number; naturals: number[]; result: number; /** "The other result" (Effect roll's chooseOne). */ other?: number };
  scratch?: {
    queue?: PlayerId[]; // players still to choose, in APNAP order (CR 101.4)
    drawQueue?: PlayerId[]; // players still to draw: a draw can stop for dredge (CR 702.52a)
    chosen?: Record<string, ObjectId[]>; // cards each player chose to discard
    venture?: string; // the dungeon or room chosen while venturing (CR 701.49a-b)
    arranged?: { top: ObjectId[]; away: ObjectId[] };
    bottomOrders?: Record<string, ObjectId[]>; // putAllOnBottom: each owner's order, asked before anything moves
    ordered?: boolean; // "reorder your graveyard as you choose" asked already (graveyard.ts)
    forced?: ObjectId[]; // exileNamed's "all cards with that name" in the public graveyard, found without a choice (CR 701.23b)
    moved?: boolean; // a dig already moved the cards it took, and waits on the order of the rest (CR 401.4)
    ripple?: { revealed: ObjectId[]; queue: ObjectId[] }; // ripple's revealed cards, and those it may still cast (CR 702.60a)
    may?: boolean; // the answer to "you may ..."
    /** A vote (Effect "vote"): players still to vote in turn order, the votes left for the one voting, and their pick. */
    vote?: { queue: PlayerId[]; left?: number; may?: number; pick?: string };
    mayQueue?: PlayerId[]; // "each player may ...": players still to decide, in APNAP order (CR 101.4)
    mayers?: PlayerId[]; // and those who chose to
    mayStep?: number; // how many of its instructions are done
    /** A tempting offer's runs (see eachAccepted): the one going on, and the scratch kept between them. */
    offer?: { i: number; keep: string[] };
    /** The "if"s running, outermost first: whether each one's condition held as it was reached, and its instructions done. */
    ifs?: { holds: boolean; step: number }[];
    /** A punisher (see its effect): players still to choose, what each chose (an option's index or "none"), the round. */
    punish?: {
      queue: PlayerId[];
      /** The choice being made: an option's index or "none". */
      picked: Record<string, string>;
      /** The choices each player made this round (one, or `picks`). */
      made: Record<string, string[]>;
      /** The cards each player picked to discard and the permanents to sacrifice. */
      chosen?: Record<string, { discard?: ObjectId[]; sacrifice?: ObjectId[] }>;
      /** The discards and sacrifices are done; `penalty`: how many times the penalty has been run. */
      acted?: boolean;
      penalty?: number;
      round: number;
      times: number;
      picks: number;
      options: PunisherOption[];
      /** For the bots: the life the penalty costs, or that it makes a token for its controller. */
      lose?: number;
      tokens?: number;
      /** "If a player does" / "If no one does" (see the punisher effect). */
      mode?: "ifAny" | "ifNone";
    };
    punished?: PlayerId[]; // those who did none of its options, this round
    /** "Sacrifice an artifact, a creature, and a land": players still to pick, the slot being picked, the picks so far. */
    slots?: { queue: PlayerId[]; slot: number; picked: Record<string, ObjectId[]> };
    /** "Choose ..., then sacrifice the rest": whose turn to choose, which of their choices, and what each player kept. */
    keepRest?: { queue: PlayerId[]; slot: number; kept: Record<string, ObjectId[]>; /** Restore Balance: the fewest any of them controls, counted as it starts. */ fewest?: number };
    paid?: boolean; // the answer to "unless that player pays ..."
    payQueue?: PlayerId[]; // "each opponent sacrifices ... unless they pay": players still to choose whether to pay, in APNAP order
    paidBy?: PlayerId[]; // and those who paid
    newTarget?: TargetChoice; // "change the target of target spell": the new one, chosen as this resolves (CR 115.7a)
    explored?: ObjectId; // the nonland card explore revealed, waiting on "graveyard or top?"
    cascade?: { exiled: ObjectId[]; hit?: ObjectId }; // cards cascade exiled, and the one it may cast
    untilNonland?: { hit?: ObjectId; caster: PlayerId }; // the nonland card exileUntilNonland found, and who may cast it
    n?: number; // an amount the effect worked out before waiting on a player (CR 608.2h)
    nFor?: Record<string, number>; // the same, for each player when it counts their own ("half the cards in their hand")
    distributed?: Record<ObjectId, number>; // how a "distribute" effect's counters were divided, as it resolves
    found?: ObjectId[]; // the cards a library search found
    /** "Each player puts a creature card from their graveyard onto the battlefield" (Exhume): players still to choose, and the cards chosen so far. */
    yardPicks?: { queue: PlayerId[]; picked: Record<string, ObjectId[]> };
    /** "Each player may put ... from their hand onto the battlefield" (Show and Tell): players still to choose, and the cards chosen. */
    handPicks?: { queue: PlayerId[]; picked: Record<string, ObjectId[]> };
    searchQueue?: PlayerId[]; // players still to search, in APNAP order ("each player searches their library", CR 101.4)
    searchedBy?: { pid: PlayerId; found: ObjectId[] }[]; // the cards each player who has searched found, in that order
    flickered?: { id: ObjectId; zc: number }[]; // cards a flicker exiled, to return once Auras' hosts are chosen
    playLinked?: true; // "you may play the exiled card" (or cast the cipher copy) was asked
    cipherCopy?: ObjectId; // the copy of an encoded card offered to cast (CR 702.99a)
    looked?: ObjectId[]; // the top cards a "look at the top N" effect is choosing from
    connive?: { pid: PlayerId; id?: ObjectId; zc?: number }; // who connives, and the conniving permanent (CR 701.50)
    copies?: { of: string; left: number; targets?: TargetChoice[]; /** Demonstrate: the opponent who copies it too, and whether they have. */ opp?: PlayerId; oppDone?: true }; // spell copies still to make, and the next one's targets
    /** A clash (CR 701.30): the opponent, the revealed cards, who still decides, who puts theirs on the bottom. */
    endure?: string; // "counters" or "token" (CR 701.63a)
    tapOrUntap?: string; // "tap", "untap" or "neither", for "tap or untap target permanent"
    /** "You may cast a spell ... from your hand without paying its mana cost": the card picked, "none", or "cast" once it's offered. */
    castFromHand?: string;
    /**
     * "You may cast any number of spells ... from among them" (Primeval Spawn): the exiled cards, the total mana value
     * still allowed, the card last offered, the cards not cast when offered, and the card picked ("none" to stop).
     */
    /** exileFaceDown: a hand card is being chosen. */
    faceDownPick?: true;
    /** moveLinked with `one`: the card is being chosen. */
    linkedPick?: true;
    castAmong?: { ids: { id: ObjectId; zc: number }[]; budget?: number; maxMv?: number; casting?: ObjectId; declined: ObjectId[]; pick?: string; done?: true; /** How many were cast. */ cast?: number; /** `untilHits`: the cards that qualified; `handPick`, choosing which goes to the hand. */ hits?: ObjectId[]; handPick?: true };
    topOrBottom?: string; // the owner's choice: "top" or "bottom"
    /** The player a creature put onto the battlefield attacking attacks (CR 508.4), as a PlayerId string. */
    attackWhom?: string;
    /** "Tapped and attacking that player or a planeswalker they control": each opponent's pick (an attackChoices key). */
    attackEach?: Record<number, string[]>;
    /** "Search your library and/or graveyard": "both", or "graveyard" alone (no shuffle). */
    searchZones?: string;
    /** The card a "you may cast target card ... without paying its mana cost" offered (castTargetFree). */
    castingTarget?: ObjectId;
    damageSource?: string; // the source of damage chosen as it resolves (CR 609.7a): an object id, or "none" if there was none to choose
    /** "Roll two d8 and choose one result": the index of the die chosen (see runDiceEffect). */
    rollChoice?: string;
    evidence?: ObjectId[]; // the cards picked to collect evidence with as it resolves (CR 701.59a)
    clash?: { opp?: PlayerId; revealed?: Record<string, ObjectId | null>; queue?: PlayerId[]; bottom?: PlayerId[]; answer?: boolean };
    /** Auras entering without being cast: what each enchants (an auraHostKey), "none" if nothing (CR 303.4f-g). */
    auraHosts?: Record<ObjectId, string>;
    /** The Aura whose host is being chosen. */
    auraAsking?: ObjectId;
    /** "Choose artifact or enchantment": this instruction has asked its question. */
    asked?: true;
  };
}

/** Everything a player can do. Every input to the engine is one of these. */
export type Action =
  | { type: "passPriority"; player: PlayerId }
  /** `untapped`: for a land that may enter untapped by paying life or revealing a card (CR 614.12), do that. */
  /** `face`: for a modal double-faced card, the land face it's played as (CR 712.12). */
  | { type: "playLand"; player: PlayerId; objectId: ObjectId; untapped?: boolean; face?: number }
  /**
   * Activate a mana ability (CR 605.3): `ability` indexes manaAbilitiesOn (unset: the cheapest
   * one that makes `mana`), `mana` is the choice for one that offers several.
   */
  /** `tap`: what pays a "Tap an untapped creature you control" cost, if the ability has one. */
  /** `extra`: the mana picked for the triggered mana abilities tapping it triggers ("one mana of any color", CR 605.4a). */
  /** `combo`: for "Add {W}{W}, {W}{U}, or {U}{U}", which of them (ManaOption.combo). */
  | { type: "activateMana"; player: PlayerId; objectId: ObjectId; mana: ManaType; ability?: number; tap?: ObjectId[]; extra?: ManaType[]; combo?: number }
  /** `convoke`: creatures tapped to help pay (CR 702.51a); `improvise`: artifacts (CR 702.126a). */
  | ({ type: "castSpell"; player: PlayerId; objectId: ObjectId; targets?: TargetChoice[]; modes?: number[]; convoke?: ObjectId[]; improvise?: ObjectId[]; x?: number } & CostChoices)
  /** `tapCreatures`: the creatures tapped to pay a crew cost (CR 702.122a). */
  /** `costs`: what's sacrificed or discarded to pay for it (see ActivatedAbility.costs). */
  /**
   * For a mana ability (CR 605.1a), which resolves right away: `mana`, the color for its "one mana of any color" (chosen
   * as it resolves, CR 605.3b; without it, it's asked); `extra`, as for activateMana.
   */
  | { type: "activateAbility"; player: PlayerId; objectId: ObjectId; index: number; targets?: TargetChoice[]; modes?: number[]; tapCreatures?: ObjectId[]; x?: number; costs?: CostChoices; mana?: ManaType; extra?: ManaType[] }
  | { type: "chooseModes"; player: PlayerId; modes: number[] }
  | { type: "chooseTargets"; player: PlayerId; targets: TargetChoice[] }
  /** New targets for a spell copy, or none to keep the original's (CR 707.10c). */
  | { type: "copyTargets"; player: PlayerId; targets?: TargetChoice[] }
  /** The new target for a spell whose target is being changed (see PendingDecision "changeTarget"). */
  | { type: "changeTarget"; player: PlayerId; target: TargetChoice }
  /** `planeswalker`: it attacks that planeswalker, controlled by `defender`, instead of the player (CR 508.1b). */
  | { type: "declareAttackers"; player: PlayerId; attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[] }
  | { type: "declareBlockers"; player: PlayerId; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: "discard"; player: PlayerId; objectIds: ObjectId[] }
  /** Answer to arrangeTop: `top` goes back on top in this order (first = top); `away` goes to the bottom (scry) or graveyard (surveil). */
  /** For "bottom", `top` is the order the cards take at the bottom (first = highest, last = the very bottom). */
  | { type: "arrangeTop"; player: PlayerId; top: ObjectId[]; away: ObjectId[] }
  /** Answer to orderGraveyard: the same cards in their new order, first = top. */
  | { type: "orderGraveyard"; player: PlayerId; order: ObjectId[] }
  /** Answer to orderLibrary: the same cards in their new order, first = nearest the top. */
  | { type: "orderLibrary"; player: PlayerId; order: ObjectId[] }
  /** Answer to searchLibrary: the cards found (first = the one for `firstTo`). */
  | { type: "searchLibrary"; player: PlayerId; found: ObjectId[] }
  /** Answer to a distribute decision: how many counters each permanent gets (left out: none). */
  | { type: "distribute"; player: PlayerId; parts: Record<ObjectId, number> }
  /** Answer to pickPermanents. */
  | { type: "pickPermanents"; player: PlayerId; ids: ObjectId[] }
  /** Answer to chooseOption: one of its options. */
  | { type: "chooseOption"; player: PlayerId; choice: string }
  /** Answer to chooseMay. */
  | { type: "chooseMay"; player: PlayerId; yes: boolean }
  /** Answer a collectEvidence decision: the cards to exile, or none to not collect evidence. */
  | { type: "collectEvidence"; player: PlayerId; ids: ObjectId[] }
  /** Answer to mulligan: keep the hand, or shuffle it away and draw a new one. */
  | { type: "mulligan"; player: PlayerId; keep: boolean }
  /** Answer to bottomCards: these cards go on the bottom of the library, the first one lowest. */
  | { type: "bottomCards"; player: PlayerId; objectIds: ObjectId[] }
  /** Answers "handToTop": the cards from the hand, the first one ending on top of the library. */
  | { type: "handToTop"; player: PlayerId; objectIds: ObjectId[] }
  /** Exile a card from your hand with suspend, paying its suspend cost: a special action (CR 116.2f, 702.62a). */
  | { type: "suspend"; player: PlayerId; objectId: ObjectId }
  /** Exile a card from your hand with plot, paying its plot cost: a special action (CR 116.2k, 702.170a). */
  | { type: "plot"; player: PlayerId; objectId: ObjectId }
  /** Pay a locked door's mana cost to unlock it: a special action (CR 116.2m, 709.5e). `door`: 0 left, 1 right. */
  | { type: "unlockDoor"; player: PlayerId; objectId: ObjectId; door: number }
  /** Foretell a card from your hand: pay {2} and exile it face down, a special action (CR 116.2h, 702.143a). */
  | { type: "foretell"; player: PlayerId; objectId: ObjectId }
  /** Answer to assist: how much of the spell's generic mana to pay from your mana pool (0 to decline). */
  | { type: "assist"; player: PlayerId; n: number }
  /** Answer to assistCast: pay the rest of the cost and cast it, or `cancel` the cast (CR 733.1). */
  | { type: "finishAssistedCast"; player: PlayerId; cancel?: boolean }
  /** Answer to dredge: the card to dredge instead of drawing, or none to draw (CR 702.52a). */
  | { type: "dredge"; player: PlayerId; objectId?: ObjectId }
  /** Which of the cards looked at instead of drawing goes to the graveyard (Scion of Halaster). */
  | { type: "drawLook"; player: PlayerId; /** The card to put into the graveyard (none when fewer than two to look at). */ objectId?: ObjectId; /** Apply another replacement first (see the drawLook prompt). */ instead?: "archive" | { dredge: ObjectId } }
  /** Turn a face-down permanent face up by paying its morph or disguise cost: a special action (CR 116.2b, 702.37e). */
  | { type: "turnFaceUp"; player: PlayerId; objectId: ObjectId; /** Which of faceUpWays (a manifested card with morph has two). */ way?: number }
  /** Answer to payUnless: pay the cost from your mana pool, or let it be countered. */
  | { type: "payUnless"; player: PlayerId; pay: boolean }
  | { type: "concede"; player: PlayerId };

export class RulesError extends Error {}

import type { AbilityBody, GraveCastRider, Affects, FromTop, AltCostKind, DamageRuleSpec, ManaSpend, CastFromGraveyardKind, ChoiceKind, CostMod, NamePurpose, CounterKind, DamageMod, EntersOption, Modification, PayCost, PickAction, PunisherOption, StaticCondition, TargetChoice, TargetSpec, TokenSpec, CountMod, ManaTrigger, TriggeredAbility, TriggerDuration, SpentFor } from "./abilities";
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
  to?: { players?: "you" | "opponents" | "all"; objects?: TargetSpec; object?: { id: ObjectId; zc: number }; player?: PlayerId; /** "Other permanents you control" (The Wanderer): not this one. */ notObject?: ObjectId };
  /**
   * `chosen`: the source chosen (CR 609.7a), as the object it was then; `spell`: it was a spell, so the permanent it
   * becomes is that source too. `filter`: what the source has to be when it would deal the damage (CR 609.7b).
   */
  by?: { chosen?: { id: ObjectId; zc: number; spell?: true }; filter?: TargetSpec; /** Haze Frog: not damage from this object (the rule's source, as it was when the rule was made). */ not?: { id: ObjectId; zc: number } };
  /** What's left of "the next N damage" (CR 615.7). */
  left?: number;
  /** "The next time": it applies to the next damage event it can, then it's used up (CR 615.8). */
  nextTime?: true;
  redirect?: { object: ObjectId; zc: number } | { player: PlayerId };
  gainLife?: { colors?: Color[] };
  dealBack?: { colors?: Color[]; creatureToIt?: true };
  tokens?: TokenSpec;
  /** The Mindskinner: only damage from a source its controller controls; and each opponent mills that much (CR 615.5). */
  sourceYours?: true;
  mill?: true;
  /** With `mill`: its controller mills this many times the damage instead of each opponent milling it (Angel of Suffering: 2). */
  millSelf?: number;
  /** Nine Lives: a counter of this kind on that permanent for each source whose damage it would prevent, even damage that can't be prevented (rulings, CR 615.12). */
  counterOn?: { id: ObjectId; kind: string };
  /** "For each 1 damage prevented this way, put a +1/+1 counter on that creature" (Test of Faith, CR 615.5): on `to.object`, as the damage is prevented; `tally`: counted in GameState.preventedTally for a delayed trigger instead (Sacred Boon). */
  countersOn?: { counter: string; tally?: true };
  /** Vengeful Archon: "If damage is prevented this way, ~ deals that much damage to target player or planeswalker", fixed as it resolved (rulings). */
  dealTo?: { object: ObjectId; zc: number } | { player: PlayerId };
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
  /**
   * Its creature types as an effect that works outside the battlefield made them (Maskwood Nexus, Conspiracy, see
   * layers.ts offFieldTyped): true when it's every creature type, false when the effect replaced them (even for a card
   * with changeling). Unset: every creature type exactly when it has changeling (CR 702.73a).
   */
  everyCreatureType?: boolean;
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
/** "forest": put onto the battlefield face down as a Forest land with no other types or abilities (Yedora, CR 708.2a). */
export type FaceDownKind = "morph" | "megamorph" | "disguise" | "manifest" | "cloak" | "forest";

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
   * Its text box was exchanged with another permanent's (CR 612.5, 701.12h, a text-changing effect in layer 3): the key
   * in GameState.cards of the definition whose rules text it has now, until it leaves the battlefield. Not a copiable
   * value (CR 707.2).
   */
  textFrom?: string;
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
  /** Turn number it was last put into a graveyard ("a card from a graveyard that was put there this turn", Abyssal Harvester). */
  toGraveyardTurn?: number;
  /** The combat phase it was last put into a graveyard in, if it was (GameState.combatsThisTurn): "a card ... that wasn't put there this combat" (Storrev, Devkarin Lich). */
  toGraveyardCombat?: { turn: number; combat: number };
  /** The turn it was last put into a graveyard from a library ("put there from their library this turn", Captain
   * N'ghathrod), and by a mill instruction ("milled this turn", Tato Farmer, CR 701.17a). */
  fromLibraryTurn?: number;
  milledTurn?: number;
  /** The turn it was last put into a graveyard from the battlefield ("put there from the battlefield this turn", Brought Back). */
  fromBattlefieldTurn?: number;
  damage: number;
  deathtouchDamage: boolean;
  counters: Record<string, number>;
  /** When keyword counters of each kind were last put on it (CR 613.7c): their effect's timestamp in layer 6. */
  counterTimestamps?: Record<string, number>;
  isCommander: boolean;
  isToken: boolean;
  /** A token: the permanent whose ability created it, as that object ("tokens created with ~", Faerie Artisans). */
  createdWith?: { id: ObjectId; zc: number };
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
  /** When counters were last put on it (turn, and its zoneChanges then): "for the first time each turn". */
  countersPutAt?: { turn: number; zc: number; /** The kinds put on it that turn (Axgard Artisan's "+1/+1 counters ... for the first time each turn"). */ kinds?: string[] };
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
  /** Biomancer's Familiar: the turn in which, the next time it adapts, it adapts as though it had no +1/+1 counters. */
  adaptFresh?: number;
  /**
   * Suspected (CR 701.60): a designation, not copiable (701.60b), until it leaves the battlefield or an effect ends it. It
   * gives menace and "can't block" (701.60c) with the timestamp it became suspected, so losing all abilities later removes
   * them but not the designation (rulings).
   */
  suspected?: number;
  /**
   * The permanent whose ability put it onto the battlefield from a hand, as that object was (`zc`): "if it wasn't put
   * onto the battlefield with this ability" (Kodama of the East Tree). Gone when it leaves (CR 400.7).
   */
  putBy?: { id: ObjectId; zc: number };
  /** A Class's level (CR 716.2a-b), a designation it keeps until it leaves the battlefield; unset is level 1 (716.2d). */
  classLevel?: number;
  /** A Case's solved designation (CR 719.3b), kept until it leaves the battlefield; not a copiable value. */
  solved?: true;
  /** Harnessed (CR 701.64b): a designation kept until it leaves the battlefield; not a copiable value. */
  harnessed?: true;
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
  /** How many more of its controller's untap steps it skips after the next one (Telekinesis). */
  skipMoreUntaps?: number;
  /** The permanents that dealt it damage this turn, for "whenever a creature dealt damage by ~ this turn dies". */
  damagedBy?: ObjectId[];
  /** It was dealt damage this turn (forgotten in the cleanup step, CR 514.2, and when it leaves the battlefield). */
  wasDealtDamage?: true;
  /** It has dealt damage since it became this object (Karakyk Guardian: "as long as it hasn't dealt damage yet"). */
  hasDealtDamage?: true;
  /** "If that creature would die this turn, exile it instead": the turn that replacement lasts for (CR 614.1a). */
  exileIfDiesTurn?: number;
  /** "It can't be regenerated this turn": the turn its regeneration shields don't apply (CR 701.19c). */
  noRegenTurn?: number;
  /** "~ assigns no combat damage this turn": the turn (CR 510.1). */
  noCombatDamageTurn?: number;
  /** "~ assigns no combat damage this combat" (Master of Cruelties): the turn and its combat phase (GameState.combatsThisTurn). */
  noCombatDamageCombat?: { turn: number; combat: number };
  /**
   * "Until the end of your next turn, you may play that card" (impulse draw): who may play it from exile,
   * while it's still the same object (`zc`), until the end of this turn or of their next turn, or ("exiled") for as
   * long as it stays exiled. A warped card
   * (CR 702.185a) and a plotted card (CR 702.170d) may only be cast, by their owner, on a later turn than `turn`,
   * for as long as they stay exiled; a plotted one without paying its mana cost, as a sorcery. "yourNextTurn": until
   * that player's next turn begins (Three Wishes); "source": while `source` stays on the battlefield (Intet);
   * "yourNextEndStep": until that player's next end step begins (Yasmin Khan). "adventure": a card that went on an
   * adventure (CR 715.3d), for as long as it stays exiled, but not cast as an Adventure again this way. "duringNextTurn":
   * only during that player's next turn (Galvanic Relay). "whileControlled": while that player controls `source`, ended
   * for good the first time they don't (Lightning, Security Sergeant). "yourNextUpkeep": until that player's next upkeep
   * begins (Elkin Bottle), so during the rest of this turn and the turns before it.
   */
  mayPlay?: {
    player: PlayerId;
    zc: number;
    until: "thisTurn" | "nextTurn" | "exiled" | "warp" | "plot" | "foretell" | "yourNextTurn" | "source" | "yourNextEndStep" | "adventure" | "duringNextTurn" | "whileControlled" | "yourNextUpkeep";
    turn: number;
    source?: { id: ObjectId; zc: number };
    /** "Without paying its mana cost" (CR 118.9). */
    free?: true;
    /** Foretold with the foretell a permanent gave it in hand (Dream Devourer): its foretell cost is its mana cost (the face cast's, rulings) less this much generic mana, though it doesn't have foretell any more (rulings). */
    foretellReduce?: number;
    /** With `free`: it may be cast paying its costs instead (Ignite the Future, rulings), as it is when X isn't 0. */
    orPay?: true;
    /** "During any turn you attacked with a token" (Neyali): only in a turn its player declared a token as an attacker (Player.tokenAttackedTurn). */
    attackedWithToken?: true;
    /** "During any turn you attacked with a commander" (Neriv, Crackling Vanguard): only in a turn its player declared a commander as an attacker (Player.commanderAttackedTurn). */
    attackedWithCommander?: true;
    /** "If you control a Kavu" (Possibility Technician): only while `player` controls a permanent like this. */
    ifControl?: TargetSpec;
    /** "Mana of any type can be spent to cast it" (CR 609.4b). */
    anyType?: true;
    /** "If that spell would be put into a graveyard, exile it instead" (Dire Fleet Daredevil): see exileIfToGraveyard. */
    exileAfter?: true;
    /** "You may cast that card": not played as a land (rulings on Rev, Tithe Extractor). */
    castOnly?: true;
    /** "You may cast it if it's a creature spell" (Vivien, Champion of the Wilds): only as a creature spell (CR 601.3e). */
    creatureOnly?: true;
    /** Airbend's "by paying {2} rather than paying its mana cost" (CR 701.65a): an alternative cost, the only way. */
    cost?: string;
    /** "A spell cast this way costs {2} more to cast" (Soul Partition, Elite Spellbinder). */
    more?: number;
    /** "You may play one of those cards" (Nashi): the cards of one group, of which only one may be played (GameState.oneOfUsed). */
    oneOf?: string;
    /**
     * "You may cast an instant or sorcery spell from among those exiled cards" (Chandra, Hope's Beacon): only a spell like
     * this, the face cast counting (an instant Adventure of a creature card, rulings).
     */
    castFilter?: TargetSpec;
    /** "You may play it until you exile another card with this artifact" (Unstable Amulet): the source (`id@zc`); its next such exile ends this. */
    untilAnother?: string;
    /**
     * "For each nonland card type, you may cast a spell of that type from among the exiled cards" (Aminatou's Augury): the
     * cards of one group, each cast as one of its nonland card types that no other card cast from the group was cast as
     * (GameState.byTypeCast).
     */
    byType?: string;
    /** "Pay life equal to its mana value rather than paying its mana cost" (Nashi): an alternative cost, the only way. */
    life?: true;
    /** "You may cast it from your graveyard as an Adventure" (Mosswood Dreadknight): only as this face (CR 715.3). */
    face?: number;
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
  /** The turns it attacked in, latest last, as this object (CR 400.7), for "if it attacked during your last turn" (Giant Turtle); a few kept. */
  attackedTurns?: number[];
  /** The turn it was last declared as a blocker (CR 509.1), as this object (CR 400.7): "creature that blocked this turn". */
  blockedTurn?: number;
  /** The last combat it was declared as an attacker or blocker in (GameState.combatsThisTurn), as this object (CR 400.7):
   *  "if ~ attacked or blocked this combat" (Kjeldoran Home Guard). */
  declaredInCombat?: { turn: number; combat: number };
  /** The turn it last became blocked (CR 509.1h), as this object (CR 400.7): "if it was blocked this turn" (Fyndhorn Druid). */
  becameBlockedTurn?: number;
  /** The turn it last dealt combat damage to a player, as this object (CR 400.7): "for the first time each turn" (Raphael, Tag Team Tough). */
  combatHitTurn?: number;
  /** The turn this object last fought (CR 701.14), for "a creature that fought this turn" (Boxing Ring). */
  foughtTurn?: number;
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
  /** More creatures it must block this combat (Fighter Class triggering twice): it blocks one of them, its controller's choice (rulings). */
  provokedAlso?: { id: ObjectId; zc: number }[];
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
  /** An Aura with "enchant creature card in a graveyard" (Animate Dead): the card it's attached to there, as that object. */
  enchantsCard?: { id: ObjectId; zc: number };
  /** The turn it was drawn, as this object (`zc`): "cards in your hand drawn this turn" (Sylvan Library). */
  drawn?: { turn: number; zc: number };
  /** How many times it has untapped as this object: "for as long as ~ remains tapped" ends at the next (CR 611.2b). */
  untaps?: number;
  /** How many times it became tapped this turn, as this object (`zc`): "the first time that creature has become tapped this turn" (Captain America, Living Legend). */
  tapsThisTurn?: { turn: number; zc: number; n: number };
  /** As a spell, and as the permanent it became: the kicker costs paid for it, by index (CR 702.33d). */
  kicked?: number[];
  /** With `kicked`: a Dragons of Tarkir spell's "controlled a Dragon as you cast it", which a copy doesn't get (rulings). */
  kickedByControl?: true;
  /** As a spell, and as the permanent it became: the colors of mana spent to cast it (sunburst, CR 702.44a). */
  colorsSpent?: Color[];
  /** How many Phyrexian symbols of its cost its caster paid with life (compleated, CR 702.150a); kept as it enters. */
  phyrexianLife?: number;
  /** The creatures tapped to convoke it as it was cast (CR 702.51a), as the permanents they were; kept by the permanent it becomes, like `kicked`. */
  convoked?: { id: ObjectId; zc: number }[];
  /** The amount of mana spent to cast it (CR 601.2h), kept by the permanent the spell becomes. */
  manaSpent?: number;
  /** As a spell, and as the permanent it became: which spell cast this turn it was (StackItem.castNth). */
  castNth?: number;
  /** As a spell, and as the permanent it became: it was cast during its caster's main phase (addendum, StackItem.castInMain). */
  castInMain?: true;
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
  phased?: { by: PlayerId; indirect?: true; host?: { id: ObjectId; zc: number }; released?: true; /** Oubliette: it phases in (tapped) only when this object leaves the battlefield. */ until?: { id: ObjectId; zc: number } };
  /** As a spell: the zone it was cast from, how (flashback, escape, ...), and whether buyback was paid. */
  castFrom?: ZoneName;
  /** On the battlefield: it entered as a spell cast from its owner's hand ("if you cast it from your hand"). */
  castFromHand?: true;
  /** On the battlefield: it entered as a spell cast from a graveyard (Kotis: "was cast from a graveyard"). */
  castFromGraveyard?: true;
  /** It entered from the stack as a resolving permanent spell (not a copy), for "when ~ enters, if you cast it". */
  wasCast?: true;
  /** On the battlefield: it entered from a graveyard, its owner's, for "when ~ enters from a graveyard" (CR 603.6a). */
  enteredFromGraveyard?: true;
  /** On the battlefield: it entered from its owner's hand, cast or not (Thousand-Faced Shadow's "enters from your hand"). */
  enteredFromHand?: true;
  /** It entered the battlefield from exile (Faldorn's "a land you control enters from exile", CR 603.6a). */
  enteredFromExile?: true;
  /** Sigarda's Splendor: the life total last noted for it, its controller's (as it entered, then at each of their upkeeps). */
  notedLife?: number;
  castVia?: CastFromGraveyardKind;
  buyback?: boolean;
  /** A resolving spell's "return ~ to its owner's hand" (Cerebral Eruption): it goes there as it finishes resolving. */
  toHandOnResolve?: true;
  /** The turn this card was discarded into its owner's graveyard; cleared when it moves again (mayhem, CR 702.187b). */
  discardedTurn?: number;
  /** As a spell, and as the permanent it became: evoke or dash paid (CR 702.74a, 702.109a). */
  castAlt?: AltCostKind;
  /** A spell cast for its sneak cost: whom the creature returned to pay it was attacking (CR 702.190b). */
  sneak?: LastKnown;
  /** Cast using web-slinging (CR 702.188a), while a spell and as the permanent it became: the creature returned to pay for it, as it last existed. */
  webSlung?: LastKnown;
  /** As a spell: which of its CompiledCard.costOr ways to pay was chosen (Lethal Throwdown). */
  costOrPaid?: number;
  /** As a spell, and as the permanent it became: it was bargained (CR 702.166b). */
  bargained?: true;
  /** A token created by a resolving embalm ability (CR 702.128b). */
  embalmed?: true;
  /** As a spell, and as the permanent it became: its "you may collect evidence N" additional cost was paid (CR 701.59c). */
  evidence?: true;
  /** As a spell, and as the permanent it became: how much mana from Treasures was spent to cast it (CR 106.3). */
  treasureSpent?: number;
  /** A spell: mana that makes it uncounterable was spent on it (Cavern of Souls, CR 106.6). */
  uncounterableCast?: true;
  /** A creature spell: mana that gives it haste was spent on it (Arena of Glory), and for how long the creature has it. */
  hasteCast?: "endOfTurn" | "game";
  /** How much Opal Palace mana was spent to cast this commander (ManaAbility.spentCommanderCounters), until it enters. */
  commanderCountersCast?: number;
  /** Biophagus: additional +1/+1 counters it enters with, one for each such mana spent to cast it. */
  creatureCountersCast?: number;
  /** A spell: "that creature enters with an additional +1/+1 counter on it" (Boreal Outrider, CR 614.1c), as it resolves. */
  extraCounters?: Record<string, number>;
  /** A spell: "it gains haste until end of turn" from a cast trigger (Tyvar Kell's emblem), applying to the permanent it becomes (CR 400.7a). */
  spellGains?: { mods: Modification[]; timestamp: number; controller: PlayerId; source: string; forever?: true; until?: "yourNextTurn"; whileSpell?: true }[];
  /** A spell that gained rebound (Narset Transcendent), as it resolves (CR 702.88a). */
  reboundGained?: true;
  /** A spell that gained sunburst this many times (Lux Artillery): each instance works as it enters from the stack (CR 702.44a). */
  sunburstGained?: number;
  /** Bloodthirst the spell gained (Bloodlord of Vaasgoth: "it gains bloodthirst 3"): the total N, each instance apart (CR 702.54c). */
  bloodthirstGained?: number;
  /** Tribute (CR 702.104): the opponent chosen as it entered, and whether they put the +1/+1 counters on it. */
  tribute?: { to: PlayerId; paid?: true };
  /**
   * Exiled face down by hideaway (CR 702.75a): only players who controlled `by`, the permanent that exiled it, may look
   * at it (`seen`). Gone when it changes zones.
   */
  hiddenExile?: { by: ObjectId; seen: PlayerId[]; /** What its back says ("Face down"); hideaway's by default. */ label?: string; /** When: the cards one instruction exiled face down together share it, a group a processor chooses from (rulings on Ruin Processor). */ at?: number };
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
  exiledUntilLeaves?: { id: ObjectId; zc: number; hand?: true; /** Exiled from a graveyard (Idol of Endurance): it returns there (CR 610.3). */ graveyard?: true }[];
  /** Cast as a prototyped spell (CR 718.3): its alternative mana cost, color, power and toughness, on the stack and the battlefield. */
  prototyped?: boolean;
  /** Revealed for miracle as it was drawn (CR 702.94b): it stays revealed while it's in hand and its trigger waits. */
  miracleRevealed?: { turn: number; zc: number };
  /** A spell cast for its overload cost (CR 702.96a): "target" in its text is "each" while it's on the stack. */
  overloaded?: true;
  /** A spell cast for its cleave cost (CR 702.148a): the words in square brackets are gone from its text on the stack. */
  cleaved?: true;
  /**
   * The card this champion exiled (CR 702.72a), as it is in exile, and the champion's zoneChanges on the battlefield
   * then: its leaves-the-battlefield trigger returns it only if that's the permanent that left (CR 607.2a).
   */
  championed?: { id: ObjectId; zc: number; by: number };
  /** A replacement effect: if it would leave this zone, it's exiled instead (flashback, CR 702.34a; unearth, 702.84a). */
  exileIfLeaves?: ZoneName;
  /** A spell: "if that spell would be put into your graveyard, exile it instead" (Torrential Gearhulk, CR 614.1a). */
  exileIfToGraveyard?: true;
  /** Serra Paragon: the permanent this land or spell becomes gains this ability (as an ability text) for good. */
  entersGaining?: string;
  /** Edgar, Master Machinist: a spell cast with a once-each-turn permission whose "that artifact enters tapped" applies to the permanent it becomes. */
  castEntersTapped?: true;
  /** "As ~ enters, choose a creature type / color": what was chosen (CR 614.12). Forgotten when it leaves (CR 400.7). */
  chosen?: Chosen;
  /** Jeweled Amulet: the type of mana last noted for it ("note the type of mana spent to pay this activation cost"). */
  notedMana?: ManaType;
  /** A battle's protector (CR 310.9), chosen as it enters (310.9a) and again when that player can't be (704.5x-y). */
  protector?: PlayerId;
  /** How many permanents it devoured as it entered (CR 702.82b), for "for each creature it devoured". */
  devoured?: number;
  /** "As ~ enters, pay any amount of life" (CompiledCard.entersPayLife): how much was paid, for "the life paid as it entered". */
  lifePaidAsEntered?: number;
  /**
   * Cast bestowed (CR 702.103b): as a spell and as the permanent it becomes, it's an Aura with enchant creature, not a
   * creature (see defOf). It stops being bestowed when it becomes unattached or resolves with an illegal target (702.103e-f).
   */
  bestowed?: boolean;
  /** A creature spell cast with suspend has haste until this player loses control of it (CR 702.62a). */
  suspendHaste?: PlayerId;
  /** "If it doesn't have suspend, it gains suspend" (Delay, Jhoira of the Ghitu): it has suspend while it's this object, by its zone changes (CR 702.62, 400.7). */
  gainedSuspend?: number;
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
  /** "When that mana is spent to cast a creature spell ..." (Path of Ancestry): see ManaAbility.spentTrigger. */
  spentTrigger?: ManaSpentTrigger;
  /** "If any of that mana is spent on a creature spell, it gains haste ...": see ManaAbility.spentHaste. */
  haste?: "endOfTurn" | "game";
  /** With `haste`: only for a creature spell of this creature type (ManaAbility.spentHasteType). */
  hasteType?: string;
  /** Opal Palace's "if you spend this mana to cast your commander": see ManaAbility.spentCommanderCounters. */
  commanderCounters?: true;
  /** Biophagus: see ManaAbility.spentCreatureCounter. */
  creatureCounter?: true;
  /** Boseiju, Who Shelters All: see ManaAbility.spentUncounterable. */
  uncounterableInstantSorcery?: true;
  /** "Using mana produced by Tecutlan": the permanent that made it, "id#zoneChanges" (TriggeredAbility.cast.manaFromSelf). */
  source?: string;
}

/** A mana's "when that mana is spent" ability: its source as it made the mana, and what it does. */
export type ManaSpentTrigger = {
  sourceId: ObjectId;
  sourceCardId: string;
  sourceZc: number;
  body: AbilityBody;
} & SpentFor;

export interface Player {
  /** How many times their library has been shuffled (see rng.ts shuffleLibrary). */
  shuffles?: number;
  /** "You have no maximum hand size for the rest of the game" from a resolved spell or ability (CR 402.2). */
  noMaxHandSize?: true;
  /** "You have no maximum hand size for as long as you control ~" (The Great Synthesis): while they control that object (CR 611.2b). */
  noMaxHandSizeWhile?: { id: ObjectId; zc: number }[];
  /** "You have no maximum hand size until your next turn" (Enter the Infinite): until that player's next turn begins. */
  noMaxHandSizeUntilNextTurn?: true;
  /**
   * "Lands you control don't untap during your next untap step" (Bontu's Last Reckoning), "Creatures and lands target
   * opponent controls ..." (Exhaustion): permanents of these card types this player controls at their next untap step
   * stay tapped, also ones that came under their control later (Mana Vapors rulings).
   */
  noUntapNext?: string[];
  /** Epic (CR 702.50a-b): "for the rest of the game, you can't cast spells", and the spell that said so. */
  cantCastSpells?: string;
  /** The names of paradigm spells this player has had resolve (CR 702.192a): only the first of each name counts. */
  paradigms?: string[];
  /**
   * "Skip your next untap step / draw step / combat phase / turn" (CR 614.10): each entry skips one, the next to happen;
   * `turn`: only during that turn ("skips their next combat phase this turn"). `wholeTurn`: "skips all combat phases of
   * their next turn" (False Peace): bound to that player's next turn as it begins, then every combat phase of it.
   */
  skips?: { what: SkipWhat; turn?: number; wholeTurn?: true }[];
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
  /** "The next spell you cast this turn has improvise" (Archway of Innovation): the turn it was made in, until a spell is cast. */
  nextSpellImprovise?: number;
  /** "The next spell you cast this turn has convoke" (Wand of the Worldsoul): the same. */
  nextSpellConvoke?: number;
  speedTurn?: number;
  /**
   * What this player gained until end of turn ("You gain shroud until end of turn", "you gain protection from the chosen
   * player"): Hexproof, Shroud or a protection keyword (CR 702.11d, 702.16b-e, 702.18d), lost in the cleanup step (514.2).
   */
  gained?: string[];
  /** The same, until this player's next turn ("you gain protection from that player until your next turn", CR 611.2b). */
  gainedUntilNextTurn?: string[];
  /** "Until your next turn, your life total can't change" (Teferi's Protection): no life gained or lost (CR 119.7-8). */
  lifeCantChange?: true;
  /** Screaming Nemesis: "they can't gain life for the rest of the game", whatever happens to the Nemesis (rulings). */
  cantGainLifeForGame?: true;
  /** "Until your next turn, creatures can't attack you unless their controller pays {2} for each" (Summon: Yojimbo), one entry per effect. */
  attackTaxUntil?: { n: number; planeswalkers?: true }[];
  /** "Until your next turn, creatures can't attack you" (Chronomantic Escape): this player, not their planeswalkers. */
  unattackableUntil?: true;
  /**
   * Orzhov Advokist: the players whose creatures can't attack this player or planeswalkers they control until this
   * player's next turn begins (whatever creatures they control by then, rulings).
   */
  attackBansUntil?: PlayerId[];
  /**
   * The Second Doctor: during this player's next turn (`turn`, set as it begins), they can't attack `player` or
   * permanents `player` controls.
   */
  attackBansNextTurn?: { player: PlayerId; turn?: number }[];
  /** Effect attackBanThisTurn: this player's creatures can't attack `player` (or, with `subtype`, their planeswalkers of that type) during `turn`. */
  attackBansThisTurn?: { player: PlayerId; turn: number; subtype?: string; /** "This combat" (Champions of Minas Tirith): only in that combat phase (GameState.combatsThisTurn). */ combat?: number }[];
  /** "Until end of turn, your life total can't change" (Flare of Fortitude): the turn it's for (CR 119.7-8). */
  lifeCantChangeTurn?: number;
  /** "Until end of turn, damage that would reduce your life total to less than 1 reduces it to 1 instead" (Angel's Grace): the turn it's for. */
  lifeFloorTurn?: number;
  /** The turn this player last began to activate an exhaust ability (CR 702.177b, Elvish Refueler). */
  exhaustTurn?: number;
  /** Times each commander (by object id) has been cast from the command zone. CR 903.8 */
  commanderCasts: Record<ObjectId, number>;
  /** Poison counters (CR 122.1f); ten or more loses the game (CR 704.5c). */
  poison?: number;
  /** Energy counters (CR 107.14, 122.1). */
  energy?: number;
  /** Experience counters (CR 122.1; Meren of Clan Nel Toth). */
  experience?: number;
  /** Rad counters (CR 728): each of their precombat main phases, a triggered ability mills that many. */
  rad?: number;
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
  /** The names of the creatures that have dealt this player combat damage this game (Gollum, Obsessed Stalker). */
  combatDamagedByNames?: string[];
  /** How many spells of each English name this player has cast this game (copies aren't cast): Approach of the Second Sun. */
  castNames?: Record<string, number>;
  /** The turn of their draw step in which they last drew (the first card drawn in it isn't doubled by Alhammarret's Archive). */
  firstDrawStepDraw?: number;
  /** The turn in whose draw step this player last drew a card: the first card they draw in each draw step (Orcish Bowmasters). */
  drewInDrawStep?: number;
  /** The turn this player last would have drawn a card: "the first time you would draw a card each turn" (Scion of Halaster). */
  firstWouldDraw?: number;
  /**
   * Urabrask, Heretic Praetor: "the next time they would draw a card this turn, instead they exile the top card of their
   * library. They may play it this turn." One entry for each, in turn `turn`; each replaces one draw (CR 614.1a).
   */
  nextDrawExiles?: { turn: number; source: string }[];
  /**
   * The Words (Words of Wilding, Words of Worship): "The next time you would draw a card this turn, create a 2/2 green
   * Bear creature token (you gain 5 life) instead." One entry for each activation, in turn `turn`; each replaces one draw
   * (CR 614.1a, 614.11); with different ones waiting, the player chooses (PendingDecision "drawInstead").
   */
  nextDrawInstead?: { turn: number; source: string; sourceId?: ObjectId; sourceZc?: number; gain?: number; token?: TokenSpec }[];
  /** The turn this player was last dealt combat damage, and the turns their current and previous turns began (s.turn), for "if you haven't been dealt combat damage since your last turn". */
  combatDamagedTurn?: number;
  turnBegan?: number;
  /** How many turns this player has begun this game, extra turns too ("your first, second, or third turn of the game"). */
  turnsTaken?: number;
  lastTurnBegan?: number;
  /**
   * The latest turn of their own (s.turn) in which this player cast a spell or put a nontoken permanent onto the
   * battlefield, for Arboria's "unless that player cast a spell or put a nontoken permanent onto the battlefield during
   * their last turn" (what they did, whatever became of it, rulings).
   */
  actedTurn?: number;
  /** The turn this player last attacked with a creature, for raid's "if you attacked this turn". */
  attackedTurn?: number;
  /** The turn this player last activated a loyalty ability of a planeswalker (The Chain Veil). */
  loyaltyTurn?: number;
  /** The turn this player last committed a crime (CR 700.13), for "if you've committed a crime this turn". */
  crimeTurn?: number;
  /** The mana this player has spent to cast spells this turn (`turn`), for expend (CR 700.14). */
  expended?: { turn: number; n: number };
  /**
   * The creatures this player declared as attackers this turn ("id@zoneChanges"): one declared in two combats counts once,
   * one put onto the battlefield attacking not at all (Windbrisk Heights rulings).
   */
  /** How many creatures this player declared as attackers in this turn's latest combat (Kytheon, Hero of Akros: "~ and at least two other creatures attacked this combat"). */
  attackedCombat?: { turn: number; combat: number; n: number };
  attackedWith?: { turn: number; keys: string[]; /** Each one's creature types as it was declared ("all" with changeling-like), for "you attacked with three or more Merfolk this turn" (Deepway Navigator). */ kinds?: Record<string, string[] | "all"> };
  /**
   * The total power of the creatures this player declared as attackers in the latest combat, as they were declared, and its
   * turn (pack tactics: a later change of power, or an attacker leaving, doesn't matter; AFR release notes).
   */
  attackPower?: { turn: number; n: number };
  /** The players this player attacked with creatures in the latest combat, and its turn (melee, CR 702.121a). */
  attackedPlayers?: { turn: number; players: PlayerId[] };
  /** The players this player attacked with creatures in any combat of its latest turn that had one (Weathered Sentinels). */
  attackedInTurn?: { turn: number; players: PlayerId[] };
  /** The city's blessing (CR 702.131c): once a player has it, they keep it for the rest of the game. */
  citysBlessing?: boolean;
  /** An enduring story (CR 702.195b): from storied, kept for the rest of the game. */
  enduringStory?: boolean;
  /**
   * The Ring (CR 701.54c): the emblem this player got the first time the Ring tempted them (`timestamp`), how many
   * times it has tempted them, and their Ring-bearer (CR 701.54a-b), the creature it was as it was chosen.
   */
  ring?: { tempted: number; timestamp: number; bearer?: { id: ObjectId; zc: number } };
  /** The last turn they declared a token as an attacker (Neyali's "during any turn you attacked with a token"; CR 508.1). */
  tokenAttackedTurn?: number;
  /** How many times this game they cycled a card of each English name (Yidaro, Wandering Monster: "If you've cycled a card named ~ four or more times this game"; any card with that name counts, rulings). */
  cycledNames?: Record<string, number>;
  /** The last turn they declared a commander as an attacker (Neriv's "during any turn you attacked with a commander"; CR 508.1, 903.3). */
  commanderAttackedTurn?: number;
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
  /** "Target spell can't be countered" (Vexing Shusher): from then on, while it's this stack object (CR 101.2). */
  uncounterable?: true;
  kind: "spell" | "ability";
  objectId?: ObjectId; // the card on the stack, for spells
  sourceId?: ObjectId; // the permanent an ability came from
  sourceCardId?: string; // its card definition (abilities remember their source, CR 113.7a)
  sourceZc?: number; // the source's zoneChanges when the ability was created: "this creature" means that object only
  /** An activated loyalty ability (CR 606.3), for "target loyalty ability of a planeswalker". */
  loyalty?: true;
  controller: PlayerId;
  /** Another player gained control of this spell (Commandeer): its controller didn't cast it (Cunning Nightbonder's rulings). */
  controlTaken?: true;
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
  /** An activated ability whose text asks how many times "this ability has been activated this turn" (Dragon Whelp): its index. */
  activatedIndex?: number;
  /** A Saga's chapter ability: while it's on the stack, the Saga isn't sacrificed (CR 714.4). */
  chapter?: true;
  /** A Saga's final chapter ability (its greatest chapter number): the Saga's mana value, for "whenever the final chapter ability of a Saga you control resolves" (Narci). */
  finalChapter?: number;
  lki?: LastKnown;
  /** A station ability: the creature tapped to pay for it, and its power as it last existed if it has left (CR 702.184a). */
  stationed?: { id: ObjectId; zc: number; power: number };
  /** A crew ability: how many creatures were tapped to pay its crew cost (Mighty Servant of Leuk-o, CR 702.122a). */
  crewers?: number;
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
  /** See PendingTrigger.tapped. */
  tapped?: number;
  /**
   * In `castItems` only: the spell's mana value as it was put on the stack, X included (CR 202.3e), for when it has left
   * the stack by the time something asks (a countered spell's cascade uses its last known information, CR 113.7a).
   */
  castMv?: number;
  /** The spell's colors as it was cast (Ramos, Dragon Engine), for when it has left the stack (CR 113.7a). */
  castColors?: Color[];
  /** The spell's name as it was cast, a split card's half's (CR 709.3b); none face down (CR 708.2a). In `castItems` only. */
  castName?: string;
  /** An amount "as you cast this spell" (Count asCast), counted as it became cast (rulings on Lifestream's Blessing). */
  asCast?: number;
  /** Kicker costs paid (CR 702.33d), for a spell or its permanent's enters trigger. */
  kicked?: number[];
  /** The `kicked` is a Dragons of Tarkir spell's "controlled a Dragon as you cast it": not copied (rulings). */
  kickedByControl?: true;
  /** For its permanent's enters trigger: how many colors of mana were spent to cast it (converge, CR 207.2c). */
  colorsSpent?: number;
  /** What its trigger event was about: the damage dealt ("that much"), the player dealt it ("that player"). */
  event?: TriggerEventInfo;
  /** What was sacrificed to cast it, as it last existed ("the sacrificed creature's power", CR 608.2h). */
  sacrificed?: LastKnown[];
  /** See PendingTrigger.amassed. */
  amassed?: { id: ObjectId; zc: number };
  /** See PendingTrigger.putThisWay. */
  putThisWay?: { id: ObjectId; zc: number }[];
  /** See PendingTrigger.fromSpell. */
  fromSpell?: true;
  /** The names of cards moved to pay its cost beyond mana: Jester's Scepter's "that card" (CR 608.2h). */
  costCardNames?: string[];
  /** The cards a discard cost discarded (keys into `cards`): "if the discarded card wasn't a land card" (Grab the Prize). */
  costDiscarded?: string[];
  /** "Remove all +1/+1 counters from ~" paid as a cost: how many were removed (Sage of Hours, "counters removed this way"). */
  countersRemoved?: number;
  /** The cards an "Exile a card from your hand" cost exiled, as the objects they became there: "the exiled card" (Jhoira of the Ghitu). */
  costExiled?: { id: ObjectId; zc: number }[];
  /**
   * An activated mana ability resolving right away, never on the stack (CR 605.3b): `index`, the ability; `tapped`, {T}
   * was in its cost, so it tapped its source for mana (CR 106.12); `extra`, the mana picked for what that triggers.
   */
  manaAbility?: { index: number; tapped: boolean; extra?: ManaType[]; /** What its source was as it was activated: a snow permanent, a Treasure, a creature, an artifact (CR 106.3). */ from?: ManaOrigin[] };
  /** For an activated ability: how much mana from Treasures was spent to activate it (CR 106.3). */
  treasureSpent?: number;
  /** For an activated ability: the mana spent to pay its cost, one entry for each mana (Jeweled Amulet's note). */
  manaSpentTypes?: ManaType[];
  /** A triggered ability's intervening "if": it does nothing unless this is still true as it resolves (CR 603.4). */
  ifCond?: StaticCondition;
  /** For a spell: how many spells were cast before it this turn (storm, CR 702.40a). */
  castNth?: number;
  /** For a spell: its casualty cost was paid (CR 702.153a). */
  casualty?: boolean;
  /** For a spell: its conspire cost was paid (CR 702.78a). */
  conspired?: boolean;
  /** For a spell: how many instances of conspire were paid, when more than one (CR 702.78b). */
  conspiredTimes?: number;
  /** A copy of a spell (CR 707.10), not cast. */
  copy?: boolean;
  /** For a spell: cast during its controller's main phase (addendum, "if you cast this spell during your main phase"). */
  castInMain?: true;
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
  /** `thatCombat`: at the beginning of the added combat phase `combat` (GameState.addedPhases), this turn only. */
  /** `playersNextEndStep`: at the beginning of `player`'s next end step (The Eternal Wanderer: the exiled card's owner's). */
  when: "nextEndStep" | "yourNextEndStep" | "yourNextTurnEndStep" | "playersNextEndStep" | /** "At the beginning of the next combat" (Legion's Initiative): the next beginning of combat step, any player's. */ "nextBeginCombat" | "yourNextUpkeep" | "nextTurnUpkeep" | "eachYourUpkeep" | "eachYourPrecombatMain" | "yourNextMain" | "yourNextFirstMain" | "endOfCombat" | "nextCleanup" | "leaves" | "lostControl" | "thatCombat" | /** With `thisTurn`: each time the subject becomes blocked this turn (Barreling Attack, CR 603.7b). */ "becomesBlocked";
  player?: PlayerId;
  combat?: number;
  /** What it remembers as its trigger event: the player "its controller" was, the amount "that spell's mana value" was (see the delayed effect). */
  event?: TriggerEventInfo;
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
  /** With `dies`: any permanent, not only a creature (Devouring Tendrils, CR 700.4). */
  anyPermanent?: true;
  /** With `dies`: "When it dies under your control this turn" (Desperate Measures): only while `controller` controlled it as it died. */
  underControl?: true;
  /** With `dies`: "When target creature is put into your graveyard this turn" (Saffi Eriksdotter): only one `controller` owns. */
  ownedByController?: true;
  /** With `dies`: "if it has an egg counter on it" (Xira, the Golden Sting): only if it had one as it last existed (CR 603.4). */
  ifHadCounter?: string;
  /**
   * The ability's source as it was when this was made, when its instructions are about that and not the subject ("When
   * that creature dies this turn, flip ~", Initiate of Blood): "~" is that object only (CR 603.7c, 400.7). Also an Aura's
   * card in a graveyard ("Return ~ to the battlefield attached to that creature at the beginning of the next end step").
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
  /** "Skip the untap step of that turn" (Savor the Moment, CR 614.10). */
  skipUntap?: true;
  /** "During that turn, power-up abilities can't be activated" (Kang the Conqueror): anyone's (CR 702.193). */
  noPowerUp?: true;
}

/** A triggered ability waiting to be put on the stack. CR 603.3 */
export interface PendingTrigger {
  sourceId: ObjectId;
  sourceCardId: string;
  controller: PlayerId;
  index: number; // which of the card's triggered abilities
  sourceZc?: number; // the source's zoneChanges when it triggered
  modes?: number[]; // once chosen, for a modal trigger (CR 603.3c)
  /** "If you control a commander, you may choose both instead" was true as it was put on the stack (AbilityBody.modal.bothIf). */
  both?: true;
  /** "Choose up to X" (Bumi, King of Three Trials): X as it was put on the stack (AbilityBody.modal.maxCount). */
  maxModes?: number;
  cause?: string; // the stack item that triggered it, see StackItem.cause
  /** Firebender Ascension: this trigger's tag, and the tag of the trigger whose stack item becomes `cause` once it's put on the stack. */
  tag?: string;
  causeTag?: string;
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
  /** A reflexive trigger after "tap any number of untapped creatures you control": how many were tapped. */
  tapped?: number;
  /** A reflexive trigger after "you may sacrifice another creature": that creature as it last existed (CR 608.2h). */
  sacrificed?: LastKnown[];
  /** A reflexive trigger after amassing: the amassed Army (CR 701.47c). */
  amassed?: { id: ObjectId; zc: number };
  /** Gilgamesh: a reflexive trigger's "them", the permanents the ability put onto the battlefield, as they were then. */
  putThisWay?: { id: ObjectId; zc: number }[];
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
  /** Its final chapter ability: the Saga's mana value (StackItem.finalChapter). */
  finalChapter?: number;
  /** Its intervening "if" (CR 603.4), checked again as it resolves. */
  ifCond?: StaticCondition;
}

export interface LastKnown {
  /** The object it was (a card keeps its id in its new zone): "another permanent card" than the one sacrificed this way. */
  id?: ObjectId;
  counters?: Record<string, number>;
  /** Its card types as it last existed (CR 608.2h): "a permanent that shares a card type with it" (Braids). */
  types?: string[];
  /** Its subtypes as it last existed: "if the sacrificed creature was a Hamster" (Minsc & Boo); `allCreatureTypes`, a changeling's. */
  subtypes?: string[];
  allCreatureTypes?: true;
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
  /** It was a token (Prowling Geistcatcher: "If that creature was a token"), for a "whenever you sacrifice" trigger. */
  token?: true;
  /** It was suspected as it last existed (CR 701.60): "if the sacrificed creature was suspected". */
  suspected?: true;
  /** It was legendary as it last existed: "if the sacrificed creature was legendary" (Nasty End). */
  legendary?: true;
  /** Its colors as it last existed: "if the sacrificed creature was red" (Lyzolda). */
  colors?: Color[];
  /** It was a commander: "if the sacrificed permanent was a commander" (Tevesh Szat, CR 903.3). */
  commander?: true;
  /** The player chosen for it as it entered ("the chosen player"), as it last existed. */
  chosenPlayer?: PlayerId;
  /** It was sacrificed for this creature's exploit (CR 702.110a): "if it exploited that creature" (Silumgar Scavenger). */
  exploitedBy?: { id: ObjectId; zc: number };
  /** Who controlled each Aura attached to it as it last existed, one entry per Aura (Hateful Eidolon, CR 603.10a). */
  auraControllers?: PlayerId[];
  /** The Equipment attached to it as it last existed (Zack Fair: "an Equipment that was attached to ~"). */
  equipment?: { id: ObjectId; zc: number }[];
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
  /**
   * Cast a prototype card prototyped together with another alternative cost (One with the Multiverse's "without paying
   * its mana cost"): prototyped isn't an alternative cost (CR 718.3, rulings), so `alt` can't say both.
   */
  prototyped?: true;
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
  /** The permanent that gets the counter for "Put a -1/-1 counter on a creature you control" (Hatchet Bully, CR 602.2b). */
  counterOn?: ObjectId[];
  /** Waterbend as an additional cost to cast it (CR 701.67a): untapped artifacts and creatures you control, each paying {1}. */
  waterbend?: ObjectId[];
  /** Cards in hand revealed for "reveal a Pirate card from your hand". */
  reveal?: ObjectId[];
  /** Cards exiled from your hand for "exile a blue card from your hand" (Force of Will). */
  exileFromHand?: ObjectId[];
  /** The Defilers: the permanents whose "you may pay 2 life" this spell pays, each once (CostMod.payLife, rulings). */
  lifeFor?: ObjectId[];
  /** Which way to pay "sacrifice a creature or pay {3}{B}" (an index into CompiledCard.costOr, CR 601.2b). */
  costOr?: number;
  /** Permanents to return to their owner's hand: ninjutsu's unblocked attacker (CR 702.49a). */
  returnToHand?: ObjectId[];
  /** The creature sacrificed for casualty (CR 702.153a), if any. */
  casualty?: ObjectId;
  /** Cast with a once-each-turn graveyard permission (CastFromGraveyard.permits): which one (Muldrotha's slot for the spell). */
  permit?: string;
  /** Aminatou's Augury: the nonland card type it's cast as, of its own (GameObject.mayPlay.byType); unset, `defaultByType`'s. */
  asType?: string;
  /** The artifact, enchantment, or token sacrificed for bargain (CR 702.166a), if any. */
  bargain?: ObjectId;
  /** The permanent sacrificed for offering (CR 702.48a), if any. */
  offering?: ObjectId;
  /** "As an additional cost to cast this spell, you may collect evidence N": the cards exiled for it, if it's paid (CR 701.59a). */
  evidence?: ObjectId[];
  /** "Collect evidence N" as a cost (an ability's, Conspiracy Unraveler's): the cards exiled from your graveyard for it. */
  collect?: ObjectId[];
  /** Craft's materials (CR 702.167a): permanents you control and/or cards in your graveyard, exiled. */
  craft?: ObjectId[];
  /** "Remove three counters from among ... you control": one entry for each counter removed, which permanent and kind. */
  counters?: { id: ObjectId; kind: string }[];
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
   * as `turnOf`'s next turn begins (CR 611.2b), or when it would have for a player who left (CR 800.4m);
   * "endOfYourNextTurn" in the cleanup step of `turnOf`'s next turn after `sinceTurn` (CR 514.2); "yourNextUpkeep" as
   * the upkeep of `turnOf`'s next turn after `sinceTurn` begins.
   */
  duration: "endOfTurn" | /** "Until end of combat": it ends as the combat phase ends (CR 500.5a). */ "endOfCombat" | "game" | "yourNextTurn" | "endOfYourNextTurn" | "yourNextUpkeep" | "whileTapped" | "whileControlled";
  turnOf?: PlayerId;
  sinceTurn?: number;
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
  whileControlled?: { id: ObjectId; zc: number; controller?: PlayerId };
  /** "For as long as it has a vow counter on it" (CR 611.2b): it applies only to those of `affected` with one (Promise of Loyalty). */
  whileCounter?: string;
  /** "You may pay {W} to end this effect" (a Licid): `controller` may pay `cost` any time they have priority (CR 116.2c). */
  endable?: { cost: string };
  affected: ObjectId[];
  /**
   * Keywords it doesn't give some of `affected`: they couldn't have them as it was created (an Archetype's "can't have or
   * gain flying"), so it never gives them, even after that ability stops applying (rulings on the Archetypes).
   */
  notGranted?: Record<ObjectId, string[]>;
  /** Instead of `affected`: whatever is in this group from `controller`'s view, at any time (Effect groupRules). */
  group?: Affects;
  mods: Modification[];
}

/** What the engine is waiting on from a specific player, beyond normal priority. */
export type PendingDecision =
  | { kind: "declareAttackers"; player: PlayerId }
  /** `defender`: Odric's controller (`player`) declares the blockers of that defending player (GameState.blocksChosenBy). */
  | { kind: "declareBlockers"; player: PlayerId; remaining: PlayerId[]; defender?: PlayerId }
  | { kind: "discardToHandSize"; player: PlayerId; count: number }
  /** A resolving spell or ability makes this player discard `count` cards of their choice (CR 701.9b). */
  | { kind: "discard"; player: PlayerId; count: number; source: string; /** Only cards like this: "discard a creature card". */ filter?: TargetSpec; /** Exiled, not discarded ("exiles a card from their hand"). */ exile?: true; /** Up to `count` ("discard any number of cards"), none too. */ upTo?: true; /** Only these cards ("then discard one of them": the cards just drawn, Soldevi Sage). */ among?: ObjectId[] }
  /** "Put two cards from your hand on top of your library in any order": which, and their order (first on top). */
  | { kind: "handToTop"; player: PlayerId; count: number; source: string; /** On the bottom instead, the first pick lowest. */ bottom?: true; /** Shuffled into the library instead (See Beyond). */ shuffle?: true; /** Scroll Rack: any number up to `count`, exiled face down first and traded for as many from the top of the library. */ upTo?: true; /** Library of Leng: these cards are being discarded because of an effect, and any of them may go on top of the library instead of into the graveyard (`upTo`, the first pick ending on top). */ discarding?: ObjectId[] }
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
  | { kind: "chooseMay"; player: PlayerId; prompt: string; source: string; card?: ObjectId; /** What declining means, shown after the question (Fandaniel: "If you don't, you lose 4 life."), or what doing it means (The Second Doctor). */ otherwise?: string; /** One target of a "may" asked about each of its targets (Effect "may" `eachTarget`). */ eachTarget?: true; /** "Each player may discard their hand and draw this many cards". */ wheel?: number; pay?: PayCost; /** Pay to keep a permanent: echo, cumulative upkeep. */ keep?: boolean; /** Clash: put the revealed `card` on the bottom of the library (CR 701.30a)? */ clash?: boolean; /** "You may repeat this process" (Ad Nauseam). */ repeat?: true; /** Lim-Dûl's Vault: the cards looked at, shown with the question. */ vault?: ObjectId[]; /** Krark's Thumb: one of the two coins was won and one lost; yes keeps the won flip, no the lost one. */ thumb?: true; /** Odric: pay `pay` for the blocks `chooser` declared for this player, or have them choose again (rulings). */ blockTax?: { chooser: PlayerId; blocks: { blocker: ObjectId; attacker: ObjectId }[]; remaining: PlayerId[] } }
  /**
   * "Counter that spell or ability unless its controller pays {2}" (ward, CR 702.21a). The player
   * may activate mana abilities first (CR 605.3a), then pays or declines.
   */
  | { kind: "payUnless"; player: PlayerId; cost: string; life?: number; /** Cards to discard as (part of) the payment. */ discard?: number; /** "Unless its controller discards their hand" (Perplex): the whole hand, even an empty one. */ discardHand?: true; /** "Unless its controller exiles all cards from their graveyard" (Grip of Amnesia): all of them, even none. */ exileGraveyard?: true; /** "Ward—Discard a card at random": this many cards, chosen at random once they pay. */ discardRandom?: number; /** "Ward—Get five poison counters": this many poison counters as the payment. */ poison?: number; /** Permanents to sacrifice as (part of) the payment ("Ward—Sacrifice a creature"), chosen after saying yes. */ sacrifice?: { n: number; filter: TargetSpec }; /** "Ward—Waterbend {4}": up to this many artifacts and creatures they control may be tapped to pay {1} each of it (CR 701.67a). */ waterbend?: number; source: string; what: string; /** What happens if they don't, when it isn't "[what] is countered". */ otherwise?: string }
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
  | { kind: "castFree"; player: PlayerId; objectId: ObjectId; source: string; /** Miracle: the cost of the instance that triggered (a granted one, Lorehold), when not the card's own. */ miracleCost?: string; /** Madness a permanent gave the card (Falkenrath Gorger): that cost, when not the card's own. */ madnessCost?: string; /** Madness: for its madness cost instead (CR 702.35a), miracle for its miracle cost (702.94a); suspend: free, and a creature gains haste (702.62a). */ how?: "madness" | "suspend" | "miracle" | /** "You may cast that card" as it resolves (Conduit of Worlds): for its mana cost, timing ignored (CR 608.2g, 601.2). */ "paid" | /** Discover (CR 701.57a): if it isn't cast, it goes to the hand. */ "discover" | /** A defeated Siege: only transformed (CR 310.12b). */ "transformed"; /** "Mana of any type can be spent to cast that spell" (Tinybones, CR 609.4b). */ anyType?: true; /** "A spell with mana value X or less" (Sunbird's Invocation), "the same mana value" (Powerbalance): the spell as it's cast, a split card's half or a prototyped spell (CR 202.3, 709.3, 718.3b). */ mv?: { max?: number; exact?: number }; /** "Instant and/or sorcery spells" (Invoke Calamity): the spell as it's cast is of one of these card types (rulings: a modal double-faced card's back face, either half of a split card). */ types?: string[] }
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
      instead?: { archive?: number; dredge?: ObjectId[]; /** Abundance's "you may instead reveal" (its name). */ abundance?: string; /** Underrealm Lich's look (its name): applied first, the "first time" look is used up. */ dig?: string };
      /**
       * Underrealm Lich (CompiledCard.drawDig) instead: which of `cards` goes into the hand, the rest into the graveyard;
       * no draw follows. `made` are the draws after this one that replacements already made (see draw), `archives` how
       * many Alhammarret's Archives could still replace this one.
       */
      keep?: true;
      /** Tomorrow, Azami's Familiar (CompiledCard.drawDigBottom): the rest go on the bottom of the library in any order. */
      bottom?: true;
      made?: number[];
      archives?: number;
    }
  /**
   * Out of the Tombs (CompiledCard.drawEmptyReturn): a draw from an empty library is replaced; `player` picks which of
   * `cards`, the creature cards in their graveyard, returns to the battlefield. `left` and `made` are the draws after it.
   */
  | { kind: "drawEmptyReturn"; player: PlayerId; source: string; cards: ObjectId[]; left: number; made?: number[]; after?: "drawStep" }
  /**
   * Different replacements could apply to this draw (shields of Urabrask, Heretic Praetor and the Words, with each other
   * or with Underrealm Lich, Tomorrow, dredge, Notion Thief, Alhammarret's Archive, Scion of Halaster or Abundance; two
   * looks): the drawing player chooses which applies (CR 616.1). `options` are game.ts drawReplacementChoices keys,
   * `labels` what each does; `left`, `made` and `after` are the draws after this one, as for "drawEmptyReturn".
   */
  | {
      kind: "drawInstead";
      player: PlayerId;
      /** drawReplacementChoices' keys: a shield ("exile", "words:<i>"), "thief", "dig:<id>", "dredge:<id>", "archive", "look", "abundance:<land|nonland>". */
      options: string[];
      labels: string[];
      left: number;
      made?: number[];
      after?: "drawStep";
      /** This draw is one a replacement made: how many Alhammarret's Archives can still replace it (CR 614.5). */
      archives?: number;
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
      /** Abundance could replace this draw too (CR 616.1): the permanent's name; choosing land or nonland applies it. */
      abundance?: string;
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
  | { kind: "searchLibrary"; player: PlayerId; source: string; what: string; cards: ObjectId[]; /** "Exile a card from a graveyard" (Cemetery Prowler): `cards` are in every player's graveyard, not only yours. */ anyGraveyard?: true; /** Choosing from cards in exile (`dig.looked`, Dauthi Voidwalker). */ exiled?: true; min: number; max: number; firstTo?: string; othersTo?: string; /** With `firstTo`: the first this many go there (one if left out). */ firstN?: number; /** Picking from the top of the library: all the cards looked at, and where the rest go. */ dig?: { looked: ObjectId[]; to: string; rest: string; /** Each card taken costs this much life (Search for Blex). */ lifeEach?: number }; /** Not a search: cards in the hand to put onto the battlefield, or with `reveal` to reveal, with `bottom` to put on the bottom of the library. */ fromHand?: boolean; reveal?: true; /** With `reveal`: behold (CR 701.4a), so `cards` also holds permanents you control of that quality. */ behold?: true; bottom?: true; /** From the hand: the cards are manifested (Kozilek, the Broken Reality). */ manifest?: true; /** With `hand`: `dig.looked` also holds that player's graveyard, after the hand (Never Happened). */ handYard?: true; /** With `manifest`: cloaked instead (Vannifar, Evolved Enigma). */ cloak?: true; /** Not a search: cards in the graveyard to return to the hand, to exile, or to put onto the battlefield. */ fromGraveyard?: "hand" | "exile" | "battlefield" | "libraryTop" | "castThisTurn"; /** "Cards with different mana values" (Seasons Past): no two found may share a mana value. */ distinctManaValues?: true; /** "With total mana value 4 or less" (Lively Dirge): the cards found together. */ totalMv?: number; /** "Basic land cards that share a land type" (Myriad Landscape): every card found shares a land type with each other one. */ shareLandType?: true; /** "A Forest card and a Plains card" (Krosan Verge): the cards found can each be one of these, a different one each. */ oneOfEach?: TargetSpec[]; /** The Leylines' "begin the game with it on the battlefield", before the first turn (CR 103.6a); with `exile`, the cards from the hand Gemstone Caverns exiles ("If you do, exile a card from your hand"). */ opening?: true; exile?: true; /** Choosing from this player's revealed hand ("You choose a nonland card from it"); `dig.looked` is the whole hand. */ hand?: PlayerId; /** Searching this player's graveyard, hand and library (Memoricide): `cards` are in any of them; `also`, the graveyard's that are found anyway ("all cards"). */ zonesOf?: PlayerId; also?: ObjectId[]; /** An opponent choosing from this player's revealed cards (Gifts Ungiven, Intuition); `helps` when where the chosen ones go is better for that player than where the rest go. */ forPlayer?: PlayerId; helps?: true; /** From `player`'s graveyard onto the battlefield under this player's control (Visions of Dread). */ under?: PlayerId; /** Separating `dig.looked` into two piles (CR 700.3): the cards chosen are the first pile, the rest the second. */ piles?: true; /** Opposition Agent (CR 723.2): `player` controls this player while they search their own library and chooses what they find; with `foundExiled`, what they find is exiled instead, and `player` may play it. */ controlling?: PlayerId; foundExiled?: true; /** The cards found are exiled from the searcher's own library (Foresight): the ones they want least. */ away?: true }
  /**
   * Choosing a creature type or a color by name: as a permanent enters (`objectId`, CR 614.12) or
   * while a spell or ability resolves. `options` are the names allowed.
   */
  /** `labels`: what to show for each option, when the options are ids (entering as a copy of a permanent). */
  | { kind: "chooseOption"; player: PlayerId; source: string; what: ChoiceKind | EntersOption | "commander" | "drawUpTo" | "payX" | /** "You may pay any amount of life" (Necrodominance): the amount, a number in `numberRange`. */ "payLife" | /** "You may pay any amount of {E}" (Galvanic Discharge): the amount, a number in `numberRange`. */ "payEnergy" | "venture" | "clash" | "endure" | "tapOrUntap" | "punisher" | "castFromHand" | "castFromAmong" | /** "Then choose one of them. You may play that card this turn." (Party Thrasher): one of the exiled cards. */ "impulseChoice" | /** Eladamri: a card in the hand, or "top". */ "revealHandOrTop" | /** Nicol Bolas, Dragon-God: a card in the chooser's hand or a permanent they control, to exile. */ "exileHandOrPermanent" | "pile" | "demonstrate" | /** Effect "villainous" (CR 701.55): "0" or "1", one of the two options. */ "villainous" | "damageShield" | "topOrBottom" | "damageSource" | /** Effect "damage" to "that player or a planeswalker that player controls": "p<player id>" or a planeswalker's id. */ "damageWhom" | "enchant" | "rollResult" | "attackWhom" | /** Effect "reselectAttack" (Misleading Signpost): what the creature (`about`) attacks now. */ "reselectAttack" | "searchZones" | "vote" | /** One of the words of "each opponent chooses fame or fortune". */ "word" | "mutate" | "either" | "payOrTop" | "counterKind" | /** "Remove up to three counters": the next one to remove, or "done". */ "removeCounter" | /** Which target of a spell or ability becomes ~ (Spellskite). */ "targetSlot" | /** Which legendary permanent of a group to keep (CR 704.5j); the options are their ids. */ "legend" | /** A number chosen secretly (Wheel of Misfortune): any whole number in `numberRange`. */ "secretNumber" | /** Effect "choosePlayer" (Gluntch): one more player. */ "nthPlayer" | /** Zada's copies: the permanent the next copy put on the stack targets. */ "copyOrder" | /** Effect "unlockDoor": `${roomId}:${door}`, a locked door to unlock (CR 709.5f). */ "unlockDoor" | /** Effect attachToChosen with `pickOne` (Gilgamesh): which of the permanents to attach, or "none". */ "attachWhich" | /** Time travel (CR 701.56a): "add", "remove" or "none", for the permanent or suspended card `about`. */ "timeTravel"; options: string[]; /** Any whole number from `min` to `max` may be chosen, not only `options`. */ numberRange?: { min: number; max: number }; labels?: string[]; objectId?: ObjectId; /** The question, when `source` alone doesn't say it (damage shields). */ prompt?: string; /** The permanent a choice is about, as it resolves ("tap or untap target permanent"). */ about?: ObjectId; /** "removeCounter": the permanent the counters are moved onto (Resourceful Defense). */ onto?: ObjectId; /** A card name: what it's for (bots). */ purpose?: NamePurpose; /** A card name: the player whose cards it's about ("target player reveals their hand"). */ of?: PlayerId; /** A vote made by `player` for another player (Illusion of Choice): whose vote it is. */ voter?: PlayerId; /** "pile": the two piles, the first then the second (Fact or Fiction); `of`, the player whose hand the chosen one goes to. */ piles?: [ObjectId[], ObjectId[]]; /** "pile": the chosen pile is sacrificed, not put into a hand (Liliana of the Veil). */ sacrificePile?: true }
  /**
   * "Sacrifice a creature", "return a land you control to its owner's hand": pick `count` of `options`
   * (your own permanents) as a spell or ability resolves. With `min`, anywhere from `min` to `count` of them
   * (exploit's "you may sacrifice a creature"). With `objectId`, it's devour's choice as that permanent enters
   * (CR 702.82a): any number of them.
   */
  | { kind: "pickPermanents"; player: PlayerId; source: string; action: PickAction; what: string; options: ObjectId[]; count: number; /** The whole question, when `what` and `action` don't say it (Orzhov Advokist). */ prompt?: string; /** Expropriate: a permanent `of` owns (anyone may control it), to gain control of. */ owned?: true; /** For "counters": the kind put on the picked permanent. */ counter?: CounterKind; min?: number; objectId?: ObjectId; /** The player whose permanents these are, when someone else chooses: for "keep" (Mythos of Snapdax), or the target player of Split the Party. */ /** Krenko's Buzzcrusher (pick `youChoose`): the player this pick is for, whose permanents these are. */ pickFor?: PlayerId; of?: PlayerId; /** "keep": the rest are destroyed, not sacrificed (Mount Doom). */ destroy?: true; /** "keep": the rest are returned to their owners' hands (Consuming Tide). */ bounce?: true; /** "Sacrifice any number of lands" (Scapeshift): as many as they like, none too. */ anyNumber?: true; /** "keep": the life paid for each one kept (Killing Wave). */ payLife?: number; /** "keep": the chosen ones' powers add up to at most this (Slaughter the Strong; a negative power subtracts). */ maxTotalPower?: number; /** "untapLimited": the permanents already chosen to stay tapped ("You may choose not to untap ~"). */ kept?: ObjectId[]; /** Birthing Ritual: the cards looked at, shown with the question. */ looked?: ObjectId[]; /** Paying `objectId`'s cost to attack (Exalted Dragon, CR 508.1i). */ attackCost?: true; /** Battle for Bretagard: no two of those chosen may share a name (pick `differentNames`). */ differentNames?: true }
  /** "Distribute X +1/+1 counters among any number of creatures you control": how many each of `options` gets, adding up to `total`. */
  /** `move`: moving the counters on the source, any number of them (Forgotten Ancient); otherwise all `total` are distributed. */
  | { kind: "distribute"; player: PlayerId; source: string; counter: CounterKind; total: number; options: ObjectId[]; what: string; move?: true; /** Remove up to `total` of them, no more from each than `has` (Sensational Spider-Man). */ remove?: true; has?: Record<ObjectId, number> }
  /**
   * "Add X mana in any combination of colors" from a spell or a non-mana ability (Klauth, Manamorphose): how much of each
   * color, `n` in all, chosen as it resolves (CR 106.1b, 608.2d). `colors`: only these.
   */
  | { kind: "manaMix"; player: PlayerId; source: string; n: number; colors?: Color[] }
  /** `x`: the trigger's X (an enters trigger's is its spell's, CR 107.3m), which "up to X target ..." can't choose more than. */
  | { kind: "chooseTargets"; player: PlayerId; sourceId: ObjectId; specs: TargetSpec[]; description: string; x?: number }
  /**
   * A copy of a spell may get new targets (CR 707.10c): keep them all, or choose new legal ones. `copyOf` is the
   * spell's description; `left` counts this copy and the ones after it.
   */
  | { kind: "copyTargets"; player: PlayerId; source: string; copyOf: string; specs: TargetSpec[]; current: TargetChoice[]; left: number }
  /**
   * "You may choose new targets for target spell or ability" (CR 115.7d): keep them all, or choose them again; any kept
   * may be illegal, any changed must be legal for that spell, whose controller is `controller`.
   */
  | { kind: "newTargets"; player: PlayerId; source: string; spell: string; stackId: string; controller: PlayerId; specs: TargetSpec[]; current: TargetChoice[] }
  /** "Change the target of target spell" (CR 115.7a): pick the spell's new target among `options`, the legal ones. */
  | { kind: "changeTarget"; player: PlayerId; source: string; spell: string; stackId: string; index: number; spec: TargetSpec; current: TargetChoice; options: TargetChoice[] }
  /** A modal triggered ability is being put on the stack (CR 603.3c). `legal[i]`: mode i can be chosen (CR 700.2b). */
  | { kind: "chooseModes"; player: PlayerId; sourceId: ObjectId; description: string; min: number; max: number; modes: string[]; legal: boolean[]; /** "You may choose two": none is allowed too. */ optional?: true }
  /**
   * Cards put into this player's graveyard at the same time (CR 404.3), or with `whole` their whole graveyard ("reorder
   * your graveyard as you choose", Fossil Find): put them in any order. `cards` are as they are now, top first.
   */
  | { kind: "orderGraveyard"; player: PlayerId; cards: ObjectId[]; source: string; whole?: true }
  /**
   * A merged permanent was put into its owner's library (CR 730.3a): its cards are `cards` there, top first, together on
   * top of the library or at the bottom, and the owner arranges them without revealing the order.
   */
  | { kind: "orderLibrary"; player: PlayerId; cards: ObjectId[]; bottom?: true; source: string; /** Whose library, if not `player`'s (Misinformation). */ owner?: PlayerId; /** Abundance replaced a draw of several: the draws still to make once these are ordered (see `draw`). */ thenDraw?: { left: number; made: number[]; after?: "drawStep" } };

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
  /** Players who can't become the monarch this turn (Jared Carthalion, True Heir). */
  cantBecomeMonarch?: PlayerId[];
  /**
   * Blocks declared this turn (CR 509.1), banding's included (CR 702.22h): each blocker and the attacker it blocked as
   * `id@zoneChanges` (Venomous Breath's "creatures that blocked or were blocked by it this turn").
   */
  blocks?: { blocker: string; attacker: string }[];
  /** Cards each player cycled this turn (Valiant Rescuer's "for the first time each turn"). */
  cycled?: Record<number, number>;
  /** Times each player investigated this turn (Erdwal Illuminator's "for the first time each turn"). */
  investigated?: Record<number, number>;
  /**
   * The creatures that saddled each Mount this turn (CR 702.171c: tapped to pay its saddle cost), keyed by the Mount as
   * `id@zoneChanges`, each creature as `id@zoneChanges` (The Gitrog, Ravenous Ride: "a creature that saddled it this turn").
   */
  saddledBy?: Record<string, string[]>;
  /** The same for crewing each Vehicle this turn (CR 702.122d: tapped to pay its crew cost; Getaway Car). */
  crewedBy?: Record<string, string[]>;
  /**
   * The creature subtypes the creatures that crewed each Vehicle this turn had as they were tapped for its crew cost, keyed
   * the same way (Adrestia: "if an Assassin crewed it this turn", even if it has left or stopped being one since, rulings).
   */
  crewedTypes?: Record<string, string[]>;
  /** How many times each Vehicle became crewed this turn, by `${id}@${zoneChanges}` (CR 702.122e; "for the first time each turn"). */
  timesCrewed?: Record<string, number>;
  /** End steps begun this turn: more than one with additional end steps (Y'shtola Rhul's "the first end step of the turn"). */
  endSteps?: number;
  /** The players who drew in this turn's draw step for "you draw a card during each opponent's draw step" (Teferi, Who Slows the Sunset's emblem). */
  drawStepDraws?: PlayerId[];
  /** Upkeep steps begun this turn (Paradox Haze's "first upkeep each turn"). */
  upkeeps?: number;
  /** Each permanent sacrificed this turn: who sacrificed it, and its card types and subtypes as it last existed (Elanor Gardner). */
  sacrificed?: { player: PlayerId; types: string[]; subtypes: string[]; /** It was a token (Evendo Brushrazer's "a nontoken permanent"). */ token?: true }[];
  /** Players who searched their library (Archive Trap). */
  searched?: PlayerId[];
  /** The owners of cards that left their graveyard this turn (Gau, Feral Youth). */
  leftGraveyard?: PlayerId[];
  /** How many cards left each player's graveyard this turn (Bonecache Overseer's "three or more cards"). */
  leftGraveyardCount?: Partial<Record<PlayerId, number>>;
  /** Each creature put into a graveyard from the battlefield this turn: its owner's graveyard, and whether it was a token (Caller of the Claw, Fresh Meat). */
  creaturesToYard?: { owner: PlayerId; token?: true }[];
  /** The card types, as they last existed, of the permanents put into each owner's graveyard from the battlefield this turn (Kami of Transience). */
  permanentTypesToYard?: Record<number, string[]>;
  /** How many artifacts were put into graveyards from the battlefield this turn, tokens too (Structural Assault). */
  artifactsToYard?: number;
  /** How many creatures each player controlled that left the battlefield this turn (Kutzil's Flanker). */
  creaturesLeft?: Partial<Record<PlayerId, number>>;
  /** +1/+1 counters put on permanents this turn: who put them, who controlled the permanent and whether it was a creature then (Iridescent Hornbeetle, Sigardian Paladin rulings). */
  plusOnes?: { by: PlayerId; controller: PlayerId; creature: boolean; id: ObjectId; zc: number; n: number }[];
  /** Each token created this turn (CR 111.2): who created it and its subtypes then ("Treasure tokens you created"). */
  tokensCreated?: { player: PlayerId; subtypes: string[] }[];
  /** Permanents that entered the battlefield, with their controller, card types and colors as they entered. */
  entered?: { controller: PlayerId; types: string[]; subtypes?: string[]; colors: Color[]; /** The permanent, for "another" (Éowyn). */ id?: ObjectId; zc?: number; /** A token (Gyome's "nontoken creatures"). */ token?: true }[];
  /** Noncreature permanents destroyed by a spell or ability: their controller and the destroying spell's or ability's (Cobra Trap). */
  destroyed?: { controller: PlayerId; by: PlayerId }[];
  /** For each player, the creatures (`id@zoneChanges`) that dealt them damage (Inferno Trap). */
  damagedBy?: Record<number, string[]>;
  /** Noncombat damage each player was dealt this turn (Chandra's Incinerator), also after they lost the game (rulings). */
  noncombatDamage?: Record<number, number>;
  /** Players who scried or surveilled this turn (Proctor of Potential). */
  scried?: PlayerId[];
  /** Players who surveilled this turn (Darkblade Agent; Whispering Snitch's "for the first time each turn"). */
  surveilled?: PlayerId[];
  /** Players who flipped one or more coins this turn (Edgar, King of Figaro's "the first time ... each turn"). */
  coinsFlipped?: PlayerId[];
  /** For each player, the sources (`id@zoneChanges`) that dealt them combat damage (Steel Hellkite). */
  combatDamagedBy?: Record<number, string[]>;
  /** The creature types of the creatures that dealt combat damage to a player, as they dealt it (Lost Monarch of Ifnir). */
  combatDamageSubtypes?: string[];
  /** Prowl (CR 702.76a): for each player, the creature types of the sources they controlled that dealt a player combat damage, as they dealt it ("*": every creature type). */
  combatDamageTypesBy?: Record<number, string[]>;
  /** The players dealt combat damage by a legendary creature, legendary as it dealt it (Blitzball). */
  legendaryCombatDamaged?: PlayerId[];
  /**
   * "Once during each of your turns, you may cast ... from your graveyard" (Karador), Muldrotha's "a permanent spell of
   * each permanent type": the permissions used, `id@zoneChanges:slot` (a new object gets a new one, rulings).
   */
  gravePermits?: string[];
  /** "Once each turn, you may pay {0} rather than pay the mana cost" (As Foretold): the permanents (`id@zc`) used this turn. */
  payZeroUsed?: string[];
  /** Players who activated an equip ability this turn (Forge Anew's "the first equip ability you activate"). */
  equipped?: PlayerId[];
  /**
   * Tezzeret, Betrayer of Flesh: for each player, "used" once they've activated an ability of an artifact this turn, mana
   * abilities included (rulings); "mana" while the only ones are mana abilities activated since their last other action,
   * which in paper could have been activated while paying for the next ability (rulings, CR 601.2g, 602.2b): if that's an
   * artifact's, it's still the first. See CompiledCard.firstArtifactAbilityLess.
   */
  artifactAbility?: Record<number, "mana" | "used">;
  /** A card was put into exile this turn, from anywhere (Ennis, Debate Moderator); tokens and copies of spells aren't cards. */
  cardExiled?: true;
  /** Players who gained life (Needlebite Trap). */
  gainedLife?: PlayerId[];
  /** Players who put a counter of any kind on a creature (Lasting Tarfire), as it entered too (CR 122.6). */
  creatureCounterPutters?: PlayerId[];
  /** How many cards were put into each player's graveyard, from anywhere (Ravenous Trap). */
  toGraveyard?: Record<number, number>;
  /** Each event this turn that discarded cards: who discarded them, and the cards (keys into `cards`). */
  discards?: { player: PlayerId; cards: string[] }[];
  /** Each event that put cards into graveyards this turn: the cards (CardDef keys), by their owner (Crawling Sensation's "for the first time each turn"). */
  toGraveyardEvents?: { player: PlayerId; cards: string[] }[];
  /** Cards put into graveyards from anywhere, anyone's, counted by each card type they had there (Case of the Gorgon's Kiss). */
  toGraveyardTypes?: Record<string, number>;
  /** Life each player gained in total (Case of the Uneaten Feast). */
  lifeGained?: Record<number, number>;
  /** Creatures exiled from the battlefield, by the player who controlled each (Vren, the Relentless). */
  creaturesExiled?: Record<number, number>;
  /** How many times each player descended (CR 700.11): permanent cards put into their graveyard (The Mycotyrant). */
  descended?: Record<number, number>;
  /** Energy counters each player paid or lost in total (Blaster Hulk). */
  energyLost?: Record<number, number>;
  /** Life each player lost in total, paid life included (CR 119.4): "the total amount of life your opponents have lost this turn". */
  lifeLost?: Record<number, number>;
  /**
   * Creatures that died this turn having been dealt damage that turn: the card in the graveyard (`id`, `zc`) and the
   * permanents that dealt it damage (Krovikan Vampire's "if a creature dealt damage by ~ this turn died").
   */
  diedDamaged?: { id: ObjectId; zc: number; by: ObjectId[] }[];
  /** Wolverine, Best There Is: the sources that dealt damage to a creature other than themselves this turn, as `id@zoneChanges`. */
  damagedCreature?: string[];
  /** The sources that dealt damage, as `id@zoneChanges` (a card's name without one), by the player who controlled each as it did. */
  damageSources?: Record<number, string[]>;
  /** The damage each source dealt in total, by the player who controlled it as it dealt it (Dragon Cultist). */
  sourceDamage?: Record<number, Record<string, number>>;
  /** Noncombat damage dealt by sources of each color, by the player who controlled each as it dealt it (Temple of Power). */
  noncombatByColor?: Record<number, Partial<Record<Color, number>>>;
  /** The card types of the cards put into each player's graveyard from anywhere (Cloakwood Hermit). */
  toOwnGraveyardTypes?: Record<number, string[]>;
  /**
   * Each time a permanent was dealt excess damage (CR 120.10): the permanent as it was then (`id`, `zc`), its
   * controller and card types then, and how much (Rith's "if a creature an opponent controlled was dealt excess damage
   * this turn", Maarika's "if that creature was dealt excess damage this turn").
   */
  excessDealt?: { id: ObjectId; zc: number; controller: PlayerId; types: string[]; amount: number; combat?: true }[];
  /**
   * What dealt damage to each creature and planeswalker this turn, keyed `id@zoneChanges` (the permanent as it was):
   * each source's controller, whether it was a spell, and its subtypes then (Aegar's "if a Giant, Wizard, or spell you
   * controlled dealt damage to it this turn").
   */
  /** `amount`: how much (Burning-Eye Zubera: "if 4 or more damage was dealt to it this turn"). */
  damageDealtTo?: Record<string, { controller: PlayerId; spell?: true; subtypes: string[]; amount?: number }[]>;
  /** How many times each permanent (by "id@zoneChanges") was dealt damage this turn, one for each damage event (Hercules, Olympian Hero's "for the first time each turn"). */
  timesDealtDamage?: Record<string, number>;
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
  /** A land entering because it was played (CR 305.1), not put onto the battlefield. */
  played?: true;
  discardedBy?: PlayerId;
  /** Milled (CR 701.17a): put into the graveyard from the library by a mill instruction. */
  milled?: true;
  /** A token this player created (CR 111.2), for "whenever you create one or more creature tokens". */
  createdBy?: PlayerId;
  /** Torpor Orb: the controllers whose abilities its entering can't trigger (`opponents`: only those of `by`'s opponents). */
  locks?: { by: PlayerId; opponents?: boolean }[];
  /** Leaving the battlefield: it as it last existed there, whether it had its abilities then, and those granted to it. */
  snapshot?: GameObject;
  chars?: Characteristics;
  hadAbilities?: boolean;
  granted?: string[];
  /** Left the battlefield because its controller sacrificed it (CR 701.21a). */
  sacrificed?: true;
}

export interface GameState {
  /** The land being played right now (CR 305.1), while it moves onto the battlefield. */
  playingLand?: ObjectId;
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
  graveyardOrders?: { owner: PlayerId; cards: { id: ObjectId; zc: number }[]; library?: { bottom: boolean; shuffles: number; /** What put them there, for the prompt (a merged permanent's cards if left out). */ source?: string; /** Who arranges them, if not their owner ("in any order", Misinformation). */ by?: PlayerId } }[];
  /** How many times abilities that ask ("if this is the second time this ability has resolved this turn") resolved this turn, by source object and ability. */
  resolutionCounts?: { turn: number; counts: Record<string, number> };
  /** Cards exiled by a permanent's linked exile ability (CR 607.2a), by `${source id}@${its zone changes}`. */
  linkedExile?: Record<string, { id: ObjectId; zc: number }[]>;
  /** Soul Scourge, Laquatus's Champion: the player its enters ability targeted, by "sourceId@zc", for "that player" in its leaves ability (rulings). */
  linkedPlayer?: Record<string, PlayerId>;
  /**
   * Animate Dead: the creature an Aura with "enchant creature card in a graveyard" put onto the battlefield, by
   * `${Aura id}@${its zone changes}` (its "enchant creature put onto the battlefield with ~", and "that creature" of its
   * leaves trigger).
   */
  animated?: Record<string, { id: ObjectId; zc: number }>;
  /** Cards in graveyards that gained flashback until end of turn (Snapcaster Mage), as they are there. */
  flashbackGrants?: { id: ObjectId; zc: number; /** Escape with this cost instead (The Grim Captain's Locker, CR 702.138a). */ escape?: { mana: string; exile: number }; /** "You may cast this card from your graveyard" instead (Case of the Uneaten Feast). */ cast?: true }[];
  /** "When you next cast an instant or sorcery spell this turn, copy that spell": delayed triggers on a cast (CR 603.7). */
  nextCast?: { controller: PlayerId; filter: TargetSpec; sourceId: ObjectId; sourceCardId: string; body: AbilityBody; turn: number; cascade?: true; /** "Has storm" (Crackling Spellslinger): the spell's own storm ability triggers (CR 702.40a). */ storm?: true; /** "From your hand" (Narset Transcendent): cast from there (CR 601.2a). */ fromHand?: true; /** It can't be countered (Mistrise Village). */ uncounterable?: true; /** It can be cast as though it had flash (Progenitor's Icon). */ flash?: true; /** The X of the spell that made it (Storm King's Thunder's "copy that spell X times"). */ x?: number }[];
  /**
   * "Until end of turn, whenever you cast a spell, ...": delayed triggered abilities with a stated duration, which trigger
   * every time their event happens until then (CR 603.7b). Their source is the spell or the source of the ability that made
   * them (603.7d-e), `sourceZc` as it was then: an ability about "~" is about that object only (603.7c, 400.7). `turn`: the
   * turn it was made, for "until the end of your next turn".
   */
  floatingTriggers?: { id: string; controller: PlayerId; sourceId: ObjectId; sourceCardId: string; sourceZc: number; fromSpell?: true; trigger: TriggeredAbility; until: TriggerDuration; turn: number; /** What its self events are about, if not its source (Effect floatingTrigger's `about`). */ about?: { id: ObjectId; zc: number }; /** Only for combat damage dealt to this player (`aboutPlayer`). */ toPlayer?: PlayerId; /** It triggers only once ("when you next attack this turn"), then is gone. */ once?: true }[];
  /** Spells cast this turn, by anyone (storm, CR 702.40a). */
  spellsCastThisTurn?: number;
  /** Who cast each spell this turn, and its card (a key into `cards`) as it was cast: "can't cast more than one spell each turn". */
  castThisTurn?: { player: PlayerId; card: string; /** Its colors as it was cast (Ricochet Trap). */ colors?: Color[]; /** Its card types as it was cast (April O'Neil, Hacktivist). */ types?: string[]; /** The zone it was cast from. */ from?: ZoneName; /** Mana from a Treasure was spent to cast it (CR 106.3). */ treasure?: true; /** Its mana value on the stack (CR 202.3e). */ mv?: number }[];
  /** "Instant and sorcery spells you cast this turn cost {1} less to cast": cost changes for one player this turn (CR 601.2f). */
  costModsThisTurn?: { player: PlayerId; mod: CostMod; /** Until that player's next turn begins, not just this turn (CR 611.2b, 800.4m). */ untilYourNextTurn?: true; /** Only the next matching spell that player casts this turn, removed as it becomes cast (Hardened Berserker). */ next?: true }[];
  /** "Until end of turn, you don't lose unspent red mana as steps and phases end" (CR 500.4): who, and which color (all if unset). */
  keepManaThisTurn?: { player: PlayerId; color?: ManaType }[];
  /** High Tide's "until end of turn, whenever a player taps an Island for mana ...": `controller` is "you", `source` the card's name. */
  manaTriggersThisTurn?: { controller: PlayerId; source: string; trigger: ManaTrigger }[];
  /** "Creatures without flying can't block this turn": matching creatures can't block, also ones that arrive later. */
  cantBlockThisTurn?: { filter: TargetSpec; controller: PlayerId; /** Not this object, while it's the same one (CR 400.7). */ except?: { id: string; zc: number } }[];
  /** "Creatures can't attack this turn": matching creatures can't attack, also ones that arrive later. */
  cantAttackThisTurn?: { filter: TargetSpec; controller: PlayerId; /** Not this object (Intimidation Bolt's target), while it's the same one (CR 400.7). */ except?: { id: string; zc: number } }[];
  /**
   * Wall of Dust: "that creature can't attack during its controller's next turn": `player`'s first turn after `since`, the
   * object as it was (`zc`). As that turn begins it becomes an effect for that turn.
   */
  cantAttackNextTurn?: { id: ObjectId; zc: number; player: PlayerId; since: number }[];
  /**
   * Gideon, Battle-Forged and Gideon Jura: creatures that attack planeswalker `pw` (as the object it was, `pwZc`) if able,
   * during a turn after `since`: creature `id` (as `zc`) during its controller's next turn, whoever that is then
   * (rulings), or every creature `player` controls during their next turn, not locked in (rulings). `turn` is that turn,
   * set as it begins (game.ts walkersToAttack).
   */
  attackWalkerNextTurn?: { pw: ObjectId; pwZc: number; id?: ObjectId; zc?: number; player?: PlayerId; since: number; turn?: number }[];
  /** "Creatures can't be blocked this turn": matching creatures can't be blocked, also ones that arrive later. */
  cantBeBlockedThisTurn?: { filter: TargetSpec; controller: PlayerId }[];
  /** Each spell cast (and ability activated) this turn as it was put on the stack, by stack id: what a copy of it copies if it has left the stack (CR 707.10). */
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
  /** Their names, as they last existed ("" for a face-down one, CR 708.2): "a creature not named ~ died this turn" (Ebondeath). */
  diedNamesThisTurn?: string[];
  /** Their creature types as they last existed ("for each Zubera that died this turn"): `all` for a changeling (CR 702.73a); none for a face-down one. */
  diedTypesThisTurn?: { subtypes: string[]; all?: true; /** Who controlled it as it died. */ controller?: PlayerId }[];
  /** The same for nontoken creatures (Gadrak, the Crown-Scourge). */
  nontokenDiedThisTurn?: PlayerId[];
  /** Permanents put into a graveyard from the battlefield this turn, tokens included (gravestorm, CR 702.69a). */
  toGraveyardThisTurn?: number;
  /** Cards put into each player's graveyard from anywhere this turn, by owner (Fraying Sanity). */
  cardsToGraveyardThisTurn?: Record<PlayerId, number>;
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
  /** Phases added after the current one (CR 500.8); `{ combat: key }` is a combat phase a delayed trigger waits for ("at the beginning of that combat"). */
  addedPhases?: ("combat" | "main" | "beginning" | { combat: number })[];
  /** Phases waiting for this turn's second main phase, to come after it (World at War, CR 500.8). */
  afterSecondMain?: ("combat" | "main" | "beginning" | { combat: number })[];
  /** Additional end steps still to come directly after this end step (Y'shtola Rhul, CR 500.8): no cleanup in between. */
  extraEndSteps?: number;
  /** Additional upkeep steps still to come directly after this upkeep (Paradox Haze, CR 500.8). */
  extraUpkeeps?: number;
  /** The key of the added combat phase going on now (see addedPhases), and the last key given out. */
  thatCombat?: number;
  combatKeys?: number;
  /** Added combat phases (by key) only creatures matching the filter can attack in (Bumi, Unleashed); this turn only. */
  combatAttackOnly?: Record<number, TargetSpec>;
  /** While added phases run: the step the turn's own order goes on with once they're done (CR 500.8). */
  resumeStep?: Step;
  /** "Your opponents can't cast spells this turn" (Silence): who can't cast what, until that turn ends (CR 101.2). */
  /** The "one of those cards" groups (GameObject.mayPlay.oneOf) a card of which has been played: the rest can't be. */
  oneOfUsed?: string[];
  /**
   * Court of Locthwain's "until end of turn, you may cast a spell from among cards exiled with ~ without paying its mana
   * cost": one each, for `player`, from the cards linked to `source` ("id@zc", GameState.linkedExile), this turn only.
   */
  linkedFreeCasts?: { player: PlayerId; source: string; turn: number; sourceName: string; /** "A creature spell" (Idol of Endurance). */ filter?: TargetSpec }[];
  /**
   * "Until end of turn, you may play a card exiled with ~" (Raphael, Most Attitude), "you may cast a creature spell from
   * among cards exiled with ~" (Serpent's Soul-Jar), "you may play cards you own exiled with ~" (Kayla's Music Box): for
   * `player`, from the cards linked to `source` ("id@zc", GameState.linkedExile, CR 607.2a), this turn only, paying the
   * usual costs with the usual timing (rulings). One card each unless `all`.
   */
  linkedPlays?: { player: PlayerId; source: string; turn: number; sourceName: string; filter?: TargetSpec; castOnly?: true; all?: true; owned?: true }[];
  /** The nonland card types of each card cast with a "for each nonland card type" permission (GameObject.mayPlay.byType), by group. */
  byTypeCast?: Record<string, string[][]>;
  cantCastThisTurn?: { player: PlayerId; turn: number; filter?: TargetSpec; source: string; /** Until the end of this player's next turn (Single Combat), kept past this turn's cleanup. */ untilEndOfTurnOf?: PlayerId; /** Until this player's next turn begins (Hope of Ghirapur). */ untilTurnOf?: PlayerId; /** With `untilEndOfTurnOf` that player: only during their next turn after `turn` (Azor, the Lawbringer). */ duringTheirNextTurn?: true }[];
  /** Players who can't play lands this turn (Moonhold), and what said so. */
  cantPlayLandsThisTurn?: { player: PlayerId; turn: number; source: string }[];
  /** War Cadence: generic mana to pay for each blocking creature, for blocks declared the rest of turn `turn` (CR 509.1d). */
  blockTaxes?: { turn: number; n: number }[];
  /** "Players can't gain life this turn" effects from resolved spells and abilities, by the turn they were made (CR 119.7). */
  noLifeGain?: { turn: number; controller: PlayerId; who: "all" | "opponents" }[];
  /** "Until end of turn, if one or more tokens would be created under your control, twice that many ..." (Kaya, Geist Hunter): replacements made by a resolved ability, for the turn they were made in (CR 614.1a). */
  turnCountMods?: { turn: number; controller: PlayerId; mod: CountMod; source: ObjectId }[];
  /** Rules for one player this turn: "you can't lose life this turn" (CR 119.8), "you can't lose the game this turn", "your opponents can't win the game this turn". */
  turnRules?: TurnRule[];
  /**
   * "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): a replacement effect from a
   * resolved spell (CR 614.1c), with `filter` from `controller`'s view, ending as `controller`'s next turn begins
   * (CR 611.2b, 800.4m).
   */
  entersTappedUntil?: { controller: PlayerId; filter: TargetSpec; source: string; /** "... enter tapped this turn" (Nahiri's Lithoforming): ends in the cleanup step (CR 514.2). */ thisTurn?: true }[];
  /**
   * "Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played"
   * (Conjurer's Ban), "that creature's owner can't cast spells with the same name as that creature until your next turn"
   * (Reflector Mage): the name, who it stops (everyone without `players`), until `controller`'s next turn begins.
   */
  /** Illusion of Choice: "You choose how each player votes this turn" (the last one to resolve, rulings). */
  votesChosenBy?: { player: PlayerId; turn: number };
  /**
   * Odric, Master Tactician: "you choose which creatures block this combat and how those creatures block": `player`
   * declares each defending player's blockers in this turn's combat number `combat` (see blockersPending).
   */
  blocksChosenBy?: { player: PlayerId; turn: number; combat: number };
  namedBansUntil?: { name: string; players?: PlayerId[]; lands?: true; controller: PlayerId; source: string }[];
  /** "Until your next turn, you may cast sorcery spells as though they had flash" (Teferi, Time Raveler): `controller` may. */
  flashUntil?: { controller: PlayerId; filter: TargetSpec; /** Only during this turn (Winding Canyons). */ turn?: number }[];
  /** "Until your next turn, your opponents can't cast spells from anywhere other than their hands" (Avatar's Wrath): `controller`'s opponents. */
  /** "You may cast a creature spell from your graveyard this turn" (Chainer): one cast each, used like TurnLog.gravePermits. */
  graveGrants?: { key: string; player: PlayerId; turn: number; filter: TargetSpec; source: string; rider?: GraveCastRider; /** Locke: only these cards (as they were then), in any player's graveyard. */ cards?: { id: ObjectId; zc: number }[] }[];
  /**
   * "You may cast spells from your graveyard this turn", "until end of turn, you may play lands ... from your graveyard",
   * "if a card would be put into your graveyard from anywhere this turn, exile it instead" (Yawgmoth's Will, Forgotten
   * Cellar): what `player` may do with their graveyard during `turn` (Effect graveyardTurn).
   */
  /**
   * Cosmic Intervention: "If a permanent you control would be put into a graveyard from the battlefield this turn, exile it
   * instead. Return it to the battlefield under its owner's control at the beginning of the next end step." (Effect
   * exileReturnThisTurn): for `player`'s permanents during `turn`, each with its own delayed trigger (rulings).
   */
  exileReturnTurn?: { player: PlayerId; turn: number; source: string; sourceCardId: string }[];
  graveyardTurn?: { player: PlayerId; turn: number; cast?: TargetSpec; lands?: true; exileInstead?: true; /** From any graveyard, not only `player`'s (The Great Work). */ anyGraveyard?: true; exileCast?: true; source: string }[];
  /**
   * "Until end of turn, you may look at the top card of your library any time and you may play cards from the top of
   * your library" (Gwenom, Remorseless; Effect topTurn): `player` may, during `turn`, as a permanent's FromTop lets them.
   */
  topTurn?: { player: PlayerId; turn: number; top: FromTop; source: string }[];
  handOnlyUntil?: { controller: PlayerId; source: string }[];
  /** The turn a "damage can't be prevented this turn" effect was made in (CR 615.12). */
  noPreventionTurn?: number;
  /** Damage amount replacements of resolved spells and abilities (Effect damageMod): made in `turn`, by `you`. */
  damageMods?: { id: string; mod: DamageMod; you: PlayerId; name: string; turn: number; until?: "yourNextTurn" }[];
  /** Players who lost life this turn ("if an opponent lost life this turn", CR 119.3). */
  lostLifeThisTurn?: PlayerId[];
  /** A count of life-loss events, numbering those that happen at the same time (loseLife, simultaneousLifeLoss). */
  lifeLossEvents?: number;
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
  /** "If a creature would die this turn, exile it instead" (Malicious Malfunction): the turn it applies in (CR 614.1a). */
  exileDyingTurn?: number;
  /** Mistcaller: the turn in which nontoken creatures that weren't cast are exiled instead of entering (CR 614.1a). */
  exileUncastTurn?: number;
  /** "If a creature an opponent controls would die this turn, exile it instead" (Malicious Eclipse): whose opponents' creatures, and the turn. */
  exileDyingOpponents?: { turn: number; player: PlayerId }[];
  /** "Players can't search libraries this turn" (Shadow of Doubt): the turn it applies in. */
  noSearchTurn?: number;
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
  /**
   * Player-controlling effects waiting for the controlled player's next turn (CR 723.1, 723.1b), in the order they were
   * created: the last one for a player is the one that works (723.1a). `extraTurnAfter`: that player takes an extra turn
   * after that turn (Emrakul, the Promised End: each one makes its own, rulings).
   */
  /** `ended`: its controller left the game (CR 800.4a), so only its extra turn is left. */
  playerControls?: { controlled: PlayerId; controller: PlayerId; extraTurnAfter?: true; ended?: true }[];
  /**
   * The turn being taken now is controlled by another player (CR 723): `controller` makes all of the active player's
   * choices and decisions until the next turn begins (723.1, 723.5). `extraTurns`: extra turns that player takes after
   * this one.
   */
  controlledTurn?: { controlled: PlayerId; controller: PlayerId; extraTurns?: number };
  /** During extra turns: the player whose turn came before them in the normal order, who the next normal turn follows. */
  rotation?: PlayerId;
  /** The player who is the monarch (CR 725), once someone has become it. */
  monarch?: PlayerId;
  /** Who was the monarch as this turn began (Knights of the Black Rose: "if you were the monarch as the turn began"). */
  monarchAsTurnBegan?: PlayerId;
  /** Each player's life total as this turn began (Sengir, the Dark Baron), by player id. */
  lifeAsTurnBegan?: number[];
  /** How many cards each player had in hand as this turn began (Mindstorm Crown), by player id. */
  handAsTurnBegan?: number[];
  /** The emblems in the command zone (CR 114.1), in the order they were made: objects with `emblem`. */
  emblems?: ObjectId[];
  /** Day or night (CR 731.1): neither until something makes it one, then always one of the two. */
  dayNight?: "day" | "night";
  /** How much damage each damage rule with a tallied `countersOn` has prevented (Sacred Boon), by rule id. */
  preventedTally?: Record<string, number>;
  /** The last turn taken: its active player and how many spells each player cast during it (CR 731.2, "last turn"). */
  lastTurn?: { active: PlayerId; cast: number[]; /** The players who lost life during it (First Response: "if you lost life last turn"). */ lostLife?: PlayerId[]; /** The creatures that entered the battlefield during it, with their controllers then (Ephara, God of the Polis: "if you had another creature enter the battlefield under your control last turn"). */ creaturesEntered?: { controller: PlayerId; id?: ObjectId; zc?: number }[] };
  /** The player who has the initiative (CR 726), once someone has taken it. */
  initiative?: PlayerId;
  /** How permanents were as they last existed on the battlefield (CR 608.2h); `attachedTo` with that permanent's zoneChanges then. */
  lastKnown?: Record<ObjectId, { zc: number; /** Tapped as it left the battlefield (Sphinx Sovereign's "if ~ is untapped"). */ tapped?: true; /** Saddled as it left the battlefield (Caustic Bronco, CR 702.171b). */ saddled?: true; power: number; toughness: number; /** Its base power as it last existed (see basePowerNow): Jason Bright's "if its power was different from its base power". */ basePower?: number; controller: PlayerId; attachedTo?: { id: ObjectId; zc: number }; attachedToPlayer?: PlayerId; /** Its copiable values (CR 707.2), a key into `cards`. */ copyKey?: string; counters?: Record<string, number>; /** Its creature types ("all" for changeling-like), for kinship once it's gone. */ creatureTypes?: string[] | "all"; /** The player chosen as it entered (Saskia's "the chosen player" once it's gone, CR 608.2h). */ chosenPlayer?: PlayerId; /** The creatures it was blocking ("target creature it's blocking" once it's sacrificed, Tinder Wall). */ blocking?: ObjectId[]; /** The creatures blocking it ("target creature blocking it" once it's sacrificed, Urborg Panther). */ blockedBy?: ObjectId[]; /** What it was attacking (Myr Battlesphere's "the player or planeswalker it's attacking"). */ attacking?: PlayerId; attackingPermanent?: { id: ObjectId; zc: number; battleController?: PlayerId }; /** What it was as a source of damage, for "it deals damage" once it's gone (CR 608.2h): its lifelink, deathtouch, colors, and a "can't be prevented" that applied to it (Questing Beast). */ source?: { name: string; colors: Color[]; types: string[]; subtypes: string[]; supertypes?: string[]; allCreatureTypes?: true; keywords: string[]; unpreventable?: "all" | "combat" } }>;
  nextTimestamp: number;
  /**
   * Mystic Reflection: the next time one or more creatures or planeswalkers enter this turn, they enter as copies of this
   * permanent (`id`, `zc`): its copiable values as they are then, or as it last existed (`key` as the spell resolved if
   * neither is known). `used` once some have, so the others entering with them still do (enterTogether).
   */
  nextEntersAsCopy?: { id: ObjectId; zc: number; key: string; turn: number; timestamp: number; source: string; used?: true }[];
  /** Something happened during the cleanup step, so players get priority and then there's another one (CR 514.3a). */
  cleanupAgain?: boolean;
  /**
   * In a combat damage step, before damage is assigned: the players who've chosen which blocked creatures assign
   * their combat damage as though they weren't blocked, and those creatures (CR 510.1).
   */
  unblockedChoice?: { turn: number; step: Step; asked: PlayerId[]; ids: ObjectId[] };
  /** "Can't block with more than one creature this combat" (Mirri, Weatherlight Duelist): each player's limit, until the end of combat step ends. */
  blockLimits?: { player: PlayerId; n: number }[];
  /** Attackers just declared, waiting on their enlist choices (CR 508.1g) before "whenever ~ attacks" triggers. */
  declaring?: { ids: ObjectId[]; /** Bands can still be declared (CR 508.1e). */ bands: boolean; enlist: ObjectId[]; enlisted: [ObjectId, ObjectId][]; /** Attackers that may still be exerted (CR 701.43d), and those that were. */ exert?: ObjectId[]; exerted?: ObjectId[]; /** Costs to attack that aren't mana still to pay (Exalted Dragon, CR 508.1g-i), attacker by attacker. */ costs?: AttackCostDue[] };
  pending: PendingDecision | null;
  /** The mulligan process before the first turn (CR 103.5), or null once everyone has kept. */
  mulligans?: MulliganState | null;
  /** Players still to take actions with their opening hands, in turn order from the starting player (CR 103.6). */
  openingActions?: PlayerId[];
  /** The current player's opening-hand step: choosing cards to reveal (CR 103.6b) after the ones to begin on the battlefield, or done. */
  openingStage?: "reveal" | "done";
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
  /** Palace Jailer: cards exiled "until an opponent becomes the monarch", an opponent of `controller` (CR 610.3). */
  exiledUntilMonarch?: { controller: PlayerId; source: string; cards: { id: ObjectId; zc: number }[] }[];
  untilReturns?: { auras: { id: ObjectId; zc: number; under: PlayerId; source: string; asking?: true }[]; returned: ObjectId[] };
  /** Legends chosen to keep under the legend rule (CR 704.5j), until the state-based actions are next performed. */
  legendKeep?: ObjectId[];
  entersChoices?: { id: ObjectId; zc: number; what: ChoiceKind | EntersOption; except?: string; many?: true; names?: TargetSpec; purpose?: NamePurpose; options?: string[]; range?: { min: number; max: number }; secret?: true; /** "Look at an opponent's hand" once that opponent is chosen (Arachne). */ lookHand?: true; /** One of "two players" (Sower of Discord): added to Chosen.players, not one chosen before. */ pair?: true; enters?: { x?: number }; together?: ObjectId[]; enterOpts?: { x?: number; tapped?: boolean; untapped?: boolean; counters?: Record<string, number>; escaped?: boolean; fromStack?: boolean; controlChosen?: boolean } }[];
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
  /** "As ~ enters, choose two abilities from among first strike, vigilance, and lifelink" (Greymond), in the order chosen. */
  keywords?: string[];
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
  /** "Choose a number between 1 and 10" (Talion, Sanctum Prelate). */
  number?: number;
  /** "Each player chooses a creature type" (Patriarch's Bidding): every type chosen, in the order chosen. */
  types?: string[];
  /** "The color or colors of your choice" (Prismatic Lace): one or more colors. */
  colors?: Color[];
  /** "Each player chooses a color" (Selective Obliteration): each player's color. */
  colorsBy?: Record<number, Color>;
  /** Gluntch: the players chosen by Effect "choosePlayer", in the order chosen. */
  players?: PlayerId[];
  /** "Choose odd or even" (Extinction Event). */
  parity?: "odd" | "even";
  /** "Choose land or nonland" (Abundant Harvest). */
  landOrNonland?: "land" | "nonland";
}

export interface TurnRule {
  turn: number;
  player: PlayerId;
  /**
   * "flash": "You may cast spells this turn as though they had flash" (Borne Upon a Wind, Emergence Zone; CR 702.8a).
   * "spellsUncounterable": "Spells you control can't be countered this turn" (Veil of Summer, CR 101.2).
   */
  /** "cantWinGame": "players can't win the game this turn" (Everybody Lives!). */
  /** "creatureSpellsUncounterable": "Creature spells you cast this turn can't be countered" (Domri, Anarch of Bolas): cast, so not a copy. */
  /**
   * "extraLoyalty": The Chain Veil's "for each planeswalker you control, you may activate one of its loyalty abilities once
   * this turn as though none of its loyalty abilities have been activated this turn": one more each, each time (rulings).
   */
  /**
   * "seeHexproof": Detection Tower's "your opponents and creatures your opponents control with hexproof can be the targets
   * of spells and abilities you control as though they didn't have hexproof" (CR 702.11e: "hexproof from" too).
   */
  /** "noLoyalty": Revel in Silence's "your opponents can't ... activate planeswalkers' loyalty abilities this turn" (CR 606.3). */
  /** "noActivations": Abeyance's "that player can't activate abilities that aren't mana abilities" this turn, in any zone (rulings). */
  rule: "cantLoseLife" | "cantLoseGame" | "opponentsCantWin" | "cantWinGame" | "flash" | "spellsUncounterable" | "creatureSpellsUncounterable" | "extraLoyalty" | "seeHexproof" | "noLoyalty" | "noActivations";
  /** "Can't be countered by blue or black spells this turn" (Autumn's Veil): only by spells of these colors, as they resolve. */
  byColors?: Color[];
}

/** A cost to attack with `id` that isn't mana (Exalted Dragon's "sacrifice a land", CR 508.1g): `n` permanents of its controller's. */
export interface AttackCostDue {
  id: ObjectId;
  action: "sacrifice" | "bounce";
  filter: TargetSpec;
  n: number;
}

/** What a trigger event was about, beyond its object: "you gain that much life", "that player discards a card". */
export interface TriggerEventInfo {
  amount?: number;
  /** "Whenever players finish voting" (Erestor of the Council): the votes cast (CR 701.38). */
  votes?: { voter: PlayerId; choice: string }[];
  /** "Whenever you roll one or more dice": the highest of the dice's results ("if any of those results was 10 or higher", Farideh). */
  rollMax?: number;
  /** A "whenever you clash" trigger: whether that player won that clash ("If you won, ...", CR 701.30d). */
  wonClash?: boolean;
  /** "One or more opponents lose life": the life loss event it triggered on (lifeLost's batch). */
  lifeBatch?: number;
  /** "One or more opponents each lose exactly 1 life" (Ob Nixilis): what each of them lost in that event, added up as it's lost. */
  lifeEach?: Record<number, number>;
  /** A cast or play-a-land trigger: the spell or land, as the object it was (TriggeredAbility cast.sharesTypeWithLinked). */
  played?: { id: ObjectId; zc: number };
  /** "Deals damage to a creature": the excess damage that creature has been dealt this turn (CR 120.10). */
  excess?: number;
  /** "Whenever one or more Dragons you control deal combat damage": those that did, as the objects they were ("one of those Dragons"). */
  group?: { id: ObjectId; zc: number }[];
  /** The total power of the creatures a "one or more ... die" event was about, as they last existed (The Skullspore Nexus). */
  groupPower?: number;
  player?: PlayerId;
  /** "Whenever one or more Pirates you control deal damage to your opponents" (Breeches, Brazen Plunderer): the opponents dealt it ("each of those opponents"). */
  players?: PlayerId[];
  /** "Whenever a player attacks one of your opponents": the attacking player ("that attacking player"); `player` is that opponent. */
  attacker?: PlayerId;
  /**
   * "If two or more of those creatures are attacking you and/or planeswalkers you control" (Mangara): checked again as it
   * resolves (CR 603.4) with `group`, those attackers; one that left the battlefield counts as it last was (rulings).
   */
  attackingYou?: { you: PlayerId; min: number; orPlaneswalkers?: true };
  /** A permanent's enters trigger: the opponent its spell's gift was promised to (CR 702.174b). */
  gift?: PlayerId;
  /** A permanent's enters trigger: evidence was collected for its spell (CR 701.59c). */
  evidence?: true;
  /** A permanent's enters trigger, or a cast trigger: how much mana from Treasures was spent to cast that spell (CR 106.3). */
  treasureSpent?: number;
  /** A permanent's enters trigger: its spell's surge, spectacle or prowl cost was paid (CR 702.117a, 702.137a, 702.76a). */
  castAlt?: "surge" | "spectacle" | "prowl";
  /** A permanent's enters trigger, or a cast trigger: the mana spent to cast that spell by type (CR 601.2h). */
  spent?: SpentMana;
  /** A permanent's enters trigger, or a "when you cast this spell" one: how much mana was spent to cast that spell (CR 601.2h). */
  manaSpent?: number;
}

export interface Resolving {
  item: StackItem;
  body: AbilityBody;
  /** Effect noteAmount's count (Count notedAmount). */
  notedAmount?: number;
  legal: boolean[]; // which targets were legal as it began resolving (CR 608.2b)
  /**
   * The answers so far to the questions about the shields of the damage the current instruction deals (CR 616.1): it
   * runs again from its start with them (resolve.ts runAsking).
   */
  shieldAnswers?: number[];
  /** Who controlled each targeted spell as resolution began, for "its controller" after it's countered (CR 608.2h). */
  spellControllers?: (PlayerId | null)[];
  /** The cards of targeted spells, for "its mana value" after it's countered (CR 608.2h). */
  spellObjects?: (ObjectId | null)[];
  /** The tokens its last "create" made, for "put a counter on it". */
  created?: ObjectId[];
  /** Thorin, Mountain-king: the Aura and Equipment its "attach" effects attached (moved) this resolution, for "when one or more Equipment become attached to that creature this way". */
  attachedThisWay?: ObjectId[];
  /** The permanents its last continuous effect changed, for "untap those creatures" after it (ObjRef "affected"). */
  affected?: { id: ObjectId; zc: number }[];
  /** Permanents its damage effects dealt damage to, for "a creature dealt damage this way". */
  damagedThisWay?: ObjectId[];
  /** The permanents a flicker returned to the battlefield (Splash Portal's "if that creature is ..."). */
  flickeredBack?: ObjectId[];
  /** Players its damage effects dealt damage to, for "players dealt damage this way". */
  playersDamagedThisWay?: PlayerId[];
  /** "Each player may put ... onto the battlefield": those who did, for the instructions after it ("each opponent who didn't"). */
  choseThisWay?: PlayerId[];
  /** The cards drawn so far while this resolves, for "you may cast one of them" (Dungeon of the Mad Mage's last room). */
  drawnThisWay?: ObjectId[];
  /** The cards the draw instruction before this one drew ("each opponent who drew a card this way", Cut a Deal). */
  drawnBefore?: ObjectId[];
  /**
   * While a draw effect works out how many to draw: "for each card drawn this way" is the draw before it (drawnBefore)
   * then; any other effect after a draw counts that draw's cards (drawnThisWay; Communal Brewing's counters).
   */
  drawing?: true;
  /** How many cards each player discarded so far while this resolves ("draw that many cards"). */
  discarded?: Record<PlayerId, number>;
  /** The cards the last discard while this resolves put into a graveyard, as those objects ("the discarded card", Malcolm). */
  discardedCards?: { id: ObjectId; zc: number }[];
  /** Every card discarded while this resolves, wherever it went (madness): "if an artifact card was discarded this way". */
  discardedAll?: ObjectId[];
  /** The powers of the creature cards exiling graveyards exiled so far while this resolves ("exiled this way"). */
  exiledPowers?: number[];
  /**
   * The permanents its destroy instructions destroyed so far while this resolves, as they last existed on the
   * battlefield ("for each creature destroyed this way"): one that went elsewhere instead of its owner's graveyard still
   * counts; one that wasn't destroyed (indestructible, regenerated) doesn't (rulings on Fumigate and Bane of Progress).
   */
  destroyed?: { o: GameObject; ch: Characteristics; /** Put into a graveyard: it died (CR 700.4). */ died?: true; /** Who controlled it as it last existed ("its controller", CR 608.2h). */ controller?: PlayerId }[];
  /** The permanents its exile instructions exiled so far while this resolves, as they last existed ("exiled this way"). */
  exiled?: { o: GameObject; ch: Characteristics }[];
  /** The cards its exile instructions exiled from graveyards so far while this resolves (Count "cardsExiledThisWay"). */
  exiledCards?: ObjectId[];
  /** The total toughness of what a returnExiled with `toughnessThisWay` returned (Count "returnedToughness"). */
  returnedToughness?: number;
  /** The cards exiled face down so far (exileFaceDown), for Duplicity's "all other cards you own exiled with ~". */
  faceDownExiled?: ObjectId[];
  /** The cards this resolution's linked exiles took (Mimic Vat's "each other card exiled with ~"). */
  linkedNow?: ObjectId[];
  /** Spells with an X its counter instructions countered, as the cards they became, and the X they had (CR 202.3e). */
  countered?: Record<ObjectId, { zc: number; x: number; /** The mana spent to cast it (Mana Sculpt). */ manaSpent?: number }>;
  /** The source of an activated or triggered ability its counter instructions countered (Tishana's Tidebinder). */
  counteredSource?: { id: ObjectId; zc: number };
  /** "If that spell is countered this way, exile it instead": the card it became in exile (Transcendent Dragon, Spelljack). */
  counteredExiled?: { id: ObjectId; zc: number };
  /** The card its "reveal the top card of your library" revealed (CR 701.20a), for "if it's a creature card, put it ...". */
  revealed?: { id: ObjectId; zc: number };
  /** The cards "reveal cards from the top of your library until you reveal a nonland card" revealed, in order (Erratic Explosion). */
  revealedUntil?: ObjectId[];
  /** The one card an "exile the top card of your library" exiled, for "that card's mana value" (Tavern Brawler). */
  exiledTop?: { id: ObjectId; zc: number };
  /** The card a chooseFromGraveyard with a `chooser` moved, for "that card's mana value" (O-Kagachi Made Manifest). */
  chosenFromYard?: { id: ObjectId; zc: number };
  /** The cards a chooseFromGraveyard moved, for "if it's a creature card" (SpellCondition yardChosenIs). */
  yardChosen?: ObjectId[];
  /** The cards "exile the top two cards of your library. You may play them" exiled (Bonehoard Dracosaur). */
  impulsed?: ObjectId[];
  /** "You may put a land card from among them into your hand" after a mill (Town Greeter): the cards it put there. */
  putIntoHand?: ObjectId[];
  /** The cards its "hold" flicker exiled, for the search after it to put onto the battlefield with what it finds. */
  held?: { id: ObjectId; zc: number }[];
  /** The cards its mill instructions milled, as they are in the graveyard ("if a card with the chosen name was milled this way"). */
  milled?: { id: ObjectId; zc: number }[];
  /** The cards its mill instructions exiled instead (a replacement, Rest in Peace): still "the milled cards" for Gyruda's rulings. */
  milledExiled?: { id: ObjectId; zc: number }[];
  /** The cards the last "exile the top N cards of their library" exiled (Ensnared by the Mara's "those exiled cards"). */
  exiledTopCards?: ObjectId[];
  /** How many cards its exileNamed instruction exiled from the hand ("for each card exiled from their hand this way"). */
  exiledFromHand?: number;
  /** How many cards its revealFromHand instruction revealed ("for each card revealed this way"). */
  revealedFromHand?: number;
  /** The cards it revealed, for "each green mana symbol in those cards' mana costs" (Phosphorescent Feast). */
  revealedFromHandIds?: ObjectId[];
  /** The land and nonland cards its parleyReveal instruction revealed ("for each nonland card revealed this way"). */
  parley?: { land: number; nonland: number };
  /** The mana value of the card its last revealUntil instruction found, if it found one (Yuna's Whistle's reflexive X). */
  revealedUntilMv?: number;
  /** How many cards the last revealUntil revealed, the one found included ("the number of cards revealed this way", Madcap Experiment). */
  revealedUntilCount?: number;
  /** The excess damage its damage instructions dealt to permanents (CR 120.10): "the excess damage dealt this way". */
  excessDamage?: number;
  /** "The damage dealt this way": all of it, so far in this resolution. */
  damageThisWay?: number;
  /** That excess damage by the permanent dealt it (a fight's "the creature the opponent controls"). */
  excessTo?: Record<ObjectId, number>;
  /** The part of it dealt to creatures ("if excess damage was dealt to a creature this way", Vikya). */
  excessToCreatures?: number;
  /** How many permanents its tapAnyNumber instruction tapped ("for each creature tapped this way"). */
  tappedThisWay?: number;
  /** How many creatures its goad affected ("for each creature goaded this way", Kaima). */
  goadedThisWay?: number;
  /** Cards a putFromHand with `manifest` put onto the battlefield face down: "for each card manifested this way". */
  manifestedThisWay?: number;
  /** Join forces: the total amount of mana all players paid ("where X is the total amount of mana paid this way"). */
  joinForcesPaid?: number;
  /** What each player paid for it ("the amount of mana they paid this way", Liege of the Hollows). */
  joinForcesPaidBy?: Record<PlayerId, number>;
  /** Whether the player paid its counterSpell instruction's "unless" cost ("If they do, ..."). */
  unlessPaid?: boolean;
  /** A spell this countered (Fold into Aether's "If that spell is countered this way"). */
  spellCountered?: true;
  /** How many spells it countered (Swift Silence). */
  spellsCountered?: number;
  /** How many poison counters its loseAllCounters instruction removed (Leeches). */
  poisonLost?: number;
  /** Its endTurn instruction ran: the turn ends once it's done resolving (CR 724.1). */
  endTurn?: true;
  /** How many cards its takeFromHand instruction took ("You may choose a nonland card from it. If you do, ..."). */
  tookFromHand?: number;
  /** The cards it exiled from your hand ("You may exile a creature card from your hand. If you do, create a token that's a copy of the exiled card"). */
  exiledFromHandCards?: { id: ObjectId; zc: number }[];
  /** The card its discover instruction discovered (CR 701.57c), cast or put into the hand, and that card's mana value. */
  discovered?: { id: ObjectId; mv: number };
  /** How many counters "remove all counters" removed so far while this resolves ("for each counter removed this way"). */
  countersRemoved?: number;
  /** How many cards its "put all cards exiled with ~ into their owners' graveyards" moved. */
  movedLinked?: number;
  /** The cards "put a card exiled with ~ into its owner's graveyard" moved (SpellCondition movedLinkedIs). */
  movedLinkedIds?: ObjectId[];
  /** The two players its exchangeLife instruction named (even one no longer a legal target), and the life each lost doing it. */
  exchanged?: { players: PlayerId[]; lost: Record<PlayerId, number> };
  /** The life its loseLife instructions took off life totals so far: "if no life is lost this way" (Blitzwing, Cruel Tormentor). */
  lifeLost?: number;
  /** "Enchanted permanent's controller", the first time it was read (Strangling Grasp: still "that player" once the permanent is sacrificed, CR 608.2h). */
  hostControllerWas?: PlayerId;
  /** "Choose a creature type / a color": what was chosen, for the rest of its instructions. */
  chosen?: Chosen;
  /**
   * Its vote (CR 701.38): each vote, in the order made, by the player it belongs to; `choice` is the option's word, or the
   * id of the permanent or card voted for.
   */
  votes?: { voter: PlayerId; choice: string }[];
  /** "Each opponent chooses fame or fortune" (Seize the Spotlight): the word each of them chose. Not a vote (CR 701.38). */
  chose?: Record<string, string>;
  /** A library was searched by a search that leaves the shuffle for later (Claim Jumper, `search.noShuffle`). */
  searchedHere?: true;
  /** Sunforger: the card the search found to cast (`castSearched`), still in the library. */
  searchCast?: ObjectId;
  /** The mana it added, for a mana ability: what the triggered mana abilities of tapping its source see (CR 106.12a). */
  made?: ManaType[];
  next: number;
  /** Whether the last "you may ..." was done, for a following "If you do, ..." (CR 608.2c). */
  did?: boolean;
  /** What its instructions sacrificed, as it last existed: "When you do, ~ deals damage equal to that creature's power". */
  sacrificedThisWay?: LastKnown[];
  /** "Goad each creature that had counters put on it this way" (Agitator Ant): the permanents a pick put counters on. */
  countersPutThisWay?: { id: ObjectId; zc: number; kind?: string }[];
  /** "Put a +1/+1 counter on each of those Vampires" (Urge to Feed): the permanents its tapAnyNumber tapped. */
  tappedIds?: { id: ObjectId; zc: number }[];
  /** What its "return a land you control to its owner's hand" returned, as it last existed (SpellCondition bouncedThisWay). */
  bouncedThisWay?: { id: ObjectId; subtypes: string[]; /** As it last existed on the battlefield (Count bouncedThisWayPower). */ power?: number; /** It went to a hand (Count bouncedThisWayCount). */ returned?: true }[];
  /** The cards its "return ... to their owners' hands" put into a hand (Paradoxical Outcome); a token isn't a card. */
  returnedToHand?: ObjectId[];
  /** Who controlled each nontoken permanent its "return all ..." returned (or tried to, CR 614.6), as it left (SpellCondition returnedYoursAtLeast). */
  returnedNontoken?: PlayerId[];
  /** Whether its last "look at the top N cards ... put one ..." took a card (SpellCondition digTook). */
  digTook?: boolean;
  /** How many cards a dig with rest "keep" left on top (an orderTop with `digRest` arranges them). */
  digRest?: number;
  /** How many cards its last look at the top of a library put into a hand (Count "dugToHand"). */
  dugToHand?: number;
  /** The cards it put there (Count "dugToHandMv"). */
  dugToHandCards?: ObjectId[];
  /** The cards its last search found (SpellCondition searchFound). */
  searchFound?: ObjectId[];
  /** The players who had nothing to pick for its last "each player sacrifices ..." (PlayerRef "couldntPick"). */
  couldntPick?: PlayerId[];
  /** The Army its amass instruction chose (CR 701.47c), for "the amassed Army". */
  amassed?: { id: ObjectId; zc: number };
  /** Whether its controller won its last clash (CR 701.30d), for "If you win, ...". */
  wonClash?: boolean;
  /** A draw of this resolution was replaced (dredge, Alhammarret's Archive): Sindbad's "reveal it" then does nothing (rulings). */
  drawReplaced?: true;
  /** The opponent of its controller's last clash ("that player", CR 701.30b). */
  clashOpp?: PlayerId;
  /** For an ability that asks: how many times this ability of its source has resolved this turn, this time included (SpellCondition "resolvedNth"). */
  nth?: number;
  /** Its last coin flip (CR 705.2): won or lost, and how many were won ("flip a coin until you lose a flip"). */
  flipped?: { won: boolean; wins: number };
  /** Effect "chooseOwnCommander" (Stinging Study): the chosen commander's mana value. */
  commanderMv?: number;
  /** Its last roll (CR 706.2): each die's natural result that counts (not the ignored ones, 706.6), and the result. */
  rolled?: { sides: number; naturals: number[]; result: number; /** "The other result" (Effect roll's chooseOne). */ other?: number };
  /** "Each player rolls a d20" (Chaos Dragon): each player's result. */
  rolledEach?: Partial<Record<PlayerId, number>>;
  scratch?: {
    /** A search's cards put on top "in any order" (Goblin Recruiter) have been ordered. */
    topOrdered?: true;
    /** "Each player chooses a creature type": the players asked so far. */
    eachAsked?: PlayerId[];
    /** Secret numbers (Wheel of Misfortune): the players still to choose, each one's number, and where the rest stands. */
    numbers?: { queue: PlayerId[]; chosen: Record<string, number>; pick?: number; step?: "discard" | "draw"; draws?: PlayerId[] };
    /** Tainted Pact: the names exiled so far, and the card the player is asked about. */
    pact?: { names: string[]; asking?: ObjectId };
    /** Primal Surge: the permanent card just exiled, waiting for the answer to "you may put it onto the battlefield". */
    surgeId?: ObjectId;
    /** "For each creature exiled this way, its controller searches ..." (Winds of Abandon): the players done so far. */
    forEachDone?: PlayerId[];
    queue?: PlayerId[]; // players still to choose, in APNAP order (CR 101.4)
    drawQueue?: PlayerId[]; // players still to draw: a draw can stop for dredge (CR 702.52a)
    scryDrew?: true; // Eligeth: the scry became a draw, which may have stopped for dredge
    /** Elder Brain: the hand was exiled (a draw after it that stopped for dredge is finished by the answer). */
    handExiled?: true;
    digQueue?: PlayerId[]; // "each player looks at the top five cards": players still to look (Explore the Vastlands)
    chosen?: Record<string, ObjectId[]>; // cards each player chose to discard
    /** "Each player puts a card from their hand on top of their library": the players whose cards have moved. */
    handTopDone?: Record<string, true>;
    /** Library of Leng: the discarded cards each player put on top of their library instead, the first ending on top. */
    toTop?: Record<string, ObjectId[]>;
    /** The cards each player discards at random, picked before they're asked about Library of Leng. */
    randomPicks?: Record<string, ObjectId[]>;
    venture?: string; // the dungeon or room chosen while venturing (CR 701.49a-b)
    arranged?: { top: ObjectId[]; away: ObjectId[] };
    /** Teferi's Puzzle Box: how many cards the hand put on the bottom (then drawn). */
    bottomed?: number;
    bottomOrders?: Record<string, ObjectId[]>; // putAllOnBottom: each owner's order, asked before anything moves
    ordered?: boolean; // "reorder your graveyard as you choose" asked already (graveyard.ts)
    forced?: ObjectId[]; // exileNamed's "all cards with that name" in the public graveyard, found without a choice (CR 701.23b)
    moved?: boolean; // a dig already moved the cards it took, and waits on the order of the rest (CR 401.4)
    ripple?: { revealed: ObjectId[]; queue: ObjectId[] }; // ripple's revealed cards, and those it may still cast (CR 702.60a)
    may?: boolean; // the answer to "you may ..."
    /** A "you may" declined whose `otherwise` asks another "you may" (Gathering Stone): that one's text, while it's asked. */
    mayOtherwise?: string;
    /** Scholar of New Horizons (Effect search `mayInstead`): asked whether the found card goes there instead (the answer is `may`). */
    mayInstead?: boolean;
    /** Transmute Artifact (Effect search `payDiff`): the card found costs more than the sacrificed artifact, so paying the difference was asked (the answer is `may`). */
    payDiff?: boolean;
    castNow?: { id: ObjectId }; // the card "you may cast that card" offered (Effect castNow)
    /** A vote (Effect "vote"): players still to vote in turn order, the votes left for the one voting, and their pick. */
    vote?: { queue: PlayerId[]; left?: number; may?: number; pick?: string; /** "Each player may choose ..." (Druid of Purification): one optional pick each, not a vote. */ choose?: true };
    /** "Each opponent chooses fame or fortune": the players still to choose (APNAP, CR 101.4), and the answer given. */
    words?: { queue: PlayerId[]; pick?: string };
    /** "For each player who chose fame, gain control of a creature that player controls": the choosers still to go, and the creatures chosen so far. */
    fromEach?: { queue: PlayerId[]; ids: ObjectId[] };
    mayQueue?: PlayerId[]; // "each player may ...": players still to decide, in APNAP order (CR 101.4)
    mayers?: PlayerId[]; // and those who chose to
    mayStep?: number; // how many of its instructions are done
    /** "repeatIf" (Grist): how many of this pass's instructions are done. */
    repeatStep?: number;
    /** Effect "repeatIf": the scratch keys there before its first pass, kept between passes. */
    repeatKeep?: string[];
    /** "revealHandOrTop" (Eladamri): the card picked, or "top" for the top card of the library. */
    revealPick?: string;
    /** "exileHandOrPermanent" (Nicol Bolas, Dragon-God): the players still to choose, and the cards and permanents chosen. */
    handOrPermanent?: { queue: PlayerId[]; picks: ObjectId[] };
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
      /** Or that they discard this many cards (Bandit's Talent's "discards two cards unless ..."). */
      discards?: number;
      /** Or that this permanent is destroyed (Combustion Man's "destroy target permanent unless ..."). */
      destroys?: ObjectId;
      /** Or that its controller sacrifices the source (Icy Prison's "sacrifice ~ unless any player pays {3}"). */
      losesSource?: true;
      /** "If a player does" / "If no one does" (see the punisher effect). */
      mode?: "ifAny" | "ifNone";
    };
    punished?: PlayerId[]; // those who did none of its options, this round
    /** "Sacrifice an artifact, a creature, and a land": players still to pick, the slot being picked, the picks so far. */
    slots?: { queue: PlayerId[]; slot: number; picked: Record<string, ObjectId[]> };
    /** "Choose ..., then sacrifice the rest": whose turn to choose, which of their choices, and what each player kept. */
    keepRest?: { queue: PlayerId[]; slot: number; kept: Record<string, ObjectId[]>; /** Restore Balance: the fewest any of them controls, counted as it starts. */ fewest?: number; /** Killing Wave: the life paid for each one kept. */ lifeEach?: number };
    paid?: boolean; // the answer to "unless that player pays ..."
    payQueue?: PlayerId[]; // "each opponent sacrifices ... unless they pay": players still to choose whether to pay, in APNAP order
    paidBy?: PlayerId[]; // and those who paid
    newTarget?: TargetChoice; // "change the target of target spell": the new one, chosen as this resolves (CR 115.7a)
    targetSlot?: number; // "change a target of target spell or ability to ~": which of its targets (Spellskite)
    retargets?: TargetChoice[]; // "you may choose new targets for target spell": its targets now (CR 115.7d)
    explored?: ObjectId; // the nonland card explore revealed, waiting on "graveyard or top?"
    exploresLeft?: number; // explores still to do for one instruction (Topography Tracker doubles them)
    exploreScries?: number; // scries still to do before an explore (Twists and Turns, one each)
    /** Effect "exploreEach": the creatures still to explore, and the one exploring now. */
    exploreEach?: { left: ObjectId[]; current?: ObjectId };
    cascade?: { exiled: ObjectId[]; hit?: ObjectId; /** Discover: its value, for "whenever you discover" (Curator of Sun's Creation). */ n?: number }; // cards cascade exiled, and the one it may cast
    untilNonland?: { hit?: ObjectId; caster: PlayerId; seen?: ObjectId[] }; // the nonland card exileUntilNonland found, and who may cast it
    n?: number; // an amount the effect worked out before waiting on a player (CR 608.2h)
    nFor?: Record<string, number>; // the same, for each player when it counts their own ("half the cards in their hand")
    distributed?: Record<ObjectId, number>; // how a "distribute" effect's counters were divided, as it resolves
    manaMix?: Partial<Record<Color, number>>; // the colors chosen for "add X mana in any combination of colors"
    /** A "may" asked about each of its targets (Effect "may" `eachTarget`): the next target slot to ask about, and the ones accepted; `mayAnswer`, the last answer. */
    mayEach?: { at: number; yes: number[] };
    mayAnswer?: boolean;
    found?: ObjectId[]; // the cards a library search found
    toughnessGained?: true; // Talara's Bane's life was gained before the discard waited on a choice
    picking?: true; // an opponent is choosing among revealed cards (Gifts Ungiven); `picked`, what they chose
    picked?: ObjectId[];
    /** Separating cards into two piles (Fact or Fiction, CR 700.3): `separating` while it's being done, `pileOne` the first pile, `pileChoice` the pile chosen (0 or 1). */
    separating?: true;
    pileOne?: ObjectId[];
    pileChoice?: number;
    /** "Each player puts a creature card from their graveyard onto the battlefield" (Exhume): players still to choose, and the cards chosen so far. */
    yardPicks?: { queue: PlayerId[]; picked: Record<string, ObjectId[]> };
    /** "Each player may put ... from their hand onto the battlefield" (Show and Tell): players still to choose, and the cards chosen. */
    handPicks?: { queue: PlayerId[]; picked: Record<string, ObjectId[]> };
    searchQueue?: PlayerId[]; // players still to search, in APNAP order ("each player searches their library", CR 101.4)
    searchedBy?: { pid: PlayerId; found: ObjectId[]; exiledFor?: PlayerId }[]; // the cards each player who has searched found, in that order; `exiledFor`: exiled instead, for that player to play (Opposition Agent)
    /** Opposition Agent: the player whose search is under way exiles what they find, and this player may play it. */
    searchExileFor?: PlayerId;
    flickered?: { id: ObjectId; zc: number }[]; // cards a flicker exiled, to return once Auras' hosts are chosen
    /** A delayed "return the exiled card" waiting on an Aura's host: the cards it returns (Phelia's "if it entered under your control"). */
    returning?: { id: ObjectId; zc: number }[];
    /** returnHeld paused for an Aura's host: the cards it returns. */
    returningHeld?: { id: ObjectId; zc: number }[];
    playLinked?: true; // "you may play the exiled card" (or cast the cipher copy) was asked
    playLinkedPick?: true;
    thumbFlip?: true; // Krark's Thumb: one coin won, one lost, the choice asked // "play one of them" (Evercoat Ursine): which one was asked (in `found`)
    cipherCopy?: ObjectId; // the copy of an encoded card offered to cast (CR 702.99a)
    looked?: ObjectId[]; // the top cards a "look at the top N" effect is choosing from
    /** Birthing Ritual: the sacrifice after looking has been chosen (Effect dig `sacrificeFirst`). */
    digSacrificed?: true;
    connive?: { pid: PlayerId; id?: ObjectId; zc?: number }; // who connives, and the conniving permanent (CR 701.50)
    copies?: { of: string; left: number; targets?: TargetChoice[]; /** Demonstrate: the opponent who copies it too, and whether they have. */ opp?: PlayerId; oppDone?: true; /** Twinning Staff's additional copies still to make (CR 614.1a), and the opponent's copies left. */ extra?: number; oppLeft?: number; /** Copy "eachOther" (Zada): the permanent each copy still to make targets, in order; who controls them; whether the next one's has been chosen. */ each?: ObjectId[]; by?: PlayerId; picked?: true }; // spell copies still to make, and the next one's targets
    /** A clash (CR 701.30): the opponent, the revealed cards, who still decides, who puts theirs on the bottom. */
    endure?: string; // "counters" or "token" (CR 701.63a)
    either?: number; // which of an "either" effect's options
    /** Effect "unlockDoor": the door chosen, `${roomId}:${door}`. */
    door?: string;
    /** A villainous choice (Effect villainous): the players still to face it, the option the first chose, how far it's done; `keep`, the scratch from before it. */
    villain?: { queue: PlayerId[]; pick?: number; step?: number; keep: string[] };
    /** "Move a counter" (Nesting Grounds): the kind chosen. */
    counterKind?: string;
    /** "Remove up to three counters" (Glissa Sunslayer): how many of each kind are chosen so far, and whether that's all. */
    countersPicked?: Record<string, number>;
    countersDone?: true;
    /** Slippery Bogbonder: the counters picked so far, by "objectId:kind" (Effect "gatherCounters"). */
    gathered?: Record<string, number>;
    payOrTop?: { idx: number; answer?: string }; // Sylvan Library: the chosen card being handled, and pay or put back

    tapOrUntap?: string; // "tap", "untap" or "neither", for "tap or untap target permanent"
    /** How many cards the player being asked chose to draw ("draw up to two cards"). */
    drawUpTo?: string;
    drawUpToQueue?: PlayerId[];
    /** "You may pay {X}": the X chosen, or "none". */
    payX?: string;
    /** Join forces: the players still to decide, from the controller on in turn order, and what they've paid so far. */
    join?: { queue: PlayerId[]; paid: number; asked?: number; by: Record<PlayerId, number> };
    /** "Then repeat this process X more times": the passes left (this one too), the next instruction, and the scratch from before it started. */
    repeat?: { left: number; step?: number; keep: string[] };
    /** The commander chosen to put into the hand (Command Beacon with two commanders). */
    commander?: ObjectId;
    /** "You may cast a spell ... from your hand without paying its mana cost": the card picked, "none", or "cast" once it's offered. */
    castFromHand?: string;
    /** The card a castFromHand chose to cast (In Search of Greatness's "if you don't"). */
    castFromHandId?: string;
    /** The same from the graveyard (Sword of Once and Future): the card being cast, to exile it instead of its going back. */
    castFromYard?: ObjectId;
    /**
     * "You may cast any number of spells ... from among them" (Primeval Spawn): the exiled cards, the total mana value
     * still allowed, the card last offered, the cards not cast when offered, and the card picked ("none" to stop).
     */
    /** exileFaceDown: a hand card is being chosen, or with `pickOne` one of these cards from the top of a library. */
    faceDownPick?: true;
    faceDownLooked?: ObjectId[];
    /** Clone Shell: the looked-at cards going to the bottom of the library in the order the actor chooses. */
    faceDownBottom?: ObjectId[];
    /** moveLinked with `one`: the card is being chosen. */
    linkedPick?: true;
    linkedCopyPick?: true;
    /** Benthic Anomaly: the creatures chosen so far (one for each opponent), and whether the one to copy is being asked. */
    perOpponent?: { picked: ObjectId[]; copyPick?: true };
    /** Lim-Dûl's Vault: where it is (asking, the cards going to the bottom, being put back on top) and the cards looked at. */
    vault?: { stage: "ask" | "bottom" | "top"; looked: ObjectId[] };
    /** Lim-Dûl's Vault: how many times life was paid this resolution (bots stop after a few). */
    vaultPaid?: number;
    /** "Exile the top two cards ..., then choose one of them" (Party Thrasher): the cards exiled, and the one chosen. */
    impulseChoice?: { ids: ObjectId[]; pick?: ObjectId };
    /** Dance with Calamity (castFromAmong `pushLuck`): the cards exiled so far, whether it was just asked, and done asking. */
    pushLuck?: { ids: { id: ObjectId; zc: number }[]; asked?: true; stop?: true };
    /** Time travel (CR 701.56a): the objects with time counters, and for each one chosen so far "add", "remove" or "none". */
    timeTravel?: { ids: { id: ObjectId; zc: number }[]; picks: Record<ObjectId, string> };
    castAmong?: { ids: { id: ObjectId; zc: number }[]; /** Kefka: each spell cast this way, its owner and mana value on the stack. */ castSpells?: { owner: PlayerId; mv: number }[]; budget?: number; maxMv?: number; exactMv?: number; casting?: ObjectId; declined: ObjectId[]; pick?: string; done?: true; /** How many were cast. */ cast?: number; /** `untilHits`: the cards that qualified; `handPick`, choosing which goes to the hand. */ hits?: ObjectId[]; handPick?: true; /** `copies`: the card the copy being cast is of. */ copyOf?: ObjectId; /** With `copyTimes`: how many copies of each card have been made. */ copied?: Record<ObjectId, number>; /** `lands`: the land picked to play, after asking whether it enters untapped. */ landPick?: ObjectId; /** `opponentExcludes`: the opponent asked, and the card they chose (not to be cast). */ excludeBy?: PlayerId; excluded?: ObjectId };
    topOrBottom?: string; // the owner's choice: "top" or "bottom"
    /** The player a creature put onto the battlefield attacking attacks (CR 508.4), as a PlayerId string. */
    attackWhom?: string;
    /** reselectAttack: what the creature attacks now (as attackChoices keys it). */
    reselect?: string;
    /** reselectAttack for each attacking creature (Windshaper Planetar): the ones asked about so far. */
    reselected?: ObjectId[];
    /** Token copies created attacking: what each one attacks, chosen so far (attackChoices keys). */
    attackPicks?: string[];
    /** "Tapped and attacking that player or a planeswalker they control": each opponent's pick (an attackChoices key). */
    attackEach?: Record<number, string[]>;
    /** "Search your library and/or graveyard": "both", or "graveyard" alone (no shuffle). */
    searchZones?: string;
    /** The card a "you may cast target card ... without paying its mana cost" offered (castTargetFree). */
    castingTarget?: ObjectId;
    /** Rona, Tolarian Obliterator (Effect "exileRandomThenPlay"): the card exiled, and whether it's been offered. */
    exiledAtRandom?: { id: ObjectId; zc: number; asked?: true };
    /** castTargetFree with several targets: the ones offered already. */
    castTargetsDone?: ObjectId[];
    /** castLinkedCopy: the copy of the exiled card offered to be cast. */
    linkedCopy?: ObjectId;
    /** Effect "damage" to "that player or a planeswalker that player controls": the one chosen, "p<player id>" or an object id. */
    damageWhom?: string;
    damageSource?: string; // the source of damage chosen as it resolves (CR 609.7a): an object id, or "none" if there was none to choose
    /** "Roll two d8 and choose one result": the index of the die chosen (see runDiceEffect). */
    rollChoice?: string;
    evidence?: ObjectId[]; // the cards picked to collect evidence with as it resolves (CR 701.59a)
    clash?: { opp?: PlayerId; revealed?: Record<string, ObjectId | null>; queue?: PlayerId[]; bottom?: PlayerId[]; answer?: boolean };
    /** Auras entering without being cast: what each enchants (an auraHostKey), "none" if nothing (CR 303.4f-g). */
    auraHosts?: Record<ObjectId, string>;
    /** "For each Aura and Equipment you control, you may attach it" (Inventory Management): those there as it began resolving. */
    attachEach?: ObjectId[];
    /** The Aura whose host is being chosen. */
    auraAsking?: ObjectId;
    /** Effect attachToChosen with `pickOne` (Gilgamesh): the permanent chosen to attach, or "none". */
    attachWhich?: string;
    /** Effect attachEquipmentTo (Goldwardens' Gambit): the next of `attachEach` to choose an Equipment for. */
    attachEqAt?: number;
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
  | { type: "activateMana"; player: PlayerId; objectId: ObjectId; mana: ManaType; ability?: number; tap?: ObjectId[]; extra?: ManaType[]; combo?: number; /** "A player of your choice adds {C}" (Victory Chimes): who; the player activating it if left out. */ to?: PlayerId; /** Activated to pay for the ability activated next, which counts as begun first (TurnLog.artifactAbility). */ forNext?: true }
  /** `convoke`: creatures tapped to help pay (CR 702.51a); `improvise`: artifacts (CR 702.126a). */
  | ({ type: "castSpell"; player: PlayerId; objectId: ObjectId; targets?: TargetChoice[]; modes?: number[]; convoke?: ObjectId[]; improvise?: ObjectId[]; x?: number } & CostChoices)
  /** `tapCreatures`: the creatures tapped to pay a crew cost (CR 702.122a). */
  /** `costs`: what's sacrificed or discarded to pay for it (see ActivatedAbility.costs). */
  /**
   * For a mana ability (CR 605.1a), which resolves right away: `mana`, the color for its "one mana of any color" (chosen
   * as it resolves, CR 605.3b; without it, it's asked); `extra`, as for activateMana.
   */
  | { type: "activateAbility"; player: PlayerId; objectId: ObjectId; index: number; targets?: TargetChoice[]; modes?: number[]; tapCreatures?: ObjectId[]; x?: number; costs?: CostChoices; mana?: ManaType; extra?: ManaType[]; /** A mana ability activated to pay for the ability activated next (TurnLog.artifactAbility). */ forNext?: true }
  | { type: "chooseModes"; player: PlayerId; modes: number[] }
  | { type: "chooseTargets"; player: PlayerId; targets: TargetChoice[] }
  /** New targets for a spell copy, or none to keep the original's (CR 707.10c). */
  | { type: "copyTargets"; player: PlayerId; targets?: TargetChoice[] }
  /** New targets for a spell or ability (see PendingDecision "newTargets"), or none to keep them. */
  | { type: "newTargets"; player: PlayerId; targets?: TargetChoice[] }
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
  /** Answer to manaMix: how many mana of each color (left out: none), adding up to its `n`. */
  | { type: "manaMix"; player: PlayerId; counts: Partial<Record<Color, number>> }
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
  /** `x`: for "Suspend X" (Aeon Chronicler), the X paid and the time counters, at least 1 (CR 702.62a, 107.3). */
  | { type: "suspend"; player: PlayerId; objectId: ObjectId; x?: number }
  /** Exile a card from your hand with plot, paying its plot cost: a special action (CR 116.2k, 702.170a). */
  | { type: "plot"; player: PlayerId; objectId: ObjectId }
  /** Pay a locked door's mana cost to unlock it: a special action (CR 116.2m, 709.5e). `door`: 0 left, 1 right. */
  | { type: "unlockDoor"; player: PlayerId; objectId: ObjectId; door: number }
  /** Pay to end an effect on this permanent that says "you may pay ... to end this effect" (a Licid; CR 116.2c). */
  | { type: "endEffect"; player: PlayerId; objectId: ObjectId }
  /** Foretell a card from your hand: pay {2} and exile it face down, a special action (CR 116.2h, 702.143a). */
  | { type: "foretell"; player: PlayerId; objectId: ObjectId }
  /** Answer to assist: how much of the spell's generic mana to pay from your mana pool (0 to decline). */
  | { type: "assist"; player: PlayerId; n: number }
  /** Answer to assistCast: pay the rest of the cost and cast it, or `cancel` the cast (CR 733.1). */
  | { type: "finishAssistedCast"; player: PlayerId; cancel?: boolean }
  /** Answer to dredge: the card to dredge instead of drawing, or none to draw (CR 702.52a). */
  /** Answers PendingDecision "drawEmptyReturn": the creature card to return. */
  | { type: "drawEmptyReturn"; player: PlayerId; objectId: ObjectId }
  /** Answers PendingDecision "drawInstead": one of its `options`. */
  | { type: "drawInstead"; player: PlayerId; choice: string }
  | { type: "dredge"; player: PlayerId; objectId?: ObjectId; /** Abundance instead: reveal until a card of this kind. */ abundance?: "land" | "nonland" }
  /** Which of the cards looked at instead of drawing goes to the graveyard (Scion of Halaster). */
  | { type: "drawLook"; player: PlayerId; /** The card to put into the graveyard, or with Underrealm Lich (`keep`) into the hand (none when fewer than two to look at). */ objectId?: ObjectId; /** Apply another replacement first (see the drawLook prompt). */ instead?: "archive" | "dig" | { dredge: ObjectId } | { abundance: "land" | "nonland" } }
  /** Turn a face-down permanent face up by paying its morph or disguise cost: a special action (CR 116.2b, 702.37e). */
  | { type: "turnFaceUp"; player: PlayerId; objectId: ObjectId; /** Which of faceUpWays (a manifested card with morph has two). */ way?: number; /** The X chosen for an {X} in the cost (CR 107.3d), "Disguise {X}{3}{W}". */ x?: number; /** What pays a morph cost that isn't mana ("Morph—Sacrifice two Mountains"). */ costs?: CostChoices }
  /** Answer to payUnless: pay the cost from your mana pool, or let it be countered. */
  | { type: "payUnless"; player: PlayerId; pay: boolean; /** Waterbend (CR 701.67a): untapped artifacts and creatures tapped to pay {1} each of the cost. */ tap?: ObjectId[] }
  | { type: "concede"; player: PlayerId };

export class RulesError extends Error {}

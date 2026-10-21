// The effect language. Card rules text is compiled (see oracle.ts) into these plain,
// serializable structures, and the engine executes them (see effects.ts). Everything
// here is data, so abilities can sit on the stack inside GameState.

import type { Color, FaceDownKind, ManaType, ObjectId, PlayerId, SkipWhat, TurnRule } from "./types";
import type { CopyExcept } from "./copies";

/**
 * A number an effect uses: fixed, or worked out from the game. A spell or ability works out
 * the number once, as it resolves (CR 608.2h); a static ability keeps it up to date (CR 611.3a).
 */
/** TargetSpec.counter for "with a counter on it": a counter of any kind. */
export const ANY_COUNTER = "any";

export type Amount = number | AmountExpr;

/** Counter kinds effects can put on permanents. Stun and shield are keyword counters (CR 122.1c-d). */
/** +1/+1, -1/-1, stun (CR 122.1d), shield (122.1c), and named counters with no rules of their own: charge, spore, oil, ... */
// eslint-disable-next-line @typescript-eslint/ban-types
export type CounterKind = "+1/+1" | "-1/-1" | "stun" | "shield" | "time" | "fade" | (string & {});

/** How the cards an exileFaceDown effect exiled may be played (see GameObject.mayPlay). */
export interface FaceDownPlay {
  until: "thisTurn" | "exiled" | "yourNextTurn" | "source";
  free?: true;
  anyType?: true;
  castOnly?: true;
}

/** What happens to permanents a player picks as an effect resolves: sacrificed, returned to hand, or given counters. */
/** "populate": create a token that's a copy of the picked creature token (CR 701.36). */
/** "reveal": amplify's cards revealed from the hand as a permanent enters (CR 702.38a). */
/** "band": attacking creatures declared to be in a band (CR 702.22c). */
/** "enlist": the creature an attacker taps for its enlist ability (CR 702.154a). */
/** "unblocked": blocked attackers that assign their combat damage as though they weren't blocked (CR 510.1). */
/** "exert": attackers their controller exerts as they attack (CR 701.43d). */
/** "choose": "Choose a creature you control. It gains indestructible until end of turn": only picked; "it" is that one. */
export type PickAction = "phaseOut" | "sacrifice" | "bounce" | "counters" | "populate" | "pair" | "reveal" | "unblocked" | "enlist" | "band" | "ringBearer" | "champion" | "exert" | "keepTapped" | "encode" | "keep" | "untap" | "tap" | "choose" | "meld";

/**
 * What "unless its controller pays ..." asks for (CR 118.12): a mana cost, plus generic mana counted
 * as it resolves ("{X}", "{1} for each card in your hand"), plus life ("{2} and 2 life").
 */
/** "You may pay {2}. If you do, ...": mana, life or energy, paid as it resolves. */
export interface PayCost {
  mana?: string;
  life?: number;
  energy?: number;
}

/**
 * One way to avoid a punisher's penalty: discard that many cards, sacrifice a permanent like this (`n` of them: "two
 * creatures"), pay, or have the source deal that much damage to you ("any opponent may have it deal 4 damage to them").
 */
export type PunisherOption = { discard: number } | { sacrifice: TargetSpec; n?: number } | { pay: UnlessPays } | { damage: number };

export interface UnlessPays {
  cost: string;
  generic?: Amount;
  life?: number;
  /** "Ward—Discard a card": discard this many cards (of their choice) as the payment. */
  discard?: number;
  /** "Ward—Pay life equal to this creature's power" (Phyrexian Fleshgorger): life counted as the choice is offered. */
  lifeAmount?: Amount;
  /** "Ward—Sacrifice a creature" (Vein Ripper): `n` permanents of their choice they control that match `filter`. */
  sacrifice?: { n: number; filter: TargetSpec };
}

/**
 * `count` times `times` (default 1), plus `plus` (default 0): "2 life for each creature", "X is 1 plus
 * ...". A negative result is 0 (CR 107.1b: "If your life total is negative, X is considered to be 0").
 * `negate` then makes it negative, for "-X/-X" and "-1/-1 for each".
 * `half` halves that first, "half your life, rounded up" (rounded down unless the text says up, CR 107.1a).
 */
export interface AmountExpr {
  count: Count;
  times?: number;
  plus?: number;
  negate?: boolean;
  half?: "up" | "down";
  /** It may be below 0: doubling a creature's power gives it +X/+0 for a negative X too (CR 107.1b, 701.10c). */
  signed?: true;
  /** "If X is 6 or more, ... twice X damage ... instead" (Shatterskull Smashing): twice as much when the X announced is this or more. */
  twiceIfX?: number;
}

/** What an amount counts. */
export type Count =
  /** The X chosen while casting or activating it (CR 107.3a), or the spell's X for its permanent's ETB (CR 107.3m). */
  | { kind: "x" }
  /**
   * "The number of creatures you control", "for each other Elf you control". `filter.controller` is from the ability's controller's view;
   * `whose`: "creatures target player controls", controlled by those players.
   */
  | { kind: "permanents"; filter: TargetSpec; other?: boolean; whose?: PlayerRef; /** "Differently named lands you control": each English name once (rulings); a face-down permanent has no name (CR 708.2). */ differentNames?: true; /** "Each other attacking creature that shares a creature type with it" (Shared Animosity): not the trigger's subject, and sharing a type with it. */ sharesTypeWithSubject?: true; /** "Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it" (Coat of Arms): not the permanent the static effect is applied to, and sharing a type with it. */ sharesTypeWithAffected?: true }
  /** "The number of cards in your hand", "in that player's hand". */
  | { kind: "cardsInHand"; who: PlayerRef }
  /** "Each creature you control gets +1/+0 for each time it has attacked this turn" (Moraug): the permanent the static effect is applied to (GameObject.attacked). */
  | { kind: "timesAffectedAttacked" }
  | { kind: "cardsInLibrary"; who: PlayerRef }
  /** "That many cards" after discarding a hand (Tolarian Winds); `greatest`: "the greatest number of cards a player discarded this way" (Windfall). */
  | { kind: "discardedThisWay"; greatest?: true; /** Only these players' discards: "each player discards their hand, then draws that many cards" is each their own (Dark Deal). */ who?: PlayerRef }
  /** "The total mana value of those cards" after "you mill three cards" (Combustible Gearhulk): X counts 0 (CR 107.3). */
  | { kind: "milledManaValue" }
  /** "For each card exiled from their hand this way" (Lost Legacy): of the cards an exileNamed instruction exiled. */
  | { kind: "exiledFromHandThisWay" }
  /** "Draw that many cards" after "sacrifice any number of other creatures": how many its instructions sacrificed. */
  | { kind: "sacrificedThisWayCount" }
  /** "For each card revealed this way", "the number of cards revealed this way" after revealFromHand, or in its reflexive trigger. */
  | { kind: "revealedFromHand" }
  | { kind: "bottomedFromHand" }
  /** How many cards "you may choose a nonland card from it" chose (0 or 1): for "If you do" and "If you don't". */
  | { kind: "tookFromHand" }
  /** "The greatest power among creature cards exiled this way" (Szat's Will): as they were in the graveyard (rulings), 0 with none. */
  | { kind: "greatestPowerExiled" }
  /** "For each creature destroyed this way" (Decree of Pain): by this spell's or ability's destroy instructions, as they last existed. */
  | { kind: "destroyedThisWay"; filter: TargetSpec }
  /** "For each nontoken creature exiled this way" (Declaration in Stone): permanents, as they last existed. */
  | { kind: "exiledThisWay"; filter: TargetSpec }
  /**
   * "If the discovered card's mana value is less than 10, ... equal to the difference" (Hit the Mother Lode): `n` minus the
   * mana value of the card this spell or ability discovered (CR 701.57c), 0 if it's not less or nothing was discovered.
   */
  | { kind: "discoveredBelow"; n: number }
  /** "For each counter removed this way" (Nexus Mentality). */
  | { kind: "countersRemovedThisWay" }
  /** "For each creature tapped this way", "the number of creatures tapped this way" after tapAnyNumber, or in its reflexive trigger. */
  | { kind: "tappedThisWay" }
  /**
   * "The amount of excess damage dealt to that creature this way" (Hell to Pay), "that excess damage": what this spell's or
   * ability's damage dealt to permanents beyond lethal damage, their loyalty or their defense (CR 120.4a, 120.10).
   */
  /** "You gain life equal to the damage dealt this way" (Syphon Soul): all the damage the instructions before dealt, after prevention. */
  | { kind: "damageThisWay" }
  | { kind: "excessThisWay"; /** Only that target's (The Last Agni Kai's "add that much {R}"). */ target?: number }
  /** "If you lost life this way, draw that many cards" after exchanging life totals (Mister Negative): the life you lost doing it. */
  | { kind: "lifeLostThisWay" }
  /**
   * "Where X is the difference between those players' life totals" after "two target players exchange life totals"
   * (Profane Transfusion): their totals now, after the exchange (rulings), even if one is no longer a legal target (CR 608.2b).
   */
  | { kind: "exchangedLifeDifference" }
  /** "For each death vote", "the number of profit votes" (CR 701.38): the votes for that choice in this ability's vote. */
  | { kind: "votes"; option: string }
  /** "Creature cards in your graveyard", "cards in all graveyards" (`filter` is a "card" spec). */
  | { kind: "cardsInGraveyard"; who: PlayerRef; filter?: TargetSpec }
  /** "~'s power", "its toughness", "that creature's mana value": as it is now, or as it last existed (CR 608.2h). */
  | { kind: "power" | "toughness" | "manaValue"; of: ObjRef }
  | { kind: "life"; who: PlayerRef }
  /** "The number of experience counters you have" (CR 122.1). */
  | { kind: "experience"; who: PlayerRef }
  /** "Your speed": 0 if you have none (CR 702.179f). */
  | { kind: "speed" }
  /** "The number of creatures in your party" (CR 700.8): 0 to 4. */
  | { kind: "party" }
  /** "The total amount of life your opponents have lost this turn", "for each 1 life your opponents have lost this turn" (CR 119.3). */
  | { kind: "opponentsLifeLost" }
  /** "For each unspent green mana you have" (Omnath, Locus of Mana), "six or more unspent mana" (Ozai): what's in your mana pool (CR 106.4). */
  | { kind: "unspentMana"; color?: Color }
  /** "The amount of life you gained this turn", "for each 1 life you gained this turn" (CR 119.3, 119.9): its total, whatever was lost. */
  | { kind: "lifeGainedThisTurn" }
  /** Devotion to a color, or to several (CR 700.5). */
  | { kind: "devotion"; colors: Color[] }
  /** "For each Aura attached to it", "each Equipment attached to it". */
  | { kind: "attachedToSelf"; subtypes: string[] }
  /** "Enchanted creature gets +1/+1 for each Aura and Equipment attached to it" (Mantle of the Ancients): attached to the permanent the static ability's effect is applied to. */
  | { kind: "attachedToAffected"; subtypes: string[] }
  /** Domain: "basic land type among lands you control". */
  | { kind: "basicLandTypes" }
  /** Vivid: "the number of colors among permanents you control" (white, blue, black, red, green; colorless isn't one, CR 105.2c). */
  | { kind: "colorsAmongPermanents" }
  /** "For each spell you've cast this turn" (Aetherflux Reservoir): the spells its controller cast this turn, copies not (CR 707.10). */
  | { kind: "spellsCastThisTurn" }
  /** "The number of card types among cards in all graveyards" (Tarmogoyf): card types only, not subtypes or supertypes (CR 205.2a). */
  | { kind: "graveyardCardTypes"; who: PlayerRef }
  /**
   * "The greatest power among creatures you control": 0 when there are none (rulings on Ghalta). `toughness`: "the greatest
   * toughness among". `whose`: "among creatures they control" (Inscription of Abundance), that player's creatures only.
   */
  | {
      kind: "greatestPower";
      filter: TargetSpec;
      other?: boolean;
      toughness?: true;
      whose?: PlayerRef;
      /** "The total power of creatures you control" (Ghalta): the sum, a negative power taking some off (rulings). */
      total?: true;
    }
  /** "The greatest mana value among permanents you control": 0 when there are none; X is 0 on the battlefield (CR 202.3, 107.3). */
  /** `total`: "the total mana value of historic permanents you control" (Excalibur), the sum instead. */
  /** "The greatest mana value among cards in exile" (Ulamog, the Defiler): every player's exiled cards, a face-down one 0 (CR 708.2). */
  | { kind: "greatestMvInExile" }
  | { kind: "greatestManaValue"; filter: TargetSpec; total?: true; /** "Other permanents you control" (Summon: Bahamut): not the source. */ other?: true }
  /** How many times the spell (or the permanent it became) was kicked (CR 702.33d); `which` = with that kicker cost only. */
  | { kind: "kicked"; which?: number }
  /** 1 if it was kicked at all (or with kicker cost `which`), else 0. */
  | { kind: "wasKicked"; which?: number }
  /** 1 if the mana spent to cast it meets `req` (adamant, CR 601.2h), else 0. */
  | { kind: "spentWas"; req: SpentReq }
  /** "That much", "that many" in a triggered ability: the damage its event dealt. */
  | { kind: "eventAmount" }
  /** "Where X is that excess damage" after "if that creature was dealt excess damage this turn" (CR 120.10). */
  | { kind: "eventExcess" }
  /** "The number of colors of mana spent to cast this spell" (converge, CR 207.2c; sunburst counts the same way, 702.44a). 0 if it wasn't cast. */
  | { kind: "colorsSpent" }
  /**
   * "Enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it" (Marath): only in an
   * "enters with" (the spell it was); 0 if it wasn't cast.
   */
  | { kind: "manaSpent" }
  /** "The greatest number of creatures a player controls" (Investigator's Journal), `opponents`: "an opponent controls". */
  | { kind: "greatestControlled"; filter: TargetSpec; opponents?: true }
  /** "The greatest number of cards an opponent has drawn this turn" (Thought Sponge). */
  | { kind: "greatestDrawn" }
  /** "For each player being attacked" (Pack Attack): players a creature is attacking, not their planeswalkers (CR 506.2, 508.3b). */
  | { kind: "playersAttacked" }
  /** "The number of cards you've drawn this turn" (Duelist of the Mind), "they've drawn this turn" (Cerebral Vortex). */
  | { kind: "drawnThisTurn"; who: PlayerRef }
  /** "For each mana from a Treasure spent to cast it/~" (CR 106.3): the spell's, its permanent's, or an ability's. */
  | { kind: "treasureSpent"; /** "Spent to activate this ability": in an activated ability (compile checks). */ activated?: true }
  /** "Equal to the result" (CR 706.2): the last roll's result, all its dice added up; in a "whenever you roll" trigger, the roll's. */
  | { kind: "rollResult" }
  /** "The other result" after "roll two dX and choose one result": the one not chosen. */
  | { kind: "rollOther" }
  /** "For each flip you won" after "flip a coin until you lose a flip". */
  | { kind: "flipsWon" }
  /** "For each {S} spent to cast ~", "the amount of {S} spent" (CR 107.4h): mana from snow sources spent on the spell. */
  | { kind: "snowSpent" }
  /** "For each creature it devoured" (CR 702.82b). */
  | { kind: "devoured" }
  /** "The number of times ~ has mutated" (CR 702.140d): the source's, also as it last existed (CR 608.2h). */
  | { kind: "mutations" }
  /** "For each creature that died this turn" (CR 700.4); `yours`: "that died under your control this turn". */
  | { kind: "diedThisTurn"; yours?: true }
  /** "The number of (Treasure) tokens you created this turn" (CR 111.2): tokens its controller created. */
  | { kind: "tokensCreatedThisTurn"; subtype?: string }
  /** Gravestorm's "each permanent put into a graveyard from the battlefield this turn", tokens and anyone's too (CR 702.69a, rulings). */
  | { kind: "toGraveyardThisTurn" }
  /** "For each creature that attacked this turn": creatures declared as attackers this turn (CR 508.1). */
  | { kind: "attackersThisTurn" }
  /** "For each time you've cast your commander from the command zone this game": all of your commanders (CR 903.8, rulings). */
  | { kind: "commanderCasts" }
  /** Melee: "for each opponent you attacked with a creature this combat" (CR 702.121a). */
  | { kind: "opponentsAttacked" }
  /** "For each player", "for each opponent (you have)": the players still in the game (CR 102.1, 800.4a). */
  /** `lostLife`: "for each of your opponents who lost life this turn" (Belbe): ones who lost the game since too (rulings). */
  /** `drewThisWay`: "for each opponent who drew a card this way" (Cut a Deal): those who drew a card in this resolution's draw before, once each. */
  | { kind: "players"; opponents?: true; lostLife?: true; drewThisWay?: true }
  /** "For each charge counter on ~", "the number of +1/+1 counters on it": as it last existed if it's gone. */
  | { kind: "counters"; counter: CounterKind; of: ObjRef }
  /** Station's "the tapped creature's power" (CR 702.184a): as the ability resolves, or as it last existed (rulings). */
  | { kind: "stationPower" }
  /** How many players took a punisher's penalty this time (Acererak's "for each opponent, you create ... unless"). */
  | { kind: "punished" }
  /** 1 while the condition holds, else 0: "Add {G}{G}. If you've completed a dungeon, add six {G} instead." */
  | { kind: "stateIf"; cond: StaticCondition };

/** What a "target ..." phrase allows. CR 115 */
export interface TargetSpec {
  /**
   * "object" = a permanent, "player", "any" = creature/planeswalker/player (CR 115.4),
   * "spell" = an object on the stack, "card" = a card in a graveyard ("target creature card
   * from your graveyard", CR 109.2a, 115.2).
   */
  kind: "object" | "player" | "any" | "spell" | "card";
  /** For "card": whose graveyard ("your graveyard", "an opponent's graveyard"); unset = any graveyard. */
  owner?: "you" | "opponent";
  /** For "card": a card in exile linked to the source instead ("target creature card exiled with ~", CR 607.2a). */
  linkedExile?: true;
  /** For objects: owned by this player, a mutating creature spell's owner (CR 702.140a). */
  ownerIs?: PlayerId;
  /** For objects/spells: at least one of these card types (empty = any permanent). */
  types?: string[];
  /** All of these card types: "artifact creature" (as opposed to "artifact or creature"). */
  allTypes?: string[];
  /** "Double-faced card" (CR 712.1): a nonmodal or modal double-faced card or a meld card, whichever face is up. */
  doubleFaced?: true;
  /** "Transformed permanent" (CR 701.27g): a nonmodal double-faced permanent with its back face up, not melded or merged. */
  transformed?: true;
  /** "Each with power greater than its base power" (Kutzil): see basePowerNow. */
  powerAboveBase?: true;
  /** Excluded card types, e.g. "nonland permanent" -> ["Land"]. */
  notTypes?: string[];
  /** Excluded colors, e.g. "nonblack creature" -> ["B"]. */
  notColors?: Color[];
  /** At least one of these colors, e.g. "blue permanent", "red or green creature". */
  colors?: Color[];
  /** "Multicolored spell" (two or more colors, CR 105.4), "monocolored" (exactly one), "colorless" (none, CR 105.2c). */
  colorCount?: "multicolored" | "monocolored" | "colorless" | /** one or more colors (CR 105.2c) */ "colored" | /** exactly two colors, or not exactly two */ "two" | "notTwo";
  supertypes?: string[]; // "basic land", "legendary creature"
  /** At least one of these subtypes: "Spirit card", "Walls" (changelings have every creature type). */
  subtypes?: string[];
  /** Or one of these subtypes instead of one of `types`: "creature or Vehicle". */
  orSubtypes?: string[];
  notSupertypes?: string[]; // "nonbasic land", "nonlegendary creature"
  /** "Artifact, enchantment, or nonbasic land": it also fits one of these (each alternative with its own qualities). */
  anyOf?: TargetSpec[];
  keywords?: string[]; // "creature with flying"
  notKeywords?: string[]; // "creature without flying"
  power?: Range; // "with power 4 or greater"
  toughness?: Range;
  manaValue?: Range; // "with mana value 3 or less" (CR 202.3)
  /** "With mana cost {0} or {1}" (Urza's Saga): its mana cost is exactly one of these (CR 202.1; not {X} or none, rulings). */
  manaCostIn?: string[];
  /**
   * "Counter target spell with mana value X", "destroy target creature with power X or less": the X announced for the
   * spell or ability (CR 107.3a), made into that range of `key` as its targets are chosen (settleDivided). Until then,
   * any value.
   */
  xRange?: { key: "power" | "toughness" | "manaValue"; at: "exact" | "most" | "least" };
  /**
   * "With mana value less than or equal to the number of Plains you control", "with power less than or equal to ~'s
   * power": a range of `key` up to (or from) an amount. For a target it's worked out as the target is chosen and again as
   * it resolves (CR 601.2c, 608.2b; rulings on Beguiler of Wills and Earthshaker Khenra), for a group or a search as it
   * resolves (`bindBound`). Until then, any value.
   */
  bound?: { key: "power" | "toughness" | "manaValue"; at: "most" | "least" | "exact"; amount: AmountExpr };
  /**
   * "With mana value less than or equal to the number of cards in its controller's graveyard" (Drown in the Loch): each
   * candidate against its own controller's graveyard, as it's chosen and as it resolves (CR 601.2c, 608.2b).
   */
  mvAtMostControllersGraveyard?: true;
  /**
   * `attackedThisTurn`: "creatures that attacked this turn" (declared as attackers this turn, CR 508.1).
   * `couldButDidntAttack`: "creatures that didn't attack this turn, except for creatures that couldn't attack" (Season of
   * the Witch): ones that could have been declared as attackers this turn but weren't (rulings, GameObject.couldAttack).
   */
  /** `attackingYou`: "creatures attacking you", attacking that player and not a planeswalker or battle (CR 506.3, 508.1b). */
  combat?: "attacking" | "blocking" | "attackingOrBlocking" | "attackedThisTurn" | "couldButDidntAttack" | "attackingBattle" | "attackingYou";
  /** "Each green creature that entered this turn" (Oran-Rief): this object came onto the battlefield this turn (CR 400.7). */
  enteredThisTurn?: true;
  /** "With lesser power" than the ability's source (mentor, CR 702.134a). */
  lesserPowerThanSource?: boolean;
  /**
   * "Target creature that player controls" in a trigger about a player ("Whenever ~ deals combat damage to a
   * player"): "eventPlayer", made concrete as `controlledBy` once the trigger knows that player.
   */
  /** "chosenPlayer": "creatures that player controls" after "Choose a player ..." (The Black Gate), bound as it resolves (fixMods). */
  controller?: "you" | "opponent" | "eventPlayer" | "enchanted" | "chosenPlayer";
  controlledBy?: PlayerId;
  /** A battle's protector (CR 310.9): "each battle they protect" after "each opponent", "battle that player protects". */
  protector?: "opponent" | "eventPlayer";
  protectedBy?: PlayerId;
  /** For players: only opponents. */
  opponent?: boolean;
  /** "Up to two target creatures": this target may be left unchosen (CR 115.6). */
  optional?: boolean;
  /**
   * "N damage divided as you choose among one, two, or three targets": this is one of the targets `first` to
   * `first + n - 1`, which share `total` as their controller chose with the targets, at least 1 each (CR 601.2d).
   */
  divided?: {
    first: number;
    n: number;
    total: number;
    /** Counters distributed, not damage divided. */
    counter?: CounterKind;
    /** "Among up to two target creatures": none at all is fine too. */
    upTo?: true;
    /**
     * "X damage divided as you choose among any number of targets": the amount, worked out as the targets are chosen
     * (CR 601.2d: as it's cast or put on the stack) and kept in `total` from then on (`settleDivided`). With it the
     * target is a `many` one: one to that many targets, as each gets at least 1, or none if it's 0.
     */
    amount?: AmountExpr;
    /** `total` holds the amount, worked out. */
    settled?: true;
  };
  /** "Another target creature" on a permanent's ability: not the source itself. */
  notSource?: boolean;
  /**
   * Targets this one can't be the same as: the others of the same "two target creatures" (CR 115.3),
   * or the earlier ones for "another target".
   */
  distinctFrom?: number[];
  /** "Up to three target cards from a single graveyard": in the same graveyard as these targets of the group, if chosen. */
  sameGraveyardAs?: number[];
  /**
   * "Each opponent may sacrifice a permanent of their choice that shares a card type with it" (Braids, Arisen Nightmare):
   * a card type of what this ability sacrificed, as it last existed (rulings: any one of them if it had several), made into
   * `types` as the choice is made.
   */
  sharesTypeWithSacrificed?: true;
  /** "Two target creature cards that share a creature type": shares one with each of these targets of the group. */
  sharesCreatureTypeWith?: number[];
  /** "Up to six target creature cards with different names" (Behold the Sinister Six!): a name none of these targets of the group has (CR 601.2c). */
  differentNameFrom?: number[];
  /**
   * "Any number of target creature cards that each have a different mana value X or less" (Agadeem's Awakening): each a
   * mana value none of the others has (CR 601.2c). On the "any number" entry (`many`) until it's made into its targets, which
   * then get `differentManaValueFrom`: a mana value none of these targets of the group has.
   */
  differentManaValues?: true;
  differentManaValueFrom?: number[];
  /**
   * "Any number of target artifacts with total mana value 6 or less", "up to two target creature cards with total power
   * 10 or less": with the other targets that have it, the targets chosen add up to no more than `max` (CR 601.2c), or
   * the X announced (`x`, made into `max` as targets are chosen, see settleDivided). Checked again as it resolves: over
   * it then, every one of them is illegal (CR 608.2b; rulings on Nethroi, Reunion of the House).
   */
  total?: { key: "manaValue" | "power"; max?: number; x?: true };
  /** true: tapped; false: untapped. */
  tapped?: boolean;
  /** "Creature that was dealt damage this turn": damage it was dealt, even if it's been removed since (regeneration). */
  dealtDamageThisTurn?: true;
  /** true: a token; false: "nontoken". */
  token?: boolean;
  /**
   * "Enchanted creatures you control" (an Aura attached), "equipped creature" (an Equipment attached), "modified
   * creature" (CR 700.9: a counter on it, equipped, or enchanted by an Aura its controller controls); "unenchanted":
   * "creatures that aren't enchanted".
   */
  status?: "enchanted" | "equipped" | "enchantedOrEquipped" | "modified" | "unenchanted";
  /** "Target Aura attached to a creature", "Aura or Equipment attached to a creature you control": what it's attached to. */
  attachedTo?: TargetSpec;
  /** "Suspected creature" (CR 701.60). */
  suspected?: true;
  /** true: a commander ("commander creature you control", CR 903.3); false: "noncommander". */
  commander?: boolean;
  /** "a card named ~": the source's name; "a card named Ajani, Valiant Protector": that name (only for searches). */
  named?: string;
  /** None of these subtypes. */
  notSubtypes?: string[];
  /** "creature with a +1/+1 counter on it", "permanents with ice counters on them"; ANY_COUNTER: "with a counter on it". */
  counter?: CounterKind;
  /** "creatures with no counters on them" (Damning Verdict). */
  noCounters?: true;
  /** "each creature without a +1/+1 counter on it" (Wave Goodbye). */
  notCounter?: CounterKind;
  /**
   * "of the chosen type", "that aren't of the chosen type", "of the chosen color": the creature type
   * or color chosen for the source (see GameObject.chosen) or while the spell resolves. Before
   * `bindChosen` fills it in, a filter that needs a choice that wasn't made matches nothing.
   */
  chosen?: "type" | "notType" | "color" | "notColor" | "cardType" | /** "Of a type chosen this way" (Chosen.types: any of them), "that aren't ...". */ "typesChosen" | "notTypesChosen" | /** "with the chosen name", "with that name" (Chosen.name, CR 201.4). */ "name";
  /**
   * "Target spell with a single target": a spell that targets exactly one thing once, whether or not that target is
   * still legal (rulings on Deflection).
   */
  singleTarget?: boolean;
  /**
   * For "spell" targets: abilities on the stack it can also target, "target spell, activated ability, or triggered
   * ability" (CR 115.1c-d; mana abilities never use the stack, 605.3a); `noSpells`: "target activated ability".
   */
  stackAbilities?: "activated" | "triggered" | "both";
  noSpells?: true;
  /**
   * For "spell" targets: a permanent matching this can be the target instead, "target spell or nonland permanent an
   * opponent controls" (Sink into Stupor, Venser, Shaper Savant). One target, either kind (CR 115.1, 115.2).
   */
  orPermanent?: TargetSpec;
  /**
   * "Target spell that targets a permanent you control", "... that targets you": a spell with at least one target that's
   * still that object on the battlefield and matches, or that is you (rulings on Rebuff the Wicked).
   */
  targetsWhat?: TargetSpec | "you";
  /** "That targets you or a creature you control" (Siren Stormtamer): with `targetsWhat`, a spell that targets you counts too. */
  targetsYouToo?: true;
  /**
   * A target of a part of a spell that has its effect only if it was kicked, bargained, cast using teamwork or its gift
   * was promised (`not`: only if it wasn't, for the part an "instead" replaces): it's chosen only then, and otherwise
   * the spell is cast as if it didn't have it (CR 702.33g, 702.166d, 702.194c, 702.174m).
   * See `gateTargets`.
   */
  onlyIf?: { cond: SpellCondition; not?: true };
  /** Set by `gateTargets` for a target the spell is cast as if it didn't have: nothing ({ kind: "none" }) is chosen. */
  skip?: true;
  /**
   * "Any number of target creatures" ("any"), "up to X target artifacts" ("x"), "X target creatures" ("exactX"): a
   * variable number of targets, announced as it's cast (CR 601.2c), any number from 0 (115.6), up to X, or exactly X. This one entry stands for all of them until then;
   * `expandMany` (modes.ts) makes it that many targets, and the effects' references to it cover them all.
   */
  many?: "any" | "x" | "exactX" | /** "Another target for each time ~ was kicked" (Comet Storm): as many as times kicked, made so as it's cast (gateBody). */ "kicked";
  /**
   * "For each opponent, destroy up to one target artifact that player controls": one "up to one" target for each
   * opponent, controlled by that opponent (CR 601.2c, 115.6). This one entry stands for all of them until the targets
   * are chosen; `expandPerOpponent` (modes.ts) makes it one target per opponent then, each with `controlledBy`.
   */
  perOpponent?: true;
  /** Original text, for display. */
  text: string;
}

/** Where a card found by a search goes. */
export interface SearchDest {
  zone: "hand" | "battlefield" | "libraryTop" | "graveyard" | "exile";
  tapped?: boolean;
  /** "Exile it face down" (Beseech the Mirror): only its owner may look at it (CR 406.3); kept in Resolving.faceDownExiled. */
  faceDown?: true;
  /** "Put that card third from the top" (Long-Term Plans), for "libraryTop". */
  third?: true;
  /** "Put it onto the battlefield with X additional +1/+1 counters on it" (Vision Quest, CR 614.1c). */
  counters?: { counter: CounterKind; n: Amount };
}

/** Inclusive bounds; either end may be open. */
export interface Range {
  min?: number;
  max?: number;
  /** "With an even mana value" (zero is even), "with an odd mana value". */
  parity?: "even" | "odd";
}

/**
 * A chosen target. For objects, `zc` is its zoneChanges when chosen: if it has changed zones
 * since, it's a new object and no longer the target (CR 400.7, 608.2b).
 */
export type TargetChoice =
  /** `amount`: what it gets of an amount "divided as you choose" (CR 601.2d). */
  | { kind: "object"; id: ObjectId; zc?: number; amount?: number }
  | { kind: "player"; id: PlayerId; amount?: number }
  | { kind: "stack"; id: string }
  /** An "up to N" target left unchosen (CR 115.6, 601.2c). */
  | { kind: "none" };

/** A target that was actually chosen. */
export type ChosenTarget = Exclude<TargetChoice, { kind: "none" }>;

/** Which object(s) an effect touches. */
export type ObjRef =
  /** "Each creature that convoked ~" (Lethal Scheme): the `index`th creature tapped to convoke the resolving spell (CR 702.51a), while it's that permanent. */
  | { ref: "convoker"; index: number }
  /** "Each creature that convoked it" (Venerated Loxodon): all of them still on the battlefield, for its enters trigger the permanent's spell's. */
  | { ref: "convokers" }
  /** `n`: "up to two target creatures" is `n` targets in a row, starting at `index`. */
  | {
      ref: "target";
      index: number;
      n?: number;
      /**
       * "Target creature and all other creatures with the same name as that creature" (Maelstrom Pulse): also every other
       * permanent matching `filter` (controlled by the target's controller, `of`) with the target's name as this resolves.
       * Only the target is targeted; none are affected if it's illegal (CR 608.2b, rulings). A face-down permanent has no
       * name (CR 708.2a), so it shares one with nothing.
       */
      sameName?: { filter: TargetSpec; of?: true };
      /**
       * "Exile target creature card from a graveyard. Create a token that's a copy of it" (The Scarab God): the targeted
       * card wherever this spell or ability has put it since (CR 400.7), copied as that card (rulings).
       */
      card?: true;
    }
  | { ref: "self" } // the source permanent ("this creature")
  /** "That spell" in a cast trigger (Monstrous Vortex): the spell whose casting triggered it, as it was cast. Counts only. */
  | { ref: "castSpell" }
  /** "Each creature dealt damage this way" (Aurelia's Fury): `filter` for the kind of permanent. */
  | { ref: "damagedThisWay"; filter?: TargetSpec }
  /** The card a "whenever a creature dies" trigger was about, in the zone it went to, while it's still that object (CR 400.7). */
  | { ref: "subjectCard"; /** Only while it's in this zone ("exile that card from your graveyard"). */ zone?: "graveyard" } // "a creature dealt damage this way": what this ability's damage hit
  | { ref: "subject" } // the object its trigger event was about: exalted's "that creature" (see PendingTrigger.subject)
  /** "Whenever one or more tokens your opponents control enter, for each of them, ..." (Kambal): those that entered, while on the battlefield. */
  | { ref: "eventGroup" }
  /**
   * After a leaves-the-battlefield trigger: the card in the zone it went to, if it's still that object ("return it to your
   * hand"). `moved`: an Aura's "when enchanted creature dies, return this card ..." (Angelic Destiny), the Aura card in a
   * graveyard it went to from the battlefield then or since, while it's still there (rulings); `yours`: "from your
   * graveyard", only if that's its controller's (rulings on Screams from Within).
   */
  | { ref: "selfCard"; moved?: true; yours?: true }
  /** "Create a 0/0 Fractal creature token. Put X +1/+1 counters on it": the token(s) this ability just created. */
  | { ref: "created" }
  /** "The amassed Army" (CR 701.47c): the Army chosen by this ability's amass, or by the one whose reflexive trigger this is. */
  | { ref: "amassed" }
  /** "The sacrificed creature": what was sacrificed to cast the spell, as it last existed (CR 608.2h). */
  | { ref: "sacrificed" }
  /** The card "reveal the top card of your library" revealed, while it's still where it was (CR 400.7). */
  | { ref: "revealed" }
  /** The one card "exile the top card of your library" exiled, while it's still that card in exile (CR 400.7). */
  | { ref: "exiledTop" }
  /**
   * "Creatures you control get +1/+1 until end of turn. Untap those creatures": the permanents this resolution's last
   * continuous effect changed, locked in as it began (CR 611.2c), while they're still those objects on the battlefield.
   */
  | { ref: "affected" }
  /** Battle cry's "each other attacking creature". */
  | { ref: "allCreatures"; controller?: "you" | "opponent"; other?: boolean; attacking?: boolean }
  /** "Enchanted creature", "equipped creature": the permanent the source is attached to, while it's still that source. */
  | { ref: "attached" }
  /** Joint Assault's "if it's paired with a creature, that creature": what target `index` is paired with as this resolves (CR 702.95b). */
  | { ref: "pairedWithTarget"; index: number }
  /** "all creatures", "each artifact and enchantment", "other creatures you control": every permanent that matches, not targeted. */
  /**
   * `of`: "each creature target player controls", "all lands that player controls": only that player's permanents (if
   * it's still a legal target, CR 608.2b).
   */
  | { ref: "each"; filter: TargetSpec; other?: boolean; /** "Create X 1/1 Soldier tokens. ... destroy all other creatures" (Martial Coup): all but the tokens this resolution created. */ notCreated?: true; /** A spell's "other creatures you control" after "target creature you control": all but that target. */ otherThan?: number; of?: PlayerRef; /** "~ and other creatures you control": the source too, while it's still on the battlefield. */ andSelf?: true; /** "... that share a creature type with it" (Haunted One): with the source as it is, or last was, on the battlefield (CR 608.2h). */ sharesTypeWithSelf?: true; /** "That creature and each other creature you control that shares a creature type with it" (Holy Frazzle-Cannon): the trigger's subject too, the others not it and sharing a creature type with it, as it is or last was on the battlefield (CR 608.2h). */ andSubject?: true }
  /**
   * "The top creature card of your graveyard" (CR 404.1, rulings: the one put there most recently): the topmost card of
   * each player's graveyard that matches `filter`, as this resolves. `bottom`: the bottommost. `only`: "if the top card
   * of target player's graveyard is a creature card, put that card ...": the top card, only if it matches.
   */
  | { ref: "graveyardEnd"; who: PlayerRef; filter?: TargetSpec; bottom?: true; only?: true }
  /**
   * Krovikan Vampire's "that card": each creature card that died this turn after the source dealt it damage that turn,
   * while it's still that card in the graveyard (rulings: once it leaves, the game loses track of it).
   */
  | { ref: "diedDamagedBySelf" }
  /**
   * "Each permanent with the most votes or tied for most votes" (Council's Judgment), "each card with the most votes ..."
   * (Custodi Squire): what this ability's vote chose (CR 701.38), while each is still that object; none if no one voted.
   */
  | { ref: "voted" };

/** Which player(s) an effect touches. */
export type PlayerRef =
  | { ref: "you" }
  | { ref: "subjectController" } // the controller of the object the trigger was about, or as it last existed
  /** `n`: "any number of target players" covers the targets from `index` on (TargetSpec.many). */
  | { ref: "target"; index: number; n?: number }
  | { ref: "eachOpponent" }
  | { ref: "eachPlayer" }
  | { ref: "targetController"; index: number } // "its controller"
  /** "That player or that planeswalker's controller" (Bonfire of the Damned): the target player, or the target planeswalker's controller. */
  | { ref: "targetOrController"; index: number }
  | { ref: "targetOwner"; index: number } // "its owner": a targeted card's owner (Pharika's "Its owner creates ...")
  /** "That player" in "Whenever ~ deals combat damage to a player, that player discards a card". */
  | { ref: "eventPlayer" }
  /** "Each other opponent" after "Whenever ~ deals combat damage to an opponent": this ability's controller's opponents but that one. */
  | { ref: "otherOpponents" }
  /** The player this Aura is attached to ("enchanted player", CR 702.5d), as it last existed if it's gone. */
  | { ref: "enchantedPlayer" }
  /** "Each opponent attacking that player": each opponent of this ability's controller attacking the event player. */
  | { ref: "opponentsAttackingEventPlayer" }
  /** The players who chose to in the "each player may ..." being resolved (see the eachMay effect). */
  | { ref: "choseThisWay" }
  /** "Each opponent who didn't" (Kynaios and Tiro), "each player who doesn't": those not among choseThisWay, still in the game. */
  | { ref: "notChoseThisWay"; opponents?: true }
  /** The players who did none of a punisher's options (see the punisher effect). */
  | { ref: "punished" }
  /** "Each player who can't discards a card" (Plaguecrafter): those who had nothing to sacrifice for the "pick" before. */
  | { ref: "couldntPick" }
  /** Gift's "the chosen player": the opponent the gift was promised to (CR 702.174a). */
  | { ref: "giftee" }
  /** "Players dealt damage this way" (Aurelia's Fury): by this spell's or ability's damage so far. */
  | { ref: "damagedThisWay" }
  /**
   * "They" in "Each player loses 1 life for each creature they control" (Stronghold Discipline): the player the instruction
   * is being done to, one at a time.
   */
  | { ref: "eachOne" }
  /** "Choose an opponent. That player ...": the opponent chosen as this resolves (ChoiceKind "opponent"). */
  | { ref: "chosenPlayer" }
  /** "Whose controller was dealt combat damage by ~ this turn" (Steel Hellkite): the players this object dealt combat damage to this turn. */
  | { ref: "combatDamagedBySelf" };

export type DamageRecipient =
  | ObjRef
  | PlayerRef
  | { ref: "anyTarget"; index: number; /** "each of up to two targets" */ n?: number }
  /** "The player or planeswalker it's attacking" (Myr Battlesphere): what the source is attacking, or was as it last existed; nothing for a battle. */
  | { ref: "attackedBySelf"; subject?: true };

/**
 * What a "damageRule" effect makes (see GameState.damageRules). It applies to damage that matches both `to` and `by`
 * when it would be dealt, including to and by permanents that weren't there as it resolved: a prevention effect isn't
 * locked to a set of objects (CR 611.2c). `by.choose`: a source of the controller's choice, chosen as it resolves among
 * those that match then, and checked again when it would deal damage (CR 609.7a-b, 615.9).
 */
export interface DamageRuleSpec {
  combat?: "only" | "non";
  /** The damage it applies to, by who'd be dealt it: players, permanents matching `objects`, or a target. Unset = any. */
  to?: { players?: "you" | "opponents" | "all"; objects?: TargetSpec; target?: DamageRecipient };
  /** By which sources: matching `filter` (as the damage would be dealt), a source of your choice, a target spell or permanent. Unset = any. */
  by?: { filter?: TargetSpec; choose?: TargetSpec; target?: ObjRef };
  /** "Prevent the next N damage" (CR 615.7): a shield of N for all it applies to together. */
  n?: Amount;
  /** "The next time ... would deal damage": the next damage event only, however much (CR 615.8). */
  nextTime?: true;
  /** "... is dealt to [it] instead" (CR 614.9) rather than prevented. */
  redirect?: DamageRecipient;
  /** "You gain life equal to the damage prevented this way" (CR 615.5); `colors`: only for damage from a source of those colors. */
  gainLife?: { colors?: Color[] };
  /** "~ deals that much damage to that source's controller" (CR 615.5); `colors`: only for damage from a source of those colors. */
  dealBack?: { colors?: Color[] };
  /** "For each 1 damage prevented this way, create a ... token" (Inkshield, CR 615.5): its controller creates them. */
  tokens?: TokenSpec;
}

/** Does this reference cover target `i`? ("up to two target creatures" covers two in a row.) */
export const refCovers = (r: object, i: number): boolean =>
  "index" in r && typeof r.index === "number" && i >= r.index && i < r.index + ("n" in r && typeof r.n === "number" ? r.n : 1);

/** What a card's kicker-like cost is called (see CompiledCard.kicker). */
export const kickerName = (k: NonNullable<CompiledCard["kicker"]>): "kicker" | "multikicker" | "replicate" | "squad" | "offspring" =>
  k.replicate ? "replicate" : k.squad ? "squad" : k.offspring ? "offspring" : k.multi ? "multikicker" : "kicker";

export interface TokenSpec {
  name: string;
  /** Unset for noncreature tokens such as Treasure. */
  power?: number;
  toughness?: number;
  colors: Color[];
  types: string[]; // e.g. ["Artifact", "Creature"]
  subtypes: string[];
  keywords: string[];
  /** Rules text of other abilities, e.g. a Treasure's "{T}, Sacrifice this token: Add one mana of any color." */
  abilities?: string;
  /** A double-faced token's back face (CR 111.10i): an Incubator's Phyrexian. */
  back?: TokenSpec;
  /** A planeswalker token's printed loyalty (CR 306.5b). */
  loyalty?: number;
  /**
   * "Create Ragavan, a legendary 2/1 red Monkey creature token": `name` is the token's name as given (CR 111.4), not
   * its subtypes plus "Token", and it's legendary (CR 205.4d), so the legend rule applies to it (CR 704.5j).
   */
  named?: true;
  legendary?: true;
}

/**
 * One change made by a continuous effect. Each kind belongs to one layer (CR 613.1),
 * see `layerOf` in layers.ts. An effect can have parts in several layers (CR 613.6).
 */
/**
 * What can't target a permanent: spells and abilities (`spells`: only spells; `subtype`: "Aura spells") whose source matches. `opponents`: controlled
 * by an opponent of the permanent's controller; `colors`: from a source of one of these colors; `notColors`: from a source
 * that's none of these ("nongreen"). A spell's color is its own; an ability's is its source's (CR 113.7a).
 */
export interface Untargetable {
  opponents?: true;
  spells?: true;
  /** "Abilities your opponents control" (Shanna): not spells. */
  abilities?: true;
  colors?: Color[];
  notColors?: Color[];
  /** "Aura spells". */
  subtype?: string;
}

/**
 * A replacement effect that changes how much damage is dealt (CR 614.1a): "If a source you control would deal damage to a
 * permanent or player, it deals double that damage instead" (Angrath's Marauders), "... that much damage plus 2" (Torbran),
 * "... half that damage, rounded down" (Ghosts of the Innocent), "... minus 1" (Benevolent Unicorn). It applies to the
 * damage after it's divided or assigned (rulings), once per damage event (CR 614.5), and the player or controller of the
 * permanent being dealt it orders it with the other replacement and prevention effects (CR 616.1). It isn't prevention:
 * "damage can't be prevented" doesn't stop it (rulings on Ghosts of the Innocent).
 */
export interface DamageMod {
  /**
   * `times` multiplies by `n` (double, triple); `half` halves, rounded down (`up`: rounded up); `plus` / `minus` add or
   * take away `amount`; `allBut`: all but `n` of it; `prevent`: all of it.
   */
  op: "times" | "half" | "plus" | "minus" | "allBut" | "prevent" | /** "Deals damage equal to ~'s power instead" of less (Ojer Axonil): `amount`, when it's more. */ "raiseTo";
  n?: number;
  amount?: Amount;
  up?: true;
  /**
   * A prevention effect (CR 615.1a), not a replacement: Gisela's "prevent half that damage, rounded up", Rem Karolus's
   * "prevent that damage". "Damage can't be prevented" stops it (CR 615.12).
   */
  prevent?: true;
  /** Callous Giant: "If a source would deal 3 or less damage to ~": only to damage of at most this much. */
  atMost?: number;
  /**
   * What would deal the damage: any of `filters` (as it deals it, CR 609.7b); `self`: the permanent with the ability (for
   * an Aura or Equipment, the permanent it's attached to); `other`: not that permanent; `spell`: a spell, not a permanent.
   * Missing: any source.
   */
  by?: { self?: true; other?: true; filters?: { spec: TargetSpec; spell?: true }[]; /** A resolved effect's target or chosen source, as the object it was; `spell`: a spell, and the permanent it becomes (CR 609.7a). */ chosen?: { id: ObjectId; zc: number; spell?: true } };
  /**
   * What it would be dealt to: `players` ("enchanted": the player enchanted by the permanent with the ability; "chosen":
   * its chosen player), `objects` (a permanent matching it, "you" being the ability's controller), `self` (the permanent
   * with the ability), `chosenPermanents` (a permanent the chosen player controls). Missing: any permanent or player.
   */
  to?: { players?: "all" | "you" | "opponents" | "enchanted" | "chosen"; objects?: TargetSpec; self?: true; chosenPermanents?: true; /** "another permanent you control": not the permanent with the ability. */ other?: true; /** A resolved effect's "that player" and the permanents they control. */ player?: PlayerId; permanentsOf?: PlayerId };
  combat?: "only" | "non";
  /** The Rollercrusher Ride: "while there are four or more card types among cards in your graveyard". */
  while?: StaticCondition;
  /** "The next time ... would deal damage": the next damage event only (Dark Sphere, Impulsive Maneuvers). */
  nextTime?: true;
  text: string;
}

export type Modification =
  | { kind: "control" } // layer 2: the effect's controller controls it
  /** Layer 4, "in addition to its other types"; `allCreatureTypes`: "with all creature types" (Mutavault). */
  /** `chosenType`: also the creature type chosen as its source entered ("~ is the chosen type in addition to its other types"). */
  | { kind: "addTypes"; types: string[]; subtypes: string[]; supertypes?: string[]; allCreatureTypes?: true; chosenType?: true }
  | { kind: "setTypes"; types: string[]; subtypes: string[]; /** "Becomes a legendary 4/4 red Dragon creature" (Sarkhan, the Dragonspeaker): it gains these supertypes and keeps its others (CR 205.4b). */ supertypes?: string[] } // layer 4, "becomes a 3/3 Elemental creature": new card types replace the old (CR 205.1a)
  /** `chosenType`: the creature type chosen as its source entered instead ("creatures you control are the chosen type"). */
  | { kind: "setSubtypes"; subtypes: string[]; chosenType?: true } // layer 4, "becomes a Frog": replaces only subtypes of the same kind (CR 205.1a)
  /**
   * Layer 4, "Nonbasic lands are Mountains", "enchanted land is an Island": the land's land types become these basic
   * ones, and it loses the abilities from its rules text, gaining each basic type's mana ability instead (CR 305.7).
   */
  | { kind: "setLandTypes"; subtypes: string[] }
  | { kind: "loseTypes"; types: string[] } // layer 4, "stops being a creature": that type and its subtypes go (CR 702.151b)
  /** `chosen`: "becomes the color of your choice", the color chosen as it resolved. */
  | { kind: "setColors"; colors: Color[]; chosen?: true } // layer 5
  | { kind: "addColors"; colors: Color[] } // layer 5, "is blue in addition to its other colors"
  /** Layer 6. `spares`: "This effect doesn't remove ~": the protection it grants doesn't make its source fall off (Cho-Manno's Blessing). */
  /**
   * `sharedAmongYours`: "creatures you control gain first strike until end of turn if a creature you control has first
   * strike. The same is true for flying, ..." (Odric, Lunarch Marshal): of `keywords`, those a creature its controller
   * controls has as it resolves, a variant such as hexproof from white included (rulings).
   */
  | { kind: "addKeywords"; keywords: string[]; spares?: true; sharedAmongYours?: true }
  | { kind: "removeKeywords"; keywords: string[] } // layer 6
  | { kind: "loseAllAbilities" } // layer 6
  /**
   * Layer 6: 'has "{T}: Add one mana of any color."', 'gains "When ~ dies, ..." until end of turn'. The text
   * is a triggered, activated or mana ability in which "~" ("this creature") is the object that has it.
   * Text naming the granting card by name is about that card (CR 201.5a), so it isn't compiled.
   */
  | { kind: "addAbility"; text: string }
  | { kind: "setPT"; power: Amount; toughness: Amount } // layer 7b
  /** A characteristic-defining ability (CR 604.3): "~'s power and toughness are each equal to ...", layer 7a. */
  | { kind: "definePT"; power?: Amount; toughness?: Amount }
  | { kind: "modifyPT"; power: Amount; toughness: Amount } // layer 7c
  | { kind: "switchPT" } // layer 7d
  // Rules effects about what the object can do (CR 613.11), checked after the layers.
  | { kind: "cantAttack" }
  /** `ability`: "This creature can't block" as an ability it has (a suspected creature's, CR 701.60c), so in layer 6. */
  | { kind: "cantBlock"; ability?: true }
  | { kind: "cantBeBlocked" }
  /** "You may have ~ assign its combat damage as though it weren't blocked" (an ability, so layer 6). */
  | { kind: "unblockedDamage" }
  | { kind: "doesntUntap" }
  /** "Can't become suspected" (Airtight Alibi, CR 701.60): suspect effects don't apply to it. */
  | { kind: "cantBeSuspected" }
  /**
   * Ghostly Prison: "Creatures can't attack you unless their controller pays {2} for each creature they control that's
   * attacking you" (CR 508.1g-h): generic mana per creature attacking its controller.
   */
  /** Ghostly Prison: {n} per attacker; Sphere of Safety: {X}, a count (`amount`), attacking your planeswalkers too. */
  | { kind: "attackTax"; n: number; amount?: Amount; planeswalkers?: true }
  /** "Untap ~ during each other player's untap step" (CR 502.3). */
  | { kind: "untapsDuringOthers" }
  | { kind: "blocksOnlyFlyers" } // "can block only creatures with flying" (a blocking restriction, CR 509.1b)
  | { kind: "attacksIfAble" } // "attacks each combat if able" (an attack requirement, CR 508.1d)
  /**
   * Goaded by the effect's controller (CR 701.15b): it attacks each combat if able, and a player other than them if able.
   * `notGoaded`: the same requirements without goading it (Kardur, Doomscourge; Maximum Carnage rulings).
   */
  | { kind: "goad"; notGoaded?: true }
  /** "Can't have hexproof or shroud" (Arcane Lighthouse): no layer 6 effect gives them these, whatever its timestamp. */
  | { kind: "cantHaveKeywords"; keywords: string[] }
  /** "Attacks that opponent this turn if able" (encore, CR 702.141a): a requirement to attack that player (CR 508.1d). */
  | { kind: "mustAttackPlayer"; player: PlayerId }
  /** "Can't be blocked by creatures with power 2 or less", "by Walls", "by blue creatures" (CR 509.1b). */
  | { kind: "cantBeBlockedBy"; filter: TargetSpec }
  /** "Can't be the target of spells or abilities your opponents control", "... of black spells or abilities from black sources" (CR 115.4). */
  | { kind: "untargetable"; by: Untargetable }
  /**
   * "Can't be blocked except by creatures with flying", "... except by black creatures", "... except by Walls and/or
   * creatures with flying" (CR 509.1b): only a creature matching one of `filters` can block it.
   */
  | { kind: "blockableOnlyBy"; filters: TargetSpec[]; text: string }
  /**
   * "Prevent all damage that would be dealt to ~", "... dealt by enchanted creature", "... combat damage that would be
   * dealt to and dealt by ~ this turn" (CR 615.1): `to` and/or `by` it; `combat` "only" or "non" (noncombat);
   * `fromTypes`: only damage from sources with all these card types ("by creatures", "by artifact sources").
   */
  | { kind: "preventDamage"; to?: true; by?: true; combat?: "only" | "non"; fromTypes?: string[]; /** "Put a +1/+1 counter on that creature for each 1 damage prevented this way" (Vigor, CR 615.5): the ability's controller puts them. */ plusOnes?: true }
  /** "If a source you control would deal damage ..., it deals double that damage instead" (a replacement effect, CR 614.1a). */
  | { kind: "damageMod"; mod: DamageMod }
  /** "Damage that would be dealt by ~ can't be prevented" (CR 615.12); `combat`: combat damage only (Questing Beast). */
  | { kind: "unpreventable"; combat?: true }
  /** "Can't block creatures with power 2 or greater" (a blocking restriction on the blocker, CR 509.1b). */
  | { kind: "cantBlockCreatures"; filter: TargetSpec }
  /** "Can't be blocked by more than one creature" (CR 509.1b). */
  | { kind: "maxOneBlocker" }
  /** "Its activated abilities can't be activated" (Arrest), mana abilities included (CR 605.1a) unless `exceptMana`. */
  | { kind: "cantActivate"; exceptMana?: true }
  /** "Can't be blocked except by three or more creatures" (CR 509.1b; menace is the same with two, 702.111b). */
  | { kind: "minBlockers"; n: number }
  /** "Can't attack unless defending player controls an Island": checked per defending player (CR 508.1c). */
  | { kind: "cantAttackUnless"; defenderControls: TargetSpec }
  /**
   * "Creatures with power less than ~'s power can't block it" (CR 509.1b). `than: "source"`: less than the power of the
   * permanent with this ability, not the attacker's ("... can't block creatures you control", Champion of Lambholt).
   */
  | { kind: "cantBeBlockedByLesserPower"; than?: "source" }
  /** The Ring-bearer: "can't be blocked by creatures with greater power" (CR 701.54c). */
  | { kind: "cantBeBlockedByGreaterPower" }
  /** "Can't attack alone", "can't block alone" (CR 506.5, 508.1c, 509.1b). */
  | { kind: "cantAttackAlone" }
  | { kind: "cantBlockAlone" }
  /** "Can't attack a player it has already attacked this turn" (Port Razer): attacking a planeswalker still can (rulings). */
  | { kind: "cantAttackSamePlayer" }
  /** "Can't attack you or planeswalkers you control" (Promise of Loyalty, CR 508.1c): "you" is the effect's controller. */
  | { kind: "cantAttackYou" }
  /** "Can't attack its owner" (Alexios): that player, not their planeswalkers or battles (rulings). */
  | { kind: "cantAttackOwner" }
  /** "Can't be sacrificed" (CR 701.21): an instruction to sacrifice it does nothing; it can't be chosen to be sacrificed, for a cost either (rulings on Alexios). */
  | { kind: "cantBeSacrificed" }
  /** Blocking requirements (CR 509.1c): "must be blocked if able", "all creatures able to block ~ do so". */
  | { kind: "mustBeBlocked" }
  | { kind: "allMustBlock" }
  /**
   * Doran: "assigns combat damage equal to its toughness rather than its power" (CR 510.1a as modified); `ifGreater`
   * for "with toughness greater than its power", checked as the damage is assigned.
   */
  | { kind: "assignsToughness"; ifGreater?: true }
  /** "Can attack as though it didn't have defender" (CR 702.3b). */
  | { kind: "attackDespiteDefender" }
  /** "Target creature blocks this turn if able": it blocks some attacking creature if able (CR 509.1c). */
  | { kind: "mustBlock" }
  /**
   * "Can block an additional creature each combat", "an additional seven creatures", "any number of creatures":
   * how many attackers it may block (CR 509.1a). Additional ones add up (rulings).
   */
  | { kind: "blockAdditional"; n: number }
  | { kind: "blockAny" };

/** What a static ability's effect applies to. */
export type Affects =
  | { kind: "self" }
  | { kind: "attached" } // "enchanted creature", "equipped creature"
  /** Soulbond's "each of those creatures" / "both creatures": the source and the creature it's paired with (CR 702.95b). */
  | { kind: "paired" }
  | {
      kind: "filter";
      types: string[]; // all of these card types, e.g. ["Creature"]
      subtypes?: string[]; // any of these subtypes
      colors?: Color[]; // any of these colors
      /** `enchanted`: the player the source Aura enchants controls them ("creatures enchanted player controls"). */
      controller?: "you" | "opponent" | "enchanted";
      other?: boolean; // "other creatures ..." excludes the source
      /** Backgrounds' "Commander creatures you own" (CR 903.3): commanders owned by the source's controller. */
      ownedCommanders?: boolean;
      /** Anything more the group says: "with a +1/+1 counter on it", "of the chosen type", "with flying". */
      spec?: TargetSpec;
    };

/** A static ability that generates a continuous effect (CR 604.1, 611.3). */
export interface StaticAbility {
  affects: Affects;
  mods: Modification[];
  text: string;
  /** "As long as there are seven or more cards in your graveyard" (threshold): applies only while true. */
  condition?: StaticCondition;
  /**
   * "As long as ~ is in your graveyard and you control a Mountain, creatures you control have haste" (Anger): it works
   * only while its card is in its owner's graveyard (CR 113.6b), controlled by its owner (CR 108.4a).
   */
  zone?: "graveyard";
  /**
   * "The same is true for creature spells you control and creature cards you own that aren't on the battlefield"
   * (Maskwood Nexus, Conspiracy): its type change applies to those too (layers.ts offFieldTyped).
   */
  offField?: true;
}

/**
 * When a static ability applies ("as long as ..."): threshold's "seven or more cards in your graveyard",
 * unleash's "as long as it has a +1/+1 counter on it" (CR 702.98a), metalcraft's "three or more
 * artifacts", delirium's "four or more card types among cards in your graveyard", and so on.
 */
export type StaticCondition =
  | { kind: "graveyardAtLeast"; n: number }
  /** "If you haven't added mana with this ability this turn" (Carpet of Flowers): the source's addMana with `markSource` this turn. */
  | { kind: "addedManaThisTurn"; not?: true }
  /** Krovikan Vampire: "if a creature dealt damage by ~ this turn died" (see TurnLog.diedDamaged). */
  | { kind: "damagedBySelfDied" }
  /** "If that creature was dealt excess damage this turn" (CR 120.10): the trigger's subject, as the object it was. */
  | { kind: "subjectDealtExcess" }
  /**
   * Guardian Project: "if it doesn't have the same name as another creature you control or a creature card in your
   * graveyard", about the creature that entered. A face-down creature has no name (CR 708.2), so it shares none (rulings).
   */
  | { kind: "subjectNameUnique" }
  /** "If it wasn't put onto the battlefield with this ability" (Kodama of the East Tree): the entering permanent (GameObject.putBy). */
  | { kind: "subjectPutBySelf"; not?: true }
  /** Rith: "if a creature or planeswalker an opponent controlled was dealt excess damage this turn" (any of `types`). */
  | { kind: "opponentsDealtExcess"; types: string[] }
  /**
   * Aegar: "if a Giant, Wizard, or spell you controlled dealt damage to it this turn": the trigger's subject was dealt
   * damage this turn by a source you controlled then that was a spell or had one of `subtypes`.
   */
  | { kind: "subjectDamagedBy"; subtypes: string[]; spell: boolean }
  /** A number compared to fixed bounds: "as long as your devotion to black is less than five" (Theros gods, CR 700.5). */
  | { kind: "amount"; amount: Amount; min?: number; max?: number }
  /** "If ~ is in your graveyard" (`creatureAbove`: "with a creature card directly above it", Krovikan Horror). */
  | { kind: "selfInGraveyard"; creatureAbove?: true }
  /** Delirium: card types among cards in your graveyard (CR 205.2a). */
  | { kind: "graveyardTypes"; n: number }
  /** Descend: permanent cards in your graveyard (CR 110.4b). */
  | { kind: "graveyardPermanents"; n: number }
  | { kind: "selfCounter"; counter: CounterKind }
  /** A level symbol's "at least N1 and no more than N2 level counters" (CR 711.2), a station symbol's "N or more charge counters" (CR 721.2). */
  | { kind: "selfCounters"; counter: CounterKind; min: number; max?: number }
  /** A Class's level (CR 716.2a): at least `min`, at most `max`; a permanent without a level is level 1 (716.2d). */
  | { kind: "classLevel"; min: number; max?: number }
  /** "As long as it's attacking", "it's enchanted / equipped", "it's modified" (CR 700.9), "if it devoured a creature" (CR 702.82b). */
  /** `controlledThisTurn`: "it came under your control this turn" (CR 302.6). `hasCounter`: a counter of any kind on it. `not`: "~ didn't attack this turn" (Air Nomad Student). */
  | { kind: "self"; is: "attacking" | "attackingAlone" | "enchanted" | "equipped" | "modified" | "devoured" | "attachedToCreature" | "tapped" | "untapped" | "monstrous" | "escaped" | "attackedThisTurn" | "attackedBattleThisTurn" | "saddled" | "enteredThisTurn" | "onBattlefield" | "controlledThisTurn" | "hasCounter" | "prepared"; not?: true }
  /**
   * "If ~ is a Warrior, ..." (Figure of Destiny): its source as it is now, with every effect applied (CR 608.2c). Only an
   * instruction's condition, checked as it resolves: a static ability's condition about its own types would depend
   * on the layers being worked out.
   */
  | { kind: "selfIs"; filter: TargetSpec }
  /** A trigger's "if its toughness is 3 or less" about its own source (Young Hero Role, CR 603.4): power or toughness now. */
  | { kind: "selfPT"; stat: "power" | "toughness"; min?: number; max?: number }
  /** "Draw a card if its power is 3 or greater" about a trigger's subject (Tribute to the World Tree): as it is now, or as it last existed (CR 608.2h). */
  /** `greatest`: "if its power is greater than each other creature's power" (Selvala, Heart of the Wilds), creatures on the battlefield now. */
  | { kind: "subjectPT"; stat: "power" | "toughness"; min?: number; max?: number; greatest?: true }
  /** "Activate only if ~ entered this turn or if you control a basic land": either one. */
  | { kind: "anyOf"; conds: StaticCondition[] }
  /** Coven: "if you control three or more creatures with different powers" (three or more different power values). */
  | { kind: "coven" }
  /**
   * "If an opponent controls more lands than you", "... more creatures than you", "an opponent has more life than you",
   * "... more cards in hand than you": any one opponent.
   */
  /** `subjectController`: "if that player controls more lands than you", that player being the entering land's controller. */
  | { kind: "opponentMore"; what: "lands" | "creatures" | "life" | "hand"; subjectController?: true; /** "That player" is the active player, an opponent (Keeper of the Accord). */ activePlayer?: true }
  /** "You control the creature with the greatest power or tied for the greatest power" (Triumph of Ferocity), "the artifact with the greatest mana value ..." (Padeem): among all on the battlefield. */
  | { kind: "controlGreatest"; type: "Creature" | "Artifact"; stat: "power" | "toughness" | "manaValue" }
  /** "As long as you have the city's blessing" (CR 702.131c). */
  | { kind: "citysBlessing"; /** "Unless you have the city's blessing". */ not?: true }
  /** "If it's your turn"; `not`: "if it's not your turn" (Force of Negation). */
  | { kind: "yourTurn"; not?: true }
  /** "If it isn't that player's turn" (Tataru Taru): the trigger's event player is (not) the active player. */
  | { kind: "eventPlayersTurn"; not?: true }
  /**
   * "Activate only during your turn, before attackers are declared": your turn, before its declare attackers step
   * begins (rulings: before the first combat's declare attackers step; there's one combat a turn here).
   */
  | { kind: "beforeAttackers" }
  /** "As long as you're the monarch" (CR 725). */
  | { kind: "monarch" }
  /** "If ~ is suspected" (CR 701.60); `not`: "if it's not suspected". */
  | { kind: "suspected"; not?: true }
  /** "If you have the initiative" (CR 726.1). */
  | { kind: "initiative" }
  /**
   * "As long as you've completed a dungeon" (CR 309.7), in this game, whenever it was (rulings on Nadaar); `name`: "if you
   * haven't completed Tomb of Annihilation" (with `not`).
   */
  | { kind: "completedDungeon"; name?: string; not?: true }
  /**
   * "If you control a commander" (CR 903.3): any player's commander you control (rulings on Fierce Guardianship);
   * `types`: "a commander that's a creature or planeswalker", one of them.
   */
  | { kind: "controlCommander"; types?: string[]; /** Lieutenant's "if you control your commander": one you own (CR 903.3). */ own?: true }
  /** "If you have a full party" (CR 700.8a): four creatures in your party. */
  | { kind: "fullParty" }
  /** "If you don't control a Ring-bearer" (CR 701.54e); `self`: "as long as ~ is your Ring-bearer". */
  | { kind: "ringBearer"; not?: true; self?: true }
  /** Max speed (CR 702.178a, 702.179e): your speed is 4. */
  | { kind: "maxSpeed" }
  /** "∞ — [Ability]": as long as this permanent is harnessed (CR 702.186b). */
  | { kind: "harnessed" }
  /**
   * "Whenever ~ attacks a player, if no opponent has more life than that player": none of the attacking player's
   * opponents has more life than the attacked player (rulings; the attacker's own life isn't compared).
   */
  | { kind: "defenderMostLife" }
  /** "Unless it's paired with a creature with soulbond" (CR 702.95b): `not` for "unless". */
  | { kind: "paired"; withKeyword?: string; not?: true }
  /** Morbid: "if a creature died this turn" (CR 700.4); `n`: "if two or more creatures died this turn"; `yours`: "under your control". */
  | { kind: "creatureDied"; n?: number; yours?: true }
  /**
   * "If no creatures are on the battlefield", "if four or more creatures are attacking" (Arrow Volley Trap), "if there are
   * thirteen or more creatures on the battlefield": how many permanents matching `filter` there are, under anyone's control.
   */
  | { kind: "onBattlefield"; filter: TargetSpec; max?: number; min?: number }
  /** "If an opponent lost life this turn". */
  /** "If an opponent lost life this turn"; `n`: "lost 2 or more life this turn", one opponent alone (rulings on Bloodchief Ascension). */
  | { kind: "opponentLostLife"; n?: number }
  /**
   * "If you haven't been dealt combat damage since your last turn" (Marchesa, Resolute Monarch): none from the start of
   * your previous turn (Player.lastTurnBegan; the whole game if you haven't had one) until now.
   */
  | { kind: "noCombatDamageSinceLastTurn" }
  /** "If an opponent was dealt 7 or more damage this turn" (Spinerock Knoll): in total, from any sources (rulings). */
  | { kind: "opponentDealtDamage"; n: number }
  /** "If you attacked with three or more creatures this turn" (Windbrisk Heights): different creatures you declared as attackers. */
  | { kind: "attackedWith"; n: number }
  /** "If you've drawn two or more cards this turn"; `opponent`: "if an opponent drew three or more cards this turn" (Runeflare Trap). */
  | { kind: "drawn"; n: number; opponent?: true }
  /** "If you descended this turn": a permanent card was put into your graveyard this turn (CR 700.11). */
  | { kind: "descended" }
  /** Revolt: "if a permanent left the battlefield under your control this turn". */
  | { kind: "revolt" }
  /** Void: "if a nonland permanent left the battlefield this turn or a spell was warped this turn". */
  | { kind: "void" }
  /**
   * The Traps' "this turn" conditions (Zendikar), checked as the spell is cast (CR 601.2b) against what happened this
   * turn (GameState.turnLog): "if an opponent searched their library this turn" (Archive Trap; only an effect that says
   * "search", rulings).
   */
  | { kind: "opponentSearched" }
  /**
   * "If an opponent had an artifact enter the battlefield under their control this turn" (Baloth Cage Trap), "two or more
   * lands" (Lavaball Trap), "a green creature" (Permafrost Trap), "two or more creatures" (Whiplash Trap): permanents
   * that entered under one opponent's control, as they entered, with all of `types` and `color`.
   */
  | { kind: "opponentEntered"; types: string[]; color?: Color; n: number }
  /**
   * "If a noncreature permanent under your control was destroyed this turn by a spell or ability an opponent controlled"
   * (Cobra Trap): only an effect that says "destroy" (rulings), not lethal damage or sacrifice.
   */
  | { kind: "destroyedByOpponent" }
  /** "If you've been dealt damage by two or more creatures this turn" (Inferno Trap): different creatures, anyone's (rulings). */
  | { kind: "damagedByCreatures"; n: number }
  /** "If an opponent gained life this turn" (Needlebite Trap): whether or not they also lost life (rulings). */
  | { kind: "opponentGainedLife" }
  /** "If an opponent had three or more cards put into their graveyard from anywhere this turn" (Ravenous Trap): cards, not tokens. */
  | { kind: "opponentCardsToGraveyard"; n: number }
  /**
   * "If an opponent cast a blue spell this turn" (Ricochet Trap), "if an opponent has cast a blue or black spell this
   * turn" (Veil of Summer): one of these colors, the spell's colors as it was cast.
   */
  | { kind: "opponentCast"; colors: Color[] }
  /** "If an opponent cast three or more spells this turn" (Mindbreak Trap): one opponent, that many (rulings). */
  | { kind: "opponentCastCount"; n: number }
  /** "If you have no land cards in hand" (Land Grant). */
  | { kind: "noneInHand"; filter: TargetSpec }
  /**
   * "As long as you have 25 or more life", fateful hour's "5 or less life", "at least 7 life more than your starting life
   * total", "your life total is greater than or equal to your starting life total" (CR 903.7: 40): your life total now.
   */
  /** `opponent`: an opponent's life total instead (Bloodghast's "an opponent has 10 or less life"). */
  | { kind: "life"; min?: number; max?: number; opponent?: true }
  /** "As long as equipped creature is a Human": the permanent this is attached to matches. */
  | { kind: "attachedIs"; filter: TargetSpec }
  /** "If you have nine or more cards in hand" (Wiretapping). */
  | { kind: "handAtLeast"; n: number; /** "exactly thirteen cards in your hand" (Triskaidekaphile). */ exactly?: true; /** "Fewer than seven cards in hand" (Kozilek): under `n`. */ fewer?: true }
  /** "If you control eight or more artifacts with the same name as one another" (Mechanized Production, CR 201.2a). */
  | { kind: "sameNamed"; types: string[]; n: number }
  /** "If each player has no cards in hand" (Howltooth Hollow). */
  | { kind: "handsEmpty" }
  /** "If creatures you control have total power 10 or greater" (Mosswort Bridge). */
  | { kind: "totalPower"; n: number }
  /** "If a library has twenty or fewer cards in it": any player's (Shelldock Isle). */
  /** `yours`: "if your library has no cards in it" (Jace, Wielder of Mysteries): your library only. */
  | { kind: "libraryAtMost"; n: number; yours?: true }
  /** Corrupted: "as long as an opponent has three or more poison counters" (CR 122.1f). */
  | { kind: "opponentPoison"; n: number }
  /** Raid: "if you attacked this turn" (with one or more creatures); `not`: "if you didn't attack with a creature this turn" (Curious Obsession). */
  | { kind: "attackedThisTurn"; not?: true }
  /** "If you've committed a crime this turn" (CR 700.13). */
  | { kind: "committedCrime" }
  /** A Case's solved designation (CR 719.3b): "Solved — [ability]" (702.169); `not`: a "To solve" trigger's "this Case is not solved" (719.3a). */
  | { kind: "solved"; not?: true }
  /** "[Anchor word] — [ability]": as long as that word was chosen as it entered (CR 614.12b, the Sieges). */
  | { kind: "anchor"; word: string }
  /** "Three or more creature cards were put into graveyards from anywhere this turn": cards, anyone's, with all of `types` (as cards in the graveyard). */
  | { kind: "cardsToGraveyard"; n: number; types: string[] }
  /** "Three or more sources you controlled dealt damage this turn": different sources, as the objects they were (CR 400.7), controlled by you as they dealt it. */
  | { kind: "sourcesDealtDamage"; n: number }
  /** "If a creature card was put into your graveyard from anywhere this turn" (Cloakwood Hermit): one of these types. */
  | { kind: "cardToYourGraveyard"; types: string[] }
  /** "If a source you controlled dealt 5 or more damage this turn" (Dragon Cultist): all of it from one source (rulings). */
  | { kind: "sourceDealtAtLeast"; n: number }
  /** "Red sources you controlled dealt 4 or more noncombat damage this turn" (Temple of Power). */
  | { kind: "noncombatByColor"; color: Color; n: number }
  /** "You've cast four or more instant and sorcery spells this turn": your spells this turn matching `filter` as they were cast. */
  | { kind: "castCount"; n: number; filter: TargetSpec }
  /** "There are five colors among permanents you control" (CR 105.2). */
  | { kind: "colorsAmong"; n: number }
  /** "You've gained 5 or more life this turn": in total. */
  | { kind: "lifeGainedThisTurn"; n: number }
  /**
   * "If no spells were cast last turn" (`none`), "if a player cast two or more spells last turn" (`onePlayer`: by a single
   * player, rulings): the whole previous turn (GameState.lastTurn).
   */
  | { kind: "castLastTurn"; none?: true; onePlayer?: number }
  /**
   * "If it's your main phase", "if it's your combat phase" (CR 505.1, 506.1), "if it's the first combat phase of the
   * turn" (`first`; "of your turn": `yours` too).
   */
  | { kind: "phase"; phase: "main" | "combat"; yours?: true; first?: true }
  /** "If it's attacking the player with the most life or tied for most life" (Scourge of the Throne; dethrone's test, CR 702.105a). */
  | { kind: "attackingMostLife" }
  /** "~ costs {2} less to cast if you've cast another spell this turn": checked as it's cast, before it counts itself (CR 601.2f). */
  | { kind: "castAnother" }
  /** Increment (CR 702.191a): it's a creature and the mana spent on the spell (the event's amount) is greater than its power or toughness. */
  | { kind: "increment"; /** "If the amount of mana spent to cast that spell is greater than ~'s power" (Liberator): power only. */ powerOnly?: true }
  /** "If that player has two or fewer cards in hand": the trigger's player (whose upkeep it is), checked as it triggers and resolves (CR 603.4). */
  | { kind: "eventPlayerHand"; max?: number; min?: number }
  /**
   * "As long as you control three or more artifacts / another Wizard / no untapped lands", "as long as
   * an opponent controls an Island", "as long as defending player controls an artifact".
   */
  | { kind: "control"; who: "you" | "opponent" | "defending"; filter: TargetSpec; min?: number; max?: number; other?: boolean; /** "Five other Mountains" after "Whenever a Mountain you control enters" (Valakut): other than the one that entered (rulings). */ otherThanSubject?: true; /** "Lands with different names" (Field of the Dead): each name counted once. */ differentNames?: true }
  /** "If an opponent controls an Island and you control a Mountain" (Mogg Salvage): all of them at once. */
  | { kind: "allOf"; conds: StaticCondition[] }
  /**
   * "Cast ~ only during combat", "Activate only during your upkeep" (CR 506.8, 601.3, 602.5b): the part of the turn
   * it may be cast or activated in; `turn`: "your" or "an opponent's" (upkeep, end step, combat, declare attackers step).
   */
  | { kind: "during"; window: TimingWindow; turn?: "you" | "opponent" }
  /**
   * "Only if you've been attacked this step", with "during the declare attackers step": a creature declared as an
   * attacker this step attacks you, not only planeswalkers you control (rulings on Heavy Fog).
   */
  | { kind: "attackedThisStep" }
  /**
   * "If you both own and control ~ and a creature named [its meld counterpart]" (CR 701.42, 712.5): an intervening if
   * on a meld card's meld trigger (meld.ts). The counterpart's name is from the card's copiable values.
   */
  | { kind: "meldPartner"; type: "Creature" | "Land" | "Artifact" };

/** A restriction naming a part of the turn (CR 506.8, 602.5b): "only during your upkeep", "only during combat". */
export const timedCondition = (c: StaticCondition | undefined): boolean =>
  !!c && (c.kind === "during" || c.kind === "attackedThisStep" || ((c.kind === "allOf" || c.kind === "anyOf") && c.conds.some(timedCondition)));

/**
 * When a restricted spell or ability may be used (CR 506.8): "upkeep", "end" (end step), "afterUpkeep" (the steps after
 * the upkeep), "combat" (any step of a combat phase, 506.8c), "combatBeforeBlocks" (beginning of combat and declare
 * attackers), "combatAfterBlocks" (once blockers are declared, 506.8f: not in a combat whose declare blockers step was
 * skipped), and the steps "declareAttackers", "declareBlockers" and "endCombat", once their turn-based actions are done.
 */
export type TimingWindow = "upkeep" | "draw" | "end" | "afterUpkeep" | "combat" | "combatBeforeBlocks" | "combatAfterBlocks" | "declareAttackers" | "declareBlockers" | "endCombat" | TurnPoint;

/**
 * "Only before combat", "only before attackers are declared", "only before blockers are declared", "only before the
 * combat damage step", "only after combat" (CR 506.8a-b, d-e): without "during combat", the point is the one in the
 * turn's first combat phase, so the windows run from the start of the turn, or after that first combat.
 */
export type TurnPoint = "beforeCombat" | "beforeAttackers" | "beforeBlockers" | "beforeDamage" | "afterCombat";

export type Effect =
  /** `also`: more recipients dealt the same damage at the same time ("to each creature and each player", CR 120.3). */
  /**
   * `divided`: each target of `to` is dealt the part of the amount chosen for it (CR 601.2d). `evenly`: "divided evenly,
   * rounded down, among any number of targets" (Fireball): among the targets still legal as it resolves, nothing chosen.
   */
  | {
      type: "damage";
      amount: Amount;
      to: DamageRecipient;
      also?: DamageRecipient[];
      divided?: true;
      evenly?: true;
      /** "The damage can't be prevented." (CR 615.12) */ unpreventable?: true;
      /** "It deals ..." after "Whenever a commander you control deals combat damage" (Kediss): the trigger's creature deals it, as it last existed if it's gone (CR 608.2h). */
      /** `target`: "Target creature you control deals damage equal to its power to each other creature" (Chandra's Ignition): that target, if still legal. */
      by?: "subject" | { target: number };
      /** "Excess damage is dealt to that creature's controller instead" (Flame Spill): the damage beyond lethal goes there (CR 120.4a). */
      excessToController?: true;
    }
  /**
   * "Each creature deals 1 damage to its controller" (Rakdos Charm): each of those permanents is the source of its own
   * damage, all dealt at the same time (CR 120.3, 120.4).
   */
  | { type: "eachDealsDamage"; what: ObjRef; amount: Amount; toController: true }
  | { type: "draw"; who: PlayerRef; n: Amount }
  /** "Its controller may draw up to two cards" (Arcane Denial): each player chooses how many, 0 to `n`, before drawing (rulings). */
  | { type: "drawUpTo"; who: PlayerRef; n: number }
  /** "Put your commander into your hand from the command zone" (Command Beacon): one of yours there, chosen with two (rulings). */
  | { type: "commanderToHand" }
  | { type: "gainLife"; who: PlayerRef; n: Amount }
  /** `drain`: "You gain life equal to the life lost this way" (extort, CR 702.101a; Gray Merchant). */
  | { type: "loseLife"; who: PlayerRef; n: Amount; drain?: boolean }
  /**
   * "Exchange life totals with target opponent", "two target players exchange life totals" (CR 701.12c): each gains or
   * loses the life needed to reach the other's previous total; if either part can't happen, neither does (701.12a).
   */
  | {
      type: "exchangeLife";
      a: PlayerRef;
      b: PlayerRef;
      /** "If the difference between your life total and target player's life total is 5 or less" (Psychic Transfer), as it resolves. */
      maxDiff?: number;
    }
  | { type: "destroy"; what: ObjRef; noRegen?: boolean } // "It can't be regenerated."
  /** "Regenerate ~": a shield that replaces its next destruction this turn (CR 701.19a). */
  | { type: "regenerate"; what: ObjRef }
  /**
   * `until`: "exile target creature until ~ leaves the battlefield" (CR 610.3): it comes back under its
   * owner's control right after the source leaves, and isn't exiled at all if the source left first.
   */
  /**
   * `linked`: the card's "return the exiled card" ability (CR 607.2a) returns what this exiled, see
   * returnLinked. `until`: it comes back right after the source leaves, without a trigger (CR 610.3).
   */
  | {
      type: "exile";
      what: ObjRef;
      until?: "sourceLeaves";
      linked?: boolean;
      /**
       * "For as long as that card remains exiled, its owner may cast it" (Aerial Extortionist), "... may play it" (`play`),
       * "... without paying its mana cost" (`free`), airbend's "for {2} rather than its mana cost" (`cost`, CR 701.65a);
       * "A spell cast (by an opponent) this way costs {2} more to cast" (`more`, `moreOpponents`). A token can't be cast.
       */
      ownerMay?: { play?: true; free?: true; cost?: string; more?: number; moreOpponents?: true };
    }
  /**
   * "Target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to
   * its mana cost." (Snapcaster Mage), "each instant and sorcery card in your graveyard ..." (Past in Flames): only the
   * cards there as it resolves (rulings). A card with no mana cost can't be cast this way (rulings).
   */
  | { type: "grantFlashback"; what?: ObjRef; each?: TargetSpec }
  /** "Return the exiled card to the battlefield under its owner's control": the cards this object's linked exile took (CR 607.2a). */
  | { type: "returnLinked"; dest: "battlefield" | "hand" }
  /**
   * "The exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card"
   * (Skyclave Apparition): the cards this object's linked exile took (CR 607.2a) that are still in exile. Each of their
   * owners creates one token, X the total mana value of all of them (rulings).
   */
  | { type: "linkedExileToken"; token: TokenSpec }
  /**
   * Cards exiled face down, linked to the source (CR 406.3, 607.2a): `top`, the top `n` of your library (Duplicity);
   * `hand`, all cards from your hand; `handCard`, one card you choose from your hand (Gustha's Scepter). `look`: its
   * controller may look at them while they remain exiled; otherwise nobody may (Duplicity rulings).
   */
  /**
   * Cards exiled face down (CR 406.3): only its controller may look at them, if `look` (Gustha's Scepter) or if they may
   * play them (`play`: Three Wishes, Gonti, Outrageous Robbery). `who`: whose library ("the top card of that player's
   * library"); yours by default. `upkeepGraveyard`: "At the beginning of your next upkeep, put any of those cards you
   * didn't play into your graveyard" (Three Wishes).
   */
  | { type: "exileFaceDown"; from: "top" | "hand" | "handCard"; n?: Amount; look?: true; who?: PlayerRef; play?: FaceDownPlay; upkeepGraveyard?: true; /** "Put that card into your hand at the beginning of your next end step" (Necropotence). */ endStepHand?: true }
  /**
   * Cards exiled with ~ (CR 607.2a): "Put all cards exiled with ~ into their owner's graveyard", "Return a card you own
   * exiled with ~ to your hand" (`one`, `yours`), "put all other cards you own exiled with ~ into your hand" (`other`:
   * not those exiled earlier in this resolution).
   */
  | { type: "moveLinked"; dest: "hand" | "graveyard"; one?: true; yours?: true; other?: true }
  /**
   * Memory Jar: "At the beginning of the next end step, each player ... returns to their hand each card they exiled this
   * way": the cards the ability exiled face down (`cards`, filled in as the delayed trigger is made), if they're still
   * the same objects in exile (CR 400.7).
   */
  | { type: "returnFaceDownExiled"; cards?: { id: ObjectId; zc: number }[] }
  /**
   * Hideaway N (CR 702.75a): look at the top N cards of your library, exile one of them face down (linked to this
   * permanent, CR 607.2a), and put the rest on the bottom of your library in a random order.
   */
  | { type: "hideaway"; n: number }
  /**
   * "You may play the exiled card without paying its mana cost": the card this permanent's hideaway exiled, as this
   * resolves. A land only on your turn with a land play left (CR 305.2-3, rulings on Evercoat Ursine).
   */
  | { type: "playLinked"; /** Kinship's "you may play that card without paying its mana cost" (Leaf-Crowned Elder): the revealed card, from the library. */ revealed?: true }
  /** Cipher's spell ability (CR 702.99a): if this spell is a card, you may exile it encoded on a creature you control. */
  | { type: "cipher" }
  /**
   * The ability cipher grants the creature a card is encoded on (CR 702.99a): "you may copy the encoded card and you may
   * cast the copy without paying its mana cost". `card`/`zc`: that card, as it is in exile.
   */
  | { type: "castCipher"; card: ObjectId; zc: number }
  /**
   * Paradigm's delayed trigger (CR 702.192a): "create a copy of this object in exile. You may cast the copy without
   * paying its mana cost". `card`: the card definition (GameState.cards) it copies; the card itself may be gone (rulings).
   */
  | { type: "castParadigm"; card: string }
  /**
   * Haunt's triggered ability (CR 702.55a): "exile it haunting target creature" (target 0). "It" is this card in the
   * graveyard it was just put into; it does nothing if the card left (CR 400.7).
   */
  | { type: "haunt" }
  /**
   * "Sacrifice a creature", "each opponent sacrifices a creature of their choice", "return a land you
   * control to its owner's hand": each player picks n of their own permanents that match, in APNAP order,
   * then they're all sacrificed or returned at once (CR 101.4, 701.21). Not targeted.
   */
  /** Empower Jace N (CR 701.71a): create a 0-loyalty Jace planeswalker token if you control none, then put N loyalty counters on a Jace planeswalker token you control. */
  | { type: "empowerJace"; n: Amount }
  | { type: "pick"; who: PlayerRef; filter: TargetSpec; n: Amount; action: PickAction; /** "Sacrifice any number of other creatures" (God-Eternal Bontu): as many as they like, none too; `n` is ignored. */ anyNumber?: true; /** "Return half the creatures they control" (Split the Party): `who` picks among this player's permanents, not their own. */ among?: PlayerRef; /** For "counters": "put two +1/+1 counters on a creature you control". */ counter?: { kind: CounterKind; n: Amount }; /** Bolster: only among those with the least toughness (CR 701.39a). */ least?: "toughness"; /** "One of those Dragons" (Zurgo and Ojutai): only among the trigger's group (TriggerEventInfo.group), not targeted. */ fromGroup?: true; /** "A creature with the greatest power among creatures they control", "a creature or planeswalker with the greatest mana value among creatures and planeswalkers they control": only those, or tied for it. */ greatest?: "power" | "manaValue"; /** "Unless they pay {3}": each player may pay to be left out. */ unless?: UnlessPays }
  /**
   * "Sacrifice an artifact, a creature, and a land", "target player sacrifices an artifact and a land of their choice":
   * one permanent for each of `filters`, all different (a permanent sacrificed once can't be sacrificed again, like the
   * rulings on returning "an artifact, a creature, ..." with Linessa), as many as possible (CR 609.3). Each player picks
   * theirs in APNAP order, then they're all sacrificed at once (CR 101.4).
   */
  | { type: "sacrificeEach"; who: PlayerRef; filters: TargetSpec[] }
  /**
   * "Each player chooses an artifact, a creature, an enchantment, and a land from among the permanents they control, then
   * sacrifices the rest" (Cataclysm): each player in turn order chooses, for each of `keep`, that many of their
   * permanents matching both it and `among` (all of them if they have no more, or any number up to it with `upTo`); one
   * permanent may be chosen for several (rulings). Then every unchosen permanent matching `among` is sacrificed at once.
   * `youChoose`: you make every player's choices (Mythos of Snapdax).
   */
  | {
      type: "keepRest";
      who: PlayerRef;
      /** `fewest`: "a number of lands they control equal to the number of lands controlled by the player who controls the fewest" (Restore Balance), counted as it resolves; `n` is unused then. */
      keep: { filter: TargetSpec; n: number; upTo?: true; fewest?: true }[];
      among: TargetSpec;
      youChoose?: true;
      /** "Each player puts a vow counter on a creature they control and sacrifices the rest" (Promise of Loyalty): one on each kept permanent first; they're "those creatures" afterwards (Resolving.created). */
      counter?: CounterKind;
    }
  /** Mount Doom: "Choose up to two creatures, then destroy the rest": the controller picks up to `n` among every player's (not targeted). */
  | { type: "keepDestroyRest"; filter: TargetSpec; n: number }
  /** Return to owner's hand (from the battlefield or a graveyard). `hidden`: a face-down card, named only to its owner. */
  | { type: "bounce"; what: ObjRef; hidden?: true }
  /** "Return target creature card from your graveyard to the battlefield": enters under the effect controller's control (CR 110.2a). */
  /**
   * "You may put a land card from your hand onto the battlefield": the player picks one (or, with `any`, any number) of
   * the cards in their hand that match; without `may`, one if they have one. Not an Aura: that would need a choice of
   * what it enchants (CR 303.4f).
   */
  /** `attacking`: "tapped and attacking" (CR 508.4), attacking a player its controller chooses (rulings on Kinscaer Sentry). */
  /**
   * `lesserPower`: "a creature card with lesser power" than the source, or its last known power (rulings on Shadowfax).
   * `attackingEvent`: "tapped and attacking that opponent" (Kaalia): the player the trigger's creature attacked, if
   * they're still in the game (rulings). `haste`, `atEndStep`: "That creature gains haste. Sacrifice the creature at the
   * beginning of the next end step" (Sneak Attack), "Return that creature to your hand at ..." (Ilharg): about the
   * permanent it became, while it still is (CR 400.7, rulings).
   * `who`: "Each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield"
   * (Show and Tell, Iwamori, Tempting Wurm): each of them chooses in APNAP order without revealing the card (CR 101.4a),
   * then all the chosen cards enter at the same time; those who put one are choseThisWay afterwards.
   */
  /**
   * "Reveal any number of red cards in your hand" (Scent of Cinder, Cinder Seer), "reveal any number of Dragon cards from
   * your hand" (Invasion of Tarkir): you choose which (CR 701.20a), and "for each card revealed this way" counts them
   * (Count "revealedFromHand"). With `bottom`, "put any number of cards from your hand on the bottom of your library"
   * (Valakut Awakening), the first pick lowest, and "that many" counts them (Count "bottomedFromHand").
   */
  | { type: "revealFromHand"; filter?: TargetSpec; bottom?: true }
  /** "Exile all cards from your hand" (face up); `until`, how long you may play them. How many is kept for "that many". */
  | { type: "exileHand"; until: "nextTurn" }
  /**
   * "Choose target artifact card in your graveyard. You may cast that card this turn." (Emry): a permission to cast it
   * from there this turn, paying its costs and following the timing rules (CR 601.2, 601.3).
   */
  | { type: "mayCastFromGraveyard"; what: ObjRef }
  /**
   * "You may cast that card" as this resolves (Conduit of Worlds), from your graveyard, paying its costs and ignoring
   * timing (CR 608.2g, 601.2, rulings: not later in the turn). `thenNoMore`: "If you do, you can't cast additional spells
   * this turn", even if another effect would let you (rulings, CR 101.2). `unlessCast`: "if you haven't cast a spell this
   * turn", checked as it begins (spells cast earlier this turn count, even countered ones and the card with the ability).
   */
  | { type: "castNow"; what: ObjRef; thenNoMore?: true; unlessCast?: true }
  | { type: "putFromHand"; who?: PlayerRef; filter?: TargetSpec; tapped?: boolean; attacking?: boolean; may: boolean; any?: boolean; lesserPower?: true; attackingEvent?: true; haste?: "endOfTurn" | "game"; atEndStep?: "exile" | "sacrifice" | "hand" }
  /**
   * "Return all land cards from your graveyard to the battlefield tapped" (CR 110.2a: under your control), "from all graveyards
   * ... under their owners' control". All at once. Never Auras: those need a choice of what they enchant (CR 303.4f).
   */
  | { type: "returnAllFromGraveyard"; who: PlayerRef; filter: TargetSpec; tapped?: boolean; owners?: true; /** "... to your hand" instead of the battlefield. */ toHand?: true }
  /** "Remove it from combat" (CR 506.4): it stops being an attacking, blocking, blocked or unblocked creature. */
  | { type: "removeFromCombat"; what: ObjRef }
  /**
   * "Return a creature card at random from your graveyard to your hand" (Haunted Fengraf); "an opponent chooses a card at
   * random in your graveyard. If it's a creature card, put it onto the battlefield. Otherwise, exile it." (Search for
   * Survivors, `dest` "creatureOrExile"). Chosen by the game, and everyone sees which (rulings on Fossil Find).
   */
  | { type: "randomFromGraveyard"; filter?: TargetSpec; dest: "hand" | "creatureOrExile" }
  /**
   * "Return a creature card from your graveyard to your hand", "you may return up to two instant and/or sorcery cards
   * ...": not targeted, so the cards are chosen as it resolves (CR 608.2c), as many as there are up to `n` unless `upTo`.
   */
  | { type: "chooseFromGraveyard"; filter?: TargetSpec; n: number; upTo?: true; /** "Mill three cards. You may put a land card from among them into your hand." (Six): only the cards the mill just before put there. */ milled?: true; /** "Return any number of cards with different mana values" (Seasons Past): no limit but one card per mana value; `n` is ignored. */ distinctManaValues?: true; /** "Any number of permanent cards with different names" (Eerie Ultimatum): at most one card of each name. */ oneEach?: true; /** Exiled instead ("Target player exiles a card from their graveyard"), put onto the battlefield under your control, or on top of your library. */ dest?: "exile" | "battlefield" | "libraryTop"; tapped?: true; counters?: Record<string, number>; /** "With a number of +1/+1 counters on it equal to that result" (Grave Endeavor): how many of the one kind in `counters`, as it resolves. */ countersN?: Amount; /** "With mana value X or less", X worked out as it resolves (Blood on the Snow). */ mvMax?: Amount; /** Whose graveyard, and who chooses: yours if left out. */ who?: PlayerRef; /** "For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the battlefield under your control." (Breach the Multiverse): with `who` each player, you choose one card in each of their graveyards and they all enter under your control. */ youChoose?: true }
  /** "Reorder your graveyard as you choose" (Fossil Find), "at random" (Search for Survivors). */
  | { type: "reorderGraveyard"; random?: true }
  | {
      type: "putOntoBattlefield";
      what: ObjRef;
      tapped?: boolean;
      /** "Return it to the battlefield transformed": with its back face up, if it's a double-faced card (CR 712.14a). */
      transformed?: true;
      /** "Return it to the battlefield flipped" (Homura): a flip card enters flipped (CR 710.1b). */
      flipped?: true;
      /** "Under its owner's control" rather than yours. */
      owner?: boolean;
      /** An Aura "attached to that creature": the trigger's subject (CR 303.4f). */
      attachToSubject?: boolean;
      /** An Aura "attached to target opponent" (Accursed Witch): this target, if the Aura could enchant it (CR 303.4f). */
      attachToTarget?: number;
      /**
       * "Attached to enchanted creature" (Mantle of the Ancients): the creature the source Aura is attached to as this
       * resolves, or was last attached to if it has left (rulings); each card only if it could be attached to it.
       */
      attachToEnchanted?: true;
      /** The Enduring cycle's "It's an enchantment. (It's not a creature.)": its new card types as it enters. */
      becomes?: { types: string[]; subtypes: string[] };
      /** "That creature gains haste until end of turn" ("endOfTurn"), "It gains haste" ("game": for as long as it's that object). */
      haste?: "endOfTurn" | "game";
      /** "Exile it at the beginning of the next end step", "Sacrifice it ...": a delayed trigger for it (CR 603.7), while it's that object. */
      atEndStep?: "exile" | "sacrifice";
      /** "With a +1/+1 counter on it" (Undying Malice): counters it enters with (CR 614.1c). */
      counters?: Record<string, number>;
      /**
       * "Sacrifice it when you lose control of ~" (Krovikan Vampire, Seraph): a delayed trigger watching ~ (`true`: this
       * ability's source, if it's on the battlefield) for each permanent put there (CR 603.7).
       */
      sacrificeOnLostControl?: true | { id: ObjectId; zc: number };
      /** "That creature is a black Zombie in addition to its other colors and types": an effect on the permanent from then on (CR 611.2c). */
      alsoMods?: Modification[];
      /** "Put that card onto the battlefield ... at the beginning of the next end step" (Seraph): a delayed trigger for each card (CR 603.7). */
      atNextEndStep?: true;
    }
  /**
   * "Put target card from your graveyard on top of / on the bottom of its owner's library"; "ownersChoice": "Target
   * creature's owner puts it on their choice of the top or bottom of their library".
   */
  | { type: "putInLibrary"; what: ObjRef; position: "top" | "bottom" | "ownersChoice" | "second" | "third" }
  | { type: "exileGraveyard"; who: PlayerRef } // "Exile target player's graveyard"
  /**
   * Living Death, Living End: "Each player exiles all creature cards from their graveyard, then sacrifices all creatures
   * they control, then puts all cards they exiled this way onto the battlefield." Each part for all players at once
   * (rulings); only the cards the first part exiled come back, under their owners' (the exilers') control.
   */
  | { type: "livingDeath" }
  /**
   * "Put all creatures on the bottom of their owners' libraries" (Terminus): all at once (rulings); each owner orders
   * their cards first, without revealing the order (CR 401.4).
   */
  | { type: "putAllOnBottom"; filter: TargetSpec }
  | { type: "tap"; what: ObjRef }
  /** Suspect (CR 701.60a): it becomes suspected, unless it already is (701.60d); `no`: "is no longer suspected". */
  | { type: "suspect"; what: ObjRef; no?: true }
  /** Proliferate (CR 701.27): another counter of each kind on the chosen permanents and players. */
  /** `thenPhaseOut`: "then choose any number of permanents you control that had a counter put on them this way. Those permanents phase out." (Ripples of Potential). */
  | { type: "proliferate"; thenPhaseOut?: true; /** "Proliferate twice" (Agent Frank Horrigan, Ezuri): two proliferate actions. */ twice?: true }
  /** Amass [subtype] N (CR 701.47): an Army gets N +1/+1 counters, made first if you have none. */
  | { type: "amass"; subtype: string; n: Amount }
  /**
   * "Exile target creature you control, then return it to the battlefield under its owner's control"
   * (blink); with `at`, it comes back at the beginning of the next end step (a delayed trigger, CR 603.7), all the cards
   * exiled together by one delayed trigger. `tapped`: "return it to the battlefield tapped".
   */
  /** `transformed`: "return it to the battlefield transformed" (CR 712.14a). */
  /** `counterIf`: "If it's a Spirit, put a +1/+1 counter on it" (Essence Flux), each returned permanent that matches, once it's back. */
  | { type: "flicker"; what: ObjRef; under: "owner" | "you"; at?: "nextEndStep"; counter?: CounterKind; tapped?: true; transformed?: true; counterIf?: { counter: CounterKind; filter: TargetSpec }; /** Exiled now, returned by the search after it (Sword of Hearth and Home: "Put both cards onto the battlefield"), kept in Resolving.held. */ hold?: true }
  /** A delayed flicker's return: the exiled card, while it's still in exile as that object. */
  /** A delayed flicker's return: its subject, or with `cards` each of those cards, if still the same objects in exile. */
  | { type: "returnExiled"; under: "owner" | "you"; counter?: CounterKind; tapped?: true; cards?: { id: ObjectId; zc: number }[] }
  /** Connive (CR 701.50): its controller draws N, discards N, and it gets a +1/+1 counter per nonland card discarded. */
  | { type: "connive"; what: ObjRef; n: Amount }
  /**
   * Recruit (CR 701.70a): "Draw a card, then discard a card. If you discarded a nonland card this way, create a 1/1
   * white Human Soldier creature token."
   */
  | { type: "recruit" }
  /** "If that creature would die this turn, exile it instead": a replacement effect for the rest of the turn (CR 614.1a). */
  /** `ifCreature`: "If it's a creature, ... if it would die this turn, exile it instead" (Carbonize, any target). */
  | { type: "exileIfDies"; what: ObjRef; ifCreature?: true }
  /** "If it would leave the battlefield, exile it instead of putting it anywhere else" (CR 614.1a): while it's that permanent. */
  | { type: "exileIfLeaves"; what: ObjRef }
  /** "It can't be regenerated this turn" (CR 701.19c): its regeneration shields don't apply this turn. */
  | { type: "noRegen"; what: ObjRef; ifCreature?: true }
  /** "Look at target opponent's hand" (only you see it, CR 402.3); `reveal`: "target player reveals their hand" (everyone sees it). */
  | { type: "lookAtHand"; who: PlayerRef; reveal?: true }
  /** "~ assigns no combat damage this turn" (CR 510.1). */
  | { type: "noCombatDamage"; what: ObjRef }
  | { type: "untap"; what: ObjRef }
  /**
   * "Untap up to seven lands" (Palinchron, Snap): its controller chooses as it resolves, among any player's tapped lands
   * (not targeted, rulings), from none up to `n`.
   */
  | { type: "untapUpTo"; n: Amount; filter: TargetSpec }
  /**
   * "Tap any number of untapped creatures you control" (Devout Invocation), "you may tap any number of untapped Gates you
   * control": which ones are chosen as it resolves (CR 608.2d), none allowed; "for each creature tapped this way" counts them.
   */
  | { type: "tapAnyNumber"; filter: TargetSpec }
  /**
   * "Tap or untap target permanent": its controller chooses which as it resolves (CR 608.2d); `may`: "you may tap or
   * untap", where doing neither is a choice too (one question).
   */
  | { type: "tapOrUntap"; what: ObjRef; may?: true }
  /** Provoke's "block [the source] this combat if able" (CR 702.39a): a blocking requirement, see blockRequirementProblem. */
  /** Provoke and "target creature blocks ~ this turn if able": for this combat, or the rest of the turn (CR 509.1c). */
  /** Provoke-like: `what` blocks the source (or `attacker`, "blocks target creature") this combat or turn if able. */
  | { type: "mustBlockSource"; what: ObjRef; attacker?: ObjRef; thisTurn?: true }
  /** "Target creature can't block ~ this turn" (Duct Crawler): a blocking restriction for the rest of the turn (CR 509.1b). */
  | { type: "cantBlockSource"; what: ObjRef }
  /** "That creature doesn't untap during its controller's next untap step." */
  | { type: "skipUntap"; what: ObjRef }
  /** "You have no maximum hand size for the rest of the game" (Player.noMaxHandSize). */
  | { type: "noMaxHandSize" }
  /** "Until your next turn, creatures your opponents control enter tapped" (Cone of Cold): GameState.entersTappedUntil. */
  | { type: "enterTappedUntil"; filter: TargetSpec }
  /** `perLastKnownCounter`: modular's "a +1/+1 counter for each +1/+1 counter on this permanent", as it last was. */
  /** `divided`: "distribute N counters among" the targets of `what`, each getting its part (CR 601.2d). */
  /**
   * `double`: "double the number of +1/+1 counters on each creature you control": each gets as many more as it has (CR
   * 701.10e), `n` aside; with `everyKind`, of each kind of counter it has ("double the number of each kind of counter").
   */
  | { type: "counters"; what: ObjRef; counter: CounterKind; n: Amount; perLastKnownCounter?: "+1/+1" | "-1/-1"; divided?: true; double?: true; everyKind?: true; /** "That player ... puts a +1/+1 counter on it" (Alexios): who puts them, when not the ability's controller. */ by?: PlayerRef }
  /**
   * "Distribute X +1/+1 counters among any number of creatures you control" (no targets): its controller divides them
   * among the permanents like `filter` they control as it resolves (rulings on Blessing of Frost, CR 608.2d), each
   * chosen one getting at least one.
   */
  /**
   * `move`: "you may move any number of +1/+1 counters from ~ onto other creatures" (Forgotten Ancient): from this
   * permanent, as many as it has (`n` aside), onto any number of other creatures anyone controls, none at all included.
   */
  | { type: "distribute"; counter: CounterKind; n: Amount; filter: TargetSpec; move?: true }
  /** "Sacrifice ~" as an effect: only a permanent its controller controls (CR 701.21a). */
  /** `byController`: the permanent's controller sacrifices it, whoever controls the effect. */
  | { type: "sacrifice"; what: ObjRef; byController?: true }
  /**
   * Exploit (CR 702.110a-b): "you may sacrifice a creature". If the source is still on the battlefield as this
   * resolves, it "exploits" the sacrificed creature, which its "when ~ exploits a creature" abilities see.
   */
  | { type: "exploit" }
  /**
   * Soulbond (CR 702.95a): "you may pair this creature with another unpaired creature you control", or, from the
   * trigger of another creature entering, "you may pair that creature with this creature" (the subject).
   */
  | { type: "soulbond" }
  /** Ascend on an instant or sorcery (CR 702.131a): "If you control ten or more permanents and you don't have the city's blessing, you get the city's blessing for the rest of the game." */
  | { type: "ascend" }
  /** The source explores (CR 701.44a): a land on top goes to hand; otherwise a +1/+1 counter, and the card may be milled. */
  /** Explore (CR 701.44a): `what` explores ("target creature you control explores"), by default this permanent. */
  | { type: "explore"; what?: ObjRef }
  /** Renown N (CR 702.112a): if it isn't renowned, N +1/+1 counters and it becomes renowned. */
  | { type: "renown"; n: number }
  /** Adapt N (CR 701.46a): if this permanent has no +1/+1 counters on it, put N +1/+1 counters on it. */
  | { type: "adapt"; n: Amount }
  /** Monstrosity N (CR 701.37a): if this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous. */
  | { type: "monstrosity"; n: Amount }
  /** Fading: "remove a fade counter from ~. If you can't, sacrifice it"; vanishing: "remove a time counter from it". */
  /** "Draw a card at the beginning of the next turn's upkeep": a delayed trigger made as this resolves (CR 603.7a). */
  /**
   * A delayed trigger (CR 603.7) about this ability's source, or with `each: "created"` one about each token it
   * just created ("Sacrifice them at the beginning of the next end step", mobilize 702.181a).
   */
  /**
   * `each`: about each token just created, or about the object the trigger was about ("destroy that creature at end
   * of combat"), instead of the source.
   */
  /** `lostControl`: "When you lose control of the creature, tap it" (Ray of Command), about `of` (CR 603.7). */
  /** `thisTurn`: "When you lose control of that Equipment this turn" (Stolen Uniform): only until the turn ends. */
  /**
   * `event`: what it remembers from now, as its trigger event (CR 603.7c): "its controller" (Arcane Denial: the countered
   * spell's) is its event player, "that spell's mana value" (Mana Drain) its event amount. `yourNextMain`: "at the
   * beginning of your next main phase", the next one that begins after it's made (rulings on Mana Drain).
   */
  | { type: "delayed"; when: "nextTurnUpkeep" | "yourNextUpkeep" | "nextEndStep" | "yourNextEndStep" | "yourNextMain" | "endOfCombat" | "nextCleanup" | "lostControl" | "dies" | "leaves"; effects: Effect[]; text: string; each?: "created" | "subject" | "selfCard" | "subjectCard"; of?: ObjRef; thisTurn?: true; event?: { player?: PlayerRef; amount?: Amount } }
  /** Ninjutsu (CR 702.49a): put this card onto the battlefield from your hand tapped and attacking. */
  | { type: "ninjutsu" }
  /** Madness's trigger (CR 702.35a): its owner may cast the exiled card (the subject) for its madness cost; if not, it goes to the graveyard. */
  | { type: "madness" }
  /** Miracle's trigger (CR 702.94a): "you may cast it by paying [cost] rather than its mana cost", while it's still in hand. */
  | { type: "miracle" }
  /**
   * "You may cast a spell with mana value 3 or less from your hand without paying its mana cost" (the Expertises,
   * Electrodominance's "X or less"): one card, picked and cast as this resolves (rulings).
   */
  | { type: "castFromHand"; filter: TargetSpec; /** "Draw three cards and reveal them. You may cast one of them ...": only those, revealed. */ drawn?: true }
  /** Suspend's upkeep trigger (CR 702.62a): if the card (the subject) is still suspended, remove a time counter from it. */
  | { type: "suspendTick" }
  /** Suspend's last-counter trigger (CR 702.62a): its owner may cast the exiled card without paying its mana cost. */
  | { type: "suspendCast" }
  /** A Siege's intrinsic trigger (CR 310.12b): exile it (the subject), then its controller may cast it transformed for free. */
  | { type: "siegeDefeated" }
  /** "Exile ~ with three time counters on it": the resolving spell suspends itself again (Arc Blade). */
  | { type: "exileSelfWithTime"; n: number }
  /** Warp's end-step trigger (CR 702.185a): exile the permanent; its owner may cast the card after this turn. */
  | { type: "warpExile" }
  /**
   * "Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana
   * cost." (Dauthi Voidwalker): chosen as it resolves, not targeted; the permission is that card's while it stays
   * exiled (CR 400.7), with the usual timing (rulings).
   */
  | { type: "playExiled"; counter: CounterKind; free?: true }
  /**
   * "For each creature exiled this way, its controller creates a 2/2 green Boar creature token" (Curse of the Swine), "...
   * destroyed this way, its controller draws a card": `effects` (one token or one card, for PlayerRef "eachOne") once for
   * each of them that the instructions before destroyed or exiled, by the player who controlled it as it last existed.
   */
  /** `graveyard`: "for each permanent put into a graveyard this way" (Terastodon): only the destroyed ones that went there. */
  | { type: "forEachThisWay"; which: "destroyed" | "exiled"; graveyard?: true; filter: TargetSpec; effects: Effect[] }
  /** "Exile the top two cards of your library. Until the end of your next turn, you may play those cards." */
  /** `who`: "the top card of that player's library" (Ragavan), not yours; `castOnly`: "you may cast that card", not play it. */
  /** `free`: "you may play that card without paying its mana cost" (Urza, Lord High Artificer, CR 118.9). */
  | { type: "impulse"; n: Amount; until: "thisTurn" | "nextTurn" | "exiled" | "yourNextEndStep"; who?: PlayerRef; castOnly?: true; free?: true }
  | { type: "removeSelfCounter"; counter: CounterKind; orSacrifice?: boolean }
  /** "Remove a +1/+1 counter from it", "remove all -1/-1 counters from ~" (CR 122.8): as many as it has, at most. */
  /**
   * CR 702.116a: token copies of the source attacking each opponent other than defending player (the event player).
   * `must`: not "you may" (Shredder's "for each other opponent, create a token that's a copy of ~ tapped and attacking
   * that player, except it isn't legendary").
   */
  | { type: "myriad"; must?: true; except?: CopyExcept }
  /**
   * Encore (CR 702.141a): for each opponent, a token copy of this card that attacks that opponent this turn if able.
   * The tokens gain haste. (The sacrifice at the next end step is a separate delayed trigger about each token.)
   */
  | { type: "encore" }
  /** "When you next cast an instant or sorcery spell this turn, ...": a delayed trigger on that cast (CR 603.7). */
  /** `cascade`: "the next noncreature spell you cast this turn has cascade" (Dark Apostle): that spell's own cascade. */
  /** `who`: "the next spell they cast": that player's (a target player), not the controller's. */
  | { type: "nextCast"; filter: TargetSpec; effects: Effect[]; text: string; cascade?: true; who?: PlayerRef; /** "When you next cast an instant or sorcery spell from your hand this turn" (Narset Transcendent). */ fromHand?: true; /** "The next spell you cast this turn can't be countered" (Mistrise Village). */ uncounterable?: true }
  /**
   * "Until end of turn, whenever you cast a spell, ~ deals 2 damage to up to one target creature" (CR 603.7b): a delayed
   * triggered ability that triggers each time its event happens until `until` ends (see GameState.floatingTriggers).
   */
  /** `about`: its "~" is this target (Hunter's Insight's "that creature"), the object it was as this resolved (CR 603.7c). */
  /** `aboutPlayer`: only for combat damage to the player of that target (Great Train Heist). */
  | { type: "floatingTrigger"; trigger: TriggeredAbility; until: TriggerDuration; about?: number; aboutPlayer?: number }
  /**
   * Copy a spell (CR 707.10): the one whose casting triggered this ("cause": storm, replicate, "copy that spell") or a
   * target. `n`: "storm" is the spells cast before it this turn, "kicked" the times its replicate cost was paid.
   * `newTargets`: "you may choose new targets for the copy" (707.10c).
   */
  /** `epic`: the spell with epic as it resolved, by its stack id in `GameState.epics` (CR 702.50a). */
  /** `self`: the spell that's resolving ("you may copy this spell", Sevinne's Reclamation), as it is on the stack. */
  | { type: "copySpell"; spell: "cause" | "self" | { target: number } | { epic: string }; /** "stormInstantSorcery": the instant and sorcery spells its controller cast before it this turn (Thousand-Year Storm). */ n: Amount | "storm" | "kicked" | "stormInstantSorcery"; newTargets: boolean; /** Then an opponent you choose copies it too (CR 702.144a). */ demonstrate?: true; /** "If it's a permanent spell, the copy gains haste and "..."" (Nalfeshnee): what the token it becomes has (CR 400.7a, 608.3f). */ gains?: Modification[] }
  | { type: "removeCounters"; what: ObjRef; counter: CounterKind; n: Amount | "all" }
  /** "Remove (up to) three counters from target permanent": of any kinds, chosen as it resolves (rulings on Glissa Sunslayer); fewer than that, all of them. */
  | { type: "removeAnyCounters"; what: ObjRef; n: Amount; upTo?: true }
  /** "If an opponent protects it, remove N defense counters from it. Otherwise, put N defense counters on it." (CR 310.9e) */
  | { type: "battleDefense"; what: ObjRef; n: number }
  /** "Remove all counters from target permanent": every kind; how many were removed is counted ("this way"). */
  | { type: "removeAllCounters"; what: ObjRef }
  /** "Move all counters from target creature onto another target creature" (CR 122.5): only if both are still legal targets (rulings on Fate Transfer). */
  | { type: "moveAllCounters"; from: ObjRef; to: ObjRef }
  /** "Put its counters on target creature": as many of each kind (or of `only`) as the source had as it last existed. */
  | { type: "lastKnownCounters"; what: ObjRef; only?: CounterKind }
  /** "Move a +1/+1 counter from ~ onto that creature" (CR 122.5): nothing happens unless both parts can. */
  /** `counter` "any": "move a counter" (Nesting Grounds), of a kind chosen as it resolves (rulings). */
  | { type: "moveCounter"; counter: CounterKind | "any"; from: ObjRef; to: ObjRef }
  /** Cascade (CR 702.85a), resolving: exile until a cheaper nonland card, maybe cast it free, the rest to the bottom. */
  | { type: "cascade" }
  /**
   * "Search target player's graveyard, hand, and library for any number of cards with that name and exile them. Then that
   * player shuffles." (Memoricide, CR 701.23): the ability's controller finds them. `all`: "for all cards" (Cranial
   * Extraction): the ones in the graveyard can't be left, those in the hidden hand and library can (CR 701.23b); `max`:
   * "up to four cards" (Unmoored Ego). How many came from the hand is kept ("exiledFromHandThisWay"). The name is the one
   * chosen (`filter` with chosen "name"), or `sameAs`: "with the same name as that spell" (Counterbore), target `sameAs`'s
   * name as it last existed (CR 608.2h).
   */
  | { type: "exileNamed"; who: PlayerRef; filter: TargetSpec; all?: true; max?: number; sameAs?: number }
  /**
   * "Reveal cards from the top of your library until you reveal a card with the chosen name" (Demonic Consultation, CR
   * 701.20a): `found`, where that card goes; `rest`, where the other revealed cards go (all of them when none is found);
   * `lifePerRest`: "you lose 1 life for each of the exiled cards" (Spoils of the Vault).
   */
  /**
   * "Reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the
   * rest on the bottom of your library in a random order" (`found` "battlefield", `rest` "bottom"), `tapped`.
   */
  | { type: "revealUntil"; filter: TargetSpec; found: "hand" | "battlefield"; tapped?: true; rest: "exile" | "bottom"; lifePerRest?: true }
  /**
   * "Exile cards from the top of your library until you exile a nonland card", or "reveal ... until you reveal a nonland
   * card" (then that card is exiled and the rest go on the bottom in a random order, or all of them go into your hand):
   * `who` has the library (default you). `then`: "castFree", that player (`ownerCasts`) or you may cast it now without
   * paying its mana cost; "freeThisTurn" / "thisTurn", you may cast it this turn (for free), with its usual timing;
   * "hand", every revealed card into your hand (Treasure Hunt). A card not cast stays in exile, and so do the other
   * exiled cards.
   */
  | {
      type: "exileUntilNonland";
      who?: PlayerRef;
      reveal?: true;
      shuffleFirst?: true;
      then: "castFree" | "freeThisTurn" | "thisTurn" | "hand";
      ownerCasts?: true;
      /** Tibalt's Trickery: "Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles ...". */
      millFirst?: number;
      /** "A nonland card with a different name than that spell": target `notNamedAs`'s name. */
      notNamedAs?: number;
      /** "Then they put the exiled cards on the bottom of their library in a random order": the card not cast too. */
      restBottom?: true;
    }
  /**
   * Discover N (CR 701.57a): exile cards from the top of your library until a nonland card with mana value N or less;
   * you may cast it without paying its mana cost, else it goes to your hand; the rest go on the bottom in a random order.
   */
  | { type: "discover"; n: Amount }
  /**
   * Ripple N as it resolves (CR 702.60a): reveal the top N cards, cast any with the same name as the spell for free,
   * the rest to the bottom in any order. `of`: "cause" when the ripple was given to the spell that triggered it.
   */
  | { type: "ripple"; n: number; of?: "cause" }
  /** Evolve's effect (CR 702.100a): a +1/+1 counter on the source if the entering creature (the subject) is still bigger. */
  | { type: "evolve" }
  /**
   * `notSource`: backup's "If that's another creature, it gains ..." (CR 702.165a). "whileTapped": "for as long as ~
   * remains tapped" (CR 611.2b), with `whileControlled` "for as long as you control ~ and ~ remains tapped". Duration
   * "whileControlled": "for as long as you control ~" alone (CR 611.2b).
   */
  /**
   * `giveTo`: the effect is that player's, not the ability's controller's: "Target player gains control of target permanent
   * you control" (Donate), "An opponent gains control of ~" (Wishclaw Talisman), with a "control" modification (layer 2).
   */
  /**
   * "Until your next turn, creatures your opponents control attack each combat if able ..." (Kardur, Doomscourge): an
   * effect that changes no characteristics, so it applies to whatever is in the group at any time, creatures that come
   * under an opponent's control later too (CR 611.2c, rulings).
   */
  /**
   * "Each player gains control of all creatures they own" (Homeward Path): each permanent matching `filter` another
   * player controls comes under its owner's control, an effect of that owner's (layer 2) for as long as it stays (CR 613.1b).
   */
  | { type: "ownersGainControl"; filter: TargetSpec }
  | { type: "groupRules"; affects: Affects; /** The group as the card says it, for the log. */ text: string; mods: Modification[]; duration: "endOfTurn" | "yourNextTurn" }
  | { type: "continuous"; what: ObjRef; mods: Modification[]; duration: "endOfTurn" | "game" | "yourNextTurn" | "endOfYourNextTurn" | "whileTapped" | "whileControlled"; notSource?: boolean; whileControlled?: true; giveTo?: PlayerRef; /** "For as long as it has a vow counter on it" (Promise of Loyalty): only to those of them with one. */ whileCounter?: CounterKind }
  /**
   * Attach the source (an Equipment or Aura) to `what`, CR 701.3; `source`: another Equipment instead ("Attach target
   * Equipment you control to target creature you control", Brass Squire).
   */
  | { type: "attach"; what: ObjRef; source?: ObjRef }
  /** "Attach target Aura attached to a creature to another creature" (Crown of the Ages): a creature chosen as it resolves. */
  | { type: "attachElsewhere"; source: ObjRef }
  /**
   * "Exile them, then meld them into [the combined back face]" (CR 701.42): ~ and a permanent of this card type named its
   * counterpart, if you both own and control them (and both are attacking, `attacking`: then it enters tapped and
   * attacking). See meld.ts.
   */
  | { type: "meld"; partnerType: "Creature" | "Land" | "Artifact"; attacking?: true }
  /** "Unattach it" (CR 701.3d): Ogre Geargrabber's Equipment, from whatever it's attached to; `ifAttachedToYours`: "if it's attached to a creature you control" (Stolen Uniform). */
  | { type: "unattach"; what: ObjRef; ifAttachedToYours?: true }
  /** "{2}: Transform this token." (CR 701.27a): a double-faced token turns its back face up. */
  | { type: "transformSelf" }
  /** Reconfigure's "Unattach this permanent" (CR 702.151a, 701.3d). */
  | { type: "unattachSelf" }
  /** "Create a token that's a copy of target creature you control[, except ...]" (CR 707.2, 707.9, 111.4). */
  /** `ofSource`: a copy of the card the ability came from, as it last existed (embalm, eternalize: exiled to pay the cost). */
  /** `each`: "For each token you control, create a token that's a copy of that permanent" (Second Harvest): one copy of each object in the group `what`, as it is now. */
  | { type: "createTokenCopy"; who: PlayerRef; n: Amount; what: ObjRef; except?: CopyExcept; tapped?: boolean; attacking?: boolean; ofSource?: boolean; each?: true }
  /**
   * "~ becomes a copy of target creature until end of turn, except it has this ability" (CR 707.4): each permanent
   * `what` refers to becomes a copy of `of`'s copiable values (as it last existed, if it's gone, CR 608.2h), with
   * the exceptions (CR 707.9), for the rest of the game, until end of turn, or until its controller's next turn.
   */
  | { type: "becomeCopy"; what: ObjRef; of: ObjRef; except?: CopyExcept; duration: "game" | "endOfTurn" | "yourNextTurn" }
  /** `attacking`: "tapped and attacking" (CR 508.4), attacking whom the ability's source attacks. */
  | {
      type: "createToken";
      who: PlayerRef;
      n: Amount;
      token: TokenSpec;
      tapped?: boolean;
      attacking?: boolean;
      /** "For each opponent, create ... that's tapped and attacking that player": `n` for each opponent, attacking them. */
      attackingEach?: boolean;
      /** "... attacking that player or a planeswalker they control" (Adeline): its controller chooses which as they enter. */
      orPlaneswalker?: true;
      /** "With N +1/+1 counters on it": it enters with them (incubate, CR 701.53a). */
      counters?: { counter: CounterKind; n: Amount };
      /**
       * "An X/X ... token": its power and toughness, worked out once as the token is created and fixed after that (rulings
       * on Inscription of Insight); `token.power` and `token.toughness` are placeholders then.
       */
      pt?: Amount;
      /**
       * An Aura token "attached to" this object (a Role, CR 303.7): one for each object it means. It isn't created if it
       * couldn't legally enchant that object (rulings on Roles).
       */
      attachTo?: ObjRef;
    }
  /** Two kinds of tokens made by one instruction (Wurmcoil Engine): they enter at the same time (CR 608.2f). */
  | { type: "together"; effects: Effect[] }
  | { type: "mill"; who: PlayerRef; n: Amount }
  /** "That player exiles the top card of their library" (ingest, CR 702.115a): face up (CR 406.3), with no permission to play it. */
  | { type: "exileTop"; who: PlayerRef; n: Amount }
  /**
   * Dark Confidant: "reveal the top card of your library and put that card into your hand", then maybe "[you] lose
   * (gain) life equal to its mana value" (X is 0 in a library, CR 202.3e).
   */
  /** `drain`: "Each opponent loses X life and you gain X life, where X is that card's mana value" (Twilight Prophet). */
  | { type: "revealTopToHand"; life?: { who: PlayerRef; gain?: boolean; drain?: true } }
  /** "You may repeat this process any number of times" (Ad Nauseam): `effects` (none of which waits on a choice), then the controller decides whether to go again, each time after seeing the result (rulings). */
  | { type: "repeatMay"; effects: Effect[]; text: string }
  /** "Reveal the top card of your library" (CR 701.20a): what follows ("If it's a creature card, put it into your hand") is about it (ObjRef "revealed"). */
  /** "Reveal the top card of your library" (CR 701.20a), or with `look` only look at it, for an "if it's a ... card" after it. */
  | { type: "revealTop"; look?: true; /** "Reveal a card at random from your hand" (Cursed Scroll) instead. */ randomFromHand?: true; /** Whose library: "reveals the top card of their library" (Chaos Warp: the target's owner). Yours if left out. */ who?: PlayerRef }
  /** "Reveal it": the card "look at the top card" looked at (Frost Augur). */
  | { type: "revealRevealed" }
  /** "Put it into your graveyard": the revealed card, from the library (not milling, CR 701.17). */
  | { type: "putInGraveyard"; what: ObjRef }
  /** Champion's first ability (CR 702.72a): "sacrifice it unless you exile another [object] you control". */
  | { type: "champion"; filter: TargetSpec }
  /** Champion's second: "When this permanent leaves the battlefield, return the exiled card to the battlefield under its owner's control." */
  | { type: "returnChampioned" }
  /**
   * "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card." (CR 701.9b:
   * another player chooses the card), "... and exile that card": the ability's controller picks one matching card from
   * that player's hand, if there is one. `until`: "Exile that card until ~ leaves the battlefield" (Kitesail Freebooter;
   * CR 610.3: it returns to its owner's hand). `linked`: Tidehollow Sculler's "When ~ leaves the battlefield, return the
   * exiled card to its owner's hand" returns it (CR 607.2a).
   */
  | {
      type: "takeFromHand";
      who: PlayerRef;
      filter?: TargetSpec;
      action: "discard" | "exile" | /** Lost Hours */ "libraryThird";
      until?: "sourceLeaves";
      linked?: boolean;
      /** "You may exile a nonland card from it" (Elite Spellbinder): or none. */
      optional?: true;
      /** "For as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." */
      ownerMay?: { play?: true; more?: number };
    }
  /** `hand`: "discards their hand", every card in it (n is ignored). */
  /** `filter`: "discard a creature card" (only such cards can be chosen). */
  /** `exile`: "target opponent exiles a card from their hand": chosen the same way, but exiled, not discarded (no discard, CR 701.9a); `linked` as for "exile". */
  | { type: "discard"; who: PlayerRef; n: Amount; random?: boolean; hand?: true; filter?: TargetSpec; /** "Each player discards cards the same way" (Balancing Act): down to the fewest cards any of them has; `n` is unused. */ downToFewest?: true; exile?: true; linked?: boolean } // CR 701.9
  | { type: "scry"; n: Amount } // CR 701.22, by the controller
  /** "~ endures N" (CR 701.63a): N +1/+1 counters on it, or an N/N white Spirit token, its controller's choice. */
  | { type: "endure"; what: ObjRef; n: Amount }
  /**
   * "Create a Food token or a Treasure token" (Tireless Provisioner): one of these, chosen by its controller as it
   * resolves (CR 608.2d). `labels` name each for the choice.
   */
  | { type: "either"; options: Effect[][]; labels: string[] }
  /** "Clash with an opponent" (CR 701.30): for a following "If you win, ..." (see SpellCondition "wonClash"). */
  | { type: "clash" }
  /**
   * "Flip a coin" (CR 705): its controller calls it and wins or loses the flip, for a following "If you win the flip, ..."
   * (SpellCondition "wonFlip"); `untilLose`: "flip a coin until you lose a flip", counting the wins (Count "flipsWon").
   */
  | { type: "flipCoin"; untilLose?: true }
  /**
   * "Roll a d20", "roll X six-sided dice", "roll two d20 and ignore the lower roll", "roll a d20 and add the number of
   * cards in your hand" (CR 706): the controller rolls; `add` and `subtract` modify the result (706.2). A results table
   * and "equal to the result" read it afterwards (SpellCondition "rollIn", Count "rollResult").
   */
  | { type: "roll"; sides: number; n?: Amount; add?: Amount; subtract?: Amount; /** "Ignore the lower roll": keep only the highest one. */ keepHighest?: true; /** "Roll two d8 and choose one result" (the Endeavors): "that result" is the one chosen, "the other result" the other (Count "rollOther"). */ chooseOne?: true }
  | { type: "surveil"; n: Amount } // CR 701.25
  /** "Look at the top N cards of [a player's] library, then put them back in any order": the controller orders them. */
  | { type: "orderTop"; who: PlayerRef; n: Amount }
  /**
   * Earthbend N (CR 701.66a): the target land you control becomes a 0/0 land creature with haste in addition to its
   * other types, gets N +1/+1 counters, and "when that land dies or is put into exile, return it to the battlefield
   * tapped under your control".
   */
  | { type: "earthbend"; what: ObjRef; n: Amount }
  /** "Put two cards from your hand on top of your library in any order" (Brainstorm): the controller's own hand. */
  /** `bottom`: "put a card from your hand on the bottom of your library" instead (Volcanic Spite). */
  | { type: "handToTop"; n: Amount; bottom?: true }
  /** Scroll Rack: any number of cards from the hand exiled face down, that many from the top of the library put into the hand (not drawn), then the exiled cards on top in any order. */
  | { type: "scrollRack" }
  /**
   * Sylvan Library: "choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on
   * top of your library." With fewer drawn cards still in hand, those (rulings); none, nothing happens.
   */
  | { type: "drawnPayOrTop"; n: number; life: number }
  /**
   * Animate Dead's enters trigger: "it loses 'enchant creature card in a graveyard' and gains 'enchant creature put onto
   * the battlefield with ~.' Return enchanted creature card to the battlefield under your control and attach ~ to it."
   * `tapped`: Dance of the Dead's "... to the battlefield tapped". Only while the Aura is on the battlefield (rulings).
   */
  /**
   * `target`: Necromancy's "it becomes an Aura with 'enchant creature put onto the battlefield with ~.' Put target creature
   * card from a graveyard onto the battlefield under your control and attach ~ to it": the card is this target of the
   * ability, and the enchantment becomes an Aura (a resolved effect, CR 611.2c) only as it does this.
   */
  | { type: "animateDead"; tapped?: true; target?: number }
  /** Its leaves trigger: "that creature's controller sacrifices it", the creature it put onto the battlefield. */
  | { type: "sacrificeAnimated" }
  /** Firebending's "add N {R}. Until end of combat, you don't lose this mana as steps and phases end" (CR 702.189a). */
  | { type: "addCombatMana"; n: Amount }
  /** "Add {B}{B}{B}" (Dark Ritual), "add one mana of any color" from an enters trigger: not a mana ability, so it uses the
   * stack (CR 605.1, 605.5a). `chosen` adds that much mana of the color chosen just before (a "choose" effect). */
  /** `times`: "Add {R} for each card in target opponent's hand" (Jeska's Will). */
  | {
      type: "addMana";
      mana?: string;
      chosen?: number;
      times?: Amount;
      /** "Until end of turn, you don't lose this mana as steps and phases end" (CR 500.4). */
      keep?: "turn";
      /** Who adds it: "target player adds", "that player adds" (CR 106.4); the controller if absent. */
      who?: PlayerRef;
      /** "Spend this mana only to cast instant and sorcery spells" after it (CR 106.6). */
      only?: ManaSpend;
      /** "Add {B} or {G} for each ...": `times` mana, each of either color (chosen as it resolves). */
      split?: [ManaType, ManaType];
      /** Remember that this ability's source added mana this turn (StaticCondition addedManaThisTurn). */
      markSource?: true;
    }
  /** "Creatures without flying can't block this turn" (Falter): a rule for the turn, not locked to the creatures there now,
   * since it doesn't change characteristics (CR 611.2c; Magmatic Chasm rulings). */
  | { type: "cantBlockRule"; filter: TargetSpec }
  /** "Creatures can't attack this turn" (kicked Orim's Chant): a rule for the turn, so also creatures that arrive later (CR 611.2c). */
  | { type: "cantAttackRule"; filter: TargetSpec }
  /** "You may shuffle", "you may have that player shuffle" (CR 701.20). */
  | { type: "shuffle"; who: PlayerRef }
  /**
   * "Shuffle it into its owner's library"; `shuffleSpell`: "Shuffle ~ into its owner's library", the resolving spell itself,
   * instead of its owner's graveyard (CR 608.2n). The owner's library is shuffled even if the card is gone (CR 701.24c).
   */
  | { type: "shuffleIntoLibrary"; what: ObjRef }
  | { type: "shuffleSpell"; /** "Put ~ on the bottom of its owner's library" (Seasons Past): there instead, with no shuffle. */ bottom?: true; /** "Put ~ into its owner's library seventh from the top" (Approach of the Second Sun): no shuffle. */ nth?: number }
  /** "Target player shuffles their graveyard into their library", "Each player shuffles their hand and graveyard into their library". */
  | { type: "shuffleZones"; who: PlayerRef; hand?: true; graveyard?: true; /** "Puts all the cards from their graveyard on the bottom of their library in a random order" (Endurance): no shuffle. */ bottom?: true }
  | { type: "fight"; a: ObjRef; b: ObjRef } // CR 701.14: each deals damage equal to its power to the other
  /**
   * Ezuri's Predation, after "for each creature your opponents control, create a 4/4 ... token": "Each of those tokens
   * fights a different one of those creatures" (`filter`), all at the same time; tokens beyond one each (a doubler's)
   * don't fight (rulings). The tokens are all alike, so which fights which isn't asked.
   */
  | { type: "createdFightEach"; filter: TargetSpec }
  /**
   * a deals damage equal to its power to b. `excessIfTrample`: "If the creature you control has trample, excess damage is
   * dealt to that creature's controller instead" (Ram Through; CR 120.4a).
   */
  | { type: "bite"; a: ObjRef; b: ObjRef; excessIfTrample?: true }
  /**
   * Counter the targeted spell (CR 701.6a), maybe unless its controller pays (CR 118.12); "exile it instead", "put it on
   * top of its owner's library instead".
   */
  /** "Counter each spell you don't control" (overloaded Counterflux): every spell on the stack matching it, not abilities. */
  | { type: "counterEach"; filter: TargetSpec }
  /**
   * "That creature enters with an additional +1/+1 counter on it" in a cast trigger (Boreal Outrider): the spell it was
   * about, if it's still on the stack, enters with these too (CR 614.1c).
   */
  | { type: "spellEntersWith"; counter: CounterKind; n: Amount }
  /** "It gains haste until end of turn" about the spell a cast trigger is about (Tyvar Kell's emblem): the permanent it becomes has it, until end of turn (CR 400.7a). */
  | { type: "spellGains"; mods: Modification[] }
  | {
      type: "counterSpell";
      index: number;
      unless?: UnlessPays;
      exile?: boolean;
      top?: boolean;
      /** Remand: "If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard." */
      hand?: true;
      /**
       * "Return target spell to its owner's hand" (Reprieve): not a counter, so a spell that can't be countered goes too
       * (CR 101.2 doesn't apply); otherwise like Remand's.
       */
      bounce?: true;
      /** "Exile any number of target spells" (Mindbreak Trap): not a counter either, so it exiles one that can't be countered (rulings). */
      exileSpell?: true;
      /** "Any number of target spells": the targets from `index`, this many (see TargetSpec.many, expandMany). */
      n?: number;
      /** "Counter target spell if its mana value is X" (Disrupting Shoal): only then, checked as it resolves. */
      ifMvX?: true;
      /** "Counter target spell if it has the same name as that card" (Jester's Scepter): the card put into a graveyard to pay the cost. */
      ifCostCardName?: true;
      /** "When you cast this spell, ... counter ~" (Brain Gorgers): the spell that triggered it, not a target (`index` -1). */
      cause?: true;
    }
  /**
   * "Change the target of target spell with a single target" (CR 115.7a): to another legal target, chosen as this
   * resolves, or it stays as it is if there's none; maybe unless that spell's controller pays (CR 118.12).
   */
  /** `toSelf`: "change the target of target instant or sorcery spell with a single target to ~" (Hydroelectric Specimen): to this ability's source, only if it's a legal target for that spell (rulings). */
  /**
   * `anyOne` with `toSelf`: "change a target of target spell or ability to ~" (Spellskite): any one of its targets, chosen
   * as this resolves among those ~ could become without making another of its targets illegal (rulings).
   */
  | { type: "changeTarget"; index: number; unless?: UnlessPays; toSelf?: true; anyOne?: true }
  /**
   * "You may choose new targets for target spell or ability" (CR 115.7d): as this resolves, its controller keeps any of
   * that spell's targets, legal or not, and changes the rest to legal ones.
   */
  | { type: "newTargets"; index: number }
  /**
   * Counter the spell or ability that triggered this unless its controller pays: ward (CR 702.21a),
   * "Whenever a player casts a spell, counter it unless that player pays {1}".
   */
  | { type: "counterUnlessPays"; unless: UnlessPays; ward?: boolean }
  /** "Counter that spell or ability": the one that made this trigger (Glyph Keeper's "becomes the target"). */
  | { type: "counterCause" }
  /**
   * "You may [do something]": the controller chooses as it resolves whether to do it
   * (CR 608.2d). Its targets were still chosen when it was put on the stack (CR 603.3d).
   */
  /** `once`: "Do this only once each turn" (CR 603.2h): see GameObject.triggeredThisTurn. */
  /**
   * `payX`: "You may pay {X}. If you do, create X 1/1 white Soldier creature tokens" (Decree of Justice): the player
   * chooses X as it resolves (CR 107.1c, 608.2d), at most `max` ("where X is less than or equal to the amount of life you
   * gained", Well of Lost Dreams), then pays `pay` with that X; `effects` use it as X.
   */
  | { type: "may"; effects: Effect[]; text: string; otherwise?: Effect[]; pay?: PayCost; keep?: boolean; once?: boolean; payX?: { max?: Amount } }
  /**
   * "Each player may discard their hand and draw five cards" (Will of the Jeskai): each of them decides in APNAP order,
   * knowing the earlier answers (CR 101.4), then `effects` happen to those who chose to ({ ref: "choseThisWay" }).
   * `wheel`: the number of cards drawn, for the bots' answer.
   */
  /**
   * `each`: a tempting offer and the like ("Each opponent may create a Treasure token. For each opponent who does, you
   * create a Treasure token"): `effects` happen for each player who chose to, as if they were "you", one after another,
   * and players who can't do it aren't asked (`need`: they must control one of these, or have one in their graveyard). `perAccepted`: then these, once
   * for each player who did (only opponents with `opponents`), with that player as "that player" (PlayerRef "eachOne").
   */
  /** `chain`: the Chain cards' "that permanent's controller may copy ~" (Chain of Vapor), for the bots' answer. */
  /** `untappedSubject`: only while the trigger's subject is still there untapped (Charismatic Conqueror's "they may tap that permanent"). */
  /** `pay`: paid on saying yes (Chain Lightning's "may pay {R}{R}"); someone who can't pay isn't asked. `need` "hand": a card in hand to discard (Chain of Plasma). */
  | { type: "eachMay"; who: PlayerRef; effects: Effect[]; text: string; wheel?: number; each?: true; chain?: true; need?: { zone: "battlefield" | "graveyard" | "hand"; filter: TargetSpec }; untappedSubject?: true; perAccepted?: { effects: Effect[]; opponents?: true }; pay?: PayCost }
  /**
   * A punisher: "Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards
   * a card". Each player in APNAP order picks one of `options` they can do (or none) and, for a discard or a sacrifice,
   * which cards or permanent, without revealing a card to be discarded; then the cards are discarded and the permanents
   * sacrificed all at once, and `effects` happen to those who did none ({ ref: "punished" }) (CR 101.4, rulings on Nicol
   * Bolas, the Deceiver and Court of Ambition). A player may always choose none. `times`: "Repeat this process X times",
   * each time all the way through (rulings on Torment of Hailfire).
   */
  /** `picks`: "for each blight counter on it, ... unless" (Rottenmouth Viper): each player chooses that many times first. */
  /**
   * `mode`: "Any player may sacrifice a land of their choice. If a player does, ..." (Argothian Wurm, Desecration Demon,
   * Vexing Devil) runs `effects` once if anyone did one of the options ("ifAny"); "Any player may have Browbeat deal 5
   * damage to them. If no one does, ..." once if no one did ("ifNone"). Each player still chooses in turn order, knowing
   * the earlier choices, and the chosen actions happen together (rulings on Clackbridge Troll and Vexing Devil).
   */
  | { type: "punisher"; who: PlayerRef; options: PunisherOption[]; effects: Effect[]; times?: Amount; picks?: Amount; mode?: "ifAny" | "ifNone"; /** What `effects` do, for the prompt; without `mode`, what its controller does to those who don't ("may draw a card"). */ thenText?: string }
  /**
   * Cumulative upkeep (CR 702.24a): put an age counter on it, then you may pay the cost once for each
   * age counter on it; if you don't, sacrifice it.
   */
  | { type: "cumulativeUpkeep"; pay: PayCost } // "If you don't, ...": fabricate (CR 702.123a)
  /**
   * "You may collect evidence N" as it resolves (CR 701.59a), always inside a "may": its controller picks cards in their
   * graveyard with total mana value N or more (they can say yes only if they have them, 701.59b).
   */
  | { type: "collectEvidence"; n: number }
  /**
   * "When you do, ..." (CR 603.12): a reflexive triggered ability, triggered by doing what the "you may" before it said.
   * It's put on the stack the next time a player would receive priority, its targets chosen then (603.3d).
   */
  /** `sacrificed`: "the sacrificed creature" / "that creature" in it is what the ability sacrificed (Heart-Piercer Manticore). */
  /**
   * `about`: "it" / "that creature" in it is an object the ability acted on, the reflexive trigger's subject: `created`, the
   * permanent a card put onto the battlefield became (Back for More); `target`, that target, and with `attached` only if
   * the token just created was attached to it (Curse of the Werefox). With no such object, it doesn't trigger (rulings).
   */
  | { type: "reflexive"; body: AbilityBody; sacrificed?: true; about?: "created" | { target: number; attached?: true }; /** "When it deals excess damage this way, ... that amount of excess damage" (Unleash the Inferno): its X is the excess dealt (CR 603.12). */ xExcess?: true }
  /** "Until end of turn, you don't lose unspent red mana as steps and phases end" (The Last Agni Kai, CR 500.4). */
  | { type: "keepManaThisTurn"; color?: Color }
  /** "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}" (High Tide). */
  | { type: "manaTriggerThisTurn"; trigger: ManaTrigger }
  /** "Defending player gets a poison counter", "each opponent gets two poison counters" (CR 122.1f; ten lose, 704.5c). */
  /** `upTo`: as many as it takes to have that many ("equal to the difference", Vraska, Betrayal's Sting); `n` is unused. */
  | { type: "poison"; who: PlayerRef; n: Amount; upTo?: number }
  /** "Each opponent loses all counters" (CR 122.1): poison and energy, the player counters there are here. */
  | { type: "loseAllCounters"; who: PlayerRef }
  /**
   * Doubling the power and/or toughness of each of a group until end of turn (CR 701.10b-c): each gets +X/+0, +0/+Y or
   * +X/+Y, X its power and Y its toughness as this resolves (negative ones make it -X or -Y).
   */
  | { type: "doublePT"; what: ObjRef; power: boolean; toughness: boolean }
  /**
   * "You get an emblem with "..."", "each opponent gets an emblem with ..." (CR 114.2): each of those players puts an
   * emblem with these abilities into the command zone. "This emblem" in them is "~".
   */
  | { type: "emblem"; who: PlayerRef; abilities: string[] }
  /** "You get {E}{E}" (CR 107.14): energy counters on a player (CR 122.1). */
  | { type: "getEnergy"; who: PlayerRef; n: Amount }
  /** "You get an experience counter" (CR 122.1): a counter on the player, counted by other abilities. */
  | { type: "getExperience"; who: PlayerRef; n: Amount }
  /** Unearth (CR 702.84a): return the source card from your graveyard to the battlefield with haste, exiled at the next end step or if it would leave. */
  | { type: "unearth" }
  /** Rebound's delayed trigger (CR 702.88a): "you may cast this card from exile without paying its mana cost". */
  | { type: "castFromExileFree" }
  /**
   * Isochron Scepter, Spellbinder: "You may copy the exiled card. If you do, you may cast the copy without paying its mana
   * cost." A copy of the card its linked imprint ability exiled (CR 607.2a), made in exile and cast as this resolves or
   * never (CR 707.12, rulings); not if that card has left exile.
   */
  | { type: "castLinkedCopy" }
  /**
   * Beseech the Mirror: "If ~ was bargained, you may cast the exiled card without paying its mana cost if that spell's
   * mana value is 4 or less. Put the exiled card into your hand if it wasn't cast this way." The card this resolution
   * exiled face down (Resolving.faceDownExiled), cast as it resolves (CR 608.2g).
   */
  | { type: "castFaceDownExiled"; maxMv: number; ifBargained?: true; elseHand?: true }
  /**
   * "You may cast target instant card from your graveyard without paying its mana cost" (Torrential Gearhulk): as it
   * resolves, ignoring timing based on its type (CR 608.2g). `exileAfter`: "If that spell would be put into your
   * graveyard, exile it instead" (GameObject.exileIfToGraveyard); "instantOrSorcery": "if an instant or sorcery spell cast
   * this way would ..." (Scholar of the Lost Trove).
   */
  | { type: "castTargetFree"; what: ObjRef; exileAfter?: true | "instantOrSorcery" }
  /** "You become the monarch" (CR 725). */
  | { type: "becomeMonarch"; who: PlayerRef }
  /** "You may play an additional land this turn" (CR 305.2a): `n` more land plays for you this turn. */
  | { type: "extraLandThisTurn"; n: number }
  /** "~ becomes saddled until end of turn" (CR 702.171b): a designation it has until end of turn or until it leaves. */
  | { type: "becomeSaddled"; what: ObjRef }
  /** A class level bar's "This Class's level becomes N" (CR 716.2a). */
  | { type: "classLevel"; n: number }
  /** A "To solve" trigger's "this Case becomes solved" (CR 719.3a). */
  | { type: "solve" }
  /** "Harness ~" (CR 701.64a): if it isn't harnessed, it becomes harnessed; its "∞ —" abilities then work (702.186b). */
  | { type: "harness" }
  /** "The next spell you cast this turn has improvise" (Archway of Innovation, CR 702.126): used up by the next spell cast. */
  | { type: "nextSpellImprovise" }
  /** "Transform ~" (CR 701.27a): turn a double-faced permanent over. */
  /** `convert`: "convert ~" (CR 701.28a), which works just as transforming does. */
  | { type: "transform"; what: ObjRef; convert?: true }
  /** "Flip ~", "you may flip it" (CR 710): a flip card's permanent turns to its flipped half, for good (710.4). */
  | { type: "flip"; what: ObjRef }
  /** "~ becomes prepared" (CR 722.3a): a permanent with a prepare spell gets the prepared designation. */
  | { type: "becomePrepared"; what: ObjRef }
  /** "The Ring tempts you" (CR 701.54a): choose a creature you control as your Ring-bearer. */
  | { type: "ringTempts" }
  /** "~ phases out", "target creature phases out" (CR 702.26b). */
  | { type: "phaseOut"; what: ObjRef }
  /** Speed's inherent trigger (CR 702.179d): "if your speed is less than 4, your speed increases by 1". */
  | { type: "increaseSpeed" }
  /**
   * "It gets +1/+1 until end of turn for each creature blocking it (beyond the first)": rampage
   * (CR 702.23a) and the like. The number of blockers is counted as it resolves (CR 702.23b).
   */
  | { type: "pumpPerBlocker"; what: ObjRef; power: number; toughness: number; beyondFirst: boolean }
  /**
   * Persist and undying (CR 702.79a, 702.93a): return the source card from the graveyard it was
   * just put into to the battlefield under its owner's control, with a counter on it.
   */
  | { type: "returnToBattlefield"; counter?: "+1/+1" | "-1/-1" }
  /**
   * "Prevent the next 2 damage that would be dealt to any target this turn" (a prevention shield, CR 615.7). `divided`:
   * "to any number of targets, divided as you choose", each target's shield its part (CR 601.2d).
   */
  | { type: "preventNext"; n: Amount; to: DamageRecipient; divided?: true }
  /** "The next N damage that would be dealt to ~ this turn is dealt to target creature you control instead" (CR 614.9). */
  | { type: "redirectNext"; n: Amount; from: DamageRecipient; to: DamageRecipient }
  /** "Prevent all combat damage that would be dealt this turn" (CR 615.1). */
  | { type: "preventCombatDamage" }
  /**
   * A prevention or redirection effect for damage dealt later this turn that isn't a shield on one permanent or player
   * (CR 615, 614.9): "Prevent all damage that would be dealt to you and creatures you control this turn", "Prevent all
   * damage a source of your choice would deal this turn", "The next X damage that a source of your choice would deal
   * to you and/or creatures you control this turn is dealt to any target instead" (Shining Shoal). See DamageRuleSpec.
   */
  | { type: "damageRule"; rule: DamageRuleSpec }
  /** "Players can't gain life this turn", "Your opponents can't gain life this turn" (CR 119.7). */
  | { type: "noLifeGain"; players: "all" | "opponents" }
  /** "You can't lose life this turn, you can't lose the game this turn, and your opponents can't win the game this turn" (Courageous Resolve). */
  | { type: "turnRules"; rules: TurnRule["rule"][] }
  /** "Until your next turn, you may cast sorcery spells as though they had flash." (Teferi, Time Raveler; CR 702.8a) */
  | { type: "flashUntilNextTurn"; filter: TargetSpec }
  /** "Artifact, instant, and sorcery spells you cast this turn cost {2} less to cast" (Urza, Planeswalker): `mod`'s "you" is the ability's controller (CR 601.2f, 611.2a). */
  | { type: "costModThisTurn"; mod: CostMod }
  /**
   * "Your opponents can't cast spells this turn" (Silence), "target player can't ..." (Orim's Chant), "players can't cast
   * noncreature spells this turn" (Calamity's Wake): those players, chosen as it resolves, until the turn ends; `filter`
   * is the kind of spell.
   */
  | { type: "cantCast"; who: PlayerRef; filter?: TargetSpec }
  /** "Target player can't play lands this turn" (Moonhold): no land plays for them until the turn ends (CR 305.2, 101.2). */
  | { type: "cantPlayLands"; who: PlayerRef }
  /**
   * "Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played"
   * (Conjurer's Ban; `lands`), "Opponents can't cast spells with the chosen name until your next turn" (Academic
   * Probation; `who`), "That creature's owner can't cast ... with the same name as that creature" (Reflector Mage;
   * `sameAs`, that target's name as it last existed). Cards only: a copy of one can still be cast (rulings).
   */
  | { type: "banName"; who?: PlayerRef; lands?: true; sameAs?: number }
  /** "Damage can't be prevented this turn" (CR 615.12). */
  | { type: "noPrevention" }
  /**
   * A damage amount replacement for the rest of the turn, or `until` its controller's next turn (CR 611.2a): "If a source
   * you control would deal damage this turn, it deals double that damage instead" (Insult), "Each time target permanent
   * would deal damage ... this turn" (Overblaze: `byTarget`), "until your next turn, if a source would deal damage to that
   * player or a permanent that player controls" (Lightning, Army of One: `toPlayer`). Its amounts are counted as it resolves.
   */
  | { type: "damageMod"; mod: DamageMod; until?: "yourNextTurn"; byTarget?: number; toPlayer?: PlayerRef; /** "A source of your choice", chosen as it resolves (CR 609.7a). */ choose?: TargetSpec; /** "That creature": the trigger's subject. */ bySubject?: true }
  /** "If ~ was kicked, ...", with "... instead" as `otherwise` being what it does when it wasn't. */
  | { type: "if"; cond: SpellCondition; effects: Effect[]; otherwise?: Effect[] }
  /**
   * "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle"
   * (CR 701.23). `filter` unset = any card. Found cards go to `dest`; with `others`, only the first
   * does and the rest go there (Cultivate). The library is then shuffled (CR 701.20).
   */
  | { type: "search"; filter?: TargetSpec; n: Amount; upTo: boolean; dest: SearchDest; others?: SearchDest; reveal: boolean; /** Whose library: "its controller may search their library" (Path to Exile). Yours if left out. */ who?: PlayerRef; /** "Search target opponent's library" (Bribery): you search that player's library, which they then shuffle. */ library?: PlayerRef; /** "Search your library and/or graveyard ... If you search your library this way, shuffle" (Finale of Devastation): your graveyard, and your library too if you choose. */ orGraveyard?: boolean; /** "A card named A and/or a card named B" (Alpine Houndmaster), "cards with different names" (Three Dreams): at most one card of each name. */ oneEach?: true; /** "Up to two basic land cards that share a land type" (Myriad Landscape): the cards found all have a land type in common. */ shareLandType?: true; /** "Each player may search their library" (Veteran Explorer): each one, as their turn to search comes, chooses whether to (rulings); only those who did shuffle. */ may?: true; /** "Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand" (Gifts Ungiven): `n` of the cards found, chosen by that opponent (by an opponent you choose as it resolves if left out), go `to`; the rest go to `dest`. */ split?: { chooser?: PlayerRef; n: number; to: SearchDest }; /** "Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand." (Archdruid's Charm): where a land card found goes instead of `dest`. */ landTo?: SearchDest; /** "A Forest card and a Plains card" (Krosan Verge): up to one card for each of these, each card found matching a different one. */ oneOfEach?: TargetSpec[]; /** The cards a "hold" flicker exiled enter with the found cards, at the same time, under your control (Sword of Hearth and Home). */ withHeld?: true }
  /** "Reveal the top three cards of your library. An opponent chooses one of them. Put that card into your graveyard and the rest into your hand" (Murmurs from Beyond): the chooser (an opponent you choose as it resolves if left out) picks one revealed card (one that fits `filter`), which goes `to`; the rest go `rest`, or stay on top. */
  | { type: "revealPick"; n: Amount; chooser?: PlayerRef; filter?: TargetSpec; to: SearchDest; rest?: SearchDest }
  /**
   * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your
   * hand and the other into your graveyard." (Fact or Fiction), or you separate them and an opponent chooses the pile
   * (Steam Augury): the cards stay in the library while they're separated (CR 700.3c) and a pile may be empty. The
   * opponent is one you choose as it resolves (rulings). `rest`: the other pile goes to the graveyard, or on the bottom
   * of the library in any order (Jace, Architect of Thought).
   */
  | { type: "piles"; n: Amount; separator: "you" | "opponent"; rest: "graveyard" | "bottom" }
  /**
   * "Look at the top four cards of your library. You may reveal a creature card from among them and put it
   * into your hand. Put the rest on the bottom of your library in a random order." Pick `count` of the top
   * `n` (matching `filter`; `upTo`: any number up to that), put them `into` there, and the others `rest`.
   */
  | { type: "dig"; n: Amount; count: number; upTo: boolean; filter?: TargetSpec; /** "manifest", "cloak": onto the battlefield face down (CR 701.40a, 701.58a). */ into: "hand" | "libraryTop" | "battlefield" | "manifest" | "cloak" | "exile"; /** Into exile: "You may play the exiled card this turn" (Nahiri's Warcrafting, Florian). */ play?: "thisTurn"; /** "keep": the rest stay on top, in order, for the next instruction (Expressive Iteration). */ rest: "graveyard" | "bottom" | "shuffle" | "hand" | "keep"; /** Takes only while this many cards are left for the rest (Expressive Iteration's exile, after one goes to the bottom). */ minRest?: number; /** "On the bottom of your library in a random order"; otherwise its owner orders them (CR 401.4). */ random?: true; reveal: boolean; /** Whose library, who looks and who gets the permanents: "its controller manifests dread" (default: you). */ who?: PlayerRef; /** Not optional: "Put a creature card from among them onto the battlefield". */ required?: true; /** "With three +1/+1 counters on it" (onto the battlefield). */ counters?: { counter: CounterKind; n: number }; /** "Onto the battlefield tapped". */ tapped?: true; /** "A creature card and/or a land card" (Kiora): up to one for each, each card taken matching a different one. */ oneOfEach?: TargetSpec[]; /** "Each player looks at the top five cards of their library" (Explore the Vastlands): each one in turn, in their own library. */ each?: true }
  /** Venture into the dungeon (CR 701.49a-c), or into Undercity (701.49d). */
  | { type: "venture"; undercity?: true }
  /** "Take an extra turn after this one", "target player takes two extra turns after this one" (CR 500.7). */
  /** `loseAtEnd`: "At the beginning of that turn's end step, you lose the game." */
  | { type: "extraTurn"; who: PlayerRef; n: number; loseAtEnd?: true }
  /** "Target player skips their next combat phase", "you skip your next two turns" (CR 614.10); `thisTurn`: only this turn. */
  | { type: "skip"; who: PlayerRef; skip: SkipWhat; n: number; thisTurn?: true }
  /**
   * "After this phase, there is an additional combat phase [followed by an additional main phase]" (CR 500.8): `after`
   * "main" or "combat" for "after this main/combat phase", which adds nothing in another phase.
   */
  | {
      type: "addPhases";
      phases: ("combat" | "main")[];
      after?: "main" | "combat";
      /** "At the beginning of that combat, untap all creatures you control" (Moraug): a delayed trigger for the added combat phase only (CR 603.7). */
      thatCombat?: { effects: Effect[]; text: string };
    }
  /** "You lose the game" (CR 104.3e). */
  | { type: "loseGame"; who: PlayerRef }
  /** "You win the game" (CR 104.2b): the game ends. */
  | { type: "winGame"; who: PlayerRef }
  /** "Exile ~" in an instant or sorcery: it goes to exile as it resolves instead of its owner's graveyard (CR 608.2n). */
  | { type: "exileSpell" }
  /**
   * Tainted Pact: "Exile the top card of your library. You may put that card into your hand unless it has the same name as
   * another card exiled this way. Repeat this process until you put a card into your hand or you exile two cards with the
   * same name, whichever comes first." Or until the library is empty.
   */
  | { type: "taintedPact" }
  /** "You take the initiative" (CR 726). */
  | { type: "takeInitiative"; who: PlayerRef }
  /**
   * "Choose a creature type." / "Choose a color." while it resolves: later instructions use the
   * choice ("of the chosen type", "of that color"). `except`: "other than Wall".
   */
  /**
   * "Exile the top ten cards of your library. You may cast any number of spells with total mana value 10 or less from
   * among them without paying their mana costs" (Primeval Spawn): `maxMv` each, `totalMv` all together.
   */
  /** `untilMv`: "exile cards from the top of your library until you exile cards with total mana value 4 or greater" (Improvisation Capstone), instead of `n` cards. */
  /**
   * `filter`: "instant or sorcery spells"; `max`: "an instant or sorcery spell" (1), "up to two sorcery spells" (2).
   * `rest`: where the exiled cards not cast go once it's done (they stay exiled without it): `toHand` those of the
   * filter's types, the others to `dest` (Muse Vortex, Epic Experiment, Collected Conjuring).
   */
  /**
   * `untilHits`: "exile cards from the top of your library until you exile two nonland cards with mana value 4 or less"
   * (Invasion of Alara), instead of `n` cards; only those can be cast, and with `hitToHand`, "put one of them into your
   * hand": the one not cast, or your pick of the two (the other stays exiled), and only the others go to `rest`.
   */
  /** `each`: "exile the top card of each player's library, then you may cast any number of spells from among those cards" (Etali): `n` from every library. */
  /** `each`: the top `n` cards of each player's library (Etali, Primal Storm); with `untilNonland`, each player's cards until a nonland card (Etali, Primal Conqueror). */
  /**
   * `fromYard` and `copies` (Mizzix's Mastery): the cards are the target card or each card matching `filter` in your
   * graveyard, exiled first; what's cast is a copy of each (CR 707.12), the cards staying exiled.
   */
  | { type: "castFromAmong"; who: PlayerRef; n: Amount; each?: true; untilNonland?: true; copies?: true; fromYard?: { target?: number; filter?: TargetSpec }; maxMv?: Amount; totalMv?: Amount; untilMv?: number; untilHits?: { n: number; filter: TargetSpec }; hitToHand?: true; filter?: TargetSpec; max?: number; rest?: { dest: "graveyard" | "bottomRandom"; toHand?: boolean } }
  /**
   * "You gain shroud until end of turn", "You and permanents you control gain hexproof until end of turn" (the player's
   * half), "you gain protection from the chosen player": see Player.gained (CR 702.11d, 702.16b-e, 702.16k, 702.18d).
   */
  | {
      type: "playerGains";
      keywords: string[];
      /** "Until your next turn" rather than until end of turn (Noble Heritage). */
      untilYourNextTurn?: true;
      /** "Until your next turn, your life total can't change" (Teferi's Protection): see Player.lifeCantChange. */
      lifeCantChange?: true;
      /** "Until end of turn, your life total can't change" (Flare of Fortitude): see Player.lifeCantChangeTurn. */
      lifeCantChangeThisTurn?: true;
    }
  /**
   * "Starting with you, each player votes for death or taxes" (CR 701.38a): each player in turn order, from the
   * controller, votes for one of `options` (words with no rules meaning, 701.38b), or for one of the permanents or cards
   * `among` matches, as seen by the controller ("a nonland permanent you don't control"). Players vote again for each
   * extra vote they get, all at the time they'd vote (701.38d). `secret`: "each player secretly votes": nobody sees the
   * others' votes until all are in. The votes are kept for the rest of the ability (Resolving.votes).
   */
  /** Illusion of Choice: "You choose how each player votes this turn" (GameState.votesChosenBy). */
  | { type: "chooseVotes" }
  /**
   * "Each player secretly chooses a number 0 or greater, then all players reveal those numbers simultaneously"
   * (Wheel of Misfortune, Menacing Ogre): each one chooses without seeing the others' numbers, then what the card does
   * with them. `wheel`: damage equal to the highest number to each player who chose it, then each player who didn't
   * choose the lowest discards their hand and draws seven. `ogre`: each player with the highest number loses that much
   * life, and two +1/+1 counters on the source if its controller is one of them.
   */
  | { type: "secretNumbers"; then: "wheel" | "ogre" }
  | { type: "vote"; options?: string[]; among?: TargetSpec; secret?: true; text: string }
  | { type: "choose"; choice: ChoiceKind; /** "Each player chooses a creature type" (Patriarch's Bidding): every player in turn order, starting with the active player, into Chosen.types. */ each?: true; /** With "opponent": "a player with the most life or tied for most life" (The Black Gate), checked as it resolves; you can be one. */ mostLife?: true; except?: string; /** The choices the text lists (keywords). */ options?: string[]; /** Who chooses: the player told to add the mana; the controller if absent. */ who?: PlayerRef; /** "Choose a nonland card name": the cards whose names may be chosen (CR 201.4a). */ names?: TargetSpec; /** What the name is for, for bots. */ purpose?: NamePurpose };

/** What a player chooses by name: a creature type (CR 205.3m) or a color (CR 105.1). */
/** "keyword": "gains your choice of flying, vigilance, deathtouch, or haste", from the options listed (CR 608.2d). */
/** "opponent": "Choose an opponent." as it resolves (CR 608.2d); "that player" is them (PlayerRef "chosenPlayer"). */
/** "cardType": "Choose artifact or enchantment." (Season of Gathering), from the card types listed (CR 205.2a). */
/** "cardName": "Choose a card name", "as ~ enters, choose a nonland card name" (CR 201.4): the name of a card (Chosen.name). */
export type ChoiceKind = "creatureType" | "color" | "basicLandType" | "keyword" | "opponent" | "cardType" | "cardName";

/**
 * What a chosen card name is for, so a bot can pick one: "deny", cards its opponents shouldn't use (Pithing Needle,
 * Meddling Mage, Runed Halo); "theirs", cards a player has hidden in their hand or library (Cabal Therapy, Memoricide);
 * "find", a card in its own library (Demonic Consultation); "guess", the top card of a library (Predict); "guessHand",
 * a card at random from its own hand (Cursed Scroll); "own", cards of its own it's going to cast (Cheering Fanatic).
 */
export type NamePurpose = "deny" | "theirs" | "find" | "guess" | "guessHand" | "own";

/** A choice made as a permanent enters that adds a +1/+1 counter or not (see CompiledCard.entersOptions). */
export type EntersOption = "riot" | "unleash" | "copy" | "devour" | "amplify" | "tribute" | "tributePay" | "readAhead" | "player" | "anchor" | "protector" | "discardInstead";

/**
 * What mana was spent to cast a spell (CR 601.2h): at least so much of some colors ("if {U}{B} was spent", "at least three
 * white mana"), of one color (adamant's "three mana of the same color"), in all ("five or more mana"), or none at all.
 */
export interface SpentReq {
  colors?: Partial<Record<Color, number>>;
  sameColor?: number;
  total?: number;
  /** "No mana was spent", "no colored mana was spent". */
  none?: "mana" | "colored";
  /** "Unless two or more colors of mana were spent" (Steel Exemplar): at most this many colors spent. */
  maxColors?: number;
  /** "If at least three colorless mana was spent" (Desecrate Reality): {C} spent. */
  colorless?: number;
  /** "If {S} was spent": at least this much mana from snow sources (CR 107.4h). */
  snow?: number;
  /** "If {S} of any of that spell's colors was spent to cast it" (Boreal Outrider). */
  snowOfColors?: true;
  /** "If three or more mana from creatures was spent": at least this much mana from each kind of source (CR 106.3). */
  from?: Partial<Record<"creature" | "artifact" | "treasure", number>>;
}

/** A fact about how the spell was cast: "if ~ was kicked", "if it was kicked with its {1}{U} kicker" (CR 702.33e-f). */
export type SpellCondition =
  | { kind: "kicked"; which?: number; /** As written, before compile() turns it into `which`. */ cost?: string }
  /** "You may discard a card. If you do, draw a card.": whether the last "you may" was done (CR 608.2c). */
  | { kind: "youDid" }
  /** "If the player doesn't" after "target opponent may have you draw three cards" (Combustible Gearhulk): whether that player chose to (eachMay's choseThisWay). */
  | { kind: "theyChose"; not?: true }
  /**
   * The source is still on the battlefield as the same object (CR 400.7), with `yours` under your control: "Sacrifice ~.
   * When you do, ..." can be done (CR 701.21a).
   */
  | { kind: "selfHere"; yours?: true }
  /** Your library has at least `n` cards, so "mill n cards" mills them all ("Mill three cards. When you do, ..."). */
  | { kind: "libraryHas"; n: number }
  /**
   * "If this is the second time this ability has resolved this turn" (Omnath, Locus of Creation): how many times this
   * ability of this object has resolved this turn, this time included; `not`: "Otherwise" (none of `n`). A new object
   * starts over (CR 400.7); one that doesn't resolve (all its targets illegal, CR 608.2b) isn't counted.
   */
  | { kind: "resolvedNth"; n: number[]; not?: true }
  /** "Clash with an opponent. If you win, ...": whether you won the last clash (CR 701.30d). */
  | { kind: "wonClash" }
  /** "If you win the flip" (CR 705.2), `lost`: "if you lose the flip". Neither if no coin was flipped. */
  | { kind: "wonFlip"; lost?: true }
  /** "If that permanent is destroyed this way" (Transforming Flourish): this spell's or ability's destroy instructions destroyed something. */
  /** `died`: "if that creature dies this way" (Saw in Half): one it destroyed was put into a graveyard (CR 700.4, rulings). */
  | { kind: "destroyedThisWay"; died?: true }
  /** "Sacrifice a creature. When you do, ..." (Tip the Scales): this ability's instructions sacrificed something. */
  | { kind: "sacrificedThisWay" }
  /** "If another Desert was returned this way" (Arid Archway): its "return a ... you control" pick returned one, as it last existed, other than its source. */
  | { kind: "bouncedThisWay"; subtype: string; another: true }
  /** "You may put a land card from among them onto the battlefield tapped. If you don't, ..." (Planar Genesis): its last dig took a card. */
  | { kind: "digTook" }
  /** "If excess damage was dealt this way" (Orbital Plunge): this spell's or ability's damage dealt some (Count excessThisWay). */
  | { kind: "excessDealt"; /** "To a creature this way" (Vikya): only excess dealt to a creature counts. */ creature?: true; /** "If the creature the opponent controls is dealt excess damage this way" after a fight (The Last Agni Kai): only that target's. */ target?: number }
  /**
   * A results table's row (CR 706.3a): "1—9 | ..." is "if the result was in this range". `event`: the result a "whenever
   * you roll" trigger is about ("If you rolled 6 or higher", Mr. House).
   */
  | { kind: "rollIn"; min?: number; max?: number; event?: true }
  /** "If it's suspected, ...": the object, as the instruction is done (CR 701.60). */
  | { kind: "suspected"; what: ObjRef }
  /** "If the sacrificed creature was suspected" (Agency Coroner): the creature its sacrifice cost sacrificed, as it last
   * existed on the battlefield (CR 608.2h), where being suspected is a designation it had (CR 701.60). */
  | { kind: "sacrificedSuspected" }
  /**
   * "If the discarded card wasn't a land card" (Grab the Prize), "was a creature card" (Moria Scavenger): the card a
   * discard cost discarded (StackItem.costDiscarded), as it is in the graveyard. Costs are paid after targets are chosen
   * (CR 601.2c, 601.2h), so no target depends on it.
   */
  | { kind: "discardedIs"; filter: TargetSpec }
  /** "If this spell was foretold" (CR 702.143c): it was a foretold card before it was cast, whatever it cost. */
  | { kind: "foretold" }
  /** "If ~ was bargained" (CR 702.166b). */
  | { kind: "bargained" }
  /** "If this spell was cast from a graveyard" (Sevinne's Reclamation): a copy wasn't cast (rulings, CR 707.10). */
  /** `exile`: "if ~ was cast from exile" (Delayed Blast Fireball) instead. A copy wasn't cast (CR 707.10). */
  | { kind: "castFromGraveyard"; exile?: true }
  /** Approach of the Second Sun: "If ~ was cast from your hand and you've cast another spell named ~ this game". */
  | { kind: "castFromHandAndAnotherNamed" }
  /** "If you cast this spell during your main phase" (addendum, CR 207.2c): a copy wasn't cast (CR 707.10). */
  | { kind: "castInMain" }
  /** "If evidence was collected" (CR 701.59c): its "you may collect evidence N" additional cost was paid. */
  | { kind: "evidence" }
  /** "If mana from a Treasure was spent to cast ~" / "to activate this ability" (CR 106.3). */
  | { kind: "treasure" }
  /**
   * "If {U} was spent to cast ~", "if at least three red mana was spent to cast ~", "if five or more mana was spent to
   * cast that spell" (CR 601.2h): the mana spent to cast the spell itself, the spell its permanent was, or the spell a cast
   * trigger is about. `target`: "counter target spell if no mana was spent to cast it" (Nix), that target's.
   */
  | { kind: "spent"; req: SpentReq; target?: number }
  /** "If this spell was cast using teamwork": its teamwork cost was paid. */
  | { kind: "teamwork" }
  /** "If the gift was promised" (CR 702.174b, k). */
  | { kind: "gift" }
  /** "If this spell's surge cost was paid" (CR 702.117a), "if ~'s spectacle cost was paid" (702.137a): in the spell, or its permanent's enters trigger. */
  | { kind: "altPaid"; alt: "surge" | "spectacle" | "awaken" | "alternative" | "madness" }
  /** "If you attacked this turn, ...": a fact about the game, checked as the spell or ability resolves (CR 608.2c). */
  | { kind: "state"; cond: StaticCondition }
  /** "If X is 10 or more" (Finale of Devastation): the X this spell was cast with (CR 107.3a). */
  | { kind: "xAtLeast"; n: number }
  /**
   * "Then if that player has no cards in hand" (Nezumi Shortfang), "if no cards are in that graveyard" (Nezumi
   * Graverobber): a number counted as it resolves, which may name its targets (CR 608.2c).
   */
  | { kind: "amountNow"; amount: Amount; min?: number; max?: number }
  /** "If X is greater than or equal to the number of cards in your library" (Thassa's Oracle): both counted as it resolves. */
  | { kind: "amountsCompare"; a: Amount; atLeast: Amount }
  /** "If it's a creature" about target `index` (Mythos of Nethroi): that permanent as it is now, still a legal target. */
  | { kind: "targetIs"; index: number; filter: TargetSpec }
  /**
   * "If you controlled that permanent, draw a card" about target `index` (Geistwave, Kellan): you control it now, or did
   * as it last existed on the battlefield if this spell or ability moved it (CR 608.2h; rulings on Geistwave and Kellan).
   */
  | { kind: "targetWasYours"; index: number }
  /**
   * "Exile target card from a graveyard. If it was a creature card, ..." (Scavenging Ooze): the target card `index`, by its
   * printed characteristics, which are the ones it had in the graveyard (CR 608.2h).
   */
  | { kind: "targetCardWas"; index: number; filter: TargetSpec }
  /** "Counter target spell unless its controller pays {4}. If they do, you incubate 2." (Assimilate Essence): it was paid. */
  | { kind: "unlessPaid" }
  /** "If it's a creature card" about the card "reveal the top card of your library" revealed, by its printed characteristics; `not`: "if it isn't". */
  | { kind: "revealedIs"; filter: TargetSpec; not?: true }
  /** Kinship: the card "look at the top card of your library" found shares a creature type with this ability's source. */
  | { kind: "revealedSharesCreatureType" }
  /** "If a card with the chosen name was milled this way" (Predict): any card the mill instruction before put there. */
  | { kind: "milledIs"; filter: TargetSpec }
  /** "If you exiled a land card this way" after exiling the top cards to play (Bonehoard Dracosaur): one of them is. */
  | { kind: "impulsedIs"; filter: TargetSpec }
  /** "If you didn't create a token this way" (Springheart Nantuko): this resolution hasn't created any. */
  | { kind: "createdNone" }
  /** "If you put a Cave onto the battlefield this way" (Spelunking): a permanent the instruction before put there matches, as it is now. */
  | { kind: "putThisWayIs"; filter: TargetSpec }
  /**
   * "If death gets more votes" (CR 701.38): that choice got more votes than each other one in this ability's vote.
   * `orTie`: "If taxes gets more votes or the vote is tied": also when two or more choices tie for the most (rulings on
   * Coercive Portal).
   */
  | { kind: "voteWins"; option: string; orTie?: true };

/** Every effect, including the ones inside "you may" and "if", in order. */
export const allEffects = (effects: Effect[]): Effect[] =>
  effects.flatMap((e) => (e.type === "may" || e.type === "if" ? [e, ...allEffects(e.effects), ...allEffects(e.otherwise ?? [])] : e.type === "either" ? [e, ...e.options.flatMap(allEffects)] : e.type === "together" || e.type === "repeatMay" ? [e, ...allEffects(e.effects)] : [e]));

/** A sequence of effects with the targets they need, like a spell's text or one ability. */
export interface AbilityBody {
  targets: TargetSpec[];
  effects: Effect[];
  text: string;
  /**
   * For modal text ("Choose one —" and a bulleted list, CR 700.2): the modes. A modal body
   * has no targets or effects of its own; see `withModes` in modes.ts. `costs`: spree's additional cost for each
   * mode (CR 702.172a), paid for the chosen ones.
   */
  /** `entwine`: all modes may be chosen for this additional cost (CR 702.42a). */
  /**
   * `both`: "Choose one. If this spell was cast using teamwork, choose both instead." (both modes, then) or "If you
   * control a commander as you cast this spell, you may choose both instead" (one or both, then).
   */
  /**
   * `both` "kicked": "Choose one. If this spell was kicked, choose any number instead." (Inscriptions: one to all, then).
   * `repeat`: "You may choose the same mode more than once" (CR 700.2d): `modes` may then name one mode several times, each
   * a mode of its own with its own targets. `pawprints`: each mode's number of {P} (CR 700.2i): any modes whose
   * pawprints add up to no more than `max` (repeats allowed too). `escalate`: the additional cost for each mode chosen
   * beyond the first (CR 702.120a), mana or not. `unchosen`: "choose one that hasn't been chosen" ("ever", for this
   * object) or "... this turn" (GameObject.modesChosen). `random`: "choose one at random" (a triggered ability's).
   */
  modal?: {
    min: number;
    max: number;
    modes: AbilityBody[];
    costs?: string[];
    entwine?: string;
    both?: "teamwork" | "commander" | "kicked";
    repeat?: true;
    pawprints?: number[];
    escalate?: { mana?: string; cost?: AdditionalCost; text: string };
    unchosen?: "ever" | "turn";
    random?: true;
  };
}

export type TriggerEvent =
  /** A state trigger (CR 603.8): "When you control no Islands, sacrifice ~", see TriggeredAbility.state. */
  | "state"
  /** A Saga's chapter ability (CR 714.2b), see TriggeredAbility.chapter. */
  | "chapter"
  | "selfEnters" // When this enters
  | "selfDies" // When this dies
  | "selfDiesOrExiled" // "When this dies or is put into exile from the battlefield" (the God-Eternals)
  | "selfToGraveyard" // "When this is put into a graveyard from the battlefield" (any permanent, not just a creature)
  | "selfLeaves" // "When this leaves the battlefield", wherever it goes (CR 603.6c, 603.10a)
  /**
   * "When you lose control of ~" (Duplicity, Gustha's Scepter): it left the battlefield (looking back, CR 603.10a) or
   * another player gained control of it; the player who lost control controls the trigger (Khârn rulings).
   */
  | "selfLostControl"
  /** "Whenever a creature an opponent controls is dealt excess damage" (CR 120.10): see TriggeredAbility.excess. */
  | "permanentDealtExcess"
  | "selfBecomesTapped" // "Whenever ~ becomes tapped": it changed from untapped to tapped (CR 701.26a)
  | "selfIsDealtDamage" // "Whenever ~ is dealt damage": once for all the damage dealt to it at the same time
  | "permanentBecomesTapped" // "Whenever a creature an opponent controls becomes tapped": see TriggeredAbility.tappedFilter
  | "selfBecomesUntapped" // "Whenever ~ becomes untapped" (inspired): it changed from tapped to untapped (CR 701.26b)
  | "permanentBecomesUntapped" // "Whenever a permanent you control becomes untapped": see TriggeredAbility.tappedFilter
  /**
   * "Whenever you tap ~ for mana", "whenever a player taps a land for mana" (CR 106.12: activating a mana ability with {T}
   * in its cost), with a body that adds no mana, so it isn't a mana ability and uses the stack (CR 605.1b). See manaTap.
   */
  | "tappedForMana"
  /**
   * "Whenever one or more +1/+1 counters are put on ~" (once for each time counters are put on it, also as it enters
   * with them, CR 122.6); "on a creature you control" with TriggeredAbility.tappedFilter as the filter. See countersKind.
   */
  | "selfCountersPut"
  /** "When ~ becomes monstrous" (CR 701.37b). */
  | "selfBecomesMonstrous"
  | "selfMutates"
  /** "When this Class becomes level 2" (CR 716.2a): TriggeredAbility.level. */
  | "selfBecomesLevel"
  /** Exert's "When you do" (CR 701.43d): this creature was exerted as it attacked. */
  | "selfExerted"
  /** "Whenever you exert a creature": the exerted creature is the subject. */
  | "youExert"
  | "permanentCountersPut"
  /** "Whenever a creature you control enters", "another Ally", "~ or another artifact": see TriggeredAbility.enters. */
  | "permanentEnters"
  /** "Whenever another creature dies", "a creature you control", "equipped creature": see TriggeredAbility.dies. */
  | "permanentDies"
  /** "Whenever ~ becomes unattached from a permanent" (it leaving too, CR 603.10a): the subject is that permanent. */
  | "selfBecomesUnattached"
  | "selfBecomesTarget" // "When this becomes the target of a spell or ability" (see TriggeredAbility.targeted)
  /** "Whenever a permanent you control becomes the target of a spell or ability an opponent controls": see `subjectFilter`. */
  | "permanentBecomesTarget"
  | "selfAttacks" // Whenever this attacks
  | "selfDoorUnlocked" // "When you unlock this door" (CR 709.5h), see TriggeredAbility.door
  /** Enlist's trigger (CR 702.154a), "Whenever ~ enlists a creature": the subject is the enlisted creature. */
  | "selfEnlists"
  | "selfDealsCombatDamageToPlayer"
  /** "Whenever ~ deals damage to a player" (combat or not): once for each player dealt damage (CR 603.2c). */
  | "selfDealsDamageToPlayer"
  /** "Whenever ~ deals damage": once per event, however many things it damaged at once; "that much" is the total. */
  | "selfDealsDamage"
  | "selfDealsCombatDamage"
  | "monarchEndStep" // the monarch's inherent abilities (CR 725.2): no source, fired by the game
  | "ventureRoom" // a dungeon's room abilities (CR 309.4c) and the initiative's (CR 726.2), fired by the game
  | "monarchDamaged"
  /** The Ring's abilities (CR 701.54c), from the player's emblem: fired by the game for their Ring-bearer. */
  | "ringBearerAttacks"
  | "ringBearerBlocked"
  | "ringBearerDamagesPlayer"
  /** "Whenever the Ring tempts you" (CR 701.54d); see TriggeredAbility.ifOtherBearer. */
  | "ringTemptsYou"
  /** "Whenever you choose a creature as your Ring-bearer". */
  | "youChooseRingBearer"
  | "anotherCreatureYouControlEnters"
  | "landYouControlEnters" // landfall: "Whenever a land you control enters"
  | "creatureYouControlAttacksAlone" // exalted (CR 702.83a)
  | "creatureYouControlAttacks" // "Whenever a creature you control attacks": each one as it's declared (CR 508.3a)
  | "yourUpkeep" // At the beginning of your upkeep
  | "yourEndStep" // At the beginning of your end step
  | "yourBeginCombat" // At the beginning of combat on your turn (CR 507.1)
  | "eachBeginCombat" // At the beginning of each combat
  | "yourEndCombat" // At end of combat on your turn
  | "eachEndCombat" // At end of combat (CR 511.2)
  /** "At the beginning of your first (precombat) main phase": only the turn's first main phase is one (CR 505.1a). */
  | "yourFirstMain"
  | "eachFirstMain" // "At the beginning of each player's first main phase" ("that player" is the active player)
  /** "At the beginning of each of your postcombat main phases": every main phase but the first (CR 505.1a); see `secondMain`. */
  | "yourPostcombatMain"
  | "eachPostcombatMain"
  /** "At the beginning of each of your main phases": precombat and postcombat ones, added ones too (CR 505.1). */
  | "yourMain"
  | "selfAttacksOrBlocks" // Whenever ~ attacks or blocks
  | "eachEndStep" // At the beginning of the end step (every turn's)
  | "eachUpkeep" // At the beginning of each upkeep / each player's upkeep ("that player" is the active player)
  | "yourDrawStep" // At the beginning of your draw step (after the draw, CR 504.2)
  | "eachDrawStep" // At the beginning of each player's draw step
  | "selfTransformsInto" // "When ~ transforms into ~" (CR 701.27e): it transformed or converted into this face
  | "selfTurnedFaceUp" // "When ~ is turned face up" (CR 708.8: it doesn't enter again)
  | "selfCast" // "When you cast this spell": cascade (CR 702.85a), triggering from the stack
  | "castSpell" // Whenever you cast a noncreature spell (see `cast`), prowess (CR 702.108a)
  | "becomesTargetOfOpponent" // ward (CR 702.21a)
  // Blocking (CR 509.3). "Blocks" and "becomes blocked" trigger once per combat; the "a creature"
  // forms trigger once for each creature it blocks or is blocked by, which is their subject.
  | "selfBlocks"
  | "selfBecomesBlocked"
  /**
   * "Whenever a creature blocks" (Battle Strain: anyone's) and "Whenever a creature you control becomes blocked" (Somberwald
   * Alpha): once for each such creature, its subject, which `subjectFilter` describes relative to this permanent's controller.
   */
  | "creatureBlocks"
  | "creatureBecomesBlocked"
  /**
   * "Whenever a creature deals damage to you" (Dread), "Whenever a source an opponent controls deals damage to you" (Michiko
   * Konda): once for each source dealing damage to this permanent's controller (CR 603.2c), see `damagesYou`.
   */
  | "dealsDamageToYou"
  /** "Whenever ~ attacks and isn't blocked": after blockers are declared, if no creature blocks it (rulings). */
  | "selfAttacksUnblocked"
  /** "Whenever ~ attacks alone" (CR 506.5): it's the only creature declared as an attacker. */
  | "selfAttacksAlone"
  | "selfBlocksOrBecomesBlocked" // bushido (CR 702.45a)
  | "selfBlocksCreature"
  | "selfBlockedByCreature" // flanking (CR 702.25a)
  | "selfBlocksOrBlockedByCreature"
  /** "Whenever ~ deals (combat) damage to a creature": once for each creature dealt damage, its subject. */
  | "selfDealsDamageToCreature"
  | "selfDealsCombatDamageToCreature"
  | "youGainLife" // "Whenever you gain life": once per source that makes you gain life (CR 119.9)
  /** "Whenever you win a coin flip", "whenever you lose a coin flip" (CR 705.2): once per flip. */
  | "youWinFlip"
  | "youLoseFlip"
  /** "Whenever a player wins a coin flip" (Okaun, Zndrsplt). */
  | "playerWinsFlip"
  /** "Whenever you roll one or more dice": once per instruction to roll (CR 706); the event amount is the result. */
  | "youRollDice"
  /** "Whenever you roll a 4 or higher", "when you roll a natural 20": once per die that does (TriggeredAbility.rolls). */
  | "youRollDie"
  | "youPlayAnotherLand" // "When you play another land" (City of Traitors): playing a land (CR 305.1), not this one
  | "youLoseLife" // "Whenever you lose life" (Vilis, Broker of Blood): once per life-loss event, as "opponentLosesLife"
  | "opponentLosesLife" // "Whenever an opponent loses life": once per life-loss event, damage and paying life included (CR 119.2, 119.4)
  | "youCreateToken" // "Whenever you create a token": once for each token you create (CR 111.2), whoever ends up controlling it
  /**
   * "Whenever you're dealt damage", "whenever an opponent is dealt damage", "whenever enchanted player is dealt damage": once
   * for all the damage dealt to that player at the same time (rulings on Grievous Wound); the event amount is that damage.
   */
  | "youAreDealtDamage"
  | "opponentIsDealtDamage"
  | "enchantedPlayerDealtDamage"
  /** "Whenever you draw a card", "whenever an opponent draws a card", "your second card each turn": see TriggeredAbility.draws. */
  | "playerDraws"
  /** "Whenever an opponent activates an ability that isn't a mana ability" (see TriggeredAbility.activates). */
  | "abilityActivated"
  /** "Whenever you sacrifice another permanent", "a Food", "~ or another creature": see TriggeredAbility.sacrifices. */
  | "youSacrifice"
  /** "Whenever you collect evidence" (CR 701.59a): for any reason, also collecting evidence 0 (rulings). */
  | "youCollectEvidence"
  /** "Whenever you proliferate" (CR 701.27): once for each proliferate action, even with nothing chosen (rulings). */
  | "youProliferate"
  /** "Whenever a spell or ability you control counters a spell" (Baral): once for each spell countered (CR 701.6a). */
  | "youCounterSpell"
  /** "Whenever you complete a dungeon" (CR 309.7). */
  | "youCompleteDungeon"
  /** "Whenever you commit a crime", "whenever an opponent commits a crime" (CR 700.13): once for each spell or ability. */
  | "youCommitCrime"
  | "opponentCommitsCrime"
  /** Playing a land (CR 305.1): "whenever you play a land", "an opponent plays", "a player plays"; that player is the event's. */
  | "youPlayLand"
  | "opponentPlaysLand"
  | "playerPlaysLand"
  /** "Whenever a creature attacks enchanted player" (not a planeswalker of theirs, rulings): that creature is the subject. */
  | "creatureAttacksEnchantedPlayer"
  /** "Whenever enchanted player is attacked": once as attackers are declared, if a creature attacks that player (rulings). */
  | "enchantedPlayerAttacked"
  /** "Whenever you discard a card", "whenever a player cycles a card": see TriggeredAbility.discards. */
  | "playerDiscards"
  /** "Whenever an opponent searches their library" (Archivist of Oghma): their own library, not another's (rulings). */
  | "opponentSearchesLibrary"
  /**
   * "Whenever an opponent attacks you with two or more creatures" (Everett K. Ross), "Whenever an opponent attacks with
   * creatures, if two or more of those creatures are attacking you and/or planeswalkers you control" (Mangara, Tomik): see
   * TriggeredAbility.attacksYou. Once per declaration; "that opponent" is the event player.
   */
  | "opponentAttacksYou"
  /**
   * "Whenever one or more creatures an opponent controls attack you and aren't blocked" (Coveted Jewel): once blockers are
   * declared, for each opponent with an unblocked creature attacking you (not your planeswalkers, rulings); "that player"
   * is that opponent.
   */
  | "opponentCreaturesUnblocked"
  /** "When you cycle ~" (CR 702.29c): it triggers from whatever zone the card went to, under its owner's control. */
  | "selfCycled"
  /**
   * "When ~ is put into a graveyard from anywhere" (Serra Avatar): it triggers from the graveyard, under its owner's control
   * (CR 603.3a), never as a leaves-the-battlefield ability (CR 603.6c).
   */
  | "selfToGraveyardAnywhere"
  /** Haunt on an instant or sorcery (CR 702.55a): "When this spell is put into a graveyard during its resolution". */
  | "selfResolvedToGraveyard"
  /**
   * "When the creature ~ haunts dies" (CR 702.55b-c): it triggers from exile, where the haunting card is, under its
   * owner's control (CR 108.4a, 113.8).
   */
  | "hauntedDies"
  | "selfTargetedByYourSpell" // heroic: "Whenever you cast a spell that targets ~"
  | "selfLastTimeCounterRemoved" // vanishing: "When the last time counter is removed from ~" (CR 702.63a)
  /** "When ~ exploits a creature" (CR 702.110b); the exploited creature is the subject. */
  | "selfExploits"
  /** "Whenever a creature you control exploits a nontoken creature": see TriggeredAbility.subjectFilter. */
  | "creatureYouControlExploits"
  /** "Whenever a creature you control deals combat damage to a player": see TriggeredAbility.dealer; the creature is the subject. */
  | "creatureYouControlDealsCombatDamageToPlayer"
  /** "Whenever one or more creatures you control attack" / "Whenever you attack": once per declaration, see TriggeredAbility.group. */
  | "creaturesYouControlAttack"
  /** "Whenever one or more creatures you control deal combat damage to a player": once per player dealt damage. */
  | "creaturesYouControlDealCombatDamageToPlayer"
  /** "Whenever an instant or sorcery spell you control deals damage to an opponent or battle" (Bloodfeather Phoenix): see `spellDamage`; once for each one dealt damage. */
  | "spellYouControlDealsDamage"
  /**
   * "Whenever one or more cards leave your graveyard", "one or more tokens you control enter", "one or more other creatures
   * die", "you discard one or more cards": once for each event that moves one or more matching objects (CR 603.2c), see
   * TriggeredAbility.batch. "That many" is how many of them matched.
   */
  | "batch";


/**
 * How long a delayed triggered ability with a duration lasts (CR 603.7b): "until end of turn" and "this turn" end in the
 * cleanup step (CR 514.2), "until your next turn" as that turn begins (611.2b), "until the end of your next turn" in that
 * turn's cleanup step.
 */
export type TriggerDuration = "endOfTurn" | "yourNextTurn" | "endOfYourNextTurn";

export interface TriggeredAbility {
  event: TriggerEvent;
  body: AbilityBody;
  /** "This ability triggers only once each turn": see GameObject.triggeredThisTurn. */
  oncePerTurn?: boolean;
  /** For "selfBecomesLevel": the level. */
  level?: number;
  /**
   * For "selfBecomesTarget" / "permanentBecomesTarget": `spell`, "of a spell" (not an ability); `by`, "a spell or ability
   * you control / an opponent controls"; `first`, "for the first time each turn" (counting only those `by` names, as valiant does).
   */
  targeted?: { spell?: true; by?: "you" | "opponent"; first?: true; /** "Another permanent you control". */ other?: boolean };
  /**
   * For "tappedForMana": who taps it (`by`, relative to this ability's controller; "that player") and which permanent
   * (`filter`, the subject: "that land"); without a filter, ~ itself.
   */
  manaTap?: { by: "you" | "opponent" | "any"; filter?: TargetSpec };
  /**
   * For "permanentBecomesTapped" and "permanentBecomesUntapped": which permanent ("a Dwarf you control"); it's the subject
   * ("put a wind counter on it").
   */
  tappedFilter?: TargetSpec;
  /** For "selfCountersPut" / "permanentCountersPut": that kind of counter ("+1/+1 counters"); unset = any counters. */
  countersKind?: string;
  /** For "selfCountersPut" / "permanentCountersPut": "whenever you put one or more counters on ...", only counters this ability's controller puts. */
  countersByYou?: true;
  /** For "permanentCountersPut": "on a permanent or player" (All Will Be One), counters put on a player too. */
  countersOrPlayer?: true;
  /** For "selfCountersPut": "when the twelfth hour counter is put on ~", only when the count goes from below this to at least it. */
  countersReach?: number;
  /**
   * "Whenever you cast a multicolored spell, you may return ~ from your graveyard to your hand": an ability whose
   * effect moves the card out of a zone works only in that zone (CR 113.6m), and its owner controls it there.
   */
  zone?: "graveyard";
  /** For "state": the game state that triggers it, checked whenever state-based actions are (CR 603.8). */
  state?: StaticCondition;
  /** For "castSpell": who casts it, and what kind of spell ("noncreature spell", "instant or sorcery spell"). */
  /** `orCopy`: magecraft's "whenever you cast or copy" also triggers on a copy put on the stack. */
  /** `nth`: "whenever you cast your second spell each turn", counting the spells that player cast this turn (copies aren't cast). */
  /** `enchanted`: the player this Aura is attached to ("Whenever enchanted player casts a spell"). */
  cast?: { by: "you" | "opponent" | "any" | "enchanted"; spell: TargetSpec; orCopy?: boolean; nth?: number; /** `nth` counts only its caster's spells this turn that match `spell` ("their first noncreature spell each turn"). */ nthOfKind?: true; /** "If mana from a Treasure was spent to cast it" (CR 106.3, 603.4). */ treasure?: true; /** "If at least four mana was spent to cast it", "if no mana was spent to cast it" (CR 603.4). */ spent?: SpentReq; /** Vazi: "casts a spell or activates an ability", any ability (mana abilities too), with `treasure`. */ orActivates?: true; /** "A spell that targets a creature you control", "... that targets an opponent or a creature an opponent controls": one of its targets as it was cast is one of these (rulings: it triggers once however many do). "You" and "you control" are this ability's controller. */ targets?: (TargetSpec | "you")[]; /** "From exile", "from anywhere other than your hand", "from your graveyard" (its caster's), "from a graveyard": the zone it was cast from (CR 601.2a). */ from?: "hand" | "notHand" | "exile" | "graveyard" | "ownGraveyard" | "ownLibrary"; /** "A spell that shares a creature type with ~" (Folk Hero). */ sharesTypeWithSelf?: true; /** "A spell that has convoke", "a creature spell with flying". */ keyword?: string };
  /** An intervening "if" (CR 603.4): "When ~ enters, if you attacked this turn, ...". Checked as it triggers and as it resolves. */
  ifCond?: StaticCondition;
  /**
   * For "permanentDealtExcess" (CR 120.10): which permanents ("a creature or planeswalker an opponent controls", the
   * subject, "that excess damage" its event's amount), `noncombat` for "excess noncombat damage", `oneOrMore` for "one or
   * more creatures ... are dealt" (once for each damage event).
   */
  excess?: { filter: TargetSpec; noncombat?: true; oneOrMore?: true };
  /** For "spellYouControlDealsDamage": what spell, and dealt to an opponent (or a battle too, `orBattle`). */
  spellDamage?: { filter: TargetSpec; orBattle?: true };
  /**
   * For "youRollDie": the die's result has to be at least `min` ("a 4 or higher"), or its natural result (CR 706.2) has
   * to be `natural` ("a natural 20"), or the die's highest one (`natural: "max"`).
   */
  rolls?: { min?: number; natural?: number | "max" };
  /** For "playerDraws": who draws, and for "your second card each turn", which card of the turn it has to be. */
  /** `notFirstInDrawStep`: "except the first one they draw in each of their draw steps" (Orcish Bowmasters). */
  draws?: { by: "you" | "opponent" | "any" | "enchanted"; nth?: number; notFirstInDrawStep?: true };
  /**
   * For "abilityActivated": who activated an ability that isn't a mana ability (CR 602, 605.1a), and `of`: what its
   * source had to be as it was activated, a permanent on the battlefield ("an ability of an artifact, creature, or land").
   * "That player" is who activated it.
   */
  activates?: { by: "opponent" | "any" | "you"; of?: TargetSpec };
  /**
   * For "playerDiscards": who discards, `cycled` for "cycles a card" (only a card discarded to pay a cycling cost,
   * CR 702.29c), `other` for "another card", `filter` for "a creature card". "Cycle or discard" is just "discard"
   * (rulings: cycling a card triggers it once).
   */
  discards?: { by: "you" | "opponent" | "any"; cycled?: true; other?: true; filter?: TargetSpec };
  /** For "creatureYouControlDealsCombatDamageToPlayer": which creature ("a Vampire you control", "another creature"). */
  dealer?: { filter: TargetSpec; other?: boolean };
  /** For "creatureYouControlAttacks": which creature ("a Dragon you control", "another creature you control"). */
  attacker?: {
    filter: TargetSpec;
    other?: boolean;
    /** "Whenever a creature attacks": anyone's (Caltrops, Righteous Cause). */
    anyone?: true;
    /** "Whenever a creature attacks you" (Briar Patch): this permanent's controller; "or a planeswalker you control" (Isperia) too. */
    attacksYou?: "player" | "orPlaneswalker";
  };
  /** What the event's subject has to be: "blocks a creature with flying", flanking's "a creature without flanking". */
  subjectFilter?: TargetSpec;
  /**
   * For "dealsDamageToYou": a source that's a permanent fitting `subjectFilter` (the subject, "it", "that creature"), or
   * any source with `by` saying whose ("a source an opponent controls": the event player, "that player", is its
   * controller); `combat`: only combat damage.
   */
  damagesYou?: { by?: "you" | "opponent" | "any"; combat?: true };
  /** For "creaturesYouControlAttack": "Whenever you attack with two or more creatures", at least this many of them. */
  minAttackers?: number;
  /** For "creaturesYouControlAttack": "Whenever one or more creatures attack" (Duelist's Heritage), any player's, not only its controller's. */
  anyoneAttacks?: true;
  /** For "opponentAttacksYou": at least `min` attackers at you, or (`orPlaneswalkers`, an intervening if, CR 603.4) at your planeswalkers too. */
  attacksYou?: { min: number; orPlaneswalkers?: true };
  /**
   * For "permanentEnters": what has to enter (the subject, "that creature"), relative to this permanent's
   * controller. "Another" leaves this permanent out; "~ or another" counts it whatever it is. Without
   * either, it sees itself enter if it matches (CR 603.6a).
   */
  enters?: { filter: TargetSpec; other?: boolean; orSelf?: boolean };
  /**
   * For "permanentDies": what has to die, as it last existed. `attached`: the creature this Aura or
   * Equipment is attached to; `damagedBySelf`: "a creature dealt damage by ~ this turn".
   */
  /**
   * `leaves`: "leaves the battlefield", wherever it went, not only into a graveyard (CR 603.6c, 603.10a); `notDies` with it:
   * "without dying" (anywhere but a graveyard, CR 700.4).
   */
  dies?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; attached?: boolean; damagedBySelf?: boolean; leaves?: true; notDies?: true; /** With `leaves`: only when it went to one of these zones ("dies or is put into exile", Kaya's Ghostform). */ toZones?: ("graveyard" | "exile")[]; /** "If it had a counter on it" (Leader's Talent): any kind, as it last existed (CR 603.10a). */ hadCounter?: true };
  /**
   * For "youSacrifice": what its controller sacrificed (CR 701.21a), as it last existed on the battlefield, wherever it
   * went. The card is the subject ("exile it").
   */
  /** `by`: "whenever a player sacrifices" (any), "whenever an opponent sacrifices" (opponent); otherwise "whenever you sacrifice". */
  sacrifices?: { filter: TargetSpec; other?: boolean; orSelf?: boolean; by?: "any" | "opponent" };
  /** Persist/undying's "if it had no -1/-1 counters on it" (an intervening if, CR 603.4), from last known information; "any": "if it had no counters on it" (Unstoppable Slasher). */
  ifNoCounter?: "+1/+1" | "-1/-1" | "any";
  /** For "selfToGraveyard": "is put into your graveyard", so only if its controller owns it (rulings on Enigma Sphinx). */
  ownGraveyard?: true;
  /**
   * Evolve (CR 702.100a): "if that creature's power is greater than this creature's power and/or
   * that creature's toughness is greater than this creature's toughness", checked as it triggers and
   * again as it resolves (CR 603.4).
   */
  ifEvolves?: boolean;
  /** For the "one or more" events: what has to be among them ("one or more Rogues you control"). */
  group?: TargetSpec;
  /** Dethrone (CR 702.105a): "attacks the player with the most life or tied for most life", as it attacks. */
  attacksMostLife?: boolean;
  /** "Whenever ~ attacks a player": not when it attacks a planeswalker (rulings). */
  attacksPlayer?: boolean;
  /** "Whenever ~ attacks a battle" (Thrashing Frontliner, CR 310.5). */
  attacksBattle?: boolean;
  /** "Whenever ~ attacks for the first time each turn": only on its first attack this turn, as this object (Aurelia). */
  firstAttack?: true;
  /** Battalion: "Whenever ~ and at least two other creatures attack", at least this many others attacking with it. */
  withOthers?: number;
  /** "Whenever ~ and at least one Human attack": the others counted for `withOthers` are of this creature type. */
  withOthersType?: string;
  /** "Whenever this token and at least one other creature token attack": only tokens count among the others. */
  withOthersToken?: true;
  /** For "selfDoorUnlocked": which door (0 left, 1 right). */
  door?: number;
  /** Training (CR 702.149a): "and at least one other creature with power greater than this creature's power attack". */
  training?: boolean;
  /** Renown's "if it isn't renowned" (CR 702.112a), checked as it triggers and as it resolves. */
  ifNotRenowned?: boolean;
  /** "Whenever ~ deals combat damage to a player or planeswalker" (Psychic Frog): also to a planeswalker, once each. */
  orPlaneswalker?: true;
  /** "Whenever ~ deals combat damage to a player or battle" (CR 310): also to a battle, once each. */
  orBattle?: true;
  /** "When ~ enters, if it was kicked, ..." (an intervening if, CR 603.4). */
  ifKicked?: SpellCondition;
  /** Evoke's "if its evoke cost was paid" (CR 702.74a). */
  ifEvoked?: boolean;
  /** "When ~ enters, if his sneak cost was paid" (CR 702.190a), "if its surge / spectacle cost was paid" (702.117a, 702.137a). */
  ifAlt?: "sneak" | "surge" | "spectacle";
  /** Ravenous's "if X is 5 or more" (CR 702.156a): the X of the spell it was (CR 107.3m), which can't change. */
  ifX?: number;
  /** Casualty's "if a casualty cost was paid for it" (CR 702.153a). */
  ifCasualty?: boolean;
  /** "When ~ enters, if it was bargained, ..." (CR 702.166b). */
  ifBargained?: boolean;
  /** "When ~ enters, if evidence was collected, ..." (CR 701.59c, an intervening if). */
  ifEvidence?: boolean;
  /** "When ~ enters, if mana from a Treasure was spent to cast it, ..." (CR 106.3): an intervening if (CR 603.4). */
  ifTreasure?: boolean;
  /** "When ~ enters, if {R} was spent to cast it, ..." (an intervening if, CR 603.4): what its spell's mana was. */
  ifSpent?: SpentReq;
  /** "When ~ enters, if you cast it from your hand, ..." (true), "if you didn't cast it from your hand" (false). */
  ifCastFromHand?: boolean;
  /** "When ~ enters from a graveyard" / "from your graveyard" (its owner is its controller): part of the trigger event. */
  ifFromGraveyard?: "any" | "yours";
  /** "When ~ enters untapped" (Mystic Sanctuary): only if it entered untapped, part of the trigger event. */
  ifEnteredUntapped?: true;
  /** "When ~ enters, if you cast it, ..." (Geological Appraiser): it entered as a spell that resolved, not a copy. */
  ifCast?: true;
  /**
   * A chapter ability "{rN}—[Effect]": "When one or more lore counters are put onto this Saga, if the number of lore
   * counters on it was less than N and became at least N, [effect]" (CR 714.2b).
   */
  chapter?: number;
  /** "When ~ enters, if tribute wasn't paid" (CR 702.104b). */
  ifTributeUnpaid?: boolean;
  /** Conspire's "if its conspire cost was paid" (CR 702.78a). */
  ifConspired?: boolean;
  /** Gift on a permanent: "When this permanent enters, if its gift cost was paid" (CR 702.174b), and "if the gift was promised". */
  ifGift?: boolean;
  /** Echo's "if this permanent came under your control since the beginning of your last upkeep" (CR 702.30a). */
  ifEcho?: boolean;
  /** Soulbond's "if you control both ... and both are unpaired" (CR 702.95a, an intervening if). */
  ifSoulbond?: boolean;
  /** "Whenever the Ring tempts you, if you chose a creature other than ~ as your Ring-bearer" (CR 603.4). */
  ifOtherBearer?: boolean;
  /** It has the ability only while this is true, like "Max speed — Whenever ..." (CR 702.178a): not an intervening if. */
  activeIf?: StaticCondition;
  /**
   * "Whenever enchanted creature deals damage", "whenever equipped creature attacks": a "self" event about the
   * permanent this Aura or Equipment is attached to, which is the subject ("it", "that creature"). "orSelf": "whenever
   * ~ or equipped creature ...", about either.
   */
  host?: "attached" | "orSelf";
  /**
   * "At the beginning of the upkeep of enchanted creature's controller": an "each upkeep" trigger that triggers only in
   * the upkeep of the player who controls the creature this Aura or Equipment is attached to.
   */
  hostControllersUpkeep?: true;
  /** "At the beginning of each opponent's upkeep / draw step / end step": an "each" step trigger only on an opponent's turn. */
  opponentsTurn?: true;
  /** "At the beginning of your second main phase": the turn's second main phase only, not later ones (CR 505.1b). */
  secondMain?: true;
  /** "At the beginning of enchanted player's upkeep": an "each" step trigger only on the turn of the player this Aura enchants. */
  enchantedPlayersTurn?: true;
  /** "Deals damage to an opponent": an opponent of this ability's controller (rulings on Curiosity). */
  toOpponent?: true;
  /** For "batch": what the event has to move, see BatchTrigger. */
  batch?: BatchTrigger;
}

/**
 * A "one or more" trigger (CR 603.2c): it triggers once for an event that moves one or more objects that match, however
 * many there are. `what`:
 * - "enters": permanents entering the battlefield (`filter` as they are there, CR 603.6a);
 * - "leaves": permanents leaving the battlefield, as they last existed (CR 603.10a); `dies`, only those put into a graveyard
 *   (CR 700.4), `notDies`, only those that went anywhere else ("without dying");
 * - "leavesGraveyard": cards leaving their owner's graveyard (a look-back trigger, CR 603.10a), `to` where they went;
 * - "toGraveyard": cards put into their owner's graveyard, `from` where they came from ("from anywhere": unset);
 * - "discards": cards discarded (CR 701.9), `by` who discarded them.
 * `whose`: who has to control the permanents (or own the cards) relative to this ability's controller.
 */
export interface BatchTrigger {
  /** `exiledFromLibraryOrGraveyard`: "cards are put into exile from your library and/or your graveyard" (Laelia). */
  what: "enters" | "leaves" | "leavesGraveyard" | "toGraveyard" | "discards" | "exiledFromLibraryOrGraveyard";
  /** What each object has to be ("creature card", "nontoken creature"); unset, any. */
  filter?: TargetSpec;
  whose?: "you" | "opponent";
  /** "One or more other creatures": not this permanent. */
  other?: true;
  /** "Whenever ~ and/or one or more other creatures you control enter": this permanent entering counts too. */
  orSelf?: true;
  /** Satoru: "if none of them were cast or no mana was spent to cast them" (an intervening if, CR 603.4). */
  noneCastWithMana?: true;
  dies?: true;
  notDies?: true;
  /** `notBattlefield`: "from anywhere other than the battlefield" (Syr Konrad). */
  from?: "library" | "battlefield" | "notBattlefield";
  to?: "exile";
  /** "Whenever a creature card leaves your graveyard" (not "one or more"): once for each card it moved (CR 603.2c). */
  each?: true;
  /** "For the first time each turn": only the first such event this turn (counting the ones before this permanent was there). */
  first?: true;
}

export interface ActivatedAbility {
  /** "Spend only mana of the chosen color to activate this ability" (Throne of Eldraine): the color chosen as its source entered. */
  spendOnlyChosenColor?: true;
  manaCost: string; // "{2}{R}" or ""
  tap: boolean;
  sacrificeSelf: boolean;
  sorcerySpeed: boolean;
  body: AbilityBody;
  text: string;
  /** An equip ability (CR 702.6a), for "Equip abilities you activate cost {1} less to activate". */
  equip?: true;
  /** Works only while the card is in its owner's hand, like cycling (CR 702.29a), or graveyard, like unearth (CR 702.84a). Otherwise on the battlefield. */
  zone?: "hand" | "graveyard";
  /** "Discard this card" is part of the cost (cycling, transmute). */
  discardSelf?: boolean;
  /** "This ability costs {1} less to activate for each legendary creature you control" (CR 602.2b, 601.2f): generic mana only. */
  costLess?: Amount;
  /** It's a cycling ability (CR 702.29a, 702.29f): discarding this card to pay for it is cycling it. */
  cycling?: boolean;
  /** Crew N (CR 702.122a): the cost is tapping other untapped creatures you control with total power N or more. */
  crew?: number;
  /** Saddle N (CR 702.171a): `crew` is N, and the creatures tapped saddle this permanent (CR 702.171c). */
  saddle?: true;
  /** Station (CR 702.184a): the cost is tapping one other untapped creature you control (`tapCreatures`). */
  station?: true;
  /** "Activate only once each turn" (CR 602.5b). */
  oncePerTurn?: boolean;
  /** "Any player may activate this ability" (CR 602.2): not only its controller; the one who does controls it (CR 113.8). */
  anyPlayer?: true;
  /** "Reveal the player you chose" (Guardian Archon): payable only if a player was secretly chosen for it as it entered. */
  revealChosen?: true;
  /** Exhaust: "Activate only once" (CR 702.177a), for as long as it's the same object (CR 400.7): see GameObject.activatedEver. */
  onceEver?: true;
  /**
   * The keyword written before it ("Exhaust — {2}{G}: ..."), which effects can refer to (CR 702.142b, 702.177b). A power-up
   * ability costs less by the permanent's mana cost if it entered this turn (CR 702.193a): see game.ts activationCost.
   */
  keyword?: "Exhaust" | "Boast" | "Power-up";
  /** "Activate no more than twice each turn" (CR 602.5b). */
  maxPerTurn?: number;
  /** "X can't be 0." for an X in its costs ("Sacrifice X artifacts", Ruthless Technomancer). */
  xMin?: number;
  /** "Activate only if you have the city's blessing" (CR 602.5b). */
  activateIf?: StaticCondition;
  /** "Pay 2 life" as part of the cost (CR 119.4: only with at least that much life). */
  lifeCost?: number;
  /** "Pay life equal to the number of colors in your commanders' color identity" (War Room), on top of `lifeCost`. */
  lifeCostIdentity?: true;
  /**
   * "Pay half your life, rounded up" as part of the cost (CR 119.4, 107.1a): half the life total as the cost is worked out
   * (CR 601.2f), 0 with 0 or less life (rulings on Lurking Evil).
   */
  halfLifeCost?: "up" | "down";
  /** "Pay {E}{E}" as part of the cost (CR 107.14). */
  energyCost?: number;
  /** "Exile this card from your graveyard" is part of the cost: scavenge (CR 702.97a); on the battlefield, "Exile ~" (Relic of Progenitus). */
  exileSelf?: boolean;
  /** "Sacrifice a creature", "Discard a card" as part of the cost (CR 602.2b, 601.2h). */
  costs?: AdditionalCost[];
  /** "Remove three spore counters from ~" as part of the cost (CR 602.2b). */
  removeCounters?: { counter: CounterKind; n: number };
  /** "{T}, Exert ~: ..." (CR 701.43a): it won't untap during your next untap step; possible even if already exerted (701.43b). */
  exertCost?: true;
  /** "Put a -1/-1 counter on ~" as part of the cost (Devoted Druid): replacement effects on counters apply (Vizier of Remedies rulings). */
  putCounters?: { counter: CounterKind; n: number };
  /**
   * A loyalty ability (CR 606): its cost puts on (+N) or removes (−N) loyalty counters; `loyaltyX` for −X, where X is
   * the number announced. Only as a sorcery, and only one loyalty ability of a permanent each turn (CR 606.3).
   */
  loyalty?: number;
  loyaltyX?: boolean;
  /**
   * A mana ability (CR 605.1a): no target, could add mana, moves no card to or from a library. It doesn't use the
   * stack: it resolves as soon as it's activated (605.3b), even while paying a cost (605.3a). The ones whose costs
   * and mana fit `ManaAbility` are compiled as those instead; these have other costs ("Sacrifice a creature") or
   * other instructions ("You gain 1 life").
   */
  mana?: true;
}

/**
 * What a mana ability adds (CR 106.1, 605). "fixed": exactly these, `count` times over if it
 * says "for each" ("Add {G} for each creature you control"). "oneOf": `amount` mana of one of
 * the options, chosen as it resolves ("{W} or {U}", "two mana of any one color").
 * "commanderIdentity": one mana of a color in its controller's commander's color identity
 * (none if that identity is colorless, CR 903.4f).
 */
/**
 * `n`: "Add an amount of {G} equal to ~'s power", "Add X mana of any one color, where X is the number of Elves on the
 * battlefield": the mana (or the one chosen color) that many times, counted as the ability resolves (CR 106.1, 605.3).
 */
export type ManaProduce =
  | { kind: "fixed"; mana: ManaType[]; count?: TargetSpec; n?: AmountExpr }
  | { kind: "oneOf"; options: ManaType[]; amount: number; n?: AmountExpr }
  | { kind: "commanderIdentity" }
  /** "Add one mana of the chosen color", "Add {B} or one mana of the chosen color": the color chosen as it entered. */
  | { kind: "chosenColor"; also?: ManaType; /** "Four mana of the chosen color" (Throne of Eldraine): that many. */ n?: number }
  /**
   * "One mana of any color that a land an opponent controls could produce" (Fellwar Stone, Exotic Orchard), "of any
   * type that a land you control could produce" (Reflecting Pool): what those lands' mana abilities would make (CR 106.7).
   */
  | { kind: "landsCouldProduce"; whose: "you" | "opponent"; anyType?: boolean; /** "Add three mana of that type instead" (Incubation Druid). */ n?: number }
  /** "Add {W}{W}, {W}{U}, or {U}{U}" (filter lands): one of these combinations, chosen as it resolves (CR 605.3b). */
  | { kind: "combos"; options: ManaType[][] }
  /**
   * "Add two mana in any combination of colors", "Add X mana in any combination of colors, where X is the greatest power
   * among creatures you control" (Selvala, Heart of the Wilds): `n` mana, each of any color, chosen as it resolves (CR
   * 106.1b, 605.3b); X worked out then too. Each combination of colors is numbered as for "combos" (`colorCombos`).
   */
  /** `colors`: "X mana in any combination of {U} and/or {R}" (Vivi Ornitier): only these. */
  | { kind: "anyColors"; n: number | AmountExpr; colors?: Color[] }
  /**
   * Storage lands: "Remove any number of storage counters from ~: Add {B} for each storage counter removed this way"
   * (`colors` one color, `min` 0), "Remove X storage counters from ~: Add X mana in any combination of {U} and/or {B}"
   * (two colors, `min` 1, as removing none adds nothing). How many are removed is chosen as it's activated (CR 107.3a,
   * 601.2b, 602.2b): each way to do it is a combination, numbered as for "combos" (`removeXCombos`).
   */
  | { kind: "removeX"; counter: CounterKind; colors: ManaType[]; min: number }
  /**
   * "One mana of any color among legendary creatures and planeswalkers you control" (Mox Amber, Plaza of Heroes: the
   * colors of the permanents matching `filter` now), "one mana of any of the exiled card's colors" (Chrome Mox, `linked`:
   * the card its linked imprint ability exiled, CR 607.2a). None if there's no such color (CR 106.5, rulings).
   */
  | { kind: "colorsAmong"; filter?: TargetSpec; linked?: true; /** "Among legendary creature cards in your graveyard" (The Grey Havens): cards there, not permanents. */ inYard?: true }
  /** "For each color among permanents you control, add one mana of that color" (Bloom Tender, Faeburrow Elder). */
  | { kind: "eachColorAmong" }
  /**
   * "Choose a color. Add an amount of mana of that color equal to your devotion to that color." (Nykthos, Shrine to Nyx,
   * CR 700.5): the color chosen as it resolves, then the devotion to it.
   */
  | { kind: "devotion" };

/**
 * A mana ability (CR 605.1a): no targets, adds mana, doesn't use the stack (CR 605.3a).
 * The costs are paid in the order the text gives them; the mana comes after.
 */
export interface ManaAbility {
  text: string;
  manaCost: string; // "{1}" or ""
  tap: boolean;
  sacrificeSelf: boolean;
  lifeCost?: number;
  energyCost?: number;
  /** "{T}, Remove a charge counter from ~: Add one mana of any color." */
  removeCounters?: { counter: CounterKind; n: number };
  /** "{T}, Tap an untapped creature you control: Add one mana of any color." (Springleaf Drum) */
  tapCost?: Extract<AdditionalCost, { kind: "tap" }>;
  produces: ManaProduce;
  /** Painlands: "~ deals 1 damage to you." */
  selfDamage?: number;
  /** "~ doesn't untap during your next untap step." */
  skipNextUntap?: boolean;
  /** "Activate only once each turn." (CR 602.5b) */
  oncePerTurn?: boolean;
  /** Exhaust: "Activate only once" (CR 702.177a), for as long as it's the same object: see GameObject.activatedEver. */
  onceEver?: true;
  /** It's an exhaust ability ("Exhaust — {G}, {T}: Add ..."), which Elvish Refueler lets you activate again (CR 702.177b). */
  exhaust?: true;
  /** It has the ability only while this is true: "Max speed — {T}: Add {R}{R}." (CR 702.178a). */
  activeIf?: StaticCondition;
  /**
   * "{T}: Add {C}. If ~ has a luck counter on it, instead add one mana of any color." (Gemstone Caverns): what it makes
   * while `cond` is true (`manaAbilitiesOn` swaps it in), checked as it's activated and resolves (CR 605.3).
   */
  insteadIf?: { cond: StaticCondition; produces: ManaProduce };
  /** "Discard your hand" as part of the cost (Lion's Eye Diamond, CR 701.9a): never used by automatic payment. */
  discardHand?: true;
  /** "Activate only as an instant" (Lion's Eye Diamond): only while its controller has priority (rulings), not while paying. */
  instantOnly?: true;
  /** "Activate only if you control a Swamp." (CR 602.5b): it can't be activated otherwise, but it still could produce its mana (CR 106.7, rulings on Reflecting Pool). */
  activateIf?: StaticCondition;
  /** "Spend this mana only to cast a creature spell." (CR 106.6) */
  spendOnly?: ManaSpend;
  /**
   * "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1." (Path
   * of Ancestry): a triggered ability of its source, once for each of that mana spent so (rulings), with your
   * commanders' creature types as they are just after the spell is cast.
   */
  spentTrigger?: { body: AbilityBody; sharesCommanderType: true };
  /**
   * "If any of that mana is spent on a creature spell, it gains haste until end of turn." (Arena of Glory, Generator
   * Servant), "If that mana is spent on a creature spell, it gains haste." (Hall of the Bandit Lord, which doesn't wear
   * off): a creature spell any of it pays any part of the total cost of (rulings), and the creature it becomes.
   */
  spentHaste?: "endOfTurn" | "game";
  /**
   * Opal Palace: "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on
   * it equal to the number of times it's been cast from the command zone this game": that many for each such mana spent
   * (rulings: two mana from it give two counters for each cast).
   */
  spentCommanderCounters?: true;
  /** Depletion lands: "Put a depletion counter on ~." after the mana is added. */
  putCounter?: CounterKind;
  /** Depletion lands: "If there are no depletion counters on ~, sacrifice it." after the mana is added. */
  sacrificeIfNo?: CounterKind;
}

/**
 * A triggered mana ability (CR 605.1b) that triggers when a permanent is tapped for mana, that is, when one of its
 * mana abilities with {T} in the cost resolves and makes mana (CR 106.12-106.12a). It resolves right after that
 * ability, without the stack (CR 605.4a), and the player who tapped it adds the mana: "its controller adds", "that
 * player adds", or with "whenever you tap", this ability's controller, who is that player.
 */
export interface ManaTrigger {
  text: string;
  /** "Enchanted land", "fortified land": the permanent this is attached to (and it matches `filter`). */
  attached?: true;
  /** What's tapped: "a land", "a Swamp", "a creature", "a basic land". */
  filter?: TargetSpec;
  /** "Whenever you tap ...": only when this ability's controller taps it. */
  you?: true;
  /** "... is tapped for mana of the chosen color": only when it made mana of the color chosen for this permanent. */
  ofChosen?: true;
  /** "Whenever you tap a permanent for {C}": only when it made one or more mana of this type. */
  madeType?: ManaType;
  /**
   * "Whenever a land's ability causes you to add ..." (Caged Sun): any mana ability of it, not only ones with {T} in
   * their cost.
   */
  anyAbility?: true;
  /**
   * What it adds: fixed mana ("an additional {G}"); `n` mana each of any color the player picks ("one mana of any
   * color", "two mana in any combination of colors"); one of the color chosen for this permanent; or "one mana of
   * any type that land produced" (picking one of them if it made several, rulings on Mana Flare). The mana has none
   * of the riders of the mana that permanent made (rulings on Mana Flare).
   */
  adds: { kind: "fixed"; mana: ManaType[] } | { kind: "anyColor"; n: number } | { kind: "chosenColor" } | { kind: "produced" };
}

/**
 * What restricted mana can be spent on (CR 106.6): the total cost of casting matching spells, additional and
 * alternative costs included, and/or the costs of activating abilities ("any", or of permanents matching).
 */
export interface ManaSpend {
  spells?: TargetSpec;
  abilities?: TargetSpec | "any";
  /** "Abilities of artifact sources": in any zone, not only permanents. */
  anyZone?: boolean;
  /** Any other cost too: a Powerstone's mana "can't be spent to cast a nonartifact spell" (CR 111.10h). */
  other?: boolean;
  /** "..., and that spell can't be countered" (Cavern of Souls): a spell this mana is spent on, on any of its costs. */
  uncounterable?: true;
  text: string;
}

/**
 * When a land that "enters tapped unless ..." enters untapped (a replacement effect, CR 614.1d):
 * you (or the opponents) control enough of some permanents, or a player is at low life, or you
 * have enough opponents.
 */
export type EntersCondition =
  | { kind: "control"; who: "you" | "opponents"; types?: string[]; subtypes?: string[]; supertypes?: string[]; colors?: Color[]; other?: boolean; min?: number; max?: number }
  | { kind: "playerLifeAtMost"; n: number }
  | { kind: "opponents"; min: number }
  | { kind: "ownTurnAtMost"; n: number };

/**
 * "As ~ enters, you may pay 2 life / reveal a Dragon card from your hand. If you don't, it enters
 * tapped." The choice is made as it enters (CR 614.12).
 */
export type EntersChoice = { kind: "payLife"; n: number } | { kind: "reveal"; filter: TargetSpec };

/**
 * "Instant and sorcery spells you cast cost {1} less to cast", "Noncreature spells cost {1} more to cast",
 * "During turns other than yours, spells you cast cost {1} less to cast" (CR 601.2f): generic mana added
 * to or taken off the total cost of matching spells. `n` is positive for more, negative for less.
 */
export interface CostMod {
  /** Whose spells: the permanent's controller's, their opponents', everyone's, or the enchanted player's (a Curse). */
  who: "you" | "opponents" | "all" | "enchanted";
  /** Which spells (printed characteristics, with the chosen X counted in the mana value, CR 202.3e). */
  filter: TargetSpec;
  n: number;
  turn?: "yours" | "notYours";
  /** "Spells you cast from your graveyard". */
  fromGraveyard?: boolean;
  /** "Spells you cast but don't own" (Gonti, Canny Acquisitor). */
  notOwned?: true;
  /** "The first creature spell you cast each turn", "the second spell you cast each turn": only the nth matching spell. */
  nth?: number;
  /** Only while this holds: a Class level's (CR 716.2a). */
  if?: StaticCondition;
  /** "... for each experience counter you have" (Mizzix): `n` that many times, for the permanent's controller. */
  times?: AmountExpr;
  text: string;
}

/** Everything the engine knows how to do with one card. */
/** A cost paid along with a spell's mana cost (CR 118.8). */
/**
 * `x` (on a spell's costs): "pay X life", "discard X cards", "sacrifice X lands": as many as the X announced as it's
 * cast (CR 107.3a, 601.2b); `n` is that X once `castExtraCosts` has it.
 */
export type AdditionalCost =
  /** `other`: "sacrifice another creature", not the ability's source. */
  | { kind: "sacrifice"; filter: TargetSpec; n: number; other?: boolean; /** With `other`: the source itself may be sacrificed if it's one of these ("another creature or an artifact"). */ selfIf?: TargetSpec; x?: true; /** "Sacrifice half the lands you control, rounded up" (Tectonic Split): `n` is worked out as the cost is (CR 601.2f). */ half?: "up"; /** "Exile a creature you control" (The Soul Stone): chosen the same way, but exiled, not sacrificed (CR 701.21a doesn't apply). */ exile?: true; /** "You may sacrifice one or more creatures" (Plumb the Forbidden): X may be 0, and is how many. */ optional?: true }
  /** "discard a land card" (retrace); `random`: "discard a card at random", chosen by the game as it's paid (CR 701.9b). */
  | { kind: "discard"; n: number; filter?: TargetSpec; random?: true; x?: true; /** "Discard an Island card and another card" (Foil): at least one of the `n` matches this. */ oneOf?: TargetSpec; /** "Discard a card with mana value X" (Kozilek, the Great Distortion): X is announced as it's activated (CR 107.3a), and `filter` gets that mana value. */ mvX?: true }
  | { kind: "payLife"; n: number; x?: true }
  /**
   * `top`: "exile the top creature card of your graveyard": the topmost `n` that match, nothing to choose (CR 404.1).
   * `linked`: "Put a card exiled with ~ into its owner's graveyard" (Jester's Scepter): one of the cards the source's
   * linked exile took (CR 607.2a), moved to its owner's graveyard, chosen in CostChoices.exileCards.
   */
  | { kind: "exileFromGraveyard"; filter?: TargetSpec; n: number; x?: true; top?: true; linked?: true }
  /** Ninjutsu (CR 702.49a): "Return an unblocked attacker you control to hand". */
  | { kind: "returnToHand"; filter: TargetSpec; n: number; unblockedAttacker?: boolean; x?: true }
  /**
   * "Tap an untapped creature you control", "tap two untapped Wizards you control" (CR 602.2b). Any of them, summoning
   * sick or not (CR 302.6 is only about {T}). `other`: the ability also has {T}, so its source is already tapped for it.
   */
  | { kind: "tap"; filter: TargetSpec; n: number; other?: boolean }
  /** "Reveal a Pirate card from your hand" (Daring Buccaneer): the card stays in the hand. */
  | { kind: "reveal"; filter: TargetSpec; n: number }
  /** "Exile a blue card from your hand" (Force of Will's alternative cost): not the spell itself, on the stack by then (CR 601.2a). */
  | {
      kind: "exileFromHand";
      filter?: TargetSpec;
      n: number;
      /** "Exile a red card with mana value X from your hand" (the Shoals): its mana value is the X announced (CR 107.3a). */
      mvX?: true;
      /** "Put a card from your hand on top of your library" (Penance, Leashling): moved there instead of exiled. */
      toLibrary?: true;
    }
  /** "Reveal your hand" (Land Grant): all of it, whatever is in it (rulings: even if it's revealed already). */
  | { kind: "revealHand" }
  /**
   * "Have an opponent gain 3 life" (Invigorate: the caster picks which, CostChoices.lifeTo), "have each other player gain
   * 6 life" (`each`; Reverent Silence).
   */
  | { kind: "giveLife"; n: number; each?: true }
  /**
   * "Collect evidence N" (CR 701.59a): exile any number of cards from your graveyard with total mana value N or greater,
   * as a cost (an ability's, Conspiracy Unraveler's alternative cost); paid with CostChoices.collect.
   */
  | { kind: "collectEvidence"; n: number }
  /**
   * "{T}, Mill a card: Add {C}" (Deranged Assistant), "Mill four cards" (Rot Farm Skeleton): the top cards of your library
   * into your graveyard, not payable with fewer cards there (CR 701.17b). It moves cards from a library, so an ability
   * with it isn't a mana ability (CR 605.1a).
   */
  | { kind: "mill"; n: number }
  /**
   * "Remove three counters from among other artifacts, creatures, and planeswalkers you control" (Tekuthal), "Remove two
   * +1/+1 counters from among creatures you control" (Hopeful Initiate): counters on permanents you control that match,
   * any mix of them (of `counter`'s kind if set), chosen as it's paid (CR 602.2b, 601.2h); CostChoices.counters.
   */
  | { kind: "removeCounters"; n: number; filter: TargetSpec; counter?: string; other?: true };

/**
 * One of the ways to pay "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}" (CR 118.8,
 * 601.2b): extra mana added to the total cost (601.2f), or a cost beyond mana.
 */
export type CostOption = { mana: string; cost?: undefined; text: string } | { cost: AdditionalCost; mana?: undefined; text: string };

/**
 * Ways to cast a card from a graveyard (CR 601.3e): flashback (702.34), jump-start (702.133) and
 * retrace (702.81), escape (702.138). `mana` replaces the mana cost (an alternative cost, CR 118.9);
 * without it the mana cost is paid. `costs` are paid on top. `exile`: the card is exiled instead of
 * going anywhere else when it leaves the stack.
 */
/**
 * Alternative costs (CR 118.9): evoke (CR 702.74a), dash (CR 702.109a), bestow (CR 702.103a) and blitz (CR 702.152a);
 * warp (CR 702.185a) only from your hand; madness (CR 702.35a) only as its trigger resolves, from exile.
 */
/** "alternative": "You may pay {W}{U}{B}{R}{G} rather than pay ~'s mana cost" (CR 118.9), maybe with more costs (Borderposts). */
/** "prototype" isn't an alternative cost (CR 702.160a), but is chosen as one here: cast prototyped, it pays that mana cost. */
/** `wubrg`: Fist of Suns' "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast". */
/** `evidence`: Conspiracy Unraveler's "collect evidence 10 rather than pay the mana cost" (CompiledCard.payEvidence). */
/** `citadel`: Bolas's Citadel's "pay life equal to its mana value rather than pay its mana cost" for the top card of your library. */
export type AltCostKind = "citadel" | "evidence" | "evoke" | "dash" | "bestow" | "mutate" | "madness" | "blitz" | "warp" | "alternative" | "prototype" | "wubrg" | "emerge" | "freerunning" | "foretell" | "sneak" | "surge" | "spectacle" | "overload" | "awaken" | "miracle" | "convert" | "omniscience";

/** `grantedFlashback`: flashback an effect gave the card, with its mana cost as the cost (Snapcaster Mage), next to any of its own (rulings). */
/** `aftermath`: the half of a split card with aftermath (CR 702.127a), cast only from a graveyard. */
/** `disturb`: a double-faced card cast transformed from a graveyard for its disturb cost (CR 702.146a). */
/** `grantedEscape`, `grantedRetrace`: escape or retrace a permanent gives the cards in your graveyard (Underworld Breach, Six), next to any of their own. */
export type CastFromGraveyardKind = "flashback" | "jumpStart" | "retrace" | "escape" | "mayhem" | "harmonize" | "grantedFlashback" | "grantedEscape" | "grantedRetrace" | "permission" | "turnPermission" | "aftermath" | "disturb";
/** The costs beyond mana of escape and retrace a permanent gives (Underworld Breach's "exile three other cards", CR 702.81a's land card). */
export const GRANTED_WAY_COSTS: Partial<Record<CastFromGraveyardKind, AdditionalCost[]>> = {
  grantedEscape: [{ kind: "exileFromGraveyard", n: 3 }],
  grantedRetrace: [{ kind: "discard", n: 1, filter: { kind: "card", types: ["Land"], text: "land card" } }],
};
export interface CastFromGraveyard {
  kind: CastFromGraveyardKind;
  /** A split card's half this way casts (graveyardWays): an aftermath half, or a half given flashback. */
  face?: number;
  mana?: string;
  costs: AdditionalCost[];
  exile: boolean;
  /** "You may cast this card from your graveyard as long as you control a Zombie" (Gravecrawler). */
  if?: StaticCondition;
  /** `turnPermission`: the unused once-each-turn permissions that cover the card (`id@zoneChanges:slot`, TurnLog.gravePermits). */
  permits?: string[];
}

/**
 * Replacement effects that change how many tokens are created or counters put on (CR 614.1a): Parallel Lives,
 * Doubling Season, Hardened Scales, Xorn. `who`: "you" = only for its controller's tokens / permanents.
 */
export type CountMod =
  /**
   * Token replacements (CR 614.1a): "twice that many of those tokens" (`double`), "three times that many" (`triple`), "those
   * tokens plus an additional Treasure token" (`plusOne`, Xorn), only when the tokens include one with `subtype` or of
   * card type `type` ("creature tokens").
   */
  | { what: "tokens"; who: "you" | "any"; op: "double" | "triple" | "plusOne"; subtype?: string; type?: string }
  /** "Those tokens plus an additional Food token" (Peregrin Took), "... plus a 1/1 white Soldier creature token" (Queen Allenal): one more `token`, once. */
  | { what: "tokens"; who: "you"; op: "plusToken"; token: TokenSpec; type?: string }
  /** "Those tokens plus that many 1/1 green Squirrel creature tokens" (Chatterfang): one `token` for each token. */
  | { what: "tokens"; who: "you"; op: "plusThatMany"; token: TokenSpec }
  /** "If you would create a Food token, instead create a Food token and a Treasure token" (Bilbo): a `token` too for each one with `subtype`. */
  | { what: "tokens"; who: "you"; op: "andEach"; subtype: string; token: TokenSpec }
  /** "If you would create a Clue, Food, or Treasure token, instead create one of each" (Academy Manufactor): each of those is one of each of `subtypes`. */
  | { what: "tokens"; who: "you"; op: "oneOfEach"; subtypes: string[] }
  | { what: "counters"; counter?: CounterKind; on: "creature" | "permanent" | "artifactOrCreature"; who: "you" | "any"; op: "double" | "plusOne" | "minusOne"; other?: boolean }
  /**
   * Vorinclex, Monstrous Raider and Innkeeper's Talent: "If you would put one or more counters on a permanent or player,
   * put twice that many ..." (`putter` "you") and "If an opponent would put ..., they put half that many ..., rounded
   * down" (`putter` "opponent", op `halfDown`): it matters who puts the counters, not who controls what gets them
   * (rulings). On a player's counters too.
   */
  | {
      what: "counters";
      putter: "you" | "opponent";
      op: "double" | "halfDown" | "plusOne";
      /**
       * Only counters put on these (Lae'zel: "on a creature or planeswalker you control or on yourself", Doc Samson: "on a
       * permanent you control"); unset = any permanent or player.
       */
      putOn?: "creatureOrPlaneswalkerYouControlOrYou" | "permanentYouControl";
      counter?: undefined;
      on?: undefined;
      who?: undefined;
      other?: undefined;
    };

/**
 * What a gift gives the chosen opponent (CR 702.174d-i): "Gift a card" means they draw a card, "Gift a Food" that they
 * create a Food token, and so on. `effects` do it, with that player as the "giftee".
 */
export interface Gift {
  what: string;
  effects: Effect[];
}

export interface CompiledCard {
  /**
   * "~ has all activated abilities of creatures you control that don't have the same name as ~" (Marvin), "... of each
   * other creature with a +1/+1 counter on it" (Experiment Kraj), "As long as ~ is on the battlefield, it has all
   * activated abilities of all creature cards in all graveyards" (Necrotic Ooze): while this is on the battlefield, it
   * has the activated abilities (mana abilities too, unless `noMana`) of the permanents matching `filter` (`other`: not
   * itself; `notSameName`: none with its name) or with `graveyard`, of the cards matching it in graveyards (`yours`: only
   * its controller's). "~" in them means this object (rulings). Only activated abilities: not triggered or static ones.
   * Abilities that work only from a hand or graveyard, equip and loyalty abilities aren't borrowed.
   */
  borrows?: { filter: TargetSpec; other?: boolean; notSameName?: true; graveyard?: true; yours?: true; noMana?: true };
  spell?: AbilityBody; // instants and sorceries
  /**
   * "As this creature transforms into Sephiroth, One-Winged Angel, you get an emblem with ..." (a back face's): done while
   * it transforms, not afterwards (CR 712.20), and not if it enters with that face up (rulings).
   */
  asTransforms?: AbilityBody;
  triggers: TriggeredAbility[];
  activated: ActivatedAbility[];
  /** Mana abilities (CR 605), kept apart from the others since they don't use the stack. */
  mana: ManaAbility[];
  statics: StaticAbility[];
  /** For Auras: what it can enchant, which is also what the Aura spell targets. CR 303.4a, 702.5 */
  enchant?: TargetSpec;
  entersTapped: boolean;
  /** "If a creature dealt damage by ~ (by enchanted creature) this turn would die, exile it instead." (Kumano) */
  exileWhatItDamaged?: "self" | "attached";
  /**
   * "If ~ would die, exile it instead" (`self`), "If a creature an opponent controls would die, exile it instead",
   * "If another creature would die, ..." (`filter`, from this permanent's controller's view): replacement effects (CR 614.1a).
   */
  exileInsteadOfDying?: {
    self?: true;
    filter?: TargetSpec;
    other?: true;
    /** "Instead exile it and you gain 2 life" (The Darkness Crystal); the card is linked to the permanent (CR 607.2a). */
    gainLife?: number;
    /** "Instead exile that card and create a 2/2 black Zombie creature token" (Kalitas). */
    token?: TokenSpec;
    linked?: true;
  };
  /** "If ~ would be put into a graveyard from anywhere, reveal ~ and shuffle it into its owner's library instead." */
  shuffleInsteadOfGraveyard?: boolean;
  /** "If ~ would be put into a graveyard from anywhere, exile it instead" (a disturb card's back face, CR 614.1a). */
  exileInsteadOfGraveyard?: boolean;
  /**
   * "If a card or token would be put into a graveyard from anywhere, exile it instead." (Rest in Peace), "If a card would
   * be put into an opponent's graveyard from anywhere, exile it instead." (Leyline of the Void), "..., instead exile it
   * with a void counter on it." (Dauthi Voidwalker), "If an instant or sorcery card would be put into a graveyard from
   * anywhere, ..." (Dryad Militant): a replacement effect of this permanent (CR 614.1a) on cards (and with `tokens`,
   * tokens) going to the graveyards of `whose` (from this permanent's controller's view), its owner's (CR 404.2).
   */
  /**
   * `notYours`: "a card you didn't control" (Valgavoth): not one this permanent's controller controlled as a spell or
   * permanent; a card elsewhere counts as its owner's (CR 108.4a). `linked`: the card is "exiled with ~" (CR 607.2a).
   */
  graveyardExile?: { whose: "any" | "opponents" | "yours"; tokens?: true; filter?: TargetSpec; counter?: CounterKind; notYours?: true; linked?: true };
  /** "This creature enters prepared" (CR 722.3a): it becomes prepared as it enters. */
  entersPrepared?: boolean;
  /**
   * "Creatures your opponents control enter tapped", "Artifacts and lands enter tapped": a replacement effect on other
   * permanents entering (CR 614.1c, 614.12), checked against them as they'd be on the battlefield.
   */
  othersEnterTapped?: { filter: TargetSpec; text: string }[];
  /**
   * "Lands you control enter untapped" (Spelunking, Horizon Explorer), "Gates you control enter untapped" (Gond Gate): a
   * replacement effect on other permanents entering; against an "enters tapped" one, the permanent's controller orders them
   * (CR 616.1) and has it enter untapped, without paying for a "pay 2 life" choice (rulings on Spelunking).
   */
  othersEnterUntapped?: { filter: TargetSpec; text: string }[];
  /** "Each other creature you control enters with an additional +1/+1 counter on it" (Renata): on other permanents entering. */
  othersEnterWithCounters?: { filter: TargetSpec; counter: CounterKind; n: number; text: string }[];
  /** "This creature enters with an additional +1/+1 counter on it" (Master Chef's granted ability): on itself entering. */
  entersWithAdditional?: { counter: CounterKind; n: number }[];
  entersTappedUnless?: EntersCondition;
  entersTappedChoice?: EntersChoice;
  /** "As ~ enters, choose a creature type / a color" (CR 614.12): made as it enters, kept while it's on the battlefield. */
  entersChoose?: { what: ChoiceKind; except?: string; names?: TargetSpec; purpose?: NamePurpose; /** "Choose artifact, creature, enchantment, instant, or sorcery" (Cloud Key): the card types offered. */ options?: string[] }[];
  /** "As ~ enters, choose a player" / "an opponent" (CR 614.12): kept while it's on the battlefield, as Chosen.player. */
  entersChoosePlayer?: "player" | "opponent";
  /** "As ~ enters, choose Khans or Dragons" (CR 614.12b): the anchor words, one chosen as it enters (Chosen.anchor). */
  entersAnchor?: string[];
  /**
   * Primeval Spawn: "If ~ would enter and it wasn't cast or no mana was spent to cast it, exile it instead" (CR 614.1a),
   * judged by the abilities it would have on the battlefield (614.12): under Humility it enters (rulings).
   */
  exileUnlessCastWithMana?: true;
  /**
   * Mox Diamond: "If ~ would enter, you may discard a land card instead. If you do, put ~ onto the battlefield. If you
   * don't, put it into its owner's graveyard." (CR 614.1a): chosen as it would enter; if not, it never entered (rulings).
   */
  entersDiscardInstead?: TargetSpec;
  /**
   * Animate Dead, Dance of the Dead: "Enchant creature card in a graveyard" with the trigger that returns that card and
   * attaches the Aura to it (`enchant` is then a graveyard card filter). See Effect "animateDead".
   */
  animate?: true;
  /** "As ~ enters, secretly choose an opponent" (Guardian Archon): see Chosen.secret. */
  entersChooseSecret?: true;
  /**
   * Riot (CR 702.136a): enters with a +1/+1 counter or gains haste. Unleash (CR 702.98a): may enter with
   * a +1/+1 counter. Chosen as it enters, by its controller.
   */
  entersOptions?: EntersOption[];
  /** Read ahead (CR 702.155): a Saga that enters with the chapter number its controller chooses in lore counters. */
  readAhead?: true;
  /**
   * "You may have ~ enter as a copy of any creature on the battlefield[, except ...]" (CR 707.5, 707.9). Cursed
   * Mirror's "as ~ enters, you may have it become a copy of ... until end of turn": the copy ends with the turn.
   */
  entersAsCopy?: { filter: TargetSpec; except?: CopyExcept; untilEndOfTurn?: boolean; /** Vesuva: "enter tapped as a copy". */ tapped?: true };
  /** "~ enters with N +1/+1 counters on it." (a replacement effect, CR 614.1c); modular N too (CR 702.43a). */
  entersWithCounters?: { counter: CounterKind; n: Amount; /** Raid: "if you attacked this turn". */ if?: StaticCondition; /** "If you cast it from your hand" (the Myojin). */ castFromHand?: true; /** "If X is 5 or more, it enters with an additional X" (Apocalypse Hydra): twice as many. */ doubleIfXAtLeast?: number; /** "As ~ enters, choose a creature type. ~ enters with a fellowship counter on it for each creature you control of the chosen type" (Banner of Kinship): counted once that choice, part of how it enters, is made (CR 614.12). */ afterChoice?: ChoiceKind };
  /** Bloodthirst N (CR 702.54a): enters with N +1/+1 counters if an opponent was dealt damage this turn. */
  bloodthirst?: number;
  /**
   * Sunburst (CR 702.44a): entering from the stack, a counter for each color of mana spent to cast it: +1/+1 counters
   * if it's a creature (its printed types, ignoring type-changing effects), charge counters otherwise. `counter`:
   * always that kind ("Modular—Sunburst", 702.44c).
   */
  sunburst?: { counter?: "+1/+1" };
  /** Something on it counts the colors of mana spent to cast it (sunburst, converge): paying wants many colors. */
  countsColors?: boolean;
  /** Mana its text hopes was spent to cast it ("if {U} was spent to cast ~", adamant): paying spends those colors if it can. */
  wantSpent?: SpentReq[];
  /** Its text counts or hopes for mana from snow sources spent to cast it ("if {S} was spent"): paying spends snow mana first. */
  wantSnow?: true;
  /**
   * "You may cast ~ as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller
   * of the permanent it becomes sacrifices it at the beginning of the next cleanup step."
   */
  flashSacrifice?: boolean;
  /** Enlist (CR 702.154a): as it attacks, it may tap a creature that isn't attacking, see declareAttackers. */
  enlist?: boolean;
  /**
   * "You may exert ~ as it attacks" (CR 701.43d): an optional cost to attack (508.1g); its "When you do, ..." is a
   * linked trigger (event "selfExerted", CR 607.2h). An exerted permanent doesn't untap during your next untap step.
   */
  /** "notThisTurn": "If ~ hasn't been exerted this turn, you may exert it as it attacks" (Combat Celebrant). */
  exert?: boolean | "notThisTurn";
  /** Start your engines! (CR 702.179a): a player with no speed who controls it gets speed 1 (a state-based action). */
  startYourEngines?: boolean;
  /** Amplify N (CR 702.38a): as it enters, reveal cards from your hand that share a creature type with it; N +1/+1 counters for each. */
  amplify?: number;
  /**
   * Devour N (CR 702.82a, c): "As this object enters, you may sacrifice any number of [creatures]. This permanent
   * enters with N +1/+1 counters on it for each [one] sacrificed this way." `n: "devoured"`: Thromok's "Devour X,
   * where X is the number of creatures devoured this way".
   */
  devour?: { n: number | "devoured"; filter: TargetSpec };
  /**
   * "If damage would be dealt to ~, prevent that damage. Remove a +1/+1 counter from ~." (Phantom Centaur): every bit
   * of damage is prevented, and one counter removed per damage event, even when there's none left to remove.
   */
  phantom?: boolean;
  /**
   * Khârn the Betrayer: "If damage would be dealt to ~, prevent that damage and an opponent of your choice gains control
   * of it" (CR 615.5): the control change happens right away, also when the damage can't be prevented (615.12).
   */
  betrayer?: true;
  /** "~ can't be countered." CR 101.2 */
  cantBeCountered?: boolean;
  /**
   * "Creature spells you control can't be countered", "Creature spells can't be countered", "Spells you control can't be
   * countered": spells matching `filter`, controlled by this permanent's controller unless `anyone` (CR 101.2).
   */
  uncounterable?: { filter: TargetSpec; anyone?: true }[];
  /** "Your opponents can't cast spells during your turn." (a "can't" that wins over any "can", CR 101.2) */
  /** Compleated (CR 702.150a): two fewer loyalty counters for each Phyrexian symbol its caster paid with life. */
  compleated?: true;
  opponentsCantCastYourTurn?: true;
  /** "As long as ~ is attached to a creature, your opponents can't cast spells during your turn" (Conqueror's Flail): only while this holds. */
  opponentsCantCastYourTurnIf?: StaticCondition;
  /**
   * "Each opponent can cast spells only any time they could cast a sorcery." (Teferi, Time Raveler; CR 307.1): over any
   * permission to cast as though with flash (rulings), and not while something resolves (cascade).
   */
  opponentsSorceryTiming?: true;
  /** "No more than one creature can attack each combat." / "... block ..." (Silent Arbiter; CR 508.1c, 509.1b): for everyone. */
  /** "No more than one creature can attack each combat" (Silent Arbiter); `attackYou`: "... can attack you each combat" (Crawlspace), its controller only, not their planeswalkers (rulings). */
  combatLimit?: { attack?: number; block?: number; attackYou?: number };
  /** "You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant." (Teferi, Temporal Archmage's emblem) */
  loyaltyAtInstantSpeed?: true;
  /** "Your opponents can't cast spells with mana value 3 or less." (Brisela, Voice of Nightmares): this many or less. */
  opponentsCantCastMvAtMost?: number;
  /** "You can't cast creature spells." (Steel Golem), "You can't cast noncreature spells." (Nikya): its controller. */
  youCantCast?: TargetSpec[];
  /** "Your opponents can't cast noncreature spells." (Narset Transcendent's emblem): each opponent of its controller. */
  opponentsCantCast?: TargetSpec[];
  /**
   * "During your turn, your opponents can't ... activate abilities of artifacts, creatures, or enchantments" (Grand
   * Abolisher): permanents on the battlefield only, mana abilities too (rulings); see abolisherBan.
   */
  opponentsCantActivateYourTurn?: true;
  /** "Creatures you control can boast twice during each of your turns rather than once." (Birgi, CR 702.142a) */
  boastTwice?: true;
  /**
   * "You may cast ~ as though it had flash if you pay {2} more to cast it.": cast any time a sorcery couldn't have been,
   * its total cost is this much more (CR 601.2f).
   */
  flashCost?: number;
  /** "This spell has flash as long as you've committed a crime this turn": castable at instant speed while it holds (CR 702.8a). */
  flashIf?: StaticCondition;
  /** "Cast this spell only if you've cast another spell this turn." (Illusory Angel; CR 601.3) */
  castOnlyAfterAnother?: boolean;
  /**
   * "Cast this spell only during combat", "... only during the declare attackers step and only if you've been attacked
   * this step" (CR 506.8, 601.3): checked as it's proposed, also when it's cast during another's resolution (rulings:
   * only timing based on its card type is ignored then).
   */
  castOnly?: StaticCondition;
  /**
   * "Each player can't cast more than one spell each turn" (Rule of Law), "... one noncreature spell": counting every
   * matching spell the player cast this turn, also before this permanent was on the battlefield (rulings).
   */
  castLimits?: { who: "each" | "you" | "enchanted"; filter?: TargetSpec; text: string }[];
  /**
   * What the name chosen as it entered does (Chosen.name, CR 201.4): "Spells with the chosen name can't be cast", "Your
   * opponents can't cast spells with the chosen name", "Activated abilities of sources with the chosen name can't be
   * activated [unless they're mana abilities]" (in every zone, rulings on Pithing Needle).
   */
  nameBans?: ({ kind: "cast"; who: "all" | "opponents" } | { kind: "activate"; exceptMana?: true })[];
  /** "You have protection from the chosen card name" (Runed Halo, CR 702.16a): see playerProtectedFrom. */
  protectionFromChosenName?: true;
  /**
   * "Activated abilities cost {2} more to activate unless they're mana abilities" (Suppression Field), "Activated abilities
   * of sources with the chosen name cost {2} more ..." (Anointed Peacekeeper): generic mana added to the ability's cost
   * (CR 602.2b applies 601.2f), for sources matching `filter` (by name in any zone); mana abilities aren't taxed.
   */
  activationTaxes?: { filter?: TargetSpec; n: number; text: string }[];
  /**
   * The Leylines: "If ~ is in your opening hand, you may begin the game with it on the battlefield" (CR 103.6a). Gemstone
   * Caverns: only if you're not the starting player, with a counter on it, and "if you do, exile a card from your hand".
   */
  beginOnBattlefield?: true | { notStarting: true; counter: CounterKind; exileFromHand: true };
  /** "If you would gain life, you gain twice that much life instead" (a replacement effect, CR 614.1a). */
  doubleLifeGain?: boolean;
  /** "If an opponent would lose life during your turn, they lose twice that much life instead" (Bloodletter of Aclazotz). */
  opponentsLoseDouble?: true;
  /** "Each opponent can't draw more than one card each turn" (Narset, Parter of Veils). */
  opponentsDrawOnce?: true;
  /**
   * Notion Thief: "If an opponent would draw a card except the first one they draw in each of their draw steps, instead
   * that player skips that draw and you draw a card" (a replacement effect, CR 614.1a, 614.10).
   */
  stealsDraws?: true;
  /**
   * "If you tap a permanent for mana, it produces twice as much of that mana instead" (Mana Reflection; three times,
   * Nyxbloom Ancient): a replacement effect on the mana a mana ability with {T} in its cost produces (CR 106.12b,
   * 614.1a), the factor it multiplies by. Several multiply together (rulings).
   */
  tapManaTimes?: number;
  /** "If you would gain life, you gain that much life plus 1 instead" (CR 614.1a): N for each. */
  lifeGainPlus?: number;
  /** "Damage that would reduce your life total to less than 1 reduces it to 1 instead" (Ali from Cairo): that number. */
  lifeFloor?: number;
  /** "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." */
  drawTwoInstead?: true;
  /** "If you would draw a card while your library has no cards in it, you win the game instead." (Laboratory Maniac, CR 614.1a) */
  drawEmptyWins?: true;
  /** "Your opponents can't cast spells from anywhere other than their hands." (Drannith Magistrate) */
  opponentsOnlyFromHand?: true;
  /** Aven Mindcensor: "If an opponent would search a library, that player searches the top four cards of that library instead." (CR 614.1a) */
  opponentsSearchTop?: number;
  /** Opposition Agent: "You control your opponents while they're searching their libraries." (CR 723.2) */
  controlsOpponentSearches?: true;
  /**
   * Opposition Agent: "While an opponent is searching their library, they exile each card they find. You may play those
   * cards for as long as they remain exiled, and you may spend mana as though it were mana of any color to cast them."
   */
  exilesOpponentFinds?: true;
  /**
   * "The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them
   * into your graveyard and the other back on top of your library. Then draw a card." (Scion of Halaster's grant).
   */
  firstDrawLook?: true;
  /** "Room abilities of dungeons you own trigger an additional time" (Hama Pashar, CR 603.2d): how many instances, granted ones too (Dungeon Delver). */
  roomsTwice?: number;
  /** "Players can't gain life." / "Your opponents can't gain life." (CR 119.7) */
  cantGainLife?: "all" | "opponents" | "enchanted";
  /**
   * "If an opponent would begin an extra turn, that player skips that turn instead" (Trouble in Pairs, Stranglehold), "If a
   * player would ..." (Ugin's Nexus): a replacement effect skipping it as it would begin (CR 614.10, 500.7); one created
   * while this is out but begun after it left is taken (rulings).
   */
  skipsExtraTurns?: "all" | "opponents";
  /**
   * Cover of Winter: "If a creature would deal combat damage to you and/or one or more creatures you control, prevent X
   * of that damage, where X is the number of age counters on ~" (a prevention effect, CR 615.1a): X of each creature's
   * combat damage in each combat damage step, divided by this permanent's controller among those it would be dealt to
   * (rulings).
   */
  preventCombatFromEach?: Amount;
  /** "Damage can't be prevented." (CR 615.12) */
  damageCantBePrevented?: true;
  /** "You have hexproof" / "you have shroud" (CR 702.11d, 702.18d): its controller can't be targeted by opponents / anyone. */
  youHave?: "hexproof" | "shroud" | "protection";
  /**
   * Elvish Refueler: "During your turn, as long as you haven't activated an exhaust ability this turn, you may activate
   * exhaust abilities as though they haven't been activated" (CR 702.177b): see Player.exhaustTurn.
   */
  exhaustAgain?: true;
  /**
   * "While voting, you get an additional vote" (Brago's Representative), "you may vote an additional time" (Ballot
   * Broker): one more vote each time its controller votes (CR 701.38d); with "may", they can pass on it.
   */
  extraVote?: "get" | "may";
  /**
   * Platinum Angel: "You can't lose the game and your opponents can't win the game" (`cantLose` "you", `cantWin`
   * "opponents"); Abyssal Persecutor the other way round. Conceding still works (rulings).
   */
  cantLose?: "you" | "opponents";
  cantWin?: "you" | "opponents";
  /**
   * "You may activate abilities of creatures you control as though those creatures had haste" (Thousand-Year Elixir,
   * CR 302.6): {T} abilities of creatures that came under your control this turn. They don't gain haste (rulings).
   */
  creatureAbilitiesHaste?: true;
  /** "You have no maximum hand size." (CR 402.2): its controller doesn't discard down in cleanup; "all": "Players have ...". */
  noMaxHandSize?: boolean | "all";
  /** "Your maximum hand size is eight", "... is increased by one", "Each opponent's maximum hand size is reduced by seven" (CR 402.2). */
  handSize?: { who: "you" | "opponents"; set?: number; plus?: number }[];
  /** K'rrik: "For each {B} in a cost, you may pay 2 life rather than pay that mana" (see blackForLife), for its controller. */
  lifeForBlack?: true;
  /** Chromatic Orrery: "You may spend mana as though it were mana of any color." (CR 609.4b), for its controller's costs. */
  spendAnyColor?: true;
  /** Agatha's Soul Cauldron: "You may spend mana as though it were mana of any color to activate abilities of creatures you control" (CR 609.4b). */
  spendAnyColorCreatureAbilities?: true;
  /**
   * Agatha's Soul Cauldron: "Creatures you control with +1/+1 counters on them have all activated abilities of all
   * creature cards exiled with ~": the permanents matching `to` have the activated abilities (mana abilities too) of the
   * cards matching `cards` linked to this object's exile ability (CR 607.2a). "~" in them is the creature (rulings).
   */
  lendsExiled?: { to: TargetSpec; cards: TargetSpec };
  /**
   * Tekuthal: "If you would proliferate, proliferate twice instead." A replacement effect (CR 614.1a); with two, each
   * applies to the proliferating the other made, so four times (as Thought Reflection's rulings do for draws).
   */
  proliferateTwice?: true;
  /**
   * "You may activate the loyalty abilities of ~ twice each turn rather than only once" (Urza, Planeswalker), "... of
   * planeswalkers you control ..." (Oath of Teferi): two loyalty abilities of that permanent each turn, the same one
   * twice or two different ones (CR 606.3, rulings on Urza).
   */
  loyaltyTwice?: "self" | "yours";
  /**
   * "~ is all colors" (Transguild Courier, Awaken the Maelstrom): a characteristic-defining ability (CR 604.3), applied in
   * layer 5 before any other effect (613.3). The card data's colors already have it everywhere else (CR 604.3a).
   */
  allColors?: true;
  /**
   * Unspent mana not lost as steps and phases end (CR 500.4): kept by `who` (only mana of `color`, if given: Leyline
   * Tyrant's red), or with `becomes`, a replacement effect: it becomes that type of mana instead and is kept (Kruphix's
   * colorless, CR 614.1a), with whatever restrictions it had (rulings on Horizon Stone).
   */
  keepMana?: { who: "you" | "all"; color?: Color; becomes?: ManaType };
  /** "If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll" (Pixie Guide, CR 706.6). */
  rollAdvantage?: true;
  /**
   * "Sliver spells you cast have cascade", "Instant and sorcery spells you cast from your hand have cascade", "The first
   * spell you cast each turn has cascade" (CR 702.85a): those spells have cascade as they're cast. `first`: the first such
   * spell its controller cast this turn, counting ones before this permanent was there; `fromHand` / `fromExile`: cast
   * from there; `treasure`: "that mana from a Treasure was spent to cast" (CR 106.3).
   */
  /**
   * `commander`: "Commander spells you cast have cascade" (Flamekin Herald), a commander card cast as a spell (CR 903.3);
   * `yourTurn` and `maxMv`: "During your turn, spells you cast from your hand with mana value X or less have cascade,
   * where X is ..." (Abaddon the Despoiler), X counted as the spell is cast.
   */
  /** "Noncreature spells you cast have convoke" (Caetus), "Multicolored spells you cast have convoke" (Fallaji Wayfarer), CR 702.51. */
  spellsHaveConvoke?: { filter: TargetSpec; text: string }[];
  /** "Nonartifact spells you cast have improvise" (Inspiring Statuary), CR 702.126. */
  spellsHaveImprovise?: { filter: TargetSpec; text: string }[];
  spellsHaveCascade?: { filter?: TargetSpec; from?: "hand" | "exile"; first?: true; treasure?: true; commander?: true; yourTurn?: true; maxMv?: Amount; text: string }[];
  /** Shadow the Hedgehog: "Each spell you cast has split second if mana from an artifact was spent to cast it" (CR 702.61a, 106.3). */
  splitSecondIfArtifactMana?: true;
  /**
   * "~ (saddles Mounts and) crews Vehicles as though its power were 2 greater" (`n`), "... using its toughness rather
   * than its power" (`toughness`): what it counts for when it's tapped to pay a crew or saddle cost (CR 702.122a,
   * 702.171a). `saddles`: for saddle costs too, not only crew.
   */
  crewsAs?: { n?: number; toughness?: true; saddles: boolean };
  /**
   * Keywords the card data lists that it has only in a striation of a leveler or station card (CR 711.2, 721.2): they
   * come from those static abilities, not printed on it unconditionally.
   */
  striatedKeywords?: string[];
  /**
   * "Equip abilities you activate cost {1} less to activate" (CR 602.2b, 601.2f); `targetSelf`: "that target ~";
   * `otherEquipment`: "of other Equipment".
   */
  /**
   * "Activated abilities of creatures you control cost {2} less to activate. This effect can't reduce the mana in that cost
   * to less than one mana." (Training Grounds, CR 602.2b applies 601.2f): only generic mana, X's too (rulings), of
   * permanents like `filter` on the battlefield from the source's controller's view; `atLeastOne`, never below one mana.
   */
  activationLess?: { n: number; filter: TargetSpec; atLeastOne?: true }[];
  /** "The "legend rule" doesn't apply to permanents you control" (CR 704.5j): to these, from the source's controller's view. */
  noLegendRule?: TargetSpec[];
  /** "Power-up abilities of other creatures you control cost {3} less to activate." (Hulk, Gamma Goliath; CR 702.193) */
  powerUpLess?: number;
  /** "Each power-up ability of permanents you control can be activated an additional time." (Wonder Man; CR 702.193a) */
  powerUpAgain?: true;
  equipLess?: { n: number; targetSelf?: true; otherEquipment?: true; /** Only while this holds (a Class level's). */ if?: StaticCondition }[];
  /** "You may activate equip abilities any time you could cast an instant" (Leonin Shikari); Forge Anew's "During your turn, ...". */
  equipAtInstantSpeed?: "always" | "yourTurn";
  /** Forge Anew: "You may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your turns." */
  firstEquipFree?: true;
  /**
   * Torpor Orb: "Creatures entering don't cause abilities to trigger" (`types`: the entering permanent's, as it is on the
   * battlefield); Elesh Norn's "... abilities of permanents your opponents control" (`opponents`).
   */
  enterLock?: { types?: string[]; opponents?: true };
  /**
   * "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability
   * triggers an additional time" (Panharmonicon), "if a triggered ability of a legendary creature you control triggers,
   * ..." (Annie Joins Up): CR 603.2d, one more time for each such effect. `by`: the event (a permanent entering, a creature
   * dying, a creature attacking, a creature dealing combat damage to a player) and what must cause it (any of `filter`,
   * judged by its controller as the static's); `of`: only abilities of permanents you control matching one of these.
   * Never delayed or reflexive triggers (603.2d).
   */
  /** `anchor`: only while that anchor word was chosen as it entered (Windcrag Siege's "• Mardu —", CR 614.12b). */
  triggersAgain?: { by?: { event: "enters" | "dies" | "attacks" | "combatDamage" | "castOrCopy"; filter?: TargetSpec[] }; of?: { filter: TargetSpec; other?: true }[]; anchor?: string }[];
  /** Fist of Suns: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost for spells you cast" (an alternative cost, CR 118.9). */
  payWUBRG?: true;
  /** Omniscience: "You may cast spells from your hand without paying their mana costs" (AltCostKind "omniscience"). */
  castFromHandFree?: true;
  /**
   * Obstinate Baloth: "If a spell or ability an opponent controls causes you to discard ~, put it onto the battlefield
   * instead of putting it into your graveyard" (a replacement effect, CR 614.1a). It's still discarded (rulings).
   */
  discardedToBattlefield?: boolean;
  /**
   * "If an opponent would mill one or more cards, they mill that many cards plus four instead" (The Water Crystal),
   * "... twice that many cards instead" (Bruvac): replacement effects on its controller's opponents' mills (CR 614.1a).
   */
  millMore?: ({ plus: number } | { twice: true })[];
  /** "Skip your draw step." (CR 614.10): its controller's draw steps don't happen. */
  skipDrawStep?: boolean;
  /** "You may choose not to untap ~ during your untap step." (CR 502.3): its controller decides as the step untaps. */
  mayNotUntap?: boolean;
  /**
   * "You may cast spells as though they had flash", "... sorcery spells ...", "... creature spells ..." (CR 702.8a): its
   * controller may cast spells like these any time they could cast an instant.
   */
  flashFor?: TargetSpec[];
  /**
   * "Creature cards you own that aren't on the battlefield have flash" (Teferi, Mage of Zhalfir): those cards of its
   * controller's have flash wherever they are but the battlefield, whoever casts them (CR 702.8a).
   */
  flashOwned?: TargetSpec[];
  /** "Whenever enchanted land is tapped for mana, its controller adds an additional {G}" and the like (CR 605.1b). */
  manaTriggers?: ManaTrigger[];
  countMods?: CountMod[];
  /** "You may play an additional land on each of your turns." (CR 305.2a): one more land each turn per such ability. */
  extraLands?: number;
  /** "Each player may play an additional land on each of their turns." (Rites of Flourishing): the same for every player. */
  extraLandsEach?: number;
  /** The same, only while each condition holds (a Class level's, CR 716.2a). */
  extraLandsIf?: StaticCondition[];
  /** "You may play lands from your graveyard." (Crucible of Worlds): a permission; each still uses a land play (CR 305.2). */
  landsFromGraveyard?: boolean;
  /**
   * "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three
   * other cards from your graveyard." (Underworld Breach), "Each instant and sorcery card in your graveyard has flashback.
   * The flashback cost is equal to that card's mana cost." (Lier), "During your turn, nonland permanent cards in your
   * graveyard have retrace." (Six): a way to cast the matching cards in its controller's graveyard (CR 113.6, 702.34,
   * 702.81, 702.138). `way.mana` left out: the card's own mana cost, so a card without one can't be cast this way (rulings).
   */
  graveyardGrants?: {
    filter: TargetSpec;
    way: CastFromGraveyard;
    yourTurn?: true;
    /**
     * "Once during each of your turns, you may cast a creature spell from your graveyard" (Karador): one use each turn per
     * slot, "" for one; Muldrotha's are the permanent types, a spell using one of its own types (rulings).
     */
    once?: string[];
    /** "A permanent spell with mana value 2 or less" (Lurrus): the spell's, its X counted (CR 202.3e), as it's cast. */
    maxMv?: number;
  }[];
  /** Muldrotha: "you may play a land ... from your graveyard" once during each of your turns. */
  landFromGraveyardOnce?: true;
  /**
   * "You may play cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells"
   * (Rogue Class): its controller may play the cards its linked exile took (CR 607.2a), with any mana (609.4b).
   */
  playLinked?: true;
  /**
   * "During your turn, you may play cards exiled with ~. If you cast a spell this way, pay life equal to its mana value
   * rather than pay its mana cost" (Valgavoth): during its controller's turn only, cast for that alternative cost
   * (AltCostKind "citadel"; rulings: no other way to pay), without Rogue Class's mana of any color.
   */
  playLinkedForLife?: true;
  /** The same, only while this holds (a Class level's, CR 716.2a). */
  playLinkedIf?: StaticCondition;
  /**
   * "You may play lands from the top of your library" (Courser of Kruphix), "you may cast creature spells from the top
   * of your library" (Garruk's Horde): its controller may play the top card of their library (CR 401.5).
   */
  /**
   * `spells`: any of these ("Angel spells and Human spells"); `once`: "Once each turn, you may cast an instant or sorcery
   * spell from the top of your library" (Johann), a permission each such permanent gives once a turn.
   */
  fromTop?: FromTop[];
  /** "You may look at the top card of your library any time" (Vizier of the Menagerie): only its controller sees it. */
  lookTop?: true;
  /** The same, only while this holds (a Class level's, CR 716.2a). */
  lookTopIf?: StaticCondition;
  /** "Play with the top card of your library revealed" ("you"), "Players play with the top card of their libraries revealed" (CR 401.5). */
  revealTop?: "you" | "players";
  /** "Players play with their hands revealed", "Your opponents play with their hands revealed" (Telepathy). */
  revealHands?: "players" | "opponents";
  /** Convoke (CR 702.51): creatures you tap while casting it help pay its cost. */
  convoke?: boolean;
  /** Improvise (CR 702.126a): artifacts you tap while casting it each pay for {1}. */
  improvise?: boolean;
  /**
   * "This spell costs {1} less to cast for each artifact you control" and the like, affinity included
   * (CR 702.41a): each amount comes off the generic mana of its total cost (CR 601.2f).
   */
  costLess?: Amount[];
  /** "This spell costs {2} less to cast if you control a Wizard": the reduction while the condition holds. */
  costLessIf?: { n: number; cond: StaticCondition }[];
  /** "This spell costs {3} less to cast if it targets a tapped creature" (CR 601.2f). */
  costLessIfTargets?: { n: number; filter: TargetSpec }[];
  /** Strive: "This spell costs {2}{G} more to cast for each target beyond the first", an additional cost (CR 601.2f, rulings). */
  strive?: string;
  /** "Spells your opponents cast that target ~ cost {2} more to cast": once per spell however often it targets it (rulings). */
  targetTax?: number;
  /** "Spells your opponents cast that target ~ cost an additional 3 life to cast" (Terror of the Peaks): an additional cost (CR 601.2f, 119.4). */
  targetLifeTax?: number;
  /**
   * A permanent's static abilities that make spells cost more or less: "Creature spells you cast cost
   * {1} less to cast", "Noncreature spells cost {1} more to cast" (CR 601.2f).
   */
  costMods?: CostMod[];
  /**
   * Kicker (CR 702.33): the optional additional costs, each payable once; multikicker's can be paid
   * any number of times (702.33c).
   */
  /**
   * `replicate`: it's really replicate (CR 702.56a), paid like multikicker; `squad` is squad (CR 702.157a), paid the
   * same way; `offspring` is offspring (CR 702.175a), paid once like kicker. None of these is "kicked" for other cards.
   */
  kicker?: { costs: string[]; multi?: boolean; replicate?: boolean; squad?: boolean; offspring?: boolean };
  /** "As an additional cost to cast this spell, sacrifice a creature" and the like (CR 601.2b, 601.2f-h). */
  additionalCosts?: AdditionalCost[];
  /** "As an additional cost to cast this spell, sacrifice a creature or pay {3}{B}": exactly one of these, announced as it's cast (CR 601.2b). */
  costOr?: CostOption[];
  /** Flashback, jump-start, retrace, escape: casting it from your graveyard. */
  fromGraveyard?: CastFromGraveyard[];
  /** "~ escapes with N +1/+1 counters on it" (CR 702.138c). */
  escapesWith?: number;
  /** Buyback (CR 702.27): an optional additional cost; paid, the spell returns to its owner's hand as it resolves. */
  buyback?: string;
  /**
   * "Buyback—Sacrifice a land." (Constant Mists), "Buyback—Pay 3 life, Discard a card at random.": a buyback cost that
   * isn't mana (CR 702.27a, 118.8), paid with the spell's other costs; `buyback` is "" then, and `buybackText` says it.
   */
  buybackCosts?: AdditionalCost[];
  /** Miracle [cost] (CR 702.94a): revealed as it's drawn as the first card drawn this turn, it may be cast for `miracle`. */
  miracle?: string;
  /**
   * "Splice onto Arcane {1}{R}" (CR 702.47a): revealed from your hand as you cast an Arcane spell (or "instant or
   * sorcery" spell), that spell gains this card's rules text and you pay `mana` as an additional cost.
   */
  splice?: { onto: "Arcane" | "instantOrSorcery"; mana: string };
  buybackText?: string;
  /** Rebound (CR 702.88). */
  rebound?: boolean;
  /** Epic (CR 702.50a): see finishSpell. */
  epic?: true;
  /** Paradigm (CR 702.192a): see finishSpell. */
  paradigm?: true;
  /** Evoke, dash, bestow, blitz and warp (CR 702.74, 702.109, 702.103, 702.152, 702.185): alternative costs. */
  altCosts?: {
    kind: AltCostKind;
    mana: string;
    /** Paid along with it: a Borderpost's "return a basic land you control to its owner's hand", Fireblast's "sacrifice two Mountains". */
    costs?: AdditionalCost[];
    /** "If you control a Swamp, you may ...": it can be paid only while this is true, as the spell is cast (CR 601.2b). */
    if?: StaticCondition;
    /** What's paid, as the card says it: "pay 1 life and exile a blue card from your hand". */
    text?: string;
    /** Security Rhox: "Spend only mana produced by Treasures to cast it this way" (CR 106.3, 106.6). */
    treasureOnly?: true;
  }[];
  /** Madness [cost] (CR 702.35a): discarded, it's exiled instead, and its owner may cast it for this cost. */
  madness?: string;
  /** Suspend N—[cost] (CR 702.62a): exile it from your hand with N time counters, cast it free when the last is removed. */
  suspend?: { n: number; cost: string };
  /** Reconfigure (CR 702.151): attached to a creature, this Equipment isn't a creature (702.151b). */
  reconfigure?: true;
  /** Plot [cost] (CR 702.170a): exile it from your hand as a special action, and cast it free on a later turn (702.170d). */
  plot?: string;
  /**
   * Foretell [cost] (CR 702.143a): during your turn, pay {2} and exile it from your hand face down (a special action);
   * on a later turn, cast it for this cost (an alternative cost, AltCostKind "foretell").
   */
  foretell?: string;
  /** Dredge N (CR 702.52a): in your graveyard, a draw may be replaced by milling N and returning it to your hand. */
  dredge?: number;
  /** Casualty N (CR 702.153a): you may sacrifice a creature with power N or greater as you cast it, to copy it. */
  casualty?: number;
  /** Bargain (CR 702.166a): you may sacrifice an artifact, enchantment, or token as you cast it. */
  bargain?: true;
  /** "~ costs {2} less to cast if it's bargained." */
  bargainReduction?: number;
  /** "As an additional cost to cast this spell, you may collect evidence N" (CR 701.59a, c): paid with CostChoices.evidence. */
  evidence?: number;
  /** "This spell costs {2} less to cast if evidence was collected." */
  evidenceReduction?: number;
  /** "You may collect evidence N rather than pay the mana cost for spells you cast" (Conspiracy Unraveler, CR 118.9). */
  payEvidence?: number;
  /** Teamwork N: as an additional cost, you may tap any number of creatures you control with total power N or more. */
  teamwork?: number;
  /** "You may cast this spell as though it had flash if it's cast using teamwork." */
  teamworkFlash?: true;
  /** Tribute N (CR 702.104a): as it enters, an opponent of its controller's choice may put N +1/+1 counters on it. */
  tribute?: number;
  /** Conspire (CR 702.78a): you may tap two untapped creatures you control that each share a color with it, to copy it. */
  conspire?: true;
  /** Gift (CR 702.174a): you may choose an opponent as you cast it; what they get if you do. */
  gift?: Gift;
  /** Delve (CR 702.66): each card exiled from your graveyard while casting it pays for {1}. */
  delve?: boolean;
  /** Assist (CR 702.132a): another player may pay for generic mana in its total cost. */
  assist?: true;
  /** Morph, megamorph, disguise (CR 702.37, 702.168): cast face down for {3}, turned face up for `cost`. */
  faceDownCast?: { kind: FaceDownKind; cost: string };
  /** Keywords spelled out only in the text ("Protection from black", "Toxic 2"); see textKeywords in oracle.ts. */
  textKeywords: string[];
  /** Lines the compiler couldn't turn into rules. Empty means the card is fully supported. */
  unsupported: string[];
}

/**
 * A permission to play the top card of your library: lands, and spells that match `spells` (any of them); `once`: once
 * each turn for each permanent with it (Johann); `if`: "as long as ..." (Verge Rangers, coven).
 */
export interface FromTop {
  lands: boolean;
  spells?: TargetSpec[] | "any";
  once?: true;
  if?: StaticCondition;
  /**
   * Bolas's Citadel: "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost": a
   * spell cast with this permission is cast for that alternative cost (AltCostKind "citadel", CR 118.9).
   */
  payLife?: true;
}
